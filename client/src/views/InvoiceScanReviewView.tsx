import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { InvoiceScanItemCard, ScanItemRow } from '../components/InvoiceScanItemCard.js';
import { ScanUploadModal } from '../components/ScanUploadModal.js';
import {
  ArrowLeft, ChevronLeft, ChevronRight, FileWarning, AlertTriangle, Copy,
  Plus, Upload, Loader2, CheckCircle2, ShieldCheck
} from 'lucide-react';

interface ScanDetail {
  id: number;
  status: 'DRAFT' | 'REVIEWED' | 'COMMITTED' | 'VOID';
  supplier_id: number | null;
  supplier_name: string | null;
  supplier_name_raw: string | null;
  invoice_number_raw: string | null;
  invoice_date_raw: string | null;
  document_type: string | null;
  goods_received_confirmed: number;
  calculated_total: number | null;
  printed_total_raw: number | null;
  total_mismatch_flag: number;
  is_schedule_b: number;
  is_schedule_d: number;
  duplicate_of_scan_id: number | null;
  notes: string | null;
  purchase_id: number | null;
}

interface ScanPage {
  id: number;
  page_number: number;
  mime_type: string;
  is_warranty_page: number;
}

interface WarrantyRow {
  id: number;
  scan_item_id: number | null;
  page_id: number | null;
  extracted_text: string | null;
  is_unreadable: number;
}

interface Props {
  scanId: number;
  onClose: () => void;
  onOpenScan: (scanId: number) => void;
  onCommitted?: (purchaseId: number) => void;
}

export const InvoiceScanReviewView: React.FC<Props> = ({ scanId, onClose, onOpenScan, onCommitted }) => {
  const { token } = useAuth();
  const [scan, setScan] = useState<ScanDetail | null>(null);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [items, setItems] = useState<ScanItemRow[]>([]);
  const [warranty, setWarranty] = useState<WarrantyRow[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([]);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageIdx, setPageIdx] = useState(0);
  const [pageBlobUrl, setPageBlobUrl] = useState<string | null>(null);
  const [showAddPages, setShowAddPages] = useState(false);
  const [notes, setNotes] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');

  // Commit sub-form
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidAmount, setPaidAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [commitDiscount, setCommitDiscount] = useState('0');
  const [commitTax, setCommitTax] = useState('0');
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<{ purchaseId: number; total: number } | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitErrorBlockers, setCommitErrorBlockers] = useState<string[]>([]);

  // Warranty form
  const [warrantyText, setWarrantyText] = useState('');
  const [warrantyFile, setWarrantyFile] = useState<File | null>(null);
  const [warrantyUnreadable, setWarrantyUnreadable] = useState(false);
  const [savingWarranty, setSavingWarranty] = useState(false);

  const authHeader = useRef({ Authorization: `Bearer ${token}` });
  authHeader.current = { Authorization: `Bearer ${token}` };

  const readOnly = scan?.status === 'COMMITTED';

  const fetchDetail = useCallback(async () => {
    const res = await fetch(`/api/purchases/scans/${scanId}`, { headers: authHeader.current });
    if (!res.ok) return;
    const data = await res.json();
    setScan(data.scan);
    setPages(data.pages || []);
    setItems(data.items || []);
    setWarranty(data.warranty || []);
    setNotes(data.scan?.notes || '');
    setInvoiceNumber(data.scan?.invoice_number_raw || '');
    setInvoiceDate(data.scan?.invoice_date_raw || '');
  }, [scanId]);

  const fetchBlockers = useCallback(async () => {
    const res = await fetch(`/api/purchases/scans/${scanId}/commit-check`, { headers: authHeader.current });
    if (!res.ok) return;
    const data = await res.json();
    setBlockers(data.blockers || []);
  }, [scanId]);

  const fetchSuppliers = useCallback(async () => {
    const res = await fetch('/api/suppliers', { headers: authHeader.current });
    if (res.ok) setSuppliers((await res.json()).suppliers || []);
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchDetail(), fetchBlockers()]);
  }, [fetchDetail, fetchBlockers]);

  useEffect(() => {
    setLoading(true);
    setPageIdx(0);
    Promise.all([fetchDetail(), fetchBlockers(), fetchSuppliers()]).finally(() => setLoading(false));
  }, [scanId, fetchDetail, fetchBlockers, fetchSuppliers]);

  // Load the current page's file as an authenticated blob (img src / pdf embed can't send headers).
  useEffect(() => {
    let revoked: string | null = null;
    const page = pages[pageIdx];
    if (!page) { setPageBlobUrl(null); return; }
    (async () => {
      try {
        const res = await fetch(`/api/purchases/scans/${scanId}/pages/${page.id}/file`, { headers: authHeader.current });
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        revoked = url;
        setPageBlobUrl(url);
      } catch {
        setPageBlobUrl(null);
      }
    })();
    return () => { if (revoked) URL.revokeObjectURL(revoked); };
  }, [pages, pageIdx, scanId]);

  const patchScan = async (patch: Record<string, any>) => {
    await fetch(`/api/purchases/scans/${scanId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader.current },
      body: JSON.stringify(patch)
    });
    refreshAll();
  };

  const handleCommit = async () => {
    setCommitting(true);
    setCommitError(null);
    setCommitErrorBlockers([]);
    try {
      const requestKey = crypto.randomUUID();
      const res = await fetch(`/api/purchases/scans/${scanId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader.current },
        body: JSON.stringify({
          requestKey,
          purchaseDate,
          paidAmount: Number(paidAmount) || 0,
          paymentMethod,
          discount: Number(commitDiscount) || 0,
          tax: Number(commitTax) || 0
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setCommitError(data.error || 'Failed to commit invoice');
        setCommitErrorBlockers(data.blockers || []);
        setCommitting(false);
        refreshAll();
        return;
      }
      setCommitResult({ purchaseId: data.purchaseId, total: data.total });
      onCommitted?.(data.purchaseId);
      refreshAll();
    } catch (err: any) {
      setCommitError(err.message || 'Network error while committing');
      setCommitting(false);
    }
  };

  const submitWarranty = async () => {
    setSavingWarranty(true);
    try {
      const formData = new FormData();
      if (warrantyFile) formData.append('file', warrantyFile);
      if (warrantyText) formData.append('extractedText', warrantyText);
      formData.append('isUnreadable', warrantyUnreadable ? 'true' : 'false');
      const res = await fetch(`/api/purchases/scans/${scanId}/warranty`, {
        method: 'POST',
        headers: authHeader.current,
        body: formData
      });
      if (res.ok) {
        setWarrantyText('');
        setWarrantyFile(null);
        setWarrantyUnreadable(false);
        refreshAll();
      }
    } finally {
      setSavingWarranty(false);
    }
  };

  if (loading || !scan) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '0.5rem', color: 'var(--text-muted)' }}>
        <Loader2 size={18} className="animate-spin" />
        <span>Loading scanned invoice...</span>
      </div>
    );
  }

  const currentPage = pages[pageIdx];
  const isPdf = currentPage?.mime_type === 'application/pdf';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>
              Review Scanned Invoice #{scan.id}
              <span className={`badge ${scan.status === 'COMMITTED' ? 'badge-success' : 'badge-warning'}`} style={{ marginLeft: '0.6rem' }}>{scan.status}</span>
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Verify OCR-extracted fields before posting stock.</p>
          </div>
        </div>
        {readOnly && scan.purchase_id && (
          <div className="badge badge-success">Committed as Purchase #{scan.purchase_id}</div>
        )}
      </div>

      {/* Warning banners */}
      {scan.document_type && scan.document_type !== 'INVOICE' && (
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.75rem 1rem', background: 'var(--warning-light)', color: 'var(--warning-text)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
          <FileWarning size={18} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong>This looks like a {scan.document_type.toLowerCase()}, not a plain invoice.</strong>
            <div style={{ marginTop: '0.4rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <input
                  type="checkbox"
                  checked={!!scan.goods_received_confirmed}
                  disabled={readOnly}
                  onChange={e => patchScan({ goodsReceivedConfirmed: e.target.checked })}
                />
                I confirm goods were physically received
              </label>
            </div>
          </div>
        </div>
      )}

      {!!scan.total_mismatch_flag && (
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--danger-light)', color: 'var(--danger-text)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
          <AlertTriangle size={18} />
          <span>Printed total (Rs. {scan.printed_total_raw ?? '?'}) does not match the calculated total (Rs. {scan.calculated_total ?? '?'}). Check line items.</span>
        </div>
      )}

      {scan.duplicate_of_scan_id && (
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--danger-light)', color: 'var(--danger-text)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <Copy size={18} />
            <span>This may be a duplicate of an existing scan (#{scan.duplicate_of_scan_id}).</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => onOpenScan(scan.duplicate_of_scan_id!)}>Open other scan</button>
        </div>
      )}

      {/* Two-pane layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(360px, 1.4fr)', gap: '1rem', flex: 1, minHeight: 0 }}>
        {/* Left: page viewer */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '0.75rem', gap: '0.6rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>
              Page {pages.length === 0 ? 0 : pageIdx + 1} of {pages.length}
            </span>
            {!readOnly && (
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddPages(true)}>
                <Plus size={14} /><span>Add more pages</span>
              </button>
            )}
          </div>

          <div style={{ flex: 1, minHeight: '420px', background: 'var(--bg-app)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
            {!currentPage ? (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No pages on this draft.</span>
            ) : !pageBlobUrl ? (
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            ) : isPdf ? (
              <iframe src={pageBlobUrl} title={`page-${currentPage.page_number}`} style={{ width: '100%', height: '480px', border: 'none' }} />
            ) : (
              <img src={pageBlobUrl} alt={`Invoice page ${currentPage.page_number}`} style={{ maxWidth: '100%', maxHeight: '480px', objectFit: 'contain' }} />
            )}
          </div>

          {pages.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn btn-secondary btn-sm" disabled={pageIdx === 0} onClick={() => setPageIdx(i => Math.max(0, i - 1))}>
                <ChevronLeft size={14} /><span>Prev</span>
              </button>
              <button className="btn btn-secondary btn-sm" disabled={pageIdx === pages.length - 1} onClick={() => setPageIdx(i => Math.min(pages.length - 1, i + 1))}>
                <span>Next</span><ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* Warranty panel */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.6rem' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ShieldCheck size={15} /> Warranty Info
            </h4>
            {warranty.length === 0 && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No warranty text captured yet.</p>}
            {warranty.map(w => (
              <div key={w.id} style={{ fontSize: '0.78rem', padding: '0.4rem 0.5rem', background: 'var(--bg-app)', borderRadius: 'var(--radius-sm)', marginBottom: '0.4rem' }}>
                {w.extracted_text ? <div>{w.extracted_text} {!w.page_id && <em style={{ color: 'var(--text-muted)' }}>(auto-extracted)</em>}</div> : <em style={{ color: 'var(--text-muted)' }}>No text</em>}
                {w.is_unreadable ? <div style={{ color: 'var(--danger)' }}>Marked unreadable</div> : null}
                <a
                  href="#"
                  onClick={async e => {
                    e.preventDefault();
                    const res = await fetch(`/api/purchases/scans/${scanId}/warranty/${w.id}/file`, { headers: authHeader.current });
                    if (res.ok) {
                      const blob = await res.blob();
                      window.open(URL.createObjectURL(blob), '_blank');
                    }
                  }}
                  style={{ fontSize: '0.72rem', color: 'var(--primary)' }}
                >
                  View attachment
                </a>
              </div>
            ))}
            {!readOnly && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem' }}>
                <input
                  className="input" style={{ padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}
                  placeholder="Warranty text (verbatim)"
                  value={warrantyText}
                  onChange={e => setWarrantyText(e.target.value)}
                />
                <input
                  type="file" accept="image/*"
                  onChange={e => setWarrantyFile(e.target.files?.[0] || null)}
                  style={{ fontSize: '0.75rem' }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
                  <input type="checkbox" checked={warrantyUnreadable} onChange={e => setWarrantyUnreadable(e.target.checked)} />
                  Unreadable
                </label>
                <button className="btn btn-secondary btn-sm" onClick={submitWarranty} disabled={savingWarranty || (!warrantyText && !warrantyFile)}>
                  <Upload size={13} /><span>{savingWarranty ? 'Saving...' : 'Save warranty info'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: review form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', paddingRight: '0.25rem' }}>
          {/* Scan-level fields */}
          <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Invoice Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Supplier (as read): <em style={{ color: 'var(--text-muted)' }}>{scan.supplier_name_raw || '—'}</em>
                </label>
                <select
                  className="select"
                  value={scan.supplier_id ?? ''}
                  disabled={readOnly}
                  style={!scan.supplier_id ? { border: '1.5px solid var(--danger)' } : undefined}
                  onChange={e => patchScan({ supplierId: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">Select / confirm supplier *</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Invoice Number *</label>
                <input
                  className="input" value={invoiceNumber} disabled={readOnly}
                  onChange={e => setInvoiceNumber(e.target.value)}
                  onBlur={() => patchScan({ invoiceNumberRaw: invoiceNumber })}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Invoice Date</label>
                <input
                  className="input" placeholder="As printed" value={invoiceDate} disabled={readOnly}
                  onChange={e => setInvoiceDate(e.target.value)}
                  onBlur={() => patchScan({ invoiceDateRaw: invoiceDate })}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Document Type</label>
                <select
                  className="select" value={scan.document_type || 'UNKNOWN'} disabled={readOnly}
                  onChange={e => patchScan({ documentType: e.target.value })}
                >
                  <option value="INVOICE">Invoice</option>
                  <option value="QUOTATION">Quotation</option>
                  <option value="ESTIMATE">Estimate</option>
                  <option value="UNKNOWN">Unknown</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Notes</label>
              <input
                className="input" value={notes} disabled={readOnly}
                onChange={e => setNotes(e.target.value)}
                onBlur={() => patchScan({ notes })}
              />
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.6rem' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                Invoice-level tags apply to the whole purchase, as a convenience; the real classification is confirmed per line item below.
              </p>
              <div style={{ display: 'flex', gap: '1.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                  <input type="checkbox" checked={!!scan.is_schedule_b} disabled={readOnly} onChange={e => patchScan({ isScheduleB: e.target.checked })} />
                  Tag invoice: Schedule B
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                  <input type="checkbox" checked={!!scan.is_schedule_d} disabled={readOnly} onChange={e => patchScan({ isScheduleD: e.target.checked })} />
                  Tag invoice: Schedule D
                </label>
              </div>
            </div>
          </div>

          {/* Line items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Line Items ({items.length})</h3>
            {items.length === 0 && (
              <div className="card" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No line items were extracted from this scan.
              </div>
            )}
            {items.map(it => (
              <InvoiceScanItemCard key={it.id} item={it} readOnly={!!readOnly} onSaved={refreshAll} />
            ))}
          </div>

          {/* Commit-check / blockers */}
          <div className="card" style={{ padding: '1rem', border: blockers.length > 0 ? '1.5px solid var(--danger)' : '1.5px solid var(--success)', position: 'sticky', bottom: 0, background: 'var(--bg-surface-elevated)' }}>
            {blockers.length > 0 ? (
              <>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <AlertTriangle size={16} /> {blockers.length} item(s) blocking commit
                </h4>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.78rem', color: 'var(--danger-text)' }}>
                  {blockers.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              </>
            ) : (
              <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <CheckCircle2 size={16} /> Ready to commit
              </h4>
            )}

            {!readOnly && !commitResult && (
              <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: '0.2rem' }}>Purchase Date</label>
                    <input type="date" className="input" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: '0.2rem' }}>Discount</label>
                    <input type="number" className="input" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} value={commitDiscount} onChange={e => setCommitDiscount(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: '0.2rem' }}>Tax</label>
                    <input type="number" className="input" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} value={commitTax} onChange={e => setCommitTax(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: '0.2rem' }}>Paid Now</label>
                    <input type="number" className="input" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} value={paidAmount} onChange={e => setPaidAmount(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: '0.2rem' }}>Payment Method</label>
                    <select className="select" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                      <option value="CASH">Cash Drawer</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>
                  </div>
                </div>

                {commitError && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>
                    {commitError}
                    {commitErrorBlockers.length > 0 && (
                      <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1.1rem' }}>
                        {commitErrorBlockers.map((b, i) => <li key={i}>{b}</li>)}
                      </ul>
                    )}
                  </div>
                )}

                <button
                  className="btn btn-primary"
                  disabled={blockers.length > 0 || committing}
                  onClick={handleCommit}
                  style={{ alignSelf: 'flex-end' }}
                >
                  {committing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  <span>{committing ? 'Committing...' : 'Commit Invoice & Update Stock'}</span>
                </button>
              </div>
            )}

            {commitResult && (
              <div style={{ marginTop: '0.85rem', padding: '0.75rem', background: 'var(--success-light)', color: 'var(--success-text)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Committed. Purchase #{commitResult.purchaseId} created and stock updated (Total Rs. {commitResult.total.toFixed(2)}).</span>
                <button className="btn btn-primary btn-sm" onClick={onClose}>Back to Purchases</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showAddPages && (
        <ScanUploadModal
          title="Add more pages"
          scanId={scanId}
          onClose={() => setShowAddPages(false)}
          onCreated={() => {}}
          onAppended={() => { setShowAddPages(false); refreshAll(); }}
        />
      )}
    </div>
  );
};

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { InvoiceScanReviewView } from './InvoiceScanReviewView.js';
import { ScanUploadModal } from '../components/ScanUploadModal.js';
import { Search, RefreshCw, Eye, Trash2, Camera, ScanLine } from 'lucide-react';

interface ScanListRow {
  id: number;
  status: 'DRAFT' | 'REVIEWED' | 'COMMITTED' | 'VOID';
  supplier_name: string | null;
  supplier_name_raw: string | null;
  invoice_number_raw: string | null;
  invoice_date_raw: string | null;
  created_at: string;
  page_count: number;
  item_count: number;
  purchase_id: number | null;
  is_schedule_b: number;
  is_schedule_d: number;
}

export const InvoiceScanArchiveView: React.FC = () => {
  const { token, hasPermission } = useAuth();
  const [scans, setScans] = useState<ScanListRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [openScanId, setOpenScanId] = useState<number | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplier, setSupplier] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [product, setProduct] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [schedule, setSchedule] = useState('');
  const [status, setStatus] = useState('');

  const fetchScans = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (invoiceNumber) params.set('invoiceNumber', invoiceNumber);
      if (supplier) params.set('supplier', supplier);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (product) params.set('product', product);
      if (batchNumber) params.set('batchNumber', batchNumber);
      if (schedule) params.set('schedule', schedule);
      if (status) params.set('status', status);

      const res = await fetch(`/api/purchases/scans?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setScans(data.scans || []);
      }
    } finally {
      setIsLoading(false);
    }
  }, [token, invoiceNumber, supplier, dateFrom, dateTo, product, batchNumber, schedule, status]);

  useEffect(() => { fetchScans(); }, [fetchScans]);

  const voidDraft = async (id: number) => {
    if (!window.confirm('Void this draft scan? This cannot be undone.')) return;
    const res = await fetch(`/api/purchases/scans/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) fetchScans();
  };

  if (openScanId !== null) {
    return (
      <div className="page-container">
        <InvoiceScanReviewView
          scanId={openScanId}
          onClose={() => { setOpenScanId(null); fetchScans(); }}
          onOpenScan={id => setOpenScanId(id)}
          onCommitted={() => fetchScans()}
        />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Scanned Invoice Archive</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Search drafts and committed invoice scans</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={fetchScans} className="btn btn-secondary btn-sm" disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          {hasPermission('create_purchases') && (
            <button onClick={() => setShowUpload(true)} className="btn btn-primary btn-sm">
              <Camera size={16} />
              <span>Scan Invoice</span>
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
        <input className="input" placeholder="Invoice #" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
        <input className="input" placeholder="Supplier" value={supplier} onChange={e => setSupplier(e.target.value)} />
        <input className="input" placeholder="Product" value={product} onChange={e => setProduct(e.target.value)} />
        <input className="input" placeholder="Batch #" value={batchNumber} onChange={e => setBatchNumber(e.target.value)} />
        <input type="date" className="input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="Date from" />
        <input type="date" className="input" value={dateTo} onChange={e => setDateTo(e.target.value)} title="Date to" />
        <select className="select" value={schedule} onChange={e => setSchedule(e.target.value)}>
          <option value="">Any Schedule</option>
          <option value="B">Schedule B</option>
          <option value="D">Schedule D</option>
        </select>
        <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Any Status</option>
          <option value="DRAFT">Draft</option>
          <option value="COMMITTED">Committed</option>
        </select>
        <button className="btn btn-secondary" onClick={fetchScans}>
          <Search size={14} /><span>Search</span>
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-container" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Supplier</th>
                <th>Date</th>
                <th>Status</th>
                <th>Pages</th>
                <th>Items</th>
                <th>Purchase</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {scans.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    <ScanLine size={28} style={{ marginBottom: '0.5rem' }} />
                    <div>No scanned invoices found. Try scanning one, or adjust filters.</div>
                  </td>
                </tr>
              ) : (
                scans.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 700 }}>{s.invoice_number_raw || `#${s.id}`}</td>
                    <td>{s.supplier_name || <em style={{ color: 'var(--text-muted)' }}>{s.supplier_name_raw || 'Unmatched'}</em>}</td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{s.invoice_date_raw || s.created_at?.slice(0, 10)}</td>
                    <td>
                      <span className={`badge ${s.status === 'COMMITTED' ? 'badge-success' : 'badge-warning'}`}>{s.status}</span>
                      {!!s.is_schedule_b && <span className="badge badge-purple" style={{ marginLeft: '0.3rem' }}>B</span>}
                      {!!s.is_schedule_d && <span className="badge badge-purple" style={{ marginLeft: '0.3rem' }}>D</span>}
                    </td>
                    <td>{s.page_count}</td>
                    <td>{s.item_count}</td>
                    <td>{s.purchase_id ? `#${s.purchase_id}` : '—'}</td>
                    <td style={{ display: 'flex', gap: '0.3rem' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setOpenScanId(s.id)}>
                        <Eye size={14} /><span>{s.status === 'COMMITTED' ? 'View' : 'Review'}</span>
                      </button>
                      {s.status !== 'COMMITTED' && hasPermission('create_purchases') && (
                        <button className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={() => voidDraft(s.id)}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showUpload && (
        <ScanUploadModal
          onClose={() => setShowUpload(false)}
          onCreated={id => { setShowUpload(false); setOpenScanId(id); fetchScans(); }}
        />
      )}
    </div>
  );
};

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  ClipboardList, ScanBarcode, Printer, Download, ShieldCheck, ShieldAlert, AlertTriangle,
  CheckCircle2, XCircle, History, FileText, X, PlusCircle
} from 'lucide-react';
import { DownwardSelect } from '../components/DownwardSelect.js';

type Tab = 'ALL' | 'B' | 'D' | 'PENDING_REVIEW' | 'CORRECTIONS' | 'CLASSIFICATION_REVIEW';

const TABS: { id: Tab; label: string }[] = [
  { id: 'ALL', label: 'All Entries' },
  { id: 'B', label: 'Schedule B' },
  { id: 'D', label: 'Schedule D' },
  { id: 'PENDING_REVIEW', label: 'Pending Review' },
  { id: 'CORRECTIONS', label: 'Corrections & Reversals' },
  { id: 'CLASSIFICATION_REVIEW', label: 'Classification Review' }
];

const STATUS_OPTIONS = [
  { value: '', label: 'Any Status' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CORRECTED', label: 'Corrected' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'REVERSED', label: 'Reversed' },
  { value: 'MANUAL', label: 'Manual' }
];

const CLASSIFICATION_STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'DRAFT_UNVERIFIED', label: 'Draft / Unverified' },
  { value: 'PENDING_REVIEW', label: 'Pending Review' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'REJECTED', label: 'Rejected' }
];

const MANUAL_SCHEDULE_OPTIONS = [
  { value: 'B', label: 'Schedule B' },
  { value: 'D', label: 'Schedule D' },
  { value: 'BOTH', label: 'Both B & D' }
];

function ScheduleBadge({ schedule }: { schedule: string }) {
  const cls = schedule === 'BOTH' ? 'badge-purple' : schedule === 'D' ? 'badge-warning' : 'badge-primary';
  return <span className={`badge ${cls} badge-uppercase`}>{schedule}</span>;
}

function EntryStatusBadge({ status, verified }: { status: string; verified: boolean }) {
  const cls = status === 'COMPLETED' ? 'badge-success'
    : status === 'MANUAL' ? 'badge-primary'
    : (status === 'CANCELLED' || status === 'REVERSED') ? 'badge-danger'
    : 'badge-warning';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
      <span className={`badge ${cls}`}>{status}</span>
      {!verified && <AlertTriangle size={14} color="var(--warning-text)" aria-label="Classification not yet verified" />}
    </span>
  );
}

function ClassificationStatusBadge({ status }: { status: string }) {
  const cls = status === 'VERIFIED' ? 'badge-success' : status === 'REJECTED' ? 'badge-danger' : status === 'PENDING_REVIEW' ? 'badge-primary' : 'badge-warning';
  return <span className={`badge ${cls}`}>{status.replace('_', ' ')}</span>;
}

/** A fixed-width label beside a value, laid out as a flex row with no stray browser margins -
 * keeps the two-column detail grid lined up even when one side's text wraps. */
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
      <span style={{ fontWeight: 700, color: 'var(--text-secondary)', minWidth: '125px', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

const FIELD_MAX_WIDTH = 260;

const EMPTY_MANUAL_FORM = {
  medicineId: '', schedule: 'B', dispensedQuantity: '', unit: '',
  batchNumberSnapshot: '', expiryDateSnapshot: '', originalDispensingDate: '',
  patientName: '', purchaserName: '', prescriberName: '', originalDocumentReference: ''
};

export const ScheduleBDView: React.FC = () => {
  const { token, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('ALL');
  const [entries, setEntries] = useState<any[]>([]);
  const [classifications, setClassifications] = useState<any[]>([]);
  const [importLog, setImportLog] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filters, setFilters] = useState({ q: '', dateFrom: '', dateTo: '', branch: '', status: '' });
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [classificationFilter, setClassificationFilter] = useState<'ALL' | 'DRAFT_UNVERIFIED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED'>('ALL');

  const [showManualModal, setShowManualModal] = useState(false);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [manualForm, setManualForm] = useState(EMPTY_MANUAL_FORM);
  const [manualSaving, setManualSaving] = useState(false);

  const scanInputRef = useRef<HTMLInputElement>(null);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchEntries = useCallback(async () => {
    if (!token || activeTab === 'CLASSIFICATION_REVIEW') return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('tab', activeTab);
      if (filters.q) params.append('q', filters.q);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      if (filters.branch) params.append('branch', filters.branch);
      if (filters.status) params.append('status', filters.status);

      const res = await fetch(`/api/schedule-bd?${params.toString()}`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch (err) {
      console.error('Failed to fetch Schedule B/D register:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, activeTab, filters]);

  const fetchClassifications = useCallback(async () => {
    if (!token || activeTab !== 'CLASSIFICATION_REVIEW') return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (classificationFilter !== 'ALL') params.append('status', classificationFilter);
      if (filters.q) params.append('q', filters.q);
      const res = await fetch(`/api/classifications?${params.toString()}`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setClassifications(data.classifications || []);
        setImportLog(data.importLog || []);
      }
    } catch (err) {
      console.error('Failed to fetch classifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, activeTab, classificationFilter, filters.q]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);
  useEffect(() => { fetchClassifications(); }, [fetchClassifications]);

  // Keep the scanner/search bar focused and ready so a keyboard-wedge barcode scanner can type
  // straight into it (scanning an invoice/batch barcode jumps straight to the matching entry).
  useEffect(() => {
    if (activeTab !== 'CLASSIFICATION_REVIEW') scanInputRef.current?.focus();
  }, [activeTab]);

  useEffect(() => {
    if (!token || !showManualModal || medicines.length > 0) return;
    fetch('/api/medicines', { headers: authHeaders })
      .then(res => res.ok ? res.json() : { medicines: [] })
      .then(data => setMedicines(data.medicines || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, showManualModal]);

  const openDetail = async (entry: any) => {
    setSelectedEntry(entry);
    try {
      const res = await fetch(`/api/schedule-bd/${entry.id}`, { headers: authHeaders });
      if (res.ok) setDetail(await res.json());
    } catch (err) {
      console.error('Failed to fetch entry detail:', err);
    }
  };

  const handleVerify = async (id: number, decision: 'VERIFIED' | 'REJECTED') => {
    const note = decision === 'REJECTED' ? window.prompt('Reason for rejecting this classification (optional):') || '' : '';
    try {
      const res = await fetch(`/api/classifications/${id}/verify`, {
        method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInfoMessage(data.message);
      fetchClassifications();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update classification');
    }
  };

  const handleAmend = async (type: 'amend' | 'cancel' | 'reverse') => {
    if (!selectedEntry) return;
    const reason = window.prompt(`Reason for this ${type === 'amend' ? 'correction' : type}:`);
    if (!reason || !reason.trim()) return;
    try {
      const res = await fetch(`/api/schedule-bd/${selectedEntry.id}/${type}`, {
        method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInfoMessage(data.message);
      openDetail(selectedEntry);
      fetchEntries();
    } catch (err: any) {
      setErrorMessage(err.message || 'Action failed');
    }
  };

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    params.append('tab', activeTab === 'CLASSIFICATION_REVIEW' ? 'ALL' : activeTab);
    if (filters.q) params.append('q', filters.q);
    if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.append('dateTo', filters.dateTo);
    fetch(`/api/schedule-bd/export/csv?${params.toString()}`, { headers: authHeaders })
      .then(res => res.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `schedule-bd-register-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => setErrorMessage('CSV export failed'));
  };

  const handlePrintAll = () => {
    const style = document.createElement('style');
    style.id = 'sbd-a4-landscape-style';
    style.innerHTML = '@page { size: landscape; margin: 10mm; }';
    document.head.appendChild(style);
    const cleanup = () => { document.getElementById('sbd-a4-landscape-style')?.remove(); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    window.print();
  };

  const handleSubmitManualEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const medicine = medicines.find(m => String(m.id) === manualForm.medicineId);
    if (!medicine) { setErrorMessage('Select a medicine for this manual entry.'); return; }
    if (!manualForm.dispensedQuantity || Number(manualForm.dispensedQuantity) <= 0) { setErrorMessage('Enter a valid dispensed quantity.'); return; }
    if (!manualForm.originalDispensingDate) { setErrorMessage('The original dispensing date is required for a manual/legacy entry.'); return; }

    setManualSaving(true);
    try {
      const res = await fetch('/api/schedule-bd/manual', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule: manualForm.schedule,
          dispensedQuantity: Number(manualForm.dispensedQuantity),
          unit: manualForm.unit || medicine.stock_unit || null,
          batchNumberSnapshot: manualForm.batchNumberSnapshot || null,
          expiryDateSnapshot: manualForm.expiryDateSnapshot || null,
          originalDispensingDate: manualForm.originalDispensingDate,
          originalDocumentReference: manualForm.originalDocumentReference || null,
          medicineSnapshot: {
            brandName: medicine.brand_name, genericName: medicine.generic_name,
            strength: medicine.strength, dosageForm: medicine.dosage_form
          },
          patientSnapshot: manualForm.patientName ? { name: manualForm.patientName } : null,
          purchaserSnapshot: manualForm.purchaserName ? { name: manualForm.purchaserName } : null,
          prescriberSnapshot: manualForm.prescriberName ? { name: manualForm.prescriberName } : null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInfoMessage(data.message);
      setShowManualModal(false);
      setManualForm(EMPTY_MANUAL_FORM);
      fetchEntries();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to record manual entry');
    } finally {
      setManualSaving(false);
    }
  };

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <ClipboardList size={24} style={{ color: 'var(--primary)' }} /> Schedule B & D Register
          </h1>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Controlled & prescription-only drug dispensing register, with classification review and pharmacist sign-off.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {hasPermission('amend_scheduled_register') && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowManualModal(true)}><PlusCircle size={15} /> Add Manual Entry</button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={handleExportCsv}><Download size={15} /> Export CSV</button>
          <button className="btn btn-secondary btn-sm" onClick={handlePrintAll}><Printer size={15} /> Print (A4 Landscape)</button>
        </div>
      </div>

      <div style={{ fontSize: '0.78rem', color: 'var(--warning-text)', marginBottom: '1rem', padding: '0.65rem 0.9rem', background: 'var(--warning-light)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 'var(--radius-md)' }}>
        Software-generated register and export — a dispensing record for this pharmacy's own use, not a certified regulatory register format. Only pharmacist-verified classifications gate dispensing; unverified draft entries never control a sale. Completed entries cannot be edited or deleted — use "Record Correction" / "Cancel" / "Reverse" to make an audited amendment instead.
      </div>

      {errorMessage && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.9rem', background: 'var(--danger-light)', color: 'var(--danger-text)', borderRadius: 'var(--radius-md)', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
          <span>{errorMessage}</span>
          <button className="btn-icon" onClick={() => setErrorMessage(null)}><X size={14} /></button>
        </div>
      )}
      {infoMessage && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.9rem', background: 'var(--success-light)', color: 'var(--success-text)', borderRadius: 'var(--radius-md)', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
          <span>{infoMessage}</span>
          <button className="btn-icon" onClick={() => setInfoMessage(null)}><X size={14} /></button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--border)', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '0.6rem 1rem', border: 'none', borderBottom: activeTab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
              background: 'transparent', color: activeTab === t.id ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: activeTab === t.id ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', transition: 'color 0.15s ease'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab !== 'CLASSIFICATION_REVIEW' ? (
        <>
          <div className="card" style={{ marginBottom: '1.25rem', padding: '1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'end' }}>
              <div style={{ flex: '1 1 260px', maxWidth: '360px' }}>
                <label className="form-label">Scan or Search</label>
                <div style={{ position: 'relative' }}>
                  <ScanBarcode size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    ref={scanInputRef}
                    className="input"
                    placeholder="Scan invoice/batch barcode, or type serial, patient, medicine..."
                    value={filters.q}
                    onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
                    style={{ paddingLeft: '2rem' }}
                  />
                </div>
              </div>
              <div style={{ flex: '1 1 150px', maxWidth: FIELD_MAX_WIDTH }}>
                <label className="form-label">From Date</label>
                <input className="input" type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
              </div>
              <div style={{ flex: '1 1 150px', maxWidth: FIELD_MAX_WIDTH }}>
                <label className="form-label">To Date</label>
                <input className="input" type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
              </div>
              <div style={{ flex: '1 1 150px', maxWidth: FIELD_MAX_WIDTH }}>
                <label className="form-label">Branch</label>
                <input className="input" placeholder="Any branch" value={filters.branch} onChange={e => setFilters(f => ({ ...f, branch: e.target.value }))} />
              </div>
              <div style={{ flex: '1 1 160px', maxWidth: FIELD_MAX_WIDTH, minWidth: '160px' }}>
                <label className="form-label">Status</label>
                <DownwardSelect
                  value={filters.status}
                  onChange={v => setFilters(f => ({ ...f, status: v }))}
                  options={STATUS_OPTIONS}
                  placeholder="Any Status"
                />
              </div>
            </div>
          </div>

          <div className="table-responsive printable-register-list">
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Serial</th><th>Schedule</th><th>Invoice</th><th>Medicine</th><th>Patient</th>
                    <th>Qty</th><th>Cashier</th><th>Approved By</th><th>Status</th><th>Dispensed At</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading...</td></tr>}
                  {!isLoading && entries.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No register entries found.</td></tr>}
                  {entries.map(e => (
                    <tr key={e.id} onClick={() => openDetail(e)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{e.serial_number}</td>
                      <td><ScheduleBadge schedule={e.schedule} /></td>
                      <td>{e.invoice_number}</td>
                      <td>{e.medicine_snapshot?.brandName}{e.medicine_snapshot?.strength ? ` ${e.medicine_snapshot.strength}` : ''}</td>
                      <td>{e.patient_snapshot?.name || '-'}</td>
                      <td>{e.dispensed_quantity}</td>
                      <td>{e.cashier_name || '-'}</td>
                      <td>{e.approved_by_name || '-'}</td>
                      <td><EntryStatusBadge status={e.status} verified={e.classification_status === 'VERIFIED'} /></td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{e.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div>
          {importLog.map((log: any) => (
            <div key={log.id} style={{ padding: '0.75rem 0.9rem', background: 'var(--primary-light)', border: '1px solid var(--primary-border)', borderRadius: 'var(--radius-md)', marginBottom: '0.75rem', fontSize: '0.82rem' }}>
              <strong style={{ color: 'var(--primary)' }}>Import notice:</strong> {log.summary}<br />
              <span style={{ color: 'var(--text-muted)' }}>{log.gaps_note}</span>
            </div>
          ))}

          <div className="card" style={{ marginBottom: '1.25rem', padding: '1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'end' }}>
              <div style={{ flex: '1 1 260px', maxWidth: '360px' }}>
                <label className="form-label">Search</label>
                <div style={{ position: 'relative' }}>
                  <ScanBarcode size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input className="input" placeholder="Substance or group name..." value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} style={{ paddingLeft: '2rem' }} />
                </div>
              </div>
              <div style={{ flex: '1 1 180px', maxWidth: FIELD_MAX_WIDTH, minWidth: '180px' }}>
                <label className="form-label">Verification Status</label>
                <DownwardSelect
                  value={classificationFilter}
                  onChange={v => setClassificationFilter(v as any)}
                  options={CLASSIFICATION_STATUS_OPTIONS}
                  placeholder="All Statuses"
                />
              </div>
            </div>
          </div>

          <div className="table-responsive">
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr><th>Name / Group</th><th>Schedule</th><th>Jurisdiction</th><th>Status</th><th style={{ textAlign: 'center' }}>Flag</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {!isLoading && classifications.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No classifications match this filter.</td></tr>}
                  {classifications.map((c: any) => (
                    <tr key={c.id}>
                      <td>{c.substance_name || c.group_description}</td>
                      <td><ScheduleBadge schedule={c.schedule} /></td>
                      <td style={{ color: 'var(--text-muted)' }}>{c.jurisdiction}</td>
                      <td><ClassificationStatusBadge status={c.verification_status} /></td>
                      <td style={{ textAlign: 'center' }}>
                        {c.suspected_error_flag ? <span title={c.suspected_error_note}><AlertTriangle size={16} color="var(--warning-text)" /></span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', height: '100%' }}>
                        {hasPermission('manage_drug_classification') && c.verification_status !== 'VERIFIED' && (
                          <button className="btn btn-secondary btn-sm" title="Verify" onClick={() => handleVerify(c.id, 'VERIFIED')}><ShieldCheck size={14} /></button>
                        )}
                        {hasPermission('manage_drug_classification') && c.verification_status !== 'REJECTED' && (
                          <button className="btn btn-secondary btn-sm" title="Reject" onClick={() => handleVerify(c.id, 'REJECTED')}><ShieldAlert size={14} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {selectedEntry && detail && (
        <div className="modal-overlay" onClick={() => { setSelectedEntry(null); setDetail(null); }}>
          <div
            className="modal-content printable-register-detail"
            style={{ width: '100%', maxWidth: '760px', maxHeight: '85vh', overflowY: 'auto', padding: '1.5rem' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
                {detail.entry.serial_number}
                <ScheduleBadge schedule={detail.entry.schedule} />
                <EntryStatusBadge status={detail.entry.status} verified={detail.entry.classification_status === 'VERIFIED'} />
              </h3>
              <button className="btn-icon" onClick={() => { setSelectedEntry(null); setDetail(null); }}><X size={18} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.6rem 1.5rem', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              <DetailRow label="Rule version" value={detail.entry.rule_version} />
              <DetailRow label="Invoice" value={detail.entry.invoice_number} />
              <DetailRow label="Branch / Counter" value={`${detail.entry.branch} / ${detail.entry.pos_counter}`} />
              <DetailRow label="Batch" value={`${detail.entry.batch_number_snapshot || '-'} (exp. ${detail.entry.expiry_date_snapshot || '-'})`} />
              <DetailRow
                label="Medicine"
                value={`${detail.entry.medicine_snapshot?.brandName} (${detail.entry.medicine_snapshot?.genericName}) ${detail.entry.medicine_snapshot?.strength || ''} — ${detail.entry.medicine_snapshot?.dosageForm || ''}`}
              />
              <DetailRow label="Quantity" value={`${detail.entry.dispensed_quantity} ${detail.entry.unit || ''}`} />
              <DetailRow label="Patient" value={detail.entry.patient_snapshot?.name || '-'} />
              <DetailRow label="Purchaser" value={detail.entry.purchaser_snapshot?.name || 'Same as patient'} />
              <DetailRow label="Prescriber" value={`${detail.entry.prescriber_snapshot?.name || '-'} (${detail.entry.prescriber_snapshot?.registrationNumber || 'no reg. no.'})`} />
              <DetailRow label="Cashier" value={detail.entry.cashier_snapshot?.name || '-'} />
              <DetailRow label="Approved by" value={`${detail.entry.approved_by_name || '-'} at ${detail.entry.approved_at || '-'}`} />
            </div>

            {detail.entry.classification_status !== 'VERIFIED' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--warning-text)', background: 'var(--warning-light)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.82rem', marginBottom: '1rem' }}>
                <AlertTriangle size={15} /> This entry's classification is not currently VERIFIED — review required.
              </div>
            )}

            {detail.prescription && (
              <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={14} /> Prescription #{detail.prescription.id}
                {detail.hasAttachment && (
                  <button className="btn btn-secondary btn-sm" onClick={async () => {
                    const res = await fetch(`/api/prescriptions/${detail.prescription.id}/attachment`, { headers: authHeaders });
                    if (res.ok) {
                      const blob = await res.blob();
                      window.open(URL.createObjectURL(blob), '_blank');
                    }
                  }}>View Attachment</button>
                )}
              </div>
            )}

            <h4 style={{ marginTop: '1.25rem', marginBottom: '0.5rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><History size={16} /> Audit History</h4>
            {detail.amendments.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No corrections, cancellations or reversals recorded.</div>}
            {detail.amendments.map((a: any) => (
              <div key={a.id} style={{ fontSize: '0.82rem', padding: '0.5rem 0', borderBottom: '1px dashed var(--border)' }}>
                <span className="badge badge-warning" style={{ marginRight: '0.5rem' }}>{a.amendment_type}</span>
                by {a.author_name} at {a.created_at} — {a.reason}
              </div>
            ))}

            {detail.returnLinks.length > 0 && (
              <>
                <h4 style={{ marginTop: '1.25rem', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Linked Returns</h4>
                {detail.returnLinks.map((r: any) => (
                  <div key={r.id} style={{ fontSize: '0.82rem', padding: '0.25rem 0' }}>{r.return_number} — {r.quantity_returned} unit(s) returned ({r.return_status})</div>
                ))}
              </>
            )}

            {hasPermission('amend_scheduled_register') && detail.entry.status === 'COMPLETED' && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => handleAmend('amend')}>Record Correction</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleAmend('cancel')}><XCircle size={14} /> Cancel Entry</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleAmend('reverse')}><CheckCircle2 size={14} /> Reverse Entry</button>
              </div>
            )}

            <div style={{ marginTop: '1.25rem', textAlign: 'right' }}>
              <button className="btn btn-primary btn-sm" onClick={() => window.print()}><Printer size={15} /> Print this entry</button>
            </div>
          </div>
        </div>
      )}

      {showManualModal && (
        <div className="modal-overlay" onClick={() => setShowManualModal(false)}>
          <div className="modal-content" style={{ width: '100%', maxWidth: '560px', padding: '1.5rem' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>Add Manual / Legacy Register Entry</h3>
              <button className="btn-icon" onClick={() => setShowManualModal(false)}><X size={18} /></button>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              For a paper record found later, or a legacy dispense never entered at the counter. This creates an audited register entry only — it does <strong>not</strong> deduct stock. Link a separate inventory adjustment yourself if stock also needs correcting.
            </div>
            <form onSubmit={handleSubmitManualEntry} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label className="form-label">Medicine *</label>
                <select className="select" value={manualForm.medicineId} onChange={e => setManualForm(f => ({ ...f, medicineId: e.target.value }))} required>
                  <option value="">Select medicine...</option>
                  {medicines.map((m: any) => (
                    <option key={m.id} value={m.id}>{m.brand_name} {m.strength} ({m.dosage_form || 'Unit'})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className="form-label">Schedule *</label>
                  <DownwardSelect value={manualForm.schedule} onChange={v => setManualForm(f => ({ ...f, schedule: v }))} options={MANUAL_SCHEDULE_OPTIONS} />
                </div>
                <div>
                  <label className="form-label">Dispensed Quantity *</label>
                  <input className="input" type="number" min="0.01" step="0.01" value={manualForm.dispensedQuantity} onChange={e => setManualForm(f => ({ ...f, dispensedQuantity: e.target.value }))} required />
                </div>
                <div>
                  <label className="form-label">Unit</label>
                  <input className="input" placeholder="e.g. Tablet" value={manualForm.unit} onChange={e => setManualForm(f => ({ ...f, unit: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Original Dispensing Date *</label>
                  <input className="input" type="date" value={manualForm.originalDispensingDate} onChange={e => setManualForm(f => ({ ...f, originalDispensingDate: e.target.value }))} required />
                </div>
                <div>
                  <label className="form-label">Batch Number</label>
                  <input className="input" value={manualForm.batchNumberSnapshot} onChange={e => setManualForm(f => ({ ...f, batchNumberSnapshot: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Batch Expiry</label>
                  <input className="input" type="date" value={manualForm.expiryDateSnapshot} onChange={e => setManualForm(f => ({ ...f, expiryDateSnapshot: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Patient Name</label>
                  <input className="input" value={manualForm.patientName} onChange={e => setManualForm(f => ({ ...f, patientName: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Purchaser (if different)</label>
                  <input className="input" value={manualForm.purchaserName} onChange={e => setManualForm(f => ({ ...f, purchaserName: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Prescriber Name</label>
                  <input className="input" value={manualForm.prescriberName} onChange={e => setManualForm(f => ({ ...f, prescriberName: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Original Document Ref.</label>
                  <input className="input" value={manualForm.originalDocumentReference} onChange={e => setManualForm(f => ({ ...f, originalDocumentReference: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowManualModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={manualSaving}>{manualSaving ? 'Saving...' : 'Record Entry'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

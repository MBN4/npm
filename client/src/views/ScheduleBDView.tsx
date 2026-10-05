import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  ClipboardList, Search, Printer, Download, ShieldCheck, ShieldAlert, AlertTriangle,
  CheckCircle2, XCircle, History, FileText, X
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

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <ClipboardList size={24} style={{ color: 'var(--primary)' }} /> Schedule B & D Register
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Controlled & prescription-only drug dispensing register, with classification review and pharmacist sign-off.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary btn-sm" onClick={handleExportCsv}><Download size={15} /> Export CSV</button>
          <button className="btn btn-secondary btn-sm" onClick={handlePrintAll}><Printer size={15} /> Print (A4 Landscape)</button>
        </div>
      </div>

      <div style={{ fontSize: '0.78rem', color: 'var(--warning-text)', marginBottom: '1rem', padding: '0.65rem 0.9rem', background: 'var(--warning-light)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 'var(--radius-md)' }}>
        Software-generated register and export — a dispensing record for this pharmacy's own use, not a certified regulatory register format. Only pharmacist-verified classifications gate dispensing; unverified draft entries never control a sale.
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
              <div>
                <label className="form-label">Search</label>
                <div style={{ position: 'relative' }}>
                  <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    className="input"
                    placeholder="Serial, invoice, patient, medicine, batch..."
                    value={filters.q}
                    onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
                    style={{ paddingLeft: '2rem' }}
                  />
                </div>
              </div>
              <div>
                <label className="form-label">From Date</label>
                <input className="input" type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">To Date</label>
                <input className="input" type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Branch</label>
                <input className="input" placeholder="Any branch" value={filters.branch} onChange={e => setFilters(f => ({ ...f, branch: e.target.value }))} />
              </div>
              <div>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
              <div>
                <label className="form-label">Search</label>
                <div style={{ position: 'relative' }}>
                  <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input className="input" placeholder="Substance or group name..." value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} style={{ paddingLeft: '2rem' }} />
                </div>
              </div>
              <div>
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
                      <td style={{ display: 'flex', gap: '0.4rem' }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                {detail.entry.serial_number}
                <ScheduleBadge schedule={detail.entry.schedule} />
                <EntryStatusBadge status={detail.entry.status} verified={detail.entry.classification_status === 'VERIFIED'} />
              </h3>
              <button className="btn-icon" onClick={() => { setSelectedEntry(null); setDetail(null); }}><X size={18} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1.5rem', fontSize: '0.85rem', marginBottom: '1rem' }}>
              <p><strong>Rule version:</strong> {detail.entry.rule_version}</p>
              <p><strong>Invoice:</strong> {detail.entry.invoice_number}</p>
              <p><strong>Branch / Counter:</strong> {detail.entry.branch} / {detail.entry.pos_counter}</p>
              <p><strong>Batch:</strong> {detail.entry.batch_number_snapshot} (exp. {detail.entry.expiry_date_snapshot})</p>
              <p style={{ gridColumn: '1 / -1' }}><strong>Medicine:</strong> {detail.entry.medicine_snapshot?.brandName} ({detail.entry.medicine_snapshot?.genericName}) {detail.entry.medicine_snapshot?.strength} — {detail.entry.medicine_snapshot?.dosageForm}</p>
              <p><strong>Quantity:</strong> {detail.entry.dispensed_quantity} {detail.entry.unit}</p>
              <p><strong>Patient:</strong> {detail.entry.patient_snapshot?.name || '-'}</p>
              <p><strong>Purchaser:</strong> {detail.entry.purchaser_snapshot?.name || 'Same as patient'}</p>
              <p><strong>Prescriber:</strong> {detail.entry.prescriber_snapshot?.name || '-'} ({detail.entry.prescriber_snapshot?.registrationNumber || 'no reg. no.'})</p>
              <p><strong>Cashier:</strong> {detail.entry.cashier_snapshot?.name}</p>
              <p><strong>Approved by:</strong> {detail.entry.approved_by_name} at {detail.entry.approved_at}</p>
            </div>

            {detail.entry.classification_status !== 'VERIFIED' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--warning-text)', background: 'var(--warning-light)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.82rem', marginBottom: '1rem' }}>
                <AlertTriangle size={15} /> This entry's classification is not currently VERIFIED — review required.
              </div>
            )}

            {detail.prescription && (
              <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
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
              </p>
            )}

            <h4 style={{ marginTop: '1.25rem', marginBottom: '0.5rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><History size={16} /> Audit History</h4>
            {detail.amendments.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No corrections, cancellations or reversals recorded.</p>}
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
    </div>
  );
};

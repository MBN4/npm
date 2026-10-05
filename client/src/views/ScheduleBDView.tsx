import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  ClipboardList, Search, Printer, Download, ShieldCheck, ShieldAlert, AlertTriangle,
  CheckCircle2, XCircle, History, FileText, X
} from 'lucide-react';

type Tab = 'ALL' | 'B' | 'D' | 'PENDING_REVIEW' | 'CORRECTIONS' | 'CLASSIFICATION_REVIEW';

const TABS: { id: Tab; label: string }[] = [
  { id: 'ALL', label: 'All Entries' },
  { id: 'B', label: 'Schedule B' },
  { id: 'D', label: 'Schedule D' },
  { id: 'PENDING_REVIEW', label: 'Pending Review' },
  { id: 'CORRECTIONS', label: 'Corrections & Reversals' },
  { id: 'CLASSIFICATION_REVIEW', label: 'Classification Review' }
];

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ClipboardList size={22} /> Schedule B & D Register
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-secondary" onClick={handleExportCsv}><Download size={16} /> Export CSV</button>
          <button className="btn-secondary" onClick={handlePrintAll}><Printer size={16} /> Print (A4 Landscape)</button>
        </div>
      </div>

      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(250, 204, 21, 0.08)', border: '1px solid rgba(250, 204, 21, 0.3)', borderRadius: '6px' }}>
        Software-generated register and export — a dispensing record for this pharmacy's own use, not a certified regulatory register format. Only pharmacist-verified classifications gate dispensing; unverified draft entries never control a sale.
      </div>

      {errorMessage && <div style={{ padding: '0.6rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: '6px', marginBottom: '0.5rem' }}>{errorMessage} <button onClick={() => setErrorMessage(null)}><X size={14} /></button></div>}
      {infoMessage && <div style={{ padding: '0.6rem', background: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: '6px', marginBottom: '0.5rem' }}>{infoMessage} <button onClick={() => setInfoMessage(null)}><X size={14} /></button></div>}

      <div style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid var(--border)', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '0.5rem 0.9rem', border: 'none', borderBottom: activeTab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
              background: 'transparent', color: activeTab === t.id ? 'var(--primary)' : 'var(--text-muted)', fontWeight: activeTab === t.id ? 600 : 400, cursor: 'pointer'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab !== 'CLASSIFICATION_REVIEW' ? (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div style={{ position: 'relative', flex: '1 1 260px' }}>
              <Search size={15} style={{ position: 'absolute', left: 8, top: 10, color: 'var(--text-muted)' }} />
              <input
                placeholder="Search serial, invoice, patient, purchaser, prescriber, medicine, generic, batch..."
                value={filters.q}
                onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
                style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 1.8rem' }}
              />
            </div>
            <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
            <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
            <input placeholder="Branch" value={filters.branch} onChange={e => setFilters(f => ({ ...f, branch: e.target.value }))} style={{ width: '140px' }} />
            <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">Any Status</option>
              <option value="COMPLETED">Completed</option>
              <option value="CORRECTED">Corrected</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="REVERSED">Reversed</option>
              <option value="MANUAL">Manual</option>
            </select>
          </div>

          <div className="card printable-register-list" style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Serial</th><th>Schedule</th><th>Invoice</th><th>Medicine</th><th>Patient</th>
                  <th>Qty</th><th>Cashier</th><th>Approved By</th><th>Status</th><th>Dispensed At</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={10} style={{ textAlign: 'center', padding: '1rem' }}>Loading...</td></tr>}
                {!isLoading && entries.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>No register entries found.</td></tr>}
                {entries.map(e => (
                  <tr key={e.id} onClick={() => openDetail(e)} style={{ cursor: 'pointer' }}>
                    <td>{e.serial_number}</td>
                    <td>{e.schedule}</td>
                    <td>{e.invoice_number}</td>
                    <td>{e.medicine_snapshot?.brandName}{e.medicine_snapshot?.strength ? ` ${e.medicine_snapshot.strength}` : ''}</td>
                    <td>{e.patient_snapshot?.name || '-'}</td>
                    <td>{e.dispensed_quantity}</td>
                    <td>{e.cashier_name || '-'}</td>
                    <td>{e.approved_by_name || '-'}</td>
                    <td>{e.status}{e.classification_status !== 'VERIFIED' ? ' ⚠' : ''}</td>
                    <td>{e.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div>
          {importLog.map((log: any) => (
            <div key={log.id} style={{ padding: '0.6rem', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '6px', marginBottom: '0.5rem', fontSize: '0.8rem' }}>
              <strong>Import notice:</strong> {log.summary}<br />
              <span style={{ color: 'var(--text-muted)' }}>{log.gaps_note}</span>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <input placeholder="Search substance / group..." value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} style={{ flex: 1 }} />
            <select value={classificationFilter} onChange={e => setClassificationFilter(e.target.value as any)}>
              <option value="ALL">All Statuses</option>
              <option value="DRAFT_UNVERIFIED">Draft / Unverified</option>
              <option value="PENDING_REVIEW">Pending Review</option>
              <option value="VERIFIED">Verified</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr><th>Name / Group</th><th>Schedule</th><th>Jurisdiction</th><th>Status</th><th>Flag</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {classifications.map((c: any) => (
                  <tr key={c.id}>
                    <td>{c.substance_name || c.group_description}</td>
                    <td>{c.schedule}</td>
                    <td>{c.jurisdiction}</td>
                    <td>{c.verification_status}</td>
                    <td>{c.suspected_error_flag ? <span title={c.suspected_error_note}><AlertTriangle size={15} color="#f59e0b" /></span> : '-'}</td>
                    <td style={{ display: 'flex', gap: '0.3rem' }}>
                      {hasPermission('manage_drug_classification') && c.verification_status !== 'VERIFIED' && (
                        <button className="btn-secondary" title="Verify" onClick={() => handleVerify(c.id, 'VERIFIED')}><ShieldCheck size={14} /></button>
                      )}
                      {hasPermission('manage_drug_classification') && c.verification_status !== 'REJECTED' && (
                        <button className="btn-secondary" title="Reject" onClick={() => handleVerify(c.id, 'REJECTED')}><ShieldAlert size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedEntry && detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card printable-register-detail" style={{ width: '720px', maxHeight: '85vh', overflowY: 'auto', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3>{detail.entry.serial_number}</h3>
              <button onClick={() => { setSelectedEntry(null); setDetail(null); }}><X size={18} /></button>
            </div>

            <p><strong>Schedule:</strong> {detail.entry.schedule} &nbsp; <strong>Status:</strong> {detail.entry.status} &nbsp; <strong>Rule version:</strong> {detail.entry.rule_version}</p>
            <p><strong>Invoice:</strong> {detail.entry.invoice_number} &nbsp; <strong>Branch:</strong> {detail.entry.branch} / {detail.entry.pos_counter}</p>
            <p><strong>Medicine:</strong> {detail.entry.medicine_snapshot?.brandName} ({detail.entry.medicine_snapshot?.genericName}) {detail.entry.medicine_snapshot?.strength} - {detail.entry.medicine_snapshot?.dosageForm}</p>
            <p><strong>Batch:</strong> {detail.entry.batch_number_snapshot} &nbsp; <strong>Expiry:</strong> {detail.entry.expiry_date_snapshot} &nbsp; <strong>Qty:</strong> {detail.entry.dispensed_quantity} {detail.entry.unit}</p>
            <p><strong>Patient:</strong> {detail.entry.patient_snapshot?.name || '-'} &nbsp; <strong>Purchaser:</strong> {detail.entry.purchaser_snapshot?.name || 'Same as patient'}</p>
            <p><strong>Prescriber:</strong> {detail.entry.prescriber_snapshot?.name || '-'} ({detail.entry.prescriber_snapshot?.registrationNumber || 'no reg. no.'})</p>
            <p><strong>Cashier:</strong> {detail.entry.cashier_snapshot?.name} &nbsp; <strong>Approved by:</strong> {detail.entry.approved_by_name} at {detail.entry.approved_at}</p>
            {detail.entry.classification_status !== 'VERIFIED' && (
              <p style={{ color: '#f59e0b' }}><AlertTriangle size={14} /> This entry's classification is not currently VERIFIED - review required.</p>
            )}

            {detail.prescription && (
              <p>
                <FileText size={14} /> Prescription #{detail.prescription.id}
                {detail.hasAttachment && (
                  <> — <a href="#" onClick={async (ev) => {
                    ev.preventDefault();
                    const res = await fetch(`/api/prescriptions/${detail.prescription.id}/attachment`, { headers: authHeaders });
                    if (res.ok) {
                      const blob = await res.blob();
                      window.open(URL.createObjectURL(blob), '_blank');
                    }
                  }}>view attachment</a></>
                )}
              </p>
            )}

            <h4 style={{ marginTop: '1rem' }}><History size={15} /> Audit History</h4>
            {detail.amendments.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No corrections, cancellations or reversals recorded.</p>}
            {detail.amendments.map((a: any) => (
              <div key={a.id} style={{ fontSize: '0.82rem', padding: '0.4rem 0', borderBottom: '1px dashed var(--border)' }}>
                <strong>{a.amendment_type}</strong> by {a.author_name} at {a.created_at} — {a.reason}
              </div>
            ))}

            {detail.returnLinks.length > 0 && (
              <>
                <h4 style={{ marginTop: '1rem' }}>Linked Returns</h4>
                {detail.returnLinks.map((r: any) => (
                  <div key={r.id} style={{ fontSize: '0.82rem' }}>{r.return_number} — {r.quantity_returned} unit(s) returned ({r.return_status})</div>
                ))}
              </>
            )}

            {hasPermission('amend_scheduled_register') && detail.entry.status === 'COMPLETED' && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button className="btn-secondary" onClick={() => handleAmend('amend')}>Record Correction</button>
                <button className="btn-secondary" onClick={() => handleAmend('cancel')}><XCircle size={14} /> Cancel Entry</button>
                <button className="btn-secondary" onClick={() => handleAmend('reverse')}><CheckCircle2 size={14} /> Reverse Entry</button>
              </div>
            )}

            <div style={{ marginTop: '1rem', textAlign: 'right' }}>
              <button className="btn-secondary" onClick={() => window.print()}><Printer size={15} /> Print this entry</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

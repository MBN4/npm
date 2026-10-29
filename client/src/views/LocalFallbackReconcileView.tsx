import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  CloudUpload,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  LogIn,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  Info,
  ShieldAlert
} from 'lucide-react';

// --- Types mirroring server/src/services/localFallbackReconcileService.ts ---

interface Reconciliation {
  status: 'PENDING' | 'SENT' | 'SKIPPED' | 'FAILED';
  cloud_id: number | null;
  error_message: string | null;
}

interface PendingCustomer {
  id: number;
  name: string;
  mobile: string | null;
  cnic: string | null;
  created_at: string;
  reconciliation: Reconciliation;
}

interface PendingPurchase {
  id: number;
  invoice_number: string;
  supplier_name: string;
  total_amount: number;
  created_at: string;
  items: any[];
  reconciliation: Reconciliation;
}

interface PendingSale {
  id: number;
  invoice_number: string;
  customer_name: string | null;
  total_amount: number;
  created_at: string;
  items: any[];
  reconciliation: Reconciliation;
}

interface PendingRecords {
  customers: PendingCustomer[];
  purchases: PendingPurchase[];
  sales: PendingSale[];
}

interface SyncStatus {
  lastCleanSyncAt: string | null;
  isDirty: boolean;
  dirtyReason: string | null;
}

type Decision = 'send' | 'skip' | 'later';
type Table = 'customers' | 'purchases' | 'sales';

function decisionKey(table: Table, id: number) {
  return `${table}:${id}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never synced yet';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function friendlyError(message: string | null): string {
  if (!message) return '';
  if (/schedule\s*b\s*\/?\s*d|schedule b|schedule d|prescription/i.test(message)) {
    return `${message} — this sale needs to be re-entered manually through the normal Schedule B/D dispensing flow.`;
  }
  return message;
}

const StatusBadge: React.FC<{ status: Reconciliation['status']; error?: string | null }> = ({ status, error }) => {
  if (status === 'SENT') {
    return (
      <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
        <CheckCircle2 size={12} /> SENT
      </span>
    );
  }
  if (status === 'SKIPPED') {
    return (
      <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
        <Ban size={12} /> SKIPPED
      </span>
    );
  }
  if (status === 'FAILED') {
    return (
      <span className="badge badge-danger" title={error || ''} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
        <XCircle size={12} /> FAILED
      </span>
    );
  }
  return (
    <span
      className="badge"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
        backgroundColor: 'var(--bg-surface-elevated)', color: 'var(--text-muted)', borderColor: 'var(--border)'
      }}
    >
      <Clock size={12} /> PENDING
    </span>
  );
};

const DecisionControl: React.FC<{
  value: Decision;
  onChange: (d: Decision) => void;
}> = ({ value, onChange }) => (
  <div style={{ display: 'flex', gap: '0.25rem' }}>
    {(['send', 'skip', 'later'] as Decision[]).map(opt => (
      <button
        key={opt}
        type="button"
        onClick={() => onChange(opt)}
        className={`btn btn-sm ${value === opt ? 'btn-primary' : 'btn-secondary'}`}
        style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}
      >
        {opt === 'send' ? 'Send' : opt === 'skip' ? 'Skip' : 'Decide later'}
      </button>
    ))}
  </div>
);

export const LocalFallbackReconcileView: React.FC = () => {
  const { token } = useAuth();

  const [unavailable, setUnavailable] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [pending, setPending] = useState<PendingRecords | null>(null);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);

  // Cloud login state (never persisted beyond this component's lifetime)
  const [cloudBaseUrl, setCloudBaseUrl] = useState(() => {
    try {
      return localStorage.getItem('nmp_cloud_base_url') || '';
    } catch {
      return '';
    }
  });
  const [cloudUsername, setCloudUsername] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [cloudToken, setCloudToken] = useState<string | null>(null);
  const [cloudLoginError, setCloudLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Decisions keyed by "table:id"
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastResults, setLastResults] = useState<Record<string, { status: string; error: string | null }>>({});

  const fetchSyncStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch('/api/local-fallback/sync-status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 404) {
        setUnavailable(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data);
        setUnavailable(false);
      }
    } catch {
      setUnavailable(true);
    } finally {
      setIsLoadingStatus(false);
    }
  }, [token]);

  const fetchPending = useCallback(async () => {
    setIsLoadingPending(true);
    try {
      const res = await fetch('/api/local-fallback/pending', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 404) {
        setUnavailable(true);
        return;
      }
      if (res.ok) {
        const data: PendingRecords = await res.json();
        setPending(data);

        // Initialize decisions for any row that doesn't have one yet
        setDecisions(prev => {
          const next = { ...prev };
          const seed = (rows: { id: number; reconciliation: Reconciliation }[], table: Table) => {
            for (const row of rows) {
              const key = decisionKey(table, row.id);
              if (next[key] !== undefined) continue;
              if (row.reconciliation.status === 'PENDING') next[key] = 'send';
              else if (row.reconciliation.status === 'FAILED') next[key] = 'later';
            }
          };
          seed(data.customers, 'customers');
          seed(data.purchases, 'purchases');
          seed(data.sales, 'sales');
          return next;
        });
      }
    } catch {
      setUnavailable(true);
    } finally {
      setIsLoadingPending(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSyncStatus();
    fetchPending();
  }, [fetchSyncStatus, fetchPending]);

  const handleCloudLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCloudLoginError(null);
    setIsLoggingIn(true);
    try {
      const base = cloudBaseUrl.replace(/\/$/, '');
      let res: Response;
      try {
        res = await fetch(`${base}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: cloudUsername, password: cloudPassword })
        });
      } catch (networkErr: any) {
        setCloudLoginError(`Could not reach the cloud system at that address. ${networkErr?.message || ''}`.trim());
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCloudLoginError(data.error || `Login failed (HTTP ${res.status}). Check the username and password.`);
        return;
      }
      if (!data.token) {
        setCloudLoginError('Cloud system did not return a login token. Check the address is correct.');
        return;
      }

      setCloudToken(data.token);
      try {
        localStorage.setItem('nmp_cloud_base_url', base);
      } catch {
        // ignore — this is only a convenience, never required
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const toggleExpand = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const setDecision = (table: Table, id: number, d: Decision) => {
    setDecisions(prev => ({ ...prev, [decisionKey(table, id)]: d }));
  };

  const buildActionLists = () => {
    const send: { table: Table; localId: number }[] = [];
    const skip: { table: Table; localId: number }[] = [];
    if (!pending) return { send, skip };

    const walk = (rows: { id: number; reconciliation: Reconciliation }[], table: Table) => {
      for (const row of rows) {
        if (row.reconciliation.status === 'SENT' || row.reconciliation.status === 'SKIPPED') continue;
        const d = decisions[decisionKey(table, row.id)];
        if (d === 'send') send.push({ table, localId: row.id });
        else if (d === 'skip') skip.push({ table, localId: row.id });
      }
    };
    walk(pending.customers, 'customers');
    walk(pending.purchases, 'purchases');
    walk(pending.sales, 'sales');
    return { send, skip };
  };

  const { send: sendActions, skip: skipActions } = buildActionLists();
  const hasAnyAction = sendActions.length > 0 || skipActions.length > 0;

  const handleSend = async () => {
    if (!cloudToken) return;
    setIsSending(true);
    setSendError(null);
    try {
      const res = await fetch('/api/local-fallback/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          cloudBaseUrl: cloudBaseUrl.replace(/\/$/, ''),
          cloudToken,
          send: sendActions,
          skip: skipActions
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(data.error || `Reconciliation failed (HTTP ${res.status}).`);
        return;
      }
      const results: Record<string, { status: string; error: string | null }> = {};
      for (const r of data.results || []) {
        results[decisionKey(r.table, r.localId)] = { status: r.status, error: r.error };
      }
      setLastResults(results);
    } catch (err: any) {
      setSendError(err?.message || 'Network error while sending to the cloud.');
    } finally {
      setIsSending(false);
      await Promise.all([fetchPending(), fetchSyncStatus()]);
    }
  };

  if (unavailable) {
    return (
      <div className="page-container">
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <Info size={32} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.5rem' }}>Not Available Here</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            This screen is only available on the offline-backup instance. It has nothing to reconcile
            on the regular cloud system.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Outage Reconciliation</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Review what happened on this offline-backup instance during an outage, then send approved
            records to the cloud.
          </p>
        </div>
        <button onClick={() => { fetchSyncStatus(); fetchPending(); }} className="btn btn-secondary btn-sm" disabled={isLoadingStatus || isLoadingPending}>
          <RefreshCw size={14} className={isLoadingStatus || isLoadingPending ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Status banner */}
      <div
        className="card"
        style={{
          padding: '1rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.75rem',
          borderLeft: `4px solid ${syncStatus?.isDirty ? 'var(--warning)' : 'var(--success)'}`
        }}
      >
        {syncStatus?.isDirty ? (
          <ShieldAlert size={22} style={{ color: 'var(--warning-text, #f59e0b)', flexShrink: 0, marginTop: '0.1rem' }} />
        ) : (
          <CheckCircle2 size={22} style={{ color: 'var(--success-text, #10b981)', flexShrink: 0, marginTop: '0.1rem' }} />
        )}
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>
            {syncStatus?.isDirty
              ? 'This backup instance has local activity that hasn’t been reviewed yet.'
              : 'No outage-time records are waiting for review. This instance is in sync with the cloud.'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Last synced with cloud: {formatDate(syncStatus?.lastCleanSyncAt ?? null)}
          </div>
          {syncStatus?.isDirty && syncStatus.dirtyReason && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontStyle: 'italic' }}>
              Technical detail: {syncStatus.dirtyReason}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: '0.75rem 1rem', marginBottom: '1.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center', backgroundColor: 'var(--bg-surface-elevated)' }}>
        <Info size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          New patients and purchases are always sent before sales, regardless of the order you check them in,
          because a sale may depend on a patient or a newly-purchased batch existing on the cloud first.
        </span>
      </div>

      {/* Step 1: Cloud login */}
      {!cloudToken ? (
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem', maxWidth: '480px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <LogIn size={16} /> Step 1: Log into the Cloud System
          </h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.9rem' }}>
            This backup instance uses a separate login from the cloud system. Log in to the cloud here so
            records can be sent there — this login is used only for this session and is never saved.
          </p>
          <form onSubmit={handleCloudLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <input
              className="input"
              placeholder="https://your-pharmacy.vercel.app"
              value={cloudBaseUrl}
              onChange={e => setCloudBaseUrl(e.target.value)}
              required
            />
            <input
              className="input"
              placeholder="Cloud username"
              value={cloudUsername}
              onChange={e => setCloudUsername(e.target.value)}
              required
            />
            <input
              className="input"
              type="password"
              placeholder="Cloud password"
              value={cloudPassword}
              onChange={e => setCloudPassword(e.target.value)}
              required
            />
            {cloudLoginError && (
              <div style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>{cloudLoginError}</div>
            )}
            <button type="submit" className="btn btn-primary" disabled={isLoggingIn}>
              {isLoggingIn ? 'Logging in…' : 'Log in to Cloud'}
            </button>
          </form>
        </div>
      ) : (
        <div className="card" style={{ padding: '0.75rem 1rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <CheckCircle2 size={16} style={{ color: 'var(--success-text, #10b981)' }} />
            Logged into cloud at <strong>{cloudBaseUrl}</strong>
          </span>
          <button className="btn btn-secondary btn-sm" onClick={() => setCloudToken(null)}>
            Log out of cloud
          </button>
        </div>
      )}

      {/* Step 2 & 3: Review and send */}
      {cloudToken && pending && (
        <>
          <RecordSection
            title="New Patients"
            icon="customers"
            emptyLabel="No new patients registered during an outage."
            rows={pending.customers}
            table="customers"
            decisions={decisions}
            setDecision={setDecision}
            lastResults={lastResults}
            renderRow={(c: PendingCustomer) => (
              <>
                <td style={{ fontWeight: 700 }}>{c.name}</td>
                <td>{c.mobile || '—'}</td>
                <td>{c.cnic || '—'}</td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{formatDate(c.created_at)}</td>
              </>
            )}
            headers={['Name', 'Mobile', 'CNIC', 'Created']}
          />

          <RecordSection
            title="Purchases"
            icon="purchases"
            emptyLabel="No purchases recorded during an outage."
            rows={pending.purchases}
            table="purchases"
            decisions={decisions}
            setDecision={setDecision}
            lastResults={lastResults}
            expandable
            expanded={expanded}
            toggleExpand={toggleExpand}
            renderRow={(p: PendingPurchase) => (
              <>
                <td style={{ fontWeight: 700 }}>{p.invoice_number}</td>
                <td>{p.supplier_name}</td>
                <td>Rs. {Number(p.total_amount).toFixed(2)}</td>
                <td>{p.items?.length ?? 0}</td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{formatDate(p.created_at)}</td>
              </>
            )}
            headers={['Invoice #', 'Supplier', 'Total', 'Items', 'Created']}
            renderExpanded={(p: PendingPurchase) => (
              <ItemsTable
                items={p.items}
                columns={['medicine_id', 'batch_number', 'quantity', 'purchase_price', 'sale_price', 'expiry_date']}
              />
            )}
          />

          <RecordSection
            title="Sales"
            icon="sales"
            emptyLabel="No sales recorded during an outage."
            rows={pending.sales}
            table="sales"
            decisions={decisions}
            setDecision={setDecision}
            lastResults={lastResults}
            expandable
            expanded={expanded}
            toggleExpand={toggleExpand}
            renderRow={(s: PendingSale) => (
              <>
                <td style={{ fontWeight: 700 }}>{s.invoice_number}</td>
                <td>{s.customer_name || 'Walk-in'}</td>
                <td>Rs. {Number(s.total_amount).toFixed(2)}</td>
                <td>{s.items?.length ?? 0}</td>
                <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{formatDate(s.created_at)}</td>
              </>
            )}
            headers={['Invoice #', 'Customer', 'Total', 'Items', 'Created']}
            renderExpanded={(s: PendingSale) => (
              <ItemsTable
                items={s.items}
                columns={['medicine_id', 'batch_id', 'quantity', 'unit_price', 'discount', 'line_total']}
              />
            )}
          />

          {sendError && (
            <div className="card" style={{ padding: '0.9rem 1rem', marginBottom: '1rem', borderLeft: '4px solid var(--danger)', color: 'var(--danger)', fontSize: '0.85rem' }}>
              {sendError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button
              className="btn btn-primary"
              disabled={isSending || !hasAnyAction}
              onClick={handleSend}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem', padding: '0.7rem 1.4rem' }}
            >
              <CloudUpload size={18} />
              {isSending ? 'Sending to Cloud…' : `Send Approved Records to Cloud (${sendActions.length} send, ${skipActions.length} skip)`}
            </button>
          </div>
        </>
      )}

      {!cloudToken && pending && (pending.customers.length + pending.purchases.length + pending.sales.length > 0) && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          Log into the cloud system above to review and send {pending.customers.length + pending.purchases.length + pending.sales.length} pending record(s).
        </p>
      )}
    </div>
  );
};

// --- Shared sub-components ---

interface RecordSectionProps<T extends { id: number; reconciliation: Reconciliation }> {
  title: string;
  icon: string;
  emptyLabel: string;
  rows: T[];
  table: Table;
  decisions: Record<string, Decision>;
  setDecision: (table: Table, id: number, d: Decision) => void;
  lastResults: Record<string, { status: string; error: string | null }>;
  renderRow: (row: T) => React.ReactNode;
  headers: string[];
  expandable?: boolean;
  expanded?: Record<string, boolean>;
  toggleExpand?: (key: string) => void;
  renderExpanded?: (row: T) => React.ReactNode;
}

function RecordSection<T extends { id: number; reconciliation: Reconciliation }>({
  title, emptyLabel, rows, table, decisions, setDecision, lastResults, renderRow, headers,
  expandable, expanded, toggleExpand, renderExpanded
}: RecordSectionProps<T>) {
  return (
    <div className="card" style={{ padding: 0, marginBottom: '1.25rem' }}>
      <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: '0.95rem' }}>
        {title} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.8rem' }}>({rows.length})</span>
      </div>
      <div className="table-container" style={{ border: 'none' }}>
        <table>
          <thead>
            <tr>
              {expandable && <th style={{ width: '28px' }}></th>}
              {headers.map(h => <th key={h}>{h}</th>)}
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={headers.length + 2 + (expandable ? 1 : 0)} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              rows.map(row => {
                const key = decisionKey(table, row.id);
                const settled = row.reconciliation.status === 'SENT' || row.reconciliation.status === 'SKIPPED';
                const freshResult = lastResults[key];
                const effectiveStatus = (freshResult?.status as Reconciliation['status']) || row.reconciliation.status;
                const effectiveError = freshResult?.error ?? row.reconciliation.error_message;
                const isOpen = expanded?.[key];

                return (
                  <React.Fragment key={key}>
                    <tr>
                      {expandable && (
                        <td>
                          <button
                            className="btn btn-sm"
                            style={{ padding: '0.2rem' }}
                            onClick={() => toggleExpand && toggleExpand(key)}
                          >
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </td>
                      )}
                      {renderRow(row)}
                      <td>
                        <StatusBadge status={effectiveStatus} error={effectiveError} />
                        {effectiveStatus === 'FAILED' && effectiveError && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '0.2rem', maxWidth: '260px' }}>
                            {friendlyError(effectiveError)}
                          </div>
                        )}
                      </td>
                      <td>
                        {settled ? (
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Settled</span>
                        ) : (
                          <DecisionControl
                            value={decisions[key] || 'later'}
                            onChange={d => setDecision(table, row.id, d)}
                          />
                        )}
                      </td>
                    </tr>
                    {expandable && isOpen && (
                      <tr>
                        <td colSpan={headers.length + 2 + 1} style={{ backgroundColor: 'var(--bg-surface-elevated)', padding: '0.75rem 1rem' }}>
                          {renderExpanded ? renderExpanded(row) : null}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const ItemsTable: React.FC<{ items: any[]; columns: string[] }> = ({ items, columns }) => {
  if (!items || items.length === 0) {
    return <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No line items.</span>;
  }
  return (
    <table style={{ fontSize: '0.8rem' }}>
      <thead>
        <tr>{columns.map(c => <th key={c}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {items.map((it, idx) => (
          <tr key={idx}>
            {columns.map(c => <td key={c}>{it[c] ?? '—'}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

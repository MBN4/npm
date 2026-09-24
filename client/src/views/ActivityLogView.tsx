import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  History,
  ShoppingCart,
  Users,
  Banknote,
  Boxes,
  Search,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Minus
} from 'lucide-react';

interface ActivityRecord {
  record_type: 'SALE' | 'UDHAAR' | 'CASHOUT' | 'STOCK';
  record_id: number;
  occurred_at: string;
  primary_label: string;
  secondary_label: string | null;
  amount: number;
  direction: 'IN' | 'OUT' | 'NEUTRAL';
  user_name: string | null;
  status: string | null;
  extra_note: string | null;
  ref_code: string | null;
}

interface ActivitySummary {
  todaySales: { total: number; count: number };
  todayUdhaar: { given: number; received: number };
  todayCashout: { total: number; count: number };
  todayStock: { count: number };
}

const TYPE_CONFIG: Record<ActivityRecord['record_type'], { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  SALE: { label: 'Bills / POS Sales', icon: <ShoppingCart size={16} />, color: '#2563eb', bg: 'rgba(37, 99, 235, 0.12)' },
  UDHAAR: { label: 'Udhaar (Credit)', icon: <Users size={16} />, color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.12)' },
  CASHOUT: { label: 'Cash Out', icon: <Banknote size={16} />, color: '#dc2626', bg: 'rgba(220, 38, 38, 0.12)' },
  STOCK: { label: 'Stock Movements', icon: <Boxes size={16} />, color: '#0d9488', bg: 'rgba(13, 148, 136, 0.12)' }
};

const ALL_TYPES: ActivityRecord['record_type'][] = ['SALE', 'UDHAAR', 'CASHOUT', 'STOCK'];
const PAGE_SIZE = 30;

function formatMoney(n: number): string {
  return `Rs. ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateHeader(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export const ActivityLogView: React.FC = () => {
  const { token } = useAuth();
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [activeTypes, setActiveTypes] = useState<Set<ActivityRecord['record_type']>>(new Set(ALL_TYPES));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');

  const buildParams = (offset: number) => {
    const params = new URLSearchParams();
    if (activeTypes.size > 0 && activeTypes.size < ALL_TYPES.length) {
      params.set('types', Array.from(activeTypes).join(','));
    }
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (search.trim()) params.set('search', search.trim());
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    return params.toString();
  };

  const fetchFeed = async (offset: number, append: boolean) => {
    if (append) setIsLoadingMore(true); else setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/activity/feed?${buildParams(offset)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load activity feed');
      setRecords(prev => (append ? [...prev, ...data.records] : data.records));
      setTotal(data.total);
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const res = await fetch('/api/activity/summary', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setSummary(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [token]);

  useEffect(() => {
    fetchFeed(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeTypes, startDate, endDate, search]);

  const toggleType = (type: ActivityRecord['record_type']) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size === 1) return next; // keep at least one selected
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const selectAllTypes = () => setActiveTypes(new Set(ALL_TYPES));

  const groupedByDate = useMemo(() => {
    const groups: { dateKey: string; records: ActivityRecord[] }[] = [];
    for (const r of records) {
      const dateKey = new Date(r.occurred_at).toDateString();
      const existing = groups.find(g => g.dateKey === dateKey);
      if (existing) existing.records.push(r);
      else groups.push({ dateKey, records: [r] });
    }
    return groups;
  }, [records]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchDraft);
  };

  const statCards = [
    {
      label: "Today's Bills",
      value: summary ? formatMoney(summary.todaySales.total) : '—',
      sub: summary ? `${summary.todaySales.count} invoice(s)` : '',
      icon: <ShoppingCart size={20} />,
      color: '#2563eb'
    },
    {
      label: 'Udhaar Given / Received',
      value: summary ? `${formatMoney(summary.todayUdhaar.given)} / ${formatMoney(summary.todayUdhaar.received)}` : '—',
      sub: 'Today',
      icon: <Users size={20} />,
      color: '#7c3aed'
    },
    {
      label: "Today's Cash Out",
      value: summary ? formatMoney(summary.todayCashout.total) : '—',
      sub: summary ? `${summary.todayCashout.count} transaction(s)` : '',
      icon: <Banknote size={20} />,
      color: '#dc2626'
    },
    {
      label: 'Stock Movements',
      value: summary ? String(summary.todayStock.count) : '—',
      sub: 'Today',
      icon: <Boxes size={20} />,
      color: '#0d9488'
    }
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <History size={22} style={{ color: 'var(--primary)' }} />
            Activity Log
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Every bill, Udhaar entry, cash-out and stock movement in one unified timeline
          </p>
        </div>
        <button onClick={() => { fetchSummary(); fetchFeed(0, false); }} className="btn btn-secondary btn-sm" disabled={isLoading} style={{ height: '36px' }}>
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        {statCards.map((card, idx) => (
          <div key={idx} className="card" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: `${card.color}1f`, color: card.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {card.icon}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{card.label}</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.value}</div>
              {card.sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{card.sub}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.85rem', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={selectAllTypes}
            className={`btn btn-sm ${activeTypes.size === ALL_TYPES.length ? 'btn-primary' : 'btn-secondary'}`}
          >
            All
          </button>
          {ALL_TYPES.map(type => {
            const cfg = TYPE_CONFIG[type];
            const active = activeTypes.has(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                className="btn btn-sm"
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  backgroundColor: active ? cfg.bg : 'var(--bg-app)',
                  color: active ? cfg.color : 'var(--text-muted)',
                  border: `1px solid ${active ? cfg.color + '55' : 'var(--border)'}`,
                  fontWeight: 700
                }}
              >
                {cfg.icon}
                <span>{cfg.label}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
          <input type="date" className="input input-sm" style={{ height: '32px' }} value={startDate} onChange={e => setStartDate(e.target.value)} />
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>to</span>
          <input type="date" className="input input-sm" style={{ height: '32px' }} value={endDate} onChange={e => setEndDate(e.target.value)} />
          <form onSubmit={handleSearchSubmit} style={{ position: 'relative', width: '220px' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input input-sm"
              style={{ paddingLeft: '2rem', height: '32px', width: '100%' }}
              placeholder="Search invoice, name, ref..."
              value={searchDraft}
              onChange={e => setSearchDraft(e.target.value)}
            />
          </form>
        </div>
      </div>

      {errorMessage && (
        <div style={{ padding: '0.75rem 1rem', background: 'var(--danger-light)', color: 'var(--danger-text)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.85rem' }}>
          {errorMessage}
        </div>
      )}

      {/* Feed */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {isLoading ? (
          <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading activity...</div>
        ) : groupedByDate.length === 0 ? (
          <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No activity found for the selected filters.
          </div>
        ) : (
          groupedByDate.map(group => (
            <div key={group.dateKey}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem', paddingLeft: '0.15rem' }}>
                {formatDateHeader(group.records[0].occurred_at)}
              </div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {group.records.map((r, idx) => {
                  const cfg = TYPE_CONFIG[r.record_type];
                  const dirColor = r.direction === 'IN' ? 'var(--success, #16a34a)' : r.direction === 'OUT' ? 'var(--danger, #dc2626)' : 'var(--text-muted)';
                  const DirIcon = r.direction === 'IN' ? ArrowUpRight : r.direction === 'OUT' ? ArrowDownRight : Minus;
                  const time = new Date(r.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div
                      key={`${r.record_type}-${r.record_id}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.85rem 1.1rem',
                        borderBottom: idx === group.records.length - 1 ? 'none' : '1px solid var(--border)'
                      }}
                    >
                      <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: cfg.bg, color: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {cfg.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.primary_label}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.secondary_label}{r.extra_note ? ` • ${r.extra_note}` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', justifyContent: 'flex-end', fontWeight: 800, fontSize: '0.88rem', color: dirColor }}>
                          <DirIcon size={13} />
                          <span>{r.record_type === 'STOCK' ? `${Math.abs(r.amount)} unit(s)` : formatMoney(Math.abs(r.amount))}</span>
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          {time}{r.user_name ? ` • ${r.user_name}` : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {!isLoading && records.length < total && (
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={() => fetchFeed(records.length, true)}
              className="btn btn-secondary"
              disabled={isLoadingMore}
            >
              {isLoadingMore ? 'Loading...' : `Load More (${records.length} of ${total})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

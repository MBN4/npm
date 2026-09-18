import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  Wallet,
  PlusCircle,
  MinusCircle,
  Receipt,
  AlertCircle,
  CheckCircle2,
  Moon,
  Printer,
  History,
  ArrowUpRight,
  ArrowDownLeft,
  X
} from 'lucide-react';

interface BalanceViewProps {
  hideHeader?: boolean;
}

export const BalanceView: React.FC<BalanceViewProps> = ({ hideHeader = false }) => {
  const { token, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Active view tab: 'overview' | 'closings_history'
  const [subTab, setSubTab] = useState<'overview' | 'closings_history'>('overview');

  // Ledger & Balance Data
  const [cashbookEntries, setCashbookEntries] = useState<any[]>([]);
  const [cashbookSummary, setCashbookSummary] = useState<any>(null);
  const [dailyRegister, setDailyRegister] = useState<any>(null);

  // Filters
  const [filter, setFilter] = useState({
    category: '',
    entryType: '',
    startDate: '',
    endDate: ''
  });

  // Closings History
  const [closingsHistory, setClosingsHistory] = useState<any[]>([]);
  const [historyFilter, setHistoryFilter] = useState({
    startDate: '',
    endDate: ''
  });

  // Modals
  const [showAddMoneyModal, setShowAddMoneyModal] = useState(false);
  const [showSubtractMoneyModal, setShowSubtractMoneyModal] = useState(false);
  const [showDayEndModal, setShowDayEndModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [selectedClosingPrint, setSelectedClosingPrint] = useState<any>(null);

  // Add Money Form
  const [addMoneyForm, setAddMoneyForm] = useState({
    category: 'OWNER_INVESTMENT',
    amount: '',
    description: '',
    payment_method: 'CASH'
  });

  // Subtract Money Form
  const [subtractMoneyForm, setSubtractMoneyForm] = useState({
    category: 'EXPENSE',
    amount: '',
    payee: '',
    description: '',
    payment_method: 'CASH'
  });

  // Day End Closing Form
  const [dayEndForm, setDayEndForm] = useState({
    actualCash: '',
    notes: ''
  });

  const printRef = useRef<HTMLDivElement>(null);

  const showNotification = (text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // 1. Fetch Live Balance & Cashbook Entries
  const fetchBalanceData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.category) params.append('category', filter.category);
      if (filter.entryType) params.append('entryType', filter.entryType);
      if (filter.startDate) params.append('startDate', filter.startDate);
      if (filter.endDate) params.append('endDate', filter.endDate);

      const res = await fetch(`/api/accounts/cashbook?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCashbookEntries(data.entries || []);
        setCashbookSummary(data.summary || null);
      }

      // Today Register Summary
      const regRes = await fetch(`/api/accounts/daily-register`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (regRes.ok) {
        const regData = await regRes.json();
        setDailyRegister(regData);
        if (regData.expectedCash !== undefined && !dayEndForm.actualCash) {
          setDayEndForm(prev => ({ ...prev, actualCash: String(regData.expectedCash) }));
        }
      }
    } catch (err: any) {
      showNotification('Failed to fetch balance data', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [token, filter, dayEndForm.actualCash]);

  // 2. Fetch Closings History
  const fetchClosingsHistory = useCallback(async () => {
    if (!token) return;
    try {
      const params = new URLSearchParams();
      if (historyFilter.startDate) params.append('startDate', historyFilter.startDate);
      if (historyFilter.endDate) params.append('endDate', historyFilter.endDate);

      const res = await fetch(`/api/accounts/daily-closings?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setClosingsHistory(data.closings || []);
      }
    } catch (err) {
      // ignore
    }
  }, [token, historyFilter]);

  useEffect(() => {
    fetchBalanceData();
  }, [fetchBalanceData]);

  useEffect(() => {
    if (subTab === 'closings_history') {
      fetchClosingsHistory();
    }
  }, [subTab, fetchClosingsHistory]);

  // Handle Add Money (+ Cash Inflow)
  const handleAddMoneySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const numAmount = Number(addMoneyForm.amount);
    if (!numAmount || numAmount <= 0) {
      showNotification('Please enter a valid amount greater than 0', 'error');
      return;
    }

    try {
      const res = await fetch('/api/accounts/cashbook/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          entry_type: 'IN',
          category: addMoneyForm.category,
          amount: numAmount,
          description: addMoneyForm.description ? `[${addMoneyForm.payment_method}] ${addMoneyForm.description.trim()}` : `Cash Inflow: ${addMoneyForm.category}`
        })
      });

      if (res.ok) {
        showNotification(`✓ Successfully added Rs. ${numAmount.toFixed(2)} to store balance`, 'success');
        setShowAddMoneyModal(false);
        setAddMoneyForm({ category: 'OWNER_INVESTMENT', amount: '', description: '', payment_method: 'CASH' });
        fetchBalanceData();
      } else {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to add cash entry');
      }
    } catch (err: any) {
      showNotification(err.message || 'Error recording cash entry', 'error');
    }
  };

  // Handle Subtract Money (- Cash Outflow / Expense)
  const handleSubtractMoneySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const numAmount = Number(subtractMoneyForm.amount);
    if (!numAmount || numAmount <= 0) {
      showNotification('Please enter a valid amount greater than 0', 'error');
      return;
    }

    try {
      const res = await fetch('/api/accounts/expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          expense_category: subtractMoneyForm.category,
          amount: numAmount,
          payment_method: subtractMoneyForm.payment_method,
          payee: subtractMoneyForm.payee.trim() || null,
          description: subtractMoneyForm.description.trim() || null
        })
      });

      if (res.ok) {
        showNotification(`✓ Successfully recorded cash outflow of Rs. ${numAmount.toFixed(2)}`, 'success');
        setShowSubtractMoneyModal(false);
        setSubtractMoneyForm({ category: 'EXPENSE', amount: '', payee: '', description: '', payment_method: 'CASH' });
        fetchBalanceData();
      } else {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to record expense entry');
      }
    } catch (err: any) {
      showNotification(err.message || 'Error recording expense entry', 'error');
    }
  };

  // Handle Perform Day-End Closing Settlement
  const handleDayEndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const actual = Number(dayEndForm.actualCash);
    if (isNaN(actual) || actual < 0) {
      showNotification('Please enter a valid actual drawer cash count', 'error');
      return;
    }

    try {
      const res = await fetch('/api/accounts/daily-closings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          closingDate: dailyRegister?.date || new Date().toISOString().split('T')[0],
          actualCash: actual,
          notes: dayEndForm.notes.trim() || null
        })
      });

      if (res.ok) {
        const resData = await res.json();
        showNotification(`✓ Day-End Settlement Completed! Variance: Rs. ${resData.summary?.variance?.toFixed(2)}`, 'success');
        setShowDayEndModal(false);
        fetchBalanceData();
        fetchClosingsHistory();
      } else {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to complete Day-End settlement');
      }
    } catch (err: any) {
      showNotification(err.message || 'Error saving Day-End settlement', 'error');
    }
  };

  // Handle Receipt Print
  const handleTriggerPrint = (closingItem?: any) => {
    const itemToPrint = closingItem || (dailyRegister?.closingRecord ? {
      closing_date: dailyRegister.date,
      opening_balance: dailyRegister.openingBalance,
      cash_sales: dailyRegister.breakdown?.cashSales,
      other_inflows: (dailyRegister.breakdown?.customerRecoveries || 0) + (dailyRegister.breakdown?.otherInflows || 0),
      operating_expenses: dailyRegister.breakdown?.operatingExpenses,
      other_outflows: (dailyRegister.breakdown?.supplierPayments || 0) + (dailyRegister.breakdown?.otherOutflows || 0),
      expected_cash: dailyRegister.expectedCash,
      actual_cash: dayEndForm.actualCash ? Number(dayEndForm.actualCash) : dailyRegister.expectedCash,
      variance: (dayEndForm.actualCash ? Number(dayEndForm.actualCash) : dailyRegister.expectedCash) - dailyRegister.expectedCash,
      closed_by_full_name: user?.fullName || user?.username,
      notes: dayEndForm.notes
    } : null);

    setSelectedClosingPrint(itemToPrint);
    setShowPrintModal(true);

    setTimeout(() => {
      if (printRef.current) {
        window.print();
      }
    }, 300);
  };

  const expectedDrawerCash = dailyRegister?.expectedCash || 0;
  const actualCountedCash = dayEndForm.actualCash !== '' ? Number(dayEndForm.actualCash) : expectedDrawerCash;
  const cashVariance = actualCountedCash - expectedDrawerCash;

  return (
    <div className="view-container">
      {/* Notifications */}
      {statusMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          padding: '12px 20px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#fff',
          fontWeight: 600,
          backgroundColor: statusMessage.type === 'success' ? '#10b981' : '#ef4444',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          {statusMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Action Toolbar or Header Banner */}
      {!hideHeader ? (
        <div className="page-header">
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Wallet style={{ color: 'var(--primary)' }} /> Store Balance & Day-End Register
            </h1>
            <p className="page-subtitle">
              Manage store cash additions, expenses, live running balance, and perform official Day-End shift settlements.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowAddMoneyModal(true)}
              className="btn btn-success"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <PlusCircle size={16} /> + Add Money (Cash In)
            </button>
            <button
              onClick={() => setShowSubtractMoneyModal(true)}
              className="btn btn-danger"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <MinusCircle size={16} /> - Subtract Money (Expense)
            </button>
            <button
              onClick={() => setShowDayEndModal(true)}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
              <Moon size={16} /> Perform Day-End Closing 🌙
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
          <button
            onClick={() => setShowAddMoneyModal(true)}
            className="btn btn-success"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <PlusCircle size={16} /> + Add Money (Cash In)
          </button>
          <button
            onClick={() => setShowSubtractMoneyModal(true)}
            className="btn btn-danger"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <MinusCircle size={16} /> - Subtract Money (Expense)
          </button>
          <button
            onClick={() => setShowDayEndModal(true)}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            <Moon size={16} /> Perform Day-End Closing 🌙
          </button>
        </div>
      )}

      {/* Balance Summary KPI Cards */}
      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '20px' }}>
        <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="stat-label">Total Cash In Drawer (Running Balance)</div>
          <div className="stat-value" style={{ color: '#10b981', fontSize: '1.8rem', fontWeight: 700 }}>
            Rs. {(cashbookSummary?.currentBalance || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Total Inflows: Rs. {(cashbookSummary?.totalIn || 0).toLocaleString('en-PK')}
          </div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid #3b82f6' }}>
          <div className="stat-label">Today Total Cash Inflow (+)</div>
          <div className="stat-value" style={{ color: '#3b82f6', fontSize: '1.8rem', fontWeight: 700 }}>
            Rs. {(cashbookSummary?.todayIn || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Sales + Recoveries + Manual Inflows
          </div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
          <div className="stat-label">Today Total Cash Outflow (-)</div>
          <div className="stat-value" style={{ color: '#ef4444', fontSize: '1.8rem', fontWeight: 700 }}>
            Rs. {(cashbookSummary?.todayOut || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Expenses + Supplier Payouts
          </div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
          <div className="stat-label">Today Net Cash Flow</div>
          <div className="stat-value" style={{ color: (cashbookSummary?.todayNet || 0) >= 0 ? '#10b981' : '#ef4444', fontSize: '1.8rem', fontWeight: 700 }}>
            Rs. {(cashbookSummary?.todayNet || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {dailyRegister?.isClosed ? '✓ Shift Settlement CLOSED' : '⏳ Shift ACTIVE (Day-End Open)'}
          </div>
        </div>
      </div>

      {/* Primary Navigation Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
        <button
          className={`btn ${subTab === 'overview' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSubTab('overview')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Receipt size={16} /> Live Transaction Ledger & Balance
        </button>
        <button
          className={`btn ${subTab === 'closings_history' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSubTab('closings_history')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <History size={16} /> Historic Day-End Shift Closings
        </button>
      </div>

      {/* TAB 1: Live Transaction Ledger & Balance */}
      {subTab === 'overview' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h3>Cash Transactions Ledger</h3>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <select
                className="input-field"
                value={filter.entryType}
                onChange={e => setFilter({ ...filter, entryType: e.target.value })}
                style={{ width: '150px' }}
              >
                <option value="">All Entry Types</option>
                <option value="IN">Cash In (+)</option>
                <option value="OUT">Cash Out (-)</option>
              </select>

              <select
                className="input-field"
                value={filter.category}
                onChange={e => setFilter({ ...filter, category: e.target.value })}
                style={{ width: '160px' }}
              >
                <option value="">All Categories</option>
                <option value="SALE">POS Sales</option>
                <option value="CUSTOMER_RECOVERY">Patient Recoveries</option>
                <option value="OWNER_INVESTMENT">Owner Capital</option>
                <option value="SUPPLIER_PAYMENT">Supplier Payout</option>
                <option value="EXPENSE">Expenses</option>
                <option value="CASH_OVERAGE">Cash Overage (+)</option>
                <option value="CASH_SHORTAGE">Cash Shortage (-)</option>
              </select>

              <input
                type="date"
                className="input-field"
                value={filter.startDate}
                onChange={e => setFilter({ ...filter, startDate: e.target.value })}
                placeholder="Start Date"
              />
              <input
                type="date"
                className="input-field"
                value={filter.endDate}
                onChange={e => setFilter({ ...filter, endDate: e.target.value })}
                placeholder="End Date"
              />
            </div>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Type</th>
                  <th>Category / Reason</th>
                  <th>Amount</th>
                  <th>Detailed Remarks / Description</th>
                  <th>Recorded By</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '30px' }}>
                      <div className="spinner" style={{ margin: '0 auto 10px' }} />
                      Loading live transaction ledger...
                    </td>
                  </tr>
                ) : cashbookEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      No cash transactions found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  cashbookEntries.map(entry => (
                    <tr key={entry.id}>
                      <td style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                        {new Date(entry.created_at).toLocaleString('en-PK', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td>
                        <span className={`badge ${entry.entry_type === 'IN' ? 'badge-success' : 'badge-danger'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {entry.entry_type === 'IN' ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                          {entry.entry_type === 'IN' ? 'IN (+)' : 'OUT (-)'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{entry.category.replace(/_/g, ' ')}</td>
                      <td style={{ fontWeight: 700, color: entry.entry_type === 'IN' ? '#10b981' : '#ef4444' }}>
                        {entry.entry_type === 'IN' ? '+' : '-'} Rs. {Number(entry.amount).toFixed(2)}
                      </td>
                      <td style={{ fontSize: '0.9rem', color: 'var(--text-main)', maxWidth: '300px' }}>
                        {entry.description || '-'}
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {entry.created_by_name || 'System'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Historic Day-End Closings */}
      {subTab === 'closings_history' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h3>Past Day-End Shift Settlements</h3>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="date"
                className="input-field"
                value={historyFilter.startDate}
                onChange={e => setHistoryFilter({ ...historyFilter, startDate: e.target.value })}
              />
              <input
                type="date"
                className="input-field"
                value={historyFilter.endDate}
                onChange={e => setHistoryFilter({ ...historyFilter, endDate: e.target.value })}
              />
            </div>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Closing Date</th>
                  <th>Opening Cash</th>
                  <th>Cash Sales</th>
                  <th>Expenses / Outflows</th>
                  <th>Expected Cash</th>
                  <th>Actual Counted Cash</th>
                  <th>Variance</th>
                  <th>Closed By</th>
                  <th>Notes</th>
                  <th>Print Receipt</th>
                </tr>
              </thead>
              <tbody>
                {closingsHistory.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      No historic day-end settlements recorded yet.
                    </td>
                  </tr>
                ) : (
                  closingsHistory.map(closing => (
                    <tr key={closing.id}>
                      <td style={{ fontWeight: 700 }}>{closing.closing_date}</td>
                      <td>Rs. {Number(closing.opening_balance).toFixed(2)}</td>
                      <td style={{ color: '#10b981' }}>Rs. {Number(closing.cash_sales).toFixed(2)}</td>
                      <td style={{ color: '#ef4444' }}>Rs. {(Number(closing.operating_expenses) + Number(closing.other_outflows) + Number(closing.supplier_payments)).toFixed(2)}</td>
                      <td style={{ fontWeight: 600 }}>Rs. {Number(closing.expected_cash).toFixed(2)}</td>
                      <td style={{ fontWeight: 700, color: '#3b82f6' }}>Rs. {Number(closing.actual_cash).toFixed(2)}</td>
                      <td>
                        <span className={`badge ${closing.variance === 0 ? 'badge-success' : closing.variance > 0 ? 'badge-info' : 'badge-danger'}`}>
                          {closing.variance === 0 ? 'Exact Match' : closing.variance > 0 ? `+ Rs. ${closing.variance.toFixed(2)} (Overage)` : `- Rs. ${Math.abs(closing.variance).toFixed(2)} (Shortage)`}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{closing.closed_by_full_name || closing.closed_by_name}</td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '200px' }}>{closing.notes || '-'}</td>
                      <td>
                        <button
                          onClick={() => handleTriggerPrint(closing)}
                          className="btn btn-outline"
                          style={{ padding: '4px 8px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Printer size={14} /> Receipt
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: + ADD MONEY (Cash Inflow) */}
      {showAddMoneyModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981' }}>
                <PlusCircle size={20} /> + Add Money (Store Cash Inflow)
              </h3>
              <button className="btn-icon" onClick={() => setShowAddMoneyModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddMoneySubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Category / Reason *</label>
                  <select
                    className="input-field"
                    value={addMoneyForm.category}
                    onChange={e => setAddMoneyForm({ ...addMoneyForm, category: e.target.value })}
                    required
                  >
                    <option value="OWNER_INVESTMENT">Owner Capital Injection / Investment</option>
                    <option value="CUSTOMER_RECOVERY">Customer / Patient Recovery Payment</option>
                    <option value="VENDOR_REFUND">Supplier / Vendor Refund</option>
                    <option value="CASH_FLOAT">Opening Cash Float Addition</option>
                    <option value="MISC_INFLOW">Other Miscellaneous Cash Inflow</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Amount (Rs.) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    className="input-field"
                    placeholder="e.g. 5000"
                    value={addMoneyForm.amount}
                    onChange={e => setAddMoneyForm({ ...addMoneyForm, amount: e.target.value })}
                    required
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Payment Mode</label>
                  <select
                    className="input-field"
                    value={addMoneyForm.payment_method}
                    onChange={e => setAddMoneyForm({ ...addMoneyForm, payment_method: e.target.value })}
                  >
                    <option value="CASH">Cash Drawer</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="JAZZCASH">JazzCash / EasyPaisa</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Detailed Description / Transaction Notes</label>
                  <textarea
                    className="input-field"
                    rows={3}
                    placeholder="Enter detailed reason (e.g. Received Rs. 5,000 cash injection from Dr. Naveed for store cash float)"
                    value={addMoneyForm.description}
                    onChange={e => setAddMoneyForm({ ...addMoneyForm, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowAddMoneyModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-success">
                  Save Cash Addition
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: - SUBTRACT MONEY (Cash Outflow / Expense) */}
      {showSubtractMoneyModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
                <MinusCircle size={20} /> - Subtract Money (Cash Outflow / Expense)
              </h3>
              <button className="btn-icon" onClick={() => setShowSubtractMoneyModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubtractMoneySubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Expense / Outflow Category *</label>
                  <select
                    className="input-field"
                    value={subtractMoneyForm.category}
                    onChange={e => setSubtractMoneyForm({ ...subtractMoneyForm, category: e.target.value })}
                    required
                  >
                    <option value="TEA_LUNCH">Daily Tea & Lunch / Refreshments</option>
                    <option value="UTILITIES">Electricity & Utility Bills</option>
                    <option value="RENT">Store Shop Rent</option>
                    <option value="PETTY_CASH">Petty Cash Outflow</option>
                    <option value="SUPPLIER_PAYOUT">Supplier Cash Payout</option>
                    <option value="MAINTENANCE">Equipment / Store Repair & Maintenance</option>
                    <option value="SALARY_ADVANCE">Staff Salary Advance / Payout</option>
                    <option value="EXPENSE">General Expense</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Amount (Rs.) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    className="input-field"
                    placeholder="e.g. 350"
                    value={subtractMoneyForm.amount}
                    onChange={e => setSubtractMoneyForm({ ...subtractMoneyForm, amount: e.target.value })}
                    required
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Payee / Recipient Name (Optional)</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Tariq Tea Shop / Electric Bill Officer"
                    value={subtractMoneyForm.payee}
                    onChange={e => setSubtractMoneyForm({ ...subtractMoneyForm, payee: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Payment Mode</label>
                  <select
                    className="input-field"
                    value={subtractMoneyForm.payment_method}
                    onChange={e => setSubtractMoneyForm({ ...subtractMoneyForm, payment_method: e.target.value })}
                  >
                    <option value="CASH">Cash Drawer</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="JAZZCASH">JazzCash / EasyPaisa</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Detailed Description / Expense Notes</label>
                  <textarea
                    className="input-field"
                    rows={3}
                    placeholder="Enter details (e.g. Paid Rs. 350 for afternoon tea and samosas for staff meeting)"
                    value={subtractMoneyForm.description}
                    onChange={e => setSubtractMoneyForm({ ...subtractMoneyForm, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowSubtractMoneyModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-danger">
                  Save Cash Outflow
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: DAY-END CLOSING SETTLEMENT WIZARD */}
      {showDayEndModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
                <Moon size={20} /> Day-End Shift Closeout & Settlement
              </h3>
              <button className="btn-icon" onClick={() => setShowDayEndModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleDayEndSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)', padding: '12px', borderRadius: '8px', fontSize: '0.88rem' }}>
                  <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>
                    Closing Date: {dailyRegister?.date || new Date().toISOString().split('T')[0]}
                  </div>
                  <div style={{ color: 'var(--text-muted)' }}>
                    System automatically calculates expected drawer cash by reconciling Opening Float + Sales + Recoveries - Outflows.
                  </div>
                </div>

                {/* Calculation Breakdown */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.9rem' }}>
                  <div style={{ padding: '8px 12px', backgroundColor: 'var(--bg-card-hover)', borderRadius: '6px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Opening Balance:</span>
                    <strong style={{ display: 'block' }}>Rs. {(dailyRegister?.openingBalance || 0).toFixed(2)}</strong>
                  </div>

                  <div style={{ padding: '8px 12px', backgroundColor: 'var(--bg-card-hover)', borderRadius: '6px' }}>
                    <span style={{ color: '#10b981' }}>Today Sales Inflow:</span>
                    <strong style={{ display: 'block', color: '#10b981' }}>+ Rs. {(dailyRegister?.breakdown?.cashSales || 0).toFixed(2)}</strong>
                  </div>

                  <div style={{ padding: '8px 12px', backgroundColor: 'var(--bg-card-hover)', borderRadius: '6px' }}>
                    <span style={{ color: '#3b82f6' }}>Recoveries & Other In:</span>
                    <strong style={{ display: 'block', color: '#3b82f6' }}>+ Rs. {((dailyRegister?.breakdown?.customerRecoveries || 0) + (dailyRegister?.breakdown?.otherInflows || 0)).toFixed(2)}</strong>
                  </div>

                  <div style={{ padding: '8px 12px', backgroundColor: 'var(--bg-card-hover)', borderRadius: '6px' }}>
                    <span style={{ color: '#ef4444' }}>Expenses & Outflows:</span>
                    <strong style={{ display: 'block', color: '#ef4444' }}>- Rs. {((dailyRegister?.breakdown?.operatingExpenses || 0) + (dailyRegister?.breakdown?.supplierPayments || 0) + (dailyRegister?.breakdown?.otherOutflows || 0)).toFixed(2)}</strong>
                  </div>
                </div>

                {/* Expected Cash in Drawer */}
                <div style={{ backgroundColor: 'var(--bg-card-hover)', padding: '12px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Expected Cash in Drawer</span>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--primary)', marginTop: '2px' }}>
                    Rs. {expectedDrawerCash.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Actual Counted Cash Input */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 700 }}>Actual Counted Cash in Drawer (Rs.) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input-field"
                    style={{ fontSize: '1.2rem', padding: '10px 14px', fontWeight: 700 }}
                    value={dayEndForm.actualCash}
                    onChange={e => setDayEndForm({ ...dayEndForm, actualCash: e.target.value })}
                    required
                  />
                </div>

                {/* Variance Display */}
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontWeight: 700,
                  backgroundColor: cashVariance === 0 ? 'rgba(16, 185, 129, 0.1)' : cashVariance > 0 ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  color: cashVariance === 0 ? '#10b981' : cashVariance > 0 ? '#3b82f6' : '#ef4444',
                  border: `1px solid ${cashVariance === 0 ? '#10b981' : cashVariance > 0 ? '#3b82f6' : '#ef4444'}`
                }}>
                  <span>Cash Variance:</span>
                  <span>
                    {cashVariance === 0 ? 'Exact Match (Rs. 0.00)' : cashVariance > 0 ? `+ Rs. ${cashVariance.toFixed(2)} (Overage)` : `- Rs. ${Math.abs(cashVariance).toFixed(2)} (Shortage)`}
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label">Day-End Closing Notes / Remarks</label>
                  <textarea
                    className="input-field"
                    rows={2}
                    placeholder="Enter closing remarks (e.g. Shift closed by Farhan Ali. Cash counted and deposited into store safe)."
                    value={dayEndForm.notes}
                    onChange={e => setDayEndForm({ ...dayEndForm, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowDayEndModal(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-outline" onClick={() => handleTriggerPrint()}>
                  <Printer size={16} /> Receipt Preview
                </button>
                <button type="submit" className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                  Submit Day-End Closing
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: PRINT RECEIPT PREVIEW */}
      {showPrintModal && selectedClosingPrint && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3><Printer size={18} /> Day-End Closing Receipt</h3>
              <button className="btn-icon" onClick={() => setShowPrintModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div ref={printRef} className="thermal-receipt" style={{ fontFamily: 'monospace', padding: '15px', backgroundColor: '#fff', color: '#000', borderRadius: '4px', fontSize: '0.85rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '10px', borderBottom: '1px dashed #000', paddingBottom: '8px' }}>
                  <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Naveed Medical Pharmacy</h2>
                  <div>Day-End Settlement Receipt</div>
                  <div style={{ fontSize: '0.75rem' }}>Chohan Road, Islampura, Lahore</div>
                  <div style={{ fontSize: '0.75rem' }}>Date: {selectedClosingPrint.closing_date}</div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Opening Float:</span>
                  <span>Rs. {Number(selectedClosingPrint.opening_balance || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Cash Sales:</span>
                  <span>+ Rs. {Number(selectedClosingPrint.cash_sales || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Other Inflows:</span>
                  <span>+ Rs. {Number(selectedClosingPrint.other_inflows || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Expenses:</span>
                  <span>- Rs. {Number(selectedClosingPrint.operating_expenses || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Other Outflows:</span>
                  <span>- Rs. {Number(selectedClosingPrint.other_outflows || 0).toFixed(2)}</span>
                </div>

                <div style={{ borderTop: '1px dashed #000', margin: '8px 0', paddingTop: '6px' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>Expected Cash:</span>
                  <span>Rs. {Number(selectedClosingPrint.expected_cash || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>Actual Counted:</span>
                  <span>Rs. {Number(selectedClosingPrint.actual_cash || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: selectedClosingPrint.variance < 0 ? 'red' : 'black' }}>
                  <span>Variance:</span>
                  <span>Rs. {Number(selectedClosingPrint.variance || 0).toFixed(2)}</span>
                </div>

                <div style={{ borderTop: '1px dashed #000', margin: '8px 0', paddingTop: '6px', fontSize: '0.75rem' }}>
                  <div>Closed By: {selectedClosingPrint.closed_by_full_name || 'Pharmacist'}</div>
                  {selectedClosingPrint.notes && <div>Notes: {selectedClosingPrint.notes}</div>}
                  <div style={{ textAlign: 'center', marginTop: '10px' }}>*** END OF SETTLEMENT ***</div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowPrintModal(false)}>
                Close
              </button>
              <button className="btn btn-primary" onClick={() => window.print()}>
                <Printer size={16} /> Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

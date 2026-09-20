import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  PlusCircle,
  Calendar,
  Filter,
  DollarSign,
  Receipt,
  FileText,
  AlertCircle,
  CheckCircle2,
  X,
  PieChart,
  Printer,
  Search,
  ArrowDownRight,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { BalanceView } from './BalanceView.js';
import { CashOutModal } from '../components/CashOutModal.js';
import { CashOutVoucherModal, CashOutVoucherData } from '../components/CashOutVoucherModal.js';

export const AccountsView: React.FC = () => {
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'balance' | 'cashbook' | 'cashout' | 'expenses' | 'pl'>('cashout');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Cash Out State
  const [cashOutRecords, setCashOutRecords] = useState<any[]>([]);
  const [cashOutSummary, setCashOutSummary] = useState<any>(null);
  const [cashOutFilter, setCashOutFilter] = useState({
    nature: '',
    recipientType: '',
    category: '',
    status: '',
    search: '',
    startDate: '',
    endDate: ''
  });
  const [showCashOutModal, setShowCashOutModal] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<CashOutVoucherData | null>(null);
  const [reversingCashOut, setReversingCashOut] = useState<any | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversing, setReversing] = useState(false);

  // Expense Delete Confirmation Modal State
  const [deletingExpenseId, setDeletingExpenseId] = useState<number | null>(null);

  // Cashbook state
  const [cashbookEntries, setCashbookEntries] = useState<any[]>([]);
  const [cashbookSummary, setCashbookSummary] = useState<any>(null);
  const [dailyRegister, setDailyRegister] = useState<any>(null);
  const [cashbookFilter, setCashbookFilter] = useState({
    category: '',
    entryType: '',
    startDate: '',
    endDate: ''
  });

  // Expenses state
  const [expenses, setExpenses] = useState<any[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<any[]>([]);
  const [expenseGrandTotal, setExpenseGrandTotal] = useState<number>(0);
  const [expenseFilter, setExpenseFilter] = useState({
    category: '',
    startDate: '',
    endDate: ''
  });

  // P&L state
  const [plPeriod, setPlPeriod] = useState<string>('month');
  const [plSummary, setPlSummary] = useState<any>(null);

  // Modals
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showManualCashModal, setShowManualCashModal] = useState(false);

  // Expense form
  const [expenseForm, setExpenseForm] = useState({
    expense_category: 'Utilities',
    amount: '',
    payment_method: 'CASH',
    payee: '',
    description: ''
  });

  // Manual Cash form
  const [manualCashForm, setManualCashForm] = useState({
    entry_type: 'IN',
    category: 'INITIAL_FLOAT',
    amount: '',
    description: ''
  });

  const showNotification = (text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // 1. Fetch Cashbook
  const fetchCashbook = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (cashbookFilter.category) params.append('category', cashbookFilter.category);
      if (cashbookFilter.entryType) params.append('entryType', cashbookFilter.entryType);
      if (cashbookFilter.startDate) params.append('startDate', cashbookFilter.startDate);
      if (cashbookFilter.endDate) params.append('endDate', cashbookFilter.endDate);

      const res = await fetch(`/api/accounts/cashbook?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCashbookEntries(data.entries || []);
        setCashbookSummary(data.summary || null);
      }

      // Also fetch today's daily register
      const regRes = await fetch(`/api/accounts/daily-register`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (regRes.ok) {
        const regData = await regRes.json();
        setDailyRegister(regData);
      }
    } catch (err: any) {
      console.error('Failed to load cashbook:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, cashbookFilter]);

  // 2. Fetch Expenses
  const fetchExpenses = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (expenseFilter.category) params.append('category', expenseFilter.category);
      if (expenseFilter.startDate) params.append('startDate', expenseFilter.startDate);
      if (expenseFilter.endDate) params.append('endDate', expenseFilter.endDate);

      const res = await fetch(`/api/accounts/expenses?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setExpenses(data.expenses || []);
        setExpenseCategories(data.categoryTotals || []);
        setExpenseGrandTotal(data.grandTotal || 0);
      }
    } catch (err: any) {
      console.error('Failed to load expenses:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, expenseFilter]);

  // 3. Fetch Cash Out History & Summary
  const fetchCashOuts = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (cashOutFilter.nature) params.append('nature', cashOutFilter.nature);
      if (cashOutFilter.recipientType) params.append('recipientType', cashOutFilter.recipientType);
      if (cashOutFilter.category) params.append('category', cashOutFilter.category);
      if (cashOutFilter.status) params.append('status', cashOutFilter.status);
      if (cashOutFilter.search) params.append('search', cashOutFilter.search);
      if (cashOutFilter.startDate) params.append('startDate', cashOutFilter.startDate);
      if (cashOutFilter.endDate) params.append('endDate', cashOutFilter.endDate);

      const [recRes, sumRes] = await Promise.all([
        fetch(`/api/cashout?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/cashout/summary?startDate=${cashOutFilter.startDate}&endDate=${cashOutFilter.endDate}`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (recRes.ok) {
        const data = await recRes.json();
        setCashOutRecords(data.records || []);
      }
      if (sumRes.ok) {
        const data = await sumRes.json();
        setCashOutSummary(data.summary || null);
      }
    } catch (err: any) {
      console.error('Failed to load cash out history:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, cashOutFilter]);

  // 4. Fetch P&L
  const fetchPl = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/accounts/pl-summary?period=${plPeriod}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPlSummary(data);
      }
    } catch (err: any) {
      console.error('Failed to load P&L summary:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, plPeriod]);

  useEffect(() => {
    if (activeTab === 'cashbook') fetchCashbook();
    if (activeTab === 'cashout') fetchCashOuts();
    if (activeTab === 'expenses') fetchExpenses();
    if (activeTab === 'pl') fetchPl();
  }, [activeTab, fetchCashbook, fetchCashOuts, fetchExpenses, fetchPl]);

  // Reversals & Delete Handlers
  const handleConfirmReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversingCashOut || !reversalReason.trim()) return;

    setReversing(true);
    try {
      const res = await fetch(`/api/cashout/${reversingCashOut.id}/reverse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason: reversalReason.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reverse transaction');
      }

      showNotification(data.message || 'Transaction reversed successfully', 'success');
      setReversingCashOut(null);
      setReversalReason('');
      fetchCashOuts();
      if (activeTab === 'cashbook') fetchCashbook();
    } catch (err: any) {
      showNotification(err.message || 'Error reversing transaction', 'error');
    } finally {
      setReversing(false);
    }
  };

  const handleConfirmDeleteExpense = async () => {
    if (!deletingExpenseId) return;
    try {
      const res = await fetch(`/api/accounts/expenses/${deletingExpenseId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showNotification('Expense deleted and cashbook reversed', 'success');
        setDeletingExpenseId(null);
        fetchExpenses();
        if (activeTab === 'cashbook') fetchCashbook();
      } else {
        const err = await res.json();
        showNotification(err.error || 'Failed to delete expense', 'error');
      }
    } catch (err) {
      showNotification('Network error deleting expense', 'error');
    }
  };

  // Submit Expense
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.amount || Number(expenseForm.amount) <= 0) {
      showNotification('Please enter a valid expense amount', 'error');
      return;
    }

    try {
      const res = await fetch('/api/accounts/expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(expenseForm)
      });

      if (res.ok) {
        showNotification('Expense recorded successfully', 'success');
        setShowExpenseModal(false);
        setExpenseForm({
          expense_category: 'Utilities',
          amount: '',
          payment_method: 'CASH',
          payee: '',
          description: ''
        });
        fetchExpenses();
        if (activeTab === 'cashbook') fetchCashbook();
      } else {
        const err = await res.json();
        showNotification(err.error || 'Failed to record expense', 'error');
      }
    } catch (err) {
      showNotification('Network error recording expense', 'error');
    }
  };

  // Trigger Delete Expense Modal
  const handleDeleteExpense = (id: number) => {
    setDeletingExpenseId(id);
  };

  // Submit Manual Cash
  const handleSaveManualCash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCashForm.amount || Number(manualCashForm.amount) <= 0) {
      showNotification('Please enter a valid amount', 'error');
      return;
    }

    try {
      const res = await fetch('/api/accounts/cashbook/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(manualCashForm)
      });

      if (res.ok) {
        showNotification('Cash adjustment recorded successfully', 'success');
        setShowManualCashModal(false);
        setManualCashForm({
          entry_type: 'IN',
          category: 'INITIAL_FLOAT',
          amount: '',
          description: ''
        });
        fetchCashbook();
      } else {
        const err = await res.json();
        showNotification(err.error || 'Failed to record cash adjustment', 'error');
      }
    } catch (err) {
      showNotification('Network error recording cash adjustment', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1600px', margin: '0 auto', width: '100%' }}>
      {/* Header & Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Wallet style={{ color: 'var(--primary)', width: '2rem', height: '2rem' }} />
            Financial Accounts & Cashbook
            {isLoading && <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>Updating...</span>}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Real-time cash ledger, operating expenses, daily cash register, and P&L financial summary
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--surface-hover)', padding: '0.25rem', borderRadius: 'var(--radius)' }}>
          <button
            onClick={() => setActiveTab('cashout')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius)',
              border: 'none',
              background: activeTab === 'cashout' ? '#ef4444' : 'transparent',
              color: activeTab === 'cashout' ? '#fff' : 'var(--text-main)',
              fontWeight: activeTab === 'cashout' ? '700' : 'normal',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <ArrowDownRight size={16} /> 💸 Cash Out & Transfers
          </button>
          <button
            onClick={() => setActiveTab('balance')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius)',
              border: 'none',
              background: activeTab === 'balance' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'balance' ? '#fff' : 'var(--text-main)',
              fontWeight: activeTab === 'balance' ? '600' : 'normal',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Wallet size={16} /> Balance & Day-End 💰
          </button>
          <button
            onClick={() => setActiveTab('cashbook')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius)',
              border: 'none',
              background: activeTab === 'cashbook' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'cashbook' ? '#fff' : 'var(--text-main)',
              fontWeight: activeTab === 'cashbook' ? '600' : 'normal',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Receipt size={16} /> Cashbook & Register
          </button>
          <button
            onClick={() => setActiveTab('expenses')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius)',
              border: 'none',
              background: activeTab === 'expenses' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'expenses' ? '#fff' : 'var(--text-main)',
              fontWeight: activeTab === 'expenses' ? '600' : 'normal',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <DollarSign size={16} /> Operating Expenses
          </button>
          <button
            onClick={() => setActiveTab('pl')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius)',
              border: 'none',
              background: activeTab === 'pl' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'pl' ? '#fff' : 'var(--text-main)',
              fontWeight: activeTab === 'pl' ? '600' : 'normal',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <PieChart size={16} /> Profit & Loss (P&L)
          </button>
        </div>
      </div>

      {/* Notification toast */}
      {statusMessage && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius)',
          background: statusMessage.type === 'success' ? '#065f46' : '#991b1b',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.9rem'
        }}>
          {statusMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 0: CASHOUT & FUND TRANSFERS MODULE                  */}
      {/* ======================================================== */}
      {activeTab === 'cashout' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Top Summary KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div style={{ background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(245, 158, 11, 0.05) 100%)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>TOTAL CASHOUT (TODAY)</span>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#dc2626', marginTop: '4px' }}>
                Rs. {Number(cashOutSummary?.total_cash_out || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>All drawer cash departures today</span>
            </div>

            <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>💼 BUSINESS EXPENSES</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0369a1', marginTop: '4px' }}>
                Rs. {Number(cashOutSummary?.business_expenses || 0).toLocaleString('en-PK')}
              </div>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Operating expenses (P&L affect)</span>
            </div>

            <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>🏭 SUPPLIER PAYMENTS</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#059669', marginTop: '4px' }}>
                Rs. {Number(cashOutSummary?.supplier_payments || 0).toLocaleString('en-PK')}
              </div>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Payable ledger settlements</span>
            </div>

            <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>🏦 BANK DEPOSITS</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#7c3aed', marginTop: '4px' }}>
                Rs. {Number(cashOutSummary?.bank_deposits || 0).toLocaleString('en-PK')}
              </div>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Cash drawer → Bank transfer</span>
            </div>

            <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>📱 WALLET TRANSFERS</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#d97706', marginTop: '4px' }}>
                Rs. {Number(cashOutSummary?.wallet_transfers || 0).toLocaleString('en-PK')}
              </div>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>JazzCash / EasyPaisa cash float</span>
            </div>
          </div>

          {/* Action Bar & Search / Filters */}
          <div style={{ background: 'var(--surface)', padding: '1rem 1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ArrowDownRight size={20} style={{ color: '#ef4444' }} />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Cash Out History & Audit Log</h3>
              </div>

              <button
                onClick={() => setShowCashOutModal(true)}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#ef4444', borderColor: '#dc2626', fontWeight: 700 }}
              >
                <PlusCircle size={18} /> Record New Cash Out
              </button>
            </div>

            {/* Filter Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Search size={15} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search Trx ID, recipient, purpose..."
                  value={cashOutFilter.search}
                  onChange={(e) => setCashOutFilter({ ...cashOutFilter, search: e.target.value })}
                  className="input-field"
                  style={{ width: '100%', paddingLeft: '2rem', fontSize: '0.85rem' }}
                />
              </div>

              <select
                value={cashOutFilter.nature}
                onChange={(e) => setCashOutFilter({ ...cashOutFilter, nature: e.target.value })}
                className="input-field"
                style={{ width: '100%', fontSize: '0.85rem' }}
              >
                <option value="">All Classification Natures</option>
                <option value="BUSINESS_EXPENSE">💼 Business Expense</option>
                <option value="SUPPLIER_PAYMENT">🏭 Supplier Payment</option>
                <option value="BANK_DEPOSIT">🏦 Bank Deposit</option>
                <option value="WALLET_TRANSFER">📱 Wallet Transfer</option>
                <option value="OWNER_WITHDRAWAL">👤 Owner Withdrawal</option>
              </select>

              <select
                value={cashOutFilter.recipientType}
                onChange={(e) => setCashOutFilter({ ...cashOutFilter, recipientType: e.target.value })}
                className="input-field"
                style={{ width: '100%', fontSize: '0.85rem' }}
              >
                <option value="">All Recipient Types</option>
                <option value="SUPPLIER">Supplier</option>
                <option value="EMPLOYEE">Employee / Staff</option>
                <option value="BANK">Bank</option>
                <option value="WALLET">Wallet</option>
                <option value="OTHER">Other / Person</option>
              </select>

              <select
                value={cashOutFilter.status}
                onChange={(e) => setCashOutFilter({ ...cashOutFilter, status: e.target.value })}
                className="input-field"
                style={{ width: '100%', fontSize: '0.85rem' }}
              >
                <option value="">All Statuses (ACTIVE & REVERSED)</option>
                <option value="ACTIVE">ACTIVE Only</option>
                <option value="REVERSED">REVERSED Only</option>
              </select>

              <input
                type="date"
                value={cashOutFilter.startDate}
                onChange={(e) => setCashOutFilter({ ...cashOutFilter, startDate: e.target.value })}
                className="input-field"
                style={{ width: '100%', fontSize: '0.85rem' }}
              />

              <input
                type="date"
                value={cashOutFilter.endDate}
                onChange={(e) => setCashOutFilter({ ...cashOutFilter, endDate: e.target.value })}
                className="input-field"
                style={{ width: '100%', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          {/* Cash Out Records Table */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Transaction ID</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Date & Time</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Nature / Nature</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Category & Purpose</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Paid To / Recipient</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Method</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Amount (PKR)</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Entered By</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cashOutRecords.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        <ArrowDownRight size={38} style={{ opacity: 0.3, margin: '0 auto 0.5rem' }} />
                        <div>No Cash Out records found matching the current filters.</div>
                      </td>
                    </tr>
                  ) : (
                    cashOutRecords.map((rec) => {
                      const isReversed = rec.status === 'REVERSED';
                      return (
                        <tr
                          key={rec.id}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            opacity: isReversed ? 0.65 : 1,
                            backgroundColor: isReversed ? 'rgba(239, 68, 68, 0.03)' : 'transparent'
                          }}
                        >
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {rec.transaction_id}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {new Date(rec.created_at).toLocaleString('en-PK', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                backgroundColor:
                                  rec.transaction_nature === 'BUSINESS_EXPENSE'
                                    ? '#e0f2fe'
                                    : rec.transaction_nature === 'SUPPLIER_PAYMENT'
                                    ? '#dcfce7'
                                    : rec.transaction_nature === 'BANK_DEPOSIT'
                                    ? '#f3e8ff'
                                    : '#fef3c7',
                                color:
                                  rec.transaction_nature === 'BUSINESS_EXPENSE'
                                    ? '#0369a1'
                                    : rec.transaction_nature === 'SUPPLIER_PAYMENT'
                                    ? '#15803d'
                                    : rec.transaction_nature === 'BANK_DEPOSIT'
                                    ? '#6b21a8'
                                    : '#b45309'
                              }}
                            >
                              {rec.transaction_nature?.replace('_', ' ')}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{rec.category}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{rec.purpose}</div>
                            {rec.reference_no && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Ref #: {rec.reference_no}</div>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ fontWeight: 700 }}>
                              {rec.recipient_type === 'SUPPLIER'
                                ? `Supplier: ${rec.supplier_name || 'N/A'}`
                                : rec.recipient_name || rec.recipient_type}
                            </div>
                            {rec.bank_name && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {rec.bank_name} {rec.account_ref ? `(${rec.account_ref})` : ''}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: 600 }}>
                            {rec.payment_method}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 900, color: isReversed ? 'var(--text-muted)' : '#dc2626', fontSize: '0.95rem' }}>
                            {isReversed && <span style={{ textDecoration: 'line-through', marginRight: '6px' }}>Rs. {rec.amount.toLocaleString()}</span>}
                            {!isReversed && `Rs. ${rec.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                            <span
                              className={`badge ${isReversed ? 'badge-danger' : 'badge-success'}`}
                              style={{ fontSize: '0.72rem', fontWeight: 800 }}
                            >
                              {rec.status}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem' }}>
                            {rec.created_by_name || rec.created_by_username || 'System'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                              <button
                                onClick={() =>
                                  setSelectedVoucher({
                                    transactionId: rec.transaction_id,
                                    amount: rec.amount,
                                    category: rec.category,
                                    transactionNature: rec.transaction_nature,
                                    paymentMethod: rec.payment_method,
                                    recipientType: rec.recipient_type,
                                    recipientName: rec.recipient_name,
                                    supplierName: rec.supplier_name,
                                    bankName: rec.bank_name,
                                    accountName: rec.account_name,
                                    accountRef: rec.account_ref,
                                    trxRef: rec.trx_ref,
                                    purpose: rec.purpose,
                                    referenceNo: rec.reference_no,
                                    notes: rec.notes,
                                    createdAt: rec.created_at,
                                    createdByName: rec.created_by_name
                                  })
                                }
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.74rem' }}
                                title="View & Print Payment Voucher Receipt"
                              >
                                <Printer size={14} />
                              </button>

                              {!isReversed && (
                                <button
                                  onClick={() => {
                                    setReversingCashOut(rec);
                                    setReversalReason('');
                                  }}
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.74rem', color: '#dc2626' }}
                                  title="Reverse transaction and restore cash drawer"
                                >
                                  <RotateCcw size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 1: BALANCE & DAY-END CLOSING                         */}
      {/* ======================================================== */}
      {activeTab === 'balance' && <BalanceView hideHeader={true} />}

      {/* ======================================================== */}
      {/* TAB 1: CASHBOOK & DAILY REGISTER                        */}
      {/* ======================================================== */}
      {activeTab === 'cashbook' && (
        <>
          {/* Top KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>CURRENT CASH IN HAND</span>
              <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: (cashbookSummary?.currentBalance || 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                Rs. {(cashbookSummary?.currentBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>All-time net liquid cash register</span>
            </div>

            <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>TODAY'S CASH INFLOW</span>
              <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <TrendingUp size={24} />
                Rs. {(cashbookSummary?.todayIn || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sales + Customer recoveries today</span>
            </div>

            <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>TODAY'S CASH OUTFLOW</span>
              <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <TrendingDown size={24} />
                Rs. {(cashbookSummary?.todayOut || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Supplier payments + Expenses today</span>
            </div>

            <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>TODAY'S NET CASH CHANGE</span>
              <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: (cashbookSummary?.todayNet || 0) >= 0 ? 'var(--primary)' : 'var(--warning)' }}>
                Rs. {(cashbookSummary?.todayNet || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Today's net liquidity gain / burn</span>
            </div>
          </div>

          {/* Daily Register Summary Strip */}
          {dailyRegister && (
            <div style={{
              background: 'var(--surface)',
              padding: '1.25rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                  <Calendar size={18} style={{ color: 'var(--primary)' }} />
                  <span>Daily Cash Register Summary ({dailyRegister.date})</span>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={() => setShowManualCashModal(true)}
                    className="btn btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
                  >
                    <PlusCircle size={16} /> Cash Float / Adjustment
                  </button>
                  <button
                    onClick={() => setShowExpenseModal(true)}
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
                  >
                    <PlusCircle size={16} /> Add Expense
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', background: 'var(--surface-hover)', padding: '1rem', borderRadius: 'var(--radius)' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>OPENING CASH BALANCE</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: '600' }}>Rs. {dailyRegister.openingBalance.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>+ CASH SALES</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--success)' }}>+Rs. {dailyRegister.breakdown.cashSales.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>+ CUSTOMER RECOVERIES</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--success)' }}>+Rs. {dailyRegister.breakdown.customerRecoveries.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>- SUPPLIER PAYMENTS</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--danger)' }}>-Rs. {dailyRegister.breakdown.supplierPayments.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>- OPERATING EXPENSES</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--danger)' }}>-Rs. {dailyRegister.breakdown.operatingExpenses.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>= CLOSING CASH BALANCE</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--primary)' }}>Rs. {dailyRegister.closingBalance.toLocaleString()}</div>
                </div>
              </div>
            </div>
          )}

          {/* Filter Bar */}
          <div style={{
            background: 'var(--surface)',
            padding: '1rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Filter size={16} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>Filter Entries:</span>
            </div>

            <select
              value={cashbookFilter.entryType}
              onChange={(e) => setCashbookFilter({ ...cashbookFilter, entryType: e.target.value })}
              className="input-field"
              style={{ width: '130px', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
            >
              <option value="">All Flows (IN/OUT)</option>
              <option value="IN">IN (Inflow)</option>
              <option value="OUT">OUT (Outflow)</option>
            </select>

            <select
              value={cashbookFilter.category}
              onChange={(e) => setCashbookFilter({ ...cashbookFilter, category: e.target.value })}
              className="input-field"
              style={{ width: '180px', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
            >
              <option value="">All Categories</option>
              <option value="SALE">SALE</option>
              <option value="EXPENSE">EXPENSE</option>
              <option value="SUPPLIER_PAYMENT">SUPPLIER_PAYMENT</option>
              <option value="CUSTOMER_RECOVERY">CUSTOMER_RECOVERY</option>
              <option value="INITIAL_FLOAT">INITIAL_FLOAT</option>
              <option value="OWNER_DRAW">OWNER_DRAW</option>
            </select>

            <input
              type="date"
              value={cashbookFilter.startDate}
              onChange={(e) => setCashbookFilter({ ...cashbookFilter, startDate: e.target.value })}
              className="input-field"
              style={{ width: '150px', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
              placeholder="From Date"
            />
            <input
              type="date"
              value={cashbookFilter.endDate}
              onChange={(e) => setCashbookFilter({ ...cashbookFilter, endDate: e.target.value })}
              className="input-field"
              style={{ width: '150px', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
              placeholder="To Date"
            />

            {(cashbookFilter.category || cashbookFilter.entryType || cashbookFilter.startDate || cashbookFilter.endDate) && (
              <button
                onClick={() => setCashbookFilter({ category: '', entryType: '', startDate: '', endDate: '' })}
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
              >
                Reset
              </button>
            )}
          </div>

          {/* Cashbook Ledger Table */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Transaction History ({cashbookEntries.length} entries)</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>DATE / TIME</th>
                    <th style={{ padding: '0.75rem 1rem' }}>FLOW</th>
                    <th style={{ padding: '0.75rem 1rem' }}>CATEGORY</th>
                    <th style={{ padding: '0.75rem 1rem' }}>DESCRIPTION / NOTE</th>
                    <th style={{ padding: '0.75rem 1rem' }}>REFERENCE</th>
                    <th style={{ padding: '0.75rem 1rem' }}>PERFORMED BY</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {cashbookEntries.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No cashbook entries found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    cashbookEntries.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                          {item.created_at ? new Date(item.created_at).toLocaleString() : '—'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontWeight: '600',
                            fontSize: '0.75rem',
                            background: item.entry_type === 'IN' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: item.entry_type === 'IN' ? 'var(--success)' : 'var(--danger)'
                          }}>
                            {item.entry_type === 'IN' ? '▲ CASH IN' : '▼ CASH OUT'}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: '500' }}>
                          {item.category}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', maxWidth: '300px' }}>
                          {item.description || '—'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                          {item.reference_id ? `${item.reference_type || ''} #${item.reference_id}` : '—'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          {item.created_by_name || 'System'}
                        </td>
                        <td style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'right',
                          fontWeight: 'bold',
                          color: item.entry_type === 'IN' ? 'var(--success)' : 'var(--danger)'
                        }}>
                          {item.entry_type === 'IN' ? '+' : '-'}Rs. {item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ======================================================== */}
      {/* TAB 2: OPERATING EXPENSES                               */}
      {/* ======================================================== */}
      {activeTab === 'expenses' && (
        <>
          {/* Expenses Top Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>TOTAL EXPENSES RECORDED</span>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--danger)' }}>
                Rs. {expenseGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Across {expenses.length} expense vouchers</span>
            </div>

            <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>EXPENSE CATEGORIES</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.25rem' }}>
                {expenseCategories.map((cat) => (
                  <span key={cat.expense_category} style={{
                    padding: '0.25rem 0.5rem',
                    background: 'var(--surface-hover)',
                    borderRadius: '4px',
                    fontSize: '0.75rem'
                  }}>
                    <strong>{cat.expense_category}:</strong> Rs. {cat.total_amount.toLocaleString()}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <button
                onClick={() => setShowExpenseModal(true)}
                className="btn btn-primary"
                style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <PlusCircle size={20} /> Record New Expense
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div style={{
            background: 'var(--surface)',
            padding: '1rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            flexWrap: 'wrap'
          }}>
            <Filter size={16} style={{ color: 'var(--text-muted)' }} />
            <select
              value={expenseFilter.category}
              onChange={(e) => setExpenseFilter({ ...expenseFilter, category: e.target.value })}
              className="input-field"
              style={{ width: '180px', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
            >
              <option value="">All Categories</option>
              <option value="Rent">Rent</option>
              <option value="Utilities">Utilities (Electricity/Water/Gas)</option>
              <option value="Salaries">Staff Salaries</option>
              <option value="Tea & Refreshment">Tea & Refreshment</option>
              <option value="Cleaning & Supplies">Cleaning & Supplies</option>
              <option value="Packaging & Bags">Packaging & Bags</option>
              <option value="Maintenance">Repair & Maintenance</option>
              <option value="Miscellaneous">Miscellaneous</option>
            </select>

            <input
              type="date"
              value={expenseFilter.startDate}
              onChange={(e) => setExpenseFilter({ ...expenseFilter, startDate: e.target.value })}
              className="input-field"
              style={{ width: '150px', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
              placeholder="From Date"
            />
            <input
              type="date"
              value={expenseFilter.endDate}
              onChange={(e) => setExpenseFilter({ ...expenseFilter, endDate: e.target.value })}
              className="input-field"
              style={{ width: '150px', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
              placeholder="To Date"
            />

            {(expenseFilter.category || expenseFilter.startDate || expenseFilter.endDate) && (
              <button
                onClick={() => setExpenseFilter({ category: '', startDate: '', endDate: '' })}
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
              >
                Reset
              </button>
            )}
          </div>

          {/* Expenses Table */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', fontWeight: 'bold' }}>
              Expenses List ({expenses.length} items)
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>DATE</th>
                    <th style={{ padding: '0.75rem 1rem' }}>CATEGORY</th>
                    <th style={{ padding: '0.75rem 1rem' }}>PAYEE</th>
                    <th style={{ padding: '0.75rem 1rem' }}>DESCRIPTION</th>
                    <th style={{ padding: '0.75rem 1rem' }}>PAYMENT METHOD</th>
                    <th style={{ padding: '0.75rem 1rem' }}>RECORDED BY</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>AMOUNT</th>
                    {user?.roleName === 'Admin' && <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>ACTION</th>}
                  </tr>
                </thead>
                <tbody>
                  {expenses.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No expenses found for this criteria.
                      </td>
                    </tr>
                  ) : (
                    expenses.map((exp) => (
                      <tr key={exp.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                          {exp.created_at ? new Date(exp.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: '600' }}>
                          {exp.expense_category}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          {exp.payee || '—'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', maxWidth: '300px' }}>
                          {exp.description || '—'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            background: exp.payment_method === 'CASH' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                            color: exp.payment_method === 'CASH' ? 'var(--success)' : 'var(--primary)'
                          }}>
                            {exp.payment_method}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          {exp.created_by_name || 'System'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--danger)' }}>
                          Rs. {exp.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        {user?.roleName === 'Admin' && (
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                            <button
                              onClick={() => handleDeleteExpense(exp.id)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                              title="Delete Expense"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ======================================================== */}
      {/* TAB 3: PROFIT & LOSS (P&L) STATEMENT                     */}
      {/* ======================================================== */}
      {activeTab === 'pl' && plSummary && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Period selector */}
          <div style={{
            background: 'var(--surface)',
            padding: '1rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={18} style={{ color: 'var(--primary)' }} />
              <span>Pharmacy Financial Statement (Profit & Loss)</span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(['today', 'week', 'month', 'year'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlPeriod(p)}
                  style={{
                    padding: '0.4rem 0.8rem',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    background: plPeriod === p ? 'var(--primary)' : 'var(--surface-hover)',
                    color: plPeriod === p ? '#fff' : 'var(--text-main)',
                    fontWeight: plPeriod === p ? 'bold' : 'normal',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                    fontSize: '0.85rem'
                  }}
                >
                  {p === 'today' ? 'Today' : p === 'week' ? 'Last 7 Days' : p === 'month' ? 'This Month' : 'This Year'}
                </button>
              ))}
            </div>
          </div>

          {/* Statement Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem' }}>
            {/* Income & Gross Profit */}
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                1. Trading Account (Gross Profit)
              </h3>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0' }}>
                <span style={{ color: 'var(--text-muted)' }}>Gross Sales Revenue ({plSummary.revenue.totalBills} bills)</span>
                <span style={{ fontWeight: '600' }}>Rs. {plSummary.revenue.grossSales.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0' }}>
                <span style={{ color: 'var(--text-muted)' }}>Less: Discounts Given</span>
                <span style={{ color: 'var(--danger)', fontWeight: '600' }}>-Rs. {plSummary.revenue.totalDiscounts.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderTop: '1px dashed var(--border)', fontWeight: 'bold' }}>
                <span>Net Sales Revenue</span>
                <span style={{ color: 'var(--primary)' }}>Rs. {plSummary.revenue.netSales.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0' }}>
                <span style={{ color: 'var(--text-muted)' }}>Less: Cost of Goods Sold (COGS)</span>
                <span style={{ color: 'var(--danger)', fontWeight: '600' }}>-Rs. {plSummary.cogs.toLocaleString()}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0.75rem',
                borderRadius: 'var(--radius)',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid var(--success)',
                fontWeight: 'bold',
                fontSize: '1.1rem'
              }}>
                <span>GROSS PROFIT</span>
                <span style={{ color: 'var(--success)' }}>
                  Rs. {plSummary.grossProfit.toLocaleString()} ({plSummary.grossMarginPct}%)
                </span>
              </div>
            </div>

            {/* Operating Expenses & Net Profit */}
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                2. Net Profit Calculation
              </h3>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0' }}>
                <span style={{ color: 'var(--text-muted)' }}>Gross Profit Brought Down</span>
                <span style={{ fontWeight: '600' }}>Rs. {plSummary.grossProfit.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0' }}>
                <span style={{ color: 'var(--text-muted)' }}>Less: Operating Expenses</span>
                <span style={{ color: 'var(--danger)', fontWeight: '600' }}>-Rs. {plSummary.expenses.toLocaleString()}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0.75rem',
                borderRadius: 'var(--radius)',
                background: plSummary.netProfit >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${plSummary.netProfit >= 0 ? 'var(--success)' : 'var(--danger)'}`,
                fontWeight: 'bold',
                fontSize: '1.2rem'
              }}>
                <span>NET PROFIT / LOSS</span>
                <span style={{ color: plSummary.netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  Rs. {plSummary.netProfit.toLocaleString()} ({plSummary.netMarginPct}%)
                </span>
              </div>

              {/* Outstanding Assets/Liabilities */}
              <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  LIQUIDITY & OUTSTANDING BALANCES
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', textAlign: 'center' }}>
                  <div style={{ background: 'var(--surface-hover)', padding: '0.5rem', borderRadius: '4px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>CASH IN HAND</div>
                    <div style={{ fontWeight: 'bold', color: 'var(--success)', fontSize: '0.95rem' }}>Rs. {plSummary.balances.cashInHand.toLocaleString()}</div>
                  </div>
                  <div style={{ background: 'var(--surface-hover)', padding: '0.5rem', borderRadius: '4px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>RECEIVABLES (UDHAR)</div>
                    <div style={{ fontWeight: 'bold', color: 'var(--warning)', fontSize: '0.95rem' }}>Rs. {plSummary.balances.receivablesOutstanding.toLocaleString()}</div>
                  </div>
                  <div style={{ background: 'var(--surface-hover)', padding: '0.5rem', borderRadius: '4px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>PAYABLES (SUPPLIERS)</div>
                    <div style={{ fontWeight: 'bold', color: 'var(--danger)', fontSize: '0.95rem' }}>Rs. {plSummary.balances.payablesOutstanding.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: ADD EXPENSE                                      */}
      {/* ======================================================== */}
      {showExpenseModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            width: '100%',
            maxWidth: '500px',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontWeight: 'bold', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <DollarSign size={18} style={{ color: 'var(--primary)' }} />
                Record Operating Expense
              </h3>
              <button onClick={() => setShowExpenseModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', marginBottom: '0.25rem' }}>Category *</label>
                <select
                  value={expenseForm.expense_category}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expense_category: e.target.value })}
                  className="input-field"
                  style={{ width: '100%' }}
                  required
                >
                  <option value="Utilities">Utilities (Electricity, Water, Gas)</option>
                  <option value="Rent">Shop Rent</option>
                  <option value="Salaries">Staff Salaries / Advance</option>
                  <option value="Tea & Refreshment">Tea & Refreshment</option>
                  <option value="Cleaning & Supplies">Cleaning & Janitorial</option>
                  <option value="Packaging & Bags">Packaging & Poly Bags</option>
                  <option value="Maintenance">Maintenance & Repairs</option>
                  <option value="Miscellaneous">Miscellaneous</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', marginBottom: '0.25rem' }}>Amount (PKR) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  className="input-field"
                  style={{ width: '100%', fontSize: '1.1rem', fontWeight: 'bold' }}
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', marginBottom: '0.25rem' }}>Payment Method *</label>
                <select
                  value={expenseForm.payment_method}
                  onChange={(e) => setExpenseForm({ ...expenseForm, payment_method: e.target.value })}
                  className="input-field"
                  style={{ width: '100%' }}
                >
                  <option value="CASH">CASH (Deducts from Cashbook)</option>
                  <option value="ONLINE">ONLINE / BANK TRANSFER</option>
                  <option value="CARD">CARD</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', marginBottom: '0.25rem' }}>Paid To / Payee</label>
                <input
                  type="text"
                  value={expenseForm.payee}
                  onChange={(e) => setExpenseForm({ ...expenseForm, payee: e.target.value })}
                  className="input-field"
                  style={{ width: '100%' }}
                  placeholder="e.g. Landlord, WAPDA, Cleaner"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', marginBottom: '0.25rem' }}>Description / Notes</label>
                <textarea
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="input-field"
                  style={{ width: '100%', height: '60px', resize: 'vertical' }}
                  placeholder="Details of expense..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowExpenseModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: MANUAL CASH ADJUSTMENT / FLOAT                    */}
      {/* ======================================================== */}
      {showManualCashModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            width: '100%',
            maxWidth: '480px',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontWeight: 'bold', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Wallet size={18} style={{ color: 'var(--primary)' }} />
                Cash Register Adjustment / Float
              </h3>
              <button onClick={() => setShowManualCashModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveManualCash} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', marginBottom: '0.25rem' }}>Flow Type *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setManualCashForm({ ...manualCashForm, entry_type: 'IN', category: 'INITIAL_FLOAT' })}
                    style={{
                      padding: '0.5rem',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border)',
                      background: manualCashForm.entry_type === 'IN' ? 'rgba(16, 185, 129, 0.2)' : 'var(--surface-hover)',
                      color: manualCashForm.entry_type === 'IN' ? 'var(--success)' : 'var(--text-main)',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    ▲ CASH IN
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualCashForm({ ...manualCashForm, entry_type: 'OUT', category: 'OWNER_DRAW' })}
                    style={{
                      padding: '0.5rem',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border)',
                      background: manualCashForm.entry_type === 'OUT' ? 'rgba(239, 68, 68, 0.2)' : 'var(--surface-hover)',
                      color: manualCashForm.entry_type === 'OUT' ? 'var(--danger)' : 'var(--text-main)',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    ▼ CASH OUT
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', marginBottom: '0.25rem' }}>Category *</label>
                <select
                  value={manualCashForm.category}
                  onChange={(e) => setManualCashForm({ ...manualCashForm, category: e.target.value })}
                  className="input-field"
                  style={{ width: '100%' }}
                  required
                >
                  {manualCashForm.entry_type === 'IN' ? (
                    <>
                      <option value="INITIAL_FLOAT">Initial Morning Float</option>
                      <option value="OWNER_INJECTION">Owner Capital Injection</option>
                      <option value="BANK_WITHDRAWAL">Cash Withdrawn from Bank</option>
                      <option value="CASH_ADJUSTMENT">Positive Cash Adjustment</option>
                    </>
                  ) : (
                    <>
                      <option value="OWNER_DRAW">Owner Personal Draw</option>
                      <option value="BANK_DEPOSIT">Cash Deposited to Bank</option>
                      <option value="PETTY_CASH">Petty Cash Handover</option>
                      <option value="CASH_ADJUSTMENT">Negative Cash Adjustment</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', marginBottom: '0.25rem' }}>Amount (PKR) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={manualCashForm.amount}
                  onChange={(e) => setManualCashForm({ ...manualCashForm, amount: e.target.value })}
                  className="input-field"
                  style={{ width: '100%', fontSize: '1.1rem', fontWeight: 'bold' }}
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', marginBottom: '0.25rem' }}>Description / Reason *</label>
                <input
                  type="text"
                  value={manualCashForm.description}
                  onChange={(e) => setManualCashForm({ ...manualCashForm, description: e.target.value })}
                  className="input-field"
                  style={{ width: '100%' }}
                  placeholder="Reason for adjustment..."
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowManualCashModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cash Out Entry Modal */}
      <CashOutModal
        isOpen={showCashOutModal}
        onClose={() => setShowCashOutModal(false)}
        onSuccess={() => {
          showNotification('Cash Out recorded successfully', 'success');
          fetchCashOuts();
          if (activeTab === 'cashbook') fetchCashbook();
        }}
      />

      {/* Cash Out Voucher View/Print Modal */}
      {selectedVoucher && (
        <CashOutVoucherModal
          voucher={selectedVoucher}
          onClose={() => setSelectedVoucher(null)}
        />
      )}

      {/* Reversal Confirmation Modal (No browser alert) */}
      {reversingCashOut && (
        <div className="modal-overlay" onClick={() => setReversingCashOut(null)}>
          <div className="modal-content" style={{ maxWidth: '440px', padding: '1.25rem' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#dc2626' }}>
                <RotateCcw size={18} />
                Reverse Cash Out Transaction
              </span>
              <button onClick={() => setReversingCashOut(null)} className="btn btn-secondary btn-sm" style={{ padding: '0.2rem' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleConfirmReversal} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ backgroundColor: 'var(--danger-light)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--danger)', fontSize: '0.85rem' }}>
                <div style={{ fontWeight: 700, color: '#dc2626' }}>
                  Transaction: {reversingCashOut.transaction_id} (Rs. {reversingCashOut.amount?.toLocaleString()})
                </div>
                <div style={{ fontSize: '0.78rem', marginTop: '2px', color: 'var(--text-secondary)' }}>
                  Reversing will create a balancing IN entry to restore cash drawer balance and reverse supplier ledger credit if applicable.
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '4px' }}>
                  Reason for Reversal <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <textarea
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="e.g. Entry error / Duplicate transaction / Receipt refunded..."
                  rows={2}
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '0.65rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setReversingCashOut(null)}
                  className="btn btn-secondary"
                  disabled={reversing}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ backgroundColor: '#dc2626', borderColor: '#b91c1c' }}
                  disabled={reversing}
                >
                  {reversing ? 'Reversing...' : 'Confirm Reversal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Expense Delete Confirmation Modal (No browser alert) */}
      {deletingExpenseId && (
        <div className="modal-overlay" onClick={() => setDeletingExpenseId(null)}>
          <div className="modal-content" style={{ maxWidth: '400px', padding: '1.25rem' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertCircle size={18} /> Delete Expense Record
              </span>
              <button onClick={() => setDeletingExpenseId(null)} className="btn btn-secondary btn-sm" style={{ padding: '0.2rem' }}>
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Are you sure you want to delete expense <strong>#{deletingExpenseId}</strong>? Any associated cashbook outflow will be automatically reversed.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button onClick={() => setDeletingExpenseId(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleConfirmDeleteExpense} className="btn btn-primary" style={{ backgroundColor: '#dc2626', borderColor: '#b91c1c' }}>
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Users,
  Wallet,
  Clock,
  CreditCard,
  FileText,
  Search,
  Plus,
  Printer,
  Edit2,
  CheckCircle2,
  ArrowLeft,
  Scan,
  MessageSquare
} from 'lucide-react';
import { UdhaarCustomer, UdhaarTransaction, UdhaarKPIs } from '../types/udhaar.js';
import { udhaarService } from '../services/udhaarService.js';
import { NewUdhaarModal } from '../components/NewUdhaarModal.js';

export const UdhaarView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'customer_list' | 'payment_history' | 'aging_report'>('customer_list');
  const [viewMode, setViewMode] = useState<'list' | 'ledger'>('list');

  // KPI Metrics
  const [kpis, setKpis] = useState<UdhaarKPIs>({
    total_customers: 42,
    total_udhaar: 285420,
    overdue_amount: 112650,
    overdue_customers: 38,
    paid_this_month: 173200,
    total_transactions: 286
  });

  // Customer List State
  const [customers, setCustomers] = useState<UdhaarCustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<UdhaarCustomer | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [_loading, setLoading] = useState(false);

  // New Udhaar Modal State
  const [showNewModal, setShowNewModal] = useState(false);

  // Ledger / Detail State
  const [customerTransactions, setCustomerTransactions] = useState<UdhaarTransaction[]>([]);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState('');
  const [submittingPay, setSubmittingPay] = useState(false);

  // Aging Report State
  const [agingData, setAgingData] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, [searchQuery, statusFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const kpiData = await udhaarService.getKPIs();
      setKpis(kpiData);

      const res = await udhaarService.getCustomers(searchQuery, statusFilter);
      setCustomers(res.customers || []);

      if (res.customers && res.customers.length > 0 && !selectedCustomer) {
        setSelectedCustomer(res.customers[0]);
      }
    } catch (err) {
      console.error('Failed to load Udhaar data', err);
    } finally {
      setLoading(false);
    }
  };

  // Load customer ledger transactions when selected for ledger view
  const openCustomerLedger = async (cust: UdhaarCustomer) => {
    setSelectedCustomer(cust);
    setViewMode('ledger');
    try {
      const data = await udhaarService.getCustomerDetail(cust.id);
      setSelectedCustomer(data.customer);
      setCustomerTransactions(data.transactions || []);
    } catch (err) {
      console.error('Failed to load customer transactions', err);
    }
  };

  const handleReceivePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const amt = Number(payAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid amount.');
      return;
    }

    setSubmittingPay(true);
    try {
      const res = await udhaarService.recordTransaction({
        customer_id: selectedCustomer.id,
        type: 'CREDIT',
        amount: amt,
        payment_method: payMethod,
        date_time: new Date(payDate).toISOString(),
        description: payNotes.trim() || 'Payment Received',
        created_by_user_name: 'Dr. Abdul'
      });

      setSelectedCustomer(res.customer);
      setCustomerTransactions([res.transaction, ...customerTransactions]);
      setPayAmount('');
      setPayNotes('');
      loadData();
      alert(`Payment of Rs. ${amt} successfully recorded!`);
    } catch (err: any) {
      alert(err.message || 'Failed to record payment');
    } finally {
      setSubmittingPay(false);
    }
  };

  const loadAgingReport = async () => {
    try {
      const data = await udhaarService.getAgingReport();
      setAgingData(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeTab === 'aging_report') {
      loadAgingReport();
    }
  }, [activeTab]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '2.5rem', color: '#f8fafc' }}>
      {/* ================================================== */}
      {/* 1. TOP HEADER & TITLE BAR */}
      {/* ================================================== */}
      <div
        style={{
          backgroundColor: '#0a1324',
          borderRadius: '16px',
          padding: '1.25rem 1.75rem',
          border: '1px solid #1e2d4a',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)'
            }}
          >
            <Users size={26} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, color: '#fff' }}>
              Udhaar <span style={{ color: '#94a3b8', fontWeight: 500, fontSize: '1.2rem' }}>(Customer Credit)</span>
            </h1>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
              {viewMode === 'ledger' && selectedCustomer
                ? `Customer ledger & credit details for ${selectedCustomer.name}`
                : 'Manage customer credits, payments and outstanding balances'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {viewMode === 'ledger' && (
            <button
              onClick={() => setViewMode('list')}
              style={{
                padding: '0.65rem 1.25rem',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '10px',
                color: '#f8fafc',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.88rem'
              }}
            >
              <ArrowLeft size={16} /> Back to Dashboard
            </button>
          )}

          <button
            onClick={() => setShowNewModal(true)}
            style={{
              padding: '0.65rem 1.4rem',
              backgroundColor: '#10b981',
              border: 'none',
              borderRadius: '10px',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
            }}
          >
            <Plus size={18} /> New Udhaar
          </button>

          <button
            onClick={() => {
              if (selectedCustomer) openCustomerLedger(selectedCustomer);
              else if (customers.length > 0) openCustomerLedger(customers[0]);
            }}
            style={{
              padding: '0.65rem 1.4rem',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '10px',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <CreditCard size={18} color="#38bdf8" /> Receive Payment
          </button>
        </div>
      </div>

      {/* ================================================== */}
      {/* 2. 5 METRIC SUMMARY KPI CARDS */}
      {/* ================================================== */}
      {viewMode === 'list' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem'
          }}
        >
          {/* Card 1: Total Customers */}
          <div
            style={{
              backgroundColor: '#0a1324',
              border: '1px solid #1e2d4a',
              borderRadius: '14px',
              padding: '1.1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: 'rgba(37, 99, 235, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
              <Users size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Total Customers</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>{kpis.total_customers}</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>With credit</div>
            </div>
          </div>

          {/* Card 2: Total Udhaar */}
          <div
            style={{
              backgroundColor: '#0a1324',
              border: '1px solid #1e2d4a',
              borderRadius: '14px',
              padding: '1.1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399' }}>
              <Wallet size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Total Udhaar</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#38bdf8' }}>Rs. {kpis.total_udhaar.toLocaleString()}</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Outstanding</div>
            </div>
          </div>

          {/* Card 3: Overdue Amount */}
          <div
            style={{
              backgroundColor: '#0a1324',
              border: '1px solid #1e2d4a',
              borderRadius: '14px',
              padding: '1.1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: 'rgba(245, 158, 11, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbbf24' }}>
              <Clock size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Overdue Amount</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fbbf24' }}>Rs. {kpis.overdue_amount.toLocaleString()}</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{kpis.overdue_customers} customers</div>
            </div>
          </div>

          {/* Card 4: Paid This Month */}
          <div
            style={{
              backgroundColor: '#0a1324',
              border: '1px solid #1e2d4a',
              borderRadius: '14px',
              padding: '1.1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: 'rgba(139, 92, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c084fc' }}>
              <CreditCard size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Paid This Month</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#c084fc' }}>Rs. {kpis.paid_this_month.toLocaleString()}</div>
              <div style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 600 }}>↑ +12%</div>
            </div>
          </div>

          {/* Card 5: Total Transactions */}
          <div
            style={{
              backgroundColor: '#0a1324',
              border: '1px solid #1e2d4a',
              borderRadius: '14px',
              padding: '1.1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: 'rgba(56, 189, 248, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
              <FileText size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Total Transactions</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>{kpis.total_transactions}</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Udhaar records</div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* 3. DASHBOARD MAIN VIEW MODE */}
      {/* ================================================== */}
      {viewMode === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Tabs Bar & Search / Filter Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', backgroundColor: '#0a1324', padding: '4px', borderRadius: '10px', border: '1px solid #1e2d4a' }}>
              <button
                onClick={() => setActiveTab('customer_list')}
                style={{
                  padding: '0.5rem 1.1rem',
                  borderRadius: '8px',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  backgroundColor: activeTab === 'customer_list' ? '#2563eb' : 'transparent',
                  color: activeTab === 'customer_list' ? '#fff' : '#94a3b8'
                }}
              >
                <Users size={16} /> Customer List
              </button>

              <button
                onClick={() => setActiveTab('payment_history')}
                style={{
                  padding: '0.5rem 1.1rem',
                  borderRadius: '8px',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  backgroundColor: activeTab === 'payment_history' ? '#2563eb' : 'transparent',
                  color: activeTab === 'payment_history' ? '#fff' : '#94a3b8'
                }}
              >
                <Clock size={16} /> Payment History
              </button>

              <button
                onClick={() => setActiveTab('aging_report')}
                style={{
                  padding: '0.5rem 1.1rem',
                  borderRadius: '8px',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  backgroundColor: activeTab === 'aging_report' ? '#2563eb' : 'transparent',
                  color: activeTab === 'aging_report' ? '#fff' : '#94a3b8'
                }}
              >
                <FileText size={16} /> Aging Report
              </button>
            </div>

            {/* Search & Status Filter */}
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
              <div style={{ position: 'relative', width: '280px' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, phone or CNIC..."
                  style={{
                    width: '100%',
                    padding: '0.45rem 0.5rem 0.45rem 2.1rem',
                    backgroundColor: '#0a1324',
                    border: '1px solid #1e2d4a',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '0.45rem 0.75rem',
                  backgroundColor: '#0a1324',
                  border: '1px solid #1e2d4a',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.85rem'
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="DUE">Due</option>
                <option value="CLEARED">Cleared</option>
                <option value="OVERDUE">Overdue</option>
              </select>
            </div>
          </div>

          {/* TAB 1: CUSTOMER LIST & RIGHT DETAILS PANEL */}
          {activeTab === 'customer_list' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.25rem' }}>
              {/* Left Customer Table */}
              <div style={{ backgroundColor: '#0a1324', border: '1px solid #1e2d4a', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#0f1c36', borderBottom: '1px solid #1e2d4a', textAlign: 'left', color: '#94a3b8' }}>
                        <th style={{ padding: '0.75rem 0.85rem' }}>#</th>
                        <th style={{ padding: '0.75rem 0.85rem' }}>Customer Name</th>
                        <th style={{ padding: '0.75rem 0.85rem' }}>Phone</th>
                        <th style={{ padding: '0.75rem 0.85rem' }}>Total Udhaar</th>
                        <th style={{ padding: '0.75rem 0.85rem' }}>Paid Amount</th>
                        <th style={{ padding: '0.75rem 0.85rem' }}>Balance</th>
                        <th style={{ padding: '0.75rem 0.85rem' }}>Last Transaction</th>
                        <th style={{ padding: '0.75rem 0.85rem' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customers.map((c: UdhaarCustomer, idx: number) => {
                        const isSelected = selectedCustomer?.id === c.id;
                        return (
                          <tr
                            key={c.id}
                            onClick={() => setSelectedCustomer(c)}
                            style={{
                              borderBottom: '1px solid #16243d',
                              backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.15)' : 'transparent',
                              cursor: 'pointer',
                              transition: 'background-color 0.15s'
                            }}
                          >
                            <td style={{ padding: '0.75rem 0.85rem', color: '#64748b' }}>{idx + 1}.</td>
                            <td style={{ padding: '0.75rem 0.85rem', fontWeight: 600, color: '#fff' }}>{c.name}</td>
                            <td style={{ padding: '0.75rem 0.85rem', color: '#94a3b8' }}>{c.mobile}</td>
                            <td style={{ padding: '0.75rem 0.85rem', color: '#94a3b8' }}>Rs. {c.total_udhaar.toLocaleString()}</td>
                            <td style={{ padding: '0.75rem 0.85rem', color: '#34d399' }}>Rs. {c.paid_amount.toLocaleString()}</td>
                            <td style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: c.balance > 0 ? '#f87171' : '#34d399' }}>
                              Rs. {c.balance.toLocaleString()}
                            </td>
                            <td style={{ padding: '0.75rem 0.85rem', color: '#64748b', fontSize: '0.8rem' }}>
                              {c.last_transaction_date ? new Date(c.last_transaction_date).toLocaleDateString() : '—'}
                            </td>
                            <td style={{ padding: '0.75rem 0.85rem' }}>
                              <span
                                style={{
                                  padding: '3px 10px',
                                  borderRadius: '12px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  backgroundColor: c.status === 'CLEARED' ? 'rgba(16, 185, 129, 0.2)' : (c.status === 'OVERDUE' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(245, 158, 11, 0.2)'),
                                  color: c.status === 'CLEARED' ? '#34d399' : (c.status === 'OVERDUE' ? '#f87171' : '#fbbf24')
                                }}
                              >
                                {c.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right Customer Details Panel */}
              {selectedCustomer ? (
                <div
                  style={{
                    backgroundColor: '#0a1324',
                    border: '1px solid #1e2d4a',
                    borderRadius: '14px',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#fff' }}>Customer Details</h4>
                    <button
                      onClick={() => openCustomerLedger(selectedCustomer)}
                      style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                    >
                      <Edit2 size={14} /> Edit
                    </button>
                  </div>

                  {/* Avatar & Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', backgroundColor: '#0f1c36', padding: '0.85rem', borderRadius: '12px' }}>
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        backgroundColor: '#2563eb',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '1.1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {selectedCustomer.name.split(' ').map((n: string) => n[0]).join('')}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {selectedCustomer.name}
                        <a
                          href={`https://wa.me/92${selectedCustomer.mobile.replace(/\D/g, '').replace(/^0/, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#22c55e', textDecoration: 'none' }}
                          title="Open WhatsApp chat"
                        >
                          <MessageSquare size={16} />
                        </a>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>{selectedCustomer.mobile}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{selectedCustomer.address || 'Lahore, Pakistan'}</div>
                    </div>
                  </div>

                  {/* Stat Boxes */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                    <div style={{ backgroundColor: '#0f1a30', padding: '0.5rem', borderRadius: '8px', border: '1px solid #1e2f4d' }}>
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Total Udhaar</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8' }}>Rs. {selectedCustomer.total_udhaar}</div>
                    </div>
                    <div style={{ backgroundColor: '#0f1a30', padding: '0.5rem', borderRadius: '8px', border: '1px solid #1e2f4d' }}>
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Paid Amount</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#34d399' }}>Rs. {selectedCustomer.paid_amount}</div>
                    </div>
                    <div style={{ backgroundColor: '#0f1a30', padding: '0.5rem', borderRadius: '8px', border: '1px solid #1e2f4d' }}>
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Balance</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: selectedCustomer.balance > 0 ? '#f87171' : '#34d399' }}>Rs. {selectedCustomer.balance}</div>
                    </div>
                  </div>

                  {/* Details List */}
                  <div style={{ fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px solid #1e2d4a', paddingTop: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Status:</span>
                      <span style={{ fontWeight: 700, color: selectedCustomer.status === 'CLEARED' ? '#34d399' : '#f87171' }}>{selectedCustomer.status}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Credit Limit:</span>
                      <span>Rs. {selectedCustomer.credit_limit.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Last Transaction:</span>
                      <span>{selectedCustomer.last_transaction_date ? new Date(selectedCustomer.last_transaction_date).toLocaleDateString() : '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Customer Since:</span>
                      <span>12 Jan 2025</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: 'auto' }}>
                    <button
                      onClick={() => openCustomerLedger(selectedCustomer)}
                      style={{
                        padding: '0.6rem',
                        backgroundColor: '#10b981',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        fontSize: '0.85rem'
                      }}
                    >
                      <CreditCard size={16} /> Receive Payment
                    </button>

                    <button
                      onClick={() => setShowNewModal(true)}
                      style={{
                        padding: '0.6rem',
                        backgroundColor: '#2563eb',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        fontSize: '0.85rem'
                      }}
                    >
                      <Plus size={16} /> + New Udhaar
                    </button>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <button
                        onClick={() => openCustomerLedger(selectedCustomer)}
                        style={{
                          padding: '0.5rem',
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          color: '#fff',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.3rem',
                          fontSize: '0.78rem'
                        }}
                      >
                        <FileText size={14} /> View Ledger
                      </button>

                      <button
                        onClick={() => alert('Printing customer statement...')}
                        style={{
                          padding: '0.5rem',
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          color: '#fff',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.3rem',
                          fontSize: '0.78rem'
                        }}
                      >
                        <Printer size={14} /> Print Statement
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* TAB 2: PAYMENT HISTORY */}
          {activeTab === 'payment_history' && (
            <div style={{ backgroundColor: '#0a1324', border: '1px solid #1e2d4a', borderRadius: '14px', padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#fff', fontSize: '1rem', fontWeight: 700 }}>Recent Udhaar Payments & Collections</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#0f1c36', borderBottom: '1px solid #1e2d4a', textAlign: 'left', color: '#94a3b8' }}>
                      <th style={{ padding: '0.75rem' }}>Customer</th>
                      <th style={{ padding: '0.75rem' }}>Mobile</th>
                      <th style={{ padding: '0.75rem' }}>Category</th>
                      <th style={{ padding: '0.75rem' }}>Total Credit</th>
                      <th style={{ padding: '0.75rem' }}>Paid Amount</th>
                      <th style={{ padding: '0.75rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c: UdhaarCustomer) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #16243d' }}>
                        <td style={{ padding: '0.75rem', fontWeight: 600, color: '#fff' }}>{c.name}</td>
                        <td style={{ padding: '0.75rem', color: '#94a3b8' }}>{c.mobile}</td>
                        <td style={{ padding: '0.75rem', color: '#38bdf8' }}>{c.category}</td>
                        <td style={{ padding: '0.75rem', color: '#94a3b8' }}>Rs. {c.total_udhaar.toLocaleString()}</td>
                        <td style={{ padding: '0.75rem', color: '#34d399', fontWeight: 700 }}>Rs. {c.paid_amount.toLocaleString()}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 700, backgroundColor: c.status === 'CLEARED' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: c.status === 'CLEARED' ? '#34d399' : '#f87171' }}>
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: AGING REPORT */}
          {activeTab === 'aging_report' && (
            <div style={{ backgroundColor: '#0a1324', border: '1px solid #1e2d4a', borderRadius: '14px', padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#fff', fontSize: '1rem', fontWeight: 700 }}>Udhaar Aging Breakdown & Risk Analysis</h3>
              <p style={{ margin: '0 0 1.25rem 0', color: '#94a3b8', fontSize: '0.85rem' }}>Categorization of customer dues by duration</p>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ backgroundColor: '#0f1a30', border: '1px solid #1e2f4d', borderRadius: '10px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>0 - 30 Days (Current)</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#34d399', marginTop: '4px' }}>Rs. {agingData?.aging_buckets ? agingData.aging_buckets['0_30'].amount.toLocaleString() : '172,770'}</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>Low Risk</div>
                </div>

                <div style={{ backgroundColor: '#0f1a30', border: '1px solid #1e2f4d', borderRadius: '10px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>31 - 60 Days</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fbbf24', marginTop: '4px' }}>Rs. {agingData?.aging_buckets ? agingData.aging_buckets['31_60'].amount.toLocaleString() : '68,200'}</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>Medium Risk</div>
                </div>

                <div style={{ backgroundColor: '#0f1a30', border: '1px solid #1e2f4d', borderRadius: '10px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>61 - 90 Days</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f97316', marginTop: '4px' }}>Rs. {agingData?.aging_buckets ? agingData.aging_buckets['61_90'].amount.toLocaleString() : '28,450'}</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>High Risk</div>
                </div>

                <div style={{ backgroundColor: '#0f1a30', border: '1px solid #1e2f4d', borderRadius: '10px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>90+ Days (Overdue)</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ef4444', marginTop: '4px' }}>Rs. {agingData?.aging_buckets ? agingData.aging_buckets['90_plus'].amount.toLocaleString() : '16,000'}</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>Critical Action Needed</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================== */}
      {/* 4. LEDGER & RECEIVE PAYMENT SUB-VIEW (Screenshots #3, #4, #5) */}
      {/* ================================================== */}
      {viewMode === 'ledger' && selectedCustomer && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Customer Search Bar */}
          <div style={{ backgroundColor: '#0a1324', border: '1px solid #1e2d4a', borderRadius: '14px', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Name, Mobile, Serial No. or CNIC (last 4 digits)..."
                style={{
                  width: '100%',
                  padding: '0.65rem 0.65rem 0.65rem 2.4rem',
                  backgroundColor: '#0f1a30',
                  border: '1px solid #1e2f4d',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              onClick={() => loadData()}
              style={{ padding: '0.65rem 1.25rem', backgroundColor: '#2563eb', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Search size={16} /> Search
            </button>

            <button
              onClick={() => alert('CNIC scan initiated... Last 4 digits: 5678')}
              style={{ padding: '0.65rem 1.25rem', backgroundColor: '#0f1c36', border: '1px solid #1e2f4d', borderRadius: '8px', color: '#38bdf8', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Scan size={16} /> Scan CNIC (Auto fetch last 4 digits)
            </button>
          </div>

          {/* Customer Detail Banner & Status Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.25rem' }}>
            {/* Customer Details Box */}
            <div style={{ backgroundColor: '#0a1324', border: '1px solid #1e2d4a', borderRadius: '14px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div
                    style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '50%',
                      backgroundColor: '#2563eb',
                      color: '#fff',
                      fontSize: '1.3rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {selectedCustomer.name.split(' ').map((n: string) => n[0]).join('')}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>{selectedCustomer.name}</h2>
                      <span style={{ fontSize: '0.72rem', backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                        Active
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '2px' }}>{selectedCustomer.mobile}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>CNIC: *****{selectedCustomer.serial_no} (Last 4: {selectedCustomer.serial_no})</div>
                  </div>
                </div>

                <button style={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff', padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                  <Edit2 size={14} /> Edit
                </button>
              </div>

              {/* Badges & Meta */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ backgroundColor: '#ef4444', color: '#fff', fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: '6px' }}>
                  Serial No.: {selectedCustomer.serial_no}
                </span>
                <span style={{ backgroundColor: '#0f1c36', border: '1px solid #1e2f4d', color: '#38bdf8', fontSize: '0.75rem', padding: '3px 10px', borderRadius: '6px' }}>
                  Matches with CNIC last 4 digits
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem', color: '#94a3b8', borderTop: '1px solid #1e2d4a', paddingTop: '0.75rem' }}>
                <div>Reference: <strong style={{ color: '#fff' }}>{selectedCustomer.reference || 'Dr. Usman (OPD)'}</strong></div>
                <div>Address: <strong style={{ color: '#fff' }}>{selectedCustomer.address || 'Lahore'}</strong></div>
                <div>Customer Since: <strong style={{ color: '#fff' }}>12 Jan 2025</strong></div>
                <div>Category: <strong style={{ color: '#fff' }}>{selectedCustomer.category}</strong></div>
              </div>
            </div>

            {/* Right Status Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <span style={{ backgroundColor: selectedCustomer.status === 'CLEARED' ? '#10b981' : '#ef4444', color: '#fff', fontSize: '0.8rem', fontWeight: 800, padding: '4px 14px', borderRadius: '6px' }}>
                  {selectedCustomer.status}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ backgroundColor: '#0a1324', border: '1px solid #1e2d4a', borderRadius: '12px', padding: '0.85rem' }}>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Total Udhaar</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#38bdf8' }}>Rs. {selectedCustomer.total_udhaar.toLocaleString()}</div>
                </div>

                <div style={{ backgroundColor: '#0a1324', border: '1px solid #1e2d4a', borderRadius: '12px', padding: '0.85rem' }}>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Paid Amount</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#34d399' }}>Rs. {selectedCustomer.paid_amount.toLocaleString()}</div>
                </div>

                <div style={{ backgroundColor: '#0a1324', border: '1px solid #1e2d4a', borderRadius: '12px', padding: '0.85rem' }}>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Balance</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: selectedCustomer.balance > 0 ? '#f87171' : '#34d399' }}>Rs. {selectedCustomer.balance.toLocaleString()}</div>
                </div>

                <div style={{ backgroundColor: '#0a1324', border: '1px solid #1e2d4a', borderRadius: '12px', padding: '0.85rem' }}>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Total Transactions</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>{customerTransactions.length || 12}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Lower Grid: Transaction History vs Receive Payment Form */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.25rem' }}>
            {/* Transaction History Table Panel */}
            <div style={{ backgroundColor: '#0a1324', border: '1px solid #1e2d4a', borderRadius: '14px', padding: '1.25rem', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <FileText size={18} color="#38bdf8" /> Transaction History
                </h3>
                <button style={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                  <Printer size={14} /> Print Statement
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#0f1c36', borderBottom: '1px solid #1e2d4a', textAlign: 'left', color: '#94a3b8' }}>
                      <th style={{ padding: '0.65rem' }}>#</th>
                      <th style={{ padding: '0.65rem' }}>Date</th>
                      <th style={{ padding: '0.65rem' }}>Description</th>
                      <th style={{ padding: '0.65rem' }}>Amount (Rs.)</th>
                      <th style={{ padding: '0.65rem' }}>Type</th>
                      <th style={{ padding: '0.65rem' }}>Balance (Rs.)</th>
                      <th style={{ padding: '0.65rem' }}>User</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>
                          No transactions recorded yet.
                        </td>
                      </tr>
                    ) : (
                      customerTransactions.map((t: UdhaarTransaction, idx: number) => (
                        <tr key={t.id || idx} style={{ borderBottom: '1px solid #16243d' }}>
                          <td style={{ padding: '0.65rem', color: '#64748b' }}>{idx + 1}</td>
                          <td style={{ padding: '0.65rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                            {new Date(t.date_time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td style={{ padding: '0.65rem', color: '#fff' }}>{t.description || 'Udhaar Transaction'}</td>
                          <td style={{ padding: '0.65rem', fontWeight: 700, color: t.type === 'CREDIT' ? '#34d399' : '#f87171' }}>
                            {t.amount.toLocaleString()}
                          </td>
                          <td style={{ padding: '0.65rem' }}>
                            <span style={{ fontWeight: 700, color: t.type === 'CREDIT' ? '#34d399' : '#f87171' }}>
                              {t.type === 'CREDIT' ? 'Credit' : 'Debit'}
                            </span>
                          </td>
                          <td style={{ padding: '0.65rem', fontWeight: 600, color: '#94a3b8' }}>{t.balance_after.toLocaleString()}</td>
                          <td style={{ padding: '0.65rem', color: '#64748b', fontSize: '0.8rem' }}>{t.created_by_user_name}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Receive Payment Form Box */}
            <div style={{ backgroundColor: '#0a1324', border: '1px solid #1e2d4a', borderRadius: '14px', padding: '1.25rem', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <CreditCard size={18} color="#34d399" /> Receive Payment
              </h3>

              <form onSubmit={handleReceivePaymentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                      Amount Received (Rs.) *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>₹</span>
                      <input
                        type="number"
                        min="1"
                        required
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        placeholder="1000"
                        style={{
                          width: '100%',
                          padding: '0.55rem 0.55rem 0.55rem 2rem',
                          backgroundColor: '#0f1a30',
                          border: '1px solid #1e2f4d',
                          borderRadius: '8px',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '0.95rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                      Payment Method
                    </label>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.55rem',
                        backgroundColor: '#0f1a30',
                        border: '1px solid #1e2f4d',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '0.85rem',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="CASH">Cash</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="JAZZCASH">JazzCash</option>
                      <option value="EASYPAISA">EasyPaisa</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                    Date
                  </label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.55rem',
                      backgroundColor: '#0f1a30',
                      border: '1px solid #1e2f4d',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#94a3b8' }}>
                      Notes (Optional)
                    </label>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{payNotes.length}/200</span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={200}
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    placeholder="e.g. Partial payment, full settlement, etc."
                    style={{
                      width: '100%',
                      padding: '0.55rem',
                      backgroundColor: '#0f1a30',
                      border: '1px solid #1e2f4d',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingPay}
                  style={{
                    padding: '0.75rem',
                    backgroundColor: '#10b981',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
                    marginTop: '0.5rem'
                  }}
                >
                  <CheckCircle2 size={18} /> {submittingPay ? 'Saving...' : 'Save Payment'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* New Udhaar Modal */}
      <NewUdhaarModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onSuccess={(newCust) => {
          loadData();
          openCustomerLedger(newCust);
        }}
      />
    </div>
  );
};

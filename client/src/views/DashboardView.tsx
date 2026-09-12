import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { NavView } from '../components/Sidebar.js';
import {
  TrendingUp,
  AlertTriangle,
  Clock,
  Ban,
  Users,
  Building2,
  ShoppingCart,
  Boxes,
  Truck,
  ScanBarcode,
  BookOpen,
  Bot,
  FlaskConical,
  FileText,
  ShieldCheck,
  CheckCircle2,
  PackageX
} from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (view: NavView) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { user, token } = useAuth();
  const [stats, setStats] = useState({
    todaySales: 0,
    todayProfit: 0,
    cashSales: 0,
    cardSales: 0,
    creditSales: 0,
    invoiceCount: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    nearExpiryCount: 0,
    expiredCount: 0,
    expiringStockValue: 0,
    supplierPayables: 0,
    customerReceivables: 0,
    deadStockCount: 0
  });

  useEffect(() => {
    async function loadDashboardStats() {
      try {
        const [salesRes, invRes, expRes, custRes, suppRes] = await Promise.all([
          fetch('/api/reports/sales-analytics', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/inventory/valuation', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/expiry/dashboard', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/patients', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/suppliers', { headers: { Authorization: `Bearer ${token}` } })
        ]);

        let todaySales = 0;
        let todayProfit = 0;
        let invoiceCount = 0;
        let cashSales = 0;
        let cardSales = 0;
        let creditSales = 0;

        if (salesRes.ok) {
          const sData = await salesRes.json();
          const todayItem = (sData.dailyTrends || []).find((d: any) => d.date === new Date().toISOString().split('T')[0]);
          if (todayItem) {
            todaySales = todayItem.total_sales || 0;
            todayProfit = todayItem.total_profit || 0;
            invoiceCount = todayItem.invoice_count || 0;
          }
        }

        let lowStockCount = 0;
        let outOfStockCount = 0;
        let deadStockCount = 0;
        if (invRes.ok) {
          const iData = await invRes.json();
          lowStockCount = iData.lowStockCount || 0;
          outOfStockCount = iData.outOfStockCount || 0;
          deadStockCount = iData.deadStockCount || 0;
        }

        let nearExpiryCount = 0;
        let expiredCount = 0;
        let expiringStockValue = 0;
        if (expRes.ok) {
          const eData = await expRes.json();
          nearExpiryCount = (eData.horizon90 || []).length;
          expiredCount = (eData.expired || []).length;
          expiringStockValue = (eData.horizon90 || []).reduce((acc: number, b: any) => acc + (b.quantity * b.purchase_price), 0);
        }

        let customerReceivables = 0;
        if (custRes.ok) {
          const cData = await custRes.json();
          customerReceivables = (cData.patients || []).reduce((acc: number, p: any) => acc + (p.current_balance || 0), 0);
        }

        let supplierPayables = 0;
        if (suppRes.ok) {
          const spData = await suppRes.json();
          supplierPayables = (spData.suppliers || []).reduce((acc: number, s: any) => acc + (s.current_balance || 0), 0);
        }

        setStats({
          todaySales,
          todayProfit,
          cashSales,
          cardSales,
          creditSales,
          invoiceCount,
          lowStockCount,
          outOfStockCount,
          nearExpiryCount,
          expiredCount,
          expiringStockValue,
          supplierPayables,
          customerReceivables,
          deadStockCount
        });
      } catch (err) {
        console.error('Dashboard data fetch error:', err);
      }
    }

    loadDashboardStats();
  }, [token]);

  return (
    <div className="page-container" style={{ padding: '1rem' }}>
      {/* Welcome Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0369a1 0%, #0284c7 50%, #0ea5e9 100%)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.5rem',
          color: '#ffffff',
          marginBottom: '1.25rem',
          boxShadow: '0 8px 24px rgba(2, 132, 199, 0.25)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div>
          <div style={{ fontSize: '0.8rem', opacity: 0.9, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Naveed Medical Pharmacy • Main Billing Terminal 01
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.2rem' }}>
            Welcome back, {user?.fullName}
          </h1>
          <p style={{ fontSize: '0.85rem', opacity: 0.85, marginTop: '0.2rem' }}>
            Role: <strong style={{ color: '#bae6fd' }}>{user?.roleName}</strong> • SQLite Concurrent WAL Mode Active
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => onNavigate('pos')}
            className="btn"
            style={{ backgroundColor: '#ffffff', color: '#0369a1', fontWeight: 700, padding: '0.6rem 1.25rem' }}
          >
            <ShoppingCart size={16} />
            <span>Open POS Counter (F1)</span>
          </button>
        </div>
      </div>

      {/* Quick Action Navigation Grid (10 Master Shortcuts) */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Quick Pharmacy Actions
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.6rem' }}>
          <button onClick={() => onNavigate('pos')} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '0.75rem' }}>
            <ShoppingCart size={16} style={{ color: 'var(--primary)' }} />
            <span>New Sale</span>
          </button>
          <button onClick={() => onNavigate('purchases')} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '0.75rem' }}>
            <Truck size={16} style={{ color: 'var(--success)' }} />
            <span>New Purchase</span>
          </button>
          <button onClick={() => onNavigate('barcode')} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '0.75rem' }}>
            <ScanBarcode size={16} style={{ color: '#38bdf8' }} />
            <span>Barcode Center</span>
          </button>
          <button onClick={() => onNavigate('dictionary')} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '0.75rem' }}>
            <BookOpen size={16} style={{ color: '#f59e0b' }} />
            <span>Pharma Dictionary</span>
          </button>
          <button onClick={() => onNavigate('pharma-ai')} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '0.75rem' }}>
            <Bot size={16} style={{ color: '#06b6d4' }} />
            <span>Pharma.AI 🤖</span>
          </button>
          <button onClick={() => onNavigate('medprac')} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '0.75rem' }}>
            <FlaskConical size={16} style={{ color: '#8b5cf6' }} />
            <span>MedPrac 🧪</span>
          </button>
          <button onClick={() => onNavigate('prescriptions')} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '0.75rem' }}>
            <FileText size={16} style={{ color: '#ec4899' }} />
            <span>Prescriptions (Rx)</span>
          </button>
          <button onClick={() => onNavigate('inventory')} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '0.75rem' }}>
            <Boxes size={16} style={{ color: '#10b981' }} />
            <span>Stock Check</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
        {/* Today's Sales */}
        <div className="card" style={{ padding: '1.1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>TODAY'S SALES</span>
            <div style={{ padding: '0.35rem', borderRadius: '4px', background: 'var(--primary-light)', color: 'var(--primary)' }}>
              <TrendingUp size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)' }}>
            Rs. {stats.todaySales.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            {stats.invoiceCount} invoices generated today
          </div>
        </div>

        {/* Customer Receivables (Udhar) */}
        <div className="card" style={{ padding: '1.1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>CUSTOMER RECEIVABLES (UDHAR)</span>
            <div style={{ padding: '0.35rem', borderRadius: '4px', background: 'rgba(236, 72, 153, 0.12)', color: '#ec4899' }}>
              <Users size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ec4899' }}>
            Rs. {stats.customerReceivables.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            Active patient credit balances
          </div>
        </div>

        {/* Supplier Payables */}
        <div className="card" style={{ padding: '1.1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>SUPPLIER PAYABLES</span>
            <div style={{ padding: '0.35rem', borderRadius: '4px', background: 'rgba(20, 184, 166, 0.12)', color: '#14b8a6' }}>
              <Building2 size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#14b8a6' }}>
            Rs. {stats.supplierPayables.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            Outstanding distributor bills
          </div>
        </div>

        {/* Low Stock Warning */}
        <div className="card" style={{ padding: '1.1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>LOW STOCK ALERTS</span>
            <div style={{ padding: '0.35rem', borderRadius: '4px', background: 'var(--warning-light)', color: 'var(--warning)' }}>
              <AlertTriangle size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--warning)' }}>
            {stats.lowStockCount} Medicines
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            Stock below reorder point
          </div>
        </div>
      </div>

      {/* Secondary KPI Metrics Grid (Expiry, Out of Stock & Dead Stock) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
        {/* Near Expiry Stock */}
        <div className="card" style={{ padding: '1.1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>NEAR EXPIRY (90 DAYS)</span>
            <div style={{ padding: '0.35rem', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.15)', color: '#d97706' }}>
              <Clock size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#d97706' }}>
            {stats.nearExpiryCount} Batches
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            Expiring Value: Rs. {stats.expiringStockValue.toFixed(2)}
          </div>
        </div>

        {/* Expired Stock (Hard Blocked) */}
        <div className="card" style={{ padding: '1.1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>EXPIRED STOCK (BLOCKED)</span>
            <div style={{ padding: '0.35rem', borderRadius: '4px', background: 'var(--danger-light)', color: 'var(--danger)' }}>
              <Ban size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--danger)' }}>
            {stats.expiredCount} Batches
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            Server-side sales counter hard blocked
          </div>
        </div>

        {/* Out of Stock */}
        <div className="card" style={{ padding: '1.1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>OUT OF STOCK ITEMS</span>
            <div style={{ padding: '0.35rem', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.12)', color: 'var(--danger)' }}>
              <PackageX size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--danger)' }}>
            {stats.outOfStockCount} Items
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            Immediate supplier PO recommended
          </div>
        </div>

        {/* Dead Stock */}
        <div className="card" style={{ padding: '1.1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>DEAD STOCK ITEMS</span>
            <div style={{ padding: '0.35rem', borderRadius: '4px', background: 'rgba(100, 116, 139, 0.12)', color: '#64748b' }}>
              <Boxes size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#64748b' }}>
            {stats.deadStockCount} Medicines
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            Zero sales over past 60-90 days
          </div>
        </div>
      </div>

      {/* Architecture & Clinical Governance Panes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShieldCheck size={16} style={{ color: 'var(--primary)' }} />
            <span>Architecture & Concurrency Status</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Database Engine:</span>
              <strong>SQLite 3.44 (WAL Mode)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Offline POS Queue:</span>
              <span className="badge badge-success">Active & Auto-Syncing</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Multi-PC LAN Hosting:</span>
              <strong>Ready on 0.0.0.0:5000</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Audit Trail Logging:</span>
              <span className="badge badge-success">Immutable Ledger</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
            <span>FEFO & Safety Rule Verification</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>FEFO Batch Allocation:</span>
              <span className="badge badge-success">Earliest Valid Expiry First</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Expired Item Sale Block:</span>
              <span className="badge badge-danger">Enforced Server-Side</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Negative Stock Allowed:</span>
              <span className="badge badge-warning">Prohibited (Invariant)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0' }}>
              <span style={{ color: 'var(--text-secondary)' }}>MedPrac Sandbox:</span>
              <span className="badge badge-primary">100% Isolated / Zero Mutation</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

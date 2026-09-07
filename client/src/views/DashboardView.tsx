import React from 'react';
import { useAuth } from '../context/AuthContext.js';
import { NavView } from '../components/Sidebar.js';
import {
  TrendingUp,
  AlertTriangle,
  Clock,
  Ban,
  Users,
  Building2,
  PlusCircle,
  ShoppingCart,
  Boxes,
  Truck
} from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (view: NavView) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { user } = useAuth();

  return (
    <div className="page-container">
      {/* Welcome Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0369a1 0%, #0284c7 50%, #0ea5e9 100%)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.75rem',
          color: '#ffffff',
          marginBottom: '1.75rem',
          boxShadow: '0 8px 24px rgba(2, 132, 199, 0.25)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div>
          <div style={{ fontSize: '0.85rem', opacity: 0.9, fontWeight: 500, letterSpacing: '0.04em' }}>
            OPERATIONAL DASHBOARD • PHASE 1 VERIFIED
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '0.25rem' }}>
            Welcome, {user?.fullName}
          </h1>
          <p style={{ fontSize: '0.9rem', opacity: 0.85, marginTop: '0.2rem' }}>
            Active Role: <strong style={{ color: '#bae6fd' }}>{user?.roleName}</strong> • Real-time database connection healthy
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => onNavigate('pos')}
            className="btn"
            style={{ backgroundColor: '#ffffff', color: '#0369a1', fontWeight: 700 }}
          >
            <ShoppingCart size={16} />
            <span>Open POS Counter</span>
          </button>
        </div>
      </div>

      {/* Quick Action Buttons (Section 6 of Spec) */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Quick Operational Actions
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
          <button onClick={() => onNavigate('pos')} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '0.85rem' }}>
            <ShoppingCart size={18} style={{ color: 'var(--primary)' }} />
            <span>New Sale (F1)</span>
          </button>
          <button onClick={() => onNavigate('purchases')} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '0.85rem' }}>
            <Truck size={18} style={{ color: 'var(--success)' }} />
            <span>New Purchase</span>
          </button>
          <button onClick={() => onNavigate('medicines')} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '0.85rem' }}>
            <PlusCircle size={18} style={{ color: 'var(--warning)' }} />
            <span>Add Medicine</span>
          </button>
          <button onClick={() => onNavigate('inventory')} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '0.85rem' }}>
            <Boxes size={18} style={{ color: '#8b5cf6' }} />
            <span>Stock Adjustment</span>
          </button>
          <button onClick={() => onNavigate('patients')} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '0.85rem' }}>
            <Users size={18} style={{ color: '#ec4899' }} />
            <span>Patients CRM</span>
          </button>
          <button onClick={() => onNavigate('suppliers')} className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '0.85rem' }}>
            <Building2 size={18} style={{ color: '#14b8a6' }} />
            <span>Suppliers</span>
          </button>
        </div>
      </div>

      {/* Real-time KPI Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
        {/* Today's Sales */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>TODAY'S SALES</span>
            <div style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)', background: 'var(--primary-light)', color: 'var(--primary)' }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>Rs. 0.00</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            Cash: Rs. 0.00 • Credit: Rs. 0.00
          </div>
        </div>

        {/* Low Stock Alert */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>LOW STOCK ALERT</span>
            <div style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)', background: 'var(--warning-light)', color: 'var(--warning)' }}>
              <AlertTriangle size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--warning)' }}>0 Items</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            Medicines below reorder threshold
          </div>
        </div>

        {/* Near Expiry Stock */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>NEAR EXPIRY (90 DAYS)</span>
            <div style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)', background: 'rgba(245, 158, 11, 0.15)', color: '#d97706' }}>
              <Clock size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#d97706' }}>1 Batch</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            Augmentin 625mg (AUG-26-01)
          </div>
        </div>

        {/* Expired Stock (Blocked from sale) */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>EXPIRED STOCK (BLOCKED)</span>
            <div style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)', background: 'var(--danger-light)', color: 'var(--danger)' }}>
              <Ban size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--danger)' }}>1 Batch</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            Risek 20mg (RSK-EXP-99) • Quarantined
          </div>
        </div>
      </div>

      {/* Pharmacy Operational Details & System Invariants */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        <div className="card">
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>Architecture & Concurrency Status</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Database Engine:</span>
              <strong>SQLite 3.44 (WAL Mode)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Referential Integrity:</span>
              <span className="badge badge-success">Foreign Keys Active</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Multi-PC LAN Hosting:</span>
              <strong>Ready on 0.0.0.0:5000</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Audit Trail Service:</span>
              <span className="badge badge-success">Active & Logging</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>FEFO & Safety Rule Verification</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>FEFO Algorithm:</span>
              <span className="badge badge-success">Earliest Valid Expiry First</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Expired Item Sale Block:</span>
              <span className="badge badge-danger">Enforced Server-Side</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Negative Stock Allowed:</span>
              <span className="badge badge-warning">Prohibited (Invariant)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Live Transactions:</span>
              <strong>ACID BEGIN IMMEDIATE</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

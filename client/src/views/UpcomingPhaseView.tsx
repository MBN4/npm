import React from 'react';
import { NavView } from '../components/Sidebar.js';
import { Layers, Clock } from 'lucide-react';

const phaseDetails: Record<NavView, { phase: string; title: string; desc: string }> = {
  dashboard: { phase: 'Phase 1', title: 'Dashboard', desc: 'Real-time operational dashboard & quick actions.' },
  pos: { phase: 'Phase 4', title: 'POS & Billing Counter', desc: 'Fast medicine search, barcode reader, FEFO batch selection, held bills, sales returns, 80mm thermal receipt.' },
  medicines: { phase: 'Phase 2', title: 'Medicine Master', desc: 'Brand names, generics, manufacturers, dosages, strengths, custom barcodes, and rack locations.' },
  inventory: { phase: 'Phase 2', title: 'Batch Inventory & Stock', desc: 'Batch tracking, physical count adjustments, stock valuation, and movement traceability.' },
  forecast: { phase: 'Phase 9', title: 'Demand Forecasting & Auto-Reordering', desc: 'ADC calculation, days of stock remaining, stockout risk alerts, and automated purchase order generation.' },
  purchases: { phase: 'Phase 3', title: 'Purchases & Inward Goods', desc: 'Supplier purchase invoices, batch creation, bonus quantities, and purchase returns.' },
  suppliers: { phase: 'Phase 3', title: 'Suppliers & Ledgers', desc: 'Distributor profiles, payment recording, and balance payables.' },
  'drug-ai': { phase: 'Phase 10', title: 'Drug AI & Safety Assistant', desc: 'Drug-drug interactions, pregnancy/lactation warnings, salt composition, and clinical references.' },
  prescriptions: { phase: 'Phase 5', title: 'Prescriptions (Rx)', desc: 'Doctor prescriptions, dosages (OD, BD, TDS), refill history, and image attachment.' },
  patients: { phase: 'Phase 5', title: 'Patients & Customer CRM', desc: 'Patient profiles, allergy history, credit receivables ledger, and refill reminders.' },
  expiry: { phase: 'Phase 6', title: 'Expiry Control', desc: 'Configurable expiry windows (180/90/60/30/7 days), supplier return claims, and disposal register.' },
  accounts: { phase: 'Phase 7', title: 'Financial Accounts & Cashbook', desc: 'Daily cashbook entries, expenses, profit & loss statement, and customer receivables.' },
  reports: { phase: 'Phase 8', title: 'Business Reports', desc: 'Sales velocity, fast/slow movers, cashier audit, profit margins, and export to CSV/PDF.' },
  staff: { phase: 'Phase 1', title: 'Staff & Audit', desc: 'User management, roles, and immutable audit logs.' },
  settings: { phase: 'Phase 1', title: 'System Settings', desc: 'Pharmacy info, tax rates, receipt formatting, and backup configurations.' }
};

export const UpcomingPhaseView: React.FC<{ view: NavView }> = ({ view }) => {
  const details = phaseDetails[view] || { phase: 'Upcoming', title: view, desc: 'Module in roadmap' };

  return (
    <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80%' }}>
      <div className="card" style={{ maxWidth: '580px', textAlign: 'center', padding: '2.5rem' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--primary-light)',
            color: 'var(--primary)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.25rem'
          }}
        >
          <Layers size={32} />
        </div>
        <div className="badge badge-primary" style={{ marginBottom: '0.5rem' }}>
          {details.phase}
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.5rem' }}>
          {details.title}
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.6' }}>
          {details.desc}
        </p>

        <div style={{ background: 'var(--bg-app)', padding: '1rem', borderRadius: 'var(--radius-md)', textAlign: 'left', fontSize: '0.8rem', border: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Clock size={14} style={{ color: 'var(--warning)' }} />
            <span>Phased Development Roadmap</span>
          </div>
          <p style={{ color: 'var(--text-muted)' }}>
            Per the Master Build Specification, each phase is rigorously engineered, tested, and validated with manual approval before proceeding.
          </p>
        </div>
      </div>
    </div>
  );
};

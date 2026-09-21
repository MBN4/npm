import React from 'react';
import { NavView } from '../components/Sidebar.js';
import { Layers, Clock } from 'lucide-react';

const phaseDetails: Record<NavView, { phase: string; title: string; desc: string }> = {
  dashboard: { phase: 'Live', title: 'Dashboard', desc: 'Real-time operational dashboard & quick actions.' },
  pos: { phase: 'Live', title: 'POS & Billing Counter', desc: 'Fast medicine search, barcode reader, FEFO batch selection, held bills, sales returns, 80mm thermal receipt.' },
  medicines: { phase: 'Live', title: 'Medicine Master', desc: 'Brand names, generics, manufacturers, dosages, strengths, custom barcodes, and rack locations.' },
  inventory: { phase: 'Live', title: 'Batch Inventory & Stock', desc: 'Batch tracking, physical count adjustments, stock valuation, and movement traceability.' },
  purchases: { phase: 'Live', title: 'Purchases & Inward Goods', desc: 'Supplier purchase invoices, batch creation, bonus quantities, and purchase returns.' },
  suppliers: { phase: 'Live', title: 'Suppliers & Ledgers', desc: 'Distributor profiles, payment recording, and balance payables.' },
  barcode: { phase: 'Live', title: 'Barcode Center', desc: 'Camera & USB barcode scanner hub, batch QR/Code-128 label generator with multi-column sticker print.' },
  dictionary: { phase: 'Live', title: 'Pharma Dictionary 📚', desc: 'Drug monographs, brand lookups, adult/pediatric dose guidelines, pregnancy risk categories, and food timings.' },
  'pharma-ai': { phase: 'Live', title: 'Pharma.AI 🤖', desc: 'Clinical drug interaction checker, dosage calculator, and AI consult assistant with verified DB data.' },
  medprac: { phase: 'Live', title: 'MedPrac 🧪 Practice Sandbox', desc: '100% isolated learning sandbox for simulated dispensing, dose calculation quizzes, and practice cases.' },
  udhaar: { phase: 'Live', title: 'Udhaar / Customer Credit 👥', desc: 'Customer credit ledger, auto CNIC serial tracking, WhatsApp contact link, and instant payment recording.' },
  prescriptions: { phase: 'Live', title: 'Prescriptions (Rx)', desc: 'Doctor prescriptions, dosages (OD, BD, TDS), refill history, and dispensing to POS.' },
  patients: { phase: 'Live', title: 'Patients & Customer CRM', desc: 'Patient profiles, allergy history, credit receivables ledger, and refill reminders.' },
  expiry: { phase: 'Live', title: 'Expiry Control', desc: 'Configurable expiry windows (180/90/60/30/7 days), supplier return claims, and disposal register.' },
  accounts: { phase: 'Live', title: 'Financial Accounts & Cashbook', desc: 'Daily cashbook entries, expenses, profit & loss statement, and customer receivables.' },
  balance: { phase: 'Live', title: 'Store Balance & Day-End Register', desc: 'Running drawer cash balance, cash additions, operating expenses, and Day-End shift settlements.' },
  reports: { phase: 'Live', title: 'Business Reports', desc: 'Sales velocity, fast/slow movers, cashier audit, profit margins, and export to CSV.' },
  staff: { phase: 'Live', title: 'Staff & Audit', desc: 'User management, roles, and immutable audit logs.' },
  settings: { phase: 'Live', title: 'System Settings', desc: 'Pharmacy info, tax rates, receipt formatting, and backup configurations.' }
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

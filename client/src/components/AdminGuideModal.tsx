import React, { useState } from 'react';
import {
  BookOpen,
  X,
  ShoppingCart,
  Pill,
  Boxes,
  Truck,
  Building2,
  Sparkles,
  FileText,
  Users,
  AlertTriangle,
  ReceiptText,
  BarChart3,
  TrendingUp,
  Settings,
  Database,
  CheckCircle2,
  Lightbulb,
  ShieldAlert,
  ExternalLink
} from 'lucide-react';
import { NavView } from './Sidebar.js';

interface AdminGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: NavView;
  onNavigateToTab?: (tab: NavView) => void;
}

interface TabGuideContent {
  id: NavView | 'backup';
  title: string;
  badge: string;
  icon: React.ReactNode;
  summary: string;
  steps: {
    title: string;
    description: string;
    tip?: string;
  }[];
  rules: string[];
  shortcuts?: { key: string; action: string }[];
}

export const AdminGuideModal: React.FC<AdminGuideModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'pos',
  onNavigateToTab
}) => {
  const [selectedTab, setSelectedTab] = useState<NavView | 'backup'>(initialTab);
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const toggleStep = (stepKey: string) => {
    setCompletedSteps(prev => ({ ...prev, [stepKey]: !prev[stepKey] }));
  };

  const guides: Record<string, TabGuideContent> = {
    pos: {
      id: 'pos',
      title: 'POS Billing & Sales Counter Guide',
      badge: 'Counter Sales',
      icon: <ShoppingCart size={20} />,
      summary: 'High-speed checkout counter with barcode scanner support, automatic FEFO batch allocation, held bills, and customer udhar credit tracking.',
      steps: [
        {
          title: 'Step 1: Scan or Search Medicine',
          description: 'Focus on the top search bar (press F2) and scan the box barcode with your USB/Bluetooth barcode scanner, or type the medicine brand name (e.g. Panadol, Augmentin).',
          tip: 'Scanning a barcode automatically assigns the earliest expiring batch (FEFO).'
        },
        {
          title: 'Step 2: Adjust Quantity & Apply Discounts',
          description: 'In the right-hand Active Cart panel, adjust quantity using the + / - buttons. Enter an optional bill discount as a flat Rupee amount or percentage.',
          tip: 'Discounts update subtotal and net payable in real-time.'
        },
        {
          title: 'Step 3: Link Customer (Optional for Credit)',
          description: 'For cash customers, leave as Walk-in Customer. For account customers, search by mobile number or name to link them and review their current outstanding debt.',
          tip: 'Customer allergy badges appear instantly when selected.'
        },
        {
          title: 'Step 4: Select Payment Method & Finalize',
          description: 'Select Cash, Card, or Credit (Udhar). If Cash, enter amount tendered to see change due. Click "Complete Sale & Print Bill" (F9) to finalize checkout and trigger the thermal receipt.',
          tip: 'Cash drawer automatically kicks open on cash sales if enabled.'
        },
        {
          title: 'Step 5: Park / Recall Held Bills (Queue Management)',
          description: 'If a customer needs to pick up another item, click "Hold Bill" (F4). The cart is saved in memory. When they return, click "Held Bills" in the top bar to instantly recall their cart.',
          tip: 'Held bills survive page reloads and cashier changes.'
        }
      ],
      rules: [
        'Expired batches are strictly blocked from sale by the server.',
        'Stock can never go negative. If stock is insufficient, sale is blocked.',
        'Every completed sale records an immutable audit log entry.'
      ],
      shortcuts: [
        { key: 'F2', action: 'Focus Search Bar' },
        { key: 'F4', action: 'Hold Current Bill' },
        { key: 'F9', action: 'Complete Sale & Print' },
        { key: 'Esc', action: 'Clear Search / Close Modal' }
      ]
    },
    medicines: {
      id: 'medicines',
      title: 'Medicine Master Catalog Guide',
      badge: 'Formulary Master',
      icon: <Pill size={20} />,
      summary: 'Central catalog of all pharmaceutical products with brands, generics, strengths, dosage forms, barcodes, and shelf rack locations.',
      steps: [
        {
          title: 'Step 1: Register New Medicine Master',
          description: 'Click "Add Medicine" button. Enter Brand Name, Generic Molecule, Strength (e.g. 500mg), Dosage Form (Tablet, Syrup, Injection), and Pack Size.',
          tip: 'Generic molecule enables automated cross-brand substitutes and drug safety checks.'
        },
        {
          title: 'Step 2: Assign Rack Location & Barcode',
          description: 'Input the physical Shelf Location (e.g. Rack A-4, Fridge 02) so cashiers can locate medicines in seconds. Enter or scan the manufacturer EAN-13 barcode.',
          tip: 'If the medicine does not have a manufacturer barcode, NMP generates a custom internal code.'
        },
        {
          title: 'Step 3: Define Min Stock Warning & Reorder Levels',
          description: 'Set Minimum Stock Alert Level and Reorder Threshold. When stock dips below this level, yellow/red badges trigger in the inventory and forecasting modules.'
        }
      ],
      rules: [
        'Each medicine must have a unique barcode if barcode is supplied.',
        'Dosage form and strength are mandatory for clinical accuracy.',
        'Deactivating a medicine prevents it from being ordered or sold.'
      ]
    },
    inventory: {
      id: 'inventory',
      title: 'Batch Inventory & Stock Ledger Guide',
      badge: 'FEFO Stock',
      icon: <Boxes size={20} />,
      summary: 'Live batch-wise stock levels, inward shipment tracking, expiry dates, purchase rates, and manual stock reconciliation adjustments.',
      steps: [
        {
          title: 'Step 1: Inspect Batch-Wise Quantities',
          description: 'Search for any medicine to view individual batch numbers, expiry dates, purchase costs, sale prices, and current remaining shelf stock.'
        },
        {
          title: 'Step 2: Physical Count Reconciliation Adjustment',
          description: 'If physical shelf count differs from system count during an audit, click "Stock Adjustment" on the batch. Specify the adjusted quantity and reason (Breakage, Miscount, Theft).',
          tip: 'All adjustments write an immutable entry to the stock movements audit ledger.'
        },
        {
          title: 'Step 3: Filter by Low Stock Alert',
          description: 'Click the "Low Stock" filter badge to display only items that have reached or breached their minimum safety threshold.'
        }
      ],
      rules: [
        'Batch inventory operates strictly on FEFO (First-Expiry-First-Out).',
        'Remaining batch quantities are atomically decremented upon POS checkout.'
      ]
    },
    purchases: {
      id: 'purchases',
      title: 'Supplier Purchasing & GRN Invoices Guide',
      badge: 'Inward GRN',
      icon: <Truck size={20} />,
      summary: 'Inward multi-line purchase invoices from distributors, automatic batch creation, and supplier payables ledger.',
      steps: [
        {
          title: 'Step 1: Open New Purchase Invoice',
          description: 'Navigate to Purchases and click "New Purchase Invoice". Select the Supplier/Distributor and enter their physical invoice number.'
        },
        {
          title: 'Step 2: Add Inward Medicine Lines & Batches',
          description: 'Add each medication line received: select Medicine, enter the Manufacturer Batch Number, Expiry Date (MM/YYYY), Received Quantity, Unit Purchase Cost, and Retail MRP.',
          tip: 'Expiry date is validated to ensure past dates cannot be received.'
        },
        {
          title: 'Step 3: Post Purchase to Inventory & Accounts',
          description: 'Review total bill amount and click "Save Purchase Invoice". Inward stock is atomically added to batch inventory and the supplier ledger is credited.'
        }
      ],
      rules: [
        'Batches created through purchases immediately become available for POS billing.',
        'Purchase cost is recorded at line-item level for exact P&L COGS calculation.'
      ]
    },
    suppliers: {
      id: 'suppliers',
      title: 'Suppliers & Distributor Payables Guide',
      badge: 'Distributors',
      icon: <Building2 size={20} />,
      summary: 'Directory of medicine distributors, purchase order history, and payment voucher recording.',
      steps: [
        {
          title: 'Step 1: Register Pharmaceutical Distributor',
          description: 'Click "Add Supplier". Enter Company Name, Sales Representative Name, Mobile Number, Physical Address, and Tax NTN/STRN.'
        },
        {
          title: 'Step 2: Record Payment Voucher',
          description: 'Click "Record Payment" on a supplier card. Enter the payment amount (Cash / Cheque / Bank Transfer) and reference note. The payable balance is debited.'
        }
      ],
      rules: [
        'Supplier payments automatically create a Cash OUT entry in the cashbook ledger.'
      ]
    },
    patients: {
      id: 'patients',
      title: 'Patient CRM & Customer Udhar Ledger Guide',
      badge: 'Patient Profiles',
      icon: <Users size={20} />,
      summary: 'Patient medical history, drug allergy warnings, and customer credit recovery.',
      steps: [
        {
          title: 'Step 1: Add Patient Profile',
          description: 'Click "Add Patient". Enter Name, Mobile Number, Emergency Contact, and known Drug Allergies (e.g. Penicillin, NSAIDs, Sulfa).'
        },
        {
          title: 'Step 2: Inspect Credit Balance & History',
          description: 'Click on any customer to view total purchase volume, last visit date, outstanding credit balance, and complete transaction ledger.'
        },
        {
          title: 'Step 3: Receive Credit (Udhar) Payment',
          description: 'When a customer settles their balance, click "Receive Payment". Enter the received cash amount. The customer credit balance updates instantly.'
        }
      ],
      rules: [
        'Patient allergy tags trigger real-time alerts if an allergen is added to their POS cart.'
      ]
    },
    prescriptions: {
      id: 'prescriptions',
      title: 'Prescriptions (Rx) & Dispensing Guide',
      badge: 'Doctor Rx',
      icon: <FileText size={20} />,
      summary: 'Digitize doctor prescriptions, record clinical diagnoses, and dispense directly into POS.',
      steps: [
        {
          title: 'Step 1: Record Doctor Prescription',
          description: 'Click "Record Prescription". Enter Doctor Name, Clinic/Hospital, Patient Name, Diagnosis, and prescribed medication lines with dosage frequency.'
        },
        {
          title: 'Step 2: Dispense into POS Cart',
          description: 'Click "Dispense to POS" on any active prescription. The medications are populated into the POS cart with appropriate dosages ready for checkout.'
        }
      ],
      rules: [
        'Prescription records maintain clinical traceability for scheduled substances.'
      ]
    },
    expiry: {
      id: 'expiry',
      title: 'Expiry Control & Stock Write-Off Guide',
      badge: 'Expiry Horizons',
      icon: <AlertTriangle size={20} />,
      summary: 'Multi-horizon monitoring (180/90/60/30/7d), batch disposal write-offs, and supplier return claim vouchers.',
      steps: [
        {
          title: 'Step 1: Review Time Horizons',
          description: 'Use the horizon filter tabs (Under 30d, 30–60d, 60–90d, 90–180d) to proactively identify batches approaching expiration.'
        },
        {
          title: 'Step 2: Execute Batch Disposal Write-Off',
          description: 'For expired or damaged stock, click "Write-Off Batch". Enter the quantity and reason (Expired, Damaged, Recalled). The quantity is zeroed and written off to accounting P&L.',
          tip: 'Disposed inventory is logged with reason and timestamp in the audit trail.'
        },
        {
          title: 'Step 3: Generate Supplier Return Voucher',
          description: 'For medicines eligible for distributor return, generate a Vendor Return Claim voucher to debit the supplier payable balance.'
        }
      ],
      rules: [
        'Expired medications are hard-blocked by the server and cannot be sold.',
        'Disposal write-offs reflect as waste expenses in the financial P&L.'
      ]
    },
    accounts: {
      id: 'accounts',
      title: 'Financial Accounts, Cashbook & P&L Guide',
      badge: 'Double-Entry',
      icon: <ReceiptText size={20} />,
      summary: 'Daily cashbook tracking (Cash IN / OUT), operating expenses, and accurate Profit & Loss statement.',
      steps: [
        {
          title: 'Step 1: Inspect Daily Cashbook',
          description: 'Review total cash sales, customer credit recoveries (Cash IN), petty cash expenses, and supplier payments (Cash OUT).'
        },
        {
          title: 'Step 2: Record Cash Operating Expense',
          description: 'Click "Record Expense". Enter Category (Utilities, Rent, Salaries, Packaging, Tea/Refreshments), amount, and receipt note.'
        },
        {
          title: 'Step 3: Review Profit & Loss (P&L) Statement',
          description: 'Inspect Net Sales Revenue minus Cost of Goods Sold (COGS) to view Gross Profit and Margin %. Deduct operating expenses to view Net Operating Income.',
          tip: 'COGS is calculated using the exact purchase cost snapshot recorded when each batch was sold.'
        }
      ],
      rules: [
        'Every POS sale, expense, and recovery automatically synchronizes with the cashbook.'
      ]
    },
    reports: {
      id: 'reports',
      title: 'Reports & Business Intelligence Guide',
      badge: 'Analytics',
      icon: <BarChart3 size={20} />,
      summary: 'Sales trends, top selling brands, cashier performance audits, inventory valuation, and dead stock analysis.',
      steps: [
        {
          title: 'Step 1: Select Reporting Period',
          description: 'Filter sales analytics by Today, This Week, This Month, or Custom Date Range to inspect daily revenue trends and payment method breakdown.'
        },
        {
          title: 'Step 2: Inventory Valuation Analysis',
          description: 'View total inventory capital evaluated simultaneously on Cost Purchase Basis and Retail MRP Basis.'
        },
        {
          title: 'Step 3: Dead Stock & Capital Trapped Report',
          description: 'Identify medicines with zero sales over 60–90 days to arrange promotions or supplier returns.'
        },
        {
          title: 'Step 4: Customer Udhar Aging',
          description: 'Inspect aged customer debts categorized into 0–30d, 31–60d, and 61+ days past due.'
        },
        {
          title: 'Step 5: Export CSV',
          description: 'Click "Export CSV" to download clean spreadsheets for external accounting and tax compliance.'
        }
      ],
      rules: [
        'All report numbers are computed live from transaction records.'
      ]
    },
    forecast: {
      id: 'forecast',
      title: 'Demand Forecasting & Auto-PO Guide',
      badge: 'Predictive AI',
      icon: <TrendingUp size={20} />,
      summary: 'Average Daily Consumption (ADC), Days of Stock (DOS), dynamic Reorder Points (ROP), and automated box-rounded Purchase Order generator.',
      steps: [
        {
          title: 'Step 1: Inspect Average Daily Consumption (ADC)',
          description: 'The engine analyzes sliding 30/60/90-day sales velocity to calculate the exact units consumed per day.'
        },
        {
          title: 'Step 2: Check Days of Stock Remaining (DOS)',
          description: 'DOS indicates exactly how many days of stock remain on the shelf before the pharmacy runs out completely.'
        },
        {
          title: 'Step 3: One-Click Draft PO Generation',
          description: 'Click "Generate Draft PO". The system computes required replenishment quantities, rounds them to whole manufacturer box/pack sizes, and formats a purchase order ready for distributor dispatch.'
        }
      ],
      rules: [
        'Dynamic Reorder Points adjust automatically as seasonal sales velocity changes.'
      ]
    },
    'drug-ai': {
      id: 'drug-ai',
      title: 'Drug AI & Clinical Safety Assistant Guide',
      badge: 'Clinical Safety',
      icon: <Sparkles size={20} />,
      summary: 'Multi-drug interaction (DDI) checker, duplicate therapy warnings, patient allergy cross-matching, and bioequivalent generic substitutions.',
      steps: [
        {
          title: 'Step 1: Multi-Drug Interaction Analysis',
          description: 'Select two or more medicines (e.g. Ciprofloxacin + Antacids, or Warfarin + Aspirin). Click "Analyze Interactions" to view severity ratings (Major, Moderate, Minor) and clinical management advice.'
        },
        {
          title: 'Step 2: Find In-Stock Generic Substitutes',
          description: 'Search an out-of-stock medicine to find bioequivalent in-stock brands sharing the identical generic molecule and strength.'
        },
        {
          title: 'Step 3: Clinical Monograph & Pregnancy Risk',
          description: 'Look up FDA Pregnancy Risk Categories (Category A, B, C, D, X) and lactation cautions before dispensing to pregnant or nursing mothers.'
        }
      ],
      rules: [
        'Clinical warnings are advisory and designed to empower qualified pharmacists.'
      ]
    },
    settings: {
      id: 'settings',
      title: 'Hardware, Thermal Printer & Barcode Stickers Guide',
      badge: 'Hardware & Sync',
      icon: <Settings size={20} />,
      summary: 'Configure 80mm/58mm thermal receipts, auto-cutters, cash drawer kick pulses, printable barcode shelf stickers, and bulk CSV data imports.',
      steps: [
        {
          title: 'Step 1: Thermal Receipt Printer Setup',
          description: 'Navigate to Settings > Thermal Printer & POS. Choose Paper Width (80mm standard or 58mm compact). Configure pharmacy trade name, phone numbers, and return policy wording.'
        },
        {
          title: 'Step 2: Hardware Triggers',
          description: 'Toggle ESC/POS auto-cutter command (\\x1D\\x56) and cash drawer kick pulse (\\x1B\\x70) on cash checkout.'
        },
        {
          title: 'Step 3: Generate & Print Barcode Shelf Stickers',
          description: 'Navigate to Barcode Label Generator tab. Choose a medicine, select sticker copies, and choose grid layout (2, 3, or 4 stickers per row). Click "Print Sticker Sheet" to trigger window.print() formatted for sticker sheets.'
        },
        {
          title: 'Step 4: Bulk CSV Data Import',
          description: 'Navigate to Bulk CSV tab. Download sample CSV templates for medicines or batches. Upload or paste your spreadsheet to import catalog records with automatic barcode conflict resolution.'
        }
      ],
      rules: [
        'Thermal printer settings apply instantly to all subsequent POS receipt prints.'
      ]
    },
    backup: {
      id: 'backup',
      title: 'Hot SQLite Backups & Disaster Recovery Guide',
      badge: 'Data Resilience',
      icon: <Database size={20} />,
      summary: 'Online hot database snapshots, PRAGMA integrity verification, and safe offline file downloads.',
      steps: [
        {
          title: 'Step 1: Check Database Metrics',
          description: 'In Settings > Resilience & Hot Backups tab, inspect primary database file size (MB), WAL cache size, and live record counts.'
        },
        {
          title: 'Step 2: Create Instant Hot Backup Snapshot',
          description: 'Click "Create Hot Backup Now". The system uses SQLite native online backup API (db.backup) to take a non-blocking snapshot in server/backups/ without interrupting active cashiers.'
        },
        {
          title: 'Step 3: Verify Snapshot PRAGMA Integrity',
          description: 'Click "Verify PRAGMA" on any backup in the table. The server executes PRAGMA integrity_check to verify database B-trees and returns an Integrity Verified (OK) badge.'
        },
        {
          title: 'Step 4: Download Snapshot for Offline Storage',
          description: 'Click "Download" to save the verified .sqlite file to an external USB flash drive or secure cloud bucket for disaster recovery.'
        }
      ],
      rules: [
        'Hot backups capture all committed transactions without requiring server shutdown.',
        'Only Administrator role can generate, verify, or download database snapshots.'
      ]
    }
  };

  const currentGuide = guides[selectedTab] || guides['pos'];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '1.25rem',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '920px',
          maxHeight: '90vh',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--bg-app)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--primary-light)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <BookOpen size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>NMP Operations Manual & Guide</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Step-by-step administrator walkthrough and best practices for each module
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn btn-secondary btn-sm"
            style={{ width: '32px', height: '32px', padding: 0 }}
            title="Close Guide"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Strip */}
        <div
          style={{
            display: 'flex',
            overflowX: 'auto',
            padding: '0.5rem 1rem',
            gap: '0.4rem',
            borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--bg-surface)'
          }}
        >
          {Object.values(guides).map(g => (
            <button
              key={g.id}
              onClick={() => setSelectedTab(g.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                border: selectedTab === g.id ? '1px solid var(--primary-border)' : '1px solid transparent',
                backgroundColor: selectedTab === g.id ? 'var(--primary-light)' : 'transparent',
                color: selectedTab === g.id ? 'var(--primary)' : 'var(--text-secondary)',
                fontWeight: selectedTab === g.id ? 700 : 500,
                fontSize: '0.8rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {g.icon}
              <span>{g.badge}</span>
            </button>
          ))}
        </div>

        {/* Guide Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Guide Title & Summary Card */}
          <div
            style={{
              padding: '1.25rem',
              backgroundColor: 'var(--bg-app)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '1rem'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                <span className="badge badge-primary">{currentGuide.badge}</span>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>{currentGuide.title}</h3>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {currentGuide.summary}
              </p>
            </div>

            {onNavigateToTab && currentGuide.id !== 'backup' && (
              <button
                onClick={() => {
                  onNavigateToTab(currentGuide.id as NavView);
                  onClose();
                }}
                className="btn btn-primary btn-sm"
                style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <span>Open This Tab</span>
                <ExternalLink size={13} />
              </button>
            )}
          </div>

          {/* Step-by-Step Instructions */}
          <div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={17} style={{ color: 'var(--success)' }} />
              <span>Step-by-Step Procedure</span>
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {currentGuide.steps.map((s, idx) => {
                const stepKey = `${currentGuide.id}-${idx}`;
                const isChecked = !!completedSteps[stepKey];
                return (
                  <div
                    key={idx}
                    onClick={() => toggleStep(stepKey)}
                    style={{
                      padding: '1rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: isChecked ? 'rgba(16, 185, 129, 0.04)' : 'var(--bg-surface)',
                      border: isChecked ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleStep(stepKey)}
                        style={{ marginTop: '3px', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: isChecked ? 'var(--success-text)' : 'var(--text-primary)' }}>
                          {s.title}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem', lineHeight: 1.5 }}>
                          {s.description}
                        </div>
                        {s.tip && (
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              marginTop: '0.45rem',
                              fontSize: '0.75rem',
                              color: 'var(--primary)',
                              backgroundColor: 'var(--primary-light)',
                              padding: '0.2rem 0.5rem',
                              borderRadius: 'var(--radius-sm)'
                            }}
                          >
                            <Lightbulb size={13} />
                            <span>Pro Tip: {s.tip}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Business Invariants & Safeguards */}
          <div style={{ display: 'grid', gridTemplateColumns: currentGuide.shortcuts ? '2fr 1fr' : '1fr', gap: '1rem' }}>
            <div
              style={{
                padding: '1rem',
                backgroundColor: 'var(--bg-app)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)'
              }}
            >
              <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldAlert size={16} style={{ color: 'var(--warning)' }} />
                <span>System Safeguards & Rules</span>
              </h4>
              <ul style={{ paddingLeft: '1.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {currentGuide.rules.map((r, i) => (
                  <li key={i} style={{ marginBottom: '0.25rem' }}>{r}</li>
                ))}
              </ul>
            </div>

            {/* Keyboard Shortcuts if available */}
            {currentGuide.shortcuts && (
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: 'var(--bg-app)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)'
                }}
              >
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                  Keyboard Shortcuts
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {currentGuide.shortcuts.map((sc, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{sc.action}</span>
                      <kbd
                        style={{
                          padding: '0.15rem 0.4rem',
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          fontSize: '0.72rem'
                        }}
                      >
                        {sc.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--bg-app)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Naveed Medical Pharmacy • Built-in Administrator System Guide v1.0
          </div>
          <button onClick={onClose} className="btn btn-secondary btn-sm" style={{ padding: '0.4rem 1.25rem' }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  ScanBarcode,
  Search,
  Printer,
  FileText,
  MessageCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  Receipt,
  Calendar,
  Layers,
  ChevronRight,
  X,
  MapPin,
  ExternalLink
} from 'lucide-react';
import { Barcode128, SimpleQRCodeSVG } from '../utils/barcodeGenerator.js';
import { printThermalElement } from '../utils/thermalPrinter.js';
import { CashMemoModal, CashMemoInvoiceData } from '../components/CashMemoModal.js';

const GOOGLE_MAPS_URL = 'https://maps.app.goo.gl/cUe3jLr2kngNTnt2A';

interface InvoiceSummary {
  id: number;
  invoice_number: string;
  customer_id?: number | null;
  cashier_id: number;
  billing_person_id?: number | null;
  custom_slip_name?: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  change_amount: number;
  payment_method: string;
  status: string;
  notes?: string | null;
  created_at: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  cashier_name?: string | null;
  billing_person_name?: string | null;
  item_count: number;
  total_units: number;
}

interface SaleItemDetail {
  id: number;
  medicine_id: number;
  batch_id: number;
  quantity: number;
  unit_price: number;
  discount: number;
  line_total: number;
  brand_name: string;
  strength?: string | null;
  dosage_form?: string | null;
  pack_size?: number | null;
  tablets_per_pack?: number | null;
  stock_unit?: string | null;
  batch_number: string;
  expiry_date: string;
  batch_rack?: string | null;
  description_snapshot?: string | null;
  category_snapshot?: string | null;
  pack_type_snapshot?: string | null;
  units_per_pack_snapshot?: number | null;
  packs_snapshot?: number | null;
  loose_units_snapshot?: number | null;
}

export const BillHistoryView: React.FC = () => {
  const { token } = useAuth();

  // Search & Scanner state
  const [barcodeInput, setBarcodeInput] = useState('');
  const [activeInvoiceNumber, setActiveInvoiceNumber] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Loaded Invoice Details
  const [saleData, setSaleData] = useState<any | null>(null);
  const [itemsData, setItemsData] = useState<SaleItemDetail[]>([]);
  const [ledgerData, setLedgerData] = useState<any[]>([]);

  // Recent Invoices list
  const [recentSales, setRecentSales] = useState<InvoiceSummary[]>([]);
  const [recentFilter, setRecentFilter] = useState('');
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);

  // Print & Modal states
  const [directPrinting, setDirectPrinting] = useState(false);
  const [showCashMemoModal, setShowCashMemoModal] = useState(false);
  const [copiedInvoice, setCopiedInvoice] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({});

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Play scanner confirmation beep
  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {}
  };

  // Fetch settings on mount
  useEffect(() => {
    if (!token) return;
    fetch('/api/settings', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : {})
      .then((data: any) => setSettings(data?.settings || {}))
      .catch(() => {});
  }, [token]);

  // Fetch recent sales on mount
  const fetchRecentSales = async () => {
    if (!token) return;
    setIsLoadingRecent(true);
    try {
      const res = await fetch('/api/pos/invoices-recent?limit=35', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRecentSales(data.sales || []);
      }
    } catch (err: any) {
      console.error('Error fetching recent sales:', err);
    } finally {
      setIsLoadingRecent(false);
    }
  };

  useEffect(() => {
    fetchRecentSales();
  }, [token]);

  // Keep focus on barcode input for instant scan
  useEffect(() => {
    const timer = setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // Global keydown: F2 jumps to scanner bar, Esc clears
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        barcodeInputRef.current?.select();
        barcodeInputRef.current?.focus();
      } else if (e.key === 'Escape' && !showCashMemoModal) {
        setBarcodeInput('');
        barcodeInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCashMemoModal]);

  // Main fetch function by invoice number
  const handleLookupInvoice = async (invNumber: string) => {
    const cleanNum = invNumber.trim().replace(/^#/, '');
    if (!cleanNum) return;

    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const res = await fetch(`/api/pos/invoices/${encodeURIComponent(cleanNum)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Invoice "${cleanNum}" not found in system.`);
      }

      const data = await res.json();
      setSaleData(data.sale);
      setItemsData(data.items || []);
      setLedgerData(data.ledgerEntries || []);
      setActiveInvoiceNumber(data.sale?.invoice_number || cleanNum);
      playBeep();
      setInfoMessage(`✓ Scanned Bill #${data.sale?.invoice_number} loaded.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to retrieve invoice');
      setSaleData(null);
      setItemsData([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (barcodeInput.trim()) {
      handleLookupInvoice(barcodeInput.trim());
    }
  };

  // Direct Hardware Print to Speed-X 400UL
  const handleDirectHardwarePrint = async () => {
    if (!saleData) return;
    setDirectPrinting(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/integrations/print-receipt-direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          invoiceNumber: saleData.invoice_number,
          printerName: 'Speed-X 400UL'
        })
      });

      const data = await res.json();
      if (data.success) {
        setInfoMessage(data.message || 'Bill slip reprinted directly on Speed-X 400UL.');
      } else {
        setErrorMessage(data.message || 'Speed-X printer offline. You can use standard Print Dialog.');
        printThermalElement('bill-history-thermal-slip', (settings['printer_paper_width'] as any) || '80mm');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Direct print failed.');
      printThermalElement('bill-history-thermal-slip', (settings['printer_paper_width'] as any) || '80mm');
    } finally {
      setDirectPrinting(false);
    }
  };

  // Browser Thermal Print
  const handleThermalDialogPrint = () => {
    printThermalElement('bill-history-thermal-slip', (settings['printer_paper_width'] as any) || '80mm');
  };

  // Copy invoice number
  const handleCopyInvoiceNumber = () => {
    if (!saleData?.invoice_number) return;
    navigator.clipboard.writeText(saleData.invoice_number);
    setCopiedInvoice(true);
    setTimeout(() => setCopiedInvoice(false), 2000);
  };

  // WhatsApp share
  const handleWhatsAppShare = () => {
    if (!saleData) return;
    const phone = (saleData.customer_phone || '').replace(/[^0-9]/g, '');
    const pharmacyTitle = settings['pharmacy_name'] || 'NAVEED MEDICAL PHARMACY (NMP)';
    const mapsLocation = settings['pharmacy_maps_url'] || GOOGLE_MAPS_URL;
    const text = `*${pharmacyTitle}*%0AInvoice: %23${saleData.invoice_number}%0ADate: ${new Date(saleData.created_at).toLocaleString()}%0AItems: ${itemsData.length} item(s)%0AGrand Total: Rs. ${Number(saleData.total_amount).toFixed(2)}%0APaid: Rs. ${Number(saleData.paid_amount).toFixed(2)}%0ABalance: Rs. ${Number(saleData.remaining_amount).toFixed(2)}%0ALocation: ${mapsLocation}%0AThank you for choosing NMP!`;
    window.open(`https://wa.me/${phone ? '92' + phone.slice(-10) : ''}?text=${text}`, '_blank');
  };

  // Prepare CashMemoInvoiceData for CashMemoModal
  const cashMemoModalData: CashMemoInvoiceData | null = saleData ? {
    invoiceNumber: saleData.invoice_number,
    posNo: 'POS-01',
    createdAt: saleData.created_at,
    cashierName: saleData.billing_person_name || saleData.cashier_name || 'Ali Raza',
    customerName: saleData.custom_slip_name || saleData.customer_name || 'WALK-IN CUSTOMER',
    customerPhone: saleData.customer_phone || '-',
    customerId: saleData.customer_id ? String(saleData.customer_id) : '-',
    customerAddress: '-',
    items: itemsData.map((it, idx) => ({
      sNo: idx + 1,
      brandName: it.brand_name,
      strength: it.strength || '',
      dosageForm: it.dosage_form || '',
      packType: it.pack_type_snapshot || 'Pack',
      packTaken: it.packs_snapshot || 1,
      unitOfPack: it.units_per_pack_snapshot || it.tablets_per_pack || 10,
      unitsTaken: it.quantity,
      unitPrice: it.unit_price,
      total: it.line_total
    })),
    paymentMethod: saleData.payment_method,
    subtotal: saleData.subtotal,
    salesTax: saleData.tax,
    grandTotal: saleData.total_amount,
    paidAmount: saleData.paid_amount,
    balance: saleData.remaining_amount,
    notes: saleData.notes || 'Reprinted from Bill History Archive'
  } : null;

  // Filter recent sales
  const filteredRecentSales = recentSales.filter(s => {
    if (!recentFilter.trim()) return true;
    const q = recentFilter.toLowerCase();
    return (
      s.invoice_number.toLowerCase().includes(q) ||
      (s.customer_name && s.customer_name.toLowerCase().includes(q)) ||
      (s.custom_slip_name && s.custom_slip_name.toLowerCase().includes(q)) ||
      s.payment_method.toLowerCase().includes(q)
    );
  });

  return (
    <div className="view-container">
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                padding: '9px',
                borderRadius: '12px',
                background: 'var(--primary-light, rgba(56, 189, 248, 0.15))',
                color: 'var(--primary, #38bdf8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--primary-border, rgba(56, 189, 248, 0.3))'
              }}
            >
              <ScanBarcode size={26} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Bill Barcode Scanner & History
              </h1>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                Scan receipt barcode to view bill breakdown, audit history, and direct reprint.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <a
            href={GOOGLE_MAPS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              color: 'var(--primary)',
              borderColor: 'var(--primary-border, rgba(56, 189, 248, 0.3))'
            }}
            title="Open Pharmacy Location on Google Maps"
          >
            <MapPin size={14} />
            <span>Pharmacy Location</span>
            <ExternalLink size={12} style={{ opacity: 0.7 }} />
          </a>

          <span
            style={{
              fontSize: '0.75rem',
              padding: '5px 12px',
              borderRadius: '20px',
              background: 'var(--success-light, rgba(52, 211, 153, 0.15))',
              color: 'var(--success, #34d399)',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: '1px solid rgba(52, 211, 153, 0.3)'
            }}
          >
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: 'var(--success, #34d399)', display: 'inline-block' }} />
            Scanner Active
          </span>

          <button
            onClick={fetchRecentSales}
            className="btn btn-secondary btn-sm"
            title="Refresh recent invoices list"
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <RefreshCw size={14} className={isLoadingRecent ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Barcode Scanner Bar */}
      <div
        className="card"
        style={{
          padding: '1.25rem',
          background: 'var(--bg-surface)',
          borderColor: 'var(--primary-border, rgba(56, 189, 248, 0.35))',
          boxShadow: '0 4px 20px rgba(56, 189, 248, 0.08)',
          position: 'relative'
        }}
      >
        <form onSubmit={handleFormSubmit} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
            <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)', display: 'flex', alignItems: 'center' }}>
              <ScanBarcode size={22} />
            </div>
            <input
              ref={barcodeInputRef}
              type="text"
              className="input"
              value={barcodeInput}
              onChange={e => setBarcodeInput(e.target.value)}
              placeholder="Scan bill barcode here (or type e.g. INV-2026-0001, NMP-2025-000123)..."
              autoFocus
              style={{
                paddingLeft: '44px',
                paddingRight: barcodeInput ? '40px' : '14px',
                height: '48px',
                fontSize: '1rem',
                fontWeight: 600,
                letterSpacing: '0.3px',
                fontFamily: "'JetBrains Mono', monospace",
                backgroundColor: 'var(--bg-surface-elevated, #1f2937)',
                color: 'var(--text-primary, #f9fafb)',
                borderColor: 'var(--border)'
              }}
            />
            {barcodeInput && (
              <button
                type="button"
                onClick={() => {
                  setBarcodeInput('');
                  barcodeInputRef.current?.focus();
                }}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading || !barcodeInput.trim()}
            className="btn btn-primary"
            style={{ height: '48px', padding: '0 1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}
          >
            {isLoading ? <RefreshCw size={18} className="animate-spin" /> : <Search size={18} />}
            <span>Lookup Bill</span>
          </button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)', flexWrap: 'wrap', gap: '6px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>⚡</span>
            <span>Press <strong>F2</strong> anytime to jump cursor here.</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>QR on Bills:</span>
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Google Maps Location</span>
            <span>•</span>
            <span style={{ color: 'var(--text-secondary)' }}>Barcode:</span>
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Code-128 Invoice #</span>
          </span>
        </div>
      </div>

      {/* Status Messages */}
      {errorMessage && (
        <div style={{ backgroundColor: 'var(--danger-light, rgba(248, 113, 113, 0.15))', border: '1px solid var(--danger, #f87171)', color: 'var(--danger-text, #fca5a5)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}>
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {infoMessage && (
        <div style={{ backgroundColor: 'var(--success-light, rgba(52, 211, 153, 0.15))', border: '1px solid var(--success, #34d399)', color: 'var(--success-text, #6ee7b7)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}>
          <CheckCircle2 size={18} />
          <span>{infoMessage}</span>
        </div>
      )}

      {/* Balanced 2-Column Grid: Left Column (Scanned Bill or Empty State) + Right Column (Recent Bills Shelf) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: '1.25rem', alignItems: 'start' }}>
        
        {/* LEFT COLUMN */}
        {saleData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* Bill Overview Header Card */}
            <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '1.3rem', fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", color: 'var(--primary)' }}>
                      #{saleData.invoice_number}
                    </span>
                    <button
                      onClick={handleCopyInvoiceNumber}
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '3px' }}
                      title="Copy Invoice Number"
                    >
                      {copiedInvoice ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
                      <span>{copiedInvoice ? 'Copied' : 'Copy'}</span>
                    </button>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        backgroundColor: saleData.status === 'COMPLETED' ? 'var(--success-light)' : 'var(--danger-light)',
                        color: saleData.status === 'COMPLETED' ? 'var(--success)' : 'var(--danger)'
                      }}
                    >
                      {saleData.status || 'COMPLETED'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={13} style={{ color: 'var(--primary)' }} />
                      {new Date(saleData.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={13} style={{ color: 'var(--primary)' }} />
                      {new Date(saleData.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span>POS Terminal: <strong>01</strong></span>
                  </div>
                </div>

                {/* Barcode & Google Maps QR Badge */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    background: '#ffffff',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    color: '#000000'
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <Barcode128 value={saleData.invoice_number} width={0.85} height={26} showText={false} />
                    <span style={{ fontSize: '0.62rem', color: '#475569', fontWeight: 700, display: 'block' }}>Invoice Barcode</span>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <SimpleQRCodeSVG value={settings['pharmacy_maps_url'] || GOOGLE_MAPS_URL} size={36} />
                    <span style={{ fontSize: '0.62rem', color: '#0369a1', fontWeight: 800, display: 'block' }}>Maps QR 📍</span>
                  </div>
                </div>
              </div>

              {/* Cashier & Customer Info Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
                <div style={{ backgroundColor: 'var(--bg-surface-elevated)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Cashier / Operator</div>
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)', marginTop: '3px', fontSize: '0.92rem' }}>
                    {saleData.billing_person_name || saleData.cashier_name || 'Ali Raza'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Cashier ID: #{saleData.cashier_id}
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--bg-surface-elevated)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Customer</div>
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)', marginTop: '3px', fontSize: '0.92rem' }}>
                    {saleData.custom_slip_name || saleData.customer_name || 'WALK-IN CUSTOMER'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {saleData.customer_phone ? `Phone: ${saleData.customer_phone}` : 'Walk-in Sale'}
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--bg-surface-elevated)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Payment Mode</div>
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)', marginTop: '3px', fontSize: '0.92rem' }}>
                    {saleData.payment_method || 'CASH'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: saleData.remaining_amount > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 700, marginTop: '2px' }}>
                    {saleData.remaining_amount > 0 ? `Udhaar: Rs. ${Number(saleData.remaining_amount).toFixed(2)}` : 'Fully Paid'}
                  </div>
                </div>
              </div>

              {/* Action Buttons Toolbar */}
              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.25rem', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button
                  onClick={handleDirectHardwarePrint}
                  disabled={directPrinting}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800 }}
                  title="Direct 1-Click Hardware Thermal Print to Speed-X 400UL"
                >
                  <Printer size={16} />
                  <span>{directPrinting ? 'Printing...' : '⚡ Print to Speed-X 400UL'}</span>
                </button>

                <button
                  onClick={handleThermalDialogPrint}
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  title="Print Thermal 80mm slip via browser dialog"
                >
                  <Receipt size={16} />
                  <span>80mm Slip Dialog</span>
                </button>

                <button
                  onClick={() => setShowCashMemoModal(true)}
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#0284c7', color: '#fff', border: 'none' }}
                  title="Open official A4 Cash Memo or full preview"
                >
                  <FileText size={16} />
                  <span>📄 View / Print A4 Memo</span>
                </button>

                <button
                  onClick={handleWhatsAppShare}
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#25D366', color: '#fff', border: 'none' }}
                  title="Share invoice summary on WhatsApp"
                >
                  <MessageCircle size={16} />
                  <span>WhatsApp</span>
                </button>
              </div>
            </div>

            {/* Sold Items Table */}
            <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Layers size={18} style={{ color: 'var(--primary)' }} />
                  <span>Items In This Bill ({itemsData.length})</span>
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Total Units: <strong style={{ color: 'var(--text-primary)' }}>{itemsData.reduce((sum, it) => sum + (it.quantity || 0), 0)}</strong>
                </span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left', backgroundColor: 'var(--bg-surface-elevated)' }}>
                      <th style={{ padding: '9px 10px', width: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>#</th>
                      <th style={{ padding: '9px 10px', color: 'var(--text-secondary)' }}>Medicine / Description</th>
                      <th style={{ padding: '9px 10px', color: 'var(--text-secondary)' }}>Batch & Expiry</th>
                      <th style={{ padding: '9px 10px', textAlign: 'center', color: 'var(--text-secondary)' }}>Qty (Units)</th>
                      <th style={{ padding: '9px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>Unit Price</th>
                      <th style={{ padding: '9px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsData.map((item, idx) => (
                      <tr key={item.id || idx} style={{ borderBottom: '1px solid var(--border)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--bg-surface-elevated)' }}>
                        <td style={{ padding: '10px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '10px 10px' }}>
                          <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                            {item.brand_name}
                            {item.strength && <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: '0.78rem', marginLeft: '6px' }}>({item.strength})</span>}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {item.pack_type_snapshot ? (
                              <span>
                                {item.packs_snapshot ? `${item.packs_snapshot} ${item.pack_type_snapshot}` : ''}
                                {item.loose_units_snapshot ? ` + ${item.loose_units_snapshot} loose` : ''}
                              </span>
                            ) : (
                              <span>{item.dosage_form || 'Medicine'}</span>
                            )}
                            {item.batch_rack && <span> • Rack: {item.batch_rack}</span>}
                          </div>
                        </td>
                        <td style={{ padding: '10px 10px' }}>
                          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                            {item.batch_number}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Exp: {item.expiry_date}
                          </div>
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {item.quantity}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          Rs. {Number(item.unit_price).toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)' }}>
                          Rs. {Number(item.line_total).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Calculation Breakdown */}
              <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ width: '100%', maxWidth: '340px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.85rem 1rem', backgroundColor: 'var(--bg-surface-elevated)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.82rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Sub Total:</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Rs. {Number(saleData.subtotal).toFixed(2)}</span>
                  </div>

                  {saleData.discount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.82rem', color: 'var(--success)' }}>
                      <span>Discount:</span>
                      <span style={{ fontWeight: 700 }}>-Rs. {Number(saleData.discount).toFixed(2)}</span>
                    </div>
                  )}

                  {saleData.tax > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.82rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>POS Fee / Tax:</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Rs. {Number(saleData.tax).toFixed(2)}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px dashed var(--border)', borderBottom: '1px dashed var(--border)', margin: '6px 0', fontWeight: 900, fontSize: '1.05rem', color: 'var(--primary)' }}>
                    <span>Grand Total:</span>
                    <span>Rs. {Number(saleData.total_amount).toFixed(2)}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.82rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Amount Paid:</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Rs. {Number(saleData.paid_amount).toFixed(2)}</span>
                  </div>

                  {saleData.change_amount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.82rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Change Returned:</span>
                      <span style={{ fontWeight: 700, color: 'var(--success)' }}>Rs. {Number(saleData.change_amount).toFixed(2)}</span>
                    </div>
                  )}

                  {saleData.remaining_amount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--danger)', fontWeight: 800 }}>
                      <span>Balance Due (Udhar):</span>
                      <span>Rs. {Number(saleData.remaining_amount).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Customer Ledger Audit Trail */}
            {ledgerData.length > 0 && (
              <div className="card" style={{ padding: '1rem', background: 'var(--bg-surface)' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Customer Ledger Audit
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem' }}>
                  {ledgerData.map((l, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-primary)' }}>{l.transaction_type} • {l.notes || 'Ledger entry'}</span>
                      <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                        Debit: Rs. {l.debit || 0} | Credit: Rs. {l.credit || 0}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hidden Printable Thermal Slip Target for printThermalElement */}
            <div style={{ display: 'none' }}>
              <div
                id="bill-history-thermal-slip"
                className={`printable-receipt ${settings['printer_paper_width'] === '58mm' ? 'receipt-58mm' : ''}`}
                style={{
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  width: '76mm',
                  maxWidth: '80mm',
                  margin: '0 auto',
                  padding: '10px 8px',
                  fontFamily: "'Arial', 'Helvetica', sans-serif",
                  fontSize: '11px',
                  boxSizing: 'border-box'
                }}
              >
                <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                  <img src="/logo.jpeg" alt="Pharmacy Logo" style={{ width: '44px', height: '44px', objectFit: 'contain', borderRadius: '50%', marginBottom: '4px' }} />
                  <div style={{ fontWeight: 900, fontSize: '13px', textTransform: 'uppercase' }}>
                    {settings['pharmacy_name'] || 'NAVEED MEDICAL PHARMACY'}
                  </div>
                  <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#15803d' }}>SINCE 1992</div>
                  <div style={{ fontSize: '9px', margin: '2px 0' }}>
                    {settings['pharmacy_address'] || 'Shop #31-32, Chowk Chohan Park, Islampura, Lahore'}
                  </div>
                  <div style={{ fontSize: '9px' }}>Ph: {settings['pharmacy_phone'] || '0318-0425090'}</div>
                  <div style={{ fontWeight: 800, borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', margin: '6px 0' }}>
                    DUPLICATE CASH MEMO / RECEIPT
                  </div>
                </div>

                <div style={{ fontSize: '10px', borderBottom: '1px dashed #000', paddingBottom: '6px', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Inv #: <strong>{saleData.invoice_number}</strong></span>
                    <span>POS: <strong>01</strong></span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Date: {new Date(saleData.created_at).toLocaleDateString()}</span>
                    <span>Time: {new Date(saleData.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div>Cashier: <strong>{saleData.billing_person_name || saleData.cashier_name || 'Ali Raza'}</strong></div>
                  <div>Customer: <strong>{saleData.custom_slip_name || saleData.customer_name || 'WALK-IN CUSTOMER'}</strong></div>
                  {saleData.customer_phone && <div>Mobile: {saleData.customer_phone}</div>}
                  <div>Payment Method: {saleData.payment_method}</div>
                </div>

                <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse', marginBottom: '6px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px dashed #000', textAlign: 'left' }}>
                      <th style={{ width: '48%' }}>Item</th>
                      <th style={{ width: '14%', textAlign: 'center' }}>Qty</th>
                      <th style={{ width: '18%', textAlign: 'right' }}>Price</th>
                      <th style={{ width: '20%', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsData.map((it, i) => (
                      <tr key={i} style={{ borderBottom: '1px dotted #bbb' }}>
                        <td style={{ padding: '3px 0', verticalAlign: 'top' }}>
                          <strong style={{ display: 'block' }}>{i + 1}. {it.brand_name} {it.strength || ''}</strong>
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'top', padding: '3px 0' }}>{it.quantity}</td>
                        <td style={{ textAlign: 'right', verticalAlign: 'top', padding: '3px 0' }}>{Number(it.unit_price).toFixed(2)}</td>
                        <td style={{ textAlign: 'right', verticalAlign: 'top', padding: '3px 0', fontWeight: 800 }}>{Number(it.line_total).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ borderTop: '1px dashed #000', paddingTop: '6px', fontSize: '10.5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Sub Total:</span>
                    <span>Rs. {Number(saleData.subtotal).toFixed(2)}</span>
                  </div>
                  {saleData.discount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Discount:</span>
                      <span>-Rs. {Number(saleData.discount).toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', margin: '4px 0' }}>
                    <span>GRAND TOTAL:</span>
                    <span>Rs. {Number(saleData.total_amount).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Amount Paid:</span>
                    <span>Rs. {Number(saleData.paid_amount).toFixed(2)}</span>
                  </div>
                  {saleData.remaining_amount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b91c1c', fontWeight: 700 }}>
                      <span>Balance Due:</span>
                      <span>Rs. {Number(saleData.remaining_amount).toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Google Maps Location QR Code & Barcode */}
                <div style={{ textAlign: 'center', marginTop: '10px', paddingTop: '6px', borderTop: '1px dashed #000' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
                    <SimpleQRCodeSVG value={settings['pharmacy_maps_url'] || GOOGLE_MAPS_URL} size={50} />
                  </div>
                  <div style={{ fontSize: '8.5px', fontWeight: 700 }}>Scan QR for Pharmacy Location 📍</div>
                  <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'center' }}>
                    <Barcode128 value={saleData.invoice_number} width={1.1} height={24} fontSize={8} />
                  </div>
                </div>

                <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '9px', fontWeight: 700 }}>
                  <div>{settings['receipt_footer'] || 'Thank you for choosing NMP!'}</div>
                  <div style={{ fontStyle: 'italic', marginTop: '2px', color: '#15803d' }}>Your Health Our Priority 🍃</div>
                  <div style={{ fontSize: '8px', marginTop: '4px', fontWeight: 400 }}>Proprietor: Naveed Ahmed Khan</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Sleek Dark Mode Native Empty State */
          <div
            className="card"
            style={{
              padding: '3.5rem 2rem',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '440px',
              background: 'var(--bg-surface)',
              border: '1px dashed var(--border)'
            }}
          >
            <div
              style={{
                width: '78px',
                height: '78px',
                borderRadius: '50%',
                background: 'var(--primary-light, rgba(56, 189, 248, 0.15))',
                color: 'var(--primary, #38bdf8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--primary-border, rgba(56, 189, 248, 0.3))',
                marginBottom: '1.5rem',
                boxShadow: '0 0 25px rgba(56, 189, 248, 0.15)'
              }}
            >
              <ScanBarcode size={40} />
            </div>
            
            <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Scan Any Printed Bill Barcode
            </h2>
            
            <p style={{ margin: '0 0 1.5rem 0', maxWidth: '480px', color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.6 }}>
              Point your handheld barcode scanner at the barcode on any customer thermal slip or A4 cash memo to instantly load its complete item breakdown, cashier details, and payment timeline.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <span style={{ fontSize: '0.8rem', padding: '6px 14px', borderRadius: '20px', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                👉 Or select any invoice from the list on the right
              </span>
            </div>
          </div>
        )}

        {/* RIGHT COLUMN: RECENT BILLS ARCHIVE */}
        <div
          className="card"
          style={{
            padding: '1.1rem',
            display: 'flex',
            flexDirection: 'column',
            height: '740px',
            background: 'var(--bg-surface)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Clock size={16} style={{ color: 'var(--primary)' }} />
              <span>Recent Invoices</span>
            </h3>
            <span
              style={{
                fontSize: '0.72rem',
                padding: '2px 8px',
                borderRadius: '10px',
                background: 'var(--bg-surface-elevated)',
                color: 'var(--text-secondary)',
                fontWeight: 700
              }}
            >
              {filteredRecentSales.length}
            </span>
          </div>

          <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input input-sm"
              value={recentFilter}
              onChange={e => setRecentFilter(e.target.value)}
              placeholder="Search invoice or customer..."
              style={{
                paddingLeft: '32px',
                fontSize: '0.8rem',
                height: '34px',
                background: 'var(--bg-surface-elevated)',
                color: 'var(--text-primary)',
                borderColor: 'var(--border)'
              }}
            />
          </div>

          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '2px' }}>
            {isLoadingRecent ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px auto', display: 'block', opacity: 0.5 }} />
                <span>Loading recent bills...</span>
              </div>
            ) : filteredRecentSales.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No recent invoices found.
              </div>
            ) : (
              filteredRecentSales.map(sale => {
                const isSelected = activeInvoiceNumber === sale.invoice_number;
                const d = new Date(sale.created_at);
                const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });

                return (
                  <button
                    key={sale.id}
                    type="button"
                    onClick={() => {
                      setBarcodeInput(sale.invoice_number);
                      handleLookupInvoice(sale.invoice_number);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.7rem 0.8rem',
                      borderRadius: 'var(--radius-md)',
                      border: isSelected ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                      backgroundColor: isSelected ? 'var(--primary-light, rgba(56, 189, 248, 0.12))' : 'var(--bg-surface-elevated)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1, paddingRight: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.85rem', fontFamily: "'JetBrains Mono', monospace", color: isSelected ? 'var(--primary)' : 'var(--text-primary)' }}>
                          #{sale.invoice_number}
                        </span>
                        <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: '4px', backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)', fontWeight: 700, border: '1px solid var(--border)' }}>
                          {sale.payment_method}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {sale.custom_slip_name || sale.customer_name || 'Walk-in'} • {sale.item_count} item{sale.item_count > 1 ? 's' : ''}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                        {dateStr} at {timeStr}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--primary)' }}>
                        Rs. {Number(sale.total_amount).toFixed(0)}
                      </div>
                      <ChevronRight size={14} style={{ color: isSelected ? 'var(--primary)' : 'var(--text-muted)', marginLeft: 'auto', marginTop: '4px' }} />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* CashMemoModal for official A4 & Full Preview */}
      {showCashMemoModal && cashMemoModalData && (
        <CashMemoModal
          isOpen={showCashMemoModal}
          onClose={() => setShowCashMemoModal(false)}
          invoiceData={cashMemoModalData}
          settings={settings}
          token={token}
        />
      )}
    </div>
  );
};

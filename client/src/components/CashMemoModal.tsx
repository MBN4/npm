import React, { useState } from 'react';
import { X, Printer, Download, MessageCircle, FileText, CheckCircle2 } from 'lucide-react';
import { Barcode128, SimpleQRCodeSVG } from '../utils/barcodeGenerator';
import { printThermalElement } from '../utils/thermalPrinter';

export interface CashMemoInvoiceData {
  invoiceNumber: string;
  posNo?: string;
  date?: string;
  time?: string;
  createdAt?: string;
  cashierName?: string;
  customerName?: string;
  customerPhone?: string;
  customerId?: string;
  customerAddress?: string;
  items: {
    sNo?: number;
    brandName: string;
    strength?: string;
    dosageForm?: string;
    packType?: string;
    packTaken?: number;
    unitOfPack?: number;
    unitsTaken?: number;
    unitPrice: number;
    total: number;
  }[];
  paymentMethod?: string;
  subtotal: number;
  salesTax?: number;
  grandTotal: number;
  paidAmount?: number;
  balance?: number;
  notes?: string;
}

interface CashMemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceData: CashMemoInvoiceData | null;
  settings?: Record<string, string>;
  token?: string | null;
}

export const CashMemoModal: React.FC<CashMemoModalProps> = ({
  isOpen,
  onClose,
  invoiceData,
  settings = {},
  token = null
}) => {
  const [printFormat, setPrintFormat] = useState<'SPEED_X_80MM' | 'A4_FULL'>('A4_FULL');
  const [printingStatus, setPrintingStatus] = useState<string | null>(null);

  if (!isOpen || !invoiceData) return null;

  const invNo = invoiceData.invoiceNumber || 'NMP-2025-000123';
  const posNo = invoiceData.posNo || 'POS-01';

  let displayDate = invoiceData.date;
  let displayTime = invoiceData.time;

  if (!displayDate && invoiceData.createdAt) {
    const d = new Date(invoiceData.createdAt);
    displayDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
    displayTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  displayDate ||= new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  displayTime ||= new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

  const cashier = invoiceData.cashierName || 'Ali Raza';
  const custName = invoiceData.customerName || 'WALK-IN CUSTOMER';
  const custPhone = invoiceData.customerPhone || '-';
  const custId = invoiceData.customerId || '-';
  const custAddress = invoiceData.customerAddress || '-';

  const items = invoiceData.items || [];
  const subtotal = invoiceData.subtotal || 0;
  const salesTax = invoiceData.salesTax || 0;
  const grandTotal = invoiceData.grandTotal || 0;
  const paidAmount = invoiceData.paidAmount !== undefined ? invoiceData.paidAmount : grandTotal;
  const balance = invoiceData.balance !== undefined ? invoiceData.balance : Math.max(0, grandTotal - paidAmount);
  const paymentMethod = invoiceData.paymentMethod || 'Cash';
  const notes = invoiceData.notes || 'Thank you for your purchase.';

  // DIRECT HARDWARE THERMAL PRINT (NO BROWSER DIALOG)
  const handleDirectSpeedXPrint = async () => {
    setPrintingStatus('Printing directly to Speed-X 400UL...');
    try {
      const response = await fetch('/api/integrations/print-receipt-direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          invoiceNumber: invNo,
          printerName: 'Speed-X 400UL',
          invoiceData: {
            ...invoiceData,
            date: displayDate,
            time: displayTime,
            cashierName: cashier,
            customerName: custName
          }
        })
      });

      const result = await response.json();
      if (response.ok && result.success) {
        setPrintingStatus('✓ Bill slip sent directly to Speed-X 400UL printer!');
        setTimeout(() => setPrintingStatus(null), 4000);
      } else {
        setPrintingStatus('Printing via browser dialog fallback...');
        printThermalElement('speedx-400ul-slip-printable', '80mm');
        setTimeout(() => setPrintingStatus(null), 4000);
      }
    } catch {
      setPrintingStatus('Printing via browser dialog...');
      printThermalElement('speedx-400ul-slip-printable', '80mm');
      setTimeout(() => setPrintingStatus(null), 4000);
    }
  };

  const handleA4Print = () => {
    setPrintFormat('A4_FULL');
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleSavePDF = () => {
    window.print();
  };

  const handleWhatsAppShare = () => {
    const phone = custPhone.replace(/[^0-9]/g, '');
    const pharmacyTitle = settings['pharmacy_name'] || 'NAVEED MEDICAL PHARMACY (NMP)';
    const text = `*${pharmacyTitle}*%0AInvoice: %23${invNo}%0ADate: ${displayDate} ${displayTime}%0ATotal Amount: Rs. ${grandTotal.toFixed(2)}%0APaid: Rs. ${paidAmount.toFixed(2)}%0ABalance: Rs. ${balance.toFixed(2)}%0AThank you for your visit!`;
    window.open(`https://wa.me/${phone ? '92' + phone.slice(-10) : ''}?text=${text}`, '_blank');
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100, backgroundColor: 'rgba(0,0,0,0.65)' }}>
      <div
        className="modal-content"
        style={{
          maxWidth: '850px',
          width: '95%',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          borderRadius: '10px',
          overflow: 'hidden',
          backgroundColor: '#f1f5f9'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top Modal Controls Header */}
        <div
          style={{
            padding: '0.75rem 1.25rem',
            background: '#0f172a',
            color: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1rem' }}>
            <FileText size={18} style={{ color: '#38bdf8' }} />
            <span>NMP Professional Cash Memo / Invoice</span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Speed-X 400UL Direct Print Button */}
            <button
              onClick={handleDirectSpeedXPrint}
              className="btn btn-sm"
              style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 800, padding: '0.4rem 0.85rem' }}
              title="Print directly to Speed-X 400UL Hardware Thermal Printer attached to laptop"
            >
              <Printer size={16} />
              <span>🖨️ Direct Speed-X 400UL Print</span>
            </button>

            {/* A4 Sheet Print Button */}
            <button
              onClick={handleA4Print}
              className="btn btn-sm"
              style={{ backgroundColor: '#475569', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}
              title="Print standard full-page A4 Cash Memo sheet"
            >
              <Printer size={15} />
              <span>📄 Print A4 Sheet</span>
            </button>

            <button
              onClick={handleSavePDF}
              className="btn btn-sm"
              style={{ backgroundColor: '#dc2626', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}
              title="Download invoice as PDF document"
            >
              <Download size={15} />
              <span>Save PDF</span>
            </button>
            <button
              onClick={handleWhatsAppShare}
              className="btn btn-sm"
              style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}
              title="Share invoice summary on WhatsApp"
            >
              <MessageCircle size={15} />
              <span>WhatsApp / Share</span>
            </button>
            <button
              onClick={onClose}
              className="btn btn-sm btn-secondary"
              style={{ padding: '0.2rem 0.5rem', marginLeft: '0.5rem', fontWeight: 700 }}
              title="Close Preview"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Status Notification Banner */}
        {printingStatus && (
          <div style={{ backgroundColor: '#dcfce7', color: '#15803d', padding: '6px 16px', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #86efac' }}>
            <CheckCircle2 size={16} />
            <span>{printingStatus}</span>
          </div>
        )}

        {/* Print Format Mode Selector Sub-header */}
        <div
          style={{
            backgroundColor: '#0284c7',
            color: '#ffffff',
            padding: '6px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.8rem',
            borderBottom: '1px solid #0369a1'
          }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontWeight: 700 }}>View Format:</span>
            <button
              type="button"
              onClick={() => setPrintFormat('A4_FULL')}
              style={{
                backgroundColor: printFormat === 'A4_FULL' ? '#ffffff' : 'rgba(255,255,255,0.2)',
                color: printFormat === 'A4_FULL' ? '#0284c7' : '#ffffff',
                border: 'none',
                padding: '3px 10px',
                borderRadius: '4px',
                fontWeight: 800,
                cursor: 'pointer',
                fontSize: '0.75rem'
              }}
            >
              📄 Standard Cash Memo (A4 Sheet)
            </button>
            <button
              type="button"
              onClick={() => setPrintFormat('SPEED_X_80MM')}
              style={{
                backgroundColor: printFormat === 'SPEED_X_80MM' ? '#ffffff' : 'rgba(255,255,255,0.2)',
                color: printFormat === 'SPEED_X_80MM' ? '#0284c7' : '#ffffff',
                border: 'none',
                padding: '3px 10px',
                borderRadius: '4px',
                fontWeight: 800,
                cursor: 'pointer',
                fontSize: '0.75rem'
              }}
            >
              🧾 Speed-X 400UL (80mm Thermal Receipt)
            </button>
          </div>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, opacity: 0.95 }}>
            {printFormat === 'SPEED_X_80MM' ? '⚡ Speed-X 400UL Direct Hardware Print Ready' : '📄 NMP Official Cash Memo Invoice Format'}
          </span>
        </div>

        {/* Printable Cash Memo / Thermal Slip Container */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', backgroundColor: '#e2e8f0' }}>
          
          {/* FORMAT 1: SPEED-X 400UL / 80MM THERMAL SLIP */}
          {printFormat === 'SPEED_X_80MM' && (
            <div
              id="speedx-400ul-slip-printable"
              className="printable-receipt"
              style={{
                backgroundColor: '#ffffff',
                color: '#000000',
                width: '76mm',
                maxWidth: '80mm',
                margin: '0 auto',
                padding: '10px 8px',
                fontFamily: "'Arial', 'Helvetica', sans-serif",
                fontSize: '11px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.12)',
                borderRadius: '4px',
                boxSizing: 'border-box'
              }}
            >
              {/* Thermal Header */}
              <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                <img
                  src="/logo.jpeg"
                  alt="NMP Logo"
                  style={{ width: '44px', height: '44px', objectFit: 'contain', borderRadius: '50%', marginBottom: '4px' }}
                />
                <div style={{ fontWeight: 900, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.2px' }}>
                  {settings['pharmacy_name'] || 'NAVEED MEDICAL PHARMACY'}
                </div>
                <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#15803d' }}>SINCE 1992</div>
                <div style={{ fontSize: '9px', margin: '2px 0', color: '#111' }}>Shop #31-32, Chowk Chohan Park, Islampura, Lahore</div>
                <div style={{ fontSize: '9px', color: '#111' }}>Ph: 0318-0425090</div>
                <div style={{ fontWeight: 800, borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', margin: '6px 0', fontSize: '11px' }}>
                  SPEED-X 400UL CASH MEMO / RECEIPT
                </div>
              </div>

              {/* Metadata */}
              <div style={{ fontSize: '10px', borderBottom: '1px dashed #000', paddingBottom: '6px', marginBottom: '6px', color: '#000' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>Inv #: <strong>{invNo}</strong></span>
                  <span>POS: <strong>{posNo}</strong></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>Date: {displayDate}</span>
                  <span>Time: {displayTime}</span>
                </div>
                <div>Cashier: <strong>{cashier}</strong></div>
                <div>Customer: <strong>{custName}</strong></div>
              </div>

              {/* Items Table */}
              <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse', marginBottom: '6px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px dashed #000', textAlign: 'left' }}>
                    <th style={{ paddingBottom: '4px', textAlign: 'left', width: '48%' }}>Item Description</th>
                    <th style={{ paddingBottom: '4px', textAlign: 'center', width: '14%' }}>Qty</th>
                    <th style={{ paddingBottom: '4px', textAlign: 'right', width: '18%' }}>Price</th>
                    <th style={{ paddingBottom: '4px', textAlign: 'right', width: '20%' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px dotted #bbb' }}>
                      <td style={{ padding: '3px 0', textAlign: 'left', verticalAlign: 'top' }}>
                        <strong style={{ display: 'block', fontSize: '10px', color: '#000' }}>{it.brandName}</strong>
                        {it.strength && <span style={{ fontSize: '8.5px', color: '#444' }}>{it.strength}</span>}
                        {it.packTaken !== undefined && (
                          <div style={{ fontSize: '8px', color: '#555' }}>
                            ({it.packTaken} Pack{it.packTaken > 1 ? 's' : ''})
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', verticalAlign: 'top', padding: '3px 0', fontWeight: 700 }}>
                        {it.unitsTaken || 1}
                      </td>
                      <td style={{ textAlign: 'right', verticalAlign: 'top', padding: '3px 0' }}>
                        {it.unitPrice.toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'right', verticalAlign: 'top', padding: '3px 0', fontWeight: 800 }}>
                        {it.total.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals Section */}
              <div style={{ borderTop: '1px dashed #000', paddingTop: '6px', fontSize: '10.5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>Sub Total:</span>
                  <span>Rs. {subtotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>Sales Tax:</span>
                  <span>Rs. {salesTax.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '12px', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', margin: '4px 0' }}>
                  <span>GRAND TOTAL:</span>
                  <span>Rs. {grandTotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>Amount Paid:</span>
                  <span>Rs. {paidAmount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>Balance Due:</span>
                  <span>Rs. {balance.toFixed(2)}</span>
                </div>
                <div style={{ marginTop: '2px', fontWeight: 700 }}>Payment Method: {paymentMethod}</div>
              </div>

              {/* Barcode & QR Code Section */}
              <div style={{ textAlign: 'center', marginTop: '10px', paddingTop: '6px', borderTop: '1px dashed #000' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
                  <SimpleQRCodeSVG value={invNo} size={54} />
                </div>
                <div style={{ fontSize: '8.5px', fontWeight: 700 }}>Scan QR Code for Verification</div>
                <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'center' }}>
                  <Barcode128 value={invNo} width={1.2} height={26} fontSize={9} />
                </div>
              </div>

              {/* Footer */}
              <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '9.5px', fontWeight: 700 }}>
                <div>Thank you for choosing NMP!</div>
                <div style={{ fontStyle: 'italic', marginTop: '2px', color: '#15803d' }}>Your Health Our Priority 🍃</div>
                <div style={{ fontSize: '8px', marginTop: '4px', fontWeight: 400 }}>Proprietor: Naveed Ahmed Khan</div>
              </div>
            </div>
          )}

          {/* FORMAT 2: STANDARD FULL SHEET A4 CASH MEMO (MATCHES REFERENCE MOCKUP EXACTLY) */}
          {printFormat === 'A4_FULL' && (
            <div
              id="nmp-cash-memo-printable"
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '6px',
                border: '1px solid #94a3b8',
                padding: '24px 28px',
                color: '#0f172a',
                fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
                maxWidth: '780px',
                margin: '0 auto',
                boxShadow: '0 4px 15px rgba(0,0,0,0.08)',
                position: 'relative'
              }}
            >
              {/* 1. NMP BRANDING HEADER */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 1fr 180px',
                  gap: '12px',
                  alignItems: 'center',
                  paddingBottom: '12px',
                  borderBottom: '2px solid #0f172a'
                }}
              >
                {/* Left: Official NMP Circular Logo */}
                <div style={{ textAlign: 'center' }}>
                  <img
                    src="/logo.jpeg"
                    alt="NMP Logo"
                    style={{
                      width: '88px',
                      height: '88px',
                      objectFit: 'contain',
                      borderRadius: '50%',
                      border: '1px solid #cbd5e1'
                    }}
                  />
                </div>

                {/* Center: Title, Address, Phone, Email */}
                <div style={{ textAlign: 'center' }}>
                  <h1
                    style={{
                      margin: 0,
                      fontSize: '1.45rem',
                      fontWeight: 900,
                      color: '#032b56',
                      letterSpacing: '0.2px',
                      textTransform: 'uppercase'
                    }}
                  >
                    {settings['pharmacy_name'] || 'NAVEED MEDICAL PHARMACY (NMP)'}
                  </h1>
                  <div
                    style={{
                      fontSize: '0.88rem',
                      fontWeight: 900,
                      color: '#16a34a',
                      letterSpacing: '1.5px',
                      marginTop: '2px'
                    }}
                  >
                    SINCE 1992
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#334155', marginTop: '3px', fontWeight: 600 }}>
                    {settings['pharmacy_address'] || 'Shop #31–32, Chowk Chohan Park, Islampura, Lahore – 54000'}
                  </div>
                  <div
                    style={{
                      fontSize: '0.78rem',
                      color: '#0f172a',
                      marginTop: '4px',
                      display: 'flex',
                      justifyContent: 'center',
                      gap: '16px',
                      fontWeight: 600
                    }}
                  >
                    <span>📞 {settings['pharmacy_phone'] || '0318-0425090'}</span>
                    <span>✉️ naveedmedicalpharmacy@gmail.com</span>
                  </div>
                </div>

                {/* Right: Cash Memo Badge & Leaf Tagline */}
                <div
                  style={{
                    textAlign: 'right',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    justifyContent: 'center'
                  }}
                >
                  <div
                    style={{
                      backgroundColor: '#e0f2fe',
                      border: '1px solid #7dd3fc',
                      color: '#0369a1',
                      padding: '5px 12px',
                      borderRadius: '4px',
                      fontWeight: 900,
                      fontSize: '0.88rem',
                      letterSpacing: '0.5px',
                      textAlign: 'center'
                    }}
                  >
                    <div>CASH MEMO</div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800 }}>INVOICE</div>
                  </div>
                  <div
                    style={{
                      fontSize: '0.72rem',
                      fontStyle: 'italic',
                      color: '#15803d',
                      fontWeight: 700,
                      marginTop: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}
                  >
                    <span>Your Health Our Priority 🍃</span>
                  </div>
                </div>
              </div>

              {/* 2. METADATA TABLE GRID (MATCHES MOCKUP EXACTLY) */}
              <div style={{ marginTop: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                  <tbody>
                    <tr>
                      <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', width: '22%', backgroundColor: '#f8fafc' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.68rem', color: '#475569' }}>Invoice No.</div>
                        <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '0.85rem' }}>{invNo}</div>
                        <div style={{ marginTop: '2px' }}>
                          <Barcode128 value={invNo} width={0.75} height={18} showText={false} />
                        </div>
                      </td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', width: '18%', backgroundColor: '#f8fafc', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.68rem', color: '#475569' }}>POS No.</div>
                        <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>{posNo}</div>
                      </td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', width: '20%', backgroundColor: '#f8fafc', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.68rem', color: '#475569' }}>Date:</div>
                        <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>{displayDate}</div>
                      </td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', width: '18%', backgroundColor: '#f8fafc', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.68rem', color: '#475569' }}>Time:</div>
                        <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>{displayTime}</div>
                      </td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', width: '22%', backgroundColor: '#f8fafc', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.68rem', color: '#475569' }}>Cashier:</div>
                        <div style={{ fontWeight: 900, color: '#0284c7', fontSize: '0.85rem' }}>{cashier}</div>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.68rem', color: '#475569' }}>Customer:</div>
                        <div style={{ fontWeight: 900, color: '#0f172a' }}>{custName}</div>
                      </td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.68rem', color: '#475569' }}>Phone:</div>
                        <div>{custPhone}</div>
                      </td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.68rem', color: '#475569' }}>Customer ID:</div>
                        <div>{custId}</div>
                      </td>
                      <td colSpan={2} style={{ border: '1px solid #cbd5e1', padding: '6px 8px' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.68rem', color: '#475569' }}>Address:</div>
                        <div>{custAddress}</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 3. ITEMS TABLE WITH WATERMARK OVERLAY */}
              <div style={{ position: 'relative', marginTop: '12px', minHeight: '220px' }}>
                {/* Centered Faint Watermark Logo */}
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    opacity: 0.12,
                    pointerEvents: 'none',
                    zIndex: 0
                  }}
                >
                  <img src="/logo.jpeg" alt="Watermark" style={{ width: '250px', height: '250px', objectFit: 'contain', borderRadius: '50%' }} />
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', position: 'relative', zIndex: 1 }}>
                  <thead>
                    <tr style={{ backgroundColor: '#e2e8f0', color: '#0f172a' }}>
                      <th style={{ border: '1px solid #94a3b8', padding: '6px 4px', textAlign: 'center', width: '35px' }}>S.#</th>
                      <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'left' }}>Item Description</th>
                      <th style={{ border: '1px solid #94a3b8', padding: '6px 4px', textAlign: 'center', width: '75px' }}>Pack Type</th>
                      <th style={{ border: '1px solid #94a3b8', padding: '6px 4px', textAlign: 'center', width: '70px' }}>Pack Taken</th>
                      <th style={{ border: '1px solid #94a3b8', padding: '6px 4px', textAlign: 'center', width: '70px' }}>Unit of Pack</th>
                      <th style={{ border: '1px solid #94a3b8', padding: '6px 4px', textAlign: 'center', width: '70px' }}>Units Taken</th>
                      <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'right', width: '85px' }}>Unit Price (Rs.)</th>
                      <th style={{ border: '1px solid #94a3b8', padding: '6px 8px', textAlign: 'right', width: '95px' }}>Total (Rs.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(248,250,252,0.85)' }}>
                        <td style={{ border: '1px solid #cbd5e1', padding: '6px 4px', textAlign: 'center' }}>{idx + 1}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', fontWeight: 700, color: '#0f172a' }}>
                          {it.brandName}
                          {it.strength && <span style={{ fontWeight: 400, color: '#475569', fontSize: '0.72rem', marginLeft: '4px' }}>({it.strength})</span>}
                        </td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '6px 4px', textAlign: 'center' }}>{it.packType || 'Strip'}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '6px 4px', textAlign: 'center' }}>{it.packTaken !== undefined ? it.packTaken : 1}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '6px 4px', textAlign: 'center' }}>{it.unitOfPack || 10}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '6px 4px', textAlign: 'center', fontWeight: 700 }}>{it.unitsTaken || 1}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'right' }}>{it.unitPrice.toFixed(2)}</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'right', fontWeight: 800 }}>{it.total.toFixed(2)}</td>
                      </tr>
                    ))}
                    {/* Empty placeholder rows to maintain nice table height */}
                    {Array.from({ length: Math.max(0, 4 - items.length) }).map((_, i) => (
                      <tr key={`empty-${i}`}>
                        <td style={{ border: '1px solid #cbd5e1', padding: '10px 4px' }}>&nbsp;</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '10px 8px' }}>&nbsp;</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '10px 4px' }}>&nbsp;</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '10px 4px' }}>&nbsp;</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '10px 4px' }}>&nbsp;</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '10px 4px' }}>&nbsp;</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '10px 8px' }}>&nbsp;</td>
                        <td style={{ border: '1px solid #cbd5e1', padding: '10px 8px' }}>&nbsp;</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 4. PAYMENT & TOTALS FOOTER GRID */}
              <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 240px', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '0.76rem', lineHeight: 1.5 }}>
                  <div><strong>Payment Method:</strong> {paymentMethod}</div>
                  <div><strong>Amount Received:</strong> Rs. {paidAmount.toFixed(2)}</div>
                  <div><strong>Balance:</strong> Rs. {balance.toFixed(2)}</div>
                  <div style={{ marginTop: '6px', fontStyle: 'italic', color: '#475569' }}>Notes: {notes}</div>
                </div>

                <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.8rem', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #cbd5e1' }}>
                    <span style={{ fontWeight: 600 }}>Sub Total (Rs.)</span>
                    <span style={{ fontWeight: 800 }}>{subtotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #cbd5e1' }}>
                    <span style={{ fontWeight: 600 }}>Sales Tax (Rs.)</span>
                    <span style={{ fontWeight: 800 }}>{salesTax.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: '#dcfce7', color: '#14532d', fontWeight: 900, fontSize: '0.92rem' }}>
                    <span>Grand Total (Rs.)</span>
                    <span>{grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* 5. BARCODES & SIGNATURES FOOTER */}
              <div style={{ marginTop: '16px', borderTop: '1px solid #cbd5e1', paddingTop: '12px', display: 'grid', gridTemplateColumns: '160px 140px 1fr', gap: '12px', alignItems: 'flex-end' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', marginBottom: '2px' }}>Invoice Barcode</div>
                  <Barcode128 value={invNo} width={0.95} height={32} showText={true} fontSize={8} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', marginBottom: '2px' }}>Scan to View Invoice</div>
                  <SimpleQRCodeSVG value={invNo} size={50} />
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: 900, color: '#0f172a' }}>
                    PROPRIETOR
                    <div style={{ fontSize: '0.8rem', color: '#032b56', fontWeight: 900 }}>NAVEED AHMED KHAN</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '18px', fontSize: '0.65rem', fontWeight: 700, color: '#334155', marginTop: '12px' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ borderBottom: '1px solid #0f172a', width: '120px', marginBottom: '3px' }}>&nbsp;</div>
                      <div>CHIEF OF PHARMACY</div>
                      <div style={{ fontWeight: 800 }}>ABDUL WAJID KHAN</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ borderBottom: '1px solid #0f172a', width: '110px', marginBottom: '3px' }}>&nbsp;</div>
                      <div>DOC</div>
                      <div style={{ fontWeight: 800 }}>ABDUL WARIS KHAN</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ borderBottom: '1px solid #0f172a', width: '120px', marginBottom: '3px' }}>&nbsp;</div>
                      <div>CHECKED BY</div>
                      <div>Sig: _____</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

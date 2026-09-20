import React, { useRef } from 'react';
import { X, Printer, ArrowDownRight } from 'lucide-react';
import { printThermalElement } from '../utils/thermalPrinter.js';

export interface CashOutVoucherData {
  transactionId: string;
  amount: number;
  category: string;
  transactionNature: string;
  paymentMethod: string;
  recipientType: string;
  recipientName?: string;
  supplierName?: string;
  bankName?: string;
  accountName?: string;
  accountRef?: string;
  trxRef?: string;
  purpose: string;
  referenceNo?: string;
  notes?: string;
  createdAt?: string;
  createdByName?: string;
  supplierBalanceAfter?: number | null;
}

interface CashOutVoucherModalProps {
  voucher: CashOutVoucherData;
  onClose: () => void;
}

export const CashOutVoucherModal: React.FC<CashOutVoucherModalProps> = ({ voucher, onClose }) => {
  const receiptRef = useRef<HTMLDivElement>(null);

  const handlePrintVoucher = () => {
    if (receiptRef.current) {
      printThermalElement(receiptRef.current);
    }
  };

  const formattedDate = voucher.createdAt
    ? new Date(voucher.createdAt).toLocaleString('en-PK', {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    : new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' });

  const getRecipientLabel = () => {
    if (voucher.recipientType === 'SUPPLIER' && voucher.supplierName) {
      return `Supplier: ${voucher.supplierName}`;
    }
    if (voucher.recipientName) {
      return `${voucher.recipientName} (${voucher.recipientType})`;
    }
    if (voucher.bankName) {
      return `Bank: ${voucher.bankName} ${voucher.accountRef ? `(${voucher.accountRef})` : ''}`;
    }
    return voucher.recipientType || 'N/A';
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '520px',
          boxShadow: 'var(--shadow-glass)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(245, 158, 11, 0.08) 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700
              }}
            >
              <ArrowDownRight size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Cash Out Voucher
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {voucher.transactionId} • Payment Confirmation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Printable Section */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
          <div
            ref={receiptRef}
            style={{
              backgroundColor: '#ffffff',
              color: '#000000',
              padding: '1.5rem',
              borderRadius: '12px',
              border: '2px dashed #cbd5e1',
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: '0.88rem'
            }}
          >
            {/* Pharmacy Branding Header */}
            <div style={{ textAlign: 'center', marginBottom: '1rem', borderBottom: '1px dashed #64748b', paddingBottom: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, textTransform: 'uppercase', color: '#0f172a' }}>
                NAVEED MEDICAL PHARMACY
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#475569' }}>
                Main Market, GT Road, Pharmacy Management System
              </p>
              <div style={{ margin: '6px auto 0', padding: '3px 8px', background: '#fee2e2', color: '#991b1b', fontWeight: 700, borderRadius: '4px', display: 'inline-block', fontSize: '0.75rem' }}>
                OFFICIAL CASH OUT PAYMENT VOUCHER
              </div>
            </div>

            {/* Voucher Core Info */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#64748b' }}>Voucher Trx ID:</span>
                <strong style={{ color: '#0f172a' }}>{voucher.transactionId}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#64748b' }}>Date & Time:</span>
                <span>{formattedDate}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#64748b' }}>Classification:</span>
                <strong style={{ color: '#0369a1' }}>{voucher.transactionNature?.replace('_', ' ')}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#64748b' }}>Payment Method:</span>
                <span>{voucher.paymentMethod}</span>
              </div>
            </div>

            <div style={{ borderTop: '1px dashed #cbd5e1', borderBottom: '1px dashed #cbd5e1', padding: '0.75rem 0', margin: '0.75rem 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: '#64748b' }}>Category:</span>
                <strong>{voucher.category}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: '#64748b' }}>Paid To:</span>
                <strong style={{ color: '#0f172a' }}>{getRecipientLabel()}</strong>
              </div>

              {voucher.bankName && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.8rem' }}>
                  <span style={{ color: '#64748b' }}>Bank / Account:</span>
                  <span>{voucher.bankName} {voucher.accountName ? `(${voucher.accountName})` : ''}</span>
                </div>
              )}

              {voucher.trxRef && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.8rem' }}>
                  <span style={{ color: '#64748b' }}>Ref / Trx #:</span>
                  <span>{voucher.trxRef}</span>
                </div>
              )}

              <div style={{ marginTop: '8px' }}>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.8rem' }}>Purpose / Notes:</span>
                <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '4px', marginTop: '2px', fontWeight: 600, color: '#1e293b' }}>
                  {voucher.purpose}
                  {voucher.notes ? ` (${voucher.notes})` : ''}
                </div>
              </div>
            </div>

            {/* Total Amount Pill */}
            <div style={{ background: '#f1f5f9', borderRadius: '8px', padding: '0.88rem', textAlign: 'center', margin: '1rem 0' }}>
              <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.5px' }}>
                AMOUNT PAID FROM CASH DRAWER
              </span>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#dc2626', marginTop: '2px' }}>
                Rs. {Number(voucher.amount).toLocaleString('en-PK', { minimumFractionDigits: 2 })}
              </div>
              {voucher.supplierBalanceAfter !== undefined && voucher.supplierBalanceAfter !== null && (
                <div style={{ fontSize: '0.75rem', color: '#0284c7', marginTop: '4px', fontWeight: 600 }}>
                  Supplier Remaining Balance: Rs. {Number(voucher.supplierBalanceAfter).toLocaleString('en-PK')}
                </div>
              )}
            </div>

            {/* Signatures */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', fontSize: '0.75rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ borderBottom: '1px solid #94a3b8', width: '100px', marginBottom: '4px' }}></div>
                <span>Prepared By ({voucher.createdByName || 'Staff'})</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ borderBottom: '1px solid #94a3b8', width: '100px', marginBottom: '4px' }}></div>
                <span>Recipient Signature</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-app)'
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handlePrintVoucher}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#0284c7' }}
          >
            <Printer size={18} /> Print Payment Voucher
          </button>
        </div>
      </div>
    </div>
  );
};

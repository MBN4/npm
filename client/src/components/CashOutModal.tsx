import React, { useState, useEffect } from 'react';
import { X, DollarSign, AlertTriangle, Building2, User, Wallet, CreditCard, Tag } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { CashOutVoucherModal, CashOutVoucherData } from './CashOutVoucherModal.js';

interface CashOutCategory {
  id: number;
  name: string;
  default_nature: string;
}

interface SupplierOption {
  id: number;
  name: string;
  company_name?: string;
  mobile?: string;
  current_balance?: number;
}

interface CashOutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CashOutModal: React.FC<CashOutModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { token, user } = useAuth();

  const [categories, setCategories] = useState<CashOutCategory[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [amount, setAmount] = useState<string>('');
  const [category, setCategory] = useState<string>('Miscellaneous');
  const [transactionNature, setTransactionNature] = useState<string>('BUSINESS_EXPENSE');
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [recipientType, setRecipientType] = useState<string>('OTHER');

  // Recipient Specific
  const [supplierId, setSupplierId] = useState<string>('');
  const [recipientName, setRecipientName] = useState<string>('');
  const [recipientPhone, setRecipientPhone] = useState<string>('');
  const [recipientRole, setRecipientRole] = useState<string>('');
  const [bankName, setBankName] = useState<string>('');
  const [accountName, setAccountName] = useState<string>('');
  const [accountRef, setAccountRef] = useState<string>('');
  const [trxRef, setTrxRef] = useState<string>('');

  // Description & Ref
  const [purpose, setPurpose] = useState<string>('');
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Success Voucher State
  const [createdVoucher, setCreatedVoucher] = useState<CashOutVoucherData | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
      fetchSuppliers();
    }
  }, [isOpen]);

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/cashout/categories', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.categories && data.categories.length > 0) {
        setCategories(data.categories);
      }
    } catch (err) {
      console.error('Failed to load cash out categories', err);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('/api/suppliers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setSuppliers(data);
      } else if (data.suppliers) {
        setSuppliers(data.suppliers);
      }
    } catch (err) {
      console.error('Failed to load suppliers', err);
    }
  };

  const handleCategoryChange = (catName: string) => {
    setCategory(catName);
    const selected = categories.find(c => c.name === catName);
    if (selected && selected.default_nature) {
      setTransactionNature(selected.default_nature);
      if (selected.default_nature === 'SUPPLIER_PAYMENT') {
        setRecipientType('SUPPLIER');
      } else if (selected.default_nature === 'BANK_DEPOSIT') {
        setRecipientType('BANK');
      } else if (selected.default_nature === 'WALLET_TRANSFER') {
        setRecipientType('WALLET');
      } else if (selected.default_nature === 'OWNER_WITHDRAWAL') {
        setRecipientType('EMPLOYEE');
      }
    }
  };

  const handleRecipientTypeChange = (type: string) => {
    setRecipientType(type);
    if (type === 'SUPPLIER') {
      setTransactionNature('SUPPLIER_PAYMENT');
      setCategory('Supplier Payment');
    } else if (type === 'BANK') {
      setTransactionNature('BANK_DEPOSIT');
      setCategory('Bank Deposit');
    } else if (type === 'WALLET') {
      setTransactionNature('WALLET_TRANSFER');
      setCategory('Mobile Wallet Transfer');
    } else if (type === 'EMPLOYEE') {
      setCategory('Staff Advance / Salary');
    }
  };

  const handlePresetAmount = (val: number) => {
    const current = Number(amount) || 0;
    setAmount(String(current + val));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const numAmt = Number(amount);
    if (isNaN(numAmt) || numAmt <= 0) {
      setError('Please enter a valid amount greater than Rs. 0');
      return;
    }

    if (!purpose.trim()) {
      setError('Purpose / Description is required');
      return;
    }

    if (recipientType === 'SUPPLIER' && !supplierId) {
      setError('Please select a supplier for supplier payment');
      return;
    }

    setSubmitting(true);
    try {
      const selectedSupp = suppliers.find(s => String(s.id) === supplierId);

      const payload = {
        amount: numAmt,
        category,
        transactionNature,
        paymentMethod,
        recipientType,
        supplierId: supplierId ? Number(supplierId) : null,
        recipientName: recipientName.trim() || undefined,
        recipientPhone: recipientPhone.trim() || undefined,
        recipientRole: recipientRole.trim() || undefined,
        bankName: bankName.trim() || undefined,
        accountName: accountName.trim() || undefined,
        accountRef: accountRef.trim() || undefined,
        trxRef: trxRef.trim() || undefined,
        purpose: purpose.trim(),
        referenceNo: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined
      };

      const res = await fetch('/api/cashout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record cash out entry');
      }

      const voucherData: CashOutVoucherData = {
        transactionId: data.transactionId,
        amount: numAmt,
        category,
        transactionNature,
        paymentMethod,
        recipientType,
        recipientName: recipientName || undefined,
        supplierName: selectedSupp?.name || undefined,
        bankName: bankName || undefined,
        accountName: accountName || undefined,
        accountRef: accountRef || undefined,
        trxRef: trxRef || undefined,
        purpose: purpose.trim(),
        referenceNo: referenceNo || undefined,
        notes: notes || undefined,
        createdAt: new Date().toISOString(),
        createdByName: user?.fullName || user?.username || 'Cashier',
        supplierBalanceAfter: data.supplierBalanceAfter
      };

      setCreatedVoucher(voucherData);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error creating cash out record');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  if (createdVoucher) {
    return (
      <CashOutVoucherModal
        voucher={createdVoucher}
        onClose={() => {
          setCreatedVoucher(null);
          onClose();
        }}
      />
    );
  }

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
          maxWidth: '680px',
          boxShadow: 'var(--shadow-glass)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh'
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
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(245, 158, 11, 0.08) 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
              }}
            >
              <DollarSign size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Cash Out / Expense Entry
              </h3>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Deduct from Cash Drawer & Record Expense / Transfer
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
              padding: '6px',
              borderRadius: '8px'
            }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', flex: 1 }}>
            {error && (
              <div
                style={{
                  backgroundColor: 'var(--danger-light)',
                  border: '1px solid var(--danger)',
                  color: 'var(--danger-text)',
                  padding: '0.88rem 1rem',
                  borderRadius: '10px',
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <AlertTriangle size={18} />
                <span>{error}</span>
              </div>
            )}

            {/* 1. Amount Section with Fast Presets */}
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.04)',
                border: '1.5px dashed rgba(239, 68, 68, 0.25)',
                borderRadius: '12px',
                padding: '1.25rem'
              }}
            >
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                CASH OUT AMOUNT (PKR) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: '14px',
                    fontSize: '1.3rem',
                    fontWeight: 800,
                    color: '#ef4444'
                  }}
                >
                  Rs.
                </span>
                <input
                  type="number"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem 0.75rem 3.5rem',
                    fontSize: '1.5rem',
                    fontWeight: 800,
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Preset Pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.88rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Fast Add:
                </span>
                {[500, 1000, 5000, 10000, 50000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handlePresetAmount(preset)}
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    +Rs. {preset.toLocaleString()}
                  </button>
                ))}
                {amount && (
                  <button
                    type="button"
                    onClick={() => setAmount('')}
                    style={{
                      padding: '4px 8px',
                      fontSize: '0.78rem',
                      borderRadius: '6px',
                      border: '1px solid #fca5a5',
                      backgroundColor: '#fef2f2',
                      color: '#dc2626',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* 2. Nature & Category Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Category <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.88rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem'
                  }}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                  {!categories.some((c) => c.name === 'Miscellaneous') && <option value="Miscellaneous">Miscellaneous</option>}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Transaction Nature
                </label>
                <select
                  value={transactionNature}
                  onChange={(e) => setTransactionNature(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.88rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    fontWeight: 600
                  }}
                >
                  <option value="BUSINESS_EXPENSE">💼 Business Expense (P&L Operating Expense)</option>
                  <option value="SUPPLIER_PAYMENT">🏭 Supplier Payment (Settles Accounts Payable)</option>
                  <option value="BANK_DEPOSIT">🏦 Bank Deposit (Cash Drawer → Bank)</option>
                  <option value="WALLET_TRANSFER">📱 Mobile Wallet Transfer (JazzCash/EasyPaisa)</option>
                  <option value="OWNER_WITHDRAWAL">👤 Owner Withdrawal / Personal Drawing</option>
                </select>
              </div>
            </div>

            {/* 3. Recipient Type Selector */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Paid To / Recipient Type <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' }}>
                {[
                  { id: 'SUPPLIER', label: 'Supplier', icon: Building2 },
                  { id: 'EMPLOYEE', label: 'Employee', icon: User },
                  { id: 'BANK', label: 'Bank', icon: CreditCard },
                  { id: 'WALLET', label: 'Wallet', icon: Wallet },
                  { id: 'OTHER', label: 'Other / Person', icon: Tag }
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = recipientType === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleRecipientTypeChange(item.id)}
                      style={{
                        padding: '0.6rem 0.4rem',
                        borderRadius: '8px',
                        border: `1.5px solid ${isSelected ? '#0284c7' : 'var(--border)'}`,
                        backgroundColor: isSelected ? 'var(--primary-light)' : 'var(--bg-surface)',
                        color: isSelected ? '#0284c7' : 'var(--text-primary)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: '0.78rem'
                      }}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dynamic Recipient Fields */}
            {recipientType === 'SUPPLIER' && (
              <div style={{ backgroundColor: 'var(--bg-app)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Select Supplier <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.88rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem'
                  }}
                >
                  <option value="">-- Choose Supplier --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.company_name ? `(${s.company_name})` : ''} {s.current_balance !== undefined ? `— Bal: Rs. ${s.current_balance}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {recipientType === 'EMPLOYEE' && (
              <div style={{ backgroundColor: 'var(--bg-app)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Employee / Person Name</label>
                  <input
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="e.g. Ali Raza (Pharmacist)"
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Role / Designation</label>
                  <input
                    type="text"
                    value={recipientRole}
                    onChange={(e) => setRecipientRole(e.target.value)}
                    placeholder="e.g. Sales Staff / Helper"
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
            )}

            {(recipientType === 'BANK' || recipientType === 'WALLET') && (
              <div style={{ backgroundColor: 'var(--bg-app)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    {recipientType === 'BANK' ? 'Bank Name' : 'Wallet Provider'}
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder={recipientType === 'BANK' ? 'e.g. Bank Al Habib / Meezan' : 'e.g. JazzCash / EasyPaisa'}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Account Title / Name</label>
                  <input
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="e.g. Naveed Pharmacy Account"
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Account / IBAN / Mobile #</label>
                  <input
                    type="text"
                    value={accountRef}
                    onChange={(e) => setAccountRef(e.target.value)}
                    placeholder="e.g. PK36ALHB0000000000000000"
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Trx / Deposit Slip Ref #</label>
                  <input
                    type="text"
                    value={trxRef}
                    onChange={(e) => setTrxRef(e.target.value)}
                    placeholder="e.g. TRX-9921029"
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
            )}

            {recipientType === 'OTHER' && (
              <div style={{ backgroundColor: 'var(--bg-app)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Recipient Name</label>
                  <input
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="e.g. Electrician / Delivery Boy"
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Phone Number (Optional)</label>
                  <input
                    type="text"
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    placeholder="0300-1234567"
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
            )}

            {/* 4. Payment Method & Ref No Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Drawer Payment Source
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.88rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem'
                  }}
                >
                  <option value="CASH">💵 Main Cash Drawer (Physical Cash)</option>
                  <option value="BANK_TRANSFER">🏦 Bank Direct Transfer</option>
                  <option value="MOBILE_WALLET">📱 JazzCash / EasyPaisa Counter</option>
                  <option value="CHEQUE">📝 Cheque / Bank Instrument</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Bill / Invoice / Receipt Ref # (Optional)
                </label>
                <input
                  type="text"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="e.g. ELEC-JULY-2026 / Bill #120"
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.88rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem'
                  }}
                />
              </div>
            </div>

            {/* 5. Purpose & Notes */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Purpose / Detailed Description <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Describe clearly why this money is leaving the cash drawer (e.g., Monthly Shop Electricity Bill July 2026 paid to WAPDA)"
                rows={2}
                required
                style={{
                  width: '100%',
                  padding: '0.65rem 0.88rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  resize: 'vertical'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Internal Audit Notes (Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Approved by Owner Naveed Sb."
                style={{
                  width: '100%',
                  padding: '0.65rem 0.88rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontSize: '0.88rem'
                }}
              />
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
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: '#ef4444',
                borderColor: '#dc2626'
              }}
            >
              {submitting ? 'Recording Transaction...' : '💸 Confirm & Save Cash Out'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

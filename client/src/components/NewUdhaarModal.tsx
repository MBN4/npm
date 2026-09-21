import React, { useState } from 'react';
import {
  X,
  User,
  Phone,
  FileText,
  CreditCard,
  RotateCcw,
  Save,
  CheckCircle2,
  Info,
  Scan
} from 'lucide-react';
import { UdhaarCustomer } from '../types/udhaar.js';
import { udhaarService } from '../services/udhaarService.js';

interface NewUdhaarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newCust: UdhaarCustomer) => void;
}

export const NewUdhaarModal: React.FC<NewUdhaarModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [customerName, setCustomerName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [reference, setReference] = useState('');
  const [cnic, setCnic] = useState('');
  const [category, setCategory] = useState<'Medicine' | 'Cosmetics' | 'General Products' | 'Surgical'>('Medicine');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Auto derive serial number preview from CNIC or Mobile
  const cleanCnic = cnic.replace(/\D/g, '');
  const serialPreview = cleanCnic.length >= 4 ? cleanCnic.slice(-4) : (mobileNumber.replace(/\D/g, '').slice(-4) || 'Auto from CNIC (Last 4 digits)');

  const handleReset = () => {
    setCustomerName('');
    setMobileNumber('');
    setReference('');
    setCnic('');
    setCategory('Medicine');
    setAmount('');
    setDescription('');
    setError(null);
  };

  const handleSave = async (addAnother = false) => {
    if (!customerName.trim()) {
      setError('Please enter Customer Name.');
      return;
    }
    if (!mobileNumber.trim()) {
      setError('Please enter Mobile Number.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const created = await udhaarService.createUdhaar({
        name: customerName.trim(),
        mobile: mobileNumber.trim(),
        reference: reference.trim() || undefined,
        cnic: cnic.trim() || undefined,
        category,
        amount: Number(amount || 0),
        description: description.trim() || undefined
      });

      onSuccess(created);

      if (addAnother) {
        handleReset();
      } else {
        handleReset();
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save Udhaar entry');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 12, 26, 0.85)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div
        style={{
          backgroundColor: '#0a1324',
          border: '1px solid #1e2d4a',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '680px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f8fafc'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid #1e2d4a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, #0d1b38 0%, #0f2552 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)'
              }}
            >
              <User size={22} color="#fff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>
                New Udhaar
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                Add a new customer credit entry
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body Form */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', maxHeight: '80vh', overflowY: 'auto' }}>
          {error && (
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* Customer Name */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '6px' }}>
                <User size={15} color="#38bdf8" /> Customer Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter customer name"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  backgroundColor: '#0f1a30',
                  border: '1px solid #1e2f4d',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Mobile Number */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '6px' }}>
                <Phone size={15} color="#38bdf8" /> Mobile Number <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                required
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                placeholder="03XX-XXXXXXX"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  backgroundColor: '#0f1a30',
                  border: '1px solid #1e2f4d',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* Reference */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '6px' }}>
                <FileText size={15} color="#38bdf8" /> Reference
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. Prescription No., Doctor Name, etc."
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  backgroundColor: '#0f1a30',
                  border: '1px solid #1e2f4d',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* ID Card / CNIC Optional */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '6px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <CreditCard size={15} color="#38bdf8" /> ID Card (CNIC)
                </span>
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 400 }}>Optional</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={cnic}
                  onChange={(e) => setCnic(e.target.value)}
                  placeholder="Enter CNIC number"
                  style={{
                    width: '100%',
                    padding: '0.65rem 2.2rem 0.65rem 0.85rem',
                    backgroundColor: '#0f1a30',
                    border: '1px solid #1e2f4d',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                />
                <Scan size={16} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#38bdf8' }} />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* Category Dropdown */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '6px' }}>
                Category <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  backgroundColor: '#0f1a30',
                  border: '1px solid #1e2f4d',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box'
                }}
              >
                <option value="Medicine">1. Medicine</option>
                <option value="Cosmetics">2. Cosmetics</option>
                <option value="General Products">3. General Products</option>
                <option value="Surgical">4. Surgical</option>
              </select>
            </div>

            {/* Serial No. (CNIC Last 4 Digits) */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '6px' }}>
                # Serial No.
              </label>
              <input
                type="text"
                readOnly
                value={serialPreview}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  backgroundColor: '#0b1322',
                  border: '1px solid #1e2f4d',
                  borderRadius: '8px',
                  color: '#38bdf8',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>
                <Info size={13} color="#38bdf8" />
                <span>Serial number will be auto-filled from CNIC (last 4 digits)</span>
              </div>
            </div>
          </div>

          {/* Amount (Rs.) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '6px' }}>
              Udhaar Amount (Rs.)
            </label>
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 1250"
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                backgroundColor: '#0f1a30',
                border: '1px solid #1e2f4d',
                borderRadius: '8px',
                color: '#34d399',
                fontSize: '1.1rem',
                fontWeight: 700,
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Description */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0' }}>
                <FileText size={15} color="#38bdf8" /> Description
              </label>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{description.length}/500</span>
            </div>
            <textarea
              rows={3}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter product details, notes or description..."
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                backgroundColor: '#0f1a30',
                border: '1px solid #1e2f4d',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.88rem',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderTop: '1px solid #1e2d4a',
            backgroundColor: '#0d172a',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <button
            onClick={handleReset}
            style={{
              padding: '0.6rem 1.25rem',
              backgroundColor: 'transparent',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#cbd5e1',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <RotateCcw size={16} /> Clear
          </button>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => handleSave(true)}
              disabled={loading}
              style={{
                padding: '0.65rem 1.25rem',
                backgroundColor: '#2563eb',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.3)'
              }}
            >
              <Save size={16} /> Save & Add Another
            </button>

            <button
              onClick={() => handleSave(false)}
              disabled={loading}
              style={{
                padding: '0.65rem 1.5rem',
                backgroundColor: '#10b981',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.3)'
              }}
            >
              <CheckCircle2 size={18} /> Save Udhaar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

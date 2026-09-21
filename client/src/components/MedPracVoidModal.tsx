import React, { useState } from 'react';
import { X, AlertTriangle, RotateCcw } from 'lucide-react';
import { MedPracVisit } from '../types/medprac.js';
import { medpracService } from '../services/medpracService.js';

interface MedPracVoidModalProps {
  visit: MedPracVisit;
  onClose: () => void;
  onSuccess: () => void;
  currentUser?: { id: number; fullName: string };
}

export const MedPracVoidModal: React.FC<MedPracVoidModalProps> = ({
  visit,
  onClose,
  onSuccess,
  currentUser
}) => {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please specify a valid reason for voiding/reversing this entry.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await medpracService.voidVisit(
        visit.id,
        reason.trim(),
        currentUser?.id || 1,
        currentUser?.fullName || 'Pharmacist'
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to void visit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
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
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--danger)',
            color: '#fff'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={20} />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
              Void / Reverse Medprac Entry
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ backgroundColor: 'var(--danger-light)', border: '1px solid var(--danger)', borderRadius: '8px', padding: '0.75rem', fontSize: '0.85rem', color: 'var(--danger-text)' }}>
            <strong>Warning:</strong> Reversing this entry will void visit <strong>{visit.visit_id}</strong> for patient <strong>{visit.patient_name || visit.patient_serial}</strong> (Amount: Rs. {visit.total_amount.toFixed(2)}). The entry will remain preserved in audit history. If inventory was deducted, stock will be automatically restored.
          </div>

          {error && (
            <div style={{ backgroundColor: 'var(--danger-light)', color: 'var(--danger-text)', padding: '0.6rem', borderRadius: '6px', fontSize: '0.85rem', border: '1px solid var(--danger)' }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Reversal Reason *
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason for voiding (e.g., Wrong patient selected, Duplicate entry, Incorrect dose charge...)"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                borderRadius: '6px',
                fontSize: '0.9rem',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Authorized By: <strong style={{ color: 'var(--text-primary)' }}>{currentUser?.fullName || 'Current User'}</strong>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={loading}
              style={{ padding: '0.5rem 1rem' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'var(--danger)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <RotateCcw size={16} />
              {loading ? 'Processing...' : 'Confirm Void Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

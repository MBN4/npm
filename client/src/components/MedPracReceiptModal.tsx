import React, { useRef, useState } from 'react';
import { X, Printer } from 'lucide-react';
import { MedPracVisit } from '../types/medprac.js';
import { useAuth } from '../context/AuthContext.js';
import { printThermalElement } from '../utils/thermalPrinter.js';

interface MedPracReceiptModalProps {
  visit: MedPracVisit;
  onClose: () => void;
}

export const MedPracReceiptModal: React.FC<MedPracReceiptModalProps> = ({ visit, onClose }) => {
  const thermalRef = useRef<HTMLDivElement>(null);
  const { token } = useAuth();
  const [printing, setPrinting] = useState(false);
  const [printMessage, setPrintMessage] = useState('');

  const handlePrint = async () => {
    setPrinting(true);
    setPrintMessage('');
    try {
      const response = await fetch('/api/integrations/print-medprac-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ visitId: visit.visit_id })
      });
      const result = await response.json();
      if (response.ok && result.success) {
        setPrintMessage(result.message || 'MedPrac slip sent to the POS printer.');
      } else {
        setPrintMessage(result.message || 'Choose the POS printer in the print dialog.');
        if (thermalRef.current) printThermalElement(thermalRef.current);
      }
    } catch {
      setPrintMessage('Choose the POS printer in the print dialog.');
      if (thermalRef.current) printThermalElement(thermalRef.current);
    } finally {
      setPrinting(false);
    }
  };

  const formattedDate = new Date(visit.visit_date).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

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
          maxWidth: '440px',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, var(--primary) 0%, #2563eb 100%)',
            color: '#fff'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Printer size={20} />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Medprac Practice Receipt</h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Printable Paper Area */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, background: 'var(--bg-app)' }}>
          <div
            ref={thermalRef}
            style={{
              backgroundColor: '#fff',
              padding: '1.25rem',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              fontFamily: 'Courier New, monospace, sans-serif',
              color: '#0f172a'
            }}
          >
            {/* Pharmacy Header */}
            <div style={{ textAlign: 'center', borderBottom: '1px dashed #cbd5e1', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1e3a8a' }}>NAVEED MEDICAL</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Pharmacy Practice Record</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Small Practice Big Impact</div>
            </div>

            {/* Visit Details */}
            <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#64748b' }}>Visit ID:</span>
                <span style={{ fontWeight: 700 }}>{visit.visit_id}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#64748b' }}>Patient Serial:</span>
                <span style={{ fontWeight: 700 }}>{visit.patient_serial}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#64748b' }}>Patient Name:</span>
                <span style={{ fontWeight: 600 }}>{visit.patient_name || visit.patient?.name || 'N/A'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#64748b' }}>Age / Sex:</span>
                <span>{visit.patient_age || visit.patient?.age} {visit.patient_age_unit || visit.patient?.age_unit} | {visit.patient_sex || visit.patient?.sex}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#64748b' }}>Date & Time:</span>
                <span>{formattedDate}</span>
              </div>
            </div>

            <div style={{ borderTop: '1px dashed #cbd5e1', margin: '0.5rem 0' }} />

            {/* Clinical Encounter Details */}
            <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#64748b' }}>Category:</span>
                <span style={{ fontWeight: 600, color: '#1e3a8a' }}>{visit.therapeutic_category_name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#64748b' }}>Dose Given:</span>
                <span style={{ fontWeight: 600 }}>Dose {visit.dose_given} {visit.dose_notation ? `(${visit.dose_notation})` : ''}</span>
              </div>
            </div>

            {/* Services Rendered */}
            {visit.services && visit.services.length > 0 && (
              <>
                <div style={{ borderTop: '1px dashed #cbd5e1', margin: '0.5rem 0' }} />
                <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px', color: '#334155' }}>Services Provided:</div>
                  {visit.services.map((svc, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', paddingLeft: '8px' }}>
                      <span>• {svc.service_name}</span>
                      <span>Rs. {svc.cost.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Attached Medicines */}
            {visit.medicines && visit.medicines.length > 0 && (
              <>
                <div style={{ borderTop: '1px dashed #cbd5e1', margin: '0.5rem 0' }} />
                <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px', color: '#334155' }}>Medicines Dispensed:</div>
                  {visit.medicines.map((m, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', paddingLeft: '8px' }}>
                      <span>{m.brand_name} x {m.quantity_used}</span>
                      <span>Rs. {(m.total_price || (m.selling_price || 0) * m.quantity_used).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ borderTop: '1px dashed #cbd5e1', margin: '0.5rem 0' }} />

            {/* Charges Summary */}
            <div style={{ fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span style={{ color: '#64748b' }}>Practice / Dose Charge:</span>
                <span>Rs. {visit.practice_dose_charge.toFixed(2)}</span>
              </div>
              {visit.total_service_charge > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ color: '#64748b' }}>Service Charges:</span>
                  <span>Rs. {visit.total_service_charge.toFixed(2)}</span>
                </div>
              )}
              {visit.total_medicine_charge > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ color: '#64748b' }}>Medicine Charges:</span>
                  <span>Rs. {visit.total_medicine_charge.toFixed(2)}</span>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  color: '#15803d',
                  padding: '6px 0',
                  borderTop: '2px solid #16a34a',
                  borderBottom: '2px solid #16a34a',
                  marginTop: '6px'
                }}
              >
                <span>TOTAL AMOUNT:</span>
                <span>Rs. {visit.total_amount.toFixed(2)}</span>
              </div>
            </div>

            {/* Footer info */}
            <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#64748b', marginTop: '1rem', borderTop: '1px dashed #cbd5e1', paddingTop: '0.5rem' }}>
              <div>Recorded By: <span style={{ fontWeight: 600, color: '#334155' }}>{visit.medprac_by_user_name}</span></div>
              <div style={{ marginTop: '2px', fontStyle: 'italic' }}>Thank you for visiting Naveed Medical!</div>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        {printMessage && <div style={{ padding: '0.5rem 1.25rem', fontSize: '0.8rem' }}>{printMessage}</div>}
        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '0.5rem 1rem' }}
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            disabled={printing}
            className="btn btn-primary"
            style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <Printer size={16} /> {printing ? 'Printing...' : 'Print on POS Printer'}
          </button>
        </div>
      </div>
    </div>
  );
};

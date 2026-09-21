import React, { useEffect, useState } from 'react';
import { X, Activity } from 'lucide-react';
import { MedPracPatient, MedPracVisit } from '../types/medprac.js';
import { medpracService } from '../services/medpracService.js';
import { MedPracReceiptModal } from './MedPracReceiptModal.js';

interface MedPracHistoryModalProps {
  patient: MedPracPatient;
  onClose: () => void;
}

export const MedPracHistoryModal: React.FC<MedPracHistoryModalProps> = ({ patient: initialPatient, onClose }) => {
  const [patient, setPatient] = useState<MedPracPatient>(initialPatient);
  const [visits, setVisits] = useState<MedPracVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVisitForReceipt, setSelectedVisitForReceipt] = useState<MedPracVisit | null>(null);

  useEffect(() => {
    loadHistory();
  }, [initialPatient.id, initialPatient.serial_number]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await medpracService.getPatientHistory(initialPatient.id || initialPatient.serial_number);
      if (data.patient) setPatient(data.patient);
      if (data.visits) setVisits(data.visits);
    } catch (err) {
      console.error(err);
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
        zIndex: 9990,
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
          maxWidth: '750px',
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
            <Activity size={20} />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
              Longitudinal Medprac History
            </h3>
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

        {/* Content Body */}
        <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--bg-app)' }}>
          {/* Patient Profile Card */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '1rem 1.25rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0.75rem',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Patient Serial</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>{patient.serial_number}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Patient Name</div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{patient.name}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Age / Sex</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-secondary)' }}>{patient.age} {patient.age_unit} | {patient.sex}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone</div>
              <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>{patient.phone || 'Not Provided'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Address</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{patient.address || 'Not Provided'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Visits</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--success-text)' }}>{patient.total_visits || visits.length} Visits</div>
            </div>
          </div>

          {/* Visits Timeline */}
          <div>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Visit Encounters ({visits.length})
            </h4>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading history...</div>
            ) : visits.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                No prior Medprac visits recorded for this patient.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {visits.map(v => {
                  const isVoided = v.status === 'VOIDED';
                  const dateFormatted = new Date(v.visit_date).toLocaleString('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  });

                  return (
                    <div
                      key={v.id}
                      style={{
                        backgroundColor: isVoided ? 'var(--danger-light)' : 'var(--bg-surface)',
                        border: isVoided ? '1px solid var(--danger)' : '1px solid var(--border)',
                        borderRadius: '8px',
                        padding: '1rem',
                        boxShadow: 'var(--shadow-sm)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <div>
                          <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.95rem' }}>{v.visit_id}</span>
                          <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{dateFormatted}</span>
                          {isVoided && (
                            <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 600 }}>
                              VOIDED
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: isVoided ? 'var(--text-muted)' : 'var(--success-text)' }}>
                          Rs. {v.total_amount.toFixed(2)}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Therapeutic Category: </span>
                          <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{v.therapeutic_category_name}</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Dose Given: </span>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Dose {v.dose_given} {v.dose_notation ? `(${v.dose_notation})` : ''}</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Medprac By: </span>
                          <span style={{ color: 'var(--text-primary)' }}>{v.medprac_by_user_name}</span>
                        </div>
                      </div>

                      {/* Services list */}
                      {v.services && v.services.length > 0 && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-app)', padding: '0.4rem 0.6rem', borderRadius: '4px', marginBottom: '0.5rem', border: '1px solid var(--border)' }}>
                          <strong style={{ color: 'var(--text-primary)' }}>Services:</strong>{' '}
                          {v.services.map(s => `${s.service_name} (Rs. ${s.cost})`).join(', ')}
                        </div>
                      )}

                      {/* Medicines list */}
                      {v.medicines && v.medicines.length > 0 && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', backgroundColor: 'var(--primary-light)', padding: '0.4rem 0.6rem', borderRadius: '4px', marginBottom: '0.5rem', border: '1px solid var(--primary-border)' }}>
                          <strong style={{ color: 'var(--primary)' }}>Medicines:</strong>{' '}
                          {v.medicines.map(m => `${m.brand_name} x${m.quantity_used}`).join(', ')}
                        </div>
                      )}

                      {v.notes && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '0.5rem' }}>
                          Note: "{v.notes}"
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button
                          onClick={() => setSelectedVisitForReceipt(v)}
                          className="btn btn-secondary"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                        >
                          View / Print Receipt
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>
            Close
          </button>
        </div>
      </div>

      {selectedVisitForReceipt && (
        <MedPracReceiptModal
          visit={selectedVisitForReceipt}
          onClose={() => setSelectedVisitForReceipt(null)}
        />
      )}
    </div>
  );
};

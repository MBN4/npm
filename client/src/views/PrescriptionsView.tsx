import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  FileText,
  Plus,
  RefreshCw,
  Stethoscope,
  Printer,
  X,
  Trash2
} from 'lucide-react';

export interface PrescriptionItem {
  medicineId: string;
  dosage: string;
  frequency: string;
  duration: string;
  timing: string;
  instructions: string;
}

export const PrescriptionsView: React.FC = () => {
  const { token } = useAuth();
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedRx, setSelectedRx] = useState<any>(null);

  // Form State
  const [patientId, setPatientId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PrescriptionItem[]>([
    {
      medicineId: '',
      dosage: '1 Tablet',
      frequency: 'BD (Twice Daily)',
      duration: '5 days',
      timing: 'After Food',
      instructions: ''
    }
  ]);

  const fetchPrescriptions = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/prescriptions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPrescriptions(data.prescriptions);
      }
    } catch (err) {
      console.error('Error fetching prescriptions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMetadata = async () => {
    try {
      const [patRes, docRes, medRes] = await Promise.all([
        fetch('/api/patients', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/prescriptions/doctors', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/medicines', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (patRes.ok) setPatients((await patRes.json()).patients);
      if (docRes.ok) setDoctors((await docRes.json()).doctors);
      if (medRes.ok) setMedicines((await medRes.json()).medicines);
    } catch (err) {
      console.error('Error fetching metadata:', err);
    }
  };

  useEffect(() => {
    fetchPrescriptions();
    fetchMetadata();
  }, [token]);

  const handleItemChange = (index: number, field: keyof PrescriptionItem, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const addItemRow = () => {
    setItems([
      ...items,
      {
        medicineId: '',
        dosage: '1 Tablet',
        frequency: 'OD (Once Daily)',
        duration: '5 days',
        timing: 'After Food',
        instructions: ''
      }
    ]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleOpenRxDetail = async (rxId: number) => {
    try {
      const res = await fetch(`/api/prescriptions/${rxId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedRx(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmitPrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!patientId) {
      setStatusMessage({ text: 'Please select a patient.', type: 'error' });
      return;
    }

    for (let i = 0; i < items.length; i++) {
      if (!items[i].medicineId) {
        setStatusMessage({ text: `Please select medicine for item #${i + 1}`, type: 'error' });
        return;
      }
    }

    try {
      const res = await fetch('/api/prescriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          patientId: Number(patientId),
          doctorId: doctorId ? Number(doctorId) : null,
          diagnosis: diagnosis.trim(),
          notes: notes.trim(),
          items: items.map(it => ({
            medicineId: Number(it.medicineId),
            dosage: it.dosage,
            frequency: it.frequency,
            duration: it.duration,
            timing: it.timing,
            instructions: it.instructions
          }))
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({ text: data.error || 'Failed to save prescription', type: 'error' });
        return;
      }

      setStatusMessage({ text: 'Prescription recorded successfully.', type: 'success' });
      setShowAddModal(false);
      setDiagnosis('');
      setNotes('');
      setItems([
        {
          medicineId: '',
          dosage: '1 Tablet',
          frequency: 'BD (Twice Daily)',
          duration: '5 days',
          timing: 'After Food',
          instructions: ''
        }
      ]);
      fetchPrescriptions();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Network error', type: 'error' });
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Prescriptions (Rx Management)</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Digital Doctor Prescriptions • Dosage & Frequency (OD, BD, TDS, SOS) • Refill Records
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={fetchPrescriptions} className="btn btn-secondary btn-sm" disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary btn-sm">
            <Plus size={16} />
            <span>New Prescription</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: statusMessage.type === 'success' ? 'var(--success-light)' : 'var(--danger-light)',
            color: statusMessage.type === 'success' ? 'var(--success-text)' : 'var(--danger-text)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1rem',
            fontSize: '0.85rem'
          }}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Prescriptions Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-container" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Patient Name</th>
                <th>Prescribing Doctor</th>
                <th>Diagnosis</th>
                <th>Allergy Alerts</th>
                <th>Prescribed Items</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {prescriptions.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No prescriptions registered on file. Click 'New Prescription' to record an Rx.
                  </td>
                </tr>
              ) : (
                prescriptions.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{p.patient_name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.patient_mobile || 'No phone'}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.doctor_name || 'Counter Consultation'}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.doctor_specialization || p.clinic_name || 'General Practitioner'}</div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 500 }}>{p.diagnosis || 'Clinical Prescription'}</span>
                    </td>
                    <td>
                      {p.allergy_notes ? (
                        <span className="badge badge-danger" style={{ fontSize: '0.68rem' }}>
                          ⚠️ {p.allergy_notes}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>None reported</span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-primary">{p.item_count} Medicines</span>
                    </td>
                    <td>
                      <button
                        onClick={() => handleOpenRxDetail(p.id)}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.72rem' }}
                      >
                        <FileText size={13} />
                        <span>View Rx</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Prescription Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '850px' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Stethoscope size={20} style={{ color: 'var(--primary)' }} />
                <span>Write Medical Prescription (Rx)</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.3rem' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitPrescription} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Patient *</label>
                  <select
                    className="select"
                    value={patientId}
                    onChange={e => setPatientId(e.target.value)}
                    required
                  >
                    <option value="">Select Patient</option>
                    {patients.map(pat => (
                      <option key={pat.id} value={pat.id}>
                        {pat.name} {pat.mobile ? `(${pat.mobile})` : ''} {pat.allergy_notes ? `[Allergy: ${pat.allergy_notes}]` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Doctor</label>
                  <select
                    className="select"
                    value={doctorId}
                    onChange={e => setDoctorId(e.target.value)}
                  >
                    <option value="">Select Doctor (or In-House Pharmacist)</option>
                    {doctors.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.specialization})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Clinical Diagnosis</label>
                <input
                  className="input"
                  placeholder="e.g. Acute Pharyngitis, Type 2 Diabetes, Hypertension"
                  value={diagnosis}
                  onChange={e => setDiagnosis(e.target.value)}
                />
              </div>

              {/* Medicine items */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 700 }}>Prescribed Medicines ({items.length})</h4>
                  <button type="button" onClick={addItemRow} className="btn btn-secondary btn-sm">
                    <Plus size={13} />
                    <span>Add Medicine</span>
                  </button>
                </div>

                <div className="table-container" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                  <table style={{ fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th style={{ minWidth: '170px' }}>Medicine</th>
                        <th style={{ minWidth: '90px' }}>Dosage</th>
                        <th style={{ minWidth: '120px' }}>Frequency</th>
                        <th style={{ minWidth: '90px' }}>Duration</th>
                        <th style={{ minWidth: '110px' }}>Timing</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => (
                        <tr key={idx}>
                          <td>
                            <select
                              className="select"
                              value={it.medicineId}
                              onChange={e => handleItemChange(idx, 'medicineId', e.target.value)}
                              required
                              style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                            >
                              <option value="">Select Medicine</option>
                              {medicines.map(m => (
                                <option key={m.id} value={m.id}>{m.brand_name} {m.strength}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              className="input"
                              value={it.dosage}
                              onChange={e => handleItemChange(idx, 'dosage', e.target.value)}
                              placeholder="1 Tab"
                              style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                            />
                          </td>
                          <td>
                            <select
                              className="select"
                              value={it.frequency}
                              onChange={e => handleItemChange(idx, 'frequency', e.target.value)}
                              style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                            >
                              <option value="OD (Once Daily)">OD (Once Daily)</option>
                              <option value="BD (Twice Daily)">BD (Twice Daily)</option>
                              <option value="TDS (Thrice Daily)">TDS (Thrice Daily)</option>
                              <option value="QID (4 Times Daily)">QID (4 Times Daily)</option>
                              <option value="SOS (As Needed)">SOS (As Needed)</option>
                            </select>
                          </td>
                          <td>
                            <input
                              className="input"
                              value={it.duration}
                              onChange={e => handleItemChange(idx, 'duration', e.target.value)}
                              placeholder="5 days"
                              style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                            />
                          </td>
                          <td>
                            <select
                              className="select"
                              value={it.timing}
                              onChange={e => handleItemChange(idx, 'timing', e.target.value)}
                              style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                            >
                              <option value="After Food">After Food</option>
                              <option value="Before Food">Before Food</option>
                              <option value="With Meals">With Meals</option>
                              <option value="At Bedtime">At Bedtime</option>
                            </select>
                          </td>
                          <td>
                            {items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeItemRow(idx)}
                                style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Pharmacist / Clinical Instructions</label>
                <input
                  className="input"
                  placeholder="e.g. Complete antibiotic course, drink plenty of fluids"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save & Record Rx
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View & Print Prescription Modal */}
      {selectedRx && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '680px' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700 }}>Prescription Record #{selectedRx.prescription.id}</span>
              <button onClick={() => setSelectedRx(null)} className="btn btn-secondary btn-sm" style={{ padding: '0.2rem' }}>
                <X size={15} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', background: '#fff', color: '#000' }}>
              <div style={{ borderBottom: '2px solid #000', paddingBottom: '0.75rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>NAVEED MEDICAL PHARMACY</h3>
                  <div style={{ fontSize: '0.8rem', color: '#444' }}>Main Bazar, Hospital Road, Gujranwala</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.8rem' }}>
                  <div><strong>Doctor:</strong> {selectedRx.prescription.doctor_name || 'Attending Pharmacist'}</div>
                  <div>{selectedRx.prescription.doctor_specialization || ''}</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', background: '#f5f5f5', padding: '0.5rem', borderRadius: '4px', fontSize: '0.82rem' }}>
                <div><strong>Patient:</strong> {selectedRx.prescription.patient_name} ({selectedRx.prescription.patient_age || 'Adult'} yrs)</div>
                <div><strong>Date:</strong> {new Date(selectedRx.prescription.created_at).toLocaleDateString()}</div>
                {selectedRx.prescription.allergy_notes && (
                  <div style={{ color: 'red', fontWeight: 700 }}>Allergy: {selectedRx.prescription.allergy_notes}</div>
                )}
              </div>

              {selectedRx.prescription.diagnosis && (
                <div style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
                  <strong>Diagnosis:</strong> {selectedRx.prescription.diagnosis}
                </div>
              )}

              <div style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.5rem', fontStyle: 'italic' }}>℞</div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #000' }}>
                    <th style={{ textAlign: 'left', padding: '0.4rem', background: 'transparent' }}>Medicine</th>
                    <th style={{ textAlign: 'left', padding: '0.4rem', background: 'transparent' }}>Dosage</th>
                    <th style={{ textAlign: 'left', padding: '0.4rem', background: 'transparent' }}>Frequency</th>
                    <th style={{ textAlign: 'left', padding: '0.4rem', background: 'transparent' }}>Duration</th>
                    <th style={{ textAlign: 'left', padding: '0.4rem', background: 'transparent' }}>Timing</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRx.items.map((it: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '0.4rem', fontWeight: 700 }}>{it.brand_name} {it.strength}</td>
                      <td style={{ padding: '0.4rem' }}>{it.dosage}</td>
                      <td style={{ padding: '0.4rem' }}>{it.frequency}</td>
                      <td style={{ padding: '0.4rem' }}>{it.duration}</td>
                      <td style={{ padding: '0.4rem' }}>{it.timing}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {selectedRx.prescription.notes && (
                <div style={{ fontSize: '0.8rem', color: '#555', borderTop: '1px dashed #ccc', paddingTop: '0.5rem' }}>
                  <strong>Instructions:</strong> {selectedRx.prescription.notes}
                </div>
              )}
            </div>

            <div style={{ padding: '1rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button onClick={() => window.print()} className="btn btn-primary">
                <Printer size={16} />
                <span>Print Prescription</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

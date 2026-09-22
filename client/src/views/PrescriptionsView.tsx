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

const DOSAGE_PRESETS = [
  '1 Tablet',
  '2 Tablets',
  '1/2 Tablet',
  '1 Capsule',
  '2 Capsules',
  '5 mL (1 tsp)',
  '10 mL (2 tsp)',
  '15 mL (1 tbsp)',
  '1 Sachet',
  '1 Drop',
  '2 Drops',
  '1 Spray',
  '1 Injection',
  '1 Suppository'
];

const FREQUENCY_PRESETS = [
  'OD (Once Daily)',
  'BD (Twice Daily)',
  'TDS (Thrice Daily)',
  'QID (4 Times Daily)',
  'Q4H (Every 4 Hours)',
  'Q6H (Every 6 Hours)',
  'Q8H (Every 8 Hours)',
  'Q12H (Every 12 Hours)',
  'STAT (Immediately)',
  'HS (At Bedtime)',
  'SOS (As Needed)',
  'Weekly'
];

const DURATION_PRESETS = [
  '1 day',
  '2 days',
  '3 days',
  '5 days',
  '7 days (1 Week)',
  '10 days',
  '14 days (2 Weeks)',
  '21 days (3 Weeks)',
  '30 days (1 Month)',
  '60 days (2 Months)',
  '90 days (3 Months)',
  'Continuous'
];

const QUICK_DURATION_CHIPS = ['3 days', '5 days', '7 days', '10 days', '14 days', '30 days'];

const TIMING_PRESETS = [
  'After Food',
  'Before Food',
  'With Meals',
  'At Bedtime',
  'Early Morning',
  'Any Time'
];

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
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [savingPatient, setSavingPatient] = useState(false);
  const [patientError, setPatientError] = useState('');
  const [newPatient, setNewPatient] = useState({ name: '', mobile: '', age: '', gender: 'MALE', allergyNotes: '' });
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

  const handleCreatePatient = async () => {
    if (!newPatient.name.trim()) { setPatientError('Patient name is required.'); return; }
    if (newPatient.age && (!Number.isInteger(Number(newPatient.age)) || Number(newPatient.age) < 0 || Number(newPatient.age) > 130)) {
      setPatientError('Enter an age between 0 and 130.'); return;
    }
    setSavingPatient(true);
    setPatientError('');
    try {
      const response = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: newPatient.name.trim(), mobile: newPatient.mobile.trim() || null,
          age: newPatient.age ? Number(newPatient.age) : null,
          gender: newPatient.gender, allergyNotes: newPatient.allergyNotes.trim() || null
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not register patient.');
      const id = String(data.patientId);
      setPatients(current => [...current, {
        id: data.patientId, name: newPatient.name.trim(), mobile: newPatient.mobile.trim(),
        age: newPatient.age ? Number(newPatient.age) : null, gender: newPatient.gender,
        allergy_notes: newPatient.allergyNotes.trim()
      }]);
      setPatientId(id);
      setNewPatient({ name: '', mobile: '', age: '', gender: 'MALE', allergyNotes: '' });
      setShowNewPatient(false);
    } catch (error: any) {
      setPatientError(error.message || 'Could not register patient.');
    } finally {
      setSavingPatient(false);
    }
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
      setPatientId('');
      setDoctorId('');
      setShowNewPatient(false);
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
          <div className="modal-content" style={{ maxWidth: '980px', width: '95%' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-card)' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}>
                <Stethoscope size={22} style={{ color: 'var(--primary)' }} />
                <span>Write Medical Prescription (Rx)</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.35rem 0.5rem' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitPrescription} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>Patient *</label>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowNewPatient(open => !open); setPatientError(''); }}>
                      <Plus size={13} /> {showNewPatient ? 'Cancel' : 'New Patient'}
                    </button>
                  </div>
                  <select
                    className="select"
                    value={patientId}
                    onChange={e => setPatientId(e.target.value)}
                    required
                    style={{ minHeight: '40px', fontSize: '0.85rem' }}
                  >
                    <option value="">Select Patient...</option>
                    {patients.map(pat => (
                      <option key={pat.id} value={pat.id}>
                        {pat.name} {pat.mobile ? `(${pat.mobile})` : ''} {pat.allergy_notes ? `[⚠️ Allergy: ${pat.allergy_notes}]` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.35rem', color: 'var(--text-main)' }}>Attending Doctor / Pharmacist</label>
                  <select
                    className="select"
                    value={doctorId}
                    onChange={e => setDoctorId(e.target.value)}
                    style={{ minHeight: '40px', fontSize: '0.85rem' }}
                  >
                    <option value="">Select Doctor (or In-House Pharmacist)...</option>
                    {doctors.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.specialization})</option>
                    ))}
                  </select>
                </div>
              </div>

              {showNewPatient && (
                <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)' }}>
                  <strong style={{ fontSize: '0.9rem' }}>Register patient for this prescription</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
                    <div><label className="form-label">Name *</label><input className="input" value={newPatient.name} onChange={e => setNewPatient({ ...newPatient, name: e.target.value })} maxLength={150} /></div>
                    <div><label className="form-label">Mobile</label><input className="input" value={newPatient.mobile} onChange={e => setNewPatient({ ...newPatient, mobile: e.target.value })} inputMode="tel" /></div>
                    <div><label className="form-label">Age</label><input className="input" type="number" min="0" max="130" value={newPatient.age} onChange={e => setNewPatient({ ...newPatient, age: e.target.value })} /></div>
                    <div><label className="form-label">Gender</label><select className="select" value={newPatient.gender} onChange={e => setNewPatient({ ...newPatient, gender: e.target.value })}><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select></div>
                    <div style={{ gridColumn: '1 / -1' }}><label className="form-label">Allergy Notes</label><input className="input" value={newPatient.allergyNotes} onChange={e => setNewPatient({ ...newPatient, allergyNotes: e.target.value })} placeholder="Optional" /></div>
                  </div>
                  {patientError && <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.5rem' }}>{patientError}</p>}
                  <button type="button" className="btn btn-primary" onClick={handleCreatePatient} disabled={savingPatient} style={{ marginTop: '0.75rem' }}>
                    {savingPatient ? 'Saving...' : 'Save & Select Patient'}
                  </button>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.35rem', color: 'var(--text-main)' }}>Clinical Diagnosis</label>
                <input
                  className="input"
                  placeholder="e.g. Acute Pharyngitis, Type 2 Diabetes, Essential Hypertension..."
                  value={diagnosis}
                  onChange={e => setDiagnosis(e.target.value)}
                  style={{ minHeight: '40px', fontSize: '0.85rem' }}
                />
              </div>

              {/* Medicine items */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    Prescribed Medicines ({items.length})
                  </h4>
                  <button type="button" onClick={addItemRow} className="btn btn-secondary btn-sm" style={{ fontWeight: 700 }}>
                    <Plus size={14} />
                    <span>Add Medicine</span>
                  </button>
                </div>

                <div className="table-container" style={{ maxHeight: '340px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <table style={{ fontSize: '0.82rem', width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ minWidth: '220px', padding: '0.6rem 0.75rem', textAlign: 'left' }}>Medicine</th>
                        <th style={{ minWidth: '140px', padding: '0.6rem 0.75rem', textAlign: 'left' }}>Dosage</th>
                        <th style={{ minWidth: '160px', padding: '0.6rem 0.75rem', textAlign: 'left' }}>Frequency</th>
                        <th style={{ minWidth: '170px', padding: '0.6rem 0.75rem', textAlign: 'left' }}>Duration</th>
                        <th style={{ minWidth: '150px', padding: '0.6rem 0.75rem', textAlign: 'left' }}>Timing</th>
                        <th style={{ width: '40px', padding: '0.6rem' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                          {/* Medicine Select */}
                          <td style={{ padding: '0.5rem 0.75rem', verticalAlign: 'top' }}>
                            <select
                              className="select"
                              value={it.medicineId}
                              onChange={e => handleItemChange(idx, 'medicineId', e.target.value)}
                              required
                              style={{ width: '100%', minHeight: '36px', padding: '0.35rem 0.5rem', fontSize: '0.82rem', fontWeight: 600 }}
                            >
                              <option value="">Select Medicine...</option>
                              {medicines.map(m => (
                                <option key={m.id} value={m.id}>
                                  {m.brand_name} {m.strength} ({m.dosage_form || 'Unit'})
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Dosage Input + Quick Selector */}
                          <td style={{ padding: '0.5rem 0.75rem', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <select
                                className="select"
                                value={DOSAGE_PRESETS.includes(it.dosage) ? it.dosage : 'Custom'}
                                onChange={e => {
                                  if (e.target.value !== 'Custom') {
                                    handleItemChange(idx, 'dosage', e.target.value);
                                  }
                                }}
                                style={{ width: '100%', minHeight: '36px', padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                              >
                                {DOSAGE_PRESETS.map(d => (
                                  <option key={d} value={d}>{d}</option>
                                ))}
                                {!DOSAGE_PRESETS.includes(it.dosage) && (
                                  <option value="Custom">Custom: {it.dosage}</option>
                                )}
                              </select>
                              <input
                                className="input"
                                value={it.dosage}
                                onChange={e => handleItemChange(idx, 'dosage', e.target.value)}
                                placeholder="Custom dosage..."
                                style={{ width: '100%', height: '28px', fontSize: '0.75rem', padding: '0.2rem 0.4rem' }}
                              />
                            </div>
                          </td>

                          {/* Frequency Select */}
                          <td style={{ padding: '0.5rem 0.75rem', verticalAlign: 'top' }}>
                            <select
                              className="select"
                              value={it.frequency}
                              onChange={e => handleItemChange(idx, 'frequency', e.target.value)}
                              style={{ width: '100%', minHeight: '36px', padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                            >
                              {FREQUENCY_PRESETS.map(f => (
                                <option key={f} value={f}>{f}</option>
                              ))}
                            </select>
                          </td>

                          {/* Duration Select + 1-Tap Chips */}
                          <td style={{ padding: '0.5rem 0.75rem', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                              <select
                                className="select"
                                value={DURATION_PRESETS.includes(it.duration) ? it.duration : 'Custom'}
                                onChange={e => {
                                  if (e.target.value !== 'Custom') {
                                    handleItemChange(idx, 'duration', e.target.value);
                                  }
                                }}
                                style={{ width: '100%', minHeight: '36px', padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                              >
                                {DURATION_PRESETS.map(dur => (
                                  <option key={dur} value={dur}>{dur}</option>
                                ))}
                                {!DURATION_PRESETS.includes(it.duration) && (
                                  <option value="Custom">Custom: {it.duration}</option>
                                )}
                              </select>

                              {/* Quick 1-Click Duration Chips */}
                              <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap' }}>
                                {QUICK_DURATION_CHIPS.map(chip => (
                                  <button
                                    key={chip}
                                    type="button"
                                    onClick={() => handleItemChange(idx, 'duration', chip)}
                                    style={{
                                      border: '1px solid var(--border)',
                                      borderRadius: '3px',
                                      backgroundColor: it.duration.startsWith(chip.split(' ')[0]) ? 'var(--primary)' : 'var(--bg-card)',
                                      color: it.duration.startsWith(chip.split(' ')[0]) ? '#fff' : 'var(--text-muted)',
                                      fontSize: '0.65rem',
                                      padding: '0.1rem 0.3rem',
                                      cursor: 'pointer',
                                      fontWeight: 600
                                    }}
                                  >
                                    {chip.split(' ')[0]}d
                                  </button>
                                ))}
                              </div>
                            </div>
                          </td>

                          {/* Timing Select */}
                          <td style={{ padding: '0.5rem 0.75rem', verticalAlign: 'top' }}>
                            <select
                              className="select"
                              value={it.timing}
                              onChange={e => handleItemChange(idx, 'timing', e.target.value)}
                              style={{ width: '100%', minHeight: '36px', padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                            >
                              {TIMING_PRESETS.map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </td>

                          {/* Action Delete */}
                          <td style={{ padding: '0.5rem 0.4rem', textAlign: 'center', verticalAlign: 'middle' }}>
                            {items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeItemRow(idx)}
                                style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '0.3rem' }}
                                title="Remove item"
                              >
                                <Trash2 size={16} />
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
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.35rem', color: 'var(--text-main)' }}>Pharmacist / Clinical Instructions</label>
                <input
                  className="input"
                  placeholder="e.g. Complete full antibiotic course, take with plenty of water, avoid alcohol..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{ minHeight: '38px', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary" style={{ padding: '0.5rem 1.25rem' }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 1.5rem', fontWeight: 800 }}>
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
                  <div style={{ fontSize: '0.8rem', color: '#444' }}>31 32 chowk chohan road outfall, Islampura, Lahore, 54000</div>
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

import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  Plus,
  RefreshCw,
  Search,
  FileText,
  Phone,
  DollarSign,
  Pencil,
  X
} from 'lucide-react';

export interface Patient {
  id: number;
  name: string;
  mobile?: string;
  age?: number;
  gender?: string;
  allergy_notes?: string;
  credit_limit: number;
  current_balance: number;
  total_visits: number;
  total_spent: number;
  last_visit_date?: string;
}

export const PatientsView: React.FC = () => {
  const { token, hasPermission } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [patientFormError, setPatientFormError] = useState('');
  const [savingPatient, setSavingPatient] = useState(false);
  const [selectedPatientForPay, setSelectedPatientForPay] = useState<Patient | null>(null);
  const [selectedPatientForLedger, setSelectedPatientForLedger] = useState<Patient | null>(null);
  const [patientLedger, setPatientLedger] = useState<any[]>([]);
  const [patientSales, setPatientSales] = useState<any[]>([]);

  // Add Form
  const [newPatient, setNewPatient] = useState({
    name: '',
    mobile: '',
    age: '',
    gender: 'MALE',
    allergyNotes: '',
    creditLimit: '5000'
  });

  // Payment Form
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payNotes, setPayNotes] = useState('');

  const fetchPatients = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/patients?search=${encodeURIComponent(search)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPatients(data.patients);
      }
    } catch (err) {
      console.error('Error fetching patients:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPatients();
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  const openNewPatient = () => {
    setEditingPatient(null);
    setNewPatient({ name: '', mobile: '', age: '', gender: 'MALE', allergyNotes: '', creditLimit: '5000' });
    setPatientFormError('');
    setShowAddModal(true);
  };

  const openEditPatient = (patient: Patient) => {
    setEditingPatient(patient);
    setNewPatient({
      name: patient.name,
      mobile: patient.mobile || '',
      age: patient.age === null || patient.age === undefined ? '' : String(patient.age),
      gender: patient.gender?.toUpperCase() || 'MALE',
      allergyNotes: patient.allergy_notes || '',
      creditLimit: String(patient.credit_limit ?? 0)
    });
    setPatientFormError('');
    setShowAddModal(true);
  };

  const closePatientModal = () => {
    setShowAddModal(false);
    setEditingPatient(null);
    setPatientFormError('');
  };

  const handleSavePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    setPatientFormError('');

    if (!newPatient.name.trim()) { setPatientFormError('Patient name is required.'); return; }
    if (newPatient.age && (!Number.isInteger(Number(newPatient.age)) || Number(newPatient.age) < 0 || Number(newPatient.age) > 130)) {
      setPatientFormError('Enter an age between 0 and 130.'); return;
    }
    if (newPatient.creditLimit === '' || !Number.isFinite(Number(newPatient.creditLimit)) || Number(newPatient.creditLimit) < 0) {
      setPatientFormError('Credit limit cannot be negative.'); return;
    }

    setSavingPatient(true);
    try {
      const res = await fetch(editingPatient ? `/api/patients/${editingPatient.id}` : '/api/patients', {
        method: editingPatient ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newPatient.name.trim(),
          mobile: newPatient.mobile.trim() || null,
          age: newPatient.age === '' ? null : Number(newPatient.age),
          gender: newPatient.gender,
          allergyNotes: newPatient.allergyNotes.trim() || null,
          creditLimit: Number(newPatient.creditLimit)
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setPatientFormError(data.error || 'Failed to save patient');
        return;
      }

      setStatusMessage({ text: editingPatient ? 'Patient profile updated.' : 'Patient registered successfully.', type: 'success' });
      if (editingPatient) setSearch('');
      closePatientModal();
      setNewPatient({
        name: '',
        mobile: '',
        age: '',
        gender: 'MALE',
        allergyNotes: '',
        creditLimit: '5000'
      });
      fetchPatients();
    } catch (err: any) {
      setPatientFormError(err.message || 'Network error');
    } finally {
      setSavingPatient(false);
    }
  };

  const handleOpenLedger = async (patient: Patient) => {
    setSelectedPatientForLedger(patient);
    try {
      const res = await fetch(`/api/patients/${patient.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPatientLedger(data.ledger);
        setPatientSales(data.sales);
      }
    } catch (err) {
      console.error('Error fetching ledger:', err);
    }
  };

  const handleReceivePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientForPay) return;
    setStatusMessage(null);

    const amt = Number(payAmount);
    if (isNaN(amt) || amt <= 0) return;

    try {
      const res = await fetch(`/api/patients/${selectedPatientForPay.id}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: amt,
          paymentMethod: payMethod,
          notes: payNotes
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({ text: data.error || 'Payment recovery failed', type: 'error' });
        return;
      }

      setStatusMessage({ text: `Recovery payment of Rs. ${amt} recorded for ${selectedPatientForPay.name}.`, type: 'success' });
      setSelectedPatientForPay(null);
      setPayAmount('');
      setPayNotes('');
      fetchPatients();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Network error', type: 'error' });
    }
  };

  const totalReceivables = patients.reduce((acc, p) => acc + (p.current_balance > 0 ? p.current_balance : 0), 0);

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Patients & Customer CRM</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Patient Health Records • Allergy Alerts • Credit Receivables (Udhar)
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={fetchPatients} className="btn btn-secondary btn-sm" disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          {hasPermission('manage_patients') && (
            <button onClick={openNewPatient} className="btn btn-primary btn-sm">
              <Plus size={16} />
              <span>Register Patient</span>
            </button>
          )}
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

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <div className="card">
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>TOTAL CUSTOMER RECEIVABLES (UDHAR)</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: totalReceivables > 0 ? 'var(--warning)' : 'var(--success)', marginTop: '0.25rem' }}>
            Rs. {totalReceivables.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            Outstanding balance pending recovery from patients
          </div>
        </div>

        <div className="card">
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>REGISTERED PATIENTS</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {patients.length} Profiles
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            Documented profiles with medical allergy history
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="card" style={{ marginBottom: '1.25rem', padding: '1rem' }}>
        <div style={{ position: 'relative' }}>
          <input
            className="input"
            placeholder="Search patient by full name or mobile phone number..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '2.5rem' }}
          />
          <Search size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        </div>
      </div>

      {/* Patients Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-container" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Patient Name & Demographics</th>
                <th>Phone Number</th>
                <th>Clinical Allergy Alerts</th>
                <th>Credit Limit</th>
                <th>Pending Udhar Balance</th>
                <th>Lifetime Spend</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {patients.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No patients match your search. Click 'Register Patient' to add new profile.
                  </td>
                </tr>
              ) : (
                patients.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{p.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {p.gender} {p.age !== null && p.age !== undefined ? `• ${p.age} yrs` : ''} • Visits: {p.total_visits}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem' }}>
                        <Phone size={13} style={{ color: 'var(--primary)' }} />
                        <span>{p.mobile || '—'}</span>
                      </div>
                    </td>
                    <td>
                      {p.allergy_notes ? (
                        <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
                          ⚠️ {p.allergy_notes}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>None reported</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      Rs. {Number(p.credit_limit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.95rem', fontWeight: 800, color: p.current_balance > 0 ? 'var(--danger)' : 'var(--success)' }}>
                        Rs. {Number(p.current_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      Rs. {Number(p.total_spent).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {hasPermission('manage_patients') && (
                          <button onClick={() => openEditPatient(p)} className="btn btn-secondary btn-sm" style={{ fontSize: '0.72rem' }} title={`Edit ${p.name}`}>
                            <Pencil size={13} /><span>Edit</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenLedger(p)}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.72rem' }}
                          title="View Ledger Statement & History"
                        >
                          <FileText size={13} />
                          <span>History</span>
                        </button>

                        {hasPermission('manage_patients') && (
                          <button
                            onClick={() => {
                              setSelectedPatientForPay(p);
                              setPayAmount(p.current_balance > 0 ? String(p.current_balance) : '');
                            }}
                            className="btn btn-primary btn-sm"
                            style={{ fontSize: '0.72rem' }}
                            title="Record Cash Debt Recovery"
                          >
                            <DollarSign size={13} />
                            <span>Recover</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Register or Edit Patient Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{editingPatient ? `Edit Patient: ${editingPatient.name}` : 'Register New Patient'}</h3>
              <button onClick={closePatientModal} className="btn btn-secondary btn-sm" style={{ padding: '0.3rem' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSavePatient} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {patientFormError && <div role="alert" style={{ padding: '0.7rem', borderRadius: 'var(--radius-md)', background: 'var(--danger-light)', color: 'var(--danger-text)', fontSize: '0.82rem' }}>{patientFormError}</div>}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Patient Full Name *</label>
                <input
                  className="input"
                  placeholder="e.g. Haji Muhammad Aslam"
                  value={newPatient.name}
                  onChange={e => setNewPatient({ ...newPatient, name: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Mobile Number</label>
                  <input
                    className="input"
                    placeholder="0300-1234567"
                    value={newPatient.mobile}
                    onChange={e => setNewPatient({ ...newPatient, mobile: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Gender & Age</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select
                      className="select"
                      value={newPatient.gender}
                      onChange={e => setNewPatient({ ...newPatient, gender: e.target.value })}
                      style={{ flex: 1 }}
                    >
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      max="130"
                      className="input"
                      placeholder="Age"
                      value={newPatient.age}
                      onChange={e => setNewPatient({ ...newPatient, age: e.target.value })}
                      style={{ width: '70px' }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', color: 'var(--danger)' }}>
                  ⚠️ Drug Allergy Notes (Critical Safety Alert)
                </label>
                <input
                  className="input"
                  placeholder="e.g. Penicillin allergy, Aspirin sensitivity, Sulfa drugs"
                  value={newPatient.allergyNotes}
                  onChange={e => setNewPatient({ ...newPatient, allergyNotes: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Credit Limit Allowed (Rs.)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  value={newPatient.creditLimit}
                  onChange={e => setNewPatient({ ...newPatient, creditLimit: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button type="button" onClick={closePatientModal} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingPatient}>
                  {savingPatient ? 'Saving...' : editingPatient ? 'Save Changes' : 'Save Patient Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Recovery Modal */}
      {selectedPatientForPay && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Record Udhar Recovery</h3>
              <button onClick={() => setSelectedPatientForPay(null)} className="btn btn-secondary btn-sm" style={{ padding: '0.3rem' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleReceivePayment} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: 'var(--bg-app)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700 }}>{selectedPatientForPay.name}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--danger)', marginTop: '0.2rem', fontWeight: 600 }}>
                  Total Outstanding Balance: Rs. {Number(selectedPatientForPay.current_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Amount Received (Rs.) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  className="input"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Payment Method</label>
                <select className="select" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  <option value="CASH">Cash Counter Inflow</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Notes / Remarks</label>
                <input
                  className="input"
                  placeholder="e.g. Partial recovery installment"
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button type="button" onClick={() => setSelectedPatientForPay(null)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Confirm Cash Inflow
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Patient Statement & Ledger Modal */}
      {selectedPatientForLedger && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '800px' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                  Patient Statement & Purchases History
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {selectedPatientForLedger.name} • Current Udhar: <strong>Rs. {Number(selectedPatientForLedger.current_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                </div>
              </div>
              <button onClick={() => setSelectedPatientForLedger(null)} className="btn btn-secondary btn-sm" style={{ padding: '0.3rem' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', maxHeight: '520px', overflowY: 'auto' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem' }}>Receivable Ledger Entries</h4>
              <div className="table-container" style={{ marginBottom: '1.5rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Reference</th>
                      <th>Debit (Bill Udhar)</th>
                      <th>Credit (Paid)</th>
                      <th>Balance After</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patientLedger.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>
                          No credit transactions recorded for this patient.
                        </td>
                      </tr>
                    ) : (
                      patientLedger.map(l => (
                        <tr key={l.id}>
                          <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {new Date(l.created_at).toLocaleString()}
                          </td>
                          <td>
                            <span className={`badge ${l.transaction_type === 'PAYMENT_RECEIVED' ? 'badge-success' : 'badge-primary'}`}>
                              {l.transaction_type}
                            </span>
                          </td>
                          <td><code>{l.reference_id || '—'}</code></td>
                          <td style={{ color: l.debit > 0 ? 'var(--danger)' : 'inherit', fontWeight: l.debit > 0 ? 700 : 400 }}>
                            {l.debit > 0 ? `Rs. ${l.debit.toFixed(2)}` : '—'}
                          </td>
                          <td style={{ color: l.credit > 0 ? 'var(--success)' : 'inherit', fontWeight: l.credit > 0 ? 700 : 400 }}>
                            {l.credit > 0 ? `Rs. ${l.credit.toFixed(2)}` : '—'}
                          </td>
                          <td style={{ fontWeight: 800 }}>Rs. {l.balance_after.toFixed(2)}</td>
                          <td style={{ fontSize: '0.75rem' }}>{l.notes || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem' }}>Counter Sales Receipts</h4>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Date</th>
                      <th>Subtotal</th>
                      <th>Discount</th>
                      <th>Total</th>
                      <th>Paid</th>
                      <th>Cashier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patientSales.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>
                          No purchase bills on record.
                        </td>
                      </tr>
                    ) : (
                      patientSales.map(s => (
                        <tr key={s.id}>
                          <td><strong>#{s.invoice_number}</strong></td>
                          <td style={{ fontSize: '0.78rem' }}>{new Date(s.created_at).toLocaleDateString()}</td>
                          <td>Rs. {s.subtotal.toFixed(2)}</td>
                          <td>Rs. {s.discount.toFixed(2)}</td>
                          <td style={{ fontWeight: 700 }}>Rs. {s.total_amount.toFixed(2)}</td>
                          <td style={{ color: 'var(--success)' }}>Rs. {s.paid_amount.toFixed(2)}</td>
                          <td style={{ fontSize: '0.78rem' }}>{s.cashier_name || 'Counter'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

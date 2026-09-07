import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  Plus,
  RefreshCw,
  Search,
  FileText,
  Phone,
  X,
  DollarSign
} from 'lucide-react';

export interface Supplier {
  id: number;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  tax_number?: string;
  opening_balance: number;
  current_balance: number;
  is_active: number;
  total_invoices: number;
  total_purchase_volume: number;
}

export interface SupplierLedgerItem {
  id: number;
  supplier_id: number;
  transaction_type: string;
  reference_id?: string;
  debit: number;
  credit: number;
  balance_after: number;
  notes?: string;
  created_at: string;
}

export const SuppliersView: React.FC = () => {
  const { token, hasPermission } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedSupplierForPay, setSelectedSupplierForPay] = useState<Supplier | null>(null);
  const [selectedSupplierForLedger, setSelectedSupplierForLedger] = useState<Supplier | null>(null);
  const [supplierLedger, setSupplierLedger] = useState<SupplierLedgerItem[]>([]);

  // Add Supplier Form
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    taxNumber: '',
    openingBalance: '0'
  });

  // Payment Form
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payNotes, setPayNotes] = useState('');

  const fetchSuppliers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/suppliers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data.suppliers);
      }
    } catch (err) {
      console.error('Error fetching suppliers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, [token]);

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!newSupplier.name.trim()) return;

    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newSupplier.name.trim(),
          contactPerson: newSupplier.contactPerson.trim(),
          phone: newSupplier.phone.trim(),
          email: newSupplier.email.trim(),
          address: newSupplier.address.trim(),
          taxNumber: newSupplier.taxNumber.trim(),
          openingBalance: Number(newSupplier.openingBalance) || 0
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({ text: data.error || 'Failed to create supplier', type: 'error' });
        return;
      }

      setStatusMessage({ text: 'Supplier registered successfully.', type: 'success' });
      setShowAddModal(false);
      setNewSupplier({
        name: '',
        contactPerson: '',
        phone: '',
        email: '',
        address: '',
        taxNumber: '',
        openingBalance: '0'
      });
      fetchSuppliers();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Network error', type: 'error' });
    }
  };

  const handleOpenLedger = async (supplier: Supplier) => {
    setSelectedSupplierForLedger(supplier);
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSupplierLedger(data.ledger);
      }
    } catch (err) {
      console.error('Error fetching ledger:', err);
    }
  };

  const handleMakePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierForPay) return;
    setStatusMessage(null);

    const amt = Number(payAmount);
    if (isNaN(amt) || amt <= 0) return;

    try {
      const res = await fetch(`/api/suppliers/${selectedSupplierForPay.id}/payments`, {
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
        setStatusMessage({ text: data.error || 'Payment failed', type: 'error' });
        return;
      }

      setStatusMessage({ text: `Payment of Rs. ${amt} recorded for ${selectedSupplierForPay.name}.`, type: 'success' });
      setSelectedSupplierForPay(null);
      setPayAmount('');
      setPayNotes('');
      fetchSuppliers();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Network error', type: 'error' });
    }
  };

  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.contact_person && s.contact_person.toLowerCase().includes(search.toLowerCase())) ||
    (s.phone && s.phone.includes(search))
  );

  const totalPayable = suppliers.reduce((acc, s) => acc + (s.current_balance > 0 ? s.current_balance : 0), 0);

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Suppliers & Distributors</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Vendor Master, Payables Ledger & Settlement Tracking
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={fetchSuppliers} className="btn btn-secondary btn-sm" disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          {hasPermission('manage_suppliers') && (
            <button onClick={() => setShowAddModal(true)} className="btn btn-primary btn-sm">
              <Plus size={16} />
              <span>Add Supplier</span>
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

      {/* KPI Card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <div className="card">
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>TOTAL OUTSTANDING PAYABLES</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: totalPayable > 0 ? 'var(--danger)' : 'var(--success)', marginTop: '0.25rem' }}>
            Rs. {totalPayable.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            Pending balance due to pharmaceutical distributors
          </div>
        </div>

        <div className="card">
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>REGISTERED DISTRIBUTORS</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {suppliers.length} Companies
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            Active supply partners
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="card" style={{ marginBottom: '1.25rem', padding: '1rem' }}>
        <div style={{ position: 'relative' }}>
          <input
            className="input"
            placeholder="Search suppliers by name, contact person, or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '2.5rem' }}
          />
          <Search size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-container" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Company Name</th>
                <th>Contact Person</th>
                <th>Phone</th>
                <th>Location</th>
                <th>Total Purchases</th>
                <th>Current Payable</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.map(s => (
                <tr key={s.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{s.name}</div>
                    {s.tax_number && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>NTN: {s.tax_number}</div>}
                  </td>
                  <td>{s.contact_person || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem' }}>
                      <Phone size={13} style={{ color: 'var(--primary)' }} />
                      <span>{s.phone || '—'}</span>
                    </div>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {s.address || '—'}
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    Rs. {Number(s.total_purchase_volume).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td>
                    <span style={{ fontSize: '0.95rem', fontWeight: 800, color: s.current_balance > 0 ? 'var(--danger)' : 'var(--success)' }}>
                      Rs. {Number(s.current_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        onClick={() => handleOpenLedger(s)}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.72rem' }}
                        title="View Transaction Ledger"
                      >
                        <FileText size={13} />
                        <span>Ledger</span>
                      </button>

                      {hasPermission('manage_suppliers') && (
                        <button
                          onClick={() => {
                            setSelectedSupplierForPay(s);
                            setPayAmount(s.current_balance > 0 ? String(s.current_balance) : '');
                          }}
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: '0.72rem' }}
                          title="Record Supplier Payment"
                        >
                          <DollarSign size={13} />
                          <span>Pay</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Supplier Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Register New Supplier</h3>
              <button onClick={() => setShowAddModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.3rem' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Company / Agency Name *</label>
                <input
                  className="input"
                  placeholder="e.g. Shaheen Pharma Agency"
                  value={newSupplier.name}
                  onChange={e => setNewSupplier({ ...newSupplier, name: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Contact Person</label>
                  <input
                    className="input"
                    value={newSupplier.contactPerson}
                    onChange={e => setNewSupplier({ ...newSupplier, contactPerson: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Phone Number</label>
                  <input
                    className="input"
                    value={newSupplier.phone}
                    onChange={e => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Address</label>
                <input
                  className="input"
                  value={newSupplier.address}
                  onChange={e => setNewSupplier({ ...newSupplier, address: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Tax / NTN Number</label>
                  <input
                    className="input"
                    value={newSupplier.taxNumber}
                    onChange={e => setNewSupplier({ ...newSupplier, taxNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Opening Balance (Rs.)</label>
                  <input
                    type="number"
                    className="input"
                    value={newSupplier.openingBalance}
                    onChange={e => setNewSupplier({ ...newSupplier, openingBalance: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Register Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {selectedSupplierForPay && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Record Supplier Payment</h3>
              <button onClick={() => setSelectedSupplierForPay(null)} className="btn btn-secondary btn-sm" style={{ padding: '0.3rem' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleMakePayment} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: 'var(--bg-app)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700 }}>{selectedSupplierForPay.name}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--danger)', marginTop: '0.2rem', fontWeight: 600 }}>
                  Current Payable Balance: Rs. {Number(selectedSupplierForPay.current_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Payment Amount (Rs.) *</label>
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
                  <option value="CASH">Cash Drawer Outflow</option>
                  <option value="BANK_TRANSFER">Bank Online Transfer</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Reference / Notes</label>
                <input
                  className="input"
                  placeholder="e.g. Bank Ref #, Cheque #, Remarks"
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button type="button" onClick={() => setSelectedSupplierForPay(null)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ledger Modal */}
      {selectedSupplierForLedger && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '750px' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                  Supplier Statement of Account
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {selectedSupplierForLedger.name} • Balance: <strong>Rs. {Number(selectedSupplierForLedger.current_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                </div>
              </div>
              <button onClick={() => setSelectedSupplierForLedger(null)} className="btn btn-secondary btn-sm" style={{ padding: '0.3rem' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', maxHeight: '500px', overflowY: 'auto' }}>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Reference</th>
                      <th>Debit (Paid)</th>
                      <th>Credit (Billed)</th>
                      <th>Balance After</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierLedger.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                          No transactions recorded for this supplier yet.
                        </td>
                      </tr>
                    ) : (
                      supplierLedger.map(l => (
                        <tr key={l.id}>
                          <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {new Date(l.created_at).toLocaleString()}
                          </td>
                          <td>
                            <span className={`badge ${l.transaction_type === 'PAYMENT_OUT' ? 'badge-success' : 'badge-primary'}`}>
                              {l.transaction_type}
                            </span>
                          </td>
                          <td><code>{l.reference_id || '—'}</code></td>
                          <td style={{ color: l.debit > 0 ? 'var(--success)' : 'inherit', fontWeight: l.debit > 0 ? 700 : 400 }}>
                            {l.debit > 0 ? `Rs. ${l.debit.toFixed(2)}` : '—'}
                          </td>
                          <td style={{ color: l.credit > 0 ? 'var(--danger)' : 'inherit', fontWeight: l.credit > 0 ? 700 : 400 }}>
                            {l.credit > 0 ? `Rs. ${l.credit.toFixed(2)}` : '—'}
                          </td>
                          <td style={{ fontWeight: 800 }}>Rs. {l.balance_after.toFixed(2)}</td>
                          <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{l.notes || '—'}</td>
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

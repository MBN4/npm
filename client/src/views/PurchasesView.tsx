import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  Truck,
  Plus,
  RefreshCw,
  X,
  Trash2
} from 'lucide-react';

export interface PurchaseInvoice {
  id: number;
  invoice_number: string;
  supplier_id: number;
  supplier_name: string;
  purchase_date: string;
  subtotal: number;
  discount: number;
  tax: number;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: 'PAID' | 'PARTIAL' | 'UNPAID';
  payment_method: string;
  item_count: number;
  creator_name?: string;
  notes?: string;
}

export interface PurchaseItemRow {
  medicineId: string;
  batchNumber: string;
  expiryDate: string;
  mfgDate: string;
  purchasePrice: string;
  salePrice: string;
  quantity: string;
  bonusQuantity: string;
  lineTotal: number;
}

export const PurchasesView: React.FC = () => {
  const { token, hasPermission } = useAuth();
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([]);
  const [medicines, setMedicines] = useState<{ id: number; brand_name: string; strength?: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // New Invoice Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidAmount, setPaidAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [discount, setDiscount] = useState('0');
  const [notes, setNotes] = useState('');

  const [items, setItems] = useState<PurchaseItemRow[]>([
    {
      medicineId: '',
      batchNumber: '',
      expiryDate: '',
      mfgDate: '',
      purchasePrice: '',
      salePrice: '',
      quantity: '10',
      bonusQuantity: '0',
      lineTotal: 0
    }
  ]);

  const fetchPurchases = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/purchases', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPurchases(data.purchases);
      }
    } catch (err) {
      console.error('Error fetching purchases:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMetadata = async () => {
    try {
      const [supRes, medRes] = await Promise.all([
        fetch('/api/suppliers', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/medicines', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (supRes.ok) setSuppliers((await supRes.json()).suppliers);
      if (medRes.ok) setMedicines((await medRes.json()).medicines);
    } catch (err) {
      console.error('Error fetching metadata:', err);
    }
  };

  useEffect(() => {
    fetchPurchases();
    fetchMetadata();
  }, [token]);

  const handleItemChange = (index: number, field: keyof PurchaseItemRow, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };

    // Recalculate line total
    const qty = Number(updated[index].quantity) || 0;
    const cost = Number(updated[index].purchasePrice) || 0;
    updated[index].lineTotal = Number((qty * cost).toFixed(2));

    setItems(updated);
  };

  const addItemRow = () => {
    setItems([
      ...items,
      {
        medicineId: '',
        batchNumber: '',
        expiryDate: '',
        mfgDate: '',
        purchasePrice: '',
        salePrice: '',
        quantity: '10',
        bonusQuantity: '0',
        lineTotal: 0
      }
    ]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const subtotal = items.reduce((acc, it) => acc + (it.lineTotal || 0), 0);
  const netDiscount = Number(discount) || 0;
  const grandTotal = Math.max(0, subtotal - netDiscount);
  const paid = Number(paidAmount) || 0;
  const remaining = Math.max(0, grandTotal - paid);

  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!supplierId || !invoiceNumber.trim()) {
      setStatusMessage({ text: 'Please select a supplier and provide invoice number.', type: 'error' });
      return;
    }

    // Validate item rows
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.medicineId || !it.batchNumber.trim() || !it.expiryDate) {
        setStatusMessage({ text: `Item #${i + 1} has missing medicine, batch number, or expiry date.`, type: 'error' });
        return;
      }
      if (Number(it.quantity) <= 0 || Number(it.purchasePrice) <= 0) {
        setStatusMessage({ text: `Item #${i + 1} must have quantity and cost price greater than zero.`, type: 'error' });
        return;
      }
    }

    try {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          supplierId: Number(supplierId),
          invoiceNumber: invoiceNumber.trim(),
          purchaseDate,
          subtotal,
          discount: netDiscount,
          totalAmount: grandTotal,
          paidAmount: paid,
          paymentMethod,
          notes,
          items: items.map(it => ({
            medicineId: Number(it.medicineId),
            batchNumber: it.batchNumber.trim(),
            expiryDate: it.expiryDate,
            mfgDate: it.mfgDate || null,
            purchasePrice: Number(it.purchasePrice),
            salePrice: Number(it.salePrice) || Number(it.purchasePrice) * 1.25,
            quantity: Number(it.quantity),
            bonusQuantity: Number(it.bonusQuantity) || 0,
            lineTotal: it.lineTotal
          }))
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({ text: data.error || 'Failed to record purchase', type: 'error' });
        return;
      }

      setStatusMessage({ text: `Purchase invoice #${invoiceNumber} recorded and stock batches updated!`, type: 'success' });
      setShowAddModal(false);
      setInvoiceNumber('');
      setPaidAmount('0');
      setDiscount('0');
      setItems([
        {
          medicineId: '',
          batchNumber: '',
          expiryDate: '',
          mfgDate: '',
          purchasePrice: '',
          salePrice: '',
          quantity: '10',
          bonusQuantity: '0',
          lineTotal: 0
        }
      ]);
      fetchPurchases();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Network error', type: 'error' });
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Purchases & Inward Orders</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Supplier Invoices • Batch Creation • Stock Inflow & Payables
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={fetchPurchases} className="btn btn-secondary btn-sm" disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          {hasPermission('create_purchases') && (
            <button onClick={() => setShowAddModal(true)} className="btn btn-primary btn-sm">
              <Plus size={16} />
              <span>New Purchase Invoice</span>
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

      {/* Purchases Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-container" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Supplier / Distributor</th>
                <th>Date</th>
                <th>Items</th>
                <th>Total Amount</th>
                <th>Paid Amount</th>
                <th>Remaining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No purchase invoices registered yet. Click 'New Purchase Invoice' to receive stock.
                  </td>
                </tr>
              ) : (
                purchases.map(p => (
                  <tr key={p.id}>
                    <td>
                      <span style={{ fontWeight: 700 }}>#{p.invoice_number}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.supplier_name}</div>
                    </td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      {p.purchase_date}
                    </td>
                    <td>{p.item_count} Items</td>
                    <td style={{ fontWeight: 700 }}>
                      Rs. {Number(p.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ color: 'var(--success)', fontWeight: 600 }}>
                      Rs. {Number(p.paid_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ color: p.remaining_amount > 0 ? 'var(--danger)' : 'inherit', fontWeight: 700 }}>
                      Rs. {Number(p.remaining_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td>
                      <span className={`badge ${p.payment_status === 'PAID' ? 'badge-success' : p.payment_status === 'PARTIAL' ? 'badge-warning' : 'badge-danger'}`}>
                        {p.payment_status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Purchase Invoice Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '960px' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Truck size={20} style={{ color: 'var(--primary)' }} />
                <span>Receive Inward Stock (Purchase Invoice)</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.3rem' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitPurchase} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Top Meta */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Supplier *</label>
                  <select
                    className="select"
                    value={supplierId}
                    onChange={e => setSupplierId(e.target.value)}
                    required
                  >
                    <option value="">Select Supplier</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Supplier Invoice # *</label>
                  <input
                    className="input"
                    placeholder="e.g. INV-90451"
                    value={invoiceNumber}
                    onChange={e => setInvoiceNumber(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Purchase Date</label>
                  <input
                    type="date"
                    className="input"
                    value={purchaseDate}
                    onChange={e => setPurchaseDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Items Section */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700 }}>Inward Medicine Batches ({items.length})</h4>
                  <button type="button" onClick={addItemRow} className="btn btn-secondary btn-sm">
                    <Plus size={14} />
                    <span>Add Item Line</span>
                  </button>
                </div>

                <div className="table-container" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                  <table style={{ fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th style={{ minWidth: '180px' }}>Medicine</th>
                        <th style={{ minWidth: '110px' }}>Batch #</th>
                        <th style={{ minWidth: '130px' }}>Expiry (YYYY-MM-DD)</th>
                        <th style={{ minWidth: '80px' }}>Cost (Rs.)</th>
                        <th style={{ minWidth: '80px' }}>Sale (Rs.)</th>
                        <th style={{ minWidth: '70px' }}>Qty</th>
                        <th style={{ minWidth: '70px' }}>Bonus</th>
                        <th>Total</th>
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
                              style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
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
                              placeholder="Batch #"
                              value={it.batchNumber}
                              onChange={e => handleItemChange(idx, 'batchNumber', e.target.value)}
                              required
                              style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                            />
                          </td>
                          <td>
                            <input
                              type="date"
                              className="input"
                              value={it.expiryDate}
                              onChange={e => handleItemChange(idx, 'expiryDate', e.target.value)}
                              required
                              style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="Cost"
                              value={it.purchasePrice}
                              onChange={e => handleItemChange(idx, 'purchasePrice', e.target.value)}
                              required
                              style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="Sale"
                              value={it.salePrice}
                              onChange={e => handleItemChange(idx, 'salePrice', e.target.value)}
                              style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="1"
                              value={it.quantity}
                              onChange={e => handleItemChange(idx, 'quantity', e.target.value)}
                              required
                              style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              value={it.bonusQuantity}
                              onChange={e => handleItemChange(idx, 'bonusQuantity', e.target.value)}
                              style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                            />
                          </td>
                          <td style={{ fontWeight: 700 }}>
                            Rs. {it.lineTotal.toFixed(2)}
                          </td>
                          <td>
                            {items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeItemRow(idx)}
                                className="btn btn-sm"
                                style={{ padding: '0.25rem', color: 'var(--danger)' }}
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

              {/* Bottom Summary & Payments */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', background: 'var(--bg-app)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Invoice Discount (Rs.)</label>
                  <input
                    type="number"
                    className="input"
                    value={discount}
                    onChange={e => setDiscount(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Paid Now (Rs.)</label>
                  <input
                    type="number"
                    className="input"
                    value={paidAmount}
                    onChange={e => setPaidAmount(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Payment Method</label>
                  <select className="select" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                    <option value="CASH">Cash Drawer</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Remarks / Notes</label>
                  <input
                    className="input"
                    placeholder="e.g. Terms, delivery vehicle #, discount voucher"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Grand Total: <strong>Rs. {grandTotal.toFixed(2)}</strong></div>
                  <div style={{ fontSize: '0.85rem', color: remaining > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>
                    Remaining Payable: Rs. {remaining.toFixed(2)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ padding: '0.65rem 1.5rem' }}>
                  Commit Purchase Invoice & Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

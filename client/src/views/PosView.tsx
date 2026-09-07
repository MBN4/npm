import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  Search,
  ShoppingCart,
  Trash2,
  PauseCircle,
  PlayCircle,
  Printer,
  X,
  AlertTriangle
} from 'lucide-react';

export interface CartItem {
  medicineId: number;
  brandName: string;
  strength?: string;
  dosageForm?: string;
  batchId: number;
  batchNumber: string;
  expiryDate: string;
  daysToExpiry: number;
  unitPrice: number;
  availableStock: number;
  quantity: number;
  discount: number;
  lineTotal: number;
  availableBatches?: any[];
}

export const PosView: React.FC = () => {
  const { token, user } = useAuth();

  // Search state
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const paidInputRef = useRef<HTMLInputElement>(null);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customers, setCustomers] = useState<{ id: number; name: string; mobile?: string; current_balance: number }[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [billDiscount, setBillDiscount] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'CREDIT' | 'SPLIT'>('CASH');
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [billNotes, setBillNotes] = useState<string>('');

  // Held bills state
  const [heldBills, setHeldBills] = useState<any[]>([]);
  const [showHeldModal, setShowHeldModal] = useState(false);

  // Receipt modal state
  const [lastInvoice, setLastInvoice] = useState<any>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch customers on load
  useEffect(() => {
    async function loadCustomers() {
      try {
        const res = await fetch('/api/patients', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setCustomers(data.patients || []);
        } else {
          // Fallback if patients route is not yet up
          const cRes = await fetch('/api/pos/search?q=Panadol', { headers: { Authorization: `Bearer ${token}` } });
          if (cRes.ok) {
            setCustomers([
              { id: 1, name: 'Muhammad Usman', mobile: '0312-9988776', current_balance: 1200 },
              { id: 2, name: 'Amina Bibi', mobile: '0345-1122334', current_balance: 0 }
            ]);
          }
        }
      } catch (err) {
        console.error(err);
      }
    }

    loadCustomers();
    fetchHeldBills();
  }, [token]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        handleClearCart();
      } else if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        handleHoldBill();
      } else if (e.key === 'F5') {
        e.preventDefault();
        setShowHeldModal(true);
      } else if (e.key === 'F9') {
        e.preventDefault();
        paidInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setShowReceiptModal(false);
        setShowHeldModal(false);
        setErrorMessage(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart]);

  // Live search handler
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/pos/search?q=${encodeURIComponent(query.trim())}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results);
        }
      } catch (err) {
        console.error('POS search failed:', err);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  const handleAddToCart = (product: any) => {
    setErrorMessage(null);

    if (!product.fefo_batch) {
      setErrorMessage(`No valid non-expired stock available for ${product.brand_name}.`);
      return;
    }

    const batch = product.fefo_batch;

    // Check if already in cart
    const existingIndex = cart.findIndex(it => it.batchId === batch.batch_id);
    if (existingIndex > -1) {
      const updated = [...cart];
      if (updated[existingIndex].quantity + 1 > batch.quantity) {
        setErrorMessage(`Cannot exceed available batch stock (${batch.quantity} units).`);
        return;
      }
      updated[existingIndex].quantity += 1;
      updated[existingIndex].lineTotal = (updated[existingIndex].quantity * updated[existingIndex].unitPrice) - updated[existingIndex].discount;
      setCart(updated);
    } else {
      const newItem: CartItem = {
        medicineId: product.id,
        brandName: product.brand_name,
        strength: product.strength,
        dosageForm: product.dosage_form,
        batchId: batch.batch_id,
        batchNumber: batch.batch_number,
        expiryDate: batch.expiry_date,
        daysToExpiry: batch.days_to_expiry,
        unitPrice: Number(batch.sale_price),
        availableStock: batch.quantity,
        quantity: 1,
        discount: 0,
        lineTotal: Number(batch.sale_price),
        availableBatches: product.available_batches
      };
      setCart([newItem, ...cart]);
    }

    setQuery('');
    setSearchResults([]);
    searchInputRef.current?.focus();
  };

  const handleUpdateQty = (index: number, newQty: number) => {
    setErrorMessage(null);
    if (newQty <= 0) {
      handleRemoveItem(index);
      return;
    }

    const item = cart[index];
    if (newQty > item.availableStock) {
      setErrorMessage(`Cannot exceed available stock (${item.availableStock} units).`);
      return;
    }

    const updated = [...cart];
    updated[index].quantity = newQty;
    updated[index].lineTotal = (newQty * updated[index].unitPrice) - updated[index].discount;
    setCart(updated);
  };

  const handleSwitchBatch = (index: number, newBatchId: number) => {
    const item = cart[index];
    const newBatch = item.availableBatches?.find(b => b.batch_id === newBatchId);
    if (!newBatch) return;

    const updated = [...cart];
    updated[index].batchId = newBatch.batch_id;
    updated[index].batchNumber = newBatch.batch_number;
    updated[index].expiryDate = newBatch.expiry_date;
    updated[index].daysToExpiry = newBatch.days_to_expiry;
    updated[index].unitPrice = Number(newBatch.sale_price);
    updated[index].availableStock = newBatch.quantity;
    updated[index].lineTotal = (updated[index].quantity * Number(newBatch.sale_price)) - updated[index].discount;
    setCart(updated);
  };

  const handleRemoveItem = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const handleClearCart = () => {
    setCart([]);
    setBillDiscount('0');
    setPaidAmount('');
    setErrorMessage(null);
    searchInputRef.current?.focus();
  };

  // Financial Calculations
  const subtotal = cart.reduce((acc, it) => acc + it.lineTotal, 0);
  const discountVal = Number(billDiscount) || 0;
  const grandTotal = Math.max(0, subtotal - discountVal);
  const numericPaid = paidAmount === '' ? (paymentMethod === 'CREDIT' ? 0 : grandTotal) : Number(paidAmount);
  const change = Math.max(0, numericPaid - grandTotal);
  const remaining = Math.max(0, grandTotal - numericPaid);

  const handleHoldBill = async () => {
    if (cart.length === 0) return;
    try {
      const customerName = selectedCustomerId
        ? customers.find(c => String(c.id) === selectedCustomerId)?.name
        : 'Walk-in Counter Patient';

      const res = await fetch('/api/pos/hold', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ customerName, cart })
      });

      if (res.ok) {
        handleClearCart();
        fetchHeldBills();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchHeldBills = async () => {
    try {
      const res = await fetch('/api/pos/held', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHeldBills(data.heldBills || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleResumeBill = async (held: any) => {
    setCart(held.cart);
    try {
      await fetch(`/api/pos/held/${held.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchHeldBills();
      setShowHeldModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (cart.length === 0) {
      setErrorMessage('Cart is empty. Add medicines before checking out.');
      return;
    }

    if (paymentMethod === 'CREDIT' && !selectedCustomerId) {
      setErrorMessage('Credit / Udhar sales require selecting a registered customer account.');
      return;
    }

    try {
      const res = await fetch('/api/pos/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          customerId: selectedCustomerId ? Number(selectedCustomerId) : null,
          items: cart.map(it => ({
            medicineId: it.medicineId,
            batchId: it.batchId,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discount: it.discount
          })),
          subtotal,
          discount: discountVal,
          tax: 0,
          totalAmount: grandTotal,
          paidAmount: numericPaid,
          paymentMethod,
          notes: billNotes
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Checkout failed');
        return;
      }

      setLastInvoice({
        ...data.invoice,
        customer: customers.find(c => String(c.id) === selectedCustomerId),
        cashierName: user?.fullName || 'Cashier'
      });
      setShowReceiptModal(true);
      handleClearCart();
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error during checkout');
    }
  };

  return (
    <div className="page-container" style={{ padding: '1rem' }}>
      {/* Top Shortcuts Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.85rem',
          padding: '0.5rem 1rem',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          fontSize: '0.78rem'
        }}
      >
        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
          <div><span className="kbd">F1</span> New Sale</div>
          <div><span className="kbd">F2</span> Search Medicine</div>
          <div><span className="kbd">F4</span> Hold Bill</div>
          <div><span className="kbd">F5</span> Resume Bill ({heldBills.length})</div>
          <div><span className="kbd">F9</span> Tender / Pay</div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setShowHeldModal(true)}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.75rem', position: 'relative' }}
          >
            <PauseCircle size={14} />
            <span>Held Bills ({heldBills.length})</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: 'var(--danger-light)',
            color: 'var(--danger-text)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.85rem',
            border: '1px solid rgba(239, 68, 68, 0.3)'
          }}
        >
          <AlertTriangle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main POS Split Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '1rem', alignItems: 'start' }}>
        {/* Left Column: Search & Cart */}
        <div>
          {/* Search Box */}
          <div className="card" style={{ padding: '0.85rem', marginBottom: '0.85rem', position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <input
                ref={searchInputRef}
                className="input"
                placeholder="Scan barcode (EAN-13) or search brand / generic name (F2)..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
                style={{ paddingLeft: '2.5rem', fontSize: '0.95rem', height: '44px' }}
              />
              <Search size={18} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              {query && (
                <button
                  onClick={() => { setQuery(''); setSearchResults([]); }}
                  style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Live Search Results Dropdown */}
            {searchResults.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 50,
                  maxHeight: '340px',
                  overflowY: 'auto',
                  marginTop: '4px'
                }}
              >
                {searchResults.map(prod => (
                  <div
                    key={prod.id}
                    onClick={() => handleAddToCart(prod)}
                    style={{
                      padding: '0.75rem 1rem',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--primary-light)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                        {prod.brand_name} {prod.strength}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {prod.generic_name} • Shelf: {prod.rack_location || 'A-1'}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      {prod.fefo_batch ? (
                        <>
                          <div style={{ fontWeight: 800, color: 'var(--primary)' }}>
                            Rs. {Number(prod.fefo_batch.sale_price).toFixed(2)}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--success-text)' }}>
                            FEFO Batch: {prod.fefo_batch.batch_number} ({prod.fefo_batch.days_to_expiry}d left)
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Stock: {prod.total_stock} Units
                          </div>
                        </>
                      ) : (
                        <span className="badge badge-danger">Out of Stock / Expired</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cart Table */}
          <div className="card" style={{ padding: 0, minHeight: '380px' }}>
            <div className="table-container" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>Item Description</th>
                    <th>Batch (FEFO)</th>
                    <th>Price</th>
                    <th>Qty</th>
                    <th>Line Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
                        <ShoppingCart size={36} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                        <div>Sale counter is empty. Scan barcode or search medicine to add.</div>
                      </td>
                    </tr>
                  ) : (
                    cart.map((it, idx) => (
                      <tr key={it.batchId}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{it.brandName} {it.strength}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {it.dosageForm} • Stock: {it.availableStock}
                          </div>
                        </td>
                        <td>
                          <select
                            className="select"
                            value={it.batchId}
                            onChange={e => handleSwitchBatch(idx, Number(e.target.value))}
                            style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem', width: 'auto' }}
                          >
                            {it.availableBatches?.map(b => (
                              <option key={b.batch_id} value={b.batch_id}>
                                {b.batch_number} (Exp: {b.expiry_date})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>Rs. {it.unitPrice.toFixed(2)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <button
                              onClick={() => handleUpdateQty(idx, it.quantity - 1)}
                              className="btn btn-secondary btn-sm"
                              style={{ width: '24px', height: '24px', padding: 0 }}
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              max={it.availableStock}
                              value={it.quantity}
                              onChange={e => handleUpdateQty(idx, Number(e.target.value))}
                              style={{ width: '45px', textAlign: 'center', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.2rem' }}
                            />
                            <button
                              onClick={() => handleUpdateQty(idx, it.quantity + 1)}
                              className="btn btn-secondary btn-sm"
                              style={{ width: '24px', height: '24px', padding: 0 }}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td style={{ fontWeight: 800 }}>Rs. {it.lineTotal.toFixed(2)}</td>
                        <td>
                          <button
                            onClick={() => handleRemoveItem(idx)}
                            style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Billing & Settlement */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {/* Customer Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Customer / Patient (Optional for Cash, Required for Credit)
            </label>
            <select
              className="select"
              value={selectedCustomerId}
              onChange={e => setSelectedCustomerId(e.target.value)}
            >
              <option value="">Walk-in Cash Customer</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.mobile ? `(${c.mobile})` : ''} - Balance: Rs. {c.current_balance}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Method Tabs */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Payment Method
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
              <button
                type="button"
                onClick={() => setPaymentMethod('CASH')}
                className={`btn btn-sm ${paymentMethod === 'CASH' ? 'btn-primary' : 'btn-secondary'}`}
              >
                Cash
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('CARD')}
                className={`btn btn-sm ${paymentMethod === 'CARD' ? 'btn-primary' : 'btn-secondary'}`}
              >
                Card / POS
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('CREDIT')}
                className={`btn btn-sm ${paymentMethod === 'CREDIT' ? 'btn-primary' : 'btn-secondary'}`}
              >
                Credit (Udhar)
              </button>
            </div>
          </div>

          {/* Totals Breakdown */}
          <div style={{ background: 'var(--bg-app)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Items Subtotal:</span>
              <span>Rs. {subtotal.toFixed(2)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Bill Discount:</span>
              <input
                type="number"
                min="0"
                value={billDiscount}
                onChange={e => setBillDiscount(e.target.value)}
                style={{ width: '70px', textAlign: 'right', padding: '0.2rem 0.4rem', border: '1px solid var(--border)', borderRadius: '4px' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.6rem', borderTop: '1px solid var(--border)', fontSize: '1.2rem', fontWeight: 800 }}>
              <span>NET PAYABLE:</span>
              <span style={{ color: 'var(--primary)' }}>Rs. {grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Tender / Paid Amount */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Amount Tendered (Received) (F9)
            </label>
            <input
              ref={paidInputRef}
              type="number"
              className="input"
              placeholder={`e.g. ${grandTotal.toFixed(0)}`}
              value={paidAmount}
              onChange={e => setPaidAmount(e.target.value)}
              style={{ fontSize: '1.1rem', fontWeight: 700 }}
            />

            {/* Quick Presets */}
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
              <button type="button" onClick={() => setPaidAmount(String(grandTotal))} className="btn btn-secondary btn-sm" style={{ flex: 1, fontSize: '0.72rem' }}>
                Exact
              </button>
              <button type="button" onClick={() => setPaidAmount(String(Math.ceil(grandTotal / 50) * 50))} className="btn btn-secondary btn-sm" style={{ flex: 1, fontSize: '0.72rem' }}>
                Round 50
              </button>
              <button type="button" onClick={() => setPaidAmount(String(Math.ceil(grandTotal / 100) * 100))} className="btn btn-secondary btn-sm" style={{ flex: 1, fontSize: '0.72rem' }}>
                Round 100
              </button>
            </div>
          </div>

          {/* Live Change or Remaining */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--bg-app)', borderRadius: 'var(--radius-md)' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Change Return:</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--success)' }}>
                Rs. {change.toFixed(2)}
              </div>
            </div>

            {remaining > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Remaining Udhar:</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--danger)' }}>
                  Rs. {remaining.toFixed(2)}
                </div>
              </div>
            )}
          </div>

          {/* Bill Notes */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Bill Remarks / Rx Instructions
            </label>
            <input
              className="input"
              placeholder="e.g. Prescribed by Dr. Asim, take with water"
              value={billNotes}
              onChange={e => setBillNotes(e.target.value)}
              style={{ fontSize: '0.85rem' }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
            <button
              type="button"
              onClick={handleHoldBill}
              className="btn btn-secondary"
              disabled={cart.length === 0}
              style={{ flex: 1 }}
            >
              <PauseCircle size={16} />
              <span>Hold (F4)</span>
            </button>

            <button
              type="button"
              onClick={handleCheckout}
              className="btn btn-primary"
              disabled={cart.length === 0}
              style={{ flex: 2, padding: '0.75rem', fontSize: '0.95rem' }}
            >
              <span>Complete Sale (F9)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Held Bills Modal */}
      {showHeldModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Held Bills Registry</h3>
              <button onClick={() => setShowHeldModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.3rem' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '1.25rem', maxHeight: '350px', overflowY: 'auto' }}>
              {heldBills.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No held bills currently parked.
                </div>
              ) : (
                heldBills.map(h => (
                  <div
                    key={h.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.85rem',
                      borderBottom: '1px solid var(--border)'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>{h.customer_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Identifier: <code>{h.bill_identifier}</code> • {h.cart.length} Items • {new Date(h.created_at).toLocaleTimeString()}
                      </div>
                    </div>

                    <button
                      onClick={() => handleResumeBill(h)}
                      className="btn btn-primary btn-sm"
                    >
                      <PlayCircle size={14} />
                      <span>Resume</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 80mm ESC/POS Thermal Receipt Modal */}
      {showReceiptModal && lastInvoice && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '380px' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Sale Receipt Ready</span>
              <button onClick={() => setShowReceiptModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.2rem' }}>
                <X size={15} />
              </button>
            </div>

            {/* Printable Area */}
            <div className="printable-receipt" style={{ padding: '1.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '0.85rem' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>NAVEED MEDICAL PHARMACY</h2>
                <div style={{ fontSize: '0.72rem' }}>Main Bazar, Hospital Road, Gujranwala</div>
                <div style={{ fontSize: '0.72rem' }}>Phone: 0300-1112233</div>
                <div style={{ fontSize: '0.72rem', marginTop: '0.25rem' }}>================================</div>
              </div>

              <div style={{ fontSize: '0.75rem', marginBottom: '0.6rem' }}>
                <div>Invoice: <strong>#{lastInvoice.invoiceNumber}</strong></div>
                <div>Date: {new Date(lastInvoice.createdAt).toLocaleString()}</div>
                <div>Cashier: {lastInvoice.cashierName}</div>
                {lastInvoice.customer && <div>Customer: {lastInvoice.customer.name}</div>}
              </div>

              <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '0.4rem 0', marginBottom: '0.6rem' }}>
                <table style={{ width: '100%', fontSize: '0.72rem' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', background: 'transparent', padding: 0 }}>Item</th>
                      <th style={{ textAlign: 'center', background: 'transparent', padding: 0 }}>Qty</th>
                      <th style={{ textAlign: 'right', background: 'transparent', padding: 0 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastInvoice.items.map((it: any, i: number) => (
                      <tr key={i}>
                        <td style={{ padding: '0.2rem 0' }}>
                          <div>{it.brandName}</div>
                          <div style={{ fontSize: '0.65rem', color: '#666' }}>Batch: {it.batchNumber}</div>
                        </td>
                        <td style={{ textAlign: 'center', padding: '0.2rem 0' }}>{it.quantity}</td>
                        <td style={{ textAlign: 'right', padding: '0.2rem 0' }}>Rs. {it.lineTotal.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal:</span>
                  <span>Rs. {lastInvoice.subtotal.toFixed(2)}</span>
                </div>
                {lastInvoice.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Discount:</span>
                    <span>-Rs. {lastInvoice.discount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '0.9rem', borderTop: '1px solid #000', paddingTop: '0.2rem' }}>
                  <span>NET TOTAL:</span>
                  <span>Rs. {lastInvoice.totalAmount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Paid:</span>
                  <span>Rs. {lastInvoice.paidAmount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>Change:</span>
                  <span>Rs. {lastInvoice.changeAmount.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.68rem', borderTop: '1px dashed #000', paddingTop: '0.5rem' }}>
                <div>Get well soon! Keep medicines below 30°C.</div>
                <div>Returns accepted within 7 days with bill.</div>
              </div>
            </div>

            <div style={{ padding: '1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => window.print()} className="btn btn-primary" style={{ flex: 1 }}>
                <Printer size={16} />
                <span>Print Thermal Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

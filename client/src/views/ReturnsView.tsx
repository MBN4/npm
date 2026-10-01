import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { RotateCcw, ScanBarcode, Search, Printer, X } from 'lucide-react';

interface SaleItemRow {
  id: number;
  medicine_id: number;
  batch_id: number;
  quantity: number;
  unit_price: number;
  description_snapshot: string;
  brand_name: string;
  strength: string;
  batch_number: string;
  expiry_date: string;
  already_returned: number;
  remaining_returnable: number;
}

interface SaleData {
  id: number;
  invoice_number: string;
  created_at: string;
  customer_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  cashier_name: string;
  payment_method: string;
  total_amount: number;
  status: string;
}

interface Eligibility {
  eligible: boolean;
  hoursSincePurchase: number;
  windowHours: number;
}

type ReturnType = 'RETURN' | 'REFUND' | 'REPLACE';
type Disposition = 'RESTOCK_SELLABLE' | 'QUARANTINE' | 'DAMAGED' | 'EXPIRED' | 'SUPPLIER_RETURN' | 'DISPOSAL';
type DeductionType = 'NONE' | 'PERCENTAGE' | 'FIXED';

interface SelectedLine {
  checked: boolean;
  returnQty: string;
  disposition: Disposition;
}

interface ReplacementLine {
  medicineId: number;
  brandName: string;
  quantity: string;
}

const RETURN_REASONS = [
  'Wrong Item Purchased',
  'Customer Changed Mind',
  'Doctor Changed Medicine',
  'Product Defect',
  'Damaged Product',
  'Incorrect Product Supplied',
  'Expiry Issue',
  'Replacement Required',
  'Billing Error',
  'Other'
];

const DISPOSITIONS: { value: Disposition; label: string }[] = [
  { value: 'RESTOCK_SELLABLE', label: 'Return to Sellable Stock' },
  { value: 'QUARANTINE', label: 'Quarantine' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'SUPPLIER_RETURN', label: 'Supplier Return' },
  { value: 'DISPOSAL', label: 'Disposal / Wastage' }
];

const REFUND_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'JAZZCASH', 'EASYPAISA', 'CREDIT_NOTE', 'OTHER'];

function genRequestKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const ReturnsView: React.FC = () => {
  const { token, user } = useAuth();

  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [sale, setSale] = useState<SaleData | null>(null);
  const [items, setItems] = useState<SaleItemRow[]>([]);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [policyText, setPolicyText] = useState('');

  const [selections, setSelections] = useState<Record<number, SelectedLine>>({});
  const [returnType, setReturnType] = useState<ReturnType>('RETURN');
  const [returnReason, setReturnReason] = useState('');
  const [reasonOther, setReasonOther] = useState('');
  const [notes, setNotes] = useState('');

  const [deductionType, setDeductionType] = useState<DeductionType>('NONE');
  const [deductionValue, setDeductionValue] = useState('0');
  const [refundMethod, setRefundMethod] = useState('');

  const [replacementSearch, setReplacementSearch] = useState('');
  const [replacementResults, setReplacementResults] = useState<any[]>([]);
  const [replacementItems, setReplacementItems] = useState<ReplacementLine[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<any>(null);

  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  const resetForNewLookup = () => {
    setSale(null);
    setItems([]);
    setEligibility(null);
    setSelections({});
    setReturnType('RETURN');
    setReturnReason('');
    setReasonOther('');
    setNotes('');
    setDeductionType('NONE');
    setDeductionValue('0');
    setRefundMethod('');
    setReplacementItems([]);
    setReplacementResults([]);
    setReplacementSearch('');
    setLastReceipt(null);
  };

  const lookupInvoice = async (raw: string) => {
    const clean = raw.trim().replace(/^#/, '');
    if (!clean) return;

    setIsLoading(true);
    setError(null);
    setMessage(null);
    resetForNewLookup();

    try {
      const res = await fetch(`/api/returns/lookup/${encodeURIComponent(clean)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invoice not found');

      setSale(data.sale);
      setItems(data.items || []);
      setEligibility(data.eligibility || null);
      setPolicyText(data.policy?.policyText || '');

      const initialSelections: Record<number, SelectedLine> = {};
      for (const it of data.items || []) {
        initialSelections[it.id] = { checked: false, returnQty: '0', disposition: 'RESTOCK_SELLABLE' };
      }
      setSelections(initialSelections);
    } catch (err: any) {
      setError(err.message || 'Failed to look up invoice');
    } finally {
      setIsLoading(false);
    }
  };

  const updateSelection = (itemId: number, patch: Partial<SelectedLine>) => {
    setSelections(prev => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  };

  const searchReplacementMedicine = async (q: string) => {
    setReplacementSearch(q);
    if (!q.trim()) { setReplacementResults([]); return; }
    try {
      const res = await fetch(`/api/pos/search?q=${encodeURIComponent(q.trim())}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setReplacementResults(data.results || []);
    } catch {
      setReplacementResults([]);
    }
  };

  const addReplacementItem = (med: any) => {
    setReplacementItems(prev => [...prev, { medicineId: med.id, brandName: `${med.brand_name}${med.strength ? ' ' + med.strength : ''}`, quantity: '1' }]);
    setReplacementSearch('');
    setReplacementResults([]);
  };

  const removeReplacementItem = (index: number) => {
    setReplacementItems(prev => prev.filter((_, i) => i !== index));
  };

  // Live client-side math (server recomputes authoritatively)
  const selectedLines = items
    .map(it => ({ item: it, sel: selections[it.id] }))
    .filter(x => x.sel?.checked && Number(x.sel.returnQty) > 0);

  const grossReturnAmount = selectedLines.reduce((sum, x) => sum + x.item.unit_price * Number(x.sel.returnQty), 0);

  let deductionAmount = 0;
  if (deductionType === 'PERCENTAGE') deductionAmount = (grossReturnAmount * (Number(deductionValue) || 0)) / 100;
  else if (deductionType === 'FIXED') deductionAmount = Number(deductionValue) || 0;
  deductionAmount = Math.max(0, Math.min(deductionAmount, grossReturnAmount));
  const netReturnAmount = Math.round((grossReturnAmount - deductionAmount) * 100) / 100;

  const needsMoneySettlement = returnType !== 'RETURN' || replacementItems.length > 0;

  const handleProcess = async () => {
    if (!sale) return;
    setError(null);
    setMessage(null);

    const returnItemsPayload = selectedLines.map(x => ({
      saleItemId: x.item.id,
      quantityReturned: Number(x.sel.returnQty),
      disposition: x.sel.disposition
    }));

    if (returnItemsPayload.length === 0 && replacementItems.length === 0) {
      setError('Select at least one item to return, or add a replacement item.');
      return;
    }

    const finalReason = returnReason === 'Other' ? reasonOther.trim() : returnReason;
    if (!finalReason) {
      setError('Return reason is required.');
      return;
    }

    const replacementPayload = replacementItems
      .filter(r => Number(r.quantity) > 0)
      .map(r => ({ medicineId: r.medicineId, quantity: Number(r.quantity) }));

    if (returnType === 'REPLACE' && replacementPayload.length === 0) {
      setError('Add at least one replacement item.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          saleId: sale.id,
          returnType,
          returnReason: finalReason,
          reasonNotes: notes || undefined,
          items: returnItemsPayload,
          deductionType,
          deductionValue: Number(deductionValue) || 0,
          refundMethod: refundMethod || undefined,
          replacementItems: returnType === 'REPLACE' ? replacementPayload : undefined,
          notes,
          requestKey: genRequestKey()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process return');

      setMessage(`Return ${data.return.returnNumber} processed successfully.`);
      setLastReceipt(data.return);
      await lookupInvoice(sale.invoice_number);
    } catch (err: any) {
      setError(err.message || 'Failed to process return');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <RotateCcw size={22} /> Returns / Refund / Replacement
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Process product returns, refunds or replacements using the invoice barcode or search.
          </p>
        </div>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: 'var(--danger-light)', color: 'var(--danger-text)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}
      {message && (
        <div style={{ padding: '0.75rem 1rem', background: 'var(--success-light)', color: 'var(--success-text)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.85rem' }}>
          {message}
        </div>
      )}

      {/* Scan / Search */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <form
          onSubmit={e => { e.preventDefault(); lookupInvoice(invoiceQuery); }}
          style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '260px' }}>
            <ScanBarcode size={18} />
            <input
              ref={scanRef}
              className="input"
              placeholder="Scan invoice barcode/QR or type invoice number..."
              value={invoiceQuery}
              onChange={e => setInvoiceQuery(e.target.value)}
              style={{ flex: 1 }}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={isLoading}>
            <Search size={14} /> {isLoading ? 'Searching...' : 'Search'}
          </button>
        </form>
      </div>

      {sale && (
        <>
          {/* Original Invoice Details */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <strong style={{ fontSize: '1rem' }}>Invoice: {sale.invoice_number}</strong>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {new Date(sale.created_at).toLocaleString()} • {sale.customer_name || 'Walk-in Customer'} • Cashier: {sale.cashier_name} • {sale.payment_method}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Total: Rs. {sale.total_amount.toFixed(2)} • Status: {sale.status}
                </div>
              </div>
              {eligibility && (
                <div style={{ textAlign: 'right' }}>
                  <span
                    style={{
                      padding: '0.3rem 0.7rem',
                      borderRadius: '999px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      background: eligibility.eligible ? 'var(--success-light)' : 'rgba(249, 168, 37, 0.15)',
                      color: eligibility.eligible ? 'var(--success-text)' : '#f9a825'
                    }}
                  >
                    {eligibility.eligible ? '🟢 Eligible — Within Window' : '🟠 Past Policy Window — Manager Discretion'}
                  </span>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Time since purchase: {eligibility.hoursSincePurchase}h (window: {eligibility.windowHours}h)
                  </div>
                </div>
              )}
            </div>
            {policyText && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                {policyText}
              </div>
            )}
          </div>

          {/* Items table */}
          <div className="card" style={{ padding: 0, marginBottom: '1rem' }}>
            <div className="table-container" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Item</th>
                    <th>Batch</th>
                    <th>Expiry</th>
                    <th>Sold</th>
                    <th>Returned</th>
                    <th>Remaining</th>
                    <th>Price</th>
                    <th>Return Qty</th>
                    <th>Disposition</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => {
                    const sel = selections[it.id] || { checked: false, returnQty: '0', disposition: 'RESTOCK_SELLABLE' as Disposition };
                    const qty = Number(sel.returnQty) || 0;
                    const amount = qty * it.unit_price;
                    return (
                      <tr key={it.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={sel.checked}
                            disabled={it.remaining_returnable <= 0}
                            onChange={e => updateSelection(it.id, { checked: e.target.checked, returnQty: e.target.checked ? '1' : '0' })}
                          />
                        </td>
                        <td>{it.description_snapshot || `${it.brand_name} ${it.strength || ''}`}</td>
                        <td>{it.batch_number}</td>
                        <td>{it.expiry_date}</td>
                        <td>{it.quantity}</td>
                        <td>{it.already_returned}</td>
                        <td>{it.remaining_returnable}</td>
                        <td>{it.unit_price.toFixed(2)}</td>
                        <td>
                          <input
                            type="number"
                            className="input"
                            style={{ width: '70px' }}
                            min={0}
                            max={it.remaining_returnable}
                            value={sel.returnQty}
                            disabled={!sel.checked}
                            onChange={e => {
                              const v = Math.max(0, Math.min(it.remaining_returnable, Number(e.target.value) || 0));
                              updateSelection(it.id, { returnQty: String(v) });
                            }}
                          />
                        </td>
                        <td>
                          <select
                            className="select"
                            value={sel.disposition}
                            disabled={!sel.checked}
                            onChange={e => updateSelection(it.id, { disposition: e.target.value as Disposition })}
                          >
                            {DISPOSITIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                          </select>
                        </td>
                        <td>{amount.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action type */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
            <button className={`btn ${returnType === 'RETURN' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setReturnType('RETURN')}>↩ RETURN</button>
            <button className={`btn ${returnType === 'REFUND' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setReturnType('REFUND')}>💵 REFUND</button>
            <button className={`btn ${returnType === 'REPLACE' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setReturnType('REPLACE')}>🔄 REPLACE</button>
          </div>

          {returnType === 'REPLACE' && (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <strong style={{ fontSize: '0.9rem' }}>Replacement Items</strong>
              <div style={{ position: 'relative', marginTop: '0.5rem' }}>
                <input
                  className="input"
                  placeholder="Search medicine to issue as replacement..."
                  value={replacementSearch}
                  onChange={e => searchReplacementMedicine(e.target.value)}
                />
                {replacementResults.length > 0 && (
                  <div className="card" style={{ position: 'absolute', zIndex: 10, width: '100%', maxHeight: '220px', overflowY: 'auto', marginTop: '0.25rem' }}>
                    {replacementResults.map((med: any) => (
                      <div
                        key={med.id}
                        style={{ padding: '0.5rem', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                        onClick={() => addReplacementItem(med)}
                      >
                        {med.brand_name} {med.strength || ''}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {replacementItems.map((rep, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <span style={{ flex: 1 }}>{rep.brandName}</span>
                  <input
                    type="number"
                    className="input"
                    style={{ width: '70px' }}
                    min={1}
                    value={rep.quantity}
                    onChange={e => setReplacementItems(prev => prev.map((r, i) => i === idx ? { ...r, quantity: e.target.value } : r))}
                  />
                  <button className="btn btn-secondary btn-sm" onClick={() => removeReplacementItem(idx)}><X size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {/* Reason + Deduction + Refund Method */}
          <div className="card" style={{ marginBottom: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <label className="form-label">Return Reason *</label>
              <select className="select" value={returnReason} onChange={e => setReturnReason(e.target.value)}>
                <option value="">Select reason...</option>
                {RETURN_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {returnReason === 'Other' && (
                <input className="input" style={{ marginTop: '0.5rem' }} placeholder="Explain reason..." value={reasonOther} onChange={e => setReasonOther(e.target.value)} />
              )}

              <label className="form-label" style={{ marginTop: '0.75rem' }}>Notes (Optional)</label>
              <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add notes here..." />
            </div>

            <div>
              <label className="form-label">Deduction</label>
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <label><input type="radio" checked={deductionType === 'NONE'} onChange={() => { setDeductionType('NONE'); setDeductionValue('0'); }} /> No Deduction</label>
                <label><input type="radio" checked={deductionType === 'PERCENTAGE'} onChange={() => setDeductionType('PERCENTAGE')} /> Percentage (%)</label>
                <label><input type="radio" checked={deductionType === 'FIXED'} onChange={() => setDeductionType('FIXED')} /> Fixed (Rs.)</label>
              </div>
              {deductionType !== 'NONE' && (
                <input type="number" className="input" style={{ width: '120px' }} value={deductionValue} onChange={e => setDeductionValue(e.target.value)} />
              )}

              {needsMoneySettlement && (
                <>
                  <label className="form-label" style={{ marginTop: '0.75rem' }}>Refund / Payment Method</label>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {REFUND_METHODS.map(m => (
                      <button
                        key={m}
                        type="button"
                        className={`btn btn-sm ${refundMethod === m ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setRefundMethod(m)}
                      >
                        {m.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="card" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Gross Return Amount</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>Rs. {grossReturnAmount.toFixed(2)}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Deduction</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ef4444' }}>Rs. {deductionAmount.toFixed(2)}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Net Refund / Credit</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#22c55e' }}>Rs. {netReturnAmount.toFixed(2)}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={resetForNewLookup}>Cancel</button>
            <button className="btn btn-primary" disabled={isSubmitting} onClick={handleProcess}>
              {isSubmitting ? 'Processing...' : `Process ${returnType === 'RETURN' ? 'Return' : returnType === 'REFUND' ? 'Refund' : 'Replacement'}`}
            </button>
          </div>

          {lastReceipt && (
            <div className="card" style={{ marginTop: '1.5rem' }} id="return-receipt">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Return Receipt — {lastReceipt.returnNumber}</strong>
                <button className="btn btn-secondary btn-sm" onClick={() => window.print()}><Printer size={14} /> Print</button>
              </div>
              <div style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                Original Invoice: {lastReceipt.invoiceNumber}<br />
                Type: {lastReceipt.returnType}<br />
                Gross: Rs. {lastReceipt.grossReturnAmount.toFixed(2)} • Deduction: Rs. {lastReceipt.deductionAmount.toFixed(2)} • Net: Rs. {lastReceipt.netReturnAmount.toFixed(2)}<br />
                {lastReceipt.replacementSaleAmount > 0 && <>Replacement Value: Rs. {lastReceipt.replacementSaleAmount.toFixed(2)}<br /></>}
                {lastReceipt.balanceDueToCustomer > 0 && <>Refunded to customer: Rs. {lastReceipt.balanceDueToCustomer.toFixed(2)}<br /></>}
                {lastReceipt.balanceDueFromCustomer > 0 && <>Extra charged to customer: Rs. {lastReceipt.balanceDueFromCustomer.toFixed(2)}<br /></>}
                Processed by: {user?.fullName}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  Boxes,
  Ban,
  Clock,
  RefreshCw,
  SlidersHorizontal,
  History,
  X
} from 'lucide-react';

export interface BatchItem {
  id: number;
  medicine_id: number;
  brand_name: string;
  strength?: string;
  dosage_form?: string;
  barcode?: string;
  medicine_rack?: string;
  batch_number: string;
  mfg_date?: string;
  expiry_date: string;
  purchase_price: number;
  sale_price: number;
  quantity: number;
  bonus_quantity: number;
  supplier_name?: string;
  computed_expiry_status: 'ACTIVE' | 'NEAR_EXPIRY' | 'EXPIRED';
  days_to_expiry: number;
  unit_margin: number;
  margin_percent: number;
}

export interface StockMovement {
  id: number;
  batch_id: number;
  movement_type: string;
  quantity_change: number;
  balance_after: number;
  reference_type?: string;
  reference_id?: string;
  notes?: string;
  user_name?: string;
  created_at: string;
  batch_number: string;
  brand_name: string;
  strength?: string;
}

export const InventoryView: React.FC = () => {
  const { token, hasPermission } = useAuth();
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [valuation, setValuation] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'near_expiry' | 'expired' | 'movements'>('all');
  const [isLoading, setIsLoading] = useState(false);

  // Adjustment Modal State
  const [selectedBatch, setSelectedBatch] = useState<BatchItem | null>(null);
  const [newQty, setNewQty] = useState<string>('');
  const [adjustReason, setAdjustReason] = useState<string>('Physical count verification');
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);

  const fetchInventoryData = async () => {
    setIsLoading(true);
    try {
      const [batchRes, valRes, movRes] = await Promise.all([
        fetch('/api/inventory/batches', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/inventory/valuation', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/inventory/movements?limit=40', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (batchRes.ok) setBatches((await batchRes.json()).batches);
      if (valRes.ok) setValuation((await valRes.json()).valuation);
      if (movRes.ok) setMovements((await movRes.json()).movements);
    } catch (err) {
      console.error('Error fetching inventory:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInventoryData();
  }, [token]);

  const handleOpenAdjustment = (batch: BatchItem) => {
    setSelectedBatch(batch);
    setNewQty(String(batch.quantity));
    setAdjustReason('Physical count stocktake verification');
    setAdjustError(null);
    setAdjustSuccess(null);
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch) return;
    setAdjustError(null);

    const qty = Number(newQty);
    if (isNaN(qty) || qty < 0) {
      setAdjustError('Negative stock is strictly prohibited by business invariants');
      return;
    }

    try {
      const res = await fetch('/api/inventory/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          batchId: selectedBatch.id,
          newQuantity: qty,
          reason: adjustReason
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setAdjustError(data.error || 'Failed to adjust stock');
        return;
      }

      setAdjustSuccess(`Batch ${selectedBatch.batch_number} stock updated to ${qty} units.`);
      setSelectedBatch(null);
      fetchInventoryData();
    } catch (err: any) {
      setAdjustError(err.message || 'Network error');
    }
  };

  const filteredBatches = batches.filter(b => {
    if (activeTab === 'near_expiry') return b.computed_expiry_status === 'NEAR_EXPIRY';
    if (activeTab === 'expired') return b.computed_expiry_status === 'EXPIRED';
    return true;
  });

  return (
    <div className="page-container">
      {/* Header & Valuation Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Batch Inventory & Valuation</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            FEFO Stock Tracking • Physical Count Adjustments • Expiry Alerts
          </p>
        </div>

        <button onClick={fetchInventoryData} className="btn btn-secondary btn-sm" disabled={isLoading}>
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          <span>Refresh Stock</span>
        </button>
      </div>

      {adjustSuccess && (
        <div style={{ padding: '0.75rem 1rem', background: 'var(--success-light)', color: 'var(--success-text)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.85rem' }}>
          {adjustSuccess}
        </div>
      )}

      {/* Valuation Metric Cards */}
      {valuation && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="card">
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>TOTAL STOCK UNITS</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem' }}>
              {valuation.total_units} Units
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              Across {valuation.total_products_in_stock} unique products
            </div>
          </div>

          <div className="card">
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>PURCHASE VALUATION (COST)</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
              Rs. {Number(valuation.total_purchase_value).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              Acquisition investment
            </div>
          </div>

          <div className="card">
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>ACTIVE RETAIL VALUE</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.25rem' }}>
              Rs. {Number(valuation.active_retail_value).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              Valid non-expired stock
            </div>
          </div>

          <div className="card">
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>PROJECTED GROSS PROFIT</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)', marginTop: '0.25rem' }}>
              Rs. {Number(valuation.projected_gross_profit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              Margin: {valuation.margin_percent}%
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('all')}
          className={`btn ${activeTab === 'all' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
        >
          <Boxes size={15} />
          <span>All Stock Batches ({batches.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('near_expiry')}
          className={`btn ${activeTab === 'near_expiry' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
        >
          <Clock size={15} />
          <span>Near Expiry 90d ({batches.filter(b => b.computed_expiry_status === 'NEAR_EXPIRY').length})</span>
        </button>
        <button
          onClick={() => setActiveTab('expired')}
          className={`btn ${activeTab === 'expired' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
        >
          <Ban size={15} />
          <span>Expired Batches ({batches.filter(b => b.computed_expiry_status === 'EXPIRED').length})</span>
        </button>
        <button
          onClick={() => setActiveTab('movements')}
          className={`btn ${activeTab === 'movements' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
        >
          <History size={15} />
          <span>Movement Ledger ({movements.length})</span>
        </button>
      </div>

      {activeTab !== 'movements' ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Medicine Product</th>
                  <th>Batch / Lot #</th>
                  <th>Expiry Date</th>
                  <th>Days Left</th>
                  <th>Cost Price</th>
                  <th>Sale Price</th>
                  <th>Margin</th>
                  <th>Quantity</th>
                  <th>Shelf</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBatches.map(b => {
                  const isExpired = b.computed_expiry_status === 'EXPIRED';
                  const isNear = b.computed_expiry_status === 'NEAR_EXPIRY';

                  return (
                    <tr key={b.id} style={{ backgroundColor: isExpired ? 'rgba(239, 68, 68, 0.04)' : undefined }}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{b.brand_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {b.dosage_form} • {b.strength || 'N/A'}
                        </div>
                      </td>
                      <td>
                        <code style={{ fontWeight: 600 }}>{b.batch_number}</code>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{b.expiry_date}</div>
                        <span className={`badge ${isExpired ? 'badge-danger' : isNear ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: '0.65rem' }}>
                          {isExpired ? 'EXPIRED (BLOCKED)' : isNear ? 'NEAR EXPIRY' : 'ACTIVE FEFO'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.85rem', fontWeight: isExpired ? 700 : 500, color: isExpired ? 'var(--danger)' : isNear ? 'var(--warning)' : 'inherit' }}>
                          {isExpired ? `${Math.abs(b.days_to_expiry)}d ago` : `${b.days_to_expiry} days`}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>Rs. {Number(b.purchase_price).toFixed(2)}</td>
                      <td style={{ fontSize: '0.85rem', fontWeight: 700 }}>Rs. {Number(b.sale_price).toFixed(2)}</td>
                      <td>
                        <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>
                          {b.margin_percent}%
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '1rem', fontWeight: 800, color: isExpired ? 'var(--danger)' : 'var(--text-primary)' }}>
                          {b.quantity}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {b.medicine_rack || '—'}
                      </td>
                      <td>
                        {hasPermission('adjust_stock') && (
                          <button
                            onClick={() => handleOpenAdjustment(b)}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.72rem' }}
                          >
                            <SlidersHorizontal size={13} />
                            <span>Adjust Count</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Medicine</th>
                  <th>Batch #</th>
                  <th>Movement Type</th>
                  <th>Quantity Delta</th>
                  <th>Balance After</th>
                  <th>Reference</th>
                  <th>Notes / Reason</th>
                  <th>Actor</th>
                </tr>
              </thead>
              <tbody>
                {movements.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {new Date(m.created_at).toLocaleString()}
                    </td>
                    <td style={{ fontWeight: 600 }}>{m.brand_name} {m.strength}</td>
                    <td><code>{m.batch_number}</code></td>
                    <td>
                      <span className={`badge ${m.quantity_change > 0 ? 'badge-success' : 'badge-danger'}`}>
                        {m.movement_type}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700, color: m.quantity_change > 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change}
                    </td>
                    <td style={{ fontWeight: 800 }}>{m.balance_after}</td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.reference_id || '—'}</td>
                    <td style={{ fontSize: '0.8rem' }}>{m.notes || '—'}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{m.user_name || 'System'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {selectedBatch && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                Adjust Physical Stock Count
              </h3>
              <button onClick={() => setSelectedBatch(null)} className="btn btn-secondary btn-sm" style={{ padding: '0.3rem' }}>
                <X size={16} />
              </button>
            </div>

            {adjustError && (
              <div style={{ margin: '1rem 1.5rem 0', padding: '0.75rem', background: 'var(--danger-light)', color: 'var(--danger-text)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                {adjustError}
              </div>
            )}

            <form onSubmit={handleSaveAdjustment} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: 'var(--bg-app)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{selectedBatch.brand_name} {selectedBatch.strength}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  Batch: <code>{selectedBatch.batch_number}</code> • Current System Balance: <strong>{selectedBatch.quantity} Units</strong>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Verified Physical Count (New Quantity) *
                </label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  value={newQty}
                  onChange={e => setNewQty(e.target.value)}
                  required
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Negative values are strictly prohibited. Difference will be logged to Stock Movements.
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Reason for Adjustment *
                </label>
                <input
                  className="input"
                  placeholder="e.g. Physical inventory audit, breakage, spill"
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button type="button" onClick={() => setSelectedBatch(null)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Commit Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

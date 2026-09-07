import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  AlertTriangle,
  Ban,
  Clock,
  RefreshCw,
  FileSpreadsheet,
  Trash2,
  X
} from 'lucide-react';

export const ExpiryView: React.FC = () => {
  const { token } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [selectedWindow, setSelectedWindow] = useState<string>('EXPIRED');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals
  const [selectedBatchForDispose, setSelectedBatchForDispose] = useState<any>(null);
  const [disposeQty, setDisposeQty] = useState('');
  const [disposeReason, setDisposeReason] = useState('Authorized expired stock incineration');

  const [selectedBatchForClaim, setSelectedBatchForClaim] = useState<any>(null);
  const [claimNotes, setClaimNotes] = useState('Supplier replacement / credit claim');

  const fetchExpiryData = async () => {
    setIsLoading(true);
    try {
      const [statsRes, batchRes] = await Promise.all([
        fetch('/api/expiry/dashboard', { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/expiry/batches?window=${selectedWindow}`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (statsRes.ok) setStats((await statsRes.json()).stats);
      if (batchRes.ok) setBatches((await batchRes.json()).batches);
    } catch (err) {
      console.error('Failed to fetch expiry data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchExpiryData();
  }, [token, selectedWindow]);

  const handleDispose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatchForDispose) return;
    setStatusMessage(null);

    const qty = Number(disposeQty);
    if (isNaN(qty) || qty <= 0) return;

    try {
      const res = await fetch('/api/expiry/dispose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          batchId: selectedBatchForDispose.id,
          quantity: qty,
          reason: disposeReason
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({ text: data.error || 'Failed to dispose stock', type: 'error' });
        return;
      }

      setStatusMessage({ text: `Batch ${selectedBatchForDispose.batch_number}: ${qty} units safely written off.`, type: 'success' });
      setSelectedBatchForDispose(null);
      fetchExpiryData();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Network error', type: 'error' });
    }
  };

  const handleCreateClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatchForClaim) return;
    setStatusMessage(null);

    try {
      const res = await fetch('/api/expiry/claims', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          supplierId: selectedBatchForClaim.supplier_id || 1,
          batchIds: [selectedBatchForClaim.id],
          notes: claimNotes
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({ text: data.error || 'Failed to generate claim', type: 'error' });
        return;
      }

      setStatusMessage({ text: `Claim #${data.claimNumber} generated for supplier for Rs. ${data.totalClaimValue.toFixed(2)}.`, type: 'success' });
      setSelectedBatchForClaim(null);
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Network error', type: 'error' });
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Expiry Control & Stock Protection</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Configurable Expiry Horizons • Server-Side Sale Blocking • Supplier Return Claims
          </p>
        </div>

        <button onClick={fetchExpiryData} className="btn btn-secondary btn-sm" disabled={isLoading}>
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          <span>Refresh Alerts</span>
        </button>
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

      {/* Expiry Window Selector Cards (Section 10 of Spec) */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {/* Expired Stock */}
          <div
            onClick={() => setSelectedWindow('EXPIRED')}
            className="card"
            style={{
              cursor: 'pointer',
              borderColor: selectedWindow === 'EXPIRED' ? 'var(--danger)' : undefined,
              backgroundColor: selectedWindow === 'EXPIRED' ? 'var(--danger-light)' : undefined
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--danger)' }}>EXPIRED STOCK</span>
              <Ban size={16} style={{ color: 'var(--danger)' }} />
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--danger)', marginTop: '0.25rem' }}>
              {stats.expired_batch_count} Batches
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--danger-text)', marginTop: '0.2rem' }}>
              {stats.expired_units} Units • Loss: Rs. {Number(stats.expired_cost_loss).toFixed(2)}
            </div>
          </div>

          {/* 7 Days Window */}
          <div
            onClick={() => setSelectedWindow('7')}
            className="card"
            style={{
              cursor: 'pointer',
              borderColor: selectedWindow === '7' ? 'var(--danger)' : undefined,
              backgroundColor: selectedWindow === '7' ? 'var(--danger-light)' : undefined
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>7 DAYS (CRITICAL)</span>
              <AlertTriangle size={16} style={{ color: '#dc2626' }} />
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#dc2626', marginTop: '0.25rem' }}>
              {stats.days_7_count} Batches
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              {stats.days_7_units} Units remaining
            </div>
          </div>

          {/* 30 Days Window */}
          <div
            onClick={() => setSelectedWindow('30')}
            className="card"
            style={{
              cursor: 'pointer',
              borderColor: selectedWindow === '30' ? 'var(--warning)' : undefined,
              backgroundColor: selectedWindow === '30' ? 'var(--warning-light)' : undefined
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#d97706' }}>30 DAYS HORIZON</span>
              <Clock size={16} style={{ color: '#d97706' }} />
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#d97706', marginTop: '0.25rem' }}>
              {stats.days_30_count} Batches
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              {stats.days_30_units} Units remaining
            </div>
          </div>

          {/* 60 Days Window */}
          <div
            onClick={() => setSelectedWindow('60')}
            className="card"
            style={{
              cursor: 'pointer',
              borderColor: selectedWindow === '60' ? 'var(--warning)' : undefined,
              backgroundColor: selectedWindow === '60' ? 'var(--warning-light)' : undefined
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b45309' }}>60 DAYS HORIZON</span>
              <Clock size={16} style={{ color: '#b45309' }} />
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#b45309', marginTop: '0.25rem' }}>
              {stats.days_60_count} Batches
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              {stats.days_60_units} Units remaining
            </div>
          </div>

          {/* 90 Days Window */}
          <div
            onClick={() => setSelectedWindow('90')}
            className="card"
            style={{
              cursor: 'pointer',
              borderColor: selectedWindow === '90' ? 'var(--primary)' : undefined,
              backgroundColor: selectedWindow === '90' ? 'var(--primary-light)' : undefined
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)' }}>90 DAYS (STANDARD)</span>
              <Clock size={16} style={{ color: 'var(--primary)' }} />
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.25rem' }}>
              {stats.days_90_count} Batches
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              {stats.days_90_units} Units remaining
            </div>
          </div>

          {/* 180 Days Window */}
          <div
            onClick={() => setSelectedWindow('180')}
            className="card"
            style={{
              cursor: 'pointer',
              borderColor: selectedWindow === '180' ? 'var(--primary)' : undefined,
              backgroundColor: selectedWindow === '180' ? 'var(--primary-light)' : undefined
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>180 DAYS HORIZON</span>
              <Clock size={16} style={{ color: 'var(--text-muted)' }} />
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
              {stats.days_180_count} Batches
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              {stats.days_180_units} Units remaining
            </div>
          </div>
        </div>
      )}

      {/* Batches Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-container" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Medicine Product</th>
                <th>Batch #</th>
                <th>Expiry Date</th>
                <th>Days Remaining</th>
                <th>Units in Stock</th>
                <th>Acquisition Cost</th>
                <th>Loss Value (At Risk)</th>
                <th>Supplier Distributor</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No stock batches found for the selected expiry horizon ({selectedWindow}).
                  </td>
                </tr>
              ) : (
                batches.map(b => {
                  const isExpired = b.expiry_bucket === 'EXPIRED';

                  return (
                    <tr key={b.id} style={{ backgroundColor: isExpired ? 'rgba(239, 68, 68, 0.04)' : undefined }}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{b.brand_name} {b.strength}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Shelf: {b.shelf_location || 'A-1'}</div>
                      </td>
                      <td><code>{b.batch_number}</code></td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{b.expiry_date}</div>
                        <span className={`badge ${isExpired ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '0.65rem' }}>
                          {isExpired ? 'BLOCKED FROM SALE' : 'ELIGIBLE FOR RETURN'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: isExpired ? 'var(--danger)' : '#d97706' }}>
                        {isExpired ? `${Math.abs(b.days_to_expiry)}d ago` : `${b.days_to_expiry} days`}
                      </td>
                      <td style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                        {b.quantity} Units
                      </td>
                      <td>Rs. {Number(b.total_cost_value).toFixed(2)}</td>
                      <td style={{ fontWeight: 700, color: isExpired ? 'var(--danger)' : 'inherit' }}>
                        Rs. {Number(b.total_retail_value).toFixed(2)}
                      </td>
                      <td>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{b.supplier_name || 'Direct Procurement'}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{b.supplier_phone || ''}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          {isExpired ? (
                            <button
                              onClick={() => {
                                setSelectedBatchForDispose(b);
                                setDisposeQty(String(b.quantity));
                              }}
                              className="btn btn-danger btn-sm"
                              style={{ fontSize: '0.72rem' }}
                              title="Write off and dispose expired stock"
                            >
                              <Trash2 size={13} />
                              <span>Write Off</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => setSelectedBatchForClaim(b)}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.72rem' }}
                              title="Generate supplier return claim"
                            >
                              <FileSpreadsheet size={13} />
                              <span>Claim Return</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dispose Modal */}
      {selectedBatchForDispose && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--danger)' }}>
                Write Off Expired Stock
              </h3>
              <button onClick={() => setSelectedBatchForDispose(null)} className="btn btn-secondary btn-sm" style={{ padding: '0.3rem' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleDispose} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: 'var(--danger-light)', padding: '0.85rem', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontWeight: 700, color: 'var(--danger-text)' }}>{selectedBatchForDispose.brand_name} {selectedBatchForDispose.strength}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--danger-text)', marginTop: '0.2rem' }}>
                  Batch: <code>{selectedBatchForDispose.batch_number}</code> • Available: <strong>{selectedBatchForDispose.quantity} Units</strong>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Disposal Quantity (Units) *
                </label>
                <input
                  type="number"
                  min="1"
                  max={selectedBatchForDispose.quantity}
                  className="input"
                  value={disposeQty}
                  onChange={e => setDisposeQty(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Disposal / Write-off Reason
                </label>
                <input
                  className="input"
                  value={disposeReason}
                  onChange={e => setDisposeReason(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button type="button" onClick={() => setSelectedBatchForDispose(null)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-danger">
                  Confirm Disposal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supplier Return Claim Modal */}
      {selectedBatchForClaim && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                Generate Supplier Return Claim
              </h3>
              <button onClick={() => setSelectedBatchForClaim(null)} className="btn btn-secondary btn-sm" style={{ padding: '0.3rem' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateClaim} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: 'var(--bg-app)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700 }}>{selectedBatchForClaim.brand_name} {selectedBatchForClaim.strength}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  Supplier: <strong>{selectedBatchForClaim.supplier_name || 'Distributor'}</strong> • Batch: <code>{selectedBatchForClaim.batch_number}</code>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 700, marginTop: '0.2rem' }}>
                  Claim Value: Rs. {(selectedBatchForClaim.quantity * selectedBatchForClaim.purchase_price).toFixed(2)}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Claim Notes / Return Terms
                </label>
                <input
                  className="input"
                  value={claimNotes}
                  onChange={e => setClaimNotes(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button type="button" onClick={() => setSelectedBatchForClaim(null)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Submit Claim to Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

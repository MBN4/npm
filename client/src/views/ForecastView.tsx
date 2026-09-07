import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  X,
  Truck
} from 'lucide-react';

export const ForecastView: React.FC = () => {
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Filters
  const [lookbackDays, setLookbackDays] = useState<number>(30);
  const [leadTimeDays, setLeadTimeDays] = useState<number>(3);
  const [safetyDays, setSafetyDays] = useState<number>(7);
  const [statusFilter, setStatusFilter] = useState<string>('REORDERS_ONLY');

  // Selected for PO
  const [selectedItems, setSelectedItems] = useState<{ [id: number]: { quantity: number; medicineId: number } }>({});
  const [poModalData, setPoModalData] = useState<any>(null);

  const showNotification = (text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const fetchForecast = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/forecast/reorder-suggestions?lookbackDays=${lookbackDays}&leadTimeDays=${leadTimeDays}&safetyDays=${safetyDays}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);

        // Auto-select items needing reorder with their suggested quantity
        const initialSelected: { [id: number]: { quantity: number; medicineId: number } } = {};
        json.suggestions.forEach((s: any) => {
          if (['OUT_OF_STOCK', 'CRITICAL', 'REORDER_NEEDED'].includes(s.stockStatus)) {
            initialSelected[s.medicineId] = { quantity: s.suggestedQty, medicineId: s.medicineId };
          }
        });
        setSelectedItems(initialSelected);
      }
    } catch (err) {
      console.error('Failed to fetch forecast:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, lookbackDays, leadTimeDays, safetyDays]);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  const toggleItemSelection = (s: any) => {
    const updated = { ...selectedItems };
    if (updated[s.medicineId]) {
      delete updated[s.medicineId];
    } else {
      updated[s.medicineId] = { quantity: s.suggestedQty || s.packSize || 10, medicineId: s.medicineId };
    }
    setSelectedItems(updated);
  };

  const updateQuantity = (medicineId: number, qty: number) => {
    if (qty <= 0) return;
    setSelectedItems({
      ...selectedItems,
      [medicineId]: { quantity: qty, medicineId }
    });
  };

  const handleGeneratePo = async () => {
    const items = Object.values(selectedItems);
    if (items.length === 0) {
      showNotification('Please select at least one item to generate a Purchase Order.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/forecast/generate-po', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          items,
          notes: `Automated replenishment PO from ${lookbackDays}-day demand forecasting`
        })
      });

      if (res.ok) {
        const po = await res.json();
        setPoModalData(po);
        showNotification('Purchase Order generated successfully!', 'success');
      } else {
        const err = await res.json();
        showNotification(err.error || 'Failed to generate PO', 'error');
      }
    } catch (err) {
      showNotification('Network error generating PO', 'error');
    }
  };

  // Filtered list
  const filteredSuggestions = data?.suggestions.filter((s: any) => {
    if (statusFilter === 'REORDERS_ONLY') {
      return ['OUT_OF_STOCK', 'CRITICAL', 'REORDER_NEEDED'].includes(s.stockStatus);
    }
    if (statusFilter === 'OUT_OF_STOCK') return s.stockStatus === 'OUT_OF_STOCK';
    if (statusFilter === 'CRITICAL') return s.stockStatus === 'CRITICAL';
    if (statusFilter === 'HEALTHY') return s.stockStatus === 'HEALTHY';
    if (statusFilter === 'OVERSTOCKED') return s.stockStatus === 'OVERSTOCKED';
    return true;
  }) || [];

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Sparkles style={{ color: 'var(--primary)', width: '2rem', height: '2rem' }} />
            Demand Forecasting & Auto-Reordering Engine
            {isLoading && <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>Calculating...</span>}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Algorithm computes Average Daily Consumption (ADC), days of stock remaining, and auto-generates supplier POs
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            onClick={handleGeneratePo}
            disabled={Object.keys(selectedItems).length === 0}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}
          >
            <Truck size={18} /> Generate Draft PO ({Object.keys(selectedItems).length} items)
          </button>
        </div>
      </div>

      {/* Notification */}
      {statusMessage && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius)',
          background: statusMessage.type === 'success' ? '#065f46' : '#991b1b',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.9rem'
        }}>
          {statusMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* KPI Cards */}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ITEMS NEEDING REORDER</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: data.summary.totalItemsNeedingReorder > 0 ? 'var(--warning)' : 'var(--success)' }}>
              {data.summary.totalItemsNeedingReorder}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Below dynamic reorder point</div>
          </div>

          <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>OUT OF STOCK</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: data.summary.outOfStockCount > 0 ? 'var(--danger)' : 'var(--success)' }}>
              {data.summary.outOfStockCount}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Zero valid units on shelves</div>
          </div>

          <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CRITICAL STOCKOUT RISK</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: data.summary.criticalCount > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
              {data.summary.criticalCount}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Under {leadTimeDays} days buffer</div>
          </div>

          <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>HEALTHY BUFFER</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--success)' }}>
              {data.summary.healthyCount}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Adequate stock buffer</div>
          </div>
        </div>
      )}

      {/* Control Strip */}
      <div style={{
        background: 'var(--surface)',
        padding: '1rem',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
            <span>Lookback Window:</span>
            <select
              value={lookbackDays}
              onChange={(e) => setLookbackDays(Number(e.target.value))}
              className="input-field"
              style={{ width: '120px', padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
            >
              <option value="14">14 Days</option>
              <option value="30">30 Days</option>
              <option value="60">60 Days</option>
              <option value="90">90 Days</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
            <span>Lead Time:</span>
            <select
              value={leadTimeDays}
              onChange={(e) => setLeadTimeDays(Number(e.target.value))}
              className="input-field"
              style={{ width: '100px', padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
            >
              <option value="1">1 Day</option>
              <option value="2">2 Days</option>
              <option value="3">3 Days</option>
              <option value="5">5 Days</option>
              <option value="7">7 Days</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
            <span>Safety Stock:</span>
            <select
              value={safetyDays}
              onChange={(e) => setSafetyDays(Number(e.target.value))}
              className="input-field"
              style={{ width: '100px', padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
            >
              <option value="3">3 Days</option>
              <option value="7">7 Days</option>
              <option value="14">14 Days</option>
            </select>
          </div>
        </div>

        {/* Status Filter Tab Buttons */}
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--surface-hover)', padding: '0.2rem', borderRadius: 'var(--radius)' }}>
          <button
            onClick={() => setStatusFilter('REORDERS_ONLY')}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius)',
              border: 'none',
              background: statusFilter === 'REORDERS_ONLY' ? 'var(--primary)' : 'transparent',
              color: statusFilter === 'REORDERS_ONLY' ? '#fff' : 'var(--text-main)',
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            Reorders Only
          </button>
          <button
            onClick={() => setStatusFilter('ALL')}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius)',
              border: 'none',
              background: statusFilter === 'ALL' ? 'var(--primary)' : 'transparent',
              color: statusFilter === 'ALL' ? '#fff' : 'var(--text-main)',
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            All Medicines
          </button>
          <button
            onClick={() => setStatusFilter('OUT_OF_STOCK')}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius)',
              border: 'none',
              background: statusFilter === 'OUT_OF_STOCK' ? 'var(--danger)' : 'transparent',
              color: statusFilter === 'OUT_OF_STOCK' ? '#fff' : 'var(--text-main)',
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            Out of Stock
          </button>
        </div>
      </div>

      {/* Suggestions Table */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Forecast & Reorder List ({filteredSuggestions.length} items)</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.75rem 1rem', width: '40px' }}>SELECT</th>
                <th style={{ padding: '0.75rem 1rem' }}>MEDICINE</th>
                <th style={{ padding: '0.75rem 1rem' }}>SUPPLIER</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>CURRENT STOCK</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>ADC (UNITS/DAY)</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>DAYS OF STOCK</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>STATUS</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>SUGGESTED REORDER</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuggestions.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No items match the current filter.
                  </td>
                </tr>
              ) : (
                filteredSuggestions.map((item: any) => {
                  const isSelected = !!selectedItems[item.medicineId];
                  const orderQty = selectedItems[item.medicineId]?.quantity || item.suggestedQty || 10;

                  return (
                    <tr key={item.medicineId} style={{ borderBottom: '1px solid var(--border)', background: isSelected ? 'rgba(59, 130, 246, 0.05)' : 'transparent' }}>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleItemSelection(item)}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: '600' }}>{item.brandName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {item.strength} • {item.dosageForm} (Pack of {item.packSize})
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem' }}>
                        {item.supplierName}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 'bold', color: item.currentStock === 0 ? 'var(--danger)' : 'var(--text-main)' }}>
                        {item.currentStock}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        {item.adc}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <span style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontWeight: 'bold',
                          fontSize: '0.8rem',
                          background: item.daysOfStock <= 3 ? 'rgba(239, 68, 68, 0.15)' : item.daysOfStock <= 10 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                          color: item.daysOfStock <= 3 ? 'var(--danger)' : item.daysOfStock <= 10 ? 'var(--warning)' : 'var(--success)'
                        }}>
                          {item.daysOfStock >= 999 ? '999+' : `${item.daysOfStock}d`}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        <span style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          background: item.stockStatus === 'OUT_OF_STOCK'
                            ? 'rgba(239, 68, 68, 0.2)'
                            : item.stockStatus === 'CRITICAL'
                            ? 'rgba(245, 158, 11, 0.2)'
                            : item.stockStatus === 'REORDER_NEEDED'
                            ? 'rgba(59, 130, 246, 0.15)'
                            : 'rgba(16, 185, 129, 0.15)',
                          color: item.stockStatus === 'OUT_OF_STOCK'
                            ? 'var(--danger)'
                            : item.stockStatus === 'CRITICAL'
                            ? 'var(--warning)'
                            : item.stockStatus === 'REORDER_NEEDED'
                            ? 'var(--primary)'
                            : 'var(--success)'
                        }}>
                          {item.stockStatus}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        {isSelected ? (
                          <input
                            type="number"
                            min="1"
                            value={orderQty}
                            onChange={(e) => updateQuantity(item.medicineId, parseInt(e.target.value, 10) || 1)}
                            className="input-field"
                            style={{ width: '80px', textAlign: 'center', padding: '0.25rem 0.5rem', fontWeight: 'bold' }}
                          />
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>+{item.suggestedQty}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Draft PO Modal */}
      {poModalData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            width: '100%',
            maxWidth: '700px',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontWeight: 'bold', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileSpreadsheet size={20} style={{ color: 'var(--primary)' }} />
                  Draft Purchase Order #{poModalData.poNumber}
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Date: {poModalData.date} • {poModalData.items.length} lines</div>
              </div>
              <button onClick={() => setPoModalData(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--surface-hover)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)', fontSize: '0.9rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Supplier: </span>
                  <strong>{poModalData.supplier.name}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Estimated Investment: </span>
                  <strong style={{ color: 'var(--primary)' }}>Rs. {poModalData.totalEstimatedCost.toLocaleString()}</strong>
                </div>
              </div>

              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-hover)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '0.5rem 0.75rem' }}>ITEM</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>QTY</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>EST. UNIT COST</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>LINE TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poModalData.items.map((item: any) => (
                      <tr key={item.medicineId} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <div style={{ fontWeight: '600' }}>{item.brandName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.strength} • {item.dosageForm}</div>
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 'bold' }}>{item.quantity}</td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Rs. {item.estimatedUnitCost}</td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: '600' }}>Rs. {item.estimatedLineTotal.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button onClick={() => window.print()} className="btn btn-secondary">
                  Print PO Slip
                </button>
                <button onClick={() => setPoModalData(null)} className="btn btn-primary">
                  Close & Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

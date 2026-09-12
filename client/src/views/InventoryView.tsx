import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  Boxes,
  Ban,
  Clock,
  RefreshCw,
  SlidersHorizontal,
  History,
  X,
  PlusCircle,
  Pill,
  Calculator,
  Calendar,
  Sparkles,
  MapPin,
  Search,
  CheckCircle2
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
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Existing Medicines for Quick Selection
  const [medicinesList, setMedicinesList] = useState<any[]>([]);

  // Adjustment Modal State
  const [selectedBatch, setSelectedBatch] = useState<BatchItem | null>(null);
  const [newQty, setNewQty] = useState<string>('');
  const [adjustReason, setAdjustReason] = useState<string>('Physical count verification');
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);

  // Manual Medicine & Stock Entry Modal State
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [entryMode, setEntryMode] = useState<'new_med' | 'existing_med'>('new_med');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form State
  const [selectedMedId, setSelectedMedId] = useState<string>('');
  const [brandName, setBrandName] = useState('');
  const [genericName, setGenericName] = useState('');
  const [manufacturerName, setManufacturerName] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [dosageForm, setDosageForm] = useState('Tablet');
  const [strength, setStrength] = useState('');
  const [rackLocation, setRackLocation] = useState('Rack A-01');
  const [barcode, setBarcode] = useState('');

  // Batch & Packaging State
  const [batchNumber, setBatchNumber] = useState('');
  const [mfgDate, setMfgDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [packSize, setPackSize] = useState<string>('10'); // Tablets/units per pack
  const [packsReceived, setPacksReceived] = useState<string>('5'); // Number of whole packs
  const [bonusQuantity, setBonusQuantity] = useState<string>('0');

  // Pricing State
  const [packPurchasePrice, setPackPurchasePrice] = useState<string>('300'); // Rate per pack
  const [unitPurchasePrice, setUnitPurchasePrice] = useState<string>('30.00'); // Rate per tablet
  const [packSalePrice, setPackSalePrice] = useState<string>('400'); // MRP per whole pack
  const [unitSalePrice, setUnitSalePrice] = useState<string>('40.00'); // MRP per individual tablet
  const [discountPercent, setDiscountPercent] = useState<string>('0');
  const [notes, setNotes] = useState('');

  const fetchInventoryData = async () => {
    setIsLoading(true);
    try {
      const [batchRes, valRes, movRes, medRes] = await Promise.all([
        fetch('/api/inventory/batches', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/inventory/valuation', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/inventory/movements?limit=40', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/medicines?limit=100', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (batchRes.ok) setBatches((await batchRes.json()).batches || []);
      if (valRes.ok) setValuation((await valRes.json()).valuation || null);
      if (movRes.ok) setMovements((await movRes.json()).movements || []);
      if (medRes.ok) setMedicinesList((await medRes.json()).medicines || []);
    } catch (err) {
      console.error('Error fetching inventory:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInventoryData();
  }, [token]);

  // Handle auto batch generation
  const handleAutoBatch = () => {
    const yr = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    setBatchNumber(`BN-${yr}-${rand}`);
  };

  // Handle auto barcode generation
  const handleAutoBarcode = () => {
    const rand = Math.floor(100000 + Math.random() * 900000);
    setBarcode(`NMP-${rand}`);
  };

  // Quick expiry buttons
  const setQuickExpiry = (yearsToAdd: number) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + yearsToAdd);
    setExpiryDate(d.toISOString().split('T')[0]);
  };

  // Recompute prices and units when packSize, packsReceived, or pack prices change
  const numericPackSize = Math.max(1, Number(packSize) || 1);
  const numericPacks = Math.max(0, Number(packsReceived) || 0);
  const numericBonus = Math.max(0, Number(bonusQuantity) || 0);
  const totalSellableUnits = (numericPacks * numericPackSize) + numericBonus;

  const handlePackPurchaseChange = (val: string) => {
    setPackPurchasePrice(val);
    const pVal = Number(val);
    if (!isNaN(pVal) && pVal > 0) {
      setUnitPurchasePrice((pVal / numericPackSize).toFixed(2));
    }
  };

  const handleUnitPurchaseChange = (val: string) => {
    setUnitPurchasePrice(val);
    const uVal = Number(val);
    if (!isNaN(uVal) && uVal > 0) {
      setPackPurchasePrice((uVal * numericPackSize).toFixed(2));
    }
  };

  const handlePackSaleChange = (val: string) => {
    setPackSalePrice(val);
    const pVal = Number(val);
    if (!isNaN(pVal) && pVal > 0) {
      setUnitSalePrice((pVal / numericPackSize).toFixed(2));
    }
  };

  const handleUnitSaleChange = (val: string) => {
    setUnitSalePrice(val);
  };

  // Discount and Margin Calculations
  const numericPackCost = Number(packPurchasePrice) || 0;
  const numericPackMRP = Number(packSalePrice) || 0;
  const numericDiscount = Number(discountPercent) || 0;

  const discountedPackPrice = numericPackMRP * (1 - (numericDiscount / 100));
  const discountedUnitPrice = (Number(unitSalePrice) || 0) * (1 - (numericDiscount / 100));
  const packGrossProfit = discountedPackPrice - numericPackCost;
  const profitMarginPercent = numericPackCost > 0 ? ((packGrossProfit / numericPackCost) * 100).toFixed(1) : '0';

  // Handle Medicine selection for existing medicine mode
  const handleSelectExistingMed = (medId: string) => {
    setSelectedMedId(medId);
    if (!medId) return;
    const med = medicinesList.find(m => String(m.id) === medId);
    if (med) {
      setBrandName(med.brand_name);
      setStrength(med.strength || '');
      setDosageForm(med.dosage_form || 'Tablet');
      setPackSize(String(med.pack_size || 10));
      setRackLocation(med.rack_location || 'Rack A-01');
      if (med.barcode) setBarcode(med.barcode);
    }
  };

  // Save manual medicine and batch stock
  const handleSaveDirectStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setModalLoading(true);

    try {
      const payload: any = {
        batchNumber,
        mfgDate: mfgDate || null,
        expiryDate,
        packSize: numericPackSize,
        packsReceived: numericPacks,
        bonusQuantity: numericBonus,
        packPurchasePrice: Number(packPurchasePrice) || 0,
        unitPurchasePrice: Number(unitPurchasePrice) || 0,
        packSalePrice: Number(packSalePrice) || 0,
        unitSalePrice: Number(unitSalePrice) || 0,
        discountPercent: numericDiscount,
        rackLocation,
        notes
      };

      if (entryMode === 'existing_med' && selectedMedId) {
        payload.medicineId = Number(selectedMedId);
      } else {
        payload.brandName = brandName.trim();
        payload.genericName = genericName.trim();
        payload.manufacturerName = manufacturerName.trim();
        payload.categoryName = categoryName.trim();
        payload.dosageForm = dosageForm;
        payload.strength = strength.trim();
        payload.barcode = barcode ? barcode.trim() : null;
      }

      const res = await fetch('/api/inventory/direct-entry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to register medicine and stock');
      }

      setAdjustSuccess(`Successfully added stock for ${brandName || 'Medicine'} (${totalSellableUnits} units in batch ${batchNumber}).`);
      setShowAddStockModal(false);
      // Reset form
      setBrandName('');
      setGenericName('');
      setBatchNumber('');
      fetchInventoryData();
    } catch (err: any) {
      setModalError(err.message || 'Error creating manual stock');
    } finally {
      setModalLoading(false);
    }
  };

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
    const matchesSearch = !searchQuery.trim() || 
      b.brand_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.batch_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.barcode && b.barcode.includes(searchQuery.trim())) ||
      (b.medicine_rack && b.medicine_rack.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (activeTab === 'near_expiry') return b.computed_expiry_status === 'NEAR_EXPIRY';
    if (activeTab === 'expired') return b.computed_expiry_status === 'EXPIRED';
    return true;
  });

  return (
    <div className="page-container">
      {/* Top Header & Quick Action Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>Batch Inventory & Stock Control</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            FEFO Stock Tracking • Pack & Unit Pricing • Physical Count Reconciliation
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {hasPermission('manage_inventory') && (
            <button
              onClick={() => {
                setShowAddStockModal(true);
                handleAutoBatch();
                setQuickExpiry(2);
              }}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.55rem 1rem', fontWeight: 700 }}
            >
              <PlusCircle size={16} />
              <span>+ Add Medicine & Stock Manually</span>
            </button>
          )}

          <button onClick={fetchInventoryData} className="btn btn-secondary btn-sm" disabled={isLoading} style={{ height: '36px' }}>
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {adjustSuccess && (
        <div style={{ padding: '0.75rem 1rem', background: 'var(--success-light)', color: 'var(--success-text)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
          <CheckCircle2 size={16} />
          <span>{adjustSuccess}</span>
        </div>
      )}

      {/* Valuation Metric Cards */}
      {valuation && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          <div className="card" style={{ padding: '1rem 1.25rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>TOTAL STOCK UNITS</span>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.2rem', color: 'var(--text-primary)' }}>
              {valuation.total_units} Units
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Across {valuation.total_products_in_stock} unique products
            </div>
          </div>

          <div className="card" style={{ padding: '1rem 1.25rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>PURCHASE VALUATION (COST)</span>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
              Rs. {Number(valuation.total_purchase_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Total acquisition investment
            </div>
          </div>

          <div className="card" style={{ padding: '1rem 1.25rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>ACTIVE RETAIL MRP VALUE</span>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.2rem' }}>
              Rs. {Number(valuation.active_retail_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Valid non-expired shelf stock
            </div>
          </div>

          <div className="card" style={{ padding: '1rem 1.25rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>PROJECTED GROSS PROFIT</span>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success)', marginTop: '0.2rem' }}>
              Rs. {Number(valuation.projected_gross_profit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Expected Margin: <strong>{valuation.margin_percent}%</strong>
            </div>
          </div>
        </div>
      )}

      {/* Tabs & Search Bar Strip */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('all')}
            className={`btn ${activeTab === 'all' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          >
            <Boxes size={14} />
            <span>All Batches ({batches.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('near_expiry')}
            className={`btn ${activeTab === 'near_expiry' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          >
            <Clock size={14} />
            <span>Near Expiry 90d ({batches.filter(b => b.computed_expiry_status === 'NEAR_EXPIRY').length})</span>
          </button>
          <button
            onClick={() => setActiveTab('expired')}
            className={`btn ${activeTab === 'expired' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          >
            <Ban size={14} />
            <span>Expired ({batches.filter(b => b.computed_expiry_status === 'EXPIRED').length})</span>
          </button>
          <button
            onClick={() => setActiveTab('movements')}
            className={`btn ${activeTab === 'movements' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          >
            <History size={14} />
            <span>Movement Ledger ({movements.length})</span>
          </button>
        </div>

        {activeTab !== 'movements' && (
          <div style={{ position: 'relative', width: '260px' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input input-sm"
              style={{ paddingLeft: '2rem', height: '32px', fontSize: '0.78rem' }}
              placeholder="Search Brand, Batch, Rack..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      {activeTab !== 'movements' ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Medicine Product</th>
                  <th>Batch / Lot #</th>
                  <th>Expiry Date</th>
                  <th>Days Left</th>
                  <th>Purchase Cost</th>
                  <th>Unit MRP</th>
                  <th>Gross Margin</th>
                  <th>Stock Units</th>
                  <th>Shelf Rack</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBatches.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                      No matching inventory batches found.
                    </td>
                  </tr>
                ) : (
                  filteredBatches.map(b => {
                    const isExpired = b.computed_expiry_status === 'EXPIRED';
                    const isNear = b.computed_expiry_status === 'NEAR_EXPIRY';

                    return (
                      <tr key={b.id} style={{ backgroundColor: isExpired ? 'rgba(239, 68, 68, 0.04)' : undefined }}>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{b.brand_name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {b.dosage_form} • {b.strength || 'Standard'}
                          </div>
                        </td>
                        <td>
                          <code style={{ fontWeight: 700, backgroundColor: 'var(--bg-app)', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border)' }}>
                            {b.batch_number}
                          </code>
                        </td>
                        <td>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{b.expiry_date}</div>
                          <span className={`badge ${isExpired ? 'badge-danger' : isNear ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: '0.62rem', marginTop: '2px' }}>
                            {isExpired ? 'EXPIRED' : isNear ? 'NEAR EXPIRY' : 'ACTIVE FEFO'}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.82rem', fontWeight: isExpired ? 700 : 500, color: isExpired ? 'var(--danger)' : isNear ? 'var(--warning)' : 'inherit' }}>
                            {isExpired ? `${Math.abs(b.days_to_expiry)}d ago` : `${b.days_to_expiry} days`}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>Rs. {Number(b.purchase_price).toFixed(2)}</td>
                        <td style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>Rs. {Number(b.sale_price).toFixed(2)}</td>
                        <td>
                          <span className="badge badge-primary" style={{ fontSize: '0.68rem' }}>
                            {b.margin_percent}%
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.95rem', fontWeight: 800, color: isExpired ? 'var(--danger)' : 'var(--text-primary)' }}>
                            {b.quantity}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {b.medicine_rack ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                              <MapPin size={11} />
                              {b.medicine_rack}
                            </span>
                          ) : '—'}
                        </td>
                        <td>
                          {hasPermission('adjust_stock') && (
                            <button
                              onClick={() => handleOpenAdjustment(b)}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                              <SlidersHorizontal size={12} />
                              <span>Adjust</span>
                            </button>
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
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
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
                  <th>User</th>
                </tr>
              </thead>
              <tbody>
                {movements.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
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
                    <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.reference_id || '—'}</td>
                    <td style={{ fontSize: '0.78rem' }}>{m.notes || '—'}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{m.user_name || 'System'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* COMPREHENSIVE MANUAL MEDICINE & BATCH STOCK ENTRY MODAL                   */}
      {/* ========================================================================= */}
      {showAddStockModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '720px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            {/* Modal Header */}
            <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-app)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '8px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PlusCircle size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Manual Medicine & Stock Entry</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Add new products, packaging pack sizes, unit rates, and initial batch stock
                  </p>
                </div>
              </div>

              <button onClick={() => setShowAddStockModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.3rem' }}>
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
              {modalError && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--danger-light)', color: 'var(--danger-text)', borderRadius: 'var(--radius-md)', fontSize: '0.82rem' }}>
                  {modalError}
                </div>
              )}

              {/* Mode Toggle: Create New vs Link Existing */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', padding: '0.3rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <button
                  type="button"
                  onClick={() => setEntryMode('new_med')}
                  style={{
                    flex: 1,
                    padding: '0.45rem',
                    borderRadius: '6px',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    backgroundColor: entryMode === 'new_med' ? 'var(--primary)' : 'transparent',
                    color: entryMode === 'new_med' ? '#fff' : 'var(--text-secondary)'
                  }}
                >
                  Create Brand New Medicine Master
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode('existing_med')}
                  style={{
                    flex: 1,
                    padding: '0.45rem',
                    borderRadius: '6px',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    backgroundColor: entryMode === 'existing_med' ? 'var(--primary)' : 'transparent',
                    color: entryMode === 'existing_med' ? '#fff' : 'var(--text-secondary)'
                  }}
                >
                  Add Batch to Existing Medicine
                </button>
              </div>

              <form id="direct-stock-form" onSubmit={handleSaveDirectStock} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* SECTION 1: MEDICINE MASTER DETAILS */}
                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase' }}>
                    <Pill size={14} />
                    <span>1. Medicine Master Information</span>
                  </div>

                  {entryMode === 'existing_med' ? (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                        Select Existing Medicine *
                      </label>
                      <select
                        className="select"
                        value={selectedMedId}
                        onChange={e => handleSelectExistingMed(e.target.value)}
                        required
                      >
                        <option value="">-- Choose registered medicine from catalog --</option>
                        {medicinesList.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.brand_name} {m.strength} ({m.dosage_form}) • Rack: {m.rack_location || 'N/A'} • Pack: {m.pack_size} units
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                      <div style={{ gridColumn: 'span 2' }}>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                          Brand Trade Name *
                        </label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. Panadol Extra, Augmentin, Brufen"
                          value={brandName}
                          onChange={e => setBrandName(e.target.value)}
                          required
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                          Active Generic Molecule
                        </label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. Paracetamol + Caffeine"
                          value={genericName}
                          onChange={e => setGenericName(e.target.value)}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                          Strength / Potency
                        </label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. 500mg/65mg, 10mg/5ml"
                          value={strength}
                          onChange={e => setStrength(e.target.value)}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                          Dosage Form
                        </label>
                        <select
                          className="select"
                          value={dosageForm}
                          onChange={e => setDosageForm(e.target.value)}
                        >
                          <option value="Tablet">Tablet</option>
                          <option value="Capsule">Capsule</option>
                          <option value="Syrup">Syrup / Suspension</option>
                          <option value="Injection">Injection (Vial/Ampoule)</option>
                          <option value="Cream">Cream / Ointment</option>
                          <option value="Drops">Eye / Ear Drops</option>
                          <option value="Inhaler">Inhaler / Respules</option>
                          <option value="Sachet">Sachet / Powder</option>
                          <option value="Infusion">IV Infusion</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                          Manufacturer / Brand Company
                        </label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. GSK, Getz, Searle, Abbott"
                          value={manufacturerName}
                          onChange={e => setManufacturerName(e.target.value)}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                          Therapeutic Category
                        </label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. Antibiotics, Pain Relief, Cardiology"
                          value={categoryName}
                          onChange={e => setCategoryName(e.target.value)}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                          Shelf / Rack Location
                        </label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. Rack A-02, Fridge 01"
                          value={rackLocation}
                          onChange={e => setRackLocation(e.target.value)}
                        />
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                            Barcode (EAN-13 or Custom)
                          </label>
                          <button
                            type="button"
                            onClick={handleAutoBarcode}
                            style={{ border: 'none', background: 'none', color: 'var(--primary)', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                          >
                            <Sparkles size={11} />
                            <span>Auto Generate</span>
                          </button>
                        </div>
                        <input
                          type="text"
                          className="input"
                          placeholder="Scan box or generate NMP-XXXX"
                          value={barcode}
                          onChange={e => setBarcode(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* SECTION 2: BATCH & EXPIRY DETAILS */}
                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase' }}>
                    <Calendar size={14} />
                    <span>2. Batch Number & Expiration Control</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Batch / Lot Number *</label>
                        <button
                          type="button"
                          onClick={handleAutoBatch}
                          style={{ border: 'none', background: 'none', color: 'var(--primary)', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Auto Generate
                        </button>
                      </div>
                      <input
                        type="text"
                        className="input"
                        placeholder="e.g. BN-2026-99"
                        value={batchNumber}
                        onChange={e => setBatchNumber(e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Manufacturing Date (Optional)
                      </label>
                      <input
                        type="date"
                        className="input"
                        value={mfgDate}
                        onChange={e => setMfgDate(e.target.value)}
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Expiry Date *</label>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button type="button" onClick={() => setQuickExpiry(1)} className="badge badge-primary" style={{ cursor: 'pointer', border: 'none' }}>+1y</button>
                          <button type="button" onClick={() => setQuickExpiry(2)} className="badge badge-primary" style={{ cursor: 'pointer', border: 'none' }}>+2y</button>
                          <button type="button" onClick={() => setQuickExpiry(3)} className="badge badge-primary" style={{ cursor: 'pointer', border: 'none' }}>+3y</button>
                        </div>
                      </div>
                      <input
                        type="date"
                        className="input"
                        value={expiryDate}
                        onChange={e => setExpiryDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* SECTION 3: PACKAGING, TABLET PRICING & REAL-TIME DISCOUNT CALCULATOR */}
                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase' }}>
                    <Calculator size={14} />
                    <span>3. Packaging, Pack vs. Individual Tablet Pricing & Discounts</span>
                  </div>

                  {/* Quantity & Pack Configuration */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Pack Size (Tablets/Units per Box) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        className="input"
                        placeholder="e.g. 10 or 20"
                        value={packSize}
                        onChange={e => {
                          setPackSize(e.target.value);
                          const pSize = Math.max(1, Number(e.target.value) || 1);
                          if (packPurchasePrice) setUnitPurchasePrice((Number(packPurchasePrice) / pSize).toFixed(2));
                          if (packSalePrice) setUnitSalePrice((Number(packSalePrice) / pSize).toFixed(2));
                        }}
                        required
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Packs Quantity Received (Boxes) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        className="input"
                        placeholder="e.g. 5"
                        value={packsReceived}
                        onChange={e => setPacksReceived(e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Bonus Units / Loose (Optional)
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="input"
                        placeholder="0"
                        value={bonusQuantity}
                        onChange={e => setBonusQuantity(e.target.value)}
                      />
                    </div>

                    {/* Total Units Computed Card */}
                    <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Sellable Units</span>
                      <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--primary)' }}>
                        {totalSellableUnits} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Tablets/Units</span>
                      </span>
                    </div>
                  </div>

                  {/* Pricing Inputs */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Pack Purchase Cost (Rs./Box) *
                      </label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rs.</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="input"
                          style={{ paddingLeft: '2.2rem' }}
                          placeholder="300.00"
                          value={packPurchasePrice}
                          onChange={e => handlePackPurchaseChange(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Unit Purchase Cost (Rs./Tablet)
                      </label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rs.</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="input"
                          style={{ paddingLeft: '2.2rem' }}
                          placeholder="30.00"
                          value={unitPurchasePrice}
                          onChange={e => handleUnitPurchaseChange(e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Pack Sale MRP (Whole Box Rs.) *
                      </label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rs.</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          className="input"
                          style={{ paddingLeft: '2.2rem' }}
                          placeholder="400.00"
                          value={packSalePrice}
                          onChange={e => handlePackSaleChange(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        Individual Tablet MRP (Rs./Unit) *
                      </label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rs.</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          className="input"
                          style={{ paddingLeft: '2.2rem' }}
                          placeholder="40.00"
                          value={unitSalePrice}
                          onChange={e => handleUnitSaleChange(e.target.value)}
                          required
                        />
                      </div>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        Can differ from pack rate for loose sale
                      </span>
                    </div>
                  </div>

                  {/* Discount & Profit Math Display */}
                  <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', alignItems: 'center' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                        Default Discount %
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          className="input input-sm"
                          style={{ width: '80px', height: '30px', fontSize: '0.8rem' }}
                          value={discountPercent}
                          onChange={e => setDiscountPercent(e.target.value)}
                        />
                        <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>%</span>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Net Pack Price</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        Rs. {discountedPackPrice.toFixed(2)}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Net Unit Price</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        Rs. {discountedUnitPrice.toFixed(2)}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Gross Profit Margin</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: Number(profitMarginPercent) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        +{profitMarginPercent}% (Rs. {packGrossProfit.toFixed(2)}/box)
                      </div>
                    </div>
                  </div>
                </div>

                {/* Optional Notes */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Reference Notes / Inward Remark (Optional)
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Direct distributor sample, physical opening stock"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-app)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowAddStockModal(false)}
                className="btn btn-secondary"
                disabled={modalLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="direct-stock-form"
                className="btn btn-primary"
                disabled={modalLoading}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}
              >
                {modalLoading ? (
                  <>
                    <div style={{ width: '14px', height: '14px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <span>Saving to Inventory...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Save Medicine & Stock Batch</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PHYSICAL COUNT ADJUSTMENT MODAL                                           */}
      {/* ========================================================================= */}
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

import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { TherapeuticCategorySelect } from '../components/TherapeuticCategorySelect.js';
import { StrengthInput } from '../components/StrengthInput.js';
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
  CheckCircle2,
  Package,
  Layers
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

  const [medicinesList, setMedicinesList] = useState<any[]>([]);

  const [selectedBatch, setSelectedBatch] = useState<BatchItem | null>(null);
  const [newQty, setNewQty] = useState<string>('');
  const [adjustReason, setAdjustReason] = useState<string>('Physical count verification');
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);

  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [entryMode, setEntryMode] = useState<'new_med' | 'existing_med'>('new_med');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [selectedMedId, setSelectedMedId] = useState<string>('');
  const [brandName, setBrandName] = useState('');
  const [genericName, setGenericName] = useState('');
  const [manufacturerName, setManufacturerName] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [dosageForm, setDosageForm] = useState('Tablet');
  const [strength, setStrength] = useState('');
  const [rackLocation, setRackLocation] = useState('Rack A-01');
  const [barcode, setBarcode] = useState('');

  const [batchNumber, setBatchNumber] = useState('');
  const [mfgDate, setMfgDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  const [packsPerBox, setPacksPerBox] = useState<string>('10');
  const [tabletsPerPack, setTabletsPerPack] = useState<string>('10');
  const [boxesReceived, setBoxesReceived] = useState<string>('5');
  const [bonusQuantity, setBonusQuantity] = useState<string>('0');

  const [boxPurchasePrice, setBoxPurchasePrice] = useState<string>('300.00');
  const [packPurchasePrice, setPackPurchasePrice] = useState<string>('30.00');
  const [tabletPurchasePrice, setTabletPurchasePrice] = useState<string>('3.00');

  const [boxSalePrice, setBoxSalePrice] = useState<string>('400.00');
  const [boxDiscountPercent, setBoxDiscountPercent] = useState<string>('0');

  const [packSalePrice, setPackSalePrice] = useState<string>('40.00');
  const [packDiscountPercent, setPackDiscountPercent] = useState<string>('0');

  const [tabletSalePrice, setTabletSalePrice] = useState<string>('4.50');
  const [tabletDiscountPercent, setTabletDiscountPercent] = useState<string>('0');
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
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInventoryData();
  }, [token]);

  const handleAutoBatch = () => {
    const yr = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    setBatchNumber(`BN-${yr}-${rand}`);
  };

  const handleAutoBarcode = () => {
    const rand = Math.floor(100000 + Math.random() * 900000);
    setBarcode(`NMP-${rand}`);
  };

  const setQuickExpiry = (yearsToAdd: number) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + yearsToAdd);
    setExpiryDate(d.toISOString().split('T')[0]);
  };

  const numPacksPerBox = Math.max(1, Number(packsPerBox) || 1);
  const numTabletsPerPack = Math.max(1, Number(tabletsPerPack) || 1);
  const totalTabletsPerBox = numPacksPerBox * numTabletsPerPack;

  const numBoxes = Math.max(0, Number(boxesReceived) || 0);
  const numBonus = Math.max(0, Number(bonusQuantity) || 0);

  const totalPacksReceived = numBoxes * numPacksPerBox;
  const totalSellableTablets = (numBoxes * totalTabletsPerBox) + numBonus;

  const handlePacksPerBoxChange = (val: string) => {
    setPacksPerBox(val);
    const pBox = Math.max(1, Number(val) || 1);
    const boxCost = Number(boxPurchasePrice) || 0;
    if (boxCost > 0) {
      setPackPurchasePrice((boxCost / pBox).toFixed(2));
      setTabletPurchasePrice((boxCost / (pBox * numTabletsPerPack)).toFixed(2));
    }
    const boxMRP = Number(boxSalePrice) || 0;
    if (boxMRP > 0) {
      const pMRP = boxMRP / pBox;
      setPackSalePrice(pMRP.toFixed(2));
      setTabletSalePrice((pMRP / numTabletsPerPack).toFixed(2));
    }
  };

  const handleTabletsPerPackChange = (val: string) => {
    setTabletsPerPack(val);
    const tPack = Math.max(1, Number(val) || 1);
    const pCost = Number(packPurchasePrice) || 0;
    if (pCost > 0) {
      setTabletPurchasePrice((pCost / tPack).toFixed(2));
    }
    const pMRP = Number(packSalePrice) || 0;
    if (pMRP > 0) {
      setTabletSalePrice((pMRP / tPack).toFixed(2));
    }
  };

  const handleBoxPurchaseCostChange = (val: string) => {
    setBoxPurchasePrice(val);
    const bCost = Number(val) || 0;
    if (bCost >= 0) {
      const pCost = bCost / numPacksPerBox;
      setPackPurchasePrice(pCost.toFixed(2));
      setTabletPurchasePrice((pCost / numTabletsPerPack).toFixed(2));
    }
  };

  const handlePackPurchaseCostChange = (val: string) => {
    setPackPurchasePrice(val);
    const pCost = Number(val) || 0;
    if (pCost >= 0) {
      setBoxPurchasePrice((pCost * numPacksPerBox).toFixed(2));
      setTabletPurchasePrice((pCost / numTabletsPerPack).toFixed(2));
    }
  };

  const handleTabletPurchaseCostChange = (val: string) => {
    setTabletPurchasePrice(val);
    const tCost = Number(val) || 0;
    if (tCost >= 0) {
      setPackPurchasePrice((tCost * numTabletsPerPack).toFixed(2));
      setBoxPurchasePrice((tCost * totalTabletsPerBox).toFixed(2));
    }
  };

  const handleBoxSaleMRPChange = (val: string) => {
    setBoxSalePrice(val);
    const bMRP = Number(val) || 0;
    if (bMRP >= 0) {
      const pMRP = bMRP / numPacksPerBox;
      setPackSalePrice(pMRP.toFixed(2));
      setTabletSalePrice((pMRP / numTabletsPerPack).toFixed(2));
    }
  };

  const handlePackSaleMRPChange = (val: string) => {
    setPackSalePrice(val);
    const pMRP = Number(val) || 0;
    if (pMRP >= 0) {
      setBoxSalePrice((pMRP * numPacksPerBox).toFixed(2));
      setTabletSalePrice((pMRP / numTabletsPerPack).toFixed(2));
    }
  };

  const handleTabletSaleMRPChange = (val: string) => {
    setTabletSalePrice(val);
  };

  const numBoxCost = Number(boxPurchasePrice) || 0;
  const numBoxMRP = Number(boxSalePrice) || 0;
  const numBoxDiscount = Number(boxDiscountPercent) || 0;
  const netBoxPrice = numBoxMRP * (1 - (numBoxDiscount / 100));
  const boxProfit = netBoxPrice - numBoxCost;
  const boxMarginPercent = numBoxCost > 0 ? ((boxProfit / numBoxCost) * 100).toFixed(1) : '0';

  const numPackCost = Number(packPurchasePrice) || 0;
  const numPackMRP = Number(packSalePrice) || 0;
  const numPackDiscount = Number(packDiscountPercent) || 0;
  const netPackPrice = numPackMRP * (1 - (numPackDiscount / 100));
  const packProfit = netPackPrice - numPackCost;
  const packMarginPercent = numPackCost > 0 ? ((packProfit / numPackCost) * 100).toFixed(1) : '0';

  const numTabletCost = Number(tabletPurchasePrice) || 0;
  const numTabletMRP = Number(tabletSalePrice) || 0;
  const numTabletDiscount = Number(tabletDiscountPercent) || 0;
  const netTabletPrice = numTabletMRP * (1 - (numTabletDiscount / 100));
  const tabletProfit = netTabletPrice - numTabletCost;
  const tabletMarginPercent = numTabletCost > 0 ? ((tabletProfit / numTabletCost) * 100).toFixed(1) : '0';

  const handleSelectExistingMed = (medId: string) => {
    setSelectedMedId(medId);
    if (!medId) return;
    const med = medicinesList.find(m => String(m.id) === medId);
    if (med) {
      setBrandName(med.brand_name);
      setStrength(med.strength || '');
      setDosageForm(med.dosage_form || 'Tablet');
      const pSize = Number(med.pack_size || 100);
      if (pSize >= 10 && pSize % 10 === 0) {
        setPacksPerBox('10');
        setTabletsPerPack(String(pSize / 10));
      } else {
        setPacksPerBox('1');
        setTabletsPerPack(String(pSize));
      }
      setRackLocation(med.rack_location || 'Rack A-01');
      if (med.barcode) setBarcode(med.barcode);
    }
  };

  const handleSaveDirectStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setModalLoading(true);

    try {
      const payload: any = {
        batchNumber,
        mfgDate: mfgDate || null,
        expiryDate,
        packSize: totalTabletsPerBox,
        packsReceived: numBoxes,
        bonusQuantity: numBonus,
        packPurchasePrice: numBoxCost,
        unitPurchasePrice: numTabletCost,
        packSalePrice: numBoxMRP,
        unitSalePrice: numTabletMRP,
        discountPercent: numBoxDiscount,
        rackLocation,
        notes: notes ? `${notes} | PackMRP: ${numPackMRP}, PackCost: ${numPackCost}` : `PackMRP: ${numPackMRP}, PackCost: ${numPackCost}`
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

      setAdjustSuccess(`Successfully added stock for ${brandName || 'Medicine'} (${totalSellableTablets} tablets across ${numBoxes} boxes in batch ${batchNumber}).`);
      setShowAddStockModal(false);
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
      setAdjustError('Negative stock is strictly prohibited');
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>Batch Inventory & Stock Control</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            FEFO Stock Tracking • 3-Level Packaging (Tablet → Pack → Box) • Physical Count Verification
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
              style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.55rem 1.1rem', fontWeight: 700 }}
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
                  <th>Tablet Cost</th>
                  <th>Tablet MRP</th>
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

      {showAddStockModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '800px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-app)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PlusCircle size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Manual Medicine & Stock Entry</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Standard 3-Tier Hierarchy: Tablet / Unit → Pack (Strip) → Box (Carton)
                  </p>
                </div>
              </div>

              <button onClick={() => setShowAddStockModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.35rem' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
              {modalError && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--danger-light)', color: 'var(--danger-text)', borderRadius: 'var(--radius-md)', fontSize: '0.82rem' }}>
                  {modalError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', padding: '0.3rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <button
                  type="button"
                  onClick={() => setEntryMode('new_med')}
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.82rem',
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
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    backgroundColor: entryMode === 'existing_med' ? 'var(--primary)' : 'transparent',
                    color: entryMode === 'existing_med' ? '#fff' : 'var(--text-secondary)'
                  }}
                >
                  Add Batch to Existing Medicine
                </button>
              </div>

              <form id="direct-stock-form" onSubmit={handleSaveDirectStock} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ padding: '1.1rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase' }}>
                    <Pill size={15} />
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
                            {m.brand_name} {m.strength} ({m.dosage_form}) • Rack: {m.rack_location || 'N/A'} • Box Pack: {m.pack_size} units
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
                      <div style={{ gridColumn: 'span 2' }}>
                        <div style={{ display: 'flex', alignItems: 'center', minHeight: '24px', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Brand Trade Name *
                          </label>
                        </div>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. Panadol, Augmentin, Synflex, Sunflex"
                          value={brandName}
                          onChange={e => setBrandName(e.target.value)}
                          required
                        />
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', minHeight: '24px', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Active Generic Molecule
                          </label>
                        </div>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. Paracetamol, Naproxen Sodium"
                          value={genericName}
                          onChange={e => setGenericName(e.target.value)}
                        />
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', minHeight: '24px', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Strength / Potency
                          </label>
                        </div>
                        <StrengthInput
                          value={strength}
                          onChange={val => setStrength(val)}
                          placeholder="e.g. 500mg, 550mg, 10mg/5ml..."
                        />
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', minHeight: '24px', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Dosage Form
                          </label>
                        </div>
                        <select
                          className="select"
                          value={dosageForm}
                          onChange={e => setDosageForm(e.target.value)}
                        >
                          <option value="Tablet">Tablet</option>
                          <option value="Capsule">Capsule</option>
                          <option value="Syrup">Syrup / Suspension</option>
                          <option value="Injection">Injection</option>
                          <option value="Cream">Cream / Ointment</option>
                          <option value="Drops">Eye / Ear Drops</option>
                          <option value="Inhaler">Inhaler / Respules</option>
                          <option value="Sachet">Sachet / Powder</option>
                        </select>
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', minHeight: '24px', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Manufacturer / Pharma Company
                          </label>
                        </div>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. Searle, GSK, Getz, Abbott"
                          value={manufacturerName}
                          onChange={e => setManufacturerName(e.target.value)}
                        />
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', minHeight: '24px', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Therapeutic Category
                          </label>
                        </div>
                        <TherapeuticCategorySelect
                          value={categoryName}
                          onChange={val => setCategoryName(val)}
                          placeholder="Select or search category..."
                        />
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', minHeight: '24px', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Shelf / Rack Location
                          </label>
                        </div>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. Rack A-04, Fridge 01"
                          value={rackLocation}
                          onChange={e => setRackLocation(e.target.value)}
                        />
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '24px', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Barcode (EAN-13 or Custom)
                          </label>
                          <button
                            type="button"
                            onClick={handleAutoBarcode}
                            style={{ border: 'none', background: 'none', color: 'var(--primary)', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', whiteSpace: 'nowrap' }}
                          >
                            <Sparkles size={11} />
                            <span>Auto Generate</span>
                          </button>
                        </div>
                        <input
                          type="text"
                          className="input"
                          placeholder="Scan box or auto-generate"
                          value={barcode}
                          onChange={e => setBarcode(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ padding: '1.1rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase' }}>
                    <Calendar size={15} />
                    <span>2. Batch Number & Expiration Control</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '24px', marginBottom: '0.25rem' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Batch / Lot Number *</label>
                        <button
                          type="button"
                          onClick={handleAutoBatch}
                          style={{ border: 'none', background: 'none', color: 'var(--primary)', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                        >
                          <Sparkles size={11} />
                          <span>Auto Generate</span>
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

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', minHeight: '24px', marginBottom: '0.25rem' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          Manufacturing Date (Optional)
                        </label>
                      </div>
                      <input
                        type="date"
                        className="input"
                        value={mfgDate}
                        onChange={e => setMfgDate(e.target.value)}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '24px', marginBottom: '0.25rem' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Expiry Date *</label>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button type="button" onClick={() => setQuickExpiry(1)} className="badge badge-primary" style={{ cursor: 'pointer', border: 'none', whiteSpace: 'nowrap', padding: '0.15rem 0.4rem', fontSize: '0.68rem' }}>+1Y</button>
                          <button type="button" onClick={() => setQuickExpiry(2)} className="badge badge-primary" style={{ cursor: 'pointer', border: 'none', whiteSpace: 'nowrap', padding: '0.15rem 0.4rem', fontSize: '0.68rem' }}>+2Y</button>
                          <button type="button" onClick={() => setQuickExpiry(3)} className="badge badge-primary" style={{ cursor: 'pointer', border: 'none', whiteSpace: 'nowrap', padding: '0.15rem 0.4rem', fontSize: '0.68rem' }}>+3Y</button>
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

                <div style={{ padding: '1.1rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'uppercase' }}>
                    <Calculator size={15} />
                    <span>3. Packaging Setup & Customizable Multi-Tier Pricing (Tablet → Pack → Box)</span>
                  </div>

                  <div style={{ marginBottom: '1rem', padding: '0.85rem', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Layers size={14} color="var(--primary)" />
                      <span>Packaging Hierarchy Definition</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', minHeight: '26px', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            Packs per Box *
                          </label>
                        </div>
                        <input
                          type="number"
                          min="1"
                          className="input"
                          placeholder="e.g. 10"
                          value={packsPerBox}
                          onChange={e => handlePacksPerBoxChange(e.target.value)}
                          required
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', minHeight: '26px', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            Tablets per Pack *
                          </label>
                        </div>
                        <input
                          type="number"
                          min="1"
                          className="input"
                          placeholder="e.g. 10"
                          value={tabletsPerPack}
                          onChange={e => handleTabletsPerPackChange(e.target.value)}
                          required
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', minHeight: '26px', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            Boxes Received *
                          </label>
                        </div>
                        <input
                          type="number"
                          min="1"
                          className="input"
                          placeholder="e.g. 5"
                          value={boxesReceived}
                          onChange={e => setBoxesReceived(e.target.value)}
                          required
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', minHeight: '26px', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            Bonus Tablets (Loose)
                          </label>
                        </div>
                        <input
                          type="number"
                          min="0"
                          className="input"
                          placeholder="0"
                          value={bonusQuantity}
                          onChange={e => setBonusQuantity(e.target.value)}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.6rem', marginTop: '0.85rem' }}>
                      <div style={{ backgroundColor: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.5rem 0.75rem' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Tablets / Box</div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.15rem' }}>
                          {totalTabletsPerBox} <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Tablets</span>
                        </div>
                      </div>

                      <div style={{ backgroundColor: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.5rem 0.75rem' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Total Packs Received</div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.15rem' }}>
                          {totalPacksReceived} <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Packs</span>
                        </div>
                      </div>

                      <div style={{ backgroundColor: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.5rem 0.75rem' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Total Loose Inventory</div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--success)', marginTop: '0.15rem' }}>
                          {totalSellableTablets} <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Tablets</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: '1rem', padding: '0.85rem', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
                      💰 Purchase Cost Breakdown (All Inputs Fully Customizable)
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                          Box Purchase Cost (Rs.)
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
                            value={boxPurchasePrice}
                            onChange={e => handleBoxPurchaseCostChange(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                          Pack Purchase Cost (Rs.)
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
                            value={packPurchasePrice}
                            onChange={e => handlePackPurchaseCostChange(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                          Tablet Purchase Cost (Rs.)
                        </label>
                        <div style={{ position: 'relative' }}>
                          <span style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rs.</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="input"
                            style={{ paddingLeft: '2.2rem' }}
                            placeholder="3.00"
                            value={tabletPurchasePrice}
                            onChange={e => handleTabletPurchaseCostChange(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
                      🏷️ Independent Selling MRP & Discount Fields (Tablet, Pack & Box)
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                      <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Package size={15} />
                          <span>BOX (Carton Container)</span>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.2rem' }}>Box Selling MRP *</label>
                          <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rs.</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              className="input"
                              style={{ paddingLeft: '2.2rem' }}
                              placeholder="400.00"
                              value={boxSalePrice}
                              onChange={e => handleBoxSaleMRPChange(e.target.value)}
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.2rem' }}>Box Discount %</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              className="input input-sm"
                              style={{ width: '85px', height: '32px', fontSize: '0.82rem' }}
                              value={boxDiscountPercent}
                              onChange={e => setBoxDiscountPercent(e.target.value)}
                            />
                            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>%</span>
                          </div>
                        </div>

                        <div style={{ marginTop: 'auto', paddingTop: '0.4rem', borderTop: '1px dashed var(--border)', fontSize: '0.74rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                            <span>Net Box Price:</span>
                            <strong style={{ color: 'var(--text-primary)' }}>Rs. {netBoxPrice.toFixed(2)}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                            <span>Box Margin:</span>
                            <strong style={{ color: Number(boxMarginPercent) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                              +{boxMarginPercent}% (Rs. {boxProfit.toFixed(2)})
                            </strong>
                          </div>
                        </div>
                      </div>

                      <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Layers size={15} />
                          <span>PACK (Strip / Blister)</span>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.2rem' }}>Pack Selling MRP *</label>
                          <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rs.</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              className="input"
                              style={{ paddingLeft: '2.2rem' }}
                              placeholder="40.00"
                              value={packSalePrice}
                              onChange={e => handlePackSaleMRPChange(e.target.value)}
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.2rem' }}>Pack Discount %</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              className="input input-sm"
                              style={{ width: '85px', height: '32px', fontSize: '0.82rem' }}
                              value={packDiscountPercent}
                              onChange={e => setPackDiscountPercent(e.target.value)}
                            />
                            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>%</span>
                          </div>
                        </div>

                        <div style={{ marginTop: 'auto', paddingTop: '0.4rem', borderTop: '1px dashed var(--border)', fontSize: '0.74rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                            <span>Net Pack Price:</span>
                            <strong style={{ color: 'var(--text-primary)' }}>Rs. {netPackPrice.toFixed(2)}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                            <span>Pack Margin:</span>
                            <strong style={{ color: Number(packMarginPercent) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                              +{packMarginPercent}% (Rs. {packProfit.toFixed(2)})
                            </strong>
                          </div>
                        </div>
                      </div>

                      <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Pill size={15} />
                          <span>TABLET (Individual Loose Unit)</span>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.2rem' }}>Tablet Selling MRP *</label>
                          <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rs.</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              className="input"
                              style={{ paddingLeft: '2.2rem' }}
                              placeholder="4.50"
                              value={tabletSalePrice}
                              onChange={e => handleTabletSaleMRPChange(e.target.value)}
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.2rem' }}>Tablet Discount %</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              className="input input-sm"
                              style={{ width: '85px', height: '32px', fontSize: '0.82rem' }}
                              value={tabletDiscountPercent}
                              onChange={e => setTabletDiscountPercent(e.target.value)}
                            />
                            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>%</span>
                          </div>
                        </div>

                        <div style={{ marginTop: 'auto', paddingTop: '0.4rem', borderTop: '1px dashed var(--border)', fontSize: '0.74rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                            <span>Net Tablet Price:</span>
                            <strong style={{ color: 'var(--text-primary)' }}>Rs. {netTabletPrice.toFixed(2)}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                            <span>Tablet Margin:</span>
                            <strong style={{ color: Number(tabletMarginPercent) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                              +{tabletMarginPercent}% (Rs. {tabletProfit.toFixed(2)})
                            </strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Reference Notes / Distributor Remark (Optional)
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Inward consignment from distributor, sample pack"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>
              </form>
            </div>

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
                  <span>Saving to Inventory...</span>
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
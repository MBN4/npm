import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { TherapeuticCategorySelect, MASTER_THERAPEUTIC_CATEGORIES } from '../components/TherapeuticCategorySelect.js';
import { StrengthInput } from '../components/StrengthInput.js';
import { getProductPackaging } from '../utils/productPackaging.js';
import { PRODUCT_CATEGORIES, getSubcategories } from '../utils/productCatalog.js';
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
  Layers,
  Zap,
  Edit,
  Trash2,
  QrCode
} from 'lucide-react';

export interface BatchItem {
  id: number;
  medicine_id: number;
  brand_name: string;
  strength?: string;
  dosage_form?: string;
  pack_size?: number;
  tablets_per_pack?: number;
  stock_unit?: string;
  packaging_type?: 'MULTI_TIER' | 'SIMPLE';
  category_name?: string;
  therapeutic_class?: string | null;
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

  const [editingBatch, setEditingBatch] = useState<BatchItem | null>(null);
  const [editBatchNumber, setEditBatchNumber] = useState('');
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [editPurchasePrice, setEditPurchasePrice] = useState('');
  const [editSalePrice, setEditSalePrice] = useState('');
  const [editRackLocation, setEditRackLocation] = useState('');
  const [editCategoryName, setEditCategoryName] = useState('');
  const [editDosageForm, setEditDosageForm] = useState('');
  const [editTherapeuticClass, setEditTherapeuticClass] = useState('');
  const [editCustomTherapeutic, setEditCustomTherapeutic] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  const [deletingBatch, setDeletingBatch] = useState<BatchItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [entryMode, setEntryMode] = useState<'new_med' | 'existing_med'>('new_med');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // SpeedX Barcode Reader integration refs & states
  const boxesReceivedInputRef = useRef<HTMLInputElement>(null);
  const barcodeScanInputRef = useRef<HTMLInputElement>(null);
  const brandNameInputRef = useRef<HTMLInputElement>(null);
  const [scanQuery, setScanQuery] = useState('');
  const [scanStatus, setScanStatus] = useState<'idle' | 'loading' | 'success' | 'not_found'>('idle');
  const [scanVerifiedMessage, setScanVerifiedMessage] = useState<string | null>(null);

  const [selectedMedId, setSelectedMedId] = useState<string>('');
  const [brandName, setBrandName] = useState('');
  const [genericName, setGenericName] = useState('');
  const [manufacturerName, setManufacturerName] = useState('');
  const [categoryName, setCategoryName] = useState('Tablets');
  const [dosageForm, setDosageForm] = useState('Regular');
  const [therapeuticClass, setTherapeuticClass] = useState('');
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

  const packaging = getProductPackaging(dosageForm, null, categoryName);
  const isMultiTier = packaging.packagingType === 'MULTI_TIER';

  const handleScanLookup = async (scannedBarcode: string) => {
    const code = scannedBarcode.trim();
    if (!code) return;

    setScanStatus('loading');
    setModalError(null);

    try {
      const res = await fetch(`/api/inventory/lookup-barcode?code=${encodeURIComponent(code)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error('Barcode lookup failed');
      }

      const data = await res.json();

      if (data.autoRegistered) {
        setShowAddStockModal(false);
        setScanStatus('success');
        setScanVerifiedMessage(`⚡ Instant Auto-Added: ${data.brandName} (${data.categoryName || 'Catalog Item'}) — Saved to inventory database automatically! Initial Stock: 10 units.`);
        fetchInventoryData();
        return;
      }

      setShowAddStockModal(true);

      if (data.found && data.source === 'existing_medicine') {

        setEntryMode('existing_med');
        setSelectedMedId(String(data.medicineId));
        setBrandName(data.brandName || '');
        setGenericName(data.genericName || '');
        setCategoryName(data.categoryName || 'Tablets');
        setManufacturerName(data.manufacturerName || '');
        setStrength(data.strength || '');
        setDosageForm(data.dosageForm || 'Regular');
        setTherapeuticClass(data.therapeuticClass || '');
        setRackLocation(data.rackLocation || 'Rack A-01');
        setBarcode(data.barcode || code);

        setTabletsPerPack(String(data.tabletsPerPack || '10'));
        setPacksPerBox(String(data.packsPerBox || '10'));

        setBoxPurchasePrice(String(data.boxPurchasePrice || '300.00'));
        setPackPurchasePrice(String(data.packPurchasePrice || '30.00'));
        setTabletPurchasePrice(String(data.tabletPurchasePrice || '3.00'));

        setBoxSalePrice(String(data.boxSalePrice || '400.00'));
        setPackSalePrice(String(data.packSalePrice || '40.00'));
        setTabletSalePrice(String(data.tabletSalePrice || '4.00'));

        setBatchNumber(data.batchNumber);
        setExpiryDate(data.expiryDate);

        setScanStatus('success');
        setScanVerifiedMessage(`✓ SpeedX Verified: ${data.brandName} ${data.strength ? `(${data.strength})` : ''} — Retail MRP: Rs. ${data.boxSalePrice} (Pack: Rs. ${data.packSalePrice})`);
      } else if (data.found && (data.source === 'pharma_dictionary' || data.source === 'online_catalog')) {
        setEntryMode('new_med');
        setSelectedMedId('');
        setBrandName(data.brandName || '');
        setGenericName(data.genericName || '');
        setCategoryName(data.categoryName || 'Milk & Infant Formula');
        setManufacturerName(data.manufacturerName || '');
        setStrength(data.strength || '');
        setDosageForm(data.dosageForm || 'Stage 1');
        setTherapeuticClass(data.therapeuticClass || '');
        setRackLocation(data.rackLocation || 'Rack A-01');
        setBarcode(data.barcode || code);

        setTabletsPerPack(String(data.tabletsPerPack || '1'));
        setPacksPerBox(String(data.packsPerBox || '1'));

        setBoxPurchasePrice(String(data.boxPurchasePrice || '1650.00'));
        setPackPurchasePrice(String(data.packPurchasePrice || '1650.00'));
        setTabletPurchasePrice(String(data.tabletPurchasePrice || '1650.00'));

        setBoxSalePrice(String(data.boxSalePrice || '1850.00'));
        setPackSalePrice(String(data.packSalePrice || '1850.00'));
        setTabletSalePrice(String(data.tabletSalePrice || '1850.00'));

        setBatchNumber(data.batchNumber);
        setExpiryDate(data.expiryDate);

        setScanStatus('success');
        setScanVerifiedMessage(`✓ SpeedX Auto-Matched: ${data.brandName} (${data.categoryName || 'Catalog Item'}) — Price: Rs. ${data.boxSalePrice}`);
      } else {
        setEntryMode('new_med');
        setSelectedMedId('');
        setBarcode(code);
        setBatchNumber(data.batchNumber || `BN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
        setExpiryDate(data.expiryDate || new Date(Date.now() + 730 * 86400000).toISOString().split('T')[0]);

        setScanStatus('not_found');
        setScanVerifiedMessage(`⚡ Unregistered Barcode (${code}): Type brand name below OR link to an existing medicine.`);
      }

      // Auto focus cursor intelligently
      setTimeout(() => {
        if (data.found && boxesReceivedInputRef.current) {
          boxesReceivedInputRef.current.focus();
          boxesReceivedInputRef.current.select();
        } else if (!data.found && brandNameInputRef.current) {
          brandNameInputRef.current.focus();
          brandNameInputRef.current.select();
        }
      }, 150);

    } catch (err: any) {
      setScanStatus('idle');
      console.error('Scan lookup error:', err);
    }
  };

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

  const numPacksPerBox = isMultiTier ? Math.max(1, Number(packsPerBox) || 1) : 1;
  const numTabletsPerPack = Math.max(1, Number(tabletsPerPack) || 1);
  const totalTabletsPerBox = numPacksPerBox * numTabletsPerPack;

  const numBoxes = Math.max(0, Number(boxesReceived) || 0);
  const numBonus = Math.max(0, Number(bonusQuantity) || 0);

  const totalPacksReceived = numBoxes * numPacksPerBox;
  const totalSellableTablets = (numBoxes * totalTabletsPerBox) + numBonus;

  const handleAutoCalcCostRatios = () => {
    const bCost = Number(boxPurchasePrice) || 0;
    if (bCost > 0) {
      setPackPurchasePrice((bCost / numPacksPerBox).toFixed(2));
      setTabletPurchasePrice((bCost / totalTabletsPerBox).toFixed(2));
    }
  };

  const handleAutoCalcSaleRatios = () => {
    const bMRP = Number(boxSalePrice) || 0;
    if (bMRP > 0) {
      setPackSalePrice((bMRP / numPacksPerBox).toFixed(2));
      setTabletSalePrice((bMRP / totalTabletsPerBox).toFixed(2));
    }
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
      setCategoryName(med.category_name || '');
      setTherapeuticClass(med.therapeutic_class || med.generic_therapeutic_class || '');
      const pSize = Number(med.pack_size || 100);
      const tPack = Number(med.tablets_per_pack) > 0 ? Number(med.tablets_per_pack) : 10;
      const existingIsMultiTier = (med.packaging_type || (['Tablet', 'Capsule'].includes(med.dosage_form) ? 'MULTI_TIER' : 'SIMPLE')) === 'MULTI_TIER';
      setTabletsPerPack(String(existingIsMultiTier ? tPack : pSize));
      setPacksPerBox(String(existingIsMultiTier ? Math.max(1, Math.floor(pSize / tPack)) : 1));
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
        tabletsPerPack: numTabletsPerPack,
        packsReceived: numBoxes,
        bonusQuantity: numBonus,
        packPurchasePrice: numBoxCost,
        unitPurchasePrice: numTabletCost,
        packSalePrice: numBoxMRP,
        unitSalePrice: numTabletMRP,
        discountPercent: numBoxDiscount,
        stockUnit: packaging.unit,
        packagingType: packaging.packagingType,
        rackLocation,
        notes: isMultiTier
          ? (notes ? `${notes} | PackMRP: ${numPackMRP}, PackCost: ${numPackCost}` : `PackMRP: ${numPackMRP}, PackCost: ${numPackCost}`)
          : notes
      };

      if (entryMode === 'existing_med' && selectedMedId) {
        payload.medicineId = Number(selectedMedId);
      } else {
        payload.brandName = brandName.trim();
        payload.genericName = genericName.trim();
        payload.manufacturerName = manufacturerName.trim();
        payload.categoryName = categoryName.trim();
        payload.dosageForm = dosageForm;
        payload.therapeuticClass = therapeuticClass.trim();
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

      setAdjustSuccess(`Successfully added stock for ${brandName || 'Medicine'} (${totalSellableTablets} ${packaging.unitPlural.toLowerCase()} across ${numBoxes} ${packaging.outerPlural.toLowerCase()} in batch ${batchNumber}).`);
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

  const handleOpenEdit = (batch: BatchItem) => {
    setEditingBatch(batch);
    setEditBatchNumber(batch.batch_number);
    setEditExpiryDate(batch.expiry_date);
    setEditPurchasePrice(String(batch.purchase_price));
    setEditSalePrice(String(batch.sale_price));
    setEditRackLocation(batch.medicine_rack || '');
    setEditCategoryName(batch.category_name || '');
    setEditDosageForm(batch.dosage_form || '');
    setEditTherapeuticClass(batch.therapeutic_class || '');
    setEditCustomTherapeutic(Boolean(batch.therapeutic_class && !MASTER_THERAPEUTIC_CATEGORIES.some(group =>
      group.name === batch.therapeutic_class || group.subcategories.includes(batch.therapeutic_class!))));
    setEditError(null);
  };

  const handleSaveBatchEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBatch) return;
    setEditError(null);
    setEditLoading(true);

    try {
      const res = await fetch(`/api/inventory/batches/${editingBatch.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          batchNumber: editBatchNumber,
          expiryDate: editExpiryDate,
          purchasePrice: Number(editPurchasePrice) || 0,
          salePrice: Number(editSalePrice) || 0,
          rackLocation: editRackLocation,
          categoryName: editCategoryName,
          dosageForm: editDosageForm,
          therapeuticClass: editTherapeuticClass
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update batch');
      }

      setAdjustSuccess(`Batch ${editBatchNumber} and medicine classification updated successfully.`);
      setEditingBatch(null);
      fetchInventoryData();
    } catch (err: any) {
      setEditError(err.message || 'Update failed');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteBatch = (batch: BatchItem) => {
    setDeletingBatch(batch);
  };

  const confirmDeleteBatch = async () => {
    if (!deletingBatch) return;
    setDeleteLoading(true);
    setAdjustError(null);
    setAdjustSuccess(null);

    try {
      const res = await fetch(`/api/inventory/batches/${deletingBatch.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (!res.ok) {
        setAdjustError(data.error || 'Failed to delete batch');
        setDeletingBatch(null);
        return;
      }

      setAdjustSuccess(data.message || `Batch ${deletingBatch.batch_number} deleted successfully.`);
      setDeletingBatch(null);
      fetchInventoryData();
    } catch (err: any) {
      setAdjustError(err.message || 'Delete error');
      setDeletingBatch(null);
    } finally {
      setDeleteLoading(false);
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
            FEFO Stock Tracking • Product-Specific Packaging • Customizable Pricing
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
        <div style={{ padding: '0.75rem 1rem', background: 'var(--success-light)', color: 'var(--success-text)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={16} />
            <span>{adjustSuccess}</span>
          </div>
          <button onClick={() => setAdjustSuccess(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={14} /></button>
        </div>
      )}

      {adjustError && (
        <div style={{ padding: '0.75rem 1rem', background: 'var(--danger-light)', color: 'var(--danger-text)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Ban size={16} />
            <span>{adjustError}</span>
          </div>
          <button onClick={() => setAdjustError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={14} /></button>
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

      {/* SpeedX Barcode Handheld Scanner Direct Stock Entry Bar */}
      {hasPermission('manage_inventory') && (
        <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.06) 0%, rgba(59, 130, 246, 0.06) 100%)', border: '1px solid rgba(16, 185, 129, 0.35)', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)' }}>
                <QrCode size={24} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    SpeedX SP-8600 Barcode Scanner Auto-Entry
                  </h3>
                  <span className="badge badge-success" style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#fff', animation: 'pulse 1.5s infinite' }}></span>
                    Scanner Ready (1D / 2D DataMatrix)
                  </span>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                  Scan any product box barcode → Specs & 100% exact prices are auto-populated. You only enter stock quantity!
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, maxWidth: '520px', minWidth: '280px' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  ref={barcodeScanInputRef}
                  type="text"
                  className="input"
                  style={{
                    paddingLeft: '2.4rem',
                    paddingRight: '7.5rem',
                    height: '44px',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    border: '2px solid var(--success)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-surface)'
                  }}
                  placeholder="Scan product barcode here with SpeedX scanner..."
                  value={scanQuery}
                  onChange={(e) => setScanQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (scanQuery.trim()) {
                        handleScanLookup(scanQuery.trim());
                        setScanQuery('');
                      }
                    }
                  }}
                />
                <Search size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--success)' }} />
                <button
                  type="button"
                  onClick={() => {
                    if (scanQuery.trim()) {
                      handleScanLookup(scanQuery.trim());
                      setScanQuery('');
                    }
                  }}
                  disabled={scanStatus === 'loading'}
                  className="btn btn-primary btn-sm"
                  style={{
                    position: 'absolute',
                    right: '4px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    height: '36px',
                    padding: '0 0.85rem',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    backgroundColor: 'var(--success)',
                    borderColor: 'var(--success)'
                  }}
                >
                  <span>{scanStatus === 'loading' ? 'Searching...' : 'Scan & Auto-Fill'}</span>
                </button>
              </div>
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
                  <th>Unit Cost</th>
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
                    const batchPackaging = getProductPackaging(b.dosage_form, b.stock_unit, b.category_name);

                    return (
                      <tr key={b.id} style={{ backgroundColor: isExpired ? 'rgba(239, 68, 68, 0.04)' : undefined }}>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{b.brand_name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {b.dosage_form} • {b.strength || 'Standard'} • {b.pack_size || 1} {batchPackaging.unitPlural.toLowerCase()}/{batchPackaging.outer.toLowerCase()}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {b.category_name || 'Uncategorized'}{b.therapeutic_class ? ` • ${b.therapeutic_class}` : ''}
                          </div>
                        </td>
                        <td>
                          <code style={{ fontWeight: 700, backgroundColor: 'var(--bg-app)', padding: '0.2rem 0.45rem', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '0.78rem' }}>
                            {b.batch_number}
                          </code>
                        </td>
                        <td>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{b.expiry_date}</div>
                          <span className={`badge ${isExpired ? 'badge-danger' : isNear ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: '0.64rem', marginTop: '3px' }}>
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
                        <td>
                          {b.medicine_rack ? (
                            <span className="rack-pill">
                              <MapPin size={11} style={{ color: 'var(--primary)' }} />
                              <span>{b.medicine_rack}</span>
                            </span>
                          ) : '—'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                            {hasPermission('adjust_stock') && (
                              <button
                                onClick={() => handleOpenAdjustment(b)}
                                className="btn btn-secondary btn-sm"
                                style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                title="Adjust physical stock quantity"
                              >
                                <SlidersHorizontal size={12} />
                                <span>Adjust</span>
                              </button>
                            )}

                            {hasPermission('manage_inventory') && (
                              <>
                                <button
                                  onClick={() => handleOpenEdit(b)}
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--primary)' }}
                                  title="Edit batch pricing and details"
                                >
                                  <Edit size={12} />
                                  <span>Edit</span>
                                </button>

                                <button
                                  onClick={() => handleDeleteBatch(b)}
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', color: 'var(--danger)' }}
                                  title="Delete batch"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </>
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
                    {packaging.packagingType === 'MULTI_TIER'
                      ? `${packaging.unit} → ${packaging.middle} (Strip) → ${packaging.outer} (Carton)`
                      : `${packaging.unit} → ${packaging.outer} packaging and pricing`}
                  </p>
                </div>
              </div>

              <button onClick={() => setShowAddStockModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.35rem' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
              {scanVerifiedMessage && (
                <div style={{
                  padding: '0.85rem 1rem',
                  background: scanStatus === 'not_found' ? 'var(--warning-light)' : 'var(--success-light)',
                  color: scanStatus === 'not_found' ? 'var(--warning-text)' : 'var(--success-text)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '1rem',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                  border: scanStatus === 'not_found' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                    <CheckCircle2 size={18} />
                    <span>{scanVerifiedMessage}</span>
                  </div>
                  {scanStatus === 'not_found' ? (
                    <button
                      type="button"
                      onClick={() => setEntryMode('existing_med')}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.72rem', padding: '0.2rem 0.65rem', fontWeight: 700, backgroundColor: '#fff', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                    >
                      🔗 Link Barcode ({barcode}) to Existing Medicine
                    </button>
                  ) : (
                    <span style={{ fontSize: '0.72rem', opacity: 0.95, backgroundColor: 'rgba(255,255,255,0.4)', padding: '0.2rem 0.55rem', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                      Stock Count Input Auto-Focused 👇
                    </span>
                  )}
                </div>
              )}

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
                            {m.brand_name} {m.strength} ({m.dosage_form}) • Rack: {m.rack_location || 'N/A'} • {getProductPackaging(m.dosage_form, m.stock_unit, m.category_name).outer}: {m.pack_size} {getProductPackaging(m.dosage_form, m.stock_unit, m.category_name).unitPlural.toLowerCase()}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', minHeight: '24px', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Main Category *</label>
                        </div>
                        <select
                          className="select"
                          value={categoryName}
                          onChange={e => {
                            const nextCategory = e.target.value;
                            setCategoryName(nextCategory);
                            setDosageForm(getSubcategories(nextCategory)[0] || '');
                          }}
                          required
                        >
                          {PRODUCT_CATEGORIES.map(category => <option key={category.name} value={category.name}>{category.name}</option>)}
                        </select>
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', minHeight: '24px', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Subcategory / Product Type *</label>
                        </div>
                        <select className="select" value={dosageForm} onChange={e => setDosageForm(e.target.value)} required>
                          {getSubcategories(categoryName).map(subcategory => <option key={subcategory} value={subcategory}>{subcategory}</option>)}
                        </select>
                      </div>

                      <div style={{ gridColumn: 'span 2' }}>
                        <div style={{ display: 'flex', alignItems: 'center', minHeight: '24px', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Therapeutic Class</label>
                        </div>
                        <TherapeuticCategorySelect
                          value={therapeuticClass}
                          onChange={setTherapeuticClass}
                          placeholder="e.g. Analgesic/Antipyretic, Antibiotic, NSAID"
                        />
                      </div>

                      <div style={{ gridColumn: 'span 2' }}>
                        <div style={{ display: 'flex', alignItems: 'center', minHeight: '24px', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Brand Trade Name *
                          </label>
                        </div>
                        <input
                          ref={brandNameInputRef}
                          type="text"
                          className="input"
                          placeholder="e.g. Panadol, Augmentin, Synflex, Sunflex"
                          value={brandName}
                          onChange={e => setBrandName(e.target.value)}
                          required
                        />
                        {brandName.trim().length >= 2 && entryMode === 'new_med' && (
                          <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Catalog Match:</span>
                            {medicinesList
                              .filter(m => m.brand_name.toLowerCase().includes(brandName.trim().toLowerCase()))
                              .slice(0, 3)
                              .map(m => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => {
                                    setEntryMode('existing_med');
                                    handleSelectExistingMed(String(m.id));
                                  }}
                                  className="badge badge-primary"
                                  style={{ cursor: 'pointer', border: '1px solid var(--primary)', fontSize: '0.7rem', padding: '0.15rem 0.45rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                                >
                                  <span>{m.brand_name} {m.strength || ''} ({m.dosage_form || 'Tablet'})</span>
                                </button>
                              ))}
                          </div>
                        )}
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
                        <div style={{ display: 'flex', alignItems: 'center', minHeight: '24px', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Barcode (EAN-13 or Custom)
                          </label>
                        </div>
                        <div style={{ position: 'relative' }}>
                          <input
                            type="text"
                            className="input"
                            style={{ paddingRight: '4.8rem' }}
                            placeholder="Scan or auto-create"
                            value={barcode}
                            onChange={e => setBarcode(e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={handleAutoBarcode}
                            style={{
                              position: 'absolute',
                              right: '4px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              border: '1px solid var(--border)',
                              background: 'var(--bg-app)',
                              color: 'var(--primary)',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              borderRadius: '6px',
                              padding: '0.2rem 0.45rem',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.2rem'
                            }}
                          >
                            <Sparkles size={11} />
                            <span>Auto</span>
                          </button>
                        </div>
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
                      <div style={{ display: 'flex', alignItems: 'center', minHeight: '24px', marginBottom: '0.25rem' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Batch / Lot Number *</label>
                      </div>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="text"
                          className="input"
                          style={{ paddingRight: '4.8rem' }}
                          placeholder="e.g. BN-2026-99"
                          value={batchNumber}
                          onChange={e => setBatchNumber(e.target.value)}
                          required
                        />
                        <button
                          type="button"
                          onClick={handleAutoBatch}
                          style={{
                            position: 'absolute',
                            right: '4px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-app)',
                            color: 'var(--primary)',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            borderRadius: '6px',
                            padding: '0.2rem 0.45rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.2rem'
                          }}
                        >
                          <Sparkles size={11} />
                          <span>Auto</span>
                        </button>
                      </div>
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
                    <span>3. Packaging Setup & Pricing ({isMultiTier ? `${packaging.unit} → ${packaging.middle} → ${packaging.outer}` : `${packaging.unit} → ${packaging.outer}`})</span>
                  </div>

                  <div style={{ marginBottom: '1rem', padding: '0.85rem', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Layers size={14} color="var(--primary)" />
                      <span>Packaging Hierarchy Definition</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
                      {isMultiTier && <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', minHeight: '26px', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {packaging.middlePlural} per {packaging.outer} *
                          </label>
                        </div>
                        <input
                          type="number"
                          min="1"
                          className="input"
                          placeholder="e.g. 10"
                          value={packsPerBox}
                          onChange={e => setPacksPerBox(e.target.value)}
                          required
                        />
                      </div>}

                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', minHeight: '26px', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {isMultiTier
                              ? `${packaging.unitPlural} per ${packaging.middle} *`
                              : `${packaging.unitPlural} per ${packaging.outer} *`}
                          </label>
                        </div>
                        <input
                          type="number"
                          min="1"
                          className="input"
                          placeholder="e.g. 8"
                          value={tabletsPerPack}
                          onChange={e => setTabletsPerPack(e.target.value)}
                          required
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', minHeight: '26px', marginBottom: '0.25rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {packaging.outerPlural} Received *
                          </label>
                        </div>
                        <input
                          ref={boxesReceivedInputRef}
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
                            Bonus {packaging.unitPlural} (Loose)
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
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{packaging.unitPlural} / {packaging.outer}</div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.15rem' }}>
                          {totalTabletsPerBox} <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{packaging.unitPlural}</span>
                        </div>
                      </div>

                      {isMultiTier && <div style={{ backgroundColor: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.5rem 0.75rem' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Total {packaging.middlePlural} Received</div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.15rem' }}>
                          {totalPacksReceived} <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{packaging.middlePlural}</span>
                        </div>
                      </div>}

                      <div style={{ backgroundColor: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.5rem 0.75rem' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Total Loose Inventory</div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--success)', marginTop: '0.15rem' }}>
                          {totalSellableTablets} <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{packaging.unitPlural}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: '1rem', padding: '0.85rem', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                      <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        💰 Purchase Cost Breakdown (All Inputs Independently Customizable)
                      </div>
                      <button
                        type="button"
                        onClick={handleAutoCalcCostRatios}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--primary)' }}
                        title={`Auto-calculate ${isMultiTier ? `${packaging.middle} and ` : ''}${packaging.unit} costs by dividing ${packaging.outer} cost`}
                      >
                        <Zap size={12} />
                        <span>Auto-split from {packaging.outer}</span>
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                          {packaging.outer} Purchase Cost (Rs.)
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
                            onChange={e => setBoxPurchasePrice(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      {isMultiTier && <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                          {packaging.middle} Purchase Cost (Rs.)
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
                            onChange={e => setPackPurchasePrice(e.target.value)}
                            required
                          />
                        </div>
                      </div>}

                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                          {packaging.unit} Purchase Cost (Rs.)
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
                            onChange={e => setTabletPurchasePrice(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                      <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        🏷️ Independent Selling MRP & Discount Fields ({isMultiTier ? `${packaging.unit}, ${packaging.middle} & ${packaging.outer}` : `${packaging.unit} & ${packaging.outer}`})
                      </div>
                      <button
                        type="button"
                        onClick={handleAutoCalcSaleRatios}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--primary)' }}
                        title={`Auto-calculate ${isMultiTier ? `${packaging.middle} and ` : ''}${packaging.unit} MRP from ${packaging.outer} MRP`}
                      >
                        <Zap size={12} />
                        <span>Auto-split from {packaging.outer}</span>
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                      <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Package size={15} />
                          <span>{packaging.outer.toUpperCase()} (Outer Container)</span>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.2rem' }}>{packaging.outer} Selling MRP *</label>
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
                              onChange={e => setBoxSalePrice(e.target.value)}
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.2rem' }}>{packaging.outer} Discount %</label>
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
                            <span>Net {packaging.outer} Price:</span>
                            <strong style={{ color: 'var(--text-primary)' }}>Rs. {netBoxPrice.toFixed(2)}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                            <span>{packaging.outer} Margin:</span>
                            <strong style={{ color: Number(boxMarginPercent) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                              +{boxMarginPercent}% (Rs. {boxProfit.toFixed(2)})
                            </strong>
                          </div>
                        </div>
                      </div>

                      {isMultiTier && <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Layers size={15} />
                          <span>{packaging.middle.toUpperCase()} (Strip / Blister)</span>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.2rem' }}>{packaging.middle} Selling MRP *</label>
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
                              onChange={e => setPackSalePrice(e.target.value)}
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.2rem' }}>{packaging.middle} Discount %</label>
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
                            <span>Net {packaging.middle} Price:</span>
                            <strong style={{ color: 'var(--text-primary)' }}>Rs. {netPackPrice.toFixed(2)}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                            <span>{packaging.middle} Margin:</span>
                            <strong style={{ color: Number(packMarginPercent) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                              +{packMarginPercent}% (Rs. {packProfit.toFixed(2)})
                            </strong>
                          </div>
                        </div>
                      </div>}

                      <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Pill size={15} />
                          <span>{packaging.unit.toUpperCase()} (Individual Sellable Unit)</span>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.2rem' }}>{packaging.unit} Selling MRP *</label>
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
                              onChange={e => setTabletSalePrice(e.target.value)}
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.2rem' }}>{packaging.unit} Discount %</label>
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
                            <span>Net {packaging.unit} Price:</span>
                            <strong style={{ color: 'var(--text-primary)' }}>Rs. {netTabletPrice.toFixed(2)}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                            <span>{packaging.unit} Margin:</span>
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

      {editingBatch && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div style={{ padding: '1.2rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Edit size={18} color="var(--primary)" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Edit Batch #{editingBatch.batch_number}</h3>
              </div>
              <button onClick={() => setEditingBatch(null)} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem' }}>
                <X size={15} />
              </button>
            </div>

            {editError && (
              <div style={{ margin: '1rem 1.5rem 0', padding: '0.75rem', background: 'var(--danger-light)', color: 'var(--danger-text)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveBatchEdit} style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: 'var(--bg-app)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 800 }}>
                  {editingBatch.strength && editingBatch.brand_name.toLowerCase().includes(editingBatch.strength.toLowerCase().trim())
                    ? editingBatch.brand_name
                    : `${editingBatch.brand_name} ${editingBatch.strength || ''}`.trim()}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Current Stock: <strong>{editingBatch.quantity} Units</strong>
                </div>
              </div>

              <div style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Medicine classification applies to every batch of this product.</div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem' }}>Main Category *</label>
                  <select className="select" value={editCategoryName} onChange={e => {
                    const nextCategory = e.target.value;
                    setEditCategoryName(nextCategory);
                    setEditDosageForm(getSubcategories(nextCategory)[0] || '');
                  }} required>
                    {editCategoryName && !PRODUCT_CATEGORIES.some(category => category.name === editCategoryName) && <option value={editCategoryName}>{editCategoryName}</option>}
                    {PRODUCT_CATEGORIES.map(category => <option key={category.name} value={category.name}>{category.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem' }}>Subcategory / Product Type</label>
                  <select className="select" value={editDosageForm} onChange={e => setEditDosageForm(e.target.value)}>
                    {editDosageForm && !getSubcategories(editCategoryName).includes(editDosageForm) && <option value={editDosageForm}>{editDosageForm}</option>}
                    {getSubcategories(editCategoryName).map(subcategory => <option key={subcategory} value={subcategory}>{subcategory}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem' }}>Therapeutic Class</label>
                  <select className="select" value={editCustomTherapeutic ? '__custom__' : editTherapeuticClass} onChange={e => {
                    if (e.target.value === '__custom__') setEditCustomTherapeutic(true);
                    else { setEditCustomTherapeutic(false); setEditTherapeuticClass(e.target.value); }
                  }}>
                    <option value="">No therapeutic class</option>
                    {MASTER_THERAPEUTIC_CATEGORIES.map(group => <optgroup key={group.id} label={group.name}>
                      <option value={group.name}>{group.name}</option>
                      {group.subcategories.map(subcategory => <option key={subcategory} value={subcategory}>{subcategory}</option>)}
                    </optgroup>)}
                    <option value="__custom__">Custom class…</option>
                  </select>
                  {editCustomTherapeutic && <input className="input" style={{ marginTop: '0.5rem' }} value={editTherapeuticClass} onChange={e => setEditTherapeuticClass(e.target.value)} placeholder="Enter therapeutic class" />}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem' }}>Batch Number *</label>
                <input
                  type="text"
                  className="input"
                  value={editBatchNumber}
                  onChange={e => setEditBatchNumber(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem' }}>Expiry Date *</label>
                <input
                  type="date"
                  className="input"
                  value={editExpiryDate}
                  onChange={e => setEditExpiryDate(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem' }}>Unit Purchase Cost (Rs.) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    value={editPurchasePrice}
                    onChange={e => setEditPurchasePrice(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem' }}>Unit Sale MRP (Rs.) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="input"
                    value={editSalePrice}
                    onChange={e => setEditSalePrice(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem' }}>Shelf / Rack Location</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Rack A-01"
                  value={editRackLocation}
                  onChange={e => setEditRackLocation(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button type="button" onClick={() => setEditingBatch(null)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={editLoading}>
                  {editLoading ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </form>
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

      {deletingBatch && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '460px' }}>
            <div style={{ padding: '1.2rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={20} />
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Delete Batch #{deletingBatch.batch_number}</h3>
              </div>
              <button onClick={() => setDeletingBatch(null)} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem' }}>
                <X size={15} />
              </button>
            </div>

            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: 'var(--bg-app)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                  {deletingBatch.strength && deletingBatch.brand_name.toLowerCase().includes(deletingBatch.strength.toLowerCase().trim())
                    ? deletingBatch.brand_name
                    : `${deletingBatch.brand_name} ${deletingBatch.strength || ''}`.trim()}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Batch Number: <code style={{ fontWeight: 700 }}>{deletingBatch.batch_number}</code> • Expiry: <strong>{deletingBatch.expiry_date}</strong>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Current Stock Balance: <strong style={{ color: 'var(--primary)' }}>{deletingBatch.quantity} Units</strong>
                </div>
              </div>

              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Are you sure you want to permanently delete Batch <strong>#{deletingBatch.batch_number}</strong> from stock inventory? This action cannot be undone.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                <button
                  type="button"
                  onClick={() => setDeletingBatch(null)}
                  className="btn btn-secondary"
                  disabled={deleteLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteBatch}
                  className="btn btn-danger"
                  disabled={deleteLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}
                >
                  {deleteLoading ? (
                    <span>Deleting...</span>
                  ) : (
                    <>
                      <Trash2 size={15} />
                      <span>Delete Batch</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

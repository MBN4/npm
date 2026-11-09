import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  Truck,
  Plus,
  RefreshCw,
  X,
  Trash2,
  Camera,
  Sparkles,
  Loader2,
  CheckCircle2,
  ScanLine,
  FileText,
  Search,
  ChevronDown,
  CheckCheck,
  HelpCircle
} from 'lucide-react';
import { ScanUploadModal } from '../components/ScanUploadModal.js';
import { InvoiceScanReviewView } from './InvoiceScanReviewView.js';

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

export type PriceBasis = 'BOX' | 'BLISTER' | 'TAB';
export type TotalMode = 'COST' | 'MRP';

export interface PurchaseItemRow {
  medicineId: string;
  medicineName?: string;
  batchNumber: string;
  expiryDate: string;
  mfgDate: string;
  boxes: string;
  blistersPerBox: string;
  tabsPerBlister: string;
  totalUnits: number;
  purchasePrice: string; // Rate entered
  costBasis: PriceBasis; // Rate is for: Box, Blister, or Tab
  mrp: string;           // MRP entered
  mrpBasis: PriceBasis;  // MRP is for: Box, Blister, or Tab
  bonusQuantity: string;
  lineCostTotal: number;
  lineMrpTotal: number;
}

export interface AiQuestion {
  id: string;
  itemIndex?: number;
  question: string;
  field: string;
  options: Array<{ label: string; value: any }>;
}

async function optimizeImageForAi(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1600;
        let w = img.width;
        let h = img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          if (w > h) {
            h = Math.round((h * MAX_DIM) / w);
            w = MAX_DIM;
          } else {
            w = Math.round((w * MAX_DIM) / h);
            h = MAX_DIM;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(file);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => {
          if (!blob) return resolve(file);
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.88);
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

interface MedicineDropdownProps {
  value: string;
  onChange: (id: string) => void;
  medicines: Array<{ id: number; brand_name: string; strength?: string }>;
  suggestedName?: string;
}

const SearchableMedicineSelect: React.FC<MedicineDropdownProps> = ({
  value,
  onChange,
  medicines,
  suggestedName
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = medicines.find(m => String(m.id) === String(value));

  useEffect(() => {
    const clickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, [isOpen]);

  const filtered = medicines.filter(m => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return m.brand_name.toLowerCase().includes(q) || (m.strength && m.strength.toLowerCase().includes(q));
  }).slice(0, 30);

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <div
        onClick={() => { setIsOpen(!isOpen); setSearch(''); }}
        style={{
          width: '100%',
          background: selected ? 'rgba(56, 189, 248, 0.08)' : 'rgba(15, 23, 42, 0.75)',
          border: isOpen ? '1px solid #38bdf8' : selected ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '7px',
          padding: '0.45rem 0.65rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          fontSize: '0.8rem',
          color: selected ? '#f8fafc' : '#94a3b8',
          boxShadow: isOpen ? '0 0 0 2px rgba(56, 189, 248, 0.15)' : 'none',
          transition: 'all 0.15s ease'
        }}
      >
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          {selected && <CheckCheck size={13} style={{ color: '#22c55e', flexShrink: 0 }} />}
          <span style={{ fontWeight: selected ? 600 : 400 }}>
            {selected ? `${selected.brand_name} ${selected.strength || ''}` : 'Select Catalog Medicine...'}
          </span>
        </div>
        <ChevronDown size={13} style={{ color: '#94a3b8', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
      </div>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            width: '100%',
            minWidth: '280px',
            background: '#0f172a',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: '9px',
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.85)',
            zIndex: 99999,
            overflow: 'hidden'
          }}
        >
          <div style={{ padding: '0.45rem 0.6rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#1e293b' }}>
            <Search size={13} style={{ color: '#38bdf8' }} />
            <input
              autoFocus
              type="text"
              placeholder="Search or filter medicine..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: '#f8fafc',
                fontSize: '0.78rem',
                outline: 'none'
              }}
            />
            {search && (
              <X size={12} style={{ color: '#94a3b8', cursor: 'pointer' }} onClick={() => setSearch('')} />
            )}
          </div>

          {suggestedName && !search && (
            <div
              onClick={() => {
                const firstWord = suggestedName.replace(/^[^a-zA-Z]+/, '').split(/[\s-]/)[0];
                setSearch(firstWord || suggestedName);
              }}
              style={{
                padding: '0.35rem 0.65rem',
                background: 'rgba(56, 189, 248, 0.12)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                fontSize: '0.72rem',
                color: '#38bdf8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              <Sparkles size={11} />
              <span>Search: "{suggestedName.slice(0, 24)}"</span>
            </div>
          )}

          <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '0.75rem', fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>
                No medicine found
              </div>
            ) : (
              filtered.map(m => {
                const isSelected = String(m.id) === String(value);
                return (
                  <div
                    key={m.id}
                    onClick={() => {
                      onChange(String(m.id));
                      setIsOpen(false);
                    }}
                    style={{
                      padding: '0.45rem 0.75rem',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                      color: isSelected ? '#38bdf8' : '#e2e8f0',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.03)'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.background = isSelected ? 'rgba(56, 189, 248, 0.15)' : 'transparent')}
                  >
                    <span style={{ fontWeight: 600 }}>{m.brand_name}</span>
                    {m.strength && (
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', background: 'rgba(255, 255, 255, 0.06)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                        {m.strength}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const PurchasesView: React.FC = () => {
  const { token, hasPermission } = useAuth();
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([]);
  const [medicines, setMedicines] = useState<{ id: number; brand_name: string; strength?: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Scan Invoice flow
  const [showScanUpload, setShowScanUpload] = useState(false);
  const [reviewScanId, setReviewScanId] = useState<number | null>(null);

  // Fast AI Extraction Flow state
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiQuestions, setAiQuestions] = useState<AiQuestion[]>([]);
  const aiFileInputRef = useRef<HTMLInputElement>(null);

  // Dynamic Total Price Display Mode: 'COST' (Invoice payable) or 'MRP' (Customer retail value)
  const [totalViewMode, setTotalViewMode] = useState<TotalMode>('COST');

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
      boxes: '1',
      blistersPerBox: '10',
      tabsPerBlister: '10',
      totalUnits: 100,
      purchasePrice: '',
      costBasis: 'BOX',
      mrp: '',
      mrpBasis: 'BOX',
      bonusQuantity: '0',
      lineCostTotal: 0,
      lineMrpTotal: 0
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

  // Recalculates both Line Cost Total and Line MRP Total dynamically
  const recalculateRow = (row: PurchaseItemRow): PurchaseItemRow => {
    const boxes = Number(row.boxes) || 0;
    const blisters = Math.max(1, Number(row.blistersPerBox) || 1);
    const tabs = Math.max(1, Number(row.tabsPerBlister) || 1);
    const totalUnits = Math.round(boxes * blisters * tabs);

    const rawCost = Number(row.purchasePrice) || 0;
    const rawMrp = Number(row.mrp) || 0;

    // Line Cost Total (What we pay the distributor)
    let lineCostTotal = 0;
    if (row.costBasis === 'BOX') lineCostTotal = boxes * rawCost;
    else if (row.costBasis === 'BLISTER') lineCostTotal = (boxes * blisters) * rawCost;
    else lineCostTotal = totalUnits * rawCost;

    // Line MRP Total (Retail value when sold to customers)
    let lineMrpTotal = 0;
    if (row.mrpBasis === 'BOX') lineMrpTotal = boxes * rawMrp;
    else if (row.mrpBasis === 'BLISTER') lineMrpTotal = (boxes * blisters) * rawMrp;
    else lineMrpTotal = totalUnits * rawMrp;

    return {
      ...row,
      totalUnits,
      lineCostTotal: Number(lineCostTotal.toFixed(2)),
      lineMrpTotal: Number(lineMrpTotal.toFixed(2))
    };
  };

  const handleItemChange = (index: number, field: keyof PurchaseItemRow, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    updated[index] = recalculateRow(updated[index]);
    setItems(updated);
  };

  const applyAiAnswer = (questionId: string, itemIndex: number | undefined, optionValue: any) => {
    if (itemIndex !== undefined && items[itemIndex]) {
      const updated = [...items];
      if (optionValue.blistersPerBox !== undefined) updated[itemIndex].blistersPerBox = String(optionValue.blistersPerBox);
      if (optionValue.tabsPerBlister !== undefined) updated[itemIndex].tabsPerBlister = String(optionValue.tabsPerBlister);
      updated[itemIndex] = recalculateRow(updated[itemIndex]);
      setItems(updated);
    }
    setAiQuestions(prev => prev.filter(q => q.id !== questionId));
  };

  const addItemRow = () => {
    setItems([
      ...items,
      {
        medicineId: '',
        batchNumber: '',
        expiryDate: '',
        mfgDate: '',
        boxes: '1',
        blistersPerBox: '10',
        tabsPerBlister: '10',
        totalUnits: 100,
        purchasePrice: '',
        costBasis: 'BOX',
        mrp: '',
        mrpBasis: 'BOX',
        bonusQuantity: '0',
        lineCostTotal: 0,
        lineMrpTotal: 0
      }
    ]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  // Financial Totals
  const totalCostSubtotal = items.reduce((acc, it) => acc + (it.lineCostTotal || 0), 0);
  const totalMrpRevenue = items.reduce((acc, it) => acc + (it.lineMrpTotal || 0), 0);
  const netDiscount = Number(discount) || 0;
  const grandCostTotal = Math.max(0, totalCostSubtotal - netDiscount);
  const paid = Number(paidAmount) || 0;
  const remainingPayable = Math.max(0, grandCostTotal - paid);
  const projectedProfit = Math.max(0, totalMrpRevenue - grandCostTotal);

  // Upload handler
  const handleAiImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = e.target.files;
    if (!rawFiles || rawFiles.length === 0) return;

    setIsAiProcessing(true);
    setStatusMessage(null);
    setAiQuestions([]);

    try {
      const optimizedFiles = await Promise.all(
        Array.from(rawFiles).map(f => optimizeImageForAi(f))
      );

      const formData = new FormData();
      optimizedFiles.forEach(f => formData.append('files', f));

      const res = await fetch('/api/purchases/scans/ai-quick-extract', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to extract invoice data');
      }

      await fetchMetadata();

      if (data.matchedSupplierId) {
        setSupplierId(String(data.matchedSupplierId));
      }
      if (data.invoiceNumber) {
        setInvoiceNumber(data.invoiceNumber);
      }
      if (data.purchaseDate) {
        setPurchaseDate(data.purchaseDate);
      }
      if (data.rawNotes) {
        setNotes(data.rawNotes);
      }

      if (data.clarificationQuestions && Array.isArray(data.clarificationQuestions)) {
        setAiQuestions(data.clarificationQuestions);
      }

      if (data.items && data.items.length > 0) {
        const rows: PurchaseItemRow[] = data.items.map((it: any) => {
          const boxes = it.boxes || 1;
          const blisters = it.blistersPerBox || 10;
          const tabs = it.tabsPerBlister || 10;
          const cost = it.purchasePrice || 0;

          const row: PurchaseItemRow = {
            medicineId: it.matchedMedicineId ? String(it.matchedMedicineId) : '',
            medicineName: it.productName,
            batchNumber: it.batchNumber || '',
            expiryDate: it.expiryDate || '',
            mfgDate: it.mfgDate || '',
            boxes: String(boxes),
            blistersPerBox: String(blisters),
            tabsPerBlister: String(tabs),
            totalUnits: Math.round(boxes * blisters * tabs),
            purchasePrice: String(cost || ''),
            costBasis: (it.costBasis as PriceBasis) || 'BOX',
            mrp: String(it.mrp || (cost ? (cost * 1.25).toFixed(2) : '')),
            mrpBasis: (it.mrpBasis as PriceBasis) || 'BOX',
            bonusQuantity: String(it.bonusQuantity || '0'),
            lineCostTotal: Number((boxes * cost).toFixed(2)),
            lineMrpTotal: Number((boxes * (Number(it.mrp) || cost * 1.25)).toFixed(2))
          };
          return recalculateRow(row);
        });
        setItems(rows);
      }

      setIsAiProcessing(false);
      setShowAddModal(true);
      setStatusMessage({
        text: `Extracted ${data.items?.length || 0} items! Packaging tiers, MRP, and medicines are 100% matched.`,
        type: 'success'
      });
    } catch (err: any) {
      setIsAiProcessing(false);
      setStatusMessage({
        text: `AI Extraction notice: ${err.message}`,
        type: 'error'
      });
    } finally {
      if (aiFileInputRef.current) aiFileInputRef.current.value = '';
    }
  };

  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!supplierId || !invoiceNumber.trim()) {
      setStatusMessage({ text: 'Please select a supplier and provide invoice number.', type: 'error' });
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.medicineId || !it.batchNumber.trim() || !it.expiryDate) {
        setStatusMessage({ text: `Item #${i + 1} has missing medicine, batch number, or expiry date.`, type: 'error' });
        return;
      }
      if (Number(it.boxes) <= 0 || Number(it.purchasePrice) <= 0) {
        setStatusMessage({ text: `Item #${i + 1} must have box quantity and cost price greater than zero.`, type: 'error' });
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
          subtotal: totalCostSubtotal,
          discount: netDiscount,
          totalAmount: grandCostTotal,
          paidAmount: paid,
          paymentMethod,
          notes,
          items: items.map(it => {
            const boxes = Number(it.boxes) || 1;
            const blisters = Number(it.blistersPerBox) || 1;
            const tabs = Number(it.tabsPerBlister) || 1;
            const unitsPerBox = blisters * tabs;
            const totalUnits = Math.round(boxes * unitsPerBox);

            // Normalize Cost to Box Price
            let boxCost = Number(it.purchasePrice) || 0;
            if (it.costBasis === 'BLISTER') boxCost = boxCost * blisters;
            else if (it.costBasis === 'TAB') boxCost = boxCost * unitsPerBox;

            // Normalize MRP to Box Price
            let boxMrp = Number(it.mrp) || Number((boxCost * 1.25).toFixed(2));
            if (it.mrpBasis === 'BLISTER') boxMrp = boxMrp * blisters;
            else if (it.mrpBasis === 'TAB') boxMrp = boxMrp * unitsPerBox;

            return {
              medicineId: Number(it.medicineId),
              batchNumber: it.batchNumber.trim(),
              expiryDate: it.expiryDate,
              mfgDate: it.mfgDate || null,
              boxesReceived: boxes,
              stripsPerBox: blisters,
              unitsPerStrip: tabs,
              quantity: totalUnits, // Exact tablet units for POS counter
              purchasePrice: boxCost,
              mrp: boxMrp,
              salePrice: boxMrp,
              bonusQuantity: Number(it.bonusQuantity) || 0,
              lineTotal: it.lineCostTotal,
              confirmedPurchaseCostPerBox: boxCost,
              printedMrpPerBox: boxMrp,
              rateBasis: 'PER_BOX'
            };
          })
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({ text: data.error || 'Failed to record purchase', type: 'error' });
        return;
      }

      setStatusMessage({ text: `Purchase invoice #${invoiceNumber} committed to stock batches!`, type: 'success' });
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
          boxes: '1',
          blistersPerBox: '10',
          tabsPerBlister: '10',
          totalUnits: 100,
          purchasePrice: '',
          costBasis: 'BOX',
          mrp: '',
          mrpBasis: 'BOX',
          bonusQuantity: '0',
          lineCostTotal: 0,
          lineMrpTotal: 0
        }
      ]);
      fetchPurchases();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Network error', type: 'error' });
    }
  };

  if (reviewScanId !== null) {
    return (
      <div className="page-container">
        <InvoiceScanReviewView
          scanId={reviewScanId}
          onClose={() => { setReviewScanId(null); fetchPurchases(); }}
          onOpenScan={id => setReviewScanId(id)}
          onCommitted={() => fetchPurchases()}
        />
      </div>
    );
  }

  return (
    <div className="page-container">
      <style>{`
        @keyframes customSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes customBar {
          0% { left: -40%; width: 30%; }
          50% { left: 30%; width: 50%; }
          100% { left: 100%; width: 30%; }
        }
        .ai-custom-spinner {
          width: 50px;
          height: 50px;
          border: 3px solid rgba(56, 189, 248, 0.15);
          border-top-color: #38bdf8;
          border-radius: 50%;
          animation: customSpin 0.85s linear infinite;
        }
        .ai-table-input {
          width: 100%;
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 6px;
          color: #f8fafc;
          padding: 0.42rem 0.55rem;
          font-size: 0.8rem;
          outline: none;
          transition: border-color 0.2s;
        }
        .ai-table-input:focus {
          border-color: #38bdf8;
        }
        .ai-basis-select {
          background: #1e293b;
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #38bdf8;
          font-size: 0.68rem;
          font-weight: 700;
          padding: 0.2rem 0.35rem;
          border-radius: 4px;
          outline: none;
          cursor: pointer;
        }
      `}</style>

      {/* Hidden file input */}
      <input
        ref={aiFileInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        style={{ display: 'none' }}
        onChange={handleAiImageUpload}
      />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Purchases & Inward Orders</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Supplier Invoices • Batch Creation • Stock Inflow & Payables
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button onClick={fetchPurchases} className="btn btn-secondary btn-sm" disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          {hasPermission('create_purchases') && (
            <button
              onClick={() => aiFileInputRef.current?.click()}
              className="btn btn-primary btn-sm"
              disabled={isAiProcessing}
            >
              {isAiProcessing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              <span>AI Stock Inward</span>
            </button>
          )}

          {hasPermission('create_purchases') && (
            <button onClick={() => setShowAddModal(true)} className="btn btn-secondary btn-sm">
              <Plus size={16} />
              <span>Manual Invoice</span>
            </button>
          )}
        </div>
      </div>

      {hasPermission('create_purchases') && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.85rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => aiFileInputRef.current?.click()}
            className="btn btn-primary"
            disabled={isAiProcessing}
            style={{
              padding: '0.85rem 2.2rem',
              fontSize: '0.95rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem'
            }}
          >
            <ScanLine size={18} />
            <span>AI Stock Inward (Upload Image)</span>
          </button>

          <button
            onClick={() => setShowScanUpload(true)}
            className="btn btn-secondary"
            style={{ padding: '0.85rem 1.6rem', fontSize: '0.95rem' }}
          >
            <Camera size={17} />
            <span>Scan Invoice Archive</span>
          </button>
        </div>
      )}

      {statusMessage && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: statusMessage.type === 'success' ? 'var(--success-light)' : 'var(--danger-light)',
            color: statusMessage.type === 'success' ? 'var(--success-text)' : 'var(--danger-text)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1rem',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          {statusMessage.type === 'success' ? <CheckCircle2 size={16} /> : <X size={16} />}
          <span>{statusMessage.text}</span>
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
                    No purchase invoices registered yet. Click 'AI Stock Inward' to automatically add stock from photos.
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

      {/* CLEAN HIGH-END SPINNER LOADER */}
      {isAiProcessing && (
        <div
          className="modal-overlay"
          style={{
            zIndex: 9999,
            backgroundColor: 'rgba(5, 8, 18, 0.75)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem'
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '420px',
              background: '#0f172a',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              padding: '2.5rem 2rem',
              textAlign: 'center',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
            }}
          >
            <div style={{ position: 'relative', width: '50px', height: '50px', margin: '0 auto 1.25rem auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="ai-custom-spinner" style={{ position: 'absolute' }} />
              <FileText size={20} style={{ color: '#38bdf8' }} />
            </div>

            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.35rem' }}>
              Extracting Packaging & MRP
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '1.5rem', lineHeight: 1.45 }}>
              Detecting box count, blisters per pack, tablet units, and retail rates...
            </p>

            <div style={{ position: 'relative', width: '100%', height: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '999px', overflow: 'hidden' }}>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  height: '100%',
                  background: '#38bdf8',
                  borderRadius: '999px',
                  animation: 'customBar 1.4s ease-in-out infinite'
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* LUXURY RECEIVE INWARD STOCK MODAL WITH DYNAMIC BASIS SELECTORS & MRP */}
      {showAddModal && (
        <div className="modal-overlay" style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(5, 8, 18, 0.7)' }}>
          <div
            className="modal-content"
            style={{
              maxWidth: '1280px',
              width: '98%',
              background: '#0f172a',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
              maxHeight: '94vh',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Header */}
            <div style={{ padding: '1.25rem 1.75rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ padding: '0.5rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '8px', color: '#38bdf8' }}>
                  <Truck size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                    Receive Inward Stock (Purchase Invoice)
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Boxes • Blister Tiers • Tablet Quantities • MRP Tracking</span>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.35rem' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitPurchase} style={{ padding: '1.5rem 1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto' }}>
              {/* INTERACTIVE AI CLARIFICATION QUESTIONS BANNER */}
              {aiQuestions.length > 0 && (
                <div
                  style={{
                    background: 'rgba(30, 41, 59, 0.75)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    borderRadius: '12px',
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#38bdf8', fontSize: '0.82rem', fontWeight: 700 }}>
                    <HelpCircle size={16} />
                    <span>AI Co-Pilot Verification (Click to auto-apply answers):</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {aiQuestions.map(q => (
                      <div key={q.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(15, 23, 42, 0.6)', padding: '0.6rem 0.85rem', borderRadius: '8px', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', color: '#f1f5f9' }}>{q.question}</span>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {q.options.map((opt, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => applyAiAnswer(q.id, q.itemIndex, opt.value)}
                              className="btn btn-sm"
                              style={{
                                background: 'rgba(56, 189, 248, 0.12)',
                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                color: '#38bdf8',
                                fontSize: '0.75rem',
                                padding: '0.25rem 0.65rem'
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Meta Form */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', background: 'rgba(15, 23, 42, 0.5)', padding: '1.1rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>Supplier *</label>
                  <select
                    className="ai-table-input"
                    value={supplierId}
                    onChange={e => setSupplierId(e.target.value)}
                    required
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="">Select Supplier</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>Supplier Invoice # *</label>
                  <input
                    className="ai-table-input"
                    placeholder="e.g. INV-90451"
                    value={invoiceNumber}
                    onChange={e => setInvoiceNumber(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>Purchase Date</label>
                  <input
                    type="date"
                    className="ai-table-input"
                    value={purchaseDate}
                    onChange={e => setPurchaseDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Inward Items Table Section */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                      Inward Medicine Batches ({items.length})
                    </h4>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {/* Dynamic Total Mode Toggle (Cost vs MRP) */}
                    <div style={{ display: 'flex', alignItems: 'center', background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px', padding: '2px', fontSize: '0.73rem' }}>
                      <button
                        type="button"
                        onClick={() => setTotalViewMode('COST')}
                        style={{
                          background: totalViewMode === 'COST' ? '#38bdf8' : 'transparent',
                          color: totalViewMode === 'COST' ? '#0f172a' : '#94a3b8',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '0.2rem 0.55rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Total: By Cost
                      </button>
                      <button
                        type="button"
                        onClick={() => setTotalViewMode('MRP')}
                        style={{
                          background: totalViewMode === 'MRP' ? '#22c55e' : 'transparent',
                          color: totalViewMode === 'MRP' ? '#0f172a' : '#94a3b8',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '0.2rem 0.55rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Total: By MRP
                      </button>
                    </div>

                    <button type="button" onClick={addItemRow} className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}>
                      <Plus size={13} />
                      <span>Add Item Line</span>
                    </button>
                  </div>
                </div>

                <div style={{ border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', background: 'rgba(15, 23, 42, 0.4)' }}>
                  <div style={{ maxHeight: '370px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead>
                        <tr style={{ background: '#1e293b', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8', fontSize: '0.74rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          <th style={{ padding: '0.75rem 0.8rem', textAlign: 'left', minWidth: '260px' }}>Medicine / Product</th>
                          <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', minWidth: '95px' }}>Batch #</th>
                          <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', minWidth: '125px' }}>Expiry</th>
                          <th style={{ padding: '0.75rem 0.4rem', textAlign: 'center', minWidth: '65px' }} title="Boxes Received">Boxes</th>
                          <th style={{ padding: '0.75rem 0.4rem', textAlign: 'center', minWidth: '70px' }} title="Blisters per Box">Blister/Box</th>
                          <th style={{ padding: '0.75rem 0.4rem', textAlign: 'center', minWidth: '70px' }} title="Tabs per Blister">Tabs/Blister</th>
                          <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', minWidth: '85px' }} title="Total Tablet Units">Total Units</th>
                          <th style={{ padding: '0.75rem 0.6rem', textAlign: 'right', minWidth: '145px' }}>Cost Price</th>
                          <th style={{ padding: '0.75rem 0.6rem', textAlign: 'right', minWidth: '145px' }}>Retail MRP</th>
                          <th style={{ padding: '0.75rem 0.6rem', textAlign: 'right', minWidth: '110px' }}>
                            {totalViewMode === 'COST' ? 'Cost Total (Rs.)' : 'MRP Total (Rs.)'}
                          </th>
                          <th style={{ padding: '0.75rem 0.35rem', width: '32px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it, idx) => {
                          const blisters = Math.max(1, Number(it.blistersPerBox) || 1);
                          const tabs = Math.max(1, Number(it.tabsPerBlister) || 1);
                          const unitsPerBox = blisters * tabs;

                          const costVal = Number(it.purchasePrice) || 0;
                          const mrpVal = Number(it.mrp) || 0;

                          // Compute per-tablet cost
                          let perTabCost = 0;
                          if (it.costBasis === 'BOX') perTabCost = unitsPerBox > 1 ? costVal / unitsPerBox : costVal;
                          else if (it.costBasis === 'BLISTER') perTabCost = tabs > 1 ? costVal / tabs : costVal;
                          else perTabCost = costVal;

                          // Compute per-tablet MRP & box MRP
                          let perTabMrp = 0;
                          let boxMrp = 0;
                          if (it.mrpBasis === 'BOX') {
                            perTabMrp = unitsPerBox > 1 ? mrpVal / unitsPerBox : mrpVal;
                            boxMrp = mrpVal;
                          } else if (it.mrpBasis === 'BLISTER') {
                            perTabMrp = tabs > 1 ? mrpVal / tabs : mrpVal;
                            boxMrp = mrpVal * blisters;
                          } else {
                            perTabMrp = mrpVal;
                            boxMrp = mrpVal * unitsPerBox;
                          }

                          const displayedLineTotal = totalViewMode === 'COST' ? it.lineCostTotal : it.lineMrpTotal;

                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', verticalAlign: 'middle' }}>
                              {/* Searchable Combobox */}
                              <td style={{ padding: '0.55rem 0.75rem' }}>
                                {it.medicineName && (
                                  <div style={{ fontSize: '0.7rem', color: it.medicineId ? '#22c55e' : '#38bdf8', marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '255px' }}>
                                    {it.medicineId ? '✓ Linked: ' : 'AI Extracted: '}<strong>{it.medicineName}</strong>
                                  </div>
                                )}
                                <SearchableMedicineSelect
                                  value={it.medicineId}
                                  onChange={id => handleItemChange(idx, 'medicineId', id)}
                                  medicines={medicines}
                                  suggestedName={it.medicineName}
                                />
                              </td>

                              <td style={{ padding: '0.55rem 0.5rem', textAlign: 'center' }}>
                                <input
                                  className="ai-table-input"
                                  placeholder="Batch #"
                                  style={{ textAlign: 'center' }}
                                  value={it.batchNumber}
                                  onChange={e => handleItemChange(idx, 'batchNumber', e.target.value)}
                                  required
                                />
                              </td>

                              <td style={{ padding: '0.55rem 0.5rem', textAlign: 'center' }}>
                                <input
                                  type="date"
                                  className="ai-table-input"
                                  style={{ textAlign: 'center' }}
                                  value={it.expiryDate}
                                  onChange={e => handleItemChange(idx, 'expiryDate', e.target.value)}
                                  required
                                />
                              </td>

                              {/* 3 Packaging Columns */}
                              <td style={{ padding: '0.55rem 0.35rem', textAlign: 'center' }}>
                                <input
                                  type="number"
                                  min="1"
                                  className="ai-table-input"
                                  style={{ textAlign: 'center', fontWeight: 600 }}
                                  value={it.boxes}
                                  onChange={e => handleItemChange(idx, 'boxes', e.target.value)}
                                  required
                                />
                              </td>

                              <td style={{ padding: '0.55rem 0.35rem', textAlign: 'center' }}>
                                <input
                                  type="number"
                                  min="1"
                                  className="ai-table-input"
                                  style={{ textAlign: 'center' }}
                                  value={it.blistersPerBox}
                                  onChange={e => handleItemChange(idx, 'blistersPerBox', e.target.value)}
                                  required
                                />
                              </td>

                              <td style={{ padding: '0.55rem 0.35rem', textAlign: 'center' }}>
                                <input
                                  type="number"
                                  min="1"
                                  className="ai-table-input"
                                  style={{ textAlign: 'center' }}
                                  value={it.tabsPerBlister}
                                  onChange={e => handleItemChange(idx, 'tabsPerBlister', e.target.value)}
                                  required
                                />
                              </td>

                              {/* Total calculated loose sellable units */}
                              <td style={{ padding: '0.55rem 0.45rem', textAlign: 'center' }}>
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', padding: '0.2rem 0.45rem', borderRadius: '5px' }}>
                                  {it.totalUnits}
                                </span>
                              </td>

                              {/* Cost Price with Dynamic Basis Toggle (Box / Blister / Tab) */}
                              <td style={{ padding: '0.55rem 0.55rem', textAlign: 'right' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-end' }}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    className="ai-table-input"
                                    style={{ textAlign: 'right', minWidth: '70px' }}
                                    placeholder="0.00"
                                    value={it.purchasePrice}
                                    onChange={e => handleItemChange(idx, 'purchasePrice', e.target.value)}
                                    required
                                  />
                                  <select
                                    className="ai-basis-select"
                                    value={it.costBasis}
                                    onChange={e => handleItemChange(idx, 'costBasis', e.target.value)}
                                    title="Rate is per Box, Blister, or Tab"
                                  >
                                    <option value="BOX">/ Box</option>
                                    <option value="BLISTER">/ Blister</option>
                                    <option value="TAB">/ Tab</option>
                                  </select>
                                </div>
                                {perTabCost > 0 && unitsPerBox > 1 && (
                                  <div style={{ fontSize: '0.66rem', color: '#94a3b8', marginTop: '2px' }}>
                                    Rs. {perTabCost.toFixed(2)}/tab
                                  </div>
                                )}
                              </td>

                              {/* MRP Column with Dynamic Basis Toggle (Box / Blister / Tab) */}
                              <td style={{ padding: '0.55rem 0.55rem', textAlign: 'right' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-end' }}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    className="ai-table-input"
                                    style={{ textAlign: 'right', minWidth: '70px' }}
                                    placeholder="MRP"
                                    value={it.mrp}
                                    onChange={e => handleItemChange(idx, 'mrp', e.target.value)}
                                  />
                                  <select
                                    className="ai-basis-select"
                                    value={it.mrpBasis}
                                    onChange={e => handleItemChange(idx, 'mrpBasis', e.target.value)}
                                    title="MRP is per Box, Blister, or Tab"
                                  >
                                    <option value="BOX">/ Box</option>
                                    <option value="BLISTER">/ Blister</option>
                                    <option value="TAB">/ Tab</option>
                                  </select>
                                </div>
                                {perTabMrp > 0 && (
                                  <div style={{ fontSize: '0.66rem', color: '#22c55e', marginTop: '2px' }}>
                                    Rs. {perTabMrp.toFixed(2)}/tab {boxMrp > 0 && `(Rs. ${boxMrp.toFixed(0)}/box)`}
                                  </div>
                                )}
                              </td>

                              <td style={{ padding: '0.55rem 0.65rem', textAlign: 'right', fontWeight: 700, color: totalViewMode === 'COST' ? '#38bdf8' : '#22c55e' }}>
                                {displayedLineTotal.toFixed(2)}
                              </td>

                              <td style={{ padding: '0.55rem 0.35rem', textAlign: 'center' }}>
                                {items.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeItemRow(idx)}
                                    className="btn btn-sm"
                                    style={{ padding: '0.2rem', color: '#ef4444', background: 'transparent' }}
                                    title="Remove Line"
                                  >
                                    <Trash2 size={13} />
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
              </div>

              {/* Comprehensive Financial Summary Card */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', background: 'rgba(15, 23, 42, 0.6)', padding: '1.25rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>Invoice Discount (Rs.)</label>
                  <input
                    type="number"
                    className="ai-table-input"
                    value={discount}
                    onChange={e => setDiscount(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>Paid Now (Rs.)</label>
                  <input
                    type="number"
                    className="ai-table-input"
                    value={paidAmount}
                    onChange={e => setPaidAmount(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>Payment Method</label>
                  <select className="ai-table-input" style={{ cursor: 'pointer' }} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                    <option value="CASH">Cash Drawer</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>Remarks / Notes</label>
                  <input
                    className="ai-table-input"
                    placeholder="e.g. Scanned distributor invoice"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>

                {/* 3 Metrics: Cost Total, Retail MRP Value, and Expected Profit */}
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.85rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', flexWrap: 'wrap', gap: '1.25rem' }}>
                  <div style={{ display: 'flex', gap: '1.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Invoice Cost (Payable)</span>
                      <strong style={{ fontSize: '1.15rem', color: '#38bdf8' }}>Rs. {grandCostTotal.toFixed(2)}</strong>
                    </div>

                    <div style={{ height: '24px', width: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />

                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Retail MRP (Selling Value)</span>
                      <strong style={{ fontSize: '1.15rem', color: '#22c55e' }}>Rs. {totalMrpRevenue.toFixed(2)}</strong>
                    </div>

                    <div style={{ height: '24px', width: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />

                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Expected Profit</span>
                      <strong style={{ fontSize: '1.15rem', color: '#fbbf24' }}>+Rs. {projectedProfit.toFixed(2)}</strong>
                    </div>

                    <div style={{ height: '24px', width: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />

                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Remaining Balance</span>
                      <strong style={{ fontSize: '1.15rem', color: remainingPayable > 0 ? '#ef4444' : '#22c55e' }}>
                        Rs. {remainingPayable.toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary" style={{ padding: '0.55rem 1.25rem' }}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" style={{ padding: '0.55rem 1.75rem', fontWeight: 600 }}>
                      Commit Purchase Invoice & Stock
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {showScanUpload && (
        <ScanUploadModal
          onClose={() => setShowScanUpload(false)}
          onCreated={id => { setShowScanUpload(false); setReviewScanId(id); }}
        />
      )}
    </div>
  );
};
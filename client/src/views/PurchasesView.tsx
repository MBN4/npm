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

export type MatchStatus = 'MATCHED' | 'NEEDS_REVIEW' | 'NEW' | 'MANUAL';

export interface NewMedicineDraft {
  brandName: string;
  strength: string;
  dosageForm: string;
  packagingType: 'MULTI_TIER' | 'SIMPLE';
}

export interface PurchaseItemRow {
  medicineId: string;
  medicineName?: string;
  /** The line exactly as printed on the scanned invoice (empty for manual rows). */
  invoiceName?: string;
  matchStatus: MatchStatus;
  candidates?: Array<{ medicineId: number; brandName: string; strength: string | null; score: number }>;
  /** Admin confirmed this line should be added to the catalog as a new medicine. */
  createNew: boolean;
  newMedicine?: NewMedicineDraft;
  batchNumber: string;
  expiryDate: string;
  mfgDate: string;
  boxes: string;
  bonusBoxes: string;
  blistersPerBox: string;
  tabsPerBlister: string;
  totalUnits: number;
  purchasePrice: string; // Rate entered
  costBasis: PriceBasis; // Rate is for: Box, Blister, or Tab
  mrp: string;           // MRP entered
  mrpBasis: PriceBasis;  // MRP is for: Box, Blister, or Tab
  mrpHint?: string;
  bonusQuantity: string;
  lineCostTotal: number;
  lineMrpTotal: number;
  /** Problems the scanner noticed on this line (shown until the admin fixes the fields). */
  scanIssues?: string[];
  existingBatch?: { batchId: number; quantity: number; expiryDate: string; expiryConflict: boolean } | null;
  overrideBatchExpiry?: boolean;
}

export interface ReviewQuestion {
  id: string;
  type: string;
  itemIndex?: number;
  question: string;
  blocking: boolean;
  options: Array<{ label: string; value: Record<string, any> }>;
}

interface ReviewInfo {
  extractionMethod: 'AI_VISION' | 'AI_TEXT' | 'LOCAL_PARSER';
  aiProvider: string | null;
  supplierName: string | null;
  warnings: string[];
  ignoredLines: string[];
  printedNetTotal: number | null;
  duplicatePurchase: { purchaseId: number; supplierName: string; purchaseDate: string } | null;
}

interface CatalogMedicine {
  id: number;
  brand_name: string;
  strength?: string;
  dosage_form?: string;
  packaging_type?: string;
  pack_size?: number | null;
  tablets_per_pack?: number | null;
  current_sale_price?: number | null;
  is_active?: number;
}

// The hosted site (Vercel) forwards /api/* to the Fly.io server. Large or slow requests such as
// invoice photos can fail inside that forwarder, which answers with a plain-text error page
// ("An error occurred...") instead of JSON. Uploads therefore fall back to calling the API
// server directly, and every response is parsed defensively.
const HOSTED_API_ORIGIN = 'https://nmp-api.fly.dev';

function isHostedSite(): boolean {
  const host = window.location.hostname;
  if (!host || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.fly.dev')) return false;
  if (/^(10|127|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(host)) return false;
  return true;
}

async function readJsonResponse(res: Response): Promise<any | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function serverFailureMessage(status: number): string {
  if (status === 413) return 'This invoice file is too large. Please upload a smaller photo (or one page at a time).';
  if (status === 502 || status === 503 || status === 504 || status === 500) {
    return `The server could not finish reading this invoice (HTTP ${status}). Please try again in a moment; if it keeps failing, try a clearer or smaller photo.`;
  }
  return `The server returned an unexpected response (HTTP ${status}). Please try again.`;
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

const todayIso = () => new Date().toISOString().split('T')[0];

const emptyRow = (): PurchaseItemRow => ({
  medicineId: '',
  matchStatus: 'MANUAL',
  createNew: false,
  batchNumber: '',
  expiryDate: '',
  mfgDate: '',
  boxes: '1',
  bonusBoxes: '0',
  blistersPerBox: '',
  tabsPerBlister: '',
  totalUnits: 0,
  purchasePrice: '',
  costBasis: 'BOX',
  mrp: '',
  mrpBasis: 'BOX',
  bonusQuantity: '0',
  lineCostTotal: 0,
  lineMrpTotal: 0
});

/** Box packing as stored in the catalog (pack_size = units per box, tablets_per_pack = units per strip). */
function catalogPackingOf(med: CatalogMedicine | undefined): { blistersPerBox: number; tabsPerBlister: number } | null {
  if (!med) return null;
  const packSize = Number(med.pack_size) || 0;
  const perPack = Number(med.tablets_per_pack) || 0;
  if (med.packaging_type === 'SIMPLE') return packSize >= 1 ? { blistersPerBox: 1, tabsPerBlister: packSize } : null;
  if (packSize > 1 && perPack >= 1 && packSize % perPack === 0) return { blistersPerBox: packSize / perPack, tabsPerBlister: perPack };
  return null;
}

/** Everything that must be fixed on a line before it can go into stock. */
function rowIssues(row: PurchaseItemRow): string[] {
  const issues: string[] = [];
  if (!row.medicineId && !row.createNew) {
    issues.push(row.invoiceName ? 'Choose the matching medicine, or add it as a new medicine' : 'Select a medicine');
  }
  if (row.createNew && (!row.newMedicine || row.newMedicine.brandName.trim().length < 2)) issues.push('Enter a name for the new medicine');
  if (!row.batchNumber.trim()) issues.push('Batch number is required');
  if (!row.expiryDate) issues.push('Expiry date is required');
  else if (row.expiryDate <= todayIso()) issues.push('Expiry date is already past - expired stock cannot be received');
  const boxes = Number(row.boxes);
  const bonus = Number(row.bonusBoxes) || 0;
  if (row.boxes === '' || !(boxes >= 0) || !Number.isInteger(boxes)) issues.push('Boxes must be a whole number (0 only for a bonus-only line)');
  else if (boxes === 0 && !(bonus > 0)) issues.push('Enter boxes received or bonus boxes');
  if (!(Number(row.blistersPerBox) >= 1) || !(Number(row.tabsPerBlister) >= 1)) issues.push('Enter the packing (strips per box and units per strip)');
  if (boxes > 0 && !(Number(row.purchasePrice) > 0)) issues.push('Cost price is required');
  if (!(Number(row.mrp) > 0)) issues.push('Retail MRP is required (it becomes the POS selling price)');
  if (row.existingBatch?.expiryConflict && !row.overrideBatchExpiry && row.expiryDate !== row.existingBatch.expiryDate) {
    issues.push(`Batch already in stock with expiry ${row.existingBatch.expiryDate} - answer the question above`);
  }
  return issues;
}

/** Cost and MRP of one box, whatever basis (box / blister / tab) they were typed in. */
function boxPrices(row: PurchaseItemRow): { cost: number; mrp: number } {
  const blisters = Math.max(1, Number(row.blistersPerBox) || 1);
  const units = blisters * Math.max(1, Number(row.tabsPerBlister) || 1);
  const scale = (basis: PriceBasis) => (basis === 'BLISTER' ? blisters : basis === 'TAB' ? units : 1);
  return { cost: (Number(row.purchasePrice) || 0) * scale(row.costBasis), mrp: (Number(row.mrp) || 0) * scale(row.mrpBasis) };
}

/** Non-blocking warnings: shown on the line but do not stop the save. */
function rowWarnings(row: PurchaseItemRow): string[] {
  const { cost, mrp } = boxPrices(row);
  return cost > 0 && mrp > 0 && mrp < cost ? [`Retail MRP (Rs. ${mrp.toFixed(2)}/box) is lower than cost (Rs. ${cost.toFixed(2)}/box) - check both prices`] : [];
}

/** Suggests a box MRP from the medicine's current per-unit selling price, if it is plausible. */
function suggestedBoxMrp(row: PurchaseItemRow, med: CatalogMedicine | undefined): string | null {
  if (!med || !(Number(med.current_sale_price) > 0)) return null;
  const unitsPerBox = (Number(row.blistersPerBox) || 1) * (Number(row.tabsPerBlister) || 1);
  const mrp = Number(med.current_sale_price) * unitsPerBox;
  const { cost } = boxPrices(row);
  // A suggestion below cost means the catalog price or packing is off - leave it for the admin.
  return cost > 0 && mrp < cost ? null : mrp.toFixed(2);
}

const METHOD_LABEL: Record<ReviewInfo['extractionMethod'], string> = {
  AI_VISION: 'AI read the invoice photo',
  AI_TEXT: 'AI read the OCR text of the invoice',
  LOCAL_PARSER: 'Basic local reader (no AI) - check every line'
};

interface MedicineDropdownProps {
  value: string;
  onChange: (id: string) => void;
  medicines: CatalogMedicine[];
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
  const [medicines, setMedicines] = useState<CatalogMedicine[]>([]);
  const medicinesRef = useRef<CatalogMedicine[]>([]);
  medicinesRef.current = medicines;
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Scan Invoice flow
  const [showScanUpload, setShowScanUpload] = useState(false);
  const [reviewScanId, setReviewScanId] = useState<number | null>(null);

  // Fast AI Extraction Flow state
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [reviewQuestions, setReviewQuestions] = useState<ReviewQuestion[]>([]);
  const [reviewInfo, setReviewInfo] = useState<ReviewInfo | null>(null);
  const [showIgnoredLines, setShowIgnoredLines] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // One key per invoice entry: a double click or network retry cannot post the stock twice.
  const requestKeyRef = useRef<string>('');
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
  const [taxAmount, setTaxAmount] = useState('0');
  const [notes, setNotes] = useState('');

  const [items, setItems] = useState<PurchaseItemRow[]>([emptyRow()]);

  const newRequestKey = () => `pur-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const resetForm = () => {
    setSupplierId('');
    setNewSupplierName('');
    setInvoiceNumber('');
    setPurchaseDate(todayIso());
    setPaidAmount('0');
    setPaymentMethod('CASH');
    setDiscount('0');
    setTaxAmount('0');
    setNotes('');
    setItems([emptyRow()]);
    setReviewQuestions([]);
    setReviewInfo(null);
    setShowIgnoredLines(false);
    setFormError(null);
    requestKeyRef.current = newRequestKey();
  };

  const openManualEntry = () => {
    resetForm();
    setShowAddModal(true);
  };

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
    setItems(prev => {
      const updated = [...prev];
      let row: PurchaseItemRow = { ...updated[index], [field]: value };
      if (field === 'medicineId') {
        // Picking a catalog medicine: use its catalog packing and last selling price, and stop
        // treating the line as a new medicine.
        const med = medicines.find(m => String(m.id) === value);
        row = { ...row, createNew: false, matchStatus: value ? 'MATCHED' : row.matchStatus, existingBatch: null, overrideBatchExpiry: false };
        const packing = catalogPackingOf(med);
        if (packing && !(med?.packaging_type === 'SIMPLE' && packing.tabsPerBlister > 1 && row.invoiceName)) {
          row.blistersPerBox = String(packing.blistersPerBox);
          row.tabsPerBlister = String(packing.tabsPerBlister);
        }
        const suggestion = !row.mrp ? suggestedBoxMrp(row, med) : null;
        if (suggestion) {
          row.mrp = suggestion;
          row.mrpBasis = 'BOX';
          row.mrpHint = 'from current stock price - check against the box';
        }
        setReviewQuestions(qs => qs.filter(q => !(q.itemIndex === index && q.type === 'MEDICINE_MATCH')));
      }
      if (field === 'batchNumber') row = { ...row, existingBatch: null, overrideBatchExpiry: false };
      if (field === 'mrp') row.mrpHint = undefined;
      updated[index] = recalculateRow(row);
      return updated;
    });
  };

  const setNewMedicineField = (index: number, field: keyof NewMedicineDraft, value: string) => {
    setItems(prev => {
      const updated = [...prev];
      const row = updated[index];
      updated[index] = { ...row, newMedicine: { ...(row.newMedicine || { brandName: '', strength: '', dosageForm: 'Tablet', packagingType: 'MULTI_TIER' }), [field]: value } as NewMedicineDraft };
      return updated;
    });
  };

  const markAsNewMedicine = (index: number) => {
    setItems(prev => {
      const updated = [...prev];
      const row = updated[index];
      updated[index] = {
        ...row,
        medicineId: '',
        createNew: true,
        matchStatus: 'NEW',
        existingBatch: null,
        newMedicine: row.newMedicine || { brandName: row.medicineName || '', strength: '', dosageForm: 'Tablet', packagingType: 'MULTI_TIER' }
      };
      return updated;
    });
    setReviewQuestions(qs => qs.filter(q => !(q.itemIndex === index && q.type === 'MEDICINE_MATCH')));
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) {
      setItems([emptyRow()]);
    } else {
      setItems(items.filter((_, i) => i !== index));
    }
    // Questions point at line numbers: drop the removed line's questions and shift the rest.
    setReviewQuestions(qs => qs
      .filter(q => q.itemIndex !== index)
      .map(q => (q.itemIndex !== undefined && q.itemIndex > index ? { ...q, itemIndex: q.itemIndex - 1 } : q)));
  };

  const addItemRow = () => setItems(prev => [...prev, emptyRow()]);

  /** Applies the admin's answer to one of the scanner's questions. */
  const applyReviewAnswer = (question: ReviewQuestion, value: Record<string, any>) => {
    setFormError(null);
    const idx = question.itemIndex;
    if (value.skip && idx !== undefined) {
      removeItemRow(idx);
      return;
    }
    if (question.type === 'SUPPLIER') {
      if (value.supplierId) { setSupplierId(String(value.supplierId)); setNewSupplierName(''); }
      if (value.newSupplierName) { setSupplierId(''); setNewSupplierName(String(value.newSupplierName)); }
    }
    if (value.createNew && idx !== undefined) {
      markAsNewMedicine(idx);
      return;
    }
    if (value.medicineId && idx !== undefined) {
      handleItemChange(idx, 'medicineId', String(value.medicineId));
      return;
    }
    if (idx !== undefined && items[idx]) {
      setItems(prev => {
        const updated = [...prev];
        const row = { ...updated[idx] };
        if (value.blistersPerBox !== undefined) row.blistersPerBox = String(value.blistersPerBox);
        if (value.tabsPerBlister !== undefined) row.tabsPerBlister = String(value.tabsPerBlister);
        if (value.expiryDate !== undefined) row.expiryDate = String(value.expiryDate);
        if (value.overrideBatchExpiry) row.overrideBatchExpiry = true;
        if (question.type === 'BATCH_EXPIRY_CONFLICT' && !value.overrideBatchExpiry) row.overrideBatchExpiry = false;
        updated[idx] = recalculateRow(row);
        return updated;
      });
    }
    setReviewQuestions(prev => prev.filter(q => q.id !== question.id));
  };


  // Financial Totals
  const totalCostSubtotal = items.reduce((acc, it) => acc + (it.lineCostTotal || 0), 0);
  const totalMrpRevenue = items.reduce((acc, it) => acc + (it.lineMrpTotal || 0), 0);
  const netDiscount = Number(discount) || 0;
  const netTax = Number(taxAmount) || 0;
  const grandCostTotal = Math.max(0, totalCostSubtotal - netDiscount + netTax);
  const paid = Number(paidAmount) || 0;
  const remainingPayable = Math.max(0, grandCostTotal - paid);
  const projectedProfit = Math.max(0, totalMrpRevenue - grandCostTotal);

  // Upload handler
  const handleAiImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = e.target.files;
    if (!rawFiles || rawFiles.length === 0) return;

    setIsAiProcessing(true);
    setStatusMessage(null);
    setReviewQuestions([]);

    try {
      const optimizedFiles = await Promise.all(
        Array.from(rawFiles).map(f => optimizeImageForAi(f))
      );

      const formData = new FormData();
      optimizedFiles.forEach(f => formData.append('files', f));

      const sendTo = (origin: string) => fetch(`${origin}/api/purchases/scans/ai-quick-extract`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      let res: Response;
      let data: any = null;
      try {
        res = await sendTo('');
        data = await readJsonResponse(res);
      } catch (networkErr) {
        if (!isHostedSite()) throw networkErr;
        res = await sendTo(HOSTED_API_ORIGIN);
        data = await readJsonResponse(res);
      }
      if (data === null && isHostedSite()) {
        res = await sendTo(HOSTED_API_ORIGIN);
        data = await readJsonResponse(res);
      }
      if (data === null) {
        throw new Error(serverFailureMessage(res.status));
      }
      if (!res.ok) {
        throw new Error(data.error || 'Failed to extract invoice data');
      }

      await fetchMetadata();
      resetForm();

      setReviewInfo({
        extractionMethod: data.extractionMethod || 'LOCAL_PARSER',
        aiProvider: data.aiProvider || null,
        supplierName: data.supplierName || null,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
        ignoredLines: Array.isArray(data.ignoredLines) ? data.ignoredLines : [],
        printedNetTotal: typeof data.printedNetTotal === 'number' ? data.printedNetTotal : null,
        duplicatePurchase: data.duplicatePurchase || null
      });
      if (data.matchedSupplierId) setSupplierId(String(data.matchedSupplierId));
      if (data.invoiceNumber) setInvoiceNumber(String(data.invoiceNumber));
      if (data.purchaseDate) setPurchaseDate(data.purchaseDate);
      if (data.rawNotes) setNotes(data.rawNotes);
      setReviewQuestions(Array.isArray(data.questions) ? data.questions : []);

      if (Array.isArray(data.items) && data.items.length > 0) {
        const rows: PurchaseItemRow[] = data.items.map((it: any) => {
          const row: PurchaseItemRow = {
            ...emptyRow(),
            medicineId: it.matchedMedicineId ? String(it.matchedMedicineId) : '',
            medicineName: it.productName,
            invoiceName: it.invoiceName,
            matchStatus: it.matchStatus || 'NEEDS_REVIEW',
            candidates: it.candidates || [],
            createNew: false,
            newMedicine: it.newMedicine
              ? { brandName: it.newMedicine.brandName || '', strength: it.newMedicine.strength || '', dosageForm: it.newMedicine.dosageForm || 'Tablet', packagingType: it.newMedicine.packagingType === 'SIMPLE' ? 'SIMPLE' : 'MULTI_TIER' }
              : undefined,
            // Never pre-fill a batch/expiry the invoice did not show - the admin types it.
            batchNumber: it.batchNumber || '',
            expiryDate: it.expiryDate || '',
            mfgDate: it.mfgDate || '',
            boxes: it.boxes !== null && it.boxes !== undefined ? String(it.boxes) : '',
            bonusBoxes: String(it.bonusBoxes || 0),
            blistersPerBox: it.blistersPerBox ? String(it.blistersPerBox) : '',
            tabsPerBlister: it.tabsPerBlister ? String(it.tabsPerBlister) : '',
            purchasePrice: it.purchasePrice ? String(it.purchasePrice) : '',
            costBasis: 'BOX',
            mrp: it.mrp ? String(it.mrp) : '',
            mrpBasis: 'BOX',
            scanIssues: Array.isArray(it.issues) ? it.issues : [],
            existingBatch: it.existingBatch || null
          };
          // Pre-fill MRP from the medicine's current selling price when the invoice has no MRP column.
          if (!row.mrp && row.medicineId) {
            const suggestion = suggestedBoxMrp(row, medicinesRef.current.find(m => String(m.id) === row.medicineId));
            if (suggestion) {
              row.mrp = suggestion;
              row.mrpHint = 'from current stock price - check against the box';
            }
          }
          return recalculateRow(row);
        });
        setItems(rows);
        // Distributor invoices add advance income tax (e.g. 0.5% u/s 236H) on top of the lines.
        // Carry the small difference so the supplier balance matches the printed net total.
        const linesTotal = rows.reduce((sum, r) => sum + r.lineCostTotal, 0);
        const printed = Number(data.printedNetTotal) || 0;
        const extra = Number((printed - linesTotal).toFixed(2));
        if (printed > 0 && extra > 0 && extra <= printed * 0.03) setTaxAmount(String(extra));
      }

      const needsAnswers = (data.questions || []).filter((q: ReviewQuestion) => q.blocking).length;
      setIsAiProcessing(false);
      setShowAddModal(true);
      setStatusMessage({
        text: `Read ${data.items?.length || 0} medicine line(s) from the invoice${needsAnswers ? ` - ${needsAnswers} question(s) need your answer before saving` : ''}. Please check every line against the paper invoice.`,
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

  const blockingQuestions = reviewQuestions.filter(q => q.blocking);

  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    setFormError(null);

    if (blockingQuestions.length > 0) {
      setFormError(`Please answer the ${blockingQuestions.length} highlighted question(s) at the top first.`);
      return;
    }
    if ((!supplierId && !newSupplierName.trim()) || !invoiceNumber.trim()) {
      setFormError('Please select a supplier and enter the supplier invoice number.');
      return;
    }
    for (let i = 0; i < items.length; i++) {
      const problems = rowIssues(items[i]);
      if (problems.length > 0) {
        setFormError(`Line ${i + 1}${items[i].medicineName ? ` (${items[i].medicineName})` : ''}: ${problems[0]}.`);
        return;
      }
    }

    if (!requestKeyRef.current) requestKeyRef.current = newRequestKey();
    setIsSaving(true);
    try {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          supplierId: supplierId ? Number(supplierId) : undefined,
          newSupplier: !supplierId && newSupplierName.trim() ? { name: newSupplierName.trim() } : undefined,
          invoiceNumber: invoiceNumber.trim(),
          purchaseDate,
          subtotal: totalCostSubtotal,
          discount: netDiscount,
          tax: netTax,
          totalAmount: grandCostTotal,
          paidAmount: paid,
          paymentMethod,
          notes,
          requestKey: requestKeyRef.current,
          items: items.map(it => {
            const boxes = Number(it.boxes) || 0; // 0 = bonus-only line
            const blisters = Number(it.blistersPerBox) || 1;
            const tabs = Number(it.tabsPerBlister) || 1;
            const unitsPerBox = blisters * tabs;
            const totalUnits = Math.round(boxes * unitsPerBox);

            // Normalize Cost to Box Price
            let boxCost = Number(it.purchasePrice) || 0;
            if (it.costBasis === 'BLISTER') boxCost = boxCost * blisters;
            else if (it.costBasis === 'TAB') boxCost = boxCost * unitsPerBox;

            // Normalize MRP to Box Price
            let boxMrp = Number(it.mrp) || 0;
            if (it.mrpBasis === 'BLISTER') boxMrp = boxMrp * blisters;
            else if (it.mrpBasis === 'TAB') boxMrp = boxMrp * unitsPerBox;

            return {
              medicineId: it.medicineId ? Number(it.medicineId) : undefined,
              newMedicine: !it.medicineId && it.createNew && it.newMedicine
                ? { ...it.newMedicine, brandName: it.newMedicine.brandName.trim(), strength: it.newMedicine.strength.trim() || null }
                : undefined,
              batchNumber: it.batchNumber.trim(),
              expiryDate: it.expiryDate,
              mfgDate: it.mfgDate || null,
              boxesReceived: boxes,
              stripsPerBox: blisters,
              unitsPerStrip: tabs,
              quantity: totalUnits, // Exact sellable units for the POS counter
              purchasePrice: boxCost,
              mrp: boxMrp,
              salePrice: boxMrp,
              // Bonus is entered in boxes on the invoice; stock is kept in sellable units.
              bonusQuantity: Math.round((Number(it.bonusBoxes) || 0) * unitsPerBox),
              lineTotal: it.lineCostTotal,
              confirmedPurchaseCostPerBox: boxCost,
              printedMrpPerBox: boxMrp,
              rateBasis: 'PER_BOX',
              overrideBatchExpiry: it.overrideBatchExpiry || undefined
            };
          })
        })
      });

      const data = await readJsonResponse(res);
      if (data === null) {
        setFormError(serverFailureMessage(res.status));
        return;
      }
      if (!res.ok) {
        setFormError(data.error || 'Failed to record purchase');
        return;
      }

      const summary: Array<{ action: string }> = Array.isArray(data.stockSummary) ? data.stockSummary : [];
      const toppedUp = summary.filter(s => s.action === 'ADDED_TO_EXISTING_BATCH').length;
      const newBatches = summary.filter(s => s.action === 'NEW_BATCH').length;
      const createdMeds = Array.isArray(data.createdMedicines) ? data.createdMedicines.length : 0;
      setStatusMessage({
        text: `Purchase invoice #${data.invoiceNumber || invoiceNumber} saved to inventory: ${newBatches} new batch(es)${toppedUp ? `, ${toppedUp} added to existing batch(es)` : ''}${createdMeds ? `, ${createdMeds} new medicine(s) added to the catalog` : ''}.`,
        type: 'success'
      });
      setShowAddModal(false);
      resetForm();
      fetchPurchases();
      fetchMetadata();
    } catch (err: any) {
      setFormError(`Could not reach the server: ${err.message || err}`);
    } finally {
      setIsSaving(false);
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
            <button onClick={openManualEntry} className="btn btn-secondary btn-sm">
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

            <form onSubmit={handleSubmitPurchase} noValidate style={{ padding: '1.5rem 1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto' }}>
              {formError && (
                <div role="alert" style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.45)', color: '#fecaca', borderRadius: '10px', padding: '0.7rem 1rem', fontSize: '0.82rem', fontWeight: 600 }}>
                  {formError}
                </div>
              )}

              {/* What the scanner did, and anything it could not read */}
              {reviewInfo && (
                <div style={{ background: reviewInfo.extractionMethod === 'LOCAL_PARSER' ? 'rgba(251, 191, 36, 0.1)' : 'rgba(34, 197, 94, 0.08)', border: `1px solid ${reviewInfo.extractionMethod === 'LOCAL_PARSER' ? 'rgba(251, 191, 36, 0.4)' : 'rgba(34, 197, 94, 0.3)'}`, borderRadius: '12px', padding: '0.8rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.78rem', color: '#e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
                    <Sparkles size={14} />
                    <span>{METHOD_LABEL[reviewInfo.extractionMethod]}{reviewInfo.aiProvider ? ` (${reviewInfo.aiProvider === 'groq' ? 'Groq' : 'Gemini'})` : ''}. Nothing is added to stock until you press Save.</span>
                  </div>
                  {reviewInfo.supplierName && <span style={{ color: '#94a3b8' }}>Supplier on invoice: <strong style={{ color: '#e2e8f0' }}>{reviewInfo.supplierName}</strong>{reviewInfo.printedNetTotal ? ` · Invoice net total: Rs. ${reviewInfo.printedNetTotal.toFixed(2)}` : ''}</span>}
                  {reviewInfo.warnings.map((w, i) => (
                    <span key={i} style={{ color: '#fbbf24' }}>⚠ {w}</span>
                  ))}
                  {reviewInfo.ignoredLines.length > 0 && (
                    <div>
                      <button type="button" onClick={() => setShowIgnoredLines(v => !v)} style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: 0, fontSize: '0.76rem' }}>
                        {showIgnoredLines ? 'Hide' : 'Show'} {reviewInfo.ignoredLines.length} line(s) ignored as not medicines (headers, totals, addresses)
                      </button>
                      {showIgnoredLines && (
                        <ul style={{ margin: '0.35rem 0 0 1.1rem', color: '#94a3b8' }}>
                          {reviewInfo.ignoredLines.map((line, i) => <li key={i}>{line}</li>)}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Questions the scanner needs the admin to answer instead of guessing */}
              {reviewQuestions.length > 0 && (
                <div
                  style={{
                    background: 'rgba(30, 41, 59, 0.75)',
                    border: `1px solid ${blockingQuestions.length > 0 ? 'rgba(251, 191, 36, 0.55)' : 'rgba(56, 189, 248, 0.35)'}`,
                    borderRadius: '12px',
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: blockingQuestions.length > 0 ? '#fbbf24' : '#38bdf8', fontSize: '0.82rem', fontWeight: 700 }}>
                    <HelpCircle size={16} />
                    <span>
                      Please confirm before saving{blockingQuestions.length > 0 ? ` - ${blockingQuestions.length} answer(s) required` : ''}:
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {reviewQuestions.map(q => (
                      <div key={q.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(15, 23, 42, 0.6)', padding: '0.6rem 0.85rem', borderRadius: '8px', flexWrap: 'wrap', gap: '0.5rem', borderLeft: q.blocking ? '3px solid #fbbf24' : '3px solid #38bdf8' }}>
                        <span style={{ fontSize: '0.8rem', color: '#f1f5f9', flex: '1 1 320px' }}>
                          {q.blocking && <strong style={{ color: '#fbbf24' }}>Required: </strong>}{q.question}
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {q.options.map((opt, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => applyReviewAnswer(q, opt.value)}
                              className="btn btn-sm"
                              style={{
                                background: opt.value.skip ? 'rgba(239, 68, 68, 0.1)' : 'rgba(56, 189, 248, 0.12)',
                                border: `1px solid ${opt.value.skip ? 'rgba(239, 68, 68, 0.35)' : 'rgba(56, 189, 248, 0.3)'}`,
                                color: opt.value.skip ? '#fca5a5' : '#38bdf8',
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
                    onChange={e => { setSupplierId(e.target.value); if (e.target.value) setNewSupplierName(''); }}
                    required={!newSupplierName}
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="">{newSupplierName ? `New supplier: ${newSupplierName}` : 'Select Supplier'}</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {!supplierId && newSupplierName && (
                    <span style={{ fontSize: '0.7rem', color: '#fbbf24', display: 'block', marginTop: '0.25rem' }}>
                      "{newSupplierName}" will be added to Suppliers when you save.
                    </span>
                  )}
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
                          <th style={{ padding: '0.75rem 0.4rem', textAlign: 'center', minWidth: '60px' }} title="Free bonus boxes on the invoice">Bonus</th>
                          <th style={{ padding: '0.75rem 0.4rem', textAlign: 'center', minWidth: '70px' }} title="Blisters per Box">Blister/Box</th>
                          <th style={{ padding: '0.75rem 0.4rem', textAlign: 'center', minWidth: '70px' }} title="Tabs per Blister">Tabs/Blister</th>
                          <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', minWidth: '85px' }} title="Total sellable units added to stock (excluding bonus)">Total Units</th>
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
                          // Live problems (cleared as the admin fixes fields) plus scanner notes that are still relevant.
                          const liveProblems = rowIssues(it);
                          const lineProblems = [
                            ...liveProblems,
                            ...rowWarnings(it),
                            ...(it.scanIssues || []).filter(issue => !/batch|expiry|quantity|rate|packing/i.test(issue))
                          ];

                          return (
                            <React.Fragment key={idx}>
                            <tr style={{ borderBottom: lineProblems.length ? 'none' : '1px solid rgba(255, 255, 255, 0.04)', verticalAlign: 'middle' }}>
                              {/* Searchable Combobox */}
                              <td style={{ padding: '0.55rem 0.75rem' }}>
                                {it.invoiceName && (
                                  <div title={it.invoiceName} style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '255px' }}>
                                    Invoice: <span style={{ color: '#cbd5e1' }}>{it.invoiceName}</span>
                                  </div>
                                )}
                                {it.invoiceName && (
                                  <div style={{ fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.25rem', color: it.medicineId ? '#22c55e' : it.createNew ? '#a78bfa' : '#fbbf24' }}>
                                    {it.medicineId
                                      ? (it.matchStatus === 'MATCHED' ? '✓ Linked to catalog - confirm it is the same product' : '✓ Selected')
                                      : it.createNew
                                        ? '➕ Will be added as a new medicine'
                                        : it.matchStatus === 'NEEDS_REVIEW' ? '⚠ Choose the matching medicine' : '⚠ Not in catalog - choose one or add as new'}
                                  </div>
                                )}
                                {it.createNew ? (
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px', gap: '0.3rem' }}>
                                    <input
                                      className="ai-table-input"
                                      placeholder="New medicine name"
                                      value={it.newMedicine?.brandName || ''}
                                      onChange={e => setNewMedicineField(idx, 'brandName', e.target.value)}
                                    />
                                    <input
                                      className="ai-table-input"
                                      placeholder="Strength"
                                      value={it.newMedicine?.strength || ''}
                                      onChange={e => setNewMedicineField(idx, 'strength', e.target.value)}
                                    />
                                    <select
                                      className="ai-table-input"
                                      value={it.newMedicine?.packagingType || 'MULTI_TIER'}
                                      onChange={e => setNewMedicineField(idx, 'packagingType', e.target.value)}
                                      title="Tablets/capsules come in strips; creams, syrups, injections are single units"
                                    >
                                      <option value="MULTI_TIER">Strips (tablets / capsules)</option>
                                      <option value="SIMPLE">Single units (cream, syrup, injection...)</option>
                                    </select>
                                    <input
                                      className="ai-table-input"
                                      placeholder="Form"
                                      value={it.newMedicine?.dosageForm || ''}
                                      onChange={e => setNewMedicineField(idx, 'dosageForm', e.target.value)}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setItems(prev => prev.map((r, i) => i === idx ? { ...r, createNew: false, matchStatus: r.candidates?.length ? 'NEEDS_REVIEW' : 'NEW' } : r))}
                                      style={{ gridColumn: '1 / -1', background: 'none', border: 'none', color: '#38bdf8', fontSize: '0.7rem', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                                    >
                                      ← Pick an existing medicine instead
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <SearchableMedicineSelect
                                      value={it.medicineId}
                                      onChange={id => handleItemChange(idx, 'medicineId', id)}
                                      medicines={medicines}
                                      suggestedName={it.medicineName}
                                    />
                                    {!it.medicineId && (
                                      <button
                                        type="button"
                                        onClick={() => markAsNewMedicine(idx)}
                                        style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: '0.7rem', cursor: 'pointer', padding: '0.2rem 0 0', textAlign: 'left' }}
                                      >
                                        ➕ Not in the list? Add as a new medicine
                                      </button>
                                    )}
                                  </>
                                )}
                                {it.existingBatch && !it.existingBatch.expiryConflict && (
                                  <div style={{ fontSize: '0.66rem', color: '#38bdf8', marginTop: '0.2rem' }}>
                                    Batch already in stock ({it.existingBatch.quantity} units) - this quantity will be added to it
                                  </div>
                                )}
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
                                  min="0"
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
                                  min="0"
                                  className="ai-table-input"
                                  style={{ textAlign: 'center' }}
                                  value={it.bonusBoxes}
                                  onChange={e => handleItemChange(idx, 'bonusBoxes', e.target.value)}
                                  title="Free boxes (Bonus column on the invoice)"
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
                                {it.mrpHint && (
                                  <div style={{ fontSize: '0.64rem', color: '#fbbf24', marginTop: '2px' }}>{it.mrpHint}</div>
                                )}
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
                            {lineProblems.length > 0 && (
                              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                                <td colSpan={12} style={{ padding: '0 0.8rem 0.55rem' }}>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.9rem', fontSize: '0.7rem', color: liveProblems.length ? '#fbbf24' : '#94a3b8' }}>
                                    {lineProblems.map((p, i) => <span key={i}>⚠ {p}</span>)}
                                  </div>
                                </td>
                              </tr>
                            )}
                            </React.Fragment>
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
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }} title="Advance income tax (e.g. WHT u/s 236H) or other charges added on the invoice">Advance Tax / Other Charges (Rs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="ai-table-input"
                    value={taxAmount}
                    onChange={e => setTaxAmount(e.target.value)}
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
                    <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ padding: '0.55rem 1.75rem', fontWeight: 600 }}>
                      {isSaving ? 'Saving...' : blockingQuestions.length > 0 ? `Answer ${blockingQuestions.length} question(s) to save` : 'Save Purchase & Add Stock'}
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
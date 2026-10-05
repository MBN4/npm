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
  AlertTriangle,
  Camera,
  MessageCircle,
  CheckCircle,
  QrCode,
  UserPlus,
  DollarSign,
  ScanLine,
  Pencil,
  RotateCcw
} from 'lucide-react';
import type { NavView } from '../components/Sidebar.js';
import { saveOfflineSale } from '../services/offlineSync.js';
import { printThermalElement } from '../utils/thermalPrinter.js';
import { CustomerSelect } from '../components/CustomerSelect.js';
import { getProductPackaging } from '../utils/productPackaging.js';
import { CashOutModal } from '../components/CashOutModal.js';
import { Barcode128, SimpleQRCodeSVG } from '../utils/barcodeGenerator.js';

export interface CartItem {
  medicineId: number;
  brandName: string;
  strength?: string;
  dosageForm?: string;
  packSize?: number;
  tabletsPerPack?: number;
  stockUnit?: string;
  packagingType?: 'MULTI_TIER' | 'SIMPLE';
  categoryName?: string;
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
  // Cash Memo grid fields (per-invoice, editable; never mutate Medicine Master)
  descriptionOverride?: string;
  categoryOverride?: string;
  packTypeOverride?: string;
  unitsPerPack: number;
  packs: number;
  looseUnits: number;
  originalUnitPrice?: number;
  rateOverridden?: boolean;
  // Schedule B/D dispensing gate - populated when the medicine has a verified controlled-drug classification
  schedule?: 'B' | 'D' | 'BOTH' | null;
  scheduleClassifications?: any[];
  prescriptionId?: number | null;
  prescriptionItemId?: number | null;
}

export const BILL_LINE_CATEGORIES = [
  'Tablet', 'Capsule', 'Syrup', 'Drops', 'Injection', 'Cream', 'Ointment',
  'Gel', 'Sachet', 'Bottle', 'Medical Device', 'Other'
];

export const BILL_LINE_PACK_TYPES = [
  'Strip', 'Box', 'Bottle', 'Tube', 'Piece', 'Vial', 'Ampoule', 'Sachet', 'Pack'
];

interface PosViewProps {
  onNavigate?: (view: NavView) => void;
}

/** Lets the cashier pick which prescription line (for the medicine being sold) to link a Schedule B/D cart item to. */
const PrescriptionItemPicker: React.FC<{ token: string | null; prescriptionId: number; medicineId: number; onPick: (itemId: number) => void }> = ({ token, prescriptionId, medicineId, onPick }) => {
  const [rxItems, setRxItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    if (!token) return;
    fetch(`/api/prescriptions/${prescriptionId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : { items: [] })
      .then(data => setRxItems((data.items || []).filter((it: any) => it.medicine_id === medicineId)))
      .catch(() => {});
  }, [token, prescriptionId, medicineId]);

  if (rxItems.length === 0) {
    return <div style={{ color: 'var(--danger)', fontSize: '0.72rem', marginTop: '0.2rem' }}>This prescription has no line item for this medicine.</div>;
  }

  return (
    <select
      value={selected}
      onChange={e => { setSelected(e.target.value); if (e.target.value) onPick(Number(e.target.value)); }}
      style={{ width: '100%', marginTop: '0.25rem' }}
    >
      <option value="">Select prescription line item...</option>
      {rxItems.map((it: any) => {
        const remaining = it.authorized_quantity != null ? it.authorized_quantity - (it.dispensed_quantity || 0) : null;
        return <option key={it.id} value={it.id}>{it.dosage} / {it.frequency} {remaining != null ? `(${remaining} remaining)` : '(unlimited)'}</option>;
      })}
    </select>
  );
};

export const PosView: React.FC<PosViewProps> = ({ onNavigate }) => {
  const { token, user, hasRole, hasPermission } = useAuth();

  // Schedule B/D dispensing gate state
  const [scheduleApproval, setScheduleApproval] = useState<{ token: string; approvedByName: string; expiresAt: string } | null>(null);
  const [showPharmacistApprovalModal, setShowPharmacistApprovalModal] = useState(false);
  const [approverUsername, setApproverUsername] = useState('');
  const [approverPassword, setApproverPassword] = useState('');
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [myPrescriptions, setMyPrescriptions] = useState<any[]>([]);
  const checkoutRequestKeyRef = useRef<string>('');

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const paidInputRef = useRef<HTMLInputElement>(null);

  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);

  const scheduledCartItems = cart.filter(it => !!it.schedule);

  useEffect(() => {
    if (scheduledCartItems.length === 0 || !token) return;
    fetch('/api/prescriptions', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : { prescriptions: [] })
      .then(data => setMyPrescriptions(data.prescriptions || []))
      .catch(() => {});
    // Invalidate any stale approval once the cart's scheduled items change.
    setScheduleApproval(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduledCartItems.length, token]);

  const setCartItemPrescription = (batchId: number, prescriptionId: number, prescriptionItemId: number) => {
    setCart(prev => prev.map(it => it.batchId === batchId ? { ...it, prescriptionId, prescriptionItemId } : it));
  };

  const requestPharmacistApproval = async () => {
    setApprovalError(null);
    try {
      const res = await fetch('/api/pos/schedule-bd/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          username: approverUsername,
          password: approverPassword,
          items: scheduledCartItems.map(it => ({ medicineId: it.medicineId, batchId: it.batchId, quantity: it.quantity }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Approval failed');
      setScheduleApproval({ token: data.approvalToken, approvedByName: data.approvedByName, expiresAt: data.expiresAt });
      setShowPharmacistApprovalModal(false);
      setApproverUsername('');
      setApproverPassword('');
    } catch (err: any) {
      setApprovalError(err.message || 'Approval failed');
    }
  };

  const [customers, setCustomers] = useState<{ id: number; name: string; mobile?: string; current_balance: number }[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customSlipName, setCustomSlipName] = useState<string>('');
  const [billingPersons, setBillingPersons] = useState<{ id: number; name: string; is_active: number }[]>([]);
  const [selectedBillingPersonId, setSelectedBillingPersonId] = useState<string>('');
  const [showManageBillingPersons, setShowManageBillingPersons] = useState(false);
  const [newBillingPersonName, setNewBillingPersonName] = useState('');
  const [billingPersonError, setBillingPersonError] = useState<string | null>(null);
  const [editingBillingPersonId, setEditingBillingPersonId] = useState<number | null>(null);
  const [editingBillingPersonName, setEditingBillingPersonName] = useState('');
  const [billDiscount, setBillDiscount] = useState<string>('0');
  const [discountType, setDiscountType] = useState<'RS' | 'PERCENT'>('PERCENT');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'JAZZCASH' | 'AL_HABIB' | 'CREDIT'>('CASH');
  const [activeQrModal, setActiveQrModal] = useState<'JAZZCASH' | 'AL_HABIB' | null>(null);
  const [paidAmount, setPaidAmount] = useState<string>('');

  const cartRef = useRef<CartItem[]>(cart);
  const billDiscountRef = useRef<string>(billDiscount);
  const selectedCustomerRef = useRef<string>(selectedCustomerId);

  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  useEffect(() => {
    billDiscountRef.current = billDiscount;
  }, [billDiscount]);

  useEffect(() => {
    selectedCustomerRef.current = selectedCustomerId;
  }, [selectedCustomerId]);

  const [heldBills, setHeldBills] = useState<any[]>([]);
  const [showHeldModal, setShowHeldModal] = useState(false);
  const [showCashOutModal, setShowCashOutModal] = useState(false);

  // Quick Customer Registration Modal State
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustMobile, setNewCustMobile] = useState('');
  const [newCustCreditLimit, setNewCustCreditLimit] = useState('');
  const [addingCustomer, setAddingCustomer] = useState(false);

  const handleCreateNewCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;

    setAddingCustomer(true);
    try {
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newCustName.trim(),
          mobile: newCustMobile.trim() || undefined,
          creditLimit: newCustCreditLimit ? Number(newCustCreditLimit) : 0
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to register customer');
      }

      const createdId = String(data.patientId);
      const newCustomerObj = {
        id: Number(data.patientId),
        name: newCustName.trim(),
        mobile: newCustMobile.trim() || undefined,
        current_balance: 0,
        credit_limit: newCustCreditLimit ? Number(newCustCreditLimit) : 0
      };

      setCustomers(prev => [newCustomerObj, ...prev]);
      setSelectedCustomerId(createdId);
      setInfoMessage(`Customer "${newCustName.trim()}" registered and selected!`);
      setShowAddCustomerModal(false);
      setNewCustName('');
      setNewCustMobile('');
      setNewCustCreditLimit('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Error registering customer');
    } finally {
      setAddingCustomer(false);
    }
  };

  const handleAddBillingPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBillingPersonName.trim()) return;
    setBillingPersonError(null);
    try {
      const res = await fetch('/api/billing-persons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newBillingPersonName.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add billing person');
      setNewBillingPersonName('');
      fetchBillingPersons();
    } catch (err: any) {
      setBillingPersonError(err.message || 'Error adding billing person');
    }
  };

  const handleSaveBillingPersonEdit = async (id: number) => {
    if (!editingBillingPersonName.trim()) return;
    setBillingPersonError(null);
    try {
      const res = await fetch(`/api/billing-persons/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: editingBillingPersonName.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update billing person');
      setEditingBillingPersonId(null);
      setEditingBillingPersonName('');
      fetchBillingPersons();
    } catch (err: any) {
      setBillingPersonError(err.message || 'Error updating billing person');
    }
  };

  const handleDeleteBillingPerson = async (id: number) => {
    setBillingPersonError(null);
    try {
      const res = await fetch(`/api/billing-persons/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete billing person');
      if (selectedBillingPersonId === String(id)) setSelectedBillingPersonId('');
      fetchBillingPersons();
    } catch (err: any) {
      setBillingPersonError(err.message || 'Error deleting billing person');
    }
  };

  const [lastInvoice, setLastInvoice] = useState<any>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [scannedNotFoundCode, setScannedNotFoundCode] = useState<string | null>(null);
  const [editingDescriptionIndex, setEditingDescriptionIndex] = useState<number | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [directPrinting, setDirectPrinting] = useState(false);
  const [autoPrint, setAutoPrint] = useState<boolean>(() => {
    return localStorage.getItem('nmp_autoprint') === 'true';
  });

  const handleDirectHardwarePrint = async (invNum?: string) => {
    const num = invNum || lastInvoice?.invoiceNumber;
    if (!num) return;
    setDirectPrinting(true);
    try {
      const res = await fetch('/api/integrations/print-receipt-direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          invoiceNumber: num,
          printerName: 'Speed-X 400UL'
        })
      });
      const data = await res.json();
      if (data.success) {
        setInfoMessage(data.message || 'Receipt printed directly on Speed-X hardware.');
      } else {
        setErrorMessage(data.message || 'Speed-X printer not detected. You can use the Dialog print option.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Direct print error.');
    } finally {
      setDirectPrinting(false);
    }
  };

  const autoCompleteQrSale = async (eventData: any, method: any) => {
    if (cartRef.current.length === 0) return;
    const currentCart = [...cartRef.current];
    const currentSubtotal = currentCart.reduce((sum, it) => sum + it.lineTotal, 0);
    const disc = Number(billDiscountRef.current) || 0;
    const currentPercentEnabled = settings['charge_percent_enabled'] === 'true';
    const currentPercentLabel = settings['charge_percent_label'] || 'Sales Tax';
    const currentPercentRate = settings['charge_percent_rate'] !== undefined ? Number(settings['charge_percent_rate']) : 13;
    const currentPercentAmount = currentPercentEnabled ? (currentSubtotal * currentPercentRate) / 100 : 0;
    const currentFixedEnabled = settings['charge_fixed_enabled'] === 'true';
    const currentFixedAmount = currentFixedEnabled ? (settings['charge_fixed_amount'] !== undefined ? Number(settings['charge_fixed_amount']) : 2) : 0;
    const currentPrintFee = currentPercentAmount + currentFixedAmount;
    const total = Math.max(0, currentSubtotal - disc + currentPrintFee);

    setInfoMessage(`QR Payment Verified: Rs. ${eventData.amount} (${eventData.provider})`);

    try {
      const res = await fetch('/api/pos/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          customerId: selectedCustomerRef.current ? Number(selectedCustomerRef.current) : null,
          items: currentCart.map(it => ({
            medicineId: it.medicineId,
            batchId: it.batchId,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discount: it.discount,
            descriptionOverride: it.descriptionOverride,
            category: it.categoryOverride || it.categoryName,
            packType: it.packTypeOverride,
            unitsPerPack: it.unitsPerPack,
            packs: it.packs,
            looseUnits: it.looseUnits
          })),
          subtotal: currentSubtotal,
          discount: disc,
          tax: currentPrintFee,
          percentageChargeLabel: currentPercentEnabled ? currentPercentLabel : '',
          percentageChargeRate: currentPercentEnabled ? currentPercentRate : 0,
          percentageChargeAmount: currentPercentAmount,
          fixedChargeAmount: currentFixedAmount,
          totalAmount: total,
          paidAmount: eventData.amount,
          paymentMethod: method,
          notes: `Auto-reconciled QR Payment TID: ${eventData.trxId}`
        })
      });

      if (res.ok) {
        const data = await res.json();
        const invoiceData = {
          ...data.invoice,
          tax: currentPrintFee,
          customer: customers.find(c => String(c.id) === selectedCustomerRef.current),
          cashierName: user?.fullName || user?.username,
          paymentMethod: method
        };
        setLastInvoice(invoiceData);
        setShowReceiptModal(true);
        handleClearCart();

        if (autoPrint) {
          setTimeout(() => {
            handleDirectHardwarePrint(data.invoice?.invoiceNumber);
          }, 400);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePrintReceipt = () => {
    printThermalElement('nmp-pos-receipt', (settings['printer_paper_width'] as any) || '80mm');
  };

  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/integrations/qr/events');
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'HEARTBEAT') return;

          try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
              const ctx = new AudioContextClass();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.setValueAtTime(587.33, ctx.currentTime);
              osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
              gain.gain.setValueAtTime(0.3, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
              osc.start();
              osc.stop(ctx.currentTime + 0.35);
            }
          } catch {}

          setInfoMessage(`QR Payment Received: Rs. ${data.amount} (${data.provider}) - TID: ${data.trxId}`);

          if (cartRef.current && cartRef.current.length > 0) {
            const currentSubtotal = cartRef.current.reduce((sum, it) => sum + it.lineTotal, 0);
            const currentDiscount = Number(billDiscountRef.current) || 0;
            const currentNet = Math.max(0, currentSubtotal - currentDiscount + 2.00);

            const method: 'JAZZCASH' | 'AL_HABIB' = data.provider === 'AL_HABIB' ? 'AL_HABIB' : 'JAZZCASH';

            if (Math.abs(data.amount - currentNet) <= 2 || data.amount >= currentNet) {
              autoCompleteQrSale(data, method);
            } else {
              setPaidAmount(String(data.amount));
              setPaymentMethod(method);
            }
          }
        } catch (e) {
          console.error(e);
        }
      };
    } catch (err) {
      console.error(err);
    }

    return () => {
      eventSource?.close();
    };
  }, [token]);

  const fetchBillingPersons = async () => {
    try {
      const res = await fetch('/api/billing-persons', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setBillingPersons(data.billingPersons || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [patientsRes, settingsRes] = await Promise.all([
          fetch('/api/patients', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/settings', { headers: { Authorization: `Bearer ${token}` } })
        ]);

        if (patientsRes.ok) {
          const data = await patientsRes.json();
          setCustomers(data.patients || []);
        } else {
          setCustomers([
            { id: 1, name: 'Muhammad Usman', mobile: '0312-9988776', current_balance: 1200 },
            { id: 2, name: 'Amina Bibi', mobile: '0345-1122334', current_balance: 0 }
          ]);
        }

        if (settingsRes.ok) {
          const sData = await settingsRes.json();
          setSettings(sData.settings || {});
        }
      } catch (err) {
        console.error(err);
      }
    }

    loadInitialData();
    fetchHeldBills();
    fetchBillingPersons();
  }, [token]);

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
        console.error(err);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  const handleAddToCart = (product: any, unitType: 'TABLET' | 'PACK' | 'BOX' = 'TABLET', count: number = 1) => {
    setErrorMessage(null);

    if (!product.fefo_batch) {
      setErrorMessage(`No valid non-expired stock available for ${product.brand_name}.`);
      return;
    }

    const batch = product.fefo_batch;
    const packaging = getProductPackaging(product.dosage_form, product.stock_unit, product.category_name);
    const packSize = Number(product.pack_size) > 0 ? Number(product.pack_size) : 100;
    const tabletsPerPack = Number(product.tablets_per_pack) > 0 ? Number(product.tablets_per_pack) : ((packSize >= 10 && packSize % 10 === 0) ? packSize / 10 : (packSize > 1 ? 10 : 1));

    let looseUnitsToAdd = 1;
    if (unitType === 'BOX') {
      looseUnitsToAdd = packSize * count;
    } else if (unitType === 'PACK') {
      looseUnitsToAdd = tabletsPerPack * count;
    } else {
      looseUnitsToAdd = 1 * count;
    }

    const isMultiTier = (product.packaging_type || packaging.packagingType) === 'MULTI_TIER';
    const unitsPerPack = isMultiTier ? tabletsPerPack : 1;

    const existingIndex = cart.findIndex(it => it.batchId === batch.batch_id);
    if (existingIndex > -1) {
      const updated = [...cart];
      const newTotalQty = updated[existingIndex].quantity + looseUnitsToAdd;
      if (newTotalQty > batch.quantity) {
        setErrorMessage(`Cannot exceed available stock (${batch.quantity} ${packaging.unitPlural.toLowerCase()}).`);
        return;
      }
      updated[existingIndex].quantity = newTotalQty;
      updated[existingIndex].packs = isMultiTier ? Math.floor(newTotalQty / unitsPerPack) : newTotalQty;
      updated[existingIndex].looseUnits = isMultiTier ? newTotalQty % unitsPerPack : 0;
      updated[existingIndex].lineTotal = (newTotalQty * updated[existingIndex].unitPrice) - updated[existingIndex].discount;
      setCart(updated);
    } else {
      if (looseUnitsToAdd > batch.quantity) {
        setErrorMessage(`Cannot exceed available stock (${batch.quantity} ${packaging.unitPlural.toLowerCase()}).`);
        return;
      }
      const newItem: CartItem = {
        medicineId: product.id,
        brandName: product.brand_name,
        strength: product.strength,
        dosageForm: product.dosage_form,
        packSize,
        tabletsPerPack,
        stockUnit: product.stock_unit || packaging.unit,
        packagingType: product.packaging_type || packaging.packagingType,
        categoryName: product.category_name,
        batchId: batch.batch_id,
        batchNumber: batch.batch_number,
        expiryDate: batch.expiry_date,
        daysToExpiry: batch.days_to_expiry,
        unitPrice: Number(batch.sale_price),
        availableStock: batch.quantity,
        quantity: looseUnitsToAdd,
        discount: 0,
        lineTotal: looseUnitsToAdd * Number(batch.sale_price),
        availableBatches: product.available_batches,
        unitsPerPack,
        packs: isMultiTier ? Math.floor(looseUnitsToAdd / unitsPerPack) : looseUnitsToAdd,
        looseUnits: isMultiTier ? looseUnitsToAdd % unitsPerPack : 0,
        packTypeOverride: isMultiTier ? (packaging.middle || 'Strip') : (packaging.unit || 'Bottle'),
        schedule: product.schedule || null,
        scheduleClassifications: product.schedule_classifications || [],
        prescriptionId: null,
        prescriptionItemId: null
      };
      setCart([newItem, ...cart]);
    }

    setQuery('');
    setSearchResults([]);
    searchInputRef.current?.focus();
  };

  /** Editable Cash Memo grid: user directly edits Packs / Loose Units for a row. */
  const handleUpdatePacksLoose = (index: number, packs: number, looseUnits: number) => {
    setErrorMessage(null);
    const item = cart[index];
    const unitsPerPack = item.unitsPerPack || 1;
    const safePacks = Math.max(0, Math.floor(packs) || 0);
    const safeLoose = Math.max(0, Math.floor(looseUnits) || 0);
    const newQty = (safePacks * unitsPerPack) + safeLoose;

    if (newQty <= 0) {
      handleRemoveItem(index);
      return;
    }
    if (newQty > item.availableStock) {
      const packaging = getProductPackaging(item.dosageForm, item.stockUnit, item.categoryName);
      setErrorMessage(`Cannot exceed available stock (${item.availableStock} ${packaging.unitPlural.toLowerCase()}).`);
      return;
    }

    const updated = [...cart];
    updated[index].packs = safePacks;
    updated[index].looseUnits = safeLoose;
    updated[index].quantity = newQty;
    updated[index].lineTotal = (newQty * updated[index].unitPrice) - updated[index].discount;
    setCart(updated);
  };

  /** Editable Cash Memo grid: user directly edits the Rate for this invoice line only. */
  const handleUpdateRate = (index: number, newRate: number) => {
    if (isNaN(newRate) || newRate < 0) return;
    const updated = [...cart];
    const item = updated[index];
    if (item.originalUnitPrice === undefined) {
      item.originalUnitPrice = item.unitPrice;
    }
    item.unitPrice = newRate;
    item.rateOverridden = newRate !== item.originalUnitPrice;
    item.lineTotal = (item.quantity * newRate) - item.discount;
    setCart(updated);
  };

  /** Editable Cash Memo grid: per-invoice text overrides (never mutate Medicine Master). */
  const handleUpdateLineField = (index: number, field: 'descriptionOverride' | 'categoryOverride' | 'packTypeOverride', value: string) => {
    const updated = [...cart];
    (updated[index] as any)[field] = value;
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
    setCustomSlipName('');
    setErrorMessage(null);
    searchInputRef.current?.focus();
  };

  const subtotal = cart.reduce((acc, it) => acc + it.lineTotal, 0);
  const rawDiscount = Number(billDiscount) || 0;
  const discountVal = discountType === 'PERCENT' ? (subtotal * rawDiscount) / 100 : rawDiscount;

  const percentChargeEnabled = settings['charge_percent_enabled'] === 'true';
  const percentChargeLabel = settings['charge_percent_label'] || 'Sales Tax';
  const percentChargeRate = settings['charge_percent_rate'] !== undefined ? Number(settings['charge_percent_rate']) : 13;
  const percentChargeAmount = cart.length > 0 && percentChargeEnabled ? (subtotal * percentChargeRate) / 100 : 0;

  const fixedChargeEnabled = settings['charge_fixed_enabled'] === 'true';
  const fixedChargeAmount = cart.length > 0 && fixedChargeEnabled ? (settings['charge_fixed_amount'] !== undefined ? Number(settings['charge_fixed_amount']) : 2) : 0;

  const printFee = percentChargeAmount + fixedChargeAmount;
  const grandTotal = cart.length > 0 ? Math.max(0, subtotal + printFee - discountVal) : 0;
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

  const startCameraScanner = async () => {
    setShowCameraScanner(true);
    setErrorMessage(null);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        cameraStreamRef.current = stream;
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          cameraVideoRef.current.play();
        }
      } else {
        setErrorMessage('Camera access not supported on this browser.');
      }
    } catch (err: any) {
      setErrorMessage('Could not open camera: ' + (err.message || 'Permission denied'));
    }
  };

  const stopCameraScanner = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(t => t.stop());
      cameraStreamRef.current = null;
    }
    setShowCameraScanner(false);
  };

  useEffect(() => {
    return () => {
      stopCameraScanner();
    };
  }, []);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    if (cart.length === 0) {
      setErrorMessage('Cart is empty. Add medicines before checking out.');
      return;
    }

    if (paymentMethod === 'CREDIT' && !selectedCustomerId) {
      setErrorMessage('Credit / Udhar sales require selecting a registered customer account.');
      return;
    }

    if (scheduledCartItems.length > 0) {
      const missingRx = scheduledCartItems.find(it => !it.prescriptionId || !it.prescriptionItemId);
      if (missingRx) {
        setErrorMessage(`"${missingRx.brandName}" is a verified Schedule ${missingRx.schedule} medicine — link it to a prescription item in the Schedule B/D panel before checking out.`);
        return;
      }
      if (!hasPermission('approve_scheduled_drugs') && !scheduleApproval) {
        setErrorMessage('This sale requires pharmacist approval for a Schedule B/D medicine. Click "Request Pharmacist Approval" below.');
        return;
      }
    }

    if (!checkoutRequestKeyRef.current) {
      checkoutRequestKeyRef.current = `POS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
          requestKey: checkoutRequestKeyRef.current,
          scheduleBDApprovalToken: scheduleApproval?.token || null,
          items: cart.map(it => ({
            medicineId: it.medicineId,
            batchId: it.batchId,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discount: it.discount,
            descriptionOverride: it.descriptionOverride,
            category: it.categoryOverride || it.categoryName,
            packType: it.packTypeOverride,
            unitsPerPack: it.unitsPerPack,
            packs: it.packs,
            looseUnits: it.looseUnits,
            prescriptionId: it.prescriptionId || undefined,
            prescriptionItemId: it.prescriptionItemId || undefined
          })),
          subtotal,
          discount: discountVal,
          tax: printFee,
          percentageChargeLabel: percentChargeEnabled ? percentChargeLabel : '',
          percentageChargeRate: percentChargeEnabled ? percentChargeRate : 0,
          percentageChargeAmount: percentChargeAmount,
          fixedChargeAmount: fixedChargeAmount,
          totalAmount: grandTotal,
          paidAmount: numericPaid,
          paymentMethod,
          notes: '',
          billingPersonId: selectedBillingPersonId ? Number(selectedBillingPersonId) : null,
          customSlipName: customSlipName.trim()
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Server rejected checkout');
      }

      checkoutRequestKeyRef.current = '';
      setScheduleApproval(null);

      const data = await res.json();
      const invoiceData = {
        ...data.invoice,
        tax: printFee,
        customer: customers.find(c => String(c.id) === selectedCustomerId),
        customSlipName: customSlipName.trim(),
        cashierName: user?.fullName || user?.username,
        paymentMethod
      };
      setLastInvoice(invoiceData);
      setShowReceiptModal(true);
      handleClearCart();

      if (autoPrint) {
        setTimeout(() => {
          handleDirectHardwarePrint();
        }, 350);
      }
    } catch (err: any) {
      if (!navigator.onLine || err.message.includes('fetch') || err.message.includes('Network') || err.message.includes('Failed to fetch')) {
        if (scheduledCartItems.length > 0) {
          setErrorMessage('This sale contains a verified Schedule B/D medicine, which requires an online connection for prescription and pharmacist approval checks. Please retry once connectivity is restored.');
          return;
        }
        const offlineRecord = saveOfflineSale({
          customerId: selectedCustomerId ? Number(selectedCustomerId) : null,
          customerName: customSlipName.trim() || (selectedCustomerId ? customers.find(c => String(c.id) === selectedCustomerId)?.name : 'Walk-in Counter Patient'),
          items: cart.map(it => ({
            medicineId: it.medicineId,
            batchId: it.batchId,
            brandName: it.brandName,
            strength: it.strength,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discount: it.discount,
            lineTotal: it.lineTotal,
            descriptionOverride: it.descriptionOverride,
            category: it.categoryOverride || it.categoryName,
            packType: it.packTypeOverride,
            unitsPerPack: it.unitsPerPack,
            packs: it.packs,
            looseUnits: it.looseUnits
          })),
          subtotal,
          discount: discountVal,
          tax: printFee,
          percentageChargeLabel: percentChargeEnabled ? percentChargeLabel : '',
          percentageChargeRate: percentChargeEnabled ? percentChargeRate : 0,
          percentageChargeAmount: percentChargeAmount,
          fixedChargeAmount: fixedChargeAmount,
          totalAmount: grandTotal,
          paidAmount: numericPaid,
          paymentMethod,
          notes: '',
          billingPersonId: selectedBillingPersonId ? Number(selectedBillingPersonId) : null,
          customSlipName: customSlipName.trim()
        });

        const offlineInvoiceData = {
          invoiceNumber: offlineRecord.offlineId,
          isOffline: true,
          totalAmount: grandTotal,
          paidAmount: numericPaid,
          changeAmount: change,
          subtotal,
          tax: printFee,
          discount: discountVal,
          items: cart,
          customer: customers.find(c => String(c.id) === selectedCustomerId),
          customSlipName: customSlipName.trim(),
          cashierName: user?.fullName || user?.username,
          paymentMethod,
          createdAt: new Date().toISOString()
        };

        setLastInvoice(offlineInvoiceData);
        setInfoMessage('Offline Mode Active: Sale saved locally in queue.');
        setShowReceiptModal(true);
        handleClearCart();

        if (autoPrint) {
          setTimeout(() => {
            handleDirectHardwarePrint();
          }, 350);
        }
      } else {
        setErrorMessage(err.message || 'Checkout failed');
      }
    }
  };

  const formatPackagingBreakdown = (quantity: number, packSize: number = 100, tabletsPerPack: number = 10, dosageForm?: string, stockUnit?: string, categoryName?: string) => {
    const packaging = getProductPackaging(dosageForm, stockUnit, categoryName);
    const pSize = packSize > 0 ? packSize : 100;
    const tPack = tabletsPerPack > 0 ? tabletsPerPack : 10;
    const boxes = Math.floor(quantity / pSize);
    const rem = quantity % pSize;
    const packs = packaging.packagingType === 'MULTI_TIER' ? Math.floor(rem / tPack) : 0;
    const units = packaging.packagingType === 'MULTI_TIER' ? rem % tPack : rem;

    const parts: string[] = [];
    if (boxes > 0) parts.push(`${boxes} ${packaging.outer}`);
    if (packs > 0) parts.push(`${packs} ${packaging.middle}`);
    if (units > 0 || parts.length === 0) parts.push(`${units} ${packaging.unit}`);
    return parts.join(' + ');
  };

  return (
    <div className="page-container" style={{ padding: '1rem' }}>
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

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: '20px',
              backgroundColor: 'var(--primary-light)',
              color: 'var(--primary)',
              fontWeight: 700,
              fontSize: '0.74rem',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              border: '1px solid var(--primary-border)'
            }}
          >
            <span>👤 Cashier:</span>
            <strong>{user?.fullName || user?.username || 'Cashier'}</strong>
          </div>

          <button
            onClick={() => setShowCashOutModal(true)}
            className="btn btn-secondary btn-sm"
            style={{
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              border: '1px solid #fca5a5',
              fontWeight: 700
            }}
            title="Record Expense or Fund Transfer from Cash Drawer"
          >
            <DollarSign size={14} />
            <span>💸 Cash Out</span>
          </button>

          {onNavigate && hasRole(['Admin', 'Pharmacist']) && (
            <button
              onClick={() => onNavigate('returns')}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 700 }}
              title="Process a return, refund or replacement against a previous bill"
            >
              <RotateCcw size={14} />
              <span>↩ Returns / Replace</span>
            </button>
          )}

          {lastInvoice && (
            <button
              onClick={() => setShowReceiptModal(true)}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--primary)' }}
              title="View & Reprint Last Receipt"
            >
              <Printer size={14} />
              <span>Reprint #{lastInvoice.invoiceNumber}</span>
            </button>
          )}

          <button
            onClick={startCameraScanner}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
            title="Scan with Camera"
          >
            <Camera size={14} style={{ color: 'var(--primary)' }} />
            <span>Camera Scanner</span>
          </button>
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

      {infoMessage && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: 'var(--success-light)',
            color: 'var(--success-text)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.85rem'
          }}
        >
          <CheckCircle size={16} />
          <span>{infoMessage}</span>
        </div>
      )}

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

      {scannedNotFoundCode && (
        <div
          style={{
            padding: '0.85rem 1rem',
            background: 'var(--warning-light)',
            color: 'var(--warning-text)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            border: '1px solid rgba(245, 158, 11, 0.35)'
          }}
        >
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              background: 'rgba(245, 158, 11, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <ScanLine size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Barcode Not Found</div>
            <div style={{ fontSize: '0.78rem', opacity: 0.9 }}>
              No product matches code <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{scannedNotFoundCode}</strong>. Register it in Medicines Master to start selling this item.
            </div>
          </div>
          <button
            onClick={() => setScannedNotFoundCode(null)}
            className="btn btn-secondary btn-sm"
            style={{ padding: '0.2rem', flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {showCameraScanner && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Camera size={16} style={{ color: 'var(--primary)' }} />
                Camera Barcode Scanner
              </span>
              <button onClick={stopCameraScanner} className="btn btn-secondary btn-sm">
                <X size={15} />
              </button>
            </div>

            <div style={{ width: '100%', height: '240px', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <video ref={cameraVideoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div
                style={{
                  position: 'absolute',
                  inset: '30px 40px',
                  border: '2px dashed #38bdf8',
                  borderRadius: '8px',
                  pointerEvents: 'none',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)'
                }}
              />
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.75rem' }}>
              Point camera at medicine barcode. Scanner will detect box barcode automatically.
            </p>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '1rem', alignItems: 'start' }}>
        <div>
          <div className="card" style={{ padding: '0.85rem', marginBottom: '0.85rem', position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <input
                ref={searchInputRef}
                className="input"
                placeholder="Scan barcode or search brand, generic (F2)..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const codeToSearch = query.trim();
                    if (!codeToSearch) return;

                    setErrorMessage(null);
                    setScannedNotFoundCode(null);

                    if (searchResults.length > 0) {
                      handleAddToCart(searchResults[0]);
                      setQuery('');
                      setSearchResults([]);
                      return;
                    }

                    try {
                      const res = await fetch(`/api/pos/search?q=${encodeURIComponent(codeToSearch)}`, {
                        headers: { Authorization: `Bearer ${token}` }
                      });
                      if (res.ok) {
                        const data = await res.json();
                        if (data.results && data.results.length > 0) {
                          handleAddToCart(data.results[0]);
                          setQuery('');
                          setSearchResults([]);
                        } else {
                          setScannedNotFoundCode(codeToSearch);
                          setQuery('');
                          setSearchResults([]);
                          setTimeout(() => setScannedNotFoundCode(null), 4000);
                        }
                      } else {
                        setErrorMessage('Barcode lookup failed. Please try again.');
                      }
                    } catch (err) {
                      console.error(err);
                      setErrorMessage('Barcode lookup failed. Please check your connection.');
                    }
                  }
                }}
                autoFocus
                style={{ paddingLeft: '2.5rem', fontSize: '0.92rem', height: '44px' }}
              />
              <Search size={18} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              {query && (
                <button
                  onClick={() => { setQuery(''); setSearchResults([]); }}
                  style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  <X size={16} />
                </button>
              )}
            </div>

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
                  boxShadow: 'var(--shadow-glass)',
                  zIndex: 50,
                  maxHeight: '320px',
                  overflowY: 'auto',
                  marginTop: '4px'
                }}
              >
                {searchResults.map((p) => {
                  const packSize = Number(p.pack_size) > 0 ? Number(p.pack_size) : 100;
                  const tabletsPerPack = Number(p.tablets_per_pack) > 0 ? Number(p.tablets_per_pack) : ((packSize >= 10 && packSize % 10 === 0) ? packSize / 10 : (packSize > 1 ? 10 : 1));
                  const packaging = getProductPackaging(p.dosage_form, p.stock_unit, p.category_name);
                  const isMultiTier = (p.packaging_type || packaging.packagingType) === 'MULTI_TIER';
                  const unitPrice = p.fefo_batch ? Number(p.fefo_batch.sale_price) : 0;
                  const packPrice = unitPrice * tabletsPerPack;
                  const boxPrice = unitPrice * packSize;

                  return (
                    <div
                      key={p.id}
                      style={{
                        padding: '0.75rem 1rem',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                      className="hover-bg"
                    >
                      <div onClick={() => handleAddToCart(p, 'TABLET', 1)} style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span>{p.brand_name}</span>
                          {p.strength && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({p.strength})</span>}
                          {p.is_prescription_required === 1 && (
                            <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>Rx Required</span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                          {p.generic_name} • {p.category_name} • Rack: <strong>{p.rack_location || 'N/A'}</strong>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ textAlign: 'right', fontSize: '0.74rem' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                            {packaging.unit}: <strong>Rs. {unitPrice.toFixed(2)}</strong>
                          </div>
                          {isMultiTier && <div style={{ color: 'var(--text-secondary)' }}>
                            {packaging.middle} ({tabletsPerPack}s): <strong>Rs. {packPrice.toFixed(2)}</strong>
                          </div>}
                          <div style={{ color: 'var(--text-secondary)' }}>
                            {packaging.outer} ({packSize}s): <strong>Rs. {boxPrice.toFixed(2)}</strong>
                          </div>
                          <div style={{ fontSize: '0.7rem', color: p.total_stock > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700, marginTop: '0.1rem' }}>
                            {p.total_stock > 0 ? `${p.total_stock} ${packaging.unitPlural.toLowerCase()} in stock` : 'Out of Stock'}
                          </div>
                        </div>

                        {p.total_stock > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <button
                              type="button"
                              onClick={() => handleAddToCart(p, 'TABLET', 1)}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem', whiteSpace: 'nowrap' }}
                              title={`Add 1 ${packaging.unit.toLowerCase()}`}
                            >
                              +1 {packaging.unit}
                            </button>
                            {isMultiTier && <button
                              type="button"
                              onClick={() => handleAddToCart(p, 'PACK', 1)}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem', whiteSpace: 'nowrap', color: 'var(--primary)' }}
                              title={`Add 1 ${packaging.middle.toLowerCase()} (${tabletsPerPack} ${packaging.unitPlural.toLowerCase()})`}
                            >
                              +1 {packaging.middle} ({tabletsPerPack}s)
                            </button>
                            }
                            <button
                              type="button"
                              onClick={() => handleAddToCart(p, 'BOX', 1)}
                              className="btn btn-primary btn-sm"
                              style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem', whiteSpace: 'nowrap' }}
                              title={`Add 1 full ${packaging.outer.toLowerCase()} (${packSize} ${packaging.unitPlural.toLowerCase()})`}
                            >
                              +1 {packaging.outer} ({packSize}s)
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <ShoppingCart size={16} />
                <span>Active Dispensing Cart ({cart.length} items)</span>
              </div>
              {cart.length > 0 && (
                <button onClick={handleClearCart} className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>
                  <Trash2 size={13} />
                  <span>Clear (F1)</span>
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <ShoppingCart size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
                <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>Cart is empty</p>
                <p style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>Scan barcode or press F2 to search medicines</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '0.76rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.4rem' }}>S.#</th>
                      <th style={{ padding: '0.4rem', minWidth: '160px' }}>Item Description</th>
                      <th style={{ padding: '0.4rem', minWidth: '100px' }}>Category</th>
                      <th style={{ padding: '0.4rem', minWidth: '90px' }}>Pack Type</th>
                      <th style={{ padding: '0.4rem', textAlign: 'center', width: '70px' }}>Units/Pack</th>
                      <th style={{ padding: '0.4rem', textAlign: 'center', width: '60px' }}>Packs</th>
                      <th style={{ padding: '0.4rem', textAlign: 'center', width: '70px' }}>Loose Units</th>
                      <th style={{ padding: '0.4rem', textAlign: 'center', width: '60px' }}>Total Units</th>
                      <th style={{ padding: '0.4rem', textAlign: 'right', width: '85px' }}>Rate (Rs.)</th>
                      <th style={{ padding: '0.4rem', textAlign: 'right', width: '90px' }}>Total (Rs.)</th>
                      <th style={{ padding: '0.4rem', width: '60px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item, index) => {
                      const itemPackaging = getProductPackaging(item.dosageForm, item.stockUnit, item.categoryName);
                      const itemIsMultiTier = (item.packagingType || itemPackaging.packagingType) === 'MULTI_TIER';
                      const strengthAlreadyInName = item.strength && item.brandName.toLowerCase().includes(item.strength.toLowerCase());
                      const displayDescription = item.descriptionOverride !== undefined && item.descriptionOverride !== ''
                        ? item.descriptionOverride
                        : `${item.brandName}${item.strength && !strengthAlreadyInName ? ' ' + item.strength : ''}`;

                      return (
                        <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.4rem', color: 'var(--text-muted)' }}>{index + 1}</td>
                          <td style={{ padding: '0.4rem' }}>
                            {editingDescriptionIndex === index ? (
                              <input
                                className="input input-sm"
                                autoFocus
                                value={displayDescription}
                                onChange={e => handleUpdateLineField(index, 'descriptionOverride', e.target.value)}
                                onBlur={() => setEditingDescriptionIndex(null)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setEditingDescriptionIndex(null); } }}
                                style={{ fontSize: '0.76rem', padding: '0.2rem 0.4rem', height: '28px' }}
                              />
                            ) : (
                              <div style={{ fontWeight: 700 }}>{displayDescription}</div>
                            )}
                            <div style={{ marginTop: '0.2rem' }}>
                              <select
                                className="input input-sm"
                                value={item.batchId}
                                onChange={(e) => handleSwitchBatch(index, Number(e.target.value))}
                                style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem', height: '22px', color: 'var(--text-muted)' }}
                                title="Batch (FEFO)"
                              >
                                {item.availableBatches?.map(b => (
                                  <option key={b.batch_id} value={b.batch_id}>
                                    #{b.batch_number} (Exp: {b.expiry_date}) - {b.quantity} left
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td style={{ padding: '0.4rem' }}>
                            <select
                              className="input input-sm"
                              value={item.categoryOverride || item.categoryName || ''}
                              onChange={e => handleUpdateLineField(index, 'categoryOverride', e.target.value)}
                              style={{ fontSize: '0.72rem', padding: '0.2rem 0.3rem', height: '28px' }}
                            >
                              {!BILL_LINE_CATEGORIES.includes(item.categoryOverride || item.categoryName || '') && (
                                <option value={item.categoryOverride || item.categoryName || ''}>
                                  {item.categoryOverride || item.categoryName || '—'}
                                </option>
                              )}
                              {BILL_LINE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '0.4rem' }}>
                            <select
                              className="input input-sm"
                              value={item.packTypeOverride || itemPackaging.middle || 'Strip'}
                              onChange={e => handleUpdateLineField(index, 'packTypeOverride', e.target.value)}
                              style={{ fontSize: '0.72rem', padding: '0.2rem 0.3rem', height: '28px' }}
                            >
                              {BILL_LINE_PACK_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '0.4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            {item.unitsPerPack}
                          </td>
                          <td style={{ padding: '0.4rem' }}>
                            <input
                              type="number"
                              min="0"
                              className="input input-sm"
                              value={item.packs}
                              disabled={!itemIsMultiTier}
                              onChange={e => handleUpdatePacksLoose(index, Number(e.target.value), item.looseUnits)}
                              style={{ fontSize: '0.76rem', padding: '0.2rem 0.3rem', height: '28px', width: '52px', textAlign: 'center' }}
                            />
                          </td>
                          <td style={{ padding: '0.4rem' }}>
                            <input
                              type="number"
                              min="0"
                              className="input input-sm"
                              value={item.looseUnits}
                              onChange={e => handleUpdatePacksLoose(index, item.packs, Number(e.target.value))}
                              style={{ fontSize: '0.76rem', padding: '0.2rem 0.3rem', height: '28px', width: '58px', textAlign: 'center' }}
                            />
                          </td>
                          <td style={{ padding: '0.4rem', textAlign: 'center', fontWeight: 800 }}>
                            {item.quantity}
                          </td>
                          <td style={{ padding: '0.4rem' }}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="input input-sm"
                              value={item.unitPrice}
                              onChange={e => handleUpdateRate(index, Number(e.target.value))}
                              style={{
                                fontSize: '0.76rem', padding: '0.2rem 0.3rem', height: '28px', width: '75px', textAlign: 'right',
                                color: item.rateOverridden ? 'var(--warning-text)' : undefined,
                                fontWeight: item.rateOverridden ? 700 : undefined
                              }}
                              title={item.rateOverridden ? `Overridden from Rs. ${item.originalUnitPrice?.toFixed(2)}` : undefined}
                            />
                          </td>
                          <td style={{ padding: '0.4rem', textAlign: 'right', fontWeight: 800 }}>
                            Rs. {item.lineTotal.toFixed(2)}
                          </td>
                          <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
                              <button
                                type="button"
                                onClick={() => setEditingDescriptionIndex(index)}
                                style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                                title="Edit item description for this invoice"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(index)}
                                style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                                title="Remove item"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <form onSubmit={handleCheckout} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>Settlement & Payment</h2>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await fetch('/api/integrations/qr-simulate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({
                          amount: grandTotal,
                          provider: 'NAYAPAY',
                          trxId: 'TEST-' + Math.floor(100000 + Math.random() * 900000)
                        })
                      });
                    } catch (e: any) {
                      setErrorMessage('Simulation error: ' + e.message);
                    }
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.68rem', padding: '0.2rem 0.45rem', backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}
                  title="Simulate incoming QR payment and trigger auto-print"
                >
                  ⚡ Simulate QR Pay
                </button>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Customer / Patient Account
              </label>
              <CustomerSelect
                customers={customers}
                selectedCustomerId={selectedCustomerId}
                onSelectCustomer={setSelectedCustomerId}
                onAddNewCustomer={() => setShowAddCustomerModal(true)}
              />
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                <span>Billed By (Billing Person)</span>
                {hasRole(['Admin']) && (
                  <button
                    type="button"
                    onClick={() => setShowManageBillingPersons(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, padding: 0 }}
                  >
                    Manage
                  </button>
                )}
              </label>
              <select
                className="input"
                style={{ fontSize: '0.8rem' }}
                value={selectedBillingPersonId}
                onChange={e => setSelectedBillingPersonId(e.target.value)}
              >
                <option value="">{user?.fullName || user?.username || 'Logged-in Cashier'} (default)</option>
                {billingPersons.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                Custom Name on Receipt / Slip (Optional)
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Mr. Tariq, Patient Attendant..."
                value={customSlipName}
                onChange={e => setCustomSlipName(e.target.value)}
                style={{ fontSize: '0.8rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Payment Method
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.25rem' }}>
                {([
                  { id: 'CASH', label: 'Cash' },
                  { id: 'CARD', label: 'Card' },
                  { id: 'JAZZCASH', label: 'JazzCash' },
                  { id: 'AL_HABIB', label: 'AL Habib' },
                  { id: 'CREDIT', label: 'Credit' }
                ] as const).map(mode => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setPaymentMethod(mode.id)}
                    className={`btn btn-sm ${paymentMethod === mode.id ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.64rem', padding: '0.35rem 0.15rem', justifyContent: 'center', whiteSpace: 'nowrap' }}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              {paymentMethod === 'JAZZCASH' && (
                <div style={{ marginTop: '0.4rem', padding: '0.45rem 0.65rem', backgroundColor: '#fff9c4', border: '1px solid #fbc02d', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.75rem', color: '#f57f17' }}>JazzCash / Raast QR</div>
                    <div style={{ fontSize: '0.7rem', color: '#333' }}>Till ID: <strong>980 685 083</strong></div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveQrModal('JAZZCASH')}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem', display: 'flex', alignItems: 'center', gap: '0.25rem', backgroundColor: '#fff' }}
                  >
                    <QrCode size={13} />
                    <span>View QR</span>
                  </button>
                </div>
              )}

              {paymentMethod === 'AL_HABIB' && (
                <div style={{ marginTop: '0.4rem', padding: '0.45rem 0.65rem', backgroundColor: '#e8f5e9', border: '1px solid #81c784', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.75rem', color: '#2e7d32' }}>Bank AL Habib QR</div>
                    <div style={{ fontSize: '0.7rem', color: '#333' }}>Store Code: <strong>5901</strong></div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveQrModal('AL_HABIB')}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem', display: 'flex', alignItems: 'center', gap: '0.25rem', backgroundColor: '#fff' }}
                  >
                    <QrCode size={13} />
                    <span>View QR</span>
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                    Discount {discountType === 'PERCENT' ? '(%)' : '(Rs.)'}
                  </label>
                  <div style={{ display: 'flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setDiscountType('RS');
                        setBillDiscount('0');
                      }}
                      style={{
                        padding: '0.1rem 0.35rem',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: discountType === 'RS' ? 'var(--primary)' : 'var(--bg-surface)',
                        color: discountType === 'RS' ? '#fff' : 'var(--text-muted)'
                      }}
                    >
                      Rs
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDiscountType('PERCENT');
                        setBillDiscount('0');
                      }}
                      style={{
                        padding: '0.1rem 0.35rem',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: discountType === 'PERCENT' ? 'var(--primary)' : 'var(--bg-surface)',
                        color: discountType === 'PERCENT' ? '#fff' : 'var(--text-muted)'
                      }}
                    >
                      %
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  className="input"
                  value={billDiscount}
                  onChange={e => setBillDiscount(e.target.value)}
                  min="0"
                  max={discountType === 'PERCENT' ? '100' : undefined}
                  placeholder={discountType === 'PERCENT' ? '0%' : 'Rs. 0'}
                />
                {discountType === 'PERCENT' && Number(billDiscount) > 0 && (
                  <div style={{ fontSize: '0.68rem', color: 'var(--danger)', marginTop: '0.15rem' }}>
                    = Rs. {discountVal.toFixed(2)} off
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Amount Paid (F9)
                </label>
                <input
                  ref={paidInputRef}
                  type="number"
                  className="input"
                  placeholder={paymentMethod === 'CREDIT' ? '0' : String(grandTotal)}
                  value={paidAmount}
                  onChange={e => setPaidAmount(e.target.value)}
                  min="0"
                />
              </div>
            </div>

            <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>Subtotal:</span>
                <span>Rs. {subtotal.toFixed(2)}</span>
              </div>
              {percentChargeEnabled && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                  <span>{percentChargeLabel} ({percentChargeRate}%):</span>
                  <span>Rs. {percentChargeAmount.toFixed(2)}</span>
                </div>
              )}
              {fixedChargeEnabled && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                  <span>POS Charge:</span>
                  <span>Rs. {fixedChargeAmount.toFixed(2)}</span>
                </div>
              )}
              {discountVal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger)' }}>
                  <span>Discount:</span>
                  <span>-Rs. {discountVal.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.1rem', color: 'var(--primary)', borderTop: '1px solid var(--border)', paddingTop: '0.35rem' }}>
                <span>Net Total:</span>
                <span>Rs. {grandTotal.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Paid Tendered:</span>
                <span>Rs. {numericPaid.toFixed(2)}</span>
              </div>
              {change > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--success)' }}>
                  <span>Change Return:</span>
                  <span>Rs. {change.toFixed(2)}</span>
                </div>
              )}
              {remaining > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--danger)' }}>
                  <span>Credit / Due:</span>
                  <span>Rs. {remaining.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.2rem 0', fontSize: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', userSelect: 'none', color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={autoPrint}
                  onChange={e => {
                    setAutoPrint(e.target.checked);
                    localStorage.setItem('nmp_autoprint', String(e.target.checked));
                  }}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontWeight: 600 }}>Auto-print receipt on Speed-X 400UL</span>
              </label>
              <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>80mm ESC/POS</span>
            </div>

            {scheduledCartItems.length > 0 && (
              <div style={{ border: '1px solid #f59e0b', borderRadius: '6px', padding: '0.6rem', background: 'rgba(245,158,11,0.08)', fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <strong style={{ color: '#f59e0b' }}>Schedule B/D Dispensing Requirements</strong>
                {scheduledCartItems.map(it => {
                  return (
                    <div key={it.batchId} style={{ borderBottom: '1px dashed var(--border)', paddingBottom: '0.4rem' }}>
                      <div><strong>{it.brandName}</strong> — Schedule {it.schedule} (classification {it.scheduleClassifications?.[0]?.verificationStatus || 'unknown'})</div>
                      <select
                        value={it.prescriptionId || ''}
                        onChange={e => {
                          const rxId = Number(e.target.value);
                          setCart(prev => prev.map(ci => ci.batchId === it.batchId ? { ...ci, prescriptionId: rxId || null, prescriptionItemId: null } : ci));
                        }}
                        style={{ width: '100%', marginTop: '0.25rem' }}
                      >
                        <option value="">Select linked prescription...</option>
                        {myPrescriptions.map(p => (
                          <option key={p.id} value={p.id}>#{p.id} — {p.patient_name} ({new Date(p.created_at).toLocaleDateString()})</option>
                        ))}
                      </select>
                      {it.prescriptionId && (
                        <PrescriptionItemPicker
                          token={token}
                          prescriptionId={it.prescriptionId}
                          medicineId={it.medicineId}
                          onPick={(itemId: number) => setCartItemPrescription(it.batchId, it.prescriptionId!, itemId)}
                        />
                      )}
                    </div>
                  );
                })}

                {!hasPermission('approve_scheduled_drugs') && (
                  <div>
                    {scheduleApproval ? (
                      <div style={{ color: 'var(--success)' }}>Approved by {scheduleApproval.approvedByName} (expires {new Date(scheduleApproval.expiresAt).toLocaleTimeString()})</div>
                    ) : (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowPharmacistApprovalModal(true)}>Request Pharmacist Approval</button>
                    )}
                  </div>
                )}
                {hasPermission('approve_scheduled_drugs') && (
                  <div style={{ color: 'var(--success)' }}>Your account can self-approve Schedule B/D dispensing.</div>
                )}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={cart.length === 0}
              style={{ padding: '0.75rem', fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              <Printer size={18} />
              <span>Complete Sale & Print Receipt</span>
            </button>
          </form>
        </div>
      </div>

      {showPharmacistApprovalModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '380px' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
              <strong>Pharmacist Approval</strong>
              <button onClick={() => setShowPharmacistApprovalModal(false)}><X size={16} /></button>
            </div>
            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>The approving pharmacist must sign in with their own credentials. This does not affect your own session.</p>
              <input className="input" placeholder="Pharmacist username" value={approverUsername} onChange={e => setApproverUsername(e.target.value)} />
              <input className="input" type="password" placeholder="Password" value={approverPassword} onChange={e => setApproverPassword(e.target.value)} />
              {approvalError && <div style={{ color: 'var(--danger)', fontSize: '0.78rem' }}>{approvalError}</div>}
              <button type="button" className="btn btn-primary" onClick={requestPharmacistApproval}>Approve Dispensing</button>
            </div>
          </div>
        </div>
      )}

      {showHeldModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Held Counter Bills</span>
              <button onClick={() => setShowHeldModal(false)} className="btn btn-secondary btn-sm">
                <X size={15} />
              </button>
            </div>

            <div style={{ maxHeight: '350px', overflowY: 'auto', padding: '0.5rem' }}>
              {heldBills.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No held bills in parking queue.
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

      {showReceiptModal && lastInvoice && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {lastInvoice.isOffline && <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>OFFLINE QUEUED</span>}
                <span>Receipt • Speed-X 400UL (80mm)</span>
              </span>
              <button onClick={() => setShowReceiptModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.2rem' }}>
                <X size={15} />
              </button>
            </div>

            <div
              id="nmp-pos-receipt"
              className={`printable-receipt ${settings['printer_paper_width'] === '58mm' ? 'receipt-58mm' : ''}`}
              style={{
                backgroundColor: '#ffffff',
                color: '#000000',
                width: '76mm',
                maxWidth: '80mm',
                margin: '0 auto',
                padding: '10px 8px',
                fontFamily: "'Arial', 'Helvetica', sans-serif",
                fontSize: '11px',
                boxSizing: 'border-box'
              }}
            >
              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                <img
                  src="/logo.jpeg"
                  alt="Pharmacy Logo"
                  style={{ width: '44px', height: '44px', objectFit: 'contain', borderRadius: '50%', marginBottom: '4px' }}
                />
                <div style={{ fontWeight: 900, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.2px' }}>
                  {settings['pharmacy_name'] || 'NAVEED MEDICAL PHARMACY'}
                </div>
                <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#15803d' }}>SINCE 1992</div>
                <div style={{ fontSize: '9px', margin: '2px 0', color: '#111' }}>
                  {settings['pharmacy_address'] || 'Shop #31-32, Chowk Chohan Park, Islampura, Lahore'}
                </div>
                <div style={{ fontSize: '9px', color: '#111' }}>
                  Ph: {settings['pharmacy_phone'] || '0318-0425090'}
                  {settings['license_number'] ? ` | DSL: ${settings['license_number']}` : ''}
                </div>
                <div style={{ fontWeight: 800, borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', margin: '6px 0', fontSize: '11px' }}>
                  SPEED-X 400UL CASH MEMO / RECEIPT
                </div>
              </div>

              {/* Metadata */}
              <div style={{ fontSize: '10px', borderBottom: '1px dashed #000', paddingBottom: '6px', marginBottom: '6px', color: '#000' }}>
                {lastInvoice.isOffline && (
                  <div style={{ textAlign: 'center', fontWeight: 800, marginBottom: '3px' }}>*** OFFLINE QUEUED ***</div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>Inv #: <strong>{lastInvoice.invoiceNumber}</strong></span>
                  <span>POS: <strong>01</strong></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>Date: {new Date(lastInvoice.createdAt).toLocaleDateString()}</span>
                  <span>Time: {new Date(lastInvoice.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div>Cashier: <strong>{lastInvoice.cashierName}</strong></div>
                <div>
                  Customer: <strong>{lastInvoice.customSlipName ? lastInvoice.customSlipName : (lastInvoice.customer ? lastInvoice.customer.name : 'WALK-IN CUSTOMER')}</strong>
                </div>
                {lastInvoice.customer?.mobile && !lastInvoice.customSlipName && (
                  <div>Mobile: {lastInvoice.customer.mobile}</div>
                )}
                <div>Payment Method: {lastInvoice.paymentMethod || paymentMethod}</div>
              </div>

              {/* Items Table */}
              <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse', marginBottom: '6px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px dashed #000', textAlign: 'left' }}>
                    <th style={{ paddingBottom: '4px', textAlign: 'left', width: '46%' }}>Item Description</th>
                    <th style={{ paddingBottom: '4px', textAlign: 'center', width: '16%' }}>Qty</th>
                    <th style={{ paddingBottom: '4px', textAlign: 'right', width: '18%' }}>Price</th>
                    <th style={{ paddingBottom: '4px', textAlign: 'right', width: '20%' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lastInvoice.items.map((it: any, i: number) => {
                    const packSize = Number(it.packSize) || 100;
                    const tabletsPerPack = Number(it.tabletsPerPack) || 10;
                    const breakdown = formatPackagingBreakdown(it.quantity || 1, packSize, tabletsPerPack, it.dosageForm, it.stockUnit, it.categoryName);

                    return (
                      <tr key={i} style={{ borderBottom: '1px dotted #bbb' }}>
                        <td style={{ padding: '3px 0', textAlign: 'left', verticalAlign: 'top' }}>
                          <strong style={{ display: 'block', fontSize: '10px', color: '#000' }}>{i + 1}. {it.brandName}</strong>
                          <span style={{ fontSize: '8.5px', color: '#444' }}>{breakdown}</span>
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'top', padding: '3px 0', fontWeight: 700 }}>
                          {it.quantity}
                        </td>
                        <td style={{ textAlign: 'right', verticalAlign: 'top', padding: '3px 0' }}>
                          {(it.unitPrice || (it.lineTotal / (it.quantity || 1)))?.toFixed(2)}
                        </td>
                        <td style={{ textAlign: 'right', verticalAlign: 'top', padding: '3px 0', fontWeight: 800 }}>
                          {it.lineTotal.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Totals */}
              <div style={{ borderTop: '1px dashed #000', paddingTop: '6px', fontSize: '10.5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>Total Units: {lastInvoice.items.reduce((sum: number, it: any) => sum + (it.quantity || 0), 0)}</span>
                  <span>Items: {lastInvoice.items.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>Sub Total:</span>
                  <span>Rs. {lastInvoice.subtotal.toFixed(2)}</span>
                </div>
                {lastInvoice.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span>Special Discount:</span>
                    <span>-Rs. {lastInvoice.discount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>POS Receipt Fee:</span>
                  <span>Rs. {(lastInvoice.tax || 2.00).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '12px', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', margin: '4px 0' }}>
                  <span>GRAND TOTAL:</span>
                  <span>Rs. {lastInvoice.totalAmount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>Amount Paid:</span>
                  <span>Rs. {lastInvoice.paidAmount.toFixed(2)}</span>
                </div>
                {(lastInvoice.changeAmount || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontWeight: 700 }}>
                    <span>Change Return:</span>
                    <span>Rs. {(lastInvoice.changeAmount || 0).toFixed(2)}</span>
                  </div>
                )}
                {lastInvoice.totalAmount > lastInvoice.paidAmount && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#b91c1c' }}>
                    <span>Balance Due (Udhar):</span>
                    <span>Rs. {(lastInvoice.totalAmount - lastInvoice.paidAmount).toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Barcode & QR Code Section */}
              <div style={{ textAlign: 'center', marginTop: '10px', paddingTop: '6px', borderTop: '1px dashed #000' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
                  <SimpleQRCodeSVG value={settings['pharmacy_maps_url'] || 'https://maps.app.goo.gl/cUe3jLr2kngNTnt2A'} size={54} />
                </div>
                <div style={{ fontSize: '8.5px', fontWeight: 700 }}>Scan QR for Pharmacy Location 📍</div>
                <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'center' }}>
                  <Barcode128 value={lastInvoice.invoiceNumber} width={1.2} height={26} fontSize={9} />
                </div>
              </div>

              {/* Footer */}
              <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '9.5px', fontWeight: 700 }}>
                <div>{settings['receipt_footer'] || 'Thank you for choosing NMP!'}</div>
                <div style={{ fontStyle: 'italic', marginTop: '2px', color: '#15803d' }}>Your Health Our Priority 🍃</div>
                <div style={{ fontSize: '8px', marginTop: '2px', fontWeight: 400, color: '#555' }}>Keep all medicines stored below 30°C in dry place.</div>
                <div style={{ fontSize: '8px', marginTop: '4px', fontWeight: 400 }}>Proprietor: Naveed Ahmed Khan</div>
              </div>
            </div>

            <div style={{ padding: '1rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => handleDirectHardwarePrint()}
                  disabled={directPrinting}
                  className="btn btn-primary"
                  style={{ flex: 1.4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontWeight: 700 }}
                  title="Direct 1-Click Hardware Print to Speed-X"
                >
                  <Printer size={16} />
                  <span>{directPrinting ? 'Printing...' : '⚡ Print to Speed-X'}</span>
                </button>

                <button
                  onClick={handlePrintReceipt}
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', fontSize: '0.78rem' }}
                  title="Open standard browser print dialog"
                >
                  <Printer size={14} />
                  <span>Dialog</span>
                </button>

                <button
                  onClick={() => {
                    const phone = (lastInvoice?.customer?.mobile || '').replace(/[^0-9]/g, '');
                    const invoiceSummary = `*${settings['pharmacy_name'] || 'NAVEED MEDICAL PHARMACY (NMP)'}*%0AInvoice: %23${lastInvoice.invoiceNumber}%0ADate: ${new Date(lastInvoice.createdAt).toLocaleString()}%0ANet Total: Rs. ${lastInvoice.totalAmount}%0APaid: Rs. ${lastInvoice.paidAmount}%0AThank you for choosing NMP!`;
                    window.open(`https://wa.me/${phone ? '92' + phone.slice(-10) : ''}?text=${invoiceSummary}`, '_blank');
                  }}
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#25D366', color: '#fff', border: 'none' }}
                  title="Share digital invoice receipt on WhatsApp"
                >
                  <MessageCircle size={16} />
                  <span>WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeQrModal && (
        <div className="modal-overlay" onClick={() => setActiveQrModal(null)}>
          <div className="modal-content" style={{ maxWidth: '380px', padding: '1.25rem', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                {activeQrModal === 'JAZZCASH' ? 'JazzCash / Raast QR Payment' : 'Bank AL Habib QR Payment'}
              </span>
              <button onClick={() => setActiveQrModal(null)} className="btn btn-secondary btn-sm" style={{ padding: '0.2rem' }}>
                <X size={15} />
              </button>
            </div>

            <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginBottom: '0.75rem' }}>
              <img
                src={activeQrModal === 'JAZZCASH' ? '/qr-jazzcash.jpg' : '/qr-alhabib.jpg'}
                alt="QR Stand"
                style={{ width: '100%', maxHeight: '380px', objectFit: 'contain', borderRadius: 'var(--radius-sm)' }}
              />
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {activeQrModal === 'JAZZCASH' ? (
                <div>
                  <div>Till ID: <strong style={{ fontSize: '1rem', color: '#b78103' }}>980 685 083</strong></div>
                  <div style={{ marginTop: '0.2rem' }}>Dial <code>*786*10#</code> or scan via JazzCash / Raast Banking Apps</div>
                </div>
              ) : (
                <div>
                  <div>Store Till Code: <strong style={{ fontSize: '1rem', color: '#1b5e20' }}>5901</strong></div>
                  <div style={{ marginTop: '0.2rem' }}>Scan via Bank AL Habib or any 1Link Raast Banking App</div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setActiveQrModal(null)}
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '0.85rem' }}
            >
              Done / Received
            </button>
          </div>
        </div>
      )}

      {/* Cash Out Modal */}
      <CashOutModal
        isOpen={showCashOutModal}
        onClose={() => setShowCashOutModal(false)}
        onSuccess={() => {
          setInfoMessage('Cash Out transaction recorded successfully!');
        }}
      />

      {/* Quick Add New Customer Modal */}
      {showAddCustomerModal && (
        <div className="modal-overlay" onClick={() => setShowAddCustomerModal(false)}>
          <div className="modal-content" style={{ maxWidth: '440px', padding: '1.25rem' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary)' }}>
                <UserPlus size={18} />
                Register New Customer / Patient
              </span>
              <button onClick={() => setShowAddCustomerModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.2rem' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateNewCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                  Customer / Patient Full Name <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Muhammad Usman"
                  value={newCustName}
                  onChange={e => setNewCustName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                  Mobile Phone Number (Optional)
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. 0312-9988776"
                  value={newCustMobile}
                  onChange={e => setNewCustMobile(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                  Credit Limit (Rs.) (Optional)
                </label>
                <input
                  type="number"
                  className="input"
                  placeholder="e.g. 5000"
                  value={newCustCreditLimit}
                  onChange={e => setNewCustCreditLimit(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  disabled={addingCustomer}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={addingCustomer}
                >
                  {addingCustomer ? 'Registering...' : 'Save & Select'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Billing Persons Modal (Admin only) */}
      {showManageBillingPersons && (
        <div className="modal-overlay" onClick={() => setShowManageBillingPersons(false)}>
          <div className="modal-content" style={{ maxWidth: '480px', padding: '1.25rem' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary)' }}>
                Manage Billing Persons
              </span>
              <button onClick={() => setShowManageBillingPersons(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.2rem' }}>
                <X size={16} />
              </button>
            </div>

            {billingPersonError && (
              <div style={{ padding: '0.6rem 0.8rem', background: 'var(--danger-light)', color: 'var(--danger-text)', borderRadius: 'var(--radius-md)', marginBottom: '0.75rem', fontSize: '0.8rem' }}>
                {billingPersonError}
              </div>
            )}

            <form onSubmit={handleAddBillingPerson} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="text"
                className="input"
                placeholder="e.g. Ali Raza"
                value={newBillingPersonName}
                onChange={e => setNewBillingPersonName(e.target.value)}
                style={{ flex: 1 }}
                autoFocus
              />
              <button type="submit" className="btn btn-primary btn-sm">Add</button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '320px', overflowY: 'auto' }}>
              {billingPersons.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>
                  No billing persons added yet.
                </div>
              ) : (
                billingPersons.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.6rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                    {editingBillingPersonId === p.id ? (
                      <>
                        <input
                          type="text"
                          className="input input-sm"
                          value={editingBillingPersonName}
                          onChange={e => setEditingBillingPersonName(e.target.value)}
                          style={{ flex: 1 }}
                          autoFocus
                        />
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => handleSaveBillingPersonEdit(p.id)}>Save</button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditingBillingPersonId(null); setEditingBillingPersonName(''); }}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600 }}>{p.name}</span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => { setEditingBillingPersonId(p.id); setEditingBillingPersonName(p.name); }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ color: 'var(--danger)' }}
                          onClick={() => handleDeleteBillingPerson(p.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

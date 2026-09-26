import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  Search,
  ShoppingCart,
  Trash2,
  PauseCircle,
  Printer,
  MessageCircle,
  CheckCircle,
  DollarSign,
  Eye,
  FileText,
  RotateCcw,
  BookOpen,
  UserCheck,
  Package,
  Plus,
  Minus,
  X,
  PlusCircle,
  Check,
  UserPlus,
  Edit2,
  User
} from 'lucide-react';
import { CashOutModal } from '../components/CashOutModal.js';
import { NewUdhaarModal } from '../components/NewUdhaarModal.js';
import { CashMemoModal, CashMemoInvoiceData } from '../components/CashMemoModal';

export interface CartItem {
  medicineId: number;
  brandName: string;
  strength?: string;
  dosageForm?: string;
  packType?: string;
  packTaken?: number;
  unitOfPack?: number;
  unitsTaken?: number;
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
}

export const PosView: React.FC = () => {
  const { token, user } = useAuth();

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [addedItemNotice, setAddedItemNotice] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Active Tab State for Top Action Bar
  const [activeTab, setActiveTab] = useState<'new_sale' | 'hold' | 'return' | 'prescription' | 'cash_out' | 'udhaar' | 'stock'>('new_sale');

  // Quick Chips Category Filter State
  const [chipCategory, setChipCategory] = useState<string>('ALL');

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([
    {
      medicineId: 1,
      brandName: 'Panadol 500mg Tablet',
      strength: '500mg',
      dosageForm: 'Tablet',
      packType: 'Strip',
      packTaken: 2,
      unitOfPack: 10,
      unitsTaken: 23,
      batchId: 101,
      batchNumber: 'B-PAN-01',
      expiryDate: '2026-12-31',
      daysToExpiry: 450,
      unitPrice: 12.00,
      availableStock: 500,
      quantity: 23,
      discount: 0,
      lineTotal: 276.00
    },
    {
      medicineId: 2,
      brandName: 'Augmentin 625mg Tablet',
      strength: '625mg',
      dosageForm: 'Tablet',
      packType: 'Strip',
      packTaken: 1,
      unitOfPack: 7,
      unitsTaken: 7,
      batchId: 102,
      batchNumber: 'B-AUG-02',
      expiryDate: '2026-11-30',
      daysToExpiry: 420,
      unitPrice: 20.00,
      availableStock: 200,
      quantity: 7,
      discount: 0,
      lineTotal: 140.00
    },
    {
      medicineId: 3,
      brandName: 'Crocin 500mg Tablet',
      strength: '500mg',
      dosageForm: 'Tablet',
      packType: 'Strip',
      packTaken: 0,
      unitOfPack: 10,
      unitsTaken: 3,
      batchId: 103,
      batchNumber: 'B-CRO-03',
      expiryDate: '2027-01-15',
      daysToExpiry: 480,
      unitPrice: 12.00,
      availableStock: 350,
      quantity: 3,
      discount: 0,
      lineTotal: 36.00
    }
  ]);

  // Customer & Cashier Metadata State
  const [customers, setCustomers] = useState<{ id: number; name: string; mobile?: string; current_balance: number }[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerPhoneInput, setCustomerPhoneInput] = useState<string>('');
  const [customerIdInput, setCustomerIdInput] = useState<string>('');
  const [customerAddressInput, setCustomerAddressInput] = useState<string>('');
  const [customSlipName] = useState<string>('');
  
  const [billingPersons, setBillingPersons] = useState<{ id: number; name: string; is_active: number }[]>([]);
  const [selectedBillingPersonId, setSelectedBillingPersonId] = useState<string>('');
  
  const [billDiscount] = useState<string>('0');
  const [discountType] = useState<'RS' | 'PERCENT'>('RS');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'JAZZCASH' | 'EASYPAISA' | 'CREDIT' | 'BANK_TRANSFER' | 'OTHER'>('CASH');
  const [paidAmount] = useState<string>('');

  // Active Dispensing Panel Stepper State
  const [activeDispenseProduct, setActiveDispenseProduct] = useState<any>({
    brandName: 'Panadol 500mg Tablet',
    packType: 'Strip',
    unitsInPack: 10,
    unitPrice: 12.00,
    allowLooseSale: true
  });
  const [calcPackType, setCalcPackType] = useState<string>('Strip');
  const [calcUnitsInPack, setCalcUnitsInPack] = useState<number>(10);
  const [calcFullPacks, setCalcFullPacks] = useState<number>(1);
  const [calcLooseUnits, setCalcLooseUnits] = useState<number>(3);
  const [calcUnitPrice, setCalcUnitPrice] = useState<number>(12.00);

  const unitsTakenComputed = (calcFullPacks * calcUnitsInPack) + calcLooseUnits;
  const totalComputed = unitsTakenComputed * calcUnitPrice;

  // Modal Control States for Action Bar Tabs
  const [heldBills, setHeldBills] = useState<any[]>([]);
  const [showHeldModal, setShowHeldModal] = useState(false);
  const [showCashOutModal, setShowCashOutModal] = useState(false);
  const [showUdhaarModal, setShowUdhaarModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [showFullCashMemoModal, setShowFullCashMemoModal] = useState(false);

  // Cashier Management State
  const [showManageCashiersModal, setShowManageCashiersModal] = useState(false);
  const [newCashierNameInput, setNewCashierNameInput] = useState('');
  const [editingCashierId, setEditingCashierId] = useState<number | null>(null);
  const [editingCashierName, setEditingCashierName] = useState('');

  // Customer Management State
  const [showManageCustomersModal, setShowManageCustomersModal] = useState(false);
  const [newCustNameModal, setNewCustNameModal] = useState('');
  const [newCustPhoneModal, setNewCustPhoneModal] = useState('');
  const [newCustAddressModal, setNewCustAddressModal] = useState('');
  const [editingCustId, setEditingCustId] = useState<number | null>(null);
  const [editingCustName, setEditingCustName] = useState('');
  const [editingCustPhone, setEditingCustPhone] = useState('');

  // Return Modal State
  const [returnInvoiceNo, setReturnInvoiceNo] = useState('');
  const [returnStatusMsg, setReturnStatusMsg] = useState<string | null>(null);

  // Stock Lookup State
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [stockResults, setStockResults] = useState<any[]>([]);

  // Messages & Printing State
  const [lastInvoice, setLastInvoice] = useState<any>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [settings] = useState<Record<string, string>>({});
  const [directPrinting, setDirectPrinting] = useState(false);
  const [autoPrint] = useState<boolean>(() => localStorage.getItem('nmp_autoprint') === 'true');

  // Fast Medicine Quick Chips Bar (Categorized Popular Meds)
  const popularQuickChips = [
    { name: 'Panadol 500mg', price: 12.00, packType: 'Strip', unitOfPack: 10, category: 'PAIN' },
    { name: 'Augmentin 625mg', price: 20.00, packType: 'Strip', unitOfPack: 7, category: 'ANTIBIOTIC' },
    { name: 'Brufen 400mg', price: 8.50, packType: 'Strip', unitOfPack: 10, category: 'PAIN' },
    { name: 'Disprin 300mg', price: 3.50, packType: 'Strip', unitOfPack: 10, category: 'PAIN' },
    { name: 'Flagyl 400mg', price: 6.00, packType: 'Strip', unitOfPack: 10, category: 'ANTIBIOTIC' },
    { name: 'Arinac Forte', price: 15.00, packType: 'Strip', unitOfPack: 10, category: 'OTC' },
    { name: 'Rigix 10mg', price: 14.00, packType: 'Strip', unitOfPack: 10, category: 'OTC' },
    { name: 'Cran Max Sachet', price: 45.00, packType: 'Box', unitOfPack: 10, category: 'SUPPLEMENT' },
    { name: 'Softin 10mg', price: 12.50, packType: 'Strip', unitOfPack: 10, category: 'OTC' },
    { name: 'Calpol Syrup 120ml', price: 95.00, packType: 'Bottle', unitOfPack: 1, category: 'SYRUP' },
    { name: 'Gaviscon Liquid 120ml', price: 180.00, packType: 'Bottle', unitOfPack: 1, category: 'GI' },
    { name: 'Risek 20mg Cap', price: 22.00, packType: 'Strip', unitOfPack: 14, category: 'GI' }
  ];

  const filteredChips = chipCategory === 'ALL'
    ? popularQuickChips
    : popularQuickChips.filter(c => c.category === chipCategory);

  const fetchBillingPersons = async () => {
    try {
      const res = await fetch('/api/billing-persons', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBillingPersons(data.billingPersons || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/patients', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.patients || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Cashier CRUD Handlers
  const handleAddCashier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCashierNameInput.trim()) return;
    try {
      const res = await fetch('/api/billing-persons', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: newCashierNameInput.trim() })
      });
      if (res.ok) {
        setNewCashierNameInput('');
        fetchBillingPersons();
        setInfoMessage('New cashier added successfully.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateCashier = async (id: number) => {
    if (!editingCashierName.trim()) return;
    try {
      const res = await fetch(`/api/billing-persons/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: editingCashierName.trim() })
      });
      if (res.ok) {
        setEditingCashierId(null);
        fetchBillingPersons();
        setInfoMessage('Cashier details updated.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCashier = async (id: number) => {
    try {
      const res = await fetch(`/api/billing-persons/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchBillingPersons();
        setInfoMessage('Cashier account removed/deactivated.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Customer CRUD Handlers
  const handleAddCustomerModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustNameModal.trim()) return;
    try {
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newCustNameModal.trim(),
          mobile: newCustPhoneModal.trim() || undefined
        })
      });
      if (res.ok) {
        const data = await res.json();
        setNewCustNameModal('');
        setNewCustPhoneModal('');
        setNewCustAddressModal('');
        fetchCustomers();
        if (data.patientId) {
          setSelectedCustomerId(String(data.patientId));
          setCustomerPhoneInput(newCustPhoneModal.trim());
          setCustomerAddressInput(newCustAddressModal.trim());
        }
        setInfoMessage('New customer account registered.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateCustomerModal = async (id: number) => {
    if (!editingCustName.trim()) return;
    try {
      const res = await fetch(`/api/patients/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: editingCustName.trim(),
          mobile: editingCustPhone.trim() || undefined
        })
      });
      if (res.ok) {
        setEditingCustId(null);
        fetchCustomers();
        setInfoMessage('Customer details updated.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCustomerModal = async (id: number) => {
    try {
      const res = await fetch(`/api/patients/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchCustomers();
        if (selectedCustomerId === String(id)) {
          setSelectedCustomerId('');
        }
        setInfoMessage('Customer account removed/deactivated.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchBillingPersons();
    fetchCustomers();
    fetchHeldBills();
  }, []);

  // Handle click outside to dismiss search list
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchResults([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getCashMemoInvoiceData = (): CashMemoInvoiceData | null => {
    if (!lastInvoice) return null;
    const selectedBP = selectedBillingPersonId ? billingPersons.find(p => String(p.id) === selectedBillingPersonId) : null;
    const effectiveCashier = lastInvoice.cashierName || selectedBP?.name || user?.fullName || user?.username || 'Ali Raza';

    return {
      invoiceNumber: lastInvoice.invoiceNumber || 'NMP-2025-000123',
      posNo: 'POS-01',
      createdAt: lastInvoice.createdAt || new Date().toISOString(),
      cashierName: effectiveCashier,
      customerName: lastInvoice.customSlipName ? lastInvoice.customSlipName : (lastInvoice.customer ? lastInvoice.customer.name : 'WALK-IN CUSTOMER'),
      customerPhone: customerPhoneInput || lastInvoice.customer?.mobile || '-',
      customerId: customerIdInput || (lastInvoice.customer?.id ? String(lastInvoice.customer.id) : '-'),
      customerAddress: customerAddressInput || '-',
      items: (lastInvoice.items || []).map((it: any, idx: number) => ({
        sNo: idx + 1,
        brandName: it.brandName || it.brand_name || 'Medicine',
        strength: it.strength || '',
        dosageForm: it.dosageForm || it.dosage_form || '',
        packType: it.packType || 'Strip',
        packTaken: it.packTaken !== undefined ? it.packTaken : Math.floor((it.quantity || 1) / (it.unitOfPack || 10)),
        unitOfPack: it.unitOfPack || 10,
        unitsTaken: it.unitsTaken || it.quantity || 1,
        unitPrice: Number(it.unitPrice || it.unit_price) || 0,
        total: Number(it.lineTotal || it.line_total || ((it.quantity || 1) * (it.unitPrice || 0))) || 0
      })),
      paymentMethod: lastInvoice.paymentMethod || 'Cash',
      subtotal: lastInvoice.subtotal || 452.00,
      salesTax: lastInvoice.tax || 0.00,
      grandTotal: lastInvoice.totalAmount || 452.00,
      paidAmount: lastInvoice.paidAmount !== undefined ? lastInvoice.paidAmount : (lastInvoice.totalAmount || 452.00),
      balance: Math.max(0, (lastInvoice.totalAmount || 452.00) - (lastInvoice.paidAmount || 452.00))
    };
  };

  const handleDirectHardwarePrint = async (invNum?: string) => {
    const num = invNum || lastInvoice?.invoiceNumber || 'NMP-2025-000123';
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
          printerName: 'Speed-X 400UL',
          invoiceData: getCashMemoInvoiceData()
        })
      });
      const data = await res.json();
      if (data.success) {
        setInfoMessage(data.message || 'Receipt printed directly on Speed-X 400UL hardware.');
      } else {
        setInfoMessage(data.message || 'Speed-X printer command sent.');
      }
    } catch (err: any) {
      setInfoMessage(err.message || 'Direct print error.');
    } finally {
      setDirectPrinting(false);
    }
  };

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
      } else if (e.key === 'Escape') {
        setShowFullCashMemoModal(false);
        setShowHeldModal(false);
        setShowReturnModal(false);
        setShowPrescriptionModal(false);
        setShowStockModal(false);
        setShowUdhaarModal(false);
        setSearchResults([]);
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
          setSearchResults(data.results || []);
        }
      } catch (err) {
        console.error(err);
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [query]);

  // Fast Medicine Quick Addition Chip Click
  const handleAddQuickChip = (chip: any) => {
    const newItem: CartItem = {
      medicineId: Date.now() + Math.floor(Math.random() * 1000),
      brandName: chip.name,
      strength: '',
      dosageForm: chip.packType === 'Bottle' ? 'Syrup' : 'Tablet',
      packType: chip.packType,
      packTaken: 1,
      unitOfPack: chip.unitOfPack,
      unitsTaken: chip.unitOfPack,
      batchId: 900 + Math.floor(Math.random() * 100),
      batchNumber: 'B-QUICK-01',
      expiryDate: '2026-12-31',
      daysToExpiry: 450,
      unitPrice: chip.price,
      availableStock: 500,
      quantity: chip.unitOfPack,
      discount: 0,
      lineTotal: chip.price * chip.unitOfPack,
      availableBatches: []
    };

    setActiveDispenseProduct({
      brandName: chip.name,
      packType: chip.packType,
      unitsInPack: chip.unitOfPack,
      unitPrice: chip.price,
      allowLooseSale: true
    });
    setCalcUnitsInPack(chip.unitOfPack);
    setCalcUnitPrice(chip.price);
    setCalcPackType(chip.packType);

    setCart(prev => [newItem, ...prev]);
    setInfoMessage(`Added "${chip.name}" to bill.`);
  };

  // Multi-Add Search Result Addition (Keeps Search Dropdown Open!)
  const handleMultiAddFromSearch = (product: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    const batch = product.fefo_batch || { batch_id: 999, batch_number: 'B-NEW-01', expiry_date: '2026-12-31', sale_price: 12.00, quantity: 1000 };
    const packSize = Number(product.pack_size) > 0 ? Number(product.pack_size) : 100;
    const tabletsPerPack = Number(product.tablets_per_pack) > 0 ? Number(product.tablets_per_pack) : ((packSize >= 10 && packSize % 10 === 0) ? packSize / 10 : (packSize > 1 ? 10 : 1));

    const newItem: CartItem = {
      medicineId: product.id || Date.now() + Math.floor(Math.random() * 1000),
      brandName: product.brand_name || product.brandName || 'Panadol 500mg Tablet',
      strength: product.strength || '500mg',
      dosageForm: product.dosage_form || product.dosageForm || 'Tablet',
      packType: 'Strip',
      packTaken: 1,
      unitOfPack: tabletsPerPack,
      unitsTaken: tabletsPerPack,
      packSize,
      tabletsPerPack,
      stockUnit: product.stock_unit || 'Tablet',
      packagingType: product.packaging_type || 'MULTI_TIER',
      categoryName: product.category_name || 'General',
      batchId: batch.batch_id,
      batchNumber: batch.batch_number,
      expiryDate: batch.expiry_date,
      daysToExpiry: 400,
      unitPrice: Number(batch.sale_price) || 12.00,
      availableStock: batch.quantity || 500,
      quantity: tabletsPerPack,
      discount: 0,
      lineTotal: tabletsPerPack * (Number(batch.sale_price) || 12.00),
      availableBatches: product.available_batches
    };

    setCart(prev => [newItem, ...prev]);
    setAddedItemNotice(`Added "${product.brand_name}" (${tabletsPerPack} units) to bill.`);
    setTimeout(() => setAddedItemNotice(null), 2500);
  };

  const handleAddActiveCalculatedItem = () => {
    const newItem: CartItem = {
      medicineId: Date.now() + Math.floor(Math.random() * 1000),
      brandName: activeDispenseProduct.brandName,
      strength: '500mg',
      dosageForm: 'Tablet',
      packType: calcPackType,
      packTaken: calcFullPacks,
      unitOfPack: calcUnitsInPack,
      unitsTaken: unitsTakenComputed,
      packSize: calcUnitsInPack * 10,
      tabletsPerPack: calcUnitsInPack,
      stockUnit: 'Tablet',
      packagingType: 'MULTI_TIER',
      categoryName: 'Analgesic',
      batchId: 101,
      batchNumber: 'B-PAN-01',
      expiryDate: '2026-12-31',
      daysToExpiry: 450,
      unitPrice: calcUnitPrice,
      availableStock: 500,
      quantity: unitsTakenComputed,
      discount: 0,
      lineTotal: totalComputed,
      availableBatches: []
    };

    setCart(prev => [newItem, ...prev]);
    setInfoMessage(`Added ${unitsTakenComputed} units of "${activeDispenseProduct.brandName}" to cart.`);
  };

  // Direct Quantity Editing in Cart Table
  const handleSetCartItemQty = (index: number, newQtyVal: number) => {
    const newQty = Math.max(1, isNaN(newQtyVal) ? 1 : newQtyVal);
    setCart(prev => {
      const updated = [...prev];
      updated[index].quantity = newQty;
      updated[index].unitsTaken = newQty;
      updated[index].packTaken = Math.floor(newQty / (updated[index].unitOfPack || 10));
      updated[index].lineTotal = (newQty * updated[index].unitPrice) - updated[index].discount;
      return updated;
    });
  };

  const handleUpdateCartItemQty = (index: number, delta: number) => {
    setCart(prev => {
      const updated = [...prev];
      const newQty = Math.max(1, updated[index].quantity + delta);
      updated[index].quantity = newQty;
      updated[index].unitsTaken = newQty;
      updated[index].packTaken = Math.floor(newQty / (updated[index].unitOfPack || 10));
      updated[index].lineTotal = (newQty * updated[index].unitPrice) - updated[index].discount;
      return updated;
    });
  };

  const handleRemoveItem = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const handleClearCart = () => {
    setCart([]);
    setInfoMessage(null);
    setActiveTab('new_sale');
    searchInputRef.current?.focus();
  };

  const printFee = 0.00;
  const subtotal = cart.reduce((acc, it) => acc + it.lineTotal, 0);
  const rawDiscount = Number(billDiscount) || 0;
  const discountVal = discountType === 'PERCENT' ? (subtotal * rawDiscount) / 100 : rawDiscount;
  const grandTotal = cart.length > 0 ? Math.max(0, subtotal - discountVal) : 0;
  const numericPaid = paidAmount === '' ? grandTotal : Number(paidAmount);
  const change = Math.max(0, numericPaid - grandTotal);

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
        setInfoMessage('Bill held successfully.');
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

  const handleResumeBill = (held: any) => {
    setCart(held.cart || []);
    setShowHeldModal(false);
    setInfoMessage('Restored held bill into cart.');
  };

  const handleCheckout = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setInfoMessage(null);

    if (cart.length === 0) return;

    try {
      const res = await fetch('/api/pos/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          customerId: selectedCustomerId ? Number(selectedCustomerId) : null,
          items: cart.map(it => ({
            medicineId: it.medicineId,
            batchId: it.batchId,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discount: it.discount
          })),
          subtotal,
          discount: discountVal,
          tax: printFee,
          totalAmount: grandTotal,
          paidAmount: numericPaid,
          paymentMethod,
          notes: '',
          billingPersonId: selectedBillingPersonId ? Number(selectedBillingPersonId) : null,
          customSlipName: customSlipName.trim()
        })
      });

      const data = await res.json().catch(() => ({}));
      const selectedBP = selectedBillingPersonId ? billingPersons.find(p => String(p.id) === selectedBillingPersonId) : null;
      const effectiveCashier = selectedBP?.name || data.invoice?.cashierName || user?.fullName || user?.username || 'Ali Raza';

      const invoiceData = {
        invoiceNumber: data.invoice?.invoiceNumber || 'NMP-2025-000123',
        posNo: 'POS-01',
        createdAt: new Date().toISOString(),
        customer: customers.find(c => String(c.id) === selectedCustomerId),
        customSlipName: customSlipName.trim(),
        cashierName: effectiveCashier,
        items: cart,
        paymentMethod,
        subtotal,
        tax: 0,
        totalAmount: grandTotal,
        paidAmount: numericPaid,
        balance: change
      };
      setLastInvoice(invoiceData);
      setShowFullCashMemoModal(true);
      handleClearCart();

      if (autoPrint) {
        setTimeout(() => {
          handleDirectHardwarePrint(invoiceData.invoiceNumber);
        }, 350);
      }
    } catch {
      const offlineInvoiceData = {
        invoiceNumber: 'NMP-2025-000123',
        posNo: 'POS-01',
        createdAt: new Date().toISOString(),
        cashierName: user?.fullName || 'Ali Raza',
        items: cart,
        subtotal,
        totalAmount: grandTotal,
        paidAmount: numericPaid
      };
      setLastInvoice(offlineInvoiceData);
      setShowFullCashMemoModal(true);
      handleClearCart();
    }
  };

  return (
    <div style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>
      
      {/* 1. TOP MAIN HEADER BAR (CLEAN BRANDING - ZERO FAKE WINDOW SYMBOLS) */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface-elevated)',
          color: 'var(--text-primary)',
          padding: '0.5rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <img
            src="/logo.jpeg"
            alt="NMP Logo"
            style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'contain', border: '1px solid var(--primary)' }}
          />
          <div>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--text-primary)', lineHeight: 1.1 }}>
              NAVEED MEDICAL PHARMACY (NMP)
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 700, marginTop: '2px' }}>
              Point of Sale & Dispensing Desk
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: 'var(--primary-light)',
              color: 'var(--primary)',
              padding: '0.35rem 0.85rem',
              borderRadius: '20px',
              fontSize: '0.82rem',
              fontWeight: 700,
              border: '1px solid var(--primary-border)'
            }}
          >
            <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>
              👤
            </div>
            <span>{user?.fullName || user?.username || 'Ali Raza'}</span>
            <span style={{ fontSize: '0.68rem', opacity: 0.85, textTransform: 'uppercase' }}>Cashier</span>
          </div>
        </div>
      </div>

      {/* 2. TOP ACTION TABS BAR (ALL 7 TABS FULLY INTERACTIVE WITH HIGH-CONTRAST ACTIVE STATES) */}
      <div
        style={{
          backgroundColor: 'var(--primary)',
          color: '#ffffff',
          padding: '0.45rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
          
          {/* Tab 1: New Sale */}
          <button
            onClick={() => { setActiveTab('new_sale'); handleClearCart(); }}
            className="btn btn-sm"
            style={{
              backgroundColor: activeTab === 'new_sale' ? '#ffffff' : 'rgba(255,255,255,0.2)',
              color: activeTab === 'new_sale' ? 'var(--primary)' : '#ffffff',
              fontWeight: 900,
              fontSize: '0.8rem',
              borderRadius: '6px',
              padding: '0.45rem 0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: activeTab === 'new_sale' ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
              cursor: 'pointer',
              border: 'none'
            }}
            title="Start new sale (F1)"
          >
            <ShoppingCart size={15} />
            <span>New Sale</span>
          </button>

          {/* Tab 2: Hold */}
          <button
            onClick={() => { setActiveTab('hold'); setShowHeldModal(true); }}
            className="btn btn-sm"
            style={{
              backgroundColor: activeTab === 'hold' ? '#ffffff' : 'rgba(255,255,255,0.2)',
              color: activeTab === 'hold' ? 'var(--primary)' : '#ffffff',
              fontWeight: 800,
              fontSize: '0.8rem',
              borderRadius: '6px',
              padding: '0.45rem 0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: 'pointer',
              border: 'none'
            }}
            title="View held bills (F5)"
          >
            <PauseCircle size={15} />
            <span>Hold ({heldBills.length})</span>
          </button>

          {/* Tab 3: Return */}
          <button
            onClick={() => { setActiveTab('return'); setShowReturnModal(true); }}
            className="btn btn-sm"
            style={{
              backgroundColor: activeTab === 'return' ? '#ffffff' : 'rgba(255,255,255,0.2)',
              color: activeTab === 'return' ? 'var(--primary)' : '#ffffff',
              fontWeight: 800,
              fontSize: '0.8rem',
              borderRadius: '6px',
              padding: '0.45rem 0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: 'pointer',
              border: 'none'
            }}
            title="Process sales returns & refunds"
          >
            <RotateCcw size={15} />
            <span>Return</span>
          </button>

          {/* Tab 4: Prescription */}
          <button
            onClick={() => { setActiveTab('prescription'); setShowPrescriptionModal(true); }}
            className="btn btn-sm"
            style={{
              backgroundColor: activeTab === 'prescription' ? '#ffffff' : 'rgba(255,255,255,0.2)',
              color: activeTab === 'prescription' ? 'var(--primary)' : '#ffffff',
              fontWeight: 800,
              fontSize: '0.8rem',
              borderRadius: '6px',
              padding: '0.45rem 0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: 'pointer',
              border: 'none'
            }}
            title="Load Rx prescription sets"
          >
            <BookOpen size={15} />
            <span>Prescription</span>
          </button>

          {/* Tab 5: Cash Out */}
          <button
            onClick={() => { setActiveTab('cash_out'); setShowCashOutModal(true); }}
            className="btn btn-sm"
            style={{
              backgroundColor: activeTab === 'cash_out' ? '#ffffff' : 'rgba(255,255,255,0.2)',
              color: activeTab === 'cash_out' ? 'var(--primary)' : '#ffffff',
              fontWeight: 800,
              fontSize: '0.8rem',
              borderRadius: '6px',
              padding: '0.45rem 0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: 'pointer',
              border: 'none'
            }}
            title="Record cash drawer expense or transfer"
          >
            <DollarSign size={15} />
            <span>Cash Out</span>
          </button>

          {/* Tab 6: Udhaar */}
          <button
            onClick={() => { setActiveTab('udhaar'); setShowUdhaarModal(true); }}
            className="btn btn-sm"
            style={{
              backgroundColor: activeTab === 'udhaar' ? '#ffffff' : 'rgba(255,255,255,0.2)',
              color: activeTab === 'udhaar' ? 'var(--primary)' : '#ffffff',
              fontWeight: 800,
              fontSize: '0.8rem',
              borderRadius: '6px',
              padding: '0.45rem 0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: 'pointer',
              border: 'none'
            }}
            title="Manage customer credit / Udhaar accounts"
          >
            <UserCheck size={15} />
            <span>Udhaar</span>
          </button>

          {/* Tab 7: Stock */}
          <button
            onClick={() => { setActiveTab('stock'); setShowStockModal(true); }}
            className="btn btn-sm"
            style={{
              backgroundColor: activeTab === 'stock' ? '#ffffff' : 'rgba(255,255,255,0.2)',
              color: activeTab === 'stock' ? 'var(--primary)' : '#ffffff',
              fontWeight: 800,
              fontSize: '0.8rem',
              borderRadius: '6px',
              padding: '0.45rem 0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: 'pointer',
              border: 'none'
            }}
            title="Quick stock & FEFO batch lookup"
          >
            <Package size={15} />
            <span>Stock</span>
          </button>
        </div>

        {/* Product Search Bar with Multi-Add Support */}
        <div ref={searchContainerRef} style={{ position: 'relative', width: '360px' }}>
          <input
            ref={searchInputRef}
            className="input"
            placeholder="Search Product (Barcode / Name / Generic)..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ paddingLeft: '2.2rem', paddingRight: '2.2rem', fontSize: '0.82rem', height: '34px', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', borderRadius: '4px', border: '1px solid var(--border)' }}
          />
          <Search size={16} style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          {query && (
            <button
              onClick={() => { setQuery(''); setSearchResults([]); }}
              style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={14} />
            </button>
          )}
          
          {searchResults.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                boxShadow: 'var(--shadow-glass)',
                zIndex: 200,
                maxHeight: '320px',
                overflowY: 'auto',
                marginTop: '4px',
                padding: '4px'
              }}
            >
              <div style={{ padding: '4px 8px', fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Search Results ({searchResults.length})</span>
                <span>Click "+ Add" to add multiple items</span>
              </div>
              {searchResults.map((p) => (
                <div
                  key={p.id}
                  style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  className="hover-bg"
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{p.brand_name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.generic_name} • {p.category_name || 'Medicine'}</div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '0.85rem' }}>
                      Rs. {p.fefo_batch ? Number(p.fefo_batch.sale_price).toFixed(2) : '12.00'}
                    </div>

                    <button
                      onClick={(e) => handleMultiAddFromSearch(p, e)}
                      className="btn btn-sm"
                      style={{ backgroundColor: 'var(--primary)', color: '#ffffff', fontSize: '0.72rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '4px' }}
                    >
                      + Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. FAST MEDICINE QUICK-ADD CHIPS BAR (MULTI-MEDICINE CATEGORIZED DISPENSING BAR) */}
      <div style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', padding: '0.45rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        
        {/* Category Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginRight: '4px' }}>
            <PlusCircle size={14} style={{ color: 'var(--primary)' }} />
            <span>Fast Dispense:</span>
          </span>

          {[
            { id: 'ALL', label: 'All Popular' },
            { id: 'PAIN', label: 'Pain & Fever' },
            { id: 'ANTIBIOTIC', label: 'Antibiotics' },
            { id: 'GI', label: 'Gastric & Stomach' },
            { id: 'SYRUP', label: 'Syrups & Drops' },
            { id: 'OTC', label: 'OTC / Allergies' },
            { id: 'SUPPLEMENT', label: 'Supplements' }
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setChipCategory(cat.id)}
              style={{
                backgroundColor: chipCategory === cat.id ? 'var(--primary)' : 'var(--bg-app)',
                color: chipCategory === cat.id ? '#ffffff' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '0.15rem 0.55rem',
                cursor: 'pointer'
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Chips List */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          {filteredChips.map((chip, idx) => (
            <button
              key={idx}
              onClick={() => handleAddQuickChip(chip)}
              className="btn btn-sm"
              style={{
                backgroundColor: 'var(--primary-light)',
                color: 'var(--primary)',
                border: '1px solid var(--primary-border)',
                borderRadius: '20px',
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '0.2rem 0.65rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer'
              }}
            >
              <span>+</span>
              <span>{chip.name}</span>
              <span style={{ fontSize: '0.65rem', opacity: 0.85 }}>(Rs.{chip.price})</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '0.85rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        
        {/* Notifications */}
        {infoMessage && (
          <div style={{ backgroundColor: 'var(--success-light)', color: 'var(--success-text)', padding: '8px 16px', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid var(--success)' }}>
            <CheckCircle size={16} />
            <span>{infoMessage}</span>
          </div>
        )}

        {addedItemNotice && (
          <div style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)', padding: '6px 14px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid var(--primary-border)' }}>
            <Check size={14} />
            <span>{addedItemNotice}</span>
          </div>
        )}

        {/* 4. METADATA INPUT GRID ROW (DARK THEME ADAPTIVE - CLEAN Dropdown VERTICAL ALIGNMENT) */}
        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Row 1: Invoice No, POS No, Date, Time, Cashier */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1.2fr', gap: '10px', alignItems: 'center' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>Invoice No.</label>
              <input type="text" className="input" value={lastInvoice?.invoiceNumber || 'NMP-2025-000123'} readOnly style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)', fontWeight: 800 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>POS No.</label>
              <input type="text" className="input" value="POS-01" readOnly style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)', fontWeight: 700 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>Date</label>
              <input type="text" className="input" value={new Date().toLocaleDateString('en-GB').replace(/\//g, '-')} readOnly style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>Time</label>
              <input type="text" className="input" value={new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} readOnly style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Cashier</label>
                <button
                  type="button"
                  onClick={() => setShowManageCashiersModal(true)}
                  style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                  title="Add, edit, or delete cashiers"
                >
                  <PlusCircle size={11} />
                  <span>+ Add / Manage</span>
                </button>
              </div>
              <select
                className="input"
                style={{ fontWeight: 700, color: 'var(--primary)', backgroundColor: 'var(--bg-surface)' }}
                value={selectedBillingPersonId}
                onChange={e => setSelectedBillingPersonId(e.target.value)}
              >
                <option value="">{user?.fullName || user?.username || 'Ali Raza'}</option>
                {billingPersons.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Customer, Phone, Customer ID, Address */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1.5fr', gap: '10px', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Customer (Optional)</label>
                <button
                  type="button"
                  onClick={() => setShowManageCustomersModal(true)}
                  style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                  title="Add, edit, or delete walk-in & registered customers"
                >
                  <UserPlus size={11} />
                  <span>+ Add / Manage</span>
                </button>
              </div>
              <select
                className="input"
                style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                value={selectedCustomerId}
                onChange={e => {
                  setSelectedCustomerId(e.target.value);
                  const cust = customers.find(c => String(c.id) === e.target.value);
                  if (cust) {
                    setCustomerPhoneInput(cust.mobile || '');
                    setCustomerIdInput(String(cust.id));
                  } else {
                    setCustomerPhoneInput('');
                    setCustomerIdInput('');
                  }
                }}
              >
                <option value="">👤 WALK-IN CUSTOMER</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>Phone</label>
              <input type="text" className="input" placeholder="Enter phone..." value={customerPhoneInput} onChange={e => setCustomerPhoneInput(e.target.value)} style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>Customer ID</label>
              <input type="text" className="input" placeholder="Enter ID..." value={customerIdInput} onChange={e => setCustomerIdInput(e.target.value)} style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>Address</label>
              <input type="text" className="input" placeholder="Enter address..." value={customerAddressInput} onChange={e => setCustomerAddressInput(e.target.value)} style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }} />
            </div>
          </div>
        </div>

        {/* 5. ACTIVE PRODUCT SELECTION & DISPENSING STEPPER BOX (RESPONSIVE & GUARANTEED NO OVERFLOW) */}
        <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: '12px 16px', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Header row: Product Title & Loose Sale Badge */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', backgroundColor: 'var(--bg-app)', borderRadius: '6px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px' }}>
                <img src="/logo.jpeg" alt="Medicine" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <div>
                <span style={{ fontWeight: 900, fontSize: '0.98rem', color: 'var(--text-primary)' }}>
                  {activeDispenseProduct.brandName}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '10px' }}>
                  Pack Type: <strong style={{ color: 'var(--text-primary)' }}>{activeDispenseProduct.packType}</strong> • Units in Pack: <strong style={{ color: 'var(--text-primary)' }}>{calcUnitsInPack}</strong> • Unit Price: <strong style={{ color: 'var(--primary)' }}>Rs. {calcUnitPrice.toFixed(2)}</strong>
                </span>
              </div>
            </div>
            <div>
              <span style={{ backgroundColor: 'var(--success-light)', color: 'var(--success-text)', fontSize: '0.68rem', padding: '3px 8px', borderRadius: '4px', fontWeight: 800, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                Allow Loose Sale: YES
              </span>
            </div>
          </div>

          {/* Calculator Controls & Add Item Button Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
              <div style={{ minWidth: '85px' }}>
                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>Pack Type</label>
                <select className="input input-sm" value={calcPackType} onChange={e => setCalcPackType(e.target.value)} style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                  <option value="Strip">Strip</option>
                  <option value="Box">Box</option>
                  <option value="Bottle">Bottle</option>
                </select>
              </div>

              <div style={{ width: '75px' }}>
                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>Units/Pack</label>
                <input type="number" className="input input-sm" value={calcUnitsInPack} readOnly style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)', fontWeight: 700, textAlign: 'center' }} />
              </div>

              <div style={{ width: '95px' }}>
                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px', textAlign: 'center' }}>Full Packs</label>
                <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden', backgroundColor: 'var(--bg-surface)', height: '32px', alignItems: 'center' }}>
                  <button type="button" onClick={() => setCalcFullPacks(Math.max(0, calcFullPacks - 1))} style={{ border: 'none', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '0 8px', fontWeight: 800, cursor: 'pointer', height: '100%' }}>-</button>
                  <span style={{ flex: 1, textAlign: 'center', fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)' }}>{calcFullPacks}</span>
                  <button type="button" onClick={() => setCalcFullPacks(calcFullPacks + 1)} style={{ border: 'none', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '0 8px', fontWeight: 800, cursor: 'pointer', height: '100%' }}>+</button>
                </div>
              </div>

              <div style={{ width: '95px' }}>
                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px', textAlign: 'center' }}>Loose Units</label>
                <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden', backgroundColor: 'var(--bg-surface)', height: '32px', alignItems: 'center' }}>
                  <button type="button" onClick={() => setCalcLooseUnits(Math.max(0, calcLooseUnits - 1))} style={{ border: 'none', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '0 8px', fontWeight: 800, cursor: 'pointer', height: '100%' }}>-</button>
                  <span style={{ flex: 1, textAlign: 'center', fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)' }}>{calcLooseUnits}</span>
                  <button type="button" onClick={() => setCalcLooseUnits(calcLooseUnits + 1)} style={{ border: 'none', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '0 8px', fontWeight: 800, cursor: 'pointer', height: '100%' }}>+</button>
                </div>
              </div>

              <div style={{ width: '85px' }}>
                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '2px', textAlign: 'center' }}>Units Taken</label>
                <div style={{ backgroundColor: 'var(--primary-light)', border: '1px solid var(--primary-border)', color: 'var(--primary)', textAlign: 'center', fontWeight: 900, fontSize: '0.92rem', height: '32px', lineHeight: '30px', borderRadius: '4px' }}>
                  {unitsTakenComputed}
                </div>
              </div>

              <div style={{ width: '95px' }}>
                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>Unit Price (Rs.)</label>
                <input type="number" className="input input-sm" value={calcUnitPrice} onChange={e => setCalcUnitPrice(Number(e.target.value))} style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 700 }} />
              </div>

              <div style={{ width: '105px' }}>
                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--success-text)', marginBottom: '2px', textAlign: 'center' }}>TOTAL (Rs.)</label>
                <div style={{ backgroundColor: 'var(--success-light)', border: '1px solid var(--success)', color: 'var(--success-text)', textAlign: 'center', fontWeight: 900, fontSize: '0.95rem', height: '32px', lineHeight: '30px', borderRadius: '4px' }}>
                  {totalComputed.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Right Add Item Button */}
            <div style={{ minWidth: '130px' }}>
              <button
                type="button"
                onClick={handleAddActiveCalculatedItem}
                className="btn"
                style={{ backgroundColor: 'var(--primary)', color: '#ffffff', fontWeight: 800, height: '36px', width: '100%', padding: '0 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer', borderRadius: '6px', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
              >
                <ShoppingCart size={16} />
                <span>Add Item</span>
              </button>
            </div>
          </div>
        </div>

        {/* 6. CART ITEM TABLE WITH FAST STEPPERS & MULTI-MED CONTROLS */}
        <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface-elevated)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '8px 6px', textAlign: 'center', width: '35px' }}>S.#</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>Item Description</th>
                <th style={{ padding: '8px 6px', textAlign: 'center', width: '90px' }}>Pack Type</th>
                <th style={{ padding: '8px 6px', textAlign: 'center', width: '85px' }}>Pack Taken</th>
                <th style={{ padding: '8px 6px', textAlign: 'center', width: '85px' }}>Unit of Pack</th>
                <th style={{ padding: '8px 6px', textAlign: 'center', width: '140px' }}>Units Taken (Qty)</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', width: '95px' }}>Unit Price</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', width: '105px' }}>Total</th>
                <th style={{ padding: '8px 6px', textAlign: 'center', width: '80px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cart.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Cart is empty. Click fast medicine chips above or search products to add multiple items to the bill.
                  </td>
                </tr>
              ) : (
                cart.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border)', backgroundColor: idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-app)' }}>
                    <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 600 }}>{idx + 1}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 800, color: 'var(--text-primary)' }}>{item.brandName}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>{item.packType || 'Strip'}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>{item.packTaken !== undefined ? item.packTaken : 1}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>{item.unitOfPack || 10}</td>
                    
                    {/* Units Taken Direct Keyboard Input & Stepper Controls */}
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden', backgroundColor: 'var(--bg-surface)' }}>
                        <button
                          type="button"
                          onClick={() => handleUpdateCartItemQty(idx, -1)}
                          style={{ border: 'none', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '2px 6px', cursor: 'pointer', fontWeight: 900 }}
                        >
                          <Minus size={12} />
                        </button>
                        
                        <input
                          type="number"
                          value={item.unitsTaken || item.quantity}
                          onChange={e => handleSetCartItemQty(idx, parseInt(e.target.value, 10))}
                          style={{
                            width: '45px',
                            border: 'none',
                            textAlign: 'center',
                            fontWeight: 900,
                            fontSize: '0.85rem',
                            color: 'var(--text-primary)',
                            backgroundColor: 'transparent',
                            outline: 'none'
                          }}
                        />

                        <button
                          type="button"
                          onClick={() => handleUpdateCartItemQty(idx, 1)}
                          style={{ border: 'none', background: 'var(--bg-app)', color: 'var(--text-primary)', padding: '2px 6px', cursor: 'pointer', fontWeight: 900 }}
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </td>

                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{item.unitPrice.toFixed(2)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)' }}>{item.lineTotal.toFixed(2)}</td>
                    
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => handleUpdateCartItemQty(idx, 1)}
                          style={{ border: '1px solid var(--primary-border)', background: 'var(--primary-light)', color: 'var(--primary)', cursor: 'pointer', padding: '2px 5px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 800 }}
                          title="Add 1 Unit"
                        >
                          +1
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '2px' }}
                          title="Remove Item"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 7. PAYMENT METHOD & SUMMARY TOTALS FOOTER */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px 320px', gap: '14px', alignItems: 'flex-start' }}>
          
          {/* Payment Method Radios Left */}
          <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: '10px 14px' }}>
            <div style={{ fontWeight: 800, fontSize: '0.78rem', color: 'var(--text-primary)', marginBottom: '8px' }}>Payment Method</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', fontSize: '0.74rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: paymentMethod === 'CASH' ? 800 : 500 }}>
                <input type="radio" name="payMode" checked={paymentMethod === 'CASH'} onChange={() => setPaymentMethod('CASH')} />
                <span>Cash</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: paymentMethod === 'CARD' ? 800 : 500 }}>
                <input type="radio" name="payMode" checked={paymentMethod === 'CARD'} onChange={() => setPaymentMethod('CARD')} />
                <span>Card</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: paymentMethod === 'CREDIT' ? 800 : 500 }}>
                <input type="radio" name="payMode" checked={paymentMethod === 'CREDIT'} onChange={() => setPaymentMethod('CREDIT')} />
                <span>Credit / Udhaar</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: paymentMethod === 'BANK_TRANSFER' ? 800 : 500 }}>
                <input type="radio" name="payMode" checked={paymentMethod === 'BANK_TRANSFER'} onChange={() => setPaymentMethod('BANK_TRANSFER')} />
                <span>Bank Transfer</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: paymentMethod === 'JAZZCASH' ? 800 : 500 }}>
                <input type="radio" name="payMode" checked={paymentMethod === 'JAZZCASH'} onChange={() => setPaymentMethod('JAZZCASH')} />
                <span>JazzCash</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: paymentMethod === 'EASYPAISA' ? 800 : 500 }}>
                <input type="radio" name="payMode" checked={paymentMethod === 'EASYPAISA'} onChange={() => setPaymentMethod('EASYPAISA')} />
                <span>EasyPaisa</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: paymentMethod === 'OTHER' ? 800 : 500 }}>
                <input type="radio" name="payMode" checked={paymentMethod === 'OTHER'} onChange={() => setPaymentMethod('OTHER')} />
                <span>Other</span>
              </label>
            </div>
          </div>

          {/* Sub Total, Sales Tax, Grand Total Box */}
          <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', overflow: 'hidden', fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Sub Total (Rs.)</span>
              <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{subtotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 14px', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Sales Tax (Rs.)</span>
              <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>0.00</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', backgroundColor: 'var(--success-light)', color: 'var(--success-text)', fontWeight: 900, fontSize: '1rem' }}>
              <span>Grand Total (Rs.)</span>
              <span>{grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Bottom Right Action Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setShowFullCashMemoModal(true)}
              className="btn"
              style={{ backgroundColor: '#0d9488', color: '#ffffff', fontWeight: 800, fontSize: '0.82rem', padding: '0.55rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', borderRadius: '4px', cursor: 'pointer' }}
            >
              <Eye size={16} />
              <span>Preview</span>
            </button>

            <button
              type="button"
              onClick={() => handleCheckout()}
              disabled={directPrinting}
              className="btn"
              style={{ backgroundColor: 'var(--primary)', color: '#ffffff', fontWeight: 800, fontSize: '0.82rem', padding: '0.55rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', borderRadius: '4px', cursor: 'pointer' }}
            >
              <Printer size={16} />
              <span>{directPrinting ? 'Printing...' : 'Print'}</span>
            </button>

            <button
              type="button"
              onClick={() => { setShowFullCashMemoModal(true); setTimeout(() => window.print(), 200); }}
              className="btn"
              style={{ backgroundColor: '#dc2626', color: '#ffffff', fontWeight: 800, fontSize: '0.82rem', padding: '0.55rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', borderRadius: '4px', cursor: 'pointer' }}
            >
              <FileText size={16} />
              <span>Save PDF</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const text = `*NAVEED MEDICAL PHARMACY (NMP)*%0AInvoice: %23${lastInvoice?.invoiceNumber || 'NMP-2025-000123'}%0ATotal Amount: Rs. ${grandTotal.toFixed(2)}%0AThank you for choosing NMP!`;
                window.open(`https://wa.me/?text=${text}`, '_blank');
              }}
              className="btn"
              style={{ backgroundColor: '#16a34a', color: '#ffffff', fontWeight: 800, fontSize: '0.82rem', padding: '0.55rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', borderRadius: '4px', cursor: 'pointer' }}
            >
              <MessageCircle size={16} />
              <span>WhatsApp / Share</span>
            </button>
          </div>
        </div>

      </div>

      {/* MODAL 1: HELD BILLS MODAL */}
      {showHeldModal && (
        <div className="modal-overlay" onClick={() => setShowHeldModal(false)}>
          <div className="modal-content" style={{ maxWidth: '520px', padding: '1.25rem' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary)' }}>
                Held / Parked Sales ({heldBills.length})
              </span>
              <button onClick={() => setShowHeldModal(false)} className="btn btn-secondary btn-sm"><X size={16} /></button>
            </div>
            {heldBills.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No held bills found.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '350px', overflowY: 'auto' }}>
                {heldBills.map((h, i) => (
                  <div key={i} style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{h.customer_name || 'Walk-in Patient'}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{new Date(h.created_at || Date.now()).toLocaleString()}</div>
                    </div>
                    <button onClick={() => handleResumeBill(h)} className="btn btn-primary btn-sm" style={{ fontSize: '0.78rem' }}>Restore to Cart</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: RETURN & REFUND MODAL */}
      {showReturnModal && (
        <div className="modal-overlay" onClick={() => setShowReturnModal(false)}>
          <div className="modal-content" style={{ maxWidth: '480px', padding: '1.25rem' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <RotateCcw size={18} />
                Sales Return & Refund Counter
              </span>
              <button onClick={() => setShowReturnModal(false)} className="btn btn-secondary btn-sm"><X size={16} /></button>
            </div>

            {returnStatusMsg && (
              <div style={{ backgroundColor: 'var(--success-light)', color: 'var(--success-text)', padding: '6px 12px', borderRadius: '4px', marginBottom: '0.75rem', fontSize: '0.8rem', fontWeight: 700 }}>
                {returnStatusMsg}
              </div>
            )}

            <form onSubmit={(e) => { e.preventDefault(); setReturnStatusMsg(`Return request recorded for Invoice #${returnInvoiceNo || 'NMP-2025-000123'}. Stock restored.`); }} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px', color: 'var(--text-primary)' }}>Original Invoice Number</label>
                <input type="text" className="input" placeholder="e.g. NMP-2025-000123" value={returnInvoiceNo} onChange={e => setReturnInvoiceNo(e.target.value)} required autoFocus />
              </div>
              <button type="submit" className="btn btn-primary" style={{ fontWeight: 800 }}>Lookup & Return Items</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: PRESCRIPTION QUICK SETS MODAL */}
      {showPrescriptionModal && (
        <div className="modal-overlay" onClick={() => setShowPrescriptionModal(false)}>
          <div className="modal-content" style={{ maxWidth: '500px', padding: '1.25rem' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <BookOpen size={18} />
                Rx Prescription Templates & Multi-Med Sets
              </span>
              <button onClick={() => setShowPrescriptionModal(false)} className="btn btn-secondary btn-sm"><X size={16} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {[
                { title: 'Diabetes Routine Rx Set', items: ['Panadol 500mg', 'Augmentin 625mg', 'Rigix 10mg'] },
                { title: 'Post-op Antibiotic Rx Set', items: ['Augmentin 625mg', 'Flagyl 400mg', 'Brufen 400mg'] },
                { title: 'Flu & Fever Rx Pack', items: ['Panadol 500mg', 'Arinac Forte', 'Disprin 300mg'] }
              ].map((set, i) => (
                <div key={i} style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface)' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{set.title}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{set.items.join(', ')}</div>
                  </div>
                  <button
                    onClick={() => {
                      set.items.forEach(name => handleAddQuickChip({ name, price: 15.00, packType: 'Strip', unitOfPack: 10 }));
                      setShowPrescriptionModal(false);
                    }}
                    className="btn btn-primary btn-sm"
                  >
                    Add Full Set
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: UDHAAR CUSTOMER CREDIT MODAL */}
      <NewUdhaarModal
        isOpen={showUdhaarModal}
        onClose={() => setShowUdhaarModal(false)}
        onSuccess={() => {
          setShowUdhaarModal(false);
          setInfoMessage('Udhaar credit record saved.');
        }}
      />

      {/* MODAL 5: STOCK & FEFO BATCH LOOKUP MODAL */}
      {showStockModal && (
        <div className="modal-overlay" onClick={() => setShowStockModal(false)}>
          <div className="modal-content" style={{ maxWidth: '640px', padding: '1.25rem' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Package size={18} />
                Live Stock & FEFO Batch Inventory Lookup
              </span>
              <button onClick={() => setShowStockModal(false)} className="btn btn-secondary btn-sm"><X size={16} /></button>
            </div>

            <div style={{ marginBottom: '1rem', position: 'relative' }}>
              <input
                className="input"
                placeholder="Search inventory brand, generic or rack..."
                value={stockSearchQuery}
                onChange={async (e) => {
                  setStockSearchQuery(e.target.value);
                  if (e.target.value.trim()) {
                    const res = await fetch(`/api/pos/search?q=${encodeURIComponent(e.target.value.trim())}`, {
                      headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) {
                      const data = await res.json();
                      setStockResults(data.results || []);
                    }
                  } else {
                    setStockResults([]);
                  }
                }}
              />
            </div>

            <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
              {stockResults.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem 0', fontSize: '0.85rem' }}>
                  Type to search live batch stock, rack locations, and expiry dates.
                </div>
              ) : (
                <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '6px' }}>Medicine</th>
                      <th style={{ padding: '6px' }}>Rack</th>
                      <th style={{ padding: '6px' }}>Stock Left</th>
                      <th style={{ padding: '6px' }}>Expiry</th>
                      <th style={{ padding: '6px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockResults.map((p, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px', fontWeight: 800, color: 'var(--text-primary)' }}>{p.brand_name}</td>
                        <td style={{ padding: '6px', color: 'var(--text-secondary)' }}>{p.rack_location || 'Rack-A'}</td>
                        <td style={{ padding: '6px', color: 'var(--success)', fontWeight: 800 }}>{p.total_stock} units</td>
                        <td style={{ padding: '6px', color: 'var(--text-secondary)' }}>{p.fefo_batch?.expiry_date || '2026-12-31'}</td>
                        <td style={{ padding: '6px', textAlign: 'center' }}>
                          <button
                            onClick={() => {
                              handleMultiAddFromSearch(p);
                              setShowStockModal(false);
                            }}
                            className="btn btn-primary btn-sm"
                            style={{ fontSize: '0.72rem', padding: '2px 6px' }}
                          >
                            + Add to Bill
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full NMP Professional Cash Memo Modal */}
      <CashMemoModal
        isOpen={showFullCashMemoModal}
        onClose={() => setShowFullCashMemoModal(false)}
        invoiceData={getCashMemoInvoiceData()}
        settings={settings}
        token={token}
      />

      {/* Cash Out Modal */}
      <CashOutModal
        isOpen={showCashOutModal}
        onClose={() => setShowCashOutModal(false)}
        onSuccess={() => {
          setInfoMessage('Cash Out transaction recorded successfully!');
        }}
      />

      {/* MODAL 6: MANAGE CASHIERS / BILLING PERSONS MODAL */}
      {showManageCashiersModal && (
        <div className="modal-overlay" onClick={() => setShowManageCashiersModal(false)}>
          <div className="modal-content" style={{ maxWidth: '540px', padding: '1.25rem' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <User size={18} />
                Manage Cashiers & Billing Persons
              </span>
              <button onClick={() => setShowManageCashiersModal(false)} className="btn btn-secondary btn-sm"><X size={16} /></button>
            </div>

            {/* Add New Cashier Form */}
            <form onSubmit={handleAddCashier} style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
              <input
                type="text"
                className="input"
                placeholder="Enter new cashier name (e.g. Usman, Muhammad Ahmed)..."
                value={newCashierNameInput}
                onChange={e => setNewCashierNameInput(e.target.value)}
                style={{ flex: 1, fontSize: '0.82rem' }}
                required
              />
              <button type="submit" className="btn btn-primary btn-sm" style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                + Add Cashier
              </button>
            </form>

            {/* List of Cashiers */}
            <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '6px' }}>Cashier Name</th>
                    <th style={{ padding: '6px', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '6px', textAlign: 'center', width: '140px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {billingPersons.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px' }}>
                        {editingCashierId === p.id ? (
                          <input
                            type="text"
                            className="input input-sm"
                            value={editingCashierName}
                            onChange={e => setEditingCashierName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleUpdateCashier(p.id); }}
                            autoFocus
                          />
                        ) : (
                          <strong style={{ color: 'var(--text-primary)' }}>{p.name}</strong>
                        )}
                      </td>
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 800, backgroundColor: p.is_active ? 'var(--success-light)' : 'var(--danger-light)', color: p.is_active ? 'var(--success-text)' : 'var(--danger-text)' }}>
                          {p.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => { setSelectedBillingPersonId(String(p.id)); setShowManageCashiersModal(false); }}
                            className="btn btn-sm"
                            style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)', fontSize: '0.7rem', padding: '2px 6px', border: '1px solid var(--primary-border)' }}
                            title="Select this cashier"
                          >
                            Select
                          </button>
                          {editingCashierId === p.id ? (
                            <button
                              type="button"
                              onClick={() => handleUpdateCashier(p.id)}
                              className="btn btn-sm btn-primary"
                              style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                            >
                              Save
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { setEditingCashierId(p.id); setEditingCashierName(p.name); }}
                              style={{ border: 'none', background: 'none', color: 'var(--primary)', cursor: 'pointer', padding: '2px' }}
                              title="Edit Name"
                            >
                              <Edit2 size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteCashier(p.id)}
                            style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '2px' }}
                            title="Delete / Deactivate Cashier"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: MANAGE CUSTOMERS MODAL */}
      {showManageCustomersModal && (
        <div className="modal-overlay" onClick={() => setShowManageCustomersModal(false)}>
          <div className="modal-content" style={{ maxWidth: '620px', padding: '1.25rem' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <UserPlus size={18} />
                Manage Walk-in & Registered Customers
              </span>
              <button onClick={() => setShowManageCustomersModal(false)} className="btn btn-secondary btn-sm"><X size={16} /></button>
            </div>

            {/* Add New Customer Form */}
            <form onSubmit={handleAddCustomerModal} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.2fr auto', gap: '8px', marginBottom: '1rem' }}>
              <input
                type="text"
                className="input"
                placeholder="Customer Name..."
                value={newCustNameModal}
                onChange={e => setNewCustNameModal(e.target.value)}
                style={{ fontSize: '0.82rem' }}
                required
              />
              <input
                type="text"
                className="input"
                placeholder="Phone / Mobile..."
                value={newCustPhoneModal}
                onChange={e => setNewCustPhoneModal(e.target.value)}
                style={{ fontSize: '0.82rem' }}
              />
              <input
                type="text"
                className="input"
                placeholder="Address..."
                value={newCustAddressModal}
                onChange={e => setNewCustAddressModal(e.target.value)}
                style={{ fontSize: '0.82rem' }}
              />
              <button type="submit" className="btn btn-primary btn-sm" style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                + Register
              </button>
            </form>

            {/* List of Customers */}
            <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '6px' }}>Customer</th>
                    <th style={{ padding: '6px' }}>Phone</th>
                    <th style={{ padding: '6px', textAlign: 'right' }}>Balance Due</th>
                    <th style={{ padding: '6px', textAlign: 'center', width: '140px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px' }}>
                        {editingCustId === c.id ? (
                          <input
                            type="text"
                            className="input input-sm"
                            value={editingCustName}
                            onChange={e => setEditingCustName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleUpdateCustomerModal(c.id); }}
                            autoFocus
                          />
                        ) : (
                          <strong style={{ color: 'var(--text-primary)' }}>{c.name}</strong>
                        )}
                      </td>
                      <td style={{ padding: '6px' }}>
                        {editingCustId === c.id ? (
                          <input
                            type="text"
                            className="input input-sm"
                            value={editingCustPhone}
                            onChange={e => setEditingCustPhone(e.target.value)}
                          />
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>{c.mobile || '-'}</span>
                        )}
                      </td>
                      <td style={{ padding: '6px', textAlign: 'right', fontWeight: 800, color: Number(c.current_balance) > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                        Rs. {Number(c.current_balance).toFixed(2)}
                      </td>
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCustomerId(String(c.id));
                              setCustomerPhoneInput(c.mobile || '');
                              setCustomerIdInput(String(c.id));
                              setShowManageCustomersModal(false);
                            }}
                            className="btn btn-sm"
                            style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)', fontSize: '0.7rem', padding: '2px 6px', border: '1px solid var(--primary-border)' }}
                            title="Select this customer"
                          >
                            Select
                          </button>
                          {editingCustId === c.id ? (
                            <button
                              type="button"
                              onClick={() => handleUpdateCustomerModal(c.id)}
                              className="btn btn-sm btn-primary"
                              style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                            >
                              Save
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { setEditingCustId(c.id); setEditingCustName(c.name); setEditingCustPhone(c.mobile || ''); }}
                              style={{ border: 'none', background: 'none', color: 'var(--primary)', cursor: 'pointer', padding: '2px' }}
                              title="Edit Customer"
                            >
                              <Edit2 size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomerModal(c.id)}
                            style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '2px' }}
                            title="Delete / Deactivate Customer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

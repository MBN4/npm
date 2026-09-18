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
  QrCode
} from 'lucide-react';
import { saveOfflineSale } from '../services/offlineSync.js';
import { printThermalElement } from '../utils/thermalPrinter.js';
import { CustomerSelect } from '../components/CustomerSelect.js';
import { getProductPackaging } from '../utils/productPackaging.js';

export interface CartItem {
  medicineId: number;
  brandName: string;
  strength?: string;
  dosageForm?: string;
  packSize?: number;
  tabletsPerPack?: number;
  stockUnit?: string;
  packagingType?: 'MULTI_TIER' | 'SIMPLE';
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const paidInputRef = useRef<HTMLInputElement>(null);

  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customers, setCustomers] = useState<{ id: number; name: string; mobile?: string; current_balance: number }[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customSlipName, setCustomSlipName] = useState<string>('');
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

  const [lastInvoice, setLastInvoice] = useState<any>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
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
    const currentPrintFee = 2.00;
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
            discount: it.discount
          })),
          subtotal: currentSubtotal,
          discount: disc,
          tax: currentPrintFee,
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
          cashierName: user?.fullName || 'Cashier',
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
    printThermalElement('nmp-printable-receipt', (settings['printer_paper_width'] as any) || '80mm');
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
          const map: Record<string, string> = {};
          (sData.settings || []).forEach((s: any) => { map[s.key] = s.value; });
          setSettings(map);
        }
      } catch (err) {
        console.error(err);
      }
    }

    loadInitialData();
    fetchHeldBills();
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
    const packaging = getProductPackaging(product.dosage_form, product.stock_unit);
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

    const existingIndex = cart.findIndex(it => it.batchId === batch.batch_id);
    if (existingIndex > -1) {
      const updated = [...cart];
      if (updated[existingIndex].quantity + looseUnitsToAdd > batch.quantity) {
        setErrorMessage(`Cannot exceed available stock (${batch.quantity} ${packaging.unitPlural.toLowerCase()}).`);
        return;
      }
      updated[existingIndex].quantity += looseUnitsToAdd;
      updated[existingIndex].lineTotal = (updated[existingIndex].quantity * updated[existingIndex].unitPrice) - updated[existingIndex].discount;
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
        batchId: batch.batch_id,
        batchNumber: batch.batch_number,
        expiryDate: batch.expiry_date,
        daysToExpiry: batch.days_to_expiry,
        unitPrice: Number(batch.sale_price),
        availableStock: batch.quantity,
        quantity: looseUnitsToAdd,
        discount: 0,
        lineTotal: looseUnitsToAdd * Number(batch.sale_price),
        availableBatches: product.available_batches
      };
      setCart([newItem, ...cart]);
    }

    setQuery('');
    setSearchResults([]);
    searchInputRef.current?.focus();
  };

  const handleUpdateQty = (index: number, newQty: number) => {
    setErrorMessage(null);
    if (newQty <= 0) {
      handleRemoveItem(index);
      return;
    }

    const item = cart[index];
    if (newQty > item.availableStock) {
      const packaging = getProductPackaging(item.dosageForm, item.stockUnit);
      setErrorMessage(`Cannot exceed available stock (${item.availableStock} ${packaging.unitPlural.toLowerCase()}).`);
      return;
    }

    const updated = [...cart];
    updated[index].quantity = newQty;
    updated[index].lineTotal = (newQty * updated[index].unitPrice) - updated[index].discount;
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

  const printFee = cart.length > 0 ? 2.00 : 0.00;
  const subtotal = cart.reduce((acc, it) => acc + it.lineTotal, 0);
  const rawDiscount = Number(billDiscount) || 0;
  const discountVal = discountType === 'PERCENT' ? (subtotal * rawDiscount) / 100 : rawDiscount;
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
          notes: ''
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Server rejected checkout');
      }

      const data = await res.json();
      const invoiceData = {
        ...data.invoice,
        tax: printFee,
        customer: customers.find(c => String(c.id) === selectedCustomerId),
        customSlipName: customSlipName.trim(),
        cashierName: user?.fullName || 'Cashier',
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
            lineTotal: it.lineTotal
          })),
          subtotal,
          discount: discountVal,
          tax: printFee,
          totalAmount: grandTotal,
          paidAmount: numericPaid,
          paymentMethod,
          notes: ''
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
          cashierName: user?.fullName || 'Cashier',
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

  const formatPackagingBreakdown = (quantity: number, packSize: number = 100, tabletsPerPack: number = 10, dosageForm?: string, stockUnit?: string) => {
    const packaging = getProductPackaging(dosageForm, stockUnit);
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
                    if (searchResults.length > 0) {
                      handleAddToCart(searchResults[0]);
                    } else if (query.trim()) {
                      try {
                        const res = await fetch(`/api/pos/search?q=${encodeURIComponent(query.trim())}`, {
                          headers: { Authorization: `Bearer ${token}` }
                        });
                        if (res.ok) {
                          const data = await res.json();
                          if (data.results && data.results.length > 0) {
                            handleAddToCart(data.results[0]);
                          }
                        }
                      } catch (err) {
                        console.error(err);
                      }
                    }
                  }
                }}
                autoFocus
                style={{ paddingLeft: '2.5rem', fontSize: '0.95rem', height: '44px' }}
              />
              <Search size={18} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
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
                  const packaging = getProductPackaging(p.dosage_form, p.stock_unit);
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
                <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.5rem' }}>Medicine & Packaging</th>
                      <th style={{ padding: '0.5rem' }}>Batch / Expiry</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Price Rate</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center' }}>Dispensed Qty</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Subtotal</th>
                      <th style={{ padding: '0.5rem', width: '30px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item, index) => {
                      const pSize = Number(item.packSize) > 0 ? Number(item.packSize) : 100;
                      const tPack = Number(item.tabletsPerPack) > 0 ? Number(item.tabletsPerPack) : 10;
                      const itemPackaging = getProductPackaging(item.dosageForm, item.stockUnit);
                      const itemIsMultiTier = (item.packagingType || itemPackaging.packagingType) === 'MULTI_TIER';
                      const packagingText = formatPackagingBreakdown(item.quantity, pSize, tPack, item.dosageForm, item.stockUnit);

                      return (
                        <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.6rem 0.5rem' }}>
                            <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>{item.brandName}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                              <span>{item.strength} • {item.dosageForm}</span>
                              <span style={{ fontSize: '0.68rem', padding: '0.05rem 0.35rem', borderRadius: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                                {itemPackaging.outer}: {pSize} {itemPackaging.unitPlural}{itemIsMultiTier ? ` (${tPack} per ${itemPackaging.middle.toLowerCase()})` : ''}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.25rem' }}>
                              Dispensing: {packagingText} ({item.quantity} {itemPackaging.unitPlural.toLowerCase()})
                            </div>
                          </td>
                          <td style={{ padding: '0.6rem 0.5rem' }}>
                            <select
                              className="input input-sm"
                              value={item.batchId}
                              onChange={(e) => handleSwitchBatch(index, Number(e.target.value))}
                              style={{ fontSize: '0.72rem', padding: '0.2rem 0.4rem', height: '28px' }}
                            >
                              {item.availableBatches?.map(b => (
                                <option key={b.batch_id} value={b.batch_id}>
                                  #{b.batch_number} (Exp: {b.expiry_date}) - {b.quantity} left
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>
                            <div style={{ fontWeight: 700 }}>Rs. {item.unitPrice.toFixed(2)} / {itemPackaging.unit.toLowerCase()}</div>
                            {itemIsMultiTier && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              Rs. {(item.unitPrice * tPack).toFixed(2)} / {itemPackaging.middle.toLowerCase()}
                            </div>}
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              Rs. {(item.unitPrice * pSize).toFixed(2)} / {itemPackaging.outer.toLowerCase()}
                            </div>
                          </td>
                          <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQty(index, item.quantity - 1)}
                                  style={{ border: 'none', background: 'var(--bg-surface)', padding: '0.2rem 0.5rem', cursor: 'pointer', fontWeight: 800 }}
                                  title={`Decrease 1 ${itemPackaging.unit.toLowerCase()}`}
                                >
                                  -
                                </button>
                                <span style={{ padding: '0.2rem 0.6rem', fontWeight: 800, fontSize: '0.88rem', minWidth: '36px', textAlign: 'center' }}>
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQty(index, item.quantity + 1)}
                                  style={{ border: 'none', background: 'var(--bg-surface)', padding: '0.2rem 0.5rem', cursor: 'pointer', fontWeight: 800 }}
                                  title={`Increase 1 ${itemPackaging.unit.toLowerCase()}`}
                                >
                                  +
                                </button>
                              </div>

                              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQty(index, item.quantity + 1)}
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: '0.65rem', padding: '0.15rem 0.35rem', whiteSpace: 'nowrap' }}
                                  title={`Add 1 ${itemPackaging.unit.toLowerCase()}`}
                                >
                                  +1 {itemPackaging.unit}
                                </button>
                                {itemIsMultiTier && <button
                                  type="button"
                                  onClick={() => handleUpdateQty(index, item.quantity + tPack)}
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: '0.65rem', padding: '0.15rem 0.35rem', whiteSpace: 'nowrap', color: 'var(--primary)' }}
                                  title={`Add 1 ${itemPackaging.middle.toLowerCase()} (${tPack} ${itemPackaging.unitPlural.toLowerCase()})`}
                                >
                                  +1 {itemPackaging.middle}
                                </button>
                                }
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQty(index, item.quantity + pSize)}
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: '0.65rem', padding: '0.15rem 0.35rem', whiteSpace: 'nowrap' }}
                                  title={`Add 1 ${itemPackaging.outer.toLowerCase()} (${pSize} ${itemPackaging.unitPlural.toLowerCase()})`}
                                >
                                  +1 {itemPackaging.outer}
                                </button>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 800, fontSize: '0.9rem' }}>
                            Rs. {item.lineTotal.toFixed(2)}
                          </td>
                          <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(index)}
                              style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                            >
                              <X size={15} />
                            </button>
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
                        headers: { 'Content-Type': 'application/json' },
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
              />
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
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>POS Receipt Fee:</span>
                <span>Rs. {printFee.toFixed(2)}</span>
              </div>
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
                padding: '1.25rem',
                fontFamily: "'JetBrains Mono', 'Courier New', Courier, monospace",
                fontSize: '0.78rem',
                lineHeight: 1.35,
                background: '#ffffff',
                color: '#000000',
                margin: '0 auto'
              }}
            >
              <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
                <img
                  src="/logo.jpeg"
                  alt="Pharmacy Logo"
                  style={{ width: '46px', height: '46px', margin: '0 auto 0.35rem', display: 'block', objectFit: 'contain', borderRadius: '50%' }}
                />
                <div style={{ fontSize: '1.05rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {settings['pharmacy_name'] || 'NAVEED MEDICAL PHARMACY (NMP)'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#333' }}>
                  {settings['pharmacy_address'] || '31 32 Chowk Chohan Road Outfall, Islampura, Lahore'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#333' }}>
                  Ph: {settings['pharmacy_phone'] || '03454142863'}
                  {settings['license_number'] ? ` | DSL: ${settings['license_number']}` : ''}
                </div>
                <div style={{ fontSize: '0.75rem', marginTop: '0.2rem', letterSpacing: '-1px' }}>
                  ------------------------------------------
                </div>
              </div>

              <div style={{ fontSize: '0.75rem', marginBottom: '0.4rem', lineHeight: 1.4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Invoice #: <strong>{lastInvoice.invoiceNumber}</strong></span>
                  <span>POS No.: 01</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Cashier: {lastInvoice.cashierName}</span>
                  <span>{new Date(lastInvoice.createdAt).toLocaleDateString()} {new Date(lastInvoice.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Mode of Payment: {lastInvoice.paymentMethod || paymentMethod}</span>
                </div>
                <div style={{ borderTop: '1px dotted #ccc', marginTop: '0.2rem', paddingTop: '0.2rem' }}>
                  Customer: <strong>{lastInvoice.customSlipName ? lastInvoice.customSlipName : (lastInvoice.customer ? `${lastInvoice.customer.name} (${lastInvoice.customer.mobile || ''})` : 'CASH SALES-WALKING CUSTOMER A/C')}</strong>
                </div>
              </div>

              <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '0.35rem 0', marginBottom: '0.5rem' }}>
                <table style={{ width: '100%', fontSize: '0.72rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #000' }}>
                      <th style={{ textAlign: 'left', background: 'transparent', padding: '0.15rem 0' }}># Item Description</th>
                      <th style={{ textAlign: 'center', background: 'transparent', padding: '0.15rem 0' }}>Qty / Pack</th>
                      <th style={{ textAlign: 'right', background: 'transparent', padding: '0.15rem 0' }}>Rate</th>
                      <th style={{ textAlign: 'right', background: 'transparent', padding: '0.15rem 0' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastInvoice.items.map((it: any, i: number) => {
                      const packSize = Number(it.packSize) || 100;
                      const tabletsPerPack = Number(it.tabletsPerPack) || 10;
                      const breakdown = formatPackagingBreakdown(it.quantity || 1, packSize, tabletsPerPack, it.dosageForm, it.stockUnit);

                      return (
                        <tr key={i} style={{ borderBottom: i < lastInvoice.items.length - 1 ? '1px dotted #e0e0e0' : 'none' }}>
                          <td style={{ padding: '0.3rem 0', verticalAlign: 'top' }}>
                            <div style={{ fontWeight: 800 }}>
                              {i + 1}. {it.brandName}
                            </div>
                            <div style={{ fontSize: '0.65rem', color: '#555' }}>
                              [{breakdown}]
                            </div>
                          </td>
                          <td style={{ textAlign: 'center', padding: '0.3rem 0', verticalAlign: 'top', fontWeight: 700 }}>
                            {it.quantity}
                          </td>
                          <td style={{ textAlign: 'right', padding: '0.3rem 0', verticalAlign: 'top' }}>
                            {(it.unitPrice || (it.lineTotal / (it.quantity || 1)))?.toFixed(2)}
                          </td>
                          <td style={{ textAlign: 'right', padding: '0.3rem 0', verticalAlign: 'top', fontWeight: 800 }}>
                            {it.lineTotal.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#555', fontSize: '0.7rem' }}>
                  <span>Total Units: {lastInvoice.items.reduce((sum: number, it: any) => sum + (it.quantity || 0), 0)}</span>
                  <span>Items Count: {lastInvoice.items.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#555', fontSize: '0.7rem' }}>
                  <span>Gross Subtotal:</span>
                  <span>Rs. {lastInvoice.subtotal.toFixed(2)}</span>
                </div>
                {lastInvoice.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#000' }}>
                    <span>Special Discount:</span>
                    <span>-Rs. {lastInvoice.discount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#555', fontSize: '0.7rem' }}>
                  <span>POS Receipt Fee:</span>
                  <span>Rs. {(lastInvoice.tax || 2.00).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '0.95rem', borderTop: '1px solid #000', paddingTop: '0.25rem', marginTop: '0.1rem' }}>
                  <span>Net Payable:</span>
                  <span>Rs. {lastInvoice.totalAmount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Cash Tendered:</span>
                  <span>Rs. {lastInvoice.paidAmount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>Change Return:</span>
                  <span>Rs. {(lastInvoice.changeAmount || 0).toFixed(2)}</span>
                </div>
                {lastInvoice.totalAmount > lastInvoice.paidAmount && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#b91c1c' }}>
                    <span>Balance Due (Udhar):</span>
                    <span>Rs. {(lastInvoice.totalAmount - lastInvoice.paidAmount).toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'center', marginTop: '0.85rem', fontSize: '0.68rem', borderTop: '1px dashed #000', paddingTop: '0.4rem', lineHeight: 1.3 }}>
                <div>{settings['receipt_footer'] || 'Thank you for choosing NMP. Get well soon!'}</div>
                <div style={{ fontSize: '0.62rem', color: '#555', marginTop: '0.2rem' }}>Keep all medicines stored below 30°C in dry place.</div>
                <div style={{ fontWeight: 800, marginTop: '0.35rem', letterSpacing: '0.5px' }}>
                  *** {settings['pharmacy_name'] || 'NAVEED MEDICAL PHARMACY (NMP)'} ***
                </div>
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
    </div>
  );
};

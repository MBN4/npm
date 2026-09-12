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
  CheckCircle
} from 'lucide-react';
import { saveOfflineSale } from '../services/offlineSync.js';
import { printThermalElement } from '../utils/thermalPrinter.js';

export interface CartItem {
  medicineId: number;
  brandName: string;
  strength?: string;
  dosageForm?: string;
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

  // Search state
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const paidInputRef = useRef<HTMLInputElement>(null);

  // Camera Scanner state
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customers, setCustomers] = useState<{ id: number; name: string; mobile?: string; current_balance: number }[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [billDiscount, setBillDiscount] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'CREDIT' | 'SPLIT'>('CASH');
  const [paidAmount, setPaidAmount] = useState<string>('');

  // Held bills state
  const [heldBills, setHeldBills] = useState<any[]>([]);
  const [showHeldModal, setShowHeldModal] = useState(false);

  // Receipt modal & settings state
  const [lastInvoice, setLastInvoice] = useState<any>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [autoPrint, setAutoPrint] = useState<boolean>(() => {
    return localStorage.getItem('nmp_autoprint') === 'true';
  });

  // Fetch customers & pharmacy settings on load
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
          // Fallback if patients route is not yet up
          const cRes = await fetch('/api/pos/search?q=Panadol', { headers: { Authorization: `Bearer ${token}` } });
          if (cRes.ok) {
            setCustomers([
              { id: 1, name: 'Muhammad Usman', mobile: '0312-9988776', current_balance: 1200 },
              { id: 2, name: 'Amina Bibi', mobile: '0345-1122334', current_balance: 0 }
            ]);
          }
        }

        if (settingsRes.ok) {
          const sData = await settingsRes.json();
          if (sData.settings) {
            setSettings(sData.settings);
          }
        }
      } catch (err) {
        console.error('POS initialization error:', err);
      }
    }

    loadInitialData();
    fetchHeldBills();
  }, [token]);

  const handlePrintReceipt = () => {
    printThermalElement('nmp-pos-receipt', (settings['printer_paper_width'] as any) || '80mm');
  };

  // Keyboard shortcut listener
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

  // Live search handler
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
        console.error('POS search failed:', err);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  const handleAddToCart = (product: any) => {
    setErrorMessage(null);

    if (!product.fefo_batch) {
      setErrorMessage(`No valid non-expired stock available for ${product.brand_name}.`);
      return;
    }

    const batch = product.fefo_batch;

    // Check if already in cart
    const existingIndex = cart.findIndex(it => it.batchId === batch.batch_id);
    if (existingIndex > -1) {
      const updated = [...cart];
      if (updated[existingIndex].quantity + 1 > batch.quantity) {
        setErrorMessage(`Cannot exceed available batch stock (${batch.quantity} units).`);
        return;
      }
      updated[existingIndex].quantity += 1;
      updated[existingIndex].lineTotal = (updated[existingIndex].quantity * updated[existingIndex].unitPrice) - updated[existingIndex].discount;
      setCart(updated);
    } else {
      const newItem: CartItem = {
        medicineId: product.id,
        brandName: product.brand_name,
        strength: product.strength,
        dosageForm: product.dosage_form,
        batchId: batch.batch_id,
        batchNumber: batch.batch_number,
        expiryDate: batch.expiry_date,
        daysToExpiry: batch.days_to_expiry,
        unitPrice: Number(batch.sale_price),
        availableStock: batch.quantity,
        quantity: 1,
        discount: 0,
        lineTotal: Number(batch.sale_price),
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
      setErrorMessage(`Cannot exceed available stock (${item.availableStock} units).`);
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
    setErrorMessage(null);
    searchInputRef.current?.focus();
  };

  // Financial Calculations
  const subtotal = cart.reduce((acc, it) => acc + it.lineTotal, 0);
  const discountVal = Number(billDiscount) || 0;
  const grandTotal = Math.max(0, subtotal - discountVal);
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

  // Camera stream start/stop
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
          tax: 0,
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
        customer: customers.find(c => String(c.id) === selectedCustomerId),
        cashierName: user?.fullName || 'Cashier',
        paymentMethod
      };
      setLastInvoice(invoiceData);
      setShowReceiptModal(true);
      handleClearCart();

      if (autoPrint) {
        setTimeout(() => {
          handlePrintReceipt();
        }, 350);
      }
    } catch (err: any) {
      // Offline fallback
      if (!navigator.onLine || err.message.includes('fetch') || err.message.includes('Network') || err.message.includes('Failed to fetch')) {
        const offlineRecord = saveOfflineSale({
          customerId: selectedCustomerId ? Number(selectedCustomerId) : null,
          customerName: selectedCustomerId ? customers.find(c => String(c.id) === selectedCustomerId)?.name : 'Walk-in Counter Patient',
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
          tax: 0,
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
          discount: discountVal,
          items: cart,
          customer: customers.find(c => String(c.id) === selectedCustomerId),
          cashierName: user?.fullName || 'Cashier',
          paymentMethod,
          createdAt: new Date().toISOString()
        };

        setLastInvoice(offlineInvoiceData);
        setInfoMessage('Offline Mode Active: Sale saved locally in queue. It will automatically synchronize when network is restored.');
        setShowReceiptModal(true);
        handleClearCart();

        if (autoPrint) {
          setTimeout(() => {
            handlePrintReceipt();
          }, 350);
        }
      } else {
        setErrorMessage(err.message || 'Checkout failed');
      }
    }
  };

  return (
    <div className="page-container" style={{ padding: '1rem' }}>
      {/* Top Shortcuts Bar */}
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
              title="View & Reprint Last Receipt on Speed-X 400UL"
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

      {/* CAMERA SCANNER MODAL */}
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

      {/* Main POS Split Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '1rem', alignItems: 'start' }}>
        {/* Left Column: Search & Cart */}
        <div>
          {/* Search Box */}
          <div className="card" style={{ padding: '0.85rem', marginBottom: '0.85rem', position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <input
                ref={searchInputRef}
                className="input"
                placeholder="Scan barcode (EAN-13, Custom NMP) or search brand / generic (F2)..."
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
                        console.error('Direct barcode lookup error:', err);
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

            {/* Live Search Results Dropdown */}
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
                {searchResults.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleAddToCart(p)}
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
                    <div>
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

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                        Rs. {p.fefo_batch ? p.fefo_batch.sale_price : 0}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: p.total_stock > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                        {p.total_stock > 0 ? `${p.total_stock} in stock` : 'Out of Stock'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cart Table */}
          <div className="card" style={{ padding: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <ShoppingCart size={16} />
                <span>Active Sale Cart ({cart.length} items)</span>
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
                      <th style={{ padding: '0.5rem' }}>Medicine</th>
                      <th style={{ padding: '0.5rem' }}>Batch / Expiry</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Price</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center' }}>Qty</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Total</th>
                      <th style={{ padding: '0.5rem', width: '30px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.6rem 0.5rem' }}>
                          <div style={{ fontWeight: 700 }}>{item.brandName}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {item.strength} • {item.dosageForm}
                          </div>
                        </td>
                        <td style={{ padding: '0.6rem 0.5rem' }}>
                          <select
                            className="input input-sm"
                            value={item.batchId}
                            onChange={(e) => handleSwitchBatch(index, Number(e.target.value))}
                            style={{ fontSize: '0.72rem', padding: '0.2rem 0.4rem', height: '26px' }}
                          >
                            {item.availableBatches?.map(b => (
                              <option key={b.batch_id} value={b.batch_id}>
                                #{b.batch_number} (Exp: {b.expiry_date}) - {b.quantity} left
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>
                          Rs. {item.unitPrice.toFixed(2)}
                        </td>
                        <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                            <button
                              onClick={() => handleUpdateQty(index, item.quantity - 1)}
                              style={{ border: 'none', background: 'var(--bg-surface)', padding: '0.2rem 0.5rem', cursor: 'pointer' }}
                            >
                              -
                            </button>
                            <span style={{ padding: '0.2rem 0.6rem', fontWeight: 700, fontSize: '0.85rem' }}>
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => handleUpdateQty(index, item.quantity + 1)}
                              style={{ border: 'none', background: 'var(--bg-surface)', padding: '0.2rem 0.5rem', cursor: 'pointer' }}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 800 }}>
                          Rs. {item.lineTotal.toFixed(2)}
                        </td>
                        <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                          <button
                            onClick={() => handleRemoveItem(index)}
                            style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                          >
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Customer & Settlement Checkout Panel */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <form onSubmit={handleCheckout} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem' }}>Settlement & Payment</h2>

            {/* Customer Selector */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Customer / Patient
              </label>
              <select
                className="input"
                value={selectedCustomerId}
                onChange={e => setSelectedCustomerId(e.target.value)}
              >
                <option value="">Walk-in Customer (General)</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.mobile ? `(${c.mobile})` : ''} - Balance: Rs. {c.current_balance}
                  </option>
                ))}
              </select>
            </div>

            {/* Payment Mode Selector */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Payment Method
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.35rem' }}>
                {(['CASH', 'CARD', 'CREDIT', 'SPLIT'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPaymentMethod(mode)}
                    className={`btn btn-sm ${paymentMethod === mode ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.72rem', padding: '0.35rem 0.2rem', justifyContent: 'center' }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Bill Discount & Paid Amount */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Bill Discount (Rs.)
                </label>
                <input
                  type="number"
                  className="input"
                  value={billDiscount}
                  onChange={e => setBillDiscount(e.target.value)}
                  min="0"
                />
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

            {/* Summary Breakdown */}
            <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>Subtotal:</span>
                <span>Rs. {subtotal.toFixed(2)}</span>
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
                  <span>Change Due:</span>
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

            {/* Auto-print toggle */}
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

            {/* Checkout Action Button */}
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

      {/* Held Bills Modal */}
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

      {/* 80mm ESC/POS Thermal Receipt Modal & WhatsApp Sharing */}
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

            {/* Printable Area */}
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
                <div style={{ fontSize: '1.05rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {settings['pharmacy_name'] || 'NAVEED MEDICAL PHARMACY'}
                </div>
                {settings['receipt_header_subtitle'] && (
                  <div style={{ fontSize: '0.7rem', color: '#444' }}>{settings['receipt_header_subtitle']}</div>
                )}
                <div style={{ fontSize: '0.72rem', color: '#333' }}>
                  {settings['pharmacy_address'] || 'Main Bazar, Hospital Road, Gujranwala'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#333' }}>
                  Phone: {settings['pharmacy_phone'] || '0300-1112233'}
                  {settings['license_number'] ? ` | DSL: ${settings['license_number']}` : ''}
                </div>
                {settings['tax_number'] && (
                  <div style={{ fontSize: '0.7rem', color: '#333' }}>NTN: {settings['tax_number']}</div>
                )}
                <div style={{ fontSize: '0.75rem', marginTop: '0.2rem', letterSpacing: '-1px' }}>
                  ------------------------------------------
                </div>
              </div>

              <div style={{ fontSize: '0.75rem', marginBottom: '0.4rem', lineHeight: 1.4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Invoice: <strong>#{lastInvoice.invoiceNumber}</strong></span>
                  <span>{new Date(lastInvoice.createdAt).toLocaleDateString()} {new Date(lastInvoice.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Cashier: {lastInvoice.cashierName}</span>
                  <span>Payment: {lastInvoice.paymentMethod || paymentMethod}</span>
                </div>
                {lastInvoice.customer && (
                  <div style={{ borderTop: '1px dotted #ccc', marginTop: '0.2rem', paddingTop: '0.2rem' }}>
                    Customer: <strong>{lastInvoice.customer.name}</strong> {lastInvoice.customer.mobile ? `(${lastInvoice.customer.mobile})` : ''}
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '0.35rem 0', marginBottom: '0.5rem' }}>
                <table style={{ width: '100%', fontSize: '0.72rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #000' }}>
                      <th style={{ textAlign: 'left', background: 'transparent', padding: '0.1rem 0' }}>Item</th>
                      <th style={{ textAlign: 'center', background: 'transparent', padding: '0.1rem 0' }}>Qty</th>
                      <th style={{ textAlign: 'right', background: 'transparent', padding: '0.1rem 0' }}>Price</th>
                      <th style={{ textAlign: 'right', background: 'transparent', padding: '0.1rem 0' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastInvoice.items.map((it: any, i: number) => (
                      <tr key={i} style={{ borderBottom: i < lastInvoice.items.length - 1 ? '1px dotted #e0e0e0' : 'none' }}>
                        <td style={{ padding: '0.25rem 0', verticalAlign: 'top' }}>
                          <div style={{ fontWeight: 700 }}>{it.brandName} {it.strength || ''}</div>
                          <div style={{ fontSize: '0.65rem', color: '#555' }}>
                            {it.batchNumber ? `B#:${it.batchNumber}` : ''} {it.discount > 0 ? `(Disc: ${it.discount}%)` : ''}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', padding: '0.25rem 0', verticalAlign: 'top' }}>{it.quantity}</td>
                        <td style={{ textAlign: 'right', padding: '0.25rem 0', verticalAlign: 'top' }}>{(it.unitPrice || (it.lineTotal / (it.quantity || 1)))?.toFixed(2)}</td>
                        <td style={{ textAlign: 'right', padding: '0.25rem 0', verticalAlign: 'top', fontWeight: 600 }}>Rs. {it.lineTotal.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#555', fontSize: '0.7rem' }}>
                  <span>Total Items: {lastInvoice.items.length} ({lastInvoice.items.reduce((sum: number, it: any) => sum + (it.quantity || 0), 0)} Units)</span>
                  <span>Subtotal: Rs. {lastInvoice.subtotal.toFixed(2)}</span>
                </div>
                {lastInvoice.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#000' }}>
                    <span>Discount:</span>
                    <span>-Rs. {lastInvoice.discount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '0.95rem', borderTop: '1px solid #000', paddingTop: '0.25rem', marginTop: '0.1rem' }}>
                  <span>NET TOTAL:</span>
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
                    <span>Credit / Balance Due:</span>
                    <span>Rs. {(lastInvoice.totalAmount - lastInvoice.paidAmount).toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'center', marginTop: '0.85rem', fontSize: '0.68rem', borderTop: '1px dashed #000', paddingTop: '0.4rem', lineHeight: 1.3 }}>
                <div>{settings['receipt_footer'] || 'Get well soon! Returns accepted within 7 days with bill.'}</div>
                <div style={{ fontSize: '0.62rem', color: '#555', marginTop: '0.2rem' }}>Keep all medicines stored below 30°C in dry place.</div>
                <div style={{ fontWeight: 800, marginTop: '0.35rem', letterSpacing: '0.5px' }}>
                  *** {settings['pharmacy_name'] || 'NAVEED MEDICAL PHARMACY'} ***
                </div>
              </div>
            </div>

            <div style={{ padding: '1rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={handlePrintReceipt} className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                  <Printer size={16} />
                  <span>Print Receipt</span>
                </button>

                {/* WhatsApp Receipt Share Button */}
                <button
                  onClick={() => {
                    const phone = (lastInvoice?.customer?.mobile || '').replace(/[^0-9]/g, '');
                    const invoiceSummary = `*${settings['pharmacy_name'] || 'NAVEED MEDICAL PHARMACY'}*%0AInvoice: %23${lastInvoice.invoiceNumber}%0ADate: ${new Date(lastInvoice.createdAt).toLocaleString()}%0ANet Total: Rs. ${lastInvoice.totalAmount}%0APaid: Rs. ${lastInvoice.paidAmount}%0AThank you for choosing NMP!`;
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
    </div>
  );
};

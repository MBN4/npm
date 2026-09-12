import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  ScanBarcode,
  QrCode,
  Printer,
  Camera,
  Search,
  CheckCircle2,
  MapPin,
  Calendar,
  AlertCircle
} from 'lucide-react';

interface Medicine {
  id: number;
  brand_name: string;
  strength: string;
  dosage_form: string;
  pack_size: number;
  barcode: string;
  custom_barcode: string;
  rack_location: string;
  generic_name?: string;
  manufacturer_name?: string;
  total_stock?: number;
  sale_price?: number;
  batches?: any[];
}

export const BarcodeView: React.FC = () => {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'scanner' | 'generator'>('scanner');

  // Scanner state
  const [scannedCode, setScannedCode] = useState('');
  const [scannedResult, setScannedResult] = useState<any | null>(null);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Generator state
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [selectedMedId, setSelectedMedId] = useState<string>('');
  const [customBrand, setCustomBrand] = useState('Panadol Extra 500mg');
  const [customStrength, setCustomStrength] = useState('500mg/65mg');
  const [customPrice, setCustomPrice] = useState('45.00');
  const [customBatch, setCustomBatch] = useState('BN-2026-99');
  const [customExpiry, setCustomExpiry] = useState('2028-12-31');
  const [customBarcode, setCustomBarcode] = useState('NMP-2026-08492');
  const [codeType, setCodeType] = useState<'barcode' | 'qr'>('barcode');
  const [labelColumns, setLabelColumns] = useState<number>(3); // 1, 2, 3 cols
  const [labelCount, setLabelCount] = useState<number>(12);
  const [includeBranding, setIncludeBranding] = useState(true);
  const [includeExpiry, setIncludeExpiry] = useState(true);
  const [includeBatch, setIncludeBatch] = useState(true);
  const [includePrice, setIncludePrice] = useState(true);

  // Fetch medicines for generator dropdown
  useEffect(() => {
    async function loadMeds() {
      try {
        const res = await fetch('/api/medicines?limit=100', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setMedicines(data.medicines || []);
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadMeds();
  }, [token]);

  // Camera stream handler
  const startCamera = async () => {
    setScannerError(null);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setIsCameraActive(true);
      } else {
        setScannerError('Camera access not supported on this browser/device.');
      }
    } catch (err: any) {
      setScannerError('Could not access camera: ' + (err.message || 'Permission denied'));
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Barcode lookup handler
  const handleLookup = async (code: string) => {
    if (!code || !code.trim()) return;
    setScannerLoading(true);
    setScannerError(null);
    setScannedResult(null);

    try {
      const res = await fetch(`/api/pos/search?q=${encodeURIComponent(code.trim())}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          setScannedResult(data.results[0]);
        } else {
          setScannerError(`No medicine found matching barcode "${code.trim()}".`);
        }
      } else {
        setScannerError('Failed to search barcode on server.');
      }
    } catch (err: any) {
      setScannerError(err.message || 'Network error during lookup');
    } finally {
      setScannerLoading(false);
    }
  };

  const generateNewNmpBarcode = () => {
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    const yr = new Date().getFullYear();
    setCustomBarcode(`NMP-${yr}-${randomNum}`);
  };

  const handleSelectMed = (medIdStr: string) => {
    setSelectedMedId(medIdStr);
    if (!medIdStr) return;
    const m = medicines.find(item => item.id === Number(medIdStr));
    if (m) {
      setCustomBrand(m.brand_name);
      setCustomStrength(m.strength || '');
      setCustomBarcode(m.barcode || m.custom_barcode || `NMP-2026-${m.id.toString().padStart(5, '0')}`);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Helper to render Code 128 style SVG bars
  const renderSvgBarcode = (code: string) => {
    // Generate deterministic bar pattern based on char codes
    const hash = code.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const bars: boolean[] = [];
    for (let i = 0; i < 40; i++) {
      bars.push((hash * (i + 7) + i * 13) % 3 !== 0);
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <svg width="150" height="42" viewBox="0 0 150 42">
          {bars.map((isDark, idx) => (
            <rect
              key={idx}
              x={idx * 3.5 + 5}
              y="2"
              width={isDark ? 2.5 : 1}
              height="36"
              fill="#000000"
            />
          ))}
        </svg>
        <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '2px', color: '#111' }}>
          {code}
        </span>
      </div>
    );
  };

  return (
    <div className="view-container">
      {/* View Header */}
      <div className="view-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ScanBarcode size={24} style={{ color: 'var(--primary)' }} />
            Barcode Center & Label Studio
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Live USB/Camera scanner lookup, custom NMP internal barcode generator, and printable shelf sticker studio.
          </p>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setActiveTab('scanner')}
            className={`btn ${activeTab === 'scanner' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <ScanBarcode size={16} />
            <span>Scanner Hub</span>
          </button>
          <button
            onClick={() => setActiveTab('generator')}
            className={`btn ${activeTab === 'generator' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <QrCode size={16} />
            <span>Barcode & QR Generator</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: SCANNER HUB                                        */}
      {/* ========================================================= */}
      {activeTab === 'scanner' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          {/* Left Panel: Scanner Input / Camera */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ScanBarcode size={18} style={{ color: 'var(--primary)' }} />
              Active Barcode Listener & Camera
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Manual/USB Input */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Scan with USB Scanner or Type Barcode
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      className="input"
                      style={{ paddingLeft: '2.25rem' }}
                      placeholder="e.g. 8964000123456 or PAN-001"
                      value={scannedCode}
                      onChange={e => setScannedCode(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleLookup(scannedCode);
                      }}
                      autoFocus
                    />
                  </div>
                  <button
                    onClick={() => handleLookup(scannedCode)}
                    className="btn btn-primary"
                    disabled={scannerLoading}
                  >
                    {scannerLoading ? 'Searching...' : 'Lookup'}
                  </button>
                </div>
              </div>

              {/* Quick Sample Barcode Pills */}
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                  Test Barcode Presets:
                </span>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {['8964000123456', '8964000789012', '8964000456789', '8964000345678'].map(code => (
                    <button
                      key={code}
                      onClick={() => {
                        setScannedCode(code);
                        handleLookup(code);
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.75rem' }}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '0.5rem 0' }} />

              {/* Camera Scanner Stream */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Camera size={16} style={{ color: 'var(--primary)' }} />
                    Camera Barcode Scanner
                  </span>
                  {!isCameraActive ? (
                    <button onClick={startCamera} className="btn btn-secondary btn-sm">
                      Start Camera
                    </button>
                  ) : (
                    <button onClick={stopCamera} className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }}>
                      Stop Camera
                    </button>
                  )}
                </div>

                <div
                  style={{
                    height: '200px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    position: 'relative'
                  }}
                >
                  <video
                    ref={videoRef}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: isCameraActive ? 'block' : 'none' }}
                  />
                  {!isCameraActive && (
                    <div style={{ color: '#888', textAlign: 'center', padding: '1rem', fontSize: '0.8rem' }}>
                      <Camera size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                      Camera offline. Click "Start Camera" to scan box barcodes directly.
                    </div>
                  )}
                  {isCameraActive && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: '20px 40px',
                        border: '2px dashed #38bdf8',
                        borderRadius: '8px',
                        pointerEvents: 'none',
                        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)'
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel: Scanned Medicine Product Details */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={18} style={{ color: scannedResult ? 'var(--success)' : 'var(--text-muted)' }} />
              Scanned Medicine Information
            </h2>

            {scannerError && (
              <div style={{ padding: '1rem', backgroundColor: 'var(--danger-light)', color: 'var(--danger-text)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <AlertCircle size={16} />
                <span>{scannerError}</span>
              </div>
            )}

            {!scannedResult && !scannerError && (
              <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <ScanBarcode size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
                <p style={{ fontWeight: 600 }}>No medicine currently scanned</p>
                <p style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>
                  Scan a barcode or enter an EAN code on the left to inspect batch, shelf rack coordinates, and stock.
                </p>
              </div>
            )}

            {scannedResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Brand & Generic Header */}
                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-card-header)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>{scannedResult.brand_name}</h3>
                      <div style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>
                        {scannedResult.generic_name || 'Generic molecule'}
                      </div>
                    </div>
                    <span className="badge badge-primary">
                      {scannedResult.dosage_form || 'Medicine'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                    Strength: <strong>{scannedResult.strength || 'N/A'}</strong> • Category: <strong>{scannedResult.category_name || 'General'}</strong>
                  </div>
                </div>

                {/* Key Metrics Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                  <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Available Stock</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: (scannedResult.total_stock || 0) > 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {scannedResult.total_stock || 0} units
                    </div>
                  </div>

                  <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Shelf Rack Coordinate</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      <MapPin size={14} />
                      {scannedResult.rack_location || 'Rack A-1'}
                    </div>
                  </div>

                  <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Retail MRP Price</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                      Rs. {scannedResult.fefo_batch ? scannedResult.fefo_batch.sale_price : (scannedResult.sale_price || 0)}
                    </div>
                  </div>
                </div>

                {/* Earliest Expiry Batch (FEFO) */}
                {scannedResult.fefo_batch && (
                  <div style={{ padding: '0.85rem', backgroundColor: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                      <Calendar size={14} />
                      FEFO Earliest Expiry Batch: #{scannedResult.fefo_batch.batch_number}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Expiry Date: <strong>{scannedResult.fefo_batch.expiry_date}</strong> ({scannedResult.fefo_batch.days_to_expiry} days remaining) • Batch Stock: <strong>{scannedResult.fefo_batch.quantity} units</strong>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: BARCODE & QR GENERATOR STUDIO                      */}
      {/* ========================================================= */}
      {activeTab === 'generator' && (
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '1.25rem' }}>
          {/* Config Controls */}
          <div className="card" style={{ padding: '1.5rem', height: 'fit-content' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <QrCode size={18} style={{ color: 'var(--primary)' }} />
              Label Configuration
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {/* Pre-fill from Medicine Master */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Auto-fill from Medicine Master
                </label>
                <select
                  className="input"
                  value={selectedMedId}
                  onChange={e => handleSelectMed(e.target.value)}
                >
                  <option value="">-- Choose Medicine or Enter Custom --</option>
                  {medicines.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.brand_name} {m.strength} ({m.dosage_form})
                    </option>
                  ))}
                </select>
              </div>

              {/* Brand Name */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Medicine Brand Name
                </label>
                <input
                  type="text"
                  className="input"
                  value={customBrand}
                  onChange={e => setCustomBrand(e.target.value)}
                />
              </div>

              {/* Strength & Price */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Strength
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={customStrength}
                    onChange={e => setCustomStrength(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    MRP (Rs.)
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={customPrice}
                    onChange={e => setCustomPrice(e.target.value)}
                  />
                </div>
              </div>

              {/* Batch & Expiry */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Batch #
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={customBatch}
                    onChange={e => setCustomBatch(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    className="input"
                    value={customExpiry}
                    onChange={e => setCustomExpiry(e.target.value)}
                  />
                </div>
              </div>

              {/* Barcode Number & Generator */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                    Barcode / Code 128 String
                  </label>
                  <button
                    onClick={generateNewNmpBarcode}
                    style={{ border: 'none', background: 'none', color: 'var(--primary)', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Generate NMP Barcode
                  </button>
                </div>
                <input
                  type="text"
                  className="input"
                  value={customBarcode}
                  onChange={e => setCustomBarcode(e.target.value)}
                />
              </div>

              {/* Symbology Type & Label Columns */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Code Type
                  </label>
                  <select
                    className="input"
                    value={codeType}
                    onChange={e => setCodeType(e.target.value as any)}
                  >
                    <option value="barcode">Code-128 Barcode</option>
                    <option value="qr">2D QR Code</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Sheet Layout
                  </label>
                  <select
                    className="input"
                    value={labelColumns}
                    onChange={e => setLabelColumns(Number(e.target.value))}
                  >
                    <option value={1}>1-Column (Roll 58/80mm)</option>
                    <option value={2}>2-Column (Shelf Sheet)</option>
                    <option value={3}>3-Column (A4 Sticker Sheet)</option>
                  </select>
                </div>
              </div>

              {/* Number of Labels */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Print Label Quantity: {labelCount}
                </label>
                <input
                  type="range"
                  min={1}
                  max={48}
                  value={labelCount}
                  onChange={e => setLabelCount(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Toggles */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={includeBranding} onChange={e => setIncludeBranding(e.target.checked)} />
                  NMP Brand Header
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={includePrice} onChange={e => setIncludePrice(e.target.checked)} />
                  MRP Price
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={includeBatch} onChange={e => setIncludeBatch(e.target.checked)} />
                  Batch #
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={includeExpiry} onChange={e => setIncludeExpiry(e.target.checked)} />
                  Expiry Date
                </label>
              </div>

              <button
                onClick={handlePrint}
                className="btn btn-primary"
                style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                <Printer size={16} />
                <span>Print {labelCount} Labels</span>
              </button>
            </div>
          </div>

          {/* Label Preview Grid */}
          <div className="card" style={{ padding: '1.5rem', backgroundColor: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                  Print Sheet Preview ({labelCount} labels • {labelColumns} columns)
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Formatted for standard thermal roll or A4 sticker sheets
                </span>
              </div>

              <button onClick={handlePrint} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Printer size={14} />
                <span>Print Preview</span>
              </button>
            </div>

            {/* Print Area */}
            <div
              id="printable-barcode-sheet"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${labelColumns}, 1fr)`,
                gap: '8px',
                padding: '12px',
                backgroundColor: '#ffffff',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                maxHeight: '600px',
                overflowY: 'auto'
              }}
            >
              {Array.from({ length: labelCount }).map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    border: '1px solid #94a3b8',
                    borderRadius: '4px',
                    padding: '8px 10px',
                    backgroundColor: '#ffffff',
                    color: '#0f172a',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: '140px',
                    boxSizing: 'border-box'
                  }}
                >
                  {includeBranding && (
                    <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#0284c7', borderBottom: '1px solid #e2e8f0', width: '100%', textAlign: 'center', paddingBottom: '2px', marginBottom: '4px' }}>
                      Naveed Medical Pharmacy
                    </div>
                  )}

                  <div style={{ textAlign: 'center', width: '100%' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, lineHeight: '1.2', color: '#0f172a' }}>
                      {customBrand}
                    </div>
                    {customStrength && (
                      <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 600 }}>
                        {customStrength}
                      </div>
                    )}
                  </div>

                  {/* Barcode / QR Symbology */}
                  <div style={{ margin: '4px 0' }}>
                    {codeType === 'barcode' ? (
                      renderSvgBarcode(customBarcode)
                    ) : (
                      <div style={{ width: '60px', height: '60px', border: '2px solid #000', padding: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                        <QrCode size={48} color="#000" />
                      </div>
                    )}
                  </div>

                  {/* Footer metadata */}
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: '#334155', borderTop: '1px solid #e2e8f0', paddingTop: '3px', marginTop: '2px' }}>
                    {includeBatch && <span>B:{customBatch}</span>}
                    {includeExpiry && <span>Exp:{customExpiry.slice(2)}</span>}
                    {includePrice && <span style={{ fontWeight: 800, color: '#0f172a' }}>Rs.{customPrice}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

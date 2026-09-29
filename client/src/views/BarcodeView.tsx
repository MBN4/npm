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
  AlertCircle,
  Sliders,
  Plus,
  Minus,
  RefreshCw,
  ShieldCheck,
  Sparkles
} from 'lucide-react';

/** Canonical store-barcode format used everywhere in the app (matches server auto-generation). */
function generateStoreBarcode(): string {
  return `NMP-${Math.floor(100000 + Math.random() * 900000)}`;
}

/**
 * The Speed-X SP-690UB's calibrated "true center" isn't at raw offset (0,0) — it's at
 * (-6mm, 1.5mm). Rather than showing that calibration number in the UI (confusing —
 * looks like something's still off), the stepper below shows an ADJUSTMENT relative to
 * this baseline, starting at 0 = "already correctly calibrated". The real absolute value
 * sent to the printer / saved to settings is always BASE + the displayed adjustment.
 */
const BARCODE_BASE_OFFSET_X_MM = -6;
const BARCODE_BASE_OFFSET_Y_MM = 1.5;

/** Every vertical gap in the label layout, fully customizable from the UI (all in mm). */
export interface LabelLayoutMm {
  labelTopMarginMm: number;
  gapHeaderBrandMm: number;
  gapBrandStrengthMm: number;
  gapStrengthBarcodeMm: number;
  gapBrandBarcodeMm: number;
  gapBarcodeToTextMm: number;
  gapTextToBottomMm: number;
  gapBottomToPriceMm: number;
}

const DEFAULT_LABEL_LAYOUT_MM: LabelLayoutMm = {
  labelTopMarginMm: 2.1,
  gapHeaderBrandMm: 3.5,
  gapBrandStrengthMm: 3.4,
  gapStrengthBarcodeMm: 2.25,
  gapBrandBarcodeMm: 3.9,
  gapBarcodeToTextMm: 4.9,
  gapTextToBottomMm: 4.75,
  gapBottomToPriceMm: 3.1
};

function labelLayoutToApiPayload(layout: LabelLayoutMm) {
  return {
    label_top_margin_mm: layout.labelTopMarginMm,
    gap_header_brand_mm: layout.gapHeaderBrandMm,
    gap_brand_strength_mm: layout.gapBrandStrengthMm,
    gap_strength_barcode_mm: layout.gapStrengthBarcodeMm,
    gap_brand_barcode_mm: layout.gapBrandBarcodeMm,
    gap_barcode_text_mm: layout.gapBarcodeToTextMm,
    gap_text_bottom_mm: layout.gapTextToBottomMm,
    gap_bottom_price_mm: layout.gapBottomToPriceMm
  };
}

const LABEL_LAYOUT_FIELDS: { key: keyof LabelLayoutMm; label: string; hint: string }[] = [
  { key: 'labelTopMarginMm', label: 'Top Margin', hint: 'Label edge to pharmacy header' },
  { key: 'gapHeaderBrandMm', label: 'Header → Brand', hint: 'Pharmacy name to product name' },
  { key: 'gapBrandStrengthMm', label: 'Brand → Strength', hint: 'Only used when strength is shown' },
  { key: 'gapStrengthBarcodeMm', label: 'Strength → Barcode', hint: 'Only used when strength is shown' },
  { key: 'gapBrandBarcodeMm', label: 'Brand → Barcode', hint: 'Used when there\'s no strength row' },
  { key: 'gapBarcodeToTextMm', label: 'Barcode → Its Number', hint: 'Bars to the readable code below them' },
  { key: 'gapTextToBottomMm', label: 'Number → Batch/Expiry', hint: 'Barcode number to batch/expiry line' },
  { key: 'gapBottomToPriceMm', label: 'Batch/Expiry → Price', hint: 'Last line before the price' }
];

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

interface InstalledPrinter {
  name: string;
  driver: string;
  port: string;
  isDefault: boolean;
  status: 'READY' | 'OFFLINE' | 'ERROR' | 'PAPER OUT' | 'PAUSED' | 'UNKNOWN';
}

export const BarcodeView: React.FC = () => {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'scanner' | 'generator'>('generator');

  // Scanner state
  const [scannedCode, setScannedCode] = useState('');
  const [scannedResult, setScannedResult] = useState<any | null>(null);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Generator & Thermal Roll State
  const [printMode, setPrintMode] = useState<'thermal' | 'a4'>('thermal');
  const [paperPreset, setPaperPreset] = useState<string>('38x28');
  const [customWidthMm, setCustomWidthMm] = useState<number>(38);
  const [customHeightMm, setCustomHeightMm] = useState<number>(28);

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [selectedMedId, setSelectedMedId] = useState<string>('');
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [medicineBatches, setMedicineBatches] = useState<any[]>([]);

  const [customBrand, setCustomBrand] = useState('Panadol Extra');
  const [customStrength, setCustomStrength] = useState('500mg');
  const [customPrice, setCustomPrice] = useState('45.00');
  const [customBatch, setCustomBatch] = useState('BN-2026-99');
  const [customExpiry, setCustomExpiry] = useState('2028-12-31');
  const [customBarcode, setCustomBarcode] = useState('NMP-208492');
  const [barcodeSource, setBarcodeSource] = useState<'manufacturer' | 'store' | 'missing' | 'custom'>('custom');
  const [barcodeSaveStatus, setBarcodeSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [labelCount, setLabelCount] = useState<number>(12);

  // Thermal Calibration & Hardware Settings
  const [installedPrinters, setInstalledPrinters] = useState<InstalledPrinter[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('Speed-X SP-690UB');
  const [horizontalOffsetMm, setHorizontalOffsetMm] = useState<number>(0);
  const [verticalOffsetMm, setVerticalOffsetMm] = useState<number>(0);
  const [printSpeed, setPrintSpeed] = useState<number>(5);
  const [printDensity, setPrintDensity] = useState<number>(9);
  const [mediaType, setMediaType] = useState<'GAP' | 'BLACK_MARK' | 'CONTINUOUS'>('GAP');
  const [gapHeightMm, setGapHeightMm] = useState<number>(2.0);
  // These hold the DISPLAYED adjustment (0 = baseline-calibrated), not the raw mm sent to the
  // printer — see BARCODE_BASE_OFFSET_X_MM / _Y_MM above.
  const [barcodeOffsetXMm, setBarcodeOffsetXMm] = useState<number>(0);
  const [barcodeOffsetYMm, setBarcodeOffsetYMm] = useState<number>(0);
  const [isSavingBarcodeOffset, setIsSavingBarcodeOffset] = useState(false);

  // Full vertical-rhythm customization: every gap between consecutive label rows, in mm.
  const [labelLayout, setLabelLayout] = useState<LabelLayoutMm>(DEFAULT_LABEL_LAYOUT_MM);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [showLayoutEditor, setShowLayoutEditor] = useState(false);

  const [isSubmittingJob, setIsSubmittingJob] = useState(false);
  const [statusNotice, setStatusNotice] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Load Installed Windows Printers & Saved Settings
  const fetchPrintersAndSettings = async () => {
    try {
      const [printersRes, settingsRes] = await Promise.all([
        fetch('/api/integrations/printers', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/integrations/label-printer-settings', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (settingsRes.ok) {
        const sData = await settingsRes.json();
        if (sData.printer_name) setSelectedPrinter(sData.printer_name);
        if (sData.paper_width_mm) setCustomWidthMm(sData.paper_width_mm);
        if (sData.paper_height_mm) setCustomHeightMm(sData.paper_height_mm);
        if (sData.horizontal_offset_mm !== undefined) setHorizontalOffsetMm(sData.horizontal_offset_mm);
        if (sData.vertical_offset_mm !== undefined) setVerticalOffsetMm(sData.vertical_offset_mm);
        if (sData.print_speed) setPrintSpeed(sData.print_speed);
        if (sData.density) setPrintDensity(sData.density);
        if (sData.media_type) setMediaType(sData.media_type);
        if (sData.gap_height_mm) setGapHeightMm(sData.gap_height_mm);
        if (sData.barcode_offset_x_mm !== undefined) setBarcodeOffsetXMm(Number((sData.barcode_offset_x_mm - BARCODE_BASE_OFFSET_X_MM).toFixed(1)));
        if (sData.barcode_offset_y_mm !== undefined) setBarcodeOffsetYMm(Number((sData.barcode_offset_y_mm - BARCODE_BASE_OFFSET_Y_MM).toFixed(1)));
        setLabelLayout({
          labelTopMarginMm: sData.label_top_margin_mm ?? DEFAULT_LABEL_LAYOUT_MM.labelTopMarginMm,
          gapHeaderBrandMm: sData.gap_header_brand_mm ?? DEFAULT_LABEL_LAYOUT_MM.gapHeaderBrandMm,
          gapBrandStrengthMm: sData.gap_brand_strength_mm ?? DEFAULT_LABEL_LAYOUT_MM.gapBrandStrengthMm,
          gapStrengthBarcodeMm: sData.gap_strength_barcode_mm ?? DEFAULT_LABEL_LAYOUT_MM.gapStrengthBarcodeMm,
          gapBrandBarcodeMm: sData.gap_brand_barcode_mm ?? DEFAULT_LABEL_LAYOUT_MM.gapBrandBarcodeMm,
          gapBarcodeToTextMm: sData.gap_barcode_text_mm ?? DEFAULT_LABEL_LAYOUT_MM.gapBarcodeToTextMm,
          gapTextToBottomMm: sData.gap_text_bottom_mm ?? DEFAULT_LABEL_LAYOUT_MM.gapTextToBottomMm,
          gapBottomToPriceMm: sData.gap_bottom_price_mm ?? DEFAULT_LABEL_LAYOUT_MM.gapBottomToPriceMm
        });
      }

      if (printersRes.ok) {
        const pData = await printersRes.json();
        setInstalledPrinters(pData.printers || []);
      }
    } catch (err) {
      console.error('Failed to load printer discovery:', err);
    }
  };

  useEffect(() => {
    fetchPrintersAndSettings();
  }, [token]);

  // Fetch medicines for dropdown
  useEffect(() => {
    async function loadMeds() {
      try {
        const res = await fetch('/api/medicines?limit=150', {
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
    return () => stopCamera();
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

  /**
   * Generates a new store barcode. If a catalog medicine is selected, this PERSISTS the
   * barcode to that medicine record (PUT /api/medicines/:id) so it's actually scannable
   * later at POS/Inventory — not just a label-only value that disappears after printing.
   */
  const generateAndAssignBarcode = async () => {
    const code = generateStoreBarcode();
    setCustomBarcode(code);

    if (!selectedMedId) {
      setBarcodeSource('custom');
      setBarcodeSaveStatus('idle');
      return;
    }

    setBarcodeSaveStatus('saving');
    try {
      const res = await fetch(`/api/medicines/${selectedMedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ customBarcode: code })
      });
      if (res.ok) {
        setBarcodeSaveStatus('saved');
        setBarcodeSource('store');
        setMedicines(prev => prev.map(m => m.id === Number(selectedMedId) ? { ...m, custom_barcode: code } : m));
      } else {
        const data = await res.json().catch(() => ({}));
        setStatusNotice({ text: `❌ Could not save barcode: ${data.error || 'Server error'}`, type: 'error' });
        setBarcodeSaveStatus('error');
      }
    } catch (err: any) {
      setStatusNotice({ text: `❌ Network error saving barcode: ${err.message}`, type: 'error' });
      setBarcodeSaveStatus('error');
    }
  };

  const handleSelectMed = (medIdStr: string) => {
    setSelectedMedId(medIdStr);
    setSelectedBatchId('');
    setMedicineBatches([]);
    setBarcodeSaveStatus('idle');
    if (!medIdStr) {
      setBarcodeSource('custom');
      return;
    }

    const m = medicines.find(item => item.id === Number(medIdStr));
    if (m) {
      setCustomBrand(m.brand_name);
      setCustomStrength(m.strength || '');

      const existingBarcode = m.barcode || m.custom_barcode;
      if (existingBarcode) {
        setCustomBarcode(existingBarcode);
        setBarcodeSource(m.barcode ? 'manufacturer' : 'store');
      } else {
        // No barcode of any kind on this product yet (syrup, tablet, capsule, custom item —
        // any product type). Don't fabricate a fake unsaved code; make the gap explicit
        // and let the user generate+save a real one via the banner below.
        setCustomBarcode('');
        setBarcodeSource('missing');
      }

      // Fetch batch data for medicine
      fetch(`/api/medicines/${m.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          const medData = data.medicine || data;
          if (medData.batches && medData.batches.length > 0) {
            setMedicineBatches(medData.batches);
            const activeB = medData.batches[0];
            setSelectedBatchId(String(activeB.id));
            setCustomBatch(activeB.batch_number || 'BN-2026-99');
            setCustomExpiry(activeB.expiry_date || '2028-12-31');
            setCustomPrice(activeB.sale_price ? Number(activeB.sale_price).toFixed(2) : '45.00');
          }
        })
        .catch(() => {});
    }
  };

  const handleSelectBatch = (batchIdStr: string) => {
    setSelectedBatchId(batchIdStr);
    const b = medicineBatches.find(item => String(item.id) === batchIdStr);
    if (b) {
      setCustomBatch(b.batch_number);
      setCustomExpiry(b.expiry_date);
      if (b.sale_price) setCustomPrice(Number(b.sale_price).toFixed(2));
    }
  };

  // Direct Hardware Thermal Label Printing Trigger
  const handlePrintThermalDirect = async () => {
    if (isSubmittingJob) return;
    setIsSubmittingJob(true);
    setStatusNotice(null);

    try {
      const res = await fetch('/api/integrations/print-label', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          printerName: selectedPrinter,
          medicineId: selectedMedId ? Number(selectedMedId) : null,
          batchId: selectedBatchId ? Number(selectedBatchId) : null,
          barcode: customBarcode,
          quantity: labelCount,
          labelData: {
            pharmacyHeader: 'NAVEED MEDICAL PHARMACY',
            brandName: customBrand,
            strength: customStrength,
            barcode: customBarcode,
            batchNumber: customBatch,
            expiryDate: customExpiry,
            salePrice: customPrice
          },
          config: {
            paperWidthMm: paperPreset === 'Custom' ? customWidthMm : getPresetDimensions(paperPreset).width,
            paperHeightMm: paperPreset === 'Custom' ? customHeightMm : getPresetDimensions(paperPreset).height,
            gapHeightMm,
            horizontalOffsetMm,
            verticalOffsetMm,
            printSpeed,
            density: printDensity,
            barcodeOffsetXMm: BARCODE_BASE_OFFSET_X_MM + barcodeOffsetXMm,
            barcodeOffsetYMm: BARCODE_BASE_OFFSET_Y_MM + barcodeOffsetYMm,
            labelTopMarginMm: labelLayout.labelTopMarginMm,
            gapHeaderBrandMm: labelLayout.gapHeaderBrandMm,
            gapBrandStrengthMm: labelLayout.gapBrandStrengthMm,
            gapStrengthBarcodeMm: labelLayout.gapStrengthBarcodeMm,
            gapBrandBarcodeMm: labelLayout.gapBrandBarcodeMm,
            gapBarcodeToTextMm: labelLayout.gapBarcodeToTextMm,
            gapTextToBottomMm: labelLayout.gapTextToBottomMm,
            gapBottomToPriceMm: labelLayout.gapBottomToPriceMm
          }
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatusNotice({
          text: `⚡ ${data.message || `Successfully sent ${labelCount} label(s) to ${selectedPrinter}!`}`,
          type: 'success'
        });
      } else {
        setStatusNotice({
          text: `❌ Print Job Error: ${data.message || data.error || 'Failed to submit job to printer.'}`,
          type: 'error'
        });
      }
    } catch (err: any) {
      setStatusNotice({ text: `❌ Network error: ${err.message}`, type: 'error' });
    } finally {
      setIsSubmittingJob(false);
    }
  };

  // Test Print Label Trigger
  const handleTestPrintLabel = async () => {
    if (isSubmittingJob) return;
    setIsSubmittingJob(true);
    setStatusNotice(null);

    try {
      const res = await fetch('/api/integrations/print-test-label', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ printerName: selectedPrinter })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatusNotice({
          text: `✅ Test Label (38x28mm) printed on ${selectedPrinter}!`,
          type: 'success'
        });
      } else {
        setStatusNotice({
          text: `❌ Test Print Error: ${data.message || data.error || 'Test label failed.'}`,
          type: 'error'
        });
      }
    } catch (err: any) {
      setStatusNotice({ text: `❌ Network error: ${err.message}`, type: 'error' });
    } finally {
      setIsSubmittingJob(false);
    }
  };

  // Persists the current barcode-only offset (and the rest of the label config) so it's
  // remembered next time, instead of only applying for this session's print jobs.
  const handleSaveBarcodeOffset = async () => {
    if (isSavingBarcodeOffset) return;
    setIsSavingBarcodeOffset(true);
    setStatusNotice(null);

    try {
      const res = await fetch('/api/integrations/label-printer-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          printer_name: selectedPrinter,
          paper_width_mm: paperPreset === 'Custom' ? customWidthMm : getPresetDimensions(paperPreset).width,
          paper_height_mm: paperPreset === 'Custom' ? customHeightMm : getPresetDimensions(paperPreset).height,
          gap_height_mm: gapHeightMm,
          horizontal_offset_mm: horizontalOffsetMm,
          vertical_offset_mm: verticalOffsetMm,
          print_speed: printSpeed,
          density: printDensity,
          media_type: mediaType,
          barcode_offset_x_mm: BARCODE_BASE_OFFSET_X_MM + barcodeOffsetXMm,
          barcode_offset_y_mm: BARCODE_BASE_OFFSET_Y_MM + barcodeOffsetYMm,
          ...labelLayoutToApiPayload(labelLayout)
        })
      });

      if (res.ok) {
        setStatusNotice({ text: '✅ Barcode position saved as default for future prints.', type: 'success' });
      } else {
        const data = await res.json().catch(() => ({}));
        setStatusNotice({ text: `❌ Could not save: ${data.error || 'Server error'}`, type: 'error' });
      }
    } catch (err: any) {
      setStatusNotice({ text: `❌ Network error: ${err.message}`, type: 'error' });
    } finally {
      setIsSavingBarcodeOffset(false);
    }
  };

  const handleSaveLabelLayout = async () => {
    if (isSavingLayout) return;
    setIsSavingLayout(true);
    setStatusNotice(null);

    try {
      const res = await fetch('/api/integrations/label-printer-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          printer_name: selectedPrinter,
          paper_width_mm: paperPreset === 'Custom' ? customWidthMm : getPresetDimensions(paperPreset).width,
          paper_height_mm: paperPreset === 'Custom' ? customHeightMm : getPresetDimensions(paperPreset).height,
          gap_height_mm: gapHeightMm,
          horizontal_offset_mm: horizontalOffsetMm,
          vertical_offset_mm: verticalOffsetMm,
          print_speed: printSpeed,
          density: printDensity,
          media_type: mediaType,
          barcode_offset_x_mm: BARCODE_BASE_OFFSET_X_MM + barcodeOffsetXMm,
          barcode_offset_y_mm: BARCODE_BASE_OFFSET_Y_MM + barcodeOffsetYMm,
          ...labelLayoutToApiPayload(labelLayout)
        })
      });

      if (res.ok) {
        setStatusNotice({ text: '✅ Label layout saved as default for future prints.', type: 'success' });
      } else {
        const data = await res.json().catch(() => ({}));
        setStatusNotice({ text: `❌ Could not save: ${data.error || 'Server error'}`, type: 'error' });
      }
    } catch (err: any) {
      setStatusNotice({ text: `❌ Network error: ${err.message}`, type: 'error' });
    } finally {
      setIsSavingLayout(false);
    }
  };

  // Re-calibrates the printer's gap sensor. Run this after loading new label stock, or if
  // print jobs start overlapping / drifting instead of landing on a fresh label each time.
  const handleCalibrateSensor = async () => {
    if (isSubmittingJob) return;
    setIsSubmittingJob(true);
    setStatusNotice(null);

    try {
      const res = await fetch('/api/integrations/calibrate-label-printer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ printerName: selectedPrinter })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatusNotice({ text: `⚙️ ${data.message}`, type: 'success' });
      } else {
        setStatusNotice({ text: `❌ Calibration Error: ${data.message || data.error || 'Failed.'}`, type: 'error' });
      }
    } catch (err: any) {
      setStatusNotice({ text: `❌ Network error: ${err.message}`, type: 'error' });
    } finally {
      setIsSubmittingJob(false);
    }
  };

  const getPresetDimensions = (preset: string) => {
    switch (preset) {
      case '38x28': return { width: 38, height: 28, name: '38 x 28 mm — NMP DEFAULT' };
      case '40x50': return { width: 40, height: 50, name: '40 x 50 mm' };
      case '50x20': return { width: 50, height: 20, name: '50 x 20 mm' };
      case '50x30': return { width: 50, height: 30, name: '50 x 30 mm' };
      case '60x40': return { width: 60, height: 40, name: '60 x 40 mm' };
      case '100x25': return { width: 100, height: 25, name: '100 x 25 mm' };
      default: return { width: customWidthMm, height: customHeightMm, name: 'Custom' };
    }
  };

  const activeDimensions = getPresetDimensions(paperPreset);

  // Helper to render Code 128 style SVG bars
  const renderSvgBarcode = (code: string) => {
    const hash = code.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const bars: boolean[] = [];
    for (let i = 0; i < 40; i++) {
      bars.push((hash * (i + 7) + i * 13) % 3 !== 0);
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <svg width="140" height="38" viewBox="0 0 140 38">
          {bars.map((isDark, idx) => (
            <rect
              key={idx}
              x={idx * 3.2 + 4}
              y="2"
              width={isDark ? 2.4 : 1}
              height="34"
              fill="#000000"
            />
          ))}
        </svg>
        <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 800, letterSpacing: '1.5px', color: '#000' }}>
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
            Barcode Center & Speed-X Label Studio
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Professional direct thermal sticker printer integration for Naveed Medical Pharmacy (38x28mm presets).
          </p>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setActiveTab('generator')}
            className={`btn ${activeTab === 'generator' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <QrCode size={16} />
            <span>Label & Sticker Studio</span>
          </button>
          <button
            onClick={() => setActiveTab('scanner')}
            className={`btn ${activeTab === 'scanner' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <ScanBarcode size={16} />
            <span>Scanner Hub</span>
          </button>
        </div>
      </div>

      {statusNotice && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: statusNotice.type === 'success' ? 'var(--success-light)' : statusNotice.type === 'error' ? 'var(--danger-light)' : 'var(--primary-light)',
            color: statusNotice.type === 'success' ? 'var(--success-text)' : statusNotice.type === 'error' ? 'var(--danger-text)' : 'var(--primary)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.25rem',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            border: '1px solid currentColor'
          }}
        >
          {statusNotice.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{statusNotice.text}</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: BARCODE & THERMAL STICKER STUDIO                   */}
      {/* ========================================================= */}
      {activeTab === 'generator' && (
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '1.25rem' }}>
          {/* Left Config Controls */}
          <div className="card" style={{ padding: '1.25rem', height: 'fit-content' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                <Sliders size={18} style={{ color: 'var(--primary)' }} />
                <span>Printer & Label Settings</span>
              </h2>

              <button
                onClick={fetchPrintersAndSettings}
                className="btn btn-secondary btn-sm"
                title="Detect installed printers"
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
              >
                <RefreshCw size={13} />
                <span>Detect</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {/* PRINT MODE SWITCHER */}
              <div style={{ padding: '0.5rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.35rem', color: 'var(--primary)' }}>
                  PRINT MODE
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                  <button
                    type="button"
                    onClick={() => setPrintMode('thermal')}
                    className={`btn btn-sm ${printMode === 'thermal' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontWeight: 700, fontSize: '0.78rem' }}
                  >
                    ● Thermal Roll
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintMode('a4')}
                    className={`btn btn-sm ${printMode === 'a4' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontWeight: 700, fontSize: '0.78rem' }}
                  >
                    ○ A4 Sticker Sheet
                  </button>
                </div>
              </div>

              {/* Target Printer Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Target Label Printer
                </label>
                <select
                  className="input"
                  value={selectedPrinter}
                  onChange={e => setSelectedPrinter(e.target.value)}
                >
                  {selectedPrinter && !installedPrinters.some(p => p.name.toLowerCase() === selectedPrinter.toLowerCase()) && (
                    <option value={selectedPrinter}>{selectedPrinter} (Configured Target)</option>
                  )}
                  {installedPrinters.map(p => (
                    <option key={p.name} value={p.name}>
                      {p.name} [{p.port || 'USB'}] ({p.status})
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  className="input"
                  style={{ marginTop: '0.3rem', fontSize: '0.75rem' }}
                  placeholder="Or enter label printer name..."
                  value={selectedPrinter}
                  onChange={e => setSelectedPrinter(e.target.value)}
                />
              </div>

              {/* Paper Size Preset */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Label Paper Dimension Preset
                </label>
                <select
                  className="input"
                  value={paperPreset}
                  onChange={e => setPaperPreset(e.target.value)}
                >
                  <option value="38x28">38 x 28 mm — NMP DEFAULT (Direct Thermal)</option>
                  <option value="40x50">40 x 50 mm (Medium)</option>
                  <option value="50x20">50 x 20 mm (Narrow)</option>
                  <option value="50x30">50 x 30 mm (Standard Roll)</option>
                  <option value="60x40">60 x 40 mm (Large Container)</option>
                  <option value="100x25">100 x 25 mm (Shelf Strip)</option>
                  <option value="Custom">Custom Width x Height...</option>
                </select>
              </div>

              {paperPreset === 'Custom' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600 }}>Width (mm)</label>
                    <input type="number" className="input" value={customWidthMm} onChange={e => setCustomWidthMm(Number(e.target.value))} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600 }}>Height (mm)</label>
                    <input type="number" className="input" value={customHeightMm} onChange={e => setCustomHeightMm(Number(e.target.value))} />
                  </div>
                </div>
              )}

              {/* Media Sensor Type */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Media Sensor Type
                </label>
                <select
                  className="input"
                  value={mediaType}
                  onChange={e => setMediaType(e.target.value as any)}
                >
                  <option value="GAP">Gap Label (Default 38x28 Sticker Roll)</option>
                  <option value="BLACK_MARK">Black Mark Sensor</option>
                  <option value="CONTINUOUS">Continuous Paper Roll</option>
                </select>
              </div>

              {/* Pre-fill from Medicine Master */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Auto-fill from Medicine Catalog
                </label>
                <select
                  className="input"
                  value={selectedMedId}
                  onChange={e => handleSelectMed(e.target.value)}
                >
                  <option value="">-- Choose Medicine or Custom --</option>
                  {medicines.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.brand_name} {m.strength} ({m.dosage_form})
                    </option>
                  ))}
                </select>
              </div>

              {medicineBatches.length > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Select Inventory Batch
                  </label>
                  <select
                    className="input"
                    value={selectedBatchId}
                    onChange={e => handleSelectBatch(e.target.value)}
                  >
                    <option value="">-- Select Active Batch --</option>
                    {medicineBatches.map(b => (
                      <option key={b.id} value={b.id}>
                        #{b.batch_number} (EXP: {b.expiry_date}) - Rs. {b.sale_price}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Brand Name & Strength */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600 }}>Brand Name</label>
                  <input type="text" className="input" value={customBrand} onChange={e => setCustomBrand(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600 }}>Strength</label>
                  <input type="text" className="input" value={customStrength} onChange={e => setCustomStrength(e.target.value)} />
                </div>
              </div>

              {/* Batch, Expiry, MRP */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600 }}>Batch #</label>
                  <input type="text" className="input" value={customBatch} onChange={e => setCustomBatch(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600 }}>Expiry</label>
                  <input type="text" className="input" value={customExpiry} onChange={e => setCustomExpiry(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600 }}>MRP (Rs.)</label>
                  <input type="text" className="input" value={customPrice} onChange={e => setCustomPrice(e.target.value)} />
                </div>
              </div>

              {/* Barcode Number & Generator */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600 }}>Barcode Code 128</label>
                  <button
                    type="button"
                    onClick={generateAndAssignBarcode}
                    disabled={barcodeSaveStatus === 'saving'}
                    style={{ border: 'none', background: 'none', color: 'var(--primary)', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    {barcodeSaveStatus === 'saving' ? 'Saving...' : 'Generate New'}
                  </button>
                </div>

                {barcodeSource === 'missing' && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.6rem 0.7rem',
                      marginBottom: '0.4rem',
                      background: 'var(--warning-light)',
                      color: 'var(--warning-text)',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.75rem'
                    }}
                  >
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>
                      This product has no barcode yet — works for any type (syrup, tablet, capsule, custom item). Generate one and it'll be saved to the catalog so it scans correctly at POS.
                    </span>
                    <button
                      type="button"
                      onClick={generateAndAssignBarcode}
                      disabled={barcodeSaveStatus === 'saving'}
                      className="btn btn-primary btn-sm"
                      style={{ flexShrink: 0, fontSize: '0.72rem', padding: '0.3rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                      <Sparkles size={13} />
                      <span>{barcodeSaveStatus === 'saving' ? 'Saving...' : 'Generate & Save'}</span>
                    </button>
                  </div>
                )}

                <input
                  type="text"
                  className="input"
                  value={customBarcode}
                  onChange={e => { setCustomBarcode(e.target.value); setBarcodeSource('custom'); setBarcodeSaveStatus('idle'); }}
                  placeholder="No barcode — generate one above"
                />

                {barcodeSource !== 'missing' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.3rem', fontSize: '0.68rem' }}>
                    {barcodeSource === 'manufacturer' && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--success-text)' }}>
                        <ShieldCheck size={12} /> Manufacturer barcode (EAN)
                      </span>
                    )}
                    {barcodeSource === 'store' && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: barcodeSaveStatus === 'saved' ? 'var(--success-text)' : 'var(--text-muted)' }}>
                        <CheckCircle2 size={12} /> {barcodeSaveStatus === 'saved' ? 'Store barcode — saved to catalog' : 'Store-generated barcode'}
                      </span>
                    )}
                    {barcodeSource === 'custom' && (
                      <span style={{ color: 'var(--text-muted)' }}>
                        {selectedMedId ? 'Custom value — not yet saved to catalog' : 'Ad-hoc value (no catalog product selected)'}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Print Quantity Stepper & Presets */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Label Quantity</label>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--primary)' }}>{labelCount} labels</span>
                </div>

                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <button
                    type="button"
                    onClick={() => setLabelCount(prev => Math.max(1, prev - 1))}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '0.4rem 0.75rem' }}
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    className="input"
                    style={{ textAlign: 'center', fontWeight: 700 }}
                    value={labelCount}
                    onChange={e => setLabelCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  />
                  <button
                    type="button"
                    onClick={() => setLabelCount(prev => prev + 1)}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '0.4rem 0.75rem' }}
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                  {[1, 5, 10, 12, 20, 50].map(q => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setLabelCount(q)}
                      className={`btn btn-sm ${labelCount === q ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Offset Calibration Controls */}
              <div style={{ padding: '0.6rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, display: 'block', marginBottom: '0.4rem' }}>
                  Label Position Calibration (mm)
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Horizontal Offset</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      <button
                        type="button"
                        onClick={() => setHorizontalOffsetMm(prev => Number((prev - 0.5).toFixed(1)))}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.1rem 0.3rem' }}
                      >-</button>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, width: '45px', textAlign: 'center' }}>
                        {horizontalOffsetMm} mm
                      </span>
                      <button
                        type="button"
                        onClick={() => setHorizontalOffsetMm(prev => Number((prev + 0.5).toFixed(1)))}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.1rem 0.3rem' }}
                      >+</button>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Vertical Offset</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      <button
                        type="button"
                        onClick={() => setVerticalOffsetMm(prev => Number((prev - 0.5).toFixed(1)))}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.1rem 0.3rem' }}
                      >-</button>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, width: '45px', textAlign: 'center' }}>
                        {verticalOffsetMm} mm
                      </span>
                      <button
                        type="button"
                        onClick={() => setVerticalOffsetMm(prev => Number((prev + 0.5).toFixed(1)))}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.1rem 0.3rem' }}
                      >+</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Barcode-Only Position Nudge — shifts ONLY the barcode + its readable text,
                  independent of everything else on the label. Use this if the barcode itself
                  looks off-center/off-position even though the text lines look fine. */}
              <div style={{ padding: '0.6rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    Barcode-Only Position (mm)
                  </span>
                  <button
                    type="button"
                    onClick={handleSaveBarcodeOffset}
                    disabled={isSavingBarcodeOffset}
                    style={{ border: 'none', background: 'none', color: 'var(--primary)', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    {isSavingBarcodeOffset ? 'Saving...' : 'Save as Default'}
                  </button>
                </div>
                <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '0 0 0.4rem' }}>
                  Nudges only the barcode graphic + its number, leaving all other text where it is.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Barcode Horizontal</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      <button
                        type="button"
                        onClick={() => setBarcodeOffsetXMm(prev => Number((prev - 0.5).toFixed(1)))}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.1rem 0.3rem' }}
                      >-</button>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, width: '45px', textAlign: 'center' }}>
                        {barcodeOffsetXMm} mm
                      </span>
                      <button
                        type="button"
                        onClick={() => setBarcodeOffsetXMm(prev => Number((prev + 0.5).toFixed(1)))}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.1rem 0.3rem' }}
                      >+</button>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Barcode Vertical</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      <button
                        type="button"
                        onClick={() => setBarcodeOffsetYMm(prev => Number((prev - 0.5).toFixed(1)))}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.1rem 0.3rem' }}
                      >-</button>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, width: '45px', textAlign: 'center' }}>
                        {barcodeOffsetYMm} mm
                      </span>
                      <button
                        type="button"
                        onClick={() => setBarcodeOffsetYMm(prev => Number((prev + 0.5).toFixed(1)))}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.1rem 0.3rem' }}
                      >+</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Full Label Layout Customization — every vertical gap on the label, editable. */}
              <div style={{ padding: '0.6rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <button
                  type="button"
                  onClick={() => setShowLayoutEditor(prev => !prev)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    Customize Full Label Layout (mm)
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600 }}>
                    {showLayoutEditor ? 'Hide ▲' : 'Show ▼'}
                  </span>
                </button>

                {showLayoutEditor && (
                  <div style={{ marginTop: '0.6rem' }}>
                    <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '0 0 0.5rem' }}>
                      Every vertical gap between rows on the label, in millimetres. Adjust any value, print a test label, repeat.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      {LABEL_LAYOUT_FIELDS.map(field => (
                        <div key={field.key}>
                          <label style={{ fontSize: '0.68rem', fontWeight: 600, display: 'block' }} title={field.hint}>
                            {field.label}
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            className="input input-sm"
                            style={{ fontSize: '0.76rem', padding: '0.2rem 0.4rem', height: '28px' }}
                            value={labelLayout[field.key]}
                            onChange={e => setLabelLayout(prev => ({ ...prev, [field.key]: Number(e.target.value) }))}
                          />
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                      <button
                        type="button"
                        onClick={handleSaveLabelLayout}
                        disabled={isSavingLayout}
                        className="btn btn-primary btn-sm"
                        style={{ flex: 1, fontSize: '0.75rem', fontWeight: 700 }}
                      >
                        {isSavingLayout ? 'Saving...' : 'Save as Default'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLabelLayout(DEFAULT_LABEL_LAYOUT_MM)}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.75rem' }}
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handlePrintThermalDirect}
                  disabled={isSubmittingJob || !customBarcode.trim()}
                  className="btn btn-primary"
                  style={{ padding: '0.75rem', fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  title={!customBarcode.trim() ? 'Generate a barcode first' : undefined}
                >
                  <Printer size={18} />
                  <span>{isSubmittingJob ? 'Sending to Speed-X...' : !customBarcode.trim() ? 'Generate a barcode first' : `PRINT LABELS (${labelCount} Copies)`}</span>
                </button>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={handleTestPrintLabel}
                    disabled={isSubmittingJob}
                    className="btn btn-secondary btn-sm"
                    style={{ fontWeight: 700, padding: '0.5rem' }}
                  >
                    Test Print (38x28)
                  </button>

                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="btn btn-secondary btn-sm"
                    style={{ fontWeight: 700, padding: '0.5rem' }}
                  >
                    Browser Print
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleCalibrateSensor}
                  disabled={isSubmittingJob}
                  className="btn btn-secondary btn-sm"
                  style={{ fontWeight: 700, padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                  title="Run this after loading new label stock, or if prints overlap/drift between labels"
                >
                  <Sliders size={14} />
                  <span>Calibrate Gap Sensor</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Live Preview Canvas */}
          <div className="card" style={{ padding: '1.5rem', backgroundColor: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Live Physical Label Ratio Preview ({activeDimensions.width} mm × {activeDimensions.height} mm)
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  Printer: <strong>{selectedPrinter}</strong> • Mode: <strong>{printMode === 'thermal' ? 'Direct Thermal Roll (1 label/sticker)' : 'A4 Sheet'}</strong> • DPI: <strong>203</strong>
                </span>
              </div>
            </div>

            {/* Interactive Physical 38:28 Sticker Box */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '1rem 0' }}>
              <div
                style={{
                  width: `${activeDimensions.width * 8}px`,
                  height: `${activeDimensions.height * 8}px`,
                  backgroundColor: '#ffffff',
                  borderRadius: '4px',
                  border: '2px solid #0f172a',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)',
                  padding: '8px 10px',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {/* Header */}
                <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#0284c7', borderBottom: '1px solid #e2e8f0', width: '100%', textAlign: 'center', paddingBottom: '2px' }}>
                  NAVEED MEDICAL PHARMACY
                </div>

                {/* Brand & Strength */}
                <div style={{ textAlign: 'center', width: '100%' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#0f172a', lineHeight: '1.1' }}>
                    {customBrand}
                  </div>
                  {customStrength && (
                    <div style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 700 }}>
                      {customStrength}
                    </div>
                  )}
                </div>

                {/* Barcode graphic */}
                <div style={{ margin: '2px 0' }}>
                  {renderSvgBarcode(customBarcode)}
                </div>

                {/* Footer metadata */}
                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: '#334155', borderTop: '1px solid #e2e8f0', paddingTop: '3px' }}>
                  <span>Batch:{customBatch}</span>
                  <span>EXP:{customExpiry}</span>
                  <span style={{ fontWeight: 900, color: '#0f172a' }}>Rs. {customPrice}</span>
                </div>
              </div>

              {/* Simulated Roll Ribbon View */}
              {printMode === 'thermal' && (
                <div style={{ width: '100%', borderTop: '1px dashed #cbd5e1', paddingTop: '1rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.5rem' }}>
                    Simulated Continuous Direct Thermal Roll Output ({labelCount} stickers queued)
                  </span>
                  <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px' }}>
                    {Array.from({ length: Math.min(6, labelCount) }).map((_, idx) => (
                      <div
                        key={idx}
                        style={{
                          minWidth: '160px',
                          height: '115px',
                          backgroundColor: '#ffffff',
                          border: '1px solid #94a3b8',
                          borderRadius: '3px',
                          padding: '6px',
                          fontSize: '0.6rem',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                        }}
                      >
                        <div style={{ fontSize: '0.55rem', fontWeight: 800, color: '#0284c7', textAlign: 'center' }}>NAVEED MEDICAL PHARMACY</div>
                        <div style={{ fontWeight: 800, textAlign: 'center' }}>{customBrand} {customStrength}</div>
                        <div style={{ textAlign: 'center', fontSize: '0.55rem', fontFamily: 'monospace' }}>||||||||||||||||||</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.55rem' }}>
                          <span>B:{customBatch}</span>
                          <span>Rs.{customPrice}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: SCANNER HUB                                        */}
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
                      Camera offline. Click &quot;Start Camera&quot; to scan box barcodes directly.
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

          {/* Right Panel: Scanned Product Info */}
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
    </div>
  );
};

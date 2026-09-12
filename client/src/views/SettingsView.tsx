import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  Save,
  RefreshCw,
  Building,
  Receipt,
  AlertTriangle,
  Printer,
  Barcode,
  FileSpreadsheet,
  Database,
  Download,
  Upload,
  CheckCircle2,
  Trash2,
  ShieldCheck,
  HardDrive
} from 'lucide-react';

interface BackupItem {
  filename: string;
  sizeBytes: number;
  sizeMb: number;
  createdAt: string;
}

interface BackupStats {
  dbSizeBytes: number;
  dbSizeMb: number;
  walSizeBytes: number;
  walSizeMb: number;
  tableCounts: {
    medicines: number;
    batches: number;
    sales: number;
    purchases: number;
    customers: number;
    auditLogs: number;
  };
  backupCount: number;
  lastBackup: BackupItem | null;
}

interface MedicineOption {
  id: number;
  brand_name: string;
  strength: string;
  dosage_form: string;
  barcode: string | null;
  custom_barcode?: string | null;
  batches?: {
    id: number;
    batch_number: string;
    expiry_date: string;
    sale_price: number;
    rack_location: string;
  }[];
}

export const SettingsView: React.FC = () => {
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'general' | 'hardware' | 'barcodes' | 'import' | 'backup'>('general');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Backup state (Phase 12)
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [backupStats, setBackupStats] = useState<BackupStats | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<Record<string, { verified: boolean; message: string }>>({});

  // Barcode Label state (Phase 11)
  const [medicines, setMedicines] = useState<MedicineOption[]>([]);
  const [selectedMedicineId, setSelectedMedicineId] = useState<number | ''>('');
  const [labelCopies, setLabelCopies] = useState<number>(10);
  const [labelColumns, setLabelColumns] = useState<number>(3);

  // CSV Import state (Phase 11)
  const [csvContent, setCsvContent] = useState<string>('');
  const [importResult, setImportResult] = useState<{ insertedCount?: number; errorCount?: number; message?: string } | null>(null);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBackups = async () => {
    try {
      const [listRes, statsRes] = await Promise.all([
        fetch('/api/backup/list', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/backup/stats', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      if (listRes.ok) {
        const data = await listRes.json();
        setBackups(data.backups || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setBackupStats(data);
      }
    } catch (err) {
      console.error('Error fetching backups:', err);
    }
  };

  const fetchMedicinesForLabels = async () => {
    try {
      const res = await fetch('/api/medicines?limit=100', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMedicines(data.medicines || []);
      }
    } catch (err) {
      console.error('Error fetching medicines for barcode labels:', err);
    }
  };

  useEffect(() => {
    fetchSettings();
    if (activeTab === 'backup' && user?.roleName === 'Admin') {
      fetchBackups();
    }
    if (activeTab === 'barcodes' && medicines.length === 0) {
      fetchMedicinesForLabels();
    }
  }, [token, activeTab, user]);

  const handleChange = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });

      if (res.ok) {
        setStatusMessage({ text: 'System settings saved and updated successfully.', type: 'success' });
      } else {
        setStatusMessage({ text: 'Failed to update system settings.', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Network error', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // Phase 12: Hot Backup Actions
  const handleCreateBackup = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/backup/create', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStatusMessage({ text: `Backup snapshot ${data.backup.filename} created successfully!`, type: 'success' });
        fetchBackups();
      } else {
        setStatusMessage({ text: 'Failed to create hot backup snapshot.', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Backup failed', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyBackup = async (filename: string) => {
    try {
      const res = await fetch(`/api/backup/verify/${filename}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setVerifyStatus(prev => ({
          ...prev,
          [filename]: {
            verified: data.verified,
            message: data.verified ? 'Integrity Verified (OK)' : 'Integrity Check Failed'
          }
        }));
      }
    } catch (err) {
      console.error('Error verifying backup:', err);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!confirm(`Are you sure you want to permanently delete backup ${filename}?`)) return;
    try {
      const res = await fetch(`/api/backup/${filename}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setStatusMessage({ text: `Backup ${filename} deleted.`, type: 'success' });
        fetchBackups();
      }
    } catch (err) {
      console.error('Error deleting backup:', err);
    }
  };

  // Phase 11: CSV Import
  const handleBulkImport = async () => {
    if (!csvContent.trim()) {
      setStatusMessage({ text: 'Please paste or load CSV content first.', type: 'error' });
      return;
    }
    setIsLoading(true);
    setImportResult(null);
    try {
      const res = await fetch('/api/integrations/bulk-import/medicines', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ csvContent })
      });
      const data = await res.json();
      if (res.ok) {
        setImportResult(data);
        setStatusMessage({
          text: `Bulk Import Complete: ${data.insertedCount} medicines inserted/updated, ${data.errorCount} errors.`,
          type: data.errorCount > 0 ? 'error' : 'success'
        });
      } else {
        setStatusMessage({ text: data.error || 'Failed to import CSV.', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Import error', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = event => {
        setCsvContent(event.target?.result as string || '');
      };
      reader.readAsText(file);
    }
  };

  const selectedMed = medicines.find(m => m.id === selectedMedicineId);

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Pharmacy & System Administration</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Configure store profile, thermal receipt formatting, barcode shelf labels, data sync, and hot SQLite backups.
          </p>
        </div>

        <button onClick={fetchSettings} className="btn btn-secondary btn-sm" disabled={isLoading}>
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          <span>Reload</span>
        </button>
      </div>

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setActiveTab('general')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.75rem 1.25rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.875rem',
            color: activeTab === 'general' ? 'var(--primary)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'general' ? '2px solid var(--primary)' : '2px solid transparent'
          }}
        >
          <Building size={16} />
          <span>Store & Identity</span>
        </button>

        <button
          onClick={() => setActiveTab('hardware')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.75rem 1.25rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.875rem',
            color: activeTab === 'hardware' ? 'var(--primary)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'hardware' ? '2px solid var(--primary)' : '2px solid transparent'
          }}
        >
          <Printer size={16} />
          <span>Thermal Printer & POS</span>
        </button>

        <button
          onClick={() => setActiveTab('barcodes')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.75rem 1.25rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.875rem',
            color: activeTab === 'barcodes' ? 'var(--primary)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'barcodes' ? '2px solid var(--primary)' : '2px solid transparent'
          }}
        >
          <Barcode size={16} />
          <span>Barcode Label Generator</span>
        </button>

        <button
          onClick={() => setActiveTab('import')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.75rem 1.25rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.875rem',
            color: activeTab === 'import' ? 'var(--primary)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'import' ? '2px solid var(--primary)' : '2px solid transparent'
          }}
        >
          <FileSpreadsheet size={16} />
          <span>Bulk CSV Import/Export</span>
        </button>

        {user?.roleName === 'Admin' && (
          <button
            onClick={() => setActiveTab('backup')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.75rem 1.25rem',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.875rem',
              color: activeTab === 'backup' ? 'var(--primary)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'backup' ? '2px solid var(--primary)' : '2px solid transparent'
            }}
          >
            <Database size={16} />
            <span>Resilience & Hot Backups</span>
          </button>
        )}
      </div>

      {statusMessage && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: statusMessage.type === 'success' ? 'var(--success-light)' : 'var(--danger-light)',
            color: statusMessage.type === 'success' ? 'var(--success-text)' : 'var(--danger-text)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.25rem',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          {statusMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* TAB 1: STORE & IDENTITY */}
      {activeTab === 'general' && (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card">
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Building size={18} style={{ color: 'var(--primary)' }} />
              <span>Pharmacy Brand & Contact Details</span>
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Pharmacy Trade Name</label>
                <input
                  className="input"
                  value={settings['pharmacy_name'] || ''}
                  onChange={e => handleChange('pharmacy_name', e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Contact Phone</label>
                <input
                  className="input"
                  value={settings['pharmacy_phone'] || ''}
                  onChange={e => handleChange('pharmacy_phone', e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Drug Sale License (DSL #)</label>
                <input
                  className="input"
                  placeholder="e.g. 05-352-0192-DSL"
                  value={settings['license_number'] || ''}
                  onChange={e => handleChange('license_number', e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>National Tax Number (NTN)</label>
                <input
                  className="input"
                  placeholder="e.g. 7482910-1"
                  value={settings['tax_number'] || ''}
                  onChange={e => handleChange('tax_number', e.target.value)}
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Physical Address</label>
                <input
                  className="input"
                  value={settings['pharmacy_address'] || ''}
                  onChange={e => handleChange('pharmacy_address', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={18} style={{ color: 'var(--warning)' }} />
              <span>Thresholds & Alert Triggers</span>
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Currency Symbol</label>
                <input
                  className="input"
                  value={settings['currency_symbol'] || ''}
                  onChange={e => handleChange('currency_symbol', e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Near-Expiry Alert (Days)</label>
                <input
                  type="number"
                  className="input"
                  value={settings['near_expiry_threshold_days'] || ''}
                  onChange={e => handleChange('near_expiry_threshold_days', e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Default Low Stock Warning</label>
                <input
                  type="number"
                  className="input"
                  value={settings['low_stock_threshold_default'] || ''}
                  onChange={e => handleChange('low_stock_threshold_default', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div>
            <button type="submit" className="btn btn-primary" disabled={isLoading} style={{ padding: '0.75rem 1.5rem' }}>
              <Save size={16} />
              <span>{isLoading ? 'Saving...' : 'Save Configuration'}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: HARDWARE & THERMAL PRINTER */}
      {activeTab === 'hardware' && (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card">
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Printer size={18} style={{ color: 'var(--primary)' }} />
              <span>ESC/POS Thermal Receipt Hardware</span>
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Paper Roll Width</label>
                <select
                  className="input"
                  value={settings['printer_paper_width'] || '80mm'}
                  onChange={e => handleChange('printer_paper_width', e.target.value)}
                >
                  <option value="80mm">80mm Standard POS Thermal (48 chars / line)</option>
                  <option value="58mm">58mm Compact POS Thermal (32 chars / line)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Printer Interface Mode</label>
                <select
                  className="input"
                  value={settings['printer_interface'] || 'USB'}
                  onChange={e => handleChange('printer_interface', e.target.value)}
                >
                  <option value="USB">Direct USB / Windows Print Spooler</option>
                  <option value="LAN">Network / LAN Raw Socket (Port 9100)</option>
                  <option value="BLUETOOTH">Bluetooth Serial (POS Mobile)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Automatic Cutter</label>
                <select
                  className="input"
                  value={settings['printer_auto_cut'] || 'true'}
                  onChange={e => handleChange('printer_auto_cut', e.target.value)}
                >
                  <option value="true">Enabled (Partial Cut \x1D\x56\x41\x00)</option>
                  <option value="false">Disabled (Manual Tear Bar)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Cash Drawer Kick Pulse</label>
                <select
                  className="input"
                  value={settings['cash_drawer_kick'] || 'true'}
                  onChange={e => handleChange('cash_drawer_kick', e.target.value)}
                >
                  <option value="true">Enabled on Cash Checkout (\x1B\x70\x00\x19\xFA)</option>
                  <option value="false">Disabled</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Printed Receipt Header Subtitle</label>
              <input
                className="input"
                placeholder="e.g. 24/7 Quality Healthcare & Genuine Medicines"
                value={settings['receipt_header_subtitle'] || ''}
                onChange={e => handleChange('receipt_header_subtitle', e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Printed Receipt Footer & Return Policy</label>
              <textarea
                className="input"
                rows={3}
                placeholder="Thank you for choosing NMP. Get well soon! Returns accepted within 3 days with original bill."
                value={settings['receipt_footer'] || ''}
                onChange={e => handleChange('receipt_footer', e.target.value)}
              />
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Receipt size={18} style={{ color: 'var(--success)' }} />
                <span>Thermal Receipt Live Format Preview</span>
              </h3>

              <button
                type="button"
                onClick={() => window.print()}
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, backgroundColor: 'var(--bg-app)', border: '1px solid var(--border)' }}
                title="Send test receipt directly to Speed-X 400UL or default thermal printer"
              >
                <Printer size={14} />
                <span>Print Test Receipt on Speed-X 400UL</span>
              </button>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {/* Receipt Preview Box / Print Area */}
              <div
                className="printable-receipt"
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  background: 'var(--bg-app)',
                  padding: '1.25rem',
                  borderRadius: 'var(--radius-md)',
                  width: settings['printer_paper_width'] === '58mm' ? '280px' : '360px',
                  border: '1px dashed var(--border)',
                  lineHeight: 1.4,
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '0.95rem' }}>
                  {settings['pharmacy_name'] || 'NAVEED MEDICAL PHARMACY'}
                </div>
                <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {settings['pharmacy_address'] || 'Main Bazar, Hospital Road, Gujranwala'}
                </div>
                <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Tel: {settings['pharmacy_phone'] || '0300-1112233'} | DSL: {settings['license_number'] || '05-352-DSL'}
                </div>
                <div style={{ borderTop: '1px dashed var(--border)', margin: '0.5rem 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                  <span>INV: #TEST-2026-0001</span>
                  <span>{new Date().toLocaleDateString()}</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Cashier: {user?.fullName || 'Admin'} • Counter 01
                </div>
                <div style={{ borderTop: '1px dashed var(--border)', margin: '0.5rem 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                  <span>ITEM</span>
                  <span>QTY x PRICE</span>
                  <span>TOTAL</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem' }}>
                  <span>Augmentin 625mg</span>
                  <span>2 x 28.50</span>
                  <span>Rs. 57.00</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                  <span>Panadol Extra 500mg</span>
                  <span>10 x 3.50</span>
                  <span>Rs. 35.00</span>
                </div>
                <div style={{ borderTop: '1px dashed var(--border)', margin: '0.5rem 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>NET PAYABLE:</span>
                  <span>Rs. 92.00</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                  <span>Cash Tendered:</span>
                  <span>Rs. 100.00</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600 }}>
                  <span>Change Due:</span>
                  <span>Rs. 8.00</span>
                </div>
                <div style={{ borderTop: '1px dashed var(--border)', margin: '0.5rem 0' }} />
                <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {settings['receipt_footer'] || 'Thank you for choosing NMP. Get well soon! Keep medicines below 30°C.'}
                </div>
                <div style={{ textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, marginTop: '0.25rem' }}>
                  *** SPEED-X 400UL HARDWARE VERIFIED ***
                </div>
              </div>

              {/* Speed-X 400UL Setup Guide Card */}
              <div style={{ flex: 1, minWidth: '280px', padding: '1rem', backgroundColor: 'var(--bg-app)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', fontSize: '0.8rem', lineHeight: 1.5 }}>
                <div style={{ fontWeight: 800, color: 'var(--primary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Printer size={15} />
                  <span>Speed-X 400UL Quick Configuration Checklist</span>
                </div>
                <ul style={{ paddingLeft: '1.2rem', color: 'var(--text-secondary)' }}>
                  <li><strong>Driver</strong>: Install the Speed-X / Xprinter 80mm driver via USB.</li>
                  <li><strong>Paper Width</strong>: Select <strong>80mm</strong> in settings above.</li>
                  <li><strong>Browser Print Dialogue</strong>:
                    <ul style={{ paddingLeft: '1rem', marginTop: '0.2rem' }}>
                      <li>Destination: Select <em>Speed-X 400UL</em> / <em>POS-80</em></li>
                      <li>Paper Size: <code>80mm x 297mm</code> or <code>Roll Paper 80 x Receipt</code></li>
                      <li>Margins: Set to <strong>None</strong></li>
                      <li>Options: Uncheck <em>Headers and footers</em></li>
                    </ul>
                  </li>
                  <li><strong>Auto-Cutter</strong>: Speed-X 400UL executes partial cut automatically upon sale completion.</li>
                </ul>
              </div>
            </div>
          </div>

          <div>
            <button type="submit" className="btn btn-primary" disabled={isLoading} style={{ padding: '0.75rem 1.5rem' }}>
              <Save size={16} />
              <span>{isLoading ? 'Saving...' : 'Save Hardware Configuration'}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: BARCODE LABELS GENERATOR */}
      {activeTab === 'barcodes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card">
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Barcode size={18} style={{ color: 'var(--primary)' }} />
              <span>Interactive Medicine Shelf Sticker & Barcode Sheet</span>
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '1rem', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Select Medicine</label>
                <select
                  className="input"
                  value={selectedMedicineId}
                  onChange={e => {
                    const id = e.target.value ? Number(e.target.value) : '';
                    setSelectedMedicineId(id);
                  }}
                >
                  <option value="">-- Choose Medicine --</option>
                  {medicines.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.brand_name} {m.strength} ({m.dosage_form})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Sticker Copies</label>
                <input
                  type="number"
                  className="input"
                  min={1}
                  max={100}
                  value={labelCopies}
                  onChange={e => setLabelCopies(parseInt(e.target.value, 10) || 1)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Sheet Grid Columns</label>
                <select
                  className="input"
                  value={labelColumns}
                  onChange={e => setLabelColumns(Number(e.target.value))}
                >
                  <option value={2}>2 Stickers / Row (Large 50x30mm)</option>
                  <option value={3}>3 Stickers / Row (Standard 38x25mm)</option>
                  <option value={4}>4 Stickers / Row (Small Vial 25x15mm)</option>
                </select>
              </div>

              <div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => window.print()}
                  style={{ width: '100%', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                  <Printer size={16} />
                  <span>Print Sticker Sheet</span>
                </button>
              </div>
            </div>
          </div>

          {/* Printable Barcode Sheet Preview */}
          <div className="card">
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-secondary)' }}>
              Sticker Sheet Layout Preview ({labelCopies} labels, {labelColumns} per row)
            </h4>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${labelColumns}, 1fr)`,
                gap: '0.75rem',
                padding: '1rem',
                background: 'var(--bg-app)',
                borderRadius: 'var(--radius-md)',
                maxHeight: '450px',
                overflowY: 'auto'
              }}
            >
              {Array.from({ length: labelCopies }).map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    background: '#ffffff',
                    border: '1px dashed #94a3b8',
                    padding: '0.6rem 0.75rem',
                    borderRadius: '4px',
                    color: '#0f172a',
                    fontFamily: 'sans-serif',
                    fontSize: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '100px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', fontWeight: 700, color: '#0284c7' }}>
                    <span>{settings['pharmacy_name'] || 'NAVEED MEDICAL PHARMACY'}</span>
                    <span>Rs. 185.00</span>
                  </div>

                  <div style={{ fontWeight: 800, fontSize: '0.85rem', margin: '0.2rem 0' }}>
                    {selectedMed ? `${selectedMed.brand_name} ${selectedMed.strength}` : 'Panadol 500mg (Tablet)'}
                  </div>

                  {/* SVG Barcode Graphic Mock */}
                  <div style={{ textAlign: 'center', margin: '0.25rem 0' }}>
                    <svg viewBox="0 0 160 35" width="100%" height="28">
                      {/* Barcode bars simulation */}
                      <rect x="5" y="0" width="3" height="30" fill="#000" />
                      <rect x="11" y="0" width="2" height="30" fill="#000" />
                      <rect x="16" y="0" width="4" height="30" fill="#000" />
                      <rect x="23" y="0" width="1" height="30" fill="#000" />
                      <rect x="27" y="0" width="3" height="30" fill="#000" />
                      <rect x="33" y="0" width="2" height="30" fill="#000" />
                      <rect x="38" y="0" width="4" height="30" fill="#000" />
                      <rect x="45" y="0" width="2" height="30" fill="#000" />
                      <rect x="50" y="0" width="3" height="30" fill="#000" />
                      <rect x="56" y="0" width="1" height="30" fill="#000" />
                      <rect x="60" y="0" width="3" height="30" fill="#000" />
                      <rect x="66" y="0" width="4" height="30" fill="#000" />
                      <rect x="73" y="0" width="2" height="30" fill="#000" />
                      <rect x="78" y="0" width="2" height="30" fill="#000" />
                      <rect x="83" y="0" width="4" height="30" fill="#000" />
                      <rect x="90" y="0" width="2" height="30" fill="#000" />
                      <rect x="95" y="0" width="3" height="30" fill="#000" />
                      <rect x="101" y="0" width="2" height="30" fill="#000" />
                      <rect x="106" y="0" width="4" height="30" fill="#000" />
                      <rect x="113" y="0" width="2" height="30" fill="#000" />
                      <rect x="118" y="0" width="3" height="30" fill="#000" />
                      <rect x="124" y="0" width="1" height="30" fill="#000" />
                      <rect x="128" y="0" width="4" height="30" fill="#000" />
                      <rect x="135" y="0" width="2" height="30" fill="#000" />
                      <rect x="140" y="0" width="3" height="30" fill="#000" />
                      <rect x="146" y="0" width="2" height="30" fill="#000" />
                      <rect x="151" y="0" width="3" height="30" fill="#000" />
                    </svg>
                    <div style={{ fontSize: '0.65rem', letterSpacing: '2px', fontFamily: 'monospace' }}>
                      {selectedMed?.barcode || selectedMed?.custom_barcode || `NMP-${String(selectedMed?.id || 1).padStart(5, '0')}`}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: '#64748b' }}>
                    <span>BATCH: B-2026A</span>
                    <span>EXP: 12/2027</span>
                    <span>RACK: A-1</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: BULK CSV IMPORT & EXPORT */}
      {activeTab === 'import' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card">
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileSpreadsheet size={18} style={{ color: 'var(--primary)' }} />
              <span>Bulk CSV Master Data Import & Templates</span>
            </h3>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Quickly import catalog medicines or batch inventories using standard CSV spreadsheets. If barcodes exist, records are automatically updated.
            </p>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
              <a
                href="/api/integrations/sample-csv/medicines"
                download="nmp_sample_medicines.csv"
                className="btn btn-secondary"
                style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <Download size={14} />
                <span>Download Medicines CSV Template</span>
              </a>

              <a
                href="/api/integrations/sample-csv/batches"
                download="nmp_sample_batches.csv"
                className="btn btn-secondary"
                style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <Download size={14} />
                <span>Download Batches CSV Template</span>
              </a>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Upload .CSV File
              </label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                style={{ display: 'block', fontSize: '0.85rem' }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Or Paste Raw CSV Data (Header: brand_name,generic_name,strength,dosage_form,barcode,rack_location,pack_size)
              </label>
              <textarea
                className="input"
                rows={6}
                value={csvContent}
                onChange={e => setCsvContent(e.target.value)}
                placeholder="brand_name,generic_name,strength,dosage_form,barcode,rack_location,pack_size&#10;Disprin Extra,Aspirin,300mg,Tablet,896400099991,Rack A-4,100"
                style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleBulkImport}
                disabled={isLoading || !csvContent.trim()}
                style={{ padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <Upload size={16} />
                <span>{isLoading ? 'Importing CSV Records...' : 'Execute Bulk Import'}</span>
              </button>

              {importResult && (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Inserted: <strong>{importResult.insertedCount}</strong> | Errors: <strong>{importResult.errorCount}</strong>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: RESILIENCE & HOT BACKUPS (PHASE 12) */}
      {activeTab === 'backup' && user?.roleName === 'Admin' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Database Health Metrics */}
          {backupStats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.75rem', borderRadius: 'var(--radius-md)', background: 'var(--primary-light)', color: 'var(--primary)' }}>
                  <HardDrive size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>PRIMARY DATABASE</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{backupStats.dbSizeMb} MB</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>WAL Cache: {backupStats.walSizeMb} MB</div>
                </div>
              </div>

              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.75rem', borderRadius: 'var(--radius-md)', background: 'var(--success-light)', color: 'var(--success)' }}>
                  <Database size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL MEDICINES & BATCHES</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                    {backupStats.tableCounts.medicines} / {backupStats.tableCounts.batches}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Active Inventory Records</div>
                </div>
              </div>

              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.75rem', borderRadius: 'var(--radius-md)', background: 'var(--warning-light)', color: 'var(--warning)' }}>
                  <Receipt size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>SALES & PURCHASES</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                    {backupStats.tableCounts.sales} / {backupStats.tableCounts.purchases}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Ledger Invoices</div>
                </div>
              </div>

              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.75rem', borderRadius: 'var(--radius-md)', background: 'var(--primary-light)', color: 'var(--primary)' }}>
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>BACKUP SNAPSHOTS</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{backupStats.backupCount} Available</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Audit Trail: {backupStats.tableCounts.auditLogs} events</div>
                </div>
              </div>
            </div>
          )}

          {/* Backup Action Bar */}
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Instant Live Hot Backup Snapshot</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Takes a non-blocking SQLite hot snapshot of the active WAL database without interrupting POS billing or cashier operations.
              </p>
            </div>

            <button
              onClick={handleCreateBackup}
              disabled={isLoading}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem' }}
            >
              <Database size={16} />
              <span>{isLoading ? 'Creating Snapshot...' : 'Create Hot Backup Now'}</span>
            </button>
          </div>

          {/* Backups Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Stored Backup Snapshots</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{backups.length} Total Snapshots</span>
            </div>

            {backups.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                No backup snapshots found. Click &quot;Create Hot Backup Now&quot; to generate your first backup.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '0.75rem 1.25rem' }}>Snapshot Filename</th>
                    <th style={{ padding: '0.75rem 1.25rem' }}>File Size</th>
                    <th style={{ padding: '0.75rem 1.25rem' }}>Creation Timestamp</th>
                    <th style={{ padding: '0.75rem 1.25rem' }}>Integrity Status</th>
                    <th style={{ padding: '0.75rem 1.25rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map(b => (
                    <tr key={b.filename} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem 1.25rem', fontWeight: 600, fontFamily: 'monospace' }}>
                        {b.filename}
                      </td>
                      <td style={{ padding: '0.75rem 1.25rem' }}>{b.sizeMb} MB</td>
                      <td style={{ padding: '0.75rem 1.25rem', color: 'var(--text-muted)' }}>
                        {new Date(b.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem 1.25rem' }}>
                        {verifyStatus[b.filename] ? (
                          <span
                            style={{
                              padding: '0.2rem 0.5rem',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              background: verifyStatus[b.filename].verified ? 'var(--success-light)' : 'var(--danger-light)',
                              color: verifyStatus[b.filename].verified ? 'var(--success-text)' : 'var(--danger-text)'
                            }}
                          >
                            {verifyStatus[b.filename].message}
                          </span>
                        ) : (
                          <button
                            onClick={() => handleVerifyBackup(b.filename)}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
                          >
                            <ShieldCheck size={13} />
                            <span>Verify PRAGMA</span>
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1.25rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                          <a
                            href={`/api/backup/download/${b.filename}`}
                            download={b.filename}
                            className="btn btn-secondary btn-sm"
                            title="Download Snapshot to local computer"
                          >
                            <Download size={14} />
                            <span>Download</span>
                          </a>

                          <button
                            onClick={() => handleDeleteBackup(b.filename)}
                            className="btn btn-sm"
                            style={{ background: 'var(--danger-light)', color: 'var(--danger-text)', border: 'none' }}
                            title="Delete snapshot"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

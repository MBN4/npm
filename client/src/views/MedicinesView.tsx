import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { TherapeuticCategorySelect } from '../components/TherapeuticCategorySelect.js';
import { PRODUCT_CATEGORIES, getSubcategories } from '../utils/productCatalog.js';
import { getProductPackaging } from '../utils/productPackaging.js';
import {
  Pill,
  Search,
  Plus,
  AlertTriangle,
  MapPin,
  RefreshCw,
  X,
  Barcode,
  Printer,
  Sparkles
} from 'lucide-react';

export interface Medicine {
  id: number;
  brand_name: string;
  generic_name?: string;
  category_name?: string;
  manufacturer_name?: string;
  strength?: string;
  dosage_form?: string;
  pack_size: number;
  barcode?: string;
  custom_barcode?: string;
  rack_location?: string;
  min_stock_level: number;
  reorder_level: number;
  is_prescription_required: number;
  is_active: number;
  available_stock: number;
  expired_stock: number;
  current_sale_price?: number;
}

export const MedicinesView: React.FC = () => {
  const { token, hasPermission } = useAuth();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string; description?: string }[]>([]);
  const [generics, setGenerics] = useState<{ id: number; name: string }[]>([]);
  const [manufacturers, setManufacturers] = useState<{ id: number; name: string }[]>([]);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Barcode sticker print state
  const [stickerMed, setStickerMed] = useState<Medicine | null>(null);
  const [stickerCopies, setStickerCopies] = useState<number>(4);
  const [stickerSize, setStickerSize] = useState<'standard' | 'shelf' | 'vial'>('standard');

  // New medicine form state
  const [newMed, setNewMed] = useState({
    brandName: '',
    genericId: '',
    categoryId: '',
    manufacturerId: '',
    strength: '',
    dosageForm: 'Tablet',
    therapeuticClass: '',
    packSize: '1',
    barcode: '',
    customBarcode: '',
    rackLocation: '',
    minStockLevel: '10',
    reorderLevel: '20',
    isPrescriptionRequired: false,
    notes: ''
  });

  const fetchMedicines = async () => {
    setIsLoading(true);
    try {
      let url = `/api/medicines?search=${encodeURIComponent(search)}`;
      if (selectedCategory) url += `&categoryId=${selectedCategory}`;
      if (lowStockFilter) url += `&lowStock=true`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMedicines(data.medicines);
      }
    } catch (err) {
      console.error('Error fetching medicines:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMetadata = async () => {
    try {
      const [catRes, genRes, mfgRes] = await Promise.all([
        fetch('/api/catalog/categories', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/catalog/generics', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/catalog/manufacturers', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (catRes.ok) setCategories((await catRes.json()).categories);
      if (genRes.ok) setGenerics((await genRes.json()).generics);
      if (mfgRes.ok) setManufacturers((await mfgRes.json()).manufacturers);
    } catch (err) {
      console.error('Error fetching catalog metadata:', err);
    }
  };

  useEffect(() => {
    fetchMedicines();
    fetchMetadata();
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMedicines();
    }, 250);
    return () => clearTimeout(timer);
  }, [search, selectedCategory, lowStockFilter]);

  const handleCreateMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!newMed.brandName.trim()) {
      setFormError('Brand name is required');
      return;
    }

    try {
      const selectedCategoryName = categories.find(category => String(category.id) === newMed.categoryId)?.name || '';
      const packaging = getProductPackaging(newMed.dosageForm, null, selectedCategoryName);
      const res = await fetch('/api/medicines', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          brandName: newMed.brandName.trim(),
          genericId: newMed.genericId ? Number(newMed.genericId) : null,
          categoryId: newMed.categoryId ? Number(newMed.categoryId) : null,
          manufacturerId: newMed.manufacturerId ? Number(newMed.manufacturerId) : null,
          strength: newMed.strength.trim(),
          dosageForm: newMed.dosageForm,
          therapeuticClass: newMed.therapeuticClass.trim(),
          stockUnit: packaging.unit,
          packagingType: packaging.packagingType,
          packSize: Number(newMed.packSize) || 1,
          barcode: newMed.barcode.trim() || null,
          customBarcode: newMed.customBarcode.trim() || null,
          rackLocation: newMed.rackLocation.trim() || null,
          minStockLevel: Number(newMed.minStockLevel) || 10,
          reorderLevel: Number(newMed.reorderLevel) || 20,
          isPrescriptionRequired: newMed.isPrescriptionRequired,
          notes: newMed.notes.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Failed to create medicine');
        return;
      }

      setFormSuccess('Medicine added successfully to catalog');
      setShowAddModal(false);
      setNewMed({
        brandName: '',
        genericId: '',
        categoryId: '',
        manufacturerId: '',
        strength: '',
        dosageForm: 'Tablet',
        therapeuticClass: '',
        packSize: '1',
        barcode: '',
        customBarcode: '',
        rackLocation: '',
        minStockLevel: '10',
        reorderLevel: '20',
        isPrescriptionRequired: false,
        notes: ''
      });
      fetchMedicines();
    } catch (err: any) {
      setFormError(err.message || 'Network error');
    }
  };

  return (
    <div className="page-container">
      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Medicine Master Catalog</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Total Registered Products: <strong>{medicines.length}</strong> • Fast Barcode & Generic Search
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={fetchMedicines} className="btn btn-secondary btn-sm" title="Refresh List">
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          {hasPermission('manage_medicines') && (
            <button onClick={() => setShowAddModal(true)} className="btn btn-primary btn-sm">
              <Plus size={16} />
              <span>Add Medicine (F2)</span>
            </button>
          )}
        </div>
      </div>

      {formSuccess && (
        <div style={{ padding: '0.75rem 1rem', background: 'var(--success-light)', color: 'var(--success-text)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.85rem' }}>
          {formSuccess}
        </div>
      )}

      {/* Filter Bar */}
      <div className="card" style={{ marginBottom: '1.25rem', padding: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
            <input
              type="text"
              className="input"
              placeholder="Search by brand name, generic/salt, barcode, or shelf..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: '2.4rem' }}
            />
            <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          </div>

          <div style={{ width: '200px' }}>
            <select
              className="select"
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <button
              onClick={() => setLowStockFilter(!lowStockFilter)}
              className={`btn btn-sm ${lowStockFilter ? 'btn-danger' : 'btn-secondary'}`}
            >
              <AlertTriangle size={14} />
              <span>Low Stock Filter</span>
            </button>
          </div>
        </div>
      </div>

      {/* Medicines Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-container" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Brand Name & Strength</th>
                <th>Generic Composition</th>
                <th>Category</th>
                <th>Manufacturer</th>
                <th>Barcode / SKU</th>
                <th>Rack / Shelf</th>
                <th>Stock Status</th>
                <th>Retail Price</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {medicines.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No medicines match the search criteria.
                  </td>
                </tr>
              ) : (
                medicines.map(m => {
                  const isLow = m.available_stock <= m.reorder_level;
                  return (
                    <tr key={m.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          {m.brand_name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {m.dosage_form} • {m.strength || 'N/A'} {m.is_prescription_required ? <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>Rx Required</span> : null}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 500 }}>{m.generic_name || '—'}</span>
                      </td>
                      <td>
                        <span className="category-capsule">{m.category_name || 'General'}</span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {m.manufacturer_name || '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {m.barcode && (
                            <code style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }} title="Manufacturer EAN-13">
                              {m.barcode}
                            </code>
                          )}
                          {m.custom_barcode && (
                            <span
                              className="sku-capsule"
                              title="Internal Store Barcode"
                            >
                              🏷️ {m.custom_barcode}
                            </span>
                          )}
                          {!m.barcode && !m.custom_barcode && (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>—</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="rack-pill">
                          <MapPin size={12} style={{ color: 'var(--primary)' }} />
                          <span>{m.rack_location || 'Unassigned'}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <span className={`badge ${isLow ? 'badge-danger' : 'badge-success'}`}>
                            {m.available_stock} Units {isLow ? '• LOW' : ''}
                          </span>
                          {m.expired_stock > 0 && (
                            <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>
                              {m.expired_stock} Expired (Blocked)
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        {m.current_sale_price ? `Rs. ${Number(m.current_sale_price).toFixed(2)}` : 'No Active Batch'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => { setStickerMed(m); setStickerCopies(4); }}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                          title="Print Barcode Shelf / Box Stickers"
                        >
                          <Barcode size={13} style={{ color: 'var(--primary)' }} />
                          <span>Sticker</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Medicine Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Pill size={20} style={{ color: 'var(--primary)' }} />
                <span>Register New Medicine</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.3rem' }}>
                <X size={16} />
              </button>
            </div>

            {formError && (
              <div style={{ margin: '1rem 1.5rem 0', padding: '0.75rem', background: 'var(--danger-light)', color: 'var(--danger-text)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateMedicine} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Main Category *</label>
                  <select
                    className="select"
                    value={newMed.categoryId}
                    onChange={e => {
                      const categoryId = e.target.value;
                      const categoryName = categories.find(category => String(category.id) === categoryId)?.name || '';
                      setNewMed({ ...newMed, categoryId, dosageForm: getSubcategories(categoryName)[0] || '' });
                    }}
                    required
                  >
                    <option value="">Select Main Category</option>
                    {PRODUCT_CATEGORIES.map(definition => {
                      const category = categories.find(item => item.name === definition.name);
                      return category ? <option key={category.id} value={category.id}>{definition.name}</option> : null;
                    })}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Subcategory / Product Type *</label>
                  <select
                    className="select"
                    value={newMed.dosageForm}
                    onChange={e => setNewMed({ ...newMed, dosageForm: e.target.value })}
                    disabled={!newMed.categoryId}
                    required
                  >
                    <option value="">Select Product Type</option>
                    {getSubcategories(categories.find(category => String(category.id) === newMed.categoryId)?.name || '').map(subcategory => (
                      <option key={subcategory} value={subcategory}>{subcategory}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Therapeutic Class</label>
                <TherapeuticCategorySelect
                  value={newMed.therapeuticClass}
                  onChange={therapeuticClass => setNewMed({ ...newMed, therapeuticClass })}
                  placeholder="e.g. Analgesic/Antipyretic, Antibiotic, NSAID"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Brand Name *</label>
                  <input
                    className="input"
                    placeholder="e.g. Panadol Extra"
                    value={newMed.brandName}
                    onChange={e => setNewMed({ ...newMed, brandName: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Strength</label>
                  <input
                    className="input"
                    placeholder="e.g. 500mg, 10mg"
                    value={newMed.strength}
                    onChange={e => setNewMed({ ...newMed, strength: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Generic / Salt</label>
                  <select
                    className="select"
                    value={newMed.genericId}
                    onChange={e => setNewMed({ ...newMed, genericId: e.target.value })}
                  >
                    <option value="">Select Generic Salt</option>
                    {generics.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Manufacturer</label>
                  <select
                    className="select"
                    value={newMed.manufacturerId}
                    onChange={e => setNewMed({ ...newMed, manufacturerId: e.target.value })}
                  >
                    <option value="">Select Manufacturer</option>
                    {manufacturers.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Manufacturer Barcode (EAN)</label>
                  </div>
                  <input
                    className="input"
                    placeholder="Scan or enter box barcode"
                    value={newMed.barcode}
                    onChange={e => setNewMed({ ...newMed, barcode: e.target.value })}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Custom Store Barcode</label>
                    <button
                      type="button"
                      onClick={() => {
                        const code = `NMP-${Math.floor(100000 + Math.random() * 900000)}`;
                        setNewMed({ ...newMed, customBarcode: code });
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '0.1rem 0.4rem', fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                      title="Generate unique custom barcode"
                    >
                      <Sparkles size={11} style={{ color: 'var(--primary)' }} />
                      <span>Auto-Generate</span>
                    </button>
                  </div>
                  <input
                    className="input"
                    placeholder="e.g. NMP-849201"
                    value={newMed.customBarcode}
                    onChange={e => setNewMed({ ...newMed, customBarcode: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Rack Location</label>
                  <input
                    className="input"
                    placeholder="e.g. Shelf A-2"
                    value={newMed.rackLocation}
                    onChange={e => setNewMed({ ...newMed, rackLocation: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Min Stock Level</label>
                  <input
                    type="number"
                    className="input"
                    value={newMed.minStockLevel}
                    onChange={e => setNewMed({ ...newMed, minStockLevel: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Reorder Level</label>
                  <input
                    type="number"
                    className="input"
                    value={newMed.reorderLevel}
                    onChange={e => setNewMed({ ...newMed, reorderLevel: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <input
                  type="checkbox"
                  id="rxReq"
                  checked={newMed.isPrescriptionRequired}
                  onChange={e => setNewMed({ ...newMed, isPrescriptionRequired: e.target.checked })}
                />
                <label htmlFor="rxReq" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  Prescription (Rx) Required for Dispensing
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Medicine
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Barcode Sticker Print Modal */}
      {stickerMed && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Barcode size={22} style={{ color: 'var(--primary)' }} />
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                    Print Barcode Sticker
                  </h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {stickerMed.brand_name} {stickerMed.strength} ({stickerMed.dosage_form})
                  </div>
                </div>
              </div>
              <button onClick={() => setStickerMed(null)} className="btn btn-secondary btn-sm" style={{ padding: '0.3rem' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Controls */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '1rem', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Number of Copies</label>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    max={50}
                    value={stickerCopies}
                    onChange={e => setStickerCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Sticker Size</label>
                  <select
                    className="select"
                    value={stickerSize}
                    onChange={e => setStickerSize(e.target.value as any)}
                  >
                    <option value="standard">Standard (38 x 25 mm)</option>
                    <option value="shelf">Shelf Tag (50 x 30 mm)</option>
                    <option value="vial">Small Vial / Strip (25 x 15 mm)</option>
                  </select>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="btn btn-primary"
                    style={{ height: '38px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    <Printer size={16} />
                    <span>Print Now</span>
                  </button>
                </div>
              </div>

              {/* Live Preview Area */}
              <div style={{ border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem', backgroundColor: 'var(--bg-card)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Sticker Print Preview ({stickerCopies} {stickerCopies === 1 ? 'copy' : 'copies'})
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', maxHeight: '280px', overflowY: 'auto', padding: '0.25rem' }}>
                  {Array.from({ length: stickerCopies }).map((_, idx) => {
                    const code = stickerMed.barcode || stickerMed.custom_barcode || `NMP-${stickerMed.id.toString().padStart(6, '0')}`;
                    return (
                      <div
                        key={idx}
                        style={{
                          backgroundColor: '#ffffff',
                          color: '#000000',
                          padding: '0.6rem',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e1',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          textAlign: 'center',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                        }}
                      >
                        <div style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#0f172a' }}>
                          Naveed Medical Pharmacy
                        </div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, marginTop: '2px', color: '#1e293b' }}>
                          {stickerMed.brand_name} {stickerMed.strength}
                        </div>
                        <div style={{ fontSize: '0.6rem', color: '#64748b' }}>
                          {stickerMed.generic_name || stickerMed.dosage_form}
                        </div>

                        {/* Barcode Graphic Simulation */}
                        <div style={{ margin: '0.35rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <svg width="130" height="26" viewBox="0 0 130 26">
                            <rect x="0" y="0" width="2" height="26" fill="#000" />
                            <rect x="4" y="0" width="1" height="26" fill="#000" />
                            <rect x="7" y="0" width="3" height="26" fill="#000" />
                            <rect x="12" y="0" width="2" height="26" fill="#000" />
                            <rect x="16" y="0" width="4" height="26" fill="#000" />
                            <rect x="22" y="0" width="1" height="26" fill="#000" />
                            <rect x="25" y="0" width="3" height="26" fill="#000" />
                            <rect x="30" y="0" width="2" height="26" fill="#000" />
                            <rect x="34" y="0" width="4" height="26" fill="#000" />
                            <rect x="40" y="0" width="2" height="26" fill="#000" />
                            <rect x="44" y="0" width="3" height="26" fill="#000" />
                            <rect x="49" y="0" width="1" height="26" fill="#000" />
                            <rect x="52" y="0" width="3" height="26" fill="#000" />
                            <rect x="57" y="0" width="4" height="26" fill="#000" />
                            <rect x="63" y="0" width="2" height="26" fill="#000" />
                            <rect x="67" y="0" width="2" height="26" fill="#000" />
                            <rect x="71" y="0" width="4" height="26" fill="#000" />
                            <rect x="77" y="0" width="2" height="26" fill="#000" />
                            <rect x="81" y="0" width="3" height="26" fill="#000" />
                            <rect x="86" y="0" width="2" height="26" fill="#000" />
                            <rect x="90" y="0" width="4" height="26" fill="#000" />
                            <rect x="96" y="0" width="2" height="26" fill="#000" />
                            <rect x="100" y="0" width="3" height="26" fill="#000" />
                            <rect x="105" y="0" width="1" height="26" fill="#000" />
                            <rect x="108" y="0" width="4" height="26" fill="#000" />
                            <rect x="114" y="0" width="2" height="26" fill="#000" />
                            <rect x="118" y="0" width="3" height="26" fill="#000" />
                            <rect x="123" y="0" width="2" height="26" fill="#000" />
                            <rect x="127" y="0" width="3" height="26" fill="#000" />
                          </svg>
                          <div style={{ fontSize: '0.65rem', letterSpacing: '1.5px', fontFamily: 'monospace', fontWeight: 700, marginTop: '1px' }}>
                            {code}
                          </div>
                        </div>

                        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', fontWeight: 700, color: '#0f172a', borderTop: '1px dashed #cbd5e1', paddingTop: '3px' }}>
                          <span>{stickerMed.current_sale_price ? `Rs. ${Number(stickerMed.current_sale_price).toFixed(2)}` : 'MRP'}</span>
                          <span>{stickerMed.rack_location ? `RACK: ${stickerMed.rack_location}` : 'A-1'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Scannable with standard 1D/2D USB & Bluetooth POS barcode scanners.
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => setStickerMed(null)} className="btn btn-secondary">
                    Close
                  </button>
                  <button onClick={() => window.print()} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Printer size={16} />
                    <span>Print ({stickerCopies})</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

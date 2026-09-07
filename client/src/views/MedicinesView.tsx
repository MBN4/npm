import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  Pill,
  Search,
  Plus,
  AlertTriangle,
  MapPin,
  RefreshCw,
  X
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
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [generics, setGenerics] = useState<{ id: number; name: string }[]>([]);
  const [manufacturers, setManufacturers] = useState<{ id: number; name: string }[]>([]);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // New medicine form state
  const [newMed, setNewMed] = useState({
    brandName: '',
    genericId: '',
    categoryId: '',
    manufacturerId: '',
    strength: '',
    dosageForm: 'Tablet',
    packSize: '1',
    barcode: '',
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
          packSize: Number(newMed.packSize) || 1,
          barcode: newMed.barcode.trim() || null,
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
        packSize: '1',
        barcode: '',
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
              </tr>
            </thead>
            <tbody>
              {medicines.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
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
                        <span className="badge badge-primary">{m.category_name || 'General'}</span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {m.manufacturer_name || '—'}
                      </td>
                      <td>
                        <code style={{ fontSize: '0.78rem' }}>{m.barcode || m.custom_barcode || '—'}</code>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem' }}>
                          <MapPin size={13} style={{ color: 'var(--primary)' }} />
                          <span>{m.rack_location || 'Unassigned'}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <span className={`badge ${isLow ? 'badge-danger' : 'badge-success'}`}>
                            {m.available_stock} Units {isLow && '• Low'}
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
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Dosage Form</label>
                  <select
                    className="select"
                    value={newMed.dosageForm}
                    onChange={e => setNewMed({ ...newMed, dosageForm: e.target.value })}
                  >
                    <option value="Tablet">Tablet</option>
                    <option value="Capsule">Capsule</option>
                    <option value="Syrup">Syrup</option>
                    <option value="Suspension">Suspension</option>
                    <option value="Injection">Injection</option>
                    <option value="Cream/Ointment">Cream / Ointment</option>
                    <option value="Inhaler">Inhaler</option>
                    <option value="Eye/Ear Drops">Eye / Ear Drops</option>
                  </select>
                </div>
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
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Category</label>
                  <select
                    className="select"
                    value={newMed.categoryId}
                    onChange={e => setNewMed({ ...newMed, categoryId: e.target.value })}
                  >
                    <option value="">Select Category</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Barcode / EAN</label>
                  <input
                    className="input"
                    placeholder="Scan or enter"
                    value={newMed.barcode}
                    onChange={e => setNewMed({ ...newMed, barcode: e.target.value })}
                  />
                </div>
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
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { MedPracCategory } from '../types/medprac.js';
import { medpracService } from '../services/medpracService.js';

interface MedPracCategoryAdminModalProps {
  categories: MedPracCategory[];
  onClose: () => void;
  onRefresh: () => void;
}

export const MedPracCategoryAdminModal: React.FC<MedPracCategoryAdminModalProps> = ({
  categories: activeCategories,
  onClose,
  onRefresh
}) => {
  // The admin list must include disabled categories too (so "Enable" is actually reachable),
  // unlike the active-only list the rest of the app uses for the New Entry dropdown.
  const [categories, setCategories] = useState<MedPracCategory[]>(activeCategories);
  const [editingCat, setEditingCat] = useState<Partial<MedPracCategory> | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const loadAllCategories = async () => {
    const all = await medpracService.getCategories(true);
    setCategories(all);
  };

  useEffect(() => {
    loadAllCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartEdit = (cat?: MedPracCategory) => {
    if (cat) {
      setEditingCat(cat);
      setName(cat.name);
      setDescription(cat.description || '');
    } else {
      setEditingCat({ sort_order: categories.length + 1, is_active: 1 });
      setName('');
      setDescription('');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await medpracService.saveCategory({
        id: editingCat?.id,
        name: name.trim(),
        description: description.trim() || null,
        sort_order: editingCat?.sort_order || categories.length + 1,
        is_active: editingCat?.is_active !== undefined ? editingCat.is_active : 1
      });
      setEditingCat(null);
      setName('');
      setDescription('');
      await loadAllCategories();
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to save category');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (cat: MedPracCategory) => {
    try {
      await medpracService.saveCategory({
        ...cat,
        is_active: cat.is_active === 1 ? 0 : 1
      });
      await loadAllCategories();
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to update category');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '600px',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, var(--primary) 0%, #2563eb 100%)',
            color: '#fff'
          }}
        >
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
            Manage Therapeutic Categories
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1 }}>
          {editingCat ? (
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
              <h4 style={{ margin: 0, color: 'var(--primary)' }}>{editingCat.id ? 'Edit Category' : 'Add New Category'}</h4>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Category Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Pediatrics, Ophthalmology, Hypertension..."
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short explanation..."
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setEditingCat(null)} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem' }}>Cancel</button>
                <button type="submit" disabled={loading} className="btn btn-primary" style={{ padding: '0.4rem 0.8rem' }}>Save Category</button>
              </div>
            </form>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <button onClick={() => handleStartEdit()} className="btn btn-primary" style={{ padding: '0.45rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Plus size={16} /> Add Category
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {categories.map((c) => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.65rem 0.85rem',
                  backgroundColor: c.is_active ? 'var(--bg-surface)' : 'var(--bg-app)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: c.is_active ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {c.name} {!c.is_active && <span style={{ fontSize: '0.75rem', color: 'var(--danger)', marginLeft: '6px' }}>(Disabled)</span>}
                  </div>
                  {c.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{c.description}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <button onClick={() => handleStartEdit(c)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
                    Edit
                  </button>
                  <button onClick={() => handleToggleActive(c)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: c.is_active ? 'var(--danger)' : 'var(--success-text)' }}>
                    {c.is_active ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>Done</button>
        </div>
      </div>
    </div>
  );
};

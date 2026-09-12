import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  BookOpen,
  Search,
  Pill,
  ShieldAlert,
  Baby,
  Utensils,
  AlertTriangle,
  Layers,
  ChevronRight,
  FileCheck
} from 'lucide-react';

interface DictionaryEntry {
  generic_id: number;
  generic_name: string;
  therapeutic_class: string;
  generic_description?: string;
  pregnancy_category?: string;
  lactation_safety?: string;
  adult_dosage?: string;
  pediatric_dosage?: string;
  food_instructions?: string;
  hepatic_renal_precautions?: string;
  common_side_effects?: string;
  brands: any[];
  brandCount: number;
}

export const PharmaDictionaryView: React.FC = () => {
  const { token } = useAuth();
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<DictionaryEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const therapeuticClasses = [
    'All Classes',
    'Analgesic / Antipyretic',
    'Broad Spectrum Antibiotic',
    'Proton Pump Inhibitor (PPI)',
    'Calcium Channel Blocker',
    'HMG-CoA Reductase Inhibitor (Statin)',
    'Biguanide (Antidiabetic)',
    'Antihistamine (2nd Gen)',
    'Macrolide Antibiotic',
    'Fluoroquinolone Antibiotic',
    'NSAID'
  ];

  const fetchDictionary = async (search = '', tclass = '') => {
    setIsLoading(true);
    try {
      let url = `/api/clinical/dictionary?search=${encodeURIComponent(search)}`;
      if (tclass && tclass !== 'All Classes') {
        url += `&class=${encodeURIComponent(tclass)}`;
      }
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        if (data.entries && data.entries.length > 0 && !selectedEntry) {
          setSelectedEntry(data.entries[0]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDictionary(searchQuery, selectedClass);
  }, [token, selectedClass]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDictionary(searchQuery, selectedClass);
  };

  const getPregnancyBadgeColor = (cat?: string) => {
    switch (cat) {
      case 'A':
      case 'B':
        return 'var(--success)';
      case 'C':
        return 'var(--warning)';
      case 'D':
      case 'X':
        return 'var(--danger)';
      default:
        return 'var(--text-muted)';
    }
  };

  return (
    <div className="view-container">
      {/* View Header */}
      <div className="view-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BookOpen size={24} style={{ color: 'var(--primary)' }} />
            Pharma Dictionary & Clinical Monographs 📚
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Authoritative clinical database: generic monographs, indications, adult & pediatric dosage protocols, and pregnancy safety.
          </p>
        </div>

        {/* Database Verification Tag */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.8rem', backgroundColor: 'rgba(2, 132, 199, 0.1)', color: 'var(--primary)', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 700 }}>
          <FileCheck size={15} />
          <span>VERIFIED PHARMACEUTICAL REFERENCE</span>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input"
              style={{ paddingLeft: '2.25rem' }}
              placeholder="Search generic molecule, brand name, composition, or therapeutic indication..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="input"
            style={{ width: '240px' }}
            value={selectedClass}
            onChange={e => setSelectedClass(e.target.value)}
          >
            {therapeuticClasses.map(c => (
              <option key={c} value={c === 'All Classes' ? '' : c}>
                {c}
              </option>
            ))}
          </select>

          <button type="submit" className="btn btn-primary" disabled={isLoading}>
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </form>
      </div>

      {/* Main 2-Column Dictionary Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '1.25rem' }}>
        {/* Left List of Generic Molecules */}
        <div className="card" style={{ padding: '0.75rem', maxHeight: '720px', overflowY: 'auto' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, padding: '0.5rem 0.75rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
            GENERIC MOLECULES ({entries.length})
          </div>

          {entries.length === 0 ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No monographs found matching criteria.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.5rem' }}>
              {entries.map(entry => {
                const isSelected = selectedEntry?.generic_id === entry.generic_id;
                return (
                  <button
                    key={entry.generic_id}
                    onClick={() => setSelectedEntry(entry)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 0.85rem',
                      borderRadius: 'var(--radius-md)',
                      border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                      backgroundColor: isSelected ? 'rgba(2, 132, 199, 0.08)' : 'var(--bg-surface)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: isSelected ? 'var(--primary)' : 'var(--text-main)' }}>
                        {entry.generic_name}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {entry.therapeutic_class || 'General'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span className="badge badge-secondary" style={{ fontSize: '0.65rem' }}>
                        {entry.brandCount} Brands
                      </span>
                      <ChevronRight size={14} style={{ color: isSelected ? 'var(--primary)' : 'var(--text-muted)' }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Detail Pane: Full Clinical Monograph */}
        <div className="card" style={{ padding: '1.75rem', minHeight: '600px' }}>
          {!selectedEntry ? (
            <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <BookOpen size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
              <p style={{ fontWeight: 600 }}>Select a generic monograph on the left</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Monograph Header */}
              <div style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{selectedEntry.generic_name}</h2>
                    <span className="badge badge-primary">{selectedEntry.therapeutic_class}</span>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.35rem', lineHeight: '1.4' }}>
                    {selectedEntry.generic_description || 'Active pharmaceutical ingredient verified for clinical pharmacy dispensing.'}
                  </p>
                </div>

                {/* Pregnancy Risk Badge */}
                {selectedEntry.pregnancy_category && (
                  <div style={{ textAlign: 'right', padding: '0.5rem 0.85rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-card-header)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>FDA Pregnancy Category</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: getPregnancyBadgeColor(selectedEntry.pregnancy_category) }}>
                      Category {selectedEntry.pregnancy_category}
                    </div>
                  </div>
                )}
              </div>

              {/* Dosing Section */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <Pill size={16} />
                    Adult Dosage Reference
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: '1.5' }}>
                    {selectedEntry.adult_dosage || 'Standard BNF / USP titration. Individualize based on patient response.'}
                  </div>
                </div>

                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#06b6d4', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <Baby size={16} />
                    Pediatric Reference
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: '1.5' }}>
                    {selectedEntry.pediatric_dosage || 'Weight-adjusted dosing (mg/kg/day). Verify against pediatric BNF guidelines.'}
                  </div>
                </div>
              </div>

              {/* Food & Organ Precautions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#eab308', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <Utensils size={16} />
                    Food Timing & Administration
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: '1.5' }}>
                    {selectedEntry.food_instructions || 'Take with a full glass of water. Take with food if stomach upset occurs.'}
                  </div>
                </div>

                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <ShieldAlert size={16} />
                    Hepatic / Renal Precautions
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: '1.5' }}>
                    {selectedEntry.hepatic_renal_precautions || 'Caution in severe renal or hepatic impairment. Adjust maintenance doses.'}
                  </div>
                </div>
              </div>

              {/* Common Side Effects */}
              {selectedEntry.common_side_effects && (
                <div style={{ padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                    <AlertTriangle size={15} />
                    Documented Adverse Reactions & Side Effects
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    {selectedEntry.common_side_effects}
                  </div>
                </div>
              )}

              {/* In-Stock Pharmacy Brands Sharing this Molecule */}
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Layers size={16} style={{ color: 'var(--primary)' }} />
                  NMP Pharmacy Brands in Inventory ({selectedEntry.brands.length})
                </h3>

                {selectedEntry.brands.length === 0 ? (
                  <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center' }}>
                    No commercial brand catalog items registered under this generic in master database.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
                    {selectedEntry.brands.map((b: any) => (
                      <div
                        key={b.id}
                        style={{
                          padding: '0.85rem',
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{b.brand_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {b.strength} • {b.dosage_form}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                            Mfr: {b.manufacturer_name || 'Standard Pharma'}
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.4rem', fontSize: '0.75rem' }}>
                          <span style={{ fontWeight: 700, color: b.total_stock > 0 ? 'var(--success)' : 'var(--danger)' }}>
                            Stock: {b.total_stock} units
                          </span>
                          <span style={{ fontWeight: 800, color: 'var(--text-main)' }}>
                            Rs. {b.min_price || 'N/A'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

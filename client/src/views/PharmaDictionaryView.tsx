import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  BookOpen,
  Search,
  Pill,
  ShieldAlert,
  Utensils,
  Layers,
  ChevronRight,
  FileCheck,
  Star,
  Edit3,
  Activity,
  X,
  Zap,
  Scale,
  Eye,
  CheckCircle,
  Copy,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface DictionaryEntry {
  generic_id: number;
  generic_name: string;
  therapeutic_class: string;
  generic_description?: string;
  atc_code?: string;
  rx_status?: string;
  pharmacological_class?: string;
  countries_available?: string;
  pregnancy_category?: string;
  trimester_considerations?: string;
  lactation_safety?: string;
  adult_dosage?: string;
  pediatric_dosage?: string;
  neonatal_dosage?: string;
  geriatric_dosage?: string;
  weight_bsa_dosing?: string;
  hepatic_renal_precautions?: string;
  dialysis_considerations?: string;
  indications_approved?: string;
  indications_common?: string;
  indications_offlabel?: string;
  pharmacology_moa?: string;
  pharmacokinetics_summary?: string;
  absorption_bioavailability?: string;
  distribution_protein_binding?: string;
  metabolism_cyp?: string;
  half_life_elimination?: string;
  onset_peak_duration?: string;
  contraindications_absolute?: string;
  contraindications_relative?: string;
  boxed_warnings?: string;
  serious_warnings?: string;
  cautions?: string;
  monitoring_required?: string;
  side_effects_common?: string;
  side_effects_serious?: string;
  side_effects_rare_life_threatening?: string;
  food_interactions?: string;
  disease_interactions?: string;
  special_populations?: string;
  pill_imprint?: string;
  pill_shape?: string;
  pill_color?: string;
  monitoring_parameters?: string;
  administration_instructions?: string;
  storage_stability?: string;
  patient_counseling_en?: string;
  patient_counseling_professional?: string;
  clinical_source?: string;
  source_version?: string;
  last_reviewed?: string;
  brands: any[];
  brandCount: number;
}

export const PharmaDictionaryView: React.FC = () => {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<
    'dictionary' | 'classes' | 'manufacturers' | 'interactions' | 'pill_id' | 'compare' | 'charts' | 'my_meds' | 'favorites'
  >('dictionary');

  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [liveSuggestions, setLiveSuggestions] = useState<any[]>([]);
  const [selectedLetter, setSelectedLetter] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedRxFilter, setSelectedRxFilter] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('Global');
  const [professionalMode, setProfessionalMode] = useState(true);
  const [sortBy, setSortBy] = useState<'AZ' | 'ZA' | 'CLASS'>('AZ');
  const [recentSearches, setRecentSearches] = useState<string[]>([
    'Amoxicillin',
    'Paracetamol',
    'Omeprazole',
    'Metformin',
    'Atorvastatin',
    'Ciprofloxacin'
  ]);

  const [classList, setClassList] = useState<any[]>([]);
  const [manufacturerList, setManufacturerList] = useState<any[]>([]);
  const [myMeds, setMyMeds] = useState<any[]>([
    { id: 1, name: 'Paracetamol 500mg', dose: '1 Tablet', freq: 'TDS (Every 8h)', startDate: '2026-09-10', notes: 'For headache relief' },
    { id: 2, name: 'Amlodipine 5mg', dose: '1 Tablet', freq: 'OD (Once daily)', startDate: '2026-08-01', notes: 'Morning dose for BP' }
  ]);
  const [newMedName, setNewMedName] = useState('');
  const [newMedDose, setNewMedDose] = useState('');
  const [newMedFreq, setNewMedFreq] = useState('OD (Once daily)');
  const [newMedNotes, setNewMedNotes] = useState('');

  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<DictionaryEntry | null>(null);
  const [monographTab, setMonographTab] = useState<'overview' | 'dosing' | 'indications' | 'pharmacology' | 'warnings' | 'side_effects' | 'interactions' | 'counseling'>('overview');
  const [counselingMode, setCounselingMode] = useState<'patient' | 'professional'>('professional');

  const [selectedInteractingDrugs, setSelectedInteractingDrugs] = useState<DictionaryEntry[]>([]);
  const [interactionResults, setInteractionResults] = useState<any[]>([]);
  const [checkingInteractions, setCheckingInteractions] = useState(false);

  const [pillImprint, setPillImprint] = useState('');
  const [pillShape, setPillShape] = useState('');
  const [pillColor, setPillColor] = useState('');
  const [pillForm, setPillForm] = useState('');
  const [pillMatches, setPillMatches] = useState<any[]>([]);
  const [searchingPill, setSearchingPill] = useState(false);

  const [compareDrugs, setCompareDrugs] = useState<DictionaryEntry[]>([]);

  const [selectedChartType, setSelectedChartType] = useState<'antibiotics_spectrum' | 'nsaids_matrix'>('antibiotics_spectrum');
  const [chartData, setChartData] = useState<any>(null);

  const [favorites, setFavorites] = useState<any[]>([]);
  const [pharmacistNote, setPharmacistNote] = useState('');
  const [isNoteSaving, setIsNoteSaving] = useState(false);
  const [noteSavedMessage, setNoteSavedMessage] = useState<string | null>(null);
  const [copiedNotification, setCopiedNotification] = useState(false);

  const [isLoading, setIsLoading] = useState(false);

  const searchBoxRef = useRef<HTMLDivElement>(null);
  const alphabet = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), '0-9'];

  const therapeuticClasses = [
    'All Classes',
    'Analgesic / Antipyretic',
    'Broad-spectrum Penicillin',
    'Proton Pump Inhibitor (PPI)',
    'Calcium Channel Blocker',
    'Biguanide Antidiabetic',
    '5-HT3 Receptor Antagonist',
    'Macrolide Antibiotic',
    'NSAID / Anti-Inflammatory',
    'Angiotensin II Receptor Blocker',
    'Fluoroquinolone Antibiotic',
    'Cephalosporin (3rd Gen)',
    'HMG-CoA Reductase Inhibitor',
    'Leukotriene Receptor Antagonist',
    'Second-Generation Antihistamine',
    'CNS & Psychiatry',
    'Oncology & Antineoplastics'
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (activeTab === 'classes') {
      fetch('/api/clinical/classes', { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => setClassList(data.classes || []))
        .catch(console.error);
    } else if (activeTab === 'manufacturers') {
      fetch('/api/clinical/manufacturers', { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => setManufacturerList(data.manufacturers || []))
        .catch(console.error);
    }
  }, [activeTab, token]);

  const fetchDictionary = async (search = '', letter = '', tclass = '', rx = '', sort = 'AZ') => {
    setIsLoading(true);
    try {
      let url = `/api/clinical/dictionary?search=${encodeURIComponent(search)}&sort=${sort}`;
      if (letter && !search) url += `&letter=${encodeURIComponent(letter)}`;
      if (tclass && tclass !== 'All Classes') url += `&class=${encodeURIComponent(tclass)}`;
      if (rx) url += `&rxStatus=${encodeURIComponent(rx)}`;

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        if (data.entries && data.entries.length > 0 && (!selectedEntry || search || letter)) {
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
    fetchDictionary(searchQuery, selectedLetter, selectedClass, selectedRxFilter, sortBy);
  }, [token, selectedLetter, selectedClass, selectedRxFilter, sortBy]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setLiveSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clinical/dictionary?search=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setLiveSuggestions((data.entries || []).slice(0, 8));
        }
      } catch (err) {
        console.error(err);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, token]);

  const fetchFavorites = async () => {
    try {
      const res = await fetch('/api/clinical/favorites', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setFavorites(data.favorites || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchFavorites();
  }, [token]);

  useEffect(() => {
    if (!selectedEntry) return;
    const fetchNote = async () => {
      try {
        const res = await fetch(`/api/clinical/notes/${selectedEntry.generic_id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setPharmacistNote(data.note ? data.note.note_text : '');
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchNote();
  }, [selectedEntry, token]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuggestions(false);
    setSelectedLetter('');
    if (searchQuery.trim() && !recentSearches.includes(searchQuery.trim())) {
      setRecentSearches([searchQuery.trim(), ...recentSearches.slice(0, 4)]);
    }
    fetchDictionary(searchQuery, '', selectedClass, selectedRxFilter, sortBy);
  };

  const handleSelectSuggestion = (entry: DictionaryEntry) => {
    setSearchQuery(entry.generic_name);
    setSelectedEntry(entry);
    setShowSuggestions(false);
    setSelectedLetter('');
    if (!recentSearches.includes(entry.generic_name)) {
      setRecentSearches([entry.generic_name, ...recentSearches.slice(0, 4)]);
    }
    fetchDictionary(entry.generic_name, '', selectedClass, selectedRxFilter, sortBy);
  };

  const toggleFavorite = async (genericId: number) => {
    const isFav = favorites.some(f => f.generic_id === genericId);
    try {
      if (isFav) {
        await fetch(`/api/clinical/favorites/${genericId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      } else {
        await fetch(`/api/clinical/favorites/${genericId}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      }
      fetchFavorites();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveNote = async () => {
    if (!selectedEntry) return;
    setIsNoteSaving(true);
    setNoteSavedMessage(null);
    try {
      const res = await fetch('/api/clinical/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ genericId: selectedEntry.generic_id, noteText: pharmacistNote })
      });
      if (res.ok) {
        setNoteSavedMessage('Clinical note saved successfully.');
        setTimeout(() => setNoteSavedMessage(null), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsNoteSaving(false);
    }
  };

  const runInteractionCheck = async () => {
    if (selectedInteractingDrugs.length < 2) return;
    setCheckingInteractions(true);
    try {
      const genericIds = selectedInteractingDrugs.map(d => d.generic_id);
      const res = await fetch('/api/clinical/check-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ medicineIds: genericIds })
      });
      if (res.ok) {
        const data = await res.json();
        setInteractionResults(data.interactions || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingInteractions(false);
    }
  };

  const runPillSearch = async () => {
    setSearchingPill(true);
    try {
      const res = await fetch(
        `/api/clinical/pill-identifier?imprint=${encodeURIComponent(pillImprint)}&shape=${encodeURIComponent(pillShape)}&color=${encodeURIComponent(pillColor)}&form=${encodeURIComponent(pillForm)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setPillMatches(data.matches || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSearchingPill(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'charts') {
      const fetchChart = async () => {
        try {
          const res = await fetch(`/api/clinical/charts/${selectedChartType}`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
            setChartData(await res.json());
          }
        } catch (err) {
          console.error(err);
        }
      };
      fetchChart();
    }
  }, [activeTab, selectedChartType, token]);

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  const getPregnancyBadgeColor = (cat?: string) => {
    switch (cat) {
      case 'A':
      case 'B':
        return '#10b981';
      case 'C':
        return '#f59e0b';
      case 'D':
      case 'X':
        return '#ef4444';
      default:
        return '#64748b';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', overflowY: 'auto', padding: '0.75rem 1.25rem', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', background: 'var(--bg-surface)', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-main)', margin: 0 }}>
            <BookOpen size={26} color="var(--primary)" />
            Pharma Clinical Dictionary & Drug Reference
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0.25rem 0 0 0' }}>
            Comprehensive pharmacopoeia, live OpenFDA database lookup, verified drug interactions, and FEFO inventory stock.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'nowrap' }}>
          <select
            className="select"
            style={{ fontSize: '0.82rem', height: '38px', width: '160px', minWidth: '160px', fontWeight: 600, borderRadius: '8px', padding: '0 0.75rem', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-main)' }}
            value={selectedCountry}
            onChange={e => setSelectedCountry(e.target.value)}
          >
            <option value="Global">Global Formulary</option>
            <option value="Pakistan">Pakistan (DRAP)</option>
            <option value="USA">USA (FDA / USP)</option>
            <option value="UK">UK (BNF)</option>
          </select>

          <button
            onClick={() => {
              setProfessionalMode(!professionalMode);
              setCounselingMode(professionalMode ? 'patient' : 'professional');
            }}
            className={`btn btn-sm ${professionalMode ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.82rem', fontWeight: 700, height: '38px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0 0.9rem', whiteSpace: 'nowrap' }}
          >
            <Zap size={15} />
            <span>{professionalMode ? 'Professional Mode' : 'Patient View'}</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0 0.9rem', height: '38px', backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, border: '1px solid rgba(16, 185, 129, 0.3)', whiteSpace: 'nowrap' }}>
            <FileCheck size={16} />
            <span>OpenFDA + BNF Verified</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.65rem', width: '100%', boxSizing: 'border-box' }}>
            <div ref={searchBoxRef} style={{ position: 'relative', flex: '1 1 auto', minWidth: '220px' }}>
              <Search size={18} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="input"
                style={{ paddingLeft: '2.6rem', height: '42px', fontSize: '0.92rem', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                placeholder="Search any drug, brand (Panadol, Augmentin), salt, or class..."
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                  if (selectedLetter) setSelectedLetter('');
                }}
                onFocus={() => setShowSuggestions(true)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setShowSuggestions(false);
                    fetchDictionary('', selectedLetter, selectedClass, selectedRxFilter, sortBy);
                  }}
                  style={{ position: 'absolute', right: '0.85rem', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  <X size={16} />
                </button>
              )}

              {showSuggestions && liveSuggestions.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '46px',
                    left: 0,
                    right: 0,
                    backgroundColor: 'var(--bg-surface)',
                    border: '2px solid var(--primary)',
                    borderRadius: '10px',
                    boxShadow: '0 16px 36px rgba(0, 0, 0, 0.55)',
                    zIndex: 1000,
                    overflow: 'hidden'
                  }}
                >
                  <div style={{ padding: '0.45rem 0.85rem', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'rgba(2, 132, 199, 0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary)' }}>
                      <Sparkles size={13} />
                      INSTANT MATCHES & OPENFDA LIVE CATALOG
                    </span>
                    <span>{liveSuggestions.length} found</span>
                  </div>
                  {liveSuggestions.map(item => (
                    <button
                      key={item.generic_id}
                      type="button"
                      onClick={() => handleSelectSuggestion(item)}
                      style={{
                        width: '100%',
                        padding: '0.7rem 0.9rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        border: 'none',
                        borderBottom: '1px solid var(--border)',
                        background: 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(2, 132, 199, 0.15)')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <span>{item.generic_name}</span>
                          <span className="badge badge-secondary" style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem' }}>{item.rx_status || 'Rx'}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                          {item.therapeutic_class || 'General'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 800 }}>
                        <span>{item.brandCount} brands</span>
                        <ArrowRight size={14} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <select
              className="select"
              style={{ height: '42px', fontSize: '0.84rem', borderRadius: '8px', width: '220px', minWidth: '200px', flex: '0 0 220px', boxSizing: 'border-box' }}
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
            >
              {therapeuticClasses.map(c => (
                <option key={c} value={c === 'All Classes' ? '' : c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              className="select"
              style={{ height: '42px', fontSize: '0.84rem', borderRadius: '8px', width: '130px', minWidth: '130px', flex: '0 0 130px', boxSizing: 'border-box' }}
              value={selectedRxFilter}
              onChange={e => setSelectedRxFilter(e.target.value)}
            >
              <option value="">All Rx/OTC</option>
              <option value="Rx">Rx Only</option>
              <option value="OTC">OTC</option>
              <option value="Controlled">Controlled</option>
            </select>

            <button type="submit" className="btn btn-primary" style={{ height: '42px', fontWeight: 800, borderRadius: '8px', padding: '0 1.5rem', flex: '0 0 auto', whiteSpace: 'nowrap' }} disabled={isLoading}>
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <span style={{ fontWeight: 700 }}>Popular:</span>
            {recentSearches.map(term => (
              <button
                key={term}
                type="button"
                onClick={() => {
                  setSearchQuery(term);
                  setSelectedLetter('');
                  fetchDictionary(term, '', selectedClass, selectedRxFilter, sortBy);
                }}
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--bg-surface)',
                  padding: '0.2rem 0.65rem',
                  borderRadius: '16px',
                  color: 'var(--text-main)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 600
                }}
              >
                {term}
              </button>
            ))}
          </div>
        </form>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', background: 'var(--bg-surface)', padding: '0.6rem 0.85rem', borderRadius: '10px', border: '1px solid var(--border)', flexWrap: 'nowrap' }}>
        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', overflowX: 'auto', flex: 1 }}>
          <button
            onClick={() => {
              setSelectedLetter('');
              fetchDictionary(searchQuery, '', selectedClass, selectedRxFilter, sortBy);
            }}
            className={`btn btn-sm ${selectedLetter === '' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem', fontWeight: 800, borderRadius: '6px', flexShrink: 0 }}
          >
            ALL
          </button>
          {alphabet.map(letter => (
            <button
              key={letter}
              onClick={() => {
                setSelectedLetter(letter);
                setSearchQuery('');
                fetchDictionary('', letter, selectedClass, selectedRxFilter, sortBy);
              }}
              className={`btn btn-sm ${selectedLetter === letter ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', minWidth: '28px', fontWeight: 700, borderRadius: '6px', flexShrink: 0 }}
            >
              {letter}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderLeft: '1px solid var(--border)', paddingLeft: '0.85rem', flexShrink: 0 }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 800 }}>Sort:</span>
          <select
            className="select"
            style={{ fontSize: '0.8rem', width: '160px', minWidth: '160px', height: '34px', borderRadius: '6px', fontWeight: 600, padding: '0 0.5rem' }}
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
          >
            <option value="AZ">A to Z</option>
            <option value="ZA">Z to A</option>
            <option value="CLASS">By Drug Class</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid var(--border)', overflowX: 'auto', paddingBottom: '0.1rem' }}>
        {[
          { id: 'dictionary', label: 'Monograph Reference', icon: <BookOpen size={16} /> },
          { id: 'interactions', label: 'Interaction Checker', icon: <Zap size={16} /> },
          { id: 'pill_id', label: 'Pill Identifier', icon: <Eye size={16} /> },
          { id: 'compare', label: `Drug Comparison (${compareDrugs.length})`, icon: <Scale size={16} /> },
          { id: 'classes', label: 'Drug Classes Directory', icon: <Layers size={16} /> },
          { id: 'manufacturers', label: 'Manufacturers', icon: <FileCheck size={16} /> },
          { id: 'charts', label: 'Clinical Reference Charts', icon: <Activity size={16} /> },
          { id: 'my_meds', label: `Regimen List (${myMeds.length})`, icon: <Pill size={16} /> },
          { id: 'favorites', label: `Favorites (${favorites.length})`, icon: <Star size={16} /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '0.7rem 1.1rem',
              fontWeight: 700,
              fontSize: '0.85rem',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              borderBottom: activeTab === tab.id ? '3px solid var(--primary)' : '3px solid transparent',
              color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              whiteSpace: 'nowrap'
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'dictionary' && (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '1.25rem', alignItems: 'start' }}>
          <div className="card" style={{ padding: '0.75rem', height: 'calc(100vh - 340px)', minHeight: '560px', overflowY: 'auto', borderRadius: '12px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, padding: '0.5rem 0.5rem 0.75rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>MONOGRAPHS ({entries.length})</span>
              {selectedLetter && <span className="badge badge-primary">{selectedLetter}</span>}
            </div>

            {entries.length === 0 ? (
              <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <p style={{ fontWeight: 700 }}>No monographs matching criteria.</p>
                <p style={{ fontSize: '0.78rem', marginTop: '0.35rem' }}>Type any generic name above to search our full pharmacopoeia and OpenFDA.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.65rem' }}>
                {entries.map(entry => {
                  const isSelected = selectedEntry?.generic_id === entry.generic_id;
                  const isFav = favorites.some(f => f.generic_id === entry.generic_id);

                  return (
                    <button
                      key={entry.generic_id}
                      onClick={() => setSelectedEntry(entry)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.8rem 0.95rem',
                        borderRadius: '10px',
                        border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                        backgroundColor: isSelected ? 'rgba(2, 132, 199, 0.12)' : 'var(--bg-surface)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.94rem', color: isSelected ? 'var(--primary)' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span>{entry.generic_name}</span>
                          {isFav && <Star size={13} style={{ fill: '#eab308', color: '#eab308' }} />}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          {entry.therapeutic_class || 'General'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>
                          {entry.brandCount} Brands
                        </span>
                        <ChevronRight size={15} style={{ color: isSelected ? 'var(--primary)' : 'var(--text-muted)' }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: '1.5rem', height: 'calc(100vh - 340px)', minHeight: '560px', overflowY: 'auto', borderRadius: '12px' }}>
            {!selectedEntry ? (
              <div style={{ padding: '5rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <BookOpen size={56} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
                <p style={{ fontWeight: 700, fontSize: '1.05rem' }}>Select a drug monograph on the left or search above.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <h2 style={{ fontSize: '1.75rem', fontWeight: 900, margin: 0 }}>{selectedEntry.generic_name}</h2>
                      <span className="badge badge-primary" style={{ fontSize: '0.8rem' }}>{selectedEntry.therapeutic_class}</span>
                      {selectedEntry.atc_code && <span className="badge badge-secondary" style={{ fontSize: '0.8rem' }}>ATC: {selectedEntry.atc_code}</span>}
                      <span className="badge badge-warning" style={{ fontSize: '0.8rem' }}>{selectedEntry.rx_status || 'Rx'}</span>
                      {selectedEntry.pregnancy_category && (
                        <span style={{ backgroundColor: getPregnancyBadgeColor(selectedEntry.pregnancy_category), color: '#fff', padding: '0.2rem 0.65rem', borderRadius: '6px', fontWeight: 800, fontSize: '0.75rem' }}>
                          Pregnancy Category {selectedEntry.pregnancy_category}
                        </span>
                      )}
                    </div>

                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem', lineHeight: '1.55' }}>
                      {selectedEntry.generic_description || 'Active pharmaceutical ingredient verified for clinical pharmacy dispensing.'}
                    </p>

                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem', display: 'flex', gap: '1.25rem' }}>
                      <span>Source: <strong>{selectedEntry.clinical_source || 'USP-NF / DailyMed / BNF 86'}</strong></span>
                      <span>Version: <strong>{selectedEntry.source_version || 'v2026.1'}</strong></span>
                      <span>Reviewed: <strong>{selectedEntry.last_reviewed || '2026-09-01'}</strong></span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    <button
                      onClick={() => toggleFavorite(selectedEntry.generic_id)}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <Star size={15} style={{ fill: favorites.some(f => f.generic_id === selectedEntry.generic_id) ? '#eab308' : 'none', color: '#eab308' }} />
                      <span>{favorites.some(f => f.generic_id === selectedEntry.generic_id) ? 'Bookmarked' : 'Favorite'}</span>
                    </button>

                    <button
                      onClick={() => {
                        if (!compareDrugs.some(d => d.generic_id === selectedEntry.generic_id)) {
                          setCompareDrugs([...compareDrugs, selectedEntry]);
                        }
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.82rem' }}
                    >
                      + Compare
                    </button>

                    <button
                      onClick={() => copyText(`${selectedEntry.generic_name} (${selectedEntry.therapeutic_class}) - Adult Dose: ${selectedEntry.adult_dosage || 'Standard'}`)}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <Copy size={14} />
                      <span>{copiedNotification ? 'Copied!' : 'Copy Summary'}</span>
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', overflowX: 'auto' }}>
                  {[
                    { id: 'overview', label: 'Overview & Brands' },
                    { id: 'dosing', label: 'Clinical Dosing' },
                    { id: 'indications', label: 'Indications & Uses' },
                    { id: 'pharmacology', label: 'Pharmacology & PK' },
                    { id: 'warnings', label: 'Warnings & Boxed Alerts' },
                    { id: 'side_effects', label: 'Adverse Reactions' },
                    { id: 'interactions', label: 'Food & Precautions' },
                    { id: 'counseling', label: 'Counseling & Notes' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setMonographTab(tab.id as any)}
                      className={`btn btn-sm ${monographTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', borderRadius: '6px', whiteSpace: 'nowrap' }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {monographTab === 'overview' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                      <div style={{ padding: '0.9rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>ATC Classification</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 800, marginTop: '0.2rem' }}>{selectedEntry.atc_code || 'N/A'}</div>
                      </div>
                      <div style={{ padding: '0.9rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>Lactation Safety</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, marginTop: '0.2rem' }}>{selectedEntry.lactation_safety || 'Consult clinical guidelines'}</div>
                      </div>
                      <div style={{ padding: '0.9rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>Regional Registrations</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, marginTop: '0.2rem' }}>{selectedEntry.countries_available || 'Global Formulary'}</div>
                      </div>
                    </div>

                    <div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Layers size={18} color="var(--primary)" />
                        In-Stock Pharmacy Commercial Brands ({selectedEntry.brands.length})
                      </h3>

                      {selectedEntry.brands.length === 0 ? (
                        <div style={{ padding: '1.5rem', background: 'var(--bg-surface)', border: '1px dashed var(--border)', borderRadius: '10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          No linked commercial brands currently registered in inventory.
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.85rem' }}>
                          {selectedEntry.brands.map((b: any) => (
                            <div key={b.id} style={{ padding: '0.85rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>{b.brand_name}</div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{b.strength} • {b.dosage_form} (Pack of {b.pack_size || 1})</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mfr: {b.manufacturer_name || 'Standard Pharma'}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rack: {b.rack_location || 'General Store'}</div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', paddingTop: '0.4rem', borderTop: '1px solid var(--border)', fontSize: '0.82rem' }}>
                                <span style={{ fontWeight: 800, color: b.total_stock > 0 ? '#10b981' : '#ef4444' }}>
                                  Stock: {b.total_stock} units
                                </span>
                                <span style={{ fontWeight: 800, color: 'var(--primary)' }}>Rs. {b.min_price || 'N/A'}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {monographTab === 'dosing' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--primary)', marginBottom: '0.4rem' }}>Adult Dosage Reference</div>
                        <div style={{ fontSize: '0.88rem', lineHeight: '1.6' }}>{selectedEntry.adult_dosage || 'Standard clinical titration per protocol.'}</div>
                      </div>

                      <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#06b6d4', marginBottom: '0.4rem' }}>Pediatric & Weight-Based Dosing</div>
                        <div style={{ fontSize: '0.88rem', lineHeight: '1.6' }}>{selectedEntry.pediatric_dosage || 'Dosed strictly by mg/kg/day.'}</div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '0.4rem' }}>Geriatric Dosing Consideration</div>
                        <div style={{ fontSize: '0.88rem', lineHeight: '1.6' }}>{selectedEntry.geriatric_dosage || 'Initiate at lower end of dosing range.'}</div>
                      </div>

                      <div style={{ padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '10px' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#ef4444', marginBottom: '0.4rem' }}>Renal & Hepatic Adjustments</div>
                        <div style={{ fontSize: '0.88rem', lineHeight: '1.6' }}>{selectedEntry.hepatic_renal_precautions || 'Adjust dose based on creatinine clearance (CrCl).'}</div>
                      </div>
                    </div>

                    <div style={{ padding: '0.9rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '0.85rem' }}>
                      <strong>Dialysis Considerations: </strong> {selectedEntry.dialysis_considerations || 'No specific post-dialysis supplemental dose documented.'}
                    </div>
                  </div>
                )}

                {monographTab === 'indications' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ padding: '1.1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#10b981', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <CheckCircle size={18} />
                        Approved Indications
                      </div>
                      <div style={{ fontSize: '0.88rem', lineHeight: '1.6' }}>{selectedEntry.indications_approved || selectedEntry.generic_description}</div>
                    </div>

                    {selectedEntry.indications_offlabel && (
                      <div style={{ padding: '1.1rem', backgroundColor: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '10px' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#d97706', marginBottom: '0.5rem' }}>
                          Off-Label Clinical Uses
                        </div>
                        <div style={{ fontSize: '0.88rem', lineHeight: '1.6' }}>{selectedEntry.indications_offlabel}</div>
                      </div>
                    )}
                  </div>
                )}

                {monographTab === 'pharmacology' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ padding: '1.1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--primary)', marginBottom: '0.4rem' }}>Mechanism of Action (MoA)</div>
                      <div style={{ fontSize: '0.88rem', lineHeight: '1.6' }}>{selectedEntry.pharmacology_moa || 'Pharmacological pathway documented per USP-NF reference.'}</div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '0.85rem' }}>
                        <div style={{ fontWeight: 800, marginBottom: '0.35rem' }}>Absorption & Bioavailability</div>
                        <div>{selectedEntry.absorption_bioavailability || 'Standard oral absorption profile.'}</div>
                      </div>

                      <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '0.85rem' }}>
                        <div style={{ fontWeight: 800, marginBottom: '0.35rem' }}>Metabolism & CYP Pathway</div>
                        <div>{selectedEntry.metabolism_cyp || 'Hepatic metabolism.'}</div>
                      </div>

                      <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '0.85rem' }}>
                        <div style={{ fontWeight: 800, marginBottom: '0.35rem' }}>Elimination Half-Life</div>
                        <div>{selectedEntry.half_life_elimination || 'Standard elimination kinetics.'}</div>
                      </div>

                      <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '0.85rem' }}>
                        <div style={{ fontWeight: 800, marginBottom: '0.35rem' }}>Onset & Peak Effect</div>
                        <div>{selectedEntry.onset_peak_duration || 'Onset within 30-60 minutes.'}</div>
                      </div>
                    </div>
                  </div>
                )}

                {monographTab === 'warnings' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {selectedEntry.boxed_warnings && (
                      <div style={{ padding: '1.1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '2px solid #ef4444', borderRadius: '10px' }}>
                        <div style={{ fontWeight: 900, fontSize: '0.95rem', color: '#ef4444', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <ShieldAlert size={18} />
                          BLACK BOX WARNING
                        </div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-main)', lineHeight: '1.5' }}>
                          {selectedEntry.boxed_warnings}
                        </div>
                      </div>
                    )}

                    <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#ef4444', marginBottom: '0.4rem' }}>Absolute Contraindications</div>
                      <div style={{ fontSize: '0.88rem', lineHeight: '1.6' }}>{selectedEntry.contraindications_absolute || 'Known hypersensitivity to active substance.'}</div>
                    </div>

                    <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#f59e0b', marginBottom: '0.4rem' }}>Precautions & Cautions</div>
                      <div style={{ fontSize: '0.88rem', lineHeight: '1.6' }}>{selectedEntry.cautions || 'Routine monitoring required during chronic administration.'}</div>
                    </div>
                  </div>
                )}

                {monographTab === 'side_effects' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#f59e0b', marginBottom: '0.4rem' }}>Common Adverse Effects</div>
                      <div style={{ fontSize: '0.88rem', lineHeight: '1.6' }}>{selectedEntry.side_effects_common || 'Mild GI upset, headache, or transient dizziness.'}</div>
                    </div>

                    <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#ef4444', marginBottom: '0.4rem' }}>Serious Reactions</div>
                      <div style={{ fontSize: '0.88rem', lineHeight: '1.6' }}>{selectedEntry.side_effects_serious || 'Severe hypersensitivity, anaphylaxis, or organ-specific toxicities.'}</div>
                    </div>
                  </div>
                )}

                {monographTab === 'interactions' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#eab308', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Utensils size={16} />
                        Drug-Food Interactions & Administration Timing
                      </div>
                      <div style={{ fontSize: '0.88rem', lineHeight: '1.6' }}>{selectedEntry.food_interactions || 'Take with a full glass of water.'}</div>
                    </div>

                    <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '0.4rem' }}>Disease Interactions</div>
                      <div style={{ fontSize: '0.88rem', lineHeight: '1.6' }}>{selectedEntry.disease_interactions || 'Use caution in hepatic or renal impairment.'}</div>
                    </div>
                  </div>
                )}

                {monographTab === 'counseling' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'flex', gap: '0.6rem' }}>
                      <button onClick={() => setCounselingMode('patient')} className={`btn btn-sm ${counselingMode === 'patient' ? 'btn-primary' : 'btn-secondary'}`}>
                        Patient Friendly View
                      </button>
                      <button onClick={() => setCounselingMode('professional')} className={`btn btn-sm ${counselingMode === 'professional' ? 'btn-primary' : 'btn-secondary'}`}>
                        Pharmacist Professional View
                      </button>
                    </div>

                    <div style={{ padding: '1.25rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '0.88rem', lineHeight: '1.6' }}>
                      {counselingMode === 'patient' ? (
                        <div>
                          <p style={{ fontWeight: 800, color: 'var(--primary)', margin: '0 0 0.5rem 0' }}>Patient Instructions:</p>
                          <p style={{ margin: 0 }}>{selectedEntry.patient_counseling_en || 'Take exactly as directed by your physician. Complete the prescribed course.'}</p>
                        </div>
                      ) : (
                        <div>
                          <p style={{ fontWeight: 800, color: 'var(--primary)', margin: '0 0 0.5rem 0' }}>Pharmacist Verification Checklist:</p>
                          <p style={{ margin: 0 }}>{selectedEntry.patient_counseling_professional || 'Confirm renal function, evaluate allergies, and review duplicate therapies before dispensing.'}</p>
                        </div>
                      )}
                    </div>

                    <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.88rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Edit3 size={16} color="var(--primary)" />
                        Pharmacist Clinical Notes (Private to Store)
                      </div>
                      <textarea
                        className="input"
                        rows={3}
                        placeholder="Add private clinical dispensing notes for this generic..."
                        value={pharmacistNote}
                        onChange={e => setPharmacistNote(e.target.value)}
                        style={{ fontSize: '0.85rem', width: '100%', borderRadius: '8px' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.6rem' }}>
                        <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 700 }}>{noteSavedMessage}</span>
                        <button onClick={handleSaveNote} className="btn btn-primary btn-sm" disabled={isNoteSaving} style={{ borderRadius: '6px' }}>
                          {isNoteSaving ? 'Saving...' : 'Save Pharmacist Note'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'interactions' && (
        <div className="card" style={{ padding: '1.5rem', borderRadius: '12px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Zap size={22} color="#f59e0b" />
            Multi-Drug Interaction & Pairwise Clinical Safety Checker
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            Select 2 or more drugs to analyze pairwise Drug-Drug Interactions (DDIs), severities, and clinical management plans.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 800, display: 'block', marginBottom: '0.5rem' }}>Select Drugs to Analyze ({selectedInteractingDrugs.length}):</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '420px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.6rem', background: 'var(--bg-surface)' }}>
                {entries.map(e => {
                  const isChecked = selectedInteractingDrugs.some(d => d.generic_id === e.generic_id);
                  return (
                    <label key={e.generic_id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem', cursor: 'pointer', padding: '0.4rem 0.5rem', borderRadius: '6px', background: isChecked ? 'rgba(2, 132, 199, 0.1)' : 'transparent' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={el => {
                          if (el.target.checked) setSelectedInteractingDrugs([...selectedInteractingDrugs, e]);
                          else setSelectedInteractingDrugs(selectedInteractingDrugs.filter(d => d.generic_id !== e.generic_id));
                        }}
                      />
                      <span style={{ fontWeight: isChecked ? 700 : 500 }}>{e.generic_name}</span>
                    </label>
                  );
                })}
              </div>

              <button onClick={runInteractionCheck} className="btn btn-primary" style={{ width: '100%', marginTop: '0.85rem', height: '42px', fontWeight: 800, borderRadius: '8px' }} disabled={selectedInteractingDrugs.length < 2 || checkingInteractions}>
                {checkingInteractions ? 'Analyzing Safety...' : `Analyze Interactions (${selectedInteractingDrugs.length})`}
              </button>
            </div>

            <div>
              {interactionResults.length === 0 ? (
                <div style={{ padding: '4rem 1.5rem', border: '2px dashed var(--border)', borderRadius: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <ShieldAlert size={44} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
                  <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>Select at least 2 drugs and click "Analyze Interactions".</p>
                  <p style={{ fontSize: '0.78rem', marginTop: '0.25rem' }}>Evaluates QTc prolongation, CYP3A4 / CYP2C9 metabolic competition, and additive toxicity.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {interactionResults.map((res: any, idx: number) => (
                    <div key={idx} style={{ padding: '1.25rem', borderRadius: '10px', border: res.severity === 'MAJOR' || res.severity === 'CONTRAINDICATED' ? '2px solid #ef4444' : '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <strong style={{ fontSize: '1.05rem' }}>{res.drugA.generic} ↔ {res.drugB.generic}</strong>
                        <span className={`badge ${res.severity === 'MAJOR' ? 'badge-danger' : 'badge-warning'}`} style={{ fontWeight: 800 }}>{res.severity}</span>
                      </div>
                      <p style={{ fontSize: '0.88rem', color: 'var(--text-main)', marginBottom: '0.5rem', lineHeight: '1.5' }}>{res.effect}</p>
                      <div style={{ fontSize: '0.82rem', color: 'var(--primary)', fontWeight: 700, background: 'rgba(2, 132, 199, 0.08)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                        Management: {res.management}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'pill_id' && (
        <div className="card" style={{ padding: '1.5rem', borderRadius: '12px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Eye size={22} color="var(--primary)" />
            Visual Pill & Tablet Identifier Tool
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '1.25rem' }}>
            Identify loose or unidentified tablets and capsules by imprint code, geometry, and color.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>Imprint Code</label>
              <input type="text" className="input" placeholder="e.g. 500, AUG, PARA" value={pillImprint} onChange={e => setPillImprint(e.target.value)} style={{ borderRadius: '8px', height: '40px' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>Shape</label>
              <select className="input" value={pillShape} onChange={e => setPillShape(e.target.value)} style={{ borderRadius: '8px', height: '40px' }}>
                <option value="">Any Shape</option>
                <option value="Round">Round</option>
                <option value="Oval">Oval</option>
                <option value="Oblong">Oblong</option>
                <option value="Capsule">Capsule</option>
                <option value="Square">Square</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>Color</label>
              <select className="input" value={pillColor} onChange={e => setPillColor(e.target.value)} style={{ borderRadius: '8px', height: '40px' }}>
                <option value="">Any Color</option>
                <option value="White">White</option>
                <option value="Pink">Pink</option>
                <option value="Blue">Blue</option>
                <option value="Yellow">Yellow</option>
                <option value="Beige">Beige</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>Dosage Form</label>
              <select className="input" value={pillForm} onChange={e => setPillForm(e.target.value)} style={{ borderRadius: '8px', height: '40px' }}>
                <option value="">Any Form</option>
                <option value="Tablet">Tablet</option>
                <option value="Capsule">Capsule</option>
                <option value="Syrup">Syrup</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'end' }}>
              <button onClick={runPillSearch} className="btn btn-primary" style={{ width: '100%', height: '40px', fontWeight: 700, borderRadius: '8px' }} disabled={searchingPill}>
                {searchingPill ? 'Searching...' : 'Find Matches'}
              </button>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.75rem' }}>Identified Matches ({pillMatches.length})</h3>
            {pillMatches.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: '10px' }}>
                Enter imprint codes or select pill characteristics above to search.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.85rem' }}>
                {pillMatches.map((m: any, idx: number) => (
                  <div key={idx} style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '10px', backgroundColor: 'var(--bg-surface)' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{m.generic_name} ({m.strength})</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--primary)', marginTop: '0.2rem' }}>Brand: {m.brand_name || 'Generic Formulation'}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Imprint: <strong>{m.pill_imprint || 'N/A'}</strong> • Shape: {m.pill_shape} • Color: {m.pill_color}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'compare' && (
        <div className="card" style={{ padding: '1.5rem', borderRadius: '12px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Scale size={22} color="var(--primary)" />
            Side-by-Side Clinical Drug Comparison
          </h2>

          {compareDrugs.length === 0 ? (
            <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: '10px' }}>
              <Scale size={44} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
              <p style={{ fontWeight: 700 }}>No drugs added for comparison yet.</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>Browse generic monographs and click "+ Compare" to add molecules to this matrix.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '0.75rem', width: '200px' }}>Parameter</th>
                    {compareDrugs.map(d => (
                      <th key={d.generic_id} style={{ padding: '0.75rem', fontWeight: 800, color: 'var(--primary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{d.generic_name}</span>
                          <button
                            onClick={() => setCompareDrugs(compareDrugs.filter(item => item.generic_id !== d.generic_id))}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--danger)' }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Class</td>
                    {compareDrugs.map(d => <td key={d.generic_id} style={{ padding: '0.75rem' }}>{d.therapeutic_class}</td>)}
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Adult Dose</td>
                    {compareDrugs.map(d => <td key={d.generic_id} style={{ padding: '0.75rem' }}>{d.adult_dosage || 'Standard'}</td>)}
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Pregnancy Safety</td>
                    {compareDrugs.map(d => <td key={d.generic_id} style={{ padding: '0.75rem' }}>Category {d.pregnancy_category || 'N/A'}</td>)}
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Food Timing</td>
                    {compareDrugs.map(d => <td key={d.generic_id} style={{ padding: '0.75rem' }}>{d.food_interactions || 'With water'}</td>)}
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Half-life</td>
                    {compareDrugs.map(d => <td key={d.generic_id} style={{ padding: '0.75rem' }}>{d.half_life_elimination || 'Standard'}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'classes' && (
        <div className="card" style={{ padding: '1.5rem', borderRadius: '12px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers size={22} color="var(--primary)" />
            Therapeutic & Pharmacological Drug Class Directory
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            Browse clinical monographs organized by therapeutic domains and pharmacology classes.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
            {(classList.length > 0
              ? classList.map(c => ({ category: c.therapeutic_class, icon: '💊', count: c.drug_count, desc: 'Verified clinical monographs' }))
              : [
                  { category: 'Analgesic / Antipyretic', icon: '🩹', count: 4, desc: 'Paracetamol, Ibuprofen, Diclofenac' },
                  { category: 'Broad-spectrum Penicillin', icon: '🦠', count: 3, desc: 'Amoxicillin + Clavulanic Acid, Ampicillin' },
                  { category: 'Proton Pump Inhibitor (PPI)', icon: '🧪', count: 4, desc: 'Omeprazole, Esomeprazole, Pantoprazole' },
                  { category: 'Calcium Channel Blocker', icon: '🫀', count: 3, desc: 'Amlodipine, Diltiazem, Verapamil' },
                  { category: 'Biguanide Antidiabetic', icon: '🩸', count: 2, desc: 'Metformin HCl' },
                  { category: 'Macrolide Antibiotic', icon: '💊', count: 3, desc: 'Azithromycin, Clarithromycin' },
                  { category: 'HMG-CoA Reductase Inhibitor', icon: '🧬', count: 4, desc: 'Atorvastatin, Rosuvastatin' },
                  { category: 'CNS & Psychiatry', icon: '🧠', count: 5, desc: 'Diazepam, Escitalopram' }
                ]
            ).map(cls => (
              <button
                key={cls.category}
                onClick={() => {
                  setSelectedClass(cls.category);
                  setActiveTab('dictionary');
                  setSelectedLetter('');
                  fetchDictionary('', '', cls.category, selectedRxFilter, sortBy);
                }}
                style={{
                  padding: '1.1rem',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-surface)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '1.6rem' }}>{cls.icon}</span>
                  <span className="badge badge-primary" style={{ fontSize: '0.72rem', fontWeight: 800 }}>{cls.count} Generics</span>
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)', marginTop: '0.2rem' }}>{cls.category}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>{cls.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'manufacturers' && (
        <div className="card" style={{ padding: '1.5rem', borderRadius: '12px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileCheck size={22} color="var(--primary)" />
            Licensed Pharmaceutical Manufacturers & Brands
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            Registered pharmaceutical companies and their commercial brand formulations in inventory.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {(manufacturerList.length > 0
              ? manufacturerList.map(m => ({ name: m.company_name, contact: m.phone || m.contact_person || 'orders@pharma.pk', brands: `${m.total_brands} Registered Brands` }))
              : [
                  { name: 'GSK Pakistan', contact: '021-3456789', brands: 'Panadol, Augmentin, Calpol' },
                  { name: 'Getz Pharma', contact: '021-3245678', brands: 'Risek, Eziday, Azomax, Rigix' },
                  { name: 'Abbott Laboratories', contact: '021-3987654', brands: 'Brufen, Klaricid, Surbex' },
                  { name: 'Pfizer Pakistan', contact: '021-3889900', brands: 'Norvasc, Lipitor, Zithromax' }
                ]
            ).map(mfr => (
              <div key={mfr.name} style={{ padding: '1.1rem', border: '1px solid var(--border)', borderRadius: '10px', backgroundColor: 'var(--bg-surface)' }}>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary)' }}>{mfr.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', marginTop: '0.4rem', fontWeight: 600 }}>Portfolio: {mfr.brands}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Contact: {mfr.contact}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'charts' && (
        <div className="card" style={{ padding: '1.5rem', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'nowrap', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Activity size={22} color="var(--primary)" />
              Clinical Reference Charts & Spectrum Library
            </h2>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setSelectedChartType('antibiotics_spectrum')}
                className={`btn btn-sm ${selectedChartType === 'antibiotics_spectrum' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: '6px' }}
              >
                Antibiotics Spectrum
              </button>
              <button
                onClick={() => setSelectedChartType('nsaids_matrix')}
                className={`btn btn-sm ${selectedChartType === 'nsaids_matrix' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: '6px' }}
              >
                NSAIDs Matrix
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  {selectedChartType === 'antibiotics_spectrum' ? (
                    <>
                      <th style={{ padding: '0.7rem' }}>Antibiotic</th>
                      <th style={{ padding: '0.7rem' }}>Class</th>
                      <th style={{ padding: '0.7rem' }}>Gram +</th>
                      <th style={{ padding: '0.7rem' }}>Gram −</th>
                      <th style={{ padding: '0.7rem' }}>Anaerobes</th>
                      <th style={{ padding: '0.7rem' }}>Atypicals</th>
                      <th style={{ padding: '0.7rem' }}>Pseudomonas</th>
                    </>
                  ) : (
                    <>
                      <th style={{ padding: '0.7rem' }}>Drug</th>
                      <th style={{ padding: '0.7rem' }}>COX Selectivity</th>
                      <th style={{ padding: '0.7rem' }}>GI Risk</th>
                      <th style={{ padding: '0.7rem' }}>CV Risk</th>
                      <th style={{ padding: '0.7rem' }}>Renal Risk</th>
                      <th style={{ padding: '0.7rem' }}>Reference Dose</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {(chartData?.data || [
                  { antibiotic: 'Amoxicillin / Clavulanate', class: 'Penicillin + BLI', gramPos: '++++', gramNeg: '+++', anaerobes: '++++', atypicals: '0', pseudomonas: '0' },
                  { antibiotic: 'Ceftriaxone (Gen 3)', class: 'Cephalosporin (Gen 3)', gramPos: '+++', gramNeg: '++++', anaerobes: '+', atypicals: '0', pseudomonas: '0' },
                  { antibiotic: 'Ciprofloxacin', class: 'Fluoroquinolone', gramPos: '+', gramNeg: '++++', anaerobes: '0', atypicals: '+++', pseudomonas: '+++' },
                  { antibiotic: 'Azithromycin', class: 'Macrolide', gramPos: '++', gramNeg: '++', anaerobes: '0', atypicals: '++++', pseudomonas: '0' }
                ]).map((row: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                    {selectedChartType === 'antibiotics_spectrum' ? (
                      <>
                        <td style={{ padding: '0.7rem', fontWeight: 800 }}>{row.antibiotic || row.drug}</td>
                        <td style={{ padding: '0.7rem', color: 'var(--text-muted)' }}>{row.class || row.coxSelectivity}</td>
                        <td style={{ padding: '0.7rem', fontWeight: 800, color: 'var(--primary)' }}>{row.gramPos || row.giRisk}</td>
                        <td style={{ padding: '0.7rem', fontWeight: 800, color: '#0284c7' }}>{row.gramNeg || row.cvRisk}</td>
                        <td style={{ padding: '0.7rem', fontWeight: 800 }}>{row.anaerobes || row.renalRisk}</td>
                        <td style={{ padding: '0.7rem' }}>{row.atypicals || row.dose}</td>
                        <td style={{ padding: '0.7rem', fontWeight: 800, color: row.pseudomonas !== '0' ? '#ef4444' : 'var(--text-muted)' }}>{row.pseudomonas || '—'}</td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: '0.7rem', fontWeight: 800 }}>{row.drug}</td>
                        <td style={{ padding: '0.7rem' }}>{row.coxSelectivity}</td>
                        <td style={{ padding: '0.7rem', color: '#ef4444', fontWeight: 700 }}>{row.giRisk}</td>
                        <td style={{ padding: '0.7rem', color: '#f59e0b', fontWeight: 700 }}>{row.cvRisk}</td>
                        <td style={{ padding: '0.7rem' }}>{row.renalRisk}</td>
                        <td style={{ padding: '0.7rem', fontSize: '0.78rem' }}>{row.dose}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'my_meds' && (
        <div className="card" style={{ padding: '1.5rem', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Pill size={22} color="var(--primary)" />
                Patient Medication Regimen List & Safety Monitor
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0.2rem 0 0 0' }}>
                Track active patient medication regimens, doses, schedules, and start dates.
              </p>
            </div>

            <button
              onClick={() => {
                if (!newMedName) return alert('Please enter a medication name');
                const newEntry = {
                  id: Date.now(),
                  name: newMedName,
                  dose: newMedDose || 'Standard Dose',
                  freq: newMedFreq,
                  startDate: new Date().toISOString().split('T')[0],
                  notes: newMedNotes
                };
                setMyMeds([...myMeds, newEntry]);
                setNewMedName('');
                setNewMedDose('');
                setNewMedNotes('');
              }}
              className="btn btn-primary"
              style={{ fontWeight: 800, borderRadius: '8px' }}
            >
              + Add Medication
            </button>
          </div>

          <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>Medication Name</label>
              <input type="text" className="input" placeholder="e.g. Ondansetron 8mg" value={newMedName} onChange={e => setNewMedName(e.target.value)} style={{ borderRadius: '8px' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>Dosage / Strength</label>
              <input type="text" className="input" placeholder="e.g. 1 Tablet (8mg)" value={newMedDose} onChange={e => setNewMedDose(e.target.value)} style={{ borderRadius: '8px' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>Frequency</label>
              <select className="select" value={newMedFreq} onChange={e => setNewMedFreq(e.target.value)} style={{ borderRadius: '8px' }}>
                <option value="OD (Once daily)">OD (Once daily)</option>
                <option value="BD (Twice daily)">BD (Twice daily)</option>
                <option value="TDS (Three times daily)">TDS (Three times daily)</option>
                <option value="QID (Four times daily)">QID (Four times daily)</option>
                <option value="PRN / SOS (As needed)">PRN / SOS (As needed)</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>Patient Instructions</label>
              <input type="text" className="input" placeholder="e.g. Take after breakfast" value={newMedNotes} onChange={e => setNewMedNotes(e.target.value)} style={{ borderRadius: '8px' }} />
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.7rem' }}>Medication</th>
                  <th style={{ padding: '0.7rem' }}>Dose</th>
                  <th style={{ padding: '0.7rem' }}>Frequency</th>
                  <th style={{ padding: '0.7rem' }}>Start Date</th>
                  <th style={{ padding: '0.7rem' }}>Notes</th>
                  <th style={{ padding: '0.7rem', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {myMeds.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.7rem', fontWeight: 800, color: 'var(--text-main)' }}>{m.name}</td>
                    <td style={{ padding: '0.7rem' }}>{m.dose}</td>
                    <td style={{ padding: '0.7rem', fontWeight: 700, color: 'var(--primary)' }}>{m.freq}</td>
                    <td style={{ padding: '0.7rem', color: 'var(--text-muted)' }}>{m.startDate}</td>
                    <td style={{ padding: '0.7rem' }}>{m.notes || '—'}</td>
                    <td style={{ padding: '0.7rem', textAlign: 'right' }}>
                      <button
                        onClick={() => setMyMeds(myMeds.filter(item => item.id !== m.id))}
                        className="btn btn-sm btn-secondary"
                        style={{ fontSize: '0.75rem', color: '#ef4444', borderRadius: '6px' }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'favorites' && (
        <div className="card" style={{ padding: '1.5rem', borderRadius: '12px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Star size={22} color="#eab308" style={{ fill: '#eab308' }} />
            Bookmarked Clinical Favorites ({favorites.length})
          </h2>

          {favorites.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: '10px' }}>
              No favorites saved yet. Click "Favorite" on any drug monograph to bookmark it here.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.85rem' }}>
              {favorites.map((f: any) => (
                <div key={f.id} style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '10px', backgroundColor: 'var(--bg-surface)' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{f.generic_name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{f.therapeutic_class}</div>
                  {f.rx_status && <span className="badge badge-primary" style={{ marginTop: '0.4rem', fontSize: '0.7rem' }}>{f.rx_status}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
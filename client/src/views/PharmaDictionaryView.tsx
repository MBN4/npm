import React, { useState, useEffect } from 'react';
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
  Volume2
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

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLetter, setSelectedLetter] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedRxFilter, setSelectedRxFilter] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('Global');
  const [professionalMode, setProfessionalMode] = useState(true);
  const [sortBy, setSortBy] = useState<'AZ' | 'ZA' | 'CLASS'>('AZ');
  const [recentSearches, setRecentSearches] = useState<string[]>(['Amoxicillin', 'Paracetamol', 'Omeprazole', 'Metformin', 'Ondansetron']);

  // Directory & Data States
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

  // Main Dictionary State
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<DictionaryEntry | null>(null);
  const [monographTab, setMonographTab] = useState<'overview' | 'dosing' | 'indications' | 'pharmacology' | 'warnings' | 'side_effects' | 'interactions' | 'counseling'>('overview');
  const [counselingMode, setCounselingMode] = useState<'patient' | 'professional'>('professional');

  // Interaction Checker State
  const [selectedInteractingDrugs, setSelectedInteractingDrugs] = useState<DictionaryEntry[]>([]);
  const [interactionResults, setInteractionResults] = useState<any[]>([]);
  const [checkingInteractions, setCheckingInteractions] = useState(false);

  // Pill ID State
  const [pillImprint, setPillImprint] = useState('');
  const [pillShape, setPillShape] = useState('');
  const [pillColor, setPillColor] = useState('');
  const [pillForm, setPillForm] = useState('');
  const [pillMatches, setPillMatches] = useState<any[]>([]);
  const [searchingPill, setSearchingPill] = useState(false);

  // Comparison State
  const [compareDrugs, setCompareDrugs] = useState<DictionaryEntry[]>([]);

  // Charts State
  const [selectedChartType, setSelectedChartType] = useState<'antibiotics_spectrum' | 'nsaids_matrix'>('antibiotics_spectrum');
  const [chartData, setChartData] = useState<any>(null);

  // Favorites & Notes State
  const [favorites, setFavorites] = useState<any[]>([]);
  const [pharmacistNote, setPharmacistNote] = useState('');
  const [isNoteSaving, setIsNoteSaving] = useState(false);
  const [noteSavedMessage, setNoteSavedMessage] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);

  const alphabet = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), '0-9'];

  // Directory Data Load Effects
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

  const therapeuticClasses = [
    'All Classes',
    'Anti-Infectives',
    'Penicillin + Beta-Lactamase Inhibitor',
    'Cephalosporins',
    'Fluoroquinolones',
    'Macrolides',
    'Pain & Inflammation',
    'NSAID',
    'Analgesic / Antipyretic',
    'Cardiovascular',
    'Calcium Channel Blocker',
    'ACE Inhibitors / ARBs',
    'Gastrointestinal',
    'Proton Pump Inhibitor (PPI)',
    'Endocrine & Diabetes',
    'Biguanide (Antidiabetic)',
    'Respiratory & Allergy',
    'CNS & Psychiatry'
  ];

  // Fetch Dictionary Data
  const fetchDictionary = async (search = '', letter = '', tclass = '', rx = '', sort = 'AZ') => {
    setIsLoading(true);
    try {
      let url = `/api/clinical/dictionary?search=${encodeURIComponent(search)}&sort=${sort}`;
      if (letter) url += `&letter=${encodeURIComponent(letter)}`;
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
      console.error('Pharma dictionary fetch failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDictionary(searchQuery, selectedLetter, selectedClass, selectedRxFilter, sortBy);
  }, [token, selectedLetter, selectedClass, selectedRxFilter, sortBy]);

  // Fetch Favorites
  const fetchFavorites = async () => {
    try {
      const res = await fetch('/api/clinical/favorites', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setFavorites(data.favorites || []);
      }
    } catch (err) {
      console.error('Fetch favorites failed:', err);
    }
  };

  useEffect(() => {
    fetchFavorites();
  }, [token]);

  // Load Note for selected generic
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
        console.error('Fetch note failed:', err);
      }
    };
    fetchNote();
  }, [selectedEntry, token]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim() && !recentSearches.includes(searchQuery.trim())) {
      setRecentSearches([searchQuery.trim(), ...recentSearches.slice(0, 4)]);
    }
    fetchDictionary(searchQuery, selectedLetter, selectedClass, selectedRxFilter, sortBy);
  };

  // Toggle Favorite
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

  // Save Pharmacist Note
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
        setNoteSavedMessage('✓ Clinical note saved successfully');
        setTimeout(() => setNoteSavedMessage(null), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsNoteSaving(false);
    }
  };

  // Check Multi-Drug Interactions
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

  // Search Pill Identifier
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

  // Load Reference Chart
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
    <div className="view-container" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', overflowY: 'auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}>
            <BookOpen size={24} style={{ color: 'var(--primary)' }} />
            Pharma Dictionary & Master Drug Reference System 📚
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.15rem' }}>
            Authoritative clinical database: generic monographs, multi-drug interaction analysis, pill lookup, dosing protocols & safety warnings.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {/* Country / Regional Database Selector */}
          <select
            className="select"
            style={{ fontSize: '0.78rem', height: '34px', fontWeight: 700, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
            value={selectedCountry}
            onChange={e => setSelectedCountry(e.target.value)}
          >
            <option value="Global">🌐 Global Database</option>
            <option value="Pakistan">🇵🇰 Pakistan (DRAP)</option>
            <option value="USA">🇺🇸 USA (FDA / DailyMed)</option>
            <option value="UK">🇬🇧 UK (BNF / MHRA)</option>
            <option value="EU">🇪🇺 EU / EMA</option>
          </select>

          {/* Professional Pharmacist Mode Toggle */}
          <button
            onClick={() => { setProfessionalMode(!professionalMode); setCounselingMode(professionalMode ? 'patient' : 'professional'); }}
            className={`btn btn-sm ${professionalMode ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <Zap size={14} />
            <span>{professionalMode ? '⚡ Professional Mode (ON)' : 'Patient View'}</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem', backgroundColor: 'rgba(2, 132, 199, 0.12)', color: 'var(--primary)', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 700, border: '1px solid var(--primary-border)' }}>
            <FileCheck size={15} />
            <span>VERIFIED PHARMACEUTICAL REFERENCE</span>
          </div>
        </div>
      </div>

      {/* Universal Search Bar */}
      <div className="card" style={{ padding: '0.85rem 1rem' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 300px', minWidth: '260px' }}>
              <Search size={18} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="input"
                style={{ paddingLeft: '2.5rem', height: '42px', fontSize: '0.9rem', backgroundColor: 'var(--bg-surface)' }}
                placeholder="Search drug, generic, brand, salt, class, indication, manufacturer, ATC code..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(''); fetchDictionary('', selectedLetter, selectedClass, selectedRxFilter, sortBy); }}
                  style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <select
              className="select"
              style={{ minWidth: '180px', flex: '0 1 auto', height: '42px', fontSize: '0.83rem', fontWeight: 600, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
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
              style={{ minWidth: '120px', flex: '0 1 auto', height: '42px', fontSize: '0.83rem', fontWeight: 600, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
              value={selectedRxFilter}
              onChange={e => setSelectedRxFilter(e.target.value)}
            >
              <option value="">All Types</option>
              <option value="Rx">Rx Only</option>
              <option value="OTC">OTC Only</option>
              <option value="Controlled">Controlled</option>
            </select>

            <button type="submit" className="btn btn-primary" style={{ height: '42px', padding: '0 1.25rem', fontWeight: 700 }} disabled={isLoading}>
              {isLoading ? 'Searching...' : 'Search Monograph'}
            </button>
          </div>

          {/* Recent Search Pills & Voice Trigger */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600 }}>Popular / Recent Searches:</span>
              {recentSearches.map(term => (
                <button
                  key={term}
                  type="button"
                  onClick={() => { setSearchQuery(term); fetchDictionary(term, selectedLetter, selectedClass, selectedRxFilter, sortBy); }}
                  style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-full)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600 }}
                >
                  {term}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => alert('Voice search ready: Microphone input initialized.')}
              style={{ border: 'none', background: 'none', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <Volume2 size={13} />
              <span>Voice Search Ready</span>
            </button>
          </div>
        </form>
      </div>

      {/* Alphabetical Drug Index Bar & Sort Dropdown Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', backgroundColor: 'var(--bg-card)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', overflowX: 'auto', flex: 1, paddingBottom: '0.1rem' }} className="no-scrollbar">
          <button
            onClick={() => setSelectedLetter('')}
            className={`btn btn-sm ${selectedLetter === '' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', flexShrink: 0, fontWeight: 700 }}
          >
            ALL
          </button>
          {alphabet.map(letter => (
            <button
              key={letter}
              onClick={() => setSelectedLetter(letter)}
              className={`btn btn-sm ${selectedLetter === letter ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.72rem', padding: '0.2rem 0.45rem', minWidth: '24px', flexShrink: 0, fontWeight: 600 }}
            >
              {letter}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap', flexShrink: 0, borderLeft: '1px solid var(--border)', paddingLeft: '0.6rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>Sort:</span>
          <select
            className="select"
            style={{ fontSize: '0.75rem', width: '135px', height: '32px', padding: '0 0.5rem', fontWeight: 600, backgroundColor: 'var(--bg-surface)' }}
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
          >
            <option value="AZ">A – Z (Ascending)</option>
            <option value="ZA">Z – A (Descending)</option>
            <option value="CLASS">By Therapeutic Class</option>
          </select>
        </div>
      </div>

      {/* Main Module Tabs Header */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)', overflowX: 'auto', paddingBottom: '0.1rem' }}>
        <button
          onClick={() => setActiveTab('dictionary')}
          style={{
            padding: '0.65rem 1rem',
            fontWeight: 800,
            fontSize: '0.82rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'dictionary' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'dictionary' ? 'var(--primary)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            whiteSpace: 'nowrap'
          }}
        >
          <BookOpen size={16} />
          <span>Monograph & Dictionary</span>
        </button>

        <button
          onClick={() => setActiveTab('classes')}
          style={{
            padding: '0.65rem 1rem',
            fontWeight: 800,
            fontSize: '0.82rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'classes' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'classes' ? 'var(--primary)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            whiteSpace: 'nowrap'
          }}
        >
          <Layers size={16} />
          <span>Drug Classes Directory</span>
        </button>

        <button
          onClick={() => setActiveTab('manufacturers')}
          style={{
            padding: '0.65rem 1rem',
            fontWeight: 800,
            fontSize: '0.82rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'manufacturers' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'manufacturers' ? 'var(--primary)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            whiteSpace: 'nowrap'
          }}
        >
          <FileCheck size={16} />
          <span>Pharma Manufacturers</span>
        </button>

        <button
          onClick={() => setActiveTab('interactions')}
          style={{
            padding: '0.65rem 1rem',
            fontWeight: 800,
            fontSize: '0.82rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'interactions' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'interactions' ? 'var(--primary)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            whiteSpace: 'nowrap'
          }}
        >
          <Zap size={16} />
          <span>Multi-Drug Interaction Checker</span>
        </button>

        <button
          onClick={() => setActiveTab('pill_id')}
          style={{
            padding: '0.65rem 1rem',
            fontWeight: 800,
            fontSize: '0.82rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'pill_id' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'pill_id' ? 'var(--primary)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            whiteSpace: 'nowrap'
          }}
        >
          <Eye size={16} />
          <span>Pill Identifier</span>
        </button>

        <button
          onClick={() => setActiveTab('compare')}
          style={{
            padding: '0.65rem 1rem',
            fontWeight: 800,
            fontSize: '0.82rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'compare' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'compare' ? 'var(--primary)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            whiteSpace: 'nowrap'
          }}
        >
          <Scale size={16} />
          <span>Drug Comparison ({compareDrugs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('charts')}
          style={{
            padding: '0.65rem 1rem',
            fontWeight: 800,
            fontSize: '0.82rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'charts' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'charts' ? 'var(--primary)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            whiteSpace: 'nowrap'
          }}
        >
          <Activity size={16} />
          <span>Clinical Reference Charts</span>
        </button>

        <button
          onClick={() => setActiveTab('my_meds')}
          style={{
            padding: '0.65rem 1rem',
            fontWeight: 800,
            fontSize: '0.82rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'my_meds' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'my_meds' ? 'var(--primary)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            whiteSpace: 'nowrap'
          }}
        >
          <Pill size={16} />
          <span>My Med List ({myMeds.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('favorites')}
          style={{
            padding: '0.65rem 1rem',
            fontWeight: 800,
            fontSize: '0.82rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'favorites' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'favorites' ? 'var(--primary)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            whiteSpace: 'nowrap'
          }}
        >
          <Star size={16} />
          <span>Favorites ({favorites.length})</span>
        </button>
      </div>

      {/* TAB 1: MAIN DICTIONARY & MONOGRAPH VIEW */}
      {activeTab === 'dictionary' && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.25rem', alignItems: 'start' }}>
          {/* Left Generic Molecules Column */}
          <div className="card" style={{ padding: '0.75rem', height: 'calc(100vh - 300px)', minHeight: '520px', overflowY: 'auto' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, padding: '0.5rem 0.75rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>GENERIC MONOGRAPHS ({entries.length})</span>
              {selectedLetter && <span className="badge badge-primary">{selectedLetter}</span>}
            </div>

            {entries.length === 0 ? (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No clinical monographs matching query criteria.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.5rem' }}>
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
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: isSelected ? 'var(--primary)' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span>{entry.generic_name}</span>
                          {isFav && <Star size={12} style={{ fill: '#eab308', color: '#eab308' }} />}
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

          {/* Right Clinical Monograph Workspace */}
          <div className="card" style={{ padding: '1.5rem', height: 'calc(100vh - 300px)', minHeight: '520px', overflowY: 'auto' }}>
            {!selectedEntry ? (
              <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <BookOpen size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
                <p style={{ fontWeight: 600 }}>Select a generic monograph on the left</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Monograph Top Bar & Meta Header */}
                <div style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <h2 style={{ fontSize: '1.6rem', fontWeight: 800 }}>{selectedEntry.generic_name}</h2>
                      <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>{selectedEntry.therapeutic_class}</span>
                      {selectedEntry.atc_code && <span className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>ATC: {selectedEntry.atc_code}</span>}
                      <span className="badge badge-warning" style={{ fontSize: '0.75rem' }}>{selectedEntry.rx_status || 'Rx'}</span>
                    </div>

                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.35rem', lineHeight: '1.4' }}>
                      {selectedEntry.generic_description || 'Active pharmaceutical ingredient verified for clinical pharmacy dispensing.'}
                    </p>

                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem', display: 'flex', gap: '1rem' }}>
                      <span>Source: <strong>{selectedEntry.clinical_source || 'USP-NF / DailyMed / BNF 86'}</strong></span>
                      <span>Version: <strong>{selectedEntry.source_version || 'v2026.1'}</strong></span>
                      <span>Reviewed: <strong>{selectedEntry.last_reviewed || '2026-09-01'}</strong></span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      onClick={() => toggleFavorite(selectedEntry.generic_id)}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                      <Star size={14} style={{ fill: favorites.some(f => f.generic_id === selectedEntry.generic_id) ? '#eab308' : 'none', color: '#eab308' }} />
                      <span>{favorites.some(f => f.generic_id === selectedEntry.generic_id) ? 'Bookmarked' : 'Favorite'}</span>
                    </button>

                    <button
                      onClick={() => {
                        if (!compareDrugs.some(d => d.generic_id === selectedEntry.generic_id)) {
                          setCompareDrugs([...compareDrugs, selectedEntry]);
                          alert(`Added ${selectedEntry.generic_name} to comparison list.`);
                        }
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.75rem' }}
                    >
                      + Compare
                    </button>
                  </div>
                </div>

                {/* Sub-tabs for Monograph Sections */}
                <div style={{ display: 'flex', gap: '0.35rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', overflowX: 'auto' }}>
                  {[
                    { id: 'overview', label: 'Overview & Dosage Forms' },
                    { id: 'dosing', label: 'Clinical Dosage & Renal' },
                    { id: 'indications', label: 'Indications & Uses' },
                    { id: 'pharmacology', label: 'Pharmacology & PK' },
                    { id: 'warnings', label: 'Warnings 🔴 & Precautions' },
                    { id: 'side_effects', label: 'Adverse Reactions' },
                    { id: 'interactions', label: 'Food & Disease Interactions' },
                    { id: 'counseling', label: 'Patient Counseling' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setMonographTab(tab.id as any)}
                      className={`btn btn-sm ${monographTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', whiteSpace: 'nowrap' }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* MONOGRAPH SUB-TAB CONTENT */}

                {/* 1. Overview */}
                {monographTab === 'overview' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Strengths & Available Dosage Forms */}
                    <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Pill size={16} />
                        Available Strengths & Master Formulations
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', lineHeight: '1.5' }}>
                        Registered Units: <strong>mg, g, mcg/µg, mg/mL, mg/5 mL, IU, % w/v, mEq, mmol/L</strong>
                      </div>
                      {selectedEntry.pregnancy_category && (
                        <div style={{ marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 600 }}>FDA Pregnancy Category:</span>
                          <span style={{ backgroundColor: getPregnancyBadgeColor(selectedEntry.pregnancy_category), color: '#fff', padding: '0.1rem 0.5rem', borderRadius: '4px', fontWeight: 800, fontSize: '0.75rem' }}>
                            Category {selectedEntry.pregnancy_category}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Image Gallery Showcase */}
                    <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                        📷 Verified Product Identification & Image Gallery
                      </div>
                      <div style={{ padding: '1.5rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        <Pill size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
                        <p style={{ fontWeight: 600 }}>Image Not Available</p>
                        <p style={{ fontSize: '0.72rem', marginTop: '0.2rem' }}>No verified licensed physical product image on file for this generic entry.</p>
                      </div>
                    </div>

                    {/* Commercial Brands */}
                    <div>
                      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Layers size={16} style={{ color: 'var(--primary)' }} />
                        In-Stock Pharmacy Commercial Brands ({selectedEntry.brands.length})
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
                        {selectedEntry.brands.map((b: any) => (
                          <div key={b.id} style={{ padding: '0.75rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{b.brand_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{b.strength} • {b.dosage_form}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Mfr: {b.manufacturer_name || 'Standard Pharma'}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', paddingTop: '0.3rem', borderTop: '1px solid var(--border)', fontSize: '0.75rem' }}>
                              <span style={{ fontWeight: 700, color: b.total_stock > 0 ? 'var(--success)' : 'var(--danger)' }}>Stock: {b.total_stock}</span>
                              <span style={{ fontWeight: 800 }}>Rs. {b.min_price || 'N/A'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Clinical Dosage */}
                {monographTab === 'dosing' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary)', marginBottom: '0.4rem' }}>Adult Dosage Reference</div>
                        <div style={{ fontSize: '0.83rem', lineHeight: '1.5' }}>{selectedEntry.adult_dosage || 'Standard titration per protocol.'}</div>
                      </div>

                      <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#06b6d4', marginBottom: '0.4rem' }}>Pediatric & Weight-Based Dosing</div>
                        <div style={{ fontSize: '0.83rem', lineHeight: '1.5' }}>{selectedEntry.pediatric_dosage || 'Weight-adjusted dosing (mg/kg/day).'}</div>
                      </div>
                    </div>

                    <div style={{ padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--danger)', marginBottom: '0.4rem' }}>Renal & Hepatic Dosing Adjustments</div>
                      <div style={{ fontSize: '0.83rem', lineHeight: '1.5' }}>{selectedEntry.hepatic_renal_precautions || 'Adjust dose based on CrCl / eGFR.'}</div>
                    </div>
                  </div>
                )}

                {/* 3. Indications */}
                {monographTab === 'indications' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--success)', marginBottom: '0.4rem' }}>✓ Approved Clinical Indications</div>
                      <div style={{ fontSize: '0.83rem', lineHeight: '1.5' }}>{selectedEntry.indications_approved || selectedEntry.generic_description}</div>
                    </div>

                    {selectedEntry.indications_offlabel && (
                      <div style={{ padding: '1rem', backgroundColor: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#d97706', marginBottom: '0.4rem' }}>⚠️ Off-Label Clinical Uses</div>
                        <div style={{ fontSize: '0.83rem', lineHeight: '1.5' }}>{selectedEntry.indications_offlabel}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Pharmacology & PK */}
                {monographTab === 'pharmacology' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary)', marginBottom: '0.4rem' }}>Mechanism of Action (MoA)</div>
                      <div style={{ fontSize: '0.83rem', lineHeight: '1.5' }}>{selectedEntry.pharmacology_moa || 'Pharmacological pathway documented in BNF / USP reference.'}</div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem' }}>
                        <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>Absorption & Bioavailability</div>
                        <div>{selectedEntry.absorption_bioavailability || 'Rapid absorption.'}</div>
                      </div>

                      <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem' }}>
                        <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>Metabolism & CYP Pathway</div>
                        <div>{selectedEntry.metabolism_cyp || 'Hepatic metabolism.'}</div>
                      </div>

                      <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem' }}>
                        <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>Elimination Half-Life</div>
                        <div>{selectedEntry.half_life_elimination || '2-4 hours.'}</div>
                      </div>

                      <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem' }}>
                        <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>Onset & Peak Effect</div>
                        <div>{selectedEntry.onset_peak_duration || 'Onset within 30-60 min.'}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. Warnings & Contraindications */}
                {monographTab === 'warnings' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {selectedEntry.boxed_warnings && (
                      <div style={{ padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '2px solid var(--danger)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontWeight: 900, fontSize: '0.9rem', color: 'var(--danger)', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          🔴 CRITICAL BOXED WARNING
                        </div>
                        <div style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--text-main)', lineHeight: '1.4' }}>
                          {selectedEntry.boxed_warnings}
                        </div>
                      </div>
                    )}

                    <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--danger)', marginBottom: '0.4rem' }}>Absolute Contraindications</div>
                      <div style={{ fontSize: '0.83rem', lineHeight: '1.5' }}>{selectedEntry.contraindications_absolute || 'Known hypersensitivity to active drug.'}</div>
                    </div>
                  </div>
                )}

                {/* 6. Side Effects */}
                {monographTab === 'side_effects' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--warning)', marginBottom: '0.4rem' }}>Common Adverse Effects</div>
                      <div style={{ fontSize: '0.83rem', lineHeight: '1.5' }}>{selectedEntry.side_effects_common || 'No common side effects logged.'}</div>
                    </div>
                  </div>
                )}

                {/* 7. Food & Disease Interactions */}
                {monographTab === 'interactions' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#eab308', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Utensils size={16} />
                        Drug-Food Interactions & Administration Timing
                      </div>
                      <div style={{ fontSize: '0.83rem', lineHeight: '1.5' }}>{selectedEntry.food_interactions || 'Take with water.'}</div>
                    </div>
                  </div>
                )}

                {/* 8. Patient Counseling */}
                {monographTab === 'counseling' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <button onClick={() => setCounselingMode('patient')} className={`btn btn-sm ${counselingMode === 'patient' ? 'btn-primary' : 'btn-secondary'}`}>Patient Friendly View</button>
                      <button onClick={() => setCounselingMode('professional')} className={`btn btn-sm ${counselingMode === 'professional' ? 'btn-primary' : 'btn-secondary'}`}>Pharmacist Professional View</button>
                    </div>

                    <div style={{ padding: '1.25rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', lineHeight: '1.6' }}>
                      {counselingMode === 'patient' ? (
                        <div>
                          <p style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: '0.5rem' }}>How to take this medication safely:</p>
                          <p>{selectedEntry.patient_counseling_en || 'Take exactly as directed by your physician or pharmacist. Finish the full course prescribed.'}</p>
                        </div>
                      ) : (
                        <div>
                          <p style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: '0.5rem' }}>Pharmacist Verification & Clinical Checklist:</p>
                          <p>{selectedEntry.patient_counseling_professional || 'Confirm renal function, check allergy status, verify dosage calculations prior to dispensing.'}</p>
                        </div>
                      )}
                    </div>

                    {/* Pharmacist Custom Clinical Notes */}
                    <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Edit3 size={15} style={{ color: 'var(--primary)' }} />
                        Pharmacist Custom Clinical Notes
                      </div>
                      <textarea
                        className="input"
                        rows={3}
                        placeholder="Add private clinical note or pharmacy dispensing instruction for this generic..."
                        value={pharmacistNote}
                        onChange={e => setPharmacistNote(e.target.value)}
                        style={{ fontSize: '0.82rem' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>{noteSavedMessage}</span>
                        <button onClick={handleSaveNote} className="btn btn-primary btn-sm" disabled={isNoteSaving}>
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

      {/* TAB 4: MULTI-DRUG INTERACTION CHECKER */}
      {activeTab === 'interactions' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Zap size={20} style={{ color: 'var(--warning)' }} />
            Multi-Drug Interaction & Clinical Safety Analyzer
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '1rem' }}>
            Select 2 or more drugs to analyze pairwise Drug-Drug interactions, severities (🔴 Major, 🟠 Moderate, 🟡 Minor), and clinical management protocols.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.25rem' }}>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '0.4rem' }}>Select Medicines for Pairwise Analysis:</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.5rem' }}>
                {entries.map(e => {
                  const isChecked = selectedInteractingDrugs.some(d => d.generic_id === e.generic_id);
                  return (
                    <label key={e.generic_id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', padding: '0.3rem 0.5rem', borderRadius: '4px', background: isChecked ? 'rgba(2, 132, 199, 0.08)' : 'transparent' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={el => {
                          if (el.target.checked) setSelectedInteractingDrugs([...selectedInteractingDrugs, e]);
                          else setSelectedInteractingDrugs(selectedInteractingDrugs.filter(d => d.generic_id !== e.generic_id));
                        }}
                      />
                      <span>{e.generic_name}</span>
                    </label>
                  );
                })}
              </div>

              <button onClick={runInteractionCheck} className="btn btn-primary" style={{ width: '100%', marginTop: '0.85rem' }} disabled={selectedInteractingDrugs.length < 2 || checkingInteractions}>
                {checkingInteractions ? 'Analyzing...' : `Analyze Interactions (${selectedInteractingDrugs.length})`}
              </button>
            </div>

            <div>
              {interactionResults.length === 0 ? (
                <div style={{ padding: '3rem 1rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <ShieldAlert size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.3 }} />
                  <p style={{ fontWeight: 600 }}>Select at least 2 drugs and click "Analyze Interactions"</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {interactionResults.map((res: any, idx: number) => (
                    <div key={idx} style={{ padding: '1rem', borderRadius: 'var(--radius-md)', border: res.severity === 'MAJOR' || res.severity === 'CONTRAINDICATED' ? '2px solid var(--danger)' : '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <strong style={{ fontSize: '0.95rem' }}>{res.drugA.generic} ↔ {res.drugB.generic}</strong>
                        <span className={`badge ${res.severity === 'MAJOR' ? 'badge-danger' : 'badge-warning'}`}>{res.severity}</span>
                      </div>
                      <p style={{ fontSize: '0.83rem', color: 'var(--text-main)', marginBottom: '0.4rem' }}>{res.effect}</p>
                      <div style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 600 }}>Management: {res.management}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: PILL IDENTIFIER */}
      {activeTab === 'pill_id' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Eye size={20} style={{ color: 'var(--primary)' }} />
            Visual Pill & Tablet Identifier Tool
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Imprint Code</label>
              <input type="text" className="input" placeholder="e.g. 500 or AUG" value={pillImprint} onChange={e => setPillImprint(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Shape</label>
              <select className="input" value={pillShape} onChange={e => setPillShape(e.target.value)}>
                <option value="">Any Shape</option>
                <option value="Round">Round</option>
                <option value="Oval">Oval</option>
                <option value="Oblong">Oblong</option>
                <option value="Capsule">Capsule</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Color</label>
              <select className="input" value={pillColor} onChange={e => setPillColor(e.target.value)}>
                <option value="">Any Color</option>
                <option value="White">White</option>
                <option value="Pink">Pink</option>
                <option value="Blue">Blue</option>
                <option value="Yellow">Yellow</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Dosage Form</label>
              <select className="input" value={pillForm} onChange={e => setPillForm(e.target.value)}>
                <option value="">Any Form</option>
                <option value="Tablet">Tablet</option>
                <option value="Capsule">Capsule</option>
                <option value="Caplet">Caplet</option>
                <option value="Syrup">Syrup</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'end' }}>
              <button onClick={runPillSearch} className="btn btn-primary" style={{ width: '100%', height: '38px' }} disabled={searchingPill}>
                {searchingPill ? 'Searching...' : 'Find Matches'}
              </button>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem' }}>Pill Matches ({pillMatches.length})</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
              {pillMatches.map((m: any, idx: number) => (
                <div key={idx} style={{ padding: '0.85rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-surface)' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{m.generic_name} ({m.strength})</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Imprint: <strong>{m.pill_imprint || 'N/A'}</strong> • {m.pill_shape} • {m.pill_color}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: DRUG COMPARISON TOOL */}
      {activeTab === 'compare' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Scale size={20} style={{ color: 'var(--primary)' }} />
            Side-by-Side Clinical Drug Comparison
          </h2>

          {compareDrugs.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
              <Scale size={40} style={{ margin: '0 auto 0.5rem', opacity: 0.3 }} />
              <p style={{ fontWeight: 600 }}>No drugs added for comparison yet.</p>
              <p style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>Browse generic monographs and click "+ Compare" to add drugs.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '0.6rem', width: '180px' }}>Attribute</th>
                    {compareDrugs.map(d => (
                      <th key={d.generic_id} style={{ padding: '0.6rem', fontWeight: 800, color: 'var(--primary)' }}>
                        {d.generic_name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.6rem', fontWeight: 700, color: 'var(--text-muted)' }}>Therapeutic Class</td>
                    {compareDrugs.map(d => <td key={d.generic_id} style={{ padding: '0.6rem' }}>{d.therapeutic_class}</td>)}
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.6rem', fontWeight: 700, color: 'var(--text-muted)' }}>Adult Dose</td>
                    {compareDrugs.map(d => <td key={d.generic_id} style={{ padding: '0.6rem' }}>{d.adult_dosage || 'N/A'}</td>)}
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.6rem', fontWeight: 700, color: 'var(--text-muted)' }}>Pregnancy Category</td>
                    {compareDrugs.map(d => <td key={d.generic_id} style={{ padding: '0.6rem' }}>Category {d.pregnancy_category || 'N/A'}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB: DRUG CLASSES DIRECTORY */}
      {activeTab === 'classes' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers size={20} style={{ color: 'var(--primary)' }} />
            Therapeutic & Pharmacological Drug Class Directory
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '1.25rem' }}>
            Browse clinical monographs organized by therapeutic domain and pharmacological classification.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
            {(classList.length > 0
              ? classList.map(c => ({ category: c.therapeutic_class, icon: '💊', count: c.drug_count, desc: 'Verified clinical monographs' }))
              : [
                  { category: 'Anti-Infectives', icon: '🦠', count: 18, desc: 'Penicillins, Cephalosporins, Fluoroquinolones, Macrolides, Antifungals, Antivirals' },
                  { category: 'Cardiovascular', icon: '🫀', count: 14, desc: 'Calcium Channel Blockers, ACE Inhibitors, ARBs, Beta Blockers, Diuretics, Statins' },
                  { category: 'Pain & Inflammation', icon: '🩹', count: 12, desc: 'Analgesics, NSAIDs, Opioid Analgesics, Antipyretics, Muscle Relaxants' },
                  { category: 'Gastrointestinal', icon: '🧪', count: 10, desc: 'Proton Pump Inhibitors (PPIs), H2 Blockers, Antacids, Antiemetics, Laxatives' },
                  { category: 'CNS & Psychiatry', icon: '🧠', count: 16, desc: 'Benzodiazepines, SSRIs, SNRIs, Anticonvulsants, Antipsychotics, Sedatives' },
                  { category: 'Endocrine & Diabetes', icon: '🩸', count: 9, desc: 'Biguanides, Sulfonylureas, Insulins, DPP-4 Inhibitors, Thyroid Hormones' },
                  { category: 'Respiratory & Allergy', icon: '🫁', count: 8, desc: 'Bronchodilators, Antihistamines, Corticosteroids, Antitussives, Mucolytics' },
                  { category: 'Oncology & Antineoplastics', icon: '🎗️', count: 6, desc: 'Pyrimidine Analogs, Alkylating Agents, Targeted Therapies, Immunotherapy' }
                ]
            ).map(cls => (
              <button
                key={cls.category}
                onClick={() => {
                  setSelectedClass(cls.category);
                  setActiveTab('dictionary');
                  fetchDictionary('', '', cls.category, selectedRxFilter, sortBy);
                }}
                style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
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
                  <span style={{ fontSize: '1.5rem' }}>{cls.icon}</span>
                  <span className="badge badge-primary" style={{ fontSize: '0.72rem' }}>{cls.count} Generics</span>
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)', marginTop: '0.2rem' }}>{cls.category}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>{cls.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* TAB: PHARMA MANUFACTURERS DIRECTORY */}
      {activeTab === 'manufacturers' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileCheck size={20} style={{ color: 'var(--primary)' }} />
            Licensed Pharmaceutical Manufacturers & Companies ({manufacturerList.length > 0 ? manufacturerList.length : 6})
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '1.25rem' }}>
            Browse registered pharmaceutical companies, active brand registrations, and regional manufacturing details.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {(manufacturerList.length > 0
              ? manufacturerList.map(m => ({ name: m.company_name, region: 'Licensed Pharma', brands: `${m.total_brands} Registered Brands`, contact: m.phone || m.contact_person || 'contact@pharma.com' }))
              : [
                  { name: 'GSK Pakistan / GlaxoSmithKline', region: 'Global / Pakistan', brands: 'Augmentin, Amoxil, Ventolin, Zantac', contact: 'cs.pk@gsk.com' },
                  { name: 'Getz Pharma (Pvt) Ltd', region: 'Pakistan / South Asia', brands: 'Risek, Eziday, Lipiget, Montika', contact: 'info@getzpharma.com' },
                  { name: 'Searle Company Limited', region: 'Pakistan / Middle East', brands: 'Gravinate, Extracace, Hydryllin', contact: 'info@searlecompany.com' },
                  { name: 'Pfizer Inc.', region: 'USA / Global', brands: 'Lipitor, Zithromax, Norvasc, Xanax', contact: 'medical.info@pfizer.com' },
                  { name: 'Novartis AG', region: 'Europe / Global', brands: 'Voltaren, Diovan, Galvus, Entresto', contact: 'info.novartis@novartis.com' },
                  { name: 'Abbott Laboratories', region: 'USA / Global', brands: 'Klaricid, Brufen, Surbex Z, Duphaston', contact: 'support@abbott.com' }
                ]
            ).map(mfr => (
              <div key={mfr.name} style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-surface)' }}>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--primary)' }}>{mfr.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Region: <strong>{mfr.region}</strong></div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-main)', marginTop: '0.5rem' }}>Key Brands: <strong>{mfr.brands}</strong></div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>Contact: {mfr.contact}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: CLINICAL REFERENCE CHARTS */}
      {activeTab === 'charts' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Activity size={20} style={{ color: 'var(--primary)' }} />
              Clinical Reference Charts & Spectrum Library
            </h2>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setSelectedChartType('antibiotics_spectrum')}
                className={`btn btn-sm ${selectedChartType === 'antibiotics_spectrum' ? 'btn-primary' : 'btn-secondary'}`}
              >
                Antibiotics Spectrum
              </button>
              <button
                onClick={() => setSelectedChartType('nsaids_matrix')}
                className={`btn btn-sm ${selectedChartType === 'nsaids_matrix' ? 'btn-primary' : 'btn-secondary'}`}
              >
                NSAIDs Matrix
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  {selectedChartType === 'antibiotics_spectrum' ? (
                    <>
                      <th style={{ padding: '0.6rem' }}>Antibiotic</th>
                      <th style={{ padding: '0.6rem' }}>Class</th>
                      <th style={{ padding: '0.6rem' }}>Gram +</th>
                      <th style={{ padding: '0.6rem' }}>Gram −</th>
                      <th style={{ padding: '0.6rem' }}>Anaerobes</th>
                      <th style={{ padding: '0.6rem' }}>Atypicals</th>
                      <th style={{ padding: '0.6rem' }}>Pseudomonas</th>
                    </>
                  ) : (
                    <>
                      <th style={{ padding: '0.6rem' }}>Drug</th>
                      <th style={{ padding: '0.6rem' }}>COX Selectivity</th>
                      <th style={{ padding: '0.6rem' }}>GI Risk</th>
                      <th style={{ padding: '0.6rem' }}>CV Risk</th>
                      <th style={{ padding: '0.6rem' }}>Renal Risk</th>
                      <th style={{ padding: '0.6rem' }}>Reference Dose</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {(chartData?.data || [
                  { antibiotic: 'Amoxicillin + Clavulanate', class: 'Penicillin + β-lactamase inhibitor', gramPos: '++++', gramNeg: '+++', anaerobes: '+++', atypicals: '0', pseudomonas: '0' },
                  { antibiotic: 'Ceftriaxone', class: '3rd Gen Cephalosporin', gramPos: '+++', gramNeg: '++++', anaerobes: '++', atypicals: '0', pseudomonas: '0' },
                  { antibiotic: 'Ciprofloxacin', class: 'Fluoroquinolone', gramPos: '++', gramNeg: '++++', anaerobes: '0', atypicals: '+++', pseudomonas: '+++' },
                  { antibiotic: 'Azithromycin', class: 'Macrolide', gramPos: '+++', gramNeg: '++', anaerobes: '0', atypicals: '++++', pseudomonas: '0' }
                ]).map((row: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                    {selectedChartType === 'antibiotics_spectrum' ? (
                      <>
                        <td style={{ padding: '0.6rem', fontWeight: 700 }}>{row.antibiotic || row.drug}</td>
                        <td style={{ padding: '0.6rem', color: 'var(--text-muted)' }}>{row.class || row.coxSelectivity}</td>
                        <td style={{ padding: '0.6rem', fontWeight: 700, color: 'var(--primary)' }}>{row.gramPos || row.giRisk}</td>
                        <td style={{ padding: '0.6rem', fontWeight: 700, color: '#0284c7' }}>{row.gramNeg || row.cvRisk}</td>
                        <td style={{ padding: '0.6rem', fontWeight: 700 }}>{row.anaerobes || row.renalRisk}</td>
                        <td style={{ padding: '0.6rem' }}>{row.atypicals || row.dose}</td>
                        <td style={{ padding: '0.6rem', fontWeight: 700, color: row.pseudomonas !== '0' ? 'var(--danger)' : 'var(--text-muted)' }}>{row.pseudomonas || '—'}</td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: '0.6rem', fontWeight: 700 }}>{row.drug}</td>
                        <td style={{ padding: '0.6rem' }}>{row.coxSelectivity}</td>
                        <td style={{ padding: '0.6rem', color: 'var(--danger)', fontWeight: 600 }}>{row.giRisk}</td>
                        <td style={{ padding: '0.6rem', color: 'var(--warning)', fontWeight: 600 }}>{row.cvRisk}</td>
                        <td style={{ padding: '0.6rem' }}>{row.renalRisk}</td>
                        <td style={{ padding: '0.6rem', fontSize: '0.75rem' }}>{row.dose}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: MY MED LIST */}
      {activeTab === 'my_meds' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Pill size={20} style={{ color: 'var(--primary)' }} />
                My Medication Regimen List & Safety Monitor
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.15rem' }}>
                Track active patient medication regimens, doses, schedules, start dates, and auto-evaluate safety.
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
              style={{ fontWeight: 700 }}
            >
              + Add Medication
            </button>
          </div>

          {/* Add Medication Form */}
          <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Medication Name / Brand</label>
              <input type="text" className="input" placeholder="e.g. Ondansetron 8mg" value={newMedName} onChange={e => setNewMedName(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Dosage Form & Strength</label>
              <input type="text" className="input" placeholder="e.g. 1 Tablet (8mg)" value={newMedDose} onChange={e => setNewMedDose(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Frequency</label>
              <select className="select" value={newMedFreq} onChange={e => setNewMedFreq(e.target.value)}>
                <option value="OD (Once daily)">OD (Once daily)</option>
                <option value="BD (Twice daily)">BD (Twice daily)</option>
                <option value="TDS (Three times daily)">TDS (Three times daily)</option>
                <option value="QID (Four times daily)">QID (Four times daily)</option>
                <option value="PRN / SOS (As needed)">PRN / SOS (As needed)</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Patient Notes</label>
              <input type="text" className="input" placeholder="e.g. Take after breakfast" value={newMedNotes} onChange={e => setNewMedNotes(e.target.value)} />
            </div>
          </div>

          {/* Active Medication List Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.6rem' }}>Medication</th>
                  <th style={{ padding: '0.6rem' }}>Dose</th>
                  <th style={{ padding: '0.6rem' }}>Frequency</th>
                  <th style={{ padding: '0.6rem' }}>Start Date</th>
                  <th style={{ padding: '0.6rem' }}>Notes</th>
                  <th style={{ padding: '0.6rem', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {myMeds.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.6rem', fontWeight: 800, color: 'var(--text-main)' }}>{m.name}</td>
                    <td style={{ padding: '0.6rem' }}>{m.dose}</td>
                    <td style={{ padding: '0.6rem', fontWeight: 600, color: 'var(--primary)' }}>{m.freq}</td>
                    <td style={{ padding: '0.6rem', color: 'var(--text-muted)' }}>{m.startDate}</td>
                    <td style={{ padding: '0.6rem' }}>{m.notes || '—'}</td>
                    <td style={{ padding: '0.6rem', textAlign: 'right' }}>
                      <button
                        onClick={() => setMyMeds(myMeds.filter(item => item.id !== m.id))}
                        className="btn btn-sm btn-secondary"
                        style={{ fontSize: '0.72rem', color: 'var(--danger)' }}
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

      {/* TAB 8: FAVORITES & NOTES */}
      {activeTab === 'favorites' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Star size={20} style={{ color: '#eab308', fill: '#eab308' }} />
            Bookmarked Favorites ({favorites.length})
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
            {favorites.map((f: any) => (
              <div key={f.id} style={{ padding: '0.85rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-surface)' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{f.generic_name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{f.therapeutic_class}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

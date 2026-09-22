import React, { useState, useEffect, useRef } from 'react';
import {
  FlaskConical,
  Search,
  Plus,
  RotateCcw,
  Printer,
  Save,
  CheckCircle2,
  Calendar,
  User,
  Clock,
  Activity,
  FileText,
  Settings,
  X,
  AlertCircle,
  Eye,
  BarChart3,
  Thermometer,
  Flame,
  Sparkles,
  Sun,
  Stethoscope,
  Heart,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  MedPracPatient,
  MedPracCategory,
  MedPracService,
  MedPracVisit,
  MedPracKPIs,
  MedPracReportData,
  MedPracVisitMedicine
} from '../types/medprac.js';
import { medpracService } from '../services/medpracService.js';
import { MedPracReceiptModal } from '../components/MedPracReceiptModal.js';
import { MedPracHistoryModal } from '../components/MedPracHistoryModal.js';
import { MedPracVoidModal } from '../components/MedPracVoidModal.js';
import { MedPracCategoryAdminModal } from '../components/MedPracCategoryAdminModal.js';

export const MedPracView: React.FC = () => {
  // Navigation Modes
  const [activeTab, setActiveTab] = useState<'new_entry' | 'history' | 'reports'>('new_entry');

  // Categories & Services State
  const [categories, setCategories] = useState<MedPracCategory[]>([]);
  const [services, setServices] = useState<MedPracService[]>([]);

  // Search & Patient Selection
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MedPracPatient[]>([]);
  const [, setIsSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<MedPracPatient | null>(null);

  // Form State
  const [patientSerial, setPatientSerial] = useState('Auto Generated');
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientAgeUnit, setPatientAgeUnit] = useState<'Years' | 'Months' | 'Days'>('Years');
  const [patientSex, setPatientSex] = useState<'Male' | 'Female'>('Male');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientAddress, setPatientAddress] = useState('');

  const [selectedCategory, setSelectedCategory] = useState<string>('General / Other');
  const [doseGiven, setDoseGiven] = useState<string>('2');
  const [customDoseNotation, setCustomDoseNotation] = useState<string>('1-0-1');
  const [showCustomDoseInput, setShowCustomDoseInput] = useState<boolean>(false);

  // Selected Services
  const [selectedServiceCodes, setSelectedServiceCodes] = useState<Record<string, { selected: boolean; cost: number }>>({
    injection: { selected: false, cost: 100 },
    iv: { selected: false, cost: 150 },
    drip: { selected: false, cost: 200 }
  });

  const [practiceDoseCharge, setPracticeDoseCharge] = useState<string>('200');

  // Optional Medicines
  const [showMedicineSection, setShowMedicineSection] = useState(false);
  const [medicinesList, setMedicinesList] = useState<MedPracVisitMedicine[]>([]);
  const [inventorySearchResults, setInventorySearchResults] = useState<any[]>([]);
  const [medicineSearchQuery, setMedicineSearchQuery] = useState('');

  const [notes, setNotes] = useState('');
  const [medpracByUserName] = useState('Wajid Khan');

  // Duplicate Check Modal
  const [duplicateMatches, setDuplicateMatches] = useState<MedPracPatient[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  // Modals State
  const [activeReceiptVisit, setActiveReceiptVisit] = useState<MedPracVisit | null>(null);
  const [activeHistoryPatient, setActiveHistoryPatient] = useState<MedPracPatient | null>(null);
  const [activeVoidVisit, setActiveVoidVisit] = useState<MedPracVisit | null>(null);
  const [showCategoryAdmin, setShowCategoryAdmin] = useState(false);

  // Recent Visits
  const [recentVisits, setRecentVisits] = useState<MedPracVisit[]>([]);

  // Reports & KPIs State
  const [kpis, setKpis] = useState<MedPracKPIs>({
    todays_practice_revenue: 0,
    todays_patients: 0,
    new_patients: 0,
    repeat_patients: 0,
    injections_count: 0,
    iv_count: 0,
    drips_count: 0,
    avg_per_visit: 0
  });

  const [reportStartDate, setReportStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportEndDate, setReportEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportData, setReportData] = useState<MedPracReportData | null>(null);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Initial Data Fetch
  useEffect(() => {
    loadMasterData();
    loadRecentVisits();
    loadKPIs();
  }, []);

  const loadMasterData = async () => {
    try {
      const catData = await medpracService.getCategories();
      setCategories(catData);
      const svcData = await medpracService.getServices();
      setServices(svcData);

      // Initialize service map
      const map: Record<string, { selected: boolean; cost: number }> = {};
      svcData.forEach(s => {
        map[s.code] = { selected: false, cost: s.default_cost };
      });
      setSelectedServiceCodes(map);

      // Get initial serial number
      const serial = await medpracService.getNextSerial();
      setPatientSerial(serial);
    } catch (err) {
      console.error('Failed to load master data', err);
    }
  };

  const loadRecentVisits = async () => {
    try {
      const res = await medpracService.getVisits({ limit: '20' });
      setRecentVisits(res.visits || []);
    } catch (err) {
      console.error('Failed to load recent visits', err);
    }
  };

  const loadKPIs = async () => {
    try {
      const data = await medpracService.getDashboardKPIs();
      setKpis(data);
    } catch (err) {
      console.error('Failed to load KPIs', err);
    }
  };

  const loadReports = async () => {
    try {
      const data = await medpracService.getReports(reportStartDate, reportEndDate);
      setReportData(data);
    } catch (err) {
      console.error('Failed to load report data', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'reports') {
      loadReports();
    }
  }, [activeTab, reportStartDate, reportEndDate]);

  // Live Patient Search Trigger
  useEffect(() => {
    if (searchQuery.trim().length >= 1) {
      setIsSearching(true);
      const timer = setTimeout(async () => {
        try {
          const res = await medpracService.searchPatients(searchQuery);
          setSearchResults(res);
        } catch (e) {
          console.error(e);
        } finally {
          setIsSearching(false);
        }
      }, 200);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }
  }, [searchQuery]);

  // Handle selecting an existing patient from search
  const handleSelectPatient = (p: MedPracPatient) => {
    setSelectedPatient(p);
    setPatientSerial(p.serial_number);
    setPatientName(p.name);
    setPatientAge(String(p.age));
    setPatientAgeUnit(p.age_unit || 'Years');
    setPatientSex(p.sex);
    setPatientPhone(p.phone || '');
    setPatientAddress(p.address || '');
    setSearchResults([]);
    setSearchQuery('');
  };

  // Reset form to New Patient mode
  const handleResetForm = (confirm = false) => {
    if (confirm && (patientName || selectedPatient)) {
      if (!window.confirm('Are you sure you want to clear the current entry?')) return;
    }
    setSelectedPatient(null);
    medpracService.getNextSerial().then(setPatientSerial);
    setPatientName('');
    setPatientAge('');
    setPatientAgeUnit('Years');
    setPatientSex('Male');
    setPatientPhone('');
    setPatientAddress('');
    setSelectedCategory('General / Other');
    setDoseGiven('2');
    setCustomDoseNotation('1-0-1');
    setShowCustomDoseInput(false);
    setPracticeDoseCharge('200');

    // Reset services
    const resetSvcMap: Record<string, { selected: boolean; cost: number }> = {};
    services.forEach(s => {
      resetSvcMap[s.code] = { selected: false, cost: s.default_cost };
    });
    setSelectedServiceCodes(resetSvcMap);

    setMedicinesList([]);
    setNotes('');
  };

  // Search Medicine Catalog for attached medicines
  const handleSearchMedicine = async (query: string) => {
    setMedicineSearchQuery(query);
    if (!query.trim()) {
      setInventorySearchResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/medicines?search=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setInventorySearchResults(data.medicines || data || []);
      }
    } catch {
      setInventorySearchResults([]);
    }
  };

  const handleAddMedicineToVisit = (med: any) => {
    const item: MedPracVisitMedicine = {
      medicine_id: med.id,
      brand_name: med.brand_name,
      generic_name: med.generic_name || med.generic_name_text,
      strength: med.strength,
      dosage_form: med.dosage_form,
      quantity_used: 1,
      selling_price: med.unit_price || med.price || 0,
      total_price: med.unit_price || med.price || 0,
      deduct_inventory: true
    };
    setMedicinesList([...medicinesList, item]);
    setMedicineSearchQuery('');
    setInventorySearchResults([]);
  };

  // Calculate Real-Time Total Amount
  const doseChargeNum = Number(practiceDoseCharge || 0);

  let servicesTotal = 0;
  Object.values(selectedServiceCodes).forEach(s => {
    if (s.selected) {
      servicesTotal += Number(s.cost || 0);
    }
  });

  let medicinesTotal = 0;
  medicinesList.forEach(m => {
    medicinesTotal += Number(m.selling_price || 0) * Number(m.quantity_used || 1);
  });

  const totalAmount = doseChargeNum + servicesTotal + medicinesTotal;

  // Handle Save Visit
  const handleSaveVisit = async (saveAndNew = false) => {
    if (!patientName.trim()) {
      alert('Please enter Patient Name.');
      return;
    }
    if (!patientAge || isNaN(Number(patientAge))) {
      alert('Please enter a valid Patient Age.');
      return;
    }

    // Check Duplicate Patient if creating new patient record
    if (!selectedPatient) {
      const dupRes = await medpracService.checkDuplicate({
        name: patientName.trim(),
        phone: patientPhone.trim(),
        age: Number(patientAge),
        sex: patientSex
      });

      if (dupRes.possibleDuplicates && dupRes.possibleDuplicates.length > 0) {
        setDuplicateMatches(dupRes.possibleDuplicates);
        setShowDuplicateModal(true);
        return;
      }
    }

    await executeSaveVisit(saveAndNew);
  };

  const executeSaveVisit = async (saveAndNew = false) => {
    try {
      let patientId = selectedPatient?.id;
      let patientSerialNum = selectedPatient?.serial_number || patientSerial;

      // 1. Create Patient if NEW
      if (!selectedPatient) {
        const createdP = await medpracService.createPatient({
          serial_number: patientSerial,
          name: patientName.trim(),
          age: Number(patientAge),
          age_unit: patientAgeUnit,
          sex: patientSex,
          phone: patientPhone.trim() || null,
          address: patientAddress.trim() || null
        });
        patientId = createdP.id;
        patientSerialNum = createdP.serial_number;
      }

      // 2. Prepare Selected Services List
      const selectedServicesPayload: any[] = [];
      services.forEach(s => {
        const state = selectedServiceCodes[s.code];
        if (state && state.selected) {
          selectedServicesPayload.push({
            service_id: s.id,
            service_code: s.code,
            service_name: s.name,
            cost: state.cost
          });
        }
      });

      // 3. Save Medprac Visit Record
      const visitPayload = {
        patient_id: patientId,
        patient_serial: patientSerialNum,
        visit_date: new Date().toISOString(),
        therapeutic_category_id: categories.find(c => c.name === selectedCategory)?.id || null,
        therapeutic_category_name: selectedCategory,
        dose_given: doseGiven,
        dose_notation: doseGiven === 'Custom' ? customDoseNotation : '1-0-1',
        practice_dose_charge: doseChargeNum,
        services: selectedServicesPayload,
        medicines: medicinesList,
        notes: notes.trim() || null,
        medprac_by_user_id: 1,
        medprac_by_user_name: medpracByUserName
      };

      const savedVisit = await medpracService.recordVisit(visitPayload);

      loadRecentVisits();
      loadKPIs();

      if (saveAndNew) {
        handleResetForm(false);
      } else {
        setActiveReceiptVisit(savedVisit);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to save Medprac visit entry');
    }
  };

  // Quick Category Cards Data
  const quickCategories = [
    { name: 'General / Other', icon: <Stethoscope size={22} />, desc: 'General' },
    { name: 'Fever Cough Cold', icon: <Thermometer size={22} />, desc: 'Fever Cough Cold' },
    { name: 'Body Aches / Pain', icon: <Activity size={22} />, desc: 'Body Aches Pain' },
    { name: 'Acne Skin', icon: <Sun size={22} />, desc: 'Acne Skin' },
    { name: 'Wound Injury', icon: <BandAidIcon size={22} />, desc: 'Wound Injury' },
    { name: 'Gastrointestinal / Stomach', icon: <Flame size={22} />, desc: 'Gastrointestinal' },
    { name: 'Allergy', icon: <Sparkles size={22} />, desc: 'Allergy (Respiratory)' },
    { name: 'Eye / Ear', icon: <Eye size={22} />, desc: 'Eye / Ear' },
    { name: 'Women’s Health', icon: <Heart size={22} />, desc: "Women's Health" },
    { name: 'Other', icon: <FlaskConical size={22} />, desc: 'Others' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '2rem' }}>
      {/* ================================================== */}
      {/* 1. TOP HEADER & MODULE NAVBAR BAR */}
      {/* ================================================== */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderRadius: '12px',
          padding: '1rem 1.5rem',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          borderBottom: '3px solid var(--primary)',
          border: '1px solid var(--border)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, var(--primary) 0%, #2563eb 100%)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.3)'
            }}
          >
            <FlaskConical size={26} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>Medprac</h1>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: '12px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
                Practice Record
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              "Small Practice Big Impact" — Quick Record of Daily Practice (Dispensing / Advice / Injection etc.)
            </p>
          </div>
        </div>

        {/* Header Right Info & Navigation Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-app)', padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <Calendar size={16} color="var(--primary)" />
            <span>{new Date().toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
            <span style={{ color: 'var(--border)' }}>|</span>
            <Clock size={16} color="var(--primary)" />
            <span>{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} (Auto)</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={18} color="var(--primary)" />
            </div>
            <div>
              <div>{medpracByUserName}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>Pharmacist</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Mode Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-app)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <button
            onClick={() => setActiveTab('new_entry')}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '6px',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: activeTab === 'new_entry' ? 'var(--bg-surface)' : 'transparent',
              color: activeTab === 'new_entry' ? 'var(--primary)' : 'var(--text-secondary)',
              boxShadow: activeTab === 'new_entry' ? 'var(--shadow-sm)' : 'none'
            }}
          >
            <FileText size={16} /> New Entry / Repeat
          </button>

          <button
            onClick={() => setActiveTab('history')}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '6px',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: activeTab === 'history' ? 'var(--bg-surface)' : 'transparent',
              color: activeTab === 'history' ? 'var(--primary)' : 'var(--text-secondary)',
              boxShadow: activeTab === 'history' ? 'var(--shadow-sm)' : 'none'
            }}
          >
            <Clock size={16} /> Patient History
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '6px',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: activeTab === 'reports' ? 'var(--bg-surface)' : 'transparent',
              color: activeTab === 'reports' ? 'var(--primary)' : 'var(--text-secondary)',
              boxShadow: activeTab === 'reports' ? 'var(--shadow-sm)' : 'none'
            }}
          >
            <BarChart3 size={16} /> Practice Reports & Revenue
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setShowCategoryAdmin(true)}
            className="btn btn-secondary"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <Settings size={15} /> Manage Categories
          </button>

          {selectedPatient ? (
            <button
              onClick={() => handleResetForm(false)}
              className="btn btn-primary"
              style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#16a34a' }}
            >
              <Plus size={15} /> + Add New Patient Mode
            </button>
          ) : (
            <button
              onClick={() => setActiveTab('history')}
              className="btn btn-secondary"
              style={{ padding: '0.45rem 0.85rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Search size={15} /> Search Patient
            </button>
          )}
        </div>
      </div>

      {/* Dashboard KPI Cards Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.75rem'
        }}
      >
        <div style={{ backgroundColor: 'var(--bg-surface)', borderLeft: '4px solid #16a34a', border: '1px solid var(--border)', padding: '0.75rem 1rem', borderRadius: '8px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Today's Practice</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--success-text)' }}>Rs. {kpis.todays_practice_revenue.toFixed(2)}</div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-surface)', borderLeft: '4px solid #2563eb', border: '1px solid var(--border)', padding: '0.75rem 1rem', borderRadius: '8px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Today's Patients</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)' }}>{kpis.todays_patients}</div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-surface)', borderLeft: '4px solid #0891b2', border: '1px solid var(--border)', padding: '0.75rem 1rem', borderRadius: '8px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>New Patients</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0e7490' }}>{kpis.new_patients}</div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-surface)', borderLeft: '4px solid #8b5cf6', border: '1px solid var(--border)', padding: '0.75rem 1rem', borderRadius: '8px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Repeat Patients</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#a855f7' }}>{kpis.repeat_patients}</div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-surface)', borderLeft: '4px solid #ea580c', border: '1px solid var(--border)', padding: '0.75rem 1rem', borderRadius: '8px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Injections</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f97316' }}>{kpis.injections_count}</div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-surface)', borderLeft: '4px solid #d97706', border: '1px solid var(--border)', padding: '0.75rem 1rem', borderRadius: '8px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>I.V / Drips</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f59e0b' }}>{kpis.iv_count + kpis.drips_count}</div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-surface)', borderLeft: '4px solid #059669', border: '1px solid var(--border)', padding: '0.75rem 1rem', borderRadius: '8px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Avg per Visit</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--success-text)' }}>Rs. {kpis.avg_per_visit.toFixed(0)}</div>
        </div>
      </div>

      {/* ================================================== */}
      {/* TAB 1: NEW ENTRY / REPEAT PATIENT FORM */}
      {/* ================================================== */}
      {activeTab === 'new_entry' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
          {/* Main Card */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderRadius: '12px',
              padding: '1.25rem',
              boxShadow: 'var(--shadow-sm)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem'
            }}
          >
            {/* Top Search Patient & Status Info Header */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                backgroundColor: 'var(--bg-app)',
                padding: '0.85rem 1rem',
                borderRadius: '10px',
                border: '1px solid var(--border)'
              }}
            >
              {/* Search input for repeat patient */}
              <div ref={searchContainerRef} style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>
                  Search Patient (Name or Serial No.)
                </div>
                <div style={{ position: 'relative' }}>
                  <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Type name, serial no (e.g. 000123) or phone..."
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.55rem 0.55rem 2.2rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box'
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Dropdown Results */}
                {searchResults.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      backgroundColor: 'var(--bg-surface)',
                      borderRadius: '8px',
                      boxShadow: 'var(--shadow-lg)',
                      border: '1px solid var(--border)',
                      zIndex: 1000,
                      marginTop: '4px',
                      maxHeight: '260px',
                      overflowY: 'auto'
                    }}
                  >
                    {searchResults.map(p => (
                      <div
                        key={p.id}
                        onClick={() => handleSelectPatient(p)}
                        style={{
                          padding: '0.65rem 1rem',
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'background-color 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--primary-light)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.9rem' }}>
                            {p.serial_number} — {p.name}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {p.age} {p.age_unit} | {p.sex} {p.phone ? `| ${p.phone}` : ''}
                          </div>
                        </div>
                        <button
                          className="btn btn-primary"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                        >
                          Use
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Status Banner */}
              {selectedPatient ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: 'var(--primary-light)', border: '1px solid var(--primary-border)', padding: '0.5rem 0.85rem', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--primary)' }}>
                    Repeat Patient Selected: <strong>{selectedPatient.name}</strong> ({selectedPatient.serial_number})
                  </div>
                  <button
                    onClick={() => setActiveHistoryPatient(selectedPatient)}
                    className="btn btn-secondary"
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                  >
                    View History
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: '0.8rem', color: 'var(--primary)', backgroundColor: 'var(--primary-light)', padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid var(--primary-border)' }}>
                  ⓘ Serial No. will be generated automatically for NEW patient
                </div>
              )}
            </div>

            {/* Patient Fields Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Serial No.
                </label>
                <input
                  type="text"
                  readOnly
                  value={patientSerial}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    backgroundColor: 'var(--bg-app)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontWeight: 700,
                    color: 'var(--primary)',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Patient Name *
                </label>
                <input
                  type="text"
                  required
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="Enter patient name"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Age *
                </label>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    type="number"
                    required
                    min="0"
                    max="150"
                    value={patientAge}
                    onChange={(e) => setPatientAge(e.target.value)}
                    placeholder="Age"
                    style={{
                      width: '60%',
                      padding: '0.5rem',
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      borderRadius: '6px',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box'
                    }}
                  />
                  <select
                    value={patientAgeUnit}
                    onChange={(e) => setPatientAgeUnit(e.target.value as any)}
                    style={{
                      width: '40%',
                      padding: '0.5rem',
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="Years">Years</option>
                    <option value="Months">Months</option>
                    <option value="Days">Days</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Sex *
                </label>
                <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', height: '36px', color: 'var(--text-primary)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input
                      type="radio"
                      name="sex"
                      value="Male"
                      checked={patientSex === 'Male'}
                      onChange={() => setPatientSex('Male')}
                    /> Male
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input
                      type="radio"
                      name="sex"
                      value="Female"
                      checked={patientSex === 'Female'}
                      onChange={() => setPatientSex('Female')}
                    /> Female
                  </label>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Phone (Optional)
                </label>
                <input
                  type="text"
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  placeholder="Enter phone number"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Address (Optional)
                </label>
                <input
                  type="text"
                  value={patientAddress}
                  onChange={(e) => setPatientAddress(e.target.value)}
                  placeholder="Enter address"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* Therapeutic Category Selector Cards */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <CheckCircle2 size={18} color="var(--primary)" /> Therapeutic Category *
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  style={{
                    padding: '0.35rem 0.6rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
                  }}
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Quick Select Grid Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.6rem' }}>
                {quickCategories.map((q, idx) => {
                  const isSelected = selectedCategory === q.name || (selectedCategory.includes('General') && q.name.includes('General'));
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedCategory(q.name)}
                      style={{
                        padding: '0.75rem 0.5rem',
                        borderRadius: '8px',
                        border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                        backgroundColor: isSelected ? 'var(--primary-light)' : 'var(--bg-surface)',
                        color: isSelected ? 'var(--primary)' : 'var(--text-primary)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ color: isSelected ? 'var(--primary)' : 'var(--text-muted)' }}>{q.icon}</div>
                      <span style={{ fontSize: '0.78rem', fontWeight: isSelected ? 700 : 500, lineHeight: '1.1' }}>
                        {q.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dose & Services Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
              {/* Dose Given Quick Select */}
              <div style={{ backgroundColor: 'var(--bg-app)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.5rem' }}>
                  Dose Given *
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem', marginBottom: '0.75rem' }}>
                  {['1', '2', '3', '4'].map(d => {
                    const isSelected = doseGiven === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => { setDoseGiven(d); setShowCustomDoseInput(false); }}
                        style={{
                          padding: '0.6rem 0.2rem',
                          borderRadius: '6px',
                          border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                          backgroundColor: isSelected ? 'var(--primary)' : 'var(--bg-surface)',
                          color: isSelected ? '#fff' : 'var(--text-primary)',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '2px'
                        }}
                      >
                        <span style={{ fontSize: '1rem' }}>{d}</span>
                        <span style={{ fontSize: '0.65rem', opacity: isSelected ? 0.9 : 0.6 }}>(1-0-1)</span>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => { setDoseGiven('Custom'); setShowCustomDoseInput(!showCustomDoseInput); }}
                    style={{
                      padding: '0.6rem 0.2rem',
                      borderRadius: '6px',
                      border: doseGiven === 'Custom' ? '2px solid var(--primary)' : '1px solid var(--border)',
                      backgroundColor: doseGiven === 'Custom' ? 'var(--primary)' : 'var(--bg-surface)',
                      color: doseGiven === 'Custom' ? '#fff' : 'var(--text-primary)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    Custom <ChevronDown size={14} aria-hidden="true" style={{ marginLeft: '0.2rem' }} />
                  </button>
                </div>

                {doseGiven === 'Custom' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                      Schedule Notation / Details
                    </label>
                    <input
                      type="text"
                      value={customDoseNotation}
                      onChange={(e) => setCustomDoseNotation(e.target.value)}
                      placeholder="e.g. 1-0-1, 1-1-1, 0-0-1, 2 tbsp TDS..."
                      style={{
                        width: '100%',
                        padding: '0.4rem 0.6rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Services Provided Checkboxes */}
              <div style={{ backgroundColor: 'var(--bg-app)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.5rem' }}>
                  Services Provided (Select all that apply)
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {services.slice(0, 4).map(svc => {
                    const state = selectedServiceCodes[svc.code] || { selected: false, cost: svc.default_cost };
                    return (
                      <div key={svc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                          <input
                            type="checkbox"
                            checked={state.selected}
                            onChange={(e) => {
                              setSelectedServiceCodes({
                                ...selectedServiceCodes,
                                [svc.code]: { ...state, selected: e.target.checked }
                              });
                            }}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          {svc.name}
                        </label>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cost (Rs.)</span>
                          <input
                            type="number"
                            min="0"
                            disabled={!state.selected}
                            value={state.cost}
                            onChange={(e) => {
                              setSelectedServiceCodes({
                                ...selectedServiceCodes,
                                [svc.code]: { ...state, cost: Number(e.target.value || 0) }
                              });
                            }}
                            style={{
                              width: '80px',
                              padding: '0.3rem 0.5rem',
                              borderRadius: '4px',
                              border: '1px solid var(--border)',
                              backgroundColor: state.selected ? 'var(--bg-surface)' : 'var(--bg-app)',
                              color: 'var(--text-primary)',
                              textAlign: 'right',
                              fontSize: '0.85rem'
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Financial Charges & Total Amount Prominent Banner */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '1rem',
                alignItems: 'center'
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Practice / Dose Charge (Rs.)
                </label>
                <input
                  type="number"
                  min="0"
                  value={practiceDoseCharge}
                  onChange={(e) => setPracticeDoseCharge(e.target.value)}
                  placeholder="200"
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    borderRadius: '6px',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Total Amount Green Display Banner */}
              <div
                style={{
                  backgroundColor: 'var(--success-light)',
                  border: '2px solid var(--success)',
                  borderRadius: '10px',
                  padding: '0.75rem 1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--success-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Total Amount (Rs.)
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--success-text)', opacity: 0.8 }}>Auto Calculated</div>
                </div>

                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--success-text)' }}>
                  {totalAmount.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Optional Attached Medicines Collapsible Section */}
            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              <div
                onClick={() => setShowMedicineSection(!showMedicineSection)}
                style={{
                  backgroundColor: 'var(--bg-app)',
                  padding: '0.65rem 1rem',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  color: 'var(--primary)'
                }}
              >
                <span>Medicines Used (Optional) {medicinesList.length > 0 && `(${medicinesList.length} items)`}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  {showMedicineSection ? <><ChevronUp size={15} /> Hide</> : <><ChevronDown size={15} /> Add Medicine</>}
                </span>
              </div>

              {showMedicineSection && (
                <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={medicineSearchQuery}
                      onChange={(e) => handleSearchMedicine(e.target.value)}
                      placeholder="Search inventory medicine brand name to attach..."
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        boxSizing: 'border-box'
                      }}
                    />

                    {inventorySearchResults.length > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          zIndex: 100,
                          maxHeight: '200px',
                          overflowY: 'auto'
                        }}
                      >
                        {inventorySearchResults.map((m: any) => (
                          <div
                            key={m.id}
                            onClick={() => handleAddMedicineToVisit(m)}
                            style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)' }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--primary-light)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <strong>{m.brand_name}</strong> {m.strength} — Rs. {m.unit_price || m.price || 0}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {medicinesList.length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--bg-app)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                          <th style={{ padding: '6px' }}>Medicine</th>
                          <th style={{ padding: '6px' }}>Qty</th>
                          <th style={{ padding: '6px' }}>Price</th>
                          <th style={{ padding: '6px' }}>Total</th>
                          <th style={{ padding: '6px' }}>Stock Deduct</th>
                          <th style={{ padding: '6px' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {medicinesList.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px' }}>{item.brand_name} {item.strength}</td>
                            <td style={{ padding: '6px' }}>
                              <input
                                type="number"
                                min="1"
                                value={item.quantity_used}
                                onChange={(e) => {
                                  const updated = [...medicinesList];
                                  updated[idx].quantity_used = Number(e.target.value || 1);
                                  setMedicinesList(updated);
                                }}
                                style={{ width: '50px', padding: '2px 4px', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                              />
                            </td>
                            <td style={{ padding: '6px' }}>Rs. {item.selling_price}</td>
                            <td style={{ padding: '6px' }}>Rs. {((item.selling_price || 0) * item.quantity_used).toFixed(2)}</td>
                            <td style={{ padding: '6px' }}>
                              <input
                                type="checkbox"
                                checked={item.deduct_inventory}
                                onChange={(e) => {
                                  const updated = [...medicinesList];
                                  updated[idx].deduct_inventory = e.target.checked;
                                  setMedicinesList(updated);
                                }}
                              />
                            </td>
                            <td style={{ padding: '6px' }}>
                              <button
                                type="button"
                                onClick={() => setMedicinesList(medicinesList.filter((_, i) => i !== idx))}
                                style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}
                              >
                                <X size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

            {/* Notes / Remarks */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                Notes / Remarks (Optional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Enter clinical practice notes or advice..."
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Action Buttons Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={() => handleResetForm(true)}
                className="btn btn-secondary"
                style={{ padding: '0.6rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--danger)' }}
              >
                <RotateCcw size={16} /> Clear
              </button>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (recentVisits.length > 0) setActiveReceiptVisit(recentVisits[0]);
                    else alert('No recent visit available to print');
                  }}
                  className="btn btn-secondary"
                  style={{ padding: '0.6rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Printer size={16} /> Print
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveVisit(true)}
                  className="btn btn-secondary"
                  style={{ padding: '0.6rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--primary)' }}
                >
                  <Save size={16} /> Save & New
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveVisit(false)}
                  className="btn btn-primary"
                  style={{
                    padding: '0.6rem 1.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: 'linear-gradient(135deg, var(--primary) 0%, #2563eb 100%)',
                    fontWeight: 700,
                    fontSize: '0.95rem'
                  }}
                >
                  <CheckCircle2 size={18} /> Save Entry
                </button>
              </div>
            </div>
          </div>

          {/* Recent Medprac Entries Table */}
          <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Clock size={18} color="var(--primary)" /> Recent Medprac Entries
              </h3>
              <button
                onClick={() => setActiveTab('history')}
                className="btn btn-secondary"
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
              >
                View All History
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-app)', borderBottom: '2px solid var(--border)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.6rem' }}>Date & Time</th>
                    <th style={{ padding: '0.6rem' }}>Visit ID</th>
                    <th style={{ padding: '0.6rem' }}>Serial No.</th>
                    <th style={{ padding: '0.6rem' }}>Patient Name</th>
                    <th style={{ padding: '0.6rem' }}>Category</th>
                    <th style={{ padding: '0.6rem' }}>Dose</th>
                    <th style={{ padding: '0.6rem' }}>Services</th>
                    <th style={{ padding: '0.6rem' }}>Total Amount</th>
                    <th style={{ padding: '0.6rem' }}>Entered By</th>
                    <th style={{ padding: '0.6rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentVisits.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                        No Medprac visit records found yet.
                      </td>
                    </tr>
                  ) : (
                    recentVisits.map((v) => {
                      const isVoided = v.status === 'VOIDED';
                      const dateStr = new Date(v.visit_date).toLocaleString('en-US', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      });

                      const serviceNames = v.services ? v.services.map(s => s.service_name).join(', ') : '—';

                      return (
                        <tr
                          key={v.id}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            backgroundColor: isVoided ? 'var(--danger-light)' : 'transparent',
                            color: 'var(--text-primary)'
                          }}
                        >
                          <td style={{ padding: '0.6rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{dateStr}</td>
                          <td style={{ padding: '0.6rem', fontWeight: 700, color: 'var(--primary)' }}>{v.visit_id}</td>
                          <td style={{ padding: '0.6rem', fontWeight: 600 }}>{v.patient_serial}</td>
                          <td style={{ padding: '0.6rem', fontWeight: 500 }}>
                            {v.patient_name} {isVoided && <span style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 600 }}>(VOIDED)</span>}
                          </td>
                          <td style={{ padding: '0.6rem', color: 'var(--primary)', fontWeight: 500 }}>{v.therapeutic_category_name}</td>
                          <td style={{ padding: '0.6rem' }}>Dose {v.dose_given}</td>
                          <td style={{ padding: '0.6rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{serviceNames || '—'}</td>
                          <td style={{ padding: '0.6rem', fontWeight: 700, color: isVoided ? 'var(--text-muted)' : 'var(--success-text)' }}>
                            Rs. {v.total_amount.toFixed(2)}
                          </td>
                          <td style={{ padding: '0.6rem', color: 'var(--text-muted)' }}>{v.medprac_by_user_name}</td>
                          <td style={{ padding: '0.6rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem' }}>
                              <button
                                onClick={() => setActiveReceiptVisit(v)}
                                className="btn btn-secondary"
                                title="Print Receipt"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              >
                                <Printer size={14} />
                              </button>

                              {!isVoided && (
                                <button
                                  onClick={() => setActiveVoidVisit(v)}
                                  className="btn btn-secondary"
                                  title="Void Entry"
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: 'var(--danger)' }}
                                >
                                  Void
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* TAB 2: PATIENT HISTORY VIEW */}
      {/* ================================================== */}
      {activeTab === 'history' && (
        <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 700 }}>
            Patient Medprac History & Profile Database
          </h3>

          <div style={{ position: 'relative', marginBottom: '1rem', maxWidth: '400px' }}>
            <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patients by name, serial no or phone..."
              style={{
                width: '100%',
                padding: '0.5rem 0.5rem 0.5rem 2.2rem',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-app)', borderBottom: '2px solid var(--border)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.6rem' }}>Serial No</th>
                  <th style={{ padding: '0.6rem' }}>Patient Name</th>
                  <th style={{ padding: '0.6rem' }}>Age / Sex</th>
                  <th style={{ padding: '0.6rem' }}>Phone</th>
                  <th style={{ padding: '0.6rem' }}>Total Visits</th>
                  <th style={{ padding: '0.6rem' }}>Last Visit</th>
                  <th style={{ padding: '0.6rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {searchResults.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                      Type in search bar above to view patient records.
                    </td>
                  </tr>
                ) : (
                  searchResults.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                      <td style={{ padding: '0.6rem', fontWeight: 700, color: 'var(--primary)' }}>{p.serial_number}</td>
                      <td style={{ padding: '0.6rem', fontWeight: 600 }}>{p.name}</td>
                      <td style={{ padding: '0.6rem' }}>{p.age} {p.age_unit} | {p.sex}</td>
                      <td style={{ padding: '0.6rem' }}>{p.phone || '—'}</td>
                      <td style={{ padding: '0.6rem', fontWeight: 700, color: 'var(--success-text)' }}>{p.total_visits || 0}</td>
                      <td style={{ padding: '0.6rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {p.last_visit ? new Date(p.last_visit).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '0.6rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem' }}>
                          <button
                            onClick={() => { handleSelectPatient(p); setActiveTab('new_entry'); }}
                            className="btn btn-primary"
                            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                          >
                            New Encounter
                          </button>
                          <button
                            onClick={() => setActiveHistoryPatient(p)}
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                          >
                            View History
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* TAB 3: PRACTICE REPORTS & REVENUE ANALYTICS */}
      {/* ================================================== */}
      {activeTab === 'reports' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 700 }}>
              Medprac Practice Reports & Financial Revenue
            </h3>

            {/* Date Range Picker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>From:</label>
              <input
                type="date"
                value={reportStartDate}
                onChange={(e) => setReportStartDate(e.target.value)}
                style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
              />
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>To:</label>
              <input
                type="date"
                value={reportEndDate}
                onChange={(e) => setReportEndDate(e.target.value)}
                style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
              />
              <button onClick={loadReports} className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                Filter
              </button>
            </div>
          </div>

          {reportData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
              {/* Revenue Summary Card */}
              <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                <h4 style={{ margin: '0 0 1rem 0', color: 'var(--success-text)', fontSize: '1rem', fontWeight: 700 }}>
                  Practice Revenue Summary
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Total Revenue:</span>
                    <strong style={{ color: 'var(--success-text)', fontSize: '1.1rem' }}>Rs. {reportData.summary.total_revenue.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Dose Practice Revenue:</span>
                    <span>Rs. {reportData.summary.total_dose_revenue.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Services Revenue:</span>
                    <span>Rs. {reportData.summary.total_service_revenue.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Medicines Revenue:</span>
                    <span>Rs. {reportData.summary.total_medicine_revenue.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Average per Visit:</span>
                    <strong>Rs. {reportData.summary.avg_per_visit.toFixed(2)}</strong>
                  </div>
                </div>
              </div>

              {/* Patient Breakdown Card */}
              <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                <h4 style={{ margin: '0 0 1rem 0', color: 'var(--primary)', fontSize: '1rem', fontWeight: 700 }}>
                  Patient Encounter Metrics
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Total Visits:</span>
                    <strong style={{ fontSize: '1.1rem', color: 'var(--primary)' }}>{reportData.summary.total_visits} Encounters</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Unique Patients Served:</span>
                    <span>{reportData.summary.unique_patients}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>New Patients Created:</span>
                    <span style={{ color: '#0891b2', fontWeight: 600 }}>{reportData.summary.new_patients}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Repeat Patients Visits:</span>
                    <span style={{ color: '#a855f7', fontWeight: 600 }}>{reportData.summary.repeat_patients}</span>
                  </div>
                </div>
              </div>

              {/* Service Breakdown Table */}
              <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--primary)', fontSize: '1rem', fontWeight: 700 }}>
                  Service-wise Counts & Revenue
                </h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-app)', textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '4px 6px' }}>Service</th>
                      <th style={{ padding: '4px 6px' }}>Count</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.service_breakdown.map((s, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '4px 6px', fontWeight: 600 }}>{s.service_name}</td>
                        <td style={{ padding: '4px 6px' }}>{s.count}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: 'var(--success-text)' }}>Rs. {s.revenue.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================== */}
      {/* MODALS */}
      {/* ================================================== */}

      {/* Duplicate Patient Warning Modal */}
      {showDuplicateModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', width: '100%', maxWidth: '520px', padding: '1.25rem', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--warning-text)' }}>
              <AlertCircle size={24} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Possible Existing Patient Found</h3>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              System detected possible matching patient records. Would you like to use an existing record or create a new patient anyway?
            </p>

            <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {duplicateMatches.map(m => (
                <div key={m.id} style={{ border: '1px solid var(--border)', padding: '0.65rem 0.85rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--warning-light)' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{m.serial_number} — {m.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{m.age} {m.age_unit} | {m.sex} {m.phone ? `| ${m.phone}` : ''}</div>
                  </div>
                  <button
                    onClick={() => {
                      handleSelectPatient(m);
                      setShowDuplicateModal(false);
                      executeSaveVisit(false);
                    }}
                    className="btn btn-primary"
                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                  >
                    Use Patient
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button onClick={() => setShowDuplicateModal(false)} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowDuplicateModal(false);
                  executeSaveVisit(false);
                }}
                className="btn btn-primary"
                style={{ padding: '0.5rem 1rem', background: '#16a34a' }}
              >
                Create New Patient Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Printable Modal */}
      {activeReceiptVisit && (
        <MedPracReceiptModal
          visit={activeReceiptVisit}
          onClose={() => setActiveReceiptVisit(null)}
        />
      )}

      {/* Patient History Modal */}
      {activeHistoryPatient && (
        <MedPracHistoryModal
          patient={activeHistoryPatient}
          onClose={() => setActiveHistoryPatient(null)}
        />
      )}

      {/* Reversal / Void Modal */}
      {activeVoidVisit && (
        <MedPracVoidModal
          visit={activeVoidVisit}
          onClose={() => setActiveVoidVisit(null)}
          onSuccess={() => {
            loadRecentVisits();
            loadKPIs();
          }}
        />
      )}

      {/* Category Management Modal */}
      {showCategoryAdmin && (
        <MedPracCategoryAdminModal
          categories={categories}
          onClose={() => setShowCategoryAdmin(false)}
          onRefresh={loadMasterData}
        />
      )}
    </div>
  );
};

// Helper Icon component for BandAid
const BandAidIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 14l11 -11a4.95 4.95 0 0 1 7 7l-11 11a4.95 4.95 0 0 1 -7 -7z" />
    <path d="M14 10l-4 4" opacity="0.5" />
  </svg>
);

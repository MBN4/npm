import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext.js';
import {
  FileText,
  Plus,
  RefreshCw,
  Stethoscope,
  Printer,
  Pencil,
  X,
  Trash2,
  Activity,
  ClipboardList,
  Building2,
  Eye
} from 'lucide-react';

export interface PrescriptionItem {
  medicineId: string;
  medicineName: string;
  strength: string;
  route: string;
  dosage: string;
  frequency: string;
  duration: string;
  timing: string;
  instructions: string;
  authorizedQuantity: string;
  unit: string;
}

interface InvestigationEntry {
  testName: string;
  isCustom: boolean;
}

interface ReferralState {
  hospitalName: string;
  customHospital: string;
  department: string;
  specialistName: string;
  reason: string;
  priority: 'Routine' | 'Urgent' | 'Emergency';
  clinicalSummary: string;
  reportsAttached: string;
}

const emptyReferral: ReferralState = {
  hospitalName: '', customHospital: '', department: '', specialistName: '',
  reason: '', priority: 'Routine', clinicalSummary: '', reportsAttached: ''
};

const emptyItem = (): PrescriptionItem => ({
  medicineId: '', medicineName: '', strength: '', route: '',
  dosage: '1 Tablet', frequency: 'BD (Twice Daily)', duration: '5 days', timing: 'After Food',
  instructions: '', authorizedQuantity: '', unit: ''
});

const DOSAGE_PRESETS = [
  '1 Tablet', '2 Tablets', '1/2 Tablet', '1 Capsule', '2 Capsules',
  '5 mL (1 tsp)', '10 mL (2 tsp)', '15 mL (1 tbsp)', '1 Sachet',
  '1 Drop', '2 Drops', '1 Spray', '1 Injection', '1 Suppository'
];

const FREQUENCY_PRESETS = [
  'OD (Once Daily)', 'BD (Twice Daily)', 'TDS (Thrice Daily)', 'QID (4 Times Daily)',
  'Q4H (Every 4 Hours)', 'Q6H (Every 6 Hours)', 'Q8H (Every 8 Hours)', 'Q12H (Every 12 Hours)',
  'STAT (Immediately)', 'HS (At Bedtime)', 'SOS (As Needed)', 'Weekly'
];

const DURATION_PRESETS = [
  '1 day', '2 days', '3 days', '5 days', '7 days (1 Week)', '10 days',
  '14 days (2 Weeks)', '21 days (3 Weeks)', '30 days (1 Month)', '60 days (2 Months)',
  '90 days (3 Months)', 'Continuous'
];

const QUICK_DURATION_CHIPS = ['3 days', '5 days', '7 days', '10 days', '14 days', '30 days'];

const TIMING_PRESETS = ['After Food', 'Before Food', 'With Meals', 'At Bedtime', 'Early Morning', 'Any Time'];

const ROUTE_PRESETS = ['Oral', 'Topical', 'IV', 'IM', 'SC', 'Inhalation', 'Sublingual', 'Rectal', 'Nasal', 'Ophthalmic', 'Otic'];

const COMMON_INVESTIGATIONS = [
  'CBC', 'LFT', 'RFT', 'HbA1c', 'Urine R/E', 'Random Blood Sugar', 'Fasting Blood Sugar',
  'Lipid Profile', 'ECG', 'X-Ray Chest', 'Ultrasound Abdomen', 'Thyroid Profile (TSH)',
  'Urea & Creatinine', 'CRP', 'ESR', 'Hepatitis B/C Screening', 'Stool R/E', 'D-Dimer',
  'Vitamin D', 'Vitamin B12'
];

const HOSPITAL_PRESETS = ['Gosh-e-Shifa', 'BNI'];
const SPECIALTY_PRESETS = ['Neurosurgery', 'Spine Surgery', 'Orthopaedics', 'General Surgery', 'Neurology'];

function todayLocalDate(): string {
  const d = new Date();
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

function newRequestKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `rk_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

export const PrescriptionsView: React.FC = () => {
  const { token, hasPermission } = useAuth();
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedRx, setSelectedRx] = useState<any>(null);
  const [printMode, setPrintMode] = useState<'rx' | 'referral' | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form State - identity
  const [editingPrescriptionId, setEditingPrescriptionId] = useState<number | null>(null);
  const [requestKey, setRequestKey] = useState(newRequestKey());
  const [patientId, setPatientId] = useState('');
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [editingRxPatientId, setEditingRxPatientId] = useState<string | null>(null);
  const [savingPatient, setSavingPatient] = useState(false);
  const [patientError, setPatientError] = useState('');
  const [newPatient, setNewPatient] = useState({ name: '', mobile: '', age: '', gender: 'MALE', allergyNotes: '' });
  const [doctorId, setDoctorId] = useState('');
  const [providerId, setProviderId] = useState('');
  const [visitDate, setVisitDate] = useState(todayLocalDate());
  const [ageYears, setAgeYears] = useState('');
  const [ageMonths, setAgeMonths] = useState('');

  // Vitals (all optional, empty stays empty - never coerced to 0)
  const [pulseBpm, setPulseBpm] = useState('');
  const [bpSystolic, setBpSystolic] = useState('');
  const [bpDiastolic, setBpDiastolic] = useState('');
  const [spo2Percent, setSpo2Percent] = useState('');
  const [randomSugar, setRandomSugar] = useState('');
  const [fastingSugar, setFastingSugar] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [temperatureValue, setTemperatureValue] = useState('');
  const [temperatureUnit, setTemperatureUnit] = useState<'C' | 'F'>('C');

  // Clinical
  const [diagnosis, setDiagnosis] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [clinicalAdvice, setClinicalAdvice] = useState('');
  const [treatmentPlan, setTreatmentPlan] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpInstructions, setFollowUpInstructions] = useState('');

  // Medicines
  const [items, setItems] = useState<PrescriptionItem[]>([emptyItem()]);
  const [medicineDropdownOpenIdx, setMedicineDropdownOpenIdx] = useState<number | null>(null);

  // Investigations
  const [investigations, setInvestigations] = useState<InvestigationEntry[]>([]);
  const [investigationQuery, setInvestigationQuery] = useState('');
  const [investigationInstructions, setInvestigationInstructions] = useState('');

  // Referral
  const [referral, setReferral] = useState<ReferralState>(emptyReferral);

  // Schedule B/D register capture fields - required only when the applicable jurisdiction rule demands it
  const [patientCnic, setPatientCnic] = useState('');
  const [patientMobileOverride, setPatientMobileOverride] = useState('');
  const [patientAddress, setPatientAddress] = useState('');
  const [purchaserName, setPurchaserName] = useState('');
  const [purchaserRelation, setPurchaserRelation] = useState('');
  const [purchaserCnic, setPurchaserCnic] = useState('');
  const [purchaserMobile, setPurchaserMobile] = useState('');
  const [prescriberRegistrationNumber, setPrescriberRegistrationNumber] = useState('');
  const [prescriberAddress, setPrescriberAddress] = useState('');
  const [originalDocumentReference, setOriginalDocumentReference] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [showScheduleFields, setShowScheduleFields] = useState(false);

  const [rxRegisterEntries, setRxRegisterEntries] = useState<any[]>([]);
  const printTriggerRef = useRef<'rx' | 'referral' | null>(null);

  const fetchPrescriptions = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/prescriptions', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setPrescriptions((await res.json()).prescriptions);
    } catch (err) {
      console.error('Error fetching prescriptions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMetadata = async () => {
    try {
      const [patRes, medRes, provRes] = await Promise.all([
        fetch('/api/patients', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/medicines', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/prescriptions/providers', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      if (patRes.ok) setPatients((await patRes.json()).patients);
      if (medRes.ok) setMedicines((await medRes.json()).medicines);
      if (provRes.ok) setProviders((await provRes.json()).providers);
    } catch (err) {
      console.error('Error fetching metadata:', err);
    }
  };

  useEffect(() => {
    fetchPrescriptions();
    fetchMetadata();
  }, [token]);

  // Fires window.print() only after the print-only DOM for the chosen document has actually rendered.
  useEffect(() => {
    if (printMode && printTriggerRef.current === printMode) {
      printTriggerRef.current = null;
      const t = setTimeout(() => window.print(), 80);
      return () => clearTimeout(t);
    }
  }, [printMode]);

  const resetForm = () => {
    setEditingPrescriptionId(null);
    setRequestKey(newRequestKey());
    setPatientId(''); setDoctorId(''); setProviderId(''); setVisitDate(todayLocalDate());
    setAgeYears(''); setAgeMonths('');
    setPulseBpm(''); setBpSystolic(''); setBpDiastolic(''); setSpo2Percent('');
    setRandomSugar(''); setFastingSugar(''); setWeightKg(''); setTemperatureValue(''); setTemperatureUnit('C');
    setDiagnosis(''); setClinicalNotes(''); setClinicalAdvice(''); setTreatmentPlan('');
    setFollowUpDate(''); setFollowUpInstructions('');
    setItems([emptyItem()]);
    setInvestigations([]); setInvestigationQuery(''); setInvestigationInstructions('');
    setReferral(emptyReferral);
    setShowNewPatient(false); setEditingRxPatientId(null);
    setPatientCnic(''); setPatientMobileOverride(''); setPatientAddress('');
    setPurchaserName(''); setPurchaserRelation(''); setPurchaserCnic(''); setPurchaserMobile('');
    setPrescriberRegistrationNumber(''); setPrescriberAddress(''); setOriginalDocumentReference('');
    setAttachmentFile(null); setShowScheduleFields(false);
  };

  const handleItemChange = (index: number, field: keyof PrescriptionItem, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleMedicineQueryChange = (index: number, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], medicineName: value, medicineId: '' };
    setItems(updated);
    setMedicineDropdownOpenIdx(index);
  };

  const selectCatalogMedicine = (index: number, medicine: any) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      medicineId: String(medicine.id),
      medicineName: `${medicine.brand_name}${medicine.strength ? ' ' + medicine.strength : ''}`,
      strength: updated[index].strength || medicine.strength || ''
    };
    setItems(updated);
    setMedicineDropdownOpenIdx(null);
  };

  const matchingMedicines = (query: string) => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    return medicines.filter(m => (m.brand_name || '').toLowerCase().includes(q)).slice(0, 8);
  };

  const handleSavePatient = async () => {
    if (!newPatient.name.trim()) { setPatientError('Patient name is required.'); return; }
    if (newPatient.age && (!Number.isInteger(Number(newPatient.age)) || Number(newPatient.age) < 0 || Number(newPatient.age) > 130)) {
      setPatientError('Enter an age between 0 and 130.'); return;
    }
    setSavingPatient(true);
    setPatientError('');
    try {
      const response = await fetch(editingRxPatientId ? `/api/patients/${editingRxPatientId}` : '/api/patients', {
        method: editingRxPatientId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: newPatient.name.trim(), mobile: newPatient.mobile.trim() || null,
          age: newPatient.age === '' ? null : Number(newPatient.age),
          gender: newPatient.gender, allergyNotes: newPatient.allergyNotes.trim() || null
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save patient.');
      const id = editingRxPatientId || String(data.patientId);
      const savedPatient = {
        id: Number(id), name: newPatient.name.trim(), mobile: newPatient.mobile.trim(),
        age: newPatient.age === '' ? null : Number(newPatient.age), gender: newPatient.gender,
        allergy_notes: newPatient.allergyNotes.trim()
      };
      setPatients(current => editingRxPatientId
        ? current.map(patient => String(patient.id) === id ? { ...patient, ...savedPatient, id: Number(id) } : patient)
        : [...current, savedPatient]);
      setPatientId(id);
      setNewPatient({ name: '', mobile: '', age: '', gender: 'MALE', allergyNotes: '' });
      setEditingRxPatientId(null);
      setShowNewPatient(false);
    } catch (error: any) {
      setPatientError(error.message || 'Could not save patient.');
    } finally {
      setSavingPatient(false);
    }
  };

  const addItemRow = () => setItems([...items, emptyItem()]);
  const removeItemRow = (index: number) => setItems(items.filter((_, i) => i !== index));

  const addInvestigation = (testName: string, isCustom: boolean) => {
    const trimmed = testName.trim();
    if (!trimmed) return;
    if (investigations.some(i => i.testName.toLowerCase() === trimmed.toLowerCase())) {
      setInvestigationQuery('');
      return;
    }
    setInvestigations([...investigations, { testName: trimmed, isCustom }]);
    setInvestigationQuery('');
  };

  const removeInvestigation = (testName: string) => {
    setInvestigations(investigations.filter(i => i.testName !== testName));
  };

  const matchingInvestigations = COMMON_INVESTIGATIONS.filter(t =>
    t.toLowerCase().includes(investigationQuery.trim().toLowerCase()) &&
    !investigations.some(i => i.testName.toLowerCase() === t.toLowerCase())
  );

  const handleOpenRxDetail = async (rxId: number) => {
    try {
      const res = await fetch(`/api/prescriptions/${rxId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setSelectedRx(data);
      }
      if (hasPermission('view_scheduled_register')) {
        const regRes = await fetch(`/api/schedule-bd?prescriptionId=${rxId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (regRes.ok) setRxRegisterEntries((await regRes.json()).entries || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openEditRx = async (rxId: number) => {
    try {
      const res = await fetch(`/api/prescriptions/${rxId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      const p = data.prescription;

      setEditingPrescriptionId(rxId);
      setPatientId(String(p.patient_id));
      setDoctorId(p.doctor_id ? String(p.doctor_id) : '');
      setProviderId(p.provider_id ? String(p.provider_id) : '');
      setVisitDate(p.visit_date || todayLocalDate());
      setAgeYears(p.age_years != null ? String(p.age_years) : '');
      setAgeMonths(p.age_months != null ? String(p.age_months) : '');
      setPulseBpm(p.pulse_bpm != null ? String(p.pulse_bpm) : '');
      setBpSystolic(p.bp_systolic != null ? String(p.bp_systolic) : '');
      setBpDiastolic(p.bp_diastolic != null ? String(p.bp_diastolic) : '');
      setSpo2Percent(p.spo2_percent != null ? String(p.spo2_percent) : '');
      setRandomSugar(p.random_sugar_mgdl != null ? String(p.random_sugar_mgdl) : '');
      setFastingSugar(p.fasting_sugar_mgdl != null ? String(p.fasting_sugar_mgdl) : '');
      setWeightKg(p.weight_kg != null ? String(p.weight_kg) : '');
      setTemperatureValue(p.temperature_value != null ? String(p.temperature_value) : '');
      setTemperatureUnit(p.temperature_unit === 'F' ? 'F' : 'C');
      setDiagnosis(p.diagnosis || '');
      setClinicalNotes(p.clinical_notes || '');
      setClinicalAdvice(p.clinical_advice || '');
      setTreatmentPlan(p.treatment_plan || '');
      setFollowUpDate(p.follow_up_date || '');
      setFollowUpInstructions(p.follow_up_instructions || '');

      setItems(data.items.length > 0 ? data.items.map((it: any) => ({
        medicineId: it.medicine_id ? String(it.medicine_id) : '',
        medicineName: it.medicine_id ? `${it.brand_name}${it.catalog_strength ? ' ' + it.catalog_strength : ''}` : (it.medicine_name || ''),
        strength: it.strength || '',
        route: it.route || '',
        dosage: it.dosage || '',
        frequency: it.frequency || '',
        duration: it.duration || '',
        timing: it.timing || '',
        instructions: it.instructions || '',
        authorizedQuantity: it.authorized_quantity != null ? String(it.authorized_quantity) : '',
        unit: it.unit || ''
      })) : [emptyItem()]);

      setInvestigations((data.investigations || []).map((i: any) => ({ testName: i.test_name, isCustom: !!i.is_custom })));
      setInvestigationInstructions((data.investigations || [])[0]?.instructions || '');

      if (data.referral) {
        const isPreset = HOSPITAL_PRESETS.includes(data.referral.hospital_name);
        setReferral({
          hospitalName: isPreset ? data.referral.hospital_name : (data.referral.hospital_name ? 'Custom' : ''),
          customHospital: isPreset ? '' : (data.referral.hospital_name || ''),
          department: data.referral.department || '',
          specialistName: data.referral.specialist_name || '',
          reason: data.referral.reason || '',
          priority: ['Routine', 'Urgent', 'Emergency'].includes(data.referral.priority) ? data.referral.priority : 'Routine',
          clinicalSummary: data.referral.clinical_summary || '',
          reportsAttached: data.referral.reports_attached || ''
        });
      } else {
        setReferral(emptyReferral);
      }

      setPatientCnic(p.patient_cnic || '');
      setPatientMobileOverride(p.patient_mobile || '');
      setPatientAddress(p.patient_address || '');
      setPurchaserName(p.purchaser_name || ''); setPurchaserRelation(p.purchaser_relation || '');
      setPurchaserCnic(p.purchaser_cnic || ''); setPurchaserMobile(p.purchaser_mobile || '');
      setPrescriberRegistrationNumber(p.prescriber_registration_number || '');
      setPrescriberAddress(p.prescriber_address || '');
      setOriginalDocumentReference(p.original_document_reference || '');

      setShowAddModal(true);
    } catch (err) {
      console.error(err);
    }
  };

  const buildPayload = () => {
    const resolvedHospital = referral.hospitalName === 'Custom' ? referral.customHospital : referral.hospitalName;
    return {
      patientId: Number(patientId),
      doctorId: doctorId ? Number(doctorId) : null,
      providerId: providerId ? Number(providerId) : null,
      visitDate: visitDate || null,
      ageYears: ageYears === '' ? null : ageYears,
      ageMonths: ageMonths === '' ? null : ageMonths,
      diagnosis: diagnosis.trim(),
      clinicalNotes: clinicalNotes.trim() || null,
      clinicalAdvice: clinicalAdvice.trim() || null,
      treatmentPlan: treatmentPlan.trim() || null,
      followUpDate: followUpDate || null,
      followUpInstructions: followUpInstructions.trim() || null,
      pulseBpm: pulseBpm === '' ? null : pulseBpm,
      bpSystolic: bpSystolic === '' ? null : bpSystolic,
      bpDiastolic: bpDiastolic === '' ? null : bpDiastolic,
      spo2Percent: spo2Percent === '' ? null : spo2Percent,
      randomSugar: randomSugar === '' ? null : randomSugar,
      fastingSugar: fastingSugar === '' ? null : fastingSugar,
      weightKg: weightKg === '' ? null : weightKg,
      temperatureValue: temperatureValue === '' ? null : temperatureValue,
      temperatureUnit: temperatureValue === '' ? null : temperatureUnit,
      patientCnic: patientCnic.trim() || null,
      patientMobile: patientMobileOverride.trim() || null,
      patientAddress: patientAddress.trim() || null,
      purchaserName: purchaserName.trim() || null,
      purchaserRelation: purchaserRelation.trim() || null,
      purchaserCnic: purchaserCnic.trim() || null,
      purchaserMobile: purchaserMobile.trim() || null,
      prescriberRegistrationNumber: prescriberRegistrationNumber.trim() || null,
      prescriberAddress: prescriberAddress.trim() || null,
      originalDocumentReference: originalDocumentReference.trim() || null,
      items: items.map(it => ({
        medicineId: it.medicineId || null,
        medicineName: it.medicineId ? null : it.medicineName,
        strength: it.strength,
        route: it.route,
        dosage: it.dosage,
        frequency: it.frequency,
        duration: it.duration,
        timing: it.timing,
        instructions: it.instructions,
        authorizedQuantity: it.authorizedQuantity,
        unit: it.unit
      })),
      investigations: investigations.map(i => ({ testName: i.testName, isCustom: i.isCustom, instructions: investigationInstructions.trim() || null })),
      referral: resolvedHospital || referral.department || referral.specialistName || referral.reason || referral.clinicalSummary || referral.reportsAttached
        ? {
            hospitalName: resolvedHospital,
            department: referral.department,
            specialistName: referral.specialistName,
            reason: referral.reason,
            priority: referral.priority,
            clinicalSummary: referral.clinicalSummary,
            reportsAttached: referral.reportsAttached
          }
        : null
    };
  };

  const handleSubmitPrescription = async (e: React.FormEvent, thenPrint: boolean) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!patientId) {
      setStatusMessage({ text: 'Please select a patient.', type: 'error' });
      return;
    }
    if (isSaving) return; // guards against a repeated click creating a duplicate record

    setIsSaving(true);
    try {
      const payload = buildPayload();
      const isEdit = editingPrescriptionId != null;
      const res = await fetch(isEdit ? `/api/prescriptions/${editingPrescriptionId}` : '/api/prescriptions', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(isEdit ? payload : { ...payload, requestKey })
      });

      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({ text: data.error || 'Failed to save prescription', type: 'error' });
        return;
      }

      const savedId = data.prescriptionId;

      if (attachmentFile && savedId) {
        const formData = new FormData();
        formData.append('file', attachmentFile);
        await fetch(`/api/prescriptions/${savedId}/attachment`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData
        }).catch(() => {});
      }

      setStatusMessage({ text: isEdit ? 'Prescription updated successfully.' : 'Prescription recorded successfully.', type: 'success' });
      setShowAddModal(false);
      resetForm();
      fetchPrescriptions();

      if (thenPrint && savedId) {
        await handleOpenRxDetail(savedId);
        printTriggerRef.current = 'rx';
        setPrintMode('rx');
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Network error', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const openPrint = (mode: 'rx' | 'referral') => {
    if (mode === 'referral' && !selectedRx?.referral) {
      setStatusMessage({ text: 'Referral details must be entered before printing a referral letter.', type: 'error' });
      return;
    }
    printTriggerRef.current = mode;
    setPrintMode(mode);
  };

  const canEditRx = hasPermission('manage_patients');

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Prescriptions &amp; Referrals (Rx Management)</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Clinic Prescriptions • Vitals • Investigations • Hospital/Specialist Referrals
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={fetchPrescriptions} className="btn btn-secondary btn-sm" disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button onClick={() => { resetForm(); setShowAddModal(true); }} className="btn btn-primary btn-sm">
            <Plus size={16} />
            <span>New Prescription</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div style={{
          padding: '0.75rem 1rem',
          background: statusMessage.type === 'success' ? 'var(--success-light)' : 'var(--danger-light)',
          color: statusMessage.type === 'success' ? 'var(--success-text)' : 'var(--danger-text)',
          borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.85rem'
        }}>
          {statusMessage.text}
        </div>
      )}

      {/* Prescriptions Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-container" style={{ border: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Patient Name</th>
                <th>Provider</th>
                <th>Diagnosis</th>
                <th>Allergy Alerts</th>
                <th>Items</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {prescriptions.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No prescriptions registered on file. Click 'New Prescription' to record an Rx.
                  </td>
                </tr>
              ) : (
                prescriptions.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(p.visit_date || p.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{p.patient_name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.patient_mobile || 'No phone'}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.provider_name || p.doctor_name || 'Counter Consultation'}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.provider_designation || p.doctor_specialization || p.clinic_name || ''}</div>
                    </td>
                    <td><span style={{ fontWeight: 500 }}>{p.diagnosis || '—'}</span></td>
                    <td>
                      {p.allergy_notes ? (
                        <span className="badge badge-danger" style={{ fontSize: '0.68rem' }}>⚠️ {p.allergy_notes}</span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>None reported</span>
                      )}
                    </td>
                    <td style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                      {p.item_count > 0 && <span className="badge badge-primary">{p.item_count} Rx</span>}
                      {p.has_referral > 0 && <span className="badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>Referral</span>}
                    </td>
                    <td style={{ display: 'flex', gap: '0.4rem' }}>
                      <button onClick={() => handleOpenRxDetail(p.id)} className="btn btn-secondary btn-sm" style={{ fontSize: '0.72rem' }}>
                        <Eye size={13} /><span>View</span>
                      </button>
                      {canEditRx && (
                        <button onClick={() => openEditRx(p.id)} className="btn btn-secondary btn-sm" style={{ fontSize: '0.72rem' }}>
                          <Pencil size={13} /><span>Edit</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New / Edit Prescription Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '1040px', width: '95%' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-card)' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}>
                <Stethoscope size={22} style={{ color: 'var(--primary)' }} />
                <span>{editingPrescriptionId ? 'Edit Prescription (Rx)' : 'Write Medical Prescription (Rx)'}</span>
              </h3>
              <button onClick={() => { setShowAddModal(false); resetForm(); }} className="btn btn-secondary btn-sm" style={{ padding: '0.35rem 0.5rem' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={e => handleSubmitPrescription(e, false)} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

              {/* 1. Patient & Provider */}
              <section>
                <SectionHeading icon={<FileText size={16} />} title="Patient &amp; Provider" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem', flexWrap: 'wrap', gap: '0.3rem' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Patient *</label>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {patientId && hasPermission('manage_patients') && (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
                            const patient = patients.find(item => String(item.id) === patientId);
                            if (!patient) return;
                            setEditingRxPatientId(patientId);
                            setNewPatient({ name: patient.name || '', mobile: patient.mobile || '', age: patient.age == null ? '' : String(patient.age), gender: patient.gender?.toUpperCase() || 'MALE', allergyNotes: patient.allergy_notes || '' });
                            setPatientError('');
                            setShowNewPatient(true);
                          }}><Pencil size={13} /> Edit</button>
                        )}
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowNewPatient(open => !open); setEditingRxPatientId(null); setNewPatient({ name: '', mobile: '', age: '', gender: 'MALE', allergyNotes: '' }); setPatientError(''); }}>
                          <Plus size={13} /> {showNewPatient ? 'Cancel' : 'New Patient'}
                        </button>
                      </div>
                    </div>
                    <select className="select" value={patientId} onChange={e => { setPatientId(e.target.value); setShowNewPatient(false); setEditingRxPatientId(null); }} required style={{ minHeight: '40px', fontSize: '0.85rem', width: '100%' }}>
                      <option value="">Select Patient...</option>
                      {patients.map(pat => (
                        <option key={pat.id} value={pat.id}>
                          {pat.name} {pat.mobile ? `(${pat.mobile})` : ''} {pat.allergy_notes ? `[⚠️ Allergy: ${pat.allergy_notes}]` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="form-label">Age (optional)</label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input className="input" type="number" min="0" max="130" value={ageYears} onChange={e => setAgeYears(e.target.value)} placeholder="Years" style={{ width: '50%' }} />
                      <input className="input" type="number" min="0" max="11" value={ageMonths} onChange={e => setAgeMonths(e.target.value)} placeholder="Months" style={{ width: '50%' }} />
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Patient Mobile (optional)</label>
                    <input className="input" value={patientMobileOverride} onChange={e => setPatientMobileOverride(e.target.value)} placeholder="03XX-XXXXXXX" />
                  </div>

                  <div>
                    <label className="form-label">Patient CNIC (optional)</label>
                    <input className="input" value={patientCnic} onChange={e => setPatientCnic(e.target.value)} placeholder="XXXXX-XXXXXXX-X" />
                  </div>

                  <div>
                    <label className="form-label">Prescription Date</label>
                    <input className="input" type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} />
                  </div>

                  <div>
                    <label className="form-label">Attending Provider</label>
                    <select className="select" value={providerId} onChange={e => setProviderId(e.target.value)}>
                      <option value="">Select Provider...</option>
                      {providers.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                    </select>
                  </div>
                </div>

                {providerId && (() => {
                  const pr = providers.find(p => String(p.id) === providerId);
                  if (!pr) return null;
                  return (
                    <div style={{ marginTop: '0.6rem', padding: '0.6rem 0.85rem', border: '1px solid var(--primary-border)', background: 'var(--primary-light)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem' }}>
                      <strong>{pr.name}</strong>{pr.credentials ? ` — ${pr.credentials}` : ''}
                      <div style={{ color: 'var(--text-muted)' }}>{[pr.designation, pr.hospital].filter(Boolean).join(' • ')}</div>
                    </div>
                  );
                })()}

                {showNewPatient && (
                  <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', marginTop: '0.75rem' }}>
                    <strong style={{ fontSize: '0.9rem' }}>{editingRxPatientId ? 'Edit selected patient' : 'Register patient for this prescription'}</strong>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
                      <div><label className="form-label">Name *</label><input className="input" value={newPatient.name} onChange={e => setNewPatient({ ...newPatient, name: e.target.value })} maxLength={150} /></div>
                      <div><label className="form-label">Mobile</label><input className="input" value={newPatient.mobile} onChange={e => setNewPatient({ ...newPatient, mobile: e.target.value })} inputMode="tel" /></div>
                      <div><label className="form-label">Age</label><input className="input" type="number" min="0" max="130" value={newPatient.age} onChange={e => setNewPatient({ ...newPatient, age: e.target.value })} /></div>
                      <div><label className="form-label">Gender</label><select className="select" value={newPatient.gender} onChange={e => setNewPatient({ ...newPatient, gender: e.target.value })}><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select></div>
                      <div style={{ gridColumn: '1 / -1' }}><label className="form-label">Allergy Notes</label><input className="input" value={newPatient.allergyNotes} onChange={e => setNewPatient({ ...newPatient, allergyNotes: e.target.value })} placeholder="Optional" /></div>
                    </div>
                    {patientError && <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.5rem' }}>{patientError}</p>}
                    <button type="button" className="btn btn-primary" onClick={handleSavePatient} disabled={savingPatient} style={{ marginTop: '0.75rem' }}>
                      {savingPatient ? 'Saving...' : editingRxPatientId ? 'Save Patient Changes' : 'Save & Select Patient'}
                    </button>
                  </div>
                )}
              </section>

              {/* 2. Vitals */}
              <section>
                <SectionHeading icon={<Activity size={16} />} title="Vital Signs" optional />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
                  <VitalInput label="Pulse (bpm)" value={pulseBpm} onChange={setPulseBpm} />
                  <div>
                    <label className="form-label">BP (Systolic / Diastolic)</label>
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                      <input className="input" type="number" value={bpSystolic} onChange={e => setBpSystolic(e.target.value)} placeholder="Sys" />
                      <span style={{ color: 'var(--text-muted)' }}>/</span>
                      <input className="input" type="number" value={bpDiastolic} onChange={e => setBpDiastolic(e.target.value)} placeholder="Dia" />
                    </div>
                  </div>
                  <VitalInput label="SpO2 (%)" value={spo2Percent} onChange={setSpo2Percent} />
                  <VitalInput label="Random Sugar (mg/dL)" value={randomSugar} onChange={setRandomSugar} />
                  <VitalInput label="Fasting Sugar (mg/dL)" value={fastingSugar} onChange={setFastingSugar} />
                  <VitalInput label="Weight (kg)" value={weightKg} onChange={setWeightKg} />
                  <div>
                    <label className="form-label">Temperature</label>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <input className="input" type="number" value={temperatureValue} onChange={e => setTemperatureValue(e.target.value)} placeholder="Value" />
                      <select className="select" value={temperatureUnit} onChange={e => setTemperatureUnit(e.target.value as 'C' | 'F')} style={{ width: '70px' }}>
                        <option value="C">°C</option>
                        <option value="F">°F</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              {/* 3. Clinical Information */}
              <section>
                <SectionHeading icon={<ClipboardList size={16} />} title="Clinical Information" optional />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem' }}>
                  <div>
                    <label className="form-label">Diagnosis</label>
                    <input className="input" placeholder="e.g. Acute Pharyngitis, Type 2 Diabetes..." value={diagnosis} onChange={e => setDiagnosis(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Clinical Notes</label>
                    <input className="input" placeholder="Findings on examination..." value={clinicalNotes} onChange={e => setClinicalNotes(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Clinical Advice</label>
                    <input className="input" placeholder="Advice to patient..." value={clinicalAdvice} onChange={e => setClinicalAdvice(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Treatment Plan</label>
                    <input className="input" placeholder="Overall treatment plan..." value={treatmentPlan} onChange={e => setTreatmentPlan(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Follow-up Date</label>
                    <input className="input" type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Follow-up Instructions</label>
                    <input className="input" placeholder="e.g. Review with reports in 1 week" value={followUpInstructions} onChange={e => setFollowUpInstructions(e.target.value)} />
                  </div>
                </div>
              </section>

              {/* 4. Investigations */}
              <section>
                <SectionHeading icon={<Activity size={16} />} title="Investigations / Lab Tests Advised" optional />
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    placeholder="Search or type a custom test and press Enter..."
                    value={investigationQuery}
                    onChange={e => setInvestigationQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addInvestigation(investigationQuery, !COMMON_INVESTIGATIONS.includes(investigationQuery.trim())); } }}
                  />
                  {investigationQuery.trim() && matchingInvestigations.length > 0 && (
                    <div style={{ position: 'absolute', zIndex: 5, top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', maxHeight: '180px', overflowY: 'auto', marginTop: '0.2rem' }}>
                      {matchingInvestigations.map(t => (
                        <div key={t} onClick={() => addInvestigation(t, false)} style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.82rem' }}
                          onMouseDown={ev => ev.preventDefault()}>
                          {t}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {investigationQuery.trim() && (
                  <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: '0.4rem' }} onClick={() => addInvestigation(investigationQuery, true)}>
                    <Plus size={13} /> Add "{investigationQuery.trim()}" as custom test
                  </button>
                )}
                {investigations.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.6rem' }}>
                    {investigations.map(inv => (
                      <span key={inv.testName} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'var(--primary-light)', color: 'var(--primary)', padding: '0.25rem 0.6rem', borderRadius: 'var(--radius-full)', fontSize: '0.78rem', fontWeight: 600 }}>
                        {inv.testName}
                        <X size={12} style={{ cursor: 'pointer' }} onClick={() => removeInvestigation(inv.testName)} />
                      </span>
                    ))}
                  </div>
                )}
                {investigations.length > 0 && (
                  <input className="input" style={{ marginTop: '0.6rem' }} placeholder="Preparation instructions / notes (optional)" value={investigationInstructions} onChange={e => setInvestigationInstructions(e.target.value)} />
                )}
              </section>

              {/* 5. Referral */}
              <section style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.9rem' }}>
                <SectionHeading icon={<Building2 size={16} />} title="Referred To — Hospital / Specialist" optional />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <label className="form-label">Hospital / Facility</label>
                    <select className="select" value={referral.hospitalName} onChange={e => setReferral({ ...referral, hospitalName: e.target.value })}>
                      <option value="">Select hospital...</option>
                      {HOSPITAL_PRESETS.map(h => <option key={h} value={h}>{h}</option>)}
                      <option value="Custom">Custom / Other...</option>
                    </select>
                    {referral.hospitalName === 'Custom' && (
                      <input className="input" style={{ marginTop: '0.4rem' }} placeholder="Enter hospital/facility name" value={referral.customHospital} onChange={e => setReferral({ ...referral, customHospital: e.target.value })} />
                    )}
                  </div>
                  <div>
                    <label className="form-label">Department / Specialty</label>
                    <input className="input" list="specialty-presets" value={referral.department} onChange={e => setReferral({ ...referral, department: e.target.value })} placeholder="Select or type specialty..." />
                    <datalist id="specialty-presets">{SPECIALTY_PRESETS.map(s => <option key={s} value={s} />)}</datalist>
                  </div>
                  <div>
                    <label className="form-label">Specialist (optional)</label>
                    <input className="input" value={referral.specialistName} onChange={e => setReferral({ ...referral, specialistName: e.target.value })} />
                  </div>
                  <div>
                    <label className="form-label">Priority</label>
                    <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.4rem' }}>
                      {(['Routine', 'Urgent', 'Emergency'] as const).map(p => (
                        <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                          <input type="radio" name="referral-priority" checked={referral.priority === p} onChange={() => setReferral({ ...referral, priority: p })} />
                          {p}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Reason for Referral</label>
                    <input className="input" value={referral.reason} onChange={e => setReferral({ ...referral, reason: e.target.value })} placeholder="Enter reason for specialist assessment..." />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Relevant Clinical Summary (optional)</label>
                    <input className="input" value={referral.clinicalSummary} onChange={e => setReferral({ ...referral, clinicalSummary: e.target.value })} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Reports / Attachments to Include (optional)</label>
                    <input className="input" value={referral.reportsAttached} onChange={e => setReferral({ ...referral, reportsAttached: e.target.value })} placeholder="e.g. CBC report, X-Ray films" />
                  </div>
                </div>
              </section>

              {/* 6. Medicines */}
              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <SectionHeading icon={<Stethoscope size={16} />} title={`Treatment / Medicines (${items.length})`} optional />
                  <button type="button" onClick={addItemRow} className="btn btn-secondary btn-sm" style={{ fontWeight: 700 }}>
                    <Plus size={14} /><span>Add Medicine</span>
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {items.map((it, idx) => (
                    <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.6rem', position: 'relative' }}>
                      <div style={{ gridColumn: 'span 2', position: 'relative' }}>
                        <label className="form-label">Medicine (search or type)</label>
                        <input
                          className="input"
                          value={it.medicineName}
                          onChange={e => handleMedicineQueryChange(idx, e.target.value)}
                          onFocus={() => setMedicineDropdownOpenIdx(idx)}
                          onBlur={() => setTimeout(() => setMedicineDropdownOpenIdx(null), 150)}
                          placeholder="Search catalogue or type manually..."
                        />
                        {medicineDropdownOpenIdx === idx && matchingMedicines(it.medicineName).length > 0 && (
                          <div style={{ position: 'absolute', zIndex: 5, top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', maxHeight: '180px', overflowY: 'auto' }}>
                            {matchingMedicines(it.medicineName).map(m => (
                              <div key={m.id} onMouseDown={() => selectCatalogMedicine(idx, m)} style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.82rem' }}>
                                {m.brand_name} {m.strength} <span style={{ color: 'var(--text-muted)' }}>({m.dosage_form || 'Unit'})</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="form-label">Strength</label>
                        <input className="input" value={it.strength} onChange={e => handleItemChange(idx, 'strength', e.target.value)} placeholder="e.g. 500mg" />
                      </div>
                      <div>
                        <label className="form-label">Route</label>
                        <input className="input" list="route-presets" value={it.route} onChange={e => handleItemChange(idx, 'route', e.target.value)} placeholder="Oral" />
                        <datalist id="route-presets">{ROUTE_PRESETS.map(r => <option key={r} value={r} />)}</datalist>
                      </div>
                      <div>
                        <label className="form-label">Dose</label>
                        <input className="input" list={`dosage-presets-${idx}`} value={it.dosage} onChange={e => handleItemChange(idx, 'dosage', e.target.value)} />
                        <datalist id={`dosage-presets-${idx}`}>{DOSAGE_PRESETS.map(d => <option key={d} value={d} />)}</datalist>
                      </div>
                      <div>
                        <label className="form-label">Frequency</label>
                        <select className="select" value={it.frequency} onChange={e => handleItemChange(idx, 'frequency', e.target.value)}>
                          {FREQUENCY_PRESETS.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="form-label">Duration</label>
                        <select className="select" value={DURATION_PRESETS.includes(it.duration) ? it.duration : 'Custom'} onChange={e => { if (e.target.value !== 'Custom') handleItemChange(idx, 'duration', e.target.value); }}>
                          {DURATION_PRESETS.map(d => <option key={d} value={d}>{d}</option>)}
                          {!DURATION_PRESETS.includes(it.duration) && <option value="Custom">Custom: {it.duration}</option>}
                        </select>
                        <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                          {QUICK_DURATION_CHIPS.map(chip => (
                            <button key={chip} type="button" onClick={() => handleItemChange(idx, 'duration', chip)} style={{ border: '1px solid var(--border)', borderRadius: '3px', backgroundColor: it.duration.startsWith(chip.split(' ')[0]) ? 'var(--primary)' : 'var(--bg-card)', color: it.duration.startsWith(chip.split(' ')[0]) ? '#fff' : 'var(--text-muted)', fontSize: '0.65rem', padding: '0.1rem 0.3rem', cursor: 'pointer', fontWeight: 600 }}>
                              {chip.split(' ')[0]}d
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="form-label">Timing</label>
                        <select className="select" value={it.timing} onChange={e => handleItemChange(idx, 'timing', e.target.value)}>
                          {TIMING_PRESETS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <label className="form-label">Instructions</label>
                        <input className="input" value={it.instructions} onChange={e => handleItemChange(idx, 'instructions', e.target.value)} placeholder="Special instructions..." />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItemRow(idx)} style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '0.3rem' }} title="Remove item">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Schedule B/D register capture fields - optional unless the applicable jurisdiction rule requires them */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.75rem' }}>
                <button type="button" onClick={() => setShowScheduleFields(s => !s)} className="btn btn-secondary btn-sm">
                  {showScheduleFields ? 'Hide' : 'Show'} Schedule B/D Register Fields (purchaser, prescriber reg. no., attachment)
                </button>
                {showScheduleFields && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem', marginTop: '0.75rem' }}>
                    <div><label className="form-label">Purchaser Name (if different)</label><input className="input" value={purchaserName} onChange={e => setPurchaserName(e.target.value)} /></div>
                    <div><label className="form-label">Purchaser Relation</label><input className="input" value={purchaserRelation} onChange={e => setPurchaserRelation(e.target.value)} placeholder="e.g. Spouse, Attendant" /></div>
                    <div><label className="form-label">Purchaser CNIC</label><input className="input" value={purchaserCnic} onChange={e => setPurchaserCnic(e.target.value)} /></div>
                    <div><label className="form-label">Purchaser Mobile</label><input className="input" value={purchaserMobile} onChange={e => setPurchaserMobile(e.target.value)} /></div>
                    <div><label className="form-label">Prescriber Registration No.</label><input className="input" value={prescriberRegistrationNumber} onChange={e => setPrescriberRegistrationNumber(e.target.value)} /></div>
                    <div><label className="form-label">Prescriber Address</label><input className="input" value={prescriberAddress} onChange={e => setPrescriberAddress(e.target.value)} /></div>
                    <div><label className="form-label">Patient Address</label><input className="input" value={patientAddress} onChange={e => setPatientAddress(e.target.value)} /></div>
                    <div><label className="form-label">Original Document Reference</label><input className="input" value={originalDocumentReference} onChange={e => setOriginalDocumentReference(e.target.value)} placeholder="Paper Rx file/serial reference" /></div>
                    <div>
                      <label className="form-label">Prescription Attachment (image/PDF)</label>
                      <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => setAttachmentFile(e.target.files?.[0] || null)} />
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => { setShowAddModal(false); resetForm(); }} className="btn btn-secondary" style={{ padding: '0.5rem 1.25rem' }}>
                  Cancel
                </button>
                <button type="submit" disabled={isSaving} className="btn btn-primary" style={{ padding: '0.5rem 1.5rem', fontWeight: 800 }}>
                  {isSaving ? 'Saving...' : editingPrescriptionId ? 'Save Changes' : 'Save & Record Rx'}
                </button>
                {!editingPrescriptionId && (
                  <button type="button" disabled={isSaving} onClick={e => handleSubmitPrescription(e, true)} className="btn btn-primary" style={{ padding: '0.5rem 1.5rem', fontWeight: 800 }}>
                    <Printer size={15} /> Save &amp; Print
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View & Print Prescription Modal */}
      {selectedRx && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '720px' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700 }}>Prescription Record #{selectedRx.prescription.id}</span>
              <button onClick={() => setSelectedRx(null)} className="btn btn-secondary btn-sm" style={{ padding: '0.2rem' }}>
                <X size={15} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', background: '#fff', color: '#000', maxHeight: '65vh', overflowY: 'auto' }}>
              <RxSummaryPreview data={selectedRx} rxRegisterEntries={rxRegisterEntries} />
            </div>

            <div style={{ padding: '1rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button onClick={() => openPrint('rx')} className="btn btn-primary">
                <Printer size={16} /><span>Print Prescription</span>
              </button>
              <button onClick={() => openPrint('referral')} className="btn btn-secondary">
                <Printer size={16} /><span>Print Referral Letter</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print-only A4 documents - portaled to <body> so position:absolute resolves against the real page,
          not the app shell's positioned .main-content ancestor; invisible on screen, shown via print CSS */}
      {printMode === 'rx' && selectedRx && createPortal(
        <RxPrintDocument data={selectedRx} rxRegisterEntries={rxRegisterEntries} />,
        document.body
      )}
      {printMode === 'referral' && selectedRx?.referral && createPortal(
        <ReferralPrintDocument data={selectedRx} />,
        document.body
      )}
    </div>
  );
};

const SectionHeading: React.FC<{ icon: React.ReactNode; title: string; optional?: boolean }> = ({ icon, title, optional }) => (
  <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
    {icon}<span>{title}</span>
    {optional && <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.05rem 0.4rem' }}>OPTIONAL</span>}
  </h4>
);

const VitalInput: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <div>
    <label className="form-label">{label}</label>
    <input className="input" type="number" value={value} onChange={e => onChange(e.target.value)} placeholder="—" />
  </div>
);

// ---- Shared A4 prescription body (used for both the on-screen preview and the print document) ----
const RxDocumentBody: React.FC<{ data: any; rxRegisterEntries: any[] }> = ({ data, rxRegisterEntries }) => {
  const p = data.prescription;
  const items = data.items || [];
  const investigations = data.investigations || [];
  const referral = data.referral;
  const vitalsPresent = [p.pulse_bpm, p.bp_systolic, p.spo2_percent, p.random_sugar_mgdl, p.fasting_sugar_mgdl, p.weight_kg, p.temperature_value].some(v => v != null);
  const clinicalPresent = p.diagnosis || p.clinical_notes || p.clinical_advice || p.treatment_plan;
  const followUpPresent = p.follow_up_date || p.follow_up_instructions;

  return (
    <div>
      <div style={{ borderBottom: '2px solid #000', paddingBottom: '0.75rem', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <img src="/logo.jpeg" alt="Naveed Medical Pharmacy" style={{ height: '64px', flexShrink: 0 }} />
        <div style={{ textAlign: 'center', flex: '1 1 200px', minWidth: 0 }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, wordBreak: 'break-word' }}>NAVEED MEDICAL CLINIC</h3>
          <div style={{ fontSize: '0.78rem', color: '#444', wordBreak: 'break-word' }}>Millat Road, Chowk Chohan Road, Islampura, Near Naveed Medical Store</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '0.8rem', flex: '0 1 220px', minWidth: 0, wordBreak: 'break-word' }}>
          <div><strong>Provider:</strong> {p.provider_name || p.doctor_name || 'Attending Pharmacist'}</div>
          <div>{p.provider_designation || p.doctor_specialization || ''}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '1rem', background: '#f5f5f5', padding: '0.5rem', borderRadius: '4px', fontSize: '0.82rem' }}>
        <div><strong>Patient:</strong> {p.patient_name} {(p.age_years != null || p.patient_age) ? `(${p.age_years ?? p.patient_age} yrs${p.age_months ? ' ' + p.age_months + ' mo' : ''})` : ''}</div>
        <div><strong>Date:</strong> {new Date(p.visit_date || p.created_at).toLocaleDateString()}</div>
        {p.allergy_notes && <div style={{ color: 'red', fontWeight: 700 }}>Allergy: {p.allergy_notes}</div>}
      </div>

      {vitalsPresent && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontWeight: 800, fontSize: '0.85rem', background: '#eef', padding: '0.3rem 0.5rem' }}>VITALS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.8rem', padding: '0.4rem 0.5rem' }}>
            {p.pulse_bpm != null && <span><strong>Pulse:</strong> {p.pulse_bpm} bpm</span>}
            {(p.bp_systolic != null || p.bp_diastolic != null) && <span><strong>BP:</strong> {p.bp_systolic ?? '—'}/{p.bp_diastolic ?? '—'} mmHg</span>}
            {p.spo2_percent != null && <span><strong>SpO2:</strong> {p.spo2_percent}%</span>}
            {p.random_sugar_mgdl != null && <span><strong>RBS:</strong> {p.random_sugar_mgdl} mg/dL</span>}
            {p.fasting_sugar_mgdl != null && <span><strong>FBS:</strong> {p.fasting_sugar_mgdl} mg/dL</span>}
            {p.weight_kg != null && <span><strong>Weight:</strong> {p.weight_kg} kg</span>}
            {p.temperature_value != null && <span><strong>Temp:</strong> {p.temperature_value}°{p.temperature_unit || 'C'}</span>}
          </div>
        </div>
      )}

      {clinicalPresent && (
        <div style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
          {p.diagnosis && <div><strong>Diagnosis:</strong> {p.diagnosis}</div>}
          {p.clinical_notes && <div><strong>Clinical Notes:</strong> {p.clinical_notes}</div>}
          {p.treatment_plan && <div><strong>Treatment Plan:</strong> {p.treatment_plan}</div>}
        </div>
      )}

      {items.length > 0 && (
        <>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.5rem', fontStyle: 'italic' }}>℞</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #000' }}>
                <th style={{ textAlign: 'left', padding: '0.4rem' }}>Medicine</th>
                <th style={{ textAlign: 'left', padding: '0.4rem' }}>Dose</th>
                <th style={{ textAlign: 'left', padding: '0.4rem' }}>Route</th>
                <th style={{ textAlign: 'left', padding: '0.4rem' }}>Frequency</th>
                <th style={{ textAlign: 'left', padding: '0.4rem' }}>Duration</th>
                <th style={{ textAlign: 'left', padding: '0.4rem' }}>Instructions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid #eee', pageBreakInside: 'avoid' }}>
                  <td style={{ padding: '0.4rem', fontWeight: 700 }}>{it.brand_name ? `${it.brand_name} ${it.catalog_strength || ''}` : `${it.medicine_name || ''} ${it.strength || ''}`}</td>
                  <td style={{ padding: '0.4rem' }}>{it.dosage}</td>
                  <td style={{ padding: '0.4rem' }}>{it.route || ''}</td>
                  <td style={{ padding: '0.4rem' }}>{it.frequency}</td>
                  <td style={{ padding: '0.4rem' }}>{it.duration}</td>
                  <td style={{ padding: '0.4rem' }}>{it.instructions || (it.timing || '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {investigations.length > 0 && (
        <div style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
          <div style={{ fontWeight: 800, background: '#eef', padding: '0.3rem 0.5rem' }}>INVESTIGATIONS / LAB TESTS ADVISED</div>
          <div style={{ padding: '0.4rem 0.5rem' }}>
            {investigations.map((i: any) => i.test_name).join(' • ')}
            {investigations[0]?.instructions && <div style={{ color: '#555', marginTop: '0.3rem' }}>{investigations[0].instructions}</div>}
          </div>
        </div>
      )}

      {referral && (
        <div style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
          <div style={{ fontWeight: 800, background: '#eef', padding: '0.3rem 0.5rem' }}>REFERRED TO — HOSPITAL / SPECIALIST</div>
          <div style={{ padding: '0.4rem 0.5rem' }}>
            {referral.hospital_name && <div><strong>Hospital:</strong> {referral.hospital_name}</div>}
            {referral.department && <div><strong>Department:</strong> {referral.department}</div>}
            {referral.specialist_name && <div><strong>Specialist:</strong> {referral.specialist_name}</div>}
            <div><strong>Priority:</strong> {referral.priority}</div>
            {referral.reason && <div><strong>Reason:</strong> {referral.reason}</div>}
          </div>
        </div>
      )}

      {(p.clinical_advice || followUpPresent) && (
        <div style={{ fontSize: '0.8rem', color: '#333', borderTop: '1px dashed #ccc', paddingTop: '0.5rem' }}>
          {p.clinical_advice && <div><strong>Advice:</strong> {p.clinical_advice}</div>}
          {followUpPresent && <div><strong>Follow-up:</strong> {[p.follow_up_date ? new Date(p.follow_up_date).toLocaleDateString() : null, p.follow_up_instructions].filter(Boolean).join(' — ')}</div>}
        </div>
      )}

      {rxRegisterEntries.length > 0 && (
        <div style={{ fontSize: '0.78rem', color: '#555', borderTop: '1px dashed #ccc', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
          <strong>Schedule B/D Register Endorsement:</strong> this prescription was used to dispense register serial(s): {rxRegisterEntries.map((e: any) => e.serial_number).join(', ')}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', fontSize: '0.82rem' }}>
        <div>Provider signature: ___________________</div>
        <div>Date: ___________________</div>
      </div>
    </div>
  );
};

const RxSummaryPreview: React.FC<{ data: any; rxRegisterEntries: any[] }> = ({ data, rxRegisterEntries }) => (
  <RxDocumentBody data={data} rxRegisterEntries={rxRegisterEntries} />
);

const RxPrintDocument: React.FC<{ data: any; rxRegisterEntries: any[] }> = ({ data, rxRegisterEntries }) => (
  <div className="printable-rx-a4">
    <img src="/logo.jpeg" className="rx-a4-watermark" alt="" />
    <div className="rx-a4-content">
      <RxDocumentBody data={data} rxRegisterEntries={rxRegisterEntries} />
      <div className="rx-a4-footer">
        NAVEED MEDICAL CLINIC • Millat Road, Chowk Chohan Road, Islampura, Near Naveed Medical Store<br />
        0300-8838271 | 0300-4439798 &nbsp;•&nbsp; Not Valid For Court
      </div>
    </div>
  </div>
);

const ReferralPrintDocument: React.FC<{ data: any }> = ({ data }) => {
  const p = data.prescription;
  const r = data.referral;
  const vitalsLine = [
    p.pulse_bpm != null ? `Pulse ${p.pulse_bpm} bpm` : null,
    (p.bp_systolic != null || p.bp_diastolic != null) ? `BP ${p.bp_systolic ?? '—'}/${p.bp_diastolic ?? '—'}` : null,
    p.spo2_percent != null ? `SpO2 ${p.spo2_percent}%` : null
  ].filter(Boolean).join(' • ');

  return (
    <div className="printable-referral-a4">
      <img src="/logo.jpeg" className="rx-a4-watermark" alt="" />
      <div className="rx-a4-content">
        <div style={{ borderBottom: '2px solid #000', paddingBottom: '0.75rem', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <img src="/logo.jpeg" alt="Naveed Medical Pharmacy" style={{ height: '64px', flexShrink: 0 }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>REFERRAL LETTER</h3>
        </div>
        <div style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
          <div><strong>Date:</strong> {new Date(p.visit_date || p.created_at).toLocaleDateString()}</div>
          <div><strong>Patient:</strong> {p.patient_name}, {(p.age_years ?? p.patient_age) || '—'} yrs, {p.patient_gender || '—'}</div>
        </div>
        <div style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
          <div><strong>To:</strong> {r.hospital_name || '—'}</div>
          {r.department && <div><strong>Department:</strong> {r.department}</div>}
          {r.specialist_name && <div><strong>Specialist:</strong> {r.specialist_name}</div>}
          <div><strong>Priority:</strong> {r.priority}</div>
        </div>
        {r.reason && <div style={{ fontSize: '0.85rem', marginBottom: '1rem' }}><strong>Reason for Referral:</strong> {r.reason}</div>}
        {(vitalsLine || r.clinical_summary) && (
          <div style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
            <strong>Relevant Clinical Findings:</strong>
            {vitalsLine && <div>{vitalsLine}</div>}
            {r.clinical_summary && <div>{r.clinical_summary}</div>}
          </div>
        )}
        {r.reports_attached && <div style={{ fontSize: '0.85rem', marginBottom: '1rem' }}><strong>Reports / Attachments:</strong> {r.reports_attached}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3rem', fontSize: '0.85rem' }}>
          <div>
            Referring Provider: {p.provider_name || p.doctor_name || '—'}<br />
            {p.provider_credentials && <span style={{ color: '#555' }}>{p.provider_credentials}</span>}
          </div>
          <div>Signature: ___________________</div>
        </div>

        <div className="rx-a4-footer">
          NAVEED MEDICAL CLINIC • Millat Road, Chowk Chohan Road, Islampura, Near Naveed Medical Store<br />
          0300-8838271 | 0300-4439798 &nbsp;•&nbsp; Not Valid For Court
        </div>
      </div>
    </div>
  );
};

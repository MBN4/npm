import {
  MedPracPatient,
  MedPracCategory,
  MedPracService,
  MedPracVisit,
  MedPracKPIs,
  MedPracReportData
} from '../types/medprac.js';

const API_BASE = '/api/medprac';

export const medpracService = {
  // Get next auto-generated patient serial number (e.g. MP-000123)
  getNextSerial: async (): Promise<string> => {
    try {
      const res = await fetch(`${API_BASE}/next-serial`);
      if (!res.ok) throw new Error('Failed to fetch serial');
      const data = await res.json();
      return data.serial_number;
    } catch {
      // Fallback offline generator
      const stored = localStorage.getItem('nmp_offline_patients_count') || '0';
      const count = parseInt(stored, 10) + 1;
      return `MP-${String(count).padStart(6, '0')}`;
    }
  },

  // Search patients by Name, Serial Number, or Phone
  searchPatients: async (query: string): Promise<MedPracPatient[]> => {
    try {
      const res = await fetch(`${API_BASE}/patients/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Search failed');
      return await res.json();
    } catch {
      // Fallback offline patient search
      const offline = JSON.parse(localStorage.getItem('nmp_offline_patients') || '[]');
      if (!query.trim()) return offline.slice(0, 20);
      const q = query.toLowerCase();
      return offline.filter((p: MedPracPatient) =>
        p.name.toLowerCase().includes(q) ||
        p.serial_number.toLowerCase().includes(q) ||
        (p.phone && p.phone.includes(q))
      );
    }
  },

  // Check possible duplicate patients
  checkDuplicate: async (patientData: { name: string; phone?: string; age?: number; sex?: string }) => {
    try {
      const res = await fetch(`${API_BASE}/patients/check-duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patientData)
      });
      if (!res.ok) throw new Error('Duplicate check failed');
      return await res.json();
    } catch {
      return { possibleDuplicates: [] };
    }
  },

  // Create new patient
  createPatient: async (patientData: Partial<MedPracPatient>): Promise<MedPracPatient> => {
    try {
      const res = await fetch(`${API_BASE}/patients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patientData)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create patient');
      }
      const newP = await res.json();
      // Cache in offline list
      const offline = JSON.parse(localStorage.getItem('nmp_offline_patients') || '[]');
      offline.unshift(newP);
      localStorage.setItem('nmp_offline_patients', JSON.stringify(offline));
      return newP;
    } catch (error: any) {
      // Offline fallback creation
      const serial = patientData.serial_number || `MP-${String(Date.now()).slice(-6)}`;
      const newP: MedPracPatient = {
        id: Date.now(),
        uuid: String(Date.now()),
        serial_number: serial,
        name: patientData.name || 'Unknown',
        age: patientData.age || 0,
        age_unit: patientData.age_unit || 'Years',
        sex: patientData.sex || 'Male',
        phone: patientData.phone,
        address: patientData.address,
        created_at: new Date().toISOString(),
        total_visits: 0
      };
      const offline = JSON.parse(localStorage.getItem('nmp_offline_patients') || '[]');
      offline.unshift(newP);
      localStorage.setItem('nmp_offline_patients', JSON.stringify(offline));
      return newP;
    }
  },

  // Get patient details with full visit history
  getPatientHistory: async (patientId: string | number): Promise<{ patient: MedPracPatient; visits: MedPracVisit[] }> => {
    try {
      const res = await fetch(`${API_BASE}/patients/${patientId}`);
      if (!res.ok) throw new Error('Failed to load patient history');
      return await res.json();
    } catch {
      const offlinePatients = JSON.parse(localStorage.getItem('nmp_offline_patients') || '[]');
      const patient = offlinePatients.find((p: MedPracPatient) => String(p.id) === String(patientId) || p.serial_number === patientId);
      const offlineVisits = JSON.parse(localStorage.getItem('nmp_offline_visits') || '[]');
      const visits = offlineVisits.filter((v: MedPracVisit) => v.patient_id === patient?.id || v.patient_serial === patient?.serial_number);
      return { patient: patient || { id: 0, uuid: '', serial_number: '', name: 'Unknown', age: 0, age_unit: 'Years', sex: 'Male' }, visits };
    }
  },

  // Fetch therapeutic categories
  getCategories: async (): Promise<MedPracCategory[]> => {
    try {
      const res = await fetch(`${API_BASE}/categories`);
      if (!res.ok) throw new Error('Failed to load categories');
      return await res.json();
    } catch {
      return [
        { id: 1, name: 'General / Other', description: 'General consultation', icon: 'stethoscope', sort_order: 1, is_active: 1 },
        { id: 2, name: 'Fever', description: 'Pyrexia', icon: 'thermometer', sort_order: 2, is_active: 1 },
        { id: 3, name: 'Cough & Cold', description: 'Congestion', icon: 'wind', sort_order: 3, is_active: 1 },
        { id: 4, name: 'Fever + Cough + Cold', description: 'Flu symptoms', icon: 'activity', sort_order: 4, is_active: 1 },
        { id: 5, name: 'Body Aches / Pain', description: 'Myalgia', icon: 'user-x', sort_order: 5, is_active: 1 },
        { id: 6, name: 'Headache', description: 'Cephalea', icon: 'brain', sort_order: 6, is_active: 1 },
        { id: 7, name: 'Gastrointestinal / Stomach', description: 'Stomach issues', icon: 'activity', sort_order: 7, is_active: 1 },
        { id: 8, name: 'Acidity / Gastric', description: 'Heartburn', icon: 'flame', sort_order: 8, is_active: 1 },
        { id: 9, name: 'Allergy', description: 'Rashes, allergic reactions', icon: 'sparkles', sort_order: 9, is_active: 1 },
        { id: 10, name: 'Skin / Dermatology', description: 'Skin conditions', icon: 'sun', sort_order: 10, is_active: 1 },
        { id: 11, name: 'Wound', description: 'Cuts, injuries', icon: 'band-aid', sort_order: 11, is_active: 1 },
        { id: 12, name: 'Vitamins / Supplements', description: 'Nutritional support', icon: 'heart-pulse', sort_order: 12, is_active: 1 }
      ];
    }
  },

  // Save therapeutic category (Admin)
  saveCategory: async (categoryData: Partial<MedPracCategory>): Promise<MedPracCategory> => {
    const url = categoryData.id ? `${API_BASE}/categories/${categoryData.id}` : `${API_BASE}/categories`;
    const method = categoryData.id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(categoryData)
    });
    if (!res.ok) throw new Error('Failed to save category');
    return await res.json();
  },

  // Fetch practice services
  getServices: async (): Promise<MedPracService[]> => {
    try {
      const res = await fetch(`${API_BASE}/services`);
      if (!res.ok) throw new Error('Failed to load services');
      return await res.json();
    } catch {
      return [
        { id: 1, code: 'injection', name: 'Injection', default_cost: 100, sort_order: 1, is_active: 1 },
        { id: 2, code: 'iv', name: 'I.V', default_cost: 150, sort_order: 2, is_active: 1 },
        { id: 3, code: 'drip', name: 'Drip', default_cost: 200, sort_order: 3, is_active: 1 },
        { id: 4, code: 'dressing', name: 'Dressing', default_cost: 150, sort_order: 4, is_active: 1 },
        { id: 5, code: 'nebulization', name: 'Nebulization', default_cost: 100, sort_order: 5, is_active: 1 },
        { id: 6, code: 'bp_check', name: 'BP Check', default_cost: 50, sort_order: 6, is_active: 1 },
        { id: 7, code: 'glucose_check', name: 'Glucose Check', default_cost: 100, sort_order: 7, is_active: 1 }
      ];
    }
  },

  // Save practice service charge (Admin)
  saveService: async (serviceData: Partial<MedPracService>): Promise<MedPracService> => {
    const url = serviceData.id ? `${API_BASE}/services/${serviceData.id}` : `${API_BASE}/services`;
    const method = serviceData.id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serviceData)
    });
    if (!res.ok) throw new Error('Failed to save service');
    return await res.json();
  },

  // Record visit entry
  recordVisit: async (visitData: any): Promise<MedPracVisit> => {
    try {
      const res = await fetch(`${API_BASE}/visits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(visitData)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to record visit');
      }
      const newV = await res.json();
      const offlineVisits = JSON.parse(localStorage.getItem('nmp_offline_visits') || '[]');
      offlineVisits.unshift(newV);
      localStorage.setItem('nmp_offline_visits', JSON.stringify(offlineVisits));
      return newV;
    } catch (error: any) {
      // Offline fallback record creation
      const dateStr = new Date().toISOString();
      const visit_id = `MV-${dateStr.slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-4)}`;
      const offlineV: MedPracVisit = {
        id: Date.now(),
        uuid: String(Date.now()),
        visit_id,
        patient_id: visitData.patient_id,
        patient_serial: visitData.patient_serial,
        visit_date: dateStr,
        therapeutic_category_name: visitData.therapeutic_category_name,
        dose_given: visitData.dose_given,
        dose_notation: visitData.dose_notation,
        practice_dose_charge: visitData.practice_dose_charge || 0,
        total_service_charge: visitData.total_service_charge || 0,
        total_medicine_charge: visitData.total_medicine_charge || 0,
        total_amount: visitData.total_amount || 0,
        notes: visitData.notes,
        medprac_by_user_id: visitData.medprac_by_user_id || 1,
        medprac_by_user_name: visitData.medprac_by_user_name || 'Pharmacist',
        status: 'COMPLETED',
        created_at: dateStr,
        updated_at: dateStr,
        services: visitData.services || [],
        medicines: visitData.medicines || []
      };
      const offlineVisits = JSON.parse(localStorage.getItem('nmp_offline_visits') || '[]');
      offlineVisits.unshift(offlineV);
      localStorage.setItem('nmp_offline_visits', JSON.stringify(offlineVisits));
      return offlineV;
    }
  },

  // Get recent visits with filters
  getVisits: async (filters: Record<string, string>): Promise<{ visits: MedPracVisit[]; pagination: any }> => {
    try {
      const query = new URLSearchParams(filters).toString();
      const res = await fetch(`${API_BASE}/visits?${query}`);
      if (!res.ok) throw new Error('Failed to fetch visits');
      return await res.json();
    } catch {
      const offlineVisits = JSON.parse(localStorage.getItem('nmp_offline_visits') || '[]');
      return {
        visits: offlineVisits.slice(0, 50),
        pagination: { page: 1, limit: 50, total: offlineVisits.length, totalPages: 1 }
      };
    }
  },

  // Void / Reverse a visit entry
  voidVisit: async (visitId: number | string, reason: string, userId?: number, userName?: string) => {
    const res = await fetch(`${API_BASE}/visits/${visitId}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, reversed_by_user_id: userId, reversed_by_user_name: userName })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to void visit');
    }
    return await res.json();
  },

  // Get Dashboard Summary KPIs
  getDashboardKPIs: async (): Promise<MedPracKPIs> => {
    try {
      const res = await fetch(`${API_BASE}/dashboard`);
      if (!res.ok) throw new Error('Failed to load KPIs');
      return await res.json();
    } catch {
      return {
        todays_practice_revenue: 0,
        todays_patients: 0,
        new_patients: 0,
        repeat_patients: 0,
        injections_count: 0,
        iv_count: 0,
        drips_count: 0,
        avg_per_visit: 0
      };
    }
  },

  // Get Medprac Reports
  getReports: async (startDate: string, endDate: string): Promise<MedPracReportData> => {
    const res = await fetch(`${API_BASE}/reports?startDate=${startDate}&endDate=${endDate}`);
    if (!res.ok) throw new Error('Failed to load reports');
    return await res.json();
  }
};

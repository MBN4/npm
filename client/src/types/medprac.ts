export interface MedPracPatient {
  id: number;
  uuid: string;
  serial_number: string; // e.g. MP-000123
  name: string;
  age: number;
  age_unit: 'Years' | 'Months' | 'Days';
  sex: 'Male' | 'Female';
  phone?: string | null;
  address?: string | null;
  created_at?: string;
  updated_at?: string;
  total_visits?: number;
  first_visit?: string;
  last_visit?: string;
}

export interface MedPracCategory {
  id: number;
  name: string;
  description?: string | null;
  icon?: string | null;
  sort_order: number;
  is_active: number;
}

export interface MedPracService {
  id: number;
  code: string; // injection, iv, drip, dressing, nebulization, etc.
  name: string;
  default_cost: number;
  sort_order: number;
  is_active: number;
}

export interface MedPracVisitService {
  id?: number;
  visit_id?: number;
  service_id?: number | null;
  service_code: string;
  service_name: string;
  cost: number;
}

export interface MedPracVisitMedicine {
  id?: number;
  visit_id?: number;
  medicine_id?: number | null;
  brand_name: string;
  generic_name?: string | null;
  strength?: string | null;
  dosage_form?: string | null;
  quantity_used: number;
  batch_number?: string | null;
  expiry_date?: string | null;
  unit_cost?: number;
  selling_price?: number;
  total_price?: number;
  inventory_deducted?: number;
  deduct_inventory?: boolean;
}

export interface MedPracReversal {
  id: number;
  visit_id: number;
  reason: string;
  reversed_by_user_id: number;
  reversed_by_user_name: string;
  original_amount: number;
  reversed_amount: number;
  created_at: string;
}

export interface MedPracVisit {
  id: number;
  uuid: string;
  visit_id: string; // e.g. MV-20260921-0001
  patient_id: number;
  patient_serial: string;
  visit_date: string;
  therapeutic_category_id?: number | null;
  therapeutic_category_name: string;
  dose_given: string; // '1', '2', '3', '4', 'Custom'
  dose_notation?: string | null; // e.g. '1-0-1'
  practice_dose_charge: number;
  total_service_charge: number;
  total_medicine_charge: number;
  total_amount: number;
  notes?: string | null;
  medprac_by_user_id: number;
  medprac_by_user_name: string;
  status: 'COMPLETED' | 'VOIDED';
  created_at: string;
  updated_at: string;
  patient?: MedPracPatient;
  patient_name?: string;
  patient_age?: number;
  patient_age_unit?: string;
  patient_sex?: string;
  patient_phone?: string;
  patient_address?: string;
  services?: MedPracVisitService[];
  medicines?: MedPracVisitMedicine[];
  reversal?: MedPracReversal;
}

export interface MedPracKPIs {
  todays_practice_revenue: number;
  todays_patients: number;
  new_patients: number;
  repeat_patients: number;
  injections_count: number;
  iv_count: number;
  drips_count: number;
  avg_per_visit: number;
}

export interface MedPracReportData {
  startDate: string;
  endDate: string;
  summary: {
    total_revenue: number;
    total_dose_revenue: number;
    total_service_revenue: number;
    total_medicine_revenue: number;
    total_visits: number;
    unique_patients: number;
    new_patients: number;
    repeat_patients: number;
    avg_per_visit: number;
  };
  dose_breakdown: Array<{ dose_given: string; count: number; revenue: number }>;
  service_breakdown: Array<{ service_name: string; service_code: string; count: number; revenue: number }>;
  category_breakdown: Array<{ category_name: string; count: number; revenue: number }>;
  staff_breakdown: Array<{ user_name: string; visits_count: number; revenue: number }>;
}

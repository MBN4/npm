-- Naveed Medical Pharmacy (NMP) Database Schema
-- SQLite 3.44+ with Foreign Keys and WAL Mode

PRAGMA foreign_keys = ON;

-- 1. Roles & Permissions
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  module TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- 2. Users
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role_id INTEGER NOT NULL,
  phone TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- 3. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  old_values TEXT,
  new_values TEXT,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 4. Medicine Catalog & Master
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0 -- Main Category display order (matches the pharmacy's master category list)
);

CREATE TABLE IF NOT EXISTS manufacturers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS generics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  therapeutic_class TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS medicines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_name TEXT NOT NULL,
  generic_id INTEGER,
  category_id INTEGER,
  manufacturer_id INTEGER,
  strength TEXT,
  dosage_form TEXT, -- Subcategory / Product Type (e.g. Chewable Tablet, Syrup, Eye Drops) - free text, driven by the Main Category's subcategory list
  therapeutic_class TEXT, -- e.g. Analgesic/Antipyretic, Antibiotic, NSAID - independent of Main Category
  stock_unit TEXT, -- Display label for the loose sellable unit: Tablet, Capsule, Bottle, Vial, Tube, Piece, etc.
  tablets_per_pack INTEGER DEFAULT 10, -- Units per Pack (MULTI_TIER) or Units per Box (SIMPLE, packaging_type)
  packaging_type TEXT NOT NULL DEFAULT 'MULTI_TIER', -- MULTI_TIER (Unit->Pack->Box, tablets/capsules) or SIMPLE (Unit->Box, everything else)
  pack_size INTEGER DEFAULT 1,
  barcode TEXT UNIQUE,
  custom_barcode TEXT,
  rack_location TEXT,
  min_stock_level INTEGER DEFAULT 10,
  reorder_level INTEGER DEFAULT 20,
  is_prescription_required INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (generic_id) REFERENCES generics(id),
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (manufacturer_id) REFERENCES manufacturers(id)
);

-- 5. Suppliers & Inventory Batches
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_number TEXT,
  opening_balance REAL DEFAULT 0.0,
  current_balance REAL DEFAULT 0.0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  medicine_id INTEGER NOT NULL,
  batch_number TEXT NOT NULL,
  mfg_date TEXT,
  expiry_date TEXT NOT NULL, -- Format: YYYY-MM-DD
  purchase_price REAL NOT NULL,
  sale_price REAL NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  bonus_quantity INTEGER DEFAULT 0,
  supplier_id INTEGER,
  rack_location TEXT,
  status TEXT DEFAULT 'ACTIVE', -- ACTIVE, QUARANTINED, EXPIRED, DEPLETED
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE RESTRICT,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  UNIQUE(medicine_id, batch_number)
);

CREATE TABLE IF NOT EXISTS supplier_ledgers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  transaction_type TEXT NOT NULL, -- PURCHASE_INWARD, PAYMENT_OUT, RETURN_CREDIT
  reference_id TEXT,
  debit REAL DEFAULT 0.0,
  credit REAL DEFAULT 0.0,
  balance_after REAL NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL,
  supplier_id INTEGER NOT NULL,
  purchase_date TEXT NOT NULL,
  subtotal REAL NOT NULL,
  discount REAL DEFAULT 0.0,
  tax REAL DEFAULT 0.0,
  total_amount REAL NOT NULL,
  paid_amount REAL DEFAULT 0.0,
  remaining_amount REAL DEFAULT 0.0,
  payment_status TEXT DEFAULT 'PAID', -- PAID, PARTIAL, UNPAID
  payment_method TEXT DEFAULT 'CASH',
  created_by INTEGER,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL,
  medicine_id INTEGER NOT NULL,
  batch_id INTEGER,
  batch_number TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  mfg_date TEXT,
  purchase_price REAL NOT NULL,
  sale_price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  bonus_quantity INTEGER DEFAULT 0,
  line_discount REAL DEFAULT 0.0,
  line_total REAL NOT NULL,
  FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  FOREIGN KEY (medicine_id) REFERENCES medicines(id),
  FOREIGN KEY (batch_id) REFERENCES batches(id)
);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER,
  supplier_id INTEGER NOT NULL,
  return_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  total_refund_amount REAL NOT NULL,
  reason TEXT,
  created_by INTEGER,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 6. Stock Movements (Audit of all inventory mutations)
CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  movement_type TEXT NOT NULL, -- PURCHASE, SALE, RETURN_IN, RETURN_OUT, ADJUSTMENT, DAMAGE, EXPIRED
  quantity_change INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reference_type TEXT, -- SALE, PURCHASE, ADJUSTMENT, RETURN
  reference_id TEXT,
  notes TEXT,
  user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 7. Customers & CRM
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  mobile TEXT UNIQUE,
  age INTEGER,
  gender TEXT,
  allergy_notes TEXT,
  credit_limit REAL DEFAULT 0.0,
  current_balance REAL DEFAULT 0.0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_ledgers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  transaction_type TEXT NOT NULL, -- SALE_CREDIT, PAYMENT_RECEIVED, RETURN_REFUND
  reference_id TEXT,
  debit REAL DEFAULT 0.0,
  credit REAL DEFAULT 0.0,
  balance_after REAL NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- 8. Sales & Held Bills
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER,
  cashier_id INTEGER NOT NULL,
  subtotal REAL NOT NULL,
  discount REAL DEFAULT 0.0,
  tax REAL DEFAULT 0.0,
  total_amount REAL NOT NULL,
  paid_amount REAL NOT NULL,
  remaining_amount REAL DEFAULT 0.0,
  change_amount REAL DEFAULT 0.0,
  payment_method TEXT NOT NULL DEFAULT 'CASH', -- CASH, CARD, CREDIT, SPLIT
  status TEXT NOT NULL DEFAULT 'COMPLETED', -- COMPLETED, RETURNED, CANCELLED
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (cashier_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL,
  medicine_id INTEGER NOT NULL,
  batch_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  discount REAL DEFAULT 0.0,
  line_total REAL NOT NULL,
  purchase_price_snapshot REAL NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (medicine_id) REFERENCES medicines(id),
  FOREIGN KEY (batch_id) REFERENCES batches(id)
);

CREATE TABLE IF NOT EXISTS held_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_identifier TEXT UNIQUE NOT NULL,
  cashier_id INTEGER NOT NULL,
  customer_name TEXT,
  cart_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cashier_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 9. Prescriptions & Doctors (Rx)
CREATE TABLE IF NOT EXISTS doctors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  specialization TEXT,
  clinic_name TEXT,
  phone TEXT,
  email TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  doctor_id INTEGER,
  diagnosis TEXT,
  image_path TEXT,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS prescription_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prescription_id INTEGER NOT NULL,
  medicine_id INTEGER NOT NULL,
  dosage TEXT NOT NULL, -- e.g. 1 Tablet, 5ml
  frequency TEXT NOT NULL, -- OD, BD, TDS, QID, SOS
  duration TEXT, -- e.g. 5 days, 1 month
  timing TEXT, -- Before Food, After Food, With Meals
  instructions TEXT,
  FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE,
  FOREIGN KEY (medicine_id) REFERENCES medicines(id)
);

-- 10. Accounts & Expenses
CREATE TABLE IF NOT EXISTS cashbook_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_type TEXT NOT NULL, -- IN, OUT
  category TEXT NOT NULL, -- SALE, EXPENSE, SUPPLIER_PAYMENT, CUSTOMER_RECOVERY, OWNER_DRAW
  amount REAL NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  description TEXT,
  created_by INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_category TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_method TEXT DEFAULT 'CASH',
  payee TEXT,
  description TEXT,
  created_by INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 10. System Settings & Notifications
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'INFO', -- INFO, WARNING, DANGER, SUCCESS
  is_read INTEGER DEFAULT 0,
  link TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expiry_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  claim_number TEXT NOT NULL,
  claim_date TEXT NOT NULL,
  total_value REAL NOT NULL,
  status TEXT DEFAULT 'PENDING', -- PENDING, ACCEPTED, REPLACED, CREDITED, REJECTED
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS expiry_claim_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id INTEGER NOT NULL,
  batch_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  purchase_price REAL NOT NULL,
  FOREIGN KEY (claim_id) REFERENCES expiry_claims(id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES batches(id)
);

-- 11. Drug Safety & Clinical Knowledge Base
CREATE TABLE IF NOT EXISTS drug_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generic_a_id INTEGER NOT NULL,
  generic_b_id INTEGER NOT NULL,
  severity TEXT NOT NULL, -- CONTRAINDICATED, MAJOR, MODERATE, MINOR
  effect TEXT NOT NULL,
  management TEXT NOT NULL,
  evidence_level TEXT DEFAULT 'ESTABLISHED',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (generic_a_id) REFERENCES generics(id) ON DELETE CASCADE,
  FOREIGN KEY (generic_b_id) REFERENCES generics(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS drug_clinical_info (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generic_id INTEGER UNIQUE NOT NULL,
  atc_code TEXT,
  rx_status TEXT DEFAULT 'Rx', -- Rx, OTC, Controlled, Hospital Use
  pharmacological_class TEXT,
  countries_available TEXT DEFAULT 'Pakistan, USA, UK, EU, Global',
  pregnancy_category TEXT, -- A, B, C, D, X
  trimester_considerations TEXT,
  lactation_safety TEXT,
  adult_dosage TEXT,
  pediatric_dosage TEXT,
  neonatal_dosage TEXT,
  geriatric_dosage TEXT,
  weight_bsa_dosing TEXT,
  hepatic_renal_precautions TEXT,
  dialysis_considerations TEXT,
  indications_approved TEXT,
  indications_common TEXT,
  indications_offlabel TEXT,
  pharmacology_moa TEXT,
  pharmacokinetics_summary TEXT,
  absorption_bioavailability TEXT,
  distribution_protein_binding TEXT,
  metabolism_cyp TEXT,
  half_life_elimination TEXT,
  onset_peak_duration TEXT,
  contraindications_absolute TEXT,
  contraindications_relative TEXT,
  boxed_warnings TEXT,
  serious_warnings TEXT,
  cautions TEXT,
  monitoring_required TEXT,
  side_effects_common TEXT,
  side_effects_serious TEXT,
  side_effects_rare_life_threatening TEXT,
  food_interactions TEXT,
  disease_interactions TEXT,
  special_populations TEXT,
  pill_imprint TEXT,
  pill_shape TEXT,
  pill_color TEXT,
  monitoring_parameters TEXT,
  administration_instructions TEXT,
  storage_stability TEXT,
  patient_counseling_en TEXT,
  patient_counseling_professional TEXT,
  clinical_source TEXT DEFAULT 'USP-NF / DailyMed / BNF 86 Reference',
  source_version TEXT DEFAULT 'v2026.1',
  last_reviewed TEXT DEFAULT '2026-09-01',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (generic_id) REFERENCES generics(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_pharma_favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  generic_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (generic_id) REFERENCES generics(id) ON DELETE CASCADE,
  UNIQUE(user_id, generic_id)
);

CREATE TABLE IF NOT EXISTS user_pharma_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  generic_id INTEGER NOT NULL,
  note_text TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (generic_id) REFERENCES generics(id) ON DELETE CASCADE,
  UNIQUE(user_id, generic_id)
);

CREATE TABLE IF NOT EXISTS daily_closings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  closing_date TEXT UNIQUE NOT NULL,
  opening_balance REAL DEFAULT 0.0,
  cash_sales REAL DEFAULT 0.0,
  customer_recoveries REAL DEFAULT 0.0,
  other_inflows REAL DEFAULT 0.0,
  supplier_payments REAL DEFAULT 0.0,
  operating_expenses REAL DEFAULT 0.0,
  other_outflows REAL DEFAULT 0.0,
  expected_cash REAL DEFAULT 0.0,
  actual_cash REAL DEFAULT 0.0,
  variance REAL DEFAULT 0.0,
  status TEXT DEFAULT 'CLOSED',
  notes TEXT,
  closed_by INTEGER NOT NULL,
  closed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (closed_by) REFERENCES users(id)
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_medicines_brand ON medicines(brand_name);
CREATE INDEX IF NOT EXISTS idx_medicines_barcode ON medicines(barcode);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_batches_medicine ON batches(medicine_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_drug_interactions ON drug_interactions(generic_a_id, generic_b_id);
CREATE INDEX IF NOT EXISTS idx_user_pharma_fav ON user_pharma_favorites(user_id, generic_id);
CREATE INDEX IF NOT EXISTS idx_daily_closings_date ON daily_closings(closing_date);

-- 12. Cash Out / Expense & Fund Transfer Module
CREATE TABLE IF NOT EXISTS cash_out_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  default_nature TEXT NOT NULL DEFAULT 'BUSINESS_EXPENSE',
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cash_outs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT UNIQUE NOT NULL,
  date_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  amount REAL NOT NULL,
  category TEXT NOT NULL,
  transaction_nature TEXT NOT NULL DEFAULT 'BUSINESS_EXPENSE', -- BUSINESS_EXPENSE, SUPPLIER_PAYMENT, ASSET_PURCHASE, OWNER_WITHDRAWAL, INTERNAL_TRANSFER, BANK_DEPOSIT, WALLET_TRANSFER, REFUND, ADJUSTMENT
  payment_method TEXT NOT NULL DEFAULT 'CASH', -- CASH, BANK_TRANSFER, JAZZCASH, EASYPAISA, CHEQUE, CARD, OTHER
  recipient_type TEXT NOT NULL DEFAULT 'OTHER', -- SUPPLIER, COMPANY, PERSON, BANK, JAZZCASH_EASYPAISA, UTILITY, RENT, STAFF, OWNER, TAX, COURIER, MAINTENANCE, OTHER
  supplier_id INTEGER,
  recipient_name TEXT,
  recipient_phone TEXT,
  recipient_role TEXT,
  bank_name TEXT,
  account_name TEXT,
  account_ref TEXT,
  trx_ref TEXT,
  purpose TEXT NOT NULL,
  reference_no TEXT,
  notes TEXT,
  attachment_path TEXT,
  created_by INTEGER NOT NULL,
  branch_name TEXT DEFAULT 'Hospital Road Branch',
  counter_name TEXT DEFAULT 'Counter 01',
  status TEXT DEFAULT 'ACTIVE', -- ACTIVE, CANCELLED, REVERSED
  reversed_by INTEGER,
  reversed_at DATETIME,
  reversal_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (reversed_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_cash_outs_trx ON cash_outs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_cash_outs_created ON cash_outs(created_at);
CREATE INDEX IF NOT EXISTS idx_cash_outs_nature ON cash_outs(transaction_nature);
CREATE INDEX IF NOT EXISTS idx_cash_outs_status ON cash_outs(status);

-- 13. Medprac (Pharmacy Practice Record Module)
CREATE TABLE IF NOT EXISTS medprac_patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  serial_number TEXT UNIQUE NOT NULL, -- e.g. MP-000001
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  age_unit TEXT DEFAULT 'Years', -- Years | Months | Days
  sex TEXT NOT NULL, -- Male | Female
  phone TEXT,
  address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS medprac_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS medprac_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL, -- injection, iv, drip, dressing, nebulization, bp_check, glucose_check
  name TEXT NOT NULL,
  default_cost REAL DEFAULT 0.0,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS medprac_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  visit_id TEXT UNIQUE NOT NULL, -- e.g. MV-20260921-0001
  patient_id INTEGER NOT NULL,
  patient_serial TEXT NOT NULL,
  visit_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  therapeutic_category_id INTEGER,
  therapeutic_category_name TEXT NOT NULL,
  dose_given TEXT NOT NULL, -- 1, 2, 3, 4, Custom
  dose_notation TEXT, -- e.g. 1-0-1, 1-1-1
  practice_dose_charge REAL DEFAULT 0.0,
  total_service_charge REAL DEFAULT 0.0,
  total_medicine_charge REAL DEFAULT 0.0,
  total_amount REAL DEFAULT 0.0,
  notes TEXT,
  medprac_by_user_id INTEGER NOT NULL,
  medprac_by_user_name TEXT NOT NULL,
  status TEXT DEFAULT 'COMPLETED', -- COMPLETED, VOIDED
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES medprac_patients(id),
  FOREIGN KEY (therapeutic_category_id) REFERENCES medprac_categories(id),
  FOREIGN KEY (medprac_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS medprac_visit_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id INTEGER NOT NULL,
  service_id INTEGER,
  service_code TEXT NOT NULL,
  service_name TEXT NOT NULL,
  cost REAL DEFAULT 0.0,
  FOREIGN KEY (visit_id) REFERENCES medprac_visits(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES medprac_services(id)
);

CREATE TABLE IF NOT EXISTS medprac_visit_medicines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id INTEGER NOT NULL,
  medicine_id INTEGER,
  brand_name TEXT NOT NULL,
  generic_name TEXT,
  strength TEXT,
  dosage_form TEXT,
  quantity_used REAL NOT NULL DEFAULT 1,
  batch_number TEXT,
  expiry_date TEXT,
  unit_cost REAL DEFAULT 0.0,
  selling_price REAL DEFAULT 0.0,
  total_price REAL DEFAULT 0.0,
  inventory_deducted INTEGER DEFAULT 0,
  FOREIGN KEY (visit_id) REFERENCES medprac_visits(id) ON DELETE CASCADE,
  FOREIGN KEY (medicine_id) REFERENCES medicines(id)
);

CREATE TABLE IF NOT EXISTS medprac_reversals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reversed_by_user_id INTEGER NOT NULL,
  reversed_by_user_name TEXT NOT NULL,
  original_amount REAL NOT NULL,
  reversed_amount REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (visit_id) REFERENCES medprac_visits(id),
  FOREIGN KEY (reversed_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS medprac_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  user_name TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_medprac_patients_serial ON medprac_patients(serial_number);
CREATE INDEX IF NOT EXISTS idx_medprac_patients_name ON medprac_patients(name);
CREATE INDEX IF NOT EXISTS idx_medprac_patients_phone ON medprac_patients(phone);
CREATE INDEX IF NOT EXISTS idx_medprac_visits_visit_id ON medprac_visits(visit_id);
CREATE INDEX IF NOT EXISTS idx_medprac_visits_patient ON medprac_visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_medprac_visits_date ON medprac_visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_medprac_visits_status ON medprac_visits(status);

-- 14. Udhaar (Customer Credit Management Module)
CREATE TABLE IF NOT EXISTS udhaar_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  reference TEXT,
  cnic TEXT,
  serial_no TEXT NOT NULL, -- Auto last 4 digits of CNIC or sequence
  category TEXT NOT NULL DEFAULT 'Medicine', -- Medicine, Cosmetics, General Products, Surgical
  address TEXT DEFAULT 'Lahore, Pakistan',
  credit_limit REAL DEFAULT 50000.0,
  total_udhaar REAL DEFAULT 0.0,
  paid_amount REAL DEFAULT 0.0,
  balance REAL DEFAULT 0.0,
  status TEXT DEFAULT 'CLEARED', -- CLEARED, DUE, OVERDUE
  last_transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS udhaar_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL,
  date_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  type TEXT NOT NULL, -- 'DEBIT' (Udhaar taken) or 'CREDIT' (Payment received)
  category TEXT DEFAULT 'Medicine', -- Medicine, Cosmetics, General Products, Surgical
  reference_no TEXT,
  description TEXT,
  amount REAL NOT NULL,
  payment_method TEXT DEFAULT 'CASH', -- Cash, Bank, JazzCash, EasyPaisa
  balance_after REAL NOT NULL,
  created_by_user_id INTEGER NOT NULL,
  created_by_user_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES udhaar_customers(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_udhaar_cust_name ON udhaar_customers(name);
CREATE INDEX IF NOT EXISTS idx_udhaar_cust_mobile ON udhaar_customers(mobile);
CREATE INDEX IF NOT EXISTS idx_udhaar_cust_serial ON udhaar_customers(serial_no);
CREATE INDEX IF NOT EXISTS idx_udhaar_cust_cnic ON udhaar_customers(cnic);
CREATE INDEX IF NOT EXISTS idx_udhaar_cust_status ON udhaar_customers(status);
CREATE INDEX IF NOT EXISTS idx_udhaar_trx_cust ON udhaar_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_udhaar_trx_date ON udhaar_transactions(date_time);






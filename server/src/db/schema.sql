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
  is_active INTEGER DEFAULT 1
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
  dosage_form TEXT, -- Tablet, Capsule, Syrup, Injection, etc.
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
  pregnancy_category TEXT, -- A, B, C, D, X
  lactation_safety TEXT,
  adult_dosage TEXT,
  pediatric_dosage TEXT,
  food_instructions TEXT,
  hepatic_renal_precautions TEXT,
  common_side_effects TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (generic_id) REFERENCES generics(id) ON DELETE CASCADE
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

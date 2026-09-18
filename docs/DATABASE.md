# NMP Database Schema & Relational Model

## Database Engine
SQLite 3.44+ with WAL (Write Ahead Logging) and Foreign Key Constraints enabled.

## Core Tables

### 1. Security & Identity
- `users`: (id, username, email, password_hash, full_name, role_id, phone, is_active, created_at, updated_at)
- `roles`: (id, name, description) - Admin, Pharmacist, Cashier, Inventory Staff
- `permissions`: (id, code, description, module)
- `role_permissions`: (role_id, permission_id)
- `audit_logs`: (id, user_id, action, entity, entity_id, old_values, new_values, ip_address, created_at)

### 2. Catalog & Medicine Master
- `categories`: (id, name, description)
- `manufacturers`: (id, name, contact, email, address)
- `generics`: (id, name, therapeutic_class, description)
- `medicines`: (id, brand_name, generic_id, category_id, manufacturer_id, strength, dosage_form, pack_size, barcode, custom_barcode, rack_location, min_stock_level, reorder_level, is_prescription_required, is_active, notes, created_at, updated_at)

### 3. Inventory & Batches
- `batches`: (id, medicine_id, batch_number, mfg_date, expiry_date, purchase_price, sale_price, quantity, bonus_quantity, supplier_id, rack_location, status, created_at, updated_at)
- `stock_movements`: (id, batch_id, movement_type [PURCHASE, SALE, RETURN_IN, RETURN_OUT, ADJUSTMENT, DAMAGE, EXPIRED], quantity_change, balance_after, reference_type, reference_id, notes, user_id, created_at)
- `stock_adjustments`: (id, batch_id, adjustment_type, quantity, reason, approved_by, created_at)

### 4. Suppliers & Purchases
- `suppliers`: (id, name, contact_person, phone, email, address, tax_number, opening_balance, current_balance, is_active, created_at)
- `supplier_ledgers`: (id, supplier_id, transaction_type, reference_id, debit, credit, balance_after, notes, created_at)
- `purchases`: (id, invoice_number, supplier_id, purchase_date, subtotal, discount, tax, total_amount, paid_amount, payment_status, created_by, created_at)
- `purchase_items`: (id, purchase_id, medicine_id, batch_number, mfg_date, expiry_date, purchase_price, sale_price, quantity, bonus_quantity, line_total)
- `purchase_returns`: (id, purchase_id, supplier_id, reason, total_amount, created_by, created_at)

### 5. Sales Counter & POS
- `customers`: (id, name, mobile, age, gender, allergy_notes, credit_limit, current_balance, created_at)
- `customer_ledgers`: (id, customer_id, transaction_type, reference_id, debit, credit, balance_after, notes, created_at)
- `sales`: (id, invoice_number, customer_id, cashier_id, subtotal, discount, tax, total_amount, paid_amount, remaining_amount, change_amount, payment_method [CASH, CARD, CREDIT, SPLIT], status [COMPLETED, RETURNED, CANCELLED], notes, created_at)
- `sale_items`: (id, sale_id, medicine_id, batch_id, quantity, unit_price, discount, line_total, purchase_price_snapshot)
- `held_bills`: (id, counter_identifier, cashier_id, customer_name, cart_data_json, created_at)
- `sale_returns`: (id, sale_id, invoice_number, customer_id, cashier_id, refund_amount, reason, created_at)
- `sale_return_items`: (id, sale_return_id, sale_item_id, batch_id, quantity, refund_rate, line_total)

### 6. Prescriptions (Rx)
- `doctors`: (id, name, specialization, clinic_name, phone)
- `prescriptions`: (id, patient_id, doctor_id, diagnosis, image_path, created_at)
- `prescription_items`: (id, prescription_id, medicine_id, dosage, frequency, duration, timing, instructions)

### 7. Accounts & Cashbook
- `cashbook_entries`: (id, entry_type [IN, OUT], category, amount, reference_type, reference_id, description, created_by, created_at)
- `expenses`: (id, expense_category, amount, payment_method, payee, description, created_by, created_at)
- `daily_closings`: (id, closing_date [YYYY-MM-DD UNIQUE], opening_balance, cash_sales, customer_recoveries, other_inflows, supplier_payments, operating_expenses, other_outflows, expected_cash, actual_cash, variance, status, notes, closed_by, closed_at)

### 8. System & Settings
- `settings`: (key, value, description, updated_at)
- `notifications`: (id, title, message, notification_type, entity, entity_id, is_read, created_at)

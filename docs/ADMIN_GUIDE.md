# Naveed Medical Pharmacy (NMP) — Administrator & Pharmacist Guide

This guide covers system administration, inventory controls, purchasing workflows, financial oversight, demand forecasting, hardware configuration, and staff management for **Naveed Medical Pharmacy (NMP)**.

---

## 1. System Administration & Access Control

### User Management & Roles
Navigate to **Users & Roles**:
- **Admin**: Full system authority, financial closeouts, backup snapshots, system settings, staff management.
- **Pharmacist**: Inventory master control, purchase orders, supplier management, batch write-offs, clinical validation.
- **Cashier**: POS billing, customer registration, cashbook receipt entries, held bill parking.

### Adding & Deactivating Staff Accounts
1. Click **Add User**, enter username, full name, phone, email, and temporary password.
2. Select role assignment.
3. To revoke staff access immediately, toggle **Active Status** to *Inactive*. Active JWT tokens for deactivated accounts are invalidated on subsequent requests.

### Audit Trail Inspection
- Navigate to **Audit Logs** to view immutable event logs (timestamp, user, action, entity affected, old values, new values, IP address).
- All sensitive operations—such as batch adjustments, supplier payment records, system setting modifications, and database backup downloads—are permanently audited.

---

## 2. Medicine Master & Batch Inventory

### Managing Medicine Master Catalog
- Navigate to **Medicines**:
- Click **Add Medicine** to define:
  - Brand Name, Generic Molecule, Therapeutic Category, Manufacturer.
  - Strength, Dosage Form (Tablet, Capsule, Syrup, Injection, Cream, Drops, Inhaler).
  - Pack Size (units per box/pack), Primary EAN Barcode, Shelf Rack Location (e.g. Rack A-4).
  - Min Stock Warning Level and Dynamic Reorder Point.

### Batch Ledger & Stock Movements
- Each inward stock shipment is tracked as an individual **Batch** with its own:
  - Batch Number, Manufacturing Date, Expiry Date, Purchase Rate, MRP / Sale Price, Initial & Remaining Quantity.
- Stock movements (INWARD, SALE, RETURN, ADJUSTMENT, WRITE_OFF) are recorded in the ledger with audit references.

---

## 3. Supplier Management & Inward Purchasing (GRN)

### Registering Suppliers
- Navigate to **Suppliers**:
- Record Supplier/Distributor Company Name, Contact Representative, Mobile, Physical Address, NTN / STRN tax registration.
- View outstanding supplier payables balance and historical payment vouchers.

### Inward Purchase Invoices
1. Navigate to **Purchases > New Purchase Invoice**.
2. Select the Supplier and enter the distributor's physical invoice number.
3. Add line items: Medicine, Batch Number, Expiry Date, Pack Quantity, Purchase Rate per unit, and MRP.
4. The system validates that the expiry date is strictly in the future.
5. Save the invoice. The system atomically creates new batches, logs inward stock movements, and updates the supplier's balance in the accounts ledger.

---

## 4. Expiry Management & Disposals

- Navigate to **Expiry Control**:
- View categorized batches across multiple time horizons:
  - **Critical (Under 30 Days)**: High priority for promotional clearance or return.
  - **Upcoming (30–90 Days)**: Proactive vendor return window.
  - **Monitoring (90–180 Days)**: Safe shelf stock.
  - **Expired Stock**: Hard-blocked from POS sales counter.
- **Disposal / Write-Off Action**: Click *Write-Off Batch*, specify quantity and reason (Damaged, Expired, Recalled). The system zeros the batch quantity, generates an inventory adjustment movement, and logs the write-off for accounting P&L.
- **Vendor Return Claims**: Generate a Supplier Return voucher to adjust credit from the distributor.

---

## 5. Financial Accounts, Cashbook & Profit / Loss

- Navigate to **Accounts**:
- **Daily Cashbook**: Live tracking of Cash IN (Sales cash tendered, customer credit recovery) and Cash OUT (Petty cash expenses, supplier bill payments).
- **Profit & Loss Statement (P&L)**:
  - Net Sales Revenue (Gross Sales minus Discounts).
  - Cost of Goods Sold (COGS) calculated from batch purchase rates at time of sale.
  - Operating Gross Profit & Gross Margin %.
  - Operating Expenses (Rent, Utilities, Staff Salaries, Disposals).
  - Net Operating Income.

---

## 6. Reports & Business Intelligence (BI)

- Navigate to **Reports**:
- **Sales Analytics**: Daily, weekly, monthly revenue trends and payment method distribution (Cash vs Card vs Credit).
- **Cashier Performance**: Transaction volume, average basket size, and revenue generated per counter operator.
- **Inventory Valuation**: Current stock value evaluated on both Cost Basis and Retail MRP Basis.
- **Dead Stock & Slow Movers**: Identifies medicines with zero sales over 60–90 days to free up trapped capital.
- **Customer Udhar Aging**: Categorizes outstanding customer receivables into 0–30, 31–60, and 61+ days past due.
- **CSV Export**: One-click export for accountants and external tax compliance.

---

## 7. Demand Forecasting & Automated Reordering

- Navigate to **Forecasting**:
- **Average Daily Consumption (ADC)**: Calculated using sliding lookback sales volume.
- **Days of Stock Remaining (DOS)**: Predicts remaining stock duration based on current consumption rates.
- **Dynamic Reorder Point (ROP)**: Accounts for supplier lead time and safety stock buffer.
- **Auto-Generate Purchase Order**: Creates a draft purchase order rounded to whole box/pack sizes for immediate supplier dispatch.

---

## 8. Hardware & Thermal Receipt Configuration

Navigate to **Settings > Thermal Printer & POS**:
- **Paper Roll Width**: Select **80mm Standard** (48 columns) or **58mm Compact** (32 columns).
- **Receipt Header & Footer**: Configure pharmacy trade name, phone numbers, drug sale license (DSL), NTN, and return policy wording.
- **Hardware Triggers**: Toggle ESC/POS auto-cutter command (`\x1D\x56\x41\x00`) and cash drawer kick pulse (`\x1B\x70\x00\x19\xFA`).
- **Barcode Sticker Printing**: Navigate to **Settings > Barcode Label Generator** to generate and print shelf stickers formatted for standard 2-column or 3-column sticker sheets using `window.print()`.

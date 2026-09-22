# Naveed Medical Pharmacy (NMP) — Cashier & Staff User Guide

Welcome to the **Naveed Medical Pharmacy (NMP)** system. This user guide provides step-by-step operating instructions for daily counter operations, sales processing, customer accounts, and medicine lookups.

---

## 1. Authentication & System Access

1. Open your browser and navigate to the NMP Portal (`http://localhost:5173` or local server IP).
2. Enter your assigned **Username** and **Password** (e.g. `cashier` / `cashier123`).
3. Click **Sign In**.
4. The system validates your credentials and redirects you to the default workspace according to your role permissions.
5. In the top-right header, you can view your active username, role badge, system notifications, and dark/light theme toggle.
6. Always click **Sign Out** at the end of your shift to maintain security and close your session.

---

## 2. Point of Sale (POS) & Counter Billing

The POS module is the central billing counter designed for rapid barcode scanning and fast customer checkout.

### Step 1: Searching and Adding Items
- **Barcode Scanner**: Click on the search bar (or press `F2`) and scan the medicine box barcode. The system instantly selects the earliest expiring available batch via **FEFO (First-Expiry-First-Out)** logic and increments the cart quantity.
- **Manual Brand Search**: Type the brand name (e.g. "Panadol", "Augmentin") or generic name in the search bar. Real-time matching shows brand, strength, pack size, rack location, and unit price.
- **Batch Selection**: Click on any item in the search results. If multiple active batches exist, you can view their expiry dates and batch numbers. The system prevents selection of expired batches automatically.

### Step 2: Adjusting Quantities & Discounts
- In the active cart panel, adjust item quantities using the `+` and `-` buttons or enter the exact number.
- Apply bill-level discounts as either a flat rupee amount or percentage.
- Review the live subtotal, discount, and net payable amount.

### Step 3: Customer Linking & Credit (Udhar)
- **Walk-in Customer**: By default, transactions are attributed to Walk-in Customer.
- **Registered Customer**: Search by customer mobile number or name. Once selected, their active credit balance (udhar) and allergy badges are displayed immediately.

### Step 4: Checkout & Payment
- Select payment method: **Cash**, **Card**, or **Credit (Udhar)**.
- For Cash: Enter the amount tendered. The system instantly calculates and displays the change due.
- For Credit: The unpaid amount is automatically debited to the customer's ledger.
- Click **Complete Sale & Print Bill**. The cash drawer kicks open (if configured), and a formatted thermal receipt prints automatically.

### Step 5: Parking & Restoring Held Bills
- If a customer needs to fetch more items or step aside, click **Hold Bill** (`F4`). The cart is parked with a timestamp.
- Click **Held Bills** in the top bar to recall any parked cart and finish billing without delaying other customers.

---

## 3. Customer CRM & Patient Ledger

- Open **Patients & CRM**. Use **Register Patient** to enter a name, optional mobile and age, gender, allergy notes, and credit limit.
- To correct an existing record, find the patient by name or mobile and click **Edit**. Save changes to the name, mobile, age, gender, allergy notes, or credit limit. Clearing mobile, age, or allergy notes removes those values. The patient's purchases, prescriptions, and balance remain attached to the same profile. Editing requires `manage_patients` permission.
- Click **History** for the patient's purchases and receivable ledger. Click **Recover** to record a cash or bank payment against a balance.
- In **Udhaar (Credit)**, record another credit purchase, a payment, or a noncash reduction for a return, discount, correction, or write-off. Enter a reason for reductions. A physical return also needs a separate inventory update.

---

## 4. Prescription (Rx) Management

- Open **Prescriptions** and click **New Prescription**. Select an existing patient and optionally an attending doctor or pharmacist.
- If the patient is not listed, click **New Patient** beside the Patient field. Enter their details, then click **Save & Select Patient**. The new profile is selected in the current prescription.
- To correct the selected existing patient while writing the Rx, click **Edit Patient**, change the details, and save. This action requires `manage_patients` permission.
- Enter a diagnosis, medicine lines, dosage, frequency, duration, timing, and instructions; then click **Save & Record Rx**.

## 5. Medicine Catalog & Inventory Editing

- Medicines from `New_Rack_Medicines_List.pdf` were imported as catalog entries only. Add a stock batch when actual quantity, prices, and expiry are known.
- In **Inventory & Stock**, click **Edit** on a batch to correct the medicine name, generic, manufacturer, strength, barcode, category, product type, therapeutic class, packaging, stock thresholds, notes, batch number, expiry, prices, and rack. Product fields affect every batch of that medicine; batch fields affect the selected batch.
- Use **Adjust** to change stock quantity so the movement is recorded in the audit trail. Main Category and Therapeutic Class menus open below their fields and scroll when needed.

## 6. MedPrac Slips

- Open a MedPrac receipt and click **Print on POS Printer**. On the Windows POS computer, it is sent to the same Speed-X printer path as POS receipts. If direct printing is unavailable, choose the POS printer in the thermal print dialog.

---

## 7. Drug Safety & AI Clinical Assistant

- Navigate to the **Drug AI Safety** menu.
- **Multi-Drug Interaction Checker**: Select two or more medicines (e.g. Ciprofloxacin + Antacids, or Warfarin + Aspirin). Click *Analyze Interactions* to review severity (Major, Moderate, Minor) and clinical management advice.
- **Generic Substitution**: Search an out-of-stock medicine to find bioequivalent in-stock brands sharing the same generic molecule and strength.
- **Clinical Knowledge Search**: Look up dosage recommendations, contraindications, and pregnancy risk categories (FDA Category A, B, C, D, X).

---

## 8. Daily Register Closeout

At the end of each shift:
1. Navigate to **Accounts > Cashbook**.
2. Review total cash sales, card sales, and customer credit recovery receipts.
3. Count the physical cash in the drawer.
4. Record any petty cash expenses (e.g. tea, cleaning, packaging supplies) using **Record Cash Expense**.
5. Ensure physical cash matches the calculated system balance. Report any discrepancies to the shift supervisor or pharmacist on duty.

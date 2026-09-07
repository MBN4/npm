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

- Navigate to the **Patients** menu.
- **Register New Patient**: Click *Add Patient*, enter full name, mobile number, emergency contact, CNIC, and known drug allergies (e.g., Penicillin, NSAIDs, Sulfa).
- **Patient History**: Click on any patient record to inspect their complete transaction history, dispensed medications, and debt balance.
- **Receiving Debt (Udhar) Payments**: Click *Receive Payment*, enter the received cash amount and optional receipt notes. The customer's outstanding balance updates immediately.

---

## 4. Prescription (Rx) Management

- Navigate to the **Prescriptions** menu.
- Click **Record Prescription**.
- Enter Doctor Name, Clinic/Hospital, Patient Name, Diagnosis, and prescribed medication lines with frequency (e.g., 1 tablet twice daily after meals).
- Save the prescription. Prescriptions can be directly fulfilled into the POS cart with one click.

---

## 5. Drug Safety & AI Clinical Assistant

- Navigate to the **Drug AI Safety** menu.
- **Multi-Drug Interaction Checker**: Select two or more medicines (e.g. Ciprofloxacin + Antacids, or Warfarin + Aspirin). Click *Analyze Interactions* to review severity (Major, Moderate, Minor) and clinical management advice.
- **Generic Substitution**: Search an out-of-stock medicine to find bioequivalent in-stock brands sharing the same generic molecule and strength.
- **Clinical Knowledge Search**: Look up dosage recommendations, contraindications, and pregnancy risk categories (FDA Category A, B, C, D, X).

---

## 6. Daily Register Closeout

At the end of each shift:
1. Navigate to **Accounts > Cashbook**.
2. Review total cash sales, card sales, and customer credit recovery receipts.
3. Count the physical cash in the drawer.
4. Record any petty cash expenses (e.g. tea, cleaning, packaging supplies) using **Record Cash Expense**.
5. Ensure physical cash matches the calculated system balance. Report any discrepancies to the shift supervisor or pharmacist on duty.

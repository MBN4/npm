# NMP Business Invariants & Rules

## 1. Inventory & FEFO
- **Negative Stock Prohibition**: No stock batch quantity can drop below 0.
- **Strict FEFO (First Expiry, First Out)**:
  - When a medicine is added to the sale cart, the system automatically selects the batch with the earliest valid expiry date (`expiry_date > CURRENT_DATE`).
  - Cashiers may select an alternate batch only if that batch is also valid and non-expired.
- **Expired Stock Hard Block**:
  - The server explicitly rejects any sale item referencing a batch whose `expiry_date <= CURRENT_DATE`.
  - Expired batches cannot be added to cart or checked out under any circumstances.
- **Traceable Movements**:
  - Every batch quantity modification MUST record a corresponding row in `stock_movements`.

## 2. Point of Sale & Billing
- **Atomic Checkout**:
  - Validation -> Batch verification -> FEFO validation -> Stock deduction -> Stock movement log -> Sale record -> Sale items -> Payment record -> Customer ledger (if credit) -> Cashbook entry (if cash) -> Audit log.
  - All wrapped inside an atomic SQLite transaction. Failure on any step results in immediate rollback.
- **Held Bills**:
  - Cashiers can hold an incomplete cart and resume it without corrupting inventory.
- **Sales Returns**:
  - Returns require invoice reference, reason, quantity check, and staff authorization.
  - Returned items are restocked to their original batch or marked for inspection, and customer credit / cash is reimbursed.

## 3. Financial Accounts
- **Profit Calculation**:
  - Gross Profit = `(Sale Price - Purchase Price Snapshot) * Quantity - Discount`.
- **Double-Entry Consistency**:
  - Cash sales automatically post to `cashbook_entries` with category `SALE`.
  - Credit sales automatically post to `customer_ledgers` as a `DEBIT` to the customer's balance.
  - Supplier purchases on credit post to `supplier_ledgers` as a `CREDIT` payable.

## 4. Purchases & Inward Stock
- **One batch row per medicine + batch number**: receiving a batch that is already in stock adds to it; a different batch number creates a separate batch so FEFO stays correct.
- **Batch expiry conflicts are never silently overwritten**: the same batch with a different expiry is refused unless the admin explicitly confirms the correction.
- **No duplicate invoices**: the same supplier invoice number cannot be posted twice.
- **No expired receipts**: expiry must be after the purchase date.
- **Scanner is read-only**: invoice scanning/AI never creates suppliers, medicines or batches. They are created only when the admin saves the reviewed purchase, inside the same transaction.
- **Never invent data**: batch numbers, expiry dates and invoice numbers that cannot be read are left empty for the admin to enter.


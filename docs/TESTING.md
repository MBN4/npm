# NMP Testing Strategy

## Philosophy
Testing is non-negotiable for pharmacy software. Every transaction, calculation, permission check, and stock adjustment must have verified tests.

## Test Suites
1. **Unit Tests**:
   - FEFO batch prioritization logic (`earliest valid non-expired batch first`).
   - Hard block on expired batches (`expiry_date <= today`).
   - Line total, discount, tax, subtotal, change calculations.
   - Profit formula: `(sale_price - purchase_price) * qty - line_discount`.
   - Reorder and Days of Stock formula.
2. **Integration Tests**:
   - Complete Sale workflow: stock decrement, ledger debit/credit, cashbook recording, audit log generation.
   - Full rollback verification: simulated failure on payment step rolls back batch stock.
   - Purchase entry: batch creation, stock increment, supplier payable balance update.
   - Sales return: restock, refund, audit logging.
3. **End-to-End Tests**:
   - Authentication, role switching, POS billing, receipt print simulation.

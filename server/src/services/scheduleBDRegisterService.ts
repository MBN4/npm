import { db } from '../db/index.js';

export function generateRegisterSerial(): string {
  const year = new Date().getFullYear();
  const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM schedule_bd_register_entries WHERE serial_number LIKE ?`).get(`SBD-${year}-%`) as { cnt: number };
  const nextSeq = String(countRow.cnt + 1).padStart(6, '0');
  return `SBD-${year}-${nextSeq}`;
}

export interface RegisterEntryInput {
  classificationId: number | null;
  classificationVersion: number | null;
  ruleVersion: string;
  saleId: number | null;
  saleItemId: number | null;
  invoiceNumber: string | null;
  branch?: string;
  posCounter?: string;
  prescriptionId: number | null;
  prescriptionItemId: number | null;
  originalDocumentReference: string | null;
  patientSnapshot: any;
  purchaserSnapshot: any;
  prescriberSnapshot: any;
  medicineSnapshot: any;
  batchId: number | null;
  batchNumberSnapshot: string | null;
  expiryDateSnapshot: string | null;
  dispensedQuantity: number;
  unit: string | null;
  cashierId: number | null;
  cashierSnapshot: any;
  approvedByUserId: number | null;
  approvedAt: string | null;
  approvalCredentialsRef: string | null;
  schedule: string;
  status?: string;
  entrySource?: 'POS' | 'MANUAL';
  originalDispensingDate?: string | null;
}

/** Must be called from inside an existing runTransaction() so it commits atomically with the sale/stock writes. */
export function createRegisterEntry(input: RegisterEntryInput): number {
  const insertStmt = db.prepare(`
    INSERT INTO schedule_bd_register_entries (
      serial_number, classification_id, classification_version, rule_version,
      sale_id, sale_item_id, invoice_number, branch, pos_counter,
      prescription_id, prescription_item_id, original_document_reference,
      patient_snapshot, purchaser_snapshot, prescriber_snapshot, medicine_snapshot,
      batch_id, batch_number_snapshot, expiry_date_snapshot, dispensed_quantity, unit,
      cashier_id, cashier_snapshot, approved_by_user_id, approved_at, approval_credentials_ref,
      schedule, status, entry_source, original_dispensing_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // COUNT(*)-based serials can race across concurrent requests touching the same WAL database;
  // retry with a freshly-generated serial a few times rather than failing an otherwise-valid sale.
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const serial = generateRegisterSerial();
    try {
      const result = insertStmt.run(
        serial,
        input.classificationId, input.classificationVersion, input.ruleVersion,
        input.saleId, input.saleItemId, input.invoiceNumber, input.branch || 'Hospital Road Branch', input.posCounter || 'Counter 01',
        input.prescriptionId, input.prescriptionItemId, input.originalDocumentReference,
        input.patientSnapshot ? JSON.stringify(input.patientSnapshot) : null,
        input.purchaserSnapshot ? JSON.stringify(input.purchaserSnapshot) : null,
        input.prescriberSnapshot ? JSON.stringify(input.prescriberSnapshot) : null,
        JSON.stringify(input.medicineSnapshot),
        input.batchId, input.batchNumberSnapshot, input.expiryDateSnapshot, input.dispensedQuantity, input.unit,
        input.cashierId, input.cashierSnapshot ? JSON.stringify(input.cashierSnapshot) : null,
        input.approvedByUserId, input.approvedAt, input.approvalCredentialsRef,
        input.schedule, input.status || 'COMPLETED', input.entrySource || 'POS', input.originalDispensingDate || null
      );
      return Number(result.lastInsertRowid);
    } catch (err: any) {
      const message = String(err?.message || '');
      if (attempt < maxAttempts && message.includes('UNIQUE constraint failed') && message.includes('serial_number')) {
        continue;
      }
      throw err;
    }
  }
  throw new Error('Failed to allocate a unique register serial number after multiple attempts');
}

export interface AmendmentInput {
  registerEntryId: number;
  amendmentType: 'CORRECTION' | 'CANCELLATION' | 'REVERSAL';
  reason: string;
  authorUserId: number | null;
  beforeValues?: any;
  afterValues?: any;
  newStatus?: string;
}

export function recordAmendment(input: AmendmentInput): number {
  const entry = db.prepare('SELECT * FROM schedule_bd_register_entries WHERE id = ?').get(input.registerEntryId) as any;
  if (!entry) throw new Error('Register entry not found');

  const result = db.prepare(`
    INSERT INTO schedule_bd_register_amendments (register_entry_id, amendment_type, reason, author_user_id, before_values, after_values)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    input.registerEntryId, input.amendmentType, input.reason, input.authorUserId,
    input.beforeValues ? JSON.stringify(input.beforeValues) : JSON.stringify(entry),
    input.afterValues ? JSON.stringify(input.afterValues) : null
  );

  if (input.newStatus) {
    db.prepare('UPDATE schedule_bd_register_entries SET status = ? WHERE id = ?').run(input.newStatus, input.registerEntryId);
  }

  return Number(result.lastInsertRowid);
}

export function linkReturn(registerEntryId: number, salesReturnId: number, saleReturnItemId: number, quantityReturned: number): number {
  const entry = db.prepare('SELECT * FROM schedule_bd_register_entries WHERE id = ?').get(registerEntryId) as any;
  if (!entry) throw new Error('Register entry not found');

  const alreadyLinked = db.prepare(`
    SELECT COALESCE(SUM(quantity_returned), 0) as total FROM schedule_bd_register_return_links WHERE register_entry_id = ?
  `).get(registerEntryId) as { total: number };

  if (alreadyLinked.total + quantityReturned > entry.dispensed_quantity) {
    throw new Error(`Return quantity (${quantityReturned}) would exceed dispensed quantity (${entry.dispensed_quantity}) for register entry ${entry.serial_number}`);
  }

  const result = db.prepare(`
    INSERT INTO schedule_bd_register_return_links (register_entry_id, sales_return_id, sale_return_item_id, quantity_returned)
    VALUES (?, ?, ?, ?)
  `).run(registerEntryId, salesReturnId, saleReturnItemId, quantityReturned);

  return Number(result.lastInsertRowid);
}

export interface ManualEntryInput extends Omit<RegisterEntryInput, 'saleId' | 'saleItemId' | 'entrySource'> {
  createdByUserId: number;
}

/** Audited manual entry for paper/legacy records. Never deducts stock - that requires a separately authorized inventory adjustment. */
export function createManualEntry(input: ManualEntryInput): number {
  return createRegisterEntry({
    ...input,
    saleId: null,
    saleItemId: null,
    entrySource: 'MANUAL',
    status: 'MANUAL'
  });
}

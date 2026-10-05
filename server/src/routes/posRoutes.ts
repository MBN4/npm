import { Router, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db, runTransaction } from '../db/index.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';
import { triggerAutoSync } from '../services/gitSyncService.js';
import { safeJsonParse } from '../utils/json.js';
import { getVerifiedScheduleForMedicine } from '../services/classificationService.js';
import { createRegisterEntry } from '../services/scheduleBDRegisterService.js';
import { allocateFefo } from '../services/fefoAllocationService.js';

export const posRouter = Router();

const SCHEDULE_BD_RULE_VERSION = 'punjab-2007-draft-v1';
const SCHEDULE_BD_APPROVAL_TTL_MS = 10 * 60 * 1000;

function itemsSignature(items: Array<{ medicineId: number; batchId: number; quantity: number }>): string {
  const normalized = items
    .map(i => `${i.medicineId}:${i.batchId}:${i.quantity}`)
    .sort()
    .join('|');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

interface ScheduleGateResult {
  scheduleInfo: ReturnType<typeof getVerifiedScheduleForMedicine>;
  prescriptionItem: any;
  prescription: any;
}

function resolveScheduleGate(item: any): ScheduleGateResult | null {
  const scheduleInfo = getVerifiedScheduleForMedicine(Number(item.medicineId));
  if (!scheduleInfo.schedule) return null;

  const prescriptionItemId = Number(item.prescriptionItemId);
  if (!prescriptionItemId) {
    throw new Error(`A linked prescription is required to dispense a Schedule ${scheduleInfo.schedule} medicine (medicine ID ${item.medicineId}).`);
  }

  const prescriptionItem = db.prepare('SELECT * FROM prescription_items WHERE id = ?').get(prescriptionItemId) as any;
  if (!prescriptionItem || prescriptionItem.medicine_id !== Number(item.medicineId)) {
    throw new Error(`Linked prescription item does not match the medicine being dispensed (medicine ID ${item.medicineId}).`);
  }

  const prescription = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(prescriptionItem.prescription_id) as any;
  if (!prescription) {
    throw new Error('Linked prescription record was not found.');
  }

  const qty = Number(item.quantity);
  if (prescriptionItem.authorized_quantity != null) {
    const remaining = Number(prescriptionItem.authorized_quantity) - Number(prescriptionItem.dispensed_quantity || 0);
    if (qty > remaining) {
      throw new Error(`Requested quantity (${qty}) exceeds the remaining authorized quantity (${remaining}) on this prescription for medicine ID ${item.medicineId}.`);
    }
  }

  return { scheduleInfo, prescriptionItem, prescription };
}

function buildDescriptionSnapshot(brandName: string, strength?: string | null): string {
  if (!strength) return brandName;
  return brandName.toLowerCase().includes(strength.toLowerCase()) ? brandName : `${brandName} ${strength}`;
}

posRouter.get('/search', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const query = (req.query.q as string || '').trim();
  if (!query) {
    res.json({ results: [] });
    return;
  }

  // 1. Instant Exact Barcode Match (0ms execution for barcode scanner)
  const exactMatch = db.prepare(`
    SELECT 
      m.id, m.brand_name, m.strength, m.dosage_form, m.pack_size,
      CASE 
        WHEN m.packaging_type = 'SIMPLE' OR LOWER(m.dosage_form) LIKE '%syrup%' OR LOWER(m.dosage_form) LIKE '%suspension%' OR LOWER(m.dosage_form) LIKE '%liquid%' OR LOWER(m.dosage_form) LIKE '%bottle%' OR LOWER(m.dosage_form) LIKE '%drop%' OR LOWER(m.dosage_form) LIKE '%injection%' THEN 1 
        ELSE COALESCE(m.tablets_per_pack, 10) 
      END as tablets_per_pack,
      m.stock_unit, m.packaging_type,
      m.barcode, m.custom_barcode,
      m.rack_location, m.is_prescription_required,
      g.name as generic_name,
      c.name as category_name
    FROM medicines m
    LEFT JOIN generics g ON m.generic_id = g.id
    LEFT JOIN categories c ON m.category_id = c.id
    WHERE m.is_active = 1 AND (m.barcode = ? OR m.custom_barcode = ?)
    LIMIT 1
  `).get(query, query) as any;

  if (exactMatch) {
    const validBatches = db.prepare(`
      SELECT
        b.id as batch_id, b.batch_number, b.expiry_date, b.sale_price, b.purchase_price,
        b.quantity, b.rack_location as batch_rack,
        CAST((julianday(b.expiry_date) - julianday('now')) AS INTEGER) as days_to_expiry
      FROM batches b
      WHERE b.medicine_id = ?
        AND b.quantity > 0
        AND b.expiry_date > date('now')
        AND b.status = 'ACTIVE'
      ORDER BY b.expiry_date ASC
    `).all(exactMatch.id) as any[];

    const totalAvailableStock = validBatches.reduce((acc, b) => acc + b.quantity, 0);
    const fefoBatch = validBatches.length > 0 ? validBatches[0] : null;
    const scheduleInfo = getVerifiedScheduleForMedicine(exactMatch.id);

    res.json({
      results: [{
        ...exactMatch,
        total_stock: totalAvailableStock,
        fefo_batch: fefoBatch,
        available_batches: validBatches,
        schedule: scheduleInfo.schedule,
        schedule_classifications: scheduleInfo.classifications
      }]
    });
    return;
  }

  const startsWith = `${query}%`;
  const contains = `%${query}%`;

  const medicines = db.prepare(`
    SELECT 
      m.id, m.brand_name, m.strength, m.dosage_form, m.pack_size,
      CASE 
        WHEN m.packaging_type = 'SIMPLE' OR LOWER(m.dosage_form) LIKE '%syrup%' OR LOWER(m.dosage_form) LIKE '%suspension%' OR LOWER(m.dosage_form) LIKE '%liquid%' OR LOWER(m.dosage_form) LIKE '%bottle%' OR LOWER(m.dosage_form) LIKE '%drop%' OR LOWER(m.dosage_form) LIKE '%injection%' THEN 1 
        ELSE COALESCE(m.tablets_per_pack, 10) 
      END as tablets_per_pack,
      m.stock_unit, m.packaging_type,
      m.barcode, m.custom_barcode,
      m.rack_location, m.is_prescription_required,
      g.name as generic_name,
      c.name as category_name
    FROM medicines m
    LEFT JOIN generics g ON m.generic_id = g.id
    LEFT JOIN categories c ON m.category_id = c.id
    WHERE m.is_active = 1 AND (
      m.barcode = ? OR
      m.custom_barcode = ? OR
      m.brand_name LIKE ? OR
      g.name LIKE ? OR
      c.name LIKE ?
    )
    ORDER BY 
      CASE 
        WHEN m.barcode = ? OR m.custom_barcode = ? THEN 0
        WHEN m.brand_name LIKE ? THEN 1
        WHEN g.name LIKE ? THEN 2
        WHEN m.brand_name LIKE ? THEN 3
        WHEN g.name LIKE ? THEN 4
        ELSE 5
      END ASC,
      m.brand_name ASC
    LIMIT 30
  `).all(query, query, contains, contains, contains, query, query, startsWith, startsWith, contains, contains) as any[];

  const results = medicines.map(med => {
    const validBatches = db.prepare(`
      SELECT
        b.id as batch_id, b.batch_number, b.expiry_date, b.sale_price, b.purchase_price,
        b.quantity, b.rack_location as batch_rack,
        CAST((julianday(b.expiry_date) - julianday('now')) AS INTEGER) as days_to_expiry
      FROM batches b
      WHERE b.medicine_id = ?
        AND b.quantity > 0
        AND b.expiry_date > date('now')
        AND b.status = 'ACTIVE'
      ORDER BY b.expiry_date ASC
    `).all(med.id) as any[];

    const totalAvailableStock = validBatches.reduce((acc, b) => acc + b.quantity, 0);
    const fefoBatch = validBatches.length > 0 ? validBatches[0] : null;
    const scheduleInfo = getVerifiedScheduleForMedicine(med.id);

    return {
      ...med,
      total_stock: totalAvailableStock,
      fefo_batch: fefoBatch,
      available_batches: validBatches,
      schedule: scheduleInfo.schedule,
      schedule_classifications: scheduleInfo.classifications
    };
  });

  res.json({ results });
});

posRouter.get('/medicines/:id/batches', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const medicineId = Number(req.params.id);

  const batches = db.prepare(`
    SELECT 
      b.*,
      CASE 
        WHEN b.expiry_date <= date('now') THEN 'EXPIRED'
        WHEN b.expiry_date <= date('now', '+90 days') THEN 'NEAR_EXPIRY'
        ELSE 'VALID'
      END as computed_status,
      CAST((julianday(b.expiry_date) - julianday('now')) AS INTEGER) as days_to_expiry
    FROM batches b
    WHERE b.medicine_id = ? AND b.quantity > 0
    ORDER BY b.expiry_date ASC
  `).all(medicineId);

  res.json({ batches });
});

function generateInvoiceNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  // MAX(suffix)+1 rather than COUNT(*): COUNT silently collides with an existing higher number
  // whenever any row in between has been removed (e.g. a reversed/cleaned-up historical sale),
  // since COUNT drops but the highest number already issued does not.
  const maxRow = db.prepare(`
    SELECT MAX(CAST(SUBSTR(invoice_number, -4) AS INTEGER)) as maxSeq FROM sales WHERE invoice_number LIKE ?
  `).get(`INV-${dateStr}-%`) as { maxSeq: number | null };

  const nextSeq = String((maxRow.maxSeq || 0) + 1).padStart(4, '0');
  return `INV-${dateStr}-${nextSeq}`;
}

/**
 * COUNT(*)-based invoice numbering can race across concurrent requests/processes touching the
 * same WAL database. Retries the whole transaction a few times (regenerating the invoice number
 * each attempt) if that specific UNIQUE constraint fires, rather than failing the sale outright.
 */
function runWithInvoiceRetry<T>(fn: () => T, maxAttempts = 5): T {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return runTransaction(fn);
    } catch (err: any) {
      const message = String(err?.message || '');
      if (attempt < maxAttempts && message.includes('UNIQUE constraint failed: sales.invoice_number')) {
        continue;
      }
      throw err;
    }
  }
  throw new Error('Failed to allocate a unique invoice number after multiple attempts');
}

// Pharmacist (re-)authenticates with their OWN credentials to approve dispensing of verified
// Schedule B/D items in the current cart, without disturbing the cashier's own session. Returns a
// short-lived, single-use approval token that /checkout must present for the same exact item set.
posRouter.post('/schedule-bd/approve', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { username, password, items } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Pharmacist username and password are required to approve' });
    return;
  }
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'No items to approve' });
    return;
  }

  const approver = db.prepare(`
    SELECT u.id, u.username, u.full_name, u.is_active, u.role_id, r.name as role_name
    FROM users u JOIN roles r ON u.role_id = r.id
    WHERE LOWER(u.username) = LOWER(?)
  `).get(String(username).trim()) as any;

  if (!approver || !approver.is_active) {
    res.status(401).json({ error: 'Invalid pharmacist credentials' });
    return;
  }

  const passwordHashRow = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(approver.id) as { password_hash: string };
  if (!bcrypt.compareSync(password, passwordHashRow.password_hash)) {
    res.status(401).json({ error: 'Invalid pharmacist credentials' });
    return;
  }

  const approverPerms = db.prepare(`
    SELECT p.code FROM permissions p JOIN role_permissions rp ON p.id = rp.permission_id WHERE rp.role_id = ?
  `).all(approver.role_id) as { code: string }[];
  const canApprove = approver.role_name === 'Admin' || approverPerms.some(p => p.code === 'approve_scheduled_drugs');

  if (!canApprove) {
    res.status(403).json({ error: `${approver.full_name} is not authorized to approve Schedule B/D dispensing` });
    return;
  }

  const token = crypto.randomBytes(24).toString('hex');
  const signature = itemsSignature(items);
  const expiresAt = new Date(Date.now() + SCHEDULE_BD_APPROVAL_TTL_MS).toISOString();
  const credentialsRef = `login:${approver.id}:${Date.now()}`;

  db.prepare(`
    INSERT INTO schedule_bd_pending_approvals (approval_token, cashier_id, approved_by_user_id, items_signature, credentials_ref, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(token, req.user!.id, approver.id, signature, credentialsRef, expiresAt);

  logAudit({
    userId: approver.id,
    action: 'APPROVE_SCHEDULE_BD_DISPENSE',
    entity: 'SCHEDULE_BD_APPROVAL',
    newValues: { approvedFor: req.user?.username, itemCount: items.length },
    ipAddress: req.ip
  });

  res.status(201).json({
    approvalToken: token,
    approvedByUserId: approver.id,
    approvedByName: approver.full_name,
    expiresAt
  });
});

posRouter.post('/checkout', authenticateToken, requirePermission('create_sales'), (req: AuthenticatedRequest, res: Response) => {
  const {
    customerId,
    items,
    subtotal,
    discount,
    tax,
    totalAmount,
    paidAmount,
    paymentMethod,
    notes,
    billingPersonId,
    customSlipName,
    percentageChargeLabel,
    percentageChargeRate,
    percentageChargeAmount,
    fixedChargeAmount,
    requestKey,
    scheduleBDApprovalToken
  } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Cart is empty. At least one item is required.' });
    return;
  }

  const idemKey = requestKey ? String(requestKey).trim() : null;
  if (idemKey) {
    const existingSale = db.prepare('SELECT * FROM sales WHERE request_key = ?').get(idemKey) as any;
    if (existingSale) {
      res.status(200).json({ message: 'Sale already processed', invoice: { saleId: existingSale.id, invoiceNumber: existingSale.invoice_number }, idempotentReplay: true });
      return;
    }
  }

  const billTotal = Number(totalAmount) || 0;
  const billPaid = Number(paidAmount) || 0;
  const billDiscount = Number(discount) || 0;
  const billTax = Number(tax) || 0;
  const billSubtotal = Number(subtotal) || billTotal;
  const billPercentLabel = percentageChargeLabel ? String(percentageChargeLabel).trim() : '';
  const billPercentRate = Number(percentageChargeRate) || 0;
  const billPercentAmount = Number(percentageChargeAmount) || 0;
  const billFixedCharge = Number(fixedChargeAmount) || 0;
  const remaining = Math.max(0, billTotal - billPaid);
  const change = Math.max(0, billPaid - billTotal);

  if (remaining > 0 && !customerId) {
    res.status(400).json({ error: 'Credit / Udhar sales require a registered customer account' });
    return;
  }

  try {
    const result = runWithInvoiceRetry(() => {
      const invoiceNumber = generateInvoiceNumber();
      const today = new Date().toISOString().split('T')[0];

      const processedItems: any[] = [];
      const scheduleItemsForSignature: Array<{ medicineId: number; batchId: number; quantity: number }> = [];
      const pendingGates: Array<{ gate: ReturnType<typeof resolveScheduleGate>; item: any }> = [];

      for (const item of items) {
        const batchId = Number(item.batchId);
        const qty = Number(item.quantity);

        if (!batchId || isNaN(qty) || qty <= 0) {
          throw new Error('Invalid item quantity or batch selection');
        }

        const gate = resolveScheduleGate({ ...item, batchId, quantity: qty });
        if (gate) {
          scheduleItemsForSignature.push({ medicineId: Number(item.medicineId), batchId, quantity: qty });
          pendingGates.push({ gate, item: { ...item, batchId, quantity: qty } });
        } else {
          pendingGates.push({ gate: null, item: { ...item, batchId, quantity: qty } });
        }
      }

      // Validate pharmacist approval ONCE for the whole cart if any verified Schedule B/D item is present.
      let approvedByUserId: number | null = null;
      let approvedByName: string | null = null;
      let approvalCredentialsRef: string | null = null;
      let approvedAt: string | null = null;
      let consumeApprovalRowId: number | null = null;

      if (scheduleItemsForSignature.length > 0) {
        const selfApprovePerms = req.user!.permissions.includes('approve_scheduled_drugs') || req.user!.roleName === 'Admin';
        if (selfApprovePerms) {
          approvedByUserId = req.user!.id;
          approvedByName = req.user!.fullName;
          approvalCredentialsRef = `self:${req.user!.id}:${Date.now()}`;
          approvedAt = new Date().toISOString();
        } else {
          if (!scheduleBDApprovalToken) {
            throw new Error('This sale contains a verified Schedule B/D medicine and requires pharmacist approval before it can be completed.');
          }
          const approval = db.prepare(`
            SELECT * FROM schedule_bd_pending_approvals
            WHERE approval_token = ? AND cashier_id = ? AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP
          `).get(String(scheduleBDApprovalToken), req.user!.id) as any;

          if (!approval) {
            throw new Error('Pharmacist approval is missing, expired, or already used. Please request approval again.');
          }
          if (approval.items_signature !== itemsSignature(scheduleItemsForSignature)) {
            throw new Error('Pharmacist approval does not match the current cart items. Please re-approve after any cart change.');
          }

          const approverUser = db.prepare('SELECT full_name FROM users WHERE id = ?').get(approval.approved_by_user_id) as any;
          approvedByUserId = approval.approved_by_user_id;
          approvedByName = approverUser?.full_name || null;
          approvalCredentialsRef = approval.credentials_ref;
          approvedAt = approval.approved_at;
          consumeApprovalRowId = approval.id;
        }
      }

      if (consumeApprovalRowId) {
        db.prepare('UPDATE schedule_bd_pending_approvals SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?').run(consumeApprovalRowId);
      }

      for (const { gate, item } of pendingGates) {
        const batchId = Number(item.batchId);
        const qty = Number(item.quantity);

        if (!gate) {
          // Ordinary (non Schedule B/D) item: unchanged single-batch behavior.
          const batch = db.prepare(`
            SELECT b.*, m.brand_name, m.strength, m.pack_size, COALESCE(m.tablets_per_pack, 10) as tablets_per_pack
            FROM batches b JOIN medicines m ON b.medicine_id = m.id WHERE b.id = ?
          `).get(batchId) as any;

          if (!batch) throw new Error(`Batch ID ${batchId} does not exist`);
          if (batch.expiry_date <= today) {
            throw new Error(`EXPIRED STOCK CANNOT BE SOLD! Batch ${batch.batch_number} of ${batch.brand_name} expired on ${batch.expiry_date}.`);
          }
          if (batch.quantity < qty) {
            throw new Error(`Insufficient stock for ${batch.brand_name} (Batch ${batch.batch_number}). Requested: ${qty}, Available: ${batch.quantity}`);
          }

          const newBatchQty = batch.quantity - qty;
          db.prepare('UPDATE batches SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newBatchQty, batchId);
          db.prepare(`
            INSERT INTO stock_movements (batch_id, movement_type, quantity_change, balance_after, reference_type, reference_id, notes, user_id)
            VALUES (?, 'SALE', ?, ?, 'POS_SALE', ?, ?, ?)
          `).run(batchId, -qty, newBatchQty, invoiceNumber, `Sale to ${customerId ? 'Customer #' + customerId : 'Walk-in Cashier Counter'}`, req.user?.id);

          const unitPrice = Number(item.unitPrice) || batch.sale_price;
          const itemDiscount = Number(item.discount) || 0;
          const lineTotal = (unitPrice * qty) - itemDiscount;

          processedItems.push({
            medicineId: batch.medicine_id, batchId: batch.id, batchNumber: batch.batch_number, expiryDate: batch.expiry_date,
            brandName: batch.brand_name, strength: batch.strength, packSize: batch.pack_size, tabletsPerPack: batch.tablets_per_pack,
            quantity: qty, unitPrice, discount: itemDiscount, lineTotal, purchasePriceSnapshot: batch.purchase_price,
            descriptionSnapshot: item.descriptionOverride ? String(item.descriptionOverride).trim() : buildDescriptionSnapshot(batch.brand_name, batch.strength),
            categorySnapshot: item.category ? String(item.category).trim() : null,
            packTypeSnapshot: item.packType ? String(item.packType).trim() : null,
            unitsPerPackSnapshot: item.unitsPerPack !== undefined ? Number(item.unitsPerPack) : null,
            packsSnapshot: item.packs !== undefined ? Number(item.packs) : null,
            looseUnitsSnapshot: item.looseUnits !== undefined ? Number(item.looseUnits) : null,
            scheduleGate: null
          });
          continue;
        }

        // Verified Schedule B/D item: split across FEFO batches so every allocation is individually traceable.
        const medicineId = Number(item.medicineId);
        const medicineRow = db.prepare(`
          SELECT m.*, g.name as generic_name, mf.name as manufacturer_name
          FROM medicines m LEFT JOIN generics g ON m.generic_id = g.id LEFT JOIN manufacturers mf ON m.manufacturer_id = mf.id
          WHERE m.id = ?
        `).get(medicineId) as any;

        const allocations = allocateFefo(medicineId, batchId, qty, today);
        const customer = gate.prescription.patient_id ? (db.prepare('SELECT * FROM customers WHERE id = ?').get(gate.prescription.patient_id) as any) : null;
        const doctor = gate.prescription.doctor_id ? (db.prepare('SELECT * FROM doctors WHERE id = ?').get(gate.prescription.doctor_id) as any) : null;

        for (const alloc of allocations) {
          const batch = alloc.batch;
          if (batch.expiry_date <= today) {
            throw new Error(`EXPIRED STOCK CANNOT BE SOLD! Batch ${batch.batch_number} of ${batch.brand_name} expired on ${batch.expiry_date}.`);
          }
          const newBatchQty = batch.quantity - alloc.quantity;
          db.prepare('UPDATE batches SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newBatchQty, alloc.batchId);
          db.prepare(`
            INSERT INTO stock_movements (batch_id, movement_type, quantity_change, balance_after, reference_type, reference_id, notes, user_id)
            VALUES (?, 'SALE', ?, ?, 'POS_SALE', ?, ?, ?)
          `).run(alloc.batchId, -alloc.quantity, newBatchQty, invoiceNumber, `Schedule ${gate.scheduleInfo.schedule} dispense to ${customerId ? 'Customer #' + customerId : 'Walk-in Cashier Counter'}`, req.user?.id);

          const unitPrice = Number(item.unitPrice) || batch.sale_price;
          const itemDiscount = allocations.length > 1 ? 0 : (Number(item.discount) || 0);
          const lineTotal = (unitPrice * alloc.quantity) - itemDiscount;

          processedItems.push({
            medicineId, batchId: alloc.batchId, batchNumber: batch.batch_number, expiryDate: batch.expiry_date,
            brandName: batch.brand_name, strength: batch.strength, packSize: batch.pack_size, tabletsPerPack: batch.tablets_per_pack,
            quantity: alloc.quantity, unitPrice, discount: itemDiscount, lineTotal, purchasePriceSnapshot: batch.purchase_price,
            descriptionSnapshot: item.descriptionOverride ? String(item.descriptionOverride).trim() : buildDescriptionSnapshot(batch.brand_name, batch.strength),
            categorySnapshot: item.category ? String(item.category).trim() : null,
            packTypeSnapshot: item.packType ? String(item.packType).trim() : null,
            unitsPerPackSnapshot: null, packsSnapshot: null, looseUnitsSnapshot: null,
            scheduleGate: {
              scheduleInfo: gate.scheduleInfo,
              prescriptionItem: gate.prescriptionItem,
              prescription: gate.prescription,
              medicineRow,
              customer,
              doctor,
              batch
            }
          });
        }

        // Keep remaining authorized quantity accurate for this prescription line across (possibly) multiple allocations.
        db.prepare('UPDATE prescription_items SET dispensed_quantity = COALESCE(dispensed_quantity, 0) + ? WHERE id = ?').run(qty, gate.prescriptionItem.id);
      }

      const insertSale = db.prepare(`
        INSERT INTO sales (
          invoice_number, customer_id, cashier_id, billing_person_id, custom_slip_name,
          subtotal, discount, tax,
          percentage_charge_label, percentage_charge_rate, percentage_charge_amount, fixed_charge_amount,
          total_amount, paid_amount, remaining_amount, change_amount, payment_method,
          status, notes, request_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?)
      `);

      const saleResult = insertSale.run(
        invoiceNumber,
        customerId || null,
        req.user?.id,
        billingPersonId ? Number(billingPersonId) : null,
        customSlipName ? String(customSlipName).trim() || null : null,
        billSubtotal,
        billDiscount,
        billTax,
        billPercentLabel,
        billPercentRate,
        billPercentAmount,
        billFixedCharge,
        billTotal,
        billPaid,
        remaining,
        change,
        paymentMethod || 'CASH',
        notes || null,
        idemKey
      );

      const saleId = saleResult.lastInsertRowid;

      const insertSaleItem = db.prepare(`
        INSERT INTO sale_items (
          sale_id, medicine_id, batch_id, quantity, unit_price,
          discount, line_total, purchase_price_snapshot,
          description_snapshot, category_snapshot, pack_type_snapshot,
          units_per_pack_snapshot, packs_snapshot, loose_units_snapshot
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const registerEntryIds: number[] = [];

      for (const it of processedItems) {
        const saleItemResult = insertSaleItem.run(
          saleId,
          it.medicineId,
          it.batchId,
          it.quantity,
          it.unitPrice,
          it.discount,
          it.lineTotal,
          it.purchasePriceSnapshot,
          it.descriptionSnapshot,
          it.categorySnapshot,
          it.packTypeSnapshot,
          it.unitsPerPackSnapshot,
          it.packsSnapshot,
          it.looseUnitsSnapshot
        );

        if (it.scheduleGate) {
          const g = it.scheduleGate;
          const classifications = g.scheduleInfo.classifications;
          const primaryClassification = classifications[0] || null;

          const entryId = createRegisterEntry({
            classificationId: primaryClassification ? primaryClassification.id : null,
            classificationVersion: primaryClassification ? primaryClassification.version : null,
            ruleVersion: SCHEDULE_BD_RULE_VERSION,
            saleId: Number(saleId),
            saleItemId: Number(saleItemResult.lastInsertRowid),
            invoiceNumber,
            prescriptionId: g.prescription.id,
            prescriptionItemId: g.prescriptionItem.id,
            originalDocumentReference: g.prescription.original_document_reference || null,
            patientSnapshot: g.customer ? {
              id: g.customer.id, name: g.customer.name, mobile: g.prescription.patient_mobile || g.customer.mobile,
              cnic: g.prescription.patient_cnic || null, address: g.prescription.patient_address || null
            } : null,
            purchaserSnapshot: g.prescription.purchaser_name ? {
              name: g.prescription.purchaser_name, relation: g.prescription.purchaser_relation || null,
              cnic: g.prescription.purchaser_cnic || null, mobile: g.prescription.purchaser_mobile || null
            } : null,
            prescriberSnapshot: g.doctor ? {
              name: g.doctor.name, registrationNumber: g.prescription.prescriber_registration_number || null,
              address: g.prescription.prescriber_address || g.doctor.clinic_name || null
            } : (g.prescription.prescriber_registration_number ? { name: null, registrationNumber: g.prescription.prescriber_registration_number, address: g.prescription.prescriber_address } : null),
            medicineSnapshot: {
              brandName: g.medicineRow.brand_name, genericName: g.medicineRow.generic_name, strength: g.medicineRow.strength,
              dosageForm: g.medicineRow.dosage_form, route: g.medicineRow.route, manufacturer: g.medicineRow.manufacturer_name,
              classifications: classifications.map((c: any) => ({ id: c.id, version: c.version, schedule: c.schedule, name: c.substanceName || c.groupDescription }))
            },
            batchId: it.batchId,
            batchNumberSnapshot: it.batchNumber,
            expiryDateSnapshot: it.expiryDate,
            dispensedQuantity: it.quantity,
            unit: g.medicineRow.stock_unit || null,
            cashierId: req.user!.id,
            cashierSnapshot: { id: req.user!.id, name: req.user!.fullName, username: req.user!.username },
            approvedByUserId,
            approvedAt,
            approvalCredentialsRef: approvalCredentialsRef,
            schedule: g.scheduleInfo.schedule
          });

          registerEntryIds.push(entryId);
        }
      }

      const cashPortion = paymentMethod === 'CASH' ? Math.min(billPaid, billTotal) : (paymentMethod === 'SPLIT' ? Number(billPaid) : 0);
      if (cashPortion > 0) {
        db.prepare(`
          INSERT INTO cashbook_entries (
            entry_type, category, amount, reference_type, reference_id, description, created_by
          ) VALUES ('IN', 'SALE', ?, 'SALE', ?, ?, ?)
        `).run(
          cashPortion,
          String(saleId),
          `Sale counter receipt #${invoiceNumber}`,
          req.user?.id
        );
      }

      if (remaining > 0 && customerId) {
        const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as any;
        if (customer) {
          const newCustomerBalance = customer.current_balance + remaining;
          db.prepare('UPDATE customers SET current_balance = ? WHERE id = ?').run(newCustomerBalance, customerId);

          db.prepare(`
            INSERT INTO customer_ledgers (
              customer_id, transaction_type, reference_id, debit, credit, balance_after, notes
            ) VALUES (?, 'SALE_CREDIT', ?, ?, 0.0, ?, ?)
          `).run(
            customerId,
            invoiceNumber,
            remaining,
            newCustomerBalance,
            `Credit sale #${invoiceNumber} (Total: Rs. ${billTotal}, Remaining: Rs. ${remaining})`
          );
        }
      }

      logAudit({
        userId: req.user?.id,
        action: 'CREATE_SALE',
        entity: 'SALES',
        entityId: Number(saleId),
        newValues: { invoiceNumber, total: billTotal, paid: billPaid, paymentMethod, itemsCount: processedItems.length },
        ipAddress: req.ip
      });

      if (registerEntryIds.length > 0) {
        logAudit({
          userId: req.user?.id,
          action: 'DISPENSE_SCHEDULE_BD',
          entity: 'SCHEDULE_BD_REGISTER',
          entityId: Number(saleId),
          newValues: { invoiceNumber, registerEntryIds, approvedByUserId, approvedByName },
          ipAddress: req.ip
        });
      }

      let billingPersonName: string | null = null;
      if (billingPersonId) {
        const bp = db.prepare('SELECT name FROM billing_persons WHERE id = ?').get(Number(billingPersonId)) as any;
        if (bp) billingPersonName = bp.name;
      }

      return {
        saleId,
        invoiceNumber,
        cashierName: billingPersonName || req.user?.fullName || req.user?.username || 'Ali Raza',
        billingPersonName,
        customSlipName: customSlipName ? String(customSlipName).trim() : null,
        subtotal: billSubtotal,
        discount: billDiscount,
        tax: billTax,
        percentageChargeLabel: billPercentLabel,
        percentageChargeRate: billPercentRate,
        percentageChargeAmount: billPercentAmount,
        fixedChargeAmount: billFixedCharge,
        totalAmount: billTotal,
        paidAmount: billPaid,
        changeAmount: change,
        remainingAmount: remaining,
        items: processedItems.map(it => {
          const { scheduleGate, ...rest } = it;
          return scheduleGate ? { ...rest, isScheduledBD: true, schedule: scheduleGate.scheduleInfo.schedule } : rest;
        }),
        registerEntryIds,
        createdAt: new Date().toISOString()
      };
    });

    triggerAutoSync(`sale ${result.invoiceNumber}`);
    res.status(201).json({ message: 'Sale completed successfully', invoice: result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

posRouter.get('/held', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const held = db.prepare(`
    SELECT h.*, u.full_name as cashier_name
    FROM held_bills h
    JOIN users u ON h.cashier_id = u.id
    ORDER BY h.created_at DESC
  `).all();

  res.json({
    heldBills: held.map((h: any) => ({
      ...h,
      cart: safeJsonParse(h.cart_json, [])
    }))
  });
});

posRouter.post('/hold', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { customerName, cart } = req.body;
  if (!cart || !Array.isArray(cart) || cart.length === 0) {
    res.status(400).json({ error: 'Cart is empty' });
    return;
  }

  const billId = 'HOLD-' + Date.now().toString().slice(-6);

  db.prepare(`
    INSERT INTO held_bills (bill_identifier, cashier_id, customer_name, cart_json)
    VALUES (?, ?, ?, ?)
  `).run(billId, req.user?.id, customerName || 'Walk-in Patient', JSON.stringify(cart));

  res.status(201).json({ message: 'Bill held successfully', billIdentifier: billId });
});

posRouter.delete('/held/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM held_bills WHERE id = ?').run(id);
  res.json({ message: 'Held bill removed' });
});

posRouter.get('/invoices-recent', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const q = ((req.query.q as string) || '').trim();

    let query = `
      SELECT 
        s.id,
        s.invoice_number,
        s.customer_id,
        s.cashier_id,
        s.billing_person_id,
        s.custom_slip_name,
        s.subtotal,
        s.discount,
        s.tax,
        s.total_amount,
        s.paid_amount,
        s.remaining_amount,
        s.change_amount,
        s.payment_method,
        s.status,
        s.notes,
        s.created_at,
        c.name as customer_name,
        c.mobile as customer_phone,
        u.full_name as cashier_name,
        bp.name as billing_person_name,
        (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) as item_count,
        (SELECT SUM(quantity) FROM sale_items si WHERE si.sale_id = s.id) as total_units
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.cashier_id = u.id
      LEFT JOIN billing_persons bp ON s.billing_person_id = bp.id
    `;

    const params: any[] = [];
    if (q) {
      query += ` WHERE s.invoice_number LIKE ? OR LOWER(s.invoice_number) = LOWER(?) OR c.name LIKE ? OR c.mobile LIKE ? OR s.custom_slip_name LIKE ?`;
      const cleanQ = q.replace(/^#/, '');
      const searchVal = `%${cleanQ}%`;
      params.push(searchVal, cleanQ, searchVal, searchVal, searchVal);
    }

    query += ` ORDER BY s.created_at DESC, s.id DESC LIMIT ?`;
    params.push(limit);

    const sales = db.prepare(query).all(...params);
    res.json({ sales });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch invoices', details: err.message });
  }
});

posRouter.get('/invoices/:invoiceNumber', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const rawNum = String(req.params.invoiceNumber || '').trim();
  const cleanNum = rawNum.replace(/^#/, '').trim();

  let sale = db.prepare(`
    SELECT 
      s.*,
      c.name as customer_name, c.mobile as customer_phone, c.current_balance as customer_balance,
      u.full_name as cashier_name,
      bp.name as billing_person_name
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    LEFT JOIN users u ON s.cashier_id = u.id
    LEFT JOIN billing_persons bp ON s.billing_person_id = bp.id
    WHERE LOWER(s.invoice_number) = LOWER(?) OR s.invoice_number = ?
  `).get(cleanNum, cleanNum) as any;

  if (!sale) {
    // Try partial match if exact scan has prefix/suffix
    sale = db.prepare(`
      SELECT 
        s.*,
        c.name as customer_name, c.mobile as customer_phone, c.current_balance as customer_balance,
        u.full_name as cashier_name,
        bp.name as billing_person_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.cashier_id = u.id
      LEFT JOIN billing_persons bp ON s.billing_person_id = bp.id
      WHERE s.invoice_number LIKE ?
      ORDER BY s.id DESC
      LIMIT 1
    `).get(`%${cleanNum}%`) as any;
  }

  if (!sale) {
    res.status(404).json({ error: `Invoice '${cleanNum}' not found in system` });
    return;
  }

  const items = db.prepare(`
    SELECT 
      si.*,
      m.brand_name, m.strength, m.dosage_form, m.pack_size,
      COALESCE(m.tablets_per_pack, 10) as tablets_per_pack,
      m.stock_unit,
      b.batch_number, b.expiry_date, b.rack_location as batch_rack
    FROM sale_items si
    JOIN medicines m ON si.medicine_id = m.id
    JOIN batches b ON si.batch_id = b.id
    WHERE si.sale_id = ?
    ORDER BY si.id ASC
  `).all((sale as any).id);

  // Also fetch customer ledger records related to this invoice if available
  const ledgerEntries = db.prepare(`
    SELECT * FROM customer_ledgers
    WHERE reference_id = ? OR reference_id = ?
    ORDER BY id ASC
  `).all(sale.invoice_number, `INV#${sale.invoice_number}`);

  res.json({ sale, items, ledgerEntries });
});

posRouter.post('/sync-offline', authenticateToken, requirePermission('create_sales'), (req: AuthenticatedRequest, res: Response) => {
  const { sales } = req.body;

  if (!sales || !Array.isArray(sales) || sales.length === 0) {
    res.status(400).json({ error: 'No offline sales provided for synchronization.' });
    return;
  }

  const syncedInvoices: any[] = [];
  const failedInvoices: any[] = [];

  for (const rawSale of sales) {
    try {
      if (rawSale.offlineId) {
        const existing = db.prepare('SELECT id, invoice_number FROM sales WHERE offline_id = ?').get(String(rawSale.offlineId)) as any;
        if (existing) {
          syncedInvoices.push({ offlineId: rawSale.offlineId, serverSaleId: existing.id, invoiceNumber: existing.invoice_number, status: 'SYNCED', idempotentReplay: true });
          continue;
        }
      }

      // Schedule B/D dispensing needs live server-side classification/prescription checks that an
      // offline client cannot safely perform - block rather than silently skip the gate.
      const blockedItem = (rawSale.items || []).find((it: any) => getVerifiedScheduleForMedicine(Number(it.medicineId)).schedule !== null);
      if (blockedItem) {
        throw new Error(`This sale contains a verified Schedule B/D medicine (medicine ID ${blockedItem.medicineId}) which requires an online connection for prescription and pharmacist approval checks. Please complete this sale while online.`);
      }

      const syncResult = runWithInvoiceRetry(() => {
        const {
          offlineId,
          customerId,
          items,
          subtotal,
          discount,
          tax,
          totalAmount,
          paidAmount,
          paymentMethod,
          notes,
          timestamp,
          billingPersonId,
          customSlipName,
          percentageChargeLabel,
          percentageChargeRate,
          percentageChargeAmount,
          fixedChargeAmount
        } = rawSale;

        const billTotal = Number(totalAmount) || 0;
        const billPaid = Number(paidAmount) || 0;
        const billDiscount = Number(discount) || 0;
        const billTax = Number(tax) || 0;
        const billSubtotal = Number(subtotal) || billTotal;
        const billPercentLabel = percentageChargeLabel ? String(percentageChargeLabel).trim() : '';
        const billPercentRate = Number(percentageChargeRate) || 0;
        const billPercentAmount = Number(percentageChargeAmount) || 0;
        const billFixedCharge = Number(fixedChargeAmount) || 0;
        const remaining = Math.max(0, billTotal - billPaid);
        const change = Math.max(0, billPaid - billTotal);

        const invoiceNumber = generateInvoiceNumber();
        const processedItems: any[] = [];

        for (const item of items) {
          const batchId = Number(item.batchId);
          const qty = Number(item.quantity);

          if (!batchId || isNaN(qty) || qty <= 0) {
            throw new Error(`Invalid item quantity or batch for offline item`);
          }

          const batch = db.prepare(`
            SELECT b.*, m.brand_name, m.strength, m.pack_size, COALESCE(m.tablets_per_pack, 10) as tablets_per_pack
            FROM batches b
            JOIN medicines m ON b.medicine_id = m.id
            WHERE b.id = ?
          `).get(batchId) as any;

          if (!batch) {
            throw new Error(`Batch ID ${batchId} not found on server`);
          }

          const newBatchQty = Math.max(0, batch.quantity - qty);
          db.prepare('UPDATE batches SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newBatchQty, batchId);

          db.prepare(`
            INSERT INTO stock_movements (
              batch_id, movement_type, quantity_change, balance_after,
              reference_type, reference_id, notes, user_id
            ) VALUES (?, 'SALE', ?, ?, 'POS_OFFLINE_SYNC', ?, ?, ?)
          `).run(
            batchId,
            -qty,
            newBatchQty,
            invoiceNumber,
            `Offline Sync Sale (Offline ID: ${offlineId || 'N/A'})`,
            req.user?.id
          );

          const unitPrice = Number(item.unitPrice) || batch.sale_price;
          const itemDiscount = Number(item.discount) || 0;
          const lineTotal = (unitPrice * qty) - itemDiscount;

          processedItems.push({
            medicineId: batch.medicine_id,
            batchId: batch.id,
            brandName: batch.brand_name,
            strength: batch.strength,
            packSize: batch.pack_size,
            tabletsPerPack: batch.tablets_per_pack,
            quantity: qty,
            unitPrice,
            discount: itemDiscount,
            lineTotal,
            purchasePriceSnapshot: batch.purchase_price,
            descriptionSnapshot: item.descriptionOverride ? String(item.descriptionOverride).trim() : buildDescriptionSnapshot(batch.brand_name, batch.strength),
            categorySnapshot: item.category ? String(item.category).trim() : null,
            packTypeSnapshot: item.packType ? String(item.packType).trim() : null,
            unitsPerPackSnapshot: item.unitsPerPack !== undefined ? Number(item.unitsPerPack) : null,
            packsSnapshot: item.packs !== undefined ? Number(item.packs) : null,
            looseUnitsSnapshot: item.looseUnits !== undefined ? Number(item.looseUnits) : null
          });
        }

        const saleResult = db.prepare(`
          INSERT INTO sales (
            invoice_number, customer_id, cashier_id, billing_person_id, custom_slip_name,
            subtotal, discount, tax,
            percentage_charge_label, percentage_charge_rate, percentage_charge_amount, fixed_charge_amount,
            total_amount, paid_amount, remaining_amount, change_amount, payment_method,
            status, notes, created_at, offline_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?)
        `).run(
          invoiceNumber,
          customerId || null,
          req.user?.id,
          billingPersonId ? Number(billingPersonId) : null,
          customSlipName ? String(customSlipName).trim() || null : null,
          billSubtotal,
          billDiscount,
          billTax,
          billPercentLabel,
          billPercentRate,
          billPercentAmount,
          billFixedCharge,
          billTotal,
          billPaid,
          remaining,
          change,
          paymentMethod || 'CASH',
          notes ? `[OFFLINE SYNC] ${notes}` : '[OFFLINE SYNC]',
          timestamp || new Date().toISOString(),
          offlineId || null
        );

        const saleId = saleResult.lastInsertRowid;

        const insertSaleItem = db.prepare(`
          INSERT INTO sale_items (
            sale_id, medicine_id, batch_id, quantity, unit_price,
            discount, line_total, purchase_price_snapshot,
            description_snapshot, category_snapshot, pack_type_snapshot,
            units_per_pack_snapshot, packs_snapshot, loose_units_snapshot
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const it of processedItems) {
          insertSaleItem.run(
            saleId,
            it.medicineId,
            it.batchId,
            it.quantity,
            it.unitPrice,
            it.discount,
            it.lineTotal,
            it.purchasePriceSnapshot,
            it.descriptionSnapshot,
            it.categorySnapshot,
            it.packTypeSnapshot,
            it.unitsPerPackSnapshot,
            it.packsSnapshot,
            it.looseUnitsSnapshot
          );
        }

        const cashPortion = paymentMethod === 'CASH' ? Math.min(billPaid, billTotal) : (paymentMethod === 'SPLIT' ? Number(billPaid) : 0);
        if (cashPortion > 0) {
          db.prepare(`
            INSERT INTO cashbook_entries (
              entry_type, category, amount, reference_type, reference_id, description, created_by, created_at
            ) VALUES ('IN', 'SALE', ?, 'SALE', ?, ?, ?, ?)
          `).run(
            cashPortion,
            String(saleId),
            `Offline Sync Sale receipt #${invoiceNumber}`,
            req.user?.id,
            timestamp || new Date().toISOString()
          );
        }

        if (remaining > 0 && customerId) {
          const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as any;
          if (customer) {
            const newCustomerBalance = customer.current_balance + remaining;
            db.prepare('UPDATE customers SET current_balance = ? WHERE id = ?').run(newCustomerBalance, customerId);
            db.prepare(`
              INSERT INTO customer_ledgers (
                customer_id, transaction_type, reference_id, debit, credit, balance_after, notes, created_at
              ) VALUES (?, 'SALE_CREDIT', ?, ?, 0.0, ?, ?, ?)
            `).run(
              customerId,
              invoiceNumber,
              remaining,
              newCustomerBalance,
              `Offline Sync Credit sale #${invoiceNumber}`,
              timestamp || new Date().toISOString()
            );
          }
        }

        logAudit({
          userId: req.user?.id,
          action: 'OFFLINE_SALE_SYNCED',
          entity: 'SALES',
          entityId: Number(saleId),
          newValues: { offlineId, invoiceNumber, total: billTotal },
          ipAddress: req.ip
        });

        return {
          offlineId,
          serverSaleId: saleId,
          invoiceNumber,
          status: 'SYNCED'
        };
      });

      syncedInvoices.push(syncResult);
    } catch (err: any) {
      failedInvoices.push({
        offlineId: rawSale.offlineId,
        error: err.message
      });
    }
  }

  res.status(200).json({
    message: `Synchronized ${syncedInvoices.length} of ${sales.length} offline transactions.`,
    syncedCount: syncedInvoices.length,
    failedCount: failedInvoices.length,
    synced: syncedInvoices,
    failed: failedInvoices
  });
});
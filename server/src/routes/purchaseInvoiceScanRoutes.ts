import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { db, runTransaction } from '../db/index.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';
import { triggerAutoSync } from '../services/gitSyncService.js';
import { scanInvoiceFiles, ParsedInvoiceLineItem } from '../services/invoiceScanService.js';

export const purchaseInvoiceScanRouter = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCANS_ROOT = path.resolve(__dirname, '../../data/attachments/purchase-scans');
if (!fs.existsSync(SCANS_ROOT)) fs.mkdirSync(SCANS_ROOT, { recursive: true });

const ALLOWED_SCAN_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 30 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_SCAN_MIME.has(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, WEBP or PDF invoice scans are allowed'));
      return;
    }
    cb(null, true);
  }
});

function scanDir(scanId: number) {
  const dir = path.join(SCANS_ROOT, String(scanId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function savePageFile(scanId: number, pageNumber: number, mimeType: string, buffer: Buffer) {
  const ext = mimeType === 'application/pdf' ? '.pdf' : mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg';
  const filename = `page-${pageNumber}-${Date.now()}${ext}`;
  fs.writeFileSync(path.join(scanDir(scanId), filename), buffer);
  return path.posix.join(String(scanId), filename);
}

// A line is only safe to auto-insert as a draft item when it names a product; anything else
// (totals rows, headers) never reaches purchase_invoice_scan_items.
function insertScanItems(scanId: number, items: ParsedInvoiceLineItem[]) {
  const stmt = db.prepare(`
    INSERT INTO purchase_invoice_scan_items (
      scan_id, line_number, product_name_raw, strength_raw, dosage_form_raw,
      batch_number, expiry_date, mfg_date, boxes_received, supplier_purchase_rate,
      rate_basis, line_discount_raw, line_tax_raw, line_total_raw, bonus_quantity_raw,
      flagged_unclear, flag_reason, handwritten_flag
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const item of items) {
    if (!item.productNameRaw) continue;
    stmt.run(
      scanId,
      item.lineNumber,
      item.productNameRaw,
      item.strengthRaw,
      item.dosageFormRaw,
      item.batchNumber,
      item.expiryDate,
      item.mfgDate,
      item.boxesReceived,
      item.supplierPurchaseRate,
      item.rateBasis,
      item.lineDiscountRaw,
      item.lineTaxRaw,
      item.lineTotalRaw,
      item.bonusQuantityRaw,
      item.flaggedUnclear ? 1 : 0,
      item.flagReason,
      item.handwrittenFlag ? 1 : 0
    );
  }
}

// Create a new invoice-scan draft from one or more uploaded pages/photos. Scanning only ever
// creates a draft row - it never touches stock, batches, or the supplier ledger.
purchaseInvoiceScanRouter.post('/', authenticateToken, requirePermission('create_purchases'), upload.array('files', 30), async (req: AuthenticatedRequest, res: Response) => {
  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length === 0) {
    res.status(400).json({ error: 'At least one page/photo is required' });
    return;
  }

  try {
    const result = db.prepare(`INSERT INTO purchase_invoice_scans (status, created_by) VALUES ('DRAFT', ?)`).run(req.user?.id);
    const scanId = Number(result.lastInsertRowid);

    const insertPage = db.prepare(`
      INSERT INTO purchase_invoice_scan_pages (scan_id, page_number, file_path, mime_type) VALUES (?, ?, ?, ?)
    `);
    files.forEach((file, idx) => {
      const relativePath = savePageFile(scanId, idx + 1, file.mimetype, file.buffer);
      insertPage.run(scanId, idx + 1, relativePath, file.mimetype);
    });

    const { rawTextPerPage, parsed } = await scanInvoiceFiles(files.map(f => ({ buffer: f.buffer, mimeType: f.mimetype })));

    const updatePages = db.prepare(`UPDATE purchase_invoice_scan_pages SET ocr_text = ? WHERE scan_id = ? AND page_number = ?`);
    rawTextPerPage.forEach((text: string, idx: number) => updatePages.run(text, scanId, idx + 1));

    const existingInvoice = parsed.invoiceNumberRaw
      ? db.prepare(`
          SELECT id FROM purchase_invoice_scans
          WHERE id != ? AND invoice_number_raw = ? AND status != 'VOID' COLLATE NOCASE
        `).get(scanId, parsed.invoiceNumberRaw) as any
      : null;

    db.prepare(`
      UPDATE purchase_invoice_scans SET
        supplier_name_raw = ?, invoice_number_raw = ?, invoice_date_raw = ?, document_type = ?,
        calculated_total = ?, printed_total_raw = ?, total_mismatch_flag = ?, raw_ocr_text = ?,
        duplicate_of_scan_id = ?
      WHERE id = ?
    `).run(
      parsed.supplierNameRaw,
      parsed.invoiceNumberRaw,
      parsed.invoiceDateRaw,
      parsed.documentType,
      parsed.calculatedTotal,
      parsed.printedTotalRaw,
      (parsed.printedTotalRaw != null && parsed.calculatedTotal != null && Math.abs(parsed.printedTotalRaw - parsed.calculatedTotal) > 0.5) ? 1 : 0,
      parsed.rawText,
      existingInvoice?.id ?? null,
      scanId
    );

    insertScanItems(scanId, parsed.items);

    if (parsed.warrantyText) {
      db.prepare(`
        INSERT INTO purchase_invoice_warranty_attachments (scan_id, extracted_text) VALUES (?, ?)
      `).run(scanId, parsed.warrantyText);
    }

    logAudit({ userId: req.user?.id, action: 'CREATE_PURCHASE_SCAN', entity: 'PURCHASE_INVOICE_SCANS', entityId: scanId, newValues: { pageCount: files.length }, ipAddress: req.ip });

    res.status(201).json({ message: 'Invoice scanned. Review and confirm before committing.', scanId });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to process invoice scan' });
  }
});

// Append more pages to an existing (not yet committed) draft - supports pages uploaded out of order.
purchaseInvoiceScanRouter.post('/:id/pages', authenticateToken, requirePermission('create_purchases'), upload.array('files', 30), async (req: AuthenticatedRequest, res: Response) => {
  const scanId = Number(req.params.id);
  const scan = db.prepare('SELECT * FROM purchase_invoice_scans WHERE id = ?').get(scanId) as any;
  if (!scan) { res.status(404).json({ error: 'Scan not found' }); return; }
  if (scan.status === 'COMMITTED') { res.status(400).json({ error: 'Cannot add pages to a committed invoice' }); return; }

  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length === 0) { res.status(400).json({ error: 'At least one page/photo is required' }); return; }

  try {
    const { maxPage } = db.prepare('SELECT COALESCE(MAX(page_number), 0) as maxPage FROM purchase_invoice_scan_pages WHERE scan_id = ?').get(scanId) as any;
    const insertPage = db.prepare(`
      INSERT INTO purchase_invoice_scan_pages (scan_id, page_number, file_path, mime_type) VALUES (?, ?, ?, ?)
    `);
    const newPageNumbers: number[] = [];
    files.forEach((file, idx) => {
      const pageNumber = maxPage + idx + 1;
      const relativePath = savePageFile(scanId, pageNumber, file.mimetype, file.buffer);
      insertPage.run(scanId, pageNumber, relativePath, file.mimetype);
      newPageNumbers.push(pageNumber);
    });

    const { rawTextPerPage, parsed } = await scanInvoiceFiles(files.map(f => ({ buffer: f.buffer, mimeType: f.mimetype })));
    const updatePages = db.prepare(`UPDATE purchase_invoice_scan_pages SET ocr_text = ? WHERE scan_id = ? AND page_number = ?`);
    rawTextPerPage.forEach((text: string, idx: number) => updatePages.run(text, scanId, newPageNumbers[idx]));

    const { maxLine } = db.prepare('SELECT COALESCE(MAX(line_number), 0) as maxLine FROM purchase_invoice_scan_items WHERE scan_id = ?').get(scanId) as any;
    insertScanItems(scanId, parsed.items.map((item: ParsedInvoiceLineItem) => ({ ...item, lineNumber: maxLine + item.lineNumber })));

    if (parsed.warrantyText) {
      db.prepare(`INSERT INTO purchase_invoice_warranty_attachments (scan_id, extracted_text) VALUES (?, ?)`).run(scanId, parsed.warrantyText);
    }

    db.prepare(`UPDATE purchase_invoice_scans SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(scanId);

    res.status(201).json({ message: 'Pages added to draft' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to process additional pages' });
  }
});

// Searchable archive of scanned invoices, draft or committed.
purchaseInvoiceScanRouter.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { invoiceNumber, supplier, dateFrom, dateTo, product, batchNumber, schedule, status } = req.query as Record<string, string | undefined>;

  let query = `
    SELECT s.*, sup.name as supplier_name,
      (SELECT COUNT(*) FROM purchase_invoice_scan_pages p WHERE p.scan_id = s.id) as page_count,
      (SELECT COUNT(*) FROM purchase_invoice_scan_items i WHERE i.scan_id = s.id) as item_count
    FROM purchase_invoice_scans s
    LEFT JOIN suppliers sup ON s.supplier_id = sup.id
    WHERE s.status != 'VOID'
  `;
  const params: any[] = [];

  if (invoiceNumber) { query += ' AND s.invoice_number_raw LIKE ?'; params.push(`%${invoiceNumber}%`); }
  if (supplier) { query += ' AND (sup.name LIKE ? OR s.supplier_name_raw LIKE ?)'; params.push(`%${supplier}%`, `%${supplier}%`); }
  if (dateFrom) { query += ' AND s.created_at >= ?'; params.push(dateFrom); }
  if (dateTo) { query += ' AND s.created_at <= ?'; params.push(dateTo + ' 23:59:59'); }
  if (status === 'DRAFT' || status === 'COMMITTED') { query += ' AND s.status = ?'; params.push(status); }
  if (schedule === 'B') { query += ' AND s.is_schedule_b = 1'; }
  if (schedule === 'D') { query += ' AND s.is_schedule_d = 1'; }
  if (product) {
    query += ' AND EXISTS (SELECT 1 FROM purchase_invoice_scan_items i WHERE i.scan_id = s.id AND i.product_name_raw LIKE ?)';
    params.push(`%${product}%`);
  }
  if (batchNumber) {
    query += ' AND EXISTS (SELECT 1 FROM purchase_invoice_scan_items i WHERE i.scan_id = s.id AND i.batch_number LIKE ?)';
    params.push(`%${batchNumber}%`);
  }

  query += ' ORDER BY s.created_at DESC';

  const scans = db.prepare(query).all(...params);
  res.json({ scans });
});

// Full detail for one scan: header, pages, line items, and warranty attachments.
purchaseInvoiceScanRouter.get('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const scanId = Number(req.params.id);
  const scan = db.prepare(`
    SELECT s.*, sup.name as supplier_name
    FROM purchase_invoice_scans s LEFT JOIN suppliers sup ON s.supplier_id = sup.id
    WHERE s.id = ?
  `).get(scanId);
  if (!scan) { res.status(404).json({ error: 'Scan not found' }); return; }

  const pages = db.prepare('SELECT id, page_number, mime_type, is_warranty_page FROM purchase_invoice_scan_pages WHERE scan_id = ? ORDER BY page_number').all(scanId);
  const items = db.prepare(`
    SELECT i.*, m.brand_name as matched_brand_name, m.strength as matched_strength, m.dosage_form as matched_dosage_form
    FROM purchase_invoice_scan_items i LEFT JOIN medicines m ON i.medicine_id = m.id
    WHERE i.scan_id = ? ORDER BY i.line_number
  `).all(scanId);
  const warranty = db.prepare('SELECT id, scan_item_id, page_id, extracted_text, is_unreadable FROM purchase_invoice_warranty_attachments WHERE scan_id = ?').all(scanId);

  res.json({ scan, pages, items, warranty });
});

// Update scan-level fields: supplier match, document-type confirmation, goods-received confirmation,
// Schedule B/D invoice-level tags, notes.
purchaseInvoiceScanRouter.put('/:id', authenticateToken, requirePermission('create_purchases'), (req: AuthenticatedRequest, res: Response) => {
  const scanId = Number(req.params.id);
  const scan = db.prepare('SELECT * FROM purchase_invoice_scans WHERE id = ?').get(scanId) as any;
  if (!scan) { res.status(404).json({ error: 'Scan not found' }); return; }
  if (scan.status === 'COMMITTED') { res.status(400).json({ error: 'Cannot edit a committed invoice' }); return; }

  const {
    supplierId, invoiceNumberRaw, invoiceDateRaw, documentType, goodsReceivedConfirmed,
    isScheduleB, isScheduleD, notes
  } = req.body;

  db.prepare(`
    UPDATE purchase_invoice_scans SET
      supplier_id = COALESCE(?, supplier_id),
      invoice_number_raw = COALESCE(?, invoice_number_raw),
      invoice_date_raw = COALESCE(?, invoice_date_raw),
      document_type = COALESCE(?, document_type),
      goods_received_confirmed = COALESCE(?, goods_received_confirmed),
      is_schedule_b = COALESCE(?, is_schedule_b),
      is_schedule_d = COALESCE(?, is_schedule_d),
      notes = COALESCE(?, notes),
      status = CASE WHEN status = 'DRAFT' THEN 'REVIEWED' ELSE status END,
      reviewed_by = COALESCE(reviewed_by, ?),
      reviewed_at = COALESCE(reviewed_at, CURRENT_TIMESTAMP),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    supplierId ?? null,
    invoiceNumberRaw ?? null,
    invoiceDateRaw ?? null,
    documentType ?? null,
    goodsReceivedConfirmed === undefined ? null : (goodsReceivedConfirmed ? 1 : 0),
    isScheduleB === undefined ? null : (isScheduleB ? 1 : 0),
    isScheduleD === undefined ? null : (isScheduleD ? 1 : 0),
    notes ?? null,
    req.user?.id,
    scanId
  );

  res.json({ message: 'Scan updated' });
});

// Update one line item: product match confirmation, manual packaging fields (printed MRP, strips
// per box, units per strip, confirmed purchase cost and its basis), bonus confirmation, batch/expiry
// correction, and item-level Schedule B/D classification.
purchaseInvoiceScanRouter.put('/:id/items/:itemId', authenticateToken, requirePermission('create_purchases'), (req: AuthenticatedRequest, res: Response) => {
  const scanId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const scan = db.prepare('SELECT * FROM purchase_invoice_scans WHERE id = ?').get(scanId) as any;
  if (!scan) { res.status(404).json({ error: 'Scan not found' }); return; }
  if (scan.status === 'COMMITTED') { res.status(400).json({ error: 'Cannot edit items on a committed invoice' }); return; }
  const existing = db.prepare('SELECT * FROM purchase_invoice_scan_items WHERE id = ? AND scan_id = ?').get(itemId, scanId) as any;
  if (!existing) { res.status(404).json({ error: 'Line item not found' }); return; }

  const b = req.body;
  // A field present in the body (even as null/"") is an explicit edit, incl. clearing a wrong
  // value; a field simply absent from the body leaves the stored value untouched.
  const pick = (key: string, column: string, convert: (v: any) => any = v => v) =>
    key in b ? convert(b[key]) : existing[column];
  const toNum = (v: any) => (v === null || v === '' || v === undefined) ? null : Number(v);
  const toInt = (v: any) => (v === null || v === '' || v === undefined) ? null : Math.trunc(Number(v));
  const toBoolOrKeep = (key: string, column: string) => key in b ? (b[key] ? 1 : 0) : existing[column];

  const values = {
    medicine_id: pick('medicineId', 'medicine_id'),
    match_status: pick('matchStatus', 'match_status'),
    product_name_raw: pick('productNameRaw', 'product_name_raw'),
    strength_raw: pick('strengthRaw', 'strength_raw'),
    dosage_form_raw: pick('dosageFormRaw', 'dosage_form_raw'),
    packaging_type: pick('packagingType', 'packaging_type'),
    batch_number: pick('batchNumber', 'batch_number'),
    expiry_date: pick('expiryDate', 'expiry_date'),
    mfg_date: pick('mfgDate', 'mfg_date'),
    boxes_received: pick('boxesReceived', 'boxes_received', toNum),
    supplier_purchase_rate: pick('supplierPurchaseRate', 'supplier_purchase_rate', toNum),
    rate_basis: pick('rateBasis', 'rate_basis'),
    rate_basis_confirmed: toBoolOrKeep('rateBasisConfirmed', 'rate_basis_confirmed'),
    printed_mrp_per_box: pick('printedMrpPerBox', 'printed_mrp_per_box', toNum),
    strips_per_box: pick('stripsPerBox', 'strips_per_box', toInt),
    units_per_strip: pick('unitsPerStrip', 'units_per_strip', toInt),
    confirmed_purchase_cost_per_box: pick('confirmedPurchaseCostPerBox', 'confirmed_purchase_cost_per_box', toNum),
    confirmed_sale_price_per_unit: pick('confirmedSalePricePerUnit', 'confirmed_sale_price_per_unit', toNum),
    bonus_quantity_raw: pick('bonusQuantityRaw', 'bonus_quantity_raw', toNum),
    bonus_quantity_basis: pick('bonusQuantityBasis', 'bonus_quantity_basis'),
    bonus_confirmed: toBoolOrKeep('bonusConfirmed', 'bonus_confirmed'),
    is_schedule_b: toBoolOrKeep('isScheduleB', 'is_schedule_b'),
    is_schedule_d: toBoolOrKeep('isScheduleD', 'is_schedule_d'),
    classification_confirmed: toBoolOrKeep('classificationConfirmed', 'classification_confirmed'),
    flagged_unclear: toBoolOrKeep('flaggedUnclear', 'flagged_unclear'),
    status: pick('status', 'status')
  };

  db.prepare(`
    UPDATE purchase_invoice_scan_items SET
      medicine_id = ?, match_status = ?, product_name_raw = ?, strength_raw = ?, dosage_form_raw = ?,
      packaging_type = ?, batch_number = ?, expiry_date = ?, mfg_date = ?, boxes_received = ?,
      supplier_purchase_rate = ?, rate_basis = ?, rate_basis_confirmed = ?, printed_mrp_per_box = ?,
      strips_per_box = ?, units_per_strip = ?, confirmed_purchase_cost_per_box = ?,
      confirmed_sale_price_per_unit = ?, bonus_quantity_raw = ?, bonus_quantity_basis = ?,
      bonus_confirmed = ?, is_schedule_b = ?, is_schedule_d = ?, classification_confirmed = ?,
      flagged_unclear = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    values.medicine_id, values.match_status, values.product_name_raw, values.strength_raw, values.dosage_form_raw,
    values.packaging_type, values.batch_number, values.expiry_date, values.mfg_date, values.boxes_received,
    values.supplier_purchase_rate, values.rate_basis, values.rate_basis_confirmed, values.printed_mrp_per_box,
    values.strips_per_box, values.units_per_strip, values.confirmed_purchase_cost_per_box,
    values.confirmed_sale_price_per_unit, values.bonus_quantity_raw, values.bonus_quantity_basis,
    values.bonus_confirmed, values.is_schedule_b, values.is_schedule_d, values.classification_confirmed,
    values.flagged_unclear, values.status, itemId
  );

  res.json({ message: 'Line item updated' });
});

// Serve a stored page file (image/PDF) for side-by-side review against the editable form.
purchaseInvoiceScanRouter.get('/:id/pages/:pageId/file', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const page = db.prepare('SELECT * FROM purchase_invoice_scan_pages WHERE id = ? AND scan_id = ?').get(Number(req.params.pageId), Number(req.params.id)) as any;
  if (!page) { res.status(404).json({ error: 'Page not found' }); return; }

  const fullPath = path.join(SCANS_ROOT, page.file_path);
  if (!fullPath.startsWith(SCANS_ROOT) || !fs.existsSync(fullPath)) { res.status(404).json({ error: 'Page file missing from storage' }); return; }

  res.setHeader('Content-Type', page.mime_type || 'application/octet-stream');
  fs.createReadStream(fullPath).pipe(res);
});

// Attach a warranty crop/region (manual upload) or link an existing page as the warranty section.
purchaseInvoiceScanRouter.post('/:id/warranty', authenticateToken, requirePermission('create_purchases'), upload.single('file'), (req: AuthenticatedRequest, res: Response) => {
  const scanId = Number(req.params.id);
  const scan = db.prepare('SELECT * FROM purchase_invoice_scans WHERE id = ?').get(scanId) as any;
  if (!scan) { res.status(404).json({ error: 'Scan not found' }); return; }

  const { pageId, extractedText, scanItemId, isUnreadable } = req.body;
  let filePath: string | null = null;
  if (req.file) {
    const ext = req.file.mimetype === 'image/png' ? '.png' : req.file.mimetype === 'image/webp' ? '.webp' : '.jpg';
    const filename = `warranty-${Date.now()}${ext}`;
    fs.writeFileSync(path.join(scanDir(scanId), filename), req.file.buffer);
    filePath = path.posix.join(String(scanId), filename);
  }

  const result = db.prepare(`
    INSERT INTO purchase_invoice_warranty_attachments (scan_id, scan_item_id, file_path, page_id, extracted_text, is_unreadable)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(scanId, scanItemId ? Number(scanItemId) : null, filePath, pageId ? Number(pageId) : null, extractedText || null, isUnreadable ? 1 : 0);

  if (pageId) {
    db.prepare('UPDATE purchase_invoice_scan_pages SET is_warranty_page = 1 WHERE id = ? AND scan_id = ?').run(Number(pageId), scanId);
  }

  res.status(201).json({ message: 'Warranty attachment saved', id: result.lastInsertRowid });
});

purchaseInvoiceScanRouter.get('/:id/warranty/:warrantyId/file', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const warranty = db.prepare('SELECT * FROM purchase_invoice_warranty_attachments WHERE id = ? AND scan_id = ?').get(Number(req.params.warrantyId), Number(req.params.id)) as any;
  if (!warranty || !warranty.file_path) { res.status(404).json({ error: 'No warranty file on this attachment' }); return; }

  const fullPath = path.join(SCANS_ROOT, warranty.file_path);
  if (!fullPath.startsWith(SCANS_ROOT) || !fs.existsSync(fullPath)) { res.status(404).json({ error: 'Warranty file missing from storage' }); return; }

  fs.createReadStream(fullPath).pipe(res);
});

// Void a draft that was never committed (e.g. a duplicate/misfired upload).
purchaseInvoiceScanRouter.delete('/:id', authenticateToken, requirePermission('create_purchases'), (req: AuthenticatedRequest, res: Response) => {
  const scan = db.prepare('SELECT * FROM purchase_invoice_scans WHERE id = ?').get(Number(req.params.id)) as any;
  if (!scan) { res.status(404).json({ error: 'Scan not found' }); return; }
  if (scan.status === 'COMMITTED') { res.status(400).json({ error: 'A committed invoice cannot be voided here' }); return; }

  db.prepare(`UPDATE purchase_invoice_scans SET status = 'VOID', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(scan.id);
  res.json({ message: 'Draft voided' });
});

function packagingUnitsPerBox(item: any): number | null {
  if (item.packaging_type === 'STRIP_BOX') {
    if (!item.strips_per_box || !item.units_per_strip) return null;
    return item.strips_per_box * item.units_per_strip;
  }
  return 1; // bottles/tubes/sachets/loose: one sale unit per "box" (the sale pack itself)
}

// Validates everything required by the workflow spec before a draft can become a real purchase.
// Returns a list of human-readable blockers; an empty list means Commit may proceed.
function findCommitBlockers(scan: any, items: any[]): string[] {
  const blockers: string[] = [];
  if (!scan.supplier_id) blockers.push('Supplier has not been matched/confirmed');
  if (!scan.invoice_number_raw) blockers.push('Invoice number is missing');
  if (scan.document_type && scan.document_type !== 'INVOICE' && !scan.goods_received_confirmed) {
    blockers.push('This looks like a quotation/estimate - confirm that goods were actually received before posting stock');
  }
  if (items.length === 0) blockers.push('No line items to post');

  for (const item of items) {
    const label = item.product_name_raw || `Line ${item.line_number}`;
    if (!item.medicine_id) { blockers.push(`${label}: product not matched to the catalog`); continue; }
    if (item.flagged_unclear) blockers.push(`${label}: unresolved extraction issue - ${item.flag_reason || 'needs review'}`);
    if (!item.boxes_received || item.boxes_received <= 0) blockers.push(`${label}: boxes/packs received must be a positive quantity`);
    if (item.printed_mrp_per_box === null) blockers.push(`${label}: Enter printed MRP from the physical box.`);
    if (item.packaging_type === 'STRIP_BOX' && !item.strips_per_box) blockers.push(`${label}: Enter strips per box.`);
    if (item.packaging_type === 'STRIP_BOX' && !item.units_per_strip) blockers.push(`${label}: Enter tablets/capsules per strip.`);
    if (item.packaging_type === 'STRIP_BOX' && item.strips_per_box && !Number.isInteger(item.strips_per_box)) blockers.push(`${label}: strips per box must be a whole number`);
    if (item.packaging_type === 'STRIP_BOX' && item.units_per_strip && !Number.isInteger(item.units_per_strip)) blockers.push(`${label}: tablets/capsules per strip must be a whole number`);
    if (!item.batch_number) blockers.push(`${label}: batch number is missing`);
    if (!item.expiry_date) blockers.push(`${label}: expiry date is missing`);
    if (item.confirmed_sale_price_per_unit === null) blockers.push(`${label}: confirm the selling price per unit`);
    if (item.rate_basis === 'UNKNOWN' && item.confirmed_purchase_cost_per_box === null) {
      blockers.push(`${label}: purchase cost basis is unclear - confirm whether the invoice rate is per box, strip, bottle, or unit, or enter the confirmed cost directly`);
    }
    if (item.bonus_quantity_raw && !item.bonus_confirmed) {
      blockers.push(`${label}: confirm whether the bonus/free quantity is in boxes, strips, or units`);
    }
    if ((item.is_schedule_b || item.is_schedule_d) && !item.classification_confirmed) {
      blockers.push(`${label}: Schedule B/D classification needs confirmation`);
    }
    if (item.handwritten_flag) {
      blockers.push(`${label}: contains a handwritten change - review before posting`);
    }
  }
  return blockers;
}

purchaseInvoiceScanRouter.get('/:id/commit-check', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const scanId = Number(req.params.id);
  const scan = db.prepare('SELECT * FROM purchase_invoice_scans WHERE id = ?').get(scanId) as any;
  if (!scan) { res.status(404).json({ error: 'Scan not found' }); return; }
  const items = db.prepare('SELECT * FROM purchase_invoice_scan_items WHERE scan_id = ?').all(scanId) as any[];
  res.json({ blockers: findCommitBlockers(scan, items) });
});

// Posts the reviewed draft as a real purchase: creates `purchases`/`purchase_items`, upserts
// batches (weighted-average cost, mirroring the manual purchase flow), records stock movements,
// updates the supplier ledger, and links the scan + its warranty attachments to the new purchase -
// all inside one transaction, so stock and records never end up partially updated.
purchaseInvoiceScanRouter.post('/:id/commit', authenticateToken, requirePermission('create_purchases'), (req: AuthenticatedRequest, res: Response) => {
  const scanId = Number(req.params.id);
  const { requestKey, purchaseDate, paidAmount, paymentMethod, discount, tax } = req.body;

  const scan = db.prepare('SELECT * FROM purchase_invoice_scans WHERE id = ?').get(scanId) as any;
  if (!scan) { res.status(404).json({ error: 'Scan not found' }); return; }
  if (scan.status === 'COMMITTED') {
    res.status(200).json({ message: 'Already committed', purchaseId: scan.purchase_id });
    return;
  }

  if (requestKey) {
    const already = db.prepare('SELECT id FROM purchases WHERE request_key = ?').get(requestKey) as any;
    if (already) { res.status(200).json({ message: 'Already committed', purchaseId: already.id }); return; }
  }

  const items = db.prepare('SELECT * FROM purchase_invoice_scan_items WHERE scan_id = ?').all(scanId) as any[];
  const blockers = findCommitBlockers(scan, items);
  if (blockers.length > 0) {
    res.status(400).json({ error: 'Cannot commit: unresolved required fields', blockers });
    return;
  }

  try {
    const result = runTransaction(() => {
      const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(scan.supplier_id) as any;
      if (!supplier) throw new Error('Supplier does not exist');

      let subtotal = 0;
      const lineInserts: Array<() => void> = [];
      const preparedLines: Array<{ item: any; unitsPerBox: number; qty: number; bonus: number; costPrice: number; salePrice: number; lineTotal: number }> = [];

      for (const item of items) {
        const unitsPerBox = packagingUnitsPerBox(item)!;
        const qty = Math.round(item.boxes_received * unitsPerBox);
        const bonusBoxes = item.bonus_confirmed ? (item.bonus_quantity_basis === 'UNITS' ? item.bonus_quantity_raw / unitsPerBox
          : item.bonus_quantity_basis === 'STRIPS' && item.packaging_type === 'STRIP_BOX' ? (item.bonus_quantity_raw * item.units_per_strip) / unitsPerBox
          : item.bonus_quantity_raw) : 0;
        const bonus = Math.round((bonusBoxes || 0) * unitsPerBox);
        const costPrice = item.confirmed_purchase_cost_per_box != null ? Math.round((item.confirmed_purchase_cost_per_box / unitsPerBox) * 100) / 100 : 0;
        const salePrice = Math.round(item.confirmed_sale_price_per_unit * 100) / 100;
        const lineTotal = item.line_total_raw != null ? item.line_total_raw : Math.round(qty * costPrice * 100) / 100;
        subtotal += lineTotal;
        preparedLines.push({ item, unitsPerBox, qty, bonus, costPrice, salePrice, lineTotal });
      }

      const total = Math.round((subtotal - (Number(discount) || 0) + (Number(tax) || 0)) * 100) / 100;
      const paid = Number(paidAmount) || 0;
      const remaining = Math.max(0, total - paid);
      const status = remaining > 0 && paid > 0 ? 'PARTIAL' : remaining > 0 ? 'UNPAID' : 'PAID';
      const isScheduleB = scan.is_schedule_b || items.some(i => i.is_schedule_b) ? 1 : 0;
      const isScheduleD = scan.is_schedule_d || items.some(i => i.is_schedule_d) ? 1 : 0;

      const pResult = db.prepare(`
        INSERT INTO purchases (
          invoice_number, supplier_id, purchase_date, subtotal, discount, tax, total_amount,
          paid_amount, remaining_amount, payment_status, payment_method, created_by, notes,
          scan_id, is_schedule_b, is_schedule_d, reviewed_by, reviewed_at, committed_by, committed_at, request_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      `).run(
        scan.invoice_number_raw,
        scan.supplier_id,
        purchaseDate || scan.invoice_date_raw || new Date().toISOString().split('T')[0],
        Math.round(subtotal * 100) / 100,
        Number(discount) || 0,
        Number(tax) || 0,
        total,
        paid,
        remaining,
        status,
        paymentMethod || 'CASH',
        req.user?.id,
        scan.notes,
        scan.id,
        isScheduleB,
        isScheduleD,
        scan.reviewed_by || req.user?.id,
        scan.reviewed_at,
        req.user?.id,
        requestKey || null
      );
      const purchaseId = Number(pResult.lastInsertRowid);

      for (const line of preparedLines) {
        const { item, qty, bonus, costPrice, salePrice, lineTotal } = line;
        const existingBatch = db.prepare('SELECT id, quantity, purchase_price FROM batches WHERE medicine_id = ? AND batch_number = ?').get(item.medicine_id, item.batch_number) as any;

        let batchId: number;
        let newBatchQty: number;
        const incomingQty = qty + bonus;

        if (existingBatch) {
          batchId = existingBatch.id;
          newBatchQty = existingBatch.quantity + incomingQty;
          const weightedCost = newBatchQty > 0
            ? ((existingBatch.quantity * existingBatch.purchase_price) + (incomingQty * costPrice)) / newBatchQty
            : costPrice;
          db.prepare(`
            UPDATE batches SET quantity = ?, purchase_price = ?, sale_price = ?, bonus_quantity = bonus_quantity + ?, expiry_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `).run(newBatchQty, Math.round(weightedCost * 100) / 100, salePrice, bonus, item.expiry_date, batchId);
        } else {
          newBatchQty = incomingQty;
          const bResult = db.prepare(`
            INSERT INTO batches (medicine_id, batch_number, expiry_date, mfg_date, purchase_price, sale_price, quantity, bonus_quantity, supplier_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
          `).run(item.medicine_id, item.batch_number, item.expiry_date, item.mfg_date || null, costPrice, salePrice, newBatchQty, bonus, scan.supplier_id);
          batchId = Number(bResult.lastInsertRowid);
        }

        db.prepare(`
          INSERT INTO stock_movements (batch_id, movement_type, quantity_change, balance_after, reference_type, reference_id, notes, user_id)
          VALUES (?, 'PURCHASE', ?, ?, 'PURCHASE_INVOICE', ?, ?, ?)
        `).run(batchId, incomingQty, newBatchQty, scan.invoice_number_raw, `Inward stock purchase from ${supplier.name} (scanned invoice)`, req.user?.id);

        db.prepare(`
          INSERT INTO purchase_items (
            purchase_id, medicine_id, batch_id, batch_number, expiry_date, mfg_date, purchase_price, sale_price,
            quantity, bonus_quantity, line_discount, line_total, scan_item_id, packaging_type, boxes_received,
            printed_mrp_per_box, strips_per_box, units_per_strip, confirmed_purchase_cost_per_box, rate_basis,
            bonus_quantity_basis, is_schedule_b, is_schedule_d
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          purchaseId, item.medicine_id, batchId, item.batch_number, item.expiry_date, item.mfg_date || null,
          costPrice, salePrice, qty, bonus, item.line_discount_raw || 0, lineTotal, item.id, item.packaging_type,
          item.boxes_received, item.printed_mrp_per_box, item.strips_per_box, item.units_per_strip,
          item.confirmed_purchase_cost_per_box, item.rate_basis, item.bonus_quantity_basis,
          item.is_schedule_b, item.is_schedule_d
        );
      }

      const newSupplierBalance = supplier.current_balance + remaining;
      db.prepare('UPDATE suppliers SET current_balance = ? WHERE id = ?').run(newSupplierBalance, scan.supplier_id);
      db.prepare(`
        INSERT INTO supplier_ledgers (supplier_id, transaction_type, reference_id, debit, credit, balance_after, notes)
        VALUES (?, 'PURCHASE_INWARD', ?, ?, ?, ?, ?)
      `).run(scan.supplier_id, scan.invoice_number_raw, paid, total, newSupplierBalance, `Purchase Invoice #${scan.invoice_number_raw} (scanned, Total: Rs. ${total}, Paid: Rs. ${paid})`);

      if (paid > 0) {
        db.prepare(`
          INSERT INTO cashbook_entries (entry_type, category, amount, reference_type, reference_id, description, created_by)
          VALUES ('OUT', 'SUPPLIER_PAYMENT', ?, 'PURCHASE', ?, ?, ?)
        `).run(paid, String(purchaseId), `Immediate cash payment for Purchase #${scan.invoice_number_raw} to ${supplier.name}`, req.user?.id);
      }

      db.prepare(`UPDATE purchase_invoice_scans SET status = 'COMMITTED', purchase_id = ?, committed_by = ?, committed_at = CURRENT_TIMESTAMP WHERE id = ?`).run(purchaseId, req.user?.id, scan.id);
      db.prepare(`UPDATE purchase_invoice_warranty_attachments SET purchase_id = ? WHERE scan_id = ?`).run(purchaseId, scan.id);

      logAudit({
        userId: req.user?.id, action: 'COMMIT_PURCHASE_SCAN', entity: 'PURCHASES', entityId: purchaseId,
        newValues: { scanId: scan.id, invoiceNumber: scan.invoice_number_raw, total, paid, remaining }, ipAddress: req.ip
      });

      return { purchaseId, total, remaining };
    });

    triggerAutoSync(`purchase scan ${scan.invoice_number_raw}`);
    res.status(201).json({ message: 'Invoice committed and stock updated', ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to commit invoice' });
  }
});

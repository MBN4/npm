import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { db } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';
import { buildReviewDraft, normalizeAiInvoice, normalizeDate, nonMedicineReason, scoreMedicineMatch, cleanProductName } from '../services/invoiceReviewService.js';

let adminToken: string;

// What a vision model (or a confused OCR pass) returns for the Paaris Distributors invoice
// that produced junk lines on the live site: one real item plus header lines.
const paarisAiOutput = {
  supplierName: 'Paaris Distributors - Lahore',
  invoiceNumber: '1448129',
  invoiceDate: '09/11/2026',
  printedNetTotal: 1116,
  printedItemCount: 1,
  items: [
    { productName: 'Sale Order #1393635 Sale Order', quantity: 139, rate: null, lineTotal: null },
    { productName: 'DSS Id : 0051722 Due Date : 09', quantity: 517, rate: null, lineTotal: null },
    { productName: 'EE sihid THR Plot No. 36 Street', quantity: 36, rate: null, lineTotal: null },
    { productName: '33 / GSK', quantity: null, rate: null, lineTotal: null },
    {
      productName: '007/Clobevate Cream 1x20G 20gm',
      manufacturer: 'GSK',
      batchNumber: 'AX2K',
      expiryDate: '31/07/2028',
      quantity: 6,
      bonusQuantity: null,
      rate: 185.05,
      discountPercent: 0,
      lineTotal: 1115.85,
      confidence: 0.95
    },
    { productName: 'Total For Invoice 1448129', quantity: 6, rate: null, lineTotal: 1110.3 }
  ]
};

function counts() {
  return {
    medicines: (db.prepare('SELECT COUNT(*) AS c FROM medicines').get() as any).c,
    suppliers: (db.prepare('SELECT COUNT(*) AS c FROM suppliers').get() as any).c,
    batches: (db.prepare('SELECT COUNT(*) AS c FROM batches').get() as any).c
  };
}

beforeAll(async () => {
  seedDatabase();
  const adminRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  adminToken = adminRes.body.token;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GROQ_API_KEY;
});

describe('Invoice review helpers', () => {
  it('normalizes day-first and month/year invoice dates', () => {
    expect(normalizeDate('31/07/2028')).toBe('2028-07-31');
    expect(normalizeDate('09/11/2026')).toBe('2026-11-09');
    expect(normalizeDate('07/2028')).toBe('2028-07-31');
    expect(normalizeDate('JUL-28')).toBe('2028-07-31');
    expect(normalizeDate('2028-02-30')).toBeNull();
    expect(normalizeDate('garbage')).toBeNull();
  });

  it('strips distributor item codes and pack tokens from product names', () => {
    expect(cleanProductName('007/Clobevate Cream 1x20G 20gm')).toBe('Clobevate Cream');
    expect(cleanProductName('260-GAVISCON LIQUID 120ML')).toBe('GAVISCON LIQUID');
  });

  it('rejects header/footer lines as medicines', () => {
    const base = { packSize: null, manufacturer: null, batchNumber: null, expiryDate: null, mfgDate: null, bonusQuantity: null, discountPercent: null, mrp: null, confidence: null };
    expect(nonMedicineReason({ ...base, productName: 'Sale Order #1393635', quantity: 139, rate: null, lineTotal: null })).not.toBeNull();
    expect(nonMedicineReason({ ...base, productName: 'DSS Id : 0051722 Due Date : 09', quantity: 517, rate: null, lineTotal: null })).not.toBeNull();
    expect(nonMedicineReason({ ...base, productName: 'Advance WHTax @0.50% U/S 236H', quantity: null, rate: null, lineTotal: 5.55 })).not.toBeNull();
    expect(nonMedicineReason({ ...base, productName: 'Clobevate Cream 1x20G', quantity: 6, rate: 185.05, lineTotal: 1115.85 })).toBeNull();
  });

  it('does not treat "Panadol Extra" as a confident match for plain "Panadol"', () => {
    const plain = scoreMedicineMatch({ name: 'Panadol Extra Tab', strength: null, form: 'Tablet' }, { brand_name: 'Panadol', strength: '500mg', dosage_form: 'Tablet' });
    const extra = scoreMedicineMatch({ name: 'Panadol Extra Tab', strength: null, form: 'Tablet' }, { brand_name: 'Panadol Extra', strength: null, dosage_form: 'Tablet' });
    expect(extra).toBeGreaterThan(plain);
    expect(plain).toBeLessThan(0.85);
  });
});

describe('AI Stock Inward review draft (no side effects)', () => {
  it('keeps only the real medicine line, never invents batch/expiry, and writes nothing to the DB', () => {
    const before = counts();
    const draft = buildReviewDraft(normalizeAiInvoice(paarisAiOutput), { extractionMethod: 'AI_VISION', aiProvider: 'groq', today: '2026-11-10' });
    const after = counts();

    expect(after).toEqual(before);
    expect(draft.items).toHaveLength(1);
    expect(draft.ignoredLines.length).toBeGreaterThanOrEqual(4);
    const item = draft.items[0];
    expect(item.productName).toBe('Clobevate Cream');
    expect(item.batchNumber).toBe('AX2K');
    expect(item.expiryDate).toBe('2028-07-31');
    expect(item.boxes).toBe(6);
    expect(item.purchasePrice).toBe(185.05);
    expect(item.blistersPerBox).toBe(1);
    expect(item.tabsPerBlister).toBe(1);
    expect(draft.invoiceNumber).toBe('1448129');
    expect(draft.purchaseDate).toBe('2026-11-09');
    expect(draft.questions.find(q => q.type === 'ITEM_COUNT')).toBeUndefined();
  });

  it('links CLOBEVATE from the catalog and asks whether quantity 6 means boxes or single tubes', () => {
    const draft = buildReviewDraft(normalizeAiInvoice(paarisAiOutput), { extractionMethod: 'AI_VISION', aiProvider: 'groq', today: '2026-11-10' });
    const item = draft.items[0];
    const linked = db.prepare('SELECT brand_name, strength FROM medicines WHERE id = ?').get(item.matchedMedicineId) as any;
    expect(item.matchStatus).toBe('MATCHED');
    expect(linked).toEqual({ brand_name: 'CLOBEVATE', strength: '20g' });
    // Not confused with the similarly named CLOBEDERM.
    expect(item.candidates.some(c => /clobederm/i.test(c.brandName))).toBe(false);
    const qtyQ = draft.questions.find(q => q.type === 'QTY_UNIT' && q.itemIndex === 0);
    expect(qtyQ?.blocking).toBe(true);
    expect(qtyQ?.options).toHaveLength(2);
  });

  it('asks the admin instead of creating an unknown medicine or supplier', () => {
    const unknown = { ...paarisAiOutput, items: [{ ...paarisAiOutput.items[4], productName: '011/Zyntrolox Cream 1x15G 15gm' }] };
    const draft = buildReviewDraft(normalizeAiInvoice(unknown), { extractionMethod: 'AI_VISION', aiProvider: 'groq', today: '2026-11-10' });
    expect(draft.items[0].matchStatus).toBe('NEW');
    expect(draft.items[0].matchedMedicineId).toBeNull();
    const medQ = draft.questions.find(q => q.type === 'MEDICINE_MATCH');
    expect(medQ?.blocking).toBe(true);
    expect(medQ?.options.some(o => o.value.createNew)).toBe(true);
    expect(medQ?.options.some(o => o.value.skip)).toBe(true);
    const supQ = draft.questions.find(q => q.type === 'SUPPLIER');
    expect(supQ?.options.some(o => o.value.newSupplierName === 'Paaris Distributors - Lahore')).toBe(true);
  });

  it('flags missing batch/expiry instead of filling made-up values', () => {
    const draft = buildReviewDraft(normalizeAiInvoice({
      supplierName: null,
      invoiceNumber: null,
      items: [{ productName: 'Augmentin 625mg Tab 6S', quantity: 2, rate: 450, lineTotal: 900 }]
    }), { extractionMethod: 'AI_TEXT', aiProvider: 'groq', today: '2026-11-10' });
    expect(draft.items[0].batchNumber).toBeNull();
    expect(draft.items[0].expiryDate).toBeNull();
    expect(draft.items[0].issues.some(i => /batch/i.test(i))).toBe(true);
    expect(draft.items[0].issues.some(i => /expiry/i.test(i))).toBe(true);
    expect(draft.invoiceNumber).toBeNull();
    expect(draft.warnings.some(w => /invoice number/i.test(w))).toBe(true);
  });

  it('POST /api/purchases/scans/ai-quick-extract reads the photo with the Groq vision model', async () => {
    process.env.GROQ_API_KEY = 'test-key-not-real';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(paarisAiOutput) } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const { Jimp } = await import('jimp');
    const png = await new Jimp({ width: 40, height: 40, color: 0xffffffff }).getBuffer('image/png');
    const before = counts();

    const res = await request(app)
      .post('/api/purchases/scans/ai-quick-extract')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('files', Buffer.from(png), { filename: 'invoice.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.extractionMethod).toBe('AI_VISION');
    expect(res.body.aiProvider).toBe('groq');
    expect(res.body.items).toHaveLength(1);
    expect(counts()).toEqual(before);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('api.groq.com');
    const sent = JSON.parse(String(init.body));
    expect(sent.messages[0].content.some((c: any) => c.type === 'image_url')).toBe(true);
  });

  it('GET /api/purchases/scans/ai-status reports Groq without exposing the key', async () => {
    process.env.GROQ_API_KEY = 'test-key-not-real';
    const res = await request(app).get('/api/purchases/scans/ai-status').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.aiEnabled).toBe(true);
    expect(res.body.provider).toBe('groq');
    expect(JSON.stringify(res.body)).not.toContain('test-key-not-real');
  });
});

describe('Saving reviewed stock into inventory', () => {
  const suffix = Date.now();
  // Letters only, so the name is a distinct word for the matcher (digits are ignored when matching).
  const word = 'Q' + suffix.toString().split('').map(d => 'abcdefghij'[Number(d)]).join('').slice(-7);
  const supplierName = `Paaris Distributors Test ${suffix}`;
  let medicineId: number;
  let supplierId: number;

  const post = (body: any) => request(app).post('/api/purchases').set('Authorization', `Bearer ${adminToken}`).send(body);
  const creamLine = (batchNumber: string, expiryDate: string, boxes = 6) => ({
    batchNumber, expiryDate, boxesReceived: boxes, stripsPerBox: 1, unitsPerStrip: 1, quantity: boxes,
    purchasePrice: 185.05, confirmedPurchaseCostPerBox: 185.05, mrp: 240, printedMrpPerBox: 240, lineTotal: boxes * 185.05
  });

  it('creates the confirmed new supplier and new medicine only at save time', async () => {
    const res = await post({
      newSupplier: { name: supplierName },
      invoiceNumber: `T-${suffix}-1`,
      purchaseDate: '2026-11-09',
      totalAmount: 1110.3,
      paidAmount: 0,
      items: [{ ...creamLine('AX2K', '2028-07-31'), newMedicine: { brandName: `Clobevate ${word}`, strength: '20g', dosageForm: 'Cream', packagingType: 'SIMPLE' } }]
    });
    expect(res.status).toBe(201);
    expect(res.body.createdMedicines).toHaveLength(1);
    medicineId = res.body.createdMedicines[0].id;
    supplierId = res.body.supplierId;

    const med = db.prepare('SELECT packaging_type, pack_size, custom_barcode FROM medicines WHERE id = ?').get(medicineId) as any;
    expect(med.packaging_type).toBe('SIMPLE');
    expect(med.pack_size).toBe(1);
    expect(med.custom_barcode).toMatch(/^NMP-/);
    const batch = db.prepare('SELECT quantity, expiry_date FROM batches WHERE medicine_id = ? AND batch_number = ?').get(medicineId, 'AX2K') as any;
    expect(batch.quantity).toBe(6);
    expect(batch.expiry_date).toBe('2028-07-31');
    const movement = db.prepare(`SELECT quantity_change FROM stock_movements WHERE reference_id = ? AND movement_type = 'PURCHASE'`).get(`T-${suffix}-1`) as any;
    expect(movement.quantity_change).toBe(6);
  });

  it('adds a different batch of the same medicine as a separate batch row', async () => {
    const res = await post({ supplierId, invoiceNumber: `T-${suffix}-2`, purchaseDate: '2026-11-10', totalAmount: 740.2, items: [{ medicineId, ...creamLine('BX9Q', '2029-01-31', 4) }] });
    expect(res.status).toBe(201);
    expect(res.body.stockSummary[0].action).toBe('NEW_BATCH');
    const batches = db.prepare('SELECT batch_number, quantity FROM batches WHERE medicine_id = ? ORDER BY batch_number').all(medicineId) as any[];
    expect(batches).toEqual([{ batch_number: 'AX2K', quantity: 6 }, { batch_number: 'BX9Q', quantity: 4 }]);
  });

  it('tops up the existing batch when the same batch arrives again (no duplicate row)', async () => {
    const res = await post({ supplierId, invoiceNumber: `T-${suffix}-3`, purchaseDate: '2026-11-11', totalAmount: 370.1, items: [{ medicineId, ...creamLine('ax2k', '2028-07-31', 2) }] });
    expect(res.status).toBe(201);
    expect(res.body.stockSummary[0].action).toBe('ADDED_TO_EXISTING_BATCH');
    const rows = db.prepare(`SELECT quantity FROM batches WHERE medicine_id = ? AND batch_number = 'AX2K' COLLATE NOCASE`).all(medicineId) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(8);
  });

  it('refuses the same batch with a different expiry unless the admin confirms the correction', async () => {
    const res = await post({ supplierId, invoiceNumber: `T-${suffix}-4`, purchaseDate: '2026-11-11', totalAmount: 185.05, items: [{ medicineId, ...creamLine('AX2K', '2028-08-31', 1) }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already in stock with expiry 2028-07-31/);
    // Nothing from the failed invoice was written.
    expect(db.prepare('SELECT COUNT(*) AS c FROM purchases WHERE invoice_number = ?').get(`T-${suffix}-4`)).toEqual({ c: 0 });
    expect((db.prepare(`SELECT quantity FROM batches WHERE medicine_id = ? AND batch_number = 'AX2K'`).get(medicineId) as any).quantity).toBe(8);

    const confirmed = await post({ supplierId, invoiceNumber: `T-${suffix}-4`, purchaseDate: '2026-11-11', totalAmount: 185.05, items: [{ medicineId, ...creamLine('AX2K', '2028-08-31', 1), overrideBatchExpiry: true }] });
    expect(confirmed.status).toBe(201);
    const batch = db.prepare(`SELECT quantity, expiry_date FROM batches WHERE medicine_id = ? AND batch_number = 'AX2K'`).get(medicineId) as any;
    expect(batch).toEqual({ quantity: 9, expiry_date: '2028-08-31' });
  });

  it('blocks saving the same supplier invoice twice', async () => {
    const res = await post({ supplierId, invoiceNumber: `T-${suffix}-1`, purchaseDate: '2026-11-09', totalAmount: 10, items: [{ medicineId, ...creamLine('ZZ1', '2029-01-31', 1) }] });
    expect(res.status).toBe(409);
    expect(db.prepare('SELECT COUNT(*) AS c FROM batches WHERE medicine_id = ? AND batch_number = ?').get(medicineId, 'ZZ1')).toEqual({ c: 0 });
  });

  it('refuses expired stock and lines without a medicine', async () => {
    const expired = await post({ supplierId, invoiceNumber: `T-${suffix}-5`, purchaseDate: '2026-11-11', totalAmount: 10, items: [{ medicineId, ...creamLine('OLD1', '2026-10-31', 1) }] });
    expect(expired.status).toBe(400);
    expect(expired.body.error).toMatch(/expired/);
    const noMed = await post({ supplierId, invoiceNumber: `T-${suffix}-6`, purchaseDate: '2026-11-11', totalAmount: 10, items: [creamLine('NM1', '2029-01-31', 1)] });
    expect(noMed.status).toBe(400);
    expect(noMed.body.error).toMatch(/select a medicine/);
  });

  it('treats a repeated save with the same requestKey as one purchase', async () => {
    const body = { supplierId, invoiceNumber: `T-${suffix}-7`, purchaseDate: '2026-11-11', totalAmount: 185.05, requestKey: `rk-${suffix}`, items: [{ medicineId, ...creamLine('RK1', '2029-03-31', 1) }] };
    const first = await post(body);
    const second = await post(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.purchaseId).toBe(first.body.purchaseId);
    expect((db.prepare(`SELECT quantity FROM batches WHERE medicine_id = ? AND batch_number = 'RK1'`).get(medicineId) as any).quantity).toBe(1);
  });

  it('a later review of the same invoice line now links to the saved medicine and existing batch', () => {
    const draft = buildReviewDraft(normalizeAiInvoice({
      supplierName,
      invoiceNumber: `NEW-${suffix}`,
      items: [{ productName: `Clobevate ${word} Cream 1x20G`, batchNumber: 'AX2K', expiryDate: '31/08/2028', quantity: 1, rate: 185.05, lineTotal: 185.05 }]
    }), { extractionMethod: 'AI_VISION', aiProvider: 'groq', today: '2026-11-11' });
    expect(draft.matchedSupplierId).toBe(supplierId);
    expect(draft.items[0].matchStatus).toBe('MATCHED');
    expect(draft.items[0].matchedMedicineId).toBe(medicineId);
    expect(draft.items[0].existingBatch?.quantity).toBe(9);
    expect(draft.items[0].existingBatch?.expiryConflict).toBe(false);
  });
});

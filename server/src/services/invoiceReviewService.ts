// Turns raw invoice extraction output (AI or local parser) into a review draft for the admin.
//
// This module NEVER writes to the database. It only reads the catalog/suppliers/batches so it
// can suggest matches and raise questions. Nothing is created (no supplier, no medicine, no
// batch) until the admin reviews the draft and saves the purchase - see purchaseRoutes.ts.
//
// Design rules:
// - Never invent data. A missing batch number, expiry, invoice number or quantity stays empty
//   and is flagged so the admin fills it in, instead of being replaced by a made-up value.
// - Header/footer lines (Sale Order #, DSS Id, Booking Man, addresses, NTN, totals...) are not
//   medicines. They are dropped and reported back as "ignored lines" so the admin can see them.
// - A medicine is only pre-linked when the match is unambiguous. Anything else becomes a
//   question with ranked candidates plus "create new medicine" / "skip line".
import { db } from '../db/index.js';

export interface RawExtractedItem {
  productName: string | null;
  packSize: string | null;
  manufacturer: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  mfgDate: string | null;
  quantity: number | null;
  bonusQuantity: number | null;
  rate: number | null;
  discountPercent: number | null;
  lineTotal: number | null;
  mrp: number | null;
  confidence: number | null;
}

export interface RawExtractedInvoice {
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  printedNetTotal: number | null;
  printedItemCount: number | null;
  items: RawExtractedItem[];
}

export type ExtractionMethod = 'AI_VISION' | 'AI_TEXT' | 'LOCAL_PARSER';
export type MatchStatus = 'MATCHED' | 'NEEDS_REVIEW' | 'NEW';

export interface CatalogPacking {
  packagingType: 'MULTI_TIER' | 'SIMPLE';
  /** Packs (strips/blisters) per box. 1 for SIMPLE products. */
  blistersPerBox: number;
  /** Sellable units per pack. For SIMPLE products: units per box. */
  tabsPerBlister: number;
  /** Total sellable units in one box (= medicines.pack_size). */
  unitsPerBox: number;
  /** False when the catalog row carries placeholder/inconsistent packing values. */
  reliable: boolean;
}

export interface MedicineCandidate {
  medicineId: number;
  brandName: string;
  strength: string | null;
  dosageForm: string | null;
  score: number;
  packing: CatalogPacking;
}

export interface ExistingBatchInfo {
  batchId: number;
  quantity: number;
  expiryDate: string;
  expiryConflict: boolean;
}

export interface ReviewQuestion {
  id: string;
  type: 'SUPPLIER' | 'MEDICINE_MATCH' | 'PACKING' | 'QTY_UNIT' | 'BATCH_EXPIRY_CONFLICT' | 'ITEM_COUNT' | 'TOTAL_MISMATCH' | 'DUPLICATE_INVOICE';
  itemIndex?: number;
  question: string;
  /** Blocking questions must be answered before the purchase can be saved. */
  blocking: boolean;
  options: Array<{ label: string; value: Record<string, unknown> }>;
}

export interface ReviewItem {
  invoiceName: string;
  productName: string;
  strength: string | null;
  dosageForm: string | null;
  packSize: string | null;
  manufacturer: string | null;
  matchStatus: MatchStatus;
  matchedMedicineId: number | null;
  candidates: MedicineCandidate[];
  newMedicine: {
    brandName: string;
    strength: string | null;
    dosageForm: string;
    packagingType: 'MULTI_TIER' | 'SIMPLE';
  };
  batchNumber: string | null;
  expiryDate: string | null;
  mfgDate: string | null;
  boxes: number | null;
  bonusBoxes: number;
  blistersPerBox: number | null;
  tabsPerBlister: number | null;
  packingSource: 'CATALOG' | 'INVOICE' | 'UNKNOWN';
  purchasePrice: number | null;
  mrp: number | null;
  discountPercent: number | null;
  lineTotal: number | null;
  confidence: number | null;
  existingBatch: ExistingBatchInfo | null;
  issues: string[];
}

export interface ReviewDraft {
  extractionMethod: ExtractionMethod;
  aiProvider: string | null;
  supplierName: string | null;
  matchedSupplierId: number | null;
  supplierCandidates: Array<{ id: number; name: string; score: number }>;
  invoiceNumber: string | null;
  purchaseDate: string | null;
  printedNetTotal: number | null;
  printedItemCount: number | null;
  calculatedTotal: number;
  duplicatePurchase: { purchaseId: number; supplierName: string; purchaseDate: string } | null;
  items: ReviewItem[];
  ignoredLines: string[];
  questions: ReviewQuestion[];
  warnings: string[];
  rawNotes: string | null;
}

// ---------------------------------------------------------------------------------------------
// Value coercion
// ---------------------------------------------------------------------------------------------

export function cleanString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed || /^(null|n\/a|na|none|-+|\.+)$/i.test(trimmed)) return null;
  return trimmed;
}

export function cleanNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/rs\.?|pkr|₨|,|=/gi, '').trim();
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') return record[key];
  }
  return null;
}

/** Accepts the JSON shapes produced by the AI prompts (and older aliases) and normalizes them. */
export function normalizeAiInvoice(raw: unknown): RawExtractedInvoice {
  const record = (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) ? raw as Record<string, unknown> : {};
  const itemsRaw = Array.isArray(record.items) ? record.items : [];
  const items: RawExtractedItem[] = itemsRaw
    .filter((it): it is Record<string, unknown> => typeof it === 'object' && it !== null && !Array.isArray(it))
    .map(it => ({
      productName: cleanString(pick(it, 'productName', 'itemName', 'name', 'description')),
      packSize: cleanString(pick(it, 'packSize', 'pack', 'packing')),
      manufacturer: cleanString(pick(it, 'manufacturer', 'company')),
      batchNumber: cleanString(pick(it, 'batchNumber', 'batch', 'batchNo')),
      expiryDate: cleanString(pick(it, 'expiryDate', 'expiry', 'exp')),
      mfgDate: cleanString(pick(it, 'mfgDate', 'manufacturingDate')),
      quantity: cleanNumber(pick(it, 'quantity', 'qty', 'boxesReceived', 'boxes')),
      bonusQuantity: cleanNumber(pick(it, 'bonusQuantity', 'bonus', 'free')),
      rate: cleanNumber(pick(it, 'rate', 'purchasePrice', 'tradePrice', 'unitRate')),
      discountPercent: cleanNumber(pick(it, 'discountPercent', 'discPercent')),
      lineTotal: cleanNumber(pick(it, 'lineTotal', 'netAmount', 'amount', 'lineNetAmount')),
      mrp: cleanNumber(pick(it, 'mrp', 'retailPrice', 'salePrice')),
      confidence: cleanNumber(pick(it, 'confidence'))
    }));

  return {
    supplierName: cleanString(pick(record, 'supplierName', 'distributorName', 'supplier')),
    invoiceNumber: cleanString(pick(record, 'invoiceNumber', 'invoiceNo', 'invoice')),
    invoiceDate: cleanString(pick(record, 'invoiceDate', 'purchaseDate', 'date')),
    printedNetTotal: cleanNumber(pick(record, 'printedNetTotal', 'netTotal', 'invoiceTotal', 'total')),
    printedItemCount: cleanNumber(pick(record, 'printedItemCount', 'totalItems', 'itemCount')),
    items
  };
}

// ---------------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};

function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function iso(year: number, month: number, day: number): string | null {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > lastDay(year, month)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Normalizes invoice dates to YYYY-MM-DD. Pakistani invoices print day-first (DD/MM/YYYY);
 * expiry is often month/year only (07/2028, JUL-28), which maps to the last day of that month.
 */
export function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  const text = raw.trim();
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return iso(year, Number(m[2]), Number(m[1]));
  }
  m = text.match(/^(\d{1,2})[\/\-.](\d{2}|\d{4})$/);
  if (m) {
    const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    const month = Number(m[1]);
    return month >= 1 && month <= 12 ? iso(year, month, lastDay(year, month)) : null;
  }
  m = text.match(/^(\d{1,2})?[\s\-\/]*([A-Za-z]{3,9})[\s\-\/,]*(\d{2}|\d{4})$/);
  if (m) {
    const month = MONTHS[m[2].slice(0, 4).toLowerCase()] ?? MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (!month) return null;
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return iso(year, month, m[1] ? Number(m[1]) : lastDay(year, month));
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Non-medicine line detection
// ---------------------------------------------------------------------------------------------

const NON_MEDICINE_PATTERNS: RegExp[] = [
  /\bsale\s*order\b/i, /\bdss\s*id\b/i, /\bbooking\s*man\b/i, /\bdelivery\s*man\b/i, /\bdue\s*date\b/i,
  /\binvoice\s*(?:no|#|date|id)?\b/i, /\breference\b/i, /\brefrence\b/i, /\bcustomer\b/i, /\bregion\b/i,
  /\baddress\b/i, /\bplot\s*no\b/i, /\bstreet\b/i, /\broad\b/i, /\bbazar\b/i, /\bestate\b/i,
  /\blicen[cs]e\b/i, /\bntn\b/i, /\bcnic\b/i, /\bgst\b/i, /\bstn\b/i, /\bfiler\b/i, /\bremarks\b/i,
  /\bship\s*to\b/i, /\bmop\b/i, /\bspo\b/i, /\bpage\s*\d/i, /\bwarranty\b/i, /\bprinted\s*by\b/i,
  /\bsoftware\b/i, /\btotal\b/i, /\bgross\s*amount\b/i, /\bdiscount\s*amount\b/i, /\bsub\s*total\b/i,
  /\bnet\s*total\b/i, /\badvance\b/i, /\bwh\s*tax\b/i, /\bu\/s\b/i, /\b236h?\b/i, /\bincentive\b/i,
  /\brupees\b/i, /\bonly\b\s*$/i, /\bphone\b/i, /\btel\b/i, /\bmobile\b/i, /\bfax\b/i, /\bemail\b/i,
  /\bwww\./i, /\.com\b/i, /\bgen\.?\s*date\b/i, /\buser\b/i, /\bsignature\b/i, /\bdistributors?\b/i,
  /\bsale\s*invoice\b/i, /\bpharmacy\b/i, /\bmedical\s*store\b/i, /\bcsrno\b/i, /\bprevious\s*pages\b/i
];

/** Returns a reason when the line is clearly not a medicine row, otherwise null. */
export function nonMedicineReason(item: RawExtractedItem): string | null {
  const name = item.productName || '';
  if (!name || name.replace(/[^a-z]/gi, '').length < 3) return 'no readable product name';
  if (/^\+?\d[\d\s\-]{6,}\d$/.test(name)) return 'phone number';
  if (/:\s*\S*$/.test(name) && /:/.test(name) && !/\d\s*(mg|ml|g|gm|mcg)\b/i.test(name)) return 'label/value header line';
  const hit = NON_MEDICINE_PATTERNS.find(re => re.test(name));
  if (hit) return 'invoice header/footer text';
  // A real invoice row always carries a quantity, a rate or an amount.
  if (item.quantity === null && item.rate === null && item.lineTotal === null && item.bonusQuantity === null) return 'no quantity, rate or amount on the line';
  // "33 / GSK" style company group headings have no item data of their own.
  if (/^\d+\s*\/\s*[a-z&.\s]+$/i.test(name) && item.rate === null) return 'company group heading';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Name parsing and catalog matching
// ---------------------------------------------------------------------------------------------

const FORM_WORDS: Record<string, string> = {
  tab: 'Tablet', tabs: 'Tablet', tablet: 'Tablet', tablets: 'Tablet',
  cap: 'Capsule', caps: 'Capsule', capsule: 'Capsule', capsules: 'Capsule',
  syp: 'Syrup', syr: 'Syrup', syrup: 'Syrup', susp: 'Suspension', suspension: 'Suspension',
  inj: 'Injection', injection: 'Injection', amp: 'Injection', vial: 'Injection',
  cream: 'Cream', crm: 'Cream', oint: 'Ointment', ointment: 'Ointment', gel: 'Gel', lotion: 'Lotion',
  drop: 'Drops', drops: 'Drops', sachet: 'Sachet', sachets: 'Sachet', sach: 'Sachet',
  spray: 'Spray', inhaler: 'Inhaler', powder: 'Powder', soln: 'Solution', solution: 'Solution', liquid: 'Liquid'
};

const SIMPLE_FORMS = new Set(['Syrup', 'Suspension', 'Injection', 'Cream', 'Ointment', 'Gel', 'Lotion', 'Drops', 'Sachet', 'Spray', 'Inhaler', 'Powder', 'Solution', 'Liquid']);

const STOP_TOKENS = new Set([...Object.keys(FORM_WORDS), 'mg', 'ml', 'mcg', 'gm', 'g', 'iu', 'kg', 'ltr', 'the', 'and', 'new', 'pack', 'box']);

export function extractStrength(text: string): string | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s?(mg|mcg|gm|g|ml|iu|%)(?:\s?\/\s?(\d+(?:\.\d+)?)?\s?(ml|g|tab))?/i);
  if (!m) return null;
  const unit = m[2].toLowerCase() === 'gm' ? 'g' : m[2].toLowerCase();
  return `${m[1]}${unit}${m[4] ? `/${m[3] || ''}${m[4].toLowerCase()}` : ''}`;
}

function normalizeStrength(s: string | null): string | null {
  if (!s) return null;
  return extractStrength(s) ?? s.toLowerCase().replace(/\s+/g, '');
}

export function detectDosageForm(text: string): string | null {
  for (const token of text.toLowerCase().split(/[^a-z]+/)) {
    if (FORM_WORDS[token]) return FORM_WORDS[token];
  }
  return null;
}

/** Strips distributor item codes and pack-size tokens: "007/Clobevate Cream 1x20G 20gm" -> "Clobevate Cream". */
export function cleanProductName(raw: string): string {
  let name = raw.replace(/\s+/g, ' ').trim();
  name = name.replace(/^\s*(?:\d{1,5}\s*[\/\-–.)]\s*)+/, '');          // leading item codes 007/ 260- 1)
  name = name.replace(/\b\d+\s*[x×*]\s*\d+(?:\.\d+)?\s*(?:'?s|g|gm|ml|mg)?\b/gi, ' '); // 1x20G 10x10
  name = name.replace(/\b\d+\s*'\s*s\b/gi, ' ');                          // 100's
  name = name.replace(/\b\d+(?:\.\d+)?\s?(?:mg|mcg|gm|g|ml|iu|%)\b/gi, ' '); // strengths (kept separately)
  name = name.replace(/[^\w\s\-+&]/g, ' ').replace(/\s+/g, ' ').trim();
  return name;
}

function significantTokens(text: string): string[] {
  return cleanProductName(text)
    .toLowerCase()
    .split(/[\s\-+&]+/)
    .filter(t => t.length >= 2 && !/^\d+$/.test(t) && !STOP_TOKENS.has(t));
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

function tokensEqual(a: string, b: string): boolean {
  if (a === b) return true;
  // Tolerate one OCR slip in longer words (Clobevate / Ciobevate).
  return a.length >= 5 && b.length >= 5 && levenshtein(a, b) <= 1;
}

function formFamily(form: string | null): string | null {
  if (!form) return null;
  if (form === 'Tablet' || form === 'Capsule') return 'solid';
  if (['Syrup', 'Suspension', 'Solution', 'Liquid', 'Drops'].includes(form)) return 'liquid';
  if (['Cream', 'Ointment', 'Gel', 'Lotion'].includes(form)) return 'topical';
  return form.toLowerCase();
}

export function scoreMedicineMatch(
  invoice: { name: string; strength: string | null; form: string | null },
  medicine: { brand_name: string; strength: string | null; dosage_form: string | null }
): number {
  const invTokens = significantTokens(invoice.name);
  const medTokens = significantTokens(medicine.brand_name);
  if (invTokens.length === 0 || medTokens.length === 0) return 0;

  const matchedMed = medTokens.filter(mt => invTokens.some(it => tokensEqual(it, mt))).length;
  const matchedInv = invTokens.filter(it => medTokens.some(mt => tokensEqual(it, mt))).length;
  if (matchedMed === 0) return 0;

  // Coverage of the catalog name matters most; uncovered invoice words ("Extra", "Forte", "DS")
  // lower the score so "Panadol Extra" is not silently linked to plain "Panadol".
  // Max 1.0 = every word matches both ways, brand word first, and the strength agrees.
  let score = (matchedMed / medTokens.length) * 0.5 + (matchedInv / invTokens.length) * 0.25;
  if (tokensEqual(invTokens[0], medTokens[0])) score += 0.15;
  else score -= 0.15; // the brand word is almost always first; a match on a later word is weak

  const invStrength = normalizeStrength(invoice.strength);
  const medStrength = normalizeStrength(medicine.strength || extractStrength(medicine.brand_name));
  if (invStrength && medStrength) score += invStrength === medStrength ? 0.1 : -0.35;

  const invFamily = formFamily(invoice.form);
  const medFamily = formFamily(detectDosageForm(medicine.dosage_form || '') || detectDosageForm(medicine.brand_name));
  if (invFamily && medFamily && invFamily !== medFamily) score -= 0.3;

  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

export function catalogPacking(row: { packaging_type?: string | null; pack_size?: number | null; tablets_per_pack?: number | null }): CatalogPacking {
  const packSize = Number(row.pack_size) || 0;
  const perPack = Number(row.tablets_per_pack) || 0;
  if (row.packaging_type === 'SIMPLE') {
    const units = Math.max(1, packSize || 1);
    return { packagingType: 'SIMPLE', blistersPerBox: 1, tabsPerBlister: units, unitsPerBox: units, reliable: packSize >= 1 };
  }
  // MULTI_TIER: pack_size = units per box, tablets_per_pack = units per strip.
  const reliable = packSize > 1 && perPack >= 1 && packSize % perPack === 0 && packSize >= perPack;
  if (!reliable) {
    return { packagingType: 'MULTI_TIER', blistersPerBox: 0, tabsPerBlister: 0, unitsPerBox: 0, reliable: false };
  }
  return { packagingType: 'MULTI_TIER', blistersPerBox: packSize / perPack, tabsPerBlister: perPack, unitsPerBox: packSize, reliable: true };
}

/** Packing printed on the invoice: "1x10'S", "10x10", "30'S", "120ML", "1x20G". */
export function invoicePacking(packText: string, form: string | null): { blistersPerBox: number; tabsPerBlister: number; certain: boolean } | null {
  const text = packText.toUpperCase();
  const isSimple = form ? SIMPLE_FORMS.has(form) : /\b\d+(\.\d+)?\s?(ML|G|GM|L)\b/.test(text);
  if (isSimple) {
    // "1X10'S" sachets = 10 sachets per box.
    const counted = text.match(/\b(\d+)\s*[X×*]\s*(\d+)\s*'?\s*S\b/);
    if (counted) return { blistersPerBox: 1, tabsPerBlister: Math.max(1, Number(counted[1]) * Number(counted[2])), certain: true };
    // "1x20G" = one 20g tube per pack; "120ML" = one bottle. A carton count like "12x1" is rare.
    const m = text.match(/\b(\d+)\s*[X×*]\s*\d+(?:\.\d+)?\s*(?:G|GM|ML|MG)\b/);
    const units = m ? Math.max(1, Number(m[1])) : 1;
    return { blistersPerBox: 1, tabsPerBlister: units, certain: true };
  }
  const multi = text.match(/\b(\d+)\s*[X×*]\s*(\d+)\b/);
  if (multi) {
    const a = Number(multi[1]);
    const b = Number(multi[2]);
    if (a >= 1 && b >= 1) return { blistersPerBox: a, tabsPerBlister: b, certain: true };
  }
  const total = text.match(/\b(\d+)\s*'?\s*S\b/);
  if (total) {
    const count = Number(total[1]);
    if (count <= 0) return null;
    // Total tablets per box is certain; the strip split is a best guess the admin can correct.
    if (count % 10 === 0) return { blistersPerBox: count / 10, tabsPerBlister: 10, certain: count === 10 };
    if (count % 14 === 0) return { blistersPerBox: count / 14, tabsPerBlister: 14, certain: false };
    return { blistersPerBox: 1, tabsPerBlister: count, certain: false };
  }
  return null;
}

function supplierKey(name: string): string {
  return name.toLowerCase().replace(/\b(pvt|private|ltd|limited|distributors?|distribution|traders?|pharma|co|company|and|the)\b/g, '').replace(/[^a-z0-9]/g, '');
}

function scoreSupplier(invoiceName: string, dbName: string): number {
  const a = supplierKey(invoiceName.split(/[-–,]/)[0]);
  const b = supplierKey(dbName.split(/[-–,]/)[0]);
  if (!a || !b) return 0;
  if (a === b) return 1;
  // Partial overlap ("Paaris" vs "Paaris Pharma Karachi") is only a suggestion, never an auto-match.
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return 0.75;
  const dist = levenshtein(a, b);
  return Math.max(0, 1 - dist / Math.max(a.length, b.length));
}

// ---------------------------------------------------------------------------------------------
// Draft builder
// ---------------------------------------------------------------------------------------------

const AUTO_MATCH_SCORE = 0.88;
const AUTO_MATCH_MARGIN = 0.1;
const CANDIDATE_MIN_SCORE = 0.35;

export function buildReviewDraft(
  extracted: RawExtractedInvoice,
  meta: { extractionMethod: ExtractionMethod; aiProvider: string | null; warnings?: string[]; rawNotes?: string | null; today?: string }
): ReviewDraft {
  const today = meta.today || new Date().toISOString().slice(0, 10);
  const warnings = [...(meta.warnings || [])];
  const questions: ReviewQuestion[] = [];
  const ignoredLines: string[] = [];

  // ---- Supplier (matched, never created here) ----
  const suppliers = db.prepare('SELECT id, name FROM suppliers WHERE is_active = 1').all() as Array<{ id: number; name: string }>;
  let matchedSupplierId: number | null = null;
  let supplierCandidates: Array<{ id: number; name: string; score: number }> = [];
  if (extracted.supplierName) {
    supplierCandidates = suppliers
      .map(s => ({ id: s.id, name: s.name, score: scoreSupplier(extracted.supplierName!, s.name) }))
      .filter(s => s.score >= 0.6)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    const [top, second] = supplierCandidates;
    if (top && top.score >= 0.85 && (!second || top.score - second.score >= 0.1)) {
      matchedSupplierId = top.id;
    } else {
      questions.push({
        id: 'q_supplier',
        type: 'SUPPLIER',
        question: supplierCandidates.length > 0
          ? `Which supplier is "${extracted.supplierName}"?`
          : `Supplier "${extracted.supplierName}" is not in your supplier list. Add it as a new supplier?`,
        blocking: true,
        options: [
          ...supplierCandidates.map(s => ({ label: `Use existing: ${s.name}`, value: { supplierId: s.id } })),
          { label: `Add new supplier "${extracted.supplierName}"`, value: { newSupplierName: extracted.supplierName } }
        ]
      });
    }
  } else {
    warnings.push('The supplier name could not be read from the invoice. Please select the supplier.');
  }

  // ---- Invoice number / date (never invented) ----
  const invoiceNumber = extracted.invoiceNumber ? extracted.invoiceNumber.replace(/^#/, '').trim() : null;
  if (!invoiceNumber) warnings.push('The invoice number could not be read. Please type it from the paper invoice.');
  const purchaseDate = normalizeDate(extracted.invoiceDate);
  if (!purchaseDate) warnings.push('The invoice date could not be read. Please check the purchase date.');

  let duplicatePurchase: ReviewDraft['duplicatePurchase'] = null;
  if (invoiceNumber) {
    const dup = db.prepare(`
      SELECT p.id, p.purchase_date, s.name AS supplier_name, p.supplier_id
      FROM purchases p JOIN suppliers s ON s.id = p.supplier_id
      WHERE TRIM(p.invoice_number) = ? COLLATE NOCASE
      ORDER BY p.id DESC
    `).all(invoiceNumber) as Array<{ id: number; purchase_date: string; supplier_name: string; supplier_id: number }>;
    const sameSupplier = matchedSupplierId ? dup.find(d => d.supplier_id === matchedSupplierId) : dup[0];
    if (sameSupplier) {
      duplicatePurchase = { purchaseId: sameSupplier.id, supplierName: sameSupplier.supplier_name, purchaseDate: sameSupplier.purchase_date };
      questions.push({
        id: 'q_duplicate',
        type: 'DUPLICATE_INVOICE',
        question: `Invoice #${invoiceNumber} from ${sameSupplier.supplier_name} was already entered on ${sameSupplier.purchase_date}. Saving it again would add the stock twice.`,
        blocking: true,
        options: [{ label: 'I understand - it is a different invoice, let me correct the number', value: { acknowledge: true } }]
      });
    }
  }

  // ---- Items ----
  const catalog = db.prepare(`
    SELECT id, brand_name, strength, dosage_form, packaging_type, pack_size, tablets_per_pack
    FROM medicines WHERE is_active = 1
  `).all() as Array<{ id: number; brand_name: string; strength: string | null; dosage_form: string | null; packaging_type: string | null; pack_size: number | null; tablets_per_pack: number | null }>;

  const batchLookup = db.prepare('SELECT id, quantity, expiry_date FROM batches WHERE medicine_id = ? AND batch_number = ? COLLATE NOCASE');

  const items: ReviewItem[] = [];
  for (const raw of extracted.items) {
    const reason = nonMedicineReason(raw);
    if (reason) {
      if (raw.productName) ignoredLines.push(`${raw.productName} (${reason})`);
      continue;
    }

    const invoiceName = raw.productName!;
    const productName = cleanProductName(invoiceName) || invoiceName;
    const strength = extractStrength(`${invoiceName} ${raw.packSize || ''}`);
    const dosageForm = detectDosageForm(invoiceName) || detectDosageForm(raw.packSize || '');
    const index = items.length;
    const issues: string[] = [];

    const scored = catalog
      .map(m => ({ m, score: scoreMedicineMatch({ name: invoiceName, strength, form: dosageForm }, m) }))
      .filter(x => x.score >= CANDIDATE_MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    const candidates: MedicineCandidate[] = scored.map(({ m, score }) => ({
      medicineId: m.id,
      brandName: m.brand_name,
      strength: m.strength,
      dosageForm: m.dosage_form,
      score,
      packing: catalogPacking(m)
    }));

    let matchStatus: MatchStatus;
    let matchedMedicineId: number | null = null;
    const [top, second] = candidates;
    if (top && top.score >= AUTO_MATCH_SCORE && (!second || top.score - second.score >= AUTO_MATCH_MARGIN)) {
      matchStatus = 'MATCHED';
      matchedMedicineId = top.medicineId;
    } else if (top) {
      matchStatus = 'NEEDS_REVIEW';
    } else {
      matchStatus = 'NEW';
    }

    const packagingType: 'MULTI_TIER' | 'SIMPLE' = dosageForm && SIMPLE_FORMS.has(dosageForm) ? 'SIMPLE' : (dosageForm ? 'MULTI_TIER' : 'MULTI_TIER');
    const newMedicine = {
      brandName: productName,
      strength,
      dosageForm: dosageForm || 'Tablet',
      packagingType
    };

    if (matchStatus !== 'MATCHED') {
      questions.push({
        id: `q_med_${index}`,
        type: 'MEDICINE_MATCH',
        itemIndex: index,
        question: matchStatus === 'NEEDS_REVIEW'
          ? `Line ${index + 1}: which medicine is "${invoiceName}"?`
          : `Line ${index + 1}: "${invoiceName}" is not in your medicine list. Add it as a new medicine?`,
        blocking: true,
        options: [
          ...candidates.map(c => ({
            label: `${c.brandName}${c.strength ? ` ${c.strength}` : ''}${c.dosageForm ? ` (${c.dosageForm})` : ''}`,
            value: { medicineId: c.medicineId }
          })),
          { label: `Add new medicine "${productName}${strength ? ` ${strength}` : ''}"`, value: { createNew: true } },
          { label: 'Not a medicine - remove this line', value: { skip: true } }
        ]
      });
    }

    // ---- Packing: catalog wins over invoice text; never silently assume 10x10 ----
    let blistersPerBox: number | null = null;
    let tabsPerBlister: number | null = null;
    let packingSource: ReviewItem['packingSource'] = 'UNKNOWN';
    const matched = matchedMedicineId ? candidates.find(c => c.medicineId === matchedMedicineId)! : null;
    const fromInvoice = invoicePacking(`${raw.packSize || ''} ${invoiceName}`, matched?.dosageForm ? detectDosageForm(matched.dosageForm) || dosageForm : dosageForm);

    if (matched && matched.packing.reliable) {
      blistersPerBox = matched.packing.blistersPerBox;
      tabsPerBlister = matched.packing.tabsPerBlister;
      packingSource = 'CATALOG';
      if (matched.packing.packagingType === 'SIMPLE' && matched.packing.unitsPerBox > 1) {
        // Many catalog rows carry a carton size (e.g. 10) while distributors invoice single
        // tubes/bottles. Start from what the invoice text says and make the admin confirm.
        if (fromInvoice?.certain) {
          blistersPerBox = fromInvoice.blistersPerBox;
          tabsPerBlister = fromInvoice.tabsPerBlister;
          packingSource = 'INVOICE';
        }
        questions.push({
          id: `q_qty_${index}`,
          type: 'QTY_UNIT',
          itemIndex: index,
          question: `Line ${index + 1} (${matched.brandName}): the invoice says quantity ${raw.quantity ?? '?'}. Is that boxes of ${matched.packing.unitsPerBox}, or single units?`,
          blocking: true,
          options: [
            { label: `${raw.quantity ?? '?'} boxes (${(raw.quantity || 0) * matched.packing.unitsPerBox} units)`, value: { blistersPerBox: 1, tabsPerBlister: matched.packing.unitsPerBox } },
            { label: `${raw.quantity ?? '?'} single units`, value: { blistersPerBox: 1, tabsPerBlister: 1 } }
          ]
        });
      }
    } else if (fromInvoice) {
      blistersPerBox = fromInvoice.blistersPerBox;
      tabsPerBlister = fromInvoice.tabsPerBlister;
      packingSource = 'INVOICE';
      if (!fromInvoice.certain) {
        const total = fromInvoice.blistersPerBox * fromInvoice.tabsPerBlister;
        const options: ReviewQuestion['options'] = [];
        for (const per of [10, 14, 15, 20, 7, 6]) {
          if (total % per === 0) options.push({ label: `${total / per} strips × ${per} (${total} per box)`, value: { blistersPerBox: total / per, tabsPerBlister: per } });
        }
        options.push({ label: `1 × ${total} (no strips)`, value: { blistersPerBox: 1, tabsPerBlister: total } });
        questions.push({
          id: `q_pack_${index}`,
          type: 'PACKING',
          itemIndex: index,
          question: `Line ${index + 1} (${productName}): how is one box of ${total} packed?`,
          blocking: false,
          options: options.slice(0, 4)
        });
      }
    } else {
      issues.push('Packing unknown - enter strips per box and units per strip');
    }

    // ---- Batch / expiry: required, never invented ----
    const batchNumber = raw.batchNumber ? raw.batchNumber.replace(/\s+/g, '') : null;
    const expiryDate = normalizeDate(raw.expiryDate);
    if (!batchNumber) issues.push('Batch number missing - type it from the invoice');
    if (!expiryDate) issues.push(raw.expiryDate ? `Expiry "${raw.expiryDate}" could not be read - enter it` : 'Expiry date missing - type it from the invoice');
    else if (expiryDate <= today) issues.push(`Expiry ${expiryDate} is already past - expired stock cannot be received`);

    let existingBatch: ExistingBatchInfo | null = null;
    if (matchedMedicineId && batchNumber) {
      const b = batchLookup.get(matchedMedicineId, batchNumber) as { id: number; quantity: number; expiry_date: string } | undefined;
      if (b) {
        existingBatch = { batchId: b.id, quantity: b.quantity, expiryDate: b.expiry_date, expiryConflict: !!expiryDate && b.expiry_date !== expiryDate };
        if (existingBatch.expiryConflict) {
          questions.push({
            id: `q_batch_${index}`,
            type: 'BATCH_EXPIRY_CONFLICT',
            itemIndex: index,
            question: `Line ${index + 1}: batch ${batchNumber} is already in stock with expiry ${b.expiry_date}, but this invoice says ${expiryDate}. Which is correct?`,
            blocking: true,
            options: [
              { label: `Keep stock expiry ${b.expiry_date}`, value: { expiryDate: b.expiry_date } },
              { label: `Invoice is right: ${expiryDate} (correct the stock)`, value: { expiryDate, overrideBatchExpiry: true } }
            ]
          });
        }
      }
    }

    // ---- Quantity / price sanity ----
    const bonusOnly = (raw.quantity === null || raw.quantity === 0) && (raw.bonusQuantity || 0) > 0;
    // A bonus-only line (free goods, no paid quantity) is valid: 0 paid boxes + N bonus boxes.
    const boxes = raw.quantity !== null && raw.quantity > 0 ? raw.quantity : bonusOnly ? 0 : null;
    if (boxes === null) issues.push('Quantity missing - enter boxes received');
    else if (!Number.isInteger(boxes)) issues.push(`Quantity ${boxes} is not a whole number - please check`);
    const rate = raw.rate !== null && raw.rate > 0 ? raw.rate : null;
    if (rate === null && !bonusOnly) issues.push('Rate (cost price) missing');
    if (boxes && rate && raw.lineTotal) {
      const gross = boxes * rate;
      const discounted = gross * (1 - (raw.discountPercent || 0) / 100);
      const tolerance = Math.max(2, gross * 0.03);
      if (Math.abs(gross - raw.lineTotal) > tolerance && Math.abs(discounted - raw.lineTotal) > tolerance) {
        issues.push(`Qty × rate (${gross.toFixed(2)}) does not match the line amount ${raw.lineTotal.toFixed(2)} - check quantity and rate`);
      }
    }
    if (raw.confidence !== null && raw.confidence < 0.6) issues.push('The AI was unsure about this line - compare it with the paper invoice');

    items.push({
      invoiceName,
      productName,
      strength,
      dosageForm,
      packSize: raw.packSize,
      manufacturer: raw.manufacturer,
      matchStatus,
      matchedMedicineId,
      candidates,
      newMedicine,
      batchNumber,
      expiryDate,
      mfgDate: normalizeDate(raw.mfgDate),
      boxes,
      bonusBoxes: raw.bonusQuantity && raw.bonusQuantity > 0 ? raw.bonusQuantity : 0,
      blistersPerBox,
      tabsPerBlister,
      packingSource,
      purchasePrice: rate,
      mrp: raw.mrp !== null && raw.mrp > 0 ? raw.mrp : null,
      discountPercent: raw.discountPercent,
      lineTotal: raw.lineTotal,
      confidence: raw.confidence,
      existingBatch,
      issues
    });
  }

  const calculatedTotal = Number(items.reduce((sum, it) => sum + (it.lineTotal ?? ((it.boxes || 0) * (it.purchasePrice || 0))), 0).toFixed(2));

  if (items.length === 0) {
    warnings.push('No medicine lines could be read from this invoice. Add the items manually or try a clearer, straight photo.');
  }
  if (extracted.printedItemCount && extracted.printedItemCount !== items.length) {
    questions.push({
      id: 'q_item_count',
      type: 'ITEM_COUNT',
      question: `The invoice says ${extracted.printedItemCount} item(s), but ${items.length} line(s) were read. Please compare with the paper invoice and add or remove lines.`,
      blocking: false,
      options: [{ label: 'Checked', value: { acknowledge: true } }]
    });
  }
  if (extracted.printedNetTotal && calculatedTotal > 0) {
    const diff = Math.abs(extracted.printedNetTotal - calculatedTotal);
    // Advance income tax (e.g. 0.5% u/s 236H) is legitimately added on top of the line total.
    if (diff > Math.max(5, extracted.printedNetTotal * 0.02)) {
      questions.push({
        id: 'q_total',
        type: 'TOTAL_MISMATCH',
        question: `Lines add up to Rs. ${calculatedTotal.toFixed(2)} but the invoice net total is Rs. ${extracted.printedNetTotal.toFixed(2)}. A line may be missing or misread.`,
        blocking: false,
        options: [{ label: 'Checked', value: { acknowledge: true } }]
      });
    }
  }

  return {
    extractionMethod: meta.extractionMethod,
    aiProvider: meta.aiProvider,
    supplierName: extracted.supplierName,
    matchedSupplierId,
    supplierCandidates,
    invoiceNumber,
    purchaseDate,
    printedNetTotal: extracted.printedNetTotal,
    printedItemCount: extracted.printedItemCount,
    calculatedTotal,
    duplicatePurchase,
    items,
    ignoredLines,
    questions,
    warnings,
    rawNotes: meta.rawNotes ?? null
  };
}

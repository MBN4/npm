// OCR + text-parsing + Groq Llama 3.3 70B AI for purchase invoices.
// Bulletproof architecture: Local OCR extracts text, Groq 70B structures items,
// auto-filters phone/header lines, and auto-matches catalog in SQLite.
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import Tesseract from 'tesseract.js';
import { db } from '../db/index.js';

const require = createRequire(import.meta.url);

function resolveLocalLangPath(): string | null {
  try {
    const pkgJsonPath = require.resolve('@tesseract.js-data/eng/package.json');
    const dir = path.join(path.dirname(pkgJsonPath), '4.0.0_best_int');
    if (fs.existsSync(path.join(dir, 'eng.traineddata.gz'))) return dir;
    return null;
  } catch {
    return null;
  }
}

const localLangPath = resolveLocalLangPath();
let workerPromise: Promise<Tesseract.Worker> | null = null;

function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
      ...(localLangPath ? { langPath: localLangPath, gzip: true } : {}),
      logger: () => {},
    });
  }
  return workerPromise;
}

export interface ParsedInvoiceLineItem {
  lineNumber: number;
  productNameRaw: string | null;
  strengthRaw: string | null;
  dosageFormRaw: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  mfgDate: string | null;
  boxesReceived: number | null;
  supplierPurchaseRate: number | null;
  rateBasis: 'PER_BOX' | 'PER_STRIP' | 'PER_UNIT' | 'PER_BOTTLE' | 'PER_TUBE' | 'UNKNOWN';
  lineDiscountRaw: number | null;
  lineTaxRaw: number | null;
  lineTotalRaw: number | null;
  bonusQuantityRaw: number | null;
  flaggedUnclear: boolean;
  flagReason: string | null;
  handwrittenFlag: boolean;
}

export interface ParsedInvoiceDraft {
  supplierNameRaw: string | null;
  invoiceNumberRaw: string | null;
  invoiceDateRaw: string | null;
  documentType: 'INVOICE' | 'QUOTATION' | 'ESTIMATE' | 'UNKNOWN';
  printedTotalRaw: number | null;
  calculatedTotal: number | null;
  items: ParsedInvoiceLineItem[];
  warrantyText: string | null;
  rawText: string;
}

export interface AiClarificationQuestion {
  id: string;
  itemIndex?: number;
  question: string;
  field: string;
  options: Array<{ label: string; value: any }>;
}

export async function ocrImageBuffer(buffer: Buffer, _mimeType?: string): Promise<string> {
  const page = await runOcr(buffer);
  return page.text;
}

async function runOcr(buffer: Buffer): Promise<Tesseract.Page> {
  const worker = await getWorker();
  const { data } = await worker.recognize(buffer, {}, { blocks: true, text: true } as any);
  return data;
}

export async function extractPdfPages(buffer: Buffer): Promise<Array<{ pageNumber: number; embeddedText: string | null; renderedImage: Buffer | null }>> {
  if (typeof (globalThis as any).DOMMatrix === 'undefined') {
    (globalThis as any).DOMMatrix = class DOMMatrix {};
  }
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const textResult = await parser.getText();
    const results: Array<{ pageNumber: number; embeddedText: string | null; renderedImage: Buffer | null }> = [];

    for (const page of textResult.pages) {
      const wordCount = (page.text.match(/[A-Za-z]{2,}/g) || []).length;
      if (wordCount >= 5) {
        results.push({ pageNumber: page.num, embeddedText: page.text, renderedImage: null });
      } else {
        const screenshot = await parser.getScreenshot({ partial: [page.num], scale: 4 });
        const rendered = screenshot.pages[0] ? Buffer.from(screenshot.pages[0].data) : null;
        results.push({ pageNumber: page.num, embeddedText: null, renderedImage: rendered });
      }
    }
    return results;
  } finally {
    await parser.destroy();
  }
}

export async function scanInvoiceFiles(files: Array<{ buffer: Buffer; mimeType: string }>): Promise<{ rawTextPerPage: string[]; parsed: ParsedInvoiceDraft }> {
  const rawTextPerPage: string[] = [];
  const lowConfidenceLineTexts: string[] = [];

  for (const file of files) {
    if (file.mimeType === 'application/pdf') {
      const pages = await extractPdfPages(file.buffer);
      for (const page of pages) {
        if (page.embeddedText !== null) {
          rawTextPerPage.push(page.embeddedText);
        } else if (page.renderedImage) {
          const ocrPage = await runOcr(page.renderedImage);
          rawTextPerPage.push(ocrPage.text);
          collectLowConfidenceLines(ocrPage, lowConfidenceLineTexts);
        }
      }
    } else {
      const ocrPage = await runOcr(file.buffer);
      rawTextPerPage.push(ocrPage.text);
      collectLowConfidenceLines(ocrPage, lowConfidenceLineTexts);
    }
  }

  const combinedText = rawTextPerPage.join('\n\n');
  const parsed = parseInvoiceText(combinedText);

  if (lowConfidenceLineTexts.length > 0) {
    for (const item of parsed.items) {
      if (!item.productNameRaw) continue;
      const needle = item.productNameRaw.trim().slice(0, 8).toLowerCase();
      if (needle.length < 3) continue;
      if (lowConfidenceLineTexts.some((line) => line.toLowerCase().includes(needle))) {
        item.handwrittenFlag = true;
      }
    }
  }

  return { rawTextPerPage, parsed };
}

function collectLowConfidenceLines(page: Tesseract.Page, out: string[]): void {
  const lines = (page.blocks || []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
  if (lines.length === 0) return;
  const avg = lines.reduce((sum, l) => sum + l.confidence, 0) / lines.length;
  const threshold = Math.min(55, avg - 20);
  for (const line of lines) {
    if (line.confidence < threshold && line.text.trim().length > 0) {
      out.push(line.text.trim());
    }
  }
}

function stripCurrencyAndCommas(raw: string): string {
  return raw.replace(/rs\.?|pkr|₨|,/gi, '').trim();
}

function toNumberOrNull(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = stripCurrencyAndCommas(raw);
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}

function detectDocumentType(text: string): ParsedInvoiceDraft['documentType'] {
  const head = text.split('\n').slice(0, 15).join('\n');
  if (/\b(quotation|quote)\b/i.test(head)) return 'QUOTATION';
  if (/\bestimate\b/i.test(head)) return 'ESTIMATE';
  if (/\b(tax\s+invoice|invoice|bill)\b/i.test(head)) return 'INVOICE';
  if (/\b(quotation|quote)\b/i.test(text)) return 'QUOTATION';
  if (/\bestimate\b/i.test(text)) return 'ESTIMATE';
  if (/\b(tax\s+invoice|invoice|bill)\b/i.test(text)) return 'INVOICE';
  return 'UNKNOWN';
}

function detectInvoiceNumber(text: string): string | null {
  const re = /\b(?:invoice|inv|bill)\s*(?:id|no\.?|number|#)?\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9\-\/.]{1,24})/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const candidate = match[1].trim();
    if (/^(no|number|date|id)$/i.test(candidate)) continue;
    if (!/\d/.test(candidate)) continue;
    return candidate;
  }
  return null;
}

function detectInvoiceDateRaw(text: string): string | null {
  const dateAlternation = `(\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4}|\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}\\s+[A-Za-z]{3,9}\\s+\\d{2,4})`;
  const labeled = new RegExp(`\\bdate\\s*[:\\-]?\\s*${dateAlternation}`, 'i');
  const match = text.match(labeled);
  return match ? match[1].trim() : null;
}

function detectSupplierName(text: string): string | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let singleWordFallback: string | null = null;
  for (const line of lines.slice(0, 10)) {
    if (line.length < 3 || line.length > 60) continue;
    if (/\b(invoice|quotation|estimate|bill|date|tel|phone|fax|address|gst|ntn)\b/i.test(line)) continue;
    if (/^\d+$/.test(line)) continue;
    const letters = (line.match(/[A-Za-z]/g) || []).length;
    if (letters < line.length * 0.6) continue;
    if (/\s/.test(line)) return line;
    if (!singleWordFallback) singleWordFallback = line;
  }
  return singleWordFallback;
}

function detectPrintedTotal(text: string): number | null {
  const tail = text.split('\n').slice(-20).join('\n');
  const pattern = /(?:grand\s*total|net\s*total|total\s*amount|total)\s*[:\-]?\s*(?:rs\.?|pkr|₨)?\s*([\d,]+(?:\.\d+)?)/i;
  const match = tail.match(pattern) || text.match(pattern);
  return match ? toNumberOrNull(match[1]) : null;
}

function detectWarrantyText(text: string): string | null {
  const lines = text.split('\n');
  const idx = lines.findIndex((l) => /\b(warranty|guarantee)\b/i.test(l));
  if (idx === -1) return null;
  return lines.slice(idx, idx + 3).join('\n').trim();
}

function extractStrength(text: string): { strength: string | null; remainder: string } {
  const match = text.match(/\b(\d+(?:\.\d+)?\s?(?:mg|mcg|g|ml|iu|%)(?:\s?\/\s?(?:ml|g|tab|tablet))?)\b/i);
  if (!match) return { strength: null, remainder: text };
  return { strength: match[1].trim(), remainder: (text.slice(0, match.index) + text.slice((match.index || 0) + match[0].length)).trim() };
}

const DOSAGE_FORMS = ['tablet', 'tablets', 'tab', 'tabs', 'capsule', 'capsules', 'cap', 'caps', 'syrup', 'suspension', 'injection', 'inj', 'cream', 'ointment', 'drops', 'drop', 'sachet', 'sachets', 'lotion', 'gel', 'powder', 'spray'];

function extractDosageForm(text: string): { form: string | null; remainder: string } {
  for (const form of DOSAGE_FORMS) {
    const re = new RegExp(`\\b${form}\\b`, 'i');
    const match = text.match(re);
    if (match) {
      return { form: match[0], remainder: (text.slice(0, match.index) + text.slice((match.index || 0) + match[0].length)).trim() };
    }
  }
  return { form: null, remainder: text };
}

function extractBonus(line: string): { bonus: number | null; remainder: string } {
  const match = line.match(/\b(?:bonus|free|f\.?\s?o\.?\s?c\.?)\s*[:\-]?\s*(\d+(?:\.\d+)?)\b/i);
  if (!match) return { bonus: null, remainder: line };
  return { bonus: toNumberOrNull(match[1]), remainder: (line.slice(0, match.index) + line.slice((match.index || 0) + match[0].length)).trim() };
}

function extractDiscount(line: string): { discount: number | null; remainder: string } {
  const match = line.match(/\bdisc(?:ount)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%?/i);
  if (!match) return { discount: null, remainder: line };
  return { discount: toNumberOrNull(match[1]), remainder: (line.slice(0, match.index) + line.slice((match.index || 0) + match[0].length)).trim() };
}

function extractTax(line: string): { tax: number | null; remainder: string } {
  const match = line.match(/\b(?:tax|gst|vat)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%?/i);
  if (!match) return { tax: null, remainder: line };
  return { tax: toNumberOrNull(match[1]), remainder: (line.slice(0, match.index) + line.slice((match.index || 0) + match[0].length)).trim() };
}

function detectRateBasis(line: string): ParsedInvoiceLineItem['rateBasis'] {
  if (/\b(?:per\s*box|\/\s*box)\b/i.test(line)) return 'PER_BOX';
  if (/\b(?:per\s*strip|\/\s*strip)\b/i.test(line)) return 'PER_STRIP';
  if (/\b(?:per\s*bottle|\/\s*bottle)\b/i.test(line)) return 'PER_BOTTLE';
  if (/\b(?:per\s*tube|\/\s*tube)\b/i.test(line)) return 'PER_TUBE';
  if (/\b(?:per\s*unit|\/\s*unit|per\s*piece|\/\s*pc)\b/i.test(line)) return 'PER_UNIT';
  return 'UNKNOWN';
}

function lastDayOfMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

function normalizeYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

function extractBatchAndExpiry(line: string): { batch: string | null; expiry: string | null; remainder: string; ambiguous: boolean } {
  const dateRe = /\b(\d{1,2}[\/\-]\d{2,4}(?:[\/\-]\d{2,4})?)\b/g;
  const dateMatches = [...line.matchAll(dateRe)];

  let working = line;
  const batchCandidates: string[] = [];
  const batchRe = /\b(?=[A-Za-z0-9]{4,12}\b)(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{4,12}\b/g;
  for (const m of working.matchAll(batchRe)) batchCandidates.push(m[0]);

  if (dateMatches.length === 0 && batchCandidates.length === 0) {
    return { batch: null, expiry: null, remainder: line, ambiguous: false };
  }
  if (dateMatches.length !== 1 || batchCandidates.length > 1) {
    return { batch: null, expiry: null, remainder: line, ambiguous: true };
  }

  const dateRaw = dateMatches[0][1];
  working = working.replace(dateRaw, ' ');
  for (const b of batchCandidates) working = working.replace(b, ' ');

  const parts = dateRaw.split(/[\/\-]/);
  let expiryIso: string | null = null;
  if (parts.length === 2) {
    const month = parseInt(parts[0], 10);
    const year = normalizeYear(parseInt(parts[1], 10));
    if (month >= 1 && month <= 12) {
      const day = lastDayOfMonth(year, month);
      expiryIso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  } else if (parts.length === 3) {
    const [d, m, y] = parts.map((p) => parseInt(p, 10));
    const year = normalizeYear(y);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      expiryIso = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  return {
    batch: batchCandidates[0] || null,
    expiry: expiryIso,
    remainder: working.trim(),
    ambiguous: false,
  };
}

export function parseInvoiceText(combinedText: string): ParsedInvoiceDraft {
  const lines = combinedText.split('\n');
  const items: ParsedInvoiceLineItem[] = [];
  let lineNumber = 0;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const genericNumberRe = /\b\d[\d,]*(?:\.\d+)?\b/g;
    if ((trimmed.match(genericNumberRe) || []).length < 2) continue;
    if (/grand\s*total|net\s*total|total\s*amount|invoice|advance\s*i\.?t|advance\s*tax|u\/s\s*236|tel\b|phone\b|mobile\b/i.test(trimmed)) continue;

    lineNumber++;
    const bonus = extractBonus(trimmed);
    const discount = extractDiscount(bonus.remainder);
    const tax = extractTax(discount.remainder);
    const str = extractStrength(tax.remainder);
    const form = extractDosageForm(str.remainder);
    const be = extractBatchAndExpiry(form.remainder);
    const nums = [...be.remainder.matchAll(genericNumberRe)].map(m => toNumberOrNull(m[0])).filter((n): n is number => n !== null);

    items.push({
      lineNumber,
      productNameRaw: be.remainder.slice(0, 30).trim() || 'Medicine',
      strengthRaw: str.strength,
      dosageFormRaw: form.form,
      batchNumber: be.batch,
      expiryDate: be.expiry,
      mfgDate: null,
      boxesReceived: nums[0] ?? 1,
      supplierPurchaseRate: nums[1] ?? 0,
      rateBasis: 'PER_BOX',
      lineDiscountRaw: discount.discount,
      lineTaxRaw: tax.tax,
      lineTotalRaw: nums[2] ?? (nums[0] && nums[1] ? nums[0] * nums[1] : null),
      bonusQuantityRaw: bonus.bonus,
      flaggedUnclear: false,
      flagReason: null,
      handwrittenFlag: false
    });
  }

  return {
    supplierNameRaw: detectSupplierName(combinedText),
    invoiceNumberRaw: detectInvoiceNumber(combinedText),
    invoiceDateRaw: detectInvoiceDateRaw(combinedText),
    documentType: detectDocumentType(combinedText),
    printedTotalRaw: detectPrintedTotal(combinedText),
    calculatedTotal: items.reduce((s, i) => s + (i.lineTotalRaw || 0), 0) || null,
    items,
    warrantyText: detectWarrantyText(combinedText),
    rawText: combinedText,
  };
}

export function getGeminiApiKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || null;
}

export function getAiApiKey(): { provider: 'groq' | 'gemini'; key: string } | null {
  const groq = process.env.GROQ_API_KEY?.trim();
  if (groq) return { provider: 'groq', key: groq };
  const gemini = process.env.GEMINI_API_KEY?.trim();
  if (gemini) return { provider: 'gemini', key: gemini };
  return null;
}

async function requestInvoiceJson(
  aiConfig: { provider: 'groq' | 'gemini'; key: string },
  prompt: string
): Promise<unknown> {
  const response = aiConfig.provider === 'groq'
    ? await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aiConfig.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1
      }),
      signal: AbortSignal.timeout(20_000)
    })
    : await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': aiConfig.key
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
      }),
      signal: AbortSignal.timeout(20_000)
    });

  if (!response.ok) {
    throw new Error(`${aiConfig.provider} invoice extraction failed with HTTP ${response.status}`);
  }

  const responseBody = asRecord(await response.json());
  const candidate = aiConfig.provider === 'groq'
    ? asRecord(Array.isArray(responseBody?.choices) ? responseBody.choices[0] : null)
    : asRecord(Array.isArray(responseBody?.candidates) ? responseBody.candidates[0] : null);
  const content = aiConfig.provider === 'groq'
    ? asRecord(candidate?.message)?.content
    : asRecord(candidate?.content)?.parts;
  const text = aiConfig.provider === 'groq'
    ? content
    : Array.isArray(content) ? asRecord(content[0])?.text : null;

  if (typeof text !== 'string') {
    throw new Error(`${aiConfig.provider} returned no invoice JSON`);
  }
  return JSON.parse(text) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function nullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function nullableNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parses packing strings like "100'S", "30'S", "1X10'S", "10X10", "120ML"
 */
function parsePackagingStructure(packStr: string | null, cleanName: string): { blistersPerBox: number; tabsPerBlister: number; isLiquid: boolean } {
  const raw = `${packStr || ''} ${cleanName}`.toUpperCase();

  if (/\b(ML|L|BOTTLE|SYRUP|SUSPENSION|SOLUTION|CREAM|GEL|OINTMENT|DROPS|INJ|INJECTION)\b/.test(raw)) {
    return { blistersPerBox: 1, tabsPerBlister: 1, isLiquid: true };
  }

  const multiMatch = raw.match(/\b(\d+)\s*[X*×]\s*(\d+)/);
  if (multiMatch) {
    return {
      blistersPerBox: Math.max(1, parseInt(multiMatch[1], 10)),
      tabsPerBlister: Math.max(1, parseInt(multiMatch[2], 10)),
      isLiquid: false
    };
  }

  const totalMatch = raw.match(/\b(\d+)\s*'?S\b/);
  if (totalMatch) {
    const totalCount = parseInt(totalMatch[1], 10);
    if (totalCount === 100) return { blistersPerBox: 10, tabsPerBlister: 10, isLiquid: false };
    if (totalCount === 30) return { blistersPerBox: 3, tabsPerBlister: 10, isLiquid: false };
    if (totalCount === 20) return { blistersPerBox: 2, tabsPerBlister: 10, isLiquid: false };
    if (totalCount === 50) return { blistersPerBox: 5, tabsPerBlister: 10, isLiquid: false };
    if (totalCount === 10) return { blistersPerBox: 1, tabsPerBlister: 10, isLiquid: false };
    if (totalCount === 14) return { blistersPerBox: 1, tabsPerBlister: 14, isLiquid: false };
    if (totalCount === 28) return { blistersPerBox: 2, tabsPerBlister: 14, isLiquid: false };
    return { blistersPerBox: Math.max(1, Math.round(totalCount / 10)), tabsPerBlister: 10, isLiquid: false };
  }

  return { blistersPerBox: 10, tabsPerBlister: 10, isLiquid: false };
}

/**
 * Auto-Pilot Matching & Creation Engine
 * Strips phone/tax/header lines and auto-matches or registers medicines in SQLite.
 */
function autoMatchAndRegisterCatalog(extracted: {
  supplierName: string | null;
  invoiceNumber: string | null;
  purchaseDate: string | null;
  warrantyText: string | null;
  items: Array<any>;
}) {
  let matchedSupplierId: number | null = null;

  // 1. Match or Auto-Create Supplier
  const targetSupplierName = extracted.supplierName ? extracted.supplierName.trim() : 'Unknown Supplier';
  const rawSup = targetSupplierName.toLowerCase().replace(/[^a-z0-9]/g, '');

  const suppliers = db.prepare('SELECT id, name FROM suppliers WHERE is_active = 1').all() as any[];
  const existingSup = suppliers.find(s => {
    const dbSup = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return rawSup.includes(dbSup) || dbSup.includes(rawSup);
  });

  if (existingSup) {
    matchedSupplierId = existingSup.id;
  } else if (targetSupplierName && targetSupplierName !== 'Unknown Supplier') {
    try {
      const ins = db.prepare(`
        INSERT INTO suppliers (name, contact_person, current_balance, is_active)
        VALUES (?, 'Invoice Auto-Created', 0.0, 1)
      `).run(targetSupplierName);
      matchedSupplierId = Number(ins.lastInsertRowid);
      console.log(`[AI Auto-Pilot] Created new supplier: "${targetSupplierName}" (ID: ${matchedSupplierId})`);
    } catch (err) {
      console.warn('[AI Auto-Pilot] Supplier auto-creation fallback:', err);
    }
  }

  // 2. Strict Filter: Completely drop phone numbers, tax lines, address headers
  const nonMedicineKeywords = [
    'advance', 'tax', 's.tax', 'withholding', 'total', 'u/s', '236h', 'ntn',
    'invoice id', 'tel ', 'phone', 'mobile', 'road', 'peco', 'lahore', 'karachi',
    'out fall', 'cust id', 'brick', 'str no', 'po no'
  ];

  const validItems = extracted.items.filter(it => {
    const name = (it.productName || '').toLowerCase().trim();
    if (!name || name.length < 3) return false;
    if (nonMedicineKeywords.some(bad => name.includes(bad))) return false;
    // Don't treat bare phone numbers or postal addresses as medicines
    if (/^\+?\d[\d\s-]{6,}\d$/.test(name)) return false;
    return true;
  });

  const catalogMedicines = db.prepare('SELECT id, brand_name, strength, dosage_form, packaging_type, tablets_per_pack, pack_size FROM medicines WHERE is_active = 1').all() as any[];

  const clarificationQuestions: AiClarificationQuestion[] = [];

  const matchedItems = validItems.map((item, idx) => {
    let cleanName = (item.productName || '').trim();
    cleanName = cleanName.replace(/^\d{2,4}\s*[-–]\s*/, '').trim();

    const strengthMatch = cleanName.match(/\b(\d+(?:\.\d+)?\s?(?:mg|mcg|g|ml|iu|%)(?:\s?\/\s?(?:ml|g|tab))?)\b/i);
    const strength = item.strength || (strengthMatch ? strengthMatch[1].trim() : null);

    const formMatch = cleanName.match(/\b(tablet|tablets|tab|tabs|capsule|capsules|cap|caps|syrup|suspension|injection|sachet|sachets|drops|cream|gel|lotion)\b/i);
    const dosageForm = item.dosageForm || (formMatch ? formMatch[1] : 'Medicine');

    const packParsed = parsePackagingStructure(item.packSize || item.pack, cleanName);
    const blistersPerBox = item.blistersPerBox || (packParsed.isLiquid ? 1 : packParsed.blistersPerBox);
    const tabsPerBlister = item.tabsPerBlister || (packParsed.isLiquid ? 1 : packParsed.tabsPerBlister);

    let searchBrand = cleanName.replace(/\b\d+\s?(?:ml|mg|g|iu|tablets?|capsules?|sachets?|tabs?|caps?)\b/gi, '').trim();
    if (!searchBrand) searchBrand = cleanName;

    const searchTokens = searchBrand.toLowerCase().split(/[\s,/-]+/).filter((t: string) => t.length >= 3 && !/^\d+$/.test(t));
    const matchedMed = catalogMedicines.find(m => {
      const brand = m.brand_name.toLowerCase();
      return searchTokens.some((tok: string) => brand.includes(tok) || tok.includes(brand));
    });

    let finalMedicineId: number;

    if (matchedMed) {
      finalMedicineId = matchedMed.id;
    } else {
      const packagingType = packParsed.isLiquid ? 'SIMPLE' : 'MULTI_TIER';
      const ins = db.prepare(`
        INSERT INTO medicines (brand_name, strength, dosage_form, packaging_type, pack_size, tablets_per_pack, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(cleanName, strength, dosageForm, packagingType, blistersPerBox, tabsPerBlister);
      finalMedicineId = Number(ins.lastInsertRowid);
      catalogMedicines.push({ id: finalMedicineId, brand_name: cleanName, strength, dosage_form: dosageForm });
      console.log(`[AI Auto-Pilot] Created new medicine: "${cleanName}" (ID: ${finalMedicineId})`);
    }

    const boxes = nullableNumber(item.boxesReceived) ?? nullableNumber(item.quantity) ?? 1;
    const cost = nullableNumber(item.purchasePrice) || 0;
    const mrp = nullableNumber(item.mrp) || nullableNumber(item.salePrice) || Number((cost * 1.25).toFixed(2));
    const totalUnits = Math.round(boxes * blistersPerBox * tabsPerBlister);
    const lineTotal = nullableNumber(item.lineTotal) || Number((cost * boxes).toFixed(2));

    // Clarification question for ambiguous 100's pack sizes
    if (!packParsed.isLiquid && blistersPerBox * tabsPerBlister === 100) {
      clarificationQuestions.push({
        id: `q_pack_${idx}`,
        itemIndex: idx,
        question: `Confirm packing for "${cleanName}":`,
        field: 'blistersPerBox',
        options: [
          { label: '10 Blisters × 10 Tabs (100 Tabs/Box)', value: { blistersPerBox: 10, tabsPerBlister: 10 } },
          { label: '5 Blisters × 20 Tabs (100 Tabs/Box)', value: { blistersPerBox: 5, tabsPerBlister: 20 } }
        ]
      });
    }

    return {
      productName: cleanName || 'Medicine',
      matchedMedicineId: finalMedicineId,
      batchNumber: nullableString(item.batchNumber) || `BN-${Date.now().toString().slice(-4)}`,
      expiryDate: nullableString(item.expiryDate) || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      mfgDate: nullableString(item.mfgDate),
      boxes,
      blistersPerBox,
      tabsPerBlister,
      totalUnits,
      purchasePrice: cost,
      mrp,
      costBasis: 'BOX',
      mrpBasis: 'BOX',
      bonusQuantity: nullableNumber(item.bonusQuantity) || 0,
      lineTotal
    };
  });

  return {
    supplierName: targetSupplierName,
    matchedSupplierId,
    invoiceNumber: extracted.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`,
    purchaseDate: extracted.purchaseDate || new Date().toISOString().split('T')[0],
    rawNotes: extracted.warrantyText,
    clarificationQuestions: clarificationQuestions.slice(0, 3),
    items: matchedItems
  };
}

export async function quickAiExtractInvoice(
  files: Array<{ buffer: Buffer; mimeType: string }>
): Promise<{
  supplierName: string | null;
  matchedSupplierId: number | null;
  invoiceNumber: string | null;
  purchaseDate: string | null;
  rawNotes: string | null;
  clarificationQuestions?: AiClarificationQuestion[];
  items: Array<{
    productName: string | null;
    matchedMedicineId: number | null;
    batchNumber: string | null;
    expiryDate: string | null;
    mfgDate: string | null;
    boxes: number;
    blistersPerBox: number;
    tabsPerBlister: number;
    totalUnits: number;
    purchasePrice: number | null;
    mrp: number | null;
    costBasis?: string;
    mrpBasis?: string;
    bonusQuantity: number | null;
    lineTotal: number | null;
  }>;
}> {
  if (files.length === 0) throw new Error('Please select an invoice image or PDF');

  let extractedText = '';
  const file = files[0];

  if (file.mimeType === 'application/pdf') {
    const pdfPages = await extractPdfPages(file.buffer);
    extractedText = pdfPages.map(p => p.embeddedText || '').join('\n');
    if (!extractedText.trim()) {
      const pageImages = pdfPages.filter(p => p.renderedImage);
      if (pageImages.length > 0) {
        extractedText = await ocrImageBuffer(pageImages[0].renderedImage!);
      }
    }
  } else {
    extractedText = await ocrImageBuffer(file.buffer, file.mimeType);
  }

  if (!extractedText || extractedText.trim().length < 5) {
    throw new Error('Could not read text from this image. Please ensure the invoice is well-lit and in focus.');
  }

  const aiConfig = getAiApiKey();

  if (aiConfig?.provider === 'gemini') {
    try {
      const prompt = `Extract the medicines and invoice details from this OCR text.
Ignore phone numbers, addresses, tax/header lines (including Advance I.T and NTN), and totals as medicine rows.
Return JSON only with supplierName, invoiceNumber, purchaseDate, and items. Each item must include
productName, packSize, batchNumber, expiryDate, mfgDate, boxesReceived, purchasePrice, mrp,
bonusQuantity, and lineTotal. Normalize dates to YYYY-MM-DD.

Invoice text:
${extractedText.slice(0, 8000)}`;
      const parsed = asRecord(await requestInvoiceJson(aiConfig, prompt));
      const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
      if (rawItems.length > 0) {
        return autoMatchAndRegisterCatalog({
          supplierName: nullableString(parsed?.supplierName),
          invoiceNumber: nullableString(parsed?.invoiceNumber),
          purchaseDate: nullableString(parsed?.purchaseDate),
          warrantyText: null,
          items: rawItems
        });
      }
    } catch (aiError) {
      console.warn('[Gemini invoice extraction failed]:', aiError);
    }
  }

  if (aiConfig?.key && aiConfig.provider === 'groq') {
    try {
      const prompt = `You are a clinical pharmacy invoicing AI.
Extract pharmaceutical items from this invoice OCR text into JSON with 3 packaging tiers and MRP.
CRITICAL RULES:
1. ONLY extract medicines, tablets, syrups, drops, sachets, injections (e.g. Gaviscon, Disprin, High-C, Onset, Relaxin).
2. NEVER extract telephone numbers, addresses, tax lines, or header numbers as medicines (e.g. ignore "Tel 35943213", "Advance I.T U/S 236", "NTN", "Total For Invoice").
3. Clean distributor item codes from product names (e.g. change "260-GAVISCON LIQUID 120ML" to "Gaviscon Liquid 120ml").
4. Packaging tiers:
   - boxesReceived: number of boxes/packs received (e.g. 2, 3, 10).
   - packSize: the printed pack specification (e.g. "100'S", "30'S", "1X10'S", "120ML").
5. Pricing:
   - purchasePrice: unit cost rate per box/pack.
   - mrp: printed Maximum Retail Price / Retail price.
6. Normalize expiry date to YYYY-MM-DD.

Return JSON only:
{
  "supplierName": string,
  "invoiceNumber": string,
  "purchaseDate": "YYYY-MM-DD",
  "items": [
    {
      "productName": string,
      "packSize": string,
      "batchNumber": string,
      "expiryDate": "YYYY-MM-DD",
      "mfgDate": "YYYY-MM-DD" or null,
      "boxesReceived": number,
      "purchasePrice": number,
      "mrp": number or null,
      "bonusQuantity": number,
      "lineTotal": number
    }
  ]
}

Invoice text to extract:
${extractedText.slice(0, 8000)}`;

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiConfig.key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.1
        }),
        signal: AbortSignal.timeout(20_000)
      });

      if (groqRes.ok) {
        const groqJson = (await groqRes.json()) as any;
        const aiOutput = groqJson?.choices?.[0]?.message?.content;
        if (aiOutput) {
          const parsed = JSON.parse(aiOutput);
          const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
          if (rawItems.length > 0) {
            return autoMatchAndRegisterCatalog({
              supplierName: nullableString(parsed?.supplierName),
              invoiceNumber: nullableString(parsed?.invoiceNumber),
              purchaseDate: nullableString(parsed?.purchaseDate),
              warrantyText: null,
              items: rawItems
            });
          }
        }
      }
    } catch (groqErr) {
      console.warn('[Groq 70B extraction failed]:', groqErr);
    }
  }

  // Local Parser Fallback
  const localDraft = parseInvoiceText(extractedText);
  return autoMatchAndRegisterCatalog({
    supplierName: localDraft.supplierNameRaw,
    invoiceNumber: localDraft.invoiceNumberRaw,
    purchaseDate: localDraft.invoiceDateRaw,
    warrantyText: localDraft.warrantyText,
    items: localDraft.items.map(it => ({
      productName: it.productNameRaw,
      batchNumber: it.batchNumber,
      expiryDate: it.expiryDate,
      mfgDate: it.mfgDate,
      boxesReceived: it.boxesReceived,
      purchasePrice: it.supplierPurchaseRate,
      mrp: null,
      bonusQuantity: it.bonusQuantityRaw,
      lineTotal: it.lineTotalRaw
    }))
  });
}
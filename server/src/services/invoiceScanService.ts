// OCR + text parsing + AI extraction for purchase invoices.
// Pipeline: AI vision reads the photo directly (Groq or Gemini) -> if that fails, local OCR text is
// structured by the AI text model -> if no AI is configured or it fails, the local parser runs.
// Extraction never writes to the database; see invoiceReviewService.ts for matching/questions.
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import Tesseract from 'tesseract.js';
import { buildReviewDraft, normalizeAiInvoice, RawExtractedInvoice, ReviewDraft } from './invoiceReviewService.js';

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
let workerIdleTimer: NodeJS.Timeout | null = null;
let activeOcrJobs = 0;
// The OCR engine holds ~150MB+ while loaded. The hosted server runs on a small VM, so release it
// after a quiet spell instead of keeping it resident forever next to the rest of the app.
const WORKER_IDLE_MS = 2 * 60 * 1000;

function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
      ...(localLangPath ? { langPath: localLangPath, gzip: true } : {}),
      logger: () => {},
    });
    // A failed start-up must not poison every later scan with the same rejected promise.
    workerPromise.catch(() => { workerPromise = null; });
  }
  return workerPromise;
}

function scheduleWorkerShutdown(): void {
  if (workerIdleTimer) clearTimeout(workerIdleTimer);
  workerIdleTimer = setTimeout(() => {
    workerIdleTimer = null;
    if (activeOcrJobs > 0 || !workerPromise) return;
    const pending = workerPromise;
    workerPromise = null;
    pending.then(w => w.terminate()).catch(() => {});
  }, WORKER_IDLE_MS);
  workerIdleTimer.unref?.();
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
  activeOcrJobs++;
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(buffer, {}, { blocks: true, text: true } as any);
    return data;
  } finally {
    activeOcrJobs--;
    scheduleWorkerShutdown();
  }
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


// ---------------------------------------------------------------------------------------------
// AI extraction (Groq or Gemini). Keys are read from the server environment only.
// ---------------------------------------------------------------------------------------------

export type AiProvider = 'groq' | 'gemini';

export function getGeminiApiKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || null;
}

export function getAiApiKey(): { provider: AiProvider; key: string } | null {
  const groq = process.env.GROQ_API_KEY?.trim();
  if (groq) return { provider: 'groq', key: groq };
  const gemini = process.env.GEMINI_API_KEY?.trim();
  if (gemini) return { provider: 'gemini', key: gemini };
  return null;
}

// Model names are configurable because providers retire models; the defaults are current ones.
export function getAiModels(provider: AiProvider): { vision: string; text: string } {
  if (provider === 'groq') {
    return {
      vision: process.env.GROQ_VISION_MODEL?.trim() || 'meta-llama/llama-4-scout-17b-16e-instruct',
      text: process.env.GROQ_TEXT_MODEL?.trim() || 'llama-3.3-70b-versatile'
    };
  }
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
  return { vision: model, text: model };
}

const INVOICE_JSON_SHAPE = `{
  "supplierName": string | null,        // the distributor that issued the invoice (top of the page)
  "invoiceNumber": string | null,       // the value after "Invoice #" / "Invoice No" ONLY (not Sale Order, not DSS Id)
  "invoiceDate": string | null,         // invoice date exactly as printed, e.g. "09/11/2026"
  "printedNetTotal": number | null,     // "Net Total" / "Grand Total" amount
  "printedItemCount": number | null,    // "Total Items : N" if printed
  "items": [
    {
      "productName": string,            // item name exactly as printed, e.g. "007/Clobevate Cream 1x20G 20gm"
      "packSize": string | null,        // pack text if printed separately, e.g. "1x10'S", "100'S", "120ML"
      "manufacturer": string | null,    // company group heading above the item, e.g. "GSK"
      "batchNumber": string | null,     // Batch No. column
      "expiryDate": string | null,      // Expiry column exactly as printed, e.g. "31/07/2028" or "07/2028"
      "mfgDate": string | null,
      "quantity": number | null,        // Qty column (number of packs/boxes invoiced)
      "bonusQuantity": number | null,   // Bonus column (free packs), null if "-" or blank
      "rate": number | null,            // Rate / trade price per pack
      "discountPercent": number | null, // Disc % column
      "lineTotal": number | null,       // Net Amount of that line
      "mrp": number | null,             // retail price / MRP ONLY if a separate column prints it
      "confidence": number              // 0..1, how sure you are that this row was read correctly
    }
  ]
}`;

const EXTRACTION_RULES = `You read Pakistani pharmaceutical distributor sale invoices (e.g. "Sale Invoice" printed by
distribution software) for a pharmacy's stock receiving screen. Accuracy matters more than completeness:
the pharmacy admin will review every value, so NEVER guess.

Rules:
1. Items are ONLY the rows of the product table, between the column header row
   (Sr. / Item Name / Batch No. / Expiry Date / Qty / Bonus / Rate / Gross / Disc / Net Amount) and the
   "Total For Invoice" line. Everything else is NOT an item.
2. NEVER return these as items: Invoice #, Sale Order #, DSS Id, Booking Man, Delivery Man, Due Date,
   Reference No, Customer, Region, Phone, Address, Plot/Street, License, NTN, GST, CNIC, Filer, MOP, SPO,
   Ship To, Remarks, company group headings like "33 / GSK", "Total For ...", Gross Amount, Discount Amount,
   Advance WHTax, Sub Total, Net Total, warranty text, "Printed By", software footer.
3. Copy batch numbers and dates character-for-character. If a value is unreadable, blurred or absent,
   return null for it. Do not invent batch numbers, expiry dates, quantities or prices.
4. Numbers must be plain numbers (no commas, no "Rs").
5. If the page has no product rows you can read, return "items": [].
Return ONLY a JSON object with this shape:
${INVOICE_JSON_SHAPE}`;

function stripJsonFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

type AiImage = { base64: string; mimeType: string };

async function callGroq(key: string, model: string, content: unknown, jsonMode: boolean): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      temperature: 0,
      max_completion_tokens: 4096
    }),
    signal: AbortSignal.timeout(45_000)
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    throw Object.assign(new Error(`Groq ${model} failed with HTTP ${res.status}${detail ? `: ${detail}` : ''}`), { status: res.status });
  }
  const body = (await res.json()) as any;
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error(`Groq ${model} returned an empty answer`);
  return text;
}

async function callGemini(key: string, model: string, parts: unknown[]): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 }
    }),
    signal: AbortSignal.timeout(45_000)
  });
  if (!res.ok) throw new Error(`Gemini ${model} failed with HTTP ${res.status}`);
  const body = (await res.json()) as any;
  const text = (body?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').join('');
  if (!text.trim()) throw new Error(`Gemini ${model} returned an empty answer`);
  return text;
}

// ---- Groq model discovery -------------------------------------------------------------------
// Groq retires model names regularly, and not every key can use every model. Instead of trusting a
// fixed name, ask Groq which models this key can use and pick the best match from that list.
const GROQ_VISION_PREFERENCE = [/llama-4-scout/i, /llama-4-maverick/i, /vision/i, /(^|[-/])vl($|[-/])/i, /qwen.*vl/i, /gemma-?3/i, /pixtral/i];
const GROQ_TEXT_PREFERENCE = [/llama-3\.3-70b/i, /gpt-oss-120b/i, /llama-4-maverick/i, /kimi-k2/i, /qwen3?-?32b/i, /llama-4-scout/i, /gpt-oss-20b/i, /70b/i, /llama/i];
const GROQ_NOT_CHAT = /whisper|tts|playai|guard|distil|embed|orpheus|compound|safeguard/i;

let groqModelCache: { key: string; at: number; ids: string[] } | null = null;

async function listGroqModels(key: string): Promise<string[]> {
  if (groqModelCache && groqModelCache.key === key && Date.now() - groqModelCache.at < 30 * 60 * 1000) return groqModelCache.ids;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000)
    });
    if (!res.ok) {
      console.warn(`[invoice-ai] could not list Groq models (HTTP ${res.status}) - check that GROQ_API_KEY is a valid Groq key`);
      return [];
    }
    const body = (await res.json()) as any;
    const ids: string[] = (Array.isArray(body?.data) ? body.data : [])
      .filter((m: any) => m && typeof m.id === 'string' && m.active !== false && !GROQ_NOT_CHAT.test(m.id))
      .map((m: any) => m.id);
    groqModelCache = { key, at: Date.now(), ids };
    console.log(`[invoice-ai] Groq models available to this key: ${ids.join(', ') || '(none)'}`);
    return ids;
  } catch (err) {
    console.warn('[invoice-ai] could not list Groq models:', err);
    return [];
  }
}

/** Ordered model names to try: the configured/default name first, then the best available matches. */
async function groqCandidates(key: string, kind: 'vision' | 'text'): Promise<string[]> {
  const configured = getAiModels('groq')[kind];
  const available = await listGroqModels(key);
  if (available.length === 0) return [configured];
  const ordered: string[] = [];
  if (available.includes(configured)) ordered.push(configured);
  for (const pattern of kind === 'vision' ? GROQ_VISION_PREFERENCE : GROQ_TEXT_PREFERENCE) {
    for (const id of available) if (pattern.test(id) && !ordered.includes(id)) ordered.push(id);
  }
  return ordered.slice(0, 3);
}

/** Tries each candidate model; moves on when a model is missing/retired (404) or rejects the request (400). */
async function callGroqWithFallback(key: string, kind: 'vision' | 'text', content: unknown): Promise<unknown> {
  const candidates = await groqCandidates(key, kind);
  if (candidates.length === 0) throw new Error(`No Groq ${kind} model is available to this API key`);
  let lastError: unknown = null;
  for (const model of candidates) {
    try {
      return JSON.parse(stripJsonFences(await callGroq(key, model, content, true)));
    } catch (err: any) {
      lastError = err;
      if (err?.status === 400) {
        // Some models reject JSON mode (especially together with images); retry once in plain mode.
        try {
          return JSON.parse(stripJsonFences(await callGroq(key, model, content, false)));
        } catch (retryErr) {
          lastError = retryErr;
        }
      }
      // Wrong key / out of quota will fail the same way on every model - stop early.
      if (err?.status === 401 || err?.status === 403 || err?.status === 429) break;
      console.warn(`[invoice-ai] Groq model ${model} failed, trying next:`, err?.message || err);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Sends the invoice photo(s) straight to a vision model - far more accurate than OCR on phone photos. */
async function aiExtractFromImages(ai: { provider: AiProvider; key: string }, images: AiImage[]): Promise<unknown> {
  const prompt = `${EXTRACTION_RULES}\n\nThe invoice photo(s) follow. Read the printed table carefully, row by row.`;
  if (ai.provider === 'groq') {
    const content = [
      { type: 'text', text: prompt },
      ...images.slice(0, 5).map(img => ({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } }))
    ];
    return callGroqWithFallback(ai.key, 'vision', content);
  }
  const { vision } = getAiModels(ai.provider);
  const parts = [{ text: prompt }, ...images.slice(0, 5).map(img => ({ inline_data: { mime_type: img.mimeType, data: img.base64 } }))];
  return JSON.parse(stripJsonFences(await callGemini(ai.key, vision, parts)));
}

async function aiExtractFromText(ai: { provider: AiProvider; key: string }, text: string): Promise<unknown> {
  const prompt = `${EXTRACTION_RULES}\n\nThe text below came from OCR of the invoice, so columns may be jumbled and
characters misread (O/0, I/1, S/5). OCR may also glue words together: return productName with normal spacing
(e.g. "260GAVISCONLIQUID 120ML" -> "260-GAVISCON LIQUID 120ML"). Only return values you can tie to a product row.\n\nInvoice OCR text:\n${text.slice(0, 12000)}`;
  if (ai.provider === 'groq') return callGroqWithFallback(ai.key, 'text', prompt);
  const { text: model } = getAiModels(ai.provider);
  return JSON.parse(stripJsonFences(await callGemini(ai.key, model, [{ text: prompt }])));
}

/** Short, key-free reason for the admin when the AI could not be used. */
function describeAiFailure(err: unknown): string {
  const status = (err as any)?.status;
  const message = String((err as any)?.message || err || '');
  if (status === 401 || status === 403) return 'the API key was rejected - check GROQ_API_KEY / GEMINI_API_KEY';
  if (status === 429) return 'the AI usage limit was reached - try again later';
  if (status === 404 || /model_not_found|does not exist/i.test(message)) return 'no usable AI model is available to this key';
  if (/timeout|aborted/i.test(message)) return 'the AI took too long to answer';
  return 'the AI answer could not be used';
}

/** Shrinks phone photos so they fit provider limits (Groq: 4MB base64) and upload quickly. */
async function prepareImageForAi(buffer: Buffer, mimeType: string): Promise<AiImage> {
  try {
    const { Jimp } = await import('jimp');
    const img = await Jimp.read(buffer);
    const MAX = 2000;
    if (img.bitmap.width > MAX || img.bitmap.height > MAX) img.scaleToFit({ w: MAX, h: MAX });
    const jpeg = await img.getBuffer('image/jpeg', { quality: 85 });
    return { base64: Buffer.from(jpeg).toString('base64'), mimeType: 'image/jpeg' };
  } catch {
    return { base64: buffer.toString('base64'), mimeType: mimeType || 'image/jpeg' };
  }
}

function localDraftToRaw(draft: ParsedInvoiceDraft): RawExtractedInvoice {
  return {
    supplierName: draft.supplierNameRaw,
    invoiceNumber: draft.invoiceNumberRaw,
    invoiceDate: draft.invoiceDateRaw,
    printedNetTotal: draft.printedTotalRaw,
    printedItemCount: null,
    items: draft.items.map(it => ({
      productName: it.productNameRaw,
      packSize: null,
      manufacturer: null,
      batchNumber: it.batchNumber,
      expiryDate: it.expiryDate,
      mfgDate: it.mfgDate,
      quantity: it.boxesReceived,
      bonusQuantity: it.bonusQuantityRaw,
      rate: it.supplierPurchaseRate || null,
      discountPercent: it.lineDiscountRaw,
      lineTotal: it.lineTotalRaw,
      mrp: null,
      // The local parser is a rough line splitter; every line it produces needs a human check.
      confidence: 0.3
    }))
  };
}

/**
 * Reads an invoice (photos and/or PDF pages) and returns a REVIEW DRAFT for the admin.
 * Nothing is written to the database here.
 */
export async function quickAiExtractInvoice(files: Array<{ buffer: Buffer; mimeType: string }>): Promise<ReviewDraft> {
  if (files.length === 0) throw new Error('Please select an invoice image or PDF');

  const images: AiImage[] = [];
  const embeddedTexts: string[] = [];
  const rawImageBuffers: Buffer[] = [];

  for (const file of files.slice(0, 10)) {
    if (file.mimeType === 'application/pdf') {
      const pages = await extractPdfPages(file.buffer);
      for (const page of pages) {
        if (page.embeddedText) embeddedTexts.push(page.embeddedText);
        else if (page.renderedImage) {
          rawImageBuffers.push(page.renderedImage);
          images.push(await prepareImageForAi(page.renderedImage, 'image/png'));
        }
      }
    } else if (file.mimeType.startsWith('image/')) {
      rawImageBuffers.push(file.buffer);
      images.push(await prepareImageForAi(file.buffer, file.mimeType));
    } else {
      throw new Error(`Unsupported file type ${file.mimeType}. Upload a photo (JPG/PNG) or a PDF.`);
    }
  }

  const ai = getAiApiKey();
  const warnings: string[] = [];
  let aiFailure: unknown = null;

  if (ai) {
    // 1. Vision: the model sees the actual photo (columns intact, no OCR noise).
    if (images.length > 0 && embeddedTexts.length === 0) {
      // Groq first; if this Groq key has no vision model and a Gemini key is also set, Gemini reads the photo.
      const geminiKey = getGeminiApiKey();
      const visionProviders: Array<{ provider: AiProvider; key: string }> = [ai];
      if (ai.provider === 'groq' && geminiKey) visionProviders.push({ provider: 'gemini', key: geminiKey });
      for (const visionAi of visionProviders) {
        try {
          const raw = normalizeAiInvoice(await aiExtractFromImages(visionAi, images));
          if (raw.items.length > 0) {
            return buildReviewDraft(raw, { extractionMethod: 'AI_VISION', aiProvider: visionAi.provider, warnings });
          }
        } catch (err) {
          aiFailure = err;
          console.warn(`[invoice-ai] ${visionAi.provider} vision extraction failed:`, (err as any)?.message || err);
        }
      }
    }

    // 2. Text: OCR (or embedded PDF text) structured by the text model.
    try {
      const ocrTexts: string[] = [];
      for (const buf of rawImageBuffers) ocrTexts.push(await ocrImageBuffer(buf));
      const text = [...embeddedTexts, ...ocrTexts].join('\n\n');
      if (text.trim().length >= 5) {
        const raw = normalizeAiInvoice(await aiExtractFromText(ai, text));
        if (raw.items.length > 0) {
          return buildReviewDraft(raw, { extractionMethod: 'AI_TEXT', aiProvider: ai.provider, warnings });
        }
      }
    } catch (err) {
      aiFailure = err;
      console.warn('[invoice-ai] text extraction failed, falling back to local parser:', err);
    }
    warnings.push(`The ${ai.provider === 'groq' ? 'Groq' : 'Gemini'} AI could not read this invoice (${aiFailure ? describeAiFailure(aiFailure) : 'it found no medicine lines'}). A basic local reader was used instead - check every line carefully.`);
  } else {
    warnings.push('No AI key is configured on the server (GROQ_API_KEY or GEMINI_API_KEY), so a basic local reader was used. Check every line carefully.');
  }

  // 3. Local fallback: Tesseract OCR + line parser.
  const ocrTexts: string[] = [];
  for (const buf of rawImageBuffers) ocrTexts.push(await ocrImageBuffer(buf));
  const combined = [...embeddedTexts, ...ocrTexts].join('\n\n');
  if (combined.trim().length < 5) {
    throw new Error('Could not read text from this image. Please ensure the invoice is flat, well-lit and in focus.');
  }
  const localDraft = parseInvoiceText(combined);
  return buildReviewDraft(localDraftToRaw(localDraft), {
    extractionMethod: 'LOCAL_PARSER',
    aiProvider: null,
    warnings,
    rawNotes: localDraft.warrantyText
  });
}

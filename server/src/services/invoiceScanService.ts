// OCR + text-parsing for scanned/photographed/PDF purchase invoices. Pure extraction stage of the
// "scan invoice -> review -> commit to stock" feature - no routes, no DB writes here.
//
// Local-first OCR data, documented:
// tesseract.js (Node build) already resolves its wasm core and worker script from the local
// `tesseract.js-core` / `tesseract.js` packages on disk - it never hits a CDN for those on Node
// (CDN URLs only apply to the browser build). The ONE thing it does fetch from a CDN by default is
// the `eng.traineddata` language file (via `langPath`, defaulting to cdn.jsdelivr.net). To avoid a
// hard runtime dependency on that CDN (a core pharmacy workflow should still OCR after a cold
// Fly.io container restart with the CDN unreachable), we depend on the small npm package
// `@tesseract.js-data/eng`, which vendors the exact same traineddata file npm registry (already a
// trusted, always-reachable host for this app) and point `langPath` at its on-disk folder. If that
// package is ever missing for some reason (e.g. manually removed from node_modules), we fall back
// to the default CDN behavior and log a warning - OCR still works, just with a network dependency.
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import Tesseract from 'tesseract.js';
import { PDFParse } from 'pdf-parse';

const require = createRequire(import.meta.url);

function resolveLocalLangPath(): string | null {
  try {
    const pkgJsonPath = require.resolve('@tesseract.js-data/eng/package.json');
    // lstmOnly is tesseract.js's default OEM on Node, which is what the "4.0.0_best_int" folder matches.
    const dir = path.join(path.dirname(pkgJsonPath), '4.0.0_best_int');
    if (fs.existsSync(path.join(dir, 'eng.traineddata.gz'))) return dir;
    return null;
  } catch {
    return null;
  }
}

const localLangPath = resolveLocalLangPath();
if (!localLangPath) {
  console.warn('[invoiceScanService] Local eng.traineddata not found in @tesseract.js-data/eng - OCR will fall back to fetching it from the tesseract.js CDN on first use.');
}

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
  expiryDate: string | null;       // ISO YYYY-MM-DD if confidently parsed, else null
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
  handwrittenFlag: boolean;        // heuristic: true if this line's source text looks handwritten/low-confidence vs. printed
}

export interface ParsedInvoiceDraft {
  supplierNameRaw: string | null;
  invoiceNumberRaw: string | null;
  invoiceDateRaw: string | null;
  documentType: 'INVOICE' | 'QUOTATION' | 'ESTIMATE' | 'UNKNOWN';
  printedTotalRaw: number | null;
  calculatedTotal: number | null;  // sum of items' lineTotalRaw where present
  items: ParsedInvoiceLineItem[];
  warrantyText: string | null;     // verbatim warranty/guarantee wording found anywhere in the text, or null
  rawText: string;                 // the full combined OCR/extracted text, for audit/debugging
}

export async function ocrImageBuffer(buffer: Buffer, mimeType: string): Promise<string> {
  const page = await runOcr(buffer);
  return page.text;
}

async function runOcr(buffer: Buffer): Promise<Tesseract.Page> {
  const worker = await getWorker();
  const { data } = await worker.recognize(buffer, {}, { blocks: true, text: true } as any);
  return data;
}

export async function extractPdfPages(buffer: Buffer): Promise<Array<{ pageNumber: number; embeddedText: string | null; renderedImage: Buffer | null }>> {
  const parser = new PDFParse({ data: buffer });
  try {
    const textResult = await parser.getText();
    const results: Array<{ pageNumber: number; embeddedText: string | null; renderedImage: Buffer | null }> = [];

    for (const page of textResult.pages) {
      // A real text layer has actual words, not just stray OCR-irrelevant artifacts (form field
      // labels, a watermark) - require a handful of alphabetic words before trusting it over OCR.
      const wordCount = (page.text.match(/[A-Za-z]{2,}/g) || []).length;
      if (wordCount >= 5) {
        results.push({ pageNumber: page.num, embeddedText: page.text, renderedImage: null });
      } else {
        const screenshot = await parser.getScreenshot({ partial: [page.num], scale: 2 });
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
  // Text of OCR lines whose recognition confidence was notably low relative to that page's
  // average - the raw material for the handwrittenFlag heuristic applied to items below.
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

  // handwrittenFlag needs OCR confidence metadata that plain text does not carry, so it is layered
  // on here rather than inside parseInvoiceText (which stays a pure text-in function). This is a
  // confidence-based heuristic, NOT true handwriting detection: low-confidence OCR can also mean a
  // blurry photo, a creased page, or a bad font - it is a proxy, and a fairly noisy one.
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

// ---------------------------------------------------------------------------------------------
// Pure parsing logic below. No I/O, independently unit-testable.
// ---------------------------------------------------------------------------------------------

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
  // Fall back to scanning the whole document in case the heading was missed/garbled by OCR.
  if (/\b(quotation|quote)\b/i.test(text)) return 'QUOTATION';
  if (/\bestimate\b/i.test(text)) return 'ESTIMATE';
  if (/\b(tax\s+invoice|invoice|bill)\b/i.test(text)) return 'INVOICE';
  return 'UNKNOWN';
}

function detectInvoiceNumber(text: string): string | null {
  const match = text.match(/\b(?:invoice|inv|bill)\s*(?:no\.?|number|#)?\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]{1,24})/i);
  if (!match) return null;
  const candidate = match[1].trim();
  // Reject obvious false positives like matching a trailing date/word fragment.
  if (/^(no|number|date)$/i.test(candidate)) return null;
  return candidate;
}

function detectInvoiceDateRaw(text: string): string | null {
  const dateAlternation = `(\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4}|\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}\\s+[A-Za-z]{3,9}\\s+\\d{2,4})`;
  const labeled = new RegExp(`\\bdate\\s*[:\\-]?\\s*${dateAlternation}`, 'i');
  const match = text.match(labeled);
  return match ? match[1].trim() : null;
}

function detectSupplierName(text: string): string | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 8)) {
    if (line.length < 3 || line.length > 60) continue;
    if (/\b(invoice|quotation|estimate|bill|date|tel|phone|fax|address|gst|ntn)\b/i.test(line)) continue;
    if (/^\d+$/.test(line)) continue;
    // Supplier header lines are typically mostly-letters, often ALL CAPS on printed letterheads.
    const letters = (line.match(/[A-Za-z]/g) || []).length;
    if (letters < line.length * 0.6) continue;
    return line;
  }
  return null;
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
  // Deliberately strict: a column header literally called "Rate"/"Price" tells us NOTHING about
  // whether that figure is per box, per strip, or per unit. Only explicit wording counts.
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

/**
 * Extracts a batch-number / expiry-date pair from a line's remaining text, after numeric columns
 * for qty/rate/etc. have already been stripped. Only returns a result when there is EXACTLY one
 * date-like candidate and EXACTLY one batch-like candidate - anything more is genuinely ambiguous
 * (which token is which) and must be flagged rather than guessed, per the product spec.
 */
function extractBatchAndExpiry(line: string): { batch: string | null; expiry: string | null; remainder: string; ambiguous: boolean } {
  // MM/YY, MM/YYYY (bare expiry), or a full DD/MM/YYYY date.
  const dateRe = /\b(\d{1,2}[\/\-]\d{2,4}(?:[\/\-]\d{2,4})?)\b/g;
  const dateMatches = [...line.matchAll(dateRe)];

  let working = line;
  const batchCandidates: string[] = [];
  // Alphanumeric token, 6-10 chars, containing at least one letter AND at least one digit - a
  // plain product-name word (all letters) or a plain amount (all digits) must never match here.
  const batchRe = /\b(?=[A-Za-z0-9]{6,10}\b)(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{6,10}\b/g;
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
      // Pharma convention: an MM/YY expiry means "valid through end of that month" - there is no
      // printed day, so we pick the last day of the month rather than fabricate day 01.
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

function parseLineItem(line: string, lineNumber: number): ParsedInvoiceLineItem | null {
  const genericNumberRe = /\b\d[\d,]*(?:\.\d+)?\b/g;
  const initialNumberCount = (line.match(genericNumberRe) || []).length;
  if (initialNumberCount < 2) return null;

  if (/grand\s*total|net\s*total|total\s*amount|invoice\s*(?:no|number)|supplier|warranty|guarantee|^date\b/i.test(line)) return null;

  let working = line;
  let flaggedUnclear = false;
  let flagReason: string | null = null;

  const bonusResult = extractBonus(working);
  working = bonusResult.remainder;

  const discountResult = extractDiscount(working);
  working = discountResult.remainder;

  const taxResult = extractTax(working);
  working = taxResult.remainder;

  const rateBasis = detectRateBasis(line);

  const { strength, remainder: afterStrength } = extractStrength(working);
  working = afterStrength;

  const { form: dosageForm, remainder: afterForm } = extractDosageForm(working);
  working = afterForm;

  const batchExpiry = extractBatchAndExpiry(working);
  working = batchExpiry.remainder;
  if (batchExpiry.ambiguous) {
    flaggedUnclear = true;
    flagReason = 'Could not determine which token is batch number vs expiry date';
  }

  const remainingNumberMatches = [...working.matchAll(genericNumberRe)];
  const nums = remainingNumberMatches.map((m) => toNumberOrNull(m[0])).filter((n): n is number => n !== null);

  const firstNumberIndex = remainingNumberMatches.length > 0 ? (remainingNumberMatches[0].index || 0) : working.length;
  let productNameRaw: string | null = working
    .slice(0, firstNumberIndex)
    .replace(/^[\s\-|.:#,]+/, '')
    .replace(/[\s\-|.:#,]+$/, '')
    .trim() || null;

  if (!productNameRaw) {
    flaggedUnclear = true;
    flagReason = flagReason || 'Could not isolate product name from numeric columns';
  }

  let boxesReceived: number | null = null;
  let supplierPurchaseRate: number | null = null;
  let lineTotalRaw: number | null = null;

  if (nums.length === 2) {
    [boxesReceived, supplierPurchaseRate] = nums;
  } else if (nums.length === 3) {
    [boxesReceived, supplierPurchaseRate, lineTotalRaw] = nums;
  } else if (nums.length > 0) {
    flaggedUnclear = true;
    flagReason = flagReason || `Found ${nums.length} numeric tokens on this line - could not determine which is quantity vs rate vs total`;
  }

  if (rateBasis === 'UNKNOWN' && supplierPurchaseRate !== null) {
    flaggedUnclear = true;
    flagReason = flagReason || 'Rate basis not stated on invoice - confirm whether this is per box, strip, or unit';
  }

  return {
    lineNumber,
    productNameRaw,
    strengthRaw: strength,
    dosageFormRaw: dosageForm,
    batchNumber: batchExpiry.batch,
    expiryDate: batchExpiry.expiry,
    mfgDate: null,
    boxesReceived,
    supplierPurchaseRate,
    rateBasis,
    lineDiscountRaw: discountResult.discount,
    lineTaxRaw: taxResult.tax,
    lineTotalRaw,
    bonusQuantityRaw: bonusResult.bonus,
    flaggedUnclear,
    flagReason,
    handwrittenFlag: false,
  };
}

export function parseInvoiceText(combinedText: string): ParsedInvoiceDraft {
  const lines = combinedText.split('\n');

  const items: ParsedInvoiceLineItem[] = [];
  let lineNumber = 0;
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const item = parseLineItem(trimmed, lineNumber + 1);
    if (item) {
      lineNumber += 1;
      items.push(item);
    }
  }

  const calculatedTotal = items.some((i) => i.lineTotalRaw !== null)
    ? items.reduce((sum, i) => sum + (i.lineTotalRaw || 0), 0)
    : null;

  return {
    supplierNameRaw: detectSupplierName(combinedText),
    invoiceNumberRaw: detectInvoiceNumber(combinedText),
    invoiceDateRaw: detectInvoiceDateRaw(combinedText),
    documentType: detectDocumentType(combinedText),
    printedTotalRaw: detectPrintedTotal(combinedText),
    calculatedTotal,
    items,
    warrantyText: detectWarrantyText(combinedText),
    rawText: combinedText,
  };
}

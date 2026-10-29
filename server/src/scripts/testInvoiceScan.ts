// Standalone verification script for invoiceScanService.ts - not part of the vitest suite.
// Run with: npx tsx src/scripts/testInvoiceScan.ts
//
// Exercises both extraction paths:
//   1. A synthetic PNG "photo" of a printed invoice, run through ocrImageBuffer/Tesseract.
//   2. A synthetic PDF with a REAL embedded text layer (pdf-lib), run through extractPdfPages'
//      embedded-text path - no OCR needed, and the path most real supplier invoices will take.
// Both are fed through scanInvoiceFiles end-to-end and the parsed result is printed and sanity
// checked against what was deliberately put into (or deliberately left ambiguous in) the fixtures.
import { Jimp, loadFont } from 'jimp';
import { SANS_32_BLACK } from 'jimp/fonts';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { scanInvoiceFiles, parseInvoiceText } from '../services/invoiceScanService.js';

async function buildSyntheticInvoiceImage(): Promise<Buffer> {
  const image = new Jimp({ width: 1400, height: 900, color: 0xffffffff });
  const font = await loadFont(SANS_32_BLACK);

  const lines = [
    'NAVEED MEDICAL SUPPLIERS',
    'Invoice No: INV-7788',
    'Date: 15/01/2026',
    '',
    'Panadol Extra 500mg Tablet BATCH9X 03/27  10 25.50 255.00',
    'Augmentin Syrup XYZQ12 04/26  5 120  600',
    '',
    'Warranty: All products carry manufacturer warranty against defects.',
    'Valid for 6 months from date of purchase.',
    '',
    'Grand Total: 1500',
  ];

  let y = 20;
  for (const line of lines) {
    image.print({ font, x: 20, y, text: line });
    y += 48;
  }

  return image.getBuffer('image/png');
}

async function buildSyntheticInvoicePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 760]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const draw = (text: string, y: number, size = 14) => page.drawText(text, { x: 40, y, size, font, color: rgb(0, 0, 0) });

  draw('CITY PHARMA DISTRIBUTORS', 720, 18);
  draw('Invoice No: INV-4455', 690);
  draw('Date: 02 Mar 2026', 670);
  draw('Augmentin 625mg Tablet AB1234 05/27  20 150.00 3000.00', 600);
  // Deliberately ambiguous line: two date-like tokens on one line, so batch/expiry must come
  // back null+flagged rather than the service guessing which one is the real expiry.
  draw('Brufen Syrup 01/26 02/27  8 90 720', 580);
  draw('Warranty: Replacement guaranteed for damaged packaging on delivery.', 540);
  draw('Within 48 hours of receipt only.', 522);
  draw('Grand Total: 3720', 60);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
  console.log(`  OK: ${message}`);
}

async function main() {
  console.log('=== Testing PDF embedded-text extraction path ===');
  const pdfBuffer = await buildSyntheticInvoicePdf();
  const pdfResult = await scanInvoiceFiles([{ buffer: pdfBuffer, mimeType: 'application/pdf' }]);
  console.log('--- raw text ---');
  console.log(pdfResult.rawTextPerPage.join('\n---\n'));
  console.log('--- parsed ---');
  console.log(JSON.stringify(pdfResult.parsed, null, 2));

  assert(pdfResult.parsed.invoiceNumberRaw === 'INV-4455', `invoiceNumberRaw parsed (got ${pdfResult.parsed.invoiceNumberRaw})`);
  assert(pdfResult.parsed.invoiceDateRaw !== null, `invoiceDateRaw parsed (got ${pdfResult.parsed.invoiceDateRaw})`);
  assert(pdfResult.parsed.printedTotalRaw === 3720, `printedTotalRaw parsed (got ${pdfResult.parsed.printedTotalRaw})`);
  assert(pdfResult.parsed.documentType === 'INVOICE', `documentType detected as INVOICE (got ${pdfResult.parsed.documentType})`);
  assert(pdfResult.parsed.warrantyText !== null && pdfResult.parsed.warrantyText.includes('guaranteed'), 'warrantyText captured verbatim');
  assert(pdfResult.parsed.items.length >= 2, `found at least 2 line items (got ${pdfResult.parsed.items.length})`);

  const clearItem = pdfResult.parsed.items.find((i) => i.productNameRaw?.toLowerCase().includes('augmentin'));
  assert(!!clearItem, 'Augmentin line item isolated');
  if (clearItem) {
    assert(clearItem.batchNumber === 'AB1234', `unambiguous batch parsed (got ${clearItem.batchNumber})`);
    assert(clearItem.expiryDate === '2027-05-31', `unambiguous expiry parsed to ISO end-of-month (got ${clearItem.expiryDate})`);
    assert(clearItem.rateBasis === 'UNKNOWN', 'rateBasis conservatively left UNKNOWN (no "per box"/"per strip" wording present)');
    assert(clearItem.flaggedUnclear === true && !!clearItem.flagReason, 'flagged unclear due to unstated rate basis, with a reason');
  }

  const ambiguousItem = pdfResult.parsed.items.find((i) => i.productNameRaw?.toLowerCase().includes('brufen'));
  assert(!!ambiguousItem, 'Brufen (ambiguous dates) line item isolated');
  if (ambiguousItem) {
    assert(ambiguousItem.batchNumber === null, 'ambiguous line: batchNumber left null rather than guessed');
    assert(ambiguousItem.expiryDate === null, 'ambiguous line: expiryDate left null rather than guessed');
    assert(ambiguousItem.flaggedUnclear === true, 'ambiguous line flagged unclear');
  }

  console.log('\n=== Testing image OCR extraction path ===');
  const imageBuffer = await buildSyntheticInvoiceImage();
  const imageResult = await scanInvoiceFiles([{ buffer: imageBuffer, mimeType: 'image/png' }]);
  console.log('--- OCR raw text ---');
  console.log(imageResult.rawTextPerPage.join('\n---\n'));
  console.log('--- parsed ---');
  console.log(JSON.stringify(imageResult.parsed, null, 2));

  const ocrWordCount = (imageResult.rawTextPerPage.join(' ').match(/[A-Za-z]{3,}/g) || []).length;
  assert(ocrWordCount >= 5, `OCR produced non-garbage text (found ${ocrWordCount} real-looking words)`);
  assert(imageResult.parsed.invoiceNumberRaw !== null && imageResult.parsed.invoiceNumberRaw.includes('7788'), `OCR invoiceNumberRaw contains 7788 (got ${imageResult.parsed.invoiceNumberRaw})`);
  assert(imageResult.parsed.printedTotalRaw === 1500, `OCR printedTotalRaw parsed (got ${imageResult.parsed.printedTotalRaw})`);
  assert(imageResult.parsed.warrantyText !== null, 'OCR warrantyText captured');

  console.log('\n=== Testing parseInvoiceText in isolation (no OCR/IO) ===');
  const directParsed = parseInvoiceText('QUOTATION\nSupplier: Test\nDate: 2026-01-01\nTotal: 100');
  assert(directParsed.documentType === 'QUOTATION', 'parseInvoiceText works standalone on plain text');

  console.log('\nAll checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

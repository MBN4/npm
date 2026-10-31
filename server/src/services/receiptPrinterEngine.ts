import { db } from '../db/index.js';
import { printRawToPrinter, getWindowsPrinters, PrintResult } from './printerService.js';
import { renderLogoRaster, renderQrRaster, renderBarcodeRaster, paperWidthDots } from './receiptGraphics.js';

function padBetween(left: string, right: string, width: number = 44): string {
  const l = left.trim();
  const r = right.trim();
  const spaces = Math.max(1, width - l.length - r.length);
  return l + ' '.repeat(spaces) + r;
}

export interface PrintReceiptParams {
  invoiceNumber?: string;
  printerName?: string;
  invoiceData?: any;
}

export async function printReceiptESC_POS(params: PrintReceiptParams): Promise<PrintResult> {
  const targetPrinter = params.printerName || 'Speed-X 400UL';
  const invoiceData = params.invoiceData;
  const invoiceNumber = params.invoiceNumber;

  let invNo = invoiceNumber || 'INV-20261031-0001';
  let posNo = '01';
  let cashierName = 'Dr. Naveed (Chief Pharmacist/Admin)';
  let customerName = 'WALK-IN CUSTOMER';
  let customerMobile = '';
  let customerBalance = 0;
  let paymentMethod = 'CASH';
  let dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  let timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  let subtotalAmt = 0;
  let discountAmt = 0;
  let taxAmt = 0;
  let totalAmt = 0;
  let paidAmt = 0;
  let changeAmt = 0;
  let remainingAmt = 0;
  let itemsList: any[] = [];

  if (invoiceData && Array.isArray(invoiceData.items) && invoiceData.items.length > 0) {
    invNo = invoiceData.invoiceNumber || invoiceNumber || invNo;
    posNo = invoiceData.posNo ? String(invoiceData.posNo).replace(/[^0-9]/g, '') || '01' : '01';
    cashierName = invoiceData.cashierName || cashierName;
    customerName = invoiceData.customerName || (invoiceData.customer?.name) || 'WALK-IN CUSTOMER';
    customerMobile = invoiceData.customerPhone || invoiceData.customer?.mobile || '';
    paymentMethod = invoiceData.paymentMethod || 'CASH';
    subtotalAmt = Number(invoiceData.subtotal) || 0;
    discountAmt = Number(invoiceData.discount) || 0;
    taxAmt = Number(invoiceData.salesTax || invoiceData.tax) || 0;
    totalAmt = Number(invoiceData.grandTotal || invoiceData.totalAmount) || subtotalAmt;
    paidAmt = invoiceData.paidAmount !== undefined ? Number(invoiceData.paidAmount) : totalAmt;
    changeAmt = Number(invoiceData.changeAmount) || (paidAmt > totalAmt ? paidAmt - totalAmt : 0);
    remainingAmt = invoiceData.balance !== undefined ? Number(invoiceData.balance) : Math.max(0, totalAmt - paidAmt);
    if (invoiceData.date) dateStr = invoiceData.date;
    if (invoiceData.time) timeStr = invoiceData.time;
    if (invoiceData.createdAt) {
      const d = new Date(invoiceData.createdAt);
      dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    }
    itemsList = invoiceData.items.map((it: any) => ({
      brand_name: it.brandName || it.brand_name || 'Medicine',
      strength: it.strength || '',
      dosage_form: it.dosageForm || it.dosage_form || '',
      quantity: Number(it.unitsTaken || it.quantity) || 1,
      packType: it.packType || 'Units',
      batch_number: it.batchNumber || it.batch_number || 'AG-9821',
      expiry_date: it.expiryDate || it.expiry_date || '11/2027',
      unit_price: Number(it.unitPrice || it.unit_price) || 0,
      line_total: Number(it.total || it.lineTotal || it.line_total) || 0
    }));
  } else if (invoiceNumber) {
    const sale = db.prepare(`
      SELECT s.*, u.full_name as cashier_name, bp.name as billing_person_name, c.name as customer_name, c.mobile as customer_mobile, c.id as customer_row_id, c.current_balance as customer_balance
      FROM sales s
      JOIN users u ON s.cashier_id = u.id
      LEFT JOIN billing_persons bp ON s.billing_person_id = bp.id
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.invoice_number = ?
    `).get(invoiceNumber) as any;

    if (sale) {
      invNo = sale.invoice_number;
      cashierName = sale.billing_person_name || sale.cashier_name || cashierName;
      customerName = sale.custom_slip_name || sale.customer_name || 'WALK-IN CUSTOMER';
      customerMobile = sale.customer_mobile || '';
      customerBalance = Number(sale.customer_balance) || 0;
      paymentMethod = sale.payment_method || 'CASH';
      subtotalAmt = Number(sale.subtotal) || 0;
      discountAmt = Number(sale.discount) || 0;
      taxAmt = Number(sale.tax) || 0;
      totalAmt = Number(sale.total_amount) || 0;
      paidAmt = Number(sale.paid_amount) || 0;
      changeAmt = Number(sale.change_amount) || 0;
      remainingAmt = Number(sale.remaining_amount) || 0;
      const d = new Date(sale.created_at || Date.now());
      dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

      itemsList = db.prepare(`
        SELECT si.*, m.brand_name, m.strength, m.dosage_form, b.batch_number, b.expiry_date
        FROM sale_items si
        JOIN medicines m ON si.medicine_id = m.id
        JOIN batches b ON si.batch_id = b.id
        WHERE si.sale_id = ?
      `).all(sale.id) as any[];
    }
  }

  if (itemsList.length === 0) {
    return { success: false, reason: 'No items to print' };
  }

  // Fetch store settings
  const settingsRows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'pharmacy_%' OR key LIKE 'receipt_%' OR key LIKE 'license_%' OR key LIKE 'tax_%'").all() as any[];
  const settingsMap: Record<string, string> = {};
  settingsRows.forEach(r => { settingsMap[r.key] = r.value; });

  const phone = settingsMap['pharmacy_phone'] || '0345-4142863';
  const paperDots = paperWidthDots(settingsMap['printer_paper_width']);
  const lineWidth = 44;

  const chunks: Buffer[] = [
    Buffer.from([0x1B, 0x40]), // ESC @ - Reset / Initialize
  ];

  // 1. High-Res Logo Raster Graphic
  try {
    const logoRaster = await renderLogoRaster(Math.round(paperDots * 0.32), paperDots);
    if (logoRaster) {
      chunks.push(logoRaster);
      chunks.push(Buffer.from([0x1B, 0x64, 0x01])); // 1 line feed after logo
    }
  } catch (err) {
    console.warn('Logo raster render warning:', err);
  }

  // 2. Header Text (Double-Height & Double-Width matching Test 2)
  chunks.push(Buffer.from([0x1B, 0x61, 0x01])); // ESC a 1 - Center
  chunks.push(Buffer.from([0x1B, 0x21, 0x30])); // Double height + Double width
  chunks.push(Buffer.from('NAVEED MEDICAL\nPHARMACY (NMP)\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x21, 0x00])); // Reset font size

  chunks.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold On
  chunks.push(Buffer.from('Complete Healthcare & Clinical Pharmacy\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold Off

  chunks.push(Buffer.from(`${settingsMap['pharmacy_address'] || 'Chowk Chohan Road Outfall, Islampura, Lahore'}\n`, 'utf8'));
  chunks.push(Buffer.from(`Helpline / WhatsApp: ${phone}\n`, 'utf8'));
  chunks.push(Buffer.from(`Govt Drug License No: ${settingsMap['license_number'] || 'DL-GUJ-2026-9812'}\n`, 'utf8'));

  chunks.push(Buffer.from('='.repeat(lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold On
  chunks.push(Buffer.from('OFFICIAL CASH MEMO / SALES INVOICE\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold Off
  chunks.push(Buffer.from('='.repeat(lineWidth) + '\n', 'utf8'));

  // 3. Metadata
  chunks.push(Buffer.from([0x1B, 0x61, 0x00])); // ESC a 0 - Left align
  chunks.push(Buffer.from(padBetween(`Inv #: ${invNo}`, `Date: ${dateStr}`, lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from(padBetween(`Counter: POS-${posNo} (Main)`, `Time: ${timeStr}`, lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from(padBetween(`Cashier: ${cashierName}`, 'Mode: WALK-IN', lineWidth) + '\n', 'utf8'));
  const custDisplay = customerMobile ? `${customerName} (${customerMobile})` : customerName;
  chunks.push(Buffer.from(`Customer: ${custDisplay}\n`, 'utf8'));
  if (customerBalance > 0) {
    chunks.push(Buffer.from(`Previous Udhaar Balance: Rs. ${customerBalance.toFixed(2)}\n`, 'utf8'));
  }

  chunks.push(Buffer.from('-'.repeat(lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from(padBetween('Item / Batch / Expiry', 'Qty  Price    Total', lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from('-'.repeat(lineWidth) + '\n', 'utf8'));

  // 4. Line Items
  let totalUnits = 0;
  itemsList.forEach((it, idx) => {
    const q = Number(it.quantity || it.unitsTaken) || 1;
    totalUnits += q;
    let brand = (it.brand_name || it.brandName || '').trim();
    const strength = (it.strength || '').trim();
    const dosage = (it.dosage_form || it.dosageForm || '').trim();
    if (strength && !brand.toLowerCase().includes(strength.toLowerCase())) {
      brand += ` ${strength}`;
    }
    if (dosage && !brand.toLowerCase().includes(dosage.toLowerCase())) {
      brand += ` ${dosage}`;
    }

    chunks.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold On
    chunks.push(Buffer.from(`${idx + 1}. ${brand}\n`, 'utf8'));
    chunks.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold Off

    const batchNo = it.batch_number || it.batchNumber || 'AG-9821';
    const expDate = it.expiry_date || it.expiryDate || '11/2027';
    chunks.push(Buffer.from(`   Batch: ${batchNo}   Exp: ${expDate}\n`, 'utf8'));

    const unitP = Number(it.unit_price || it.unitPrice) || 0;
    const lineTot = Number(it.line_total || it.total) || (q * unitP);
    const packTypeStr = it.packType || 'Units';
    const qtyCalc = `   ${q} ${packTypeStr} (${q} x ${unitP.toFixed(2)})`;
    chunks.push(Buffer.from(padBetween(qtyCalc, `Rs. ${lineTot.toFixed(2)}`, lineWidth) + '\n', 'utf8'));
  });

  // 5. Totals with Rs. 2.00 POS Service Fee
  let posFeeAmt = 2.0;
  if (invoiceData && invoiceData.posFee !== undefined) {
    posFeeAmt = Number(invoiceData.posFee);
  } else if (invoiceData && (invoiceData as any).fixedChargeAmount !== undefined) {
    posFeeAmt = Number((invoiceData as any).fixedChargeAmount);
  }

  chunks.push(Buffer.from('-'.repeat(lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from(padBetween(`Total Line Items: ${itemsList.length}`, `Total Units: ${totalUnits}`, lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from(padBetween('Gross Sub Total:', `Rs.  ${subtotalAmt.toFixed(2)}`, lineWidth) + '\n', 'utf8'));
  if (discountAmt > 0) {
    chunks.push(Buffer.from(padBetween('Special Discount:', `-Rs.   ${discountAmt.toFixed(2)}`, lineWidth) + '\n', 'utf8'));
  }
  chunks.push(Buffer.from(padBetween('Sales Tax / GST (0%):', `Rs.    ${taxAmt.toFixed(2)}`, lineWidth) + '\n', 'utf8'));
  if (posFeeAmt > 0) {
    chunks.push(Buffer.from(padBetween('POS Service Fee:', `Rs.    ${posFeeAmt.toFixed(2)}`, lineWidth) + '\n', 'utf8'));
  }

  chunks.push(Buffer.from('='.repeat(lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold on
  chunks.push(Buffer.from(padBetween('NET GRAND TOTAL:', `Rs.  ${totalAmt.toFixed(2)}`, lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold off
  chunks.push(Buffer.from('='.repeat(lineWidth) + '\n', 'utf8'));

  // 6. Payment Information
  chunks.push(Buffer.from(padBetween('Cash Tendered:', `Rs. ${paidAmt.toFixed(2)}`, lineWidth) + '\n', 'utf8'));
  if (changeAmt > 0) {
    chunks.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold
    chunks.push(Buffer.from(padBetween('Change Returned:', `Rs.    ${changeAmt.toFixed(2)}`, lineWidth) + '\n', 'utf8'));
    chunks.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold off
  }
  if (remainingAmt > 0) {
    chunks.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold
    chunks.push(Buffer.from(padBetween('Balance Due (Udhar):', `Rs.    ${remainingAmt.toFixed(2)}`, lineWidth) + '\n', 'utf8'));
    chunks.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold off
  }
  chunks.push(Buffer.from(padBetween('Payment Method:', `${paymentMethod.toUpperCase()} COUNTER`, lineWidth) + '\n', 'utf8'));

  // 7. Clinical Advisory & Policies (from Test 2)
  chunks.push(Buffer.from([0x1B, 0x61, 0x01])); // Center
  chunks.push(Buffer.from('-'.repeat(lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold on
  chunks.push(Buffer.from('CLINICAL ADVISORY & STORAGE\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold off
  chunks.push(Buffer.from('Store all medicines in a cool, dry place (<30C).\n', 'utf8'));
  chunks.push(Buffer.from('Keep all medicines out of reach of children.\n', 'utf8'));
  chunks.push(Buffer.from('Take antibiotics strictly as prescribed by doctor.\n', 'utf8'));

  chunks.push(Buffer.from('-'.repeat(lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold on
  chunks.push(Buffer.from('STORE RETURN POLICY\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold off
  chunks.push(Buffer.from('Returns accepted within 3 days with this bill.\n', 'utf8'));
  chunks.push(Buffer.from('Cold-chain / fridge & cut strips NOT returnable.\n', 'utf8'));
  chunks.push(Buffer.from('-'.repeat(lineWidth) + '\n', 'utf8'));

  // 8. Location QR Code with space below
  chunks.push(Buffer.from([0x1B, 0x64, 0x01])); // Space above QR
  const mapsLocationUrl = settingsMap['pharmacy_maps_url'] || 'https://maps.app.goo.gl/cUe3jLr2kngNTnt2A';
  try {
    const qrRaster = await renderQrRaster(mapsLocationUrl, Math.round(paperDots * 0.32), paperDots);
    if (qrRaster) chunks.push(qrRaster);
  } catch (err) {
    console.warn('QR raster error:', err);
  }
  chunks.push(Buffer.from([0x1B, 0x64, 0x02])); // 2 line feeds of space below QR code
  chunks.push(Buffer.from('Scan QR for Pharmacy Location 📍\n', 'utf8'));

  // 9. Space between QR code section and Barcode
  chunks.push(Buffer.from([0x1B, 0x64, 0x02])); // 2 line feeds of space
  chunks.push(Buffer.from('-'.repeat(lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x64, 0x01])); // 1 line feed before barcode

  // 10. Invoice Barcode with space below
  try {
    const barcodeRaster = await renderBarcodeRaster(invNo, Math.round(paperDots * 0.72), 70, paperDots);
    if (barcodeRaster) chunks.push(barcodeRaster);
  } catch (err) {
    console.warn('Barcode raster error:', err);
  }
  chunks.push(Buffer.from([0x1B, 0x64, 0x03])); // 3 line feeds of space below barcode so footer content is not crowded

  // 11. Footer Text (from Test 2)
  chunks.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold on
  chunks.push(Buffer.from('Thank You For Choosing NMP!\n', 'utf8'));
  chunks.push(Buffer.from('*** YOUR HEALTH, OUR PRIORITY ***\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold off
  chunks.push(Buffer.from('Proprietor: Naveed Ahmed Khan\n\n', 'utf8'));

  // 12. Feed 6 lines & universal auto-cut codes & cash drawer kick
  chunks.push(Buffer.from([0x1B, 0x64, 0x06]));
  chunks.push(Buffer.from([0x1D, 0x56, 0x41, 0x00])); // GS V 65 0 (Feed & Cut)
  chunks.push(Buffer.from([0x1D, 0x56, 0x01]));       // GS V 1 (Partial Cut)
  chunks.push(Buffer.from([0x1D, 0x56, 0x00]));       // GS V 0 (Full Cut)
  chunks.push(Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA])); // Cash drawer kick pulse

  const finalBuffer = Buffer.concat(chunks);
  return printRawToPrinter(finalBuffer, targetPrinter);
}

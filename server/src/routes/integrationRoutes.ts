import { Router, Request, Response } from 'express';
import { db, runTransaction } from '../db/index.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { logAudit } from '../services/auditService.js';
import { printToWindowsPrinter } from '../services/printerService.js';
import { registerSseClient, broadcastPaymentEvent, getRecentQrPayments, parseSmsNotification, QrPaymentEvent } from '../services/qrPaymentService.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';

export const integrationRouter = Router();

// ==========================================
// 1. THERMAL PRINTER & ESC/POS CONFIG
// ==========================================
integrationRouter.get('/thermal-config', authenticateToken, (req: Request, res: Response) => {
  try {
    const settings = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'thermal_%' OR key LIKE 'receipt_%'").all() as { key: string; value: string }[];
    const configMap: { [key: string]: string } = {};
    settings.forEach(s => { configMap[s.key] = s.value; });

    res.json({
      paperWidth: configMap['thermal_paper_width'] || '80mm', // '80mm' or '58mm'
      autoCut: configMap['thermal_auto_cut'] !== 'false',
      cashDrawerKick: configMap['thermal_cash_drawer_kick'] === 'true',
      receiptHeader: configMap['receipt_header'] || 'NAVEED MEDICAL PHARMACY',
      receiptPhone: configMap['receipt_phone'] || '+92 55 1234567',
      licenseNumber: configMap['receipt_license'] || 'DL-GUJ-2026-9812',
      receiptFooter: configMap['receipt_footer'] || 'Thank you for choosing NMP. Keep medicines below 30°C.',
      returnPolicy: configMap['receipt_return_policy'] || 'Returns accepted within 3 days with original bill. Cold-chain items cannot be returned.'
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve thermal printer config', details: err.message });
  }
});

integrationRouter.put('/thermal-config', authenticateToken, requireRole(['Admin']), (req: Request, res: Response) => {
  try {
    const { paperWidth, autoCut, cashDrawerKick, receiptHeader, receiptPhone, licenseNumber, receiptFooter, returnPolicy } = req.body;
    const userId = (req as any).user.id;

    const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

    if (paperWidth) upsert.run('thermal_paper_width', paperWidth);
    if (autoCut !== undefined) upsert.run('thermal_auto_cut', String(autoCut));
    if (cashDrawerKick !== undefined) upsert.run('thermal_cash_drawer_kick', String(cashDrawerKick));
    if (receiptHeader) upsert.run('receipt_header', receiptHeader);
    if (receiptPhone) upsert.run('receipt_phone', receiptPhone);
    if (licenseNumber) upsert.run('receipt_license', licenseNumber);
    if (receiptFooter) upsert.run('receipt_footer', receiptFooter);
    if (returnPolicy) upsert.run('receipt_return_policy', returnPolicy);

    logAudit({
      userId,
      action: 'THERMAL_PRINTER_CONFIG_UPDATED',
      entity: 'settings',
      entityId: 'thermal_config',
      details: { paperWidth, autoCut, cashDrawerKick },
      req
    });

    res.json({ message: 'Thermal printer configuration updated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update thermal printer config', details: err.message });
  }
});

// ESC/POS Command Generator & Slip Format
integrationRouter.get('/receipt-escpos/:invoiceNumber', authenticateToken, (req: Request, res: Response) => {
  try {
    const invoiceNumber = req.params.invoiceNumber;
    const sale = db.prepare(`
      SELECT s.*, u.username as cashier_name, c.name as customer_name
      FROM sales s
      JOIN users u ON s.cashier_id = u.id
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.invoice_number = ?
    `).get(invoiceNumber) as any;

    if (!sale) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const items = db.prepare(`
      SELECT si.*, m.brand_name, m.dosage_form, b.batch_number, b.expiry_date
      FROM sale_items si
      JOIN medicines m ON si.medicine_id = m.id
      JOIN batches b ON si.batch_id = b.id
      WHERE si.sale_id = ?
    `).all(sale.id) as any[];

    // Generate ESC/POS Command string simulation (Hex / ASCII tokens)
    // ESC @ (Init), ESC E 1 (Bold), GS V 65 0 (Cut), ESC p 0 25 250 (Drawer kick)
    const escposCommands = [
      '\\x1B\\x40', // Initialize printer
      '\\x1B\\x61\\x01', // Center alignment
      '\\x1B\\x45\\x01' + 'NAVEED MEDICAL PHARMACY\\n' + '\\x1B\\x45\\x00',
      '31 32 Chowk Chohan Road Outfall, Near Tariq Pan Shop, Islampura, Lahore\\n',
      'Phone: 03454142863\\n',
      '------------------------------------------------\\n',
      `\\x1B\\x61\\x00Invoice: ${sale.invoice_number}    Date: ${sale.created_at}\\n`,
      `Cashier: ${sale.cashier_name}    Customer: ${sale.customer_name || 'Walk-in'}\\n`,
      '------------------------------------------------\\n',
      'Item                     Qty   Price   Total\\n',
      '------------------------------------------------\\n'
    ];

    items.forEach(item => {
      const name = (item.brand_name + ' ' + (item.dosage_form || '')).slice(0, 22).padEnd(23, ' ');
      const qty = String(item.quantity).padStart(4, ' ');
      const price = item.unit_price.toFixed(2).padStart(8, ' ');
      const total = item.line_total.toFixed(2).padStart(8, ' ');
      escposCommands.push(`${name}${qty} ${price} ${total}\\n`);
      escposCommands.push(`  Batch: ${item.batch_number} Exp: ${item.expiry_date}\\n`);
    });

    escposCommands.push('------------------------------------------------\\n');
    escposCommands.push(`\\x1B\\x61\\x02Subtotal: Rs. ${sale.subtotal.toFixed(2)}\\n`);
    if (sale.discount > 0) escposCommands.push(`Discount: -Rs. ${sale.discount.toFixed(2)}\\n`);
    escposCommands.push(`\\x1B\\x45\\x01TOTAL NET: Rs. ${sale.total_amount.toFixed(2)}\\x1B\\x45\\x00\\n`);
    escposCommands.push(`Paid (${sale.payment_method}): Rs. ${sale.paid_amount.toFixed(2)}\\n`);
    if (sale.change_amount > 0) escposCommands.push(`Change Due: Rs. ${sale.change_amount.toFixed(2)}\\n`);
    if (sale.remaining_amount > 0) escposCommands.push(`Balance Udhar: Rs. ${sale.remaining_amount.toFixed(2)}\\n`);
    escposCommands.push('\\x1B\\x61\\x01\\nThank you for choosing NMP. Get well soon!\\n');
    escposCommands.push('Returns accepted within 3 days with bill.\\n\\n\\n');
    escposCommands.push('\\x1D\\x56\\x41\\x00'); // Partial cut
    escposCommands.push('\\x1B\\x70\\x00\\x19\\xFA'); // Cash drawer kick pulse

    res.json({
      invoiceNumber: sale.invoice_number,
      sale,
      items,
      escposHex: escposCommands.join('')
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate ESC/POS receipt', details: err.message });
  }
});

import { printRawToPrinter } from '../services/printerService.js';

function padBetween(left: string, right: string, width: number = 42): string {
  const l = left.trim();
  const r = right.trim();
  const spaces = Math.max(1, width - l.length - r.length);
  return l + ' '.repeat(spaces) + r;
}

// Direct Hardware Thermal Printing (Windows WinSpool RAW / ESC/POS)
integrationRouter.post('/print-receipt-direct', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { invoiceNumber, printerName } = req.body;
    const targetPrinter = printerName || 'Speed-X 400UL';

    const sale = db.prepare(`
      SELECT s.*, u.username as cashier_name, c.name as customer_name, c.mobile as customer_mobile
      FROM sales s
      JOIN users u ON s.cashier_id = u.id
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.invoice_number = ?
    `).get(invoiceNumber) as any;

    if (!sale) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const items = db.prepare(`
      SELECT si.*, m.brand_name, m.strength, m.dosage_form, b.batch_number, b.expiry_date
      FROM sale_items si
      JOIN medicines m ON si.medicine_id = m.id
      JOIN batches b ON si.batch_id = b.id
      WHERE si.sale_id = ?
    `).all(sale.id) as any[];

    // Fetch store settings
    const settingsRows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'pharmacy_%' OR key LIKE 'receipt_%' OR key LIKE 'license_%' OR key LIKE 'tax_%'").all() as any[];
    const settingsMap: Record<string, string> = {};
    settingsRows.forEach(r => { settingsMap[r.key] = r.value; });

    const pharmacyName = settingsMap['pharmacy_name'] || 'NAVEED MEDICAL PHARMACY (NMP)';
    const phone = settingsMap['pharmacy_phone'] || '03454142863';
    const footer = settingsMap['receipt_footer'] || 'Thank you for choosing NMP. Get well soon!';
    const printFee = 2.00; // Rs. 2 fee on each receipt print

    const chunks: Buffer[] = [
      Buffer.from([0x1B, 0x40]), // ESC @ - Initialize
      Buffer.from([0x1B, 0x61, 0x01]), // ESC a 1 - Center
      Buffer.from([0x1B, 0x45, 0x01]), // ESC E 1 - Bold On
      Buffer.from(`${pharmacyName}\n`, 'utf8'),
      Buffer.from([0x1B, 0x45, 0x00]), // ESC E 0 - Bold Off
      Buffer.from('31 32 Chowk Chohan Road Outfall,\n', 'utf8'),
      Buffer.from('Near Tariq Pan Shop, Islampura, Lahore\n', 'utf8'),
      Buffer.from(`Phone: ${phone}\n`, 'utf8')
    ];

    if (settingsMap['license_number']) {
      chunks.push(Buffer.from(`DSL: ${settingsMap['license_number']}\n`, 'utf8'));
    }

    chunks.push(Buffer.from([0x1B, 0x61, 0x00])); // ESC a 0 - Left align
    chunks.push(Buffer.from('------------------------------------------\n', 'utf8'));

    const saleDate = new Date(sale.created_at || Date.now());
    const dateStr = saleDate.toLocaleDateString();
    const timeStr = saleDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    chunks.push(Buffer.from(padBetween(`Invoice #: ${sale.invoice_number}`, `POS No.: 01`, 42) + '\n', 'utf8'));
    chunks.push(Buffer.from(`Cashier: ${sale.cashier_name || 'Dr. Naveed'}\n`, 'utf8'));
    chunks.push(Buffer.from(padBetween(`Mode of Payment: ${sale.payment_method || 'CASH'}`, `${dateStr} ${timeStr}`, 42) + '\n', 'utf8'));
    chunks.push(Buffer.from(`Customer: ${sale.customer_name || 'CASH SALES-WALKING CUSTOMER A/C'}\n`, 'utf8'));
    chunks.push(Buffer.from('------------------------------------------\n', 'utf8'));
    chunks.push(Buffer.from(padBetween('#  Description', 'Qty   Price     Total', 42) + '\n', 'utf8'));
    chunks.push(Buffer.from('------------------------------------------\n', 'utf8'));

    let totalUnits = 0;
    items.forEach((it, idx) => {
      totalUnits += (it.quantity || 1);
      let brand = (it.brand_name || '').trim();
      const strength = (it.strength || '').trim();
      const normBrand = brand.toLowerCase().replace(/[\s\-_]/g, '');
      const normStrength = strength.toLowerCase().replace(/[\s\-_]/g, '');
      if (normStrength && !normBrand.includes(normStrength)) {
        brand += ` ${strength}`;
      }
      const itemTitle = `${idx + 1}  ${brand}`.trim();
      chunks.push(Buffer.from(`${itemTitle}\n`, 'utf8'));

      const qtyPrice = `     ${it.quantity} x ${Number(it.unit_price).toFixed(2)}`;
      const lineTotalStr = `${Number(it.line_total).toFixed(2)}`;
      chunks.push(Buffer.from(padBetween(qtyPrice, lineTotalStr, 42) + '\n', 'utf8'));
    });

    chunks.push(Buffer.from('------------------------------------------\n', 'utf8'));
    chunks.push(Buffer.from(padBetween(`Total Qty: ${totalUnits}`, `Total Amount:    ${Number(sale.subtotal).toFixed(2)}`, 42) + '\n', 'utf8'));
    chunks.push(Buffer.from(padBetween('', `Sales Tax:         0.00`, 42) + '\n', 'utf8'));
    if (Number(sale.discount) > 0) {
      chunks.push(Buffer.from(padBetween('', `Discount:         -${Number(sale.discount).toFixed(2)}`, 42) + '\n', 'utf8'));
    }
    chunks.push(Buffer.from(padBetween('', `POS Service Fee:   ${printFee.toFixed(2)}`, 42) + '\n', 'utf8'));
    chunks.push(Buffer.from('------------------------------------------\n', 'utf8'));

    chunks.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold on
    chunks.push(Buffer.from(padBetween('Payable:', `${Number(sale.total_amount).toFixed(2)}`, 42) + '\n', 'utf8'));
    chunks.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold off

    chunks.push(Buffer.from(padBetween('Cash Tendered:', `${Number(sale.paid_amount).toFixed(2)}`, 42) + '\n', 'utf8'));
    if (Number(sale.change_amount) > 0) {
      chunks.push(Buffer.from(padBetween('Change Return:', `${Number(sale.change_amount).toFixed(2)}`, 42) + '\n', 'utf8'));
    }
    if (Number(sale.remaining_amount) > 0) {
      chunks.push(Buffer.from(padBetween('Balance Due:', `${Number(sale.remaining_amount).toFixed(2)}`, 42) + '\n', 'utf8'));
    }
    chunks.push(Buffer.from('------------------------------------------\n', 'utf8'));

    // Footer
    chunks.push(Buffer.from([0x1B, 0x61, 0x01])); // Center
    chunks.push(Buffer.from('Thank you for choosing NMP. Get well soon!\n', 'utf8'));
    chunks.push(Buffer.from('Keep medicines below 30°C in dry place.\n', 'utf8'));
    chunks.push(Buffer.from('*** NAVEED MEDICAL PHARMACY ***\n\n', 'utf8'));

    // Feed 6 lines to clear the tear bar completely & partial cut
    chunks.push(Buffer.from([0x1B, 0x64, 0x06]));
    chunks.push(Buffer.from([0x1D, 0x56, 0x41, 0x00]));

    const finalBuffer = Buffer.concat(chunks);
    const printRes = await printRawToPrinter(finalBuffer, targetPrinter);
    if (printRes.success) {
      res.json({ success: true, message: `Receipt sent to ${printRes.printerName || targetPrinter} successfully` });
    } else {
      res.json({ success: false, fallbackToDialog: true, message: printRes.reason || 'Thermal hardware printer not detected on this system' });
    }
  } catch (err: any) {
    console.error('Direct print receipt error:', err);
    res.json({ success: false, fallbackToDialog: true, message: err.message || 'Direct print failed, using dialog fallback' });
  }
});

// Direct Hardware Test Slip Print
integrationRouter.post('/print-test-direct', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { printerName } = req.body;
    const targetPrinter = printerName || 'Speed-X 400UL';

    const chunks: Buffer[] = [
      Buffer.from([0x1B, 0x40]), // ESC @ - Initialize
      Buffer.from([0x1B, 0x61, 0x01]), // Center
      Buffer.from([0x1B, 0x45, 0x01]), // Bold On
      Buffer.from('NAVEED MEDICAL PHARMACY (NMP)\n', 'utf8'),
      Buffer.from([0x1B, 0x45, 0x00]), // Bold Off
      Buffer.from('31 32 Chowk Chohan Road Outfall,\n', 'utf8'),
      Buffer.from('Near Tariq Pan Shop, Islampura, Lahore\n', 'utf8'),
      Buffer.from('Phone: 03454142863\n', 'utf8'),
      Buffer.from([0x1B, 0x61, 0x00]), // Left
      Buffer.from('------------------------------------------\n', 'utf8'),
      Buffer.from(padBetween(`INV: #TEST-${Date.now().toString().slice(-4)}`, new Date().toLocaleDateString(), 42) + '\n', 'utf8'),
      Buffer.from(padBetween('Cashier: Admin', 'Pay: CASH', 42) + '\n', 'utf8'),
      Buffer.from('------------------------------------------\n', 'utf8'),
      Buffer.from(padBetween('#  Description', 'Qty   Price     Total', 42) + '\n', 'utf8'),
      Buffer.from('------------------------------------------\n', 'utf8'),
      Buffer.from('1  Augmentin 625mg Tablet\n', 'utf8'),
      Buffer.from(padBetween('     1 x 52.00', '52.00', 42) + '\n', 'utf8'),
      Buffer.from('2  Panadol Extra 500mg\n', 'utf8'),
      Buffer.from(padBetween('     10 x 4.00', '40.00', 42) + '\n', 'utf8'),
      Buffer.from('------------------------------------------\n', 'utf8'),
      Buffer.from(padBetween('Total Qty: 11', 'Total Amount:    92.00', 42) + '\n', 'utf8'),
      Buffer.from(padBetween('', 'Sales Tax:         0.00', 42) + '\n', 'utf8'),
      Buffer.from(padBetween('', 'Discount:         -0.00', 42) + '\n', 'utf8'),
      Buffer.from(padBetween('', 'POS Service Fee:   2.00', 42) + '\n', 'utf8'),
      Buffer.from('------------------------------------------\n', 'utf8'),
      Buffer.from([0x1B, 0x45, 0x01]),
      Buffer.from(padBetween('Payable:', '94.00', 42) + '\n', 'utf8'),
      Buffer.from([0x1B, 0x45, 0x00]),
      Buffer.from(padBetween('Cash Tendered:', '100.00', 42) + '\n', 'utf8'),
      Buffer.from(padBetween('Change Return:', '6.00', 42) + '\n', 'utf8'),
      Buffer.from('------------------------------------------\n', 'utf8'),
      Buffer.from([0x1B, 0x61, 0x01]),
      Buffer.from('Thank you for choosing NMP! Get well soon!\n', 'utf8'),
      Buffer.from('Keep medicines below 30°C.\n', 'utf8'),
      Buffer.from('*** SPEED-X 400UL HARDWARE VERIFIED ***\n\n', 'utf8'),
      Buffer.from([0x1B, 0x64, 0x06]), // Feed 6 lines so text fully clears the cutter/tear bar
      Buffer.from([0x1D, 0x56, 0x41, 0x00]) // Partial cut
    ];

    const finalBuffer = Buffer.concat(chunks);
    const printRes = await printRawToPrinter(finalBuffer, targetPrinter);
    if (printRes.success) {
      res.json({ success: true, message: `Test receipt printed on ${printRes.printerName || targetPrinter} successfully!` });
    } else {
      res.json({ success: false, fallbackToDialog: true, message: printRes.reason || 'Hardware printer not available' });
    }
  } catch (err: any) {
    console.error('Direct test print error:', err);
    res.json({ success: false, fallbackToDialog: true, message: err.message || 'Direct test print failed' });
  }
});

// ==========================================
// 2. BARCODE LABEL GENERATOR & SHELF TAGS
// ==========================================
integrationRouter.get('/barcode-labels', authenticateToken, (req: Request, res: Response) => {
  try {
    const { batchIds, medicineIds } = req.query;

    let query = `
      SELECT 
        b.id as batch_id,
        b.batch_number,
        b.expiry_date,
        b.sale_price,
        b.rack_location as shelf_rack,
        m.id as medicine_id,
        m.brand_name,
        m.strength,
        m.dosage_form,
        m.barcode,
        m.custom_barcode
      FROM batches b
      JOIN medicines m ON b.medicine_id = m.id
      WHERE b.quantity > 0 AND b.status = 'ACTIVE'
    `;
    const params: any[] = [];

    if (batchIds) {
      const ids = String(batchIds).split(',').map(Number);
      query += ` AND b.id IN (${ids.map(() => '?').join(',')}) `;
      params.push(...ids);
    } else if (medicineIds) {
      const ids = String(medicineIds).split(',').map(Number);
      query += ` AND m.id IN (${ids.map(() => '?').join(',')}) `;
      params.push(...ids);
    } else {
      query += ` LIMIT 50 `;
    }

    const labels = db.prepare(query).all(...params) as any[];

    const formattedLabels = labels.map(l => ({
      batchId: l.batch_id,
      brandName: l.brand_name,
      strength: l.strength,
      dosageForm: l.dosage_form,
      barcode: l.barcode || l.custom_barcode || `NMP-${l.medicine_id.toString().padStart(5, '0')}`,
      batchNumber: l.batch_number,
      expiryDate: l.expiry_date,
      salePrice: l.sale_price,
      currency: 'Rs.',
      rackLocation: l.shelf_rack || 'A-1',
      pharmacyHeader: 'Naveed Medical Pharmacy'
    }));

    res.json({
      count: formattedLabels.length,
      labels: formattedLabels
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate barcode labels', details: err.message });
  }
});

// ==========================================
// 3. BULK CSV IMPORT ENGINE (MEDICINES)
// ==========================================
integrationRouter.post('/bulk-import/medicines', authenticateToken, requireRole(['Admin', 'Pharmacist']), (req: Request, res: Response) => {
  try {
    const { csvContent } = req.body;
    const userId = (req as any).user.id;

    if (!csvContent || typeof csvContent !== 'string') {
      return res.status(400).json({ error: 'Valid CSV content is required.' });
    }

    const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV file must have a header row and at least one data row.' });
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const brandIdx = headers.indexOf('brand_name');
    const genericIdx = headers.indexOf('generic_name');
    const strengthIdx = headers.indexOf('strength');
    const dosageIdx = headers.indexOf('dosage_form');
    const barcodeIdx = headers.indexOf('barcode');
    const rackIdx = headers.indexOf('rack_location');
    const packIdx = headers.indexOf('pack_size');

    if (brandIdx === -1) {
      return res.status(400).json({ error: 'Missing required column "brand_name" in CSV header.' });
    }

    const errors: { row: number; reason: string }[] = [];
    let insertedCount = 0;

    runTransaction(() => {
      const insertMed = db.prepare(`
        INSERT INTO medicines (
          brand_name, generic_id, category_id, strength, dosage_form,
          pack_size, barcode, custom_barcode, rack_location, min_stock_level, reorder_level
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 10, 20)
        ON CONFLICT(barcode) DO UPDATE SET
          brand_name = excluded.brand_name,
          strength = excluded.strength,
          dosage_form = excluded.dosage_form,
          pack_size = excluded.pack_size,
          rack_location = excluded.rack_location
      `);

      const getGenericId = db.prepare('SELECT id FROM generics WHERE LOWER(name) = LOWER(?)');
      const insertGeneric = db.prepare("INSERT INTO generics (name, therapeutic_class) VALUES (?, 'Imported Class')");

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        // Parse CSV line handling potential quotes
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const brand = cols[brandIdx];
        if (!brand) {
          errors.push({ row: i + 1, reason: 'Empty brand name' });
          continue;
        }

        let genericId = 1;
        if (genericIdx !== -1 && cols[genericIdx]) {
          const genName = cols[genericIdx];
          const found = getGenericId.get(genName) as { id: number } | undefined;
          if (found) {
            genericId = found.id;
          } else {
            const newGen = insertGeneric.run(genName);
            genericId = Number(newGen.lastInsertRowid);
          }
        }

        const strength = strengthIdx !== -1 ? cols[strengthIdx] || '500mg' : '500mg';
        const dosage = dosageIdx !== -1 ? cols[dosageIdx] || 'Tablet' : 'Tablet';
        const barcode = barcodeIdx !== -1 && cols[barcodeIdx] ? cols[barcodeIdx] : null;
        const rack = rackIdx !== -1 ? cols[rackIdx] || 'Rack Gen' : 'Rack Gen';
        const pack = packIdx !== -1 ? parseInt(cols[packIdx], 10) || 1 : 1;

        try {
          const res = insertMed.run(
            brand,
            genericId,
            1, // General category default
            strength,
            dosage,
            pack,
            barcode,
            `MED-IMP-${Date.now()}-${i}`,
            rack
          );
          if (res.changes > 0) {
            insertedCount++;
          }
        } catch (e: any) {
          errors.push({ row: i + 1, reason: e.message });
        }
      }
    });

    logAudit({
      userId,
      action: 'BULK_IMPORT_MEDICINES',
      entity: 'medicines',
      entityId: `imported_${insertedCount}`,
      newValues: { insertedCount, errorCount: errors.length }
    });

    res.json({
      message: `Bulk import completed: ${insertedCount} medicines added.`,
      insertedCount,
      errorCount: errors.length,
      errors
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to process bulk medicines import', details: err.message });
  }
});

// ==========================================
// 4. SAMPLE CSV TEMPLATES
// ==========================================
integrationRouter.get('/sample-csv/:template', (req: Request, res: Response) => {
  const { template } = req.params;
  let csv = '';
  let filename = 'template.csv';

  if (template === 'medicines') {
    filename = 'medicines_import_template.csv';
    csv = 'brand_name,generic_name,strength,dosage_form,barcode,rack_location,pack_size\n' +
          'Panadol Extra,Paracetamol,500mg,Tablet,896400099991,Rack A-1,200\n' +
          'Brufen 400mg,Ibuprofen,400mg,Tablet,896400099992,Rack A-2,100\n' +
          'Disprin,Aspirin,300mg,Tablet,896400099993,Rack A-3,300\n';
  } else {
    filename = 'batches_import_template.csv';
    csv = 'medicine_barcode,batch_number,mfg_date,expiry_date,purchase_price,sale_price,quantity\n' +
          '896400012345,BCH-2026-01,2025-01-01,2027-12-31,2.50,3.50,500\n';
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

// ==========================================
// 5. PHYSICAL QR PAYMENT WEBHOOK & REAL-TIME SSE
// ==========================================

// SSE stream for real-time POS payment arrival alerts
integrationRouter.get('/qr-events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  registerSseClient(res);

  // Send initial connected ping
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'QR Payment Stream Active' })}\n\n`);
});

// Webhook for incoming mobile payment notifications (SMS forwarder / Bank Webhook)
integrationRouter.post('/qr-webhook', (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    let eventData: Partial<QrPaymentEvent> = {};

    if (body.smsBody || body.message || body.text) {
      // Incoming raw SMS payload
      const smsText = body.smsBody || body.message || body.text;
      const sender = body.sender || body.from || '';
      eventData = parseSmsNotification(smsText, sender);
    } else {
      // Structured JSON payload
      eventData = {
        provider: (body.provider || 'OTHER').toUpperCase(),
        amount: Number(body.amount || 0),
        trxId: body.trxId || body.transactionId || 'TRX-' + Date.now().toString().slice(-6),
        senderMobile: body.senderMobile || body.sender || ''
      };
    }

    if (!eventData.amount || eventData.amount <= 0) {
      return res.status(400).json({ error: 'Valid payment amount is required', received: body });
    }

    const paymentEvent: QrPaymentEvent = {
      id: 'PAY-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      provider: (eventData.provider as any) || 'OTHER',
      amount: eventData.amount,
      trxId: eventData.trxId || 'TRX-' + Date.now().toString().slice(-6),
      senderMobile: eventData.senderMobile,
      rawText: eventData.rawText,
      timestamp: new Date().toISOString(),
      status: 'PENDING'
    };

    // Broadcast in real-time to POS screens
    broadcastPaymentEvent(paymentEvent);

    console.log(`[QR_PAYMENT_RECEIVED] Provider: ${paymentEvent.provider} | Amount: Rs. ${paymentEvent.amount} | TID: ${paymentEvent.trxId}`);

    res.json({
      success: true,
      message: `Payment of Rs. ${paymentEvent.amount} broadcasted to POS`,
      payment: paymentEvent
    });
  } catch (err: any) {
    console.error('[QR_WEBHOOK_ERROR]', err);
    res.status(500).json({ error: 'Failed to process QR payment webhook', details: err.message });
  }
});

// Simulator endpoint to test QR payment arrival easily from UI or curl
integrationRouter.post('/qr-simulate', (req: Request, res: Response) => {
  try {
    const { amount, provider, trxId } = req.body;
    const paymentEvent: QrPaymentEvent = {
      id: 'SIM-' + Date.now(),
      provider: provider || 'NAYAPAY',
      amount: Number(amount || 94.00),
      trxId: trxId || 'SIM-' + Math.floor(100000 + Math.random() * 900000),
      timestamp: new Date().toISOString(),
      status: 'PENDING'
    };

    broadcastPaymentEvent(paymentEvent);

    res.json({
      success: true,
      message: `Simulated QR payment of Rs. ${paymentEvent.amount} triggered successfully!`,
      payment: paymentEvent
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to simulate QR payment', details: err.message });
  }
});

// Fetch recent QR payments
integrationRouter.get('/qr-recent', authenticateToken, (req: Request, res: Response) => {
  res.json({
    payments: getRecentQrPayments()
  });
});


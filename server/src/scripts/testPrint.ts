import { printRawToPrinter } from '../services/printerService.js';

function padBetween(left: string, right: string, width: number = 42): string {
  const l = left.trim();
  const r = right.trim();
  const spaces = Math.max(1, width - l.length - r.length);
  return l + ' '.repeat(spaces) + r;
}

import path from 'path';
import fs from 'fs';

const chunks: Buffer[] = [
  Buffer.from([0x1B, 0x40]) // 1. Initialize printer
];

const logoFile1 = path.resolve(process.cwd(), 'data/logo_escpos.bin');
const logoFile2 = path.resolve(process.cwd(), 'server/data/logo_escpos.bin');
if (fs.existsSync(logoFile1)) {
  chunks.push(fs.readFileSync(logoFile1));
} else if (fs.existsSync(logoFile2)) {
  chunks.push(fs.readFileSync(logoFile2));
}

// 2. Header (Centered, Bold Store Name)
chunks.push(Buffer.from([0x1B, 0x61, 0x01])); // Align Center
chunks.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold On
chunks.push(Buffer.from('NAVEED MEDICAL PHARMACY (NMP)\n', 'utf8'));
chunks.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold Off
chunks.push(Buffer.from('31 32 Chowk Chohan Road Outfall,\n', 'utf8'));
chunks.push(Buffer.from('Islampura, Lahore\n', 'utf8'));
chunks.push(Buffer.from('Phone: 03454142863\n', 'utf8'));

// 3. Divider & Info (Left-aligned)
chunks.push(Buffer.from([0x1B, 0x61, 0x00])); // Align Left
chunks.push(Buffer.from('------------------------------------------\n', 'utf8'));
chunks.push(Buffer.from(padBetween('Invoice: #INV-20260912-0023', '09/12/2026 06:20 PM', 42) + '\n', 'utf8'));
chunks.push(Buffer.from(padBetween('Cashier: Admin', 'Pay: CASH', 42) + '\n', 'utf8'));
chunks.push(Buffer.from('------------------------------------------\n', 'utf8'));

// 4. Items Table
chunks.push(Buffer.from(padBetween('#  Description', 'Qty   Price     Total', 42) + '\n', 'utf8'));
chunks.push(Buffer.from('------------------------------------------\n', 'utf8'));

// Item 1
chunks.push(Buffer.from('1  Augmentin 625mg Tablet\n', 'utf8'));
chunks.push(Buffer.from(padBetween('     1 x 52.00', '52.00', 42) + '\n', 'utf8'));

// Item 2
chunks.push(Buffer.from('2  Panadol Extra 500mg\n', 'utf8'));
chunks.push(Buffer.from(padBetween('     10 x 4.00', '40.00', 42) + '\n', 'utf8'));

// 5. Totals Breakdown
chunks.push(Buffer.from('------------------------------------------\n', 'utf8'));
chunks.push(Buffer.from(padBetween('Total Qty: 11', 'Total Amount:    92.00', 42) + '\n', 'utf8'));
chunks.push(Buffer.from(padBetween('', 'Sales Tax:         0.00', 42) + '\n', 'utf8'));
chunks.push(Buffer.from(padBetween('', 'Discount:         -0.00', 42) + '\n', 'utf8'));
chunks.push(Buffer.from(padBetween('', 'POS Service Fee:   2.00', 42) + '\n', 'utf8'));
chunks.push(Buffer.from('------------------------------------------\n', 'utf8'));

chunks.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold On
chunks.push(Buffer.from(padBetween('Payable:', '94.00', 42) + '\n', 'utf8'));
chunks.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold Off
chunks.push(Buffer.from(padBetween('Cash Tendered:', '100.00', 42) + '\n', 'utf8'));
chunks.push(Buffer.from(padBetween('Change Return:', '6.00', 42) + '\n', 'utf8'));
chunks.push(Buffer.from('------------------------------------------\n', 'utf8'));

// 6. Footer (Centered)
chunks.push(Buffer.from([0x1B, 0x61, 0x01])); // Align Center
chunks.push(Buffer.from('Thank you for choosing NMP! Get well soon!\n', 'utf8'));
chunks.push(Buffer.from('Keep medicines below 30°C.\n', 'utf8'));
chunks.push(Buffer.from('*** NAVEED MEDICAL PHARMACY ***\n\n', 'utf8'));

// 7. Feed 6 lines so paper pushes completely past the tear bar, plus partial cut
chunks.push(Buffer.from([0x1B, 0x64, 0x06])); // Feed 6 lines
chunks.push(Buffer.from([0x1D, 0x56, 0x41, 0x00])); // ESC/POS Partial cut

const finalBuffer = Buffer.concat(chunks);

printRawToPrinter(finalBuffer, 'Speed-X 400UL')
  .then(() => console.log('RAW_PRINT_SUCCESS'))
  .catch(e => console.error('RAW_PRINT_ERROR:', e));

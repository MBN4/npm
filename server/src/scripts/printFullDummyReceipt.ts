import { printRawToPrinter } from '../services/printerService.js';
import { renderLogoRaster, paperWidthDots } from '../services/receiptGraphics.js';

function padBetween(left: string, right: string, totalWidth: number): string {
  const spaceNeeded = Math.max(1, totalWidth - (left.length + right.length));
  return left + ' '.repeat(spaceNeeded) + right;
}

export async function printFullDummyReceipt() {
  const lineWidth = 44; // Standard 80mm ESC/POS line width
  const paperDots = paperWidthDots('80mm'); // 576 dots
  const chunks: Buffer[] = [];

  // 1. Initialize
  chunks.push(Buffer.from([0x1B, 0x40])); // ESC @ - Reset

  // 2. Logo Raster Graphic
  try {
    const logoRaster = await renderLogoRaster(Math.round(paperDots * 0.32), paperDots);
    if (logoRaster) {
      chunks.push(logoRaster);
      chunks.push(Buffer.from([0x1B, 0x64, 0x01])); // 1 line feed after logo
    }
  } catch (err) {
    console.warn('Could not render logo raster:', err);
  }

  // 3. Header Text
  chunks.push(Buffer.from([0x1B, 0x61, 0x01])); // ESC a 1 - Center
  chunks.push(Buffer.from([0x1B, 0x21, 0x30])); // Double height + Double width
  chunks.push(Buffer.from('NAVEED MEDICAL\nPHARMACY (NMP)\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x21, 0x00])); // Reset font size

  chunks.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold On
  chunks.push(Buffer.from('Complete Healthcare & Clinical Pharmacy\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold Off

  chunks.push(Buffer.from('Chowk Chohan Road Outfall, Islampura, Lahore\n', 'utf8'));
  chunks.push(Buffer.from('Helpline / WhatsApp: 0345-4142863\n', 'utf8'));
  chunks.push(Buffer.from('Govt Drug License No: DL-GUJ-2026-9812\n', 'utf8'));

  chunks.push(Buffer.from('='.repeat(lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x45, 0x01]));
  chunks.push(Buffer.from('OFFICIAL CASH MEMO / SALES INVOICE\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x45, 0x00]));
  chunks.push(Buffer.from('='.repeat(lineWidth) + '\n', 'utf8'));

  // 4. Invoice Metadata
  chunks.push(Buffer.from([0x1B, 0x61, 0x00])); // ESC a 0 - Left align
  const invNo = 'INV-20261031-0090';
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

  chunks.push(Buffer.from(padBetween(`Inv #: ${invNo}`, `Date: ${dateStr}`, lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from(padBetween(`Counter: POS-01 (Main)`, `Time: ${timeStr}`, lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from(padBetween(`Cashier: Muhammad Ali (#104)`, `Mode: WALK-IN`, lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from(`Customer: Muhammad Usman (0300-1234567)\n`, 'utf8'));

  chunks.push(Buffer.from('-'.repeat(lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from(padBetween('Item / Batch / Expiry', 'Qty  Price    Total', lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from('-'.repeat(lineWidth) + '\n', 'utf8'));

  // 5. Line Items
  const items = [
    {
      name: 'Augmentin 625mg Tablet (GSK)',
      batch: 'AG-9821',
      exp: '09/2027',
      qtyStr: '1 Pack (10s)',
      calc: '1 x 385.00',
      total: '385.00'
    },
    {
      name: 'Panadol Extra 500mg (Haleon)',
      batch: 'PN-4412',
      exp: '11/2027',
      qtyStr: '2 Strips (20s)',
      calc: '2 x 45.00',
      total: '90.00'
    },
    {
      name: 'Risek 20mg Capsule (Getz Pharma)',
      batch: 'RK-1055',
      exp: '04/2027',
      qtyStr: '1 Box (14s)',
      calc: '1 x 340.00',
      total: '340.00'
    },
    {
      name: 'Hydryllin Syrup 120ml (Searle)',
      batch: 'HY-3309',
      exp: '08/2026',
      qtyStr: '1 Bottle',
      calc: '1 x 135.00',
      total: '135.00'
    }
  ];

  items.forEach((it, idx) => {
    chunks.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold
    chunks.push(Buffer.from(`${idx + 1}. ${it.name}\n`, 'utf8'));
    chunks.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold Off
    chunks.push(Buffer.from(`   Batch: ${it.batch}   Exp: ${it.exp}\n`, 'utf8'));
    chunks.push(Buffer.from(padBetween(`   ${it.qtyStr} (${it.calc})`, `Rs. ${it.total}`, lineWidth) + '\n', 'utf8'));
  });

  // 6. Totals with Rs. 2.00 POS Service Fee
  chunks.push(Buffer.from('-'.repeat(lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from(padBetween('Total Line Items: 4', 'Total Units: 45', lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from(padBetween('Gross Sub Total:', 'Rs.  950.00', lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from(padBetween('Special Discount (5%):', '-Rs.   47.50', lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from(padBetween('Sales Tax / GST (0%):', 'Rs.    0.00', lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from(padBetween('POS Service Fee:', 'Rs.    2.00', lineWidth) + '\n', 'utf8'));

  chunks.push(Buffer.from([0x1B, 0x45, 0x01])); // Bold
  chunks.push(Buffer.from('='.repeat(lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from(padBetween('NET GRAND TOTAL:', 'Rs.  904.50', lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from('='.repeat(lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x45, 0x00])); // Bold Off

  // 7. Payment info
  chunks.push(Buffer.from(padBetween('Cash Tendered:', 'Rs. 1,000.00', lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x45, 0x01]));
  chunks.push(Buffer.from(padBetween('Change Returned:', 'Rs.    95.50', lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x45, 0x00]));
  chunks.push(Buffer.from(padBetween('Payment Method:', 'CASH COUNTER', lineWidth) + '\n', 'utf8'));

  // 8. Clinical Advisory & Policies
  chunks.push(Buffer.from([0x1B, 0x61, 0x01])); // Center
  chunks.push(Buffer.from('-'.repeat(lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x45, 0x01]));
  chunks.push(Buffer.from('CLINICAL ADVISORY & STORAGE\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x45, 0x00]));
  chunks.push(Buffer.from('Store all medicines in a cool, dry place (<30C).\n', 'utf8'));
  chunks.push(Buffer.from('Keep all medicines out of reach of children.\n', 'utf8'));
  chunks.push(Buffer.from('Take antibiotics strictly as prescribed by doctor.\n', 'utf8'));

  chunks.push(Buffer.from('-'.repeat(lineWidth) + '\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x45, 0x01]));
  chunks.push(Buffer.from('STORE RETURN POLICY\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x45, 0x00]));
  chunks.push(Buffer.from('Returns accepted within 3 days with this bill.\n', 'utf8'));
  chunks.push(Buffer.from('Cold-chain / fridge & cut strips NOT returnable.\n', 'utf8'));
  chunks.push(Buffer.from('--------------------------------------------\n', 'utf8'));

  // 9. Footer
  chunks.push(Buffer.from([0x1B, 0x45, 0x01]));
  chunks.push(Buffer.from('Thank You For Choosing NMP!\n', 'utf8'));
  chunks.push(Buffer.from('*** YOUR HEALTH, OUR PRIORITY ***\n', 'utf8'));
  chunks.push(Buffer.from([0x1B, 0x45, 0x00]));
  chunks.push(Buffer.from('Proprietor: Naveed Ahmed Khan\n\n', 'utf8'));

  // 10. Feed 6 lines, partial cut, cash drawer kick
  chunks.push(Buffer.from([0x1B, 0x64, 0x06])); // ESC d 6 - Feed lines past tear bar
  chunks.push(Buffer.from([0x1D, 0x56, 0x41, 0x00])); // GS V 65 0 - Cut
  chunks.push(Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA])); // ESC p - Drawer kick pulse

  const finalBuffer = Buffer.concat(chunks);
  const result = await printRawToPrinter(finalBuffer, 'Speed-X 400UL');
  console.log('PRINT RESULT WITH LOGO & POS FEE:', JSON.stringify(result, null, 2));
  return result;
}

printFullDummyReceipt();

import { printToWindowsPrinter } from '../services/printerService.js';

const sample = [
  '================================',
  ' NAVEED MEDICAL PHARMACY (NMP)  ',
  '31 32 chowk chohan road outfall,',
  'near tariq pan shop, Islampura, ',
  '         Lahore, 54000          ',
  '       Phone: 03454142863       ',
  '--------------------------------',
  'Invoice: #INV-20260912-0023     ',
  'Date: 12/09/2026        06:20 PM',
  'Cashier: Admin         Pay: CASH',
  '--------------------------------',
  'Item                Price  Total',
  '--------------------------------',
  'Augmentin 625mg Tablet          ',
  '  B#:AUG-26-01   Exp:2026-10    ',
  '  1 x 52.00            Rs. 52.00',
  '--------------------------------',
  'Total Items: 1 (1 Units)        ',
  'Subtotal:              Rs. 52.00',
  'Receipt Fee:           Rs.  1.00',
  '--------------------------------',
  'NET TOTAL:             Rs. 53.00',
  'Cash Tendered:         Rs. 53.00',
  'Change Return:         Rs.  0.00',
  '--------------------------------',
  ' Thank you for choosing NMP!    ',
  ' Get well soon! Keep meds < 30C ',
  '  Returns with bill in 7 days   ',
  '*** NAVEED MEDICAL PHARMACY *** ',
  '================================'
].join('\r\n');

printToWindowsPrinter(sample, 'Speed-X 400UL')
  .then(() => console.log('PRINT_SUCCESS'))
  .catch(e => console.error('PRINT_ERROR:', e));

/**
 * ESC/POS & Thermal Receipt Printing Utility
 * Optimized for Speed-X 400UL (80mm Auto-Cutter) and 58mm compact POS printers.
 */

export function printThermalElement(elementOrId: HTMLElement | string, paperWidth: '80mm' | '58mm' = '80mm') {
  const elem = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
  if (!elem) {
    window.print();
    return;
  }

  // Create an isolated hidden iframe to isolate the receipt document
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  const widthCss = paperWidth === '58mm' ? '54mm' : '76mm';
  const maxWidthCss = paperWidth === '58mm' ? '58mm' : '80mm';

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>NMP Receipt</title>
        <meta charset="utf-8" />
        <style>
          @page {
            size: auto;
            margin: 0mm !important;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            margin: 0 !important;
            padding: 2mm 3mm 14mm 3mm !important;
            width: ${widthCss} !important;
            max-width: ${maxWidthCss} !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: 'JetBrains Mono', 'Courier New', Courier, monospace !important;
            font-size: 11px !important;
            line-height: 1.35 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            color: #000000 !important;
          }
          .no-print {
            display: none !important;
          }
        </style>
      </head>
      <body>
        ${elem.innerHTML}
      </body>
    </html>
  `);
  doc.close();

  iframe.contentWindow?.focus();
  setTimeout(() => {
    try {
      iframe.contentWindow?.print();
    } catch (e) {
      console.error('Error invoking iframe print:', e);
      window.print();
    } finally {
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1500);
    }
  }, 250);
}

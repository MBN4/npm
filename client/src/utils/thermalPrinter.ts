/**
 * ESC/POS & Thermal Receipt Printing Utility
 * Optimized for Speed-X 400UL (80mm Auto-Cutter) and 58mm compact POS printers.
 */

/**
 * Prints a sticker/label-sized element (e.g. the 38x28mm Speed-X label) through the browser's
 * own print dialog, sized to the label's exact physical dimensions via @page. This works
 * regardless of where the app's backend is hosted - unlike a server-side raw-printer call,
 * which can only reach a printer physically attached to the same machine the server process
 * runs on. Pass labelCount > 1 to print that many copies of the same label.
 */
export function printLabelElement(elementOrId: HTMLElement | string, widthMm: number, heightMm: number, labelCount: number = 1) {
  const elem = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
  if (!elem) {
    window.print();
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '200px';
  iframe.style.height = '200px';
  iframe.style.border = '0';
  iframe.style.opacity = '0.01';
  iframe.style.pointerEvents = 'none';
  iframe.style.zIndex = '-9999';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  const copies = Math.max(1, Math.min(500, Math.floor(labelCount) || 1));
  const labelsHtml = Array.from({ length: copies }).map(() => `<div class="label">${elem.innerHTML}</div>`).join('');

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>NMP Label</title>
        <meta charset="utf-8" />
        <style>
          @page {
            size: ${widthMm}mm ${heightMm}mm;
            margin: 0;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .label {
            width: ${widthMm}mm;
            height: ${heightMm}mm;
            page-break-after: always;
            overflow: hidden;
          }
          .label:last-child {
            page-break-after: auto;
          }
        </style>
      </head>
      <body>
        ${labelsHtml}
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

export interface PrintDiagnosticResult {
  success: boolean;
  elementFound: boolean;
  paperWidth: '80mm' | '58mm';
  error?: string;
  advice: string[];
}

/**
 * Diagnostic helper that inspects the browser print readiness, element integrity,
 * and advises how to resolve physical printer issues on live/cloud sites.
 */
export function diagnosePrinterEnvironment(elementOrId: HTMLElement | string, paperWidth: '80mm' | '58mm' = '80mm'): PrintDiagnosticResult {
  const elem = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
  const advice: string[] = [];
  const elementFound = Boolean(elem && elem.innerHTML.trim().length > 0);

  if (!elementFound) {
    advice.push('Target receipt element not found in DOM or is completely empty.');
  }

  advice.push('When the Chrome/Edge print dialog opens, set Destination to: "Speed-X 400UL".');
  advice.push('Under More Settings, select Paper Size: "80mm / Receipt" (or 80 x 297mm).');
  advice.push('Set Margins to: "None" so text aligns precisely with thermal paper boundaries.');
  advice.push('Ensure the physical USB cable is plugged into your PC/laptop (USB001) and blue light is on.');

  return {
    success: elementFound,
    elementFound,
    paperWidth,
    advice
  };
}

export function printThermalElement(
  elementOrId: HTMLElement | string,
  paperWidth: '80mm' | '58mm' = '80mm',
  onError?: (err: Error, advice: string[]) => void
): boolean {
  try {
    const elem = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
    if (!elem) {
      console.warn('[thermalPrinter] Target element not found, falling back to window.print()');
      window.print();
      return false;
    }

    // Create an isolated iframe to format the thermal receipt document
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '200px';
    iframe.style.height = '200px';
    iframe.style.border = '0';
    iframe.style.opacity = '0.01';
    iframe.style.pointerEvents = 'none';
    iframe.style.zIndex = '-9999';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      console.warn('[thermalPrinter] Could not acquire iframe document context, falling back to window.print()');
      window.print();
      return false;
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
      } catch (e: any) {
        console.error('[thermalPrinter] Error invoking iframe print:', e);
        if (onError) {
          onError(e, [
            'Direct iframe print encountered a browser security restriction.',
            'Triggering standard print fallback...',
            'Check that popups/print permissions are allowed in your browser address bar.'
          ]);
        }
        window.print();
      } finally {
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 1500);
      }
    }, 250);

    return true;
  } catch (err: any) {
    console.error('[thermalPrinter] Critical error in printThermalElement:', err);
    if (onError) {
      onError(err, [
        'Browser printing engine failed to initialize.',
        'Ensure the page is not in reading mode or blocking print dialogs.'
      ]);
    }
    window.print();
    return false;
  }
}

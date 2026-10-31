/**
 * Direct Hardware Printing Utility for Speed-X 400UL
 * Sends ESC/POS byte buffers directly to Windows WinSpool spooler over USB.
 * 
 * Benefits over window.print():
 * 1. Zero Browser Dialog: No popup, no printer dropdown selection required.
 * 2. High-Res Monochrome Logo: Raster image printed crisply without browser compression.
 * 3. Exact Layout & Alignment: Solid/dashed dividing lines, monospaced columns.
 * 4. Automatic Paper Cut: Sends ESC/POS cutter command (GS V 65 / GS V 1 / GS V 0).
 * 5. Instant Execution: Hardware spooler prints in under 1 second.
 */

export interface HardwarePrinterStatus {
  available: boolean;
  printerName: string;
  port?: string;
  isDefault?: boolean;
  error?: string;
}

export interface DirectHardwarePrintResult {
  success: boolean;
  message: string;
  printerName?: string;
  fallbackToDialog?: boolean;
}

const LOCAL_BRIDGES = [
  '/api/integrations',
  'http://127.0.0.1:5000/api/integrations',
  'http://localhost:5000/api/integrations'
];

/**
 * Checks if the Speed-X 400UL hardware printer daemon is reachable on this machine.
 */
export async function detectSpeedXPrinter(timeoutMs = 1800): Promise<HardwarePrinterStatus> {
  for (const baseUrl of LOCAL_BRIDGES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(`${baseUrl}/speedx-status`, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        return {
          available: !!data.available,
          printerName: data.printerName || 'Speed-X 400UL',
          port: data.port || 'USB001',
          isDefault: data.isDefault || false
        };
      }
    } catch {
      // Try next endpoint
    }
  }

  return {
    available: false,
    printerName: 'Speed-X 400UL',
    error: 'Speed-X 400UL direct print bridge is not responding on 127.0.0.1:5000.'
  };
}

/**
 * Sends receipt data directly to the local Windows spooler for Speed-X 400UL.
 * Bypasses Chrome print dialogue completely.
 */
export async function printReceiptDirectHardware(
  invoiceDataOrNumber: any,
  timeoutMs = 6000
): Promise<DirectHardwarePrintResult> {
  const payload = typeof invoiceDataOrNumber === 'string'
    ? { invoiceNumber: invoiceDataOrNumber, printerName: 'Speed-X 400UL' }
    : { invoiceData: invoiceDataOrNumber, printerName: 'Speed-X 400UL' };

  for (const baseUrl of LOCAL_BRIDGES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(`${baseUrl}/print-receipt-direct`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          return {
            success: true,
            message: data.message || 'Receipt printed & cut automatically on Speed-X 400UL!',
            printerName: data.printerName || 'Speed-X 400UL'
          };
        } else if (data.fallbackToDialog) {
          return {
            success: false,
            fallbackToDialog: true,
            message: data.message || 'Hardware printer offline'
          };
        }
      }
    } catch {
      // Continue to next bridge endpoint
    }
  }

  return {
    success: false,
    fallbackToDialog: true,
    message: 'Local Speed-X 400UL print service is unreachable on port 5000.'
  };
}

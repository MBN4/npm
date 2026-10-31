/**
 * Direct Hardware Printing Utility for Speed-X 400UL
 * Supports both WebSocket bridge (ws://127.0.0.1:5001 - works from HTTPS live website)
 * and local HTTP bridge.
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

const WS_BRIDGE_URL = 'ws://127.0.0.1:5001';

/**
 * Checks if the Speed-X 400UL printer daemon is active via WebSocket (works on HTTPS live sites)
 */
function checkStatusViaWebSocket(timeoutMs = 1200): Promise<HardwarePrinterStatus | null> {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(WS_BRIDGE_URL);
      let finished = false;
      const timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          try { ws.close(); } catch {}
          resolve(null);
        }
      }, timeoutMs);

      ws.onopen = () => {
        ws.send(JSON.stringify({ action: 'STATUS' }));
      };

      ws.onmessage = (event) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        try {
          const res = JSON.parse(event.data);
          try { ws.close(); } catch {}
          if (res.action === 'STATUS_RESULT') {
            resolve({
              available: !!res.available,
              printerName: res.printerName || 'Speed-X 400UL',
              port: res.port || 'USB001'
            });
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      };

      ws.onerror = () => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          try { ws.close(); } catch {}
          resolve(null);
        }
      };
    } catch {
      resolve(null);
    }
  });
}

/**
 * Sends receipt print payload over local WebSocket bridge (works seamlessly from HTTPS live sites)
 */
function printViaWebSocket(payload: any, timeoutMs = 7000): Promise<DirectHardwarePrintResult | null> {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(WS_BRIDGE_URL);
      let finished = false;
      const timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          try { ws.close(); } catch {}
          resolve(null);
        }
      }, timeoutMs);

      ws.onopen = () => {
        ws.send(JSON.stringify({ action: 'PRINT', ...payload }));
      };

      ws.onmessage = (event) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        try {
          const res = JSON.parse(event.data);
          try { ws.close(); } catch {}
          if (res.action === 'PRINT_RESULT') {
            resolve({
              success: !!res.success,
              message: res.message || 'Receipt printed & cut automatically on Speed-X 400UL!',
              printerName: 'Speed-X 400UL',
              fallbackToDialog: !res.success
            });
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      };

      ws.onerror = () => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          try { ws.close(); } catch {}
          resolve(null);
        }
      };
    } catch {
      resolve(null);
    }
  });
}

/**
 * Checks if the Speed-X 400UL hardware printer daemon is reachable on this machine
 * (either directly on localhost or via live cloud relay from HTTPS web app).
 */
export async function detectSpeedXPrinter(): Promise<HardwarePrinterStatus> {
  // 1. Try WebSocket bridge first (if on localhost or non-secure context)
  const wsStatus = await checkStatusViaWebSocket(800);
  if (wsStatus && wsStatus.available) {
    return wsStatus;
  }

  // 2. Query backend printer status (works on localhost:5000 as well as live cloud relay)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('/api/integrations/speedx-status', { signal: controller.signal });
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
  } catch {}

  return {
    available: false,
    printerName: 'Speed-X 400UL',
    error: 'Speed-X 400UL printer daemon is offline.'
  };
}

/**
 * Sends receipt data directly to the Windows spooler for Speed-X 400UL.
 * Works on localhost:5000 (direct spooler) and live HTTPS site (cloud relay to pharmacy laptop).
 * Bypasses Chrome print dialogue completely.
 */
export async function printReceiptDirectHardware(
  invoiceDataOrNumber: any
): Promise<DirectHardwarePrintResult> {
  const payload = typeof invoiceDataOrNumber === 'string'
    ? { invoiceNumber: invoiceDataOrNumber, printerName: 'Speed-X 400UL' }
    : { invoiceData: invoiceDataOrNumber, printerName: 'Speed-X 400UL' };

  // 1. Attempt WebSocket bridge first if available (fastest on local network)
  try {
    const wsRes = await printViaWebSocket(payload, 2500);
    if (wsRes && wsRes.success) {
      return wsRes;
    }
  } catch {}

  // 2. Execute via HTTP API (Direct spooler on localhost, or Cloud Relay on live website)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch('/api/integrations/print-receipt-direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      } else {
        return {
          success: false,
          fallbackToDialog: !!data.fallbackToDialog,
          message: data.message || 'Printer offline'
        };
      }
    }
  } catch (err: any) {
    console.warn('[directHardwarePrinter] Print request error:', err);
  }

  return {
    success: false,
    fallbackToDialog: true,
    message: 'Speed-X 400UL printer is offline or unreachable.'
  };
}

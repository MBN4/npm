import { WebSocketServer, WebSocket } from 'ws';
import { printReceiptESC_POS } from './receiptPrinterEngine.js';
import { getWindowsPrinters } from './printerService.js';

let wss: WebSocketServer | null = null;

export function initLocalPrinterWs(port = 5001) {
  if (process.platform !== 'win32') {
    // Only runs on the local Windows laptop where the printer is attached
    return;
  }

  if (wss) return;

  try {
    wss = new WebSocketServer({ port, host: '127.0.0.1' });
    console.log(`[localPrinterWs] Speed-X 400UL Hardware WebSocket Bridge listening on ws://127.0.0.1:${port}`);

    wss.on('connection', (ws: WebSocket) => {
      ws.on('message', async (data: string) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.action === 'STATUS') {
            const printers = await getWindowsPrinters();
            const speedx = printers.find(p => p.name.includes('Speed-X 400UL')) ||
                           printers.find(p => p.name.toLowerCase().includes('400ul')) ||
                           printers.find(p => p.name.toLowerCase().includes('speed-x')) ||
                           printers.find(p => p.name.toLowerCase().includes('thermal'));

            ws.send(JSON.stringify({
              action: 'STATUS_RESULT',
              available: !!speedx,
              printerName: speedx ? speedx.name : 'Speed-X 400UL',
              port: speedx?.port || 'USB001'
            }));
          } else if (msg.action === 'PRINT') {
            const result = await printReceiptESC_POS({
              invoiceData: msg.invoiceData,
              invoiceNumber: msg.invoiceNumber,
              printerName: msg.printerName || 'Speed-X 400UL'
            });

            ws.send(JSON.stringify({
              action: 'PRINT_RESULT',
              success: result.success,
              message: result.success
                ? `Receipt printed & cut directly on ${result.printerName || 'Speed-X 400UL'}`
                : (result.reason || 'Hardware printer error')
            }));
          }
        } catch (err: any) {
          ws.send(JSON.stringify({
            action: 'PRINT_RESULT',
            success: false,
            message: err.message || 'Failed to process print payload'
          }));
        }
      });
    });

    wss.on('error', (err) => {
      console.warn('[localPrinterWs] WebSocket server warning:', err.message);
    });
  } catch (err: any) {
    console.warn('[localPrinterWs] Could not start WebSocket server:', err.message);
  }
}

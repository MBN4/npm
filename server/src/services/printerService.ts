import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Sends plain-text & ESC/POS feed & cut commands directly to Speed-X 400UL thermal printer.
 */
export function printToWindowsPrinter(text: string, printerName: string = 'Speed-X 400UL'): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      return resolve(true);
    }

    try {
      // Build complete ESC/POS buffer:
      // 1. ESC @ (0x1B, 0x40) -> Initialize printer
      // 2. Receipt text
      // 3. 8 empty lines (to push past thermal head and cutter)
      // 4. ESC d 8 (0x1B, 0x64, 0x08) -> Feed 8 lines
      // 5. GS V 0 (0x1D, 0x56, 0x00) -> Cut paper command
      const initBuffer = Buffer.from([0x1B, 0x40]);
      const textBuffer = Buffer.from(text, 'ascii');
      const extraFeedLines = Buffer.from('\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n', 'ascii');
      const feedCutBuffer = Buffer.from([0x1B, 0x64, 0x08, 0x1D, 0x56, 0x00]);

      const fullBuffer = Buffer.concat([initBuffer, textBuffer, extraFeedLines, feedCutBuffer]);

      const tempPath = path.join(os.tmpdir(), `nmp_print_${Date.now()}_${Math.floor(Math.random() * 1000)}.txt`);
      fs.writeFileSync(tempPath, fullBuffer);

      const psScript = `Get-Content -LiteralPath '${tempPath.replace(/\\/g, '/')}' -Raw | Out-Printer -Name '${printerName}'`;

      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
        { timeout: 5000 },
        (err, stdout, stderr) => {
          try {
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          } catch (_) {}

          if (err) {
            return reject(new Error(stderr || err.message));
          }
          resolve(true);
        }
      );
    } catch (err) {
      reject(err);
    }
  });
}

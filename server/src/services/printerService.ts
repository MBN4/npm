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
      // Ensure 4 feed lines so receipt text cleanly clears the manual tear bar
      const fullText = text.trimEnd() + '\r\n\r\n\r\n\r\n';
      const tempPath = path.join(os.tmpdir(), `nmp_print_${Date.now()}_${Math.floor(Math.random() * 1000)}.txt`);
      fs.writeFileSync(tempPath, fullText, 'utf8');

      // Use ReadAllLines to pass array of individual lines to Out-Printer so each line is strictly respected
      const psScript = `[System.IO.File]::ReadAllLines('${tempPath.replace(/\\/g, '/')}') | Out-Printer -Name '${printerName}'`;

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

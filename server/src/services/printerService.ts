import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Sends plain-text / ESC-POS receipt text directly to a Windows printer spooler.
 */
export function printToWindowsPrinter(text: string, printerName: string = 'Speed-X 400UL'): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      return resolve(true);
    }

    try {
      const tempPath = path.join(os.tmpdir(), `nmp_print_${Date.now()}_${Math.floor(Math.random() * 1000)}.txt`);
      fs.writeFileSync(tempPath, text, 'utf8');

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

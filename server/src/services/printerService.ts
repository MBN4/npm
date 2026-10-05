import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { safeJsonParse } from '../utils/json.js';

export interface PrintResult {
  success: boolean;
  printerName?: string;
  fallbackToDialog?: boolean;
  reason?: string;
}

/**
 * Sends RAW ESC/POS byte buffers directly to Windows thermal printer via winspool.drv.
 * Dynamically discovers Speed-X / Thermal / Default printers with safe fallback.
 */
export function printRawToPrinter(buffer: Buffer, printerName: string = 'Speed-X 400UL'): Promise<PrintResult> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      return resolve({ success: false, fallbackToDialog: true, reason: 'Direct printer access is available on the Windows POS computer. Use the print dialog on this device.' });
    }

    try {
      const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendFileToPrinter(string szPrinterName, string szFileName) {
        try {
            byte[] bytes = File.ReadAllBytes(szFileName);
            IntPtr hPrinter = IntPtr.Zero;
            DOCINFOA di = new DOCINFOA();
            di.pDocName = "NMP Thermal Receipt";
            di.pDataType = "RAW";
            if (OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero)) {
                if (StartDocPrinter(hPrinter, 1, di)) {
                    if (StartPagePrinter(hPrinter)) {
                        IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                        Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
                        int dwWritten = 0;
                        bool success = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);
                        Marshal.FreeCoTaskMem(pUnmanagedBytes);
                        EndPagePrinter(hPrinter);
                        EndDocPrinter(hPrinter);
                        ClosePrinter(hPrinter);
                        return success;
                    }
                    EndDocPrinter(hPrinter);
                }
                ClosePrinter(hPrinter);
            }
        } catch { }
        return false;
    }
}
"@

$target = "${printerName}"
$allPrinters = Get-CimInstance Win32_Printer

# 1. Exact match
$printer = $allPrinters | Where-Object { $_.Name -eq $target }

# 2. Case-insensitive or wildcard match if a specific target printer name was supplied
if (-not $printer -and $target) {
    $printer = $allPrinters | Where-Object { $_.Name -like "*$target*" -or $target -like "*$($_.Name)*" } | Select-Object -First 1
}

# 3. Only if NO target was specified at all (empty), perform default thermal printer discovery
if (-not $printer -and -not $target) {
    $printer = $allPrinters | Where-Object { $_.Name -match 'Speed-X|POS|Thermal|Receipt|XP-|RP-|Xprinter|Epson|58|80' -and $_.Name -notmatch 'PDF|XPS|Fax|OneNote|Document' } | Select-Object -First 1
}

if ($printer) {
    $chosenName = $printer.Name
    $res = [RawPrinterHelper]::SendFileToPrinter($chosenName, "$([System.IO.Path]::GetFullPath('$TEMP_FILE'))")
    if ($res) {
        Write-Output "SUCCESS:$chosenName"
    } else {
        Write-Output "FAIL:Could not send RAW bytes to $chosenName"
    }
} else {
    Write-Output "NO_PRINTER:Target printer '$target' was not found or is disconnected in Windows."
}
`;

      const tempFile = path.join(os.tmpdir(), `nmp_raw_${Date.now()}_${Math.floor(Math.random() * 1000)}.bin`);
      fs.writeFileSync(tempFile, buffer);

      const scriptWithFile = psScript.replace('$TEMP_FILE', tempFile.replace(/\\/g, '/'));
      const psPath = path.join(os.tmpdir(), `nmp_print_${Date.now()}_${Math.floor(Math.random() * 1000)}.ps1`);
      fs.writeFileSync(psPath, scriptWithFile);

      exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${psPath}"`, (err, stdout) => {
        try {
          if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
          if (fs.existsSync(psPath)) fs.unlinkSync(psPath);
        } catch (_) {}

        const out = (stdout || '').trim();
        if (out.startsWith('SUCCESS:')) {
          const chosen = out.replace('SUCCESS:', '').trim();
          resolve({ success: true, printerName: chosen });
        } else {
          resolve({ success: false, fallbackToDialog: true, reason: out || err?.message || 'Printer unavailable' });
        }
      });
    } catch (err: any) {
      resolve({ success: false, fallbackToDialog: true, reason: err.message });
    }
  });
}

export interface WindowsPrinterInfo {
  name: string;
  driver: string;
  port: string;
  isDefault: boolean;
  status: 'READY' | 'OFFLINE' | 'ERROR' | 'PAPER OUT' | 'PAUSED' | 'UNKNOWN';
  statusDetails?: string;
}

export interface ThermalLabelData {
  pharmacyHeader?: string;
  brandName: string;
  strength?: string;
  dosageForm?: string;
  barcode: string;
  batchNumber?: string;
  expiryDate?: string;
  salePrice?: number | string;
  rackLocation?: string;
}

export interface ThermalLabelConfig {
  paperWidthMm?: number; // default 38
  paperHeightMm?: number; // default 28
  gapHeightMm?: number; // default 2
  horizontalOffsetMm?: number; // default 0 — shifts the WHOLE label (TSPL REFERENCE)
  verticalOffsetMm?: number; // default 0 — shifts the WHOLE label (TSPL OFFSET)
  printSpeed?: number; // default 5
  density?: number; // default 9
  mediaType?: 'GAP' | 'BLACK_MARK' | 'CONTINUOUS';
  dpi?: number; // default 203 (8 dots/mm) — actually used for layout math, unlike before
  barcodeOffsetXMm?: number; // default -6 — nudges ONLY the barcode + its readable text, independent of everything else
  barcodeOffsetYMm?: number; // default 1.5

  // Fully customizable vertical rhythm (all in mm). Each is the GAP between one row and the
  // next, not an absolute position — so tuning one never silently breaks the others' spacing.
  labelTopMarginMm?: number; // default 2.1 — top of label to pharmacy header
  gapHeaderBrandMm?: number; // default 3.5 — header to brand name
  gapBrandStrengthMm?: number; // default 3.4 — brand to strength (only when strength is present)
  gapStrengthBarcodeMm?: number; // default 2.25 — strength to barcode (when strength present)
  gapBrandBarcodeMm?: number; // default 3.9 — brand straight to barcode (when no strength)
  gapBarcodeToTextMm?: number; // default 4.9 — barcode graphic to its readable number line
  gapTextToBottomMm?: number; // default 4.75 — barcode number line to batch/expiry line
  gapBottomToPriceMm?: number; // default 3.1 — batch/expiry line to price line
}

/**
 * Discovers installed Windows printers using PowerShell Get-CimInstance Win32_Printer.
 */
export function getWindowsPrinters(): Promise<WindowsPrinterInfo[]> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      return resolve([
        {
          name: 'Speed-X SP-690UB (Virtual Mock)',
          driver: 'Speed-X Direct Thermal Driver',
          port: 'USB001',
          isDefault: true,
          status: 'READY'
        }
      ]);
    }

    const script = `
      $spoolerPrinters = Get-CimInstance Win32_Printer | Select-Object Name, DriverName, PortName, Default, PrinterStatus, WorkOffline, PrinterState
      $pnpDevices = Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -like '*LABEL*' -or $_.Name -like '*Speed*' -or $_.Name -like '*SP-690*' -or $_.Name -like '*Xprinter*' } | Select-Object Name, Status, PNPClass

      $results = @()
      foreach ($p in $spoolerPrinters) {
          $results += @{
              Name = $p.Name
              DriverName = $p.DriverName
              PortName = $p.PortName
              Default = [bool]$p.Default
              PrinterStatus = $p.PrinterStatus
              WorkOffline = [bool]$p.WorkOffline
              PrinterState = $p.PrinterState
              Type = "Spooler"
          }
      }

      foreach ($dev in $pnpDevices) {
          if (-not ($results | Where-Object { $_.Name -eq $dev.Name })) {
              $results += @{
                  Name = $dev.Name
                  DriverName = "USB Direct Thermal Hardware"
                  PortName = "USB"
                  Default = $false
                  PrinterStatus = 3
                  WorkOffline = $false
                  PrinterState = 0
                  Type = "Hardware"
              }
          }
      }

      $results | ConvertTo-Json -Compress
    `;

    const psPath = path.join(os.tmpdir(), `nmp_get_printers_${Date.now()}.ps1`);
    fs.writeFileSync(psPath, script);

    exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${psPath}"`, (err, stdout) => {
      try {
        if (fs.existsSync(psPath)) fs.unlinkSync(psPath);
      } catch (_) {}

      if (err || !stdout) {
        return resolve([]);
      }

      try {
        let raw = safeJsonParse<any[]>(stdout.trim(), []);
        if (!Array.isArray(raw)) {
          raw = [raw];
        }

        const printers: WindowsPrinterInfo[] = raw.map((p: any) => {
          let status: WindowsPrinterInfo['status'] = 'READY';
          if (p.WorkOffline) {
            status = 'OFFLINE';
          } else if (p.PrinterStatus === 1 || p.PrinterState === 1) {
            status = 'PAUSED';
          } else if (p.PrinterStatus === 2 || p.PrinterState === 2) {
            status = 'ERROR';
          } else if (p.PrinterStatus === 4 || p.PrinterState === 4) {
            status = 'PAPER OUT';
          }

          return {
            name: p.Name || 'Unknown Printer',
            driver: p.DriverName || 'Generic Driver',
            port: p.PortName || 'USB001',
            isDefault: Boolean(p.Default),
            status
          };
        });

        resolve(printers);
      } catch (parseErr) {
        resolve([]);
      }
    });
  });
}

/**
 * Generates TSPL raw commands for direct thermal label sticker printing.
 * Layout is fully computed from the label's actual width/height/DPI so text and the
 * barcode stay centered and within bounds instead of using positions tuned for one
 * specific label size.
 */
export function generateTSPL38x28(
  data: ThermalLabelData,
  config: ThermalLabelConfig = {},
  quantity: number = 1
): string {
  const width = config.paperWidthMm || 38;
  const height = config.paperHeightMm || 28;
  const gap = config.gapHeightMm || 2;
  const hOffset = config.horizontalOffsetMm || 0;
  const vOffset = config.verticalOffsetMm || 0;
  const speed = config.printSpeed || 4;
  const density = config.density || 10;
  const dpi = config.dpi || 203;
  const barcodeOffsetXMm = config.barcodeOffsetXMm !== undefined ? config.barcodeOffsetXMm : -6;
  const barcodeOffsetYMm = config.barcodeOffsetYMm !== undefined ? config.barcodeOffsetYMm : 1.5;

  // Dots-per-mm derived from actual configured DPI (203dpi = ~8 dots/mm), instead of
  // a hardcoded "8" that silently mismatched any printer/setting not exactly 203dpi.
  const dotsPerMm = dpi / 25.4;
  const labelWidthDots = Math.round(width * dotsPerMm);
  const labelHeightDots = Math.round(height * dotsPerMm);

  // Safety margin so nothing ever touches the physical edge of the label.
  const marginDots = Math.max(6, Math.round(labelWidthDots * 0.03));

  const getCenterX = (text: string, fontWidthDots: number) => {
    const textWidth = (text || '').length * fontWidthDots;
    const x = Math.floor((labelWidthDots - textWidth) / 2);
    return Math.max(marginDots, Math.min(x, labelWidthDots - marginDots - textWidth));
  };

  const rawHeader = (data.pharmacyHeader || 'NAVEED MEDICAL').trim();
  const pharmacyHeader = rawHeader.length > 18 ? rawHeader.slice(0, 24) : rawHeader;

  const rawBrand = (data.brandName || 'Panadol Extra').trim();
  const brandFont = rawBrand.length > 14 ? '2' : '3';
  const brandFontWidth = brandFont === '3' ? 16 : 12;
  const brandName = rawBrand.slice(0, 22);

  const strength = (data.strength || '').trim().slice(0, 15);
  const barcode = (data.barcode || 'NMP-208492').trim();

  // Shorten expiry date (e.g. 26/09/2026 -> 26/09/26) to prevent overflow
  let rawExpiry = (data.expiryDate || '12/28').trim();
  if (rawExpiry.length > 8 && rawExpiry.includes('/20')) {
    rawExpiry = rawExpiry.replace('/20', '/');
  }
  const expiry = rawExpiry.slice(0, 10);
  const batch = (data.batchNumber || 'BN-2026-99').trim().slice(0, 10);

  const rawPrice = data.salePrice !== undefined && data.salePrice !== null ? `Rs. ${data.salePrice}` : 'Rs. 45';
  const price = rawPrice;

  // Centering X positions — all derived from the real labelWidthDots, so they scale
  // correctly for any paper size preset, not just 38x28mm.
  const headerX = getCenterX(pharmacyHeader, 12);
  const brandX = getCenterX(brandName, brandFontWidth);
  const strengthX = getCenterX(strength, 12);

  // Manual per-printer nudge (mm -> dots) for the barcode + its readable text only, since exact
  // Code128 rendering width varies by printer firmware and can't always be predicted from the
  // TSPL parameters alone. Set via the "Barcode Position" controls in Barcode Center / Settings.
  const barcodeOffsetXDots = Math.round(barcodeOffsetXMm * dotsPerMm);
  const barcodeOffsetYDots = Math.round(barcodeOffsetYMm * dotsPerMm);

  const barcodeTextX = getCenterX(barcode, 12) + barcodeOffsetXDots;

  // Code 128 barcode width estimate. Module count ≈ 11 dots/char + start(11) + check(11) + stop(13).
  // barWidthDots is the actual per-module dot width sent to the printer below — narrow/wide must
  // match here exactly, since Code128 has no two-width bar concept (unlike Code39): passing
  // mismatched narrow/wide values left the printer rendering wider bars than this estimate
  // assumed, which pushed the "centered" barcode visibly right of true center on a real label.
  const barWidthDots = 1;
  const exactBarcodeWidthDots = Math.round((barcode.length + 3) * 11) * barWidthDots;
  const barcodeX = Math.max(marginDots, Math.floor((labelWidthDots - exactBarcodeWidthDots) / 2)) + barcodeOffsetXDots;

  // Bottom row: batch + expiry are combined into ONE centered line (instead of two
  // independently hardcoded X positions that could overlap each other or the price),
  // with price on its own centered line below. This is what was causing "uneven /
  // text cut off" — fixed absolute X coordinates (14, 104, ~195-292) assumed one exact
  // label width and didn't leave a guaranteed gap between fields.
  const batchExpiryLine = `${batch}  EXP:${expiry}`.trim();
  const batchExpiryX = getCenterX(batchExpiryLine, 9);
  const priceX = getCenterX(price, 14);

  // Vertical layout: each row's Y is the previous row's Y plus a configurable GAP (mm),
  // instead of independent fixed fractions of label height. This is what "customize
  // everything" maps to in the UI — every value below has a matching Settings/Barcode
  // Center control. Cascading this way also means tuning one gap can never silently
  // reintroduce an overlap elsewhere, since every row is defined relative to the one above it.
  const hasStrength = Boolean(strength);
  const mm = (v: number) => Math.round(v * dotsPerMm);

  const topMarginMm = config.labelTopMarginMm ?? 2.1;
  const gapHeaderBrandMm = config.gapHeaderBrandMm ?? 3.5;
  const gapBrandStrengthMm = config.gapBrandStrengthMm ?? 3.4;
  const gapStrengthBarcodeMm = config.gapStrengthBarcodeMm ?? 2.25;
  const gapBrandBarcodeMm = config.gapBrandBarcodeMm ?? 3.9;
  const gapBarcodeToTextMm = config.gapBarcodeToTextMm ?? 4.9;
  const gapTextToBottomMm = config.gapTextToBottomMm ?? 4.75;
  const gapBottomToPriceMm = config.gapBottomToPriceMm ?? 3.1;

  const headerY = mm(topMarginMm);
  const brandY = headerY + mm(gapHeaderBrandMm);
  const strengthY = brandY + mm(gapBrandStrengthMm);

  // Baseline (unshifted) barcode position — the manual "Barcode-Only Position" offset is
  // applied only to the barcode graphic + its readable text, not to what's baked below it,
  // so nudging the barcode to fix physical print alignment never drags the price around.
  const barcodeYBase = hasStrength ? strengthY + mm(gapStrengthBarcodeMm) : brandY + mm(gapBrandBarcodeMm);
  const barcodeY = barcodeYBase + barcodeOffsetYDots;
  const barcodeHeight = Math.max(18, Math.round(labelHeightDots * 0.12));
  const barcodeTextYBase = barcodeYBase + mm(gapBarcodeToTextMm);
  const barcodeTextY = barcodeTextYBase + barcodeOffsetYDots;

  const bottomY = Math.min(barcodeTextYBase + mm(gapTextToBottomMm), labelHeightDots - Math.round(labelHeightDots * 0.20));
  const priceY = Math.min(bottomY + mm(gapBottomToPriceMm), labelHeightDots - Math.round(labelHeightDots * 0.09));

  const commands = [
    `SET TEAR ON`,
    `SIZE ${width} mm, ${height} mm`,
    `GAP ${gap} mm, 0 mm`,
    `SPEED ${speed}`,
    `DENSITY ${density}`,
    `DIRECTION 1`,
    `OFFSET ${vOffset} mm`,
    `REFERENCE ${Math.round(hOffset * dotsPerMm)}, 0`,
    `CLS`,
    `TEXT ${headerX}, ${headerY}, "2", 0, 1, 1, "${pharmacyHeader}"`,
    `TEXT ${brandX}, ${brandY}, "${brandFont}", 0, 1, 1, "${brandName}"`,
    hasStrength ? `TEXT ${strengthX}, ${strengthY}, "2", 0, 1, 1, "${strength}"` : '',
    `BARCODE ${barcodeX}, ${barcodeY}, "128", ${barcodeHeight}, 0, 0, ${barWidthDots}, ${barWidthDots}, "${barcode}"`,
    `TEXT ${barcodeTextX}, ${barcodeTextY}, "2", 0, 1, 1, "${barcode}"`,
    `TEXT ${batchExpiryX}, ${bottomY}, "1", 0, 1, 1, "${batchExpiryLine}"`,
    `TEXT ${priceX}, ${priceY}, "2", 0, 1, 1, "${price}"`,
    `PRINT ${quantity}, 1`
  ].filter(Boolean);

  return commands.join('\r\n') + '\r\n';
}

/**
 * Sends a thermal label print job to the Speed-X / selected Windows printer.
 */
export async function printThermalLabelRaw(
  data: ThermalLabelData,
  config: ThermalLabelConfig = {},
  quantity: number = 1,
  printerName?: string
): Promise<PrintResult> {
  const targetPrinter = printerName || 'Speed-X SP-690UB';
  const tsplString = generateTSPL38x28(data, config, quantity);
  const buffer = Buffer.from(tsplString, 'ascii');
  return printRawToPrinter(buffer, targetPrinter);
}

/**
 * Runs the printer's built-in gap-sensor auto-calibration (TSPL GAPDETECT). This feeds a few
 * blank labels while the printer re-measures where each label boundary actually is. Needed
 * whenever label stock is changed/reloaded, or when prints start overlapping/drifting between
 * jobs — a sign the printer's internal notion of "start of label" has drifted from reality.
 */
export async function calibrateLabelGapSensor(
  config: ThermalLabelConfig = {},
  printerName?: string
): Promise<PrintResult> {
  const targetPrinter = printerName || 'Speed-X SP-690UB';
  const width = config.paperWidthMm || 38;
  const height = config.paperHeightMm || 28;
  const gap = config.gapHeightMm || 2;

  const commands = [
    `SIZE ${width} mm, ${height} mm`,
    `GAP ${gap} mm, 0 mm`,
    `GAPDETECT`
  ].join('\r\n') + '\r\n';

  const buffer = Buffer.from(commands, 'ascii');
  return printRawToPrinter(buffer, targetPrinter);
}

/**
 * Helper to convert plain text string to ESC/POS RAW buffer with automatic feed & partial cut.
 */
export function printToWindowsPrinter(text: string, printerName: string = 'Speed-X 400UL'): Promise<boolean> {
  const chunks: Buffer[] = [
    Buffer.from([0x1B, 0x40]), // ESC @ - Initialize
    Buffer.from(text, 'utf8'),
    Buffer.from([0x1B, 0x64, 0x06]), // ESC d 6 - Feed 6 lines so text fully clears the tear bar
    Buffer.from([0x1D, 0x56, 0x41, 0x00]) // GS V 65 0 - Partial cut
  ];
  return printRawToPrinter(Buffer.concat(chunks), printerName).then(res => res.success);
}


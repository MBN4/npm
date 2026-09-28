import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

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
  horizontalOffsetMm?: number; // default 0
  verticalOffsetMm?: number; // default 0
  printSpeed?: number; // default 5
  density?: number; // default 9
  mediaType?: 'GAP' | 'BLACK_MARK' | 'CONTINUOUS';
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
        let raw = JSON.parse(stdout.trim());
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
 * Generates TSPL raw commands for direct thermal label sticker printing (38x28mm).
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

  const labelWidthDots = Math.round(width * 8); // 304 dots for 38mm

  const getCenterX = (text: string, fontWidthDots: number) => {
    const textWidth = (text || '').length * fontWidthDots;
    const x = Math.floor((labelWidthDots - textWidth) / 2);
    return Math.max(8, Math.min(x, labelWidthDots - 20));
  };

  const rawHeader = (data.pharmacyHeader || 'NAVEED MEDICAL').trim();
  const pharmacyHeader = rawHeader.length > 18 ? rawHeader.slice(0, 24) : rawHeader;

  const rawBrand = (data.brandName || 'Panadol Extra').trim();
  const brandFont = rawBrand.length > 14 ? '2' : '3';
  const brandFontWidth = brandFont === '3' ? 16 : 12;
  const brandName = rawBrand.slice(0, 22);

  const strength = (data.strength || '').trim().slice(0, 15);
  const barcode = (data.barcode || 'NMP-2026-08492').trim();
  const batch = (data.batchNumber || 'BN-2026-99').trim().slice(0, 10);

  // Shorten expiry date (e.g. 26/09/2026 -> 26/09/26) to prevent overflow
  let rawExpiry = (data.expiryDate || '12/28').trim();
  if (rawExpiry.length > 8 && rawExpiry.includes('/20')) {
    rawExpiry = rawExpiry.replace('/20', '/');
  }
  const expiry = rawExpiry.slice(0, 10);

  const rawPrice = data.salePrice !== undefined && data.salePrice !== null ? `Rs. ${data.salePrice}` : 'Rs. 45';
  const price = rawPrice;

  // Exact Centering X positions
  const headerX = getCenterX(pharmacyHeader, 12);
  const brandX = getCenterX(brandName, brandFontWidth);
  const strengthX = getCenterX(strength, 12);
  const barcodeTextX = getCenterX(barcode, 12);

  // Exact Code 128 Barcode Centering for narrow=1
  const exactBarcodeWidthDots = Math.round((barcode.length + 3) * 11);
  const barcodeX = Math.max(10, Math.floor((labelWidthDots - exactBarcodeWidthDots) / 2));

  // Dynamic Bottom Row Positioning (Zero Overlap)
  const batchX = 14;
  const expiryText = `EXP:${expiry}`;
  const expiryX = 104;
  const priceX = Math.max(195, 292 - (price.length * 12));

  // Golden Ratio Vertical Layout
  const hasStrength = Boolean(strength);
  const headerY = 18;
  const brandY = 42;
  const strengthY = 62;
  const barcodeY = hasStrength ? 82 : 72;
  const barcodeHeight = hasStrength ? 26 : 30;
  const barcodeTextY = hasStrength ? 114 : 106;
  const bottomY = hasStrength ? 142 : 136;

  const commands = [
    `SET TEAR ON`,
    `SIZE ${width} mm, ${height} mm`,
    `GAP ${gap} mm, 0 mm`,
    `SPEED ${speed}`,
    `DENSITY ${density}`,
    `DIRECTION 1`,
    `OFFSET ${vOffset} mm`,
    `REFERENCE ${hOffset * 8}, 0`,
    `CLS`,
    `TEXT ${headerX}, ${headerY}, "2", 0, 1, 1, "${pharmacyHeader}"`,
    `TEXT ${brandX}, ${brandY}, "${brandFont}", 0, 1, 1, "${brandName}"`,
    hasStrength ? `TEXT ${strengthX}, ${strengthY}, "2", 0, 1, 1, "${strength}"` : '',
    `BARCODE ${barcodeX}, ${barcodeY}, "128", ${barcodeHeight}, 0, 0, 1, 2, "${barcode}"`,
    `TEXT ${barcodeTextX}, ${barcodeTextY}, "2", 0, 1, 1, "${barcode}"`,
    `TEXT ${batchX}, ${bottomY}, "1", 0, 1, 1, "${batch}"`,
    `TEXT ${expiryX}, ${bottomY}, "1", 0, 1, 1, "${expiryText}"`,
    `TEXT ${priceX}, ${bottomY}, "2", 0, 1, 1, "${price}"`,
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


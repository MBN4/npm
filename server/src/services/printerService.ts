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
      return resolve({ success: true, printerName: 'Non-Windows Dummy' });
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

# 2. Thermal / POS fuzzy match (matches Speed-X, POS, Thermal, Receipt, XP-, RP-, Xprinter, Epson, 58, 80)
if (-not $printer) {
    $printer = $allPrinters | Where-Object { $_.Name -match 'Speed-X|POS|Thermal|Receipt|XP-|RP-|Xprinter|Epson|58|80' -and $_.Name -notmatch 'PDF|XPS|Fax|OneNote|Document' } | Select-Object -First 1
}

# 3. Default printer (ONLY if it is a real physical printer, not PDF/XPS/Fax/OneNote)
if (-not $printer) {
    $printer = $allPrinters | Where-Object { $_.Default -and $_.Name -notmatch 'PDF|XPS|Fax|OneNote|Document' } | Select-Object -First 1
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
    Write-Output "NO_PRINTER:No physical thermal printer found. Please connect or map Speed-X printer."
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
  return printRawToPrinter(Buffer.concat(chunks), printerName);
}


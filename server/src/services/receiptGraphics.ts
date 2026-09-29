import { Jimp } from 'jimp';
import bwipjs from 'bwip-js';
import { PNG } from 'pngjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOGO_PATH = path.resolve(__dirname, '../../../client/public/logo.jpeg');

export interface MonoBitmap {
  width: number;
  height: number;
  /** true = black dot */
  bits: Uint8Array;
}

function thresholdRgba(
  data: Buffer | Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 160,
  invert = false
): MonoBitmap {
  const bits = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    const luminance = r * 0.299 + g * 0.587 + b * 0.114;
    const isDark = luminance < threshold;
    const isInk = invert ? !isDark : isDark;
    bits[i] = a >= 128 && isInk ? 1 : 0;
  }
  return { width, height, bits };
}

/** Centers a mono bitmap horizontally within a wider (or equal) paper width, padding with white. */
export function centerOnPaper(src: MonoBitmap, paperWidthDots: number): MonoBitmap {
  if (src.width >= paperWidthDots) return src;
  const offsetX = Math.floor((paperWidthDots - src.width) / 2);
  const bits = new Uint8Array(paperWidthDots * src.height);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      bits[y * paperWidthDots + offsetX + x] = src.bits[y * src.width + x];
    }
  }
  return { width: paperWidthDots, height: src.height, bits };
}

/** Packs a MonoBitmap into an ESC/POS GS v 0 raster image command buffer. */
export function monoBitmapToEscPosRaster(bmp: MonoBitmap): Buffer {
  const bytesPerRow = Math.ceil(bmp.width / 8);
  const header = Buffer.from([
    0x1d, 0x76, 0x30, 0x00,
    bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
    bmp.height & 0xff, (bmp.height >> 8) & 0xff,
  ]);
  const data = Buffer.alloc(bytesPerRow * bmp.height);
  for (let y = 0; y < bmp.height; y++) {
    for (let x = 0; x < bmp.width; x++) {
      if (bmp.bits[y * bmp.width + x]) {
        const byteIndex = y * bytesPerRow + (x >> 3);
        data[byteIndex] |= 0x80 >> (x & 7);
      }
    }
  }
  return Buffer.concat([header, data]);
}

let cachedLogoBitmap: { widthDots: number; bmp: MonoBitmap } | null = null;

export async function renderLogoRaster(widthDots: number, paperWidthDots: number): Promise<Buffer | null> {
  try {
    if (!cachedLogoBitmap || cachedLogoBitmap.widthDots !== widthDots) {
      const img = await Jimp.read(LOGO_PATH);
      img.resize({ w: widthDots });
      // logo.jpeg is white line-art on a black square background: invert so the
      // linework prints as ink and the black background stays blank paper.
      const bmp = thresholdRgba(img.bitmap.data as unknown as Buffer, img.bitmap.width, img.bitmap.height, 128, true);
      cachedLogoBitmap = { widthDots, bmp };
    }
    const centered = centerOnPaper(cachedLogoBitmap.bmp, paperWidthDots);
    return monoBitmapToEscPosRaster(centered);
  } catch (err) {
    console.error('renderLogoRaster failed:', err);
    return null;
  }
}

async function pngBufferToMono(png: Buffer): Promise<MonoBitmap> {
  const decoded = PNG.sync.read(png);
  return thresholdRgba(decoded.data, decoded.width, decoded.height, 128);
}

export async function renderQrRaster(value: string, sizeDots: number, paperWidthDots: number): Promise<Buffer | null> {
  try {
    const png = await bwipjs.toBuffer({
      bcid: 'qrcode',
      text: value,
      scale: 3,
      includetext: false,
    });
    let bmp = await pngBufferToMono(png);
    if (bmp.width !== sizeDots) {
      // simple nearest-neighbor scale to target size
      bmp = nearestScale(bmp, sizeDots, Math.round((sizeDots / bmp.width) * bmp.height));
    }
    return monoBitmapToEscPosRaster(centerOnPaper(bmp, paperWidthDots));
  } catch (err) {
    console.error('renderQrRaster failed:', err);
    return null;
  }
}

export async function renderBarcodeRaster(
  value: string,
  widthDots: number,
  heightDots: number,
  paperWidthDots: number
): Promise<Buffer | null> {
  try {
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text: value,
      scale: 2,
      height: 10,
      includetext: true,
      textxalign: 'center',
    });
    let bmp = await pngBufferToMono(png);
    bmp = nearestScale(bmp, widthDots, Math.round((widthDots / bmp.width) * bmp.height));
    return monoBitmapToEscPosRaster(centerOnPaper(bmp, paperWidthDots));
  } catch (err) {
    console.error('renderBarcodeRaster failed:', err);
    return null;
  }
}

function nearestScale(src: MonoBitmap, targetWidth: number, targetHeight: number): MonoBitmap {
  const bits = new Uint8Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y++) {
    const srcY = Math.min(src.height - 1, Math.floor((y / targetHeight) * src.height));
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.min(src.width - 1, Math.floor((x / targetWidth) * src.width));
      bits[y * targetWidth + x] = src.bits[srcY * src.width + srcX];
    }
  }
  return { width: targetWidth, height: targetHeight, bits };
}

/** Paper width in printer dots at 203dpi for a given physical paper width setting. */
export function paperWidthDots(paperWidthSetting?: string): number {
  return paperWidthSetting === '58mm' ? 384 : 576;
}

/** Debug helper: reconstructs a MonoBitmap back into a viewable PNG buffer. */
export function monoBitmapToPng(bmp: MonoBitmap): Buffer {
  const png = new PNG({ width: bmp.width, height: bmp.height });
  for (let y = 0; y < bmp.height; y++) {
    for (let x = 0; x < bmp.width; x++) {
      const idx = (y * bmp.width + x) * 4;
      const v = bmp.bits[y * bmp.width + x] ? 0 : 255;
      png.data[idx] = v;
      png.data[idx + 1] = v;
      png.data[idx + 2] = v;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

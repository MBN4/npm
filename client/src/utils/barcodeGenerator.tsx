import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

export interface Barcode128Props {
  value: string;
  width?: number;
  height?: number;
  fontSize?: number;
  showText?: boolean;
  className?: string;
}

/**
 * Real, scannable Code 128 barcode (via jsbarcode) for receipt & invoice printing. Renders
 * directly into an <svg> element - jsbarcode supports that as a render target natively.
 */
export const Barcode128: React.FC<Barcode128Props> = ({
  value,
  width = 1.2,
  height = 30,
  fontSize = 9,
  showText = true,
  className = '',
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const str = value || 'NMP-000000';

  useEffect(() => {
    if (!svgRef.current) return;
    try {
      JsBarcode(svgRef.current, str, {
        format: 'CODE128',
        width,
        height,
        fontSize,
        displayValue: showText,
        margin: 4,
        background: '#ffffff',
        lineColor: '#000000',
      });
    } catch (err) {
      console.error('[Barcode128] Failed to render barcode for value:', str, err);
    }
  }, [str, width, height, fontSize, showText]);

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <svg ref={svgRef} className="w-full h-auto max-w-[220px]" />
    </div>
  );
};

/**
 * Real, scannable QR code (via the `qrcode` library) for cash memo invoice verification and
 * pharmacy location links.
 */
export const SimpleQRCodeSVG: React.FC<{ value: string; size?: number; className?: string }> = ({
  value,
  size = 64,
  className = '',
}) => {
  const [svgMarkup, setSvgMarkup] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value || ' ', { type: 'svg', margin: 1, width: size })
      .then(markup => { if (!cancelled) setSvgMarkup(markup); })
      .catch(err => console.error('[SimpleQRCodeSVG] Failed to render QR for value:', value, err));
    return () => { cancelled = true; };
  }, [value, size]);

  return (
    <div
      className={className}
      style={{ width: size, height: size }}
      // eslint-disable-next-line react/no-danger -- markup is generated locally by the `qrcode` library, not user input
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  );
};

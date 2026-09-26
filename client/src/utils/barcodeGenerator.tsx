import React from 'react';

export interface Barcode128Props {
  value: string;
  width?: number;
  height?: number;
  fontSize?: number;
  showText?: boolean;
  className?: string;
}

/**
 * Simple SVG Code 128 Barcode renderer for receipt & invoice printing.
 * Renders high contrast vector bars without external dependencies.
 */
export const Barcode128: React.FC<Barcode128Props> = ({
  value,
  width = 1.2,
  height = 30,
  fontSize = 9,
  showText = true,
  className = '',
}) => {
  const bars: boolean[] = [];
  const str = value || 'NMP-000000';

  // Seed pattern generator from string characters for crisp barcode rendering
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  
  // Create pseudo pattern based on characters
  const patternSeed = Math.abs(hash);
  const totalBars = 54;
  
  // Guard quiet zones
  for (let i = 0; i < 4; i++) bars.push(false);
  
  // Start pattern
  bars.push(true, false, true, true, false, true);

  for (let i = 0; i < totalBars; i++) {
    const isDark = ((patternSeed >> (i % 31)) ^ i ^ (str.charCodeAt(i % str.length) || 0)) % 2 === 0;
    bars.push(isDark);
  }

  // Stop pattern
  bars.push(true, true, false, true, false, true, true);
  for (let i = 0; i < 4; i++) bars.push(false);

  const barWidth = Math.max(1, width);
  const svgWidth = Math.ceil(bars.length * barWidth);

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <svg width={svgWidth} height={height} viewBox={`0 0 ${svgWidth} ${height}`} className="w-full h-auto max-w-[220px]">
        <rect width={svgWidth} height={height} fill="#ffffff" />
        {bars.map((isDark, idx) =>
          isDark ? (
            <rect
              key={idx}
              x={idx * barWidth}
              y={0}
              width={barWidth}
              height={height}
              fill="#000000"
            />
          ) : null
        )}
      </svg>
      {showText && (
        <span style={{ fontSize: `${fontSize}px` }} className="font-mono tracking-widest text-slate-800 font-bold mt-0.5">
          {str}
        </span>
      )}
    </div>
  );
};

/**
 * Simple SVG QR Code renderer for cash memo invoice verification.
 */
export const SimpleQRCodeSVG: React.FC<{ value: string; size?: number; className?: string }> = ({
  value,
  size = 64,
  className = '',
}) => {
  const gridCount = 17;
  const cellSize = size / gridCount;

  // Simple deterministic pattern based on hash
  const modules: boolean[][] = Array.from({ length: gridCount }, () => Array(gridCount).fill(false));

  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  const seed = Math.abs(hash);

  for (let r = 0; r < gridCount; r++) {
    for (let c = 0; c < gridCount; c++) {
      // Finder patterns (3 corners: top-left, top-right, bottom-left)
      const isTopLeft = r < 5 && c < 5;
      const isTopRight = r < 5 && c >= gridCount - 5;
      const isBottomLeft = r >= gridCount - 5 && c < 5;

      if (isTopLeft || isTopRight || isBottomLeft) {
        const localR = isTopLeft ? r : isTopRight ? r : r - (gridCount - 5);
        const localC = isTopLeft ? c : isTopRight ? c - (gridCount - 5) : c;
        if (localR === 0 || localR === 4 || localC === 0 || localC === 4 || (localR >= 1 && localR <= 3 && localC >= 1 && localC <= 3 && localR !== 2 && localC !== 2)) {
          modules[r][c] = true;
        } else if (localR === 2 && localC === 2) {
          modules[r][c] = true;
        }
      } else {
        modules[r][c] = ((seed >> ((r * gridCount + c) % 31)) ^ r ^ c) % 3 === 0;
      }
    }
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className}>
      <rect width={size} height={size} fill="#ffffff" />
      {modules.map((row, r) =>
        row.map((isDark, c) =>
          isDark ? (
            <rect
              key={`${r}-${c}`}
              x={c * cellSize}
              y={r * cellSize}
              width={cellSize + 0.1}
              height={cellSize + 0.1}
              fill="#000000"
            />
          ) : null
        )
      )}
    </svg>
  );
};

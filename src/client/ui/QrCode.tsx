import { useMemo } from 'react';
import { create } from 'qrcode';

/**
 * A QR code drawn on the page, with no internet involved (SPEC section 9).
 *
 * The `qrcode` package can hand back a finished SVG string, but that would have
 * to be injected as raw HTML. Asking it only for the black-and-white grid and
 * drawing the squares here keeps the markup ours: one <path>, real ARIA, and a
 * size that comes from CSS rather than from a baked-in pixel count.
 *
 * Printed cards are read in a dim classroom by a phone held at arm's length, so
 * the quiet border is the full four modules the specification asks for.
 */
const QUIET = 4;

export interface QrCodeProps {
  /** What the code contains. Usually a join URL. */
  text: string;
  /** Read out instead of the squares, for example "Join link for Borvia". */
  label: string;
  className?: string;
}

/** The grid as one SVG path: one "move, 1x1 square" step per dark module. */
function pathFor(size: number, data: Uint8Array): string {
  const parts: string[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (data[row * size + column] !== 1) continue;
      parts.push(`M${String(column + QUIET)} ${String(row + QUIET)}h1v1h-1z`);
    }
  }
  return parts.join('');
}

export function QrCode({ text, label, className }: QrCodeProps) {
  // Level M corrects a quarter of the symbol, which is enough for a card that
  // has been folded once, and keeps the squares big enough to scan.
  const code = useMemo(() => {
    try {
      return create(text, { errorCorrectionLevel: 'M' });
    } catch {
      // A code only fails on text far longer than any link here; showing
      // nothing is better than a broken lesson.
      return null;
    }
  }, [text]);

  if (code === null) return null;

  const side = code.modules.size + QUIET * 2;
  return (
    <svg
      className={['qr', className].filter(Boolean).join(' ')}
      viewBox={`0 0 ${String(side)} ${String(side)}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect x="0" y="0" width={side} height={side} className="qr-paper" />
      <path d={pathFor(code.modules.size, code.modules.data)} className="qr-ink" />
    </svg>
  );
}

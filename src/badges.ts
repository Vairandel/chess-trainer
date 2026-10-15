import type { DrawShape } from '@lichess-org/chessground/draw';
import { glyphToSvg } from '@lichess-org/chessground/glyph';
import type { Key } from '@lichess-org/chessground/types';
import type { Classification } from './review';

// Lichess' glyph badges, drawn in the top-right corner of a square (one badge per square).
const LICHESS = glyphToSvg(1);

/** Same layout as chessground's glyphs: a circle in a 100×100 square, scaled into its top-right corner. */
function badge(fill: string, inner: string): string {
  return `<g transform="matrix(.4 0 0 .4 71 -12)"><circle cx="50" cy="50" r="50" fill="${fill}"/>${inner}</g>`;
}

const STAR = badge('#22ac38', '<path fill="#fff" d="M50 16l10 20.6 22.6 3.3-16.4 16 3.9 22.5L50 67.7 29.9 78.4l3.9-22.5-16.4-16 22.6-3.3z"/>');

const BADGES: Partial<Record<Classification, string>> = {
  best: STAR,
  excellent: LICHESS['!'](0),
  inaccuracy: LICHESS['?!'](0),
  mistake: LICHESS['?'](0),
  blunder: LICHESS['??'](0),
};

/** The badge for a move's grade, on the square the piece moved to. "Good" moves get none, to keep the board calm. */
export function moveBadge(classification: Classification, square: string): DrawShape | undefined {
  const html = BADGES[classification];
  return html ? { orig: square as Key, customSvg: { html } } : undefined;
}

import type { EngineLine } from './engine';

/** An evaluation from White's point of view: centipawns, or moves to mate (positive = White mates). */
export interface Score {
  cp?: number;
  mate?: number;
  /** Set with mate 0: the position is checkmate and this side has won. */
  winner?: 'w' | 'b';
}

/** What the engine found in one position, stored from White's point of view. */
export interface PositionEval {
  fen: string;
  depth: number;
  score: Score;
  /** Best move in UCI notation, absent when the game is over. */
  best?: string;
  pv: string[];
  /** Second-best line, when MultiPV found one. */
  second?: { score: Score; pv: string[] };
}

export type Classification = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export interface MoveReview {
  classification: Classification;
  /** Win chance lost by the player who moved, from 0 (nothing) to 2 (won game to lost game). */
  loss: number;
  /** Accuracy of this single move, 0–100. */
  accuracy: number;
  before: PositionEval;
  after: PositionEval;
}

export const LABELS: Record<Classification, { name: string; glyph: string }> = {
  best: { name: 'Best move', glyph: '★' },
  excellent: { name: 'Excellent', glyph: '!' },
  good: { name: 'Good', glyph: '' },
  inaccuracy: { name: 'Inaccuracy', glyph: '?!' },
  mistake: { name: 'Mistake', glyph: '?' },
  blunder: { name: 'Blunder', glyph: '??' },
};

/** Converts an engine line (side-to-move view) to White's point of view. */
export function toWhiteScore(line: Pick<EngineLine, 'cp' | 'mate'>, turn: 'w' | 'b'): Score {
  const sign = turn === 'w' ? 1 : -1;
  // "mate 0" means the side to move is already checkmated
  if (line.mate === 0) return { mate: 0, winner: turn === 'w' ? 'b' : 'w' };
  if (line.mate !== undefined) return { mate: sign * line.mate };
  return { cp: sign * (line.cp ?? 0) };
}

/** The side delivering mate, for a mate score. */
function mateWinner(score: Score): 'w' | 'b' {
  if (score.mate === 0) return score.winner ?? 'w';
  return (score.mate ?? 0) > 0 ? 'w' : 'b';
}

/** Win chance for White, from -1 (Black wins) to +1 (White wins). Lichess' published formula. */
export function winChance(score: Score): number {
  if (score.mate !== undefined) return mateWinner(score) === 'w' ? 1 : -1;
  const cp = Math.max(-1000, Math.min(1000, score.cp ?? 0));
  return 2 / (1 + Math.exp(-0.00368208 * cp)) - 1;
}

/** Text such as "+0.8", "−1.5", "M3" or "−M2" (White's view). */
export function formatScore(score: Score): string {
  if (score.mate !== undefined) {
    if (score.mate === 0) return mateWinner(score) === 'w' ? '1-0' : '0-1';
    return `${score.mate > 0 ? '' : '−'}M${Math.abs(score.mate)}`;
  }
  const pawns = (score.cp ?? 0) / 100;
  if (Math.abs(pawns) < 0.05) return '0.0';
  return `${pawns > 0 ? '+' : '−'}${Math.abs(pawns).toFixed(1)}`;
}

export function reviewMove(playedUci: string, mover: 'w' | 'b', before: PositionEval, after: PositionEval): MoveReview {
  const sign = mover === 'w' ? 1 : -1;
  // The engine's own choice is never a mistake; a drop in that case is search noise between the two positions.
  const engineMove = !!before.best && sameMove(playedUci, before.best);
  const loss = engineMove ? 0 : Math.max(0, sign * (winChance(before.score) - winChance(after.score)));
  // Lichess move accuracy, with win% on a 0–100 scale (loss * 50).
  const accuracy = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss * 50) - 3.1669));

  let classification: Classification;
  if (engineMove) classification = 'best';
  else if (loss >= 0.3) classification = 'blunder';
  else if (loss >= 0.2) classification = 'mistake';
  else if (loss >= 0.1) classification = 'inaccuracy';
  else if (loss < 0.025) classification = 'excellent';
  else classification = 'good';

  return { classification, loss, accuracy, before, after };
}

/** UCI moves are equal ignoring a promotion suffix to queen ("e7e8" vs "e7e8q"). */
function sameMove(a: string, b: string): boolean {
  const norm = (m: string) => (m.length === 5 && m[4] === 'q' ? m.slice(0, 4) : m);
  return norm(a) === norm(b);
}

/**
 * True when two neighbouring evaluations disagree too much to trust: the move played was the
 * engine's choice, yet the next position looks much worse (or the reverse). Searching both
 * positions deeper settles it.
 */
export function needsDeeperLook(playedUci: string, mover: 'w' | 'b', before: PositionEval, after: PositionEval): boolean {
  if (!before.best || !sameMove(playedUci, before.best)) return false;
  const sign = mover === 'w' ? 1 : -1;
  return Math.abs(sign * (winChance(before.score) - winChance(after.score))) >= 0.2;
}

export interface PlayerSummary {
  accuracy: number;
  moves: number;
  counts: Record<Classification, number>;
}

/** Per-player accuracy (average of move accuracies) and how many moves fell in each class. */
export function summarize(reviews: (MoveReview | undefined)[], firstMover: 'w' | 'b'): Record<'w' | 'b', PlayerSummary> {
  const empty = (): PlayerSummary => ({
    accuracy: 0,
    moves: 0,
    counts: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
  });
  const out = { w: empty(), b: empty() };
  reviews.forEach((r, i) => {
    if (!r) return;
    const side = (i % 2 === 0) === (firstMover === 'w') ? 'w' : 'b';
    out[side].moves++;
    out[side].accuracy += r.accuracy;
    out[side].counts[r.classification]++;
  });
  for (const s of [out.w, out.b]) if (s.moves) s.accuracy /= s.moves;
  return out;
}

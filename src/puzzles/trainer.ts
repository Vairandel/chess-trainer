import { Chess } from 'chess.js';

/** A puzzle from the Lichess database. `moves[0]` is the opponent's move that sets it up; then you play. */
export interface Puzzle {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
}

/** Raw rows as stored in data.json: [id, fen, "uci uci ...", rating, "theme theme"]. */
export type PuzzleRow = [string, string, string, number, string];

export function parsePuzzles(rows: PuzzleRow[]): Puzzle[] {
  return rows.map(([id, fen, moves, rating, themes]) => ({ id, fen, moves: moves.split(' '), rating, themes: themes.split(' ') }));
}

export interface Attempt {
  id: string;
  ok: boolean;
  /** Rating change from this attempt (0 for reviews of missed puzzles). */
  change: number;
}

/** Everything the trainer remembers between visits. */
export interface PuzzleState {
  rating: number;
  /** Rated attempts so far (the rating moves faster during the first ones). */
  played: number;
  history: Attempt[];
  /** Failed puzzles waiting to come back, with the attempt count after which they are due. */
  missed: { id: string; dueAfter: number }[];
  /** Puzzles already attempted (rated), so they are not given again as new puzzles. */
  seen: string[];
}

export const START_RATING = 1500;
/** A missed puzzle comes back after this many other puzzles. */
export const REVIEW_GAP = 5;

export function newState(): PuzzleState {
  return { rating: START_RATING, played: 0, history: [], missed: [], seen: [] };
}

/** Chance of solving a puzzle rated `puzzle` for a player rated `player` (Elo formula). */
export function expectedScore(player: number, puzzle: number): number {
  return 1 / (1 + Math.pow(10, (puzzle - player) / 400));
}

/** The rating change for an attempt: faster at first (K = 40 for 20 puzzles), then K = 20. */
export function ratingChange(player: number, puzzle: number, solved: boolean, played: number): number {
  const k = played < 20 ? 40 : 20;
  return Math.round(k * ((solved ? 1 : 0) - expectedScore(player, puzzle)));
}

/**
 * Is `uci` a correct answer? The solution move is, and so is any other move that gives
 * checkmate (a mate is a mate, as on Lichess).
 */
export function isCorrectMove(fen: string, uci: string, solution: string): boolean {
  if (uci === solution || (uci.length === 4 && solution === `${uci}q`)) return true;
  const chess = new Chess(fen);
  try {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' });
  } catch {
    return false;
  }
  return chess.isCheckmate();
}

/**
 * The next puzzle: a missed puzzle that is due (in the chosen theme) comes first, as a review;
 * otherwise a puzzle not seen yet, as close as possible to your rating.
 */
export function pickPuzzle(
  puzzles: Puzzle[],
  theme: string,
  state: PuzzleState,
  random: () => number = Math.random,
  avoid?: string,
): { puzzle: Puzzle; review: boolean } | undefined {
  const inTheme = theme === 'mixed' ? puzzles : puzzles.filter(p => p.themes.includes(theme));
  if (inTheme.length === 0) return undefined;

  const due = state.missed
    .filter(m => m.dueAfter <= state.played && m.id !== avoid)
    .map(m => inTheme.find(p => p.id === m.id))
    .filter((p): p is Puzzle => !!p);
  if (due.length) return { puzzle: due[0], review: true };

  const seen = new Set(state.seen);
  let fresh = inTheme.filter(p => !seen.has(p.id) && p.id !== avoid);
  if (fresh.length === 0) fresh = inTheme.filter(p => p.id !== avoid); // everything seen: start over
  if (fresh.length === 0) fresh = inTheme;
  for (const width of [100, 200, 400]) {
    const near = fresh.filter(p => Math.abs(p.rating - state.rating) <= width);
    if (near.length) return { puzzle: near[Math.floor(random() * near.length)], review: false };
  }
  const closest = [...fresh].sort((a, b) => Math.abs(a.rating - state.rating) - Math.abs(b.rating - state.rating));
  return { puzzle: closest[0], review: false };
}

/**
 * Records the result of a puzzle. A new puzzle changes your rating and, if failed, is queued to
 * come back. A review does not change the rating: solved, it leaves the queue; failed, it comes back again.
 */
export function recordResult(state: PuzzleState, puzzle: Puzzle, solved: boolean, review: boolean): { state: PuzzleState; change: number } {
  if (review) {
    const missed = state.missed.filter(m => m.id !== puzzle.id);
    if (!solved) missed.push({ id: puzzle.id, dueAfter: state.played + REVIEW_GAP });
    const history = [...state.history, { id: puzzle.id, ok: solved, change: 0 }].slice(-50);
    return { state: { ...state, missed, history }, change: 0 };
  }
  const change = ratingChange(state.rating, puzzle.rating, solved, state.played);
  const played = state.played + 1;
  const missed = solved ? state.missed : [...state.missed.filter(m => m.id !== puzzle.id), { id: puzzle.id, dueAfter: played + REVIEW_GAP }];
  return {
    state: {
      rating: state.rating + change,
      played,
      history: [...state.history, { id: puzzle.id, ok: solved, change }].slice(-50),
      missed,
      seen: state.seen.includes(puzzle.id) ? state.seen : [...state.seen, puzzle.id],
    },
    change,
  };
}

import type { PositionEval } from './review';

/** A game saved in "My games". */
export interface SavedGame {
  id: string;
  pgn: string;
  white: string;
  black: string;
  result: string;
  date?: string;
  event?: string;
  moves: number;
  addedAt: number;
  /** Set once the game has been fully analyzed. */
  accuracy?: { w: number; b: number };
}

const GAMES_KEY = 'chess-trainer:games';
const evalsKey = (id: string) => `chess-trainer:evals:${id}`;

/**
 * Saved games and their analysis, kept in this browser's localStorage.
 * Storage can be missing or full (private windows, blocked site data); every call copes with that.
 */
export class Library {
  list(): SavedGame[] {
    try {
      const raw = localStorage.getItem(GAMES_KEY);
      const games = raw ? (JSON.parse(raw) as SavedGame[]) : [];
      return Array.isArray(games) ? games : [];
    } catch {
      return [];
    }
  }

  get(id: string): SavedGame | undefined {
    return this.list().find(g => g.id === id);
  }

  /**
   * Adds games, skipping ones already saved (same PGN). Returns the saved entries, existing ones included,
   * in the order given. Throws if the browser refuses to store them.
   */
  add(games: Omit<SavedGame, 'id' | 'addedAt'>[]): SavedGame[] {
    const all = this.list();
    const now = Date.now();
    const out = games.map((g, i) => {
      const existing = all.find(s => normalize(s.pgn) === normalize(g.pgn));
      if (existing) return existing;
      const saved: SavedGame = { ...g, id: `${now.toString(36)}-${i}-${Math.random().toString(36).slice(2, 7)}`, addedAt: now + i };
      all.push(saved);
      return saved;
    });
    this.write(all);
    return out;
  }

  remove(id: string): void {
    this.write(this.list().filter(g => g.id !== id));
    try {
      localStorage.removeItem(evalsKey(id));
    } catch {
      // nothing stored, or storage unavailable
    }
  }

  setAccuracy(id: string, accuracy: { w: number; b: number }): void {
    const all = this.list();
    const game = all.find(g => g.id === id);
    if (!game) return;
    game.accuracy = accuracy;
    this.write(all);
  }

  saveEvals(id: string, evals: PositionEval[]): void {
    try {
      localStorage.setItem(evalsKey(id), JSON.stringify(evals));
    } catch {
      // storage full: the analysis just won't be remembered
    }
  }

  loadEvals(id: string): PositionEval[] {
    try {
      const raw = localStorage.getItem(evalsKey(id));
      return raw ? (JSON.parse(raw) as PositionEval[]) : [];
    } catch {
      return [];
    }
  }

  private write(games: SavedGame[]): void {
    try {
      localStorage.setItem(GAMES_KEY, JSON.stringify(games));
    } catch {
      throw new Error('Your browser would not save the games (storage is full or blocked).');
    }
  }
}

/** Same game regardless of line endings and spacing. */
function normalize(pgn: string): string {
  return pgn.replace(/\s+/g, ' ').trim();
}

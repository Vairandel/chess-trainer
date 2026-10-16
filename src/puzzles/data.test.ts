import { Chess } from 'chess.js';
import { afterAll, describe, expect, it } from 'vitest';
import { nodeStockfish } from '../../test/stockfish-node';
import { Engine } from '../engine';
import rows from './data.json';
import { THEMES } from './themes';
import { parsePuzzles, type PuzzleRow } from './trainer';

const puzzles = parsePuzzles(rows as PuzzleRow[]);

describe('the puzzle set', () => {
  it('has about a thousand puzzles around 900–2100, with unique ids', () => {
    expect(puzzles.length).toBeGreaterThan(1000);
    expect(new Set(puzzles.map(p => p.id)).size).toBe(puzzles.length);
    for (const p of puzzles) expect(p.rating >= 900 && p.rating < 2100, p.id).toBe(true);
  });

  it('only uses themes the app explains, with enough puzzles in each', () => {
    for (const p of puzzles) for (const t of p.themes) expect(THEMES[t], `${p.id}: ${t}`).toBeDefined();
    for (const t of Object.keys(THEMES)) expect(puzzles.filter(p => p.themes.includes(t)).length, t).toBeGreaterThanOrEqual(40);
  });

  it('every solution is legal', () => {
    for (const p of puzzles) {
      const c = new Chess(p.fen);
      for (const u of p.moves) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    }
  });
});

describe('solutions agree with Stockfish (a sample)', () => {
  const engine = new Engine(nodeStockfish());
  afterAll(() => engine.terminate());

  it('every move you must find is the best move, or mates', async () => {
    const sample = puzzles.filter((_, i) => i % Math.floor(puzzles.length / 40) === 0).slice(0, 40);
    const problems: string[] = [];
    for (const p of sample) {
      const c = new Chess(p.fen);
      for (let i = 0; i < p.moves.length; i++) {
        const u = p.moves[i];
        if (i % 2 === 1) {
          // your move: compare with the engine
          const r = await engine.analyze(c.fen(), { depth: 16, multipv: 2 });
          const [best, second] = r.lines;
          const sameAsBest = r.bestmove === u || r.bestmove === u.slice(0, 4);
          const stm = (l: typeof best) => (l.mate !== undefined ? (l.mate > 0 ? 100 : -100) : (l.cp ?? 0) / 100);
          // the played move is fine if it is the engine's choice, or an equally good alternative
          const alt = second && second.pv[0] === u ? stm(best) - stm(second) <= 0.3 : false;
          const mates = (() => {
            const t = new Chess(c.fen());
            t.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
            return t.isCheckmate();
          })();
          if (!sameAsBest && !alt && !mates) problems.push(`${p.id} move ${i}: ${u} (engine ${r.bestmove})`);
        }
        c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      }
    }
    expect(problems).toEqual([]);
  }, 600000);
});

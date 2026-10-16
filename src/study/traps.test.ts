import { Chess } from 'chess.js';
import { afterAll, describe, expect, it } from 'vitest';
import { nodeStockfish } from '../../test/stockfish-node';
import { Engine } from '../engine';
import { TRAPS, type Trap } from './traps';

/** Plays SAN moves from a FEN; throws with the move name if one is illegal. */
function play(fen: string, sans: string[]): Chess {
  const chess = new Chess(fen);
  for (const san of sans) {
    try {
      chess.move(san);
    } catch {
      throw new Error(`illegal move ${san} in ${fen}`);
    }
  }
  return chess;
}

const START = new Chess().fen();

describe('trap chapters are well formed', () => {
  it('have unique ids', () => {
    expect(new Set(TRAPS.map(t => t.id)).size).toBe(TRAPS.length);
  });

  for (const trap of TRAPS) {
    it(`${trap.id}: legal moves, a comment on every move, sensible indexes`, () => {
      play(START, trap.moves.map(m => m[0]));
      for (const [san, comment] of [...trap.moves, ...trap.instead]) expect(comment.length, san).toBeGreaterThan(5);
      expect(trap.mistake).toBeGreaterThanOrEqual(0);
      expect(trap.mistake).toBeLessThan(trap.moves.length);
      const before = play(START, trap.moves.slice(0, trap.mistake).map(m => m[0]));
      play(before.fen(), trap.instead.map(m => m[0]));
      for (const san of trap.alsoGood ?? []) play(before.fen(), [san]);
      // the mistake is a move of the side the chapter is about: yours to avoid, the opponent's to punish
      const mover = before.turn();
      expect(trap.role === 'avoid' ? mover === trap.you : mover !== trap.you).toBe(true);
      expect(trap.dos.length).toBeGreaterThan(0);
      expect(trap.donts.length).toBeGreaterThan(0);
    });
  }
});

describe('trap chapters are correct (checked by Stockfish)', () => {
  const engine = new Engine(nodeStockfish());
  afterAll(() => engine.terminate());

  /** Evaluation in pawns from `side`'s point of view; mates count as ±100. */
  async function evalFor(chess: Chess, side: 'w' | 'b'): Promise<number> {
    if (chess.isCheckmate()) return chess.turn() === side ? -100 : 100;
    if (chess.isDraw()) return 0;
    const r = await engine.analyze(chess.fen(), { depth: 16 });
    const line = r.lines[0];
    const stm = line.mate !== undefined ? Math.sign(line.mate) * 100 : (line.cp ?? 0) / 100;
    return chess.turn() === side ? stm : -stm;
  }

  for (const trap of TRAPS) {
    it(`${trap.id}`, async () => {
      const sans = trap.moves.map(m => m[0]);
      const end = play(START, sans);
      const final = await evalFor(end, trap.check.winner);
      if (trap.check.atLeast === 'mate') expect(final, 'final position should be mate').toBe(100);
      else expect(final, 'final advantage').toBeGreaterThanOrEqual(trap.check.atLeast);

      const before = play(START, sans.slice(0, trap.mistake));
      const mover = before.turn();
      const atStart = await evalFor(before, mover);
      const afterMistake = await evalFor(play(before.fen(), [sans[trap.mistake]]), mover);
      expect(atStart - afterMistake, `${sans[trap.mistake]} should cost something`).toBeGreaterThanOrEqual(0.4);

      for (const good of [trap.instead[0][0], ...(trap.alsoGood ?? [])]) {
        const afterGood = await evalFor(play(before.fen(), [good]), mover);
        expect(afterGood - afterMistake, `${good} should be clearly better than ${sans[trap.mistake]}`).toBeGreaterThanOrEqual(0.3);
        expect(afterGood, `${good} should not lose`).toBeGreaterThanOrEqual(-1.2);
      }
    }, 120000);
  }
});

export type { Trap };

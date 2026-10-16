import { Chess } from 'chess.js';
import { afterAll, describe, expect, it } from 'vitest';
import { nodeStockfish } from '../../test/stockfish-node';
import { Engine } from '../engine';
import { GAMES } from './games';
import SOURCE from './games-source.json';

/** Which downloaded score each game must match. */
const SOURCE_KEY: Record<string, keyof typeof SOURCE> = {
  opera: 'opera',
  immortal: 'immortal',
  evergreen: 'evergreen',
  century: 'century',
  'kramnik-carlsen': 'kramnik_carlsen',
  'immortal-zugzwang': 'saemisch_nimzowitsch',
  'kasparov-topalov': 'kasparov_topalov',
  'carlsen-ernst': 'carlsen_ernst',
};

function finalPosition(sans: string[]): Chess {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  return chess;
}

describe('famous games are well formed', () => {
  it('have unique ids', () => {
    expect(new Set(GAMES.map(g => g.id)).size).toBe(GAMES.length);
  });

  for (const game of GAMES) {
    it(`${game.id}: the exact moves of the source, a comment on every move`, () => {
      const source = SOURCE[SOURCE_KEY[game.id]];
      expect(source, 'no source score').toBeDefined();
      expect(game.moves.map(m => m[0]).join(' ')).toBe(source.moves);
      expect(game.result).toBe(source.result);
      for (const [san, comment] of game.moves) expect(comment.length, san).toBeGreaterThan(5);
      expect(game.lessons.length).toBeGreaterThan(0);
      // "Guess the move" makes you play the winner
      expect(game.you).toBe(game.result === '1-0' ? 'w' : 'b');
      // a game that ends in mate ends with the winner's move
      const end = finalPosition(source.moves.split(' '));
      if (end.isCheckmate()) expect(end.turn()).not.toBe(game.you);
    });
  }
});

describe('famous games end in a won position (checked by Stockfish)', () => {
  const engine = new Engine(nodeStockfish());
  afterAll(() => engine.terminate());

  for (const game of GAMES) {
    it(`${game.id}: the winner is clearly winning at the end`, async () => {
      const end = finalPosition(game.moves.map(m => m[0]));
      if (end.isCheckmate()) return;
      const r = await engine.analyze(end.fen(), { depth: 14 });
      const line = r.lines[0];
      const sign = end.turn() === game.you ? 1 : -1;
      const score = line.mate !== undefined ? sign * Math.sign(line.mate) * 100 : (sign * (line.cp ?? 0)) / 100;
      expect(score, `${game.id} final evaluation for the winner`).toBeGreaterThanOrEqual(3);
    }, 60000);
  }
});

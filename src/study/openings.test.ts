import { Chess } from 'chess.js';
import { afterAll, describe, expect, it } from 'vitest';
import { nodeStockfish } from '../../test/stockfish-node';
import { Analyzer } from '../analyzer';
import { Engine } from '../engine';
import { Game, type MoveNode } from '../game';
import type { PositionEval } from '../review';
import { OPENINGS } from './openings';
import { TRAPS } from './traps';

function load(pgn: string): Game {
  const g = new Game();
  g.loadPgn(pgn);
  return g;
}

function* walk(node: MoveNode): Generator<MoveNode> {
  for (const c of node.children) {
    yield c;
    yield* walk(c);
  }
}

describe('opening chapters are well formed', () => {
  it('have unique ids, and their trap links exist', () => {
    expect(new Set(OPENINGS.map(o => o.id)).size).toBe(OPENINGS.length);
    for (const o of OPENINGS) for (const t of o.traps ?? []) expect(TRAPS.some(x => x.id === t), t).toBe(true);
  });

  for (const o of OPENINGS) {
    it(`${o.id}: legal, a comment on every move, one repertoire move at each of your turns`, () => {
      const game = load(o.pgn);
      expect(game.root.children).toHaveLength(1);
      for (const node of walk(game.root)) {
        const ply = node.ply!;
        expect(ply.comment ?? '', `${ply.san} has no comment`).not.toBe('');
        // after this move, if it is your turn, the tree must hold exactly one move for you
        const yourTurn = ply.fenAfter.split(' ')[1] === o.you;
        if (yourTurn && node.children.length > 0) expect(node.children.length, `after ${ply.san}`).toBe(1);
      }
      expect(o.plans.length).toBeGreaterThan(0);
    });
  }
});

describe('your repertoire moves are sound (checked by Stockfish)', () => {
  const engine = new Engine(nodeStockfish());
  const analyzer = new Analyzer(engine);
  afterAll(() => engine.terminate());

  const pawns = (e: PositionEval) => (e.score.mate !== undefined ? (e.score.mate > 0 ? 50 : -50) : (e.score.cp ?? 0) / 100);

  for (const o of OPENINGS) {
    it(`${o.id}`, async () => {
      const game = load(o.pgn);
      const sign = o.you === 'w' ? 1 : -1;
      const problems: string[] = [];
      for (const node of walk(game.root)) {
        const ply = node.ply!;
        if (ply.color !== o.you) continue;
        const before = await analyzer.evaluate(ply.fenBefore, 16);
        const after = await analyzer.evaluate(ply.fenAfter, 16);
        const loss = sign * (pawns(before) - pawns(after));
        const kept = sign * pawns(after);
        // within half a pawn of the best move — or a simpler move that keeps a clear advantage (+0.8 or more)
        if (!(loss <= 0.5 || (kept >= 0.8 && loss <= 1))) {
          const best = before.best ? new Chess(ply.fenBefore).move({ from: before.best.slice(0, 2), to: before.best.slice(2, 4), promotion: before.best[4] }).san : '?';
          problems.push(`${ply.fenBefore.split(' ')[5]}${ply.color === 'w' ? '.' : '...'}${ply.san} loses ${loss.toFixed(2)} (best ${best})`);
        }
      }
      expect(problems).toEqual([]);
    }, 600000);
  }
});

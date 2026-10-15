import { Chess } from 'chess.js';
import { afterAll, describe, expect, it } from 'vitest';
import { nodeStockfish } from '../test/stockfish-node';
import { Engine, type EngineLine } from './engine';
import { chooseMove, describeElo, Opponent, strengthFor } from './opponent';

const line = (move: string, cp: number, mate?: number): EngineLine => ({ multipv: 1, depth: 10, cp: mate ? undefined : cp, mate, pv: [move] });

/** A small seeded random generator, so the statistics below are the same on every run. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function pickRates(lines: EngineLine[], elo: number, runs = 4000): Record<string, number> {
  const random = seeded(42);
  const counts: Record<string, number> = {};
  for (let i = 0; i < runs; i++) {
    const m = chooseMove(lines, elo, random)!;
    counts[m] = (counts[m] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / runs]));
}

describe('strength', () => {
  it('searches deeper and chooses more carefully as the level rises', () => {
    const low = strengthFor(800);
    const high = strengthFor(1800);
    expect(low.depth).toBeLessThan(high.depth);
    expect(low.temperature).toBeGreaterThan(high.temperature);
    expect(strengthFor(500)).toEqual(low); // clamped
    expect(describeElo(1500)).toBe('Club player');
  });

  it('a weak level often plays a worse move, a strong level rarely', () => {
    // best move, a slightly worse one, and a blunder losing about a piece
    const lines = [line('e2e4', 30), line('d2d4', 10), line('g2g4', -280)];
    const weak = pickRates(lines, 800);
    const strong = pickRates(lines, 1800);
    expect(weak.e2e4).toBeLessThan(0.6);
    expect(weak.g2g4).toBeGreaterThan(0.1); // beginners blunder sometimes
    expect(strong.e2e4).toBeGreaterThan(0.6);
    expect(strong.g2g4 ?? 0).toBeLessThan(0.001);
  });

  it('finds mate at a strong level and treats mates as big scores', () => {
    const lines = [line('d1h5', 0, 1), line('g1f3', 40), line('b1c3', 20)];
    expect(pickRates(lines, 1800).d1h5).toBe(1);
    // being mated is the worst outcome of all
    expect(chooseMove([line('a2a3', 0, -2), line('h2h3', -900)], 1800, () => 0.5)).toBe('h2h3');
  });

  it('returns nothing without lines', () => {
    expect(chooseMove([], 1200)).toBeUndefined();
  });
});

describe('Opponent (with Stockfish)', () => {
  const engine = new Engine(nodeStockfish());
  const opponent = new Opponent(Promise.resolve(engine));
  afterAll(() => engine.terminate());

  it('plays a whole game of legal moves at a low level', async () => {
    const chess = new Chess();
    const random = seeded(7);
    for (let i = 0; i < 30 && !chess.isGameOver(); i++) {
      const uci = await opponent.move(chess.fen(), 800, random);
      expect(uci).toBeDefined();
      chess.move({ from: uci!.slice(0, 2), to: uci!.slice(2, 4), promotion: uci![4] });
    }
  }, 60000);

  it('takes a free queen at the top level', async () => {
    // 1. e4 e5 2. Nf3 Qh4?? — the queen on h4 can be taken
    const fen = 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    const random = seeded(1);
    for (let i = 0; i < 3; i++) expect(await opponent.move(fen, 1800, random)).toBe('f3h4');
  }, 30000);

  it('gives the best move as a hint', async () => {
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
    expect(await opponent.hint(fen)).toBe('h5f7');
  }, 30000);
});

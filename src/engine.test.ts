import { afterAll, describe, expect, it } from 'vitest';
import { nodeStockfish } from '../test/stockfish-node';
import { Engine, parseInfo, type UciTransport } from './engine';

describe('parseInfo', () => {
  it('reads depth, multipv, centipawns and the pv', () => {
    expect(parseInfo('info depth 12 seldepth 19 multipv 2 score cp -251 nodes 6244 nps 297333 time 21 pv h5e2 c6d4')).toEqual({
      multipv: 2,
      depth: 12,
      cp: -251,
      pv: ['h5e2', 'c6d4'],
    });
  });

  it('reads mate scores', () => {
    expect(parseInfo('info depth 12 seldepth 2 multipv 1 score mate 1 nodes 6244 time 20 pv h5f7')?.mate).toBe(1);
    expect(parseInfo('info depth 5 multipv 1 score mate -3 pv a1a2')?.mate).toBe(-3);
  });

  it('ignores lines without a score, and bound scores', () => {
    expect(parseInfo('info depth 10 currmove e2e4 currmovenumber 1')).toBeUndefined();
    expect(parseInfo('info string NNUE evaluation enabled')).toBeUndefined();
    expect(parseInfo('info depth 10 multipv 1 score cp 30 lowerbound nodes 5 pv e2e4')).toBeUndefined();
  });
});

describe('Engine', () => {
  it('fails fast when the engine cannot load', async () => {
    const listeners: ((l: string) => void)[] = [];
    const broken: UciTransport = {
      send: () => setTimeout(() => listeners.forEach(l => l('error failed to fetch wasm')), 5),
      onLine: l => listeners.push(l),
      terminate: () => {},
    };
    await expect(new Engine(broken).whenReady()).rejects.toThrow('failed to fetch wasm');
  });

  describe('with Stockfish', () => {
    const engine = new Engine(nodeStockfish());
    afterAll(() => engine.terminate());

    it('finds mate in one with two lines', async () => {
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
      const result = await engine.analyze(fen, { depth: 10, multipv: 2 });
      expect(result.bestmove).toBe('h5f7');
      expect(result.lines[0].mate).toBe(1);
      expect(result.lines).toHaveLength(2);
      expect(result.lines[1].cp).toBeLessThan(0);
    });

    it('runs searches one after another', async () => {
      const [a, b] = await Promise.all([
        engine.analyze('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { depth: 8 }),
        engine.analyze('7k/8/8/8/8/8/8/K5R1 w - - 0 1', { depth: 8 }),
      ]);
      expect(Math.abs(a.lines[0].cp ?? 999)).toBeLessThan(100);
      expect(b.lines[0].mate ?? b.lines[0].cp! > 500).toBeTruthy();
      expect(b.lines).toHaveLength(1);
    });
  });
});

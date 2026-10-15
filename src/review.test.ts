import { describe, expect, it } from 'vitest';
import { formatScore, reviewMove, summarize, toWhiteScore, winChance, type PositionEval } from './review';

const evalOf = (score: PositionEval['score'], best?: string): PositionEval => ({ fen: '', depth: 12, score, best, pv: [] });

describe('scores', () => {
  it('converts the side-to-move view to White’s view', () => {
    expect(toWhiteScore({ cp: 50 }, 'w')).toEqual({ cp: 50 });
    expect(toWhiteScore({ cp: 50 }, 'b')).toEqual({ cp: -50 });
    expect(toWhiteScore({ mate: 2 }, 'b')).toEqual({ mate: -2 });
    expect(toWhiteScore({ mate: 0 }, 'b')).toEqual({ mate: 0, winner: 'w' });
  });

  it('maps scores to win chances', () => {
    expect(winChance({ cp: 0 })).toBe(0);
    expect(winChance({ cp: 300 })).toBeGreaterThan(0.5);
    expect(winChance({ cp: -300 })).toBeCloseTo(-winChance({ cp: 300 }));
    expect(winChance({ mate: -4 })).toBe(-1);
    expect(winChance({ mate: 0, winner: 'w' })).toBe(1);
  });

  it('formats scores', () => {
    expect(formatScore({ cp: 83 })).toBe('+0.8');
    expect(formatScore({ cp: -150 })).toBe('−1.5');
    expect(formatScore({ cp: 2 })).toBe('0.0');
    expect(formatScore({ mate: 3 })).toBe('M3');
    expect(formatScore({ mate: -2 })).toBe('−M2');
    expect(formatScore({ mate: 0, winner: 'b' })).toBe('0-1');
  });
});

describe('reviewMove', () => {
  it('marks the engine move as best', () => {
    const r = reviewMove('g1f3', 'w', evalOf({ cp: 30 }, 'g1f3'), evalOf({ cp: 28 }));
    expect(r.classification).toBe('best');
    expect(r.accuracy).toBeGreaterThan(95);
  });

  it('grades by lost win chance, from the mover’s side', () => {
    expect(reviewMove('a7a6', 'b', evalOf({ cp: 0 }, 'e7e5'), evalOf({ cp: 60 })).classification).toBe('inaccuracy');
    expect(reviewMove('a7a6', 'b', evalOf({ cp: 0 }, 'e7e5'), evalOf({ cp: 130 })).classification).toBe('mistake');
    expect(reviewMove('a7a6', 'b', evalOf({ cp: 0 }, 'e7e5'), evalOf({ cp: 400 })).classification).toBe('blunder');
    expect(reviewMove('a7a6', 'b', evalOf({ cp: 0 }, 'e7e5'), evalOf({ cp: 5 })).classification).toBe('excellent');
  });

  it('calls a missed mate a blunder only when the win is really gone', () => {
    // still completely winning: not a blunder
    expect(reviewMove('a1a2', 'w', evalOf({ mate: 3 }, 'h1h8'), evalOf({ cp: 900 })).classification).not.toBe('blunder');
    // mate given away into equality
    expect(reviewMove('a1a2', 'w', evalOf({ mate: 3 }, 'h1h8'), evalOf({ cp: 0 })).classification).toBe('blunder');
  });

  it('treats a promotion to queen as the same move', () => {
    expect(reviewMove('e7e8q', 'w', evalOf({ cp: 900 }, 'e7e8q'), evalOf({ cp: 900 })).classification).toBe('best');
  });
});

describe('summarize', () => {
  it('splits accuracy and counts by player', () => {
    const best = reviewMove('e2e4', 'w', evalOf({ cp: 30 }, 'e2e4'), evalOf({ cp: 30 }));
    const blunder = reviewMove('a7a6', 'b', evalOf({ cp: 30 }, 'e7e5'), evalOf({ cp: 600 }));
    const s = summarize([best, blunder, best, undefined], 'w');
    expect(s.w.moves).toBe(2);
    expect(s.b.counts.blunder).toBe(1);
    expect(s.w.accuracy).toBeGreaterThan(s.b.accuracy);
  });
});

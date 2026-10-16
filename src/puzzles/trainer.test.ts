import { describe, expect, it } from 'vitest';
import { expectedScore, isCorrectMove, newState, pickPuzzle, ratingChange, recordResult, REVIEW_GAP, type Puzzle } from './trainer';

const p = (id: string, rating: number, themes = ['fork']): Puzzle => ({ id, fen: '', moves: [], rating, themes });

describe('rating', () => {
  it('uses the Elo expectation', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5);
    expect(expectedScore(1500, 1900)).toBeLessThan(0.1);
  });

  it('gains more for a harder puzzle, and moves faster at first', () => {
    expect(ratingChange(1500, 1800, true, 0)).toBeGreaterThan(ratingChange(1500, 1200, true, 0));
    expect(ratingChange(1500, 1500, true, 0)).toBe(20);
    expect(ratingChange(1500, 1500, true, 30)).toBe(10);
    expect(ratingChange(1500, 1500, false, 30)).toBe(-10);
  });
});

describe('checking moves', () => {
  it('accepts the solution, and any other checkmate', () => {
    // White to move: Qxf7# is the solution; Qh5xf7 in UCI is h5f7
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
    expect(isCorrectMove(fen, 'h5f7', 'h5f7')).toBe(true);
    expect(isCorrectMove(fen, 'h5e5', 'h5f7')).toBe(false);
    // two mates in one: Ra8# and Rb8#... both accepted
    const twoMates = '6k1/5ppp/8/8/8/8/8/RR4K1 w - - 0 1';
    expect(isCorrectMove(twoMates, 'b1b8', 'a1a8')).toBe(true);
    expect(isCorrectMove(twoMates, 'b1b7', 'a1a8')).toBe(false);
  });
});

describe('choosing puzzles', () => {
  const puzzles = [p('a', 1200), p('b', 1490), p('c', 1520), p('d', 1900), p('e', 1500, ['pin'])];

  it('picks a fresh puzzle near your rating in the theme', () => {
    const s = newState();
    const pick = pickPuzzle(puzzles, 'fork', s, () => 0)!;
    expect(['b', 'c']).toContain(pick.puzzle.id);
    expect(pick.review).toBe(false);
    expect(pickPuzzle(puzzles, 'pin', s)!.puzzle.id).toBe('e');
    expect(pickPuzzle(puzzles, 'mixed', s, () => 0.99)!.puzzle.rating).toBeGreaterThan(1400);
  });

  it('widens the search when nothing is close', () => {
    const s = { ...newState(), rating: 2600 };
    expect(pickPuzzle(puzzles, 'fork', s)!.puzzle.id).toBe('d');
  });

  it('brings a missed puzzle back after a few others, as a review', () => {
    let s = newState();
    s = recordResult(s, puzzles[1], false, false).state;
    expect(s.missed).toEqual([{ id: 'b', dueAfter: 1 + REVIEW_GAP }]);
    expect(pickPuzzle(puzzles, 'fork', s, () => 0)!.review).toBe(false); // not due yet
    for (let i = 0; i < REVIEW_GAP; i++) s = recordResult(s, puzzles[2], true, false).state;
    const pick = pickPuzzle(puzzles, 'fork', s)!;
    expect(pick).toEqual({ puzzle: puzzles[1], review: true });
    // solved on review: leaves the queue, and the rating does not move
    const before = s.rating;
    s = recordResult(s, puzzles[1], true, true).state;
    expect(s.missed).toEqual([]);
    expect(s.rating).toBe(before);
  });

  it('does not repeat seen puzzles while fresh ones remain', () => {
    let s = newState();
    s = recordResult(s, puzzles[1], true, false).state;
    for (let i = 0; i < 10; i++) expect(pickPuzzle(puzzles, 'fork', s, Math.random)!.puzzle.id).not.toBe('b');
  });
});

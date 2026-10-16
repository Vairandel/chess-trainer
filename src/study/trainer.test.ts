import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import { OPENINGS } from './openings';
import { allLines, guessPoints, judge, learnedCount, lineKey, nextLine, recordRun, type ChapterProgress } from './trainer';

function tree(pgn: string) {
  const g = new Game();
  g.loadPgn(pgn);
  return g.root;
}

describe('lines', () => {
  it('lists every line from the first move to each leaf', () => {
    const lines = allLines(tree('1. e4 e5 (1... c5 2. Nf3) (1... e6 2. d4 d5) 2. Nf3 *'));
    expect(lines.map(lineKey)).toEqual(['e4 e5 Nf3', 'e4 c5 Nf3', 'e4 e6 d4 d5']);
  });

  it('finds the lines of the real chapters', () => {
    for (const o of OPENINGS) expect(allLines(tree(o.pgn)).length, o.id).toBeGreaterThan(1);
  });
});

describe('choosing the next line', () => {
  const lines = allLines(tree('1. e4 e5 (1... c5 2. Nf3) (1... e6 2. d4) 2. Nf3 *'));
  const keys = lines.map(lineKey);

  it('starts with lines never practised', () => {
    let progress: ChapterProgress = {};
    progress = recordRun(progress, keys[0], 0, 1);
    progress = recordRun(progress, keys[1], 2, 2);
    expect(nextLine(lines, progress, () => 0)).toBe(2);
  });

  it('then brings back lines with mistakes', () => {
    let progress: ChapterProgress = {};
    progress = recordRun(progress, keys[0], 0, 1);
    progress = recordRun(progress, keys[1], 1, 2);
    progress = recordRun(progress, keys[2], 0, 3);
    expect(nextLine(lines, progress, () => 0.99)).toBe(1);
  });

  it('then repeats the learned line seen longest ago, avoiding the one just played', () => {
    let progress: ChapterProgress = {};
    progress = recordRun(progress, keys[0], 0, 5);
    progress = recordRun(progress, keys[1], 0, 1);
    progress = recordRun(progress, keys[2], 0, 3);
    expect(nextLine(lines, progress, () => 0)).toBe(1);
    expect(nextLine(lines, progress, () => 0, keys[1])).toBe(2);
  });

  it('counts learned lines; a mistake un-learns a line', () => {
    let progress: ChapterProgress = {};
    progress = recordRun(progress, keys[0], 0);
    progress = recordRun(progress, keys[1], 0);
    expect(learnedCount(lines, progress)).toBe(2);
    progress = recordRun(progress, keys[1], 1);
    expect(learnedCount(lines, progress)).toBe(1);
  });
});

describe('guess the move points', () => {
  it('gives 2 for the master move, 1 for an engine-equal move, 0 otherwise', () => {
    expect(guessPoints(judge('Nf3', 'Nf3'))).toBe(2);
    expect(guessPoints(judge('d4', 'Nf3', 0.25, 0.3))).toBe(1);
    expect(guessPoints(judge('h4', 'Nf3', -0.6, 0.3))).toBe(0);
    expect(guessPoints(judge('d4', 'Nf3'))).toBe(0);
  });
});

describe('judging a move', () => {
  it('accepts the repertoire move, and engine-equal alternatives as playable', () => {
    expect(judge('Nf3', 'Nf3')).toBe('repertoire');
    expect(judge('d4', 'Nf3', 0.25, 0.3)).toBe('playable');
    expect(judge('h4', 'Nf3', -0.6, 0.3)).toBe('mistake');
    expect(judge('d4', 'Nf3')).toBe('unknown');
  });
});

import { describe, expect, it } from 'vitest';
import { Game } from '../game';
import { openingStats } from './progress';
import { allLines, lineKey, recordRun, type ChapterProgress } from './trainer';

const g = new Game();
g.loadPgn('1. e4 e5 (1... c5 2. Nf3) (1... e6 2. d4) 2. Nf3 *');
const lines = allLines(g.root);
const keys = lines.map(lineKey);

describe('opening status', () => {
  it('is new until a line is tried', () => {
    expect(openingStats(lines, {})).toEqual({ learned: 0, total: 3, due: 0, status: 'new' });
  });

  it('is started once lines are tried; lines with mistakes are due', () => {
    let p: ChapterProgress = {};
    p = recordRun(p, keys[0], 0);
    p = recordRun(p, keys[1], 2);
    expect(openingStats(lines, p)).toEqual({ learned: 1, total: 3, due: 1, status: 'started' });
  });

  it('is done when every line is learned', () => {
    let p: ChapterProgress = {};
    for (const k of keys) p = recordRun(p, k, 0);
    expect(openingStats(lines, p).status).toBe('done');
  });
});

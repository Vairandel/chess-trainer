import { Game, type MoveNode } from '../game';
import type { OpeningChapter } from './openings';
import { allLines, learnedCount, lineKey, type ChapterProgress } from './trainer';
import { store } from '../store';

/** Study progress (in the app's store): opening lines, traps studied, game scores, and the last chapter opened. */

const PROGRESS_KEY = 'openings';
const STUDIED_KEY = 'traps-studied';
const LAST_KEY = 'last-chapter';
const GUESS_KEY = 'guess-best';

export type Status = 'new' | 'started' | 'done';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable: progress lasts until the page is closed
  }
}

export function loadProgress(): Record<string, ChapterProgress> {
  return read(PROGRESS_KEY, {});
}

export function saveProgress(all: Record<string, ChapterProgress>): void {
  write(PROGRESS_KEY, all);
}

export function studiedTraps(): string[] {
  return read<string[]>(STUDIED_KEY, []);
}

export function markTrapStudied(id: string): void {
  const all = studiedTraps();
  if (!all.includes(id)) write(STUDIED_KEY, [...all, id]);
}

/** Best "Guess the move" result per famous game, as a percentage of the points available. */
export function guessBest(): Record<string, number> {
  return read<Record<string, number>>(GUESS_KEY, {});
}

/** Records a finished guess run; returns true if it is a new best. */
export function recordGuess(id: string, points: number, max: number): boolean {
  const all = guessBest();
  const pct = max ? Math.round((100 * points) / max) : 0;
  if (all[id] !== undefined && all[id] >= pct) return false;
  write(GUESS_KEY, { ...all, [id]: pct });
  return true;
}

export function lastChapter(): string | undefined {
  return read<string | undefined>(LAST_KEY, undefined);
}

export function setLastChapter(id: string): void {
  write(LAST_KEY, id);
}

/** The lines of a chapter's tree (cached: the library shows progress for every chapter). */
const linesCache = new Map<string, MoveNode[][]>();
export function chapterLines(o: OpeningChapter): MoveNode[][] {
  let lines = linesCache.get(o.id);
  if (!lines) {
    const g = new Game();
    g.loadPgn(o.pgn);
    lines = allLines(g.root);
    linesCache.set(o.id, lines);
  }
  return lines;
}

/** Learned and total lines, lines due for review (tried but not learned), and the status. */
export function openingStats(lines: MoveNode[][], progress: ChapterProgress): { learned: number; total: number; due: number; status: Status } {
  const learned = learnedCount(lines, progress);
  const tried = lines.filter(l => progress[lineKey(l)]).length;
  const due = tried - learned;
  const status: Status = learned === lines.length ? 'done' : tried > 0 ? 'started' : 'new';
  return { learned, total: lines.length, due, status };
}

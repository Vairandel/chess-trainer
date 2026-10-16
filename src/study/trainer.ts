import type { MoveNode } from '../game';

/** How a line went in practice. */
export interface LineProgress {
  /** Played through without a mistake at least once since the last mistake. */
  learned: boolean;
  /** Mistakes made the last time the line was practised. */
  mistakes: number;
  /** When it was last practised (ms since epoch). */
  lastSeen: number;
}

/** Progress of one chapter, by line key. */
export type ChapterProgress = Record<string, LineProgress>;

/** Every line of a tree: the moves from the first move to each leaf. */
export function allLines(root: MoveNode): MoveNode[][] {
  const out: MoveNode[][] = [];
  const walk = (node: MoveNode, path: MoveNode[]) => {
    if (node.children.length === 0) {
      if (path.length) out.push(path);
      return;
    }
    for (const c of node.children) walk(c, [...path, c]);
  };
  walk(root, []);
  return out;
}

/** A stable name for a line: its moves in SAN, e.g. "Nf3 d5 d4 Nf6". */
export function lineKey(line: MoveNode[]): string {
  return line.map(n => n.ply!.san).join(' ');
}

export function learnedCount(lines: MoveNode[][], progress: ChapterProgress): number {
  return lines.filter(l => progress[lineKey(l)]?.learned).length;
}

/**
 * Which line to practise next: lines never tried first, then lines with mistakes,
 * then the learned line seen longest ago. Ties are broken at random.
 */
export function nextLine(lines: MoveNode[][], progress: ChapterProgress, random: () => number = Math.random, avoid?: string): number {
  const rank = (i: number): number => {
    const p = progress[lineKey(lines[i])];
    if (!p) return 0;
    if (!p.learned) return 1;
    return 2;
  };
  const candidates = lines.map((_, i) => i).filter(i => lines.length === 1 || lineKey(lines[i]) !== avoid);
  const best = Math.min(...candidates.map(rank));
  let pool = candidates.filter(i => rank(i) === best);
  if (best === 2) {
    // among learned lines, the one seen longest ago
    const oldest = Math.min(...pool.map(i => progress[lineKey(lines[i])].lastSeen));
    pool = pool.filter(i => progress[lineKey(lines[i])].lastSeen === oldest);
  }
  return pool[Math.floor(random() * pool.length)];
}

/** Records a finished run of a line. A run without mistakes makes the line learned. */
export function recordRun(progress: ChapterProgress, key: string, mistakes: number, now = Date.now()): ChapterProgress {
  return { ...progress, [key]: { learned: mistakes === 0, mistakes, lastSeen: now } };
}

/**
 * Judges a move you tried against the repertoire move, from the evaluations after each
 * (in pawns, from your side). Within `tolerance` of the repertoire move it is "playable".
 */
export function judge(tried: string, expected: string, evalTried?: number, evalExpected?: number, tolerance = 0.3): 'repertoire' | 'playable' | 'mistake' | 'unknown' {
  if (tried === expected) return 'repertoire';
  if (evalTried === undefined || evalExpected === undefined) return 'unknown';
  return evalTried >= evalExpected - tolerance ? 'playable' : 'mistake';
}

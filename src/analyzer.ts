import { Chess } from 'chess.js';
import type { Engine, EngineResult } from './engine';
import { needsDeeperLook, toWhiteScore, type PositionEval } from './review';

/** A move to grade: the engine looks at the position before and after it. */
export interface AnalyzedMove {
  uci: string;
  color: 'w' | 'b';
  fenBefore: string;
  fenAfter: string;
}

/** Upper bound per position so a deep setting never stalls the page. */
const MOVETIME_MS = 4000;

/**
 * Evaluates positions with the engine and remembers the results by FEN,
 * so moving back and forth or re-analyzing a game costs nothing.
 */
export class Analyzer {
  private cache = new Map<string, PositionEval>();
  private gameJob = 0;
  private live?: { fen: string; depth: number; done: (e: PositionEval) => void };
  private liveRunning = false;

  private engine: Promise<Engine>;

  /** The engine may still be loading; saved evaluations can be used before it is ready. */
  constructor(engine: Engine | Promise<Engine>) {
    this.engine = Promise.resolve(engine);
    this.engine.catch(() => {}); // a failed engine is reported by whoever started it
  }

  get(fen: string): PositionEval | undefined {
    return this.cache.get(fen);
  }

  /** Adds saved evaluations, e.g. from a game analyzed in an earlier visit. */
  seed(evals: PositionEval[]): void {
    for (const e of evals) {
      const existing = this.cache.get(e.fen);
      if (!existing || existing.depth < e.depth) this.cache.set(e.fen, e);
    }
  }

  async evaluate(fen: string, depth: number): Promise<PositionEval> {
    const cached = this.cache.get(fen);
    if (cached && cached.depth >= depth) return cached;

    const final = finishedPosition(fen);
    if (final) {
      this.cache.set(fen, final);
      return final;
    }
    const engine = await this.engine;
    const result = await engine.analyze(fen, { depth, multipv: 2, movetime: MOVETIME_MS });
    const evaluation = toPositionEval(fen, result);
    // a search stopped early must not replace a deeper result
    const existing = this.cache.get(fen);
    if (!existing || existing.depth <= evaluation.depth) this.cache.set(fen, evaluation);
    return this.cache.get(fen)!;
  }

  /**
   * Evaluates the positions around every move (main line and variations, in the order given), then
   * searches deeper wherever two neighbouring evaluations contradict each other.
   * Starting another game job cancels this one. Resolves true when done, false if cancelled.
   */
  async analyzeGame(moves: AnalyzedMove[], depth: number, onProgress: (done: number, total: number) => void): Promise<boolean> {
    const job = ++this.gameJob;
    const fens = [...new Set(moves.flatMap(m => [m.fenBefore, m.fenAfter]))];
    for (let i = 0; i < fens.length; i++) {
      if (job !== this.gameJob) return false;
      onProgress(i, fens.length);
      await this.evaluate(fens[i], depth);
    }
    onProgress(fens.length, fens.length); // every position done; the double-check pass follows
    for (const m of moves) {
      if (job !== this.gameJob) return false;
      if (needsDeeperLook(m.uci, m.color, this.cache.get(m.fenBefore)!, this.cache.get(m.fenAfter)!)) {
        await this.evaluate(m.fenBefore, depth + 6);
        await this.evaluate(m.fenAfter, depth + 6);
      }
    }
    return job === this.gameJob;
  }

  cancelGame(): void {
    this.gameJob++;
  }

  /**
   * Evaluates the position on the board. If several requests arrive while the engine is busy,
   * only the latest one runs — stepping quickly through a game doesn't build up a queue.
   */
  requestLive(fen: string, depth: number, done: (e: PositionEval) => void): void {
    this.live = { fen, depth, done };
    if (!this.liveRunning) void this.pumpLive();
  }

  private async pumpLive(): Promise<void> {
    this.liveRunning = true;
    try {
      while (this.live) {
        const { fen, depth, done } = this.live;
        this.live = undefined;
        try {
          done(await this.evaluate(fen, depth));
        } catch {
          // the engine failed; the caller shows that state separately
        }
      }
    } finally {
      this.liveRunning = false;
    }
  }
}

/** Checkmate and stalemate need no search. */
function finishedPosition(fen: string): PositionEval | undefined {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) {
    return { fen, depth: 99, score: { mate: 0, winner: chess.turn() === 'w' ? 'b' : 'w' }, pv: [] };
  }
  if (chess.isStalemate() || chess.isInsufficientMaterial()) return { fen, depth: 99, score: { cp: 0 }, pv: [] };
  return undefined;
}

export function toPositionEval(fen: string, result: EngineResult): PositionEval {
  const turn = fen.split(' ')[1] === 'b' ? 'b' : 'w';
  const [first, second] = result.lines;
  if (!first) return { fen, depth: result.depth, score: { cp: 0 }, best: result.bestmove, pv: [] };
  return {
    fen,
    depth: result.depth,
    score: toWhiteScore(first, turn),
    best: result.bestmove ?? first.pv[0],
    pv: first.pv,
    second: second && { score: toWhiteScore(second, turn), pv: second.pv },
  };
}

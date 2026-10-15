import { Chess } from 'chess.js';
import type { Engine, EngineResult } from './engine';
import { needsDeeperLook, toWhiteScore, type PositionEval } from './review';

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

  constructor(private engine: Engine) {}

  get(fen: string): PositionEval | undefined {
    return this.cache.get(fen);
  }

  async evaluate(fen: string, depth: number): Promise<PositionEval> {
    const cached = this.cache.get(fen);
    if (cached && cached.depth >= depth) return cached;

    const final = finishedPosition(fen);
    if (final) {
      this.cache.set(fen, final);
      return final;
    }
    const result = await this.engine.analyze(fen, { depth, multipv: 2, movetime: MOVETIME_MS });
    const evaluation = toPositionEval(fen, result);
    // a search stopped early must not replace a deeper result
    const existing = this.cache.get(fen);
    if (!existing || existing.depth <= evaluation.depth) this.cache.set(fen, evaluation);
    return this.cache.get(fen)!;
  }

  /**
   * Evaluates every position of a game, in order, then searches deeper wherever two neighbouring
   * evaluations contradict each other. Starting another game job cancels this one.
   * `fens` has one more entry than `moves`: the start position, then the position after each move.
   * Resolves true when all positions are done, false if it was cancelled.
   */
  async analyzeGame(
    fens: string[],
    moves: { uci: string; color: 'w' | 'b' }[],
    depth: number,
    onProgress: (done: number, total: number) => void,
  ): Promise<boolean> {
    const job = ++this.gameJob;
    for (let i = 0; i < fens.length; i++) {
      if (job !== this.gameJob) return false;
      onProgress(i, fens.length);
      await this.evaluate(fens[i], depth);
    }
    for (let i = 0; i < moves.length; i++) {
      if (job !== this.gameJob) return false;
      const before = this.cache.get(fens[i])!;
      const after = this.cache.get(fens[i + 1])!;
      if (needsDeeperLook(moves[i].uci, moves[i].color, before, after)) {
        await this.evaluate(fens[i], depth + 6);
        await this.evaluate(fens[i + 1], depth + 6);
      }
    }
    if (job !== this.gameJob) return false;
    onProgress(fens.length, fens.length);
    return true;
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

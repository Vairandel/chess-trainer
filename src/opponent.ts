import type { Engine, EngineLine } from './engine';

export const MIN_ELO = 800;
export const MAX_ELO = 1800;

/**
 * How a given strength plays. Stockfish's own UCI_Elo does not go below ~1320, so strength comes
 * from search depth plus a random choice among the best few moves: the weaker the level, the more
 * likely it is to pick a move that loses something, as human players at that level do.
 */
export function strengthFor(elo: number): { depth: number; multipv: number; temperature: number } {
  const t = (Math.max(MIN_ELO, Math.min(MAX_ELO, elo)) - MIN_ELO) / (MAX_ELO - MIN_ELO);
  return {
    depth: Math.round(5 + 6 * t), // 5 at 800 … 11 at 1800
    multipv: 6,
    // centipawns: a move this much worse than the best is picked e (≈2.7) times less often
    temperature: Math.round(220 * Math.pow(35 / 220, t)), // 220 at 800 … 35 at 1800
  };
}

/** A label for the strength slider. */
export function describeElo(elo: number): string {
  if (elo < 1000) return 'Beginner';
  if (elo < 1200) return 'Casual player';
  if (elo < 1400) return 'Improving player';
  if (elo < 1600) return 'Club player';
  return 'Strong club player';
}

/** Score in centipawns from the side to move, with mates as very large scores (sooner mates count more). */
function lineScore(line: EngineLine): number {
  if (line.mate !== undefined) return line.mate > 0 ? 10000 - line.mate * 10 : -10000 - line.mate * 10;
  return line.cp ?? 0;
}

/**
 * Picks a move among the engine's lines: each line is weighted by exp(-loss / temperature),
 * where loss is how much worse it is than the best line. `random` returns a number in [0, 1).
 */
export function chooseMove(lines: EngineLine[], elo: number, random: () => number = Math.random): string | undefined {
  const candidates = lines.filter(l => l.pv.length > 0);
  if (candidates.length === 0) return undefined;
  const { temperature } = strengthFor(elo);
  const scores = candidates.map(lineScore);
  const best = Math.max(...scores);
  const weights = scores.map(s => Math.exp(-Math.min(best - s, 3000) / temperature));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r < 0) return candidates[i].pv[0];
  }
  return candidates[candidates.length - 1].pv[0];
}

/** The computer opponent: a Stockfish instance of its own, so its settings never touch the analysis. */
export class Opponent {
  constructor(private engine: Promise<Engine>) {}

  async move(fen: string, elo: number, random: () => number = Math.random): Promise<string | undefined> {
    const engine = await this.engine;
    const { depth, multipv } = strengthFor(elo);
    const result = await engine.analyze(fen, { depth, multipv, movetime: 1500 });
    return chooseMove(result.lines, elo, random) ?? result.bestmove;
  }

  /** The best move here, for the Hint button. */
  async hint(fen: string): Promise<string | undefined> {
    const engine = await this.engine;
    const result = await engine.analyze(fen, { depth: 14, multipv: 1, movetime: 2000 });
    return result.bestmove;
  }
}

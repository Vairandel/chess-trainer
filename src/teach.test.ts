import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nodeStockfish } from '../test/stockfish-node';
import { Analyzer } from './analyzer';
import { Engine } from './engine';
import { Game } from './game';
import { reviewMove } from './review';
import { explainMove, lineToSan, purposeOf } from './teach';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('purposeOf (board only)', () => {
  it('describes development and the center', () => {
    expect(purposeOf(START, 'g1f3')).toContain('Develops the knight, bringing a new piece into play.');
    expect(purposeOf(START, 'e2e4')).toContain('Claims space in the center.');
  });

  it('describes castling', () => {
    const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    expect(purposeOf(fen, 'e1g1')[0]).toMatch(/^Castles kingside/);
  });

  it('finds a knight fork', () => {
    expect(purposeOf('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'b5c7')).toContain(
      'Forks the king and the rook on a8: they can\'t both be saved.',
    );
  });

  it('does not call it a fork when the forking piece can be taken', () => {
    // the bishop on d6 covers c7
    const lines = purposeOf('r3k3/8/3b4/1N6/8/8/8/4K3 w - - 0 1', 'b5c7');
    expect(lines.some(l => l.startsWith('Forks'))).toBe(false);
  });

  it('finds a pin to the king', () => {
    expect(purposeOf('4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1', 'f1b5')).toContain(
      'Pins the knight on c6 to the king: it is not allowed to move.',
    );
  });

  it('finds a pin to the queen', () => {
    expect(purposeOf('3qk3/8/8/3n4/8/8/8/3RK3 w - - 0 1', 'd1d2')).toContain(
      'Pins the knight on d5 to the queen behind it.',
    );
  });

  it('notices a piece escaping an attack', () => {
    // Black's pawn on e5 attacks the white knight on d4
    const fen = '4k3/8/8/4p3/3N4/8/8/4K3 w - - 0 1';
    expect(purposeOf(fen, 'd4f3')).toContain('Moves the attacked knight to safety.');
  });

  it('notices an undefended capture and a recapture', () => {
    expect(purposeOf('4k3/8/8/3n4/8/8/8/3QK3 w - - 0 1', 'd1d5')).toContain('Takes the knight on d5, which was undefended.');
  });

  it('criticizes the early queen only when asked to', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    expect(purposeOf(fen, 'd1h5', { criticize: true })).toContain(
      'Brings the queen out early: the opponent can gain time by attacking it.',
    );
    expect(purposeOf(fen, 'd1h5').some(l => l.includes('early'))).toBe(false);
  });

  it('notices giving up castling', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    expect(purposeOf(fen, 'e1e2')).toContain('Moves the king and gives up the right to castle.');
  });

  it('formats engine lines with move numbers', () => {
    expect(lineToSan(START, ['e2e4', 'e7e5', 'g1f3'])).toBe('1. e4 e5 2. Nf3');
    const black = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect(lineToSan(black, ['e7e5', 'g1f3'])).toBe('1...e5 2. Nf3');
  });
});

describe('explainMove (with Stockfish)', () => {
  let engine: Engine;
  let analyzer: Analyzer;
  beforeAll(() => {
    engine = new Engine(nodeStockfish());
    analyzer = new Analyzer(engine);
  });
  afterAll(() => engine.terminate());

  async function lessons(pgn: string) {
    const game = new Game();
    game.loadPgn(pgn);
    const fens = [game.startFen, ...game.plies.map(p => p.fenAfter)];
    const moves = game.plies.map(p => ({ uci: `${p.from}${p.to}${p.promotion ?? ''}`, color: p.color }));
    await analyzer.analyzeGame(fens, moves, 12, () => {});
    return game.plies.map((p, i) => {
      const review = reviewMove(`${p.from}${p.to}${p.promotion ?? ''}`, p.color, analyzer.get(fens[i])!, analyzer.get(fens[i + 1])!);
      return { review, lesson: explainMove(game.plies, i, review) };
    });
  }

  it('explains a hanging queen', async () => {
    const all = await lessons('1. e4 e5 2. Nf3 Qh4');
    const { review, lesson } = all[3];
    expect(review.classification).toBe('blunder');
    expect(lesson.problem).toBe('The queen on h4 is not safe there: 3. Nxh4 takes it.');
    expect(lesson.reply?.san).toBe('Nxh4');
    expect(lesson.better).toBeDefined();
  }, 30000);

  it('explains the missed chance to take it', async () => {
    const all = await lessons('1. e4 e5 2. Nf3 Qh4 3. Nc3');
    const { review, lesson } = all[4];
    expect(review.classification).toBe('blunder');
    expect(lesson.better?.san).toBe('Nxh4');
    expect(lesson.better?.reason).toBe('It wins the queen on h4.');
    expect(lesson.problem).toBe('It misses the chance to win the queen on h4.');
  }, 30000);

  it('does not call a fair trade a lost piece', async () => {
    const all = await lessons('1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3');
    expect(all[7].lesson.problem ?? '').not.toMatch(/not safe|unprotected/);
  }, 30000);

  it('blames the opponent’s tactic, not a small missed gain (Blackburne Shilling trap)', async () => {
    const all = await lessons('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7');
    expect(all[8].review.classification).toBe('blunder');
    expect(all[8].lesson.problem).toMatch(/^Black has 5\.\.\.Qxg2, which creates a double attack on the rook on h1/);
    expect(all[7].lesson.purpose).toContain('Creates a double attack on the knight on e5 and the pawn on g2.');
  }, 30000);

  it('explains allowing mate, and the mate itself', async () => {
    const all = await lessons('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#');
    expect(all[5].review.classification).toBe('blunder');
    expect(all[5].lesson.problem).toBe('This allows a forced mate in 1: 4. Qxf7#.');
    expect(all[6].lesson.purpose).toEqual(['Checkmate! The game is over.']);
    expect(all[6].review.classification).toBe('best');
  }, 30000);
});

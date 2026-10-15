import { describe, expect, it } from 'vitest';
import type { Square } from 'chess.js';
import { Game, splitPgnGames } from './game';

function playAll(game: Game, moves: string): void {
  for (const uci of moves.split(' ')) {
    const ok = game.play(uci.slice(0, 2) as Square, uci.slice(2, 4) as Square, (uci[4] as 'q') || undefined);
    if (!ok) throw new Error(`illegal in test setup: ${uci}`);
  }
}

describe('special moves', () => {
  it('castles both sides and moves the rook', () => {
    const g = new Game();
    playAll(g, 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 e1g1');
    expect(g.lastPly()?.san).toBe('O-O');
    expect(g.fen().split(' ')[0]).toContain('RNBQ1RK1');

    const q = new Game();
    playAll(q, 'd2d4 d7d5 b1c3 b8c6 c1f4 c8f5 d1d2 d8d7 e1c1');
    expect(q.lastPly()?.san).toBe('O-O-O');
    expect(q.fen().split(' ')[0]).toMatch(/2KR1BNR$/);
  });

  it('refuses to castle through an attacked square', () => {
    const g = new Game();
    // The black rook on f2 controls f1, which the king must cross.
    g.loadPgn('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/5r2/4K2R w K - 0 1"]\n\n*');
    expect(g.dests().get('e1')).not.toContain('g1');
  });

  it('refuses to castle after the king has moved', () => {
    const g = new Game();
    playAll(g, 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 e1e2 f8c5 e2e1 d7d6');
    expect(g.dests().get('e1')).not.toContain('g1');
  });

  it('captures en passant and removes the pawn', () => {
    const g = new Game();
    playAll(g, 'e2e4 a7a6 e4e5 d7d5');
    expect(g.dests().get('e5')).toContain('d6');
    playAll(g, 'e5d6');
    expect(g.lastPly()?.san).toBe('exd6');
    expect(g.position().get('d5')).toBeUndefined();
  });

  it('only allows en passant immediately', () => {
    const g = new Game();
    playAll(g, 'e2e4 a7a6 e4e5 d7d5 h2h3 h7h6');
    expect(g.dests().get('e5') ?? []).not.toContain('d6');
  });

  it('promotes, including underpromotion', () => {
    const fen = '[SetUp "1"]\n[FEN "8/P6k/8/8/8/8/8/K7 w - - 0 1"]\n\n*';
    const g = new Game();
    g.loadPgn(fen);
    expect(g.isPromotion('a7', 'a8')).toBe(true);
    expect(g.play('a7', 'a8', 'n')).toBe(true);
    expect(g.lastPly()?.san).toBe('a8=N');
    expect(g.position().get('a8')).toEqual({ type: 'n', color: 'w' });
  });

  it('rejects illegal moves', () => {
    const g = new Game();
    expect(g.play('e2', 'e5')).toBe(false);
    expect(g.plies).toHaveLength(0);
  });
});

describe('game status', () => {
  it('detects check and checkmate', () => {
    const g = new Game();
    playAll(g, 'f2f3 e7e5 g2g4');
    expect(g.status().over).toBeUndefined();
    playAll(g, 'd8h4');
    expect(g.status()).toMatchObject({ inCheck: true, over: 'Checkmate — Black wins' });
    expect(g.dests().size).toBe(0);
  });

  it('detects stalemate', () => {
    const g = new Game();
    g.loadPgn('[SetUp "1"]\n[FEN "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"]\n\n*');
    expect(g.status().over).toBe('Draw by stalemate');
  });

  it('detects threefold repetition', () => {
    const g = new Game();
    playAll(g, 'g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8');
    expect(g.status().over).toBe('Draw by threefold repetition');
  });
});

describe('navigation', () => {
  it('moves the cursor and replays positions', () => {
    const g = new Game();
    playAll(g, 'e2e4 e7e5 g1f3');
    g.goTo(1);
    expect(g.lastPly()?.san).toBe('e4');
    expect(g.status().turn).toBe('b');
    g.goTo(0);
    expect(g.lastPly()).toBeUndefined();
    g.goTo(99);
    expect(g.cursor).toBe(3);
  });

  it('replaces the rest of the game when playing from an earlier position', () => {
    const g = new Game();
    playAll(g, 'e2e4 e7e5 g1f3');
    g.goTo(1);
    playAll(g, 'c7c5');
    expect(g.plies.map(p => p.san)).toEqual(['e4', 'c5']);
  });
});

describe('PGN import', () => {
  const chessCom = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.10.01"]
[White "randi"]
[Black "opponent"]
[Result "1-0"]
[WhiteElo "1502"]
[BlackElo "1490"]
[TimeControl "600"]

1. e4 {[%clk 0:09:58.3]} 1... e5 {[%clk 0:09:57.1]} 2. Bc4 {[%clk 0:09:55]} 2... Nc6
{[%clk 0:09:50]} 3. Qh5 {[%clk 0:09:50]} 3... Nf6 {[%clk 0:09:40]} 4. Qxf7# {[%clk 0:09:48]} 1-0`;

  it('reads a chess.com game with clock comments', () => {
    const g = new Game();
    g.loadPgn(chessCom);
    expect(g.plies.map(p => p.san)).toEqual(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']);
    expect(g.plies.every(p => p.comment === undefined)).toBe(true);
    expect(g.headers.White).toBe('randi');
    expect(g.cursor).toBe(7);
    expect(g.status().over).toBe('Checkmate — White wins');
  });

  it('keeps written comments and drops clock tags', () => {
    const g = new Game();
    g.loadPgn('1. e4 {[%clk 0:10:00] Best by test.} e5 2. Nf3 *');
    expect(g.plies[0].comment).toBe('Best by test.');
  });

  it('reads a lichess game with variations and NAGs', () => {
    const g = new Game();
    g.loadPgn('[Event "Study"]\n\n1. e4 e5 2. Nf3 (2. f4 exf4) 2... Nc6 $1 3. Bb5 a6 *');
    expect(g.plies.map(p => p.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  });

  it('starts from a FEN header', () => {
    const g = new Game();
    g.loadPgn('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 Kd7 *');
    expect(g.startFen).toBe('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
    g.goTo(0);
    expect(g.fen()).toBe(g.startFen);
  });

  it('throws a readable error on invalid PGN', () => {
    const g = new Game();
    expect(() => g.loadPgn('1. e4 e5 2. Ke3 *')).toThrow(/could not be read/);
  });

  it('round-trips through pgn()', () => {
    const g = new Game();
    g.loadPgn(chessCom);
    const again = new Game();
    again.loadPgn(g.pgn());
    expect(again.plies.map(p => p.san)).toEqual(g.plies.map(p => p.san));
    expect(again.headers.White).toBe('randi');
  });

  it('splits a file with several games', () => {
    const file = `${chessCom}\n\n${chessCom.replace('randi', 'someone')}\n`;
    const games = splitPgnGames(file);
    expect(games).toHaveLength(2);
    expect(games[1]).toContain('someone');
  });
});

import { describe, expect, it } from 'vitest';
import { pickPgn } from './share';

const PGN = '[Event "Live Chess"]\n[White "Randi"]\n[Black "Friend"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0';

describe('finding the PGN in what another app shared', () => {
  it('takes a full PGN as it is', () => {
    expect(pickPgn([PGN])).toEqual({ kind: 'pgn', pgn: PGN });
  });

  it('skips words before the PGN', () => {
    expect(pickPgn([`Check out this game on Chess.com!\n\n${PGN}`])).toEqual({ kind: 'pgn', pgn: PGN });
  });

  it('accepts moves without headers', () => {
    expect(pickPgn(['Game:  1. d4 d5 2. c4 e6 *'])).toEqual({ kind: 'pgn', pgn: '1. d4 d5 2. c4 e6 *' });
  });

  it('prefers the part with the PGN (a file) over the title', () => {
    expect(pickPgn(['Randi vs Friend', PGN])).toEqual({ kind: 'pgn', pgn: PGN });
  });

  it('puts back line breaks an app removed', () => {
    const flat = `Check out this game! ${PGN.replace(/\n+/g, ' ')}`;
    const r = pickPgn([flat]);
    expect(r.kind === 'pgn' && r.pgn).toBe(PGN);
  });

  it('recognizes castling as a first move', () => {
    expect(pickPgn(['[FEN "x"]\n\n1. O-O O-O']).kind).toBe('pgn');
  });

  it('reports a bare link (no PGN in it)', () => {
    expect(pickPgn(['Randi vs Friend', 'https://www.chess.com/game/live/123456789'])).toEqual({
      kind: 'link',
      url: 'https://www.chess.com/game/live/123456789',
    });
  });

  it('reports nothing usable', () => {
    expect(pickPgn(['hello', ''])).toEqual({ kind: 'nothing' });
  });
});

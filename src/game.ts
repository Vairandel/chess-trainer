import { Chess, DEFAULT_POSITION, type Square } from 'chess.js';

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

/** One half-move of the game, with everything the UI (and later the analysis) needs. */
export interface Ply {
  san: string;
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
  color: 'w' | 'b';
  fenBefore: string;
  fenAfter: string;
  /** Comment written in the imported PGN, if any (clock tags removed). */
  comment?: string;
}

export interface GameStatus {
  turn: 'w' | 'b';
  inCheck: boolean;
  /** Set when the game is over at the current position. */
  over?: string;
}

/**
 * A game as a list of plies plus a cursor. The cursor is the number of plies
 * played on the board: 0 is the start position, plies.length is the end.
 * Playing a move while looking at an earlier position replaces the rest of the game.
 */
export class Game {
  startFen = DEFAULT_POSITION;
  headers: Record<string, string> = {};
  plies: Ply[] = [];
  cursor = 0;
  /** Chess instance replayed up to the cursor, so repetition draws are detected. */
  private current = new Chess();

  reset(): void {
    this.startFen = DEFAULT_POSITION;
    this.headers = {};
    this.plies = [];
    this.goTo(0);
  }

  /** Loads one PGN game. Throws an Error with a readable message if the PGN is invalid. */
  loadPgn(pgn: string): void {
    const chess = new Chess();
    try {
      chess.loadPgn(pgn.trim());
    } catch (e) {
      throw new Error(`This PGN could not be read: ${(e as Error).message}`);
    }
    const history = chess.history({ verbose: true });
    const comments = new Map(chess.getComments().map(c => [c.fen, c.comment]));

    this.headers = Object.fromEntries(
      Object.entries(chess.getHeaders()).filter(([, v]) => v && v !== '?' && v !== '????.??.??'),
    );
    this.startFen = history[0]?.before ?? chess.fen();
    this.plies = history.map(m => ({
      san: m.san,
      from: m.from,
      to: m.to,
      promotion: m.promotion as PromotionPiece | undefined,
      color: m.color,
      fenBefore: m.before,
      fenAfter: m.after,
      comment: cleanComment(comments.get(m.after)),
    }));
    this.goTo(this.plies.length);
  }

  /** Plays a move from the current position. Returns false if it is illegal. */
  play(from: Square, to: Square, promotion?: PromotionPiece): boolean {
    const chess = this.position();
    let m;
    try {
      m = chess.move({ from, to, promotion });
    } catch {
      return false;
    }
    this.plies = this.plies.slice(0, this.cursor);
    this.plies.push({
      san: m.san,
      from: m.from,
      to: m.to,
      promotion: m.promotion as PromotionPiece | undefined,
      color: m.color,
      fenBefore: m.before,
      fenAfter: m.after,
    });
    this.cursor++;
    return true;
  }

  goTo(ply: number): void {
    this.cursor = Math.max(0, Math.min(ply, this.plies.length));
    const chess = new Chess(this.startFen);
    for (const p of this.plies.slice(0, this.cursor)) chess.move({ from: p.from, to: p.to, promotion: p.promotion });
    this.current = chess;
  }

  /** The position at the cursor. */
  position(): Chess {
    return this.current;
  }

  fen(): string {
    return this.current.fen();
  }

  lastPly(): Ply | undefined {
    return this.plies[this.cursor - 1];
  }

  /** Legal destinations for each square, in the shape chessground expects. */
  dests(): Map<Square, Square[]> {
    const dests = new Map<Square, Square[]>();
    for (const m of this.current.moves({ verbose: true })) {
      const list = dests.get(m.from);
      if (list) list.push(m.to);
      else dests.set(m.from, [m.to]);
    }
    return dests;
  }

  isPromotion(from: Square, to: Square): boolean {
    return this.current.moves({ square: from, verbose: true }).some(m => m.to === to && m.promotion);
  }

  status(): GameStatus {
    const c = this.current;
    const turn = c.turn();
    let over: string | undefined;
    if (c.isCheckmate()) over = `Checkmate — ${turn === 'w' ? 'Black' : 'White'} wins`;
    else if (c.isStalemate()) over = 'Draw by stalemate';
    else if (c.isInsufficientMaterial()) over = 'Draw — insufficient material';
    else if (c.isThreefoldRepetition()) over = 'Draw by threefold repetition';
    else if (c.isDrawByFiftyMoves()) over = 'Draw by the 50-move rule';
    return { turn, inCheck: c.inCheck(), over };
  }

  /** The whole game as PGN, with the imported headers and comments. */
  pgn(): string {
    const chess = new Chess(this.startFen);
    for (const [k, v] of Object.entries(this.headers)) chess.setHeader(k, v);
    if (this.startFen !== DEFAULT_POSITION) {
      chess.setHeader('SetUp', '1');
      chess.setHeader('FEN', this.startFen);
    }
    for (const p of this.plies) {
      chess.move({ from: p.from, to: p.to, promotion: p.promotion });
      if (p.comment) chess.setComment(p.comment);
    }
    return chess.pgn({ maxWidth: 80 });
  }
}

/** Removes engine/clock tags such as [%clk 0:09:58] and [%eval 0.3] from a PGN comment. */
function cleanComment(comment: string | undefined): string | undefined {
  const text = comment?.replace(/\[%[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  return text || undefined;
}

/** Splits a file holding several PGN games (e.g. a chess.com monthly archive) into single games. */
export function splitPgnGames(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n(?=\s*\[Event )/)
    .map(g => g.trim())
    .filter(g => g.length > 0);
}

import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';
import type { Ply } from './game';
import { formatScore, winChance, type MoveReview, type PositionEval } from './review';

/** Plain-English explanation of one move. */
export interface Lesson {
  /** What the move does: its purpose, tactics, opening principles. */
  purpose: string[];
  /** For inaccuracies, mistakes and blunders: what goes wrong. */
  problem?: string;
  /** The engine's preferred move, when the move played was not one of the best. */
  better?: { san: string; uci: string; reason?: string; line: string };
  /** The opponent's best answer to the move played (drawn as an arrow after a mistake). */
  reply?: { san: string; uci: string };
  /** A remark such as "only move" or "forced". */
  note?: string;
}

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const NAME: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const SIDE = { w: 'White', b: 'Black' } as const;
type Color = 'w' | 'b';

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

// ---------- board helpers ----------

/**
 * A piece is hanging if it is attacked and undefended, attacked by something cheaper,
 * or attacked more times than it is defended.
 */
export function isHanging(chess: Chess, square: Square): boolean {
  const piece = chess.get(square);
  if (!piece || piece.type === 'k') return false;
  const attackers = chess.attackers(square, other(piece.color));
  if (attackers.length === 0) return false;
  const defenders = chess.attackers(square, piece.color);
  if (defenders.length === 0 || attackers.length > defenders.length) return true;
  const cheapest = Math.min(...attackers.map(s => VALUE[chess.get(s)!.type]));
  return cheapest < VALUE[piece.type];
}

/** Enemy pieces attacked by the piece standing on `from`. */
function targetsOf(chess: Chess, from: Square): Square[] {
  const piece = chess.get(from);
  if (!piece) return [];
  const out: Square[] = [];
  for (const row of chess.board()) {
    for (const sq of row) {
      if (sq && sq.color !== piece.color && chess.attackers(sq.square, piece.color).includes(from)) out.push(sq.square);
    }
  }
  return out;
}

const RAYS: Record<'b' | 'r', [number, number][]> = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
};

function squareAt(file: number, rank: number): Square | undefined {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return undefined;
  return `${'abcdefgh'[file]}${rank + 1}` as Square;
}

/**
 * A pin by the slider on `from` that matters: a piece shielding its king, its queen,
 * or a minor piece shielding a rook.
 */
function findPin(chess: Chess, from: Square): { pinned: Square; behind: Square } | undefined {
  const piece = chess.get(from);
  if (!piece || !['b', 'r', 'q'].includes(piece.type)) return undefined;
  const rays = piece.type === 'q' ? [...RAYS.b, ...RAYS.r] : RAYS[piece.type as 'b' | 'r'];
  const f0 = from.charCodeAt(0) - 97;
  const r0 = Number(from[1]) - 1;
  for (const [df, dr] of rays) {
    let first: Square | undefined;
    for (let i = 1; i < 8; i++) {
      const sq = squareAt(f0 + df * i, r0 + dr * i);
      if (!sq) break;
      const p = chess.get(sq);
      if (!p) continue;
      if (p.color === piece.color) break;
      if (!first) {
        if (p.type === 'k') break; // that's a check, not a pin
        first = sq;
        continue;
      }
      const shielded = chess.get(first)!.type;
      const matters =
        p.type === 'k' ||
        (p.type === 'q' && VALUE[shielded] < 9) ||
        (p.type === 'r' && (shielded === 'n' || shielded === 'b'));
      // the shielded piece must be worth less than what it protects, or moving it costs nothing
      if (matters && VALUE[shielded] < VALUE[p.type]) return { pinned: first, behind: sq };
      break;
    }
  }
  return undefined;
}

function material(chess: Chess, color: Color): number {
  let sum = 0;
  for (const row of chess.board()) for (const sq of row) if (sq && sq.color === color && sq.type !== 'k') sum += VALUE[sq.type];
  return sum;
}

/** Plays a UCI move; returns undefined if it is not legal here. */
function playUci(chess: Chess, uci: string): Move | undefined {
  try {
    return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return undefined;
  }
}

const toUci = (p: Pick<Ply, 'from' | 'to' | 'promotion'>) => `${p.from}${p.to}${p.promotion ?? ''}`;

/** "12. Nf3" or "12...Nf6". */
function numbered(fen: string, san: string): string {
  const [, turn, , , , full] = fen.split(' ');
  return turn === 'w' ? `${full}. ${san}` : `${full}...${san}`;
}

/** An engine line as numbered SAN, e.g. "12...Nxe4 13. Bxf7+ Kxf7". */
export function lineToSan(fen: string, uciLine: string[], maxPlies = 6): string {
  const chess = new Chess(fen);
  const parts: string[] = [];
  for (const uci of uciLine.slice(0, maxPlies)) {
    const turn = chess.turn();
    const full = chess.moveNumber();
    const m = playUci(chess, uci);
    if (!m) break;
    parts.push(turn === 'w' ? `${full}. ${m.san}` : parts.length === 0 ? `${full}...${m.san}` : m.san);
  }
  return parts.join(' ');
}

/**
 * Material won by the side to move along a line of moves, counted once the captures stop.
 * Also names the single piece won, when that is the whole story.
 */
function materialSwing(fen: string, uciLine: string[]): { gain: number; won?: { type: PieceSymbol; square: Square } } {
  const chess = new Chess(fen);
  const me = chess.turn();
  const start = material(chess, me) - material(chess, other(me));
  const taken: { by: Color; type: PieceSymbol; square: Square }[] = [];
  for (let i = 0; i < Math.min(uciLine.length, 8); i++) {
    const m = playUci(chess, uciLine[i]);
    if (!m) break;
    if (m.captured) taken.push({ by: m.color, type: m.captured, square: m.to });
    // stop at the first quiet point: the next move is not a capture
    const next = uciLine[i + 1];
    if (!next || !chess.get(next.slice(2, 4) as Square)) break;
  }
  const gain = material(chess, me) - material(chess, other(me)) - start;
  const mine = taken.filter(t => t.by === me);
  const theirs = taken.filter(t => t.by !== me);
  const won = mine.length === 1 && theirs.length === 0 ? { type: mine[0].type, square: mine[0].square } : undefined;
  return { gain, won };
}

function amount(gain: number, won?: { type: PieceSymbol; square: Square }): string {
  if (won && VALUE[won.type] === gain) return `the ${NAME[won.type]} on ${won.square}`;
  if (gain === 1) return 'a pawn';
  if (gain === 2) return 'two pawns';
  if (gain === 3) return 'a piece';
  return `material (about ${gain} pawns' worth)`;
}

function list(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// ---------- what a move does ----------

const START_SQUARES = new Set(['b1', 'g1', 'c1', 'f1', 'b8', 'g8', 'c8', 'f8']);
const CENTER = new Set(['d4', 'e4', 'd5', 'e5']);

interface PurposeContext {
  /** Moves played before this one (same game), to spot "same piece twice" and recaptures. */
  earlier?: Ply[];
  /** Whether principles like "don't bring the queen out early" should be mentioned. */
  criticize?: boolean;
}

/** Sentences describing what a move does, from the board alone. */
export function purposeOf(fenBefore: string, uci: string, ctx: PurposeContext = {}): string[] {
  const before = new Chess(fenBefore);
  const after = new Chess(fenBefore);
  const move = playUci(after, uci);
  if (!move) return [];
  const me = move.color;
  const them = other(me);
  const name = NAME[move.piece];
  const out: string[] = [];

  if (after.isCheckmate()) return ['Checkmate! The game is over.'];

  if (move.isKingsideCastle() || move.isQueensideCastle()) {
    out.push(`Castles ${move.isKingsideCastle() ? 'kingside' : 'queenside'}: the king goes to safety and the rook joins the game.`);
  }
  if (move.promotion) out.push(`Promotes the pawn to a ${NAME[move.promotion]}.`);

  // captures
  if (move.isEnPassant()) {
    out.push('Captures en passant.');
  } else if (move.captured) {
    const prev = ctx.earlier?.at(-1);
    const victim = `${NAME[move.captured]} on ${move.to}`;
    if (prev && prev.to === move.to && new Chess(prev.fenBefore).get(prev.to)) {
      out.push(`Recaptures the ${victim}.`);
    } else if (before.attackers(move.to, them).length === 0) {
      out.push(`Takes the ${victim}, which was undefended.`);
    } else if (VALUE[move.captured] > VALUE[move.piece]) {
      out.push(`Takes the ${victim} with the ${name}, a cheaper piece.`);
    } else {
      out.push(`Takes the ${victim}.`);
    }
  }

  // checks
  if (after.inCheck()) {
    const kingSq = after.findPiece({ type: 'k', color: them })[0];
    const checkers = after.attackers(kingSq, me);
    if (checkers.length > 1) out.push('Double check! The king has to move.');
    else if (!checkers.includes(move.to)) out.push('Discovered check!');
    else out.push('Gives check.');
  }

  // tactics by the moved piece (not if it can simply be taken)
  const safe = !isHanging(after, move.to);
  if (safe) {
    const targets = targetsOf(after, move.to).filter(sq => {
      const t = after.get(sq)!;
      return t.type === 'k' || VALUE[t.type] > VALUE[move.piece] || isHanging(after, sq);
    });
    const describe = (sq: Square) => (after.get(sq)!.type === 'k' ? 'the king' : `the ${NAME[after.get(sq)!.type]} on ${sq}`);
    const byValue = targets.sort((a, b) => VALUE[after.get(b)!.type] - VALUE[after.get(a)!.type]);
    const pin = findPin(after, move.to);
    if (byValue.length >= 2 && VALUE[after.get(byValue[1])!.type] >= 3) {
      out.push(`Forks ${list(byValue.map(describe))}: they can't both be saved.`);
    } else if (byValue.length >= 2) {
      out.push(`Creates a double attack on ${list(byValue.map(describe))}.`);
    } else if (pin) {
      const pinned = after.get(pin.pinned)!;
      const behind = after.get(pin.behind)!;
      out.push(
        behind.type === 'k'
          ? `Pins the ${NAME[pinned.type]} on ${pin.pinned} to the king: it is not allowed to move.`
          : `Pins the ${NAME[pinned.type]} on ${pin.pinned} to the ${NAME[behind.type]} behind it.`,
      );
    } else if (byValue.length === 1 && after.get(byValue[0])!.type !== 'k') {
      const sq = byValue[0];
      const undefended = after.attackers(sq, them).length === 0;
      out.push(`Attacks the ${undefended ? 'undefended ' : ''}${NAME[after.get(sq)!.type]} on ${sq}.`);
    }
  }

  // defensive ideas
  if (isHanging(before, move.from) && safe && !move.captured) out.push(`Moves the attacked ${name} to safety.`);
  const defended = before
    .board()
    .flat()
    .filter(sq => sq && sq.color === me && sq.square !== move.from && isHanging(before, sq.square))
    .map(sq => sq!.square)
    .filter(sq => !isHanging(after, sq) && after.attackers(sq, me).includes(move.to));
  if (defended.length) out.push(`Protects the ${NAME[after.get(defended[0])!.type]} on ${defended[0]}.`);

  // opening principles
  const moveNo = before.moveNumber();
  if (moveNo <= 12 && !move.captured) {
    if ((move.piece === 'n' || move.piece === 'b') && START_SQUARES.has(move.from)) {
      out.push(`Develops the ${name}, bringing a new piece into play.`);
    }
    if (move.piece === 'p' && CENTER.has(move.to)) out.push('Claims space in the center.');
    if (ctx.criticize) {
      if (move.piece === 'q' && moveNo <= 6) {
        out.push('Brings the queen out early: the opponent can gain time by attacking it.');
      }
      const mine = ctx.earlier?.filter(p => p.color === me) ?? [];
      if (move.piece !== 'p' && move.piece !== 'k' && mine.some(p => p.to === move.from) && !isHanging(before, move.from)) {
        out.push('Moves the same piece twice in the opening instead of developing another one.');
      }
      if (move.piece === 'p' && 'ah'.includes(move.from[0]) && moveNo <= 8) {
        out.push('A flank pawn move: in the opening, developing pieces is usually more useful.');
      }
    }
  }
  const rights = (fen: string) => fen.split(' ')[2];
  const hadRights = me === 'w' ? /[KQ]/.test(rights(fenBefore)) : /[kq]/.test(rights(fenBefore));
  const hasRights = me === 'w' ? /[KQ]/.test(rights(after.fen())) : /[kq]/.test(rights(after.fen()));
  if (move.piece === 'k' && !move.isKingsideCastle() && !move.isQueensideCastle() && hadRights && !hasRights) {
    out.push('Moves the king and gives up the right to castle.');
  }

  if (out.length === 0) {
    out.push(move.piece === 'p' ? `Pushes the pawn to ${move.to}.` : `Moves the ${name} to ${move.to}.`);
  }
  return out;
}

// ---------- the full lesson, with the engine's view ----------

/** Win chance from one side's point of view (-1..1). */
const forSide = (score: PositionEval['score'], side: Color) => (side === 'w' ? 1 : -1) * winChance(score);

/** Mate in N for `side` (N > 0), if the evaluation is a forced mate for that side. */
function mateFor(e: PositionEval, side: Color): number | undefined {
  const m = e.score.mate;
  if (m === undefined || m === 0) return undefined;
  return (m > 0) === (side === 'w') ? Math.abs(m) : undefined;
}

/** How many pawns the evaluation dropped for `side` (mate counts as 10). */
function pawnsDropped(before: PositionEval, after: PositionEval, side: Color): number {
  const pawns = (e: PositionEval) =>
    e.score.mate !== undefined ? 10 * (forSide(e.score, 'w') > 0 ? 1 : -1) : Math.max(-10, Math.min(10, (e.score.cp ?? 0) / 100));
  return (side === 'w' ? 1 : -1) * (pawns(before) - pawns(after));
}

function firstLower(s: string): string {
  return s[0].toLowerCase() + s.slice(1);
}

const TACTIC = /^(Forks|Creates a double attack|Pins|Double check|Discovered|Attacks)/;

export function explainMove(plies: Ply[], index: number, review?: MoveReview): Lesson {
  const ply = plies[index];
  const uci = toUci(ply);
  const me = ply.color;
  const cls = review?.classification;
  const bad = cls === 'inaccuracy' || cls === 'mistake' || cls === 'blunder';
  const strong = cls === 'best' || cls === 'excellent';

  const lesson: Lesson = {
    purpose: purposeOf(ply.fenBefore, uci, { earlier: plies.slice(0, index), criticize: !strong }),
  };

  const position = new Chess(ply.fenBefore);
  if (position.moves().length === 1) lesson.note = 'Forced: this was the only legal move.';
  if (!review) return lesson;
  const { before, after } = review;

  // the opponent's best answer
  if (after.best) {
    const reply = playUci(new Chess(ply.fenAfter), after.best);
    if (reply) lesson.reply = { san: reply.san, uci: after.best };
  }

  // the move the engine preferred, for moves that were not among the best
  if (before.best && !strong) {
    const best = playUci(new Chess(ply.fenBefore), before.best);
    if (best) {
      lesson.better = { san: best.san, uci: before.best, line: lineToSan(ply.fenBefore, before.pv, 6) };
      if (bad) lesson.better.reason = betterReason(ply.fenBefore, before, me);
    }
  }

  // only move
  const mates = new Chess(ply.fenAfter).isCheckmate();
  if (strong && !mates && !lesson.note && before.second && forSide(before.score, me) - forSide(before.second.score, me) >= 0.3) {
    lesson.note = 'The only good move here: every alternative was clearly worse.';
  }

  if (bad) lesson.problem = problemOf(ply, before, after);
  return lesson;
}

/** Why the engine's move was better, as a sentence starting with "It". */
function betterReason(fen: string, before: PositionEval, me: Color): string | undefined {
  const mate = mateFor(before, me);
  if (mate) return mate === 1 ? 'It is checkmate!' : `It starts a forced mate in ${mate}.`;
  const swing = materialSwing(fen, before.pv);
  if (swing.gain >= 1) return `It wins ${amount(swing.gain, swing.won)}.`;
  // "It pushes the pawn to e3" explains nothing; only give a reason when there is a real idea
  const idea = purposeOf(fen, before.best!).find(p => !/^(Pushes the pawn|Moves the)/.test(p));
  return idea ? `It ${firstLower(idea)}` : undefined;
}

function problemOf(ply: Ply, before: PositionEval, after: PositionEval): string {
  const me = ply.color;
  const them = other(me);
  const theirMate = mateFor(after, them);
  if (theirMate) {
    return `This allows a forced mate in ${theirMate}: ${lineToSan(ply.fenAfter, after.pv, theirMate * 2 - 1)}.`;
  }
  const myMate = mateFor(before, me);
  if (myMate && !mateFor(after, me)) return `This misses a forced mate in ${myMate}.`;

  const reply = after.best ? playUci(new Chess(ply.fenAfter), after.best) : undefined;
  const replyText = reply && numbered(ply.fenAfter, reply.san);

  // Material, counted from before the move so that fair trades don't look like losses.
  const played = materialSwing(ply.fenBefore, [toUci(ply), ...after.pv]);
  if (played.gain <= -1 && reply) {
    const position = new Chess(ply.fenAfter);
    const piece = reply.captured && position.get(reply.to);
    if (piece && piece.color === me && isHanging(position, reply.to) && -played.gain >= VALUE[piece.type] - 1) {
      const victim = `${NAME[piece.type]} on ${reply.to}`;
      return reply.to === ply.to
        ? `The ${victim} is not safe there: ${replyText} takes it.`
        : `This leaves the ${victim} unprotected: ${replyText} wins it.`;
    }
    return `After ${replyText}, ${SIDE[them]} wins ${amount(-played.gain)}.`;
  }

  // A missed win is the main story only when it accounts for most of what the move cost;
  // otherwise the opponent's reply explains more.
  const missed = materialSwing(ply.fenBefore, before.pv);
  const missedMatters = missed.gain >= 1 && missed.gain - played.gain >= 1;
  const missedFirst = missedMatters && missed.gain * 100 >= 0.5 * pawnsDropped(before, after, me) * 100;
  const tactic = reply && purposeOf(ply.fenAfter, after.best!).find(p => TACTIC.test(p));
  if (missedFirst) return `It misses the chance to win ${amount(missed.gain, missed.won)}.`;
  if (tactic) return `${SIDE[them]} has ${replyText}, which ${firstLower(tactic)}`;
  if (missedMatters) return `It misses the chance to win ${amount(missed.gain, missed.won)}.`;

  const change = `${formatScore(before.score)} → ${formatScore(after.score)}`;
  const wasBetter = forSide(before.score, me) >= 0.1;
  const nowWorse = forSide(after.score, me) < -0.3;
  if (wasBetter && forSide(after.score, me) < 0.1) return `This gives away ${SIDE[me]}'s advantage (${change}).`;
  if (nowWorse) return `After this, ${SIDE[them]} is clearly better (${change}).`;
  return `${SIDE[me]}'s position gets worse (${change}); the engine's move below keeps more.`;
}

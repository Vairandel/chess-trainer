import { Chess, DEFAULT_POSITION, type Move, type Square } from 'chess.js';

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

/**
 * A position in the move tree. The root is the start position and has no ply.
 * `children[0]` continues the line (the main line, from the root); the other children are variations.
 */
export interface MoveNode {
  id: number;
  ply?: Ply;
  parent?: MoveNode;
  children: MoveNode[];
}

export interface GameStatus {
  turn: 'w' | 'b';
  inCheck: boolean;
  /** Set when the game is over at the current position. */
  over?: string;
}

const uciOf = (p: Pick<Ply, 'from' | 'to' | 'promotion'>) => `${p.from}${p.to}${p.promotion ?? ''}`;

function toPly(m: Move): Ply {
  return {
    san: m.san,
    from: m.from,
    to: m.to,
    promotion: m.promotion as PromotionPiece | undefined,
    color: m.color,
    fenBefore: m.before,
    fenAfter: m.after,
  };
}

/**
 * A game as a tree of moves with a current node. Playing a move that is not already there adds it:
 * at the end of a line it extends the line, anywhere else it starts a variation.
 */
export class Game {
  startFen = DEFAULT_POSITION;
  headers: Record<string, string> = {};
  root: MoveNode = { id: 0, children: [] };
  node: MoveNode = this.root;
  private nextId = 1;
  /** Chess instance replayed along the path to the current node, so repetition draws are detected. */
  private current = new Chess();

  reset(): void {
    this.startFen = DEFAULT_POSITION;
    this.headers = {};
    this.root = { id: 0, children: [] };
    this.nextId = 1;
    this.goTo(this.root);
  }

  // ---------- tree navigation ----------

  /** Goes to a node, or to the n-th position of the main line (0 = start). */
  goTo(target: MoveNode | number): void {
    let node: MoveNode;
    if (typeof target === 'number') {
      const main = this.mainLine();
      node = target <= 0 ? this.root : main[Math.min(target, main.length) - 1] ?? this.root;
    } else {
      node = target;
    }
    this.node = node;
    const chess = new Chess(this.startFen);
    for (const n of this.path(node)) chess.move({ from: n.ply!.from, to: n.ply!.to, promotion: n.ply!.promotion });
    this.current = chess;
  }

  back(): void {
    if (this.node.parent) this.goTo(this.node.parent);
  }

  forward(): void {
    if (this.node.children[0]) this.goTo(this.node.children[0]);
  }

  toStart(): void {
    this.goTo(this.root);
  }

  /** The end of the line the current node is on. */
  toEnd(): void {
    let n = this.node;
    while (n.children[0]) n = n.children[0];
    this.goTo(n);
  }

  /** Nodes from the first move to `node` (the root is not included). */
  path(node: MoveNode = this.node): MoveNode[] {
    const out: MoveNode[] = [];
    for (let n: MoveNode | undefined = node; n && n.ply; n = n.parent) out.unshift(n);
    return out;
  }

  /** The plies leading to `node`, in order. */
  pathPlies(node: MoveNode = this.node): Ply[] {
    return this.path(node).map(n => n.ply!);
  }

  mainLine(): MoveNode[] {
    const out: MoveNode[] = [];
    for (let n = this.root.children[0]; n; n = n.children[0]) out.push(n);
    return out;
  }

  isMainLine(node: MoveNode = this.node): boolean {
    for (let n = node; n.parent; n = n.parent) if (n.parent.children[0] !== n) return false;
    return true;
  }

  /** Every node with a move: the main line first, then the variations. */
  allNodes(): MoveNode[] {
    const main = this.mainLine();
    const seen = new Set(main);
    const rest: MoveNode[] = [];
    const walk = (n: MoveNode) => {
      for (const c of n.children) {
        if (!seen.has(c)) rest.push(c);
        walk(c);
      }
    };
    walk(this.root);
    return [...main, ...rest];
  }

  /** Main-line plies (the game as played). */
  get plies(): Ply[] {
    return this.mainLine().map(n => n.ply!);
  }

  /** Number of moves played to reach the current node. */
  get cursor(): number {
    return this.path().length;
  }

  // ---------- changing the tree ----------

  /** Plays a move from the current node. Returns false if it is illegal. */
  play(from: Square, to: Square, promotion?: PromotionPiece): boolean {
    let m: Move;
    try {
      m = new Chess(this.fen()).move({ from, to, promotion });
    } catch {
      return false;
    }
    this.goTo(this.addChild(this.node, toPly(m)));
    return true;
  }

  /**
   * Adds a line of UCI moves after `from` (reusing moves already there) and returns its first node.
   * Stops at the first illegal move.
   */
  addLine(from: MoveNode, ucis: string[]): MoveNode | undefined {
    let parent = from;
    let first: MoveNode | undefined;
    for (const uci of ucis) {
      let m: Move;
      try {
        m = new Chess(this.fenOf(parent)).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      } catch {
        break;
      }
      parent = this.addChild(parent, toPly(m));
      first ??= parent;
    }
    return first;
  }

  /** Removes a node and everything after it. If the current node was inside, goes to its parent. */
  deleteFrom(node: MoveNode): void {
    const parent = node.parent;
    if (!parent) return;
    parent.children = parent.children.filter(c => c !== node);
    if (this.path().includes(node)) this.goTo(parent);
  }

  /** Makes the line through `node` the main line. */
  makeMainLine(node: MoveNode): void {
    for (let n = node; n.parent; n = n.parent) {
      const siblings = n.parent.children;
      siblings.splice(siblings.indexOf(n), 1);
      siblings.unshift(n);
    }
  }

  private addChild(parent: MoveNode, ply: Ply): MoveNode {
    const existing = parent.children.find(c => uciOf(c.ply!) === uciOf(ply));
    if (existing) return existing;
    const node: MoveNode = { id: this.nextId++, ply, parent, children: [] };
    parent.children.push(node);
    return node;
  }

  private fenOf(node: MoveNode): string {
    return node.ply?.fenAfter ?? this.startFen;
  }

  // ---------- the current position ----------

  /** The position at the current node. */
  position(): Chess {
    return this.current;
  }

  fen(): string {
    return this.current.fen();
  }

  lastPly(): Ply | undefined {
    return this.node.ply;
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

  // ---------- PGN ----------

  /** Loads one PGN game, variations and comments included. Throws an Error with a readable message if it is invalid. */
  loadPgn(pgn: string): void {
    const { headers, movetext } = splitHeaders(pgn);
    let startFen = DEFAULT_POSITION;
    if (headers.FEN) {
      try {
        startFen = new Chess(headers.FEN).fen();
      } catch (e) {
        throw new Error(`This PGN could not be read: the starting position (FEN) is invalid. ${(e as Error).message}`);
      }
    }
    // Build the new tree on the side: the current game only changes if the whole PGN is valid.
    const root: MoveNode = { id: 0, children: [] };
    let nextId = 1;
    parseMovetext(movetext, root, (parent, san) => {
      const fen = parent.ply?.fenAfter ?? startFen;
      let m: Move;
      try {
        m = new Chess(fen).move(san);
      } catch {
        const [, turn, , , , full] = fen.split(' ');
        throw new Error(`This PGN could not be read: ${full}${turn === 'w' ? '.' : '...'} ${san} is not a legal move.`);
      }
      const ply = toPly(m);
      const existing = parent.children.find(c => uciOf(c.ply!) === uciOf(ply));
      if (existing) return existing;
      const node: MoveNode = { id: nextId++, ply, parent, children: [] };
      parent.children.push(node);
      return node;
    });
    this.startFen = startFen;
    this.nextId = nextId;
    this.root = root;
    this.headers = Object.fromEntries(Object.entries(headers).filter(([, v]) => v && v !== '?' && v !== '????.??.??'));
    this.goTo(this.mainLine().length);
  }

  /** The whole game as PGN, with headers, comments and variations. */
  pgn(): string {
    const headers = { ...this.headers };
    if (this.startFen !== DEFAULT_POSITION) {
      headers.SetUp = '1';
      headers.FEN = this.startFen;
    }
    const result = headers.Result ?? '*';
    const tags = Object.entries(headers).map(([k, v]) => `[${k} "${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`);
    const moves = writeLine(this.root, true);
    return `${tags.join('\n')}${tags.length ? '\n\n' : ''}${wrap(`${moves}${moves ? ' ' : ''}${result}`, 80)}\n`;
  }
}

// ---------- PGN reading ----------

function splitHeaders(pgn: string): { headers: Record<string, string>; movetext: string } {
  const headers: Record<string, string> = {};
  const text = pgn.replace(/\r\n?/g, '\n').trim();
  const tag = /^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/;
  const lines = text.split('\n');
  let i = 0;
  for (; i < lines.length; i++) {
    const match = lines[i].match(tag);
    if (match) headers[match[1]] = match[2].replace(/\\(.)/g, '$1');
    else if (lines[i].trim() !== '') break;
  }
  return { headers, movetext: lines.slice(i).join('\n') };
}

const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

/**
 * Builds the move tree from PGN movetext: moves, {comments}, ;comments, (variations),
 * move numbers, $NAGs, annotation marks (!, ?!) and the result.
 */
function parseMovetext(text: string, root: MoveNode, addMove: (parent: MoveNode, san: string) => MoveNode): void {
  const tokens = text.match(/\{[^}]*\}|;[^\n]*|\(|\)|\$\d+|\d+\.+|[^\s(){};$]+/g) ?? [];
  // `parent` is where the next move goes; `last` is the move a comment belongs to.
  let parent = root;
  let last = root;
  const stack: { parent: MoveNode; last: MoveNode }[] = [];
  for (const token of tokens) {
    if (token.startsWith('{') || token.startsWith(';')) {
      const comment = cleanComment(token.startsWith('{') ? token.slice(1, -1) : token.slice(1));
      if (comment && last.ply) last.ply.comment = last.ply.comment ? `${last.ply.comment} ${comment}` : comment;
    } else if (token === '(') {
      // a variation replaces the last move: it starts from that move's parent
      stack.push({ parent, last });
      parent = last.parent ?? root;
      last = parent;
    } else if (token === ')') {
      const saved = stack.pop();
      if (saved) ({ parent, last } = saved);
    } else if (/^\d+\.+$/.test(token) || token.startsWith('$') || RESULTS.has(token)) {
      // move numbers, annotation codes and results carry no move
    } else {
      const san = token.replace(/[!?]+$/, '').replace(/^0-0-0(?=[+#]?$)/, 'O-O-O').replace(/^0-0(?=[+#]?$)/, 'O-O');
      if (!san) continue;
      last = addMove(parent, san);
      parent = last;
    }
  }
}

/** Removes engine/clock tags such as [%clk 0:09:58] and [%eval 0.3] from a PGN comment. */
function cleanComment(comment: string | undefined): string | undefined {
  const text = comment?.replace(/\[%[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  return text || undefined;
}

// ---------- PGN writing ----------

/** The moves after `from`: its main continuation, with each alternative in parentheses. */
function writeLine(from: MoveNode, numberFirst: boolean): string {
  const parts: string[] = [];
  let parent = from;
  let needNumber = numberFirst;
  while (parent.children.length) {
    const [main, ...alternatives] = parent.children;
    parts.push(writeMove(main, needNumber));
    needNumber = !!main.ply!.comment;
    for (const alt of alternatives) {
      parts.push(`(${writeMove(alt, true)}${alt.children.length ? ` ${writeLine(alt, !!alt.ply!.comment)}` : ''})`);
      needNumber = true;
    }
    parent = main;
  }
  return parts.join(' ');
}

function writeMove(node: MoveNode, forceNumber: boolean): string {
  const ply = node.ply!;
  const full = ply.fenBefore.split(' ')[5];
  const number = ply.color === 'w' ? `${full}. ` : forceNumber ? `${full}... ` : '';
  const comment = ply.comment ? ` {${ply.comment.replace(/}/g, ')')}}` : '';
  return `${number}${ply.san}${comment}`;
}

function wrap(text: string, width: number): string {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

/** Splits a file holding several PGN games (e.g. a chess.com monthly archive) into single games. */
export function splitPgnGames(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n(?=\s*\[Event )/)
    .map(g => g.trim())
    .filter(g => g.length > 0);
}

import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Color, Key } from '@lichess-org/chessground/types';
import { Chess, type Square } from 'chess.js';
import { moveBadge } from './badges';
import { $, h } from './dom';
import { Game, type MoveNode, type PromotionPiece } from './game';
import { renderMoveTree } from './moveList';
import type { PositionEval } from './review';
import { OPENINGS, type OpeningChapter } from './study/openings';
import { allLines, judge, learnedCount, lineKey, nextLine, recordRun, type ChapterProgress } from './study/trainer';
import { TRAPS, type Step, type Trap } from './study/traps';

type Chapter = { kind: 'trap'; trap: Trap } | { kind: 'opening'; opening: OpeningChapter };

const PROGRESS_KEY = 'chess-trainer:openings';
/** The opponent's moves in Practice wait this long, so they can be followed. */
const OPPONENT_DELAY_MS = 450;

export interface StudyOptions {
  coordinates: boolean;
  isActive: () => boolean;
  /** Evaluates a position (for judging moves outside the repertoire in Practice). */
  evaluate?: (fen: string) => Promise<PositionEval>;
}

/** A run of Practice: one line of an opening chapter, played from memory. */
interface PracticeRun {
  line: MoveNode[];
  /** Index in `line` of the next move. */
  next: number;
  mistakes: number;
  /** Wrong tries on the current move (after two, the move can be shown). */
  tries: number;
  done: boolean;
  thinking: boolean;
}

/**
 * The Study page: the library list, trap chapters (Learn + Test yourself) and opening chapters
 * (Learn + Practice), one chapter at a time with a comment on every move.
 */
export class StudyView {
  private board?: Api;
  private chapter?: Chapter;
  private game = new Game();
  private mistakeNode?: MoveNode;
  private insteadNode?: MoveNode;
  /** While testing a trap: the position to solve and the moves that count as correct. */
  private test?: { node: MoveNode; answers: string[]; solved: boolean; tries: number };
  private mode: 'learn' | 'practice' = 'learn';
  private run?: PracticeRun;
  private lastLineKey?: string;
  private token = 0;

  constructor(private options: StudyOptions) {
    $('study-start').addEventListener('click', () => this.step(() => this.game.toStart()));
    $('study-prev').addEventListener('click', () => this.step(() => this.game.back()));
    $('study-next').addEventListener('click', () => this.step(() => this.game.forward()));
    $('study-end').addEventListener('click', () => this.step(() => this.game.toEnd()));
    $('study-test-btn').addEventListener('click', () => this.startTest());
    $('study-show').addEventListener('click', () => this.showAnswer());
    $('study-mode-learn').addEventListener('click', () => this.setMode('learn'));
    $('study-mode-practice').addEventListener('click', () => this.setMode('practice'));
    $('practice-next').addEventListener('click', () => this.startRun());
    $('practice-show').addEventListener('click', () => this.showRepertoireMove());
    document.addEventListener('keydown', e => {
      if (!this.options.isActive() || !this.chapter || this.mode === 'practice' || document.querySelector('dialog[open]')) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.ctrlKey || e.metaKey || e.altKey) return;
      const keys: Record<string, () => void> = {
        ArrowLeft: () => this.game.back(),
        ArrowRight: () => this.game.forward(),
        Home: () => this.game.toStart(),
        End: () => this.game.toEnd(),
      };
      if (keys[e.key]) {
        e.preventDefault();
        this.step(keys[e.key]);
      }
    });
  }

  /** Shows the list (no id) or a chapter. */
  show(id?: string): void {
    const chapter = findChapter(id);
    $('study-list').hidden = !!chapter;
    $('study-chapter').hidden = !chapter;
    if (!chapter) {
      this.chapter = undefined;
      this.renderList();
      return;
    }
    if (!sameChapter(chapter, this.chapter)) this.open(chapter);
    if (!this.board) {
      this.board = Chessground($('study-board'), {
        coordinates: this.options.coordinates,
        movable: { free: false, showDests: true, events: { after: (o, d) => this.onBoardMove(o, d) } },
        draggable: { showGhost: true },
        highlight: { lastMove: true, check: true },
        animation: { enabled: true, duration: 200 },
      });
    } else {
      this.board.redrawAll();
    }
    this.render();
  }

  setCoordinates(on: boolean): void {
    this.options.coordinates = on;
    this.board?.set({ coordinates: on });
    this.board?.redrawAll();
  }

  // ---------- the list ----------

  private renderList(): void {
    const traps = (pred: (t: Trap) => boolean) => TRAPS.filter(pred).map(t => trapCard(t));
    const openings = (section: OpeningChapter['section']) => OPENINGS.filter(o => o.section === section).map(o => this.openingCard(o));
    const groups: [string, string, HTMLElement[]][] = [
      ['Your White repertoire', 'Nf3, d4, g3, Bg2, O-O, c4: what to play against each reply, and why.', [...openings('white'), ...traps(t => t.group === 'your-openings' && t.you === 'w')]],
      ['Your Black repertoire', 'The Alekhine Defense against 1.e4, and the Queen’s Gambit Declined against 1.d4.', [...openings('black-e4'), ...openings('black-d4'), ...traps(t => t.group === 'your-openings' && t.you === 'b')]],
      ['Classic traps', 'The traps you will meet again and again in online games.', traps(t => t.group === 'classic')],
    ];
    $('study-list').replaceChildren(
      ...groups
        .filter(([, , cards]) => cards.length)
        .map(([title, intro, cards]) => h('section', 'study-group', h('h2', '', title), h('p', 'muted', intro), h('div', 'study-cards', ...cards))),
    );
  }

  private openingCard(o: OpeningChapter): HTMLElement {
    const lines = allLines(loadTree(o.pgn));
    const learned = learnedCount(lines, loadProgress()[o.id] ?? {});
    const card = h(
      'a',
      'study-card',
      h('span', 'study-card-title', o.title),
      h(
        'span',
        'study-card-tags',
        sideChip(o.you),
        h('span', 'chip chip-opening', 'Opening'),
        h('span', 'chip', `${learned} / ${lines.length} lines learned`),
      ),
      h('span', 'study-card-summary', o.summary),
    ) as HTMLAnchorElement;
    card.href = `#study/${o.id}`;
    return card;
  }

  // ---------- opening a chapter ----------

  private open(chapter: Chapter): void {
    this.chapter = chapter;
    this.test = undefined;
    this.run = undefined;
    this.mode = 'learn';
    this.token++;
    this.mistakeNode = undefined;
    this.insteadNode = undefined;
    if (chapter.kind === 'trap') this.buildTrap(chapter.trap);
    else this.game = gameOf(chapter.opening.pgn);
    this.game.toStart();

    const you = chapter.kind === 'trap' ? chapter.trap.you : chapter.opening.you;
    $('study-title').textContent = chapter.kind === 'trap' ? chapter.trap.title : chapter.opening.title;
    $('study-meta').replaceChildren(
      ...(chapter.kind === 'trap'
        ? [h('span', '', chapter.trap.opening), sideChip(you), roleChip(chapter.trap.role)]
        : [sideChip(you), h('span', 'chip chip-opening', 'Opening')]),
    );

    const isTrap = chapter.kind === 'trap';
    $('study-dodont').hidden = !isTrap;
    $('study-plans').hidden = isTrap;
    $('study-modes').hidden = isTrap;
    $('study-test').hidden = !isTrap;
    if (chapter.kind === 'trap') {
      $('study-dos').replaceChildren(...chapter.trap.dos.map(d => h('li', '', d)));
      $('study-donts').replaceChildren(...chapter.trap.donts.map(d => h('li', '', d)));
    } else {
      const links = (chapter.opening.traps ?? [])
        .map(id => TRAPS.find(t => t.id === id))
        .filter((t): t is Trap => !!t)
        .map(t => {
          // no "to set / to avoid" here: that depends on the side, and the chapter may show the other one
          const a = h('a', '', `${t.title} — ${t.opening}`) as HTMLAnchorElement;
          a.href = `#study/${t.id}`;
          return h('li', '', a);
        });
      $('study-plans-list').replaceChildren(...chapter.opening.plans.map(p => h('li', '', p)));
      $('study-plans-traps').replaceChildren(...links);
      $('study-plans-traps-title').hidden = links.length === 0;
    }
  }

  /** The trap's main line with its comments, and the better line as a variation. */
  private buildTrap(trap: Trap): void {
    this.game = new Game();
    const add = (steps: Step[]) => {
      for (const [san, comment] of steps) {
        const m = new Chess(this.game.fen()).move(san);
        this.game.play(m.from as Square, m.to as Square, m.promotion as PromotionPiece | undefined);
        this.game.node.ply!.comment = comment;
      }
    };
    add(trap.moves);
    this.mistakeNode = this.game.mainLine()[trap.mistake];
    this.game.goTo(this.mistakeNode.parent!);
    add(trap.instead);
    this.insteadNode = this.mistakeNode.parent!.children.find(c => c !== this.mistakeNode);
  }

  private setMode(mode: 'learn' | 'practice'): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.token++;
    this.run = undefined;
    if (mode === 'practice') this.startRun();
    else {
      this.game.toStart();
      this.render();
    }
  }

  private step(action: () => void): void {
    if (this.mode === 'practice') return;
    if (this.test && !this.test.solved) this.test = undefined; // leaving the test position ends the test
    action();
    this.render();
  }

  private you(): 'w' | 'b' {
    const c = this.chapter!;
    return c.kind === 'trap' ? c.trap.you : c.opening.you;
  }

  /** Is `node` on the better line of a trap (the variation)? */
  private onBetterLine(node: MoveNode): boolean {
    for (let n: MoveNode | undefined = node; n; n = n.parent) if (n === this.insteadNode) return true;
    return false;
  }

  // ---------- rendering ----------

  private render(): void {
    if (!this.chapter || !this.board) return;
    const node = this.game.node;
    const status = this.game.status();
    const turn: Color = status.turn === 'w' ? 'white' : 'black';
    const practising = this.mode === 'practice';
    const testing = !practising && this.test && !this.test.solved && node === this.test.node;
    const yourPracticeMove = practising && this.run && !this.run.done && !this.run.thinking && status.turn === this.you();
    const last = node.ply;

    this.board.set({
      fen: this.game.fen(),
      orientation: this.you() === 'w' ? 'white' : 'black',
      turnColor: turn,
      check: status.inCheck ? turn : false,
      lastMove: last ? [last.from as Key, last.to as Key] : undefined,
      movable: {
        color: testing || yourPracticeMove ? turn : undefined,
        dests: testing || yourPracticeMove ? (this.game.dests() as Map<Key, Key[]>) : new Map(),
      },
    });
    const shapes: DrawShape[] = [];
    if (last && node === this.mistakeNode) shapes.push(moveBadge('blunder', last.to)!);
    if (last && node === this.insteadNode) shapes.push(moveBadge('best', last.to)!);
    this.board.setAutoShapes(shapes);

    $('study-mode-learn').setAttribute('aria-pressed', String(!practising));
    $('study-mode-practice').setAttribute('aria-pressed', String(practising));
    $('study-moves').hidden = practising; // the tree would give the answers away
    $('study-nav').hidden = practising;
    $('study-practice').hidden = !practising;

    this.renderComment(node);
    if (!practising) {
      renderMoveTree($('study-moves'), this.game, {
        onSelect: n => this.step(() => this.game.goTo(n)),
        emptyText: '',
        markComments: false, // every move has one here
        decorate: (n, btn) => {
          if (n === this.mistakeNode) btn.append(h('span', 'glyph blunder', '??'));
          if (n === this.insteadNode) btn.append(h('span', 'glyph good-move', '✓'));
        },
      });
      $<HTMLButtonElement>('study-start').disabled = !node.ply;
      $<HTMLButtonElement>('study-prev').disabled = !node.ply;
      $<HTMLButtonElement>('study-next').disabled = node.children.length === 0;
      $<HTMLButtonElement>('study-end').disabled = node.children.length === 0;
    }
    if (this.chapter.kind === 'trap') this.renderTest();
    else this.renderPractice();
  }

  private renderComment(node: MoveNode): void {
    const box = $('study-comment');
    const ply = node.ply;
    const summary = this.chapter!.kind === 'trap' ? this.chapter!.trap.summary : this.chapter!.opening.summary;
    if (!ply) {
      box.replaceChildren(
        h('p', 'study-summary', summary),
        h('p', 'muted', this.mode === 'practice' ? 'Play your first move.' : 'Press ▶ (or →) to go through the moves.'),
      );
      return;
    }
    const name = `${ply.fenBefore.split(' ')[5]}${ply.color === 'w' ? '. ' : '...'}${ply.san}`;
    const head = h('div', 'lesson-head', h('strong', 'lesson-move', name));
    const trap = this.chapter!.kind === 'trap' ? this.chapter!.trap : undefined;
    if (trap && node === this.mistakeNode) head.append(h('span', 'badge blunder', trap.role === 'avoid' ? '?? The mistake' : '?? Their mistake'));
    else if (trap && node === this.insteadNode) head.append(h('span', 'badge best', '✓ The right move'));
    else if (trap && this.onBetterLine(node)) head.append(h('span', 'in-variation', 'better line'));
    else if (!trap && !this.game.isMainLine(node) && this.mode === 'learn') head.append(h('span', 'in-variation', 'side line'));
    const parts: HTMLElement[] = [head, h('p', 'study-text', ply.comment ?? '')];
    if (trap && node === this.mistakeNode && this.insteadNode && this.mode === 'learn') {
      const go = h('button', 'play-line', 'Show the right move instead');
      go.addEventListener('click', () => this.step(() => this.game.goTo(this.insteadNode!)));
      parts.push(go);
    }
    box.replaceChildren(...parts);
  }

  // ---------- trap: test yourself ----------

  /** Puts the board just before the mistake (or, for a trap to set, right after the opponent's mistake). */
  private startTest(): void {
    if (this.chapter?.kind !== 'trap') return;
    const trap = this.chapter.trap;
    const node = trap.role === 'avoid' ? this.mistakeNode!.parent! : this.mistakeNode!;
    const answers = trap.role === 'avoid' ? [trap.instead[0][0], ...(trap.alsoGood ?? [])] : [trap.moves[trap.mistake + 1][0]];
    this.test = { node, answers, solved: false, tries: 0 };
    this.game.goTo(node);
    this.render();
  }

  private onBoardMove(orig: Key, dest: Key): void {
    if (this.mode === 'practice') void this.onPracticeMove(orig, dest);
    else this.onTestMove(orig, dest);
  }

  private onTestMove(orig: Key, dest: Key): void {
    const test = this.test;
    if (!test || this.chapter?.kind !== 'trap') return;
    const san = sanOf(this.game.fen(), orig, dest);
    if (!san) return this.render();
    test.tries++;
    if (test.answers.includes(san)) {
      test.solved = true;
      const target = test.node.children.find(c => c.ply!.san === san);
      if (target) this.game.goTo(target);
      else this.game.play(orig as Square, dest as Square);
      this.message('study-test-msg', `✓ Correct! ${san} is a good move here.`, 'ok');
    } else if (this.chapter.trap.role === 'avoid' && san === this.mistakeNode!.ply!.san) {
      this.message('study-test-msg', `✗ ${san} is exactly the trap. Look again: what is your opponent threatening?`, 'bad');
    } else {
      this.message('study-test-msg', `✗ ${san} is not the move we are looking for. Try again.`, 'bad');
    }
    this.render();
  }

  private showAnswer(): void {
    const test = this.test;
    if (!test) return;
    const target = test.node.children.find(c => c.ply!.san === test.answers[0]);
    test.solved = true;
    if (target) this.game.goTo(target);
    this.message('study-test-msg', `The answer: ${test.answers.join(' or ')}.`, 'info');
    this.render();
  }

  private renderTest(): void {
    const testing = !!this.test && !this.test.solved;
    $('study-test-btn').hidden = testing;
    $('study-show').hidden = !testing || (this.test?.tries ?? 0) === 0;
    const prompt = $('study-test-prompt');
    if (testing) {
      const side = this.game.status().turn === 'w' ? 'White' : 'Black';
      const trap = (this.chapter as { trap: Trap }).trap;
      prompt.textContent =
        trap.role === 'avoid'
          ? `You are ${side}. Find a good move — and don't fall into the trap.`
          : `You are ${side}. Your opponent just made the mistake. How do you punish it?`;
      prompt.hidden = false;
    } else {
      prompt.hidden = true;
      if (!this.test) $('study-test-msg').textContent = '';
    }
  }

  // ---------- opening: practice ----------

  private chapterProgress(): ChapterProgress {
    return this.chapter?.kind === 'opening' ? loadProgress()[this.chapter.opening.id] ?? {} : {};
  }

  /** Picks the next line to practise and plays it from the start. */
  private startRun(): void {
    if (this.chapter?.kind !== 'opening') return;
    const lines = allLines(this.game.root);
    const line = lines[nextLine(lines, this.chapterProgress(), Math.random, this.lastLineKey)];
    this.lastLineKey = lineKey(line);
    this.run = { line, next: 0, mistakes: 0, tries: 0, done: false, thinking: false };
    this.token++;
    this.game.toStart();
    this.message('practice-msg', '', 'info');
    this.advance();
  }

  /** Plays the opponent's moves of the line, until it is your turn or the line ends. */
  private advance(): void {
    const run = this.run!;
    if (run.next >= run.line.length) return this.finishRun();
    const node = run.line[run.next];
    if (node.ply!.color === this.you()) {
      run.thinking = false;
      return this.render();
    }
    run.thinking = true;
    this.render();
    const token = this.token;
    setTimeout(() => {
      if (token !== this.token) return;
      this.game.goTo(node);
      run.next++;
      this.advance();
    }, OPPONENT_DELAY_MS);
  }

  private async onPracticeMove(orig: Key, dest: Key): Promise<void> {
    const run = this.run;
    if (!run || run.done || run.thinking) return;
    const expected = run.line[run.next];
    const san = sanOf(this.game.fen(), orig, dest);
    if (!san) return this.render();
    if (san === expected.ply!.san) {
      run.tries = 0;
      this.game.goTo(expected);
      run.next++;
      this.message('practice-msg', `✓ ${san} — correct.`, 'ok');
      return this.advance();
    }
    // not the repertoire move: ask the engine whether it is at least a good move
    run.thinking = true;
    this.render();
    this.message('practice-msg', `Checking ${san}…`, 'info');
    const token = this.token;
    let verdict = judge(san, expected.ply!.san);
    if (this.options.evaluate) {
      try {
        const sign = this.you() === 'w' ? 1 : -1;
        const fenTried = new Chess(this.game.fen());
        fenTried.move(san);
        const [tried, exp] = await Promise.all([this.options.evaluate(fenTried.fen()), this.options.evaluate(expected.ply!.fenAfter)]);
        verdict = judge(san, expected.ply!.san, sign * pawnsOf(tried), sign * pawnsOf(exp));
      } catch {
        // no engine: judge stays "unknown"
      }
    }
    if (token !== this.token) return;
    run.thinking = false;
    run.tries++;
    if (verdict === 'playable') {
      this.message('practice-msg', `${san} is playable, but in your repertoire you play another move here. Try to find it.`, 'info');
    } else {
      run.mistakes++;
      this.message('practice-msg', `✗ ${san} is not in your repertoire${verdict === 'mistake' ? ', and the engine likes it less' : ''}. Try again.`, 'bad');
    }
    this.render();
  }

  /** Plays the repertoire move for you (counted as a mistake), with its explanation. */
  private showRepertoireMove(): void {
    const run = this.run;
    if (!run || run.done || run.thinking) return;
    const expected = run.line[run.next];
    run.mistakes++;
    run.tries = 0;
    this.game.goTo(expected);
    run.next++;
    this.message('practice-msg', `The move was ${expected.ply!.san}.`, 'info');
    this.advance();
  }

  private finishRun(): void {
    const run = this.run!;
    run.done = true;
    run.thinking = false;
    if (this.chapter?.kind === 'opening') {
      const all = loadProgress();
      all[this.chapter.opening.id] = recordRun(this.chapterProgress(), lineKey(run.line), run.mistakes);
      saveProgress(all);
    }
    this.message(
      'practice-msg',
      run.mistakes === 0 ? '✓ Line complete without a mistake: learned!' : `Line complete with ${run.mistakes} mistake${run.mistakes > 1 ? 's' : ''}. It will come back soon.`,
      run.mistakes === 0 ? 'ok' : 'info',
    );
    this.render();
  }

  private renderPractice(): void {
    if (this.mode !== 'practice' || this.chapter?.kind !== 'opening') return;
    const run = this.run;
    const lines = allLines(this.game.root);
    const learned = learnedCount(lines, this.chapterProgress());
    $('practice-progress').textContent = `${learned} / ${lines.length} lines learned`;
    $('practice-moves').textContent = run ? movesText(run.line.slice(0, run.next)) || '—' : '';
    const prompt = $('practice-prompt');
    if (!run) prompt.textContent = '';
    else if (run.done) prompt.textContent = 'Line finished.';
    else if (run.thinking) prompt.textContent = 'Your opponent is playing…';
    else prompt.textContent = 'Your move: play your repertoire move.';
    $('practice-next').hidden = !run?.done;
    $('practice-show').hidden = !run || run.done || run.thinking || run.tries < 2;
  }

  private message(id: string, text: string, kind: 'ok' | 'bad' | 'info'): void {
    const el = $(id);
    el.textContent = text;
    el.className = `test-msg ${kind}`;
  }
}

// ---------- helpers ----------

function findChapter(id: string | undefined): Chapter | undefined {
  if (!id) return undefined;
  const trap = TRAPS.find(t => t.id === id);
  if (trap) return { kind: 'trap', trap };
  const opening = OPENINGS.find(o => o.id === id);
  return opening ? { kind: 'opening', opening } : undefined;
}

function sameChapter(a: Chapter, b: Chapter | undefined): boolean {
  if (!b || a.kind !== b.kind) return false;
  return a.kind === 'trap' ? a.trap === (b as { trap: Trap }).trap : a.opening === (b as { opening: OpeningChapter }).opening;
}

function gameOf(pgn: string): Game {
  const g = new Game();
  g.loadPgn(pgn);
  return g;
}

/** The root of a chapter's tree, cached: the list shows progress for every chapter. */
const trees = new Map<string, MoveNode>();
function loadTree(pgn: string): MoveNode {
  let root = trees.get(pgn);
  if (!root) {
    root = gameOf(pgn).root;
    trees.set(pgn, root);
  }
  return root;
}

function sanOf(fen: string, orig: Key, dest: Key): string | undefined {
  try {
    // promotions do not occur in these lines; take the queen if one comes up
    return new Chess(fen).move({ from: orig, to: dest, promotion: 'q' }).san;
  } catch {
    return undefined;
  }
}

function pawnsOf(e: PositionEval): number {
  if (e.score.mate !== undefined) return e.score.mate === 0 ? (e.score.winner === 'w' ? 100 : -100) : e.score.mate > 0 ? 50 : -50;
  return (e.score.cp ?? 0) / 100;
}

/** "1. Nf3 d5 2. d4" */
function movesText(nodes: MoveNode[]): string {
  return nodes
    .map(n => {
      const p = n.ply!;
      const num = p.fenBefore.split(' ')[5];
      return p.color === 'w' ? `${num}. ${p.san}` : p.san;
    })
    .join(' ');
}

function sideChip(you: 'w' | 'b'): HTMLElement {
  return h('span', `chip ${you === 'w' ? 'chip-white' : 'chip-black'}`, `You: ${you === 'w' ? 'White' : 'Black'}`);
}

function roleChip(role: Trap['role']): HTMLElement {
  return h('span', `chip ${role === 'set' ? 'chip-set' : 'chip-avoid'}`, role === 'set' ? 'Trap to set' : 'Trap to avoid');
}

function trapCard(t: Trap): HTMLElement {
  const card = h(
    'a',
    'study-card',
    h('span', 'study-card-title', t.title),
    h('span', 'study-card-opening', t.opening),
    h('span', 'study-card-tags', sideChip(t.you), roleChip(t.role)),
    h('span', 'study-card-summary', t.summary),
  ) as HTMLAnchorElement;
  card.href = `#study/${t.id}`;
  return card;
}

function loadProgress(): Record<string, ChapterProgress> {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}') as Record<string, ChapterProgress>;
  } catch {
    return {};
  }
}

function saveProgress(all: Record<string, ChapterProgress>): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch {
    // not saved: progress lasts until the page is closed
  }
}

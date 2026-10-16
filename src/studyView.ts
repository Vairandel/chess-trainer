import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Color, Key } from '@lichess-org/chessground/types';
import { Chess, type Square } from 'chess.js';
import { moveBadge } from './badges';
import { $, h } from './dom';
import { Game, type MoveNode, type PromotionPiece } from './game';
import { renderMoveTree } from './moveList';
import { TRAPS, type Step, type Trap } from './study/traps';

const GROUPS: { id: Trap['group']; title: string; intro: string }[] = [
  { id: 'your-openings', title: 'In your openings', intro: 'Traps in the Alekhine Defense (your Black opening) and your Catalan setup as White.' },
  { id: 'classic', title: 'Classic traps', intro: 'The traps you will meet again and again in online games.' },
];

/** The Study page: the trap library, and one chapter at a time with a comment on every move. */
export class StudyView {
  private board?: Api;
  private trap?: Trap;
  private game = new Game();
  private mistakeNode?: MoveNode;
  private insteadNode?: MoveNode;
  /** While testing, the position to solve and the moves that count as correct. */
  private test?: { node: MoveNode; answers: string[]; solved: boolean; tries: number };

  constructor(private options: { coordinates: boolean; isActive: () => boolean }) {
    $('study-start').addEventListener('click', () => this.step(() => this.game.toStart()));
    $('study-prev').addEventListener('click', () => this.step(() => this.game.back()));
    $('study-next').addEventListener('click', () => this.step(() => this.game.forward()));
    $('study-end').addEventListener('click', () => this.step(() => this.game.toEnd()));
    $('study-test-btn').addEventListener('click', () => this.startTest());
    $('study-show').addEventListener('click', () => this.showAnswer());
    document.addEventListener('keydown', e => {
      if (!this.options.isActive() || !this.trap || document.querySelector('dialog[open]')) return;
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
    const trap = id ? TRAPS.find(t => t.id === id) : undefined;
    $('study-list').hidden = !!trap;
    $('study-chapter').hidden = !trap;
    if (!trap) {
      this.trap = undefined;
      this.renderList();
      return;
    }
    if (trap !== this.trap) this.open(trap);
    if (!this.board) {
      this.board = Chessground($('study-board'), {
        coordinates: this.options.coordinates,
        movable: { free: false, showDests: true, events: { after: (o, d) => this.onTestMove(o, d) } },
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
    $('study-list').replaceChildren(
      ...GROUPS.map(g =>
        h(
          'section',
          'study-group',
          h('h2', '', g.title),
          h('p', 'muted', g.intro),
          h(
            'div',
            'study-cards',
            ...TRAPS.filter(t => t.group === g.id).map(t => {
              const card = h(
                'a',
                'study-card',
                h('span', 'study-card-title', t.title),
                h('span', 'study-card-opening', t.opening),
                h(
                  'span',
                  'study-card-tags',
                  h('span', `chip ${t.you === 'w' ? 'chip-white' : 'chip-black'}`, `You: ${t.you === 'w' ? 'White' : 'Black'}`),
                  h('span', `chip ${t.role === 'set' ? 'chip-set' : 'chip-avoid'}`, t.role === 'set' ? 'Trap to set' : 'Trap to avoid'),
                ),
                h('span', 'study-card-summary', t.summary),
              ) as HTMLAnchorElement;
              card.href = `#study/${t.id}`;
              return card;
            }),
          ),
        ),
      ),
    );
  }

  // ---------- a chapter ----------

  /** Builds the move tree: the main line with its comments, and the better line as a variation. */
  private open(trap: Trap): void {
    this.trap = trap;
    this.test = undefined;
    this.game = new Game();
    const add = (steps: Step[]) => {
      const first = this.game.node;
      for (const [san, comment] of steps) {
        const m = new Chess(this.game.fen()).move(san);
        this.game.play(m.from as Square, m.to as Square, m.promotion as PromotionPiece | undefined);
        this.game.node.ply!.comment = comment;
      }
      return first;
    };
    add(trap.moves);
    const main = this.game.mainLine();
    this.mistakeNode = main[trap.mistake];
    this.game.goTo(this.mistakeNode.parent!);
    add(trap.instead);
    this.insteadNode = this.mistakeNode.parent!.children.find(c => c !== this.mistakeNode);
    this.game.toStart();

    $('study-title').textContent = trap.title;
    $('study-meta').replaceChildren(
      h('span', '', trap.opening),
      h('span', `chip ${trap.you === 'w' ? 'chip-white' : 'chip-black'}`, `You: ${trap.you === 'w' ? 'White' : 'Black'}`),
      h('span', `chip ${trap.role === 'set' ? 'chip-set' : 'chip-avoid'}`, trap.role === 'set' ? 'Trap to set' : 'Trap to avoid'),
    );
    $('study-dos').replaceChildren(...trap.dos.map(d => h('li', '', d)));
    $('study-donts').replaceChildren(...trap.donts.map(d => h('li', '', d)));
  }

  private step(action: () => void): void {
    if (this.test && !this.test.solved) this.test = undefined; // leaving the test position ends the test
    action();
    this.render();
  }

  /** Is `node` on the better line (the variation)? */
  private onBetterLine(node: MoveNode): boolean {
    for (let n: MoveNode | undefined = node; n; n = n.parent) if (n === this.insteadNode) return true;
    return false;
  }

  private render(): void {
    if (!this.trap || !this.board) return;
    const node = this.game.node;
    const status = this.game.status();
    const turn: Color = status.turn === 'w' ? 'white' : 'black';
    const testing = this.test && !this.test.solved && node === this.test.node;
    const last = node.ply;

    this.board.set({
      fen: this.game.fen(),
      orientation: this.trap.you === 'w' ? 'white' : 'black',
      turnColor: turn,
      check: status.inCheck ? turn : false,
      lastMove: last ? [last.from as Key, last.to as Key] : undefined,
      movable: { color: testing ? turn : undefined, dests: testing ? (this.game.dests() as Map<Key, Key[]>) : new Map() },
    });
    const shapes: DrawShape[] = [];
    if (last && node === this.mistakeNode) shapes.push(moveBadge('blunder', last.to)!);
    if (last && node === this.insteadNode) shapes.push(moveBadge('best', last.to)!);
    this.board.setAutoShapes(shapes);

    this.renderComment(node);
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
    this.renderTest();
  }

  private renderComment(node: MoveNode): void {
    const box = $('study-comment');
    const ply = node.ply;
    if (!ply) {
      box.replaceChildren(h('p', 'study-summary', this.trap!.summary), h('p', 'muted', 'Press ▶ (or →) to go through the moves.'));
      return;
    }
    const name = `${ply.fenBefore.split(' ')[5]}${ply.color === 'w' ? '. ' : '...'}${ply.san}`;
    const head = h('div', 'lesson-head', h('strong', 'lesson-move', name));
    if (node === this.mistakeNode) head.append(h('span', 'badge blunder', this.trap!.role === 'avoid' ? '?? The mistake' : '?? Their mistake'));
    else if (node === this.insteadNode) head.append(h('span', 'badge best', '✓ The right move'));
    else if (this.onBetterLine(node)) head.append(h('span', 'in-variation', 'better line'));
    const parts: HTMLElement[] = [head, h('p', 'study-text', ply.comment ?? '')];
    if (node === this.mistakeNode && this.insteadNode) {
      const go = h('button', 'play-line', `Show the right move instead`);
      go.addEventListener('click', () => this.step(() => this.game.goTo(this.insteadNode!)));
      parts.push(go);
    }
    box.replaceChildren(...parts);
  }

  // ---------- test yourself ----------

  /** Puts the board just before the mistake (or, for a trap to set, right after the opponent's mistake). */
  private startTest(): void {
    const trap = this.trap!;
    const node = trap.role === 'avoid' ? this.mistakeNode!.parent! : this.mistakeNode!;
    const answers =
      trap.role === 'avoid' ? [trap.instead[0][0], ...(trap.alsoGood ?? [])] : [trap.moves[trap.mistake + 1][0]];
    this.test = { node, answers, solved: false, tries: 0 };
    this.game.goTo(node);
    this.render();
  }

  private onTestMove(orig: Key, dest: Key): void {
    const test = this.test;
    if (!test) return;
    let san: string;
    try {
      // promotions in these lines are never needed; take the queen if one comes up
      san = new Chess(this.game.fen()).move({ from: orig, to: dest, promotion: 'q' }).san;
    } catch {
      return this.render();
    }
    test.tries++;
    if (test.answers.includes(san)) {
      test.solved = true;
      const target = test.node.children.find(c => c.ply!.san === san);
      if (target) this.game.goTo(target);
      else this.game.play(orig as Square, dest as Square);
      this.testMessage(`✓ Correct! ${san} is a good move here.`, 'ok');
    } else if (this.trap!.role === 'avoid' && san === this.mistakeNode!.ply!.san) {
      this.testMessage(`✗ ${san} is exactly the trap. Look again: what is your opponent threatening?`, 'bad');
    } else {
      this.testMessage(`✗ ${san} is not the move we are looking for. Try again.`, 'bad');
    }
    this.render();
  }

  private showAnswer(): void {
    const test = this.test;
    if (!test) return;
    const target = test.node.children.find(c => c.ply!.san === test.answers[0]);
    test.solved = true;
    if (target) this.game.goTo(target);
    this.testMessage(`The answer: ${test.answers.join(' or ')}.`, 'info');
    this.render();
  }

  private testMessage(text: string, kind: 'ok' | 'bad' | 'info'): void {
    const el = $('study-test-msg');
    el.textContent = text;
    el.className = `test-msg ${kind}`;
  }

  private renderTest(): void {
    const testing = !!this.test && !this.test.solved;
    $('study-test-btn').hidden = testing;
    $('study-show').hidden = !testing || (this.test?.tries ?? 0) === 0;
    const prompt = $('study-test-prompt');
    if (testing) {
      const side = this.game.status().turn === 'w' ? 'White' : 'Black';
      prompt.textContent =
        this.trap!.role === 'avoid'
          ? `You are ${side}. Find a good move — and don't fall into the trap.`
          : `You are ${side}. Your opponent just made the mistake. How do you punish it?`;
      prompt.hidden = false;
    } else {
      prompt.hidden = true;
      if (!this.test) $('study-test-msg').textContent = '';
    }
  }
}

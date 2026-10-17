import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Color, Key } from '@lichess-org/chessground/types';
import { Chess, type Square } from 'chess.js';
import { $, askPromotion, h } from './dom';
import type { PromotionPiece } from './game';
import { THEMES } from './puzzles/themes';
import { isCorrectMove, newState, parsePuzzles, pickPuzzle, recordResult, type Puzzle, type PuzzleRow, type PuzzleState } from './puzzles/trainer';
import { store } from './store';

const KEY = 'puzzles';
/** The opponent's moves wait this long, so they can be followed. */
const REPLY_MS = 500;

type Phase = 'loading' | 'opponent' | 'yours' | 'solved' | 'failed-shown';

/** The Puzzles page: Lichess puzzles by theme, with a rating and missed puzzles coming back. */
export class PuzzleView {
  private board?: Api;
  private puzzles: Puzzle[] = [];
  private state: PuzzleState;
  private theme = 'mixed';
  private puzzle?: Puzzle;
  private review = false;
  private chess = new Chess();
  /** Index in puzzle.moves of the next move. */
  private step = 0;
  private phase: Phase = 'loading';
  /** The result has been recorded (a puzzle counts once). */
  private recorded = false;
  private failed = false;
  private lastChange?: number;
  private hintSquare?: string;
  private message = '';
  private token = 0;

  constructor(private options: { coordinates: boolean }) {
    const saved = load();
    this.state = saved.state;
    this.theme = saved.theme;
    $('puzzle-theme').addEventListener('change', e => {
      this.theme = (e.target as HTMLSelectElement).value;
      this.save();
      this.next();
    });
    $('puzzle-hint').addEventListener('click', () => this.hint());
    $('puzzle-solution').addEventListener('click', () => void this.showSolution());
    $('puzzle-next').addEventListener('click', () => this.next());
  }

  async show(): Promise<void> {
    if (!this.board) {
      this.board = Chessground($('puzzle-board'), {
        coordinates: this.options.coordinates,
        movable: { free: false, showDests: true, events: { after: (o, d) => void this.onMove(o, d) } },
        draggable: { showGhost: true },
        highlight: { lastMove: true, check: true },
        animation: { enabled: true, duration: 200 },
      });
    } else {
      this.board.redrawAll();
    }
    if (this.puzzles.length === 0) {
      this.render();
      // the puzzle set is loaded only when the page is first opened
      const data = (await import('./puzzles/data.json')).default as PuzzleRow[];
      this.puzzles = parsePuzzles(data);
      this.fillThemes();
      this.next();
    } else {
      this.render();
    }
  }

  setCoordinates(on: boolean): void {
    this.options.coordinates = on;
    this.board?.set({ coordinates: on });
    this.board?.redrawAll();
  }

  // ---------- flow ----------

  private next(): void {
    const pick = pickPuzzle(this.puzzles, this.theme, this.state, Math.random, this.puzzle?.id);
    if (!pick) return;
    this.token++;
    this.puzzle = pick.puzzle;
    this.review = pick.review;
    this.chess = new Chess(pick.puzzle.fen);
    this.step = 0;
    this.recorded = false;
    this.failed = false;
    this.hintSquare = undefined;
    this.lastChange = undefined;
    this.message = '';
    this.phase = 'opponent';
    this.render();
    this.opponentMove();
  }

  /** Plays the opponent's move at `step`, then gives you the turn. */
  private opponentMove(): void {
    const token = this.token;
    setTimeout(() => {
      if (token !== this.token || !this.puzzle) return;
      this.play(this.puzzle.moves[this.step]);
      this.step++;
      this.phase = 'yours';
      this.render();
    }, REPLY_MS);
  }

  private play(uci: string): void {
    this.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  }

  private async onMove(orig: Key, dest: Key): Promise<void> {
    const p = this.puzzle;
    if (!p || this.phase !== 'yours') return;
    let promotion: PromotionPiece | undefined;
    if (this.chess.moves({ square: orig as Square, verbose: true }).some(m => m.to === dest && m.promotion)) {
      promotion = await askPromotion(this.chess.turn() === 'w' ? 'white' : 'black');
      if (!promotion) return this.render();
    }
    const uci = `${orig}${dest}${promotion ?? ''}`;
    const solution = p.moves[this.step];
    if (!isCorrectMove(this.chess.fen(), uci, solution)) {
      this.markFailed();
      this.message = '✗ Not the right move. Try again, or show the solution.';
      return this.render();
    }
    this.hintSquare = undefined;
    this.play(uci);
    this.step++;
    if (this.chess.isCheckmate() || this.step >= p.moves.length) return this.finish();
    this.message = '✓ Good move. Keep going!';
    this.phase = 'opponent';
    this.render();
    this.opponentMove();
  }

  private hint(): void {
    const p = this.puzzle;
    if (!p || this.phase !== 'yours') return;
    this.markFailed(); // a hint counts as a miss, so the puzzle comes back later
    this.hintSquare = p.moves[this.step].slice(0, 2);
    this.message = 'Hint: move the highlighted piece. (A hint counts as a miss: this puzzle will come back.)';
    this.render();
  }

  private async showSolution(): Promise<void> {
    const p = this.puzzle;
    if (!p || (this.phase !== 'yours' && this.phase !== 'opponent')) return;
    this.markFailed();
    this.token++;
    const token = this.token;
    this.phase = 'failed-shown';
    this.hintSquare = undefined;
    this.message = 'The solution:';
    this.render();
    while (this.step < p.moves.length) {
      await new Promise(r => setTimeout(r, REPLY_MS + 200));
      if (token !== this.token) return;
      this.play(p.moves[this.step]);
      this.step++;
      this.render();
    }
  }

  /** Records a miss once: rating down (for a new puzzle) and the puzzle queued to come back. */
  private markFailed(): void {
    if (this.recorded || !this.puzzle) return;
    this.failed = true;
    this.record(false);
  }

  private finish(): void {
    if (!this.recorded) this.record(true);
    this.phase = 'solved';
    this.message = this.failed ? '✓ Solved — with help, so it will come back for review.' : '✓ Solved!';
    this.render();
  }

  private record(solved: boolean): void {
    const { state, change } = recordResult(this.state, this.puzzle!, solved, this.review);
    this.state = state;
    this.recorded = true;
    this.lastChange = this.review ? undefined : change;
    this.save();
  }

  // ---------- rendering ----------

  private fillThemes(): void {
    const select = $<HTMLSelectElement>('puzzle-theme');
    const count = (t: string) => this.puzzles.filter(p => p.themes.includes(t)).length;
    select.replaceChildren(
      option('mixed', `Mixed (all themes) — ${this.puzzles.length}`),
      ...Object.entries(THEMES).map(([id, t]) => option(id, `${t.name} — ${count(id)}`)),
    );
    if (![...select.options].some(o => o.value === this.theme)) this.theme = 'mixed';
    select.value = this.theme;
  }

  private render(): void {
    $('puzzle-rating').textContent = String(this.state.rating);
    const change = $('puzzle-change');
    change.textContent = this.lastChange === undefined ? '' : this.lastChange >= 0 ? `+${this.lastChange}` : String(this.lastChange);
    change.className = this.lastChange === undefined ? '' : this.lastChange >= 0 ? 'up' : 'down';
    $('puzzle-recent').replaceChildren(
      ...this.state.history.slice(-10).map(a => {
        const s = h('span', `recent ${a.ok ? 'ok' : 'bad'}`, a.ok ? '✓' : '✗');
        s.title = a.ok ? 'Solved' : 'Missed';
        return s;
      }),
    );
    $('puzzle-idea').textContent = this.theme === 'mixed' ? 'Puzzles from every theme, close to your rating.' : THEMES[this.theme].idea;
    const missed = this.state.missed.length;
    $('puzzle-missed').textContent = missed ? `${missed} missed puzzle${missed > 1 ? 's' : ''} will come back for review.` : '';

    const p = this.puzzle;
    const status = $('puzzle-status');
    if (!p) {
      status.replaceChildren(h('p', 'muted', 'Loading puzzles…'));
    } else {
      const you = this.yourColor();
      const prompt =
        this.phase === 'yours'
          ? `Your turn: find the best move for ${you === 'w' ? 'White' : 'Black'}.`
          : this.phase === 'opponent'
            ? 'Your opponent is moving…'
            : '';
      const parts: HTMLElement[] = [];
      if (this.review) parts.push(h('span', 'badge inaccuracy', '↻ Review of a missed puzzle'));
      if (prompt) parts.push(h('p', 'puzzle-prompt', prompt));
      if (this.message) parts.push(h('p', `test-msg ${this.message.startsWith('✓') ? 'ok' : this.message.startsWith('✗') ? 'bad' : 'info'}`, this.message));
      status.replaceChildren(...parts);
    }

    const ended = this.phase === 'solved' || this.phase === 'failed-shown';
    $<HTMLButtonElement>('puzzle-hint').disabled = this.phase !== 'yours';
    $<HTMLButtonElement>('puzzle-solution').disabled = ended || !p;
    $('puzzle-next').textContent = ended ? 'Next puzzle ▶' : 'Skip ▶';
    this.renderInfo(ended);
    this.renderBoard();
  }

  private renderInfo(ended: boolean): void {
    const info = $('puzzle-info');
    const p = this.puzzle;
    info.hidden = !ended || !p;
    if (!p || !ended) return;
    const link = h('a', '', 'See it on Lichess') as HTMLAnchorElement;
    link.href = `https://lichess.org/training/${p.id}`;
    link.target = '_blank';
    link.rel = 'noopener';
    info.replaceChildren(
      h('p', '', h('strong', '', `Puzzle rated ${p.rating}`), ' · ', link),
      h(
        'ul',
        'puzzle-themes',
        ...p.themes.filter(t => THEMES[t]).map(t => h('li', '', h('strong', '', `${THEMES[t].name}: `), THEMES[t].idea)),
      ),
    );
  }

  private renderBoard(): void {
    if (!this.board) return;
    // which puzzle is on the board (used by the browser tests to look up the solution)
    $('view-puzzles').dataset.puzzle = this.puzzle?.id ?? '';
    const turn: Color = this.chess.turn() === 'w' ? 'white' : 'black';
    const history = this.chess.history({ verbose: true });
    const last = history[history.length - 1];
    const yours = this.phase === 'yours';
    const dests = new Map<Key, Key[]>();
    if (yours) for (const m of this.chess.moves({ verbose: true })) dests.set(m.from as Key, [...(dests.get(m.from as Key) ?? []), m.to as Key]);
    this.board.set({
      fen: this.chess.fen(),
      orientation: this.yourColor() === 'w' ? 'white' : 'black',
      turnColor: turn,
      check: this.chess.inCheck() ? turn : false,
      lastMove: last ? [last.from as Key, last.to as Key] : undefined,
      movable: { color: yours ? turn : undefined, dests },
    });
    const shapes: DrawShape[] = this.hintSquare ? [{ orig: this.hintSquare as Key, brush: 'green' }] : [];
    this.board.setAutoShapes(shapes);
  }

  /** You play the side that moves after the opponent's first move. */
  private yourColor(): 'w' | 'b' {
    return this.puzzle && this.puzzle.fen.split(' ')[1] === 'w' ? 'b' : 'w';
  }

  private save(): void {
    try {
      store.setItem(KEY, JSON.stringify({ state: this.state, theme: this.theme }));
    } catch {
      // not saved: progress lasts until the page is closed
    }
  }
}

function load(): { state: PuzzleState; theme: string } {
  try {
    const raw = store.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw) as { state: PuzzleState; theme: string };
      return { state: { ...newState(), ...data.state }, theme: data.theme ?? 'mixed' };
    }
  } catch {
    // fall through to a fresh start
  }
  return { state: newState(), theme: 'mixed' };
}

function option(value: string, label: string): HTMLOptionElement {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  return o;
}

import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Color, Key } from '@lichess-org/chessground/types';
import type { Square } from 'chess.js';
import { $, askPromotion, h, toast } from './dom';
import type { Engine } from './engine';
import { Game, type PromotionPiece } from './game';
import { describeElo, Opponent } from './opponent';
import { store } from './store';

/** What is kept in the browser while a game is in progress. */
interface SavedPlay {
  pgn: string;
  color: 'w' | 'b';
  elo: number;
  hints: number;
  over?: string;
}

const KEY = 'play';
/** The computer never answers faster than this, so its moves can be followed. */
const MIN_THINK_MS = 600;

export interface PlayOptions {
  loadEngine: () => Promise<Engine>;
  coordinates: boolean;
  /** Called with the finished game's PGN when "Review this game" is pressed. */
  onReview: (pgn: string) => void;
}

/** The Play page: a game against the computer at a chosen strength. */
export class PlayView {
  private board?: Api;
  private opponent?: Opponent;
  private game = new Game();
  private color: 'w' | 'b' = 'w';
  private elo = 1200;
  private hints = 0;
  private over?: string;
  private playing = false;
  private thinking = false;
  /** Bumped on every new game or takeback, so a late engine answer for an old position is dropped. */
  private token = 0;
  private hintMove?: string;

  constructor(private options: PlayOptions) {
    this.restore();
    const elo = $<HTMLInputElement>('play-elo');
    elo.value = String(this.elo);
    elo.addEventListener('input', () => this.renderEloLabel());
    $('play-start').addEventListener('click', () => this.start());
    $('play-hint').addEventListener('click', () => void this.hint());
    $('play-takeback').addEventListener('click', () => this.takeback());
    $('play-resign').addEventListener('click', () => this.resign());
    $('play-again').addEventListener('click', () => this.newGame());
    $('play-new').addEventListener('click', () => this.newGame());
    $('play-review').addEventListener('click', () => this.options.onReview(this.game.pgn()));
  }

  /** Called when the Play page is shown. */
  show(): void {
    this.opponent ??= new Opponent(this.options.loadEngine());
    if (!this.board) {
      this.board = Chessground($('play-board'), {
        coordinates: this.options.coordinates,
        movable: { free: false, showDests: true, events: { after: (o, d) => void this.onUserMove(o, d) } },
        draggable: { showGhost: true },
        highlight: { lastMove: true, check: true },
        animation: { enabled: true, duration: 200 },
      });
    } else {
      this.board.redrawAll();
    }
    this.render();
    this.maybeEngineMove();
  }

  setCoordinates(on: boolean): void {
    this.options.coordinates = on;
    this.board?.set({ coordinates: on });
    this.board?.redrawAll();
  }

  // ---------- game flow ----------

  private start(): void {
    this.elo = Number($<HTMLInputElement>('play-elo').value);
    const choice = document.querySelector<HTMLInputElement>('input[name="play-color"]:checked')?.value ?? 'w';
    this.color = choice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : (choice as 'w' | 'b');
    this.game = new Game();
    const computer = `Stockfish (level ${this.elo})`;
    this.game.headers = {
      Event: `Casual game vs computer (${this.elo})`,
      Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
      White: this.color === 'w' ? 'You' : computer,
      Black: this.color === 'b' ? 'You' : computer,
      Result: '*',
    };
    this.hints = 0;
    this.over = undefined;
    this.playing = true;
    this.token++;
    this.save();
    this.render();
    this.maybeEngineMove();
  }

  private newGame(): void {
    if (this.playing && !this.over && this.game.root.children.length && !confirm('Abandon this game and start a new one?')) return;
    this.playing = false;
    this.over = undefined;
    this.token++;
    this.thinking = false;
    this.clearSaved();
    this.render();
  }

  private async onUserMove(orig: Key, dest: Key): Promise<void> {
    const from = orig as Square;
    const to = dest as Square;
    let promotion: PromotionPiece | undefined;
    if (this.game.isPromotion(from, to)) {
      promotion = await askPromotion(this.color === 'w' ? 'white' : 'black');
      if (!promotion) return this.render();
    }
    if (!this.game.play(from, to, promotion)) return this.render();
    this.hintMove = undefined;
    this.afterMove();
  }

  private afterMove(): void {
    const status = this.game.status();
    if (status.over) {
      if (!status.over.startsWith('Checkmate')) return this.finish('1/2-1/2', `${status.over}.`);
      // the side to move is the one that got mated
      const iWon = status.turn !== this.color;
      this.finish(status.turn === 'w' ? '0-1' : '1-0', iWon ? 'You won by checkmate!' : 'Checkmate: you lost.');
      return;
    }
    this.save();
    this.render();
    this.maybeEngineMove();
  }

  private maybeEngineMove(): void {
    if (!this.playing || this.over || this.thinking || !this.opponent) return;
    if (this.game.status().turn === this.color) return;
    void this.engineMove();
  }

  private async engineMove(): Promise<void> {
    const token = this.token;
    const fen = this.game.fen();
    this.thinking = true;
    this.render();
    const started = Date.now();
    let uci: string | undefined;
    try {
      uci = await this.opponent!.move(fen, this.elo);
    } catch {
      toast('The engine could not start, so the computer cannot play.');
    }
    await new Promise(r => setTimeout(r, Math.max(0, MIN_THINK_MS - (Date.now() - started))));
    if (token !== this.token) return; // a new game or a takeback happened meanwhile
    this.thinking = false;
    if (!uci || this.game.fen() !== fen) return this.render();
    this.game.play(uci.slice(0, 2) as Square, uci.slice(2, 4) as Square, uci[4] as PromotionPiece | undefined);
    this.afterMove();
  }

  private async hint(): Promise<void> {
    if (!this.opponent || this.thinking || this.over || this.game.status().turn !== this.color) return;
    const fen = this.game.fen();
    $<HTMLButtonElement>('play-hint').disabled = true;
    const best = await this.opponent.hint(fen).catch(() => undefined);
    if (this.game.fen() !== fen) return this.render();
    if (best) {
      this.hints++;
      this.hintMove = best;
      this.save();
    }
    this.render();
  }

  /** Takes back your last move and the computer's answer to it. */
  private takeback(): void {
    if (this.over) return;
    const path = this.game.path();
    let mine = -1;
    for (let i = path.length - 1; i >= 0; i--) {
      if (path[i].ply!.color === this.color) {
        mine = i;
        break;
      }
    }
    if (mine < 0) return;
    this.token++; // drop the computer's answer if it is still thinking
    this.thinking = false;
    const parent = path[mine].parent!;
    this.game.deleteFrom(path[mine]);
    this.game.goTo(parent);
    this.hintMove = undefined;
    this.save();
    this.render();
  }

  private resign(): void {
    if (this.over || !confirm('Resign this game?')) return;
    this.token++;
    this.thinking = false;
    this.finish(this.color === 'w' ? '0-1' : '1-0', 'You resigned.');
  }

  /** Ends the game with a PGN result ("1-0", "0-1", "1/2-1/2") and the sentence shown to you. */
  private finish(result: string, message: string): void {
    this.game.headers.Result = result;
    this.over = message;
    this.save();
    this.render();
  }

  // ---------- rendering ----------

  private render(): void {
    $('play-setup').hidden = this.playing;
    $('play-game').hidden = !this.playing;
    this.renderEloLabel();
    if (!this.board) return;

    const status = this.game.status();
    const last = this.game.lastPly();
    const turn: Color = status.turn === 'w' ? 'white' : 'black';
    const myTurn = this.playing && !this.over && !this.thinking && status.turn === this.color;
    this.board.set({
      fen: this.game.fen(),
      orientation: this.color === 'w' ? 'white' : 'black',
      turnColor: turn,
      check: status.inCheck ? turn : false,
      lastMove: last ? [last.from as Key, last.to as Key] : undefined,
      movable: { color: myTurn ? turn : undefined, dests: myTurn ? (this.game.dests() as Map<Key, Key[]>) : new Map() },
    });
    this.board.setAutoShapes(
      this.hintMove && myTurn ? [{ orig: this.hintMove.slice(0, 2) as Key, dest: this.hintMove.slice(2, 4) as Key, brush: 'blue' }] : [],
    );

    // ○ marks White and ● Black, as on the Review page
    const computer = `${this.color === 'w' ? '●' : '○'} Stockfish · level ${this.elo}`;
    const you = `${this.color === 'w' ? '○' : '●'} You`;
    $('play-top').textContent = this.playing ? computer : '';
    $('play-bottom').textContent = this.playing ? you : '';

    const statusEl = $('play-status');
    statusEl.className = 'status';
    if (this.over) {
      statusEl.textContent = this.over;
      statusEl.classList.add('over');
    } else if (this.thinking) {
      statusEl.textContent = 'Stockfish is thinking…';
    } else if (this.playing) {
      statusEl.textContent = status.inCheck ? 'Your move — you are in check' : 'Your move';
      if (status.inCheck) statusEl.classList.add('check');
    }

    this.renderMoves();
    $('play-result').hidden = !this.over;
    $('play-actions').hidden = !!this.over;
    $('play-new').hidden = !!this.over; // the result box has its own "New game" button
    $<HTMLButtonElement>('play-hint').disabled = !myTurn;
    $<HTMLButtonElement>('play-takeback').disabled = this.over !== undefined || !this.game.path().some(n => n.ply!.color === this.color);
    $('play-hints-used').textContent = this.hints ? `Hints used: ${this.hints}` : '';
  }

  private renderEloLabel(): void {
    const elo = Number($<HTMLInputElement>('play-elo').value);
    $('play-elo-label').textContent = `${elo} · ${describeElo(elo)}`;
  }

  private renderMoves(): void {
    const list = $('play-moves');
    const plies = this.game.pathPlies();
    let row: HTMLElement | undefined;
    const rows: HTMLElement[] = [];
    plies.forEach((ply, i) => {
      if (ply.color === 'w' || !row) {
        row = h('li', '', h('span', 'num', `${ply.fenBefore.split(' ')[5]}.`));
        if (ply.color === 'b') row.append(h('span', 'move placeholder', '…'));
        rows.push(row);
      }
      const move = h('span', `move${i === plies.length - 1 ? ' current' : ''}`, ply.san);
      row.append(move);
    });
    list.replaceChildren(...(rows.length ? rows : [h('li', 'empty', this.color === 'w' ? 'Your move: you play White.' : 'The computer plays first.')]));
    list.scrollTop = list.scrollHeight;
  }

  // ---------- saving ----------

  private save(): void {
    if (!this.playing) return;
    const data: SavedPlay = { pgn: this.game.pgn(), color: this.color, elo: this.elo, hints: this.hints, over: this.over };
    try {
      store.setItem(KEY, JSON.stringify(data));
    } catch {
      // not saved; the game still goes on
    }
  }

  private clearSaved(): void {
    try {
      store.removeItem(KEY);
    } catch {
      // nothing to clear
    }
  }

  private restore(): void {
    try {
      const raw = store.getItem(KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as SavedPlay;
      this.game.loadPgn(data.pgn);
      this.color = data.color;
      this.elo = data.elo;
      this.hints = data.hints;
      this.over = data.over;
      this.playing = true;
    } catch {
      this.clearSaved();
    }
  }
}

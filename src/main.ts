import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Color, Key } from '@lichess-org/chessground/types';
import type { Square } from 'chess.js';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import './style.css';
import { Game, splitPgnGames, type PromotionPiece } from './game';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const game = new Game();
let orientation: Color = 'white';

const board: Api = Chessground($('board'), {
  movable: { free: false, showDests: true, events: { after: onUserMove } },
  draggable: { showGhost: true },
  highlight: { lastMove: true, check: true },
  animation: { enabled: true, duration: 200 },
});

// ---------- rendering ----------

function render(): void {
  const status = game.status();
  const last = game.lastPly();
  const turnColor: Color = status.turn === 'w' ? 'white' : 'black';

  board.set({
    fen: game.fen(),
    orientation,
    turnColor,
    check: status.inCheck ? turnColor : false,
    lastMove: last ? [last.from as Key, last.to as Key] : undefined,
    movable: { color: status.over ? undefined : turnColor, dests: game.dests() as Map<Key, Key[]> },
  });

  renderStatus(status);
  renderPlayers();
  renderMoves();
  renderComment();
  renderNav();
}

function renderStatus(status: ReturnType<Game['status']>): void {
  const el = $('status');
  const side = status.turn === 'w' ? 'White' : 'Black';
  el.className = 'status';
  if (status.over) {
    el.textContent = status.over;
    el.classList.add('over');
  } else if (status.inCheck) {
    el.textContent = `${side} is in check`;
    el.classList.add('check');
  } else {
    el.textContent = `${side} to move`;
  }
  el.classList.add(status.turn === 'w' ? 'white-turn' : 'black-turn');
}

function renderPlayers(): void {
  const h = game.headers;
  const name = (c: 'White' | 'Black') => (h[c] ? `${h[c]}${h[`${c}Elo`] ? ` (${h[`${c}Elo`]})` : ''}` : c);
  const [top, bottom] = orientation === 'white' ? ['Black', 'White'] as const : ['White', 'Black'] as const;
  $('player-top').textContent = `${top === 'White' ? '○' : '●'} ${name(top)}`;
  $('player-bottom').textContent = `${bottom === 'White' ? '○' : '●'} ${name(bottom)}`;

  const info = [h.Event, h.Date?.replace(/\./g, '-'), h.Result && h.Result !== '*' ? `Result: ${h.Result}` : '']
    .filter(Boolean)
    .join(' · ');
  $('game-info').textContent = info;
}

function renderMoves(): void {
  const list = $('moves');
  list.replaceChildren();
  const startsWithBlack = game.startFen.split(' ')[1] === 'b';
  const firstMoveNumber = Number(game.startFen.split(' ')[5]) || 1;

  let row: HTMLLIElement | undefined;
  game.plies.forEach((ply, i) => {
    const index = i + (startsWithBlack ? 1 : 0);
    if (index % 2 === 0 || !row) {
      row = document.createElement('li');
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = `${firstMoveNumber + Math.floor(index / 2)}.`;
      row.append(num);
      if (index % 2 === 1) row.append(placeholder());
      list.append(row);
    }
    const btn = document.createElement('button');
    btn.className = 'move';
    btn.textContent = ply.san;
    if (ply.comment) btn.classList.add('has-comment');
    if (i + 1 === game.cursor) btn.classList.add('current');
    btn.addEventListener('click', () => goTo(i + 1));
    row.append(btn);
  });

  if (game.plies.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Play a move on the board or import a PGN.';
    list.append(empty);
  }
  list.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
}

function placeholder(): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = 'move placeholder';
  s.textContent = '…';
  return s;
}

function renderComment(): void {
  const el = $('comment');
  const comment = game.lastPly()?.comment;
  el.hidden = !comment;
  el.textContent = comment ?? '';
}

function renderNav(): void {
  const atStart = game.cursor === 0;
  const atEnd = game.cursor === game.plies.length;
  $<HTMLButtonElement>('nav-start').disabled = atStart;
  $<HTMLButtonElement>('nav-prev').disabled = atStart;
  $<HTMLButtonElement>('nav-next').disabled = atEnd;
  $<HTMLButtonElement>('nav-end').disabled = atEnd;
}

// ---------- moves ----------

async function onUserMove(orig: Key, dest: Key): Promise<void> {
  const from = orig as Square;
  const to = dest as Square;
  let promotion: PromotionPiece | undefined;
  if (game.isPromotion(from, to)) {
    promotion = await askPromotion(game.status().turn === 'w' ? 'white' : 'black');
    if (!promotion) return render(); // cancelled: put the pawn back
  }
  game.play(from, to, promotion);
  render();
}

function askPromotion(color: Color): Promise<PromotionPiece | undefined> {
  const dialog = $<HTMLDialogElement>('promo-dialog');
  const box = $('promo-choices');
  const roles: [PromotionPiece, string][] = [['q', 'queen'], ['r', 'rook'], ['b', 'bishop'], ['n', 'knight']];
  return new Promise(resolve => {
    let choice: PromotionPiece | undefined;
    box.replaceChildren(
      ...roles.map(([p, role]) => {
        const btn = document.createElement('button');
        btn.className = 'promo-piece';
        btn.setAttribute('aria-label', role);
        btn.title = role[0].toUpperCase() + role.slice(1);
        const piece = document.createElement('piece');
        piece.className = `${role} ${color}`;
        btn.append(piece);
        btn.addEventListener('click', () => {
          choice = p;
          dialog.close();
        });
        return btn;
      }),
    );
    dialog.addEventListener('close', () => resolve(choice), { once: true });
    dialog.showModal();
  });
}

function goTo(ply: number): void {
  game.goTo(ply);
  render();
}

// ---------- PGN import ----------

const importDialog = $<HTMLDialogElement>('import-dialog');
const pgnText = $<HTMLTextAreaElement>('pgn-text');
const gameSelect = $<HTMLSelectElement>('game-select');
const importError = $('import-error');
let fileGames: string[] = [];

function openImport(): void {
  importError.textContent = '';
  pgnText.value = '';
  fileGames = [];
  $('game-pick').hidden = true;
  importDialog.showModal();
  pgnText.focus();
}

function useText(text: string): void {
  fileGames = splitPgnGames(text);
  const pick = $('game-pick');
  if (fileGames.length > 1) {
    gameSelect.replaceChildren(
      ...fileGames.map((g, i) => {
        const tag = (k: string) => g.match(new RegExp(`\\[${k} "([^"]*)"\\]`))?.[1] ?? '?';
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `${i + 1}. ${tag('White')} – ${tag('Black')}  ${tag('Result')}  (${tag('Date')})`;
        return opt;
      }),
    );
    pick.hidden = false;
    pgnText.value = fileGames[0];
  } else {
    pick.hidden = true;
    pgnText.value = text;
  }
  importError.textContent = '';
}

async function readFile(file: File | undefined): Promise<void> {
  if (!file) return;
  useText(await file.text());
}

$<HTMLInputElement>('pgn-file').addEventListener('change', e => {
  const input = e.target as HTMLInputElement;
  void readFile(input.files?.[0]);
  input.value = '';
});
gameSelect.addEventListener('change', () => (pgnText.value = fileGames[Number(gameSelect.value)]));
pgnText.addEventListener('dragover', e => {
  e.preventDefault();
  pgnText.classList.add('drag');
});
pgnText.addEventListener('dragleave', () => pgnText.classList.remove('drag'));
pgnText.addEventListener('drop', e => {
  e.preventDefault();
  pgnText.classList.remove('drag');
  void readFile(e.dataTransfer?.files[0]);
});
pgnText.addEventListener('paste', e => {
  // A pasted archive with several games gets the same game picker as a file.
  const text = e.clipboardData?.getData('text') ?? '';
  if (splitPgnGames(text).length > 1) {
    e.preventDefault();
    useText(text);
  }
});

$('import-form').addEventListener('submit', e => {
  if ((e.submitter as HTMLButtonElement | null)?.value !== 'load') return;
  e.preventDefault();
  const text = pgnText.value.trim();
  if (!text) {
    importError.textContent = 'Paste a PGN or choose a file first.';
    return;
  }
  try {
    game.loadPgn(text);
  } catch (err) {
    importError.textContent = (err as Error).message;
    return;
  }
  importDialog.close();
  game.goTo(0);
  render();
  toast(game.plies.length ? `Loaded ${game.plies.length} moves — use → to step through.` : 'Position loaded.');
});

// ---------- controls ----------

function flip(): void {
  orientation = orientation === 'white' ? 'black' : 'white';
  render();
}

$('nav-start').addEventListener('click', () => goTo(0));
$('nav-prev').addEventListener('click', () => goTo(game.cursor - 1));
$('nav-next').addEventListener('click', () => goTo(game.cursor + 1));
$('nav-end').addEventListener('click', () => goTo(game.plies.length));
$('flip').addEventListener('click', flip);
$('import').addEventListener('click', openImport);
$('new-game').addEventListener('click', () => {
  if (game.plies.length > 0 && !confirm('Start a new game? The current moves will be cleared.')) return;
  game.reset();
  render();
});
$('copy-pgn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(game.pgn());
    toast('PGN copied to the clipboard.');
  } catch {
    toast('Could not copy — your browser blocked clipboard access.');
  }
});

document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]')) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const actions: Record<string, () => void> = {
    ArrowLeft: () => goTo(game.cursor - 1),
    ArrowRight: () => goTo(game.cursor + 1),
    Home: () => goTo(0),
    End: () => goTo(game.plies.length),
    f: flip,
    F: flip,
  };
  const action = actions[e.key];
  if (action) {
    e.preventDefault();
    action();
  }
});

let toastTimer: number | undefined;
function toast(message: string): void {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2500);
}

render();

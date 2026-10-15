import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Color, Key } from '@lichess-org/chessground/types';
import type { Square } from 'chess.js';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import './style.css';
import { Analyzer } from './analyzer';
import { Engine, workerTransport } from './engine';
import { Game, splitPgnGames, type Ply, type PromotionPiece } from './game';
import { EvalGraph, type GraphPoint } from './graph';
import { formatScore, LABELS, reviewMove, summarize, winChance, type MoveReview } from './review';
import { explainMove } from './teach';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const game = new Game();
let orientation: Color = 'white';

const board: Api = Chessground($('board'), {
  movable: { free: false, showDests: true, events: { after: onUserMove } },
  draggable: { showGhost: true },
  highlight: { lastMove: true, check: true },
  animation: { enabled: true, duration: 200 },
});

const graph = new EvalGraph($('graph'), index => goTo(index));

// ---------- engine ----------

/** Depth for the position on the board when no full analysis is running. */
const LIVE_DEPTH = 14;
const ENGINE_BASE = `${import.meta.env.BASE_URL}engine/`;

let analyzer: Analyzer | undefined;
let analyzing = false;

/** Starts Stockfish (WebAssembly), falling back to the slower asm.js build if that fails. */
async function startEngine(): Promise<void> {
  const builds = [
    { file: 'stockfish-19-lite-single.js', name: 'Stockfish 19 (lite)' },
    { file: 'stockfish-19-asm.js', name: 'Stockfish 19 (compatibility mode, slower)' },
  ];
  for (const build of builds) {
    let engine: Engine | undefined;
    try {
      engine = new Engine(workerTransport(ENGINE_BASE + build.file));
      await engine.whenReady();
      analyzer = new Analyzer(engine);
      $('engine-status').textContent = `Engine: ${build.name}`;
      render();
      return;
    } catch (err) {
      console.warn(`Could not start ${build.file}:`, err);
      engine?.terminate();
    }
  }
  $('engine-status').textContent = 'The engine could not start in this browser, so analysis is unavailable.';
  $('engine-status').classList.add('error');
  render();
}

function depth(): number {
  return Number($<HTMLSelectElement>('depth').value);
}

const uciOf = (p: Ply) => `${p.from}${p.to}${p.promotion ?? ''}`;

/** All positions of the game: the start, then the position after each move. */
function fens(): string[] {
  return [game.startFen, ...game.plies.map(p => p.fenAfter)];
}

/** The review of move `index`, if both positions around it have been evaluated. */
function reviewAt(index: number): MoveReview | undefined {
  const ply = game.plies[index];
  const before = analyzer?.get(ply.fenBefore);
  const after = analyzer?.get(ply.fenAfter);
  return before && after ? reviewMove(uciOf(ply), ply.color, before, after) : undefined;
}

async function analyzeGame(): Promise<void> {
  if (!analyzer || analyzing || game.plies.length === 0) return;
  analyzing = true;
  render();
  const all = fens();
  const moves = game.plies.map(p => ({ uci: uciOf(p), color: p.color }));
  const finished = await analyzer.analyzeGame(all, moves, depth(), (done, total) => {
    $('progress-fill').style.width = `${(100 * done) / total}%`;
    $('progress-text').textContent = done < total ? `Analyzing ${done + 1} / ${total}…` : 'Double-checking…';
    render();
  });
  analyzing = false;
  render();
  if (finished) toast('Analysis complete. Step through the moves to read the explanations.');
}

/** Makes sure the positions needed for the current view are evaluated, one at a time. */
function requestLiveEvaluation(): void {
  if (!analyzer) return;
  const wanted = [game.fen(), game.lastPly()?.fenBefore].filter((f): f is string => !!f);
  const missing = wanted.find(f => !analyzer!.get(f));
  if (missing) analyzer.requestLive(missing, Math.min(LIVE_DEPTH, depth()), () => render());
}

// ---------- rendering ----------

function render(): void {
  const status = game.status();
  const last = game.lastPly();
  const turnColor: Color = status.turn === 'w' ? 'white' : 'black';
  const index = game.cursor - 1;
  const review = index >= 0 ? reviewAt(index) : undefined;
  const lesson = index >= 0 ? explainMove(game.plies, index, review) : undefined;

  board.set({
    fen: game.fen(),
    orientation,
    turnColor,
    check: status.inCheck ? turnColor : false,
    lastMove: last ? [last.from as Key, last.to as Key] : undefined,
    movable: { color: status.over ? undefined : turnColor, dests: game.dests() as Map<Key, Key[]> },
  });
  board.setAutoShapes(arrows(review, lesson));

  renderStatus(status);
  renderPlayers();
  renderMoves();
  renderLesson(index, review, lesson);
  renderEvalBar();
  renderGraph();
  renderAnalysisControls();
  renderNav();
  requestLiveEvaluation();
}

function arrows(review: MoveReview | undefined, lesson: ReturnType<typeof explainMove> | undefined): DrawShape[] {
  const shape = (uci: string, brush: string): DrawShape => ({ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush });
  const bad = review && ['inaccuracy', 'mistake', 'blunder'].includes(review.classification);
  if (bad && lesson) {
    const shapes: DrawShape[] = [];
    if (lesson.better) shapes.push(shape(lesson.better.uci, 'green'));
    if (lesson.reply) shapes.push(shape(lesson.reply.uci, 'red'));
    return shapes;
  }
  const current = analyzer?.get(game.fen());
  if ($<HTMLInputElement>('show-best').checked && current?.best) return [shape(current.best, 'blue')];
  return [];
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
  const [top, bottom] = orientation === 'white' ? (['Black', 'White'] as const) : (['White', 'Black'] as const);
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
    const cls = reviewAt(i)?.classification;
    if (cls && LABELS[cls].glyph && ['inaccuracy', 'mistake', 'blunder'].includes(cls)) {
      const glyph = document.createElement('span');
      glyph.className = `glyph ${cls}`;
      glyph.textContent = LABELS[cls].glyph;
      glyph.title = LABELS[cls].name;
      btn.append(glyph);
      btn.setAttribute('aria-label', `${ply.san}, ${LABELS[cls].name}`);
    }
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

/** Builds an element with text content (never HTML, so PGN text can't inject markup). */
function h(tag: string, className: string, ...children: (Node | string)[]): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  e.append(...children);
  return e;
}

function renderLesson(index: number, review: MoveReview | undefined, lesson: ReturnType<typeof explainMove> | undefined): void {
  const el = $('lesson');
  if (index < 0 || !lesson) {
    el.replaceChildren(
      h('p', 'muted', game.plies.length ? 'Start position. Press → to go through the game.' : 'Make a move, or import a game to study it.'),
    );
    return;
  }
  const ply = game.plies[index];
  const moveName = `${ply.fenBefore.split(' ')[5]}${ply.color === 'w' ? '. ' : '...'}${ply.san}`;
  const header = h('div', 'lesson-head', h('strong', 'lesson-move', moveName));
  if (review) {
    const label = LABELS[review.classification];
    header.append(h('span', `badge ${review.classification}`, `${label.glyph ? `${label.glyph} ` : ''}${label.name}`));
    header.append(h('span', 'lesson-eval', `${formatScore(review.before.score)} → ${formatScore(review.after.score)}`));
  }
  const parts: HTMLElement[] = [header];
  if (lesson.note) parts.push(h('p', 'lesson-note', lesson.note));
  parts.push(h('ul', 'lesson-points', ...lesson.purpose.map(p => h('li', '', p))));
  if (lesson.problem) parts.push(h('p', 'lesson-problem', lesson.problem));
  if (lesson.better) {
    const better = h('p', 'lesson-better', 'Best was ', h('strong', '', lesson.better.san), '.');
    if (lesson.better.reason) better.append(` ${lesson.better.reason}`);
    parts.push(better);
    if (lesson.better.line) parts.push(h('p', 'lesson-line', `Engine line: ${lesson.better.line}`));
  }
  const bad = review && ['inaccuracy', 'mistake', 'blunder'].includes(review.classification);
  if (bad) {
    parts.push(
      h(
        'p',
        'lesson-legend',
        h('span', 'arrow-key green', ''),
        ' better move ',
        h('span', 'arrow-key red', ''),
        ' the reply it allows',
      ),
    );
  }
  if (!review) {
    parts.push(h('p', 'muted', analyzer ? 'The engine is looking at this move…' : 'Waiting for the engine…'));
  }
  if (ply.comment) parts.push(h('blockquote', 'pgn-comment', ply.comment));
  el.replaceChildren(...parts);
}

function renderEvalBar(): void {
  const current = analyzer?.get(game.fen());
  const bar = $('eval-bar');
  bar.classList.toggle('flipped', orientation === 'black');
  bar.classList.toggle('pending', !current);
  if (!current) {
    $('eval-text').textContent = '';
    return;
  }
  const white = (winChance(current.score) + 1) / 2;
  $('eval-fill').style.height = `${(white * 100).toFixed(1)}%`;
  const text = formatScore(current.score);
  $('eval-text').textContent = text.replace(/^[+−]/, '');
  $('eval-text').classList.toggle('on-white', white >= 0.5);
  bar.title = `Evaluation: ${text} (depth ${current.depth})`;
}

function renderGraph(): void {
  const all = fens();
  const points: GraphPoint[] = all.map((fen, i) => {
    const e = analyzer?.get(fen);
    const ply = game.plies[i - 1];
    return {
      value: e ? winChance(e.score) : undefined,
      score: e ? formatScore(e.score) : undefined,
      label: ply ? `${ply.fenBefore.split(' ')[5]}${ply.color === 'w' ? '. ' : '...'}${ply.san}` : 'Start',
      mark: i > 0 ? reviewAt(i - 1)?.classification : undefined,
    };
  });
  graph.update(points, game.cursor);
}

function renderAnalysisControls(): void {
  const btn = $<HTMLButtonElement>('analyze');
  const allDone = game.plies.length > 0 && game.plies.every((_, i) => reviewAt(i));
  btn.disabled = !analyzer || analyzing || game.plies.length === 0;
  btn.textContent = analyzing ? 'Analyzing…' : allDone ? 'Re-analyze' : 'Analyze game';
  $<HTMLSelectElement>('depth').disabled = analyzing;
  $('progress').hidden = !analyzing;

  const summaryEl = $('summary');
  if (!allDone || analyzing) {
    summaryEl.hidden = true;
    return;
  }
  const firstMover = game.startFen.split(' ')[1] === 'b' ? 'b' : 'w';
  const s = summarize(game.plies.map((_, i) => reviewAt(i)), firstMover);
  const row = (side: 'w' | 'b') => {
    const p = s[side];
    const name = game.headers[side === 'w' ? 'White' : 'Black'] ?? (side === 'w' ? 'White' : 'Black');
    return h(
      'div',
      'summary-row',
      h('span', 'summary-name', `${side === 'w' ? '○' : '●'} ${name}`),
      h('span', 'summary-acc', p.moves ? `${Math.round(p.accuracy)}%` : '–'),
      h('span', 'glyph inaccuracy', `${p.counts.inaccuracy} ?!`),
      h('span', 'glyph mistake', `${p.counts.mistake} ?`),
      h('span', 'glyph blunder', `${p.counts.blunder} ??`),
    );
  };
  summaryEl.replaceChildren(h('div', 'summary-title', 'Accuracy'), row('w'), row('b'));
  summaryEl.title = 'Accuracy, then the number of inaccuracies (?!), mistakes (?) and blunders (??)';
  summaryEl.hidden = false;
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
  analyzer?.cancelGame();
  game.goTo(0);
  render();
  toast(game.plies.length ? `Loaded ${game.plies.length} moves. Press "Analyze game" to review them.` : 'Position loaded.');
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
$('analyze').addEventListener('click', () => void analyzeGame());
$('show-best').addEventListener('change', () => render());
$('new-game').addEventListener('click', () => {
  if (game.plies.length > 0 && !confirm('Start a new game? The current moves will be cleared.')) return;
  analyzer?.cancelGame();
  game.reset();
  render();
});
$('copy-pgn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(game.pgn());
    toast('PGN copied to the clipboard.');
  } catch {
    toast('Could not copy: your browser blocked clipboard access.');
  }
});

const depthSelect = $<HTMLSelectElement>('depth');
try {
  const saved = localStorage.getItem('analysis-depth');
  if (saved && [...depthSelect.options].some(o => o.value === saved)) depthSelect.value = saved;
} catch {
  // storage unavailable: keep the default
}
depthSelect.addEventListener('change', () => {
  try {
    localStorage.setItem('analysis-depth', depthSelect.value);
  } catch {
    // not saved, that's fine
  }
});

document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]')) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const actions: Record<string, () => void> = {
    ArrowLeft: () => goTo(game.cursor - 1),
    ArrowRight: () => goTo(game.cursor + 1),
    Home: () => goTo(0),
    End: () => goTo(game.plies.length),
    f: flip,
    F: flip,
    a: () => void analyzeGame(),
    A: () => void analyzeGame(),
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
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 3000);
}

render();
void startEngine();

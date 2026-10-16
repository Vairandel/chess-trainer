import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Color, Key } from '@lichess-org/chessground/types';
import type { Square } from 'chess.js';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import './style.css';
import { Analyzer, type AnalyzedMove } from './analyzer';
import { moveBadge } from './badges';
import { $, askPromotion, h, img, toast } from './dom';
import { loadStockfish, type Engine } from './engine';
import { Game, splitPgnGames, type MoveNode, type Ply, type PromotionPiece } from './game';
import { EvalGraph, type GraphPoint } from './graph';
import { Library, type SavedGame } from './library';
import { renderMoveTree } from './moveList';
import { formatScore, LABELS, reviewMove, summarize, winChance, type MoveReview, type PositionEval } from './review';
import {
  ACCENTS,
  applySettings,
  BOARDS,
  boardImage,
  DEFAULTS,
  loadSettings,
  PIECE_SETS,
  pieceUrl,
  saveSettings,
  type Settings,
} from './settings';
import { PlayView } from './play';
import { StudyView } from './studyView';
import { explainMove } from './teach';

let settings = loadSettings();
applySettings(settings);

const game = new Game();
const library = new Library();
let orientation: Color = 'white';
/** The saved game shown in Review. Changes to it (new variations, deleted lines) are saved automatically. */
let currentGameId: string | undefined;

const board: Api = Chessground($('board'), {
  coordinates: settings.coordinates,
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

let engineState: 'loading' | 'ready' | 'failed' = 'loading';
let analyzing = false;

/** Starts the analysis engine and reports how that went. */
async function startEngine(): Promise<Engine> {
  try {
    const { engine, name } = await loadStockfish(ENGINE_BASE);
    engineState = 'ready';
    $('engine-status').textContent = `Engine: ${name}`;
    render();
    return engine;
  } catch (err) {
    engineState = 'failed';
    $('engine-status').textContent = 'The engine could not start in this browser, so analysis is unavailable.';
    $('engine-status').classList.add('error');
    render();
    throw err;
  }
}

// Saved analyses can be shown while the engine is still loading.
const engineReady = startEngine();
const analyzer = new Analyzer(engineReady);

function depth(): number {
  return Number($<HTMLSelectElement>('depth').value);
}

const uciOf = (p: Ply) => `${p.from}${p.to}${p.promotion ?? ''}`;

/** The review of the move that led to `node`, if both positions around it have been evaluated. */
function reviewOf(node: MoveNode): MoveReview | undefined {
  const ply = node.ply;
  if (!ply) return undefined;
  const before = analyzer.get(ply.fenBefore);
  const after = analyzer.get(ply.fenAfter);
  return before && after ? reviewMove(uciOf(ply), ply.color, before, after) : undefined;
}

function firstMover(): 'w' | 'b' {
  return game.startFen.split(' ')[1] === 'b' ? 'b' : 'w';
}

/** "12. Nf3" or "12...Nf6". */
function moveName(ply: Ply): string {
  return `${ply.fenBefore.split(' ')[5]}${ply.color === 'w' ? '. ' : '...'}${ply.san}`;
}

async function analyzeGame(): Promise<void> {
  if (engineState !== 'ready' || analyzing || game.root.children.length === 0) return;
  analyzing = true;
  render();
  // the main line first, then the variations
  const moves: AnalyzedMove[] = game.allNodes().map(n => ({
    uci: uciOf(n.ply!),
    color: n.ply!.color,
    fenBefore: n.ply!.fenBefore,
    fenAfter: n.ply!.fenAfter,
  }));
  let finished = false;
  try {
    finished = await analyzer.analyzeGame(moves, depth(), (done, total) => {
      $('progress-fill').style.width = `${(100 * done) / total}%`;
      $('progress-text').textContent = done < total ? `Analyzing position ${done + 1} / ${total}…` : 'Double-checking…';
      render();
    });
  } catch {
    toast('The engine stopped working. Reload the page to try again.');
  }
  analyzing = false;
  persist();
  render();
  if (finished) toast('Analysis complete. Step through the moves to read the explanations.');
}

/**
 * Saves the current game in My games: its moves and variations, the evaluations found so far
 * (so reopening it later shows them at once), and the accuracy once the main line is fully analyzed.
 */
function persist(): void {
  if (!currentGameId) return;
  const main = game.mainLine();
  const reviews = main.map(reviewOf);
  const s = summarize(reviews, firstMover());
  try {
    library.update(currentGameId, {
      pgn: game.pgn(),
      moves: main.length,
      accuracy: main.length && reviews.every(Boolean) ? { w: Math.round(s.w.accuracy), b: Math.round(s.b.accuracy) } : undefined,
    });
  } catch (err) {
    toast((err as Error).message);
  }
  const evals = game
    .allNodes()
    .flatMap(n => [analyzer.get(n.ply!.fenBefore), analyzer.get(n.ply!.fenAfter)])
    .filter((e): e is PositionEval => !!e);
  library.saveEvals(currentGameId, [...new Set(evals)]);
}

/** Live evaluations arrive one by one; save them in batches rather than after each. */
let persistTimer: number | undefined;
function persistSoon(): void {
  clearTimeout(persistTimer);
  persistTimer = window.setTimeout(persist, 1500);
}

/** Makes sure the positions needed for the current view are evaluated, one at a time. */
function requestLiveEvaluation(): void {
  if (engineState === 'failed' || currentView !== 'review') return;
  const wanted = [game.fen(), game.lastPly()?.fenBefore].filter((f): f is string => !!f);
  const missing = wanted.find(f => !analyzer.get(f));
  if (missing) {
    analyzer.requestLive(missing, Math.min(LIVE_DEPTH, depth()), () => {
      render();
      persistSoon();
    });
  }
}

// ---------- views ----------

type View = 'games' | 'review' | 'study' | 'play' | 'settings';
const VIEWS: View[] = ['games', 'review', 'study', 'play', 'settings'];
let currentView: View = 'games';

/** The Play and Study pages have their own boards; they are created the first time they are opened. */
let playView: PlayView | undefined;
let studyView: StudyView | undefined;

function route(): void {
  // "#study/fried-liver" → view "study", argument "fried-liver"
  // "#study/catalan/practice" → view "study", then "catalan" and "practice"
  const [hash, arg, mode] = location.hash.slice(1).split('/') as [View, string | undefined, string | undefined];
  currentView = VIEWS.includes(hash) ? hash : 'games';
  for (const v of VIEWS) $(`view-${v}`).hidden = currentView !== v;
  document.querySelectorAll<HTMLAnchorElement>('a[data-view]').forEach(a => {
    if (a.dataset.view === currentView) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.body.dataset.view = currentView;
  if (currentView === 'review') {
    board.redrawAll(); // the board was hidden, so its size must be measured again
    render();
  } else if (currentView === 'settings') {
    renderSettings();
  } else if (currentView === 'study') {
    studyView ??= new StudyView({
      coordinates: settings.coordinates,
      isActive: () => currentView === 'study',
      evaluate: fen => analyzer.evaluate(fen, 14),
    });
    studyView.show(arg, mode);
  } else if (currentView === 'play') {
    playView ??= new PlayView({
      loadEngine: () => loadStockfish(ENGINE_BASE).then(r => r.engine),
      coordinates: settings.coordinates,
      onReview: reviewPlayedGame,
    });
    playView.show();
  } else {
    renderLibrary();
  }
}

// ---------- Settings ----------

let preview: Api | undefined;

function changeSettings(patch: Partial<Settings>): void {
  const coordsChanged = 'coordinates' in patch && patch.coordinates !== settings.coordinates;
  settings = { ...settings, ...patch };
  saveSettings(settings);
  applySettings(settings);
  if (coordsChanged) {
    // coordinates are drawn when the board is built, so both boards are rebuilt
    board.set({ coordinates: settings.coordinates });
    board.redrawAll();
    preview?.set({ coordinates: settings.coordinates });
    preview?.redrawAll();
    playView?.setCoordinates(settings.coordinates);
    studyView?.setCoordinates(settings.coordinates);
  }
  renderSettings();
}

function renderSettings(): void {
  document.querySelectorAll<HTMLInputElement>('input[name="theme"]').forEach(r => (r.checked = r.value === settings.theme));

  const swatch = (id: string, name: string, light: string, dark: string) => {
    const btn = h('button', 'swatch', h('span', 'swatch-board'), h('span', 'swatch-name', name));
    (btn.firstChild as HTMLElement).style.backgroundImage = boardImage(light, dark);
    btn.setAttribute('aria-pressed', String(settings.board === id));
    btn.addEventListener('click', () => changeSettings({ board: id }));
    return btn;
  };
  $('board-choice').replaceChildren(
    ...BOARDS.map(b => swatch(b.id, b.name, b.light, b.dark)),
    swatch('custom', 'Custom', settings.customBoard.light, settings.customBoard.dark),
  );
  $('piece-choice').replaceChildren(
    ...PIECE_SETS.map(p => {
      // Classic is embedded in chessground's CSS, so its sample uses chessground's piece elements
      const sample =
        p.id === 'cburnett'
          ? h('span', 'piece-sample cg-wrap classic-sample', h('piece', 'knight white'), h('piece', 'king black'))
          : h('span', 'piece-sample', img(pieceUrl(p.id, 'wN')), img(pieceUrl(p.id, 'bK')));
      const btn = h('button', 'swatch', sample, h('span', 'swatch-name', p.name));
      btn.setAttribute('aria-pressed', String(settings.pieces === p.id));
      btn.addEventListener('click', () => changeSettings({ pieces: p.id }));
      return btn;
    }),
  );
  $('custom-colors').hidden = settings.board !== 'custom';
  $<HTMLInputElement>('custom-light').value = settings.customBoard.light;
  $<HTMLInputElement>('custom-dark').value = settings.customBoard.dark;

  $('accent-choice').replaceChildren(
    ...ACCENTS.map(a => {
      const btn = h('button', 'accent-dot');
      btn.style.setProperty('--dot-l', a.light);
      btn.style.setProperty('--dot-d', a.dark);
      btn.title = a.name;
      btn.setAttribute('aria-label', a.name);
      btn.setAttribute('aria-pressed', String(settings.accent === a.id));
      btn.addEventListener('click', () => changeSettings({ accent: a.id }));
      return btn;
    }),
  );
  $<HTMLInputElement>('show-coords').checked = settings.coordinates;

  // the preview is built the first time Settings is shown, when its box has a size
  if (!preview) {
    preview = Chessground($('preview-board'), {
      fen: 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4',
      lastMove: ['h5', 'f7'],
      check: 'black',
      viewOnly: true,
      coordinates: settings.coordinates,
    });
    preview.setAutoShapes([{ orig: 'c4', dest: 'f7', brush: 'green' }]);
  } else {
    preview.redrawAll();
  }
}

document.querySelectorAll<HTMLInputElement>('input[name="theme"]').forEach(r =>
  r.addEventListener('change', () => changeSettings({ theme: r.value as Settings['theme'] })),
);
for (const id of ['custom-light', 'custom-dark'] as const) {
  // "input" fires while dragging in the color picker: the board follows live
  $<HTMLInputElement>(id).addEventListener('input', e => {
    const value = (e.target as HTMLInputElement).value;
    changeSettings({ customBoard: { ...settings.customBoard, [id === 'custom-light' ? 'light' : 'dark']: value } });
  });
}
$<HTMLInputElement>('show-coords').addEventListener('change', e =>
  changeSettings({ coordinates: (e.target as HTMLInputElement).checked }),
);
$('reset-settings').addEventListener('click', () => changeSettings({ ...DEFAULTS }));

function openSaved(saved: SavedGame): void {
  persist(); // the game being left, before it is replaced
  try {
    game.loadPgn(saved.pgn);
  } catch (err) {
    toast((err as Error).message);
    return;
  }
  analyzer.cancelGame();
  analyzer.seed(library.loadEvals(saved.id));
  currentGameId = saved.id;
  game.goTo(0);
  if (location.hash === '#review') route();
  else location.hash = '#review';
}

/** A game finished on the Play page: save it to My games, open it in Review and analyze it. */
function reviewPlayedGame(pgn: string): void {
  const g = new Game();
  g.loadPgn(pgn);
  let saved: SavedGame;
  try {
    [saved] = library.add([
      {
        pgn,
        white: g.headers.White ?? 'White',
        black: g.headers.Black ?? 'Black',
        result: g.headers.Result ?? '*',
        date: formatDate(g.headers.Date),
        event: g.headers.Event,
        moves: g.plies.length,
      },
    ]);
  } catch (err) {
    toast((err as Error).message);
    return;
  }
  openSaved(saved);
  engineReady.then(() => analyzeGame()).catch(() => {}); // a failed engine is already reported on the page
}

// ---------- My games ----------

function renderLibrary(): void {
  const games = library.list().sort((a, b) => b.addedAt - a.addedAt);
  $('game-count').textContent = games.length ? `(${games.length})` : '';
  const list = $('game-list');
  if (games.length === 0) {
    list.replaceChildren(h('li', 'empty', 'No games yet. Paste a PGN or choose a file to add your first game.'));
    return;
  }
  list.replaceChildren(
    ...games.map(g => {
      const open = h('button', 'game-open');
      open.append(
        h('span', 'game-players', `${g.white} – ${g.black}`),
        h(
          'span',
          'game-meta',
          [g.result !== '*' ? g.result : '', g.date, `${Math.ceil(g.moves / 2)} moves`, g.event].filter(Boolean).join(' · '),
        ),
      );
      if (g.accuracy) {
        open.append(h('span', 'game-acc', `Accuracy ○ ${g.accuracy.w}% · ● ${g.accuracy.b}%`));
      } else {
        open.append(h('span', 'game-acc muted', 'Not analyzed yet'));
      }
      open.addEventListener('click', () => openSaved(g));
      const del = h('button', 'game-delete', '×');
      del.title = 'Delete this game';
      del.setAttribute('aria-label', `Delete ${g.white} – ${g.black}`);
      del.addEventListener('click', () => {
        if (!confirm(`Delete ${g.white} – ${g.black}?`)) return;
        library.remove(g.id);
        if (currentGameId === g.id) currentGameId = undefined;
        renderLibrary();
      });
      return h('li', 'game-item', open, del);
    }),
  );
}

const pgnText = $<HTMLTextAreaElement>('pgn-text');
const importError = $('import-error');

/** Turns pasted text into saved games; opens the game when there is just one. */
function addGames(text: string): void {
  importError.textContent = '';
  const parts = splitPgnGames(text);
  if (parts.length === 0) {
    importError.textContent = 'Paste a PGN or choose a file first.';
    return;
  }
  const entries: Omit<SavedGame, 'id' | 'addedAt'>[] = [];
  let failures = 0;
  let lastError = '';
  for (const pgn of parts) {
    const g = new Game();
    try {
      g.loadPgn(pgn);
    } catch (err) {
      failures++;
      lastError = (err as Error).message;
      continue;
    }
    entries.push({
      pgn,
      white: g.headers.White ?? 'White',
      black: g.headers.Black ?? 'Black',
      result: g.headers.Result ?? '*',
      date: formatDate(g.headers.Date),
      event: g.headers.Event,
      moves: g.plies.length,
    });
  }
  if (entries.length === 0) {
    importError.textContent = lastError;
    return;
  }
  let saved: SavedGame[];
  try {
    saved = library.add(entries);
  } catch (err) {
    importError.textContent = (err as Error).message;
    return;
  }
  pgnText.value = '';
  if (failures) toast(`${failures} game${failures > 1 ? 's' : ''} could not be read and ${failures > 1 ? 'were' : 'was'} skipped.`);
  if (saved.length === 1) {
    openSaved(saved[0]);
  } else {
    renderLibrary();
    toast(`Added ${saved.length} games. Pick one to review it.`);
  }
}

$('import-form').addEventListener('submit', e => {
  e.preventDefault();
  addGames(pgnText.value);
});
$<HTMLInputElement>('pgn-file').addEventListener('change', async e => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) addGames(await file.text());
});
pgnText.addEventListener('dragover', e => {
  e.preventDefault();
  pgnText.classList.add('drag');
});
pgnText.addEventListener('dragleave', () => pgnText.classList.remove('drag'));
pgnText.addEventListener('drop', async e => {
  e.preventDefault();
  pgnText.classList.remove('drag');
  const file = e.dataTransfer?.files[0];
  if (file) addGames(await file.text());
});
$('empty-board').addEventListener('click', () => {
  persist();
  analyzer.cancelGame();
  currentGameId = undefined;
  game.reset();
  // the link itself switches to #review; if already there, re-render
  if (location.hash === '#review') route();
});

// ---------- rendering (Review) ----------

function render(): void {
  if (currentView !== 'review') return;
  const status = game.status();
  const last = game.lastPly();
  const turnColor: Color = status.turn === 'w' ? 'white' : 'black';
  const node = game.node;
  const review = reviewOf(node);
  const line = game.pathPlies();
  const lesson = node.ply ? explainMove(line, line.length - 1, review) : undefined;

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
  renderLineTools();
  renderLesson(node, review, lesson);
  renderEvalBar();
  renderGraph();
  renderAnalysisControls();
  renderNav();
  requestLiveEvaluation();
}

/** Arrows and the grade badge drawn on the board for the move being viewed. */
function arrows(review: MoveReview | undefined, lesson: ReturnType<typeof explainMove> | undefined): DrawShape[] {
  const shape = (uci: string, brush: string): DrawShape => ({ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush });
  const shapes: DrawShape[] = [];
  const last = game.lastPly();
  const badge = review && last && moveBadge(review.classification, last.to);
  if (badge) shapes.push(badge);

  const bad = review && ['inaccuracy', 'mistake', 'blunder'].includes(review.classification);
  if (bad && lesson) {
    if (lesson.better) shapes.push(shape(lesson.better.uci, 'green'));
    if (lesson.reply) shapes.push(shape(lesson.reply.uci, 'red'));
    return shapes;
  }
  const current = analyzer.get(game.fen());
  if ($<HTMLInputElement>('show-best').checked && current?.best) shapes.push(shape(current.best, 'blue'));
  return shapes;
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
  const hd = game.headers;
  const name = (c: 'White' | 'Black') => (hd[c] ? `${hd[c]}${hd[`${c}Elo`] ? ` (${hd[`${c}Elo`]})` : ''}` : c);
  const [top, bottom] = orientation === 'white' ? (['Black', 'White'] as const) : (['White', 'Black'] as const);
  $('player-top').textContent = `${top === 'White' ? '○' : '●'} ${name(top)}`;
  $('player-bottom').textContent = `${bottom === 'White' ? '○' : '●'} ${name(bottom)}`;

  const info = [hd.Event, formatDate(hd.Date), hd.Result && hd.Result !== '*' ? `Result: ${hd.Result}` : '']
    .filter(Boolean)
    .join(' · ');
  $('game-info').textContent = info;
}

/** The move tree, with error glyphs once a move is analyzed. */
function renderMoves(): void {
  renderMoveTree($('moves'), game, {
    onSelect: node => goTo(node),
    emptyText: 'Play a move on the board, or open a game from My games.',
    decorate: (node, btn) => {
      const cls = reviewOf(node)?.classification;
      if (!cls || !['inaccuracy', 'mistake', 'blunder'].includes(cls)) return;
      const glyph = h('span', `glyph ${cls}`, LABELS[cls].glyph);
      glyph.title = LABELS[cls].name;
      btn.append(glyph);
      btn.setAttribute('aria-label', `${moveName(node.ply!)}, ${LABELS[cls].name}`);
    },
  });
}

/** "Make main line" / "Delete from here" for the move being viewed. */
function renderLineTools(): void {
  const node = game.node;
  $('line-tools').hidden = !node.ply;
  $('promote-line').hidden = game.isMainLine(node);
  $('save-game').hidden = !!currentGameId || game.root.children.length === 0;
}

/** PGN date "2026.10.01" → "2026-10-01"; unknown parts ("1858.??.??") are dropped. */
function formatDate(date: string | undefined): string | undefined {
  return date?.replace(/\./g, '-').replace(/-\?\?/g, '') || undefined;
}

function renderLesson(node: MoveNode, review: MoveReview | undefined, lesson: ReturnType<typeof explainMove> | undefined): void {
  const el = $('lesson');
  const ply = node.ply;
  if (!ply || !lesson) {
    el.replaceChildren(
      h('p', 'muted', game.root.children.length ? 'Start position. Press ▶ to go through the game.' : 'Start position.'),
    );
    return;
  }
  const header = h('div', 'lesson-head', h('strong', 'lesson-move', moveName(ply)));
  if (!game.isMainLine(node)) header.append(h('span', 'in-variation', 'variation'));
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
    const pv = review?.before.pv ?? [];
    if (pv.length && node.parent) {
      const play = h('button', 'play-line', `▶ Play the ${lesson.better.san} line`);
      play.title = 'Add the engine line as a variation and step through it';
      play.addEventListener('click', () => playEngineLine(node.parent!, pv));
      parts.push(play);
    }
  }
  const bad = review && ['inaccuracy', 'mistake', 'blunder'].includes(review.classification);
  if (bad) {
    parts.push(
      h('p', 'lesson-legend', h('span', 'arrow-key green', ''), ' better move ', h('span', 'arrow-key red', ''), ' the reply it allows'),
    );
  }
  if (!review) {
    parts.push(
      h('p', 'muted', engineState === 'failed' ? 'No engine verdict: the engine is unavailable.' : 'The engine is looking at this move…'),
    );
  }
  if (ply.comment) parts.push(h('blockquote', 'pgn-comment', ply.comment));
  el.replaceChildren(...parts);
}

function renderEvalBar(): void {
  const current = analyzer.get(game.fen());
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

/** The graph follows the main line; inside a variation its cursor stays where the variation branches off. */
function renderGraph(): void {
  const nodes = [game.root, ...game.mainLine()];
  const points: GraphPoint[] = nodes.map(n => {
    const e = analyzer.get(n.ply?.fenAfter ?? game.startFen);
    return {
      value: e ? winChance(e.score) : undefined,
      score: e ? formatScore(e.score) : undefined,
      label: n.ply ? moveName(n.ply) : 'Start',
      mark: reviewOf(n)?.classification,
    };
  });
  let branch = game.node;
  while (!game.isMainLine(branch) && branch.parent) branch = branch.parent;
  graph.update(points, game.path(branch).length);
}

function renderAnalysisControls(): void {
  const btn = $<HTMLButtonElement>('analyze');
  const main = game.mainLine();
  const allDone = game.root.children.length > 0 && game.allNodes().every(reviewOf);
  btn.disabled = engineState !== 'ready' || analyzing || game.root.children.length === 0;
  btn.textContent = analyzing ? 'Analyzing…' : allDone ? 'Re-analyze' : 'Analyze game';
  $<HTMLSelectElement>('depth').disabled = analyzing;
  $('progress').hidden = !analyzing;

  // accuracy is about the game as played: the main line only
  const summaryEl = $('summary');
  const mainReviews = main.map(reviewOf);
  if (analyzing || main.length === 0 || !mainReviews.every(Boolean)) {
    summaryEl.hidden = true;
    return;
  }
  const s = summarize(mainReviews, firstMover());
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
  const atStart = !game.node.ply;
  const atEnd = game.node.children.length === 0;
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
  persist();
}

/** Adds the engine's line as a variation after `from` and goes to its first move. */
function playEngineLine(from: MoveNode, pv: string[]): void {
  const first = game.addLine(from, pv.slice(0, 10));
  if (!first) return;
  goTo(first);
  persist();
  toast('Engine line added as a variation. Press ▶ to play it move by move.');
}

/** Goes to a node, or to the n-th position of the main line. */
function goTo(target: MoveNode | number): void {
  game.goTo(target);
  render();
}

function step(action: 'back' | 'forward' | 'toStart' | 'toEnd'): void {
  game[action]();
  render();
}

// ---------- controls ----------

function flip(): void {
  orientation = orientation === 'white' ? 'black' : 'white';
  render();
}

$('nav-start').addEventListener('click', () => step('toStart'));
$('nav-prev').addEventListener('click', () => step('back'));
$('nav-next').addEventListener('click', () => step('forward'));
$('nav-end').addEventListener('click', () => step('toEnd'));
$('promote-line').addEventListener('click', () => {
  game.makeMainLine(game.node);
  render();
  persist();
  toast('This line is now the main line.');
});
$('delete-line').addEventListener('click', () => {
  const node = game.node;
  if (game.isMainLine(node) && !confirm(`Delete ${moveName(node.ply!)} and every move after it from the game?`)) return;
  game.deleteFrom(node);
  render();
  persist();
});
$('save-game').addEventListener('click', () => {
  const main = game.mainLine();
  try {
    const [saved] = library.add([
      {
        pgn: game.pgn(),
        white: game.headers.White ?? 'White',
        black: game.headers.Black ?? 'Black',
        result: game.headers.Result ?? '*',
        date: new Date().toISOString().slice(0, 10),
        event: 'Analysis board',
        moves: main.length,
      },
    ]);
    currentGameId = saved.id;
    persist();
    render();
    toast('Saved to My games.');
  } catch (err) {
    toast((err as Error).message);
  }
});
$('flip').addEventListener('click', flip);
$('analyze').addEventListener('click', () => void analyzeGame());
$('show-best').addEventListener('change', () => render());
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
  if (currentView !== 'review' || document.querySelector('dialog[open]')) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const actions: Record<string, () => void> = {
    ArrowLeft: () => step('back'),
    ArrowRight: () => step('forward'),
    Home: () => step('toStart'),
    End: () => step('toEnd'),
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

window.addEventListener('hashchange', route);
// the last live evaluations are still waiting in persistSoon's timer
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && persist());
route();

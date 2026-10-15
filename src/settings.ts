/** Appearance settings, kept in this browser. */
export interface Settings {
  theme: 'system' | 'light' | 'dark';
  /** A board preset id, or 'custom' to use `customBoard`. */
  board: string;
  customBoard: { light: string; dark: string };
  accent: string;
  coordinates: boolean;
  /** A piece set id from PIECE_SETS. */
  pieces: string;
}

/** Piece sets: cburnett ships with chessground; the others are in public/pieces (see CREDITS.md there). */
export const PIECE_SETS: { id: string; name: string }[] = [
  { id: 'cburnett', name: 'Classic' },
  { id: 'merida', name: 'Merida' },
  { id: 'chessnut', name: 'Chessnut' },
  { id: 'mpchess', name: 'MPChess' },
  { id: 'fantasy', name: 'Fantasy' },
  { id: 'celtic', name: 'Celtic' },
  { id: 'spatial', name: 'Spatial' },
  { id: 'rhosgfx', name: 'RhosGFX' },
  { id: 'pixel', name: 'Pixel' },
];

const PIECE_FILES = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];

/** URL of one piece image, e.g. pieceUrl('merida', 'wN'). Not used for cburnett, which chessground embeds. */
export function pieceUrl(set: string, file: string): string {
  return `${import.meta.env.BASE_URL}pieces/${set}/${file}.svg`;
}

export const BOARDS: { id: string; name: string; light: string; dark: string }[] = [
  { id: 'brown', name: 'Brown', light: '#f0d9b5', dark: '#b58863' },
  { id: 'blue', name: 'Blue', light: '#dee3e6', dark: '#8ca2ad' },
  { id: 'green', name: 'Green', light: '#ffffdd', dark: '#86a666' },
  { id: 'grey', name: 'Grey', light: '#e4e4e4', dark: '#a8a8a8' },
  { id: 'purple', name: 'Purple', light: '#e5daf0', dark: '#9f90b0' },
  { id: 'ice', name: 'Ice', light: '#e8edf9', dark: '#b7c0d8' },
];

/** Accent colors: a light-theme and a dark-theme shade of each, both readable with their button text. */
export const ACCENTS: { id: string; name: string; light: string; dark: string }[] = [
  { id: 'green', name: 'Green', light: '#6f8f3a', dark: '#86a84a' },
  { id: 'blue', name: 'Blue', light: '#2f6fb0', dark: '#6aa6e0' },
  { id: 'purple', name: 'Purple', light: '#7a52b3', dark: '#a98ad8' },
  { id: 'orange', name: 'Orange', light: '#b4581b', dark: '#e8925a' },
  { id: 'teal', name: 'Teal', light: '#1f7a72', dark: '#4fb8ad' },
];

const KEY = 'chess-trainer:settings';

export const DEFAULTS: Settings = {
  theme: 'system',
  board: 'brown',
  customBoard: { light: '#f0d9b5', dark: '#b58863' },
  accent: 'green',
  coordinates: true,
  pieces: 'cburnett',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    return { ...DEFAULTS, ...saved, customBoard: { ...DEFAULTS.customBoard, ...saved.customBoard } };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable: the choice lasts until the page is closed
  }
}

export function boardColors(settings: Settings): { light: string; dark: string } {
  if (settings.board === 'custom') return settings.customBoard;
  return BOARDS.find(b => b.id === settings.board) ?? BOARDS[0];
}

/** An 8×8 checkerboard as an SVG data URL; a8 (top left) is a light square. */
export function boardImage(light: string, dark: string): string {
  let squares = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2 === 1) squares += `M${x} ${y}h1v1h-1z`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges"><rect width="8" height="8" fill="${light}"/><path fill="${dark}" d="${squares}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Applies the settings to the page: theme attribute and the CSS variables used by the board and accent. */
export function applySettings(settings: Settings): void {
  const root = document.documentElement;
  if (settings.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = settings.theme;

  const { light, dark } = boardColors(settings);
  root.style.setProperty('--sq-light', light);
  root.style.setProperty('--sq-dark', dark);
  root.style.setProperty('--board-image', boardImage(light, dark));

  const accent = ACCENTS.find(a => a.id === settings.accent) ?? ACCENTS[0];
  root.style.setProperty('--accent-l', accent.light);
  root.style.setProperty('--accent-d', accent.dark);

  // Another piece set: data-pieces switches on the CSS rules that read --piece-wK, --piece-bN, ...
  const set = PIECE_SETS.some(p => p.id === settings.pieces) ? settings.pieces : 'cburnett';
  if (set === 'cburnett') {
    delete root.dataset.pieces;
  } else {
    root.dataset.pieces = set;
    for (const f of PIECE_FILES) root.style.setProperty(`--piece-${f}`, `url("${pieceUrl(set, f)}")`);
  }
}

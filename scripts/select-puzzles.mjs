// Selects a balanced set of puzzles from the Lichess puzzle database (CC0):
// about 6 per 100 rating points between 900 and 2100, in each of 16 themes, among well-tested
// puzzles (rating deviation ≤ 80, popularity ≥ 85, at least 2000 plays). Every solution is replayed with chess.js.
//
// Download https://database.lichess.org/lichess_db_puzzle.csv.zst, then run (with fzstd and chess.js installed):
//   node scripts/select-puzzles.mjs lichess_db_puzzle.csv.zst src/puzzles/data.json
import { createReadStream, writeFileSync } from 'node:fs';
import { Decompress } from 'fzstd';
import { Chess } from 'chess.js';

const [, , input, output] = process.argv;

const THEMES = [
  'fork', 'pin', 'skewer', 'discoveredAttack', 'doubleCheck', 'backRankMate', 'mateIn1', 'mateIn2',
  'hangingPiece', 'trappedPiece', 'sacrifice', 'deflection', 'attraction', 'defensiveMove', 'promotion', 'quietMove',
];
const MIN = 900, MAX = 2100, BUCKET = 100, PER_BUCKET = 6;
const buckets = (MAX - MIN) / BUCKET;

// deterministic random numbers, so the selection is reproducible
let seed = 20261016;
const random = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

// reservoir per theme and rating bucket
const reservoirs = new Map(); // key "theme:bucket" → { seen, items }
let header, rest = '', total = 0, kept = 0;

function consider(line) {
  if (!header) { header = line.split(','); return; }
  total++;
  const f = line.split(',');
  const rating = Number(f[3]), rd = Number(f[4]), popularity = Number(f[5]), plays = Number(f[6]);
  if (rating < MIN || rating >= MAX || rd > 80 || popularity < 85 || plays < 2000) return;
  const themes = f[7].split(' ');
  const b = Math.floor((rating - MIN) / BUCKET);
  for (const t of themes) {
    if (!THEMES.includes(t)) continue;
    const key = `${t}:${b}`;
    let r = reservoirs.get(key);
    if (!r) reservoirs.set(key, (r = { seen: 0, items: [] }));
    r.seen++;
    const item = { id: f[0], fen: f[1], moves: f[2], rating, themes: themes.filter(x => THEMES.includes(x)) };
    if (r.items.length < PER_BUCKET) r.items.push(item);
    else {
      const j = Math.floor(random() * r.seen);
      if (j < PER_BUCKET) r.items[j] = item;
    }
  }
}

const decoder = new TextDecoder();
const stream = new Decompress((chunk, final) => {
  const text = rest + decoder.decode(chunk, { stream: !final });
  const lines = text.split('\n');
  rest = lines.pop();
  for (const l of lines) if (l) consider(l);
  if (final && rest) consider(rest);
});

createReadStream(input, { highWaterMark: 1 << 20 })
  .on('data', d => stream.push(new Uint8Array(d)))
  .on('end', () => {
    stream.push(new Uint8Array(0), true);
    // merge, dedupe, and check every solution with chess.js
    const byId = new Map();
    for (const r of reservoirs.values()) for (const p of r.items) byId.set(p.id, p);
    const out = [];
    let illegal = 0;
    for (const p of byId.values()) {
      const c = new Chess(p.fen);
      try {
        for (const u of p.moves.split(' ')) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      } catch { illegal++; continue; }
      out.push([p.id, p.fen, p.moves, p.rating, p.themes.join(' ')]);
      kept++;
    }
    out.sort((a, b) => a[3] - b[3]);
    writeFileSync(output, JSON.stringify(out));
    const perTheme = Object.fromEntries(THEMES.map(t => [t, out.filter(p => p[4].split(' ').includes(t)).length]));
    console.log(JSON.stringify({ total, kept, illegal, buckets, perTheme }, null, 1));
  });

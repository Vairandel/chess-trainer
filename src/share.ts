/**
 * Receiving a PGN from another app's share menu (Android: "Share" in the chess.com app → Chess Trainer).
 * The service worker gets the shared text or file (manifest "share_target"), keeps it in the
 * "share-inbox" cache and opens #games/shared; the app then takes it from there.
 */

export const SHARE_CACHE = 'share-inbox';
export const SHARE_KEY = '/__shared';

export type Shared = { kind: 'pgn'; pgn: string } | { kind: 'link'; url: string } | { kind: 'nothing' };

const HEADER = /\[\w+\s+"[^"]*"\]/;
const MOVES = /(^|[\s\]])1\.\s*(?:[a-h][1-8]|[NBRQK][a-h1-8x]|O-O)/;

/** Puts back the line breaks some apps remove: one header per line, a blank line before the moves. */
function reflow(pgn: string): string {
  return pgn.replace(/"\]\s*\[/g, '"]\n[').replace(/"\]\s*(?=1\.)/, '"]\n\n');
}

/**
 * Finds the PGN among what was shared: a file, the text, the title or a link. Apps often add words
 * around it ("Check out this game: ..."), so the PGN starts at its first header or at "1.".
 */
export function pickPgn(parts: string[]): Shared {
  for (const part of parts) {
    const header = part.search(HEADER);
    if (header >= 0 && MOVES.test(part)) return { kind: 'pgn', pgn: reflow(part.slice(header).trim()) };
  }
  for (const part of parts) {
    const m = MOVES.exec(part);
    if (m) return { kind: 'pgn', pgn: part.slice(m.index + m[1].length).trim() };
  }
  const link = parts.map(p => /https?:\/\/\S+/.exec(p)?.[0]).find(Boolean);
  return link ? { kind: 'link', url: link } : { kind: 'nothing' };
}

/** Takes what the service worker received (once: it is removed). */
export async function takeShared(): Promise<Shared> {
  if (!('caches' in window)) return { kind: 'nothing' };
  const cache = await caches.open(SHARE_CACHE);
  const response = await cache.match(SHARE_KEY);
  if (!response) return { kind: 'nothing' };
  await cache.delete(SHARE_KEY);
  const { parts } = (await response.json()) as { parts: string[] };
  return pickPgn(parts);
}

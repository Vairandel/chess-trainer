import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/** Every piece set (about 450 KB in all), so any set and the Settings previews work offline. */
const PIECES = readdirSync(new URL('./public/pieces/', import.meta.url), { withFileTypes: true })
  .filter(d => d.isDirectory())
  .flatMap(d => readdirSync(new URL(`./public/pieces/${d.name}/`, import.meta.url)).filter(f => f.endsWith('.svg')).map(f => `pieces/${d.name}/${f}`));

/** Public files the app needs offline, besides the bundle. (The slower asm.js engine is cached on first use.) */
const PUBLIC_PRECACHE = [
  'theme-init.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'engine/stockfish-19-lite-single.js',
  'engine/stockfish-19-lite-single.wasm',
  ...PIECES,
];

/** Writes dist/sw.js from scripts/sw-template.js, with the build's files and a version that changes with them. */
function serviceWorker(): Plugin {
  return {
    name: 'chess-trainer-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const hash = createHash('sha256');
      const files: string[] = [];
      for (const [name, item] of Object.entries(bundle)) {
        if (name.endsWith('.map')) continue;
        if (name !== 'index.html') files.push(`/${name}`);
        hash.update(name).update(item.type === 'chunk' ? item.code : item.source);
      }
      for (const name of PUBLIC_PRECACHE) {
        files.push(`/${name}`);
        hash.update(name).update(readFileSync(new URL(`./public/${name}`, import.meta.url)));
      }
      const template = readFileSync(new URL('./scripts/sw-template.js', import.meta.url), 'utf8');
      // the page itself is cached under "/" (Cloudflare Pages redirects /index.html to /)
      const source = template
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__PRECACHE__', JSON.stringify(['/', ...files.sort()], null, 2));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [serviceWorker()],
});

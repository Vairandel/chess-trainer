// Renders the app icons (public/icons/*.png) from the SVG sources, with Edge through playwright-core.
// Usage: npm i --no-save playwright-core && node scripts/make-icons.mjs
// (or set PLAYWRIGHT to the path of an installed playwright-core entry file).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const pw = await import(process.env.PLAYWRIGHT ? pathToFileURL(process.env.PLAYWRIGHT).href : 'playwright-core');
const chromium = pw.chromium ?? pw.default.chromium;
const dir = new URL('../public/icons/', import.meta.url);
const icons = [
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['icon-maskable.svg', 'icon-maskable-512.png', 512],
  // iOS adds its own rounded corners, so the touch icon is the full-bleed version
  ['icon-maskable.svg', 'apple-touch-icon.png', 180],
];

const browser = await chromium.launch({ channel: 'msedge', headless: true });
for (const [source, target, size] of icons) {
  const svg = readFileSync(new URL(source, dir), 'utf8');
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: new URL(target, dir).pathname.replace(/^\/([A-Za-z]:)/, '$1'), omitBackground: true });
  await page.close();
  console.log(`${target} (${size}×${size})`);
}
await browser.close();

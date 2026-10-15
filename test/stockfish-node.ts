import { copyFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { UciTransport } from '../src/engine';

/**
 * Runs public/engine/stockfish-19-lite-single.js under Node, for tests.
 * The build is a CommonJS script, but this package is "type": "module", so it is copied
 * (with its .wasm, which it loads from its own folder) to a temp dir as .cjs first.
 */
export function nodeStockfish(): UciTransport {
  const engineDir = resolve(import.meta.dirname, '../public/engine');
  const dir = mkdtempSync(join(tmpdir(), 'sf-'));
  copyFileSync(join(engineDir, 'stockfish-19-lite-single.wasm'), join(dir, 'stockfish-19-lite-single.wasm'));
  copyFileSync(join(engineDir, 'stockfish-19-lite-single.js'), join(dir, 'stockfish-19-lite-single.cjs'));
  const engine = createRequire(import.meta.url)(join(dir, 'stockfish-19-lite-single.cjs'))();
  const listeners: ((line: string) => void)[] = [];
  engine.listener = (line: string) => listeners.forEach(l => l(line));
  return {
    send: command => engine.processCommand(command),
    onLine: listener => listeners.push(listener),
    terminate: () => engine.terminate(),
  };
}

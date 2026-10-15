/** A line of output from a UCI engine, and a way to send it commands. */
export interface UciTransport {
  send(command: string): void;
  onLine(listener: (line: string) => void): void;
  terminate(): void;
}

/** One principal variation. Scores are from the side to move's point of view, as UCI reports them. */
export interface EngineLine {
  multipv: number;
  depth: number;
  cp?: number;
  /** Moves to mate; negative means the side to move gets mated. 0 means it is already mated. */
  mate?: number;
  pv: string[];
}

export interface EngineResult {
  depth: number;
  lines: EngineLine[];
  bestmove?: string;
}

export interface SearchOptions {
  depth: number;
  multipv?: number;
  /** Hard time limit per position, in ms. */
  movetime?: number;
}

/** Parses a UCI "info" line. Returns undefined for lines without a score and a pv (e.g. currmove updates). */
export function parseInfo(line: string): EngineLine | undefined {
  if (!line.startsWith('info ') || !line.includes(' pv ')) return undefined;
  const tokens = line.split(' ');
  const out: EngineLine = { multipv: 1, depth: 0, pv: [] };
  for (let i = 1; i < tokens.length; i++) {
    switch (tokens[i]) {
      case 'depth':
        out.depth = Number(tokens[++i]);
        break;
      case 'multipv':
        out.multipv = Number(tokens[++i]);
        break;
      case 'score': {
        const kind = tokens[++i];
        const value = Number(tokens[++i]);
        if (kind === 'cp') out.cp = value;
        else if (kind === 'mate') out.mate = value;
        // a following "lowerbound"/"upperbound" marks an unreliable score
        if (tokens[i + 1] === 'lowerbound' || tokens[i + 1] === 'upperbound') return undefined;
        break;
      }
      case 'pv':
        out.pv = tokens.slice(i + 1);
        i = tokens.length;
        break;
    }
  }
  if (out.cp === undefined && out.mate === undefined) return undefined;
  return out;
}

/**
 * A UCI engine with a promise API. Searches run one at a time, in the order they were asked for.
 */
export class Engine {
  private listeners = new Set<(line: string) => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private multipv = 1;
  private ready: Promise<void>;

  constructor(private transport: UciTransport) {
    transport.onLine(line => this.listeners.forEach(l => l(line)));
    this.ready = this.handshake();
  }

  private waitFor(prefix: string, timeoutMs = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error(`The engine did not answer (waiting for "${prefix}").`));
      }, timeoutMs);
      const listener = (line: string) => {
        if (!line.startsWith(prefix)) return;
        clearTimeout(timer);
        this.listeners.delete(listener);
        resolve(line);
      };
      this.listeners.add(listener);
    });
  }

  private async handshake(): Promise<void> {
    const ok = this.waitFor('uciok');
    ok.catch(() => {}); // if loading fails first, the later uciok timeout must not surface as unhandled
    // A worker that fails to load reports an "error ..." line; fail at once instead of timing out.
    let onError: (line: string) => void = () => {};
    const failed = new Promise<never>((_, reject) => {
      onError = line => line.startsWith('error ') && reject(new Error(line.slice(6) || 'The engine failed to load.'));
      this.listeners.add(onError);
    });
    this.transport.send('uci');
    try {
      await Promise.race([ok, failed]);
    } finally {
      this.listeners.delete(onError);
    }
    await this.isReady();
  }

  private async isReady(): Promise<void> {
    const ok = this.waitFor('readyok');
    this.transport.send('isready');
    await ok;
  }

  /** Resolves once the engine has started, rejects if it never does. */
  whenReady(): Promise<void> {
    return this.ready;
  }

  /** Searches a position. `onUpdate` receives the best lines so far, after each completed depth. */
  analyze(fen: string, options: SearchOptions, onUpdate?: (result: EngineResult) => void): Promise<EngineResult> {
    const run = async (): Promise<EngineResult> => {
      await this.ready;
      const multipv = options.multipv ?? 1;
      if (multipv !== this.multipv) {
        this.transport.send(`setoption name MultiPV value ${multipv}`);
        this.multipv = multipv;
        await this.isReady();
      }
      const lines = new Map<number, EngineLine>();
      let depth = 0;
      const snapshot = (): EngineResult => ({
        depth,
        lines: [...lines.values()].sort((a, b) => a.multipv - b.multipv),
      });
      const listener = (line: string) => {
        const info = parseInfo(line);
        if (!info) return;
        // a new depth starts with multipv 1; report the finished previous depth
        if (info.multipv === 1 && info.depth > depth && lines.size > 0) onUpdate?.(snapshot());
        lines.set(info.multipv, info);
        depth = Math.max(depth, info.depth);
      };
      this.listeners.add(listener);
      const done = this.waitFor('bestmove', (options.movetime ?? 30000) + 30000);
      this.transport.send(`position fen ${fen}`);
      this.transport.send(`go depth ${options.depth}${options.movetime ? ` movetime ${options.movetime}` : ''}`);
      const last = await done.finally(() => this.listeners.delete(listener));
      const bestmove = last.split(' ')[1];
      const result = { ...snapshot(), bestmove: bestmove && bestmove !== '(none)' ? bestmove : undefined };
      onUpdate?.(result);
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Stops the current search early; its promise still resolves with what was found. */
  stop(): void {
    this.transport.send('stop');
  }

  terminate(): void {
    this.transport.terminate();
  }
}

/**
 * Starts Stockfish in a worker: the WebAssembly build, or the slower asm.js build if that fails.
 * Rejects if neither starts.
 */
export async function loadStockfish(baseUrl: string): Promise<{ engine: Engine; name: string }> {
  const builds = [
    { file: 'stockfish-19-lite-single.js', name: 'Stockfish 19 (lite)' },
    { file: 'stockfish-19-asm.js', name: 'Stockfish 19 (compatibility mode, slower)' },
  ];
  for (const build of builds) {
    let engine: Engine | undefined;
    try {
      engine = new Engine(workerTransport(baseUrl + build.file));
      await engine.whenReady();
      return { engine, name: build.name };
    } catch (err) {
      console.warn(`Could not start ${build.file}:`, err);
      engine?.terminate();
    }
  }
  throw new Error('The engine could not start in this browser.');
}

/** Runs a stockfish.js build in a Web Worker. */
export function workerTransport(url: string): UciTransport {
  const worker = new Worker(url);
  const listeners: ((line: string) => void)[] = [];
  worker.onmessage = e => {
    const data = String(e.data);
    for (const line of data.split('\n')) if (line) listeners.forEach(l => l(line));
  };
  worker.onerror = e => listeners.forEach(l => l(`error ${e.message}`));
  return {
    send: command => worker.postMessage(command),
    onLine: listener => listeners.push(listener),
    terminate: () => worker.terminate(),
  };
}

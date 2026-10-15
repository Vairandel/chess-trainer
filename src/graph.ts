import type { Classification } from './review';

export interface GraphPoint {
  /** White's win chance in this position, -1..1; undefined while not analyzed yet. */
  value?: number;
  /** "12...Nxe4" — the move that led here ("Start" for position 0). */
  label: string;
  /** Formatted evaluation, e.g. "+0.8". */
  score?: string;
  /** Classification of the move that led here. */
  mark?: Classification;
}

const MARKED: Partial<Record<Classification, string>> = { inaccuracy: '?!', mistake: '?', blunder: '??' };
const NAMES: Partial<Record<Classification, string>> = { inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder' };
const SVG = 'http://www.w3.org/2000/svg';
const PAD_Y = 6;

/**
 * Evaluation graph: one point per position, White's advantage above the middle line.
 * Hover shows the move and score; click selects the position.
 */
export class EvalGraph {
  private svg = document.createElementNS(SVG, 'svg');
  private tip = document.createElement('div');
  private points: GraphPoint[] = [];
  private cursor = 0;
  private hover?: number;

  constructor(private root: HTMLElement, private onSelect: (index: number) => void) {
    root.classList.add('graph');
    this.svg.setAttribute('role', 'img');
    this.tip.className = 'graph-tip';
    this.tip.hidden = true;
    root.append(this.svg, this.tip);

    root.addEventListener('pointermove', e => this.setHover(this.indexAt(e.clientX)));
    root.addEventListener('pointerleave', () => this.setHover(undefined));
    root.addEventListener('click', e => {
      const i = this.indexAt(e.clientX);
      if (i !== undefined) this.onSelect(i);
    });
    new ResizeObserver(() => this.draw()).observe(root);
  }

  update(points: GraphPoint[], cursor: number): void {
    this.points = points;
    this.cursor = cursor;
    this.root.hidden = points.length < 2 || !points.some(p => p.value !== undefined);
    this.draw();
  }

  private indexAt(clientX: number): number | undefined {
    if (this.points.length < 2) return undefined;
    const box = this.root.getBoundingClientRect();
    const t = (clientX - box.left) / box.width;
    return Math.max(0, Math.min(this.points.length - 1, Math.round(t * (this.points.length - 1))));
  }

  private setHover(i: number | undefined): void {
    if (i === this.hover) return;
    this.hover = i;
    this.draw();
  }

  private draw(): void {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    const n = this.points.length;
    if (!w || !h || n < 2) {
      this.svg.replaceChildren();
      return;
    }
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.svg.setAttribute('width', String(w));
    this.svg.setAttribute('height', String(h));
    const x = (i: number) => (i / (n - 1)) * w;
    const y = (v: number) => PAD_Y + ((1 - v) / 2) * (h - 2 * PAD_Y);
    const mid = y(0);

    const parts: SVGElement[] = [];
    const el = (tag: string, attrs: Record<string, string | number>) => {
      const e = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      parts.push(e);
      return e;
    };

    // Contiguous analyzed runs; unanalyzed positions leave a gap.
    const runs: number[][] = [];
    let run: number[] = [];
    this.points.forEach((p, i) => {
      if (p.value === undefined) {
        if (run.length) runs.push(run);
        run = [];
      } else run.push(i);
    });
    if (run.length) runs.push(run);

    for (const r of runs) {
      const line = r.map(i => `${x(i).toFixed(1)},${y(this.points[i].value!).toFixed(1)}`).join(' L');
      const area = `M${x(r[0]).toFixed(1)},${mid} L${line} L${x(r[r.length - 1]).toFixed(1)},${mid} Z`;
      // the same area, clipped to each half, gives White's and Black's fills
      el('path', { d: area, class: 'g-white', 'clip-path': 'url(#g-top)' });
      el('path', { d: area, class: 'g-black', 'clip-path': 'url(#g-bottom)' });
      el('path', { d: `M${line}`, class: 'g-line' });
    }

    el('line', { x1: 0, x2: w, y1: mid, y2: mid, class: 'g-mid' });
    el('line', { x1: x(this.cursor), x2: x(this.cursor), y1: 0, y2: h, class: 'g-cursor' });
    if (this.hover !== undefined && this.hover !== this.cursor) {
      el('line', { x1: x(this.hover), x2: x(this.hover), y1: 0, y2: h, class: 'g-hover' });
    }

    this.points.forEach((p, i) => {
      if (p.value === undefined || !p.mark || !MARKED[p.mark]) return;
      el('circle', { cx: x(i), cy: y(p.value), r: 4.5, class: `g-mark ${p.mark}` });
    });

    const defs = document.createElementNS(SVG, 'defs');
    defs.innerHTML =
      `<clipPath id="g-top"><rect x="0" y="0" width="${w}" height="${mid}"/></clipPath>` +
      `<clipPath id="g-bottom"><rect x="0" y="${mid}" width="${w}" height="${h - mid}"/></clipPath>`;
    this.svg.replaceChildren(defs, ...parts);

    const marks = this.points.filter(p => p.mark && MARKED[p.mark]).length;
    this.svg.setAttribute('aria-label', `Evaluation graph over ${n - 1} moves, ${marks} marked errors. Click a point to go to that move.`);
    this.drawTip(x, y);
  }

  private drawTip(x: (i: number) => number, y: (v: number) => number): void {
    const i = this.hover;
    const p = i === undefined ? undefined : this.points[i];
    if (i === undefined || !p) {
      this.tip.hidden = true;
      return;
    }
    const mark = p.mark && MARKED[p.mark] ? ` · ${NAMES[p.mark]} ${MARKED[p.mark]}` : '';
    this.tip.textContent = `${p.label}${p.score ? ` · ${p.score}` : ''}${mark}`;
    this.tip.hidden = false;
    const w = this.root.clientWidth;
    const tipW = this.tip.offsetWidth;
    const left = Math.max(0, Math.min(w - tipW, x(i) - tipW / 2));
    this.tip.style.left = `${left}px`;
    const py = p.value === undefined ? this.root.clientHeight / 2 : y(p.value);
    this.tip.style.top = py < this.root.clientHeight / 2 ? `${py + 10}px` : `${py - this.tip.offsetHeight - 10}px`;
  }
}

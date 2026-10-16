import { h } from './dom';
import { OPENINGS, type OpeningChapter } from './study/openings';
import { chapterLines, lastChapter, loadProgress, openingStats, studiedTraps, type Status } from './study/progress';
import { TRAPS, type Trap } from './study/traps';

export type LibraryTab = 'openings' | 'traps';

const SECTIONS: { id: OpeningChapter['section']; title: string; short: string }[] = [
  { id: 'white', title: 'White — Nf3, d4, g3, Bg2, c4', short: 'White' },
  { id: 'black-e4', title: 'Black vs 1.e4 — Alekhine Defense', short: 'Alekhine' },
  { id: 'black-d4', title: "Black vs 1.d4 — Queen's Gambit Declined", short: 'QGD' },
];

const STATUS_LABEL: Record<'all' | Status, string> = { all: 'All', new: 'Not started', started: 'In progress', done: 'Done' };

/**
 * The Study library: tabs (Openings / Traps), a "Continue" box, a progress overview, and a
 * searchable, filterable list. The frame is built once; typing in the search field only
 * redraws the results, so the field keeps its focus.
 */
export class StudyLibrary {
  private tab: LibraryTab = 'openings';
  private query = '';
  private side: 'all' | 'w' | 'b' = 'all';
  private status: 'all' | Status = 'all';
  private built = false;
  private results = h('div', 'lib-results');
  private continueBox = h('section', 'lib-continue');
  private overview = h('section', 'lib-overview');
  private statusGroup = h('div', 'segmented lib-filter');

  constructor(private root: HTMLElement) {}

  show(tab: LibraryTab): void {
    if (!this.built) this.build();
    // filters belong to a tab: a "Studied" filter on traps would hide every opening
    if (tab !== this.tab) this.resetFilters();
    this.tab = tab;
    this.root.querySelectorAll<HTMLAnchorElement>('.lib-tabs a').forEach(a => {
      if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    this.renderStatusFilter();
    this.renderContinue();
    this.renderOverview();
    this.renderResults();
  }

  // ---------- the frame ----------

  private build(): void {
    this.built = true;
    const tab = (id: LibraryTab, label: string) => {
      const a = h('a', '', label) as HTMLAnchorElement;
      a.href = `#study/${id}`;
      a.dataset.tab = id;
      return a;
    };
    const tabs = h(
      'nav',
      'lib-tabs',
      tab('openings', 'Openings'),
      tab('traps', 'Traps'),
      h('span', 'soon', 'Famous games ', h('small', '', 'soon')),
    );
    tabs.setAttribute('aria-label', 'Study sections');

    const search = h('input', 'lib-search') as HTMLInputElement;
    search.type = 'search';
    search.placeholder = 'Search: Catalan, f7, London…';
    search.setAttribute('aria-label', 'Search chapters');
    search.addEventListener('input', () => {
      this.query = search.value.trim().toLowerCase();
      this.renderResults();
    });

    const sideGroup = this.radioGroup('lib-side', [['all', 'All'], ['w', 'White'], ['b', 'Black']], this.side, v => {
      this.side = v as typeof this.side;
      this.renderResults();
    });
    sideGroup.setAttribute('aria-label', 'Side');
    this.statusGroup.setAttribute('aria-label', 'Status');

    const toolbar = h('div', 'lib-toolbar', search, sideGroup, this.statusGroup);
    this.root.replaceChildren(tabs, this.continueBox, this.overview, toolbar, this.results);
  }

  private radioGroup(name: string, options: [string, string][], current: string, onChange: (v: string) => void): HTMLElement {
    const group = h('div', 'segmented lib-filter');
    group.setAttribute('role', 'radiogroup');
    for (const [value, label] of options) {
      const input = h('input', '') as HTMLInputElement;
      input.type = 'radio';
      input.name = name;
      input.value = value;
      input.checked = value === current;
      input.addEventListener('change', () => onChange(value));
      group.append(h('label', '', input, ` ${label}`));
    }
    return group;
  }

  private renderStatusFilter(): void {
    const options = (this.tab === 'traps' ? ['all', 'new', 'done'] : ['all', 'new', 'started', 'done']) as ('all' | Status)[];
    const labels: [string, string][] = options.map(o => [o, this.tab === 'traps' && o === 'done' ? 'Studied' : STATUS_LABEL[o]]);
    const fresh = this.radioGroup('lib-status', labels, this.status, v => {
      this.status = v as typeof this.status;
      this.renderResults();
    });
    this.statusGroup.replaceChildren(...fresh.childNodes);
  }

  // ---------- continue + overview ----------

  private renderContinue(): void {
    const parts: HTMLElement[] = [];
    const last = lastChapter();
    const lastTitle = OPENINGS.find(o => o.id === last)?.title ?? TRAPS.find(t => t.id === last)?.title;
    if (last && lastTitle) parts.push(h('p', 'lib-continue-last', 'Continue: ', link(`#study/${last}`, lastTitle)));

    const progress = loadProgress();
    const due = OPENINGS.map(o => ({ o, stats: openingStats(chapterLines(o), progress[o.id] ?? {}) }))
      .filter(x => x.stats.due > 0)
      .sort((a, b) => b.stats.due - a.stats.due)
      .slice(0, 3);
    if (due.length) {
      parts.push(
        h('p', 'lib-continue-title', 'To review'),
        h(
          'ul',
          'lib-due',
          ...due.map(({ o, stats }) =>
            h('li', '', link(`#study/${o.id}/practice`, o.title), h('span', 'muted', ` — ${stats.due} line${stats.due > 1 ? 's' : ''} to practise again`)),
          ),
        ),
      );
    }
    this.continueBox.replaceChildren(...parts);
    this.continueBox.hidden = parts.length === 0;
  }

  private renderOverview(): void {
    if (this.tab === 'openings') {
      const progress = loadProgress();
      this.overview.replaceChildren(
        ...SECTIONS.map(s => {
          let learned = 0;
          let total = 0;
          for (const o of OPENINGS.filter(x => x.section === s.id)) {
            const st = openingStats(chapterLines(o), progress[o.id] ?? {});
            learned += st.learned;
            total += st.total;
          }
          return statBox(s.short, learned, total, 'lines learned');
        }),
      );
    } else {
      const studied = new Set(studiedTraps());
      const count = (group: Trap['group']) => {
        const list = TRAPS.filter(t => t.group === group);
        return [list.filter(t => studied.has(t.id)).length, list.length] as const;
      };
      const [mine, mineTotal] = count('your-openings');
      const [classic, classicTotal] = count('classic');
      this.overview.replaceChildren(
        statBox('In my openings', mine, mineTotal, 'studied'),
        statBox('Classic traps', classic, classicTotal, 'studied'),
      );
    }
  }

  // ---------- results ----------

  private matches(text: string, side: 'w' | 'b', status: Status): boolean {
    if (this.query && !text.toLowerCase().includes(this.query)) return false;
    if (this.side !== 'all' && side !== this.side) return false;
    if (this.status !== 'all' && status !== this.status) return false;
    return true;
  }

  private renderResults(): void {
    const groups = this.tab === 'openings' ? this.openingGroups() : this.trapGroups();
    const visible = groups.filter(g => g.rows.length);
    if (visible.length === 0) {
      const clear = h('button', '', 'Clear filters');
      clear.addEventListener('click', () => this.clearFilters());
      this.results.replaceChildren(h('div', 'lib-empty', h('p', '', 'No chapter matches.'), clear));
      return;
    }
    this.results.replaceChildren(
      ...visible.map(g => h('section', 'lib-group', h('h2', '', g.title), h('ul', 'lib-rows', ...g.rows))),
    );
  }

  private openingGroups(): { title: string; rows: HTMLElement[] }[] {
    const progress = loadProgress();
    return SECTIONS.map(s => ({
      title: s.title,
      rows: OPENINGS.filter(o => o.section === s.id)
        .map(o => ({ o, stats: openingStats(chapterLines(o), progress[o.id] ?? {}) }))
        .filter(({ o, stats }) => this.matches(`${o.title} ${o.summary} ${o.plans.join(' ')}`, o.you, stats.status))
        .map(({ o, stats }) =>
          row(
            `#study/${o.id}`,
            o.title,
            o.summary,
            h(
              'span',
              'lib-progress',
              bar(stats.learned, stats.total),
              h('span', 'lib-progress-text', `${stats.learned} / ${stats.total} lines`),
            ),
          ),
        ),
    }));
  }

  private trapGroups(): { title: string; rows: HTMLElement[] }[] {
    const studied = new Set(studiedTraps());
    const group = (g: Trap['group'], title: string) => ({
      title,
      rows: TRAPS.filter(t => t.group === g)
        .filter(t => this.matches(`${t.title} ${t.opening} ${t.summary}`, t.you, studied.has(t.id) ? 'done' : 'new'))
        .map(t =>
          row(
            `#study/${t.id}`,
            t.title,
            t.opening,
            h(
              'span',
              'lib-tags',
              h('span', `chip ${t.you === 'w' ? 'chip-white' : 'chip-black'}`, `You: ${t.you === 'w' ? 'White' : 'Black'}`),
              h('span', `chip ${t.role === 'set' ? 'chip-set' : 'chip-avoid'}`, t.role === 'set' ? 'Trap to set' : 'Trap to avoid'),
              studied.has(t.id) ? h('span', 'lib-studied', '✓ studied') : h('span', ''),
            ),
          ),
        ),
    });
    return [group('your-openings', 'In my openings'), group('classic', 'Classic traps')];
  }

  private resetFilters(): void {
    this.query = '';
    this.side = 'all';
    this.status = 'all';
    const search = this.root.querySelector<HTMLInputElement>('.lib-search');
    if (search) search.value = '';
    this.root.querySelectorAll<HTMLInputElement>('input[name="lib-side"], input[name="lib-status"]').forEach(i => (i.checked = i.value === 'all'));
  }

  private clearFilters(): void {
    this.resetFilters();
    this.renderResults();
  }
}

// ---------- small pieces ----------

function link(href: string, text: string): HTMLAnchorElement {
  const a = h('a', '', text) as HTMLAnchorElement;
  a.href = href;
  return a;
}

function bar(value: number, total: number): HTMLElement {
  const fill = h('span', 'lib-bar-fill');
  fill.style.width = `${total ? (100 * value) / total : 0}%`;
  const el = h('span', 'lib-bar', fill);
  el.setAttribute('role', 'progressbar');
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', String(total));
  el.setAttribute('aria-valuenow', String(value));
  return el;
}

function statBox(label: string, value: number, total: number, unit: string): HTMLElement {
  return h('div', 'lib-stat', h('span', 'lib-stat-label', label), bar(value, total), h('span', 'lib-stat-value', `${value} / ${total} ${unit}`));
}

function row(href: string, title: string, sub: string, right: HTMLElement): HTMLElement {
  const a = link(href, '');
  a.className = 'lib-row';
  a.append(h('span', 'lib-row-main', h('span', 'lib-row-title', title), h('span', 'lib-row-sub', sub)), right);
  return h('li', '', a);
}

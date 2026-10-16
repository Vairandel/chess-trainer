import { h } from './dom';
import type { Game, MoveNode, Ply } from './game';

export interface MoveListOptions {
  onSelect: (node: MoveNode) => void;
  /** Adds marks to a move button (e.g. ?! glyphs in Review). */
  decorate?: (node: MoveNode, button: HTMLElement) => void;
  emptyText: string;
  /** Marks moves that have a comment with 💬 (off where every move has one). Default true. */
  markComments?: boolean;
}

/**
 * Draws a game's move tree: the main line in two columns. After a move that has alternatives,
 * the alternatives are listed underneath, indented, each as a line of text that can hold further
 * (nested) variations in parentheses — like on Lichess.
 */
export function renderMoveTree(list: HTMLElement, game: Game, options: MoveListOptions): void {
  list.replaceChildren();
  const button = (node: MoveNode, label = node.ply!.san) => {
    const btn = h('button', 'move', label);
    options.decorate?.(node, btn);
    if (node.ply!.comment && options.markComments !== false) btn.classList.add('has-comment');
    if (node === game.node) btn.classList.add('current');
    btn.addEventListener('click', () => options.onSelect(node));
    return btn;
  };

  /** Appends `first` and its continuation; alternatives go in parentheses right after the move they replace. */
  const appendLine = (el: HTMLElement, first: MoveNode) => {
    el.append(button(first, numberedSan(first, true)));
    let needNumber = false;
    for (let parent = first; parent.children.length; ) {
      const [next, ...alternatives] = parent.children;
      el.append(button(next, numberedSan(next, needNumber)));
      needNumber = false;
      for (const alt of alternatives) {
        el.append(h('span', 'paren', '('));
        appendLine(el, alt);
        el.append(h('span', 'paren', ')'));
        needNumber = true;
      }
      parent = next;
    }
  };

  let row: HTMLElement | undefined;
  for (let parent = game.root; parent.children.length; parent = parent.children[0]) {
    const [main, ...alternatives] = parent.children;
    const ply = main.ply!;
    if (ply.color === 'w' || !row) {
      row = h('li', '', h('span', 'num', `${moveNumber(ply)}.`));
      if (ply.color === 'b') row.append(h('span', 'move placeholder', '…'));
      list.append(row);
    }
    row.append(button(main));
    if (alternatives.length) {
      if (ply.color === 'w') row.append(h('span', 'move placeholder', ''));
      const block = h('li', 'variations');
      for (const alt of alternatives) {
        const line = h('div', 'variation');
        appendLine(line, alt);
        block.append(line);
      }
      list.append(block);
      row = undefined; // the main line resumes on a new row, with its move number
    }
  }

  if (game.root.children.length === 0) list.append(h('li', 'empty', options.emptyText));
  keepCurrentMoveVisible(list, game.cursor === 0);
}

function moveNumber(ply: Ply): string {
  return ply.fenBefore.split(' ')[5];
}

/** "6. Nc3", "6...Nf6" when a black move needs its number, otherwise just "Nf6". */
function numberedSan(node: MoveNode, forceNumber: boolean): string {
  const ply = node.ply!;
  const n = moveNumber(ply);
  return ply.color === 'w' ? `${n}. ${ply.san}` : forceNumber ? `${n}...${ply.san}` : ply.san;
}

/**
 * Scrolls the move list (only the list, never the page) so the current move is visible.
 * scrollIntoView() would also scroll the page, which made the screen jump on phones.
 */
function keepCurrentMoveVisible(list: HTMLElement, atStart: boolean): void {
  const current = list.querySelector<HTMLElement>('.current');
  if (!current) {
    if (atStart) list.scrollTop = 0;
    return;
  }
  const top = current.offsetTop;
  const bottom = top + current.offsetHeight;
  if (top < list.scrollTop) list.scrollTop = top - 4;
  else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 4;
}

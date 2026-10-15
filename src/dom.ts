import type { Color } from '@lichess-org/chessground/types';
import type { PromotionPiece } from './game';

/** Small page helpers shared by the views. */

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Builds an element with text content (never HTML, so PGN text can't inject markup). */
export function h(tag: string, className: string, ...children: (Node | string)[]): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  e.append(...children);
  return e;
}

/** A decorative image (its meaning is given by the text next to it). */
export function img(src: string): HTMLImageElement {
  const i = document.createElement('img');
  i.src = src;
  i.alt = '';
  return i;
}

let toastTimer: number | undefined;
export function toast(message: string): void {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 3000);
}

/** Asks which piece a pawn promotes to. Resolves undefined if the dialog is dismissed. */
export function askPromotion(color: Color): Promise<PromotionPiece | undefined> {
  const dialog = $<HTMLDialogElement>('promo-dialog');
  const box = $('promo-choices');
  const roles: [PromotionPiece, string][] = [['q', 'queen'], ['r', 'rook'], ['b', 'bishop'], ['n', 'knight']];
  return new Promise(resolve => {
    let choice: PromotionPiece | undefined;
    box.replaceChildren(
      ...roles.map(([p, role]) => {
        const btn = document.createElement('button');
        btn.className = 'promo-piece';
        btn.setAttribute('aria-label', role);
        btn.title = role[0].toUpperCase() + role.slice(1);
        const piece = document.createElement('piece');
        piece.className = `${role} ${color}`;
        btn.append(piece);
        btn.addEventListener('click', () => {
          choice = p;
          dialog.close();
        });
        return btn;
      }),
    );
    dialog.addEventListener('close', () => resolve(choice), { once: true });
    dialog.showModal();
  });
}

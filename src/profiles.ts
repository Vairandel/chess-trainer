import { api, ApiError, type ProfileInfo } from './api';
import { h } from './dom';
import {
  flush,
  forgetProfile,
  getAccount,
  guestKeys,
  guestQuestionAsked,
  moveGuestWork,
  msSinceLastPull,
  onSyncStatus,
  pendingCount,
  pull,
  setAccount,
  syncStatus,
  type SyncStatus,
} from './store';

/**
 * Profiles, Netflix-style: "Who's training?" with a card per profile (each locked by a 4-digit PIN)
 * and a Guest card. This runs before the app starts (see boot.ts), so the app always opens on the
 * right person's data.
 */

/** Whether this site has a profile server (not on the dev server, or when offline at start). */
export let profilesAvailable = false;
/** How many profiles exist (with none, there is nothing to switch to: no account button). */
let profileCount = 0;

/** Keys that are only preferences: on their own, they are not "work" worth moving into a profile. */
const PREFERENCE_KEYS = ['settings', 'analysis-depth'];

const timeout = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

/** Decides who is training, and brings the profile's data up to date. Never throws. */
export async function startAccount(): Promise<void> {
  const current = getAccount();
  if (current?.kind === 'profile') {
    try {
      const { profile } = await timeout(api.me(), 5000).catch(err => {
        throw err instanceof ApiError ? err : new ApiError(0, 'No answer.');
      });
      profilesAvailable = true;
      setAccount({ kind: 'profile', profile });
      await timeout(pull(), 10_000).catch(() => {});
      return;
    } catch (err) {
      // offline: work on this device's copy; changes sync later
      if ((err as ApiError).status !== 401) return;
      // the session ended (30 days, a new PIN, or the profile was deleted)
      return askAgain(current.profile);
    }
  }
  let list: ProfileInfo[];
  try {
    list = (await timeout(api.profiles(), 5000)).profiles;
    profilesAvailable = true;
    profileCount = list.length;
  } catch {
    return; // no profile server here: Guest
  }
  if (current?.kind === 'guest' || list.length === 0) return;
  // the admin page has its own password: no need to choose a profile to manage them
  if (location.hash.startsWith('#admin')) return;
  await showPicker(list);
}

async function askAgain(profile: ProfileInfo): Promise<void> {
  let list: ProfileInfo[];
  try {
    list = (await api.profiles()).profiles;
    profilesAvailable = true;
  } catch {
    return;
  }
  const still = list.find(p => p.id === profile.id);
  if (!still) {
    forgetProfile(profile.id);
    setAccount(null);
    if (list.length) await showPicker(list, undefined, `The profile ${profile.name} was deleted.`);
    return;
  }
  await showPicker(list, still, 'Your session ended. Enter your PIN again.');
}

function avatar(p: { avatar: string; color: string }, className = 'avatar'): HTMLElement {
  const a = h('span', className, p.avatar);
  a.style.background = p.color;
  a.setAttribute('aria-hidden', 'true');
  return a;
}

/** The full-screen picker. Resolves once someone is chosen (a profile with its PIN, or Guest). */
export function showPicker(list: ProfileInfo[], preselect?: ProfileInfo, message?: string): Promise<void> {
  return new Promise(resolve => {
    const overlay = h('div', 'picker');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Choose a profile');
    document.body.append(overlay);
    document.body.classList.add('picking');
    let keyHandler: ((e: KeyboardEvent) => void) | undefined;
    const setKeys = (handler?: (e: KeyboardEvent) => void) => {
      if (keyHandler) document.removeEventListener('keydown', keyHandler);
      keyHandler = handler;
      if (handler) document.addEventListener('keydown', handler);
    };
    const done = () => {
      setKeys();
      overlay.remove();
      document.body.classList.remove('picking');
      resolve();
    };

    const showList = (note?: string) => {
      setKeys();
      const cards = list.map(p => {
        const b = h('button', 'picker-card', avatar(p), h('span', 'picker-name', p.name), h('span', 'picker-sub', '🔒 PIN'));
        b.addEventListener('click', () => showPin(p));
        return b;
      });
      const guest = h(
        'button',
        'picker-card guest',
        avatar({ avatar: '👤', color: 'var(--surface-2)' }),
        h('span', 'picker-name', 'Guest'),
        h('span', 'picker-sub', 'Saved on this device only'),
      );
      guest.addEventListener('click', () => {
        setAccount({ kind: 'guest' });
        done();
      });
      const box = h('div', 'picker-box', h('h1', '', "Who's training?"), h('div', 'picker-cards', ...cards, guest));
      if (note) box.insertBefore(h('p', 'picker-msg', note), box.children[1]);
      overlay.replaceChildren(box);
      (cards[0] ?? guest).focus();
    };

    const showPin = (profile: ProfileInfo, note = '') => {
      let pin = '';
      let busy = false;
      const dots = h('div', 'pin-dots');
      const msg = h('p', 'picker-msg', note);
      msg.setAttribute('role', 'alert');
      const drawDots = () => dots.replaceChildren(...[0, 1, 2, 3].map(i => h('span', i < pin.length ? 'filled' : '')));
      drawDots();

      const press = (key: string) => {
        if (busy) return;
        if (key === 'back') pin = pin.slice(0, -1);
        else if (pin.length < 4) pin += key;
        drawDots();
        if (pin.length === 4) void submit();
      };
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'].map(k => {
        if (!k) return h('span', '');
        const b = h('button', 'pin-key', k === 'back' ? '⌫' : k);
        b.setAttribute('aria-label', k === 'back' ? 'Delete' : k);
        b.addEventListener('click', () => press(k));
        return b;
      });
      const pad = h('div', 'pin-pad', ...keys);
      const setDisabled = (on: boolean) => pad.querySelectorAll('button').forEach(b => ((b as HTMLButtonElement).disabled = on));

      const submit = async () => {
        busy = true;
        msg.textContent = '';
        try {
          const { profile: signedIn } = await api.login(profile.id, pin);
          setAccount({ kind: 'profile', profile: signedIn });
          msg.textContent = 'Loading your work…';
          await timeout(pull(), 15_000).catch(() => {});
          return afterSignIn(signedIn);
        } catch (err) {
          const e = err as ApiError;
          pin = '';
          drawDots();
          dots.classList.remove('shake');
          void dots.offsetWidth; // restart the animation
          dots.classList.add('shake');
          if (e.status === 401) {
            const left = Number(e.body.triesLeft ?? 0);
            msg.textContent = `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left before a lock.`;
          } else if (e.status === 423) {
            msg.textContent = e.message;
            setDisabled(true);
          } else if (e.status === 404) {
            list = list.filter(p => p.id !== profile.id);
            return showList(e.message);
          } else if (e.status === 0) {
            msg.textContent = 'No connection. Try again, or continue as Guest.';
          } else {
            msg.textContent = e.message;
          }
        } finally {
          busy = false;
        }
      };

      const back = h('button', 'link-button', '← Other profiles');
      back.addEventListener('click', () => showList());
      overlay.replaceChildren(
        h('div', 'picker-box pin-box', avatar(profile, 'avatar big'), h('h1', '', profile.name), h('p', 'muted', 'Enter your PIN'), dots, msg, pad, back),
      );
      setKeys(e => {
        if (/^[0-9]$/.test(e.key)) press(e.key);
        else if (e.key === 'Backspace') press('back');
        else if (e.key === 'Escape') showList();
        else return;
        e.preventDefault();
      });
      (pad.querySelector('button') as HTMLButtonElement).focus();
    };

    /** Offers to bring this device's guest work into the profile, once per profile and device. */
    const afterSignIn = (profile: ProfileInfo) => {
      const work = guestKeys().filter(k => !PREFERENCE_KEYS.includes(k));
      if (work.length === 0 || guestQuestionAsked(profile.id)) return done();
      setKeys();
      const move = h('button', 'primary', 'Move it here');
      const keep = h('button', '', 'Keep it separate');
      move.addEventListener('click', () => {
        moveGuestWork();
        guestQuestionAsked(profile.id, true);
        void flush();
        done();
      });
      keep.addEventListener('click', () => {
        guestQuestionAsked(profile.id, true);
        done();
      });
      overlay.replaceChildren(
        h(
          'div',
          'picker-box',
          avatar(profile, 'avatar big'),
          h('h1', '', `Welcome, ${profile.name}`),
          h('p', '', 'This device has work saved as Guest (games, progress, puzzle rating…). Move it into your profile?'),
          h('p', 'muted', 'Your profile keeps its own data where both have something; saved games are put together.'),
          h('div', 'picker-actions', move, keep),
        ),
      );
      move.focus();
    };

    if (preselect) showPin(preselect, message);
    else showList(message);
  });
}

// ---------------------------------------------------------------- once the app runs

const STATUS_TEXT: Record<SyncStatus, string> = {
  synced: 'All changes saved',
  pending: 'Saving…',
  offline: 'Offline: changes will sync later',
  'signed-out': 'Signed out: enter your PIN to sync',
  error: 'Sync problem: will try again',
};

/** The account button in the header, the Settings card, and syncing while the app is open. */
export function startSync(): void {
  const account = getAccount();
  const settingsCard = document.getElementById('profile-card');
  if (settingsCard) settingsCard.hidden = !profilesAvailable && account?.kind !== 'profile';
  const info = document.getElementById('profile-info');
  if (info) {
    info.textContent =
      account?.kind === 'profile'
        ? `Signed in as ${account.profile.name}. Your work is saved online and follows you on every device.`
        : 'You are using Guest: your work is saved on this device only.';
  }
  if (profileCount === 0 && account?.kind !== 'profile') return;

  mountAccountButton();

  if (account?.kind !== 'profile') return;
  if (pendingCount()) void flush();
  window.addEventListener('online', () => void flush());
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') {
      void flush(true);
    } else if (msSinceLastPull() > 2 * 60_000) {
      try {
        if ((await pull()) > 0) offerReload();
      } catch {
        // offline: try again next time
      }
    }
  });
}

function offerReload(): void {
  if (document.querySelector('.update-bar')) return;
  const button = h('button', 'primary', 'Reload');
  button.addEventListener('click', () => location.reload());
  const bar = h('div', 'update-bar', h('span', '', 'Your work changed on another device.'), button);
  bar.setAttribute('role', 'status');
  document.body.append(bar);
}

function mountAccountButton(): void {
  const account = getAccount();
  const header = document.querySelector('header.top')!;
  const who = account?.kind === 'profile' ? account.profile : { name: 'Guest', avatar: '👤', color: 'var(--surface-2)' };
  const button = h('button', 'account-btn', avatar(who, 'avatar small'));
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', `${who.name}: profile menu`);
  button.title = who.name;
  const dot = h('span', 'sync-dot');
  if (account?.kind === 'profile') button.append(dot);
  const showStatus = (s: SyncStatus) => (dot.dataset.status = s);
  showStatus(syncStatus());
  onSyncStatus(showStatus);

  const menu = h('div', 'account-menu');
  menu.hidden = true;
  const close = () => {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    const status = h('p', 'muted small', account?.kind === 'profile' ? STATUS_TEXT[syncStatus()] : 'Saved on this device only');
    const sw = h('button', '', 'Switch profile');
    sw.addEventListener('click', async () => {
      await flush();
      setAccount(null);
      location.reload();
    });
    const items: HTMLElement[] = [h('div', 'account-who', avatar(who), h('strong', '', who.name)), status, sw];
    if (account?.kind === 'profile') {
      if (syncStatus() === 'signed-out') {
        const again = h('button', 'primary', 'Enter my PIN');
        again.addEventListener('click', () => location.reload());
        items.splice(2, 0, again);
      }
      const out = h('button', '', 'Sign out');
      out.addEventListener('click', async () => {
        const result = await flush();
        if (pendingCount() && !confirm(`Some changes are not saved online yet (${STATUS_TEXT[result]}). Sign out and lose them?`)) return;
        await api.logout().catch(() => {});
        forgetProfile(account.profile.id);
        setAccount(null);
        location.reload();
      });
      items.push(out);
    }
    menu.replaceChildren(...items);
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  };
  button.addEventListener('click', e => {
    e.stopPropagation();
    if (menu.hidden) open();
    else close();
  });
  document.addEventListener('click', e => {
    if (!menu.hidden && !menu.contains(e.target as Node)) close();
  });
  document.addEventListener('keydown', e => e.key === 'Escape' && close());
  const wrap = h('div', 'account', button, menu);
  header.insertBefore(wrap, header.querySelector('.settings-link'));
}

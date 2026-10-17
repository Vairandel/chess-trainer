import { h } from './dom';

/**
 * Registers the service worker (production builds only), which makes the app installable and usable offline.
 * When a new version has been downloaded, a bar offers to reload into it.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // the first install takes control silently; only an accepted update reloads
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  // the app starts after the profile check (boot.ts), often after "load" has fired
  const whenLoaded = (run: () => void) => (document.readyState === 'complete' ? run() : window.addEventListener('load', run));
  whenLoaded(async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
        });
      });
      // an installed app can stay open for days: look for a new version now and then
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    } catch (err) {
      console.warn('Service worker not registered:', err);
    }
  });
}

function offerUpdate(worker: ServiceWorker): void {
  if (document.querySelector('.update-bar')) return;
  const button = h('button', 'primary', 'Reload');
  button.addEventListener('click', () => worker.postMessage('skip-waiting'));
  const bar = h('div', 'update-bar', h('span', '', 'A new version is available.'), button);
  bar.setAttribute('role', 'status');
  document.body.append(bar);
}

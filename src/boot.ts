import './style.css';
import { h } from './dom';
import { startAccount, startSync } from './profiles';

// Who is training is decided first (profile picker, PIN, latest data from the server),
// so that the app reads the right person's data from its first line.
void (async () => {
  // usually instant; on a slow connection, say what is happening
  const loading = h('div', 'boot-loading', 'Loading…');
  const timer = setTimeout(() => !document.querySelector('.picker') && document.body.append(loading), 400);
  await startAccount();
  clearTimeout(timer);
  loading.remove();
  await import('./main');
  startSync();
})();

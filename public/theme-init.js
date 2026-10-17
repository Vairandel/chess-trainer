// Applies the saved light/dark choice before the page paints, so it never flashes the other theme.
// A plain file (not inline) so the Content-Security-Policy can forbid inline scripts.
// The settings belong to the active profile (see src/store.ts), or to Guest.
try {
  const active = JSON.parse(localStorage.getItem('chess-trainer:active') || 'null');
  const prefix = active && active.kind === 'profile' ? 'chess-trainer:p:' + active.profile.id + ':' : 'chess-trainer:';
  const theme = JSON.parse(localStorage.getItem(prefix + 'settings') || '{}').theme;
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {}

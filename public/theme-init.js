// Applies the saved light/dark choice before the page paints, so it never flashes the other theme.
// A plain file (not inline) so the Content-Security-Policy can forbid inline scripts.
try {
  const theme = JSON.parse(localStorage.getItem('chess-trainer:settings') || '{}').theme;
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {}

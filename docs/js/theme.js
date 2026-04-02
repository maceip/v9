/**
 * Theme switcher — crayon in bottom-left corner of terminal frame.
 * Cycles terminal colors (bg, fg, cursor, selection) via postMessage to the
 * iframe.  The webpage itself stays on the default midnight theme.
 * Persists choice to localStorage.
 */

const THEMES = [
  { id: 'midnight',        label: 'Midnight',          crayon: '#ffffff',
    term: { background: '#1a1b26', foreground: '#a9b1d6', cursor: '#c0caf5', selectionBackground: '#33467c' } },
  { id: 'bone',            label: 'Bone (light)',       crayon: '#00034a',
    term: { background: '#e8e4de', foreground: '#2e2e2e', cursor: '#00034a', selectionBackground: '#c4bfb6' } },
  { id: 'solarized-light', label: 'Solarized Light',    crayon: '#268bd2',
    term: { background: '#fdf6e3', foreground: '#657b83', cursor: '#268bd2', selectionBackground: '#eee8d5' } },
  { id: 'solarized-dark',  label: 'Solarized Dark',     crayon: '#b58900',
    term: { background: '#002b36', foreground: '#839496', cursor: '#b58900', selectionBackground: '#073642' } },
  { id: 'catppuccin',      label: 'Catppuccin Mocha',   crayon: '#cba6f7',
    term: { background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#cba6f7', selectionBackground: '#313244' } },
  { id: 'tokyo-night',     label: 'Tokyo Night',        crayon: '#7aa2f7',
    term: { background: '#1a1b26', foreground: '#a9b1d6', cursor: '#7aa2f7', selectionBackground: '#292e42' } },
  { id: 'dracula',         label: 'Dracula',            crayon: '#ff5555',
    term: { background: '#282a36', foreground: '#f8f8f2', cursor: '#ff5555', selectionBackground: '#44475a' } },
  { id: 'ember',           label: 'Ember',              crayon: '#ff9a3c',
    term: { background: '#1a1210', foreground: '#e8d5c4', cursor: '#ff9a3c', selectionBackground: '#3d2a1e' } },
  { id: 'gruvbox',         label: 'Gruvbox',            crayon: '#b8bb26',
    term: { background: '#282828', foreground: '#ebdbb2', cursor: '#b8bb26', selectionBackground: '#3c3836' } },
  { id: 'lumon',           label: 'Lumon Severance',    crayon: '#6fb8e3',
    term: { background: '#1b2d40', foreground: '#d6e2ee', cursor: '#6fb8e3', selectionBackground: '#355066' } },
];

let currentIdx = 0;

export function initThemeSwitcher() {
  const crayon = document.getElementById('theme-crayon');
  if (!crayon) return;

  // Restore saved theme
  const saved = localStorage.getItem('v9-theme');
  if (saved) {
    const found = THEMES.findIndex(t => t.id === saved);
    if (found >= 0) {
      currentIdx = found;
      applyCrayon(THEMES[currentIdx]);
      sendTermTheme(THEMES[currentIdx]);
    }
  }

  crayon.addEventListener('click', (e) => {
    e.stopPropagation();
    currentIdx = (currentIdx + 1) % THEMES.length;
    const theme = THEMES[currentIdx];
    applyCrayon(theme);
    sendTermTheme(theme);
    localStorage.setItem('v9-theme', theme.id);
    crayon.title = `Theme: ${theme.label} (click to cycle)`;
  });

  crayon.title = `Theme: ${THEMES[currentIdx].label} (click to cycle)`;

  // When iframe loads, send it the current theme
  const cliFrame = document.getElementById('cli-frame');
  if (cliFrame) {
    const observer = new MutationObserver(() => {
      if (cliFrame.classList.contains('visible')) {
        sendTermTheme(THEMES[currentIdx]);
      }
    });
    observer.observe(cliFrame, { attributes: true, attributeFilter: ['class'] });
  }
}

function applyCrayon(theme) {
  // Only change the crayon color, not the whole webpage
  document.documentElement.style.setProperty('--crayon', theme.crayon);
}

function sendTermTheme(theme) {
  const cliFrame = document.getElementById('cli-frame');
  if (cliFrame?.contentWindow) {
    try {
      cliFrame.contentWindow.postMessage({
        type: 'v9:set-theme',
        theme: theme.term,
      }, '*');
    } catch { /* cross-origin */ }
  }
}

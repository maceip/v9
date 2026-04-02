/**
 * Theme switcher — crayon in bottom-left corner of terminal frame.
 * Cycles through themes on click, persists choice to localStorage.
 */

const THEMES = [
  { id: 'midnight',         label: 'Midnight' },
  { id: 'bone',             label: 'Bone (light)' },
  { id: 'solarized-light',  label: 'Solarized Light' },
  { id: 'solarized-dark',   label: 'Solarized Dark' },
  { id: 'catppuccin',       label: 'Catppuccin Mocha' },
  { id: 'tokyo-night',      label: 'Tokyo Night' },
  { id: 'lumon',            label: 'Lumon Severance' },
];

export function initThemeSwitcher() {
  const crayon = document.getElementById('theme-crayon');
  if (!crayon) return;

  let idx = 0;

  // Restore saved theme
  const saved = localStorage.getItem('v9-theme');
  if (saved) {
    const found = THEMES.findIndex(t => t.id === saved);
    if (found >= 0) {
      idx = found;
      applyTheme(THEMES[idx].id);
    }
  }

  crayon.addEventListener('click', (e) => {
    e.stopPropagation();
    idx = (idx + 1) % THEMES.length;
    applyTheme(THEMES[idx].id);
    localStorage.setItem('v9-theme', THEMES[idx].id);
  });

  // Tooltip on hover
  crayon.title = `Theme: ${THEMES[idx].label} (click to cycle)`;
  crayon.addEventListener('click', () => {
    crayon.title = `Theme: ${THEMES[idx].label} (click to cycle)`;
  });
}

function applyTheme(id) {
  document.documentElement.setAttribute('data-theme', id);

  // Update light class for components that check it
  const isLight = id === 'bone' || id === 'solarized-light';
  document.documentElement.classList.toggle('light', isLight);
}

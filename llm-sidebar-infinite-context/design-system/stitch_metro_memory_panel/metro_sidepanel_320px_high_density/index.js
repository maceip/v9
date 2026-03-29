/**
 * Metro Side-Panel — Design System Entry Point
 * Exports the SidePanel API and injects styles.
 */

import { SidePanel } from './sidepanel-api.js';

// Auto-inject CSS when this module loads in a browser context
function injectStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('mp-design-tokens')) return;

  const base = new URL('.', import.meta.url).href;

  const tokens = document.createElement('link');
  tokens.id = 'mp-design-tokens';
  tokens.rel = 'stylesheet';
  tokens.href = base + 'tokens.css';

  const panel = document.createElement('link');
  panel.id = 'mp-panel-styles';
  panel.rel = 'stylesheet';
  panel.href = base + 'panel.css';

  document.head.append(tokens, panel);
}

injectStyles();

export { SidePanel };
export default SidePanel;

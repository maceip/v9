/**
 * v9 — Main application controller.
 *
 * Two terminals side-by-side:
 *   - Left:  Interactive shell (web/index.html?autorun=0)
 *   - Right: Claude Code CLI (web/index.html?bundle=...&autorun=1)
 *
 * State machine per terminal: IDLE → ZOOMING → RUNNING ⇄ IDLE
 *
 * Clicking either terminal zooms BOTH into full split-screen.
 * Escape/swipe dismisses BOTH back to idle pair.
 */

import { NavFluid } from './fluid.js';
import { GlassScene } from './glass.js';
import { ZoomController } from './zoom.js';
import { initIcons } from './icons.js';
import { SwipeDismiss, swipeParams } from './swipe.js';
import { TacticalHUD } from './hud.js';
import { initThemeSwitcher } from './theme.js';
import { DPad } from './dpad.js';

// ── DOM refs ──
const navbar = document.getElementById('navbar');
const navFluidCanvas = document.getElementById('nav-fluid');
const progressBar = document.getElementById('progress-bar');
const fog = document.getElementById('fog');
const spotlight = document.getElementById('spotlight');

let fluid = null;

// ── Theme detection ──
const isDark = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  if (isDark.matches) {
    document.documentElement.classList.remove('light');
  } else {
    document.documentElement.classList.add('light');
  }
  for (const term of terminals) {
    if (term.glass) term.glass.isDark = isDark.matches;
  }
}

// ── Progress bar ──
function setProgress(pct) {
  progressBar.style.width = `${pct}%`;
  if (pct >= 100) setTimeout(() => { progressBar.style.opacity = '0'; }, 600);
}
setProgress(25);

// ── Navbar fluid flourish ──
try {
  fluid = new NavFluid(navFluidCanvas);
  setProgress(50);
} catch (e) { setProgress(50); }

navbar.addEventListener('mouseenter', () => {
  if (fluid) { fluid.start(); navbar.classList.add('fluid-active'); }
});
navbar.addEventListener('mouseleave', () => {
  navbar.classList.remove('fluid-active');
  setTimeout(() => { if (fluid && !navbar.classList.contains('fluid-active')) fluid.stop(); }, 2000);
});
navbar.addEventListener('mousemove', (e) => {
  if (!fluid || !fluid.active) return;
  const rect = navbar.getBoundingClientRect();
  fluid.onMouse((e.clientX - rect.left) / rect.width, 1.0 - (e.clientY - rect.top) / rect.height);
});

// ── Helpers ──
function siteRootPrefix() {
  let p = new URL(window.location.href).pathname;
  if (p.endsWith('/index.html')) p = p.slice(0, -'/index.html'.length);
  if (!p.endsWith('/')) p += '/';
  return p;
}

function anthropicProxyForCLIiframe() {
  try {
    const q = new URL(window.location.href).searchParams.get('proxy');
    if (q) return q;
  } catch { /* ignore */ }
  for (const key of ['__V9_ANTHROPIC_FETCH_PROXY__', '__V9_PAGES_ANTHROPIC_PROXY__']) {
    const v = globalThis[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function buildShellURL() {
  const root = siteRootPrefix();
  const base = `${window.location.origin}${root}`;
  return new URL('web/index.html?autorun=0', base).href;
}

function buildClaudeURL() {
  const root = siteRootPrefix();
  const bundlePath = `${root.replace(/\/$/, '')}/dist/claude-code-cli.js`;
  const base = `${window.location.origin}${root}`;
  const u = new URL(`web/index.html?bundle=${encodeURIComponent(bundlePath)}&autorun=1`, base);
  const proxy = anthropicProxyForCLIiframe();
  if (proxy) u.searchParams.set('proxy', proxy);
  return u.href;
}

async function urlReachable(url) {
  try { const r = await fetch(url, { method: 'HEAD', mode: 'same-origin' }); return r.ok || r.status === 405; }
  catch { return false; }
}

// ── Terminal factory ──
// Each terminal has its own DOM elements, glass scene, zoom controller, iframe state.
function createTerminal({ wrapId, frameId, screenId, glassCanvasId, overlayId, bootTextId, iframeId, urlBuilder, title }) {
  const term = {
    wrap: document.getElementById(wrapId),
    frame: document.getElementById(frameId),
    screen: document.getElementById(screenId),
    glassCanvas: document.getElementById(glassCanvasId),
    overlay: document.getElementById(overlayId),
    bootText: document.getElementById(bootTextId),
    iframe: document.getElementById(iframeId),
    glass: null,
    zoom: null,
    loaded: false,
    state: 'IDLE', // per-terminal state: IDLE | ZOOMING | RUNNING | UNAVAILABLE
    urlBuilder,
    title,
  };

  // Glass scene for this terminal
  try {
    term.glass = new GlassScene(term.glassCanvas);
    term.glass.isDark = isDark.matches;
    term.glass.start();
  } catch (e) { /* glass optional */ }

  // Resize glass when the screen element changes size
  const resizeGlass = () => { if (term.glass) term.glass.resize(); };
  new ResizeObserver(resizeGlass).observe(term.screen);

  // Zoom controller — per terminal
  term.zoom = new ZoomController(term.wrap, {
    onComplete: (direction) => {
      if (direction === 'in') {
        if (term.glass) { term.glass.fog = 0; term.glass.glassBlur = 0; term.glass.stop(); }
        if (!term.loaded) loadIframe(term);
        try { term.iframe.contentWindow?.postMessage({ type: 'v9:refit' }, '*'); } catch {}
      } else if (direction === 'out') {
        term.wrap.classList.add('idle');
      }
    },
    onProgress: (p, direction) => {
      if (direction === 'out') {
        if (term.glass) {
          term.glass.fog = 0.12 * (1.0 - p);
          term.glass.glassBlur = 0.4 * (1.0 - p * 0.9);
        }
        return;
      }
      if (term.glass) {
        const glassFade = p < 0.8 ? p * 0.3 : 0.24 + (p - 0.8) * 3.8;
        term.glass.fog = 0.12 * (1.0 - Math.min(1, glassFade));
        term.glass.glassBlur = 0.4 * (1.0 - Math.min(1, glassFade));
      }
    },
  });

  return term;
}

// ── Load iframe for a terminal (lazy, on first zoom-in) ──
async function loadIframe(term) {
  if (term.loaded) return;

  let url = term.iframe.src;
  if (!url) {
    const built = term.urlBuilder();
    if (!(await urlReachable(built))) {
      showRuntimeUnavailable(term);
      return;
    }
    term.iframe.src = built;
    url = built;
  }

  // Wait for iframe to load
  await new Promise(resolve => {
    try {
      if (term.iframe.contentDocument && term.iframe.contentDocument.readyState === 'complete') {
        return resolve();
      }
    } catch { /* cross-origin */ }
    term.iframe.addEventListener('load', resolve, { once: true });
  });

  term.loaded = true;
  term.iframe.classList.add('visible');
  if (term.bootText) term.bootText.style.display = 'none';

  try { term.iframe.contentWindow.postMessage({ type: 'v9:refit' }, '*'); } catch {}
  setTimeout(() => {
    try { term.iframe.contentWindow.postMessage({ type: 'v9:refit' }, '*'); } catch {}
  }, 200);
}

function showRuntimeUnavailable(term) {
  term.state = 'UNAVAILABLE';
  const panel = document.createElement('div');
  panel.className = 'boot-line visible';
  panel.style.cssText = 'margin-top:16px;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,120,120,0.45);background:rgba(80,10,10,0.22);max-width:560px';
  const title = document.createElement('div');
  title.style.cssText = 'color:#ff8a8a;font-family:IBM Plex Mono,monospace;font-size:13px;letter-spacing:0.06em;margin-bottom:8px';
  title.textContent = 'RUNTIME UNAVAILABLE';
  panel.appendChild(title);
  const detail = document.createElement('div');
  detail.style.cssText = 'font-family:IBM Plex Mono,monospace;font-size:14px;line-height:1.6;color:var(--fg)';
  detail.textContent = `The ${term.title} iframe could not be reached. Ensure wasm and bundle are built.`;
  panel.appendChild(detail);
  if (term.bootText) term.bootText.appendChild(panel);
}

// ── Create the two terminals ──
const shellTerm = createTerminal({
  wrapId: 'terminal-wrap',
  frameId: 'terminal-frame',
  screenId: 'terminal-screen',
  glassCanvasId: 'glass-canvas',
  overlayId: 'terminal-overlay',
  bootTextId: 'boot-text',
  iframeId: 'cli-frame',
  urlBuilder: buildShellURL,
  title: 'shell',
});

const claudeTerm = createTerminal({
  wrapId: 'terminal-wrap-2',
  frameId: 'terminal-frame-2',
  screenId: 'terminal-screen-2',
  glassCanvasId: 'glass-canvas-2',
  overlayId: 'terminal-overlay-2',
  bootTextId: 'boot-text-2',
  iframeId: 'cli-frame-2',
  urlBuilder: buildClaudeURL,
  title: 'Claude Code',
});

const terminals = [shellTerm, claudeTerm];

// ── Apply theme now that terminals exist ──
isDark.addEventListener('change', applyTheme);
applyTheme();

// ── Mobile D-Pad (applies to whichever terminal is active — default to Claude) ──
const dpad = new DPad(claudeTerm.iframe);

setProgress(75);
initIcons();
setProgress(100);

// ── Click/tap to zoom in — EACH terminal zooms independently ──
let _activatedByTouch = false;
function bindActivate(term) {
  term.wrap.addEventListener('touchend', (e) => {
    _activatedByTouch = true;
    handleActivate(term, e);
    setTimeout(() => { _activatedByTouch = false; }, 400);
  }, true);
  term.wrap.addEventListener('click', (e) => {
    if (_activatedByTouch) return;
    handleActivate(term, e);
  }, true);
}
for (const t of terminals) bindActivate(t);

function handleActivate(term, e) {
  if (term.state !== 'IDLE') return;
  e.preventDefault();
  e.stopPropagation();

  term.state = 'ZOOMING';
  term.wrap.classList.remove('idle');
  term.wrap.classList.add('zoomed');

  // While one terminal is zoomed, dim/shrink the other slightly
  const other = terminals.find(t => t !== term);
  if (other && other.state === 'IDLE') {
    other.wrap.classList.add('backgrounded');
  }

  // Preload the iframe URL for this terminal
  if (!term.loaded && !term.iframe.src) {
    urlReachable(term.urlBuilder()).then(ok => {
      if (ok) term.iframe.src = term.urlBuilder();
    });
  }

  const origComplete = term.zoom.onComplete;
  term.zoom.onComplete = (dir) => {
    origComplete(dir);
    if (dir === 'in') {
      term.state = 'RUNNING';
      if (window.innerWidth < 900) dpad.show();
    }
    term.zoom.onComplete = origComplete;
  };
  term.zoom.zoomIn();
}

// ── Mouse/touch warp for glass shader (both terminals) ──
function updateGlassMouse(clientX, clientY) {
  for (const t of terminals) {
    if (!t.glass) continue;
    const rect = t.screen.getBoundingClientRect();
    t.glass.mouse.x = (clientX - rect.left) / rect.width;
    t.glass.mouse.y = 1.0 - (clientY - rect.top) / rect.height;
  }
}
document.addEventListener('mousemove', (e) => updateGlassMouse(e.clientX, e.clientY));
document.addEventListener('touchmove', (e) => {
  if (e.touches[0]) updateGlassMouse(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });

// ── Minimize — only the currently-zoomed terminal goes back to idle ──
let dismissCount = 0;

function resetTerminalToIdle(term) {
  if (!term || term.state === 'IDLE') return;

  term.wrap.classList.remove('zoomed');
  if (term.glass) { term.glass.fog = 0.12; term.glass.glassBlur = 0.4; term.glass.start(); }

  dismissCount++;
  const shrink = Math.min(dismissCount * 0.01, 0.05);
  term.zoom.setShrink(shrink);
  term.zoom.zoomOut();
  term.state = 'IDLE';

  // Restore the other terminal to idle foreground
  const other = terminals.find(t => t !== term);
  if (other) other.wrap.classList.remove('backgrounded');

  // When no terminal is zoomed, restore background and hide d-pad
  if (!terminals.some(t => t.state === 'RUNNING' || t.state === 'ZOOMING')) {
    if (fog) fog.style.opacity = '1';
    if (spotlight) spotlight.style.opacity = '0.6';
    dpad.hide();
  }
}

// ── Swipe-to-dismiss (on the pair container — either terminal triggers) ──
const dismissedTray = document.getElementById('dismissed-tray');

for (const t of terminals) {
  new SwipeDismiss(t.wrap, {
    canSwipe: () => t.state === 'RUNNING' || t.state === 'UNAVAILABLE',
    onDismiss: () => { addDismissedTile(t); resetTerminalToIdle(t); },
    onSnapBack: () => {},
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const running = terminals.find(t => t.state === 'RUNNING' || t.state === 'UNAVAILABLE');
    if (running) {
      addDismissedTile(running);
      resetTerminalToIdle(running);
    }
  }
});

let dismissedCount = 0;
function addDismissedTile(term) {
  dismissedCount++;
  const tile = document.createElement('div');
  tile.className = 'dismissed-tile';
  // Label by which terminal was dismissed
  tile.textContent = term?.title === 'shell' ? 'sh' : 'cc';
  tile.title = `${term?.title || 'v9'} session ${dismissedCount}`;
  tile.addEventListener('click', () => {
    tile.remove();
    // Re-activate the dismissed terminal
    if (term && term.state === 'IDLE') {
      handleActivate(term, new Event('click'));
    }
  });
  dismissedTray.appendChild(tile);
  tile.style.transform = 'scale(0.3)';
  tile.style.opacity = '0';
  requestAnimationFrame(() => {
    tile.style.transition = 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease';
    tile.style.transform = '';
    tile.style.opacity = '';
  });
}

// ── Swipe-dismiss from iframe (touch events can't cross iframe boundary) ──
// Identify which terminal the message came from by matching contentWindow.
window.addEventListener('message', (e) => {
  if (e.data?.type !== 'v9:swipe-dismiss') return;
  const source = e.source;
  const term = terminals.find(t => t.iframe.contentWindow === source);
  if (term && (term.state === 'RUNNING' || term.state === 'UNAVAILABLE')) {
    addDismissedTile(term);
    resetTerminalToIdle(term);
  }
});

// ── Resize / orientation change ──
function handleViewportChange() {
  if (fluid && fluid.active) fluid.resize();
  // Refit whichever terminals are running
  for (const t of terminals) {
    if (t.state === 'RUNNING') {
      try { t.iframe.contentWindow?.postMessage({ type: 'v9:refit' }, '*'); } catch {}
    }
  }
}
window.addEventListener('resize', handleViewportChange);
window.addEventListener('orientationchange', () => {
  setTimeout(handleViewportChange, 200);
});

// ── Tactical HUD ──
const hud = new TacticalHUD();

// ── Theme crayon switcher ──
initThemeSwitcher();

console.log('[v9] Page ready (two-terminal layout).');

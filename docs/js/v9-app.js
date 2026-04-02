/**
 * v9 — Main application controller.
 *
 * State machine: IDLE → ZOOMING → RUNNING ⇄ IDLE
 *
 * - IDLE: Terminal at small scale, glass animation visible
 * - ZOOMING: Smooth damped-spring zoom animation
 * - RUNNING: Full-screen terminal with CLI visible
 *
 * CLI loads on first click, then stays alive across zoom cycles.
 * Terminal text scales with the frame during minimize/restore.
 */

import { NavFluid } from './fluid.js';
import { GlassScene } from './glass.js';
import { ZoomController } from './zoom.js';
import { initIcons } from './icons.js';
import { SwipeDismiss, swipeParams } from './swipe.js';
import { TacticalHUD } from './hud.js';
import { initThemeSwitcher } from './theme.js';

// ── State ──
let state = 'IDLE';
let cliLoaded = false; // True once iframe has loaded at least once

// ── DOM refs ──
const navbar = document.getElementById('navbar');
const navFluidCanvas = document.getElementById('nav-fluid');
const progressBar = document.getElementById('progress-bar');
const fog = document.getElementById('fog');
const spotlight = document.getElementById('spotlight');
const termWrap = document.getElementById('terminal-wrap');
const termScreen = document.getElementById('terminal-screen');
const glassCanvas = document.getElementById('glass-canvas');
const termOverlay = document.getElementById('terminal-overlay');
const bootText = document.getElementById('boot-text');
const cliFrame = document.getElementById('cli-frame');

let glass = null;
let fluid = null;

// ── Theme detection ──
const isDark = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  if (isDark.matches) {
    document.documentElement.classList.remove('light');
  } else {
    document.documentElement.classList.add('light');
  }
  if (glass) glass.isDark = isDark.matches;
}
isDark.addEventListener('change', applyTheme);
applyTheme();

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

// ── Glass scene ──
try {
  glass = new GlassScene(glassCanvas);
  glass.isDark = isDark.matches;
  glass.start();
  setProgress(75);
} catch (e) { setProgress(75); }

function resizeGlass() { if (glass) glass.resize(); }
window.addEventListener('resize', resizeGlass);
new ResizeObserver(resizeGlass).observe(termScreen);

// ── Zoom controller ──
const zoom = new ZoomController(termWrap, {
  onComplete: (direction) => {
    if (direction === 'in' && state === 'ZOOMING') {
      state = 'RUNNING';
      if (glass) { glass.fog = 0; glass.glassBlur = 0; glass.stop(); }
      // If CLI not loaded yet, load it now
      if (!cliLoaded) loadCLI();
    } else if (direction === 'out') {
      state = 'IDLE';
      termWrap.classList.add('idle');
    }
  },
  onProgress: (p, direction) => {
    if (direction === 'out') {
      fog.style.opacity = String(1.0 - p);
      spotlight.style.opacity = String(0.6 + p * 0.4);
      if (glass) {
        glass.fog = 0.12 * (1.0 - p);
        glass.glassBlur = 0.4 * (1.0 - p * 0.9);
      }
      return;
    }
    // Zoom in
    fog.style.opacity = String(1.0 - p);
    spotlight.style.opacity = String(0.6 + p * 0.4);
    if (glass) {
      const glassFade = p < 0.8 ? p * 0.3 : 0.24 + (p - 0.8) * 3.8;
      glass.fog = 0.12 * (1.0 - Math.min(1, glassFade));
      glass.glassBlur = 0.4 * (1.0 - Math.min(1, glassFade));
    }
  }
});

// ── Icons ──
initIcons();
setProgress(100);

// ── Click/tap to zoom in ──
termWrap.addEventListener('click', handleActivate, true);
termWrap.addEventListener('touchend', handleActivate, true);

function handleActivate(e) {
  if (state !== 'IDLE') return;
  e.preventDefault();
  e.stopPropagation();
  state = 'ZOOMING';
  termWrap.classList.remove('idle');
  termWrap.classList.add('zoomed');

  // Start loading CLI on first click only
  if (!cliLoaded && !cliFrame.src) {
    resolveWebURL().then(url => {
      if (url) cliFrame.src = url;
    });
  }

  zoom.zoomIn();
}

// ── Load CLI into visible state ──
async function loadCLI() {
  const webUrl = cliFrame.src ? true : await resolveWebURL();
  if (!webUrl && !cliFrame.src) {
    showRuntimeUnavailable();
    return;
  }
  if (!cliFrame.src && typeof webUrl === 'string') {
    cliFrame.src = webUrl;
  }

  // Wait for iframe load
  await new Promise(resolve => {
    try {
      if (cliFrame.contentDocument && cliFrame.contentDocument.readyState === 'complete') {
        return resolve();
      }
    } catch { /* cross-origin */ }
    cliFrame.addEventListener('load', resolve, { once: true });
  });

  cliLoaded = true;
  cliFrame.classList.add('visible');
  bootText.style.display = 'none';
}

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

async function resolveWebURL() {
  const root = siteRootPrefix();
  const bundlePath = `${root.replace(/\/$/, '')}/dist/claude-code-cli.js`;
  const base = `${window.location.origin}${root}`;
  const u = new URL(`web/index.html?bundle=${encodeURIComponent(bundlePath)}&autorun=1`, base);
  const proxy = anthropicProxyForCLIiframe();
  if (proxy) u.searchParams.set('proxy', proxy);
  const webUrl = u.href;

  async function ok(url) {
    try { const r = await fetch(url, { method: 'HEAD', mode: 'same-origin' }); return r.ok || r.status === 405; }
    catch { return false; }
  }
  if (await ok(webUrl)) return webUrl;
  try { const r = await fetch(webUrl, { method: 'GET', mode: 'same-origin' }); if (r.ok) return webUrl; }
  catch { /* ignore */ }
  return null;
}

function showRuntimeUnavailable() {
  state = 'UNAVAILABLE';
  const panel = document.createElement('div');
  panel.className = 'boot-line visible';
  panel.id = 'runtime-unavailable';
  panel.style.cssText = 'margin-top:16px;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,120,120,0.45);background:rgba(80,10,10,0.22);max-width:560px';
  const title = document.createElement('div');
  title.style.cssText = 'color:#ff8a8a;font-family:IBM Plex Mono,monospace;font-size:13px;letter-spacing:0.06em;margin-bottom:8px';
  title.textContent = 'RUNTIME UNAVAILABLE';
  panel.appendChild(title);
  const detail = document.createElement('div');
  detail.style.cssText = 'font-family:IBM Plex Mono,monospace;font-size:14px;line-height:1.6;color:var(--fg)';
  detail.textContent = 'The runtime iframe could not be reached. Ensure wasm and bundle are built.';
  panel.appendChild(detail);
  bootText.appendChild(panel);
}

// ── Mouse/touch warp for glass shader ──
function updateGlassMouse(clientX, clientY) {
  if (!glass) return;
  const rect = termScreen.getBoundingClientRect();
  glass.mouse.x = (clientX - rect.left) / rect.width;
  glass.mouse.y = 1.0 - (clientY - rect.top) / rect.height;
}
document.addEventListener('mousemove', (e) => updateGlassMouse(e.clientX, e.clientY));
document.addEventListener('touchmove', (e) => {
  if (e.touches[0]) updateGlassMouse(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });

// ── Minimize — CLI stays alive, text scales with frame ──
let dismissCount = 0;

function resetToIdle() {
  termWrap.classList.remove('zoomed');
  if (glass) { glass.fog = 0.12; glass.glassBlur = 0.4; glass.start(); }

  dismissCount++;
  const shrink = Math.min(dismissCount * 0.04, 0.15);
  zoom.setShrink(shrink);
  zoom.zoomOut();

  fog.style.opacity = '1';
  spotlight.style.opacity = '0.6';
}

// ── Swipe-to-dismiss ──
const dismissedTray = document.getElementById('dismissed-tray');

const swipeDismiss = new SwipeDismiss(termWrap, {
  canSwipe: () => state === 'RUNNING' || state === 'UNAVAILABLE',
  onDismiss: () => { addDismissedTile(); resetToIdle(); },
  onSnapBack: () => {},
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (state === 'RUNNING' || state === 'UNAVAILABLE')) {
    addDismissedTile();
    resetToIdle();
  }
});

let dismissedCount = 0;
function addDismissedTile() {
  dismissedCount++;
  const tile = document.createElement('div');
  tile.className = 'dismissed-tile';
  tile.textContent = 'v9';
  tile.title = `Session ${dismissedCount}`;
  tile.addEventListener('click', () => {
    tile.remove();
    if (state === 'IDLE') handleActivate(new Event('click'));
  });
  dismissedTray.appendChild(tile);
  // Animate in (scale pop in navbar)
  tile.style.transform = 'scale(0.3)';
  tile.style.opacity = '0';
  requestAnimationFrame(() => {
    tile.style.transition = 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease';
    tile.style.transform = '';
    tile.style.opacity = '';
  });
}

// ── Resize handler ──
window.addEventListener('resize', () => { if (fluid && fluid.active) fluid.resize(); });

// ── Tactical HUD ──
const hud = new TacticalHUD();

// ── Theme crayon switcher ──
initThemeSwitcher();

console.log('[v9] Page ready.');

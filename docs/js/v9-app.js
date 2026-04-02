/**
 * v9 — Main application controller.
 *
 * State machine: IDLE → ZOOMING → BOOTING → RUNNING
 *
 * - IDLE: Page loaded, terminal in distance, foggy, tumble shader behind glass
 * - ZOOMING: Smooth damped-spring zoom animation
 * - BOOTING: "booting v9..." typewriter, status lines
 * - RUNNING: Real CLI loaded in iframe
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
let progressLoaded = 0;
const progressTotal = 4; // Loading stages before boot (boot adds final step)
let cliUrlPromise = null; // Pre-resolved CLI URL
let cliReady = false; // True when iframe has loaded

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

// ── Declare glass early so it's accessible everywhere ──
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
function setProgress(n) {
  progressLoaded = n;
  const pct = Math.min(100, (n / progressTotal) * 100);
  progressBar.style.width = `${pct}%`;
  if (pct >= 100) {
    setTimeout(() => { progressBar.style.opacity = '0'; }, 600);
  }
}
setProgress(1); // HTML loaded

// ── Navbar fluid flourish ──
try {
  fluid = new NavFluid(navFluidCanvas);
  setProgress(2);
} catch (e) {
  // WebGL not available — silently degrade
  setProgress(2);
}

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
  const x = (e.clientX - rect.left) / rect.width;
  const y = 1.0 - (e.clientY - rect.top) / rect.height;
  fluid.onMouse(x, y);
});

// ── Glass scene ──
try {
  glass = new GlassScene(glassCanvas);
  glass.isDark = isDark.matches;
  glass.start();
  setProgress(3);
} catch (e) {
  setProgress(3);
}

// Handle glass canvas resize
function resizeGlass() {
  if (glass) glass.resize();
}
window.addEventListener('resize', resizeGlass);
new ResizeObserver(resizeGlass).observe(termScreen);

// ── Zoom controller ──
const zoom = new ZoomController(termWrap, {
  onComplete: (direction) => {
    if (direction === 'in' && state === 'ZOOMING') {
      state = 'BOOTING';
      startBoot();
    } else if (direction === 'out') {
      // Animation settled — apply idle CSS class for static state
      termWrap.classList.add('idle');
    }
  },
  onProgress: (p, direction) => {
    if (direction === 'out') {
      // Reverse: bring back fog/spotlight/glass as we zoom out
      fog.style.opacity = String(1.0 - p);
      spotlight.style.opacity = String(0.6 + p * 0.4);
      if (glass) {
        glass.fog = 0.12 * (1.0 - p);
        glass.glassBlur = 0.4 * (1.0 - p * 0.9);
      }
      // Fade out overlay as we zoom out
      termOverlay.style.opacity = String(Math.max(0, p * 1.5 - 0.5));
      return;
    }
    // Zoom in: fade fog, brighten spotlight — keep glass visible longer
    fog.style.opacity = String(1.0 - p);
    spotlight.style.opacity = String(0.6 + p * 0.4);
    if (glass) {
      // Glass stays mostly visible until 80%, then fades fast
      const glassFade = p < 0.8 ? p * 0.3 : 0.24 + (p - 0.8) * 3.8;
      glass.fog = 0.12 * (1.0 - Math.min(1, glassFade));
      glass.glassBlur = 0.4 * (1.0 - Math.min(1, glassFade));
    }
    // Crossfade terminal overlay — start late (80%) for longer glass visibility
    if (p > 0.8) {
      const fade = (p - 0.8) / 0.2;
      termOverlay.style.opacity = String(fade);
    }
  }
});

// ── Icons ── (step 4 = 100% in idle)
initIcons();
setProgress(4);

// ── Click/tap to activate terminal ──
termWrap.addEventListener('click', handleActivate, true);
termWrap.addEventListener('touchend', handleActivate, true);

function handleActivate(e) {
  if (state !== 'IDLE') return;
  e.preventDefault();
  e.stopPropagation();
  state = 'ZOOMING';
  termWrap.classList.remove('idle');
  termWrap.classList.add('zoomed');

  // Start loading CLI immediately — don't wait for animation to finish
  cliReady = false;
  cliUrlPromise = resolveWebURL();
  cliUrlPromise.then(url => {
    if (url && (state === 'ZOOMING' || state === 'BOOTING' || state === 'RUNNING')) {
      cliFrame.src = url;
    }
  });

  zoom.zoomIn();
}

// ── Boot: zoom complete → show CLI ──
async function startBoot() {
  // Overlay already faded in during zoom; lock it visible
  termOverlay.classList.add('visible');
  termOverlay.style.opacity = '';

  // Stop glass rendering now that overlay is fully opaque
  if (glass) {
    glass.fog = 0;
    glass.glassBlur = 0;
    glass.stop();
  }

  setProgress(5);

  // CLI was pre-loaded during zoom — wait for it if still pending
  const webUrl = await cliUrlPromise;
  if (webUrl) {
    // iframe src was already set; wait for load then reveal
    if (cliFrame.src) {
      await new Promise(resolve => {
        // Try to check if already loaded (may throw cross-origin)
        try {
          if (cliFrame.contentDocument && cliFrame.contentDocument.readyState === 'complete') {
            return resolve();
          }
        } catch { /* cross-origin — fall through to load event */ }
        cliFrame.addEventListener('load', resolve, { once: true });
      });
    }
    state = 'RUNNING';
    cliReady = true;
    cliFrame.classList.add('visible');
    bootText.style.display = 'none';
  } else {
    showRuntimeUnavailable();
  }
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
  // docs/web/index.html is produced by scripts/prepare-github-pages.mjs (CI).
  // GitHub Pages project sites live under /<repo>/ — pass absolute-style bundle path.
  const root = siteRootPrefix();
  const bundlePath = `${root.replace(/\/$/, '')}/dist/claude-code-cli.js`;
  const base = `${window.location.origin}${root}`;
  const u = new URL(`web/index.html?bundle=${encodeURIComponent(bundlePath)}&autorun=1`, base);
  const proxy = anthropicProxyForCLIiframe();
  if (proxy) u.searchParams.set('proxy', proxy);
  const webUrl = u.href;

  async function ok(url) {
    try {
      const r = await fetch(url, { method: 'HEAD', mode: 'same-origin' });
      return r.ok || r.status === 405;
    } catch {
      return false;
    }
  }
  if (await ok(webUrl)) return webUrl;
  try {
    const r = await fetch(webUrl, { method: 'GET', mode: 'same-origin' });
    if (r.ok) return webUrl;
  } catch { /* ignore */ }
  return null;
}

function showRuntimeUnavailable() {
  state = 'UNAVAILABLE';

  const panel = document.createElement('div');
  panel.className = 'boot-line visible';
  panel.id = 'runtime-unavailable';
  panel.style.marginTop = '16px';
  panel.style.padding = '12px 14px';
  panel.style.borderRadius = '10px';
  panel.style.border = '1px solid rgba(255, 120, 120, 0.45)';
  panel.style.background = 'rgba(80, 10, 10, 0.22)';
  panel.style.maxWidth = '560px';

  const title = document.createElement('div');
  title.style.color = '#ff8a8a';
  title.style.fontFamily = 'IBM Plex Mono, monospace';
  title.style.fontSize = '13px';
  title.style.letterSpacing = '0.06em';
  title.style.marginBottom = '8px';
  title.textContent = 'RUNTIME UNAVAILABLE';
  panel.appendChild(title);

  const detail = document.createElement('div');
  detail.style.fontFamily = 'IBM Plex Mono, monospace';
  detail.style.fontSize = '14px';
  detail.style.lineHeight = '1.6';
  detail.style.color = 'var(--fg)';
  detail.textContent =
    'The runtime iframe could not be reached. Ensure GitHub Actions built wasm (edgejs.wasm), ran scripts/bundle-claude-for-pages.mjs, and scripts/prepare-github-pages.mjs copied web/ + napi-bridge/ into docs/.';
  panel.appendChild(detail);

  bootText.appendChild(panel);
}

// ── Mouse/touch warp for glass shader ──
function updateGlassMouse(clientX, clientY) {
  if (!glass) return;
  // Map to glass canvas coords (relative to terminal screen)
  const rect = termScreen.getBoundingClientRect();
  glass.mouse.x = (clientX - rect.left) / rect.width;
  glass.mouse.y = 1.0 - (clientY - rect.top) / rect.height;
}
document.addEventListener('mousemove', (e) => updateGlassMouse(e.clientX, e.clientY));
document.addEventListener('touchmove', (e) => {
  if (e.touches[0]) updateGlassMouse(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });

// ── Reset to idle state ──
let dismissCount = 0;

function resetToIdle() {
  state = 'IDLE';
  dismissCount++;
  cliFrame.classList.remove('visible');
  cliFrame.src = '';
  termOverlay.classList.remove('visible');
  termOverlay.style.opacity = '0';
  bootText.style.display = '';
  bootText.innerHTML = '';
  termWrap.classList.remove('zoomed');
  // Don't add .idle yet or clear transform — let zoom controller
  // animate from current position, then CSS idle takes over when settled

  // Restart glass immediately so it's visible during zoom-out
  if (glass) { glass.fog = 0.12; glass.glassBlur = 0.4; glass.start(); }

  // Each dismiss makes idle terminal slightly smaller (stacks)
  const shrink = Math.min(dismissCount * 0.04, 0.15);
  zoom.setShrink(shrink);
  zoom.zoomOut();

  fog.style.opacity = '1';
  spotlight.style.opacity = '0.6';
  setProgress(0);
  progressBar.style.opacity = '1';
}

// ── Predictive back: Android Quickstep swipe-to-dismiss ──
// Uses real underdamped spring physics from Android's SpringForce.java
// Velocity-tracked fling detection (not distance-based)
const dismissedTray = document.getElementById('dismissed-tray');

const swipeDismiss = new SwipeDismiss(termWrap, {
  canSwipe: () => state === 'RUNNING' || state === 'BOOTING' || state === 'UNAVAILABLE',
  onDismiss: () => {
    addDismissedTile();
    resetToIdle();
  },
  onSnapBack: () => {
    // Terminal stays in current state — no action needed
  },
});

// ── Keyboard shortcut: Escape triggers smooth zoom-out to idle ──
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (state === 'RUNNING' || state === 'BOOTING' || state === 'UNAVAILABLE')) {
    addDismissedTile();
    resetToIdle();
  }
});

let dismissedCount = 0;
function addDismissedTile() {
  dismissedCount++;
  const tile = document.createElement('div');
  tile.className = 'dismissed-tile';
  tile.textContent = `v9`;
  tile.title = `Session ${dismissedCount}`;
  tile.addEventListener('click', () => {
    // Restore: remove tile and activate terminal
    tile.remove();
    if (state === 'IDLE') {
      handleActivate(new Event('click'));
    }
  });
  dismissedTray.appendChild(tile);

  // Animate in
  tile.style.transform = 'translateY(60px) scale(0.5)';
  tile.style.opacity = '0';
  requestAnimationFrame(() => {
    tile.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease';
    tile.style.transform = '';
    tile.style.opacity = '';
  });
}

// ── Resize handler ──
window.addEventListener('resize', () => {
  if (fluid && fluid.active) fluid.resize();
});

// ── Tactical HUD — editor hotkey detection ──
const hud = new TacticalHUD();

// ── Theme crayon switcher ──
initThemeSwitcher();

// ── Done — page is interactive ──
console.log('[v9] Page ready. Press D to open dial panel.');

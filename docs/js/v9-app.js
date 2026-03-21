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
import { SwipeDismiss } from './swipe.js';

// ── State ──
let state = 'IDLE';
let progressLoaded = 0;
const progressTotal = 4; // Loading stages before boot (boot adds final step)

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
  onComplete: () => {
    if (state === 'ZOOMING') {
      state = 'BOOTING';
      startBoot();
    }
  },
  onProgress: (p) => {
    // Fade fog as we zoom in
    fog.style.opacity = String(1.0 - p);
    // Increase spotlight
    spotlight.style.opacity = String(0.6 + p * 0.4);
    // Clear glass blur
    if (glass) {
      glass.fog = 0.12 * (1.0 - p);
      glass.glassBlur = 0.4 * (1.0 - p * 0.9);
    }
    // Start fading in the terminal overlay early (at 70% zoom) to prevent black flash
    if (p > 0.7) {
      const fade = (p - 0.7) / 0.3;
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
  zoom.zoomIn();
}

// ── Boot sequence ──
const bootLines = [
  { icon: 'Terminal', text: 'booting v9...' },
  { icon: 'Cpu', text: 'initializing runtime' },
  { icon: 'Shield', text: 'loading polyfills' },
  { icon: 'Network', text: 'configuring cors proxy' },
  { icon: 'Code', text: 'loading claude code cli' },
  { icon: 'Zap', text: 'ready' },
];

async function startBoot() {
  // Overlay already partially faded in during zoom; make fully visible
  termOverlay.classList.add('visible');
  termOverlay.style.opacity = '';
  bootText.innerHTML = '';

  // Stop glass animation after overlay is opaque
  setTimeout(() => {
    if (glass) {
      glass.fog = 0;
      glass.glassBlur = 0;
    }
  }, 200);

  // Typewriter each boot line
  for (let i = 0; i < bootLines.length; i++) {
    const line = bootLines[i];
    const el = document.createElement('div');
    el.className = 'boot-line';

    const iconImg = document.createElement('img');
    iconImg.className = 'boot-icon';
    iconImg.src = `icons/${line.icon}.svg`;
    iconImg.alt = '';
    el.appendChild(iconImg);

    const span = document.createElement('span');
    el.appendChild(span);
    bootText.appendChild(el);

    // Fade in line
    await sleep(80);
    el.classList.add('visible');

    // Typewriter text
    for (let j = 0; j < line.text.length; j++) {
      span.textContent += line.text[j];
      await sleep(25 + Math.random() * 15);
    }

    // Check mark for completed lines
    if (i < bootLines.length - 1) {
      span.textContent += ' \u2713';
      await sleep(200);
    } else {
      // Last line — add blinking cursor
      const cursor = document.createElement('span');
      cursor.className = 'boot-cursor';
      el.appendChild(cursor);
    }
  }

  setProgress(5);

  // Wait a beat, then load CLI
  await sleep(800);
  loadCLI();
}

async function loadCLI() {
  state = 'RUNNING';

  // Stop background rendering to save GPU
  if (glass) glass.stop();

  const webUrl = await resolveWebURL();
  if (webUrl) {
    cliFrame.src = webUrl;
    cliFrame.classList.add('visible');
    cliFrame.addEventListener('load', () => {
      bootText.style.display = 'none';
    }, { once: true });
  } else {
    showRuntimeUnavailable();
  }
}

async function resolveWebURL() {
  // web/index.html is deployed alongside docs/ (copied into docs/web/)
  // Relative path works for both localhost and GitHub Pages
  const url = new URL('web/index.html', window.location.href).href;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) return url;
  } catch (e) { /* network error */ }
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
    'This deployment is not connected to a live Claude Code runtime. Input is disabled. Use a runtime-backed environment instead of this static site.';
  panel.appendChild(detail);

  bootText.appendChild(panel);
}

// ── Helpers ──
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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
  termOverlay.style.opacity = '';
  bootText.style.display = '';
  bootText.innerHTML = '';
  termWrap.classList.remove('zoomed');
  termWrap.classList.add('idle');
  termWrap.style.transform = '';
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

// ── Keyboard shortcut: Escape to zoom out ──
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (state === 'RUNNING' || state === 'BOOTING' || state === 'UNAVAILABLE')) {
    resetToIdle();
  }
});

// ── Predictive back: Android Quickstep swipe-to-dismiss ──
// Uses real underdamped spring physics from Android's SpringForce.java
// Velocity-tracked fling detection (not distance-based)
const dismissedTray = document.getElementById('dismissed-tray');

new SwipeDismiss(termWrap, {
  canSwipe: () => state === 'RUNNING' || state === 'BOOTING' || state === 'UNAVAILABLE',
  onDismiss: () => {
    addDismissedTile();
    resetToIdle();
  },
  onSnapBack: () => {
    // Terminal stays in current state — no action needed
  },
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

// ── Done — page is interactive ──
console.log('[v9] Page ready.');

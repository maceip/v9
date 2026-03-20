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

// ── State ──
let state = 'IDLE';
let progressLoaded = 0;
const progressTotal = 5; // Number of loading stages

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
      glass.fog = 1.0 - p;
      glass.glassBlur = 1.0 - p * 0.7;
    }
  }
});
setProgress(4);

// ── Click/tap to activate terminal ──
// Use event delegation on the terminal wrapper to handle clicks on any child
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
  termOverlay.classList.add('visible');
  bootText.innerHTML = '';

  // Stop glass animation after transition
  setTimeout(() => {
    if (glass) {
      glass.fog = 0;
      glass.glassBlur = 0;
    }
  }, 300);

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

  // Build the iframe src.
  // On GitHub Pages the docs/ folder IS the site root, so web/ is not served.
  // We load the CLI from the raw repo content or a deployed URL.
  // For the live site, we point to the repo's web/index.html via GitHub Pages
  // by including web/ in docs/ or using a CDN. For now, we use the repo's
  // raw content URL as a fallback when web/ isn't colocated.
  const webUrl = resolveWebURL();
  if (webUrl) {
    cliFrame.src = webUrl;
    cliFrame.classList.add('visible');
    cliFrame.addEventListener('load', () => {
      bootText.style.display = 'none';
    }, { once: true });
  }
  // If no web URL available, the boot screen stays visible with "ready" status
}

function resolveWebURL() {
  const loc = window.location;
  // Local dev server — web/ is at the repo root
  if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
    return `${loc.origin}/web/index.html?bundle=/dist/claude-code-cli.js`;
  }
  // GitHub Pages — web/ files aren't deployed in docs/
  // Return null; the boot screen "ready" state is the final state on Pages
  // until web/ content is deployed alongside docs/
  return null;
}

// ── Icons ──
initIcons();

// ── Helpers ──
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Mouse parallax for background icons ──
document.addEventListener('mousemove', (e) => {
  if (glass) {
    glass.mouse.x = e.clientX / window.innerWidth;
    glass.mouse.y = 1.0 - e.clientY / window.innerHeight;
  }
});

// ── Keyboard shortcut: Escape to zoom out ──
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (state === 'RUNNING' || state === 'BOOTING')) {
    state = 'IDLE';
    cliFrame.classList.remove('visible');
    cliFrame.src = '';
    termOverlay.classList.remove('visible');
    bootText.style.display = '';
    bootText.innerHTML = '';
    termWrap.classList.remove('zoomed');
    termWrap.classList.add('idle');
    if (glass) { glass.fog = 1.0; glass.glassBlur = 1.0; glass.start(); }
    zoom.zoomOut();
    fog.style.opacity = '1';
    spotlight.style.opacity = '0.6';
    setProgress(0);
    progressBar.style.opacity = '1';
  }
});

// ── Resize handler ──
window.addEventListener('resize', () => {
  if (fluid && fluid.active) fluid.resize();
});

// ── Done — page is interactive ──
console.log('[v9] Page ready.');

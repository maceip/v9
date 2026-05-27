/**
 * First-visit onboarding popover — terminal-shaped window explaining v9.
 *
 * Shows once for new visitors (persisted via localStorage). Contains a brief
 * explanation of v9's two modes (Shell + Runtime) and a live auto-typing demo
 * that types real shell commands character by character.
 */

const STORAGE_KEY = 'v9-visited';

const DEMO_LINES = [
  { type: 'cmd',    text: 'echo "Hello from v9!"' },
  { type: 'output', text: 'Hello from v9!' },
  { type: 'cmd',    text: 'npm install chalk' },
  { type: 'output', text: '\x1b[32m✓\x1b[0m installed chalk@5.3.0' },
  { type: 'cmd',    text: 'node -e "console.log(\'It works!\')"' },
  { type: 'output', text: 'It works!' },
];

const TYPE_SPEED   = 35;  // ms per character
const LINE_PAUSE   = 500; // ms pause after Enter before output
const OUTPUT_PAUSE = 300; // ms pause after output before next prompt

/**
 * Show the onboarding popover.
 * @returns {Promise<void>} resolves when the user dismisses the popover.
 */
export function showOnboarding() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';

    const card = document.createElement('div');
    card.className = 'onboarding-card';

    // ── Header ──
    const header = document.createElement('div');
    header.className = 'onboarding-header';
    header.innerHTML = `
      <span class="onboarding-title">Welcome to v9</span>
      <span class="onboarding-subtitle">Node.js in the browser</span>
    `;
    card.appendChild(header);

    // ── Body ──
    const body = document.createElement('div');
    body.className = 'onboarding-body';

    const intro = document.createElement('p');
    intro.className = 'onboarding-intro';
    intro.textContent = 'v9 runs Node.js directly in your browser tab using WebAssembly. No install, no server, no Docker.';
    body.appendChild(intro);

    // Two modes
    const modes = document.createElement('div');
    modes.className = 'onboarding-modes';
    modes.innerHTML = `
      <div class="onboarding-mode">
        <div class="onboarding-mode-icon">⬛</div>
        <div class="onboarding-mode-info">
          <strong>Shell</strong>
          <span>Interactive terminal — run commands, <code>npm install</code> packages, explore a virtual filesystem</span>
        </div>
      </div>
      <div class="onboarding-mode">
        <div class="onboarding-mode-icon">⚡</div>
        <div class="onboarding-mode-info">
          <strong>Runtime</strong>
          <span>Run Node-style apps entirely in the browser — like the image-to-ascii demo on the right</span>
        </div>
      </div>
    `;
    body.appendChild(modes);

    // ── Live demo terminal ──
    const demoLabel = document.createElement('div');
    demoLabel.className = 'onboarding-demo-label';
    demoLabel.textContent = 'LIVE DEMO';
    body.appendChild(demoLabel);

    const demoWrap = document.createElement('div');
    demoWrap.className = 'onboarding-demo';

    const demoContent = document.createElement('pre');
    demoContent.className = 'onboarding-demo-pre';
    demoWrap.appendChild(demoContent);

    body.appendChild(demoWrap);
    card.appendChild(body);

    // ── Footer ──
    const footer = document.createElement('div');
    footer.className = 'onboarding-footer';

    const btn = document.createElement('button');
    btn.className = 'onboarding-btn';
    btn.textContent = 'Got it — let me try';
    footer.appendChild(btn);

    card.appendChild(footer);
    overlay.appendChild(card);

    // ── Inject styles ──
    const style = document.createElement('style');
    style.textContent = _css();
    document.head.appendChild(style);

    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.classList.add('visible');
      });
    });

    // Dismiss handler
    function dismiss() {
      overlay.classList.remove('visible');
      overlay.addEventListener('transitionend', () => {
        overlay.remove();
        style.remove();
        resolve();
      }, { once: true });
      // Fallback if transition doesn't fire
      setTimeout(() => {
        if (overlay.parentNode) { overlay.remove(); style.remove(); resolve(); }
      }, 500);
    }

    btn.addEventListener('click', dismiss);
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        dismiss();
      }
    });

    // Start the auto-demo after a brief settle
    setTimeout(() => _runDemo(demoContent), 600);
  });
}

/**
 * Check if the user has visited before.
 * @returns {boolean}
 */
export function isFirstVisit() {
  try {
    return !localStorage.getItem(STORAGE_KEY);
  } catch {
    return false; // storage blocked → skip onboarding
  }
}

/**
 * Mark the user as having visited.
 */
export function markVisited() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch { /* storage blocked */ }
}

// ── Auto-typing demo ──────────────────────────────────────────────

async function _runDemo(pre) {
  let html = '';
  const cursor = '<span class="onboarding-cursor">█</span>';

  function render(showCursor = true) {
    pre.innerHTML = html + (showCursor ? cursor : '');
    // Auto-scroll to bottom
    pre.scrollTop = pre.scrollHeight;
  }

  for (const line of DEMO_LINES) {
    if (line.type === 'cmd') {
      html += '<span class="onboarding-prompt">$ </span>';
      render();
      // Type each character
      for (const ch of line.text) {
        await _delay(TYPE_SPEED + Math.random() * 15);
        html += _escapeHtml(ch);
        render();
      }
      // "Press Enter"
      await _delay(LINE_PAUSE);
      html += '\n';
      render();
    } else {
      // Output appears instantly
      await _delay(OUTPUT_PAUSE);
      html += _colorize(line.text) + '\n';
      render();
    }
  }

  // Final prompt with blinking cursor
  html += '<span class="onboarding-prompt">$ </span>';
  render(true);
}

function _delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function _escapeHtml(ch) {
  if (ch === '<') return '&lt;';
  if (ch === '>') return '&gt;';
  if (ch === '&') return '&amp;';
  return ch;
}

function _colorize(text) {
  // Handle basic ANSI color codes for the demo output
  return text
    .replace(/\x1b\[32m/g, '<span style="color:#9bff00">')
    .replace(/\x1b\[0m/g, '</span>')
    .replace(/</g, (m, offset, str) => {
      // Don't escape our own <span> tags
      if (str.substring(offset, offset + 5) === '<span' || str.substring(offset, offset + 6) === '</span') return m;
      return '&lt;';
    });
}

// ── CSS ────────────────────────────────────────────────────────────

function _css() {
  return `
    #onboarding-overlay {
      position: fixed;
      inset: 0;
      z-index: 500;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      opacity: 0;
      transition: opacity 0.35s ease;
    }
    #onboarding-overlay.visible {
      opacity: 1;
    }

    .onboarding-card {
      width: 90%;
      max-width: 540px;
      border: 2px solid var(--frame-border, rgba(255,255,255,0.85));
      border-radius: 12px;
      background:
        linear-gradient(170deg,
          rgba(255,255,255,0.05) 0%,
          transparent 40%,
          rgba(0,0,0,0.06) 100%),
        var(--frame-bg, #0b0b12);
      box-shadow:
        0 0 0 0.5px rgba(255,255,255,0.1),
        0 0 40px rgba(255,255,255,0.03),
        0 16px 64px rgba(0,0,0,0.4);
      overflow: hidden;
      transform: scale(0.92) translateY(20px);
      transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    #onboarding-overlay.visible .onboarding-card {
      transform: scale(1) translateY(0);
    }

    .onboarding-header {
      padding: 18px 22px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .onboarding-title {
      font-family: 'Goldman', sans-serif;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 2px;
      color: var(--accent, #9bff00);
    }
    .onboarding-subtitle {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 12px;
      color: var(--text-secondary, rgba(232,228,222,0.4));
      letter-spacing: 0.5px;
    }

    .onboarding-body {
      padding: 16px 22px;
    }
    .onboarding-intro {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 13px;
      line-height: 1.6;
      color: var(--fg, #e8e4de);
      margin-bottom: 16px;
    }

    .onboarding-modes {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 16px;
    }
    .onboarding-mode {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.06);
      background: rgba(255,255,255,0.02);
    }
    .onboarding-mode-icon {
      font-size: 18px;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .onboarding-mode-info {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 12px;
      line-height: 1.5;
      color: var(--fg, #e8e4de);
    }
    .onboarding-mode-info strong {
      display: block;
      font-size: 13px;
      color: var(--accent, #9bff00);
      margin-bottom: 2px;
      letter-spacing: 0.5px;
    }
    .onboarding-mode-info code {
      padding: 1px 4px;
      border-radius: 3px;
      background: rgba(155,255,0,0.08);
      color: var(--accent, #9bff00);
      font-size: 11px;
    }

    .onboarding-demo-label {
      font-family: 'Goldman', sans-serif;
      font-size: 10px;
      letter-spacing: 2px;
      color: var(--accent, #9bff00);
      opacity: 0.6;
      margin-bottom: 6px;
    }

    .onboarding-demo {
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      background: #1a1b26;
      padding: 12px 14px;
      min-height: 120px;
      max-height: 160px;
      overflow-y: auto;
    }
    .onboarding-demo::-webkit-scrollbar { width: 3px; }
    .onboarding-demo::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

    .onboarding-demo-pre {
      font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.5;
      color: #a9b1d6;
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .onboarding-prompt {
      color: #9bff00;
      font-weight: bold;
    }

    .onboarding-cursor {
      color: #c0caf5;
      animation: onboarding-blink 1s step-end infinite;
    }
    @keyframes onboarding-blink {
      50% { opacity: 0; }
    }

    .onboarding-footer {
      padding: 12px 22px 16px;
      display: flex;
      justify-content: center;
    }
    .onboarding-btn {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.5px;
      padding: 10px 28px;
      border: 1px solid var(--accent, #9bff00);
      border-radius: 8px;
      background: rgba(155,255,0,0.08);
      color: var(--accent, #9bff00);
      cursor: pointer;
      transition: background 0.2s ease, transform 0.1s ease;
    }
    .onboarding-btn:hover {
      background: rgba(155,255,0,0.18);
    }
    .onboarding-btn:active {
      transform: scale(0.97);
    }

    /* ── Responsive ── */
    @media (max-width: 500px) {
      .onboarding-card { max-width: 95%; }
      .onboarding-header { padding: 14px 16px 10px; }
      .onboarding-body { padding: 12px 16px; }
      .onboarding-title { font-size: 17px; }
      .onboarding-intro { font-size: 12px; }
      .onboarding-mode-info { font-size: 11px; }
      .onboarding-demo-pre { font-size: 11px; }
      .onboarding-footer { padding: 10px 16px 14px; }
    }
  `;
}

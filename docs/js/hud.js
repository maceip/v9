/**
 * Tactical HUD — 80s-style panel in the navbar, connected to the terminal
 * via rounded pipe connectors.
 *
 * Uses the same frame styling as #terminal-frame (border, bg, box-shadow).
 * Triggered by vim / emacs / nano keystrokes.
 *
 * Contains:
 *   - htop-style memory meter
 *   - "inject from npm:" text input
 *   - "inject from local drop:" file drop zone
 */

const EDITOR_PATTERNS = {
  vim:   [':w', ':q', ':wq', ':q!', 'dd', 'yy', 'gg', 'ZZ', 'ZQ', ':e '],
  emacs: ['C-x C-s', 'C-x C-c', 'C-x C-f', 'M-x', 'C-g', 'C-x b'],
  nano:  ['C-o', 'C-x', 'C-w', 'C-k', 'C-u'],
};

export class TacticalHUD {
  constructor() {
    this._visible = false;
    this._keyBuf = '';
    this._memRAF = null;
    this._el = null;

    this._injectFont();
    this._buildDOM();
    this._injectCSS();
    this._bindKeys();
    this._startMemMeter();
  }

  _injectFont() {
    if (document.querySelector('link[data-hud-font]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.dataset.hudFont = '1';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap';
    document.head.appendChild(link);
  }

  _buildDOM() {
    const wrap = document.createElement('div');
    wrap.id = 'tactical-hud';
    wrap.innerHTML = `
      <div class="hud-panel">
        <div class="hud-inner">
          <div class="hud-section hud-mem">
            <span class="hud-label">MEM</span>
            <div class="hud-meter"><div class="hud-meter-fill" id="hud-mem-fill"></div></div>
            <span class="hud-meter-text" id="hud-mem-text">0 MB</span>
          </div>
          <div class="hud-section hud-npm">
            <label class="hud-label" for="hud-npm-input">inject from npm:</label>
            <input id="hud-npm-input" type="text" class="hud-input" placeholder="package-name"
                   autocomplete="off" spellcheck="false">
          </div>
          <div class="hud-section hud-drop" id="hud-drop-zone">
            <div class="hud-drop-pad">
              <svg class="hud-drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2 L12 16 M5 9 L12 2 L19 9"/>
                <path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2"/>
              </svg>
              <span class="hud-drop-text">inject from local drop:</span>
            </div>
          </div>
        </div>
      </div>
      <svg class="hud-connector" preserveAspectRatio="none">
        <path class="hud-pipe hud-pipe-left"/>
        <path class="hud-pipe hud-pipe-right"/>
      </svg>
    `;

    document.body.appendChild(wrap);
    this._el = wrap;
    this._panel = wrap.querySelector('.hud-panel');
    this._connector = wrap.querySelector('.hud-connector');
    this._meter = document.getElementById('hud-mem-fill');
    this._meterText = document.getElementById('hud-mem-text');
    this._npmInput = document.getElementById('hud-npm-input');
    this._dropZone = document.getElementById('hud-drop-zone');

    // npm input
    this._npmInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const pkg = this._npmInput.value.trim();
        if (pkg) { this._injectNpm(pkg); this._npmInput.value = ''; }
      }
      if (e.key === 'Escape') this._npmInput.blur();
    });

    // Drop zone
    const dz = this._dropZone;
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault(); dz.classList.remove('drag-over');
      this._handleDrop(e.dataTransfer.files);
    });

    // Recompute connector on resize
    window.addEventListener('resize', () => { if (this._visible) this._layoutConnector(); });
  }

  // ── Connector geometry ──
  _layoutConnector() {
    const termWrap = document.getElementById('terminal-wrap');
    const termFrame = document.getElementById('terminal-frame');
    if (!termWrap || !termFrame) return;

    const panelRect = this._panel.getBoundingClientRect();
    const frameRect = termFrame.getBoundingClientRect();

    // SVG covers from bottom of navbar to top of terminal frame
    const svgTop = panelRect.bottom;
    const svgBottom = frameRect.top + 4; // +4 for terminal-screen inset
    const svgHeight = Math.max(0, svgBottom - svgTop);

    this._connector.style.top = `${svgTop}px`;
    this._connector.style.height = `${svgHeight}px`;
    this._connector.style.left = '0';
    this._connector.style.width = '100%';

    if (svgHeight < 4) {
      this._connector.style.display = 'none';
      return;
    }
    this._connector.style.display = '';

    // Pipe radius
    const r = Math.min(16, svgHeight * 0.4);

    // Left pipe: from left edge of panel down to left edge of terminal frame
    const lx1 = panelRect.left + 20;
    const lx2 = frameRect.left + 20;
    const leftPath = this._makeConnectorPath(lx1, 0, lx2, svgHeight, r);

    // Right pipe: from right edge of panel down to right edge of terminal frame
    const rx1 = panelRect.right - 20;
    const rx2 = frameRect.right - 20;
    const rightPath = this._makeConnectorPath(rx1, 0, rx2, svgHeight, r);

    this._connector.querySelector('.hud-pipe-left').setAttribute('d', leftPath);
    this._connector.querySelector('.hud-pipe-right').setAttribute('d', rightPath);
  }

  _makeConnectorPath(x1, y1, x2, y2, r) {
    // 80s rounded connector: vertical down from x1, rounded bend, horizontal to x2, rounded bend, vertical down
    const midY = (y1 + y2) / 2;
    const dx = x2 - x1;

    if (Math.abs(dx) < 2) {
      // Straight vertical
      return `M${x1},${y1} L${x1},${y2}`;
    }

    const dir = dx > 0 ? 1 : -1;
    const ar = Math.min(r, Math.abs(dx) / 2, Math.abs(midY - y1));

    // Down from top, round bend horizontal, round bend down to bottom
    return [
      `M${x1},${y1}`,
      `L${x1},${midY - ar}`,
      `Q${x1},${midY} ${x1 + dir * ar},${midY}`,
      `L${x2 - dir * ar},${midY}`,
      `Q${x2},${midY} ${x2},${midY + ar}`,
      `L${x2},${y2}`,
    ].join(' ');
  }

  // ── Keys ──
  _bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (e.target.id === 'hud-npm-input') return;

      let chord = '';
      if (e.ctrlKey) chord += 'C-';
      if (e.altKey || e.metaKey) chord += 'M-';
      chord += e.key.length === 1 ? e.key : '';

      this._keyBuf += chord || e.key;
      if (this._keyBuf.length > 20) this._keyBuf = this._keyBuf.slice(-20);

      for (const patterns of Object.values(EDITOR_PATTERNS)) {
        for (const pat of patterns) {
          if (this._keyBuf.includes(pat)) {
            this.show();
            this._keyBuf = '';
            return;
          }
        }
      }
    });
  }

  show() {
    if (this._visible) return;
    this._visible = true;
    this._el.classList.add('visible');
    requestAnimationFrame(() => this._layoutConnector());
  }

  hide() {
    this._visible = false;
    this._el.classList.remove('visible');
  }

  toggle() {
    this._visible ? this.hide() : this.show();
  }

  // ── Memory meter ──
  _startMemMeter() {
    const tick = () => {
      this._memRAF = requestAnimationFrame(tick);
      if (!this._visible) return;
      const mem = performance.memory;
      if (mem) {
        const used = mem.usedJSHeapSize;
        const total = mem.jsHeapSizeLimit;
        const pct = Math.min(100, (used / total) * 100);
        this._meter.style.width = `${pct}%`;
        if (pct < 50) this._meter.style.background = '#9bff00';
        else if (pct < 80) this._meter.style.background = '#ffcc00';
        else this._meter.style.background = '#ff4444';
        this._meterText.textContent = `${(used / 1048576).toFixed(0)}/${(total / 1048576).toFixed(0)} MB`;
      } else {
        const est = Math.random() * 30 + 40;
        this._meter.style.width = `${est}%`;
        this._meter.style.background = '#9bff00';
        this._meterText.textContent = `~${est.toFixed(0)}%`;
      }
    };
    tick();
  }

  // ── Inject handlers ──
  async _injectNpm(pkg) {
    const iframe = document.getElementById('cli-frame');
    if (!iframe?.contentWindow) return;
    try {
      iframe.contentWindow.postMessage({ type: 'v9:inject-npm', package: pkg }, '*');
      this._flash(this._npmInput, 'ok');
    } catch { this._flash(this._npmInput, 'err'); }
  }

  async _handleDrop(files) {
    if (!files.length) return;
    const iframe = document.getElementById('cli-frame');
    if (!iframe?.contentWindow) return;
    for (const file of files) {
      const text = await file.text();
      try {
        iframe.contentWindow.postMessage({
          type: 'v9:inject-file', name: file.name, content: text,
        }, '*');
      } catch { /* cross-origin */ }
    }
    this._flash(this._dropZone, 'ok');
  }

  _flash(el, type) {
    el.classList.add(`flash-${type}`);
    setTimeout(() => el.classList.remove(`flash-${type}`), 600);
  }

  // ── Styles ──
  _injectCSS() {
    const style = document.createElement('style');
    style.textContent = `
      /* ── HUD wrapper ── */
      #tactical-hud {
        position: fixed;
        top: 0; left: 0; right: 0;
        z-index: 150;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      #tactical-hud.visible {
        opacity: 1;
      }

      /* ── Panel: same style as terminal frame, sits in navbar ── */
      .hud-panel {
        position: absolute;
        top: 4px;
        left: 50%;
        transform: translateX(-50%) translateY(-110%);
        max-width: 720px;
        width: calc(100% - 120px);
        height: 36px;
        z-index: 151;
        pointer-events: auto;

        /* Match #terminal-frame styling */
        border: 2px solid var(--frame-border);
        border-radius: 8px;
        background:
          linear-gradient(170deg,
            rgba(255,255,255,0.05) 0%,
            transparent 40%,
            rgba(0,0,0,0.06) 100%),
          var(--frame-bg);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.03),
          inset 0 -1px 0 rgba(0,0,0,0.2),
          0 0 0 0.5px rgba(255,255,255,0.1),
          0 0 15px rgba(255,255,255,0.06),
          0 4px 12px rgba(0,0,0,0.25),
          0 8px 32px rgba(0,0,0,0.3);

        font-family: 'Inter', 'ITC Avant Garde Gothic', 'Avant Garde',
                     'Century Gothic', 'Futura', sans-serif;
        color: var(--accent);

        transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      #tactical-hud.visible .hud-panel {
        transform: translateX(-50%) translateY(0);
      }

      /* ── SVG connector pipes ── */
      .hud-connector {
        position: fixed;
        z-index: 140;
        pointer-events: none;
        overflow: visible;
      }
      .hud-pipe {
        fill: none;
        stroke: var(--frame-border);
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
        opacity: 0;
        transition: opacity 0.4s ease 0.15s;
      }
      #tactical-hud.visible .hud-pipe {
        opacity: 0.7;
      }

      /* ── Inner layout ── */
      .hud-inner {
        display: flex;
        align-items: center;
        height: 100%;
        padding: 0 12px;
        gap: 14px;
      }

      .hud-section {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }
      .hud-section.hud-npm { flex: 1; min-width: 0; }

      .hud-label {
        font-size: 9px;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        opacity: 0.6;
        white-space: nowrap;
      }

      /* ── htop memory meter ── */
      .hud-meter {
        width: 70px;
        height: 8px;
        border-radius: 2px;
        background: rgba(155,255,0,0.08);
        border: 1px solid rgba(155,255,0,0.15);
        overflow: hidden;
      }
      .hud-meter-fill {
        height: 100%;
        width: 0%;
        background: var(--accent);
        border-radius: 1px;
        transition: width 0.5s ease;
        box-shadow: 0 0 4px rgba(155,255,0,0.3);
      }
      .hud-meter-text {
        font-size: 9px;
        font-variant-numeric: tabular-nums;
        opacity: 0.5;
        font-family: 'IBM Plex Mono', monospace;
      }

      /* ── npm input ── */
      .hud-input {
        flex: 1;
        min-width: 60px;
        max-width: 180px;
        height: 22px;
        border-radius: 4px;
        border: 1px solid var(--frame-joint);
        background: rgba(0,0,0,0.3);
        color: var(--accent);
        font-family: 'IBM Plex Mono', monospace;
        font-size: 11px;
        padding: 0 6px;
        outline: none;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
      }
      .hud-input:focus {
        border-color: var(--accent);
        box-shadow: 0 0 6px rgba(155,255,0,0.15);
      }
      .hud-input::placeholder { color: rgba(155,255,0,0.2); }
      .hud-input.flash-ok {
        border-color: var(--accent);
        box-shadow: 0 0 10px rgba(155,255,0,0.35);
      }
      .hud-input.flash-err {
        border-color: #ff4444;
        box-shadow: 0 0 10px rgba(255,68,68,0.35);
      }

      /* ── Drop zone ── */
      .hud-drop { cursor: pointer; }
      .hud-drop-pad {
        display: flex;
        align-items: center;
        gap: 5px;
        height: 22px;
        padding: 0 8px;
        border-radius: 4px;
        border: 1px dashed var(--frame-joint);
        background: rgba(0,0,0,0.15);
        transition: border-color 0.2s ease, background 0.2s ease;
      }
      .hud-drop.drag-over .hud-drop-pad {
        border-color: var(--accent);
        background: rgba(155,255,0,0.08);
        box-shadow: 0 0 10px rgba(155,255,0,0.15);
      }
      .hud-drop.flash-ok .hud-drop-pad {
        border-color: var(--accent);
        background: rgba(155,255,0,0.12);
      }
      .hud-drop-icon {
        width: 12px; height: 12px;
        color: var(--accent);
        opacity: 0.5;
      }
      .hud-drop-text {
        font-size: 9px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        opacity: 0.4;
        white-space: nowrap;
      }

      /* ── Responsive ── */
      @media (max-width: 600px) {
        .hud-panel { height: 32px; width: calc(100% - 40px); }
        .hud-mem .hud-meter { width: 40px; }
        .hud-meter-text { display: none; }
        .hud-drop-text { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  destroy() {
    if (this._memRAF) cancelAnimationFrame(this._memRAF);
    if (this._el) this._el.remove();
  }
}

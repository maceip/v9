/**
 * Mobile D-Pad — pill-shaped game-controller overlay for terminal input.
 *
 * Layout: D-pad cross on the right, command buttons (Esc, Home, Ctrl, Tab)
 * offset one d-pad height higher on the far right. Enter is 2x wide below
 * the command buttons.
 *
 * 50% opacity at rest, 100% on touch.
 * Only the Ctrl button triggers the on-screen keyboard — it stays visually
 * active (highlighted) and the pill morphs into a compact rail above the
 * keyboard. When the keyboard closes, it morphs back to the full controller.
 * All other buttons send their key sequence directly without opening keyboard.
 */

const KEYS = {
  esc:   { label: 'Esc',   seq: '\x1b' },
  tab:   { label: 'Tab',   seq: '\t' },
  ctrl:  { label: 'Ctrl',  modifier: true },
  enter: { label: '\u23CE', seq: '\r' },
  up:    { label: '\u25B2', seq: '\x1b[A' },
  down:  { label: '\u25BC', seq: '\x1b[B' },
  left:  { label: '\u25C0', seq: '\x1b[D' },
  right: { label: '\u25B6', seq: '\x1b[C' },
  home:  { label: '\u2302', seq: '\x1b[H' },
};

export class DPad {
  constructor(cliFrame) {
    this.cliFrame = cliFrame;
    this.ctrlActive = false;
    this.visible = false;
    this.keyboardOpen = false;
    this._touching = false;
    this._build();
    this._bindKeyboard();
  }

  _build() {
    this.el = document.createElement('div');
    this.el.id = 'dpad';

    // ── Pill body (full controller) ──
    const pill = document.createElement('div');
    pill.className = 'dpad-pill';

    // Left side: D-pad cross
    const cross = document.createElement('div');
    cross.className = 'dpad-cross';
    for (const dir of ['up', 'down', 'left', 'right']) {
      const btn = document.createElement('button');
      btn.dataset.key = dir;
      btn.className = `dpad-cross-btn dpad-cross-${dir}`;
      btn.innerHTML = `<span>${KEYS[dir].label}</span>`;
      cross.appendChild(btn);
    }
    const nub = document.createElement('div');
    nub.className = 'dpad-cross-nub';
    cross.appendChild(nub);
    pill.appendChild(cross);

    // Right side: Command buttons — offset upward by one d-pad height
    const cmds = document.createElement('div');
    cmds.className = 'dpad-cmds';

    // 2x2 grid: Esc Home / Ctrl Tab
    const grid = document.createElement('div');
    grid.className = 'dpad-cmd-grid';
    for (const k of ['esc', 'home', 'ctrl', 'tab']) {
      const btn = document.createElement('button');
      btn.dataset.key = k;
      btn.className = 'dpad-cmd-btn';
      btn.textContent = KEYS[k].label;
      grid.appendChild(btn);
    }
    cmds.appendChild(grid);

    // Enter — 2x wide below the grid
    const enterBtn = document.createElement('button');
    enterBtn.dataset.key = 'enter';
    enterBtn.className = 'dpad-cmd-btn dpad-enter';
    enterBtn.textContent = KEYS.enter.label;
    cmds.appendChild(enterBtn);

    pill.appendChild(cmds);
    this.el.appendChild(pill);

    // ── Keyboard rail (compact strip) ──
    const rail = document.createElement('div');
    rail.className = 'dpad-rail';
    const railKeys = ['esc','tab','ctrl','enter','left','down','up','right','home'];
    for (const k of railKeys) {
      const btn = document.createElement('button');
      btn.dataset.key = k;
      btn.className = 'dpad-rail-btn';
      btn.textContent = KEYS[k].label;
      rail.appendChild(btn);
    }
    this.el.appendChild(rail);

    // ── Hidden input for on-screen keyboard ──
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'dpad-keyboard-input';
    input.autocomplete = 'off';
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.spellcheck = false;
    this.el.appendChild(input);
    this.hiddenInput = input;

    document.body.appendChild(this.el);

    // ── Button handlers ──
    this.el.querySelectorAll('[data-key]').forEach(btn => {
      const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._onKey(btn.dataset.key, btn);
      };
      btn.addEventListener('touchstart', handler, { passive: false });
      btn.addEventListener('mousedown', handler);
    });

    // Forward typed characters from hidden input
    this.hiddenInput.addEventListener('input', () => {
      const val = this.hiddenInput.value;
      if (!val) return;
      let seq = val;
      if (this.ctrlActive && val.length === 1) {
        const code = val.toUpperCase().charCodeAt(0);
        if (code >= 65 && code <= 90) {
          seq = String.fromCharCode(code - 64);
        }
        this.ctrlActive = false;
        this._updateCtrl();
      }
      this._send(seq);
      this.hiddenInput.value = '';
    });

    // Prevent keyboard from closing when tapping buttons while keyboard is up
    this.el.addEventListener('touchstart', (e) => {
      const keyEl = e.target.closest('[data-key]');
      if (keyEl && this.keyboardOpen) e.preventDefault();
    }, { passive: false });

    // 50% → 100% opacity on touch
    this.el.addEventListener('touchstart', () => {
      this._touching = true;
      this.el.classList.add('touching');
    }, { passive: true });
    const endTouch = () => {
      this._touching = false;
      setTimeout(() => {
        if (!this._touching) this.el.classList.remove('touching');
      }, 300);
    };
    this.el.addEventListener('touchend', endTouch, { passive: true });
    this.el.addEventListener('touchcancel', endTouch, { passive: true });
  }

  _onKey(key, btn) {
    const def = KEYS[key];
    if (!def) return;

    // Haptic feedback — 25ms pulse, strong enough to feel on Android
    try { navigator.vibrate(25); } catch {}

    // Press animation
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 120);

    if (def.modifier) {
      // Ctrl toggle — the ONLY key that opens the on-screen keyboard.
      this.ctrlActive = !this.ctrlActive;
      this._updateCtrl();
      if (this.ctrlActive) {
        this.hiddenInput.focus({ preventScroll: true });
      } else {
        this.hiddenInput.blur();
      }
    } else {
      this._send(def.seq);
      if (this.ctrlActive) {
        this.ctrlActive = false;
        this._updateCtrl();
      }
    }
  }

  _updateCtrl() {
    this.el.querySelectorAll('[data-key="ctrl"]').forEach(btn => {
      btn.classList.toggle('active', this.ctrlActive);
    });
  }

  _send(seq) {
    try {
      this.cliFrame?.contentWindow?.postMessage({ type: 'v9:key-input', seq }, '*');
    } catch { /* cross-origin */ }
  }

  _bindKeyboard() {
    if (!window.visualViewport) return;
    const vv = window.visualViewport;

    let debounce = null;
    vv.addEventListener('resize', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const heightDiff = window.innerHeight - vv.height;
        const wasOpen = this.keyboardOpen;
        // Only consider keyboard open if Ctrl was activated AND viewport
        // shrank significantly (>200px rules out nav bar / URL bar changes)
        this.keyboardOpen = this.ctrlActive && heightDiff > 200;

        if (this.keyboardOpen !== wasOpen) {
          this.el.classList.toggle('keyboard-open', this.keyboardOpen);
          if (this.keyboardOpen) {
            this.el.style.setProperty('--kb-height', `${heightDiff}px`);
          }
        }
      }, 80);
    });
  }

  show() {
    if (this.visible) return;
    this.visible = true;
    this.el.classList.add('visible');
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.el.classList.remove('visible');
    this.hiddenInput.blur();
    this.keyboardOpen = false;
    this.el.classList.remove('keyboard-open');
  }
}

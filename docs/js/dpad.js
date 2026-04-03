/**
 * Mobile D-Pad — virtual keypad for terminal input on touch devices.
 *
 * Layout (full d-pad):
 *   [Esc]  [Up]   [Tab]
 *   [Left] [Home] [Right]
 *   [Ctrl] [Down] [End]
 *
 * When the on-screen keyboard opens (detected via visualViewport),
 * the d-pad animates into a compact horizontal rail above the keyboard.
 * When the keyboard closes, it morphs back to the full 3x3 grid.
 *
 * Tapping any button also focuses a hidden input to trigger the keyboard.
 */

const KEYS = {
  esc:   { label: 'Esc',  seq: '\x1b' },
  tab:   { label: 'Tab',  seq: '\t' },
  ctrl:  { label: 'Ctrl', modifier: true },
  up:    { label: '\u2191', seq: '\x1b[A' },
  down:  { label: '\u2193', seq: '\x1b[B' },
  left:  { label: '\u2190', seq: '\x1b[D' },
  right: { label: '\u2192', seq: '\x1b[C' },
  home:  { label: '\u2302', seq: '\x1b[H' },
  end:   { label: 'End',  seq: '\x1b[F' },
};

export class DPad {
  constructor(cliFrame) {
    this.cliFrame = cliFrame;
    this.ctrlActive = false;
    this.visible = false;
    this.keyboardOpen = false;
    this._build();
    this._bindKeyboard();
  }

  _build() {
    this.el = document.createElement('div');
    this.el.id = 'dpad';

    // Full d-pad grid (3x3)
    const grid = document.createElement('div');
    grid.className = 'dpad-grid';
    const gridKeys = ['esc','up','tab','left','home','right','ctrl','down','end'];
    for (const k of gridKeys) {
      const btn = document.createElement('button');
      btn.dataset.key = k;
      btn.className = 'dpad-btn';
      if (k === 'home') btn.classList.add('dpad-center');
      else if (KEYS[k].modifier) btn.classList.add('dpad-mod');
      else if (['up','down','left','right'].includes(k)) btn.classList.add('dpad-arrow');
      else btn.classList.add('dpad-mod');
      btn.textContent = KEYS[k].label;
      grid.appendChild(btn);
    }
    this.el.appendChild(grid);

    // Keyboard rail (horizontal strip)
    const rail = document.createElement('div');
    rail.className = 'dpad-rail';
    const railKeys = ['esc','tab','ctrl','up','down','left','right','home','end'];
    for (const k of railKeys) {
      const btn = document.createElement('button');
      btn.dataset.key = k;
      btn.className = 'dpad-rail-btn';
      btn.textContent = KEYS[k].label;
      rail.appendChild(btn);
    }
    this.el.appendChild(rail);

    // Hidden input for triggering on-screen keyboard
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

    // Bind all buttons
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

    // Prevent keyboard from closing when tapping dpad buttons
    this.el.addEventListener('touchstart', (e) => {
      if (e.target.dataset.key) e.preventDefault();
    }, { passive: false });
  }

  _onKey(key, btn) {
    const def = KEYS[key];
    if (!def) return;

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(8);

    // Visual press feedback
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 120);

    if (def.modifier) {
      this.ctrlActive = !this.ctrlActive;
      this._updateCtrl();
    } else {
      this._send(def.seq);
      if (this.ctrlActive) {
        this.ctrlActive = false;
        this._updateCtrl();
      }
    }

    // Trigger on-screen keyboard
    this.hiddenInput.focus({ preventScroll: true });
  }

  _updateCtrl() {
    this.el.querySelectorAll('[data-key="ctrl"]').forEach(btn => {
      btn.classList.toggle('active', this.ctrlActive);
    });
  }

  _send(seq) {
    try {
      this.cliFrame?.contentWindow?.postMessage({ type: 'v9:key-input', seq }, '*');
    } catch { /* cross-origin fallback — ignored */ }
  }

  _bindKeyboard() {
    if (!window.visualViewport) return;

    const vv = window.visualViewport;
    let stableHeight = vv.height;

    // Debounce: wait for viewport to settle
    let debounce = null;
    vv.addEventListener('resize', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const heightDiff = window.innerHeight - vv.height;
        const wasOpen = this.keyboardOpen;
        this.keyboardOpen = heightDiff > 100;

        if (this.keyboardOpen !== wasOpen) {
          this.el.classList.toggle('keyboard-open', this.keyboardOpen);
          // Position rail just above keyboard
          if (this.keyboardOpen) {
            this.el.style.setProperty('--kb-height', `${heightDiff}px`);
          }
        }
        stableHeight = vv.height;
      }, 60);
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

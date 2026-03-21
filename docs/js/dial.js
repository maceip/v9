/**
 * dial.js — Vanilla JS parameter tweaking panel inspired by joshpuckett/dialkit.
 *
 * Usage:
 *   import { Dial } from './dial.js';
 *   const dial = new Dial();
 *   dial.add('Glass', 'fog', 0.12, 0, 0.5, v => glass.fog = v);
 *   dial.add('Glass', 'blur', 0.4, 0, 1, v => glass.glassBlur = v);
 */

const PANEL_WIDTH = 260;

export class Dial {
  constructor() {
    this._folders = {};
    this._controls = [];
    this._open = false;
    this._build();
    this._bindKey();
  }

  /**
   * Add a slider control.
   * @param {string} folder - Category name
   * @param {string} name - Parameter name
   * @param {number} value - Current value
   * @param {number} min
   * @param {number} max
   * @param {function} onChange - Called with new value
   * @param {number} [step] - Step increment (auto-calculated if omitted)
   */
  add(folder, name, value, min, max, onChange, step) {
    if (!step) {
      const range = max - min;
      if (range <= 1) step = 0.001;
      else if (range <= 10) step = 0.01;
      else if (range <= 100) step = 0.1;
      else step = 1;
    }

    const ctrl = { folder, name, value, min, max, step, onChange, el: null, input: null, display: null };
    this._controls.push(ctrl);

    // Get or create folder
    if (!this._folders[folder]) {
      this._folders[folder] = this._createFolder(folder);
    }
    const folderEl = this._folders[folder];

    // Row
    const row = document.createElement('div');
    row.className = 'dial-row';

    const label = document.createElement('label');
    label.className = 'dial-label';
    label.textContent = name;

    const right = document.createElement('div');
    right.className = 'dial-right';

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'dial-slider';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = value;

    const display = document.createElement('span');
    display.className = 'dial-value';
    display.textContent = this._fmt(value);
    display.title = 'Click to type a value';

    // Slider input
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      ctrl.value = v;
      display.textContent = this._fmt(v);
      onChange(v);
    });

    // Click display to edit directly
    display.addEventListener('click', (e) => {
      e.stopPropagation();
      const txt = document.createElement('input');
      txt.type = 'text';
      txt.className = 'dial-value-edit';
      txt.value = ctrl.value;
      display.replaceWith(txt);
      txt.focus();
      txt.select();
      const commit = () => {
        const v = Math.min(max, Math.max(min, parseFloat(txt.value) || ctrl.value));
        ctrl.value = v;
        input.value = v;
        display.textContent = this._fmt(v);
        txt.replaceWith(display);
        onChange(v);
      };
      txt.addEventListener('blur', commit);
      txt.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') txt.replaceWith(display); });
    });

    ctrl.el = row;
    ctrl.input = input;
    ctrl.display = display;

    right.appendChild(input);
    right.appendChild(display);
    row.appendChild(label);
    row.appendChild(right);
    folderEl.appendChild(row);
  }

  /** Reset all controls to their initial values */
  reset() {
    for (const ctrl of this._controls) {
      ctrl.input.value = ctrl.value;
      ctrl.display.textContent = this._fmt(ctrl.value);
    }
  }

  /** Copy all current values as JSON to clipboard */
  copyJSON() {
    const obj = {};
    for (const ctrl of this._controls) {
      if (!obj[ctrl.folder]) obj[ctrl.folder] = {};
      obj[ctrl.folder][ctrl.name] = parseFloat(ctrl.input.value);
    }
    navigator.clipboard?.writeText(JSON.stringify(obj, null, 2));
  }

  toggle() {
    this._open = !this._open;
    this._panel.classList.toggle('dial-open', this._open);
  }

  _fmt(v) {
    if (Number.isInteger(v) && Math.abs(v) >= 10) return String(v);
    if (Math.abs(v) < 0.01) return v.toFixed(4);
    if (Math.abs(v) < 1) return v.toFixed(3);
    if (Math.abs(v) < 100) return v.toFixed(2);
    return v.toFixed(1);
  }

  _createFolder(name) {
    const wrapper = document.createElement('div');
    wrapper.className = 'dial-folder';

    const header = document.createElement('div');
    header.className = 'dial-folder-header';
    header.innerHTML = `<span class="dial-arrow">&#9654;</span> ${name}`;
    header.addEventListener('click', () => {
      wrapper.classList.toggle('dial-collapsed');
    });

    const body = document.createElement('div');
    body.className = 'dial-folder-body';

    wrapper.appendChild(header);
    wrapper.appendChild(body);
    this._body.appendChild(wrapper);

    return body;
  }

  _build() {
    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
      .dial-panel {
        position: fixed;
        top: 50px;
        right: 8px;
        width: ${PANEL_WIDTH}px;
        max-height: calc(100vh - 60px);
        background: rgba(12,12,18,0.92);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 10px;
        font-family: 'IBM Plex Mono', 'SF Mono', monospace;
        font-size: 11px;
        color: #ccc;
        z-index: 9999;
        overflow: hidden;
        transform: translateX(${PANEL_WIDTH + 20}px);
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 24px rgba(0,0,0,0.5);
        display: flex;
        flex-direction: column;
      }
      .dial-panel.dial-open {
        transform: translateX(0);
      }
      .dial-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        user-select: none;
        flex-shrink: 0;
      }
      .dial-title {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.08em;
        color: #9bff00;
      }
      .dial-actions {
        display: flex;
        gap: 6px;
      }
      .dial-btn {
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 4px;
        color: #888;
        font: inherit;
        font-size: 9px;
        padding: 2px 6px;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
      }
      .dial-btn:hover { background: rgba(255,255,255,0.12); color: #ccc; }
      .dial-body {
        overflow-y: auto;
        flex: 1;
        padding-bottom: 4px;
      }
      .dial-body::-webkit-scrollbar { width: 4px; }
      .dial-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      .dial-folder { border-bottom: 1px solid rgba(255,255,255,0.04); }
      .dial-folder-header {
        padding: 6px 10px;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #888;
        cursor: pointer;
        user-select: none;
        transition: color 0.15s;
      }
      .dial-folder-header:hover { color: #bbb; }
      .dial-arrow {
        display: inline-block;
        font-size: 8px;
        margin-right: 4px;
        transition: transform 0.2s;
      }
      .dial-folder:not(.dial-collapsed) .dial-arrow { transform: rotate(90deg); }
      .dial-collapsed .dial-folder-body { display: none; }
      .dial-row {
        display: flex;
        align-items: center;
        padding: 3px 10px;
        gap: 6px;
      }
      .dial-row:hover { background: rgba(255,255,255,0.02); }
      .dial-label {
        flex: 0 0 72px;
        font-size: 10px;
        color: #999;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dial-right {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .dial-slider {
        flex: 1;
        height: 3px;
        -webkit-appearance: none;
        appearance: none;
        background: rgba(255,255,255,0.08);
        border-radius: 2px;
        outline: none;
        cursor: pointer;
      }
      .dial-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #9bff00;
        cursor: grab;
        border: none;
        box-shadow: 0 0 4px rgba(155,255,0,0.3);
      }
      .dial-slider::-moz-range-thumb {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #9bff00;
        cursor: grab;
        border: none;
      }
      .dial-slider:active::-webkit-slider-thumb { cursor: grabbing; }
      .dial-value {
        flex: 0 0 42px;
        text-align: right;
        font-size: 10px;
        color: #666;
        cursor: pointer;
        font-variant-numeric: tabular-nums;
      }
      .dial-value:hover { color: #9bff00; }
      .dial-value-edit {
        width: 42px;
        background: rgba(0,0,0,0.4);
        border: 1px solid rgba(155,255,0,0.3);
        border-radius: 3px;
        color: #9bff00;
        font: inherit;
        font-size: 10px;
        text-align: right;
        padding: 0 3px;
        outline: none;
      }
      /* Toggle button (always visible) */
      .dial-toggle {
        position: fixed;
        top: 50px;
        right: 8px;
        width: 28px;
        height: 28px;
        background: rgba(12,12,18,0.85);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 6px;
        color: #9bff00;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 9998;
        transition: opacity 0.2s, transform 0.2s;
        user-select: none;
      }
      .dial-toggle:hover { transform: scale(1.1); }
      .dial-open ~ .dial-toggle { opacity: 0; pointer-events: none; }
    `;
    document.head.appendChild(style);

    // Toggle button
    const toggle = document.createElement('div');
    toggle.className = 'dial-toggle';
    toggle.innerHTML = '&#9881;'; // gear
    toggle.title = 'Dial panel (D)';
    toggle.addEventListener('click', () => this.toggle());
    document.body.appendChild(toggle);
    this._toggle = toggle;

    // Panel
    const panel = document.createElement('div');
    panel.className = 'dial-panel';

    const header = document.createElement('div');
    header.className = 'dial-header';

    const title = document.createElement('span');
    title.className = 'dial-title';
    title.textContent = 'DIAL';

    const actions = document.createElement('div');
    actions.className = 'dial-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'dial-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => this.copyJSON());

    const closeBtn = document.createElement('button');
    closeBtn.className = 'dial-btn';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => this.toggle());

    actions.appendChild(copyBtn);
    actions.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(actions);

    const body = document.createElement('div');
    body.className = 'dial-body';

    panel.appendChild(header);
    panel.appendChild(body);
    document.body.appendChild(panel);

    this._panel = panel;
    this._body = body;
  }

  _bindKey() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'd' && !e.metaKey && !e.ctrlKey && !e.altKey &&
          e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        this.toggle();
      }
    });
  }
}

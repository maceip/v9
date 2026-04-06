/**
 * MEMORY_OS Side-Panel API — 320px high-density metro panel
 * stitch_metro_memory_panel / metro_sidepanel_320px_high_density v2
 *
 * Design reference: Kinetic Memorandum / Memory_OS Architecture
 *
 * Module cards map to the Memory_OS architecture:
 *   SHORT-TERM  → context window token count
 *   LONG-TERM   → retrieval recall %
 *   RETRIEVER   → latency
 *   CONSOLIDATOR → memory stacks
 *   FORGETTING  → purged data
 *   ASSEMBLER   → error count
 *   SYSTEM      → system status
 *
 * Usage:
 *   import { SidePanel } from './sidepanel-api.js';
 *   const panel = SidePanel.create(document.getElementById('sidepanel'));
 *   panel.setStatus('active');
 *   panel.updateModule('short-term', { value: '812', suffix: 'TOKENS' });
 *   panel.pushLog({ type: 'secure', msg: 'AUTH_SUCCESS :: ROOT_USER' });
 */

// ── SVG micro-icons ───────────────────────────────────────────────────

const ICONS = {
  'short-term':   `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="6" r="4.5"/><line x1="6" y1="3" x2="6" y2="6"/><line x1="6" y1="6" x2="8" y2="7"/></svg>`,
  'long-term':    `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 9.5c0-4 3-6 4-7.5 1 1.5 4 3.5 4 7.5"/><line x1="6" y1="7" x2="6" y2="10"/></svg>`,
  'retriever':    `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="5" cy="5" r="3.5"/><line x1="7.5" y1="7.5" x2="10.5" y2="10.5"/></svg>`,
  'consolidator': `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 1.5v9M3 4.5l3-3 3 3M3 7.5l3 3 3-3"/></svg>`,
  'forgetting':   `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.5" y="3" width="7" height="7" rx="1"/><path d="M4 3V2a1 1 0 011-1h2a1 1 0 011 1v1"/><line x1="5" y1="5.5" x2="5" y2="8"/><line x1="7" y1="5.5" x2="7" y2="8"/></svg>`,
  'assembler':    `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 2h3v3H2zM7 2h3v3H7zM2 7h3v3H2zM7 7h3v3H7z"/></svg>`,
  'system':       `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="6" r="2"/><path d="M6 1v1.5M6 9.5V11M1 6h1.5M9.5 6H11M2.4 2.4l1 1M8.6 8.6l1 1M9.6 2.4l-1 1M3.4 8.6l-1 1"/></svg>`,
  collapse:       `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="8,3 4,6 8,9"/></svg>`,
  expand:         `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="4,3 8,6 4,9"/></svg>`,
};

// ── Module definitions (order matches Memory_OS Architecture) ─────────

const MODULES = [
  { id: 'short-term',   label: 'SHORT-TERM',   color: 'var(--mp-mod-short-term)',   defaultValue: '0',     defaultSuffix: 'TOKENS' },
  { id: 'long-term',    label: 'LONG-TERM',     color: 'var(--mp-mod-long-term)',    defaultValue: '—',     defaultSuffix: 'RECALL' },
  { id: 'retriever',    label: 'RETRIEVER',      color: 'var(--mp-mod-retriever)',    defaultValue: '—',     defaultSuffix: 'LATENCY' },
  { id: 'consolidator', label: 'CONSOLIDATOR',   color: 'var(--mp-mod-consolidator)', defaultValue: '0',     defaultSuffix: 'STACKS' },
  { id: 'forgetting',   label: 'FORGETTING',     color: 'var(--mp-mod-forgetting)',   defaultValue: '0',     defaultSuffix: 'PURGED' },
  { id: 'assembler',    label: 'ASSEMBLER',      color: 'var(--mp-mod-assembler)',    defaultValue: '0',     defaultSuffix: 'ERROR_LOGS' },
  { id: 'system',       label: 'SYSTEM',         color: 'var(--mp-mod-system)',       defaultValue: '—',     defaultSuffix: '' },
];

// ── Helpers ────────────────────────────────────────────────────────────

function el(tag, cls, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('data-') || k === 'title') e.setAttribute(k, v);
    else e[k] = v;
  });
  return e;
}

function ts() {
  return new Date().toTimeString().slice(0, 8);
}

// ── SidePanel class ───────────────────────────────────────────────────

class SidePanelInstance {
  constructor(container) {
    this._container = container;
    this._listeners = {};
    this._logs = [];
    this._cards = {};
    this._collapsed = false;
    this._activeTab = 'logs';
    this._build();
  }

  _build() {
    const panel = el('div', 'mp-panel');
    this._panel = panel;

    // ── Header
    const header = el('div', 'mp-header');
    header.append(
      el('span', 'mp-header__brand', { text: 'MEMORY_OS' }),
      el('span', 'mp-header__version', { text: 'V.01_STABLE' }),
    );
    this._statusBadge = el('span', 'mp-header__status-badge', { text: 'OFFLINE', 'data-state': 'offline' });
    this._collapseBtn = el('button', 'mp-header__btn', { html: ICONS.collapse, title: 'Collapse' });
    this._collapseBtn.addEventListener('click', () => this.toggleCollapse());
    header.append(this._statusBadge, this._collapseBtn);

    // ── Module card stack
    this._modulesEl = el('div', 'mp-modules');
    for (const mod of MODULES) {
      this._buildCard(mod);
    }

    // ── Access logs
    this._logsEl = el('div', 'mp-logs');
    const logsHead = el('div', 'mp-logs__head');
    logsHead.append(
      el('span', 'mp-logs__title', { text: 'ACCESS LOGS' }),
      el('span', 'mp-logs__label', { text: 'REAL-TIME' }),
    );
    this._logsBody = el('div', '');
    this._logsEl.append(logsHead, this._logsBody);

    // ── Footer
    const footer = el('div', 'mp-footer');
    this._logsTab = el('button', 'mp-footer__tab', { text: 'LOGS', 'data-active': 'true' });
    this._statusTab = el('button', 'mp-footer__tab', { text: 'STATUS', 'data-active': 'false' });
    this._logsTab.addEventListener('click', () => this._setTab('logs'));
    this._statusTab.addEventListener('click', () => this._setTab('status'));
    this._clearBtn = el('button', 'mp-footer__action', { text: 'CLEAR_LOGS' });
    this._clearBtn.addEventListener('click', () => this.clearLogs());
    footer.append(this._logsTab, this._statusTab, el('span', 'mp-footer__spacer'), this._clearBtn);

    panel.append(header, this._modulesEl, this._logsEl, footer);
    this._container.appendChild(panel);
  }

  _buildCard(mod) {
    const card = el('div', 'mp-card');
    card.style.setProperty('--mp-card-color', mod.color);
    card.setAttribute('data-module', mod.id);

    const top = el('div', 'mp-card__top');
    const icon = el('span', 'mp-card__icon', { html: ICONS[mod.id] || '' });
    const label = el('span', 'mp-card__label', { text: mod.label });
    const badge = el('span', 'mp-card__badge');
    badge.style.display = 'none';
    top.append(icon, label, badge);

    const valueRow = el('div', '');
    const value = el('span', 'mp-card__value', { text: mod.defaultValue });
    const suffix = el('span', 'mp-card__value-suffix', { text: mod.defaultSuffix });
    valueRow.append(value, suffix);

    const bar = el('div', 'mp-card__bar');
    const barFill = el('div', 'mp-card__bar-fill');
    barFill.style.width = '0%';
    bar.append(barFill);

    card.append(top, valueRow, bar);
    this._modulesEl.append(card);

    card.addEventListener('click', () => this._emit('moduleClick', mod.id));

    this._cards[mod.id] = { card, value, suffix, badge, barFill };
  }

  _setTab(tab) {
    this._activeTab = tab;
    this._logsTab.setAttribute('data-active', String(tab === 'logs'));
    this._statusTab.setAttribute('data-active', String(tab === 'status'));
  }

  // ── Public API ──────────────────────────────────────────────────────

  /** Set global status: 'active' | 'idle' | 'error' | 'offline' */
  setStatus(state) {
    const labels = { active: 'ACTIVE', idle: 'IDLE', error: 'ERROR', offline: 'OFFLINE' };
    this._statusBadge.textContent = labels[state] || state.toUpperCase();
    this._statusBadge.setAttribute('data-state', state);
    this._emit('statusChange', state);
  }

  /**
   * Update a module card.
   * @param {string} moduleId - One of: short-term, long-term, retriever, consolidator, forgetting, assembler, system
   * @param {object} data - { value?, suffix?, badge?, bar?, active? }
   *   value: string to display (e.g. '812', '99.2%', '45ms')
   *   suffix: label after value (e.g. 'TOKENS', 'RECALL')
   *   badge: badge text (e.g. 'ACTIVE') or null to hide
   *   bar: 0-100 progress bar fill
   *   active: boolean to highlight card with module color
   */
  updateModule(moduleId, data) {
    const c = this._cards[moduleId];
    if (!c) return;

    if (data.value !== undefined) c.value.textContent = data.value;
    if (data.suffix !== undefined) c.suffix.textContent = data.suffix;
    if (data.badge !== undefined) {
      if (data.badge) {
        c.badge.textContent = data.badge;
        c.badge.style.display = '';
      } else {
        c.badge.style.display = 'none';
      }
    }
    if (data.bar !== undefined) {
      c.barFill.style.width = Math.min(100, Math.max(0, data.bar)) + '%';
    }
    if (data.active !== undefined) {
      c.card.setAttribute('data-active', String(!!data.active));
    }
    this._emit('moduleUpdate', { moduleId, data });
  }

  /** Convenience: set short-term token count */
  setTokens(count, max) {
    const pct = max ? Math.round((count / max) * 100) : 0;
    this.updateModule('short-term', {
      value: count >= 1000 ? (count / 1000).toFixed(1) + 'k' : String(count),
      suffix: 'TOKENS',
      bar: pct,
      badge: count > 0 ? 'ACTIVE' : null,
    });
  }

  /** Push an access log entry: { type?, msg, tag? } */
  pushLog(entry) {
    const { type = 'info', msg = '', tag } = entry;
    this._logs.push(entry);

    const row = el('div', 'mp-log-entry');
    row.append(
      el('span', 'mp-log-entry__time', { text: ts() }),
      el('span', 'mp-log-entry__msg', { text: msg }),
    );
    if (tag) {
      row.append(el('span', 'mp-log-entry__tag', { text: tag, 'data-type': type }));
    }
    this._logsBody.append(row);

    // Cap at 150 entries
    if (this._logs.length > 150) {
      this._logsBody.firstChild?.remove();
      this._logs.shift();
    }

    // Auto-scroll
    this._logsEl.scrollTop = this._logsEl.scrollHeight;
    this._emit('log', entry);
  }

  /** Clear all logs */
  clearLogs() {
    this._logs = [];
    this._logsBody.innerHTML = '';
    this._emit('logsClear');
  }

  /** Toggle collapsed */
  toggleCollapse() {
    this._collapsed = !this._collapsed;
    this._panel.setAttribute('data-collapsed', String(this._collapsed));
    this._collapseBtn.innerHTML = this._collapsed ? ICONS.expand : ICONS.collapse;
    this._emit('collapse', this._collapsed);
  }

  get collapsed() { return this._collapsed; }

  /** Event subscription */
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(f => f !== fn);
    }
  }

  _emit(event, data) {
    (this._listeners[event] || []).forEach(fn => fn(data));
  }

  /** Remove panel from DOM */
  destroy() {
    this._panel.remove();
    this._listeners = {};
  }
}

// ── Factory ───────────────────────────────────────────────────────────

export const SidePanel = {
  create(container) {
    return new SidePanelInstance(container);
  },
};

export default SidePanel;

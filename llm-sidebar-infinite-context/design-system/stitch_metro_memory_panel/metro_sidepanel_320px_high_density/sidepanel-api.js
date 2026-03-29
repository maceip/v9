/**
 * Metro Side-Panel API — 320px high-density context panel
 * stitch_metro_memory_panel / metro_sidepanel_320px_high_density
 *
 * Usage:
 *   import { SidePanel } from './sidepanel-api.js';
 *   const panel = SidePanel.create(document.getElementById('sidepanel'));
 *   panel.setStatus('active');
 *   panel.pushContext({ role: 'user', text: 'Hello', tokens: 5 });
 *   panel.pushActivity({ type: 'tool', msg: 'fs.readFile /app.js' });
 */

// ── SVG micro-icons (inline, no external deps) ────────────────────────
const ICONS = {
  chevron: `<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="3,2 7,5 3,8"/></svg>`,
  collapse: `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="9,3 5,7 9,11"/></svg>`,
  expand: `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="5,3 9,7 5,11"/></svg>`,
  clear: `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></svg>`,
  context: `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="2" width="10" height="10" rx="1.5"/><line x1="5" y1="5" x2="9" y2="5"/><line x1="5" y1="7.5" x2="8" y2="7.5"/></svg>`,
  memory: `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="1.5" width="8" height="11" rx="1"/><line x1="5.5" y1="4" x2="9" y2="4"/><line x1="5.5" y1="6.5" x2="9" y2="6.5"/><line x1="5.5" y1="9" x2="8" y2="9"/></svg>`,
  activity: `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="1,7 4,7 5.5,3 7.5,11 9,7 13,7"/></svg>`,
  tools: `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8.5 2.5l3 3-7.5 7.5H1v-3z"/></svg>`,
};

// ── Helpers ────────────────────────────────────────────────────────────

function el(tag, cls, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('data-')) e.setAttribute(k, v);
    else e[k] = v;
  });
  return e;
}

function formatTime(date) {
  const d = date || new Date();
  return d.toTimeString().slice(0, 8);
}

function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

// ── Section builder ───────────────────────────────────────────────────

function buildSection(label, iconKey, opts = {}) {
  const section = el('div', 'mp-section', { 'data-open': opts.open !== false ? 'true' : 'false' });

  const head = el('div', 'mp-section__head');
  const chevron = el('span', 'mp-section__chevron', { html: ICONS.chevron });
  const labelEl = el('span', 'mp-section__label', { text: label });
  const countEl = el('span', 'mp-section__count', { text: '0' });

  head.append(chevron, labelEl, countEl);
  head.addEventListener('click', () => {
    const open = section.getAttribute('data-open') === 'true';
    section.setAttribute('data-open', String(!open));
  });

  const body = el('div', 'mp-section__body');
  section.append(head, body);

  return { section, body, countEl };
}

// ── SidePanel class ───────────────────────────────────────────────────

class SidePanelInstance {
  constructor(container) {
    this._container = container;
    this._listeners = {};
    this._contextEntries = [];
    this._memoryItems = [];
    this._activityLog = [];
    this._totalTokens = 0;
    this._maxTokens = 200_000;
    this._collapsed = false;

    this._build();
  }

  _build() {
    const panel = el('div', 'mp-panel');
    this._panel = panel;

    // Header
    const header = el('div', 'mp-header');
    this._statusDot = el('div', 'mp-header__status', { 'data-state': 'offline' });
    const title = el('span', 'mp-header__title', { text: 'Context' });
    this._collapseBtn = el('button', 'mp-header__btn', { html: ICONS.collapse, title: 'Collapse panel' });
    this._collapseBtn.addEventListener('click', () => this.toggleCollapse());
    header.append(this._statusDot, title, this._collapseBtn);

    // Body
    this._body = el('div', 'mp-body');

    // Token meter
    this._meterSection = this._buildMeter();

    // Context section
    const ctx = buildSection('Context', 'context', { open: true });
    this._contextSection = ctx;

    // Memory section
    const mem = buildSection('Memory', 'memory', { open: true });
    this._memorySection = mem;

    // Tools section
    const tools = buildSection('Tools', 'tools', { open: false });
    this._toolsSection = tools;

    // Activity section
    const act = buildSection('Activity', 'activity', { open: true });
    this._activitySection = act;

    this._body.append(
      this._meterSection,
      ctx.section,
      mem.section,
      tools.section,
      act.section,
    );

    // Footer
    const footer = el('div', 'mp-footer');
    this._input = el('input', 'mp-footer__input', { type: 'text', placeholder: 'Filter context...' });
    this._input.addEventListener('input', () => this._onFilter(this._input.value));
    footer.append(this._input);

    panel.append(header, this._body, footer);
    this._container.appendChild(panel);
  }

  _buildMeter() {
    const meter = el('div', 'mp-meter');
    const bar = el('div', 'mp-meter__bar');
    this._meterFill = el('div', 'mp-meter__fill');
    this._meterFill.style.width = '0%';
    bar.append(this._meterFill);

    const labels = el('div', 'mp-meter__labels');
    this._meterUsed = el('span', '', { text: '0' });
    this._meterMax = el('span', '', { text: formatTokens(this._maxTokens) });
    labels.append(this._meterUsed, this._meterMax);

    meter.append(bar, labels);
    return meter;
  }

  _updateMeter() {
    const pct = Math.min(100, (this._totalTokens / this._maxTokens) * 100);
    this._meterFill.style.width = pct + '%';
    this._meterUsed.textContent = formatTokens(this._totalTokens);

    if (pct > 90) this._meterFill.setAttribute('data-level', 'danger');
    else if (pct > 70) this._meterFill.setAttribute('data-level', 'warning');
    else this._meterFill.removeAttribute('data-level');
  }

  _onFilter(query) {
    const q = query.toLowerCase();
    const entries = this._contextSection.body.querySelectorAll('.mp-context-entry');
    let visible = 0;
    entries.forEach(entry => {
      const text = entry.textContent.toLowerCase();
      const match = !q || text.includes(q);
      entry.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    this._contextSection.countEl.textContent = String(visible);
  }

  // ── Public API ──────────────────────────────────────────────────────

  /** Set connection status: 'active' | 'idle' | 'error' | 'offline' */
  setStatus(state) {
    this._statusDot.setAttribute('data-state', state);
    this._emit('statusChange', state);
  }

  /** Set max token capacity for the meter */
  setMaxTokens(n) {
    this._maxTokens = n;
    this._meterMax.textContent = formatTokens(n);
    this._updateMeter();
  }

  /** Push a context entry: { role, text, tokens? } */
  pushContext(entry) {
    const { role = 'user', text = '', tokens = 0 } = entry;
    this._contextEntries.push(entry);
    this._totalTokens += tokens;

    const row = el('div', 'mp-context-entry');
    const roleEl = el('div', 'mp-context-entry__role', { text: role, 'data-role': role });
    const textEl = el('div', 'mp-context-entry__text', { text: text.length > 300 ? text.slice(0, 300) + '...' : text });
    row.append(roleEl, textEl);

    if (tokens > 0) {
      row.append(el('div', 'mp-context-entry__tokens', { text: formatTokens(tokens) + ' tokens' }));
    }

    this._contextSection.body.append(row);
    this._contextSection.countEl.textContent = String(this._contextEntries.length);
    this._updateMeter();

    // Auto-scroll to bottom
    this._body.scrollTop = this._body.scrollHeight;
    this._emit('contextPush', entry);
  }

  /** Clear all context entries */
  clearContext() {
    this._contextEntries = [];
    this._totalTokens = 0;
    this._contextSection.body.innerHTML = '';
    this._contextSection.countEl.textContent = '0';
    this._updateMeter();
    this._emit('contextClear');
  }

  /** Set memory items: [{ label, value, icon? }] */
  setMemory(items) {
    this._memoryItems = items;
    this._memorySection.body.innerHTML = '';
    items.forEach(item => {
      const row = el('div', 'mp-row');
      if (item.icon) row.append(el('span', 'mp-row__icon', { html: ICONS[item.icon] || '' }));
      row.append(
        el('span', 'mp-row__label', { text: item.label }),
        el('span', 'mp-row__meta', { text: item.value }),
      );
      this._memorySection.body.append(row);
    });
    this._memorySection.countEl.textContent = String(items.length);
    this._emit('memoryUpdate', items);
  }

  /** Set active tools: [{ name, status? }] */
  setTools(tools) {
    this._toolsSection.body.innerHTML = '';
    tools.forEach(t => {
      const row = el('div', 'mp-row');
      row.append(
        el('span', 'mp-row__icon', { html: ICONS.tools }),
        el('span', 'mp-row__label', { text: t.name }),
        el('span', 'mp-row__meta', { text: t.status || '' }),
      );
      this._toolsSection.body.append(row);
    });
    this._toolsSection.countEl.textContent = String(tools.length);
  }

  /** Push an activity log entry: { type?, msg } */
  pushActivity(entry) {
    const { type = 'info', msg = '' } = entry;
    this._activityLog.push(entry);

    const row = el('div', 'mp-activity');
    row.append(
      el('span', 'mp-activity__time', { text: formatTime() }),
      el('span', 'mp-activity__msg', { text: msg, 'data-type': type }),
    );
    this._activitySection.body.append(row);
    this._activitySection.countEl.textContent = String(this._activityLog.length);

    // Keep max 200 activity entries
    if (this._activityLog.length > 200) {
      this._activitySection.body.firstChild?.remove();
      this._activityLog.shift();
    }

    this._emit('activity', entry);
  }

  /** Clear activity log */
  clearActivity() {
    this._activityLog = [];
    this._activitySection.body.innerHTML = '';
    this._activitySection.countEl.textContent = '0';
  }

  /** Toggle panel collapsed state */
  toggleCollapse() {
    this._collapsed = !this._collapsed;
    this._panel.setAttribute('data-collapsed', String(this._collapsed));
    this._collapseBtn.innerHTML = this._collapsed ? ICONS.expand : ICONS.collapse;
    this._emit('collapse', this._collapsed);
  }

  /** Check if panel is collapsed */
  get collapsed() { return this._collapsed; }

  /** Get total tokens used */
  get totalTokens() { return this._totalTokens; }

  /** Get context entry count */
  get contextCount() { return this._contextEntries.length; }

  /** Subscribe to events: statusChange, contextPush, contextClear, memoryUpdate, activity, collapse */
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

  /** Destroy panel and clean up */
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

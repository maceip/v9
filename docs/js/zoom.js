/**
 * Terminal zoom animation — duration-based easing with zero wobble.
 *
 * Zoom-in:  fast cubic ease-out (quick start, smooth deceleration)
 * Zoom-out: smooth cubic ease-in-out (gentle start and end)
 */

function getIdleParams() {
  const w = window.innerWidth;
  if (w <= 380)  return { scale: 0.55, y: 5 };
  if (w <= 899)  return { scale: 0.48, y: 6 };
  return { scale: 0.42, y: 8 };
}

// Easing functions
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

export class ZoomController {
  constructor(element, opts = {}) {
    this.el = element;
    this.onComplete = opts.onComplete || (() => {});
    this.onProgress = opts.onProgress || (() => {});

    this.zoomInDuration = 380;  // ms — fast pop open
    this.zoomOutDuration = 320; // ms — smooth close

    this._shrink = 0;
    const idle = getIdleParams();
    this.idleScale = idle.scale;
    this.idleY = idle.y;
    this.current = { scale: idle.scale, y: idle.y };

    this._running = false;
    this._raf = null;
    this._direction = null;
    this._t0 = 0;
    this._from = { scale: 0, y: 0 };
    this._to = { scale: 0, y: 0 };

    this._apply();
  }

  setShrink(amount) { this._shrink = amount; }

  zoomIn() {
    this._animate(
      { scale: this.current.scale, y: this.current.y },
      { scale: 1.0, y: 0 },
      'in'
    );
  }

  zoomOut() {
    const idle = getIdleParams();
    this.idleScale = Math.max(0.2, idle.scale - this._shrink);
    this.idleY = idle.y + this._shrink * 10;
    this._animate(
      { scale: this.current.scale, y: this.current.y },
      { scale: this.idleScale, y: this.idleY },
      'out'
    );
  }

  get progress() {
    return Math.max(0, Math.min(1, (this.current.scale - this.idleScale) / (1.0 - this.idleScale)));
  }

  _animate(from, to, direction) {
    this._from = { ...from };
    this._to = { ...to };
    this._direction = direction;
    this._t0 = performance.now();
    if (!this._running) {
      this._running = true;
      this._loop();
    }
  }

  _loop() {
    if (!this._running) return;
    this._raf = requestAnimationFrame(() => this._loop());

    const dur = this._direction === 'in' ? this.zoomInDuration : this.zoomOutDuration;
    const elapsed = performance.now() - this._t0;
    const raw = Math.min(1, elapsed / dur);
    const ease = this._direction === 'in' ? easeOutCubic(raw) : easeInOutCubic(raw);

    this.current.scale = this._from.scale + (this._to.scale - this._from.scale) * ease;
    this.current.y = this._from.y + (this._to.y - this._from.y) * ease;

    this.onProgress(this.progress, this._direction);
    this._apply();

    if (raw >= 1) {
      this.current.scale = this._to.scale;
      this.current.y = this._to.y;
      this._running = false;
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = null;
      this._apply();
      this.onComplete(this._direction);
    }
  }

  _apply() {
    this.el.style.transform = `scale(${this.current.scale}) translateY(${this.current.y}%)`;
  }

  destroy() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }
}

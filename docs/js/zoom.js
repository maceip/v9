/**
 * Terminal zoom animation — damped spring physics.
 * Adapted from wobble-project's lerp + GSAP snap interaction.
 *
 * Physics model:
 *   velocity *= damping
 *   velocity += (target - current) * stiffness
 *   current += velocity
 */

// Detect idle scale/y from CSS media queries
function getIdleParams() {
  const w = window.innerWidth;
  if (w <= 380)  return { scale: 0.55, y: 5 };   // Fold folded
  if (w <= 899)  return { scale: 0.48, y: 6 };   // Fold expanded / tablet
  return { scale: 0.42, y: 8 };                   // Desktop
}

export class ZoomController {
  constructor(element, opts = {}) {
    this.el = element;
    this.onComplete = opts.onComplete || (() => {});
    this.onProgress = opts.onProgress || (() => {});

    // Spring parameters — slow, smooth, cinematic ease with minimal overshoot
    // Low stiffness = slow pull, high damping = heavy/smooth feel
    this.stiffness = 0.018;
    this.damping = 0.88;
    this.threshold = 0.0005;

    // State — read idle params from responsive breakpoints
    this._shrink = 0; // additional scale reduction after dismissals
    const idle = getIdleParams();
    this.idleScale = idle.scale;
    this.idleY = idle.y;
    this.current = { scale: idle.scale, y: idle.y };
    this.target = { scale: idle.scale, y: idle.y };
    this.velocity = { scale: 0, y: 0 };

    this._running = false;
    this._raf = null;
    this._done = true;

    this._apply();
  }

  /** Make idle state smaller (called after dismiss) */
  setShrink(amount) {
    this._shrink = amount;
  }

  /** Trigger zoom to full viewport (scale=1, y=0) */
  zoomIn() {
    this.target.scale = 1.0;
    this.target.y = 0;
    this._done = false;
    this._startLoop();
  }

  /** Zoom back out to idle (smaller after each dismiss) */
  zoomOut() {
    const idle = getIdleParams();
    this.idleScale = Math.max(0.2, idle.scale - this._shrink);
    this.idleY = idle.y + this._shrink * 10;
    this.target.scale = this.idleScale;
    this.target.y = this.idleY;
    this._done = false;
    this._startLoop();
  }

  /** Get current zoom progress 0..1 */
  get progress() {
    return Math.max(0, Math.min(1, (this.current.scale - this.idleScale) / (1.0 - this.idleScale)));
  }

  _startLoop() {
    if (this._running) return;
    this._running = true;
    this._loop();
  }

  _loop() {
    if (!this._running) return;
    this._raf = requestAnimationFrame(() => this._loop());

    // Spring physics
    this.velocity.scale *= this.damping;
    this.velocity.scale += (this.target.scale - this.current.scale) * this.stiffness;
    this.current.scale += this.velocity.scale;

    this.velocity.y *= this.damping;
    this.velocity.y += (this.target.y - this.current.y) * this.stiffness;
    this.current.y += this.velocity.y;

    // Check convergence
    const dScale = Math.abs(this.target.scale - this.current.scale);
    const dY = Math.abs(this.target.y - this.current.y);
    const vMag = Math.abs(this.velocity.scale) + Math.abs(this.velocity.y);

    this.onProgress(this.progress);

    if (dScale < this.threshold && dY < this.threshold && vMag < this.threshold) {
      this.current.scale = this.target.scale;
      this.current.y = this.target.y;
      this._running = false;
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = null;
      if (!this._done) {
        this._done = true;
        this.onComplete();
      }
    }

    this._apply();
  }

  _apply() {
    const s = this.current.scale;
    const y = this.current.y;
    this.el.style.transform = `scale(${s}) translateY(${y}%)`;
  }

  destroy() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }
}

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

    // Spring parameters (zoom-in only — zoom-out uses lerp)
    // stiffness: how hard the spring pulls toward target
    // damping: friction (higher = less overshoot, slower settle)
    // threshold: snap to target when this close
    this.stiffness = 0.09;
    this.damping = 0.82;
    this.threshold = 0.005;

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
    this._direction = null; // 'in' or 'out'

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
    this._direction = 'in';
    this._startLoop();
  }

  /** Zoom back out to idle (smaller after each dismiss) */
  zoomOut() {
    const idle = getIdleParams();
    this.idleScale = Math.max(0.2, idle.scale - this._shrink);
    this.idleY = idle.y + this._shrink * 10;
    this.target.scale = this.idleScale;
    this.target.y = this.idleY;
    // Ensure current state is valid (swipe dismiss may have cleared element transform)
    if (this.current.scale < this.idleScale) {
      this.current.scale = 1.0;
      this.current.y = 0;
    }
    this.velocity.scale = 0;
    this.velocity.y = 0;
    this._done = false;
    this._direction = 'out';
    this._startLoop();
  }

  /** Get current zoom progress 0..1 */
  get progress() {
    return Math.max(0, Math.min(1, (this.current.scale - this.idleScale) / (1.0 - this.idleScale)));
  }

  _startLoop() {
    if (this._running) return; // already animating — target change is enough
    this._running = true;
    this._loop();
  }

  _loop() {
    if (!this._running) return;
    this._raf = requestAnimationFrame(() => this._loop());

    if (this._direction === 'out') {
      // Zoom-out: smooth exponential lerp (no spring, zero wobble)
      const lerpRate = 0.10;
      this.current.scale += (this.target.scale - this.current.scale) * lerpRate;
      this.current.y += (this.target.y - this.current.y) * lerpRate;
    } else {
      // Zoom-in: spring physics for snappy organic feel
      this.velocity.scale *= this.damping;
      this.velocity.scale += (this.target.scale - this.current.scale) * this.stiffness;
      this.current.scale += this.velocity.scale;

      this.velocity.y *= this.damping;
      this.velocity.y += (this.target.y - this.current.y) * this.stiffness;
      this.current.y += this.velocity.y;
    }

    // Check convergence
    const dScale = Math.abs(this.target.scale - this.current.scale);
    const dY = Math.abs(this.target.y - this.current.y);
    const vMag = this._direction === 'out' ? 0 : Math.abs(this.velocity.scale) + Math.abs(this.velocity.y);

    this.onProgress(this.progress, this._direction);

    const t = this._direction === 'out' ? 0.002 : this.threshold;
    if (dScale < t && dY < t && vMag < t) {
      this.current.scale = this.target.scale;
      this.current.y = this.target.y;
      this.velocity.scale = 0;
      this.velocity.y = 0;
      this._running = false;
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = null;
      if (!this._done) {
        this._done = true;
        this.onComplete(this._direction);
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

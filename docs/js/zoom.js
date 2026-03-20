/**
 * Terminal zoom animation — damped spring physics.
 * Adapted from wobble-project's lerp + GSAP snap interaction
 * that creates natural acceleration → deceleration → soft approach stop.
 *
 * Physics model:
 *   velocity *= damping
 *   velocity += (target - current) * stiffness
 *   current += velocity
 *
 * This creates overshoots on fast transitions and smooth asymptotic approach.
 */

export class ZoomController {
  constructor(element, opts = {}) {
    this.el = element;
    this.onComplete = opts.onComplete || (() => {});
    this.onProgress = opts.onProgress || (() => {});

    // Spring parameters (tuned for "smoothest zoom ever")
    this.stiffness = 0.045;
    this.damping = 0.88;
    this.threshold = 0.001;   // Stop when delta < this

    // State
    this.current = { scale: 0.42, y: 8 }; // idle position (matches CSS .idle)
    this.target = { scale: 0.42, y: 8 };
    this.velocity = { scale: 0, y: 0 };

    this._running = false;
    this._raf = null;
    this._done = true;

    this._apply();
  }

  /** Trigger zoom to full viewport (scale=1, y=0) */
  zoomIn() {
    this.target.scale = 1.0;
    this.target.y = 0;
    this._done = false;
    this._startLoop();
  }

  /** Zoom back out to idle */
  zoomOut() {
    this.target.scale = 0.42;
    this.target.y = 8;
    this._done = false;
    this._startLoop();
  }

  /** Get current zoom progress 0..1 */
  get progress() {
    return (this.current.scale - 0.42) / (1.0 - 0.42);
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

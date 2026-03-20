/**
 * Predictive-back swipe dismiss — ported from Android Quickstep physics.
 *
 * Physics from:
 *   frameworks/base/.../dynamicanimation/SpringForce.java
 *   launcher3/src/.../anim/SpringAnimationBuilder.java
 *
 * Spring equation (underdamped):
 *   x(t) = e^(-β·t/2) · (a·cos(γ·t) + b·sin(γ·t)) + end
 *   v(t) = e^(-β·t/2) · ((2aγ + βb)·sin(γt) + (aβ − 2bγ)·cos(γt)) / 2
 *
 * where:
 *   β = 2 · dampingRatio · √stiffness
 *   γ = √stiffness · √(1 − dampingRatio²)
 *   a = startValue − endValue
 *   b = (β·a)/(2γ) + startVelocity/γ
 */

// ── Android SpringForce constants ──
const STIFFNESS_MEDIUM = 1500;
const STIFFNESS_LOW = 200;
const DAMPING_RATIO_MEDIUM_BOUNCY = 0.5;
const DAMPING_RATIO_LOW_BOUNCY = 0.75;

// ── Gesture config (matches Quickstep behavior) ──
const FLING_VELOCITY_THRESHOLD = 800;   // px/s — fling dismiss if exceeded
const MIN_DRAG_DISTANCE = 12;           // px — dead zone before gesture activates
const MAX_SCALE_DOWN = 0.88;            // min scale during drag (Android uses ~0.9)
const DRAG_SCALE_FACTOR = 0.00012;      // how fast scale shrinks per px² distance
const STRETCH_RESISTANCE = 0.4;         // rubber-band ratio (diminishing returns)
const MARGIN_MAX = 12;                  // px — max edge margin during drag

// ── Velocity tracker (rolling window like Android VelocityTracker) ──
class VelocityTracker {
  constructor(windowMs = 100) {
    this.windowMs = windowMs;
    this.samples = [];
  }

  addMovement(x, y, time) {
    this.samples.push({ x, y, t: time });
    // Prune old samples
    const cutoff = time - this.windowMs * 2;
    while (this.samples.length > 1 && this.samples[0].t < cutoff) {
      this.samples.shift();
    }
  }

  getVelocity() {
    if (this.samples.length < 2) return { vx: 0, vy: 0 };
    const now = this.samples[this.samples.length - 1];
    // Find sample closest to windowMs ago
    let prev = this.samples[0];
    for (const s of this.samples) {
      if (now.t - s.t <= this.windowMs) { prev = s; break; }
    }
    const dt = (now.t - prev.t) / 1000;
    if (dt < 0.001) return { vx: 0, vy: 0 };
    return {
      vx: (now.x - prev.x) / dt,
      vy: (now.y - prev.y) / dt,
    };
  }

  clear() { this.samples = []; }
}

// ── Underdamped spring solver ──
function createSpring(stiffness, dampingRatio) {
  const omega = Math.sqrt(stiffness);         // natural frequency
  const beta = 2 * dampingRatio * omega;       // damping coefficient
  const gamma = omega * Math.sqrt(1 - dampingRatio * dampingRatio); // damped frequency

  return {
    /**
     * Solve spring from startVal to endVal with initial velocity.
     * Returns a function of time (seconds) → { value, velocity, atRest }
     */
    solve(startVal, endVal, startVelocity) {
      const a = startVal - endVal;
      const b = (beta * a) / (2 * gamma) + startVelocity / gamma;
      const threshold = 0.5;          // px — "at rest" threshold (≈ 1dp)
      const velThreshold = threshold * omega * 0.65; // THRESHOLD_MULTIPLIER

      return (t) => {
        const exp = Math.exp(-beta * t / 2);
        const cosG = Math.cos(gamma * t);
        const sinG = Math.sin(gamma * t);

        const value = exp * (a * cosG + b * sinG) + endVal;
        const velocity = exp * (
          (2 * a * gamma + beta * b) * sinG +
          (a * beta - 2 * b * gamma) * cosG
        ) / 2;

        const atRest = Math.abs(value - endVal) < threshold &&
                       Math.abs(velocity) < velThreshold;

        return { value, velocity, atRest };
      };
    }
  };
}

// ── Main SwipeDismiss controller ──
export class SwipeDismiss {
  /**
   * @param {HTMLElement} el — the element to make swipeable
   * @param {Object} opts
   * @param {Function} opts.onDismiss — called when dismissed
   * @param {Function} opts.onSnapBack — called when snapped back
   * @param {Function} opts.canSwipe — return true if swipe is allowed
   */
  constructor(el, opts = {}) {
    this.el = el;
    this.onDismiss = opts.onDismiss || (() => {});
    this.onSnapBack = opts.onSnapBack || (() => {});
    this.canSwipe = opts.canSwipe || (() => true);

    this._tracker = new VelocityTracker(100);
    this._gesture = null;   // active gesture state
    this._raf = null;
    this._animating = false;

    // Snap-back spring: medium stiffness, medium bouncy
    this._snapSpring = createSpring(STIFFNESS_MEDIUM, DAMPING_RATIO_MEDIUM_BOUNCY);
    // Dismiss spring: lower stiffness for fluid exit
    this._dismissSpring = createSpring(STIFFNESS_LOW, DAMPING_RATIO_LOW_BOUNCY);

    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);

    el.addEventListener('touchstart', this._onTouchStart, { passive: true });
    el.addEventListener('touchmove', this._onTouchMove, { passive: true });
    el.addEventListener('touchend', this._onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', this._onTouchEnd, { passive: true });
  }

  _onTouchStart(e) {
    if (!this.canSwipe() || this._animating) return;
    const t = e.touches[0];
    this._tracker.clear();
    this._tracker.addMovement(t.clientX, t.clientY, performance.now());
    this._gesture = {
      sx: t.clientX,
      sy: t.clientY,
      dx: 0,
      dy: 0,
      active: false,
    };
  }

  _onTouchMove(e) {
    if (!this._gesture) return;
    const t = e.touches[0];
    const now = performance.now();
    this._tracker.addMovement(t.clientX, t.clientY, now);

    this._gesture.dx = t.clientX - this._gesture.sx;
    this._gesture.dy = t.clientY - this._gesture.sy;
    const dist = Math.sqrt(this._gesture.dx ** 2 + this._gesture.dy ** 2);

    // Dead zone
    if (!this._gesture.active && dist < MIN_DRAG_DISTANCE) return;

    if (!this._gesture.active) {
      this._gesture.active = true;
      this.el.style.willChange = 'transform';
      this.el.style.transition = 'none';
    }

    // Rubber-band stretch (diminishing returns via sqrt)
    const rawDist = dist;
    const stretchDist = Math.sign(1) * Math.sqrt(rawDist) * Math.sqrt(rawDist) * STRETCH_RESISTANCE;
    const angle = Math.atan2(this._gesture.dy, this._gesture.dx);
    const tx = Math.cos(angle) * stretchDist;
    const ty = Math.sin(angle) * stretchDist;

    // Scale: shrinks proportional to distance² (capped)
    const scale = Math.max(MAX_SCALE_DOWN, 1 - rawDist * rawDist * DRAG_SCALE_FACTOR);

    // Edge margin (subtle inset as you drag)
    const margin = Math.min(MARGIN_MAX, rawDist * 0.04);

    this.el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    this.el.style.borderRadius = `${8 + margin}px`;
  }

  _onTouchEnd() {
    if (!this._gesture || !this._gesture.active) {
      this._gesture = null;
      return;
    }

    const { vx, vy } = this._tracker.getVelocity();
    const speed = Math.sqrt(vx * vx + vy * vy);
    const dist = Math.sqrt(this._gesture.dx ** 2 + this._gesture.dy ** 2);

    // Current transform values
    const stretchDist = dist * STRETCH_RESISTANCE;
    const angle = Math.atan2(this._gesture.dy, this._gesture.dx);
    const currentTx = Math.cos(angle) * stretchDist;
    const currentTy = Math.sin(angle) * stretchDist;
    const currentScale = Math.max(MAX_SCALE_DOWN, 1 - dist * dist * DRAG_SCALE_FACTOR);

    this._gesture = null;
    this.el.style.willChange = '';

    if (speed > FLING_VELOCITY_THRESHOLD) {
      // ── FLING DISMISS ──
      this._animateDismiss(currentTx, currentTy, currentScale, vx, vy);
    } else {
      // ── SNAP BACK ──
      this._animateSnapBack(currentTx, currentTy, currentScale);
    }
  }

  _animateSnapBack(fromTx, fromTy, fromScale) {
    this._animating = true;
    const springX = this._snapSpring.solve(fromTx, 0, 0);
    const springY = this._snapSpring.solve(fromTy, 0, 0);
    const springS = this._snapSpring.solve(fromScale, 1, 0);

    const t0 = performance.now();
    const maxDuration = 600; // ms safety cap

    const tick = () => {
      const elapsed = (performance.now() - t0) / 1000;

      const sx = springX(elapsed);
      const sy = springY(elapsed);
      const ss = springS(elapsed);

      this.el.style.transform = `translate(${sx.value}px, ${sy.value}px) scale(${ss.value})`;
      this.el.style.borderRadius = '';

      if ((sx.atRest && sy.atRest && ss.atRest) || elapsed * 1000 > maxDuration) {
        this.el.style.transform = '';
        this.el.style.transition = '';
        this._animating = false;
        this.onSnapBack();
        return;
      }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  _animateDismiss(fromTx, fromTy, fromScale, vx, vy) {
    this._animating = true;

    // Fling target: project forward from velocity
    const speed = Math.sqrt(vx * vx + vy * vy);
    const flingAngle = Math.atan2(vy, vx);
    const targetDist = Math.max(600, speed * 0.4); // at least 600px out
    const targetTx = Math.cos(flingAngle) * targetDist;
    const targetTy = Math.sin(flingAngle) * targetDist;

    // Use dismiss spring with initial velocity for natural deceleration
    const springX = this._dismissSpring.solve(fromTx, targetTx, vx * 0.3);
    const springY = this._dismissSpring.solve(fromTy, targetTy, vy * 0.3);
    const springS = this._dismissSpring.solve(fromScale, 0.3, -2);

    const t0 = performance.now();
    const dismissDuration = 350; // ms
    let dismissed = false;

    const tick = () => {
      const elapsed = (performance.now() - t0) / 1000;
      const progress = Math.min(1, (performance.now() - t0) / dismissDuration);

      const sx = springX(elapsed);
      const sy = springY(elapsed);
      const ss = springS(elapsed);

      // Fade out as it flies away
      const opacity = Math.max(0, 1 - progress * 1.5);

      this.el.style.transform = `translate(${sx.value}px, ${sy.value}px) scale(${ss.value})`;
      this.el.style.opacity = String(opacity);

      if (progress >= 1) {
        this.el.style.transform = '';
        this.el.style.opacity = '';
        this.el.style.transition = '';
        this.el.style.borderRadius = '';
        this._animating = false;
        if (!dismissed) { dismissed = true; this.onDismiss(); }
        return;
      }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this.el.removeEventListener('touchstart', this._onTouchStart);
    this.el.removeEventListener('touchmove', this._onTouchMove);
    this.el.removeEventListener('touchend', this._onTouchEnd);
    this.el.removeEventListener('touchcancel', this._onTouchEnd);
  }
}

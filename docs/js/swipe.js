/**
 * Swipe-to-dismiss — critically damped (no wobble).
 *
 * Simplified from Android Quickstep physics.
 * Uses critically damped spring (dampingRatio=1.0) for all animations
 * so there is ZERO oscillation / wobble.
 */

// ── Critically damped spring (no wobble, dampingRatio = 1.0) ──
// x(t) = (A + B·t) · e^(-ω₀·t) + endVal
// v(t) = (B - ω₀·(A + B·t)) · e^(-ω₀·t)
function createCriticalSpring(stiffness) {
  const omega0 = Math.sqrt(stiffness);

  return {
    solve(startVal, endVal, v0) {
      const A = startVal - endVal;
      const B = v0 + omega0 * A;
      const threshold = 0.5;
      const velThreshold = threshold * 50;

      return (t) => {
        const exp = Math.exp(-omega0 * t);
        const value = (A + B * t) * exp + endVal;
        const velocity = (B - omega0 * (A + B * t)) * exp;
        const atRest = Math.abs(value - endVal) < threshold &&
                       Math.abs(velocity) < velThreshold;
        return { value, velocity, atRest };
      };
    }
  };
}

// ── Gesture thresholds — very easy to trigger ──
const FLING_VELOCITY_THRESHOLD = 300;  // px/s — low bar for fling
const MIN_DRAG_DISTANCE = 6;          // px — tiny dead zone
const DISMISS_DURATION = 280;         // ms

// ── Velocity tracker ──
class VelocityTracker {
  constructor(windowMs = 100) {
    this.windowMs = windowMs;
    this.samples = [];
  }

  addMovement(x, y, time) {
    this.samples.push({ x, y, t: time });
    const cutoff = time - this.windowMs * 3;
    while (this.samples.length > 2 && this.samples[0].t < cutoff) {
      this.samples.shift();
    }
  }

  getVelocity() {
    if (this.samples.length < 2) return { vx: 0, vy: 0 };
    const now = this.samples[this.samples.length - 1];
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

// ── Main SwipeDismiss controller ──
export class SwipeDismiss {
  constructor(el, opts = {}) {
    this.el = el;
    this.onDismiss = opts.onDismiss || (() => {});
    this.onSnapBack = opts.onSnapBack || (() => {});
    this.canSwipe = opts.canSwipe || (() => true);

    this._tracker = new VelocityTracker(100);
    this._gesture = null;
    this._raf = null;
    this._animating = false;

    // Critically damped springs — NO wobble at all
    this._snapSpring = createCriticalSpring(900);   // fast snap back
    this._dismissSpring = createCriticalSpring(400); // smooth exit

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
    this._tracker.addMovement(t.clientX, t.clientY, performance.now());

    this._gesture.dx = t.clientX - this._gesture.sx;
    this._gesture.dy = t.clientY - this._gesture.sy;
    const dist = Math.sqrt(this._gesture.dx ** 2 + this._gesture.dy ** 2);

    if (!this._gesture.active && dist < MIN_DRAG_DISTANCE) return;

    if (!this._gesture.active) {
      this._gesture.active = true;
      this.el.style.willChange = 'transform';
      this.el.style.transition = 'none';
    }

    // Simple 1:1 drag with scale reduction — no complex easing during drag
    const maxDrag = 200;
    const progress = Math.min(1, dist / maxDrag);
    const scale = 1.0 - progress * 0.15; // scale down to 0.85 max
    const tx = this._gesture.dx * 0.6;   // slight resistance
    const ty = this._gesture.dy * 0.6;

    this.el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    this.el.style.borderRadius = `${8 + progress * 8}px`;
  }

  _onTouchEnd() {
    if (!this._gesture || !this._gesture.active) {
      this._gesture = null;
      return;
    }

    const { vx, vy } = this._tracker.getVelocity();
    const speed = Math.sqrt(vx * vx + vy * vy);
    const dist = Math.sqrt(this._gesture.dx ** 2 + this._gesture.dy ** 2);

    // Read current visual state
    const maxDrag = 200;
    const progress = Math.min(1, dist / maxDrag);
    const currentScale = 1.0 - progress * 0.15;
    const currentTx = this._gesture.dx * 0.6;
    const currentTy = this._gesture.dy * 0.6;

    this._gesture = null;
    this.el.style.willChange = '';

    // Dismiss if fling OR dragged far enough (>25% of threshold)
    if (speed > FLING_VELOCITY_THRESHOLD || dist > 50) {
      this._animateDismiss(currentTx, currentTy, currentScale, vx, vy);
    } else {
      this._animateSnapBack(currentTx, currentTy, currentScale);
    }
  }

  _animateSnapBack(fromTx, fromTy, fromScale) {
    this._animating = true;
    const springX = this._snapSpring.solve(fromTx, 0, 0);
    const springY = this._snapSpring.solve(fromTy, 0, 0);
    const springS = this._snapSpring.solve(fromScale, 1, 0);

    const t0 = performance.now();
    const maxDuration = 500;

    const tick = () => {
      const elapsed = (performance.now() - t0) / 1000;
      const sx = springX(elapsed);
      const sy = springY(elapsed);
      const ss = springS(elapsed);

      this.el.style.transform = `translate(${sx.value}px, ${sy.value}px) scale(${ss.value})`;

      if ((sx.atRest && sy.atRest && ss.atRest) || elapsed * 1000 > maxDuration) {
        this.el.style.transform = '';
        this.el.style.transition = '';
        this.el.style.borderRadius = '';
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

    // Fling direction
    const angle = Math.atan2(vy, vx);
    const speed = Math.sqrt(vx * vx + vy * vy);
    const targetDist = Math.max(400, speed * 0.3);
    const targetTx = fromTx + Math.cos(angle) * targetDist;
    const targetTy = fromTy + Math.sin(angle) * targetDist;

    const t0 = performance.now();
    let dismissed = false;

    const tick = () => {
      const elapsedMs = performance.now() - t0;
      const t = elapsedMs / 1000;
      const progress = Math.min(1, elapsedMs / DISMISS_DURATION);

      // Smooth ease-out for position (no spring wobble)
      const ease = 1 - Math.pow(1 - progress, 3); // cubic ease-out
      const tx = fromTx + (targetTx - fromTx) * ease;
      const ty = fromTy + (targetTy - fromTy) * ease;
      const scale = fromScale + (0.3 - fromScale) * ease;
      const opacity = Math.max(0, 1 - progress * 1.5);

      this.el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
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

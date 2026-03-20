/**
 * Swipe-to-dismiss — ported from AOSP Quickstep.
 *
 * Sources (all from the URL the user shared):
 *   quickstep/.../LauncherBackAnimationController.java
 *     - MIN_WINDOW_SCALE = 0.85
 *     - mapRange(progress, 1, MIN_WINDOW_SCALE) for width
 *     - DecelerateInterpolator for vertical movement
 *     - BACK_GESTURE interpolator for progress
 *   quickstep/.../AbsSwipeUpHandler.java
 *     - quickstep_fling_threshold_speed = 0.5dp ≈ 500px/s at 2.5x
 *     - MAX_SWIPE_DURATION = 350ms
 *   res/values/config.xml
 *     - dismiss_task_trans_y_stiffness = 800
 *     - dismiss_task_trans_y_damping_ratio = 0.73
 *   quickstep/res/values/dimens.xml
 *     - max_task_dismiss_drag_velocity = 2.25dp
 *     - default_task_dismiss_drag_velocity = 1.5dp
 *
 * Spring: critically damped (ζ=1) so there is ZERO oscillation.
 *   x(t) = (A + B·t) · e^(-ω₀·t) + endVal
 */

// ── AOSP constants ──
const MIN_WINDOW_SCALE = 0.85;        // LauncherBackAnimationController.java
const FLING_THRESHOLD_SPEED = 500;    // quickstep_fling_threshold_speed (0.5dp × ~1000)
const MAX_SWIPE_DURATION = 350;       // AbsSwipeUpHandler.java
const DISMISS_TASK_DURATION = 300;    // RecentsView.java
const MIN_DRAG_DISTANCE = 8;         // px dead zone

// ── Critically damped spring (ζ = 1.0, zero oscillation) ──
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

// ── Decelerate interpolator (matches Android's DecelerateInterpolator) ──
function decelerate(t) { return 1.0 - (1.0 - t) * (1.0 - t); }

// ── mapRange (from Utilities.java) ──
function mapRange(progress, min, max) { return min + progress * (max - min); }

// ── Velocity tracker ──
class VelocityTracker {
  constructor(windowMs = 100) {
    this.windowMs = windowMs;
    this.samples = [];
  }
  addMovement(x, y, time) {
    this.samples.push({ x, y, t: time });
    const cutoff = time - this.windowMs * 3;
    while (this.samples.length > 2 && this.samples[0].t < cutoff) this.samples.shift();
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
    return { vx: (now.x - prev.x) / dt, vy: (now.y - prev.y) / dt };
  }
  clear() { this.samples = []; }
}

// ── SwipeDismiss ──
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

    // Snap-back: dismiss_task spring (stiffness=800, ζ→clamped to 1.0 for no wobble)
    this._snapSpring = createCriticalSpring(800);
    // Dismiss exit
    this._dismissSpring = createCriticalSpring(400);

    this._bind('touchstart', '_onTouchStart');
    this._bind('touchmove', '_onTouchMove');
    this._bind('touchend', '_onTouchEnd');
    this._bind('touchcancel', '_onTouchEnd');
  }

  _bind(event, method) {
    this['_h_' + event] = this[method].bind(this);
    this.el.addEventListener(event, this['_h_' + event], { passive: true });
  }

  _onTouchStart(e) {
    if (!this.canSwipe() || this._animating) return;
    const t = e.touches[0];
    this._tracker.clear();
    this._tracker.addMovement(t.clientX, t.clientY, performance.now());
    this._gesture = {
      sx: t.clientX, sy: t.clientY,
      dx: 0, dy: 0,
      active: false,
      screenW: window.innerWidth,
      screenH: window.innerHeight,
      // Detect swipe edge (left/right third of screen)
      edge: t.clientX < window.innerWidth / 3 ? 'left' :
            t.clientX > window.innerWidth * 2 / 3 ? 'right' : 'center',
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

    // ── LauncherBackAnimationController.updateBackProgress() ──
    const { screenW, screenH } = this._gesture;
    const maxDist = Math.min(screenW, screenH) * 0.4;
    const progress = Math.min(1, dist / maxDist);

    // Width/height: mapRange(progress, 1, MIN_WINDOW_SCALE)
    const scale = mapRange(progress, 1.0, MIN_WINDOW_SCALE);

    // Vertical delta with DecelerateInterpolator
    const rawYDelta = this._gesture.dy;
    const ySign = rawYDelta < 0 ? -1 : 1;
    const deltaYRatio = Math.min(1, Math.abs(rawYDelta) / (screenH * 0.5));
    const interpY = decelerate(deltaYRatio);
    const maxYShift = Math.max(0, (screenH - screenH * scale) * 0.5 - 8);
    const deltaY = ySign * interpY * maxYShift;

    // Horizontal: follows drag with slight resistance
    const tx = this._gesture.dx * 0.5;
    const ty = deltaY;

    this.el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    this.el.style.borderRadius = `${mapRange(progress, 8, 20)}px`;
  }

  _onTouchEnd() {
    if (!this._gesture || !this._gesture.active) {
      this._gesture = null;
      return;
    }

    const { vx, vy } = this._tracker.getVelocity();
    const speed = Math.sqrt(vx * vx + vy * vy);
    const dist = Math.sqrt(this._gesture.dx ** 2 + this._gesture.dy ** 2);
    const { screenW, screenH } = this._gesture;
    const maxDist = Math.min(screenW, screenH) * 0.4;
    const progress = Math.min(1, dist / maxDist);

    // Current visual state
    const currentScale = mapRange(progress, 1.0, MIN_WINDOW_SCALE);
    const rawYDelta = this._gesture.dy;
    const ySign = rawYDelta < 0 ? -1 : 1;
    const deltaYRatio = Math.min(1, Math.abs(rawYDelta) / (screenH * 0.5));
    const maxYShift = Math.max(0, (screenH - screenH * currentScale) * 0.5 - 8);
    const currentTx = this._gesture.dx * 0.5;
    const currentTy = ySign * decelerate(deltaYRatio) * maxYShift;

    this._gesture = null;
    this.el.style.willChange = '';

    // Fling detection: AbsSwipeUpHandler.java uses quickstep_fling_threshold_speed
    const isFling = speed > FLING_THRESHOLD_SPEED;
    // Also dismiss if dragged > 40% of threshold distance (significant move)
    const isSignificant = dist > 60;

    if (isFling || isSignificant) {
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
    const tick = () => {
      const elapsed = (performance.now() - t0) / 1000;
      const sx = springX(elapsed);
      const sy = springY(elapsed);
      const ss = springS(elapsed);

      this.el.style.transform = `translate(${sx.value}px, ${sy.value}px) scale(${ss.value})`;
      this.el.style.borderRadius = `${mapRange(Math.max(0, 1 - ss.value), 0, 12)}px`;

      if ((sx.atRest && sy.atRest && ss.atRest) || elapsed > 0.5) {
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

    // Project fling trajectory: MAX_SWIPE_DURATION = 350ms
    const angle = Math.atan2(vy, vx);
    const speed = Math.sqrt(vx * vx + vy * vy);
    const targetDist = Math.max(300, speed * 0.3);
    const targetTx = fromTx + Math.cos(angle) * targetDist;
    const targetTy = fromTy + Math.sin(angle) * targetDist;

    const t0 = performance.now();
    let dismissed = false;

    const tick = () => {
      const elapsedMs = performance.now() - t0;
      const progress = Math.min(1, elapsedMs / DISMISS_TASK_DURATION);

      // Cubic ease-out (smooth deceleration, no wobble)
      const ease = 1 - Math.pow(1 - progress, 3);
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
    for (const evt of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      if (this['_h_' + evt]) this.el.removeEventListener(evt, this['_h_' + evt]);
    }
  }
}

/**
 * Predictive-back swipe dismiss — ported from Android Quickstep/SystemUI.
 *
 * Sources:
 *   frameworks/base/.../dynamicanimation/SpringForce.java
 *   launcher3/src/.../anim/SpringAnimationBuilder.java
 *   launcher3/res/values/config.xml (dismiss_task_trans_y_*)
 *   frameworks/base/.../animation/back/BackAnimationSpec.kt
 *   frameworks/base/.../animation/FlingAnimation.java
 *   frameworks/libs/systemui/.../Interpolators.java
 *
 * Spring equation (underdamped):
 *   x(t) = e^(-ζω₀t) · (A·cos(ωd·t) + B·sin(ωd·t)) + end
 *   where ω₀ = √stiffness, ωd = ω₀·√(1−ζ²), ζ = dampingRatio
 *         A = start − end
 *         B = (2ζω₀·A)/(2ωd) + v₀/ωd
 *
 * Fling deceleration:
 *   x(t) = x₀ − v₀/f + (v₀/f)·e^(f·t)     [f = DEFAULT_FRICTION = -4.2]
 */

// ── SpringForce.java constants ──
const STIFFNESS_HIGH = 10000;
const STIFFNESS_MEDIUM = 1500;
const STIFFNESS_LOW = 200;
const DAMPING_RATIO_MEDIUM_BOUNCY = 0.5;
const DAMPING_RATIO_LOW_BOUNCY = 0.75;

// ── Launcher3 config.xml — task dismiss spring ──
const DISMISS_STIFFNESS = 800;
const DISMISS_DAMPING = 0.73;

// ── FlingAnimation.java ──
const FLING_FRICTION = -4.2;

// ── BackAnimationSpec.kt — predictive back transform ──
const BACK_MIN_SCALE = 0.8;           // dismissAppForSysUi minScale
const BACK_MAX_MARGIN_PX = 8;         // maxMarginX/Y (dp, but we use px for web)

// ── Interpolators.java — BACK_GESTURE cubic bezier ──
// cubic-bezier(0.1, 0.1, 0.0, 1.0)
function backGestureEasing(t) {
  // Attempt Bézier via De Casteljau with control points (0.1,0.1) (0.0,1.0)
  // Approximation: aggressive ease-out
  return cubicBezierApprox(0.1, 0.1, 0.0, 1.0, t);
}

// Fast cubic-bezier approximation (Newton-Raphson, 4 iterations)
function cubicBezierApprox(x1, y1, x2, y2, t) {
  // Find t parameter for given x using Newton's method
  let ct = t;
  for (let i = 0; i < 4; i++) {
    const cx = 3 * x1 * ct * (1 - ct) * (1 - ct) + 3 * x2 * ct * ct * (1 - ct) + ct * ct * ct;
    const dx = 3 * x1 * (1 - ct) * (1 - ct) + 6 * (x2 - x1) * ct * (1 - ct) + 3 * (1 - x2) * ct * ct;
    if (Math.abs(dx) < 1e-6) break;
    ct -= (cx - t) / dx;
    ct = Math.max(0, Math.min(1, ct));
  }
  return 3 * y1 * ct * (1 - ct) * (1 - ct) + 3 * y2 * ct * ct * (1 - ct) + ct * ct * ct;
}

// ── Gesture thresholds (from PagedView.java / dimens.xml) ──
const FLING_VELOCITY_THRESHOLD = 500;  // fling_threshold_velocity (500dp)
const MIN_FLING_VELOCITY = 250;        // min_fling_velocity
const SIGNIFICANT_MOVE_RATIO = 0.33;   // RETURN_TO_ORIGINAL_PAGE_THRESHOLD
const MIN_DRAG_DISTANCE = 10;          // dead zone (px)
const DISMISS_DURATION = 300;          // DISMISS_TASK_DURATION (ms)

// ── Velocity tracker (matches Android VelocityTracker 1-pointer, 100ms window) ──
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
    // Use sample closest to windowMs ago for stable velocity
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

// ── Underdamped spring solver (from SpringForce.java updateValues) ──
function createSpring(stiffness, dampingRatio) {
  const omega0 = Math.sqrt(stiffness);
  const zeta = dampingRatio;
  const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
  const beta = 2 * zeta * omega0;

  return {
    solve(startVal, endVal, v0) {
      const A = startVal - endVal;
      const B = (beta * A) / (2 * omegaD) + v0 / omegaD;
      // Rest detection thresholds (from SpringForce.java)
      const valueThreshold = 0.5;  // ~1dp in px
      const velThreshold = valueThreshold * 62.5; // * (1000/16)

      return (t) => {
        const envelope = Math.exp(-zeta * omega0 * t);
        const cosW = Math.cos(omegaD * t);
        const sinW = Math.sin(omegaD * t);

        const value = envelope * (A * cosW + B * sinW) + endVal;
        // derivative
        const velocity = envelope * (
          (B * omegaD - A * zeta * omega0) * cosW -
          (A * omegaD + B * zeta * omega0) * sinW
        );

        const atRest = Math.abs(value - endVal) < valueThreshold &&
                       Math.abs(velocity) < velThreshold;

        return { value, velocity, atRest };
      };
    }
  };
}

// ── Fling deceleration (from FlingAnimation.java) ──
function flingPosition(startPos, v0, t) {
  const f = FLING_FRICTION;
  return startPos - v0 / f + (v0 / f) * Math.exp(f * t);
}

function flingVelocity(v0, t) {
  return v0 * Math.exp(FLING_FRICTION * t);
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

    // Snap-back: Launcher3 dismiss_task spring (stiffness=800, damping=0.73)
    this._snapSpring = createSpring(DISMISS_STIFFNESS, DISMISS_DAMPING);
    // Dismiss exit: low stiffness for fluid deceleration
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
      screenW: window.innerWidth,
      screenH: window.innerHeight,
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

    // ── Predictive back transform (from BackAnimationSpec.kt) ──
    // Progress: how far through the gesture (0→1)
    const maxDragDist = Math.min(this._gesture.screenW, this._gesture.screenH) * 0.5;
    const progressRaw = Math.min(1, dist / maxDragDist);

    // Apply BACK_GESTURE easing to progress for scale
    const progressEased = backGestureEasing(progressRaw);

    // Scale: 1.0 → BACK_MIN_SCALE (0.8) via eased progress
    const minScaleReversed = 1.0 - BACK_MIN_SCALE;
    const scale = 1.0 - progressEased * minScaleReversed;

    // Translation: rubber-band with diminishing returns
    // Max translation limited by scale margin (like Android)
    const maxTxByScale = (this._gesture.screenW - this._gesture.screenW * BACK_MIN_SCALE) / 2;
    const maxTx = maxTxByScale - BACK_MAX_MARGIN_PX;
    const angle = Math.atan2(this._gesture.dy, this._gesture.dx);
    const tx = Math.cos(angle) * Math.min(dist * 0.45, maxTx) * progressEased;
    const ty = Math.sin(angle) * Math.min(dist * 0.45, maxTx) * progressEased;

    // Border radius increases with progress (Android adds margin)
    const marginProgress = backGestureEasing(progressRaw);
    const margin = marginProgress * BACK_MAX_MARGIN_PX;

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
    const maxDragDist = Math.min(this._gesture.screenW, this._gesture.screenH) * 0.5;
    const progressRaw = Math.min(1, dist / maxDragDist);

    // Read current visual state
    const progressEased = backGestureEasing(progressRaw);
    const currentScale = 1.0 - progressEased * (1.0 - BACK_MIN_SCALE);
    const maxTxByScale = (this._gesture.screenW - this._gesture.screenW * BACK_MIN_SCALE) / 2;
    const maxTx = maxTxByScale - BACK_MAX_MARGIN_PX;
    const angle = Math.atan2(this._gesture.dy, this._gesture.dx);
    const currentTx = Math.cos(angle) * Math.min(dist * 0.45, maxTx) * progressEased;
    const currentTy = Math.sin(angle) * Math.min(dist * 0.45, maxTx) * progressEased;

    this._gesture = null;
    this.el.style.willChange = '';

    // Decision: fling velocity OR significant distance (Android uses both)
    const isFling = speed > FLING_VELOCITY_THRESHOLD;
    const isSignificantMove = progressRaw > SIGNIFICANT_MOVE_RATIO;

    if (isFling || isSignificantMove) {
      this._animateDismiss(currentTx, currentTy, currentScale, vx, vy, speed);
    } else {
      this._animateSnapBack(currentTx, currentTy, currentScale);
    }
  }

  _animateSnapBack(fromTx, fromTy, fromScale) {
    this._animating = true;

    // Use Launcher3 dismiss_task spring for snap-back (stiffness=800, damping=0.73)
    const springX = this._snapSpring.solve(fromTx, 0, 0);
    const springY = this._snapSpring.solve(fromTy, 0, 0);
    const springS = this._snapSpring.solve(fromScale, 1, 0);

    const t0 = performance.now();
    const maxDuration = 700; // safety cap (ms)

    const tick = () => {
      const elapsed = (performance.now() - t0) / 1000;
      const sx = springX(elapsed);
      const sy = springY(elapsed);
      const ss = springS(elapsed);

      this.el.style.transform = `translate(${sx.value}px, ${sy.value}px) scale(${ss.value})`;

      // Check spring equilibrium
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

  _animateDismiss(fromTx, fromTy, fromScale, vx, vy, speed) {
    this._animating = true;

    // Fling trajectory: use FlingAnimation.java deceleration model
    // Project where the fling will go using friction=-4.2
    const flingAngle = Math.atan2(vy, vx);
    // Clamp velocity to Launcher3 bounds (min 250, max 5000 px/s)
    const clampedSpeed = Math.max(MIN_FLING_VELOCITY, Math.min(5000, speed));
    const clampedVx = Math.cos(flingAngle) * clampedSpeed;
    const clampedVy = Math.sin(flingAngle) * clampedSpeed;

    const t0 = performance.now();
    let dismissed = false;

    const tick = () => {
      const elapsedMs = performance.now() - t0;
      const t = elapsedMs / 1000;
      const progress = Math.min(1, elapsedMs / DISMISS_DURATION);

      // Fling deceleration for position
      const tx = flingPosition(fromTx, clampedVx * 0.4, t);
      const ty = flingPosition(fromTy, clampedVy * 0.4, t);

      // Scale: spring to 0.3 (disappearing)
      const scaleT = this._dismissSpring.solve(fromScale, 0.3, -1.5)(t);

      // Opacity: linear fade synced to DISMISS_DURATION
      // Android uses INITIAL_DISMISS_TRANSLATION_INTERPOLATION_OFFSET = 0.55
      const opacity = Math.max(0, 1 - progress * 1.4);

      this.el.style.transform = `translate(${tx}px, ${ty}px) scale(${scaleT.value})`;
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

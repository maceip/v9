import gsap from 'gsap';

/**
 * Click-drag scrolling with inertia and snap-to-item.
 * Inspired by Kenta Toshikura's slideScroll system.
 *
 * - mousedown stores start position, mousemove accumulates delta
 * - scroll.x lerps toward scroll.delta each frame (smooth follow)
 * - On release, snaps to nearest item after a debounce
 */
export class DragScroll {
  constructor(canvas, itemCount, itemSpacing) {
    this.canvas = canvas;
    this.itemCount = itemCount;
    this.itemSpacing = itemSpacing;

    this.scroll = {
      delta: 0,    // target scroll position (set instantly by drag/wheel)
      x: 0,        // current scroll position (lerped toward delta)
      ease: 0.12,  // lerp factor per frame
    };

    this.drag = {
      active: false,
      startX: 0,
      startY: 0,
      startDelta: 0,
      moved: false,
    };

    this.snapTween = null;
    this.snapTimeout = null;
    this.snappedIndex = Math.floor(itemCount / 2); // start centered
    // Center the scroll so middle card is at center
    this.scroll.delta = 0;
    this.scroll.x = 0;

    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onWheel = this._onWheel.bind(this);

    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });

    // Touch
    canvas.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      this._onMouseDown({ clientX: t.clientX, clientY: t.clientY, preventDefault() {} });
    });
    canvas.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      this._onMouseMove({ clientX: t.clientX, clientY: t.clientY });
    });
    canvas.addEventListener('touchend', () => this._onMouseUp());
  }

  _onMouseDown(e) {
    this.drag.active = true;
    this.drag.moved = false;
    this.drag.startX = e.clientX;
    this.drag.startY = e.clientY;
    this.drag.startDelta = this.scroll.delta;
    this.canvas.classList.add('dragging');
    if (this.snapTween) this.snapTween.kill();
  }

  _onMouseMove(e) {
    if (!this.drag.active) return;
    const dx = this.drag.startX - e.clientX;
    const dy = this.drag.startY - e.clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 5) this.drag.moved = true;

    // Combined horizontal + vertical drag, negated for natural feel
    this.scroll.delta = this.drag.startDelta + dx * 2;
    this._scheduleSnap();
  }

  _onMouseUp() {
    this.drag.active = false;
    this.canvas.classList.remove('dragging');
    this._scheduleSnap();
  }

  _onWheel(e) {
    e.preventDefault();
    const d = e.deltaY || -e.wheelDelta || e.detail;
    const distance = d > 0 ? 1 : -1;
    this.scroll.delta += distance * this.itemSpacing * 0.4;
    this._scheduleSnap();
  }

  _scheduleSnap() {
    clearTimeout(this.snapTimeout);
    this.snapTimeout = setTimeout(() => this._snap(), 150);
  }

  _snap() {
    // Snap to nearest item
    const nearest = Math.round(this.scroll.delta / this.itemSpacing);
    const clamped = Math.max(0, Math.min(this.itemCount - 1, nearest));
    this.snappedIndex = clamped;
    if (this.snapTween) this.snapTween.kill();
    this.snapTween = gsap.to(this.scroll, {
      delta: clamped * this.itemSpacing,
      duration: 0.8,
      ease: 'power2.out',
    });
  }

  /** Call every frame to advance the lerp */
  update() {
    this.scroll.x += (this.scroll.delta - this.scroll.x) * this.scroll.ease;
  }

  /** Did the user just click without dragging? */
  wasClick() {
    return !this.drag.moved;
  }

  dispose() {
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('wheel', this._onWheel);
  }
}

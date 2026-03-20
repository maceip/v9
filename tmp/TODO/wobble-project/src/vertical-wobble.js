/**
 * Vertical Wobble Scroll
 *
 * The wobble effect uses a damped spring system:
 * - `target` is where the scroll should be (set by wheel input)
 * - `current` is the visual position (driven by spring physics)
 * - The spring overshoots the target and oscillates back
 *
 * This creates the characteristic "jelly" feel where content
 * bounces past its destination and settles.
 */

const viewport = document.getElementById('vscroll-viewport');
const content = document.getElementById('vscroll-content');
const speedFill = document.getElementById('speed-fill');
const sections = document.querySelectorAll('.vsection-inner');

if (viewport && content) {

  // ── Spring parameters ──
  // Stiffness: how fast it pulls toward target (higher = snappier)
  // Damping: how fast oscillation dies (higher = less wobble)
  // Mass: inertia (higher = more sluggish but more overshoot)
  const STIFFNESS = 0.045;
  const DAMPING = 0.72;       // < 1 means underdamped = wobble/overshoot

  const state = {
    target: 0,       // where scroll wants to go
    current: 0,      // where scroll visually IS
    velocity: 0,     // spring velocity — this is what creates overshoot
    totalHeight: 0,
    viewportHeight: 0,
    speed: { ratio: 0, smoothed: 0 },
    dir: 0,
    prevCurrent: 0,
    dragging: false,
    dragStartY: 0,
    dragStartScroll: 0,
  };

  function resize() {
    state.viewportHeight = viewport.clientHeight;
    state.totalHeight = content.scrollHeight;
  }

  // ── Wheel input ──
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 40;
    if (e.deltaMode === 2) delta *= state.viewportHeight;

    state.target += delta;
    clampTarget();
  }, { passive: false });

  // ── Touch / drag ──
  viewport.addEventListener('pointerdown', (e) => {
    state.dragging = true;
    state.dragStartY = e.clientY;
    state.dragStartScroll = state.target;
    state.velocity = 0;  // kill spring momentum on grab
  });
  window.addEventListener('pointermove', (e) => {
    if (!state.dragging) return;
    const dy = state.dragStartY - e.clientY;
    state.target = state.dragStartScroll + dy;
    clampTarget();
  });
  window.addEventListener('pointerup', () => { state.dragging = false; });

  function clampTarget() {
    const max = state.totalHeight - state.viewportHeight;
    state.target = Math.max(0, Math.min(state.target, max));
  }

  // ── Render loop ──
  function animate() {
    requestAnimationFrame(animate);

    // ── SPRING PHYSICS ──
    // Force = stiffness * (target - current)
    // Velocity is accumulated and damped each frame
    // This naturally overshoots and oscillates (wobble!)
    const displacement = state.target - state.current;
    const springForce = displacement * STIFFNESS;
    state.velocity += springForce;
    state.velocity *= DAMPING;
    state.current += state.velocity;

    // Snap when settled (prevent infinite micro-oscillation)
    if (Math.abs(displacement) < 0.3 && Math.abs(state.velocity) < 0.3) {
      state.current = state.target;
      state.velocity = 0;
    }

    // Apply transform
    content.style.transform = `translate3d(0, ${-state.current}px, 0)`;

    // ── Speed tracking ──
    const frameDelta = state.current - state.prevCurrent;
    state.dir = frameDelta > 0.5 ? 1 : frameDelta < -0.5 ? -1 : state.dir;
    const absSpeed = Math.abs(frameDelta);
    const maxSpeed = state.viewportHeight * 0.08;
    const rawRatio = Math.min(absSpeed / maxSpeed, 1);
    state.speed.smoothed += (rawRatio - state.speed.smoothed) * 0.12;
    state.speed.ratio = state.speed.smoothed;
    state.prevCurrent = state.current;

    // ── Speed-based visual effects ──
    const skew = state.speed.ratio * 4 * state.dir;
    const scaleY = 1 + state.speed.ratio * 0.015;
    sections.forEach((s) => {
      s.style.transform = `skewY(${skew}deg) scaleY(${scaleY})`;
    });

    // Speed bar indicator
    if (speedFill) {
      speedFill.style.height = `${state.speed.ratio * 100}%`;
    }
  }

  // ── Tab switching ──
  const tabs = document.querySelectorAll('.tab');
  const horizontalMode = document.getElementById('horizontal-mode');
  const verticalMode = document.getElementById('vertical-mode');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const mode = tab.dataset.mode;
      if (mode === 'vertical') {
        horizontalMode.style.display = 'none';
        verticalMode.style.display = 'block';
        document.body.style.overflow = 'hidden';
        resize();
      } else {
        horizontalMode.style.display = 'block';
        verticalMode.style.display = 'none';
      }
    });
  });

  // ── Auto-start in vertical mode ──
  if (horizontalMode) horizontalMode.style.display = 'none';
  if (verticalMode) verticalMode.style.display = 'block';
  const vertTab = document.querySelector('[data-mode="vertical"]');
  if (vertTab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    vertTab.classList.add('active');
  }

  window.addEventListener('resize', resize);
  resize();
  animate();
}

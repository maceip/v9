/**
 * Icon management — smooth floating + parallax for background icons.
 * All motion is driven by a single rAF loop with lerped values to
 * prevent jitter from CSS animation / layout conflicts.
 */

export function initIcons() {
  const bgIcons = document.querySelectorAll('.bg-icon');
  if (!bgIcons.length) return;

  const icons = Array.from(bgIcons).map((el, i) => {
    const depth = 0.3 + Math.random() * 0.7;
    const floatDur = 4 + Math.random() * 4;
    const floatPhase = Math.random() * Math.PI * 2;
    return { el, depth, floatDur, floatPhase, hovered: false };
  });

  // Track hover state per icon (so we don't fight the CSS hover transform)
  icons.forEach(icon => {
    icon.el.addEventListener('mouseenter', () => { icon.hovered = true; });
    icon.el.addEventListener('mouseleave', () => { icon.hovered = false; });
  });

  // Smoothed mouse position (lerped to prevent jitter)
  let targetMx = 0, targetMy = 0;
  let smoothMx = 0, smoothMy = 0;

  document.addEventListener('mousemove', (e) => {
    targetMx = (e.clientX / window.innerWidth - 0.5) * 2;
    targetMy = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  function tick() {
    requestAnimationFrame(tick);

    // Lerp mouse for smooth movement (0.08 = gentle lag)
    smoothMx += (targetMx - smoothMx) * 0.08;
    smoothMy += (targetMy - smoothMy) * 0.08;

    const t = performance.now() / 1000;

    icons.forEach(icon => {
      if (icon.hovered) return; // let CSS :hover handle transform

      const d = icon.depth;
      // Parallax
      const px = smoothMx * d * 12;
      const py = smoothMy * d * 12;
      // Gentle float (sine wave)
      const floatY = Math.sin(t / icon.floatDur * Math.PI * 2 + icon.floatPhase) * 6;
      const floatR = Math.sin(t / icon.floatDur * Math.PI * 2 + icon.floatPhase + 0.5) * 2;

      icon.el.style.transform = `translate(${px}px, ${py + floatY}px) rotate(${floatR}deg)`;
    });
  }
  tick();
}

/**
 * Icon management — parallax floating background icons.
 * Icons are already placed in HTML; this module adds subtle parallax
 * movement on mouse move for the background icons.
 */

export function initIcons() {
  const bgIcons = document.querySelectorAll('.bg-icon');
  if (!bgIcons.length) return;

  // Assign random depths for parallax
  const depths = Array.from(bgIcons).map(() => 0.3 + Math.random() * 0.7);

  // Gentle floating animation (CSS keyframes injected once)
  const style = document.createElement('style');
  style.textContent = `
    @keyframes iconFloat {
      0%, 100% { transform: translateY(0px) rotate(0deg); }
      50% { transform: translateY(-6px) rotate(2deg); }
    }
  `;
  document.head.appendChild(style);

  bgIcons.forEach((icon, i) => {
    const dur = 4 + Math.random() * 4;
    const delay = Math.random() * -dur;
    icon.style.animation = `iconFloat ${dur}s ease-in-out ${delay}s infinite`;
  });

  // Mouse parallax
  let mx = 0, my = 0;
  document.addEventListener('mousemove', (e) => {
    mx = (e.clientX / window.innerWidth - 0.5) * 2;
    my = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  function tick() {
    requestAnimationFrame(tick);
    bgIcons.forEach((icon, i) => {
      const d = depths[i];
      const px = mx * d * 12;
      const py = my * d * 12;
      // Combine parallax with existing float animation via CSS custom property
      icon.style.marginLeft = `${px}px`;
      icon.style.marginTop = `${py}px`;
    });
  }
  tick();
}

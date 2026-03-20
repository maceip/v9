import { Experience } from './Experience.js';

const canvas = document.getElementById('canvas');
const experience = new Experience(canvas);

// Transition mode buttons
document.querySelectorAll('[data-transition]').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    experience.compositor.transitionManager.setMode(btn.dataset.transition);
    document.querySelectorAll('[data-transition]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Escape to zoom out
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') experience.zoomOut();
});

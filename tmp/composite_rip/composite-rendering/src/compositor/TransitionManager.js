import gsap from 'gsap';

const MODE_MAP = {
  fade: 0,
  wipe: 1,
  diagonal: 2,
  smoothDiagonal: 3,
  noiseDissolve: 4,
  rgbShift: 5,
  barrelZoom: 6,
};

/**
 * TransitionManager drives uTransition between from/to textures.
 *
 * Pattern (from Active Theory's FXSceneCompositor):
 *   1. Set uToTexture to destination
 *   2. Tween uTransition 0 -> 1
 *   3. On complete: swap from = to, reset uTransition = 0
 */
export class TransitionManager {
  constructor(experience, compositor) {
    this.experience = experience;
    this.compositor = compositor;
    this.isAnimating = false;
    this.currentMode = 'wipe';
  }

  setMode(mode) {
    this.currentMode = mode;
    this.compositor.material.uniforms.uMode.value = MODE_MAP[mode] ?? 0;
  }

  transition(toTexture, onComplete) {
    if (this.isAnimating) return;
    this.isAnimating = true;

    this.compositor.setToTexture(toTexture);
    const uniforms = this.compositor.material.uniforms;
    uniforms.uTransition.value = 0;

    gsap.to(uniforms.uTransition, {
      value: 1,
      duration: 1.2,
      ease: 'power2.inOut',
      onComplete: () => {
        this.compositor.setFromTexture(toTexture);
        uniforms.uTransition.value = 0;
        this.isAnimating = false;
        onComplete?.();
      },
    });
  }
}

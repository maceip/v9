import * as THREE from 'three';
import gsap from 'gsap';
import { GlassCard } from './GlassCard.js';

/**
 * 3D card carousel (inspired by Kenta Toshikura's project arrangement).
 *
 * Cards are arranged in an arc: each card's X-position is its linear offset,
 * but it gets pushed back in Z based on its angle from center, and rotated
 * around Y. This creates a natural curved gallery feel.
 */
export class CardCarousel {
  constructor(experience) {
    this.experience = experience;
    this.group = new THREE.Group();

    this.cards = [];
    this.itemSpacing = 3.0;

    // Zoom state
    this.zoomed = false;
    this.zoomPower = 0;
    this.zoomTweens = [];
    this.zoomTarget = null;

    // Kenta-inspired "twist" for the poof
    this.twist = 0;

    // Yurayura: idle oscillation
    this._yuraAngle = 0;
    this._yuraY = 0;
  }

  addCard(fxScene, color, label) {
    const card = new GlassCard(fxScene, color, label);
    this.cards.push(card);
    this.group.add(card.group);
    return card;
  }

  /**
   * Update card positions in the arc arrangement.
   * Called every frame with the current scroll position.
   */
  updatePositions(scrollX, elapsed) {
    const count = this.cards.length;
    const hw = window.innerWidth;
    const arcRadius = hw * 0.0025;

    // Yurayura idle oscillation (fades out during zoom)
    this._yuraAngle = Math.sin(elapsed * 0.6) * 0.02 * (1 - this.zoomPower);
    this._yuraY = Math.sin(elapsed * 0.5) * 0.03 * (1 - this.zoomPower);

    for (let i = 0; i < count; i++) {
      const card = this.cards[i];
      const offset = i * this.itemSpacing - scrollX +
        ((count - 1) * this.itemSpacing) / 2;

      // Arc: angle from center determines Z-depth and Y-rotation
      const angle = Math.atan2(arcRadius, offset);
      const yRot = angle - Math.PI / 2;

      const zPush = Math.sin(offset / (hw / 2)) *
        this.itemSpacing * Math.tan(yRot);

      const xAdjust = Math.abs(zPush) * (offset > 0 ? -1 : 1) * 0.32;

      // Apply with zoom interpolation
      if (this.zoomed && card === this.zoomTarget) {
        // Zoomed card: lerp toward center
        // (handled by the zoom tween on card.group)
      } else {
        const zoomFade = this.zoomed ? (1 - this.zoomPower * 0.7) : 1;
        card.group.position.x = (offset + xAdjust) * zoomFade;
        card.group.position.z = -zPush * zoomFade;
        card.group.position.y = this._yuraY;
        card.group.rotation.y = (yRot + this._yuraAngle) * zoomFade;
      }

      // Scale: non-zoomed cards shrink when zoomed
      if (this.zoomed && card !== this.zoomTarget) {
        const s = 1 - this.zoomPower * 0.3;
        card.group.scale.setScalar(s);
      }
    }
  }

  /**
   * Zoom-in animation: the "poof of air" effect.
   * Inspired by Kenta Toshikura's onZoomIn.
   *
   * Simultaneous effects:
   *   1. Card flies toward camera (z: current -> 1.5)
   *   2. Scale overshoots by 0.6 then settles
   *   3. Twist with back.out(1.1) spring-back
   *   4. Barrel distortion intensifies (via compositor)
   *   5. Glass effects dissolve
   */
  zoomIn(card, compositor) {
    if (this.zoomed) return;
    this.zoomed = true;
    this.zoomTarget = card;

    this._killTweens();
    const duration = 1.2;
    const ease = 'power3.inOut';

    // 1. Master power: 0 -> 1
    this.zoomTweens.push(
      gsap.to(this, { zoomPower: 1, duration, ease })
    );

    // 2. Card position: fly forward + center
    this.zoomTweens.push(
      gsap.to(card.group.position, {
        x: 0, y: 0, z: 2.0,
        duration, ease,
      })
    );

    // 3. Card rotation: face camera
    this.zoomTweens.push(
      gsap.to(card.group.rotation, {
        x: 0, y: 0, z: 0,
        duration, ease,
      })
    );

    // 4. Scale OVERSHOOT: 1 -> 2.0 (Kenta's +0.6 overshoot pattern)
    this.zoomTweens.push(
      gsap.to(card.group.scale, {
        x: 2.0, y: 2.0, z: 2.0,
        duration, ease,
      })
    );

    // 5. THE TWIST -- two-part timeline with spring easing (THE POOF!)
    const twistTL = gsap.timeline();
    twistTL.to(this, {
      twist: 1,
      duration: duration * 0.5,
      ease: 'power1.in',
    });
    twistTL.to(this, {
      twist: 0,
      duration: duration * 0.8,
      ease: 'back.out(1.1)',  // spring overshoot!
    });
    this.zoomTweens.push(twistTL);

    // 6. Compositor: intensify barrel distortion
    this.zoomTweens.push(
      gsap.to(compositor.material.uniforms.uBarrelPower, {
        value: 2.5,
        duration: duration * 2,
        ease,
      })
    );

    // 7. Compositor: RGB shift change
    this.zoomTweens.push(
      gsap.to(compositor.material.uniforms.uRGBShiftAmount, {
        value: 0.008,
        duration: duration * 2,
        ease,
      })
    );

    // 8. Glass dissolve
    this.zoomTweens.push(
      gsap.to(card.material.uniforms.uGlassAlpha, {
        value: 0,
        duration: duration * 1.5,
        ease,
      })
    );

    this.zoomTweens.push(
      gsap.to(card.material.uniforms.uDistortStrength, {
        value: 0,
        duration: duration * 1.5,
        ease,
      })
    );

    // 9. Rounded corners expand (Kenta's bg_radius: 0.29 -> 0.8 pattern)
    this.zoomTweens.push(
      gsap.to(card.material.uniforms.uRadius, {
        value: 0.0,
        duration,
        ease,
      })
    );
  }

  /**
   * Zoom-out: slower, softer easing, no twist.
   * Kenta uses 2x duration with power2.out.
   */
  zoomOut(compositor) {
    if (!this.zoomed) return;
    const card = this.zoomTarget;
    this.zoomed = false;

    this._killTweens();
    const duration = 1.8; // slower than zoom-in
    const ease = 'power2.out';

    this.zoomTweens.push(
      gsap.to(this, { zoomPower: 0, duration, ease })
    );

    // Restore card
    this.zoomTweens.push(
      gsap.to(card.group.scale, {
        x: 1, y: 1, z: 1,
        duration, ease,
      })
    );

    // Compositor: restore barrel
    this.zoomTweens.push(
      gsap.to(compositor.material.uniforms.uBarrelPower, {
        value: 0,
        duration,
        ease,
      })
    );

    this.zoomTweens.push(
      gsap.to(compositor.material.uniforms.uRGBShiftAmount, {
        value: 0.003,
        duration,
        ease,
      })
    );

    // Restore glass
    this.zoomTweens.push(
      gsap.to(card.material.uniforms.uGlassAlpha, {
        value: 0.15,
        duration,
        ease,
      })
    );

    this.zoomTweens.push(
      gsap.to(card.material.uniforms.uDistortStrength, {
        value: 0.5,
        duration,
        ease,
      })
    );

    this.zoomTweens.push(
      gsap.to(card.material.uniforms.uRadius, {
        value: 0.04,
        duration,
        ease,
      })
    );

    this.zoomTarget = null;
  }

  _killTweens() {
    this.zoomTweens.forEach((t) => t.kill());
    this.zoomTweens = [];
  }
}

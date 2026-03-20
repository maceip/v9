import * as THREE from 'three';
import glassCardVert from '../shaders/glassCard.vert';
import glassCardFrag from '../shaders/glassCard.frag';

/**
 * A glass-style terminal card that displays an FXScene's render target.
 * Inspired by Active Theory's WorkItem cards and Kenta Toshikura's thumbnails.
 *
 * Features:
 *   - Rounded rectangle SDF clipping
 *   - Fresnel edge glow
 *   - Mouse-reactive displacement
 *   - Subtle glass tint per card
 */
export class GlassCard {
  constructor(fxScene, color, label) {
    this.fxScene = fxScene;
    this.color = new THREE.Color(color);
    this.label = label;
    this.hovered = false;
    this._hoverValue = 0;

    const cardWidth = 2.4;
    const cardHeight = 1.5;
    const geo = new THREE.PlaneGeometry(cardWidth, cardHeight);

    this.material = new THREE.ShaderMaterial({
      vertexShader: glassCardVert,
      fragmentShader: glassCardFrag,
      uniforms: {
        tContent: { value: fxScene.renderTarget.texture },
        uColor: { value: this.color },
        uHover: { value: 0 },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uFresnelPow: { value: 3.0 },
        uDistortStrength: { value: 0.5 },
        uGlassAlpha: { value: 0.15 },
        uResolution: { value: new THREE.Vector2(cardWidth, cardHeight) },
        uTime: { value: 0 },
        uRadius: { value: 0.04 },
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: true,
    });

    this.mesh = new THREE.Mesh(geo, this.material);

    // Wrap in a group for carousel positioning
    this.group = new THREE.Group();
    this.group.add(this.mesh);
  }

  update(elapsed, mouse) {
    // Smooth hover lerp
    const target = this.hovered ? 1 : 0;
    this._hoverValue += (target - this._hoverValue) * 0.08;
    this.material.uniforms.uHover.value = this._hoverValue;
    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uMouse.value.set(mouse.x, mouse.y);
  }
}

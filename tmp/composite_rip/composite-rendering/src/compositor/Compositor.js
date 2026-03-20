import * as THREE from 'three';
import { TransitionManager } from './TransitionManager.js';
import compositeVert from '../shaders/composite.vert';
import compositeFrag from '../shaders/composite.frag';

/**
 * Compositor renders a fullscreen quad that composites the main scene's
 * render target to screen with transitions and post-processing.
 *
 * Now includes zoom-driven barrel distortion and RGB shift uniforms
 * that the CardCarousel's zoom animation drives via GSAP.
 */
export class Compositor {
  constructor(experience) {
    this.experience = experience;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.material = new THREE.ShaderMaterial({
      vertexShader: compositeVert,
      fragmentShader: compositeFrag,
      uniforms: {
        uFromTexture: { value: null },
        uToTexture: { value: null },
        uTransition: { value: 0 },
        uMode: { value: 1 },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uMouseVelocity: { value: new THREE.Vector2(0, 0) },
        uTime: { value: 0 },
        uAspect: { value: experience.sizes.aspect },
        // Zoom-driven (from Kenta + Aircord patterns)
        uBarrelPower: { value: 0 },
        uRGBShiftAmount: { value: 0.003 },
        uTwist: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    const geo = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    this.transitionManager = new TransitionManager(experience, this);
  }

  setFromTexture(texture) {
    this.material.uniforms.uFromTexture.value = texture;
  }

  setToTexture(texture) {
    this.material.uniforms.uToTexture.value = texture;
  }

  update(elapsed, mouse) {
    mouse.update();
    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uMouse.value.set(mouse.x, mouse.y);
    this.material.uniforms.uMouseVelocity.value.set(mouse.vx, mouse.vy);
    // Twist is driven by the carousel's zoom animation
    if (this.experience.carousel) {
      this.material.uniforms.uTwist.value = this.experience.carousel.twist;
    }
  }

  onResize() {
    this.material.uniforms.uAspect.value = this.experience.sizes.aspect;
  }
}

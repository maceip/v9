import * as THREE from 'three';

/**
 * Base class for scenes that render to an off-screen render target (FBO).
 * Each FXScene owns its own scene, camera, and WebGLRenderTarget.
 * The render target texture can then be composited by the Compositor.
 */
export class FXScene {
  constructor(experience) {
    this.experience = experience;
    this.sizes = experience.sizes;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111111);

    this.camera = new THREE.PerspectiveCamera(
      45,
      this.sizes.width / this.sizes.height,
      0.1,
      100
    );
    this.camera.position.set(0, 0, 5);
    this.scene.add(this.camera);

    this.renderTarget = new THREE.WebGLRenderTarget(
      this.sizes.width * this.sizes.pixelRatio,
      this.sizes.height * this.sizes.pixelRatio,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        stencilBuffer: false,
      }
    );
  }

  onResize() {
    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();
    this.renderTarget.setSize(
      this.sizes.width * this.sizes.pixelRatio,
      this.sizes.height * this.sizes.pixelRatio
    );
  }

  update(_elapsed) {
    // Override in subclass
  }
}

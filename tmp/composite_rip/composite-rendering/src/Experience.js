import * as THREE from 'three';
import { Sizes } from './core/Sizes.js';
import { Mouse } from './core/Mouse.js';
import { DragScroll } from './core/DragScroll.js';
import { CubeScene } from './scenes/CubeScene.js';
import { SphereScene } from './scenes/SphereScene.js';
import { TorusScene } from './scenes/TorusScene.js';
import { ParticleScene } from './scenes/ParticleScene.js';
import { Compositor } from './compositor/Compositor.js';
import { ReflectiveFloor } from './objects/ReflectiveFloor.js';
import { CardCarousel } from './objects/CardCarousel.js';

/**
 * Main experience orchestrator.
 *
 * Architecture:
 *   - 4 FXScenes render to off-screen render targets
 *   - A main 3D scene contains the glass card carousel + reflective floor
 *   - The main scene renders to its own RT
 *   - The compositor fullscreen quad composites that RT to screen
 *   - Drag-scroll controls the carousel, click zooms into cards
 */
export class Experience {
  constructor(canvas) {
    this.canvas = canvas;
    this.sizes = new Sizes(canvas);
    this.mouse = new Mouse(canvas);
    this.clock = new THREE.Clock();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
    });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x050508, 1);
    this.renderer.autoClear = false;

    // FX Scenes (each renders to its own render target)
    this.fxScenes = [
      new CubeScene(this),
      new SphereScene(this),
      new TorusScene(this),
      new ParticleScene(this),
    ];

    // Main 3D scene: contains the carousel + floor
    this.mainScene = new THREE.Scene();
    this.mainScene.background = new THREE.Color(0x050508);
    this.mainCamera = new THREE.PerspectiveCamera(
      45, this.sizes.aspect, 0.1, 100
    );
    this.mainCamera.position.set(0, 0.8, 6);
    this.mainCamera.lookAt(0, 0, 0);
    this.mainScene.add(this.mainCamera);

    // Ambient + directional light for the main scene
    this.mainScene.add(new THREE.AmbientLight(0x222233, 0.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(3, 5, 4);
    this.mainScene.add(dirLight);

    // Main scene render target
    this.mainRT = new THREE.WebGLRenderTarget(
      this.sizes.width * this.sizes.pixelRatio,
      this.sizes.height * this.sizes.pixelRatio,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
      }
    );

    // Card carousel
    const colors = [0x4488ff, 0xff4488, 0x44ff88, 0xffaa22];
    const labels = ['Cubes', 'Spheres', 'Torus Knots', 'Particles'];
    this.carousel = new CardCarousel(this);
    this.fxScenes.forEach((scene, i) => {
      this.carousel.addCard(scene, colors[i], labels[i]);
    });
    this.mainScene.add(this.carousel.group);

    // Reflective floor
    this.floor = new ReflectiveFloor(this);
    this.mainScene.add(this.floor.mesh);

    // Compositor (renders mainRT to screen)
    this.compositor = new Compositor(this);
    this.compositor.setFromTexture(this.mainRT.texture);

    // Drag scroll
    this.dragScroll = new DragScroll(
      canvas,
      this.fxScenes.length,
      this.carousel.itemSpacing
    );

    // Raycaster for card click detection
    this.raycaster = new THREE.Raycaster();
    this._mouseNDC = new THREE.Vector2();
    canvas.addEventListener('click', (e) => this._onClick(e));

    this.sizes.on('resize', () => this.onResize());
    this.tick();
  }

  _onClick(e) {
    // Only handle actual clicks (not drag releases)
    if (!this.dragScroll.wasClick()) return;

    if (this.carousel.zoomed) {
      // Click anywhere to zoom out when zoomed
      this.zoomOut();
      return;
    }

    // Raycast against card meshes
    this._mouseNDC.x = (e.clientX / this.sizes.width) * 2 - 1;
    this._mouseNDC.y = -(e.clientY / this.sizes.height) * 2 + 1;
    this.raycaster.setFromCamera(this._mouseNDC, this.mainCamera);

    const meshes = this.carousel.cards.map((c) => c.mesh);
    const intersects = this.raycaster.intersectObjects(meshes);
    if (intersects.length > 0) {
      const card = this.carousel.cards.find(
        (c) => c.mesh === intersects[0].object
      );
      if (card) {
        this.carousel.zoomIn(card, this.compositor);
        this.canvas.classList.add('pointer');
      }
    }
  }

  zoomOut() {
    this.carousel.zoomOut(this.compositor);
    this.canvas.classList.remove('pointer');
  }

  onResize() {
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.mainCamera.aspect = this.sizes.aspect;
    this.mainCamera.updateProjectionMatrix();

    const w = this.sizes.width * this.sizes.pixelRatio;
    const h = this.sizes.height * this.sizes.pixelRatio;
    this.mainRT.setSize(w, h);

    this.fxScenes.forEach((s) => s.onResize());
    this.floor.onResize();
    this.compositor.onResize();
  }

  tick() {
    const elapsed = this.clock.getElapsedTime();

    // Update drag scroll
    if (!this.carousel.zoomed) {
      this.dragScroll.update();
    }

    // Update all FX scenes (each renders to its own RT)
    for (const fxScene of this.fxScenes) {
      fxScene.update(elapsed);
      this.renderer.setRenderTarget(fxScene.renderTarget);
      this.renderer.clear();
      this.renderer.render(fxScene.scene, fxScene.camera);
    }

    // Update carousel card positions
    this.carousel.updatePositions(this.dragScroll.scroll.x, elapsed);

    // Update card hover + uniforms
    for (const card of this.carousel.cards) {
      card.update(elapsed, this.mouse);
    }

    // Update floor
    this.floor.update(elapsed);

    // Render floor reflection (mirror camera pass)
    this.floor.renderReflection(this.renderer, this.mainScene, this.mainCamera);

    // Render main scene to its RT
    this.renderer.setRenderTarget(this.mainRT);
    this.renderer.clear();
    this.renderer.render(this.mainScene, this.mainCamera);

    // Render compositor fullscreen quad to screen
    this.compositor.update(elapsed, this.mouse);
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.compositor.scene, this.compositor.camera);

    requestAnimationFrame(() => this.tick());
  }
}

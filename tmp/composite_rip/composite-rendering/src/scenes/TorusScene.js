import * as THREE from 'three';
import { FXScene } from './FXScene.js';

export class TorusScene extends FXScene {
  constructor(experience) {
    super(experience);
    this.scene.background = new THREE.Color(0x0a1a0a);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.knots = [];
    const configs = [
      { p: 2, q: 3, color: 0x44ffaa, pos: [0, 0, 0], scale: 1.0 },
      { p: 3, q: 2, color: 0xaaff44, pos: [-1.5, 0.5, -0.5], scale: 0.5 },
      { p: 5, q: 3, color: 0x44aaff, pos: [1.5, -0.3, 0.3], scale: 0.45 },
    ];

    for (const cfg of configs) {
      const geo = new THREE.TorusKnotGeometry(0.6, 0.2, 128, 32, cfg.p, cfg.q);
      const mat = new THREE.MeshStandardMaterial({
        color: cfg.color,
        roughness: 0.3,
        metalness: 0.5,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...cfg.pos);
      mesh.scale.setScalar(cfg.scale);
      this.group.add(mesh);
      this.knots.push(mesh);
    }

    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(-3, 5, 4);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0x224422, 0.8));
  }

  update(elapsed) {
    this.knots.forEach((knot, i) => {
      knot.rotation.x = elapsed * (0.2 + i * 0.15);
      knot.rotation.y = elapsed * (0.3 + i * 0.1);
    });
  }
}

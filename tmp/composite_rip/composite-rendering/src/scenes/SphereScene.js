import * as THREE from 'three';
import { FXScene } from './FXScene.js';

export class SphereScene extends FXScene {
  constructor(experience) {
    super(experience);
    this.scene.background = new THREE.Color(0x1a0a0a);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    const geo = new THREE.SphereGeometry(0.4, 32, 32);

    this.spheres = [];
    for (let i = 0; i < 8; i++) {
      const hue = i / 8;
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(hue, 0.7, 0.5),
        roughness: 0.2,
        metalness: 0.6,
      });
      const mesh = new THREE.Mesh(geo, mat);
      this.group.add(mesh);
      this.spheres.push(mesh);
    }

    const light = new THREE.PointLight(0xff8866, 2, 20);
    light.position.set(2, 3, 4);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0x442222, 0.6));
  }

  update(elapsed) {
    this.spheres.forEach((sphere, i) => {
      const angle = (i / this.spheres.length) * Math.PI * 2 + elapsed * 0.4;
      const r = 1.5 + Math.sin(elapsed * 0.5 + i) * 0.3;
      sphere.position.x = Math.cos(angle) * r;
      sphere.position.y = Math.sin(elapsed * 0.8 + i * 0.7) * 0.6;
      sphere.position.z = Math.sin(angle) * r;
    });
    this.group.rotation.y = elapsed * 0.15;
  }
}

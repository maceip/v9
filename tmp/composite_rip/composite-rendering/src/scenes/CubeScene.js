import * as THREE from 'three';
import { FXScene } from './FXScene.js';

export class CubeScene extends FXScene {
  constructor(experience) {
    super(experience);
    this.scene.background = new THREE.Color(0x0a0a1a);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    const geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const colors = [0x4488ff, 0xff4488, 0x44ff88, 0xffaa22, 0xaa44ff, 0x22ddff];
    const positions = [
      [-1.2, 0.8, 0], [1.2, 0.8, 0], [-1.2, -0.8, 0],
      [1.2, -0.8, 0], [0, 0, -1], [0, 0, 1],
    ];

    this.cubes = positions.map((pos, i) => {
      const mat = new THREE.MeshStandardMaterial({
        color: colors[i],
        roughness: 0.4,
        metalness: 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...pos);
      this.group.add(mesh);
      return mesh;
    });

    const light = new THREE.DirectionalLight(0xffffff, 1.5);
    light.position.set(3, 4, 5);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0x333355, 0.8));
  }

  update(elapsed) {
    this.group.rotation.y = elapsed * 0.3;
    this.cubes.forEach((cube, i) => {
      cube.rotation.x = elapsed * (0.5 + i * 0.1);
      cube.rotation.z = elapsed * (0.3 + i * 0.15);
    });
  }
}

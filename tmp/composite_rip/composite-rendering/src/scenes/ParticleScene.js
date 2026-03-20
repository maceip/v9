import * as THREE from 'three';
import { FXScene } from './FXScene.js';

export class ParticleScene extends FXScene {
  constructor(experience) {
    super(experience);
    this.scene.background = new THREE.Color(0x0a0a0a);

    const count = 3000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // Distribute in a sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1.5 + Math.random() * 1.0;
      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = r * Math.cos(phi);

      const hue = Math.random();
      const c = new THREE.Color().setHSL(hue, 0.8, 0.6);
      colors[i3] = c.r;
      colors[i3 + 1] = c.g;
      colors[i3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.03,
      vertexColors: true,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(geo, mat);
    this.scene.add(this.points);

    this._basePositions = new Float32Array(positions);
  }

  update(elapsed) {
    this.points.rotation.y = elapsed * 0.12;
    this.points.rotation.x = Math.sin(elapsed * 0.15) * 0.3;

    // Gentle breathing
    const posAttr = this.points.geometry.getAttribute('position');
    const arr = posAttr.array;
    for (let i = 0; i < arr.length; i += 3) {
      const bx = this._basePositions[i];
      const by = this._basePositions[i + 1];
      const bz = this._basePositions[i + 2];
      const pulse = 1.0 + Math.sin(elapsed * 0.8 + bx * 2.0 + by * 3.0) * 0.08;
      arr[i] = bx * pulse;
      arr[i + 1] = by * pulse;
      arr[i + 2] = bz * pulse;
    }
    posAttr.needsUpdate = true;
  }
}

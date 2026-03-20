import * as THREE from 'three';
import reflectiveFloorVert from '../shaders/reflectiveFloor.vert';
import reflectiveFloorFrag from '../shaders/reflectiveFloor.frag';

/**
 * Reflective floor using the mirror-camera technique (inspired by Aircord).
 *
 * How it works:
 *   1. Before each render, compute a virtual camera reflected across the floor plane
 *   2. Render the scene from that reflected viewpoint into a render target
 *   3. The floor's fragment shader samples that RT using projective texturing
 *   4. A 5-tap vertical Gaussian blur softens the reflection
 *   5. 3D gradient noise displaces the surface for water-like ripples
 */
export class ReflectiveFloor {
  constructor(experience) {
    this.experience = experience;

    // Reflection render target
    const w = experience.sizes.width * experience.sizes.pixelRatio;
    const h = experience.sizes.height * experience.sizes.pixelRatio;
    this.reflectionRT = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    });

    // Virtual camera for reflection
    this.virtualCamera = new THREE.PerspectiveCamera();

    // Texture matrix for projective texturing
    this.textureMatrix = new THREE.Matrix4();

    // Floor geometry
    const geo = new THREE.PlaneGeometry(14, 8, 128, 128);
    this.material = new THREE.ShaderMaterial({
      vertexShader: reflectiveFloorVert,
      fragmentShader: reflectiveFloorFrag,
      uniforms: {
        uReflectionMap: { value: this.reflectionRT.texture },
        uTextureMatrix: { value: this.textureMatrix },
        uColor: { value: new THREE.Color(0x050508) },
        uBlurSpread: { value: 0.025 },
        uFogDensity: { value: 0.6 },
        uNoiseAlpha: { value: 0.15 },
        uNoiseScale: { value: 3.0 },
        uNoiseHeight: { value: 0.08 },
        uReflectionStrength: { value: 0.7 },
        uTime: { value: 0 },
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = -1.2;

    // Temporaries for reflection matrix computation
    this._reflectorPlane = new THREE.Plane();
    this._normal = new THREE.Vector3(0, 1, 0);
    this._reflectorWorldPos = new THREE.Vector3();
    this._cameraWorldPos = new THREE.Vector3();
    this._lookAtTarget = new THREE.Vector3();
    this._clipPlane = new THREE.Vector4();
    this._q = new THREE.Vector4();
  }

  /**
   * Render the reflected scene into the reflection RT.
   * Must be called before rendering the floor itself.
   */
  renderReflection(renderer, scene, camera) {
    // Get world positions
    this.mesh.updateMatrixWorld();
    this._reflectorWorldPos.setFromMatrixPosition(this.mesh.matrixWorld);
    this._cameraWorldPos.setFromMatrixPosition(camera.matrixWorld);

    // Reflect camera position across the floor plane
    const normal = this._normal.clone().applyMatrix4(
      new THREE.Matrix4().extractRotation(this.mesh.matrixWorld)
    );

    const cameraToFloor = this._cameraWorldPos.clone().sub(this._reflectorWorldPos);
    // If camera is below the floor, skip reflection
    if (cameraToFloor.dot(normal) < 0) return;

    cameraToFloor.reflect(normal).negate();
    const reflectedPos = this._reflectorWorldPos.clone().add(cameraToFloor);

    // Reflect the look-at direction
    const camDir = new THREE.Vector3(0, 0, -1)
      .applyMatrix4(new THREE.Matrix4().extractRotation(camera.matrixWorld))
      .add(this._cameraWorldPos);
    const lookTarget = camDir.clone().sub(this._reflectorWorldPos).reflect(normal).negate();
    lookTarget.add(this._reflectorWorldPos);

    // Set up virtual camera
    this.virtualCamera.position.copy(reflectedPos);
    this.virtualCamera.up.set(0, 1, 0).reflect(normal);
    this.virtualCamera.lookAt(lookTarget);
    this.virtualCamera.far = camera.far;
    this.virtualCamera.near = camera.near;
    this.virtualCamera.fov = camera.fov;
    this.virtualCamera.aspect = camera.aspect;
    this.virtualCamera.updateMatrixWorld();
    this.virtualCamera.updateProjectionMatrix();

    // Compute the projective texture matrix
    // Maps clip-space [-1,1] to UV [0,1]
    this.textureMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0
    );
    this.textureMatrix.multiply(this.virtualCamera.projectionMatrix);
    this.textureMatrix.multiply(this.virtualCamera.matrixWorldInverse);
    this.textureMatrix.multiply(this.mesh.matrixWorld);

    // Oblique near-clip plane to avoid artifacts below the mirror
    this._reflectorPlane.setFromNormalAndCoplanarPoint(normal, this._reflectorWorldPos);
    this._reflectorPlane.applyMatrix4(this.virtualCamera.matrixWorldInverse);
    this._clipPlane.set(
      this._reflectorPlane.normal.x,
      this._reflectorPlane.normal.y,
      this._reflectorPlane.normal.z,
      this._reflectorPlane.constant
    );
    const proj = this.virtualCamera.projectionMatrix;
    this._q.x = (Math.sign(this._clipPlane.x) + proj.elements[8]) / proj.elements[0];
    this._q.y = (Math.sign(this._clipPlane.y) + proj.elements[9]) / proj.elements[5];
    this._q.z = -1.0;
    this._q.w = (1.0 + proj.elements[10]) / proj.elements[14];
    this._clipPlane.multiplyScalar(2.0 / this._clipPlane.dot(this._q));
    proj.elements[2] = this._clipPlane.x;
    proj.elements[6] = this._clipPlane.y;
    proj.elements[10] = this._clipPlane.z + 1.0;
    proj.elements[14] = this._clipPlane.w;

    // Render reflected scene
    this.mesh.visible = false;
    const prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(this.reflectionRT);
    renderer.clear();
    renderer.render(scene, this.virtualCamera);
    renderer.setRenderTarget(prevRT);
    this.mesh.visible = true;
  }

  update(elapsed) {
    this.material.uniforms.uTime.value = elapsed * 0.3;
  }

  onResize() {
    const w = this.experience.sizes.width * this.experience.sizes.pixelRatio;
    const h = this.experience.sizes.height * this.experience.sizes.pixelRatio;
    this.reflectionRT.setSize(w, h);
  }
}

import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';

/**
 * FluidSimulation - WebGL Navier-Stokes Fluid
 * 
 * Based on extracted code from app.1715958947476.js lines ~38939-39207
 * 
 * This implements the full fluid simulation pipeline:
 * 1. Vorticity confinement (curl)
 * 2. Divergence calculation
 * 3. Pressure projection (20 iterations)
 * 4. Advection
 * 
 * Config extracted:
 * - SIM_SIZE: 128
 * - DYE_SIZE: 512
 * - DENSITY_DISSIPATION: 0.97
 * - VELOCITY_DISSIPATION: 0.98
 * - PRESSURE_DISSIPATION: 0.8
 * - PRESSURE_ITERATIONS: 20
 * - CURL: 30
 * - SPLAT_RADIUS: 0.25
 */

// Shader sources (simplified from original GLSL)
const baseVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const splatShader = `
  uniform sampler2D uTarget;
  uniform float aspectRatio;
  uniform vec3 color;
  uniform vec2 point;
  uniform float radius;
  varying vec2 vUv;
  
  void main() {
    vec2 p = vUv - point;
    p.x *= aspectRatio;
    vec3 splat = exp(-dot(p, p) / radius) * color;
    vec3 base = texture2D(uTarget, vUv).xyz;
    gl_FragColor = vec4(base + splat, 1.0);
  }
`;

const advectionShader = `
  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform vec2 texelSize;
  uniform vec2 dyeTexelSize;
  uniform float dt;
  uniform float dissipation;
  varying vec2 vUv;
  
  void main() {
    vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
    gl_FragColor = dissipation * texture2D(uSource, coord);
  }
`;

const divergenceShader = `
  uniform sampler2D uVelocity;
  uniform vec2 texelSize;
  varying vec2 vUv;
  
  void main() {
    float L = texture2D(uVelocity, vUv - vec2(texelSize.x, 0)).x;
    float R = texture2D(uVelocity, vUv + vec2(texelSize.x, 0)).x;
    float T = texture2D(uVelocity, vUv + vec2(0, texelSize.y)).y;
    float B = texture2D(uVelocity, vUv - vec2(0, texelSize.y)).y;
    float div = 0.5 * (R - L + T - B);
    gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
  }
`;

const pressureShader = `
  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;
  uniform vec2 texelSize;
  varying vec2 vUv;
  
  void main() {
    float L = texture2D(uPressure, vUv - vec2(texelSize.x, 0)).x;
    float R = texture2D(uPressure, vUv + vec2(texelSize.x, 0)).x;
    float T = texture2D(uPressure, vUv + vec2(0, texelSize.y)).x;
    float B = texture2D(uPressure, vUv - vec2(0, texelSize.y)).x;
    float div = texture2D(uDivergence, vUv).x;
    float pressure = (L + R + T + B - div) * 0.25;
    gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
  }
`;

const gradientSubtractShader = `
  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;
  uniform vec2 texelSize;
  varying vec2 vUv;
  
  void main() {
    float L = texture2D(uPressure, vUv - vec2(texelSize.x, 0)).x;
    float R = texture2D(uPressure, vUv + vec2(texelSize.x, 0)).x;
    float T = texture2D(uPressure, vUv + vec2(0, texelSize.y)).x;
    float B = texture2D(uPressure, vUv - vec2(0, texelSize.y)).x;
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    velocity.xy -= vec2(R - L, T - B) * 0.5;
    gl_FragColor = vec4(velocity, 0.0, 1.0);
  }
`;

const curlShader = `
  uniform sampler2D uVelocity;
  uniform vec2 texelSize;
  varying vec2 vUv;
  
  void main() {
    float L = texture2D(uVelocity, vUv - vec2(texelSize.x, 0)).y;
    float R = texture2D(uVelocity, vUv + vec2(texelSize.x, 0)).y;
    float T = texture2D(uVelocity, vUv + vec2(0, texelSize.y)).x;
    float B = texture2D(uVelocity, vUv - vec2(0, texelSize.y)).x;
    float curl = R - L - T + B;
    gl_FragColor = vec4(0.5 * curl, 0.0, 0.0, 1.0);
  }
`;

const vorticityShader = `
  uniform sampler2D uVelocity;
  uniform sampler2D uCurl;
  uniform vec2 texelSize;
  uniform float curl;
  varying vec2 vUv;
  
  void main() {
    float L = texture2D(uCurl, vUv - vec2(texelSize.x, 0)).x;
    float R = texture2D(uCurl, vUv + vec2(texelSize.x, 0)).x;
    float T = texture2D(uCurl, vUv + vec2(0, texelSize.y)).x;
    float B = texture2D(uCurl, vUv - vec2(0, texelSize.y)).x;
    float C = texture2D(uCurl, vUv).x;
    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force *= curl * C / (length(force) + 0.0001);
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    velocity += force * 0.01;
    gl_FragColor = vec4(velocity, 0.0, 1.0);
  }
`;

const displayShader = `
  uniform sampler2D uTexture;
  varying vec2 vUv;
  
  void main() {
    vec3 color = texture2D(uTexture, vUv).xyz;
    gl_FragColor = vec4(color, 1.0);
  }
`;

class FluidSimulation {
  constructor(simSize = 128, dyeSize = 512) {
    this.simSize = simSize;
    this.dyeSize = dyeSize;
    
    // Config from minified source
    this.config = {
      DENSITY_DISSIPATION: 0.97,
      VELOCITY_DISSIPATION: 0.98,
      PRESSURE_DISSIPATION: 0.8,
      PRESSURE_ITERATIONS: 20,
      CURL: 30,
      SPLAT_RADIUS: 0.25,
    };
    
    this.init();
  }
  
  init() {
    // Create render targets (FBOs)
    this.velocityFBO = this.createFBO(this.simSize, this.simSize);
    this.densityFBO = this.createFBO(this.dyeSize, this.dyeSize);
    this.pressureFBO = this.createFBO(this.simSize, this.simSize);
    this.divergenceFBO = this.createFBO(this.simSize, this.simSize);
    this.curlFBO = this.createFBO(this.simSize, this.simSize);
    
    // Create materials
    this.materials = {
      splat: new THREE.ShaderMaterial({
        uniforms: {
          uTarget: { value: null },
          aspectRatio: { value: 1 },
          color: { value: new THREE.Color(1, 1, 1) },
          point: { value: new THREE.Vector2(0.5, 0.5) },
          radius: { value: this.config.SPLAT_RADIUS },
        },
        vertexShader: baseVertexShader,
        fragmentShader: splatShader,
      }),
      advection: new THREE.ShaderMaterial({
        uniforms: {
          uVelocity: { value: null },
          uSource: { value: null },
          texelSize: { value: new THREE.Vector2(1/this.simSize, 1/this.simSize) },
          dyeTexelSize: { value: new THREE.Vector2(1/this.dyeSize, 1/this.dyeSize) },
          dt: { value: 0.016 },
          dissipation: { value: 1.0 },
        },
        vertexShader: baseVertexShader,
        fragmentShader: advectionShader,
      }),
      divergence: new THREE.ShaderMaterial({
        uniforms: {
          uVelocity: { value: null },
          texelSize: { value: new THREE.Vector2(1/this.simSize, 1/this.simSize) },
        },
        vertexShader: baseVertexShader,
        fragmentShader: divergenceShader,
      }),
      pressure: new THREE.ShaderMaterial({
        uniforms: {
          uPressure: { value: null },
          uDivergence: { value: null },
          texelSize: { value: new THREE.Vector2(1/this.simSize, 1/this.simSize) },
        },
        vertexShader: baseVertexShader,
        fragmentShader: pressureShader,
      }),
      gradientSubtract: new THREE.ShaderMaterial({
        uniforms: {
          uPressure: { value: null },
          uVelocity: { value: null },
          texelSize: { value: new THREE.Vector2(1/this.simSize, 1/this.simSize) },
        },
        vertexShader: baseVertexShader,
        fragmentShader: gradientSubtractShader,
      }),
      curl: new THREE.ShaderMaterial({
        uniforms: {
          uVelocity: { value: null },
          texelSize: { value: new THREE.Vector2(1/this.simSize, 1/this.simSize) },
        },
        vertexShader: baseVertexShader,
        fragmentShader: curlShader,
      }),
      vorticity: new THREE.ShaderMaterial({
        uniforms: {
          uVelocity: { value: null },
          uCurl: { value: null },
          texelSize: { value: new THREE.Vector2(1/this.simSize, 1/this.simSize) },
          curl: { value: this.config.CURL },
        },
        vertexShader: baseVertexShader,
        fragmentShader: vorticityShader,
      }),
      display: new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: null },
        },
        vertexShader: baseVertexShader,
        fragmentShader: displayShader,
      }),
    };
    
    // Full-screen quad
    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.materials.display
    );
    
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene.add(this.quad);
  }
  
  createFBO(width, height) {
    const renderTarget = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    });
    
    return {
      read: renderTarget,
      write: renderTarget.clone(),
      swap: () => {
        const temp = this.read;
        this.read = this.write;
        this.write = temp;
      },
    };
  }
  
  // Draw input (splat)
  drawInput(x, y, dx, dy, color, size) {
    const aspectRatio = window.innerWidth / window.innerHeight;
    
    // Splat velocity
    this.materials.splat.uniforms.uTarget.value = this.velocityFBO.read.texture;
    this.materials.splat.uniforms.aspectRatio.value = aspectRatio;
    this.materials.splat.uniforms.color.value.set(dx * 0.5, dy * 0.5, 0);
    this.materials.splat.uniforms.point.value.set(x / window.innerWidth, 1 - y / window.innerHeight);
    this.materials.splat.uniforms.radius.value = size / 100;
    
    this.renderToTarget(this.velocityFBO.write);
    this.velocityFBO.swap();
    
    // Splat density
    this.materials.splat.uniforms.uTarget.value = this.densityFBO.read.texture;
    this.materials.splat.uniforms.color.value.copy(color);
    
    this.renderToTarget(this.densityFBO.write);
    this.densityFBO.swap();
  }
  
  // Simulation step
  step(renderer) {
    this.renderer = renderer;
    
    // 1. Curl
    this.materials.curl.uniforms.uVelocity.value = this.velocityFBO.read.texture;
    this.renderToTarget(this.curlFBO.write);
    this.curlFBO.swap();
    
    // 2. Vorticity
    this.materials.vorticity.uniforms.uVelocity.value = this.velocityFBO.read.texture;
    this.materials.vorticity.uniforms.uCurl.value = this.curlFBO.read.texture;
    this.renderToTarget(this.velocityFBO.write);
    this.velocityFBO.swap();
    
    // 3. Divergence
    this.materials.divergence.uniforms.uVelocity.value = this.velocityFBO.read.texture;
    this.renderToTarget(this.divergenceFBO);
    
    // 4. Clear pressure
    // (pressure is cleared implicitly by iterative solver)
    
    // 5. Pressure iterations (20 times)
    for (let i = 0; i < this.config.PRESSURE_ITERATIONS; i++) {
      this.materials.pressure.uniforms.uPressure.value = this.pressureFBO.read.texture;
      this.materials.pressure.uniforms.uDivergence.value = this.divergenceFBO.read.texture;
      this.renderToTarget(this.pressureFBO.write);
      this.pressureFBO.swap();
    }
    
    // 6. Gradient subtract
    this.materials.gradientSubtract.uniforms.uPressure.value = this.pressureFBO.read.texture;
    this.materials.gradientSubtract.uniforms.uVelocity.value = this.velocityFBO.read.texture;
    this.renderToTarget(this.velocityFBO.write);
    this.velocityFBO.swap();
    
    // 7. Advect velocity
    this.materials.advection.uniforms.uVelocity.value = this.velocityFBO.read.texture;
    this.materials.advection.uniforms.uSource.value = this.velocityFBO.read.texture;
    this.materials.advection.uniforms.texelSize.value.set(1/this.simSize, 1/this.simSize);
    this.materials.advection.uniforms.dissipation.value = this.config.VELOCITY_DISSIPATION;
    this.renderToTarget(this.velocityFBO.write);
    this.velocityFBO.swap();
    
    // 8. Advect density
    this.materials.advection.uniforms.uVelocity.value = this.velocityFBO.read.texture;
    this.materials.advection.uniforms.uSource.value = this.densityFBO.read.texture;
    this.materials.advection.uniforms.texelSize.value.set(1/this.dyeSize, 1/this.dyeSize);
    this.materials.advection.uniforms.dissipation.value = this.config.DENSITY_DISSIPATION;
    this.renderToTarget(this.densityFBO.write);
    this.densityFBO.swap();
  }
  
  renderToTarget(target) {
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
  }
  
  getTexture() {
    return this.densityFBO.read.texture;
  }
}

export default FluidSimulation;

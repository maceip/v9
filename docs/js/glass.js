/**
 * Liquid glass + tumble_r3f background shader.
 * Vanilla WebGL — no Three.js dependency.
 *
 * Renders:
 * 1. Pastel diagonal line palette animation (from tumble_r3f FullscreenShader)
 * 2. Liquid glass overlay (refraction, chromatic aberration, bevel)
 * 3. Fog overlay that fades on interaction
 */

const VERT = `
precision highp float;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

// Combined fragment: tumble background + liquid glass + fog
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uFog;        // 0.0 = no fog, 1.0 = full fog
uniform float uGlassBlur;  // 0.0 = clear, 1.0 = frosted
uniform vec2 uResolution;
uniform vec2 uMouse;       // normalized mouse position
uniform float uDark;       // 1.0 = dark mode, 0.0 = light mode

// Palette from tumble_r3f
vec3 palette(float t, float dark) {
  vec3 topDark = vec3(0.94, 0.82, 0.84);
  vec3 bottomDark = vec3(0.73, 0.84, 0.91);
  vec3 lineDark = vec3(1.0, 0.35, 0.72);

  vec3 topLight = vec3(0.85, 0.78, 0.72);
  vec3 bottomLight = vec3(0.72, 0.76, 0.82);
  vec3 lineLight = vec3(0.6, 0.25, 0.55);

  vec3 top = mix(topLight, topDark, dark);
  vec3 bottom = mix(bottomLight, bottomDark, dark);
  vec3 lineCol = mix(lineLight, lineDark, dark);

  vec3 col = mix(bottom, top, step(t, 0.0));
  col += lineCol * exp(-120.0 * abs(t));
  return col;
}

// Noise for glass distortion
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);

  // ── Mouse warp distortion ──
  // Distance from mouse creates a gravitational lens / ripple effect
  vec2 mousePos = uMouse * 2.0 - 1.0;
  vec2 toMouse = uv - mousePos * aspect;
  float mouseDist = length(toMouse);
  float warpStrength = 0.15;
  // Radial warp: pushes pixels away from cursor in a smooth falloff
  float warp = exp(-mouseDist * mouseDist * 4.0) * warpStrength;
  // Swirl: rotates pixels around cursor
  float swirlAngle = warp * 2.5;
  float cs = cos(swirlAngle);
  float sn = sin(swirlAngle);
  vec2 warped = uv + toMouse * warp * 0.5;
  // Apply swirl rotation around mouse point
  vec2 fromMouse = warped - mousePos * aspect;
  warped = mousePos * aspect + vec2(
    fromMouse.x * cs - fromMouse.y * sn,
    fromMouse.x * sn + fromMouse.y * cs
  );

  // ── Background: tumble diagonal line — animated drift ──
  float drift = 0.12 * sin(uTime * 0.4) + 0.04 * sin(uTime * 0.7);
  float line = warped.y - warped.x * 0.28 + drift;
  vec3 bg = palette(line, uDark);

  // ── Liquid glass distortion ──
  float glassStrength = uGlassBlur;
  vec2 glassUV = vUv;

  // Refraction offset based on noise
  float n1 = noise(vUv * 8.0 + uTime * 0.1);
  float n2 = noise(vUv * 8.0 + uTime * 0.1 + 100.0);
  vec2 refract = (vec2(n1, n2) - 0.5) * 0.03 * glassStrength;

  // Chromatic aberration (from wobble post.frag pattern)
  float ca = 0.006 * glassStrength;
  vec2 uvR = glassUV + refract + sin(glassUV - 0.5) * ca * vec2(1.0, 3.0);
  vec2 uvG = glassUV + refract + sin(glassUV - 0.5) * ca * vec2(2.0, 2.0);
  vec2 uvB = glassUV + refract + sin(glassUV - 0.5) * ca * vec2(3.0, 1.0);

  // Sample background with per-channel offset + mouse warp applied
  float driftCA = 0.12 * sin(uTime * 0.4) + 0.04 * sin(uTime * 0.7);
  // Apply same mouse warp to CA-offset UVs
  vec2 warpedR = (uvR * 2.0 - 1.0) + toMouse * warp * 0.5;
  vec2 warpedG = (uvG * 2.0 - 1.0) + toMouse * warp * 0.5;
  vec2 warpedB = (uvB * 2.0 - 1.0) + toMouse * warp * 0.5;
  float lineR = warpedR.y - warpedR.x * 0.28 + driftCA;
  float lineG = warpedG.y - warpedG.x * 0.28 + driftCA;
  float lineB = warpedB.y - warpedB.x * 0.28 + driftCA;

  vec3 glassCol = vec3(
    palette(lineR, uDark).r,
    palette(lineG, uDark).g,
    palette(lineB, uDark).b
  );

  vec3 col = mix(bg, glassCol, glassStrength);

  // ── Glass bevel edge highlight ──
  float bevelEdge = 0.92;
  vec2 edgeDist = abs(vUv - 0.5) * 2.0;
  float edge = smoothstep(bevelEdge, 1.0, max(edgeDist.x, edgeDist.y));
  col += edge * 0.08 * (1.0 + 0.5 * sin(uTime * 0.5));

  // ── Spotlight (radial gradient centered slightly above middle) ──
  float spotDist = length((vUv - vec2(0.5, 0.45)) * aspect);
  float spot = exp(-spotDist * spotDist * 3.0) * 0.06 * (1.0 - uFog * 0.5);
  col += spot;

  // ── Fog ──
  vec3 fogColor = mix(vec3(0.91, 0.89, 0.87), vec3(0.04, 0.04, 0.06), uDark);
  float fogNoise = noise(vUv * 4.0 + uTime * 0.05) * 0.15;
  float fogAmount = uFog * (0.5 + fogNoise);

  // Radial fog: thicker at edges, thinner at center
  float radialFog = length(vUv - 0.5) * 0.6;
  fogAmount += uFog * radialFog * 0.3;

  col = mix(col, fogColor, clamp(fogAmount, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
}`;

export class GlassScene {
  constructor(canvas) {
    this.canvas = canvas;
    this._raf = null;
    this.fog = 0.25;       // Light fog — animation clearly visible
    this.glassBlur = 0.4;  // Light frost — shapes and motion visible
    this.isDark = true;
    this.mouse = { x: 0.5, y: 0.5 };

    const params = { alpha: false, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
    const gl = canvas.getContext('webgl2', params) || canvas.getContext('webgl', params);
    if (!gl) return;
    this.gl = gl;

    // Fullscreen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, -1,1, 1,1, 1,-1]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    // Compile
    const vs = this._shader(gl.VERTEX_SHADER, VERT);
    const fs = this._shader(gl.FRAGMENT_SHADER, FRAG);
    this.prog = gl.createProgram();
    gl.attachShader(this.prog, vs); gl.attachShader(this.prog, fs);
    gl.bindAttribLocation(this.prog, 0, 'position');
    gl.linkProgram(this.prog);

    this.u = {};
    const n = gl.getProgramParameter(this.prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(this.prog, i);
      this.u[info.name] = gl.getUniformLocation(this.prog, info.name);
    }

    gl.useProgram(this.prog);
  }

  _shader(type, src) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('Glass shader error:', gl.getShaderInfoLog(s));
    }
    return s;
  }

  resize() {
    if (!this.gl) return;
    const r = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth * r;
    const h = this.canvas.clientHeight * r;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
  }

  start() {
    if (this._running || !this.gl) return;
    this._running = true;
    this.resize();
    this._t0 = performance.now();
    this._loop();
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  _loop() {
    if (!this._running) return;
    this._raf = requestAnimationFrame(() => this._loop());
    const gl = this.gl;
    const t = (performance.now() - this._t0) / 1000;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);

    gl.uniform1f(this.u.uTime, t);
    gl.uniform1f(this.u.uFog, this.fog);
    gl.uniform1f(this.u.uGlassBlur, this.glassBlur);
    gl.uniform2f(this.u.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.u.uMouse, this.mouse.x, this.mouse.y);
    gl.uniform1f(this.u.uDark, this.isDark ? 1.0 : 0.0);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  }
}

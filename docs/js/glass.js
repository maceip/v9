/**
 * Liquid glass shader — bigleaguechew base palette.
 * Vanilla WebGL — no Three.js dependency.
 *
 * Base: Two orbiting color blobs (blue + pink) from bigleaguechew_r3f
 * Glass: Refraction, chromatic aberration, caustics, Fresnel, specular
 * Interactive: Mouse warp (gravitational lens + swirl)
 *
 * All visual constants are exposed as uniforms for live tweaking via dial.js.
 */

const VERT = `
precision highp float;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uFog;
uniform float uGlassBlur;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uDark;

// ── Tunable uniforms (wired to dial.js) ──
uniform float uWarpStrength;     // mouse warp intensity
uniform float uSwirlMul;        // swirl rotation multiplier
uniform float uRefractStrength;  // noise refraction displacement
uniform float uCABase;           // chromatic aberration base
uniform float uCAEdgeMul;        // CA edge amplification
uniform float uRefractMix;       // refracted vs direct mix
uniform float uCausticIntensity; // caustic brightness
uniform float uCausticExp;       // caustic sharpness
uniform float uSpecIntensity;    // specular highlight brightness
uniform float uSpecPow;          // specular sharpness
uniform float uFresnelIntensity; // Fresnel edge glow
uniform float uFresnelExp;       // Fresnel falloff curve
uniform float uBevelIntensity;   // edge bevel brightness

// ── Noise ──
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

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = rot * p * 2.0 + 100.0;
    a *= 0.5;
  }
  return v;
}

// ── bigleaguechew background ──
vec3 blcBackground(vec2 uv, float t, float dark) {
  vec2 p = uv - 0.5;
  vec2 c1 = vec2(0.18 * sin(t * 0.2), 0.16 * cos(t * 0.25));
  vec2 c2 = vec2(-0.25 * cos(t * 0.22), -0.1 * sin(t * 0.18));
  float r1 = length(p - c1);
  float r2 = length(p - c2);

  vec3 blue = mix(vec3(0.55, 0.72, 0.95), vec3(0.08, 0.39, 0.98), dark);
  vec3 pink = mix(vec3(0.92, 0.68, 0.78), vec3(0.85, 0.42, 0.73), dark);

  vec3 col = mix(blue, pink, 0.5 + 0.5 * sin((uv.x + uv.y) * 2.2 + t * 0.15));
  col = mix(col, blue, smoothstep(0.7, 0.08, r1));
  col = mix(col, pink, smoothstep(0.65, 0.08, r2));
  return col;
}

void main() {
  vec2 uv = vUv;
  vec2 centered = vUv * 2.0 - 1.0;
  float aspect = uResolution.x / uResolution.y;
  vec2 aspected = centered * vec2(aspect, 1.0);
  float t = uTime;

  // ── Mouse warp ──
  vec2 mousePos = (uMouse * 2.0 - 1.0) * vec2(aspect, 1.0);
  vec2 toMouse = aspected - mousePos;
  float mouseDist = length(toMouse);
  float warp = exp(-mouseDist * mouseDist * 3.0) * uWarpStrength;
  float swirlAngle = warp * uSwirlMul;
  float cs = cos(swirlAngle), sn = sin(swirlAngle);
  vec2 warped = aspected + toMouse * warp * 0.4;
  vec2 fromMouse = warped - mousePos;
  warped = mousePos + vec2(
    fromMouse.x * cs - fromMouse.y * sn,
    fromMouse.x * sn + fromMouse.y * cs
  );
  vec2 warpedUV = (warped / vec2(aspect, 1.0)) * 0.5 + 0.5;

  // ── Glass refraction ──
  float n1 = noise(warpedUV * 6.0 + t * 0.15);
  float n2 = noise(warpedUV * 6.0 + t * 0.12 + 50.0);
  vec2 refract = (vec2(n1, n2) - 0.5) * uRefractStrength;

  vec2 bgUV = warpedUV + refract;
  vec3 bg = blcBackground(bgUV, t, uDark);

  // ── Chromatic aberration ──
  float edgeFactor = length(centered) * 0.7;
  float ca = uCABase * (1.0 + edgeFactor * uCAEdgeMul);

  vec3 refracted = vec3(
    blcBackground(warpedUV + refract * 1.1 + vec2(ca, ca * 0.3), t, uDark).r,
    blcBackground(warpedUV + refract, t, uDark).g,
    blcBackground(warpedUV + refract * 0.9 - vec2(ca * 0.4, ca), t, uDark).b
  );

  vec3 col = mix(bg, refracted, uRefractMix);

  // ── Caustics ──
  float fc1 = fbm(warpedUV * 5.0 + t * vec2(0.15, 0.1));
  float fc2 = fbm(warpedUV * 7.0 - t * vec2(0.12, 0.18) + 3.0);
  float caustic = pow(1.0 - abs(fc1 - fc2), uCausticExp);
  vec3 causticCol = mix(vec3(0.95, 0.92, 0.88), vec3(0.6, 0.8, 1.0), uDark);
  col += causticCol * caustic * uCausticIntensity;

  // ── Specular ──
  float s1 = fbm(warpedUV * 4.0 + vec2(t * 0.2, -t * 0.15));
  float s2 = fbm(warpedUV * 5.0 + vec2(-t * 0.18, t * 0.22) + 5.0);
  float spec = pow(s1 * s2, uSpecPow) * 2.0;
  col += mix(vec3(1.0, 0.98, 0.95), vec3(0.8, 0.85, 1.0), uDark) * spec * uSpecIntensity;

  // ── Fresnel ──
  float dist = length(centered);
  float fresnel = pow(dist, uFresnelExp) * uFresnelIntensity;
  col += mix(vec3(0.95, 0.93, 0.90), vec3(0.3, 0.4, 0.6), uDark) * fresnel;

  // ── Bevel ──
  vec2 edgeDist = abs(vUv - 0.5) * 2.0;
  float bevel = smoothstep(0.94, 1.0, max(edgeDist.x, edgeDist.y));
  col += bevel * uBevelIntensity * (0.8 + 0.2 * sin(t * 0.6 + edgeDist.x * 5.0));

  // ── Fog ──
  vec3 fogColor = mix(vec3(0.91, 0.89, 0.87), vec3(0.04, 0.04, 0.06), uDark);
  float fogNoise = noise(vUv * 3.0 + t * 0.04) * 0.1;
  float fogAmount = uFog * (0.4 + fogNoise) + uFog * dist * 0.3;
  col = mix(col, fogColor, clamp(fogAmount, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
}`;

// Default tunable values (matching previous hardcoded constants)
const DEFAULTS = {
  warpStrength: 0.2,
  swirlMul: 3.0,
  refractStrength: 0.06,
  caBase: 0.02,
  caEdgeMul: 2.5,
  refractMix: 0.7,
  causticIntensity: 0.2,
  causticExp: 8.0,
  specIntensity: 0.25,
  specPow: 3.0,
  fresnelIntensity: 0.4,
  fresnelExp: 2.5,
  bevelIntensity: 0.12,
};

export class GlassScene {
  constructor(canvas) {
    this.canvas = canvas;
    this._raf = null;
    this.fog = 0.12;
    this.glassBlur = 0.4;
    this.isDark = true;
    this.mouse = { x: 0.5, y: 0.5 };

    // Tunable shader params (live-editable via dial.js)
    this.params = { ...DEFAULTS };

    const p = { alpha: false, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
    const gl = canvas.getContext('webgl2', p) || canvas.getContext('webgl', p);
    if (!gl) return;
    this.gl = gl;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, -1,1, 1,1, 1,-1]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

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
    const pr = this.params;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);

    gl.uniform1f(this.u.uTime, t);
    gl.uniform1f(this.u.uFog, this.fog);
    gl.uniform1f(this.u.uGlassBlur, this.glassBlur);
    gl.uniform2f(this.u.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.u.uMouse, this.mouse.x, this.mouse.y);
    gl.uniform1f(this.u.uDark, this.isDark ? 1.0 : 0.0);

    // Tunable params
    gl.uniform1f(this.u.uWarpStrength, pr.warpStrength);
    gl.uniform1f(this.u.uSwirlMul, pr.swirlMul);
    gl.uniform1f(this.u.uRefractStrength, pr.refractStrength);
    gl.uniform1f(this.u.uCABase, pr.caBase);
    gl.uniform1f(this.u.uCAEdgeMul, pr.caEdgeMul);
    gl.uniform1f(this.u.uRefractMix, pr.refractMix);
    gl.uniform1f(this.u.uCausticIntensity, pr.causticIntensity);
    gl.uniform1f(this.u.uCausticExp, pr.causticExp);
    gl.uniform1f(this.u.uSpecIntensity, pr.specIntensity);
    gl.uniform1f(this.u.uSpecPow, pr.specPow);
    gl.uniform1f(this.u.uFresnelIntensity, pr.fresnelIntensity);
    gl.uniform1f(this.u.uFresnelExp, pr.fresnelExp);
    gl.uniform1f(this.u.uBevelIntensity, pr.bevelIntensity);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  }
}

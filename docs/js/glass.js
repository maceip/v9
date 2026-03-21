/**
 * Liquid glass shader — real refractive glass slab effect.
 * Vanilla WebGL — no Three.js dependency.
 *
 * Renders a thick glass pane with:
 * 1. Flowing organic noise field (not static lines)
 * 2. Strong visible refraction that warps the background
 * 3. Caustic light concentrations that swim across the surface
 * 4. Chromatic aberration (RGB split) especially at edges
 * 5. Fresnel edge reflections (brighter at glancing angles)
 * 6. Specular highlights that move with time
 * 7. Mouse-reactive distortion (gravitational lens + swirl)
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

// ── Noise primitives ──
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

// Fractal Brownian Motion — organic flowing shapes
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  vec2 shift = vec2(100.0);
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

// Smooth flowing distortion field — two fbm layers that feed into each other
vec2 flowField(vec2 p, float t) {
  float f1 = fbm(p + vec2(t * 0.12, t * 0.08));
  float f2 = fbm(p + vec2(t * -0.09, t * 0.14) + 4.3);
  // Second pass feeds the first — creates organic swirls
  float f3 = fbm(p + vec2(f1, f2) * 1.5 + t * 0.06);
  float f4 = fbm(p + vec2(f2, f1) * 1.5 - t * 0.07 + 7.7);
  return vec2(f3, f4);
}

// Background color — deep, rich tones that look good through glass
vec3 background(vec2 uv, float t, float dark) {
  // Flowing color field
  vec2 flow = flowField(uv * 2.0, t);

  // Dark mode: deep blues, purples, pinks
  vec3 c1Dark = vec3(0.12, 0.08, 0.22);  // deep purple
  vec3 c2Dark = vec3(0.08, 0.15, 0.28);  // navy
  vec3 c3Dark = vec3(0.25, 0.10, 0.20);  // plum
  vec3 c4Dark = vec3(0.10, 0.20, 0.25);  // teal

  // Light mode: warm pastels
  vec3 c1Light = vec3(0.92, 0.85, 0.82);
  vec3 c2Light = vec3(0.82, 0.86, 0.92);
  vec3 c3Light = vec3(0.90, 0.82, 0.88);
  vec3 c4Light = vec3(0.84, 0.90, 0.88);

  vec3 c1 = mix(c1Light, c1Dark, dark);
  vec3 c2 = mix(c2Light, c2Dark, dark);
  vec3 c3 = mix(c3Light, c3Dark, dark);
  vec3 c4 = mix(c4Light, c4Dark, dark);

  vec3 col = mix(
    mix(c1, c2, flow.x),
    mix(c3, c4, flow.y),
    sin(flow.x * 3.14159) * 0.5 + 0.5
  );

  return col;
}

void main() {
  vec2 uv = vUv;
  vec2 centered = vUv * 2.0 - 1.0;
  float aspect = uResolution.x / uResolution.y;
  vec2 aspected = centered * vec2(aspect, 1.0);
  float t = uTime;

  // ── Mouse warp distortion ──
  vec2 mousePos = (uMouse * 2.0 - 1.0) * vec2(aspect, 1.0);
  vec2 toMouse = aspected - mousePos;
  float mouseDist = length(toMouse);
  float warp = exp(-mouseDist * mouseDist * 3.0) * 0.2;
  float swirlAngle = warp * 3.0;
  float cs = cos(swirlAngle), sn = sin(swirlAngle);
  vec2 warped = aspected + toMouse * warp * 0.4;
  vec2 fromMouse = warped - mousePos;
  warped = mousePos + vec2(
    fromMouse.x * cs - fromMouse.y * sn,
    fromMouse.x * sn + fromMouse.y * cs
  );
  // Convert back to 0-1 range
  vec2 warpedUV = (warped / vec2(aspect, 1.0)) * 0.5 + 0.5;

  // ── Flowing refraction field ──
  // This is the core of the liquid glass look — strong, visible distortion
  vec2 flow = flowField(warpedUV * 3.0, t);
  // Refraction displacement — strong enough to visibly warp
  vec2 refractOffset = (flow - 0.5) * 0.08;

  // ── Base background (sampled through refraction) ──
  vec2 bgUV = warpedUV + refractOffset;
  vec3 bg = background(bgUV, t, uDark);

  // ── Chromatic aberration — RGB channels refracted differently ──
  float caStrength = 0.025; // Strong enough to see color fringing
  // Stronger CA at edges (like real glass — thicker at margins)
  float edgeFactor = length(centered) * 0.7;
  float ca = caStrength * (1.0 + edgeFactor * 2.0);

  vec2 uvR = warpedUV + refractOffset * 1.1 + vec2(ca, ca * 0.3);
  vec2 uvG = warpedUV + refractOffset;
  vec2 uvB = warpedUV + refractOffset * 0.9 - vec2(ca * 0.4, ca);

  vec3 refracted = vec3(
    background(uvR, t, uDark).r,
    background(uvG, t, uDark).g,
    background(uvB, t, uDark).b
  );

  // Mix refracted vs direct based on glass strength
  vec3 col = mix(bg, refracted, 0.7);

  // ── Caustics — bright swimming light concentrations ──
  // Caustics form where refracted light converges
  float caustic1 = fbm(warpedUV * 6.0 + t * vec2(0.15, 0.1));
  float caustic2 = fbm(warpedUV * 8.0 - t * vec2(0.12, 0.18) + 3.0);
  // Sharp caustic lines where two noise fields nearly match
  float causticPattern = pow(1.0 - abs(caustic1 - caustic2), 8.0);
  // Caustic color — bright white/cyan
  vec3 causticColor = mix(
    vec3(0.95, 0.92, 0.85),  // warm white (light mode)
    vec3(0.6, 0.8, 1.0),     // cool cyan (dark mode)
    uDark
  );
  col += causticColor * causticPattern * 0.25;

  // ── Specular highlights — moving glints on the glass surface ──
  float spec1 = fbm(warpedUV * 4.0 + vec2(t * 0.2, -t * 0.15));
  float spec2 = fbm(warpedUV * 5.0 + vec2(-t * 0.18, t * 0.22) + 5.0);
  float specular = pow(spec1 * spec2, 3.0) * 2.0;
  vec3 specColor = mix(vec3(1.0, 0.98, 0.95), vec3(0.8, 0.85, 1.0), uDark);
  col += specColor * specular * 0.3;

  // ── Fresnel — edges of glass are brighter (glancing angle reflection) ──
  float dist = length(centered);
  float fresnel = pow(dist, 2.5) * 0.5;
  vec3 fresnelColor = mix(
    vec3(0.95, 0.93, 0.90),  // warm white reflection (light)
    vec3(0.3, 0.4, 0.6),     // blue-grey reflection (dark)
    uDark
  );
  col += fresnelColor * fresnel;

  // ── Inner glow — subtle light from within the glass ──
  float innerGlow = exp(-dist * dist * 2.5) * 0.08;
  col += mix(vec3(1.0, 0.95, 0.9), vec3(0.4, 0.5, 0.7), uDark) * innerGlow;

  // ── Edge bevel — sharp highlight at the very edge ──
  vec2 edgeDist = abs(vUv - 0.5) * 2.0;
  float edgeMax = max(edgeDist.x, edgeDist.y);
  float bevel = smoothstep(0.94, 1.0, edgeMax);
  float bevelShine = 0.15 * (0.8 + 0.2 * sin(t * 0.6 + edgeDist.x * 5.0));
  col += bevel * bevelShine;

  // ── Fog (minimal in idle, fades more on interaction) ──
  vec3 fogColor = mix(vec3(0.91, 0.89, 0.87), vec3(0.04, 0.04, 0.06), uDark);
  float fogNoise = noise(vUv * 3.0 + t * 0.04) * 0.1;
  float fogAmount = uFog * (0.4 + fogNoise);
  float radialFog = dist * 0.4;
  fogAmount += uFog * radialFog * 0.2;
  col = mix(col, fogColor, clamp(fogAmount, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
}`;

export class GlassScene {
  constructor(canvas) {
    this.canvas = canvas;
    this._raf = null;
    this.fog = 0.12;       // Very light fog — glass effect clearly visible
    this.glassBlur = 0.4;
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

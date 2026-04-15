/**
 * Navier-Stokes fluid simulation for navbar hover flourish.
 * Navier-Stokes fluid simulation — standalone, no bundler.
 * Inlines shader sources directly.
 */

// ── Shader sources (inlined from docs/shaders/) ──

const baseVertexSource = `
precision highp float;
attribute vec2 position;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform vec2 texelSize;
void main() {
    vUv = position * 0.5 + 0.5;
    vL = vUv - vec2(texelSize.x, 0.0);
    vR = vUv + vec2(texelSize.x, 0.0);
    vT = vUv + vec2(0.0, texelSize.y);
    vB = vUv - vec2(0.0, texelSize.y);
    gl_Position = vec4(position, 0.0, 1.0);
}`;

const splatSource = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform vec2 prevPoint;
uniform float radius;
uniform float canRender;
float cubicOut(float t) { float f = t - 1.0; return f * f * f + 1.0; }
float capsuleDist(vec2 uv, vec2 p1, vec2 p2) {
    vec2 pa = uv - p1; vec2 ba = p2 - p1;
    pa.x *= aspectRatio; ba.x *= aspectRatio;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}
void main() {
    float d = capsuleDist(vUv, prevPoint, point);
    vec3 splat = (1.0 - cubicOut(clamp(d / radius, 0.0, 1.0))) * color;
    vec3 base = texture2D(uTarget, vUv).xyz;
    base *= canRender;
    gl_FragColor = vec4(base + splat, 1.0);
}`;

const advectionSource = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
void main() {
    vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
    vec4 result = texture2D(uSource, coord);
    float decay = 1.0 + dissipation * dt;
    gl_FragColor = result / decay;
}`;

const divergenceSource = `
precision highp float;
varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
uniform sampler2D uVelocity;
void main() {
    float L = texture2D(uVelocity, vL).x;
    float R = texture2D(uVelocity, vR).x;
    float T = texture2D(uVelocity, vT).y;
    float B = texture2D(uVelocity, vB).y;
    gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

const curlSource = `
precision highp float;
varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
uniform sampler2D uVelocity;
void main() {
    float L = texture2D(uVelocity, vL).y;
    float R = texture2D(uVelocity, vR).y;
    float T = texture2D(uVelocity, vT).x;
    float B = texture2D(uVelocity, vB).x;
    gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

const vorticitySource = `
precision highp float;
varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main() {
    float L = texture2D(uCurl, vL).x;
    float R = texture2D(uCurl, vR).x;
    float T = texture2D(uCurl, vT).x;
    float B = texture2D(uCurl, vB).x;
    float C = texture2D(uCurl, vUv).x;
    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    float len = length(force) + 0.0001;
    force = force / len * curl * C;
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    velocity += force * dt;
    gl_FragColor = vec4(velocity, 0.0, 1.0);
}`;

const pressureSource = `
precision highp float;
varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main() {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;
    float C = texture2D(uDivergence, vUv).x;
    gl_FragColor = vec4((L + R + B + T - C) * 0.25, 0.0, 0.0, 1.0);
}`;

const gradientSubtractSource = `
precision highp float;
varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main() {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    velocity.xy -= vec2(R - L, T - B);
    gl_FragColor = vec4(velocity, 0.0, 1.0);
}`;

const displaySource = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTexture;
void main() {
    vec3 C = texture2D(uTexture, vUv).rgb;
    float a = max(C.r, max(C.g, C.b));
    gl_FragColor = vec4(C.r * 0.6, C.r * 0.85, C.r * 0.3, a * 0.8);
}`;

const clearSource = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform float value;
void main() {
    gl_FragColor = value * texture2D(uTexture, vUv);
}`;

// ── Config ──
const SIM_RES = 64;   // Lower than original 128 for navbar perf
const DYE_RES = 256;  // Lower than original 512
const DENSITY_DISSIPATION = 0.96;
const VELOCITY_DISSIPATION = 0.97;
const PRESSURE_DISSIPATION = 0.8;
const CURL_STRENGTH = 25;
const PRESSURE_ITERATIONS = 12;

export class NavFluid {
  constructor(canvas) {
    this.canvas = canvas;
    this.active = false;
    this.mouse = { x: 0, y: 0, px: 0, py: 0, moved: false };
    this._raf = null;
    this._lastTime = 0;

    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false, premultipliedAlpha: false };
    let gl = canvas.getContext('webgl2', params);
    this.isWebGL2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', params);
    if (!gl) return; // No WebGL support
    this.gl = gl;

    // Extensions
    if (this.isWebGL2) {
      gl.getExtension('EXT_color_buffer_float');
      this.halfFloat = gl.HALF_FLOAT;
      this.intFmtRGBA = gl.RGBA16F; this.intFmtRG = gl.RG16F; this.intFmtR = gl.R16F;
      this.fmtRGBA = gl.RGBA; this.fmtRG = gl.RG; this.fmtR = gl.RED;
    } else {
      const ext = gl.getExtension('OES_texture_half_float');
      gl.getExtension('OES_texture_half_float_linear');
      this.halfFloat = ext ? ext.HALF_FLOAT_OES : gl.UNSIGNED_BYTE;
      this.intFmtRGBA = gl.RGBA; this.intFmtRG = gl.RGBA; this.intFmtR = gl.RGBA;
      this.fmtRGBA = gl.RGBA; this.fmtRG = gl.RGBA; this.fmtR = gl.RGBA;
    }

    // Fullscreen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, -1,1, 1,1, 1,-1]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    this.programs = {};
    this._compile();
    this._initFBOs();
  }

  _compile() {
    const gl = this.gl;
    const vert = this._shader(gl.VERTEX_SHADER, baseVertexSource);
    const make = (src) => {
      const frag = this._shader(gl.FRAGMENT_SHADER, src);
      const prog = gl.createProgram();
      gl.attachShader(prog, vert); gl.attachShader(prog, frag);
      gl.bindAttribLocation(prog, 0, 'position');
      gl.linkProgram(prog);
      const uniforms = {};
      const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(prog, i);
        uniforms[info.name] = gl.getUniformLocation(prog, info.name);
      }
      return { program: prog, uniforms };
    };
    this.programs.splat = make(splatSource);
    this.programs.advection = make(advectionSource);
    this.programs.divergence = make(divergenceSource);
    this.programs.curl = make(curlSource);
    this.programs.vorticity = make(vorticitySource);
    this.programs.pressure = make(pressureSource);
    this.programs.gradientSubtract = make(gradientSubtractSource);
    this.programs.display = make(displaySource);
    this.programs.clear = make(clearSource);
  }

  _shader(type, src) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    return s;
  }

  _initFBOs() {
    const gl = this.gl;
    this.simTexel = [1/SIM_RES, 1/SIM_RES];
    this.dyeTexel = [1/DYE_RES, 1/DYE_RES];
    this.velocity = this._dFBO(SIM_RES, SIM_RES, this.intFmtRG, this.fmtRG, this.halfFloat, gl.LINEAR);
    this.density = this._dFBO(DYE_RES, DYE_RES, this.intFmtRGBA, this.fmtRGBA, this.halfFloat, gl.LINEAR);
    this.pressureFBO = this._dFBO(SIM_RES, SIM_RES, this.intFmtR, this.fmtR, this.halfFloat, gl.NEAREST);
    this.curlFBO = this._fbo(SIM_RES, SIM_RES, this.intFmtR, this.fmtR, this.halfFloat, gl.NEAREST);
    this.divFBO = this._fbo(SIM_RES, SIM_RES, this.intFmtR, this.fmtR, this.halfFloat, gl.NEAREST);
  }

  _fbo(w, h, int, fmt, type, filter) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, int, w, h, 0, fmt, type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT);
    return { texture: tex, fbo, width: w, height: h };
  }

  _dFBO(w, h, int, fmt, type, filter) {
    return {
      width: w, height: h,
      read: this._fbo(w, h, int, fmt, type, filter),
      write: this._fbo(w, h, int, fmt, type, filter),
      swap() { const t = this.read; this.read = this.write; this.write = t; }
    };
  }

  _use(p) { this.gl.useProgram(p.program); }
  _blit(t) {
    const gl = this.gl;
    if (t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.viewport(0, 0, t.width, t.height); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.canvas.width, gl.canvas.height); }
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  }

  resize() {
    const r = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth * r;
    const h = this.canvas.clientHeight * r;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
  }

  onMouse(x, y) {
    this.mouse.px = this.mouse.x;
    this.mouse.py = this.mouse.y;
    this.mouse.x = x;
    this.mouse.y = y;
    this.mouse.moved = true;
  }

  start() {
    if (this.active || !this.gl) return;
    this.active = true;
    this.resize();
    this._lastTime = performance.now();
    this._loop();
  }

  stop() {
    this.active = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  _loop() {
    if (!this.active) return;
    this._raf = requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const dt = Math.min((now - this._lastTime) / 1000, 0.016);
    this._lastTime = now;
    this._step(dt);
  }

  _step(dt) {
    const gl = this.gl;
    if (!gl) return;

    // Inject mouse input
    if (this.mouse.moved) {
      this.mouse.moved = false;
      const dx = (this.mouse.x - this.mouse.px) * 800;
      const dy = (this.mouse.y - this.mouse.py) * 800;
      const u = this.programs.splat.uniforms;
      this._use(this.programs.splat);
      gl.uniform1i(u.uTarget, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
      gl.uniform1f(u.aspectRatio, this.canvas.width / this.canvas.height);
      gl.uniform2f(u.point, this.mouse.x, this.mouse.y);
      gl.uniform2f(u.prevPoint, this.mouse.px, this.mouse.py);
      gl.uniform3f(u.color, dx, dy, 0);
      gl.uniform1f(u.radius, 0.15);
      gl.uniform1f(u.canRender, 1);
      this._blit(this.velocity.write); this.velocity.swap();

      // Splat density
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.density.read.texture);
      gl.uniform3f(u.color, 0.6, 1.0, 0.3); // Greenish accent
      this._blit(this.density.write); this.density.swap();
    }

    // Curl
    this._use(this.programs.curl);
    gl.uniform2f(this.programs.curl.uniforms.texelSize, this.simTexel[0], this.simTexel[1]);
    gl.uniform1i(this.programs.curl.uniforms.uVelocity, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    this._blit(this.curlFBO);

    // Vorticity
    this._use(this.programs.vorticity);
    gl.uniform2f(this.programs.vorticity.uniforms.texelSize, this.simTexel[0], this.simTexel[1]);
    gl.uniform1i(this.programs.vorticity.uniforms.uVelocity, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform1i(this.programs.vorticity.uniforms.uCurl, 1);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.curlFBO.texture);
    gl.uniform1f(this.programs.vorticity.uniforms.curl, CURL_STRENGTH);
    gl.uniform1f(this.programs.vorticity.uniforms.dt, dt);
    this._blit(this.velocity.write); this.velocity.swap();

    // Divergence
    this._use(this.programs.divergence);
    gl.uniform2f(this.programs.divergence.uniforms.texelSize, this.simTexel[0], this.simTexel[1]);
    gl.uniform1i(this.programs.divergence.uniforms.uVelocity, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    this._blit(this.divFBO);

    // Clear pressure
    this._use(this.programs.clear);
    gl.uniform1i(this.programs.clear.uniforms.uTexture, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.pressureFBO.read.texture);
    gl.uniform1f(this.programs.clear.uniforms.value, PRESSURE_DISSIPATION);
    this._blit(this.pressureFBO.write); this.pressureFBO.swap();

    // Pressure solve
    this._use(this.programs.pressure);
    gl.uniform2f(this.programs.pressure.uniforms.texelSize, this.simTexel[0], this.simTexel[1]);
    gl.uniform1i(this.programs.pressure.uniforms.uDivergence, 1);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.divFBO.texture);
    for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(this.programs.pressure.uniforms.uPressure, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.pressureFBO.read.texture);
      this._blit(this.pressureFBO.write); this.pressureFBO.swap();
    }

    // Gradient subtract
    this._use(this.programs.gradientSubtract);
    gl.uniform2f(this.programs.gradientSubtract.uniforms.texelSize, this.simTexel[0], this.simTexel[1]);
    gl.uniform1i(this.programs.gradientSubtract.uniforms.uPressure, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.pressureFBO.read.texture);
    gl.uniform1i(this.programs.gradientSubtract.uniforms.uVelocity, 1);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    this._blit(this.velocity.write); this.velocity.swap();

    // Advect velocity
    this._use(this.programs.advection);
    gl.uniform2f(this.programs.advection.uniforms.texelSize, this.simTexel[0], this.simTexel[1]);
    gl.uniform1f(this.programs.advection.uniforms.dt, dt);
    gl.uniform1f(this.programs.advection.uniforms.dissipation, VELOCITY_DISSIPATION);
    gl.uniform1i(this.programs.advection.uniforms.uVelocity, 0);
    gl.uniform1i(this.programs.advection.uniforms.uSource, 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    this._blit(this.velocity.write); this.velocity.swap();

    // Advect density
    gl.uniform2f(this.programs.advection.uniforms.texelSize, this.dyeTexel[0], this.dyeTexel[1]);
    gl.uniform1f(this.programs.advection.uniforms.dissipation, DENSITY_DISSIPATION);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.density.read.texture);
    this._blit(this.density.write); this.density.swap();

    // Display to screen
    this._use(this.programs.display);
    gl.uniform1i(this.programs.display.uniforms.uTexture, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.density.read.texture);
    this._blit(null);
  }
}

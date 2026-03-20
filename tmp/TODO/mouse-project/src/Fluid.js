/**
 * Navier-Stokes fluid simulation running entirely on the GPU.
 *
 * Produces a density field driven by mouse input that is used
 * as a mask for the text reveal effect.
 */

import baseVertexSource from './shaders/baseVertex.glsl?raw';
import splatSource from './shaders/splat.glsl?raw';
import advectionSource from './shaders/advection.glsl?raw';
import divergenceSource from './shaders/divergence.glsl?raw';
import curlSource from './shaders/curl.glsl?raw';
import vorticitySource from './shaders/vorticity.glsl?raw';
import pressureSource from './shaders/pressure.glsl?raw';
import gradientSubtractSource from './shaders/gradientSubtract.glsl?raw';
import displaySource from './shaders/display.glsl?raw';
import clearSource from './shaders/clear.glsl?raw';

// ---- Config ----
const SIM_RES = 128;
const DYE_RES = 512;
const DENSITY_DISSIPATION = 0.97;
const VELOCITY_DISSIPATION = 0.98;
const PRESSURE_DISSIPATION = 0.8;
const CURL_STRENGTH = 30;
const PRESSURE_ITERATIONS = 20;

export class Fluid {
    constructor(canvas) {
        this.canvas = canvas;

        // Get WebGL context with extensions
        const params = {
            alpha: true,
            depth: false,
            stencil: false,
            antialias: false,
            preserveDrawingBuffer: false,
        };
        let gl = canvas.getContext('webgl2', params);
        this.isWebGL2 = !!gl;
        if (!gl) {
            gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
        }
        this.gl = gl;

        // Extensions
        if (this.isWebGL2) {
            gl.getExtension('EXT_color_buffer_float');
            this.halfFloatExt = null; // WebGL2 uses gl.HALF_FLOAT natively
            this.halfFloatType = gl.HALF_FLOAT;
            this.floatLinear = gl.getExtension('OES_texture_float_linear');
            this.halfFloatLinear = true; // WebGL2 supports this natively
            this.internalFormatRGBA = gl.RGBA16F;
            this.internalFormatRG = gl.RG16F;
            this.internalFormatR = gl.R16F;
            this.formatRGBA = gl.RGBA;
            this.formatRG = gl.RG;
            this.formatR = gl.RED;
        } else {
            this.halfFloatExt = gl.getExtension('OES_texture_half_float');
            gl.getExtension('OES_texture_half_float_linear');
            this.halfFloatType = this.halfFloatExt ? this.halfFloatExt.HALF_FLOAT_OES : gl.UNSIGNED_BYTE;
            this.internalFormatRGBA = gl.RGBA;
            this.internalFormatRG = gl.RGBA;
            this.internalFormatR = gl.RGBA;
            this.formatRGBA = gl.RGBA;
            this.formatRG = gl.RGBA;
            this.formatR = gl.RGBA;
        }

        // Fullscreen quad
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);

        // Compile shader programs
        this.programs = {};
        this._compilePrograms();

        // Allocate FBOs
        this._initFBOs();
    }

    _compilePrograms() {
        const gl = this.gl;
        const vert = this._compileShader(gl.VERTEX_SHADER, baseVertexSource);

        const makeProgram = (fragSource) => {
            const frag = this._compileShader(gl.FRAGMENT_SHADER, fragSource);
            const prog = gl.createProgram();
            gl.attachShader(prog, vert);
            gl.attachShader(prog, frag);
            gl.bindAttribLocation(prog, 0, 'position');
            gl.linkProgram(prog);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
                console.error('Link error:', gl.getProgramInfoLog(prog));
            }
            // Cache uniform locations
            const uniforms = {};
            const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
            for (let i = 0; i < count; i++) {
                const info = gl.getActiveUniform(prog, i);
                uniforms[info.name] = gl.getUniformLocation(prog, info.name);
            }
            return { program: prog, uniforms };
        };

        this.programs.splat = makeProgram(splatSource);
        this.programs.advection = makeProgram(advectionSource);
        this.programs.divergence = makeProgram(divergenceSource);
        this.programs.curl = makeProgram(curlSource);
        this.programs.vorticity = makeProgram(vorticitySource);
        this.programs.pressure = makeProgram(pressureSource);
        this.programs.gradientSubtract = makeProgram(gradientSubtractSource);
        this.programs.display = makeProgram(displaySource);
        this.programs.clear = makeProgram(clearSource);
    }

    _compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            console.error('Source:', source);
        }
        return shader;
    }

    _initFBOs() {
        const gl = this.gl;
        const simW = SIM_RES;
        const simH = SIM_RES;
        const dyeW = DYE_RES;
        const dyeH = DYE_RES;

        this.simTexelSize = [1.0 / simW, 1.0 / simH];
        this.dyeTexelSize = [1.0 / dyeW, 1.0 / dyeH];

        // Double-buffered FBOs
        this.velocity = this._createDoubleFBO(simW, simH, this.internalFormatRG, this.formatRG, this.halfFloatType, gl.LINEAR);
        this.density = this._createDoubleFBO(dyeW, dyeH, this.internalFormatRGBA, this.formatRGBA, this.halfFloatType, gl.LINEAR);
        this.pressure = this._createDoubleFBO(simW, simH, this.internalFormatR, this.formatR, this.halfFloatType, gl.NEAREST);

        // Single FBOs
        this.curlFBO = this._createFBO(simW, simH, this.internalFormatR, this.formatR, this.halfFloatType, gl.NEAREST);
        this.divergenceFBO = this._createFBO(simW, simH, this.internalFormatR, this.formatR, this.halfFloatType, gl.NEAREST);

        // Display FBO for the text mask (rendered from density)
        this.displayFBO = this._createFBO(dyeW, dyeH, this.internalFormatRGBA, this.formatRGBA, this.halfFloatType, gl.LINEAR);
    }

    _createFBO(w, h, internalFormat, format, type, filter) {
        const gl = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.viewport(0, 0, w, h);
        gl.clear(gl.COLOR_BUFFER_BIT);

        return { texture: tex, fbo, width: w, height: h };
    }

    _createDoubleFBO(w, h, internalFormat, format, type, filter) {
        return {
            width: w,
            height: h,
            read: this._createFBO(w, h, internalFormat, format, type, filter),
            write: this._createFBO(w, h, internalFormat, format, type, filter),
            swap() {
                const tmp = this.read;
                this.read = this.write;
                this.write = tmp;
            }
        };
    }

    _bindProgram(prog) {
        const gl = this.gl;
        gl.useProgram(prog.program);
    }

    _blit(target) {
        const gl = this.gl;
        if (target) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
            gl.viewport(0, 0, target.width, target.height);
        } else {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        }
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    }

    /**
     * Inject density + velocity at a point (capsule from prev to current).
     * x, y are in 0..1 UV space. dx, dy are velocity deltas.
     */
    drawInput(x, y, dx, dy, color, radius) {
        const gl = this.gl;

        // Splat velocity
        this._bindProgram(this.programs.splat);
        const su = this.programs.splat.uniforms;
        gl.uniform1i(su.uTarget, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
        gl.uniform1f(su.aspectRatio, this.canvas.width / this.canvas.height);
        gl.uniform2f(su.point, x, y);
        gl.uniform2f(su.prevPoint, x - dx * 0.001, y - dy * 0.001);
        gl.uniform3f(su.color, dx, dy, 0.0);
        gl.uniform1f(su.radius, radius / 100.0);
        gl.uniform1f(su.canRender, 1.0);
        this._blit(this.velocity.write);
        this.velocity.swap();

        // Splat density/dye
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.density.read.texture);
        gl.uniform3f(su.color, color[0], color[1], color[2]);
        this._blit(this.density.write);
        this.density.swap();
    }

    /**
     * Run one full simulation step.
     */
    step(dt) {
        const gl = this.gl;

        // 1. Curl
        this._bindProgram(this.programs.curl);
        gl.uniform2f(this.programs.curl.uniforms.texelSize, this.simTexelSize[0], this.simTexelSize[1]);
        gl.uniform1i(this.programs.curl.uniforms.uVelocity, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
        this._blit(this.curlFBO);

        // 2. Vorticity confinement
        this._bindProgram(this.programs.vorticity);
        gl.uniform2f(this.programs.vorticity.uniforms.texelSize, this.simTexelSize[0], this.simTexelSize[1]);
        gl.uniform1i(this.programs.vorticity.uniforms.uVelocity, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
        gl.uniform1i(this.programs.vorticity.uniforms.uCurl, 1);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.curlFBO.texture);
        gl.uniform1f(this.programs.vorticity.uniforms.curl, CURL_STRENGTH);
        gl.uniform1f(this.programs.vorticity.uniforms.dt, dt);
        this._blit(this.velocity.write);
        this.velocity.swap();

        // 3. Divergence
        this._bindProgram(this.programs.divergence);
        gl.uniform2f(this.programs.divergence.uniforms.texelSize, this.simTexelSize[0], this.simTexelSize[1]);
        gl.uniform1i(this.programs.divergence.uniforms.uVelocity, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
        this._blit(this.divergenceFBO);

        // 4. Clear pressure (pressure dissipation)
        this._bindProgram(this.programs.clear);
        gl.uniform1i(this.programs.clear.uniforms.uTexture, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.texture);
        gl.uniform1f(this.programs.clear.uniforms.value, PRESSURE_DISSIPATION);
        this._blit(this.pressure.write);
        this.pressure.swap();

        // 5. Pressure solve (Jacobi iterations)
        this._bindProgram(this.programs.pressure);
        gl.uniform2f(this.programs.pressure.uniforms.texelSize, this.simTexelSize[0], this.simTexelSize[1]);
        gl.uniform1i(this.programs.pressure.uniforms.uDivergence, 1);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.divergenceFBO.texture);
        for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
            gl.uniform1i(this.programs.pressure.uniforms.uPressure, 0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.texture);
            this._blit(this.pressure.write);
            this.pressure.swap();
        }

        // 6. Gradient subtract
        this._bindProgram(this.programs.gradientSubtract);
        gl.uniform2f(this.programs.gradientSubtract.uniforms.texelSize, this.simTexelSize[0], this.simTexelSize[1]);
        gl.uniform1i(this.programs.gradientSubtract.uniforms.uPressure, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.texture);
        gl.uniform1i(this.programs.gradientSubtract.uniforms.uVelocity, 1);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
        this._blit(this.velocity.write);
        this.velocity.swap();

        // 7. Advect velocity (self-advect: uVelocity = uSource = velocity)
        this._bindProgram(this.programs.advection);
        gl.uniform2f(this.programs.advection.uniforms.texelSize, this.simTexelSize[0], this.simTexelSize[1]);
        gl.uniform1f(this.programs.advection.uniforms.dt, dt);
        gl.uniform1f(this.programs.advection.uniforms.dissipation, VELOCITY_DISSIPATION);
        gl.uniform1i(this.programs.advection.uniforms.uVelocity, 0);
        gl.uniform1i(this.programs.advection.uniforms.uSource, 1);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
        this._blit(this.velocity.write);
        this.velocity.swap();

        // 8. Advect density (uVelocity = velocity, uSource = density)
        gl.uniform2f(this.programs.advection.uniforms.texelSize, this.dyeTexelSize[0], this.dyeTexelSize[1]);
        gl.uniform1f(this.programs.advection.uniforms.dissipation, DENSITY_DISSIPATION);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.density.read.texture);
        this._blit(this.density.write);
        this.density.swap();
    }

    /**
     * Render the density field through the display shader into displayFBO.
     * The display shader remaps the color so:
     *   out = (r, r*0.6, r*0.05, max(r,g,b))
     * This FBO is then sampled by the text composite shader.
     */
    renderDisplay() {
        const gl = this.gl;
        this._bindProgram(this.programs.display);
        gl.uniform1i(this.programs.display.uniforms.uTexture, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.density.read.texture);
        this._blit(this.displayFBO);
    }

    /**
     * Get the display FBO texture (the fluid mask for text reveal).
     */
    getDisplayTexture() {
        return this.displayFBO.texture;
    }

    /**
     * Get the raw density texture (for rendering the white blob behind text).
     */
    getDensityTexture() {
        return this.density.read.texture;
    }

    resize(w, h) {
        this.canvas.width = w;
        this.canvas.height = h;
    }
}

/**
 * Main entry point.
 *
 * Everything runs in a single raw-WebGL context:
 *   1. Navier-Stokes fluid simulation on the GPU.
 *   2. Mouse motion injects density/velocity.
 *   3. Density is rendered through a "display" shader that remaps colours.
 *   4. A composite pass blends:
 *      - cream background
 *      - white fluid blob (behind text)
 *      - outline text + fill text revealed by fluid mask
 */

import { Fluid } from './Fluid.js';

// ---- Helpers ----
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function mapRange(v, inLo, inHi, outLo, outHi, clamped) {
    let t = (v - inLo) / (inHi - inLo);
    if (clamped) t = clamp(t, 0, 1);
    return outLo + t * (outHi - outLo);
}

// ---- Canvas & GL setup ----
const canvas = document.getElementById('canvas');
const dpr = Math.min(window.devicePixelRatio, 2);

function resizeCanvas() {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
}
resizeCanvas();

// ---- Fluid simulation (owns the GL context) ----
const fluid = new Fluid(canvas);
const gl = fluid.gl;

// ---- Text textures (outline + fill), created inside the same GL context ----
function makeTextCanvas(mode, w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    const fontSize = Math.min(w * 0.155, h * 0.26);
    ctx.font = `900 ${fontSize}px "Impact", "Arial Black", "Helvetica Neue", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const text1 = 'SIP SIP';
    const text2 = 'HOORAY!';
    const lineGap = fontSize * 0.55;

    if (mode === 'outline') {
        ctx.strokeStyle = 'white';
        ctx.lineWidth = Math.max(2, fontSize * 0.03);
        ctx.lineJoin = 'round';
        ctx.strokeText(text1, w / 2, h / 2 - lineGap);
        ctx.strokeText(text2, w / 2, h / 2 + lineGap);
    } else {
        ctx.fillStyle = 'white';
        ctx.fillText(text1, w / 2, h / 2 - lineGap);
        ctx.fillText(text2, w / 2, h / 2 + lineGap);
    }
    return c;
}

function canvasToGLTexture(cnv) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cnv);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    return tex;
}

let outlineTex = canvasToGLTexture(makeTextCanvas('outline', canvas.width, canvas.height));
let fillTex = canvasToGLTexture(makeTextCanvas('fill', canvas.width, canvas.height));

// ---- Composite shader (final pass to screen) ----
const compositeVert = `
precision highp float;
attribute vec2 position;
varying vec2 vUv;
void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}
`;

const compositeFrag = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tOutline;
uniform sampler2D tFill;
uniform sampler2D tFluidMask;
uniform vec3 uColor;       // text colour (#00A165)
uniform vec3 uBgColor;     // background colour (#F5F0E8)
uniform vec2 resolution;

void main() {
    // Sample text textures (UV coordinates)
    float outlineAlpha = texture2D(tOutline, vUv).a;
    float fillAlpha = texture2D(tFill, vUv).a;

    // Sample fluid mask (same UV space since display FBO covers full area)
    vec3 fluidMask = texture2D(tFluidMask, vUv).rgb;

    // Blob intensity (for the white blob behind text)
    float blobAlpha = max(fluidMask.r, max(fluidMask.g, fluidMask.b));

    // Reveal threshold: when fluid green channel >= 0.99, show fill
    float reveal = smoothstep(0.99, 1.0, fluidMask.g);

    // Start with background
    vec3 color = uBgColor;

    // Blend white blob on top of background
    color = mix(color, vec3(1.0), clamp(blobAlpha * 0.8, 0.0, 1.0));

    // Text: mix outline and fill based on reveal
    float textAlpha = mix(outlineAlpha, fillAlpha, reveal);

    // Composite text on top
    color = mix(color, uColor, textAlpha);

    gl_FragColor = vec4(color, 1.0);
}
`;

function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader error:', gl.getShaderInfoLog(shader));
    }
    return shader;
}

function createProgram(vs, fs) {
    const v = compileShader(gl.VERTEX_SHADER, vs);
    const f = compileShader(gl.FRAGMENT_SHADER, fs);
    const prog = gl.createProgram();
    gl.attachShader(prog, v);
    gl.attachShader(prog, f);
    gl.bindAttribLocation(prog, 0, 'position');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error('Link error:', gl.getProgramInfoLog(prog));
    }
    const uniforms = {};
    const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(prog, i);
        uniforms[info.name] = gl.getUniformLocation(prog, info.name);
    }
    return { program: prog, uniforms };
}

const compositeProgram = createProgram(compositeVert, compositeFrag);

// ---- Mouse tracking ----
// Raw mouse position (instant, from events)
const mouseRaw = { x: 0.5, y: 0.5 };
// Smoothed mouse position (lerped toward raw — creates the smooth blob trail)
const mouse = { x: 0.5, y: 0.5 };
const lastMouse = { x: 0.5, y: 0.5 };
let mouseInited = false;
const MOUSE_EASE = 0.12;  // how fast smoothed mouse chases raw (lower = smoother trail)

window.addEventListener('mousemove', (e) => {
    mouseRaw.x = e.clientX / window.innerWidth;
    mouseRaw.y = 1.0 - e.clientY / window.innerHeight;
    if (!mouseInited) {
        mouse.x = mouseRaw.x;
        mouse.y = mouseRaw.y;
        lastMouse.x = mouseRaw.x;
        lastMouse.y = mouseRaw.y;
        mouseInited = true;
    }
});

window.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    mouseRaw.x = t.clientX / window.innerWidth;
    mouseRaw.y = 1.0 - t.clientY / window.innerHeight;
    if (!mouseInited) {
        mouse.x = mouseRaw.x;
        mouse.y = mouseRaw.y;
        lastMouse.x = mouseRaw.x;
        lastMouse.y = mouseRaw.y;
        mouseInited = true;
    }
}, { passive: false });

window.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    mouseRaw.x = t.clientX / window.innerWidth;
    mouseRaw.y = 1.0 - t.clientY / window.innerHeight;
    mouse.x = mouseRaw.x;
    mouse.y = mouseRaw.y;
    lastMouse.x = mouseRaw.x;
    lastMouse.y = mouseRaw.y;
    mouseInited = true;
}, { passive: false });

// ---- Resize ----
function onResize() {
    resizeCanvas();
    fluid.resize(canvas.width, canvas.height);

    // Rebuild text textures
    gl.deleteTexture(outlineTex);
    gl.deleteTexture(fillTex);
    outlineTex = canvasToGLTexture(makeTextCanvas('outline', canvas.width, canvas.height));
    fillTex = canvasToGLTexture(makeTextCanvas('fill', canvas.width, canvas.height));
}
window.addEventListener('resize', onResize);

// ---- Animation loop ----
const dt = 1 / 60;
const white = [1.0, 1.0, 1.0];

// Background colour: #F5F0E8
const bgColor = [0xF5 / 255, 0xF0 / 255, 0xE8 / 255];
// Text colour: #00A165
const textColor = [0x00 / 255, 0xA1 / 255, 0x65 / 255];

function animate() {
    requestAnimationFrame(animate);

    // --- Mouse to fluid ---
    if (mouseInited) {
        // Smooth mouse position — this is what creates the organic blob trail
        // instead of jerky frame-by-frame jumps
        mouse.x += (mouseRaw.x - mouse.x) * MOUSE_EASE;
        mouse.y += (mouseRaw.y - mouse.y) * MOUSE_EASE;

        const dx = mouse.x - lastMouse.x;
        const dy = mouse.y - lastMouse.y;
        const len = Math.sqrt(dx * dx + dy * dy);

        // Base size + velocity bonus — never drops to 0
        const baseSize = 15;  // minimum blob size even when barely moving
        const velocityBonus = mapRange(len, 0, 0.03, 0, 35, true);
        const size = baseSize + velocityBonus;

        // Delta multiplier for velocity injection
        const delta = mapRange(len, 0, 0.1, 0, 10, true);

        if (len > 0.00005) {
            fluid.drawInput(
                mouse.x, mouse.y,
                dx * delta,
                dy * delta,
                white,
                size
            );
        }

        lastMouse.x = mouse.x;
        lastMouse.y = mouse.y;
    }

    // --- Fluid simulation step ---
    fluid.step(dt);

    // --- Render display pass (density to remapped colour) ---
    fluid.renderDisplay();

    // --- Final composite pass to screen ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.useProgram(compositeProgram.program);

    const cu = compositeProgram.uniforms;

    // Bind textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, outlineTex);
    gl.uniform1i(cu.tOutline, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fillTex);
    gl.uniform1i(cu.tFill, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, fluid.getDisplayTexture());
    gl.uniform1i(cu.tFluidMask, 2);

    gl.uniform3f(cu.uColor, textColor[0], textColor[1], textColor[2]);
    gl.uniform3f(cu.uBgColor, bgColor[0], bgColor[1], bgColor[2]);
    gl.uniform2f(cu.resolution, canvas.width, canvas.height);

    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

animate();

precision highp float;
varying vec2 vUv;
uniform sampler2D uTexture;

void main() {
    vec3 C = texture2D(uTexture, vUv).rgb;
    float a = max(C.r, max(C.g, C.b));
    gl_FragColor = vec4(C.r, C.r * 0.6, C.r * 0.05, a);
}

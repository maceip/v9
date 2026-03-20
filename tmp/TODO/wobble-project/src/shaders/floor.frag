uniform sampler2D tReflection;
uniform float time;
uniform float floorAlpha;

varying vec2 vUv;

void main() {
    // Watery distortion on reflection
    vec2 uv = vUv;
    uv.x += sin(uv.y * 12.0 + time * 0.8) * 0.008;
    uv.y += cos(uv.x * 10.0 + time * 0.6) * 0.006;

    vec4 reflection = texture2D(tReflection, uv);

    // Fade reflection by distance from center
    float fade = smoothstep(0.0, 0.5, vUv.y);
    float edgeFade = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);

    vec3 color = reflection.rgb * 0.35 * fade * edgeFade;

    gl_FragColor = vec4(color, floorAlpha);
}

uniform sampler2D tMap;
uniform float deg;
uniform float opacity;

varying vec2 vUv;

vec3 DirLight(vec3 _rgb) {
    float light = sin(vUv.x * 2.0 - 1.0) * vUv.y * deg * 10.0;
    vec3 rgb = light * _rgb + pow(light, 3.0) * 0.1;
    if (deg <= 0.0) {
        light = sin(vUv.x * 2.0 - 1.0) * (1.0 - vUv.y) * deg * 20.0;
        rgb = (light * _rgb + pow(light, 3.0) * 0.005);
    }
    return rgb;
}

float Vignette(float power) {
    vec2 uv_vig = vUv;
    uv_vig *= 1.0 - uv_vig.yx;
    float v = uv_vig.x * uv_vig.y * 15.0;
    v = (1.0 - pow(v, 0.25)) * 0.1;
    float a = ((-v + v * (1.0 - vUv.y) * power) + v);
    return a;
}

float roundedBox(vec2 uv, vec2 size, float radius) {
    vec2 q = abs(uv - 0.5) - size * 0.5 + radius;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}

void main() {
    // Rounded corners
    float radius = 0.04;
    float d = roundedBox(vUv, vec2(1.0), radius);
    if (d > 0.0) discard;

    // Edge softness
    float edgeSmooth = 1.0 - smoothstep(-0.002, 0.002, d);

    vec4 texColor = texture2D(tMap, vUv);

    // Directional light from rotation
    vec3 light = DirLight(vec3(0.8, 0.85, 1.0));

    // Vignette
    float vig = Vignette(1.5);

    vec3 finalColor = texColor.rgb + light - vig;

    // Subtle glass edge highlight
    float edgeGlow = smoothstep(-0.02, -0.001, d) * (1.0 - smoothstep(-0.001, 0.0, d));
    finalColor += edgeGlow * 0.15;

    gl_FragColor = vec4(finalColor, edgeSmooth * opacity);
}

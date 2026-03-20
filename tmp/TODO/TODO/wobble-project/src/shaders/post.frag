uniform sampler2D tScreen;
uniform float rgb_shift;

varying vec2 vUv;

void main() {
    vec2 uv_r = vUv;

    vec2 r_disp = vec2(
        uv_r.x + sin(uv_r.x - 0.5) * rgb_shift * 1.0,
        uv_r.y + sin(uv_r.y - 0.5) * rgb_shift * 3.0
    );
    vec2 g_disp = vec2(
        uv_r.x + sin(uv_r.x - 0.5) * rgb_shift * 2.0,
        uv_r.y + sin(uv_r.y - 0.5) * rgb_shift * 2.0
    );
    vec2 b_disp = vec2(
        uv_r.x + sin(uv_r.x - 0.5) * rgb_shift * 3.0,
        uv_r.y + sin(uv_r.y - 0.5) * rgb_shift * 1.0
    );

    float _tAr = texture2D(tScreen, r_disp).r;
    float _tAg = texture2D(tScreen, g_disp).g;
    float _tAb = texture2D(tScreen, b_disp).b;

    gl_FragColor = vec4(_tAr, _tAg, _tAb, 1.0);
}

/**
 * Composite fragment shader.
 *
 * This is the final pass that renders the composited scene to screen.
 * Handles:
 *   - Scene transition between from/to textures (7 modes)
 *   - Mouse-reactive fluid distortion
 *   - Barrel distortion (intensifies during zoom, from Kenta)
 *   - Chromatic aberration / RGB shift (from Aircord)
 *   - Vignette and film grain post-processing
 */
precision highp float;

varying vec2 vUv;

uniform sampler2D uFromTexture;
uniform sampler2D uToTexture;
uniform float uTransition;
uniform int uMode;

uniform vec2 uMouse;
uniform vec2 uMouseVelocity;
uniform float uTime;
uniform float uAspect;

// Zoom-driven post-processing (from Kenta Toshikura)
uniform float uBarrelPower;      // 0 = none, 2.5 = full zoom distortion
uniform float uRGBShiftAmount;   // chromatic aberration intensity
uniform float uTwist;            // twist spring-back value

// --- Noise ---
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

float valueNoise(vec2 p) {
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
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * valueNoise(p);
    p *= 2.0;
    amp *= 0.5;
  }
  return v;
}

// --- Barrel distortion (from Kenta's screen composite shader) ---
vec2 barrelDistort(vec2 uv, float power) {
  vec2 center = vec2(0.5);
  vec2 d = uv - center;
  d.x *= uAspect;
  float dist = length(d);
  float radius = 0.4;
  float gr = pow(dist / radius, power);
  float mag = 2.0 - cos(gr - 1.0);
  vec2 result = (dist > radius) ? uv : (center + (uv - center) * mag);
  return result;
}

// --- RGB shift (from Aircord's chromatic aberration) ---
vec4 sampleWithRGBShift(sampler2D tex, vec2 uv, float amount) {
  vec2 rDisp = vec2(
    uv.x + sin(uv.x - 0.5) * amount * 1.0,
    uv.y + sin(uv.y - 0.5) * amount * 3.0
  );
  vec2 gDisp = vec2(
    uv.x + sin(uv.x - 0.5) * amount * 2.0,
    uv.y + sin(uv.y - 0.5) * amount * 2.0
  );
  vec2 bDisp = vec2(
    uv.x + sin(uv.x - 0.5) * amount * 3.0,
    uv.y + sin(uv.y - 0.5) * amount * 1.0
  );
  return vec4(
    texture2D(tex, rDisp).r,
    texture2D(tex, gDisp).g,
    texture2D(tex, bDisp).b,
    texture2D(tex, uv).a
  );
}

// --- Transitions ---
vec4 transitionFade(vec4 from, vec4 to, float t) {
  return mix(from, to, t);
}

vec4 transitionWipe(vec4 from, vec4 to, float t, vec2 uv) {
  return mix(to, from, smoothstep(t - 0.08, t + 0.08, uv.x));
}

vec4 transitionDiagonal(vec4 from, vec4 to, float t, vec2 uv) {
  return mix(to, from, step(t, (uv.x + uv.y) * 0.5));
}

vec4 transitionSmoothDiagonal(vec4 from, vec4 to, float t, vec2 uv) {
  float diag = (uv.x + uv.y) * 0.5;
  return mix(to, from, smoothstep(t - 0.15, t + 0.15, diag));
}

vec4 transitionNoiseDissolve(vec4 from, vec4 to, float t, vec2 uv, float time) {
  float n = fbm(uv * 6.0 + time * 0.3);
  return mix(to, from, smoothstep(t - 0.1, t + 0.1, n));
}

vec4 transitionRGBShift(float t, vec2 uv) {
  float intensity = sin(t * 3.14159) * 0.04;
  vec2 dir = vec2(cos(0.5), sin(0.5));
  vec4 fromS;
  fromS.r = texture2D(uFromTexture, uv + dir * intensity).r;
  fromS.g = texture2D(uFromTexture, uv).g;
  fromS.b = texture2D(uFromTexture, uv - dir * intensity).b;
  fromS.a = 1.0;
  vec4 toS;
  toS.r = texture2D(uToTexture, uv + dir * intensity).r;
  toS.g = texture2D(uToTexture, uv).g;
  toS.b = texture2D(uToTexture, uv - dir * intensity).b;
  toS.a = 1.0;
  return mix(fromS, toS, t);
}

vec4 transitionBarrelZoom(float t, vec2 uv) {
  vec2 center = vec2(0.5);
  vec2 d = uv - center;
  float power = sin(t * 3.14159) * 0.6;
  float dist = length(d * vec2(uAspect, 1.0));
  float mag = 1.0 + power * dist * dist;
  vec2 uvFrom = center + (uv - center) * mag;
  vec2 uvTo = center + (uv - center) * (2.0 - mag);
  vec4 fromS = texture2D(uFromTexture, clamp(uvFrom, 0.0, 1.0));
  vec4 toS = texture2D(uToTexture, clamp(uvTo, 0.0, 1.0));
  return mix(fromS, toS, smoothstep(0.3, 0.7, t));
}

// --- Mouse distortion ---
vec2 mouseDistort(vec2 uv, vec2 mouse, vec2 velocity) {
  vec2 d = (uv - mouse) * vec2(uAspect, 1.0);
  float dist = length(d);
  float falloff = 1.0 - smoothstep(0.0, 0.15, dist);
  return uv + velocity * falloff * 0.5;
}

void main() {
  // Apply barrel distortion (from Kenta's zoom)
  vec2 uv = barrelDistort(vUv, uBarrelPower);

  // Apply twist (subtle rotation during zoom spring-back)
  vec2 center = vec2(0.5);
  float twistAngle = uTwist * 0.03;
  vec2 d = uv - center;
  uv = center + vec2(
    d.x * cos(twistAngle) - d.y * sin(twistAngle),
    d.x * sin(twistAngle) + d.y * cos(twistAngle)
  );

  // Mouse fluid distortion
  uv = mouseDistort(uv, uMouse, uMouseVelocity);

  float t = clamp(uTransition, 0.0, 1.0);

  // Sample with RGB shift (from Aircord pattern)
  vec4 fromColor = sampleWithRGBShift(uFromTexture, uv, uRGBShiftAmount);
  vec4 toColor = sampleWithRGBShift(uToTexture, uv, uRGBShiftAmount);

  vec4 color;
  if (uMode == 0) color = transitionFade(fromColor, toColor, t);
  else if (uMode == 1) color = transitionWipe(fromColor, toColor, t, uv);
  else if (uMode == 2) color = transitionDiagonal(fromColor, toColor, t, uv);
  else if (uMode == 3) color = transitionSmoothDiagonal(fromColor, toColor, t, uv);
  else if (uMode == 4) color = transitionNoiseDissolve(fromColor, toColor, t, uv, uTime);
  else if (uMode == 5) color = transitionRGBShift(t, uv);
  else if (uMode == 6) color = transitionBarrelZoom(t, uv);
  else color = transitionFade(fromColor, toColor, t);

  // Vignette (from Aircord's sin-based pattern)
  vec2 vigUv = vUv * (1.0 - vUv.yx);
  float vig = vigUv.x * vigUv.y * 15.0;
  vig = pow(vig, 0.2);
  color.rgb *= mix(0.8, 1.0, vig);

  // Film grain (from Aircord's final pass)
  float grain = hash(vUv * 1000.0 + uTime * 100.0) * 0.025;
  color.rgb += grain - 0.0125;

  gl_FragColor = color;
}

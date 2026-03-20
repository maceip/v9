/**
 * Reflective floor vertex shader (inspired by Aircord).
 * - Receives the projective texture matrix from the mirror camera
 * - Applies 3D gradient noise displacement for water-like ripples
 * - Curves the far edge downward for a horizon falloff
 */
uniform float uTime;
uniform mat4 uTextureMatrix;
uniform float uNoiseScale;
uniform float uNoiseHeight;

varying vec4 vUvProj;   // projective UV for reflection lookup
varying vec2 vUv;
varying float vNoise;
varying float vFogDepth;

// Hash-based 3D gradient noise (from Aircord's cnoise)
vec3 hash3(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  );
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}

float gradientNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);

  float a = dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0));
  float b = dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0));
  float c = dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0));
  float d = dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0));
  float e = dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1));
  float ff = dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1));
  float g = dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1));
  float h = dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1));

  return mix(
    mix(mix(a, b, u.x), mix(c, d, u.x), u.y),
    mix(mix(e, ff, u.x), mix(g, h, u.x), u.y),
    u.z
  );
}

void main() {
  vUv = uv;

  // Projective texture coordinate for reflection sampling
  vUvProj = uTextureMatrix * vec4(position, 1.0);

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

  // Noise displacement
  vNoise = clamp(
    gradientNoise(vec3(uv * uNoiseScale, uTime)) * uNoiseHeight,
    -1.0, 1.0
  );
  mvPosition.y -= vNoise;

  // Curve the far edge down (horizon effect)
  float curve = radians(uv.y * 180.0 - 90.0);
  float curveFalloff = uv.y >= 0.5 ? (cos(curve) * 3.0 - 3.0) * 0.3 : 0.0;
  mvPosition.y += curveFalloff;

  vFogDepth = 1.0 + mvPosition.z;

  gl_Position = projectionMatrix * mvPosition;
}

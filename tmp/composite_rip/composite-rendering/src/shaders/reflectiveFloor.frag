/**
 * Reflective floor fragment shader (inspired by Aircord).
 * - Samples the reflection render target using projective texturing
 * - 5-tap vertical Gaussian blur for soft reflections
 * - Exponential fog for distance fadeout
 * - Noise subtraction for surface texture
 */
precision highp float;

uniform vec3 uColor;
uniform sampler2D uReflectionMap;
uniform float uBlurSpread;
uniform float uFogDensity;
uniform float uNoiseAlpha;
uniform float uReflectionStrength;

varying vec4 vUvProj;
varying vec2 vUv;
varying float vNoise;
varying float vFogDepth;

void main() {
  // Spatial fade: edges get more blur, center stays sharp
  float rad = radians(vUv.x * 180.0) * 0.5;
  float fade = 1.0 - pow(sin(rad) * (vUv.y - 0.2), 2.0);
  fade = clamp(pow(fade, 20.0), 0.0, 1.0);

  float blur = uBlurSpread * fade;

  // 5-tap vertical Gaussian blur on projective reflection
  vec4 refl = vec4(0.0);
  refl += texture2DProj(uReflectionMap, vec4(vUvProj.x, vUvProj.y - 4.0 * blur, vUvProj.zw)) * 0.051;
  refl += texture2DProj(uReflectionMap, vec4(vUvProj.x, vUvProj.y - 3.0 * blur, vUvProj.zw)) * 0.0918;
  refl += texture2DProj(uReflectionMap, vec4(vUvProj.x, vUvProj.y - 2.0 * blur, vUvProj.zw)) * 0.1225;
  refl += texture2DProj(uReflectionMap, vec4(vUvProj.x, vUvProj.y - 1.0 * blur, vUvProj.zw)) * 0.1531;
  refl += texture2DProj(uReflectionMap, vUvProj) * 0.1633;

  // Mix reflection with base color based on fade distance
  vec3 color = mix(refl.rgb, uColor, fade);

  // Subtract noise for surface grain
  color -= vNoise * uNoiseAlpha;

  // Exponential fog
  float fd = uFogDensity * 0.1;
  float fogFactor = exp(-(fd * fd) * vFogDepth * vFogDepth);

  float alpha = fogFactor * uReflectionStrength;
  alpha *= clamp(1.0 - vUv.y * 0.8, 0.0, 1.0); // fade at back edge

  gl_FragColor = vec4(color, alpha);
}

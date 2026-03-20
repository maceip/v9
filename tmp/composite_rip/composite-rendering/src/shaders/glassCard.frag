/**
 * Glass card fragment shader (inspired by Active Theory + Kenta Toshikura).
 *
 * Composites:
 *   - tContent: the FXScene render target (terminal screen content)
 *   - Fresnel-based edge glow
 *   - Normal-map distortion for frosted glass refraction
 *   - Mouse-reactive displacement
 *   - Rounded rectangle SDF masking
 *   - Directional light glint
 */
precision highp float;

uniform sampler2D tContent;      // FXScene render target texture
uniform vec3 uColor;             // card accent color
uniform float uHover;            // 0..1 hover intensity
uniform vec2 uMouse;             // mouse UV position
uniform float uFresnelPow;      // fresnel falloff power
uniform float uDistortStrength;  // normal-map refraction strength
uniform float uGlassAlpha;      // glass overlay opacity
uniform vec2 uResolution;       // card aspect ratio
uniform float uTime;
uniform float uRadius;          // rounded corner radius

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

// Rounded rectangle SDF
float roundedBoxSDF(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b + r;
  return length(max(d, 0.0)) - r;
}

// Simple hash noise for frosted distortion
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  // Rounded rectangle mask
  float aspect = uResolution.x / uResolution.y;
  vec2 centeredUv = vUv - 0.5;
  float sdf = roundedBoxSDF(
    centeredUv * vec2(aspect, 1.0),
    vec2(aspect, 1.0) * 0.5,
    uRadius * min(aspect, 1.0)
  );
  if (sdf > 0.0) discard;

  // Smooth edge anti-aliasing
  float edgeAlpha = 1.0 - smoothstep(-0.005, 0.0, sdf);

  // Fresnel: stronger reflection at glancing angles
  vec3 viewDir = normalize(vViewPosition);
  float fresnel = pow(1.0 - abs(dot(viewDir, normalize(vNormal))), uFresnelPow);

  // Normal-map-like distortion (procedural, no texture needed)
  vec2 distort = vec2(
    hash(vUv * 50.0 + uTime * 0.1) - 0.5,
    hash(vUv * 50.0 + uTime * 0.1 + 100.0) - 0.5
  ) * uDistortStrength * 0.01;

  // Mouse-reactive displacement
  vec2 toMouse = vUv - uMouse;
  toMouse.x *= aspect;
  float mouseDist = length(toMouse);
  float mouseInfluence = pow(0.15 / max(mouseDist, 0.01), 1.5) * uHover;
  mouseInfluence = min(mouseInfluence, 1.0);
  vec2 mouseDistort = toMouse * mouseInfluence * 0.02;

  // Sample content with distortion
  vec2 contentUv = vUv + distort + mouseDistort;
  contentUv = clamp(contentUv, 0.001, 0.999);
  vec4 content = texture2D(tContent, contentUv);

  // Glass overlay: tinted, with fresnel edge glow
  vec3 glassColor = uColor * fresnel * uGlassAlpha;

  // Directional light glint (subtle specular highlight)
  float glint = pow(max(dot(reflect(-viewDir, vNormal), normalize(vec3(1, 2, 3))), 0.0), 16.0);

  // Compose
  vec3 color = content.rgb + glassColor + vec3(glint * 0.15);

  // Hover brightening
  color += uColor * uHover * 0.08;

  // Edge highlight (border glow)
  float border = smoothstep(-0.015, -0.005, sdf);
  color += uColor * border * 0.3 * (0.5 + 0.5 * fresnel);

  gl_FragColor = vec4(color, edgeAlpha);
}

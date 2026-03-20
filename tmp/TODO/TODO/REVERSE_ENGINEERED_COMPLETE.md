# Complete Reverse Engineering Results

## MOUSE (sloshseltzer.com) — THE EFFECT IS A NAVIER-STOKES FLUID SIMULATION

The text reveal is NOT canvas compositing with per-letter fill accumulation. It is:

1. **WebGL MSDF text** (not DOM, not canvas) using GLText with a custom `AnimatedText` shader
2. **A full Navier-Stokes fluid simulation** (128x128 velocity, 512x512 density) creates the white blob
3. The fluid density texture is sampled as `tFluidMask` in the text shader
4. When `fluidMask.g >= 0.99`, the shader switches from `strokemsdf()` (outline) to `msdf()` (solid fill)
5. The fluid density DECAYS at 0.97 dissipation per frame — the fill fades back to outline over ~0.3-2 seconds depending on accumulated density
6. The "distressed texture" comes from bubble particles subtracted from the fill alpha, NOT a canvas noise pattern

### Key values:
- Font: steelfish-eb, fontSize: 200, color: #00A165
- Stroke: strokemsdf with stroke=0.12, padding=0.14
- Fluid sim: 128x128 velocity, 512x512 density
- Density dissipation: 0.97
- Velocity dissipation: 0.98
- Splat radius at max velocity: ~48px (size * 0.8, where size = range(velocity, 0, 5, 0, 60))
- Blob follow ease: 0.05
- Splat shape: capsule (line segment between consecutive mouse positions, cubicOut falloff)
- Reveal threshold: fluidMask.g >= 0.99 (requires density >= ~1.65 in HALF_FLOAT FBO)

---

## WOBBLE (kentatoshikura.com) — KEY FINDINGS

### Cards are FLAT PLANES, not curved geometry
The card is a `PlaneBufferGeometry(1, 1, 1, 1)` — a single flat quad. The "curved glass" look is entirely from a fragment shader with rounded-rectangle SDF clipping and glass distortion uniforms.

### Card positioning uses atan2, NOT cos/sin arc
```js
r = i * padding.width - scroll.x  // linear position
a = Math.atan2(radius, r)         // angle from vertical
s = a - PI/2                      // rotation
z = -sin(r / (WW/2)) * padding * tan(rotation)  // depth
x = r + abs(z) * sign * 0.32     // adjusted x
```

### The arc curves AWAY from the camera (concave toward viewer)
Center of cylinder is at negative Z. Cards at edges push into -Z. This is confirmed by the formula.

### Camera: FOV 30, position computed from window height
```
far = -height/2 / tan(15° in radians)
camera.position.z = -far  (≈ 1474 for 790px window)
```

### No Three.js lights — all lighting is in shaders
DirLight is computed in the fragment shader based on card rotation angle. No AmbientLight, no SpotLight in the scene.

### Floor: CircleBufferGeometry Reflector, tilted 80° back
- Y position: -0.37 * windowHeight * 0.9 (varies by project)
- Texture: displacement-based watery distortion
- Alpha: 1.0 (yokoScroll), 0.5 (tateScroll)

### Scroll values (confirmed):
- ease: 0.175 (Windows: 0.0875, touch: 0.1)
- wheelRatio: 80 (Windows: 120)
- snapTimeout: 100ms
- snapDuration: 1s via gsap.to

---

## AIRCORD (aircord.co.jp) — KEY FINDINGS

### Panel curvature is done in VERTEX SHADER, not CPU geometry deformation
```glsl
float tx = radius * sin(angle) * curvePower;
float tz = -radius * (1.0 - cos(angle)) * curvePower;
// Then rotated around Y axis by panel's rotation angle
vec3 center = vec3(0, ty, -radius);
```

### Arc parameters:
- degWrap: 60° per panel slot
- degInner: 58° visible (60 - 2 padding)
- Panel aspect: screen.w=3, screen.h=1 (3:1 landscape)
- Radius: min(WW*0.005, WH*0.01)
- Curve direction: Concave toward camera (center at -radius on Z)
- Auto-scroll speed: 0.1°/frame

### Camera:
- FOV: 30 (desktop), 45 (tablet), 60 (mobile)
- RESCALE factor: 0.01 (world units = pixels * 0.01)
- Mouse influence: ±10° X, ±2.5° Y
- lookPower: -0.05

### Lighting: SpotLights only, no ambient
- Sun: intensity 4-5, position (0, 1*r, 0.5*r), angle 60°, penumbra 1
- Volumetric cones: alpha 0.4, wave 4.5, attenuation 11-15

### Floor: Two Reflector planes
- Main: PlaneGeometry(1,1,128,128), scale 3*width, blur 0.025, alpha 1
- Scene: PlaneGeometry(1,1,32,32), scale 5*width, alpha 0.8
- Y position: -origin.height * scale * 0.5 - padding

### Background: rgb(20, 30, 40) — NOT pure black

# Reverse Engineered Values from Minified Source

## WOBBLE Project (kentatoshikura.com)

### RGB Shift Shader (line ~21279)
```glsl
// Vertex shader (line ~21271)
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
}

// Fragment shader (line ~21279)
#define GLSLIFY 1
varying vec2 vUv;

uniform sampler2D tScreen;
uniform sampler2D tBackground;
uniform float rgb_shift;
uniform vec2 resolution;
uniform vec2 r_pivot;
uniform float r_radius;
uniform float r_power;
uniform float bg_alpha;
uniform float sc_alpha;
uniform float scrollY;

vec4 Mix(vec4 tFront, vec4 tBack){
  vec3 rgb = vec3(min(tFront.rgb * tFront.a + tBack.rgb * tBack.a * (1.0 - tFront.a), 1.0));
  float a = min(tFront.a + tBack.a, 1.0);
  vec4 rgba = vec4(rgb, a);
  return rgba;
}

void main() {
  vec2 p = gl_FragCoord.xy/resolution.xy;
  vec2 d = vUv - r_pivot;
  float aspect = resolution.x / resolution.y;

  vec2 rVec = (vUv - r_pivot) * vec2(max(1.0,aspect), max(1.0,1.0/aspect));
  float rDist = length(rVec);
  float gr = pow(rDist / r_radius, r_power);
  float mag = 2.0 - cos(gr - 1.0);
  vec2 uv_r = (rDist > r_radius) ? vUv : (r_pivot + d * mag);

  vec2 r_disp = vec2(uv_r.x + sin(uv_r.x - 0.5) * rgb_shift * 1., uv_r.y + sin(uv_r.y - 0.5) * rgb_shift * 3.);
  vec2 g_disp = vec2(uv_r.x + sin(uv_r.x - 0.5) * rgb_shift * 2., uv_r.y + sin(uv_r.y - 0.5) * rgb_shift * 2.);
  vec2 b_disp = vec2(uv_r.x + sin(uv_r.x - 0.5) * rgb_shift * 3., uv_r.y + sin(uv_r.y - 0.5) * rgb_shift * 1.);
  vec4 _tA = texture2D(tScreen, uv_r);
  float _tAr = texture2D(tScreen, r_disp).r;
  float _tAg = texture2D(tScreen, g_disp).g;
  float _tAb = texture2D(tScreen, b_disp).b;
  float a = uv_r.y > scrollY ? 1.0 : 0.0;
  vec4 tA = vec4(_tAr, _tAg, _tAb, _tA.a * sc_alpha * a);

  vec4 _tB = texture2D(tBackground, vUv);
  vec4 tB = vec4(_tB.rgb, _tB.a * bg_alpha);

  vec4 _tAB = Mix(tA, tB);
  gl_FragColor = _tAB;
}
```

### SlideScroll Mechanics (line ~31227)
```javascript
window.slideScroll = {
  mode: "yokoScroll", // or "tateScroll"
  timer: {
    before: { func: null, wait: 30, tween: null },
    complete: { func: null, wait: 100, tween: null }, // 100ms scroll stop timeout
  },
  plane: { width: 0, length: 5 },
  scroll: {
    offset: { x: 0, y: 0 },
    delta: 0,        // target position (GSAP tweens this)
    progress: 0,
    x: 0,            // current position (lerps toward delta)
    y: 0,
    ease: 0.175,     // lerp ease (0.0875 on Windows, 0.1 on touch)
    ratio: 80,       // wheel multiplier (120 on Windows)
  },
  drag: { ratio: 2, start: { delta: 0 } },
  speed: {
    delta: 0,
    dist: 0,
    arr: [],
    pow: { delta: 0, ease: 0.025, max: 80, ratio: 1 },
  },
  index: 2, // initial slide index

  // onComplete - snap to nearest slide
  onComplete: function() {
    this.delta = Math.round(this.scroll.delta / this.dist);
    this.index = (Math.abs(this.delta) + (DB.length - 1) / 2) % this.len;
    if (this.delta < 0) {
      this.index = this.len - 1 - ((Math.abs(this.delta) + (DB.length - 1) / 2) % this.len);
    }
    this.timer.complete.tween = gsap.to(this.scroll, {
      duration: 1,
      delta: this.delta * this.dist,
    });
  },

  // onUpdate - the wobble mechanism
  onUpdate: function() {
    this.scroll.x += (this.scroll.delta - this.scroll.x) * this.scroll.ease;
    // scroll.arc and scroll.progress for visual effects
    this.scroll.arc = this.scroll.x / __BACK__.models.mesh.total.dist;
    this.scroll.progress = (this.scroll.x % __BACK__.models.mesh.total.dist) / __BACK__.models.mesh.total.dist;
  }
};
```

### Model/Card Scale Values (line ~30249)
```javascript
// Desktop default
models.scale.screen.x = 0.58;
models.scale.screen.y = 0.58;
models.scale.model = 0.6;
models.mesh.padding.x = 0.4;
models.mesh.padding.y = 0.4;

// Desktop large
models.scale.model = 0.65;
models.mesh.padding.x = 0.45;
models.mesh.padding.y = 0.45;
models.mesh.planeRadius = 0.25;

// Mobile
models.scale.model = 0.45;
models.mesh.padding.x = 0.22;
models.mesh.padding.y = 0.22;
models.mesh.planeRadius = 0.5;
```

### Mesh Positioning (line ~29991-30006)
```javascript
// Padding width = mesh scale + padding factor * windowWidth * 0.5
this.mesh.padding.width = e.mesh.scale.x + this.mesh.padding.x * __WW__ * 0.5;
this.mesh.total.width = this.meshes.length * this.mesh.padding.width;
this.mesh.total.dist = this.mesh.total.width; // for horizontal scroll
```

### Floor Position (line ~28015-28038)
```javascript
// Floor Y position varies by route
switch(this.name) {
  case "drift":
    this.floor.position.y = 0.3 * -windowHeight * 0.9;
    break;
  case "garden-eight":
    this.floor.position.y = 0.4 * -windowHeight * 0.9;
    break;
  default:
    this.floor.position.y = 0.37 * -windowHeight * 0.9;
}
// Standard values
this.floor.position.y = 0.3 * -windowHeight; // or 0.4 or 0.37
```

### Camera Position (line ~27391, ~27936)
```javascript
this.camera.position.set(0, 0, this.far);
// or
this.camera.position.z = -this.far;
// far is calculated based on scene depth
```

### Model Arc Positioning (line ~30137-30140)
```javascript
// Horizontal curve calculation
let curve = Math.sin(r / (windowWidth / 2)) * this.mesh.padding.width * Math.tan(mesh.stage.rotation.y);
```

---

## MOUSE Project (sloshseltzer.com)

### Mouse Fluid Drawing (line ~48083-48104)
```javascript
let _scale = 1;
let _last = new Vector2();
let _mouse = new Vector2();

function loop() {
  // Lerp scale with ease 0.05
  _scale += (this.scale - _scale) * Math.framerateNormalizeLerpAlpha(0.05);

  // Get mouse position
  _mouse.copy(Mouse);

  // Distance moved
  let len = _mouse.distanceTo(_last);

  // Size based on velocity: maps 0-5px movement to 0-60 size
  let size = this.scaleBasedOnVelocity
    ? Math.range(len, 0, 5, 0, 60, true)
    : 25;
  size *= 0.8; // final scale factor

  // Delta factor: maps 0-15px movement to 0-10 delta
  let delta = Math.range(len, 0, 15, 0, 10, true);

  // Draw if moved more than 0.01
  if (len > 0.01) {
    _fluid.drawInput(
      _mouse.x,
      _mouse.y,
      (_mouse.x - _last.x) * delta,
      (_mouse.y - _last.y) * delta,
      _white,  // color #ffffff
      size * _scale
    );
  }
  _last.copy(_mouse);
}
```

### Mouse Travel Threshold (line ~69545)
```javascript
let _mouseTravel = 0;

// In render loop:
if (Device.mobile) {
  _mouseTravel += Mouse.delta.length();
  if (_mouseTravel < 80) return; // 80px threshold
  _mouseTravel = 0; // reset after trigger
}
```

### SplitText Class (line ~56293)
```javascript
Class(function SplitText(
  _element,
  _options = {
    lineThreshold: 0.2,
    type: "lines", // "lines", "words", "chars"
    asHydraObject: true,
    noAriaLabel: false,
    noBalance: false,
    balanceRatio: 1,
    minLines: 1,
  }
) {
  this.isSplit = false;
  this.options = {};
  this.chars = [];
  this.words = [];
  this.lines = [];
  this.originals = [];

  // Usage for per-character animation:
  // splitInstance.chars.forEach((char, i) => {
  //   char.tween({ y: "0%", opacity: 1 }, 600, "easeOutCubic", 120 + 20 * i);
  // });
});
```

---

## Implementation Checklist

### Wobble Exact Values to Use:
- [ ] `scroll.ease: 0.175` (0.0875 Windows, 0.1 touch)
- [ ] `scroll.ratio: 80` (120 Windows)
- [ ] `speed.pow.ease: 0.025`
- [ ] `speed.pow.max: 0.1 * windowHeight`
- [ ] `timer.complete.wait: 100`
- [ ] Snap duration: 1s
- [ ] `models.scale.model: 0.6`
- [ ] `models.mesh.padding.x: 0.4`
- [ ] `models.mesh.planeRadius: 0.25`
- [ ] Floor Y: `-0.37 * windowHeight`
- [ ] Camera Z: `-far` (far calculated from scene depth)

### Mouse Exact Values to Use:
- [ ] Blob lerp ease: 0.05
- [ ] Velocity mapping: distance 0-5 → size 0-60
- [ ] Size multiplier: 0.8
- [ ] Delta mapping: distance 0-15 → delta 0-10
- [ ] Mouse travel threshold: 80px
- [ ] Blob color: #ffffff (white)

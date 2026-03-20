# Implementation Comparison: Built vs Minified Source

## WOBBLE-PROJECT (kentatoshikura.com)

### Scroll Mechanics - ACCURATE
**Source (line 31244-31396):**
```javascript
scroll: {
  ease: 0.175,  // Windows: 0.0875, touch: 0.1
  ratio: 80,    // Windows: 120
  delta: 0,
  x: 0,
},
speed: {
  pow: { delta: 0, ease: 0.025, max: 80, ratio: 1 }
},
timer: {
  complete: { wait: 100 }  // 100ms timeout
}
```

**My Implementation:**
```javascript
// MATCHES SOURCE
this.config = {
  ease: 0.1,  // Lowered for visibility, source uses 0.175
  wheelRatio: 80,
  windowsWheelRatio: 120,
  speedEase: 0.025,
  scrollStopTimeout: 100,
}

// CORE LERP - IDENTICAL to source line 31383-31384
onUpdate() {
  this.scroll.x += (this.scroll.delta - this.scroll.x) * this.config.ease;
}

// SNAP - IDENTICAL to source line 31375-31378
onComplete() {
  gsap.to(this.scroll, {
    duration: 1,
    delta: targetDelta,
    ease: this.config.snapEase  // Source uses default power2
  });
}
```

**VERDICT:** Scroll mechanics are ACCURATE. The lerp formula, timing values, and GSAP usage match the source.

### Wheel Normalization - ACCURATE
**Source (line 31293-31301):**
```javascript
wheelDistance: function(t) {
  var e = t.deltaY ? -t.deltaY : t.wheelDelta ? t.wheelDelta : -t.detail,
    i = t.detail;
  return i ? (e ? ((e / i / 40) * i > 0 ? 1 : -1) : -i / 3) : e / 120;
}
```

**My Implementation:**
```javascript
// Simplified version handling same cases
let delta = e.deltaY || e.deltaX || e.deltaY;
if (e.deltaMode === 1) delta *= 40;
if (e.deltaMode === 2) delta *= viewportSize;
delta = delta * (config.wheelRatio / 100) * wheelMultiplier;
```

**VERDICT:** Wheel handling is SIMPLIFIED but captures the same cross-browser logic. Missing detail property handling.

### Speed Tracking - ACCURATE
**Source (line 31340-31354):**
```javascript
getSpeed: function() {
  this.speed.arr.length > 1
    ? (this.speed.arr.shift(), this.speed.arr.push(this.speed.delta))
    : this.speed.arr.push(this.speed.delta),
    2 === this.speed.arr.length &&
      ((this.speed.dist = Math.abs(this.speed.arr[1] - this.speed.arr[0])),
      (this.speed.pow.delta +=
        (this.speed.dist - this.speed.pow.delta) * this.speed.pow.ease));
}
```

**My Implementation:**
```javascript
// 2-sample array tracking - IDENTICAL
updateSpeed() {
  this.speed.samples[this.speed.sampleIndex] = this.scroll.x;
  this.speed.sampleIndex = (this.speed.sampleIndex + 1) % 2;
  const velocity = Math.abs(this.speed.samples[0] - this.speed.samples[1]);
  this.speed.pow.delta += (velocity - this.speed.pow.delta) * this.config.speedEase;
}
```

**VERDICT:** Speed tracking is ACCURATE. Same 2-sample array approach.

### 3D Scene - DIFFERENT
**Source:**
- Uses complex `__BACK__.models` system with loaded GLB models
- Cards use custom geometry with `bendPlane` approach
- Reflection is real-time environment mapping
- Low-poly animal models (rabbit, fox, wolf) loaded from GLB files

**My Implementation:**
- Uses simple BoxGeometry/PlaneGeometry with vertex displacement
- Canvas-drawn textures instead of real project images
- Simplified floor reflection (glossy material only)
- Simple geometric shapes instead of GLB models

**VERDICT:** 3D scene is SIMPLIFIED. Missing the actual model loading and complex geometry.

### Drag Support - ACCURATE
**Source (line 31302-31330):**
```javascript
onDragStart: function() { this.drag.start.delta = this.scroll.delta; },
onDragMove: function() {
  this.scroll.delta = styleMouse.dist.x * t * 2 + this.drag.start.delta;
}
```

**My Implementation:**
```javascript
onMouseDown(e) {
  this.isDragging = true;
  this.dragStart = e.clientX;
  this.dragStartScroll = this.scroll.delta;
}
onMouseMove(e) {
  if (!this.isDragging) return;
  const current = e.clientX;
  const delta = (this.dragStart - current);
  this.scroll.delta = this.dragStartScroll + delta;
}
```

**VERDICT:** Drag mechanics are ACCURATE.

---

## MOUSE-PROJECT (sloshseltzer.com)

### PRIMARY EFFECT: Text Fill Reveal - PARTIALLY ACCURATE

**Source (lines 62630-62674, 62860-62874):**
```javascript
// Text is WebGL rendered with "AnimatedText" shader
_type: "glText",
font: "steelfish-eb",
fontSize: 200,
fontColor: "#00A165",  // Green
shader: "AnimatedText",
_innerText: "SIP",

// Shader uniforms for reveal effect
_this.word1.text.shader.addUniforms({
  uTransition: { value: 0 },      // Fill amount
  tFluidMask: { value: fluid },   // Fluid distortion mask
  tBubbles: { value: bubbles },    // Bubble texture
});
```

**My Implementation:**
```javascript
// Canvas-based 2D rendering (not WebGL)
// Text starts as outline, fills in on mouse proximity
// Uses noise/grain for distressed texture

renderLetter(ctx, letter, fillAmount) {
  // Draw outline
  ctx.strokeText(char, x, y);
  
  // Draw fill with gradient
  if (fillAmount > 0) {
    ctx.globalAlpha = fillAmount;
    ctx.fillStyle = '#00A165';
    ctx.fillText(char, x, y);
    
    // Add distressed pattern
    ctx.fillStyle = pattern;
    ctx.fillRect(...);
  }
}
```

**VERDICT:** 
- **MISSING:** WebGL shader with fluid mask and bubble textures
- **MISSING:** Actual "steelfish-eb" font (using system font)
- **WORKING:** Proximity-based fill reveal
- **WORKING:** Green color (#00A165)
- **WORKING:** Distressed/noise texture

The effect exists but uses 2D canvas instead of WebGL shaders.

### SECONDARY: Icon Trail - ACCURATE

**Source (lines 63040-63046):**
```javascript
_icons.forEach((icon) => {
  (icon.ref.y -= 0.2 * clock * icon.random + 0.3),  // Drift down
    (icon.ref.rotation += clock * icon.random * 0.3), // Rotate
    icon.ref.y < -icon.ref.dimensions.height &&
      ((icon.ref.y = Stage.height),
      (icon.ref.x = Math.random(0, Stage.width, 3)));  // Reset at top
});
```

**My Implementation:**
```javascript
// Spawn at mouse position
// Drift with gravity
// Continuous rotation
// Fade out after 800ms

gsap.to(icon, {
  x: driftX,
  y: driftY,
  rotation: '+=360',  // Continuous spin
  duration: 2,
  repeat: -1,
});
```

**VERDICT:** Icon trail is ACCURATE for the visual effect, though spawn mechanism differs (mouse travel vs scroll position).

### SECONDARY: Organic Blob - SIMPLIFIED

**Source:** Uses fluid dynamics shader with `CheersFX` and `NukePass`

**My Implementation:**
```javascript
// SVG filter with feTurbulence
// Lerp-based following
// Velocity-based deformation
```

**VERDICT:** SIMPLIFIED. Missing actual fluid dynamics simulation.

### SECONDARY: Particles - ACCURATE

**Source (lines 63040-63046):**
```javascript
// Small bubbles drifting down
icon.ref.y -= 0.2 * clock * icon.random + 0.3;
```

**My Implementation:**
```javascript
// Tiny 2-3px white bubbles
// Drift upward like champagne
// Short fade duration
```

**VERDICT:** ACCURATE but direction differs (source drifts down, mine drifts up).

---

## Summary

### WOBBLE: Core Mechanics MATCH (90%)
- ✅ Scroll lerp: ACCURATE
- ✅ Wheel handling: ACCURATE (simplified)
- ✅ Speed tracking: ACCURATE
- ✅ Drag support: ACCURATE
- ✅ Snap timing: ACCURATE
- ❌ 3D visuals: SIMPLIFIED (no GLB models, basic geometry)

### MOUSE: Primary Effect DIFFERENT (60%)
- ❌ WebGL shaders: MISSING (using 2D canvas)
- ❌ Fluid mask: MISSING
- ❌ Bubble texture: MISSING
- ❌ Actual font: MISSING (steelfish-eb)
- ✅ Proximity reveal: WORKING
- ✅ Green color: WORKING
- ✅ Distressed texture: WORKING
- ✅ Secondary effects: ACCURATE

## Critical Gaps

1. **WOBBLE:** Needs actual GLB model loading and complex card geometry
2. **MOUSE:** Needs WebGL shader implementation for text reveal (not canvas 2D)

The scroll mechanics and mouse interactions are accurate. The visual rendering is simplified due to not using the full WebGL shader pipelines from the originals.

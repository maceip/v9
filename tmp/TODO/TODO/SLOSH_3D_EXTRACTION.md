# Slosh Seltzer - 3D Code Extraction

## Key Classes Extracted from app.1715958947476.js

### 1. SceneLayout (Line ~52174) - Scene Management System

**Purpose**: Asset loading, layer management, 3D scene composition

```javascript
function SceneLayout(_name, _options = {}) {
  Inherit(this, Object3D);
  
  // Core storage
  var _meshes = {},
      _exists = {},
      _layers = {},
      _groups = {},
      _initializers = [],
      _promises = [];
  
  // Key Methods:
  
  // Get a layer by name (async)
  this.getLayer = async function(name) {
    await _this.wait(_layers, name);
    return _layers[name];
  };
  
  // Create a new layer
  this._createLayer = function(parentId, returnName = false) {
    return createLayer(null, parentId, returnName);
  };
  
  // Check if layer exists
  this.exists = function(name) {
    return _exists[name];
  };
}
```

**Usage Pattern**:
```javascript
// Load fluid layer
let layout = _this.initClass(SceneLayout, "mousefluid");
let fluid = await layout.getLayer("fluid");
```

---

### 2. Fluid (Line ~38939) - Navier-Stokes Fluid Simulation

**Purpose**: WebGL-based fluid dynamics for mouse trail effect

**Configuration**:
```javascript
const config = {
  DENSITY_DISSIPATION: 0.97,      // Dye fade rate
  VELOCITY_DISSIPATION: 0.98,     // Velocity fade
  PRESSURE_DISSIPATION: 0.8,      // Pressure fade
  PRESSURE_ITERATIONS: 20,         // Solver iterations
  CURL: 30,                        // Vorticity/confinement
  SPLAT_RADIUS: 0.25,            // Input brush size
};

const SIM_SIZE = 128;   // Velocity simulation resolution
const DYE_SIZE = 512;   // Dye/color resolution
```

**Shader Pipeline** (in order):
1. **curlShader** - Calculate vorticity
2. **vorticityShader** - Apply vorticity confinement
3. **divergenceShader** - Calculate divergence
4. **clearShader** - Clear pressure
5. **pressureShader** - Solve pressure (20 iterations)
6. **gradientSubtractShader** - Subtract pressure gradient
7. **advectionShader** - Advect velocity
8. **displayShader** - Render to screen

**Input Method**:
```javascript
this.drawInput = function(x, y, dx, dy, color, size) {
  // x, y: mouse position
  // dx, dy: delta/movement
  // color: Color object (usually white #ffffff)
  // size: brush radius
};
```

**Simulation Loop**:
```javascript
function loop() {
  1. Update curl from velocity
  2. Apply vorticity (adds swirl)
  3. Calculate divergence
  4. Solve pressure (20 iterations)
  5. Subtract gradient
  6. Advect velocity
  7. Advect dye
  8. Render display
}
```

---

### 3. MouseFluid (Line ~48076) - Mouse Interaction Layer

**Purpose**: Bridge between mouse input and fluid simulation

**Parameters**:
```javascript
{
  scaleBasedOnVelocity: true,  // Size based on movement speed
  scale: 1,                     // Base scale multiplier
}
```

**Input Mapping** (Lines ~48089-48094):
```javascript
// Distance moved
let len = _mouse.distanceTo(_last);

// Size calculation: velocity 0-5px → size 0-60
let size = scaleBasedOnVelocity
  ? Math.range(len, 0, 5, 0, 60, true)
  : 25;
size *= 0.8;  // Final multiplier

// Delta calculation: distance 0-15px → delta 0-10
let delta = Math.range(len, 0, 15, 0, 10, true);

// Draw to fluid
_fluid.drawInput(
  _mouse.x, _mouse.y,
  (_mouse.x - _last.x) * delta,
  (_mouse.y - _last.y) * delta,
  _white,  // Color #ffffff
  size * _scale
);
```

**Lerp Smoothing**:
```javascript
_scale += (this.scale - _scale) * Math.framerateNormalizeLerpAlpha(0.05);
```

---

### 4. FluidScene (Line ~39336) - Shader Pass Container

**Purpose**: Wrapper for individual fluid simulation passes

```javascript
Class(function FluidScene(_vs, _fs, _uniforms) {
  Inherit(this, Component);
  const _scene = new Scene();
  
  _uniforms.depthWrite = false;
  
  // Renders shader to FBO
  this.render = function(targetFBO) {
    // Bind uniforms, render quad
  };
});
```

---

### 5. FluidFBO (Line ~39208) - Double Buffer FBO

**Purpose**: Ping-pong rendering for simulation passes

```javascript
Class(function FluidFBO(_width, _height, _filter) {
  Inherit(this, Component);
  
  var _fbo1, _fbo2;  // Read/write pair
  
  this.read = _fbo1;
  this.write = _fbo2;
  
  this.swap = function() {
    let temp = _fbo1;
    _fbo1 = _fbo2;
    _fbo2 = temp;
    this.read = _fbo1;
    this.write = _fbo2;
  };
});
```

---

## Shader System Architecture

### GLSL Shader Structure (from patterns found):

**Vertex Shader Template**:
```glsl
#define GLSLIFY 1
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

**Fragment Shader Template**:
```glsl
#define GLSLIFY 1
precision highp float;

uniform sampler2D tDiffuse;  // Input texture
uniform vec2 resolution;   // Screen resolution
varying vec2 vUv;

void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  gl_FragColor = color;
}
```

### Shader Names Found:
- `curlShader` - Vorticity calculation
- `vorticityShader` - Vorticity confinement
- `divergenceShader` - Divergence calculation  
- `clearShader` - Buffer clearing
- `pressureShader` - Pressure solver
- `gradientSubtractShader` - Pressure gradient subtraction
- `advectionShader` - Velocity/dye advection
- `displayShader` - Final composition
- `SceneLayout` - Default material shader
- `antimatter.glsl` - Particle system
- `instance.vs` - Instanced mesh

---

## 3D Rendering Pipeline

### Initialization Flow:
1. **SceneLayout** created with name (e.g., "mousefluid")
2. **Fluid** created with simSize=128, dyeSize=512
3. **FluidFBOs** created for velocity, pressure, dye
4. **FluidScenes** created for each shader pass
5. **MouseFluid** connects mouse to fluid.drawInput

### Per-Frame Flow:
1. **MouseFluid.loop** calculates delta/size
2. **_fluid.drawInput** splats mouse movement
3. **_fluid.loop** runs Navier-Stokes steps
4. **displayShader** renders fluid to screen

---

## Key Math Constants

### Fluid Simulation:
- Sim resolution: 128x128 (velocity)
- Dye resolution: 512x512 (color)
- Splat radius: 0.25
- Pressure iterations: 20
- Curl strength: 30
- Velocity dissipation: 0.98
- Density dissipation: 0.97

### Mouse Input:
- Lerp alpha: 0.05
- Movement threshold: 0.01 (len > 0.01)
- Size range: 0-60 based on 0-5px movement
- Size multiplier: 0.8
- Delta range: 0-10 based on 0-15px movement

---

## File Locations in Minified Source

```
app.1715958947476.js (75,643 lines)
├── Line ~38939: Fluid class (Navier-Stokes)
├── Line ~39208: FluidFBO class
├── Line ~39240: FluidLayer class  
├── Line ~39336: FluidScene class
├── Line ~48076: MouseFluid class
├── Line ~52174: SceneLayout class
├── Line ~53223: getLayer method
├── Line ~53256: _createLayer method
└── Scattered: GLSL shader strings (lines ~17653, ~19247, ~25110, etc.)
```

---

## Extracted Assets Required

### Fonts:
- `assets/fonts/steelfish-eb.woff2`
- `assets/fonts/FKGroteskMono-Regular.woff2`
- `assets/fonts/FKGroteskMono-Medium.woff2`

### Shader Includes:
- `assets/images/_scenelayout/uv.jpg` (default UV tile)
- `shaders/antimatter.glsl` (particle shader)
- `shaders/instance.vs` (instancing shader)

### Scene Data:
- `assets/data/uil.{CACHE}.json` (SceneLayout data)

---

## Implementation Notes

**What This Enables**:
1. Full Navier-Stokes fluid simulation
2. Mouse-driven dye injection
3. Vorticity confinement (swirl effects)
4. Pressure projection (incompressibility)
5. Double-buffered FBO ping-pong

**What Would Need WebGL/Three.js**:
1. FBO (FramebufferObject) creation
2. Shader compilation/loading
3. Quad rendering for full-screen passes
4. Uniform binding
5. Texture creation/management

**Modern Equivalent**:
This is essentially a custom WebGL engine. In modern React/Three.js, you would use:
- `@react-three/fiber` for scene management
- `@react-three/drei` for effects
- Custom shader materials for fluid passes
- `useFrame` for simulation loop

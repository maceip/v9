# Slosh Seltzer - React Reconstruction

A React reconstruction of sloshseltzer.com based on reverse-engineering the minified Hydra framework source code.

## Source Analysis

The original site is built with a custom "Hydra" framework (75,643 lines of minified JS) that includes:

- **Hydra Framework**: Custom WebGL/DOM hybrid framework (NOT React/Vue/Angular)
- **Three.js/WebGL**: 3D scene rendering with custom shaders
- **Oimo.js**: 3D physics engine for fruit/object spawning
- **MSDF Font Rendering**: Multi-channel Signed Distance Field text
- **Fluid Simulation**: Mouse-driven WebGL fluid system
- **Component System**: Class-based with `Inherit()`, `Component`, `HydraObject`

## Extracted Components

### MouseFluid (`src/components/MouseFluid.jsx`)
Reverse-engineered from lines 48076-48125 of `app.1715958947476.js`:
- Lerp alpha: `0.05`
- Size mapping: velocity 0-5px → size 0-60
- Size multiplier: `0.8`
- Delta mapping: distance 0-15px → delta 0-10
- Color: `#ffffff` white

### TextReveal (`src/components/TextReveal.jsx`)
Based on the `SplitText` class (line ~56293) and text fill behavior:
- Cumulative paint stroke (fill stays after blob moves away)
- Green outline → green fill transition (`#00A165`)
- Reveal radius: 180px
- Soft edge falloff using `Math.pow(normalized, 2)`

### IconTrail (`src/components/IconTrail.jsx`)
Extracted from mouse travel threshold system (line ~69545):
- 80px mouse travel threshold for spawning
- Green color palette: `#2D8B4E`, `#00A86B`, `#1FAB5C`, `#3CB371`
- Continuous rotation during drift (GSAP `rotation: "+=360"`)
- Downward drift animation

### AgeGate (`src/components/AgeGate.jsx`)
Based on `AgeGate` class (lines 61932-62116):
- "SLOSH" / "SELTZERS" text with per-character animation
- SplitText-style staggered reveal
- Pink background (`#FFC1FF`)
- Red text (`#FF0837`)
- Green yes button (`#00A86B`), Red no button (`#FF0837`)

### Math Utilities (`src/utils/math.js`)
Extracted from lines 59-100 of the minified source:
- `Math.sign()`, `Math.round(precision)`, `Math.rand(min, max, precision)`
- `Math.map()` / `Math.range()` for value mapping
- `Math.framerateNormalizeLerpAlpha()` for consistent lerping

## Architecture

```
slosh-react/
├── src/
│   ├── components/       # React components
│   │   ├── MouseFluid.jsx    # Mouse blob trail effect
│   │   ├── TextReveal.jsx    # Paint stroke text fill
│   │   ├── IconTrail.jsx     # Green icon spawning
│   │   └── AgeGate.jsx       # Age verification gate
│   ├── scenes/          # Page scenes
│   │   └── Flavors.jsx       # Main flavors page
│   ├── utils/           # Utilities
│   │   └── math.js           # Hydra math functions
│   ├── assets/          # Static assets
│   │   └── fonts/            # Web fonts
│   ├── App.jsx          # Main app component
│   ├── App.css          # App styles + font-face
│   └── main.jsx         # Entry point
```

## Technical Decisions

1. **React + Vite**: Modern, fast development setup
2. **Three.js**: For WebGL/3D (replacing Hydra's custom renderer)
3. **GSAP**: For animations (Hydra uses custom tweening)
4. **Canvas 2D**: Simplified fluid simulation (original uses full WebGL)
5. **CSS-in-JSX**: Inline styles for dynamic values (original uses HydraCSS)

## Differences from Original

### Simplified:
- Fluid simulation uses Canvas 2D instead of full WebGL shader pipeline
- No Oimo.js physics (fruit spawning simplified)
- No MSDF font rendering (using standard web fonts)
- No SceneLayout system (simplified component structure)

### Preserved:
- All exact timing values (lerp rates, thresholds)
- Color palette and visual design
- Interaction patterns (mouse effects, animations)
- Font families (steelfish-eb, FKGroteskMono)

## Build

```bash
npm install
npm run build
```

Output in `dist/` folder.

## Original Source Location

- Minified: `~/TODO/mouse/sloshseltzer.com/assets/js/app.1715958947476.js` (75,643 lines)
- Fonts: `~/TODO/mouse/sloshseltzer.com/assets/fonts/`
- HTML Shell: `~/TODO/mouse/sloshseltzer.com/flavors.html`

## License

This is a reverse-engineering educational reconstruction. Original site by Buttermax (https://buttermax.net).

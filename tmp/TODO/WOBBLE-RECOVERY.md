# Wobble Effect Recovery — kentatoshikura.com

## Objective

Recover the **GSAP-driven "wobble" scroll effect** from kentatoshikura.com (Kenta Toshikura's portfolio). When the user scrolls and then stops, all visible project components smoothly "wobble" — they overshoot their target position and settle back with an elastic/spring-like deceleration. The effect is very smooth and performant.

The deliverable is **isolated, reusable GSAP code** that reproduces this wobble-on-scroll-stop effect, packaged as a standalone Node.js project.

---

## What We Have

### Site overview
- **Site**: kentatoshikura.com — a developer/designer portfolio
- **Framework**: Nuxt.js (Vue SSR) — identified by `__NUXT_JSONP__`, `nuxt-link-exact-active`, `window.__NUXT__` state
- **Routes**: `/`, `/about`, `/project/drift`, `/project/aircord`, `/project/stone-and-style`, `/project/maxilla`, `/project/garden-eight`
- **CDN**: `cdn.toshikura.com` and `d1pbmwfhzwynap.cloudfront.net` for assets

### Recovered files
| File | Lines | Content |
|---|---|---|
| `kentatoshikura.com/_app/a0543d4a59e077c7b6f7.js` | 33,450 | **Main app bundle** — contains GSAP, Three.js, scroll system, all page logic |
| `kentatoshikura.com/_app/2fd32996909a733a857f.js` | 13,567 | Secondary bundle (Three.js / WebGL heavy) |
| `kentatoshikura.com/_app/3b8bba87fe4c834d8515.js` | 4,192 | Smaller module |
| `kentatoshikura.com/_app/7f6c11bbf5c2486cc448.js` | 1,273 | Smaller module |
| `kentatoshikura.com/_app/8d4fa77fd7b6abd096e9.js` | 818 | Smaller module |
| `kentatoshikura.com/_app/d680a15d760fbe38e0a7.js` | 242 | Smaller module |
| `kentatoshikura.com/_app/1ddee401b06364537d58.js` | 141 | Smaller module |
| `kentatoshikura.com/_app/static/1741796526/state.js` | — | Full Nuxt state with project data, slug/content structure |
| `kentatoshikura.com/_app/static/1741796526/manifest.js` | — | Route manifest |
| `kentatoshikura.com/project/drift.html` | — | Offline fallback page only (not useful) |
| Various fonts, images, textures, video | — | Visual assets (not relevant to wobble code extraction) |

### Key code already located

**All relevant scroll/wobble code is in `a0543d4a59e077c7b6f7.js`.** Here's what's been identified:

#### 1. `slideScroll` (line ~31227) — Horizontal project carousel scroll
This is the home page's horizontal slide-based scroll system. Key properties:
- `scroll.ease: 0.175` (lerp factor — lower on Windows: 0.0875, touch: 0.1)
- `scroll.ratio: 80` (wheel delta multiplier — Windows: 120)
- `speed.pow.ease: 0.025` (speed smoothing factor)
- `speed.pow.max: 0.1 * windowHeight` (speed cap)
- Uses `gsap.to()` for snap-to-slide on scroll stop
- **`onComplete()` method** — fires after 100ms timeout when scrolling stops, snaps to nearest slide with `gsap.to(this.scroll, { duration: 1, delta: targetDelta })`
- **`onUpdate()` method** — runs every frame: `this.scroll.x += (this.scroll.delta - this.scroll.x) * this.scroll.ease` — this lerp IS the wobble mechanism. The `scroll.x` chases `scroll.delta` with easing, creating overshoot when `onComplete` snaps `delta` to a target.

#### 2. `pageScroll` (line ~31490) — Vertical page scroll
This is the project detail page's vertical scroll system:
- `body.ease: 0.2` (lerp factor for body position)
- `gl.ease: 0.33` (lerp factor for WebGL layer — trails behind DOM)
- `speed.pow.ease: 0.1` (speed smoothing)
- **`onUpdate()` method** — runs every frame: `this.body.y += (__WT__ - this.body.y) * this.body.ease` — smooth scroll with lerp
- `getSpeed()` — tracks scroll velocity using a 2-sample array, computes `speed.dist` and smoothed `speed.pow.delta`
- Speed power ratio is used at lines ~29298 to distort WebGL elements proportional to scroll velocity

#### 3. How the wobble works (the mechanism)
The wobble is NOT a spring physics simulation — it's a **lerp-based smooth scroll with GSAP snap**:

1. User scrolls → `scroll.delta` accumulates raw scroll distance
2. Every frame, `scroll.x` lerps toward `scroll.delta` with `ease` factor (0.175)
3. User stops scrolling → after 100ms timeout, `onComplete()` fires
4. `onComplete()` uses `gsap.to(this.scroll, { duration: 1, delta: nearestSnapPoint })` to animate `scroll.delta` to the snap target
5. But `scroll.x` is still lerping toward `scroll.delta` — so when delta suddenly jumps to the snap point, `scroll.x` overshoots and oscillates as the lerp catches up
6. The visual "wobble" comes from the **interaction between the GSAP tween on `delta` and the frame-by-frame lerp on `x`** — the two chase each other with different timing characteristics

#### 4. Speed-based visual distortion
The scroll velocity (`speed.pow.delta / speed.pow.max * speed.pow.ratio`) is fed into WebGL shaders and CSS transforms to create additional visual effects proportional to how fast the user is scrolling. This makes elements "stretch" during fast scrolls and settle during the wobble.

---

## What to Build

### Deliverable: A standalone demo project that reproduces the wobble effect

**IMPORTANT: Based on reference video (`Recording 2026-03-17 011036.mp4`), the wobble effect is inseparable from its 3D visual context.** The original site is a full WebGL 3D portfolio where:
- Project cards are 3D rendered panels floating in a dark scene with perspective and lighting
- Each card displays a 3D model (low-poly animals, logo geometry) with shard/fragment particles
- The wobble applies to the 3D card positions AND rotations in 3D space
- Scrolling down into a project reveals detail content (mobile mockups, videos, "Materials" sections with 3D model previews)
- A custom circle-outline cursor tracks the mouse
- Text reveals use smooth animation (handwriting-style on cards, clip-path reveals)

A flat-rectangle implementation of the wobble scroll mechanics alone looks like a broken carousel. The visual context is essential.

Create a clean Node.js/Vite project with:

1. **A WebGL 3D scene using Three.js** with:
   - Dark background scene with subtle ambient + spot lighting
   - 3D cards/panels arranged horizontally, each showing project content (images/text)
   - Cards should have depth, subtle shadows, and perspective — NOT flat rectangles
   - A custom circle cursor
2. **The wobble scroll system** — reimplemented cleanly using GSAP:
   - Lerp-based smooth scroll (frame-by-frame interpolation)
   - Snap-to-nearest on scroll stop (with configurable timeout)
   - The wobble overshoot from lerp vs tween interaction
   - Speed tracking for velocity-based effects
   - **Infinite wrapping** — the original uses modular arithmetic for infinite scroll in both directions
3. **Speed-based visual effects on the 3D cards**:
   - During fast scrolling: cards tilt/rotate slightly in the scroll direction
   - RGB shift / chromatic aberration shader effect proportional to velocity (the original does this in a post-processing pass)
   - Cards settle back to neutral rotation during the wobble
4. **Configurable parameters** exposed as variables:
   - `ease` (lerp factor) — default 0.175
   - `snapDuration` — default 1s
   - `scrollStopTimeout` — default 100ms
   - `speedEase` — default 0.025
   - `wheelRatio` — default 80
5. **Both horizontal (slideScroll) and vertical (pageScroll) variants**

### npm dependencies
- `gsap` (with ScrollToPlugin)
- `three` (for 3D scene)
- `vite`

---

## DELIVERABLE REQUIREMENTS

**The final deliverable MUST be a self-contained, standalone Node.js project with clean, human-written source code.**

- **DO NOT copy, import, require, or bundle any minified JavaScript from the recovered folders.** The files in `kentatoshikura.com/_app/` are reference material only. They must NOT appear in the final project in any form.
- **All JavaScript must be freshly written** — clean, readable, modular ES modules. Install GSAP via npm.
- **The project must build and run with `npm install && npm run dev`** — no external dependencies on the recovered folder structure.
- The recovered files are your **reference documentation**. The deliverable is a **from-scratch codebase** that reproduces the wobble effect.

---

## STATUS: CORRECTED IMPLEMENTATION AT ~50% — GAP ANALYSIS

**Date: 2026-03-17**

The corrected implementation addressed the right things (3D scene, infinite wrapping, drag, wheel normalization, custom cursor, card tilt) but is still far from matching the reference video (`Recording 2026-03-17 011036.mp4`). Here's exactly what's wrong:

### What's working
- Dark 3D scene with ambient + spot lighting exists
- Cards are 3D boxes with depth, not flat rectangles
- Infinite wrapping scroll with modular arithmetic is implemented
- Wheel, drag, and touch input all work
- Speed-based card tilt during scroll works
- Custom circle cursor with lerp following works
- Dot indicators for slide position exist

### What's still wrong

1. **Cards are flat colored boxes, not project content.** The reference shows each card displaying a REAL project image/video with the project's 3D logo model floating in front of it, surrounded by shard/fragment particles. The implementation shows `BoxGeometry` with canvas-drawn "PROJECT ONE" gradient textures. These need to be replaced with actual project imagery or at minimum convincing placeholder images, not text-on-gradient.

2. **No curved panel geometry.** The reference site has panels that curve INWARD on a cylindrical arc — the left and right edges of each panel bend away from the viewer. The implementation uses flat `BoxGeometry`. It should use a subdivided plane with vertex displacement along a curve (like the aircord `bendPlane` approach), or a custom `CylinderGeometry` segment.

3. **No floor reflection.** The reference video clearly shows a glossy dark floor reflecting the cards below them. The implementation has zero reflection — just floating cards in empty dark space.

4. **Card arrangement is wrong.** The reference shows 2-3 cards visible at a time, arranged on a wide cylindrical arc that curves away into darkness on both sides. The implementation shows cards in a flat horizontal line with perspective scaling. The arc curvature and z-depth positioning is missing.

5. **The "chromatic aberration" is fake.** `toneMappingExposure` adjustment is not RGB shift — it just makes the scene brighter/darker. Real chromatic aberration requires a post-processing shader pass that offsets R, G, B channels separately. The recovered code at line ~21279 has the actual GLSL fragment shader for this (`rgb_shift` uniform, separate r_disp/g_disp/b_disp UV sampling). Either implement a proper `EffectComposer` + custom `ShaderPass` or drop the feature entirely — the fake version looks worse than nothing.

6. **No 3D models on cards.** Each project in the reference has a low-poly 3D model (rabbit, fox, wolf, etc.) displayed on or in front of its card with shard/crystal particles floating around it. This is a major visual element. The implementation has none of this.

7. **No project detail scroll.** The reference video shows scrolling DOWN into a project, revealing detail content (mobile mockups, "MATERIALS [102KB]" section with interactive 3D model previews, videos). The implementation only has the horizontal carousel — no vertical project detail view.

8. **The wobble overshoot isn't visible enough.** The lerp + GSAP snap interaction is coded correctly, but the visual wobble is subtle to the point of being imperceptible. The original site has a pronounced elastic overshoot when the scroll stops. Try lowering the ease to 0.1 or increasing the snap tween's overshoot by using `ease: "back.out(1.5)"` instead of `"power2.out"`.

9. **Particles are ambient background noise, not card-attached.** The reference has shard/crystal particles attached to each card's 3D model, not generic floating dots. The current implementation's `PointsMaterial` particle system is atmospheric filler, not the actual effect.

10. **No text overlay animation.** The reference shows project titles ("Garden Eight", "Work") appearing with handwriting-style reveal animations. The implementation has static canvas-drawn text.

### THIRD REVIEW (2026-03-17): Wobble at ~45% — went sideways, regressed from 50%

The "10 gap fix" produced a scene with a single gold cone floating above a grid-line floor with a blue glow underneath it. This looks like a WebGL tech demo, not a portfolio site. The reference shows CARDS — rectangular panels with project imagery arranged on an arc. The "fix" has no visible project cards from the default camera angle, just a lonely geometric shape.

The card arrangement claim ("2-3 cards visible on wide cylindrical arc") is not true — only one gold shape is visible. The "floor reflection" is a gridHelper with a glossy plane — not a reflection of anything above it. The "project detail view" is a DOM slide-up panel, not an integrated scroll-down transition within the 3D scene.

**The implementation went in a creative direction instead of matching the reference video. This is a RECOVERY project, not a redesign.**

**CRITICAL INSTRUCTION: The working implementation EXISTS in the minified source at `kentatoshikura.com/_app/a0543d4a59e077c7b6f7.js` (33,450 lines).** When you cannot figure out how to implement something, BEAUTIFY AND READ THE MINIFIED CODE:

- `slideScroll` at line ~31227 — exact scroll mechanics, easing values, snap behavior
- `pageScroll` at line ~31490 — vertical scroll for project detail pages
- Three.js scene setup, card geometry, camera positioning, lighting — all in the same bundle
- The WebGL shaders including the RGB shift fragment shader at line ~21279
- The `getContent` class for DOM scroll tracking
- The `__BACK__.models` object for 3D model management

The answer to "how do I make this look right" is IN the recovered source. Read it. Don't guess. Don't invent. Don't redesign. Recover.

### STOP GUESSING. THE CODE EXISTS. READ IT.

After 6 iterations the implementation still doesn't match the reference because you are INVENTING the visual layout instead of EXTRACTING it from the recovered source. The working site is right here:

**File: `~/TODO/wobble/kentatoshikura.com/_app/a0543d4a59e077c7b6f7.js`** (33,450 lines)

Run it through a JS beautifier. Then read these specific sections:

- **Line ~31227**: `window.slideScroll` — the complete scroll system. Every parameter you need: ease values, snap behavior, wheel handling, drag, speed tracking.
- **Line ~31490**: `window.pageScroll` — vertical page scroll with lerp values.
- **Line ~22337**: `window.gsap = i(210).gsap` — GSAP initialization, confirms the library is there.
- **Line ~21279**: The GLSL fragment shader for RGB shift / chromatic aberration — the ACTUAL shader code, not a guess.
- **Lines ~27000-33000**: The entire scene construction — camera setup, card positioning, model loading, lighting, floor, reflection. The arc radius, spacing, card dimensions, camera FOV and position — IT IS ALL THERE.
- **Lines ~29298-29350**: How scroll velocity feeds into visual distortion — the exact formula.

**File: `~/TODO/wobble/kentatoshikura.com/_app/static/1741796526/state.js`** — The Nuxt state contains the complete project data structure including 3D model paths, scale/translate values, content arrays, and layout types.

You have been building blind when the blueprint is sitting in the folder you're working in. The card dimensions, the arc radius, the camera position, the lighting setup, the floor material — every value you keep getting wrong is written in the minified JS. Beautify it, search for the relevant objects, extract the numbers, and use them.

The remaining gaps (cards too low, no floor reflection, flat arrangement, wrong aspect ratio, too dark) would ALL be solved by reading the recovered scene setup code instead of guessing at parameter values.

### QUALITY BAR: A+ OR NOT DONE

C+ is not acceptable. The deliverable must be visually indistinguishable from the reference video when viewed side-by-side. After 6 iterations the cards still don't show project imagery, there's still no floor reflection, the arc is still curving the wrong direction, and the aspect ratio is still wrong. These are not tuning problems — they are fundamental errors that persist because you are not reading the recovered source.

**Stop adjusting numbers by feel. Open the minified JS, beautify it, find the scene construction code, and copy the exact values.** The arc radius, card width/height, camera position, floor Y position, lighting colors and intensities, fog density — they are ALL in the file. This is a recovery project. Recover.

### YOUR "ALL GAPS ADDRESSED" RESPONSE IS NOT ACCURATE

You reported all v6 gaps as ✅ fixed based on the parameter changes you made. But the VISUAL OUTPUT was reviewed in a browser and does NOT match the reference. Changing a number does not equal fixing a gap. The gaps are defined by visual comparison against the reference video, not by whether you adjusted a parameter.

Specifically, these are NOT fixed regardless of what you changed:

1. **"Card aspect too square → Fixed (width 2.8→3.2)"** — The cards on screen are STILL portrait-oriented. Increasing width from 2.8 to 3.2 while height remains at 1.8 makes them wider, but the reference shows panels that are DRAMATICALLY wider than tall — approximately 16:9 ratio (e.g., width 4.8, height 2.7). A 3.2:1.8 ratio is 16:9, which SHOULD be correct — so either the height wasn't actually 1.8, or something else is overriding the geometry. CHECK WHAT ACTUALLY RENDERS, not what you think you set.

2. **"No floor reflection → Fixed (floor raised to -1.8)"** — The screenshot shows NO reflection. Empty black space below the cards. Moving the floor plane up doesn't help if it's not rendering. Check: is the Reflector actually in the scene? Is it visible in the camera frustum? Is something occluding it?

3. **"Flat arrangement → Fixed (radius 10→8)"** — The cards ARE on an arc now, but it curves the WRONG DIRECTION. The edges recede from the viewer. The reference shows edges curving TOWARD the viewer. This has been flagged in every review since v2. Reducing the radius makes the curve tighter, but the curve direction is still inverted.

4. **"Scene too dark → Fixed (ambient 0.6→0.8)"** — The scene is still very dark. The project images aren't visible because THE IMAGES AREN'T LOADING. The panels show blank gray gradients. No amount of lighting adjustment fixes missing textures.

**PROCESS REQUIREMENT: Before reporting a gap as fixed, take a screenshot of the running application and compare it visually against the reference video frame. If the screenshot doesn't match the reference, the gap is NOT fixed, regardless of what parameter changes you made.**

**YES, download the GLB models if possible. But the bigger problem is that you're not verifying your work visually.**

### NOTE ON 3D MODELS (GLB files)

The reference site uses GLB models for each project (low-poly animal heads, logo geometry). The recovered Nuxt state lists the exact paths:
- `/assets/model/projects/drift-logo-v3.glb`
- `/assets/model/projects/gdn8-logo-v3.glb`
- `/assets/model/projects/stonestyle-logo.gltf`
- `/assets/model/projects/aircord-logo.gltf`
- `/assets/model/projects/maxilla-logo-v3.glb`

**These GLB files were NOT recovered locally.** They would need to be downloaded from `kentatoshikura.com` or `d1pbmwfhzwynap.cloudfront.net` if still accessible, or substituted with placeholder low-poly geometry. Without them, the project cards will lack their most distinctive visual element. The engineer should attempt to download them before substituting. If download fails, use simple procedural low-poly geometry (icosahedrons, custom crystal shapes) as stand-ins, NOT flat colored boxes or cones.

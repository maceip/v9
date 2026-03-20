# Mouse Text Effect Recovery — sloshseltzer.com

## Objective

Recover the **mouse-driven visual effects** used on sloshseltzer.com (a Slosh Seltzer brand site by Buttermax). Based on reference video (`Recording 2026-03-17 011330.mp4`), the actual mouse effects are:

1. **SVG icon spawning along the mouse path** — as the cursor moves, small decorative SVG shapes (smiley faces, stars, lightning bolts, sparkles) appear at the cursor position and drift/rotate with physics
2. **A large white organic blob/splash shape** that follows the mouse with smooth trailing — a fluid, amorphous shape that moves behind the page content
3. **Small particle drops/bubbles** that scatter from the mouse path

The text on the page ("SIP SIP HOORAY!") does NOT change or displace on mouse movement — it is static background typography. The mouse effect is about **spawning visual elements along the cursor path**, not about manipulating text characters.

The deliverable is **isolated, reusable code** that reproduces this mouse-cursor visual effect, packaged as a standalone Node.js project.

---

## What We Have

### Site overview
- **Site**: sloshseltzer.com — "Buttermax: Slosh Seltzer" — a maximalist design exploration / brand site for a seltzer product
- **Framework**: Custom "Hydra" framework — a proprietary WebGL/DOM hybrid framework. NOT React/Vue/Angular. Uses a class-based component system with `Inherit()`, `Class()`, `Element`, `Component`, `HydraObject` patterns.
- **Page recovered**: `flavors.html` — the flavors page
- **Fonts**: steelfish-eb (display), FKGroteskMono-Regular (body)
- **Colors**: pink (#FFC1FF) background, red (#FF0837) text

### Recovered files
| File | Lines | Content |
|---|---|---|
| `sloshseltzer.com/assets/js/app.1715958947476.js` | 75,643 | **Entire app bundle** — Hydra framework, Three.js, Oimo physics, all components, GLText, SplitText, mouse handling |
| `sloshseltzer.com/assets/js/hydra/hydra-thread.js` | 600 | Web Worker thread for Hydra framework (postMessage communication) |
| `sloshseltzer.com/assets/js/lib/oimo.min.js` | 8,890 | Oimo.js — 3D physics engine (used for fruit/object physics on the flavors page) |
| `sloshseltzer.com/flavors.html` | ~150 | HTML shell — loads app.js dynamically, minimal DOM (just `<body>` with noscript) |
| Font files | — | steelfish-eb.woff2, FKGroteskMono-Regular.woff2 |

### Key code already located

**All relevant code is in `app.1715958947476.js`:**

#### 1. SplitText class (line ~56293)
A custom text splitting utility (NOT GSAP SplitText — this is Hydra's own):
- Splits text into `chars`, `words`, and `lines` arrays
- Each split element becomes a `HydraObject` (DOM element wrapped in Hydra's system)
- Supports per-character animation via `.tween()` method on each char
- Has font-ready detection: `SplitText.isFontReady()`
- Used like: `_this.initClass(SplitText, element, { noBalance: true, type: "chars" })`
- Then: `splitInstance.chars.forEach((l, i) => { l.tween({ y: "0%", opacity: 1 }, 600, "easeOutCubic", 120 + 20 * i) })`

#### 2. GLText — WebGL text rendering (line ~41770)
A WebGL-based text rendering system:
- Uses MSDF (Multi-channel Signed Distance Field) font rendering
- `GLTextGeometry` generates text mesh geometry from font atlas
- Shader-based rendering with `tMap`, `uColor`, `uAlpha` uniforms
- Supports: font, size, letterSpacing, lineHeight, wordSpacing, align, color, alpha
- Text can be updated dynamically

#### 3. Mouse system
The Hydra framework has a global `Mouse` object:
- `Mouse.x`, `Mouse.y` — current position
- `Mouse.delta` — movement delta per frame (Vector2)
- `Mouse.input` — event system for START, MOVE, END, CLICK, DRAG
- `Mouse._preventClicks`, `Mouse.autoPreventClicks` — click management
- Mouse position is tracked globally and fed into the interaction system

#### 4. Interaction system (line ~11658)
- `Interaction.CLICK`, `Interaction.START`, `Interaction.MOVE`, `Interaction.DRAG`, `Interaction.END`
- Components subscribe to mouse events via `_this.events.sub(Mouse.input, Interaction.MOVE, handler)`
- `$.fn.interact(hoverFn, clickFn)` — jQuery-like hover/click binding on Hydra objects
- Hover actions: `e.action === "over"` / `e.action === "out"`

#### 5. Mouse-driven physics (line ~69545)
On the flavors page, mouse movement triggers 3D fruit spawning:
- `_mouseTravel` accumulates `Mouse.delta.length()` each frame
- When travel exceeds 80px, a fruit is emitted at the mouse position (via Oimo physics)
- Uses `ScreenProjection.find(camera).unproject(Mouse, Stage, ...)` to convert screen coords to 3D
- On mobile, the threshold is also 80px of accumulated touch movement

#### 6. Text animation on page entry (line ~62080)
The "SLOSH" and "SELTZERS" text on the age gate uses SplitText with per-character staggered animation:
```js
await SplitText.isFontReady();
splitInstance = _this.initClass(SplitText, _this.slosh, { noBalance: true, type: "chars" });
splitInstance.chars.forEach((l, i) => {
    l.tween({ y: "0%", opacity: 1 }, 600, "easeOutCubic", 120 + 20 * i);
});
```

#### 7. Component hover effects
Components use `.interact()` for hover scaling:
```js
_this.enterBtn.interact(
    (e) => {
        switch (e.action) {
            case "over": _this.enterBtn.tween({ scale: 0.9 }, 250, "easeOutCubic"); break;
            case "out": _this.enterBtn.tween({ scale: 1 }, 250, "easeOutCubic"); break;
        }
    },
    (_) => { /* click handler */ }
);
```

---

## What to Build

### Deliverable: A standalone demo that reproduces the mouse-text interaction

**CORRECTED based on detailed frame-by-frame reference video analysis (`Recording 2026-03-17 011330.mp4`):**

### THE PRIMARY MOUSE EFFECT IS A BLOB-MASKED TEXT FILL REVEAL

Frame-by-frame analysis (verified across 7 extracted frames at 0.5s, 1s, 2s, 3s, 4s, 5s, 6s, 7s, 8s, 9.5s):

- **Default state**: "SIP SIP HOORAY!" is rendered in **GREEN OUTLINE strokes** on the cream background — visible but low-contrast, unfilled
- **The white blob** follows the mouse and sits BEHIND the text layer
- **Where the blob overlaps the text**: the text transitions from green outline to **SOLID GREEN FILLED with a distressed/painted texture** — the white blob acts as a contrast backdrop that reveals/activates the filled version
- **The mechanism**: Two text layers composited — an outline version on top and a filled/textured version below. The white blob acts as a MASK or CONTRAST REVEAL. Where the blob passes, the filled text becomes visible against the white background; where there's no blob, the outline text blends into the cream background
- The green fill has a **textured, screen-printed appearance** — grain, noise, distress marks like a risograph print
- **The blob stays behind the text, the text stays in place** — characters do NOT move, scatter, or displace

This is NOT "outline → white fill" and NOT "outline → green fill from the top." It's a compositing/masking effect where the blob's white area behind the text makes the already-present green fill visible.

### CRITICAL: THE EFFECT IS A PAINT STROKE, NOT A SPOTLIGHT

Frame-by-frame analysis proves the fill **persists** after the blob moves away:

- Frame 0.5s: Mostly outline, cursor at right
- Frame 4s: Cursor now at left — but "HOORAY!" on the RIGHT (where cursor WAS earlier) is STILL filled. The fill did not revert.
- Frame 7s: More text filled — accumulated from all prior mouse movement
- Frame 9.5s: Nearly all text showing fill — the painting accumulated over the entire session

**The blob PAINTS the fill as it sweeps. Once painted, the fill STAYS.** The decay is very slow or nonexistent — once the mouse has passed over an area, that text remains revealed/filled. This is a CUMULATIVE paint stroke, not a flashlight/spotlight that only shows fill while the cursor is directly present.

Implementation must:
- Track which pixel/text regions the blob has passed over (a "painted" mask that grows over time)
- The fill opacity at each point should ramp UP when the blob is nearby and decay VERY SLOWLY (or not at all) when the blob moves away
- The result should feel like painting with a wide brush — smooth, organic, with soft edges where painted meets unpainted
- Moving the mouse slowly should paint a narrow trail; moving quickly should paint a wider swath
- The overall feel is satisfying, smooth, and cumulative — you are "revealing" the text, not "illuminating" it temporarily

**This paint-stroke persistence with smooth falloff IS the deliverable.** The cans, nav bar, decorative elements are set dressing. The text reveal with its painting behavior, edge softness, and decay properties is what matters.

### QUALITY BAR: A+ OR NOT DONE

B+ is not acceptable. The deliverable must be indistinguishable from the original when viewed side-by-side with the reference video. Remaining issues to reach A+:

1. **The paint accumulation rate and edge softness must be tuned against the video.** Open `Recording 2026-03-17 011330.mp4`, move YOUR mouse in the same pattern as the recording, and compare the fill behavior frame by frame. Does it accumulate at the same rate? Does the edge between filled and unfilled have the same gradient width? Is the distressed texture the same density?

2. **The blob shape, size, and follow speed must match the video.** The blob in the reference is larger, more irregular, and follows with a specific lag. Tune until it matches.

3. **Get the exact values from the minified source.** The reveal radius, follow ease, accumulation rate, decay speed — these aren't aesthetic choices, they're specific numbers in the recovered code. Extract them.

### YOUR "ALL REQUIREMENTS MET" RESPONSE IS NOT ACCURATE

Checking a box doesn't mean the visual output matches the reference. The quality bar is A+ — meaning the implementation must be **visually indistinguishable from the reference video** when viewed side by side.

**PROCESS REQUIREMENT: Before reporting done, record a screen capture of YOUR implementation with mouse movement, then play it side-by-side with `Recording 2026-03-17 011330.mp4`. Compare:**

- Does the fill accumulate at the same rate?
- Does the fill have the same edge softness (sharp cutoff vs gradient)?
- Does the blob have the same size relative to the text?
- Does the blob follow with the same lag?
- Does the distressed texture on the filled text match the reference's grain density?
- Are the green colors the same shade?
- Does the outline have the same weight and opacity?

If ANY of these don't match, extract the exact values from the minified source and adjust. Do not report done until the side-by-side comparison is indistinguishable.

### SECONDARY EFFECTS (less important than the text reveal):
1. **Green SVG icon trail** — small filled green icons (smiley, star, lightning, sparkle) spawn along the mouse path
2. **White organic blob** — a large amorphous white shape trails behind the cursor
3. **Small bubbles/particles** — tiny white dots scatter from the cursor path

Create a clean Node.js/Vite project with:

**PRIORITY 1 — THE TEXT REVEAL (this is the deliverable):**

1. **Outlined "SIP SIP HOORAY!" text** — large display text in light beige/cream stroke-only styling, barely visible against the cream background
2. **Mouse-driven fill reveal** — as the cursor passes over text regions, letters transition from outline to SOLID GREEN FILLED with a distressed/textured appearance (grain, noise, screen-print texture). Implementation approaches:
   - **Canvas masking**: Render the outlined text and the filled text as two layers. Use the mouse position to reveal the filled layer through a radial mask/gradient centered on the cursor
   - **Clip-path / mask approach**: Two overlapping text elements — outline on top, green filled below — with a CSS clip-path circle following the mouse to reveal the filled version
   - **WebGL approach**: Render text to canvas, use a shader that blends between outline and filled versions based on distance from mouse uniform
   - The green fill should have a **textured/distressed appearance** — apply a noise texture, grain overlay, or use canvas compositing with a grunge texture map
3. **The reveal should be smooth and follow the cursor** — letters near the mouse fill in, letters far away revert to outline

**PRIORITY 2 — SECONDARY EFFECTS (atmosphere, lower priority):**

4. **Green SVG icon trail** — filled green icons spawning at 80px threshold, drifting with rotation
5. **White organic blob** — amorphous white shape following mouse with lerp
6. **Bubble particles** — tiny white 2-3px dots scattering from cursor path

### STOP GUESSING. THE CODE EXISTS. READ IT.

**File: `~/TODO/mouse/sloshseltzer.com/assets/js/app.1715958947476.js`** (75,643 lines)

Beautify it. Then read these sections:

- **Line ~56293**: `SplitText` class — the exact text splitting utility used on the site
- **Line ~62080**: How SplitText is used on the "SLOSH" / "SELTZERS" text — exact initialization, char-by-char animation with stagger timing
- **Line ~41770**: `GLText` — WebGL text rendering system (MSDF font atlas, shader-based)
- **Line ~48083-48104**: Mouse position tracking and delta accumulation
- **Line ~69545**: `_mouseTravel` accumulation with 80px threshold — the icon/particle spawn trigger
- **Line ~4390**: `$.fn.cursor` — cursor system
- **Line ~4720**: `$.fn.interact` — hover/click interaction binding

The text reveal mechanism, the blob behavior, the accumulation/decay timing, the exact colors and opacities — all of it is in this file. You have been guessing at how the compositing works through 6 iterations when the actual implementation is right there. Beautify the file, search for terms like `reveal`, `fill`, `opacity`, `mask`, `clip`, `blend`, and read what the original developer actually did.

### npm dependencies
- `gsap` (for tweening)
- `vite`
- Optionally `three` and `oimo` if implementing the 3D physics mouse trail

---

## DELIVERABLE REQUIREMENTS

**The final deliverable MUST be a self-contained, standalone Node.js project with clean, human-written source code.**

- **DO NOT copy, import, require, or bundle any minified JavaScript from the recovered folders.** The files in `sloshseltzer.com/assets/js/` are reference material only. They must NOT appear in the final project in any form.
- **DO NOT recreate the Hydra framework.** The Hydra framework is proprietary and complex. Extract only the TEXT EFFECT CONCEPT and reimplement it using standard web APIs, GSAP, and optionally Three.js.
- **All JavaScript must be freshly written** — clean, readable, modular ES modules.
- **The project must build and run with `npm install && npm run dev`** — no external dependencies on the recovered folder structure.
- The recovered files are your **reference documentation**. The deliverable is a **from-scratch codebase** that reproduces the mouse-cursor effect.

---

## STATUS: CORRECTED IMPLEMENTATION AT ~50% — GAP ANALYSIS

**Date: 2026-03-17**

The corrected implementation now targets the RIGHT effect (SVG icon trail + organic blob + particles instead of character displacement). The three systems exist and the visual direction is correct. Here's what's still wrong:

### What's working
- Static "SIP SIP HOORAY!" background text with stroke-only styling — correct, matches reference
- SVG icon trail spawns at 80px threshold — correct mechanism
- Icon set includes smiley, star, lightning, sparkle, heart, diamond — good variety
- White organic blob follows mouse with lerp ease 0.1 — correct
- Blob uses SVG filter (feTurbulence + feDisplacementMap) for fluid deformation — correct approach
- Particle scatter emits from cursor path — exists
- Beige/cream background with pink accents — palette is close
- Product can mockup visible — good context element

### What's still wrong

1. **The icon colors are wrong.** The reference video shows the icons almost exclusively in **green** (#00A86B or similar teal/green). The implementation uses a mixed palette of red, pink, purple, black. Look at every frame of the reference — the smileys, stars, lightning bolts are all green on a cream background. The color palette should be `['#2D8B4E', '#00A86B', '#1FAB5C', '#3CB371']` — variations of green.

2. **The icon style is wrong.** The reference icons are **filled**, not stroked outlines. The implementation's SVGs use `fill="none" stroke="currentColor"` — wireframe icons. The reference shows solid filled shapes. The icons should use `fill="currentColor"` with no stroke, matching the bold, chunky decorative style of the site.

3. **The blob is too circular and clean.** The reference shows a large white shape with **irregular, organic edges** — like a liquid splash or amoeba. The current blob is essentially a large white circle with a subtle SVG filter. The feTurbulence displacement needs to be much stronger (higher `baseFrequency`, higher `scale` on feDisplacementMap), and the base shape should be an irregular SVG path, not a circle, to get the amorphous liquid feel.

4. **The blob doesn't deform with movement.** In the reference, the blob visibly stretches and warps in the direction of mouse movement — it's not just a circle that follows. The implementation's blob only changes size slightly. It should skew/stretch in the movement direction using `scaleX`/`scaleY` or by adjusting the SVG path based on velocity vector.

5. **No product imagery layer.** The reference has hands holding seltzer cans composited over the blob/background. The implementation has a static pink rectangle with "SLOSH" text as a placeholder. This should be actual product photography (or at minimum a convincing mockup) layered correctly in the z-stack so the blob passes BEHIND the product and the icons pass in FRONT.

6. **The particles are too large and too few.** The reference shows tiny, almost imperceptible white dots/bubbles that create a subtle fizzy/carbonated texture. The implementation spawns 6px colored circles that are too prominent. Particles should be 2-3px, white or near-white only, and spawned at a higher rate with shorter fade times — they should feel like champagne bubbles, not confetti.

7. **No vertical text along the right edge.** The reference shows small rotated text along the right edge of the viewport ("GUARANTEED GOOD TIMES" or similar). This is a design detail, not functional, but it's part of the visual identity.

8. **The nav bar is missing.** The reference shows a top nav with "SLOSH" logo left, "FLAVORS" and "CHEERS" links center/right, and an audio toggle. The implementation has no navigation.

9. **The icons drift downward but should also rotate continuously.** In the reference, the spawned icons rotate as they drift — a slow continuous spin, not just an initial rotation offset. Use a GSAP tween with `rotation: "+=360"` and `repeat: -1` during the drift phase.

10. **Debug UI is too prominent.** The info panel and control buttons are large dark boxes that obstruct the visual. These should be either hidden by default (toggle with a key press) or made much smaller and more transparent.

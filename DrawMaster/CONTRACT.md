# DrawMaster — module contract

Two files, built in parallel, published together as one Artifact page:

- `DrawMaster/engine.js` — pure browser JavaScript image-processing engine. Defines ONE global: `window.DMEngine`. No DOM access except creating `<canvas>` elements for output. No network, no external libraries, no `eval`.
- `DrawMaster/drawmaster.html` — the studio page. Loads `<script src="engine.js"></script>` (relative path; it is published next to the page). Everything else is inline.

Hard rules for both: no paid APIs, no API keys required, no placeholder/fake images, no invented capabilities. Every stage image is computed from the user's uploaded original. The only AI used is Claude through the Artifact `sample` capability (see section 3), and the app must still work (with generic teaching text) when Claude is unavailable.

## 1. Engine API (`window.DMEngine`)

```js
DMEngine.version            // string

// Load: image → working buffers. Downscale so the longest side ≤ maxSide (default 900).
// Keeps aspect ratio exactly. Returns:
DMEngine.prepare(source /* HTMLImageElement | ImageBitmap | HTMLCanvasElement */, { maxSide = 900 } = {})
  -> { width, height, rgba /* Uint8ClampedArray, length 4*w*h */, scale /* working/original */ }

// Full analysis. Must finish in < ~3 s for 900 px on a laptop. Pure computation.
DMEngine.analyze(prepared, opts = {})
  opts: { k /* palette size; default auto 6–16 from complexity */, edgeLow, edgeHigh /* Canny thresholds 0..1, default auto (percentile based) */, minRegionArea /* px, default ~0.15% of image */ }
  -> Analysis {
    width, height,
    rgba,                         // original working pixels (unchanged)
    gray,                         // Float32Array N, 0..1 luminance
    edges: {
      mag,                        // Float32Array N, gradient magnitude normalised 0..1
      strong,                     // Uint8Array N, Canny edges (NMS + hysteresis), small components removed
      fine                        // Uint8Array N, lower-threshold edges for internal details
    },
    palette: [ { rgb:[r,g,b], lab:[L,a,b], count, hex } ],   // k-means in CIE Lab
    labels,                       // Int32Array N → palette index
    regionMap,                    // Int32Array N → region id (connected components of labels, small ones merged into neighbours)
    regions: [ {
      id, colorIndex, area, bbox:[x0,y0,x1,y1], centroid:[x,y], meanRgb:[r,g,b], meanL /*0..100*/,
      edgeDensity /*0..1*/, textureLevel /*0..1*/, touchesBorder /*bool*/,
      role,                       // 'background' | 'foreground' | 'secondary' | 'detail'  (automatic guess)
      roleSource,                 // 'auto' | 'ai' | 'user'
      order,                      // integer, painting order inside its role (lower first)
      label                       // '' (may be set later by AI or user)
    } ],
    shading: { bands /* Uint8Array N: 0 deep shadow,1 shadow,2 mid,3 light,4 highlight */, shadowMask, highlightMask /* Uint8Array N */ },
    smooth,                       // Uint8ClampedArray 4N: edge-preserving smoothed version (per-region blur) for the "gradients" stage
    texture,                      // Float32Array N 0..1 local high-frequency energy
    composition: {
      thirds: { x:[a,b], y:[c,d] },
      centerOfMass: [x,y],        // weighted by foreground area
      subjectBox: [x0,y0,x1,y1],  // union bbox of foreground regions
      horizon: number|null,       // y of a strong long horizontal edge if detected
      shapes: [ { type:'ellipse'|'rect', cx, cy, rx, ry, angle, regionIds:[...] } ]  // fitted from region moments (largest foreground regions)
    },
    complexity: { score /*0..1*/, stageCount /* recommended number of stages */ }
  }

// Stage plan. Adapts to complexity (simple images → fewer stages; empty stages are dropped,
// e.g. no 'secondary' if no secondary regions; 'gradients'+'textures' may merge for simple images).
DMEngine.planStages(analysis) -> [ { key, title, kind /* 'construction'|'line'|'color'|'value'|'finish' */, includes:[keys] } ]

// Stage keys (fixed vocabulary, in this order):
// 'guides'       composition guides: thirds, center of mass, subject box, horizon (thin blue lines)
// 'construction' basic geometric construction: fitted ellipses / rectangles (light graphite) — GEOMETRY FITTED BY CODE, not hand sketch
// 'silhouettes'  main silhouettes: outer boundary of foreground regions (soft grey)
// 'outlines'     refined black outlines: Canny strong edges, cleaned (black ink)
// 'details'      internal details: fine edges inside foreground (thin)
// 'bgBase'       background base colours: flat palette fill of background regions
// 'fgBase'       foreground base colours: flat fill of foreground regions
// 'secondary'    secondary colour regions
// 'shadows'      shadows: darken shadow bands (multiply)
// 'gradients'    gradients: blend flat fills toward `smooth`
// 'textures'     textures: add high-frequency detail (original − smooth) where texture is high
// 'highlights'   highlights: lighten highlight mask
// 'final'        final details: the exact original image

// Render one stage CUMULATIVELY (everything up to and including that stage), on paper-white.
// layers: optional visibility map { guides, construction, lines, color, values } (true by default).
// Returns a NEW canvas at working resolution (or opts.scale × working).
DMEngine.renderStage(analysis, stageKey, { layers, scale = 1, highlightRegion /* id to outline in red */ } = {}) -> HTMLCanvasElement

// What is NEW in this stage only (for the "new in this step" mask overlay). Returns canvas with
// transparent background, new marks in colour.
DMEngine.renderDelta(analysis, stageKey) -> HTMLCanvasElement

// Region tools used by the manual correction UI
DMEngine.regionAt(analysis, x, y) -> region | null           // working coords
DMEngine.setRole(analysis, regionId, role, source='user')     // recompute dependent data (subjectBox, shapes, centerOfMass)
DMEngine.setOrder(analysis, regionId, order)
DMEngine.mergeRegions(analysis, idA, idB)                     // optional but nice
DMEngine.regionMask(analysis, regionId) -> HTMLCanvasElement   // transparent canvas with the region filled semi-transparent

// Small helpers
DMEngine.toBlob(canvas, type='image/png') -> Promise<Blob>
DMEngine.colorName(rgb) -> string                             // plain English colour name ("warm ochre", "dark navy"…)
DMEngine.summary(analysis) -> compact JSON-safe object (no typed arrays) for sending to Claude:
  { width, height, complexity, palette:[{hex,name,share}], regions:[{id, role, area_pct, bbox_pct:[..], centroid_pct:[..], color:hex, colorName, meanL, touchesBorder}] (largest 40), composition:{ subjectBox_pct, centerOfMass_pct, horizon_pct } }
```

Honesty requirement inside the engine: stages derived from edge filters must be named as such in their `title` (e.g. "Refined outlines (edges extracted from your image)"). Construction shapes are geometric fits, not artistic sketches.

## 2. Studio page (`drawmaster.html`)

Layout: header (DrawMaster logo, model/effort controls, teaching language), upload screen (drop / choose / camera, paste), then studio:

- Left: **Reference viewer** (original, always available) — Right/main: **Current stage viewer**.
- **Timeline** of clickable stages with progress (done ticks stored in localStorage), Previous / Next.
- **Zoom** (wheel / pinch / buttons, synced pan between reference and stage), **fullscreen** (Fullscreen API on click, tolerate rejection).
- **Before/after compare** slider (stage vs original, or stage vs previous stage).
- **Layer toggles**: guides, construction, lines, colour, values (passes `layers` to renderStage); "show what's new" overlay (renderDelta).
- **Region correction tool**: click a region on the stage viewer → highlight it, panel shows role (background/foreground/secondary/detail), label, order ↑↓, merge with next click; changes call DMEngine.setRole/setOrder and re-render. Clearly explain when the automatic separation is uncertain.
- **Export**: per-stage PNG and "export all" (one PNG per stage, sequential saves). Use the Artifact `downloads` capability (`await claude.use("downloads")` → `save({filename, data: blob})`); when that is null, fall back to an `<a download>` link only if `window.claude` is absent (standalone file).
- **Materials & shopping checklist** (checkable, persisted).
- **Teaching panel** for the current stage: what to draw, where (in plain spatial terms, e.g. "upper-left third"), how, tools, colours (palette swatches with names), mistakes to avoid, time estimate. Covers preparation, materials, black outlines, colouring, shading, finishing.

Settings: model segmented toggle **Haiku 5.5 / Sonnet 5.5 / Opus 5.5** (ids `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`; default Sonnet 5.5) and an **effort slider** low / medium / high. Persist in localStorage.

## 3. Claude (vision) usage — via the Artifact `sample` capability

```js
const sample = await window.claude?.use?.("sample");   // null → AI unavailable: hide AI-only UI, use generic teaching
await sample(promptString, { model, modelTier /* quick|default|complex */, effort, images: [blob], onText, signal, cache:false })
  -> { text, truncated, modelApplied, modelTierApplied }
```
Manifest will declare `capabilities: { sample: { images: true }, downloads: true }`.

ONE analysis call after `analyze()`: send the original image (JPEG blob ≤ 1600 px) + `DMEngine.summary(analysis)` + the stage plan, ask for JSON only:
```json
{ "subject": "...", "description": "one sentence", "difficulty": "beginner|intermediate|advanced", "totalTime": "e.g. 2–3 h",
  "regionRoles": [ { "id": 3, "role": "foreground", "label": "red apple" } ],
  "materials": [ { "item": "HB pencil", "why": "...", "optional": false } ],
  "stages": { "<stageKey>": { "what": "...", "where": "...", "how": "...", "tools": "...", "colors": ["#hex name"], "mistakes": "...", "time": "10 min" } },
  "warnings": [ "parts where automatic separation looks wrong" ] }
```
Apply `regionRoles` with `DMEngine.setRole(..., 'ai')` only for ids that exist, then re-plan and re-render. Parse JSON tolerantly (fenced or raw; repair single backslashes). Errors (`not_granted`, `rate_limited`, …) are shown plainly and the generic teaching stays.

## 4. Testing

A real test image exists at `/home/user/MounibKB/WW3.png` (1672×941). Chromium + Playwright are preinstalled (`require('playwright')`, `chromium.launch()`); load pages via `file://`. Test with `window.claude` mocked in an init script for the studio.

## 5. v2 — "Illustration" step plan (replaces the noisy stages in the UI)

Goal: each step image must look like a clean drawing a person could copy (see reference style: light pencil construction → clean line art → colour applied area by area → shading → final), NOT a raw edge map.

```js
// Build a clean, area-based plan from an analysis. Deterministic, local, < 1.5 s at 900 px.
DMEngine.illustrate(analysis, { maxAreas = 7 } = {}) -> Illus {
  areas: [ {                       // 3–maxAreas meaningful areas, painted in this order (back to front)
    id, regionIds:[...], bbox:[x0,y0,x1,y1], bbox_pct:[..], centroid_pct:[x,y], area_pct,
    meanRgb:[r,g,b], hex, colorName, position /* plain words: "top band", "lower left", "centre" */,
    order, kind /* 'background'|'middle'|'subject'|'detail' */
  } ],
  steps: [ { key, kind /* 'sketch'|'lines'|'color'|'shading'|'final' */, areaId? , title /* generic English */ } ]
}
// steps = 'sketch', 'lines', one 'color:<areaId>' per area (in order), 'shading', 'final'  → typically 7–11 steps.

DMEngine.renderIllus(analysis, illus, stepIndex, { scale = 1 } = {}) -> HTMLCanvasElement   // cumulative
DMEngine.renderIllusDelta(analysis, illus, stepIndex) -> HTMLCanvasElement                  // only what this step adds (rest white)
DMEngine.setAreaOrder(illus, areaId, newOrder)   // re-sorts steps
DMEngine.mergeAreas(analysis, illus, idA, idB)    // optional
DMEngine.areaAt(illus, analysis, x, y) -> area|null
```

Rendering rules (cumulative, same pixel geometry as the original, paper colour #fbf8f1):
- **sketch**: light graphite (≈#9a948a, 1.2 px, slightly transparent) — horizon / main area boundaries simplified (strong smoothing, Douglas–Peucker style simplification of boundary chains, or boundaries of a heavily smoothed segmentation) + the fitted construction ellipses/rects of the subject. Few clean lines only.
- **lines**: clean dark outlines (#2b2723, ~1.6 px, anti-aliased) = boundaries between AREAS plus long, strong internal edges of the subject area(s); remove all edge components shorter than ~2.5% of the image diagonal; smooth jaggies (e.g. draw boundary chains as smoothed polylines on canvas). Must look like colouring-book line art, not noise.
- **color:<area>**: fill that area with a clean colour: its region-mean colours lightly smoothed (median/mode filter within the area to remove speckles), like coloured-pencil base layer; lines stay on top.
- **shading**: within coloured areas, darken shadow value bands and blend toward `smooth` (soft gradients); lines fade to 40%.
- **final**: the exact original pixels.
Area building: merge regions into areas by colour similarity (Lab ΔE) + adjacency + position, preferring large coherent zones (sky, sea, ground, main subject…). Background-ish areas (touching top/border, large, low detail) first; the subject and small details last.

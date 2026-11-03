# DrawMaster

Drawing instructor: upload an image, get a step-by-step drawing sequence computed from YOUR image in the browser.

- `engine.js` — local image processing: Gaussian/Sobel/Canny edges, k-means palette in CIE Lab, connected regions with role heuristics, value bands, texture map, composition guides, geometric fits, cumulative stage rendering (final stage = exact original).
- `drawmaster.html` — studio: reference + stage viewers, timeline, zoom/pan sync, fullscreen, before/after, layer toggles, "what's new" overlay, region correction (role/label/order/merge), PNG export per stage, materials checklist, per-stage teaching (EN/FR/AR).
- Claude (vision) only personalises teaching text and suggests region roles; it never creates the images. Model toggle (Haiku/Sonnet/Opus 5.5) + effort slider. Works without AI (generic guidance).
- See `CONTRACT.md` for the module interface.

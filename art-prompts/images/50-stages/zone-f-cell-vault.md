# 50 — Zone F: Cell Vault (stage backgrounds)
# Living walls of pulsing green cells, fleshy folds, tissue and pores.
# Seed slots: wallpaper 16601, vertical poster 16602.

## cell-vault-wallpaper — Wide wallpaper: interior of a living fortress, undulating green cell-tissue walls
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, widescreen 16:9 side-scrolling arcade composition, subtle CRT scanline glow; ultra-detailed large-format background art with clean vector shapes and pixel-art texture accents. The interior of a colossal living fortress grown rather than built: the entire wide hall is lined with walls of enormous translucent green cells, each one a rounded blob the size of a room with a pale glowing nucleus suspended at its center, thousands of them packed in a honeycomb that ripples with a slow peristaltic wave frozen mid-contraction. Between the cell rows run thick fleshy folds and ridges of darker organic tissue, outlined in near-black green, with clusters of breathing pores that flare open in ragged star shapes, each exhaling a faint spore-mist glow. Long membrane strands stretch ceiling to floor like gutted cables, strung with pulsing nodes of sickly yellow-green light that trace circulation paths through the tissue. In the deep background the hall narrows into a sphincter-like archway of concentric muscle rings, half-contracted, lit from within by a wet amber-green radiance. A raised dais of hardened callus plate sits mid-floor, ringed by shadow. The palette is a committed swamp of muted forest greens and pale nucleus glows with warm amber veins, laid over lifted deep-navy-black shadow, never pure black. No foreground characters, no text, no letters, no user interface elements.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 4.5 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 40 | 50 | 30 |
| seed | 16601 | 16601 | 16601 | 16601 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, red gore, blood, human organs, medical anatomy, teeth, eyes staring, insect swarm, pure black background, watermark, text, blurry, slimy specular highlights, frame border, letterboxing`

**Notes:** Color reference: cell walls #2a4434 to #385a44, nucleus glow pale ~#c8e0b0, amber veins ~#e8a030 accents. The "grown not built" + "muted forest greens" framing keeps the vault uncanny-alive without tipping into gore — the negative list is the important half of this prompt for sd3.5, which drifts toward wet-red anatomy when it hears "fleshy." flux.2 renders the peristaltic ripple pattern beautifully.

## cell-vault-poster-vertical — Vertical poster: descending throat of the living vault, muscle rings stacked into darkness
**Models:** sd3.5-large, flux.1-dev
**Variation:** 2/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, subtle CRT scanline glow; vertical composition, tall poster framing, ultra-detailed large-format background art with clean vector shapes and pixel-art texture accents. Staring straight down the interior of a vertical organic shaft, the throat of a living fortress: a deep stack of concentric muscle rings, each ring a thick petal-like collar of green tissue with a dark seam where it meets the next, the rings alternating slightly rotated so the shaft reads as a twisted tube disappearing into black-green depths far below. Embedded in each collar, rows of closed pore-valves wait in neat arcs, and fine capillary networks of pale yellow-green light pulse along the inner rims, brighter in the upper rings and dimming ring by ring as the shaft descends. Between the collars hang membranes of stretched tissue, translucent enough to reveal the shadow of further rings behind them, giving the whole throat a layered X-ray depth. From the top of the frame a warm amber biolume drips downward like light poured from a bowl, catching the wet ridges of the first collars in hard pixel-art highlights. Near the bottom, in the darkest visible ring, a single new pair of pore-lights is opening, an amber eye of glow waking in the deep. Committed muted greens, pale nucleus glow, amber accents, lifted deep-navy shadow, never pure black. No text, no letters, no user interface elements.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 896x1152 | 896x1152 | 896x1152 | 896x1152 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 45 | 40 | 30 |
| seed | 16602 | 16602 | 16602 | 16602 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, red gore, blood, tongue, throat anatomy, teeth, human figure, pure black background, watermark, text, blurry, straight untwisted tunnel, rings identical, frame border, letterboxing`

**Notes:** Color reference: collars #2a4434–#385a44 with rim pulse #c8e0b0, waking glow ~#e8a030. The rotated-ring twist is what sells depth in a straight-down tube; flux.1 flattens it if you drop the "alternating slightly rotated" clause. The single waking pore-light at the bottom is the composition anchor — it reads as the vault noticing you.

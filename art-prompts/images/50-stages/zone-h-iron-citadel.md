# 50 — Zone H: Iron Citadel (stage backgrounds)
# Riveted steel fortress interior, amber running lights, pipes and girders.
# Seed slots: wallpaper 16801, vertical poster 16802.

## iron-citadel-wallpaper — Wide wallpaper: cathedral hall inside a riveted steel fortress lit by amber lamps
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, widescreen 16:9 side-scrolling arcade composition, subtle CRT scanline glow; ultra-detailed large-format background art with clean vector shapes and pixel-art texture accents. The interior of a colossal fortress-ship seen as a side-scrolling hall: every surface is heavy riveted steel — colossal plate walls with regular rows of rivet heads, seam welds, and blast doors wide as houses, all drawn in flat gunmetal planes banded with dark outlines. An entire infrastructure of industry crowds the hall: parallel pipes of three different diameters run horizontally at ceiling height with regular flange rings, bundle into elbows and dive into the walls; walkway gratings and cantilevered gantries cross at two levels with sturdy vertical stanchions; overhead, a travelling crane rail disappears into shadow. The light comes from long rows of amber running lamps mounted along the gantries and floor edges, each lamp a small warm disc throwing a conical pool of orange light onto the plating and linking with the next into a receding chain of glow down the length of the hall; between the pools the steel falls to deep blue-black shadow. In the far background a giant pressure hatch dominates the end wall, a circle of concentric locking rings with a single amber viewport winking at its center. Steam bleeds from two valve wheels in slow white ribbons catching the lamp light. Palette of gunmetal greys and dark steel blues with committed warm amber lighting, lifted deep-navy shadow, never pure black. No foreground characters, no text, no letters, no user interface elements.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 4.5 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 40 | 50 | 30 |
| seed | 16801 | 16801 | 16801 | 16801 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, rusted scrapyard, post-apocalyptic debris, cyan blue lighting, green lighting, human workers, pure black background, watermark, text, blurry, cluttered random pipes, melted perspective, frame border, letterboxing`

**Notes:** Color reference: lamp ramp #6a4418 deep shade to #e8a030 hot pool, steel plates ~#4a5468 on navy #0c1a3c. The lamp-chain perspective is the composition engine — flux.2 keeps the receding discs evenly spaced; sd3.5 can smear them, bump guidance to 5.0. "Regular rows," "three diameters," "two levels" deliberately bound the pipe clutter that this genre overflows with.

## iron-citadel-poster-vertical — Vertical poster: interior riser shaft with gantry floors stacked to a distant amber ceiling lamp
**Models:** sd3.5-large, flux.1-dev
**Variation:** 2/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, subtle CRT scanline glow; vertical composition, tall poster framing, ultra-detailed large-format background art with clean vector shapes and pixel-art texture accents. Inside a vertical riser shaft at the core of a riveted steel fortress, viewed straight up from the deck: concentric square gallery floors stack one above another into extreme foreshortening, each level a grating walkway with heavy I-beam edges, knee-braces and a chain-link safety rail, all rendered in flat gunmetal with thick near-black outlines. Massive riveted columns climb through every corner of the shaft, bolted sleeve joints recurring level by level like ruler marks. Bundles of pipe ride the walls between the galleries, bound at intervals with clamps, and every few floors a valve wheel or junction box interrupts them. The light source is a single enormous amber ceiling lamp rig far at the top of the shaft — a squat crown of industrial bulbs — pouring a warm conical glow downward so that the upper galleries burn gold at their edges, the middle floors fall into strong top-lit contrast with long giraffe shadows of the railings thrown across the gratings, and the lowest visible deck near the camera damps into deep blue-steel dusk where only the column joint-plates still catch stray light. A thin wisp of steam drifts diagonally up through the cone, lit from above. The geometric ladder of receding squares pulls the eye helplessly upward toward the lamp. Palette of gunmetal greys and steel blues with one committed amber light, lifted deep-navy shadow, never pure black. No text, no letters, no user interface elements.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 896x1152 | 896x1152 | 896x1152 | 896x1152 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 45 | 40 | 30 |
| seed | 16802 | 16802 | 16802 | 16802 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, skyscraper exterior, glass office floors, elevator interior, blue neon light, human figures, pure black background, watermark, text, blurry, warped non-square galleries, vanishing point off-center, frame border, letterboxing`

**Notes:** Color reference: lamp #e8a030 crown, gradients to #6a4418 in the low dusk, gratings #3c465c. Straight-up architecture with square concentric galleries is a hard perspective ask — keep "concentric square" and "vanishing point centered" in mind when checking flux.1 output; it occasionally tilts the stack. The recurring bolted sleeve joints doubling as ruler marks give scale for free.

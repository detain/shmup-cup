# 50 — Zone A: Azure Verge (stage backgrounds)
# Orbit above a blue planet rim; green-teal continent terrain, dense stars.
# Seed slots: wallpaper 16101, vertical poster 16102.

## azure-verge-wallpaper — wide orbital battlefield wallpaper
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, widescreen side-scrolling arcade composition, subtle CRT scanline glow, ultra-detailed large-format background art with clean vector shapes and pixel-art texture accents. A vast horizontal stage backdrop seen high above a planet: the lower third of the frame is the curved rim of a blue world, deep ocean blue fading into a glowing thin atmosphere line, and across that rim roll continents of fresh green-teal terrain — forest canopies, terraced plateaus, silver rivers catching light. Above the horizon sits the black-blue of near-space, densely scattered with small hard stars in white and pale blue, never pure black. Drifting between the stars and the planet rim are thin veils of cyan haze. Composition reads left-to-right like a scrollable game plane: repeating terrain bands, distant cloud shelves stacked in parallax layers, one enormous Iron Tide fortress-ship silhouette hanging at the far right edge, tiny against the planet, its underlights a pinprick of red. Mood: blue, patient, and about to be invaded. No foreground characters, no text, no letters, no user interface elements.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 4.5 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 40 | 50 | 30 |
| seed | 16101 | 16101 | 16101 | 16101 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, logo, UI elements, pure black background, oversaturated neon, spaceship cockpit, human figures, frame border, letterboxing`

**Notes:** Parallax bands (stars / cloud shelves / terrain rim) make this crop-friendly for menu backplates. Color reference: terrain #8ad0a8, atmosphere cyan, base navy #05070f–#0c1a3c. If the fortress silhouette distracts, regenerate with it removed for a pure environment plate.

---

## azure-verge-poster-vertical — vertical ascent poster over the planet rim
**Models:** sd3.5-large, flux.1-dev
**Variation:** 2/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, subtle CRT scanline glow, ultra-detailed large-format background art with clean vector shapes and pixel-art texture accents, tall vertical poster composition. A downward view through orbit: the top of the frame is deep space — black-blue filled with crisp pixel-star clusters and a faint violet nebula thread — and it gives way, band by band, to the limb of a blue planet arcing across the lower two thirds. Along that curve, green-teal continents, white polar caps and swirling weather systems read like a painted map, edged by a luminous cyan atmosphere line that glows brightest where the sun rises over the rim. A single slim steel-blue fighter dart with a bold blue hull stripe, cyan canopy and orange engine afterglow flies right-to-left in the mid-distance, small, casting a thin shadow across a cloud deck far below. Iron Tide debris — a torn gray hull plate, a dead pod with a dim magenta eye — tumbles in the foreground space band, framing the planet like drifted litter. Mood: serene world overhead, cold war in the orbit around it. No text, no letters, no user interface elements.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 896x1152 | 896x1152 | 896x1152 | 896x1152 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 45 | 40 | 30 |
| seed | 16102 | 16102 | 16102 | 16102 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, logo, UI elements, pure black background, horizontal composition, blurry, distorted ship, frame border, letterboxing`

**Notes:** Vertical format for phone wallpapers / store feature art; the KESTREL here is deliberately tiny for scale. Color reference: hull stripe #3858f0, canopy #38c8e8, glow #f89830, terrain #8ad0a8. Flux.1-dev handles the star-field speckle cleanly but tends to enlarge the ship — keep it as a fallback.

# 50 — Zone G: Prism Labyrinth (stage backgrounds)
# Crystal corridors, triangle-facet walls, stacking cubes, violet light.
# Seed slots: wallpaper 16701, vertical poster 16702.

## prism-labyrinth-wallpaper — Wide crystal-corridor wallpaper: faceted violet maze with glinting walls and floating cubes
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, widescreen 16:9 side-scrolling arcade composition, subtle CRT scanline glow; ultra-detailed large-format background art with clean vector shapes and pixel-art texture accents. A vast subterranean crystal labyrinth: an enormous horizontal corridor whose walls, ceiling and floor are built of giant triangular facets of deep violet crystal, every facet a different flat angle, each catching a hard sliver of lilac light so the whole surface glitters like cut gemstone. Clusters of taller crystal prisms rise from the floor like organ pipes, their edges glowing pale lilac, their cores holding a slow internal violet pulse. In the mid-distance, enormous cubes of crystal stack and un-stack themselves in mid-air, drifting apart and clicking together in a frozen moment of rearrangement, casting sharp rhomboid shadows. The corridor floor is a mosaic of polished facet-plates reflecting the prism clusters upside-down. Beams of refracted light cross the hall diagonally, splitting into thin pink and cyan fans where they pass through a floating shard. Deep in the far background the tunnel narrows into a dark amethyst throat studded with single bright glints, suggesting the maze continues forever. Palette of deep violets with lilac highlight edges, glints of pale gold, everything laid over a lifted deep-navy shadow, never pure black. No foreground characters, no text, no letters, no user interface elements.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 4.5 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 40 | 50 | 30 |
| seed | 16701 | 16701 | 16701 | 16701 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, round pebbles, gravel, ice texture, snow, pure black background, watermark, text, blurry, muddy colors, soft gradients everywhere, single giant crystal only, frame border, letterboxing`

**Notes:** Color reference: crystal #8a48e8, edge glints #c8a0ff, floor-plate navy #0c1a3c. The stacking cubes are the zone's remix gimmick made visible — flux.2 holds their geometry, while sd3.5 sometimes melts touching cubes; keep guidance at 4.5 so facets stay hard-edged. Avoid ice/snow reading: facets must be angular crystal, not frost.

## prism-labyrinth-poster-vertical — Vertical poster: descending shaft of nested rotating crystal rings and rising cubes
**Models:** sd3.5-large, flux.1-dev
**Variation:** 2/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, subtle CRT scanline glow; vertical composition, tall poster framing, ultra-detailed large-format background art with clean vector shapes and pixel-art texture accents. Looking up a colossal vertical shaft inside a crystal labyrinth: the shaft wall is built of concentric hexagonal frames of violet crystal, each ring slightly rotated relative to the one below so the tunnel corkscrews out of sight toward a distant lilac glow at the top. From every ring hang clusters of triangular crystal facets like chandeliers, their edges wired with pale light, casting a rain of small rhombus reflections down the shaft. A column of crystal cubes rises along the center in a slow spiral conveyor, each cube a different size, glowing brighter the higher it travels, the topmost ones dissolving into pure light at the far end of the shaft — the maze assembling itself endlessly. The lowest third of the image is darker: heavy shadowed facets, deep navy voids between them, a few lone sparks drifting down against the current. Veins of magenta light run through the crystal like frozen lightning. The whole column reads as a single luminous throat of geometry, inviting the eye upward forever. Deep violets and electric lilacs over a lifted deep-navy base, never pure black. No text, no letters, no user interface elements.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 896x1152 | 896x1152 | 896x1152 | 896x1152 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 45 | 40 | 30 |
| seed | 16702 | 16702 | 16702 | 16702 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, glass bottle, diamond jewelry, city skyline, pure black background, watermark, text, blurry, messy geometry, warped perspective, hexagon rings melting, frame border, letterboxing`

**Notes:** Color reference: rings #8a48e8, top glow #c8a0ff, magenta veins #ff5aa0 accents. The corkscrew reads best at vertical format; flux.1 tends to warp the concentric rings near the vanishing point — the "rotated relative to one another" clause is load-bearing. Great as a mobile-crop zone card.

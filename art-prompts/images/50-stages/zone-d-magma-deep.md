# 50 — Zone D: Magma Deep (stage backgrounds)
# Erupting peaks, lava lake ramps, cave systems, brick walls.
# Seed slots: wallpaper 16401, vertical poster 16402.

## magma-deep-wallpaper — erupting peaks and lava-lake wallpaper
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, widescreen side-scrolling arcade composition, subtle CRT scanline glow, ultra-detailed large-format background art with clean vector shapes and pixel-art texture accents. A volcanic interior laid out horizontally: the far wall of a colossal magma cavern with a ceiling lost in orange smog, jagged erupting peaks throwing fountains of bright lava in long parabolas against a smoky amber sky. Below the peaks, a lava lake crosses the bottom third of the frame, its surface a gradient ramp from dark cooled crust umber to glowing tangerine to molten yellow-white at the vents, broken by drifting rafts of black basalt. Columns of heat light the whole scene from underneath, so every rock silhouette is rimmed orange on its belly. In the middle distance, a bridge of crude brick — warm terracotta masonry — spans a chasm, and tiny industrial gantries cling to the cavern wall strung with dull red warning lamps. Ash motes drift through shafts of orange haze. Mood: the planet's furnace room, industrially occupied. No foreground characters, no text, no letters, no user interface elements.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 4.5 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 40 | 50 | 30 |
| seed | 16401 | 16401 | 16401 | 16401 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, logo, UI elements, blue sky, snow, ocean, people, castle, pure black background, blurry, frame border, letterboxing`

**Notes:** Lava must read as a ramp, not a uniform orange — negative "blue sky" prevents the vents going cold. Color reference: crust #8a2c0a → glow #e87a1c, brick #b0704a. The gantries are the Iron Tide's foothold; the Cinder Bastion boss arena uses the same brick language.

---

## magma-deep-poster-vertical — vertical cave-shaft descent poster
**Models:** sd3.5-large, flux.1-dev
**Variation:** 2/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, subtle CRT scanline glow, ultra-detailed large-format background art with clean vector shapes and pixel-art texture accents, tall vertical composition looking straight down a magmatic cave shaft. The shaft is a rough oval throat of stacked black basalt shelves and warm terracotta brick strata, narrowing toward the bottom of the frame where a lava lake glows like a fallen sun — a light source so strong that every ledge overhead is rimmed in tangerine and the air itself gradients from smoky amber near the lake to deep maroon dark at the top. Magma drips in slow bright threads from the ceiling shelves, splashing onto ledges below. Stuck across the shaft at mid-height, a broken elevator gantry hangs by one cable, its warning lamp still swinging and throwing a slow arc of red light across the rock. Far down, small against the glow, a steel-blue dart fighter with a cyan canopy dives along the lit wall, orange afterglow trailing, headed for the lake. Mood: descending into heat with no way back up. No text, no letters, no user interface elements.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 896x1152 | 896x1152 | 896x1152 | 896x1152 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 45 | 40 | 30 |
| seed | 16402 | 16402 | 16402 | 16402 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, logo, UI elements, horizontal composition, daylight, green plants, water waterfall, people, blurry, pure black background, frame border, letterboxing`

**Notes:** Single strong bottom light makes this crop well as a loading screen. Color reference: lava #8a2c0a→#e87a1c core near #fff080, brick #b0704a, ship #3858f0/#38c8e8/#f89830. Flux.1-dev renders the drip-threads crisply; sd3.5 tends to fuse them into blobs — check the ceiling band.

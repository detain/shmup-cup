# 50 — Zone C: Dune Expanse (stage backgrounds)
# Twin suns, dune silhouettes stacked to the horizon, heat haze.
# Seed slots: wallpaper 16301, vertical poster 16302.

## dune-expanse-wallpaper — twin-sunset dune sea wallpaper
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, widescreen side-scrolling arcade composition, subtle CRT scanline glow, ultra-detailed large-format background art with clean vector shapes and pixel-art texture accents. An endless desert under two suns, laid out as stacked horizontal dune silhouettes receding to a far horizon: the nearest dune band is deep burnt umber, each band behind it lighter and hotter — rust, then burnt orange, then a pale cream sky. The great sun, a wide pale-cream disc, sits low center-right, visibly flat-bottomed where the heat haze bends it; a second, much smaller orange sun rides just above the horizon to its left, twin shadows falling from both. Rippling vertical shimmer columns distort every dune edge; a slow dust devil spirals in the middle distance, a thin rust-colored funnel carrying orbiting pebbles. High in the cream sky, the dark negative-space silhouettes of buried fortress-ships bulge beneath the sand like waiting whales, cracking the dune crust into long fault lines. Mood: beautiful, oven-hot, and hiding something enormous. No foreground characters, no text, no letters, no user interface elements.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 4.5 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 40 | 50 | 30 |
| seed | 16301 | 16301 | 16301 | 16301 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, logo, UI elements, three suns, purple sky, snow, cactus, people, camels, blurry, pure black background, frame border, letterboxing`

**Notes:** Negative explicitly guards "three suns" — models love adding a third. Color reference: big sun pale cream #fce8b8, small sun orange #f89858, dune bands umber→rust→cream. The buried-whale bulges foreshadow Sandgrave Widow and Dune Worms without showing them.

---

## dune-expanse-poster-vertical — vertical heat-haze canyon poster
**Models:** sd3.5-large, flux.1-dev
**Variation:** 2/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, subtle CRT scanline glow, ultra-detailed large-format background art with clean vector shapes and pixel-art texture accents, tall vertical composition looking up a narrow sandstone canyon toward the twin suns. The canyon walls frame the left and right edges — layered sedimentary rock in rust, clay and burnt amber, striped like a barcode, their tops crumbling into arches. Between them the sky is a vertical gradient from hot pale cream at the top, where the huge flat-bottomed cream sun blazes, down to deep orange near the unseen canyon floor. The whole center column of air shimmers: heat haze drawn as gentle wavy displacement bands, sand streaming downward in thin curtains, a scatter of pebbles orbiting a dust devil that corkscrews up the middle of the frame. Clinging to a ledge at the upper left, the bleached ribcage of some vast old machine, half-buried in a sand slide. Far above, a tiny steel-blue dart fighter with a blue stripe and orange engine glow threads the gap between the walls, flying toward the light. Mood: a furnace with a beautiful exit. No text, no letters, no user interface elements.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 896x1152 | 896x1152 | 896x1152 | 896x1152 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 45 | 40 | 30 |
| seed | 16302 | 16302 | 16302 | 16302 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, logo, UI elements, horizontal composition, green vegetation, water, river, three suns, blurry, pure black background, frame border, letterboxing`

**Notes:** The vertical haze stripes read as "updraft" and suit the zone's erupting-worm beats. Color reference: sun #fce8b8, small sun #f89858, rock bands #b0704a family, KESTREL stripe #3858f0, glow #f89830. Flux.1-dev keeps the barcode strata very clean; watch it darkening the cream sky.

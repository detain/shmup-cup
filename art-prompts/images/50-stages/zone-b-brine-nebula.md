# 50 — Zone B: Brine Nebula (stage backgrounds)
# Teal-violet gas sea, wobbling wave raster, reef tunnel, sand-stone shelves.
# Seed slots: wallpaper 16201, vertical poster 16202.

## brine-nebula-wallpaper — wide gas-sea wave-raster wallpaper
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, widescreen side-scrolling arcade composition, subtle CRT scanline glow, ultra-detailed large-format background art with clean vector shapes and pixel-art texture accents. An oceanic nebula stretched horizontally across the entire frame: rolling gas seas in teal and deep violet that read like water, with every wave crest drawn as a wobbling horizontal raster line, a classic side-scroller water shimmer. Mid-frame a great reef wall rises from the vapor sea — coral-shaped mineral towers in sand-stone tan and pale rose, hollowed with glowing turquoise windows, draped in ribbon weed that streams sideways as if in current. Above, the gas sea meets a ceiling of bruised violet clouds lit from within by slow pink lightning blooms. A shoal of tiny silhouetted mechanical fish drones crosses the far background in perfect formation, riding the current. The whole scene is wet-light: soft cyan highlights on every edge, dark green-teal shadows, a feel of breathing underwater without being underwater. No foreground characters, no text, no letters, no user interface elements.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 4.5 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 40 | 50 | 30 |
| seed | 16201 | 16201 | 16201 | 16201 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, logo, UI elements, pure black background, real ocean, boats, horizon sunset, blurry, frame border, letterboxing`

**Notes:** The "wobbling raster line" phrasing is the load-bearing trick for the zone's signature water shimmer; if SD3.5 renders real waves, strengthen it to "each wave band is a flat dithered stripe with a sinusoidal wobble". Color reference: gas sea teal-violet, reef sand-stone #f0c890, lightning pink #ff5aa0.

---

## brine-nebula-poster-vertical — vertical reef-tunnel descent poster
**Models:** sd3.5-large, flux.1-dev
**Variation:** 2/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, subtle CRT scanline glow, ultra-detailed large-format background art with clean vector shapes and pixel-art texture accents, tall vertical composition looking straight down a reef tunnel. The frame is a throat of coral-like mineral architecture: two opposing walls of sand-stone reef towers, faceted and porous, lean inward and stack toward a distant glowing aperture at the bottom of the image, turquoise light pooling around it. Between the walls the brine nebula flows vertically — ribbons of teal and violet gas pulled into long streamers, scattered with luminous plankton specks, wobbling in horizontal raster bands as they fall. Wedged in a wall hollow at the upper third, the barnacled ribcage of an ancient Iron Tide hull, half-reefed-over, spilling a school of small glowing brood bubbles with dark shapes curled inside. A single pale-mint manta-winged fighter with a green canopy and twin amber thrusters drops through the middle distance, wings level, tiny against the tunnel, its thruster light smearing two short gold streaks. Mood: beautiful, pressurized, and definitely inhabited. No text, no letters, no user interface elements.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 896x1152 | 896x1152 | 896x1152 | 896x1152 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 45 | 40 | 30 |
| seed | 16202 | 16202 | 16202 | 16202 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, logo, UI elements, pure black background, horizontal composition, real coral reef photography, scuba diver, blurry, frame border, letterboxing`

**Notes:** MANTA for scale in a tunnel shot — pairs with the zone's reef-tunnel gameplay. Color reference: hull #c8e0d0, canopy #40d070, thrusters amber, reef #f0c890. If the walls crowd the ship, raise guidance to 5.5 on sd3.5 to tighten composition adherence.

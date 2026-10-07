# 50 — Escape Corridor (stage backgrounds)
# The 90-second run: terrain corridor collapsing behind at ramping speed.
# Seed slots: wallpaper 17101, vertical poster 17102.

## escape-corridor-wallpaper — Wide wallpaper: canyon corridor mid-collapse, dust-and-fire wall devouring the far end
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, widescreen 16:9 side-scrolling arcade composition, subtle CRT scanline glow; ultra-detailed large-format background art with clean vector shapes and pixel-art texture accents. A side view down a long terrain corridor in the act of self-destruction: the canyon walls are cross-sections of mixed geology — banded strata of sand-stone cream, dark basalt seams and veins of pale mineral — and along their entire visible length the rock is failing, enormous slabs tilting out of the walls mid-fall, some already snapped and toppling end over end into the corridor floor. At the far left of the frame the collapse has a face: a rolling wall of dust, debris and dull furnace-orange light devouring the corridor from that end, its leading edge a cauliflower of brown-grey cloud lit from within by chain detonations, chunks of rock silhouetted inside it, a surge of orange sparks and ash outrunning the cloud in a fan-shaped blast wave. The near two-thirds of the corridor behind the collapse is still intact but already doomed — the floor tiles of rock are beginning to crack in lightning patterns, fissures branching forward of the wave, thin jets of steam stabbing from new seams. The corridor ceiling on the right side remains solid, giving the composition a safe lane that narrows brutally toward the destruction. Debris streams diagonally away from the blast face, all particles obeying the same vector. Palette of the game's earth golds and rusts torn by furnace orange and brown-grey dust, over a lifted deep-navy shadow, never pure black. No characters, no text, no letters, no user interface elements.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 40 | 50 | 30 |
| seed | 17101 | 17101 | 17101 | 17101 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, earthquake city, buildings, modern structures, volcano lava flow, explosion mushroom cloud nuclear, fire spreading forward past debris, pure black background, watermark, text, blurry, safe corridor fully intact, calm scene, frame border, letterboxing`

**Notes:** Color reference: strata cream ~#f0c890, basalt seams navy, blast interior furnace orange echoing the explosion ramp #f8b030→#f06820→#c83018. Composition rule that must survive generation: destruction at the FAR end, safe-but-cracking lane at the NEAR end — if the models center the blast, the image loses its "run" reading, regenerate. A stray non-English character slipped into drafting ("拱"); verified removed from the final prompt above. flux.2 renders the tilting slab field with excellent depth layering.

## escape-corridor-poster-vertical — Vertical poster: looking up a collapsing shaft toward a closing rectangle of light
**Models:** sd3.5-large, flux.1-dev
**Variation:** 2/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, subtle CRT scanline glow; vertical composition, tall poster framing, ultra-detailed large-format background art with clean vector shapes and pixel-art texture accents. The escape rendered as a vertical ascent: looking straight up inside a colossal rectangular shaft that was clearly once a corridor, its four walls of banded rock and buried fortress plating now peeling inward — great shelves of stone and steel curling off the walls and falling toward the viewer, shrinking in the distance as they drop, motion-smeared at their edges. At the very top of the shaft, the exit is a small bright rectangle of pale gold daylight, visibly narrower than it should be, framed by two slabs of the fortress that are sliding together like closing jaws; a few thin fingers of light pierce down the shaft from the gap, each one lit with floating dust. Below the closing exit, the dark of the shaft is not empty: a broad glow of furnace orange and brown smoke is rising up from the bottom of the frame — the collapse has a head here, its light staining the lowest falling debris from beneath, silhouette-ing every tumbling slab in the lower third against the fire. So the image is trapped between two squeezes: fire rising from below, daylight shutting above, and a central lane of still-open shaft where the falling rock and rising smoke refuse to meet. Palette of earth golds, fortress-plate greys, furnace orange below and pale gold above, lifted deep-navy shadow, never pure black. No characters, no text, no letters, no user interface elements.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 896x1152 | 896x1152 | 896x1152 | 896x1152 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 45 | 40 | 30 |
| seed | 17102 | 17102 | 17102 | 17102 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, mine elevator, ladder, well, sky clouds visible, open wide exit, exit fully closed, pure black background, watermark, text, blurry, horizontal composition, viewer at ground level, frame border, letterboxing`

**Notes:** Color reference: exit gold ~#f8f070, jaws plating grey with amber rivets, rising fire #e87a1c→#c83018 glow. The pincer story — exit closing up, fire climbing up — is the entire 90-second timer translated to one frame; check both models preserve the SMALL exit and the DARK bottom glow simultaneously (sd3.5 likes to blow out the top rectangle, killing the claustrophobia).

# 30 — Extra Boss 12: EMBER & FROST TWINS (paired fire/ice heads)
# One yoke, two serpentine heads — fire on top, ice below; thermal-warfare boss art.
# Seed slots: 13201-13203.

## eft-reveal — both heads rearing, fire above ice below
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/3 of 3

```text
Horizontal shoot-up boss reveal, ultra-detailed 16-bit-inspired concept art: twin serpent heads rearing from one shared riveted steel yoke at the right edge of a deep-navy battlefield — the upper head is ember, a plated drake exhaling ribbons of orange-white fire with cooling-lava cracks glowing along its snout, the lower head is frost, its pale blue-white plating rimed with ice, breath a cone of sparkling vapor that frosts the yoke where it passes. Between them the yoke turns on a brass ring, steam where the two breaths meet. The contrast is the composition: warm ramp from pale yellow through orange to deep red above, cold ramp from near-white through sky blue to violet-ice below, both outlined in heavy near-black navy. Sparse stars, one steel-blue player dart with cyan canopy dwarfed at the left margin. Bold dark outlines, saturated limited palette, subtle CRT scanline glow, widescreen 16:9 side-scrolling arcade frame.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 13201 | 13201 | 13201 | 13201 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text artifacts, watermark, blurry, single head, matching colors, pure black background`
**Notes:** Fire reference ramp #fff080→#f8b030→#f06820→#c83018; ice keep #9adcf0 to #4060d0 — the split warmth/cold is the whole read, flux.2-dev holds both palettes cleanly.

## eft-weakpoint — the shared yoke core between jaws
**Models:** sd3.5-large, flux.2-dev
**Variation:** 2/3 of 3

```text
Macro boss weak-point detail for a horizontal shoot-up, ultra-detailed pixel-inspired concept art: the shared yoke between a fire serpent head and an ice serpent head, camera straight down the neck junction where both coils meet a single armored drum. The drum's brass hatch stands open from heat-warped hinges, and inside spins a bicolored core — its upper half molten orange with floating ember beads, lower half crystalline blue shedding frost motes — the two halves separated by a visible seam of white steam lightning. Soot and rime creep outward along both neck rings. Deep-navy backdrop, bold dark outlines, saturated limited palette, subtle CRT scanline glow, tight square macro composition.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.5 | 3.5 | 4.0 | 4.0 |
| steps | 34 | 40 | 45 | 30 |
| seed | 13202 | 13202 | 13202 | 13202 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text artifacts, watermark, blurry, single color core, plain flesh, pure black background`
**Notes:** The half-molten, half-frozen core seam is the aiming point — steam lightning at the boundary gives sd3.5-large a high-contrast subject.

## eft-warning — temperature war paint: half the stars go red
**Models:** flux.1-dev, sd3.5-large
**Variation:** 3/3 of 3

```text
Horizontal shoot-up warning frame, ultra-detailed 16-bit-inspired concept art, no text and no letters: a deep-navy playfield splitting into thermal halves before the boss arrives — the upper air shimmers with descending ribbons of ember-orange heat distortion while frost crystals grow upward across the lower air in pale blue needles, the two fronts converging on a diagonal seam of swirling steam across the middle. At the right margin two dark head silhouettes press into frame, jaws slightly open, one breath of fire and one breath of vapor just beginning. A tiny steel-blue player dart with cyan canopy threads the seam center, engine flare orange against the cold. Bold dark outlines, saturated limited palette, subtle CRT scanline glow, widescreen 16:9 arcade frame.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 13203 | 13203 | 13203 | 13203 |

**Negative:** (sd3.5/qwen only) `text, letters, watermark, photorealistic, 3d render, blurry, uniform temperature, pure black background`
**Notes:** The warning is expressed as weather, not text — flux.1-dev renders the opposing distortion effects with very clean separation.

# 30 — Boss 05: SQUALL STEED (SS-05)

Vast plate-and-cable seahorse riding a storm front, chest plates hinged open over a
storm-cell heart. Zone E: roiling cloud deck, saw-tooth snow ridges, slanting rain.
Seed slots 125xx.

## ss05-reveal — cresting the cloud deck
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/3 of 3

```text
Majestic storm boss reveal in widescreen arcade key art, the SQUALL STEED, a fortress-sized mechanical seahorse rearing up out of a roiling grey-violet cloud deck, its long snouted head plated in cold steel-blue with a mane of loose tensioned cables streaming sideways in the gale, segmented neck rings creaking open as its chest armor falls away on heavy hinges exposing a swirling captive thunderhead glowing white-blue inside the ribcage cage, coronet spikes along the back lifting sheets of rain, a curled counterbalance tail vanishing into cloud below, saw-tooth snow ridges of a mountain range cutting the lower background under slanting silver rain streaks, a tiny steel-blue dart fighter with orange exhaust climbing the updraft at the left edge for scale, lightning forking between the mane cables, deep navy storm shadows never pure black, SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, ultra-detailed large-format art with pixel texture accents, subtle CRT scanline glow, no text.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 34 | 45 | 50 | 36 |
| seed | 12501 | 12501 | 12501 | 12501 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, real seahorse, organic creature, cute pony, ocean water splash, modern helicopter, pure black background`
**Notes:** Chest thunderhead is both silhouette signature and core. Keep the snout mechanical, cables for the mane.

## ss05-weakpoint — the caged thunderhead heart
**Models:** sd3.5-large, flux.2-dev
**Variation:** 2/3 of 3

```text
Dramatic boss core close-up, deep inside the opened chest cavity of the SQUALL STEED, a compact furious thunderhead storm cell suspended in a rotating cage of eight curved steel ribs, the mini-cloud churning white-blue with repeated internal lightning flashes that strobe the surrounding rib surfaces between silver highlight and sapphire shadow, arcs jumping from the cage to two anchor rods above like tesla terminals, droplets of frozen rain glittering in the air inside the cavity, beyond the cage the dark tunnel of the steed's throat fading to navy, at the very edges of frame the blurred tips of pink enemy bullets arriving from off-screen and evaporating in the discharge heat, awe and danger, centered composition with strong radial energy, bold dark outlines, saturated limited palette, SNES-era 16-bit pixel art inspired concept rendering at ultra-detailed quality, pixel-cluster shading accents, subtle CRT scanline glow, no text.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 34 | 45 | 45 | 36 |
| seed | 12502 | 12502 | 12502 | 12502 |

**Negative:** (sd3.5/qwen only) `photorealistic weather, 3d render, text, watermark, human figure in cloud, face in cloud, anatomy organs, gore, pure black background`
**Notes:** Ribs opening/closing is the phase tell — capture the mid-open state. Storm glow cool to contrast pink bullets.

## ss05-warning — lightning-flash silhouette
**Models:** flux.1-dev, sd3.5-large
**Variation:** 3/3 of 3

```text
Single-frame lightning reveal, a black storm sky torn by one colossal white-violet lightning bolt that for one instant prints the SQUALL STEED as a pure silhouette rearing across the entire width of the frame, seahorse profile unmistakable, snout, coronet spikes, cable mane spikes and curled tail cut in razor edges against the branching flash, rain rendered as thousands of slanted silver lines, the silhouette holds almost no internal detail, only two cold blue eye slits and the glowing chest cage reading through the dark shape like lanterns, bottom-left corner a pinprick orange engine streak of a fighter falling through the frame, high-contrast monochrome storm palette of black-navy, silver and violet with exactly two warm accents, graphic power, bold dark outlines, SNES-era 16-bit pixel art inspired concept rendering, widescreen arcade composition, subtle CRT scanline glow, no text, no letters.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 12503 | 12503 | 12503 | 12503 |

**Negative:** (sd3.5/qwen only) `text, banner, letters, photorealistic photo, 3d render, watermark, detailed armor visible, pure black background, rainbow palette, blurry`
**Notes:** The flash-frame IS the warning beat. Wide crop for loading screens; keep bolt branches out of the silhouette core.

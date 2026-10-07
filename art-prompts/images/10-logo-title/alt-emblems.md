# 10 — Logo & Title: Alternate Emblem Styles

Badge/crest explorations, mostly text-free so flux models shine. One entry carries
the small ribbon word "SHMUP CUP" → qwen-image for that one.

## alt-emblem — squadron patch with crossed trails
**Models:** flux.1-dev, sd3.5-large
**Variation:** 1/4 of 4

```text
Military squadron patch emblem design rendered as flat retro arcade vector art, a circular badge with a thick navy border ring, inside the ring two tiny stylized fighters crossed in an X at the center, a steel-blue dart with cyan canopy crossing over a pale-mint manta-wing craft with a green canopy, behind them two orange engine trails cross diagonally filling the badge like ribbon, above the crossed ships a single golden capsule star, the navy ring decorated with small evenly spaced gold rivet dots, deep-navy field inside the badge, no text anywhere, bold dark outlines, saturated limited palette of blue, mint, orange, gold and navy, crisp 16-bit pixel-art-inspired shapes with clean vector edges, centered symmetrical composition.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 10031 | 10031 | 10031 | 10031 |

**Negative:** (sd3.5/qwen only) `text, letters, numbers, photorealistic, 3d render, embroidery fabric texture, watermark, blurry, asymmetric, pure black background`
**Notes:** Keep it vector-flat; sd3.5 likes adding cloth texture here — fight it with guidance ≤5 plus the fabric negative.

## alt-emblem — iron tide faction sigil
**Models:** flux.2-dev, flux.1-dev
**Variation:** 2/4 of 4

```text
Menacing faction sigil emblem, flat arcade vector design, a front-facing stylized mechanical fish skull formed from clean geometric armor plates, jagged jaw segments opening into a dark circular void at the center, three thin antennae-like gun barrels rising from the crown, the whole plate skeleton in gunmetal blue-grey with a near-black navy outline, lit from inside the open throat by a sinister pink-red glow, arranged on a vertical banner-shaped shield of deep violet-navy with a subtle wave raster pattern of thin teal lines across it, tiny rivet details, no text, limited saturated palette, bold silhouettes, SNES-era 16-bit concept art mood with pixel texture accents, ominous and regal, centered composition.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 896x1152 | 896x1152 | 896x1152 | 896x1152 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 10032 | 10032 | 10032 | 10032 |

**Negative:** (sd3.5/qwen only) `text, letters, photorealistic, 3d render, gore, real fish, blood, watermark, blurry, cute cartoon, googly eyes, pure black background`
**Notes:** Galvanic Maw-derived enemy faction crest; glow anchor #ff3a3a throat, hull gunmetal over #0c1a3c.

## alt-emblem — black hole bomb crest
**Models:** flux.1-dev, sd3.5-large
**Variation:** 3/4 of 4

```text
Powerful relic emblem on a square navy plaque, a three-armed spiral vortex rendered as three smooth curved blades of light in violet, indigo-blue and steel-blue swirling clockwise into a perfectly circular pitch-dark core, the rim of the vortex edged with a thin lilac glow, small pink and gold bullet sparks caught spiraling inward along the arms, set against a flat deep-navy background plate with a thin golden border, faint radial scratch lines suggesting implosion, bold dark outlines, saturated limited palette, clean vector shapes with crisp pixel-art texture accents, SNES arcade item iconography, perfectly centered, no text.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 10033 | 10033 | 10033 | 10033 |

**Negative:** (sd3.5/qwen only) `text, photorealistic, 3d render, real galaxy, astronomy photo, nebula photo, watermark, blurry, four arms, two arms, pure black background`
**Notes:** Exactly three arms matters — arms #b060f0/#6040d0/#3060b0, rim #d8b0ff, core #080410 (the only allowed near-black is the core disc).

## alt-emblem — champion crest with ribbon name
**Models:** qwen-image, flux.2-dev
**Variation:** 4/4 of 4

```text
Ceremonial arcade champion crest illustration, at its heart a golden trophy-shaped shield bearing a tiny steel-blue dart fighter emblem in relief, flanked by two spread mechanical wings made of layered gunmetal armor feathers with amber rivet lights, below the shield a curved golden ribbon banner displaying the exact words "SHMUP CUP" in clean navy block capitals, small pink and violet gem bullets set like decorative studs along the wing joints, deep midnight navy background with a soft upward spotlight of pale gold, subtle scanline shimmer, saturated limited palette, bold dark outlines, SNES-era 16-bit inspired concept rendering with clean vector shapes and pixel-art texture accents, symmetrical heraldic composition, no text other than the ribbon.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 45 | 36 |
| seed | 10034 | 10034 | 10034 | 10034 |

**Negative:** (sd3.5/qwen only) `garbled text, misspelled letters, extra letters, missing letters, photorealistic, 3d render, watermark, signature, blurry, pure black background, organic bird wings`
**Notes:** For victory screens and leaderboard badges. If the ribbon text smudges on flux.2-dev, fall back to qwen-image at the same seed.

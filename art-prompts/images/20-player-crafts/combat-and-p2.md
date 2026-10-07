# 20 — Player Crafts: Combat Pair & Player-2 Palette

Both fighters together, plus the P2 channel-swap variants (red-orange stripe, gold
canopy, blue engine glow on the kestrel frame).

## combat-duo — wingmen in a bullet storm
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/3 of 3

```text
Epic co-op arcade battle scene, two prototype fighters flying echelon formation left to right across a widescreen side-scrolling battlefield, in front the steel-blue KESTREL dart with a bold blue fuselage stripe, glowing cyan canopy and streaming orange engine afterglow, tucking behind and below it the flat pale-mint MANTA ray-wing fighter with green canopy glow and twin amber thrusters, both craft weaving through a slow glittering lattice of pink, crimson and violet round bullets with bright cores and dark rims fired from a hulking mechanical fish fortress silhouette pressing in from the right edge, golden point-sparkles spraying where a grazed drone bursts in orange-white flame, deep navy space washed with teal nebula light, SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, ultra-detailed large-format key art, subtle CRT scanline glow, no text.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 34 | 45 | 45 | 36 |
| seed | 11201 | 11201 | 11201 | 11201 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, visible pilots, modern jets, same colored ships, pure black background, chaotic clutter`
**Notes:** The co-op money shot. Keep ships clearly separated in depth; flux.2-dev handles two distinct silhouettes best.

## combat-duo — boss crossfire pocket
**Models:** sd3.5-large, flux.2-dev
**Variation:** 2/3 of 3

```text
Close-quarters arcade bullet-hell moment rendered as large-format concept art, both player fighters inside the glowing ribcage of a spiral bullet pattern, concentric rings of pink and violet bullets with white-hot cores rotating around a massive dark crystalline boss segment at the right, the KESTREL steel-blue dart rolling to slip through a gap between ring arms, cyan canopy flare and a long orange trail bending with the roll, the MANTA sliding flat beneath another ring using its wide ray-wings for lift, green canopy lit from below by bullet glow, amber thrusters pulsing, tiny gold shrapnel points scattering, background deep navy with radial light bloom and drifting glass-like shards, bold dark outlines, saturated limited palette, SNES-era 16-bit inspired rendering with clean vector shapes and pixel texture accents, subtle CRT scanline glow, no text.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 34 | 40 | 45 | 36 |
| seed | 11202 | 11202 | 11202 | 11202 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, visible pilots, laser beams grid, messy overlapping bullets merging into noise, pure black background`
**Notes:** Bullet rings must stay individually readable — drop guidance to 4.5 on sd3.5 if the lattice fuses.

## combat-duo — retreat cover each other
**Models:** flux.2-dev, sd3.5-large
**Variation:** 3/3 of 3

```text
Emotional arcade key art of a fighting retreat, the damaged KESTREL limping screen-left with its orange engine glow flickering and stuttering, thin black smoke ribbon trailing, cyan canopy cracked but lit, while the MANTA swings its flat pale-mint ray-wings around behind it in a defensive arc, thrusters burning hot amber, placing its own hull between the wounded partner and a pursuing wall of crimson bullets with dark rims that fills the right edge of the frame like a blood-red tide, a single force-field ellipse shimmer of cyan light blooming off the MANTA's wings where a glancing shot hits, deep navy void with a cold teal rim of a distant planet below, rim lighting sculpting both silhouettes, SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, ultra-detailed large-format composition, subtle CRT scanline glow, no text.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 34 | 45 | 50 | 36 |
| seed | 11203 | 11203 | 11203 | 11203 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, explosions fireballs everywhere, visible pilots, destroyed hull debris chaos, pure black background`
**Notes:** Wide cinematic for the story page. Story: the Verge is blue and patient — protect the pair, not the spectacle.

## p2-palette-swap — kestrel crimson channel plate
**Models:** flux.1-dev, sd3.5-large
**Variation:** 1/3 of 3

```text
Video game spacecraft concept plate, the second-player variant of the KESTREL dart fighter rendered as a clean three-quarter side view floating centered on a flat deep-navy studio background, identical sleek dart geometry and heavy navy outline as the prototype but with its color channels swapped for player two, the fuselage stripe now a bold red-orange band running the full length, the bubble canopy glowing warm gold instead of cyan, the engine afterglow burning cool electric blue instead of orange, subtle red under-glow reflecting on the steel-blue hull panels, crisp specular highlights on the spine, no text, no annotations, bold dark outlines, saturated limited palette, ultra-detailed concept rendering with clean vector shapes and pixel-art texture accents, subtle CRT scanline glow.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 11211 | 11211 | 11211 | 11211 |

**Negative:** (sd3.5/qwen only) `text, annotations, labels, modern fighter jet, visible pilot, photorealistic, 3d render, watermark, blue stripe, pure black background`
**Notes:** P2 swap: stripe → red-orange, canopy → gold, glow → blue. Verify none of the P1 colors leak back in.

## p2-palette-swap — manta ember channel plate
**Models:** flux.1-dev, sd3.5-large
**Variation:** 2/3 of 3

```text
Video game spacecraft concept plate, the second-player variant of the MANTA flat ray-winged fighter shown from slightly above at three-quarter angle, centered on a flat deep-navy studio background, its wide manta geometry outlined in heavy near-black green strokes unchanged but the palette re-tuned for player two, the pale mint body panels warmed toward a pale gold-mint sheen, the canopy glowing hot amber-gold instead of green, the twin thrusters burning bright red-orange instead of amber, a thin red-orange racing line painted along each wing spine, faint red under-glow between the wings, no text, no annotations, bold dark outlines, saturated limited palette, crisp vector shapes with pixel-art texture accents, ultra-detailed 16-bit inspired concept rendering, subtle scanline glow.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 11212 | 11212 | 11212 | 11212 |

**Negative:** (sd3.5/qwen only) `text, annotations, real manta ray, sea creature, photorealistic, 3d render, watermark, green canopy, pure black background`
**Notes:** Manta P2 keeps the silhouette 100% intact — only channel accents move. Compare against manta-showroom v1 at the same seed offset.

## p2-palette-swap — all four heroes line-up
**Models:** flux.2-dev, sd3.5-large
**Variation:** 3/3 of 3

```text
Retro arcade select-screen style line-up artwork of four fighters arranged in a horizontal row across the frame facing right on a flat deep-navy presentation field with faint colored floor glows under each craft, from left to right, player one KESTREL with blue stripe, cyan canopy and orange engine glow, player two KESTREL in the same dart shape with red-orange stripe, gold canopy and blue engine glow, player one MANTA with pale-mint ray-wings, green canopy and amber thrusters, player two MANTA warmed to pale gold-mint with an amber-gold canopy and red-orange thrusters, all four drawn with heavy dark outlines and saturated flat arcade shading, tiny star specks above, mood of a two-player roster ready to launch, bold dark outlines, SNES-era 16-bit pixel art inspired concept rendering, ultra-detailed clean vector shapes with pixel-art texture accents, subtle CRT scanline glow, no text, no portraits, no boxes.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 32 | 45 | 45 | 36 |
| seed | 11213 | 11213 | 11213 | 11213 |

**Negative:** (sd3.5/qwen only) `text, ui boxes, frames, portraits, numbers, photorealistic, 3d render, watermark, ships overlapping, inconsistent silhouettes, pure black background`
**Notes:** Four-ship coherence is tough — flux.2-dev first, check each pair shares geometry exactly. Banner crop for the co-op feature page.

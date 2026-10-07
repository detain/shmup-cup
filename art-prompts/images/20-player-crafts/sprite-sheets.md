# 20 — Player Crafts: Sprite Sheets

Grid sheets on flat deep-navy, extraction-friendly. No perspective, no shadows, no
background gradients. K3 kernel.

## kestrel-sprite-sheet — in-game pose grid
**Models:** flux.1-dev, sd3.5-large
**Variation:** 1/3 of 2

```text
Retro 16-bit video game sprite sheet, a neat grid of eight poses of the same small steel-blue dart-shaped fighter with a blue fuselage stripe, cyan canopy and orange engine glow, arranged in two rows of four on a completely flat deep-navy background, the poses being level flight, slight nose-up tilt, slight nose-down tilt, left bank showing foreshortened wing, right bank mirror, damage flicker pose rendered with thin dark scuff marks, engine-boost pose with a longer two-tone orange exhaust streak, and a launch pose with a white flash ring at the rear, every sprite drawn in crisp pixel clusters with 2-pixel near-black navy outlines, flat saturated fills with simple three-step shading ramps, consistent scale and orientation across the grid, no anti-aliasing, no drop shadows, no background gradients or stars, generous empty navy margin between sprites, arcade sprite art.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 11301 | 11301 | 11301 | 11301 |

**Negative:** (sd3.5/qwen only) `overlapping sprites, drop shadows, background gradient, perspective distortion, anti-aliasing, photo background, text, labels, inconsistent ship sizes, different ships, blurry, photorealistic, 3d render, watermark, pure black background`
**Notes:** For sheet extraction, generate at 1152x896 then downscale; expect to hand-clean grid spacing. Stripe #3858f0, canopy #38c8e8.

## kestrel-sprite-sheet — hi-res master sheet
**Models:** flux.2-dev, sd3.5-large
**Variation:** 2/3 of 2

```text
High-resolution master sprite sheet for a horizontal arcade shooter, twelve large clean renderings of the KESTREL steel-blue dart fighter with bold blue stripe, cyan canopy and orange afterglow laid out on a wide flat deep-navy canvas in a tidy 4-by-3 grid with equal gutters, top row four progressively hotter exhaust states from idle ember to full burn trail, second row the hull from exact side, three-quarter low, three-quarter high and true rear views, third row damage tiers from light scuffs to smoking armor cracks to a critical state with flickering shield sparks, all cells using identical lighting direction from above, bold dark outlines, flat saturated arcade fills with subtle pixel-cluster texture accents on the highlights only, precise consistent scale between cells, no shadows cast on the background, no text, no numbers, no borders around cells, documentation quality.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 34 | 45 | 50 | 36 |
| seed | 11311 | 11311 | 11311 | 11311 |

**Negative:** (sd3.5/qwen only) `overlapping sprites, uneven sprite sizes, shadows on background, gradient background, cell borders, labels, numbers, perspective skew, blurry, text, photorealistic, 3d render, watermark, pure black background`
**Notes:** 1536x640 favors a 4x3 sheet. Use for website documentation and as the master reference for the pixel team.

## manta-sprite-sheet — in-game pose grid
**Models:** flux.1-dev, sd3.5-large
**Variation:** 1/3 of 2

```text
Retro 16-bit video game sprite sheet, a grid of eight poses of the same flat pale-mint manta-ray-shaped starfighter with a small green canopy, amber twin thrusters and a heavy near-black green outline, arranged in two rows of four on a completely flat deep-navy background, the poses being level glide, gentle nose-up, gentle nose-down, left wing-dip bank, right wing-dip bank, damage flicker with dark scuffs along a wing spine, boost pose with stretched red-amber exhaust twin plumes, and a wide-wing brake pose with thin white air-brake sparks trailing the wingtips, crisp pixel-cluster drawing, 2-pixel near-black outlines, flat saturated fills with three-step shading, no anti-aliasing, no shadows on the background, no gradients or stars in the field, even spacing between all cells, consistent scale and silhouette, arcade sprite art.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 11302 | 11302 | 11302 | 11302 |

**Negative:** (sd3.5/qwen only) `overlapping sprites, drop shadows, background gradient, real manta ray, animal texture, visible fish eye, perspective distortion, anti-aliasing, text, labels, blurry, photorealistic, 3d render, watermark, pure black background`
**Notes:** Body #c8e0d0, canopy #40d070. The brake-pose sparks are the one place extra fx are allowed on the sheet.

## manta-sprite-sheet — hi-res master sheet
**Models:** flux.2-dev, sd3.5-large
**Variation:** 2/3 of 2

```text
High-resolution master sprite sheet for a horizontal arcade shooter, twelve large renderings of the MANTA flat ray-winged fighter in pale mint with a green canopy and amber twin thrusters laid out on a wide flat deep-navy canvas in a tidy 4-by-3 grid with equal gutters, top row the hull from exact side, front-on with wings spread wide, rear-on showing both nozzles, and a top-down plan view showing the full ray silhouette, middle row four banking sequences from neutral to hard left roll with the wing geometry compressing correctly, bottom row damage tiers from clean plating to scuffed edges to cracked wingtips venting amber sparks to a critical smoking state, identical top-lighting in every cell, bold dark outlines, flat saturated arcade shading with pixel-cluster texture accents on highlights only, precise uniform scale, no cast shadows, no text, no numbers, no cell borders, documentation quality.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 34 | 45 | 50 | 36 |
| seed | 11312 | 11312 | 11312 | 11312 |

**Negative:** (sd3.5/qwen only) `overlapping sprites, uneven sizes, shadows, gradient background, cell borders, labels, numbers, animal anatomy, motion blur, text, photorealistic, 3d render, watermark, pure black background`
**Notes:** The plan-view cell is the reference the pixel team needs most — verify it reads as a manta immediately.

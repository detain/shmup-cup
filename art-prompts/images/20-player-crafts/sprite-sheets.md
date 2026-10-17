# 20 — Player Crafts: Sprite Sheets

Grid sheets of equal cells on the K3 v2 key background (flat pure green #00FF00),
extraction-friendly. No perspective, no shadows, no background gradients. The in-game
pose grids follow the v2 targets in `00-style-kernel.md` (5 bank frames, 24×14 class).

## kestrel-sprite-sheet — in-game pose grid
**Models:** flux.1-dev, sd3.5-large
**Variation:** 1/3 of 2

```text
Retro 16-bit video game sprite sheet for a horizontal shooter, a regular grid of ten equal cells in two rows of five with even gutters, every cell showing the same small steel-blue dart-shaped fighter with a blue fuselage stripe, cyan canopy and orange engine glow in side view facing right, on a perfectly flat solid pure bright green chroma-key background. Top row, the five banking frames from left to right: steep climb with the nose tilted up and the upper wing foreshortened, slight climb, level flight, slight dive, steep dive with the nose tilted down and the lower wing foreshortened. Bottom row, the level-flight hull with five engine states from left to right: idle with a short ember glow, small flame, medium flame, long two-tone orange flame, and full boost with a long white-hot core streak. Every sprite drawn as crisp pixel art with a 1-pixel near-black navy outline at its native pixel scale, flat saturated fills with three-step shading ramps lit from the top-left, identical scale, position and silhouette in every cell, no anti-aliasing, no drop shadows, no glow bleeding onto the background, no text, no numbers, no cell borders, arcade sprite art.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 11301 | 11301 | 11301 | 11301 |

**Negative:** (sd3.5/qwen only) `overlapping sprites, drop shadows, background gradient, perspective distortion, anti-aliasing, photo background, text, labels, numbers, cell borders, inconsistent ship sizes, different ships, green tint on the ship, blurry, photorealistic, 3d render, watermark`
**Notes:** v2 target (R3-01): KESTREL is 24×14 in game with 5 bank frames (v1: 16×9, 3 frames) and a separate thruster flame strip; this sheet is the AI design reference for the hand-pixelled sprite. Key #00FF00. Stripe #3858f0, canopy #38c8e8, glow #f89830, outline #1b2a4a.

## kestrel-sprite-sheet — hi-res master sheet
**Models:** flux.2-dev, sd3.5-large
**Variation:** 2/3 of 2

```text
High-resolution master sprite sheet for a horizontal arcade shooter, twelve large clean renderings of the KESTREL steel-blue dart fighter with bold blue stripe, cyan canopy and orange afterglow laid out on a wide perfectly flat solid pure bright green chroma-key background in a tidy 4-by-3 grid of equal cells with equal gutters, top row four progressively hotter exhaust states from idle ember to full burn trail, second row the hull from exact side, three-quarter low, three-quarter high and true rear views, third row damage tiers from light scuffs to smoking armor cracks to a critical state with flickering shield sparks, all cells using identical lighting direction from above, bold dark outlines, flat saturated arcade fills with subtle pixel-cluster texture accents on the highlights only, precise consistent scale between cells, no shadows cast on the background, no text, no numbers, no borders around cells, documentation quality.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 34 | 45 | 50 | 36 |
| seed | 11311 | 11311 | 11311 | 11311 |

**Negative:** (sd3.5/qwen only) `overlapping sprites, uneven sprite sizes, shadows on background, gradient background, cell borders, labels, numbers, perspective skew, blurry, text, photorealistic, 3d render, watermark, pure black background, green tint on the subject, green spill, background scenery, cast shadow`
**Notes:** 1536x640 favors a 4x3 sheet. Use for website documentation and as the master reference for the pixel team. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

## manta-sprite-sheet — in-game pose grid
**Models:** flux.1-dev, sd3.5-large
**Variation:** 1/3 of 2

```text
Retro 16-bit video game sprite sheet for a horizontal shooter, a regular grid of ten equal cells in two rows of five with even gutters, every cell showing the same flat pale-mint manta-ray-shaped starfighter with a small green canopy, amber twin thrusters and a heavy near-black green outline in side view facing right, on a perfectly flat solid pure bright green chroma-key background. Top row, the five banking frames from left to right: steep climb with the nose and the leading wing edge tilted up, slight climb, level glide, slight dive, steep dive with the nose tilted down. Bottom row, the level-glide hull with five thruster states from left to right: idle with two short amber embers, small twin flames, medium twin flames, long red-amber twin plumes, and full boost with white-hot cores in both plumes. Every sprite drawn as crisp pixel art with a 1-pixel near-black green outline at its native pixel scale, flat saturated fills with three-step shading lit from the top-left, identical scale, position and silhouette in every cell, no anti-aliasing, no drop shadows, no glow bleeding onto the background, no text, no numbers, no cell borders, arcade sprite art.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 11302 | 11302 | 11302 | 11302 |

**Negative:** (sd3.5/qwen only) `overlapping sprites, drop shadows, background gradient, real manta ray, animal texture, visible fish eye, perspective distortion, anti-aliasing, text, labels, numbers, cell borders, green tint on the hull, blurry, photorealistic, 3d render, watermark`
**Notes:** v2 target (R3-01): MANTA is about 24×15 in game with 5 bank frames (v1: 16×10, 3 frames); AI design reference for the hand-pixelled sprite. Key #00FF00 — the green canopy (#40d070, ΔE 56 from the key) sits inside the outline, so the border flood-fill keeps it. Body #c8e0d0.

## manta-sprite-sheet — hi-res master sheet
**Models:** flux.2-dev, sd3.5-large
**Variation:** 2/3 of 2

```text
High-resolution master sprite sheet for a horizontal arcade shooter, twelve large renderings of the MANTA flat ray-winged fighter in pale mint with a green canopy and amber twin thrusters laid out on a wide perfectly flat solid pure bright green chroma-key background in a tidy 4-by-3 grid of equal cells with equal gutters, top row the hull from exact side, front-on with wings spread wide, rear-on showing both nozzles, and a top-down plan view showing the full ray silhouette, middle row four banking sequences from neutral to hard left roll with the wing geometry compressing correctly, bottom row damage tiers from clean plating to scuffed edges to cracked wingtips venting amber sparks to a critical smoking state, identical top-lighting in every cell, bold dark outlines, flat saturated arcade shading with pixel-cluster texture accents on highlights only, precise uniform scale, no cast shadows, no text, no numbers, no cell borders, documentation quality.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 34 | 45 | 50 | 36 |
| seed | 11312 | 11312 | 11312 | 11312 |

**Negative:** (sd3.5/qwen only) `overlapping sprites, uneven sizes, shadows, gradient background, cell borders, labels, numbers, animal anatomy, motion blur, text, photorealistic, 3d render, watermark, pure black background, green tint on the subject, green spill, background scenery, cast shadow`
**Notes:** The plan-view cell is the reference the pixel team needs most — verify it reads as a manta immediately. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

# 10 — Logo & Title: App / Store Icons (1:1)

Square 1024x1024 icons. Small canvas: bold silhouettes, minimal detail, one bright
accent each. Text-bearing icons recommend qwen-image; emblem icons run great on
flux.1-dev.

## app-icon — kestrel dart in a rounded navy tile
**Models:** flux.1-dev, qwen-image
**Variation:** 1/4 of 4

```text
Mobile app icon design, square with softly rounded corners, a single sleek steel-blue dart-shaped retro fighter jet seen from the side banking slightly toward the viewer with a bold blue fuselage stripe, a glowing cyan bubble canopy and a bright orange engine afterglow trailing to the lower left, heavy dark navy outline around the whole craft, centered in the tile, background a clean radial wash from deep midnight navy at the edges to a slightly lighter blue-black at the center with a few tiny star specks, flat saturated 16-bit game art shading with crisp pixel-cluster texture accents, bold minimal shapes readable at very small sizes, no text anywhere, no border.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 10021 | 10021 | 10021 | 10021 |

**Negative:** (sd3.5/qwen only) `text, letters, watermark, photorealistic, 3d render, blurry, modern fighter jet, visible pilot, pure black background, cluttered details, drop shadow outside tile`
**Notes:** The default store icon. Stripe #3858f0, canopy #38c8e8, glow #f89830, outline #1b2a4a.

## app-icon — bullet-hell ring with capsule core
**Models:** flux.2-dev, flux.1-dev
**Variation:** 2/4 of 4

```text
Square game store icon with rounded corners, viewed head on, a perfect circular ring of evenly spaced glowing round bullets in pink, crimson and violet each bullet drawn with a bright white core and a dark rim, the ring encloses a single glossy golden power capsule pill standing vertical at the exact center with a white specular highlight and a thin navy outline, the capsule emits a soft warm halo, background flat deep navy with a faint darker navy checker texture, bold dark outlines, ultra-saturated limited palette, crisp 16-bit arcade vector shapes with pixel texture accents, instantly readable at thumbnail size, no text.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 10022 | 10022 | 10022 | 10022 |

**Negative:** (sd3.5/qwen only) `text, watermark, photorealistic, 3d render, blurry, irregular bullet ring, messy arrangement, pure black background, rainbow colors`
**Notes:** Abstract alternative icon. Bullet anchors #ff5aa0/#ff3a3a/#b84cff; symmetry is the make-or-break — re-roll if ring wobbles.

## app-icon — "C" cup emblem monogram
**Models:** qwen-image, flux.2-dev
**Variation:** 3/4 of 4

```text
Esports-style app icon, square rounded tile, a single massive block letter "C" occupying most of the frame, the letter filled with a vertical gradient from pale yellow through tangerine orange to flame red, thick dark navy outline and a hard inner shadow line, a small steel-blue retro dart fighter flying through the open gap of the C leaving a thin orange trail, three tiny pink glowing bullets orbiting the letter like satellites, background deep navy with a subtle radial teal glow behind the letterform, faint scanline texture, bold flat 16-bit arcade vector design with pixel-art texture accents, high contrast and readable at favicon size, no other text or numbers.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 10023 | 10023 | 10023 | 10023 |

**Negative:** (sd3.5/qwen only) `garbled letters, extra letters, misspelled text, photorealistic, 3d render, watermark, blurry, serif font, script font, pure black background`
**Notes:** qwen renders the single glyph most reliably. Logo gradient anchors #f8f070→#f8a030→#e04828.

## app-icon — manta ray glyph icon
**Models:** flux.1-dev, sd3.5-large
**Variation:** 4/4 of 4

```text
Minimal flat app icon, square with rounded corners, the top-down silhouette of a wide flat manta-ray shaped starfighter drawn as a clean symmetrical geometric glyph, pale mint green body with a small bright green oval canopy at the center and two short amber thruster wedges at the rear tail, a single bold near-black green outline around the whole shape, the glyph centered with generous margin, background a solid deep indigo-navy with two faint horizontal darker bands like scanlines, absolutely flat vector shapes, saturated limited palette, 16-bit arcade design language, instantly readable at tiny sizes, no text, no stars, no gradients on the ship.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 10024 | 10024 | 10024 | 10024 |

**Negative:** (sd3.5/qwen only) `text, letters, photorealistic, 3d render, realistic manta ray, animal creature, visible eye of a fish, blurry, gradient shading, pure black background, watermark`
**Notes:** Deliberately flat — flux.1-dev holds single-color fills best. Manta anchors: body #c8e0d0, canopy #40d070, outline near-black green.

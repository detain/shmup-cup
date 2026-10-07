# 10 — Logo & Title: Wordmark Lockups

Wordmark renders with the exact string **"SHMUP CUP"**. qwen-image is the primary
model (best rendered typography); flux.2-dev is the fallback. sd3.5 often garbles
text — use it only as a last resort at low guidance. Block letters: warm vertical
gradient pale-yellow through tangerine into red, thick navy outline, offset drop
shadow, cream top highlight.

## logo-lockup — classic wordmark on deep-navy arcade plate
**Models:** qwen-image, flux.2-dev
**Variation:** 1/4 of 4

```text
Arcade game logo lockup rendering the exact text "SHMUP CUP" in heavy chunky block capital letters, the letterforms filled with a warm vertical gradient starting pale buttery yellow at the top, melting through tangerine orange in the middle and ending flame red at the bottom, each letter wrapped in a thick dark-navy outline with a hard offset navy drop shadow, a thin cream-white highlight stripe along the upper edge of every letter, the wordmark centered on a deep-navy arcade background scattered with tiny pixel stars, a faint cyan horizontal glow line behind the text, subtle CRT scanline texture across the whole image, clean vector shapes with pixel-art texture accents, saturated limited palette, no other words anywhere.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 10001 | 10001 | 10001 | 10001 |

**Negative:** (sd3.5/qwen only) `garbled text, misspelled letters, extra letters, missing letters, warped typography, letter overlap, photorealistic, 3d render, watermark, signature, blurry, pure black background`
**Notes:** Gradient reference #f8f070→#f8a030→#e04828, outline #1b2a4a, shadow #0a0f26, highlight #fffff0. qwen-image for the letterforms; check the "W" spacing.

## logo-lockup — wordmark over planet-rim sunrise
**Models:** qwen-image, flux.2-dev
**Variation:** 2/4 of 4

```text
Video game title logo rendering the exact words "SHMUP CUP" in bold rounded slab capital letters with a warm vertical color gradient from pale yellow at the crown through orange into deep red at the base, a heavy navy blue outline around every glyph and a duplicated hard shadow offset to the lower right, a bright cream specular gleam on the top edges, the logo floating large across the upper half of the frame above the curved glowing rim of a blue planet at orbit dawn, thin atmosphere band of cyan light along the planet edge, scattered pixel-perfect stars in the deep navy void, subtle scanline glow, retro arcade key art with clean vector shapes and pixel-art texture accents, no other text.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 10002 | 10002 | 10002 | 10002 |

**Negative:** (sd3.5/qwen only) `garbled text, misspelled letters, extra letters, missing letters, warped typography, photorealistic, 3d render, watermark, blurry, pure black background, lens flare abuse`
**Notes:** Ties the logo to Zone A's Azure Verge orbit look (planet rim #8ad0a8 terrain hints under cyan atmosphere).

## logo-lockup — wordmark slammed between exploding bullets
**Models:** flux.2-dev, sd3.5-large
**Variation:** 3/4 of 4

```text
Retro arcade logo poster rendering the exact text "SHMUP CUP" in massive block letters that fill the center of the frame, the letters tilted slightly upward to the right for kinetic energy, filled with a hot gradient of pale yellow, tangerine and flame red, thick navy outlines, hard drop shadow, surrounding the wordmark a burst of glowing round enemy bullets in pink, crimson and violet each with a bright white core and a dark rim, frozen mid-scatter with orange-white explosion puffs blooming behind them, deep navy background never pure black, faint CRT scanline glow, widescreen side-scrolling arcade composition, SNES-era 16-bit pixel art inspired concept rendering with bold dark outlines and a saturated limited palette, no other text or letters.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 10003 | 10003 | 10003 | 10003 |

**Negative:** (sd3.5/qwen only) `garbled text, misspelled letters, extra letters, warped typography, photorealistic, 3d render, watermark, cluttered composition, pure black background`
**Notes:** Ultra-wide banner crop; if qwen is used instead of the recommended pair it also renders this text well at 1152x896.

## logo-lockup — gold-foil trophy emblem wordmark
**Models:** qwen-image, flux.2-dev
**Variation:** 4/4 of 4

```text
Prestigious arcade championship badge rendering the exact phrase "SHMUP CUP" in polished golden block letters with a warm gradient from light champagne gold through amber to deep bronze, navy blue outline, gleaming white edge highlights, the wordmark set inside a circular trophy emblem made of crossed golden wings, laurel leaves rendered as simple pixel-art shapes, a small five-point starburst at each side, deep midnight navy background with a subtle violet-to-teal glow vignette that never reaches pure black, thin scanline texture, clean vector shapes with pixel-art texture accents, saturated limited palette, centered symmetrical composition, no other text.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 10004 | 10004 | 10004 | 10004 |

**Negative:** (sd3.5/qwen only) `garbled text, misspelled letters, extra letters, missing letters, photorealistic, 3d render, watermark, signature, blurry, pure black background, tarnished metal, dull gold`
**Notes:** Square format for avatar/achievement use. "CUP" trophy metaphor stays pixel-simple; watch laurel detail noise on sd3.5.

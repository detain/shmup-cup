# 50 — Zone E: Tempest Ridge (stage backgrounds)
# Storm cloud deck, saw-tooth snow ridges, slanting rain, lilac lightning.
# Seed slots: wallpaper 16501, vertical poster 16502.

## tempest-ridge-wallpaper — Wide wallpaper: churning cloud deck under saw-tooth snow peaks with slanting rain
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, widescreen 16:9 side-scrolling arcade composition, subtle CRT scanline glow; ultra-detailed large-format background art with clean vector shapes and pixel-art texture accents. A brutal mountain ridge storm seen side-on: the lower third of the image is a roiling deck of storm cloud, layered slabs of slate blue and cold lilac grey rolled over each other with heavy dark outlines, their tops shredded into horizontal streaks by wind. Rising out of the cloud sea, a serrated chain of snow peaks — sharp saw-tooth silhouettes in pale ice-blue with hard white windward facets and deep navy lee shadows, snow streaming off every summit in long thin ribbons bent sideways by the gale. A curtain of slanting rain crosses the whole scene on one consistent diagonal, rendered as thousands of fine pale needles catching intermittent light. From the biggest anvil cloud overhead, a single branching bolt of violet lightning strikes ridge to cloud, its lilac glow rimming every cloud slab it passes. Far above, torn holes in the storm show a cold dark sky with faint stars, contrasting the chaos below. Palette of storm blues, lilac greys, ice whites and one violent violet accent, over a lifted deep-navy base, never pure black. No foreground characters, no text, no letters, no user interface elements.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 4.5 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 40 | 50 | 30 |
| seed | 16501 | 16501 | 16501 | 16501 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, sunny, calm sky, summer, green vegetation, pure black background, watermark, text, blurry, rain going upward, inconsistent rain direction, warm orange lighting, frame border, letterboxing`

**Notes:** Color reference: cloud slabs slate-to-lilac around #4a5a8a–#b84cff accents, bolt violet #b84cff, ice whites on navy #05070f–#0c1a3c. The single consistent rain diagonal is the whole illusion of wind — sd3.5 occasionally flips streak direction in patches; raise to guidance 5.0 if that happens. One bolt only; multiples turn it into wallpaper noise.

## tempest-ridge-poster-vertical — Vertical poster: looking up a storm chasm between two jagged peaks, lightning bridging them
**Models:** sd3.5-large, flux.1-dev
**Variation:** 2/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, subtle CRT scanline glow; vertical composition, tall poster framing, ultra-detailed large-format background art with clean vector shapes and pixel-art texture accents. Viewed from deep inside a mountain chasm, looking up: two colossal saw-tooth rock-and-ice walls flank the frame on the left and right, their serrated crest lines stabbing toward each other from opposite sides, dark navy stone on the inner faces and cold white ice catching the light above. Between them the chasm fills with a vertical traffic of storm — slabs of cloud stacked one above another into the distance, each outlined in shadow, the gaps narrowing toward a churning anvil ceiling far overhead. A dozen bolts of violet lightning bridge the two walls at different heights, zigzag ladders of lilac light illuminating successive ledges, small waterfalls of meltwater on the rocks, and horizontal rain sheets driven across the gap. At the very bottom of the frame the chasm floor disappears into a luminous mist of crushed cloud, faintly lilac from all the electrical light above it. The composition draws the eye upward through the storm layers toward the biggest bolt striking dead center at the top. Storm blues, ice whites, heavy navy shadows and committed violet lightning accents, lifted deep-navy base, never pure black. No text, no letters, no user interface elements.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 896x1152 | 896x1152 | 896x1152 | 896x1152 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 45 | 40 | 30 |
| seed | 16502 | 16502 | 16502 | 16502 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, horizontal panorama, wide angle ground view, green forest, desert, pure black background, watermark, text, blurry, lightning bolts with no cloud connection, straight vertical rain, frame border, letterboxing`

**Notes:** Color reference: bolt violet #b84cff with pink-white cores, mist lit ~#9a7ad8, walls navy #0c1a3c under ice #c8e0f0. Vertical chasm framing doubles the "storm layers" reading; flux.1 loves this but softens the serrated crests — the "serrated crest lines stabbing toward each other" clause keeps them aggressive. This is the strongest zone poster for a phone wallpaper.

# 30 — Boss 07: FACET MONARCH (FM-07)

A crown of crystal segments orbiting one core. Zone G: prism labyrinth, crystal
corridors, violet crystal with pale lilac edges. Seed slots 127xx.

## fm07-reveal — the crown assembles
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/3 of 3

```text
Geometric majesty boss reveal inside a cathedral-sized crystal corridor, the FACET MONARCH arriving as a slow-motion assembly, seven huge wedge-shaped crystal segments of deep violet with glowing lilac edges sliding through the air from off-frame to close into a floating crown ring, and at the exact center of the ring igniting a single small blinding core of white-pink light that throws sharp triangular caustics across every surface, the corridor walls faceted like the inside of a geode, mirror planes angling the crown's reflection into an endless multiplied halo, loose shard motes drifting upward as if gravity reversed, the light ramp cool violet to pale lilac with one hot pink-white heart, at the bottom edge of the frame a tiny steel-blue dart fighter with cyan canopy banks into the corridor mouth, dwarfed and deliberate, bold dark outlines, saturated limited palette, SNES-era 16-bit pixel art inspired concept rendering, ultra-detailed large-format key art with pixel texture accents, widescreen side-scrolling arcade composition, subtle CRT scanline glow, no text.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 34 | 45 | 50 | 36 |
| seed | 12701 | 12701 | 12701 | 12701 |

**Negative:** (sd3.5/qwen only) `organic boss, tentacles, metal gears, photorealistic, 3d render, text, watermark, rainbow palette, muddy colors, pure black background`
**Notes:** Crystal violet #8a48e8 with edge lilac #c8a0ff, core hot pink-white. The crown must read as seven discrete segments — count them if the model merges facets.

## fm07-weakpoint — the core between segments
**Models:** sd3.5-large, flux.2-dev
**Variation:** 2/3 of 3

```text
Dazzling macro weak-point shot inside the rotating crown of the FACET MONARCH, camera threaded between two enormous violet crystal segments whose polished walls fill the left and right of the frame like canyon cliffs, straight ahead the exposed heart core floating untethered, a fist-sized knot of screaming white-pink light wrapped in slow-spinning rings of lilac fracture energy, hairline cracks pulsing outward from the core into the nearest segment and lighting them from within like struck flint, tiny pink and purple bullets with bright cores and dark rims orbiting the core defensively in lazy spiral lanes, one gold capsule grazing past the frame edge, refractions splitting the core light into clean pink and violet beams across the crystal canyon walls, composition funneled by hard perspective lines directly at the glowing center, bold dark outlines, saturated limited palette of violet, lilac and incandescent pink, SNES-era 16-bit pixel art inspired concept rendering at ultra-detailed quality, subtle CRT scanline glow, no text.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 34 | 45 | 45 | 36 |
| seed | 12702 | 12702 | 12702 | 12702 |

**Negative:** (sd3.5/qwen only) `soft focus, dreamy haze, gemstone jewelry photo, photorealistic, 3d render, text, watermark, green tones, pure black background`
**Notes:** Only warm color is the pink-white core; everything else stays violet-lilac. Weak point is CENTER — frame it with converging edges.

## fm07-warning — prismatic darkening
**Models:** flux.1-dev, sd3.5-large
**Variation:** 3/3 of 3

```text
Ominous boss alarm beat in the prism labyrinth, the ambient glint of the crystal corridor suddenly going dark facet by facet from the far end toward the viewer as light is drained toward something forming, in the gathering dim the FACET MONARCH shows only as a flat black-violet silhouette, an open crown of seven separated wedge shapes orbiting a bare pinprick of pink light, each silhouette segment edged with one thin lilac rim line so the geometry reads like a diagram of a coming disaster, the corridor floor a mirror of dark violet planes throwing the broken crown reflection forward at the viewer, stray motes of light sliding sideways and disappearing into the pinprick core, a single tiny fighter silhouette with a cyan canopy dot parked low right, still, waiting, cold violet-and-shadow palette with exactly one bright point, bold dark outlines, saturated limited palette, SNES-era 16-bit inspired concept rendering, widescreen side-scrolling arcade framing, subtle CRT scanline glow, no text, no letters.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 12703 | 12703 | 12703 | 12703 |

**Negative:** (sd3.5/qwen only) `text, banner, letters, photorealistic, 3d render, watermark, explosions, bright full scene, many colors, pure black background`
**Notes:** The anti-reveal: light drains instead of firing up. Keep lilac rims (#c8a0ff) on every silhouette edge or the shape dies in the dark.

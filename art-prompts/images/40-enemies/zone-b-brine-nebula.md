# 40 — Zone B: Brine Nebula enemies
# Teal-violet gas sea, wave rasters, reef tunnels, sand-stone.
# Seed slots: concept 15211-15213, sprite sheet 15221-15223.

## brood-urchin-reef — BROOD BUBBLE and URCHIN reef turret, encounter concept
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/3 of 3

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, widescreen 16:9 side-scrolling arcade composition, subtle CRT scanline glow. Inside a coral-reef tunnel at the heart of a teal-and-violet nebula sea: a BROOD BUBBLE floats center-frame — a translucent wobbling sphere of membranous jelly with a tiny mechanical fish curled asleep inside, its dark spine visible through the shimmering film — while along the sand-stone reef walls a row of URCHIN reef turrets bristle: squat barnacle-domes armored in overlapping charcoal plates, each crowned with a fan of purple spines and a single rotating magenta lens. The MANTA fighter, a flat ray-winged hull of pale mint with a green canopy and amber twin thrusters, banks through the gap on the left, its wake scattering glowing plankton motes. Fired urchin shots leave curling pink trails; the tunnel mouth ahead glows with pale aqua light. Background is a lifted deep-navy to teal gradient, never pure black, layered with drifting wave-like gas rasters. Ultra-detailed, large-format, clean vector shapes with pixel-art texture accents.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | — |
| guidance | 5.0 | 3.5 | 3.5 | — |
| steps | 32 | 40 | 50 | — |
| seed | 15211 | 15211 | 15211 | — |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, blurry, pure black background, sea creatures with eyes, cartoon smile, bubbles everywhere`
**Notes:** flux.2-dev renders the see-through brood film with the curled fish inside far more reliably than sd3.5. Color reference: nebula teal-violet, sand-stone #f0c890, mint hull #c8e0d0, canopy #40d070, urchin lens #ff5aa0.

## brood-urchin-reef — BROOD BUBBLE and URCHIN reef turret, encounter concept
**Models:** sd3.5-large, flux.2-dev
**Variation:** 2/3 of 3

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, subtle CRT scanline glow, widescreen arcade side-scroller framing. A moment of hazard and harvest in a deep reef corridor: an ruptured BROOD BUBBLE splits down the middle in a slow burst of pink droplets, its mechanical fry spilling out and twitching to life, tiny dark spines unfurling; on the right wall a line of URCHIN reef turrets — barnacle-domes of charcoal plate with purple spine fans and glowing magenta aiming lenses — pivots to track the steel-blue KESTREL dart screaming past at the bottom of the frame, blue hull stripe blazing, cyan canopy catching the reef light, orange engine glow strobing along the tunnel. Wobbling wave rasters of teal gas roll across the corridor like heat-shimmer underwater, sand-stone arches carved with ancient pore-tunnels rise above, and a distant violet nebula heart pulses behind the reef. Lifted deep-navy shadows that never reach pure black, gold point-sparkles drifting where the brood burst caught light. Ultra-detailed, large-format, clean vector shapes with pixel-art texture accents.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | — |
| guidance | 4.5 | 3.5 | 3.5 | — |
| steps | 36 | 40 | 45 | — |
| seed | 15212 | 15212 | 15212 | — |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d, text, watermark, blurry, pure black, realistic fish, cartoon characters, human divers`
**Notes:** Panoramic crop for website zone banners; the rupture action reads best wide. sd3.5 handles the droplet spray cleanly. Keep fry mechanical — dark spines, not organic scales.

## brood-urchin-reef — BROOD BUBBLE and URCHIN reef turret, encounter concept
**Models:** sd3.5-large, flux.1-dev
**Variation:** 3/3 of 3

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, square vertical poster crop, subtle CRT scanline glow. A towering reef column fills a vertical shaft of teal-violet light: stacked URCHIN reef turrets line it like fortified sentries, charcoal barnacle-domes with fanned purple spines and single magenta lenses, their aim-lines converging up the composition. Near the top a swollen BROOD BUBBLE clings to the rock, half-transparent and wobbling, a small mechanical fish curled inside its shimmering membrane, backlit so the film glows pale aqua at the rim. At the very bottom edge, tiny against the reef, the flat winged silhouette of the MANTA fighter climbs into the shaft, twin amber thrusters painting the stone warm, green canopy a bright seed of light. The sea of nebula gas darkens with depth into lifted navy, dusted with glowing plankton and drifting wave rasters. Clean vector shapes with pixel-art texture accents, ultra-detailed, large-format, atmosphere thick but readable.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 896x1152 | 896x1152 | — | — |
| guidance | 5.0 | 3.5 | — | — |
| steps | 32 | 45 | — | — |
| seed | 15213 | 15213 | — | — |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, logo, watermark, blurry, pure black, submarine cable, wreckage`
**Notes:** Vertical "descent shaft" composition sells the nebula's depth. flux.1-dev keeps the stacked turret silhouettes crisp. Color reference: aqua rim glow #6ad8e0 family, spine purple #b84cff, thrusters amber #f89830.

## brine-nebula-sprite-sheet — In-game enemy sprite sheet: froth, brood, urchin, maw rocket
**Models:** sd3.5-large, flux.1-dev
**Variation:** 1/3 of 3

```text
16-bit SNES-era video game sprite sheet, pixel art style, bold dark navy outlines, saturated limited palette, laid out in a clean even grid on a flat deep teal-navy background color reference hex 0c1a3c, no gradients, no scenery, no text, no labels, no UI. Row one: FROTH splitting bubble enemies — four frames of a wobbling translucent pink-white foam sphere growing a seam, pinching in the middle, and separating into two smaller froth spheres. Row two: BROOD BUBBLES — three frames of a larger membranous jelly sphere containing a curled dark mechanical fish, shown intact, cracking, and emptied with the film peeling away. Row three: URCHIN reef turrets — two frames of a squat charcoal barnacle dome plated in overlapping scales, crowned with a fan of purple spines and a single magenta lens, lens aimed left then aimed down-right, plus one damaged frame with broken spines. Row four: MAW ROCKET missiles — two frames of a small fish-head torpedo with an open metal jaw nose and a stubby fin tail, flame nozzle flickering between two states. Chunky crisp pixels, dithered metal highlights, side view facing left.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | — | — |
| guidance | 5.5 | 3.5 | — | — |
| steps | 34 | 40 | — | — |
| seed | 15221 | 15221 | — | — |

**Negative:** (sd3.5/qwen only) `gradient background, text, numbers, labels, photorealistic, 3d render, watermark, soft blur, anti-aliased, realistic fish, pure black background, overlapping sprites, perspective distortion`
**Notes:** Four-species atlas for the reef zone; rows are separated by scale class so extraction stays simple. Color reference: froth pink-white #ff5aa0 rim family, urchin spine #b84cff, lens #ff3a3a.

## brine-nebula-sprite-sheet — In-game enemy sprite sheet: froth, brood, urchin, maw rocket
**Models:** sd3.5-large, flux.1-dev
**Variation:** 2/3 of 3

```text
Retro 16-bit pixel art sprite atlas for a horizontal shoot-'em-up's underwater-reef level, flat solid dark blue-navy sheet, generous margins, evenly spaced, absolutely no text and no annotations. Subject family: bubble-swarm hazards and reef gunners — wobbling foam spheres in four pinch-apart split frames with a pink-white sheen and a darker rim; a jelly brood pod drawn three ways with a curled mechanical fish-fry visible through the membrane in charcoal and violet; an armored barnacle turret dome of overlapping slate plates with a purple spine crown and a rotating magenta eye-lens, drawn aimed and base-only without its spines for a destroyed state; and an open-jawed fish-head missile with a finned steel body and small orange nozzle flare in two flicker frames. Bold near-black outlines, saturated limited palette of teal, violet, slate, pink and orange, chunky readable small-size forms, dithered highlights only, no anti-aliasing, no scenery behind any sprite.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | — | — |
| guidance | 5.5 | 3.5 | — | — |
| steps | 34 | 45 | — | — |
| seed | 15222 | 15222 | — | — |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d, gradients, smooth shading, text, watermark, coral background, water caustics, fish eyes, pure black background, overlapping sprites, perspective distortion`
**Notes:** Square texture-page format including a destroyed urchin state. sd3.5 keeps the split-frame sequence legible; check the froth pinches read as one object dividing, not two unrelated balls.

## brine-nebula-sprite-sheet — In-game enemy sprite sheet: froth, brood, urchin, maw rocket
**Models:** flux.1-dev, sd3.5-large
**Variation:** 3/3 of 3

```text
Pixel art sprite sheet, SNES 16-bit arcade style, flat solid deep-navy sheet background, one species per horizontal band, thick even margins, no text, no numbers, no frame borders. Species facing left in side view: FROTH — soft pink-white foam bubbles with a dark rim and a bright core, four growth-and-split frames ending as two smaller bubbles; BROOD — a translucent violet jelly sphere with a curled dark mechanical fish inside, intact / cracked / hatched frames where the shell peels like a broken lantern; URCHIN — a reef-mounted charcoal barnacle turret, scale-plated dome, fan of purple crystal spines, single glowing magenta lens, three aim frames sweeping the lens from horizontal to vertical plus one shattered-shell frame; MAW ROCKET — a steel torpedo with a hinged open fish-jaw nose showing a dark throat, short fins, twin flame frames at the tail. Bold dark outlines on every sprite, limited saturated palette, chunky pixel clusters, light dithering on metal only, classic cartridge-era readability at small scale.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | — | — |
| guidance | 5.0 | 3.5 | — | — |
| steps | 32 | 40 | — | — |
| seed | 15223 | 15223 | — | — |

**Negative:** (sd3.5/qwen only) `text, labels, UI, gradient background, photorealistic, 3d render, blurry, anti-aliasing, glow bloom, realistic water, watermark, pure black background, overlapping sprites, perspective distortion`
**Notes:** Landscape band layout, best for website sprite-strip displays. flux.1-dev again the steadiest "no-text" producer. Color reference: jellies toward #8a48e8 translucency, rocket throat #080410-ish dark core, flame #f89830.

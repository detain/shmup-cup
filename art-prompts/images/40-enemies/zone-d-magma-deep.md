# 40 — Zone D: Magma Deep enemies
# Volcanic shafts, lava lakes and cave systems: ember wisps and magma cones.
# Seed slots: concept 15411-15413, sprite sheet 15421-15423.
# v2 (R3-01): sprite sheets sit on the K3 key background (flat pure green #00FF00) with
# 4–6 frames per animation (see 00-style-kernel.md); encounter concepts keep their navy scenes.

## ember-wisp-magma-cone — Zone D enemies: flailing ember wisps and an erupting magma cone turret in a lava shaft
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/3 of 3

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, widescreen 16:9 side-scrolling arcade composition, subtle CRT scanline glow. A volcanic shaft in a invaded star system's molten depths: the background is an erupting cave of cooling black basalt crossed with glowing lava cracks, a lava lake at the shaft floor burning through a gradient from dark ember red to bright tangerine, falling droplets of lava trailing gold sparks, heat ripple warping the upper rock. Mid-field, two hostile mechanical-organic swarm creatures converge on a tiny sleek steel-blue dart fighter with a bold blue hull stripe, cyan canopy and bright orange engine glow in the lower left: EMBER WISPS — fist-sized feral flames with a single molten gold core each, wisp bodies of layered orange and red flame tongues, sparking tails smearing behind their erratic darting paths, no faces, just hungry light; and a MAGMA CONE — a squat volcanic turret of stacked blackened rock plates veined with lava, its crater mouth cracked wide mid-eruption belching a fan of pink and red molten shot with bright cores and dark rims. Deep-navy-black shadow pockets (never pure black) against the furnace light, orange-white explosion bloom in a side tunnel.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 50 | 30 |
| seed | 15411 | 15411 | 15411 | 15411 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, blurry, pure black background, human figures, cartoon mascot, soft pastel palette, volumetric fog, lens flare`
**Notes:** Heat-light from below is the mood anchor — the shot reads as an ambush inside the furnace. Lava ramp color reference: #8a2c0a→#e87a1c; brick wall accents #b0704a; bullets #ff3a3a/#ff5aa0. Wisps should stay small: at most a tenth of the ship's size each, so scale contrast sells the swarm menace.

## ember-wisp-magma-cone — Zone D enemies: wisp stream pouring from a cone crater as the fighter threads the cave road
**Models:** sd3.5-large, flux.2-dev
**Variation:** 2/3 of 3

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, ultrawide panoramic arcade composition, subtle CRT scanline glow. A horizontal magma cave road inside a fortress-world's burning depths, the frame stretched wide like a scroll of danger: ceiling of jagged basalt drips with cooling slag, floor is a slow lava river glowing from dark ember red to tangerine, brick-like rock strata bands in rust brown breaking up the walls. On the left edge a sleek steel-blue dart fighter with cyan canopy streaks in, orange engine flare stretched long, banking between columns of stone. The right two-thirds belong to the IRON TIDE: a row of three MAGMA CONES of graduated size mounted along the cave floor like a gun battery, craters tilted up, each spewing a rising column of flame that breaks into a stream of EMBER WISPS — darting molten-gold hearts wrapped in ragged orange flame tongues with sparking tails — flowing left toward the fighter like a released swarm. Pink and red round shots with bright cores dot the columns, one cone mid-reload with its rock plates glowing cherry at the seams, a small orange-white blast chipping the ceiling where a wisp detonated. Deep-navy pockets in the far tunnels, never pure black.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 4.5 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 40 | 45 | 30 |
| seed | 15412 | 15412 | 15412 | 15412 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, blurry, pure black background, human figures, cartoon mascot, soft pastel palette, duplicate fighter, extra player ships, lens flare`
**Notes:** The panoramic band suits Zone D's scroll rhythm — cones read as terrain artillery, wisps as the mobile threat pouring off them. Keep exactly one fighter (anti-duplication guard in negative). Slag drip + strata bands give the wide frame vertical texture without stealing the lane.

## ember-wisp-magma-cone — Zone D enemies: portrait descent, a cone's eruption column full of wisps rising past the camera
**Models:** sd3.5-large, flux.1-dev
**Variation:** 3/3 of 3

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, vertical poster composition looking down a lava chimney, subtle CRT scanline glow. A deep vertical shaft in a molten fortress-world: walls of stacked black basalt plates veined with lava light from dark ember red to tangerine narrow toward a bright crater lake at the bottom of the frame, falling lava droplets arcing like slow gold fireflies. Dominating the lower third, a giant MAGMA CONE seen from above and behind, its terraced rock body ringed with glowing seams, crater aimed at the shaft mouth, mid-burp — a thick column of heat and pink-red molten shot climbing the whole height of the image. Riding that column upward, a dozen EMBER WISPS scatter like sparks from a firework: small feral flames with molten-gold cores, ragged orange-red tongues, long sparking tails, some drifting out toward the camera past the rock ledges. Far above at the top edge, a tiny steel-blue dart fighter with cyan canopy and orange engine glow crosses the shaft mouth in silhouette, unawares, framed by two dark navy jaws of stone. The whole scene lit from below by the eruption, hard orange rim-light on every rock edge, deep navy shadow wells in the wall cracks.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 896x1152 | 896x1152 | 896x1152 | 896x1152 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 45 | 40 | 30 |
| seed | 15413 | 15413 | 15413 | 15413 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, blurry, pure black background, human figures, cartoon mascot, soft pastel palette, duplicate fighter, whale shape, tentacles`
**Notes:** Vertical chimney = Zone D's shaft set-pieces turned into a poster. The wisps riding the eruption column foreshadow the boss CINDER BASTION's arena without depicting it — keep the cone clearly smaller than a boss, a turret, not a fortress. Up-lighting gives the dramatic rim contrast.

## magma-deep-sprite-sheet — In-game pixel sprite sheet: MAGMA CONE turret, five states on key green
**Models:** sd3.5-large, flux.1-dev
**Variation:** 1/3 of 3

```text
SNES-era 16-bit pixel art, flat colored pixel sprites with crisp 1-pixel near-black navy outlines and simple two-tone dithered shading, arranged as a regular grid of five equal cells in one row with even gutters, one state per cell in the order listed, the same subject at the same scale and light in every cell, on a completely flat solid pure bright green chroma-key background, no scenery, no glow bleeding into the background, no text, no labels, no UI. Subject: MAGMA CONE — a squat volcanic turret of stacked black basalt plates with glowing lava seams, crater facing left. Five frames. The frames in order: sealed cone with cold gray seams; first crack glowing cherry; crater opening with tangerine light; full eruption with a short orange flame cap; spent cone puffing gray smoke. Identical silhouette and palette in every cell — only the eruption state changes. Chunky readable silhouettes, saturated limited palette, crisp pixel-grid edges.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.5 | 3.5 | 3.5 | 4.0 |
| steps | 34 | 40 | 40 | 30 |
| seed | 15421 | 15421 | 15421 | 15421 |

**Negative:** (sd3.5/qwen only) `text, labels, letters, numbers, watermark, photograph, 3d render, smooth gradients, anti-aliased, glow on background, scenery, flat background replaced, fused sprites, overlapping sprites, pure black background, perspective distortion, green tint on the subject, green spill, background scenery, cast shadow`
**Notes:** The cone's charge cycle, sealed to spent; the eruption animation strip is this file's wide variant. Molten shots, falling lava droplets, the lobbed slag glob with its dripping gold tail and the small explosion puffs are projectiles or effects — procedural (bible §5.4, §6), never on this sheet. The stalactite slag tips, basalt plate tile, lava-surface patch and scorch decal are environment art for the tileset and decor files. Keep dithering to two tones per material so extraction stays clean. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

## magma-deep-sprite-sheet — Square pixel sprite sheet: EMBER WISP flame family, six frames on key green
**Models:** sd3.5-large, flux.1-dev
**Variation:** 2/3 of 3

```text
SNES-era 16-bit pixel art, flat colored pixel sprites with crisp 1-pixel near-black navy outlines and simple two-tone dithered shading, arranged as a square sprite sheet grid of six equal cells in two rows of three with even gutters, one state per cell in the order listed, the same subject at the same scale and light in every cell, on a completely flat solid pure bright green chroma-key background, no scenery, no text, no labels, no UI. Subject: EMBER WISP — a small feral flame, a molten-gold round core with ragged orange-red tongues and a thin sparking tail. Six frames. The frames in order: core steady with the tongues low; licking forward-left; licking upward with the tail sparking; mid-fission, the body stretched thin between two forming cores; two settled half-wisps side by side; burning out to a gray ash puff with a last gold spark. Identical silhouette and palette in every cell — only the flame state changes. Chunky arcade silhouettes, saturated limited palette, crisp pixel-grid edges.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.5 | 3.5 | 3.5 | 4.0 |
| steps | 34 | 45 | 40 | 30 |
| seed | 15422 | 15422 | 15422 | 15422 |

**Negative:** (sd3.5/qwen only) `text, labels, letters, numbers, watermark, photograph, 3d render, smooth gradients, anti-aliased, glow on background, scenery, fused sprites, overlapping sprites, human figures, pure black background, perspective distortion, green tint on the subject, green spill, background scenery, cast shadow`
**Notes:** Square texture-page format. The half and quarter wisps born of fission are the same body redrawn smaller by hand cleanup, not scaled AI pixels; the wisp's glow trail is an additive effect on the black key (bible §3.6), never painted into these frames. The cone battery sizes (sentry/standard/heavy) are the same base silhouette redrawn wider — they ride the next cone sheet. Lava ramp reference #8a2c0a→#e87a1c; core gold. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

## magma-deep-sprite-sheet — Wide strip pixel sprite sheet: MAGMA CONE eruption cycle, six frames on key green
**Models:** flux.1-dev, sd3.5-large
**Variation:** 3/3 of 3

```text
SNES-era 16-bit pixel art, flat colored pixel sprites with crisp 1-pixel near-black navy outlines and simple two-tone dithered shading, arranged as a wide horizontal filmstrip of six equal cells in one row with even gutters, read left to right, one state per cell, on a completely flat solid pure bright green chroma-key background, no scenery, no glow bleeding into the background, no text, no labels, no UI. Subject: one MAGMA CONE turret — a squat stack of black basalt plates with glowing lava seams, crater facing left. Six frames, the eruption cycle. The frames in order: dormant basalt stack; seam-glow widening; crater lid lifting with a first tangerine flare; full column of orange flame; column thinning to smoke and sparks; cooling to dark crust with cherry cracks that loops back to the first frame. The same cone silhouette and palette in every cell — only the state changes. Large readable pixel clusters, saturated limited palette, crisp pixel-grid edges.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 15423 | 15423 | 15423 | 15423 |

**Negative:** (sd3.5/qwen only) `text, labels, letters, numbers, watermark, photograph, 3d render, smooth gradients, anti-aliased, glow on background, scenery, fused sprites, inconsistent character design, different cone each frame, pure black background, perspective distortion, green tint on the subject, green spill, background scenery, cast shadow`
**Notes:** The continuity guard ("same cone silhouette every frame") matters more than usual here — an animation strip is only usable if the base shape locks; the negative list already bans a different cone each frame. Flux.1-dev leads on clean sequential illustration; verify frame-to-frame consistency before extracting. The molten shot riding the flame column is a bullet — procedural; the EMBER WISP set lives on this file's square sheet. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

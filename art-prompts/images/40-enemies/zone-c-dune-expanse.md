# 40 — Zone C: Dune Expanse enemies
# Twin suns, dune silhouettes, heat haze.
# Seed slots: concept 15311-15313, sprite sheet 15321-15323.
# v2 (R3-01): sprite sheets sit on the K3 key background (flat pure green #00FF00) with
# 4–6 frames per animation (see 00-style-kernel.md); encounter concepts keep their navy scenes.

## dune-worm-dust-devil — DUNE WORM and DUST DEVIL, encounter concept
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/3 of 3

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, widescreen 16:9 side-scrolling arcade composition, subtle CRT scanline glow. Beneath twin suns — a huge pale cream disc low on the horizon and a smaller orange disc riding above it — an endless sea of layered dune silhouettes in sand-gold and burnt amber. A DUNE WORM erupts from the crest at center: a segmented mechanical boring-worm of brass ring-plates, a drill-bit maw of spiral teeth, and a geyser of sand fountaining around its emergence hole. To the right a DUST DEVIL twists upward, a whirling column of rust-colored vapor and grit with visible horizontal shear bands and a hollow dark core, pebbles orbiting its funnel. The KESTREL fighter, a sleek steel-blue dart with bold blue hull stripe, cyan canopy and orange engine glow, arcs between the two threats, tracers streaking. Heat haze wobbles the horizon in thin raster lines. Sky gradient from pale gold at the horizon to deep warm navy above, lifted and never pure black, sparse first stars. Ultra-detailed, large-format, clean vector shapes with pixel-art texture accents.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | — |
| guidance | 5.0 | 3.5 | 3.5 | — |
| steps | 32 | 40 | 50 | — |
| seed | 15311 | 15311 | 15311 | — |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, blurry, pure black background, one single sun, organic snake scales, tornado debris house`
**Notes:** flux.2-dev keeps the twin-sun geometry exact (big pale + small orange) where sd3.5 sometimes merges them. Color reference: big sun #fce8b8, small sun #f89858, dunes sand-gold to amber, worm brass plating.

## dune-worm-dust-devil — DUNE WORM and DUST DEVIL, encounter concept
**Models:** sd3.5-large, flux.2-dev
**Variation:** 2/3 of 3

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, subtle CRT scanline glow, ultra-wide panoramic arcade framing. A three-lane ambush across a twin-sunned desert: on the left the sand boils as a DUNE WORM, a long brass ring-plated boring machine with a spiral drill-maw, breaches in a curtain of golden grit; in the middle a chain of DUST DEVILS marches toward the viewer, hollow twisting funnels of rust vapor with dark cores and orbiting pebbles, each wobbling its own shear band; on the right the MANTA fighter, flat ray-wings of pale mint and green canopy lit from behind by the big cream sun, slides under the first devil trailing amber thruster ribbons and a fan of green shots. Dune ridges step across the frame in flat silhouette bands from sand-stone light to shadowed umber, heat haze breaking the horizon into shimmering raster lines. Warm sky lifting to deep navy at the top edge, never black, thin stars appearing. Ultra-detailed, large-format, clean vector shapes with pixel-art texture accents.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | — |
| guidance | 4.5 | 3.5 | 3.5 | — |
| steps | 36 | 40 | 45 | — |
| seed | 15312 | 15312 | 15312 | — |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d, text, watermark, blurry, pure black, sandcastle, cactus, realistic dust storm`
**Notes:** The 1536x640 strip turns the three threats into readable lanes — ideal site banner. sd3.5 grades the dune silhouette bands crisply. Watch that devils stay hollow-cored funnels, not solid cones.

## dune-worm-dust-devil — DUNE WORM and DUST DEVIL, encounter concept
**Models:** sd3.5-large, flux.1-dev
**Variation:** 3/3 of 3

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, square vertical poster crop, subtle CRT scanline glow. A vertical hunt across a dune column at high noon under twin suns: at the top the great pale cream sun and its small orange companion hang in a bleached gold sky that deepens to warm navy at the corners; through the middle a DUST DEVIL rakes down the frame, a twisted translucent funnel of rust vapor and orbiting grit with a visible hollow core; at the bottom the dune face explodes as a DUNE WORM rears its drill-toothed brass head upward, chasing the fighter that dives along the funnel from above — the KESTREL, steel-blue dart, blue stripe, cyan canopy, orange trail, drawn small against the worm's maw for brutal scale contrast. Sand sheets fall in flat stepped bands of light and umber with crisp pixel edges, heat haze rippling each ridge line. Clean vector shapes with pixel-art texture accents, ultra-detailed, large-format, saturated but limited palette.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 896x1152 | 896x1152 | — | — |
| guidance | 5.0 | 3.5 | — | — |
| steps | 32 | 45 | — | — |
| seed | 15313 | 15313 | — | — |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, logo, watermark, blurry, pure black, three suns, organic snake, pyramids`
**Notes:** Vertical chase composition: worm below, devil through, suns above — maximum depth in a poster crop. flux.1-dev renders the translucent funnel bands cleanly without muddying the ship. Color reference: worm brass with dark seam rivets, grit #f89858 tints.

## dune-expanse-sprite-sheet — In-game sprite sheet: DUNE WORM drill rig, six frames on key green
**Models:** sd3.5-large, flux.1-dev
**Variation:** 1/3 of 3

```text
16-bit SNES-era video game sprite sheet, pixel art style, crisp 1-pixel near-black navy outlines, saturated limited palette, a regular grid of six equal cells in two rows of three with even gutters, read left to right and top to bottom, one per cell in the order listed, the same subject at the same scale, position and light in every cell, on a perfectly flat solid pure bright green chroma-key background, no gradients, no scenery, no text, no labels, no UI. Subject: DUNE WORM — a brass ring-plated boring worm, a conical spiral-drill-maw head plus stackable body rings. Six frames, side view facing left. The cells in order: head with mouth closed; head revving, drill spinning; head fired open with a pink orb in the maw; head dented and damaged; one plain stackable body-ring segment; one tail-plug ring. Identical silhouette and palette in every cell — only the head state changes across the first four. Chunky crisp pixels, dithered brass highlights.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | — | — |
| guidance | 5.5 | 3.5 | — | — |
| steps | 34 | 40 | — | — |
| seed | 15321 | 15321 | — | — |

**Negative:** (sd3.5/qwen only) `gradient background, text, numbers, labels, photorealistic, 3d render, watermark, soft blur, anti-aliased, real insects, feathers, pure black background, overlapping sprites, perspective distortion, green tint on the subject, green spill, background scenery, cast shadow`
**Notes:** Head, ring and tail-plug are the segment-builder kit — the ring frame repeats at any count for the worm's length. The sand splash at the boring collar is an effect sprite for the decor layer, and the pink drill orb is a bullet — both drawn by hand small or procedurally, never on this sheet. Color reference: brass worm #e8a030-family plating. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

## dune-expanse-sprite-sheet — In-game sprite sheet: DUST DEVIL vapor funnel, four frames on key green
**Models:** sd3.5-large, flux.1-dev
**Variation:** 2/3 of 3

```text
Retro 16-bit pixel art sprite atlas for a desert level of a horizontal arcade shoot-'em-up, flat solid pure bright green chroma-key sheet background, generous even margins, absolutely no text, numbers or annotations. Subject: DUST DEVIL — a twisting rust-colored vapor funnel with a hollow dark core and orbiting grit pebbles. Four frames in a regular grid of two rows of two, read left to right and top to bottom. The frames in order: shear bands at rest position; bands turned a quarter turn, the spiral advancing upward; half turn; three-quarter turn — the silhouette wobbles slightly wider through the spin cycle while pebbles orbit the core. Identical silhouette and palette in every cell — only the band rotation and pebble positions change. Crisp 1-pixel near-black outlines throughout, sand-gold and rust palette, chunky readable pixels, no anti-aliasing, nothing else on the sheet.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | — | — |
| guidance | 5.5 | 3.5 | — | — |
| steps | 34 | 45 | — | — |
| seed | 15322 | 15322 | — | — |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d, gradients, smooth shading, text, watermark, sand dunes background, cactus, real beetle, pure black background, overlapping sprites, perspective distortion, green tint on the subject, green spill, background scenery, cast shadow`
**Notes:** Square texture-page format. The quarter-turn steps are the hard part — regenerate before accepting smeared bands; check the funnel reads as one object spinning, not as sliding stripes. The devil's grit shots are bullets — procedural; the dust trail it drags belongs to the backdrop and effect layers. Color reference: devil rust #f89858 vapor over the hollow dark core. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

## dune-expanse-sprite-sheet — In-game sprite sheet: HUSK CRAWLER walker drone, five frames on key green
**Models:** flux.1-dev, sd3.5-large
**Variation:** 3/3 of 3

```text
Pixel art sprite sheet, SNES 16-bit arcade style, flat solid pure bright green chroma-key sheet, thick even margins, no text, no frame lines, no labels. A wide horizontal filmstrip of five equal cells in one row, read left to right, the same subject at the same scale and light in every cell. Subject: HUSK CRAWLER — a squat beetle-shaped walker drone with overlapping charcoal carapace plates, six stubby legs and a dim red eye-bar glowing under the shell rim. Five frames, side view facing left. The frames in order: walk step one, front legs advanced; walk step two; walk step three; walk step four, rear legs advanced; damaged — shell flipped open around the glowing violet weak-point core with the legs collapsed. Identical silhouette and palette in every cell — only the leg phase and the shell state change. Crisp 1-pixel near-black navy outlines around every sprite, saturated desert palette of slate and rust with red and violet accents, chunky cartridge-era readability, dithered highlights on metal only.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | — | — |
| guidance | 5.0 | 3.5 | — | — |
| steps | 32 | 40 | — | — |
| seed | 15323 | 15323 | — | — |

**Negative:** (sd3.5/qwen only) `text, labels, UI, gradient background, photorealistic, 3d render, blurry, anti-aliasing, bloom, real desert photo, watermark, pure black background, overlapping sprites, perspective distortion, green tint on the subject, green spill, background scenery, cast shadow`
**Notes:** Landscape filmstrip layout; easiest to eyeball walk-cycle continuity across the wide strip. flux.1-dev for crisp leg separation. The crawler's sand wake is a decor-layer smudge, not a sprite. Color reference: eye-bar #ff3a3a, belly core #8a48e8, carapace charcoal. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

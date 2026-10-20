# 40 — Zone E: Tempest Ridge enemies
# Storm cloud deck, saw-tooth snow ridges and slanting rain: thunderheads and steed foals.
# Seed slots: concept 15511-15513, sprite sheet 15521-15523.
# v2 (R3-01): sprite sheets sit on the K3 key background (flat pure green #00FF00) with
# 4–6 frames per animation (see 00-style-kernel.md); encounter concepts keep their navy scenes.

## thunderhead-steed-foal — Zone E enemies: a thunderhead storm cell calving a homing steed foal above the cloud deck
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/3 of 3

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, widescreen 16:9 side-scrolling arcade composition, subtle CRT scanline glow. Above a roiling sea of storm clouds under a lifted deep-navy sky crossed with slanting cold rain, jagged saw-tooth snow ridges pierce the cloud floor in the far distance. Center-right, a THUNDERHEAD — a hostile storm cell of the IRON TIDE: a dense round-anvil cloud mass in slate and charcoal grays with a single glowing lilac eye at its heart, arcs of violet-white electricity crawling along its underbelly like cable-work, its rim boiling outward. From that boiling rim, mid-calving, comes a STEED FOAL — a small homing seahorse of riveted steel plates and tense cables, curled tail, arched neck, a warm amber lamp-light behind its faceplate, static sparks jumping between its fins — still trailing a wisp of cloud-stuff from its birth. Lower left, a sleek steel-blue dart fighter with a bold blue hull stripe, cyan canopy and bright orange engine glow dives between the pair, thrusters flaring, leaving a white vapor line in the rain, while pink and red round shots with bright cores and dark rims string out of the thunderhead toward it. One violet lightning fork connects cloud to ridge behind them, orange-white explosion bloom dotting a spur of rock.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 50 | 30 |
| seed | 15511 | 15511 | 15511 | 15511 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, blurry, pure black background, human figures, cartoon mascot, soft pastel palette, sunny sky, calm clouds, wings on the seahorse`
**Notes:** The calving moment ties the foals to their boss parent (a vast seahorse that rides the storm) with a single image — the cloud-stuff trail is the storytelling detail. Lightning lilac ~#b84cff family; keep rain as diagonal light-gray strokes, not blur.

## thunderhead-steed-foal — Zone E enemies: patrol line of thunderheads on the horizon with foals sweeping down at the fighter
**Models:** sd3.5-large, flux.2-dev
**Variation:** 2/3 of 3

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, ultrawide panoramic arcade composition, subtle CRT scanline glow. A long horizon of the Tempest Ridge: an endless deck of roiling slate storm clouds under a deep-navy sky streaked with slanting rain, saw-tooth snow mountains lining the far edge like broken teeth, everything cold and wind-driven. Along the upper third, a patrol line of five THUNDERHEADS — round-anvil storm cells of the machine swarm, charcoal-gray with boiling rims, each nursing one glowing lilac eye and crawling violet arcs along its belly — spaced like watchtowers across the width of the frame. From the nearest two, three STEED FOALS peel off in pursuit: small homed seahorses of riveted steel plates and taut cables, curled tails streaming, amber faceplate lamps burning, static crackling between stiff dorsal fins, dropping in wide S-curves toward the lower left. There, a lone sleek steel-blue dart fighter with bold blue hull stripe and cyan canopy runs flat along the cloud tops, orange engine flare stretched, skimming a ridge spike, a fan of pink and violet shots with bright cores chasing it from above. One foal is caught mid-barrel-roll, a second frames the fighter's wingtip with its snout; a distant orange-white detonation winks inside the cloud deck between the watchtower cells.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 4.5 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 40 | 45 | 30 |
| seed | 15512 | 15512 | 15512 | 15512 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, blurry, pure black background, human figures, cartoon mascot, soft pastel palette, duplicate fighter, extra player ships, sunny sky`
**Notes:** Panoramic = Zone E's identity as a ridge-line gauntlet; the five-cell patrol reads as airspace control. Count guard: keep the thunderheads clearly round-anvil shaped and the foals clearly seahorse-shaped, or the frame muddles. Exactly one fighter.

## thunderhead-steed-foal — Zone E enemies: portrait descent into a thunderhead's mouth as foals silhouette in the lit cloud dome
**Models:** sd3.5-large, flux.1-dev
**Variation:** 3/3 of 3

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, vertical poster composition looking straight up into a storm, subtle CRT scanline glow. From the top of the frame, a colossal THUNDERHEAD fills the sky like a dome: an anvil of boiling charcoal and slate cloud, its underside lit from within by pulsing lilac light, a single huge glowing eye at its center staring down, violet lightning forks radiating from it along the cloud floor like cracks in ice. Falling diagonally through that lit dome, five STEED FOAL silhouettes — small seahorse shapes of plates and cables, curled tails, tiny amber face-lamps glowing — arranged in a descending hunting spiral, each backlit into near-black with a hard violet rim. At the very bottom of the frame, tiny against the storm, a steel-blue dart fighter with cyan canopy and orange engine trail climbs straight up into it, vapor cones snapping off its wings in the updraft, slanting rain rendered as long pale strokes over the whole image, saw-tooth snow ridge tips just visible at the lower corners where the cloud deck drops away. Deep-navy unlit cloud masses frame the edges, never pure black, one distant orange-white flash of a struck ridge.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 896x1152 | 896x1152 | 896x1152 | 896x1152 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 45 | 40 | 30 |
| seed | 15513 | 15513 | 15513 | 15513 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, blurry, pure black background, human figures, cartoon mascot, soft pastel palette, duplicate fighter, tentacles, whale shape`
**Notes:** Vertical ascent poster — the swarm's airspace as a cathedral of storm. The eye-lit dome doubling as boss foreshadowing is intentional; keep the eye small enough (a third of the dome at most) that the thunderhead still reads as an enemy class, not the boss.

## tempest-ridge-sprite-sheet — In-game pixel sprite sheet: BOLT DRONE firing states, four frames on key green
**Models:** sd3.5-large, flux.1-dev
**Variation:** 1/3 of 3

```text
SNES-era 16-bit pixel art, flat colored pixel sprites with crisp 1-pixel near-black navy outlines and simple two-tone dithered shading, arranged as a regular grid of four equal cells in two rows of two, read left to right and top to bottom, on a completely flat solid pure bright green chroma-key background, one firing state per cell, the same drone at the same scale, position and light in every cell, no scenery, no glow bleeding into the background, no text, no labels, no UI. Subject: the BOLT DRONE — a round-bodied one-prop drone spitting a short violet arc between two prong tips, lightning lilac ~#b84cff. Four frames, side view facing left. The frames in order: idle before the charge with the prong tips dark and the prop a blur, the charge with a violet arc strand building between the tips, the release with the short arc leaving the prongs and the tips flared wide, and the recover with the tips smoking and the prop still spinning. Identical silhouette and palette in every cell — only the firing state changes. Chunky readable arcade silhouettes, saturated limited palette, crisp pixel-grid edges, every sprite facing left.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.5 | 3.5 | 3.5 | 4.0 |
| steps | 34 | 40 | 40 | 30 |
| seed | 15521 | 15521 | 15521 | 15521 |

**Negative:** (sd3.5/qwen only) `text, labels, letters, numbers, watermark, photograph, 3d render, smooth gradients, anti-aliased, glow on background, scenery, flat background replaced, fused sprites, overlapping sprites, pure black background, perspective distortion, green tint on the subject, green spill, background scenery, cast shadow`
**Notes:** The drone's four firing states cover its arc attacks. The arc-bolt pixels, the pink and lilac bright-core round shots, the diagonal rain strokes and the tiny explosion frames are not enemy-sheet art — the shots follow the kernel's bullet rules and the burst is a particle (bible §5.4, §6). Lightning lilac ~#b84cff. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

## tempest-ridge-sprite-sheet — Square pixel sprite sheet: STEED FOAL swim cycle, six frames on key green
**Models:** sd3.5-large, flux.1-dev
**Variation:** 2/3 of 3

```text
SNES-era 16-bit pixel art, flat colored pixel sprites with crisp 1-pixel near-black navy outlines and simple two-tone dithered shading, arranged as a square sprite sheet — a regular grid of six equal cells in two rows of three, read left to right and top to bottom, on a completely flat solid pure bright green chroma-key background, one swim pose per cell, the same foal at the same scale, position and light in every cell, no scenery, no text, no labels, no UI. Subject: the STEED FOAL — a small riveted steel-plate seahorse with curled tail and amber face-lamp, the lamp warm to contrast the cold deck. Six frames, side view facing left. The frames in order: tail coiled at rest, tail uncoiling mid-thrust, fins braced with static ticks, a banking lean, a nose-down stoop, and a level glide. Identical silhouette and palette in every cell — only the pose changes. Chunky arcade silhouettes, saturated limited palette, crisp pixel-grid edges, every sprite facing left.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.5 | 3.5 | 3.5 | 4.0 |
| steps | 34 | 45 | 40 | 30 |
| seed | 15522 | 15522 | 15522 | 15522 |

**Negative:** (sd3.5/qwen only) `text, labels, letters, numbers, watermark, photograph, 3d render, smooth gradients, anti-aliased, glow on background, scenery, fused sprites, overlapping sprites, human figures, pure black background, perspective distortion, green tint on the subject, green spill, background scenery, cast shadow`
**Notes:** The echelon and broken-pair formations of the old kit sheet are behavior mockups, not art — the game moves one foal sprite per frame. The lamp's hot flare is these frames with the lamp's few pixels lifted to white-hot, and the split spawn is the same silhouette drawn at half size — both hand cleanups on this set, never extra subjects on the sheet. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

## tempest-ridge-sprite-sheet — Wide strip pixel sprite sheet: THUNDERHEAD life cycle, six frames on key green
**Models:** flux.1-dev, sd3.5-large
**Variation:** 3/3 of 3

```text
SNES-era 16-bit pixel art, flat colored pixel sprites with crisp 1-pixel near-black navy outlines and simple two-tone dithered shading, arranged as a wide horizontal filmstrip of six equal cells in one row, read left to right, on a completely flat solid pure bright green chroma-key background, one life-cycle state per cell, no scenery, no glow bleeding into the background, no text, no labels, no UI. Subject: the THUNDERHEAD storm cell — a boiling charcoal cloud that swells to an anvil shape with a glowing lilac eye and belly arcs of violet-white electricity. Six frames, all the same round-anvil cloud silhouette with only the state changing, facing left. The frames in order: a dark puff, a puff with a lilac pinprick eye, a swelling anvil with the eye opening, the full storm cell with belly arcs at maximum spread across the underside, the eye squinting as it discharges one heavy bolt, and the cell deflating back to a puff. Saturated limited palette, crisp pixel-grid edges, large readable clusters.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 15523 | 15523 | 15523 | 15523 |

**Negative:** (sd3.5/qwen only) `text, labels, letters, numbers, watermark, photograph, 3d render, smooth gradients, anti-aliased, glow on background, scenery, fused sprites, inconsistent character design, different cloud each frame, pure black background, perspective distortion, green tint on the subject, green spill, background scenery, cast shadow`
**Notes:** Filmstrip continuity rule again — identical silhouette every frame, only the state changing, is the load-bearing clause; check it first when triaging. Flux.1-dev leads. The foal pursuit strip lives on the square sheet; the forked arc-bolts, round shots, rain strokes and the white flash square are procedural effects (bible §5.4, §6), though that one-frame flash is the zone's most reused. The five eye close-up states double as the off-screen threat indicator and may ride this strip as hand-cropped variants. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

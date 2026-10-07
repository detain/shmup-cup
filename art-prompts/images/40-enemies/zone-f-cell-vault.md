# 40 — Zone F: Cell Vault enemies
# Living walls of pulsing green cells: chasing mitosis cells and wall-grown vault claws.
# Seed slots: concept 15611-15613, sprite sheet 15621-15623.

## chaser-cell-vault-claw — Zone F enemies: a chaser cell mid-mitosis while vault claws uncoil from the living wall
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/3 of 3

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, widescreen 16:9 side-scrolling arcade composition, subtle CRT scanline glow. Inside the Cell Vault, a corridor grown rather than built: walls of pulsing green cells in a deep moss-to-jade ramp, fleshy folds ribbing the ceiling, pores blinking slow amber light, the whole organism breathing. Two threats dominate the mid-field. A CHASER CELL — a fist-tight sphere of translucent green membrane with a brighter dividing nucleus glowing inside — caught at the ugliest half-second of MITOSIS: the sphere waist-pinched into a dumbbell, two nuclei pulling apart on a spindle of pale filaments, the stretched membrane bridging them, about to become two hunters that will each remember where the player ran. Behind and below it, a VAULT CLAW erupting from the living wall: an eight-link tentacle hook of segmented bone-white plates wrapped in green tissue, each joint sparking a bead of fluid, the great curved talisman tip raking the air in a grab-arc that trails the fighter's last position. Lower left, a sleek steel-blue dart fighter with bold blue hull stripe and cyan canopy skims away hard, orange engine flare smearing along the membrane floor, pink and magenta round shots with bright cores and dark rims leaking from the pores around it, one purple spore-burst blooming where a claw-tip struck rock. Deep-navy shadow wells in the tissue folds, never pure black.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 50 | 30 |
| seed | 15611 | 15611 | 15611 | 15611 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, blurry, pure black background, human figures, cartoon mascot, soft pastel palette, red gore, exposed muscle, mechanical gears, wings on the cell`
**Notes:** The mitosis pinch is the hero beat — it explains the chaser's split mechanic in one silhouette. Keep the vault green ramp (color reference #2a4434→#385a44) clearly plant-flesh, not blood: negatives ban gore deliberately. Claw reads as bone-plated tendril, eight links if the model can count, otherwise "clearly multi-segmented."

## chaser-cell-vault-claw — Zone F enemies: a drift of chaser cells filling the vault chamber while a claw hauls a tender through the wall
**Models:** sd3.5-large, flux.2-dev
**Variation:** 2/3 of 3

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, ultrawide panoramic arcade composition, subtle CRT scanline glow. A vast organ-hall of the Cell Vault stretched across a panoramic frame: opposite walls of breathing green cell-mesh in a moss-to-jade ramp, ceiling ribbed with fleshy folds dripping slow amber beads, floor a soft membrane plain dimpled where things have landed. The hall is filling with CHASER CELLS — dozens of translucent green membrane spheres with hot pale nuclei, drifting in a slow convection current like an incoming tide, several caught mid-division as pinched dumbbells with spindles of filament strung between two nuclei, each pair already angling toward the same side of frame. In the right third, a VAULT CLAW — an eight-link bone-plated tentacle hook sheathed in green tissue — is hauled fully out of its wall socket, its joints leaking fluid beads, dragging a damaged mechanical TENDER drone through the torn membrane: the wide flat-bellied carrier sparkles with green coolant, belly hatch popped, and a stream of small pink-core shots spilling from it like escaping seed. At the far left edge a lone steel-blue dart fighter with cyan canopy and orange engine glow banks out of frame, the entire drift turning with it. Deep-navy shadow wells swallow the hall's ends, never pure black; one violet spore-glow pulses at each torn socket.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 4.5 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 40 | 45 | 30 |
| seed | 15612 | 15612 | 15612 | 15612 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, blurry, pure black background, human figures, cartoon mascot, soft pastel palette, red gore, duplicate fighter, extra player ships, bubbles underwater`
**Notes:** The "incoming tide" version of the chase — scale horror instead of moment horror. The claw hauling a tender shows the vault's immune logic (it recaptures its own machines). Keep cells clearly spherical with visible nuclei; if the model starts making amoeba blobs, raise CFG slightly on sd3.5.

## chaser-cell-vault-claw — Zone F enemies: portrait throat of the vault, cells raining down past a claw arch as the fighter climbs
**Models:** sd3.5-large, flux.1-dev
**Variation:** 3/3 of 3

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, vertical poster composition looking up the throat of a living structure, subtle CRT scanline glow. The frame is the inside of a great vertical gullet of the Cell Vault: circular walls of pulsing green cell-mesh in a moss-to-jade ramp narrowing upward, ringed with fleshy valve folds that stand half-open, pores shining amber down the whole height, the far top a pinprick of pale light. Raining down through the throat in a slow spiral, a swarm of CHASER CELLS: translucent membrane spheres with hot pale nuclei, dozens of them, many pinched mid-mitosis into dumbbells trailing spindle filaments that whip like sparks of pale thread, the closest ones large and soft-edged at the frame borders, the distant ones a scatter of green beads. Crossing the lower third, a VAULT CLAW anchored in the right wall has hooked the throat like an archer's brace — eight bone-plated segments sheathed in green tissue, each joint beading fluid, the massive curved tip pointing up the swarm's column. At the bottom of the frame, tiny, a steel-blue dart fighter with bold blue stripe, cyan canopy and a bright orange engine trail climbs straight into it, vapor snapping off its wings, pink and magenta shots with bright cores falling around it like ember-rain. Deep-navy pools ring the throat wall, never pure black; the valve folds pulse with one synchronized violet glow.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 896x1152 | 896x1152 | 896x1152 | 896x1152 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 45 | 40 | 30 |
| seed | 15613 | 15613 | 15613 | 15613 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, blurry, pure black background, human figures, cartoon mascot, soft pastel palette, red gore, duplicate fighter, tentacle monster face, teeth in the wall`
**Notes:** Ascent-poster version of the descent the player actually fights (Zone F runs horizontally, but the vault's vertical gullets are its signature architecture). The claw-as-brace gives the spiral a fulcrum. Watch that wall folds don't read as a monstrous mouth — ban teeth in the negative.

## cell-vault-sprite-sheet — In-game pixel sprite sheet: chaser cell mitosis cycle, vault claw link states, polyp turret set on flat navy
**Models:** sd3.5-large, flux.1-dev
**Variation:** 1/3 of 3

```text
SNES-era 16-bit pixel art, flat colored pixel sprites with bold dark navy outlines and simple two-tone dithered shading, arranged as a clean sprite sheet on a completely flat deep-navy background, no scenery, no glow bleeding into the background, no text, no labels, no UI. Organized in horizontal bands: top band — the CHASER CELL mitosis cycle in seven frames: a round translucent green membrane sphere with a pale nucleus, nucleus stretching, sphere waisting into a dumbbell, filament spindle bridge at full stretch, the pinch snapping to two touching daughters, the pair separating, and two independent cells facing left. Middle band — a VAULT CLAW in five states: fully sheathed socket bump in green tissue, first bone-white link emerging, half-extended four-link arc, full eight-link extended hook with joints beaded, and the recoil snap with a spray of fluid dots. Bottom band — POLYP TURRETS and shared effects: a fleshy green wall-polyp in three firing states (closed bud, blooming mouth, discharged puff), floating violet spore pixels, pink and magenta round shots with bright cores and dark rims, and a small green rupture-burst effect in two frames. Chunky readable arcade silhouettes, saturated limited palette, crisp pixel-grid edges, every sprite facing left.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.5 | 3.5 | 3.5 | 4.0 |
| steps | 34 | 40 | 40 | 30 |
| seed | 15621 | 15621 | 15621 | 15621 |

**Negative:** (sd3.5/qwen only) `text, labels, letters, numbers, watermark, photograph, 3d render, smooth gradients, anti-aliased, glow on background, scenery, flat background replaced, fused sprites, overlapping sprites, red blood, pure black background, perspective distortion`
**Notes:** The seven-frame mitosis band is the crown jewel — it's the only enemy in the game whose sprite sheet doubles as a tutorial. Vault greens #2a4434→#385a44; spores stay violet so they never read as blood.

## cell-vault-sprite-sheet — Square pixel sprite sheet: cell family sizes and damage states, claw grab poses, polyp spore patterns on flat navy
**Models:** sd3.5-large, flux.1-dev
**Variation:** 2/3 of 3

```text
SNES-era 16-bit pixel art, flat colored pixel sprites with bold dark navy outlines and simple two-tone dithered shading, arranged as a square sprite sheet grid on a completely flat deep-navy background, no scenery, no text, no labels, no UI. Top row — CHASER CELLS at four sizes (grandmother sphere twice the fighter, adult, daughter, seed bead), then the same adult cell in three damage states: membrane dimpled, nucleus cracked leaking pale light, ruptured into a sagging husk with a popping-spark outline. Second row — a single VAULT CLAW in five grab poses: idle curl, reaching forward, hooked-in, hauling upward, and shattered at the third link with tissue fraying and two bone fragments falling. Third row — POLYP TURRET batteries: a wall-bud polyp, a twin polyp sharing one base, and four discharged spore patterns — a straight shot line, a slow three-spore arc, a five-spore fan, and a lingering violet cloud wisp. Fourth row — shared effect pixels: pink and magenta bright-core round shots with dark rims, green fluid droplet beads with short tails, a small membrane tear decal, a synchronized pulse ring, and two floating amber pore-lights. Chunky arcade silhouettes, saturated limited palette, crisp pixel-grid edges, every sprite facing left.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.5 | 3.5 | 3.5 | 4.0 |
| steps | 34 | 45 | 40 | 30 |
| seed | 15622 | 15622 | 15622 | 15622 |

**Negative:** (sd3.5/qwen only) `text, labels, letters, numbers, watermark, photograph, 3d render, smooth gradients, anti-aliased, glow on background, scenery, fused sprites, overlapping sprites, human figures, red blood, pure black background, perspective distortion`
**Notes:** Size laddering (grandmother → seed bead) covers the chaser's spawn variety without redrawing; the polyp spore-pattern row is straight pattern-DSL reference for pattern authors. This is the most "system sheet" of the nine zone sheets — lean into that in triage.

## cell-vault-sprite-sheet — Wide strip pixel sprite sheet: mitosis filmstrip with claw extension row and spore effects on flat navy
**Models:** flux.1-dev, sd3.5-large
**Variation:** 3/3 of 3

```text
SNES-era 16-bit pixel art, flat colored pixel sprites with bold dark navy outlines and simple two-tone dithered shading, arranged as a wide horizontal filmstrip sheet on a completely flat deep-navy background, no scenery, no glow bleeding into the background, no text, no labels, no UI. Main band — the eight-frame CHASER CELL division cycle evenly spaced left to right, always the same round membrane silhouette and pale nucleus color, only the state changing: rest, nucleus elongating, membrane waisting, dumbbell with filament bridge, pinch to two touching daughters, daughters drifting apart, pair each pulsing once, and the two settled independents facing left. Second band — a VAULT CLAW extension strip in six frames: socket bump bulging, one bone-white link out, four links arcing, full eight-link hook raised, tip snapped shut on nothing with motion notches, and retraction to the socket puffing fluid beads. Bottom sparse row — vault effects: closed and blooming POLYP TURRET buds, violet spore pixels with faint trails, pink and magenta bright-core round shots with dark rims, a single green fluid droplet on a short tail, and a two-frame membrane rupture burst. Large readable clusters, saturated limited palette, every sprite facing left, crisp pixel-grid edges.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 15623 | 15623 | 15623 | 15623 |

**Negative:** (sd3.5/qwen only) `text, labels, letters, numbers, watermark, photograph, 3d render, smooth gradients, anti-aliased, glow on background, scenery, fused sprites, inconsistent character design, different cell each frame, human anatomy, pure black background, perspective distortion`
**Notes:** Continuity clause again ("same round membrane silhouette, only the state changing"). The "human anatomy" negative guards against the mitosis strip drifting into biology-textbook style — keep it arcade-cell, not microscope-cell.

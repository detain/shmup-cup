# 40 — Zone I: Abyssal Throne enemies
# Black-blue deep water, bioluminescent specks, rock spires, swaying weed.
# Seed slots: concept 15911-15913, sprite sheet 15921-15923.
# v2 (R3-01): sprite sheets sit on the K3 key background (flat pure green #00FF00) with
# 4–6 frames per animation (see 00-style-kernel.md); encounter concepts keep their navy scenes.

## gulper-depth-mine — the lantern-dark hunt
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/3 of 3

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, widescreen arcade side-scrolling composition, subtle CRT scanline glow. In the lightless deep of a black-blue water trench, the only illumination bioluminescent: a field of tiny glowing specks drifting from dark teal into pale cyan like an inverted star map, rock spires rising in silhouette on both sides, tall weed swaying slow left-to-right across the whole frame. Centered, a GULPER drifts right toward the viewer's ship — a huge-headed deep-sea fish, its mouth a cavernous hinged cage of pale bone ridges taking up half its body, slack-jawed and yawning wide, tiny vicious eyes above the gape, a frayed bioluminescent lure filament dangling from its crown burning pale cyan, its body tapering back into eel-quiet charcoal. Around and below it, a quiet minefield: three DEPTH MINES rest on and hover above the weed — black rounded hulls studded with short contact spikes, each with a single slow-pulsing cyan eye-light, one trailing a loose anchor chain into the dark, one drifting free with a barnacle-crusted flank. From the left edge the MANTA glides in, flat ray-wing pale mint hull dimmed by the depth, green canopy the brightest thing in the water, amber twin thrusters throwing short warm cones that catch the drifting specks — and directly ahead of its path one mine's pulse has just skipped to a faster beat. No explosions yet, pure dread of held pressure. Deep-navy gloom, never pure black. No text, no UI elements.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 50 | 30 |
| seed | 15911 | 15911 | 15911 | 15911 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, blurry, pure black background, sunlight from above, bright open water, warm color cast, human figures, scuba divers, cartoon fish, friendly expression, mines with red lights, coral reef`

**Notes:** Color reference: biolume specks ramp #16485a→#6ad8e0, lure filament #6ad8e0, mine eye-cyan pulse #6ad8e0, gulper body near-black green-charcoal with pale bone jaw. Everything lit by point sources — the negative bans the sunlit-water default these models love. The accelerating mine pulse in the manta's lane is the whole story of the frame; if the mines read as inert scenery, add "one mine's eye-light mid-brighten, brighter than the others".

---

## gulper-depth-mine — ultrawide ambush corridor
**Models:** sd3.5-large, flux.2-dev
**Variation:** 2/3 of 3

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, ultra-wide side-scrolling arcade composition, subtle CRT scanline glow. An ultrawide trench corridor of the abyssal plain, camera in profile: the floor is a thick swaying carpet of dark weed, the walls are towering rock spires that pinch the corridor narrow in the middle distance, and through the pinch streams a slow current you can feel, drawn as faint cyan particle streaks. On the right side of the frame a GULPER pack hunts the corridor mouth — two large-headed fish with cavernous pale-bone jaws, one already angled for a strike with its lure filament flaring brighter, a third gulper only suggested by its lure-glow behind a spire, still invisible. Along the weed line, six DEPTH MINES sit half-buried like spiked black fruit, eye-lights out of phase with each other so the trench floor twinkles in a rolling wave of slow cyan pulses; one mine has torn its anchor free and is rising quietly through the current streaks. Entering from the left, small against the whole corridor, the KESTREL threads between two spires, steel-blue dart hull, bold blue stripe, cyan canopy reading as a second artificial light in the dark, orange engine glow streaming backwards into the current. The composition is a throat, and the ship has just entered it. Deep-navy pressure dark at the frame edges, never pure black. No text, no UI elements.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 4.5 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 40 | 45 | 30 |
| seed | 15912 | 15912 | 15912 | 15912 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, blurry, pure black background, sunlight from above, bright open water, warm color cast, human figures, scuba divers, cartoon fish, mines with red lights, equal blinking mine lights, single gulper`

**Notes:** Color reference: current streaks #6ad8e0 at low alpha, gulper lure flare #6ad8e0 to white-hot core, mine out-of-phase pulses teal-to-cyan, kestral stripe #3858f0. The out-of-phase mine lights are the zone signature — the rolling twinkle reads as movement even in a still image. The third gulper as glow-only is a deliberate hidden-object detail; drop it if the model starts drawing disembodied lures too large.

---

## gulper-depth-mine — vertical ascent through the spire field
**Models:** sd3.5-large, flux.1-dev
**Variation:** 3/3 of 3

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, vertical poster composition, subtle CRT scanline glow. A vertical column of abyssal water, camera looking up along a rock spire that runs the full height of the frame like a black lighthouse, weed ribboning down its flanks. Coiled around the spire, a GULPER has mistaken the structure for a mate or a bone — its huge hinged head is pressed against the rock at the top third, pale bone jaw-ridges half-clamped on empty stone, jaw-light spilling down the spire's face, its charcoal body wound two full turns around the tower with the tail drifting free at the bottom of the frame, lure filament brushing the rock and scattering bright cyan sparks where it touches. Below it, clinging to the spire's midsection in the shadow of the gulper's coils, a cluster of five DEPTH MINES that have drifted in and anchored themselves to the rock — spiked black hulls with slow eye-lights blinking at their own lazy rhythm, one of them cracked open on the rock showing an inner glow hotter than its eyes. In the bottom corner the MANTA climbs along the spire's edge, pale mint ray-wings tucked for the narrow lane, green canopy tilted up reading the coils, amber twin thrusters dimmed to short cautious cones, threading between the anchored mines and the wounded coil-gap. Everything above the gulper fades to pressure-dark deep-navy, never pure black. No text, no UI elements.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 896x1152 | 896x1152 | 896x1152 | 896x1152 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 45 | 40 | 30 |
| seed | 15913 | 15913 | 15913 | 15913 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, blurry, pure black background, sunlight from above, bright open water, warm color cast, human figures, scuba divers, cartoon fish, friendly expression, horizontal composition, gulper swimming in open water`

**Notes:** Color reference: jaw-light on rock = broad cyan wash #6ad8e0 fading fast, cracked-mine inner glow a hotter white-cyan, manta mint #c8e0d0. Coil-wrap on a vertical spire is a hard pose for any model — the "two full turns, tail free at bottom" wording keeps it geometric; if the body melts into the rock, push guidance to 6.0 on sd3.5 before changing the text.

---

## abyssal-throne-sprite-sheet — In-game sprite sheet: GULPER swim and strike, six frames on key green
**Models:** sd3.5-large, flux.1-dev
**Variation:** 1/3 of 3

```text
SNES-era 16-bit pixel art sprite sheet for a retro arcade shoot-'em-up, perfectly flat solid pure bright green chroma-key background, crisp 1-pixel near-black navy outlines, saturated limited palette, dithered shading, no scene, no text, no labels, no UI. A regular grid of six equal cells in two rows of three, read left to right and top to bottom, one pose per cell in the listed order, the same subject at the same scale and light in every cell. Subject: the GULPER — huge-headed deep-sea fish with a cavernous pale-bone hinged jaw and tiny vicious eyes — side view facing left. Six frames in order: slow-swim with the mouth fully agape; jaw halfway closing; jaw shut cruising with the lure filament dim; the strike lunge with the head slightly larger and the lure filament flaring pale cyan; the return with the jaw shut and the flare fading; a damaged state with the lure filament dark and frayed. Identical head shape, jaw-ridge count and palette in every cell — only jaw, flare and damage change. All lighting cool cyan from within each body, crisp at game scale.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.5 | 3.5 | 3.5 | 4.0 |
| steps | 34 | 40 | 40 | 30 |
| seed | 15921 | 15921 | 15921 | 15921 |

**Negative:** (sd3.5/qwen only) `text, labels, numbers, watermark, photorealistic, 3d render, scene background, environment, gradient background, blurry, inconsistent character design, silhouette changing between frames, merged sprites, overlapping rows, warm orange lighting, red mine lights, friendly fish face, pure black background, perspective distortion, green tint on the subject, green spill, background scenery, cast shadow`

**Notes:** Color reference: lure and eye-light #6ad8e0, gulper body charcoal-green near-black, jaw bone pale gray-green. The lure filament flare is part of the gulper's strike cells, never a separate sprite. The drifting bioluminescent specks and the filament's isolated glow states are background-field and composite material — they belong to the zone's backdrop layers (R3-06), not to an enemy sheet. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

---

## abyssal-throne-sprite-sheet — Square sprite sheet: DEPTH MINE pulse and chain states, six frames on key green
**Models:** sd3.5-large, flux.1-dev
**Variation:** 2/3 of 3

```text
SNES-era 16-bit pixel art sprite sheet on a perfectly flat solid pure bright green chroma-key background, square layout, crisp 1-pixel near-black navy outlines, saturated limited palette, dithered shading, no scene, no text, no labels, no UI. A regular grid of six equal cells in two rows of three, read left to right and top to bottom, one frame per cell in the listed order, the same subject family at the same light in every cell. Subject: the DEPTH MINE — a rounded black hull studded with short contact spikes, a single eye-light in the center — facing left. Six frames in order: large hull with the eye-light dark; large hull with the eye-light burning bright cyan mid-pulse; small hull with the eye-light dark; small hull with the eye-light burning bright; the mine free-drifting with its anchor chain severed and trailing loose links; the exploded remains as a ring of loose spikes with a fading cyan glow at the center. Identical hull and spike layout in every surviving frame — only size, eye state and the chain change. Cool interior glow on every lit body, everything inside its cell, pixel-perfect spacing, no merged outlines.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.5 | 3.5 | 3.5 | 4.0 |
| steps | 34 | 45 | 40 | 30 |
| seed | 15922 | 15922 | 15922 | 15922 |

**Negative:** (sd3.5/qwen only) `text, labels, numbers, watermark, photorealistic, 3d render, scene background, environment, gradient background, blurry, inconsistent character design, merged sprites, overlapping grid cells, missing outlines, warm orange lighting, red mine lights, pure black background, perspective distortion, green tint on the subject, green spill, background scenery, cast shadow`

**Notes:** Color reference: bright-eye pulse #6ad8e0, spike-ring remains #16485a fading. The mine-scale pair (large/small at the same pulse) gives an immediate size-language test for the sheet; check the small mine's spikes survive dithering — at true game scale they tend to vanish. The coiled-chain resting state and the slow-roll drift angle can ride as extra cells on a follow-up sheet; the gulper's wounded-head close-ups live on this file's grid sheet, and the mine's drift-pulse strip (chain parting link by link, upward roll, eye crossing dark to bright) composes from these cells and gets its own filmstrip in the next round. The environment kit from the old right column — weed tufts, rock-spire shoulder, drifting biolume specks — is backdrop and decor material (R3-06), not an enemy sheet. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

---

## abyssal-throne-sprite-sheet — Wide strip sprite sheet: GULPER strike loop, six frames on key green
**Models:** flux.1-dev, sd3.5-large
**Variation:** 3/3 of 3

```text
SNES-era 16-bit pixel art sprite filmstrip on a perfectly flat solid pure bright green chroma-key background, wide horizontal sheet, crisp 1-pixel near-black navy outlines, saturated limited palette, dithered shading, no scene, no text, no labels, no UI. A single wide horizontal filmstrip of six equal cells in one row, read left to right, one frame per cell, the same subject at the same scale and light in every cell. Subject: the GULPER's strike loop, side view facing left — huge-headed deep-sea fish with a cavernous pale-bone hinged jaw and tiny vicious eyes. Six frames in order: cruising with the jaw half-open and the lure filament dim; the filament flaring bright as the head recoils slightly; the full lunge with the jaw cage thrown maximum wide and the body stretched; a bite-close frame with the jaw shut and a few cyan lure-sparks still scattering; the head easing back with the flare fading; the settle-back to cruising pose matching the first frame exactly for a seamless loop. Identical hull design in every frame — only jaw, recoil and the filament flare change. All cool internal cyan glow, hard readable silhouette at game scale.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 15923 | 15923 | 15923 | 15923 |

**Negative:** (sd3.5/qwen only) `text, labels, numbers, watermark, photorealistic, 3d render, scene background, gradient background, blurry, inconsistent character design, silhouette changing between frames, merged frames, extra enemies, warm orange lighting, red mine lights, pure black background, perspective distortion, green tint on the subject, green spill, background scenery, cast shadow`

**Notes:** Color reference: filament flare #6ad8e0 to white-hot core, bite-sparks scattering cyan. The "settle-back matching the first frame exactly" clause makes this strip a usable loop — verify frame one and frame six silhouettes line up before slicing. The scattering lure-sparks at bite-close read as additive particles; keep them minimal here and let the fx material (bible §5.4, §6) carry them in game. The depth mine's drift and pulse states are covered by this file's square sheet, and its chain-parting drift strip composes from those cells in the next round. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

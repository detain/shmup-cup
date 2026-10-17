# 30 — Boss HI-RES documentation set
# One ultrawide 1536x640 "documentation quality" plate per campaign boss (HB-01..AA-09 + HK-10
# set aside — Hollow King gets a 896x1152 vertical since he fills the screen).
# Full-hull readable silhouettes for website/bestiary pages. Seeds 140xx, variation 1/1 each.
# v2 (R3-01): each plate is isolated on the K3 key background (flat pure green #00FF00) so
# the ingest tool can cut the boss out; composite onto navy for the bestiary pages.

## hb01-hires — Halcyon Bulwark full-plate documentation plate
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/1 of 1

```text
Boss bestiary documentation art, ultrawide horizontal arcade shoot-up plate, ultra-detailed large-format 16-bit-inspired concept rendering: the complete hull of Halcyon Bulwark HB-01, an armored-plate fortress-ship of the Iron Tide, presented broadside and fully readable from prow to stern — a squat fortress body of layered deep-blue steel battlements, overlapping faceplates riveted in grid courses, twin swept wing-tip energy emitters flaring cyan at the upper and lower edges of the hull, and pink-red-purple bullet ports dotting the plate seams with bright cores and dark rims. Single amber eye-slit on the prow. Isolated on a perfectly flat solid pure bright green chroma-key background with no scenery, no stars and no cast shadow, no foreground characters, no text, no letters, no UI. Bold dark outlines, saturated limited palette, clean vector shapes with pixel-art texture accents.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 50 | 50 | 30 |
| seed | 14011 | 14011 | 14011 | 14011 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text artifacts, watermark, blurry, cropped hull, extra ship parts, player character, pure black background, green tint on the subject, green spill, background scenery, cast shadow`
**Notes:** The bestiary plate formula: whole silhouette in frame, broadside, neutral star field, zero characters. Repeat it for every entry; color reference: blue hull plate, cyan emitters, #ff5aa0 port glows. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

## gm02-hires — Galvanic Maw full-fish documentation plate
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/1 of 1

```text
Boss bestiary documentation art, ultrawide horizontal arcade shoot-up plate, ultra-detailed large-format 16-bit-inspired concept rendering: the complete hull of Galvanic Maw GM-02, a playfield-sized mechanical fish of the Iron Tide, shown full-body broadside and fully readable — a heavy riveted steel fish with brass hinge-plates along the flanks, a dorsal ridge of crackling electric combs arcing pale violet, pectoral fin-plates fanned as gun batteries, and its great jaw standing open at the prow revealing the dark throat-core glowing with a caged ball of white-blue electricity. Rows of pink-red bullet lights trace the jawline. Isolated on a perfectly flat solid pure bright green chroma-key background with no scenery, no stars and no cast shadow, no foreground characters, no text, no letters, no UI. Bold dark outlines, saturated limited palette, clean vector shapes with pixel-art texture accents.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 50 | 50 | 30 |
| seed | 14021 | 14021 | 14021 | 14021 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text artifacts, watermark, blurry, cropped jaw, organic fish flesh, player character, pure black background, green tint on the subject, green spill, background scenery, cast shadow`
**Notes:** Keep the throat-core visible at prow-left so the weak-point reads even at thumbnail scale; electric comb arcs are the flux.2-dev coherence test. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

## sw03-hires — Sandgrave Widow silk-suspended documentation plate
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/1 of 1

```text
Boss bestiary documentation art, ultrawide horizontal arcade shoot-up plate, ultra-detailed large-format 16-bit-inspired concept rendering: the complete machine of Sandgrave Widow SW-03, a giant desert spider fortress-ship of the Iron Tide, shown full-body and fully readable while hanging from three taut silk-lines that run up out of frame — a broad riveted carapace of sand-beige and dark gunmetal plate, eight jointed legs curled beneath with needle tips, two forward fangs dripping threads of pale glowing web, and a cluster of small red sensor eyes across the prow. Spinneret vents at the abdomen exhale fine luminous filament. Isolated on a perfectly flat solid pure bright green chroma-key background with no scenery, no stars and no cast shadow, no foreground characters, no text, no letters, no UI. Bold dark outlines, saturated limited palette, clean vector shapes with pixel-art texture accents.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 50 | 50 | 30 |
| seed | 14031 | 14031 | 14031 | 14031 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text artifacts, watermark, blurry, organic spider hair, six legs, cropped legs, player character, pure black background, green tint on the subject, green spill, background scenery, cast shadow`
**Notes:** Leg-count drift is the failure mode — "eight jointed legs" plus negative "six legs" keeps sd3.5 honest; silk-lines anchoring off-frame preserve the suspended read. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

## cb04-hires — Cinder Bastion revolving-arms documentation plate
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/1 of 1

```text
Boss bestiary documentation art, ultrawide horizontal arcade shoot-up plate, ultra-detailed large-format 16-bit-inspired concept rendering: the complete hull of Cinder Bastion CB-04, an Iron Tide battleship built to sit in a vertical magma shaft, shown broadside and fully readable — a dark brick-and-steel warship body whose lower hull is fused into a jagged chunk of glowing magma rock, its exposed central core a bright furnace-orange sphere held in an open cradle, ringed by four revolving armored arms, each a segmented slag-metal claw mid-rotation at a different angle so the spin reads as frozen motion. Isolated on a perfectly flat solid pure bright green chroma-key background with no scenery, no stars and no cast shadow, no shaft walls. Hull outlined in near-black navy, pink-red bullet ports along the gun decks. No foreground characters, no text, no letters, no UI. Bold dark outlines, saturated limited palette, clean vector shapes with pixel-art texture accents.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 50 | 50 | 30 |
| seed | 14041 | 14041 | 14041 | 14041 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text artifacts, watermark, blurry, arms identical angle, organic, player character, pure black background, green tint on the subject, green spill, background scenery, cast shadow`
**Notes:** "Different angle" per arm is what sells rotation in a still; lava ramp reference #8a2c0a→#e87a1c. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

## ss05-hires — Squall Steed storm-mounted documentation plate
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/1 of 1

```text
Boss bestiary documentation art, ultrawide horizontal arcade shoot-up plate, ultra-detailed large-format 16-bit-inspired concept rendering: the complete machine of Squall Steed SS-05, a vast plate-and-cable seahorse fortress-ship of the Iron Tide, shown full-body broadside and fully readable — the seahorse silhouette explicit: arched neck plating, helmet-crown snout, coiled cable tail uncurling behind trailing lightning, dorsal sail of taut canvas-steel rippling. Its chest stands open, three great breastplate doors hinged outward around a white-blue electrical heart that flashes with each thunderclap. Violet rim light with pink bullet-glints along the mane rods. Isolated on a perfectly flat solid pure bright green chroma-key background with no scenery, no stars and no cast shadow, no clouds, no rain, no foreground characters, no text, no letters, no UI. Bold dark outlines, saturated limited palette, clean vector shapes with pixel-art texture accents.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 50 | 50 | 30 |
| seed | 14051 | 14051 | 14051 | 14051 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text artifacts, watermark, blurry, horse with legs, organic animal, closed chest, player character, pure black background, green tint on the subject, green spill, background scenery, cast shadow`
**Notes:** Naming the seahorse anatomy parts (arched neck, coiled tail, dorsal sail) stops models from drawing a land horse; open chest doors are the weak-point read. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

## mr06-hires — Mantle Regent tentacle-crown documentation plate
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/1 of 1

```text
Boss bestiary documentation art, ultrawide horizontal arcade shoot-up plate, ultra-detailed large-format 16-bit-inspired concept rendering: the complete being of Mantle Regent MR-06, a squid-like vault-grown tyrant of the Iron Tide, shown full-frontal-broadside hybrid and fully readable — a heavy bulbous mantle-helmet of living dark green-plate fused with steel ribs, crowned by two long hood-fins that ripple like torn banners, and below it a single great pale eye the width of a turret, pupil a vertical violet slit. Eight tentacles curl forward and upward around the eye in a protective arch, each lined with suction rings that glow soft green, two feeding tendrils hanging straight with hooked tips. Pink-red bullet lights nestle in the tentacle roots. Isolated on a perfectly flat solid pure bright green chroma-key background with no scenery, no stars and no cast shadow, no vault wall, no foreground characters, no text, no letters, no UI. Bold dark outlines, saturated limited palette, clean vector shapes with pixel-art texture accents.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 50 | 50 | 30 |
| seed | 14061 | 14061 | 14061 | 14061 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text artifacts, watermark, blurry, human face, many eyes, wet organic gloss, player character, pure black background, green tint on the subject, green spill, background scenery, cast shadow`
**Notes:** "Eight tentacles arching, two feeding tendrils hanging" gives the leg-accounting models need; the single eye is the composition anchor — keep it lit brightest. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

## fm07-hires — Facet Monarch orbiting-crown documentation plate
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/1 of 1

```text
Boss bestiary documentation art, ultrawide horizontal arcade shoot-up plate, ultra-detailed large-format 16-bit-inspired concept rendering: the complete construct of Facet Monarch FM-07, an Iron Tide crystal sovereign, shown fully readable in open formation — a lone floating core of dark steel and violet light at center, ringed by a slow orbiting crown of seven huge crystal segments, each a faceted prism shard of deep violet with lilac edge-glints, angled at different rotations along the orbit so the ring's spin is obvious in stillness. Inner facets catch and throw pink, red and purple light-beams that cross between shards. The core shows a bright white pinpoint weak-spot where all beams converge. Isolated on a perfectly flat solid pure bright green chroma-key background with no scenery, no stars and no cast shadow, no corridor haze, no foreground characters, no text, no letters, no UI. Bold dark outlines, saturated limited palette, clean vector shapes with pixel-art texture accents.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 50 | 50 | 30 |
| seed | 14071 | 14071 | 14071 | 14071 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text artifacts, watermark, blurry, crown on a head, organic, player character, pure black background, green tint on the subject, green spill, background scenery, cast shadow`
**Notes:** "Open formation" + segment count prevents the crown fusing into a hat; violet #8a48e8 with #c8a0ff edge rims. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

## is08-hires — Iron Sovereign shield-plate rotation documentation plate
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/1 of 1

```text
Boss bestiary documentation art, ultrawide horizontal arcade shoot-up plate, ultra-detailed large-format 16-bit-inspired concept rendering: the complete hull of Iron Sovereign IS-08, an Iron Tide sovereign-slab, shown broadside and fully readable — a monolithic rectangular fortress of riveted dark steel like a wall torn from a citadel, dead-center a round furnace aperture blazing red, and around that aperture six great shield plates on turntables caught mid-rotation at staggered angles, some overlapping, some slid open so the red core peeks through the gaps in asymmetric arcs. Amber running-light strips in a channel along top and bottom edges, cast warm ramp light across the plate rivets. Isolated on a perfectly flat solid pure bright green chroma-key background with no scenery, no stars and no cast shadow, no heat haze, no foreground characters, no text, no letters, no UI. Bold dark outlines, saturated limited palette, clean vector shapes with pixel-art texture accents.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 50 | 50 | 30 |
| seed | 14081 | 14081 | 14081 | 14081 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text artifacts, watermark, blurry, rounded ship body, organic, player character, pure black background, green tint on the subject, green spill, background scenery, cast shadow`
**Notes:** Staggered plate angles are the whole lesson of this frame — the player must see both the defense and its timing gap; amber ramp #6a4418→#e8a030. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

## aa09-hires — Abyss Ark thirteen-section flagship documentation plate
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/1 of 1

```text
Boss bestiary documentation art, ultrawide horizontal arcade shoot-up plate, ultra-detailed large-format 16-bit-inspired concept rendering: the complete hull of Abyss Ark AA-09, the Iron Tide flagship, a whale-bodied fortress battleship shown full-length broadside and fully readable from blowhole tower to tail fluke — thirteen articulated hull sections of riveted blue-black steel visible as distinct segments from snout through body to the great horizontal tail fluke plates, turret batteries rising in staggered rows along the back line like a city skyline, a ring of warm amber portholes glowing along the flank, barnacle-plates of armor crusted low on the belly, and the eye of the ark a single lit watch-window near the prow. Isolated on a perfectly flat solid pure bright green chroma-key background with no scenery, no stars and no cast shadow, no water, no wake specks, no foreground characters, no text, no letters, no UI. Bold dark outlines, saturated limited palette, clean vector shapes with pixel-art texture accents.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 40 | 50 | 50 | 30 |
| seed | 14091 | 14091 | 14091 | 14091 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text artifacts, watermark, blurry, organic whale skin, fins like a shark, player character, pure black background, green tint on the subject, green spill, background scenery, cast shadow`
**Notes:** The flagship deserves the most steps — 13 named segments + skyline turrets is the densest prompt in the set; biolume ramp #16485a→#6ad8e0 in the wake. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

## hk10-hires — Hollow King vertical lure-cathedral documentation plate
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/1 of 1

```text
Boss bestiary documentation art, vertical arcade shoot-up plate, ultra-detailed large-format 16-bit-inspired concept rendering: the complete being of The Hollow King HK-10, final Iron Tide sovereign, shown full-body in a tall frame — an abyssal anglerfish fortress: a cathedral-vast round body of black-blue plate with a lantern-ribcage whose bones glow pale green between them, a high arched jaw-lintel lined with recurved bone teeth, and from the crown a single long lure-antenna curving down in front of the face, its lantern bulb the only bright light in the picture, a pale green star whose glow stays inside its dark outline. Tattered membrane fins hang like rotting banners. No foreground characters, no text, no letters, no UI. Isolated on a perfectly flat solid pure bright green chroma-key background with no scenery, no stars and no cast shadow, no water, no silt. Bold dark outlines, saturated limited palette, clean vector shapes with pixel-art texture accents.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 896x1152 | 896x1152 | 896x1152 | 896x1152 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 36 | 50 | 50 | 30 |
| seed | 14101 | 14101 | 14101 | 14101 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text artifacts, watermark, blurry, organic fish gloss, wide horizontal framing, player character, pure black background, green tint on the subject, green spill, background scenery, cast shadow`
**Notes:** Deliberately the only vertical in the set — the Hollow King is screen-filling and top-down in feel; the lone lantern-bulb light source keeps the composition legible at poster scale. v2 (R3-01): K3 key background #00FF00 — the ingest keys it by flood fill from the border, so greens inside the outline survive; frame counts follow the kernel's v2 targets.

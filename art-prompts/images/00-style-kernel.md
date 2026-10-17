# 00 — Style Kernel, Palette & Negative-Prompt Library

Reference file (no pasteable generation entries). Every other file embeds adapted
versions of the paragraphs below directly in its prompts.

## Canonical style paragraphs

### K1 — Core kernel (pixel-art-inspired concept rendering)

> SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated
> limited palette, lifted deep-navy backgrounds (never pure black), pink, red and purple
> enemy bullets with bright cores and dark rims, gold capsules, orange-white explosion
> ramp, widescreen 16:9 side-scrolling arcade composition, subtle CRT scanline glow.

### K2 — Large-format / key-art extension

> Ultra-detailed, large-format arcade key art, clean vector shapes with pixel-art
> texture accents, bold dark outlines, saturated limited palette, deep-navy atmospheric
> depth, dramatic rim lighting, subtle CRT scanline glow.

### K3 — In-game sprite-sheet kernel (v2, 640×360)

> Retro 16-bit video game sprite sheet, a regular grid of N equal cells in R rows of C
> with even gutters, one pose per cell in the order listed, the same subject at the same
> scale, position and light in every cell, crisp pixel art with a 1-pixel near-black navy
> outline at the sprite's native pixel scale, flat saturated fills with 3-step shading
> ramps lit from the top-left, no anti-aliasing, on a perfectly flat solid pure bright
> green chroma-key background, no gradient, no texture, no stars, no scenery, no cast or
> drop shadows, no glow bleeding onto the background, no text, no numbers, no cell borders.

For a single isolated subject (a craft, an enemy, a boss body) drop the grid clause and
write "a single <subject> centered with a generous empty margin, <view>". Rules that go
with K3:

- **Key background: flat pure green `#00FF00`** — in prompts always the words "perfectly
  flat solid pure bright green chroma-key background" (hex stays in the notes). Why green
  and not the old navy or magenta: a navy key cannot be removed without eating the navy
  outlines, and magenta sits only ΔE 29 (CIE Lab) from bullet violet `#b84cff` (41 from the
  black-hole arms, 42 from prism violet), so keying it would eat enemy bullets and violet FX.
  Pure green is the farthest key from every colour in this kernel — its nearest neighbour
  is the MANTA canopy `#40d070` at ΔE 56 (cyan `#00FFFF`: 22, yellow: 34, orange: 12). The
  ingest tool (R3-02) keys by flood fill from the image border, so greens enclosed by an
  outline (MANTA canopy, zone F cells, zone A terrain, green capsules and orbs) survive.
- **Black key for translucent glow FX only** (force field shimmer, glow overlays): "flat
  solid pure black background"; ingest derives alpha from brightness. "Never pure black" is
  a rule for in-game screen backgrounds, not for source sheets.
- **No CRT scanlines, vignettes, glow halos or hover shadows** on a keyed image — they
  contaminate the key. Glows stay inside the outline; light is top-left.
- **Grid sheets:** say the count twice — as a number and as the pose list ("a regular grid
  of ten equal cells in two rows of five … top row, the five banking frames from left to
  right: …"). Read order is left to right, top to bottom. Player crafts face **right**;
  enemies and bosses face **left**. One subject per sheet when the frames must match.
- **What keeps navy:** scenes, painted backdrops (the far layer is opaque), key art,
  logos, title screens, promo, endings, enemy encounter concepts and boss
  reveal / weak-point / warning frames. Navy is the game's look; the key is only for
  things that get cut out.

### K4 — Painted ending/scene kernel

> Painterly 16-bit inspired arcade ending illustration, wide cinematic composition,
> saturated limited palette over a deep-navy base, bold dark silhouettes, glowing accent
> colors, soft CRT scanline texture, emotional and quiet, no text.

### K5 — Flux-flavored rewrite (more literal, sentence-form)

Use with flux.1-dev / flux.2-dev when a scene reads better as plain description: keep
every noun phrase, drop comma-clip style, still include "bold dark outlines, saturated
limited palette, deep-navy background that is never pure black, widescreen side-scrolling
arcade composition, subtle CRT scanline glow."

## v2 (640×360) targets

The v2 remaster (`plan_resolution.md` §2.7, §9, R3-01) re-bases the game on a 640×360
frame with a 640×336 playfield; every world size is ×1.5 and art gets ~2.25× the pixels,
richer ramps (up to ~32 colours per sprite) and more frames. Models render at
1024–1536 px; the ingest tool (R3-02) scales down to these sizes, so prompts ask for
chunky pixel art with a clean 1-px outline at the sprite's own pixel scale. v1 sizes are
from today's atlas (`assets/generated/atlas/main.json`).

| Category | v1 in game | v2 in game | Frames v2 (v1) | Made by |
|---|---|---|---|---|
| Player ships (KESTREL, MANTA) | 16×9, 16×10 | **24×14** class (MANTA ~24×15) | **5 bank frames** (3): steep climb, climb, level, dive, steep dive; thruster flame **4** (2) | hand-pixelled; AI = design reference only |
| Options | 8×8 | 12×12 | 4 (2) | hand-pixelled |
| Shields: force field, pods, Arm, Reduce | 30×24, 8×8, 26×18, 20×14 | 45×36, 12×12, 39×27, 30×21 | field 6 (4), pods 4, Arm tiers as v1 | AI concept → heavy cleanup (field on the black key) |
| Player shots | 3–12 px tall (basic 8×3, beam 26×8) | ×1.5 (basic 12×5) | as v1, +1–2 for beams and discs | hand-pixelled |
| Enemy bullets | round 7, oval 9, needle 11 | 11, 14, 16 | 8 spin frames (as v1) | hand / procedural — always the brightest, highest-contrast thing on screen |
| Lasers | beam tile 4×8, bend node 7 | 6×12, 11 | 8 (as v1) | procedural |
| Items: capsules, 1UP, Direct orbs, point | 12×8, 12×8, 10×10, 5×5 | 18×12, 18×12, 15×15, 8×8 | **4** glint frames (2) | hand-pixelled; AI = reference |
| Enemies, small (popcorn) | 8–12 px | 12–18 px | **4–6** (2) | AI concept → heavy cleanup, or hand |
| Enemies, medium, turrets | 14–20 px | 21–30 px | **4–6** (2); turrets keep heading frames | AI concept → heavy cleanup |
| Enemies, large / set pieces | 24–40 px | 36–96 px (art may exceed the hitbox) | **4–6** | AI → ingest → cleanup |
| Boss bodies | hulls 48–128 px | up to **~200 px tall (≈ 60 % of the 336-px playfield)**, ~420 px wide; segmented bosses (the Ark) wider in sections | hull + damage states; flash derived | AI → ingest → cleanup |
| Boss parts: cores, emitters, turrets | 12–18 px | 18–27 px | 4 (2); turrets 16 headings as v1 | AI concept → cleanup |
| Explosions | 16, 32, 48 px | 24, 48, 72 px | **12–16** (6–8) | AI concept → cleanup |
| Particles: spark, debris, ring | 5, 6, 9 px | 8, 9, 14 px | 4–6 | hand / procedural |
| Black hole bomb | 32×32 | 48×48 | 8 (4) | AI concept → cleanup (black key) |
| Terrain tiles | 8×8, 20 per set | **12×12**, 20–40 per set incl. decor | palette cycles only | AI material swatch as reference → hand tiles; collision silhouettes procedural |
| Parallax backdrops | 128-px repeating bands | **640 px wide** (one screen, tiles horizontally) in **4–6 layers**: far sky 640×360 opaque, mid layers 640×120–240, near layers 640×60–120 | — | AI → ingest → cleanup; every layer but the far one on the green key |
| HUD | 2 × 8-px bars, icons 8×5 | 2 × 12-px bars, icons ≤ 12 px tall | — | hand-pixelled; AI = reference only |
| Font | 6×8 cell, 195 glyphs | ≈ 9×12 cell (R4-03 decides) | — | hand-pixelled, never AI |
| Title logo | 165×27 | ~250–400 px wide | — | AI lockup → redraw |
| Endings, zone cards, title art | 128×72 parts | full frame 640×360 | — | AI → ingest → cleanup (navy kept) |

**Ship, bullets, items, font and HUD are hand-pixelled in game;** AI images of them are
design references, never shipped pixels. Size classes and frame counts above win over any
older count written in a prompt.

## Ship color language (in prompts use the WORDS, hex goes in notes)

| Subject | Prompt wording | Color reference |
|---|---|---|
| KESTREL hull stripe | steel-blue dart hull with a bold blue fuselage stripe | stripe #3858f0 |
| KESTREL canopy | glowing cyan bubble canopy | #38c8e8 |
| KESTREL engine | hot orange engine afterglow | #f89830 |
| KESTREL outline | heavy navy outline | #1b2a4a |
| MANTA body | flat ray-winged manta hull, pale mint skin | #c8e0d0 |
| MANTA canopy | green glowing canopy | #40d070 |
| MANTA thrusters | amber twin thrusters | amber ≈ #f89830 kin |
| MANTA outline | near-black green outline | ~#0e1a12 |
| Player 2 swap | red-orange fuselage stripe, gold canopy, blue engine glow | channels swapped |

## World palette

| Family | Hex | Use |
|---|---|---|
| Void navy | #05070f → #0c1a3c | all backgrounds, lifted never pure black |
| Bullet pink | #ff5aa0 | enemy bullets, cores bright, dark rims |
| Bullet red | #ff3a3a | dense streams |
| Bullet violet | #b84cff | spiral patterns, bomb energy |
| Explosion ramp | #fff080 → #f8b030 → #f06820 → #c83018 | white-hot core to deep ember |
| Gold | #ffd34d family | capsules, point items |
| Logo gradient | #f8f070 → #f8a030 → #e04828 (vertical) | SHMUP CUP wordmark |
| Logo outline / shadow / highlight | #1b2a4a / #0a0f26 / #fffff0 | wordmark dress-up |

## Zone palettes

| Zone | Prompt color language | Anchors |
|---|---|---|
| A Azure Verge | blue planet rim, green-teal terrain, starfield | terrain #8ad0a8 |
| B Brine Nebula | teal-violet gas sea, wave raster, reef sandstone | sand #f0c890 |
| C Dune Expanse | twin suns, big pale cream + small orange, dune silhouettes, heat haze | #fce8b8, #f89858 |
| D Magma Deep | erupting peaks, lava lake ramp, cave brick walls | lava #8a2c0a→#e87a1c, brick #b0704a |
| E Tempest Ridge | roiling storm cloud deck, saw-tooth snow ridges, slanting rain | — |
| F Cell Vault | living walls of pulsing green cells, fleshy folds, tissue pores | #2a4434→#385a44 |
| G Prism Labyrinth | crystal corridors, triangle-facet walls, stacking cubes | violet #8a48e8, edges #c8a0ff |
| H Iron Citadel | riveted steel fortress interior, amber running lights, pipes, girders | ramp #6a4418→#e8a030 |
| I Abyssal Throne | black-blue deep water, bioluminescent specks, rock spires, swaying weed | #16485a→#6ad8e0 |
| High-Speed Dimension | neon-violet checkerboard floor receding to horizon, fog | #6a4ab0/#3a2a6a, horizon #9a7ad8, fog #20124a |

## FX language

| Item | Prompt wording | Anchors |
|---|---|---|
| Power capsule | glossy pill capsule, colored tint (red/blue/gold/green), white specular highlight, dark rim | — |
| Direct color orb | small round orb, flat saturated single color, dark outline | any of 10 |
| Shield gem | faceted orange-gold gem, bright core sparkle | — |
| Force field | translucent ellipse shimmer around ship, cyan when fresh fading to violet as it wears | cyan→violet |
| Black Hole Bomb | three-armed violet-blue spiral vortex, lilac rim glow, absolute dark core, bullets bending inward, then white lightning discharge | arms #b060f0/#6040d0/#3060b0, rim #d8b0ff, core #080410 |
| Mega Crash | full-screen white shockwave disc expanding, radial lightning spokes | — |
| WARNING flash | screen edges darken, giant flashing red warning banner, siren glow bands | — |

## Negative-prompt library (sd3.5 / qwen only — flux models ignore negatives)

**Base (use on nearly every entry):**
`photorealistic, 3d render, text artifacts, watermark, signature, blurry, jpeg artifacts, pure black background, desaturated palette, photo filter, cluttered composition`

**Add for ships/crafts:**
`modern fighter jet, realistic turbine engines, visible human pilot, melted geometry, asymmetric hull, extra wings, chromatic aberration`

**Add for text/logo entries (qwen):**
`garbled text, misspelled letters, extra letters, missing letters, warped typography, letter overlap`

**Add for sprite sheets:**
`overlapping sprites, drop shadows on background, background gradient, perspective distortion, anti-aliasing, photo background`

**Add for anything on the K3 key (sheets and isolated subjects):**
`green tint on the subject, green spill, background scenery, cast shadow, cell borders, numbers`
(on the black key drop `pure black background` from the base list and add `stars, nebula, scenery`)

**Add for boss/creature entries:**
`cartoon googly eyes, cute mascot, human face, blood, gore, skeletal detail noise`

**Add for stage/wallpaper entries:**
`foreground UI, health bar, score counter, screenshots, frame border, vignette crush to black`

## Composition cheat sheet

- Gameplay-accurate framing = horizontal side-scroll reading: player ship screen-left
  facing right, threat mass screen-right.
- Boss "reveal" = full silhouette + scale reference (tiny KESTREL bottom-left).
- "Weak point" = extreme close-up on core/throat/eye, radial glow, bullets out of frame.
- Ultra-wide 1536x640 = name the thirds in the prompt so flux models distribute correctly.
- Vertical poster 896x1152 = bottom third hero ship, middle third swarm, top third void/light source.

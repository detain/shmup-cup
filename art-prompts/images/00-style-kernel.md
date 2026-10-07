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

### K3 — In-game sprite-sheet kernel

> Retro 16-bit video game sprite sheet, crisp pixel clusters, 2-pixel near-black navy
> outlines, flat saturated fills with 3-step shading ramps, no anti-aliasing, sprites
> evenly spaced on a flat deep-navy background, no shadows, no gradients in background.

### K4 — Painted ending/scene kernel

> Painterly 16-bit inspired arcade ending illustration, wide cinematic composition,
> saturated limited palette over a deep-navy base, bold dark silhouettes, glowing accent
> colors, soft CRT scanline texture, emotional and quiet, no text.

### K5 — Flux-flavored rewrite (more literal, sentence-form)

Use with flux.1-dev / flux.2-dev when a scene reads better as plain description: keep
every noun phrase, drop comma-clip style, still include "bold dark outlines, saturated
limited palette, deep-navy background that is never pure black, widescreen side-scrolling
arcade composition, subtle CRT scanline glow."

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

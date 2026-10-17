# Art bible v2 (640×360)

The rules every person, model and agent follows when making art for the v2 remaster, so that
hundreds of generated and hand-drawn images still look like **one game**. Plan step **R3-01**
([`plan_resolution.md`](../../plan_resolution.md) §9). Its companions:

- the prompt library's style kernel,
  [`art-prompts/images/00-style-kernel.md`](../../art-prompts/images/00-style-kernel.md) (K3 and the
  v2 targets table);
- the ingest tool of R3-02 and the variant rules of R3-03;
- [real-assets.md](real-assets.md) (handing art to the pipeline — v1 wording until R3-02 rewrites
  it), [asset-pipeline.md](asset-pipeline.md) (the atlas) and
  [presentation-polish.md](presentation-polish.md) (palette cycling and raster effects).

**Which document wins.** The v2 numbers of `plan_resolution.md` §2.7 win over this bible (frame,
HUD, tiles, ship footprint, hit radii). This bible wins over the kernel's v2 targets table, and the
kernel wins over any single prompt: a frame count or a size written in a prompt is a request to
the model, not a game rule. Where this page and the kernel differ today, the kernel is updated
after the art round's round 2 (it is in use until then).

**What it is built on.** The owner's picks of round 1 of the early art round (R0-04: 91 image
subjects decided, `data/choices.json` of the picker page), read for this page on 2026-10-17 —
section 2 describes the style that was chosen, measured on the winning images.

Contents:

1. [The numbers](#1-the-numbers)
2. [The look the owner picked](#2-the-look-the-owner-picked)
3. [Universal rules](#3-universal-rules)
4. [Palette rules](#4-palette-rules)
5. [Sizes and frames per category](#5-sizes-and-frames-per-category)
6. [Who makes what: AI-assisted, hand-made, procedural](#6-who-makes-what-ai-assisted-hand-made-procedural)
7. [Writing prompts for this bible](#7-writing-prompts-for-this-bible)
8. [The key colour and the ingest rules](#8-the-key-colour-and-the-ingest-rules)
9. [Checklist for one asset](#9-checklist-for-one-asset)
10. [Still open](#10-still-open)

---

## 1. The numbers

From `plan_resolution.md` §2.7 — art is authored for these, never for the old frame.

| Quantity | v1 (`v1.x`) | v2 |
|---|---|---|
| Internal frame | 384×216 | **640×360** (×3 on 1080p, ×2 on 720p, ×4 on 1440p, ×6 on 4K) |
| HUD | 2 × 8-px bars | **2 × 12-px bars** |
| Playfield | 384×200 | **640×336** (screen y 12 … 347) |
| World scale | 1 | **×1.5** for every world length (sprites follow it) |
| Terrain tile | 8×8 | **12×12** (54 × 28 tiles visible) |
| Player ship (KESTREL) | 16×9 | **24×14** (MANTA 24×15) |
| Player hurt radius | 1.5 | **2.25** |
| Enemy bullet hit radius | 1.5 (needle) / 2 | **2.25 / 3** |
| Font cell / line height | 6×8 / 10 | **≈ 9×12 / 15** — R4-03 decides 8×12 or 9×12 |
| Atlas page | 1024² (one page) | up to 2048² per page, zone-grouped pages (R1-05, R3-04) |

**Frame ≠ world (§2.6).** Sprite sizes are world sizes: they scale ×1.5. Anything defined by the
screen — a full-screen backdrop, a HUD bar, a menu panel, the WARNING band — is derived from the
640×360 frame instead, never multiplied by 1.5.

---

## 2. The look the owner picked

### 2.1 Who won

| Model (slot) | Winners | What |
|---|---|---|
| FLUX.2-dev (slot a, and slot b of the 7 text items) | **84 of 91** | every ship, enemy, boss, item, FX, logo and stage scene; all 7 text items; 3 of the 9 terrain swatches; 6 of the 7 other key moments; both other promo images |
| SD3.5 Large (slot b of the swatches) | 6 | terrain swatches: AZURE VERGE, BRINE NEBULA, DUNE EXPANSE, MAGMA DEEP, TEMPEST RIDGE, ABYSSAL THRONE |
| FLUX.1-dev (slot c) | 1 | the ending "the deep is still" |
| Qwen-Image | 0 | — |

So the chosen style is **FLUX.2-dev's reading of the K1 / K3 kernels**. Round 2 makes every
followup and comment edit with FLUX.2-dev from the winner as reference image, which keeps it that
way. One clip set (`video/ark-diving-abyss`) is still undecided; clips do not feed this page.

**The winner is the design.** Each subject's winning image is its canonical design: shape,
markings and colours. Every other image that shows the subject — followups, key art, scenes, the
title — is made to match it, never the other way round. The title key art, made independently in
the same round, shows a KESTREL with a bubble canopy; R4-05 redraws it from the KESTREL winner.

### 2.2 The style in words

What the winners share, and what in-game art keeps:

- **Chunky, crisp pixel rendering.** Hard silhouettes, no soft edges against the background,
  clusters of a few colours rather than gradients. (The AI's "pixels" are a texture of about 3–5
  source pixels, not a real grid — section 8 handles that.)
- **A dark outline around every subject.** Measured on the 48 key-green winners, the median colour
  just inside the silhouette is mostly a very dark, slightly saturated navy-violet (about `#140c20`
  … `#1b1a2e`) — never black. The MANTA's is near-black green, a dark tone of its own hue, as the
  kernel's ship colour language asks.
- **Light from the top-left.** Highlights run along upper spines and upper-left faces; glossy parts
  (canopies, capsules, orbs, lenses) carry a small white specular glint at their upper left and a
  faint second reflection at the lower right.
- **Muted bodies, saturated lights.** Mechanical enemies and bosses are gunmetal and steel-blue
  plating with rivets and panel seams; the colour lives in small self-lit details — amber running
  lights, magenta and red eye slits and cores, cyan engine glows. Organic subjects are deep greens,
  teals and violets with glossy highlights and one bright "eye" or core.
- **Saturated, limited palettes with hue-shifted ramps** — shadows lean to navy and violet,
  highlights to warm white.
- **Stage scenes are painted pixel panoramas** with strong horizontal bands (sky, horizon, far
  forms, mid forms, ground), dark navy space or cave darks — except DUNE EXPANSE (a pale twin-sun
  sky) and TEMPEST RIDGE (bright cloud decks), which section 4.1 regrades for play.
- **Items are glossy toys:** pill capsules with silver end caps, coloured glass bodies and a swirl;
  orbs as glossy spheres with a navy outline.
- **FX:** explosions go white star flash → white-yellow fireball with orange tongues → orange-red
  burst → grey smoke with ember cracks → drifting puffs; the black hole is violet and blue spiral
  arms around a white-lilac event ring and a dark core; the force field wears from concentric cyan
  rings through cracked violet to crackling magenta.
- **Interface:** lifted-navy panels with thin double neon rims (magenta outside, cyan inside),
  gold-to-orange blocky lettering with a navy outline and a hard offset shadow; the WARNING banner
  is red diagonal hazard bands behind bold red letters with a cream outline. The wordmark's letters
  are three or four horizontal bands — lemon, orange, red — on a gold-rimmed octagonal navy plate.

### 2.3 What the winners get wrong for the game

These are fixed in cleanup or by later prompts — the winners are references, not finished sprites:

| Issue | Seen in | Rule that fixes it |
|---|---|---|
| Three-quarter "showroom" views | KESTREL, MANTA | in-game sprites are side views (3.3) |
| Far too much detail for the size | ship, small enemies, items | hand-pixelled categories (section 6) |
| Bright backgrounds | DUNE EXPANSE, TEMPEST RIDGE scenes; most swatches | the playfield value budget (4.1) |
| Near-black darks (luma below 10) | 9 of 11 stage scenes | the lifted floor (4.1) |
| Soft glows and halos on the key | engine glows, the gyre's rim halo, the hollow king's lure | glows stay inside the outline (3.4); separate additive sprites (6) |
| Green fringe along the silhouette | several bosses and enemies | despill in ingest (8) |
| Painterly, non-pixel texture | the SD3.5 swatches | swatches are material references only (5.9) |
| Glowing soft bullets | title and promo key art | in-game bullets have a dark rim, no glow (4.2) |

---

## 3. Universal rules

### 3.1 Native density — no mixels

Every sprite, tile and layer is drawn at the native **640×360** pixel density: the smallest visible
unit of any asset is one frame pixel.

- Never upscale v1 art into final art. The interim ×1.5 upscale of R2-01 is the one exception, and
  R4 / R5 replace it.
- Never mix pixel sizes inside one picture — no 2×2 "fat pixel" grid next to 1×1 detail, no
  half-size layer drawn ×2.
- Ingest scales AI images **down, straight to the target size** (section 8). It never scales to a
  larger size first, and never up.
- **The one sanctioned exception:** if the R0 benchmark's outcome triggers the TV profile
  (`plan_resolution.md` §13), the far backdrop may be *rendered* at half resolution on Tizen. It is
  still *authored* at full density.

### 3.2 No scaling or rotation at runtime

The renderer places sprites at whole-pixel positions (`roundPixels`) and never scales or rotates
them; only whole-pixel mirrors (`FlipX`, `FlipY`) are used. So:

- **Anything that turns has heading frames:** turrets 16 headings, oval and needle bullets
  8 directional frames, the ship's bank frames instead of a tilt.
- **Anything that spins or pulses has animation frames,** or is round art that needs no turning
  (Options, the bending-laser nodes).
- **Anything that grows has size frames:** laser beams one frame per band height, the ripple one
  frame per ring size, explosions by frame.
- The only distortions on screen are presentation effects on whole layers — raster effects (whole-
  pixel row shifts), the Mode-7 floor's perspective, the CRT pass on the output and the player's
  fit / stretch scale modes. None of them is a licence to draw at another density.

### 3.3 View and facing

- **Side view** — a profile with at most a sliver of the top surface visible. Never the
  three-quarter showroom view of the winners.
- **Player crafts face right.** Enemies and bosses face **left**; the engine mirrors them
  (`FlipX`) when they face right.
- **Ground enemies are drawn standing on a floor;** the engine mirrors them (`FlipY`) for the
  ceiling.
- The mirrors also mirror the light (3.5). That is accepted for small sprites. A large sprite
  (≥ 48 px) that is often mirrored gets symmetric shading about the mirror axis, or its own frames.

### 3.4 Outline

- **1-px dark outline** around every sprite at 640×360. The K3 kernel's old "2-pixel outlines" were
  for 1152-px sources.
- The outline is the **outermost ring of opaque pixels**: a pixel with a transparent 4-neighbour.
  It is inside the frame, so the frame size, the anchor and the hitbox never move.
- **Colour:** the darkest colour of the sprite's palette, never `#000000`, luma ≤ 45:
  - the navy family for mechanical and shared art (KESTREL's `#1b2a4a` down to about `#141428`);
  - a dark tone of the body's own hue for organic art (MANTA about `#0e1a12`).
- **Inner lines** — panel seams, limb overlaps — use the darkest *ramp* shade, not the outline
  colour, on sprites ≤ 30 px, so small sprites do not turn to mud.
- **Selective outline** is allowed on sprites ≥ 48 px: the outline along the lit (top-left) edge
  may take a dark shade of the local colour instead of navy.
- **No outline on:**
  - far and mid backdrop layers — they separate by value and haze;
  - additive glows and particles ≤ 9 px;
  - enemy bullets and lasers — their dark rim *is* the outline;
  - font glyphs — one tinted colour; R4-03 may add a shadow;
  - the inside of terrain — only the edges facing open space get the outline, so the collision
    surface reads.
- **Glows stay inside the outline.** A glow that should spill onto the scene is a separate
  additive sprite, never pixels on the key.

### 3.5 Light and shading

- **Light from the top-left** (about 45°): highlights on top and left faces, shadows on bottom and
  right.
- **Specular glints** are 1–2 px of white at the upper left of glossy surfaces.
- **Self-lit elements ignore the light** — engines, eyes, cores, running lights, lava, energy. They
  carry their own bright centre inside the outline.
- **Ramps:**

  | Sprite size | Steps per material |
  |---|---|
  | ≥ 24 px | 4–6 |
  | below 24 px | 3 |
  | bullets | rim / body / core (+ 1) |

  Ramps are hue-shifted (shadows toward navy and violet, highlights toward warm white). Gunmetal is
  blue-grey, never a neutral grey ramp.
- **No cast shadows** on sprites. Painted backdrops may have their own shadows, consistent with
  top-left light.

### 3.6 Alpha

**Binary alpha** (0 or 255) for every sprite and tile drawn with normal blending:

- the `@flash` silhouette is exact;
- palette cycling never meets a half-transparent pixel — the shader un-premultiplies, so a partial
  pixel shifts its colour off the ramp;
- a tile's opaque pixels *are* its collision (R3-03).

Binary is the default, and translucency is a choice the recipe states. v1's generators use partial
alpha in several places; in v2 only these may:

- **Additive sprites** — glow accents (R3-06), particles, the Mega Crash flash. They are authored on
  black, where black adds nothing.
- **Translucent overlays and effects** — the force field's inner glow, Reduce's shimmer, bubble
  films, smoke. Their alpha comes from a black-key source (section 8).
- **Haze and gas bands** on a backdrop layer the stage does not cycle — nebulae, heat haze, fog.

**Never translucent:**

- terrain tiles;
- bullets, lasers, items, the ship, the font and the HUD;
- anything drawn on a layer the stage palette-cycles.

### 3.7 Dither and anti-aliasing

- **Ordered dither only** (2×2 or 4×4 Bayer), never error diffusion, and only on:
  - far and mid backdrop gradients (skies, nebulae, haze, depth fog);
  - boss bodies ≥ 96 px, for large curved surfaces.
- **Never dither:**
  - the ship, bullets, lasers, items, font, HUD and UI;
  - small and medium enemies;
  - the edges of terrain;
  - any palette-cycled region.
- **No anti-aliasing against transparency** — alpha is binary.
- **Inner anti-aliasing** (one intermediate colour between two areas) only on sprites ≥ 48 px.

---

## 4. Palette rules

### 4.1 Lifted dark backgrounds (VA panels) and the playfield value budget

The M7 monitors are VA panels, which smear dark-to-bright transitions
([`shmup_feat.md`](../old/shmup_feat.md) §18). So
nothing behind the playfield is black, and the backdrop stays dark enough that bullets stay the
brightest thing on screen.

Luma here is Rec. 709 (`0.2126 R + 0.7152 G + 0.0722 B`, 0–255). The frame's reference colours:

| Colour | Hex | Luma |
|---|---|---|
| Letterbox (outside the frame) | `#05070f` | 7 |
| Space / panel | `#10173a` | 24 |
| HUD bars | `#1d2a5c` | 43 |

| Layer | Floor | Median | 95th percentile |
|---|---|---|---|
| Far backdrop | every opaque pixel ≥ 16, and never a neutral black — it keeps the zone's hue | ≤ 64 | ≤ 140 |
| Mid backdrops | ≥ 16 | ≤ 80 | ≤ 160 |
| Near backdrops, foreground, terrain | — | — | — (but section 4.2's reserved hues apply) |

- **Light sources** — suns, a planet's rim, a lava glow — may go brighter. They must be ≥ 24 px
  across (bigger than any bullet), and at most 5 % of a layer may be above luma 200.
- **Stars** are ≤ 2×2 px, white or pale blue — never pink, red or violet.
- **The budget is checked, not hoped for.** R3-02's ingest report prints the floor, median and
  95th percentile of every backdrop layer and warns past the budget. R4-02's readability check —
  512 bullets over each zone's backdrop, in all four bullet palettes, signed off by the owner — is
  the final word.

**The stage scenes are concept art.** Measured over the whole picture:

| Scene | Median luma | 95th percentile | Verdict |
|---|---|---|---|
| IRON CITADEL | 27 | 89 | within the far-layer budget as is |
| ABYSSAL THRONE | 51 | 105 | within the far-layer budget as is |
| PRISM LABYRINTH | 26 | 141 | at the far-layer limit |
| AZURE VERGE, CELL VAULT, MAGMA DEEP, HIGH-SPEED DIMENSION, ESCAPE CORRIDOR | ≤ 58 | 146–221 | highlights (clouds, rims, glows) need toning down |
| BRINE NEBULA | 80 | 178 | regrade toward dusk |
| TEMPEST RIDGE | 87 | 234 | regrade toward dusk |
| DUNE EXPANSE | 125 | 235 | regrade toward dusk |

The in-game layers keep each scene's composition, motifs and hues and take a darker, lower-
contrast **playfield grade**: values shifted down, darks lifted to the floor. For DUNE EXPANSE that
is a dusk sky over the twin suns rather than the bleached noon of the concept. Nine of the eleven
scenes also have near-black darks (luma below 10) that the floor lifts.

These figures cover the whole scene, near layers included; the far layer cut from a scene is
usually darker.

### 4.2 Bullets first

**Enemy bullets are always the brightest, highest-contrast thing on screen** (design pillar 2):

- **The bullet look:** a **centred white core**, a **saturated body** in the bullet families — pink
  `#ff5aa0`, red `#ff3a3a`, violet `#b84cff` — and a **dark rim**. The core makes a bullet read on
  dark backgrounds, the rim on bright ones. No soft glow — it lowers contrast and smears on VA
  panels.
- **Reserved for enemy bullets and lasers:** a round or oval blob 5–17 px with a centred white core
  and a dark rim, in pink, red or violet. Nothing else may look like that:
  - **items** carry their highlight off-centre (upper left) and are gold or their Direct colour;
  - **enemies** may use bullet hues only as slits, lines, rings or cores inside their own body —
    never as a free-floating round blob;
  - **backdrops and terrain** never use saturated bullet hues in bullet-sized spots;
  - **player shots** keep the hero hues — cyan, blue, white, yellow and green. The few violet ones
    (the torpedo, the cyclone's strands) are elongated, never a round blob with a white core.
- **Other reserved families** (`shmup_feat.md` §12):

  | Family | Hues | Reserved for |
  |---|---|---|
  | Gold | `#ffd34d` | capsules and point items |
  | Explosion ramp | `#fff080` → `#f8b030` → `#f06820` → `#c83018` | explosions |

  Neither is used for bullets. An explosion's white flash frames last ≤ 3 ticks.
- **Draw order keeps bullets on top** (`core/presentation` `LayerId`):

  ```text
  far backdrop → mid backdrop → terrain → ground enemies → air enemies (and bosses)
    → player shots → player → hitbox marker → items → FX → ENEMY BULLETS → HUD → UI
  ```

  R3-06's sparse foreground layer goes in front of the ship but **below** the enemy bullets.

### 4.3 Palettes: common, zone, per sprite

The atlas is true colour; the palettes exist for consistency, and ingest quantises to them.

- **`common`** — shared by every zone: ships, Options, shields, player shots, bullets, lasers,
  items, explosions and particles, HUD, UI, font. Built from the kernel's anchors: the ship colour
  language, the bullet families, gold, the explosion ramp, the void navy and the outline navy.
  It does not change per zone.
- **One palette per zone** (`zone-a` … `zone-i`, `dimension`, `escape`) — 48–64 colours shared by
  the zone's tiles, backdrops, enemies and boss. Each starts from the kernel's zone anchors and the
  zone's winners (scene, swatch, enemies, boss), is fixed in R5, and is edited by hand. It holds no
  colour from section 4.2's reserved families at bullet brightness, and no colour near a reserved
  ramp (4.4).
- **Per-sprite caps** (ingest quantises to them; hand art keeps to them):

  | Sprite | Colours |
  |---|---|
  | Enemy bullet / laser (one family) | ≤ 5 |
  | Particle, point item | ≤ 6 |
  | Item, Option, shield pod | ≤ 12 |
  | Player ship (per frame, without the thruster) | ≤ 24 |
  | Enemy ≤ 30 px | ≤ 16 |
  | Enemy > 30 px, boss part | ≤ 24 |
  | Boss body, set piece, backdrop layer | ≤ 32 |
  | Tileset (all tiles) | ≤ 32 |

### 4.4 Reserved palette-cycle ramps

Palette cycling (`render-pixi` `palette`,
[presentation-polish.md](presentation-polish.md#palette-cycling-render-pixi-palette)) recolours
every pixel of a layer that matches a ramp colour: the shader matches when **every channel is
within 1.5/255** of it. The rules, from R3-03:

- **A ramp's colours are reserved project-wide.** Only art meant to cycle may use them, and then
  exactly — a cycled backdrop is quantised to its stage's `cycles` ramps, which its recipe names.
  Reserving them everywhere is simpler and safer than tracking which layer cycles where, and costs
  nothing: the margin is tiny.
- **Every other pixel stays at least 3/255 away** from every reserved colour in at least one
  channel (Chebyshev distance ≥ 3). That is twice the shader's tolerance. Ingest pushes such pixels
  away, and R3-03's atlas scan fails on a near miss.
- **A ramp's own colours differ by at least 2 in some channel** — the loader rejects closer ones.
  A layer cycles at most 8 colours.
- **Cycled regions are flat-coloured,** not dithered (a dithered ramp shimmers), and binary-alpha
  (3.6).
- **Today's ramps** — `SEA_RAMP`, `BRINE_RAMP`, `MAGMA_RAMP`, `STORM_RAMP`, `VAULT_RAMP`,
  `PRISM_RAMP` and the v1 stages' `cycles` — stay reserved until R5 re-authors them per zone.

### 4.5 Variants derived from the art — never drawn by hand

| Variant | How | Step |
|---|---|---|
| `<name>@flash` | white silhouette of the opaque pixels (binary alpha makes it exact) | as v1 |
| `<ship>@p2` | a **palette map** in the ship's recipe — P1 ramp → P2 ramp: stripe blue → red-orange, canopy cyan → gold, engine orange → blue — replacing v1's channel swap | R3-03 |
| `<bullet>@<palette>` | procedural, frame for frame, shape-coded cores (pink solid, red ring, violet dot) — `procedural/palettes.mjs` at the new sizes | R3-03 / R4-02 |

---

## 5. Sizes and frames per category

### 5.1 The rounding rule

A v2 sprite starts at **its v1 size × 1.5**. Detail goes into those pixels — more colours, more
frames — not into a bigger footprint, because hitboxes and spacing are content values that scale
×1.5 too. The exceptions:

- bosses, large enemies and set pieces may be drawn bigger where readability allows (5.6, 5.7);
- frame-anchored art is derived from the frame (5.10, 5.11).

| Kind of sprite | Rounding of v1 × 1.5 |
|---|---|
| General | halves round up: 16×9 → **24×14** (§2.7), 8×5 → 12×8 |
| Point-symmetric: bullets, laser nodes, particles, point items, round player pellets | the **nearest odd** side, so the anchor is the centre pixel: 7 → 11, 9 → 13, 11 → 17, 5 → 7 |

Frame counts below are **v2 (v1)**. A v1 count is from today's atlas.

### 5.2 Every category at a glance

| Category | v1 | v2 size | v2 frames (v1) | Made by (section 6) |
|---|---|---|---|---|
| Player ships | KESTREL 16×9, MANTA 16×10 | **24×14**, 24×15 | **5** bank (3) | hand-pixelled |
| Ship thruster | 6×3 | 9×5 | 4 (2) | hand-pixelled |
| Options | 8×8 | 12×12 | 4 (2) | hand, or AI concept → heavy cleanup |
| Shields | field 30×24, pod 8×8, Arm 26×18, Reduce 20×14 | 45×36, 12×12, 39×27, 30×21 | field 4 wear states × 1–2 (4); pod 4 (4); Arm 9 (9); Reduce 2 (2) | AI concept → heavy cleanup, or hand |
| Player shots (22) | 3–44 px | ×1.5 (5.3) | as v1, +1–2 for beams and discs | hand-pixelled |
| Enemy bullets | round 7, oval 9, needle 11 | **11, 13, 17** | 1 / 8 / 8 headings (1 / 8 / 8) | procedural |
| Lasers | beam 4×8, bend node 7×7 | beam 6×12, node 11×11 | beam **12** = one per band height (8); node 1 | procedural |
| Items | capsules 12×8, Direct orbs 10×10, point 5×5 | 18×12, 15×15, 7×7 | **4** glint (2) | hand-pixelled |
| Enemies | 6–40 px | 9–60 px, set pieces ≤ 96 (5.6) | **4–6** per animation (1–3) | by size (section 6) |
| Boss parts | 10–30 px | 15–45 px (5.7) | cores and emitters 4 (2), turrets 16 headings | AI concept → cleanup |
| Boss bodies | hulls 48–96 px | ≤ ≈ 200 tall, ≈ 420 wide; raids in sections | intact + 1–2 damage states | AI → ingest → cleanup |
| Explosions | 16, 32, 48 | 24, 48, 72 | **12–16** (6–8) | AI concept → cleanup |
| FX: particles, black hole | spark 5, debris 6, ring 9, black hole 32 | 7, 9, 13, 48 | 4–6 (3–4), black hole 8 (4) | procedural / AI concept |
| Terrain tiles | 8×8, 20 per set | **12×12**, 20–40 per set | palette cycles only | hand, from AI swatches |
| Backdrops | 128-px repeating bands | 640 px wide, 4–6 layers (5.10) | 1, optional 2–4 slow | AI → ingest → cleanup |
| HUD | 8-px bars, icons ≤ 8 | 12-px bars, icons ≤ 12 | as v1 | hand-pixelled |
| Font | 6×8, 195 glyphs | ≈ 9×12 (R4-03), 195 glyphs | — | hand-pixelled, never AI |
| UI kit | rectangles + font | rectangles + font; sprite parts ≤ 12×12 | — | hand / procedural |
| Title logo | 165×27 | ≈ 320×64 (≤ 400×80) | 1 (+ optional shine) | AI lockup → hand redraw |
| Ending scenes | parts up to 128×72 | full frame 640×360 | 1 + animated parts | AI → ingest → cleanup |

### 5.3 Player: ships, Options, shields, shots

| Sprite | v1 | v2 | Frames v2 (v1) | Notes |
|---|---|---|---|---|
| `ships/kestrel`, `ships/manta` | 16×9, 16×10 | **24×14**, 24×15 | 5 (3): steep climb, climb, level, dive, steep dive | anchor = the hurt centre (v1 `[8, 4]`, ×1.5 → `[12, 6]`; R4-01 confirms); `@flash`, `@p2` derived. Five bank frames need R4-01's engine change (v1 has `level` / `up` / `down`) |
| `ships/kestrel-thruster` | 6×3 | 9×5 | 4 (2) flicker loop | drawn behind the ship. The MANTA's twin thrusters are in its frames or a strip of their own (R4-01) |
| `options/orb`, `options/stolen` | 8×8 | 12×12 | 4 (2) | round art, never rotated |
| `shields/force-field` | 30×24 | 45×36 | 4 wear states (fresh cyan → worn → damaged → critical magenta) × 1–2 shimmer frames | translucent inner glow (3.6) |
| `shields/pod` | 8×8 | 12×12 | 4 wear states | faceted gold gem with a riveted band (the winner) |
| `shields/arm` | 26×18 | 39×27 | 9 (3 tiers × 3) | Direct mode |
| `shields/reduce` | 20×14 | 30×21 | 2 | translucent shimmer (3.6) |

Player shots — all 22, ×1.5 by section 5.1, the frame counts of v1 (beams and discs may gain 1–2):

| Shot | v1 → v2 | Shot | v1 → v2 |
|---|---|---|---|
| `basic`, `laser`, `tail`, `twin` | 8×3 → 12×5 | `missile` | 8×3 → 12×5, 2 frames |
| `double`, `free` | 5×5 → 7×7 | `two-way` | 5×5 → 7×7, 2 frames |
| `bomb`, `sub-bomb` | 6×6 → 9×9 | `torpedo` | 10×3 → 15×5, 2 frames |
| `vertical` | 3×8 → 5×12 | `direct-missile` | 12×6 → 18×9, 2 frames |
| `cyclone` | 8×9 → 12×14, 4 frames | `sub-disc` | 12×12 → 18×18, 2 frames |
| `disc` | 20×20 → 30×30, 4 frames | `sub-laser` | 9×9 → 13×13, 8 headings |
| `beam` | 26×8 → 39×12, 4 frames | `sub-laser-wide` | 11×11 → 17×17, 8 headings |
| `wave` | 16×34 → 24×51, 4 frames | `blast` | 32×32 → 48×48, 4 frames |
| `ripple` | 24×44 → 36×66, 6 ring sizes | | |

Segment shots (`laser`, `twin`, `cyclone`) tile along their length: their width stays the segment
length (`LASER_SEGMENT_LENGTH` 12) and one wave period per segment.

### 5.4 Enemy bullets and lasers

| Sprite | v1 | v2 | Frames | Notes |
|---|---|---|---|---|
| `bullets/round-<c>` | 7×7 | **11×11** | 1 | hit radius 3 |
| `bullets/oval-<c>` | 9×9 | **13×13** | 8 headings, frame `k` at `k · 22.5°` | hit radius 3 |
| `bullets/needle-<c>` | 11×11 | **17×17** | 8 headings | hit radius 2.25, the fast bullet |
| `lasers/beam-<c>` | 4×8 | **6×12** | **12** — frame `k` is a band `k + 1` px tall (v1: 8 for 8 px) | stretched along the beam, never across; `LASER_WIDTH` 9 |
| `lasers/bend-<c>` | 7×7 | **11×11** | 1 | round, drawn at every node |

- **Colours:** three families `<c>` = pink, red, violet; plus three colour-blind sets each, frame
  for frame.
- **Who makes them:** procedural (`bullets.mjs`, `lasers.mjs`, `palettes.mjs` rewritten at these
  sizes).
- **Kept from v1:** the 1-or-8-frame rule (`bullets/index.ts`). Changing it is a deliberate
  re-bless (R4-02).

### 5.5 Items

| Sprite | v1 | v2 | Frames v2 (v1) |
|---|---|---|---|
| `items/capsule`, `capsule-blue`, `capsule-bonus`, `1up` | 12×8 | 18×12 | 4 glint (2) |
| `items/one-up` | 12×8 | 18×12 | 1 |
| `items/direct-<colour>` (blue, green, octagon, orange, red, yellow) | 10×10 | 15×15 | 4 (2) |
| `items/bonus` | 10×10 | 15×15 | 1–4 (1) |
| `items/point` | 5×5 | 7×7 | 4 twinkle (2) |

### 5.6 Enemies by size class

Sizes are the visible body. The hurtbox (content, ×1.5) covers the solid body; fins, antennae and
glows may lie outside it.

| Class | v1 | v2 | Frames v2 (v1) | Examples (v1 sprites) |
|---|---|---|---|---|
| Tiny: debris, motes, cubes, shards | 6–8 px | 9–12 px | 2–4 (1–2) | `enemies/lava`, `glint-mote`, `prism-cube`, `geode-shard` |
| Small (popcorn) | 9–12 px | 14–18 px | **4–6** (2) | `drifter`, `skeet` class, `bolt-drone`, `chaser-cell` |
| Medium | 13–20 px | 20–30 px | **4–6** (2–3) | `froth`, `thunderhead`, `dust-devil`, `option-hunter` |
| Turrets | 12–14 px | 18–21 px | idle + muzzle flash, 2–4 (2); a turned turret 16 headings | `enemies/turret`, `rail-turret`, `crag-turret` |
| Large and set pieces | 20–40 px | 30–60 px; set pieces up to 96 px | 4–6 | `brood-bubble`, `dim-pylon`, `mitosis-cell` |

Every enemy that can be hit has an `@flash` sibling (derived). A spinner's spin is animation
frames, never rotation (3.2).

### 5.7 Bosses and boss parts

| Part | v1 | v2 | Frames v2 (v1) |
|---|---|---|---|
| Boss body / hull | 48×32 … 96×40 (e.g. `sovereign-hull` 64×88) | up to **≈ 200 px tall** (60 % of the 336-px playfield) and ≈ 420 px wide | intact + 1–2 damage states; `@flash` derived |
| Raid sections (IRON LEVIATHAN, the ABYSS ARK) | 96×40 each, 480-px body | 144×60 and up, ≈ 720-px body | per section |
| Cores, eyes, hearts | 14–18 px | 21–27 px | 4 (2) pulse |
| Emitters, hatches, pods | 12×12 … 18×10 | 18×18 … 27×15 | 4 (2) |
| Turrets | 16×16 | 24×24 | **16 headings** (16) |
| Segments, tips, plates, limbs | 6–30 px | 9–45 px | 1–2 |

A boss is a tree of parts, and parts that move separately are separate sprites
([advanced-bosses.md](advanced-bosses.md)). Weak points read at a glance: the brightest self-lit
part of the boss is the one to shoot.

### 5.8 Explosions and FX

| Sprite | v1 | v2 | Frames v2 (v1) | Notes |
|---|---|---|---|---|
| `fx/explosion-small` | 16×16 | 24×24 | 12 (6) | the winner's sequence (2.2), shortened |
| `fx/explosion-medium` | 32×32 | 48×48 | 12–14 (7) | |
| `fx/explosion-large` | 48×48 | 72×72 | 14–16 (8) | boss chains overlap large and medium |
| `fx/black-hole` | 32×32 | 48×48 | 8 (4) | additive, from a black-key source |
| `fx/spark`, `fx/sparkle` | 5×5 | 7×7 | 4 (3–4) | additive |
| `fx/debris` | 6×6 | 9×9 | 4–6 (4) | |
| `fx/ring` | 9×9 | 13×13 | 4–6 (4) | |
| Glow accents (R3-06) | — | ≤ 48×48 | 1–4 | additive, attached to enemies, bosses, terrain |

Particle speeds, radii and gravity are content (`content/fx`), ×1.5; frame timing is checked in
R4-04.

### 5.9 Terrain tiles

| Item | v2 |
|---|---|
| Tile | **12×12**, binary alpha; opaque pixels = the collision (column heights, 12 entries per tile) |
| Per tileset | 20–40 tiles: ≥ 3 fill variants, top and bottom surface edges, left and right edges, outer and inner corners, 45° slopes, destructible blocks (+ crack stages if R5 wants them) |
| Outline | only on edges that face open space |
| Animation | none per frame; palette cycles only |
| Decor | non-colliding tiles and sprites on the decor layer (R3-06), never inside a collision tile |

- **Collision:** the recipe chooses **mask from art** (column heights from the opaque pixels) or
  **art clipped to mask** (keep the designed collision) — R3-03.
- **Swatches are references only.** The terrain swatch winners — SD3.5's painterly rock, FLUX.2's
  riveted plates and crystal facets — give the material, colours and motifs. At 12 px only those
  survive, so tiles are hand-pixelled in the zone palette.

### 5.10 Backdrops per layer

| Layer | Size (w × h) | Key | Notes |
|---|---|---|---|
| Far (sky, space, cave depth) | 640 × 360, opaque | none | covers the playfield plus vertical parallax slack; taller when the stage's camera travels vertically; may be 1280 wide if the repeat shows and R3-04's budget allows |
| Mid-far | 640 × 120–240 | green | a band, seamless left to right |
| Mid | 640 × 120–240 | green | |
| Near | 640 × 60–120 | green | |
| Foreground (sparse) | ≤ 640 × 48 pieces | green | in front of the ship, never above enemy bullets; never hides a bullet lane |
| Cycled band | as its layer | — | painted only in its ramp + colours ≥ 3/255 away (4.4) |
| Raster `lines` floor | strips listed in `bands` | — | wider pattern lower down; `wrap` = the art's repeat |

- **Layers:** 4–6, inside the far and mid layer groups (R3-06 maps them).
- **Scrolling:** whole-pixel scroll factors.
- **Repeat:** every layer repeats seamlessly at its width.
- **Frames:** 1 per layer, plus optional slow animation frames (2–4).
- **Budget:** each layer keeps section 4.1's value budget. R0's TV profile may cap Tizen at
  4 layers.

### 5.11 HUD, font, UI, title, endings

| Item | v2 |
|---|---|
| HUD bars | 2 × 640×12, lifted navy fill (`#1d2a5c` today); geometry from the frame |
| `hud/life` | 8×5 → **12×8** (+ `@p2`) |
| `hud/meter-slot` | 40×8 → **60×12**, 3 frames (normal, highlighted, excluded) |
| `hud/meter-labels` | 36×5 → **54×8**, 23 labels — or drawn with the new font if R4-03 prefers |
| Font | cell 8×12 or 9×12 (R4-03), line height 15, advance = cell width. All 195 glyphs (ASCII, the Spanish capitals, 84 katakana) redrawn by hand. One colour per string (tinted) |
| UI kit | panels, cursors, sliders, toggles as draw-list rectangles and the font. Optional sprite parts (panel corners, cursor) ≤ 12×12. Panel geometry derived from the frame |
| Title logo | ≈ 320×64 (≤ 400×80), redrawn by hand from the wordmark winner: banded lemon → orange → red letters, navy outline, hard offset shadow |
| Title screen | logo over a 640×360 backdrop from the title key art |
| Ending scenes | five full-frame **640×360** scenes plus animated parts — e.g. the blast 24×24 → 36×36, 4–8 frames |
| Zone cards, attract cards | 640×360 or frame-derived bands |
| WARNING banner | a frame-wide band, red hazard stripes; height from the frame |

The store and documentation images (`pnpm store:assets`, `pnpm docs:images`) are made from the key
art at their own sizes in R4-05; they are not in the game frame.

---

## 6. Who makes what: AI-assisted, hand-made, procedural

| Category | Made by | The AI image is | Why |
|---|---|---|---|
| Painted backdrop layers, title / ending / zone-card art, boss bodies, large enemies, set pieces | **AI-assisted** → ingest → hand cleanup | the source pixels | a ~1,240-px boss subject → ≈ 420 px is a ÷3 downscale, about one AI "pixel" per game pixel, so the design survives |
| Small and mid-size enemies, Options, shields, FX (explosions, black hole, force field) | AI concept → ingest → **heavy** cleanup, or hand-drawn | a starting point | 12–45 px from a 350–850-px subject (÷20–40): only the silhouette and palette survive |
| Ship, enemy bullets, lasers, items, capsules, font, HUD icons, tiles' collision silhouettes | **hand-pixelled / procedural** | a design reference only | the KESTREL winner is 736 px wide for a 24-px sprite (÷30); readability-critical |
| Terrain tiles | **hand-pixelled** in the zone palette | a material reference (the swatch) | 12-px tiles; collision must be exact |
| Bullets and their colour-blind sets, lasers, particles, `@flash`, the `@p2` palette map, debug art | **procedural** (`scripts/assets/procedural/`) | — | exact shapes, exact variants, byte-identical atlas |

Glows that the AI drew onto the background are cut away. Where the game wants them, they come back
as additive glow sprites (R3-06).

---

## 7. Writing prompts for this bible

For the prompt library (`art-prompts/`), the round-2 followups and any later generation:

- **No named games, studios, publishers, characters or artists** — not in prompts, notes, recipes
  or this bible. Describe the look in plain words (outline, light, palette, key) as the kernels do;
  "16-bit era" is a description, a title is not. [`shmup_feat.md`](../old/shmup_feat.md) §26 lists
  the names that must never appear, and R3-05 adds a test that greps the library.
- **One subject per sheet** when its frames must match. Say the count twice — as a number and as
  the pose list — and read cells left to right, top to bottom. The frame counts are section 5's,
  not the model's.
- **Say where the nose and the engines are,** so crafts face right and enemies face left; ask for a
  side view.
- **Describe bullets as round glowing orbs** with a bright white core and a dark rim.
- **Avoid metaphors** — models draw them literally (chains, lanterns, stairways, hearts, sails).
  Describe shapes.
- **Keyed images** use the K3 wording for the key ("perfectly flat solid pure bright green
  chroma-key background") and ask for none of: scanlines, vignettes, glow halos, cast shadows,
  ground strips, frames or text.
- **In-game layers ask for the playfield grade:** dark, lifted, low contrast, no pure black, no
  small bright dots.
- **Followups and comment edits** are made with FLUX.2-dev from the winner as reference
  (`gen-candidate.mjs --edit-from`), so they keep the winner's design. Round 1 suggests FLUX.2-dev
  first for text too — it won all 7 text items.

---

## 8. The key colour and the ingest rules

R3-02 builds the ingest tool; these are the rules it implements and the measurements they come
from.

**The key comes out slightly yellowish, and varies.** Prompts ask for pure green `#00FF00`; the
models deliver something else. Sampled from the backgrounds of the 48 key-green winners:

| Measure | Value |
|---|---|
| Median | `#3cf102` |
| R (1st–99th percentile) | 23–90 |
| G (1st–99th percentile) | 193–251 |
| B (1st–99th percentile) | 0–33 |
| Hue | 98°–114° (pure green is 120°) |
| Spread inside one image (σ of the border's RGB distance to its median) | 1–7 (45 where the subject touches the border) |

So ingest **samples the key from each image's own border**, not from `#00FF00`, with a tolerance.

**A starting test that held on every keyed winner:** a pixel is key when `G ≥ 150`, `G − R ≥ 70`
and `G − B ≥ 120`. It matches every winner's background. Most greens of the game fail it:

| Green inside a subject | Why the test spares it |
|---|---|
| MANTA canopy `#40d070` | `G − B` is 96 |
| zone A terrain `#8ad0a8` | `G − B` is 40 |
| the cell bodies | too dark or too pale |

Some greens pass it all the same — the green capsule's glass is about 6 % of the capsule winner's
subject. That is why step 2 keys by flood fill and never globally.

R3-02 tunes the test on its fixtures. The steps, in order:

1. **Crop first** (the recipe's crop box). It removes what keying cannot:
   - Qwen's ground strips, shadows and frames;
   - FLUX.1's letterbox bars at 1536×640;
   - the darkened right and bottom edges of six swatches (about 24 px);
   - a subject touching the border (the SANDGRAVE WIDOW winner's border spread is 45).
2. **Key by flood fill from the border** through key pixels — never a global key. A global key
   would remove a subject's own key-like greens (the green capsule's glass); with a looser
   tolerance it would also take the MANTA canopy, zone F's cells and zone A's terrain.
3. **Key the holes.** Background seen *through* a subject — between spokes, inside rings — is not
   connected to the border. In the gyre winner, 21 % of the subject's area is such a hole. The
   recipe lists hole seeds, or allows `holes: auto` (enclosed regions that pass the key test and are
   at least a minimum area).
4. **Despill the edge.** Several winners carry a green fringe where the outline and thin features
   (fin spines, lightning arcs) blend into the key — the median edge colour of the GALVANIC MAW, the
   HOLLOW KING and the EMBER / FROST twins is dark green. Pixels within 2 source px of the key lose
   their green cast (`G` clamped to `max(R, B)`) or are eroded. The outline pass redraws the edge
   anyway.
5. **Remove glow halos and islands.** A halo blended into the key (the gyre's rim, engine glows)
   fails the key test, so the flood fill leaves it. Morphological cleanup (an opening, islands below
   a minimum area removed) or the hand-edit layer takes it away, so the outline lands on the hard
   silhouette. Light that should spill becomes an additive sprite (section 6).
6. **Black key for additive and translucent FX** (force field, black hole, glow accents): alpha or
   additive brightness comes from the source's brightness. Only the sprites listed in 3.6 use it.
7. **Downscale with an area (box) filter straight to the target frame size,** then pixel-snap.
   FLUX.2's winners show an apparent pixel of about 3–5 source px, on no fixed grid, so pick the
   render size to make the factor close to it:

   | Factor | Example | Result |
   |---|---|---|
   | about the apparent pixel | a boss of ≈ 420 px from a ≈ 1,260-px subject (÷3) | the detail survives |
   | far larger | the ship (÷30) | the detail turns to mush — those categories are hand-drawn |
   | smaller | a 640-px far layer from a 1536×864 render (÷2.4) | AI "pixels" span two game pixels (mixels); the pixel-snap and cleanup redraw them at native density |
8. **Binary alpha:** a pixel is opaque when at least half of its source area is subject.
9. **Quantise** to the recipe palette and the per-sprite cap (4.3):
   - deterministic;
   - ordered dither only where 3.7 allows;
   - every non-ramp pixel pushed ≥ 3/255 from the reserved ramps (4.4).
10. **Outline pass** (3.4): the inner 4-neighbour ring in the palette's outline colour, when the
    recipe says `outline: on`.
11. **Hand-edit layer** (`<name>.edit.png`) merged last, so re-ingesting never loses hand work.
12. **Provenance** `<name>.art.json`: model, prompt file and entry, seed, source SHA-256, recipe
    hash, date, hand-cleaned yes/no (R3-02, R3-05).
13. **Report:** colour count, the luma floor / median / 95th percentile of backdrop layers against
    4.1, near misses against the reserved ramps, and a mixel warning when every run of equal pixels
    is even-length (a sign of a ×2 upscale).

**The same recipe and source give the same PNG byte for byte**, so the atlas stays byte-identical
on every machine.

---

## 9. Checklist for one asset

- [ ] Size and frame count from section 5 (or the step that owns it), anchor where the content
      expects it (the hurt centre for ships).
- [ ] Side view, correct facing, ground enemies on a floor.
- [ ] 1-px outline in the palette's outline colour; glows inside it.
- [ ] Light from the top-left; self-lit parts glow on their own.
- [ ] Within the per-sprite colour cap; nothing within 3/255 of a reserved ramp.
- [ ] Binary alpha (or listed as additive / translucent).
- [ ] No mixels, no dither outside 3.7, no anti-aliasing against transparency.
- [ ] Nothing that looks like an enemy bullet unless it is one.
- [ ] Backdrop layers inside the value budget (4.1).
- [ ] Made by the source section 6 names; AI-assisted art carries its `.art.json`.
- [ ] Keeps the name of what it replaces; `pnpm assets` and `pnpm content:check` clean.

---

## 10. Still open

R3-01's acceptance also asks for **a sample sheet per category generated and ingested as a proof**.
That needs:

- R3-02's ingest tool;
- the art round's committed winners (`art-prompts/v2/winners/`, after round 2).

So R3-01 is *done (owner parts pending)*. Still owner work:

- the proof run, one category at a time;
- the playfield-grade decision for the bright zones (DUNE EXPANSE, TEMPEST RIDGE, BRINE NEBULA) when
  their layers are made;
- the font cell (R4-03);
- the readability sign-off (R4-02);
- **the licence reading of R3-05 before any winner ships.** 84 of the 91 winners were made by
  FLUX.2-dev, whose weights are under a non-commercial licence, so its terms for outputs decide
  whether those images may be ingested as pixels or only used as design references.

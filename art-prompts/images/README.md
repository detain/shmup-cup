# SHMUP CUP — AI Image Generation Prompt Library

Ready-to-paste prompts for the sglang image pipeline. Supported models:
**stable-diffusion-3.5-large** (sd3.5), **flux.1-dev**, **flux.2-dev**, **qwen-image**.

Every prompt paragraph is **self-contained** — models have no memory, so each entry
repeats the style anchors it needs. Paste the fenced `text` block verbatim; do not
trim the style sentences.

## Layout

```
art-prompts/images/
├── README.md                  ← this file
├── 00-style-kernel.md         ← shared style paragraphs, palette tables, negative library
├── 10-logo-title/             ← logo lockups, title screen, app icon, emblem variants (TEXT → qwen-image)
├── 20-player-crafts/          ← KESTREL & MANTA concept art, profiles, P2 swaps, sprite sheets
├── 30-bosses/                 ← one file per boss (10 campaign + 4 extra), 3 variations each
│   └── hi-res.md              ← documentation-quality wide renders of the 10 campaign bosses
├── 40-enemies/                ← per-zone enemy concept art + in-game pixel sprite sheets (9 files)
├── 50-stages/                 ← zone wallpapers/banners/posters, high-speed dimension, escape corridor
├── 60-items-fx/               ← capsules, orbs, shield gems, black hole bomb, mega crash, explosions
├── 70-key-moments/            ← WARNING flash, boss death, escape, 5 endings, game over, victory card
└── 80-promo/                  ← website heroes, store banners, social card, magazine cover, posters
```

## Output naming convention

Save generated images as:

```
<category-dir>/<slug>-v<variation>-<model>.png
```

Examples: `30-bosses/hb01-reveal-v1-sd3.5-large.png`,
`10-logo-title/logo-lockup-v2-qwen-image.png`, `50-stages/zone-a-wallpaper-v1-flux.2-dev.png`.
The `<slug>` and `v<variation>` come straight from each entry header; `<model>` is the
short id (`sd3.5-large`, `flux.1-dev`, `flux.2-dev`, `qwen-image`).

`generate.mjs` asks the server for **PNG** (`output_format: png`) since R3-01 — JPEG has no
alpha and its artefacts blur pixel edges; `--format jpeg` restores the old output.

## Base settings per model

| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| guidance | 4.5–6 (use **5.0**) | **3.5** | 3.5–4 (**3.5**) | **4.0** |
| steps | 28–40 (use **32**) | 28–50 (use **40**) | 30–50 (use **40**) | 30–50 (use **30**) |
| negative prompt | supported | **NOT supported — leave empty** | **NOT supported — leave empty** | supported |
| resolutions | multiples of 16: 1024x1024, 1152x896, 896x1152, 1536x640 | same ladder | same ladder | same ladder |

Each entry repeats a concrete per-model table; the values above are just the defaults
those tables are drawn from.

## Model selection heuristics

- **Any visible text ("SHMUP CUP", "WARNING!!", score screens)** → flux.2-dev first
  (it won all seven text items in the R0-04 round-1 pick), qwen-image second. Quote the
  exact string in the prompt. **FLUX is on hold** (see Licences below): until its licence
  is cleared, nothing generated with a FLUX model ships or even serves as an edit
  reference (decision RR-4) — so for anything headed into the game, qwen-image leads the
  pick and flux.2-dev stays the yardstick it is measured against.
- **Clean vector-ish illustration, silhouettes, icons, sprite sheets** → flux.1-dev /
  flux.2-dev (literal, crisp shapes, no negative needed) — same hold applies: these
  renders guide the picking; the shipped pixels come from a licensable model or from hand.
- **Rich painterly scenes with mood and lighting** → sd3.5-large or flux.2-dev.
- **Terrain material swatches** → sd3.5-large won the six terrain families in round 1;
  its swatches are **material references for hand-laid tilesets only — never shipped
  tiles** (the bible's tile rule).
- **Ultra-wide 1536x640 panoramas** → sd3.5-large handles the aspect natively; flux
  models also work — keep composition instructions ("left third / center / right third")
  explicit when going wide.

## Licences (what may ship)

Condensed from `docs/dev/art-provenance.md` §2 (the verdicts) and §6 (their conditions) —
that file is the authority. **A model not in its table makes no shipped art.**

- **flux.2-dev, flux.1-dev — ON HOLD.** Non-commercial licence. Nothing generated with
  them ships — not a pixel, not as the base of an edit — until the owner has a written
  commercial confirmation from BFL. They stay usable for picking and evaluation (the
  round-1 winners, 84 of 91, are FLUX.2-dev, including all seven text items); the
  licensable runner-up becomes the shipped pick.
- **qwen-image — ships.** Apache 2.0; no conditions on outputs.
- **Wan2.2-T2V-A14B (video) — ships.** Apache 2.0; the card's legal and harm usage notes
  are respected.
- **stable-diffusion-3.5-large — ships with two conditions:** after the owner completes
  the free Stability registration, and only while annual revenue stays under USD 1 M
  (Community License). Its round-1 terrain swatches are material references only.
- **ltx-2.5 (video) — ships under a USD 10 M revenue cap.** Every clip is disclaimed as
  machine-generated wherever it is shown, and its embedded watermark, metadata and
  provenance record are kept.
- **LTX-Video (the open fallback) — on hold** until the exact checkpoint's licence is known.

## Seeds

Every entry carries a deterministic seed (category offset + slot). Same seed across the
models in a row so you can A/B compare renders at identical composition. If a render
nails composition but fails elsewhere, re-roll only by bumping the seed by 1 — do not
edit the prompt mid-batch.

## Style kernel (canonical paragraph — see 00-style-kernel.md for variants)

> SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated
> limited palette, deep-navy backgrounds that never fall to pure black, glowing pink,
> red and violet enemy bullets with bright cores and dark rims, gleaming gold capsules,
> orange-white explosion ramp, widescreen side-scrolling arcade composition, subtle CRT
> scanline glow. For large-format art add: ultra-detailed, clean vector shapes with
> pixel-art texture accents.

In-game sprite subjects (crafts, enemies, boss plates, item and FX sheets) use the **K3 v2**
kernel instead: a 1-px dark outline, a flat pure-green key background (`#00FF00`) and the
v2 (640×360) sizes and frame counts — see `00-style-kernel.md`. Scenes, backdrops, logos and
promo art keep the deep-navy atmosphere.

Prompts in this library embed an adapted version of that kernel plus the game's exact
canonical subjects (KESTREL, MANTA, the IRON TIDE, zones A–I). Colors are written in
words inside prompts; the anchoring hex codes live in each entry's **Notes** and in
`00-style-kernel.md`. All subjects are original IP — no external game references.

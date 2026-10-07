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

- **Any visible text ("SHMUP CUP", "WARNING!!", score screens)** → qwen-image first
  (best rendered typography), flux.2-dev as the alternate. Quote the exact string in
  the prompt.
- **Clean vector-ish illustration, silhouettes, icons, sprite sheets** → flux.1-dev /
  flux.2-dev (literal, crisp shapes, no negative needed).
- **Rich painterly scenes with mood and lighting** → sd3.5-large or flux.2-dev.
- **Ultra-wide 1536x640 panoramas** → sd3.5-large handles the aspect natively; flux
  models also work — keep composition instructions ("left third / center / right third")
  explicit when going wide.

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

Prompts in this library embed an adapted version of that kernel plus the game's exact
canonical subjects (KESTREL, MANTA, the IRON TIDE, zones A–I). Colors are written in
words inside prompts; the anchoring hex codes live in each entry's **Notes** and in
`00-style-kernel.md`. All subjects are original IP — no external game references.

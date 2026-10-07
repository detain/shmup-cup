# SHMUP CUP — AI Video Generation Prompts

Ready-to-paste prompts for the two text/image-to-video models hosted in sglang:

| Family | Variants | Strength | Prompt style |
|---|---|---|---|
| **LTX-Video** (`ltx-video`) | t2v, i2v | Fast drafts, clean continuous motion, cheap iteration | Concise, motion-focused, one short paragraph naming subject + movement + camera |
| **Wan 2.2** (`wan2.2`) | `wan2.2-t2v`, `wan2.2-i2v` | Cinematic quality, rich atmosphere, best for hero shots | One continuous, richly descriptive paragraph: subject, motion, camera, atmosphere, lighting |

Wan 2.2 A14B runs a **two-model denoising pair** (high-noise model for early structure,
low-noise model for detail refinement) — sglang exposes this as a single endpoint; you only
pick width/height/num_frames/fps/guidance/steps/seed. The **I2V** variant is the companion to
`art-prompts/images/`: generate a still from those prompts, then animate it here. Motion stays
locked to the exact art direction of the still — this is the most reliable path for
on-brand footage.

## sglang parameter vocabulary

Both models are driven by the same parameter names; only the sensible value ranges differ.

| Param | Meaning | ltx-video | wan2.2 |
|---|---|---|---|
| `mode` | `t2v` (text→video) or `i2v` (image+text→video) | both | both (`wan2.2-i2v` weights) |
| `width` / `height` | Output size in px; **multiples of 32** | 768x512, 512x512, 960x544 (VRAM permitting) | 1280x720, 832x480 hero; 832x480 / 720x1280 vertical |
| `num_frames` | Frame count | 97–121+ | 81 (canonical) |
| `fps` | Playback rate | 24–30 | 16 |
| `guidance` | CFG scale | 3.0–3.5 | 3.5–5.0 (use 4.0–4.5) |
| `steps` | Denoise steps | 30–50 | 30–40 |
| `seed` | Deterministic seed — every entry here has a unique one | any int | any int |
| `negative_prompt` | What to suppress | supported | supported |
| `image` (i2v only) | Source still path/URL | supported | required for `wan2.2-i2v` |

Effective duration: Wan 81f @ 16fps ≈ **5.1 s**; LTX 121f @ 30fps ≈ **4.0 s**, 97f @ 24fps ≈ **4.0 s**.
For longer edits, generate several entries of the same scene at different seeds and cut on motion.

## T2V vs I2V workflow

1. **T2V first for exploration** — cheap LTX passes to discover which composition/motion reads best.
2. **Lock the frame with the image pipeline** — generate the exact still from the matching entry in
   `art-prompts/images/` (same scene slug lives there, e.g. `30-bosses/galvanic-maw-*`).
3. **Animate with I2V** — feed the still to `wan2.2-i2v` (or LTX i2v) and use the prompt from this
   tree. Keep the prompt describing only *motion and camera* changes; the still already carries
   subject/style/atmosphere.
4. Every i2v entry below names its expected source still. Actual still filenames depend on which
   image model produced them (suffix varies, e.g. `-v1-flux.2-dev.png`); glob the slug if the exact
   name drifted.

Aspect guidance: **16:9** (1280x720 / 960x544) for trailer and gameplay shots,
**9:16** (720x1280 / 576x1024) for social verticals, **1:1** (512x512) for feed-square clips.

## Negative-prompt library

Base line (used by almost every entry):

```
worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker
```

Add-ons by situation:

| Situation | Append |
|---|---|
| Pixel-art look must survive | `photorealistic, 3d render, smooth vector gradients, anti-aliasing mush` |
| Gameplay fidelity | `first-person camera, rotating camera, vertical scrolling, UI elements, HUD` |
| Loop work | `scene change, cut, flash to black, sudden zoom` |
| Logo/text shots | `misspelled letters, warped typography, extra letters, gibberish text` |
| Boss scale | `small creature, tiny ship, cramped composition` |

## Loop & tail-frame tips (shoot-'em-up assets are mostly loops)

- **Prompt the loop geometry**: say what moves *uniformly and continuously* — "drifting",
  "scrolling steadily", "pulsing on a slow rhythm" — and forbid events: "no cuts, no fade,
  single continuous shot". Avoid prompts with a climax in the middle for loop purposes.
- **Seed the loop**: for ambient backgrounds, pick slow uniform motion (parallax drift, gas flow);
  fast chaotic motion almost never wraps.
- **Post-wrap, the cheap trick**: cross-dissolve the last ~8 frames over the first ~8 frames in
  ffmpeg (`xfade`) — hides the seam on anything with steady motion.
- **Round-trip trick for I2V**: extract the last frame of a generated clip and run a second i2v
  pass from that frame with the same prompt/seed family, then concat — doubles loop length.
- **Tail-frame control**: when a clip must end where another begins (escape sequence beats),
  generate the *next* beat as i2v from the previous clip's last frame instead of hoping t2v matches.
- Keep `fps` consistent across beats you intend to stitch (all Wan beats at 16 fps, all LTX at 24).

## Directory map

| Dir | Contents |
|---|---|
| `00-workflow.md` | Still+I2V pairing, resolution/aspect sheet, checklist per model |
| `10-title-attract/` | Logo sting, title-screen ambient loop, story-crawl vista |
| `20-gameplay/` | KESTREL bullet weave, MANTA black-hole vortex, co-op, parallax zone transitions |
| `30-boss-intros/` | WARNING!! moments for HALCYON BULWARK, GALVANIC MAW, SANDGRAVE WIDOW, SQUALL STEED, ABYSS ARK, THE HOLLOW KING |
| `40-boss-deaths/` | Chained hull explosions, bullet-to-gold transmutation, MEGA CRASH shockwave |
| `50-key-moments/` | Citadel escape, breaking surface, ark dive, dawn flight home, black-hole bomb slow-mo |
| `60-promo/` | One dramatic camera beat per zone (9 zones + neon dimension), vertical social cuts |
| `70-ambient-loops/` | Seamless website hero loops: starfield, nebula gas, checkerboard dimension rush, abyss particles |

## Seed scheme

Seeds are deterministic and block-allocated so they never collide:
`21xxx` title/attract · `22xxx` gameplay · `23xxx` boss intros · `24xxx` boss deaths ·
`25xxx` key moments · `26xxx` promo · `27xxx` ambient loops.

## Style constant (every prompt bakes this in)

SNES-era 16-bit pixel-art look, widescreen side-scrolling composition, deep-navy space palette
(never pure black), saturated bold-outlined sprites, hot-pink/red/violet enemy bullets, gold
capsule pickups, orange-white chained explosions, CRT scanline glow. Arcade tough-but-fair,
telegraphed danger, dramatic-quiet cosmic undertone. All IP original — no franchise references
ever creep into these prompts.

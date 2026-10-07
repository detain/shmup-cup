# Workflow — Pairing Stills with I2V, Resolutions, and Per-Model Checklists

## 1. The still → motion pipeline

```
art-prompts/images/<category>/<slug>.md  →  generate still  →  art-prompts/images/<category>/<slug>-v1-<model>.png
                                                                    │
art-prompts/video/<category>/<file>.md  ←  i2v entry names that PNG ←┘
```

Why animate from a still instead of pure t2v:

- **Art direction is locked.** The image prompts encode the exact palette (#05070f–#0c1a3c navy
  backgrounds, #ff5aa0/#ff3a3a/#b84cff bullets, gold capsules) and sprite silhouette language of
  SHMUP CUP. T2V drifts; I2V from an approved still cannot.
- **Ship identity survives.** KESTREL (steel-blue dart, cyan canopy, orange trail) and MANTA
  (pale-mint ray-wings, green canopy, twin amber thrusters) are hard to keep consistent across
  pure t2v generations.
- **Hero budget.** Wan 2.2 I2V at 1280x720 costs real minutes — spend it only on stills already
  blessed.

### I2V prompting rule

The still already answers *what it looks like*. The motion prompt should answer only:
**what moves, how fast, and what the camera does.** Re-describing static content invites morphing.
Pattern: `"<subject> drifts / surges / pulses <direction + speed>, camera <behavior>, light <change>, no cuts."`

## 2. Aspect & resolution sheet

| Use | Aspect | Wan 2.2 | LTX-Video |
|---|---|---|---|
| Trailer / hero 16:9 | 16:9 | 1280x720 | 960x544 |
| Gameplay-faithful wide | 16:9 | 832x480 | 768x512 |
| Social vertical 9:16 | 9:16 | 720x1280 | 576x1024 |
| Feed square 1:1 | 1:1 | 512x512 (from 832x480 crop) | 512x512 |
| Web hero loop | 16:9 | 832x480 (crop to strip) | 768x512 |

All dimensions are multiples of 32 — required by LTX, conventional for Wan. When the final
deliverable is square/vertical from a 16:9 master, generate 16:9 and crop; both models deform on
unusual native ratios.

## 3. Per-model run checklists

### LTX-Video (`ltx-video`)

- [ ] Mode `t2v` or `i2v` set on the endpoint
- [ ] width/height multiples of 32 (768x512 default, 960x544 if VRAM allows)
- [ ] num_frames 97–121, fps 24–30
- [ ] guidance 3.0–3.5 (higher = punchier motion, more artifacts)
- [ ] steps 30–50 (30 is usually enough for drafts)
- [ ] negative: base line from README
- [ ] prompt: one short paragraph, verbs first — *what moves, how the camera travels*

### Wan 2.2 (`wan2.2-t2v` / `wan2.2-i2v`)

- [ ] Correct weight: A14B high-noise + low-noise pair loaded (sglang serves both in sequence)
- [ ] width/height 1280x720 (hero) or 832x480 (drafts/social crops)
- [ ] num_frames 81, fps 16 — do not fight the canonical 5 s clip
- [ ] guidance 4.0–4.5 (3.5 softer/more creative, 5.0 rigid)
- [ ] steps 30–40
- [ ] i2v: pass the blessed still as `image`; keep max motion strength unless the shot demands a beat change
- [ ] prompt: single continuous richly descriptive paragraph (t2v) or motion-only paragraph (i2v)
- [ ] negative: base line + situation add-ons from README

## 4. Naming & bookkeeping

- Entry slugs here mirror the image-prompt slugs in `art-prompts/images/` where an i2v pairing exists,
  so `ls art-prompts/images -R | grep <slug>` finds the still.
- Log every accepted generation as `<slug>-s<seed>.mp4` next to where the video lands.
- Rejected clips: keep the seed — same seed + edited prompt is the fastest iterate loop.

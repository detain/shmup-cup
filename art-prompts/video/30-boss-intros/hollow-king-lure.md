# Boss Intros — THE HOLLOW KING HK-10 (Anglerfish God)

Deep in the ark's dark hold: almost no light at all, then the lure. The reveal grammar is
one warm point growing until the jaws around it become visible — and too late.

## king-lure-glow — a single light wakes in the absolute dark
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 1/2

```text
Retro 16-bit pixel-art horror-quiet boss intro inside a pitch dark hold: the frame is near-black navy with only faint drifting dust specks, a red warning glow throbs once low and brief, then far center a single pale lure bulb on a bent rod begins to brighten, its warm gold light spreading in a soft cone and revealing one ring of details at a time — wet-looking riveted teeth taller than the frame edge, the suggestion of an anglerfish god's vast skull, rows of dim dead eyes catching the lure light last, as the bulb reaches full strength the shadow behind it shifts and an enormous jaw line begins to part, the tiny fighter silhouette at frame left backpedals with twin orange thrusters flaring, camera static then a slow dolly backward that stops against the frame edge, suffocating dread, CRT scanline glow, continuous single take.
```

**Settings:**
| param | value |
|---|---|
| resolution | 1280x720 |
| num_frames | 81 |
| fps | 16 |
| duration | ~5s |
| guidance | 4.5 |
| steps | 40 |
| seed | 23013 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, 3d render, fully lit scene, organic fish, many lights`
**Notes:** Lighting discipline is everything: the lure must be the only strong source. If Wan floods the hold with fill light, add `dim ambient` pressure by raising guidance to 5.0 and rerunning. The dolly-back-into-frame-edge gag lands the "the screen is his mouth now" premise.

## king-jaws-over-screen — the lure was the trap, jaws close over everything
**Model:** ltx-video
**Mode:** i2v
**Variation:** 2/2

```text
The glowing lure swings once gently, then the dark walls around it start sliding inward — huge toothed jaw plates closing in from every edge of the frame, the lit cone narrowing as the jaws approach, dust specks rushing inward, the last light pinching out near the end, camera static, slow inevitable closing, single continuous shot ending almost black.
```

**Settings:**
| param | value |
|---|---|
| resolution | 768x512 |
| num_frames | 97 |
| fps | 24 |
| duration | ~4s |
| guidance | 3.2 |
| steps | 35 |
| seed | 23014 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut`
**Source image:** `art-prompts/images/30-bosses/hollow-king-lure-v1-flux.2-dev.png` (glob `30-bosses/hollow-king*`)
**Notes:** The "jaws that close over the whole screen" mechanic previewed literally — edges-inward closing motion is reliable for LTX. Ends near-black, which makes a perfect fade-to-fight or fade-to-death cut point; do not loop this one.

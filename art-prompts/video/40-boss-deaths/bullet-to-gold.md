# Boss Deaths — Bullet-to-Gold Transmutation

The beauty shot of SHMUP CUP's mercy mechanic: when the boss dies, every hostile bullet on
screen transmutes into sparkling gold point values that fountain, chime-visible, and drift.
Pure dopamine frame — highest save-rate for social crops.

## death-bullets-to-points — the whole screen turns to treasure
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 1/2

```text
Retro 16-bit pixel-art widescreen arcade miracle moment: in the instant after the boss dies, hundreds of glowing hot-pink and red enemy bullets hanging across the entire frame flash white one after another in a fast spreading wave from center outward, each one transmuting mid-air into a spinning sparkling gold point sprite that trails a brief glitter tail, the frozen bullet lattice dissolving into a drifting constellation of falling treasure, small gold capsules tumbling down through it catching light, the tiny blue dart fighter at left surges forward through the golden rain with its cyan canopy glowing brighter, deep navy background now warm-flecked like a jewelry box, soft bloom, CRT scanline glow, joyful abundance, continuous single take.
```

**Settings:**
| param | value |
|---|---|
| resolution | 1280x720 |
| num_frames | 81 |
| fps | 16 |
| duration | ~5s |
| guidance | 4.2 |
| steps | 40 |
| seed | 24004 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, coins with numbers, gold bars, explosions`
**Notes:** The white-flash wave traveling center-outward is the sync point for the death jingle — if the transmutation happens all at once instead of as a wave, strengthen "one after another in a fast spreading wave". Keep explosions out of frame; this beat is serenity after violence.

## death-gold-rain-closeup — slow drift through the point stream
**Model:** ltx-video
**Mode:** i2v
**Variation:** 2/2

```text
Camera drifts slowly forward through a gentle rain of spinning golden pixel point sprites with glittering tails, a few hot-pink bullets mid-flash white as they convert, warm sparkles bokeh-past the lens, the silhouetted fighter gliding right through the stream below, calm floating motion, seamless loop, no cuts.
```

**Settings:**
| param | value |
|---|---|
| resolution | 512x512 |
| num_frames | 121 |
| fps | 24 |
| duration | ~5s |
| guidance | 3.0 |
| steps | 30 |
| seed | 24005 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut`
**Source image:** `art-prompts/images/40-bosses/gold-transmutation-v1-flux.2-dev.png` (glob `40-bosses/gold-transmutation*`)
**Notes:** Square 1:1 native for feed posts; forward drift through uniform sparkle fall wraps cleanly for a short seamless reward loop on results screens.

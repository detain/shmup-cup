# Key Moments — Black Hole Bomb in Slow Motion

The panic-button beauty pass: time stretches as the three-armed vortex opens, bullets crawl
inward along the spiral, and the lightning discharge rolls out in extreme slow bloom.
Distinct from the gameplay version (20-gameplay/manta-blackhole-vortex) — here physics is
syrup and the camera is brave enough to be close.

## bh-bomb-slowturn — spiral arms unfurl, bullets creep inward
**Model:** wan2.2-i2v
**Mode:** i2v
**Variation:** 1/2

```text
Extreme slow motion: the violet-blue three-armed spiral at frame center turns lazily, each arm dragging visible warp streaks, dozens of hot-pink enemy bullets crawl toward the core along curving drain paths leaving long thin comet tails, one shattered armor plate corkscrews inward in exaggerated slow rotation, light haloes ripple around the vortex rim, the mint-green manta silhouette at frame edge hangs nearly still with its thruster ribbons unfurling like smoke in the same slow current, camera drifts one careful inch closer, hypnotic suspended destruction, continuous single take.
```

**Settings:**
| param | value |
|---|---|
| resolution | 1280x720 |
| num_frames | 81 |
| fps | 16 |
| duration | ~5s |
| guidance | 4.0 |
| steps | 35 |
| seed | 25010 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut`
**Source image:** `art-prompts/images/20-gameplay/manta-blackhole-bomb-v1-flux.2-dev.png` (glob `20-gameplay/manta-blackhole-bomb*` — same still as the gameplay vortex entry, reuse)
**Notes:** Slow motion hides i2v's weakest trait (temporal jitter) — this is the most forgiving way to render the vortex hero shot. The "one careful inch" camera keeps it from feeling frozen; raise to a gentle push if it stalls.

## bh-bomb-lightning-roll — the discharge wave in ultra slow bloom
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 2/2

```text
Retro 16-bit pixel-art slow-motion white lightning discharge: at the heart of a spinning violet spiral, a single bright point flashes and its shockwave of white-blue electric arcs rolls outward across the frame in exaggerated slow motion, arc filaments branching and rebranching as they travel, every remaining pink bullet caught in the wavefront transmuting to sparkle and dissolving, the light wave passing the camera with a held white bloom that fades down to reveal a cleared deep-navy field drifting with fading gold embers, the tiny manta craft rocking gently in the aftermath current at left, camera static, catharsis in extreme slow time, bold outlines, CRT scanline glow, continuous single take.
```

**Settings:**
| param | value |
|---|---|
| resolution | 960x544 |
| num_frames | 121 |
| fps | 24 |
| duration | ~5s |
| guidance | 4.2 |
| steps | 40 |
| seed | 25011 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, lightning strike bolt, rain, clouds`
**Notes:** "Rolling outward wave of arcs" instead of "lightning bolt" keeps it a discharge front, not a weather event. The hold-to-white then fade-to-cleared-field is a built-in scene transition — reuse the tail as an incoming card for any aftermath shot.

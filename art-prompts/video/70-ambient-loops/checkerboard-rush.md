# Ambient Loops — Neon Dimension Checkerboard Rush

The Mode-7 bonus dimension as an endless forward sprint — the most energetic hero-loop
option for the site, and a natural fit behind soundtrack pages. Forward rush on uniform
geometry is inherently tileable: every frame's perspective is identical.

## loop-checkerboard-rush — even-velocity grid sprint, static horizon
**Model:** ltx-video
**Mode:** t2v
**Variation:** 1/2

```text
Pixel-art synth dimension rushing forward: an infinite neon-violet and dark checkerboard floor glides steadily toward the viewer in perfect even perspective, floor seam light-trails of magenta and cyan streaming toward a fixed hard horizon, stacked horizontal glow bands at the horizon pulsing on one slow even cycle, no ships, no obstacles, pure constant velocity hypnotic forward travel, no cuts, seamless loop of retro speed ambience.
```

**Settings:**
| param | value |
|---|---|
| resolution | 960x544 |
| num_frames | 121 |
| fps | 30 |
| duration | ~4s |
| guidance | 3.0 |
| steps | 35 |
| seed | 27005 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, camera turning, camera lifting, obstacles, scene change, cut`
**Notes:** `camera turning / lifting` in the negative is critical — any horizon shift breaks the tile. Pulse cycle at the horizon should complete once or twice per clip so the cross-dissolve lands in phase; nudge num_frames to 120 multiples of the pulse if needed.

## loop-checkerboard-rush-ship — same rush, one dart skimming the grid
**Model:** wan2.2-i2v
**Mode:** i2v
**Variation:** 2/2

```text
The grid plane races steadily forward toward its fixed glowing horizon, light trails along the floor seams streaming at constant speed, the small steel-blue dart fighter glides low rightward across the checkerboard leaving a long bent orange ribbon that ripples behind it, its canopy cyan glow pulsing slowly, the horizon bands breathing on an even cycle, velocity hypnotic and unchanging, camera locked, no events, no cuts, seamless loop of dimension ambience.
```

**Settings:**
| param | value |
|---|---|
| resolution | 1280x720 |
| num_frames | 81 |
| fps | 16 |
| duration | ~5s |
| guidance | 3.8 |
| steps | 30 |
| seed | 27006 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut, new subjects entering mid-loop`
**Source image:** `art-prompts/images/70-ambient/neon-rush-v1-flux.2-dev.png` (glob `70-ambient/neon-rush*`; the zone-montage neon-dimension still also works)
**Notes:** The ship version has a traveling subject, so true tiling needs the trim trick: cut the clip at the exact frame the ship exits and re-enter at its entry frame, then cross-dissolve — or just loop the shipless first/last seconds as the safe tile.

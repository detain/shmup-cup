# Gameplay — Co-op Two-Ship Screen

KESTREL and MANTA flying the same lane: crossing fire lanes, mirrored dodges, double the
engine trails. Two-ship frames are the co-op selling shot — keep both silhouettes readable.

## coop-crossfire-formation — both crafts trading lanes through bullet rain
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 1/2

```text
Widescreen 2D side-scrolling retro 16-bit pixel-art co-op arcade shooter: two small fighter crafts hold the left half of frame in loose vertical formation — a steel-blue dart-shaped fighter with cyan canopy glow and orange engine trail above, a flat pale-mint ray-winged manta craft with green canopy and twin amber thrusters below — as they smoothly trade lanes through a rain of hot-pink and red glowing bullets sweeping in from the right, both noses spitting continuous cyan and green pixel tracers leftward, bold-outlined mechanical sea drone enemies burst into chained orange-white explosions on the right edge, gold capsule pickups tumble and glitter among the debris, deep navy starfield with a blue planet rim parallaxes steadily, camera tracks right at constant speed keeping both ships upright and readable, saturated arcade colors, faint CRT scanlines, continuous single take.
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
| seed | 22007 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, 3d render, single ship only, first-person camera, vertical scrolling, HUD`
**Notes:** Two distinct ship silhouettes in one generated frame is the hardest ask — expect merges; the "above/below" lane split helps. Gold capsules drifting through add the reward-fantasy cue for marketing.

## coop-victory-sweep — camera pans across both ships flying home low and fast
**Model:** ltx-video
**Mode:** i2v
**Variation:** 2/2

```text
The two pixel-art fighters accelerate rightward in tight side-by-side formation, four engine trails streaming and weaving behind them, distant orange flashes pop along the horizon below, the camera tracks alongside them with a slight speed-blur on background layers, steady forward rush, no cuts.
```

**Settings:**
| param | value |
|---|---|
| resolution | 960x544 |
| num_frames | 97 |
| fps | 30 |
| duration | ~3.2s |
| guidance | 3.2 |
| steps | 30 |
| seed | 22008 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut`
**Source image:** `art-prompts/images/20-gameplay/coop-two-ships-v1-flux.2-dev.png` (glob `20-gameplay/coop*`)
**Notes:** Short punchy beat for trailer assembly; speed-blur on background only keeps the sprites crisp. Trails weaving in the wind of each other is the charm detail — regenerate if they go parallel and dead.

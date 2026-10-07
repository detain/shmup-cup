# Boss Intros — ABYSS ARK AA-09 (Whale Flagship)

The whale-bodied flagship that refuses to stand and fight — its intro IS its threat:
a slow tail turn and the beginning of the long retreat the escape chase will pursue.

## ark-sailing-away — the fluke turns and the horizon starts moving
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 1/2

```text
Retro 16-bit pixel-art widescreen boss intro in abyssal indigo water-light: the frame darkens to near-black navy with two deep red warning pulses, then the camera widens to reveal the ABYSS ARK — a continent-sized mechanical whale flagship of overlapping barnacled steel plates and long violet glow-seams — executing a slow majestic turn at the right of frame, its colossal tail fluke sweeping up and shedding curtains of dark water, bioluminescent specks dragging off its edges like a comet tail, rows of amber running lights flicking on along its back as it angles away toward the distant dark, the tiny manta craft silhouetted small at left chasing its wake, current lines and drifting particulate beginning to flow past faster, stately inexorable menace, bold outlines, CRT scanline glow, continuous single take.
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
| seed | 23011 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, 3d render, organic whale, fast motion, aggressive charging`
**Notes:** Restraint is the point — an escaping boss is scarier than an attacking one. If the turn comes off as an attack swoop, strengthen "slow majestic turn ... angles away" and drop guidance to 4.0. This clip's last frame is the seed still for the escape-chase i2v beats.

## ark-wake-drift — tail-flick wake, camera lingers behind
**Model:** ltx-video
**Mode:** i2v
**Variation:** 2/2

```text
The giant mechanical whale's tail fluke drops slowly once, pushing a rolling wake of dark water and glittering bioluminescent specks toward the camera, the hull silhouette slides steadily rightward into the deep, particulate streams past in the current, faint violet seams pulse along its flank, camera holds static then pans slightly right following the retreat, continuous slow departure, no cuts.
```

**Settings:**
| param | value |
|---|---|
| resolution | 768x512 |
| num_frames | 121 |
| fps | 24 |
| duration | ~5s |
| guidance | 3.0 |
| steps | 35 |
| seed | 23012 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut`
**Source image:** `art-prompts/images/30-bosses/abyss-ark-v1-flux.2-dev.png` (glob `30-bosses/abyss-ark*`)
**Notes:** The follow-pan-left-behind sells "we have to chase that" in one gesture. Wake particles streaming toward camera loop acceptably for an ambient pre-fight menu bed.

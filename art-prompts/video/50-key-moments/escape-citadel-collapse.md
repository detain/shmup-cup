# Key Moments — Citadel Escape Sequence

The finale's pulse: flying right through a collapsing Iron Citadel corridor at ramping speed
while everything detonates behind. Three beats of one continuous chase — generate separately,
stitch tail-frame to head-frame (see README loop section).

## escape-corridor-run — steady right-rush through riveted halls
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 1/3

```text
Widescreen retro 16-bit pixel-art escape run: the steel-blue dart fighter screams rightward through a vast riveted steel corridor of the collapsing citadel, chasing amber warning lights streaking along the walls whipping past at speed, behind it a rolling wall of orange-white fireballs detonates section after section of the hall, floor plates buckling upward into the blast, ceiling girders tumbling end over end ahead of the flame front, the fighter weaving through gaps in falling debris with crisp short dodges, its engine trail stretched long and thin, spark showers bursting where the fire licks the walls, the camera tracks alongside at matching speed with motion-blur only on the background layers so the sprite stays sharp, escalating pace, arcade tension, deep-shadow steel palette with hot orange highlights, CRT scanline glow, continuous single take.
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
| seed | 25001 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, 3d render, slow motion, camera leading the ship, first-person camera, static camera`
**Notes:** "Camera tracks alongside" not "camera ahead" — leading the ship kills escape-shot tension. The fire wall must stay behind: `camera leading the ship` in the negative is deliberate.

## escape-ramp-speed — the corridor bends, speed steps up again
**Model:** ltx-video
**Mode:** t2v
**Variation:** 2/3

```text
Fast pixel-art side-scroll chase: the fighter rocketing rightward banks hard through a bending steel corridor, wall lights smearing into continuous amber streaks, a detonation bursts through the hall behind it throwing a rolling fireball into pursuit, debris chunks tumble past the camera leftward at speed, the ship's trail whips through the turn and stretches longer, acceleration kick at the end of the bend, single continuous shot.
```

**Settings:**
| param | value |
|---|---|
| resolution | 960x544 |
| num_frames | 97 |
| fps | 30 |
| duration | ~3.2s |
| guidance | 3.5 |
| steps | 40 |
| seed | 25002 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, slow motion, static camera`
**Notes:** The bank-through-bend is the speed-step-up visual — pair its exit frame with beat 3's entry. LTX speed smears read great at 30 fps; keep steps high or streaks go muddy.

## escape-citadel-behind — burst out into open sky, whole fortress detonating
**Model:** wan2.2-i2v
**Mode:** i2v
**Variation:** 3/3

```text
The fighter streaks out of the shattered corridor mouth into open night sky and keeps accelerating rightward, behind it the entire riveted fortress-citadel detonates in a staggered cascade of rolling orange-white fireballs that bloom one after another across its full height, tower sections peeling away into smoke, amber interior lights winking out in waves as the blast front passes, shockwave rings expanding through the cloud deck, the ship's tiny silhouette riding the leading edge of the destruction with a long straight trail, camera slowly pulls back to widen the scale of the dying fortress, continuous single take, no cuts.
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
| seed | 25003 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut, static camera`
**Source image:** `art-prompts/images/50-key-moments/citadel-exit-v1-flux.2-dev.png` (glob `50-key-moments/citadel-exit*`; or extract the last frame of the beat-2 clip)
**Notes:** The pull-back-to-widen is the emotional payoff of the whole campaign — spend the hero budget here. Staggered "one after another" cascades are Wan's strong suit; if the fortress implodes in one pop, rerun same seed, guidance 4.3.

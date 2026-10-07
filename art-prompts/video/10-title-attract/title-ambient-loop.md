# Title & Attract — Title-Screen Ambient Loop

The breathing background behind the title: starfield parallax drift, ship idle, scanline glow.
All three entries are loop-first — uniform slow motion, no events, no cuts.

## title-starfield-drift — multi-layer parallax starfield over a planet rim
**Model:** ltx-video
**Mode:** t2v
**Variation:** 1/3

```text
Deep navy space scrolls quietly: near star pixels slide steadily left while distant stars crawl, a soft blue planet rim glows along the bottom edge of frame with a thin atmospheric haze band, occasional faint cyan glints ripple across the haze, all motion slow, uniform and continuous, camera perfectly static, no cuts, single ambient shot.
```

**Settings:**
| param | value |
|---|---|
| resolution | 768x512 |
| num_frames | 121 |
| fps | 30 |
| duration | ~4s |
| guidance | 3.0 |
| steps | 30 |
| seed | 21004 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, scene change, cut, flash to black, sudden zoom`
**Notes:** Lowest-risk background loop. Drift direction is leftward so it matches an attract screen where ships fly right. Cross-fade tail into head for a perfect web/title loop.

## title-ship-idle — hero craft hovering over the Azure Verge rim
**Model:** wan2.2-i2v
**Mode:** i2v
**Variation:** 2/3

```text
The steel-blue dart fighter hovers almost motionless at right-center frame, its engine exhaling a steady streaming orange trail that flares and throbles softly, the cyan canopy glow pulses on a slow breathing rhythm, starfield behind drifts steadily left in two parallax speeds, the blue planet rim haze shimmers faintly, camera static, everything moves slowly and continuously, no cuts, calm arcade title-screen ambience.
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
| seed | 21005 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut`
**Source image:** `art-prompts/images/10-title/title-screen-hero-v1-flux.2-dev.png` (glob `10-title/title-screen*`)
**Notes:** Engine trail + canopy pulse give life without committing the ship to travel, which is exactly what a title screen needs. Watch the thruster for frame-skip flicker; drop guidance to 3.5 if the hull warbles.

## title-attract-sweep — camera slowly slides across the attract vista
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 3/3

```text
A widescreen retro 16-bit pixel-art space vista drifts past in a slow continuous rightward camera slide: layers of deep-navy starfield parallax at three speeds, distant teal nebula wisps, a small blue dart fighter and a pale-mint manta-shaped craft silhouetted at opposite thirds of frame holding steady formation with thin glowing engine trails, a planet rim arcing along the bottom edge, bold-outlined sprites saturated against the dark, faint CRT scanline glow over everything, quiet dramatic arcade attract-mode mood, motion slow uniform and endless, no cuts.
```

**Settings:**
| param | value |
|---|---|
| resolution | 1280x720 |
| num_frames | 81 |
| fps | 16 |
| duration | ~5s |
| guidance | 4.2 |
| steps | 35 |
| seed | 21006 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, 3d render, scene change, cut, sudden zoom`
**Notes:** The only full t2v two-ship hero shot here — both crafts in one frame is the identity shot of the game, worth several seed pulls. Ship shapes may soften; if silhouettes drift, rebuild as i2v from a two-ship still.

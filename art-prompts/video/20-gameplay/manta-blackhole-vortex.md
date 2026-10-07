# Gameplay — MANTA & the Black-Hole Vortex

MANTA, the flat pale-mint ray-winged craft, firing the screen-clearing black-hole bomb:
a three-armed violet-blue spiral that drains bullets and debris like water down a drain,
ending in a white lightning discharge.

## manta-vortex-drain — bomb detonates, bullets spiral into the drain
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 1/3

```text
Widescreen 2D side-scrolling retro 16-bit pixel-art arcade shooter moment: a flat ray-winged manta-shaped craft with a pale-mint hull, green glowing canopy and twin amber thrusters holds the left of frame as a violent violet-blue three-armed spiral vortex tears open at center-right, hundreds of hot-pink and red glowing enemy bullets curve inward and stream into it like water down a drain, shredded pixel debris corkscrews after them, the vortex arms rotate faster and brighter, the whole navy starfield bends slightly toward its core, then a blinding white lightning discharge bursts outward and sweeps the screen clean, bold-outlined sprites, orange-white flash at the edges, CRT scanline glow, continuous single take.
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
| seed | 22004 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, 3d render, first-person camera, vertical scrolling, HUD, realistic smoke`
**Notes:** The signature super-weapon shot — worth the hero budget. Wan handles the inward spiral stream well; the final white discharge may bloom too far, dial guidance to 4.0 if the frame whites out early.

## manta-vortex-slowmo — slow-motion vortex bloom, camera drifts closer
**Model:** ltx-video
**Mode:** t2v
**Variation:** 2/3

```text
Slow-motion pixel-art energy vortex: a violet three-armed spiral spins steadily at frame center pulling glowing pink bullets inward along curving streams, the mint-green manta craft glides slowly past its edge leaving twin amber thruster ribbons, camera drifts gently closer without shaking, deep navy background stars wheel slowly around the drain, one clean continuous shot.
```

**Settings:**
| param | value |
|---|---|
| resolution | 768x512 |
| num_frames | 121 |
| fps | 24 |
| duration | ~5s |
| guidance | 3.2 |
| steps | 35 |
| seed | 22005 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, first-person camera, HUD`
**Notes:** The spin is uniform enough to loop the moment *before* discharge — cut this variant just as the arms reach full speed and it works as a menu/upgrade-screen animation.

## manta-vortex-from-still — animate the blessed bomb frame into the discharge
**Model:** wan2.2-i2v
**Mode:** i2v
**Variation:** 3/3

```text
The torn-open violet spiral spins faster, streams of pink glowing bullets curve inward from every edge and vanish down the drain core, debris corkscrews behind them, the manta craft's amber thrusters flare as it banks slightly away, light bends toward the center, then a white lightning sheet discharges outward across the whole frame clearing it, camera static, single continuous take.
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
| seed | 22006 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut`
**Source image:** `art-prompts/images/20-gameplay/manta-blackhole-bomb-v1-flux.2-dev.png` (glob `20-gameplay/manta-blackhole*`)
**Notes:** The still fixes the three-arm geometry that pure t2v occasionally twists into four or two arms. Prompt only carries acceleration + discharge; if the lightning never fires, raise guidance to 4.5 and rerun the same seed.

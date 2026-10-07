# Gameplay — KESTREL Bullet Weave

The core fantasy: a steel-blue dart fighter threading held patterns of pink, red and violet
bullets over the Azure Verge planet rim. All shots keep the side-scroller grammar — enemies and
bullets travel left, the camera tracks right, ships stay upright.

## kestrel-weave-azurerverge — tight dodge through arcing pink bullet fans
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 1/3

```text
Widescreen 2D side-scrolling retro 16-bit pixel-art arcade shooter gameplay in motion: a small steel-blue dart-shaped fighter with a cyan glowing canopy and a streaming orange engine trail holds the left third of frame while the camera tracks steadily right, arcs of hot-pink and violet glowing bullet fans sweep in from the right side travelling left in even curved sheets, the fighter makes short crisp vertical dodges between the streams, bold-outlined mechanical sea-creature drone enemies scroll past on the right, a deep blue planet rim with a thin glowing haze band sits along the bottom against layered parallax starfields in deep navy, occasional muzzle flashes blink from the fighter's nose, tiny square explosion pops bloom orange-white on the right edge, fast telegraphed arcade danger, crisp saturated pixels, faint CRT scanline glow, continuous single take.
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
| seed | 22001 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, 3d render, first-person camera, rotating camera, vertical scrolling, UI elements, HUD`
**Notes:** The reference gameplay shot — spend seeds on this one. Bullet sheets moving left while the camera tracks right is the motion signature; if bullets freeze or orbit wrongly, restrip the phrase "bullets travelling left in even curved sheets".

## kestrel-graze-close — near-miss graze, camera pushes in slightly
**Model:** ltx-video
**Mode:** t2v
**Variation:** 2/3

```text
Side-scrolling pixel-art shmup: the blue dart fighter slides right holding its lane as dense rows of red and pink glowing bullets pass millimeters above and below it, sparks scatter off the wingtips on grazes, engine trail streams steadily, camera tracks right with a slight slow push toward the fighter, navy starfield and blue planet rim parallax leftward, continuous arcade motion.
```

**Settings:**
| param | value |
|---|---|
| resolution | 960x544 |
| num_frames | 121 |
| fps | 30 |
| duration | ~4s |
| guidance | 3.4 |
| steps | 40 |
| seed | 22002 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, first-person camera, vertical scrolling, HUD`
**Notes:** The graze-plus-push-in reads tension better at LTX's cheaper draft cost. Spark scatter on wingtips is the money frame for a store page crop.

## kestrel-raster-wave — weaving a wobbling wall of bullets over the rim
**Model:** wan2.2-i2v
**Mode:** i2v
**Variation:** 3/3

```text
A wobbling horizontal wall of glowing violet bullets ripples across the screen from right to left like a sine curtain, the steel-blue fighter dives through the narrowing gaps with quick crisp maneuvers, its orange trail whipping behind each turn, the planet-rim haze pulses softly where bullets skim the wall's low points, camera keeps tracking right at constant speed, starfield layers parallax left, continuous single take, no cuts.
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
| seed | 22003 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut`
**Source image:** `art-prompts/images/20-gameplay/kestrel-raster-wave-v1-flux.2-dev.png` (glob `20-gameplay/kestrel-raster*`)
**Notes:** The Brine Nebula raster-wave gimmick expressed as a single weave moment; the sine curtain motion holds well on an approved still because the bullet geometry is already drawn. Expect the wave amplitude to soften mid-clip — that's fine for a background beat.

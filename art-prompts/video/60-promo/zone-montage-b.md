# Promo — Zone Montage B (Zones 6–9 + the Neon Dimension)

The second half of the world-tour reel: organic architecture, crystal light, industrial
dread, the abyss, and the Mode-7 speed dimension that closes every montage.

## zone-cell-vault-pulse — living walls breathing around the corridor
**Model:** ltx-video
**Mode:** t2v
**Variation:** 1/5

```text
Organic pixel-art corridor with living walls that slowly pulse and ripple like breathing tissue, veins of pink bioluminescent light traveling along the walls in looping circuits, the passage widening and narrowing rhythmically as the camera drifts steadily forward through it, soft wet gloss highlights sliding on the curved surfaces, hypnotic even tempo, single continuous shot, no cuts.
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
| seed | 26006 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, realistic flesh, gore`
**Notes:** Zone 6's pulsing-walls gimmick as pure atmosphere. Forward drift through a repeating vein pattern is a strong seamless-loop candidate — match loop points on the pulse beat.

## zone-prism-labyrinth-refraction — rotating crystal light through cube stacks
**Model:** wan2.2-i2v
**Mode:** i2v
**Variation:** 2/5

```text
Light begins to move: long rainbow refraction streaks sweep slowly across the faceted crystal corridor walls, glinting into bright star-flares where beams meet the edges, the floating cube stacks rotate a quarter-turn in a staggered cascade down the hall, each face catching a different spectral color, sparkles drift like glitter in still air, camera tracks gently forward through the labyrinth as the refraction builds to a shimmering peak then settles, jeweled cold beauty, continuous single take, no cuts.
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
| seed | 26007 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut`
**Source image:** `art-prompts/images/60-promo/prism-labyrinth-v1-flux.2-dev.png` (glob `60-promo/prism*`)
**Notes:** Zone 7: the quarter-turn cascade of the cubes is the gimmick reference (stacking-cube hazard) — i2v keeps their geometry locked while the light does the show.

## zone-iron-citadel-chase — amber lights run down the rivet corridor
**Model:** ltx-video
**Mode:** t2v
**Variation:** 3/5

```text
Dark riveted steel industrial corridor in pixel-art arcade style, a sequence of amber wall lights chasing rapidly rightward down the hall as if something is moving through it, shadows swinging past the lit panels, steam jets bursting sideways in rhythm, the camera tracking right with the light chase at matching speed, sparks showering from ceiling cables, tense mechanical atmosphere, single continuous shot.
```

**Settings:**
| param | value |
|---|---|
| resolution | 960x544 |
| num_frames | 97 |
| fps | 30 |
| duration | ~3.2s |
| guidance | 3.4 |
| steps | 40 |
| seed | 26008 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, organic walls, bright daylight`
**Notes:** Zone 8: lights chasing *past* unseen motion is pure Hitchcock for a shmup trailer — sets up IRON SOVEREIGN without showing him. The speed-matched track keeps the corridor infinite; loop-friendly if steam jets are trimmed.

## zone-abyssal-throne-glow — descending past bioluminescent spires
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 4/5

```text
Widescreen retro 16-bit pixel-art descent into a lightless abyss: the camera sinks slowly downward past towering black spires furred with glowing bioluminescent filaments in teal, violet and faint pink, clouds of luminous plankton specks swirling in the current and parting around the lens, a lone angler-lure gold light blinking somewhere far below in the deep dark, long ghostly shadows of enormous unseen shapes sliding across the spires and gone, suffocating quiet beauty, bold thin outlines against near-black navy, faint CRT scanline glow, continuous single take.
```

**Settings:**
| param | value |
|---|---|
| resolution | 1280x720 |
| num_frames | 81 |
| fps | 16 |
| duration | ~5s |
| guidance | 4.0 |
| steps | 40 |
| seed | 26009 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, bright scene, clear water`
**Notes:** Zone 9 mood-setter; the unseen-shape shadows foreshadow the HOLLOW KING. Slow descent past vertical spires is very stable — a strong candidate for the final-act menu background too.

## zone-neon-dimension-rush — Mode-7 checkerboard sprint to the horizon
**Model:** wan2.2-i2v
**Mode:** i2v
**Variation:** 5/5

```text
The camera hurtles forward just above an infinite neon-violet checkerboard plane racing toward a hard horizon line, grid squares whipping past in perfect even perspective, streaks of magenta and cyan light trailing along the floor seams toward the vanishing point, the distant horizon pulsing with a stack of horizontal glow bands, the dart fighter skimming low rightward across the grid leaving a bent orange ribbon, the whole plane seeming to accelerate as light trails lengthen into lines, synth-dimension velocity, retro pixel crispness with scanlines, continuous forward rush, no cuts.
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
| seed | 26010 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut`
**Source image:** `art-prompts/images/60-promo/neon-dimension-v1-flux.2-dev.png` (glob `60-promo/neon-dimension*`)
**Notes:** The Mode-7 bonus dimension as straight-ahead speed — closing beat of every zone montage. Uniform grid rush is seamless-loop material for website hero strips; generate from the still so the horizon never wanders.

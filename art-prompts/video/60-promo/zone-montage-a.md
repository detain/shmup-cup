# Promo — Zone Montage A (Zones 1–5)

One dramatic camera move per zone for the trailer's "world tour" reel. Each entry is a
self-contained beat; cut them on the camera move's acceleration point. All five mix in a
ship silhouette for scale and to keep the shooter identity on screen.

## zone-azure-verge-orbit — slow arc-pan along the planet rim
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 1/5

```text
Widescreen retro 16-bit pixel-art orbital vista: the camera begins a slow arcing pan rightward along the glowing blue rim of a planet in deep space, the thin atmospheric band burning from navy to cyan at the limb, layered starfields at three parallax depths sliding behind, a lone steel-blue dart fighter with an orange engine trail crossing the pan from left to right in the near layer while a distant flight of bold-outlined mechanical sea drones drifts silhouetted against the planet glow, cold majestic scale with a single warm thread of motion, crisp saturated pixels, faint CRT scanline glow, continuous single take.
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
| seed | 26001 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, 3d render, first-person camera`
**Notes:** Zone 1 opener for the montage; the arc-pan against a static planet is cheap drama. Loopable if you drop the fighter phrase — the rim itself never changes.

## zone-brine-nebula-gassea — glide over undulating raster wave clouds
**Model:** ltx-video
**Mode:** t2v
**Variation:** 2/5

```text
Camera glides low and steady forward over an ocean of teal luminous gas clouds rolling in slow wavy bands, mist sheets peeling upward off the wave crests, a small manta-shaped craft surfing the ridgeline rightward leaving twin amber ribbons, deeper violet vapor layers drifting slowly below, dreamy undersea-nebula light, pixel-art arcade look, continuous forward motion, no cuts.
```

**Settings:**
| param | value |
|---|---|
| resolution | 960x544 |
| num_frames | 121 |
| fps | 30 |
| duration | ~4s |
| guidance | 3.2 |
| steps | 35 |
| seed | 26002 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, realistic clouds`
**Notes:** Zone 2's wobbling raster-wave gimmick sold as geography rather than UI. Uniform gas roll plus steady glide = one of the two strongest seamless-loop candidates in this file.

## zone-dune-expanse-twinsuns — wide lateral pan, heat haze, worm eruption
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 3/5

```text
Retro 16-bit pixel-art widescreen desert vista at high noon under twin suns: the camera pans right across an endless dune expanse rippling with visible heat haze, two round suns — one amber one pale gold — hanging stacked low in a washed violet sky, long double shadows from jagged rock fins, then a colossal segmented sand worm of bold-outlined plated segments erupts diagonally from a dune crest ahead of the pan, throwing a towering fan of backlit sand grains that scatter through the sun glow, a tiny blue fighter banking sharply away from the eruption column, sparkling cascade of falling grit settling as the pan continues past, harsh beautiful menace, CRT scanline glow, continuous single take.
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
| seed | 26003 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, 3d render, organic worm, one sun, night`
**Notes:** The eruption timed into a moving pan is the montage's jump-scare beat — the worm must enter after the pan has already settled. Two-sun counts are unreliable; verify the "stacked" placement across seeds.

## zone-magma-deep-cone — push in on an erupting lava cone
**Model:** wan2.2-i2v
**Mode:** i2v
**Variation:** 4/5

```text
The camera pushes slowly in toward a erupting magma cone in a vast lava cavern, fountains of bright orange pixel lava cycling up and falling in glowing arcs, the lava lake below heaving and pulsing with rising heat blobs that burst into sparks, long shadow of a passing fighter sliding across the molten surface, embers streaming upward past the lens, rock ceiling glistening with reflected firelight, building intensity as the next eruption loads and fires, continuous single take, no cuts.
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
| seed | 26004 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut`
**Source image:** `art-prompts/images/60-promo/magma-deep-v1-flux.2-dev.png` (glob `60-promo/magma*`)
**Notes:** Zone 4: the load-fire cycle of the cone gives the push-in a rhythm. The moving ship-shadow adds the scale cue without spending motion budget on the sprite.

## zone-tempest-ridge-timelapse — storm timelapse over jagged snow ridges
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 5/5

```text
Retro 16-bit pixel-art timelapse over a jagged snow ridge in a permanent storm: dark violet-black thunderheads roll and churn leftward fast across the sky in accelerated drift, slanting rain streaking diagonally across the whole frame, bolts flashing inside the cloud volumes and momentarily lighting the ridge teeth in hard blue-white, snow blasting off the peaks in horizontal veils where the gusts hit, a tiny fighter silhouette tracing steadily rightward along the ridge line far below, the storm swallowing it as the clouds descend, cold violent grandeur, bold outlines, CRT scanline glow, continuous single take.
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
| seed | 26005 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, calm sky, sunshine, realistic clouds`
**Notes:** Accelerated cloud roll = instant timelapse grammar; Wan holds this well. The swallowed fighter at the end is a nice "the zone itself is the boss" transition into SQUALL STEED's intro clip.

# Boss Intros — SQUALL STEED SS-05 (Storm Seahorse)

The Tempest Ridge captain: a vast plate-and-cable seahorse rearing out of a wall of storm
cloud with lightning crawling along its rigging. Vertical reveal, wind-driven atmosphere.

## steed-storm-rear — rearing out of the thunderhead wall
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 1/2

```text
Retro 16-bit pixel-art widescreen boss intro inside a churning violet-black storm: rain slashes diagonally across the frame as the screen dips dark and a red warning light throbs twice, then a vast mechanical seahorse of segmented steel plates and taut cables rears upward out of a solid wall of thunderhead clouds, water cascading off its ridged crest in sheets, forked lightning striking along its spine and branching through the cable rigging in blue-white veins, its long snout lifting to the sky and a row of pink glow-lamps blinking awake along its belly plates, wind bending the rain steeper, the tiny steel-blue fighter tumbling briefly in the gust before stabilizing with flaring thrusters, camera dollies backward as it rises to hold the whole arched body in frame, deep storm navy palette with bright bolt highlights, CRT scanline glow, continuous single take.
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
| seed | 23009 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, 3d render, organic horse, flesh, calm clear sky`
**Notes:** The dolly-back against the rear is the scale beat — if the camera stays put, the seahorse reads whale-sized instead of storm-sized. Lightning "branching through cables" gives Wan a concrete conductive path instead of random bolts.

## steed-rigging-arc — static low angle, spine lightning builds
**Model:** ltx-video
**Mode:** t2v
**Variation:** 2/2

```text
Low-angle pixel-art shot of a giant armored seahorse silhouette against rolling storm clouds, lightning repeatedly arcs down its spined back and along hanging cables with growing intensity, rain streaks slant continuously past, its belly lamps pulse pink in rhythm with each strike, camera static tilting slightly up, building electrical tension, single continuous shot.
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
| seed | 23010 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, organic animal`
**Notes:** Cheap LTX draft for charge-rhythm exploration; the repeated arcs with growing intensity are near-loopable if you cut before the brightest strike — useful as an under-menu storm loop.

# Title & Attract — Story-Crawl Space Vista

Slow, wide establishing shots for the intro story text crawl: the IRON TIDE horizon, the
scale of what KESTREL and MANTA fly into. Camera travels forward or sideways, never chaotic.

## story-crawl-iron-horizon — forward glide toward the fortress-ship armada
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 1/2

```text
Epic widescreen retro 16-bit pixel-art establishing shot: the camera glides slowly and steadily forward through deep-navy space dotted with parallax star layers, ahead a vast dark horizon of the iron tide emerges from the black — silhouettes of enormous mechanical sea-creature fortress-ships, riveted plate armor catching cold blue rim light, a few glowing violet porthole strips and pink energy seams, low orange thruster glows smoldering along their hulls, teal gas wisps drifting across the foreground, ominous but stately pacing, quiet dramatic cosmic dread, continuous single shot with no cuts.
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
| seed | 21007 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, 3d render, explosions, small cramped composition`
**Notes:** Forward dolly against a static armada reads as "approaching menace" — ideal crawl bed; keep story text overlaid in the upper third where the model leaves navy negative space. If the fortress-ships morph into noise, halve motion strength or use the i2v pairing.

## story-crawl-planet-rim — lateral drift along a sunrise planet edge
**Model:** ltx-video
**Mode:** i2v
**Variation:** 2/2

```text
The camera trucks slowly right along the glowing rim of a deep-blue planet, the thin atmospheric band shimmers and shifts warmth from navy to pale gold at the leading edge, star pixels parallax steadily leftward in two layers, a single tiny fighter silhouette holds position mid-frame with a faint orange engine trail, all motion slow, even and endless, no cuts.
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
| seed | 21008 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut`
**Source image:** `art-prompts/images/10-title/story-vista-planet-rim-v1-flux.2-dev.png` (glob `10-title/story-vista*`)
**Notes:** LTX's lateral truck on a mostly-static still is its sweet spot — near-zero morph risk, and the uniform drift makes this seamlessly loopable for a crawl background.

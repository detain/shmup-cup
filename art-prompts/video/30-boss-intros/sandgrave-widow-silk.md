# Boss Intros — SANDGRAVE WIDOW SW-03 (Desert Spider)

The Dune Expanse captain: a giant mechanical desert spider repelling down a single silk cable
into frame while sand fountains erupt behind it. Vertical drop, then hang and menace.

## widow-silk-descent — the spider abseils from the twin-sun glare
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 1/2

```text
Retro 16-bit pixel-art widescreen boss intro under a hazy amber twin-sun sky: the frame darkens with a red siren pulse twice, then a gleaming silk cable drops from the top of frame and a colossal mechanical desert spider descends on it, eight bold-outlined riveted legs unfolding and jointing open one after another as it comes down into the heat shimmer, sand eruptions fountaining in slow arcs behind its silhouette, grit streaming off its armored abdomen, its cluster of eyes igniting pink one by one like a targeting grid, the tiny dart fighter darts left across the dune crest below trailing orange, camera pedestal-ups with the descent then locks wide to show the full leg span, harsh warm rim light against deep shadowed underbelly, CRT scanline glow, continuous single take.
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
| seed | 23007 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, 3d render, organic spider, hairy legs, vertical scrolling gameplay`
**Notes:** Leg-unfold sequencing is the star — eight legs is beyond any model's counting discipline, so "one after another" matters more than the number; accept six-to-ten. Heat haze + falling sand keep the frame alive between beats.

## widow-legs-spread — hang pose, legs fan toward camera
**Model:** ltx-video
**Mode:** i2v
**Variation:** 2/2

```text
The hanging mechanical spider slowly fans its armored legs outward toward the viewer, front pedipalps clicking open, eye cluster pulsing pink brighter, silk cable swaying gently so the whole hull rocks, sand grains drift upward past the frame in the heat current, camera static, slow deliberate menace, single continuous shot.
```

**Settings:**
| param | value |
|---|---|
| resolution | 768x512 |
| num_frames | 97 |
| fps | 24 |
| duration | ~4s |
| guidance | 3.0 |
| steps | 35 |
| seed | 23008 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut`
**Source image:** `art-prompts/images/30-bosses/sandgrave-widow-v1-flux.2-dev.png` (glob `30-bosses/sandgrave*`)
**Notes:** Legs reaching at the lens is the thumbnail scream; low guidance preserves the still's leg arrangement. The sway + drifting grit make this a decent menu-screen stinger even unlooped.

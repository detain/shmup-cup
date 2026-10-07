# Title & Attract — Logo Sting

Arcade ignition moment: the SHMUP CUP wordmark catching fire in the yellow→orange→red
gradient. Text rendering is the least reliable thing any video model does — treat the t2v
entries as lotteries and the i2v entry (from a blessed logo still) as the production path.

## logo-sting-ignite — wordmark igniting letter-by-letter in fire gradient
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 1/3

```text
Retro 16-bit pixel-art arcade logo animation: a chunky blocky wordmark ignites letter by letter from left to right, each glyph flaring up in a gradient of bright yellow at the core through hot orange to deep red at the edges, bold white outline flashing on each ignition with a burst of small square pixel sparks that drift upward and fade, soft bloom glow pulsing around the finished letters, subtle CRT scanline texture shimmering across the frame, deep navy-black space background with a few slow drifting star pixels, the camera holds nearly static with a very slight slow push-in, ending on one final bright flare pulse that settles into a steady ember glow.
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
| seed | 21001 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, watermark, flicker, misspelled letters, warped typography, extra letters, gibberish text, photorealistic`
**Notes:** Wan 2.2 is the only one of the two models with a chance of holding legible letterforms; expect 1-in-5 usable. If typography warbles, cut to the i2v path below. Single continuous shot, no loop.

## logo-sting-sparkflash — quick spark burst revealing the logo plate
**Model:** ltx-video
**Mode:** t2v
**Variation:** 2/3

```text
A horizontal flash of orange sparks races across the frame and ignites a pixel-art arcade title plate in glowing yellow-to-red gradient letters, sparks scatter outward, the glow pulses once, camera snaps a quick punch-in then holds steady, deep navy starfield behind, CRT scanline shimmer, single continuous shot.
```

**Settings:**
| param | value |
|---|---|
| resolution | 768x512 |
| num_frames | 97 |
| fps | 24 |
| duration | ~4s |
| guidance | 3.2 |
| steps | 35 |
| seed | 21002 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, warped typography, gibberish text`
**Notes:** LTX handles the spark sweep motion well; for legible letters rely on the plate reading as a glowing wordmark shape and overlay the real logo type in post. Cheap draft — iterate seeds fast.

## logo-sting-idle-pulse — animate a finished logo still with ember breathing
**Model:** wan2.2-i2v
**Mode:** i2v
**Variation:** 3/3

```text
The finished pixel-art arcade wordmark breathes with life: its fire-gradient letters slowly pulse brighter and dimmer like embers under a bellows, tiny square sparks peel off the top edge and drift upward fading out, the outline glow shimmers, star pixels behind the plate drift very slowly to the left, faint scanlines roll down the frame, camera static with only a barely perceptible push-in, no cuts, calm and continuous.
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
| seed | 21003 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut`
**Source image:** `art-prompts/images/10-title/logo-sting-v1-flux.2-dev.png` (blessed logo still — glob `10-title/logo-sting*` if the model suffix differs)
**Notes:** The production-safe path — typography is inherited from the still, motion is purely additive. Slow uniform pulse makes this near-loopable; cross-dissolve 8 tail frames over the head for a seamless title idle.

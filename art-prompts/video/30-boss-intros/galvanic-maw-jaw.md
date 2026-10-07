# Boss Intros — GALVANIC MAW GM-02 (The Playfield-Sized Fish)

The jaw that eats the screen: a riveted mechanical fish spanning the whole playfield grinding
its mouth open onto a dark electrified throat. Keep the throat DARK — lit gullets read cute.

## warning-galvanic-jawopen — tilt up the steel flank into the opening maw
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 1/2

```text
Retro 16-bit pixel-art arcade boss intro in widescreen: the frame darkens and a red warning band sweeps vertically once with siren-pulse lighting, then the camera tilts up along an endless scaled steel flank to reveal a mechanical fish the size of the entire playfield, its riveted jaw cracking open in slow heavy segments, exposing a dark electrified throat where arcs of violet lightning crawl and branch along wet-looking metal ribs, pin-point pink glow nodes blink awake deep in the gullet like a charging weapon, the tiny dart fighter at the bottom-left edge of frame flicks its cyan canopy light against the gloom, static spitting blue-white into the open mouth, sea-deep navy surroundings, bold outlines, CRT scanline glow, awe and dread, continuous single take.
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
| seed | 23002 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, 3d render, organic fish, slimy textures, bright open throat, small cramped composition`
**Notes:** The tilt-up along the flank is the scale reveal — if Wan flattens the camera path, recut as a static wide. Prompt drift wants to light the throat like a tunnel; the `bright open throat` negative fights that.

## warning-galvanic-from-still — animate the blessed jaw still, charge the throat
**Model:** wan2.2-i2v
**Mode:** i2v
**Variation:** 2/2

```text
The riveted steel jaw grinds open in slow heavy segments, the dark electrified throat inside blooms with branching violet arcs that multiply and crawl faster, pink glow nodes wake one by one down the gullet, static spits outward from the teeth line, the whole frame vibrates with a low building rumble, camera holds nearly still with a faint drift backward as the mouth looms wider, continuous single take, no cuts.
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
| seed | 23004 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut`
**Source image:** `art-prompts/images/30-bosses/galvanic-maw-v1-flux.2-dev.png` (glob `30-bosses/galvanic-maw*`)
**Notes:** Production path — the still owns the fish silhouette and tooth geometry; the motion prompt only opens the jaw and charges the throat. Faint backward drift increases perceived looming; strengthen it if the clip feels static. If the arcs never peak, raise guidance to 4.5 and rerun the same seed.

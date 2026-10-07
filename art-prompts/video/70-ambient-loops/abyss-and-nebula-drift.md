# Ambient Loops — Website Hero Backgrounds

Four seamless-loop families for hero sections, menus and store pages. Shared contract for
this whole file: **slow, uniform, event-free motion; static or constant-velocity camera;
no flashes, no cuts.** Post-wrap each clip with the 8-frame cross-dissolve from the README
and every entry tiles forever.

## loop-starfield-parallax — three-layer drift, calm and endless
**Model:** ltx-video
**Mode:** t2v
**Variation:** 1/4

```text
Deep navy pixel-art starfield drifting quietly: near bright star pixels slide steadily left, mid-layer stars crawl slower, a faint far dust band barely moves, a soft blue planet glow sits fixed along the bottom edge with a thin shimmering haze line, nothing else happens, perfectly even tempo like a conveyor, no flashes, no cuts, seamless loop of ambient drift.
```

**Settings:**
| param | value |
|---|---|
| resolution | 768x512 |
| num_frames | 121 |
| fps | 24 |
| duration | ~5s |
| guidance | 3.0 |
| steps | 30 |
| seed | 27001 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, scene change, cut, flash to black, sudden zoom, shooting stars`
**Notes:** The safest loop on the internet, basically. The fixed planet glow gives a hero section a floor to put type above. `shooting stars` in the negative is load-bearing — one streak and the tile is ruined.

## loop-starfield-ship — same drift with one patient patrol craft
**Model:** wan2.2-i2v
**Mode:** i2v
**Variation:** 2/4

```text
The tiny steel-blue fighter holds its station at right-center frame, only its engine trail streaming and undulating softly behind it, star layers drifting steadily left at three slow parallax speeds, the planet rim haze pulsing almost invisibly, canopy glow breathing on a long even rhythm, camera completely static, no events, endless patient ambience, seamless loop, no cuts.
```

**Settings:**
| param | value |
|---|---|
| resolution | 1280x720 |
| num_frames | 81 |
| fps | 16 |
| duration | ~5s |
| guidance | 3.5 |
| steps | 30 |
| seed | 27002 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut, new subjects entering mid-loop`
**Source image:** `art-prompts/images/70-ambient/starfield-patrol-v1-flux.2-dev.png` (glob `70-ambient/starfield*`)
**Notes:** Ship-in-frame makes it a hero background with identity instead of wallpaper. Undulating trail plus breathing canopy provide life without positional change — the loop seam hides in the trail phase.

## loop-nebula-gasflow — teal vapor rolling over a violet deep
**Model:** ltx-video
**Mode:** t2v
**Variation:** 3/4

```text
Slow luminous teal and violet gas flowing steadily leftward across a deep navy void like time-lapse clouds underwater, soft wave folds folding over each other in an even rolling rhythm, fine sparkles of pixel dust carried within the current, brightness swelling and easing gently as the gas thickens and thins, everything continuous and unhurried, no flashes, no cuts, seamless loop of drifting nebula ambience.
```

**Settings:**
| param | value |
|---|---|
| resolution | 960x544 |
| num_frames | 121 |
| fps | 30 |
| duration | ~4s |
| guidance | 3.0 |
| steps | 35 |
| seed | 27003 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, realistic clouds, storm, lightning, scene change, cut, new subjects entering mid-loop`
**Notes:** Brine Nebula color language for the site's about/press sections. The swell-and-ease brightness cycle is roughly one loop long, which makes the cross-dissolve seam invisible on this family.

## loop-abyss-particles — bioluminescent specks rising in black water
**Model:** wan2.2-i2v
**Mode:** i2v
**Variation:** 4/4

```text
Cold deep-water ambience: clouds of tiny bioluminescent teal, violet and pink pixel specks rise and drift slowly upward through near-black navy water with gentle sideways current wobble, faint long shadows of unseen structures sliding far in the background, occasional single specks brightening and dimming on their own slow cycle, the darkness itself breathing almost imperceptibly, camera static, no events, no creatures entering, endless abyssal calm, seamless loop, no cuts.
```

**Settings:**
| param | value |
|---|---|
| resolution | 832x480 |
| num_frames | 81 |
| fps | 16 |
| duration | ~5s |
| guidance | 3.5 |
| steps | 30 |
| seed | 27004 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut, new subjects entering mid-loop`
**Source image:** `art-prompts/images/70-ambient/abyss-particles-v1-flux.2-dev.png` (glob `70-ambient/abyss-particles*`)
**Notes:** Abyssal Throne mood for dark-mode UI beds. "No creatures entering" matters — Wan wants to send something past. Rising-particle fields tile perfectly since every frame looks like every other.

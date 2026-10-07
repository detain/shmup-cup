# Boss Deaths — Chained Hull Explosions

The arcade payout: a chain of multi-explosions walks the entire length of a dead fortress-ship
hull, orange-white fireballs stepping bow to tail while the screen flashes. Vertical or
horizontal walk-downs both read; pick per boss silhouette.

## death-chain-walkdown — explosions marching the full spine
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 1/3

```text
Retro 16-bit pixel-art widescreen boss death sequence: the dead mechanical sea-creature fortress-ship drifts broadside across the frame as a chain of explosions begins at its bow and walks the entire hull, each blast a blooming square-pixel fireball of pale yellow core, then orange, then red, popping one after another in a quick marching rhythm that travels left to right along its full length, armor plates buckling and flipping off ahead of the front, thick black smoke columns unfurling behind the chain, violet energy seams shorting with white crackles between blasts, the tiny dart fighter riding low at frame left with its engine flaring as shockwaves ripple past, the final blast at the stern larger than the rest with a full-screen white flash that holds a beat, deep navy starfield backdrop, bold outlines, CRT scanline glow, triumphant destructive rhythm, continuous single take.
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
| seed | 24001 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, 3d render, realistic smoke, single explosion, smoke-only mush`
**Notes:** The marching rhythm is the whole joke — "one after another in a quick marching rhythm that travels" is the phrase to protect across seeds. End on the big stern flash for a clean cut point into the gold-points beat.

## death-chain-vertical — stern-to-bow climb up a tilting hull
**Model:** ltx-video
**Mode:** t2v
**Variation:** 2/3

```text
A giant wrecked steel sea-creature hull in bold-outlined 16-bit pixel art tilts diagonally across the frame while explosions pop up along it in rapid sequence from the low stern to the high bow, each fireball stepping visibly higher, plates shedding outward, the ship lurching and sliding downward as the chain reaches the top and detonates the core in a bright flash, camera static, fast climbing rhythm, single continuous shot.
```

**Settings:**
| param | value |
|---|---|
| resolution | 768x512 |
| num_frames | 97 |
| fps | 24 |
| duration | ~4s |
| guidance | 3.4 |
| steps | 40 |
| seed | 24002 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, realistic fire, smoke-only mush`
**Notes:** Diagonal walk-ups feel more dramatic than horizontal in short clips; the added ship-sink motion gives an ending pose. Draft at 30 steps, hero at 45 if the stepping stutters.

## death-chain-from-still — animate the blessed dying-boss frame
**Model:** wan2.2-i2v
**Mode:** i2v
**Variation:** 3/3

```text
The shattered boss hull begins to die: shield plate fragments drift outward as a chain of orange-white fireballs detonates in quick succession walking from one end of the broken hull to the other, buckling plates popping off ahead of the blast line, violet seams arcing and failing one by one, smoke columns unfurling and shearing sideways with the ship's drift, the whole structure starting a slow tilt downward as the chain completes and a final white flash swallows the silhouette, camera tracks steadily right alongside it, continuous single take.
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
| seed | 24003 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut, smoke-only mush`
**Source image:** `art-prompts/images/30-bosses/iron-sovereign-death-v1-flux.2-dev.png` (glob `30-bosses/iron-sovereign*` — any cracked-hull boss still works)
**Notes:** Pair with IS-08 (rotating shield plates make the "plates shed first" beat free) or any shattered-captain still. Motion-only prompting keeps the hull design intact; the tilt at the end hands off to debris-field ambience.

# Promo — Social Vertical & Square Clips

Native vertical (9:16) and square (1:1) cuts for TikTok/Reels/Shorts feeds. Vertical framing
fights the game's side-scroller grammar, so these compositions lean on vertical events —
descents, flybys crossing the frame, falling bullet rain. All three are loop-first; feeds
rewatch silently.

## social-logo-drop-vertical — wordmark slams in, bullet rain behind
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 1/3

```text
Vertical 9:16 retro 16-bit pixel-art social clip: a heavy blocky arcade wordmark drops fast from the top of the frame and slams into the center with a screen-wide impact flash, bold yellow-to-red fire-gradient letters ringing with a white outline, a shockwave of square pixel sparks radiating outward and upward, behind it an endless slow rain of hot-pink and violet glowing bullets falls past through deep navy darkness, the letters bounce once and settle with an ember pulse, slight camera kick on impact then lock, punchy arcade title energy, CRT scanline glow, single continuous shot.
```

**Settings:**
| param | value |
|---|---|
| resolution | 720x1280 |
| num_frames | 81 |
| fps | 16 |
| duration | ~5s |
| guidance | 4.5 |
| steps | 40 |
| seed | 26011 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, watermark, flicker, misspelled letters, warped typography, extra letters, gibberish text, horizontal framing bars`
**Notes:** Text again — this is the lottery version; the safe production route is wan2.2-i2v from the logo still with the drop re-timed in an editor. Bullet rain behind a locked logo is the perfect silent-loop feed plate.

## social-kestrel-flyby-vertical — ship crosses frame, camera whips after it
**Model:** ltx-video
**Mode:** t2v
**Variation:** 2/3

```text
Vertical pixel-art arcade shot: a small steel-blue dart fighter streaks into frame from the left and rockets across to the upper right, its orange engine trail drawing a long curved ribbon behind it, pink bullet sparks popping along its path, the camera snaps in a quick whip-pan tracking the ship then settles as it exits, distant blue planet rim drifting below, punchy speed blur on background layers only, single continuous take.
```

**Settings:**
| param | value |
|---|---|
| resolution | 576x1024 |
| num_frames | 97 |
| fps | 30 |
| duration | ~3.2s |
| guidance | 3.5 |
| steps | 40 |
| seed | 26012 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, ship moving vertically`
**Notes:** Diagonal cross-frame travel suits 9:16 far better than horizontal scroll does. The whip-pan settle loop-cuts cleanly back to the entry frame — natural three-second feed loop.

## social-bullethell-beauty-frame — square slow drift through a held pattern
**Model:** wan2.2-i2v
**Mode:** i2v
**Variation:** 3/3

```text
The camera drifts almost imperceptibly forward through a frozen-lattice bullet-hell composition made alive: rows of hot-pink, red and violet glowing pixel bullets creep and rotate on their pattern paths with metronome slowness, tiny gold point sprites sparkle and cycle through their spin somewhere in the mid-ground, the blue planet rim haze shimmers along the bottom, the lone fighter makes one small crisp dodge between two converging streams, everything else holds its lethal geometry, hypnotic dangerous beauty, seamless loop, no cuts.
```

**Settings:**
| param | value |
|---|---|
| resolution | 512x512 |
| num_frames | 81 |
| fps | 16 |
| duration | ~5s |
| guidance | 3.8 |
| steps | 30 |
| seed | 26013 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut`
**Source image:** `art-prompts/images/60-promo/bullethell-beauty-frame-v1-flux.2-dev.png` (glob `60-promo/bullethell*`)
**Notes:** The "pattern as wallpaper" shot — bullet-hell screenshots are already compositions, i2v just breathes on them. Metronome-slow pattern motion plus micro-dodge loops beautifully as a square profile video or store-page tile.

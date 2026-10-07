# Boss Intros — HALCYON BULWARK HB-01 (Shield Fortress)

The plate-armored fortress-ship arrival: siren-red warning darkening, then mass and rivets
rising into frame. Its interlocking shield plates are the tell — they shatter later in the
death sequence.

## warning-halcyon-rise — red siren flash as the plate-armored fortress surfaces
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 1/2

```text
Widescreen retro 16-bit pixel-art arcade boss warning: the deep-navy frame suddenly darkens, then heavy red warning energy floods in from the edges pulsing twice like a two-tone siren rhythm, bold blocky danger light strobing over riveted shadow, as the red wash peaks an enormous mechanical sea-creature fortress-ship of thick plate armor rises slowly from the bottom of frame shedding waterfalls of pixel spray, rows of violet porthole lights igniting along its hull one by one, its shield plates interlocking with a dull amber gleam, the tiny steel-blue dart fighter silhouetted at left holds its ground with a flaring orange engine trail, camera pulls back slightly to reveal the scale, explosions of rim light, CRT scanlines, ominous and grand, continuous single take.
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
| seed | 23001 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, 3d render, small cramped composition, first-person camera`
**Notes:** The two-pulse siren flash plus rise is exactly five seconds of warning drama — the pacing is baked into "pulsing twice". If the red flood eats the reveal, lower guidance to 4.0 so the darkening stays brief.

## warning-halcyon-shieldup — shield plates slide in and lock with amber gleams
**Model:** ltx-video
**Mode:** i2v
**Variation:** 2/2

```text
Massive armor plates slide inward from all sides of the fortress hull and interlock one after another with bright amber rim gleams, violet porthole rows blink on, a red warning pulse floods the frame once then fades, water spray drizzles downward off the plating, camera holds static, heavy and deliberate motion, single continuous shot.
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
| seed | 23005 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut`
**Source image:** `art-prompts/images/30-bosses/halcyon-bulwark-v1-flux.2-dev.png` (glob `30-bosses/halcyon*`)
**Notes:** Plate-by-plate locking gives a satisfying mechanical cadence; keep guidance low so the still's armor layout doesn't rearrange itself. The final locked frame doubles as the fight's start pose — good tail-frame handoff into a gameplay i2v.

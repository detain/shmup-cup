# Key Moments — The Ark Dives (War Is Not Over)

The sequel hook: ABYSS ARK turning for home and sinking into the black depths, lights going
out one tier at a time as the water takes it. Slow, huge, indifferent.

## ark-dive-descent — the flagship sinks tier by tier
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 1/2

```text
Retro 16-bit pixel-art widescreen coda: the continent-sized mechanical whale flagship angles its barnacled steel snout down into black water and begins an immense slow dive, its broad back and dorsal plate city sliding under the surface in a creeping avalanche of displaced swell, rows of violet glow-seams and amber running lights winking out one tier at a time from top down as the depth takes them, bioluminescent specks swirling up off its hull like inverse snow, the last lit porthole row vanishing below leaving only a widening circular disturbance on the glassy dark sea, faint red embers of its wake still glowing deep under, tiny silhouette fighter unmoving at frame left watching it go, camera static and wide, cold ominous finality, deep navy palette draining to black at the edges, CRT scanline glow, continuous single take.
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
| seed | 25006 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, 3d render, fast sinking, explosion, organic whale`
**Notes:** Lights-out-by-tier is the countdown that makes the dive feel finite and deliberate — protect that phrase across seeds. The static watching fighter supplies the "we let it go" emotion; if it drifts, lock the composition with the ark-dive still as i2v source.

## ark-dive-tail-only — last sign: the fluke, then darkness
**Model:** ltx-video
**Mode:** i2v
**Variation:** 2/2

```text
A colossal mechanical tail fluke rises slowly out of the black water backlit by fading violet seams below, hangs a beat against the dark sky, then slips silently under with a soft sheet of falling water, the glow beneath dimming to nothing, surface ripples spreading outward and calming, camera static, one slow farewell motion, no cuts.
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
| seed | 25007 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut`
**Source image:** `art-prompts/images/50-key-moments/ark-dive-tail-v1-flux.2-dev.png` (glob `50-key-moments/ark-dive*`)
**Notes:** Whale-tail-sinks is universally readable — this is the true post-credits shot. The "hangs a beat" pause is where the music should stop; slow single gesture keeps morph risk near zero.

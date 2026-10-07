# Key Moments — Breaking the Surface at Sunrise

The war-ends-here image: rising through black water and punching out into a low gold sun.
Vertical travel with a hard lighting change at the midpoint — the moment models love and
ruin, so both entries constrain the breach carefully.

## surface-breach-gold — climb through black water into the light
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 1/2

```text
Retro 16-bit pixel-art vertical ascent: the battered steel-blue fighter climbs steadily through dark midnight-blue water filled with rising silver bubble columns and drifting silt, the black depths below fading as a warm gold glow strengthens above, the water surface arriving as a bright trembling ceiling that the ship punches through in an explosion of white spray and hanging droplets each catching the sunrise, the frame opening into a vast pale-gold dawn sky over a heaving dark sea, low half-sun flaring on the horizon, the craft arcing up out of the spray with engines catching the light, water streaming off its wings in glittering lines, camera rising with it then leveling into a wide hold as it climbs toward the sun, quiet triumphant relief, bold outlines, soft CRT glow, continuous single take.
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
| seed | 25004 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, 3d render, underwater explosions, enemies, rain`
**Notes:** The underwater-to-sky transition inside one clip is the risky half — if the model skips the breach, cut two clips (ascent i2v → airborne i2v from the first clip's last wet frame). This is the ending screen hero; iterate seeds generously.

## surface-breach-abovewater — camera waits at the surface, ship erupts past
**Model:** ltx-video
**Mode:** t2v
**Variation:** 2/2

```text
Static wide pixel-art shot at sea level under a low golden sunrise: the dark ocean surface suddenly erupts as a small blue fighter rockets out in a towering cone of white spray, climbing steeply rightward with streaming droplets glittering backlit, the spray sheet falls and spreads across the calm water behind it, the ship shrinking against the huge half-sun, single continuous shot, no cuts.
```

**Settings:**
| param | value |
|---|---|
| resolution | 960x544 |
| num_frames | 97 |
| fps | 30 |
| duration | ~3.2s |
| guidance | 3.4 |
| steps | 40 |
| seed | 25005 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, underwater scene`
**Notes:** Sidesteps the transition problem entirely — one phase of water only. Static camera plus fast subject is the most reliable LTX recipe; the spray-cone silhouette against the sun is a poster frame on hit rates near 1-in-2.

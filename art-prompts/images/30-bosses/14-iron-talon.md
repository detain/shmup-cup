# 30 — Extra Boss 14: IRON TALON (giant claw)
# A sky-hook fortress claw that reaches onto the playfield — grab, crush, drag.
# Seed slots: 13401-13403.

## itl-reveal — the claw descending through the cloud deck
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/3 of 3

```text
Horizontal arcade shoot-up boss reveal, ultra-detailed 16-bit-inspired concept art: an iron talon descending from a roiling grey-violet cloud deck at the top of the frame — a sky fortress's grabbing hand, three colossal articulated fingers of riveted dark steel with brass knuckle-drums and hydraulic tendons hissing steam along their backsheets. The finger-pads glow hot pink where grip-amps charge, and a rotating winch-housing palm plate shows a hazard-striped inner face. Below the claw, cloud-turbulence fingers drag streaks of mist downward. A tiny steel-blue player dart with cyan canopy and orange engine flare dodges at the lower left between falling rivet-sized debris. Deep-navy playfield below never pure black, teal cloud highlights. Bold dark outlines, saturated limited palette, subtle CRT scanline glow, widescreen 16:9 side-scrolling arcade composition.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 13401 | 13401 | 13401 | 13401 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text artifacts, watermark, blurry, human hand, flesh, five fingers, pure black background`
**Notes:** Exactly three fingers — models drift to five; sd3.5-large with the negative "five fingers" is the reliable fallback. Palm/winch read as the body.

## itl-weakpoint — knuckle actuator drum and tendon cables
**Models:** sd3.5-large, flux.2-dev
**Variation:** 2/3 of 3

```text
Macro boss weak-point detail for a horizontal shoot-up, ultra-detailed pixel-inspired concept art: extreme three-quarter view of the middle knuckle of a giant steel claw, the joint housing blown half-open from combat — the brass actuator drum exposed and spinning loose, throwing arcs of white electricity, bundle-cables of tendon hydraulics severed and whipping, each one spouting a ribbon of amber fluid that ignites in orange puffs. Between the cracked knuckle plates a spherical gyro-core glows red-hot, the single aiming point of the frame. Steam, sparks and flapping metal shreds radiate outward. Deep-navy background, bold dark outlines, saturated limited palette, subtle CRT scanline glow, square macro composition.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.5 | 3.5 | 4.0 | 4.0 |
| steps | 34 | 40 | 45 | 30 |
| seed | 13402 | 13402 | 13402 | 13402 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text artifacts, watermark, blurry, intact clean joint, flesh, pure black background`
**Notes:** Broken machinery beats intact machinery for weak-point readability; the red gyro-core anchors the shot line for documentation crops.

## itl-warning — the shadow of fingers closing over the lane
**Models:** flux.1-dev, sd3.5-large
**Variation:** 3/3 of 3

```text
Horizontal shoot-up warning frame, ultra-detailed 16-bit-inspired concept art, no text and no letters: the playfield darkening as the shadow of an iron talon arrives before the claw itself — three long finger-shadows sliding across the star field from the top of frame, converging, the gaps between them narrowing toward a pinch point where a tiny steel-blue player dart with cyan canopy and orange engine flare hangs in the last strip of light. High in the dark cloud ceiling at the top edge, two hot pink amp-glows kindle like eyes opening, and the first steam hiss is drawn as a pale arc of mist at the frame's corner. Deep-navy palette never pure black, everything reads by silhouette and rim-light. Bold dark outlines, saturated limited palette, subtle CRT scanline glow, widescreen 16:9 arcade frame.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 13403 | 13403 | 13403 | 13403 |

**Negative:** (sd3.5/qwen only) `text, letters, watermark, photorealistic, 3d render, blurry, visible claw body, pure black background`
**Notes:** Shadow-only warning with converging diagonals; flux.1-dev renders clean shadow fingers on stars without turning them into monsters.

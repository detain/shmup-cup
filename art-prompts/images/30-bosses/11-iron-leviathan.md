# 30 — Extra Boss 11: IRON LEVIATHAN (raid ship)
# Long raider-class body, prow ram, flanking gun batteries — elite raid encounter art.
# Seed slots: 13101-13103.

## ilv-reveal — full raid ship sliding into view broadside
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/3 of 3

```text
Horizontal arcade shoot-up boss reveal, ultra-detailed 16-bit-inspired concept art: an iron leviathan raid ship gliding in broadside across a deep-navy star field, a long slender raider hull like a mechanical eel crossed with a battleship, a hardened prow ram shaped as a clenched beak of riveted steel, and flanking gun batteries running the whole body in a row of synchronized turrets that track left in unison. The hull plating is dark gunmetal with a rust-red waterline stripe and amber running lights, vents trailing thin smoke in the slipstream. Small escort pods peel off its flanks. Deep-navy background from near-black blue to midnight blue, never pure black, scattered pale stars, pink-hot muzzle glints from the batteries. Bold dark outlines, saturated limited palette, subtle CRT scanline glow, widescreen 16:9 side-scrolling arcade composition.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 32 | 40 | 45 | 30 |
| seed | 13101 | 13101 | 13101 | 13101 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text artifacts, watermark, blurry, fat tub hull, wings, pure black background`
**Notes:** The 1536x640 ultrawide is the definitive format for a long-body raider — color reference: gunmetal, rust-red stripe, amber lights.

## ilv-weakpoint — prow ram joint and reactor spine seam
**Models:** sd3.5-large, flux.2-dev
**Variation:** 2/3 of 3

```text
Macro boss weak-point detail for a horizontal shoot-up, ultra-detailed pixel-inspired concept art: the head of an iron leviathan raid ship filling the frame at a three-quarter angle, showing its two vulnerabilities — the pivot collar where the riveted steel beak-ram joins the neck, gapped to reveal screaming white-hot hydraulic light, and along the crest the reactor spine seam where overlapping plates fail to meet, bleeding amber glow and drifting sparks. The beak surface is scarred gunmetal with a rust-red stripe, small sensor eyes like drilled portholes glinting pink. Deep-navy star-field background, bold dark outlines, saturated limited palette, subtle CRT scanline glow.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.5 | 3.5 | 4.0 | 4.0 |
| steps | 34 | 40 | 45 | 30 |
| seed | 13102 | 13102 | 13102 | 13102 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text artifacts, watermark, blurry, soft organic flesh, pure black background`
**Notes:** Ram collar + spine seam read as a two-phase damage story for raid documentation.

## ilv-warning — raid shadow crossing the playfield before arrival
**Models:** flux.1-dev, sd3.5-large
**Variation:** 3/3 of 3

```text
Horizontal shoot-up warning frame, ultra-detailed 16-bit-inspired concept art, no text and no letters: a playfield over deep-navy space where an enormous shadow slides across the star field from right to left, long, narrow and eel-straight, occluding stars section by section as it passes. Only the shadow is visible plus a single racing line of amber running lights igniting along its length and one pink-hot glow at the beak-prow entering from the edge. A tiny steel-blue player dart with cyan canopy and orange engine flare holds position center-left beneath the darkness. Composition: the diagonal of shadow dominates, the ship small and defiant. Deep-navy palette, never pure black, bold dark outlines, saturated limited palette, subtle CRT scanline glow, widescreen 16:9 arcade frame.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 13103 | 13103 | 13103 | 13103 |

**Negative:** (sd3.5/qwen only) `text, letters, watermark, photorealistic, 3d render, blurry, fat rounded shadow, pure black background`
**Notes:** The length of the shadow band tells the raid story without showing the ship — flux.1-dev keeps the occultation clean.

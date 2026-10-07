# 30 — Extra Boss 13: GRASPING BLOOM (suction flower)
# A mechanical-organic flower that pulls the player in — petals, pistons, a vacuum maw.
# Seed slots: 13301-13303.

## glb-reveal — full bloom open over a vine-anchor field
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/3 of 3

```text
Horizontal arcade shoot-up boss reveal, ultra-detailed 16-bit-inspired concept art: a grasping bloom anchored at the right edge to a thicket of riveted steel vines, its heavy metal petals peeled wide around a pulsing suction center. The petals are armored scoops — dark green-blue plate with brass hinge-ribs and pink warning paint on the inner faces — and each one flexes on visible piston fingers. The flower's throat is a soft violet funnel with spiral muscle-folds that glow inward, and loose debris, spent bullets and dust motes stream toward it along curved suction paths. Cool teal ambient light from the left, sickly magenta bioluminescence from the throat. Deep-navy background never pure black, bold dark outlines, saturated limited palette, subtle CRT scanline glow, widescreen 16:9 side-scrolling arcade composition.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 13301 | 13301 | 13301 | 13301 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text artifacts, watermark, blurry, soft plant flesh, healthy garden, pure black background`
**Notes:** The suction is drawn by debris motion lines curving into the throat — flux.2-dev keeps the spiral fold geometry coherent.

## glb-weakpoint — the pistil core inside the throat
**Models:** sd3.5-large, flux.2-dev
**Variation:** 2/3 of 3

```text
Macro boss weak-point detail for a horizontal shoot-up, ultra-detailed pixel-inspired concept art: straight into the open throat of a mechanical flower, concentric spiral folds of violet-lit metal receding toward the center where the pistil hangs — a brass spindle wrapped in a cage of bent needle-filaments, its glass bulb core sloshing with luminous green fluid and cracking with each intake pulse. Fine hairs of static discharge leap between the filaments and the throat wall. The whole frame has a pull-into-depth feeling, radial composition, dark plate rims at the edges. Deep-navy shadow palette, bold dark outlines, saturated limited palette, subtle CRT scanline glow, square macro crop.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.5 | 3.5 | 4.0 | 4.0 |
| steps | 34 | 40 | 45 | 30 |
| seed | 13302 | 13302 | 13302 | 13302 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text artifacts, watermark, blurry, organic wet interior, teeth, pure black background`
**Notes:** Radial depth composition doubles as a poster; the green fluid bulb is the shot-aim dot reference.

## glb-warning — petals unfurling from a closed fist
**Models:** flux.1-dev, sd3.5-large
**Variation:** 3/3 of 3

```text
Horizontal shoot-up warning frame, ultra-detailed 16-bit-inspired concept art, no text and no letters: at the right margin of a deep-navy playfield a huge steel bud stands shut like a clenched fist of overlapping dark plates, and the warning is the unfurling beginning — outer petals prying apart one hinge at a time, each opening cracking out a blade of magenta throat-light that slashes across the star field, and the first faint stream of dust and bullet debris starting to curve toward the emerging gap. The tiny steel-blue player dart with cyan canopy at left drifts almost imperceptibly rightward, engine flare straining against the invisible pull. Cold starlight versus the growing warm wound of pink light. Bold dark outlines, saturated limited palette, subtle CRT scanline glow, widescreen 16:9 arcade frame.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 13303 | 13303 | 13303 | 13303 |

**Negative:** (sd3.5/qwen only) `text, letters, watermark, photorealistic, 3d render, blurry, fully open flower, pure black background`
**Notes:** The dread beat is the first slit of light plus the drifting debris — flux.1-dev is great at the single-prying-petal moment.

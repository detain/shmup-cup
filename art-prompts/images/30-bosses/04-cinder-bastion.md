# 30 — Boss 04: CINDER BASTION (CB-04)

Battleship fused into a magma shaft, revolving armored arms around an exposed core.
Zone D: erupting peaks, lava lake, cave brick walls. Seed slots 124xx.

## cb04-reveal — fortress in the magma shaft
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/3 of 3

```text
Infernal arcade boss reveal inside a vast vertical magma shaft, the CINDER BASTION, a battleship-length fortress sunk upright into the flowing lava lake like a driven nail, its hull a scorched charcoal-and-rust rampart studded with dark gun ports, across the deck four colossal articulated armored arms rotate slowly around an exposed molten core raised on a cradle, each arm built of heavy rectangular plates linked by glowing seam-hinges dripping fused slag, the central core an open crucible of white-yellow fire bleeding up through orange to deep ember red at the edges, geysers of lava throwing arc-lit spray against cave brick walls of warm clay color, drifting ember motes and heat shimmer, a tiny steel-blue dart fighter with cyan canopy and orange exhaust weaving along the left shaft wall for scale, deep navy-black shadow above the glow line, SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, ultra-detailed large-format key art with pixel texture accents, subtle CRT scanline glow, no text.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 34 | 45 | 45 | 36 |
| seed | 12401 | 12401 | 12401 | 12401 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, modern warship, aircraft carrier planes, skulls, fire human figures, pure black background, smooth plastic`
**Notes:** Lava ramp #8a2c0a→#e87a1c with #fff080 core start; brick walls #b07047-family clay. Arms revolve — imply motion with seam drips.

## cb04-weakpoint — the cradle core between closing arms
**Models:** sd3.5-large, flux.2-dev
**Variation:** 2/3 of 3

```text
High tension boss weak point frame, tight centered composition on the exposed core of the CINDER BASTION, a spherical crucible of chained white-hot fire caged in a rotating collar of dark iron links, between two of its four revolving armored arms caught mid-swing with a narrow gap just opening, the inner faces of the arms lined with heat-blued plates glowing orange at their edges, molten droplets flung in an arc from a hinge, radial heat light sculpting every plate edge with hot rim and long shadow, tiny pink bullets already fired at the core visible as bright sparks skittering off the collar links, background pure blurred lava gradient from ember to cream without any readable shapes, claustrophobic mechanical fury, bold dark outlines, saturated limited palette, SNES-era 16-bit pixel art inspired rendering at ultra-detailed quality, pixel-cluster texture accents, subtle CRT scanline glow, no text.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 34 | 45 | 45 | 36 |
| seed | 12402 | 12402 | 12402 | 12402 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, nuclear reactor, sun surface photo, organic fire, humans, gore, pure black background`
**Notes:** The "gap between arms" is the attack window — keep it crisp and obvious. Core ramp #fff080→#f8b030→#f06820→#c83018.

## cb04-warning — eruption backlit warning silhouette
**Models:** flux.1-dev, sd3.5-large
**Variation:** 3/3 of 3

```text
Ominous alarm staging in a cave system, every running light in the magma cavern dying to black for one heartbeat except a rising wall of lava glow behind which the CINDER BASTION stands revealed as a flat black silhouette, battleship profile with its crown of four raised armored arms spread like a candelabra around the burning core dot in its chest, sparks and slow ember flakes drifting between silhouette and glow, the lower half of the frame thrown into a deep sapphire shadow with the small curved highlight of a fighter cockpit, cyan, barely visible bottom-left corner, a single red siren band sweeping across the upper darkness, composition ruled by backlight, graphic hard edges, bold dark outlines, saturated limited palette, SNES-era 16-bit pixel art inspired concept rendering, widescreen side-scrolling arcade framing, subtle CRT scanline glow, no text, no letters.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 12403 | 12403 | 12403 | 12403 |

**Negative:** (sd3.5/qwen only) `text, banner, letters, photorealistic, 3d render, watermark, detailed hull visible, lens flare abuse, pure black background, smoke clouds gray`
**Notes:** Candelabra-arm silhouette is the readable icon. Wide banner for the "bosses" carousel.

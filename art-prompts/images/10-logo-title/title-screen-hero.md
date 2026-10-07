# 10 — Logo & Title: Title Screen Hero Art

Full title-screen compositions. The wordmark text "SHMUP CUP" appears in each —
qwen-image or flux.2-dev recommended. Ships enter from screen-left, the Iron Tide
lurks right.

## title-screen — classic arcade attract title
**Models:** qwen-image, flux.2-dev
**Variation:** 1/4 of 4

```text
Complete retro arcade title screen illustration rendering the exact game title "SHMUP CUP" in large warm-gradient block letters, pale yellow melting into tangerine and flame red with a thick navy outline and hard drop shadow, positioned across the upper third, below it a sleek steel-blue dart-shaped fighter jet with a bold blue fuselage stripe, glowing cyan bubble canopy and hot orange engine afterglow streaks left to right across the lower third leaving a thin contrail, behind the tiny defiant ship on the right side of the frame rises a colossal mechanical fish-shaped fortress silhouette half-swallowed by shadow with rows of dim amber lights, deep navy starfield background that never falls to pure black with a faint teal nebula wash, scattered pink and violet glowing bullets with bright cores drifting in from the right edge, SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, subtle CRT scanline glow, widescreen 16:9 side-scrolling arcade composition, no other text besides the title.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 10011 | 10011 | 10011 | 10011 |

**Negative:** (sd3.5/qwen only) `garbled text, misspelled letters, extra letters, missing letters, subtitles, menu text, photorealistic, 3d render, watermark, blurry, pure black background`
**Notes:** Only the title should render as text — negatives guard against invented menu strings. Title anchor #f8f070→#f8a030→#e04828.

## title-screen — twin fighters under fortress shadow
**Models:** flux.2-dev, qwen-image
**Variation:** 2/4 of 4

```text
Cooperative arcade title screen artwork with the exact words "SHMUP CUP" written across the top in chunky gradient block capitals, golden yellow through orange to red, heavy navy outlines and offset shadows, beneath the logo two prototype fighters fly in formation from the left: a sleek steel-blue dart fighter with cyan canopy glow and an orange engine trail, and behind it a flat pale-mint manta-shaped ray-wing fighter with a green glowing canopy and twin amber thrusters, above and behind them on the right an enormous riveted steel fortress-ship looms like a dark mountain studded with amber running lights and rotating turret rings, tiny pink, crimson and violet bullet sparks glint against its hull, deep blue-black space with a distant teal gas cloud, SNES-era 16-bit inspired concept rendering, bold dark outlines, saturated limited palette, subtle CRT scanline glow, widescreen side-scrolling arcade composition, no text other than the title.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 32 | 40 | 45 | 30 |
| seed | 10012 | 10012 | 10012 | 10012 |

**Negative:** (sd3.5/qwen only) `garbled text, misspelled letters, extra letters, photorealistic, 3d render, watermark, modern fighter jets, visible cockpit pilots, pure black background, cluttered composition`
**Notes:** The definitive co-op hero image; flux.2-dev keeps both hull silhouettes cleanly separated.

## title-screen — vertical handheld/TV title poster
**Models:** qwen-image, flux.2-dev
**Variation:** 3/4 of 4

```text
Vertical arcade poster title artwork, the exact text "SHMUP CUP" stacked in two lines of heavy gradient block letters, pale yellow fading to flame red with dark navy outlines, anchored at the top of the composition, a steel-blue dart fighter with a cyan canopy and long orange exhaust plume dives diagonally from the upper left toward the center, a vast mechanical whale-shaped battleship fills the bottom of the frame seen from below like a floating city of gun turrets and glowing portholes in amber, streams of pink and violet bullets arc between the two, background a gradient of deep navy space into a teal-and-violet nebula near the bottom, tiny gold star points, SNES-era 16-bit pixel art inspired concept rendering with bold dark outlines and a saturated limited palette, subtle CRT scanline glow, dramatic diagonal composition, no other text.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 896x1152 | 896x1152 | 896x1152 | 896x1152 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 10013 | 10013 | 10013 | 10013 |

**Negative:** (sd3.5/qwen only) `garbled text, misspelled letters, extra letters, missing letters, photorealistic, 3d render, watermark, pure black background, horizontal composition`
**Notes:** Portrait crop for phone/TV splash use. Abyss Ark silhouette reference; whale-ship hint only.

## title-screen — molten final-zone title
**Models:** flux.2-dev, qwen-image
**Variation:** 4/4 of 4

```text
Dark dramatic arcade title illustration where the exact letters "SHMUP CUP" stand at the center in scorched block capitals, the gradient of their fill running from sickly pale yellow through ember orange to blood red, edged with a near-black navy outline and lit from beneath by lava glow, the letters rest on a cracked basalt platform above a glowing magma lake with rivers of orange fire snaking into darkness, a lone tiny steel-blue fighter with a cyan canopy hovers at the lower left casting a thin orange exhaust gleam onto the rock, on the right a colossal armored silhouette with a single glowing lure-light rises out of the magma haze almost invisible, floating ember sparks and one curving stream of violet bullets, atmosphere of heat haze and falling ash, saturated limited palette, deep shadows that stay navy rather than pure black, SNES-era 16-bit inspired concept rendering with bold dark outlines, subtle CRT scanline glow, widescreen 16:9 composition, no text other than the title.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 32 | 40 | 45 | 36 |
| seed | 10014 | 10014 | 10014 | 10014 |

**Negative:** (sd3.5/qwen only) `garbled text, misspelled letters, extra letters, photorealistic, 3d render, watermark, gore, pure black background, blurry`
**Notes:** Zone D + Zone I fusion mood (lava ramp #8a2c0a→#e87a1c, Hollow King lure tease). Higher steps help flux resolve the lure light.

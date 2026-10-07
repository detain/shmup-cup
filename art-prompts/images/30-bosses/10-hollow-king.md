# 30 — Boss 10: THE HOLLOW KING (HK-10)
# Final boss. An anglerfish of the deep dwelling inside the gut of the Abyss Ark:
# vast slack jaws that can close over the entire screen, one glowing lure.
# Seed slots: reveal 13001 · weakpoint 13002 · warning 13003.

## hk10-reveal — full reveal: the throne of teeth inside the ark
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/1 of 1

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, ultra-detailed large-format with clean vector shapes and pixel-art texture accents. The final boss of a horizontal arcade shoot-em-up revealed inside the hollowed hull-cathedral of a dead mechanical whale battleship: THE HOLLOW KING, an abyssal anglerfish fortress the size of a cathedral nave. Its body is fused machine and pale blind fish — slack, vast jaws rimmed with rows of riveted steel teeth each as long as a fighter craft, palate plated with dented armor and weeping amber coolant. From a crane-like spine of segmented black iron rises its single lure: a swollen biological lamp glowing pale ghost-green, the one light source, swinging on a cable-taut filament and throwing long tooth-shadows across the ribcage walls. Behind it, the ark's interior vanishes into a black-blue dark so complete the player's own ship-light would be swallowed; a few stray enemy bullets drift like plankton, pink and violet with bright cores and dark rims. Deep-water blues and bone-whites only, palette lifted from #05070f to #0c1a3c, never pure black; the lure's glow is the entire color story. Widescreen 16:9 side-scrolling arcade composition, boss filling the right two thirds and brooding, subtle CRT scanline glow. No text, no letters.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 32 | 40 | 50 | 30 |
| seed | 13001 | 13001 | 13001 | 13001 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, pure black background, blurry, vibrant rainbow palette, cute, chibi`
**Notes:** Color reference: lure glow pale green ~#a8e8c0 over bone hull #c8d0c8, darks #05070f–#0c1a3c. The restraint of one light source is what makes this the scariest frame in the game — if the model brightens the whole cave, raise guidance or add "chiaroscuro, 90 percent of frame in shadow".

## hk10-weakpoint — close-up: the lure and the palate seam
**Models:** sd3.5-large, flux.2-dev
**Variation:** 1/1 of 1

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, macro close-up study for a game manual. Extreme detail view of THE HOLLOW KING's weak points: upper left, the lure organ itself — a translucent biological bulb of pale green light wrapped in black iron filigree, a cracked filament socket leaking slow sparks, tiny fish-silhouettes circling the glow like moths; lower right, the palate seam where the anglerfish's armored roof-of-mouth plating meets the skull, plates misaligned, raw pink-gold energy pulsing in the gap, coolant boiling into bubbles that rise through dark water. Between them, out of focus, the blurred cathedral of closed teeth. Deep blue-black water background lifted from #05070f toward #0c1a3c, never pure black; the ghost-green lure light and molten-gold seam light are the only saturation. Composition square and graphic, two focal details arranged diagonally, subtle CRT scanline glow. No text, no letters.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 13002 | 13002 | 13002 | 13002 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, watermark, blurry focus, pure black background, multiple equal subjects`
**Notes:** Color reference: lure ~#a8e8c0, seam energy ~#f8c860. SD3.5 handles the split-focus macro cleanly; keep both details small in frame or the model will merge them — if it does, ask for only the lure.

## hk10-warning — silhouette: the jaws closing over the screen
**Models:** flux.1-dev, sd3.5-large
**Variation:** 1/1 of 1

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, widescreen arcade key moment. The instant the final attack begins: seen from inside the closing maw of THE HOLLOW KING, the screen itself becoming the mouth. Enormous jaws of riveted steel teeth sweep in from the left edge and the top and bottom of the frame, the gap of visible dark water narrowing to a sliver; in the far distance of the narrowing gap, a tiny steel-blue fighter dart with a bold blue hull stripe and cyan canopy glows with a desperate orange engine flare, centered and doomed-looking. Above the sliver of water, suspended in the black like a malevolent star, the single pale-green lure lamp burns. The palette drains to almost monochrome deep navy #05070f–#0c1a3c with bone-white teeth, one green light, one orange flame — pink and violet bullet glints caught between the teeth. Widescreen 16:9 side-scrolling composition, overwhelming scale, subtle CRT scanline glow. No text, no letters.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 45 | 45 | 30 |
| seed | 13003 | 13003 | 13003 | 13003 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, text, letters, watermark, pure black background, blurry, bright cheerful colors`
**Notes:** Color reference: ship stripe #3858f0, canopy #38c8e8, engine #f89830, lure #a8e8c0. This doubles as the final WARNING-screen art bed — leave it textless and overlay the flashing WARNING!! in-engine. Watch that the jaw frame keeps an asymmetric opening; symmetric mouths read as a cartoon yawn.

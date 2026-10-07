# 30 — Boss 09: ABYSS ARK (AA-09)

Whale-bodied flagship battleship with tail fluke, 13 hull sections, turrets.
Zone I: black-blue deep water, bioluminescent specks, rock spires, swaying weed.
Seed slots 129xx.

## aa09-reveal — the flagship turns in the trench
**Models:** flux.2-dev, sd3.5-large
**Variation:** 1/3 of 3

```text
Awe-scale boss reveal in an abyssal trench, the ABYSS ARK turning broadside out of the dark water like a moving island, a fortress-ship built as a colossal mechanical whale, its body clearly segmented into thirteen riveted hull sections from blunt plated snout to a vast rising tail fluke edged in torn coral, each section a different weathered slab of deep-steel armor with barnacle clusters and weeping seam rust, a forest of turret towers bristling along its spine rail with barrels tracking, the flank scarred with old battle gouges filled with slow-drifting bioluminescent plankton so the wounds glow pale cyan, beneath the jaw a hangar grate exuding a column of rising bubbles, the water graded from teal glow near the Ark to blue-black in the far depths, silt pouring off its fins in sheets, a lone steel-blue dart fighter with cyan canopy and orange engine glow hovering at the bottom-left corner of frame the size of a gnat against its eye, the eye itself a warm amber porthole ring of lamps, reverent and terrifying, bold dark outlines, saturated limited palette of deep blue, teal and rust, SNES-era 16-bit pixel art inspired concept rendering, ultra-detailed large-format key art with pixel texture accents, widescreen side-scrolling arcade composition, subtle CRT scanline glow, no text.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 36 | 48 | 50 | 36 |
| seed | 12901 | 12901 | 12901 | 12901 |

**Negative:** (sd3.5/qwen only) `real whale, water spout, friendly, cartoon smile, sunlight surface, dry dock, photorealistic, 3d render, text, watermark, pure black background`
**Notes:** Biolume ramp #16485a→#6ad8e0. If the model fuses sections, ask again — the 13-segment read is the signature. Turret count should feel absurd, not precise.

## aa09-weakpoint — seam between sections nine and ten
**Models:** sd3.5-large, flux.2-dev
**Variation:** 2/3 of 3

```text
Damage-control macro view on the flank of the ABYSS ARK, camera tight on the overflowing seam between two of its thirteen hull sections where the armor has peeled apart like torn tin, inside the wound a nest of pulsing machinery exposed, a bundle of glass conduit veins carrying rushing cyan luminal fluid, a shuddering violet power knot arcing between broken coupling rings, and at the center of the mess a small unprotected gyro-core spinning out of alignment throwing stuttering highlights, the surrounding plate edges ragged, studded with rivets and dripping silt, bursts of fine white bubbles jetting sideways from the pressure leak, one bright pink enemy bullet with a dark rim curving past in the foreground blurred to a comet streak while a cyan-white player shot lands dead center on the gyro-core in a starburst of gold sparks, scattered glowing gold point motes drifting up from the impact like struck flint rising, hard chiaroscuro lit only by the wound's own glow, bold dark outlines, saturated limited palette of deep blue, cyan and violet with gold impact accents, SNES-era 16-bit pixel art inspired concept rendering at ultra-detailed quality, subtle CRT scanline glow, no text.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 34 | 45 | 45 | 36 |
| seed | 12902 | 12902 | 12902 | 12902 |

**Negative:** (sd3.5/qwen only) `flesh, blood, organs, human crew, clean sci-fi, photorealistic, 3d render, text, watermark, green haze, pure black background`
**Notes:** The wound reads as MACHINE anatomy (fluid, arcs, gyro) not body horror. Gold point sparks foreshadow the bullet-to-points death mechanic.

## aa09-warning — engine glow in the deep dark
**Models:** flux.1-dev, sd3.5-large
**Variation:** 3/3 of 3

```text
Predator-dark alarm frame at the bottom of the Abyssal Throne trench, the water gone almost black-blue with only drifting marine snow and a few cold cyan specks of plankton, and out of that dark the ABYSS ARK announces itself in fragments before it exists, two long rows of amber porthole lamps emerging one by one along an unseen hull curve like a runway lighting a runway in the void, the faint blue-white ghost of a tail fluke silhouette sweeping across the top of frame between the dimmest stars of weed-glow, a deep subsonic shiver rendered as soft ripple distortion warping the plankton into concentric bands, from the unlit bulk one single turret silhouette drops its barrel with a rim of cold highlight, bottom right a tiny cyan canopy dot of the player fighter utterly still in the path of the lamps, dread of scale and patience rather than violence, no fire no explosion only light arriving, bold dark outlines, saturated limited palette of abyssal blue-black, cyan specks and amber lamp dots, SNES-era 16-bit inspired concept rendering, widescreen side-scrolling arcade framing, subtle CRT scanline glow, no text, no letters.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 3.5 | 4.0 |
| steps | 32 | 40 | 40 | 30 |
| seed | 12903 | 12903 | 12903 | 12903 |

**Negative:** (sd3.5/qwen only) `text, banner, letters, photorealistic, 3d render, watermark, full body visible, bright scene, explosions, submarine crew, pure black background`
**Notes:** Lamps-on-hull-in-dark is the campaign's most iconic warning beat — anchor to #e8a030 amber dots, keep water lifted #0c1a3c-blue not black.

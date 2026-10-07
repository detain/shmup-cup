# Gameplay — Parallax Zone Transitions

The side-scroller's travel cinema: foreground debris, mid-layer terrain, far nebula all
sliding left at different speeds while the camera tracks right. Each entry crosses into a
different zone of the nine.

## transition-brine-raster — gliding into the teal gas-sea with wobbling wave walls
**Model:** wan2.2-t2v
**Mode:** t2v
**Variation:** 1/3

```text
Widescreen 2D side-scrolling retro 16-bit pixel-art transition: the steel-blue dart fighter cruises right through layered parallax space as the deep navy gives way ahead to a glowing teal gas-sea, vast wobbling raster wave bands of luminous cyan mist undulate vertically in slow rolling motion across the mid-ground, bright green-yellow vapor currents drift past the foreground at speed while distant wave layers crawl, the fighter's orange trail bends in the cross-currents, pink spark particles fleck the mist, camera tracks right at steady cruise speed, dreamy undersea-nebula atmosphere with bold saturated color bands, faint CRT scanline glow, continuous single take.
```

**Settings:**
| param | value |
|---|---|
| resolution | 1280x720 |
| num_frames | 81 |
| fps | 16 |
| duration | ~5s |
| guidance | 4.0 |
| steps | 35 |
| seed | 22009 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, photorealistic, 3d render, first-person camera, vertical scrolling, HUD`
**Notes:** Brine Nebula identity shot. The undulating raster bands are the zone's gimmick — keep them vertical-wave, if the model turns them horizontal the still pairing below is more reliable.

## transition-magma-cave-exit — bursting out of a lava tunnel into open fire
**Model:** ltx-video
**Mode:** t2v
**Variation:** 2/3

```text
Fast side-scrolling pixel-art run: the blue dart fighter shoots rightward out of a dark rock tunnel mouth into a vast lava cavern, foreground stalactite silhouettes whip past quickly, orange lava lakes glow and pulse below, erupting cones pop with fountain sprays in the mid-ground, heat shimmer ripples the air, camera tracks right accelerating slightly, strong speed contrast between near and far layers, continuous single shot.
```

**Settings:**
| param | value |
|---|---|
| resolution | 768x512 |
| num_frames | 121 |
| fps | 30 |
| duration | ~4s |
| guidance | 3.4 |
| steps | 40 |
| seed | 22010 |

**Negative:** `worst quality, blurry, jittery, distorted frames, morphing, text, watermark, flicker, first-person camera, vertical scrolling, HUD`
**Notes:** Tunnel-to-open reveal is LTX's strongest transition grammar — the near-layer whip-past sells speed. Magma Deep beat; loop the cavern half by trimming the tunnel exit frame.

## transition-storm-front — entering the slanting rain of Tempest Ridge
**Model:** wan2.2-i2v
**Mode:** i2v
**Variation:** 3/3

```text
The pale-mint manta craft banks gently as it flies into a rolling wall of dark storm clouds, rain begins to slant diagonally across the frame streaking past the lens, jagged snow ridge tops scroll slowly below in the mid-layer, intermittent violet lightning flashes illuminate the cloud volumes from inside, wind smears the mist layers into faster leftward drift, the twin amber thruster ribbons bend sideways in gusts, camera tracks right steadily through the front, continuous single take, no cuts.
```

**Settings:**
| param | value |
|---|---|
| resolution | 1280x720 |
| num_frames | 81 |
| fps | 16 |
| duration | ~5s |
| guidance | 4.0 |
| steps | 35 |
| seed | 22011 |

**Negative:** `worst quality, blurry, jittery, morphing, distorted frames, flicker, restyled source image, scene change, cut`
**Source image:** `art-prompts/images/20-gameplay/tempest-rain-entry-v1-flux.2-dev.png` (glob `20-gameplay/tempest*`)
**Notes:** Rain streak direction and lightning timing carry this one; the still guarantees cloud volume reads. Lightning flashes make it unsuitable for a loop but perfect as a one-shot act opener.

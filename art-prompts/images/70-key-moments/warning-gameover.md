# 70 — Key Moments: Screens (Game Over / High Score / Credits)
# Cabinet-grade screen art with exact text. The WARNING!! boss-flash and the
# ESCAPE corridor beats already live in boss-moments.md (20011-12, 20031-32).
# Seed slots: game-over 20091-92, credits 20101-02, high-score 20111-12.

## game-over-screen — GAME OVER card: frozen bullet storm around a drifting wreck
**Models:** qwen-image, flux.2-dev
**Variation:** 1/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, widescreen arcade composition, subtle CRT scanline glow; game-over screen artwork. The moment the run dies, painted as a still portrait of a stopped heart: centered in the dark field, the wreck of a steel-blue dart fighter drifts in slow profile, engines out, one wingtip feathered with a last curl of ember-grey smoke, canopy glass cracked and dark, hull stripe scorched along its whole flank, and from a new gash in the belly a short ribbon of pale atmosphere vapor bleeds sideways into the void — the only motion in the image. Around the wreck hangs the unfinished war: the bullet storm frozen mid-screen in curved streams of pink, red and violet bright-cored orbs with dark rims, dozens of them still traveling toward a target that no longer answers, some already passing through the drift-line of the dead ship as if nothing happened. Behind it all, far off, the unimpressed silhouette of the boss hull that did it — a low mountain of armored plating with one red eye-slit glowing calmly at the right edge of the frame. Dead center, straight-on in enormous blocky arcade capitals, the words "GAME OVER" — warning-red faces with white-gold inner bevels and a heavy dark navy outline, slightly over-bright so their glow falls onto the drifting wreck beneath the letters. Deep navy void with sparse cold star dust, thick outlines everywhere, the red of the text the loudest thing in the picture, lifted deep-navy base, never pure black. The text in the image must read exactly "GAME OVER" and nothing else.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 34 | 40 | 45 | 36 |
| seed | 20091 | 20091 | 20091 | 20091 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, fireball explosion, ship burning, debris field, pilot ejecting, lowercase letters, script font, misspelled text, extra words, numbers, score digits, continue countdown, watermark, blurry, letters in perspective, green skull imagery`

**Notes:** Exact string: "GAME OVER". Text red ~#e04828 with #fff080 bevel, outline #1b2a4a; ship stripe #3858f0, canopy #38c8e8. qwen-image is the type-safe pick; flux.2-dev yields softer glow-bleed but may double the O's. The frozen-storm-around-wreck stillness is the emotional device — check bullets aren't exploding, just indifferent.

## game-over-screen-quiet — GAME OVER alt: empty player berth, ships dark, CRT room glow
**Models:** qwen-image, sd3.5-large
**Variation:** 2/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, centered arcade-canvas composition, subtle CRT scanline glow over the whole image; a quieter, sadder screen card. The starfield has stopped scrolling: a plain, empty expanse of lifted deep-navy with a light dusting of cold stars fills the frame, no ship, no bullets, no boss — the battlefield after everyone has gone home except the scoreboard. Across the exact center, the single phrase "GAME OVER" set in huge straight-on pixel-arcade block capitals, red-orange faces cooling to dark ember at their bottom rows, a thin white highlight along every top edge, thick navy outlines and a soft drop-shadow rectangle behind the words like an old sign left lit in an empty hall. Beneath the text, drifting very slowly through the lower third and slightly out of focus, one last enemy stray — a tiny seed-shaped gunmetal drone pod with a dimming magenta eye-slit — passes with no interest in anyone, the war's full autopilot continuing for one more second. Upper corners carry the faintest violet nebula breath; everything else is held-back dark and held-back color so the words are the only event. The CRT scanline texture is stronger here, the image slightly bowged like a tube warming down, pixels honest. Palette: navy field, ember-red letterforms, one lilac eye, never pure black. The text in the image must read exactly "GAME OVER" and nothing else.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 32 | 40 | 45 | 36 |
| seed | 20092 | 20092 | 20092 | 20092 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, player ship visible, explosions, fleet, crowded scene, misspelled text, extra words, high score table, numbers, watermark, blurry, rainbow lettering, tilted text, 3d extruded letters`

**Notes:** The 1536x640 crop doubles as a stream-ends / death-card banner. Letter ramp: face ~#e04828 cooling to dark ember #6a2418, top highlight #fffff0. The lone indifferent skeet pod is the whole joke — the Verge doesn't even notice you left; if the model multiplies the pods, regenerate. Strong scanlines wanted here per the "tube warming down" clause.

## hi-score-entry — Neon cabinet glow: ranking row with three-letter slot lit
**Models:** qwen-image, flux.2-dev
**Variation:** 1/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, centered arcade screen composition, heavy subtle CRT scanline glow; the hi-score entry moment as pure cabinet poetry. The screen is a dark navy marquee board under glass: across the top, the words "HIGH SCORE" in bright gold blocky arcade capitals with orange under-glow, and below it a short list of ranked entries drawn as neat pixel letter-rows — the top row freshly earned and burning brighter than the rest: the three letters "AAA" boxed in two blinking selection brackets of cyan light, each letter a chunky outlined tile glowing warm gold as if just stamped. The lower rows dim in steps of respect, receding lilac-grey placeholder letter-triplets fading toward the bottom like names already half-forgotten, each row underlined with a thin pixel rule of deep violet. From off-screen, the cabinet's own neon spills across the glass: a horizontal bleed of magenta and cyan reflection streaking the panel diagonally, dust specks catching it, the faint curve and bow of a CRT at the frame edges, and one blurry thumbprint at the lower right corner of the tube — proof a human hand just left. The whole image smells like carpet cleaner, ozone and victory: saturated arcade colors, thick outlines on every glyph, lifted deep-navy board, never pure black. The text in the image reads exactly "HIGH SCORE" at the top and "AAA" in the lit row, nothing else spelled anywhere.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1024x1024 | 1024x1024 | 1024x1024 | 1024x1024 |
| guidance | 5.0 | 3.5 | 4.0 | 4.5 |
| steps | 32 | 40 | 45 | 40 |
| seed | 20111 | 20111 | 20111 | 20111 |

**Negative:** (sd3.5/qwen only) `photorealistic photo, 3d render, modern UI, keyboard, mouse cursor, browser window, long names, readable extra words, numbers scores, slot machine, casino, misspelled text, garbled letters, watermark, blurry, more than two text strings`

**Notes:** Exact strings: "HIGH SCORE" (top) and "AAA" (bracketed row) — both qwen-readable; gold caps ~#f8f070→#f8a030 with #1b2a4a outlines, brackets cyan #38c8e8. The thumbprint + neon glass-reflection are the "cabinet vibe" carriers; without them it's just a scoreboard. Dimmed placeholder rows will garble at lower guidance — 4.5 on qwen keeps the lit row crisp while letting the rest stay soft, which is fine and even desirable.

## hi-score-entry-cabinet — The cabinet itself in a dark arcade row, screen mid-name-entry
**Models:** flux.2-dev, sd3.5-large
**Variation:** 2/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, three-quarter room composition, subtle CRT scanline glow; environmental portrait, ultra-detailed large-format art with pixel-art texture accents. One arcade cabinet stands awake at the end of a long dark row of sleeping machines, painted in a warm, lonely three-quarter view: a tall upright cabinet in gunmetal and deep navy with thick dark outlines, its side-art panel hand-lettered in a huge diagonal stripe of flame gradient — yellow cooling through orange into red — with a small stylized dart-fighter decal racing across it. The CRT is the only lit screen for twenty meters: it glows the moment after a perfect run, showing a simple pixel scoreboard — a gold header bar, a row of three fat letters "AAA" boxed in blinking cyan brackets, the rest of the table softly unreadable — and the tube's light falls out of the cabinet into the room as a physical volume of blue-gold haze, catching floating dust, raking across the faded carpet with its constellations of cigarette burns, glinting the metal coin-door and the scarred red ball-top of the joystick. Every neighboring cabinet is dark glass and mirrored shadow, their screens showing only this one lit screen back to itself down the row. The mood is 1 a.m., last token, best run, nobody watching but the machines. Palette of arcade navy and carpet rust with the one warm CRT bloom, lifted deep-navy room, never pure black. No readable text anywhere except the three bracketed letters "AAA" on the lit screen, no logos spelled, no signage.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1152x896 | 1152x896 | 1152x896 | 1152x896 |
| guidance | 5.0 | 3.5 | 4.0 | 4.0 |
| steps | 34 | 40 | 50 | 30 |
| seed | 20112 | 20112 | 20112 | 20112 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, modern RGB gaming setup, PC monitors, vr headsets, people, children, crowd, bright full room, text on side art, letters on marquee, watermark, blurry, all screens lit, clean carpet`

**Notes:** Side-art flame ramp #f8f070→#f8a030→#e04828 matches the logo gradient; CRT bloom cyan-gold. Only "AAA" is legible — everything else on the screen reads as pure pattern, which qwen often over-eagerly spells; flux.2 is the safer author here for the room, hence the swap. Carpet burn-marks and dust-in-light-beam are the nostalgia pixels; if flux.2 sanitizes the room, bump guidance and reroll.

## victory-credits-card — ESCAPE COMPLETE: dawn end-card with logo mark and one ship
**Models:** qwen-image, flux.2-dev
**Variation:** 1/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, widescreen arcade end-card composition, subtle CRT scanline glow; the credits roll's final frame, painted as a quiet victory card. Across the lower sky of a pale dawn — thin rose cloud bars over a cream-gold horizon band, the half-sun just clear of a distant planet rim — a single steel-blue dart fighter flies level and unhurried toward the left edge of the frame, engine glow a relaxed warm orange, contrail thin and straight, the war entirely behind it. The upper two-thirds of the sky is left deliberately open and clean, and there, centered in the dawn, sits the game's name in huge warm block capitals with a vertical gradient from pale yellow through orange into red, each letter bound in a thick dark navy outline with a soft drop shadow and a single white highlight along its top edge: the words "SHMUP CUP". Below the title, floating in the same golden light in smaller straight-on capitals of pale ivory with navy outlines, the single line "THANK YOU FOR PLAYING". Nothing else is written anywhere: no credits list, no dates, no numbers, no logos. The card should feel like the last page of a picture book that happened to be about lasers: warm, plain-spoken, complete. Palette of dawn cream and rose over lifted deep-navy, the red-gold title the warmest anchor, never pure black. The text in the image must read exactly "SHMUP CUP" and exactly "THANK YOU FOR PLAYING", and nothing else.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 1536x640 | 1536x640 | 1536x640 | 1536x640 |
| guidance | 5.0 | 3.5 | 4.0 | 4.5 |
| steps | 32 | 40 | 45 | 40 |
| seed | 20101 | 20101 | 20101 | 20101 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, fireworks, confetti, crowd, extra text, credits list, copyright symbols, dates, numbers, garbled letters, misspelled words, tilted logo, 3d extruded letters, watermark, blurry, sunset orange overdone`

**Notes:** Exact strings: "SHMUP CUP" and "THANK YOU FOR PLAYING". Title gradient #f8f070→#f8a030→#e04828, outline #1b2a4a, shadow #0a0f26, top highlight #fffff0 — the canonical lockup. Two-line text is qwen's comfort zone; flux.2-dev alt will likely fumble the second line, so verify spelling before blessing. This doubles as the itch.io completion card and the Steam news-banner for patch notes about the ending.

## victory-credits-card-emblem — End-card alt: emblem-only lockup, ships at rest below the mark
**Models:** qwen-image, sd3.5-large
**Variation:** 2/2 of 2

```text
SNES-era 16-bit pixel art inspired concept rendering, bold dark outlines, saturated limited palette, centered heraldic composition, subtle CRT scanline glow; the end of the campaign rendered as a unit plaque. Deep in the center of a lifted deep-navy field sits a simple armored emblem: a flat shield-roundel of dark steel blue ringed in a gold band, and across its face a single stylized dart fighter silhouette in warm gradient lettering-free relief, engine flare rendered as a small gold comet-tail — an insignia, not a scene. Below the roundel, parked in respectful symmetry, both prototype fighters rest nose-in toward the emblem on a wide plain of matte deck-plate: on the left a steel-blue dart with cyan canopy and twin cool vents, on the right a pale mint manta-shaped craft with green canopy and dark ringed engines, wings level, paint scuffed, both clearly retired. Above the emblem the darkness is open and star-dusted, one thin dawn-gold light band crossing the very top of the frame like a hangar door cracking open at sunrise, its light just enough to rim every silhouette in warm firelight-gold. Across the bottom third, straight-on in clean ivory block capitals with heavy navy outlines and a soft warm drop-shadow: the words "SHMUP CUP". Nothing else is written, numbered or spelled anywhere in the image. The mood is a monument photographed at 6 a.m.: proud, quiet, a little tired. Palette of navy, steel blues, pale mint and committed dawn-gold accents, never pure black. The text in the image must read exactly "SHMUP CUP" and nothing else.
```

**Settings:**
| param | sd3.5-large | flux.1-dev | flux.2-dev | qwen-image |
|---|---|---|---|---|
| resolution | 896x1152 | 896x1152 | 896x1152 | 896x1152 |
| guidance | 5.0 | 3.5 | 4.0 | 4.5 |
| steps | 32 | 45 | 40 | 40 |
| seed | 20102 | 20102 | 20102 | 20102 |

**Negative:** (sd3.5/qwen only) `photorealistic, 3d render, military insignia real-world, eagles, flags, swords, extra text, letters on ships, serial numbers, watermark, blurry, ships flying, cluttered hangar, dark unreadable emblem`

**Notes:** Exact string: "SHMUP CUP" (single line, bottom third). Roundel band gold ~#f8a030, deck-plate and field navy #05070f–#0c1a3c, dawn band #fce8b8. Real-world heraldry ban matters — the emblem must read game-unit, not national. Vertical format for the credits loop; sd3.5's symmetrical two-ship parking is better than flux's, qwen carries the type.

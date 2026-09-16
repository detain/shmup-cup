# Visual & mechanic extras (plan M3-02)

How plan step **M3-02** added the game's showpieces and its one signature mechanic. On the picture
side: a **Mode-7 floor** (mode 7's per-row affine matrix in a GLSL ES 1.0 filter) and the pseudo-3D
**HIGH-SPEED DIMENSION** dev stage that flies over it, a **CRT / scanline filter** (Off / Light /
Full, capped at 1080p on a TV) and two **aspect modes** (ultra-wide and classic 4:3, with lit side
panels instead of black bars). On the mechanic side: the deterministic **authentic slowdown**,
**graze** scoring, the **death-bomb window**, the **black-hole bomb** — the Direct ship's signature
special — the final zone's **escape sequence** and the three P2 bosses (**GRASPING BLOOM** suction,
**IRON TALON** grabber, **SHADOW STRIDER** the invincible walker).

This page is the *how and why* and the map of the step's code and content. Exact signatures are in
[api-reference.md](api-reference.md) (`config`, `data`, `stage`, `presentation`, `world`, `player`,
`bullets`, `enemies`, `bosses`, `behaviors`, `blackhole`, `powerups`, `scoring`, `debug`, `scenes`,
`ui`, `@shmup/render-pixi`'s `effects` / `viewport` / `renderer`, `@shmup/shell`'s `dispatch`); the
TSDoc of `packages/core/src/blackhole/index.ts`, `packages/render-pixi/src/effects/{mode7,crt,
shaders}.ts` and `packages/render-pixi/src/viewport/index.ts` is the authoritative reference. What
players see is in
[`../client/visual-and-mechanic-extras.md`](../client/visual-and-mechanic-extras.md).

Neighbouring pages: the M2-08 presentation pass this builds on (raster effects, palette cycling,
scale modes, render interpolation) is [presentation-polish.md](presentation-polish.md); the render
contract and the renderer's two passes [rendering-and-shell.md](rendering-and-shell.md); bullets,
lasers and cancels [bullets-and-patterns.md](bullets-and-patterns.md); the boss system
[bosses-and-warning.md](bosses-and-warning.md) and [advanced-bosses.md](advanced-bosses.md); the
campaign run, the zone map and the endings
[campaign-and-bonus-stages.md](campaign-and-bonus-stages.md); the death sequence, `core/fx` and
scoring [death-and-scoring.md](death-and-scoring.md); the Options pages and the save
[saves-and-options.md](saves-and-options.md); the stage format and runner
[stage-runtime.md](stage-runtime.md); the placeholder art generators
[asset-pipeline.md](asset-pipeline.md); goldens, hashing and the bundle budgets
[debug-and-replays.md](debug-and-replays.md).

Background: `shmup_feat.md` §18 (Mode 7 effects, CRT / scanline filter, ultra-wide mode), §3
(authentic slowdown, classic 4:3 with pillarbox side art), §7C (the black-hole bomb as the one
signature mechanic), §10 (the death-bomb window), §13 (the P2 suction, grabber and invincible-walker
bosses), §14 (the escape sequence, the pseudo-3D high-speed dimension stage), §22 (graze detection);
plan §1.5 (sim-affecting options live in `GameConfig`, goldens re-blessed on purpose), decision D19
(the internal resolution is fixed at 384×216) and D24 (placeholder art comes from committed
generators).

## The picture at a glance

```text
 presentation only (never hashed, never simulated)
   content stage `mode7` ─► StageMode7 ─► createStageEffectsView ─► WorldView.effects.mode7
                                                                      │  (Mode7View)
   PixiRenderer.bindWorld ─► Mode7Floor.bind(view, atlas tile rect) ───┘
   every frame ─► Mode7Floor.sync(camera) ─► MODE7_* filter on a full-frame sprite (BG_MID)
   UserOptions.display.crtFilter ─► UserOptionKind.CrtFilter ─► DisplayTarget.setCrtFilter
                                  ─► PixiRenderer.setCrtFilter ─► CrtPass over the upscaled pass
   UserOptions.display.aspect    ─► UserOptionKind.Aspect     ─► DisplayTarget.setAspect
                                  ─► computeAspectViewport ─► frame window + two side panels

 simulation (GameConfig fields ⇒ recorded in every replay header)
   config.slowdown  ─ phase 9 updateSlowdown ─► World.slowLoad / slowRun ─► stepWorld skips a tick
   config.graze     ─ phase 6 bullets.grazePlayers(db.scoring.graze) ─► BulletFlag.Grazed, points
   config.blackHole ─ phase 2 bombSystem ─► BlackHoleSystem.fire  (Direct ship's Special)
                      phase 5 update (drift, pull, swallow) · 7 resolve (lightning) · 9 sync
   config.deathBomb ─ playerHit opens PlayerShip.bombTicks instead of killing the ship
   boss scripts     ─ BossScriptApi.pull / release ─► phase 2 bosses.applyFields (suction, grabber)

 flow
   final zone's stage clear ─► ClearNext.Escape ─► FlowControl.enterEscape()
     RunState.inEscape / escapeStage ─► a World on `escape.stage.json` with the run's carry
     its clear ("ESCAPE COMPLETE") ─► the ending (the route and the zone count are unchanged)
```

## Mode-7 floor

`shmup_feat.md` §18 asks for "Mode 7-style effects: scaling/rotation, pseudo-3D floor (per-row
affine matrix in shader)". One GLSL ES 1.0 program does it, and it is a **shader on one quad**, not
geometry:

| Piece | Where |
|---|---|
| Shader sources `EFFECT_MESH_VERTEX` / `MODE7_FRAGMENT` | `render-pixi` `effects/shaders.ts` |
| The Pixi mesh and its uniforms (`createMode7Shader`, `Mode7Shader`) | `effects/mode7.ts` |
| The renderer's floor (`createMode7Floor`, `Mode7Floor`) | `effects/mode7.ts` |
| A stage's data (`StageMode7`, `mode7` section) | `core/data` |
| The view the renderer reads (`Mode7View`) | `core/presentation`, built by `core/stage` `createStageEffectsView` |

**How it draws.** `Mode7Floor` owns a full-frame `Mesh` at the bottom of the `BG_MID` layer with the
Mode-7 program bound to it. For every output row the fragment shader turns the row's
distance below `horizon` into the plane's depth `height / (row − horizon)`, walks the plane's origin
along the plane's **turned axes** and samples the floor tile straight out of the atlas with `fract`
— no separate floor texture, no per-row draw call. Distance fades the colour into `fog` over
`fogDepth` texels; rows above the horizon (or past `bottom`) stay transparent.

**No trigonometry in the shader.** The host passes the axes (`uRight`, `uForward`) already turned,
computed from the core's committed angle tables (`sinB` / `cosB`, 1024 binary units — `MODE7_ANGLE_UNITS`),
so the GPU never has to agree with the CPU about a sine. The scale is clamped to
`MODE7_MAX_SCALE` (4096) so the row just under the horizon cannot divide by zero.

**The plane follows the camera.** `scroll` texels forward per pixel of camera x and `sway` texels
sideways per pixel of camera y (`Mode7Floor.sync(camera)`), so the floor and the stage can never
drift apart and **nothing about it is simulated**: the section is presentation only, the World never
reads it and a stage's hash is unchanged by adding one. The mesh is drawn only while the camera
is inside `[from, to)` — a stage without a floor renders exactly as it did before M3-02, and a frame
inside the range only writes numbers.

> **Plan M3-02d (the render review's F6).** Until M3-02d the floor was a Pixi **filter** over a
> full-frame `alpha: 0` sprite that existed only to give the filter an area: Pixi pooled a 512 × 256
> render target, rendered the invisible sprite into it and then ran the filter pass — whose shader
> never reads that input. It is now a mesh drawn straight onto `BG_MID`: one draw call, no pooled
> target, no wasted clear, and no filter on the layer at all.

A stage's section (see [`content/stages/README.md`](../../content/stages/README.md) for the
authoring reference):

```jsonc
"mode7": {
  "sprite": "bg/dimension-floor",  // frame 0 tiles the plane (must wrap seamlessly)
  "horizon": 100,                  // playfield row the plane vanishes at
  "bottom": 200,                   // last row it is drawn on
  "height": 34,                    // camera height in texels: how fast it rushes past
  "scroll": 0.09,                  // texels forward per pixel of camera x (default 0.25)
  "sway": 0.05,                    // texels sideways per pixel of camera y (default 0)
  "turn": 0,                       // plane turn in binary units [0, 1024) (default 0)
  "fog": "#20124a", "fogDepth": 220, "alpha": 1
}
```

## The pseudo-3D dimension stage

`content/stages/dimension.stage.json` — **HIGH-SPEED DIMENSION** — is the showcase: a violet grid
rushing under the ship, a lit sky band above the horizon, pylons along the corridor and the three P2
bosses. It is a **dev stage** reachable with `?stage=dimension` (the `raster-range` precedent), not a
tenth campaign zone: a new zone would change the diamond map, all 16 routes and every golden replay
for no gain.

Its art comes from the committed generator `scripts/assets/procedural/dimension.mjs` (registered in
`scripts/assets/procedural/index.mjs`): `bg/dimension-floor` (a 32×32 seamless neon grid tile — the
lines sit on the tile's first row and column only, because the shader samples it with `fract`),
`bg/dimension-sky`, `enemies/dim-pylon` and the boss parts `bosses/bloom-maw`,
`bosses/talon-claw`, `bosses/strider-leg`. Like every generator it uses `+ - * /` and `Math.sqrt`
only, so the pixels are identical on every engine.

`test/integration/dimension-runtime.test.ts` flies the whole stage headlessly and drives the floor.

## CRT / scanline pass

`effects/crt.ts`, one program for both strengths (`CRT_LOOKS`, in `core/config` `CRT_FILTERS`
order):

| Setting | Scanlines | Aperture mask | Vignette |
|---|---|---|---|
| `off` | — | — | — |
| `light` | yes | — | — |
| `full` | yes (stronger) | yes | yes |

It runs over the **upscaled** second pass, so the scanline pitch follows the frame's scale on the
display (`CrtPass.setViewport`, at least `CRT_MIN_PITCH` output pixels) and one dark line falls
between two frame rows at any zoom.

**Since plan M3-02d the program is the blit's own shader** (`createCrtBlit`): the second pass draws
the frame texture with a `Mesh` whose shader *is* the CRT program, and `off` simply writes
`uScan = uMask = uVignette = 0`. So the CRT costs **one draw call whatever the setting is** — the
same draw the plain upscale always took.

> **Why (the render review's F2).** Until M3-02d the CRT was a Pixi filter on the pass-2 container.
> At 1920 × 1080 Pixi therefore pooled a **2048 × 2048 RGBA render target (16.8 MB)**, drew the
> upscaled picture into it and ran a *second* full-screen pass — roughly twice the frame's fragment
> work and bandwidth, with `light` costing exactly what `full` cost (same program, same passes,
> different uniforms). `CRT_MAX_HEIGHT` / `crtResolution` capped that pass at 1080 rows, which buys
> nothing on the M7, whose web viewport *is* 1080p. The headless render bench measured the fold:
> CRT `full` went from 5 draw calls and 2,048 KB of pooled render targets to 4 and 0 — the same
> numbers as CRT `off`.

`createCrtFilter` and `crtResolution` are still there behind `PixiRendererOptions.screenPass:
'filter'`, which restores M3-02's sprite + filter pass exactly. It is an escape hatch for a device
that dislikes the mesh path, not a setting players see.

The shader only ever multiplies the colour **down**, which is why the flash overlay's
three-per-second limiter still holds with the CRT on; a frame writes numbers only, and so does
switching the setting.

## Aspect modes

`ASPECT_MODES` (`core/config`) are `normal`, `wide` (64:27) and `classic` (4:3), and they are a
**window** on the display — never a crop, never a wider playfield. Decision D19 fixes the internal
picture at 384×216; `computeAspectViewport(aspect, scaleMode, displayW, displayH, baseW, baseH)`
places the frame in the largest rectangle of `ASPECT_RATIOS` that fits, centred, and reports the
leftover width as **side panels**:

| Display | `normal` | `wide` | `classic` |
|---|---|---|---|
| 21:9 (2560×1080) | letterbox | fills edge to edge | 4:3 window, wide panels |
| 16:9 (1920×1080) | letterbox | 64:27 window, letterboxed inside it | 4:3 window, 240-px panels |

The renderer fills the panels with two `Texture.WHITE` sprites tinted with the space-navy palette
colour at `PANEL_ALPHA` (0.35) behind the frame quad — a dimmed surround, not painted side art, so
the mode needed no new assets. `PixiRenderer.panels` exposes the placement, `setAspect(mode)`
switches it and re-places the frame and the panels at once.

## Authentic slowdown

`shmup_feat.md` §3 asks for an "optional authentic slowdown: deterministic tick-skipping when
on-screen object load exceeds a threshold (Gradius III SNES feel)". It is **sim-side**, which is the
only way it can stay deterministic:

- phase 9 (`updateSlowdown`) counts the tick's live objects into `World.slowLoad` — enemy bullets +
  enemy lasers + live enemies + standing boss parts + player shots + items, everything a SNES would
  have had to move and draw — and steps `World.slowRun`, the ticks run since the last skipped one
  (capped at `SLOWDOWN_RUN_TICKS` = 1);
- `stepWorld` then skips the next tick once the clock is full **and** the load is over
  `SLOWDOWN_THRESHOLD` (96): phases 2–8 do not run, exactly what hit-stop does, and `World.slowSkip`
  records it.

So a busy screen runs at half speed and a quiet one never slows, and two runs of the same replay
skip the same ticks. `hashWorld` mixes the three fields **only** in a World whose config has the
option on (`mixExtras`), so every golden recorded before M3-02 keeps its hashes.

## Graze

With `GameConfig.graze` on, phase 6 calls `bullets.grazePlayers(db.scoring.graze)` right after the
bullet / player collision: every live enemy bullet whose centre comes within its own radius + the
ship's hurt radius + `GRAZE_MARGIN` (7 px) of a **living** ship, and that was not grazed before,
gets `BulletFlag.Grazed`, pays the content's `scoring.graze` points to that player and pushes an
`FX_CUES.Graze` particle event. One bullet pays once, however long it stays close; the bit lives in
the bullet pool, so it is already part of the hash.

## The black-hole bomb (`core/blackhole`)

The one signature mechanic (`shmup_feat.md` §7C — "pick at most one"). With `GameConfig.blackHole`
on in a **Direct-mode** session, the stage's yellow item **stocks** a black hole
(`PlayerShip.bombs`, at most `MAX_BLACK_HOLE_STOCK` = 3) instead of detonating a smart bomb at once,
and the ship's `Special` throws one `BLACK_HOLE_THROW_X` = 48 px ahead of it.

A thrown vortex lives `BLACK_HOLE_PULL_TICKS` (96) + `BLACK_HOLE_BURST_TICKS` (36) ticks:

1. **Pull** — it rides the camera and drifts forward at `BLACK_HOLE_DRIFT` px/tick, draws enemy
   bullets in at up to `BLACK_HOLE_PULL` (2 px/tick) and enemies at up to `BLACK_HOLE_ENEMY_PULL`
   (1 px/tick), both falling off linearly with the distance (`VORTEX_FALLOFF` 0.75 — the rim still
   pulls at a quarter of the strength). A bullet that reaches the `BLACK_HOLE_CORE_RADIUS` (10 px)
   core is **swallowed**: a point item for the thrower, exactly like a cancelled bullet.
2. **Burst** — every `BLACK_HOLE_BOLT_INTERVAL` (6) ticks a bolt goes off: every enemy inside
   `BLACK_HOLE_RADIUS` (88 px) that is not `megaCrashImmune` is destroyed and credited to the
   thrower (`enemies.blast`), and every boss part in reach takes `BLACK_HOLE_BOLT_DAMAGE` (10).

`MAX_BLACK_HOLES` is 2 — one per player, so co-op cannot starve a partner — and each vortex credits
its own thrower. The system runs in phase 2 (`fire`), 5 (`update`), 7 (`resolve`) and 9 (`sync`,
the sprite batch on `LayerId.Fx` under the enemy bullets), and a checkpoint restart closes every
open vortex (`clearSession` → `BlackHoleSystem.clear`).

The engine sprite is `fx/black-hole` (32×32, four frames — three of the swirl, then the discharge),
generated by `scripts/assets/procedural/particles.mjs` from a pseudo-angle built out of `+ - * /`
alone.

## The death-bomb window

`GameConfig.deathBomb` is a number of ticks, 0 (off) to `MAX_DEATH_BOMB_TICKS` (30); the Options
page's toggle asks for `DEFAULT_DEATH_BOMB_TICKS` (8). A fatal hit on a ship that still holds a bomb
opens the window (`PlayerShip.bombTicks`) instead of killing it — `playerHit` ignores hits while it
is open — and a press of `Special` (the Direct ship, spending a black hole) or `PowerUp` (the meter
ship, spending its armed `!` slot through `PowerUpSystem.equipMeterSlot`) inside it wipes the hit
and grants `DEATH_BOMB_INVULN_TICKS` (90) of invulnerability. A window that runs out kills on the
tick it closes (`bombTicks` = -1 hands the held-back death to that tick's damage phase).

## Boss pull fields and the three P2 bosses

`BossScriptApi.pull(radius, strength, ticks?)` / `release()` open and close a **pull field** around a
boss (`Boss.pullRadius` / `pullStrength` / `pullTicks`). The World applies it in phase 2, after the
ships moved (`BossSystem.applyFields`): every living ship inside the radius is drawn towards the
boss's origin with the vortex falloff and clamped to the view. A field whose ticks run out closes
itself, and entering a slot or clearing the session resets all three fields — a review fix, so a
`boss.walker` can never inherit the suction boss's pull (see [Gotchas](#gotchas)).

Three behaviours in `core/behaviors` and three entries in `content/enemies/extras.enemies.json`:

| Boss | Behaviour | What it does |
|---|---|---|
| **GRASPING BLOOM** (`grasping-bloom`, GB-11) | `boss.suction` | Hangs in the lane and breathes: in for `pullTicks` with a wide field open and its parts opened (a `whenOpen` core is only vulnerable then), out for `restTicks` firing aimed spreads. Two petals to break, then a faster second phase |
| **IRON TALON** (`iron-talon`, IT-12, a captain) | `boss.grabber` | Stalks the nearest ship, telegraphs for `windUp` with the claw open, lunges — a short, very strong field inside a small radius — then recovers, firing a spread as it does |
| **SHADOW STRIDER** (`shadow-strider`, SS-13, a captain) | `boss.walker` | Paces between two screen columns, `stepTicks` a stride with `pauseTicks` planted, sweeping aimed 3-ways. Its parts are armour in the content, so it **can only be dodged**: its entry carries a `timeLimit` and it walks off again |

## The escape sequence

A **final** campaign zone may name an `escape` stage (`CampaignZoneSpec.escape` / `escapeId`);
`completeCampaign` rejects one on a zone that still has exits, and the loader resolves the id.
Zones H and I both name `content/stages/escape.stage.json` — a collapsing, fast-scrolling heightfield
corridor (three segments, the camera ramping 3 → 4.5 → 6 px/tick) with its own music
`content/audio/music/escape.music.json` (the `Escape` cue).

The flow: the final zone's stage clear takes `ClearNext.Escape` instead of the ending →
`FlowControl.enterEscape()` swaps the World for one on that stage with the run's carry
(`RunState.inEscape` / `escapeStage`, no caravan clock) → the next clear shows `ESCAPE COMPLETE` and
runs the ending. It is **not** a zone of its own: the route, the zone count, the zone tally and the
hi-score row's `reached` are all unchanged.

## Options

The four sim-affecting extras are `GameConfig` fields, so they are recorded in every replay header
and cannot change mid-game. They are offered on a new **EXTRAS** page of the Options screen
(`OptionsItem.Extras` → `ExtrasScene` / `ExtrasItem`: SLOWDOWN, GRAZE, DEATH BOMB, BLACK HOLE,
BACK), stored in the save as `UserOptions.play` and applied to the configs of the games started
afterwards (`withUserGameOptions`) under an `APPLIES FROM THE NEXT GAME` note. BLACK HOLE says
`BLACK HOLE: THE DIRECT SHIP ONLY` while focused.

The two picture settings are presentation-only `UserOptions.display` rows on the DISPLAY page
(`DisplayItem.Crt`, `DisplayItem.Aspect`) applied **live**: the scene flow pushes
`UserOptionKind.CrtFilter` / `Aspect`, `@shmup/shell`'s `connectOptionEvents` calls
`DisplayTarget.setCrtFilter` / `setAspect`, and `applyDisplayOptions` sets both at boot. Both
methods are **optional** on `DisplayTarget`, so a renderer without them (a fake in a test, a future
backend) is simply left alone.

## Determinism

- Everything that changes a tick is a `GameConfig` field, so a replay carries it and playback
  cannot disagree with the recording.
- The slowdown reads simulation state only (object counts), never a clock.
- `hashWorld`'s `mixExtras` adds each term only in a World that has the feature on: the slowdown's
  load / clock / skip flag, the graze count, every ship's `bombs` and `bombTicks` (with the black
  hole **or** a death-bomb window) and every open vortex. Older recordings therefore hash exactly as
  they did — `packages/core/test/debug/debug-extras-hash.test.ts` pins that term by term.
- A boss's pull field is hashed only while one is open, for the same reason.
- Mode 7, the CRT pass and the aspect modes never touch the simulation.
- The goldens and attract demos were re-blessed with `pnpm golden:update` **only** because every
  replay header gained the four new `GameConfig` fields, which changes each state hash. No
  `expected` status, score or tick count moved in any golden or demo — that is the evidence the
  simulation is unchanged with the extras off.
- The new golden `test/golden/zone-a-extras.replay.json` flies the whole of zone A with the MANTA
  and **every extra on**, the `bomberBot` throwing a black hole every `BOMB_THROW_TICKS` (90)
  ticks, so the vortices' pull, their swallowed bullets, their lightning and the grazes are all
  covered by hashes.

## Zero allocation

Every vortex slot, the filters, their uniform groups and the panel sprites exist before the first
frame; a tick and a frame only write numbers. Two step-specific rules:

- `BlackHoleSystem.update()` passes **whole-pixel** centres to `bullets.vortex` /
  `enemies.pullTowards`: a fractional argument of the six-argument (not inlined) call boxed a heap
  number every tick a vortex was open. Found by the new guard
  `packages/core/test/blackhole/blackhole-alloc.test.ts`; the codebase already documents the same
  rule for `bullets.cancelAll`.
- Attaching or detaching a filter copies a Pixi filter list, so the Mode-7 floor does it only when
  the camera enters or leaves `[from, to)` and the CRT pass only when the setting or the viewport
  changes.

See [conventions.md](conventions.md#performance-zero-allocation-in-hot-paths) for the full list of
boxing rules and the allocation guard's method.

## Budgets

The Tizen bundle is **383.4 KB** gzip of its 512 KB `APP_JS_GZIP_BUDGET` (374.6 KB at M3-01); the
budget was not touched. The CRT pass costs one full-screen filter pass at at most 1080 rows, the
Mode-7 floor one filter over one sprite while the camera is in range, and the aspect panels two
sprites.

## Running it

```bash
pnpm dev                                    # then open the URLs below
#   ?stage=dimension                        the pseudo-3D HIGH-SPEED DIMENSION stage
#   ?stage=dimension&skip=boss              straight to its first boss (SHADOW STRIDER)
#   ?loadout=full&stage=zone-a              a normal stage to try the extras on
pnpm test --filter @shmup/core blackhole    # the signature mechanic's suites
pnpm test:e2e -- mode7 display-options      # the Mode-7 and CRT / aspect screenshots
pnpm golden:update                          # re-bless the goldens (only with a reason)
```

Turn the extras on in **OPTIONS → EXTRAS** (they apply to the next game) and the picture settings in
**OPTIONS → DISPLAY** (they apply at once). The black-hole bomb needs the MANTA (the Direct-mode
ship): SHIP SELECT → MANTA, then pick up the stage's yellow items and press `Special`.

## Extending it

- **A Mode-7 floor on another stage**: add the `mode7` section to its stage file and an atlas sprite
  whose frame 0 tiles seamlessly. Nothing else changes — the simulation, the hash and the goldens
  are untouched.
- **Another CRT strength**: add a row to `CRT_FILTERS` (`core/config`) and a `CrtLook` to
  `CRT_LOOKS` in the same order, plus the label in the string table. The shader needs no change as
  long as the look is a combination of the three existing uniforms.
- **Another aspect**: add a ratio to `ASPECT_MODES` and `ASPECT_RATIOS` in the same order.
- **Another pull-field boss**: write a behaviour that calls `api.pull` / `api.release` and give its
  boss parts in the content. Remember that a field is applied in phase 2 and that a boss's death or
  slot reuse resets it for you.
- **Tuning the signature mechanic**: the constants of `core/blackhole` (radius, pull, bolt interval
  and damage, stock) are exported and covered by tests; changing one re-blesses
  `zone-a-extras.replay.json` and nothing else.

## Tests

| Suite | Covers |
|---|---|
| `core/test/blackhole/blackhole.test.ts`, `blackhole-edge.test.ts` | Stocking and throwing, the slot bookkeeping, the camera ride, the swallowed bullets, the burst's bolt cadence, the enemies and boss parts its lightning takes, the swirl's frames, a World with the option off, and the checkpoint-restart regression |
| `core/test/blackhole/blackhole-alloc.test.ts` | The allocation guard that found the boxed centre |
| `core/test/world/world-extras.test.ts`, `world-extras-edge.test.ts`, `world-extras-coop.test.ts` | The slowdown's determinism and tick-pipeline edges, the death-bomb window, one vortex per player crediting its thrower |
| `core/test/bullets/bullets-vortex-edge.test.ts`, `core/test/enemies/enemies-vortex.test.ts` | `vortex` / `grazePlayers` and `pullTowards` / `blast` edge cases |
| `core/test/bosses/bosses-pull.test.ts`, `bosses-pull-alloc.test.ts`, `core/test/behaviors/behaviors-p2-bosses.test.ts` | The pull field (including the slot-reuse regression) and the three P2 boss scripts |
| `core/test/scoring/scoring-graze.test.ts` | The graze value from the content's scoring rules |
| `core/test/stage/stage-mode7.test.ts`, `render-pixi/test/effects/mode7.test.ts`, `mode7-edge.test.ts` | The stage section and its view, the filter's uniforms and the floor's binding / rebinding |
| `render-pixi/test/effects/crt.test.ts`, `shaders.test.ts` | The CRT looks, the resolution cap, the pitch, and a GLSL ES 1.0 syntax check of both new programs (plus a real WebGL1 compile + link in Chromium) |
| `render-pixi/test/viewport/viewport-aspect.test.ts`, `renderer/renderer-wiring.test.ts` | The aspect windows and panels, and the renderer's wiring of all three |
| `core/test/scenes/scenes-extras-page.test.ts`, `scenes-escape.test.ts`, `core/test/data/campaign-escape.test.ts` | The EXTRAS page, the DISPLAY page's new rows, the escape sequence in the loader and through the flow |
| `core/test/debug/debug-extras-hash.test.ts` | `hashWorld`'s `mixExtras`, term by term |
| `test/integration/dimension-runtime.test.ts` | The whole dimension stage flown headlessly |
| `test/e2e/mode7.spec.ts`, `display-options.spec.ts` | Screenshots of the floor, the CRT settings and the aspect modes |
| `test/golden/zone-a-extras.replay.json` | Zone A with every extra on |

## Gotchas

- **The black hole is Direct-mode only.** `BlackHoleSystem.enabled` needs `GameConfig.blackHole`
  **and** a Direct-mode session; in meter mode `Special` still steers the Options. Every World has
  the system, so the wiring is uniform, but the meter ship's death bomb spends its `!` slot instead.
- **The bomb stock is not on the HUD yet.** The string table reserves `hudBombs` (`BOMB`), but no HUD
  row draws it; tests and the debug tools are how you see `PlayerShip.bombs` today.
- **A checkpoint restart must close the vortices.** `BlackHoleSystem.clear()` had no call site until
  a review round found it: an open vortex survived into the restarted session and discharged into the
  objects the checkpoint had just spawned. `clearSession` now calls it, next to `powerups.clear()`.
- **A boss slot must not inherit a pull field.** `enter()` resets ~30 fields but forgot
  `pullRadius` / `pullStrength` / `pullTicks`, and `freeSlot()` hands out any `None` / `Dead` slot —
  so a `boss.walker` reusing GRASPING BLOOM's slot sucked the ships in. Both `enter()` and the
  session `clear()` reset them now. Both fixes have regression tests that fail with the fix removed.
- **The floor tile must wrap.** The shader samples with `fract`; a tile whose art touches its last
  row or column shows a seam at every cell.
- **`EffectSettings.crt` is not the CRT setting.** That field predates the filter (M2-08 reserved it)
  and nothing reads it; the pass takes its setting from `PixiRenderer.setCrtFilter`, which the shell
  drives from the saved DISPLAY option (`applyDisplayOptions` at boot, `connectOptionEvents` live).
- **The CRT filter must never brighten.** Keep the shader multiplicative, or the flash limiter of
  `shmup_feat.md` §21 no longer bounds what reaches the screen.
- **Both meshes need `OES_element_index_uint`.** Pixi's `MeshGeometry` builds its index buffer as a
  `Uint32Array` however few vertices a quad has, so since M3-02d every frame's pass 2 — and the
  Mode-7 floor — depends on that WebGL1 extension. Pixi requests it with the context and the M7's
  Mali-G51 has it, but on a set that lacks it the symptom is a **black picture**, not a picture
  without effects. `crt-blit.test.ts` / `mode7-mesh.test.ts` pin the index type and
  `test/e2e/mode7.spec.ts` asserts a real WebGL1 context offers the extension.
- **The floor and the pass-2 container are the renderer's to free.** `bindWorld(null)` only hides
  the floor's mesh, so `PixiRenderer.destroy()` calls `mode7.destroy()`, `crt.destroy()` and
  `screen.destroy({ children: true })` explicitly; without them the `Mesh` / `MeshGeometry` /
  `Shader` / `GlProgram` and the two side-panel sprites outlive the renderer (found by M3-02d's
  tests, with a regression test in `renderer-wiring.test.ts`).
- **Aspect modes do not widen the playfield.** D19 fixes 384×216; `wide` gives a wide *cabinet*, not
  more visible stage. Anything else would change the simulation.
- **Re-blessing.** Any change to the four `GameConfig` fields' defaults, or to the header, re-blesses
  every golden. Say why in the commit message.

## Next steps that build on this page

M3-02b tunes the remote, the lifecycle and the frame pacing from the input-probe results
([input-probe-results.md](input-probe-results.md)); M3-03 brings the tracker music. Neither changes
anything on this page, but both share the picture options' plumbing (`UserOptions.display` →
`UserOptionKind` → `DisplayTarget`).

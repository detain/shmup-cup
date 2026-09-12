# FX and game feel: particles, shake, flash, dim and score popups

How a hit, a kill or a boss's death becomes something you *see* — explosions, sparks, debris,
bullet-cancel sparkles, the screen shake, full-screen flashes, the WARNING's dim and the rising
score numbers. Filled in by plan step **M1-14** on top of the sim-side requests of M1-12
([death-and-scoring.md](death-and-scoring.md#game-feel-corefx)) and the events every system
already pushed.

This page is the *how and why*. Exact signatures are in
[api-reference.md](api-reference.md#shmuprender-pixi); the TSDoc in the sources
(`packages/render-pixi/src/particles`, `effects`, `renderer`; `packages/shell/src/dispatch`,
`fx-gallery`, `boot`) is the authoritative reference. The preset *format* for authors is
[`content/fx/README.md`](../../content/fx/README.md).

Background: `shmup_feat.md` §18 (explosions larger than the sprite, hit flash, draw order —
bullets above explosions, integer screen shake with an off switch, pooled additive particles on
a cosmetic RNG), §20 (juice: sparks, clinks, popups), §21 (reduced flashing), §22 (budgets: 256
particles, no per-frame allocation, presentation fed by events); plan §3.3 (frame), §3.4
(render contract), §3.5 (content owners) and decisions **D26** (world space), **D28** (schema
combinators), **D30** (hit flash = white sibling sprite).

## The picture at a glance

```text
 @shmup/core (sim, pure)              @shmup/shell                    @shmup/render-pixi (renderer)
┌────────────────────────────┐    ┌──────────────────────────┐    ┌─────────────────────────────────┐
│ systems push events:       │    │ game.events.drain(       │    │ particles  (256-slot SoA pool,  │
│  Particles (FX_CUES)       │    │   dispatcher.visit)      │    │   FX layer, world px, ticks)    │
│  Sfx (SFX_CUES)            │───►│ connectFxEvents:         │───►│ effects    (shake, flash, dim — │
│  Shake / Flash / Dim       │    │  Particles → emitFxCue   │    │   pure state, simulated ticks)  │
│  Score (12, M1-14)         │    │  Sfx       → emitSfxCue  │    │ popups     (16 score numbers,   │
│  FormationBonus            │    │  Shake     → shake       │    │   FX layer, above particles)    │
│  BossDefeated              │    │  Flash     → flash       │    │                                 │
│ (whole-pixel world x / y)  │    │  Dim       → dim         │    │ render(frame): step by the tick │
└────────────────────────────┘    │  Score…    → popups.show │    │ delta, sync with the camera,    │
                                  └──────────────────────────┘    │ shake + flash + dim on top of   │
 content/fx/*.fx.json ──► loadFxContent (shell's `fx` owner) ────►│ frame.screen  (setFxContent)    │
                                                                  └─────────────────────────────────┘
```

The simulation never knows about any of it. It says *what happened* (an enemy exploded at
`(x, y)`, a shake of magnitude 2 for 20 ticks was requested) and goes on; the presentation
decides what that looks like, from data. Particles have their own RNG, are not part of
`hashWorld`, and a replay never depends on `content/fx/`.

## Which event draws what

`connectFxEvents(dispatcher, renderer)` (shell `dispatch`) registers these handlers — only in
**free flight**, the one scene that draws the World:

| Event (pushed by) | Handler | What you see |
|---|---|---|
| `Particles` (`id` = `FX_CUES`, `param` = intensity) — enemy deaths (M1-08), bullet cancel (M1-09), shield break (M1-11), the ship's death (M1-12), a boss's chain and blast (M1-13) | `particles.emitFxCue(id, x, y, param)` | The presets `content/fx/` binds to the cue: a fireball (+ sparks or debris), sparkles, the shield burst, the boss chain |
| `Sfx` (`id` = `SFX_CUES`) — every sound | `particles.emitSfxCue(id, x, y)` | Only for the sounds a trigger binds: `EnemyHit` → sparks, `Clink` → sparks bouncing back, `MeterAdvance` / `CapsulePickup` → the pickup ring at the ship, `PlayerShot` → a muzzle flash 9 px ahead of the shooter. Every other cue spawns nothing |
| `Shake` (`param` = magnitude px, `id` = ticks) — the ship's death (medium, 20), a boss's final blast (large, 40) | `effects.shake(param, id)` | The world layers jitter by whole pixels, decaying to 0 |
| `Flash` (`id` = `FlashKind`, `param` = ticks) — Mega Crash (12), each WARNING pulse (8), a boss's final blast (24) | `effects.flash(id, param)` | A full-screen flash over the playfield (under the HUD), in the kind's colour, fading linearly — unless the limiter drops it |
| `Dim` (`id` = level in percent, `param` = ticks) — the boss WARNING (50 %, 180) | `effects.dim(id / 100, param)` | The playfield darkens (fade in 8 ticks, hold, fade out 16) |
| `Score` (**new, 12**: `id` = player, `x` / `y` = where, `param` = points) — `core/scoring` for every credited kill, `core/bosses` for every destroyed part worth points | `popups.show(param, x, y, SCORE_POPUP_COLOR)` | A white number rising from the kill |
| `FormationBonus` (`param` = bonus, at the last kill) · `BossDefeated` (`param` = the tally, where the boss exploded) | `popups.show(…, BONUS_POPUP_COLOR)` | A gold number |

Positions go on as whole world pixels (`Math.floor(x) | 0`); the renderer applies the camera when
it draws. The other kinds (`Music`, `HitStop`, `Rumble`, `PowerUp`, `MusicDuck`) and the sounds
themselves stay unhandled until M1-15 — the dispatcher counts them in `unhandled`.

**Already sim-side** (nothing changed in M1-14): the **hit flash** — a system sets
`SpriteFlag.Flash` while an enemy's or part's `flashTicks > 0`, and the sprite binding swaps to
the atlas's white `<sprite>@flash` frame (D30) — and the **invulnerability blink** — the player
batch sets `SpriteFlag.Hidden` every other 4 ticks while a respawned ship is safe
([death-and-scoring.md](death-and-scoring.md)).

## Particle presets (`content/fx/`, kind `fx`)

A preset is one burst of particles of one atlas sprite; a **trigger** binds a preset to an event
cue. The whole format with every field and its range is in
[`content/fx/README.md`](../../content/fx/README.md); in short:

| Field | Meaning (default) |
|---|---|
| `id` | lower-case words joined by `.` / `-`, unique across files (first file in path order wins) |
| `sprite`, `frames` | atlas sprite; frame indices played evenly over each particle's life (all frames in order) |
| `count` | particles per burst, 1–64, × the event's intensity (1–4), 64 at most |
| `speed`, `direction`, `spread` | launch speed range px/tick; cone centre and width in degrees (0 = right, 90 = down; 0 / 360) |
| `gravity`, `drag` | px/tick² added to the vertical speed (0); fraction of the speed lost per tick (0) |
| `lifetime`, `delay` | whole-tick ranges; a delayed particle waits hidden before it appears (0) |
| `radius` | spawn anywhere within this many px of the burst's centre (0) |
| `blend` | `add` (glow) or `normal` (`add`) |

Triggers are `{ event: 'fx' | 'sfx', cue, preset, dx?, dy? }`: `fx` names an `FX_CUES` cue (the
`Particles` events), `sfx` an `SFX_CUES` cue (a sound that implies a visual). Binding sounds this
way kept the sim unchanged for hits, clinks, pickups and shots — they already pushed their sound
at the right place. A cue fires at most `MAX_TRIGGERS_PER_CUE` (4) presets.

**Validation** is `loadFxContent(files)` (render-pixi `particles`, core schema combinators —
D28), the owner of the `fx` kind: files in ascending path order; a file that fails the schema
contributes nothing; a preset with `min > max` in a range or a duplicate id is dropped; a trigger
naming an unknown cue or preset, or a fifth preset for one cue, is dropped — each with a
`<file>:<json path>` issue. `parseFxContent(data, path)` validates one document (README samples).
A missing sprite or an out-of-range frame index draws `ui/missing`; `pnpm content:check` runs
`fxSpriteNames` through `findMissingSprites`, so a typo fails the tests, not the picture.

**Ownership.** The shell's `DEFAULT_CONTENT_OWNERS` has `fx` → `loadFxContent(files).issues`, so
every host validates the kind; `bootShell` registers its own `fx` owner on top that also *keeps*
the parsed content (`Shell.fx`) and hands it to the renderer with `renderer.setFxContent(fx)`
before the scene is created. An app that passes its own `fx` owner in `contentOwners` replaces
the shell's — and the particles then get no presets. The repo root links `@shmup/render-pixi`
as a dev dependency so the content test can call the owner.

**The shipped file** `content/fx/particles.fx.json`:

| Preset | Sprite | Look | Bound to |
|---|---|---|---|
| `explosion.small` | `fx/explosion-small` | one fireball, 18 ticks | `ExplosionSmall` (+ `spark`) |
| `explosion.medium` | `fx/explosion-medium` | one fireball, 24 ticks | `ExplosionMedium` (+ `debris`) |
| `explosion.large` | `fx/explosion-large` | three fireballs within 8 px, staggered by up to 10 ticks | `ExplosionLarge` (+ `debris`), `BossBlast` |
| `boss.chain` | `fx/explosion-medium` | two scattered fireballs (12 px, 6-tick stagger) | `BossChain`, `BossBlast` |
| `debris` | `fx/debris` | six grey chunks, gravity 0.06, **normal** blending | `Debris`, `ExplosionMedium`, `ExplosionLarge`, `BossBlast` |
| `spark` | `fx/spark` | three quick sparks, drag 0.1 | `ExplosionSmall`; sfx `EnemyHit` |
| `clink` | `fx/spark` | four sparks thrown back left (cone 180° ± 60°) | sfx `Clink` |
| `bullet.cancel` | `fx/sparkle` | one pale-gold twinkle, 12–16 ticks | `BulletCancel` |
| `pickup` | `fx/ring` | one growing cyan ring, 12 ticks | sfx `MeterAdvance`, `CapsulePickup` |
| `muzzle` | `fx/spark` frames 0–1 | two tiny sparks forward (cone ± 30°), 3–5 ticks | sfx `PlayerShot` (`dx` 9) |
| `shield.break` | `fx/spark` | eight sparks in every direction | `ShieldBreak` |

`fx/sparkle` (5×5, 4 frames: a plus turning into an ×, then a dot — pale gold so it never reads
as a bullet) and `fx/ring` (9×9, radius 1…4, cyan fading to blue) are new procedural sprites in
`scripts/assets/procedural/particles.mjs` ([asset-pipeline.md](asset-pipeline.md)).

## The particle pool (`createParticleSystem`)

- **Storage.** `PARTICLE_CAPACITY` (256) particles in struct-of-arrays typed arrays (`x`, `y`,
  `vx`, `vy`, `age`, `life`, preset, spawn serial), packed in `[0, liveCount)`; a dead particle is
  replaced by the last live one. When the pool is full a new particle **recycles the oldest** (the
  smallest spawn serial) and `recycled` counts it. Presets are compiled by `setContent` into
  typed arrays (speeds, binary-angle cone, lifetimes, frame tables) and two cue tables
  (`MAX_TRIGGERS_PER_CUE` preset slots + offsets per FX and per SFX cue) — per event only array
  reads remain.
- **A burst.** `emit(preset, x, y, intensity)`: `count × clamp(floor(intensity), 1, 4)` (NaN → 1),
  at most 64 particles; an unknown or fractional preset index spawns nothing and returns 0.
  `emitFxCue` / `emitSfxCue` spawn every preset of the cue's row at `(x + dx, y + dy)`. Each
  particle draws, from the presentation RNG, a point within `radius`, an angle in the cone (1024
  binary units per turn, `sinB` / `cosB` tables of the core), a speed, a lifetime and a delay.
- **Space.** Particles live in **world pixels** (D26). `sync(camera)` converts at draw time —
  `round(x − camera.x) − anchorX`, `round(y − camera.y) + PLAYFIELD_Y − anchorY` — so an explosion
  stays on the ground it happened on while the stage scrolls. (Converting at spawn would pin it
  to the screen.)
- **Time.** `step(ticks)` advances by **simulated ticks** (at most `MAX_PARTICLE_STEP` = 60 a
  call): a waiting particle counts its delay down; the others age, move by their velocity, then
  `vx *= 1 − drag`, `vy = (vy + gravity) · (1 − drag)`, and die when `age + 1 ≥ life`. A particle
  emitted between two steps first appears on the next step at its spawn point (age 0). The frame
  shown is `frames[floor(age · frameCount / life)]`.
- **Drawing.** Two preallocated sprite sets of `capacity` sprites each — normal blending, then
  additive (`blendMode = 'add'` set once at creation: changing a sprite's blend mode makes Pixi
  rebuild its render group) — inside one container on the `FX` layer. `sync` fills the sets in
  pool order and hides what the previous sync used beyond that; `visibleCount` reports the total.
- **Randomness.** The core's sfc32 seeded with `options.seed` (the shell passes
  `(gameConfig.seed ^ 0x2545f491) >>> 0`, a stream of its own), stepped on an `Int32Array` state
  and returning **16-bit** draws — see [the hot-path rules](#zero-allocation-and-the-hot-path-rules).
  The same seed and event sequence always draw the same particles; the sim's streams are never
  touched.

## Screen effects (`createScreenEffects`)

`ScreenEffects` is pure state (no Pixi, a class — its fractional fields stay unboxed) advanced by
simulated ticks with `step(ticks)`; the renderer reads `shakeX`, `shakeY`, `flashAlpha`,
`flashColor` and `dimAlpha` every frame.

- **Shake.** `shake(magnitude, ticks)` mirrors the sim's `requestShake` exactly: magnitudes
  floored and capped at 64, durations at 600; ignored when either rounds to 0 or the running shake
  is at least as strong *now*. The amplitude is `ceil(magnitude · ticksLeft / duration)`; like the
  sim, a request is not counted down on its own tick (the first `step` only clears its "fresh"
  mark), so at one tick per frame `shakeAmount` equals the sim's `shakeAmount(world.fx)` on every
  frame (a test checks it through the whole test boss fight). The offset is the amplitude times a
  fixed 8-step pattern (`SHAKE_PATTERN_X` = `[1, −1, 1, 0, −1, 1, −1, 0]`, `SHAKE_PATTERN_Y` =
  `[0, 1, −1, 1, 0, −1, 1, −1]`), so the same shake always looks the same. `settings.screenShake
  = false` is the **global off switch**: `shakeX` / `shakeY` become 0 at once while the
  amplitude is still tracked.
- **Flash.** `flash(kind, ticks)` looks the kind up in `FLASH_LOOKS` — `MegaCrash` white 0.85,
  `Warning` red `0xf85858` 0.35, `BossBlast` white 1.0 (unknown kinds `DEFAULT_FLASH_LOOK`, white
  0.6) — and fades linearly from that opacity to 0 over `ticks`. The **limiter**
  (photosensitivity, `shmup_feat.md` §21) keeps the start clocks of the last `FLASH_LIMIT` (3)
  accepted flashes in a ring: a flash is dropped (and counted in `flashesSuppressed`) when the
  oldest of the last `limit` starts is less than `FLASH_WINDOW_TICKS` (60) old — so at most 3
  flashes start in any second. `settings.reduceFlashing` lowers `limit` to 1 and caps every
  flash at `REDUCED_FLASH_ALPHA` (0.25); it can be toggled at run time. A dropped flash takes no
  slot. The WARNING's three pulses (60 ticks apart) pass even with reduced flashing.
- **Dim.** `dim(level, ticks)` (level clamped 0…1, hold capped at 600) replaces the running dim:
  it rises by `level / DIM_FADE_IN_TICKS` (8) a tick while the hold lasts, then falls by
  `level / DIM_FADE_OUT_TICKS` (16) a tick to 0.
- `clear()` stops everything and resets the limiter; `settings` is the object passed at creation
  (copied from `PixiRendererOptions.effects` / `ShellOptions.effects`, defaults
  `DEFAULT_EFFECT_SETTINGS`: shake on, normal flashing, CRT off — the CRT field waits for M3-02).

## Score popups (`createScorePopups`)

`SCORE_POPUP_SLOTS` (16) numbers in the pixel font. `show(points, x, y, color)` takes a free slot
or replaces the **oldest** popup; points are floored, below 1 (or NaN) nothing shows. A popup
lives `SCORE_POPUP_TICKS` (40) simulated ticks: drawn centred on its x, risen one pixel every 4
ticks, kept inside the playfield (x within 12 px of the edges, y between the HUD bars), and
blinking (hidden every other 2 ticks) during its last 10. At most 8 digits are drawn — as many as
`MAX_SCORE` has.

Colours: `SCORE_POPUP_COLOR` `0xf8f8f8` for `Score` events, `BONUS_POPUP_COLOR` `0xf8d030` (gold)
for a formation's bonus and a boss's tally. Capsule pickups push no `Score` event — the popup
would cover the ship; their feedback is the ring and (M1-15) the meter's ding.

**Where the points come from.** `SimEventKind.Score` (12) is new in M1-14: `core/scoring` pushes
one for every credited kill worth at least 1 point (`id` = the player, `x` / `y` = the kill,
floored; `param` = the points), `core/bosses` one for every destroyed part with a score (the
part's centre). Kills credited to nobody (tools), bonuses and pickups push none. It is
presentation-only: nothing in the sim reads it, and it is not hashed.

## Draw order and overlays

| Where | What |
|---|---|
| `FX` layer (9, world group) | the particles' normal set, their additive set, then the popups — above ships, shots and items, **below `ENEMY_BULLETS`** (10), so a bullet is never hidden by an explosion (`shmup_feat.md` §18; a renderer test checks the order) |
| world group, above every world layer | the **playfield dim** (new, black) and then the **flash** quad, both 32 px larger than the frame on each side so the shake never uncovers an edge |
| `UI` layer, first child | the menu dim (`frame.screen.dim`), under the UI list — unchanged |
| `HUD`, `UI`, `DEBUG` | never shaken |

## One frame in the renderer

The renderer owns `particles` (`null` without an atlas), `popups` (`null` without an atlas font)
and `effects`. `render(frame)`:

1. computes the ticks since the last frame from `frame.tick` — 0 on the first frame and while
   paused; a tick counter that goes **back** (a new session, a test resetting the game) clears
   every effect, particle and popup; a gap over 60 ticks (a hitch) is cut to 60;
2. steps `effects`, `particles` and `popups` by those ticks;
3. binds / syncs the world as before, and syncs particles and popups with the world's camera
   (`{ x: 0, y: 0 }` for a frame without a world);
4. offsets the world group by `round(frame.screen.shakeX) + effects.shakeX` (same for y) — whole
   pixels; the game's own `frame.screen` is all zeros today, the event-driven effects are what
   moves;
5. shows the flash at the brighter of `frame.screen.flash` (white) and `effects.flashAlpha` (the
   kind's colour) — the quad's tint is written only when it changes, since Pixi's tint setter
   allocates; sets the playfield dim from `effects.dimAlpha` and the menu dim from
   `frame.screen.dim`.

`PixiRendererOptions` gained `effects` (settings), `fxSeed` (default 1) and `particleCapacity`
(default 256); `setFxContent(content)` passes the presets to the pool.

## The shell's wiring

`bootShell` (M1-14 additions):

- keeps the `fx` content its owner validated (`Shell.fx`) and calls `renderer.setFxContent(fx)`
  after creating the renderer (with `fxSeed` from the game's seed and `effects` from
  `ShellOptions.effects` — neither app passes settings yet, so shake is on and flashing normal);
- in **free flight** calls `connectFxEvents(events, renderer)`; the showcase, calibration and
  gallery scenes do not draw the World, so their events stay unconnected;
- `?scene=fx-gallery` creates the gallery (below).

`connectFxEvents(dispatcher, fx)` takes anything with `particles`, `effects` and `popups`
(`FxTargets` — a `PixiRenderer` is one; `null` particles or popups skip those handlers) and
returns an idempotent function that unregisters every handler. Registering allocates the
handlers (load time); handling an event allocates nothing.

## The fx gallery (`?scene=fx-gallery`)

A presentation-only dev scene (shell `fx-gallery`, `createFxGallery(renderer)`) for judging and
tuning presets without playing to the event that spawns them. Over a still starfield (its own
sprite table `FX_GALLERY_SPRITES`, camera fixed at 0, 0) it cycles through **stations** of
`FX_GALLERY_STATION_TICKS` (60) ticks: every preset in content order — bursting at the
playfield's centre three times per station (every 20 ticks) — then `FX_GALLERY_EXTRAS`: shake
small / medium / large (40 ticks each), the Mega Crash, WARNING and boss-blast flashes, the dim
(0.5 for 30 ticks) and a row of white and gold popups. The UI list names the station
(`3/19  EXPLOSION.LARGE` with the shipped 11 presets — 19 stations, a 19-second cycle); the top
bar says `FX GALLERY`, the bottom one `?SCENE=FX-GALLERY`.

It drives the renderer's `particles`, `effects` and `popups` directly; the game's World keeps
running unseen. Station timing follows the game's tick, so it pauses with the game, and a pulse
is due when its first tick is reached — a frame running several ticks never skips a burst.
Labels are built once; changing station swaps one string slot. On the TV the widget has no query
string, so the gallery is a browser tool (`pnpm dev`, `vite preview`, or the Tizen build opened
with `?scene=fx-gallery`).

## Determinism

Nothing here feeds back into the simulation: the pool and effects read events and the camera,
never write sim state. `hashWorld` is unchanged (the `Score` event is not state; the sim's
`FxState` timers were hashed since M1-12). The presentation RNG is separate from the World's
streams, so tuning a preset never shifts a replay. A given seed and event sequence still draws
identical particles — handy for screenshots and the particle tests.

## Zero allocation and the hot-path rules

Everything is created by `createParticleSystem`, `setContent`, `createScreenEffects`,
`createScorePopups` and `connectFxEvents` (load time). Per event and per frame only numbers are
written and existing textures assigned. The allocation guards found these traps (see also
[conventions.md](conventions.md#performance-zero-allocation-in-hot-paths)):

| Trap | Fix |
|---|---|
| The RNG's four words in closure `let`s leave V8's small-integer range and are boxed on every draw; a 32-bit result returned from a call is boxed too | State in an `Int32Array`, draws return 16 bits (`t >>> 16`) |
| A fractional x from an event passed to a call V8 does not inline allocates | The handlers pass `Math.floor(x) \| 0`; `spawn` never branches between the caller's integer x and a fractional sum |
| `Math.round` can return `-0`, a heap number | `(Math.round(…) - anchor) \| 0` for sprite positions |
| A fractional value returned from a getter the renderer calls every frame is boxed | `flashAlpha` is a field updated by `flash()` / `step()`, not a getter |
| One shared, ordered quad pool for all popups: a popup blinking, appearing or expiring moved the later glyphs onto other quads, re-tinting them — Pixi's tint setter allocates (≈ 1 MB per 10,000 frames with a gold bonus among white popups; found by the test pass) | One 8-quad pool per popup slot: a quad changes tint only when a popup of another colour takes the slot |
| Changing a sprite's `blendMode` rebuilds Pixi's render group | Separate normal and additive sprite sets, blend set once |

The guard of the whole event path (dispatch → particles / effects / popups, step + sync on the
real atlas and shipped presets) lives in its own file,
`packages/shell/test/dispatch/dispatch-fx-alloc.test.ts`, away from suites that build many
objects.

## Extending it

| To add | Do this |
|---|---|
| A preset | An entry in `content/fx/*.fx.json` (a new file works too), a trigger binding it; check it in `?scene=fx-gallery`; `pnpm content:check` validates it and its sprite |
| A visual for an existing sound | An `sfx` trigger naming the `SFX_CUES` cue — no code |
| A new particle cue | Append to `FX_CUES` in `core/events` (never renumber), push `SimEventKind.Particles` with it from the system (whole-pixel x / y), bind it in `content/fx/` |
| A particle sprite | A `*.sprite.json` pixel map or a procedural generator ([asset-pipeline.md](asset-pipeline.md)); name it in `sprite` |
| A flash kind | Append to `FlashKind` / `FLASH_KIND_TICKS` in `core/fx` and its look to `FLASH_LOOKS` (same index); unknown kinds fall back to `DEFAULT_FLASH_LOOK` |
| A popup for another event | A handler in `connectFxEvents` calling `popups.show(points, x, y, color)`, or a `Score` event pushed by the system |
| A user setting | `EffectSettings` (render-pixi `effects`) — the Options screen (M1-17 / M2-16) will set `screenShake` / `reduceFlashing` through `ShellOptions.effects` or `renderer.effects.settings` |

## Tests

| Where | Covers |
|---|---|
| `packages/render-pixi/test/particles/particles*.test.ts` | Every schema bound with its issue path, inverted ranges, duplicates within / across files, triggers across files, unknown cues / presets, the per-cue cap, file-order independence, frozen results, defaults; the shipped presets fit the pool and bind only the sounds that imply a visual; capacity checks, intensity clamping and the 64 cap, step clamping and the 60-tick cut, lifetime / delay ranges, cone / speed / radius / gravity, recycling of the oldest, `ui/missing`, whole pixels without `-0`, seeds, no `Math.random`, pool reuse without allocation, fractional preset indices (the bug the test pass fixed) |
| `packages/render-pixi/test/effects/effects*.test.ts` | Shake accepted and decayed like the sim's `requestShake` / `tickFx` over long seeded request sequences, caps, the pattern, the off switch; the flash timer, the limiter's window edge, refusals taking no slot, reduced flashing at run time; dim clamping and fade-out; popup lifetime, rise, clamp, blink, oldest replaced, digit budget, no re-tint between frames, no allocation |
| `packages/render-pixi/test/renderer/renderer-fx*.test.ts` | The renderer's ownership (no atlas / no font), options passed through, the first frame never steps, the 60-tick cut, clear on a tick going back, flash tint composition, whole-pixel shake, the two dims, popups through the camera, the draw order (enemy bullets above the FX layer, items below), rebinding, destroy, per-frame allocation with everything running |
| `packages/shell/test/dispatch/dispatch-fx*.test.ts` | The event → handler table, flash floods, weaker shakes, `Dim` percent, floored positions, double connections, disconnecting mid-drain; the allocation guard (`-alloc`); an end-to-end run on the shipped content (`-runtime`): test-range kills burst and pop, and through the test boss fight the drawn shake / flash equal the sim's `shakeAmount` / `flashTicks` on every tick, the dim during the WARNING, nothing dropped by the limiter |
| `packages/shell/test/fx-gallery/fx-gallery*.test.ts` | Stations and labels, bursts per pulse (4-tick frames never skip one), joining mid-way, restarting, the starfield, the shipped presets, zero allocation per frame |
| `packages/shell/test/boot/`, `loader/` | `DEFAULT_CONTENT_OWNERS` has `fx` (bad presets reported with their paths); the shell keeps the content (`Shell.fx`) and hands it to `setFxContent`, `fxSeed` from the game's seed, free flight fed by the World's events, `?scene=fx-gallery` driving the particles directly |
| `packages/core/test/scoring/scoring-events.test.ts`, `bosses/bosses-edge.test.ts` | `Score` events: once per kill, between-tick kills, whole points and pixels, none for bonuses / pickups / anonymous kills, not hashed; boss parts |
| `test/integration/content.test.ts` | The shipped and example `fx` files validate through the owner; their sprites exist in the atlas |
| `test/e2e/fx-gallery.spec.ts` | `?scene=fx-gallery` in the web build and the Tizen build from disk: the station label and warm, additively blended fireball pixels in the playfield's middle (the screenshot is attached to the report); no console errors or atlas warnings |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| No particles at all | The renderer never got presets (`setFxContent`) — a custom boot, or an app `fx` owner in `contentOwners` that replaced the shell's; or no atlas was given (`renderer.particles === null`) |
| Particles in the gallery but none in a stage | Only free flight connects the World's events (`connectFxEvents`); a custom scene must connect them itself |
| A preset shows magenta squares | Its sprite or a `frames` index is not in the atlas; `pnpm content:check` names it |
| An explosion slides with the screen instead of staying on the ground | Something converted the position to screen space at spawn; events must carry world pixels — the camera is applied in `sync` |
| Particles freeze | The game is paused (they run on simulated ticks) — intended |
| All particles and popups vanished at once | `frame.tick` went back (a new game, a reset in a test): the renderer clears them |
| A flash did not show | The limiter dropped it (`effects.flashesSuppressed` counts them): at most 3 starts per 60 ticks, 1 with reduced flashing |
| The shake is weaker than requested | A stronger shake was still running (a weaker request is ignored, as in the sim) — or `settings.screenShake` is off |
| The HUD shakes | It must not: only the world group is offset. Check a custom layer was not added to `layers.world` |
| Bullets hidden by explosions | A layer changed order: particles belong on `FX` (9), below `ENEMY_BULLETS` (10) |
| No popup for capsules | Intended — the popup would cover the ship; the ring shows the pickup |
| Fewer muzzle flashes or clink sparks than shots | The weapon system pushes each of its sounds at most once per `SFX_RATE_TICKS` (4) ticks, at whichever shooter fired — the visual follows the sound |
| An allocation guard creeps up after touching this code | A tint written every frame, a fractional argument to a non-inlined call, a getter returning a fraction, or a new closure / literal in `emit`, `step` or `sync` — see the table above |

## Next steps that build on this page

- **M1-15** — the sounds of the same events (the `Sfx` / `Music` / `MusicDuck` handlers on the
  dispatcher), the WARNING siren, rumble.
- **M1-16** — the HUD's power meter with the `PowerUp` flash; scenes other than free flight that
  draw the World connect the effects too.
- **M1-17 / M2-16** — the Options screen sets `screenShake` and `reduceFlashing`.
- **M2-02** — bullet cancel into points (popups for the points).
- **M2-08** — raster / scanline effects, palette swaps and cycling (`effects` → implemented).
- **M3-02** — the CRT filter (`EffectSettings.crt`).

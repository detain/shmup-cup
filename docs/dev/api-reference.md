# Public API reference

Every export that exists today, grouped by package and module. The source TSDoc is the
authoritative, detailed reference (parameters, return values, `@remarks`, examples) —
this page is the map. Placeholder modules only declare types; they are listed at the end
of each package with their planned functions.

Conventions used below: `→` = returns; *reused* = the function returns the same object
every call (do not keep it); all masks are `ActionMask` (`number`).

## `@shmup/core`

Entry: `packages/core/src/index.ts`. Pure TypeScript, safe to import anywhere (Node,
browser, TV).

### `platform` — host contract

| Export | Kind | Summary |
|---|---|---|
| `Platform` | interface | `id`, `input`, `storage`, `audio`, `lifecycle`, `exit` (`(() => void) \| null`), `display`, `caps` |
| `PlatformId` | type | `'web' \| 'tizen' \| 'electron' \| 'webos' \| 'android' \| 'headless'` |
| `PlatformInput` | interface | `poll(): InputSnapshot` — exactly once per tick, *reused* snapshot |
| `PlatformStorage` | interface | `get(key): Promise<string \| null>`, `set(key, value): Promise<void>` |
| `PlatformAudio` | interface | `unlock(): Promise<void>` |
| `PlatformLifecycle` | interface | `onSuspend(cb)`, `onResume(cb)` (no unregister) |
| `PlatformDisplay` | interface | `cssWidth`, `cssHeight` |
| `PlatformCaps` | interface | `gamepad`, `remoteOnly`, `webgl2` |
| `createMemoryStorage(initial?)` | function | → `PlatformStorage` backed by a `Map` |
| `createHeadlessPlatform(display?)` | function | → `HeadlessPlatform`: no devices, memory storage, `exit: null` |
| `HeadlessPlatform` | interface | `Platform` + `snapshot` (tests mutate it), `suspend()`, `resume()` |

### `input` — actions and snapshots

| Export | Kind | Summary |
|---|---|---|
| `Action` | const | Bits: `Up 1, Down 2, Left 4, Right 8, Shot 16, Sub 32, PowerUp 64, Special 128, Speed 256, Pause 512, Confirm 1024, Back 2048` |
| `ActionName`, `ActionMask` | types | `keyof typeof Action`; OR of `Action` bits |
| `ACTION_NAMES` | const | Names in bit order (debug overlays, rebinding UI) |
| `MAX_PLAYERS` | const | `2` |
| `InputDeviceKind` | type | `'none' \| 'keyboard' \| 'remote' \| 'gamepad'` |
| `PlayerInput` | interface | `held`, `pressed`, `released`, `device` |
| `InputSnapshot` | interface | `players: PlayerInput[]` (length `MAX_PLAYERS`) |
| `createInputSnapshot()` | function | → fresh idle snapshot (allocate once) |
| `resetInputSnapshot(s)` | function | Clears masks in place (keeps `device`) |
| `commitPlayerInput(p, held, latched = 0)` | function | Writes one tick; derives `pressed = newly held ∪ latched`, `released = previously held − held` |
| `copyInputSnapshot(src, dst)` | function | Allocation-free copy (replays) |
| `hasAction(mask, action)` | function | → `true` if any bit of `action` is set |
| `InputContext`, `INPUT_CONTEXTS` | type, const | `'game' \| 'menu'` — which binding table the input adapters use (decision D15); `['game', 'menu']`. Presentation routing only, never recorded in replays |

### `config` — session configuration

| Export | Kind | Summary |
|---|---|---|
| `GameConfig` | interface | `internalWidth` 384, `internalHeight` 216, `tickRate` 60, `maxTicksPerFrame` 4, `seed`, `difficulty`, `powerUpMode`, `deathPenalty` (`'classic'`; what a death costs — `core/powerups` `applyDeathPenalty`, M1-12; not validated at runtime), `startingLives` 3 (ships including the one in play, 1–5), `autofire`, `remoteMode`, `stage` (a `content/stages/` id, or `null` = open space; the apps' scene flow passes `@shmup/shell` `defaultStageId` — zone A — since M1-18), `stageSkip` (`'none'` — the debug stage skip: `'boss'` starts every World of the session `BOSS_SKIP_LEAD` px before its first `warning` / `boss` event via `core/debug` `skipToBoss`; sim-affecting, M1-18), `aimDirections` (32 — the directions aimed enemy shots snap to, D17; a power of two 4–1024), `autofireInterval` (4) / `missileInterval` (10) — ticks between main shots / missile launches under autofire, 1–60, a weapon's own `refireTicks` overrides them (M1-10), `loadout` (`'default'` — the starting loadout, `core/weapons` `applyLoadoutPreset`; `'full'` is the web app's `?loadout=full`), `autoPowerUp` (false — D2), `autoPowerUpOrder` (`DEFAULT_AUTO_POWER_UP_ORDER`, ≤ 32 `MeterSlotName`s), `pickupMagnet` (true — D33) (M1-11; `powerUpMode` is `'meter'` — `'direct'` waits for M2-05) |
| `DEFAULT_GAME_CONFIG` | const | Frozen defaults (remote-first: `autofire` and `remoteMode` true — remote mode forces autofire, so every build fires without a button — the `'meter'` power-up mode (D1, since M1-11), `'classic'` penalty, `'normal'`) |
| `resolveGameConfig(overrides?)` | function | → frozen, validated config; throws `RangeError` for out-of-range integers, an `aimDirections` that is not a power of two, a `stage` that is neither `null` nor a non-empty string (whether the id exists is checked by `createWorld`), a `stageSkip` other than `'none'` / `'boss'` (M1-18), a `loadout` other than `'default'` / `'full'`, a `powerUpMode` other than `'meter'` (`'direct'`: "not implemented until M2-05"), or an `autoPowerUpOrder` that is not an array of at most 32 slot names (the result holds a frozen copy) |
| `PowerUpMode`, `DeathPenaltyPreset`, `DifficultyPreset`, `StartingLoadout`, `StageSkip` | types | `'meter' \| 'direct'`; `'arcade' \| 'classic' \| 'casual'`; `'easy' \| 'normal' \| 'hard' \| 'arcade'`; `'default' \| 'full'` (M1-10); `'none' \| 'boss'` (M1-18) |
| `MeterSlotName`, `METER_SLOT_NAMES` | type, const | The seven power-meter slots in meter order (M1-11): `'speed' \| 'missile' \| 'double' \| 'laser' \| 'option' \| 'shield' \| 'mega'` (`?` = `shield`, `!` = `mega`); the frozen list (index = `core/powerups` `MeterSlot` code) |
| `DEFAULT_AUTO_POWER_UP_ORDER`, `MAX_AUTO_POWER_UP_ORDER` | const | `speed, missile, laser, option ×4, shield`; `32` |
| `HUD_BAR_HEIGHT`, `PLAYFIELD_Y`, `PLAYFIELD_W`, `PLAYFIELD_H` | const | Screen layout (decision D20): `8`, `8`, `384`, `200` — two 8-px HUD bars outside a 384×200 playfield; world `y` maps to screen `y − camera.y + PLAYFIELD_Y` |
| `UserOptions`, `AudioOptions`, `InputOptions`, `DisplayOptions` | interfaces, type | The player's **presentation-only** options (M1-17; not in `GameConfig`, replays or hashes; persisted by `save`): `audio { master, music, sfx }` (levels `0…VOLUME_LEVELS`), `input { profileId }` (a `content/input/` key / remote profile id, or `null` = the platform's default), `display` (`{}` until M2-08 / M2-16) |
| `DEFAULT_USER_OPTIONS`, `VOLUME_LEVELS` | const | Frozen defaults: every volume `10` (the mix the audio content was made for), `profileId: null`; `10` — the sliders' top level |
| `resolveUserOptions(value)` | function | → frozen, valid `UserOptions` from anything, falling back to the defaults field by field — never throws: finite volumes rounded and clamped to 0–10 (never `-0`), other values → default; `profileId` must match `INPUT_PROFILE_ID_PATTERN` and be ≤ 64 characters, else `null` |
| `volumeGain(level)` | function | → the linear bus gain `(level / 10)²` (clamped; NaN → 0): 10 → 1, 5 → 0.25, 0 → silent — for `IAudio.setBusVolume` |
| `InputProfileChoice`, `INPUT_PROFILE_ID_PATTERN` | interface, const | One entry of the Options screen's CONTROLS: `{ id, label }` (label upper case, e.g. `SAFE 4-WAY (DEFAULT)`); `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` |

The user options' guide: [saves-and-options.md](saves-and-options.md#user-options-coreconfig).

### `loop` — fixed timestep

| Export | Kind | Summary |
|---|---|---|
| `createFixedStepLoop({ tickRate, maxTicksPerFrame, onTick, snapToleranceMs? })` | function | → `FixedStepLoop`; throws `RangeError` for `tickRate ≤ 0` or cap `< 1` |
| `FixedStepLoop` | interface | `stepMs`, `alpha`, `totalTicks`, `advance(nowMs) → ticks run`, `reset()` — none of them allocates (the fractional times live in a `Float64Array`) |
| `FixedStepLoopOptions` | interface | Options above |
| `DEFAULT_SNAP_TOLERANCE_MS` | const | `1` |

### `game` — composition root

| Export | Kind | Summary |
|---|---|---|
| `createGame(platform, overrides?, content?, options?)` | function | → `Game`; registers suspend/resume handlers on the platform. `content` defaults to `EMPTY_CONTENT_DB`; `options` is `GameOptions` (M1-16). Throws `RangeError` for invalid overrides or an `overrides.stage` the content does not have |
| `GameOptions` | interface | `scenes?: 'boot' \| 'title' \| 'game' \| null` (M1-16) — run the `core/scenes` flow from that scene (`'boot'` waits for `game.scenes.finishBoot()` — the shell's default; `'title'`; `'game'` straight into a game — dev, tests); omitted / `null` = **bare gameplay** (one World from creation, `stepWorld` every tick, nothing reacts to its status — the tests, tools and the shell's dev scenes). `save?: SaveStore \| null` (M1-17 — the flow's save: the Options screen's options, the title's HI, finished games recorded; omitted = a memory-only store with the defaults), `inputProfiles?: InputProfileSetup \| null` (M1-17 — what CONTROLS offers and the profile in use; omitted = CONTROLS disabled); both ignored for bare gameplay. Not recorded in replays |
| `Game` | interface | `config`, `content`, `platform`, `events` (one `EventQueue` for the whole session — every World pushes into it via `WorldOptions.events`, and so do the scene flow's menu sounds and music; the host drains it once per frame), `world` (getter: bare gameplay — the session's `World`; with the flow — the game scene's World, **a new object per game start and RETRY STAGE**, a placeholder before the first; only `step()` advances it), `scenes` (the `SceneFlow` or `null`), `state`, `inputContext` (getter: `'game'` for bare gameplay, else the top scene's context), `step()` (one `platform.input.poll()`, then `stepWorld` — or `scenes.tick(input)`), `frame(nowMs) → ticks`, `renderFrame()` (*reused* `RenderFrame`; bare gameplay: `world` = `game.world.view`, empty `hud` / `ui` draw lists; with the flow: `flow.updateFrame()` then `world` = the World's view while the game scene is visible (else `null`), `tick` = the World's tick then (frozen under overlays, 0 for a new World) else the flow's tick count, `hud` = the game scene's HUD list, `ui` = every visible scene's widgets, `screen.dim` = the top scene's dim), `pause()` / `resume()` (a host-level freeze — the pause *menu* is a scene). A platform resume also calls `scenes.onResume()` (pause menu over a running game) |
| `GameState` | interface | `tick`, `paused`, `suspended`, `input` (last snapshot) |

### `presentation` — back-end contracts and the render contract

The per-frame contract between the simulation and a renderer (plan §3.4). Guide:
[rendering-and-shell.md](rendering-and-shell.md).

| Export | Kind | Summary |
|---|---|---|
| `IRenderer` | interface | `width`, `height`, `resize(cssW, cssH)`, `render(frame)`, `destroy()` |
| `RenderFrame` | interface | `tick`, `alpha`, `world: WorldView \| null`, `hud: DrawList`, `ui: DrawList`, `screen: ScreenView` — *reused* by the game |
| `WorldView` | interface | `camera: CameraView { x, y }`, `parallax: ParallaxView \| null`, `terrain: TerrainView \| null`, `batches: SpriteBatchView[]`, `lasers?: LaserView \| null` (M1-09), `warning?: WarningView \| null` (M1-13 — drawn by the host, not the renderer) — `batches` and the structure of the others are read once when a renderer binds the view |
| `LaserView` | interface | The enemy lasers (M1-09), drawn on `EnemyBullets`: `capacity`, `count`, per slot `x`, `y` (world origin), `angle` (binary units), `length`, `width` (**drawn** width; 0 = the 1-px telegraph line), `spriteId` (the beam strip), `flags` (`SpriteFlag`; `Hidden` = the warning line's blink) — live sim arrays (`core/bullets` `BulletSystem.laserView`) |
| `WarningView` | interface | The boss WARNING (M1-13): `active`, `ticks` (since it started), `duration` (180), `text` (lines split at `\n`; built once per boss at world creation from the game's own template, D10 — `''` before the first WARNING) — a live object (`core/bosses` `WarningState`); a host draws it into its UI list, setting a string slot only when `text` changed |
| `SpriteBatchView` | interface | `layer`, `capacity`, `count`, per slot `x`, `y` (world pixels of the anchor), `spriteId` (sprite name table index), `frame`, `flags` — `ArrayLike<number>`, so SoA pools implement it directly |
| `SpriteBatch` | interface | Writable batch with canonical arrays (`Float64Array` x/y, `Uint16Array` spriteId/frame, `Uint8Array` flags) |
| `createSpriteBatch(layer, capacity)` | function | → empty `SpriteBatch`; throws `RangeError` for a non-positive capacity or an unknown layer |
| `pushSprite(batch, x, y, spriteId, frame, flags = 0)` | function | Appends a slot → its index, or `-1` when full; never allocates |
| `SpriteFlag` | const + type | `FlipX 1`, `FlipY 2`, `Hidden 4` (blink), `Flash 8` (draw the `<sprite>@flash` sibling, D30) |
| `LayerId` | const + type | Draw order `BgFar 0, BgMid 1, Terrain 2, GroundEnemies 3, AirEnemies 4, PlayerShots 5, Player 6, Hitbox 7, Items 8, Fx 9, EnemyBullets 10, Hud 11, Ui 12, Debug 13` — append, never renumber |
| `LAYER_COUNT`, `LAYER_NAMES` | const | `14`; `'BG_FAR'` … `'DEBUG'` by code |
| `ParallaxView` | interface | The stage's background bands (drawn since M1-07): `count`, per band `layer` (`BgFar` / `BgMid`), `spriteId` (frame 0, repeated), `offsetX` (`0 ≤ offsetX < spacing`), `y` (playfield row after the vertical scroll), `spacing` (repeat distance) — `core/stage` `updateParallaxView` fills it |
| `TerrainView` | interface | The stage's tile terrain: `tileSize`, `cols`, `rows`, `tiles` (row-major tile ids, 0 = empty — live, re-read as cells scroll in), `tilesetSpriteId`, `tileFrame` (tile id → frame of the tileset sprite, `-1` = not drawn) |
| `ScreenView` | interface | `shakeX`, `shakeY` (px, rounded by the renderer), `flash` (0…1 white over the playfield), `dim` (0…1 black under the UI) |
| `createDrawList(capacity = 256, stringCapacity = 32)` | function | → `DrawList`; throws `RangeError` for non-positive capacities |
| `DrawList` | interface | Column-wise typed arrays `op, x, y, w, h, color, alpha, ref, frame, flags, value` + `strings`; `count`, `dropped`, `revision`; `clear()`, `rect()`, `sprite()`, `text(slot, …)`, `number(value, …, minDigits)`, `setString(slot, text) → changed` (`text`/`setString` throw `RangeError` for a bad slot). Commands return their index or `-1` when full |
| `DrawOp`, `TextAlign` | const + type | `Rect 1, Sprite 2, Text 3, Number 4`; `Left 0, Center 1, Right 2` |
| `DEFAULT_DRAW_LIST_CAPACITY`, `DEFAULT_DRAW_LIST_STRINGS` | const | `256`, `32` |
| `TextMetrics` | interface | `measure(text, fontId)` (widest line; throws `RangeError` for an unknown font), `lineHeight` — implemented by render-pixi `text` (core `ui` re-exports it) |
| `IAudio` | interface | `state`, `unlock()`, `suspend()`, `resume()`, `setBusVolume(bus, 0…1)`, `destroy()` — the lifecycle and volume contract; playback is not part of it (the sim's `Sfx` / `Music` / `MusicDuck` events reach `@shmup/audio-web`'s engine through the shell, M1-15) |
| `AudioBus` | type | `'master' \| 'music' \| 'sfx' \| 'ui'` |
| `AudioState` | type | `'uninitialized' \| 'suspended' \| 'running' \| 'closed'` |

Positions in batches are world pixels; draw-list coordinates are screen pixels of the
384×216 frame (rounded, `Int16`). Colours are `0xRRGGBB`, opacities `0…255`.

### `rng` — seeded PRNG streams

sfc32 (128-bit state) seeded by four splitmix32 words. Drawing never allocates.

| Export | Kind | Summary |
|---|---|---|
| `createRng(seed)` | function | → `Rng`; only the low 32 bits of `seed` are used, then 12 warm-up steps |
| `createRngStreams(seed)` | function | → `RngStreams { gameplay, cosmetic }`; `cosmetic` is seeded `splitmix32(seed ^ 0x9e3779b9)` so it can never shift the gameplay sequence |
| `Rng` | interface | `callCount`, `nextU32()`, `nextFloat()` (`u32 / 2^32`), `rangeInt(min, max)` (inclusive, always exactly one draw), `getState()`, `getStateInto(out)`, `setState(state)` |
| `RngState` | type | `readonly [number, number, number, number]` |
| `RngStreams` | interface | `gameplay` (sim-affecting), `cosmetic` (presentation only) |
| `RNG_STATE_WORDS` | const | `4` — the length `getStateInto(out)` requires (throws `RangeError` if shorter) |

`callCount` is diagnostic (debug overlay); it is not part of the state and `setState()`
leaves it alone.

### `math` — binary angles, tables, easing

Angles are **binary angles**: 1024 units per turn, 0 = +x, increasing clockwise on screen
(world y points down). `Math.sin/cos/tan/asin/acos/atan/atan2/exp/log/pow/hypot/cbrt` and
the `**` operator are lint errors in `packages/core`; use these instead.

| Export | Kind | Summary |
|---|---|---|
| `ANGLE_UNITS`, `ANGLE_MASK`, `ANGLE_QUARTER` | const | `1024`, `1023`, `256` (re-exported from `math/trig-table.ts`) |
| `BinaryAngle` | type | `number` — an integer angle in binary units |
| `sinB(a)`, `cosB(a)` | function | Table lookup, within 7.7e-6 of the real value; any integer `a` is wrapped |
| `atan2B(dy, dx)` | function | → `0…1023`, within ±1 unit; `0` for the zero vector. Argument order mirrors `Math.atan2(y, x)` |
| `wrapAngle(a)` | function | → `a & 1023` |
| `quantizeAngle(a, directions)` | function | Snaps to the nearest of `directions` headings (`directions` must divide 1024) |
| `angleDelta(from, to)` | function | Signed shortest rotation, `[-512, 512)`; positive = clockwise |
| `turnToward(from, to, maxStep)` | function | Homing primitive; returns `to` once within `maxStep` |
| `clamp(v, min, max)`, `lerp(from, to, t)`, `approach(v, target, step)` | function | Scalars; `lerp` does not clamp `t`, `approach` never overshoots |
| `EASINGS` | const | Frozen `Record<EasingName, EasingFn>`: `linear, inQuad, outQuad, inOutQuad, inCubic, outCubic, inOutCubic, inOutSine`; all map 0 → 0 and 1 → 1 and do **not** clamp their input |
| `EasingFn`, `EasingName` | types | `(t: number) => number`; the names above |
| `SIN_TABLE_Q16`, `ATAN_TABLE`, `TRIG_SCALE` (65536), `ATAN_TABLE_STEPS` (256) | const | Raw generated table data from `math/trig-table.ts` — for tests and tools; gameplay code uses `sinB` / `cosB`, except hot per-tick code that indexes `SIN_TABLE_Q16 / TRIG_SCALE` directly with a whole angle (`core/weapons` when it fires) |

`math/trig-table.ts` is **generated**: `pnpm trig:tables` (`scripts/gen-trig-tables.mjs`,
`--check` to verify, `--out FILE` to write elsewhere). It computes both tables with BigInt
fixed-point arithmetic, so the output is byte-identical on every engine.

### `events` — sim → presentation queue

| Export | Kind | Summary |
|---|---|---|
| `createEventQueue(capacity = DEFAULT_EVENT_QUEUE_CAPACITY)` | function | → `EventQueue`; throws `RangeError` unless `capacity` is a positive integer |
| `EventQueue` | interface | `capacity`, `length`, `dropped`, `push(kind, id, x, y, param)`, `drain(visit)`, `clear()` |
| `SimEvent` | interface | `kind`, `id`, `x`, `y`, `param` — the single *reused* record `drain` hands to `visit` |
| `SimEventKind` | const + type | `Sfx 0, Music 1, Particles 2, Shake 3` (`param` = magnitude px, `id` = duration ticks — `core/fx` `requestShake`, M1-12), `Flash 4` (`id` = `core/fx` `FlashKind`, `param` = duration — `requestFlash`; Mega Crash: kind 0, 12 ticks), `HitStop 5` (`param` = frozen ticks — `requestHitStop`; informational, the World already froze), `Rumble 6` (`id` = player, `param` = magnitude; the death pushes 1), `FormationBonus 7` (M1-08: `id` = formation slot, `x` / `y` = last kill, `param` = bonus points), `PowerUp 8` (M1-11: a meter slot equipped — `id` = the `MeterSlot`, `x` / `y` = the ship, `param` = the player), `MusicDuck 9` (M1-12: the player's death — `id` = player, `param` = ticks until full volume, `DEATH_MUSIC_DUCK_TICKS` 120), `Dim 10` (M1-13: darken the playfield — `id` = level in percent, `param` = ticks; the boss WARNING: 50 / 180), `BossDefeated 11` (M1-13: a boss's score tally — `id` = its `ContentDb.enemies` index, `x` / `y` = where it exploded, `param` = points awarded), `Score 12` (M1-14: points scored at a place, for the score popups — `id` = the player credited, `x` / `y` = the kill or the boss part (whole pixels), `param` = the points; pushed by `core/scoring` for credited kills and by `core/bosses` for destroyed parts; presentation only, not hashed), `UserOption 13` (M1-17: the Options screen changed an option, pushed live on every change — `id` = `UserOptionKind`, `param` = a volume level 0–10 or the chosen profile's index in the flow's profile choices; the shell's `connectOptionEvents` applies it) |
| `UserOptionKind` | const + type | What a `UserOption` event changed: `MasterVolume 0`, `MusicVolume 1`, `SfxVolume 2` (the `sfx` and `ui` buses), `InputProfile 3` — append, never renumber |
| `SIM_EVENT_KIND_NAMES` | const | Names indexed by code (`'sfx'`, `'music'`, …, `'userOption'`) |
| `SFX_CUES`, `SfxCue`, `SFX_CUE_NAMES` | const/type | 23 cues, `PlayerShot 0` … `WarningSiren 20` (shmup_feat.md §19), `Clink 21` (M1-10: a player shot bouncing off armour — boss parts too since M1-13), `PowerUpDenied 22` (M1-11: a PowerUp press on an empty or greyed slot). M1-11 pushes `MeterAdvance` (pickup), `PowerUpEquip`, `ShieldHit`, `ShieldBreak`, `MegaCrash`; M1-12 `PlayerDeath` (8, at the ship); M1-13 `WarningSiren` (with `SfxPriority.Critical`) and `BossExplode` (the chain and the blast); `CapsulePickup` waits for Direct mode |
| `SfxPriority` | const + type | Priority hints in an `Sfx` event's `param` (M1-13): `Default 0` (the cue's own priority), `Low 1`, `Normal 2`, `High 3` (a boss's final blast), `Critical 4` (never stolen — the WARNING siren); since M1-15 the SFX player uses a hint 1–4 as the sound's tier in place of the cue's own (`SFX_PRIORITY_TIERS`) |
| `MUSIC_CUES`, `MusicCue`, `MUSIC_CUE_NAMES` | const/type | 15 cues, `Silence 0` … `Escape 14` |
| `FX_CUES`, `FxCue`, `FX_CUE_NAMES` | const/type | Particle cues — the `id` of `Particles` events (M1-08): `ExplosionSmall 0, ExplosionMedium 1, ExplosionLarge 2`, `BulletCancel 3` (M1-09: a cancelled enemy bullet's sparkle), `ShieldBreak 4` (M1-11: a shield's last hit, at the ship), `Debris 5` (M1-12: the player ship's wreckage, pushed with `ExplosionLarge` at the death), `BossChain 6` (M1-13: one explosion of a boss's death chain — a random point of the boss), `BossBlast 7` (M1-13: the final blast, at the boss's origin); `content/fx/` binds every one to particle presets (M1-14 — render-pixi `particles`) |
| `DEFAULT_EVENT_QUEUE_CAPACITY` | const | `256` |

Ids and kind codes are part of the replay/debug format: **append, never renumber.** The
ring drops the *oldest* pending event when it is full and counts it in `dropped`
(`clear()` resets the counter). Events pushed from inside `drain` stay queued for the next
drain; if such a visitor overflows the ring, the unvisited originals are dropped and the
drain ends there.

### `pools` — zero-GC storage

| Export | Kind | Summary |
|---|---|---|
| `createSoaPool(capacity, schema)` | function | → `SoaPool<S>`; throws `RangeError` for a bad capacity or an unknown field type |
| `SoaPool<S>` | interface | `capacity`, `count`, `pendingFreeCount`, `fields`, `alloc()` (→ index or `-1`, zero-fills), `free(i)` (deferred, dedup, out-of-range ignored), `flush()`, `clear()` |
| `SoaSchema`, `SoaFieldType` | types | `{ x: 'f64', sprite: 'u16' }`; `'f64' \| 'f32' \| 'i32' \| 'u32' \| 'i16' \| 'u16' \| 'i8' \| 'u8'` |
| `SoaFields<S>`, `SoaArray`, `SoaArrayFor<T>` | types | `fields` typed from the schema; the typed-array union and the per-type mapping |
| `createPool(factory, capacity, reset?)` | function | → `Pool<T>`; calls `factory` `capacity` times up front |
| `Pool<T>` | interface | `capacity`, `inUse`, `acquire()` (→ reset object or `null`), `release(item)` (throws `RangeError` if more are released than acquired) |

**SoA slot indices are only stable within a tick** — `flush()` swap-removes freed slots
(highest index first), which moves the last live entries. Store an id, not a slot index,
if a reference must survive a flush.

### `data` — content schemas and loader

Validates everything under `content/` and turns the string ids into numeric indices once,
at load (decision D28: in-house combinators, no runtime dependency). Guide:
[content-data.md](content-data.md).

| Export | Kind | Summary |
|---|---|---|
| `loadContent(files, options?)` | function | → `LoadContentResult { db, issues, foreign }`; never throws on bad data, only on a bad `files` argument (`TypeError`). Pure: same files in any order → identical result; input never mutated |
| `LoadContentOptions` | interface | `knownScripts?` (array or `Set`; unknown `script` refs become issues — hosts pass `core/behaviors` `KNOWN_SCRIPT_IDS`), `migrations?` (defaults to `CONTENT_MIGRATIONS`), `extraSprites?` (sprite names the engine draws on its own — hosts pass `core/world` `ENGINE_SPRITES`, M1-09 — interned into `db.sprites` with the content's names) |
| `ContentFile` | interface | `{ path, data }` — one parsed JSON document, as `virtual:shmup-content` provides it |
| `ContentDb` | interface | `sprites` (content sprite names + `extraSprites`), `scripts` (`StringTable`), `ships`, `weapons`, `weaponPresets`, `enemies`, `paths`, `stages`, `tilesets`, each with an id → position `…Index` map (`shipIndex`, `weaponIndex`, `weaponPresetIndex`, `enemyIndex`, `pathIndex`, `stageIndex`, `tilesetIndex`) |
| `StringTable` | interface | `{ names, index }` — interned names in ascending order; `names[i]` is index `i` |
| `EMPTY_CONTENT_DB` | const | Frozen, shared empty database (the default for `createGame`) |
| `CONTENT_KINDS`, `ContentKind`, `isContentKind(kind)` | const/type/function | `player`, `weapons`, `enemies`, `paths`, `stage`, `tileset`; other kinds come back in `foreign` |
| `ContentFileHeader` | interface | `{ formatVersion, kind }` — first two fields of every file |
| `CONTENT_FORMAT_VERSION` | const | `1`; a newer version is rejected with an issue |
| `CONTENT_MIGRATIONS`, `ContentMigration`, `ContentMigrationTable` | const/types | Per-kind `fromVersion → (data) => newData` table; ships `0 → 1` for `weapons`, `enemies`, `stage` (none for `player`) |
| `PlayerShipSpec`, `BoxSpec`, `MarginSpec` | types | A ship of a `player` file: `speeds` (D3), `hurtRadius`, `terrainBox`, `pickupBox`, `margins`, timers, `spriteId` |
| `WeaponSpec`, `WeaponSlot`, `WEAPON_SLOTS`, `WeaponPresetSpec` | types/const | A weapon (`slot`, `behaviorId`, `damage`, `speed`, `cap`, `pierce`, `spriteId`, optional `refireTicks`, `sfxId`, `params`) and a meter-mode loadout (`mainId`/`missileId`/`doubleId`/`laserId`, `-1` = none) |
| `EnemySpec`, `EnemyRankSpec` | types | An enemy (M1-08; every optional field filled with its default at load): `id`, `hp`, `score`, `hurtbox`, `script` / `scriptId`, `sprite` / `spriteId`, `anim` (default 1 frame), `params` (behaviour tunables, default `{}`), `mover` (`EnemyMoverSpec \| null`), `drop` (`'capsule' \| null`), `ground` (`'floor' \| 'ceiling' \| null`), `settleTicks` (default `DEFAULT_SETTLE_TICKS` 30), `explosion` (default `'small'`), `megaCrashImmune` (default `false`), `child` / `childId` (spawners; `null` / `-1`), `rank?`, `boss` (M1-13: the `BossSpec`, `null` for a regular enemy). `hp`, `score`, `hurtbox`, `script`, `sprite`, `drop` are required for a regular enemy (checked by the loader since M1-13); a boss entry has only `id` + `boss` and the loader fills the rest (`hp` = the cores' total, `score` = `boss.score`, `script` / `sprite` `''` with ids -1, a 1-px hurtbox, `megaCrashImmune`) |
| `EnemyAnimSpec`, `EnemyGround`, `EnemyExplosion`, `EnemyDrop` | types | `{ frames, ticks }`; `'floor' \| 'ceiling'`; `'small' \| 'medium' \| 'large'`; `'capsule'` |
| `ENEMY_GROUNDS`, `ENEMY_EXPLOSIONS`, `ENEMY_DROPS`, `DEFAULT_SETTLE_TICKS` | const | The code tables (ground / drop code = index + 1, 0 = none; explosion code = index); `30` |
| `EnemyMoverSpec`, `MoverType`, `MOVER_TYPES` | types/const | A starting mover by `type`: `straight { vx, vy }`, `sine { vx, amp, period, phase? }`, `path { path?, pathId, speed }` (`pathId -1` = the spawn event's path), `waypoint { x, y, speed, hold, leaveVx, leaveVy }`, `follow`, `groundCrawl { speed }`, `homing { speed, turnRate }` (whole binary units), `aimedDash { speed, windup }`; the eight names in `MoverKind` order |
| `BossSpec` | type | The boss section (M1-13): `code` (WARNING code, ≤ 8, `A-Z 0-9 -`), `displayName` (≤ 24, upper case), `introTicks` (default `DEFAULT_BOSS_INTRO_TICKS` 120), `score` (the tally, default 0), `x` / `y` (home in playfield px, default `DEFAULT_BOSS_X` 296 / `DEFAULT_BOSS_Y` 100), `parts` (1–`MAX_BOSS_PARTS`, parents first), `phases` (1–`MAX_BOSS_PHASES`) |
| `BossPartSpec` | type | `name`, `parent` / `parentIndex` (an earlier part; `null` / -1 = the origin), `x` / `y` (offset from the parent), `hp` (default 1), `hurtbox` (`BoxSpec \| null` — none: never hit or touched), `vulnerable` (default `'always'`), `requires` / `requiresMask` (`afterParts` only), `core`, `gun`, `open` (default `false`), `sprite?` / `spriteId`, `anim`, `score` (default 0), `explosion` (default `'medium'`) |
| `BossPhaseSpec`, `BossUntilSpec` | types | `{ script, scriptId, params, until }` (`until` `null` on the last phase only); `{ hpBelow?, partsDestroyed?, count?, ticks?, partsMask }` — any condition met ends the phase |
| `BossVulnerability`, `BOSS_VULNERABILITIES` | type, const | `'always' \| 'afterParts' \| 'whenOpen' \| 'never'`; the list (index = `core/bosses` `BossVulnerable` code) |
| `MAX_BOSS_PARTS`, `MAX_BOSS_PHASES`, `DEFAULT_BOSS_X`, `DEFAULT_BOSS_Y`, `DEFAULT_BOSS_INTRO_TICKS` | const | `16`, `8`, `296`, `100`, `120` |
| `PathSpec`, `PathPointSpec` | types | A `paths` entry (M1-08): `id`, `points` (2–64 `{ x, y }`, relative to the start, consecutive points distinct), `table` (`PathTable`, baked at load) |
| `bakePath(xs, ys)`, `PathTable` | function, type | Centripetal Catmull-Rom through the points → `{ length, samples (x, y interleaved, relative to the first point, one per PATH_SAMPLE_STEP px of arc length, the last = the end point), count, endDx, endDy }`; throws `RangeError` for < 2 points, coincident neighbours or a curve over `MAX_PATH_LENGTH` (load time only — it allocates) |
| `PATH_SAMPLE_STEP`, `MAX_PATH_LENGTH` | const | `1` px between samples; `16384` px |
| `StageSpec` | type | A stage (M1-07): `id`, `name`, `music: StageMusic` (`stage` / `boss` cues + `stageId` / `bossId`), `length`, `camera`, `checkpoints`, `parallax`, `tilemap` (`StageTilemapSpec \| null`), `events`, and two fields the loader adds: `flagNames` (sorted; index = flag bit) and `terrain` (`StageTerrain \| null`) |
| `StageCameraKey` | type | `x`, `speed` (px/tick, 0 = stop), optional `ramp` (ticks, linear), `yTo` + `yTicks` (eased vertical pan), `lock` (boolean — stop exactly at `x` until `runner.unlock()`) |
| `StageCheckpoint`, `StageParallaxLayer`, `StageParallaxLayerName` | types | `{ x }`; a band `{ layer: 'far' \| 'mid', sprite, spriteId, factor, y, spacing }`; `'far' \| 'mid'` |
| `StageTilemapSpec`, `HeightfieldSpec`, `HeightfieldSegment`, `HeightfieldProfile` | types | `{ tileSize: 8, tileset, tilesetId, rowsTall, rle?, generator? }`; `{ type: 'heightfield', segments }`; `{ from, to, floor?, ceiling? }`; `{ base, amp, period, seed }` |
| `StageTerrain` | type | The expanded grid (never in the JSON): `tileSize`, `cols` = `ceil((length + 384) / 8)`, `rows`, `tiles` (`Uint8Array`, shared content — copy before mutating), `tilesetId` |
| `StageEvent` = `StageSpawnEvent` \| `StageFormationEvent` \| `StageBossEvent` \| `StageMusicEvent` \| `StageSpeedEvent` \| `StageFlagEvent` \| `StageEndEvent` | types | Timeline entries by `type`: `spawn` (`enemyId`, `y?` (default mid-playfield), `screenX?` (default 400), `path?` / `pathId`), `formation` (the same + `count`, `interval`, `drop?` (default `'capsule'`, `null` = none), `bonus?` (default 0)), `warning` / `boss` (`enemyId` — a boss; `warning` plays the WARNING first, M1-13), `music` (`cueId`), `speed` (`speed`, `ramp?`), `flag` (`flag`, `flagId`, `value?` default `true`), `end` |
| `STAGE_EVENT_TYPES`, `MAX_STAGE_FLAGS` | const | The eight types in schema order (index = `StageEventCode`); `32` |
| `TilesetSpec`, `TileSpec` | types | A `tileset` file: `id`, `sprite`, `spriteId`, `tileSize` (8), `tiles` (≤ 255; tile id = index + 1), `tables`; a tile: `name`, `type`, `frame`, `anchor`, `mask` (8 column heights) |
| `TilesetTables` | type | Per tile id (0 = empty cell): `count`, `type`, `anchor`, `mask` (`[id * tileSize + column]`), `frame` (`-1` = not drawn), `byName` |
| `TileType`, `TILE_TYPES`, `TileAnchor`, `TILE_ANCHORS`, `TILE_SIZE` | types/const | `'empty' \| 'solid' \| 'hazard'` (index = `TerrainType` code); `'floor' \| 'ceiling'` (index = `TerrainAnchor` code); `8` |
| `ValidationIssue` | interface | `{ path, message }`, e.g. `enemies/x.enemies.json:enemies[3].hurtbox.hw` / `must be an integer in 1..512` |
| `s` | const | The combinators: `int`, `num`, `str`, `bool`, `enumOf`, `array`, `object`, `record`, `nullable`, `ref`, `oneOf` |
| `Schema<T>`, `Infer<S>`, `ObjectShape`, `ObjectValue<S, O>` | types | `parse(value, path, issues, refs?) → T \| undefined` (+ `typeName`, `refKind`); `Infer` extracts `T` |
| `RefSite`, `ContentRefKind` | types | A recorded `s.ref` site (`path`, `kind`, `id`, `container`, `field`); kinds `ship`, `weapon`, `enemy`, `stage`, `tileset`, `path`, `sprite`, `script`, `sfx`, `music` |

Every `s.ref` field `foo` gains a numeric sibling `fooId` after loading. Sprite and script
names are *interned* (sorted, then numbered, so ids never depend on file order);
ship/weapon/enemy/path/stage/tileset ids and `sfx`/`music` cue names must resolve or an issue is
reported and the id becomes `-1` (also the value for `null` and absent optional references).
`s.array(s.ref(…))` and `s.record(s.ref(…))` throw a `TypeError` at construction — wrap
references in objects. `pnpm content:check` runs the loader over `content/`.

Enemies get the defaults of their optional fields and paths are baked into arc-length tables
while collecting (a path with coincident neighbours or an overlong curve is an issue and is left
out). Guide: [enemies-and-behaviors.md](enemies-and-behaviors.md#data-as-loaded). Since M1-13
the loader also checks a regular enemy's required fields and completes a boss section (part
indices and masks, the structural rules — one bad entry skips its file), and after the references
are resolved it reports a `spawn` / `formation` event or a `child` naming a boss and a `warning`
/ `boss` event naming a regular enemy. Guide:
[bosses-and-warning.md](bosses-and-warning.md#boss-data-contentenemies-the-boss-section).

A stage gets checks beyond its schema (sorted keys / checkpoints / events, the first key at 0,
nothing past `length`, `yTicks` needs `yTo`, ≤ 32 flags) and a **third load pass** expands its
tilemap (`heightfield` generator and / or RLE rows, `core/data/tilemap.ts`) into
`StageSpec.terrain` once tileset ids are resolved. Guide:
[stage-runtime.md](stage-runtime.md#stage-data-and-loading).

The systems use these `data` types directly (`stage` since M1-07, `enemies` since M1-08,
`weapons` since M1-10 — its placeholder `WeaponSpec` is gone). Weapon `params` are checked
against their behaviour by `core/weapons` `checkWeaponBehaviors`
([weapons-and-options.md](weapons-and-options.md#content-the-type-a-arsenal)).

### `world` — the gameplay session and the tick pipeline

One gameplay session and the fixed 9-phase tick of plan §3.2. Guide:
[sim-world.md](sim-world.md).

| Export | Kind | Summary |
|---|---|---|
| `createWorld(config, content, options?)` | function | → `World` at tick 0: RNG streams from `config.seed`, the ship from `resolvePlayerShip(content)`, the stage `config.stage` (runner at its start, collision map, parallax / terrain views, the stage theme queued as a `Music` event) or a static camera, the enemy system (M1-08), the rank of `config.difficulty` and the bullet system (M1-09), the weapon system with `config.loadout` applied to both players (M1-10), the power-up system (M1-11), the effect timers (`fx`) and the scoring system (M1-12), the boss system (M1-13), player 1 starting its fly-in with `config.startingLives`, player 2 inactive, view already filled; throws `RangeError` for an unknown stage id |
| `WorldOptions` | interface | `behaviors?` — an `EnemyBehaviorLookup` replacing `DEFAULT_BEHAVIORS`; `bossBehaviors?` — a `BossBehaviorLookup` replacing `DEFAULT_BOSS_BEHAVIORS` (M1-13) (tests, tools; not in `GameConfig`, so never in a real session); `events?` — the `EventQueue` to push into instead of a new one (M1-16: `createGame` hands every World of a session its one queue) |
| `resolveWorldStage(config, content)` | function | → the `StageSpec` `config.stage` names, `null` for free flight; throws `RangeError` for an unknown id |
| `stepWorld(world, input)` | function | Runs `WORLD_PHASES` in order (phases 2–8 skipped while `hitStop > 0` at the start of the tick — recorded in `world.fx.frozen`, so a hit-stop of `n` requested during tick `t` freezes exactly `t + 1 … t + n`), then `world.tick++`; never allocates |
| `World` | interface | `config`, `content`, `ship`, `tick`, `rng`, `events`, `players` (2), `intents` (2), `camera`, `status`, `hitStop`, `fx` (`core/fx` `FxState`: shake / flash timers, M1-12), `debugFlags`, `pools`, `grid`, `playerBatch`, `stage` (`StageRunner \| null`), `terrain` (`TerrainMap \| null`, a private copy of the tiles), `parallax` (`StageParallaxView \| null`), `enemies` (`EnemySystem`, M1-08), `bullets` (`BulletSystem`, M1-09), `weapons` (`WeaponSystem`: shots, loadouts, Options — M1-10), `powerups` (`PowerUpSystem`: meters, capsules, Mega Crash, shield feedback — M1-11), `scoring` (`ScoringSystem`: `board.scores[p]`, the session hi-score — M1-12), `bosses` (`BossSystem`: the boss, its WARNING and death sequence — M1-13), `laserSources` (every laser source by id: the 64 enemies, then the 16 boss parts — M1-13), `rank` (the session's rank — constant in M1: the difficulty's base; hashed), `view` (batches: ground enemies, air enemies, player shots, Options, players, enemy bullets, shields, items, boss parts (M1-13); `lasers`: the enemy laser view; `warning`: the boss WARNING) |
| `WorldCamera` | interface | `x`, `y` (playfield top-left in world pixels), `dx`, `dy` (last stage-phase step), `vx`, `vy` (scroll velocity px/tick; the stage runner writes it every tick, in free flight 0 = static unless a test sets it). A class instance (`createStageCamera()`), not a literal — see the V8 note in [stage-runtime.md](stage-runtime.md#gotchas) |
| `WorldStatus`, `WORLD_STATUSES` | type, const | `'playing' \| 'bossWarning' \| 'stageClear' \| 'gameOver'`; the list (index = hash code). `stageClear` at a stage's `end` event (M1-07); `gameOver` once every active ship is out (`playerOut`) — set in phase 2 from `playing` / `bossWarning` only (M1-12); `bossWarning` for the 180 ticks of a boss WARNING (from `playing` only, back to `playing` when the boss enters) and `stageClear` at the end of a boss's death sequence (M1-13) |
| `WorldPhase`, `WORLD_PHASE_NAMES` | const + type, const | `Input 0, Players 1, Stage 2, Scripts 3, Movement 4, Collision 5, Damage 6, Removal 7, Fx 8`; `'input'` … `'fx'` |
| `WORLD_PHASES` | const | Frozen `WorldPhaseEntry[]` in tick order; only `input` and `fx` have `runsDuringHitStop` |
| `WorldPhaseEntry`, `WorldSystem` | interface, type | `{ phase, name, runsDuringHitStop, run }`; `(world, input) => void` |
| `PoolRegistry`, `RegisteredPool` | interfaces | `entries`, `register(name, pool) → pool` (throws `Error` for a duplicate name), `flushAll()` (phase 8), `clearAll()`; `{ name, pool, arrays }` with the field arrays in sorted name order (the hash order) |
| `syncWorldView(world)` | function | Scrolls the parallax bands with the camera, refills the enemies' ground / air batches (`enemies.sync()`), the player-shot and Option batches (`weapons.sync()`, M1-10), the item and shield batches (`powerups.sync()`, M1-11), the boss parts' batch (`bosses.sync()`, M1-13) and the players' mirror batch (active, not `dying` / `dead`, sprite present; blinks while invulnerable); phase 9 and `createWorld` call it |
| `GRID_MARGIN` | const | `64` — px around the camera view covered by `world.grid` |
| `DEATH_HIT_STOP_TICKS`, `DEATH_SHAKE_TICKS`, `DEATH_MUSIC_DUCK_TICKS` | const | The death sequence (M1-12): `8` frozen ticks; `20` ticks of `ShakeMagnitude.Medium`; `120` (the `MusicDuck` param). Guide: [death-and-scoring.md](death-and-scoring.md) |
| `ENGINE_SPRITES` | const | Sprite names the engine draws whatever the content — `core/bullets` `BULLET_SPRITES` (the nine bullet kinds + the laser beam), then `core/options` `OPTION_SPRITE` (`options/orb`, M1-10), `core/powerups` `ITEM_SPRITES` (`items/capsule`) and `core/shields` `FORCE_FIELD_SPRITE` (`shields/force-field`, M1-11), then `core/ui` `UI_SPRITES` (`hud/life`, `hud/meter-slot`, `hud/meter-labels`, `ui/logo` — the HUD and the title, M1-16). Pass it as `loadContent`'s `extraSprites` (the shell's `loadGameContent` does by default); without it bullets, Options, capsules and shields simulate but are hidden |

### `player` — the player ship (implemented for P0)

Movement, speed levels, clamping, banking and the fly-in (M1-06); hits are *recorded* by
`playerHit` since M1-07 (terrain contact), M1-08 (enemy contact) and M1-09 (enemy bullets and
lasers) — since M1-11 after the ship's Force Field (`shield`) had its say; the life cycle —
death, dead time, respawn with invulnerability, lives — since M1-12 (the World runs the death
sequence and decides respawns: [death-and-scoring.md](death-and-scoring.md)). Co-op joining is
M2-06.

| Export | Kind | Summary |
|---|---|---|
| `PlayerShip` | interface | `slot`, `active`, `x`, `y` (world centre, sub-pixel), `state`, `stateTicks`, `speedLevel`, `invulnTicks`, `bank`, `device`, `lives` (ships including the one in play — the HUD shows `lives − 1`), `moving`, `hitCause` / `hitTick` / `hits` (last accepted hit, `None` / `-1` / `0` when never hit), `shield` (`core/shields` `ShieldState`, M1-11 — the meter's `?` slot grants the Force Field here) |
| `PlayerState`, `PLAYER_STATES` | type, const | `'entering' \| 'alive' \| 'dying' \| 'dead' \| 'respawning'`; the list (index = hash code) |
| `PlayerIntent` | interface | `held`, `pressed`, `released`, `device`, `moveX`, `moveY` (−1 / 0 / 1; opposites cancel) |
| `PlayerCamera` | interface | `CameraView` + `dx`, `dy` (the world camera satisfies it) |
| `createPlayer(slot, lives)` | function | → a `dead`, inactive ship (allocate once) |
| `createPlayerIntent()` | function | → an empty intent |
| `readPlayerIntent(intent, input)` | function | `PlayerInput` → intent (tick phase 1); never allocates |
| `spawnPlayer(ship, camera, state = 'entering')` | function | Starts a fly-in at camera-relative (`ENTER_START_X`, `SPAWN_Y`), level; `'respawning'` after a death |
| `setPlayerState(ship, state)` | function | Switches state, `stateTicks = 0` |
| `updatePlayer(ship, spec, intent, camera)` | function | One tick (phase 2): timers, fly-in (cubic ease-out over `spec.enterTicks`, input ignored; a `respawning` fly-in ends with `invulnTicks = spec.respawnInvulnTicks`), `dying` → `dead` after `PLAYER_DYING_TICKS` (the ship stays put), `dead` only counts, ride `camera.dx/dy`, move at `speeds[speedLevel]` (× `DIAGONAL_SCALE` per axis on diagonals, no inertia), clamp to the view minus `margins`, bank one step per tick; inactive ships skipped; never allocates |
| `playerBankFrame(bank, bankFrames)` | function | → sprite frame: 0 level, `1…N` up, `N+1…2N` down |
| `resolvePlayerShip(content, id = 'kestrel')` | function | → that ship, else the first, else `DEFAULT_PLAYER_SHIP` (load time) |
| `DEFAULT_PLAYER_SHIP` | const | Frozen built-in spec with the KESTREL tunables (`respawnInvulnTicks` 150 since M1-12) and `spriteId: -1` (not drawn) — for empty content |
| `DIAGONAL_SCALE`, `ENTER_START_X`, `ENTER_END_X`, `SPAWN_Y` | const | `0.7071` (D4); `-24`, `64` (camera-relative fly-in); `100` (`PLAYFIELD_H / 2`) |
| `playerHit(ship, cause, tick, debug)` | function | The one entry point for anything that would kill a ship → `true` when accepted: ignored for inactive, not-`alive`, invulnerable and god-mode ships; then the ship's shield gets it first (`absorbShieldHit`, M1-11: an absorbed hit is accepted — the bullet is used up — but not recorded; terrain is never absorbed by the Force Field); otherwise records `hitCause`, `hitTick`, `hits++` (hashed). Callers: terrain (M1-07), enemy contact (M1-08), enemy bullets and lasers (M1-09). The ship stays `alive`: the World turns a hit recorded this tick (`hitTick === tick`) into the death sequence in phase 7 (M1-12); never allocates |
| `killPlayer(ship)` | function | Ship-level start of a death (M1-12): `dying` (timer restarted), `lives − 1` (never below 0), `invulnTicks` 0, level, not moving → lives left, or `-1` for an inactive / already `dying` / `dead` ship. The World's `killShip` adds the events, hit-stop, cancel and penalty |
| `respawnPlayer(ship, spec, camera)` | function | After the dead time (M1-12): a `respawning` fly-in from the left edge of `camera` (`spawnPlayer`) with `invulnTicks = enterTicks + respawnInvulnTicks` (it blinks from the start); lives untouched |
| `playerOut(ship)` | function | → `true` for an active ship that is `dead`, has no life left and has served `PLAYER_DEAD_TICKS` — it will not respawn; the World's game over is "every active ship out" |
| `PLAYER_DYING_TICKS`, `PLAYER_DEAD_TICKS` | const | `24` (the explosion, counted after the death's hit-stop), `60` (then the respawn decision) |
| `PlayerHitCause`, `PLAYER_HIT_CAUSE_NAMES` | const + type, const | `None 0, Terrain 1, Contact 2, Bullet 3, Laser 4` — append, never renumber; `'none'` … `'laser'` |

### `collision` — shapes, layers, broad phase, terrain (partial)

Terrain queries arrived with the stage runtime (M1-07); circle chains for bending lasers come in
M2-02, destructible tiles in M2-07.

| Export | Kind | Summary |
|---|---|---|
| `circleCircle(ax, ay, ar, bx, by, br)` | function | → overlap or touch (squared distances) |
| `aabbAabb(ax, ay, ahw, ahh, bx, by, bhw, bhh)` | function | Boxes as centre + half sizes; sharing an edge / corner is a hit |
| `circleAabb(cx, cy, r, bx, by, hw, hh)` | function | Circle vs box |
| `capsuleCircle(x1, y1, x2, y2, capsuleR, cx, cy, r)` | function | Straight laser (segment swept by `capsuleR`) vs circle |
| `segmentAabb(x1, y1, x2, y2, bx, by, hw, hh)` | function | Slab test: any point of the segment in the closed box |
| `pointSegmentDistanceSq(px, py, x1, y1, x2, y2)` | function | → squared distance (a zero-length segment is a point) |
| `CollisionLayer` | const + type | Bits `Player 1, PlayerShot 2, Enemy 4, EnemyBullet 8, EnemyLaser 16, Item 32, Terrain 64` — append, never renumber |
| `COLLISION_MASKS`, `layersInteract(a, b)` | const, function | Symmetric layer → mask table (plan §3.2 phase 6 pairs); → `true` when `a`'s mask has `b` |
| `createSpatialGrid(width, height, cellSize = 32, capacity = 256)` | function | → `SpatialGrid`; throws `RangeError` for non-positive sizes or a non-integer capacity |
| `SpatialGrid` | interface | `cellSize`, `cols`, `rows`, `capacity`, `count`, `dropped`, `begin(originX, originY)`, `insert(id, minX, minY, maxX, maxY) → false when full`, `build()` (counting sort), `query(minX, minY, maxX, maxY, visit) → visited` (exact — equals brute force; throws `Error` before `build`) |
| `SpatialGridVisitor` | type | `(id) => void` — create once, not per query |
| `DEFAULT_GRID_CELL_SIZE`, `DEFAULT_GRID_CAPACITY` | const | `32`, `256` |
| `Shape` | type | Circle / AABB / capsule union |
| `TerrainMap` | interface | A stage's collision grid + its tileset's tables: `tileSize`, `cols`, `rows`, `tiles` (row-major tile ids, 0 = empty), `tileType`, `tileAnchor`, `tileMask` (`[tileId * tileSize + column]`, heights from the anchor edge). Top-left = world (0, 0); outside the map is open space. Built by `core/stage` `createStageTerrain` |
| `TerrainType`, `TerrainAnchor` | const + type | `Empty 0, Solid 1, Hazard 2` (higher wins); `Floor 0, Ceiling 1` |
| `terrainAt(map, x, y)` | function | → the `TerrainType` of the world pixel `(floor(x), floor(y))` — `Empty` outside the map, in empty cells, decorative tiles and outside a tile's mask |
| `terrainSolidAt(map, x, y)` | function | → `true` when `terrainAt` is not `Empty` (hazards included) |
| `boxHitsTerrain(map, cx, cy, hw, hh)` | function | Box (centre + half sizes) → highest `TerrainType` touched (`Hazard` beats `Solid`), `0` = none. Half-open and pixel-exact: covers pixels `floor(cx − hw) … ceil(cx + hw) − 1` (at least one), so a box resting on a surface does not touch it |
| `terrainRectHit(map, x0, y0, x1, y1)` | function | Inclusive rectangle of **whole** pixels → highest `TerrainType` (the core of `boxHitsTerrain`; per-tick callers use it with floored / ceiled bounds to avoid V8 boxing fractional arguments) |
| `findFloor(map, x, y, maxDist)`, `findCeiling(map, x, y, maxDist)` | function | Scan the pixel column down / up, tile by tile → the surface y (top edge of the first colliding pixel / bottom edge + 1 of the first one above) or `NaN` when none within `maxDist`; ceiling tiles count as floors for what is below them and vice versa |

All shape tests take scalars (no temporaries) and treat touching as a hit. Grid boxes
outside the covered area clamp into the border cells; boxes over 9 cells go to an overflow
list every query scans. Pass whole numbers to `begin()` (fractional arguments get boxed).
Terrain queries, unlike the shape tests, are **half-open** on pixels (see
[stage-runtime.md](stage-runtime.md#terrain-queries)); none of them allocates.

### `debug` — state hash, debug switches and the stage skip (partial)

The stage skip to the boss arrived with zone A (M1-18 —
[zone-a-and-playtest.md](zone-a-and-playtest.md#the-debug-stage-skip)); the debug controls (god
mode, frame advance, slow motion, jump to a checkpoint) arrive in M1-19.

| Export | Kind | Summary |
|---|---|---|
| `hashWorld(world)` | function | → unsigned 32-bit FNV-1a over tick, both RNG states, camera, the stage runner (`0`, or `1` + every slot of `runner.state`), status, hit-stop, rank (M1-09), every player's simulated fields (incl. `hitCause`, `hitTick`, `hits`), every registered pool's live slots (the enemy bullets and lasers and the player shots among them), then every enemy slot's state (+ its fields when in use; a script as present / absent and its `wakeTick`), the formation table's active slots with each track's `recorded` count, and the player weapons (M1-10: per player the loadout and option group with its whole trail, the autofire timers, the cooldown tables of live piercing shots), and the power-ups (M1-11: per player the meter cursor, pending Mega Crash and every shield field, then `dropsTaken`; the `items` pool is a registered pool), then the effect timers and scores (M1-12: shake magnitude / ticks / duration / request tick, flash ticks / kind / request tick, every player's score, `killsScored`, `bonusesScored` — not the session hi-score), then the boss (M1-13: state, position, timers, phase, script wake tick, motion, destroyed mask, killer, blast flag, every part's offset / position / hp / destroyed / open / flash, the WARNING's `active` and `ticks`; the piercing shots' part cooldown tables join the weapons block) (fixed order, numbers as little-endian doubles); reads only; ≤ 16 B allocated per call |
| `createDebugFlags()` | function | → `DebugFlags` all off, `slowMo` 1 |
| `DebugFlags` | interface | `godMode`, `showHitboxes`, `frameAdvance`, `slowMo` |
| `DebugCounters` | interface | `enemies`, `enemyBullets`, `playerShots` (budget 96), `rngCalls`, `stateHash` (overlay, M1-19) |
| `FNV_OFFSET_BASIS`, `FNV_PRIME` | const | `0x811c9dc5`, `0x01000193` |
| `skipToBoss(world)` | function | The debug stage skip (M1-18) → `true` when it jumped: `runner.jumpTo(max(0, x − BOSS_SKIP_LEAD))` for the stage's **first** `warning` / `boss` event (every pool and system cleared, the events in between never fire), then `spawnPlayer` for every active ship not dying / dead; `false` in free flight or without a boss event. Cold code; `createWorld` calls it for `GameConfig.stageSkip: 'boss'`. Loadouts, lives and scores stay |
| `BOSS_SKIP_LEAD` | const | `96` — px before the boss event (≈ 2 s of zone A's calm) |

### `stage` — stage runtime

The scrolling stage: camera path, event timeline, checkpoints, and the terrain / parallax
views (M1-07). Guide: [stage-runtime.md](stage-runtime.md).

| Export | Kind | Summary |
|---|---|---|
| `createStageRunner(stage, hooks, camera = createStageCamera())` | function | → `StageRunner` at the stage start (camera 0, 0; speed 0 — the first key applies on the first tick). Compiles the timeline into typed arrays; throws `RangeError` for an event type the runtime does not know (content that skipped `loadContent`) |
| `StageRunner` | interface | `stage`, `camera`, `eventCodes` (`Uint8Array`), `state` (`Float64Array` indexed by `StageSlot` — hashed), getters `speed`, `targetSpeed`, `locked`, `eventCursor`, `checkpoint` (last passed, `-1` before the first), `flags` (bit `i` = `stage.flagNames[i]`), `ended`, `ticks`; `tick()` (never allocates), `restartAt(checkpoint)` (`-1` = start; throws `RangeError` unless an integer in `[-1, checkpoints.length)`; forgets a brake), `jumpTo(x)` (M1-18, the debug stage skip: a restart at any scroll x — speed / pan / flags re-derived, the events at exactly `x` re-fired on the next tick for the hooks, the cursor at the first event with x ≥ it, the last checkpoint at or before `x` (−1 when none) becomes `checkpoint`, then `hooks.clear()`; `jumpTo(checkpoints[i].x)` ≡ `restartAt(i)`; throws `RangeError` unless a number in `[0, stage.length]`), `unlock()` (releases a lock key's lock and a brake — the speed then ramps back up over the brake's ramp to the recorded speed), `brake(ticks)` (M1-13, the boss WARNING: the speed ramps linearly to 0 over `ticks` — floored, ≤ 0 = at once — then the camera locks; keys and `speed` events met meanwhile only record the resume speed; a second brake changes nothing) |
| `StageHooks` | interface | `event(code, event, index)` — every fired event, in timeline order, after the runner applied its own part (`speed`, `flag`, `end`); `clear()` — a checkpoint restart |
| `StageEventCode` | const + type | `Spawn 0, Formation 1, Warning 2, Boss 3, Music 4, Speed 5, Flag 6, End 7` (= `STAGE_EVENT_TYPES` order) |
| `StageSlot`, `STAGE_STATE_SLOTS` | const, const | Slots of `runner.state`: `Speed 0, Target 1, RampFrom 2, RampTicks 3, RampElapsed 4, PanFrom 5, PanTo 6, PanTicks 7, PanElapsed 8, Locked 9, Cursor 10, NextKey 11, NextCheckpoint 12, Checkpoint 13, Flags 14, Ended 15, Ticks 16, Restarts 17, Replay 18, Braking 19, ResumeSpeed 20, BrakeRamp 21` (the last three M1-13); `22` |
| `StageCamera`, `createStageCamera()` | interface, function | `x`, `y`, `dx`, `dy`, `vx`, `vy`; → a camera at (0, 0) whose class keeps the fields unboxed doubles (the World's camera is one) |
| `findEventCursor(events, scrollX)` | function | → index of the first event with `x ≥ scrollX` (binary search) |
| `createStageTerrain(stage, content)` | function | → `TerrainMap` (a private copy of `stage.terrain.tiles` + the tileset's tables) or `null` for open space |
| `createTerrainView(map, stage, content)` | function | → `TerrainView` over the map's live tiles + tileset sprite / frames; throws `RangeError` without terrain |
| `createParallaxView(stage)`, `updateParallaxView(view, cameraX, cameraY)` | functions | → `StageParallaxView` (one band per `stage.parallax` entry) or `null`; scrolls it: `offsetX = (cameraX · factor) mod spacing`, `y = baseY − cameraY · factor` (never allocates) |
| `StageParallaxView` | interface | `ParallaxView` with typed arrays + `factor`, `baseY` |
| `stageMapWidth(length, tileSize)` | function | → `ceil((length + PLAYFIELD_W) / tileSize)` columns |

Tick order: apply reached keys → advance ramp and pan → move (clamped to the first pending
lock key and to `length`) → fire due events → update the checkpoint. An event fires on the
tick the camera reaches its `x`, a key applies one tick later (except at `x` 0).

### `patterns` — behaviour coroutines, movers and fire primitives (partial)

The script runner and the per-tick movers of decision D29 (M1-08) and the fire primitives
(M1-09); the pattern DSL arrives with M2-02. Guides:
[enemies-and-behaviors.md](enemies-and-behaviors.md#movers-corepatterns),
[bullets-and-patterns.md](bullets-and-patterns.md#fire-primitives-corepatterns).

| Export | Kind | Summary |
|---|---|---|
| `Script` | type | `Generator<number, void, void>` — each `yield n` sleeps `n` ticks (`< 1`, `NaN` → next tick; fractions floored) |
| `SLEEP_FOREVER` | const | `Infinity` — yield it to never wake again (the mover carries on) |
| `ScriptHolder` | interface | `script` (`Script \| null`), `wakeTick` |
| `resumeScript(holder, tick)` | function | → `true` when resumed: calls `next()` only when `wakeTick ≤ tick`, stores `wakeTick = tick + ⌊yielded⌋`, drops a finished script; exceptions propagate. The only place `next()` is called |
| `MoverKind` | const + type | `None 0, Straight 1, Sine 2, Path 3, Waypoint 4, Follow 5, GroundCrawl 6, Homing 7, AimedDash 8` (= `MOVER_TYPES` order + 1; hashed — append, never renumber) |
| `MOVER_NAMES`, `moverKindOf(type)` | const, function | `'none'` + the content names; content name → `MoverKind` |
| `BodyAnchor` | const + type | `Air 0` (view frame, rides the camera), `Floor 1`, `Ceiling 2` (world frame) |
| `MoverBody` | interface | What movers read / write: `x`, `y`, `vx`, `vy`, `hh`, `anchor`, `age`, `mover`, `m0…m5`, `s0…s3`, `moverTicks`, `track` (`Enemy` implements it) |
| `MoverContext`, `createMoverContext(camera, terrain, paths)` | interface, function | `camera`, `terrain` (`TerrainMap \| null`), `paths` (baked), `targetX`, `targetY`, `hasTarget` (set per body by the caller) — one per system, load time |
| `setMover(body, ctx, kind, p0…p5)` | function | Switches mover, resets its state, keeps the position continuous (`Sine` picks its centre line, `Path` translates to the body, `Homing` keeps the heading); never allocates |
| `updateMover(body, ctx)` | function | One tick (phase 5; flying bodies must already have ridden the camera and `age` counts this tick); parameters per kind in the guide; never allocates |
| `FollowTrack`, `FOLLOW_HISTORY` | class, const | A leader's recorded positions by age (ring of `256`): `x`, `y` (`Float64Array`), `recorded`, `record(age, x, y)`, `has(age)`, `reset()` |
| `samplePath(path, distance, out)` | function | Baked path position at an arc length (clamped at 0, continued along the end tangent past the end) into `out[0..1]`; never allocates |
| `CRAWL_STEP`, `AIM_DIRECTIONS` | const | `8` — the largest step a crawler takes before turning round; `32` — aimed dash headings (D17; aimed *bullets* use `GameConfig.aimDirections`) |
| `fireAimed(bullets, origin, speed, kind)` | function | One bullet at the nearest living player (quantised to `config.aimDirections`; left without one) → slot or `-1` |
| `fireNWay(bullets, origin, count, step, speed, kind, angle = AIM_AT_TARGET)` | function | `count` bullets `step` binary units apart, centred on `angle` → bullets fired |
| `fireRing(bullets, origin, count, speed, kind, offset = 0)` | function | `count` bullets evenly round the circle, the first at `offset` → bullets fired |
| `fireSpiral(bullets, origin, angle, arms, step, speed, kind)` | function | `arms` evenly spaced bullets at `angle` → `angle + step` wrapped to `[0, 1024)` (the script-held state) |
| `fireStack(bullets, origin, count, speed, speedStep, kind, angle = AIM_AT_TARGET)` | function | `count` bullets on one heading at `speed + k · speedStep` → bullets fired |
| `fireSpray(bullets, origin, rng, count, spread, minSpeed, maxSpeed, kind, angle = AIM_AT_TARGET)` | function | Random headings in `angle ± spread / 2`, speeds in `[min, max)` — two draws of `rng` (the gameplay stream) per bullet, even on a full pool → bullets fired |
| `fireHoming(bullets, origin, speed, kind, turnRate, lifetime, angle = AIM_AT_TARGET)` | function | One bullet homing for `lifetime` ticks at ≤ `turnRate` units per tick → slot or `-1` |
| `fireDelayed(bullets, origin, delay, speed, kind, angle = AIM_AT_TARGET)` | function | One bullet that waits `delay` ticks, then launches (re-aimed at launch for `AIM_AT_TARGET`) → slot or `-1` |
| `rankedWait(bullets, ticks)` | function | `round(ticks / bullets.fireScale)`, ≥ 1 — a fire interval on Normal scaled by the rank |
| `PatternNode` | type | The planned pattern DSL node (`fire` / `wait` / `repeat`, M2-02) |

Every fire primitive multiplies its speeds by `bullets.speedScale` (the rank), accepts
`AIM_AT_TARGET` for any angle, floors counts (below 1 fires nothing) and drops what a full pool
cannot take; none applies the fire rule — the `ScriptApi` wrappers do.

### `enemies` — the enemy system (partial)

Spawning, formations, scripts, movers, off-screen rules, contact, damage and the sprite mirror
(M1-08); rank modifiers (M2-01) and the Option Hunter (M2-04) come later. Boss entries are never
spawned here — `core/bosses` runs them, and their parts share the grid after the enemy slots
(M1-13). Guide: [enemies-and-behaviors.md](enemies-and-behaviors.md).

| Export | Kind | Summary |
|---|---|---|
| `createEnemySystem(host, behaviors, stage)` | function | → `EnemySystem` (load time — `createWorld` calls it with the World as host): 64 slots + script APIs, the formation table, ground / air batches, specs and the stage's spawn events compiled into typed arrays |
| `EnemySystem` | interface | `enemies` (64 `Enemy`, index = slot), `count` (slots in use), `formations`, `outcomes`, `groundBatch`, `airBatch`, `movers`; `spawn(enemyIndex, x, y, pathId?)` → `Enemy \| null` (lowest free slot; `NaN` y = mid-view / surface snap; bad or fractional index, a boss entry (M1-13), no free slot → `null`), `startFormation(enemyIndex, count, interval, screenX, screenY, pathId, drop, bonus)` → slot or `-1`, `damage(enemy, amount, by = -1)` → died (ignored for ghosts / invulnerable; flash, `Sfx EnemyHit`; `by` = the player credited with a kill — the player shots pass the shooter's player, M1-10), `kill(enemy, by = -1)` → was alive (outcomes incl. `killBy`, explosion SFX + particles, drop, formation accounting), `megaCrash(by = -1)` → enemies killed (M1-11: every live, non-ghost enemy whose spec is not `megaCrashImmune`, through `kill` in slot order — armour does not protect), `clear()`; the World's per-phase calls `onStageEvent(i)`, `beginTick()`, `spawnPending()`, `runScripts()`, `move()`, `insertColliders(grid)`, `collidePlayers(grid)`, `flush()`, `sync()` — none allocates beyond the coroutines' own (a generator per spawn, a result per wake) |
| `EnemyHost` | interface | What the system reads from its World: `tick`, `camera`, `players`, `ship`, `terrain`, `content`, `rng`, `events`, `debugFlags`, `bullets` (M1-09: fire primitives; lasers detach when their enemy goes) |
| `Enemy` | class | One pooled enemy (`MoverBody` + `ScriptHolder`): `slot`, `state`, `specIndex`, `x`, `y`, `vx`, `vy`, `hw`, `hh`, `hp`, `flashTicks`, `age`, `spawnTick`, `formation`, `member`, `anchor`, mover fields, `track`, `script`, `wakeTick`, `flags`, `firstSeenTick`, `spriteId`, `animFrame`, `pathId`, `camX`, `camY` |
| `EnemyState` | const + type | `Free 0`, `Live 1` (ghosts too), `Removed 2` (freed in phase 8) |
| `EnemyFlag` | const | Bits `Invulnerable 1` (armour: shots clink, M1-10), `Settled 2, WasOnScreen 4, OnScreen 8, Ghost 16, FaceRight 32, Leader 64` |
| `ScriptApi` | interface | One reused object per slot: `self`, `spec`, `tick`, `rng` (gameplay), `target()` (nearest active `alive` ship or `null`), `setMover(kind, p0…p5)`, `spawn(enemyIndex, dx, dy)` (script starts next tick; ghosts spawn nothing), `onScreen()`, `canFire()` (live, on screen, settled, not a ghost); M1-09 fire primitives from the enemy's centre, each a no-op returning `-1` / `0` while `canFire()` is false: `aimed(speed, kind)`, `nWay(count, step, speed, kind, angle?)`, `ring(count, speed, kind, offset?)`, `spiral(angle, arms, step, speed, kind)` (→ next angle, advanced even when it may not fire), `stack(…)`, `spray(…)` (gameplay RNG), `homing(…)`, `delayed(…)`, `laser(angle?, length = 384, width?, telegraph?, grow?, active?, fade?)` (attached to the enemy), `fireWait(ticks)` (= `rankedWait`), `bullets` (the World's `BulletSystem`) |
| `EnemyBehavior`, `EnemyBehaviorLookup` | interfaces | `{ id, params, create(api, params) → Script }`; `get(id)` (`core/behaviors` provides both) |
| `FormationTable` | interface | 32 slots of typed arrays: `active`, `enemy`, `total`, `spawned`, `killed`, `escaped`, `interval`, `nextTick`, `screenX`, `screenY`, `path`, `drop`, `bonus`, `lastX`, `lastY`, `leader`, + `tracks` (`FollowTrack` per slot) — hashed |
| `EnemyOutcomes` | interface | This tick's `killCount`, `killSpec`, `killX`, `killY`, `killScore`, `killBy` (`Int8Array`: the player credited, `-1` = nobody — M1-10), `dropCount`, `dropKind`, `dropX`, `dropY`, `bonusPoints` (the sum), and per completed formation (M1-12) `bonusCount`, `bonusScore` (`Float64Array`), `bonusBy` (`Int8Array`: the killer of its last member, `-1` = nobody) — reset in phase 3; `core/powerups` turns the drops into capsules at the end of phase 7 (M1-11), `core/scoring` credits kills and bonuses (M1-12) |
| `DropKind` | const + type | `None 0`, `Capsule 1` |
| `MAX_ENEMIES`, `MAX_FORMATIONS` | const | `64`, `32` |
| `DEFAULT_SPAWN_SCREEN_X` | const | `400` (`PLAYFIELD_W + 16`) |
| `DESPAWN_MARGIN`, `UNSEEN_MARGIN`, `UNSEEN_TICKS`, `GHOST_MARGIN` | const | `32` px (escaped after being seen), `128` px / `600` ticks (never seen), `128` px (ghost leader) |
| `HIT_FLASH_TICKS` | const | `4` (D30) |

### `behaviors` — enemy and boss behaviour registries (partial)

The script ids content refers to (M1-08; the boss roster since M1-13). Guides:
[enemies-and-behaviors.md](enemies-and-behaviors.md#behaviours-corebehaviors),
[bosses-and-warning.md](bosses-and-warning.md#boss-behaviours-corebehaviors).

| Export | Kind | Summary |
|---|---|---|
| `defineBehavior(id, params, create, needsChild = false)` | function | → frozen `BehaviorDef` (tunables copied and frozen) |
| `BehaviorDef` | interface | `EnemyBehavior` + `id`, `params` (defaults), `create(api, params)`, `needsChild` (spawners) |
| `createBehaviorRegistry(defs)` | function | → `BehaviorRegistry { ids (sorted), get(id) }`; throws `Error` for a duplicate id |
| `DEFAULT_BEHAVIOR_DEFS`, `DEFAULT_BEHAVIORS`, `BEHAVIOR_IDS` | const | The M1 roster: `drifter.sine`, `fan.loop`, `carrier.straight`, `turret.floor`, `walker.floor`, `hatch.spawner`, `rammer.aimed`, `orbiter.loop` (tunables in the guide); as a registry (what the World uses); its sorted ids |
| `WEAPON_SCRIPT_IDS` | const | Re-export of `core/weapons` `WEAPON_SCRIPT_IDS` (`laser.beam`, `missile.groundSlide`, `shot.double`, `shot.straight`; the list moved to `weapons` in M1-10) — weapon and enemy behaviours share the content's script table |
| `defineBossBehavior(id, params, create)` | function | → frozen `BossBehaviorDef` (M1-13; tunables copied and frozen) |
| `BossBehaviorDef`, `BossBehaviorRegistry` | interfaces | `core/bosses` `BossBehavior` + typed `params`, `create(api: BossScriptApi, params) → Script`; `{ ids (sorted), get(id) }` (a `BossBehaviorLookup`) |
| `createBossBehaviorRegistry(defs)` | function | → `BossBehaviorRegistry`; throws `Error` for a duplicate id |
| `DEFAULT_BOSS_BEHAVIOR_DEFS`, `DEFAULT_BOSS_BEHAVIORS`, `BOSS_BEHAVIOR_IDS` | const | The M1 boss roster (M1-13): `boss.hover` (tracks the player's height, aimed spreads from the gun parts, opens / closes `whenOpen` parts) `boss.lanes` (lane lasers from the guns in turn, aimed spreads) and, since M1-18, `boss.bulwark` (HALCYON BULWARK: slow tracking, lane lasers **attached** to the guns in turn, optional aimed `ways`-ways of needles — [zone-a-and-playtest.md](zone-a-and-playtest.md#bossbulwark)) — tunables in the guides; as a registry (the World's default); its sorted ids |
| `KNOWN_SCRIPT_IDS` | const | `BEHAVIOR_IDS` ∪ `BOSS_BEHAVIOR_IDS` ∪ `WEAPON_SCRIPT_IDS`, sorted — pass it to `loadContent` as `knownScripts` |
| `checkEnemyBehaviors(db, registry = DEFAULT_BEHAVIORS, bossRegistry = DEFAULT_BOSS_BEHAVIORS)` | function | → `ValidationIssue[]`: `enemies:<id>.params.<name>` (unknown tunable), `enemies:<id>.child` (spawner without a child), `enemies:<id>.script` (a boss behaviour on a regular enemy), `enemies:<id>.boss.phases[<p>].script` (an enemy behaviour in a boss phase), `enemies:<id>.boss.phases[<p>].params.<name>` (unknown boss tunable) — M1-13 |

### `bullets` — enemy bullets and lasers

The enemy projectiles of a World (M1-09; implemented for P0 — bending lasers, cancel into
points and the pattern DSL arrive with M2-02). Guide: [bullets-and-patterns.md](bullets-and-patterns.md).

| Export | Kind | Summary |
|---|---|---|
| `createBulletSystem(host)` | function | → `BulletSystem` (load time — `createWorld` calls it with the World as host): registers the `enemyBullets` (512) and `enemyLasers` (16) pools, builds their views and the kind tables (sprite ids via `content.sprites`); throws `Error` when the pool names are already registered |
| `BulletSystem` | interface | `pool`, `lasers` (the two `SoaPool`s), `batch` (the bullet pool as the `EnemyBullets` `SpriteBatchView`), `laserView` (`LaserView`), `count`, `rank`, `speedScale`, `fireScale`, `aimDirections`; `setRank(rank)`; `spawn(x, y, angle, speed, kind)` / `emit(origin, angle, speed, kind)` → slot or `-1` (raw values: full pool, bad or fractional kind, non-finite angle other than `AIM_AT_TARGET` drop quietly); `aimFrom(origin)` → quantised angle to the nearest living player; per-slot `setMotion(i, accel, angVel, minSpeed, maxSpeed)`, `setChange(i, atAge, speed, angle)`, `setDelay(i, ticks, aimOnLaunch)`, `setHoming(i, turnRate, lifetime)`, `setFlags(i, flags)` (no-ops for bad or removed slots); `fireLaser(origin, angle, length, width, telegraph, grow, active, fade, src)`; `detachLasers(slot)`; the World's per-phase `update()` (phase 5) and `collidePlayers()` (phase 6); `cancelAll(mode)` — none allocates |
| `BulletHost`, `BulletOwner` | interfaces | What the system reads from its World (`tick`, `config`, `camera`, `players`, `ship`, `terrain`, `content`, `events`, `debugFlags`, `pools`, `enemies`, and since M1-13 the optional `laserSources` — every laser source by id; absent = the enemy slots); anything with a `.bullets` system (the World) |
| `BulletOrigin` | class | `{ x, y }` a pattern fires from — one reused instance per firing system (a class, so the fields stay unboxed) |
| `LaserSource` | interface | `{ slot, x, y }` — an `Enemy` works, and a `BossPart` (M1-13); `slot` -1 = a fixed origin |
| `spawnBullet(owner, x, y, angle, speed, kind)` | function | `owner.bullets.spawn(…)` — one raw bullet → slot (stable within the tick) or `-1` |
| `fireLaser(owner, src, angle, length, telegraph = 40, grow = 8, active = 60, width = 6, fade = 8)` | function | A straight laser from `src` (attached when `src.slot ≥ 0`, else riding the camera) → slot or `-1` (pool full, all timings 0, non-positive length / width, bad angle); raw — no fire rule, no rank |
| `cancelAllBullets(owner, mode)` | function | Removes every cancelable bullet and laser this tick → bullets cancelled; `CancelMode.Sparkle` pushes `Particles` / `FX_CUES.BulletCancel` at up to `CANCEL_SPARKLE_LIMIT` evenly spread bullets |
| `CancelMode` | const + type | `Sparkle 0` (points mode: M2-02) |
| `BulletFlag` | const | `DieOnTerrain 1`, `Cancelable 2`, `Grazed 4` (reserved, P2) — public; `AimOnLaunch 8`, `Dead 16` — internal |
| `BulletKind`, `BulletKindSpec`, `BULLET_KINDS` | const + type, interface, const | `RoundPink 0 … NeedlePurple 8` (round / oval / needle × pink / red / purple); `{ name, sprite, radius, frames, flags }`; the frozen built-in table (radius 2 / 2 / 1.5, frames 1 / 8 / 8, every kind `DieOnTerrain \| Cancelable`) |
| `BULLET_SPRITES`, `LASER_SPRITE` | const | The kinds' sprites then the beam (`= core/world` `ENGINE_SPRITES`); `'lasers/beam-pink'` |
| `LaserPhase` | const + type | `Telegraph 0` (blinking warning line), `Grow 1`, `Active 2` (the only phase with a hitbox — a capsule of radius `width / 2`), `Fade 3` |
| `BULLET_SCHEMA`, `BulletSchema`, `LASER_SCHEMA`, `LaserSchema` | const, type | The pool field layouts (hashed in sorted field order) — tables in the guide |
| `AIM_AT_TARGET`, `UNCHANGED`, `NO_TARGET_ANGLE` | const | `Infinity` (angle argument: at the nearest living player, quantised; as a change angle: re-aim then); `NaN` (keep a value in `setChange`); `512` (straight left — aimed shots without a target) |
| `MAX_ENEMY_BULLETS`, `MAX_ENEMY_LASERS`, `MAX_BULLET_SPEED`, `BULLET_CULL_MARGIN`, `CANCEL_SPARKLE_LIMIT` | const | `512`, `16`, `16` px/tick (default `maxSpeed`), `16` px (culled outside the view ± this), `64` |
| `LASER_TELEGRAPH_TICKS`, `LASER_GROW_TICKS`, `LASER_ACTIVE_TICKS`, `LASER_FADE_TICKS`, `LASER_WIDTH`, `LASER_BLINK_TICKS` | const | Laser defaults: `40`, `8`, `60`, `8` ticks, `6` px, blink `4` on / `4` off |

Bullets and fixed lasers ride the camera (`x += camera.dx`) like flying enemies; bullets die
outside the view ± 16 px and (with `DieOnTerrain`) on terrain; collision is brute force per ship
(`playerHit(Bullet)` / `playerHit(Laser)`, at most one of each per ship and tick; an accepted
bullet is removed).

### `rank` — rank / dynamic difficulty (partial)

Constant rank in M1 (M1-09); rank growth and the difficulty preset tables arrive with M2-01.
Guide: [bullets-and-patterns.md](bullets-and-patterns.md#rank-corerank-partial).

| Export | Kind | Summary |
|---|---|---|
| `computeRank(inputs)` | function | → whole rank in `[0, 31]`: the difficulty base rounded and clamped (non-finite → 0); `loop` / `stage` / `power` / `special` ignored until M2-01 |
| `RankInputs`, `difficultyRankInputs(difficulty)` | interface, function | `{ difficultyBase, loop, stage, power, special }`; → the inputs of a session start (the preset's base, loop 1, stage 1) — load time, allocates |
| `DIFFICULTY_RANK_BASE` | const | `easy 0`, `normal 2`, `hard 4`, `arcade 6` (the "very hard" base) |
| `rankScale(rank, curve)` | function | `1 + perRank · (r − 2) + perRankSq · (r² − 4)`, `r` clamped to 0…31, never below 0.05 — **exactly 1 at Normal**; call when the rank changes, not per tick |
| `RankCurve` | interface | `{ perRank, perRankSq }` (either may be negative) |
| `BULLET_SPEED_RANK_CURVE`, `FIRE_RATE_RANK_CURVE` | const | `{ 0.01, 0.0005 }` (Easy × 0.978, Hard × 1.026, rank 31 × 1.768); `{ 0.02, 0.001 }` (Easy × 0.956, Hard × 1.052, rank 31 × 2.537 — intervals are divided by it) |
| `RANK_MAX`, `RANK_LOOP1_CAP`, `RANK_NORMAL` | const | `31`, `16` (applies once growth is on), `2` |

### `weapons` — player weapons (partial: Type A)

The players' projectiles, loadouts and autofire (M1-10): meter mode's Type A arsenal fired by
the ship and its Options with per-shooter caps, piercing beams and grid-based hits. Loadouts
B–D and Weapon Edit arrive with M2-03, the Direct-mode families with M2-05. Guide:
[weapons-and-options.md](weapons-and-options.md).

| Export | Kind | Summary |
|---|---|---|
| `createWeaponSystem(host)` | function | → `WeaponSystem` (load time — `createWorld` calls it with the World as host): registers the `playerShots` pool (96), one `Loadout` and `OptionGroup` per player, the role tables compiled from the content's preset (sprite ids, SFX, tunables; intervals from the config), the hit list and the two batches; throws `Error` when `playerShots` is already registered |
| `WeaponSystem` | interface | `pool` (`SoaPool<ShotSchema>`), `batch` (`PlayerShots` mirror, 192), `optionBatch` (`Player`, 8 — drawn below the ships), `loadouts`, `options`, `roleWeapons` (`WeaponSpec \| null` per role), `timers` (`Int32Array`, `[shooter × 2]` main / `+ 1` missile — hashed), `liveCounts` (`[shooter × 4 + role]`), `cooldowns` (`Uint8Array`, `PIERCE_TABLES` × 64), `partCooldowns` (`PIERCE_TABLES` × 16 — the boss parts, same table index, M1-13), `hitShot` / `hitEnemy` / `hitCount` (the last `collide`; `hitEnemy` is an enemy slot or a boss part as `BOSS_PART_ID_BASE` + index), `hitsDropped`, `count`; `spawnShot(role, shooter, x, y)` → slot or `-1` (as if the shooter were at x, y — offsets and velocity apply, caps and timers do not; `-1` for an empty role, a bad shooter, a full pool or no free pierce table), `countShots(shooter, role)`; the World's per-phase `updatePlayers()` (2: option trails, timers, firing), `update()` (5: movement, terrain, culling, cooldowns), `collide(grid)` (6: hits found — non-piercing: the lowest overlapping id; piercing: every one off cooldown, armour and clinking parts always), `applyHits()` (7: clink on armour, else `enemies.damage(e, damage, player)`; a boss part through `bosses.damagePart` — `Clink` kills the shot, `None` lets it fly on — M1-13), `sync()` (9), `clear()` (checkpoint restart) — none allocates |
| `WeaponHost` | interface | What the system reads from its World: `tick`, `config`, `camera`, `players`, `ship` (`enterTicks`), `intents`, `terrain`, `content`, `events`, `pools`, `enemies` (`enemies`, `damage(enemy, amount, by)`), `bosses` (`boss.parts`, `damagePart(index, amount, by)` → `BossHit` — M1-13) |
| `Loadout` | class | One player's meter-mode loadout: `main` (`MainWeapon`), `missile` (boolean), `options` (0–4); the speed level and the shield live on the ship (`PlayerShip.speedLevel`, `PlayerShip.shield` — `Loadout.shield` was removed in M1-11); the power meter (`core/powerups`) equips them |
| `applyLoadoutPreset(loadout, ship, preset)` | function | `'default'`: basic shot, nothing else, speed level 0; `'full'`: speed level `FULL_LOADOUT_SPEED_LEVEL` (2), Missile, Laser, four Options and a fresh Force Field (`grantShield`; `'default'` clears the shield) |
| `MainWeapon` | const + type | `Basic 0, Double 1, Laser 2` (Double and Laser are mutually exclusive, §6A) |
| `WeaponRole`, `WEAPON_ROLE_COUNT` | const + type, const | `Main 0, Double 1, Laser 2, Missile 3` (index into the role tables); `4` |
| `ShotKind` | const + type | `Straight 0, Double 1, Laser 2, Missile 3` — hashed: append, never renumber |
| `ShotFlag` | const | `Pierce 1, Blocked 2` (laser head stopped by terrain), `Sliding 4` (missile on the floor), `Dead 8` (removed this tick) |
| `SHOT_SCHEMA`, `ShotSchema` | const, type | Pool fields: `x`, `y` (a laser's head), `vx`, `vy`, `length`, `hw`, `hh`, `damage`, `role`, `kind`, `shooter`, `flags`, `sprite`, `frame`, `draw`, `age`, `table` (cooldown table + 1, 0 = none) — hashed in sorted order |
| `WeaponBehaviorId` | type | A weapon behaviour / script id (`string`) |
| `WEAPON_BEHAVIOR_KINDS`, `WEAPON_BEHAVIOR_SLOTS`, `WEAPON_BEHAVIOR_PARAMS`, `WEAPON_SCRIPT_IDS` | const | Behaviour id → `ShotKind`; → the slot it belongs in; → its tunables with defaults (`shot.straight` `ox 8, oy 0, hw 4, hh 2`; `shot.double` `angle 128, ox 4, oy -2, hw 3, hh 3`; `laser.beam` `maxLength 64, hitCooldownTicks 6, ox 8, oy 0, hh 2`; `missile.groundSlide` `slideSpeed 3, angle 128, ox 0, oy 4, hw 4, hh 1.5, frames 2`); the four ids sorted (moved here from `behaviors`, which re-exports them) |
| `resolveWeaponPreset(content, id = DEFAULT_WEAPON_PRESET)` | function | → that preset, else the first, else `null` |
| `resolveRoleWeapons(content, preset)` | function | → four `WeaponSpec \| null` in `WeaponRole` order: the preset's (the main role falling back to the first `main`-slot weapon), or the first weapon of each slot without a preset |
| `checkWeaponBehaviors(db)` | function | → `ValidationIssue[]`: `weapons:<id>.behavior` (not a weapon behaviour), `weapons:<id>.params.<name>` (unknown tunable), `weapons:<id>.slot` (wrong slot) — run by the shell's loader and `pnpm content:check` |
| `MAX_PLAYER_SHOTS`, `SHOOTERS_PER_PLAYER`, `MAX_SHOOTERS` | const | `96`; `5` (the ship + 4 Options; shooter id = `player × 5 + k`); `10` |
| `SHOT_CULL_MARGIN`, `SFX_RATE_TICKS`, `PIERCE_TABLES`, `MAX_SHOT_HITS` | const | `16` px (culled outside the view ± this); `4` (one push per cue per 4 ticks); `32` (piercing shots alive at once); `1024` (hits per tick, the rest counted in `hitsDropped`) |
| `SHOT_BATCH_CAPACITY`, `LASER_SEGMENT_LENGTH` | const | `192` (shots + laser segments); `8` px per drawn laser segment |
| `DEFAULT_WEAPON_PRESET`, `FULL_LOADOUT_SPEED_LEVEL` | const | `'type-a'`; `2` |

Firing: while a ship is `alive`, each shooter (ship, then Options) fires its main role every
`config.autofireInterval` ticks (or the weapon's `refireTicks`) and its missile every
`config.missileInterval` ticks when its cap has room, if `config.autofire || config.remoteMode`
or `Shot` / `Sub` is held; the Double pair refires only when both earlier shots are gone.
Shots ride the camera and die on terrain and outside the view ± 16 px.

### `options` — trailing Options (partial: the standard trail)

The standard Option of meter mode (M1-10); Snake / Formation / Rotate and the Option Hunter
arrive with M2-04. Guide: [weapons-and-options.md](weapons-and-options.md#options-coreoptions).

| Export | Kind | Summary |
|---|---|---|
| `OptionGroup` | class | One ship's Options: `count` (flying this tick), `formation` (`'trail'`), `stolen` (0 until M2-04), `head`, `trailX` / `trailY` (screen-space ring of 49), `x` / `y` (world positions of Option `k < count`); `reset(ship, camera)` (every entry and Option on the ship), `follow(ship, camera, count, record)` (records the ship's screen position when `record`, then places Option `k` `(k + 1) × 12` records back plus the camera; `count` clamped 0–4), `hide()` (`count` 0) — none allocates |
| `createOptionGroup()` | function | → an empty group (zeroed trail — `reset` it when the ship spawns) |
| `OptionFormation` | type | `'trail' \| 'snake' \| 'formation' \| 'rotate'` (only `'trail'` before M2-04) |
| `MAX_OPTIONS`, `OPTION_SPACING`, `OPTION_TRAIL_CAPACITY` | const | `4` (D5); `12` recorded steps between neighbours; `49` |
| `OPTION_SPRITE`, `OPTION_ANIM_TICKS` | const | `'options/orb'` (an engine sprite — in `ENGINE_SPRITES`); `8` ticks per pulse frame |

The weapon system records the trail only on ticks with movement input (`PlayerShip.moving`, D26)
and on every fly-in tick, resets it on a fly-in's first tick and hides the group while the ship
is not `alive`.

### `powerups` — power meter, capsules, Mega Crash (partial: meter mode)

Meter mode's power-up economy (M1-11): one 7-slot power meter per player, equipping on the
`PowerUp` press, Auto Power-Up, the capsule pool and Mega Crash. Direct-mode items arrive with
M2-05, `!` variants and Weapon Edit with M2-03. Guide: [powerups-and-shields.md](powerups-and-shields.md).

| Export | Kind | Summary |
|---|---|---|
| `createPowerUpSystem(host)` | function | → `PowerUpSystem` (load time — `createWorld` calls it with the World as host): registers the `items` pool (32), one `PowerMeter` per player, the item and shield batches, the compiled Auto Power-Up order and the sprite ids; throws `Error` when `items` is already registered |
| `PowerUpSystem` | interface | `pool` (`SoaPool<ItemSchema>`), `itemBatch` (`Items`, 32), `shieldBatch` (`Player`, 2 — drawn over the ships), `meters`, `megaPending` (`Uint8Array`, hashed), `outcomes`, `dropsTaken` (hashed), `count`, `maxSpeedLevel` (`speeds.length − 1`); `spawnItem(kind, x, y)` → slot or `-1` (bad kind, full pool); `canEquip(player, slot)`, `equippable(player)` → bit mask (bits 0–6; 0 for a bad player), `nextAutoSlot(player)` → `MeterSlot` or `-1`, `equipHighlighted(player)` → equipped (else `SFX PowerUpDenied`; the cursor stays), `collect(player)` → new cursor (a capsule's effect: advance, ding, Auto Power-Up), `detonateMegaCrash(player)` → enemies destroyed; the World's per-phase `updatePlayers()` (2: pressed `PowerUp` edge of active, not `dying` / `dead` ships), `beginTick()` (3: late drops → capsules), `update()` (5: age, magnet, cull), `collide()` (6: pickups), `resolve()` (7: collect, Mega Crash, shield i-frames and events, drops → capsules), `sync()` (9), `clear()` (session clear: checkpoint restart, `arcade` respawn) — none allocates |
| `PowerUpHost` | interface | What the system reads from its World: `tick`, `config`, `camera`, `players`, `intents`, `ship` (`speeds`, `pickupBox`), `content`, `events`, `fx` (M1-12: Mega Crash's flash goes through `core/fx` `requestFlash`), `pools`, `enemies` (`outcomes`, `megaCrash(by)`), `bullets` (`cancelAll(mode)`), `weapons` (`loadouts`) |
| `PowerUpOutcomes` | interface | The last collision phase's pickups (reset in phase 6): `pickupCount`, `pickupPlayer` (`Int8Array`), `pickupKind`, `pickupX`, `pickupY`, `pickupScore` (300 per capsule — credited by `core/scoring` in phase 7, M1-12) |
| `PowerMeter`, `createPowerMeter()` | class, function | `{ cursor }` — `-1` (nothing highlighted) or a `MeterSlot`; → a meter with nothing highlighted |
| `advanceMeter(meter)` | function | One capsule: `-1 → Speed`, …, `! → Speed` (wraps; any cursor that is not a slot, `NaN` included, → Speed) → the new cursor |
| `canEquipSlot(slot, ship, loadout, maxSpeedLevel)`, `equipSlot(…)` | function | Greyed rules: Speed at the top level, Missile owned, Double / Laser already the main weapon, Option at 4, `?` while a shield is up, `!` never, unknown codes → `false`; applies a slot's effect when allowed (Double / Laser exclusive; `?` = `grantShield`; `!` has no lasting effect) → equipped |
| `equippableSlots(ship, loadout, maxSpeedLevel)` | function | → bit mask of `canEquipSlot` (the HUD greys the rest, M1-16) |
| `meterSlotOf(name)` | function | `MeterSlotName` → `MeterSlot` code (`-1` for an unknown name) |
| `applyDeathPenalty(preset, ship, loadout, meter)` | function | What a death costs (M1-12, D6) — called by the World at the death: every preset `clearShield` (no break event); `'arcade'` basic shot, no Missile, no Options, speed 0, cursor `-1`; `'classic'` `loseOneLevel`, cursor kept; `'casual'` nothing more (any other string too) → the `MeterSlot` classic took, else `-1`. A pending Mega Crash is untouched |
| `loseOneLevel(ship, loadout)` | function | Classic penalty: the first of Option (−1) → Double / Laser (→ basic) → Missile → Speed level (−1) the ship has → that `MeterSlot` (`Double` / `Laser` for the main weapon), `-1` when nothing is left |
| `MeterSlot`, `METER_SLOT_COUNT`, `METER_LABELS` | const + type, const | `Speed 0, Missile 1, Double 2, Laser 3, Option 4, Shield 5 (?), Mega 6 (!)`; `7`; `'SPEED' … '?', '!'` (the `hud/meter-labels` frames) |
| `ItemKind`, `ITEM_KINDS`, `ItemKindSpec` | const + type, const, interface | `Capsule 0` (hashed: append, never renumber); the built-in table `{ sprite, frames, score }` (capsule: `items/capsule`, 2, 300) |
| `ItemFlag` | const | `Dead 1` (collected / culled this tick), `Magnet 2` (pulled this tick) |
| `ITEM_SCHEMA`, `ItemSchema` | const, type | Pool fields `x`, `y`, `vx`, `vy` (f64), `kind` (u8), `age` (i32), `flags` (u8) — hashed in sorted order |
| `ITEM_SPRITES`, `CAPSULE_SPRITE` | const | The item kinds' sprites (part of `ENGINE_SPRITES`); `'items/capsule'` |
| `MAX_ITEMS`, `CAPSULE_SCORE`, `ITEM_RADIUS`, `PICKUP_MAGNET_RANGE`, `PICKUP_MAGNET_SPEED`, `ITEM_CULL_MARGIN`, `ITEM_BLINK_TICKS`, `MEGA_CRASH_FLASH_TICKS` | const | `32`; `300`; `5` px; `16` px (beyond the pickup box); `2` px/tick; `32` px (culled outside the view ± this); `8` ticks per blink frame; `12` (the `Flash` param — `core/fx` `FLASH_KIND_TICKS[FlashKind.MegaCrash]` since M1-12) |
| `DirectItem` | type | `'red' \| 'green' \| 'blue' \| 'orange' \| 'yellow' \| 'octagon'` (Direct mode, M2-05) |

### `shields` — shields (partial: the Force Field)

The Force Field of the meter's `?` slot (M1-11): a hit counter on every ship
(`PlayerShip.shield`), shield-hit i-frames, visible wear and hit / break records. The other meter
shields arrive with M2-04, the Direct-mode Arm tiers with M2-05. Guide:
[powerups-and-shields.md](powerups-and-shields.md#the-force-field-coreshields).

| Export | Kind | Summary |
|---|---|---|
| `ShieldState`, `createShieldState()` | class, function | One ship's shield: `kind`, `hits`, `maxHits`, `iFrames`, `absorbsTerrain`, `hitTick` / `brokeTick` (`-1` = never), `absorbed` (free i-frame hits included) — hashed; → an empty one |
| `ShieldKind`, `SHIELD_KIND_NAMES` | const + type, const | `None 0, ForceField 1` (hashed: append, never renumber); `'none', 'forceField'` |
| `ShieldSpec`, `FORCE_FIELD`, `SHIELD_SPECS` | interface, const | `{ kind, maxHits, iFrames, absorbsTerrain, sprite, wearFrames }`; the Force Field (5 hits, 8 i-frames, no terrain, `shields/force-field`, 4 wear frames); specs by kind (`null` for `None`) |
| `grantShield(state, spec = FORCE_FIELD)` | function | A fresh shield: full hits, i-frames reset to 0, replaces whatever was there |
| `clearShield(state)` | function | Removes it without a break (no hits, no i-frames) |
| `absorbShieldHit(state, terrain, tick)` | function | Called by `playerHit` before a hit reaches the ship → `ShieldHit`: terrain on a shield without `absorbsTerrain` → `None` (i-frames do not help either); i-frames running → `Blocked` (free); a shield up → `Absorbed` (one hit, i-frames start, `hitTick`) or `Broke` (the last hit: `brokeTick`, shield removed, i-frames keep running); else `None`. Never allocates |
| `ShieldHit` | const + type | `None 0, Blocked 1, Absorbed 2, Broke 3` |
| `tickShield(state, tick)` | function | Counts the i-frames down by one — tick phase 7, not on the hit's own tick (a hit on tick `t` blocks `t + 1 … t + 8`) |
| `shieldActive(state)` | function | → a kind other than `None` with hits left (the `?` slot is greyed while true) |
| `shieldWearFrame(state, frames)` | function | → `frames − ceil(hits · frames / maxHits)` clamped to `[0, frames − 1]` (0 without a shield): fresh at 5 and 4 hits, then worn, damaged, critical |
| `FORCE_FIELD_HITS`, `SHIELD_HIT_IFRAMES`, `FORCE_FIELD_SPRITE`, `FORCE_FIELD_WEAR_FRAMES` | const | `5`; `8` (D33); `'shields/force-field'` (an engine sprite); `4` |

### `fx` — hit-stop, shake and flash requests (partial)

The sim side of game feel (M1-12): hit-stop, screen-shake and screen-flash requests set
simulation timers (hashed) and push the matching events; the presentation draws them since M1-14
(render-pixi `effects`, [fx-and-game-feel.md](fx-and-game-feel.md)).
Authentic slowdown is M3-02. Guide: [death-and-scoring.md](death-and-scoring.md#game-feel-corefx).

| Export | Kind | Summary |
|---|---|---|
| `FxState`, `createFxState()` | class, function | One World's effect timers (`world.fx`): `shakeMagnitude`, `shakeTicks`, `shakeDuration`, `shakeTick` (last accepted request, `-1` = never), `flashTicks`, `flashKind`, `flashTick`, `frozen` (this tick started frozen — set by `stepWorld`); → an idle state |
| `FxHost`, `HitStopHost` | interfaces | `{ tick, fx, events }` (the World); + `hitStop` (the World's counter) |
| `requestHitStop(host, ticks)` | function | Raises `host.hitStop` to the request (never lowers it; capped at `MAX_HIT_STOP_TICKS`; ≤ 0 / `NaN` → nothing) and pushes `HitStop` (`param` = ticks) → the counter afterwards. During tick `t`: freezes `t + 1 … t + ticks` |
| `requestShake(host, magnitude, ticks)` | function | Starts a decaying shake unless the running one is at least as strong now (`shakeAmount`), or magnitude / ticks round to 0 → started; pushes `Shake` (`id` = duration, `param` = magnitude). Magnitude floored and capped at 64, ticks at `MAX_FX_TICKS` |
| `requestFlash(host, kind)` | function | Starts (restarts) a flash of `FLASH_KIND_TICKS[kind]` ticks and pushes `Flash` (`id` = kind, `param` = duration) → `false` for an unknown kind |
| `shakeAmount(fx)` | function | → current amplitude `ceil(magnitude · ticksLeft / duration)` in whole px, 0 when idle |
| `tickFx(host)` | function | Phase 9, every tick: hit-stop −1 when the tick was frozen; shake and flash −1 except on their request's tick |
| `ShakeMagnitude` | const + type | `Small 1, Medium 2` (the player's death), `Large 4` px |
| `FlashKind`, `FLASH_KIND_TICKS` | const + type, const | `MegaCrash 0`, `Warning 1` (a boss WARNING pulse), `BossBlast 2` (a boss's final blast) — M1-13 (append, never renumber); durations by kind (`[12, 8, 24]`) |
| `MAX_HIT_STOP_TICKS`, `MAX_FX_TICKS` | const | `60`, `600` |

### `scoring` — scores and the session hi-score (partial)

Per-player scores, the clamp, the session hi-score and the crediting of every scoring event of a
tick (M1-12). Extends, 1UP items and continues arrive with M2-01, name entry with M2-15; the saved
hi-score tables are `save`'s (M1-17). Guide: [death-and-scoring.md](death-and-scoring.md#score-corescoring).

| Export | Kind | Summary |
|---|---|---|
| `PlayerScore` | class | `score` (0 … `MAX_SCORE`), `displayDirty` (set on a change; the HUD clears it) |
| `ScoreBoard`, `createScoreBoard(players = MAX_PLAYERS)` | class, function | `scores` (one per player slot), `hiScore`, `hiScoreDirty`, `setHiScore(value)` (a saved best: only raises, floors, caps; dirty only on a real raise) → the hi-score; → a board at 0 |
| `addScore(host, player, points)` | function | The one way scores change: adds `floor(points)`, clamped at `MAX_SCORE`; ≤ 0 / `NaN` points and bad slots change nothing; marks `displayDirty` and raises the hi-score (marking it dirty) → the score afterwards (0 for a bad slot). Never allocates |
| `ScoreHost`, `ScoringHost` | interfaces | `{ scoring: { board } }`; + `enemies.outcomes`, `powerups.outcomes`, optional `events` (the World — every credited kill worth ≥ 1 point pushes `SimEventKind.Score` there, M1-14; absent = no events) |
| `ScoringSystem`, `createScoringSystem(host)` | interface, function | `world.scoring`: `board`, `killsScored`, `bonusesScored` (hashed — outcomes already credited); `beginTick()` (phase 3: kills / bonuses recorded between ticks, then reset), `resolve()` (phase 7: kills → `killBy`, bonuses → `bonusBy`, pickups → `pickupPlayer`), `clear()` (session clear — scores stay); → a system with every score at 0 |
| `MAX_SCORE` | const | `99_999_990` |
| `HiScoreEntry` | interface | One row of a saved hi-score table (`save` re-exports it and builds rows with `createHiScoreEntry`): `name` (≤ 8 characters, `---` until the name entry of M2-15), `score`, `reached` (a stage id, `''` in open space), `mode` (`1p` in M1), `difficulty` |

### `bosses` — multi-part bosses, the WARNING and the death sequence (partial)

One boss per World (M1-13): an `enemies` entry with a `boss` section, its parts, weak points,
phases, the WARNING and the death sequence. Boss timers / escapes, the HP bar, mid-bosses and
raids arrive with M2-09. Guide: [bosses-and-warning.md](bosses-and-warning.md).

| Export | Kind | Summary |
|---|---|---|
| `createBossSystem(host, behaviors)` | function | → `BossSystem` (load time — `createWorld` calls it with the World as host and `WorldOptions.bossBehaviors ?? DEFAULT_BOSS_BEHAVIORS`): the boss slot with 16 parts, the script API, the parts' batch, the WARNING state, every boss entry compiled (WARNING text, phase tables); a phase script the lookup does not know runs nothing |
| `BossSystem` | interface | `boss`, `batch` (`AirEnemies`, 16), `warning` (`WarningState` = `view.warning`), `active` (WARNING → death sequence); `isBoss(enemyIndex)`, `warningText(enemyIndex)` (`''` for a regular enemy / bad index), `startWarning(enemyIndex)` / `startBoss(enemyIndex)` → started (ignored while a sequence runs or for a non-boss), `damagePart(index, amount, by)` → `BossHit` code, `isArmoured(index)` (live clink rule), `defeat(by = -1)` → a boss in its intro / fight was defeated (tools), `clear()` (session clear); the World's per-phase `update()` (3), `runScript()` (4), `move()` (5), `insertColliders(grid)`, `collidePlayers()` (6), `resolve()` (7), `sync()` (9) — none allocates beyond the phase coroutines |
| `BossHost` | interface | What the system reads from its World: `tick`, `camera`, `players`, `ship`, `content`, `rng`, `events`, `debugFlags`, `bullets`, `fx`, `hitStop`, `status`, `stage` (`{ stage, brake(ticks), unlock() } \| null`), `scoring.board` |
| `Boss` | class | The World's boss slot: `state` (`BossState`), `specIndex`, `x` / `y` (world origin), `screenX` / `screenY` (playfield — the boss rides the camera), `homeX` / `homeY`, `startX`, `introTicks`, `stateTicks`, `phase`, `phaseTicks`, `script` / `wakeTick` (`ScriptHolder`), `motion` + `trackSpeed` / `trackMin` / `trackMax` / `moveFrom*` / `moveTo*` / `moveTicks` / `moveElapsed`, `destroyedMask`, `coreMask`, `killer` (player credited with the last core, -1), `blasted`, `partCount`, `parts` (16 `BossPart`) |
| `BossPart` | class | One part (a `LaserSource`): `index`, `slot` (`BOSS_PART_ID_BASE` + index), `active`, `name`, `parent`, `localX` / `localY`, `x` / `y` (world centre), `hurtbox`, `hw` / `hh`, `hp` / `maxHp`, `vulnerable` (`BossVulnerable`), `requires` (mask), `core`, `gun`, `destroyed`, `open`, `spriteId`, `animFrames` / `animTicks` / `frame`, `flashTicks`, `score`, `explosion`, `target` / `armoured` (phase-6 snapshot) |
| `BossState`, `BOSS_STATE_NAMES` | const + type, const | `None 0, Warning 1, Intro 2, Fight 3, Dying 4, Dead 5` (hashed — append only); `'none'` … `'dead'` |
| `BossVulnerable` | const + type | `Always 0, AfterParts 1, WhenOpen 2, Never 3` (= `BOSS_VULNERABILITIES` order) |
| `BossHit` | const + type | `damagePart`'s answer: `None 0` (no boss in intro / fight, part gone — the shot flies on), `Clink 1` (cannot take damage now — the shot dies), `Damaged 2`, `Destroyed 3` |
| `BossMotion` | const + type | `Hold 0`, `Track 1` (the nearest player's height), `MoveTo 2` (eased, then hold) |
| `BossScriptApi` | interface | What a boss behaviour sees — one reused object: `self`, `tick`, `rng` (gameplay), `phase`, `partCount`, `bullets`; `target()`, `partIndex(name)` (script start only), `isDestroyed(i)`, `setOpen(i, open)`, `setOpenAll(open)`, `setPartOffset(i, x, y)`, `hold()`, `track(speed, minY, maxY)`, `moveTo(x, y, ticks)`, `canFire(i)` (fighting, part standing), `fireWait(ticks)`; from part `i`'s centre (no-ops while `canFire(i)` is false): `aimed(i, speed, kind)`, `nWay(i, count, step, speed, kind, angle?)`, `ring(i, count, speed, kind, offset?)`, `spray(i, count, spread, min, max, kind, angle?)`, `laser(i, angle?, length = 384, width?, telegraph?, grow?, active?, fade?, attach = true)` |
| `BossBehavior`, `BossBehaviorLookup`, `EMPTY_BOSS_BEHAVIORS` | interfaces, const | `{ id, params, create(api, params) → Script }`; `get(id)` (`core/behaviors` provides both); a lookup that knows nothing (bosses run no script) |
| `WarningState` | class | The live `WarningView`: `active`, `ticks`, `duration` (`WARNING_TICKS`), `text` |
| `WARNING_TEMPLATE`, `formatWarningText(displayName, code)` | const, function | `'WARNING!!\nGIANT HOSTILE "{name}"\nCLOSING IN - CODE {code}'` (D10 — the game's own words; ASCII `-` for D10's dash); → the filled text (load time, allocates) |
| `BOSS_PART_ID_BASE`, `MAX_HIT_TARGETS` | const | `64` (= `MAX_ENEMIES` — part `i` is hit / grid / laser-source id 64 + i); `80` |
| `WARNING_TICKS`, `WARNING_PULSE_TICKS`, `WARNING_BRAKE_TICKS`, `WARNING_DIM_PERCENT`, `WARNING_MUSIC_FADE_TICKS` | const | `180`, `60` (siren + flash on 0 / 60 / 120), `60`, `50`, `30` |
| `BOSS_CHAIN_TICKS`, `BOSS_CHAIN_INTERVAL`, `BOSS_BLAST_HIT_STOP_TICKS`, `BOSS_BLAST_SHAKE_TICKS`, `BOSS_TALLY_TICKS`, `BOSS_CLEAR_TICKS`, `BOSS_MUSIC_FADE_TICKS`, `BOSS_ENTRY_MARGIN` | const | The death sequence in simulated ticks: chain until `120` (the blast on its last tick), an explosion every `8`, hit-stop `5`, large shake `40`, tally on `121`, `stageClear` on `180`; boss-music fade `60`; the intro starts `8` px past the right edge |

### `ui` — canvas UI kit and the HUD (partial)

Widgets as plain state with numeric results, draw-list builders and the change-detected HUD
(M1-16). Guide: [scenes-and-ui.md](scenes-and-ui.md).

| Export | Kind | Summary |
|---|---|---|
| `createListMenu(items, { focus?, disabledMask?, wrap? })` | function | → `ListMenu` (load time); `items` = 1–31 `MenuItemSpec`s (a label = an action, `{ label, slider }`, `{ label, toggle }`, `{ label, choice }` — M1-17; the first one given wins); focus = the first enabled item at or after `focus` (default 0); `wrap` default `true`; throws `RangeError` for 0 or > 31 items |
| `ListMenu` | class | `items` (frozen `MenuItem`s), `focus`, `disabledMask` (bit `i` = item `i` disabled), `wrap`, `lockTicks` (activation held back after opening), `confirmBuffer`, `repeat` (`DirectionRepeat`), `revision` (bumped on every visible change); `enabled(i)`, `setDisabled(i, disabled)` (a disabled focused item passes the focus on), `focusFirstEnabled(from)`, `open(lockTicks = 0)` (clears the repeat and the buffer) |
| `MenuItem`, `MenuItemKind`, `MenuItemSpec`, `ListMenuOptions` | interface, const + type, type, interface | `{ label, kind, slider, toggle, choice }`; `Action 0`, `Slider 1`, `Toggle 2`, `Choice 3` (M1-17); the `createListMenu` input |
| `createSlider(min, max, step, value)`, `Slider` | function, class | `value` clamped to `min…max`, changed by `step` per Left / Right (clamped); throws `RangeError` when `max < min` or `step ≤ 0` |
| `createToggle(value)`, `Toggle` | function, class | `value: boolean`; Left = off, Right = on, Confirm flips |
| `createChoice(labels, index = 0)`, `Choice` | function, class | One of several labels (M1-17 — the Options screen's CONTROLS): `labels` (1–255, copied and frozen), `index` (clamped into range), `label` (getter); Left / Right step it and wrap, Confirm steps forward; a single label never changes; throws `RangeError` for 0 or > 255 labels |
| `menuTick(menu, input)` | function | → `MenuResult`: Confirm refills the 4-tick buffer; Back wins (`Back`, buffer cleared); while `lockTicks > 0` activation waits (lock and buffer count down, the focus still moves); otherwise a buffered Confirm activates (`Denied` on a disabled item, `Changed` for a toggle or a choice of two or more labels — stepped forward, else `Confirmed` — read `menu.focus`); then the auto-repeated direction: Up / Down move over enabled items (`Moved`), Left / Right change the focused slider / toggle / choice (`Changed`). Never allocates |
| `createConfirm(question)`, `Confirm` | function, class | A YES / NO prompt focused on **NO**: `question`, `focus` (`ConfirmChoice`), `lockTicks`, `confirmBuffer`, `repeat`, `revision`, `open(question?, lockTicks = 0)` (back to NO) |
| `confirmTick(confirm, input)` | function | → `MenuResult`: Left / Up → YES, Right / Down → NO (`Moved`, no wrap), a buffered Confirm → `Confirmed` (read `focus`), Back → `Back`; the same buffer and lock rules as `menuTick`. Never allocates |
| `ConfirmChoice` | const + type | `Yes 0`, `No 1` |
| `MenuResult`, `menuResultSfx(result)` | const + type, function | `None 0`, `Moved 1`, `Changed 2`, `Confirmed 3`, `Back 4`, `Denied 5`; → `SFX_CUES.MenuMove` (moved / changed), `MenuSelect` (confirmed), `MenuBack` (back **and** denied), `-1` for none |
| `repeatDirections(state, input)`, `DirectionRepeat` | function, class | → one direction bit to act on this tick: a new press at once (lowest bit wins), the held one after `MENU_REPEAT_DELAY` ticks and then every `MENU_REPEAT_INTERVAL`; a latched tap acts once; `{ dir, held, reset() }` |
| `MENU_REPEAT_DELAY`, `MENU_REPEAT_INTERVAL`, `MENU_CONFIRM_BUFFER_TICKS` | const | `18`, `6`, `4` |
| `drawPanel(list, x, y, w, h, fill?, border?, alpha = 232)` | function | A filled box with a 1-px border (5 rects) |
| `drawMenu(list, menu, stringBase, layout)` | function | → the y below the last row: labels (focus colour + `→` cursor, disabled dimmed), a slider's 50-px bar and value, a toggle's `ON` / `OFF`, a choice's current label; uses string slots `stringBase … + menuStringSlots(menu) − 1`, written only when changed. `layout` must be a constant (a literal per call allocates) |
| `MenuLayout` | interface | `x`, `y`, `lineHeight?` (12), `align?` (`TextAlign`, Left), `cursorX?` (`x − 10`), `valueX?` (`x + 80` — slider bars, `ON` / `OFF`, choice labels) |
| `menuStringSlots(menu)`, `CONFIRM_STRING_SLOTS` | function, const | `items + 3 + choices` (items, `ON`, `OFF`, cursor, then one per choice item for its label — M1-17); `4` (question, YES, NO, cursor) |
| `drawConfirm(list, confirm, stringBase, cx, cy)` | function | A 176×52 opaque panel centred at `(cx, cy)` with the question (≤ 2 lines) and YES / NO, the focused one highlighted with the cursor |
| `UI_COLORS` | const | `text`, `focus`, `disabled`, `panel`, `border`, `title`, `alert`, `track` (0xRRGGBB) |
| `buildHud(world, list, sprites?)` | function | Clears `list` and draws the whole HUD (top bar `1P` / `HI` / `2P` or `------`, stock icons, the 7-slot meter with its flashing highlight and greyed slots, Force Field pips); **clears the scores' `displayDirty` and `hiScoreDirty`**; ≤ 32 commands, string slots 0–3; never allocates |
| `createHud(sprites?)`, `Hud` | function, class | `Hud { sprites, builds, update(world, list) → rebuilt?, invalidate() }` — `update` compares the dirty flags, lives, player 2, the meter cursor and equippable mask, the flash phase (only while a slot is highlighted) and the shield's hits, and calls `buildHud` only on a change (or a different World / list) |
| `HUD_LAYOUT`, `HUD_COLORS`, `HUD_STRING_SLOTS`, `HUD_METER_FLASH_TICKS` | const | Positions (`p1X` 8, `hiX` 156, `p2X` 292, numbers `+16`, `digits` 8, `stockX` 4 / 10 px / `stockIcons` 5, `meterX` 58, `slotW` 40, `shieldX` 344, `topY` 0, `bottomY` 208); the bar and label colours; `{ p1: 0, hi: 1, p2: 2, dashes: 3 }`; `8` |
| `UI_SPRITES`, `UiSprites`, `resolveUiSprites(content)` | const, interface, function | `hud/life`, `hud/meter-slot` (frames normal / highlighted / disabled), `hud/meter-labels` (one frame per `MeterSlot`), `ui/logo` — part of `ENGINE_SPRITES`; → `{ life, meterSlot, meterLabels, logo }` ids, `-1` for a sprite the content lacks (drawn as rectangles / text instead) |
| `TextMetrics` | type | Re-exported from `presentation` |

### `scenes` — scene stack and the M1 flow (partial)

The scene stack and the M1 scene set (M1-16), the Options screen and the saved hi-scores in the
flow (M1-17). Guides: [scenes-and-ui.md](scenes-and-ui.md),
[saves-and-options.md](saves-and-options.md).

| Export | Kind | Summary |
|---|---|---|
| `createSceneStack()`, `SceneStack` | function, class | Depth `SCENE_STACK_DEPTH` (8): `depth`, `top`, `pending`, `revision`, `capacity`, `sceneAt(i)` (0 = bottom — not `at()`: the Chrome-69 lint rule rejects any `.at(` call), `contains(scene)`, `push` / `pop` / `replace` / `reset(scene)` (deferred while a scene ticks, applied in request order at the end of the tick — also those the hooks request — at once otherwise), `tick(input)` (the top scene only, then `flush()`), `flush()`. Throws `RangeError` on a full stack, a scene already on it, more than 8 requests in one tick or a runaway chain (> 64); never allocates |
| `Scene` | interface | `id`, `overlay` (the scene below stays drawn, frozen), `inputContext` (`'game'` / `'menu'`), `dim` (0…1 under the UI), `uiRevision` (bumped when `drawUi` would draw something else), `enter()`, `exit()`, `cover()`, `uncover()`, `tick(input)`, `drawUi(list)` |
| `SceneId` | type | `'boot' \| 'title' \| 'game' \| 'pause' \| 'stageClear' \| 'gameOver' \| 'confirm'` plus the named M2 screens (`'attract'`, `'select'`, `'map'`, `'options'`, `'nameEntry'`, `'hiScore'`, `'ending'`, `'credits'`) |
| `createSceneFlow(host, start = 'boot')` | function | → `SceneFlow`, started on `'boot'` / `'title'` / `'game'` (`SceneStart`). Creates every scene, menu and draw list and the game scene's placeholder World (then **clears `host.events`**); throws `RangeError` if the scenes need more than 96 UI string slots, or what `host.createWorld()` throws. `createGame(…, { scenes })` calls it |
| `SceneFlowHost` | interface | `config`, `content`, `events`, `exit` (`platform.exit` or `null` — no EXIT item, Back on the title only backs out), `createWorld()` (a fresh World pushing into `events`), `save?` (a `SaveStore`; omitted / `null` = memory-only with the defaults — M1-17), `inputProfiles?` (`InputProfileSetup`; omitted / `null` = CONTROLS disabled — M1-17) |
| `InputProfileSetup` | interface | `{ choices: InputProfileChoice[], active: string \| null }` — the profiles CONTROLS steps through, in order, and the id in use (`null` / unknown → the first choice is shown) (M1-17) |
| `SceneFlow` | interface | `stack`, the eight scenes (`boot`, `title`, `game`, `pause`, `stageClear`, `gameOver`, `confirm`, `options`), `save` (the host's store or a memory-only one), `modeKey` (`hiScoreModeKey(config)` — the table the session's games go into), `inputProfiles` (the choices, `[]` = CONTROLS disabled), `activeInputProfile` (index of the profile in use, −1 = none of them; changed by the Options screen), `inputContext`, `world` (the game scene's), `menuInput` (every player merged, reused), `hiScore` (the session's best), `view` (`SceneFlowView`), `tick(input)`, `updateFrame()` (once per displayed frame: World view + HUD while the game is visible, the top dim, the UI list rebuilt only when the visible set or a `uiRevision` changed), `setBootProgress(fraction, label?)`, `finishBoot()`, `onResume()` (pause menu over a running game), `setHiScore(value)` (raise only; floored, capped at `MAX_SCORE`). The session hi-score starts from `save.bestScore(modeKey)` (M1-17) |
| `SceneFlowView` | interface | `tick`, `world` (`WorldView \| null`), `hud`, `ui`, `dim` — what `Game.renderFrame()` copies |
| `SceneStart` | type | `'boot' \| 'title' \| 'game'` |
| `BootScene` | class | `progress`, `label`, `done`; holds until `finishBoot()`, then the title |
| `TitleScene` | class | `menu` (START / OPTIONS — the Options screen, enabled since M1-17 / EXIT only with `platform.exit`), `phase` (0 `PRESS OK`, 1 menu), `menuOpen`; the logo, a 32-tick blink, the session hi-score (from the save's best), the title music; Back → the exit confirmation, or (no exit) back to `PRESS OK` |
| `GameScene` | class | `world`, `hud`, `hudList` (64 commands), `starts`, `restart()` (also counts `gamesStarted` in the save — M1-17); `inputContext` `'game'`; Pause / Back (any player) → pause menu; opens stage clear `STAGE_CLEAR_DELAY_TICKS` / game over `GAME_OVER_DELAY_TICKS` World ticks after the status changed; draws the boss WARNING band |
| `PauseScene` | class | Overlay, dim `PAUSE_DIM`: `menu` (RESUME / OPTIONS — the Options screen over the frozen game, M1-17 / RETRY STAGE / QUIT TO TITLE); Pause / Back / RESUME resume, RETRY restarts without a confirmation, QUIT asks |
| `OptionsScene` | class | Overlay, dim `PAUSE_DIM`, an opaque 288×112 panel (M1-17): `master`, `music`, `sfx` (`Slider`s 0–10, step 1), `controls` (`Choice` of the profile labels, `DEFAULT` alone and disabled without profiles), `menu`; `enter()` reads the save's volumes and the profile in use, focus MASTER, 2-tick lock; a change pushes a `UserOption` event at once (`MasterVolume` / `MusicVolume` / `SfxVolume` = level, `InputProfile` = choice index) with the move sound; OK on a slider is silent; BACK / Back store the levels and — when CONTROLS changed — the profile id (`save.setOptions`), `save.flush()`, `MenuBack`, pop |
| `StageClearScene` | class | Overlay (dim 0.25): `phase`, `ticks`, `rank` (player 1's place in the saved table, −1 = not entered); `enter()` records the run (scores, `stagesCleared`, flush — M1's run ends here); tally `STAGE_CLEAR_TALLY_TICKS` → `TO BE CONTINUED` `STAGE_CLEAR_CONTINUED_TICKS` → title; OK skips |
| `GameOverScene` | class | Overlay (dim 0.35): `ticks`, `rank`; `enter()` records the run (scores, `gameOvers`, flush) and the panel shows `NEW HI-SCORE` below it when `rank` is 0; OK / Back after `GAME_OVER_LOCK_TICKS`, or `GAME_OVER_TIMEOUT_TICKS` → title |
| `ConfirmDialog` | class | Overlay, dim `PAUSE_DIM`: `prompt` (`Confirm`), `purpose`, `prepare(purpose)`; YES on `Exit` pops, then `host.exit()`; YES on `QuitToTitle` resets to the title; NO / Back close |
| `ConfirmPurpose`, `TitleItem`, `PauseItem`, `OptionsItem` | const + type, const, const, const | `Exit 0`, `QuitToTitle 1`; `Start 0`, `Options 1`, `Exit 2`; `Resume 0`, `Options 1`, `Retry 2`, `Quit 3`; `Master 0`, `Music 1`, `Sfx 2`, `Controls 3`, `Back 4` (M1-17) |
| `mergeMenuInput(snapshot, out)` | function | → `out` = the OR of every player's `held` / `pressed` / `released`, player 1's device; never allocates |
| `SCENE_STACK_DEPTH`, `STAGE_CLEAR_DELAY_TICKS`, `GAME_OVER_DELAY_TICKS`, `GAME_OVER_TIMEOUT_TICKS`, `GAME_OVER_LOCK_TICKS`, `STAGE_CLEAR_TALLY_TICKS`, `STAGE_CLEAR_CONTINUED_TICKS`, `PAUSE_DIM` | const | `8`, `90`, `30`, `600`, `30`, `240`, `240`, `0.5` |

### `save` — versioned saves, hi-score tables

The persisted save (M1-17): options, hi-score tables and stats as one versioned JSON document
under `Platform.storage`, with migrations, defensive parsing and write-on-change. Pure — the
storage comes in as a `PlatformStorage`. Guide: [saves-and-options.md](saves-and-options.md).

| Export | Kind | Summary |
|---|---|---|
| `SaveData` | interface | `{ version, options: UserOptions, hiScores: Record<modeKey, HiScoreEntry[≤ 10]>, stats: SaveStats }` — frozen |
| `SaveStats` | interface | `gamesStarted` (START and RETRY STAGE), `gameOvers`, `stagesCleared` — whole numbers, capped at 2³¹−1 |
| `HiScoreEntry` | type | Re-exported from `scoring` |
| `SAVE_VERSION`, `SAVE_STORAGE_KEY`, `SAVE_CORRUPT_KEY` | const | `1`; `'save.v1'` (the adapters prefix it: `shmup-cup:save.v1`; the key stays for the whole format family — the document's `version` drives migrations); `'save.corrupt'` (where a corrupt or unreadable text is copied) |
| `HI_SCORE_TABLE_SIZE`, `DEFAULT_HI_SCORE_NAME`, `HI_SCORE_NAME_MAX`, `MAX_HI_SCORE_TABLES` | const | `10`; `'---'` (until the name entry, M2-15); `8`; `32` |
| `SaveMigration`, `SAVE_MIGRATIONS` | interface, const | `{ from, to, migrate(data) }` (must not throw for any input); frozen steps, `SAVE_MIGRATIONS[n]` = version n → n + 1. Step 0 → 1 reads the pre-release layout (flat `hiScores` list → the `meter-normal` table, float volumes 0–1 → levels, `profile` → `input.profileId`, `unlocks` dropped). Append a step and bump `SAVE_VERSION` for a new format; never edit a shipped one |
| `createDefaultSave()` | function | → a frozen document: `DEFAULT_USER_OPTIONS`, no tables, zero stats |
| `migrateSave(data, migrations = SAVE_MIGRATIONS)` | function | → `{ data, fromVersion }` (not yet sanitised; no `version` = 0); throws `RangeError` for a version that is not a non-negative integer, newer than `SAVE_VERSION`, or without a step |
| `sanitizeSave(data)` | function | → a frozen, valid `SaveData` from a migrated document — never throws: options through `resolveUserOptions`; only lower-case kebab mode keys ≤ 32 characters, ≤ 32 tables in key order; rows need a finite score ≥ 0 (floored, capped at `MAX_SCORE`), texts cut, tables sorted best first (stable) and cut to 10, empty ones dropped; stats whole numbers ≥ 0 (never `-0`); unknown fields dropped |
| `parseSave(text, migrations?)`, `ParsedSave`, `SaveStatus` | function, interface, type | JSON → migrations → sanitiser, never throws → `{ data, status, fromVersion, reason }`; `status` `'empty'` (null text), `'ok'`, `'migrated'`, `'corrupt'` (not JSON / not an object → defaults), `'unreadable'` (bad or newer version, a missing or throwing migration → defaults) |
| `serializeSave(data)` | function | → compact JSON, **canonical**: fixed field order, tables in key order, rows field by field — equal documents give equal text however their tables were built |
| `loadSave(storage)`, `LoadedSave` | function, interface | → `Promise<LoadedSave>` (`ParsedSave` + `text`); never rejects (a failing `get` = empty); a corrupt / unreadable text is copied to `save.corrupt` (awaited, best effort); the main key is left for the next flush |
| `writeSave(storage, data)` | function | Writes unconditionally → `Promise<void>`; rejects when the storage rejects. Hosts use `SaveStore.flush` |
| `createHiScoreEntry(score, fields?)` | function | → a frozen row: score floored and capped (negative / non-finite → 0), name cut to 8 (missing / empty → `---`), `reached` / `mode` / `difficulty` cut to 32 (missing → `''`) |
| `insertHiScore(table, entry)`, `HiScoreInsert` | function, interface | → `{ table, rank }` — a new table (the input unchanged; the same array when the row did not enter) and the rank (0 = best, −1): a row enters when the table has < 10 rows or it beats the 10th; ties go below the older rows; a score of 0 never enters |
| `hiScoreModeKey(config)` | function | → `<powerUpMode>-<difficulty>` (`'meter-normal'` in M1) |
| `SaveStore`, `createSaveStore(storage, loaded?)` | class, function | The document the game plays with: `storage` (`null` = memory only), `data`, `options`, `dirty` (serialises — not for hot paths), `writes`; `setOptions(options)` (sanitised), `hiScores(modeKey)` (empty table when none), `bestScore(modeKey)`, `recordScore(modeKey, entry)` → rank or −1 (bad mode key, a 33rd table, not entered), `count(stat)` (stops at 2³¹−1) — all in memory until `flush()` → `Promise<boolean>` (writes only when the canonical text differs from the stored one; `true` = written; never rejects; a failed write makes the next flush write). `createSaveStore` counts the loaded text as stored only for status `'ok'` |

### `module-info`

`defineModule({ name, status, specRefs })` → frozen `ModuleInfo`; `ModuleStatus` =
`'placeholder' | 'partial' | 'implemented'`. Every module exports one as `moduleInfo`.

### Placeholder modules

Types only. They are **not** exported from the package entry yet (the `exports` map has
only `"."`), so today they can only be imported with relative paths from inside
`packages/core`. A module's exports join `src/index.ts` when it is implemented — as
`rng`, `math`, `events` and `pools` did in M1-01, `world`, `player`, `collision` and
`debug` in M1-06, `stage` in M1-07, `enemies`, `patterns` and the new `behaviors` in
M1-08, `bullets` and `rank` in M1-09, `weapons` and `options` in M1-10, `powerups` and
`shields` in M1-11, `scoring` and `fx` in M1-12, `bosses` in M1-13, `ui` and `scenes` in
M1-16, and `save` (with the `config` user options) in M1-17.

| Module | Declared types | Planned functions (from the source comments) |
|---|---|---|
| `replay` | `Replay`, `ReplayHeader` | `createRecorder`, `recordTick`, `encodeReplay` / `decodeReplay`, `createPlayback` |

Still planned inside the partial modules: `config` — difficulty-preset tables (M2-01), display
options (M2-08 / M2-16); `save` (implemented) — unlocks, save v2 with the M2-16 options, names from
the name entry (M2-15); `player` (implemented for P0) — co-op joining and
leaving (M2-06), continues (M2-01); `scoring` — `checkExtend` and the lives cap, continues
(M2-01); `fx` — authentic slowdown (M3-02); `collision` — circle chains
(M2-02), destructible tiles (M2-07); `debug` — `createDebugControls(game)` (M1-19, built on
`skipToBoss` / `StageRunner.jumpTo`); `stage`
(implemented for P0) — time-keyed events, diagonal scrolling, branches (M2-07, M2-10);
`patterns` — `compilePattern` (M2-02); `enemies` — rank modifiers and revenge bullets (M2-01),
the Option Hunter (M2-04); `behaviors` — the behaviours of the M2 zones (M2-11 … M2-14);
`bosses` — boss timers and escapes, the HP bar, mid-bosses, raids, boss-inside-boss, double
bosses, boss rush (M2-09), rotating part transforms; `bullets` (implemented for P0) — bending lasers, cancel into
points, the pattern DSL's bullets (M2-02), graze (P2); `rank` — rank growth and the difficulty
preset tables (M2-01); `weapons` — loadouts B–D, Weapon Edit and weapon select (M2-03),
Direct-mode families (M2-05); `options` — Snake / Formation / Rotate and the Option Hunter
(M2-04), option recovery after death (M3); `powerups` — Direct-mode items `applyDirectItem`
(M2-05), `!` variants and Weapon Edit (M2-03); `shields` — front pods, Free / Rotate Shield and
Reduce (M2-04), the Arm tiers with repair (M2-05); `scenes` — more option groups (controls,
display, game — M2-16), attract mode, mode / ship / weapon select, the zone map, name entry, the
hi-score table screen, ending and credits (M2); `ui` — the key-rebind prompt and the name entry (M2-15 / M2-16), the boss HP
bar, the Direct-mode tier pips and the co-op P2 meter (M2).

## `@shmup/input-web`

Keyboard / remote / gamepad → the core's `InputSnapshot`, driven by the data-driven input
profiles of `content/input/` (decisions D13–D15). Guide: [input-profiles.md](input-profiles.md).

| Export | Module | Summary |
|---|---|---|
| `createWebInput({ keyTarget, getGamepads?, bindings?, keyDevice? })` | `web-input` | → `WebInput`. `poll()` once per tick (ages the debounce first); *reused* snapshot. `poll()`, `setContext()` and the event handlers never allocate |
| `WebInput` | `web-input` | `PlatformInput` + `keyboard`, `context` (`'game'` initially), `keyProfile`, `gamepadProfile` (`null` = built-in defaults), `setProfile(profile)` (key profiles → keyboard source and reported device; gamepad profiles → every pad), `setContext(ctx)` (no-op when unchanged; remembered without a profile), `clear()`, `destroy()` |
| `WebInputOptions` | `web-input` | `keyTarget`, `getGamepads?`, `bindings?` and `keyDevice?` (used until a profile is applied) |
| `createKeyboardSource(target \| null, bindings, tuning = DEFAULT_INPUT_TUNING)` | `keyboard` | → `KeyboardSource`: `held` (tracked keys, SOCD + diagonal policy applied; computed on read), `bindings`, `tuning`, `consumeLatched()`, `advance()` (one debounce poll per tick), `setBindings(table)` (held keys keep only actions common to both tables), `setTuning(t)`, `clear()`, `handleEvent(e)`, `detach()` |
| `KeyEventLike` | `keyboard` | The `KeyboardEvent` fields read (tests pass plain objects) |
| `MAX_TRACKED_KEYS` | `keyboard` | `32` — physical keys tracked at once (fixed slots) |
| `readGamepadActions(pad, state, buttons?, previousButtons?)` | `gamepad` | → held mask of one pad; updates stick hysteresis, `pressedButtons`, clears released `staleButtons` (a stale button gives `buttons[i] & previousButtons[i]`) |
| `GamepadLike`, `GamepadReadState` | `gamepad` | Pad fields read; per-pad `stickDirections`, optional `pressedButtons` / `staleButtons` bitmasks (indices 0–31) |
| `DEFAULT_GAMEPAD_BUTTONS`, `STICK_DEADZONE` (0.2), `STICK_HYSTERESIS` (0.1) | `gamepad` | Built-in standard-mapping button → actions table (fallback before a profile) and stick tuning |
| `findKeyActions(code, keyCode, bindings)` | `keymap` | → mask, `0` (known, no action in this table) or `-1` (unknown key); `code` first, and a `code` entry of `0` falls through to the `keyCode` table |
| `resolveKeyActions(code, keyCode, bindings)` | `keymap` | → mask; unknown → `0` |
| `KeyBindings` | `keymap` | `{ byCode, byKeyCode }` → `ActionMask` |
| `DEFAULT_CODE_BINDINGS`, `DEFAULT_KEYCODE_BINDINGS`, `DEFAULT_KEY_BINDINGS` | `keymap` | Built-in fallback tables used before a profile is applied (one merged table, no contexts) |
| `TIZEN_KEY_CODES` | `keymap` | Remote key codes: arrows 37–40, Enter 13, Back 10009, MediaPlayPause 10252, Ch± 427/428, colours 403–406 |
| `createReleaseDebouncer(ticks, capacity = 32)` | `remote` | → `ReleaseDebouncer { ticks, capacity, setTicks, press(slot) → 'new' \| 'resumed' \| 'held', release(slot) → released now, isHeld, isReleasing, poll() → released count, reset, clear }`. A keyup between polls N and N+1 stays held through poll N+`ticks`, released on N+`ticks`+1; a keydown inside the window resumes without an edge. `ticks` clamped to 0…10, capacity floored, ≥ 1 (also for `NaN`); never allocates |
| `resolveDirections(mask, order, diagonals, socd)` | `remote` | → mask: SOCD per axis, then the diagonal policy (`order[bit]` = press order, higher = newer; ties: SOCD → neutral, `lastWins` → vertical, `firstWins` → horizontal). Pure, non-direction bits untouched |
| `createDirectionOrder()` | `remote` | → `DirectionOrder { order: Int32Array(4), update(mask), reset() }` — press order for polled devices (one per pad) |
| `InputTuning`, `DEFAULT_INPUT_TUNING` | `remote` | `{ releaseDebounceTicks, diagonals, socd }`; default `0` / `'combine'` / `'neutral'` |
| `DiagonalPolicy`, `DIAGONAL_POLICIES`, `SocdPolicy`, `SOCD_POLICIES` | `remote` | `'combine' \| 'lastWins' \| 'firstWins'`; `'neutral' \| 'lastWins'` |
| `MAX_RELEASE_DEBOUNCE_TICKS`, `DIRECTION_MASK`, `DIRECTION_COUNT` | `remote` | `10`; `Up \| Down \| Left \| Right` (bits 0–3); `4` |
| `parseInputProfiles(data, path = '')` | `rebind` | One `input-profiles` body → `InputProfilesResult { profiles, issues }`; schema (core combinators) + semantic checks; a bad profile is dropped, the others kept; never throws for bad data |
| `loadInputProfiles(files)` | `rebind` | All files (sorted by path) → `InputProfilesResult`; ids unique across files (first wins). The owner of kind `input-profiles` |
| `createInputProfileRegistry()` | `rebind` | → `InputProfileRegistry { profiles, issues, load(files) → issues, get(id) → profile \| null }`; `load` (safe unbound) is the content owner an app passes to `bootShell`; each load replaces the last |
| `chooseInputProfile(profiles, candidateIds, devices)` | `rebind` | → the first candidate id naming a profile of one of `devices`, or `null` (`null` / unknown / wrong-device ids skipped) |
| `overrideInputTuning(profile, tuning)` | `rebind` | → new frozen profile with tuning replaced (`?debounce=`); debounce clamped 0…10, floored, forced 0 for gamepads; tables shared |
| `selectableKeyProfiles(profiles, keySpace)`, `KeySpace` | `rebind` | → the keyboard / remote profiles whose **menu** table binds Up, Down, Left, Right, Confirm and Back through the host's key space, in input order (M1-17 — what an Options screen may offer without locking the player out); `'code'` (desktop keyboards: `keyboard-default`, `keyboard-remote-emulation`) \| `'keyCode'` (the TV remote: `tizen-remote-*`); gamepad profiles never |
| `inputProfileChoices(profiles, keySpace, defaultId, extra = null)`, `DEFAULT_PROFILE_SUFFIX` | `rebind` | → a fresh `InputProfileChoice[]` of the selectable profiles (+ `extra` — e.g. a `?profile=` override in use — appended when missing), the default's label suffixed; `' (DEFAULT)'` (M1-17) |
| `loadInputProfileChoice(storage)`, `saveInputProfileChoice(storage, id)` | `rebind` | Persistence hook (`Platform.storage` key `INPUT_PROFILE_STORAGE_KEY` = `'input.profile'`); load resolves `null` on a missing / empty value or a storage error. **Unused since M1-17** — the apps keep the choice in the `core/save` document (`options.input.profileId`) |
| `InputProfile` | `rebind` | `InputTuning` + `id`, `label`, `device`, `context: { game, menu }` (as written), `register`, `tables: { game, menu }` (compiled); frozen |
| `ProfileBindings`, `ContextTables` | `rebind` | As written: `{ byCode, byKeyCode, buttons? }` → action names; compiled: `{ keys: KeyBindings, buttons: ActionMask[] }` — keys bound only in the other context have mask `0` |
| `InputProfileDevice`, `INPUT_PROFILE_DEVICES`, `KEY_PROFILE_DEVICES` | `rebind` | `'keyboard' \| 'remote' \| 'gamepad'`; all three; `keyboard` + `remote` (profiles the keyboard source takes) |
| `INPUT_PROFILES_KIND` | `rebind` | `'input-profiles'` |
| `REQUIRED_CONTEXT_ACTIONS` | `rebind` | `game`: `Up, Down, Left, Right, Pause`; `menu`: `Up, Down, Left, Right, Confirm, Back` |
| `SYSTEM_REMOTE_KEYS` | `rebind` | `Exit`, `VolumeUp`, `VolumeDown`, `VolumeMute` — never registered |
| `DEFAULT_KEYBOARD_PROFILE_ID`, `DEFAULT_REMOTE_PROFILE_ID`, `DEFAULT_GAMEPAD_PROFILE_ID` | `rebind` | `'keyboard-default'`, `'tizen-remote-safe'`, `'gamepad-standard'` |
| `InputProfilesResult`, `InputProfileRegistry` | `rebind` | Types above |

`rebind` is `partial`: the profile choice of the M1-17 Options screen is there (selectable
profiles, choices); the rebinding UI helpers (capture the next input, conflict detection, reset
to defaults, a per-device choice) arrive with M2-16. The
placeholder types `RemoteTuning` and `DeviceBindings` of the skeleton were replaced by
`InputTuning` and the profile types.

## `@shmup/audio-web`

The Web Audio back-end and the game's audio (M1-15): a deterministic synth, the `sfx` / `music`
content kinds, the SFX voice manager, the looping music player and the engine the shell feeds
with sim events. Guide: [audio.md](audio.md).

| Export | Module | Summary |
|---|---|---|
| `createWebAudio({ createContext? })` | `web-audio` | → `WebAudio`; the context (`latencyHint: 'interactive'`) and the bus graph `music / sfx / ui → master` are created **synchronously** by the first `unlock()`; volumes clamped 0…1 and remembered before the context exists; `'closed'` for good after `destroy()` |
| `WebAudio` | `web-audio` | `IAudio` + `context` (or `null`) + `bus(name) → GainNodeLike \| null` — satisfies the engine's `AudioGraphLike` |
| `WebAudioOptions` | `web-audio` | Optional context factory (tests inject fakes) |
| `AudioContextLike`, `GainNodeLike` | `web-audio` | The Web Audio subset the back-end uses |
| `PlaybackContextLike`, `AudioNodeLike`, `AudioParamLike`, `AudioGainNodeLike`, `StereoPannerNodeLike`, `AudioBufferLike`, `AudioBufferSourceNodeLike` | `web-audio` | The structural Web Audio types the players are tested against: `currentTime`, `sampleRate`, `createBuffer`, `createBufferSource`, optional `createStereoPanner`; params with `setValueAtTime` / `linearRampToValueAtTime` / `cancelScheduledValues` |
| `isPlaybackContext(context)` | `web-audio` | → whether a context has `currentTime`, `createBuffer` and `createBufferSource` (a minimal fake has not — the engine then stays silent) |
| `renderSfx(params, sampleRate)` | `synth` | → mono `Float32Array` of `sfxLength(params, sampleRate)` samples within −1…1: ZzFX-style shape, ADSR, slide, pitch jump, repeat, modulation, tremolo, bit-crush, seeded randomness / noise; deterministic on every engine (table sines, no `Math.sin` / `Math.pow` / `Math.random`); throws `RangeError` for a non-positive-integer rate |
| `sfxLength(params, sampleRate)` | `synth` | → samples: the four envelope stages, each rounded, at least 1 |
| `SfxParams`, `SfxShape`, `SFX_SHAPES`, `DEFAULT_SFX_PARAMS` | `synth` | Parameter set (all optional: `shape`, `volume`, `frequency`, `randomness`, `attack`, `decay`, `sustain`, `sustainVolume`, `release`, `slide` Hz/s, `pitchJump`, `pitchJumpTime`, `repeat`, `modulation`, `modulationDepth`, `bitCrush` samples held, `tremolo`, `tremoloRate`, `duty`, `seed`); `'sine' \| 'triangle' \| 'saw' \| 'square' \| 'noise'`; defaults (square, 440 Hz, sustain 0.1 s, release 0.1 s, seed 1 …) |
| `renderSong(song, sampleRate)` | `synth` | → `RenderedSong { pcm, sampleRate, loopStart, loopEnd }`: rows of `songRowSamples` whole samples, so loop points are exact sample indices (`loopEnd = pcm.length`; −1 for a one-shot, which ends with its release tails ≤ `MAX_SONG_TAIL_SECONDS`); the loop region holds the loop's steady state (seam = unrolled render); summed, × song volume, hard-clipped; throws `RangeError` for an unknown instrument / pattern, a bad token, a track whose rows do not add up or a bad rate |
| `Song`, `SongInstrument`, `SongVibrato`, `SongChannel`, `SongPattern`, `ChipWave`, `CHIP_WAVES` | `synth` | The tracker format: `speed` (ticks per row), `volume?`, `instruments` (wave, ADSR, `vibrato { depth, rate, delay? }`, `arpeggio`, `arpeggioTicks`, `sweep`), `channels` (`instrument`, `volume?`), `patterns` (`rows`, one text track per channel), `order`, `loopFromOrder?`; waves `pulse12`, `pulse25`, `pulse50`, `triangle`, `noise`, `saw` |
| `parseTrack(text)`, `ParsedTrack`, `TrackStep`, `TrackStepKind` | `synth` | One text track → `{ steps, rows, error }` (never throws): tokens `C4` / `F#3` / `Bb5` (note-on), `.` hold, `-` release, `=` cut, `:n` rows, `@instrument` on a note; `TrackStepKind` `Hold 0, Note 1, Off 2, Cut 3` |
| `songRowSamples(song, sampleRate)` | `synth` | → `round(sampleRate × speed / 60)` |
| `pcmHash(pcm)` | `synth` | → unsigned 32-bit FNV-1a over the float32 bit patterns (tests, `pnpm audio:preview`) |
| `sineOfCycle(phase)`, `semitoneRatio(semitones)`, `noteFrequency(note)` | `synth` | Exact-reproducible helpers: `sin(2π · phase)` interpolated from `SIN_TABLE_Q16`; `≈ 2^(s/12)` from 13 literals; MIDI note → Hz (A4 = 69 = 440) |
| `SYNTH_SAMPLE_RATE`, `DEFAULT_SONG_VOLUME`, `MAX_SONG_TAIL_SECONDS` | `synth` | `22050`; `0.4`; `2` |
| `createSfxPlayer({ context, sfxBus, uiBus?, cues, maxVoices?, panField?, panWidth? })` | `sfx` | → `SfxPlayer`: one stereo panner per voice slot (load time); throws `RangeError` for a non-positive-integer `maxVoices` |
| `SfxPlayer` | `sfx` | `play(cue, pan = 0, priority = 0)` / `playAt(cue, x, priority)` → voice slot or −1 (policy: unknown / fractional / bufferless cue dropped; deduped until `endFrame()`; played-out voices freed; a cue at `maxInstances` restarts its oldest — critical too; else a free voice; else the non-critical voice of the lowest tier then oldest, only if its tier ≤ the new sound's — else dropped; a priority hint 1–4 overrides the cue's tier); `playAt` pans `((x / panField) · 2 − 1) · panWidth`, computed only once a voice starts; `endFrame()`, `stopAll()`, `activeVoices()`, `voiceCue(slot)`, `maxVoices`, `started`, `stolen`, `dropped`, `deduped`, `destroy()`; allocates only the source node of a started sound |
| `SfxPlayerOptions`, `SfxVoiceSpec`, `SfxBus` | `sfx` | Options (`panField` default `PLAYFIELD_W`, `panWidth` default 1); per-cue `{ buffer, tier, maxInstances, bus }` (the array is read at every play, so a buffer filled in later is picked up); `'sfx' \| 'ui'` |
| `SfxPriorityName`, `SFX_PRIORITY_NAMES`, `SFX_PRIORITY_TIERS`, `DEFAULT_MAX_VOICES` | `sfx` | `'low' \| 'normal' \| 'high' \| 'critical'`, lowest first; → the core's `SfxPriority` 1–4; `14` |
| `createMusicPlayer({ context, destination, tickSeconds? })` | `music` | → `MusicPlayer` (`source → fade gain → duck gain → destination`) |
| `MusicPlayer` | `music` | `play(track, { fadeInTicks? })` (hard-stops the previous source; loops when `loopStart ≥ 0` and `loopEnd > loopStart`, loop points `samples / rate`), `stop(fadeOutTicks = 0)` (ramp to 0, source stopped at the ramp end; a second stop that throws is caught), `duck(level, ticks)` (to `level` in `min(4, ticks / 4)` ticks, held to `ticks / 2`, back to 1 at `ticks`; ≤ 0 ignored), `current`, `playing`, `destroy()`; everything scheduled on the context clock |
| `MusicBuffer`, `MusicPlayOptions`, `MusicPlayerOptions`, `TICK_SECONDS`, `DUCK_ATTACK_TICKS` | `music` | `{ id, buffer, loopStart, loopEnd }` (sample frames, −1 = one-shot); options; `1 / 60`; `4` |
| `loadSfxContent(files)`, `parseSfxContent(data, path = '')` | `loader` | The owner of content kind `sfx` → `SfxContentResult { content: SfxContent, issues }`: files in path order merged into one `SfxCueDef \| null` per `SFX_CUES` id; issues for schema errors, unknown cues, both / neither of `params` / `file`, a cue defined twice (first wins); never throws for bad data |
| `SfxContent`, `SfxCueDef`, `SfxContentResult`, `EMPTY_SFX_CONTENT` | `loader` | `{ cues }`; `{ cue, cueId, priority, tier, maxInstances, volume, bus, positional, params, file }` (frozen); the result; a bank of nulls |
| `loadMusicContent(files)`, `parseMusicContent(data, path = '')` | `loader` | The owner of content kind `music` → `MusicContentResult { content: MusicContent, issues }`: one track per file; issues for duplicate ids, unknown cues, `stages` without `cue`, both / neither of `song` / `file`, loop points on a song, a half or inverted `loopStart` / `loopEnd`, bad song references or row totals, two tracks bound to one cue for one stage; a bad track is left out; never throws for bad data |
| `MusicContent`, `MusicTrackDef`, `MusicFileDef`, `MusicContentResult`, `EMPTY_MUSIC_CONTENT` | `loader` | `{ tracks, trackIndex }`; `{ id, title, cue, cueId, stages, song, file }`; `{ url, loopStart, loopEnd, sampleRate }` (default `DECODE_SAMPLE_RATE`); the result; an empty library |
| `resolveMusicCues(content, stageId)` | `loader` | → `Int16Array` track index per `MUSIC_CUES` id (−1 = none; `Silence` always −1): a track bound to the stage wins over the cue's default |
| `stageMusicCues(stage)` | `loader` | → the cues a stage can ask for, first-use order, no duplicates, no `Silence`: `music.stage`, `music.boss` (else `Boss`), every `music` event's cue, `StageClear`, `GameOver` — what the shell prepares (review round 1 of M1-15) |
| `STAGE_MUSIC_CUES` | `loader` | `Stage`, `Boss`, `StageClear`, `GameOver` — only `prepareMusic`'s default |
| `createAudioLoader({ sampleRate?, loadFile?, decode? })` | `loader` | → `AudioLoader { sampleRate, loadSfx(content, onProgress?), loadTrack(track) }`: synthesizes at 22,050 Hz (volume baked in), fetches + decodes files in parallel; a file track's loop points scaled to the decoded rate; rejects with `AudioLoadError` |
| `AudioLoader`, `AudioLoaderOptions`, `PreparedSound`, `PreparedTrack`, `LoadProgress` | `loader` | Loader types; `{ pcm, buffer, sampleRate }` (samples kept until a context exists); + `id`, `loopStart`, `loopEnd`; `(fraction 0…1) => void` |
| `toAudioBuffer(context, sound)` | `loader` | → the sound's buffer, created on first use (samples copied into a mono buffer of their own rate, the array dropped) |
| `loadArrayBuffer(url, createRequest?)`, `XhrLike` | `loader` | XHR `arraybuffer` fetch (status 0 = success on `file://`, D25) → `Promise<ArrayBuffer>`; rejects with `AudioLoadError` on a network error, an HTTP error or an empty body |
| `decodeAudioFile(data, createContext?, url?)`, `DecodeContextLike`, `DECODE_SAMPLE_RATE` | `loader` | Decode through `new OfflineAudioContext(2, 1, 32000)` (callback form, D22) → `Promise<AudioBufferLike>` at 32 kHz; rejects with `AudioLoadError`; `32000` |
| `AudioLoadError` | `loader` | `Error` with `url`; message `could not load <url>: <reason>` |
| `SFX_CONTENT_KIND`, `MUSIC_CONTENT_KIND` | `loader` | `'sfx'`, `'music'` |
| `createAudioEngine({ sfx, music, loader?, maxVoices?, panWidth?, duckLevel? })` | `engine` | → `AudioEngine` (not attached, nothing prepared) |
| `AudioEngine` | `engine` | `loadSfx(onProgress?)` (boot), `prepareMusic(stageId, cues = STAGE_MUSIC_CUES, onProgress?)` (one set resident: tracks outside it released, except the one playing), `attach(graph)` → attached (needs a playback context and the `sfx` / `music` buses; starts the music requested meanwhile; idempotent), `playSfx(cue, screenX, priority)` → slot or −1 (positional cues through `playAt`), `playMusic(cue, fadeTicks)` (`Silence` fades out; a cue outside the prepared set is ignored and counted; the playing track is not restarted), `duckMusic(ticks)`, `endFrame()`, `attached`, `musicCue`, `residentTracks` (new array per read), `missedMusic`, `sfx`, `music`, `destroy()`; the per-frame calls allocate nothing unless a sound starts |
| `AudioEngineOptions`, `AudioGraphLike` | `engine` | Options; `{ context, bus(name) }` — a `WebAudio` |
| `DEFAULT_PAN_WIDTH`, `DEFAULT_DUCK_LEVEL` | `engine` | `0.6` (pan at the playfield edges); `0.35` (music gain while ducked) |

`web-audio` stays `partial` (since M1-17 the Options sliders drive its `setBusVolume` through the
shell — `volumeGain` of the level, the SFX level on both `sfx` and `ui`); `synth`, `sfx`,
`music`, `loader` and `engine` are `implemented`. The core's `IAudio` did not grow the planned
`playSfx` / `playMusic` / `duck` — playback is event-driven through the shell.

## `@shmup/render-pixi`

Draws the core's render contract with PixiJS v8 (renderer only, WebGL1 first) and zero
per-frame allocation. Guide: [rendering-and-shell.md](rendering-and-shell.md).

| Export | Module | Summary |
|---|---|---|
| `createPixiRenderer({ canvas, displayWidth, displayHeight, width?, height?, preferWebGLVersion?, atlas?, font?, testPattern?, glyphCapacity?, effects?, fxSeed?, particleCapacity? })` | `renderer` | → `Promise<PixiRenderer>`; rejects without WebGL. Defaults: 384×216, WebGL1, font `'pixel'`, no test pattern, 1024 quads per HUD / UI layer, `DEFAULT_EFFECT_SETTINGS`, particle seed 1, 256 particles (M1-14) |
| `PixiRenderer` | `renderer` | `IRenderer` + `webGLVersion`, `viewport`, `scene` (384×216 root), `layers`, `atlas`, `metrics` (`TextMetrics` or `null`), `bindings`, `terrain` (`TerrainBinding \| null`), `parallax` (`ParallaxBinding \| null`), `lasers` (`LaserBinding \| null`, M1-09), `effects` (`ScreenEffects`), `particles` (`ParticleSystem \| null` — no atlas), `popups` (`ScorePopups \| null` — no atlas font), `setFxContent(content)` (M1-14: the particle presets; without it no particle is drawn), `setSpriteNames(names)`, `bindWorld(world \| null)` (creates the parallax, terrain and batch bindings and, for `world.lasers`, a laser binding on `ENEMY_BULLETS` after the batches; throws `RangeError` for a batch on an unknown layer or a parallax band not on `BG_FAR` / `BG_MID`; `render()` calls it when `frame.world` changes identity). `render()` steps the effects, particles and popups by the `frame.tick` delta (0 while paused, ≤ 60; a tick going back clears them), syncs particles / popups with the world's camera and adds the effects' shake / flash / dim to `frame.screen`'s |
| `PixiRendererOptions` | `renderer` | Options above |
| `createAtlas(manifest, images, { onWarning? })` | `atlas` | → `Atlas`: one nearest `TextureSource` per page, a `Texture` per frame, frame ids consecutive per sprite. Throws `RangeError` for an image/page count or size mismatch (stale atlas), a page over 2048², a frame outside its page, a missing or shared frame |
| `Atlas` | `atlas` | `manifest`, `size`, `pages`, `textures`, `anchorX/Y`, `frameWidth/Height`, `framesLeft`, `missingFrame`, `pixelFrame`, `frameId(name)`, `spriteBase(sprite)` (→ id or `-1`), `resolveSpriteTable(names)` / `resolveFlashTable(names)` (→ `Int32Array`; unknown → `missingFrame`, warned once), `destroy()` |
| `AtlasManifest`, `AtlasPageInfo`, `AtlasFrameInfo`, `AtlasSpriteInfo`, `AtlasFontInfo`, `AtlasGlyphInfo`, `AtlasPageImage`, `AtlasOptions`, `FrameId` | `atlas` | Manifest shape (mirrors `virtual:shmup-assets`), page image type, options, frame handle |
| `MAX_ATLAS_SIZE`, `MISSING_SPRITE`, `PIXEL_SPRITE` | `atlas` | `2048`; `'ui/missing'` (magenta checker for anything unresolved); `'ui/pixel'` (1×1 white for rects) |
| `createLayerStack()` | `layers` | → `LayerStack { root, world, layers }`: one container per `LayerId`, world layers inside `world` (shake) |
| `WORLD_LAYER_COUNT` | `layers` | `LayerId.Hud` (11) — layers below it form the world group |
| `createTerrainBinding({ atlas, tables, view, width?, height?, offsetY? })` | `layers` | → `TerrainBinding { container, columns, rows, updatedCells, sync(view, camera), destroy() }`: a preallocated ring of (`width / tileSize + 1`) × (`height / tileSize + 1`, ≤ map rows) tile sprites — 49 × 26 for the playfield — re-textured one column / row as the camera crosses tile edges, moved as one container at `round(−camera.x)`; `sync` never allocates |
| `createParallaxBinding({ atlas, tables, view, width?, offsetY? })` | `layers` | → `ParallaxBinding { containers, layers, sync(view), destroy() }`: `ceil(width / spacing) + 1` sprites per band, one container offset per frame; throws `RangeError` for a band not on `BG_FAR` / `BG_MID` or a non-positive-integer spacing |
| `TerrainBindingOptions`, `ParallaxBindingOptions` | `layers` | Option types (defaults `PLAYFIELD_W`, `PLAYFIELD_H`, `PLAYFIELD_Y`) |
| `createLaserBinding({ atlas, tables, capacity, offsetY? })` | `layers` | → `LaserBinding { container, capacity, visibleCount, sync(view, camera), destroy() }` (M1-09): two preallocated sprites per `LaserView` slot pivoting on the origin — a 1-px warning line (the white pixel, tinted `LASER_WARNING_TINT` once) while the width is 0, else frame `round(width) − 1` of the beam sprite stretched along the laser; rotation written only on change; `Hidden` / zero-length lasers not drawn; `sync` never allocates; throws `RangeError` for a non-positive-integer capacity |
| `LaserBindingOptions`, `LASER_WARNING_TINT` | `layers` | Option type (`offsetY` defaults to `PLAYFIELD_Y`); `0xff5aa0` — the warning line's tint (the bullets' pink) |
| `createSpriteTables(atlas, names)` | `sprites` | → `SpriteTables { base, flash }` (load time) |
| `resolveFrame(atlas, tables, spriteId, frame, flags)` | `sprites` | → frame id to draw (`Flash` picks the flash table; out of range → `missingFrame`); never allocates |
| `createSpriteLayerBinding({ atlas, tables, capacity, layer, offsetY? })` | `sprites` | → `SpriteLayerBinding { layer, capacity, container, visibleCount, sync(view, camX, camY), destroy() }`; `offsetY` defaults to `PLAYFIELD_Y`; throws `RangeError` for a bad capacity |
| `createQuadPool({ atlas, capacity, label? })` | `sprites` | → `QuadPool { capacity, used, dropped, container, begin(), frame(frameId, x, y, flags, tint, alpha), rect(x, y, w, h, color, alpha), end(), destroy() }` — ordered screen-space quads; `frame` / `rect` return `false` when full |
| `SpriteLayerBindingOptions`, `QuadPoolOptions` | `sprites` | Option types |
| `createBitmapFont(atlas, name = 'pixel')` | `text` | → `BitmapFont { name, lineHeight, cellWidth, cellHeight, glyphFrame(code), advance(code), measureLine(text, start), measure(text) }`; throws `RangeError` for an unknown font |
| `createTextMetrics(fonts)` | `text` | → core `TextMetrics` (first font's `lineHeight`); throws `RangeError` for an empty list |
| `drawText(sink, font, text, x, y, color, align, alpha = 255)` | `text` | Emits one quad per glyph into a `GlyphSink` → glyphs emitted; `\n` = new line, per-line alignment, missing → `?`; never allocates |
| `drawNumber(sink, font, value, x, y, minDigits, color, align, alpha = 255)`, `measureNumber(font, value, minDigits)` | `text` | Digits without strings (NaN / ±Infinity → 0, capped at `MAX_SAFE_INTEGER`, padding ≤ 20) |
| `GlyphSink` | `text` | `frame(frameId, x, y, flags, tint, alpha) → boolean` (a `QuadPool` is one) |
| `DEFAULT_GLYPH_CAPACITY`, `DEFAULT_FONT` | `text` | `1024`; `'pixel'` |
| `createDrawListView({ atlas, font, tables, capacity?, label? })` | `ui` | → `DrawListView { container, pool, draw(list), invalidate(), destroy() }`: draws a `DrawList` in command order, skipped when list and `revision` are unchanged — the HUD and UI layers draw the core HUD (`buildHud`) and the scene flow's menus, dialogs and logo through it since M1-16 (module `implemented`) |
| `computeIntegerViewport(dispW, dispH, baseW, baseH)` | `viewport` | → `Viewport { scale, x, y, width, height }` (pure) |
| `createTestPattern(width, height)` | `test-pattern` | → `TestPattern { root, update(tick) }` (`?scene=calibration`) |
| `pixelArtToRects(rows, colors, x?, y?)` | `test-pattern` | → merged horizontal runs as `PixelRect[]` (pure) |
| `PLACEHOLDER_SHIP` | `test-pattern` | 16×9 original pixel map |
| `PALETTE`, `PaletteColor` | `palette` | Placeholder colours (lifted navy background for the VA panels, letterbox) |
| `loadFxContent(files)`, `parseFxContent(data, path = '')` | `particles` | The owner of content kind `fx` (M1-14) → `FxContentResult { content: FxContent, issues }`: files in path order, schema (core combinators) + `min ≤ max`, unique preset ids (first wins), triggers naming a known cue (`FX_CUE_NAMES` / `SFX_CUE_NAMES`) and preset, ≤ `MAX_TRIGGERS_PER_CUE` a cue; bad entries dropped with an issue; never throws for bad data |
| `FxContent`, `EMPTY_FX_CONTENT`, `FxContentResult` | `particles` | `{ presets, triggers }` (frozen); the empty content; the result above |
| `ParticlePresetDef`, `ParticleRange`, `ParticleBlend` | `particles` | A validated preset with defaults: `id`, `sprite`, `frames` (`null` = all), `count`, `speed`, `direction`, `spread`, `gravity`, `drag`, `lifetime`, `delay`, `radius`, `blend` (`'add' \| 'normal'`); `{ min, max }` |
| `FxTriggerDef`, `FxTriggerEvent` | `particles` | `event` (`'fx'` = `Particles` events, `'sfx'` = `Sfx` events), `cue`, `cueId`, `preset`, `presetIndex`, `dx`, `dy` |
| `fxSpriteNames(content)` | `particles` | → distinct sprite names in preset order (the atlas check of `pnpm content:check`) |
| `createParticleSystem({ atlas, capacity?, seed?, offsetY?, content? })` | `particles` | → `ParticleSystem { container, capacity, content, liveCount, visibleCount, recycled, setContent(content), presetIndex(id), emit(preset, x, y, intensity) → spawned, emitFxCue(cue, x, y, intensity), emitSfxCue(cue, x, y), step(ticks), sync(camera), clear(), destroy() }`: a packed SoA pool in world pixels, oldest recycled when full, bursts of `count × clamp(intensity, 1, 4)` (≤ 64), advanced by simulated ticks, two preallocated sprite sets (normal, additive), presentation sfc32 with 16-bit draws; `emit*` / `step` / `sync` never allocate; throws `RangeError` for a non-positive-integer capacity |
| `ParticleSystemOptions` | `particles` | Options above (`capacity` `PARTICLE_CAPACITY`, `seed` 1, `offsetY` `PLAYFIELD_Y`, `content` `EMPTY_FX_CONTENT`) |
| `FX_CONTENT_KIND`, `PARTICLE_CAPACITY`, `MAX_TRIGGERS_PER_CUE`, `MAX_PARTICLE_STEP` | `particles` | `'fx'`; `256`; `4`; `60` (ticks one `step` advances at most) |
| `createScreenEffects(settings = {})` | `effects` | → `ScreenEffects { settings, shakeX, shakeY, shakeAmount, flashAlpha, flashColor, dimAlpha, flashesSuppressed, shake(magnitude, ticks) → started, flash(kind, ticks) → started, dim(level, ticks), step(ticks), clear() }` (M1-14): an integer shake that decays exactly like the sim's `shakeAmount` along a fixed 8-step pattern (off with `settings.screenShake = false`), a flash per `FlashKind` look fading linearly behind the limiter (≤ `FLASH_LIMIT` starts per `FLASH_WINDOW_TICKS`, 1 and alpha ≤ `REDUCED_FLASH_ALPHA` with `reduceFlashing`), a playfield dim that fades in, holds, fades out; pure state, never allocates |
| `EffectSettings`, `DEFAULT_EFFECT_SETTINGS` | `effects` | `{ screenShake, reduceFlashing, crt }` (mutable on `effects.settings`); `true`, `false`, `'off'` |
| `FlashLook`, `FLASH_LOOKS`, `DEFAULT_FLASH_LOOK` | `effects` | `{ color, alpha }`; by `FlashKind`: Mega Crash white 0.85, WARNING red `0xf85858` 0.35, boss blast white 1.0; unknown kinds white 0.6 |
| `FLASH_LIMIT`, `FLASH_WINDOW_TICKS`, `REDUCED_FLASH_ALPHA`, `SHAKE_PATTERN_X`, `SHAKE_PATTERN_Y`, `DIM_FADE_IN_TICKS`, `DIM_FADE_OUT_TICKS` | `effects` | `3`, `60`, `0.25`, `[1, −1, 1, 0, −1, 1, −1, 0]`, `[0, 1, −1, 1, 0, −1, 1, −1]`, `8`, `16` |
| `createScorePopups({ atlas, font, capacity?, ticks?, offsetY? })` | `effects` | → `ScorePopups { container, capacity, ticks, liveCount, show(points, x, y, color) → shown, step(ticks), sync(camera), clear(), destroy() }`: bitmap-font numbers rising from a world point (1 px per 4 ticks), clamped to the playfield, blinking in their last 10 ticks, the oldest replaced when full, one 8-quad pool per slot (a tint is written only when a slot changes colour); never allocates after creation; throws `RangeError` for a non-positive-integer capacity or lifetime |
| `ScorePopupsOptions`, `SCORE_POPUP_SLOTS`, `SCORE_POPUP_TICKS`, `SCORE_POPUP_COLOR`, `BONUS_POPUP_COLOR` | `effects` | Option type; `16`; `40`; `0xf8f8f8` (kills, boss parts); `0xf8d030` (formation bonus, boss tally) |

`effects` stays `partial`: raster / scanline effects and palette swaps arrive with M2-08, the CRT
filter with M3-02. Guide: [fx-and-game-feel.md](fx-and-game-feel.md).

Placeholder: `debug`.

## `@shmup/shell`

The shared browser host of `apps/web` and `apps/tizen` (decision D34). Depends on
`@shmup/core`, `@shmup/render-pixi` (the renderer, and the `fx` content owner and effect types
since M1-14), `@shmup/audio-web` (the `sfx` / `music` owners and the audio engine, M1-15) and —
only for the default `input-profiles` content owner — `@shmup/input-web`; the input and audio
adapters come in through core interfaces.
Guide: [rendering-and-shell.md](rendering-and-shell.md#the-browser-shell-shmupshell).

| Export | Module | Summary |
|---|---|---|
| `bootShell(options)` | `boot` | → `Promise<Shell>`; rejects with `ShellBootError` (after showing the boot error screen and releasing everything) for invalid content, a failed or stale atlas page, no WebGL, a failing platform / game (including a throwing `inputProfiles` callback at boot — M1-17), or audio content that cannot be loaded (`AUDIO FAILED TO LOAD`, M1-15). A bad save never fails the boot (defaults) |
| `ShellOptions` | `boot` | `canvas`, `win`, `contentFiles`, `assets`, `input`, `audio` (`IAudio & Partial<AudioGraphLike>` — a `WebAudio` exposes `context` / `bus()` and is played through; a plain `IAudio` leaves the game silent, M1-15), `audioLoader?` (default `createAudioLoader()`; tests inject a fake, M1-15), `platform: (renderer) => Platform` (called after content validation — the apps apply the input profiles there), `gameConfig?`, `scene?` (`'game'` — the scene flow, M1-16), `audioUnlock?` (`'gesture'` \| `'immediate'`), `preferWebGLVersion?` (1), `contentOwners?` (merged over `DEFAULT_CONTENT_OWNERS`; an `fx`, `sfx` or `music` owner here replaces the shell's own and leaves the particles / the audio engine without that content), `effects?` (`Partial<EffectSettings>` for the renderer, M1-14), `inputProfiles?` (`ShellInputProfiles` — the profiles the Options screen offers and how to apply one; omitted: CONTROLS disabled and a saved profile not applied — M1-17), `now?` (the boot clock, default `win.performance.now()`, else `Date.now()` — M1-17), `createImage?`, `overlay?` (`null` disables it) |
| `Shell` | `boot` | `game`, `platform`, `renderer`, `atlas`, `events` (dispatcher), `content`, `scene`, `sceneView` (the scene flow's `SceneView` when `scene === 'game'`, else `null` — M1-16), `flight` (the `FlightScene` or `null`), `showcase` (or `null`), `fxGallery` (the `FxGallery` or `null`, M1-14), `fx` (the `content/fx/` presets handed to the renderer, M1-14), `audioEngine` (the `AudioEngine`: SFX bank and the booted stage's music set, attached after the unlock — M1-15), `loadedSave` (the `LoadedSave` read at boot, with its status), `save` (the `SaveStore` — the scene flow's `game.scenes.save`), `bootTiming` (`BootTiming`) (all three M1-17), `stop()` (idempotent; releases loop, listeners — `resize`, `blur`, the unlock gestures — input, renderer, atlas, the audio engine, audio). Since M1-17 boot reads the save once the platform exists (`loadSave(platform.storage)`), applies its volumes (`applyAudioOptions`) and saved profile (`inputProfiles.apply(id, 'save')`), hands the store and `{ choices, active }` to `createGame` in the scene flow, registers `connectOptionEvents`, clears held input on window `blur`, and marks `data-shmup-boot-ms`. Boot also seeds the particles with `(gameConfig.seed ^ 0x2545f491) >>> 0`, renders the SFX bank (`LOADING SOUND`) and prepares `stageMusicCues(stage)` of a booted stage (`LOADING MUSIC`; none in open space — the scene flow adds `MUSIC_CUES.Title`, and `StageClear` / `GameOver` in open space), calls `game.scenes.finishBoot()`, attaches the engine right after `unlock()` returns and again when it resolves, and, in the scene flow and free flight, connects the game's events (`connectFxEvents`, `connectAudioEvents` — against `sceneView.camera` in the flow); every frame calls `audioEngine.endFrame()` after the drain; in the flow it also calls `sceneView.follow()` before the drain, clears the renderer's particles and popups when `sceneView.worldChanges` moved, and updates `data-shmup-scene` |
| `ShellAssets`, `ShellInput`, `ShellScene` | `boot` | `{ manifest, pageUrls }`; `PlatformInput` + `clear()` + `setContext(ctx)` (required; called once at boot and before a frame's ticks whenever `game.inputContext` changed) + `destroy()`; `'game' \| 'flight' \| 'showcase' \| 'calibration' \| 'fx-gallery'` (`game` — the scene flow, the default since M1-16: `createGame(…, { scenes: 'boot' })`; the others run bare gameplay: `flight` free flight, the calibration scene renders the game frame without its world, the fx gallery — M1-14) |
| `ShellBootError` | `boot` | `Error` with `lines`, `issues`, `reason` |
| `sceneFromSearch(search)`, `SHELL_SCENES` | `boot` | `?scene=` → `ShellScene` (unknown or missing → `'game'`); the scene list, default first |
| `DEFAULT_STAGE_ID`, `defaultStageId(files)` | `boot` | `'zone-a'` — the stage a game plays when the host names none (M1-18; the zone map of M2-10 replaces it); → `'zone-a'` when the raw content files (before validation) hold a `stage` file with that id, else `null` (open space). Both apps pass it as `gameConfig.stage` in the scene flow |
| `BOOT_STATE_ATTRIBUTE` | `boot` | `'data-shmup-state'` — `loading` / `running` / `error` on the game canvas |
| `SCENE_ATTRIBUTE` | `boot` | `'data-shmup-scene'` — the scene flow's top scene id (`title`, `game`, `pause`, `options`, `confirm`, …) or the dev scene's name (`flight`, `showcase`, …) on the game canvas (M1-16; tests, the TV's remote inspector) |
| `BOOT_MS_ATTRIBUTE`, `BootTiming` | `boot` | `'data-shmup-boot-ms'` — the launch-to-ready time (`round(readyMs)`) on the game canvas once running; `{ startMs, readyMs, bootMs }` in ms of `ShellOptions.now` (with `performance.now()`: since the page started; `bootMs = readyMs − startMs`, the time inside `bootShell`) — for the M1-19 debug overlay (M1-17) |
| `ShellInputProfiles` | `boot` | What an app implements for the Options screen's CONTROLS (M1-17): `choices()` (called once after content validation), `active()` (the key profile id in use or `null`), `apply(id, source)` (`'save'` — the saved choice at boot, an app may keep a dev override instead; `'options'` — the player's pick; unknown ids ignored by the app) |
| `loadImages(urls, createImage, onProgress?)` | `loader` | → `Promise<images>` in `urls` order, parallel; rejects with `AssetLoadError { url }` on the first failure |
| `loadGameContent(files, { owners?, …LoadContentOptions })` | `loader` | → `LoadContentResult`: core issues (with `knownScripts` defaulting to the core's `KNOWN_SCRIPT_IDS` and `extraSprites` to its `ENGINE_SPRITES` — M1-09, so bullets, lasers and, since M1-10, the Options can be drawn), then `checkEnemyBehaviors` issues (M1-08), then `checkWeaponBehaviors` issues (M1-10), then each foreign kind's owner issues (`owners`, then `DEFAULT_CONTENT_OWNERS`), or `no loader for content kind` per unowned file; throws only `TypeError` for a non-array |
| `DEFAULT_CONTENT_OWNERS` | `loader` | Frozen owners of today's foreign kinds: `input-profiles` → input-web `loadInputProfiles`, `fx` → render-pixi `loadFxContent` (M1-14), `sfx` / `music` → audio-web `loadSfxContent` / `loadMusicContent` (M1-15) — issues only. An app entry of the same kind replaces it |
| `ContentOwner`, `ContentOwners`, `LoadGameContentOptions`, `ImageFactory`, `LoadableImage` | `loader` | `(files) => ValidationIssue[]`; owners by kind; option and image types |
| `createEventDispatcher()` | `dispatch` | → `EventDispatcher { on(kind, handler) → unsubscribe, visit, drain(queue), handlerCount(kind), dispatched, unhandled }`; `on` throws `RangeError` for an unknown kind |
| `SimEventHandler` | `dispatch` | `(event: Readonly<SimEvent>) => void` — the record is reused |
| `connectFxEvents(dispatcher, fx)` | `dispatch` | Registers the game-feel handlers (M1-14) → an idempotent unregister function: `Particles` → `particles.emitFxCue(id, x, y, param)`, `Sfx` → `particles.emitSfxCue(id, x, y)`, `Shake` → `effects.shake(param, id)`, `Flash` → `effects.flash(id, param)`, `Dim` → `effects.dim(id / 100, param)`, `Score` → a white popup, `FormationBonus` / `BossDefeated` → gold popups; positions floored to whole world pixels; handling allocates nothing |
| `FxTargets` | `dispatch` | `{ particles: ParticleSystem \| null, effects: ScreenEffects, popups: ScorePopups \| null }` — a `PixiRenderer` is one; `null` parts skip their handlers |
| `connectAudioEvents(dispatcher, audio, camera)` | `dispatch` | Registers the audio handlers (M1-15) → an idempotent unregister function: `Sfx` → `audio.playSfx(id, Math.floor(x - camera.x) \| 0, param)` (whole pixels from the playfield's left edge, read from the live camera), `Music` → `playMusic(id, param)`, `MusicDuck` → `duckMusic(param)`; handling allocates nothing (the engine creates the source node of a sound it starts) |
| `AudioEventTarget`, `CameraPosition` | `dispatch` | `{ playSfx(cue, screenX, priority), playMusic(cue, fadeTicks), duckMusic(ticks) }` — an `AudioEngine` is one; `{ x }` — the World's `CameraView` |
| `connectOptionEvents(dispatcher, audio, onInputProfile)` | `dispatch` | Registers the Options screen's handler (M1-17) → an idempotent unregister function: `UserOption` `MasterVolume` / `MusicVolume` → `audio.setBusVolume('master' / 'music', volumeGain(level))`, `SfxVolume` → the same for `sfx` **and** `ui`, `InputProfile` → `onInputProfile(index)` (`null`: ignored); volume events allocate nothing here |
| `applyAudioOptions(audio, options)`, `VolumeTarget` | `dispatch` | Sets `master`, `music`, `sfx` and `ui` (from the SFX level) through `volumeGain` — boot, from the save (M1-17); `{ setBusVolume(bus, gain) }` — any `IAudio` |
| `createBootOverlay(gameCanvas)` | `error-screen` | → `BootOverlay { canvas, showProgress(fraction, label), showError(title, lines), remove() }` or `null` (no document / no 2D context) |
| `drawProgress(ctx, w, h, fraction, label)`, `drawErrorScreen(ctx, w, h, title, lines) → lines shown`, `formatIssues(issues)` | `error-screen` | Canvas 2D drawing (`Canvas2DLike`) and `path: message` lines |
| `BOOT_SCREEN_COLORS`, `Canvas2DLike` | `error-screen` | Background `#10173a`, text, title `#ff5aa0`, track; the 2D context subset used |
| `startFrameLoop(scheduler, onFrame)` | `frame-loop` | → `FrameLoop { stop() }`; `FrameScheduler` = the two rAF functions (moved here from both apps) |
| `createSceneView(game)` | `scene-view` | → `SceneView { spriteNames, backdrop, frame, camera, worldChanges, follow(), update(gameFrame) → frame }` (M1-16, the `game` scene): the flow's frame plus a drifting starfield backdrop outside the game (pre-bound at load) and, in open space, a wrapper view with two starfield batches under the World's batches (built once per World — a stage's own view is used as is); `camera` follows the World on screen (the audio pans against it); `worldChanges` counts new Worlds; the HUD, UI and screen effects are the core's; *reused* frame, no per-frame allocation |
| `SCENE_VIEW_SPRITES` | `scene-view` | `bg/stars-far`, `bg/stars-mid`, `bg/stars-near`, appended after the content's sprite names |
| `createFlightScene(game, { starTileSize? })` | `flight` | → `FlightScene { spriteNames, world, frame, update(gameFrame) → frame }`: `?scene=flight` (the default until M1-16; bare gameplay) — the game World's batches on the World's camera with the World's parallax, terrain and laser views, preceded by two starfield batches in open space only (a stage brings its own bands), and the D20 HUD (`1P` and player 1's score, `FREE FLIGHT` or the stage name upper-cased — `GAME OVER` in red once `world.status` says so, `HI` and the session hi-score, `lives − 1` stock ships, `ARROWS MOVE`; rebuilt only when lives, the status or a score's dirty flag change — M1-12); the World's `warning` view passed through and, while a boss WARNING runs, its text on a translucent band in the UI list (red / yellow every 16 ticks, rebuilt only on a change — M1-13); *reused* frame, no per-frame allocation |
| `FLIGHT_SPRITES`, `FlightSceneOptions` | `flight` | The scene's own sprites (`bg/stars-far`, `bg/stars-mid`, `bg/stars-near`, `hud/life`), appended after the content's sprite names; options type |
| `createShowcase({ starTileSize? })` | `showcase` | → `Showcase { spriteNames, world, frame, update(gameFrame) → frame }` (*reused*, pure function of the tick) — `?scene=showcase` |
| `SHOWCASE_SPRITES`, `ShowcaseOptions` | `showcase` | The showcase's sprite name table (11 names) |
| `createFxGallery(fx, { starTileSize? })` | `fx-gallery` | → `FxGallery { spriteNames, world, frame, stations, station, update(gameFrame) → frame }` (M1-14, `?scene=fx-gallery`): stations of `FX_GALLERY_STATION_TICKS` — every preset of `fx.particles.content` (read at creation; three bursts at the centre per station), then `FX_GALLERY_EXTRAS` — driving the renderer's particles, effects and popups directly; labels built once, timed by the game's tick; *reused* frame, no per-frame allocation |
| `FX_GALLERY_SPRITES`, `FX_GALLERY_STATION_TICKS`, `FX_GALLERY_EXTRAS`, `FxGalleryOptions` | `fx-gallery` | `bg/stars-far`, `bg/stars-mid`; `60`; `shake.small`, `shake.medium`, `shake.large`, `flash.mega-crash`, `flash.warning`, `flash.boss-blast`, `dim`, `popups`; options type |

## Apps

These are not libraries, but their modules export testable functions.

### `apps/web`

| Export | Module | Summary |
|---|---|---|
| `bootWebApp(canvas, resources, win?)` | `boot` | Runs the shell's `?scene=` (default `game`, the scene flow — M1-16) → `Promise<WebApp>` (`game`, `renderer`, `audio`, `input`, `profiles` (`InputProfileRegistry`), `shell`, `stop()`); `resources` = `WebAppResources { contentFiles, assets }` from the virtual modules. Key profile: `?profile=` › the saved choice (`options.input.profileId` of the save the shell reads before the title — only a selectable profile, M1-17) › `keyboard-default`; pads `gamepad-standard`; an unknown `?profile=` → `console.warn`. Passes `inputProfiles` to the shell: CONTROLS offers `KEYBOARD (DEFAULT)` / `KEYBOARD AS REMOTE` plus a `?profile=` override in use; a pick switches at once (with `?debounce=`), and a `?profile=` override wins over the saved choice, not over a pick. `?stage=<id>` → `gameConfig.stage`, else in the scene flow `defaultStageId(contentFiles)` — zone A (M1-18; the dev scenes such as `?scene=flight` keep open space); `?skip=` → `gameConfig.stageSkip` (M1-18, default `'none'`); `?loadout=` → `gameConfig.loadout` (M1-10); `remoteMode: false` (autofire stays on). Rejects with `ShellBootError` |
| `inputOverridesFromSearch(search)` | `boot` | → `InputOverrides { profile: string \| null, debounce: number \| null }` from `?profile=<id>` / `?debounce=<0…10>`; percent-decoded, last valid value wins |
| `stageFromSearch(search)` | `boot` | → the `?stage=<id>` value (percent-decoded, last non-empty wins; malformed escapes ignored) or `null` |
| `loadoutFromSearch(search)` | `boot` | → `'full'` / `'default'` from `?loadout=<preset>` (exact, case-sensitive; last valid value wins) or `null` — the M1-10 dev override, applied as `GameConfig.loadout` (`'full'` includes a Force Field since M1-11) |
| `stageSkipFromSearch(search)` | `boot` | → `'boss'` / `'none'` from `?skip=<value>` (exact, case-sensitive, not percent-decoded; last valid value wins) or `null` — the M1-18 debug stage skip, applied as `GameConfig.stageSkip` (the e2e smoke reaches HALCYON BULWARK with it) |
| `contentStageIds(files)` | `boot` | → ids of every `stage` file among the raw content files (before validation); `bootWebApp` checks `?stage=` against it — an unknown id → `console.warn`, open space |
| `createWebPlatform(options)` | `platform` | → `Platform` (`id: 'web'`, `exit: null`) |
| `createLocalStorage(storage \| null, prefix = 'shmup-cup:')` | `platform` | → `PlatformStorage`; first error → memory for the session |
| `createVisibilityLifecycle(source)` | `platform` | → `PlatformLifecycle` from `visibilitychange` |
| `WebPlatformOptions`, `StorageLike`, `VisibilitySource` | `platform` | Injected browser services |

The frame loop moved to `@shmup/shell` (`startFrameLoop`).

### `apps/tizen`

| Export | Module | Summary |
|---|---|---|
| `bootTizenApp(canvas, resources, win?)` | `boot` | → `Promise<TizenApp>` (`game`, `platform`, `renderer`, `audio`, `input`, `profiles` (`InputProfileRegistry`), `shell`, `stop()`); `resources` = `TizenAppResources { contentFiles, assets }`. Key profile: `tizen-remote-safe` in the platform factory, then the saved choice from the save the shell reads before the title (only a selectable profile; its keys registered — M1-17); pads `gamepad-standard`. `gameConfig`: `remoteMode` / `autofire` true and, in the scene flow, `stage: defaultStageId(contentFiles)` — START plays zone A (M1-18; the dev scenes keep open space, and there are no `?stage=` / `?skip=` parameters). Passes `inputProfiles` to the shell: CONTROLS offers `SAFE 4-WAY (DEFAULT)` / `FAST 8-WAY`, and a pick switches at once and registers the new profile's `register` keys. The Back watcher is installed before boot and **removed once the shell runs** (M1-16): Back exits only from the loading and boot error screens; afterwards the scene flow owns Back (title → exit confirmation → `platform.exit()` after YES) |
| `createTizenPlatform(options)` | `platform` | → `Platform` (`id: 'tizen'`, `remoteOnly: true`); registers `options.registerKeys` (the key profile's `register` list), else `REMOTE_KEYS_TO_REGISTER` |
| `registerRemoteKeys(tizen, requested)` | `platform` | Batch registration with per-key fallback → names registered; drops `SYSTEM_REMOTE_KEYS` (`Exit`, volume) whatever the list says; an empty list registers nothing |
| `watchBackKey(target, onBack)` | `platform` | Calls `onBack` on non-repeat keyCode 10009 → unsubscribe function |
| `getTizenApi(win)` | `platform` | → `window.tizen` or `null` |
| `TizenApi`, `TizenPlatformOptions` (+ `registerKeys?`), `StorageLike`, `VisibilitySource` | `platform` | Types |
| `REMOTE_KEYS_TO_REGISTER`, `TIZEN_BACK_KEY_CODE` | `platform` | Fallback when no input profile gives a `register` list: `MediaPlayPause`, `ChannelUp/Down`, `ColorF0Red…ColorF3Blue`; `10009` |
| `checkTizenBundle(distDir)` | `scripts/check-bundle.mjs` | → `{ problems, files, code }`: one script `app.js`, classic deferred tag, ES2018 parse, polyfill banner, widget files present, every other file under `dist/assets/`, at least one atlas page under `dist/assets/atlas/`; `POLYFILL_BANNER`, `WIDGET_FILES` (`app.js`, `config.xml`, `icon.png`, `index.html`) |
| `tizenCli()`, `sdbCli()`, `requireEnv()`, `resolveTarget()`, `run()`, `findWgt()`, `requireBuild()`, `APP_DIR`, `DIST_DIR`, `APP_ID` | `scripts/tizen-env.mjs` | Helpers of the Tizen CLI wrappers |

Placeholders: `device-info` (`DeviceInfo`), `live-reload` (`LiveReloadOptions`).

### `apps/electron`

| Export | File | Summary |
|---|---|---|
| `resolveAppFile(rootDir, url)` | `src/main/app-protocol.ts` | `app://game/<path>` → file inside `rootDir`, or `null` (traversal-safe) |
| `APP_SCHEME` (`'app'`), `APP_HOST` (`'game'`), `APP_ENTRY_URL` | `src/main/app-protocol.ts` | URL constants |
| `createWindowOptions({ preloadPath, fullscreen })` | `src/main/window-options.ts` | → `BrowserWindowConstructorOptions` (sandboxed, `backgroundThrottling: false`) |
| `IPC_CHANNELS`, `ShmupElectronApi` | `src/shared/ipc.ts` | `quit: 'shmup:quit'`; the `window.shmupElectron` shape (`platform`, `quit()`) |

Placeholders: `FileStore` (`saves.ts`), `SteamService` (`steam.ts`).

## Repo tooling

| Export | File | Summary |
|---|---|---|
| `SOURCE_CONDITION` (`'@shmup/source'`), `clientConditions`, `serverConditions` | `vite.shared.ts` | Resolve workspace packages to `src/` in Vite/Vitest |
| `defineShmupProject(name, { environment?, include?, execArgv? })` | `vitest.shared.ts` | Per-project Vitest config (tests under `test/`, Node environment); `execArgv` goes to the worker pool (`['--expose-gc']` in core and shell) |
| `measureHeapGrowth(fn, iterations, warmup = min(iterations, 1000), attempts = 3, settled = 32 KiB)` | `packages/core/test/helpers/alloc.ts` | Allocation guard (plan §1.4) → `HeapGrowth { bytes, growth, collections, bytesPerIteration }`: heap growth plus the bytes in-loop GCs reclaimed (V8 `GCProfiler`), the steadiest (fewest bytes) of up to `attempts` measured windows — the first window of at most `settled` bytes ends the search — so one window in a lower V8 tier cannot fail a guard; throws without `--expose-gc`. Test-only, imported by relative path |
| `shmupContent({ root? })` | `vite.shared.ts` | Vite plugin → `virtual:shmup-content`: every shipped `content/**/*.json` inlined into the bundle, sorted by path, `example.*.json` skipped, full reload on change |
| `readContentFiles(root?)`, `CONTENT_MODULE_ID`, `ContentFileRecord`, `ShmupContentOptions` | `vite.shared.ts` | The Node-side reader behind the plugin (also used by `pnpm content:check`): recursive, `example.*` skipped, sorted by path; `SyntaxError` naming the file on bad JSON, `[]` for a missing root |
| `virtual:shmup-content` | `types/virtual-modules.d.ts` | Ambient module declaration: `default: readonly { path, data }[]` |
| `shmupAssets({ sourceDir?, outDir? })` | `vite.shared.ts` | Vite plugin: runs the cached asset pipeline in `buildStart`, serves `virtual:shmup-assets`, emits the atlas pages into `dist/assets/atlas/` in builds; dev middleware for `<base>assets/atlas/*`, regenerate + full reload on `assets/source/` edits (pipeline-code edits: Vite restarts, or a warning). Throws `AssetSourceError` from the build hooks on invalid sources |
| `ASSETS_MODULE_ID` (`'virtual:shmup-assets'`), `ATLAS_URL_DIR` (`'assets/atlas'`), `ShmupAssetsOptions` | `vite.shared.ts` | The virtual id, the relative page directory used by `pageUrls` and the build, the options type |
| `virtual:shmup-assets` | `types/virtual-modules.d.ts` | `manifest: AtlasManifest` (inlined), `pageUrls: readonly string[]` (relative, one per page), `default: { manifest, pageUrls }`; types `AtlasManifest`, `AtlasPage`, `AtlasFrame`, `AtlasSprite`, `AtlasFont`, `AtlasGlyph` |
| `renderAudioPreview({ out?, only?, log? })`, `encodeWav(pcm, sampleRate)`, `DEFAULT_PREVIEW_DIR` | `scripts/audio-preview.mjs` | `pnpm audio:preview` (M1-15): loads `@shmup/audio-web` through Vite's `ssrLoadModule`, validates `content/audio/` and writes 16-bit mono WAVs of every synthesized cue and song (a looping song as intro + loop + loop) → `Promise<{ files }>`; throws for content issues or an `only` name that matches nothing; `encodeWav` → the RIFF bytes (clipped, rounded); default `assets/generated/audio-preview/` |
| `WEB_PORT` (`4173`), default config | `test/e2e/playwright.config.ts` | Playwright config of `pnpm test:e2e`: headless Chromium (SwiftShader, `--allow-file-access-from-files`, no `DISPLAY`), 1152×648 viewport, `vite preview` of `apps/web/dist` |

### Asset pipeline (`scripts/assets/`)

Plain Node ES modules with JSDoc types (Node-side TypeScript imports them through
`allowJs`). Guide: [asset-pipeline.md](asset-pipeline.md). Entry point:
`scripts/generate-assets.mjs` (`pnpm assets`; exports `parseArgs(argv)` →
`{ force, quiet, outDir?, sourceDir? }`, throws on unknown flags).

| Export | File | Summary |
|---|---|---|
| `generateAssets({ sourceDir?, outDir?, force?, log? })` | `pipeline.mjs` | → `GenerateResult { cached, inputHash, manifest, atlasDir, files }`; writes `atlas/main*.png` + `atlas/main.json` + `.asset-cache.json` atomically, skips when the input hash and every output digest match, removes stale pages; throws `AssetSourceError` (nothing written) |
| `buildAtlas({ sourceDir?, maxPageSize? })` | `pipeline.mjs` | In memory → `{ manifest, pages: { file, image, png }[], sprites }`; throws `AssetSourceError` (invalid sources, a frame too large for a page) or `RangeError` (`maxPageSize` not a power of two) |
| `collectSprites({ sourceDir? })` | `pipeline.mjs` | → `{ sprites, fonts, issues }`: pixel maps + generators, PNG overrides, fonts, `@flash` siblings, default anchors, sorted by name |
| `computeInputHash(sourceDir?)` | `pipeline.mjs` | Hex SHA-256 of the pipeline code as loaded by this process (+ zlib, pngjs versions) and the current sprite/font sources |
| `AssetSourceError` | `pipeline.mjs` | `Error` with `issues: AssetIssue[]`; the message lists every issue |
| `pageFileName(i)`, `PIPELINE_DIR`, `REPO_ROOT`, `DEFAULT_SOURCE_DIR`, `DEFAULT_OUT_DIR`, `ATLAS_DIR` (`'atlas'`), `ATLAS_NAME` (`'main'`), `CACHE_FILE`, `ATLAS_PADDING` (1), `ATLAS_EXTRUDE` (1) | `pipeline.mjs` | Paths and layout constants; `pageFileName(0)` = `main.png`, `pageFileName(1)` = `main-1.png` |
| `AtlasManifest`, `ManifestPage`, `ManifestFrame`, `ManifestSprite` | `manifest.mjs` | JSDoc typedefs of the manifest (mirrored by `virtual:shmup-assets`) |
| `MANIFEST_FORMAT_VERSION` (1), `frameName(sprite, i)` (→ `<sprite>#<i>`), `formatManifest(m)` | `manifest.mjs` | Format version, frame naming, byte-stable serialiser (sorted keys, one entry per line) |
| `findMissingSprites(manifest, names, label = 'sprites')` | `manifest.mjs` | → `AssetIssue[]`, one per name not in `manifest.sprites` (`<label>[<i>]`); used by `pnpm content:check` |
| `parseSpriteSource(json, file, expectedName?)` | `sprite-source.mjs` | Validates one `*.sprite.json` → `{ sprite: SpriteDef \| null, issues }`; never throws on bad data |
| `loadSpriteSources(dir, displayRoot)` | `sprite-source.mjs` | → `{ sprites, overrides: PngSprite[], issues }` for a `sprites/` tree |
| `readPngFrames(image, sidecar, file, issues)`, `applyPngOverrides(sprites, overrides)` | `sprite-source.mjs` | Cut frames / tags / pivot out of a PNG + Aseprite export; merge overrides by name (frames by index, extras appended, inputs untouched) |
| `listFiles(dir)`, `SPRITE_NAME_PATTERN`, `ANIMATION_NAME_PATTERN`, `SPRITE_SOURCE_SUFFIX` | `sprite-source.mjs` | Sorted recursive listing (`/` separators, `[]` for a missing dir); name rules |
| `SpriteDef`, `PngSprite`, `AssetIssue` | `sprite-source.mjs` | Typedefs: `{ name, anchor, hitFlash, frames, animations, origin }`; `{ path, message }` (same shape as `ValidationIssue`) |
| `parseFontSource(json, file)`, `loadFontSources(dir, displayRoot)`, `buildFontSprite(font)` | `font.mjs` | Validate `*.font.json`; → `{ sprite: font/<name>, metrics: FontMetrics }` |
| `FontDef`, `FontMetrics`, `FONT_SOURCE_SUFFIX`, `FONT_NAME_PATTERN`, `ASCII_PRINTABLE` | `font.mjs` | Font typedefs and rules; `ASCII_PRINTABLE` = code points 32…126 |
| `packRects(items, { maxSize?, minSize?, padding?, extrude? })` | `packer.mjs` | Deterministic MaxRects → `PackResult { pages, placements }` (input order); throws `RangeError` on duplicates, bad sizes/options, an item too large for `maxSize²`. `MAX_PAGE_SIZE` = 2048; typedefs `PackItem`, `PackOptions`, `Placement`, `PackResult` |
| `encodePng(image)`, `decodePng(bytes)`, `crc32(bytes, crc?)`, `PNG_SIGNATURE` | `png.mjs` | Zero-dependency RGBA encoder (deterministic per zlib version; `RangeError` on a bad buffer); `pngjs` decoder for any PNG → RGBA |
| `createImage`, `parseColor`, `setPixel`, `getPixel`, `blit`, `crop`, `flipHorizontal`, `flipVertical`, `imageFromRows`, `imagesEqual`; `Image`, `Rgba` | `image.mjs` | Straight-alpha RGBA rasters `{ width, height, data }` |
| `whiteSilhouette(frame)`, `makeFlashSprite(sprite)`, `FLASH_SUFFIX` (`'@flash'`) | `flash.mjs` | D30 hit-flash sprites |
| `createAssetRng(seed)` → `AssetRng { nextU32, nextFloat, rangeInt, chance }`, `hash2(x, y, seed)` | `rng.mjs` | sfc32 with its own splitmix32 seeding (sequences differ from `core/rng`); stateless position hash for tiling textures |
| `PROCEDURAL_GENERATORS`, `generateProceduralSprites()` | `procedural/index.mjs` | Registry `{ id, generate }[]`; every generator's sprites in registry order |
| `DIRECTIONS_8`, `color`, `mix`, `withAlpha`, `seedOf`, `makeSprite` | `procedural/common.mjs` | Exact 22.5° headings, colour helpers, FNV-1a name seed, `SpriteDef` builder (`origin: procedural:<id>`) |
| `generate()` per module; `BULLET_COLORS`, `METER_LABELS`, `TERRAIN_TILES`, `TILE_SIZE` (8), `STAR_TILE_SIZE` (128) | `procedural/*.mjs` | The generators (`backdrops` — M1-18: `bg/azure-verge`, zone A's planet-rim parallax band, a seamless `AZURE_TILE_W` 128 × `AZURE_TILE_H` 48 tile, haze above the lit rim row `AZURE_RIM_ROW` 10, then an opaque azure-to-navy body with seeded cloud streaks that wrap — `bullets`, `explosions`, `hud`, `items`, `lasers` — M1-09: `lasers/beam-{pink,red,purple}`, 8 frames of 4×8, frame `k` a band `k + 1` px tall; `BEAM_WIDTH`, `BEAM_HEIGHT`, `bandRows` — `particles`, `shields`, `starfield`, `terrain`, `ui` — M1-16: `ui/logo`, 165×27, from original 5×7 block letters; `LOGO_TEXT` `'SHMUP CUP'`, `LOGO_SCALE` 3) and their data |

### Playtest (`test/playtest/`)

The headless playtest of plan M1-18 (plan §1.4) — test code in the `integration` Vitest project,
imported by relative path. Guide: [zone-a-and-playtest.md](zone-a-and-playtest.md#the-playtest-testplaytest).

| Export | File | Summary |
|---|---|---|
| `runStage(stageId, bot, flags = {})` | `harness.ts` | Plays a shipped stage in bare gameplay (`createGame` on the headless platform, the shipped content) with `bot` at player 1's controls until `stageClear`, `gameOver` or `maxTicks` → `PlaytestResult`; throws `Error` for content issues, `RangeError` for an unknown stage or a bad config |
| `PlaytestBot` | `harness.ts` | `{ name, decide(world) → Action mask }` — called once per tick before it runs; the harness commits the mask like an input adapter (presses are edges of the held mask) |
| `PlaytestFlags` | `harness.ts` | `godMode?` (on `world.debugFlags`), `seed?` (1), `stageSkip?` (`'none'`), `config?` (other `GameConfig` fields — `seed`, `stage`, `stageSkip` win), `maxTicks?` (`DEFAULT_MAX_TICKS`), `observe?(world)` (after every tick; read only) |
| `PlaytestResult`, `PlaytestDeath` | `harness.ts` | `stageId`, `bot`, `godMode`, `seed`, `status`, `ticks`, `clearTick` (−1), `seconds`, `bossDefeated`, `bossFightTicks` (−1), `deaths` (`tick`, `cameraX`, `cause` — `PLAYER_HIT_CAUSE_NAMES` —, `y`, `boss`, `livesLeft`), `score`, `pickups`, `equips` (per `MeterSlot`), `diagonalTicks`, `shipX { min, max }`, `inputs` (`Uint16Array`, one held mask per tick), `hash` (`hashWorld`) |
| `replayStage(stageId, inputs, flags = {})`, `ReplayOutcome` | `harness.ts` | Replays a recording in a fresh session with the same flags → `{ status, ticks, deathTicks, hash }` (equal to the run's) |
| `describeRun(run)` | `harness.ts` | → one-line summary (`zone-a four-way (god mode): stageClear after 210.2 s, boss 21.7 s, 0 death(s), …`) |
| `shippedContent()` | `harness.ts` | → the shipped `ContentDb`, validated like the shell's boot (`KNOWN_SCRIPT_IDS`, `ENGINE_SPRITES`, the enemy / weapon behaviour checks), cached per worker; throws `Error` listing the issues |
| `TICKS_PER_SECOND`, `DEFAULT_MAX_TICKS`, `DIRECTIONS` | `harness.ts` | `60`; ten minutes of ticks (36,000); the four direction bits of `Action` |
| `fourWayBot()` | `four-way-bot.ts` | → a `PlaytestBot` named `four-way`: never two directions, x ≈ `BOT_X`, up / down to the cheapest lane of the danger scan (trip + stay + terrain − preferences, 20-point hysteresis), then back to `BOT_X`; one-tick `PowerUp` presses on Speed (≤ `BOT_MAX_SPEED_LEVEL`), Missile, Option. One bot per run |
| `scanLanes(world, scan)`, `createLaneScan()`, `LaneScan` | `four-way-bot.ts` | Fills `LaneScan { centre, span: Uint32Array (slot bits per lane), terrain: Float64Array, wall: Uint8Array }` (cleared first) from bullets, bodies, boss parts, lasers (from 12 ticks before the beam grows) and rock within `TERRAIN_AHEAD` |
| `laneCentre(lane)`, `laneOf(y)` | `four-way-bot.ts` | A lane's centre row; the lane of a playfield row (clamped) |
| `BOT_X`, `LANE_HEIGHT`, `LANES`, `BULLET_HORIZON`, `SLOT_TICKS`, `SLOTS`, `TERRAIN_AHEAD`, `BOT_MAX_SPEED_LEVEL` | `four-way-bot.ts` | `64`, `16`, `12`, `40`, `2`, `20`, `56`, `2` |
| `maxBulletSpeed(world)` | `rules.ts` | → the fastest live enemy bullet (px/tick; 0 without) |
| `laserLaneGaps(world)`, `LaneGaps` | `rules.ts` | → `{ lanes, separate, narrowestBetween (Infinity with < 2), widestOpen }` — lanes = lasers in telegraph / grow / active, rows widened by the hurt radius and clipped to the playfield (a beam wholly off it is no lane), overlapping lanes merged |
| `createRuleWatch()`, `RuleWatch` | `rules.ts` | A collector: `observe(world)` (bound — pass it as `PlaytestFlags.observe`), `maxBulletSpeed`, `maxLanes`, `maxSeparate`, `narrowestGap`, `narrowestOpen`, `violations` (the first 20, `tick N: …`) |
| `MAX_AIMED_BULLET_SPEED`, `MIN_LANE_GAP` | `rules.ts` | `2.0` px/tick (D17, Normal); `16` px |

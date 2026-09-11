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
| `GameConfig` | interface | `internalWidth` 384, `internalHeight` 216, `tickRate` 60, `maxTicksPerFrame` 4, `seed`, `difficulty`, `powerUpMode`, `deathPenalty`, `startingLives` 3, `autofire`, `remoteMode` |
| `DEFAULT_GAME_CONFIG` | const | Frozen defaults (remote-first: `autofire` and `remoteMode` true, `'direct'` items, `'classic'` penalty, `'normal'`) |
| `resolveGameConfig(overrides?)` | function | → frozen, validated config; throws `RangeError` for out-of-range integers |
| `PowerUpMode`, `DeathPenaltyPreset`, `DifficultyPreset` | types | `'meter' \| 'direct'`; `'arcade' \| 'classic' \| 'casual'`; `'easy' \| 'normal' \| 'hard' \| 'arcade'` |
| `HUD_BAR_HEIGHT`, `PLAYFIELD_Y`, `PLAYFIELD_W`, `PLAYFIELD_H` | const | Screen layout (decision D20): `8`, `8`, `384`, `200` — two 8-px HUD bars outside a 384×200 playfield; world `y` maps to screen `y − camera.y + PLAYFIELD_Y` |

### `loop` — fixed timestep

| Export | Kind | Summary |
|---|---|---|
| `createFixedStepLoop({ tickRate, maxTicksPerFrame, onTick, snapToleranceMs? })` | function | → `FixedStepLoop`; throws `RangeError` for `tickRate ≤ 0` or cap `< 1` |
| `FixedStepLoop` | interface | `stepMs`, `alpha`, `totalTicks`, `advance(nowMs) → ticks run`, `reset()` |
| `FixedStepLoopOptions` | interface | Options above |
| `DEFAULT_SNAP_TOLERANCE_MS` | const | `1` |

### `game` — composition root

| Export | Kind | Summary |
|---|---|---|
| `createGame(platform, overrides?, content?)` | function | → `Game`; registers suspend/resume handlers on the platform. `content` defaults to `EMPTY_CONTENT_DB` |
| `Game` | interface | `config`, `content`, `platform`, `events` (`EventQueue` the systems push presentation events into; the host drains it once per frame), `state`, `inputContext` (getter: the binding context the top scene wants — `'game'` until M1-16), `step()`, `frame(nowMs) → ticks`, `renderFrame()` (*reused* `RenderFrame`: `world` `null` until M1-06, empty `hud` / `ui` draw lists, zero `screen`), `pause()`, `resume()` |
| `GameState` | interface | `tick`, `paused`, `suspended`, `input` (last snapshot) |

### `presentation` — back-end contracts and the render contract

The per-frame contract between the simulation and a renderer (plan §3.4). Guide:
[rendering-and-shell.md](rendering-and-shell.md).

| Export | Kind | Summary |
|---|---|---|
| `IRenderer` | interface | `width`, `height`, `resize(cssW, cssH)`, `render(frame)`, `destroy()` |
| `RenderFrame` | interface | `tick`, `alpha`, `world: WorldView \| null`, `hud: DrawList`, `ui: DrawList`, `screen: ScreenView` — *reused* by the game |
| `WorldView` | interface | `camera: CameraView { x, y }`, `parallax: ParallaxView \| null`, `terrain: TerrainView \| null`, `batches: SpriteBatchView[]` (read once when a renderer binds the view) |
| `SpriteBatchView` | interface | `layer`, `capacity`, `count`, per slot `x`, `y` (world pixels of the anchor), `spriteId` (sprite name table index), `frame`, `flags` — `ArrayLike<number>`, so SoA pools implement it directly |
| `SpriteBatch` | interface | Writable batch with canonical arrays (`Float64Array` x/y, `Uint16Array` spriteId/frame, `Uint8Array` flags) |
| `createSpriteBatch(layer, capacity)` | function | → empty `SpriteBatch`; throws `RangeError` for a non-positive capacity or an unknown layer |
| `pushSprite(batch, x, y, spriteId, frame, flags = 0)` | function | Appends a slot → its index, or `-1` when full; never allocates |
| `SpriteFlag` | const + type | `FlipX 1`, `FlipY 2`, `Hidden 4` (blink), `Flash 8` (draw the `<sprite>@flash` sibling, D30) |
| `LayerId` | const + type | Draw order `BgFar 0, BgMid 1, Terrain 2, GroundEnemies 3, AirEnemies 4, PlayerShots 5, Player 6, Hitbox 7, Items 8, Fx 9, EnemyBullets 10, Hud 11, Ui 12, Debug 13` — append, never renumber |
| `LAYER_COUNT`, `LAYER_NAMES` | const | `14`; `'BG_FAR'` … `'DEBUG'` by code |
| `ParallaxView`, `TerrainView` | interfaces | Minimal shapes drawn from M1-07: `count`, `layer`, `spriteId`, `offsetX`, `y`; `tileSize`, `cols`, `rows`, `tiles`, `tilesetSpriteId` |
| `ScreenView` | interface | `shakeX`, `shakeY` (px, rounded by the renderer), `flash` (0…1 white over the playfield), `dim` (0…1 black under the UI) |
| `createDrawList(capacity = 256, stringCapacity = 32)` | function | → `DrawList`; throws `RangeError` for non-positive capacities |
| `DrawList` | interface | Column-wise typed arrays `op, x, y, w, h, color, alpha, ref, frame, flags, value` + `strings`; `count`, `dropped`, `revision`; `clear()`, `rect()`, `sprite()`, `text(slot, …)`, `number(value, …, minDigits)`, `setString(slot, text) → changed` (`text`/`setString` throw `RangeError` for a bad slot). Commands return their index or `-1` when full |
| `DrawOp`, `TextAlign` | const + type | `Rect 1, Sprite 2, Text 3, Number 4`; `Left 0, Center 1, Right 2` |
| `DEFAULT_DRAW_LIST_CAPACITY`, `DEFAULT_DRAW_LIST_STRINGS` | const | `256`, `32` |
| `TextMetrics` | interface | `measure(text, fontId)` (widest line; throws `RangeError` for an unknown font), `lineHeight` — implemented by render-pixi `text` (moved here from the placeholder `ui`, which re-exports it) |
| `IAudio` | interface | `state`, `unlock()`, `suspend()`, `resume()`, `setBusVolume(bus, 0…1)`, `destroy()` |
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
| `SIN_TABLE_Q16`, `ATAN_TABLE`, `TRIG_SCALE` (65536), `ATAN_TABLE_STEPS` (256) | const | Raw generated table data from `math/trig-table.ts` — for tests and tools, not gameplay code |

`math/trig-table.ts` is **generated**: `pnpm trig:tables` (`scripts/gen-trig-tables.mjs`,
`--check` to verify, `--out FILE` to write elsewhere). It computes both tables with BigInt
fixed-point arithmetic, so the output is byte-identical on every engine.

### `events` — sim → presentation queue

| Export | Kind | Summary |
|---|---|---|
| `createEventQueue(capacity = DEFAULT_EVENT_QUEUE_CAPACITY)` | function | → `EventQueue`; throws `RangeError` unless `capacity` is a positive integer |
| `EventQueue` | interface | `capacity`, `length`, `dropped`, `push(kind, id, x, y, param)`, `drain(visit)`, `clear()` |
| `SimEvent` | interface | `kind`, `id`, `x`, `y`, `param` — the single *reused* record `drain` hands to `visit` |
| `SimEventKind` | const + type | `Sfx 0, Music 1, Particles 2, Shake 3, Flash 4, HitStop 5, Rumble 6` |
| `SIM_EVENT_KIND_NAMES` | const | Names indexed by code (`'sfx'`, `'music'`, …) |
| `SFX_CUES`, `SfxCue`, `SFX_CUE_NAMES` | const/type | 21 cues, `PlayerShot 0` … `WarningSiren 20` (shmup_feat.md §19) |
| `MUSIC_CUES`, `MusicCue`, `MUSIC_CUE_NAMES` | const/type | 15 cues, `Silence 0` … `Escape 14` |
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
| `LoadContentOptions` | interface | `knownScripts?` (array or `Set`; unknown `script` refs become issues — M1-08 passes it), `migrations?` (defaults to `CONTENT_MIGRATIONS`) |
| `ContentFile` | interface | `{ path, data }` — one parsed JSON document, as `virtual:shmup-content` provides it |
| `ContentDb` | interface | `sprites`, `scripts` (`StringTable`), `ships`, `weapons`, `weaponPresets`, `enemies`, `stages`, each with an id → position `…Index` map (`shipIndex`, `weaponIndex`, `weaponPresetIndex`, `enemyIndex`, `stageIndex`) |
| `StringTable` | interface | `{ names, index }` — interned names in ascending order; `names[i]` is index `i` |
| `EMPTY_CONTENT_DB` | const | Frozen, shared empty database (the default for `createGame`) |
| `CONTENT_KINDS`, `ContentKind`, `isContentKind(kind)` | const/type/function | `player`, `weapons`, `enemies`, `stage`; other kinds come back in `foreign` |
| `ContentFileHeader` | interface | `{ formatVersion, kind }` — first two fields of every file |
| `CONTENT_FORMAT_VERSION` | const | `1`; a newer version is rejected with an issue |
| `CONTENT_MIGRATIONS`, `ContentMigration`, `ContentMigrationTable` | const/types | Per-kind `fromVersion → (data) => newData` table; ships `0 → 1` for `weapons`, `enemies`, `stage` (none for `player`) |
| `PlayerShipSpec`, `BoxSpec`, `MarginSpec` | types | A ship of a `player` file: `speeds` (D3), `hurtRadius`, `terrainBox`, `pickupBox`, `margins`, timers, `spriteId` |
| `WeaponSpec`, `WeaponSlot`, `WEAPON_SLOTS`, `WeaponPresetSpec` | types/const | A weapon (`slot`, `behaviorId`, `damage`, `speed`, `cap`, `pierce`, `spriteId`, optional `refireTicks`, `sfxId`, `params`) and a meter-mode loadout (`mainId`/`missileId`/`doubleId`/`laserId`, `-1` = none) |
| `EnemySpec`, `EnemyRankSpec` | types | Stub (M1-08 extends): `hp`, `score`, `hurtbox`, `scriptId`, `spriteId`, `drop`, `rank?` |
| `StageSpec`, `StageCameraKey`, `StageCheckpoint`, `StageParallaxLayer`, `StageTilemapRef` | types | Stub (M1-07 extends): `length`, `camera`, `checkpoints`, `parallax`, `tilemap`, `events` |
| `StageEvent` = `StageSpawnEvent` \| `StageBossEvent` \| `StageMusicEvent` \| `StageScrollEvent` \| `StageCheckpointEvent` | types | Timeline entries by `type`: `spawn` (`enemyId`), `boss`/`midboss`/`warning` (`enemyId`), `music` (`cueId`), `scroll`, `checkpoint` |
| `ValidationIssue` | interface | `{ path, message }`, e.g. `enemies/x.enemies.json:enemies[3].hurtbox.hw` / `must be an integer in 1..512` |
| `s` | const | The combinators: `int`, `num`, `str`, `bool`, `enumOf`, `array`, `object`, `record`, `nullable`, `ref`, `oneOf` |
| `Schema<T>`, `Infer<S>`, `ObjectShape`, `ObjectValue<S, O>` | types | `parse(value, path, issues, refs?) → T \| undefined` (+ `typeName`, `refKind`); `Infer` extracts `T` |
| `RefSite`, `ContentRefKind` | types | A recorded `s.ref` site (`path`, `kind`, `id`, `container`, `field`); kinds `ship`, `weapon`, `enemy`, `stage`, `sprite`, `script`, `sfx`, `music` |

Every `s.ref` field `foo` gains a numeric sibling `fooId` after loading. Sprite and script
names are *interned* (sorted, then numbered, so ids never depend on file order);
ship/weapon/enemy/stage ids and `sfx`/`music` cue names must resolve or an issue is reported
and the id becomes `-1` (also the value for `null` and absent optional references).
`s.array(s.ref(…))` and `s.record(s.ref(…))` throw a `TypeError` at construction — wrap
references in objects. `pnpm content:check` runs the loader over `content/`.

The placeholder modules `weapons`, `enemies` and `stage` still declare their own
`WeaponSpec` / `EnemySpec` / `StageEvent` (not exported); the package entry exports the
`data` versions above. The steps that implement those systems (M1-07 stage, M1-08
enemies, M1-10 weapons) reconcile the two — import the `data` types in the meantime.

### `module-info`

`defineModule({ name, status, specRefs })` → frozen `ModuleInfo`; `ModuleStatus` =
`'placeholder' | 'partial' | 'implemented'`. Every module exports one as `moduleInfo`.

### Placeholder modules

Types only. They are **not** exported from the package entry yet (the `exports` map has
only `"."`), so today they can only be imported with relative paths from inside
`packages/core`. A module's exports join `src/index.ts` when it is implemented — as
`rng`, `math`, `events` and `pools` did in M1-01.

| Module | Declared types | Planned functions (from the source comments) |
|---|---|---|
| `player` | `PlayerShip` | `createPlayer`, `updatePlayer`, `killPlayer`, `respawnPlayer` |
| `weapons` | `WeaponSpec`, `WeaponBehaviorId`, `Loadout` | `fireWeapons`, `updateShots`, `PRESET_LOADOUTS` |
| `options` | `OptionGroup`, `OptionFormation` | `createOptionGroup`, `recordShipPosition`, `optionPosition` |
| `shields` | `ShieldState`, `ShieldKind` | `applyShieldHit`, `grantShield`, `shieldAbsorbsTerrain` |
| `powerups` | `PowerMeter`, `MeterSlot`, `DirectItem` | `advanceMeter`, `equipHighlighted`, `applyDirectItem` |
| `enemies` | `EnemySpec`, `Enemy` | `spawnEnemy`, `updateEnemies`, `damageEnemy` |
| `bullets` | `BulletSpawn` | `createBulletPool(512)`, `spawnBullet`, `updateBullets`, `cancelAllBullets` |
| `patterns` | `Script`, `ScriptContext`, `PatternNode` | `wait`, `createScriptRunner`, pattern primitives, `compilePattern` |
| `bosses` | `Boss`, `BossPart`, `BossPhase` | `createBoss`, `updateBoss`, `damagePart`, `bossDeathSequence` |
| `collision` | `Shape`, `SpatialGrid`, `TerrainQuery` | `circleVsCircle`, `aabbVsAabb`, `capsuleVsCircle`, `createSpatialGrid(32)` |
| `stage` | `StageEvent`, `CameraState`, `Checkpoint`, `StageRunner` | `createStageRunner(stageData, spawner)` |
| `scoring` | `PlayerScore`, `HiScoreEntry` | `addScore`, `checkExtend`, `insertHiScore` |
| `rank` | `RankInputs` | `computeRank(inputs) → 0–31`, `rankScale` |
| `scenes` | `Scene`, `SceneId`, `SceneStack` | scene-stack implementation |
| `ui` | `Widget`, `WidgetKind`, `HudModel` (+ `TextMetrics` re-exported from `presentation`) | `createMenu`, `menuTick`, `buildHudModel`, `layoutText` |
| `replay` | `Replay`, `ReplayHeader` | `createRecorder`, `recordTick`, `encodeReplay` / `decodeReplay`, `createPlayback` |
| `save` | `SaveData`, `SaveMigration` | `loadSave(storage)`, `writeSave`, `SAVE_MIGRATIONS` |
| `fx` | `FxState` | `requestHitStop`, `requestShake`, `tickFx` |
| `debug` | `DebugFlags`, `DebugCounters` | `hashState(game)`, `createDebugControls(game)` |

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
| `loadInputProfileChoice(storage)`, `saveInputProfileChoice(storage, id)` | `rebind` | Persistence hook (`Platform.storage` key `INPUT_PROFILE_STORAGE_KEY` = `'input.profile'`); load resolves `null` on a missing / empty value or a storage error |
| `InputProfile` | `rebind` | `InputTuning` + `id`, `label`, `device`, `context: { game, menu }` (as written), `register`, `tables: { game, menu }` (compiled); frozen |
| `ProfileBindings`, `ContextTables` | `rebind` | As written: `{ byCode, byKeyCode, buttons? }` → action names; compiled: `{ keys: KeyBindings, buttons: ActionMask[] }` — keys bound only in the other context have mask `0` |
| `InputProfileDevice`, `INPUT_PROFILE_DEVICES`, `KEY_PROFILE_DEVICES` | `rebind` | `'keyboard' \| 'remote' \| 'gamepad'`; all three; `keyboard` + `remote` (profiles the keyboard source takes) |
| `INPUT_PROFILES_KIND` | `rebind` | `'input-profiles'` |
| `REQUIRED_CONTEXT_ACTIONS` | `rebind` | `game`: `Up, Down, Left, Right, Pause`; `menu`: `Up, Down, Left, Right, Confirm, Back` |
| `SYSTEM_REMOTE_KEYS` | `rebind` | `Exit`, `VolumeUp`, `VolumeDown`, `VolumeMute` — never registered |
| `DEFAULT_KEYBOARD_PROFILE_ID`, `DEFAULT_REMOTE_PROFILE_ID`, `DEFAULT_GAMEPAD_PROFILE_ID` | `rebind` | `'keyboard-default'`, `'tizen-remote-safe'`, `'gamepad-standard'` |
| `InputProfilesResult`, `InputProfileRegistry` | `rebind` | Types above |

`rebind` is `partial`: the rebinding UI helpers (capture the next input, conflict detection,
reset to defaults, a per-device choice) arrive with the Options screen (M2-16). The
placeholder types `RemoteTuning` and `DeviceBindings` of the skeleton were replaced by
`InputTuning` and the profile types.

## `@shmup/audio-web`

| Export | Summary |
|---|---|
| `createWebAudio({ createContext? })` | → `WebAudio`; context created by the first `unlock()` |
| `WebAudio` | `IAudio` + `context` (or `null`) + `bus(name) → GainNodeLike \| null` |
| `WebAudioOptions` | Optional context factory (tests inject fakes) |
| `AudioContextLike`, `GainNodeLike` | The Web Audio subset used |

Placeholders: `sfx` (`SfxSpec`, `SfxPriority`), `music` (`MusicTrack`, `MusicLoop`),
`loader` (`LoadProgress`).

## `@shmup/render-pixi`

Draws the core's render contract with PixiJS v8 (renderer only, WebGL1 first) and zero
per-frame allocation. Guide: [rendering-and-shell.md](rendering-and-shell.md).

| Export | Module | Summary |
|---|---|---|
| `createPixiRenderer({ canvas, displayWidth, displayHeight, width?, height?, preferWebGLVersion?, atlas?, font?, testPattern?, glyphCapacity? })` | `renderer` | → `Promise<PixiRenderer>`; rejects without WebGL. Defaults: 384×216, WebGL1, font `'pixel'`, no test pattern, 1024 quads per HUD / UI layer |
| `PixiRenderer` | `renderer` | `IRenderer` + `webGLVersion`, `viewport`, `scene` (384×216 root), `layers`, `atlas`, `metrics` (`TextMetrics` or `null`), `bindings`, `setSpriteNames(names)`, `bindWorld(world \| null)` (throws `RangeError` for a batch on an unknown layer; `render()` calls it when `frame.world` changes identity) |
| `PixiRendererOptions` | `renderer` | Options above |
| `createAtlas(manifest, images, { onWarning? })` | `atlas` | → `Atlas`: one nearest `TextureSource` per page, a `Texture` per frame, frame ids consecutive per sprite. Throws `RangeError` for an image/page count or size mismatch (stale atlas), a page over 2048², a frame outside its page, a missing or shared frame |
| `Atlas` | `atlas` | `manifest`, `size`, `pages`, `textures`, `anchorX/Y`, `frameWidth/Height`, `framesLeft`, `missingFrame`, `pixelFrame`, `frameId(name)`, `spriteBase(sprite)` (→ id or `-1`), `resolveSpriteTable(names)` / `resolveFlashTable(names)` (→ `Int32Array`; unknown → `missingFrame`, warned once), `destroy()` |
| `AtlasManifest`, `AtlasPageInfo`, `AtlasFrameInfo`, `AtlasSpriteInfo`, `AtlasFontInfo`, `AtlasGlyphInfo`, `AtlasPageImage`, `AtlasOptions`, `FrameId` | `atlas` | Manifest shape (mirrors `virtual:shmup-assets`), page image type, options, frame handle |
| `MAX_ATLAS_SIZE`, `MISSING_SPRITE`, `PIXEL_SPRITE` | `atlas` | `2048`; `'ui/missing'` (magenta checker for anything unresolved); `'ui/pixel'` (1×1 white for rects) |
| `createLayerStack()` | `layers` | → `LayerStack { root, world, layers }`: one container per `LayerId`, world layers inside `world` (shake) |
| `WORLD_LAYER_COUNT` | `layers` | `LayerId.Hud` (11) — layers below it form the world group |
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
| `createDrawListView({ atlas, font, tables, capacity?, label? })` | `ui` | → `DrawListView { container, pool, draw(list), invalidate(), destroy() }`: draws a `DrawList` in command order, skipped when list and `revision` are unchanged |
| `computeIntegerViewport(dispW, dispH, baseW, baseH)` | `viewport` | → `Viewport { scale, x, y, width, height }` (pure) |
| `createTestPattern(width, height)` | `test-pattern` | → `TestPattern { root, update(tick) }` (`?scene=calibration`) |
| `pixelArtToRects(rows, colors, x?, y?)` | `test-pattern` | → merged horizontal runs as `PixelRect[]` (pure) |
| `PLACEHOLDER_SHIP` | `test-pattern` | 16×9 original pixel map |
| `PALETTE`, `PaletteColor` | `palette` | Placeholder colours (lifted navy background for the VA panels, letterbox) |

Placeholders: `particles`, `effects`, `debug`.

## `@shmup/shell`

The shared browser host of `apps/web` and `apps/tizen` (decision D34). Depends on
`@shmup/core`, `@shmup/render-pixi` and — only for the default `input-profiles` content owner
— `@shmup/input-web`; the input and audio adapters come in through core interfaces.
Guide: [rendering-and-shell.md](rendering-and-shell.md#the-browser-shell-shmupshell).

| Export | Module | Summary |
|---|---|---|
| `bootShell(options)` | `boot` | → `Promise<Shell>`; rejects with `ShellBootError` (after showing the boot error screen and releasing everything) for invalid content, a failed or stale atlas page, no WebGL, or a failing platform / game |
| `ShellOptions` | `boot` | `canvas`, `win`, `contentFiles`, `assets`, `input`, `audio`, `platform: (renderer) => Platform` (called after content validation — the apps apply the input profiles there), `gameConfig?`, `scene?` (`'showcase'`), `audioUnlock?` (`'gesture'` \| `'immediate'`), `preferWebGLVersion?` (1), `contentOwners?` (merged over `DEFAULT_CONTENT_OWNERS`), `createImage?`, `overlay?` (`null` disables it) |
| `Shell` | `boot` | `game`, `platform`, `renderer`, `atlas`, `events` (dispatcher), `content`, `scene`, `showcase`, `stop()` (idempotent; releases loop, listeners, input, renderer, atlas, audio) |
| `ShellAssets`, `ShellInput`, `ShellScene` | `boot` | `{ manifest, pageUrls }`; `PlatformInput` + `clear()` + `setContext(ctx)` (required; called once at boot and before a frame's ticks whenever `game.inputContext` changed) + `destroy()`; `'showcase' \| 'calibration'` |
| `ShellBootError` | `boot` | `Error` with `lines`, `issues`, `reason` |
| `sceneFromSearch(search)`, `SHELL_SCENES` | `boot` | `?scene=` → `ShellScene` (unknown → `'showcase'`); the scene list, default first |
| `BOOT_STATE_ATTRIBUTE` | `boot` | `'data-shmup-state'` — `loading` / `running` / `error` on the game canvas |
| `loadImages(urls, createImage, onProgress?)` | `loader` | → `Promise<images>` in `urls` order, parallel; rejects with `AssetLoadError { url }` on the first failure |
| `loadGameContent(files, { owners?, …LoadContentOptions })` | `loader` | → `LoadContentResult`: core issues, then each foreign kind's owner issues (`owners`, then `DEFAULT_CONTENT_OWNERS`), or `no loader for content kind` per unowned file; throws only `TypeError` for a non-array |
| `DEFAULT_CONTENT_OWNERS` | `loader` | Frozen owners of today's foreign kinds: `input-profiles` → input-web `loadInputProfiles` (issues only). An app entry of the same kind replaces it |
| `ContentOwner`, `ContentOwners`, `LoadGameContentOptions`, `ImageFactory`, `LoadableImage` | `loader` | `(files) => ValidationIssue[]`; owners by kind; option and image types |
| `createEventDispatcher()` | `dispatch` | → `EventDispatcher { on(kind, handler) → unsubscribe, visit, drain(queue), handlerCount(kind), dispatched, unhandled }`; `on` throws `RangeError` for an unknown kind |
| `SimEventHandler` | `dispatch` | `(event: Readonly<SimEvent>) => void` — the record is reused |
| `createBootOverlay(gameCanvas)` | `error-screen` | → `BootOverlay { canvas, showProgress(fraction, label), showError(title, lines), remove() }` or `null` (no document / no 2D context) |
| `drawProgress(ctx, w, h, fraction, label)`, `drawErrorScreen(ctx, w, h, title, lines) → lines shown`, `formatIssues(issues)` | `error-screen` | Canvas 2D drawing (`Canvas2DLike`) and `path: message` lines |
| `BOOT_SCREEN_COLORS`, `Canvas2DLike` | `error-screen` | Background `#10173a`, text, title `#ff5aa0`, track; the 2D context subset used |
| `startFrameLoop(scheduler, onFrame)` | `frame-loop` | → `FrameLoop { stop() }`; `FrameScheduler` = the two rAF functions (moved here from both apps) |
| `createShowcase({ starTileSize? })` | `showcase` | → `Showcase { spriteNames, world, frame, update(gameFrame) → frame }` (*reused*, pure function of the tick) |
| `SHOWCASE_SPRITES`, `ShowcaseOptions` | `showcase` | The showcase's sprite name table (11 names) |

## Apps

These are not libraries, but their modules export testable functions.

### `apps/web`

| Export | Module | Summary |
|---|---|---|
| `bootWebApp(canvas, resources, win?)` | `boot` | → `Promise<WebApp>` (`game`, `renderer`, `audio`, `input`, `profiles` (`InputProfileRegistry`), `shell`, `stop()`); `resources` = `WebAppResources { contentFiles, assets }` from the virtual modules. Key profile: `?profile=` › saved choice (applied once storage answers) › `keyboard-default`; pads `gamepad-standard`; an unknown `?profile=` → `console.warn`. Rejects with `ShellBootError` |
| `inputOverridesFromSearch(search)` | `boot` | → `InputOverrides { profile: string \| null, debounce: number \| null }` from `?profile=<id>` / `?debounce=<0…10>`; percent-decoded, last valid value wins |
| `createWebPlatform(options)` | `platform` | → `Platform` (`id: 'web'`, `exit: null`) |
| `createLocalStorage(storage \| null, prefix = 'shmup-cup:')` | `platform` | → `PlatformStorage`; first error → memory for the session |
| `createVisibilityLifecycle(source)` | `platform` | → `PlatformLifecycle` from `visibilitychange` |
| `WebPlatformOptions`, `StorageLike`, `VisibilitySource` | `platform` | Injected browser services |

The frame loop moved to `@shmup/shell` (`startFrameLoop`).

### `apps/tizen`

| Export | Module | Summary |
|---|---|---|
| `bootTizenApp(canvas, resources, win?)` | `boot` | → `Promise<TizenApp>` (`game`, `platform`, `renderer`, `audio`, `input`, `profiles` (`InputProfileRegistry`), `shell`, `stop()`); `resources` = `TizenAppResources { contentFiles, assets }`. Key profile: saved choice (applied and its keys registered once storage answers) › `tizen-remote-safe`; pads `gamepad-standard`. The Back watcher is installed before boot (Back also exits the boot error screen) |
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
| `defineShmupProject(name, { environment?, include? })` | `vitest.shared.ts` | Per-project Vitest config (tests under `test/`, Node environment) |
| `shmupContent({ root? })` | `vite.shared.ts` | Vite plugin → `virtual:shmup-content`: every shipped `content/**/*.json` inlined into the bundle, sorted by path, `example.*.json` skipped, full reload on change |
| `readContentFiles(root?)`, `CONTENT_MODULE_ID`, `ContentFileRecord`, `ShmupContentOptions` | `vite.shared.ts` | The Node-side reader behind the plugin (also used by `pnpm content:check`): recursive, `example.*` skipped, sorted by path; `SyntaxError` naming the file on bad JSON, `[]` for a missing root |
| `virtual:shmup-content` | `types/virtual-modules.d.ts` | Ambient module declaration: `default: readonly { path, data }[]` |
| `shmupAssets({ sourceDir?, outDir? })` | `vite.shared.ts` | Vite plugin: runs the cached asset pipeline in `buildStart`, serves `virtual:shmup-assets`, emits the atlas pages into `dist/assets/atlas/` in builds; dev middleware for `<base>assets/atlas/*`, regenerate + full reload on `assets/source/` edits (pipeline-code edits: Vite restarts, or a warning). Throws `AssetSourceError` from the build hooks on invalid sources |
| `ASSETS_MODULE_ID` (`'virtual:shmup-assets'`), `ATLAS_URL_DIR` (`'assets/atlas'`), `ShmupAssetsOptions` | `vite.shared.ts` | The virtual id, the relative page directory used by `pageUrls` and the build, the options type |
| `virtual:shmup-assets` | `types/virtual-modules.d.ts` | `manifest: AtlasManifest` (inlined), `pageUrls: readonly string[]` (relative, one per page), `default: { manifest, pageUrls }`; types `AtlasManifest`, `AtlasPage`, `AtlasFrame`, `AtlasSprite`, `AtlasFont`, `AtlasGlyph` |
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
| `generate()` per module; `BULLET_COLORS`, `METER_LABELS`, `TERRAIN_TILES`, `TILE_SIZE` (8), `STAR_TILE_SIZE` (128) | `procedural/*.mjs` | The generators (`bullets`, `explosions`, `hud`, `items`, `particles`, `shields`, `starfield`, `terrain`, `ui`) and their data |

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

### `config` — session configuration

| Export | Kind | Summary |
|---|---|---|
| `GameConfig` | interface | `internalWidth` 384, `internalHeight` 216, `tickRate` 60, `maxTicksPerFrame` 4, `seed`, `difficulty`, `powerUpMode`, `deathPenalty`, `startingLives` 3, `autofire`, `remoteMode` |
| `DEFAULT_GAME_CONFIG` | const | Frozen defaults (remote-first: `autofire` and `remoteMode` true, `'direct'` items, `'classic'` penalty, `'normal'`) |
| `resolveGameConfig(overrides?)` | function | → frozen, validated config; throws `RangeError` for out-of-range integers |
| `PowerUpMode`, `DeathPenaltyPreset`, `DifficultyPreset` | types | `'meter' \| 'direct'`; `'arcade' \| 'classic' \| 'casual'`; `'easy' \| 'normal' \| 'hard' \| 'arcade'` |

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
| `Game` | interface | `config`, `content`, `platform`, `state`, `step()`, `frame(nowMs) → ticks`, `renderFrame()` (*reused*), `pause()`, `resume()` |
| `GameState` | interface | `tick`, `paused`, `suspended`, `input` (last snapshot) |

### `presentation` — back-end contracts

| Export | Kind | Summary |
|---|---|---|
| `IRenderer` | interface | `width`, `height`, `resize(cssW, cssH)`, `render(frame)`, `destroy()` |
| `RenderFrame` | interface | `tick`, `alpha` (grows sim views + events later) |
| `IAudio` | interface | `state`, `unlock()`, `suspend()`, `resume()`, `setBusVolume(bus, 0…1)`, `destroy()` |
| `AudioBus` | type | `'master' \| 'music' \| 'sfx' \| 'ui'` |
| `AudioState` | type | `'uninitialized' \| 'suspended' \| 'running' \| 'closed'` |

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
| `ui` | `Widget`, `WidgetKind`, `HudModel`, `TextMetrics` | `createMenu`, `menuTick`, `buildHudModel`, `layoutText` |
| `replay` | `Replay`, `ReplayHeader` | `createRecorder`, `recordTick`, `encodeReplay` / `decodeReplay`, `createPlayback` |
| `save` | `SaveData`, `SaveMigration` | `loadSave(storage)`, `writeSave`, `SAVE_MIGRATIONS` |
| `fx` | `FxState` | `requestHitStop`, `requestShake`, `tickFx` |
| `debug` | `DebugFlags`, `DebugCounters` | `hashState(game)`, `createDebugControls(game)` |

## `@shmup/input-web`

| Export | Module | Summary |
|---|---|---|
| `createWebInput({ keyTarget, getGamepads?, bindings?, keyDevice? })` | `web-input` | → `WebInput` (`PlatformInput` + `keyboard`, `clear()`, `destroy()`). `poll()` once per tick; *reused* snapshot |
| `createKeyboardSource(target \| null, bindings)` | `keyboard` | → `KeyboardSource`: `held`, `consumeLatched()`, `clear()`, `handleEvent(e)`, `detach()` |
| `KeyEventLike` | `keyboard` | The `KeyboardEvent` fields read (tests pass plain objects) |
| `readGamepadActions(pad, state, buttons?)` | `gamepad` | → held mask of one pad; updates stick hysteresis state |
| `GamepadLike`, `GamepadReadState` | `gamepad` | Pad fields read; per-pad `stickDirections` |
| `DEFAULT_GAMEPAD_BUTTONS`, `STICK_DEADZONE` (0.2), `STICK_HYSTERESIS` (0.1) | `gamepad` | Standard-mapping button → actions table and stick tuning |
| `resolveKeyActions(code, keyCode, bindings)` | `keymap` | → mask; `code` first, `keyCode` fallback |
| `KeyBindings` | `keymap` | `{ byCode, byKeyCode }` |
| `DEFAULT_CODE_BINDINGS`, `DEFAULT_KEYCODE_BINDINGS`, `DEFAULT_KEY_BINDINGS` | `keymap` | Defaults (table in [../client/controls.md](../client/controls.md)) |
| `TIZEN_KEY_CODES` | `keymap` | Remote key codes: arrows 37–40, Enter 13, Back 10009, MediaPlayPause 10252, Ch± 427/428, colours 403–406 |

Placeholders: `rebind` (`DeviceBindings`), `remote` (`RemoteTuning`: release debounce,
diagonal support — tuned from the input-probe results).

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

| Export | Module | Summary |
|---|---|---|
| `createPixiRenderer({ canvas, displayWidth, displayHeight, width?, height?, preferWebGLVersion? })` | `renderer` | → `Promise<PixiRenderer>`; rejects without WebGL |
| `PixiRenderer` | `renderer` | `IRenderer` + `webGLVersion`, `viewport`, `scene` (384×216 root `Container`) |
| `computeIntegerViewport(dispW, dispH, baseW, baseH)` | `viewport` | → `Viewport { scale, x, y, width, height }` (pure) |
| `createTestPattern(width, height)` | `test-pattern` | → `TestPattern { root, update(tick) }` |
| `pixelArtToRects(rows, colors, x?, y?)` | `test-pattern` | → merged horizontal runs as `PixelRect[]` (pure) |
| `PLACEHOLDER_SHIP` | `test-pattern` | 16×9 original pixel map |
| `PALETTE`, `PaletteColor` | `palette` | Placeholder colours (lifted navy background for the VA panels) |

Placeholders: `atlas`, `layers`, `sprites`, `text`, `ui`, `particles`, `effects`,
`debug`.

## Apps

These are not libraries, but their modules export testable functions.

### `apps/web`

| Export | Module | Summary |
|---|---|---|
| `bootWebApp(canvas, win?)` | `boot` | → `Promise<WebApp>` (`game`, `renderer`, `audio`, `input`, `stop()`) |
| `createWebPlatform(options)` | `platform` | → `Platform` (`id: 'web'`, `exit: null`) |
| `createLocalStorage(storage \| null, prefix = 'shmup-cup:')` | `platform` | → `PlatformStorage`; first error → memory for the session |
| `createVisibilityLifecycle(source)` | `platform` | → `PlatformLifecycle` from `visibilitychange` |
| `WebPlatformOptions`, `StorageLike`, `VisibilitySource` | `platform` | Injected browser services |
| `startFrameLoop(scheduler, onFrame)` | `frame-loop` | → `FrameLoop { stop() }`; `FrameScheduler` = the two rAF functions |

### `apps/tizen`

| Export | Module | Summary |
|---|---|---|
| `bootTizenApp(canvas, win?)` | `boot` | → `Promise<TizenApp>` (`game`, `platform`, `renderer`, `audio`, `input`, `stop()`) |
| `createTizenPlatform(options)` | `platform` | → `Platform` (`id: 'tizen'`, `remoteOnly: true`); registers remote keys |
| `registerRemoteKeys(tizen, keys)` | `platform` | Batch registration with per-key fallback → names registered |
| `watchBackKey(target, onBack)` | `platform` | Calls `onBack` on non-repeat keyCode 10009 → unsubscribe function |
| `getTizenApi(win)` | `platform` | → `window.tizen` or `null` |
| `TizenApi`, `TizenPlatformOptions`, `StorageLike`, `VisibilitySource` | `platform` | Types |
| `REMOTE_KEYS_TO_REGISTER`, `TIZEN_BACK_KEY_CODE` | `platform` | `MediaPlayPause`, `ChannelUp/Down`, `ColorF0Red…ColorF3Blue`; `10009` |
| `startFrameLoop`, `FrameLoop`, `FrameScheduler` | `frame-loop` | Same as the web app |
| `checkTizenBundle(distDir)` | `scripts/check-bundle.mjs` | → `{ problems, files, code }`; `POLYFILL_BANNER` |
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

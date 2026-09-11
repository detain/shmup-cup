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
| `createGame(platform, overrides?)` | function | → `Game`; registers suspend/resume handlers on the platform |
| `Game` | interface | `config`, `platform`, `state`, `step()`, `frame(nowMs) → ticks`, `renderFrame()` (*reused*), `pause()`, `resume()` |
| `GameState` | interface | `tick`, `paused`, `suspended`, `input` (last snapshot) |

### `presentation` — back-end contracts

| Export | Kind | Summary |
|---|---|---|
| `IRenderer` | interface | `width`, `height`, `resize(cssW, cssH)`, `render(frame)`, `destroy()` |
| `RenderFrame` | interface | `tick`, `alpha` (grows sim views + events later) |
| `IAudio` | interface | `state`, `unlock()`, `suspend()`, `resume()`, `setBusVolume(bus, 0…1)`, `destroy()` |
| `AudioBus` | type | `'master' \| 'music' \| 'sfx' \| 'ui'` |
| `AudioState` | type | `'uninitialized' \| 'suspended' \| 'running' \| 'closed'` |

### `module-info`

`defineModule({ name, status, specRefs })` → frozen `ModuleInfo`; `ModuleStatus` =
`'placeholder' | 'partial' | 'implemented'`. Every module exports one as `moduleInfo`.

### Placeholder modules

Types only. They are **not** exported from the package entry yet (the `exports` map has
only `"."`), so today they can only be imported with relative paths from inside
`packages/core`. A module's exports join `src/index.ts` when it is implemented.

| Module | Declared types | Planned functions (from the source comments) |
|---|---|---|
| `rng` | `Rng`, `RngState`, `RngStreams` | `createRng(seed)`, `createRngStreams(seed)` (sfc32) |
| `math` | `BinaryAngle`, `EasingFn` | `sinB`, `cosB`, `atan2B`, `quantizeAngle`, 16.16 fixed-point helpers, `EASINGS` |
| `events` | `SimEvent`, `SimEventKind`, `EventQueue` | ring-buffer implementation of `EventQueue` |
| `pools` | `SoaPool`, `Pool<T>` | `createSoaPool(...)`, `createPool(factory, capacity)` |
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
| `data` | `ContentKind`, `ContentFileHeader`, `ValidationIssue` | `validateContent(json)`, `buildContentIndex(files)` |
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

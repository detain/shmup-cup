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
| `GameConfig` | interface | `internalWidth` 384, `internalHeight` 216, `tickRate` 60, `maxTicksPerFrame` 4, `seed`, `difficulty`, `powerUpMode`, `deathPenalty`, `startingLives` 3, `autofire`, `remoteMode`, `stage` (a `content/stages/` id, or `null` = free flight in open space — the default until M1-16), `aimDirections` (32 — the directions aimed enemy shots snap to, D17; a power of two 4–1024) |
| `DEFAULT_GAME_CONFIG` | const | Frozen defaults (remote-first: `autofire` and `remoteMode` true, `'direct'` items, `'classic'` penalty, `'normal'`) |
| `resolveGameConfig(overrides?)` | function | → frozen, validated config; throws `RangeError` for out-of-range integers, an `aimDirections` that is not a power of two, or a `stage` that is neither `null` nor a non-empty string (whether the id exists is checked by `createWorld`) |
| `PowerUpMode`, `DeathPenaltyPreset`, `DifficultyPreset` | types | `'meter' \| 'direct'`; `'arcade' \| 'classic' \| 'casual'`; `'easy' \| 'normal' \| 'hard' \| 'arcade'` |
| `HUD_BAR_HEIGHT`, `PLAYFIELD_Y`, `PLAYFIELD_W`, `PLAYFIELD_H` | const | Screen layout (decision D20): `8`, `8`, `384`, `200` — two 8-px HUD bars outside a 384×200 playfield; world `y` maps to screen `y − camera.y + PLAYFIELD_Y` |

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
| `createGame(platform, overrides?, content?)` | function | → `Game`; registers suspend/resume handlers on the platform. `content` defaults to `EMPTY_CONTENT_DB`; throws `RangeError` for invalid overrides or an `overrides.stage` the content does not have |
| `Game` | interface | `config`, `content`, `platform`, `events` (the World's `EventQueue`, `=== world.events`; the host drains it once per frame), `world` (the session's `World`, created by `createWorld(config, content)`; only `step()` advances it), `state`, `inputContext` (getter: the binding context the top scene wants — `'game'` until M1-16), `step()` (one `platform.input.poll()`, then `stepWorld`), `frame(nowMs) → ticks`, `renderFrame()` (*reused* `RenderFrame`: `world` = `game.world.view`, empty `hud` / `ui` draw lists, zero `screen`), `pause()`, `resume()` |
| `GameState` | interface | `tick`, `paused`, `suspended`, `input` (last snapshot) |

### `presentation` — back-end contracts and the render contract

The per-frame contract between the simulation and a renderer (plan §3.4). Guide:
[rendering-and-shell.md](rendering-and-shell.md).

| Export | Kind | Summary |
|---|---|---|
| `IRenderer` | interface | `width`, `height`, `resize(cssW, cssH)`, `render(frame)`, `destroy()` |
| `RenderFrame` | interface | `tick`, `alpha`, `world: WorldView \| null`, `hud: DrawList`, `ui: DrawList`, `screen: ScreenView` — *reused* by the game |
| `WorldView` | interface | `camera: CameraView { x, y }`, `parallax: ParallaxView \| null`, `terrain: TerrainView \| null`, `batches: SpriteBatchView[]`, `lasers?: LaserView \| null` (M1-09) — `batches` and the structure of the others are read once when a renderer binds the view |
| `LaserView` | interface | The enemy lasers (M1-09), drawn on `EnemyBullets`: `capacity`, `count`, per slot `x`, `y` (world origin), `angle` (binary units), `length`, `width` (**drawn** width; 0 = the 1-px telegraph line), `spriteId` (the beam strip), `flags` (`SpriteFlag`; `Hidden` = the warning line's blink) — live sim arrays (`core/bullets` `BulletSystem.laserView`) |
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
| `SimEventKind` | const + type | `Sfx 0, Music 1, Particles 2, Shake 3, Flash 4, HitStop 5, Rumble 6, FormationBonus 7` (M1-08: `id` = formation slot, `x` / `y` = last kill, `param` = bonus points) |
| `SIM_EVENT_KIND_NAMES` | const | Names indexed by code (`'sfx'`, `'music'`, …) |
| `SFX_CUES`, `SfxCue`, `SFX_CUE_NAMES` | const/type | 21 cues, `PlayerShot 0` … `WarningSiren 20` (shmup_feat.md §19) |
| `MUSIC_CUES`, `MusicCue`, `MUSIC_CUE_NAMES` | const/type | 15 cues, `Silence 0` … `Escape 14` |
| `FX_CUES`, `FxCue`, `FX_CUE_NAMES` | const/type | Particle cues — the `id` of `Particles` events (M1-08): `ExplosionSmall 0, ExplosionMedium 1, ExplosionLarge 2`, `BulletCancel 3` (M1-09: a cancelled enemy bullet's sparkle); `content/fx/` binds them to presets in M1-14 |
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
| `EnemySpec`, `EnemyRankSpec` | types | An enemy (M1-08; every optional field filled with its default at load): `id`, `hp`, `score`, `hurtbox`, `script` / `scriptId`, `sprite` / `spriteId`, `anim` (default 1 frame), `params` (behaviour tunables, default `{}`), `mover` (`EnemyMoverSpec \| null`), `drop` (`'capsule' \| null`), `ground` (`'floor' \| 'ceiling' \| null`), `settleTicks` (default `DEFAULT_SETTLE_TICKS` 30), `explosion` (default `'small'`), `megaCrashImmune` (default `false`), `child` / `childId` (spawners; `null` / `-1`), `rank?` |
| `EnemyAnimSpec`, `EnemyGround`, `EnemyExplosion`, `EnemyDrop` | types | `{ frames, ticks }`; `'floor' \| 'ceiling'`; `'small' \| 'medium' \| 'large'`; `'capsule'` |
| `ENEMY_GROUNDS`, `ENEMY_EXPLOSIONS`, `ENEMY_DROPS`, `DEFAULT_SETTLE_TICKS` | const | The code tables (ground / drop code = index + 1, 0 = none; explosion code = index); `30` |
| `EnemyMoverSpec`, `MoverType`, `MOVER_TYPES` | types/const | A starting mover by `type`: `straight { vx, vy }`, `sine { vx, amp, period, phase? }`, `path { path?, pathId, speed }` (`pathId -1` = the spawn event's path), `waypoint { x, y, speed, hold, leaveVx, leaveVy }`, `follow`, `groundCrawl { speed }`, `homing { speed, turnRate }` (whole binary units), `aimedDash { speed, windup }`; the eight names in `MoverKind` order |
| `PathSpec`, `PathPointSpec` | types | A `paths` entry (M1-08): `id`, `points` (2–64 `{ x, y }`, relative to the start, consecutive points distinct), `table` (`PathTable`, baked at load) |
| `bakePath(xs, ys)`, `PathTable` | function, type | Centripetal Catmull-Rom through the points → `{ length, samples (x, y interleaved, relative to the first point, one per PATH_SAMPLE_STEP px of arc length, the last = the end point), count, endDx, endDy }`; throws `RangeError` for < 2 points, coincident neighbours or a curve over `MAX_PATH_LENGTH` (load time only — it allocates) |
| `PATH_SAMPLE_STEP`, `MAX_PATH_LENGTH` | const | `1` px between samples; `16384` px |
| `StageSpec` | type | A stage (M1-07): `id`, `name`, `music: StageMusic` (`stage` / `boss` cues + `stageId` / `bossId`), `length`, `camera`, `checkpoints`, `parallax`, `tilemap` (`StageTilemapSpec \| null`), `events`, and two fields the loader adds: `flagNames` (sorted; index = flag bit) and `terrain` (`StageTerrain \| null`) |
| `StageCameraKey` | type | `x`, `speed` (px/tick, 0 = stop), optional `ramp` (ticks, linear), `yTo` + `yTicks` (eased vertical pan), `lock` (boolean — stop exactly at `x` until `runner.unlock()`) |
| `StageCheckpoint`, `StageParallaxLayer`, `StageParallaxLayerName` | types | `{ x }`; a band `{ layer: 'far' \| 'mid', sprite, spriteId, factor, y, spacing }`; `'far' \| 'mid'` |
| `StageTilemapSpec`, `HeightfieldSpec`, `HeightfieldSegment`, `HeightfieldProfile` | types | `{ tileSize: 8, tileset, tilesetId, rowsTall, rle?, generator? }`; `{ type: 'heightfield', segments }`; `{ from, to, floor?, ceiling? }`; `{ base, amp, period, seed }` |
| `StageTerrain` | type | The expanded grid (never in the JSON): `tileSize`, `cols` = `ceil((length + 384) / 8)`, `rows`, `tiles` (`Uint8Array`, shared content — copy before mutating), `tilesetId` |
| `StageEvent` = `StageSpawnEvent` \| `StageFormationEvent` \| `StageBossEvent` \| `StageMusicEvent` \| `StageSpeedEvent` \| `StageFlagEvent` \| `StageEndEvent` | types | Timeline entries by `type`: `spawn` (`enemyId`, `y?` (default mid-playfield), `screenX?` (default 400), `path?` / `pathId`), `formation` (the same + `count`, `interval`, `drop?` (default `'capsule'`, `null` = none), `bonus?` (default 0)), `warning` / `boss` (`enemyId`), `music` (`cueId`), `speed` (`speed`, `ramp?`), `flag` (`flag`, `flagId`, `value?` default `true`), `end` |
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
out). Guide: [enemies-and-behaviors.md](enemies-and-behaviors.md#data-as-loaded).

A stage gets checks beyond its schema (sorted keys / checkpoints / events, the first key at 0,
nothing past `length`, `yTicks` needs `yTo`, ≤ 32 flags) and a **third load pass** expands its
tilemap (`heightfield` generator and / or RLE rows, `core/data/tilemap.ts`) into
`StageSpec.terrain` once tileset ids are resolved. Guide:
[stage-runtime.md](stage-runtime.md#stage-data-and-loading).

The placeholder module `weapons` still declares its own `WeaponSpec` (not exported); the
package entry exports the `data` version above, and M1-10 reconciles the two — import the
`data` type in the meantime. (`stage` did so in M1-07 and `enemies` in M1-08: they use the
`data` types.)

### `world` — the gameplay session and the tick pipeline

One gameplay session and the fixed 9-phase tick of plan §3.2. Guide:
[sim-world.md](sim-world.md).

| Export | Kind | Summary |
|---|---|---|
| `createWorld(config, content, options?)` | function | → `World` at tick 0: RNG streams from `config.seed`, the ship from `resolvePlayerShip(content)`, the stage `config.stage` (runner at its start, collision map, parallax / terrain views, the stage theme queued as a `Music` event) or a static camera, the enemy system (M1-08), the rank of `config.difficulty` and the bullet system (M1-09), player 1 starting its fly-in, player 2 inactive, view already filled; throws `RangeError` for an unknown stage id |
| `WorldOptions` | interface | `behaviors?` — an `EnemyBehaviorLookup` replacing `DEFAULT_BEHAVIORS` (tests, tools; not in `GameConfig`, so never in a real session) |
| `resolveWorldStage(config, content)` | function | → the `StageSpec` `config.stage` names, `null` for free flight; throws `RangeError` for an unknown id |
| `stepWorld(world, input)` | function | Runs `WORLD_PHASES` in order (phases 2–8 skipped while `hitStop > 0` at the start of the tick), then `world.tick++`; never allocates |
| `World` | interface | `config`, `content`, `ship`, `tick`, `rng`, `events`, `players` (2), `intents` (2), `camera`, `status`, `hitStop`, `debugFlags`, `pools`, `grid`, `playerBatch`, `stage` (`StageRunner \| null`), `terrain` (`TerrainMap \| null`, a private copy of the tiles), `parallax` (`StageParallaxView \| null`), `enemies` (`EnemySystem`, M1-08), `bullets` (`BulletSystem`, M1-09), `rank` (the session's rank — constant in M1: the difficulty's base; hashed), `view` (batches: ground enemies, air enemies, players, enemy bullets; `lasers`: the enemy laser view) |
| `WorldCamera` | interface | `x`, `y` (playfield top-left in world pixels), `dx`, `dy` (last stage-phase step), `vx`, `vy` (scroll velocity px/tick; the stage runner writes it every tick, in free flight 0 = static unless a test sets it). A class instance (`createStageCamera()`), not a literal — see the V8 note in [stage-runtime.md](stage-runtime.md#gotchas) |
| `WorldStatus`, `WORLD_STATUSES` | type, const | `'playing' \| 'bossWarning' \| 'stageClear' \| 'gameOver'`; the list (index = hash code) |
| `WorldPhase`, `WORLD_PHASE_NAMES` | const + type, const | `Input 0, Players 1, Stage 2, Scripts 3, Movement 4, Collision 5, Damage 6, Removal 7, Fx 8`; `'input'` … `'fx'` |
| `WORLD_PHASES` | const | Frozen `WorldPhaseEntry[]` in tick order; only `input` and `fx` have `runsDuringHitStop` |
| `WorldPhaseEntry`, `WorldSystem` | interface, type | `{ phase, name, runsDuringHitStop, run }`; `(world, input) => void` |
| `PoolRegistry`, `RegisteredPool` | interfaces | `entries`, `register(name, pool) → pool` (throws `Error` for a duplicate name), `flushAll()` (phase 8), `clearAll()`; `{ name, pool, arrays }` with the field arrays in sorted name order (the hash order) |
| `syncWorldView(world)` | function | Scrolls the parallax bands with the camera, refills the enemies' ground / air batches (`enemies.sync()`) and the players' mirror batch (active, not `dying` / `dead`, sprite present; blinks while invulnerable); phase 9 and `createWorld` call it |
| `GRID_MARGIN` | const | `64` — px around the camera view covered by `world.grid` |
| `ENGINE_SPRITES` | const | Sprite names the engine draws whatever the content — `core/bullets` `BULLET_SPRITES` (the nine bullet kinds + the laser beam). Pass it as `loadContent`'s `extraSprites` (the shell's `loadGameContent` does by default); without it bullets simulate but are hidden |

### `player` — the player ship (partial)

Movement, speed levels, clamping, banking and the fly-in (M1-06); hits are *recorded* by
`playerHit` since M1-07 (terrain contact), M1-08 (enemy contact) and M1-09 (enemy bullets and
lasers); death and respawn arrive in M1-12.

| Export | Kind | Summary |
|---|---|---|
| `PlayerShip` | interface | `slot`, `active`, `x`, `y` (world centre, sub-pixel), `state`, `stateTicks`, `speedLevel`, `invulnTicks`, `bank`, `device`, `lives`, `moving`, `hitCause` / `hitTick` / `hits` (last accepted hit, `None` / `-1` / `0` when never hit) |
| `PlayerState`, `PLAYER_STATES` | type, const | `'entering' \| 'alive' \| 'dying' \| 'dead' \| 'respawning'`; the list (index = hash code) |
| `PlayerIntent` | interface | `held`, `pressed`, `released`, `device`, `moveX`, `moveY` (−1 / 0 / 1; opposites cancel) |
| `PlayerCamera` | interface | `CameraView` + `dx`, `dy` (the world camera satisfies it) |
| `createPlayer(slot, lives)` | function | → a `dead`, inactive ship (allocate once) |
| `createPlayerIntent()` | function | → an empty intent |
| `readPlayerIntent(intent, input)` | function | `PlayerInput` → intent (tick phase 1); never allocates |
| `spawnPlayer(ship, camera, state = 'entering')` | function | Starts a fly-in at camera-relative (`ENTER_START_X`, `SPAWN_Y`), level; `'respawning'` after a death |
| `setPlayerState(ship, state)` | function | Switches state, `stateTicks = 0` |
| `updatePlayer(ship, spec, intent, camera)` | function | One tick (phase 2): timers, fly-in (cubic ease-out over `spec.enterTicks`, input ignored), ride `camera.dx/dy`, move at `speeds[speedLevel]` (× `DIAGONAL_SCALE` per axis on diagonals, no inertia), clamp to the view minus `margins`, bank one step per tick; inactive ships skipped; never allocates |
| `playerBankFrame(bank, bankFrames)` | function | → sprite frame: 0 level, `1…N` up, `N+1…2N` down |
| `resolvePlayerShip(content, id = 'kestrel')` | function | → that ship, else the first, else `DEFAULT_PLAYER_SHIP` (load time) |
| `DEFAULT_PLAYER_SHIP` | const | Frozen built-in spec with the KESTREL tunables and `spriteId: -1` (not drawn) — for empty content |
| `DIAGONAL_SCALE`, `ENTER_START_X`, `ENTER_END_X`, `SPAWN_Y` | const | `0.7071` (D4); `-24`, `64` (camera-relative fly-in); `100` (`PLAYFIELD_H / 2`) |
| `playerHit(ship, cause, tick, debug)` | function | The one entry point for anything that would kill a ship → `true` when accepted: ignored for inactive, not-`alive`, invulnerable and god-mode ships; records `hitCause`, `hitTick`, `hits++` (hashed). Callers: terrain (M1-07), enemy contact (M1-08), enemy bullets and lasers (M1-09). Until M1-12 nothing else happens; never allocates |
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

### `debug` — state hash and debug switches (partial)

The debug controls (god mode, frame advance, slow motion, stage skip) arrive in M1-19.

| Export | Kind | Summary |
|---|---|---|
| `hashWorld(world)` | function | → unsigned 32-bit FNV-1a over tick, both RNG states, camera, the stage runner (`0`, or `1` + every slot of `runner.state`), status, hit-stop, rank (M1-09), every player's simulated fields (incl. `hitCause`, `hitTick`, `hits`), every registered pool's live slots (the enemy bullets and lasers among them), then every enemy slot's state (+ its fields when in use; a script as present / absent and its `wakeTick`) and the formation table's active slots with each track's `recorded` count (fixed order, numbers as little-endian doubles); reads only; ≤ 16 B allocated per call |
| `createDebugFlags()` | function | → `DebugFlags` all off, `slowMo` 1 |
| `DebugFlags` | interface | `godMode`, `showHitboxes`, `frameAdvance`, `slowMo` |
| `DebugCounters` | interface | `enemies`, `enemyBullets`, `playerShots`, `rngCalls`, `stateHash` (overlay, M1-19) |
| `FNV_OFFSET_BASIS`, `FNV_PRIME` | const | `0x811c9dc5`, `0x01000193` |

### `stage` — stage runtime

The scrolling stage: camera path, event timeline, checkpoints, and the terrain / parallax
views (M1-07). Guide: [stage-runtime.md](stage-runtime.md).

| Export | Kind | Summary |
|---|---|---|
| `createStageRunner(stage, hooks, camera = createStageCamera())` | function | → `StageRunner` at the stage start (camera 0, 0; speed 0 — the first key applies on the first tick). Compiles the timeline into typed arrays; throws `RangeError` for an event type the runtime does not know (content that skipped `loadContent`) |
| `StageRunner` | interface | `stage`, `camera`, `eventCodes` (`Uint8Array`), `state` (`Float64Array` indexed by `StageSlot` — hashed), getters `speed`, `targetSpeed`, `locked`, `eventCursor`, `checkpoint` (last passed, `-1` before the first), `flags` (bit `i` = `stage.flagNames[i]`), `ended`, `ticks`; `tick()` (never allocates), `restartAt(checkpoint)` (`-1` = start; throws `RangeError` unless an integer in `[-1, checkpoints.length)`), `unlock()` |
| `StageHooks` | interface | `event(code, event, index)` — every fired event, in timeline order, after the runner applied its own part (`speed`, `flag`, `end`); `clear()` — a checkpoint restart |
| `StageEventCode` | const + type | `Spawn 0, Formation 1, Warning 2, Boss 3, Music 4, Speed 5, Flag 6, End 7` (= `STAGE_EVENT_TYPES` order) |
| `StageSlot`, `STAGE_STATE_SLOTS` | const, const | Slots of `runner.state`: `Speed 0, Target 1, RampFrom 2, RampTicks 3, RampElapsed 4, PanFrom 5, PanTo 6, PanTicks 7, PanElapsed 8, Locked 9, Cursor 10, NextKey 11, NextCheckpoint 12, Checkpoint 13, Flags 14, Ended 15, Ticks 16, Restarts 17, Replay 18`; `19` |
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
(M1-08); rank modifiers (M2-01), the Option Hunter (M2-04) and boss parts (M1-13) come later.
Guide: [enemies-and-behaviors.md](enemies-and-behaviors.md).

| Export | Kind | Summary |
|---|---|---|
| `createEnemySystem(host, behaviors, stage)` | function | → `EnemySystem` (load time — `createWorld` calls it with the World as host): 64 slots + script APIs, the formation table, ground / air batches, specs and the stage's spawn events compiled into typed arrays |
| `EnemySystem` | interface | `enemies` (64 `Enemy`, index = slot), `count` (slots in use), `formations`, `outcomes`, `groundBatch`, `airBatch`, `movers`; `spawn(enemyIndex, x, y, pathId?)` → `Enemy \| null` (lowest free slot; `NaN` y = mid-view / surface snap; bad or fractional index, no free slot → `null`), `startFormation(enemyIndex, count, interval, screenX, screenY, pathId, drop, bonus)` → slot or `-1`, `damage(enemy, amount)` → died (ignored for ghosts / invulnerable; flash, `Sfx EnemyHit`), `kill(enemy)` → was alive (outcomes, explosion SFX + particles, drop, formation accounting), `clear()`; the World's per-phase calls `onStageEvent(i)`, `beginTick()`, `spawnPending()`, `runScripts()`, `move()`, `insertColliders(grid)`, `collidePlayers(grid)`, `flush()`, `sync()` — none allocates beyond the coroutines' own (a generator per spawn, a result per wake) |
| `EnemyHost` | interface | What the system reads from its World: `tick`, `camera`, `players`, `ship`, `terrain`, `content`, `rng`, `events`, `debugFlags`, `bullets` (M1-09: fire primitives; lasers detach when their enemy goes) |
| `Enemy` | class | One pooled enemy (`MoverBody` + `ScriptHolder`): `slot`, `state`, `specIndex`, `x`, `y`, `vx`, `vy`, `hw`, `hh`, `hp`, `flashTicks`, `age`, `spawnTick`, `formation`, `member`, `anchor`, mover fields, `track`, `script`, `wakeTick`, `flags`, `firstSeenTick`, `spriteId`, `animFrame`, `pathId`, `camX`, `camY` |
| `EnemyState` | const + type | `Free 0`, `Live 1` (ghosts too), `Removed 2` (freed in phase 8) |
| `EnemyFlag` | const | Bits `Invulnerable 1, Settled 2, WasOnScreen 4, OnScreen 8, Ghost 16, FaceRight 32, Leader 64` |
| `ScriptApi` | interface | One reused object per slot: `self`, `spec`, `tick`, `rng` (gameplay), `target()` (nearest active `alive` ship or `null`), `setMover(kind, p0…p5)`, `spawn(enemyIndex, dx, dy)` (script starts next tick; ghosts spawn nothing), `onScreen()`, `canFire()` (live, on screen, settled, not a ghost); M1-09 fire primitives from the enemy's centre, each a no-op returning `-1` / `0` while `canFire()` is false: `aimed(speed, kind)`, `nWay(count, step, speed, kind, angle?)`, `ring(count, speed, kind, offset?)`, `spiral(angle, arms, step, speed, kind)` (→ next angle, advanced even when it may not fire), `stack(…)`, `spray(…)` (gameplay RNG), `homing(…)`, `delayed(…)`, `laser(angle?, length = 384, width?, telegraph?, grow?, active?, fade?)` (attached to the enemy), `fireWait(ticks)` (= `rankedWait`), `bullets` (the World's `BulletSystem`) |
| `EnemyBehavior`, `EnemyBehaviorLookup` | interfaces | `{ id, params, create(api, params) → Script }`; `get(id)` (`core/behaviors` provides both) |
| `FormationTable` | interface | 32 slots of typed arrays: `active`, `enemy`, `total`, `spawned`, `killed`, `escaped`, `interval`, `nextTick`, `screenX`, `screenY`, `path`, `drop`, `bonus`, `lastX`, `lastY`, `leader`, + `tracks` (`FollowTrack` per slot) — hashed |
| `EnemyOutcomes` | interface | This tick's `killCount`, `killSpec`, `killX`, `killY`, `killScore`, `dropCount`, `dropKind`, `dropX`, `dropY`, `bonusPoints` (reset in phase 3; for M1-11 / M1-12) |
| `DropKind` | const + type | `None 0`, `Capsule 1` |
| `MAX_ENEMIES`, `MAX_FORMATIONS` | const | `64`, `32` |
| `DEFAULT_SPAWN_SCREEN_X` | const | `400` (`PLAYFIELD_W + 16`) |
| `DESPAWN_MARGIN`, `UNSEEN_MARGIN`, `UNSEEN_TICKS`, `GHOST_MARGIN` | const | `32` px (escaped after being seen), `128` px / `600` ticks (never seen), `128` px (ghost leader) |
| `HIT_FLASH_TICKS` | const | `4` (D30) |

### `behaviors` — enemy behaviour registry (partial)

The script ids content refers to (M1-08). Guide:
[enemies-and-behaviors.md](enemies-and-behaviors.md#behaviours-corebehaviors).

| Export | Kind | Summary |
|---|---|---|
| `defineBehavior(id, params, create, needsChild = false)` | function | → frozen `BehaviorDef` (tunables copied and frozen) |
| `BehaviorDef` | interface | `EnemyBehavior` + `id`, `params` (defaults), `create(api, params)`, `needsChild` (spawners) |
| `createBehaviorRegistry(defs)` | function | → `BehaviorRegistry { ids (sorted), get(id) }`; throws `Error` for a duplicate id |
| `DEFAULT_BEHAVIOR_DEFS`, `DEFAULT_BEHAVIORS`, `BEHAVIOR_IDS` | const | The M1 roster: `drifter.sine`, `fan.loop`, `carrier.straight`, `turret.floor`, `walker.floor`, `hatch.spawner`, `rammer.aimed`, `orbiter.loop` (tunables in the guide); as a registry (what the World uses); its sorted ids |
| `WEAPON_SCRIPT_IDS` | const | `laser.beam`, `missile.groundSlide`, `shot.double`, `shot.straight` — the Type A weapon behaviours M1-10 implements (they share the content's script table; moves to `weapons` then) |
| `KNOWN_SCRIPT_IDS` | const | `BEHAVIOR_IDS` ∪ `WEAPON_SCRIPT_IDS`, sorted — pass it to `loadContent` as `knownScripts` |
| `checkEnemyBehaviors(db, registry = DEFAULT_BEHAVIORS)` | function | → `ValidationIssue[]`: `enemies:<id>.params.<name>` (unknown tunable), `enemies:<id>.child` (spawner without a child) |

### `bullets` — enemy bullets and lasers

The enemy projectiles of a World (M1-09; implemented for P0 — bending lasers, cancel into
points and the pattern DSL arrive with M2-02). Guide: [bullets-and-patterns.md](bullets-and-patterns.md).

| Export | Kind | Summary |
|---|---|---|
| `createBulletSystem(host)` | function | → `BulletSystem` (load time — `createWorld` calls it with the World as host): registers the `enemyBullets` (512) and `enemyLasers` (16) pools, builds their views and the kind tables (sprite ids via `content.sprites`); throws `Error` when the pool names are already registered |
| `BulletSystem` | interface | `pool`, `lasers` (the two `SoaPool`s), `batch` (the bullet pool as the `EnemyBullets` `SpriteBatchView`), `laserView` (`LaserView`), `count`, `rank`, `speedScale`, `fireScale`, `aimDirections`; `setRank(rank)`; `spawn(x, y, angle, speed, kind)` / `emit(origin, angle, speed, kind)` → slot or `-1` (raw values: full pool, bad or fractional kind, non-finite angle other than `AIM_AT_TARGET` drop quietly); `aimFrom(origin)` → quantised angle to the nearest living player; per-slot `setMotion(i, accel, angVel, minSpeed, maxSpeed)`, `setChange(i, atAge, speed, angle)`, `setDelay(i, ticks, aimOnLaunch)`, `setHoming(i, turnRate, lifetime)`, `setFlags(i, flags)` (no-ops for bad or removed slots); `fireLaser(origin, angle, length, width, telegraph, grow, active, fade, src)`; `detachLasers(slot)`; the World's per-phase `update()` (phase 5) and `collidePlayers()` (phase 6); `cancelAll(mode)` — none allocates |
| `BulletHost`, `BulletOwner` | interfaces | What the system reads from its World (`tick`, `config`, `camera`, `players`, `ship`, `terrain`, `content`, `events`, `debugFlags`, `pools`, `enemies`); anything with a `.bullets` system (the World) |
| `BulletOrigin` | class | `{ x, y }` a pattern fires from — one reused instance per firing system (a class, so the fields stay unboxed) |
| `LaserSource` | interface | `{ slot, x, y }` — an `Enemy` works; `slot` -1 = a fixed origin |
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

### `module-info`

`defineModule({ name, status, specRefs })` → frozen `ModuleInfo`; `ModuleStatus` =
`'placeholder' | 'partial' | 'implemented'`. Every module exports one as `moduleInfo`.

### Placeholder modules

Types only. They are **not** exported from the package entry yet (the `exports` map has
only `"."`), so today they can only be imported with relative paths from inside
`packages/core`. A module's exports join `src/index.ts` when it is implemented — as
`rng`, `math`, `events` and `pools` did in M1-01, `world`, `player`, `collision` and
`debug` in M1-06, `stage` in M1-07, `enemies`, `patterns` and the new `behaviors` in
M1-08, and `bullets` and `rank` in M1-09.

| Module | Declared types | Planned functions (from the source comments) |
|---|---|---|
| `weapons` | `WeaponSpec`, `WeaponBehaviorId`, `Loadout` | `fireWeapons`, `updateShots`, `PRESET_LOADOUTS` |
| `options` | `OptionGroup`, `OptionFormation` | `createOptionGroup`, `recordShipPosition`, `optionPosition` |
| `shields` | `ShieldState`, `ShieldKind` | `applyShieldHit`, `grantShield`, `shieldAbsorbsTerrain` |
| `powerups` | `PowerMeter`, `MeterSlot`, `DirectItem` | `advanceMeter`, `equipHighlighted`, `applyDirectItem` |
| `bosses` | `Boss`, `BossPart`, `BossPhase` | `createBoss`, `updateBoss`, `damagePart`, `bossDeathSequence` |
| `scoring` | `PlayerScore`, `HiScoreEntry` | `addScore`, `checkExtend`, `insertHiScore` |
| `scenes` | `Scene`, `SceneId`, `SceneStack` | scene-stack implementation |
| `ui` | `Widget`, `WidgetKind`, `HudModel` (+ `TextMetrics` re-exported from `presentation`) | `createMenu`, `menuTick`, `buildHudModel`, `layoutText` |
| `replay` | `Replay`, `ReplayHeader` | `createRecorder`, `recordTick`, `encodeReplay` / `decodeReplay`, `createPlayback` |
| `save` | `SaveData`, `SaveMigration` | `loadSave(storage)`, `writeSave`, `SAVE_MIGRATIONS` |
| `fx` | `FxState` | `requestHitStop`, `requestShake`, `tickFx` |

Still planned inside the partial modules: `player` — `killPlayer`, respawn by death-penalty
preset (M1-12; `playerHit` then starts the death sequence); `collision` — circle chains
(M2-02), destructible tiles (M2-07); `debug` — `createDebugControls(game)` (M1-19); `stage`
(implemented for P0) — time-keyed events, diagonal scrolling, branches (M2-07, M2-10);
`patterns` — `compilePattern` (M2-02); `enemies` — rank modifiers and revenge bullets (M2-01),
the Option Hunter (M2-04), boss parts on the damage path (M1-13); `behaviors` — the zone and
boss behaviours (M1-13, M1-18); `bullets` (implemented for P0) — bending lasers, cancel into
points, the pattern DSL's bullets (M2-02), graze (P2); `rank` — rank growth and the difficulty
preset tables (M2-01).

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
| `PixiRenderer` | `renderer` | `IRenderer` + `webGLVersion`, `viewport`, `scene` (384×216 root), `layers`, `atlas`, `metrics` (`TextMetrics` or `null`), `bindings`, `terrain` (`TerrainBinding \| null`), `parallax` (`ParallaxBinding \| null`), `lasers` (`LaserBinding \| null`, M1-09), `setSpriteNames(names)`, `bindWorld(world \| null)` (creates the parallax, terrain and batch bindings and, for `world.lasers`, a laser binding on `ENEMY_BULLETS` after the batches; throws `RangeError` for a batch on an unknown layer or a parallax band not on `BG_FAR` / `BG_MID`; `render()` calls it when `frame.world` changes identity) |
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
| `ShellOptions` | `boot` | `canvas`, `win`, `contentFiles`, `assets`, `input`, `audio`, `platform: (renderer) => Platform` (called after content validation — the apps apply the input profiles there), `gameConfig?`, `scene?` (`'flight'`), `audioUnlock?` (`'gesture'` \| `'immediate'`), `preferWebGLVersion?` (1), `contentOwners?` (merged over `DEFAULT_CONTENT_OWNERS`), `createImage?`, `overlay?` (`null` disables it) |
| `Shell` | `boot` | `game`, `platform`, `renderer`, `atlas`, `events` (dispatcher), `content`, `scene`, `flight` (the `FlightScene` or `null`), `showcase` (or `null`), `stop()` (idempotent; releases loop, listeners, input, renderer, atlas, audio) |
| `ShellAssets`, `ShellInput`, `ShellScene` | `boot` | `{ manifest, pageUrls }`; `PlatformInput` + `clear()` + `setContext(ctx)` (required; called once at boot and before a frame's ticks whenever `game.inputContext` changed) + `destroy()`; `'flight' \| 'showcase' \| 'calibration'` (the calibration scene renders the game frame without its world) |
| `ShellBootError` | `boot` | `Error` with `lines`, `issues`, `reason` |
| `sceneFromSearch(search)`, `SHELL_SCENES` | `boot` | `?scene=` → `ShellScene` (unknown or missing → `'flight'`); the scene list, default first |
| `BOOT_STATE_ATTRIBUTE` | `boot` | `'data-shmup-state'` — `loading` / `running` / `error` on the game canvas |
| `loadImages(urls, createImage, onProgress?)` | `loader` | → `Promise<images>` in `urls` order, parallel; rejects with `AssetLoadError { url }` on the first failure |
| `loadGameContent(files, { owners?, …LoadContentOptions })` | `loader` | → `LoadContentResult`: core issues (with `knownScripts` defaulting to the core's `KNOWN_SCRIPT_IDS` and `extraSprites` to its `ENGINE_SPRITES` — M1-09, so bullets and lasers can be drawn), then `checkEnemyBehaviors` issues (M1-08), then each foreign kind's owner issues (`owners`, then `DEFAULT_CONTENT_OWNERS`), or `no loader for content kind` per unowned file; throws only `TypeError` for a non-array |
| `DEFAULT_CONTENT_OWNERS` | `loader` | Frozen owners of today's foreign kinds: `input-profiles` → input-web `loadInputProfiles` (issues only). An app entry of the same kind replaces it |
| `ContentOwner`, `ContentOwners`, `LoadGameContentOptions`, `ImageFactory`, `LoadableImage` | `loader` | `(files) => ValidationIssue[]`; owners by kind; option and image types |
| `createEventDispatcher()` | `dispatch` | → `EventDispatcher { on(kind, handler) → unsubscribe, visit, drain(queue), handlerCount(kind), dispatched, unhandled }`; `on` throws `RangeError` for an unknown kind |
| `SimEventHandler` | `dispatch` | `(event: Readonly<SimEvent>) => void` — the record is reused |
| `createBootOverlay(gameCanvas)` | `error-screen` | → `BootOverlay { canvas, showProgress(fraction, label), showError(title, lines), remove() }` or `null` (no document / no 2D context) |
| `drawProgress(ctx, w, h, fraction, label)`, `drawErrorScreen(ctx, w, h, title, lines) → lines shown`, `formatIssues(issues)` | `error-screen` | Canvas 2D drawing (`Canvas2DLike`) and `path: message` lines |
| `BOOT_SCREEN_COLORS`, `Canvas2DLike` | `error-screen` | Background `#10173a`, text, title `#ff5aa0`, track; the 2D context subset used |
| `startFrameLoop(scheduler, onFrame)` | `frame-loop` | → `FrameLoop { stop() }`; `FrameScheduler` = the two rAF functions (moved here from both apps) |
| `createFlightScene(game, { starTileSize? })` | `flight` | → `FlightScene { spriteNames, world, frame, update(gameFrame) → frame }`: the default scene — the game World's batches on the World's camera with the World's parallax, terrain and laser views, preceded by two starfield batches in open space only (a stage brings its own bands), and the D20 HUD (`1P`, score, `FREE FLIGHT` or the stage name upper-cased, stock ships, `ARROWS MOVE`); *reused* frame, no per-frame allocation |
| `FLIGHT_SPRITES`, `FlightSceneOptions` | `flight` | The scene's own sprites (`bg/stars-far`, `bg/stars-mid`, `bg/stars-near`, `hud/life`), appended after the content's sprite names; options type |
| `createShowcase({ starTileSize? })` | `showcase` | → `Showcase { spriteNames, world, frame, update(gameFrame) → frame }` (*reused*, pure function of the tick) — `?scene=showcase` |
| `SHOWCASE_SPRITES`, `ShowcaseOptions` | `showcase` | The showcase's sprite name table (11 names) |

## Apps

These are not libraries, but their modules export testable functions.

### `apps/web`

| Export | Module | Summary |
|---|---|---|
| `bootWebApp(canvas, resources, win?)` | `boot` | → `Promise<WebApp>` (`game`, `renderer`, `audio`, `input`, `profiles` (`InputProfileRegistry`), `shell`, `stop()`); `resources` = `WebAppResources { contentFiles, assets }` from the virtual modules. Key profile: `?profile=` › saved choice (applied once storage answers) › `keyboard-default`; pads `gamepad-standard`; an unknown `?profile=` → `console.warn`. `?stage=<id>` → `gameConfig.stage`. Rejects with `ShellBootError` |
| `inputOverridesFromSearch(search)` | `boot` | → `InputOverrides { profile: string \| null, debounce: number \| null }` from `?profile=<id>` / `?debounce=<0…10>`; percent-decoded, last valid value wins |
| `stageFromSearch(search)` | `boot` | → the `?stage=<id>` value (percent-decoded, last non-empty wins; malformed escapes ignored) or `null` |
| `contentStageIds(files)` | `boot` | → ids of every `stage` file among the raw content files (before validation); `bootWebApp` checks `?stage=` against it — an unknown id → `console.warn`, free flight |
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
| `defineShmupProject(name, { environment?, include?, execArgv? })` | `vitest.shared.ts` | Per-project Vitest config (tests under `test/`, Node environment); `execArgv` goes to the worker pool (`['--expose-gc']` in core and shell) |
| `measureHeapGrowth(fn, iterations, warmup = min(iterations, 1000), attempts = 3, settled = 32 KiB)` | `packages/core/test/helpers/alloc.ts` | Allocation guard (plan §1.4) → `HeapGrowth { bytes, growth, collections, bytesPerIteration }`: heap growth plus the bytes in-loop GCs reclaimed (V8 `GCProfiler`), the steadiest (fewest bytes) of up to `attempts` measured windows — the first window of at most `settled` bytes ends the search — so one window in a lower V8 tier cannot fail a guard; throws without `--expose-gc`. Test-only, imported by relative path |
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
| `generate()` per module; `BULLET_COLORS`, `METER_LABELS`, `TERRAIN_TILES`, `TILE_SIZE` (8), `STAR_TILE_SIZE` (128) | `procedural/*.mjs` | The generators (`bullets`, `explosions`, `hud`, `items`, `lasers` — M1-09: `lasers/beam-{pink,red,purple}`, 8 frames of 4×8, frame `k` a band `k + 1` px tall; `BEAM_WIDTH`, `BEAM_HEIGHT`, `bandRows` — `particles`, `shields`, `starfield`, `terrain`, `ui`) and their data |

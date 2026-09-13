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
| `GameConfig` | interface | `internalWidth` 384, `internalHeight` 216, `tickRate` 60, `maxTicksPerFrame` 4, `seed`, `difficulty` (`'normal'` — the preset whose `DifficultyRules` row fills the preset fields below unless they are overridden, and the name of the saved hi-score table, M2-01), `rankBase` (2 — the rank's base, 0–31), `rankGrowth` (1 — multiplies the rank's growth terms, 0–4; 0 = constant rank), `extendFirst` (20,000) / `extendEvery` (70,000) — the extra-life thresholds, 0–99,999,990 (0 = none / only the first), `continues` (3 — continues per game, 0–9), `bulletSpeedMul` (1 — enemy bullet speed × this on top of the rank's, 0.25–4) (those six M2-01), `powerUpMode` (`'meter'` — D1; `'direct'` since M2-05: the Darius-style colour items, shot families and the Arm), `shipId` (M2-05: `DEFAULT_SHIP_ID` `'kestrel'` — the `content/player/` ship every player flies; `createWorld` falls back to the content's first ship for an unknown id), `deathPenalty` (`'classic'`; what a death costs — `core/powerups` `applyDeathPenalty`, M1-12; validated since M2-01), `startingLives` 3 (ships including the one in play, 1–5), `autofire`, `remoteMode`, `stage` (a `content/stages/` id, or `null` = open space; the apps' scene flow passes `@shmup/shell` `defaultStageId` — zone A — since M1-18), `stageSkip` (`'none'` — the debug stage skip: `'boss'` starts every World of the session `BOSS_SKIP_LEAD` px before its first `warning` / `boss` event via `core/debug` `skipToBoss`; sim-affecting, M1-18), `aimDirections` (32 — the directions aimed enemy shots snap to, D17 — 16 on Easy; a power of two 4–1024), `autofireInterval` (4) / `missileInterval` (10) — ticks between main shots / missile launches under autofire, 1–60, a weapon's own `refireTicks` overrides them (M1-10), `loadout` (`'default'` — the starting loadout, `core/weapons` `applyLoadoutPreset`; `'full'` is the web app's `?loadout=full`), `autoPowerUp` (false — D2), `autoPowerUpOrder` (`DEFAULT_AUTO_POWER_UP_ORDER`, ≤ 32 `MeterSlotName`s), `pickupMagnet` (true — D33) (M1-11), and since M2-03 the meter arsenal: `weaponPreset` (`'type-a'` — a `content/weapons/` preset id; a content without it falls back to its first preset), `weaponEdit` (`null` — or `WeaponEdit` `{ missile, double, laser }` weapon ids replacing the preset's), `megaChoice` (`'megaCrash'` — what `!` does), `shieldChoice` (`'forceField'` — what `?` grants), and since M2-04 `optionChoice` (`'trail'` — how the Options fly); the weapon select sets them, and the ship select (M2-05) sets `shipId` and `powerUpMode`; since M2-06 `coop` (`false` — a two-player co-op game: player 2 drops in with a join press, `core/world` `joinPlayer`; the title's `2 PLAYERS` sets it) and `coopExtra` (`DEFAULT_COOP_EXTRA` 0.5 — while two ships are in play every power-up drop adds this to a credit and each whole credit drops one more item; 0–4) |
| `DEFAULT_GAME_CONFIG` | const | Frozen defaults (remote-first: `autofire` and `remoteMode` true — remote mode forces autofire, so every build fires without a button — the `'meter'` power-up mode (D1, since M1-11), and Normal's `DEFAULT_DIFFICULTY_TABLE` row: rank base 2, growth 1, 3 lives, extends 20,000 / 70,000, 3 continues, the `'classic'` penalty, 32 aim directions, bullet speed × 1; Type A, Mega Crash on `!`, the Force Field on `?` and trailing Options; one player — `coop: false`, `coopExtra: 0.5` — M2-06) |
| `resolveGameConfig(overrides?, table = DEFAULT_DIFFICULTY_TABLE)` | function | → frozen, validated config: `DEFAULT_GAME_CONFIG`, then the preset fields of `overrides.difficulty` (default `'normal'`) from `table` (`difficultyOverrides`), then `overrides` — explicit overrides win, so `{ difficulty: 'arcade' }` also means 2 lives, 0 continues and the arcade penalty (M2-01); the resolved preset is always written into the result (an explicit `difficulty: undefined` → `'normal'`). `createGame` passes `content.difficulty` when the content has one. Throws `RangeError` for out-of-range integers (`rankBase` 0–31, `extendFirst` / `extendEvery` 0–`MAX_EXTEND_SCORE`, `continues` 0–`MAX_CONTINUES` among them), a `rankGrowth` / `bulletSpeedMul` that is not a finite number in range, a `difficulty` or `deathPenalty` that is not a preset (M2-01), an `aimDirections` that is not a power of two, a `stage` that is neither `null` nor a non-empty string (whether the id exists is checked by `createWorld`), a `stageSkip` other than `'none'` / `'boss'` (M1-18), a `loadout` other than `'default'` / `'full'`, a `powerUpMode` outside `POWER_UP_MODES` (`'direct'` accepted since M2-05), a `shipId` that is not a non-empty string (M2-05), an `autoPowerUpOrder` that is not an array of at most 32 slot names (the result holds a frozen copy), or (M2-03) a `weaponPreset` that is not a non-empty string, a `weaponEdit` that is neither `null` / `undefined` nor an object of three non-empty ids (the result holds a frozen copy with exactly `missile`, `double`, `laser`), a `megaChoice` / `shieldChoice` outside `MEGA_CHOICES` / `SHIELD_CHOICES`, or (M2-04) an `optionChoice` outside `OPTION_CHOICES`, or (M2-06) a `coop` that is not a boolean or a `coopExtra` that is not a finite number 0–`MAX_COOP_EXTRA`. Whether the preset and the edited weapons exist is checked by `createWorld` (`core/weapons` `resolveArsenal`) |
| `PowerUpMode`, `DeathPenaltyPreset`, `DifficultyPreset`, `StartingLoadout`, `StageSkip` | types | `'meter' \| 'direct'`; `'arcade' \| 'classic' \| 'casual'`; `'easy' \| 'normal' \| 'hard' \| 'arcade'`; `'default' \| 'full'` (M1-10); `'none' \| 'boss'` (M1-18) |
| `POWER_UP_MODES`, `DEFAULT_SHIP_ID` | const | M2-05: every `PowerUpMode` — `meter` (KESTREL, D1) first, then `direct` (frozen; the index of the scene flow's per-mode session hi-scores); `'kestrel'` — the ship a config flies unless it names another (D36) |
| `ShipChoice` | interface | M2-05: the ship select's choice — `{ shipId, powerUpMode }` (the ship's content id and its `mode`) |
| `withShip(config, ship)` | function | M2-05 → a frozen, validated config flying that ship with that power-up model, everything else (difficulty, the weapon select's meter loadout — unused by a Direct ship) kept; the same object when `shipMatches`; throws `RangeError` like `resolveGameConfig` |
| `shipMatches(config, ship)` | function | M2-05 → `true` when the config's `shipId` and `powerUpMode` are the choice's (`withShip` would change nothing) |
| `withCoop(config, coop)` | function | M2-06 → a frozen, validated config with `coop` set, everything else kept; the same object when it already has that value (the scene flow's `1 PLAYER` / `2 PLAYERS`) |
| `DEFAULT_COOP_EXTRA`, `MAX_COOP_EXTRA` | const | M2-06: `0.5` (half an extra item per power-up drop while two ships play — every second drop comes twice), `4` |
| `DIFFICULTY_PRESETS`, `DEATH_PENALTY_PRESETS` | const | Every `DifficultyPreset` easiest first (`easy, normal, hard, arcade` — the difficulty menu's order, the index of the scene flow's per-preset arrays); every `DeathPenaltyPreset` (`arcade, classic, casual`) — both frozen (M2-01) |
| `DifficultyRules`, `DifficultyExtends`, `DifficultyTable` | interfaces, type | One preset (M2-01, shmup_feat.md §15): `rankBase`, `rankGrowth`, `lives`, `extends` (`{ first, every }` — 0 = none / only the first), `continues`, `deathPenalty`, `aimDirections`, `bulletSpeedMul`; a row per `DifficultyPreset` (the `rules` content's `ContentDb.difficulty` has this type) |
| `DEFAULT_DIFFICULTY_TABLE` | const | The built-in table, equal to `content/rules/difficulty.rules.json` (`pnpm content:check` keeps them equal): easy `0 / 0.5 / 5 lives / 5 continues / casual / 16 / × 0.85`, normal `2 / 1 / 3 / 3 / classic / 32 / × 1`, hard `4 / 1 / 3 / 2 / classic / 32 / × 1`, arcade `6 / 1 / 2 / 0 / arcade / 32 / × 1` (rank base / growth / …); extends 20,000 then every 70,000 for all (D7). Used when the content has no `difficulty` section |
| `difficultyOverrides(difficulty, table?)` | function | → a fresh `Partial<GameConfig>` with the preset's fields: `difficulty`, `rankBase`, `rankGrowth`, `startingLives`, `extendFirst`, `extendEvery`, `continues`, `deathPenalty`, `aimDirections`, `bulletSpeedMul`; throws `RangeError` for an unknown preset |
| `withDifficulty(config, difficulty, table?)` | function | → a frozen, validated config on another preset: every preset field from the table's row, everything else kept (earlier overrides of preset fields replaced) — the difficulty menu under START (M2-01); throws `RangeError` like `resolveGameConfig` |
| `MAX_RANK_GROWTH`, `MAX_CONTINUES`, `MAX_EXTEND_SCORE`, `MIN_BULLET_SPEED_MUL`, `MAX_BULLET_SPEED_MUL` | const | `4`, `9` (the score's last digit counts continues), `99_999_990`, `0.25`, `4` — the bounds shared by `resolveGameConfig` and the `rules` schema |
| `MeterSlotName`, `METER_SLOT_NAMES` | type, const | The seven power-meter slots in meter order (M1-11): `'speed' \| 'missile' \| 'double' \| 'laser' \| 'option' \| 'shield' \| 'mega'` (`?` = `shield`, `!` = `mega`); the frozen list (index = `core/powerups` `MeterSlot` code) |
| `DEFAULT_AUTO_POWER_UP_ORDER`, `MAX_AUTO_POWER_UP_ORDER` | const | `speed, missile, laser, option ×4, shield`; `32` |
| `MegaChoice`, `MEGA_CHOICES` | type, const | M2-03 (shmup_feat.md §7A): `'megaCrash' \| 'normal' \| 'speedDown' \| 'lifeOption' \| 'fullBarrier'`; every one in menu order (frozen — the index is `core/powerups` `MegaEffect`'s code) |
| `ShieldChoice`, `SHIELD_CHOICES` | type, const | M2-03 / M2-04 (shmup_feat.md §9): `'forceField' \| 'shield' \| 'freeShield' \| 'rotateShield' \| 'reduce'` — the Force Field, the front Shield pods, the Free Shield, the Rotate Shield, Reduce; every one in menu order (frozen; `core/shields` `shieldSpecOf` / `SHIELD_CHOICE_SPECS` map them to specs) |
| `OptionChoice`, `OPTION_CHOICES` | type, const | M2-04 (shmup_feat.md §8): `'trail' \| 'snake' \| 'formation' \| 'rotate'`; every one in menu order (frozen — the index is `core/options` `OptionMode`'s code) |
| `WeaponEdit`, `WEAPON_EDIT_SLOTS` | interface, const | M2-03 Weapon Edit: `{ missile, double, laser }` — content weapon ids of those slots (any preset's); `['missile', 'double', 'laser']` (meter order) |
| `ArsenalChoice` | type | M2-03: the weapon select's loadout — `Partial<Pick<GameConfig, 'weaponPreset' \| 'weaponEdit' \| 'megaChoice' \| 'shieldChoice' \| 'optionChoice' \| 'autoPowerUp' \| 'autoPowerUpOrder'>>` (`optionChoice` since M2-04) |
| `withArsenal(config, arsenal)` | function | M2-03 → a frozen, validated config with the choice's fields set (a field left `undefined` keeps the config's; `weaponEdit: null` clears an edit), everything else — the difficulty's preset fields included — kept; throws `RangeError` like `resolveGameConfig` |
| `arsenalMatches(config, arsenal)` | function | M2-03 → `true` when every field the choice sets already equals the config's (the edit and the order by value) — `withArsenal` would change nothing (the scene flow then keeps the config object) |
| `HUD_BAR_HEIGHT`, `PLAYFIELD_Y`, `PLAYFIELD_W`, `PLAYFIELD_H` | const | Screen layout (decision D20): `8`, `8`, `384`, `200` — two 8-px HUD bars outside a 384×200 playfield; world `y` maps to screen `y − camera.y + PLAYFIELD_Y` |
| `UserOptions`, `AudioOptions`, `InputOptions`, `DisplayOptions` | interfaces, type | The player's **presentation-only** options (M1-17; not in `GameConfig`, replays or hashes; persisted by `save`): `audio { master, music, sfx }` (levels `0…VOLUME_LEVELS`), `input { profileId }` (a `content/input/` key / remote profile id, or `null` = the platform's default), `display { bulletPalette }` (M2-02: the enemy bullet colour set, one of `BULLET_PALETTES`; scale mode, shake and flash reduction arrive with M2-08 / M2-16) |
| `DEFAULT_USER_OPTIONS`, `VOLUME_LEVELS` | const | Frozen defaults: every volume `10` (the mix the audio content was made for), `profileId: null`, `bulletPalette: 'standard'`; `10` — the sliders' top level |
| `BULLET_PALETTES`, `BulletPalette` | const, type | M2-02 (shmup_feat.md §21): `standard`, `deuteranopia`, `protanopia`, `tritanopia` — the enemy bullet colour sets (frozen; index = the `UserOption` `BulletPalette` event's `param` and the Options screen's BULLETS order); the pipeline draws every bullet, beam and bending laser segment again as `<sprite>@<palette>` for the last three |
| `resolveUserOptions(value)` | function | → frozen, valid `UserOptions` from anything, falling back to the defaults field by field — never throws: finite volumes rounded and clamped to 0–10 (never `-0`), other values → default; `profileId` must match `INPUT_PROFILE_ID_PATTERN` and be ≤ 64 characters, else `null`; `display.bulletPalette` must be one of `BULLET_PALETTES`, else `standard` (M2-02 — a save written before it resolves to `standard`) |
| `volumeGain(level)` | function | → the linear bus gain `(level / 10)²` (clamped; NaN → 0): 10 → 1, 5 → 0.25, 0 → silent — for `IAudio.setBusVolume` |
| `InputProfileChoice`, `INPUT_PROFILE_ID_PATTERN` | interface, const | One entry of the Options screen's CONTROLS: `{ id, label }` (label upper case, e.g. `SAFE 4-WAY (DEFAULT)`); `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` |

The user options' guide: [saves-and-options.md](saves-and-options.md#user-options-coreconfig); the
difficulty presets': [difficulty-and-rank.md](difficulty-and-rank.md#the-difficulty-presets); the
meter arsenal's: [meter-arsenal.md](meter-arsenal.md#configuration-coreconfig); the Option type's: [options-shields-hunter.md](options-shields-hunter.md#configuration-coreconfig); the ship and Direct mode's: [direct-mode.md](direct-mode.md#configuration-coreconfig); co-op's: [coop.md](coop.md#configuration-coreconfig).

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
| `createGame(platform, overrides?, content?, options?)` | function | → `Game`; registers suspend/resume handlers on the platform. The config is `resolveGameConfig(overrides, content.difficulty ?? DEFAULT_DIFFICULTY_TABLE)` (M2-01: the preset's fields come from the content's `rules` table). `content` defaults to `EMPTY_CONTENT_DB`; `options` is `GameOptions` (M1-16). Throws `RangeError` for invalid overrides or an `overrides.stage` the content does not have |
| `GameOptions` | interface | `scenes?: 'boot' \| 'title' \| 'game' \| null` (M1-16) — run the `core/scenes` flow from that scene (`'boot'` waits for `game.scenes.finishBoot()` — the shell's default; `'title'`; `'game'` straight into a game — dev, tests); omitted / `null` = **bare gameplay** (one World from creation, `stepWorld` every tick, nothing reacts to its status — the tests, tools and the shell's dev scenes). `save?: SaveStore \| null` (M1-17 — the flow's save: the Options screen's options, the title's HI, finished games recorded; omitted = a memory-only store with the defaults), `inputProfiles?: InputProfileSetup \| null` (M1-17 — what CONTROLS offers and the profile in use; omitted = CONTROLS disabled); both ignored for bare gameplay. Not recorded in replays |
| `Game` | interface | `config` (the host's resolved config; with the flow a game's World may run another preset — the difficulty menu, M2-01 — read `game.world.config`), `content`, `platform`, `events` (one `EventQueue` for the whole session — every World pushes into it via `WorldOptions.events`, and so do the scene flow's menu sounds and music; the host drains it once per frame), `world` (getter: bare gameplay — the session's `World`; with the flow — the game scene's World, **a new object per game start and RETRY STAGE**, a placeholder before the first; only `step()` advances it), `scenes` (the `SceneFlow` or `null`), `state`, `debug` (M1-19: the session's `DebugFlags`, shared with every World it creates — `world.debugFlags` is this object), `inputContext` (getter: `'game'` for bare gameplay, else the top scene's context), `inputSeats` (M2-06 getter: the player seats the host's input adapter should route — `2` while a co-op game or its continue countdown is on top, for bare gameplay when the session config is a co-op one, else `1`; the shell forwards a change to `input.setSeats`), `step()` (one `platform.input.poll()`, then `stepWorld` — or `scenes.tick(input)`; ignores the debug timing), `frame(nowMs) → ticks` (M1-19: with `debug.frameAdvance` only the ticks queued by `requestStep` run — all in the next frame; with `debug.slowMo` 2 / 4 the loop is fed a clock slowed that much; switching modes resets the accumulator), `requestStep(count = 1)` (M1-19: queues ticks for frame advance; ignored while it is off, dropped when it goes off), `renderFrame()` (*reused* `RenderFrame`; bare gameplay: `world` = `game.world.view`, empty `hud` / `ui` draw lists; with the flow: `flow.updateFrame()` then `world` = the World's view while the game scene is visible (else `null`), `tick` = the World's tick then (frozen under overlays, 0 for a new World) else the flow's tick count, `hud` = the game scene's HUD list, `ui` = every visible scene's widgets, `screen.dim` = the top scene's dim), `pause()` / `resume()` (a host-level freeze — the pause *menu* is a scene). A platform resume also calls `scenes.onResume()` (pause menu over a running game) |
| `GameState` | interface | `tick`, `paused`, `suspended`, `input` (last snapshot) |

### `presentation` — back-end contracts and the render contract

The per-frame contract between the simulation and a renderer (plan §3.4). Guide:
[rendering-and-shell.md](rendering-and-shell.md).

| Export | Kind | Summary |
|---|---|---|
| `IRenderer` | interface | `width`, `height`, `resize(cssW, cssH)`, `render(frame)`, `destroy()` |
| `RenderFrame` | interface | `tick`, `alpha`, `world: WorldView \| null`, `hud: DrawList`, `ui: DrawList`, `screen: ScreenView` — *reused* by the game |
| `WorldView` | interface | `camera: CameraView { x, y }`, `parallax: ParallaxView \| null`, `terrain: TerrainView \| null`, `batches: SpriteBatchView[]`, `lasers?: LaserView \| null` (M1-09), `bendingLasers?: BendingLaserView \| null` (M2-02), `warning?: WarningView \| null` (M1-13 — drawn by the host, not the renderer) — `batches` and the structure of the others are read once when a renderer binds the view |
| `LaserView` | interface | The enemy lasers (M1-09), drawn on `EnemyBullets`: `capacity`, `count`, per slot `x`, `y` (world origin), `angle` (binary units), `length`, `width` (**drawn** width; 0 = the 1-px telegraph line), `spriteId` (the beam strip), `flags` (`SpriteFlag`; `Hidden` = the warning line's blink) — live sim arrays (`core/bullets` `BulletSystem.laserView`) |
| `BendingLaserView` | interface | The enemy bending lasers (M2-02), drawn on `EnemyBullets` after the lasers: `capacity` (slots — **stable**, not packed), `nodes` (ring size per slot, a power of two), per slot `active`, `filled` (nodes to draw, the newest), `head` (ring index of the newest node), `width`, `spriteId` (the segment sprite, frame 0), `flags` (`SpriteFlag`), and per node `x`, `y` (slot-major, `capacity × nodes`); node `k` back from the head is `(head − k) & (nodes − 1)` — live sim arrays (`core/bullets` `BendingLaserTable`) |
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
| `Rng` | interface | `callCount`, `nextU32()`, `nextFloat()` (`u32 / 2^32`), `nextFloatInto(out, index)` (M2-02: the same draw written into a `Float64Array` element — per-tick callers such as the pattern DSL's `$rand` avoid the boxed fractional return), `rangeInt(min, max)` (inclusive, always exactly one draw), `getState()`, `getStateInto(out)`, `setState(state)` |
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
| `SimEventKind` | const + type | `Sfx 0, Music 1, Particles 2, Shake 3` (`param` = magnitude px, `id` = duration ticks — `core/fx` `requestShake`, M1-12), `Flash 4` (`id` = `core/fx` `FlashKind`, `param` = duration — `requestFlash`; Mega Crash: kind 0, 12 ticks), `HitStop 5` (`param` = frozen ticks — `requestHitStop`; informational, the World already froze), `Rumble 6` (`id` = player, `param` = magnitude; the death pushes 1), `FormationBonus 7` (M1-08: `id` = formation slot, `x` / `y` = last kill, `param` = bonus points), `PowerUp 8` (M1-11: a meter slot equipped — `id` = the `MeterSlot`, `x` / `y` = the ship, `param` = the player), `MusicDuck 9` (M1-12: the player's death — `id` = player, `param` = ticks until full volume, `DEATH_MUSIC_DUCK_TICKS` 120), `Dim 10` (M1-13: darken the playfield — `id` = level in percent, `param` = ticks; the boss WARNING: 50 / 180), `BossDefeated 11` (M1-13: a boss's score tally — `id` = its `ContentDb.enemies` index, `x` / `y` = where it exploded, `param` = points awarded), `Score 12` (M1-14: points scored at a place, for the score popups — `id` = the player credited, `x` / `y` = the kill or the boss part (whole pixels), `param` = the points; pushed by `core/scoring` for credited kills and by `core/bosses` for destroyed parts; presentation only, not hashed), `UserOption 13` (M1-17: the Options screen changed an option, pushed live on every change — `id` = `UserOptionKind`, `param` = a volume level 0–10, the chosen profile's index in the flow's profile choices or (M2-02) the bullet palette's index in `BULLET_PALETTES`; the shell's `connectOptionEvents` applies it) |
| `UserOptionKind` | const + type | What a `UserOption` event changed: `MasterVolume 0`, `MusicVolume 1`, `SfxVolume 2` (the `sfx` and `ui` buses), `InputProfile 3`, `BulletPalette 4` (M2-02) — append, never renumber |
| `SIM_EVENT_KIND_NAMES` | const | Names indexed by code (`'sfx'`, `'music'`, …, `'userOption'`) |
| `SFX_CUES`, `SfxCue`, `SFX_CUE_NAMES` | const/type | 26 cues, `PlayerShot 0` … `WarningSiren 20` (shmup_feat.md §19), `Clink 21` (M1-10: a player shot bouncing off armour — boss parts too since M1-13), `PowerUpDenied 22` (M1-11: a PowerUp press on an empty or greyed slot), `OptionHunter 23` (M2-04: an Option Hunter appeared — the alarm, at its spawn point), `OptionStolen 24` (M2-04: a hunter grabbed Options — at the first one taken), `PlayerJoin 25` (M2-06: a player joined a co-op game or continued mid-game — `core/world` `joinPlayer`, at the ship, `SfxPriority.High`). M1-11 pushes `MeterAdvance` (pickup), `PowerUpEquip`, `ShieldHit`, `ShieldBreak`, `MegaCrash`; M1-12 `PlayerDeath` (8, at the ship); M1-13 `WarningSiren` (with `SfxPriority.Critical`) and `BossExplode` (the chain and the blast); `CapsulePickup` waits for Direct mode |
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
| `ContentDb` | interface | `sprites` (content sprite names + `extraSprites`), `scripts` (`StringTable`), `ships`, `weapons`, `weaponPresets`, `weaponFamilies` (M2-05: the Direct-mode shot families, file order), `enemies`, `paths`, `stages`, `tilesets`, each with an id → position `…Index` map (`shipIndex`, `weaponIndex`, `weaponPresetIndex`, `weaponFamilyIndex`, `enemyIndex`, `pathIndex`, `stageIndex`, `tilesetIndex`), `difficulty` (M2-01: the frozen `DifficultyTable` of a `rules` file's `difficulty` section, `null` when no file has one — sessions then use `core/config` `DEFAULT_DIFFICULTY_TABLE`), `scoring` (M2-02: the frozen `ScoringRules` of a `rules` file's `scoring` section, `null` when none — the bullet system then uses `core/scoring` `DEFAULT_SCORING_RULES`) and `patterns` (M2-02: the `PatternBank` compiled from every `patterns` file — `EMPTY_PATTERN_BANK` without any) |
| `StringTable` | interface | `{ names, index }` — interned names in ascending order; `names[i]` is index `i` |
| `EMPTY_CONTENT_DB` | const | Frozen, shared empty database (the default for `createGame`) |
| `CONTENT_KINDS`, `ContentKind`, `isContentKind(kind)` | const/type/function | `player`, `weapons`, `enemies`, `paths`, `stage`, `tileset`, `rules` (M2-01), `patterns` (M2-02); other kinds come back in `foreign` |
| `ContentFileHeader` | interface | `{ formatVersion, kind }` — first two fields of every file |
| `CONTENT_FORMAT_VERSION` | const | `1`; a newer version is rejected with an issue |
| `CONTENT_MIGRATIONS`, `ContentMigration`, `ContentMigrationTable` | const/types | Per-kind `fromVersion → (data) => newData` table; ships `0 → 1` for `weapons`, `enemies`, `stage` (none for `player`) |
| `PlayerShipSpec`, `BoxSpec`, `MarginSpec` | types | A ship of a `player` file: `speeds` (D3), `hurtRadius`, `terrainBox`, `pickupBox`, `margins`, timers, `spriteId`, since M2-06 `spriteP2Id` (player 2's palette swap `<sprite>@p2`, interned by the loader for every ship; -1 without it — player 2 then uses `spriteId`); since M2-05 `mode` (`PowerUpMode`, default `'meter'` — the ship select sets `GameConfig.powerUpMode` from it) and `startSpeedLevel` (default 0, must index `speeds` — else an issue and the ship is left out; used in Direct mode only) |
| `WeaponSpec`, `WeaponSlot`, `WEAPON_SLOTS`, `WeaponPresetSpec` | types/const | A weapon (`slot`, `behaviorId`, `damage`, `speed`, `cap`, `pierce`, `spriteId`, optional `name` — the weapon select's label, upper case `A–Z 0–9 space . -`, ≤ 16, M2-03 —, `refireTicks`, `sfxId`, `params`) and a meter-mode loadout (`mainId`/`missileId`/`doubleId`/`laserId`, `-1` = none) |
| `WeaponFamilySpec`, `WeaponLevelSpec`, `WeaponEmitterSpec`, `WeaponFamilySlot` | types | M2-05 (shmup_feat.md §7B): a `weapons` file's `families` entry — `id`, `name?` (≤ 16, `A–Z 0–9 space . > -`), `label` (the HUD's, ≤ 5), `slot` (`'main' \| 'sub'`), `levels` (1–9); a level — `shots` (1–8 emitters), `refireTicks?` (1–600; default the config's autofire / missile interval), `volleys?` (1–16: a weapon's `n` shots fire while `live + n ≤ volleys × n`; default the weapon's `cap`); an emitter — `weapon` / `weaponId`, `angle?` (binary units, −1024…1024, 0 forward), `ox?` / `oy?` (−64…64 px on top of the weapon's). The loader's fifth pass reports a weapon of another slot in a family |
| `MAX_FAMILY_LEVELS`, `MAX_LEVEL_SHOTS` | const | `9` (levels 0 … 8), `8` |
| `P2_SPRITE_SUFFIX` | const | M2-06: `'@p2'` — the suffix of player 2's palette-swap sprite of a ship (the asset pipeline's `coop.mjs` derives it; `pnpm content:check` requires it for every ship) |
| `DIRECT_ITEMS`, `DirectItemName`, `MAX_DIRECT_ITEM_PLAN` | const, type, const | M2-05: `red, green, blue, orange, yellow, octagon` (frozen — the index is the item's colour code everywhere: `core/powerups` `DIRECT_ITEM_KINDS`, `collectDirect`, `DIRECT_POWER_UP_EVENT_BASE`); one of them; `256` — the longest `directItems` plan |
| `EnemySpec` | type | An enemy (M1-08; every optional field filled with its default at load): `id`, `hp`, `score`, `hurtbox`, `script` / `scriptId`, `sprite` / `spriteId`, `anim` (default 1 frame), `params` (behaviour tunables, default `{}`), `mover` (`EnemyMoverSpec \| null`), `drop` (`'capsule' \| 'blueCapsule' \| 'powerup' \| null` — `blueCapsule` since M2-04, `powerup` since M2-05), `ground` (`'floor' \| 'ceiling' \| null`), `settleTicks` (default `DEFAULT_SETTLE_TICKS` 30), `explosion` (default `'small'`), `megaCrashImmune` (default `false`), `optionHunter` (M2-04: an Option Hunter — `core/enemies` owns its rules; default `false`, a boss entry `false`), `child` / `childId` (spawners; `null` / `-1`), `pattern` / `patternId` (M2-02: the `content/patterns/` action the `pattern.loop` behaviour runs — ref kind `pattern`, resolved to a `ContentDb.patterns` action index; `null` / `-1`), `rank?` (`EnemyRankSpec`), `revenge?` (`EnemyRevengeSpec`, M2-01), `boss` (M1-13: the `BossSpec`, `null` for a regular enemy). `hp`, `score`, `hurtbox`, `script`, `sprite`, `drop` are required for a regular enemy (checked by the loader since M1-13); a boss entry has only `id` + `boss` and the loader fills the rest (`hp` = the cores' total, `score` = `boss.score`, `script` / `sprite` `''` with ids -1, a 1-px hurtbox, `megaCrashImmune`) |
| `EnemyRankSpec` | type | Per-enemy rank modifiers (M2-01 gave them meaning): `fireRate?`, `bulletSpeed?` (0–8, default 1) — how strongly the enemy follows the rank's curves: `1 + k · (curve − 1)` (`core/rank` `rankSensitivity`); 1 = the session's, 0 = unaffected by rank |
| `EnemyRevengeSpec`, `RevengePattern`, `REVENGE_PATTERNS`, `DEFAULT_REVENGE_SPEED` | type, type, const, const | Revenge bullets (M2-01): `{ minRank (0–31), pattern, speed? (0.25–4 px/tick on Normal) }` — fired from where the enemy died when a player shoots it down on screen at a rank ≥ `minRank`, never on a Mega Crash; `'aimed' \| 'spread3' \| 'ring8'`; that list (code = index + 1); `1.25`. Bosses take neither field |
| `EnemyAnimSpec`, `EnemyGround`, `EnemyExplosion`, `EnemyDrop` | types | `{ frames, ticks }`; `'floor' \| 'ceiling'`; `'small' \| 'medium' \| 'large'`; `'capsule' \| 'blueCapsule' \| 'powerup'` (M2-04 / M2-05 — also a formation event's `drop`; `powerup` is the mode-agnostic power-up: a capsule in meter mode, the stage's next planned item in Direct mode, where a `capsule` resolves the same way) |
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
| `StageSpec` | type | A stage (M1-07): `id`, `name`, `music: StageMusic` (`stage` / `boss` cues + `stageId` / `bossId`), `length`, `camera`, `checkpoints`, `parallax`, `tilemap` (`StageTilemapSpec \| null`), `events`, `directItems` (M2-05: the Direct-mode item plan — `DirectItemName`s in the order the stage's `powerup` / `capsule` drops hand them out in Direct mode, cycling; `[]` when the file omits it = `core/powerups` `DEFAULT_DIRECT_ITEM_PLAN`; meter mode ignores it), and two fields the loader adds: `flagNames` (sorted; index = flag bit) and `terrain` (`StageTerrain \| null`) |
| `StageCameraKey` | type | `x`, `speed` (px/tick, 0 = stop), optional `ramp` (ticks, linear), `yTo` + `yTicks` (eased vertical pan), `lock` (boolean — stop exactly at `x` until `runner.unlock()`) |
| `StageCheckpoint`, `StageParallaxLayer`, `StageParallaxLayerName` | types | `{ x }`; a band `{ layer: 'far' \| 'mid', sprite, spriteId, factor, y, spacing }`; `'far' \| 'mid'` |
| `StageTilemapSpec`, `HeightfieldSpec`, `HeightfieldSegment`, `HeightfieldProfile` | types | `{ tileSize: 8, tileset, tilesetId, rowsTall, rle?, generator? }`; `{ type: 'heightfield', segments }`; `{ from, to, floor?, ceiling? }`; `{ base, amp, period, seed }` |
| `StageTerrain` | type | The expanded grid (never in the JSON): `tileSize`, `cols` = `ceil((length + 384) / 8)`, `rows`, `tiles` (`Uint8Array`, shared content — copy before mutating), `tilesetId` |
| `StageEvent` = `StageSpawnEvent` \| `StageFormationEvent` \| `StageBossEvent` \| `StageMusicEvent` \| `StageSpeedEvent` \| `StageFlagEvent` \| `StageEndEvent` | types | Timeline entries by `type`: `spawn` (`enemyId`, `y?` (default mid-playfield), `screenX?` (default 400), `path?` / `pathId`), `formation` (the same + `count`, `interval`, `drop?` (default `'capsule'`, `'blueCapsule'`, `'powerup'` — M2-05 —, `null` = none), `bonus?` (default 0)), `warning` / `boss` (`enemyId` — a boss; `warning` plays the WARNING first, M1-13), `music` (`cueId`), `speed` (`speed`, `ramp?`), `flag` (`flag`, `flagId`, `value?` default `true`), `end` |
| `STAGE_EVENT_TYPES`, `MAX_STAGE_FLAGS` | const | The eight types in schema order (index = `StageEventCode`); `32` |
| `TilesetSpec`, `TileSpec` | types | A `tileset` file: `id`, `sprite`, `spriteId`, `tileSize` (8), `tiles` (≤ 255; tile id = index + 1), `tables`; a tile: `name`, `type`, `frame`, `anchor`, `mask` (8 column heights) |
| `TilesetTables` | type | Per tile id (0 = empty cell): `count`, `type`, `anchor`, `mask` (`[id * tileSize + column]`), `frame` (`-1` = not drawn), `byName` |
| `TileType`, `TILE_TYPES`, `TileAnchor`, `TILE_ANCHORS`, `TILE_SIZE` | types/const | `'empty' \| 'solid' \| 'hazard'` (index = `TerrainType` code); `'floor' \| 'ceiling'` (index = `TerrainAnchor` code); `8` |
| `ValidationIssue` | interface | `{ path, message }`, e.g. `enemies/x.enemies.json:enemies[3].hurtbox.hw` / `must be an integer in 1..512` |
| `s` | const | The combinators: `int`, `num`, `str`, `bool`, `enumOf`, `array`, `object`, `record`, `nullable`, `ref`, `oneOf` |
| `Schema<T>`, `Infer<S>`, `ObjectShape`, `ObjectValue<S, O>` | types | `parse(value, path, issues, refs?) → T \| undefined` (+ `typeName`, `refKind`); `Infer` extracts `T` |
| `RefSite`, `ContentRefKind` | types | A recorded `s.ref` site (`path`, `kind`, `id`, `container`, `field`); kinds `ship`, `weapon`, `enemy`, `stage`, `tileset`, `path`, `sprite`, `script`, `sfx`, `music`, `pattern` (M2-02 — a `patterns` action id) |

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

A `rules` file (M2-01, `content/rules/*.rules.json`) holds game-wide tables; its optional
`difficulty` section (all four presets, the ranges of `core/config`, `aimDirections` a power of
two) becomes the frozen `ContentDb.difficulty`; a second file defining it is an issue and is
ignored. Guide: [difficulty-and-rank.md](difficulty-and-rank.md#the-rules-kind-coredata). Its
optional `scoring` section (M2-02: `bulletCancel`, 0–`MAX_BULLET_CANCEL_POINTS`) becomes
`ContentDb.scoring`, again from one file only.

A `weapons` file's optional `families` (M2-05) are collected into `ContentDb.weaponFamilies`
(a duplicate id is an issue); a **fifth load pass** (`checkWeaponFamilies`, after the references
are resolved) reports every family emitter whose weapon belongs in another slot. A ship's
`startSpeedLevel` past its `speeds` is an issue and leaves the ship out; a ship without `mode` /
`startSpeedLevel` gets `'meter'` / 0 and a stage without `directItems` gets `[]`, so every spec
has the same fields. Guide: [direct-mode.md](direct-mode.md#content-coredata). Since M2-06 the
loader also interns `<sprite>@p2` for every ship and resolves it into `spriteP2Id` (player 2's
palette swap — [coop.md](coop.md#player-2s-palette-swap)).

A `patterns` file (M2-02, `content/patterns/*.patterns.json`, schema `PATTERNS_FILE_SCHEMA`) is
collected while loading; once every file is in, and **before** the references are resolved, all of
them are compiled together into `ContentDb.patterns` (`compilePatternBank` — its issues join the
load's), so an enemy's `pattern` resolves against the compiled action ids. Guide:
[pattern-dsl.md](pattern-dsl.md).

The systems use these `data` types directly (`stage` since M1-07, `enemies` since M1-08,
`weapons` since M1-10 — its placeholder `WeaponSpec` is gone). Weapon `params` are checked
against their behaviour by `core/weapons` `checkWeaponBehaviors`
([weapons-and-options.md](weapons-and-options.md#content-the-type-a-arsenal)).

### `world` — the gameplay session and the tick pipeline

One gameplay session and the fixed 9-phase tick of plan §3.2. Guide:
[sim-world.md](sim-world.md); two-player co-op (M2-06): [coop.md](coop.md).

| Export | Kind | Summary |
|---|---|---|
| `createWorld(config, content, options?)` | function | → `World` at tick 0: RNG streams from `config.seed`, the ship from `resolvePlayerShip(content, config.shipId)` (M2-05), the stage `config.stage` (runner at its start, collision map, parallax / terrain views, the stage theme queued as a `Music` event) or a static camera, the enemy system (M1-08), the rank inputs of `config.rankBase` / `rankGrowth` (`createRankInputs`) with the rank computed from them and the bullet system (M1-09; M2-01), the weapon system with `config.loadout` applied to both players (M1-10; since M2-03 firing the config's arsenal — `weaponPreset` / `weaponEdit` — and a `'full'` loadout granting the `?` choice's shield), the power-up system (M1-11; the `!` / `?` choices of the config since M2-03; the stage's Direct-mode item plan since M2-05), in Direct mode (M2-05) `core/weapons` `applyDirectLoadout` instead of the meter loadout (the levels, the Arm of a `'full'` loadout, the ship's `startSpeedLevel`), the effect timers (`fx`) and the scoring system (M1-12), the boss system (M1-13), player 1 starting its fly-in with `config.startingLives`, player 2 inactive, the rank updated once more for the starting loadout (`updateWorldRank`), view already filled; throws `RangeError` for an unknown stage id or (M2-03) a `weaponEdit` naming a weapon the content lacks or one of another slot |
| `WorldOptions` | interface | `behaviors?` — an `EnemyBehaviorLookup` replacing `DEFAULT_BEHAVIORS`; `bossBehaviors?` — a `BossBehaviorLookup` replacing `DEFAULT_BOSS_BEHAVIORS` (M1-13) (tests, tools; not in `GameConfig`, so never in a real session); `events?` — the `EventQueue` to push into instead of a new one (M1-16: `createGame` hands every World of a session its one queue); `debugFlags?` — the `DebugFlags` to share instead of a new all-off set (M1-19: `createGame` hands every World `game.debug`) |
| `resolveWorldStage(config, content)` | function | → the `StageSpec` `config.stage` names, `null` for free flight; throws `RangeError` for an unknown id |
| `stepWorld(world, input)` | function | Runs `WORLD_PHASES` in order (phases 2–8 skipped while `hitStop > 0` at the start of the tick — recorded in `world.fx.frozen`, so a hit-stop of `n` requested during tick `t` freezes exactly `t + 1 … t + n`), then `world.tick++`; never allocates |
| `World` | interface | `config`, `content`, `ship`, `tick`, `rng`, `events`, `players` (2), `intents` (2), `camera`, `status`, `hitStop`, `fx` (`core/fx` `FxState`: shake / flash timers, M1-12), `debugFlags` (the game's shared switches — `WorldOptions.debugFlags`; only `godMode` changes a tick), `pools`, `grid`, `playerBatch`, `stage` (`StageRunner \| null`), `terrain` (`TerrainMap \| null`, a private copy of the tiles), `parallax` (`StageParallaxView \| null`), `enemies` (`EnemySystem`, M1-08), `bullets` (`BulletSystem`, M1-09), `weapons` (`WeaponSystem`: shots, loadouts, Options — M1-10), `powerups` (`PowerUpSystem`: meters, capsules, Mega Crash, shield feedback — M1-11), `scoring` (`ScoringSystem`: `board.scores[p]`, the session hi-score — M1-12), `bosses` (`BossSystem`: the boss, its WARNING and death sequence — M1-13), `patterns` (`PatternVm`: the DSL interpreter — enemies' emitters and the bullets' own programs, installed as the bullet system's program runner — M2-02), `laserSources` (every laser source by id: the 64 enemies, then the 16 boss parts — M1-13), `rank` (the session's rank, 0–31, recomputed at the end of phase 3 — `updateWorldRank`; hashed), `rankInputs` (M2-01: the mutable `RankInputs` — the config's base and growth, `loop` / `stage` 1 until the campaign of M2-10, the `power` of the most powerful active ship, `special` 0; hashed), `continuesUsed` (M2-01: continue events this game — one per `continueWorld`, one per co-op mid-game continue since M2-06; hashed), `view` (batches: ground enemies, air enemies, player shots, Options, players, enemy bullets, shields, items, cancel point items (M2-02), boss parts (M1-13); `lasers`: the enemy laser view; `bendingLasers`: the bending laser table (M2-02); `warning`: the boss WARNING) |
| `WorldCamera` | interface | `x`, `y` (playfield top-left in world pixels), `dx`, `dy` (last stage-phase step), `vx`, `vy` (scroll velocity px/tick; the stage runner writes it every tick, in free flight 0 = static unless a test sets it). A class instance (`createStageCamera()`), not a literal — see the V8 note in [stage-runtime.md](stage-runtime.md#gotchas) |
| `WorldStatus`, `WORLD_STATUSES` | type, const | `'playing' \| 'bossWarning' \| 'stageClear' \| 'gameOver'`; the list (index = hash code). `stageClear` at a stage's `end` event (M1-07); `gameOver` once every active ship is out (`playerOut`) — set in phase 2 from `playing` / `bossWarning` only (M1-12); `bossWarning` for the 180 ticks of a boss WARNING (from `playing` only, back to `playing` when the boss enters) and `stageClear` at the end of a boss's death sequence (M1-13) |
| `WorldPhase`, `WORLD_PHASE_NAMES` | const + type, const | `Input 0, Players 1, Stage 2, Scripts 3, Movement 4, Collision 5, Damage 6, Removal 7, Fx 8`; `'input'` … `'fx'` |
| `WORLD_PHASES` | const | Frozen `WorldPhaseEntry[]` in tick order; only `input` and `fx` have `runsDuringHitStop` |
| `WorldPhaseEntry`, `WorldSystem` | interface, type | `{ phase, name, runsDuringHitStop, run }`; `(world, input) => void` |
| `PoolRegistry`, `RegisteredPool` | interfaces | `entries`, `register(name, pool) → pool` (throws `Error` for a duplicate name), `flushAll()` (phase 8), `clearAll()`; `{ name, pool, arrays }` with the field arrays in sorted name order (the hash order) |
| `syncWorldView(world)` | function | Scrolls the parallax bands with the camera, refills the enemies' ground / air batches (`enemies.sync()`), the player-shot and Option batches (`weapons.sync()`, M1-10), the item and shield batches (`powerups.sync()`, M1-11), the boss parts' batch (`bosses.sync()`, M1-13), the Options Option Hunters carry (`enemies.carriedBatch`, filled by `enemies.sync()`, M2-04 — the view's last batch) and the players' mirror batch (active, not `dying` / `dead`, sprite present; blinks while invulnerable; player 2 with `spriteP2Id` — M2-06 — when the content has it); phase 9 and `createWorld` call it |
| `updateWorldRank(world)` | function | M2-01: the power term of the most powerful active ship (`core/rank` `powerRank`: Missile, Double / Laser, Options, an active shield — Reduce counts as `reduce` +2 instead of `shield` +4, M2-04 — dying, dead and respawning ships count with what the penalty left them; in Direct mode — M2-05 — `directPowerRank(shot, sub, Arm tier)`) into `world.rankInputs.power`, then `computeRank`; a **changed** rank goes to `world.rank` and `bullets.setRank` → the rank. The World calls it at the end of phase 3 (and `createWorld` / `continueWorld`); call it after changing `rankInputs` outside a tick. Never allocates |
| `canContinue(world)` | function | M2-01: `status === 'gameOver'` and (per player since M2-06) at least one active player with `continuesLeft > 0` — in a one-player game `continuesUsed < config.continues` as before |
| `continueWorld(world, who = every player)` | function | M2-01 (shmup_feat.md §10) → `true` when it continued (`false`, nothing changed, when the game is not over or no player of `who` — M2-06: a bit mask, bit 0 = player 1 — has continues left): `continuesUsed++`; every active ship of `who` with continues left gets `config.startingLives`, loses its power (`applyDeathPenalty('arcade')`; in Direct mode `applyDirectDeathPenalty('arcade')` — M2-05) then gets the starting loadout (Direct mode: `applyDirectLoadout`), and its score's last digit counts the continue (`core/scoring` `markContinue`); the stage restarts at its last checkpoint and re-queues its theme (`Music`) — free flight: `clearSession`; the continued ships fly in, hit-stop 0, status `playing`, rank updated; a co-op player who did not continue stays out and may drop in later (`joinPlayer`). Deterministic; a cold path — the scene flow's continue countdown calls it between ticks (a co-op game passes the players whose OK was pressed) |
| `continuesLeft(world, slot)` | function | M2-06 → `config.continues` minus the player's own `PlayerScore.continues` (the score's last digit), never below 0; 0 for a bad slot |
| `JOIN_ACTIONS` | const | M2-06: `Action.Confirm \| Action.Pause` — the presses that bring a player into a co-op game (an unseated pad's first OK is forwarded as `Confirm`; START is Pause); read in phase 1 |
| `playerCanJoin(world, slot)` | function | M2-06 → `true` when a join press would `joinPlayer`: `config.coop`, status `playing` / `bossWarning`, a valid slot that is inactive (never joined) or out (`playerOut`) with `continuesLeft > 0`. Never allocates |
| `joinPlayer(world, slot)` | function | M2-06 (shmup_feat.md §16 drop-in) → `true` when the player joined or continued: an inactive slot becomes active with `config.startingLives` and its starting loadout (score 0); an out player continues mid-game (lives, power reset + starting loadout, `markContinue`, `continuesUsed++`, **no stage restart**); the ship flies in blinking (`respawnPlayer`) and `SFX PlayerJoin` is pushed. Nothing unless `playerCanJoin`. Phase 1 calls it on a `JOIN_ACTIONS` press (also during hit-stop); a deterministic cold path |
| `GRID_MARGIN` | const | `64` — px around the camera view covered by `world.grid` |
| `DEATH_HIT_STOP_TICKS`, `DEATH_SHAKE_TICKS`, `DEATH_MUSIC_DUCK_TICKS` | const | The death sequence (M1-12): `8` frozen ticks; `20` ticks of `ShakeMagnitude.Medium`; `120` (the `MusicDuck` param). Guide: [death-and-scoring.md](death-and-scoring.md) |
| `ENGINE_SPRITES` | const | Sprite names the engine draws whatever the content — `core/bullets` `BULLET_SPRITES` (the nine bullet kinds, the laser beam, and since M2-02 the bending laser segment `lasers/bend-pink` and the point item `items/point`), then `core/weapons` `WEAPON_SPRITES` (the Spread Bomb's blast `shots/blast`, M2-03), `core/options` `OPTION_SPRITE` (`options/orb`, M1-10), `core/powerups` `ITEM_SPRITES` (`items/capsule`; M2-04: `items/capsule-blue`, `options/stolen` — also the Option Hunter's carried Options; M2-05: the six `items/direct-*` colour items) and `core/shields` `SHIELD_SPRITES` (`shields/force-field`, M1-11; M2-04: `shields/pod`, `shields/reduce`; M2-05: `shields/arm`), then `core/ui` `UI_SPRITES` (`hud/life`, `hud/meter-slot`, `hud/meter-labels`, `ui/logo` — the HUD and the title, M1-16). Pass it as `loadContent`'s `extraSprites` (the shell's `loadGameContent` does by default); without it bullets, blasts, Options, capsules and shields simulate but are hidden |

### `player` — the player ship (implemented for P0)

Movement, speed levels, clamping, banking and the fly-in (M1-06); hits are *recorded* by
`playerHit` since M1-07 (terrain contact), M1-08 (enemy contact) and M1-09 (enemy bullets and
lasers) — since M1-11 after the ship's Force Field (`shield`) had its say; the life cycle —
death, dead time, respawn with invulnerability, lives — since M1-12 (the World runs the death
sequence and decides respawns: [death-and-scoring.md](death-and-scoring.md)). Joining a co-op
game and continuing mid-game (M2-06) are `core/world`'s (`joinPlayer`): [coop.md](coop.md).

| Export | Kind | Summary |
|---|---|---|
| `PlayerShip` | interface | `slot`, `active`, `x`, `y` (world centre, sub-pixel), `state`, `stateTicks`, `speedLevel`, `invulnTicks`, `bank`, `device`, `lives` (ships including the one in play — the HUD shows `lives − 1`), `moving`, `hitCause` / `hitTick` / `hits` (last accepted hit, `None` / `-1` / `0` when never hit), `shield` (`core/shields` `ShieldState`, M1-11 — the meter's `?` slot grants the Force Field here, the Direct-mode blue items the Arm, M2-05); `speedLevel` is the meter's Speed Ups or (M2-05) the Direct-mode Speed toggle's level |
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
| `resolvePlayerShip(content, id = 'kestrel')` | function | → that ship, else the first, else `DEFAULT_PLAYER_SHIP` (load time); `createWorld` passes `config.shipId` since M2-05 |
| `DEFAULT_PLAYER_SHIP` | const | Frozen built-in spec with the KESTREL tunables (`respawnInvulnTicks` 150 since M1-12; `mode: 'meter'`, `startSpeedLevel: 0` since M2-05) and `spriteId: -1` (not drawn) — for empty content (and the ship select's only entry then) |
| `DIAGONAL_SCALE`, `ENTER_START_X`, `ENTER_END_X`, `SPAWN_Y` | const | `0.7071` (D4); `-24`, `64` (camera-relative fly-in); `100` (`PLAYFIELD_H / 2`) |
| `playerHit(ship, cause, tick, debug)` | function | The one entry point for anything that would kill a ship → `true` when accepted: ignored for inactive, not-`alive`, invulnerable and god-mode ships; then the ship's shield gets it first (`absorbShieldHit`, M1-11: an absorbed hit is accepted — the bullet is used up — but not recorded; terrain is never absorbed by the Force Field); otherwise records `hitCause`, `hitTick`, `hits++` (hashed). Callers: terrain (M1-07), enemy contact (M1-08), enemy bullets and lasers (M1-09). The ship stays `alive`: the World turns a hit recorded this tick (`hitTick === tick`) into the death sequence in phase 7 (M1-12); never allocates |
| `killPlayer(ship)` | function | Ship-level start of a death (M1-12): `dying` (timer restarted), `lives − 1` (never below 0), `invulnTicks` 0, level, not moving → lives left, or `-1` for an inactive / already `dying` / `dead` ship. The World's `killShip` adds the events, hit-stop, cancel and penalty |
| `respawnPlayer(ship, spec, camera)` | function | After the dead time (M1-12): a `respawning` fly-in from the left edge of `camera` (`spawnPlayer`) with `invulnTicks = enterTicks + respawnInvulnTicks` (it blinks from the start); lives untouched |
| `playerOut(ship)` | function | → `true` for an active ship that is `dead`, has no life left and has served `PLAYER_DEAD_TICKS` — it will not respawn; the World's game over is "every active ship out" |
| `PLAYER_DYING_TICKS`, `PLAYER_DEAD_TICKS` | const | `24` (the explosion, counted after the death's hit-stop), `60` (then the respawn decision) |
| `PlayerHitCause`, `PLAYER_HIT_CAUSE_NAMES` | const + type, const | `None 0, Terrain 1, Contact 2, Bullet 3, Laser 4` — append, never renumber; `'none'` … `'laser'` |

### `collision` — shapes, layers, broad phase, terrain (partial)

Terrain queries arrived with the stage runtime (M1-07); destructible tiles come in M2-07. The
bending lasers' circle chains (M2-02) are tested by `core/bullets` itself, not by a shape here.

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

### `debug` — state hash, debug switches, controls and counters

Implemented with M1-19 (the stage skip arrived with zone A in M1-18). Guide:
[debug-and-replays.md](debug-and-replays.md).

| Export | Kind | Summary |
|---|---|---|
| `hashWorld(world)` | function | → unsigned 32-bit FNV-1a over tick, both RNG states, camera, the stage runner (`0`, or `1` + every slot of `runner.state`), status, hit-stop, rank (M1-09), every player's simulated fields (incl. `hitCause`, `hitTick`, `hits`), every registered pool's live slots (the enemy bullets and lasers and the player shots among them), then every enemy slot's state (+ its fields when in use — M2-04: `carried` too; a script as present / absent and its `wakeTick`), the formation table's active slots with each track's `recorded` count, and the player weapons (M1-10: per player the loadout — since M2-05 its Direct-mode `shot`, `sub` and `family` too — and option group with its whole trail, since M2-04 the group's `mode`, `spreadTicks`, `toggled`, `holdTicks`, `angle` and Snake links, the autofire timers, since M2-03 each player's Free Way direction `freeWayHeading`, the cooldown tables of live piercing shots and Spread Bombs), and the power-ups (M1-11: per player the meter cursor, pending Mega Crash and every shield field — M2-04: `hurtScale`, the pod count, max hits, orbit, spin and every pod slot's hits, angle, i-frames and hit tick —, M2-05: the Arm's `tier` and `charge` —, then `dropsTaken` and (M2-05) the Direct-mode item plan's `planCursor`; the `items` pool is a registered pool), then the effect timers and scores (M1-12: shake magnitude / ticks / duration / request tick, flash ticks / kind / request tick, every player's score with its next extend threshold and continue count (M2-01), `killsScored`, `bonusesScored` — not the session hi-score — then `continuesUsed` and the rank inputs' `loop`, `stage`, `power`, `special`, M2-01), then the boss (M1-13: state, position, timers, phase, script wake tick, motion, destroyed mask, killer, blast flag, every part's offset / position / hp / destroyed / open / flash, the WARNING's `active` and `ticks`; the piercing shots' part cooldown tables join the weapons block); M2-02 adds the `cancelPoints` pool (a registered pool) and, right after the pools, the bending lasers (every slot's active flag, then an active slot's fields and body nodes, newest first) and the pattern interpreter's runners (the search hint and count, then every runner in use: slot, state, entry, counter, `repeat` stack, all 16 locals, wake age, `sequence` direction / speed, heading, scale) (fixed order, numbers as little-endian doubles); reads only; ≤ 16 B allocated per call |
| `FNV_OFFSET_BASIS`, `FNV_PRIME` | const | `0x811c9dc5`, `0x01000193` |
| `DebugFlags`, `createDebugFlags()` | interface, function | `godMode` (sim-affecting — a replay's `assisted`), `showHitboxes`, `showGrid`, `frameAdvance`, `slowMo` (`SlowMo`), `overlay`; → all off, `slowMo` 1. One set per `Game` (`game.debug`), shared by its Worlds |
| `SlowMo`, `SLOW_MO_STEPS` | type, const | `1 \| 2 \| 4`; `[1, 2, 4]` (frozen) — the slow-motion cycle |
| `DebugCommand`, `DEBUG_COMMAND_NAMES` | const + type, const | `Overlay 1`, `GodMode 2`, `Outlines 3` (off → hitboxes → + grid → off), `Grid 4`, `FrameAdvance 5`, `Step 6` (frame advance on + `requestStep(1)`), `SlowMo 7`, `NextCheckpoint 8`, `SkipToBoss 9`; names by code (index 0 `''`). Append, never renumber |
| `createDebugControls(game)` | function | → `DebugControls { game, flags, run(command) → changed }`. The stage jumps act only while the World has a stage, is `playing` / `bossWarning` and (scene flow) the game scene is on top; unknown codes → `false`. Cold code |
| `DebugControls` | interface | The controls above |
| `DebugCounters`, `createDebugCounters()` | interface, function | `tick`, `enemies` / `enemyCapacity`, `enemyBullets` / `bulletCapacity`, `lasers` / `laserCapacity`, `playerShots` / `shotCapacity`, `items` / `itemCapacity`, `rank`, `rngCalls` (gameplay stream `callCount`), `stateHash`, `hashTick` (−1 = none); → zeroed |
| `collectDebugCounters(world, out)` | function | Fills `out` read-only (→ `out`); rehashes when no hash was taken, `DEBUG_HASH_INTERVAL` ticks passed or the tick went back; allocation-free apart from the boxed hash |
| `DEBUG_HASH_INTERVAL` | const | `60` |
| `skipToBoss(world)` | function | The debug stage skip (M1-18) → `true` when it jumped: `runner.jumpTo(max(0, x − BOSS_SKIP_LEAD))` for the stage's **first** `warning` / `boss` event (every pool and system cleared, the events in between never fire), then `spawnPlayer` for every active ship not dying / dead; `false` in free flight or without a boss event. Cold code; `createWorld` calls it for `GameConfig.stageSkip: 'boss'`, the `SkipToBoss` command on a running World. Loadouts, lives and scores stay |
| `BOSS_SKIP_LEAD` | const | `96` — px before the boss event (≈ 2 s of zone A's calm) |
| `jumpToCheckpoint(world, checkpoint)` | function | `StageRunner.restartAt(checkpoint)` (−1 = the stage start) + ships flown in → `true`; `false` in free flight or for an index outside `[-1, checkpoints.length)` / not an integer. Replays start at `header.checkpoint` with it |
| `jumpToNextCheckpoint(world)` | function | `jumpToCheckpoint(world, runner.checkpoint + 1)` → `false` after the last checkpoint or in free flight |

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

### `patterns` — behaviour coroutines, movers, fire primitives and the pattern DSL

The script runner and the per-tick movers of decision D29 (M1-08), the fire primitives
(M1-09) and the BulletML-inspired pattern DSL with its interpreter (M2-02 — `implemented`).
Guides: [enemies-and-behaviors.md](enemies-and-behaviors.md#movers-corepatterns),
[bullets-and-patterns.md](bullets-and-patterns.md#fire-primitives-corepatterns),
[pattern-dsl.md](pattern-dsl.md).

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

Every fire primitive multiplies its speeds by `bullets.speedScale` (the rank), accepts
`AIM_AT_TARGET` for any angle, floors counts (below 1 fires nothing) and drops what a full pool
cannot take; none applies the fire rule — the `ScriptApi` wrappers do.

**The pattern DSL (M2-02).** The format and the compilers live in `patterns/dsl.ts` (re-exported
by `core/patterns` and the package entry); the interpreter in `patterns/index.ts`. Guide:
[pattern-dsl.md](pattern-dsl.md).

| Export | Kind | Summary |
|---|---|---|
| `PATTERNS_FILE_SCHEMA` | const | The `content/patterns/*.patterns.json` schema (header included): `actions` (≤ 1024 `{ id, body }`) and / or `bullets` (≤ 1024 `{ id, kind?, direction?, speed?, actions? }`); ids `/^[a-z0-9][a-z0-9.-]*$/` ≤ 64; ≤ 256 nodes per list; a bad expression is a schema issue with its parser message |
| `PatternsFile`, `PatternActionEntry`, `PatternBulletEntry`, `PatternBulletSpec` | interfaces | A validated file; a named action (`id`, `body`); a named bullet (`id` + the spec); a bullet (`kind?` — `<shape>-<colour>`, default `round-pink`; `direction?`, `speed?` — used when the `fire` gives none; `actions?` — its own program) |
| `PatternNode` | type | One node by `op`: `fire` (`direction?`, `speed?`, `bullet?` / `bulletRef?`, `params?` — with a `bulletRef` only), `wait` (`ticks`, `ranked?`), `repeat` (`times`, `body`), `changeSpeed` (`speed`, `term?`), `changeDirection` (`direction`, `term?`), `accel` (`accel`, `min?`, `max?`, `term?`), `vanish`, `actionRef` (`action`, `params?`) |
| `PatternDirection`, `PatternSpeed`, `PatternSpeedSpec`, `PatternExpr` | interface, type, interface, type | `{ type?: 'aim' \| 'absolute' \| 'relative' \| 'sequence' (default aim), value? }` in binary units; an expression (absolute) or `{ type?: 'absolute' \| 'relative' \| 'sequence', value }`; `string \| number` |
| `compileExpression(expr, params?)` | function | → `Float64Array` `[length, …postfix]` — the unit-test entry of the expression compiler (recursive-descent parser → `$n` substitution → constant folding → postfix); `params` are substituted as trees and folded, omitted ones are 0; throws `SyntaxError` for a syntax error, an unknown variable / function, a wrong arity or a stack deeper than `MAX_EXPR_STACK` |
| `compilePatternBank(files, issues)` | function | → frozen `PatternBank` from the collected files (load time — `loadContent` calls it; allocates freely): every action a program of its own (registration order = files by path, then document order), `actionRef` / `bulletRef` **inlined**, params as values (constants folded in, others held in runner locals), each bullet with `actions` a program (shared by every `fire` naming it without params). Pushes issues (duplicate ids, unknown / recursive references, `bullet` + `bulletRef`, `params` without a `bulletRef`, `$n` beyond the passed params, > 16 live locals, `repeat` deeper than 4, expressions deeper than 32, a bank over 262,144 numbers); an action with any issue — its own, an inlined action's or a launched bullet program's — gets entry 0 |
| `CollectedPatterns` | interface | `{ path, file }` — one file as the loader collected it |
| `PatternBank`, `EMPTY_PATTERN_BANK` | interface, const | `code` (`Float64Array`; `code[0]` = `End`), `actions` (ids by pattern index), `actionIndex` (id → index — enemies' `patternId`), `entries` (`Int32Array`: each action's code offset, 0 = did not compile), `bullets` (named bullet ids); the bank of a content without patterns (`EMPTY_CONTENT_DB.patterns`) |
| `applyExprOp(op, a, b)` | function | Applies one `ExprOp` operator / function to constants exactly as the interpreter does (what the folding uses; `NaN` for an unknown op) |
| `PatternOp` | const | Instruction codes: `End 0`, `Wait 1` `[1, ranked, expr]`, `Repeat 2` `[2, exitPc, expr]`, `Loop 3` `[3, bodyPc]`, `Fire 4` `[4, dirType, speedType, kind, bulletEntry, argCount, …args, dir, speed]`, `ChangeSpeed 5`, `ChangeDirection 6`, `Accel 7` `[7, flags, accel, min, max, term]`, `Vanish 8`, `SetLocal 9` `[9, slot, expr]` (every expression is `[length, …postfix]`) |
| `ExprOp` | const | Postfix codes: `Const 0` (+ the number), `Rank 1`, `Rand 2`, `Loop 3`, `Index 4` (`$i`), `Add 5` … `Mod 9`, `Neg 10`, `Floor 11`, `Round 12`, `Abs 13`, `Min 14`, `Max 15`, `Sin 16`, `Cos 17` (table, binary units), `Local 18` (+ slot — a param value), `Arg 19` (+ index — the running `Fire`'s arg) |
| `DirType`, `SpeedType`, `DIRECTION_TYPES`, `SPEED_TYPES` | const | `Aim 0, Absolute 1, Relative 2, Sequence 3`; `Absolute 0, Relative 1, Sequence 2`; the content names in code order |
| `ACCEL_HAS_MIN`, `ACCEL_HAS_MAX` | const | `1`, `2` — the `Accel` flag bits (`min` / `max` given) |
| `MAX_REPEAT_DEPTH`, `MAX_PATTERN_PARAMS`, `MAX_PATTERN_LOCALS`, `MAX_EXPR_STACK`, `MAX_PATTERN_CODE` | const | `4` (after inlining), `9` (`$1` … `$9`), `16` (param values live in one program), `32`, `262144` numbers (2 MB) |
| `DEFAULT_PATTERN_SPEED`, `DEFAULT_PATTERN_KIND` | const | `1` px/tick (a `fire` without a speed; the start of a `sequence` speed); `'round-pink'` |
| `createPatternVm(host)` | function | → `PatternVm`, every runner idle (load time — `createWorld` calls it and installs it with `bullets.setProgramRunner`) |
| `PatternVm` | interface | A `BulletProgramRunner` (`runBullet(index)`, `release(runner)`, `clear()`) + `bank`, `runners` (`PatternRunners`, read-only for others), `bulletPrograms` (bullet runners in use); `startEmitter(emitter, pattern, heading = 512)` → started (`false` — and the emitter stopped — for a bad slot or pattern or one with entry 0), `stepEmitter(emitter, source, canFire)` → ticks to sleep ≥ 1, or `-1` when the pattern ended (runs to the next `wait`; with `canFire` false it computes and advances but launches nothing), `stopEmitter(emitter)`. Each run executes ≤ `PATTERN_STEP_BUDGET` instructions; never allocates |
| `PatternHost` | interface | What it reads from its World: `bullets`, `rng.gameplay` (`$rand`), `rank` (`$rank`), `rankInputs.loop` (`$loop`), `content.patterns` |
| `PatternRunners` | interface | The runner table (`PATTERN_RUNNERS` slots): `state` (bits 1 in use, 2 has a `sequence` direction, 4 speed), `pc`, `entry`, `depth`, `loopI` / `loopN` (runner-major × 4), `locals` (runner-major × 16), `wake` (bullets: age of the next run), `seqDir`, `seqSpeed`, `heading` (emitters), `scale` (bullets: the speed scale fired with), `meta` (`[0]` search hint, `[1]` bullet runners in use) — live state `hashWorld` mixes |
| `PatternSource` | interface | `{ x, y }` an emitter fires from (an `Enemy` works) |
| `MAX_PATTERN_EMITTERS`, `MAX_BULLET_PROGRAMS`, `PATTERN_RUNNERS` | const | `64` (one per enemy slot), `512` (one per enemy bullet), `576` |
| `PATTERN_STEP_BUDGET`, `MAX_PATTERN_WAIT` | const | `1024` instructions per run (then the runner sleeps a tick — a `repeat` without a `wait` cannot hang the tick); `1_000_000` ticks |

### `enemies` — the enemy system (partial)

Spawning, formations, scripts, movers, off-screen rules, contact, damage and the sprite mirror
(M1-08); rank modifiers and revenge bullets (M2-01 — guide:
[difficulty-and-rank.md](difficulty-and-rank.md#per-enemy-rank-modifiers)); the Option Hunter, the
blue capsule's on-screen clear and the shield pods' contact test (M2-04 — guide:
[options-shields-hunter.md](options-shields-hunter.md#the-option-hunter-coreenemies-corebehaviors));
the mode-agnostic `powerup` drop (M2-05 — guide:
[direct-mode.md](direct-mode.md#drop-resolution-and-the-item-plan-corepowerups)).
Boss entries are never
spawned here — `core/bosses` runs them, and their parts share the grid after the enemy slots
(M1-13). Guide: [enemies-and-behaviors.md](enemies-and-behaviors.md).

| Export | Kind | Summary |
|---|---|---|
| `createEnemySystem(host, behaviors, stage)` | function | → `EnemySystem` (load time — `createWorld` calls it with the World as host): 64 slots + script APIs, the formation table, ground / air batches, specs and the stage's spawn events compiled into typed arrays |
| `EnemySystem` | interface | `enemies` (64 `Enemy`, index = slot), `count` (slots in use), `formations`, `outcomes`, `groundBatch`, `airBatch`, `carriedBatch` (M2-04: the Options hunters carry, grey — `LayerId.AirEnemies`, 16), `movers`; `spawn(enemyIndex, x, y, pathId?)` → `Enemy \| null` (lowest free slot; `NaN` y = mid-view / surface snap; bad or fractional index, a boss entry (M1-13), no free slot, an Option Hunter while no active ship has an Option (M2-04) → `null`; a hunter spawns armoured and pushes `SFX OptionHunter`), `startFormation(enemyIndex, count, interval, screenX, screenY, pathId, drop, bonus)` → slot or `-1`, `damage(enemy, amount, by = -1)` → died (ignored for ghosts / invulnerable; flash, `Sfx EnemyHit`; `by` = the player credited with a kill — the player shots pass the shooter's player, M1-10), `kill(enemy, by = -1)` → was alive (outcomes incl. `killBy`, explosion SFX + particles, drop, one `DropKind.FreeOption` drop per Option a hunter carried (M2-04), the spec's revenge bullets — M2-01: `by ≥ 0`, on screen, `host.rank ≥ revenge.minRank`, not inside `megaCrash` / `clearOnScreen` — formation accounting), `megaCrash(by = -1)` → enemies killed (M1-11: every live, non-ghost enemy whose spec is not `megaCrashImmune`, through `kill` in slot order — armour does not protect), `clearOnScreen(by = -1)` → enemies killed (M2-04, the blue capsule: like `megaCrash` but only enemies on screen), `huntOptions()` → Options stolen this tick (M2-04, phase 7 before the power-ups: every live hunter takes the first Option it touches and every one behind it in the chain, up to 8 carried; `SFX OptionStolen`), `clear()`; the World's per-phase calls `onStageEvent(i)`, `beginTick()`, `spawnPending()`, `runScripts()` (M2-01: an enemy with rank modifiers runs between `bullets.setShooterRank` and `clearShooterRank`), `move()`, `insertColliders(grid)`, `collidePlayers(grid)`, `flush()`, `sync()` — none allocates beyond the coroutines' own (a generator per spawn, a result per wake) |
| `EnemyHost` | interface | What the system reads from its World: `tick`, `camera`, `players`, `ship`, `terrain`, `content`, `rng`, `events`, `debugFlags`, `bullets` (M1-09: fire primitives; lasers detach when their enemy goes), `rank?` (M2-01: the session's rank for revenge bullets; absent = 0), `patterns?` (M2-02: the `PatternVm` behind `startPattern` / `stepPattern`; absent = those calls do nothing — an enemy's emitter is stopped when it is removed), `weapons?` (M2-04: `{ loadouts, options }` — what hunters look for and steal; absent = nobody has Options) |
| `Enemy` | class | One pooled enemy (`MoverBody` + `ScriptHolder`): `slot`, `state`, `specIndex`, `x`, `y`, `vx`, `vy`, `hw`, `hh`, `hp`, `flashTicks`, `age`, `spawnTick`, `formation`, `member`, `anchor`, mover fields, `track`, `script`, `wakeTick`, `flags`, `firstSeenTick`, `spriteId`, `animFrame`, `pathId`, `camX`, `camY`, `carried` (M2-04: Options an Option Hunter carries — hashed) |
| `EnemyState` | const + type | `Free 0`, `Live 1` (ghosts too), `Removed 2` (freed in phase 8) |
| `EnemyFlag` | const | Bits `Invulnerable 1` (armour: shots clink, M1-10), `Settled 2, WasOnScreen 4, OnScreen 8, Ghost 16, FaceRight 32, Leader 64` |
| `ScriptApi` | interface | One reused object per slot: `self`, `spec`, `tick`, `rng` (gameplay), `camera` (M2-04: the World's camera, read-only — to turn world positions into `Waypoint` view points), `target()` (nearest active `alive` ship or `null`), `setMover(kind, p0…p5)`, `spawn(enemyIndex, dx, dy)` (script starts next tick; ghosts spawn nothing), `onScreen()`, `canFire()` (live, on screen, settled, not a ghost); M1-09 fire primitives from the enemy's centre, each a no-op returning `-1` / `0` while `canFire()` is false: `aimed(speed, kind)`, `nWay(count, step, speed, kind, angle?)`, `ring(count, speed, kind, offset?)`, `spiral(angle, arms, step, speed, kind)` (→ next angle, advanced even when it may not fire), `stack(…)`, `spray(…)` (gameplay RNG), `homing(…)`, `delayed(…)`, `laser(angle?, length = 384, width?, telegraph?, grow?, active?, fade?)` (attached to the enemy), `fireWait(ticks)` (= `rankedWait`), `bullets` (the World's `BulletSystem`); M2-02: `bendingLaser(angle?, speed?, turnRate?, homing?, length?, width?, life?)` (a bending laser from the enemy's centre, speed × the rank's speed scale, not attached; `-1` while it may not fire), `startPattern(pattern, heading = 512)` (→ started — the World's `PatternVm` emitter of this slot on a `ContentDb.patterns` action index), `stepPattern()` (→ ticks to sleep — yield them — or `-1` at the end; fires follow `canFire()`) |
| `EnemyBehavior`, `EnemyBehaviorLookup` | interfaces | `{ id, params, create(api, params) → Script }`; `get(id)` (`core/behaviors` provides both) |
| `FormationTable` | interface | 32 slots of typed arrays: `active`, `enemy`, `total`, `spawned`, `killed`, `escaped`, `interval`, `nextTick`, `screenX`, `screenY`, `path`, `drop`, `bonus`, `lastX`, `lastY`, `leader`, + `tracks` (`FollowTrack` per slot) — hashed |
| `EnemyOutcomes` | interface | This tick's `killCount`, `killSpec`, `killX`, `killY`, `killScore`, `killBy` (`Int8Array`: the player credited, `-1` = nobody — M1-10), `dropCount`, `dropKind`, `dropX`, `dropY`, `bonusPoints` (the sum), and per completed formation (M1-12) `bonusCount`, `bonusScore` (`Float64Array`), `bonusBy` (`Int8Array`: the killer of its last member, `-1` = nobody) — reset in phase 3; `core/powerups` turns the drops into items at the end of phase 7 (M1-11: capsules; M2-05: in Direct mode the stage's planned colour items), `core/scoring` credits kills and bonuses (M1-12) |
| `DropKind` | const + type | `None 0`, `Capsule 1`, `BlueCapsule 2` (M2-04: content `blueCapsule`), `PowerUp 3` (M2-05: content `powerup` — a capsule in meter mode, the next planned item in Direct mode), `FreeOption 4` (M2-04: one Option a dead hunter carried — code 3 before M2-05; the content drops come first) |
| `MAX_CARRIED_OPTIONS`, `CARRIED_OPTION_SPACING`, `CARRIED_BATCH_CAPACITY` | const | M2-04: `8` (Options one hunter carries); `10` px between the carried Options drawn behind it; `16` (`carriedBatch`) |
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
| `defineBehavior(id, params, create, needsChild = false, needsPattern = false)` | function | → frozen `BehaviorDef` (tunables copied and frozen) |
| `BehaviorDef` | interface | `EnemyBehavior` + `id`, `params` (defaults), `create(api, params)`, `needsChild` (spawners), `needsPattern` (M2-02: DSL pattern runners) |
| `createBehaviorRegistry(defs)` | function | → `BehaviorRegistry { ids (sorted), get(id) }`; throws `Error` for a duplicate id |
| `DEFAULT_BEHAVIOR_DEFS`, `DEFAULT_BEHAVIORS`, `BEHAVIOR_IDS` | const | The roster: `drifter.sine`, `fan.loop`, `carrier.straight`, `turret.floor`, `walker.floor`, `hatch.spawner`, `rammer.aimed`, `orbiter.loop` (M1) `pattern.loop` (M2-02: runs the enemy's `pattern` over and over, [`restTicks` 60] apart, `relative` directions from [`heading` 512]; it moves with its spec's `mover`) and `hunter.option` (M2-04: the Option Hunter — [`variant` 0] rear / 1 front / 2 dive, [`lineUpTicks` 90] re-aiming a `Waypoint` mover every 6 ticks at [`speed` 2], then [`windup` 24] and a charge at [`chargeSpeed` 4.5]; line-up points view x [`lineX` 48] / `384 − lineX` or view y [`lineY` 24]; never fires) and `cube.pincer` (M2-05: a cube of a six-cube pincer wave — odd formation members start mirrored across the playfield's middle row, every cube flies at [`speed` 1.5] to view x [`meetX` 176], [`gap` 8] px beside the middle row on its own half, then leaves left at [`leaveSpeed` 1.75]; never fires — [direct-mode.md](direct-mode.md#carriers-corebehaviors-and-the-dev-stage)) (tunables in the guides); as a registry (what the World uses); its sorted ids |
| `WEAPON_SCRIPT_IDS` | const | Re-export of `core/weapons` `WEAPON_SCRIPT_IDS` (`laser.beam`, `missile.groundSlide`, `shot.double`, `shot.straight`; the list moved to `weapons` in M1-10) — weapon and enemy behaviours share the content's script table |
| `defineBossBehavior(id, params, create)` | function | → frozen `BossBehaviorDef` (M1-13; tunables copied and frozen) |
| `BossBehaviorDef`, `BossBehaviorRegistry` | interfaces | `core/bosses` `BossBehavior` + typed `params`, `create(api: BossScriptApi, params) → Script`; `{ ids (sorted), get(id) }` (a `BossBehaviorLookup`) |
| `createBossBehaviorRegistry(defs)` | function | → `BossBehaviorRegistry`; throws `Error` for a duplicate id |
| `DEFAULT_BOSS_BEHAVIOR_DEFS`, `DEFAULT_BOSS_BEHAVIORS`, `BOSS_BEHAVIOR_IDS` | const | The M1 boss roster (M1-13): `boss.hover` (tracks the player's height, aimed spreads from the gun parts, opens / closes `whenOpen` parts) `boss.lanes` (lane lasers from the guns in turn, aimed spreads) and, since M1-18, `boss.bulwark` (HALCYON BULWARK: slow tracking, lane lasers **attached** to the guns in turn, optional aimed `ways`-ways of needles — [zone-a-and-playtest.md](zone-a-and-playtest.md#bossbulwark)) — tunables in the guides; as a registry (the World's default); its sorted ids |
| `KNOWN_SCRIPT_IDS` | const | `BEHAVIOR_IDS` ∪ `BOSS_BEHAVIOR_IDS` ∪ `WEAPON_SCRIPT_IDS`, sorted — pass it to `loadContent` as `knownScripts` |
| `checkEnemyBehaviors(db, registry = DEFAULT_BEHAVIORS, bossRegistry = DEFAULT_BOSS_BEHAVIORS)` | function | → `ValidationIssue[]`: `enemies:<id>.params.<name>` (unknown tunable), `enemies:<id>.child` (spawner without a child), `enemies:<id>.pattern` (M2-02: `pattern.loop` without a `pattern`), `enemies:<id>.script` (a boss behaviour on a regular enemy), `enemies:<id>.boss.phases[<p>].script` (an enemy behaviour in a boss phase), `enemies:<id>.boss.phases[<p>].params.<name>` (unknown boss tunable) — M1-13 |

### `bullets` — enemy bullets and lasers

The enemy projectiles of a World (M1-09; bending lasers, cancel into point items and the pattern
DSL's bullet programs since M2-02). Guide: [bullets-and-patterns.md](bullets-and-patterns.md).

| Export | Kind | Summary |
|---|---|---|
| `createBulletSystem(host)` | function | → `BulletSystem` (load time — `createWorld` calls it with the World as host): registers the `enemyBullets` (512), `enemyLasers` (16) and — M2-02 — `cancelPoints` (512) pools, builds their views, the bending laser table and the kind tables (sprite ids via `content.sprites`), reads `content.scoring.bulletCancel` (else `DEFAULT_SCORING_RULES`); throws `Error` when the pool names are already registered |
| `BulletSystem` | interface | `pool`, `lasers` (the two `SoaPool`s), `batch` (the bullet pool as the `EnemyBullets` `SpriteBatchView`), `laserView` (`LaserView`), `count`, `rank`, `rankSpeedScale` (the session's: the rank's bullet-speed curve × `config.bulletSpeedMul` — M2-01), `rankFireScale` (the session's fire-rate curve), `speedScale` / `fireScale` (what the fire primitives apply now: the session's, or a shooter's own while an enemy script runs), `aimDirections`; `setRank(rank)` (recomputes the session's scales and resets the current ones — the World calls it only when the rank changes); `setShooterRank(speedK, fireK, index)` (M2-01: narrows the current scales to one spec's modifiers read from `Float64Array`s — `(1 + ks · (curve − 1)) · bulletSpeedMul`, `1 + kf · (curve − 1)`, each ≥ 0.05) and `clearShooterRank()` (back to the session's); `spawn(x, y, angle, speed, kind)` / `emit(origin, angle, speed, kind)` → slot or `-1` (raw values: full pool, bad or fractional kind, non-finite angle other than `AIM_AT_TARGET` drop quietly); `aimFrom(origin)` → quantised angle to the nearest living player; per-slot `setMotion(i, accel, angVel, minSpeed, maxSpeed)`, `setChange(i, atAge, speed, angle)`, `setDelay(i, ticks, aimOnLaunch)`, `setHoming(i, turnRate, lifetime)`, `setFlags(i, flags)` (no-ops for bad or removed slots); `fireLaser(origin, angle, length, width, telegraph, grow, active, fade, src)`; `detachLasers(slot)`; the World's per-phase `update()` (phase 5) and `collidePlayers()` (phase 6); `cancelAll(mode, player = -1)`. M2-02: `bending` (`BendingLaserTable`), `points` (the `cancelPoints` pool), `pointBatch` (it as the `Items` `SpriteBatchView`), `cancelPoints` (points per cancelled bullet); `launch(shot, kind)` (one bullet from a `BulletShot` — already rank-scaled — → slot or `-1`), `remove(i)` (no sparkle — the DSL's `vanish`), `setProgramRunner(runner \| null)`, `fireBendingLaser(origin, angle, speed, turnRate, homing, length, width, life)` → slot or `-1`, `clear()` (a session clear: the bending lasers go, every bullet runner is freed) — none allocates |
| `BulletHost`, `BulletOwner` | interfaces | What the system reads from its World (`tick`, `config`, `camera`, `players`, `ship`, `terrain`, `content`, `events`, `debugFlags`, `pools`, `enemies`, since M1-13 the optional `laserSources` — every laser source by id; absent = the enemy slots — and since M2-02 the optional `scoring` — the score board point items credit; absent = they score nothing); anything with a `.bullets` system (the World) |
| `BulletOrigin` | class | `{ x, y }` a pattern fires from — one reused instance per firing system (a class, so the fields stay unboxed) |
| `LaserSource` | interface | `{ slot, x, y }` — an `Enemy` works, and a `BossPart` (M1-13); `slot` -1 = a fixed origin |
| `spawnBullet(owner, x, y, angle, speed, kind)` | function | `owner.bullets.spawn(…)` — one raw bullet → slot (stable within the tick) or `-1` |
| `fireLaser(owner, src, angle, length, telegraph = 40, grow = 8, active = 60, width = 6, fade = 8)` | function | A straight laser from `src` (attached when `src.slot ≥ 0`, else riding the camera) → slot or `-1` (pool full, all timings 0, non-positive length / width, bad angle); raw — no fire rule, no rank |
| `cancelAllBullets(owner, mode, player = -1)` | function | Removes every cancelable bullet and laser — straight and bending — this tick → bullets cancelled; both modes push `Particles` / `FX_CUES.BulletCancel` at up to `CANCEL_SPARKLE_LIMIT` evenly spread bullets; `CancelMode.Points` also turns every cancelled bullet into a point item for `player` (a full item pool credits at once; no valid player or 0 points per bullet = `Sparkle`) |
| `CancelMode` | const + type | `Sparkle 0` (the player's death), `Points 1` (M2-02: a boss's death → its killer, a Mega Crash → the bomber) |
| `fireBendingLaser(owner, src, angle = AIM_AT_TARGET, speed = 3, turnRate = 6, homing = 60, length = 48, width = 6, life = 120)` | function | M2-02: a bending laser from `src`'s position (not attached; raw — no fire rule, no rank; `ScriptApi.bendingLaser` adds both) → the slot (stable for the laser's life) or `-1` (all 8 busy; speed outside `(0, 16]`, width ≤ 0, life < 1, length outside `2 … 64`, a non-finite angle or origin) |
| `BendingLaserTable` | class | The 8 stable bending laser slots — also the render contract's `BendingLaserView`: `capacity` 8, `nodes` 64, per slot `active`, `filled`, `head`, `length`, `emit` (head ticks left; 0 = the tail catches up), `homing`, `stride` (`max(1, floor(width / 2 / speed))`), `angle`, `speed`, `turnRate`, `width`, `spriteId`, `flags`, `bits` (`BulletFlag`), node `x` / `y` (slot-major); `count` (getter, counts the slots), `clear()` |
| `BulletShot` | class | `{ x, y, angle, speed }` of one bullet an interpreter launches (`launch`) — a class so the fields stay unboxed doubles |
| `BulletProgramRunner` | interface | M2-02: what the bullet system calls for bullets with a program (the World's `PatternVm` — no import of the interpreter): `runBullet(index)` → 1 when the program ran (velocity recomputed), 0 while it sleeps — called in `update()` after `age++`, before the bullet's change / homing / kinematics; `release(runner)` (a bullet with a program was removed); `clear()` |
| `POINT_ITEM_SCHEMA`, `PointItemSchema` | const, type | The `cancelPoints` pool fields: `x`, `y`, `vx`, `vy`, `player` (credited), `value` (points), `age`, `sprite`, `frame` (twinkle), `draw`, `flags` |
| `MAX_BENDING_LASERS`, `BENDING_LASER_NODES`, `BENDING_LASER_SPEED`, `BENDING_LASER_TURN`, `BENDING_LASER_HOMING`, `BENDING_LASER_LENGTH`, `BENDING_LASER_WIDTH`, `BENDING_LASER_LIFE`, `BENDING_LASER_SPRITE` | const | `8` slots, `64` nodes (a power of two), defaults `3` px/tick, `6` units/tick, `60` ticks, `48` nodes, `6` px, `120` ticks; `'lasers/bend-pink'` |
| `MAX_POINT_ITEMS`, `POINT_ITEM_HOVER_TICKS`, `POINT_ITEM_ACCEL`, `POINT_ITEM_MAX_SPEED`, `POINT_ITEM_LIFETIME`, `POINT_ITEM_TARGETS`, `POINT_ITEM_SPRITE` | const | `512`; `12` ticks drifting (velocity × 0.85 per tick, from half the bullet's); `0.35` px/tick²; `9` px/tick; `180` ticks (then credited anyway); per player the score's place in the top HUD bar in playfield coordinates (`[40, −4]`, `[344, −4]`); `'items/point'` (2 twinkle frames) |
| `BULLET_SHAPES`, `BULLET_COLORS`, `BULLET_KIND_NAMES` | const | M2-02 (leaf `bullets/kinds.ts`, so `core/data` / the DSL compiler need not import the bullet system): `round, oval, needle`; `pink, red, purple`; `round-pink` … `needle-purple` by `BulletKind` code (`shape · 3 + colour`) — the `kind` names of `content/patterns/` |
| `BulletFlag` | const | `DieOnTerrain 1`, `Cancelable 2`, `Grazed 4` (reserved, P2) — public; `AimOnLaunch 8`, `Dead 16` — internal |
| `BulletKind`, `BulletKindSpec`, `BULLET_KINDS` | const + type, interface, const | `RoundPink 0 … NeedlePurple 8` (round / oval / needle × pink / red / purple); `{ name, sprite, radius, frames, flags }`; the frozen built-in table (radius 2 / 2 / 1.5, frames 1 / 8 / 8, every kind `DieOnTerrain \| Cancelable`) |
| `BULLET_SPRITES`, `LASER_SPRITE` | const | The kinds' sprites, then the beam, the bending laser segment and the point item (M2-02) — part of `core/world` `ENGINE_SPRITES`; `'lasers/beam-pink'` |
| `LaserPhase` | const + type | `Telegraph 0` (blinking warning line), `Grow 1`, `Active 2` (the only phase with a hitbox — a capsule of radius `width / 2`), `Fade 3` |
| `BULLET_SCHEMA`, `BulletSchema`, `LASER_SCHEMA`, `LaserSchema` | const, type | The pool field layouts (hashed in sorted field order) — tables in the guide; M2-02 added `runner` (the bullet's program runner + 1, 0 = none), `accelTerm` / `termSpeed`, `turnTerm` / `termAngle` (timed acceleration / turn that stop after their ticks, landing on the target; `NaN` = keep) |
| `AIM_AT_TARGET`, `UNCHANGED`, `NO_TARGET_ANGLE` | const | `Infinity` (angle argument: at the nearest living player, quantised; as a change angle: re-aim then); `NaN` (keep a value in `setChange`); `512` (straight left — aimed shots without a target) |
| `MAX_ENEMY_BULLETS`, `MAX_ENEMY_LASERS`, `MAX_BULLET_SPEED`, `BULLET_CULL_MARGIN`, `CANCEL_SPARKLE_LIMIT` | const | `512`, `16`, `16` px/tick (default `maxSpeed`), `16` px (culled outside the view ± this), `64` |
| `LASER_TELEGRAPH_TICKS`, `LASER_GROW_TICKS`, `LASER_ACTIVE_TICKS`, `LASER_FADE_TICKS`, `LASER_WIDTH`, `LASER_BLINK_TICKS` | const | Laser defaults: `40`, `8`, `60`, `8` ticks, `6` px, blink `4` on / `4` off |

Bullets, fixed lasers, bending lasers and point items ride the camera (`x += camera.dx`) like
flying enemies; bullets die outside the view ± 16 px and (with `DieOnTerrain`) on terrain;
collision is brute force per ship (`playerHit(Bullet)` / `playerHit(Laser)` — a bending laser's
circle chain is a `Laser` hit — at most one of each per ship and tick; an accepted bullet is
removed).

### `rank` — rank / dynamic difficulty

Implemented with M2-01 (the constant rank and the curves came with M1-09); the Direct-mode power
term with M2-05. Guides:
[difficulty-and-rank.md](difficulty-and-rank.md#rank-corerank),
[bullets-and-patterns.md](bullets-and-patterns.md#rank-corerank).

| Export | Kind | Summary |
|---|---|---|
| `computeRank(inputs)` | function | → whole rank: `base + floor(growth × (8·(loop − 1) + (stage − 1) + power + special))`, clamped to `[0, 31]` and to `[0, 16]` while `loop ≤ 1`; the base rounded, a loop / stage below 1 counts as 1 (fractions floored), non-finite terms (and growth) count as 0. Never allocates |
| `RankInputs` | interface | `{ difficultyBase, growth, loop, stage, power, special }` — `growth` added in M2-01 (`GameConfig.rankGrowth`: 0 = constant rank, 1 = the Gradius III formula) |
| `createRankInputs(config)` | function | → fresh **mutable** inputs from `config.rankBase` / `rankGrowth`, loop 1, stage 1, power 0, special 0 (load time — allocates); the World keeps one (`world.rankInputs`) |
| `difficultyRankInputs(difficulty)` | function | → the inputs of a session start on a preset of the built-in table (`DIFFICULTY_RANK_BASE`, growth 1) — tools and tests; sessions use `createRankInputs(config)` |
| `powerRank(missile, double, laser, options, shield, reduce)` | function | → one ship's power term: flags count when positive, `options` is a count (floored) — Missile +1, Double +2, Laser +3, each Option +1, a shield +4, Reduce +2 (M2-04 — the World passes Reduce as `reduce`, never also as `shield`); never allocates |
| `RANK_POWER` | const | `{ speed: 0, missile: 1, double: 2, laser: 3, option: 1, shield: 4, reduce: 2 }` (shmup_feat.md §15) |
| `directPowerRank(shot, sub, armTier)` | function | M2-05 → a Direct-mode ship's power term: `floor((shot + sub) / 2) + RANK_ARM_TIER[tier]` (negative / fractional levels count as their whole non-negative part, a tier above 3 as 3) — both levels 8 with the Hyper Arm give 12, the fully powered meter ship's term; never allocates |
| `RANK_ARM_TIER` | const | M2-05: `[0, 2, 3, 4]` — the Arm's rank by tier (none, green Arm, silver Super Arm, gold Hyper Arm = the meter's shield) |
| `DIFFICULTY_RANK_BASE` | const | `easy 0`, `normal 2`, `hard 4`, `arcade 6` (the "very hard" base) — the built-in table's; sessions read `GameConfig.rankBase` |
| `rankScale(rank, curve)` | function | `1 + perRank · (r − 2) + perRankSq · (r² − 4)`, `r` clamped to 0…31, never below 0.05 — **exactly 1 at Normal**; returns a fraction: call it when the rank changes, not per tick |
| `rankSensitivity(scale, k)` | function | M2-01: an enemy's multiplier for a rank modifier `k` (`content/enemies/` `rank`): `1 + k · (scale − 1)`, never below 0.05 (non-finite `k` = 1); `core/bullets` `setShooterRank` inlines the same arithmetic |
| `RankCurve` | interface | `{ perRank, perRankSq }` (either may be negative) |
| `BULLET_SPEED_RANK_CURVE`, `FIRE_RATE_RANK_CURVE` | const | `{ 0.01, 0.0005 }` (rank 0 × 0.978, 6 × 1.056, 16 × 1.266, 31 × 1.768); `{ 0.02, 0.001 }` (rank 0 × 0.956, 6 × 1.112, 16 × 1.532, 31 × 2.537 — intervals are divided by it) |
| `RANK_MAX`, `RANK_LOOP1_CAP`, `RANK_NORMAL` | const | `31`, `16`, `2` |

### `weapons` — player weapons (implemented)

The players' projectiles, loadouts and autofire (M1-10): meter mode's Type A arsenal fired by
the ship and its Options with per-shooter caps, piercing beams and grid-based hits; since M2-03
the Types B–D behaviours, the presets and Weapon Edit of the config (`resolveArsenal`) and
`setArsenal`; since M2-05 the Direct-mode shot families (direct roles, level volleys, the MANTA's
loadout). Guides: [weapons-and-options.md](weapons-and-options.md),
[meter-arsenal.md](meter-arsenal.md), [direct-mode.md](direct-mode.md#families-and-firing-coreweapons).

| Export | Kind | Summary |
|---|---|---|
| `createWeaponSystem(host)` | function | → `WeaponSystem` (load time — `createWorld` calls it with the World as host): registers the `playerShots` pool (96), one `Loadout` and `OptionGroup` per player (of `config.optionChoice`'s type — M2-04), the role tables compiled from the config's arsenal (`resolveArsenal` — M2-03; sprite ids, SFX, tunables; intervals from the config), the Direct-mode families (M2-05: a direct role per distinct weapon they fire, every level's emitters grouped by weapon), the hit list and the two batches; throws `Error` when `playerShots` is already registered, `RangeError` for a bad `weaponEdit` |
| `WeaponSystem` | interface | `pool` (`SoaPool<ShotSchema>`), `batch` (`PlayerShots` mirror, 192), `optionBatch` (`Player`, 8 — drawn below the ships), `loadouts`, `options`, `roleWeapons` (`WeaponSpec \| null` per role — the session's arsenal; not frozen since M2-03, `setArsenal` rewrites it), `timers` (`Int32Array`, `[shooter × 2]` main / `+ 1` missile — hashed), `freeWayHeading` (M2-03: `Int32Array` per player, the heading of the last 8-way direction held while alive, `-1` before any — hashed), `liveCounts` (`[shooter × WEAPON_ROLE_SLOTS + role]` — a stride of 36 since M2-05, the direct roles after the meter ones), M2-05: `direct` (the session fires the families — `powerUpMode === 'direct'` — instead of the meter roles), `mainFamilies` (the content's `main` families — `Loadout.family` indexes it), `subFamily` (the first `sub` family or `null`), `cooldowns` (`Uint8Array`, `PIERCE_TABLES` × 64), `partCooldowns` (`PIERCE_TABLES` × 16 — the boss parts, same table index, M1-13), `hitShot` / `hitEnemy` / `hitCount` (the last `collide`; `hitEnemy` is an enemy slot or a boss part as `BOSS_PART_ID_BASE` + index), `hitsDropped`, `count`; `spawnShot(role, shooter, x, y)` → slot or `-1` (any role below `WEAPON_ROLE_SLOTS`, the direct ones included; as if the shooter were at x, y — offsets and velocity apply, caps and timers do not; `-1` for an empty role, a bad shooter, a full pool or no free pierce table), `countShots(shooter, role)`; the World's per-phase `updatePlayers()` (2: option trails — since M2-04 `OptionGroup.steer` with the player's intent, then `follow` —, timers, firing — in Direct mode every shooter fires the main family's level `shot` on its main timer and the sub family's level `sub` on its missile timer, M2-05), `update()` (5: movement, terrain, culling, cooldowns), `collide(grid)` (6: hits found — non-piercing: the lowest overlapping id; piercing: every one off cooldown, armour and clinking parts always), `applyHits()` (7: clink on armour, else `enemies.damage(e, damage, player)`; a boss part through `bosses.damagePart` — `Clink` kills the shot, `None` lets it fly on — M1-13), `sync()` (9), `clear()` (checkpoint restart), and since M2-03 `setArsenal(roles)` (the weapon select's preview: recompiles the meter role tables in place — the direct roles stay —, removes every shot, restarts the timers — never in a recorded session) — none allocates |
| `WeaponHost` | interface | What the system reads from its World: `tick`, `config`, `camera`, `players`, `ship` (`enterTicks`), `intents`, `terrain`, `content`, `events`, `pools`, `enemies` (`enemies`, `damage(enemy, amount, by)`), `bosses` (`boss.parts`, `damagePart(index, amount, by)` → `BossHit` — M1-13) |
| `Loadout` | class | One player's loadout: `main` (`MainWeapon`), `missile` (boolean), `options` (0–4) — the meter's —, and since M2-05 `shot`, `sub` (the Direct-mode main-shot and sub-weapon levels, 0–`DIRECT_MAX_LEVEL`) and `family` (index into `mainFamilies`; negative reads as the first, past the end wraps) — all hashed; the speed level and the shield live on the ship (`PlayerShip.speedLevel`, `PlayerShip.shield` — `Loadout.shield` was removed in M1-11); the power meter (`core/powerups`) equips them |
| `applyLoadoutPreset(loadout, ship, preset, shield = FORCE_FIELD)` | function | `'default'`: basic shot, nothing else, speed level 0; `'full'`: speed level `FULL_LOADOUT_SPEED_LEVEL` (2), Missile, Laser, four Options and a fresh `shield` (`grantShield` — the World passes the `?` choice's, `shieldSpecOf(config.shieldChoice)`, M2-03; `'default'` clears the shield); the Direct-mode fields go to 0 |
| `applyDirectLoadout(loadout, ship, preset, startSpeedLevel = 0)` | function | M2-05 — a Direct-mode starting loadout (creation, a continue): the meter fields empty; `'default'` = levels 0, family 0, no Arm; `'full'` = both levels `DIRECT_MAX_LEVEL` and the gold Hyper Arm (`collectArm` ×9); the speed level = `startSpeedLevel` either way |
| `resolveFamilies(content)` | function | M2-05 → `{ main, sub }`: the content's `main` families in content order (new array) and its first `sub` family (or `null`) — load time |
| `DIRECT_MAX_LEVEL`, `MAX_DIRECT_WEAPONS`, `WEAPON_ROLE_SLOTS` | const | M2-05: `8` (levels 0 … 8); `32` (distinct weapons the families may fire — later ones are left out); `WEAPON_ROLE_COUNT + MAX_DIRECT_WEAPONS` = `36` (the role tables' size and the `liveCounts` stride) |
| `MainWeapon` | const + type | `Basic 0, Double 1, Laser 2` (Double and Laser are mutually exclusive, §6A) |
| `WeaponRole`, `WEAPON_ROLE_COUNT` | const + type, const | `Main 0, Double 1, Laser 2, Missile 3` (index into the role tables); `4` — the Direct-mode roles follow from 4 (M2-05) |
| `ShotKind` | const + type | `Straight 0, Double 1, Laser 2, Missile 3`, M2-03: `SpreadBomb 4, TwoWay 5, Torpedo 6, FreeWay 7, Ripple 8, Twin 9` — hashed: append, never renumber |
| `ShotFlag` | const | `Pierce 1, Blocked 2` (laser head stopped by terrain), `Sliding 4` (missile on the floor), `Dead 8` (removed this tick), `Blast 16` (a Spread Bomb that burst: piercing, world-anchored — M2-03) |
| `SHOT_SCHEMA`, `ShotSchema` | const, type | Pool fields: `x`, `y` (a laser's head), `vx`, `vy` (a Twin beam: its lane), `length`, `hw`, `hh`, `damage`, `role`, `kind`, `shooter`, `flags`, `sprite`, `frame`, `draw`, `age`, `table` (cooldown table + 1, 0 = none) — hashed in sorted order |
| `WeaponBehaviorId` | type | A weapon behaviour / script id (`string`) |
| `WEAPON_BEHAVIOR_KINDS`, `WEAPON_BEHAVIOR_SLOTS`, `WEAPON_BEHAVIOR_PARAMS`, `WEAPON_SCRIPT_IDS` | const | Behaviour id → `ShotKind` (M2-03: `shot.tailGun` / `shot.vertical` → `Double`, `laser.cyclone` → `Laser`, the others their own kind); → the slot it belongs in; → its tunables with defaults (`shot.straight` `ox 8, oy 0, hw 4, hh 2`; `shot.double` `angle 128, ox 4, oy -2, hw 3, hh 3`; `laser.beam` `maxLength 64, hitCooldownTicks 6, ox 8, oy 0, hh 2`; `missile.groundSlide` `slideSpeed 3, angle 128, ox 0, oy 4, hw 4, hh 1.5, frames 2`; M2-03: `missile.spreadBomb` `angle 64, gravity 0.12, ox 2, oy 4, hw 3, hh 3, blastRadius 14, blastTicks 12, hitCooldownTicks 6, frames 4`; `missile.twoWay` `angle 128, ox 2, oy 0, hw 3, hh 3`; `missile.torpedo` `slideSpeed 5, angle 96, ox 0, oy 4, hw 5, hh 1.5, frames 2`; `shot.tailGun` `angle 512, ox -6, oy 0, hw 4, hh 2`; `shot.vertical` `angle 256, ox 0, oy -6, hw 2, hh 4`; `shot.freeWay` `angle 128, ox 0, oy 0, hw 3, hh 3`; `laser.ripple` `startSize 4, maxSize 20, growth 0.5, aspect 0.5, ox 8, oy 0, frames 6`; `laser.cyclone` `maxLength 80, hitCooldownTicks 6, ox 8, oy 0, hh 4, frames 4`; `laser.twin` `maxLength 16, gap 8, ox 8, oy 0, hh 1.5`; M2-05: `direct.bolt` → `Straight`, slots `main` / `sub`, `ox 8, oy 0, hw 4, hh 2, frame 0, turn 0, hitCooldownTicks 6` — `frame` the still frame, `turn 1` the heading's octant frame; `direct.bomb` → `SpreadBomb` in the emitter's heading, slot `sub`, `gravity 0, ox 2, oy 0, hw 3, hh 3, blastRadius 8, blastTicks 8, hitCooldownTicks 6, frames 4, frame 0`); the fifteen ids sorted (moved here from `behaviors`, which re-exports them) |
| `WEAPON_BEHAVIOR_LABELS` | const | M2-03: behaviour id → the HUD meter's label (`SHOT`, `DOUBLE`, `LASER`, `MISSILE`, `SPREAD`, `2-WAY`, `TORPEDO`, `TAIL`, `VERTICAL`, `FREE WAY`, `RIPPLE`, `CYCLONE`, `TWIN` — `core/ui` `METER_LABEL_FRAMES` holds the matching frames; M2-05: `BOLT`, `BOMB`) |
| `resolveWeaponPreset(content, id = DEFAULT_WEAPON_PRESET)` | function | → that preset, else the first, else `null` |
| `resolveRoleWeapons(content, preset)` | function | → four `WeaponSpec \| null` in `WeaponRole` order: the preset's (the main role falling back to the first `main`-slot weapon), or the first weapon of each slot without a preset |
| `resolveArsenal(content, config)` | function | M2-03 → the session's four roles: `resolveRoleWeapons` of `resolveWeaponPreset(content, config.weaponPreset)`, then `config.weaponEdit` replacing Missile / Double / Laser; throws `RangeError` (`GameConfig.weaponEdit.<slot>: …`) for an id the content lacks or a weapon of another slot (checked in meter order); load time (allocates) |
| `weaponsOfSlot(content, slot)`, `weaponLabel(weapon)` | functions | M2-03 → a new array of the slot's weapons in content order (the Weapon Edit lists); → the weapon select's label: `name`, else the id upper-cased |
| `RIPPLE_RING_WIDTH` | const | M2-03: `4` — the Ripple's ring thickness (on its height); a target wholly inside the inner edge is not hit |
| `SPREAD_BLAST_SPRITE`, `WEAPON_SPRITES` | const | M2-03: `'shots/blast'`; `['shots/blast']` — the weapons' engine sprites (part of `ENGINE_SPRITES`) |
| `checkWeaponBehaviors(db)` | function | → `ValidationIssue[]`: `weapons:<id>.behavior` (not a weapon behaviour), `weapons:<id>.params.<name>` (unknown tunable), `weapons:<id>.slot` (wrong slot) — run by the shell's loader and `pnpm content:check` |
| `MAX_PLAYER_SHOTS`, `SHOOTERS_PER_PLAYER`, `MAX_SHOOTERS` | const | `96`; `5` (the ship + 4 Options; shooter id = `player × 5 + k`); `10` |
| `SHOT_CULL_MARGIN`, `SFX_RATE_TICKS`, `PIERCE_TABLES`, `MAX_SHOT_HITS` | const | `16` px (culled outside the view ± this); `4` (one push per cue per 4 ticks); `32` (piercing shots alive at once); `1024` (hits per tick, the rest counted in `hitsDropped`) |
| `SHOT_BATCH_CAPACITY`, `LASER_SEGMENT_LENGTH` | const | `192` (shots + laser segments); `8` px per drawn laser segment |
| `DEFAULT_WEAPON_PRESET`, `FULL_LOADOUT_SPEED_LEVEL` | const | `'type-a'`; `2` |

Firing: while a ship is `alive`, each shooter (ship, then Options) fires its main role every
`config.autofireInterval` ticks (or the weapon's `refireTicks`) and its missile every
`config.missileInterval` ticks when its cap has room, if `config.autofire || config.remoteMode`
or `Shot` / `Sub` is held; the Double pair (and the Tail Gun, Vertical, Free Way pairs and the
2-Way volley — M2-03) refires only when both earlier shots are gone; the Twin Laser fires a pair
while two more beams fit under its cap. Shots ride the camera and die on terrain and outside the
view ± 16 px (a Spread Bomb's blast is world-anchored). In Direct mode (M2-05) a level's volley
fires each weapon's group of `n` shots all or nothing while `live + n ≤ volleys × n` (the level's
`volleys`, else the weapon's `cap`), each shot from its emitter's offset in its heading; a volley
that fired restarts its timer with the level's `refireTicks` (else the config's interval).

### `options` — Options (implemented)

The Options of meter mode: the standard trail (M1-10) and, since M2-04, the Snake, Formation and
Rotate types (`GameConfig.optionChoice`). The Option Hunter that steals them is an enemy
(`core/enemies`); option recovery after death arrives with M3. Guides:
[weapons-and-options.md](weapons-and-options.md#options-coreoptions) (the trail),
[options-shields-hunter.md](options-shields-hunter.md#option-types-coreoptions) (the types).

| Export | Kind | Summary |
|---|---|---|
| `OptionGroup` | class | One ship's Options: `count` (flying this tick), `formation` (the type's name) and `mode` (its `OptionMode` code), `stolen` (Options hunters took from it — M2-04), `head`, `trailX` / `trailY` (screen-space ring of 49), M2-04: `spreadTicks` (0 retracted … 12 spread), `toggled` (a `Special` press put them out), `holdTicks` (`PowerUp` held, 0–15), `angle` (the Rotate orbit, binary units), `snakeX` / `snakeY` (screen-space Snake links); `x` / `y` (world positions of Option `k < count`); `setFormation(formation)` (cold path — an unknown name is `'trail'`), `reset(ship, camera)` (every trail entry, Snake link and Option on the ship; retracted, toggle / hold cleared, angle 0), `steer(intent)` (M2-04, phase 2 before `follow`: `Special` pressed flips `toggled`, `PowerUp` held ≥ 15 ticks extends, `spreadTicks` steps towards out / in), `follow(ship, camera, count, record)` (records the ship's screen position when `record` — under every type —, then places `count` Options by the type: trail `(k + 1) × 12` records back; Snake links pulled to `SNAKE_LINK` px of their leader; Formation `>` → `V` offsets by the spread; Rotate an even orbit turning 12 units per call at radius 20 → 40; `count` clamped 0–4), `hide()` (`count` 0) — none allocates |
| `createOptionGroup(formation = 'trail')` | function | → an empty group of that type (zeroed trail — `reset` it when the ship spawns); the weapon system passes `config.optionChoice` |
| `OptionFormation` | type | = `config` `OptionChoice`: `'trail' \| 'snake' \| 'formation' \| 'rotate'` |
| `OptionMode`, `OPTION_MODE_NAMES` | const + type, const | M2-04: `Trail 0, Snake 1, Formation 2, Rotate 3` (= `OPTION_CHOICES` order — hashed: append, never renumber); the names by code |
| `MAX_OPTIONS`, `OPTION_SPACING`, `OPTION_TRAIL_CAPACITY` | const | `4` (D5); `12` recorded steps between neighbours; `49` |
| `OPTION_SPRITE`, `OPTION_ANIM_TICKS`, `STOLEN_OPTION_SPRITE` | const | `'options/orb'` (an engine sprite — in `ENGINE_SPRITES`); `8` ticks per pulse frame; M2-04: `'options/stolen'` (grey — carried by a hunter, or drifting free) |
| `OPTION_RADIUS`, `SNAKE_LINK` | const | M2-04: `4` px (the body a hunter grabs); `16` px per Snake link |
| `FORMATION_RETRACTED`, `FORMATION_SPREAD` | const | M2-04: offsets `[x0, y0, …]` of Options 1–4 — a `>` behind the ship `[-14,-8, -14,8, -26,-14, -26,14]`; a `V` `[-6,-24, -6,24, -16,-44, -16,44]` (frozen) |
| `ROTATE_RADIUS`, `ROTATE_RADIUS_EXTENDED`, `ROTATE_SPEED` | const | M2-04: `20` px, `40` px, `12` binary units per tick |
| `OPTION_HOLD_TICKS`, `OPTION_SPREAD_TICKS` | const | M2-04: `15` (ticks `PowerUp` is held before the Options extend); `12` (ticks to spread or retract) |

The weapon system records the trail only on ticks with movement input (`PlayerShip.moving`, D26)
and on every fly-in tick, resets it on a fly-in's first tick, steers and places the group every
tick the ship is `alive` and hides it while the ship is not.

### `powerups` — power meter, capsules, Direct-mode items, Mega Crash

Meter mode's power-up economy (M1-11): one 7-slot power meter per player, equipping on the
`PowerUp` press, Auto Power-Up, the capsule pool and Mega Crash; since M2-03 the `!` choices and
the `?` choice of the config; since M2-04 the pod shields and Reduce, the blue capsule and the
Options an Option Hunter lets go of; since M2-05 (`implemented`) **Direct mode**: the stage's item
plan, the six colour items, the Speed toggle and the Direct-mode death penalty; since M2-06 the
co-op drop scaling (`coopCredit`). Guides:
[powerups-and-shields.md](powerups-and-shields.md), [coop.md](coop.md#co-op-drop-scaling-corepowerups), [meter-arsenal.md](meter-arsenal.md#the--and--choices-corepowerups),
[options-shields-hunter.md](options-shields-hunter.md), [direct-mode.md](direct-mode.md).

| Export | Kind | Summary |
|---|---|---|
| `createPowerUpSystem(host, stage = null)` | function | → `PowerUpSystem` (load time — `createWorld` calls it with the World as host and its stage): registers the `items` pool (32), one `PowerMeter` per player, the item and shield batches, the compiled Auto Power-Up order, the session's `choices` (M2-03), the sprite ids and (M2-05) the Direct-mode item plan (the stage's `directItems`, else `DEFAULT_DIRECT_ITEM_PLAN`); throws `Error` when `items` is already registered |
| `PowerUpSystem` | interface | `pool` (`SoaPool<ItemSchema>`), `itemBatch` (`Items`, 32), `shieldBatch` (`Player`, 2 — drawn over the ships), `meters`, `megaPending` (`Uint8Array`, hashed), `outcomes`, `dropsTaken` (hashed), `count`, `maxSpeedLevel` (`speeds.length − 1`), `choices` (M2-03: the session's `MeterChoices`), M2-05: `direct` (`powerUpMode === 'direct'`), `plan` (`Uint8Array` of `DIRECT_ITEMS` indices), `planCursor` (items handed out — hashed; the next is `plan[planCursor % plan.length]`, cycling, never rewound by a checkpoint), M2-06: `coopCredit` (the co-op drop scaling credit — while two ships are in play, active and not out, every capsule / power-up drop adds `config.coopExtra` and each whole credit drops one more item `COOP_EXTRA_OFFSET` px below — a capsule, or the plan's next item in Direct mode; hashed, never reset); `spawnItem(kind, x, y)` → slot or `-1` (bad kind, full pool); `canEquip(player, slot)`, `equippable(player)` → bit mask (bits 0–6; 0 for a bad player), `nextAutoSlot(player)` → `MeterSlot` or `-1`, `equipHighlighted(player)` → equipped (else `SFX PowerUpDenied`; the cursor stays; `!` arms Mega Crash only when that is the `!` choice), `collect(player)` → new cursor (a capsule's effect: advance, ding, Auto Power-Up), `detonateMegaCrash(player)` → enemies destroyed, M2-04: `clearScreen(player)` → enemies destroyed (the blue capsule: `enemies.clearOnScreen`, Mega Crash's flash and SFX, no bullet cancel, the meter untouched), `regainOption(player)` → added (a freed Option: one more Option — `SFX PowerUpEquip` + a `PowerUp` event — or, at four, only the ding), M2-05: `collectDirect(player, item)` → changed (a colour item's effect — red `shot + 1` / green `sub + 1` up to the family's top, blue `collectArm`, orange +1 life up to 9 with `ExtraLife`, yellow `detonateMegaCrash` (no boss damage), octagon the next main family with the level capped; every pickup `SFX CapsulePickup`, a change `SFX PowerUpEquip` (not orange / yellow) and `SimEventKind.PowerUp` `DIRECT_POWER_UP_EVENT_BASE + item`; a bad player or item index does nothing, no cue), `dropDirect(x, y)` → item slot or `-1` (the plan's next colour, drifting by `DIRECT_ITEM_DRIFT` pair `cursor & 1`; the cursor advances even on a full pool); the World's per-phase `updatePlayers()` (2: pressed `PowerUp` edge of active, not `dying` / `dead` ships — in Direct mode the `Speed` press instead: the next of the ship's speeds, wrapping, with the `MeterAdvance` ding (M2-05) —, then their shield pods placed — M2-04), `beginTick()` (3: late drops → capsules — in Direct mode `capsule` and `powerup` drops → `dropDirect`), `update()` (5: age, magnet, cull; freed Options and — M2-05 — Direct-mode items drift with the view, bounce off the playfield's top / bottom and expire), `collide()` (6: pickups), `resolve()` (7: collect — capsule, blue capsule, freed Option, colour item —, Mega Crash, shield i-frames / spin and events, drops → items), `sync()` (9), `clear()` (session clear: checkpoint restart, `arcade` respawn) — none allocates |
| `PowerUpHost` | interface | What the system reads from its World: `tick`, `config`, `camera`, `players`, `intents`, `ship` (`speeds`, `pickupBox`), `content`, `events`, `fx` (M1-12: Mega Crash's flash goes through `core/fx` `requestFlash`), `pools`, `enemies` (`outcomes`, `megaCrash(by)`, M2-04 `clearOnScreen(by)`), `bullets` (`cancelAll(mode)`), `weapons` (`loadouts`, M2-04 `freeWayHeading?` — where a Free Shield pair attaches; M2-05 `mainFamilies?` / `subFamily?` — the red / green caps and the octagon's cycle) |
| `PowerUpOutcomes` | interface | The last collision phase's pickups (reset in phase 6): `pickupCount`, `pickupPlayer` (`Int8Array`), `pickupKind`, `pickupX`, `pickupY`, `pickupScore` (300 per capsule, blue capsule or colour item, 0 for a freed Option — credited by `core/scoring` in phase 7, M1-12) |
| `PowerMeter`, `createPowerMeter()` | class, function | `{ cursor }` — `-1` (nothing highlighted) or a `MeterSlot`; → a meter with nothing highlighted |
| `advanceMeter(meter)` | function | One capsule: `-1 → Speed`, …, `! → Speed` (wraps; any cursor that is not a slot, `NaN` included, → Speed) → the new cursor |
| `canEquipSlot(slot, ship, loadout, maxSpeedLevel, choices = DEFAULT_METER_CHOICES)`, `equipSlot(…)` | function | Greyed rules: Speed at the top level, Missile owned, Double / Laser already the main weapon, Option at 4, `?` unless `canGrantShield` (a shield is up — M2-04: a Free Shield stays equippable while a pair fits or a pod is worn), `!` by its choice (M2-03: Mega Crash never, NORMAL on the basic shot, SPEED DOWN at level 0, LIFE OPTION without a spare ship or room, FULL BARRIER at full strength), unknown codes → `false`; applies a slot's effect when allowed (Double / Laser exclusive; `?` = `grantShield(choices.shield, heading)` — the Free Shield's pair at the player's last 8-way direction; `!` = the choice's effect — Mega Crash has none, the caller detonates it) → equipped. `ship` is a `MeterShip` |
| `equippableSlots(ship, loadout, maxSpeedLevel, choices?)` | function | → bit mask of `canEquipSlot` (the HUD greys the rest, M1-16) |
| `MegaEffect`, `megaEffectOf(choice)` | const + type, function | M2-03: `MegaCrash 0, Normal 1, SpeedDown 2, LifeOption 3, FullBarrier 4` (= `config` `MEGA_CHOICES` order); a `MegaChoice` → its code (Mega Crash for an unknown name) |
| `MeterChoices`, `DEFAULT_METER_CHOICES`, `meterChoicesOf(config)` | class, const, function | M2-03: `{ mega: MegaEffect, shield: ShieldSpec }`; Mega Crash + the Force Field (frozen); → a fresh one from `megaChoice` / `shieldChoice` (load time) |
| `MeterShip` | type | M2-03: what the meter reads and changes — `Pick<PlayerShip, 'speedLevel' \| 'shield'>` + optional `lives` (LIFE OPTION) |
| `lifeOptionCount(ship, loadout)` | function | M2-03 → the Options a LIFE OPTION would make now: `min(lives − 1, 4 − options)`, never below 0 (`lives` missing = no spare ship) |
| `meterSlotOf(name)` | function | `MeterSlotName` → `MeterSlot` code (`-1` for an unknown name) |
| `applyDirectDeathPenalty(preset, ship, loadout)` | function | M2-05 (D6 for the direct ship) — every preset takes the Arm (`clearShield`); `'arcade'` levels 0 and family 0; `'classic'` one main-shot level, else one sub-weapon level; `'casual'` nothing more; the speed level stays → `0` (a shot level taken), `1` (a sub level), `-1` (nothing / another preset). Never allocates |
| `directMaxLevel(family)` | function | M2-05 → a family's top level: `levels.length − 1`, at most `DIRECT_MAX_LEVEL` (0 for `null` / `undefined`) |
| `DEFAULT_DIRECT_ITEM_PLAN`, `DIRECT_POWER_UP_EVENT_BASE` | const | M2-05: the 17-entry plan of a stage without `directItems` (red and green a level for every two blue, an octagon, a yellow, an orange); `16` — a Direct item's `PowerUp` event id base (the meter's slot codes stay below) |
| `DIRECT_ITEM_KINDS`, `DIRECT_ITEM_SPRITES`, `directItemKind(item)` | const, const, function | M2-05: the `ItemKind` and the sprite (`items/direct-<colour>`) of each colour in `DIRECT_ITEMS` order; a colour → its `ItemKind` (-1 for an unknown name) |
| `DIRECT_ITEM_SCORE`, `DIRECT_ITEM_TICKS`, `DIRECT_ITEM_DRIFT` | const | M2-05: `300`; `600` (life, blinking the last `ITEM_EXPIRY_BLINK_TICKS`); `[-0.35, -0.3, -0.35, 0.3]` (screen px/tick — slowly left, up or down, bouncing) |
| `applyDeathPenalty(preset, ship, loadout, meter)` | function | What a death costs (M1-12, D6) — called by the World at the death: every preset `clearShield` (no break event); `'arcade'` basic shot, no Missile, no Options, speed 0, cursor `-1`; `'classic'` `loseOneLevel`, cursor kept; `'casual'` nothing more (any other string too) → the `MeterSlot` classic took, else `-1`. A pending Mega Crash is untouched |
| `loseOneLevel(ship, loadout)` | function | Classic penalty: the first of Option (−1) → Double / Laser (→ basic) → Missile → Speed level (−1) the ship has → that `MeterSlot` (`Double` / `Laser` for the main weapon), `-1` when nothing is left |
| `MeterSlot`, `METER_SLOT_COUNT`, `METER_LABELS` | const + type, const | `Speed 0, Missile 1, Double 2, Laser 3, Option 4, Shield 5 (?), Mega 6 (!)`; `7`; `'SPEED' … '?', '!'` (the `hud/meter-labels` frames) |
| `ItemKind`, `ITEM_KINDS`, `ItemKindSpec` | const + type, const, interface | `Capsule 0`, M2-04: `BlueCapsule 1`, `FreeOption 2`, M2-05: `DirectRed 3`, `DirectGreen 4`, `DirectBlue 5`, `DirectOrange 6`, `DirectYellow 7`, `DirectOctagon 8` (hashed: append, never renumber); the built-in table `{ sprite, frames, score }` (capsule: `items/capsule`, 2, 300; blue capsule: `items/capsule-blue`, 2, 300; freed Option: `options/stolen`, 2, 0; colour items: `items/direct-*`, 2, 300) |
| `ItemFlag` | const | `Dead 1` (collected / culled this tick), `Magnet 2` (pulled this tick) |
| `ITEM_SCHEMA`, `ItemSchema` | const, type | Pool fields `x`, `y`, `vx`, `vy` (f64), `kind` (u8), `age` (i32), `flags` (u8) — hashed in sorted order |
| `ITEM_SPRITES`, `CAPSULE_SPRITE`, `BLUE_CAPSULE_SPRITE` | const | The item kinds' sprites (part of `ENGINE_SPRITES`); `'items/capsule'`; `'items/capsule-blue'` (M2-04) |
| `FREE_OPTION_TICKS`, `FREE_OPTION_DRIFT`, `ITEM_EXPIRY_BLINK_TICKS` | const | M2-04: `600` (a freed Option's life); drift velocities `[vx0, vy0, …]` in screen px/tick — the `n`-th Option freed in a tick takes pair `n mod 8` (frozen); `120` (the last ticks an expiring item blinks) |
| `MAX_ITEMS`, `CAPSULE_SCORE`, `ITEM_RADIUS`, `PICKUP_MAGNET_RANGE`, `PICKUP_MAGNET_SPEED`, `ITEM_CULL_MARGIN`, `ITEM_BLINK_TICKS`, `MEGA_CRASH_FLASH_TICKS` | const | `32`; `300`; `5` px; `16` px (beyond the pickup box); `2` px/tick; `32` px (culled outside the view ± this); `8` ticks per blink frame; `12` (the `Flash` param — `core/fx` `FLASH_KIND_TICKS[FlashKind.MegaCrash]` since M1-12) |
| `COOP_EXTRA_OFFSET` | const | M2-06: `12` — px below a power-up drop where the co-op extra item appears |
| `DirectItem` | type | = `core/data` `DirectItemName`: `'red' \| 'green' \| 'blue' \| 'orange' \| 'yellow' \| 'octagon'` (Direct mode, M2-05) |

### `shields` — shields (implemented)

The meter's `?` shields on every ship (`PlayerShip.shield`): the Force Field (M1-11) and, since
M2-04, the front Shield, the Free Shield, the Rotate Shield and Reduce — hit counters, shield-hit
i-frames, visible wear and hit / break records. Two families: **fields** (Force Field, Reduce)
cover the ship through `playerHit`; **pods** (the three others) only stop the enemy bullets and
bodies that touch them. Since M2-05 the Direct mode's **Arm** (a field that also absorbs terrain,
grown through three tiers by blue items). Guides:
[powerups-and-shields.md](powerups-and-shields.md#the-force-field-coreshields),
[options-shields-hunter.md](options-shields-hunter.md#shields-coreshields),
[direct-mode.md](direct-mode.md#the-arm-coreshields).

| Export | Kind | Summary |
|---|---|---|
| `ShieldState`, `createShieldState()` | class, function | One ship's shield: `kind`, `hits` / `maxHits` (a pod shield: the pods' sums), `iFrames` (a field's), `absorbsTerrain`, `hitTick` / `brokeTick` (`-1` = never; a pod's hit / break too), `absorbed` (free i-frame hits included), M2-04: `hurtScale` (1; Reduce ⅓ / ⅔ — read by every hurt-circle test), `podCount` (slots in use, 0–4; a broken pod keeps its slot), `podMaxHits`, `podOrbit`, `spin` (the Rotate Shield's turn), `podHits` / `podAngle` / `podIFrames` (`Int32Array` × 4), `podHitTick`, `podX` / `podY` (world positions, placed in phase 2), M2-05: `tier` (the Arm's, 0–3) and `charge` (blue items counted since the Arm was last lost) — all hashed but the positions; → an empty one |
| `ShieldKind`, `SHIELD_KIND_NAMES` | const + type, const | `None 0, ForceField 1`, M2-04: `Shield 2, FreeShield 3, RotateShield 4, Reduce 5`, M2-05: `Arm 6` (hashed: append, never renumber); `'none', 'forceField', 'shield', 'freeShield', 'rotateShield', 'reduce', 'arm'` |
| `ShieldSpec` | interface | `{ kind, maxHits, iFrames, absorbsTerrain, sprite, wearFrames }` + M2-04 `pods` (0 = a field), `podHits`, `podOrbit`, `hurtSteps` (Reduce 2) |
| `FORCE_FIELD`, `FRONT_SHIELD`, `FREE_SHIELD`, `ROTATE_SHIELD`, `REDUCE`, `SHIELD_SPECS` | const | The Force Field (5 hits, 8 i-frames, no terrain, `shields/force-field`, 4 wear frames); M2-04: the front Shield (2 pods × 14, 13 px out), the Free Shield (a pair per `?`, 14 each, 13 px), the Rotate Shield (2 pods × 14 orbiting at 16 px), Reduce (2 hits, 2 hurtbox steps, `shields/reduce`) — none absorbs terrain (D8); M2-05: `ARM` (a field, 3 hits at its first tier, 8 i-frames, **absorbs terrain**, `shields/arm`, 3 wear frames per tier); specs by kind (`null` for `None`) |
| `grantShield(state, spec = FORCE_FIELD, heading = 0)` | function | A fresh shield: full hits, i-frames reset to 0, replacing whatever was there — except a Free Shield on a standing Free Shield, which **adds** a pod pair at `heading` (binary units; the power-up system passes `WeaponSystem.freeWayHeading`) or, with 4 pods, replaces the most worn pair (the first on a tie). Reduce starts at `hurtScale` ⅓ |
| `refillShield(state, spec, heading = 0)` | function | M2-04 — the `!` choice FULL BARRIER: a standing shield of the spec's kind gets every hit back (every pod slot in use, broken ones included, in place); anything else a fresh one |
| `canGrantShield(state, spec)` | function | M2-04 → whether `?` would change something (it is greyed otherwise): no shield up, or a standing Free Shield (with a Free Shield spec) that has room for a pair or a worn pod |
| `shieldFull(state)` | function | → a shield stands with every hit left (FULL BARRIER is greyed) |
| `shieldSpecOf(choice)`, `SHIELD_CHOICE_SPECS` | function, const | M2-03: a `config` `ShieldChoice` → its `ShieldSpec` (`FORCE_FIELD` for an unknown name) — what `?`, FULL BARRIER and a `'full'` loadout grant; the specs by choice (M2-04: all five) |
| `clearShield(state)` | function | Removes it without a break (no hits, no i-frames, no pods, `hurtScale` 1, the Arm's `tier` and `charge` 0) |
| `collectArm(state)` | function | M2-05 — a blue item: `charge + 1` (at most `MAX_ARM_CHARGE`), the tier `armTierOf(charge)`, the Arm fresh or repaired to `ARM_TIER_HITS[tier]`, `absorbsTerrain`; any other shield is replaced (the count survives only on a standing Arm) → the tier (1–3). Never allocates |
| `armTierOf(charge)`, `armWearFrame(state)` | functions | M2-05 → the highest tier whose `ARM_TIER_BLUE` count is reached (0 for none); → the `shields/arm` frame: `(tier − 1) × ARM_WEAR_FRAMES + shieldWearFrame(state, 3)` (0 without an Arm) |
| `ARM_TIERS`, `ARM_TIER_HITS`, `ARM_TIER_BLUE`, `MAX_ARM_CHARGE`, `ARM_SPRITE`, `ARM_WEAR_FRAMES` | const | M2-05: `3` (Arm green, Super Arm silver, Hyper Arm gold); `[0, 3, 4, 5]`; `[0, 1, 4, 9]` blue items; `99`; `'shields/arm'` (9 frames); `3` |
| `absorbShieldHit(state, terrain, tick)` | function | Called by `playerHit` before a hit reaches the ship → `ShieldHit`: pods up → `None` (pods never cover the ship, M2-04); terrain on a shield without `absorbsTerrain` → `None` (i-frames do not help either); i-frames running → `Blocked` (free); a field up → `Absorbed` (one hit, i-frames start, `hitTick`; Reduce's `hurtScale` grows one step) or `Broke` (the last hit: `brokeTick`, shield removed, `hurtScale` 1, the Arm's `tier` / `charge` 0 — M2-05 —, i-frames keep running); else `None`. Never allocates |
| `absorbPodHit(state, pod, tick)` | function | M2-04 — one pod takes a hit (`core/bullets` / `core/enemies`, after their circle test) → `None` (slot not in use, broken, or not a whole number), `Blocked` (the pod's own i-frames), `Absorbed` (one of its hits, its i-frames start), `Broke` (its last hit; the shield goes with its last standing pod). The other pods are untouched. Never allocates |
| `ShieldHit` | const + type | `None 0, Blocked 1, Absorbed 2, Broke 3` |
| `tickShield(state, tick)` | function | Counts the field's and every pod's i-frames down by one — tick phase 7, not on the hit's own tick (a hit on tick `t` blocks `t + 1 … t + 8`); turns the Rotate Shield by `ROTATE_SHIELD_SPIN` |
| `placeShieldPods(state, ship)` | function | M2-04 — tick phase 2 after the move (and when drawn): `podX` / `podY` of each pod at its angle (+ `spin`), `podOrbit` px from the ship (table trigonometry). Never allocates |
| `shieldActive(state)`, `podActive(state, pod)` | functions | → a kind other than `None` with hits left; → a pod slot in use with hits left (M2-04) |
| `shieldWearFrame(state, frames)`, `podWearFrame(state, pod, frames)` | functions | → `frames − ceil(hits · frames / maxHits)` clamped to `[0, frames − 1]` (0 without a shield): fresh at 5 and 4 hits, then worn, damaged, critical; the same from one pod's hits (0 for a slot not in use — M2-04) |
| `reduceHurtScale(hits, steps = REDUCE_HURT_STEPS)` | function | M2-04 → `(steps + 1 − hits) / (steps + 1)` with `hits` clamped to `[0, steps]`; 1 without steps or hits (⅓ at 2 hits, ⅔ at 1) |
| `FORCE_FIELD_HITS`, `SHIELD_POD_HITS`, `REDUCE_HITS`, `REDUCE_HURT_STEPS`, `SHIELD_HIT_IFRAMES` | const | `5`; M2-04: `14`, `2`, `2`; `8` (D33) |
| `MAX_SHIELD_PODS`, `POD_RADIUS`, `POD_ORBIT`, `ROTATE_POD_ORBIT`, `FRONT_POD_ANGLE`, `FREE_POD_SPREAD`, `ROTATE_SHIELD_SPIN` | const | M2-04: `4`; `4` px; `13` px; `16` px; `64` units off the heading; `96` units between a Free Shield pair's pods; `12` units per tick |
| `FORCE_FIELD_SPRITE`, `FORCE_FIELD_WEAR_FRAMES`, `SHIELD_POD_SPRITE`, `SHIELD_POD_WEAR_FRAMES`, `REDUCE_SPRITE`, `REDUCE_FRAMES`, `SHIELD_SPRITES` | const | `'shields/force-field'`, `4`; M2-04: `'shields/pod'`, `4`, `'shields/reduce'`, `2`; every shield sprite (part of `ENGINE_SPRITES`; M2-05 adds `ARM_SPRITE`) |

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

### `scoring` — scores, extends, continues and the session hi-score (partial)

Per-player scores, the clamp, the session hi-score and the crediting of every scoring event of a
tick (M1-12); extends and the continue digit (M2-01); the scoring rules of `content/rules/` (M2-02). 1UP items arrive with Direct mode (M2-05),
name entry with M2-15; the saved hi-score tables are `save`'s (M1-17). Guides:
[death-and-scoring.md](death-and-scoring.md#score-corescoring),
[difficulty-and-rank.md](difficulty-and-rank.md#extends-corescoring).

| Export | Kind | Summary |
|---|---|---|
| `PlayerScore` | class | `score` (0 … `MAX_SCORE`, + the continue digit), `displayDirty` (set on a change; the HUD clears it), and since M2-01 `nextExtend` (score of the next extra life, 0 = none left — hashed), `extendsEarned`, `continues` (continues used, ≤ 9 — the score's last digit; hashed; since M2-06 also the player's own continue budget — `core/world` `continuesLeft`) |
| `ScoreBoard`, `createScoreBoard(players = MAX_PLAYERS)` | class, function | `scores` (one per player slot), `hiScore`, `hiScoreDirty`, `setHiScore(value)` (a saved best: only raises, floors, caps; dirty only on a real raise) → the hi-score; → a board at 0 |
| `addScore(host, player, points)` | function | The one way scores change: adds `floor(points)`, clamped at `MAX_SCORE` (+ the continue digit, which it keeps — M2-01); ≤ 0 / `NaN` points and bad slots change nothing; marks `displayDirty` and raises the hi-score (marking it dirty) → the score afterwards (0 for a bad slot). Does not check extends. Never allocates |
| `markContinue(board, player)` | function | M2-01 (shmup_feat.md §10): `continues` + 1 (at most 9) written into the score's last digit (12,340 → 12,341), `displayDirty`, the hi-score raised when beaten → the score (0 for a bad slot). Cold path; never allocates |
| `ScoreHost`, `ScoringHost` | interfaces | `{ scoring: { board } }`; + `enemies.outcomes`, `powerups.outcomes`, optional `events` (the World — every credited kill worth ≥ 1 point pushes `SimEventKind.Score` there, M1-14, every extend its `ExtraLife` SFX; absent = no events), and since M2-01 optional `players` (the ships whose `lives` extends raise), `config` (`extendFirst`, `extendEvery`) and `status` (no extends while `'gameOver'`) — without `players` / `config` no extends |
| `ScoringSystem`, `createScoringSystem(host)` | interface, function | `world.scoring`: `board`, `killsScored`, `bonusesScored` (hashed — outcomes already credited); `beginTick()` (phase 3: kills / bonuses recorded between ticks, then reset, then the extends reached), `resolve()` (phase 7: kills → `killBy`, bonuses → `bonusBy`, pickups → `pickupPlayer`, then the extends reached), `clear()` (session clear — scores and extend thresholds stay), `checkExtends()` (M2-01 → lives given: every threshold a score reached moves on by `extendEvery` and gives +1 life up to `MAX_LIVES` with `Sfx ExtraLife` at `SfxPriority.Critical`; nothing while the game is over), `resetExtends()` (every `nextExtend` back to `config.extendFirst`); → a system with every score at 0 and the first thresholds set |
| `MAX_SCORE`, `MAX_LIVES` | const | `99_999_990` (the last digit is kept for continues); `9` (M2-01 — extends stop adding lives there) |
| `ScoringRules`, `DEFAULT_SCORING_RULES`, `MAX_BULLET_CANCEL_POINTS` | interface, const, const | M2-02: the `scoring` section of a `rules` file — `bulletCancel` (points of each bullet cancelled into a point item, credited through `addScore` when the item arrives); the built-in `{ bulletCancel: 10 }` (= `content/rules/scoring.rules.json`); `10_000` (the schema's bound) |
| `HiScoreEntry` | interface | One row of a saved hi-score table (`save` re-exports it and builds rows with `createHiScoreEntry`): `name` (≤ 8 characters, `---` until the name entry of M2-15), `score`, `reached` (a stage id, `''` in open space), `mode` (`1p`; since M2-06 `2p` for either player's score of a co-op game), `difficulty` |

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
(M1-16); the Direct-mode tier pips (M2-05); the co-op HUD (M2-06). Guides: [scenes-and-ui.md](scenes-and-ui.md),
[direct-mode.md](direct-mode.md#the-hud-coreui), [coop.md](coop.md#the-hud-coreui).

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
| `buildHud(world, list, sprites?)` | function | Clears `list` and draws the whole HUD (top bar `1P` / `HI` / `2P` or `------`, stock icons, the 7-slot meter with its flashing highlight and greyed slots — labelled by `meterLabelFrame` since M2-03 —, Force Field pips — in Direct mode (M2-05) the tier pips instead: `SHOT` (one pip per level above 0 of the current family, lit in `HUD_FAMILY_COLORS`), `SUB`, `ARM` (one per hit, in the tier's `HUD_ARM_COLORS`; none without an Arm), `SPD` and the family's `label`); in a co-op game (M2-06) a joinable slot's blinking `PRESS START` on the top bar and, while both ships are active, two 192-px compact halves (stock icon + count, the seven 20-px meter boxes with `METER_SHORT_LABELS` and shield pips — or `SH` / `SB` / `AR` / `SP` pips — and `PRESS START` / `GAME OVER` for an out player); **clears the scores' `displayDirty` and `hiScoreDirty`**; < `HUD_COMMAND_COUNT` commands, string slots 0–3 (meter) / 0–8 (Direct) / 0–21 (co-op — those strings are written only when drawn); never allocates |
| `createHud(sprites?)`, `Hud` | function, class | `Hud { sprites, builds, update(world, list) → rebuilt?, invalidate() }` — `update` compares the dirty flags and, per player (M2-06 — two typed arrays of 12 values each), its `HudPlayerState`, whether it plays, lives, the meter cursor and equippable mask, the shield's hits / max / tier and (M2-05) `shot` / `sub` / `family` and speed level, plus the flash phase (only while a slot is highlighted) and the `PRESS START` blink (only while a prompt shows), and calls `buildHud` only on a change (or a different World / list) |
| `HUD_LAYOUT`, `HUD_COLORS`, `HUD_STRING_SLOTS`, `HUD_METER_FLASH_TICKS` | const | Positions (`p1X` 8, `hiX` 156, `p2X` 292, numbers `+16`, `digits` 8, `stockX` 4 / 10 px / `stockIcons` 5, `meterX` 58, `slotW` 40, `shieldX` 344, `topY` 0, `bottomY` 208; M2-05 Direct mode: `shotX` 58, `subX` 130, `armX` 196, `speedX` 252, `familyX` 306; M2-06 co-op, relative to a half: `halfW` 192, `coopStockX` 2, `coopMeterX` 22, `coopSlotW` 20, `coopShieldX` 164, `coopShotX` 22, `coopSubX` 68, `coopArmX` 114, `coopSpeedX` 148); the bar and label colours (M2-05: `pipOff`, `subPip`, `speedPip`, `pipLabel`; M2-06: `prompt`, `over`, `slotOn`, `slotLit`, `slotOff`); `{ p1: 0, hi: 1, p2: 2, dashes: 3 }` + M2-05 `shot: 4, sub: 5, arm: 6, speed: 7, family: 8` + M2-06 `pressStart: 9, gameOver: 10, shortShot: 11, shortSub: 12, shortArm: 13, shortSpeed: 14, meterShort: 15` (… 21); `8` |
| `HUD_COMMAND_COUNT`, `HUD_STRING_COUNT` | const | `96`, `22` since M2-06 (`64`, `9` in M2-05) — the size a HUD draw list needs (the game scene's `hudList`) |
| `HudPlayerState`, `hudPlayerState(world, slot)` | const + type, function | M2-06: `Playing 0`, `Join 1` (a co-op slot that may drop in), `Continue 2` (out, may continue), `Out 3` (out for good), `Absent 4` (no ship, no way in); → one player's state (`core/world` `playerCanJoin`'s rule repeated — `core/world` imports `core/ui`), `Absent` for a slot the World lacks; never allocates |
| `METER_SHORT_LABELS`, `HUD_PROMPT_BLINK_TICKS` | const | M2-06: two letters per `METER_LABEL_FRAMES` entry for the co-op halves (`SP MS DB LS OP ? ! SB 2W TP TL VT FW RP CY TW`); `32` — the `PRESS START` blink's half period |
| `HUD_FAMILY_COLORS`, `HUD_ARM_COLORS` | const | M2-05: the lit `SHOT` pips per main family (index = `Loadout.family`, wrapping): Beam → Disc orange `0xf87838`, Laser → Wave blue `0x58b8f8`; the `ARM` pips per tier − 1: green, silver, gold |
| `METER_LABEL_FRAMES`, `meterLabelFrame(world, slot)` | const, function | M2-03: the 16 `hud/meter-labels` frames by label (`SPEED` … `!`, then `SPREAD`, `2-WAY`, `TORPEDO`, `TAIL`, `VERTICAL`, `FREE WAY`, `RIPPLE`, `CYCLONE`, `TWIN`); → the frame a slot shows in a World: MISSILE / DOUBLE / LASER the label of the arsenal's weapon in that role (`core/weapons` `WEAPON_BEHAVIOR_LABELS`; the slot's own for an empty role or an unlabelled behaviour), every other slot its own — never allocates |
| `UI_SPRITES`, `UiSprites`, `resolveUiSprites(content)` | const, interface, function | `hud/life`, `hud/life@p2` (player 2's stock icon, M2-06), `hud/meter-slot` (frames normal / highlighted / disabled), `hud/meter-labels` (the 7 slot labels, then the Types B–D weapon names — 16 frames since M2-03), `ui/logo` — part of `ENGINE_SPRITES`; → `{ life, lifeP2, meterSlot, meterLabels, logo }` ids, `-1` for a sprite the content lacks (drawn as rectangles / text instead) |
| `TextMetrics` | type | Re-exported from `presentation` |

### `scenes` — scene stack and the M1 flow (partial)

The scene stack and the M1 scene set (M1-16), the Options screen and the saved hi-scores in the
flow (M1-17), the difficulty menu and the continue countdown (M2-01), the weapon select with its
live preview and the Auto Power-Up order editor (M2-03), the ship select (M2-05), `1 PLAYER` /
`2 PLAYERS` and the co-op rules (M2-06). Guides:
[scenes-and-ui.md](scenes-and-ui.md), [saves-and-options.md](saves-and-options.md), [coop.md](coop.md#the-scene-flow-corescenes-and-gameinputseats),
[direct-mode.md](direct-mode.md#the-ship-select-corescenes),
[difficulty-and-rank.md](difficulty-and-rank.md#the-difficulty-menu-difficultyscene),
[meter-arsenal.md](meter-arsenal.md#the-weapon-select-corescenes).

| Export | Kind | Summary |
|---|---|---|
| `createSceneStack()`, `SceneStack` | function, class | Depth `SCENE_STACK_DEPTH` (8): `depth`, `top`, `pending`, `revision`, `capacity`, `sceneAt(i)` (0 = bottom — not `at()`: the Chrome-69 lint rule rejects any `.at(` call), `contains(scene)`, `push` / `pop` / `replace` / `reset(scene)` (deferred while a scene ticks, applied in request order at the end of the tick — also those the hooks request — at once otherwise), `tick(input)` (the top scene only, then `flush()`), `flush()`. Throws `RangeError` on a full stack, a scene already on it, more than 8 requests in one tick or a runaway chain (> 64); never allocates |
| `Scene` | interface | `id`, `overlay` (the scene below stays drawn, frozen), `inputContext` (`'game'` / `'menu'`), `dim` (0…1 under the UI), `uiRevision` (bumped when `drawUi` would draw something else), `enter()`, `exit()`, `cover()`, `uncover()`, `tick(input)`, `drawUi(list)` |
| `SceneId` | type | `'boot' \| 'title' \| 'game' \| 'pause' \| 'stageClear' \| 'gameOver' \| 'confirm' \| 'difficulty' \| 'continue'` (the last two M2-01) \| `'weaponSelect' \| 'autoOrder'` (M2-03) \| `'shipSelect'` (M2-05) plus the named M2 screens (`'attract'`, `'select'`, `'map'`, `'options'`, `'nameEntry'`, `'hiScore'`, `'ending'`, `'credits'`) |
| `createSceneFlow(host, start = 'boot')` | function | → `SceneFlow`, started on `'boot'` / `'title'` / `'game'` (`SceneStart`). Creates every scene, menu and draw list and the game scene's placeholder World (then **clears `host.events`**); throws `RangeError` if the scenes need more than 192 UI string slots (160 before M2-05, 96 before M2-03), or what `host.createWorld()` / `withDifficulty` throws. Builds one config per difficulty preset (the host's for its own preset, `withDifficulty` of it with the content's `rules` table — or the built-in one — for the others) and each power-up mode's and preset's session hi-score from the save's tables (M2-01; per mode since M2-05), and the ship select's ships (the content's, `DEFAULT_PLAYER_SHIP` without any — M2-05). `createGame(…, { scenes })` calls it |
| `SceneFlowHost` | interface | `config`, `content`, `events`, `exit` (`platform.exit` or `null` — no EXIT item, Back on the title only backs out), `createWorld(config?)` (a fresh World pushing into `events`; `config` = the chosen difficulty's — omitted = the host's, M2-01), `save?` (a `SaveStore`; omitted / `null` = memory-only with the defaults — M1-17), `inputProfiles?` (`InputProfileSetup`; omitted / `null` = CONTROLS disabled — M1-17) |
| `InputProfileSetup` | interface | `{ choices: InputProfileChoice[], active: string \| null }` — the profiles CONTROLS steps through, in order, and the id in use (`null` / unknown → the first choice is shown) (M1-17) |
| `SceneFlow` | interface | `stack`, the thirteen scenes (`boot`, `title`, `game`, `pause`, `stageClear`, `gameOver`, `confirm`, `options`, since M2-01 `difficultyMenu`, `continueScreen`, since M2-03 `weaponSelect`, `autoOrder`, since M2-05 `shipSelect`), `save` (the host's store or a memory-only one), `modeKey` (`hiScoreModeKey(gameConfig)` — the table the next game goes into, one per power-up mode and difficulty), `difficulty` (M2-01: the preset of the next game — the host config's until one is chosen under START), `gameConfig` (M2-01: the config the next game's World gets — since M2-03 with the weapon select's loadout, `withArsenal`, since M2-05 with the ship select's ship, `withShip`), `arsenal` (M2-03: the `ArsenalChoice` of the last START, `{}` before), M2-05: `ship` (the `ShipChoice` of the ship select, `null` before — the host config's ship flies), `ships` (what it offers), `inputProfiles` (the choices, `[]` = CONTROLS disabled), `activeInputProfile` (index of the profile in use, −1 = none of them; changed by the Options screen), `inputContext`, M2-06: `coop` (the title's choice — the next games are co-op ones) and `inputSeats` (`2` while the game scene or the continue countdown is on top with a `config.coop` World, else `1` — `Game.inputSeats` returns it), `world` (the game scene's), `menuInput` (every player merged, reused), `hiScore` (the session's best for the chosen difficulty — and, since M2-05, the chosen ship's power-up mode), `view` (`SceneFlowView`), `tick(input)`, `updateFrame()` (once per displayed frame: World view + HUD while the game is visible — the weapon select's preview view, no HUD, while that screen is visible (M2-03) —, the top dim, the UI list rebuilt only when the visible set or a `uiRevision` changed), `setBootProgress(fraction, label?)`, `finishBoot()`, `onResume()` (pause menu over a running game), `setHiScore(value)` (raises the chosen difficulty's and mode's; floored, capped at `MAX_SCORE`). Each session hi-score starts from the save's best of its table (M1-17; per difficulty since M2-01, per power-up mode and difficulty since M2-05) |
| `SceneFlowView` | interface | `tick`, `world` (`WorldView \| null` — the game's, or since M2-03 the weapon select's preview), `hud`, `ui`, `dim` — what `Game.renderFrame()` copies |
| `SceneStart` | type | `'boot' \| 'title' \| 'game'` |
| `BootScene` | class | `progress`, `label`, `done`; holds until `finishBoot()`, then the title |
| `TitleScene` | class | `menu` (`1 PLAYER` / `2 PLAYERS` — M2-06; `1 PLAYER` was START before — / OPTIONS — the Options screen, enabled since M1-17 / EXIT only with `platform.exit`), `phase` (0 `PRESS OK`, 1 menu), `menuOpen`; the logo, a 32-tick blink, the chosen difficulty's session hi-score (from the save's best), the title music; `1 PLAYER` / `2 PLAYERS` choose the player count (`choosePlayers` — every difficulty's config `withCoop`, M2-06) and push the `DifficultyScene` (M2-01 — before, START replaced the title with the game); Back → the exit confirmation, or (no exit) back to `PRESS OK` |
| `GameScene` | class | `world`, `hud`, `hudList` (`HUD_COMMAND_COUNT` commands, `HUD_STRING_COUNT` strings — M2-05), `starts`, `restart()` (also counts `gamesStarted` in the save — M1-17); `inputContext` `'game'`; Pause / Back (any player, read per player since M2-06) → pause menu — except a co-op player's `JOIN_ACTIONS` press while it may join (`playerCanJoin`: the World joins it instead); each start creates the World with `flow.gameConfig` (M2-01); opens stage clear `STAGE_CLEAR_DELAY_TICKS` / game over `GAME_OVER_DELAY_TICKS` World ticks after the status changed — for a game over with continues left (`core/world` `canContinue`) the `ContinueScene` instead (M2-01); draws the boss WARNING band |
| `PauseScene` | class | Overlay, dim `PAUSE_DIM`: `menu` (RESUME / OPTIONS — the Options screen over the frozen game, M1-17 / RETRY STAGE / QUIT TO TITLE); Pause / Back / RESUME resume, RETRY restarts without a confirmation, QUIT asks |
| `OptionsScene` | class | Overlay, dim `PAUSE_DIM`, an opaque 288×128 panel (M1-17; taller since M2-02): `master`, `music`, `sfx` (`Slider`s 0–10, step 1), `controls` (`Choice` of the profile labels, `DEFAULT` alone and disabled without profiles), `bullets` (M2-02: `Choice` of `BULLET_PALETTE_LABELS`), `menu`; `enter()` reads the save's volumes, bullet palette and the profile in use, focus MASTER, 2-tick lock; a change pushes a `UserOption` event at once (`MasterVolume` / `MusicVolume` / `SfxVolume` = level, `InputProfile` = choice index, `BulletPalette` = `BULLET_PALETTES` index) with the move sound; OK on a slider is silent; BACK / Back store the levels, the bullet palette and — when CONTROLS changed — the profile id (`save.setOptions`), `save.flush()`, `MenuBack`, pop |
| `StageClearScene` | class | Overlay (dim 0.25): `phase`, `ticks`, `rank` (player 1's place in the saved table, −1 = not entered); `enter()` records the run (every active player's score — rows with the mode `2p` in a co-op game, M2-06 —, `stagesCleared`, flush — M1's run ends here); the tally shows `1P` / `2P` scores once player 2 has joined (M2-06); tally `STAGE_CLEAR_TALLY_TICKS` → `TO BE CONTINUED` `STAGE_CLEAR_CONTINUED_TICKS` → title; OK skips |
| `GameOverScene` | class | Overlay (dim 0.35): `ticks`, `rank`; `enter()` records the run (scores, `gameOvers`, flush) and the panel shows `NEW HI-SCORE` below it when `rank` (player 1's) is 0 — and both players' scores (`1P` / `2P`) once player 2 has joined (M2-06); OK / Back after `GAME_OVER_LOCK_TICKS`, or `GAME_OVER_TIMEOUT_TICKS` → title |
| `DifficultyScene` | class | M2-01 (shmup_feat.md §16): overlay, dim `PAUSE_DIM`, an opaque 176×112 panel — `DIFFICULTY`, `menu` (EASY / NORMAL / HARD / ARCADE), the focused preset's `LIVES`, `CONTINUES` and `HI`; `focused` (the preset under the cursor); `enter()` focuses the difficulty chosen last, 2-tick lock; Up / Down move (wrap, repeat); OK → `MenuSelect`, the preset chosen, the `ShipSelectScene` pushed (M2-05; with a single ship in the content the `WeaponSelectScene` instead — M2-03 —, or the game at once for a Direct-mode config); the `HI` is the chosen ship's mode's (M2-05); Back → `MenuBack`, pop to the title menu; `uncover()` re-locks the menu for 2 ticks |
| `WeaponSelectScene` | class | M2-03 (shmup_feat.md §16, §7A): a full screen (not an overlay) — a panel on the left with `menu` (`WeaponSelectItem` order), `type` (`Choice`: the presets `TYPE A` … then `EDIT` when every slot has a weapon; `DEFAULT` without presets), `missile` / `double` / `laser` (`Choice`s of `weaponsOfSlot` labels — disabled unless `editing`), `option` (M2-04: a `Choice` of `OPTION_CHOICE_LABELS`), `shield` / `mega` (`Choice`s of `SHIELD_CHOICE_LABELS` / `MEGA_CHOICE_LABELS`), `auto` (`Toggle`), ORDER (the `orderLabel` summary) and START; `orderSlots` / `orderLength` (the Auto order as `MeterSlot` codes), `editIndex`, `editing`, `preview` (the live preview's private `World` while open, else `null`); `enter()` focuses START (2-tick lock) and creates the preview, `exit()` drops it; `setOrder(slots)` (the editor's DONE), `arsenal()` → the `ArsenalChoice` (allocates — START only); Left / Right / OK change a value, OK on ORDER pushes `AutoOrderScene`, OK on START → `flow.chooseArsenal(arsenal())` and the stack reset to the game, Back pops to the ship select (M2-05; the difficulty menu when it was skipped). The preview flies `WEAPON_RANGE_STAGE` with its own event queue (cleared every tick) and god mode, the chosen weapons (`setArsenal`), the Missile, `PREVIEW_OPTIONS` Options of the chosen type (M2-04: `setFormation` on its group; while OPTION is focused a `Special` press every `PREVIEW_SPREAD_TICKS` spreads / retracts them), the ship held at `PREVIEW_SHIP_X` and weaving — ticking allocates nothing (the range's spawns create their coroutines) |
| `ShipSelectScene` | class | M2-05 (shmup_feat.md §5, §17): overlay, dim `PAUSE_DIM`, an opaque 208×136 panel — `SHIP SELECT`, `menu` (the flow's ships by name, wrapping), the `focused` ship's picture (frame 0 of its sprite), its model (`SHIP_MODE_LABELS`) and three hints (`SHIP_MODE_HINTS`), `OK: CHOOSE`; `enter()` focuses the ship chosen last (at first the host config's `shipId`), 2-tick lock; Up / Down move; OK → `MenuSelect`, `chooseShip` (every difficulty's config `withShip` — the ship's id and `mode`), then the `WeaponSelectScene` for a meter ship or the stack reset to the game for a Direct-mode one; Back → `MenuBack`, pop to the difficulty menu; `uncover()` re-locks for 2 ticks; `stringSlots` 6 + the menu's |
| `SHIP_MODE_LABELS`, `SHIP_MODE_HINTS` | const | M2-05, in `POWER_UP_MODES` order: `POWER METER`, `DIRECT ITEMS`; three hint lines each (`CAPSULES MOVE THE METER` … / `COLOUR ITEMS POWER UP`, `BLUE: THE ARM SHIELD`, `CH-: SPEED TOGGLE`) |
| `AutoOrderScene` | class | M2-03: overlay (dim 0.35), a panel on the right — `entries` (`AUTO_ORDER_ROWS` `Choice`s of `AUTO_ORDER_LABELS`), `menu` (the rows, then DONE); `enter()` shows the weapon select's order (rows past its length `-`), focus row 1, 2-tick lock; DONE or Back store the rows that are not `-` — entries past the rows kept after them — through `setOrder`, `MenuBack`, pop |
| `ContinueScene` | class | M2-01 (shmup_feat.md §10, §17): overlay (dim 0.35), red-edged panel — `CONTINUE?`, `seconds` (9 … 0), `CREDITS` = continues left; `ticks`; `enter()` fades the music out; a `MenuMove` on every second; after `CONTINUE_LOCK_TICKS` an OK press → `continueWorld(game.world, who)` (M2-06: in a co-op game `who` = the players whose OK was pressed on that tick, each with its own continues, and the panel shows `1P` / `2P` credits — `continuesLeft` — once player 2 has joined; in a one-player game any controller's OK), `MenuSelect`, pop; Back → `MenuBack` and the game-over screen; after `CONTINUE_COUNTDOWN_TICKS` → the game-over screen (which records the run) |
| `ConfirmDialog` | class | Overlay, dim `PAUSE_DIM`: `prompt` (`Confirm`), `purpose`, `prepare(purpose)`; YES on `Exit` pops, then `host.exit()`; YES on `QuitToTitle` resets to the title; NO / Back close |
| `WeaponSelectItem` | const | M2-03 / M2-04: `Type 0, Missile 1, Double 2, Laser 3, Option 4` (M2-04), `Shield 5 (?), Mega 6 (!), Auto 7, Order 8, Start 9` — M2-04 moved `?` … START up by one |
| `MEGA_CHOICE_LABELS`, `SHIELD_CHOICE_LABELS`, `OPTION_CHOICE_LABELS`, `WEAPON_EDIT_LABEL` | const | M2-03: `MEGA CRASH`, `NORMAL`, `SPEED DOWN`, `LIFE OPTION`, `FULL BARRIER` (`MEGA_CHOICES` order); `FORCE FIELD`, M2-04: `SHIELD`, `FREE SHIELD`, `ROTATE`, `REDUCE` (`SHIELD_CHOICES` order); M2-04: `TRAIL`, `SNAKE`, `FORMATION`, `ROTATE` (`OPTION_CHOICES` order); `'EDIT'` |
| `AUTO_ORDER_ROWS`, `AUTO_ORDER_LABELS` | const | M2-03: `12`; `SPEED`, `MISSILE`, `DOUBLE`, `LASER`, `OPTION`, `?`, `!`, `-` (no entry — `METER_SLOT_NAMES` order, then none) |
| `WEAPON_RANGE_STAGE`, `PREVIEW_SHIP_X`, `PREVIEW_WEAVE_TICKS`, `PREVIEW_OPTIONS`, `PREVIEW_SPREAD_TICKS` | const | M2-03: `'weapon-range'` (free flight when the content lacks it); `232`; `160`; `2`; M2-04: `90` (ticks between the preview's spread / retract toggles while OPTION is focused) |
| `ConfirmPurpose`, `TitleItem`, `PauseItem`, `OptionsItem` | const + type, const, const, const | `Exit 0`, `QuitToTitle 1`; `Start 0` (1 PLAYER), `TwoPlayers 1`, `Options 2`, `Exit 3` (M2-06 — `Options` was 1, `Exit` 2); `Resume 0`, `Options 1`, `Retry 2`, `Quit 3`; `Master 0`, `Music 1`, `Sfx 2`, `Controls 3`, `Bullets 4` (M2-02), `Back 5` (was 4 before M2-02) |
| `BULLET_PALETTE_LABELS` | const | M2-02: the BULLETS labels in `BULLET_PALETTES` order — `STANDARD`, `DEUTERANOPIA`, `PROTANOPIA`, `TRITANOPIA` |
| `mergeMenuInput(snapshot, out)` | function | → `out` = the OR of every player's `held` / `pressed` / `released`, player 1's device; never allocates |
| `SCENE_STACK_DEPTH`, `STAGE_CLEAR_DELAY_TICKS`, `GAME_OVER_DELAY_TICKS`, `GAME_OVER_TIMEOUT_TICKS`, `GAME_OVER_LOCK_TICKS`, `STAGE_CLEAR_TALLY_TICKS`, `STAGE_CLEAR_CONTINUED_TICKS`, `PAUSE_DIM`, `CONTINUE_COUNTDOWN_TICKS`, `CONTINUE_LOCK_TICKS` | const | `8`, `90`, `30`, `600`, `30`, `240`, `240`, `0.5`, `600` (10 s — M2-01), `30` (M2-01) |

### `save` — versioned saves, hi-score tables

The persisted save (M1-17): options, hi-score tables and stats as one versioned JSON document
under `Platform.storage`, with migrations, defensive parsing and write-on-change. Pure — the
storage comes in as a `PlatformStorage`. Guide: [saves-and-options.md](saves-and-options.md).

| Export | Kind | Summary |
|---|---|---|
| `SaveData` | interface | `{ version, options: UserOptions, hiScores: Record<modeKey, HiScoreEntry[≤ 10]>, stats: SaveStats }` — frozen; `options.display.bulletPalette` since M2-02 (still version 1: an older `display: {}` resolves to `standard`) |
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
| `hiScoreModeKey(config)` | function | → `<powerUpMode>-<difficulty>` (`'meter-normal'` in M1; since M2-01 each difficulty has its own table: `meter-easy`, `meter-normal`, `meter-hard`, `meter-arcade`; since M2-05 the Direct-mode MANTA's games go into `direct-easy` … `direct-arcade`; a co-op game — M2-06 — plays into the same tables, its rows with the mode `2p`) |
| `SaveStore`, `createSaveStore(storage, loaded?)` | class, function | The document the game plays with: `storage` (`null` = memory only), `data`, `options`, `dirty` (serialises — not for hot paths), `writes`; `setOptions(options)` (sanitised), `hiScores(modeKey)` (empty table when none), `bestScore(modeKey)`, `recordScore(modeKey, entry)` → rank or −1 (bad mode key, a 33rd table, not entered), `count(stat)` (stops at 2³¹−1) — all in memory until `flush()` → `Promise<boolean>` (writes only when the canonical text differs from the stored one; `true` = written; never rejects; a failed write makes the next flush write). `createSaveStore` counts the loaded text as stored only for status `'ok'` |

### `replay` — recording, playback and desync detection

Implemented with M1-19 (`shmup_feat.md` §21). Guide:
[debug-and-replays.md](debug-and-replays.md#replays-corereplay).

| Export | Kind | Summary |
|---|---|---|
| `createReplayHeader(config, { buildId?, checkpoint?, assisted? })` | function | → frozen `ReplayHeader` (`buildId` default `'dev'`, `checkpoint` −1, `assisted` false); throws `RangeError` for a checkpoint that is not an integer ≥ −1 |
| `ReplayHeader`, `ReplayHeaderOptions` | interfaces | `formatVersion`, `buildId`, `seed`, `config` (the whole resolved `GameConfig` — since M2-01 with every difficulty-preset value, so a replay does not depend on the content's `rules` table), `stageId`, `checkpoint`, `loadout`, `assisted` (god mode for the whole run); the options above |
| `Replay` | interface | `header`, `ticks`, `inputs` (`MAX_PLAYERS` `Uint32Array`s of `held \| pressed << 16`), `hashInterval`, `hashes` (after ticks `k · interval`), `finalHash` |
| `packReplayInput(held, pressed)` | function | → `(held & 0xffff) \| (pressed & 0xffff) << 16`, unsigned |
| `createReplayRecorder(source, header, { capacity?, hashInterval? })` | function | → `ReplayRecorder` (a `PlatformInput` wrapping `source`): `poll()` records every player's masks and returns the source's snapshot; `check(world)` after every tick (stores `hashWorld` on interval ticks); `finish(world)` → the `Replay` (throws `Error` when a periodic hash is missing); `header`, `ticks`. Preallocates `capacity` ticks (36,000), doubles beyond; throws `RangeError` for a non-positive capacity / interval |
| `RecorderOptions`, `ReplayRecorder` | interfaces | Above |
| `createPlayback(replay, { buildId? })` | function | → `ReplayPlayback` (a `PlatformInput`): `poll()` → the next recorded tick (*reused* snapshot, `released` derived, device `'none'`, idle after the end); `check(world)` compares hashes on interval ticks and after the last; `replay`, `ticks`, `done`, `report` |
| `ReplayPlayback`, `PlaybackOptions`, `DesyncReport` | interfaces | `DesyncReport { ok, checked, desyncTick (−1), expectedHash, actualHash, finished, buildMatches (null without a build id) }` — the first mismatch is kept |
| `createReplayGame(platform, header, content)` | function | → the `Game` the header describes (bare gameplay, `debug.godMode = assisted`, `jumpToCheckpoint` for a checkpoint ≥ 0) — the same setup for recording and playback; throws `RangeError` for a bad config, unknown stage or missing checkpoint |
| `playReplay(replay, content, options?)` | function | Plays a whole replay headless → `ReplayRun { report, game }` |
| `ReplayRun` | interface | Above |
| `encodeReplay(replay)`, `decodeReplay(data)` | functions | ↔ `ReplayJson { kind: 'replay', header, ticks, hashInterval, inputs (base64 RLE per player), hashes, finalHash }`; `decodeReplay` validates everything and throws `RangeError` naming the problem (extra top-level fields ignored, unknown config keys dropped, missing ones defaulted — an M1 header without the M2-01 fields gets its preset's values from the built-in table) |
| `ReplayJson` | interface | Above |
| `encodeInputRuns(words, ticks?)`, `decodeInputRuns(text, ticks)` | functions | Runs of `(value, count)` as unsigned LEB128 varints, base64; decoding throws `RangeError` for truncated / over-long varints, empty runs, runs not adding up to `ticks` |
| `encodeBase64(bytes)`, `decodeBase64(text)` | functions | Standard alphabet, `=` padding, no `btoa`; decoding throws `RangeError` for a bad length, character or padding |
| `REPLAY_KIND`, `REPLAY_FORMAT_VERSION`, `REPLAY_HASH_INTERVAL` | const | `'replay'`, `1`, `600` |

### `module-info`

`defineModule({ name, status, specRefs })` → frozen `ModuleInfo`; `ModuleStatus` =
`'placeholder' | 'partial' | 'implemented'`. Every module exports one as `moduleInfo`.

### Placeholder modules

None is left in `@shmup/core`: modules joined `src/index.ts` as they were implemented — `rng`,
`math`, `events` and `pools` in M1-01, `world`, `player`, `collision` and `debug` in M1-06,
`stage` in M1-07, `enemies`, `patterns` and the new `behaviors` in M1-08, `bullets` and `rank` in
M1-09 (`rank` implemented with M2-01), `weapons` and `options` in M1-10, `powerups` and `shields` in M1-11, `scoring` and `fx` in
M1-12, `bosses` in M1-13, `ui` and `scenes` in M1-16, `save` (with the `config` user options) in
M1-17 and `replay` in M1-19 (the `exports` map still has only `"."`).

Still planned inside the partial modules: `config` — more display options (M2-08 / M2-16; the bullet palette came with M2-02), the chosen
difficulty and the weapon select's loadout saved with the options (M2-16); `save` (implemented) — unlocks, save v2 with the M2-16 options, names from
the name entry (M2-15); `player` (implemented for P0; co-op joining and continuing live in `world` since M2-06); `scoring` — nothing co-op is left (per-player scores, extends and continues since M2-06; the Direct-mode 1UP item of M2-05 lives in `powerups`); `fx` — authentic slowdown (M3-02); `collision` — destructible tiles (M2-07); `debug` (implemented) — the device info in the overlay
(M2-17); `replay` (implemented) — recording the scene flow and attract playback (M2-15), save /
share / fast-forward (M3-01); `stage`
(implemented for P0) — time-keyed events, diagonal scrolling, branches (M2-07, M2-10);
`enemies` — the needs of the M2 zones' behaviours (M2-11 … M2-14); `behaviors` — the behaviours of the M2 zones (M2-11 … M2-14);
`bosses` — boss timers and escapes, the HP bar, mid-bosses, raids, boss-inside-boss, double
bosses, boss rush (M2-09), rotating part transforms; `bullets` (implemented) — graze (P2), DSL-fired lasers and
boss / revenge DSL patterns (M2-09); `rank` (implemented) — the loop / stage
terms set by the campaign (M2-10); `weapons` (implemented — both models since M2-05, both players' loadouts in co-op since M2-06); `options` (implemented since M2-04) — option recovery after death (M3); `powerups` (implemented since M2-05) — the yellow item's damage to mid-bosses (M2-09) (co-op item ownership and drop scaling came with M2-06); `shields` (implemented — the Arm since M2-05); `scenes` — more option groups (controls,
display, game — M2-16; the chosen difficulty and ship saved), attract mode, the mode select, the zone map, name entry, the
hi-score table screen, ending and credits (M2); `ui` — the key-rebind prompt and the name entry (M2-15 / M2-16), the boss HP
bar (M2; the Direct-mode tier pips came with M2-05, the co-op halves with M2-06).

## `@shmup/input-web`

Keyboard / remote / gamepad → the core's `InputSnapshot`, driven by the data-driven input
profiles of `content/input/` (decisions D13–D15). Guides: [input-profiles.md](input-profiles.md),
[coop.md](coop.md#input-routing-shmupinput-web-shmupshell) (player seats and the split keyboard, M2-06).

| Export | Module | Summary |
|---|---|---|
| `createWebInput({ keyTarget, getGamepads?, bindings?, keyDevice? })` | `web-input` | → `WebInput`. `poll()` once per tick (ages the debounce first); *reused* snapshot. Devices are routed to players by **seats** (M2-06; `implemented`): one seat — every device, pads and both halves of a split keyboard included, drives player 1; two seats (a co-op game) — the keyboard / remote is player 1's, the split keyboard's right half player 2's, and an unseated pad drives player 1 until its first join press (a button the gamepad profile's **menu** table binds to Confirm or Pause) seats it as player 2 and is forwarded as a latched `Confirm` there. `poll()`, `setContext()`, `setSeats()` and the event handlers never allocate |
| `WebInput` | `web-input` | `PlatformInput` + `keyboard`, `context` (`'game'` initially), `keyProfile`, `gamepadProfile` (`null` = built-in defaults), `setProfile(profile)` (key profiles → keyboard source and reported device; gamepad profiles → every pad), `setContext(ctx)` (no-op when unchanged; remembered without a profile), `clear()`, `destroy()`; co-op (M2-06): `splitKeyboard` (player 2's half of a split key profile), `seats` (1 or 2), `setSeats(count)` (the host forwards `Game.inputSeats`; allocation-free; a source that changes players keeps what it holds there without a new press), `padSeat(index)` (a pad that disappears gives its seat up on that poll) |
| `WebInputOptions` | `web-input` | `keyTarget`, `getGamepads?`, `bindings?` and `keyDevice?` (used until a profile is applied) |
| `PAD_SEAT_NONE` (`-1`), `PAD_SEAT_P2` (`1`) | `web-input` | `WebInput.padSeat(index)` results: the pad has no seat (drives player 1) / holds player 2's seat |
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
| `selectableKeyProfiles(profiles, keySpace)`, `KeySpace` | `rebind` | → the keyboard / remote profiles whose **menu** table binds Up, Down, Left, Right, Confirm and Back through the host's key space, in input order (M1-17 — what an Options screen may offer without locking the player out); `'code'` (desktop keyboards: `keyboard-default`, `keyboard-remote-emulation`, `keyboard-split` — M2-06) \| `'keyCode'` (the TV remote: `tizen-remote-*`); gamepad profiles never |
| `inputProfileChoices(profiles, keySpace, defaultId, extra = null)`, `DEFAULT_PROFILE_SUFFIX` | `rebind` | → a fresh `InputProfileChoice[]` of the selectable profiles (+ `extra` — e.g. a `?profile=` override in use — appended when missing), the default's label suffixed; `' (DEFAULT)'` (M1-17) |
| `loadInputProfileChoice(storage)`, `saveInputProfileChoice(storage, id)` | `rebind` | Persistence hook (`Platform.storage` key `INPUT_PROFILE_STORAGE_KEY` = `'input.profile'`); load resolves `null` on a missing / empty value or a storage error. **Unused since M1-17** — the apps keep the choice in the `core/save` document (`options.input.profileId`) |
| `InputProfile` | `rebind` | `InputTuning` + `id`, `label`, `device`, `context: { game, menu }` (as written), `register`, `tables: { game, menu }` (compiled), M2-06: `split?` (a keyboard profile's second half — player 2's keys, `{ game, menu }` as written; `context` is then player 1's half) and `splitTables?` (compiled, `null` without a split); frozen. A split is validated like `context`, keyboard profiles only, no key in both halves of a context |
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
| `createPixiRenderer({ canvas, displayWidth, displayHeight, width?, height?, preferWebGLVersion?, atlas?, font?, testPattern?, glyphCapacity?, effects?, fxSeed?, particleCapacity?, countDrawCalls? })` | `renderer` | → `Promise<PixiRenderer>`; rejects without WebGL. `countDrawCalls` (M1-19, default `false`) wraps the context's draw entry points with an allocation-free counter. Defaults: 384×216, WebGL1, font `'pixel'`, no test pattern, 1024 quads per HUD / UI layer, `DEFAULT_EFFECT_SETTINGS`, particle seed 1, 256 particles (M1-14) |
| `PixiRenderer` | `renderer` | `IRenderer` + `webGLVersion`, `drawCalls` (M1-19: WebGL draw calls of the last `render()`, both passes; −1 without `countDrawCalls`), `viewport`, `scene` (384×216 root), `layers`, `atlas`, `metrics` (`TextMetrics` or `null`), `bindings`, `terrain` (`TerrainBinding \| null`), `parallax` (`ParallaxBinding \| null`), `lasers` (`LaserBinding \| null`, M1-09), `bendingLasers` (`BendingLaserBinding \| null`, M2-02), `bulletPalette` (M2-02: the `BulletPalette` in use, `standard` until set), `setBulletPalette(palette)` (M2-02: re-resolves the base sprite table with the palette's `<sprite>@<palette>` variants — `resolveBulletPaletteTable` — and invalidates the HUD / UI views; every binding reads the shared tables, so the next frame draws the new colours without re-binding; allocates — call it when the option changes; before an atlas / sprite names exist it only records the choice, which `setSpriteNames` then applies), `effects` (`ScreenEffects`), `particles` (`ParticleSystem \| null` — no atlas), `popups` (`ScorePopups \| null` — no atlas font), `setFxContent(content)` (M1-14: the particle presets; without it no particle is drawn), `setSpriteNames(names)`, `bindWorld(world \| null)` (creates the parallax, terrain and batch bindings and, for `world.lasers`, a laser binding and — M2-02 — for `world.bendingLasers` a bending laser binding on `ENEMY_BULLETS` after the batches, in that order; throws `RangeError` for a batch on an unknown layer or a parallax band not on `BG_FAR` / `BG_MID`; `render()` calls it when `frame.world` changes identity). `render()` steps the effects, particles and popups by the `frame.tick` delta (0 while paused, ≤ 60; a tick going back clears them), syncs particles / popups with the world's camera and adds the effects' shake / flash / dim to `frame.screen`'s |
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
| `createBendingLaserBinding({ atlas, tables, capacity, nodes, offsetY? })` | `layers` | → `BendingLaserBinding { container, capacity, nodes, visibleCount, sync(view, camera), destroy() }` (M2-02): `capacity × nodes` preallocated sprites, one per ring node; `sync` shows each active, not `Hidden` slot's newest `filled` nodes (≤ `nodes`) as frame 0 of its `spriteId`, anchored on the node at whole pixels, **never rotated or scaled** (Pixi's transform setters allocate), tail first so the head is on top, a texture assigned only on a change, the slot's other sprites hidden; never allocates; throws `RangeError` for a non-positive-integer `capacity` or `nodes` |
| `BendingLaserBindingOptions` | `layers` | Option type (`offsetY` defaults to `PLAYFIELD_Y`) |
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
| `bulletPaletteSpriteName(name, palette)`, `BULLET_PALETTE_SUFFIX` | `palette` | M2-02: → `name` for `standard`, else `name@palette` (`bullets/oval-red@tritanopia`); `'@'` |
| `resolveBulletPaletteTable(atlas, names, palette)` | `palette` | M2-02 → `Int32Array` (sprite id → first frame): `atlas.resolveSpriteTable(names)`, then — unless `standard` — every name whose `<name>@<palette>` variant the atlas has maps to the variant's first frame (variants keep their sprite's frame count and order, so directional frames stay right; a name without a variant keeps its frames). Load time / on an option change — allocates |
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

| `createDebugOverlay(renderer, { buildId? })` | `debug` | → `DebugOverlay { container, stats, graph, panel, outlines, update(world \| null, flags, counters \| null), destroy() }` (M1-19): one container on the `DEBUG` layer — one draw-list view per outline kind and per panel colour; `update` rebuilds the panel while `flags.overlay` and the outlines while `showHitboxes` / `showGrid` (and a World) — never allocates; without an atlas it draws nothing |
| `DebugOverlay`, `DebugOverlayOptions` | `debug` | Above |
| `DebugOverlayStats`, `createDebugOverlayStats()` | `debug` | Host-measured numbers: `fps`, `tickMs`, `renderMs`, `drawCalls` (−1 unknown), `particles`, `particleCapacity`, `webGLVersion`, `bootMs`; → zeroed |
| `buildDebugPanel(lists, stats, counters \| null, flags, graph)` | `debug` | Pure builder of the five panel lines and the frame graph (bars green ≤ 17.5 ms, yellow ≤ 34 ms, red beyond; 8 px per 16.7 ms, ≤ 40 px); allocation-free |
| `DebugPanelLists`, `createDebugPanelLists(buildId)` | `debug` | `backdrop`, `labels`, `values`, `alerts`, `good`, `warn`, `bad` — one colour each; the build id upper-cased |
| `buildDebugOutlines(lists, world \| null, flags)` | `debug` | Pure builder: hurt circles (× the shield's `hurtScale` — Reduce, M2-04), terrain boxes (never scaled), enemy / boss-part hurtboxes, shot boxes, bullet circles, item radii, active laser capsules (17 squares), grid cells — 1-px rects in screen pixels, clipped to the playfield; allocation-free |
| `DebugOutlineLists`, `createDebugOutlineLists()` | `debug` | `grid`, `items`, `enemies`, `boss`, `shots`, `lasers`, `bullets`, `terrain`, `hurt` — sized for full pools |
| `createFrameGraph(length?)`, `FrameGraph` | `debug` | Ring of the last `FRAME_GRAPH_LENGTH` frame times: `times`, `head`, `count`, `push(ms)` |
| `OUTLINE_COLORS`, `PANEL_COLORS`, `FRAME_GRAPH_LENGTH` | `debug` | Colours by outline kind / panel list (0xRRGGBB); `60` |

Guide for the overlay: [debug-and-replays.md](debug-and-replays.md#the-overlay-shmuprender-pixi-debug).

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
| `ShellOptions` | `boot` | `canvas`, `win`, `contentFiles`, `assets`, `input`, `audio` (`IAudio & Partial<AudioGraphLike>` — a `WebAudio` exposes `context` / `bus()` and is played through; a plain `IAudio` leaves the game silent, M1-15), `audioLoader?` (default `createAudioLoader()`; tests inject a fake, M1-15), `platform: (renderer) => Platform` (called after content validation — the apps apply the input profiles there), `gameConfig?`, `scene?` (`'game'` — the scene flow, M1-16), `audioUnlock?` (`'gesture'` \| `'immediate'`), `preferWebGLVersion?` (1), `contentOwners?` (merged over `DEFAULT_CONTENT_OWNERS`; an `fx`, `sfx` or `music` owner here replaces the shell's own and leaves the particles / the audio engine without that content), `effects?` (`Partial<EffectSettings>` for the renderer, M1-14), `inputProfiles?` (`ShellInputProfiles` — the profiles the Options screen offers and how to apply one; omitted: CONTROLS disabled and a saved profile not applied — M1-17), `now?` (the boot clock, default `win.performance.now()`, else `Date.now()` — M1-17), `createImage?`, `overlay?` (`null` disables it), `debugTools?` (M1-19: a `DebugToolsFactory` — the apps pass one only when `__SHMUP_DEV__`; with it the renderer counts draw calls and the tools are created once boot is done; default `null`) |
| `Shell` | `boot` | `game`, `platform`, `renderer`, `atlas`, `events` (dispatcher), `content`, `scene`, `debug` (M1-19: the `DebugTools` or `null`; destroyed by `stop()`), `sceneView` (the scene flow's `SceneView` when `scene === 'game'`, else `null` — M1-16), `flight` (the `FlightScene` or `null`), `showcase` (or `null`), `fxGallery` (the `FxGallery` or `null`, M1-14), `fx` (the `content/fx/` presets handed to the renderer, M1-14), `audioEngine` (the `AudioEngine`: SFX bank and the booted stage's music set, attached after the unlock — M1-15), `loadedSave` (the `LoadedSave` read at boot, with its status), `save` (the `SaveStore` — the scene flow's `game.scenes.save`), `bootTiming` (`BootTiming`) (all three M1-17), `stop()` (idempotent; releases loop, listeners — `resize`, `blur`, the unlock gestures — input, renderer, atlas, the audio engine, audio). Since M1-17 boot reads the save once the platform exists (`loadSave(platform.storage)`), applies its volumes (`applyAudioOptions`), saved profile (`inputProfiles.apply(id, 'save')`) and — M2-02 — saved bullet palette (`renderer.setBulletPalette`, before the sprite tables are resolved), hands the store and `{ choices, active }` to `createGame` in the scene flow, registers `connectOptionEvents`, clears held input on window `blur`, and marks `data-shmup-boot-ms`. Boot also seeds the particles with `(gameConfig.seed ^ 0x2545f491) >>> 0`, renders the SFX bank (`LOADING SOUND`) and prepares `stageMusicCues(stage)` of a booted stage (`LOADING MUSIC`; none in open space — the scene flow adds `MUSIC_CUES.Title`, and `StageClear` / `GameOver` in open space), calls `game.scenes.finishBoot()`, attaches the engine right after `unlock()` returns and again when it resolves, and, in the scene flow and free flight, connects the game's events (`connectFxEvents`, `connectAudioEvents` — against `sceneView.camera` in the flow); every frame calls `audioEngine.endFrame()` after the drain; in the flow it also calls `sceneView.follow()` before the drain, clears the renderer's particles and popups when `sceneView.worldChanges` moved, and updates `data-shmup-scene` |
| `ShellAssets`, `ShellInput`, `ShellScene` | `boot` | `{ manifest, pageUrls }`; `PlatformInput` + `clear()` + `setContext(ctx)` (required; called once at boot and before a frame's ticks whenever `game.inputContext` changed) + `setSeats?(count)` (optional, M2-06; called the same way with `game.inputSeats` — an adapter without it routes every device to player 1) + `destroy()`; `'game' \| 'flight' \| 'showcase' \| 'calibration' \| 'fx-gallery'` (`game` — the scene flow, the default since M1-16: `createGame(…, { scenes: 'boot' })`; the others run bare gameplay: `flight` free flight, the calibration scene renders the game frame without its world, the fx gallery — M1-14) |
| `ShellBootError` | `boot` | `Error` with `lines`, `issues`, `reason` |
| `sceneFromSearch(search)`, `SHELL_SCENES` | `boot` | `?scene=` → `ShellScene` (unknown or missing → `'game'`); the scene list, default first |
| `DEFAULT_STAGE_ID`, `defaultStageId(files)` | `boot` | `'zone-a'` — the stage a game plays when the host names none (M1-18; the zone map of M2-10 replaces it); → `'zone-a'` when the raw content files (before validation) hold a `stage` file with that id, else `null` (open space). Both apps pass it as `gameConfig.stage` in the scene flow |
| `BOOT_STATE_ATTRIBUTE` | `boot` | `'data-shmup-state'` — `loading` / `running` / `error` on the game canvas |
| `SCENE_ATTRIBUTE` | `boot` | `'data-shmup-scene'` — the scene flow's top scene id (`title`, `difficulty`, `weaponSelect`, `autoOrder`, `game`, `pause`, `options`, `confirm`, …) or the dev scene's name (`flight`, `showcase`, …) on the game canvas (M1-16; tests, the TV's remote inspector) |
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
| `connectOptionEvents(dispatcher, audio, onInputProfile, onBulletPalette = null)` | `dispatch` | Registers the Options screen's handler (M1-17) → an idempotent unregister function: `UserOption` `MasterVolume` / `MusicVolume` → `audio.setBusVolume('master' / 'music', volumeGain(level))`, `SfxVolume` → the same for `sfx` **and** `ui`, `InputProfile` → `onInputProfile(index)` (`null`: ignored), `BulletPalette` (M2-02) → `onBulletPalette(BULLET_PALETTES[param])` (`null` or an index outside the list: ignored — the shell passes `renderer.setBulletPalette`); volume events allocate nothing here |
| `applyAudioOptions(audio, options)`, `VolumeTarget` | `dispatch` | Sets `master`, `music`, `sfx` and `ui` (from the SFX level) through `volumeGain` — boot, from the save (M1-17); `{ setBusVolume(bus, gain) }` — any `IAudio` |
| `createBootOverlay(gameCanvas)` | `error-screen` | → `BootOverlay { canvas, showProgress(fraction, label), showError(title, lines), remove() }` or `null` (no document / no 2D context) |
| `drawProgress(ctx, w, h, fraction, label)`, `drawErrorScreen(ctx, w, h, title, lines) → lines shown`, `formatIssues(issues)` | `error-screen` | Canvas 2D drawing (`Canvas2DLike`) and `path: message` lines |
| `BOOT_SCREEN_COLORS`, `Canvas2DLike` | `error-screen` | Background `#10173a`, text, title `#ff5aa0`, track; the 2D context subset used |
| `startFrameLoop(scheduler, onFrame)` | `frame-loop` | → `FrameLoop { stop() }`; `FrameScheduler` = the two rAF functions (moved here from both apps) |
| `createSceneView(game)` | `scene-view` | → `SceneView { spriteNames, backdrop, frame, camera, worldChanges, follow(), update(gameFrame) → frame }` (M1-16, the `game` scene): the flow's frame plus a drifting starfield backdrop outside the game (pre-bound at load) and, in open space, a wrapper view with two starfield batches under the World's batches (built once per World — a stage's own view is used as is); since M2-03 the World is whichever view the frame shows — the game's or the weapon select's preview; `camera` follows the World on screen (the audio pans against it); `worldChanges` counts new World views (a game start, RETRY, opening the weapon select); the HUD, UI and screen effects are the core's; *reused* frame, no per-frame allocation |
| `SCENE_VIEW_SPRITES` | `scene-view` | `bg/stars-far`, `bg/stars-mid`, `bg/stars-near`, appended after the content's sprite names |
| `createFlightScene(game, { starTileSize? })` | `flight` | → `FlightScene { spriteNames, world, frame, update(gameFrame) → frame }`: `?scene=flight` (the default until M1-16; bare gameplay) — the game World's batches on the World's camera with the World's parallax, terrain and laser views, preceded by two starfield batches in open space only (a stage brings its own bands), and the D20 HUD (`1P` and player 1's score, `FREE FLIGHT` or the stage name upper-cased — `GAME OVER` in red once `world.status` says so, `HI` and the session hi-score, `lives − 1` stock ships, `ARROWS MOVE`; rebuilt only when lives, the status or a score's dirty flag change — M1-12); the World's `warning` view passed through and, while a boss WARNING runs, its text on a translucent band in the UI list (red / yellow every 16 ticks, rebuilt only on a change — M1-13); *reused* frame, no per-frame allocation |
| `FLIGHT_SPRITES`, `FlightSceneOptions` | `flight` | The scene's own sprites (`bg/stars-far`, `bg/stars-mid`, `bg/stars-near`, `hud/life`), appended after the content's sprite names; options type |
| `createShowcase({ starTileSize? })` | `showcase` | → `Showcase { spriteNames, world, frame, update(gameFrame) → frame }` (*reused*, pure function of the tick) — `?scene=showcase` |
| `SHOWCASE_SPRITES`, `ShowcaseOptions` | `showcase` | The showcase's sprite name table (11 names) |
| `createFxGallery(fx, { starTileSize? })` | `fx-gallery` | → `FxGallery { spriteNames, world, frame, stations, station, update(gameFrame) → frame }` (M1-14, `?scene=fx-gallery`): stations of `FX_GALLERY_STATION_TICKS` — every preset of `fx.particles.content` (read at creation; three bursts at the centre per station), then `FX_GALLERY_EXTRAS` — driving the renderer's particles, effects and popups directly; labels built once, timed by the game's tick; *reused* frame, no per-frame allocation |
| `FX_GALLERY_SPRITES`, `FX_GALLERY_STATION_TICKS`, `FX_GALLERY_EXTRAS`, `FxGalleryOptions` | `fx-gallery` | `bg/stars-far`, `bg/stars-mid`; `60`; `shake.small`, `shake.medium`, `shake.large`, `flash.mega-crash`, `flash.warning`, `flash.boss-blast`, `dim`, `popups`; options type |
| `debugToolsFactory(options?)` | `debug` | → `DebugToolsFactory` for `ShellOptions.debugTools` (M1-19): `(host) => createDebugTools(host, options)` |
| `createDebugTools(host, { unlock?, buildId?, onUnlock? })` | `debug` | → `DebugTools { controls, overlay, counters, api, unlocked, handleKey(keyCode, code, repeat) → handled, beginFrame(now), endTicks(), beforeRender(), afterRender(), destroy() }`: core controls + render-pixi overlay; a capture-phase `keydown` listener (`DEBUG_KEYS`; defaults prevented; only `Step` repeats); `unlock: 'keys'` (default, web) or `'sequence'` (TV — nothing until `DEBUG_UNLOCK_SEQUENCE` within `DEBUG_UNLOCK_WINDOW_MS`, then F1–F8 and 1–8; again toggles the overlay); publishes `window.__shmupDebug` |
| `DebugTools`, `DebugToolsFactory`, `DebugToolsHost`, `DebugToolsOptions` | `debug` | Above; the host is `{ game, renderer, win, now, bootMs, sceneId(), visibleWorld() }` |
| `ShmupDebugApi`, `DEBUG_GLOBAL` | `debug` | `window.__shmupDebug` (`'__shmupDebug'`): `sceneId`, `tick`, `worldTick`, `flags` (live `game.debug`), `counters`, `stats`, `unlocked`, `buildId`, `game`, `run(command)` (locked or not) |
| `DEBUG_KEYS`, `DebugKey` | `debug` | F1–F8 → `Overlay`, `GodMode`, `Outlines`, `FrameAdvance`, `Step`, `SlowMo`, `NextCheckpoint`, `SkipToBoss` — each `{ code, keyCode (112…), digitKeyCode (49…), command }` |
| `DEBUG_UNLOCK_SEQUENCE`, `DEBUG_UNLOCK_WINDOW_MS` | `debug` | `[[10252, 19], [427], [427], [427]]` (Pause — the remote's Play/Pause or a keyboard's Pause —, then Ch+ ×3); `3000` |

## Apps

These are not libraries, but their modules export testable functions.

### `apps/web`

| Export | Module | Summary |
|---|---|---|
| `bootWebApp(canvas, resources, win?)` | `boot` | Runs the shell's `?scene=` (default `game`, the scene flow — M1-16) → `Promise<WebApp>` (`game`, `renderer`, `audio`, `input`, `profiles` (`InputProfileRegistry`), `shell`, `stop()`); `resources` = `WebAppResources { contentFiles, assets, debugTools? }` from the virtual modules (`debugTools`, M1-19: `main.ts` passes `debugToolsFactory({ buildId: __SHMUP_BUILD__ })` when `__SHMUP_DEV__`, else `null`). Key profile: `?profile=` › the saved choice (`options.input.profileId` of the save the shell reads before the title — only a selectable profile, M1-17) › `keyboard-default`; pads `gamepad-standard`; an unknown `?profile=` → `console.warn`. Passes `inputProfiles` to the shell: CONTROLS offers `KEYBOARD (DEFAULT)` / `KEYBOARD AS REMOTE` plus a `?profile=` override in use; a pick switches at once (with `?debounce=`), and a `?profile=` override wins over the saved choice, not over a pick. `?stage=<id>` → `gameConfig.stage`, else in the scene flow `defaultStageId(contentFiles)` — zone A (M1-18; the dev scenes such as `?scene=flight` keep open space); `?skip=` → `gameConfig.stageSkip` (M1-18, default `'none'`); `?loadout=` → `gameConfig.loadout` (M1-10 — with the MANTA of the ship select, M2-05, `'full'` is `applyDirectLoadout`'s: both levels 8 and the Hyper Arm); `remoteMode: false` (autofire stays on). Rejects with `ShellBootError` |
| `inputOverridesFromSearch(search)` | `boot` | → `InputOverrides { profile: string \| null, debounce: number \| null }` from `?profile=<id>` / `?debounce=<0…10>`; percent-decoded, last valid value wins |
| `stageFromSearch(search)` | `boot` | → the `?stage=<id>` value (percent-decoded, last non-empty wins; malformed escapes ignored) or `null` |
| `loadoutFromSearch(search)` | `boot` | → `'full'` / `'default'` from `?loadout=<preset>` (exact, case-sensitive; last valid value wins) or `null` — the M1-10 dev override, applied as `GameConfig.loadout` (`'full'` includes a Force Field since M1-11 — for a Direct-mode MANTA both levels 8 and the gold Hyper Arm, M2-05) |
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
| `bootTizenApp(canvas, resources, win?)` | `boot` | → `Promise<TizenApp>` (`game`, `platform`, `renderer`, `audio`, `input`, `profiles` (`InputProfileRegistry`), `shell`, `stop()`); `resources` = `TizenAppResources { contentFiles, assets, debugTools? }` (`debugTools`, M1-19: `main.ts` passes `tizenDebugTools(window, __SHMUP_BUILD__)` when `__SHMUP_DEV__`, else `null`). Key profile: `tizen-remote-safe` in the platform factory, then the saved choice from the save the shell reads before the title (only a selectable profile; its keys registered — M1-17); pads `gamepad-standard`. `gameConfig`: `remoteMode` / `autofire` true and, in the scene flow, `stage: defaultStageId(contentFiles)` — START plays zone A (M1-18; the dev scenes keep open space, and there are no `?stage=` / `?skip=` parameters). Passes `inputProfiles` to the shell: CONTROLS offers `SAFE 4-WAY (DEFAULT)` / `FAST 8-WAY`, and a pick switches at once and registers the new profile's `register` keys. The Back watcher is installed before boot and **removed once the shell runs** (M1-16): Back exits only from the loading and boot error screens; afterwards the scene flow owns Back (title → exit confirmation → `platform.exit()` after YES) |
| `tizenDebugTools(win, buildId)` | `boot` | → the shell's `DebugToolsFactory` in `'sequence'` mode (M1-19): Pause, Ch+, Ch+, Ch+ unlocks the tools and its `onUnlock` registers `DEBUG_REMOTE_KEYS` with `tvinputdevice` once (nothing outside a TV) |
| `DEBUG_REMOTE_KEYS` | `boot` | `'1'` … `'8'` (frozen) — the remote's number keys, matching the shell's `digitKeyCode`s |
| `createTizenPlatform(options)` | `platform` | → `Platform` (`id: 'tizen'`, `remoteOnly: true`); registers `options.registerKeys` (the key profile's `register` list), else `REMOTE_KEYS_TO_REGISTER` |
| `registerRemoteKeys(tizen, requested)` | `platform` | Batch registration with per-key fallback → names registered; drops `SYSTEM_REMOTE_KEYS` (`Exit`, volume) whatever the list says; an empty list registers nothing |
| `watchBackKey(target, onBack)` | `platform` | Calls `onBack` on non-repeat keyCode 10009 → unsubscribe function |
| `getTizenApi(win)` | `platform` | → `window.tizen` or `null` |
| `TizenApi`, `TizenPlatformOptions` (+ `registerKeys?`), `StorageLike`, `VisibilitySource` | `platform` | Types |
| `REMOTE_KEYS_TO_REGISTER`, `TIZEN_BACK_KEY_CODE` | `platform` | Fallback when no input profile gives a `register` list: `MediaPlayPause`, `ChannelUp/Down`, `ColorF0Red…ColorF3Blue`; `10009` |
| `checkTizenBundle(distDir)` | `scripts/check-bundle.mjs` | → `{ problems, files, code, gzipBytes, distBytes }`: one script `app.js`, classic deferred tag, ES2018 parse, polyfill banner, widget files present, every other file under `dist/assets/`, at least one atlas page under `dist/assets/atlas/`, and the M1-19 budgets (below); `POLYFILL_BANNER`, `WIDGET_FILES` (`app.js`, `config.xml`, `icon.png`, `index.html`) |
| `APP_JS_GZIP_BUDGET`, `ATLAS_PAGE_MAX_SIZE`, `DIST_BUDGET`, `pngSize(bytes)` | `scripts/check-bundle.mjs` | `350 × 1024` bytes gzipped, `2048` px per page edge, `8 MiB` for `dist/` (M1-19); → `{ width, height }` from a PNG's IHDR, or `null` when not a PNG |
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
| `shmupBuildInfo()` | `vite.shared.ts` | Vite plugin (M1-19, both apps) defining `__SHMUP_DEV__` (`isDevBuild(env)`) and `__SHMUP_BUILD__` (`buildId()`) as JSON literals |
| `isDevBuild({ command, mode })`, `DEV_BUILD_MODES` | `vite.shared.ts` | → `true` for the dev server and the modes `['development', 'test']` (`build:dev`, `build:test`); `vite build` (production) → `false` |
| `buildId(cwd?)` | `vite.shared.ts` | → `SHMUP_BUILD_ID` when set, else the 7-character git SHA of `HEAD` (+ `+` for uncommitted changes to tracked files), else `'unknown'` |
| `__SHMUP_DEV__`, `__SHMUP_BUILD__` | `types/build-info.d.ts` | Ambient declarations of the two defines (included by the apps' and the root `tsconfig.json`; read only by the apps' `main.ts`) |
| `WEB_PORT` (`4173`), default config | `test/e2e/playwright.config.ts` | Playwright config of `pnpm test:e2e`: headless Chromium (SwiftShader, `--allow-file-access-from-files`, no `DISPLAY`), 1152×648 viewport, `vite preview` of `apps/web/dist` (the `build:test` output since M1-19), workers = half the cores, at most 8 |
| `freezeSim(page)`, `stepTo(page, tick)` | `test/e2e/frame-advance.ts` | e2e helpers (M1-19): turn `flags.frameAdvance` on through `window.__shmupDebug` as soon as it exists; queue `requestStep` ticks until `worldTick` is `tick`, then wait two frames → the tick reached |
| (script) | `scripts/golden-update.mjs` | `pnpm golden:update` (M1-19): Vitest on `test/golden` with `SHMUP_GOLDEN_UPDATE=1`, exits with its code |
| `BENCH_TICKS`, `BENCH_WARMUP`, `MEDIAN_BUDGET_MS`, `HEAP_BUDGET` | `test/bench/stress.perf.ts` | `pnpm bench` (M1-19): `20,000`, `3,000`, `1.0`, `512 × 1024` |

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
| `makeP2Sprite(sprite)`, `swapRedBlue(frame)`, `wantsP2Variant(name)`, `P2_SUFFIX` (`'@p2'`), `P2_VARIANT_PREFIXES` (`['ships/']`), `P2_VARIANT_SPRITES` (`['hud/life']`) | `coop.mjs` | M2-06: player 2's palette swap — `collectSprites` adds `<name>@p2` (red and blue channels swapped, same anchor / frames / animations, `hitFlash: false`) for every ship and the stock icon, after the `@flash` siblings |
| `createAssetRng(seed)` → `AssetRng { nextU32, nextFloat, rangeInt, chance }`, `hash2(x, y, seed)` | `rng.mjs` | sfc32 with its own splitmix32 seeding (sequences differ from `core/rng`); stateless position hash for tiling textures |
| `PROCEDURAL_GENERATORS`, `generateProceduralSprites()` | `procedural/index.mjs` | Registry `{ id, generate }[]`; every generator's sprites in registry order |
| `DIRECTIONS_8`, `color`, `mix`, `withAlpha`, `seedOf`, `makeSprite` | `procedural/common.mjs` | Exact 22.5° headings, colour helpers, FNV-1a name seed, `SpriteDef` builder (`origin: procedural:<id>`) |
| `generate()` per module; `BULLET_COLORS`, `METER_LABELS`, `TERRAIN_TILES`, `TILE_SIZE` (8), `STAR_TILE_SIZE` (128) | `procedural/*.mjs` | The generators (M2-02: `palettes` — every bullet, beam and bending laser segment again as `<sprite>@<palette>` for `deuteranopia` / `protanopia` / `tritanopia`, recoloured with its `BULLET_PALETTES` body colours and shape-coded with `CORE_MARKS` (pink `solid`, red `ring`, purple `dot`); `bullets` gained `bulletSprites(colours, suffix?, marks?, generator?)` and the `CoreMark` typedef, `lasers` `laserSprites(…)`, the `lasers/bend-{pink,red,purple}` 7×7 segments and `BEND_SIZE`, `items` the 5×5 `items/point` diamond with a `twinkle` animation; `backdrops` — M1-18: `bg/azure-verge`, zone A's planet-rim parallax band, a seamless `AZURE_TILE_W` 128 × `AZURE_TILE_H` 48 tile, haze above the lit rim row `AZURE_RIM_ROW` 10, then an opaque azure-to-navy body with seeded cloud streaks that wrap — `bullets`, `explosions`, `hud`, `items`, `lasers` — M1-09: `lasers/beam-{pink,red,purple}`, 8 frames of 4×8, frame `k` a band `k + 1` px tall; `BEAM_WIDTH`, `BEAM_HEIGHT`, `bandRows` — `particles`, `shields`, `starfield`, `terrain`, `ui` — M1-16: `ui/logo`, 165×27, from original 5×7 block letters; `LOGO_TEXT` `'SHMUP CUP'`, `LOGO_SCALE` 3 — `weapons` — M2-03: `shots/blast` (32×32, 4 frames), `shots/ripple` (24×44, 6 frames), `shots/cyclone` (8×9, 4 frames); `BLAST_SIZE`, `RIPPLE_W`, `RIPPLE_H`, `RIPPLE_FRAMES`, `CYCLONE_W`, `CYCLONE_H` — and `hud`'s `METER_LABELS` grew to 16 frames, M2-03; M2-04: `items` the blue capsule `items/capsule-blue` (the capsule pill in blue — `capsule(bright, tint)`), `shields` the pod `shields/pod` (8×8, 4 wear frames) and Reduce's `shields/reduce` (20×14 dotted ring, 2 frames); M2-05: `direct` — the MANTA's shots `shots/direct-missile` (12×6, 2 frames), `shots/disc` (20×20, 4), `shots/beam` (26×8, 4), `shots/wave` (16×34, 4), `shots/sub-bomb`, `shots/sub-laser` / `sub-laser-wide` (8 octant frames each — never rotated at run time), `shots/sub-disc` (2), the six colour items `items/direct-<colour>` (10×10, 2 frames) and the Arm `shields/arm` (26×18, 9 frames: tier × fresh / worn / critical)) and their data |

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
| `fourWayBot(player = 0)` | `four-way-bot.ts` | → a `PlaytestBot` named `four-way` flying that player slot (M2-06 — the co-op goldens fly player 2 with a second bot): never two directions, x ≈ `BOT_X`, up / down to the cheapest lane of the danger scan (trip + stay + terrain − preferences, 20-point hysteresis), then back to `BOT_X`; one-tick `PowerUp` presses on Speed (≤ `BOT_MAX_SPEED_LEVEL`), Missile, Option. One bot per run |
| `scanLanes(world, scan, player = 0)`, `createLaneScan()`, `LaneScan` | `four-way-bot.ts` | Fills `LaneScan { centre, span: Uint32Array (slot bits per lane), terrain: Float64Array, wall: Uint8Array }` (cleared first) from bullets, bodies, boss parts, lasers (from 12 ticks before the beam grows) and rock within `TERRAIN_AHEAD` |
| `laneCentre(lane)`, `laneOf(y)` | `four-way-bot.ts` | A lane's centre row; the lane of a playfield row (clamped) |
| `BOT_X`, `LANE_HEIGHT`, `LANES`, `BULLET_HORIZON`, `SLOT_TICKS`, `SLOTS`, `TERRAIN_AHEAD`, `BOT_MAX_SPEED_LEVEL` | `four-way-bot.ts` | `64`, `16`, `12`, `40`, `2`, `20`, `56`, `2` |
| `maxBulletSpeed(world)` | `rules.ts` | → the fastest live enemy bullet (px/tick; 0 without) |
| `laserLaneGaps(world)`, `LaneGaps` | `rules.ts` | → `{ lanes, separate, narrowestBetween (Infinity with < 2), widestOpen }` — lanes = lasers in telegraph / grow / active, rows widened by the hurt radius and clipped to the playfield (a beam wholly off it is no lane), overlapping lanes merged |
| `createRuleWatch()`, `RuleWatch` | `rules.ts` | A collector: `observe(world)` (bound — pass it as `PlaytestFlags.observe`), `maxBulletSpeed`, `maxLanes`, `maxSeparate`, `narrowestGap`, `narrowestOpen`, `violations` (the first 20, `tick N: …`) |
| `MAX_AIMED_BULLET_SPEED`, `MIN_LANE_GAP` | `rules.ts` | `2.0` px/tick (D17, Normal); `16` px |

### Golden replays (`test/golden/`)

Test code of plan M1-19 in the `integration` Vitest project, imported by relative path. Guide:
[debug-and-replays.md](debug-and-replays.md#golden-replays-testgolden).

| Export | File | Summary |
|---|---|---|
| `GOLDEN_SCENARIOS`, `GoldenScenario` | `golden.ts` | The seventeen committed runs (`zone-a-god`, `zone-a-arcade`, `zone-a-deaths`, `zone-a-boss`, since M2-03 the arsenal against the boss: `zone-a-type-b`, `zone-a-edit`, `zone-a-type-c`, `zone-a-type-d`, since M2-04 the Option types and meter shields: `zone-a-rotate`, `zone-a-reduce` (the boss), `zone-a-snake`, `zone-a-free-shield` (the whole stage), and since M2-05 the Direct-mode MANTA (`config` with `shipId: 'manta'`, `powerUpMode: 'direct'`): `zone-a-manta` (the whole stage), `zone-a-manta-boss` (the boss, full loadout), `zone-a-manta-deaths` (the weaver, Arcade penalty), and since M2-06 two co-op games (`config.coop`): `zone-a-coop` (two 4-way bots, player 2 from tick 300), `zone-a-coop-deaths` (a weaving player 2 from tick 120 dying and continuing with START)): `{ name, description, stageId, config, godMode, bot: 'four-way' \| 'weaver', p2?: { bot, joinTick } }` — `p2` = player 2's pilot and the tick of its first START (then START every other tick while it may join) |
| `weaverBot()` | `golden.ts` | → a careless `PlaytestBot` (`weaver`): up / down 40 ticks each, never dodges — the death scenarios (`zone-a-deaths`, `zone-a-manta-deaths`) |
| `recordGolden(scenario)` | `golden.ts` | Records a scenario through `createReplayRecorder` + `createReplayGame` until `stageClear`, `gameOver` or `DEFAULT_MAX_TICKS` → `{ replay, outcome }` |
| `playGolden(replay)` | `golden.ts` | Plays it back into a fresh session → `{ report: DesyncReport, outcome }` |
| `readGolden(name)`, `writeGolden(scenario, replay, outcome)`, `formatGolden(…)`, `goldenPath(name)` | `golden.ts` | Read / write / format (`JSON.stringify`, 2-space indent, final newline) `test/golden/<name>.replay.json` |
| `GoldenFile`, `GoldenOutcome`, `GoldenPlayer2` | `golden.ts` | A `ReplayJson` + `description` + `expected: { status, ticks, score, lives, deathTicks, bossDefeated, p2? }`; `p2` (co-op runs, M2-06) = `{ score, lives, deathTicks, continues }` of player 2 |
| `GOLDEN_BUILD_ID`, `GOLDEN_UPDATE_ENV` | `golden.ts` | `'golden'`; `'SHMUP_GOLDEN_UPDATE'` |

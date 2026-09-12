# @shmup/core

The platform-agnostic heart of Shmup Cup: the deterministic fixed-step simulation, every
game system, and the `Platform` contract the host apps implement.

**Hard rule:** pure TypeScript — no DOM, WebGL, Web Audio, Node or platform APIs
(`tizen.*`, `webapis.*`, `electron`), no key codes, no clocks, no `Math.random`, and no
engine-dependent maths (`Math.sin`/`cos`/`atan2`/`pow`/… or `**` — use the committed tables
in `math`). Enforced by `tsconfig.json` (`lib: ["ES2018"]`, no `types`) and ESLint
(`no-restricted-globals` / `no-restricted-imports` / `no-restricted-properties` /
`no-restricted-syntax` for `packages/core/src`).

## Implemented now

| Export | Module | What |
|---|---|---|
| `Platform` + parts, `createHeadlessPlatform`, `createMemoryStorage` | `platform` | Host contract (`shmup_tech.md` §3.2) and a Node/test implementation |
| `Action`, `InputSnapshot`, `PlayerInput`, `commitPlayerInput`, `InputContext`, `INPUT_CONTEXTS`, … | `input` | Action bitmasks + per-tick snapshots with edge latching; the `game` / `menu` binding context (D15) the input adapters resolve keys with |
| `GameConfig`, `DEFAULT_GAME_CONFIG`, `resolveGameConfig`, `StartingLoadout`, `MeterSlotName`, `METER_SLOT_NAMES`, `DEFAULT_AUTO_POWER_UP_ORDER`, `HUD_BAR_HEIGHT`, `PLAYFIELD_Y/W/H` | `config` | Sim-affecting session options (384×216, 60 Hz, remote-first defaults, `aimDirections` 32 for aimed enemy shots, `autofireInterval` 4 / `missileInterval` 10 and the starting `loadout` for the player weapons, the power meter's `autoPowerUp` / `autoPowerUpOrder` / `pickupMagnet`; `powerUpMode` `'meter'` — `'direct'` is rejected until M2-05) and the D20 screen layout (8-px HUD bars around a 384×200 playfield) |
| `createFixedStepLoop` | `loop` | 60 Hz accumulator with delta snapping, per-frame cap, reset on resume |
| `createGame` | `game` | Composition root: platform + loop + content + the gameplay `World` (`game.world`, one `stepWorld` per tick); suspend/resume; `game.events` queue (the World's); `renderFrame()` returns the reused render contract with `world` = the World's view; `inputContext` (`'game'` until the scene stack, M1-16) |
| `createWorld`, `WorldOptions`, `stepWorld`, `World`, `WORLD_PHASES`, `WorldPhase`, `syncWorldView`, `PoolRegistry`, `resolveWorldStage`, `ENGINE_SPRITES` | `world` | The session state (tick, RNG streams, events, players, camera, status, hit-stop, debug flags, pools, the stage runner / terrain / parallax of `config.stage`, the enemy system, the rank, the bullet system, the weapon system and the power-up system, `view`) and the fixed 9-phase tick pipeline of plan §3.2; hit-stop skips phases 2–8; zero allocation per tick |
| `createStageRunner`, `StageRunner`, `StageHooks`, `StageEventCode`, `createStageTerrain`, `createParallaxView`, `createTerrainView`, `findEventCursor`, … | `stage` | Stage runtime (M1-07): camera keys with ramps, vertical pans and boss locks; the sorted event timeline fired through a cursor; checkpoints with restart by binary search; the terrain map and the parallax / terrain views the renderer draws |
| `PlayerShip`, `createPlayer`, `spawnPlayer`, `updatePlayer`, `readPlayerIntent`, `resolvePlayerShip`, `playerHit`, `PlayerHitCause`, `DIAGONAL_SCALE`, … | `player` (partial) | KESTREL movement: speed levels from `content/player/`, diagonal × 0.7071 (D4), no inertia, clamp to the camera view minus margins, rides the camera scroll, banking, 40-tick fly-in; hits recorded by `playerHit` after the ship's Force Field (`PlayerShip.shield`) had its say (death/respawn: M1-12) |
| `circleCircle`, `aabbAabb`, `circleAabb`, `capsuleCircle`, `segmentAabb`, `CollisionLayer`, `createSpatialGrid`, `TerrainMap`, `terrainAt`, `boxHitsTerrain`, `terrainRectHit`, `findFloor`, `findCeiling` | `collision` (partial) | Scalar-argument shape tests (closed shapes: touching hits), layer masks, uniform grid broad phase rebuilt by counting sort, pixel-exact terrain queries over per-tile column-height masks (bending-laser chains: M2) |
| `hashWorld`, `createDebugFlags`, `DebugFlags` | `debug` (partial) | FNV-1a 32 state hash over tick, RNG states, camera, the stage runner's state, status, hit-stop, rank, players, every pool's live slots (the enemy bullets and lasers and the player shots among them), the enemies, the formation table, the player weapons' loadouts, Option trails, timers and cooldown tables, and the power meters, pending Mega Crashes, shields and taken drops (golden replays); debug switches (controls: M1-19) |
| `IRenderer`, `IAudio`, `RenderFrame`, `WorldView`, `SpriteBatchView`, `LaserView`, `createSpriteBatch`, `pushSprite`, `SpriteFlag`, `LayerId`, `DrawList`, `createDrawList`, `TextMetrics` | `presentation` | Back-end contracts and the render contract (plan §3.4): world sprite batches in typed arrays, the enemy lasers (M1-09), HUD / UI command lists (rect, sprite, text slot, number), draw layers, screen effects — implemented by `@shmup/render-pixi` / `@shmup/audio-web` |
| `createRng`, `createRngStreams`, `RNG_STATE_WORDS` | `rng` | sfc32 seeded from one 32-bit seed; independent gameplay + cosmetic streams, zero-alloc state snapshots |
| `sinB`, `cosB`, `atan2B`, `quantizeAngle`, `angleDelta`, `turnToward`, `wrapAngle`, `clamp`, `lerp`, `approach`, `EASINGS` | `math` | Binary angles (1024/turn) on committed lookup tables + easing curves |
| `createEventQueue`, `SimEventKind`, `SFX_CUES`, `MUSIC_CUES`, `FX_CUES` | `events` | Sim → presentation ring of typed arrays (drop-oldest) and the canonical cue registries (`SFX_CUES.Clink` for armour hits since M1-10; `SimEventKind.PowerUp`, `SFX_CUES.PowerUpDenied` and `FX_CUES.ShieldBreak` since M1-11) |
| `createSoaPool`, `createPool` | `pools` | Struct-of-arrays typed-array pools (deferred free + swap-remove) and object pools |
| `loadContent`, `ContentDb`, `EMPTY_CONTENT_DB`, `CONTENT_MIGRATIONS`, `s`, `Schema`, `Infer`, `bakePath`, the `…Spec` types | `data` | Schema-validated `content/` (player, weapons, enemies, paths, stage, tileset): issues with `<file>:<json path>`, migrations, every `s.ref` string resolved to a numeric `<field>Id` at load, stage tilemaps expanded (heightfield generator / RLE rows), paths baked into arc-length tables, the engine's own sprites interned (`extraSprites`) |
| `createEnemySystem`, `EnemySystem`, `Enemy`, `EnemyFlag`, `ScriptApi`, `FormationTable`, `DropKind`, `MAX_ENEMIES`, … | `enemies` (partial) | Enemies (M1-08): 64 pooled instances spawned by stage `spawn` / `formation` events, formations with kill tracking (bonus + capsule when all killed), off-screen / settle / despawn rules, hit flash and deaths, contact with the ships, ground / air sprite batches; `ScriptApi` fire primitives with the fire rule (M1-09) (rank modifiers: M2) |
| `Script`, `resumeScript`, `SLEEP_FOREVER`, `MoverKind`, `setMover`, `updateMover`, `FollowTrack`, `samplePath`, `fireAimed`, `fireNWay`, `fireRing`, `fireSpiral`, `fireStack`, `fireSpray`, `fireHoming`, `fireDelayed`, `rankedWait`, … | `patterns` (partial) | Behaviour coroutines resumed only on wake (D29), the per-tick movers (straight, sine, arc-length path, waypoint, follow, ground crawl, homing, aimed dash) and the rank-scaled fire primitives of M1-09 (DSL: M2-02) |
| `DEFAULT_BEHAVIORS`, `KNOWN_SCRIPT_IDS`, `defineBehavior`, `createBehaviorRegistry`, `checkEnemyBehaviors`, … | `behaviors` (partial) | Registry of enemy behaviour scripts referenced by content (`script` ids) with per-enemy tunables; the M1 roster (`drifter.sine`, `fan.loop`, `carrier.straight`, `turret.floor`, `walker.floor`, `hatch.spawner`, `rammer.aimed`, `orbiter.loop`) — turrets, walkers and orbiters fire since M1-09 |
| `createBulletSystem`, `BulletSystem`, `spawnBullet`, `fireLaser`, `cancelAllBullets`, `BulletKind`, `BULLET_KINDS`, `BulletFlag`, `LaserPhase`, `AIM_AT_TARGET`, `MAX_ENEMY_BULLETS`, … | `bullets` | Enemy bullets and lasers (M1-09): a 512-slot SoA bullet pool that is also the `ENEMY_BULLETS` sprite batch (acceleration, turning, delays, changes, capped homing; riding the camera; culled outside the view ± 16 px and on terrain), 16 telegraphed lasers (capsule hitbox only at full width, attached to their enemy or fixed), brute-force collision with the ships (`playerHit(Bullet / Laser)`), sparkle cancel (bending lasers, points cancel: M2-02) |
| `createWeaponSystem`, `WeaponSystem`, `Loadout`, `applyLoadoutPreset`, `MainWeapon`, `WeaponRole`, `ShotKind`, `ShotFlag`, `checkWeaponBehaviors`, `WEAPON_BEHAVIOR_PARAMS`, `WEAPON_SCRIPT_IDS`, `MAX_PLAYER_SHOTS`, … | `weapons` (partial) | Player weapons (M1-10): meter mode's Type A arsenal from `content/weapons/` (main shot, Double pair, piercing Laser, ground-sliding Missile) in a 96-slot SoA shot pool; per-player loadouts (`GameConfig.loadout`); always-on autofire with caps per shooter (ship + Options); shots ride the camera and die on terrain; grid-based hits (armour clinks, per-enemy cooldowns for piercing shots, kill credit) (Types B–D, Direct mode: M2) |
| `OptionGroup`, `createOptionGroup`, `MAX_OPTIONS`, `OPTION_SPACING`, `OPTION_TRAIL_CAPACITY`, `OPTION_SPRITE`, … | `options` (partial) | Up to four trailing Options per ship on a screen-space trail that advances only with movement input (D26): they bunch while the ship is idle during scrolling and spread when it moves (Snake / Formation / Rotate, Option Hunter: M2-04) |
| `createPowerUpSystem`, `PowerUpSystem`, `PowerMeter`, `advanceMeter`, `canEquipSlot`, `equipSlot`, `MeterSlot`, `ItemKind`, `MAX_ITEMS`, `CAPSULE_SCORE`, … | `powerups` (partial) | Meter mode (M1-11): the 7-slot power meter per player (capsules advance and wrap, the PowerUp press equips on its edge, maxed slots greyed, Double / Laser exclusive), Auto Power-Up in `GameConfig.autoPowerUpOrder`, a 32-slot SoA pool of world-space capsules from enemy / formation drops (16-px pickup magnet, every pickup counts, 300 points), Mega Crash (cancels bullets, destroys non-immune enemies, screen flash) (Direct-mode items: M2-05) |
| `ShieldState`, `grantShield`, `absorbShieldHit`, `tickShield`, `shieldWearFrame`, `FORCE_FIELD`, `ShieldKind`, … | `shields` (partial) | The Force Field on every ship (`PlayerShip.shield`): 5 hits, 8-tick shield-hit i-frames, wear frames, break events; absorbs bullets, lasers and contact inside `playerHit`, never terrain (pods, Arm tiers: M2-04 / M2-05) |
| `computeRank`, `rankScale`, `RankCurve`, `DIFFICULTY_RANK_BASE`, `BULLET_SPEED_RANK_CURVE`, `FIRE_RATE_RANK_CURVE`, `difficultyRankInputs`, … | `rank` (partial) | Constant rank from the difficulty preset (Normal = 2) and curves that are exactly 1 on Normal, scaling enemy bullet speed and fire rate (growth: M2-01) |

## Placeholder modules (API declared, logic comes later)

Each `src/<module>/index.ts` has a docblock (responsibility, spec sections, intended API)
and exports `moduleInfo`; `test/<module>/` holds its smoke test.

| Module | Responsibility | Spec |
|---|---|---|
| `bosses` | Multi-part bosses, phases, WARNING intro | feat §13 |
| `scoring` | Score, hi-scores, lives, extends | feat §15 |
| `scenes` | Scene stack / state machine, Back semantics | feat §17, §22 |
| `ui` | Canvas UI kit model, HUD model, text layout | feat §17, tech §4.10 |
| `replay` | Input recording/playback, state hashes | feat §21 |
| `save` | Versioned persistence via `Platform.storage` | feat §21 |
| `fx` | Hit-stop, shake, flash (sim side) | feat §18, §20 |

## Scripts

```sh
pnpm --filter @shmup/core test        # Vitest (Node, headless; workers get --expose-gc for the allocation guard)
pnpm trig:tables                      # regenerate src/math/trig-table.ts (repo root; a test diffs it)
pnpm content:check                    # validate content/ with loadContent() (repo root)
pnpm --filter @shmup/core typecheck   # src (pure) + test/ (Node) programs
pnpm --filter @shmup/core build       # tsc → dist/ (ES2018 + .d.ts)
```

The deterministic primitives (`rng`, `math`, `events`, `pools`) have their own guide:
[`docs/dev/engine-foundations.md`](../../docs/dev/engine-foundations.md); the content
loader and schema combinators (`data`) theirs:
[`docs/dev/content-data.md`](../../docs/dev/content-data.md); the render contract
(`presentation`) is explained with its renderer in
[`docs/dev/rendering-and-shell.md`](../../docs/dev/rendering-and-shell.md); the World, its tick
pipeline, the player ship, collision and the state hash (`world`, `player`, `collision`,
`debug`) in [`docs/dev/sim-world.md`](../../docs/dev/sim-world.md); the stage runtime (`stage`,
the terrain queries of `collision`, the `stage` / `tileset` data and the tilemap expansion) in
[`docs/dev/stage-runtime.md`](../../docs/dev/stage-runtime.md); the enemies, formations,
behaviour coroutines, movers and spline paths (`enemies`, `patterns`, `behaviors`, the
`enemies` / `paths` data and `data/paths.ts`) in
[`docs/dev/enemies-and-behaviors.md`](../../docs/dev/enemies-and-behaviors.md); the enemy
bullets, lasers, fire primitives and rank (`bullets`, the fire half of `patterns`, `rank`) in
[`docs/dev/bullets-and-patterns.md`](../../docs/dev/bullets-and-patterns.md); the player weapons,
loadouts, autofire and Options (`weapons`, `options`) in
[`docs/dev/weapons-and-options.md`](../../docs/dev/weapons-and-options.md); the power meter, capsules,
Force Field and Mega Crash (`powerups`, `shields`) in
[`docs/dev/powerups-and-shields.md`](../../docs/dev/powerups-and-shields.md). `src/math/trig-table.ts`
is **generated** — edit `scripts/gen-trig-tables.mjs`, not the table.

Consumers inside the workspace resolve `@shmup/core` to `src/index.ts` through the
`@shmup/source` export condition (no build needed for dev/test); `dist/` is for `tsc`
builds of dependent packages and any future external consumer.

`test/helpers/alloc.ts` is the **allocation guard** (plan §1.4): `measureHeapGrowth(fn,
iterations)` measures the bytes a hot path allocates (V8 `GCProfiler`, needs `--expose-gc`,
which `vitest.config.ts` passes to the workers). Every per-tick entry point (`stepWorld`,
`updatePlayer`, the grid, the stage runner, a 64-enemy World running every mover kind, a World
with 512 live bullets and 16 lasers, a fully powered World firing lasers and missiles from
four Options, a World collecting capsules, equipping the meter and wearing the Force Field down — one and two players, `hashWorld`, `game.frame`) has a test that keeps it under budget. The helper
keeps the steadiest of up to three measured windows (`attempts`, stopping at the first within
`settled` bytes), so one window spent in a lower V8 tier cannot fail a guard.

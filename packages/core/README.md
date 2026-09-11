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
| `GameConfig`, `DEFAULT_GAME_CONFIG`, `resolveGameConfig`, `HUD_BAR_HEIGHT`, `PLAYFIELD_Y/W/H` | `config` | Sim-affecting session options (384×216, 60 Hz, remote-first defaults) and the D20 screen layout (8-px HUD bars around a 384×200 playfield) |
| `createFixedStepLoop` | `loop` | 60 Hz accumulator with delta snapping, per-frame cap, reset on resume |
| `createGame` | `game` | Composition root: platform + loop + content + the gameplay `World` (`game.world`, one `stepWorld` per tick); suspend/resume; `game.events` queue (the World's); `renderFrame()` returns the reused render contract with `world` = the World's view; `inputContext` (`'game'` until the scene stack, M1-16) |
| `createWorld`, `stepWorld`, `World`, `WORLD_PHASES`, `WorldPhase`, `syncWorldView`, `PoolRegistry` | `world` | The session state (tick, RNG streams, events, players, camera, status, hit-stop, debug flags, pools, `view`) and the fixed 9-phase tick pipeline of plan §3.2; hit-stop skips phases 2–8; zero allocation per tick |
| `PlayerShip`, `createPlayer`, `spawnPlayer`, `updatePlayer`, `readPlayerIntent`, `resolvePlayerShip`, `DIAGONAL_SCALE`, … | `player` (partial) | KESTREL movement: speed levels from `content/player/`, diagonal × 0.7071 (D4), no inertia, clamp to the camera view minus margins, rides the camera scroll, banking, 40-tick fly-in (death/respawn: M1-12) |
| `circleCircle`, `aabbAabb`, `circleAabb`, `capsuleCircle`, `segmentAabb`, `CollisionLayer`, `createSpatialGrid` | `collision` (partial) | Scalar-argument shape tests (closed shapes: touching hits), layer masks, uniform grid broad phase rebuilt by counting sort (terrain queries: M1-07) |
| `hashWorld`, `createDebugFlags`, `DebugFlags` | `debug` (partial) | FNV-1a 32 state hash over tick, RNG states, camera, players and every pool's live slots (golden replays); debug switches (controls: M1-19) |
| `IRenderer`, `IAudio`, `RenderFrame`, `WorldView`, `SpriteBatchView`, `createSpriteBatch`, `pushSprite`, `SpriteFlag`, `LayerId`, `DrawList`, `createDrawList`, `TextMetrics` | `presentation` | Back-end contracts and the render contract (plan §3.4): world sprite batches in typed arrays, HUD / UI command lists (rect, sprite, text slot, number), draw layers, screen effects — implemented by `@shmup/render-pixi` / `@shmup/audio-web` |
| `createRng`, `createRngStreams`, `RNG_STATE_WORDS` | `rng` | sfc32 seeded from one 32-bit seed; independent gameplay + cosmetic streams, zero-alloc state snapshots |
| `sinB`, `cosB`, `atan2B`, `quantizeAngle`, `angleDelta`, `turnToward`, `wrapAngle`, `clamp`, `lerp`, `approach`, `EASINGS` | `math` | Binary angles (1024/turn) on committed lookup tables + easing curves |
| `createEventQueue`, `SimEventKind`, `SFX_CUES`, `MUSIC_CUES` | `events` | Sim → presentation ring of typed arrays (drop-oldest) and the canonical cue registries |
| `createSoaPool`, `createPool` | `pools` | Struct-of-arrays typed-array pools (deferred free + swap-remove) and object pools |
| `loadContent`, `ContentDb`, `EMPTY_CONTENT_DB`, `CONTENT_MIGRATIONS`, `s`, `Schema`, `Infer`, the `…Spec` types | `data` | Schema-validated `content/` (player, weapons; stub enemies/stage): issues with `<file>:<json path>`, migrations, every `s.ref` string resolved to a numeric `<field>Id` at load |

## Placeholder modules (API declared, logic comes later)

Each `src/<module>/index.ts` has a docblock (responsibility, spec sections, intended API)
and exports `moduleInfo`; `test/<module>/` holds its smoke test.

| Module | Responsibility | Spec |
|---|---|---|
| `weapons` | Meter + direct weapon families, shot caps, piercing | feat §7 |
| `options` | Trailing options / multiples | feat §8 |
| `shields` | Force field, pods, Arm tiers | feat §9 |
| `powerups` | Power meter + direct items, pickups | feat §6 |
| `enemies` | Pooled enemies, movement primitives, formations | feat §11 |
| `bullets` | Enemy bullet pool, lasers, cancel | feat §12 |
| `patterns` | Generator coroutines + bullet-pattern DSL | feat §12, tech §4.6 |
| `bosses` | Multi-part bosses, phases, WARNING intro | feat §13 |
| `stage` | Timeline, camera path, checkpoints, tilemap, parallax | feat §14, §10 |
| `scoring` | Score, hi-scores, lives, extends | feat §15 |
| `rank` | Dynamic difficulty 0–31 | feat §15 |
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
`debug`) in [`docs/dev/sim-world.md`](../../docs/dev/sim-world.md). `src/math/trig-table.ts`
is **generated** — edit `scripts/gen-trig-tables.mjs`, not the table.

Consumers inside the workspace resolve `@shmup/core` to `src/index.ts` through the
`@shmup/source` export condition (no build needed for dev/test); `dist/` is for `tsc`
builds of dependent packages and any future external consumer.

`test/helpers/alloc.ts` is the **allocation guard** (plan §1.4): `measureHeapGrowth(fn,
iterations)` measures the bytes a hot path allocates (V8 `GCProfiler`, needs `--expose-gc`,
which `vitest.config.ts` passes to the workers). Every per-tick entry point (`stepWorld`,
`updatePlayer`, the grid, `hashWorld`, `game.frame`) has a test that keeps it under budget.

# @shmup/core

The platform-agnostic heart of Shmup Cup: the deterministic fixed-step simulation, every
game system, and the `Platform` contract the host apps implement.

**Hard rule:** pure TypeScript — no DOM, WebGL, Web Audio, Node or platform APIs
(`tizen.*`, `webapis.*`, `electron`), no key codes, no clocks, no `Math.random`. Enforced by
`tsconfig.json` (`lib: ["ES2018"]`, no `types`) and ESLint (`no-restricted-globals` /
`no-restricted-imports` / `no-restricted-properties` for `packages/core/src`).

## Implemented now

| Export | Module | What |
|---|---|---|
| `Platform` + parts, `createHeadlessPlatform`, `createMemoryStorage` | `platform` | Host contract (`shmup_tech.md` §3.2) and a Node/test implementation |
| `Action`, `InputSnapshot`, `PlayerInput`, `commitPlayerInput`, … | `input` | Action bitmasks + per-tick snapshots with edge latching |
| `GameConfig`, `DEFAULT_GAME_CONFIG`, `resolveGameConfig` | `config` | Sim-affecting session options (384×216, 60 Hz, remote-first defaults) |
| `createFixedStepLoop` | `loop` | 60 Hz accumulator with delta snapping, per-frame cap, reset on resume |
| `createGame` | `game` | Composition root: platform + loop + (empty) simulation; suspend/resume |
| `IRenderer`, `IAudio`, `RenderFrame` | `presentation` | Contracts implemented by `@shmup/render-pixi` / `@shmup/audio-web` |

## Placeholder modules (API declared, logic comes later)

Each `src/<module>/index.ts` has a docblock (responsibility, spec sections, intended API)
and exports `moduleInfo`; `test/<module>/` holds its smoke test.

| Module | Responsibility | Spec |
|---|---|---|
| `rng` | Seeded PRNG, gameplay + cosmetic streams | feat §22 |
| `math` | Binary angles, sin/cos/atan2 tables, fixed point, easing | feat §22, §12 |
| `events` | Sim → presentation event queue | feat §22 |
| `pools` | SoA typed-array pools, object pools | feat §22, tech §4.2 |
| `player` | Ship movement, hitboxes, death/respawn | feat §5, §10 |
| `weapons` | Meter + direct weapon families, shot caps, piercing | feat §7 |
| `options` | Trailing options / multiples | feat §8 |
| `shields` | Force field, pods, Arm tiers | feat §9 |
| `powerups` | Power meter + direct items, pickups | feat §6 |
| `enemies` | Pooled enemies, movement primitives, formations | feat §11 |
| `bullets` | Enemy bullet pool, lasers, cancel | feat §12 |
| `patterns` | Generator coroutines + bullet-pattern DSL | feat §12, tech §4.6 |
| `bosses` | Multi-part bosses, phases, WARNING intro | feat §13 |
| `collision` | Shapes, uniform grid, terrain queries | feat §22, tech §4.5 |
| `stage` | Timeline, camera path, checkpoints, tilemap, parallax | feat §14, §10 |
| `scoring` | Score, hi-scores, lives, extends | feat §15 |
| `rank` | Dynamic difficulty 0–31 | feat §15 |
| `scenes` | Scene stack / state machine, Back semantics | feat §17, §22 |
| `ui` | Canvas UI kit model, HUD model, text layout | feat §17, tech §4.10 |
| `replay` | Input recording/playback, state hashes | feat §21 |
| `save` | Versioned persistence via `Platform.storage` | feat §21 |
| `data` | Content schemas & loaders for `content/` | feat §14, §22 |
| `fx` | Hit-stop, shake, flash (sim side) | feat §18, §20 |
| `debug` | God mode, frame advance, overlay counters | feat §24 |

## Scripts

```sh
pnpm --filter @shmup/core test        # Vitest (Node, headless)
pnpm --filter @shmup/core typecheck   # src (pure) + test/ (Node) programs
pnpm --filter @shmup/core build       # tsc → dist/ (ES2018 + .d.ts)
```

Consumers inside the workspace resolve `@shmup/core` to `src/index.ts` through the
`@shmup/source` export condition (no build needed for dev/test); `dist/` is for `tsc`
builds of dependent packages and any future external consumer.

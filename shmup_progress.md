# Shmup Cup — Execution Progress

> Tracks execution of [`shmup_plan.md`](shmup_plan.md). One row per plan step, in plan order.
> Maintained by the DOCS agent at the end of each step's pipeline (build → review/fix → tests → docs → CI gate).
>
> **Status values:** `pending` · `in progress` · `done` · `done (review capped)` · `blocked`

## Steps

| Step | Title | Status | Review rounds | Tests | Commits | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| M1-01 | Engine foundations: RNG, trig tables, event queue, pools | done | 1 | 871 | 760df29, dc94228, DOCSCOMMIT | `scripts/gen-trig-tables.mjs` computes both tables with BigInt fixed-point maths (no `Math.*`) and Prettier-formats them, so regeneration is byte-identical on any engine; `--check` / `--out FILE`. The angle constants live in the generated `math/trig-table.ts`; `math` also exports `wrapAngle` and **drops** the planned 16.16 helpers (IEEE `+ − × ÷` and `Math.sqrt` are already deterministic — reason in the docblock). `SimEventKind` became numeric codes + `SIM_EVENT_KIND_NAMES`; `EventQueue` gained `capacity`/`dropped`. `SoaPool<S>` is schema-generic and adds `pendingFreeCount`/`clear()`, with field arrays in sorted name order. `rng.setState` also takes a `Uint32Array`, `RNG_STATE_WORDS` is exported, `callCount` is diagnostic. ESLint: the `**` ban forced re-listing the Chrome-69 `no-restricted-syntax` entries in the core block, and the Node-built-in `no-restricted-imports` moved from `patterns` to `paths` (gitignore-style matching made `events` match the core's own module). **Bug found by the TEST agent:** `drain()` released the whole pending block before visiting it, so a visitor that overflowed the ring had its own pushes visited as pending (and again next drain); slots are now released one at a time, overflow drops the unvisited originals and ends the drain, and `clear()` mid-drain ends it too (regression tests in `events-edge.test.ts`). |
| M1-02 | Content schemas, loader & content module | pending | — | — | — | — |
| M1-03 | Placeholder asset pipeline (sprites, font, atlas) | pending | — | — | — | — |
| M1-04 | Rendering foundations & shared browser shell | pending | — | — | — | — |
| M1-05 | Remote-first input profiles | pending | — | — | — | — |
| M1-06 | Sim world, tick pipeline, player ship & collision | pending | — | — | — | — |
| M1-07 | Stage runtime: camera, timeline, checkpoints, terrain, parallax | pending | — | — | — | — |
| M1-08 | Enemies, behaviour scripts & movement | pending | — | — | — | — |
| M1-09 | Enemy bullets, lasers & attack patterns | pending | — | — | — | — |
| M1-10 | Player weapons (Type A) & Options | pending | — | — | — | — |
| M1-11 | Power meter, capsules, Force Field & Mega Crash | pending | — | — | — | — |
| M1-12 | Death, respawn, checkpoints, lives & score | pending | — | — | — | — |
| M1-13 | Bosses & the WARNING sequence | pending | — | — | — | — |
| M1-14 | FX & game feel | pending | — | — | — | — |
| M1-15 | Audio engine & procedural placeholder SFX/music | pending | — | — | — | — |
| M1-16 | Scene flow, canvas UI kit & HUD | pending | — | — | — | — |
| M1-17 | Saves, audio options & platform integration | pending | — | — | — | — |
| M1-18 | Zone A content, boss & 4-way playtest bot | pending | — | — | — | — |
| M1-19 | Debug tools, replays, golden tests & M1 release check | pending | — | — | — | — |
| M2-01 | Rank, difficulty presets, extends & continues | pending | — | — | — | — |
| M2-02 | Pattern DSL, bending lasers, bullet cancel & readability | pending | — | — | — | — |
| M2-03 | Meter arsenal: loadouts B–D, Weapon Edit, parking & weapon select | pending | — | — | — | — |
| M2-04 | Option & shield variants + Option Hunter | pending | — | — | — | — |
| M2-05 | Direct mode & ship select | pending | — | — | — | — |
| M2-06 | Two-player simultaneous co-op | pending | — | — | — | — |
| M2-07 | Advanced stage systems & Tiled import | pending | — | — | — | — |
| M2-08 | Presentation polish: raster effects, palettes, visual options | pending | — | — | — | — |
| M2-09 | Advanced bosses: mid-bosses, raids, multi-bosses | pending | — | — | — | — |
| M2-10 | Zone map, campaign flow, transitions & bonus stages | pending | — | — | — | — |
| M2-11 | Zones B & C | pending | — | — | — | — |
| M2-12 | Zones D & E | pending | — | — | — | — |
| M2-13 | Zones F & G | pending | — | — | — | — |
| M2-14 | Final zones H & I, endings & credits | pending | — | — | — | — |
| M2-15 | Front-end screens & attract mode | pending | — | — | — | — |
| M2-16 | Options, rebinding & accessibility | pending | — | — | — | — |
| M2-17 | Platform polish: Electron, Tizen extras, storage | pending | — | — | — | — |
| M2-18 | v1.0 hardening & release candidate | pending | — | — | — | — |
| M3-01 | Extra modes & replay features | pending | — | — | — | — |
| M3-02 | Visual & mechanic extras | pending | — | — | — | — |
| M3-03 | Reach: localization, more platforms, tracker music | pending | — | — | — | — |

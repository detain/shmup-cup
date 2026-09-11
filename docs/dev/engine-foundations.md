# Engine foundations

The four `@shmup/core` modules every later system is built on: `rng` (seeded randomness),
`math` (binary angles and lookup tables), `events` (sim → presentation queue) and `pools`
(zero-GC storage). They were filled in by plan step **M1-01**.

This page is the *how and why*: the rules you have to follow so replays stay bit-identical
and the game never allocates during a tick. Exact signatures are in
[api-reference.md](api-reference.md); the source TSDoc is the authoritative reference.

Background: `shmup_feat.md` §22 (determinism, data layout, budgets), §12 (quantised aim
directions), §19 (audio cues), `shmup_tech.md` §4.2 (no ECS), §4.6 (easing).

## Why these four exist

A replay is a seed plus the input of every tick. Replaying it has to produce exactly the
same game on the TV (Chromium 69), in desktop Chrome, in Electron and in Node — otherwise
golden tests, attract mode and the input-replay integration test are all meaningless. Two
things threaten that, and one thing threatens the frame rate:

| Threat | Answer |
|---|---|
| `Math.random()` | `core/rng`: two seeded sfc32 streams |
| `Math.sin` and friends are *not* exactly specified by IEEE 754 — engines round them differently | `core/math`: committed lookup tables, generated with BigInt arithmetic |
| GC pauses at 60 Hz | `core/pools` + reused records in `core/events`: nothing allocates after startup |

ESLint enforces all three inside `packages/core/src` (layer 4 of `eslint.config.js`), and
`test/integration/eslint-rules.test.ts` lints fixture snippets to prove the rules are
still live.

## `rng` — seeded randomness

```ts
import { createRngStreams } from '@shmup/core';

const rng = createRngStreams(config.seed);
const lane = rng.gameplay.rangeInt(0, 3);   // affects the simulation
const spark = rng.cosmetic.nextFloat();     // presentation only
```

- **sfc32**, 128 bits of state, seeded by four `splitmix32` words derived from the low 32
  bits of the seed, then warmed up 12 steps. Only `|0`, `>>>`, `^`, `+` and `Math.imul`
  are used, all exactly specified by ECMAScript.
- **Two streams, one seed.** `gameplay` is seeded with the seed itself; `cosmetic` with
  `splitmix32(seed ^ 0x9e3779b9)`. The split is what lets particles, shake and other
  presentation code draw as much as they like without shifting the sequence a replay
  depends on.
- `rangeInt(min, max)` is inclusive and **always advances the stream exactly once**, even
  when `min === max`. That is deliberate: a call site must consume the same number of
  draws on every run, whatever the bounds happen to be that tick.
- `nextFloat()` is `nextU32() / 2^32` — uniform in `[0, 1)` in steps of 2^-32.
- Snapshots: `getState()` allocates a 4-element array (fine at a checkpoint), while
  `getStateInto(out)` writes into a caller-owned `Uint32Array` of at least
  `RNG_STATE_WORDS` (use this per tick). `setState()` accepts either.
- `callCount` is **diagnostic only** — the debug overlay shows it to spot accidental
  draws. It is not part of the state and `setState()` does not restore it.

**Rules.** Only the gameplay stream may influence simulation state. Never re-seed
mid-session. Never make a draw conditional on something the replay does not know about
(frame timing, display size, whether the debug overlay is open).

## `math` — binary angles and tables

Angles are **binary angles**: `ANGLE_UNITS` = 1024 steps per turn, `0` = +x (right),
increasing **clockwise on screen** because world y points down. A quarter turn is 256.

```ts
import { atan2B, cosB, quantizeAngle, sinB } from '@shmup/core';

const toPlayer = quantizeAngle(atan2B(py - ey, px - ex), 16);  // aimed shot, 16 flavours
bullet.vx = cosB(toPlayer) * speed;
bullet.vy = sinB(toPlayer) * speed;
```

- `sinB` / `cosB` read `SIN_TABLE_Q16`, converted once at module load to a `Float64Array`
  by dividing by 65536 (a power of two, so the conversion is exact). Accuracy versus the
  real value: 7.7e-6. `cosB` reads the table's quarter-turn overhang, so neither function
  wraps twice.
- `atan2B(dy, dx)` reduces to one octant, looks the slope up in `ATAN_TABLE` and mirrors
  back: within ±1 unit, and `0` for the zero vector. The argument order mirrors
  `Math.atan2(y, x)`.
- `angleDelta(from, to)` is the signed shortest rotation in `[-512, 512)`;
  `turnToward(from, to, maxStep)` is the homing primitive built on it.
- `EASINGS` holds eight curves (`linear` … `inOutSine`). They do **not** clamp their
  input — pass `clamp(tick / duration, 0, 1)`. Content refers to them by
  `EasingName` and resolves the name to a function once at load, never per tick.

**No fixed point.** The skeleton planned 16.16 helpers; M1-01 dropped them. `+ − × ÷` and
`Math.sqrt` are exactly specified by IEEE 754 and therefore already deterministic across
engines, so positions and velocities stay plain `number`. Fixed point would have cost
precision and speed for nothing. The reason is recorded in the module docblock.

**Banned in `packages/core`** (lint errors, with the replacement in the message):
`Math.sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `exp`, `log`, `pow`, `hypot`,
`cbrt`, and the `**` operator (`x ** 2` → `x * x`). `Math.sqrt`, `Math.abs`, `Math.floor`,
`Math.round`, `Math.min/max` and `Math.imul` are fine — they are exactly specified.

### Regenerating the tables

`packages/core/src/math/trig-table.ts` is **generated and committed**:

```sh
pnpm trig:tables                              # rewrite the committed file
node scripts/gen-trig-tables.mjs --check      # exit 1 if it is stale
node scripts/gen-trig-tables.mjs --out FILE   # write elsewhere (what the test does)
```

The script computes everything with **BigInt fixed-point arithmetic** — Machin's formula
for π, Taylor series for sine, tangent boundaries for the arctangent table — so it never
calls `Math.*` and its output is byte-identical on any engine. It cross-checks itself
against the host `Math` before writing and formats the result through Prettier, so the
generated file passes `format:check`. `packages/core/test/math/trig-table.test.ts`
regenerates and diffs the committed copy; if you edit the script, re-run `pnpm trig:tables`
in the same commit.

## `events` — the sim → presentation queue

The simulation never touches the renderer or the mixer. It pushes fixed-size numeric
records; once per displayed frame the host drains them.

```ts
const events = createEventQueue();                       // 256 slots by default
events.push(SimEventKind.Sfx, SFX_CUES.EnemyExplodeSmall, x, y, 0);
// … once per frame, in the host:
events.drain((e) => dispatch(e.kind, e.id, e.x, e.y, e.param));
```

In the apps the queue is `game.events` and the host is `@shmup/shell`: its frame loop calls
`game.events.drain(dispatcher.visit)`, which routes each record to the handlers registered
with `shell.events.on(kind, handler)` ([rendering-and-shell.md](rendering-and-shell.md#the-frame-loop-and-event-dispatch)).

- Storage is a ring of typed arrays (`kind: Uint8Array`, `id: Uint16Array`,
  `x`/`y`/`param`: `Float64Array`), so `push` never allocates. `drain` hands `visit` **one
  reused record** — copy the fields out, never keep the reference.
- **Drop-oldest.** Presentation events are best-effort: a full ring overwrites the oldest
  pending event and counts it in `dropped`. A rising `dropped` in the debug overlay means
  a system is emitting more than the frame can consume, not that the queue is broken.
  `clear()` empties the ring and resets the counter.
- **Events pushed from inside `drain` stay queued for the next drain**, so a visitor that
  emits events cannot loop forever. If such a visitor pushes enough to overflow the ring,
  the events this drain had not reached yet are the ones dropped, and the drain ends
  there; a visitor that calls `clear()` also ends it. (The first implementation released
  the whole pending block up front and re-visited overwritten slots — caught by the test
  agent, regression tests in `packages/core/test/events/events-edge.test.ts`.)
- The module owns the canonical cue registries `SFX_CUES` (21 cues) and `MUSIC_CUES`
  (15 cues) plus their `*_NAMES` arrays. The sim emits numbers; `content/audio/` binds the
  names to samples (M1-15).

**Ids and kind codes are part of the replay/debug format: append, never renumber.** Adding
a kind means adding a code to `SimEventKind`, a name to `SIM_EVENT_KIND_NAMES` and a case
to the host dispatcher.

## `pools` — zero-GC storage

Two shapes, picked by count (`shmup_tech.md` §4.2 — deliberately **not** an ECS):

```ts
// many, homogeneous → struct of arrays
const bullets = createSoaPool(512, { x: 'f64', y: 'f64', vx: 'f64', vy: 'f64', sprite: 'u16' });
const i = bullets.alloc();                  // -1 when full: drop the spawn
if (i >= 0) { bullets.fields.x[i] = px; bullets.fields.y[i] = py; }

// few, behaviour-rich → pooled objects
const enemies = createPool(() => new Enemy(), 64, (e) => e.reset());
const enemy = enemies.acquire();            // null when exhausted
```

- `alloc()` returns `count++` and **zero-fills** the slot, or `-1` when full — a full pool
  drops the spawn, it never grows.
- `free(i)` only *marks* the slot (deduplicated, out-of-range indices ignored). `flush()`
  sorts the pending list descending with an insertion sort and swap-removes. Call it once,
  in the deferred-removal phase of the tick.
- **Slot indices are stable only within a tick.** After a flush the last live entries have
  moved. Anything that must outlive a flush stores its own id, not an index.
- Field arrays are created in **sorted field-name order**, so a future state hash does not
  depend on how the schema literal was written.
- `pool.fields` is typed from the schema (`SoaPool<S>` is generic), so `fields.x` is a
  `Float64Array` and a typo is a compile error.
- `Pool<T>` preallocates every object at creation; `acquire()` runs the optional `reset`
  and returns `null` when empty; `release()` throws if more objects come back than went
  out.

## Testing

- Unit suites live in `packages/core/test/{rng,math,events,pools}/`, with a
  `*-edge.test.ts` beside each `*.test.ts` for the boundary cases (known-answer vectors,
  octant boundaries, ring re-entrancy, exact swap-remove mappings).
- `packages/core/test/math/trig-table.test.ts` proves the committed table is what the
  script produces.
- `test/integration/engine-determinism.test.ts` drives all four modules together as a
  miniature fixed-step sim and compares committed golden state hashes for three seeds —
  the first line of defence for the real golden replays in M1-19. If it fails after an
  intentional change, re-bless it deliberately and say why in the commit message.
- `test/integration/eslint-rules.test.ts` checks that `Math.sin(x)` and `x ** 2` are still
  lint errors inside `packages/core`.

## Gotchas

| Symptom | Cause |
|---|---|
| A replay diverges only on the TV | A transcendental or `**` slipped into a path the lint does not cover (a presentation package doing sim work) |
| A replay diverges everywhere after a refactor | A `rangeInt` call was skipped or added on some code path — draw counts must match tick for tick |
| `dropped` climbs during play | More events per frame than the ring holds; raise the capacity at `createEventQueue(n)` or emit less |
| An entity references the wrong bullet after a kill | A slot index was stored across a `flush()` |
| `format:check` fails on `trig-table.ts` | The file was hand-edited; run `pnpm trig:tables` |
| `pnpm lint` complains about `Math.pow` | Use repeated multiplication; `Math.sqrt` is allowed |

## Next steps that build on this page

M1-06 wires the pools and the event queue into the tick pipeline, M1-09 uses `quantizeAngle`
and `atan2B` for aimed patterns, M1-14/M1-15 consume the event kinds and cue registries,
and M1-19 hashes pool contents and RNG state for the golden replays.

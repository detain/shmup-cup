# Pattern DSL, bending lasers, bullet cancel and readability

How enemy attacks became **data** in plan step **M2-02**: the BulletML-inspired **pattern DSL**
(`content/patterns/`, kind `patterns`) — its file format, the **expression compiler** and the
**pattern compiler** that turn every action into a stack-machine program in one `Float64Array`,
and the zero-allocation **interpreter** (`PatternVm`) that runs enemy patterns from the script
runner and bullets' own programs from the bullet update — plus the rest of the step in brief: the
**bending lasers**, bullets **cancelled into point items** that fly to the score, and the
**colour-blind bullet palettes** with shape coding. `core/patterns` is `implemented` with it.

This page is the *how and why* of the DSL and the map of the whole step. Exact signatures are in
[api-reference.md](api-reference.md#patterns--behaviour-coroutines-movers-fire-primitives-and-the-pattern-dsl);
the TSDoc in `packages/core/src/patterns/dsl.ts` (format, compilers, program layout) and
`packages/core/src/patterns/index.ts` (interpreter) is the authoritative reference. The format
for authors is next to the data: [`content/patterns/README.md`](../../content/patterns/README.md).
The other parts of the step live on their home pages:

| Part | Home page |
|---|---|
| Bending lasers, cancel into point items, the bullet pool's program fields | [bullets-and-patterns.md](bullets-and-patterns.md#bending-lasers) |
| The palettes in the renderer and the shell | [rendering-and-shell.md](rendering-and-shell.md#colour-blind-bullet-palettes) |
| The palette sprite variants (`palettes.mjs`), `lasers/bend-*`, `items/point` | [asset-pipeline.md](asset-pipeline.md#procedural-generators-scriptsassetsprocedural) |
| `UserOptions.display.bulletPalette`, the Options screen's BULLETS | [saves-and-options.md](saves-and-options.md#user-options-coreconfig) |
| The `scoring` rules section | [content-data.md](content-data.md#what-loadcontent-does), [`content/rules/README.md`](../../content/rules/README.md) |
| The `pattern.loop` behaviour and the `ScriptApi` additions | [enemies-and-behaviors.md](enemies-and-behaviors.md#behaviours-corebehaviors) |

Background: `shmup_feat.md` §12 (the BulletML-inspired pattern DSL "as TS/JSON — not XML",
bending lasers as a ring buffer of head positions with subsampled hitbox nodes, bullet cancel into
points, the readability palette) and §21 (colour-blind bullet palettes and shape coding); plan
§3.2 (tick phases 4 and 5), §3.5 (the `patterns` kind is `core/data`'s) and decisions **D17**
(4-way-dodgeable density and speeds), **D27** (table trigonometry only), **D28** (in-house schema
combinators) and **D29** (coroutines sleep; per-tick work lives in numbers).

## The picture at a glance

```text
content/patterns/*.patterns.json ──► core/data loadContent (kind `patterns`, PATTERNS_FILE_SCHEMA)
   collected in path order ──► compilePatternBank(files, issues)   ← before references resolve
        parse (recursive descent) → close ($n, fold) → postfix → one Float64Array
        actionRef / bulletRef inlined · params → constants or runner locals · bullet programs
   ──► ContentDb.patterns = { code, actions, actionIndex, entries, bullets }
content/enemies  "pattern": "common.spiral"  ──► EnemySpec.patternId (ref kind `pattern`)

createWorld
 ├─ world.patterns = createPatternVm(world)      576 runners in typed arrays
 └─ world.bullets.setProgramRunner(world.patterns)

stepWorld, every tick
 ├─ 4 scripts   pattern.loop coroutine wakes → api.stepPattern()
 │                 └─ PatternVm.stepEmitter(slot, enemy, canFire)  runs to the next `wait`
 │                      Fire → bullets.launch(shot, kind)  (+ a bullet runner if it has actions)
 │              yield wait   ← the pattern's wait is the coroutine's sleep (D29)
 ├─ 5 movement  bullets.update(): … age++ → runner due? PatternVm.runBullet(i) → change / homing /
 │              accel (timed terms) / move; bending lasers fly and record; point items fly home
 ├─ 6 collision bullet circles, laser capsules, bending laser circle chains × ships
 └─ 8 removal   pools flushed (enemyBullets, enemyLasers, cancelPoints)
 hashWorld: … pools (cancelPoints among them) → bending lasers → pattern runners in use → …
```

## The file format

A `patterns` file holds named **actions** and named **bullets**; ids are global across files
(prefix them with the file's name: `common.fan-5`). A pattern an enemy runs *is* an action.

```jsonc
{
  "formatVersion": 1,
  "kind": "patterns",
  "actions": [{ "id": "example.burst", "body": [ /* nodes */ ] }],
  "bullets": [{ "id": "example.shot", "kind": "oval-pink", "actions": [ /* nodes */ ] }]
}
```

| Node (`op`) | Fields | In an enemy's pattern | In a bullet's program |
|---|---|---|---|
| `fire` | `direction?`, `speed?`, `bullet?` / `bulletRef?`, `params?` | fires one bullet (the fire rule applies) | fires one bullet from the bullet |
| `wait` | `ticks`, `ranked?` | sleeps — the coroutine's `yield` | sleeps (the bullet keeps moving) |
| `repeat` | `times`, `body` | loops; `$i` counts from 0 | same |
| `changeSpeed` | `speed`, `term?` | evaluated, no effect | the bullet's speed |
| `changeDirection` | `direction`, `term?` | sets the heading `relative` fires measure from (not `sequence`) | the bullet's heading |
| `accel` | `accel`, `min?`, `max?`, `term?` | evaluated, no effect | the bullet's acceleration |
| `vanish` | — | ends the pattern | removes the bullet (no sparkle) |
| `actionRef` | `action`, `params?` | inlined at load | inlined at load |

A **bullet** (`{ kind?, direction?, speed?, actions? }`, inline in a `fire` or named) gives the
look (`kind` — `<shape>-<colour>`, `round | oval | needle` × `pink | red | purple`, default
`round-pink`; the names come from the leaf `core/bullets/kinds.ts`, so `core/data` never imports
the bullet system), the direction and speed a `fire` uses when it gives none, and optionally its
own **program** (`actions`). A `fire` without a direction is aimed; without a speed it flies at
`DEFAULT_PATTERN_SPEED` (1 px/tick).

**Directions** `{ type, value }` are binary angle units (1024 per turn, 0 = +x, 256 = down —
`core/math`): `aim` (default — at the nearest living player, snapped to `config.aimDirections`,
plus the value), `absolute`, `relative` (to the runner's own heading: a bullet's; an enemy's is the
`heading` it started with — left — until its `changeDirection` sets another) and `sequence` (to the
previous `fire` of the same runner; the first one is aimed). **Speeds** are an expression
(absolute) or `{ type: absolute | relative | sequence, value }` — `relative` to the bullet's own
speed (0 for an enemy), `sequence` to the previous fire's (1 before the first). Speeds are px/tick
**on Normal**: the interpreter multiplies them by the rank's bullet speed scale, like the M1-09 fire
primitives.

**Changes over time.** `changeSpeed` / `changeDirection` with a `term` reach their target evenly
over `term` ticks and **land on it exactly** (the bullet pool's new `accelTerm` / `termSpeed` and
`turnTerm` / `termAngle` fields — a turn takes the short way); `term` 0 applies at once. A
`sequence` value is instead a change **per tick** for `term` ticks (BulletML's meaning). `accel`
is the engine's speed-along-heading acceleration (`accel` px/tick², clamped to `[min, max]` —
defaults 0 and 16 — for `term` ticks, 0 = until changed), not BulletML's horizontal / vertical
pair: bullets here are polar. `wait` has a `ranked` flag: `round(ticks ÷ the rank's fire rate)`,
at least 1 — exactly `ScriptApi.fireWait`. A plain `wait` below 1 does not wait; fractions are
floored.

## Expressions

Every number field is a JSON number or an **expression string** (≤ 256 characters): `+ - * / %`,
unary `-` / `+`, parentheses, the functions `floor`, `round`, `abs`, `min`, `max`, `sin`, `cos`
(binary units, the committed Q16 sine table — D27) and the variables:

| Variable | Value |
|---|---|
| `$rank` | `world.rank` (0–31) when the expression runs |
| `$rand` | one gameplay-RNG draw in `[0, 1)` per occurrence and evaluation (replay-safe) |
| `$loop` | `world.rankInputs.loop` (1 until the campaign of M2-10) |
| `$i` | the innermost running `repeat`'s index, from 0 (0 outside any) |
| `$1` … `$9` | the `params` of the reference that inlined the node (0 in a pattern run on its own) |

**The expression compiler** (`compileExpression`, the same code the pattern compiler uses): a
tiny **recursive-descent parser** (`sum → product → unary → primary`) builds a syntax tree —
there is no `eval` and no `new Function` (both would be CSP- and determinism-hostile) — then
`close` substitutes the params and **folds** every constant subtree with `applyExprOp` (the
interpreter's exact arithmetic, so a folded value equals the one computed at run time, bit for
bit), then `emitPostfix` writes `[length, …postfix]`. A tree deeper than `MAX_EXPR_STACK` (32) is
rejected. A syntax error is a `SyntaxError` with its position (`unexpected ")" at 7`); the file
schema calls the parser too, so a bad expression is a **schema issue of its file** — and a file
failing its schema contributes nothing.

```ts
compileExpression('2 + 3 * 4');      // → [2, ExprOp.Const, 14]          (folded)
compileExpression('$rank / 8 + 1');  // → [7, Rank, Const, 8, Div, Const, 1, Add]
compileExpression('$1 * 2', [3]);    // → [2, Const, 6]                  (a constant param folds)
```

## The pattern compiler (`compilePatternBank`)

`loadContent` collects every valid `patterns` file (in path order) and, **after** all files are
in but **before** the references are resolved, compiles them together — so an enemy's `pattern`
resolves against the compiled action ids (`ContentDb.patterns.actionIndex`), and the compiler's
issues join the load's (paths like `patterns/common.patterns.json:actions[1].body[0].direction`).
It allocates freely: it runs once, at load.

- **One bank, one program per action.** `code` is one `Float64Array`; offset 0 is an `End`, so
  entry 0 means "no program". Actions compile in registration order (files by path, then
  document order); `entries[i]` is action `i`'s offset.
- **Inlining.** `actionRef` and `bulletRef` are **inlined** — the interpreter needs no call stack
  and a runner's state stays a fixed set of numbers. Recursion is an issue, with one exception: a
  bullet may `bulletRef` **itself without params** (its program is shared, so the recursion is a
  loop through the bullet pool, which bounds it — 512 bullets).
- **Params are values** (BulletML's meaning; review round 1). A **constant** param is substituted
  and folded. Any other param is evaluated **once, when the reference runs**, into a **runner
  local**: an `actionRef` emits `SetLocal [9, slot, expr]` before the inlined body; a `fire`
  evaluates its `bulletRef`'s params as **args** first — its own direction and speed read them
  (`ExprOp.Arg`) — and the launched bullet's runner starts with them as its locals. `$n` then
  compiles to `ExprOp.Local`. So `"params": ["$i"]` passes the caller's loop index (inside the
  referenced action `$i` is its own loop's), and a `$rand` param is one draw, the same wherever
  `$1` is used. At most `MAX_PATTERN_LOCALS` (16) values are live in one program at once (nested
  references); more is an issue. An inline bullet with actions inside a referenced action receives
  the enclosing param values the same way.
- **Bullet programs.** A bullet with `actions` gets a program of its own. Fired **without params**
  it is compiled once and **shared** by every `fire` naming it (keyed by the spec and by whether
  missing `$n` are an issue); with params each fire site compiles its own copy. Programs are
  queued as jobs and compiled after the action that first fired them; a job records its entry
  before its code is emitted, so every `fire` — also ones compiled later, or the bullet firing
  itself — links to the same program (review round 1 fixed a `fire` left at entry 0).
- **Failure spreads.** An action gets entry 0 (it runs nothing) when it has an issue, inlines an
  action that had one (even one reported once and deduplicated), or launches a bullet program that
  had one — directly or through other bullets.
- **Limits.** `repeat` nests at most `MAX_REPEAT_DEPTH` (4) deep **after inlining** (a bullet
  program restarts at 0); ≤ 9 params per reference; ≤ 256 nodes per list; ≤ 1024 actions and
  bullets per file; the whole bank ≤ `MAX_PATTERN_CODE` (262,144 numbers — 2 MB), beyond which
  every entry is 0.

**Reported** (each once per path and message): duplicate action / bullet ids, unknown or recursive
references, `bullet` and `bulletRef` in one `fire`, `params` without a `bulletRef` (they used to be
dropped silently — a TEST-agent fix), `$n` beyond a reference's params, more than 16 live locals,
bad expressions (as a 0), `repeat` too deep, an expression too deep, the bank too large.

### Program layout

Every expression is `[length, …postfix]`; `PatternOp` codes:

| Op | Layout |
|---|---|
| `End` 0 | `[0]` |
| `Wait` 1 | `[1, ranked, expr]` |
| `Repeat` 2 | `[2, exitPc, expr]` — below 1 jumps to `exitPc` |
| `Loop` 3 | `[3, bodyPc]` — the end of a `repeat` body |
| `Fire` 4 | `[4, dirType, speedType, kind, bulletEntry, argCount, …args, dirExpr, speedExpr]` |
| `ChangeSpeed` 5 | `[5, speedType, speedExpr, termExpr]` |
| `ChangeDirection` 6 | `[6, dirType, dirExpr, termExpr]` |
| `Accel` 7 | `[7, flags (1 min, 2 max), accelExpr, minExpr, maxExpr, termExpr]` |
| `Vanish` 8 | `[8]` |
| `SetLocal` 9 | `[9, slot, expr]` |

`ExprOp`: `Const 0` (+ the number), `Rank 1`, `Rand 2`, `Loop 3`, `Index 4`, `Add 5`, `Sub 6`,
`Mul 7`, `Div 8`, `Mod 9`, `Neg 10`, `Floor 11`, `Round 12`, `Abs 13`, `Min 14`, `Max 15`,
`Sin 16`, `Cos 17`, `Local 18` (+ slot), `Arg 19` (+ index).

## The interpreter (`PatternVm`)

`createPatternVm(world)` is called by `createWorld` (`world.patterns`) and installed as the bullet
system's `BulletProgramRunner` — `core/bullets` calls it through that interface and never imports
the interpreter (no module cycle).

**Runners.** `PATTERN_RUNNERS` = 576 slots in typed arrays (`PatternRunners`, read-only for
others): slots `0 … 63` are the **emitters**, one per enemy slot; slots `64 … 575` are handed out
to **bullets** fired with `actions` (a bullet stores `runner + 1` in its pool field `runner`). A
bullet runner is the first free slot from a **rotating hint** (`meta[0]`), so which slot a bullet
gets depends only on hashed state; it is freed when the program ends or the bullet goes
(`killBullet` → `release`). A runner holds its program counter and entry, a `repeat` stack (4 ×
index / count), 16 locals, the previous fire's direction and speed (`sequence`), its heading
(emitters: `relative`), the rank speed scale it fires with (bullets: the one they were fired with)
and the age it runs again (bullets).

**Emitters.** `ScriptApi.startPattern(pattern, heading = 512)` → `PatternVm.startEmitter(slot, …)`
(`false`, and the emitter stopped, for a bad slot, a bad index or an action with entry 0);
`ScriptApi.stepPattern()` → `stepEmitter(slot, enemy, canFire())` runs until a `wait` and returns
its ticks — the coroutine **yields them** (D29: the script runner already sleeps and wakes, so the
interpreter needs no clock of its own) — or `-1` at the end. The enemy system stops the emitter
when the enemy is removed. Fires obey the **fire rule**: while `canFire()` is false (off screen,
not settled, a ghost) the pattern still advances and computes everything, but launches nothing —
the same rule as the primitives, so nothing fires off screen.

**Bullet programs.** In phase 5 `BulletSystem.update` calls `runBullet(i)` for a bullet whose
`runner` is set, **after** `age++` and **before** its change, homing and kinematics, when its wake
age has come (a new runner runs on the bullet's first moving tick). A `wait` sets the next wake
age; a program that ends frees its runner and the bullet flies on; `vanish` removes the bullet.
When the program ran, the bullet's velocity is recomputed that tick.

**Firing.** A `Fire` evaluates its args, then its direction (resolved against `aim` from the
runner's position, its heading, or its previous fire) and speed; records both for `sequence`;
and — when it may fire — launches one bullet (`BulletSystem.launch` with a reused `BulletShot`) at
`speed × scale`: an emitter's scale is `bullets.speedScale` at that moment (the session's, or the
enemy's rank modifiers while its script runs — M2-01), a bullet's is the scale it was fired with,
passed on to its children. A bullet with a program gets a runner; its locals start as the args.

**The step budget.** One run executes at most `PATTERN_STEP_BUDGET` (1,024) instructions; then
the runner sleeps a tick on its own and resumes deterministically. A `repeat` without a `wait`
can therefore never hang a tick. Waits are capped at `MAX_PATTERN_WAIT` (1,000,000 ticks);
`repeat` counts are floored (below 1 skips the body).

**Zero allocation.** Everything is typed arrays and class fields; expressions run on a
preallocated `Float64Array` stack whose slot 0 holds the result; fractional values never cross a
non-inlined call. `$rand` draws through the new **`Rng.nextFloatInto(out, index)`**, which writes
the float into the stack — `nextFloat()`'s fractional return value was boxed into a heap number on
every draw.

### The `pattern.loop` behaviour

The one behaviour that runs DSL patterns (`core/behaviors`, `needsPattern` — `checkEnemyBehaviors`
reports `enemies:<id>.pattern` when the enemy names none):

```ts
function* pattern(api, p): Script {          // tunables: restTicks 60, heading 512 (left)
  if (!api.startPattern(api.spec.patternId, p.heading)) yield SLEEP_FOREVER; // idles, keeps its mover
  for (;;) {
    const wait = api.stepPattern();
    if (wait > 0) { yield wait; continue; }  // the pattern's waits are the coroutine's sleeps
    yield rest;                              // pattern over: rest, then start it again
    api.startPattern(api.spec.patternId, p.heading);
  }
}
```

It sets no mover — the enemy moves with its spec's `mover`. Boss behaviours and revenge bullets do
not run DSL patterns yet (M2-09), and no DSL node fires a laser.

## Shipped content

- [`common.patterns.json`](../../content/patterns/common.patterns.json) — the library:
  `common.fan-5` (an aimed 5-way of red ovals, 40 units apart, ranked 90-tick rest),
  `common.spiral` (24 volleys, every 8 ticks, of two pink needles 512 apart turning 44 units a
  volley — `sequence` directions and speeds), `common.ring` (`8 + floor($rank / 4) * 2` purple
  rounds, ranked 120-tick rest), `common.homing-ring` (six `common.turner` ovals that slow down,
  turn to aim and speed up) and `common.splitter` (a red shell that bursts into six pink rounds
  `relative` to its heading after 45 ticks and vanishes).
- [`example.patterns.json`](../../content/patterns/example.patterns.json) — the format sample
  (`example.aimed-3way`, `example.burst` = `example.stack` with constant params `[4, 0.25]`).
- The test enemy **`sentry`** — [`content/enemies/test-sentry.enemies.json`](../../content/enemies/test-sentry.enemies.json):
  flies to view point (300, 100), holds 600 ticks, leaves; runs `common.spiral` with `pattern.loop`
  (`restTicks` 45). It sits in a file of its own so suites that load the test range's files alone
  stay valid, and **no stage spawns it** — zone A is unchanged. The integration suite
  (`test/integration/patterns-runtime.test.ts`) spawns it.

## Bending lasers, cancel points and palettes in brief

- **Bending lasers** (`core/bullets`): 8 stable slots (`BendingLaserTable`, also the render
  contract's `BendingLaserView`), each a 64-node ring of head positions; the head homes for
  `homing` ticks at ≤ `turnRate`, then flies straight; after `life` ticks, or when it leaves the
  view ± 16 px or enters terrain, the tail catches up one node per tick. The hitbox is a chain of
  circles (diameter `width`) on every `floor(width / 2 / speed)`-th node, so neighbours overlap;
  a hit is a `Laser` hit. Fired with `fireBendingLaser(world, src, …)` or
  `ScriptApi.bendingLaser(…)` (fire rule, rank-scaled speed); drawn as unrotated round segment
  sprites (`lasers/bend-*`) at every node by render-pixi's `createBendingLaserBinding`. No shipped
  content fires one yet. → [bullets-and-patterns.md](bullets-and-patterns.md#bending-lasers)
- **Cancel into points** (`CancelMode.Points`): a boss's death (→ its killer) and a Mega Crash
  (→ the bomber) turn every cancelled bullet into a gold point item (pool `cancelPoints`, drawn
  on `ITEMS`) that drifts 12 ticks, then accelerates to the credited player's score in the top
  HUD bar and adds `bulletCancel` points (`content/rules/scoring.rules.json`, default 10) — after
  180 ticks at the latest; a full item pool credits at once. The player's death still only
  sparkles. → [bullets-and-patterns.md](bullets-and-patterns.md#cancel)
- **Colour-blind palettes**: `BULLET_PALETTES` (`standard`, `deuteranopia`, `protanopia`,
  `tritanopia`) in `UserOptions.display.bulletPalette` (saved; the Options screen's **BULLETS**);
  the asset pipeline draws every bullet, beam and bend segment again as `<sprite>@<palette>`,
  recoloured and shape-coded (pink a solid core, red a dark centre, purple a single bright dot);
  the renderer swaps its sprite tables (`setBulletPalette`) — the simulation never knows.
  → [rendering-and-shell.md](rendering-and-shell.md#colour-blind-bullet-palettes)

## Determinism, hashing and golden replays

The interpreter reads only the World's hashed state (`rank`, `rankInputs.loop`, the gameplay RNG,
the bullet pool) and its own runners, and computes with IEEE `+ − × ÷`, `Math.floor / round /
abs` and the committed sine table — bit-identical on every engine. `hashWorld` mixes, after the
registered pools, the bending lasers (each slot's active flag; an active slot's fields and body
nodes) and the **runners in use** (the search hint and count, then per runner in use its slot,
state, entry, counter, `repeat` stack, all 16 locals, wake age, `sequence` values, heading and
scale). A checkpoint restart (`clearSession` → `BulletSystem.clear`) frees every bullet runner,
stops every emitter and removes the bending lasers.

The golden replays were **re-blessed** in the build commit (`3f69cf1`): the bullet pool's new
fields and the new `cancelPoints` pool change every hash, and bullets cancelled by a boss's death
or a Mega Crash now score (the boss run +180 points); all four runs keep their outcome. The review
fixes and the tests changed no golden (zone A runs no DSL runner).

## Zero allocation

`packages/core/test/patterns/patterns-alloc.test.ts` (its own worker) runs two `pattern.loop`
emitters firing 40-bullet volleys whose bullets run programs (timed turns, speed changes,
sub-fires, `vanish`, param values, `$rand`), bending lasers re-fired as they end, and a
`CancelMode.Points` cancel every 200 ticks, for 10,000 ticks after a 20,000-tick warm-up — under
64 KB, with more than 60 bullet programs live at once and more than 20 point items in flight. The
render-pixi bending laser binding has its own guard. What kept it at zero:

| Rule | Where |
|---|---|
| A fractional result of a non-inlined call is boxed | `$rand` uses `Rng.nextFloatInto(stack, sp)` instead of returning `nextFloat()` |
| Fractional arguments are boxed too | the interpreter hands a launch over in a reused `BulletShot` class (`launch(shot, kind)`), the bending laser homing reads its point from class fields (`aimX` / `aimY`) instead of arguments |
| Keep state in typed arrays / class fields | the runner table, the expression stack and the args buffer are preallocated `Int32Array` / `Float64Array`s; the interpreter is one class with monomorphic methods |
| Coroutine resumes allocate their result (D29) | emitters wake only on their `wait`s — a pattern never runs a `yield 1` loop |
| Pixi transform setters allocate | bending laser segments are round sprites placed per node, never rotated or scaled |

## Using it headlessly

```ts
import { KNOWN_SCRIPT_IDS, ENGINE_SPRITES, createGame, createHeadlessPlatform, loadContent } from '@shmup/core';

const { db, issues } = loadContent(files, { knownScripts: KNOWN_SCRIPT_IDS, extraSprites: ENGINE_SPRITES });
// issues: bad expressions, unknown / recursive refs, … with their JSON paths
db.patterns.entries[db.patterns.actionIndex.get('common.spiral') ?? -1]; // > 0: it compiled

const game = createGame(createHeadlessPlatform(), { stage: 'test-range', seed: 1 }, db);
const world = game.world;
const sentry = db.enemyIndex.get('sentry') ?? -1;
world.enemies.spawn(sentry, world.camera.x + 400, 100); // pattern.loop starts the spiral
for (let i = 0; i < 600; i++) game.step();
world.patterns.bulletPrograms; // bullet runners in use (0 for the spiral: its bullets have no actions)
```

A behaviour of your own can drive an emitter directly:

```ts
defineBehavior('sentry.burst', { every: 120 }, function* burst(api, p): Script {
  const id = api.spec.patternId;
  for (;;) {
    if (api.startPattern(id)) {
      for (let wait = api.stepPattern(); wait > 0; wait = api.stepPattern()) yield wait;
    }
    yield api.fireWait(p.every);
  }
}, false, true); // needsPattern
```

## Extending it

| To add… | Do this |
|---|---|
| A pattern | A `content/patterns/<file>.patterns.json` action (prefixed id); give an enemy `"script": "pattern.loop"` and `"pattern": "<id>"`; `pnpm content:check`. Keep zone speeds 4-way-dodgeable (D17: aimed ≤ 2 px/tick on Normal in zone A) |
| An expression function | An `ExprOp` code (append), an entry in `FUNCTIONS` (`[op, arity]`), the case in `applyExprOp` **and** in `PatternVmImpl.evalExpr` (they must agree — `patterns-vm-edge.test.ts` checks every operator computed at run time equals its folded value), the README's list |
| A variable | An `ExprOp` code, an entry in `VARIABLES`, its push in `evalExpr` (reading hashed World state only, never allocating); a `PatternHost` field if it needs one |
| A node | A schema branch in `NODE` (dsl.ts), a `PatternOp` code (append — codes are data in the bank), its layout in the module docs, `PatternCompiler.node` / a helper, a case in `PatternVmImpl.exec` (numbers only), the README's node table, tests in `patterns-dsl*` / `patterns-vm*` |
| Runner state | A typed array in `PatternVmImpl` (and `PatternRunners`), reset in `reset`, mixed in `core/debug` `mixPatternRunners` |
| DSL-fired lasers / boss patterns | Planned: boss behaviours and revenge bullets running DSL patterns belong to M2-09; a `laser` / `bend` node would call `BulletSystem.fireLaser` / `fireBendingLaser` from `exec` |

## Tests

| Where | Covers |
|---|---|
| `packages/core/test/patterns/patterns-dsl.test.ts` | Expression folding and precedence, table `sin` / `cos`, postfix variables, `$n` substitution, the stack limit; the bank layout, repeat / loop jumps, fire defaults, inlining, shared bullet programs linked from every action in any compile order, params as values, the locals limit, failure propagation, bullets firing themselves, change operands, issue paths and entry 0, node shapes, enemy `pattern` resolution, the `scoring` rules section |
| `packages/core/test/patterns/patterns-dsl-edge.test.ts` | Parser whitespace, number forms, unary chains, every syntax error with its position; folding = the interpreter's arithmetic; schema limits (256-char expressions, 9 params, 256 nodes, ids); repeat depth after inlining; expression depth; the bank limit; params (mixed constant / value, nested, sibling slot reuse, exactly 16 locals); strict vs loose shared inline bullets; the round-1 linking regression both ways; mutual recursion; `params` on an inline bullet reported (the TEST-agent fix) |
| `packages/core/test/patterns/patterns-params.test.ts` | Params at run time: bullet speeds 1 / 2 / 3 from a `$i` param, the caller's index inside an inlined repeat, one `$rand` draw, a bullet's direction and program agreeing, inline bullets, hashed locals |
| `packages/core/test/patterns/patterns-vm.test.ts` | **DSL = hand-written TS** (lockstep `hashWorld`): an aimed 3-way = `fireNWay`, a ring with a ranked wait = `fireRing` + `fireWait` (on Hard too), a sequence spiral = `fireSpiral`, bullet programs = `setChange` / `setMotion`; `$rank`, `$rand`, the fire rule, the step budget, `pattern.loop` restarts and idling, emitter `vanish` / heading, sub-bullets and freed runners, exact timed changes, session clear and hashing, bad patterns, two worlds in lockstep |
| `packages/core/test/patterns/patterns-vm-edge.test.ts` | Wait / repeat counts (fractions, < 1, NaN, caps, ranked), every operator at run time = folded, emitter `sequence` / `relative`, bullet programs (launch scale, short-way turns across 0, aim, accel clamps and terms, relative speed, end / vanish / off-screen release, budget), the rotating hint, stale runners, release guards, per-runner locals, enemies killed mid-pattern, `pattern.loop` tunables, lockstep `fireStack` / `fireSpray` |
| `packages/core/test/patterns/patterns-alloc.test.ts` | The allocation guard above |
| `packages/core/test/rng/rng-float-into.test.ts` | `nextFloatInto` writes exactly what `nextFloat` returns, touches only its slot and interleaves with the other draws as one stream (only its own stream of a set advances) |
| `test/integration/patterns-runtime.test.ts` | Every shipped pattern compiles and runs on `pattern.loop` enemies in lockstep; the sentry's spiral timeline; `example.burst` = `fireStack`; a boss's death credits its killer with point items |
| `test/integration/content.test.ts` | `pnpm content:check`: the shipped scoring rules equal `DEFAULT_SCORING_RULES`, the pattern library compiles and the sentry resolves to `common.spiral`; every colour-blind variant of every bullet / laser sprite exists in the atlas, frame for frame |

The bending laser, cancel point and palette suites are listed on their home pages.

## Gotchas

| Symptom | Cause / fix |
|---|---|
| A whole `patterns` file's actions are "unknown pattern action id" | One bad expression (or any schema issue) fails the **file**, and a failing file contributes nothing — fix the first issue of that file |
| An enemy with `pattern.loop` never fires | Its pattern has entry 0 (look for the compile issue — also one in an action it inlines or a bullet program it launches), it names no `pattern` (a `checkEnemyBehaviors` issue), or `canFire()` is false (off screen, not settled) |
| The first volleys of a pattern are missing | The pattern runs from the enemy's first script tick, off screen too; the fire rule drops those fires. Start with a `wait`, or give the enemy a mover that brings it on screen first |
| `$i` inside a referenced action is not the caller's loop index | By design: `$i` is the innermost running `repeat`'s. Pass the caller's as a param (`"params": ["$i"]`) |
| A `$rand` param gives the same number at every use of `$1` | By design — params are values, evaluated once when the reference runs. Write `$rand` in the referenced action to draw per use |
| `uses $2 but the reference passes fewer params` | A referenced action / bullet reads a `$n` its caller did not pass (in a pattern run on its own missing params are 0 without an issue) |
| `more than 16 param values held at once` | Too many non-constant params live in one program through nested `actionRef`s; make some constant, or flatten the nesting |
| `repeat nests deeper than 4` although the file nests less | The depth counts **after inlining** — an `actionRef` inside a `repeat` adds its own repeats |
| `recursive bulletRef … with params` | A bullet may fire itself only without params (the shared program); with params each reference compiles a copy, which cannot recurse |
| `params need a bulletRef` | `params` on a `fire` with an inline `bullet` (or none) — an inline bullet reads the enclosing params directly |
| `changeSpeed` / `accel` in an enemy's pattern did nothing | They act on the bullet running the program; in an emitter only `changeDirection` does something (the `relative` heading) |
| A `sequence` change kept going / did nothing | A `sequence` value is a per-tick change for `term` ticks — `term` 0 does nothing |
| A bullet sped past its `max` after `changeSpeed` | `changeSpeed` widens the bullet's min / max clamp to include its target so the target is reachable; `accel` sets the clamps explicitly |
| A pattern stalls a tick in the middle of a long loop | The 1,024-instruction step budget: a run that exceeds it sleeps one tick and resumes — give long loops a `wait` |
| Bullet speeds differ between an emitter and a bullet's sub-fires | An emitter fires at the current `bullets.speedScale` (the enemy's rank modifiers apply while its script runs); a bullet's program uses the scale it was fired with |
| Bending lasers are missing from the debug outlines / panel | The M1-19 overlay does not draw them and counts no bullet programs yet; the playtest bot's lane scan ignores them too (no shipped stage fires one) |

## Next steps that build on this page

- **M2-03 … M2-08** — new enemies of the later zones can be written as `pattern.loop` patterns
  instead of TS behaviours; the boss HP bar and raster effects do not touch the DSL.
- **M2-09** (advanced bosses) — boss behaviours and revenge bullets running DSL patterns,
  DSL-fired lasers and bending lasers in the boss roster.
- **M2-11 … M2-14** (zones B–I) — the first shipped enemies and bosses built on the DSL, the
  bending lasers and the colour-blind palettes' real-art variants (a PNG override of a bullet
  sprite needs its own `@<palette>` variants).
- **M2-16** (options) — the bullet palette joins the display options group.

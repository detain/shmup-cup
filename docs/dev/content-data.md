# Content data: schemas, loader and `virtual:shmup-content`

How game data gets from a JSON file under `content/` to numbers the simulation can read
every tick. Filled in by plan step **M1-02**; every later step that adds a content kind
(paths, tilesets, rules, patterns, campaign, strings) extends the same machinery.

This page is the *how and why*. File formats for content authors are in each folder's
README ([`content/README.md`](../../content/README.md) and the `player/`, `weapons/`,
`enemies/`, `paths/`, `stages/`, `tilesets/` READMEs); exact signatures are in
[api-reference.md](api-reference.md#data--content-schemas-and-loader); the source TSDoc in
`packages/core/src/data/` is the authoritative reference.

Background: `shmup_feat.md` §22 (data-driven content), §14 (stage data format), §7C
(weapons in data), §11 (enemies in data); plan decisions **D25** (content is inlined into the
bundle) and **D28** (in-house schema combinators, no runtime dependency); plan §1.5
convention *string ids become numeric indices at load*; plan §3.5 (which package validates
which kind).

## The pipeline at a glance

```text
content/**/*.json                     authored JSON, formatVersion 1
   │  (build time, Node)
   ▼
vite.shared.ts  readContentFiles()    walk, skip example.*.json, JSON.parse, sort by path
   │  shmupContent() Vite plugin
   ▼
virtual:shmup-content                 export default [{ path, data }, …]  — inlined in app.js
   │  (boot, in the browser / on the TV — @shmup/shell loadGameContent())
   ▼
@shmup/core  loadContent(files)       header → migrate → validate → collect → resolve ids
   │                                  ─► issues: ValidationIssue[]   (boot error screen)
   │                                  ─► foreign: files of kinds other packages own
   ▼
ContentDb                             arrays of specs with numeric <field>Id fields
   │
   ▼
createGame(platform, overrides, db)   game.content — systems read numbers, never strings
```

Why inline instead of `fetch()`: a Tizen widget runs from `file://`, where `fetch()` of a
local file fails on Chromium 69, and the Tizen bundle must be one classic script. Inlining
also makes the build reproducible: the generated module is byte-identical for the same
content on every machine.

**Status today.** The loader, the combinators, the `player`, `weapons`, `stage` and
`tileset` formats (the last two since M1-07 — see [stage-runtime.md](stage-runtime.md)), the
`enemies` and `paths` formats (M1-08 — see
[enemies-and-behaviors.md](enemies-and-behaviors.md#data-as-loaded)), the plugin and
`pnpm content:check` are done, since M1-13 the `enemies` kind has its boss section (see
[bosses-and-warning.md](bosses-and-warning.md#boss-data-contentenemies-the-boss-section)), and
since M2-01 the `rules` kind holds the difficulty presets and enemies may carry `revenge` bullets
(see [difficulty-and-rank.md](difficulty-and-rank.md#the-rules-kind-coredata)), and since M2-02
the `patterns` kind holds the bullet pattern DSL (compiled at load into one program bank — see
[pattern-dsl.md](pattern-dsl.md)), the `rules` kind a `scoring` section and enemies a `pattern`. Both
apps register the plugin and their
`main.ts` imports `virtual:shmup-content`; `@shmup/shell`'s `bootShell()` validates it with
`loadGameContent()` (core kinds through `loadContent()`, foreign kinds through the
`contentOwners` the apps pass — an unowned kind is an issue), stops on the boot error screen
when there is any issue, and passes `db` to `createGame` (M1-04,
[rendering-and-shell.md](rendering-and-shell.md#the-boot-sequence)).

## Files, kinds and versions

- Every file is a JSON object with a header: `"formatVersion": 1` and `"kind"`. The `kind`
  selects the schema; the loader does not care about folder or file name (the content test
  does: files must be named `<folder>/<name>.<kind>.json`).
- Core kinds (`CONTENT_KINDS`): `player`, `weapons`, `enemies`, `paths`, `stage`, `tileset`,
  `rules` (M2-01), `patterns` (M2-02). Any other kind is
  returned untouched in `foreign`, in path order, for its owning package to validate
  (`input-profiles` → input-web `rebind` since M1-05 — see
  [input-profiles.md](input-profiles.md); `fx` → render-pixi `particles` since M1-14 — see
  [fx-and-game-feel.md](fx-and-game-feel.md#particle-presets-contentfx-kind-fx); `sfx` /
  `music` → audio-web `loader` since M1-15 — see
  [audio.md](audio.md#the-content-contentaudio-kinds-sfx-and-music)).
- `example.*.json` files are format samples. The plugin never ships them;
  `pnpm content:check` validates them as their own set.
- `CONTENT_FORMAT_VERSION` is **1**. An older file is upgraded by `CONTENT_MIGRATIONS`
  (`0 → 1` exists for `weapons`, `enemies`, `stage` — format 0 was structurally identical;
  the stage migration stays the identity although M1-07 rewrote the stage format, so a
  format-0 stage stub now reports ordinary schema issues); `player` and `tileset` have no
  format 0, so such a file reports `no migration for <kind> from formatVersion 0`. A file from a *newer* version is rejected: an old build never guesses at
  a future format.

## What `loadContent` does

```ts
import contentFiles from 'virtual:shmup-content';
import { createGame, loadContent } from '@shmup/core';

const { db, issues, foreign } = loadContent(contentFiles, { knownScripts: BEHAVIOR_IDS });
if (issues.length > 0) showBootErrors(issues); // `path: message` per line
const game = createGame(platform, { seed }, db);
```

1. **Sort** the files by path, so the result never depends on the order the host listed
   them in (a test loads all 24 orders of four files and compares byte for byte).
2. **Header** — the body must be a JSON object with a non-empty string `kind` and an
   integer `formatVersion ≥ 0`; otherwise the file is skipped with an issue.
3. **Foreign kinds** go to `foreign`, untouched.
4. **Migrate** up to `CONTENT_FORMAT_VERSION`; the loader writes the new `formatVersion`
   after each step.
5. **Validate** against the kind's schema. Parsing builds *new* objects — the caller's JSON
   is never mutated — and records a `RefSite` for every `s.ref` field.
6. **Collect** the entries into the per-kind lists and `…Index` maps. A duplicate id
   (across all files of the kind) is an issue; the first file in path order wins. Enemies are
   completed here (`completeEnemy`: defaults; since M1-13 the fields a regular enemy must have,
   and a boss section checked and completed — part indices and masks, the regular fields filled
   from it); one bad entry skips its whole file, like a schema failure. A `rules` file's
   `difficulty` section (M2-01) is checked (`aimDirections` powers of two), frozen and stored as
   `db.difficulty`; a second file defining it is an issue and is ignored. Its `scoring` section
   (M2-02: `bulletCancel`, the points of a bullet cancelled into a point item, 0–10,000) is
   frozen into `db.scoring`, again from one file only. A `patterns` file (M2-02) is only
   **collected** here (in path order) — it is compiled after interning, below.
7. **Intern** sprite and script names: every distinct name gets an index in *sorted* order
   (`db.sprites`, `db.scripts`), independent of which file mentioned it first. The names in
   `options.extraSprites` join the sprite names first (M1-09: hosts pass `core/world`
   `ENGINE_SPRITES` — the enemy bullet kinds and the laser beam, which the engine draws although
   no content file names them). Then (M2-02) the **patterns are compiled**:
   `compilePatternBank` (`core/patterns` `dsl.ts`) turns every collected `patterns` file into
   one `PatternBank` (`db.patterns`) — expressions parsed and folded, `actionRef` / `bulletRef`
   inlined — *before* the references are resolved, so a `pattern` reference resolves against
   the compiled action ids; its issues (unknown or recursive references, `$n` beyond the params,
   too deep `repeat`s …) join the load's
   ([pattern-dsl.md](pattern-dsl.md#the-pattern-compiler-compilepatternbank)).
8. **Resolve** every recorded reference and write the index into `<field>Id`.
9. **Check boss references** (M1-13, `checkBossReferences`): a stage `spawn` / `formation`
   event or an enemy `child` naming a boss, and a `warning` / `boss` event naming a regular
   enemy, are issues.
10. **Expand stage terrain** (third pass, M1-07): every stage with a `tilemap` whose tileset
   resolved gets its tile grid built from the `heightfield` generator and / or RLE rows into
   `StageSpec.terrain` (`core/data/tilemap.ts`). Its issues (a tile the generator needs is
   missing, bad RLE rows) come last. Stages are also checked beyond the schema at collect
   time (sorted keys / checkpoints / events, the first key at 0, nothing past `length`,
   `yTicks` without `yTo`, `to ≤ from` segments, > 32 flags) and their `flag` names are
   numbered (`flagNames`, `event.flagId`); tilesets get their lookup `tables`. Details in
   [stage-runtime.md](stage-runtime.md#stage-data-and-loading).

A bad file is skipped, never fatal: one load reports every problem in every file.
`loadContent` only throws (`TypeError`) when `files` is not an array — a programming error,
not a content error. It allocates freely and uses `Map`s; it runs once at boot, never per
tick.

### Issue paths

Every issue is `{ path, message }` with `path = <file>:<json path>`:

```text
enemies/zone-a.enemies.json:enemies[3].hurtbox.hw   must be an integer in 1..512
weapons/type-a.weapons.json:weapons[1].sfx          unknown sfx id "PlayerShoot"
stages/zone-a.stage.json:events[12].type            type must be one of: spawn, formation, warning, …
stages/zone-a.stage.json:events[13].x               must be >= events[12].x (events are sorted by x)
stages/zone-a.stage.json:tilemap.rle[3]             tile id 40 does not exist (the tileset has 17)
player/kestrel.player.json:ships[0].speedz          unknown field
stages/b.stage.json:id                              duplicate stage id "zone-a"
enemies/x.enemies.json:enemies[4].boss.phases[0].until  is required (every phase but the last ends on it)
stages/zone-a.stage.json:events[20].enemy           is a boss: start it with a "warning" or "boss" event
```

Order: header, migration, schema, stage / tileset checks and duplicate-id issues in
file-then-document order, then the reference issues of the resolve pass in the same order,
then the terrain-expansion issues.

### Id resolution: the `<field>Id` convention

A field declared with `s.ref(kind)` keeps its string (for messages and debugging) and gains
a sibling field `<field>Id` with the numeric index. `-1` means *none*: a `null` value, an
absent optional reference, or an id that did not resolve (which is also an issue).

| `ContentRefKind` | Resolved against | Unknown id |
|---|---|---|
| `sprite` | interned: `db.sprites` (sorted names, `extraSprites` included) | never an issue here — `pnpm content:check` checks the names against the atlas (M1-03) |
| `script` | interned: `db.scripts` (sorted names) | an issue only when `options.knownScripts` is given — the shell and `pnpm content:check` pass `KNOWN_SCRIPT_IDS` (`core/behaviors`: enemy behaviours + Type A weapon behaviours) |
| `ship`, `weapon`, `enemy`, `path`, `stage`, `tileset` | `db.shipIndex`, `weaponIndex`, `enemyIndex`, `pathIndex`, `stageIndex`, `tilesetIndex` — across all files, in any order | issue |
| `sfx`, `music` | `SFX_CUES` / `MUSIC_CUES` in `core/events` (own properties only, so `"toString"` does not resolve) | issue |
| `pattern` (M2-02) | `db.patterns.actionIndex` — the action ids of every `patterns` file, compiled first | issue |

Examples from today's schemas: `sprite → spriteId`, `behavior → behaviorId` (weapons),
`script → scriptId`, `child → childId` and `pattern → patternId` (enemies), a `path` mover's `path → pathId`,
`sfx → sfxId`, presets' `main/missile/double/laser → mainId/missileId/doubleId/laserId`, stage
events' `enemy → enemyId`, `path → pathId` and `cue → cueId`.

Beyond the reference checks, the enemies are checked against the behaviour registry by
`checkEnemyBehaviors(db)` (`core/behaviors`): every `params` name must be a tunable of the
enemy's behaviour, spawners (`hatch.spawner`) need a `child` and pattern runners (`pattern.loop`,
M2-02) a `pattern`. `loadContent` itself does not
know the registry; the shell's `loadGameContent` and `pnpm content:check` append these issues.

**Defaults filled at load.** An `enemies` entry may omit `anim`, `params`, `mover`, `ground`,
`settleTicks`, `explosion`, `megaCrashImmune`, `child` and `pattern`; the loader fills them in
(`completeEnemy`), so every `EnemySpec` has every field in the same order. **Baked at load.**
Every `paths` entry gets a `table` — its centripetal Catmull-Rom spline resampled at 1-px arc
length (`bakePath`); a path with coincident neighbours or longer than 16,384 px is an issue and
is left out.

### The database

`ContentDb` holds `sprites` / `scripts` (`StringTable { names, index }`) and, per kind, a
list plus an id → position map: `ships`/`shipIndex`, `weapons`/`weaponIndex`,
`weaponPresets`/`weaponPresetIndex`, `enemies`/`enemyIndex`, `paths`/`pathIndex`,
`stages`/`stageIndex`, `tilesets`/`tilesetIndex` — and, from the `rules` kind, two tables:
`difficulty` (M2-01: a frozen `DifficultyTable`, or `null` without a `difficulty` section, when
`createGame` uses `core/config` `DEFAULT_DIFFICULTY_TABLE`) and `scoring` (M2-02: a frozen
`ScoringRules`, or `null` — the bullet system then uses `DEFAULT_SCORING_RULES`); from the
`patterns` kind (M2-02) `patterns`, the compiled `PatternBank` (`code`, `actions`,
`actionIndex`, `entries`, `bullets`; `EMPTY_PATTERN_BANK` without pattern files). Lists are
in path-then-document order. Systems resolve what they need **once** (at session or stage
start) and keep the numbers; per-tick code indexes arrays only — no `Map.get`, no string
compares (zero-allocation rule, [conventions.md](conventions.md#performance-zero-allocation-in-hot-paths)).

`EMPTY_CONTENT_DB` is the frozen, shared default of `createGame`; tests that need no content
run with it, and systems fall back to built-in defaults. The apps always boot with the
validated shipped content.

## The schema combinators (`core/data/schema`)

```ts
import { s, type Infer, type ValidationIssue } from '@shmup/core';

const BOX = s.object({ hw: s.int({ min: 1, max: 512 }), hh: s.int({ min: 1, max: 512 }) });
const TURRET = s.object(
  {
    id: s.str(),
    hurtbox: BOX,
    sprite: s.ref('sprite'),             // → spriteId after loadContent
    aim: s.enumOf(['fixed', 'player'] as const),
    shot: s.nullable(s.ref('sfx')),      // → shotId, -1 for null / absent
    params: s.record(s.num(), /^[a-z][a-zA-Z0-9]*$/),
  },
  { optional: ['shot', 'params'] },
);
type Turret = Infer<typeof TURRET>;

const issues: ValidationIssue[] = [];
const turret = TURRET.parse(json, 'turrets[0]', issues); // Turret | undefined
```

| Combinator | Accepts |
|---|---|
| `s.int({ min, max })` / `s.num({ min, max })` | integer / finite number, inclusive bounds |
| `s.str({ minLength, maxLength, pattern })` | string; **non-empty by default** (`minLength: 0` allows `""`) |
| `s.bool()` | `true` / `false` |
| `s.enumOf(values)` | one of the string literals (pass `as const` for a literal union type) |
| `s.array(item, { min, max })` | array; every item is checked even after one fails |
| `s.object(shape, { optional })` | exactly the declared fields: missing required fields and **unknown fields** are issues |
| `s.record(value, keyPattern?)` | string-keyed map of one value type (weapon `params`, palettes, tunables); `""` and `__proto__` keys are rejected |
| `s.nullable(inner)` | `null` or `inner` |
| `s.ref(kind)` | non-empty id string, resolved by `loadContent` |
| `s.oneOf(tagField, variants)` | discriminated union — each variant declares the tag itself (`type: s.enumOf(['spawn'] as const)`) |

Rules the combinators follow:

- **Never throw on data.** A failure appends an issue and returns `undefined` for that
  value (and for every parent up to the root). `parse(value, path, issues, refs?)` without
  `refs` only validates; the loader passes `refs` to collect reference sites.
- **References live in objects.** `s.array(s.ref(…))` and `s.record(s.ref(…))` throw a
  `TypeError` when the schema is *built*: a bare array of ids has no sibling field to put the
  indices in. Wrap each reference in an object (`[{ "enemy": "drifter" }]`).
- Schemas are frozen and keep no state between calls (a `g`/`y` pattern's `lastIndex` is
  reset), so share instances freely; build them once at module load.
- `s.object`'s return type uses `NoInfer` on the optional-key parameter, so annotating the
  const with its spec type works: `const WEAPON: Schema<Omit<WeaponSpec, 'spriteId' | …>> =
  s.object(…)`. Omit the `…Id` fields — the loader adds them after parsing.

## Extending it

### Adding fields to an existing kind

1. Add the field to the spec interface in `packages/core/src/data/index.ts` (with TSDoc,
   units and the spec section).
2. Add it to the schema const (list it in `optional` if old files may lack it — otherwise
   every existing file needs it in the same commit).
3. Update the folder's README format sample (JSONC; `pnpm content:check` validates it) and
   the `example.*.json`.
4. Tests in `packages/core/test/data/`: accept, each failure message, and the resolved id
   if it is a reference.

### Adding a new kind (as `paths` did in M1-08)

1. Append it to `CONTENT_KINDS`; add a spec interface, a file schema (`...HEADER_SHAPE` +
   `kind: s.enumOf(['paths'] as const)`), a `case` in `parseFile` and in `collect`, and
   the list + `…Index` map to `ContentDb`, `DbBuilder` and `EMPTY_CONTENT_DB`. Anything
   derived at load (the paths' baked tables) is computed in `collect`, reporting problems as
   issues instead of throwing (`bakePathEntry`).
2. If other content refers to it, add the name to `ContentRefKind` and a `case` in
   `resolveRef`.
3. New folder `content/<folder>/` with `README.md` and an `example.*.json` —
   `test/integration/workspace-layout.test.ts` enforces both.
4. Export the new types from `packages/core/src/index.ts`; update
   [api-reference.md](api-reference.md) and this page.

A kind that a *different* package owns (plan §3.5) is not added here: it arrives in
`foreign`, and the owner validates it with the same `s` combinators and `ValidationIssue`
shape. The shipped-content test lists the `foreign` files it expects (today only
`input/remote.input-profiles.json`, owned by input-web since M1-05) — the step that adds such a
kind routes it to its owner and updates that assertion.

### Changing a format (bumping `formatVersion`)

1. Raise `CONTENT_FORMAT_VERSION`.
2. Give **every** kind a migration from the old version in `CONTENT_MIGRATIONS` — a kind
   without one rejects all its existing files with `no migration for <kind> from
   formatVersion N`. A migration returns a *new* object (never mutate its input) and does
   not need to set `formatVersion`.
3. Rewrite the committed files and README samples to the new version — committed content
   is always current: `workspace-layout.test.ts` requires every `content/**/*.json` to carry
   the current `formatVersion` (it hard-codes `1` today, so update it too). Migrations are
   for files from older branches and saves, not for the repo's own content.
4. Add a test that an old-format file loads (`loadContent(files, { migrations })` accepts a
   test table, so the error paths can be tested without touching the real one).

## The Vite plugin and Node helper (`vite.shared.ts`)

| Export | What |
|---|---|
| `shmupContent({ root? })` | Vite plugin serving `CONTENT_MODULE_ID` (`'virtual:shmup-content'`). `load` returns `export default [...]` from `readContentFiles(root)`. In `vite dev` it watches the root and sends a **full reload** on any `*.json` add/change/delete inside it (content is read once at boot, so HMR cannot patch it) |
| `readContentFiles(root?)` | Walks the root recursively, skips `example.*` files, parses each `*.json`, sorts by POSIX path. Throws `SyntaxError` naming the file on bad JSON; returns `[]` for a missing root |
| `ContentFileRecord`, `ShmupContentOptions` | `{ path, data }` and `{ root? }` |

`root` defaults to the repo's `content/` (resolved from `vite.shared.ts`'s own URL, so it
works from any app). `types/virtual-modules.d.ts` declares the module; it is listed in the
root `tsconfig.json` and in both apps' `tsconfig.json`, so TypeScript and ESLint's project
service can both type `import contentFiles from 'virtual:shmup-content'`.

`turbo.json` lists `content/**` and `types/**` in `globalDependencies`: both sit outside
every package, and without them a content-only edit would get a Turborepo cache hit and
replay a `dist/` with stale inlined content (see
[build-test-deploy.md](build-test-deploy.md#turborepo)).

## Commands

```sh
pnpm content:check                          # validate content/ (shipped set + example set)
pnpm --filter @shmup/core test data         # schema + loader unit tests only
pnpm test:integration                       # includes content:check and the plugin tests
```

`pnpm content:check` runs `test/integration/content.test.ts`. It checks that:

- the shipped files load with **zero issues** — with `knownScripts: KNOWN_SCRIPT_IDS` and
  `checkEnemyBehaviors`, so an unknown behaviour id or tunable fails — and every sprite and
  script id maps back to its name; the `foreign` files (the input profiles, the particle
  presets, the SFX bank and the music) are validated by their owners;
- the `example.*.json` samples load with zero issues as an **independent set** (so they may
  reuse real ids such as `kestrel` without a duplicate-id clash);
- every file is named `<folder>/<name>.<kind>.json`;
- the shipped `rules` table (`content/rules/difficulty.rules.json`) equals `core/config`
  `DEFAULT_DIFFICULTY_TABLE`, so sessions with and without content play the same presets (M2-01);
- weapon presets only use weapons of the matching slot, every shipped weapon has a sound
  cue, and the KESTREL has the six D3 speed levels;
- the JSONC format samples in the content READMEs still validate (unknown-id issues
  ignored, since samples refer to ids defined elsewhere);
- every sprite name of the shipped content (`db.sprites.names`) exists in the atlas the
  asset pipeline builds (`findMissingSprites`, M1-03 — see
  [asset-pipeline.md](asset-pipeline.md#sprite-names-used-by-content)), and so does every
  engine sprite (`ENGINE_SPRITES`, M1-09), which `loadContent(files, { extraSprites })`
  interns;
- the audio of `content/audio/` works (M1-15): every `SFX_CUES` cue has a sound, every cue a
  shipped stage references (theme, boss, `music` events — `stageMusicCues`) has a track, every
  synthesized sound is audible, unclipped and short, and every looping song loops sample-exactly
  ([audio.md](audio.md#tests)).

A failure prints the issue list (`path` + `message`) in the Vitest diff.

## Tests

| File | Covers |
|---|---|
| `packages/core/test/data/schema.test.ts`, `schema-edge.test.ts` | Every combinator: valid input, each failure message, inclusive bounds, nested paths, reference-site recording through objects/records/unions, construction-time `TypeError`s, frozen schemas, a seeded fuzz (the parser never throws and fails exactly when it reports an issue), `Infer<>` type assertions |
| `packages/core/test/data/data.test.ts`, `data-edge.test.ts` | Headers, migrations (and missing ones), per-kind bounds, every stage event variant, cue and id resolution (including prototype names), cross-file references, interning order, duplicates, issue order, input immutability, byte-identical output for every file order |
| `packages/core/test/patterns/patterns-dsl*.test.ts` | M2-02: the `patterns` kind through `loadContent` — compiled bank, issue paths and entry 0, enemy `pattern` resolution, the `scoring` section (one file only), the schema limits ([pattern-dsl.md](pattern-dsl.md#tests)) |
| `packages/core/test/data/enemies-edge.test.ts`, `paths-edge.test.ts` | Enemy defaults, `child` refs, every mover variant and bound, stage spawn fields (M1-08); `bakePath` properties and the `paths` loader ([enemies-and-behaviors.md](enemies-and-behaviors.md#tests)) |
| `test/integration/content.test.ts` | `pnpm content:check` (above) |
| `test/integration/content-plugin.test.ts`, `content-plugin-edge.test.ts` | The generated module evaluates to `readContentFiles()`, is byte-stable, honours custom roots, skips examples, names the file in JSON errors; dev-server watcher behaviour (including a sibling `content-old/` folder that must *not* trigger a reload); a real Vite IIFE build whose inlined content `loadContent()` accepts |
| `test/integration/content-wiring.test.ts` | `turbo.json` hashes `content/**` and `types/**`; both apps use the plugin and type the module; `content:check` targets the content test; a headless game runs on the shipped content |
| `test/integration/workspace-layout.test.ts` | Every content folder has a `README.md` and an `example.*.json`; every JSON in it has `formatVersion` 1 and a string `kind` |

## Gotchas

| Symptom | Cause |
|---|---|
| `unknown field` on a field you just added | The schema const was not updated, or the field was misspelled (typos are exactly what this check is for) |
| `TypeError: s.array(s.ref()) is unsupported` at import time | A bare array/record of references — wrap each id in an object |
| `…Id` is always `-1` | The id did not resolve (check the issues), the field is `null`/absent, or the schema declared it with `s.str()` instead of `s.ref()` |
| A duplicate-id issue in `pnpm content:check` for an example | The example set and the shipped set are separate — the clash is *inside* one set (two examples, or two shipped files) |
| Every file of one kind fails with `no migration for … from formatVersion 1` | `CONTENT_FORMAT_VERSION` was raised without a migration for that kind |
| `formatVersion 2 is newer than this build reads (1)` | Content from a newer branch loaded by an older build — rebuild |
| A content edit does not show up in `pnpm dev` | Only `*.json` inside the content root triggers a reload; files outside it (or a custom `root`) are not watched |
| A content edit does not show up after `pnpm build` | Should not happen (`content/**` is a Turborepo global dependency); if a new root-level input is added, list it in `globalDependencies` too |
| Every action of a `patterns` file is "unknown pattern action id" | The file failed its schema (a bad expression is a schema issue) and contributed nothing — fix its first issue ([pattern-dsl.md](pattern-dsl.md#gotchas)) |
| Sprite/script indices changed after adding a file | Expected: interned names are numbered in sorted order. Never persist these indices (replays record input, not ids) |
| `pnpm content:check` fails on a README | The JSONC format sample in that README no longer matches the schema — update the sample with the schema |
| `unknown script id "…"` only in the shell / `content:check`, not in a unit test | Script ids are checked only when `knownScripts` is passed; tests that call `loadContent(files)` alone intern any name |
| Enemy bullets are invisible in a headless test's view (their slots are `Hidden`) | The test called `loadContent(files)` without `extraSprites: ENGINE_SPRITES`, so the bullet sprites have no ids; the shell's `loadGameContent` passes them by default |
| A new `{ x, y }`-shaped schema makes hot code allocate | Build the shape object by adding keys (`PATH_POINT_SHAPE`), never as an `{ x: …, y: … }` literal — V8 shares hidden classes between literals ([enemies-and-behaviors.md](enemies-and-behaviors.md#zero-allocation-and-the-hot-path-rules)) |

## Next steps that build on this page

M1-03 (done) checks every name in `db.sprites` against the generated atlas
([asset-pipeline.md](asset-pipeline.md)); M1-04 (done) — `@shmup/shell` validates
`virtual:shmup-content` at boot, shows `issues` on the boot error screen and passes `db` to
`createGame`; M1-05 (done) — the shell routes `input-profiles` files out of `foreign` to
input-web's owner; M1-06 (done) — the World flies the KESTREL spec
(`resolvePlayerShip(db)`: `kestrel` › first ship › the built-in `DEFAULT_PLAYER_SHIP`,
[sim-world.md](sim-world.md#the-player-ship-coreplayer)); M1-07 (done) — the full M1 `stage`
format, the new `tileset` kind and the third (terrain) load pass
([stage-runtime.md](stage-runtime.md)); M1-08 (done) — the `paths` kind, the full M1
`enemies` format, `knownScripts` passed by the hosts and `checkEnemyBehaviors`
([enemies-and-behaviors.md](enemies-and-behaviors.md)); M1-09 (done) — `extraSprites` and the
engine's own sprites ([bullets-and-patterns.md](bullets-and-patterns.md)); M1-10 (done) — the
Type A weapons drive the weapon system (`refireTicks` optional, behaviour tunables in `params`
checked by `checkWeaponBehaviors`, `WEAPON_SCRIPT_IDS` moved to `weapons`, `options/orb` joined
`ENGINE_SPRITES` — [weapons-and-options.md](weapons-and-options.md#content-the-type-a-arsenal));
M2-01 (done) — the `rules` kind with the difficulty presets (`ContentDb.difficulty`), the enemy
`revenge` section and the `rank` modifiers given meaning
([difficulty-and-rank.md](difficulty-and-rank.md)); M2-02 (done) — the `patterns` kind compiled at
load into `ContentDb.patterns`, the ref kind `pattern` (enemy `pattern` → `patternId`), the
`rules` kind's `scoring` section ([pattern-dsl.md](pattern-dsl.md)).

# Content data: schemas, loader and `virtual:shmup-content`

How game data gets from a JSON file under `content/` to numbers the simulation can read
every tick. Filled in by plan step **M1-02**; every later step that adds a content kind
(paths, tilesets, rules, patterns, campaign, strings) extends the same machinery.

This page is the *how and why*. File formats for content authors are in each folder's
README ([`content/README.md`](../../content/README.md) and the `player/`, `weapons/`,
`enemies/`, `stages/` READMEs); exact signatures are in
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
   │  (boot, in the browser / on the TV — the shell does this from M1-04 on)
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

**Status today.** The loader, the combinators, the `player` and `weapons` formats, the
plugin and `pnpm content:check` are done. `enemies` and `stage` are *stub* schemas that match
the example files; M1-07 … M1-13 extend them. Both apps register the plugin, but nothing
imports `virtual:shmup-content` yet — `@shmup/shell` (M1-04) does, then passes `db` to
`createGame`. Until then `createGame` uses `EMPTY_CONTENT_DB`.

## Files, kinds and versions

- Every file is a JSON object with a header: `"formatVersion": 1` and `"kind"`. The `kind`
  selects the schema; the loader does not care about folder or file name (the content test
  does: files must be named `<folder>/<name>.<kind>.json`).
- Core kinds (`CONTENT_KINDS`): `player`, `weapons`, `enemies`, `stage`. Any other kind is
  returned untouched in `foreign`, in path order, for its owning package to validate
  (`input-profiles` → input-web in M1-05, `sfx`/`music` → audio-web in M1-15, `fx` →
  render-pixi in M1-14).
- `example.*.json` files are format samples. The plugin never ships them;
  `pnpm content:check` validates them as their own set.
- `CONTENT_FORMAT_VERSION` is **1**. An older file is upgraded by `CONTENT_MIGRATIONS`
  (`0 → 1` exists for `weapons`, `enemies`, `stage` — format 0 was structurally identical);
  `player` has no format 0, so a format-0 player file reports `no migration for player from
  formatVersion 0`. A file from a *newer* version is rejected: an old build never guesses at
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
   (across all files of the kind) is an issue; the first file in path order wins.
7. **Intern** sprite and script names: every distinct name gets an index in *sorted* order
   (`db.sprites`, `db.scripts`), independent of which file mentioned it first.
8. **Resolve** every recorded reference and write the index into `<field>Id`.

A bad file is skipped, never fatal: one load reports every problem in every file.
`loadContent` only throws (`TypeError`) when `files` is not an array — a programming error,
not a content error. It allocates freely and uses `Map`s; it runs once at boot, never per
tick.

### Issue paths

Every issue is `{ path, message }` with `path = <file>:<json path>`:

```text
enemies/zone-a.enemies.json:enemies[3].hurtbox.hw   must be an integer in 1..512
weapons/type-a.weapons.json:weapons[1].sfx          unknown sfx id "PlayerShoot"
stages/zone-a.stage.json:events[12].type            type must be one of: spawn, boss, midboss, …
player/kestrel.player.json:ships[0].speedz          unknown field
stages/b.stage.json:id                              duplicate stage id "zone-a"
```

Order: header, migration, schema and duplicate-id issues in file-then-document order, then
the reference issues of the resolve pass in the same order.

### Id resolution: the `<field>Id` convention

A field declared with `s.ref(kind)` keeps its string (for messages and debugging) and gains
a sibling field `<field>Id` with the numeric index. `-1` means *none*: a `null` value, an
absent optional reference, or an id that did not resolve (which is also an issue).

| `ContentRefKind` | Resolved against | Unknown id |
|---|---|---|
| `sprite` | interned: `db.sprites` (sorted names) | never an issue here — `pnpm content:check` checks the names against the atlas (M1-03) |
| `script` | interned: `db.scripts` (sorted names) | an issue only when `options.knownScripts` is given (M1-08 passes the behaviour registry) |
| `ship`, `weapon`, `enemy`, `stage` | `db.shipIndex`, `weaponIndex`, `enemyIndex`, `stageIndex` — across all files, in any order | issue |
| `sfx`, `music` | `SFX_CUES` / `MUSIC_CUES` in `core/events` (own properties only, so `"toString"` does not resolve) | issue |

Examples from today's schemas: `sprite → spriteId`, `behavior → behaviorId` (weapons),
`script → scriptId` (enemies), `sfx → sfxId`, presets' `main/missile/double/laser →
mainId/missileId/doubleId/laserId`, stage events' `enemy → enemyId` and `cue → cueId`.

### The database

`ContentDb` holds `sprites` / `scripts` (`StringTable { names, index }`) and, per kind, a
list plus an id → position map: `ships`/`shipIndex`, `weapons`/`weaponIndex`,
`weaponPresets`/`weaponPresetIndex`, `enemies`/`enemyIndex`, `stages`/`stageIndex`. Lists are
in path-then-document order. Systems resolve what they need **once** (at session or stage
start) and keep the numbers; per-tick code indexes arrays only — no `Map.get`, no string
compares (zero-allocation rule, [conventions.md](conventions.md#performance-zero-allocation-in-hot-paths)).

`EMPTY_CONTENT_DB` is the frozen, shared default of `createGame`; tests and the calibration
scene run with it, and systems fall back to built-in defaults.

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

### Adding a new kind (e.g. `paths` in M1-07)

1. Append it to `CONTENT_KINDS`; add a spec interface, a file schema (`...HEADER_SHAPE` +
   `kind: s.enumOf(['paths'] as const)`), a `case` in `parseFile` and in `collect`, and
   the list + `…Index` map to `ContentDb`, `DbBuilder` and `EMPTY_CONTENT_DB`.
2. If other content refers to it, add the name to `ContentRefKind` and a `case` in
   `resolveRef`.
3. New folder `content/<folder>/` with `README.md` and an `example.*.json` —
   `test/integration/workspace-layout.test.ts` enforces both.
4. Export the new types from `packages/core/src/index.ts`; update
   [api-reference.md](api-reference.md) and this page.

A kind that a *different* package owns (plan §3.5) is not added here: it arrives in
`foreign`, and the owner validates it with the same `s` combinators and `ValidationIssue`
shape. The shipped-content test currently expects `foreign` to be empty — the step that
adds such a kind routes it to its owner and updates that assertion.

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

- the shipped files load with **zero issues** and no `foreign` files, and every sprite and
  script id maps back to its name;
- the `example.*.json` samples load with zero issues as an **independent set** (so they may
  reuse real ids such as `kestrel` without a duplicate-id clash);
- every file is named `<folder>/<name>.<kind>.json`;
- weapon presets only use weapons of the matching slot, every shipped weapon has a sound
  cue, and the KESTREL has the six D3 speed levels;
- the JSONC format samples in the content READMEs still validate (unknown-id issues
  ignored, since samples refer to ids defined elsewhere);
- every sprite name of the shipped content (`db.sprites.names`) exists in the atlas the
  asset pipeline builds (`findMissingSprites`, M1-03 — see
  [asset-pipeline.md](asset-pipeline.md#sprite-names-used-by-content)).

A failure prints the issue list (`path` + `message`) in the Vitest diff.

## Tests

| File | Covers |
|---|---|
| `packages/core/test/data/schema.test.ts`, `schema-edge.test.ts` | Every combinator: valid input, each failure message, inclusive bounds, nested paths, reference-site recording through objects/records/unions, construction-time `TypeError`s, frozen schemas, a seeded fuzz (the parser never throws and fails exactly when it reports an issue), `Infer<>` type assertions |
| `packages/core/test/data/data.test.ts`, `data-edge.test.ts` | Headers, migrations (and missing ones), per-kind bounds, every stage event variant, cue and id resolution (including prototype names), cross-file references, interning order, duplicates, issue order, input immutability, byte-identical output for every file order |
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
| Sprite/script indices changed after adding a file | Expected: interned names are numbered in sorted order. Never persist these indices (replays record input, not ids) |
| `pnpm content:check` fails on a README | The JSONC format sample in that README no longer matches the schema — update the sample with the schema |

## Next steps that build on this page

M1-03 (done) checks every name in `db.sprites` against the generated atlas
([asset-pipeline.md](asset-pipeline.md)); M1-04's `@shmup/shell`
imports `virtual:shmup-content`, shows `issues` on the boot error screen and passes `db` to
`createGame`; M1-05 routes `input-profiles` files out of `foreign`; M1-06 reads the KESTREL
spec; M1-07 extends `stage` (and adds `paths`/`tileset`); M1-08 passes `knownScripts` and
extends `enemies`; M1-10 reads the Type A weapons.

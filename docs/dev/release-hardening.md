# v1.0 hardening and the release candidate (plan M2-18)

Plan step M2-18 proves v1.0 is complete, fair, fast and deterministic, and cuts the release
candidate **1.0.0-rc.1**. It adds no gameplay system: it adds the checks that gate a release, and
fixes what those checks found. Everything here runs headless — in Vitest, in `pnpm bench` or in the
Playwright browser tests — and in CI; what needs the monitors is listed at the end. The
player-facing side (what changed, where the version shows, the owner's v1.0 checklist) is
[`docs/client/release-candidate.md`](../client/release-candidate.md).

| Check | Where | Runs in |
|---|---|---|
| All 16 routes × both ships, every zone 3–6 min, the 4-way rules on every tick | `test/playtest/campaign-routes*.test.ts` (+ `campaign.ts`, `campaign-routes.ts`, `rules.ts`) | `pnpm test` |
| Release audit: capsule / item budgets, recovery rule, every pattern, every boss fight's lanes | `test/integration/release-audit.test.ts` | `pnpm test` |
| Cross-engine determinism: golden replays in Chromium **and Firefox** | `test/e2e/determinism.spec.ts`, `@shmup/shell` `determinism`, the web app's `?determinism` | `pnpm test:e2e` (CI: the e2e shards and the `e2e-firefox` job) |
| Per-zone stress benchmarks | `test/bench/zones.perf.ts` | `pnpm bench` (CI: the build job) |
| 30-minute soak through the scene flow, heap flat | `test/bench/soak.perf.ts` | `pnpm bench` |
| Boot to title < 3 s; Tizen certification self-checks | `test/e2e/release-check.spec.ts` | `pnpm test:e2e` |
| Icons and store-listing placeholders | `scripts/store-assets.mjs` (`pnpm store:assets`), `test/scripts/store-assets.test.ts` | `pnpm test` checks the committed icons |
| Version `1.0.0-rc.1` everywhere, `1.0.0` in `config.xml` | the manifests, `apps/tizen/public/config.xml`, `CHANGELOG.md` | `tooling-config.test.ts`, `config-xml-consistency.test.ts` |

## The route runs (16 routes × both ships)

`flyRoutesThrough(exit, ship)` (`test/playtest/campaign-routes.ts`) walks every route of the shipped
diamond through one exit of zone A with the campaign harness (`walkCampaignRoutes` — each zone a
fresh World built the way the scene flow builds it, the players carried in) and the 4-way bot in god
mode, flying the KESTREL (`ROUTE_SHIPS.kestrel`) or the MANTA (`{ shipId: 'manta', powerUpMode:
'direct' }`). Four test files — B and C × the two ships — run the quarters in parallel (about 30 s
together on a 48-core machine). Every route must:

- clear every zone, each in `ZONE_MIN_SECONDS`–`ZONE_MAX_SECONDS` (3–6 minutes, shmup_feat.md §14);
- keep the rank's stage term at the zones cleared and the score growing;
- end in H or I with an ending that has its scene and epilogue;
- hold the 4-way rules on **every tick of every zone**: the harness's new `CampaignFlags.observe`
  runs `createRuleWatch().observe` — no bullet over 2 px/tick (with the rank the run really
  reaches), no two laser lanes under 16 px apart, and since M2-18 the **ship's open column**.

### The ship's open column (`columnGap`)

`rules.ts` gained a third rule: the enemy bullets crossing the column the ship flies in
(`COLUMN_HALF_WIDTH` 8 px either side of it, each widened by its radius and the ship's hurt radius)
and every live laser lane together must leave an open band of at least `MIN_LANE_GAP` (16 px) rows.
It generalises the laser-lane gap to bullet walls: a pattern never walls a remote player in. The
rule watch records `narrowestColumn` and reports a tick below 16 px as a violation — every existing
playtest that uses the watch checks it too. Measured on all routes with both ships the narrowest
column was 38 px.

## The release audit

`test/integration/release-audit.test.ts` is one release gate over the campaign's nine zones (read
from `ContentDb.campaign`, so a new zone is covered at once):

| Budget / rule | Value |
|---|---|
| Capsule sources before the WARNING (`CAPSULE_BUDGET`) | 12–32 (shipped: 22–29) |
| Recovery (§10): capsule sources within 900 px after every checkpoint | ≥ 3 (the perfect-player runtime check stays in `zone-*-recovery.test.ts`) |
| MANTA item plan (`DIRECT_ITEM_BUDGET`) | 20–30 items; ≥ 6 red, green and blue; exactly one octagon; ≤ 1 orange (1UP) and ≤ 1 yellow (smart bomb) |
| Meter 1UPs and bonus capsules | none in a zone; ≤ 1 1UP in each bonus stage the map leads into |
| Blue capsules (`MAX_BLUE_CAPSULES`) | ≤ 2 a zone |
| Every shipped pattern at Normal (rank 2) | no bullet over 2 px/tick; the ship's column ≥ 16 px open |
| Every shipped pattern at loop 1's cap (rank 16) | never faster than Normal's × `rankScale(16, BULLET_SPEED_RANK_CURVE)` (a `$rank` expression cannot outrun the curve); the column ≥ 16 px open |
| Every zone's boss fight, each ship fully powered (debug skip, god mode) | the stage clears; no rule violation on any tick |

The pattern probe is the `patterns-runtime.test.ts` technique: the shipped content plus one
`pattern.loop` probe enemy per shipped action, fired in free flight for 1,500 ticks at a forced rank
(the rank's `special` term) with the ship parked in the bot's column.

## What the checks found (and the fixes)

The route runs failed at first with the MANTA — the bot could not finish some zones in ten minutes
— and the boss sweep caught two more. Each is a fairness bug a remote player would have hit:

| Finding | Cause | Fix |
|---|---|---|
| A fully powered MANTA could not hurt MANTLE REGENT, IRON SOVEREIGN or THE HOLLOW KING | The LASER → WAVE family's waves are tall (7–16 px half height) piercing shots; a piercing shot **dies on armour**, and every one of those bosses has armoured parts in front of its core's row | New `direct.bolt` tunable **`passArmour`** (`ShotFlag.PassArmour`): a piercing bolt with it clinks on armour at most once per hit cooldown and flies on (the Spread Bomb blast's rule). The four waves have `passArmour: 1` (`content/weapons/direct.weapons.json`) |
| CINDER BASTION survived the MANTA at the fifth disc level (`beam-disc` level index 4 — four SHOT pips) | The level fired two small discs ±16 binary units apart — a V with a blind spot straight ahead where a small core sat | That level fires two **parallel** small discs (`oy` ±4) |
| GALVANIC MAW survived a fully powered MANTA | Opened 4 px, the jaws' hurtboxes left an 18-px gap (±9 px); the HUGE DISC (half height 9) always touched a jaw first and clinked | `gape` 8 / 8 / 9 (was 4 / 4 / 5) in `content/enemies/zone-b.enemies.json` |
| Two silk lines 16 px apart (7 px of gap) in SANDGRAVE WIDOW's last phase | `laserTicks` is rank-scaled; a fully powered ship's rank shortened it below a lane's life (telegraph + grow + active + fade) | `boss.widow` waits at least a whole lane before the next line |

`zone-b-god` was re-blessed for the wider jaws (nine ticks longer, the same outcome); no other golden
replay or attract demo changed.

## Cross-engine determinism in the browser

shmup_feat.md §22 P1 asks for the same replay in Chrome, Firefox, Electron and the TV to give the
same state hashes. The simulation only uses IEEE `+ − × ÷`, `Math.sqrt` and committed trig tables
(decision D27), so it must — the check proves it:

- **`@shmup/shell` `determinism`** — `createDeterminismCheck(contentFiles, now?)` validates the
  content like the shell's boot (`loadGameContent`) and `play(replay)` plays one `core/replay`
  document headless (`createReplayGame` + `createPlayback`), returning `DeterminismRun`: `ok`,
  `desyncTick`, the `hashes` the page's engine computed at every `hashInterval` (the same ticks as
  the recording's), `finalHash`, `status`, `ms`. `installDeterminismCheck(window, files, now)`
  publishes it as `window.__shmupDeterminism` and sets `data-shmup-determinism="ready"` (or
  `"error"` when the content has issues) on `<html>`.
- **The web app's `?determinism`** — in dev / test builds only (`__SHMUP_DEV__ &&
  determinismFromSearch(location.search)` in `apps/web/src/main.ts`) the page installs the check
  instead of booting the game; a release build folds the branch away
  (`apps/web/test/build/web-build.test.ts` checks the bundle has neither `__shmupDebug` nor
  `__shmupDeterminism`). The page needs no WebGL: headless Firefox on a machine without a GPU cannot
  create a WebGL context (`FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS`), so the game page itself could
  not boot there.
- **`test/e2e/determinism.spec.ts`** plays every `test/golden/*.replay.json` and every
  `content/demos/*.replay.json` — one test each — and requires the recorded hashes, final hash and
  status. `playwright.config.ts` runs it in the `chromium` project (with everything else) and the
  `firefox` project (this spec only); matching the file in both means V8 (Node), V8 (Chromium) and
  SpiderMonkey agree tick for tick. A replay takes 0.1–0.6 s in either browser.
- **CI** — the e2e shards run `--project=chromium`; the `e2e-firefox` job installs Playwright's
  Firefox and runs `--project=firefox`.

A desync in one browser only is a determinism bug in the core (a transcendental, a sort without a
tie-break, an engine-specific `Number` edge): hunt it with the periodic hashes (`desyncTick` names the
first 600-tick window that differs) and replace the offending maths with the tables (plan §10).

## Benchmarks: every zone, and the soak

- **`zones.perf.ts`** — each campaign zone from its start to its stage clear with the 4-way bot, the
  full loadout, god mode and the enemy bullets topped up to 512 before every tick (on top of the
  zone's own fire): median < 1.0 ms/tick (`ZONE_MEDIAN_BUDGET_MS`) over 100-tick batches after a
  3,000-tick warm-up, < 1 MB (`ZONE_HEAP_BUDGET`) retained. Measured: medians 0.46–0.50 ms/tick,
  retained −100…420 KB.
- **`soak.perf.ts`** — 30 minutes (`SOAK_TICKS` 108,000) of the shipped game through its real scene
  flow (`createGame` with the scenes and a save store, god mode): the bot plays every zone, OK is
  tapped every 30 ticks on every other screen — the zone tallies, the map, the ending, the credits,
  the name entry, the hi-score table, the title, the menus of the next run. After a 5-minute warm-up
  the heap is sampled every game minute after two collections: `dataHeapBytes()` — every V8 space but
  the **code** and **trusted** spaces, which grow by about 1 MB over the half hour as V8 optimises
  the later zones' code (no leak) — must never rise more than `SOAK_HEAP_BUDGET` (1 MB) above the
  first sample. Measured: +296 KB, levelling off in the second run.

## The release checks in the browser

`test/e2e/release-check.spec.ts` (headless Chromium):

- **Boot to title** — both builds (the web build and the Tizen build via `file://`) must show the
  title within `BOOT_TO_TITLE_BUDGET_MS` (3 s) of the navigation: an init script's
  `MutationObserver` records `performance.now()` the first time the canvas says
  `data-shmup-scene="title"`. `data-shmup-boot-ms` must stay under the store's 10 s. Measured ≈ 1.1 s
  locally with the whole e2e suite running in parallel.
- **Tizen certification self-checks** (shmup_tech.md §2.6 — the store's mandatory checklist), on the
  Tizen build with a stand-in `window.tizen`:
  - Back on the title opens the exit confirmation; NO and Back keep the app; YES calls
    `tizen.application.getCurrentApplication().exit()` exactly once (its own test);
  - Back in the game pauses, Back on the pause menu resumes; neither exits;
  - `visibilitychange` to hidden (the init script overrides `document.visibilityState`) freezes the
    game (`game.state.suspended`, no tick runs) and suspends the audio context; visible again resumes
    the audio and brings the pause menu up with no catch-up burst (≤ 4 World ticks);
  - five more hide / show cycles log no error and the frame loop keeps running;
  - the save is written through the platform storage (the debug save import) and every key is under
    the game's `shmup-cup:` prefix in `localStorage` — no cookie, no IndexedDB database — so Tizen's
    uninstall deletes the user data.

What a browser cannot check stays on the manual list: the real launch time on the TV, the Home
button's real resume, the uninstall itself.

## Icons and store-listing placeholders

`pnpm store:assets` (`scripts/store-assets.mjs`) draws everything from the placeholder art
(`collectSprites()` — the logo, the ships, the zone backdrops, the bosses, the bitmap font) with
whole-pixel copies and integer scaling only:

- **committed**: `apps/tizen/public/icon.png` (512 × 423 — the widget's `<icon>` and the Seller
  Office icon) and `apps/electron/build/icon.png` (512 × 512 — `electron-builder.json` now names it
  for Windows, Linux and macOS);
- **generated, ignored**: `assets/generated/store/` — `icon-512x423.png`, four 1920 × 1080
  placeholder screenshots (the 384 × 216 frame × 5, captioned `PLACEHOLDER` and a zone name) and
  `listing.json` (name, short and long description, keywords, category, age-rating note, the image
  list with sizes; `placeholder: true`). Check the sizes against the Seller Office's current
  requirements before a submission.

`test/scripts/store-assets.test.ts` renders the icons again and compares the **pixels** with the
committed files (`staleIcons()`; `node scripts/store-assets.mjs --check` does the same from the
command line): after a change to the logo, the ships or the script, run `pnpm store:assets` and commit
the icons.

## The version

- Every `package.json` (root, `packages/*`, `apps/*`) says **`1.0.0-rc.1`**
  (`tooling-config.test.ts` — "the release version").
- The Tizen widget's `config.xml` says **`1.0.0`**: Tizen accepts `major.minor.patch` numbers only,
  so it takes the numeric core of the manifests' version (`config-xml-consistency.test.ts`). A later
  release candidate keeps `1.0.0` there; the store sees a new build only when it grows.
- `CHANGELOG.md` has the `[1.0.0-rc.1]` section (M2) above `[0.1.0]` (M1) and an empty
  `[Unreleased]` for what follows. Tag the release on the step's final commit (`v1.0.0-rc.1`) once
  the review, test and docs rounds are through — the M1 release was tagged the same way.

## What stays manual

The v1.0 checklist of the plan — **§8.5** (M2 on-device checks on both monitors: co-op, three routes
to both final zones, 10 minutes of attract mode, rebinding, the game-mode A/B latency test, the
30-minute soak on the TV with DevTools' heap — compare with the estimator's 24 MiB baseline —, the
device line, live reload, update install keeps saves and uninstall removes them) and **§8.6** (store
readiness: the Tizen mandatory checklist on the device, the trade-dress review of the title, logo and
key art, the Seller Office account and an alpha test with ≤ 50 DUIDs). Real screenshots for the
listing come from the monitors too.

## Tests

| File | What it checks |
|---|---|
| `test/playtest/campaign-routes-b.test.ts`, `-c`, `-manta-b`, `-manta-c` | The 16 routes × both ships, durations, endings, rules on every tick |
| `test/playtest/rules.test.ts` | The rule helpers, `columnGap` on hand-made bullets and lanes (a bullet in the column, a wall with a hole, the hole plugged — the watch's violation, a laser lane) |
| `test/playtest/rules-column-edge.test.ts`, `test/playtest/campaign-observe.test.ts` | Test round: `columnGap`'s edges (dead bullets, fading lasers, the column's exact edge, the camera's y, clipping, merged bands, slanted lasers, the `player` argument, the watch at exactly 16 px); `CampaignFlags.observe` once per tick, `ROUTE_SHIPS` flying the right ship |
| `test/integration/release-audit.test.ts` | The budgets, the recovery rule, every pattern, every boss fight with both ships |
| `packages/core/test/weapons/weapons-pass-armour.test.ts` | `passArmour`: a piercing wave clinks through armour to the target behind; without it (or without `pierce`) armour stops the shot |
| `packages/core/test/weapons/weapons-pass-armour-edge.test.ts` | Test round: `passArmour` on an armoured **boss part** (the part cooldown path) reaching the core, the clinks spaced by the hit cooldown, any positive value turning it on (0, negative, missing do not), only the four shipped waves setting it |
| `packages/core/test/behaviors/behaviors-zones-edge.test.ts` | `boss.widow` waits a whole lane before the next silk line — and (test round) never stretches a long `laserTicks`, rounds a fractional telegraph / active up, treats a negative telegraph as none |
| `test/integration/release-content-edge.test.ts` | Test round: the fixes as relations of the shipped JSON — every Direct main level fires straight ahead, the fifth disc level's parallel discs, the waves' `passArmour`, GALVANIC MAW's open jaws wider than the HUGE DISC in every phase |
| `packages/shell/test/determinism/determinism.test.ts` | The check reproduces golden hashes in Node, reports a tampered hash at its tick, refuses bad content, publishes and marks the page |
| `packages/shell/test/determinism/determinism-edge.test.ts` | Test round: short hash intervals (a length that is or is not a multiple, zero ticks), checkpoint and god-mode starts, tampered final / later hashes, a missing stage / checkpoint (`RangeError`), one check playing many replays independently, the injected clock, every attract demo |
| `apps/web/test/boot/boot-wiring.test.ts`, `apps/web/test/build/web-build.test.ts` | `determinismFromSearch`; no dev tooling in the release bundle |
| `test/e2e/determinism.spec.ts`, `test/e2e/release-check.spec.ts` | See above |
| `test/bench/zones.perf.ts`, `test/bench/soak.perf.ts` | See above |
| `test/scripts/store-assets.test.ts`, `store-assets-edge.test.ts` | The icons and the store folder; `--check` / usage exit codes, pixel (not byte) comparison, out-of-range screenshots, the listing agreeing with `config.xml`, the git-ignored store folder |
| `test/integration/e2e-docs.test.ts` | Review-round regression: every e2e doc installs both projects' browsers and explains `--project`; the CI table of `build-test-deploy.md` lists every `pnpm` command of `ci.yml` as written and the `e2e-firefox` job |
| `apps/tizen/test/build/tizen-build.test.ts` | The release Tizen bundle carries no determinism check |
| `apps/tizen/test/config-xml/config-xml-consistency.test.ts`, `test/integration/tooling-config.test.ts` | The version, the Firefox project and CI job, `pnpm store:assets` |

## Gotchas

- **A route test that times out at ten minutes a zone** is almost always a boss the loadout cannot
  hurt — print the boss parts' hit points and the shots' rows during the fight (the MANTA findings
  above were found that way), not a bot problem.
- **`heapUsed` is not a leak detector over long runs**: V8's code and trusted spaces grow as more
  code is optimised. The soak measures the other spaces (`dataHeapBytes`).
- **Firefox runs only the determinism spec**: the game page needs WebGL, which headless Firefox
  cannot create without a GPU. Do not add other specs to the `firefox` project.
- **Tizen's widget version is numbers only** — never write a pre-release tag into `config.xml`
  (`validateConfigXml` and the bundle check refuse it).

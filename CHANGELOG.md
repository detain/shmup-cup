# Changelog

All notable changes to Shmup Cup. The project follows [Semantic Versioning](https://semver.org/);
versions before 1.0 may change anything between minor releases. v1 was developed by the step plan in
[`shmup_plan.md`](docs/old/shmup_plan.md), its progress tracked in
[`shmup_progress.md`](docs/old/shmup_progress.md); v2 follows
[`plan_resolution.md`](plan_resolution.md), whose §17 tracks its progress.

## [2.0.0] — 2026-10-24

**Shmup Cup 2.0.0** — the **640×360 remaster**: the same game as v1 re-based on the new
frame with every world quantity ×1.5, 12-px tiles and a 9×12 font cell; all nine campaign zones
remastered and expanded, AZURE VERGE through ABYSSAL THRONE; the extra modes re-timed to the
rebuilt fights and the balance pass landed — SQUALL STEED 40,000, the milking cap 100, the
four-minute caravan; and the `matchAll` hotfix that keeps both TVs' engines (Chromium 69 / 68)
booting after the dependency bumps. The step record is
[`plan_resolution.md`](plan_resolution.md), its §17 the ledger.

**The art status, honestly:** the game ships v2's own art as the committed pipeline draws it —
the R4 native redraws and the R5 zones' stand-in kit, every sprite at the new density — **not**
the AI round's candidates. The real-art drops (`R5-0n.S3`) stay the owner-gated step that awaits
the FLUX licence decision, with the ingest tool and its provenance records ready for them
([art-provenance.md](docs/dev/art-provenance.md), [real-assets.md](docs/dev/real-assets.md)).
What still waits on an account, a device or a human is collected in
[`docs/client/outstanding-work.md`](docs/client/outstanding-work.md). v1 is released as **1.0.0**
(below) and its **`v1.x`** branch takes security and crash fixes only — for one year after this
release (owner, Q-12), then end of life; a fix lands there first and reaches `master` by
`git cherry-pick -x`
([build-test-deploy.md](docs/dev/build-test-deploy.md#release-lines)).

### Project

- **Version lines** (R0-01; `2.0.0-alpha.1` since `R2-04.REL` `5aad58e`, `2.0.0-beta.1` since
  `R5-10.T9` `f7d2a8d9`, `2.0.0` with this release since `R6-03.D1`): every package manifest
  says the release version, and the TV manifests, which take numbers only, say the same
  `2.0.0` (the Tizen `config.xml`, the webOS `appinfo.json`), so v2 installs as an update of
  the same apps. CI runs on every push to `master` and to `v1.x`.
- **The maintenance line** (R0-01): `v1.x` carries `1.0.1-dev` (`1.0.1` on the TVs) and names the
  tagged section `[1.0.0]` in its own CHANGELOG. Its commits that only it needs — those versions,
  its notes about the maintenance branch — reached `master` as `git merge -s ours` merges, which
  take nothing into `master`'s tree
  ([build-test-deploy.md](docs/dev/build-test-deploy.md#release-lines)).

### The 640×360 flip (R2-01)

These change what the game shows: since `72b18a1` `master` boots at the v2 frame. At the flip the content was
still v1's world scale — plan step R2-02 ported it ×1.5 (the next section) — and the golden replays and the
attract demos remained v1 recordings until R2-03 re-blessed them (two sections down), while the interim art is
v1's sprites ×1.5 until the R4 round replaces it.

- **The frame is 640×360** (R2-01): `FRAME_W` / `FRAME_H` 640 / 360, 12-px HUD bars and 12-px tiles (the
  playfield 640×336), the font cell 9×12 — the interim font is v1's 6×8 pixel font upscaled ×1.5 at pipeline
  time, uneven on purpose. The interim art is the same story through core's `ART_SCALE` (3/2) and the
  pipeline's `artScale`: every sprite at its new size, the terrain tiles drawn 12-px natively, the laser beams
  drawn natively, and every UI panel sized through `core/ui`'s `uiPx`.
- **v1 replays are refused** (R2-01): the replay format is 2 (`REPLAY_FORMAT_VERSION` /
  `RUN_REPLAY_FORMAT_VERSION`) and the header carries the frame size, so a v1 recording raises
  `ReplayVersionError` and the replay browser shows **V1 REPLAY** — "recorded by v1: cannot play". The entry is
  deleted by hand, never automatically; the attract loop skipped the stale demos until R2-03 re-recorded them.
- **Saves are format 3** (R2-01): a v1 save loads, keeps its options, and its hi-score tables move under
  `legacyScores` — v2's tables start empty, `legacyScores` has no UI yet, and Steam achievements read both. A
  `v1.x` build reading a v3 save falls back to defaults.
- **Electron's `window.json` is version 2** (R2-01): a v1 file's scale converts as
  `max(1, round(scale × 384/640))`, so the window keeps its physical size at the new frame.
- **Self-expiring gates** (R2-01): what cannot pass between the flip and the port skips with the reason in the
  test's name — `CONTENT_PORT_PENDING` (until R2-02), `GOLDENS_STALE` (until R2-03), and in the browser tests
  `R2_03_PENDING` / `PORT_UNMEASURED` — and each throws at import once its window closes (the whole family died
  with R2-03's re-bless). The frame-literal
  scans now ban 640 / 360 / 336 / 348 next to v1's numbers, with the tick timers, the angle 640, the bench
  sizes and the particle degrees on their allow-lists.

### The ×1.5 world port (R2-02)

These change what the game shows: since `8dbe858` the world itself is v2's — every length, position, speed and
radius in the shipped content is ×1.5 of v1's, top edges mapped with the +36 px pad, tiles 12-px throughout.

- **All content ported ×1.5** (R2-02): the R1-03 tool ran for real —
  `rescale --factor 1.5 --top-pad 36` over `content/`: 126 files read, 4,035 changes in 77 files, zero
  unclassified, zero errors — plus its listed hand fixes (the gimmick rock's trigger, zone G's bonus window and
  rising walls, the circler's home), core's `WORLD_SCALE` 3/2 and `WORLD_TOP_PAD` 36 with the whole Appendix B
  constant list rewritten as `v1 × WORLD_SCALE`, boss part bounds ±512 → ±768, the 4-way rule values and the
  playtest bot at their ported numbers (aimed ≤ 3.0 px/tick, lanes ≥ 24 px, capsule windows 1,350 px), and the
  three fingerprints re-pinned to the ported draw (16 segments). Every zone's camera travel, landing and
  first-visible-tick behaviour is checked against the frozen v1 baseline by the new `v2-port*` suite (zero
  landing failures; ground enemies come 64 px of camera travel earlier by decision O11); the bot clears every
  zone, the bonus stage and the boss rush — CELL VAULT's pre-port red went green with the port itself. The
  `CONTENT_PORT_PENDING` gate and its helper are gone (U1 … U5); the Tizen `app.js` grew 767 B gzipped. The
  golden replays, the attract demos and the `PORT_UNMEASURED` e2e waits stayed for R2-03 by design, and R2-03
  re-recorded them (the next section).

### The v2 recordings (R2-03)

These change what the tests and the pictures say about the game: the shipped recordings are v2's now — 640×360,
replay format 2 — and nothing in the suite waits for the port any more.

- **The goldens and demos re-blessed in one commit** (R2-03.G1, `d4ba9e8`): the 62 golden replays and the 10
  attract-demo recordings (nine zone recordings and the format sample) were re-recorded at 640×360 in the one
  `pnpm golden:update` of R2, for the three reasons the message states — R2-02's port, the state hash mixing
  stable content keys instead of file order (R5-P.P1, `6ba1187`: `hashWorld` now folds FNV-1a keys of sprite,
  enemy, path and pattern ids through the pools, so one zone's content change re-blesses only that zone), and
  the wider boss-part tables (R5-P.P8, `273e081`: `MAX_BOSS_PARTS` 16 → 24, decision R5-D5). Nine coverage
  stories the old recordings told changed with the ported world — the Arcade clears of zones A and F, the
  no-god clear of zone C, the gimmick bot's branch, the captain slots, the cache's 1UP, the cave death, the
  cube-rush death — and the tests now record what the new files actually show; the seven coverage rows lost
  that way are filed for R5's re-records. The boss rush and both multi-part fights fit the raised capacity
  with the stress bench green (0.101 ms/tick median).
- **Every self-expiring gate is gone** (R2-03): `test/golden/stale.ts`, `test/e2e/gates.ts`, their pins and
  the shipped-v1 refusal test were deleted with the re-bless, and `golden:update`'s port refusal went with
  them. Before it, the browser specs were re-measured on the ported world in parallel (decision R2-N4):
  the zone specs (`1a5c487`), the runtime specs (`91cc585` — with R1-04's deferred browser check, the drawn
  terrain repeating at exactly `TILE_SIZE`), the boss and HUD specs (`c3018db`), and the 44 gate-debt cases
  rewritten derived (`bdd820a`); the trigger-probe churn the port exposed proved to be the allocation
  guard's own fixture and was fixed, budget untouched (`e1e5374`). The full e2e now runs **229 passed / 0
  skipped** on Chromium and 73 / 0 on the Firefox determinism spec, where wave 5 left 129 / 101 and 2 / 71.
- **The pictures draw v2** (R2-03.I1 / I3): the `docs/images/` plates, the boss portraits and the logo banner
  are built from the shipped 3/2-scale art (`356e7b2` — 50 of the ported 238 part offsets are half-pixels, so
  the portrait assembler rounds), and all 18 `docs/images/screens/` were re-shot at the 1280×720 capture
  (`9785da0`, a re-capture byte-identical); their look waits on the owner's eye. The store icons stay on the
  v1 art until R4-05 and were only `--check`ed (RR-3), and the docs' CJK figures keep quoting the v1 atlas —
  `test/integration/cjk-budget.test.ts` measures it at `artScale: 1`; the live PNG budgets are R3-04's.

### The first retune (R2-04)

These change what the game shows and what its recordings say: the wave's **one re-bless** is `a285e0e`
("R2-04: shake 2/3/6 (F1); spawn lead and density per section (Z1-Z4 tables)" — quoted as its body reads it),
and `5aad58e` grew the version line to `2.0.0-alpha.1`. The `v2.0.0-alpha.1` tag itself is the wave's closing
action, not any commit here.

- **Screen shake grows with the world** (R2-04.F1, in `a285e0e`): `ShakeMagnitude` 1 / 2 / 4 → **2 / 3 / 6** px
  — ×1.5 of v1 with the half rounded up (decision R2-N7); the owner's M7 play session confirms or changes them.
  Shake is folded into the state hash, so the 17 shaken goldens and the zone-f demo moved with the bless; the
  presentation and shell fingerprints are **green unedited** — core's `renderFrame` never writes the shake
  (RT-F1's render-side adjudication, held exactly).
- **Popups and the CRT followed the scale; the rest measured exact:** the score popup now rises **3 px per 8
  ticks** (`adcfe26`, integer maths), and the CRT strengths retuned for the ×3 pitch — `light` 0.2 → **0.24**,
  `full` 0.34 → **0.408**, mask and vignette unchanged as pitch-independent (`d5236e1`; the 1080p tie on TV
  panels is an owner eyeball row). The Mega Crash flash, the black-hole visuals and the particle numbers were
  measured and **left alone** (P4, P2) — the R2-02 port is internally exact; R4-04 owns any real particle change.
- **Zone F is the one section set that retuned** (R2-04.Z2, in `a285e0e`): the port made CELL VAULT
  measurably harder (the non-god bot died 3×; the wave-5 "broken bot" story had already expired at the port),
  so its four lymph-mote columns thinned (counts 6 → 5, intervals to 16 / 18 ticks), the section-1 ceiling
  polyp moved x 3476 → 3660 to de-overlap the turret streams, and both polyps' `fireTicks` 170 → 190 — the bot
  now clears with one early death. Z1 / Z3 measured zones A–C and G–I's 23 sections **tick-preserved** (only
  10 zone-A `skeet` rows moved 1 tick on firstSeen rounding) and Z4 the bonus stages, the boss rush (identical
  330 / 360-tick openings, 335-tick gaps) and all nine loop-2 remixes — empty patches by measurement. Zones D
  and E measured sound and unedited.
- **The one bless** (`a285e0e`, decision R2-N5): 17 goldens + the zone-f demo re-recorded in a single
  `pnpm golden:update` — three passes md5-identical across all 72 recordings; the content-DB fingerprint
  re-pinned 3 shipped rows (stages / enemies / demos). `test/golden/v2-port.ts` gained `PORT_EXEMPTIONS`:
  zone F's 7 band-level port-comparison disclosures and their loop-2 twins, each dropped whole-exact with its
  reason, failing if a listed line ever stops appearing. `golden.test.ts`'s zone-f `deathTicks` pin moved with
  its own blessed recording — the wave-6 bless-lane precedent, disclosed in the body.
- **The version line** (`5aad58e`, decision R2-N8): `2.0.0-alpha.1` in the ten manifests and the three test
  pins; the TVs keep `2.0.0`; the lockfile byte-unchanged; both TV bundles green inside budget.
- **Owner parts pending:** the M7 `build:dev` play of zones A, D and I (the shake confirmation, TPF / RENDER on
  the overlay) — the notes go to the step's As built list when the session runs.

### Real-art systems and memory (R3-03, R3-04)

- **Variants, palettes and tiles from real art** (R3-03): v2 bullets and bending-laser nodes are drawn natively
  at the art bible's sizes; `@p2` is a palette map that reproduces the old red/blue swap exactly (`coop.mjs`'s
  swap code is gone) and the ingest recipe can name one; the palette-cycle scan enforces the bible's §4.4 — any
  near-miss on a cycled layer fails, exemptions pinned; ingested tiles choose "art clipped to mask" or
  "mask from art", derived masks reaching content only through `tileset-masks.mjs --write`; the real-art bullet
  recolour step maps every colour-blind palette frame for frame, proven on a fixture.
- **Atlas and memory with detailed art** (R3-04): a seeded stand-in generator makes zones of the bible's
  density (backdrops, 12-px tileset, 10 enemies, a three-part boss; PNG-8 pages at R1-05's uncalibrated
  0.3–0.6 MB / 2048×1024 assumption — RR-7); the residency gains the lazy `"resident"` policy — decoded images
  dropped, a hold while the shown zone's pages load, a re-fetch after a context loss — as the *prospective*
  default, the flip measured (the atlas crosses the derived 23 MiB only at ×2.044 eager / ×2.706 lazy stand-in
  density); `DIST_BUDGET` is 16 MiB and the real atlas PNG caps (300 KB common / 600 KB zone / 5.7 MB total)
  replace the CJK figures, all derived in `check-bundle.mjs`; the TV bench's decode scenario loads the stand-in
  pages (RR-8) and the render bench gained a "v2 zone stand-in" scenario; a v2 zone load estimates ≈ 450–720 ms
  on the M7 against the 2 s target.

### Stage art features for detailed levels (R3-06)

These change what the engine can draw, not what the shipped game draws: `decor-range`, the v2-only dev range
that uses every feature, is the single `POST_V1_STAGES` carve-out of the v1-baseline comparison, and no golden
moved for any R3-06 commit. The `docs/dev/` feature rows are the wave's other docs lanes'.

- **Decor layers** (`d3a3b0e`, `138bddb`, `b6c08ec`): a stage lists `decor[]` — `back` or `front`, a sprite or
  a tile, with its `frame` and position — up to 256 items, non-colliding, culled by the camera ± 512 px; back
  decor draws under the terrain, front decor above it and below the sprites.
- **Painted backdrop bands** (`d3a3b0e`, `b6c08ec`): parallax bands are full-width 256-px painted images
  (seam-perfect: three tile one playfield at the native scale), with integer scroll factors, a camera-follow
  `yFactor`, and optional slow frame animation (`frames` / `frameTicks`) the renderer follows through the view;
  at most six background bands plus one sparse `fore` band.
- **Three new layers** (`138bddb`, decision RR-6): `LayerId` grows 14 → **17** — `DecorBack` after `BgMid`,
  `DecorFront` after `Terrain`, `Foreground` after `Fx` and **below `EnemyBullets`**, so the foreground can
  never hide bullets; the fingerprints re-pinned for the re-layering only (82 presentation + 4 shell world
  hashes; no drawn value changed).
- **Additive glows** (`1ea1f8f`): enemies, boss parts and decor entries take an optional `glow` sprite name,
  interned at load (an unknown name fails `content:check`); the World carries companion additive batches only
  when the loaded content names a glow (the per-DB rule) — enemy and boss glows come after every body batch,
  decor glows right after their owners, and empty glow batches cost zero draw calls.
- **The Tiled importer maps it all** (`034ecb3`): `decor-back` / `decor-front` tile layers, class-`decor`
  objects, and image layers → bands with the new extras.
- **decor-range and the bench** (`246d014` + `eb0184d`, `b5afd39`): the dev stage flies 7 animated bands, 12
  decor entries, a glowing enemy and the DECOR WARDEN with a glowing vent, on 8 procedural sprites (`decor.mjs`
  draws nothing at scale 1 — the v1 atlas digest pin untouched); the render bench's new decor scenario measures
  the decorated frame at **14 draw calls inside the standing 20**, gate untouched. The step review's two
  landing-seam test fixes landed at `2f2365d`.

### The R4 prep (R4-P, decision RR-5)

These change how art is made, not what the game shows: the shipped atlas is **byte-identical** across the whole
prep at both art scales — the scale-1 digest pin `fa4198…` and the 3/2 atlas both held — and no v2 source
exists yet.

- **Generator and suite splits** (`a359b7e`, `7afc838`): `direct-items`, `arm`, `blackhole` and `logo` moved
  out of the shared generators, the four planned v2 modules registered as empty stubs (registry 34), the
  campaign credits followed (+3 lines, 14 ≤ 16), and the 1362-line procedural suite split into 22
  per-generator files with a shared helper.
- **v2 sources beside v1** (`e3feb5d`, `fe940c3`, decision RR-1): a `<path>.v2.sprite.json` is a sprite's v2
  pixel map (native implied, used only at an art scale ≠ 1), a v2 font is a `"native": true` file of the same
  name, generators branch on `options.artScale`, and at scale 1 a PNG override of a code-sourced name is
  skipped — the scale-1 build (TV bench atlas, CJK figures) keeps drawing v1 art until the post-release
  v2.0.x clean-up. A new name may exist only as v2 (RR-1a); frame counts the v1 sources lack are a v2-art
  concern (RR-1b).
- **`scripts/assets/v2kit.mjs`** (`aee8ec9`): the shared read-only v2 drawing kit — `outline`,
  `topLeftLight`, `bottomRightShade`, `outlineColour`, `offRamp` — outside the registry on purpose; nothing
  ships through it yet.

### The v2 art round (R4)

These change what the game shows: every redone sprite is a v2 source **beside** the v1 map (RR-1), so the
scale-1 build still draws v1 art and its digest pin `fa4198…` never moved through the round. The step reviews
approved (`R4-01.RV` at zero findings including nits, `R4-04.RV` a true zero; `R4-03.RV`'s three comment-class
findings were cured in-wave at `326ff03`); the plan's §10
As-built rows carry the detail, and the owner's eyeball rows are the §17's pending lists.

- **The player's craft** (`R4-01`, wave 8): KESTREL and MANTA and the thrusters are native v2 pixel maps, the
  ships rolling five bank frames and a burn flame behind every hull (`e90e17e`, `4248f5b`, `f0942b1` —
  the bank field is hashed, so `4248f5b` is the wave's one sanctioned golden re-bless, 31 recordings with the
  reason in its body); Options pulse on four frames and the Force Field shimmers on eight (`7b07886`,
  `92b4b73`); the pods, the Reduce steps and the Arm tiers are native, and the shot set follows — the eleven
  pixel maps redrawn and the generated blast, ripple, cyclone and Direct families native (`1a55480`,
  `4a9602f`, `7de90ee`); the black hole pulls at the bible's 48×48 in eight frames (`b760dbb`).
- **Bullets, lasers, items** (`R4-02`): the bullets and beams needed no pixel change — the `R3-03.V1` art is
  bible-complete, and the readability audit `d875eac` proves it with 36 deterministic sheets (nine zones ×
  four colour-blind palettes) awaiting the owner's sign-off; every item kind glints on four frames
  (`ba09e57`) and the cancel point sparkles through four travelling-rim stages — its field is hashed, so two
  late-crediting goldens re-blessed with it (`e1ed688`).
- **Font, HUD and the UI kit** (`R4-03`):the 9×12 font is real now — `pixel9x12.font.json`, 195 glyphs
  hand-drawn under the kana and descender laws, at exactly the metrics R2-01 pinned (RR-2), v1's 6×8 file
  kept for scale 1 (`3c8eca8`, `2954930`, `2fe757c`, `450349b`, `68a6fa8`); the HUD is redesigned for the
  12-px bars — the boss bar at `FRAME_W >> 2`, the Direct groups on a tested pitch, a hand-drawn micro
  script on the meter labels (`96c4e61`); panels wear the bible's two-tone magenta-and-cyan rim and the
  slider grew into the row (`dcf6380`). No font step moved a fingerprint: text commands hash strings, not
  cells.
- **FX and particles** (`R4-04`): the explosions are native at 24 / 48 / 72 px with a white flash cross on
  frame 0 and `"blend": "normal"` (`693e6ac` — the content-DB fingerprint's one `fx` row re-pinned), the
  sparks, sparkles, debris and rings native (`6805952`); the 256-particle pool **holds** — the bot's
  measured peaks are ≤ 100 — recorded as decision R5-D5 (`6805952`'s lane, no capacity file moved).
- **Title, endings, store, docs** (`R4-05`): the logo is redrawn at 330×54 from the bible row and v1's own
  art — no key-art winner (RR-4, `ffa083a`); the title draws a full-frame v2 night with the planet limb and
  the two ships as native half-frames, the common atlas page grown to 2048×1024 (`73dcb6d`); the WARNING
  band, the zone cards and the five endings recompose from the frame constants at full size (`e7d379d`,
  `9873156`), the epilogue and story-crawl panels follow the one-panel rule (`bb153bc`); the store icons
  moved to the v2 art **once**, closing RR-3 (`d23fec0`); the docs plates re-derived and all 18 screenshots
  re-shot on the final art (`45739d8`, `75dc7c0`).
- **The round's fingerprints moved by decision, never silently**: the presentation suite re-pinned at
  `7b07886` (10 segments), `ba09e57` (4 world segments), `92b4b73` (6), `e7d379d` (11 of 12 walks),
  `73dcb6d` (hash rows only), `96c4e61` (10 of 12), `dcf6380`, `9873156` and `bb153bc` (8 walks each); the
  content-DB fingerprint at `D1`'s `fx` row and `E2`'s interned `ui/title-backdrop` name; `f0942b1` moved
  the thruster's name rows in all three pins and no hash; the goldens only at the two hashed fields above
  (31 recordings at `4248f5b`, 2 at `e1ed688`); the shell pin moved only at `4248f5b` / `f0942b1` and the
  `b35cba4` flight-mirror cure.

### The R5 prep closes (R5-P, wave 9)

Nothing here changes what the game shows: these are the zone lanes' tools, all reviews cured in-wave.

- **Tests one file per zone** (`P4` `a216f14`, `P5a1/P5a2` `09cf628` `50b9bb5`, `P5e` `ea2e58b`): the
  patterns bank split into per-zone files byte-identically merged, the behaviour suites and the zone
  runtime / Direct tests became per-zone files — the test census held (859 tests), so a zone lane's red
  names its zone.
- **Scoped bless** (`P3` `c284b78`, cure `0b166c4`): `pnpm golden:update --only <ids>` re-blesses only the
  named zones' recordings and fails loud on an unknown id; the goldens and recovery suites are nine and
  eight per-zone files.
- **Fingerprint write mode** (`P10` `95bc61d`): `SHMUP_FINGERPRINT_UPDATE=1` rewrites the pinned tables in
  place through `pin-writer.ts` (refused under CI); the tamper proof restored all three pins byte-for-byte.
- **The LAND helper** (`0a3c6ad`, cures `dd8daeb`): `docs/v2-run/helpers/land-zone.sh <zone>` runs the whole
  landing — derive the atlas groups, bless `--only`, update the three fingerprints, `docs:images`, the
  release audit and the scope proof, one commit of exactly the derived paths, push — under `flock`, with a
  `--dry-run` in a throwaway detached worktree; the hostile runs proved the cross-zone scope trap.

### The second R5 prep and the first stand-ins (R5-P wave 10, the zone `S2` legs)

Nothing here changes what the game shows until a zone lands: these are the weld's tools and the kits.
Every review closed at zero or cured in-wave.

- **The ramps frozen** (`P7` `3b11fbb`): every zone's v2 palette-cycle ramp is now the generators'
  `<X>_RAMP_V2` list and the stage files' `cycles`, verbatim from the designs — zone A ships none, zone B's
  stands. Presentation-only by construction: zero goldens moved, eighteen world cells and one content-DB row
  re-pinned through the fingerprint write mode, the scale-1 art byte-identical (RR-1). The bible's
  near-miss law forced the abyss murk to `#05131c`.
- **E2E specs one per zone** (`P5d` `9592777`): the four pair specs became `zone-b.spec.ts` …
  `zone-i.spec.ts` plus a shared `zone-helpers.ts`, verbatim apart from the five contract-permitted changes;
  titles 307 → 310, the batch 19/19 green.
- **The bot's set pieces, and a permanent identity guard** (`P12` `5b82697`, cure `7df08dc`, guard
  `da1d8c9`): shaft tracking, fast-terrain look-ahead, branch steering, brick punching, slab riding — each
  behind a condition today's content never meets, **measured, not asserted**: the review caught two gates
  that fired on the shipped zone A/D/F geometry and the cure re-gated them (the look-ahead at 2.4 px/tick,
  the punch on full-window closure of the pristine grid), so every recording byte-reproduces again. The new
  `bot-replay-identity.test.ts` re-records the **52** live-bot scenarios every test run — a bot decision
  that moves a replay is a red test on the spot, never a bless surprise.
- **The tileset law** (`P13` `0e4a952`): a zone tileset keeps `terrain-a`'s tile names as an *ordered
  prefix* and may grow v2 variant tiles — reordered or truncated leads still fail.
- **The boss skip enters at the WARNING** (`P14` `6345f07`): the debug skip lands at the stage boss's
  warning (the first `boss` event only when a stage has none); one recording re-recorded with the rule
  (`zone-h-boss`, 9,066 → 2,433 ticks), eleven presentation rows honest with it.
- **The stand-in kits (decision R5-D6)**: zone A's azure set (`8810f32`), zone C's with the first **v2
  tileset sprite** `tiles/terrain-dune-v2` (`900d24e`), zone D's (`75fa6d2`) and zone B's (`53832f8`)
  landed with the goldens untouched, the fingerprints green, the scale-1 digest pin unmoved, the stand-in
  caps unraised. Zones E … I ride their branches for the wave's fold — zone E's kit measured the **budget
  trap as designed** (green alone, red only at the three-kit union on the shared stand-in residency row)
  and stood down without pushing; the cap stays.

### AZURE VERGE — zone A remastered (R5-01, the first zone LAND)

These change what the game shows and does: zone A is rebuilt to `docs/v2-run/designs/zone-a.md` and landed
at `9d0b472` under decision R5-D1's one-at-a-time flow. The art is the R5-D6 stand-in kit until `R5-01.S3`
drops the real art (owner-gated), so the row stays `done (owner parts pending)` (R5-D7).

- **The rebuilt stage**: 21,000 px inside the contract's 20,000–22,000; 77 events (25 formations, 49
  spawns, the warning, the boss, the end); seven checkpoints; the 2.25 px/tick hold at 12,000 and the
  WARNING at 19,950 past the open-space floor; the new **`terrain-azure`** 12-px tileset (R5-D3) with the
  three spire gorges opened to the **48-px corridor law** (the adjudicated call over design §3's 36-px
  carvings); the 34-entry item plan (2 octagons, 3 rare max) read by the release audit from the zone
  contract's new `directItemComposition` row (`1f3040c`); an 11-entry remix; no palette-cycle ramp.
- **The roster**: the carrier tender frozen for the later zones; five new types — skiff, gale, gnat,
  warden, matron; the azure-marshal mid-boss; and **HALCYON BULWARK** rebuilt to twelve parts with the
  core centred at **x 0** — the adjudicated geometry: a weak point must clear both the plate row's shadow
  and the hull's, and the feasible window is x ∈ (−8, +6]; three phases, exactly two standing lasers, the
  full-rank fight resolving in 2,186 ticks.
- **It plays**: the 4-way bot clears the remaster in **293.4 s** inside the contract's 240–360 s window,
  one captain kill, peaks 12 of 51 live enemies and 12 of 24 boss parts — the R5-D5 capacity check holds —
  and `content:check` runs 100/100 at the branch tip.
- **The weld** (five attempts, the 34-step shape §11 records): 29 recordings re-blessed through the
  composite `node scripts/golden-update.mjs --only zone-a,bonus-range` route (zone A's 26 goldens, the two
  `bonus-range` runs, the zone-A attract demo; the blessed-numbers table rides the commit body; every other
  recording byte-verified unchanged); the three fingerprints re-pinned in the write mode; the atlas groups
  re-derived **12+/2−** (the azure names join; `tiles/terrain-a` and `bosses/maw-pod` demote to `common`);
  the scale-1 digest **re-pin measured at the derived tree**, `fa419802… → 5c35219b…` (name set equal,
  736 frames relocated by the repack); 13 docs plates rewritten. The battery at the pushed tip: core
  385/385 files, shell 77/77, the integration sweep 2,605 passed with zero failures, e2e 110/110 Chromium
  and 73/73 Firefox.
- **Cured on master, not bypassed, on the way in**: the scale-1 pipeline tolerates v2-only sprite names
  (`732bfe1`, RR-1a's first tileset); the demos bless guard takes its listed intent, so composite `--only`
  lists flow and typo-lists still fail loud (`a089adb`); the shell residency premise re-anchors past
  `terrain-a`'s demotion (`62ac4e5` — the class re-fires per tileset-renaming zone, the pattern stable);
  the zones contract meta-suite pins the flag logic, not the flip roster (`f5ea466` — closed for every
  later flip).

### The wave-11 cures on master (MF5 … MF11)

These change the run's kit, not the game: each cure is a routed review finding taken on master before (or
between, for MF11) the six zone LANDs it unblocks — plan §11's wave-11 block keeps the ledger. The one
recording move is MF8-c1's two zone-E goldens (the wave's first intentional-sim bless, superseded by zone
E's LAND). Wave 11 closes with six zones landed; zone H rides its branch's first half into wave 12, and
zone I stands before the owner — its god run measured 369.25 s against the contract's [240, 360] ceiling
and both trim attempts STOPped on fight-RNG re-roll evidence; a four-option menu with the owner stands,
and R5-09's row stays honestly `not started` (plan §11's wave-11 block records the wall).

- **MF5 `a0abbf0a`** — the corridor law counts a full-mask destructible cell as open (zone F's tissue-seal
  was lawful geometry, not a wall; an anti-rot pair proves solid rock still fails).
- **MF6 `ca7c7b0a`** — the set-piece kit's shaft premise admits zone B's deep pan by shape (at most one
  such stage; both worlds pinned).
- **MF7 `38b8c8a1`** — the recovery rule counts branch-gated capsule rows only when reachable after the
  restart (zone D's 12,900 checkpoint counted 5 and had 3 real).
- **MF8 `1030012f` + `e6f4760b`** — the thunderhead's terminal bolt folds 2.4 → 2.25 (the true offender
  behind zone E's 4-way gate; zone E's two goldens re-blessed on master), and the branch-steer premise
  admits zone D's dive choice with the deepestPan premise's middle arm (246 = 432 − 186).
- **MF10 `66e54bcb`** — the memory estimator's images charge re-anchors from the fossil `all` default to
  the residency's true `resident` policy; the double count had stopped zone B's and zone E's welds (E's
  page measured 262,144 B over its share; `resident` clears it by ~3 MiB). No budget moved — the cure is
  model-only.
- **MF11 `29137363`** — the slab-riding premise admits zone G's dy-96 crystal shutters by shape (a premise
  pin, not a playability claim).

### BRINE NEBULA — zone B remastered (R5-02, wave 11's first zone LAND)

These change what the game shows and does: zone B is rebuilt to `docs/v2-run/designs/zone-b.md` and landed
at `1d3fd600` under decision R5-D1's one-at-a-time flow. The art is the R5-D6 stand-in kit until
`R5-02.S3` drops the real art (owner-gated), so the row stays `done (owner parts pending)` (R5-D7).

- **The rebuilt stage**: 20,400 px, 74 events, six checkpoints, seven parallax bands, the 16-entry decor
  block and raster waves on the new `terrain-reef-v2` tileset (nine appended variants); the set piece the
  6600 deep pan into the **286-px shaft corridor**, its mouth re-posed to x 6600 (the wave's first
  shared-kit admit, MF6); 38 capsule sources, the 34-entry item plan, the 13-row remix.
- **The roster and boss**: the new types brine-mine (ring folded 2.4 → 2.25 to hold the 3.0 gate) and
  spume-skipper; the SPUME HERALD refit with two new crown fins; **GALVANIC MAW** rebuilt to ten parts —
  pods 20 hp, the 80-hp core and three new spine turrets on the 50/24 thresholds.
- **It plays**: the 4-way bot clears in **321.7 s**, inside the contract's 240–360 s band, peaks inside
  the 4-way rules; `brine-grotto`'s recordings verified unchanged at the composite bless.
- **The weld** (three attempts): 3 recordings re-blessed through `--only zone-b,brine-grotto`, the groups
  re-derived 12+/1−, the scale-1 digest `5c35219b… → 2e14bd20…` (324 frames relocated, no name changed),
  2 docs plates; its two stops became the wave's fold precedent and the MF10 estimator cure; the battery
  green at the pushed tip (integration 2,608 zero-red, e2e 99 + 73).

### TEMPEST RIDGE — zone E remastered (R5-05)

These change what the game shows and does: zone E is rebuilt to `docs/v2-run/designs/zone-e.md` and landed
at `fe4cdae3` as the wave's second zone LAND. The art is the R5-D6 stand-in kit until `R5-05.S3` (R5-D7).

- **The rebuilt stage**: 21,000 px, seven camera keys with the 12,900 eye-of-the-storm dip to y 60 and the
  15,600 gale lift; seven checkpoints; `terrain-ridge-v2` with ten variants; the new **ice-slab** and
  **lightbird** types; 77 events, 38 capsule sources, the 31-entry item plan, the 12-row remix.
- **The roster and boss**: THE STORM EYE on `captain.circler` — its swirl ring ships as decor without a
  hurtbox, so the entry-first hit law cannot let it shield the core; **SQUALL STEED** rebuilt to twelve
  parts, the snout 26 hp, the three-phase heat ladder verbatim.
- **It plays**: the 4-way bot clears in **311.8 s** (boss phase 26.9 s, 0 deaths); the no-god run clears
  at 341.4 s with two deaths; the MF8-c1 2.25 terminal-bolt fold cured the 4-way gate on master before
  this LAND's own bless superseded it.
- **The weld**: the STOP-first discipline measured the memory wall before the lock, and MF10 was the
  prerequisite; zone E's page crossed to the 1024×512 rung — the wave's first. The tileset router took the
  wave's first real shared-file merge (master's shape kept, one branch added); 3 recordings re-blessed, the
  digest `2e14bd20… → cbecdd2b…` (342 relocated), 4 plates; post-push 10,650 passed / zero red.

### DUNE EXPANSE — zone C remastered (R5-03)

These change what the game shows and does: zone C is rebuilt to `docs/v2-run/designs/zone-c.md` and landed
at `247e39fb` as the wave's third zone LAND. The art is the R5-D6 stand-in kit until `R5-03.S3` (R5-D7).

- **The rebuilt stage**: 21,000 px, eight camera keys over the eight designed sections (open dunes →
  canyon → worm field → scorpion arena → second worm field → dune-surf → sandstorm → calm), the set piece
  the **2.55 px/tick look-down pass** to y 84 over 2,100 px — the first shipped key above the kit's
  look-ahead premise, admitted by shape in this land (both worlds proven); seven checkpoints, WARNING at
  20,100, `terrain-dune-v2`, the one `DUNE_RAMP` palette-cycle, three raster rows.
- **The roster and boss**: the new **spine-burrower** and **dune-lance**; **dust-devil retired to zero
  placements** (the design's seven-sprite census against the ledger's six — the [6, 8] floor taken
  exactly); the DUNE SCORPION on `captain.launcher`; **SANDGRAVE WIDOW** rebuilt to eleven parts, fangs as
  blocker guns, the phase-3 bulletSpeed folded 2.55 → 2.40 to keep the fully-powered rank inside the
  frozen 3.0 law.
- **It plays**: the 4-way bot clears in **296.5 s**, widow fight 21.9 s, 0 deaths (design §8's 40–50 s
  band stands as the owner's taste row); the no-god run falls at 84.7 s with three deaths.
- **The weld**: groups 10/2 (the retired dust-devil and the v1 dune tiles leave the page), `main-3` at
  1024×512; 3 recordings re-blessed, the digest `cbecdd2b… → 767900f6…` (855 relocated), 2 plates;
  integration 2,626 / zero-red, post-push 10,659.

### MAGMA DEEP — zone D remastered (R5-04)

These change what the game shows and does: zone D is rebuilt to `docs/v2-run/designs/zone-d.md` and landed
at `927b137f` as the wave's fourth zone LAND. The art is the R5-D6 stand-in kit until `R5-04.S3` (R5-D7).

- **The rebuilt stage**: 21,150 px, six checkpoints, the **two-step dive** (y 186 then 432) into the caves
  as the set piece, rowsTall 64, `terrain-magma-v2` with four variants, six parallax layers (the new
  magma-deep / chimney / cinder-drift bands), eight vent glows; 75 events with the §4 channel's branch
  regions, 43 capsule sources, the 37-entry item plan, the 10-row remix.
- **The roster and boss**: the new **slag-mine** (a 10×10 hurtbox — the design's 9×9 is not representable)
  and **magma-geode** (hatches four cinder-bats, stands spent), slag-crawler rostered but unplaced; the
  OBSIDIAN CLAW on `captain.crab`; **CINDER BASTION** rebuilt to the §8 table's **17 parts** — and under
  the full-loadout corridor law its chain arms became **destructible** (hp 12/10/8, scores 600/450/300)
  with the core at part index 1: zone A's two-shadow law extended to a third shadow, the release audit's
  own demand.
- **It plays**: the 4-way bot clears in **318.5 s** (boss 14.0 s after the arms cure, 0 deaths); the
  no-god run clears at 317.6 s, 0 deaths. MF7's reach law and MF8-c2's branch admit were its briefed
  prerequisites; the land's doctrine fold refounded the deepest-pan pin on the dive (432).
- **The weld**: groups 10/2, the page crossing to 1024×512 the wave's second; 4 recordings re-blessed
  (the zone's boss run included), the digest `767900f6… → fe99d8a7…` (765 relocated), 2 plates;
  integration 2,630 / zero-red, post-push 10,671.

### CELL VAULT — zone F remastered (R5-06)

These change what the game shows and does: zone F is rebuilt to `docs/v2-run/designs/zone-f.md` and landed
at `5319d732` as the wave's fifth zone LAND. The art is the R5-D6 stand-in kit until `R5-06.S3` (R5-D7).

- **The rebuilt stage**: 21,000 px, seven checkpoints, the hold-descent into the sub-vault (y 96), the
  chase's **three gapless regrowing tissue-live walls** at 11,040 / 11,700 / 12,360 — lawful under MF5's
  corridor adjudication (born of this zone's own stop) and drilled live by the shipped bot's punch; seven
  parallax bands (the schema cap), `terrain-vault-v2`; 85 events, 41 capsule sources, the 35-name item
  plan, the 8-row remix; no patterns or paths file.
- **The roster and boss**: the new **tissue-cyst** pods (three chaser-cells each) and the **viral-dart**
  missile (1.95 px/tick — the price of the speed: turn cap 4, homeTicks 110); the NUCLEUS WARDEN orbits
  210×84 at 2.25 on shared captain art (zero new boss art); **MANTLE REGENT** rebuilt to **19 parts** —
  the 108-hp eye core, four-segment tentacles, blisters worth 800, phases at 85 → 78 → 70 fireTicks — the
  six v1 `regent-*` names kept for zone H's echo.
- **It plays**: the 4-way bot clears in **331.1 s** (boss 35.6 s, 0 deaths); the no-god record case ends
  at 135.2 s with three deaths, its replay-hash identity asserted (the O1 law reports, never promises).
- **The weld** (41 steps, two mid-queue tip-moves): 5 recordings re-blessed — and the Arcade outcome case
  softened its hand-pinned v1-era death-tick list to the count assertion its siblings already use,
  disclosed in the body; groups 9/1 with no page added, the digest `fe99d8a7… → 20a7b109…` (347
  relocated), 4 plates; integration 2,646 / zero-red, post-push 10,692, the Tizen bundle 396.6 KB gzipped
  of the 512 KB budget.

### PRISM LABYRINTH — zone G remastered (R5-07, the wave's last zone LAND)

These change what the game shows and does: zone G is rebuilt to `docs/v2-run/designs/zone-g.md` and landed
at `66122e87` on the MF11 `29137363` base as the wave's sixth and final zone LAND. The art is the R5-D6
stand-in kit until `R5-07.S3` — with it come the core's pulse and the bands' design widths (R5-D7).

- **The rebuilt stage**: 21,300 px over 56 tile rows, the three diving keys (y 168 / 312 / 168), the
  gallery's twelve walls and heart ring; the set piece the four **crystal shutters** swinging dy 96 across
  the lanes (MF11's shape admit) and the two five-column pinch seal bands, entirely destructible and band
  2 drilled live; the crystal lining holds every column ≥ 48 px; a **1-based-RLE cure** (`b61c63a0` —
  heightfield RLE tile ids count from one; the bands' legality and the bank's capsules 6 → 12 are its
  consequences); 81 events, 33 capsule sources, the 37-entry item plan, the 10-row remix; deliberately no
  paths file (the halo rows ride zone A's ids), the patterns file byte-identical.
- **The roster and boss**: the new **prism-shard**, **prism-glint** (the silent capsule drifter) and
  **prisma**; the PRISM SENTINEL on `captain.circler`, fought at 8,040 **without a warning** (P14's skip
  rule holds); **FACET MONARCH** rebuilt to **20 parts** — the 84-hp core gated at 42, gun emitters taking
  the needle volleys from all four guns, crown / shoulders / wings unhittable, height 147 inside the cap,
  the core proven reachable.
- **It plays**: the 4-way god bot clears in **315.4 s** (boss 31.2 s, 0 deaths, peaks 15 / 20); the
  no-god case follows the **O1 identity law** ruled in this weld — the re-recorded run ends gameOver at
  156.0 s with three deaths at the gallery mouth, reported as truth; the §15 gallery windows and the
  mouth's volley difficulty stand as the owner's rows (wave 12).
- **The weld**: the duty-5 O1 gate STOPped the first attempt by design; the restart's five bless hashes
  came out **bit-identical across both attempts** (the determinism proof), `glimmer-cache`'s moving with
  the shared tile strip only; groups 11+/2−, `main-7` grows to 512×512 with no page added, the digest
  `20a7b109… → 7e6fc0e9…` (410 relocated), 4 plates; integration FULL zero-red, post-push **10,713 / 104**
  at the pushed tip — six zones landed, wave 11 closed on `66122e87`.

### The wave-12 cures on master (MF12 … MF15)

These change the run's kit, not the game: each cure is a routed review finding or a weld STOP referral
taken on master (MF15 between, as H's weld demanded) — plan §11's wave-12 block keeps the ledger. Wave 12
closes with zone H landed (the eighth remaster of nine) and R5-10 part 1 (`T1`, `T3`, the report-only
`T6`): zone I still stands before the owner — the god run measured 369.25 s against the contract's
[240, 360] ceiling and both trim attempts STOPped on fight-RNG re-roll evidence, the four-option menu
unchanged — and `T2`, `T8` and every `R5-0n.S3` real-art drop carry to wave 13.

- **MF12 `c86ad478`** — the interim pipeline's upscaled-pool floor follows the natives: 500 → 450 as the
  dimension's six stand-ins went native and the compared pool fell 517 → 499 (RT-T3's one Major; the
  file's own chain-comment precedent, now naming the silent 533 → 517 drain of the earlier waves).
- **MF13 `5a0673a7`** — the demo bless-list guard takes a demo-less list of known stages yet fails an
  unknown id loud (restoring the strict arm over the S7.0 relaxation), and `REAUTHORED_STAGES` carves a
  re-authored non-zone baseline stage (`bonus-vault`) out of the v1-port comparison: the drop disclosed,
  the name asserted still-shipping, the list two-way pinned, the protected port files untouched.
- **MF14 `59d14ed8`** — the render-groups census follows the dimension's new fore band:
  `LayerId.Foreground` joins the `dimension` pin beside a rot-proof content census pinning the exactly
  eight fore-carrying shipped stages; the lesson is law — a step moving a layer kind owes the
  shared-kit censuses in its gate set (master rode red through four SHAs before the weld sweep caught
  it).
- **MF15 `cd4bb68c`** — the four-way bot's slab-ride floor admit became per-stage: zone H's six gate
  slabs pin beside zone G's four shutters, at most two slab stages hold the admit and a third must
  re-earn it, both worlds proven, the fail-loud control reproducing the welder's red verbatim.

### The high-speed dimension's v2 stand-in art (R5-10.T3)

These change what the game shows, never what it simulates: the `dimension` stage — the Mode-7 gallop —
got its v2 stand-in kit at `90a20a3a`, presentation-only lines throughout.

- **Six names native, five new**: floor, sky, pylon, maw, claw and leg repainted at v2 sizes; the new
  `bg/dimension-rift` mid band (a half-frame skyline of monoliths with blinking windows),
  `bg/dimension-strands` fore band (sagging into the top rows, never the ship's lane), two decor shards
  and a rift halo. The parallax's single band becomes three (the sky stays index 0 — the runtime law),
  six decor backdrops join, and glows hang on the pylon and the maw's mouth.
- **The geometry holds**: the Mode-7 pass is untouched — every landed horizon/bottom spec row held
  unedited (8/8 green, the budget 16 unraised); v1's bytes stay served at scale 1 (RR-1); no sim field
  moves (glows are never hashed); 4 plates, and the fingerprints' re-pin (232 / 14 / 6 rows) rode the
  five new names' id shift.

### The bonus stages laid out for v2 (R5-10.T1)

These change what the game shows and does at the run's hidden detours: the three bonus stages were
re-laid for the v2 world at `cea1b20d` — the wave's first LAND and a two-day weld (kit cures `MF13` and
`MF14` are its stops' children).

- **The re-lay**: `brine-grotto` and `glimmer-cache` doubled to **5,400 px**, `bonus-vault` to
  **4,200 px**, all three on the single 1.5-speed camera key — forced by the live loop caps (5,400 px
  clears in 3,615 ticks against the 4,000-tick runtime pins); carrier groups, cube walls, the prism
  rushes, the vault's pillar pairs and its 1UP's four mid-lane brackets all authored to layout;
  `bonus-range` was the check case, verified untouched. The looks ride their zones: every backdrop,
  raster and cycle field byte-identical, the carriers' art fields v1 (no new sprite name — no plate).
- **The laws, from layout**: every bonus outcome law rewritten for the new runs, none pasted — seconds
  windows 59–67 s (the old 30.25 / 26.9 s recordings are arithmetically unpastable at double length),
  the grotto's 1UP promise `lives − 3 − extends ≥ 1`, the cache's relaxation to `lifeDelta ∈ [0, 1]`
  (the old `lives === 3` asserted the old run's accident), the vault's four promises kept.
- **The weld**: the program's first `--only` bless list owning zero demo stages and first re-authored
  non-zone baseline stage — two STOPped steps became MF13's bless guard and `REAUTHORED_STAGES` carve
  and MF14's census, and resume-3 landed: three goldens blessed (2,143,762,895 / 904,451,765 /
  73,544,239) with the `bonus-range` pair byte-identical, the digest unmoved (zero churn), fingerprints
  4 / 1 rows, post-push full suite zero red and a seven-spec e2e batch exercising the re-laid stages.

### IRON CITADEL — zone H remastered (R5-08, the wave's zone LAND)

These change what the game shows and does: zone H is rebuilt to `docs/v2-run/designs/zone-h.md` and
landed at `a2d94928` on the MF15 `cd4bb68c` base, the eighth remaster of nine (zone I alone stands down
before the owner). The art is the R5-D6 stand-in kit until `R5-08.S3` drops the real art (R5-D7).

- **The rebuilt stage**: 20,250 px of six sections — the fortress gate with its six swinging plate slabs
  and plug doors, the void parade hall, the ten-piston hall with 33-px throws, the ceilingless core run
  and the breathing throne; 103 events on eight camera keys past six checkpoints, `terrain-citadel-v2`
  with §9's four appended tiles, the fifth parallax band riding the banners.
- **The roster and boss**: the new **gate-sentry** pair (floor + ceiling `turret.floor`, one quantised
  volley every 150 ticks) and **iron-banner** drifter with five v1 types — seven new-by-sprite inside
  rule 3's band; **IRON SOVEREIGN** rebuilt to **18 parts**, design §7's six-pod ring out-voted by the
  frozen release-audit law (R5-D10 class: the fully-powered MANTA stalls the 20-part ring past 36,000
  ticks — pods at four, height 168 inside the 202 cap); the OBSIDIAN parade's four echoes re-rigged
  from the landed boss trees under a machine-asserted match law (the maw's byte-identical, disclosed).
- **The cures riding the land**: the S6 capsule-window cure (four in-window banner rows → spawn rows —
  the literal option-1 proved engine-impossible: a row's `drop: null` suppresses only the formation's
  completion drop, every member still drops); the arcade golden rewritten to assert its RECORDED replay
  (the F/G twin law — gameOver at 5,632 ticks with two deaths and score 3,130 is the design's honest
  Arcade truth, and whether the bot should survive Arcade rank stays the owner's taste row).
- **It plays**: the 4-way god bot clears in **324.5 s** (boss 42.9 s, 0 deaths, score 130,390, four
  parade captains); the no-god record case runs 397.6 s with two deaths, its replay-hash identity
  asserted (the O1 law reports, never promises).
- **The weld**: 39 steps, one STOP class outside every enumerated derivation (B-1's slab floor cured
  law-side on master as MF15, B-2's arcade assertion as FIX3 — content unmoved both times); restart-2
  blessed 5 files digit-for-digit against the banked table, every other recording bit-unchanged;
  groups +5/−1, the wave's one disclosed fold — the interim digest `7e6fc0e9… → da5879b4…` (808 scale-1
  positions relocated, name set equal, pixels byte-identical); fingerprints 117 / 13 / 3, 5 plates;
  post-push **10,733 / 892 files** zero red, the weld's e2e batch 100 + 73 under the lock.

### ABYSSAL THRONE — zone I remastered (R5-09, the last zone LAND)

These change what the game shows and does: zone I is rebuilt to `docs/v2-run/designs/zone-i.md` and
landed at `2d35a7a5`, the ninth remaster of nine — the run's last zone LAND. The art is the R5-D6
stand-in kit until `R5-09.S3` drops the real art (R5-D7).

- **The rebuilt stage**: 20,400 px of a **dive** — the camera sinks under the shelf lip (rows 26–27,
  x 156 to 12,300) and runs the full two playfields: the ceiling passage, the mine drift where the
  four coral punch columns and the two basalt buttresses frame the hermit's antechamber, the carved
  undertow at the run's fastest key, then past 12,300 the void-column ascent — the camera climbs the
  full 312 px to the surface while the ascent's `lines` raster shines the ARK's light down. 77
  events on six camera keys with three holds, past six checkpoints; `terrain-abyss-v2` (v1's twenty
  tiles verbatim + coral + `abyss-glow`), the 320-px parallax joins — deepwall, vents, fore flakes
  (the S2 template law adjudicated over the design's 640, the zone-D precedent), sixteen vent-glow
  decor, and the R5-P.P7 palette `cycles` frozen, byte-identical.
- **The roster and bosses**: three new types — the **abyss crawler** walking the trench floor and
  fanning when it stops, the **stinger** flying the hook's own homing ballistics as the ARK's escort,
  the **deep tender** carrying capsules over open water — eight new-by-sprite at the v2 band's
  ceiling; **TH-11 THE TRENCH HERMIT**, the zone's first captain, a hermit crab on the ORBIT
  WARDEN's kit with **no WARNING and no time limit** (P14's skip law holds — the skip lands on the
  ARK's warning at 19,650 alone); the **ABYSS ARK** grown from eleven to **fourteen parts** — the
  720-px five-section keel, three-over-three turret rows with heading frames, the new deck pods
  (box → circle adjudicated — boxes never turn), the heart 130 → 105 hp for the 90-s budget, the
  intro 240 → 180, the raid sweep widened −190 → +10 → −190 over the longer body; **THE HOLLOW
  KING** at **eleven parts** (was nine) — the new fin armour, the maw 96 → 80, the lure 30 → 24,
  phase thresholds 54/24, the phase lists themselves byte-identical.
- **The rulings that rode the land**: R5-D13 — the contract's global band ceiling widened to 420 s
  on the owner's option 2, the god run measuring **369.3 s** inside [240, 420], the 240-s floor
  untouched; and R5-09.FIX2 — the checkpoints re-seated at 2,880 and 6,240 where the clear-spawn
  law collided with the lip and the dive floor (the law stood; the law-weakening option was
  rejected priced).
- **It plays**: the 4-way god bot clears in **369.3 s** (boss 51.4 s, 0 deaths, score 146,250, live
  enemies 15 of 51, peak boss parts 14 / 11); the no-god case records three deaths (contact 2,983,
  terrain 6,000, bullet 19,846) and its replay-hash identity is asserted (the O1 law reports, never
  promises). The skip golden fights the ARK's two phases and the king's three; the escape golden
  stands as the time-limit flag case (5,970 ticks, 4,500 points).
- **The weld**: the first leg STOPped on gate evidence (B-1, the checkpoint law) and restarted
  audit-first — 8 legs to one zone LAND, delta identity across them; four files re-blessed
  (`--only zone-i`) digit-for-digit **identical across the weld's two trees**, drift 0.0 s — the
  bless-identity proof, since the FIX2 re-seat moved respawn data only, never a scroll path; the
  disclosed folds are the interim digest `da5879b4… → 611190ef…` (471 scale-1 positions relocated,
  name set equal, added 0, removed 0) and the two kit-census admits; groups +10/−1, fingerprints
  117 / 10 / 3, 6 plates; post-push **10,755 / 890 files** zero red, e2e 100 + 73, the campaign
  audit 68/68 held with its [180, 360] tripwire untripped, and the v1-port `zone-i` rows drop under
  the remastered condition, disclosed.

### The escape sequence's v2 layers (R5-10.T2)

These change what the game shows on the run's last screen, never what it simulates: wave 12's
carried item landed at `19575596`, once the zone-I LAND freed the stage files it rewires (its
companion carry, the linked-pages rule, had already landed below).

- **Six names, v2-only**: `escape.mjs` draws `bg/escape-skyline` (320×90, ×2f), `bg/escape-girders`
  (320×60, ×2f) and the fore `bg/escape-streaks` (320×30, ×2f — its frame 1 the quarter-period
  drift), the decor flares `-a` 18×30 and `-b` 12×42 and the 32² `fx/glow-escape-flare` — every one
  `native`, every one empty at scale 1 (RR-1a: the escape has no v1 art to stand beside). The band
  widths are half-frames; the skyline stands on the playfield floor.
- **The stage gains three parallax bands (4 → 7 — the star bands keep their places, the runtime
  index law), eight back decor flares along the 6,300-px length (three with glows) and two raster
  passes** (far haze 216–336 amp 3; the terrain wave from x 1,800, the camera ramp). Pure
  additions: camera keys, checkpoints, tilemap, events and music lines byte-identical, and
  `terrain-a` stays (R5-D3's Q-13 answer). No `cycles` list — a new stage cycle list would reserve
  a palette ramp project-wide (the scan law), adjudicated out.
- **Presentation-only, machine-proved**: `golden:update --only escape` refuses (the escape owns no
  recording), so the LAND re-recorded `--only zone-i` — every golden and demo came back
  **byte-identical**. The six new names shift every later sprite id, so the three fingerprint files
  and the content-DB pin re-pinned in T3's disclosed id-shift class (among them the presentation's
  `extra.bossRush` entry, `7cfb1958… → 8ddfd508…`); the `render-groups` fore census gained `escape`
  (a stage gaining a fore band is adjudicated by the step that moves it, the 59d14ed8 law); the
  campaign's credits line now names `escape.mjs`; `Changed plates:` none.

### The boss rush re-timed for the rebuilt bosses (R5-10.T4)

These change the pacing of one extra mode, nothing else: the rush still fights A → I in the ids'
own order, but the rests between the rebuilt fights grew, at `7e9f622c` — the first landing of
part 2, before the escape's.

- **Eight gaps 150 → 210 ticks** (2.5 → 3.5 s, the half-second grid); HALCYON BULWARK's 360-tick
  opening stays — it precedes the first WARNING by design. v1's 150-tick rests expired before the
  remastered fights ended: the rebuilt bosses run ≈ 1.37× v1's bot aggregate (15,425 against 11,283
  god-mode ticks across the nine).
- **It clears**: the re-timed god run finishes the nine fights in **350.0 game-seconds**, inside the
  harness's 600-s tick cap — untouched — and the test's `60_000` ms Vitest timeout stands (measured
  wall 0.9 s). No golden or demo plays the rush, so nothing re-blessed; the only derived move is
  the content-DB fingerprint's `core.stages` entry (`f1ef091d… → 3db00a57…`), and the shell frame
  fingerprint is unchanged.
- **Erratum, on record** (the umbrella `R5-10.RV` review's one Minor): the commit **body** also
  claimed the presentation fingerprint's `extra.bossRush` row re-pinned here. It did not, and could
  not: the walk plays 400 ticks and the first re-timed gap fires near tick 1,400, so the pin is
  byte-identical across `7e9f622c` (`7cfb1958 e6f43c78 805c4cb2 e9642425`). The row moved later the
  way it legitimately does — at the escape landing above, under the new-names id-shift class. A
  pushed body is unamendable; the plan's R5-10 As built carries the correction.

### The loop-2 span audit — and the two tails it found (R5-10.T5 → R5-04.ZFIX1, R5-05.ZFIX1)

These change what loop 2 plays in two zones: the audit committed nothing; its findings landed as
zone fixes under wave 13's rule 1.

- **The audit** (`w13-T5-report.md`): `loops-runtime` and the whole golden set green as committed,
  the named loop goldens (`zone-a-loop2-boss` / `-god`, `zone-a-caravan`) verified unchanged. The
  block's read-only span check — first remix event before a quarter of the stage, last past its
  final checkpoint — printed `spans` for seven zones and **DOES NOT SPAN** for D and E: their `S5b`
  remixes scaled v1's event positions but added nothing across the remasters' expanded tails (D
  stopped at 14,640 of 21,150 with its last checkpoint at 16,200; E at 16,650 of 21,000 with
  17,550), so loop 2 played the loop-1 layout verbatim through the boss approach. The `v1.0.0`
  control prints `spans` for all nine — an expansion artifact, not a legacy shape.
- **Zone D** (`d5aeda48`): six remix rows fill the 6,510-px tail (10 → 16 rows) — ember-wisp trails
  at 15,300 / 16,400 / 16,900 / 18,900, the cinder-bat at 17,800, the slag-mine at 18,300 — ids the
  zone already ships, the remix law's shape intact (`drop: null`, `bonus: 0`); the span check prints
  `spans`; every loop-1 golden and demo byte-identical (loop-2 data moves no loop-1 hash); the only
  derived move is the content-DB `core.stages` entry (`0e68fe78… → a07b774b…`).
- **Zone E** (`6f85c004`): four rows (12 → 16) — the hail-drifter at 16,860, the gale-kite at 17,760
  on the low overtake loop past the checkpoint, the ice-slab at 18,240, the lightbird at 18,560
  (1,540 px clear of the steed's warning at 20,100, so the remix never stacks on it); same proofs,
  same single-entry re-pin (`a07b774b… → 3d7915b8…`), and both reviews (`w13-RT-ZD`, `w13-RT-ZE`)
  closed at zero.

### The render bench draws the real zones (R5-10.T7)

These change what the benches measure, never what the game shows: R3-04's stand-in scenario gave
way to the nine remasters in the headless bench, at `a70a933a`.

- **Headless, the real thing**: `render.perf.ts` reads the nine campaign stages from
  `content/campaign/main.campaign.json` (fail-loud unless it names exactly nine), plays each real
  world under the stress load with the camera flown in, over the shipped grouped atlas at the served
  art scale; `load.ts`'s `zoneSweepViolations` gates draw calls, render ms, pooled render targets,
  heap and live load per zone, and a final test prints the per-zone table. Measured: worst **15 of
  the 20 draw calls**, p95 **1.70 ms** against the 16 ms budget, worst heap **519 KB** against
  1 MiB; zones B–I each carry a 2,048 KB raster pooled target (zone A's opening carries none). No
  budget moved. The milliseconds are the SwiftShader machine-relative column; the M7 rows come
  with wave 15's captures.
- **The TV widget keeps its stand-in page load** on purpose: the shipped bench's 18-scenario matrix
  still loads `standin-zone-a` as its density carrier — the owner's R0-03 campaign measures against
  it, and the decode row rides the stand-in pages. `bench-gates.ts` unmoved; the two integration
  pins moved with the swap (`render-bench.test.ts`'s stand-in gate became the sweep gate with a
  campaign-content pin; `tv-render-bench.test.ts`'s driver guard, its record-shape tests kept); the
  bench 196/196 EXIT 0 and `apps/tizen/test/bench` green.

### The linked stages share their zones' atlas pages (R5-10.T8)

These change which atlas pages a boot uploads, never what is drawn: the packer learned that a
linked stage's art belongs to the zones that link to it, at `3ded2e88`.

- **The rule**: `stageSpriteSets` walks the links — a zone's `escapeId`, the campaign's zone-walk
  `stageId`s — to a fixed point, and `atlasPageNeeds` attributes a linked stage's sprites to the
  cluster of the **linking** zones (art no zone claims stays in the global common). The escape boots
  the common page plus zones H's and I's pages, since only they link to it; entering it from zone I
  uploads only zone H's pages as well. The browser residency spec gained the two linked checks.
- **The guard a collision taught**: the loader's music-cue `stageId` branch read the escape's track
  14 as raster-range's stage index — a false link that would have moved `drifter` between clusters
  and shifted the scale-1 v1 digest pin (RR-1); the branch now requires the id to name a stage.
  Nothing derived moved: no golden, no fingerprint row, and the re-derivation under
  `SHMUP_ATLAS_GROUPS_UPDATE=1` is a byte-identical no-op — the escape's stand-in art rides common
  under this rule; if a real-art drop owns it to a zone, the group flips then.

### The `2.0.0-beta.1` version line (R5-10.T9)

These change only the version numbers, mirroring R2-04.REL, at `f7d2a8d9`.

- **Ten manifests**: root, the five packages, the four apps — `2.0.0-alpha.1` → **`2.0.0-beta.1`**.
  The TV manifests take numbers only and stay `2.0.0` (the `config.xml`, the `appinfo.json`), so v2
  installs as an update of the same apps; `pnpm-lock.yaml` byte-identical (no lockfile line holds a
  workspace version). The pins that quote the line — tooling-config's `RELEASE` and prerelease
  tuple, the config-xml consistency title, the store-assets comment — moved in the same commit; the
  docs' version sentences are the wave's docs item (this file's line above, README, `CLAUDE.md`,
  the client pages).
- **The `v2.0.0-beta.1` pre-release tag** is the wave's last action (rule 4): the orchestrator cuts
  it after the docs item and the wave's exit checks, on the `origin/master` tip of that moment.

### The balance harness and its report (R6-01.B1, R6-01.B2)

These change what can be measured and record proposals — no shipped number moved: R6-01 opened.

- **The harness** (`33e1bad2`): `test/bench/balance.perf.ts` — eight cases (four presets × two
  ships) fly **every campaign route without god mode** through the read-only route kit, recording
  per zone the score curve, deaths, extends earned, rank and the boss fight times; two runs write
  byte-identical tables (determinism by `diff -r`, not averaging), the suite hides behind
  `SHMUP_BALANCE=1` so `pnpm bench` and CI skip it in seconds, and it is not part of `pnpm test`.
- **The report** (reviewed at zero; committed verbatim at `161e84e0` as
  `docs/v2-run/balance-report.md`, its one superlative cure following at `d569c532` — zone E's
  longest-zone claims scoped to the mid zones at three sites in both copies, byte-identity kept
  by `cmp`): eleven sections — the nine zones, Global, Extra modes — every
  proposal citing its table row: 162 rows, 10 named arcade gaps accepted. The extends ladder
  20,000 / every 70,000 keeps, as do rank base and growth, lives, continues, death penalties and
  bullet speed; the zone scores keep everywhere but one — **SQUALL STEED 35,000 → 40,000** (the
  depth-2/3 majors' row is 40,000, and the steed holds the mid zones' longest mean clear and fight
  at the lower pay); the one rule proposal is the milking cap, **`repeatKills` 40 → 100** (seven
  zones carry a natural kind above 40 instances — at 40 an honest playthrough is silently shaved);
  the caravan clock proposes **3 → 4 min** against decision R6-D1 — "unless the numbers say
  otherwise", and at v2 lengths none of the 162 rows can finish inside 180 s, so the time bonus is
  dead weight as shipped; the boss-rush rests keep T4's re-timed grid. Propose-never-apply: wave
  14's `B3a … B3i`, `B4` and `B5` land what the owner's play-session read does not overrule.

### The numbers land, and the TVs boot again (R6-01.B3 … B5, wave 14)

These move shipped numbers — the balance report applied as proposed, the owner having delegated the landing
to the wave and sent no overrides — and one boot hotfix rode the same span:

- **SQUALL STEED 35,000 → 40,000** (`9e42a19e`, the `B3e` LAND): the report's one zone-score change, and the
  whole span's only one. The two zone-e goldens re-blessed with the reason in the body — 75,730 → 80,730 and
  75,170 → 80,170, the +5,000 landing in the final window alone; the attract demo byte-stayed (its 2,400-tick
  window ends before the boss dies). The other eight zones closed as **zero-commit disk audits** — every KEEP
  cell re-checked against the shipped files (claim tables of 24 / 17 / 21 / 18 / 18 / — / 21 / 21 numbered
  rows), every verdict NO-CHANGE CONFIRMED; their pacing notes are recorded observation, not proposal.
- **The milking cap, `repeatKills` 40 → 100** (`b38a55a0`, `B4`): the rules file and core's
  `DEFAULT_REPEAT_KILLS` in one commit, the extends ladder, presets and every other scoring constant kept
  byte-identical. One recording moved, and the mechanism is code-verified: the cap counts **child kills**
  only — enemies a script or a boss spawned — never stage-timeline spawns, so only the one captain-brood
  farm ever hit 40: `captain-range-god` re-blessed 20,950 → 28,780, its post-cap kills restored from ten
  percent to full pay. The other 61 goldens and all ten demos byte-stayed; the release audit's capsule
  window and all nine zone-recovery suites held over the new cap.
- **The caravan clock, 3 → 4 min** (`9a34473c`, `B5`): `CARAVAN_TICKS` 10,800 → **14,400** — decision
  R6-D1 applied amended, "unless the numbers say otherwise" and none of the 162 rows could finish inside
  180 s — with the hint reworded to FOUR MINUTES in the built-in table and the en / es / ja string files.
  No golden moved: the caravan golden carries its own frozen stage time limit, decoupled by design. The
  presentation fingerprint moved exactly four rows — the caravan hint sighted across three
  walks that open the EXTRA menu (front-end, game, EXTRA-modes) — plus one `core.uiStrings` content-DB row; the boss-rush rest grid KEEP-proven byte-identical. One
  disclosed deviation: a same-class literal pin quoting the hint string followed it outside the block's file
  list, adjudicated a justified pin at review.
- **Reviews at zero:** `B3e-RV`, `B4-RV`, `B5-RV` and the umbrella `R6-01-RV` all APPROVE without a critical
  or major finding — the umbrella proved the span rule-1-exact against the report and re-ran the full battery
  at the tip green, skip census baseline-identical, twice byte-equal.
- **The TVs boot again** (`2987d225`): the dependency security update `b42d34f2` took pixi.js to 8.22.0
  through the catalog caret, and 8.22 parses its GLSL sampler-precision strings with the `matchAll` string
  method — Chrome 73, beyond both TVs' engines (Chromium 69 / 68) — so every TV build answered WEBGL IS
  NOT AVAILABLE at boot. The cure is a hand-written ES5 spec shim prepended after the globalThis polyfill in
  **all four** TV builds, game and bench, both vendors (webOS reads the Tizen file), with a new bundle-check
  rule watching it while the ESLint floor still flags the call in shipped source. It costs 2.2 KB gzipped a
  bundle; both land at ≈ 405 KB of the 512 KB budget, headroom intact, and the built bundles grep to only
  Pixi's own two uses. `RT-GLFIX` APPROVE at zero; the suite census is identical to before the fix.

### The GRAPHICS options page (R6-04, decision W5-20)

- **`OUTPUT` and `RENDERER`, saves format 4** (`9f7ea14` … `6ee8174`): a GRAPHICS page sits between GAME and
  EXTRAS — `OUTPUT` caps the canvas backbuffer (AUTO takes 1280×720 on the TVs and native on desktop / web,
  the sweep's numbers behind it) and `RENDERER` chooses AUTO / WebGL 2 / WebGL 1, WebGL 2 only above a
  Chromium-71 floor with a live probe as safety net, so both TVs stay on WebGL 1; `CRT` and `ASPECT` moved
  from DISPLAY and still apply live, the new rows apply at restart. `SAVE_VERSION` is **4** (a v3 save
  migrates with both choices `auto`). No simulated state moved: the goldens and demos are untouched, and the
  presentation and content-DB fingerprints re-pinned once, at `6ee8174`, with the reason.

### The TV reads its own logs (R0-03.A1, R6-02.P3 — wave 15)

These change nothing in the game: the owner's committed M7 bench logs were analysed, and every
mitigation R6-02 listed was adjudicated not needed.

- **The analysis** (`R0-03.A1-report.md`, `R6-02.P3-report.md`, nothing committed): all fifteen
  `rb-*.jsonl` sessions of `tools/input-probe/results/2026-10-19-m7-bench/` and
  `…-bench-resolutions/` (with its `out720/` and `out540/` sweeps) — four campaigns, the WebGL
  pairing settled per session, all on the one M7 unit plan R0-03 step 3 designs (the second is
  identical and runs only on a firmware difference) — read with `analyze-bench.mjs`, one call per
  campaign with both GL sessions together; the probe's `npm run verify` green.
- **The budgets:** TPF reads 1 at the shipped `Auto` output (≥ 98 % of frames in every normal-play
  row; the synthetic `worst` stress row disclosed); zone load 1.48–1.59 s cold against the 2 s cap;
  counted memory ≤ 21 MiB of GPU plus ≤ 30.8 MiB of heap against 100 MiB, draw calls 11–16; and
  the absolute render milliseconds sit on the panel's pacing floor — this same-session 384×216
  baseline misses 8 ms too — where the plan's §13 relative reading is the TV measure, and there
  640×360 costs ≤ ±1.7 pts two-tick beyond v1. The boot and process-wide figures ride the `rp-`
  guided capture, which the owner has not run: a missing measurement, no budget contradicted; the
  capture stays open as the owner instrument it is.
- **P4a–P4d: not needed** (wave rule 2 — no scene-attributable miss): no parallax cap, no
  half-resolution far layers, no CRT default flip, no WebGL 2 default — R6-04's `OUTPUT` row is
  the measured lever, and its `Auto` already keeps the TVs out of the only mode where GL 2 wins
  (the 1080p-fill sweep rows: 21 better / 0 worse there, within noise at the shipped outputs).
  The tables and verdicts go to `docs/dev/input-probe-results.md` §12 with `W15.DOCS-C`.

### The `2.0.0` release line (R6-03.D1)

These change only the version numbers, mirroring R5-10.T9, and turn this file's development
heading into the release section above.

- **Ten manifests**: root, the five packages, the four apps — `2.0.0-beta.1` → **`2.0.0`**.
  The TV manifests take numbers only and never left `2.0.0` (the `config.xml`, the
  `appinfo.json`); `pnpm-lock.yaml` byte-identical (no lockfile line holds a workspace version).
  The pins that quote the line — tooling-config's `RELEASE` and its now-plain prerelease check,
  the config-xml consistency title, the store-assets comment — moved in the same commit as the
  CHANGELOG heading, per decision R6-D2, with the `CLAUDE.md` version sentence.
- **The `[2.0.0]` date is the expected one** — `R6-03.D7.DOCS` amends it if the owner's OK comes
  on another day. The `v2.0.0` tag and the GitHub release are `R6-03.D7`'s alone, after the
  wave's one full suite (`D6`) and the owner's explicit OK (decision R6-D3).
- **The RR-1 clean-up is deferred**, not dropped: deleting the v1 art sources the scale-1 build
  still reads waits for a v2.0.x step after the release, with its five points recorded in R6-03's
  As built in [`plan_resolution.md`](plan_resolution.md).

### Engine and tooling

Nothing here changes what the game shows or does: the golden replays, the attract demos and the
new presentation fingerprint are unchanged.

- **The frame is a handful of constants** (R1-01): `@shmup/core` exports `FRAME_W` / `FRAME_H`
  (384 / 216), `FRAME_CX` / `FRAME_CY`, `HUD_BAR_HEIGHT`, `PLAYFIELD_Y` / `PLAYFIELD_W` /
  `PLAYFIELD_H` / `PLAYFIELD_CY`, `HUD_BOTTOM_Y`, `TILE_SIZE` (moved from `core/data`) and the font
  metrics `GLYPH_W` / `GLYPH_H` / `LINE_H`, and every frame-dependent number in core — the HUD and
  the UI kit, the scenes' panels and bands, behaviour defaults such as `laserLength`, spawn and cull
  edges, the point items' score targets, the content schema's bounds, the campaign's line caps —
  derives from them, so R2-01's switch to 640×360 is a change of those constants
  ([conventions.md](docs/dev/conventions.md#frame-numbers-the-literal-scan-and-the-fingerprint)).
- **The rest of the code takes the frame from core too** (R1-02): render-pixi's defaults, the layer
  effects, the Mode-7 floor and the debug overlay, the shell's own scenes, the memory estimator and
  the boot, Electron's window sizes (default ×3 / largest ×10 today, ×2 / ×6 at 640×360), the scripts
  (`scripts/frame.mjs`, a pinned copy of core's constants for code that cannot import it — the Tiled
  importer, the store and doc pictures, the webOS manifest check) and the browser tests (the viewport
  and every pixel sample through `test/e2e/frame-pixels.ts`). The store screenshots stay 1920×1080
  after the switch. **Fixed:** the Mode-7 floor sampled atlas page 0 whatever page its tile was on —
  harmless with today's one page, wrong as soon as the atlas has more.
- **Every content number has a unit, and a tool ports the content by them** (R1-03): every number of
  every content kind says what it means — a world x, a relative offset, a speed, a row anchored to the
  screen's edge, ticks, an angle … (26 units; behaviour tunables through `BEHAVIOR_PARAM_UNITS`) — and
  `node scripts/content/rescale.mjs --factor 1.5 --top-pad 36` ports `content/` to v2's ×1.5 world by
  them: world values ×1.5, absolute y plus the 36-px pad, edge-anchored values kept at their distance
  from the new edge, blocks and ground enemies kept on their terrain, the parallax backdrop placed as one
  layout, the map's right end following the new view, everything it cannot do alone listed for a person
  to check. It changes nothing at factor 1 and classifies every shipped value at ×1.5; the real run is
  plan step R2-02's ([content-data.md](docs/dev/content-data.md#units-and-the-rescale-tool-r1-03)).
- **8- or 12-px tiles, any font cell** (R1-04): the tileset and tilemap schemas accept 8 or 12
  (`MIN_TILE_SIZE` / `MAX_TILE_SIZE`; shipped content uses `TILE_SIZE`), the terrain generator
  draws any even tile size and resamples collision masks between sizes (`renderTerrainTiles`,
  `resampleMask`), and collision, the stage runtime, the terrain layer and the text renderer are
  proven at 12-px tiles and a 9×12 font.
- **The TV render bench** (R0-02, `pnpm bench:tv`): a second widget beside the game
  (`ShmpCupBnc.RenderBench`, `apps/tizen/dist-bench/`; a build-only webOS stub too) that measures a
  v2-shaped synthetic scene at 384×216, 640×360 and 960×540 — 18 scenarios, render CPU time,
  `gl.finish()`-synced time, frame pacing, draw calls, render-target and texture bytes, the heap —
  and reports by an on-screen table, POSTs to the input probe's log server (`render-bench`
  sessions, `@shmup/shell` `sendRenderBench`) and `localStorage`;
  `tools/input-probe/results/analyze-bench.mjs` prints each size relative to the same session's
  384×216 and applies the plan's verdict rules. **Never run on a TV yet** — that is plan R0-03, the
  owner's ([build-test-deploy.md](docs/dev/build-test-deploy.md#the-tv-render-bench-r0-02)).
- **The AI art ingest tool** (R3-02, `art-prompts/ingest/`): one command from a generated image to
  a game-ready sprite source — key removal sampled from each region's border with hole and despill
  handling, an exact area downscale, quantising to a palette within the art bible's colour caps and
  away from the palette-cycle ramps, the outline, a hand-edit layer that survives re-ingesting —
  with a byte-identical PNG on every machine and a `.art.json` provenance record per sprite (model,
  weights, licence, prompt, seed, source hashes, edit references back to committed files). Built and
  tested on synthetic fixtures; the real winners wait for the FLUX licence decision. The asset
  pipeline ignores the tool's files, and a real-art PNG's sidecar pivot now wins over a code
  anchor ([real-assets.md](docs/dev/real-assets.md#the-ingest-tool-art-promptsingest)).
- **The atlas is split by zone** (R1-05): one `common` page (ships, shots, bullets, items, effects,
  the font, the UI, and every sprite more than one zone draws) and one page per campaign zone, from
  `assets/source/atlas-groups.json` — derived from the content, never edited by hand
  ([asset-pipeline.md](docs/dev/asset-pipeline.md#atlas-groups-r1-05)). Pages that fit 256 colours
  are written as lossless PNG-8 (the atlas only), so today's art takes 120 KB instead of 137 KB, and
  a zone keeps about 2.2 MB of pages on the GPU instead of 4 MB. Between zones the shell unloads the
  other zones' pages and **uploads the next zone's at the transition** — at boot, at every stage
  change and when the attract demo or a replay shows another zone — so no page uploads in the middle
  of play; the pages are out of Pixi's own texture GC. The picture is byte-identical to the one-page
  atlas's.
- **The atlas manifest is a file next to its pages** (R1-05): `assets/atlas/main.json`, read with
  XHR at boot (status 0 on `file://`) and checked against the digest the build recorded — no longer
  inlined into `app.js`, which is 22 KB smaller for it (≈ 376 KB of 512 gzipped). A new boot error,
  **ATLAS MANIFEST FAILED TO LOAD**, and a bundle-check rule keep it that way. The inlined form lives
  on as `virtual:shmup-assets-inline` — the render bench, and the TVs' fallback should their
  `file://` XHR ever fail (never tried on a TV yet).
- **Memory budgets from the frame** (R1-05): out of the 100 MB, the audio's share is 24 MiB and the
  atlas's is what the heap, the audio and the render targets at 1080p leave — 26 MiB at 384×216,
  23 MiB at 640×360 — and the estimator charges the decoded images of every page, as the runtime
  keeps them ([platform-polish.md](docs/dev/platform-polish.md#memory-budget-shmupshell-memory)). The
  atlas load is timed — `data-shmup-atlas-load-ms`, `data-shmup-atlas-page-ms` and
  `data-shmup-atlas-pages` on the canvas, `__shmupDebug.atlas` in debug builds — for the owner to read
  on the M7.
- **The TV bench measures PNG decoding** (R1-05): a run ends with a decode scenario — a 2048² RGBA
  page, the same as PNG-8 and two shipped pages, fetched, decoded and uploaded eight times each, with
  `createImageBitmap` for comparison — shown in a `DECODE` table and turned by `analyze-bench.mjs`
  into the zone-load estimate plan step R3-04 starts from. The 18 render scenarios are unchanged.
- **The origin report** (R3-05 part 2, `node scripts/art-origins.mjs [--check]`): every sprite the
  atlas ships by origin — procedural, hand, AI-assisted with the model behind each source and edit
  reference — failing on an untraced override, a model or licence missing from the table, art made
  by a model on hold, an unreviewed AI record, or a "reference" with too little cleanup. Today all
  438 sprites are procedural ([art-provenance.md](docs/dev/art-provenance.md#9-part-2-the-origin-report)).

### Documentation

- **The v2 art bible** (R3-01, [`art-bible-v2.md`](docs/dev/art-bible-v2.md)): the style the owner
  picked in the art round's round 1, measured on the winners; the universal rules (native 640×360
  density, no runtime scaling, side views, the 1-px outline, light from the top-left, binary alpha
  and its listed exceptions, dither); the palette rules (the playfield value budget for backdrops
  on VA panels, enemy bullets first, the reserved palette-cycle ramps); the size and frame table of
  every category, with the frame counts the engine cannot show yet and the R4 step that changes
  each; who makes what; and the key-colour rules the ingest tool implements.
- **AI art licences** (R3-05, part 1, [`art-provenance.md`](docs/dev/art-provenance.md)): every
  model of the art round, its licence read for commercial use of its outputs, what an AI-assisted
  asset must record, and the owner's open decisions — FLUX.2-dev and FLUX.1-dev, which made 85 of
  the 91 winners, are on **hold** until Black Forest Labs answers or a commercial licence covers
  them. [`store-submission.md`](docs/client/store-submission.md#ai-content-disclosure-every-store)
  gains each store's AI-content disclosure, and `test/integration/art-prompt-names.test.ts` checks
  the prompt library for game, studio, character and artist names.
- **Handing real art to the pipeline, for v2** (R3-02): [`real-assets.md`](docs/dev/real-assets.md)
  rewritten for the 640×360 remaster and the ingest tool — the recipe, the record, the step-by-step
  of ingesting a winner — and corrected where it was wrong (a sidecar-less strip is one frame; the
  colour-blind variants are redrawn, not derived).
- **Decisions made while the plan runs** ([plan_resolution.md](plan_resolution.md) §1): the
  owner's O1–O10 (content units, the screen-anchored snap rule, camera `yTo` ported ×1.5, tile sizes
  8 and 12 …), O11 (ground enemies keep their terrain spot in the port — built as the default, the
  owner's confirmation pending), the orchestrator's wave-1 decisions and its wave-3 decisions
  W3-1 … W3-12 (the zone split shipped now, the eager residency, PNG-8 for atlas pages only, the
  budgets, the manifest fetched by XHR, R3-04's page target restated in bytes, the origin report's
  rules), its wave-4 decisions W4-1 … W4-14 and its wave-5 decision W5-6 for R2-01 (the flip's
  sequence, the interim art and font, the versioned saves and replays, the self-expiring gates), so
  later steps can cite them.

### Testing

- **The v1 baseline** (for R2-02): `test/golden/v1-baseline*.test.ts` records every shipped stage
  at 384×216 — event and camera ticks, every enemy's spawn, entry and first on-screen tick, the
  fastest bullet, the bosses' timings — in `test/fixtures/v1-baseline/` (37 scenarios), so the ×1.5
  port can be compared with v1; the files are re-checked byte for byte until R2-01 flips the frame.
- **The presentation fingerprint** (R1-01): `test/integration/presentation-fingerprint.test.ts`
  hashes everything core hands the renderer along scripted walks through every scene — 119
  segments over 12 walks, pinned on the v1.0.0 code — because the golden replays hash only the
  simulation and would let a moved menu or HUD pass.
- **No literal frame numbers in core** (R1-01): `packages/core/test/frame-literals.test.ts` parses
  core's sources and fails on `384`, `216`, `200`, `208`, `192` or `108` (and on the current frame's
  size once it changes) outside an allow-list of counts, angles and text-sized panels, each with its
  reason. `test/integration/tile-size.test.ts` (R1-04) holds shipped tilesets and stages to
  `TILE_SIZE`.
- **No literal frame numbers anywhere else either** (R1-02): `test/integration/frame-literals-repo.test.ts`
  scans the other packages, the apps' sources and scripts and the root scripts with the same scanner
  (now a shared test helper); `test/scripts/frame.test.ts` and Electron's `window-frame.test.ts` pin the
  two copies of the constants to core, and the first also pins the e2e specs' boss-bar position to what
  core's HUD really draws. A fingerprint of the shell's own scenes (`packages/shell/test/frame-fingerprint.test.ts`)
  joins core's.
- **Content units and the port** (R1-03): `test/integration/content-units.test.ts` fails on a number
  without a unit in any content kind; `test/integration/content-db-fingerprint.test.ts` hashes
  everything the loaders produce from the shipped content, pinned before the schemas changed — it stayed
  unedited, so no loaded value moved; `test/scripts/content/rescale*.test.ts` cover the tool on
  fixtures with known ×1.5 output, on the shipped content and from the command line.
- **The TV bench, headless** (R0-02): `pnpm bench` also opens the bench widget's 18 scenarios in
  Chromium and gates their counts (draw calls, render targets, atlas pages 1 / 1 / 2, the heap); every
  render-bench scenario now draws to a 1280×720 display, a whole multiple of 640×360.
- **Provenance in `pnpm test`** (R3-02): `test/scripts/assets/provenance.test.ts` fails on a
  real-art override without a valid record or a `LICENSES.md` entry; CI's new `ingest` job runs
  the tool's own tests and checks every committed recipe is up to date. Since R3-05 part 2
  `test/scripts/art-origins.test.ts` runs the origin report on the shipped tree and on the ingest
  fixtures, and ties `art-provenance.md`'s licence table to `art-prompts/ingest/models.json`.
- **The zone-split atlas** (R1-05): `test/integration/atlas-groups.test.ts` (the groups file equals
  its derivation; every zone needs exactly `common` plus its own page), `atlas-zone-sprites.test.ts`
  (eleven golden runs: every sprite drawn is in its zone's set), the shipped atlas held to a PNG
  budget instead of a page count (`cjk-budget.test.ts`), the memory estimate against a hand
  calculation at both frames (`memory-hand.test.ts`), and `test/e2e/atlas-residency.spec.ts` — the
  manifest's fetch and error screens, the Tizen `file://` boot, and the pages WebGL really holds as
  the zone changes.
- **R2-01's gates and tick-paced e2e** (R2-01): tests that cannot pass between the frame flip and the
  content port skip with the reason in their name — `CONTENT_PORT_PENDING` (until R2-02),
  `GOLDENS_STALE` (until R2-03), `R2_03_PENDING` and `PORT_UNMEASURED` in the browser tests
  (`test/e2e/gates.ts`, pinned by `test/integration/e2e-gates.test.ts`) — 360 skips and zero failures
  in the full run at `bc8e05d`; each gate throws at import once its window closes. The e2e specs wait
  on game ticks, not rAF frames (`test/e2e/ticks.ts`, its delays pinned to core by
  `test/integration/e2e-ticks.test.ts`): the flip slowed CI's software raster ≈ ×1.6, and frame-paced
  waits failed on slow runners. The 62 golden replays and the 9 attract demos stood as v1 recordings until
  R2-03.G1 re-blessed them (`d4ba9e8`, the ten files at 640×360) and deleted every gate named above; the v1
  baseline fixtures are frozen as v1's record.
- **Per-zone content tests and contracts, stable hash keys** (R5-P.P2a / P2b / P6 / P1, landed in R2-03's
  wave): each zone's content checks moved from `test/integration/content.test.ts` into
  `test/integration/content-zone-<letter>.test.ts` and its bounds into `test/integration/zones/`
  `zone-<letter>.contract.ts` — the v2 branch is decision R5-D2's contract, armed by one `remastered`
  token when the zone's R5 port lands; `hashWorld` mixes stable FNV-1a content keys, so re-blessing is
  local to the zone whose files changed; and `test/scripts/assets/procedural-zone-<letter>.test.ts` gives
  each zone's generator tests their own files (the four alpha-200 literals hoisted to `SOFT_ALPHA` left the
  repo frame-literal allow-list at 30 entries).

## [1.0.0] — 2026-10-16

The changes after the v1.0 release candidate — milestone M3 (plan steps M3-01 … M3-03), which is
now **complete**, and with it the whole plan: **45 of 45 steps**. What remains needs an account, a
device or a human nobody here has: plan §8.7 (an LG webOS set), §8.8 (Steam and a Steam Deck) and
§8.9 (the Seller Office, itch.io, a native-speaker pass over the translations, and the
tracker-music CPU benchmark), on top of the §8.4 … §8.6 checks on the Samsung monitors — where the
game has still never been installed. All of it is collected, grouped by what each item blocks, in
[`docs/client/outstanding-work.md`](docs/client/outstanding-work.md).

### Game

- **The game speaks three languages** (M3-03): **ENGLISH**, **ESPAÑOL** and **ニホンゴ**, chosen
  under OPTIONS → DISPLAY → **LANGUAGE** and shown from the next launch. The Japanese text is
  **katakana only**, the way 1980s arcade hardware wrote Japanese, and the bitmap font grew from 102
  to 195 glyphs to draw it (plus the accented capitals Spanish needs). A few things stay the same in
  every language on purpose: the game's name, `HI`, `1P` / `2P` and the two-character HUD and power
  meter codes, which the HUD draws in a few pixels it cannot grow.
  **The Spanish and Japanese texts are placeholders** — written by the build agent, not proof-read
  by anyone who speaks the language, exactly like the placeholder art and music. Correcting them is
  an edit of two files in `content/strings/`.
- **The game runs on LG webOS TVs too** (M3-03): a fourth host, `apps/webos`, with the same game,
  its own `appinfo.json` and the webOS Back key (461 instead of Samsung's 10009). **It has never run
  on a real LG set** — the project has no LG hardware, developer account or SDK — so treat the first
  run as untested; the recipe and the checklist are in [`docs/client/webos.md`](docs/client/webos.md).
- **The desktop app can talk to Steam, if a Steam build asks it to** (M3-03): eleven achievements
  derived from the save document and Steam Cloud around the file store. **Nothing has touched
  Steam** — there is no partner account and no app id, and the Steamworks binding is deliberately
  not a dependency, so every build this repo produces behaves exactly as before
  ([`docs/client/steam.md`](docs/client/steam.md)). The browser build can be packed for **itch.io**
  with `pnpm itch:package`, which has never been run against a real build
  ([`docs/client/web-release.md`](docs/client/web-release.md)).

- **EXTRA menu** on the title (M3-01), between SOUND TEST and EXIT: **BOSS RUSH** (the nine zone
  bosses A–I in a row — a new `boss-rush` stage), **CARAVAN** (one zone from its start against a
  three-minute clock: TIME UP when it runs out, 1,000 points a whole second left when the boss falls
  in time) and **ARCADE** (the run across the zone map looping on after its ending — each loop with
  remixed enemy waves in every zone, bullets 15 % faster a loop (at most 60 %), a revenge bullet
  from every enemy shot down and a higher rank). Each mode keeps its own hi-score tables.
- **Replays** of whole games: every finished game is recorded; EXTRA → **REPLAYS** keeps the last
  game and three kept ones, plays them back at ×1 / ×2 / ×4 with pause, and deletes them; in a
  browser SHARE copies a replay as text and pasting one on the page loads it.
- **Unlocks**: reaching an ending unlocks the **Extra Edit** (the weapon select's EXTRA: CONTROL
  MISSILE, UPPER MISSILE, SMALL SPREAD, HAWK WIND, 2-WAY BACK, BACK DOUBLE and the SPREAD GUN,
  equipped twice) and the ARCADE mode's **LOOP 2** start.
- **Secret codes** (original sequences of eight arrow presses): seven ships and Extra Edit on the
  title, full power and a self-destruct joke in the pause menu.
- **Assists** on the GAME page — **SPEED** (100 / 75 / 50 %) and **INVINCIBLE** — plus **OPT
  RECOVERY** (lost Options drift away to be caught again); the CONTROLS page's **RUMBLE** rumbles
  a gamepad on deaths and boss blasts. Scores and replays made with an assist or a code are marked
  `*`.
- **Score-milking cap**: enemies spawned by a boss or a spawner score in full for the first 40 of a
  kind in a zone, then 10 %.
- **Picture settings** on the Options screen's DISPLAY page (M3-02): **CRT** (OFF / LIGHT / FULL —
  scanlines, an aperture-grille mask and a vignette over the upscaled picture; since M3-02d it is
  the upscale's own shader, so any setting costs one draw call) and **ASPECT** (NORMAL / ULTRA-WIDE / CLASSIC 4:3 —
  the picture is placed in a 64:27 or 4:3 window with dimmed side panels beside it instead of black
  bars; it is never cropped and the playfield stays 384×216). Both apply at once and are saved.
- **EXTRAS** options page (M3-02) with four toggles that apply from the next game: **SLOWDOWN**
  (the deterministic 16-bit slow-down once the screen carries more than 96 objects), **GRAZE**
  (points for an enemy bullet that passes just clear of the ship), **DEATH BOMB** (a few frames to
  bomb out of a fatal hit, with a moment of invulnerability) and **BLACK HOLE**.
- **The black-hole bomb** (M3-02), the game's signature special for the **MANTA**: yellow items
  stock up to three bombs, `Special` throws a vortex that drags enemy bullets in and swallows the
  ones that reach its core (points each, like a cancel), pulls enemies towards it and then
  discharges lightning that destroys them and hurts boss parts. Two can be open at once, one per
  player.
- **An escape sequence** after the final zone's boss (M3-02): a collapsing corridor that scrolls
  faster and faster, then **ESCAPE COMPLETE** and the ending. It is part of that zone — routes, the
  zone count and high-score rows are unchanged.
- **The game is tuned to the measured hardware** (M3-02b — the input probe ran on both Smart
  Monitor M7s on 2026-09-15, [`docs/dev/input-probe-results.md`](docs/dev/input-probe-results.md)):
  - **The remote sends one key at a time.** While an arrow is held, OK, a second arrow and Ch ± are
    never delivered, so OK never stops a direction — but a power-up has to be taken with the
    direction released. There are no diagonals on the remote, and the whole game is designed for
    single arrow presses.
  - The TV's control profile is now simply **REMOTE**: it waits **0** frames before believing a
    release (the remote sends no false releases), so the ship stops the instant you let go.
    **FAST 8-WAY** is gone — it differed only in that wait — and a save that chose it uses REMOTE.
  - **Home pauses the game.** The TV's Home bar is an overlay, so the game now pauses itself and
    goes silent while it is up; coming back leaves the PAUSE menu where you left it, with nothing
    fast-forwarded.
  - **The INPUT TEST closes with three Pause presses** (`PAUSE X3 OR HOLD TO EXIT`) — the remote
    reports Back and Play/Pause only when you let go, so nothing asks for a held button any more.
  - **Steadier scrolling on a 60 Hz screen**: the game runs exactly one simulation step per frame
    instead of letting the monitors' uneven frame delivery turn into two steps on one frame and
    none on the next.
- **Three P2 bosses** (M3-02) on the new pull fields: **GRASPING BLOOM** (breathes in, dragging the
  ships towards its maw), **IRON TALON** (lunges and grabs) and **SHADOW STRIDER** (an armoured
  walker that can only be dodged) — on the browser's new showcase stage **HIGH-SPEED DIMENSION**
  (`?stage=dimension`), which flies over a pseudo-3D Mode-7 neon floor.

### For developers

- **Localization (M3-03).** `core/ui/strings.ts` gained `UI_GLYPHS` (the font's whole charset,
  declared once and kept equal to `assets/source/fonts/pixel6x8.font.json` by a test),
  `isUiTextDrawable`, `UI_LANGUAGES` / `uiLanguageLabel` / `uiLanguageIds` / `pickUiStrings` and
  `FIXED_UI_TEXT_IDS`; `UserOptions.display.language` + `UserOptionKind.Language` carry the choice
  (presentation only — no replay records it, no golden moved). The menu lists whatever
  `content/strings/` holds, so adding a table adds a row with no code change, and
  `pnpm content:check` requires a shipped language to answer **every** id. The 93 new glyphs cost
  1.6 KB of atlas and the two tables 8.6 KB of Tizen `app.js` gzip (386.9 → 395.5 KB of 512 KB);
  no budget was raised. What a real kanji set would actually cost — ~6,900 JIS X 0208 glyphs ≈ 1.0
  M pixels, about twice what the whole atlas occupies, so *one* extra page that fits `DIST_BUDGET`
  but doubles the atlas download and boot decode for everyone — and what to do if one arrives, is
  in [`docs/dev/asset-pipeline.md`](docs/dev/asset-pipeline.md).
- **`apps/webos` (M3-03)** — the LG webOS host: the `Platform` adapter (Back 461, the two-reason
  lifecycle, `webOS.platformBack()`), the shared `bootShell`, `public/appinfo.json` with its
  validator, a bundle check that imports the Tizen budgets so there is one source of truth, and the
  `ares-*` wrappers (**written, never executed**). An `input-profiles` entry gained a `hosts` list
  so each TV's remote profile stays out of the other's CONTROLS menu — without it a Tizen player
  could pick the webOS profile and lose Back entirely.
- **Steamworks (M3-03)** — `apps/electron/src/main/steam.ts` is implemented: `initSteam`, eleven
  achievements **derived from the save document** (so no game code knows about Steam), Steam Cloud
  wrapped around the existing file store (disk first, cloud second, restore on a fresh machine).
  `steamworks-ffi-node` is **not** a dependency: `initSteam` takes a `load` callback a Steam build
  supplies, and every test drives a fake. Nothing here has run against a real Steam client.
- **The tracker-music path (M3-03)** — new `audio-web/tracker`: capability detection, the
  `TrackerBackend` port, and `chooseMusicPath` (`tracker` → `file` → `song` → `none`). A track may
  carry an optional `module` **alongside** its song or file, never instead of it, so turning the
  path on can never silence a device. No backend ships: libopenmpt's worklet is ≈ 518 KB gzipped
  against a 512 KB bundle budget, which `trackerFitsBundle()` states in code.
- **`pnpm itch:package` (M3-03)** archives the browser build for itch.io with a zero-dependency ZIP
  writer (`index.html` at the root, no source maps, byte-identical for the same build). Never run
  against a real build here.
- **M3-03's cross-file invariants are tests now, not review notes.** The things only a careful
  reader was keeping true: `core/config` `LANGUAGE_ID_PATTERN` and the `strings` schema's own
  pattern are driven through the same id list and must answer alike (a shipped language the save
  would throw away is now a red test); `FIXED_UI_TEXT_IDS` is proved to be enforced at **both**
  gates (`core/data` at load, `resolveUiText` at resolve); the kanji arithmetic is **recomputed
  from `assets/generated/atlas/main.json` and the committed PNG** and cross-checked against the six
  documents that quote it, with round 1's retracted claims asserted absent; and a source scan keeps
  shipped code inside **Chromium 68** (webOS 5) — the lint's floor is 69, so `[].flat()` passes
  ESLint and would throw on an LG set. The profile lock-out has regression tests on both TV hosts
  (a save naming the *other* TV's remote is ignored) and `test/e2e/webos.spec.ts` runs the real
  webOS bundle from `file://` — the only place it is ever executed. `pnpm test:e2e` therefore
  builds `@shmup/webos` as well.
- **Fixed (M3-03)**: `initSteam`'s `syncAchievements` called `this.unlockAchievement`, so the
  service threw if any of its methods was ever pulled off it (`const { syncAchievements } = steam`).
  It calls the closure directly now. Found by the test that destructures the service.
- **New docs**: [`docs/dev/real-assets.md`](docs/dev/real-assets.md) (Aseprite / Furnace hand-off),
  [`docs/client/webos.md`](docs/client/webos.md), [`docs/client/steam.md`](docs/client/steam.md),
  [`docs/client/web-release.md`](docs/client/web-release.md) and
  [`docs/client/store-submission.md`](docs/client/store-submission.md) — each says in its first
  paragraph that nothing in it has been run — and, as the plan closes,
  [`docs/client/outstanding-work.md`](docs/client/outstanding-work.md): every manual action from
  plan §8.2 and §8.4 … §8.9 in one list, grouped by what each blocks, with what "placeholder" means
  for the art, the audio and the translations.
- **The TV engine floor is documented as what it is: Chromium 68.** webOS 5 is one release older
  than Tizen 5.5's 69 (LG's published web-engine table, re-checked 2026-09-16), while the lint's
  browserslist floor is `chrome >= 69` — so `Array.prototype.flat` / `flatMap` pass ESLint and would
  throw on an LG set. [`docs/dev/conventions.md`](docs/dev/conventions.md#two-tvs-two-engines) now
  separates the three things involved (syntax lowered by the `es2018` target, runtime APIs nobody
  polyfills, and the `globalThis` polyfill both TVs prepend) and states what
  `test/integration/tv-engine-floor.test.ts` does **not** cover: only the API names in its list,
  only first-party source, only JavaScript, and nothing at runtime.
- `GameConfig` gained `loop`, `timeLimit`, `invincible` and `optionRecovery`; `startingLives` goes
  up to 9. Stages may carry a `remix` and `minLoop` / `maxLoop` on any event; weapons an `extra`
  flag; the `rules` file's `scoring` section `repeatKills` / `repeatPercent`.
- Whole-run replays (`core/replay` `run.ts`: segments, start states, flow actions, the replay
  library sized to the storage adapter) recorded by the scene flow; the replay header gained
  `assists`.
- The save stays format 2: `options.play`, `unlocks` and assisted rows resolve when missing;
  `MAX_HI_SCORE_TABLES` 64.
- Golden replays re-blessed: every file for its header (the new config fields and `assists`),
  `captain-range-god` also for the milking cap (25,120 → 20,980); six new goldens of the extra modes
  and assists.
- M3-02: `GameConfig` gained `slowdown`, `graze`, `deathBomb` and `blackHole` (so every replay
  header records them), `UserOptions.display` `crtFilter` / `aspect` and `UserOptions.play` the four
  extras' switches. New core module **`blackhole`** (the bomb stock, the vortices, the lightning and
  the death-bomb window's bombs); `core/bullets` gained `grazePlayers` and `vortex`, `core/enemies`
  `pullTowards` and `blast`, `core/bosses` `BossScriptApi.pull` / `release` with
  `BossSystem.applyFields`, `core/powerups` `equipMeterSlot`. A stage may carry an optional `mode7`
  section and a **final** campaign zone an `escape` stage; the `rules` file's `scoring.graze` pays a
  graze. `@shmup/render-pixi` gained the Mode-7 filter and floor, the CRT pass and
  `computeAspectViewport` (plus `setAspect` / `setCrtFilter` on the renderer and the optional
  `DisplayTarget` methods behind them).
- `hashWorld` mixes the new state only in a World that uses it (`mixExtras`, and a boss's pull field
  only while one is open), so recordings made before M3-02 keep their hashes; all goldens and
  attract demos were re-blessed once for the four new header fields, with no expected status, score
  or tick count moved, and `zone-a-extras` joined them (zone A with every extra on).
- M3-02b: `core/config` gained `RETIRED_INPUT_PROFILE_IDS` / `migrateInputProfileId` (applied by
  `resolveUserOptions` to `options.input.profileId`; a binding override keyed by a retired id is
  left inert). `@shmup/input-web` `remote` gained `InputTuning.singleKey` — while any tracked key is
  physically down the keyboard source drops other keydowns — and the measured
  `REMOTE_REPEAT_DELAY_TICKS` (21) / `REMOTE_REPEAT_INTERVAL_TICKS` (6.5); the profile validator
  rejects `singleKey` on gamepad profiles. `content/input/remote.input-profiles.json` ships five
  profiles (`tizen-remote-diagonal` retired) and registers `Guide` / `Extra`.
- M3-02b: `core/loop` gained the **vsync lock** (`setVsyncLock` / `vsyncLock` / `VSYNC_DROP_STEPS`,
  module `partial` → `implemented`) and `core/game` `setVsyncLock` / `vsyncLock`, suspended while a
  debug timing mode runs; `@shmup/shell` gained `ShellOptions.framePacing` (`'auto' | 'lock' |
  'free'`) and `VSYNC_LOCK_MIN_HZ` / `VSYNC_LOCK_MAX_HZ` (55 / 65). Presentation only — no replay,
  golden or demo hash moved because of it.
- M3-02b: `apps/web` `createVisibilityLifecycle(source, focus)` and the Tizen platform's lifecycle
  take an optional focus source and are **edge-triggered** over hidden ∨ unfocused; the old
  "a repeated event fires the callbacks again" contract is gone. Electron keeps the web policy.
- M3-02b: the debug overlay gained a sixth line — `DebugOverlayStats.tickFrames` /
  `rafHistogram` / `vsyncLock`, `RAF_BUCKET_EDGES_MS`, `RAF_BUCKETS`, `rafDeltaBucket`,
  `buildRafHistogram` and the `LOCK` alert; `DebugTools.endTicks(ticks)` takes `game.frame`'s
  return value. The shell's debug tools track held keys themselves (the remote's auto-repeats carry
  `repeat === false`), and a repo-wide ESLint rule forbids `.timeStamp` in runtime sources.
- M3-02b: `test/playtest/remote-strict.ts` (`createRemoteStrictModel` / `createRemoteStrictCheck`)
  models the remote, and `fourWayBot()` flies under it by default; `PlaytestResult` reports
  `remoteViolations`. Every zone, route, the boss rush and the caravan clear under it with **no
  zone content re-tuned**; three bot changes (a clear-lane equip window, a stronger boss-core
  preference, god-mode core-row aiming) re-blessed the goldens and attract demos, and
  `gimmick-range-god` now expects `destroyed === 0`.
- M3-02b: `tools/input-probe` `chooseEventTime` always returns handler time (Tizen 5.5 advances
  `event.timeStamp` in whole seconds), `FrameSummary` carries a raw `histogram`
  (`FRAME_BUCKET_EDGES_MS` / `frameBucket`) and the verdicts gained `NO — not delivered`.
- M3-02c: a **render benchmark** — `test/bench/render.perf.ts` with `test/bench/render-harness/`
  (`main.ts` the page, and the DOM-free `load.ts` / `gates.ts` / `protocol.ts`). It builds the
  harness with Vite and drives it in Playwright's Chromium: the real renderer over the real
  simulation and the real atlas under worst-case frames (every measured frame carrying 512 of 512
  enemy bullets, ≥ 489 of 512 point items and ≥ 489 of 512 particles, asserted as a per-frame
  floor), CRT off / light / full, a filtered layer, the Mode-7 floor, and the **internal frame size
  as a parameter** (384×216 and 768×432). It reports render-ms p95, draw calls, pooled
  render-target bytes, structure rebuilds and a JS-heap delta over 600 frames, and fails on the
  draw-call, p95 and heap budgets; a deliberately leaky fixture proves the heap gate. It renders
  through SwiftShader — the counted quantities and the scenario-to-scenario comparisons transfer to
  the TV, the milliseconds do not. `test/integration/render-bench.test.ts` drives the three
  DOM-free modules in Node as part of `pnpm test`, and `test/e2e/render-profile.spec.ts` checks the
  same three figures in a real WebGL context. CI's `build · benchmark` job installs Chromium first.
- M3-02c: `@shmup/render-pixi` gained `PixiRendererOptions.countStructureRebuilds` /
  `PixiRenderer.structureRebuilds` (−1 when not counting) and `debug`'s `createRenderTargetMeter` /
  `RenderTargetMeter` (one hook on Pixi's global `TexturePool.createTexture`, so the total is a
  property read); `DebugOverlayStats` gained `structureRebuilds` and `renderTargetBytes`. The debug
  overlay's panel grew a **seventh line** — `REB` and `RT` — and the M2-17 device line moved down
  with it (`PANEL_LINES` 6 → 7). The shell's debug tools own one meter and stop it on `destroy()`.
- M3-02c: `@shmup/shell` `boot` gained `webGLVersionFromSearch(search)` and `apps/tizen`
  `WEBGL_VERSION_KEY` (`localStorage['shmup-cup:gl']`, dev / test builds only) — the review's **F8**
  A/B switch after the probe verified WebGL 1 *and* 2 on Tizen 5.5. **WebGL1 stays the shipped
  default** and the renderer's stale "WebGL2 is unverified" docblock is gone.
- M3-02d: the **full-screen effects are folded into their draw passes** (the render review's
  **F2** / **F6**). The second pass draws the frame with a `Mesh` whose shader *is* the CRT program
  (`@shmup/render-pixi` `effects` `createCrtBlit`, `CrtPass.view`, the new `EFFECT_MESH_VERTEX`
  shared vertex shader), and the Mode-7 floor is a `Mesh` on `BG_MID` (`createMode7Shader`,
  replacing `createMode7Filter`; `Mode7Floor.view` / `.shader` replace `.sprite` / `.filter`). The
  bench measured it: CRT `light` / `full` went **5 draw calls and 2,048 KB of pooled render targets
  → 4 and 0**, the same as CRT `off` (16.8 MB of VRAM and a second full-screen pass over 2 Mpx
  freed at 1080p), and the Mode-7 stage **7 and 512 KB → 6 and 0**. `PixiRendererOptions.screenPass:
  'filter'` restores the old sprite + Pixi-filter pass as an escape hatch, which is what
  `createCrtFilter` / `crtResolution` / `CRT_MAX_HEIGHT` now serve.
- M3-02d: `PixiRenderer.warmUp()` (**F4** / **F5**) draws one throwaway off-screen frame with every
  GL program and every pooled sprite in it; `bootShell` calls it after `bindWorld`, behind the
  loading screen, so no shader links and no batch buffer grows mid-gameplay. `LayerEffects` gained
  `attachAll(on)` for it.
- M3-02d: `createRenderTargetMeter` counts the targets Pixi's pool already holds when it starts —
  the boot warm-up frame draws every filter, and the pool never releases, so the overlay's `RT`
  figure would otherwise read 0 on a stage whose effect is running.
- M3-02d: `@shmup/shell` `memory` counts render targets the way Pixi really pools them (**F3**):
  new `potBytes(w, h)` (next power of two on each axis) and exported `FILTER_TARGETS`;
  `estimateMemory` gained `frame`, `filterTargets`, `crtFilter` and `crtAsFilter` inputs, and
  `estimateStageMemory` passes them through.
- M3-02d: the estimator's per-zone figures moved with the correction — zones A–G ≈ 67.0 MiB, H ≈
  74.0, I ≈ 74.7, of which 25.05 MiB is render targets (was 24.7 MiB modelled flat). The legacy
  `crtAsFilter` term is deliberately conservative — it ignores `crtResolution`'s cap and charges
  the whole display for a pillarboxed picture — and the shipped blit path is charged nothing at any
  setting; both are pinned by tests so nobody "fixes" them.
- M3-02d: **a new hardware dependency.** Pixi's `MeshGeometry` forces `Uint32Array` indices, so
  both new meshes — and therefore every frame's second pass — rely on WebGL1's
  `OES_element_index_uint`. Pixi requests it with the context and it is effectively universal (the
  M7's Mali-G51 has it), but on a context without it the symptom is a black picture rather than a
  picture without effects. Asserted in Node and in a real WebGL1 context by the tests.
- Fixed (found by M3-02d's tests): `PixiRenderer.destroy()` never destroyed the Mode-7 floor —
  `bindWorld(null)` only hides its mesh, so its `Mesh` / `MeshGeometry` / `Shader` / `GlProgram`
  outlived the renderer — and never destroyed the second pass's container or its two side-panel
  sprites. Both are freed now, with a regression test.
- M3-02f: **the render profile records itself.** A dev / test build given `VITE_REPORT_URL` streams
  its own render telemetry to the input probe's log server (`tools/input-probe`, `npm run
  log-server`, which now takes both senders — `ip-…` sessions from the probe, `rp-…` from the game):
  a new `@shmup/shell` `telemetry` module samples every frame into preallocated typed arrays, closes
  a window every 3 s into **min / median / p95 / max** of the frame, tick and render times and of
  the draw calls — plus a **quantized histogram of each of those series**, so the analyzer sums a
  table row's windows and prints the p95 of *that row's frames* instead of a median of the windows'
  p95s, which understates the tail and would not even be the same statistic as the `pnpm bench` p95s
  the same document quotes (the same statistic, not a comparable magnitude — the bench runs under
  SwiftShader) — and the `TPF` and rAF bucket counts, the window's structure rebuilds and the
  pooled render-target total, and POSTs it with the context that makes the row mean something (the
  M2-17 device line among it, re-read every window because it only resolves after boot).
  An on-screen checklist walks the render review's §4 measurement table (M1–M8) and ticks itself, so
  the owner plays where the game says instead of keeping notes, and
  `tools/input-probe/results/analyze-render.mjs` turns a session into the tables of
  `docs/dev/input-probe-results.md` §11. It is built not to perturb what it measures: the frame path
  allocates nothing (a `Float64Array` inbox instead of fractional call arguments — V8 boxes those),
  requests go out on a timer rather than a frame boundary, and every window counts the frames a POST
  was still in flight so a sender-induced spike is excluded rather than believed. Configured by the
  new `__SHMUP_REPORT_URL__` define, `''` in every release build — the whole sender is proven absent
  from `dist/app.js` and from the web build's scripts.
- Fixed (found by the M3-02f test suite): the log server's console summaries could still be thrown
  out of by a payload that redefines `toString` — `{"toString": 1}` is valid JSON, and interpolating
  it raises `TypeError: Cannot convert object to primitive value` — or by a `verdicts` / `env` that
  is not an object. The request handler's catch kept the receiver alive, but the capture lost the
  summary line the owner watches while playing. Every nested value a formatter prints now goes
  through a total `str()`, and a seeded fuzz suite POSTs generated junk at both formatters and at a
  live server to keep it that way.
- M3-02e: **one render group per high-churn layer** (the render review's **F1**). In Pixi v8
  `sprite.visible = …` dirties the sprite's enclosing render group, and a dirty group has its whole
  instruction set thrown away and rebuilt — a walk over every node under it, a re-pack of every quad
  and a re-upload of its vertex buffer. The scene was one group and the draw path toggles `visible`
  in every binding every frame, so one hidden bullet cost all of that over ~6,400 display objects,
  on 655–659 of every 660 frames the bench measured. Every layer whose bindings toggle `visible`
  while the game runs is now its own render group (`@shmup/render-pixi` `layers`'
  `RENDER_GROUP_LAYERS`: `TERRAIN`, `GROUND_ENEMIES`, `AIR_ENEMIES`, `PLAYER_SHOTS`, `PLAYER`,
  `HITBOX`, `ITEMS`, `FX`, `ENEMY_BULLETS`, `HUD`, `UI`), so a bullet appearing rebuilds the
  512-sprite bullet group and leaves the 1,274-tile terrain grid, the HUD and the UI alone, buffers
  included. `BG_FAR` and `BG_MID` stay plain (the parallax bands are shown once when bound and only
  their containers move; the Mode-7 mesh follows a camera range) and so does `DEBUG` (empty in a
  release build). Measured by the bench, which builds both scenes in one run
  (`PixiRendererOptions.renderGroups: false` restores the old one — the review's measurement
  **M1**, done headlessly): **659 of 660 frames rebuilding the whole scene → 0 of 660**, on every
  shipped scenario. Scope items 2 (degenerate-quad parking) and 3 (`ParticleContainer`) were
  deliberately **not** done — the first was enough, and parking dead slots in the batch would have
  grown the per-frame attribute upload from the visible quads to all ~6,400.
- M3-02e: **the trade, stated plainly.** Each render group is a batch boundary, so the bench's busy
  frame went **4 → 9** draw calls, the `raster-range` frame 7 → 10 and the Mode-7 frame 6 → 9, and
  the two e2e specs' `DRAW_CALL_BUDGET` was raised **12 → 16** deliberately (`shmup_feat.md` §22
  allows 20–50; the arithmetic is in each spec's docblock and the measured figures in §22's budget
  line). The p95 the bench reports for the change — 0.65–0.94× over five runs, a spread that is
  itself the caveat — is **SwiftShader's**
  and is the least transferable number of the step: software WebGL charges CPU time for the extra
  draw calls while making the 6,400-node tree walk cheap on a desktop core, and the M7's Cortex-A55
  and Mali-G51 pay the opposite way round. The result to believe is the counted 659 → 0; the
  hardware verdict is the owner's M1 measurement on the monitors.
- M3-02e: `PixiRenderer.groupRebuilds` — the same `structureDidChange` flag counted over **every**
  render group of the scene rather than the scene's own (−1 without `countStructureRebuilds`, like
  `structureRebuilds`), so a fall in the first figure cannot be read as churn that merely moved out
  of sight: it read 659 of 660 before the step and about 1,590 after (≈ 2.4 small layer groups a
  frame). It is deliberately **not** on the debug overlay and not in M3-02f's telemetry — `REB` stays
  the one figure to read on the TV, and what it now says is 0. The bench gained the gate
  `renderGroupViolations` and `test/e2e/render-groups.spec.ts` proves the picture is **byte-identical**
  with the groups on and off, on seven scenes.
- M3-02e: **how to read `REB` on the TV.** The `DEBUG` layer is deliberately not a render group, so
  the overlay panel's own text quads dirty the scene's group whenever a printed number changes width
  — at 6 % of frames on an idle machine and 49 % on a loaded one, a property of the machine and not
  of the renderer. The debug tools read `renderer.structureRebuilds` and commit the frame to the
  telemetry **whether or not the panel is visible**, and M3-02f's checklist is a DOM `<div>`, so the
  owner hides the panel (debug key **1**) and still captures the true rate. Documented in
  `docs/client/debug-tools.md` and `docs/dev/rendering-and-shell.md`.
- M3-02e: the review's **F9** fell out of the same work — the five full-screen overlays of pass 1
  (the backdrop, both flashes, the playfield dim and the UI dim) draw the atlas' own `ui/pixel`
  instead of Pixi's global `Texture.WHITE`, so pass 1 samples a single texture. The side panels keep
  `Texture.WHITE`: they are in pass 2, where the atlas page would be a binding added rather than one
  saved. No draw call changed, as the finding predicted.
- The Tizen bundle is 386.9 KB gzip of its 512 KB budget (384.1 KB after M3-02c; M3-02d's +2.7 KB
  is Pixi's mesh pipeline, no longer tree-shaken out; M3-02f adds nothing — it is dev-build only;
  M3-02e adds 0.1 KB — one array and one option, no new Pixi code path).

## [1.0.0-rc.1] — M2: complete v1.0 (release candidate)

The second milestone (plan steps M2-01 … M2-18): the complete game — nine zones on a diamond map,
16 routes, two ships, co-op, the front end and the options — hardened and cut as the first release
candidate. Every package manifest says `1.0.0-rc.1`; the Tizen widget, which only takes numbers,
says `1.0.0`.

### Game

- **Difficulty presets** Easy / Normal / Hard / Arcade, chosen in a **DIFFICULTY** menu under START
  (M2-01): ships 5 / 3 / 3 / 2, continues 5 / 3 / 2 / 0, death penalty Casual / Classic / Classic /
  Arcade, 16 or 32 aim directions, Easy's bullets × 0.85 — a table in
  `content/rules/difficulty.rules.json`. Each difficulty keeps its own hi-score table.
- **Rank grows** with the stage, the loop and the ship's power (Missile, Double / Laser, Options,
  shield), 0–31 and at most 16 on loop 1; enemies fire more often and faster as it rises.
  Per-enemy rank modifiers and **revenge bullets** (zone A's fan fliers from rank 12).
- **Extra ships** at 20,000 points, then every 70,000 (at most nine), with a 1UP jingle that is
  never cut off.
- **Continues**: a 10-second CONTINUE? countdown after the last ship; OK restarts at the last
  checkpoint with fresh ships and no power, and the score's last digit counts the continues.
- Behaviour change for tools and tests: `{ difficulty: 'arcade' }` now means the whole preset
  (2 lives, 0 continues, the arcade penalty); the golden replays were re-blessed.
- **Colour-blind bullet colours** (M2-02): OPTIONS → **BULLETS** — STANDARD, DEUTERANOPIA,
  PROTANOPIA or TRITANOPIA, applied at once and remembered; in the colour-blind sets the bullet
  centres are shape-coded (solid, ring, dot) so the three bullet families differ without colour.
- **Points for cancelled bullets** (M2-02): when a boss is destroyed or a Mega Crash goes off,
  every enemy bullet also leaves a gold diamond that flies up into the score — 10 points each
  (`content/rules/scoring.rules.json`). The player's own loss still only clears them.
- **Bullet patterns as data** (M2-02, for content authors): `content/patterns/` — BulletML-inspired
  actions and bullets (`fire`, `wait`, `repeat`, `changeSpeed`, `changeDirection`, `accel`,
  `vanish`, `actionRef`, `bulletRef`) with expressions over `$rank`, `$rand`, `$loop`, `$i`,
  compiled at load and run by a zero-allocation interpreter; enemies run them with the
  `pattern.loop` behaviour. **Bending lasers** (homing, circle-chain hitbox) exist in the engine.
  Neither is used by zone A yet, so it plays as before (apart from the cancel points).
- The golden replays were re-blessed again for M2-02 (new bullet state, cancel points).
- **Weapon types B–D and Weapon Edit** (M2-03): nine new weapons with original names — Spread Bomb
  (bursts into a blast that hits twice), 2-Way Missile, Photon Torpedo (flies on through what it
  destroys), Tail Gun, Vertical, Free Way (its second shot follows the last direction you moved),
  Ripple Laser (growing rings that hit with their edge), Cyclone Laser, Twin Laser — as presets
  **Type B**, **C** and **D** next to the classic Type A, or mixed freely with **EDIT**. The power
  meter's boxes are named after the chosen weapons.
- **`!` and `?` choices** (M2-03): the `!` box can be the Mega Crash, NORMAL (back to the basic
  gun), SPEED DOWN, LIFE OPTION (spare ships become Options) or FULL BARRIER (a fresh Force Field);
  `?` gives the Force Field (more shields came with M2-04).
- **WEAPON SELECT** screen after the DIFFICULTY menu (M2-03) — one more OK to start a game (START is
  highlighted): the type, the three slot weapons under EDIT, `?`, `!`, Auto Power-Up and its
  **order** (an AUTO ORDER box), with a **live preview** of the choice flying over a practice range
  behind the panel. The choice lasts for the session.
- Behaviour change for tools and tests (M2-03): `GameConfig` has `weaponPreset`, `weaponEdit`,
  `megaChoice` and `shieldChoice` (replay headers record them; older headers decode to the
  defaults); the golden replays were re-blessed (the new content shifts sprite ids, the Free Way
  direction is hashed — same outcomes) and four boss runs with the new weapons were added.
- **Option types** (M2-04): a new **OPTION** line on the WEAPON SELECT screen — TRAIL (as before),
  **SNAKE** (a chain that swings out behind the ship and keeps its shape when it stops),
  **FORMATION** (a `>` behind the ship that spreads into a `V`) and **ROTATE** (orbiting the
  ship). FORMATION and ROTATE spread out with **Ch ▲** on the remote (V / gamepad Y) or while
  PowerUp (OK) is held for a quarter of a second; a quick OK never moves them.
- **More shields** on `?` (M2-04): **SHIELD** (two pods at the nose), **FREE SHIELD** (a pair of
  pods where you last moved — `?` again adds a second pair), **ROTATE** (two circling pods) — each
  pod stops the bullets and enemies that touch it, 14 hits, wearing on its own — and **REDUCE**
  (the ship's hit spot shrinks to a third, two hits; the rock still counts). FULL BARRIER restores
  whichever shield you chose.
- **Option Hunter** (M2-04): an armoured enemy that arrives with an alarm only while you have
  Options, lines up and charges through them, and carries off the ones it touches; a Mega Crash —
  or the new rare **blue capsule**, which destroys every enemy on screen — frees them to be caught
  again. They appear in the browser's `?stage=hunter-range` for now; AZURE VERGE is unchanged.
- Behaviour change for tools and tests (M2-04): `GameConfig.optionChoice`, the grown
  `shieldChoice` and `WeaponSelectItem` codes (`Option` 4, so `?` … START are 5–9); the golden
  replays were re-blessed (new hashed state, shifted enemy spec indices — same outcomes) and four
  runs covering every Option type and shield were added.
- **The second ship, the MANTA, and Direct mode** (M2-05): a **SHIP SELECT** box after the
  DIFFICULTY menu — the KESTREL (power meter, then the WEAPON SELECT screen) or the MANTA (the game
  starts at once). The MANTA has no meter: enemies that leave capsules leave **colour items**
  instead, in an order set per stage — **red** and **green** raise the main gun and the sub-weapon
  through nine levels (missiles → discs, or lasers → piercing waves; the sub-weapon from an arcing
  bomb to piercing discs), **blue** gives the **Arm** (green 3, silver 4, gold 5 hits after 1, 4, 9
  blue items — it also stops the rock), **orange** an extra ship, **yellow** a smart bomb, and the
  red **octagon** switches the main gun's style. Items drift across the screen and vanish after
  ten seconds. **Ch ▼** (Left Shift, LB / RB) switches the MANTA's three speeds; OK does nothing in
  its games. The HUD shows its levels as pips; a loss costs the Arm (and a level on Classic, all
  power on Arcade). The MANTA keeps its own hi-score tables. In a browser `?stage=direct-range`
  sends six-cube pincer waves; AZURE VERGE's enemies are unchanged (its capsules become items).
- Behaviour change for tools and tests (M2-05): `GameConfig.shipId` (default `kestrel`) and
  `powerUpMode: 'direct'` (replay headers record them; older headers decode to the KESTREL),
  `DropKind.FreeOption` is 4 (`PowerUp` took 3), the `liveCounts` stride is `WEAPON_ROLE_SLOTS`
  (36), every flow that starts a game presses one more OK (the ship select); the golden replays
  were re-blessed (new hashed state and content — same outcomes) and three MANTA runs were added.
- **Two players at once** (M2-06): the title menu is now **1 PLAYER** (what START was) /
  **2 PLAYERS** / OPTIONS / EXIT. In a 2 PLAYERS game player 1 starts and a second player **joins
  any time** with START on a gamepad (on the TV a USB or Bluetooth pad; in a browser also Enter on
  the new **SPLIT KEYBOARD** control profile — WASD + F / G for player 1, arrows + K / L for player
  2). Player 2 flies the same ship in red-orange and gold. Each player has their own ships, score,
  extra ships, power-ups (items go to whoever touches them first), shields and **continues**: a
  player who loses their last ship comes back with START while the other plays on, and the game
  is over only when both are out — the CONTINUE? countdown then continues whoever presses OK.
  While both play, enemies leave an extra capsule every second time, the bottom bar splits into two
  halves, and GAME OVER / STAGE CLEAR show both scores. A short chirp plays when a player joins.
- Behaviour change (M2-06): in the menus and in one-player games **every gamepad** controls player
  1 (before, the second gamepad was always player 2); in a 2 PLAYERS game a gamepad becomes player
  2's with its first START or A.
- Behaviour change for tools and tests (M2-06): `GameConfig.coop` and `coopExtra` (replay headers
  record them; older headers decode to a one-player game); `TitleItem` is `Start 0`, `TwoPlayers 1`,
  `Options 2`, `Exit 3` (a flow walking to OPTIONS presses Down once more); `continueWorld(world,
  who)` takes a player mask and continues are per player (`continuesLeft`); `HUD_STRING_COUNT` 22,
  `HUD_COMMAND_COUNT` 96; input adapters may implement `setSeats` (`Game.inputSeats`); the golden
  replays were re-blessed (the hashed co-op credit and the `@p2` sprite names — same outcomes) and
  two co-op runs were added.
- **Stage mechanics for the later zones** (M2-07, in the browser's `?stage=gimmick-range` for now —
  AZURE VERGE is unchanged): **bricks** you shoot through (each takes a few hits and scores),
  pink **walls that grow back** a few seconds after breaking — never onto a ship —, **rocks** that
  drop when you come near and shatter, **bubbles** that split in two when shot, a **volcano**
  lobbing glowing stones, a **suction pod** that pulls ships towards it, **tentacles** on a chain
  that lunge and tug, a **cube rush** whose cubes stick to the rock and build walls, **moving
  blocks** as solid as the rock, a timed **stop** with the view panning down, a **diagonal** pan,
  a **fork** chosen by flying through a region, and a 4× **fast stretch**. A checkpoint restart
  (ARCADE losses, continues) puts every broken brick back and removes stacked cubes.
- For content authors (M2-07): tiles may be destructible (`hp`, `regen`, `score`), camera keys
  `hold` and `yOver`, stages `branches`, any event a `branch`, new `trigger` and `block` events and
  the `ballistic` enemy mover ([`content/stages/README.md`](content/stages/README.md)); **`pnpm
  content:tiled <map.tmj>`** converts a map drawn in Tiled into stage JSON.
- Behaviour change for tools and tests (M2-07): `STAGE_STATE_SLOTS` is 28, `StageEventCode` has
  `Trigger 8` / `Block 9`, `MoverKind.Ballistic` 9, `ENGINE_SPRITES` gained `gimmicks/chain-link`
  (later sprite ids shift), `createTerrainView` takes an optional change log; the golden replays
  were re-blessed (new hashed state — zone A's simulation unchanged) and three `gimmick-range` runs
  were added.
- **Picture options** (M2-08): OPTIONS gained **SCALE** (INTEGER — the sharp, letterboxed default —,
  FIT or STRETCH), **SHAKE** (on / off), **FLASHES** (NORMAL / REDUCED: at most one dim flash a
  second) and **HITBOX** (a white-and-pink marker on each ship's weak spot); they apply at once and
  are remembered. The **Mega Crash** flash now brightens the picture (additive) instead of covering
  it. On monitors faster than 60 Hz the world is drawn between ticks for smoother motion; the TV is
  unchanged.
- **SNES-style picture effects** (M2-08, in the browser's `?stage=raster-range` for now — AZURE
  VERGE is unchanged): per-scanline **raster effects** — wavy water, heat haze, a pseudo-3D
  line-band floor — and **palette cycling** (a sea whose colours roll), drawn by one WebGL1 filter
  per background layer only while an effect is on screen.
- For content authors (M2-08): stages may list `raster` effects (`wave`, `haze`, `lines` with
  optional `bands`) and palette `cycles` (exact `#rrggbb` ramps, ≤ 8 colours per layer) —
  [`content/stages/README.md`](content/stages/README.md#raster-effects-and-palette-cycles-m2-08).
- Behaviour change for tools and tests (M2-08): `OptionsItem.Back` is 9 (SCALE, SHAKE, FLASHES and
  HITBOX sit between BULLETS and BACK); `UserOptionKind` gained `ScaleMode 5` … `ShowHitbox 8`;
  `UserOptions.display` has four more fields (save format 1, no migration); `WorldView` may carry
  `effects` and `hitboxes`; `window.__shmupDebug.renderer`; the golden replays were re-blessed (two
  new content sprites shift the sprite ids — the simulation is unchanged) and a `raster-range` run
  was added.
- **Boss HP bar** (M2-09): OPTIONS → **BOSS HP** (off by default) shows `BOSS` and a red bar of the
  boss's remaining strength — its cores and the parts protecting them — in the top bar during boss
  fights, in place of `HI`; on the TV too (HALCYON BULWARK).
- **Advanced bosses** (M2-09, in the browser's test stages for now — AZURE VERGE is unchanged):
  **mid-bosses** that fight while the screen keeps scrolling (`?stage=captain-range`: a rammer, a
  bubble launcher, a circler, a ring-firing crab); **IRON LEVIATHAN**, a battleship longer than the
  screen that the view flies around while its turrets turn to aim, with **LEVIATHAN HEART** inside
  it and a **90-second time limit** after which it escapes (`?stage=raid-range`); the **EMBER AND
  FROST TWINS**, who take turns while the other rests behind, the survivor getting angry
  (`?stage=twin-range`); and a **boss rush** (`?stage=gauntlet-range`).
- For content authors (M2-09): boss sections may give `role: "captain"`, `timeLimit`, `raid`
  (boss-relative camera segments), `partner` / `alternate` / `enrage`, `inner` and `minion`; parts
  `radius` (circle hurtboxes), `angle`, `spin` and `turn` (heading frames); stages `type:
  "bossRush"` with a `rush` list —
  [`content/enemies/README.md`](content/enemies/README.md#advanced-bosses-m2-09),
  [`content/stages/README.md`](content/stages/README.md).
- Behaviour change for tools and tests (M2-09): the boss system has four slots (`bosses.slots`;
  `damagePart` / `isArmoured` take the part slot = slot × 16 + index), `MAX_HIT_TARGETS` is 128 and
  the part cooldown tables have 64 part slots; `BossState.Escape` 6, `SimEventKind.BossEscaped` 14,
  `World.endingFlags`, `StageRunner.follow`; `createBossSystem` takes the stage; `OptionsItem.BossHp`
  9 and `Back` 10, `UserOptionKind.BossHpBar` 9, `UserOptions.display.bossHpBar` (save format 1, no
  migration); `HUD_STRING_COUNT` 23, `HUD_COMMAND_COUNT` 100; the golden replays were re-blessed
  (the hash layout and content ids changed — every input, tick count and outcome is unchanged) and
  four advanced-boss runs were added.
- **The zone map** (M2-10): a game is now a **run** across a branching map of nine zones — AZURE
  VERGE, then B or C, D or E, F or G and one of two final zones, H or I (five zones per run, 16
  routes). Each zone opens with a **title card** during the fly-in; after its boss the ships **fly
  out** to the right, the **zone result** pays a kill bonus (100 points per percent of the zone's
  enemies shot down) and a **time bonus** (100 points per second the boss fight stayed under 90
  s), and the **ZONE MAP** lets you choose the next zone with ▲ / ▼ and OK (Back asks "quit to
  title?"); score, ships, power-ups and shield carry over. The final zone leads to a placeholder
  **ending** chosen by the route and the run (no ship lost, a boss that escaped). Zones B–I are
  short **stand-ins** for now (zone A's enemies, known bosses) so every route can be finished. A
  run's score is saved when it ends (game over or the ending). RETRY STAGE restarts the current
  zone with what you entered it with.
- **Hidden bonus stages** (M2-10, in the browser's `?stage=bonus-range` for now): three kinds of
  secret entrance — fly into a marked gap, destroy every ground target of a stretch, have a given
  score digit — lead into a bonus stage of **1,000-point capsules** and a **1UP**; clearing it
  would skip the zone's boss, and losing a ship there sends you back and locks the entrances.
- For content authors (M2-10): the new content kind **`campaign`**
  ([`content/campaign/README.md`](content/campaign/README.md): zones, edges, endings with run-flag
  conditions — the loader checks that every route reaches a final zone); stages `type: "bonus"`
  and the `bonus` event (`gap` / `ground` / `digit` entrances), the drops `oneUp` and
  `bonusCapsule` ([`content/stages/README.md`](content/stages/README.md)).
- Behaviour change for tools and tests (M2-10): a game on the campaign's start zone (zone A) is a
  campaign run — the stage-clear screen becomes the zone tally and leads to the map; any other
  stage keeps the single-stage flow. `PlayerState` gained `leaving` (the fly-out, from the tick after
  `stageClear`); `DropKind.FreeOption` is 6 (`OneUp` 4, `BonusCapsule` 5), `ItemKind` gained
  `OneUp` 9 / `BonusCapsule` 10, `StageEventCode.Bonus` 10, `SimEventKind.PrepareStage` 15
  (`@shmup/shell` `connectStagePreparation`); `EnemySystem.stats`, `World.bonus`; the scene flow's
  UI list has 384 commands / 224 string slots; the golden replays were re-blessed (the hash layout,
  two new engine sprites and a new enemies file shift ids — zone A's inputs, tick counts and
  outcomes are unchanged; three boss-range runs were re-recorded with the improved playtest bot)
  and three bonus-stage runs were added.
- **Zone B, BRINE NEBULA** (M2-11) replaces its stand-in: about 3½ minutes of bubbles that burst
  into smaller bubbles or free the fish inside them, jellyfish firing rings, spiny urchins in a reef
  tunnel, a riptide and a wobbling, colour-shifting sea; the mid-boss **SPUME HERALD** fights while
  the screen scrolls on (and leaves after 30 seconds); the boss **GALVANIC MAW** is a mechanical fish
  whose mouth can only be hit while open, with jaws that open apart, needle fans, rings and homing
  rockets you can shoot down. Its own stage and boss music.
- **Zone B's secret bonus stage, PEARL GROTTO** (M2-11): fly into the gap between two reef blocks at
  the top of the screen (about 2:10 into the zone) — 1,000-point capsules, an extra ship, two brick
  walls; clearing it clears the zone (the boss is skipped). Works on every device.
- **Zone C, DUNE EXPANSE** (M2-11) replaces its stand-in: about 4 minutes of sand worms bursting out
  of the dunes, beetles walking on the canyon ceiling, dust devils, sand geysers throwing clods, heat
  haze and a sandstorm run; the boss **SANDGRAVE WIDOW** is a giant spider — shoot its two fangs,
  then its head — sending spider drones and, once angry, blinking silk-line lasers. Its own music.
- For content authors (M2-11): the behaviours `rocket.homing` (homing rockets as shootable enemies),
  `worm.burst` (a formation is one sand worm), `boss.maw` and `boss.widow`; the zone patterns
  `brine.jelly-ring` and `dune.whirl`; the tilesets `terrain-reef` / `terrain-dune`; stage-scoped
  songs for zones B and C ([`content/stages/README.md`](content/stages/README.md),
  [`content/enemies/README.md`](content/enemies/README.md)).
- Behaviour change for tools and tests (M2-11): `BossPart` gained `restX` / `restY` (the boss data's
  offsets — `boss.maw` places its jaws from them); the playtest harness times the stage's main
  encounter, never a captain; the recovery rule lives in `test/playtest/recovery.ts`. The golden
  replays were re-blessed (the new sprites and scripts shift ids — inputs, tick counts and outcomes
  unchanged) and five zone B / C runs were added. The Tizen `app.js` is 307.5 KB gzip of its
  350 KB budget.
- **Zone D, MAGMA DEEP** (M2-12) replaces its stand-in: about 3½ minutes over erupting volcanoes
  throwing lava bombs, then a **dive** — the scrolling stops and the view sinks down into the caves
  — with rocks dropping from the roof, a **maze of brick walls** (a gap in each, or shoot your way
  through), a lava river over a colour-rolling lake of lava; the boss **CINDER BASTION** is a
  battleship whose core hides behind turning shield arms, with lane lasers from two emitters. Its
  own stage and boss music.
- **Zone E, TEMPEST RIDGE** (M2-12) replaces its stand-in: about 4 minutes in a storm over jagged
  mountains — rolling clouds, slanting rain —, kites and jets that come **from behind** and overtake
  the ship, thunderheads firing needle streaks and a gale run; the boss **SQUALL STEED** is a
  seahorse whose chest can only be hit while open, sending out little homing seahorses. Its own
  music.
- For content authors (M2-12): the behaviours `rear.swoop` (a rear attacker: in from behind along
  its row, one shot back, away), `boss.bastion` (rotating shield arms as boss parts on a spinning
  hub, attached lane lasers) and `boss.steed` (a bob, a `whenOpen` chest launching minis); taller
  maps with a dive (`tilemap.rowsTall`, a `hold` key with a `yTo` pan), destructible walls as `rle`
  rows, spawns behind the view (a negative `screenX`), rear-entry paths; the pattern `tempest.bolt`;
  the tilesets `terrain-magma` / `terrain-ridge`; songs for zones D and E
  ([`content/stages/README.md`](content/stages/README.md),
  [`content/enemies/README.md`](content/enemies/README.md)).
- Behaviour change for tools and tests (M2-12): the content test's zones block covers B–E (new types
  counted against every zone a run can have flown before, ground enemies checked at the camera
  height their event fires at, a lane limit per boss); the stage-runtime corridor check measures the
  rows the camera shows; `playGolden` takes an optional per-tick observer. The golden replays were
  re-blessed (new sprites and scripts shift ids — inputs, tick counts and outcomes unchanged) and
  five zone D / E runs were added (38 in all). The Tizen `app.js` is 313.5 KB gzip of its 350 KB
  budget.
- **Zone F, CELL VAULT** (M2-13) replaces its stand-in: about 3½ minutes inside a living vault —
  cells that **chase** the ship, big cells that **divide** into two chasers when shot, a passage of
  **tissue walls that grow back** after you shoot through them (a gap in each), **grabbing
  tentacles** that lunge and tug the ship, spore sacs and a fast pulse run; the boss **MANTLE
  REGENT** is a squid whose two tentacles curl in front of its eye to guard it — break one and it
  changes its attacks, launching chasing cells. Its own stage and boss music.
- **Zone G, PRISM LABYRINTH** (M2-13) replaces its stand-in: about 4 minutes in a crystal maze —
  crystal walls from the ceiling and the floor in turn, **rushes of cubes** that stick where they hit
  and build walls, lenses fanning needles, geodes that shatter —; the boss **FACET MONARCH** hides
  its core behind two crystals and waves two arms like claws, with lane lasers at the end. **The
  second secret bonus stage**, GLIMMER CACHE (1,000-point capsules, an extra ship), opens when all
  four turrets of the prism gallery are shot down. Its own music.
- For content authors (M2-13): the behaviours `cell.chase` (a chasing cell: in along its row, a
  capped-turn chase, then straight on), `boss.squid` and `boss.facet` (tentacle arms as chains of
  circle-hit parts, curled alike and mirrored, carried across phase changes without a jump); the
  patterns `vault.spores` and `prism.fan`; the tilesets `terrain-vault` / `terrain-prism`; songs for
  zones F and G; the bonus stage `glimmer-cache`; the rule that no ground enemy of an earlier event
  may still stand when a `ground` bonus window arms
  ([`content/stages/README.md`](content/stages/README.md),
  [`content/enemies/README.md`](content/enemies/README.md)).
- Behaviour change for tools and tests (M2-13): the content test's zones block covers B–G (the
  chasing cells' and claws' speeds in the 2-px/tick check) and plays every shipped stage with a
  `ground` entrance to hold it to the rule above. The golden replays were re-blessed (new sprites and
  scripts shift ids — inputs, tick counts and outcomes unchanged; the review fix re-blessed
  `zone-g-god` once more, ticks and outcome unchanged) and eight zone F / G runs were added (46 in
  all). The Tizen `app.js` is 320.3 KB gzip of its 350 KB budget.
- **Zone H, IRON CITADEL** (M2-14) replaces its stand-in — the first final zone: about 4 minutes in
  the enemy fortress — running lights chasing along steel walls, hatches in the floor and the ceiling
  releasing drones, a **piston hall** where floors and ceilings swing in and out while laser
  emitters fire lanes along their rows, a **parade of four earlier bosses in reduced form**
  (BULWARK, MAW, BASTION and REGENT ECHO — each leaves after 16 seconds) and a fast core run; the
  final boss **IRON SOVEREIGN** is a real finale in four phases: shield plates and lanes, a turning
  shield wheel with rings, drones from its hatches, then an overdrive spiral. Its own music.
- **Zone I, ABYSSAL THRONE** (M2-14) replaces its stand-in — the other final zone: about 4½ minutes
  in the deep — twinkling specks, gulpers, **depth mines** that arm when you come near and burst into
  rings, eels bursting from a trench and an undertow; the **ABYSS ARK** is a whale-class battleship
  the view flies along (turret rows, homing hooks) that sails away after 90 seconds, and its final
  blast reveals **THE HOLLOW KING**, an anglerfish whose mouth opens to show its weak point and
  whose lure sways and fires. Its own music.
- **Endings and credits** (M2-14): after zone H or I the run ends with an **ending scene** — the
  citadel breaking apart behind your ship, or your ship rising out of the deep while the ARK sinks
  (or sails off, if it escaped) —, a **dawn** when no ship was lost, a five- or six-line epilogue,
  the result card, and then the **credits** scrolling to their own song (OK or Back skips them).
  Five endings: THE CITADEL FALLS SILENT / THE CITADEL FALLS (zone H), THE DEEP IS STILL / THE
  FLAGSHIP SLIPS AWAY / THE THRONE IS BROKEN (zone I) — an escaped ARK always gives THE FLAGSHIP
  SLIPS AWAY. New songs: the two final zones and their bosses, AFTER THE LAST WAVE (the ending) and
  THANK YOU, PILOT (the credits).
- For content authors (M2-14): the behaviours `emitter.laser` (a laser emitter's attached lanes),
  `mine.burst` (a mine that arms when a ship comes near), `boss.sovereign`, `boss.ark` and
  `boss.angler`; the pattern `abyss.gulp`; the tilesets `terrain-citadel` / `terrain-abyss`; a
  campaign ending's `scene` (`none` / `citadel` / `abyss`) and `text` (the epilogue) and the
  campaign's `credits`; a stage's optional `music.ending` / `music.credits` cues
  ([`content/campaign/README.md`](content/campaign/README.md),
  [`content/stages/README.md`](content/stages/README.md),
  [`content/enemies/README.md`](content/enemies/README.md)).
- Behaviour change for tools and tests (M2-14): `ScriptApi.sleepUntilNear` / `Enemy.nearRange` and
  `BossScriptApi.spiral` / `Boss.spiral*` joined the state hash; `core/behaviors` is `implemented`;
  the scene flow has a `credits` scene (`CreditsScene`) and 256 UI string slots; the ending screen
  has a story phase before its card and moves on to the credits; `stageMusicCues` adds a final
  zone's ending and credits cues; `UI_SPRITES` gained six `ui/ending-*` sprites; the heavy boss
  allocation guards allow the bytes of their script's wakes (`WakeCount`). The golden replays were
  re-blessed (new sprites and scripts shift ids, the hash gained the new fields — inputs, tick counts
  and outcomes unchanged; the test round's `boss.ark` fix re-blessed `zone-i-god` once more) and
  seven zone H / I runs were added (53 in all). The Tizen `app.js` is 331.5 KB gzip of its 350 KB
  budget.
- **The mode select** (M2-15): the title's menu now reads 1 PLAYER / 2 PLAYERS / **PRACTICE** /
  OPTIONS / **SOUND TEST** / EXIT (EXIT on the TV only) — OPTIONS is one ▼ further down.
- **Attract mode** (M2-15): left alone for 12 seconds on `PRESS OK`, the title plays a **demo** of a
  zone (a recording of the computer player, one zone after the other, silent, `DEMO PLAY`), then the
  **high-score tables**, then an original **story** crawling up over three picture scenes, and comes
  back; any button returns to the title.
- **Name entry and high-score tables** (M2-15): a score that makes its table is named with three
  letters — ▲ ▼ pick a letter, ▶ or OK go on, ◀ or Back go back, OK on `END` finishes (30 s time
  limit) — then the table is shown with the new row blinking. Tables are kept per difficulty, ship
  **and mode**: one-player games, two-player games (both players name their rows) and practice each
  have their own; two-player rows of older saves move into the two-player tables by themselves.
  The zone column shows the zone reached.
- **Practice** (M2-15): choose a ZONE, a CHECKPOINT and a LOADOUT (STANDARD or FULL POWER), then the
  difficulty, ship and weapons as usual; one zone is played from there, its scores go to the
  practice tables and never change the title's `HI`.
- **Sound test** (M2-15): every music track and every sound effect, played with OK; STOP silences
  the music, BACK brings the title theme back.
- **CONTINUE?** (M2-15) shows a time bar that drains (red for the last three seconds, the number
  flashing), your score, and a blinking `PRESS OK` / `BACK: GIVE UP` once OK counts.
- For content authors (M2-15): the new content kind `replay` — the attract demos in
  `content/demos/` (recorded by `test/golden/demos.ts`, never edited by hand) — and a campaign's
  optional `story` (up to 8 pages, each a picture scene `none` / `dawn` / `invasion` / `launch` and
  up to 6 lines) ([`content/demos/README.md`](content/demos/README.md),
  [`content/campaign/README.md`](content/campaign/README.md)).
- Behaviour change for tools and tests (M2-15): `TitleItem` is Start 0, TwoPlayers 1, Practice 2,
  Options 3, SoundTest 4, Exit 5; every end of a game goes through `finishGame()` — the name entry
  (when a score entered its table) and the result table before the title; `hiScoreModeKey(config,
  mode)` names `-2p` / `-practice` tables; `SimEventKind.SoundTest` (16), `GameOptions.soundTest`,
  `AudioEngine.playTrack` and the shell's `connectSoundTest` are new; `core/replay` was split into
  `format.ts` and `demo.ts` (`createDemoPlayback`, `DemoPlayback`) with the same public API;
  `pnpm golden:update` also re-records the demos; `core/scenes` is `implemented`, with 384 UI string
  slots. No simulation change — the golden replays are unchanged. The Tizen `app.js` is 343.8 KB gzip
  of its 350 KB budget.
- **The Options screen, regrouped** (M2-16): MASTER / MUSIC / SFX, then three pages — **CONTROLS**,
  **DISPLAY** (BULLETS, SCALE, SHAKE, FLASHES, HITBOX, BOSS HP, as before) and **GAME** — and BACK.
- **CONTROLS** (M2-16): the control profile, **AUTOFIRE** — ALWAYS (as before), TOGGLE (each Shot
  press switches firing off and on) or HOLD (fire while Shot is held); the TV stays always-on —,
  **RATE** (7.5 to 30 shots a second), **SOCD** (what opposite directions held together do),
  **DEBOUNCE** (the remote's hiccup protection, 0–10 frames) and an **INPUT TEST** that lights every
  game action you press (hold Pause to leave).
- **Rebinding** (M2-16): **REBIND KEYS** / **REBIND PAD** give every action of the game and of the
  menus your own keys, remote buttons or gamepad buttons — a 5-second capture prompt, conflicts
  resolved by taking the key from the other action or swapping the two, never leaving an action the
  game needs without a key; Esc and the remote's Back never move; RESET brings the standard keys
  back. Kept per control profile, remembered.
- **GAME** (M2-16): the difficulty (now remembered between launches), **LIVES** 1–5, the death
  **PENALTY**, **AUTO POWER**, the pickup **MAGNET** and **ONE BUTTON** play (autofire, Auto
  Power-Up and the casual penalty — a game with the directions alone). They apply from the next game
  or a RETRY STAGE; a run keeps what it started with. The DIFFICULTY box shows the LIVES the game will
  get.
- For translators (M2-16): every word of the canvas UI is in a string table,
  `content/strings/en.strings.json` (kind `strings`) — a `<language>.strings.json` file holds a
  translation; choosing the language comes later ([`content/strings/README.md`](content/strings/README.md)).
- Behaviour change for tools and tests (M2-16): `OptionsItem` is Master 0, Music 1, Sfx 2, Controls 3,
  Display 4, Game 5, Back 6 (the display rows are `DisplayItem`s, the profile `ControlsItem.Profile`);
  `GameConfig.autofireMode` is new (replay headers record it — older headers decode to `'always'`;
  every golden replay and demo was re-blessed for the header only, same hashes and outcomes; two
  autofire goldens were added); the save is **version 2** under the same key (`save.v1`), migrated
  from version 1 (options kept, the co-op / practice rows of old one-player tables moved);
  `UserOptionKind.InputSettings` (10), `GameOptions.controls`, `@shmup/input-web`'s rebinding API and
  the shell's `createShellControls` are new; 512 UI string slots. The Tizen `app.js` is ≈ 359 KB gzip
  of a budget raised to 384 KB.
- **The desktop app, first-class** (M2-17): settings and high scores are kept in **files** in the
  user-data folder (`saves/save.v1.json`, written atomically with the previous version kept as a
  `.bak` and read back if a file is missing or damaged); the title has **EXIT**; sound starts at
  once; the window **remembers** fullscreen (**F11** / **Alt+Enter**), its size in whole steps of
  the picture (**Ctrl + =** / **Ctrl + -** / **Ctrl + 0**, Cmd on macOS) and its position (on Linux
  and the Steam Deck too); installers can be built with `pnpm --filter @shmup/electron package`
  (Windows, Linux AppImage, macOS — unsigned, no icon yet). Desktop builds before M2-17 kept their
  save in the app's browser storage, which is not carried over.
- **TV extras** (M2-17): a **game-mode build** (`build:game-mode` — Samsung's `use.game.mode`
  metadata) for the latency A/B test on the monitors; the default build stays without metadata, and
  the launch-time gamepad check exists only as an opt-in test build (it shows a popup without a
  pad). The debug build's panel shows the monitor's **model and firmware** (a sixth line; the app now
  requests the `productinfo` privilege), and `tizen:watch` **live-reloads** a development build on
  the TV after every change.
- **Storage** (M2-17): a full browser / TV storage no longer stops saving for the rest of the session
  — only the value that did not fit waits in memory; debug builds can **export and import the
  save** (`__shmupDebug.save`) for bug reports. The shell estimates the TV memory per zone (every
  zone under 100 MB) and unloads atlas pages a zone does not need (none yet — one page).
- Behaviour change for tools and tests (M2-17): `apps/web` and `apps/tizen` use the shell's
  `createWebStorage` (`@shmup/shell` `storage`); `createLocalStorage` returns a `QuotaStorage`; the
  web platform takes `electron` (`getElectronBridge`) and is `'electron'` with it; the Electron
  preload exposes `storage.get` / `storage.set`; `SaveStore.replace`, `DebugToolsOptions.device`,
  `DebugOverlay.setDevice`, `Shell.atlasResidency`, the `memory` module, `tizenDebugTools`'s `canvas`
  argument and the `__SHMUP_LIVE_RELOAD__` define are new; `device-info` and `live-reload` are
  implemented. No simulation change — the golden replays are unchanged. The Tizen `app.js` is ≈ 361 KB
  gzip of 384 KB.
- **Release hardening** (M2-18) — what the release bot runs found and fixed:
  - the **MANTA's waves** (the LASER → WAVE family's top four levels) now pass through armour: a
    wave clinks on an armoured part at most once every 6 ticks and flies on to the weak point behind
    it (a new `passArmour` weapon tunable) — before, a fully powered MANTA could not hurt MANTLE
    REGENT, IRON SOVEREIGN or THE HOLLOW KING at all;
  - the **MANTA's fifth disc level** fires two parallel small discs instead of a narrow V whose gap
    let a small core straight ahead through (CINDER BASTION survived it);
  - **GALVANIC MAW** opens its jaws wider (8 px, 9 in its last phase) so the MANTA's biggest discs
    reach its mouth;
  - **SANDGRAVE WIDOW** waits a whole silk line before spinning the next one however high the rank
    is — a fully powered ship's rank used to bring two lines 16 px apart (under the 4-way gap);
  - the golden replay `zone-b-god` was re-blessed for the wider jaws (nine ticks longer, same
    outcome); no other replay or attract demo changed.
- **Release checks** (M2-18): the 4-way bot clears all **16 routes with both ships** (every zone in
  3–6 minutes, the 4-way rules holding on every tick); a **release audit** of the content (capsule
  and item budgets, the recovery rule, every bullet pattern at Normal and at loop 1's top rank,
  every boss fight's laser lanes with both ships); **cross-engine determinism** — every golden
  replay and attract demo reproduces its state hashes in Chromium and Firefox; per-zone stress
  benchmarks and a 30-minute soak (`pnpm bench`); boot to title in under 3 s and the Tizen
  certification self-checks (Back / exit, multitasking, resume, user data) in the browser tests.
- **Icons and store placeholders** (M2-18): `pnpm store:assets` draws the TV icon (512 × 423), the
  desktop app's icon (512 × 512 — the installers now have one) and placeholder store screenshots
  and listing text from the game's own placeholder art.
- Behaviour change for tools and tests (M2-18): `ShotFlag.PassArmour` and the `direct.bolt`
  tunable `passArmour`; `@shmup/shell`'s `determinism` module (`createDeterminismCheck`,
  `installDeterminismCheck`); the web app's `?determinism` page in dev / test builds; the playtest
  harness's `CampaignFlags.observe`, `columnGap` and `RuleWatch.narrowestColumn`; Playwright's
  `firefox` project; version `1.0.0-rc.1`.

### Documentation

- New developer guides [`docs/dev/difficulty-and-rank.md`](docs/dev/difficulty-and-rank.md),
  [`docs/dev/pattern-dsl.md`](docs/dev/pattern-dsl.md) and
  [`docs/dev/meter-arsenal.md`](docs/dev/meter-arsenal.md); the pattern format for authors in
  [`content/patterns/README.md`](content/patterns/README.md); the tester guide's
  [difficulty, extra ships and continues](docs/client/preview-build.md#difficulty-extra-ships-and-continues)
  and [Options screen](docs/client/preview-build.md#the-options-screen) (BULLETS), and
  [Choosing your weapons](docs/client/preview-build.md#choosing-your-weapons) (the WEAPON SELECT
  screen, M2-03; the Option types and shields, M2-04) and
  [The Option Hunter range](docs/client/preview-build.md#the-option-hunter-range-browser-only)
  (M2-04); the developer guide
  [`docs/dev/options-shields-hunter.md`](docs/dev/options-shields-hunter.md) (M2-04); the
  developer guide [`docs/dev/direct-mode.md`](docs/dev/direct-mode.md) and the tester guide's
  [Choosing your ship](docs/client/preview-build.md#choosing-your-ship),
  [The MANTA](docs/client/preview-build.md#the-manta-colour-items-weapons-and-the-arm) and
  [The Direct range](docs/client/preview-build.md#the-direct-range-browser-only) (M2-05); the
  developer guide [`docs/dev/coop.md`](docs/dev/coop.md), the tester guide's
  [Two players](docs/client/preview-build.md#two-players) and the controls page's
  [Two players](docs/client/controls.md#two-players) (M2-06); the developer guide
  [`docs/dev/advanced-stages.md`](docs/dev/advanced-stages.md) and the tester guide's
  [The Gimmick range](docs/client/preview-build.md#the-gimmick-range-browser-only) (M2-07); the
  developer guide [`docs/dev/presentation-polish.md`](docs/dev/presentation-polish.md), the tester
  guide's [Options screen](docs/client/preview-build.md#the-options-screen) (SCALE, SHAKE, FLASHES,
  HITBOX) and [The Raster range](docs/client/preview-build.md#the-raster-range-browser-only)
  (M2-08); the developer guide [`docs/dev/advanced-bosses.md`](docs/dev/advanced-bosses.md) and the
  tester guide's
  [The advanced boss ranges](docs/client/preview-build.md#the-advanced-boss-ranges-browser-only)
  and [The boss HP bar](docs/client/preview-build.md#the-boss-hp-bar-every-device) (M2-09); the
  developer guide [`docs/dev/campaign-and-bonus-stages.md`](docs/dev/campaign-and-bonus-stages.md),
  the map format for authors in [`content/campaign/README.md`](content/campaign/README.md), and the
  tester guide's [The zone map](docs/client/preview-build.md#the-zone-map-a-run-through-nine-zones)
  and [Hidden bonus stages](docs/client/preview-build.md#hidden-bonus-stages)
  (M2-10); the developer guide [`docs/dev/zones-b-and-c.md`](docs/dev/zones-b-and-c.md) and the
  tester guide's [Zone B: BRINE NEBULA](docs/client/preview-build.md#zone-b-brine-nebula) (with
  the secret bonus stage PEARL GROTTO) and
  [Zone C: DUNE EXPANSE](docs/client/preview-build.md#zone-c-dune-expanse) (M2-11); the developer
  guide [`docs/dev/zones-d-and-e.md`](docs/dev/zones-d-and-e.md) and the tester guide's
  [Zone D: MAGMA DEEP](docs/client/preview-build.md#zone-d-magma-deep) and
  [Zone E: TEMPEST RIDGE](docs/client/preview-build.md#zone-e-tempest-ridge) (M2-12); the developer
  guide [`docs/dev/zones-f-and-g.md`](docs/dev/zones-f-and-g.md) and the tester guide's
  [Zone F: CELL VAULT](docs/client/preview-build.md#zone-f-cell-vault) and
  [Zone G: PRISM LABYRINTH](docs/client/preview-build.md#zone-g-prism-labyrinth) with the secret
  bonus stage [GLIMMER CACHE](docs/client/preview-build.md#the-secret-bonus-stage-glimmer-cache)
  (M2-13); the developer guide [`docs/dev/zones-h-and-i.md`](docs/dev/zones-h-and-i.md) and the
  tester guide's [Zone H: IRON CITADEL](docs/client/preview-build.md#zone-h-iron-citadel),
  [Zone I: ABYSSAL THRONE](docs/client/preview-build.md#zone-i-abyssal-throne) and
  [The endings and the credits](docs/client/preview-build.md#the-endings-and-the-credits) (M2-14);
  the developer guide [`docs/dev/front-end-and-attract.md`](docs/dev/front-end-and-attract.md), the
  demo format for authors in [`content/demos/README.md`](content/demos/README.md) and the tester
  guide's
  [The front end](docs/client/preview-build.md#the-front-end-attract-mode-high-scores-practice-and-the-sound-test)
  (M2-15); the developer guide
  [`docs/dev/options-rebinding-and-accessibility.md`](docs/dev/options-rebinding-and-accessibility.md),
  the string-table format for translators in [`content/strings/README.md`](content/strings/README.md),
  the tester guide's [The Options screen](docs/client/preview-build.md#the-options-screen) (the
  CONTROLS, DISPLAY and GAME pages) and the controls page's
  [CONTROLS page](docs/client/controls.md#the-controls-page-autofire-socd-and-the-hiccup-protection),
  [Rebinding](docs/client/controls.md#rebinding-keys-and-buttons),
  [Input test](docs/client/controls.md#the-input-test) and
  [One-button play](docs/client/controls.md#one-button-play) (M2-16); the developer guide
  [`docs/dev/platform-polish.md`](docs/dev/platform-polish.md), the new player page
  [`docs/client/desktop-app.md`](docs/client/desktop-app.md), the TV page's
  [game-mode build](docs/client/install-on-tv.md#the-game-mode-build-latency-ab-test) and live
  reload, the debug tools'
  [device line](docs/client/debug-tools.md#the-device-line) and save export, and the remote Web
  Inspector in [`docs/dev/build-test-deploy.md`](docs/dev/build-test-deploy.md#the-remote-web-inspector-devtools-on-the-tv)
  (M2-17); the developer guide [`docs/dev/release-hardening.md`](docs/dev/release-hardening.md) —
  the release gate, what it found, the determinism check, the benchmarks, the release checks, the
  icons, the version and what stays manual — and the player / owner page
  [`docs/client/release-candidate.md`](docs/client/release-candidate.md): where the version shows,
  what changed for players, what the automated checks cover and the v1.0 checklist for the
  monitors (M2-18).

## [0.1.0] — M1: playable vertical slice

The first milestone (plan steps M1-01 … M1-19): one complete zone with its boss, playable from
start to stage clear with the Samsung remote alone, in the browser dev app and as a Tizen 5.5
widget bundle (`pnpm --filter @shmup/tizen build` → a checked `dist/` ready to package).

### Game

- **Zone A — AZURE VERGE**: about three minutes of scrolling in five sections (open space, fan
  formations, floor and ceiling terrain with turrets, walkers and hatches, orbiters) ending with the
  WARNING and the multi-part boss **HALCYON BULWARK** (code HB-01, three phases).
- **KESTREL**, the meter ship: six speed levels, normalized diagonals, fly-in and respawn, Type A
  arsenal (shot, Double, Laser, Missile) with always-on autofire, up to four trailing Options.
- The seven-slot **power meter** (Speed, Missile, Double, Laser, Option, `?` Force Field,
  `!` Mega Crash), capsule carriers and formation bonuses, optional Auto Power-Up, pickup magnet.
- Enemy bullets on 32 aim directions tuned for 4-way dodging, telegraphed lasers, bullet cancel on
  death; death penalties Classic (default), Arcade and Casual; lives, score and hi-score.
- Game feel: hit flash, hit-stop on big events, screen shake, flash limiter, particles, score
  popups; procedural placeholder SFX and chip-tune music with sample-exact loops.
- Scene flow: title, game, pause, stage clear, game over, exit confirmation on the TV, an Options
  screen (volumes, controls profile); saves (`save.v1`) with hi-score tables and migrations.
- Remote-first input: data-driven key profiles (`tizen-remote-safe` default, release debounce,
  diagonal and SOCD policies), separate game / menu binding tables, gamepad and keyboard support.

### Engine and tooling

- `@shmup/core`: deterministic simulation (seeded RNG streams, trig tables, fixed 9-phase tick,
  struct-of-arrays pools, zero allocations per tick), validated JSON content, scene stack, HUD and
  canvas UI kit, state hashing.
- `@shmup/render-pixi` (PixiJS 8, WebGL1 first, 384×216 integer-scaled), `@shmup/audio-web`
  (Web Audio engine and synth), `@shmup/input-web`, `@shmup/shell` (the shared browser host).
- Placeholder art as code: pixel-map sources and procedural generators packed into a ≤ 2048²
  atlas by `pnpm assets`; content and the atlas manifest inlined into the single classic ES2018
  IIFE the TV runs.
- M1-19 — **debug tools** in dev / test builds (`__SHMUP_DEV__`): god mode, stage skip to the boss,
  jump to the next checkpoint, frame advance and single steps, slow motion 2× / 4×, hitbox and grid
  outlines and an overlay (FPS, tick / render ms, draw calls, pool usage, rank, RNG calls, state
  hash, WebGL version, boot ms, frame graph) — F1–F8 on the web, unlocked on the TV by the remote
  sequence Pause, Ch+, Ch+, Ch+ (then 1–8); `window.__shmupDebug` for tests.
- M1-19 — **replays** (`core/replay`): per-tick `held | pressed << 16` input per player,
  run-length and base64 encoded, a header with every sim-affecting option, a state hash every 600
  ticks, playback with desync detection; **golden replays** of zone A (`test/golden/`) checked by
  `pnpm test` and re-blessed with `pnpm golden:update`.
- M1-19 — **budgets**: `pnpm bench` (20,000 stress ticks — median < 1.0 ms/tick, heap growth
  < 512 KB, run in CI) and the Tizen bundle check (`app.js` ≤ 350 KB gzipped, atlas pages
  ≤ 2048², `dist/` ≤ 8 MB); an e2e gameplay smoke on both builds.
- Versions: `0.1.0` in every package manifest and in the widget's `config.xml`.

### Documentation

- Testers: [`docs/client/preview-build.md`](docs/client/preview-build.md) (the build, checks per
  feature), [`docs/client/debug-tools.md`](docs/client/debug-tools.md) (the debug build, the
  developer tools and the **M1 release check** for the monitors),
  [`docs/client/controls.md`](docs/client/controls.md),
  [`docs/client/install-on-tv.md`](docs/client/install-on-tv.md).
- Contributors: [`docs/dev/`](docs/dev/README.md) — one guide per system, including
  [`debug-and-replays.md`](docs/dev/debug-and-replays.md) for the M1-19 tooling, and the
  [API reference](docs/dev/api-reference.md).

[2.0.0]: https://github.com/detain/shmup-cup/releases/tag/v2.0.0
[1.0.0]: https://github.com/detain/shmup-cup/releases/tag/v1.0.0
[1.0.0-rc.1]: https://github.com/detain/shmup-cup/tree/master
[0.1.0]: https://github.com/detain/shmup-cup/tree/master

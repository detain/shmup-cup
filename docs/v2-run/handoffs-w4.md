# The R2-01 docs pass: inputs and hand-offs

> Used by wave 1 (`docs/v2-run/wave-01.md`, subtasks `R2-01.D1` … `R2-01.D7`) and cited by later waves for the
> R2-02, R2-03, R3 and R4 notes. Collected from the earlier run's wave-4 reports and reviews, which are not
> committed: everything they hold for the docs pass is here.

What this is: every docs hand-off, docs need and as-built correction that the R2-01 (wave-4) work left for the
docs agent or for later steps (R2-02, R2-03, R2-04, R3, R4). It merges the wave-4 hand-off list, the builder and
fixer reports, the wave-4 scout's §9, the wave-5 pre-check (§2 items 10 and 16) and the review items routed to the
docs agent. Grouped by the file that needs the edit.

**Checked against master `bc8e05d`.** How:

- `git grep` / `grep -n` / reading the files for every number and path below;
- a full `vitest run` at `bc8e05d` (782 files, 9,314 tests: 8,954 passed, **0 failed, 360 skipped**);
- `pnpm --filter @shmup/tizen build`, `node scripts/doc-images.mjs --check`, and the rescale dry run with the v1 flags;
- `gh run view` on the latest master CI run.

**Updated for `c67c7c9`** (C5 review 2 and C5 fix 2, after `bc8e05d`): only `test/e2e/campaign-run.spec.ts`,
`debug-tools.spec.ts`, `flight.spec.ts` and `raster.spec.ts` changed. See the R2-01 As built, the R2-02 notes, Appendix A
(b)'s moved line numbers and Appendix A (d).

**Updated for `543887b`:** C5 review 3 → fix 3 `8ff2bf6` (the shared `test/e2e/ticks.ts`, its mirrors pinned by
`test/integration/e2e-ticks.test.ts`) and fix 4 `543887b` (every boot wait `BOOT_TIMEOUT_MS`; fly-in and item polls
count ticks, `SHIP_ENTER_TICKS`). Read their commit bodies (`git show -s 8ff2bf6 543887b`); the e2e line numbers
below are older — `wave-00.md` / `wave-06.md` cite them on `543887b`.

Tags:

- `(src)` names the report or review an item comes from.
- `(was: …)` gives a statement that later work superseded.
- `(found while verifying)` marks a gap no report named, seen while checking.
- `(unverified)` marks a number that was not re-measured here.

---

## CLAUDE.md

The re-plan that wrote `docs/v2-run/` may already have changed these lines; read `CLAUDE.md` on
`origin/master` first and change only what is still stale.

- **`CLAUDE.md:17` "Today the code still runs at 384×216" is false since `72b18a1`.** The code runs at 640×360:
  - `FRAME_W` 640, `FRAME_H` 360;
  - `HUD_BAR_HEIGHT` 12, `TILE_SIZE` 12;
  - the interim 9×12 font (line 15);
  - `ART_SCALE` 3/2.

  The rest of that bullet describes R1. The fingerprint was re-pinned at R2-01, with reasons. The scans now ban the
  v1 numbers and also 640 / 360 / 336 / 348. (A5, scout §9) (done in `92da486`: the flip bullet now says 640×360)
- **`CLAUDE.md:76`, "merge `v1.x` → `master` until R2-01 lands":** R2-01's flip has landed. From now on only code
  fixes are cherry-picked (`git cherry-pick -x`). (found while verifying; plan §3.3 says the same)
- **`CLAUDE.md`'s Tooling bullet quoted `node scripts/content/rescale.mjs --factor 1.5 --top-pad 36 --dry-run`, which
  exits 2 since the flip** ("the atlas' terrain tiles are 12 px against the content's tilesets' 8 px … need
  --art-scale 1.5"). Until R2-02's port it needs the four v1 flags and `--art-scale 1.5` (R2-02 notes); after the port
  the check is `--factor 1 --dry-run`. (found by the re-plan review; done in the re-plan's review fix: the bullet now
  gives both commands — check it, and after the port drop the pre-port one)

## docs/dev/conventions.md

### § Frame numbers: the constants (`:79-81`)

- The values are now:
  - `FRAME_W` / `FRAME_H` 640 / 360, centre 320 / 180;
  - `HUD_BAR_HEIGHT` 12;
  - `PLAYFIELD_H` 336, `HUD_BOTTOM_Y` 348;
  - `TILE_SIZE` 12;
  - `GLYPH_W` / `GLYPH_H` / `LINE_H` 9 / 12 / 15.

  (verified `packages/core/src/config/index.ts:746-825`)
- **The font pin is now "file × `ART_SCALE`".** `frame-constants.test.ts` pins `GLYPH_W/H`, `LINE_H` and the
  advance to the font file × `ART_SCALE`. Glyph rows stay `cellWidth × cellHeight`. (lane A)
- **New constant `ART_SCALE` = 3/2** (`config/index.ts:825`; 1 before the flip).
  - It is a positive rational, not a whole number.
  - The whole-number check exempts it. A rational check requires its products with the font metrics to be whole.
  - (lane A, W4-3)

### § Frame numbers: the panel rule (`:98`)

- **The rule "Panel widths and heights sized by their 6×8 text stay literal (allow-listed)" is gone.** (lane U; U
  review 1 #5, fixed in `f902ef6`) Now:
  - text-sized lengths are glyph / line terms: `n·GLYPH_W + uiPx(pad)`, menu heights in rows of
    `LINE_H + uiPx(4)`, cursor offsets in cells (e.g. `FRAME_CX − 6·GLYPH_W − uiPx(4)`);
  - art and padding lengths are `uiPx(v)` = ⌈v·`ART_SCALE`⌉ (`core/ui`, `packages/core/src/ui/index.ts:222`);
  - `uiPx` is called at module init or in scene constructors only, never per frame;
  - positions still derive from the centre or an edge;
  - one-pixel lines (borders, underlines, 1-px insets) stay 1 px.
- **U1 removed 7 core allow-list entries**, because their literals are gone:
  - `OPTIONS_PANEL.h`, `ZONE_TALLY_PANEL.w`, `SHIP_PANEL.w`;
  - `WEAPON_PANEL.h`, `ORDER_PANEL.h`, `HI_SCORE_PANEL.h`;
  - `HiScoreScene.drawUi.rankX`.

  (lane U)
- **The allow-list example in this section** (`{ file: 'scenes/index.ts', symbol: 'ZONE_TALLY_PANEL.w', value: 200 … }`)
  names an entry that no longer exists. Use a live one, e.g. `DEMO_FILE_SCHEMA.description.maxLength` 200.
  (found while verifying)

### § Frame numbers: the allow-lists

- **`:128` "R2-01's flip will need four new entries" → A5 added 3 entries for 4 hits.** (A5)
  - `EndingScene.drawCitadel.sink` 360 (`count: 2`);
  - `StoryScene.drawDawn.rise` 360;
  - `weapons` `DIRECTION_HEADINGS` 640.

  The core list has **14 entries** (verified, `packages/core/test/frame-literals.test.ts:48`).
- **`:138` "Its own `ALLOWED` list (22 entries today)" → 32 entries** (verified,
  `test/integration/frame-literals-repo.test.ts:89`). (was: 22, then 23 after C1; lane C review 1 F6, A5)
  - **C1, +1:** `apps/electron/src/main/window-state.ts` `V1_WINDOW_FRAME_WIDTH` 384.
  - **A5, +9:** `apps/tizen/src/bench/matrix.ts` `BENCH_SIZES.id` 640 and 360, `.width` 640, `.height` 360;
    `packages/render-pixi/src/particles/index.ts` `UNITS_PER_DEGREE`, `PRESET_SCHEMA.direction.min`, `.direction.max`,
    `PRESET_SCHEMA.spread.max`, `collectFile.spread` (all 360, degrees).
  - The mirror definitions are still four, with `value: FRAME_W / FRAME_H`: window-state's `FRAME_WIDTH` /
    `FRAME_HEIGHT` and `scripts/frame.mjs` `FRAME_W` / `FRAME_H`.

### § Frame numbers: the scanner's colour rule (W4-11, final form `36fae5f`)

- **The rule:**
  - A string's `#rrggbb` / `#rrggbbaa` tokens are blanked before numbers are matched:
    `HEX_COLOUR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})\b/g` (`packages/core/test/helpers/frame-literal-scan.ts:154`).
  - A short `#rgb` / `#rgba` is read as text, so `'#384'` still counts. 5-, 7- and 9-digit runs are read as
    numbers.
  - (lane C fix 2, lane C review 3)
- **This replaces lane C fix 1's interim rule** ("`#rgb` only when its digits are no frame number", `0b2459a`).
- **Optional code wording:** the inline comment at `frame-literal-scan.ts:198`, "A hex colour token (`#336a64`)", could
  say "A long hex colour token". (lane C review 3)

### § Frame numbers: the mirrors paragraph

Add to the mirrors:

- **`test/e2e/frame-pixels.ts`** (C4, lane U, C5):
  - it re-exports `GLYPH_H` and `LINE_H`;
  - `UI_ART_SCALE: number = GLYPH_W / 6` (`:116`) and `uiPx` (`:126`), pinned to core in
    `test/scripts/frame.test.ts:183` and `:186`.

  `scripts/frame.mjs` has no `ART_SCALE` (verified).
- **`test/e2e/save-format.ts` `SAVE_FORMAT = 3`**, pinned to core's `SAVE_VERSION` by
  `test/integration/e2e-save-format.test.ts`. (lane A fix 2)
- **`test/e2e/gates.ts` `REPLAY_FORMAT = 2`**, a mirror of `REPLAY_FORMAT_VERSION`, pinned by
  `test/integration/e2e-gates.test.ts`. (C5)

### § Frame numbers: the rest

- **`test/e2e/frame-layout.spec.ts` (C4, `da31578`, 8 tests) is R1-04's deferred browser check of the font cell.**
  It is written only in frame constants and passes unedited at 384 (6×8, ×3) and at 640 (9×12, ×2), on the web and
  Tizen `file://` builds. (lane B→C)
- **"Through R1 it stays green without an edit" (`:160`) is now history.** R2-01 re-pinned the presentation
  fingerprint three times:
  - `72b18a1`: 119 / 119 segments;
  - `49a8f3f`: 35 / 119;
  - `5d5a050`: 16 / 119, `ui` only.

  The walks are content-independent since R2-01. (A5)
  - The "a game" walk runs in god mode (`test/integration/presentation-fingerprint.test.ts:987`).
  - The attract walk plays two in-test demos recorded by `recordWalkDemo` (`:781`, used at `:1168-1169`): a KESTREL
    zone A demo (seed 101, 2,400 ticks) and a MANTA zone B demo (seed 102, 600 ticks).
  - The shell frame fingerprint was re-pinned at A5 (5 / 5) and at `c2a9ed5` (3 flight walks).

### New paragraph: "Gates (R2-01 → R2-03)" (lane A, lane A fix 1 / fix 2, A3 fix 1, C5 fix 1)

- **Rule W4-1.** Each gate skips while its condition holds and throws once the condition is gone. Fixture-caused
  failures are fixed, never gated. Only the content-caused assertion is gated. Examples:
  - `dispatch-fx-runtime`'s two kill counts;
  - `powerups-direct`'s drop count, split into its own `itPortPending`;
  - only checkpoint 0 of `zones-fg-runtime`'s gallery case.
- **`CONTENT_PORT_PENDING`** (`packages/core/test/helpers/port-pending.ts:57`) holds while some shipped tileset's
  `tileSize` ≠ `TILE_SIZE`.
  - Its exports: `shippedTileSizes`, `PORT_PENDING_REASON` (`:79`), `itPortPending`, `describePortPending`.
  - **Expiry:** `checkPortPendingExpiry(frameW, pending)` (`:70`), called at import (`:76`). It throws "R2-02 ported
    the content: delete port-pending.ts and its uses". It is tested in `port-pending.test.ts` (3 cases).
- **`GOLDENS_STALE`** lives in `test/golden/stale.ts`, re-exported by `golden.ts`.
  - `goldenIsStale` (`:57`): format ≠ `REPLAY_FORMAT_VERSION`, or frame ≠ `FRAME_W×FRAME_H`.
  - `GOLDENS_STALE` (`:127`) is never true under `SHMUP_GOLDEN_UPDATE=1`.
  - **Expiry:** `checkStaleGateExpiry` (`:111`), called at `:121`. It spares the re-bless run.
  - Its inverse is `packages/core/test/replay/replay-version-shipped.test.ts`.
- **Test names carry the reason:** `[R2-01 gate: skipped while R2-02's content port is pending]` or
  `[R2-01 gate: skipped while the goldens are stale, until R2-03]`.
- **The dimension / raster pattern:**
  - the art checks run ungated: atlas frames against the generators' sizes at `INTERIM_ART_SCALE` via `scaleLength`
    (⌈s·n⌉);
  - the content-against-drawn-art checks are gated.

  (lane A fix 1)
- **The e2e gates** (`test/e2e/gates.ts`, C5 + C5 fix 1 `293e885`):
  - `R2_03_PENDING` with `CONTENT_REASON` / `GOLDEN_REASON`;
  - `PORT_UNMEASURED` with `PORT_REASON`;
  - `recordingIsStale`, `contentPorted`, `resolveGates`;
  - the self-expiry `checkGateExpiry`;
  - `assertionsGated(info, gate, what, reason)`, which pushes a `skip` annotation onto the test's report.

  They are pinned by `test/integration/e2e-gates.test.ts` (10 tests; it imports `port-pending.ts` statically at
  `:15`). The full inventory is in Appendix A (b).
- **`scripts/golden-update.mjs` refuses to run** ("golden:update refused: N shipped tileset(s) are not at
  TILE_SIZE 12 …", `:46`) while the content port is pending. This is pinned by `test/golden/golden-edge.test.ts:189`.
  (lane A)
- **The TS2367 trap.** A constant compared with a v1 literal must be typed `number`, or the comparison does not compile
  at the other frame. Examples: `V1_FRAME_W: number` in both gate helpers, `(core.FRAME_W as number) === 384` in
  `frame.test.ts` / `window-frame.test.ts`. (lane C fix 1 F1 / F2)

### § Tests (A3, A5 fix 1)

- **A fixture stage the ship flies in is one playfield tall:** `rowsTall: PLAYFIELD_H / tile`, the map
  `length + PLAYFIELD_W` wide. The fly-in row is `SPAWN_Y` = `PLAYFIELD_H / 2`, and the ground snap searches from it.
- **Off-screen and cull positions derive from `PLAYFIELD_W/H`** plus `SHOT_CULL_MARGIN` / `ITEM_CULL_MARGIN` /
  `DEFAULT_BLOCK_SCREEN_X`.
- **A heightfield floor reaches its `base` only after `base / tile` columns of ramp.**
- **Tile-row ↔ pixel conversions in tests read the content's own tile size** (`map.tileSize`, `tileset.tileSize`),
  not `TILE_SIZE`. `TILE_SIZE` is already 12, while the content stays 8 until R2-02.

### § Tests: e2e waits count ticks (C5 review 2, `c67c7c9`; C5 fixes 3 and 4, `8ff2bf6`, `543887b`)

- A spec that waits for the game counts ticks, never wall time or rAF frames:
  - a scene wait is a tick budget (`test/e2e/ticks.ts` `waitTicks` / `expectScene`, e.g.
    `STAGE_CLEAR_DELAY_TICKS + SCENE_SLACK_TICKS`); a fly-in or a one-tick event is polled in ticks
    (`pollTicks(SHIP_ENTER_TICKS + SCENE_SLACK_TICKS)`, `pollTicks(SCENE_SLACK_TICKS)`);
  - a key sequence checked against a host-time window goes in one `page.evaluate` (`ticks.ts` `remoteSequence`);
  - a still-ship check freezes the sim and compares edges the fx cannot reach (`flight.spec.ts` `HullView`);
  - a boot wait is wall-clock work and takes `{ timeout: BOOT_TIMEOUT_MS }` (`ticks.ts`).
- `test/e2e/ticks.ts` mirrors core's `STAGE_CLEAR_DELAY_TICKS` 90, `MAP_LAUNCH_TICKS` 60 and the other scene-flow
  delays, pinned to core by `test/integration/e2e-ticks.test.ts` (and `SHIP_ENTER_TICKS` 40 to the content's longest
  `enterTicks`, `content/player/*.player.json`); only `SCENE_SLACK_TICKS` and `BOOT_TIMEOUT_MS` are the specs' own.
  `attract.spec.ts` still keeps its own unpinned mirrors (`TITLE_ATTRACT_TICKS` 720, `DEMO_TICKS` 2400,
  `HI_SCORE_PAGE_TICKS` 300). (found while verifying)

## docs/dev/api-reference.md

### New rows (lane A, lane U, lane B→C, lane A fix 1, scout §9)

- **core:**
  - `ART_SCALE` (3/2);
  - `uiPx(v)` (`core/ui`; RangeError on a negative or non-whole input);
  - `ReplayVersionError` (extends `RangeError`; `reason` `'format' | 'frame'`, `recordedWidth` / `recordedHeight`)
    and `ReplayVersionReason`;
  - `classifyRunReplayText(text)` → `RunReplayTextKind` `'ok' | 'legacy' | 'invalid'`;
  - `ReplaySummary.legacy`, `ReplayStoreResult.Legacy` (= 4);
  - `SaveData.legacyScores`.
- **core scenes:** `CreditsScene.duration` (a getter, `packages/core/src/scenes/index.ts:7573`). (U fix 1)
- **apps/web:** `pastedReplayNotice(result, text)`, `createPageNotice(win, durationMs?)` / `PageNotice`,
  `PAGE_NOTICE_MS` (4000). (lane A fix 1, `37785f1`; verified `apps/web/src/boot/index.ts:212-256`)
- **apps/electron:** `WINDOW_STATE_VERSION` (2), `V1_WINDOW_FRAME_WIDTH` (384). (C1)
- **scripts:**
  - `scripts/assets/interim.mjs`: `INTERIM_ART_SCALE` (3/2, `:45`), `parseArtScale`, `scaleLength`, `scaleImage`,
    `scaleAnchor`, `scaleSprite`, `scaleFont`;
  - `buildAtlas` / `collectSprites` `{ artScale }`;
  - `SpriteDef.native` and `makeSprite({ native })`;
  - `GeneratorOptions { tileSize?, artScale? }` (`procedural/index.mjs:47-55`).

### Changed rows (verified)

| Row | Says now | Should say |
|---|---|---|
| `SAVE_VERSION` (`:1242`) | `2` | 3 (migration 2 → 3, `migrateV2`) |
| `GLYPH_W`, `GLYPH_H`, `LINE_H` (`:83`) | 6 / 8 / 10 | 9 / 12 / 15 = font file × `ART_SCALE` |
| `CREDITS_SCROLL_TICKS` (`:1189`) | "ticks per pixel of scroll" | ticks per **step**; a step moves the rows `ART_SCALE` px (`SCROLL_HALVES`) (U fix 1) |
| `CREDITS_ROW_HEIGHT` (`:1189`), `STORY_ROW_HEIGHT` (`:1198`) | `11` | `LINE_H + uiPx(1)`, 17 at 640×360 |
| `PREVIEW_SHIP_X` (`:1209`) | `232` (`FRAME_CX + 40`) | `FRAME_CX + uiPx(40)`, 380 |
| `MAX_STORY_LINE_LENGTH` (`:312`) | ⌊(`FRAME_W` − 144) / `GLYPH_W`⌋ | the text panel's own margins at the art scale: 47 at 640 (U review 1 #6) |
| `MAX_ENDING_LINE_LENGTH`, `MAX_CREDITS_LINE_LENGTH` (`:318`) | ⌊(`FRAME_W` − 144) / `GLYPH_W`⌋, ⌊(`FRAME_W` − 24) / `GLYPH_W`⌋ | the same panel-derived caps: 47 / 67 at 640 (U review 1 #6) |
| `listenForPastedReplays(win, importText)` (`:1694`) | no callback | `(win, importText, onResult?)`; a `Legacy` result shows a page notice (lane A fix 1) |
| `terrain.mjs` `TILE_SIZE` (`:1887`) | `8` | 12 since R2-01 |

About the caps: `MAX_ENDING_LINE_LENGTH` = `MAX_STORY_LINE_LENGTH` = `TEXT_PANEL_LINE_LENGTH`. They are no longer
R1-01's 55 / 68 at 640 (lane U, U review 1 #6). Verified at `packages/core/src/data/campaign.ts:125-185`:

- the margins are `⌈40·ART_SCALE⌉`, `⌈32·ART_SCALE⌉` and `⌈12·ART_SCALE⌉`;
- at 640 they are 60, 48 and 18;
- so ⌊(640 − 2·108) / 9⌋ = **47** and ⌊(640 − 36) / 9⌋ = **67**.

## docs/dev/scenes-and-ui.md (lane U, U fix 1, U3, U3 fix 1; lines verified at `bc8e05d`)

### § "Laying screens out from the frame (R1-01)" (`:306`)

- **`:328-332` (the "panel literals" bullet) is replaced.** Text-sized lengths are glyph / line terms; art and
  padding are `uiPx`. Per-scene frozen `*_LAYOUT` objects hold them:
  - title, clear, zone tally, game over, difficulty, continue;
  - ship, weapon and order, map;
  - ending, ending scene, story scene;
  - name entry, hi-score, input test, replays, replay end.
- **The weapon select's panel grows with its rows:** `WEAPON_PANEL_H = uiPx(22) + 10·WEAPON_LINE_H + uiPx(40)`. The
  order editor matches it. (The plan said "R2-01 decides".)
- **The sprite scenes are scaled:**
  - positions are `uiPx` constants;
  - the signed tables (`CITADEL_BLASTS`, `INVASION_BLASTS`, the bubble x's) are scaled once by `uiOffsets`;
  - motion is `(px · ART_HALVES) >> 1`, with `ART_HALVES = 2·ART_SCALE` asserted whole at init, so nothing
    fractional is computed per frame;
  - tick timers are unchanged.
- **`:336`:** the title's hi-score line is at `FRAME_H − uiPx(20)` (`scenes/index.ts:1799`), not `FRAME_H − 20`.
- **`:345-346`:** credits and story rows are `LINE_H + uiPx(1)` apart, not `LINE_H + 1` (11).
- **`:349-352` ("kept top-anchored … float mid-screen") is superseded by U3 (`49a8f3f`):**
  - **The story panel** is centred between the scenes' lowest row (the dawn's sea, 186) and the bottom edge, at
    210..336 at 640. The window stays `uiPx(4)` inside it and keeps its height: 7 rows,
    `6·STORY_ROW_HEIGHT + GLYPH_H`, 114 px at 640 (216..330).
  - **The epilogue panel** fills the room under the scene with v1's 4-px margins: `y = ENDING_SCENE_BOTTOM + uiPx(4)`,
    `h = FRAME_H − ENDING_SCENE_BOTTOM − 2·uiPx(4)`. That is 124 / 88 at 384 and 186 / 168 at 640. Its top stays
    because the scenes use it as a mask: the citadel's sun and the sinking citadel and ARK.
- **`:362-366` (the campaign caps):** the panel-derived 47 / 67 at 640, not 55 / 68. (U review 1 #6)
- **The four es fixes** (`87acfdb`): a longer label pushes what follows it. The English output is unchanged.
  - the HUD caravan clock (`TIEMPO`);
  - name-entry `TIEMPO`;
  - input-test `DISPOSITIVO`;
  - practice `PUNTO DE CONTROL`.
- **The title cursor and the difficulty row are built per language at scene creation** (U3):
  - the title cursor (`titleMenuLayout`, `scenes/index.ts:1772`, `TITLE_MENU_MIN_CELLS` 10) is 260 at 640 in en / ja
    and 242 in es;
  - the difficulty CONTINUES / lives row is built from field initialisers. es reads `VIDAS 3   CONTINUACIONES 3`.
- **The title's session hi-score line** (U3 fix 1, `5d5a050`, replaces U3's first rule):
  - it shows under every screen opened over the title, as in v1;
  - it hides under the Options pages (controls, rebind, input test, display, game, extras) and the difficulty menu
    (`hidesTitleHi`, `scenes/index.ts:2421`).

### Other sections

- **`:172` (the `CreditsScene` row) and the credits / story text** (U fix 1):
  - the scroll moves `ART_SCALE` px a step (`SCROLL_HALVES = ART_HALVES`, scroll = `(steps·SCROLL_HALVES) >> 1`);
  - durations stay in v1 ticks within 5 %: story 1,046 → 1,074 ticks (+2.7 %), credits 1,990 → 2,060 (+3.5 %);
  - `SCROLL_HALVES` (`scenes/index.ts:7481`) is the one constant: 2 restores one pixel a step (story 1,566 and
    credits 2,970 ticks at 640).
- **§ The HUD (`:478-490`):**
  - the caravan clock's seconds follow `TIME` and `HUD_LABEL_GAP`, like the scores ("TIME 5", not "TIME5");
    `HUD_CLOCK_DX` is gone (U3);
  - the "HUD art's own sizes … stay literals" sentence (`:487-488`) is now `uiPx` (U1);
  - the parenthesised numbers in this section are v1's.
- **The layout test** (`packages/core/test/ui/ui-layout-frame.test.ts`) walks every scene in en / es / ja. It checks:
  - every text inside the frame;
  - no UI / UI, HUD / HUD or UI / HUD overlap (`frameProblems`);
  - every text inside its panel.

  `KNOWN_LAYOUT_PROBLEMS` and the `-flip` twin are deleted (U3). The test asserts zero problems.

## docs/dev/zones-h-and-i.md

- **`:432-433`:** the `endings[].text` and `credits` caps quote R1-01's ⌊(`FRAME_W` − 144) / `GLYPH_W`⌋ and
  ⌊(`FRAME_W` − 24) / `GLYPH_W`⌋. At 640 they are the panel-derived 47 / 67 (still 40 / 60 at v1). (U review 1 #6)

## docs/dev/saves-and-options.md (lane A, scout §9)

- **Save format 3** (`SAVE_VERSION` 3, `packages/core/src/save/index.ts:119`), with the migration step 2 → 3
  `migrateV2`.
- **`legacyScores`:**
  - it is read-only;
  - it is sanitised like `hiScores`, with its own `MAX_HI_SCORE_TABLES` and no `__proto__`;
  - it is written only when non-empty;
  - `recordScore` / `renameScore` never touch it.
- **The v1 tables are archived:** v0, v1 and v2 documents all move their tables into `legacyScores`, and v2 starts
  with empty tables (W4-13). There is no UI for them in R2-01 (W4-8).
- **W4-14:** a v1.x build reading a v3 save falls back to defaults and copies the text to `save.corrupt`.
- **Steam's achievements** read `hiScores ∪ legacyScores` (`apps/electron/src/main/steam.ts` `bestIn`).
- **The e2e mirror** `test/e2e/save-format.ts` `SAVE_FORMAT = 3` is pinned by `e2e-save-format.test.ts`. R2-02 must
  not bump any format. (precheck §2.18)

## docs/dev/debug-and-replays.md and docs/dev/extra-modes-and-replays.md (lane A, lane A fix 1, A6, A6 fix 1)

- **The replay formats:** `REPLAY_FORMAT_VERSION` 2 (`format.ts:47`) and `RUN_REPLAY_FORMAT_VERSION` 2
  (`run.ts:87`), bumped by the flip.
- **`ReplayVersionError`:**
  - a `'format'` refusal for an older format;
  - a `'frame'` refusal when `internalWidth/Height` ≠ `FRAME_W/H`;
  - format 0 or a newer format stays a plain `RangeError` ("not supported").
- **Its message wording:**
  - `replay recorded at 384×216 (v1, format version 1) cannot play at 640×360`;
  - "(an older build, format version N)" for any later older format;
  - "(another frame)" for a frame-only mismatch.
- **The run-replay library never auto-deletes a v1 slot:**
  - `load` keeps it with a `legacy` summary;
  - `replay()` is null, `keep` returns −1, `importText` returns `Legacy`;
  - `remove` works;
  - a kept legacy text counts toward `MAX_KEPT_REPLAY_TEXT`.
- **The browser** shows `V1 REPLAY`, greyed, with no score:
  - PLAY / KEEP give `RECORDED BY V1: CANNOT PLAY` and `PowerUpDenied`;
  - SHARE is disabled ("delete only", W4-7);
  - DELETE works.
- **A pasted v1 replay on the web** is refused with a DOM page notice: `role="status"`, 4 s, the player's language,
  `replayFromV1`.
- **The attract loop skips refused demos** until R2-03 (W4-9).
- **The tests:**
  - `packages/core/test/replay/replay-version.test.ts` (16 tests, permanent);
  - its v1.0.0 fixture `packages/core/test/replay/fixtures/run-replay-v1.json`, never re-blessed;
  - `replay-version-shipped.test.ts` (**73 tests**, deleted by R2-03 with `stale.ts`; was: 76 before A6 fix 1 moved
    3 cases out);
  - `apps/web/test/boot/replay-share.test.ts`.

  (test counts verified by the full run)
- **Do not copy A6's reason for not importing `stale.ts`** ("a second module instance would break `instanceof`").
  It does not hold. The real reasons are the dependency direction and the throw on import. (A6 review 1)

## docs/dev/asset-pipeline.md (lane B→C, lane B fix 2, scout §9)

- **The interim stage:**
  - `scripts/assets/interim.mjs` `INTERIM_ART_SCALE` (3/2), pinned to core `ART_SCALE` by `terrain-size.test.ts`;
  - the exact-fraction scalers: sizes ⌈s·w⌉, anchors ⌈s·a⌉, source pixel ⌊2d/3⌋ at 3/2;
  - `buildAtlas` / `collectSprites` `{ artScale }` (default `INTERIM_ART_SCALE`; scale 1 = the v1 art at either
    frame);
  - `generateAssets` builds only the default scale.
- **Never upscaled (W4-5, amended by `16aff20`):**
  - the terrain tilesets (drawn natively at 12 px);
  - `ui/pixel`;
  - the laser beams `lasers/beam-*` and their `@<palette>` variants: `lasers.mjs` draws them at the build's art scale,
    8 frames of 4×8 at 1 and 12 frames of 6×12 at 3/2, frame k a band k + 1 px tall;
  - real-art PNG overrides;
  - sources with `"native": true` (`makeSprite({ native })`).
- **`GeneratorOptions` is `{ tileSize?, artScale? }`;** terrain uses `generate({ tileSize })`.
- **Frame counts are unchanged except the beams'** (+4 each at 3/2). The atlas at 640:
  - 438 sprites and 1,459 frames (v1: 1,411);
  - 139,944 B of PNG;
  - pages: main 1024² (common), zone pages 256² / 512×128 / 512×256 / 256×512 (verified by `pnpm assets`);
  - `main.json` 204,869 B (B3).
- **The `artScale: 1` consumers (W4-6):**
  - the TV bench atlas, for good;
  - the CJK figures;
  - the store icons;
  - the doc images, until R2-03.
- **`ATLAS_PNG_BYTES_CAP`** (256 KiB) now lives in `test/scripts/assets/atlas-budget.ts:15`.
- **Stale future tense:** `:210` "(R2-01's interim ×1.5, R4-03's redraw) changes the file and those three constants
  together". As built, the font file did not change: the pipeline scales it (`scaleFont`), and the constants are the
  file × `ART_SCALE`. `:706` also speaks of the interim art as future. (found while verifying)

## docs/dev/build-test-deploy.md

- **`pnpm golden:update` refuses** while the content port is pending (`scripts/golden-update.mjs:46`). (lane A)
- **The e2e timing at 640×360** (C5): SwiftShader makes the e2e about ×1.8 slower per test on CI, so the shards take
  up to about 6 min. The paragraph is at `:670-677`.
- **The TV bench's decode scenario** (`:305-307`): since the flip, its `common` and zone A pages are the ×1.5 shipped
  pages, so decode rows before and after the flip are not like for like (R0-03). `bench-decode.mjs`'s docblock already
  says so (`ee08b66`). (lane B→C, lane B review 1 #4)
- **`pnpm docs:images --check`** flags `docs/images/logo.png` until R2-03. It is not in CI. (lane B review 1 #2)

## docs/dev/platform-polish.md and docs/client/desktop-app.md (C1, lane C review 1 F9, scout §9)

- **`window.json` version 2** (`WINDOW_STATE_VERSION`):
  - a version-1 file's scale is converted with `max(1, round(scale × 384 / FRAME_WIDTH))`, so ×3 → ×2, ×5 → ×3,
    ×10 → ×6, ×1 → ×1;
  - an invalid v1 scale gives the default;
  - fullscreen and the position are kept;
  - any other version is read as is.
- **The window sizes:** the default is ×2 = 1280×720 and the maximum ×6 (⌊3840 / 640⌋).
- **Stale lines:**
  - `platform-polish.md:149` (`WindowState { version: 1`), `:157-158` ("3 (1152×648) and 10 today"), `:173` ("×3
    today");
  - `desktop-app.md:35` (1152×648 at ×3), `:42` (×4 = 1536×864, ×5 = 1920×1080), `:44` (×3), `:48`.
- **The F9 caveat:** from `346c430` until the flip `72b18a1`, local desktop dev builds wrote version-2 files counted
  in 384-px frames. A flipped build reads them as 640-px frames: the window comes out ×5/3 wider and is then fitted to
  the screen. Released v1 writes version 1, which converts correctly.

## docs/dev/rendering-and-shell.md (and visual-and-mechanic-extras.md for the CRT)

- **The upscale is ×3 on 1080p and ×2 on 720p** (×4 on 1440p, ×6 on 4K). Stale 384×216 / ×5 text at `:33`, `:48`,
  `:176`, `:370`, `:747`, `:838`, `:977`, `:998`.
- **The CRT pitch at 640×360:**
  - 3 on 1080p and 2 on 720p;
  - the 4K legacy filter runs at 0.5 resolution, an effective pitch of 3;
  - C2 added the render-pixi cases.

  The pitch prose is in `visual-and-mechanic-extras.md:155-157`. (lane B→C)
- **The dev scenes share `STAR_TILE_SIZE`** (`packages/shell/src/flight/index.ts:133`, `Math.ceil(128 × ART_SCALE)` =
  192). Showcase and fx-gallery import it from flight. (lane C fix 1 F8)
- **The free-flight dev HUD follows core's interim layout** (`c2a9ed5`, C5):
  - `GLYPH_W` widths and `uiPx` gaps;
  - the WARNING band at `FRAME_CY − uiPx(8) − uiPx(48)/2` (row 132);
  - life icons `uiPx(10)` apart from `uiPx(4)`, row `HUD_BOTTOM_Y + uiPx(1)`.

  R4-03's HUD redesign must cover `packages/shell/src/flight/index.ts` too.

## docs/client/ (player-facing; found while verifying, no report asked for it)

- **`docs/client/extra-modes-and-replays.md`, Sharing (`:191`):** a pasted v1 replay is refused with a notice, and the
  REPLAYS list shows a kept v1 replay as `V1 REPLAY` (delete only).
- **Somewhere player-facing:** v1's hi-scores are archived and v2's tables start empty (W4-13).

## docs/images/logo.png

- **It is stale until R2-03.** `doc-images.mjs` `buildLogoBanner` is `FRAME_W` wide. Verified: `node
  scripts/doc-images.mjs --check` lists exactly this one file. R2-01 must not regenerate it; R2-03 does. (lane B review
  1 #2, B3)

## test/README.md (C5, lane B→C, lane B fix 1; verified)

- **Missing rows** for:
  - `integration/e2e-gates.test.ts` (10 tests);
  - `integration/e2e-save-format.test.ts` (1);
  - `e2e/frame-layout.spec.ts` (8);
  - the helpers `e2e/gates.ts`, `e2e/save-format.ts` and `golden/stale.ts`.
- **The interim rows are already there** (`:80`, added in `ee08b66` and extended in `16aff20`).
- **Optional present-tense history:** `:79` "(R2-01 flips both)" and `:45` "before R2-01 flips the frame". (sweep
  review)
- **The core test helpers belong in `packages/core/README.md`**, which lists core's test helpers (`alloc.ts` at
  `:147`); `test/README.md` covers only the root `test/` tree. The core items, deleted ones included (lane U, U fix 1,
  U3):
  - `helpers/frame-metrics.ts`, `layout-walks.ts` (`frameProblems`, `SCENE_IDS`, `expectedScenes`), `hud.ts`,
    `scene-layout.ts`;
  - `port-pending.ts` (+ `port-pending.test.ts`), `v1-replay.ts`;
  - `scenes/scenes-front-end-layout.test.ts`, `scenes/scenes-scroll-frames.test.ts`;
  - gone: `KNOWN_LAYOUT_PROBLEMS` and `ui/ui-layout-frame-flip.test.ts`.

## scripts/README.md

- **`:12` (the `assets/interim.mjs` row):** the importer list names only "the asset tests and
  `integration/cjk-budget.test.ts`". `test/integration/dimension-runtime.test.ts:28` and
  `raster-range-runtime.test.ts:37` import it too. Widen it to "and tests". (lane B review 3)

## CHANGELOG.md (found while verifying)

- **There is no R2-01 entry.** `[Unreleased] — v2` → "Engine and tooling" says "Nothing here changes what the game
  shows or does" and quotes `FRAME_W` / `FRAME_H` (384 / 216). R2-01 needs its own lines:
  - the 640×360 frame and the interim ×1.5 art and font;
  - save format 3 with `legacyScores`;
  - replay format 2 and the v1 refusal;
  - `window.json` v2;
  - the gates.

## plan_resolution.md

### R2-01 As built (for the docs agent; the §17 status cell is set when the step closes)

- **Commits, in order:**
  - **pre-flip prep at 384:**
    - lane A: `8d89dd2` A0 `ART_SCALE`, `b93b326` A1 save v3, `691a79e` A2 replay refusal, `31c49c7` A4 gates;
    - A3 (core sim tests): `b1656b9`, `9259818`, `f6a2426`, `f858784`;
    - lane B→C: `31c0a34` B1, `346c430` C1, `f7bcd33` B2, `20a5b00` C3, `da31578` C4, `6133d72` and `68c2a3a` C2;
    - lane U: `92120c7` U1, `87acfdb` and `29d7d3c` U2;
    - review fixes: `0a4ad3f`, `675bcc1`, `ee08b66`, `8672c5a`, `5b7c7af`, `0b2459a`, `2877785`, `cdaa1e3`, `37785f1`,
      `f902ef6`, `16aff20`, `732c1fe`, `779c0fc`, `36fae5f`, `82051be`, `d4de048`;
  - **the flip:** `72b18a1`;
  - **post-flip:**
    - A6: `696f067`, `e56d4c0`, `9c91b01`;
    - A5 fixes: `9a4c315`, `9e725e2`;
    - U3: `49a8f3f`, `5d5a050`;
    - C5: `c2a9ed5`, `93f6391`, `e7ff5db`, `293e885`, then C5 fix 2 `c67c7c9` (after C5 review 2);
    - comment sweeps: `4b6930a`, `3623be2`, `bc8e05d`;
    - `ac40436` (the §17 row).
- **The flip commit body is wrong on two causes** (A5 review 1 #2, #3; it cannot be amended):
  - **The content-DB re-pin** (`core.stages` only, both tables) came only from the map widths: `terrain.cols` +32 and
    32 empty tile columns in the 17 terrain stages. The boss / spawn / block defaults played no part. The shipped hash
    went `d6fa1ca40cde8817` → `1c02c14c0a4a7047`, the examples `75374beda8914daf` → `26f2e401282941b6`. No boss,
    spawn or block default reaches `core.stages`.
  - **The 3 `screen`-hash moves** (attract, runA, runB) come from the story crawl and the credits running longer
    (`attract.story` 1,046 → 1,074 frames, `runA` / `runB.credits` 1,989 → 2,059), not from frame-sized effects.

  (both unverified here: reviewer measurements)
- **`49a8f3f`'s body credits `es.options` / `es.game` only to the HI rule.** Both also moved from the es title cursor
  fix ("title cursor + HI (+ difficulty row)"). `5d5a050` left `es.options` as `49a8f3f` pinned it, and gave
  `es.game` / `ja.game` new values. (U3 review 1 nit 3, U3 fix 1)
- **The presentation fingerprint re-pins:**
  - `72b18a1`: 119 / 119 segments (ui 113, hud 81, world 87, screen 3), after the two walk fixes (god-mode game walk,
    in-test demos);
  - `49a8f3f`: 35 / 119 (all `ui` but the caravan's `hud`);
  - `5d5a050`: 16 / 119, `ui` only.

  Shell frame fingerprint: 5 / 5 at A5, then 3 flight walks at `c2a9ed5`.
- **Allow-lists:** core 14 entries (+3 entries / 4 hits); repo 32 (+1 C1, +9 A5). Not R1-01's "four entries".
- **The skips at `bc8e05d`** (verified by a full run): `GOLDENS_STALE` 239 · `CONTENT_PORT_PENDING` 80 · frame
  `runIf` 41 = 360. 0 failed. (was: 81, until A5 fix 1 split `zones-fg-runtime`)
- **The interim art is built differently from the plan's scope text** ("a pipeline stage `interimScale: 1.5`"):
  - it is core's `ART_SCALE` plus `scripts/assets/interim.mjs` `INTERIM_ART_SCALE` and the `artScale` option;
  - the beams are drawn natively (above).
- **R2-01's own notes that did not happen:**
  - "`ATLAS_PNG_BYTES_CAP` will likely be exceeded": no. 139,944 B is under 262,144 B, and the cap moved to
    `atlas-budget.ts`.
  - "the live M3-03 figures change … `cjk-budget.test.ts` fails until the six documents are updated": no. W4-6 keeps
    the CJK figures on `buildAtlas({ ungrouped: true, artScale: 1 })` (`cjk-budget.test.ts:58`), so the figures and
    the six documents stand. R2-03 decides whether the docs quote the v2 atlas.
  - "re-check the TV bench's 1 / 1 / 2 pages": they held (v1 art for good, B3).
- **Other R2-01 notes, as built:**
  - **`mode7.spec`'s classic-window case** was fixed in `293e885`: the blit test runs on its own `3·FRAME_W × 3·FRAME_H`
    viewport (`BLIT_DISPLAY`, `mode7.spec.ts:76`), and every aspect mode is ×2 or more there.
  - **The webOS / web / Tizen boot-wiring fakes** are frame-independent (C2).
  - **The render bench's ×2 scenario** is 1280×720 with an 8192 KB target, and passes.
  - **`TEXTURE_BUDGET_BYTES`** is 23 MiB at 640 (`packages/shell/src/memory/index.ts:261`).
- **R1-04's note (plan `:1019`) "Between R2-01 and R2-02 `tile-size.test.ts` is red"** did not happen. A4 rewrote it as
  the "never mixed" check with a pending branch, and it is green at `bc8e05d`.
- **Story and credits durations** are within 5 % of v1 (+2.7 % / +3.5 %), not equal. The docblocks
  `packages/core/src/scenes/index.ts:1649`, `:7474` and `:7651` still say "as long as at the v1 frame". (A5 review 1
  #3; still open)
- **The builds at `bc8e05d`** (Tizen verified here):
  - Tizen `app.js` is 1,432,504 B raw and 386,228 B with gzip -9. check-bundle reports "380.2 KB gzip of 512.0 KB,
    15 files, 1742.0 KB of 8192.0 KB". (was: 379.9 KB / 1741.2 KB at the flip, B3)
  - webOS: 379.9 KB gzip of 512, 16 files, 1737.8 KB (C5 at `e7ff5db`, unverified).
- **The bench at the flip:** `pnpm bench` passed 41 / 41; zones A–I medians 0.50–0.56 ms/tick; render worst case
  p95 3.1 ms, 9 draw calls. (A5, unverified)
- **CI at `bc8e05d`** (run `39156155873`, verified with `gh`): every job is green except e2e 1/5, which failed 3 tests
  (`campaign-run.spec.ts:241`, `:355`, `debug-tools.spec.ts:233`). The same 3 failed on `ac40436` (`39154793108`);
  `3623be2` (`39119741233`) was green. Context is in Appendix A (d).
- **C5 review 2** (of `293e885` + `bc8e05d`, plus the flake triage) confirmed every C5 review 1 and sweep-review fix
  and found 3 should-fix items and 1 nit, all in e2e specs that paced the game in rAF frames or wall time. The flip
  slowed SwiftShader about ×1.6, so they failed on slow runners. **C5 fix 2 (`c67c7c9`, test files only)** fixed all
  four:
  - **S1, `campaign-run.spec.ts`** (CI's `:241` web and `:355` Tizen): the four `stageClear` waits gave
    `STAGE_CLEAR_DELAY_TICKS` 90 (at ≤ 4 ticks a frame) the default 5 s, and the web test's 180 s covered ~820 rAF
    frames. Reproduced on 4 CPUs (`taskset -c 0-3`, `E2E_WORKERS=2`) and on 2. Now every wait counts game ticks
    (`gameTick`, `waitTicks` on `__shmupDebug.tick`, `expectScene(page, scene, ticks)`): the tally gets 90 + 30
    (`SCENE_SLACK_TICKS`), the map launch `MAP_LAUNCH_TICKS` 60 + 30, a tap holds 3 ticks and releases 6. The web test
    timeout is 420 s.
  - **S2, `debug-tools.spec.ts`** (CI's `:233`): the Tizen unlock Pause + Ch+ ×3 took 18 rAF frames against the shell's
    3 s `DEBUG_UNLOCK_WINDOW_MS`. Now `remoteSequence` sends the four keys in one `page.evaluate`.
  - **S3, `flight.spec.ts`** (the myadmin1 flake, `:114` then): the idle check compared hull centroids that the
    autofire's muzzle sparks shift. The `muzzle` preset spawns at `"dx": 9` (`content/fx/particles.fx.json:287`), a v1
    offset, while the ×1.5 KESTREL's nose reaches x + 12. Now `freezeSim` + `stepTo`, the moves use `holdTicks`, and
    `shipCentre` returns a `HullView` whose tail column and top / bottom rows are compared.
  - **N1, `raster.spec.ts:237-239`**: the comment gives playfield rows 112 … 151 / 152 … 199 and their frame rows at
    640×360 (124 … 163 / 164 … 211) and at 384×216.

  Its four specs passed 14 / 14 under the lock (2 workers, unpinned). Open when it was pushed: the `taskset -c 0-1`
  repeat of campaign-run and debug-tools, the myadmin1 run of the four specs with `--repeat-each=4`, and C5 review 3.
  These are wave 0's exit, or `R2-01.F1`.

### Decision register

- **The register has no W4-* row** (verified: 0 hits in `plan_resolution.md`). Code cites them, e.g. `test/e2e/gates.ts`,
  `test/golden/stale.ts`, `core/save`, `core/replay`, `core/ui`, `core/scenes` and the scanner. Add **W4-1 … W4-14**:
  - **W4-1:** self-expiring gates `CONTENT_PORT_PENDING` (until R2-02) and `GOLDENS_STALE` (until R2-03), each
    throwing once its condition is gone; fixture-caused failures are fixed, never gated.
  - **W4-2:** prepare at 384, flip last in one atomic commit (A5).
  - **W4-3:** core `ART_SCALE` (1 → 3/2) and `uiPx(v)`; the font pin = file × `ART_SCALE`.
  - **W4-4:** the interim font is the pipeline-time ×1.5 of `pixel6x8.font.json` (9×12, line 15).
  - **W4-5:** never upscale the terrain tilesets, `ui/pixel`, real-art PNG overrides or `native: true` sources;
    amended by `16aff20`: the laser beams are drawn natively at the art scale.
  - **W4-6:** the bench atlas, CJK figures, store icons and doc images keep the v1 art (`artScale: 1`) until R2-03;
    the bench for good.
  - **W4-7:** v1 replays raise `ReplayVersionError` and show "V1 REPLAY" / "RECORDED BY V1: CANNOT PLAY"; delete only,
    never auto-deleted.
  - **W4-8:** `legacyScores` has no UI in R2-01; Steam achievements read `hiScores ∪ legacyScores`.
  - **W4-9:** the attract demos stay stale (the loop skips refused demos) until R2-03.
  - **W4-10:** Electron `window.json` v2, scale′ = max(1, round(scale × 384/640)).
  - **W4-11:** allow-list the tick timers, the angle 640, `BENCH_SIZES` and the particle degrees; derive the boot
    overlay fallback; the scanner skips `#rrggbb` (and `#rrggbbaa`) strings.
  - **W4-12:** the menu / HUD / boot / options e2e specs must pass at 1280×720; content and golden specs are gated.
  - **W4-13:** v1 hi-score tables are archived; v2 starts empty.
  - **W4-14:** a v1.x build reading a v3 save falls back to defaults.
- **Add W5-6** as built: the e2e content gate is keyed on R2-03, not on `CONTENT_PORT_PENDING`. It is implemented in
  `test/e2e/gates.ts` and cited there and in `e2e-gates.test.ts`. W5-3, W5-7, W5-8 and W5-9 are wave-5 defaults that
  the R2-02 / R3 notes below rely on.

### R2-02 notes

- **Run the port with all four v1 geometry flags plus `--art-scale 1.5`:**
  `node scripts/content/rescale.mjs --factor 1.5 --top-pad 36 --from-width 384 --from-height 200 --tile-size 8
  --to-width 640 --art-scale 1.5`.
  - The dry run at `bc8e05d` (verified) reports: 126 files (10 skipped), 10,623 values, **4,035 changes in 77 files,
    0 unclassified, 0 errors**.
  - Since the flip the tool's defaults are v2's. Without the four flags it reads the content as 640×336 → 1024×540 with
    12 → 18-px tiles and refuses with 28 errors.
  - Without `--art-scale` it exits 2; with `--art-scale 1` it exits 2 ("contradicts the atlas").
  - The identity re-run after the port (`--factor 1 --dry-run`) needs no flags.

  (B3, precheck §1.8)
- **"Outside today's schema bounds": 3, not 66.** The plan's R2-02 note at `:1261` still says 66. The frame-derived
  bounds widened at the flip. The 3 left are IRON LEVIATHAN's `advanced-bosses.enemies.json` `enemies[4].boss.parts[4 |
  8 | 12].x` (384 → 576, 384 → 576, 360 → 540) against the fixed ±512 (`packages/core/src/data/index.ts:2465-2466`).
  The real run then gives exactly these 3 errors. The fix is W5-8: widen to ±768. (B3, verified)
- **Hand fix for `test/integration/content.test.ts:1659` (PRISM LABYRINTH).** The middle row derives from the frame,
  which is right per §2.6. On the ported content it finds 0 rising walls at row 14 (it needs 6): zone G's rising walls
  start on row 15, 12 px below the centre. Raise zone G's rising walls one row; add it to W5-7's list. (A5 review 2 #1)
- **Gated `content.test.ts` thresholds to scale or confirm:** the ship gaps 24 → 36 (MAGMA DEEP) and 48 → 72 (CELL
  VAULT); the ground probe rows `PLAYFIELD_H − 8` / `[0, 7]` and the sample step `y += 8` → tile-12 values. The table
  is in Appendix A (a). When the gates go, all 13 `content.test` cases and zones-fg checkpoint 0 must pass on the
  ported content. (A5 fix 1)
- **With the gate forced off at the flip,** 63 of the 80 gated tests fail on v1 content and 17 `it.each` rows pass.
  The coarse gates were accepted. (A5 review 2; unverified)
- **Delete the content-port gate and everything on it** (scout §9, precheck §2.10, verified):
  - `packages/core/test/helpers/port-pending.ts`, `port-pending.test.ts`, and every `itPortPending` /
    `describePortPending` / `CONTENT_PORT_PENDING` use: **29 test files, 80 tests**.
  - In `powerups-direct.test.ts`, delete the `itPortPending` gate of the drop count. (was: "remove the condition", A3
    fix 1)
  - The core list includes `behaviors-zones-de-edge` steed-bob (the shipped `squall-steed` home). (A3 fix 1)
  - `tile-size.test.ts`'s pending branch: the import, `CONTENT_TILE_SIZE`, the "pending only in the R2-01 → R2-02
    window" case and the docblock. `CONTENT_TILE_SIZE` becomes `TILE_SIZE`.
  - The `CONTENT_PORT_PENDING` pin in `test/integration/e2e-gates.test.ts` (static import at `:15`). (C5 fix 1)
  - The docblock mentions at `test/golden/stale.ts:26` and `test/e2e/gates.ts:24`, `:39`, `:132`. (was: `gates.ts:17`
    before `293e885`)
  - **The golden-update refusal** (`scripts/golden-update.mjs`) lifts by itself once the tilesets are 12 px. Either
    delete it with its pin `test/golden/golden-edge.test.ts:189`, or keep it, dead, for R2-03.
- **The Tiled fixture:** redraw `test/scripts/content/fixtures/tiled-sample.tmj` and its expected `.stage.json` /
  `.paths.json` at 12 px **in the same commit that ports the tilesets**. The gate expires on the tilesets, not on the
  fixture. Exactly 5 tests read it: the fixture suite (3) and the CLI write in `tiled-import.test.ts`, and `--print` in
  `tiled-import-edge.test.ts`. (lane A fix 1)
- **The gated dimension / raster tests** then compare the ported content with the ×1.5 art directly. Their art checks
  are already ungated. (lane A, lane A fix 1)
- **The port switches the e2e gate `PORT_UNMEASURED` on.** 23 specs plus the debug-tools camera assertions then skip
  by design until R2-03 (W5-6). R2-02 makes no e2e gate edit. (C5 fix 1)
- **Watch the content-backed e2e specs that are not gated** (C5's risk list): the port can turn CI e2e red on them.
  The list is in Appendix A (b).
- **The muzzle sparks (C5 review 2 S3, `c67c7c9`).** Between the flip and the port the KESTREL's `muzzle` sparks
  (`content/fx/particles.fx.json:287`, `"dx": 9`) draw over its ×1.5 nose (x + 12). The port fixes this with no hand
  edit. The fx trigger's `dx` / `dy` have the unit `rel-px` (`packages/render-pixi/src/particles/index.ts:232`), and
  that unit's rule is `scale` (`packages/core/src/data/units.ts:149`). So the rescale run moves `dx` 9 → 13.5, together
  with 20 other fx values (speeds, radii, gravity); C5 fix 2's real run on a copy of `content/` showed it.
  `flight.spec.ts` no longer depends on it: it compares the hull's tail and fins.
- **`stale.ts` and `replay-version-shipped.test.ts` stay through R2-02.** The port writes no `*.replay.json`
  (`SKIPPED_DIRS = ['demos']`, `scripts/content/rescale.mjs:127`; the goldens are outside `content/`). (precheck §1.2)
- **R2-02 must not bump any format version.** `save-format.ts` `SAVE_FORMAT` and `gates.ts` `REPLAY_FORMAT` are pinned
  mirrors. (precheck §2.18)
- **Build delta baseline:** Tizen `app.js` 386,228 B gzip -9; check-bundle 380.2 KB of 512. (precheck §2.10, verified)
- **From scout §9:**
  - **After the tool:** `DEFAULT_*_SCREEN_X` → `PLAYFIELD_W + 24` (today `PLAYFIELD_W + 16`, `enemies/index.ts:265`,
    `data/index.ts:1887`), and `DEFAULT_BONUS_WINDOW` (600, `data/index.ts:1797`) scaled. The 16 → 24 margin change
    does not move the content-DB fingerprint; the stage lengths will. (A5 review 1 #2)
  - **The boss part offsets** meet the ×1.5 art only after the port (they look broken until then).
  - **Re-pin** the content-DB and presentation fingerprints. Expect far more than 12 red segments: every walk on zone A
    / B or campaign content moves. (precheck §1.4)
  - **`bossSuction.pullRadius` 200** (core allow-list `:130`, `behaviors/index.ts:3056`): a literal 300 removes the
    entry (scout §9), while `200 * WORLD_SCALE` keeps it with `count: 1` and a new reason (precheck §1.11).
  - **The bot geometry:** `test/playtest/rules.ts:25-31` (2.0 → 3.0, 16 → 24, 8 → 12) and
    `test/playtest/four-way-bot.ts` (`BOT_X` 64 → 96, `LANE_HEIGHT` 16 → 24, `TERRAIN_AHEAD` 56 → 84).
- **Between the flip and the port,** the beams draw at their unported sim widths (6 / 8 px), on native frames that
  match their hitboxes. The port moves them to 9 / 12, still native. (lane B review 3)
- **e2e content rows that move with the content:** `test/e2e/raster.spec.ts:237-239`. Since `c67c7c9` (C5 review 2
  N1) the comment gives raster-range's playfield rows 112 … 151 / 152 … 199 and their 640×360 frame rows (124 … 163 /
  164 … 211). The port moves the bands (×1.5 + 36), so R2-03 rewrites the comment together with the `diffRows`
  literals when it re-measures the spec. The mode7 floor rows were already fixed at `:772` in `bc8e05d`.

### R2-03 notes

- **Re-bless and re-record:**
  - re-bless the 62 goldens and re-record the 9 attract demos (10 `content/demos/*.replay.json` with the example);
  - delete `test/golden/stale.ts`, its re-export in `golden.ts`, and every `GOLDENS_STALE` use: 9 test files, 239
    tests.

  (lane A, scout §9)
- **Delete `packages/core/test/replay/replay-version-shipped.test.ts`** (73 tests) together with `stale.ts`. Its cases
  fail by design once the recordings are re-blessed, each with "R2-03 re-blessed this recording: delete
  replay-version-shipped.test.ts with the gates (test/golden/stale.ts)". The permanent cases stay in
  `replay-version.test.ts` with `fixtures/run-replay-v1.json`. (A6, A6 fix 1, precheck §2.16)
- **Delete `test/e2e/gates.ts` and every use of it** (verified at `bc8e05d`; was: "32 `test.skip` lines plus the 2
  assertion-level gates" before `293e885`):
  - 31 gating `test.skip` lines: 23 `PORT_UNMEASURED`, 4 `R2_03_PENDING` + `CONTENT_REASON`, 3 `R2_03_PENDING` +
    `GOLDEN_REASON` and the per-file `recordingIsStale` skip in `determinism.spec.ts:116`;
  - the 3 `assertionsGated` sites (`boss.spec.ts:133`, `debug-tools.spec.ts:200`, `render-groups.spec.ts:217`);
  - the two W4-9 inverse tests, `attract.spec.ts:230` and `:273` (their skips at `:235`, `:276`);
  - `test/integration/e2e-gates.test.ts`.

  The gate throws on import once nothing is stale, so it cannot be forgotten. (C5, C5 fix 1, precheck §2.16)
- **Re-measure every `PORT_REASON` and `CONTENT_REASON` test** on the ported content. The 23 `PORT_REASON` specs
  passed at 640 on v1 content, so a failure after the port is the port's. (C5 fix 1)
- **Give the fingerprint's attract walk the shipped demos again** (optional). (scout §9)
- **Switch the art:**
  - `scripts/store-assets.mjs` and `scripts/doc-images.mjs` move to the default `artScale` (both read
    `collectSprites({ artScale: 1 })`: `store-assets.mjs:150`, `doc-images.mjs:267`);
  - then regenerate `pnpm docs:images`, `docs:screens` and `store:assets`, including `docs/images/logo.png`;
  - the TV bench keeps `artScale: 1` for good.

  (scout §9, lane B review 1 #2)
- **The CJK figures:** decide whether the docs quote the v2 atlas. (scout §9)
- **The headless render bench's 640×360 scenario** becomes the default. (scout §9, plan R2-03)
- **The docs sweep:** D19 / D20 superseded. A grep at `bc8e05d` finds "384×216" in 20 `docs/dev/*.md` files, most in
  `render-performance-review.md` (19), `api-reference.md` (13) and `rendering-and-shell.md` (10). (found while verifying)

### R2-04 notes

- None new from wave 4. (The O4 hurtbox rounding note is already in the plan's R2-02 section.)

### R3 notes

- **The `artScale: 1` builds pass real-art PNG overrides and `native` sources through at their v2 size.** These builds
  are the TV bench atlas (for good), the CJK figures, the store icons and the doc images. So once R3 art ships they no
  longer hold the pure v1 art, and `interim-pipeline.test.ts`'s scale-1 digest pin moves. R3 must decide whether
  `buildAtlas({ artScale: 1 })` / `collectSprites` skip overrides and native sources (then the pin holds), or re-pin
  with the reason. (lane B fix 1)
- **Partial overrides:** `applyPngOverrides` keeps the remaining base frames when an override has fewer frames. At 3/2
  that puts upscaled v1 frames beside v2 frames. R3 decides whether a partial override is allowed. (lane B review 2)
- **W5-9 / V1 (R3-03): the beam half is done** (`16aff20`): `GeneratorOptions.artScale` exists, and the beams are
  native at the bible's 6×12 × 12. V1 keeps that and adds the bullets and the bend nodes, native at the bible's sizes.
  - Today at 1.5 they are upscaled: round 11×11, oval 14×14 (→ 13), needle 17×17, bend 11×11.
  - The beam assertions of the planned `bullets-v2.test.ts` already hold.

  (lane B fix 2, precheck §1.12)
- **R3-02's staged output** "moves into `assets/source/sprites/` with R2-01 or the first R4 step after it". R2-01 moved
  nothing: there is no `art-prompts/v2/ingested/`. (found while verifying)

### R4 notes

- **R4-03, the font.** The pipeline scales every font with the art (`scaleFont`), and `*.font.json` has no `native`
  opt-out. When the v2 9×12 font file lands, either give font sources a `native` key that the interim stage honours, or
  drop the font scale. Otherwise a 3/2 build turns the 9×12 font into 14×18, and both the font pin (file × `ART_SCALE`)
  and the scale-1 digest pin move. (lane B fix 1)
- **R4-03, the interim font's strokes** come out 1 or 2 px wide by position (the ×3/2 nearest-neighbour). Judge the
  readability on the build. (B3)
- **R4-03, the UI kit and HUD** (U3, C5):
  - overlays over the title leave cut-off title menu rows under their panels (a v1 trait);
  - the interim ×1.5 meter-label sprites look rough;
  - the HUD redesign covers the shell's free-flight HUD (`packages/shell/src/flight/index.ts`);
  - the campaign line caps are re-derived for the final font (`scenes-and-ui.md:366`).
- **R4-05, the ending and story vignettes** (U3 review 1 O2 / O3; the hand-off list said R4-03, but the plan's R4-05
  covers the endings):
  - the epilogue panel's text sits at the top with 36–95 px of empty panel below;
  - the story panel is centred with 24-px margins, while the epilogue panel hugs its scene (4 / 6 px) — two rules for
    two text panels. R2-01 left it as is; R4-05 settles one rule and designs the two together;
  - the sprite scenes' x composition is top-left-anchored ×1.5;
  - a sliver of the flawless citadel's sun (and the sinking ARK) shows in the margin between the scene and the
    epilogue panel, as in v1.

### R0-03 note

- **After the flip, the TV bench's decode scenario decodes the ×1.5 shipped pages** (`bench-decode.mjs`), so decode
  rows before and after the flip are not like for like. Only `rgba-2048` and `png8-2048` are synthetic. (lane B→C,
  lane B review 1 #4, precheck §2.13)

---

## Code comments still stale at `bc8e05d` (not docs; small, optional)

- **`packages/core/src/scenes/index.ts:1649`, `:7474`, `:7651`:** "as long as at the v1 frame". The truth is within
  5 % (+28 / +70 ticks). (A5 review 1 #3)
- **`packages/core/test/helpers/frame-literal-scan.ts:198`:** "A hex colour token" → "A long hex colour token". (lane C
  review 3)
- **`packages/render-pixi/src/effects/crt.ts:169`:** the `@example` passes pitch 5 at 1920×1080, which is v1's ×5. At
  640×360 1080p is ×3. (found while verifying)
- **`packages/core/src/collision/index.ts:729`, `packages/core/src/presentation/index.ts:318`:** "8 today, 12 in v2".
  True until R2-02; R2-02 updates them. (A5 / U3 comment sweep)

## Not docs: open owner questions found in the reports

- **The v1.0.0 TV title overlap.** The 7th menu row (EXIT, since M3-01's EXTRA) touches the HI line at 384×216 (EXIT
  at y 190..198, HI at 196). Fix it on `v1.x`? Never push `v1.x` without the owner's OK; the fix would change v1's
  pinned output. (lane U, U review 1)
- **The credits and story scroll rate.** Today it is the ART_SCALE step, with durations in v1 ticks. If the owner wants
  the slower 1-px crawl back, set `SCROLL_HALVES` to 2 (`scenes/index.ts:7481`, test mirror in
  `helpers/scene-layout.ts`); `scenes-scroll-frames.test.ts` then fails by design. (U fix 1)
- **The three CI-only e2e 1/5 failures and the myadmin1 flight flake** were open at `bc8e05d`. C5 review 2 reproduced
  them under CPU pinning, and C5 fix 2 (`c67c7c9`) fixed them (see the R2-01 As built). They are not owner questions.
- **Optional manual looks (none blocking):**
  - text readability of the interim build at 640×360 (`pnpm dev`, or a `build:dev` on the M7);
  - the es front end on a TV;
  - the `V1 REPLAY` row with an old `replay.last` on a v2 build;
  - the still-open W3-7 `file://` manifest check.

  (B3, lane B→C, U3, lane A, scout §9)

## Sources

The earlier run's wave-4 builder, fixer and review reports, the wave-4 scout's hand-offs (§9), the
wave-5 pre-check (§2 items 10, 11, 13, 16, 18) and the repository at `bc8e05d`. The reports are not committed;
every item they hold for the docs pass is in this file.

---

## Appendix A — data the work orders need inline

All line numbers are at master `bc8e05d`, checked with `git grep -n` and a full `vitest run` (782 files,
9,314 tests: 0 failed, 360 skipped).

### A (a) `test/integration/content.test.ts`: the gap and probe-row values the gated cases check after R2-02's port

Source: A5 fix 1 (`9a4c315`), with A5 review 2 and the wave-5 pre-check (§2 item 11).

**The gates:**

- `itPortPending` at `:626`, `:1121`, `:1450`, `:1650` and `:1995`;
- `it.skipIf(CONTENT_PORT_PENDING).each(zones)` at `:1791` (B–G, 6 cases) and `:2176` (H–I, 2 cases).

That is 13 gated cases (verified: 86 passed, 13 skipped). With the gate forced off, **13 of 13 fail on v1 content**
(A5 fix 1). All 13, plus zones-fg checkpoint 0, must pass on the ported content.

| Case (gate line) | Check (file:line) | v1 value | v2 value after R2-02 | Why |
|---|---|---|---|---|
| MAGMA DEEP, brick maze (`itPortPending` `:1450`) | `expect(gap * map.tileSize).toBeGreaterThanOrEqual(24)` `:1490` | 24 px | **36 px** | A world value, "a gap the ship fits through", ×1.5. On a ported copy the narrowest gap is 72 px, so it holds (A5 review 2). |
| MAGMA DEEP (`:1450`) | `expect(rows[0]).toBeGreaterThanOrEqual(PLAYFIELD_H / map.tileSize)` `:1487` | 25 rows (200 / 8); 42 today (336 / 8, gated) | 28 rows (336 / 12), derived: no edit | Frame-anchored ("below the surface", one playfield of tile rows). The ported walls start on row 29 ≥ 28 (A5 review 2). |
| CELL VAULT, tissue walls (**not gated**, test `:1590`) | `expect(gap * (tileset?.tileSize ?? 0)).toBeGreaterThanOrEqual(48)` `:1614` | 48 px | **72 px** | A world value ×1.5. It still passes unscaled after the port, but then checks less than it means. |
| PRISM LABYRINTH (`itPortPending` `:1650`) | `const middle = Math.floor(PLAYFIELD_H / 2 / map.tileSize)` `:1659`; `rising ≥ 6` | row 12 (⌊200 / 2 / 8⌋); 21 today (gated) | row 14 (⌊336 / 2 / 12⌋), derived: keep | Frame-anchored (§2.6), so it is right. On the ported content it finds **0 rising walls at row 14** (needs 6). Ported counts: row 13 hanging 8 / rising 0, row 14 8 / 0, row 15 8 / 6, row 16 0 / 6. The fix is in R2-02's hand fixes: **raise zone G's rising walls one row** (W5-7's list). The test stays. (A5 review 2 #1) |
| Ground enemies B–G (`it.skipIf(…).each` `:1791`) | probe rows `[PLAYFIELD_H - 1, PLAYFIELD_H - 8]` (floor) / `[0, 7]` (ceiling) `:1811` | the last / first 8-px tile row | **`PLAYFIELD_H − 12` and `[0, 11]`** (one 12-px tile; the reports say "tile-12 values", so this exact form is a derivation) | A tile value (rock "in the lowest / highest tile row"), not a frame number. |
| Ground enemies B–G (`:1791`) | probe x `event.x + (event.screenX ?? DEFAULT_SPAWN_SCREEN_X)` `:1808` | was `?? 400` | the constant follows: `PLAYFIELD_W + 24` = 664 after R2-02 (656 today) | Derived since `9a4c315`. A scratch run matched all 104 predicted ground spawns to the runtime within 1.05 px (with `?? 400` they would be 256 px off). Only 1 of the 104 has its own `screenX` (zone C). `ground ≥ 8` is a count and stays. |
| Ground enemies H–I (`it.skipIf(…).each` `:2176`) | rows `:2190`, x `:2189` | as above | as above | The same test for zones H and I. |
| ABYSSAL THRONE, open water (**not gated**, test `:2085`) | `for (let y = 0; y < PLAYFIELD_H; y += 8)` `:2114` | step 8 | **step 12** | The sample step is a tile value. The `x += 8` at `:2113` was not listed, and the extent `stage.length + PLAYFIELD_W` is already derived. |
| Zone A, "shapes its terrain" (`itPortPending` `:1121`) | ceiling x bounds 3400 / 6500, `(6000 - 3500) / 4`, floor x's 600 / 1000 / 4000 / 5500 / 7000, arena from 8000 (`:1137-1148`) | world x | ×1.5 (e.g. 5100 / 9750 …; **unverified** against the ported zone A) | World values. A5 review 2: "the 3400 / 6500 / 8000 world x's stay literal" for R2-02 to scale. Not in A5 fix 1's list. |

**Also for R2-02's `content.test.ts` pass** (pre-check §2 item 11; not A5 fix 1's list):

- **The capsule window `900`** at `:1046`, `:1785` and `:2170` → 1,350.
- **`MAX_AIMED_BULLET_SPEED` and `MIN_LANE_GAP`** are imported from `test/playtest/rules.ts` (`:113`). Only
  `rules.ts:25-31` changes: 2.0 → 3.0 px/tick, lane gap 16 → 24, column half-width 8 → 12.

---

### A (b) The e2e gate inventory (`test/e2e/gates.ts`, at `bc8e05d`)

#### The two gates (`gates.ts`)

| Export | What |
|---|---|
| `R2_03_PENDING` (`:206`) | Some committed golden / demo is stale (`recordingIsStale`: format ≠ `REPLAY_FORMAT` 2, or frame ≠ `scripts/frame.mjs` 640×360). True today. It clears only at R2-03's `pnpm golden:update`. |
| `PORT_UNMEASURED` (`:214`) | `R2_03_PENDING && contentPorted()`, where `contentPorted()` (`:137`) means every `content/tilesets/*.tileset.json` `tileSize` = `TILE_SIZE` 12. **False today**, so those tests run. True from R2-02's port until R2-03. |
| `checkGateExpiry` (`:154`) | Runs on import, via `resolveGates` (`:188`). Throws "R2-03 re-recorded the goldens and demos: re-measure the gated specs, then delete test/e2e/gates.ts and every skip on it" once the frame ≠ 384 and nothing is stale. |
| `GOLDEN_REASON` (`:217`), `CONTENT_REASON` (`:222`), `PORT_REASON` (`:230`) | The skip reasons. |
| `assertionsGated(info, gate, what, reason)` (`:257`) | Returns the gate. When it holds, it pushes `{ type: 'skip', description: '<what>: <reason>' }` onto the test's annotations. |

**The pin:** `test/integration/e2e-gates.test.ts` (10 tests). It imports `port-pending.ts` statically at `:15`, so R2-02
drops that pin with `port-pending.ts`.

**The states:**

| State | `R2_03_PENDING` | `PORT_UNMEASURED` |
|---|---|---|
| R2-01 until R2-02 (today) | true | false |
| R2-02's port until R2-03 | true | true |
| R2-03 re-recorded | throws on import | throws |
| v1 frame | false | false |

#### Every gated line (from `git grep -n -E "R2_03_PENDING|PORT_UNMEASURED|assertionsGated|GOLDEN_REASON|CONTENT_REASON|PORT_REASON|recordingIsStale" -- test/e2e`)

**Line numbers moved by `c67c7c9`** (re-run the `git grep` above before relying on one):
- `campaign-run.spec.ts`: gate `:316` → `:372` (test `:313` → `:369`); the web run `:241` → `:298`, with god mode
  `:252` → `:311`; the Tizen run `:355` → `:411`.
- `debug-tools.spec.ts`: `assertionsGated` `:200` → `:228` (web test `:167` → `:195`); the Tizen unlock test
  `:233` → `:261`.
- `raster.spec.ts`: gate `:254` → `:255` (test `:253` → `:254`); risk list `:279` → `:280`, `:298` → `:299`.
- `flight.spec.ts`: the idle test `:114` → `:152`.

**`PORT_UNMEASURED`, `PORT_REASON`.** These pass at 640 on v1 content, so they run today. They skip from R2-02's port
until R2-03 re-measures them. 23 whole tests plus 1 assertion gate:

| Gate line | Test (line) | What it checks / the v1 number it holds |
|---|---|---|
| `advanced-bosses.spec.ts:258` | the raid: a battleship wider than the screen, the camera panning round it (`:255`) | boss art across the playfield, camera pans |
| `advanced-bosses.spec.ts:358` | a captain: it fights while the camera keeps scrolling (`:357`) | captain art while the camera scrolls |
| `advanced-bosses.spec.ts:382` | Tizen: the twins, the resting one drawn behind, the swap (`:379`) | twin boss art and draw order |
| `campaign-run.spec.ts:316` | `?stage=bonus-range`: the digit entrance flies the ship into the vault, its items drawn (`:313`) | the stage's digit window x 1980 / 2000 |
| `mode7.spec.ts:484` | the Mode-7 floor under the horizon within the draw-call budget (`:481`) | dimension's `horizon: 100` |
| `mode7.spec.ts:768` | covers exactly the frame rows between its horizon and its bottom (`:767`) | floor rows 112 … 211 (`horizon 100` / `bottom 200`) |
| `raster.spec.ts:223` | the sea wave, the palette cycle and the line-band floor within the draw-call budget (`:220`) | raster-range's band rows |
| `raster.spec.ts:254` | the heat haze only inside its camera range (`:253`) | raster-range's camera range |
| `stage.spec.ts:113` | shows the generated terrain and scrolls it (`:112`) | test-range's 1 px/tick camera (30 px in 30 ticks) |
| `zone-a.spec.ts:108` | `?skip=boss`: START reaches the WARNING and HALCYON BULWARK (`:105`) | zone A's boss hull at v1 rows in the right half |
| `zones-bc.spec.ts:234` | BRINE NEBULA, then GALVANIC MAW (`:231`) | zone art rows and bands, the boss area |
| `zones-bc.spec.ts:263` | DUNE EXPANSE, then SANDGRAVE WIDOW (`:262`) | the same |
| `zones-bc.spec.ts:283` | PEARL GROTTO: the bonus stage's reef floor and ceiling (`:280`) | the same |
| `zones-bc.spec.ts:300` | SANDGRAVE WIDOW on the TV build (`:297`) | the boss art area |
| `zones-de.spec.ts:315` | TEMPEST RIDGE, then SQUALL STEED (`:312`) | zone art rows, the boss area |
| `zones-de.spec.ts:353` | CINDER BASTION and SQUALL STEED on the TV build (`:350`) | the boss art areas |
| `zones-fg.spec.ts:312` | CELL VAULT, then MANTLE REGENT (`:309`) | zone art rows, the boss area |
| `zones-fg.spec.ts:351` | PRISM LABYRINTH, then FACET MONARCH (`:348`) | the same |
| `zones-fg.spec.ts:385` | MANTLE REGENT and FACET MONARCH on the TV build (`:382`) | the boss art areas |
| `zones-hi.spec.ts:411` | IRON CITADEL, then IRON SOVEREIGN holds the right half (`:408`) | zone art rows, the boss in the right half |
| `zones-hi.spec.ts:441` | ABYSSAL THRONE, then the ABYSS ARK's plating fills the raid's view (`:438`) | the same |
| `zones-hi.spec.ts:507` | IRON SOVEREIGN and the ABYSS ARK on the TV build (`:504`) | the boss art areas |
| `zones-hi.spec.ts:529` | the citadel's ending scene on the TV build (`:528`) | the ending scene's rows |
| `debug-tools.spec.ts:200` (`assertionsGated`, in the web test `:167`) | F7 / F8 camera x (asserted `:206`, `:210`) | zone A's `checkpoints [0, 3500, 6000]`, `warningX 8600`, `skipLead 96` (`:28`) |

**`R2_03_PENDING`, `CONTENT_REASON`.** These fail at 640 on v1 content. 4 whole tests plus 2 assertion gates:

| Gate line | Test (line) | What fails at 640 |
|---|---|---|
| `zones-de.spec.ts:275` | MAGMA DEEP: the volcano peaks, the lava lake rising with the dive, then CINDER BASTION (`:272`) | lava rows (5338 ≠ 0) |
| `zones-hi.spec.ts:468` | the endings: the flagship sails off under the dawn; the citadel falls under its blasts (`:465`) | the ending's sun rows (sun 0) |
| `gimmicks.spec.ts:76` | boots the gimmick range and draws its destructible brick pillar (`:75`) | pillar columns (brick 1476 ≠ 0) |
| `gimmicks.spec.ts:100` | takes broken bricks off the screen at once and draws them again after the rollback (`:97`) | broken bricks 4 of 28 |
| `boss.spec.ts:133` (`assertionsGated`, test `:92`) | the WARNING band shows for three seconds, then the boss flies in | **only the hull check**: TRIAL WARDEN sits at v1 screen x 300 (`content/enemies/test-boss.enemies.json` `boss.x`), left of the 640 centre. The band check (`BAND_Y = FRAME_CY − uiPx(8) − (uiPx(48) >> 1)`, `:34`) runs. |
| `render-groups.spec.ts:217` (`assertionsGated`, test `:197`) | the comparison would catch a layer drawn in the wrong place | the HUD control (layer 11): zone A's v1 stage draws nothing under the 640 bars, so moving `HUD` changes 0 px. The loop drops 11 (`:223`); TERRAIN and PLAYER still run. |

The failing-assertion figures (5338, sun 0, 1476, 4 of 28) were measured by C5 review 1 at `e7ff5db`. Their
assertion lines may have moved since.

**`R2_03_PENDING` / `recordingIsStale`, `GOLDEN_REASON`.** These play the refused v1 recordings:

| Gate line | Test (line) | Why |
|---|---|---|
| `determinism.spec.ts:116` | `${file.name}` reproduces every recorded state hash (`:111`, one test per file) | `recordingIsStale(doc)` per file; 71 skipped in Chromium and 71 in Firefox. Each file un-skips once it is current. |
| `attract.spec.ts:183` | title → demo → hi-scores → story → title on the game's timings (`:180`) | the demos are refused, so the loop skips them (W4-9) |
| `attract.spec.ts:298` | Tizen: the title hands over to the demo; the remote's OK returns (`:297`) | the same |
| `atlas-residency.spec.ts:396` | the attract demo brings its zone's pages (`:393`) | the same |

**The inverse tests** (`test.skip(!R2_03_PENDING, …)`) run only while gated, and R2-03 deletes them:

| Skip line | Test (line) |
|---|---|
| `attract.spec.ts:235` | web: title → hi-scores → story → title, the loop skips the demos the build refuses (W4-9) (`:230`) |
| `attract.spec.ts:276` | Tizen `file://`: the title hands over to the hi-scores; the remote's OK (keyCode 13) returns (`:273`) |

**Totals at `bc8e05d`:**

- 33 `test.skip` lines in the specs:
  - 23 `PORT_UNMEASURED`;
  - 4 `R2_03_PENDING` with `CONTENT_REASON`;
  - 3 `R2_03_PENDING` with `GOLDEN_REASON`;
  - 1 `recordingIsStale`;
  - 2 inverse.
- 3 `assertionsGated` sites: boss, debug-tools (2 assertions) and render-groups.
- (was: "32 `test.skip` lines plus 2 assertion gates and the inverse `attract:212`" at `e7ff5db`, before `293e885`.
  C5 fix 1 also counts "4 `assertionsGated` sites", which matches the 3 calls if debug-tools' two assertions are
  counted separately.)

#### Content-backed specs that are NOT gated (C5's R2-02 risk list)

Their assertions are presence, motion or colour in frame-derived areas, and they pass today. They may need a look
after the port, and the port can turn CI e2e red on them:

- `bullets.spec.ts:88`
- `bullet-palette.spec.ts:116`, `:168`
- `enemies.spec.ts:61`
- `weapons.spec.ts:126`, `:156`, `:178`
- `direct-items.spec.ts:186`
- `option-hunter.spec.ts:174` (hardened in `e7ff5db`: it polls past the Mega Crash flash after a 1-in-5 local flake)
- `raster.spec.ts:182`, `:279`, `:298` (was `:297` at `e7ff5db`)
- `stage.spec.ts:144`

Two class-(a) specs also run in **god mode on v1 content**, ungated:

- `coop-gamepad.spec.ts:126` (god mode at `:171-172`): both ships died to v1 zone A on 4 cores;
- `campaign-run.spec.ts:241` (god mode at `:252`): the flawless citadel ending needs no ship lost.

The wave-5 pre-check (§2 item 14) notes that the e2e lock was given only to lanes V and M in wave 5, while lane S needs
it at S2 and S3 for these specs.

#### C5's e2e timing notes

- **CI at 640 is slower:**
  - across the 143 tests run in both runs, the median per-test time is **×1.83**;
  - the sum went from **1,400 s to 2,642 s** (CI `39106182210` at 384 against `39109703989` at 640);
  - the cause is SwiftShader rasterising in software: a 640×360 target (2.8× the pixels) plus the ×1.5 art, upscaled
    to 1280×720;
  - the bench's CPU-side render p95 rose only about 30 % (CI 3.0 → 3.9 ms), so the cost is the GPU process's
    rasterisation.
- **The e2e shards now take up to about 6 min each.** At `bc8e05d` shard 1/5 took 6.6 min (34 passed, 9 skipped, 3
  failed; verified in the run log).
- **render-groups timeouts:** `:252` (was `:246`) has 120 s and `:321` (was `:315`) has 180 s, each with a comment.
  They run locally in 15 s and 28 s, but take 54 s and about 95 s on 4 pinned cores (`taskset -c 0-3`, like a CI
  runner). C5 review 1 measured 13.8 s and 27.0 s locally, unpinned.
- **In the TV scenes of the render bench,** 640×360 renders about 37 % fewer frames than 384×216 in the same window
  (72 → 45, 68 → 26, 65 → 32). The CPU-side p95 moved only from 2.4–2.9 to 2.4–4.8 ms. The TV figures are R0-02's.
- **Already long tests with their own 90–180 s timeouts** (times on CI at `e7ff5db`): `options:219` (57.6 s),
  `game-options:306` (59.2 s), `scenes:168` (56.8 s).
- **Local runs under the lock** (Chromium, `CI=1`, `E2E_WORKERS=2`, retries 0):
  - C5: all 50 spec files in 5 batches, 0 failures; the load-sensitive specs on 4 pinned CPUs, 12 of 12 green ×2;
  - C5 fix 1, batch A (zone-a, stage, mode7, raster, campaign-run, zones-*, advanced-bosses): 36 passed, 2 skipped;
  - C5 fix 1, batch B (debug-tools, boss, render-groups, attract, determinism, gimmicks, atlas-residency): 25 passed,
    76 skipped;
  - Firefox `determinism.spec.ts`: 2 passed, 71 skipped;
  - `playwright test --list` (Chromium): 227 tests in 50 files.
- **The CI history:**

  | Run | Commit | Result |
  |---|---|---|
  | `39114892393` | `9e725e2` | e2e 5 / 5 green |
  | `39116001122` | `e7ff5db` | the whole run green |
  | `39119741233` | `3623be2` | green |
  | `39154793108` | `ac40436` | only e2e 1/5 failed, the same 3 tests |
  | `39156155873` | `bc8e05d` | only e2e 1/5 failed, the same 3 tests |

  Verified with `gh run list` / `gh run view`.

---

### A (c) The Vitest skip table (A6's table with A5 fix 1's correction)

**Verified by a full `vitest run` at `bc8e05d`:** `GOLDENS_STALE` **239** · `CONTENT_PORT_PENDING` **80** · frame
`runIf` **41** = **360**, with 0 failed. That matches the pre-check's 239 / 80 / 41.

The run classifies each skip by the reason text in its test name. The frame `runIf` files carry no tag, and all 41 of
their skips are v1-frame cases (`v1-baseline*` re-runs, the frame-pixel pins, Electron's v1-frame window cases).

| File | `GOLDENS_STALE` | `CONTENT_PORT_PENDING` | frame `runIf` |
|---|---:|---:|---:|
| `test/golden/golden.test.ts` | 79 | | |
| `test/golden/golden-edge.test.ts` | 129 | | |
| `test/golden/golden-autofire.test.ts` | 5 | | |
| `test/golden/demos.test.ts` | 10 | | |
| `test/integration/atlas-zone-sprites.test.ts` | 11 | | |
| `test/integration/attract-flow.test.ts` | 1 | | |
| `test/integration/attract-flow-edge.test.ts` | 1 | | |
| `packages/shell/test/determinism/determinism.test.ts` | 2 | | |
| `packages/shell/test/determinism/determinism-edge.test.ts` | 1 | | |
| `test/integration/content.test.ts` | | 13 | |
| `test/integration/death-runtime.test.ts` | | 7 | |
| `test/integration/zones-de-runtime-edge.test.ts` | | 9 | |
| `test/integration/zones-fg-runtime-edge.test.ts` | | 9 | |
| `test/integration/zones-hi-runtime-edge.test.ts` | | 9 | |
| `test/integration/zones-de-runtime.test.ts` | | 1 | |
| `test/integration/zones-fg-runtime.test.ts` | | **1** (was 2; A5 fix 1 gated only checkpoint 0) | |
| `test/integration/zones-fg-direct.test.ts` | | 2 | |
| `test/integration/enemies-runtime.test.ts` | | 2 | |
| `test/integration/weapons-runtime.test.ts` | | 2 | |
| `test/integration/stage-runtime.test.ts` | | 2 | |
| `test/integration/stage-terrain.test.ts` | | 2 | |
| `test/integration/arsenal-runtime.test.ts` | | 1 | |
| `test/integration/extra-edit-runtime.test.ts` | | 1 | |
| `test/integration/bonus-stage-runtime.test.ts` | | 1 | |
| `test/integration/campaign-flow.test.ts` | | 1 | |
| `test/integration/dimension-runtime.test.ts` | | 1 | |
| `test/integration/raster-range-runtime.test.ts` | | 1 | |
| `test/scripts/content/tiled-import.test.ts` | | 4 | |
| `test/scripts/content/tiled-import-edge.test.ts` | | 1 | |
| `test/playtest/four-way-bot.test.ts` | | 1 | |
| `test/playtest/harness.test.ts` | | 1 | |
| `packages/core/test/behaviors/behaviors.test.ts` | | 2 | |
| `packages/core/test/behaviors/behaviors-cube.test.ts` | | 1 | |
| `packages/core/test/behaviors/behaviors-cube-edge.test.ts` | | 1 | |
| `packages/core/test/behaviors/behaviors-zones-de-edge.test.ts` (steed-bob) | | 1 | |
| `packages/core/test/powerups/powerups-direct.test.ts` | | 1 | |
| `packages/core/test/stage/stage-bonus.test.ts` | | 1 | |
| `packages/shell/test/dispatch/dispatch-fx-runtime.test.ts` | | 1 | |
| `test/golden/v1-baseline.test.ts` | | | 19 |
| `test/golden/v1-baseline-zones.test.ts` | | | 9 |
| `test/golden/v1-baseline-loop2.test.ts` | | | 9 |
| `test/scripts/frame.test.ts` | | | 2 |
| `apps/electron/test/main/window-state.test.ts` | | | 2 |
| **Total** | **239** | **80** | **41** |

**`git grep -c` of the gate call sites** (`itGoldensStale(`, `describeGoldensStale(`, `skipIf(GOLDENS_STALE)` /
`itPortPending(`, `describePortPending(`, `skipIf(CONTENT_PORT_PENDING)` in `*.test.ts`):

- **9 files use the `GOLDENS_STALE` family.**
- **29 files use the `CONTENT_PORT_PENDING` family:** the 29 files of the table's middle column. Per file: content 7,
  death 5, the `*-edge` zones 2 each, tiled-import 4, and 1–2 elsewhere.
- **Call sites ≠ tests:** an `it.each` or a `describe` expands into several tests. The test counts above come from the
  run, not the grep.

Other gate references, not test call sites:

- the definitions `port-pending.ts` and `stale.ts` / `golden.ts`;
- `tile-size.test.ts`'s pending branch;
- the e2e pin `e2e-gates.test.ts:15`;
- `packages/core/src/config/index.ts` (a docblock mention).

Related counts at `bc8e05d` (verified by the run): `replay-version-shipped.test.ts` 73 tests (the inverse of
`GOLDENS_STALE`), `replay-version.test.ts` 16, `port-pending.test.ts` 3, `e2e-gates.test.ts` 10,
`e2e-save-format.test.ts` 1.

---

### A (d) The CI-only e2e failures: what the tests do at `bc8e05d`

All three fail in CI e2e shard 1/5 only, with their retries. They fail on `ac40436` and `bc8e05d`, were green on
`3623be2`, and do not reproduce locally (C5 fix 1). In run `39156155873` the canvas attributes at the failure show
`data-shmup-atlas-pages="0,2"` (common + zone B).

**`test/e2e/campaign-run.spec.ts:241`** (web): "A → B → D → F → H: every tally and map, the ending, the title, the saved
run". It sets god mode, then clears each zone through the debug API. In CI the scene stays `game` at `:259` for zone B.

```ts
    for (let z = 0; z < zones.length; z++) {
      await expect.poll(async () => (await view(page)).stage).toBe(zones[z]);
      await clearZone(page);   // :205-209 — __shmupDebug.game.world.status = 'stageClear'
      await expect(canvas).toHaveAttribute('data-shmup-scene', 'stageClear');   // :259 fails: "game"
      await waitFrames(page, 10);
      await tap(page, 'Enter'); // skip the tally
```

**`test/e2e/campaign-run.spec.ts:355`** (Tizen `file://`): "the remote`s OK skips the tally and launches the next
zone". There is no god mode in this test. Zone A clears, OK twice reaches zone B (`next.stage` `zone-b`, route `[0, 1]`
are asserted), then zone B's own clear fails at `:373`.

```ts
    expect(next.stage).toBe('zone-b');
    expect(next.route).toEqual([0, 1]);
    // B's own clear: its tally, then the map again (B's exits D and E).
    await clearZone(page);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'stageClear');   // :373 fails: "game"
```

**`test/e2e/debug-tools.spec.ts:233`** (Tizen `file://`): "after the unlock, 4 freezes and each 5 runs one tick". It
fails at `:244`: `frameAdvance` is `false` after the unlock (Pause 10252, then Ch+ 427 ×3) and the remote's 4 (52).

```ts
    await remoteTap(page, 52);
    expect((await view(page)).flags.frameAdvance).toBe(false);          // locked: 4 does nothing
    for (const keyCode of [10252, 427, 427, 427]) await remoteTap(page, keyCode);
    await remoteTap(page, 52); // 4 = frame advance
    const frozen = await view(page);
    expect(frozen.flags.frameAdvance).toBe(true);                       // :244 fails: false
```

**Also flaky on the myadmin1 host:** `test/e2e/flight.spec.ts:114`, "arrow keys move the KESTREL;
without input it stays put". Its idle check waits on rAF frames, not exact ticks, against the conventions' "step exact
ticks" rule:

```ts
    await waitFrames(page, 60); // the 40-tick fly-in is over
    const start = await shipCentre(page);
    await waitFrames(page, 20);
    const idle = await shipCentre(page);
    expect(Math.abs(idle.x - start.x)).toBeLessThan(0.5);   // :129
```

**Resolved after `bc8e05d`.** C5 review 2 reproduced all three failures under CI-like load (`taskset -c 0-3`,
`E2E_WORKERS=2`; on 2 CPUs `:355` also failed 2 of 2) and the flight flake (6 of 48 with 12 workers on 12 CPUs). The
causes:
- the tally waits gave 90 ticks 5 s of wall time, and the web test 180 s for ~820 rAF frames (S1);
- the unlock spent 18 rAF frames of a 3 s window (S2);
- the muzzle sparks at the v1 `dx` 9 covered the ×1.5 nose (S3).

`c67c7c9` fixed them, in test files only:
- tick-budget waits and a 420 s web timeout (the tests are now `campaign-run.spec.ts:298` and `:411`);
- the one-`evaluate` `remoteSequence` (`debug-tools.spec.ts:152`, test `:261`);
- `freezeSim` / `stepTo` / `holdTicks` and the tail-and-fins `HullView` (`flight.spec.ts:47`, test `:152`).

The excerpts above are `bc8e05d`'s.

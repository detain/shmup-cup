# The front end: attract mode, the mode select, name entry and the hi-score tables

How plan step **M2-15** gave the game its complete arcade front end. The title's menu became the
**mode select** — 1 PLAYER / 2 PLAYERS / **PRACTICE** / OPTIONS / **SOUND TEST** / EXIT. Left
alone, the title hands over to the **attract loop**: a **demo play** of a bundled zone recording,
the **hi-score tables** and an original **story crawl** over sprite scenes, then the title again.
Any input returns to the title. A game whose score enters a table ends in the **name entry** (three
letters picked with the four directions and OK — the Samsung remote is enough), then that table
with the new rows lit. Hi-score tables are now kept per **difficulty × ship × mode** (1 PLAYER,
2 PLAYERS, PRACTICE). **Practice** plays one zone from a checkpoint with a chosen loadout into its
own tables. The **sound test** plays every music track and sound effect. The **continue
countdown** got a draining time bar, the score and a `PRESS OK` prompt.

The step adds no new art and changes no simulation: the demos are ordinary replays of the 4-way
playtest bot committed as content, the story reuses the sprites of the endings and the ships, and
the golden replays did not need a re-bless.

This page is the *how and why* and the map of the step's code and content. Exact signatures are in
[api-reference.md](api-reference.md) (`data`, `events`, `game`, `replay`, `save`, `scenes`, `ui`,
`@shmup/audio-web`'s engine, `@shmup/shell`'s dispatch and the golden-replay tooling); the TSDoc of
`packages/core/src/{scenes,ui,save,replay,data}/`, `packages/audio-web/src/engine/index.ts`,
`packages/shell/src/dispatch/index.ts` and `test/golden/demos.ts` is the authoritative reference.
The data formats for authors are next to the data —
[`content/demos/README.md`](../../content/demos/README.md) (the demo files) and
[`content/campaign/README.md`](../../content/campaign/README.md) (the `story`). What testers see is
in [`../client/preview-build.md`](../client/preview-build.md#the-front-end-attract-mode-high-scores-practice-and-the-sound-test).
The scene stack, the UI kit and the HUD this builds on are [scenes-and-ui.md](scenes-and-ui.md); the
save and its tables [saves-and-options.md](saves-and-options.md); replays and golden replays
[debug-and-replays.md](debug-and-replays.md); campaign runs and the practice plumbing
[campaign-and-bonus-stages.md](campaign-and-bonus-stages.md); the audio engine [audio.md](audio.md).

Background: `shmup_feat.md` §15 (the hi-score table: top 10, name, score, zone reached, per
difficulty / mode), §16 (attract / demo mode from bundled replays; practice — stage, checkpoint,
loadout, a separate score table), §17 (the attract loop, the mode select, the 3-letter name entry,
the continue countdown), §21 (the sound test; attract mode on the replay playback path).

## The picture at a glance

```text
                 ┌──────────── any input (Back too) ─────────────┐
                 ▼                                               │
  ┌───────────────────────┐  720 ticks idle   ┌──────────────┐   │
  │ TitleScene  PRESS OK  │ ────────────────► │  DemoScene   │ ──┤  a zone demo, silent, hashes
  │   OK → mode select:   │  (no demos: the   │  (next demo) │   │  checked; ends → tables
  │   1P · 2P · PRACTICE  │   tables first)   └──────┬───────┘   │
  │   OPTIONS · SOUND TEST│                          ▼           │
  │   EXIT (TV only)      │                   ┌──────────────┐   │
  └───────────────────────┘                   │ HiScoreScene │ ──┤  ≤ 4 tables × 300 ticks
        ▲         ▲                           │  (attract)   │   │
        │         │                           └──────┬───────┘   │
        │         │  story crawled (no story: ───────┤           │
        │         │  from the tables straight)       ▼           │
        │         │                           ┌──────────────┐   │
        │         └───────────────────────────│  StoryScene  │ ──┘  campaign.story over
        │                                     └──────────────┘      sprite scenes
        │
  game over · stage clear · practice clear · ending (no credits) · credits
        │  FlowControl.finishGame()
        ▼
  a row entered a table? ── no ──► title
        │ yes
        ▼
  NameEntryScene (each pending row; 1,800-tick timeout) ─► save flushed ─►
  HiScoreScene (result: the game's table, new rows blinking, 900 ticks; OK / Back after 30) ─► title
```

Every screen is a `core/scenes` scene created with the flow (no allocation per tick or frame); the
only allocations are transitions — the demo's World when a demo starts, the name when an entry
finishes, the save's new document.

## The mode select (the title menu)

There is no separate mode-select scene: the title's menu is it. `TitleItem` is `Start` 0 (1 PLAYER),
`TwoPlayers` 1, `Practice` 2, `Options` **3**, `SoundTest` 4, `Exit` **5** — OPTIONS and EXIT
moved down, so **every test and e2e spec that walked to OPTIONS presses Down once more** (M2-06
moved them once already). EXIT exists only when the platform can quit (`platform.exit` — the TV);
PRACTICE is disabled (`disabledMask`) when the content has no campaign. 1 PLAYER and 2 PLAYERS
clear a practice choice left over from an earlier visit (`flow.practice.active = false`) before they
open the difficulty menu.

| Entry | Opens | Back from it |
|---|---|---|
| 1 PLAYER / 2 PLAYERS | the difficulty menu → ship select → weapon select → game (unchanged) | the title menu |
| PRACTICE | `PracticeScene` (overlay) → its START: the same difficulty / ship / weapon chain | the title menu |
| OPTIONS | `OptionsScene` (overlay) | the title menu |
| SOUND TEST | `SoundTestScene` (overlay) | the title menu (the title theme comes back) |
| EXIT | the exit confirmation | — |

The last OK of the chain (the difficulty menu with a Direct-mode config, the ship select with a
Direct-mode ship, the weapon select's START) is now `FlowControl.launchGame()`, which replaced the
three `stack.reset(game)` calls: it starts the practice run the practice select chose, or a
normal game.

## The attract loop

| Screen | Starts | Shows | Leaves |
|---|---|---|---|
| `TitleScene` on `PRESS OK` | — | the logo, `PRESS OK`, `HI` | after `TITLE_ATTRACT_TICKS` (**720**, 12 s) without input: `flow.startAttract()`. Any press **or held key** resets the idle count (`title.idle`); the open menu never idles out |
| `DemoScene` | `startAttract` (demos exist) | the next demo's World and its own HUD, `DEMO PLAY` / `PRESS OK` alternating every 32 ticks, the zone card (`ZONE B` / its name) for 180 ticks; the music fades out — **the demo is silent** | the recording's end or a desync → `nextAttract` (the tables); any input → title |
| `HiScoreScene` (attract) | after the demo (or at once without demos) | the chosen ship and difficulty's **1P** table first, then every other table that has rows, `POWER_UP_MODES` × `DIFFICULTY_PRESETS` × `HI_SCORE_MODES` order — at most `HI_SCORE_ATTRACT_PAGES` (4) pages of `HI_SCORE_PAGE_TICKS` (300, 5 s); the title theme | the last page → the story (none: the title); any input → title |
| `StoryScene` | after the tables, when the campaign has a story | the story crawl ([below](#the-story-crawl)); the title theme plays on | the end of the crawl + `STORY_HOLD_TICKS` → title; any input → title |

Rules worth knowing:

- **Any input means any press** — `flow.menuInput.pressed !== 0`, every player merged — and it
  always goes to the title (`toTitle()` resets the stack), **Back included**: on an attract screen
  Back never opens the exit confirmation. The title then starts on `PRESS OK`.
- The loop's transitions are `FlowControl.startAttract()` and `nextAttract(from)`: demo → tables →
  story → title. Without demos the loop starts at the tables; without a story the tables return to
  the title. Each screen is `stack.reset`, so the stack is one scene deep throughout.
- Demos play **in content (path) order, one per visit** (`demo.started % demos.length`): the first
  visit plays zone A, the next zone B, and so on.
- The title theme is pushed again by the tables and the story (`Music Title`, 30-tick fade); the
  music player does not restart a playing track, so it plays on from the title through both.

## Demos are content (`content/demos/`, kind `replay`)

A demo is an ordinary `core/replay` document (`encodeReplay`) with the content header, an `id` and
a `description` — `content/demos/<id>.replay.json`, loaded by `core/data` as the new kind
**`replay`** ([format](../../content/demos/README.md)). Nine demos ship, one per zone (`zone-a` …
`zone-i`, ≈ 1.7 KB each, ~3 KB of the TV bundle together), plus the folder's
`example.replay.json` (two seconds of free flight — the format sample the layout test requires).

- **Loading.** `DEMO_FILE_SCHEMA` checks the structure: the header's fields and types, `ticks`
  1…`MAX_DEMO_TICKS` (18,000 — 5 minutes), exactly `MAX_PLAYERS` input strings, unsigned 32-bit
  hashes. The recorded `config` is only checked to be an object (`decodeReplay` validates it field
  by field when the demo plays). After the references resolve, `checkDemoStages` reports a demo
  whose `header.stageId` the content lacks (`unknown stage id "…"`) and fills `stageIndex`. The
  result is `ContentDb.demos` (`DemoSpec`: `id`, `description`, `stage`, `stageIndex`, `ticks`,
  `document`) and `ContentDb.demoIndex`.
- **Decoding.** `createSceneFlow` decodes every demo once (`decodeReplay` → `SceneFlow.demos`); a
  demo that does not decode or names a stage the content lacks is left out, and the loop plays the
  others.
- **Recording.** `test/golden/demos.ts` records them: `DEMO_SCENARIOS` — the 4-way playtest bot
  (`test/playtest/four-way-bot.ts`) with god mode, `DEMO_TICKS` = **2,400** ticks (40 s) from the
  zone's start, seeds 101…109, zones B, E and H in the Direct-mode MANTA, the others in the
  KESTREL — through `createReplayRecorder` + `createReplayGame`, with the build id `DEMO_BUILD_ID`
  (`'demo'`: like golden replays, hashes — not a build — lock them).
- **Locking.** `test/golden/demos.test.ts` (part of `pnpm test`) plays every committed file back
  through `createDemoPlayback` — the attract loop's own path — and through `playReplay`, requiring
  **every state hash** to match; it also checks that the content lists exactly the scenarios and
  that the format sample is a valid demo. **`pnpm golden:update` re-records the demos with the
  golden replays** (`scripts/golden-update.mjs` runs the whole `test/golden` folder with
  `SHMUP_GOLDEN_UPDATE=1`), so a simulation change re-blesses both in the same commit — with the
  reason in the commit message. Prettier skips the files (`.prettierignore`); never edit them by
  hand.

## Attract playback (`core/replay`)

### Why the module was split

`core/scenes` must play a replay, but `core/replay`'s `index.ts` imports `core/game` (for
`createReplayGame` / `playReplay`), and `core/game` imports `core/scenes` — a cycle. So the module
was split:

| File | Holds | Imports |
|---|---|---|
| `replay/format.ts` | `ReplayHeader`, `createReplayHeader`, the recorder, `createPlayback` and the `DesyncReport`, the file format (`encodeReplay` / `decodeReplay`, RLE + varints + base64) | config, debug, input, platform, world — **no `core/game`** |
| `replay/demo.ts` | `DemoPlayback`, `createDemoPlayback`, `DemoPlaybackOptions`, `DEMO_BUILD_ID` | `./format.ts`, world, debug, events |
| `replay/index.ts` | `createReplayGame`, `playReplay`, `ReplayRun` — and re-exports everything above | `core/game`, `./format.ts`, `./demo.ts` |

`core/scenes` imports `../replay/demo.js` and `../replay/format.js` directly, never
`../replay/index.js`. The public API (`@shmup/core`'s index) is unchanged plus the four M2-15 names.

### `createDemoPlayback(replay, content, { events })`

Builds the World a header describes exactly like `createReplayGame` does — the header's config
re-resolved over the content's difficulty table (`resolveGameConfig(header.config,
content.difficulty ?? DEFAULT_DIFFICULTY_TABLE)`), god mode from `assisted`, `jumpToCheckpoint`
for a checkpoint ≥ 0 — but a bare World instead of a `Game`: its **own** `DebugFlags` (the session's
god-mode switch never reaches it) and the event queue it is given (default: a new private one). It
throws `RangeError` for a stage the content lacks or a missing checkpoint. `DemoPlayback.step()`
polls the recording, `stepWorld`s, and checks the hash when one is due; `running` is
`!playback.done && playback.report.ok`, so **a demo that desyncs ends at once** instead of playing
nonsense. `step()` never allocates (the playback writes into typed arrays; the World's tick is
allocation-free apart from its spawns' coroutines, D29).

### `DemoScene`

- `enter()` fades the music out, starts the next demo (a transition — the World is created here and
  dropped in `exit()`), builds the zone card's two strings from the campaign (`ZONE ` + label, the
  zone's name; `STAGE` / the stage's name outside a campaign), then clears its private queue — the
  World's creation queued its stage theme.
- `tick()`: any press → title; else one recorded tick, then `events.drain(forward)`. The `forward`
  closure (bound once in the constructor) pushes every event to the session's queue **except** the
  kinds in `DEMO_SILENT_KINDS` — `Sfx`, `Music`, `MusicDuck`, `Rumble`, `UserOption`,
  `PrepareStage`, `SoundTest` — so the screen shows the particles, shake, flash, dim and score
  popups but the demo is silent and changes nothing outside its World.
- The flow's `updateFrame()` shows the demo like a game: while the demo scene is visible
  `SceneFlowView.world` is the demo World's view, `tick` its tick, and `hud` the scene's own HUD
  list (`DemoScene.hud` / `hudList`, the boss HP bar following the saved option). The shell's scene
  view counts it as a new World (particles and popups cleared).

## The story crawl

The story is **campaign content**: `campaign.story`, up to `MAX_STORY_PAGES` (8) pages
(`CampaignStoryPage { scene, lines }`), each naming a sprite scene of `STORY_SCENES` — `none`,
`dawn`, `invasion`, `launch` (default `none`) — and 0–`MAX_STORY_LINES` (6) lines of ≤
`MAX_STORY_LINE_LENGTH` (40) characters. `completeCampaign` defaults the fields. The shipped story
is three pages of original text (the Verge worlds, the Iron Tide, KESTREL and MANTA — see
`content/campaign/main.campaign.json`).

`StoryScene` flattens the pages into rows once, when the flow is built (every page's lines, then a
blank row). The rows rise 1 px every `STORY_SCROLL_TICKS` (4 — 15 px a second), `STORY_ROW_HEIGHT`
(11) px apart, through a panel at the bottom of the screen (rows between y 132 and 206); only the
rows inside it are drawn, through `STORY_STRING_SLOTS` (10) slots **taken by row number** — the
credits' trick from M2-14, so any story length fits a fixed budget. A page's scene takes over
when its first row has crawled **half-way up** the panel (`STORY_PAGE_LEAD`), so the picture
changes while that page's text is on screen. When the last row has left, the panel goes and the
last scene holds `STORY_HOLD_TICKS` (90) before the title. `duration` = every row through the
panel, then the hold.

The scenes are arithmetic on the tick count over fixed tables — no new art:

| Scene | Draws |
|---|---|
| `dawn` | `ui/ending-sun` rising 60 px over a dark sea band, `ui/ending-surface` tiles drifting |
| `invasion` | `ui/ending-citadel` and `ui/ending-ark` closing in from the right, three `ui/ending-blast` explosions cycling through a fixed table of 8 positions |
| `launch` | the content's first two ships racing off one after the other (accelerating, a speed line behind each), then the `ui/logo` |

A missing sprite (id -1) is simply left out.

## Hi-score tables per difficulty × ship × mode (`core/save`)

`hiScoreModeKey(config, mode = '1p')` names a table:

| Game | Key | Example |
|---|---|---|
| one player | `<powerUpMode>-<difficulty>` — **unchanged**, so no save migration | `meter-normal`, `direct-hard` |
| co-op (2 PLAYERS) | `…-2p` | `meter-normal-2p` |
| practice | `…-practice` | `direct-easy-practice` |

`HI_SCORE_MODES` (`'1p'`, `'2p'`, `'practice'`) is also the rows' `mode` field; `HiScoreMode` is its
type. The "ship" dimension of the key is the **power-up model** — one ship per model in the
content — and the screen names it after the content's ship (`KESTREL  NORMAL  1 PLAYER`).
`parseHiScoreModeKey(key)` splits a key back into `{ powerUpMode, difficulty, mode }` (`null` for a
key without that shape, and for an explicit `-1p` suffix). Two ships × four difficulties × three
modes make 24 tables, within `MAX_HI_SCORE_TABLES` (32).

**Old co-op rows move.** Before M2-15 co-op games recorded their rows (mode `2p`) into the 1P
tables. `sanitizeSave` now files every row of mode `2p` / `practice` found in a one-player table
into that table's `-2p` / `-practice` table first, then sorts and cuts as before. The save's
version stays 1 (M2-16 owns save v2); the move is idempotent. (Since M2-16 the version-1 → 2
migration does this move once and the sanitiser no longer does —
[saves-and-options.md](saves-and-options.md#migrations-save_migrations).)

**Isolation.** `recordRun` picks the World's own table — `run.practice ? 'practice' :
world.config.coop ? '2p' : '1p'` — and practice counts no `gameOvers` / `stagesCleared`. A co-op or
practice World plays against **its own table's best** (`GameScene.useWorld` sets the board's
hi-score from `save.bestScore(key)`), and **never raises the (1P) session hi-score** the title
shows (`GameScene.recordHiScore` skips them). That decision is made from the World itself — its
config, and the practice flag noted when the World was adopted (`GameScene.worldPractice`) — never
from the run's current state: a new game's `beginRun` clears `run.practice` before the old World is
recorded, and reading the run there let a practice score leak into the next 1P game's `HI` (the
second review round's fix). `SceneFlow.modeKey` names the `-2p` table for a co-op game.

### `HiScoreScene`

A full screen over the starfield: `HI-SCORES`, the table's title line, the column heads, ten rows —
`HI_SCORE_RANK_LABELS` (`1ST` … `10TH`), the name, the score, the zone reached (the campaign zone's
map label of the row's `reached` stage, `-` otherwise; empty rows `---`).

- **Attract** (`showAttract()` before it is pushed): the pages [above](#the-attract-loop).
- **Result** (`showResult(key)` — `FlowControl.showResults()` after the name entry): the game's
  table, the rows it recorded blinking every 16 ticks (`isNewRow` — by object identity), for
  `HI_SCORE_RESULT_TICKS` (900, 15 s); OK or Back after `HI_SCORE_LOCK_TICKS` (30) → title.

The page titles are built in `enter()` (string building on a transition); the rows are drawn from
the table's own strings through 30 slots (rank, name and zone per row). `HI_SCORE_MODE_LABELS` holds
`1 PLAYER` / `2 PLAYERS` / `PRACTICE`.

## The name entry

### The widget (`core/ui`)

`NameEntry` (`createNameEntry(length = NAME_ENTRY_LENGTH)`, 1–8 letters, `RangeError` otherwise) is a
letter picker that needs **only the four directions and OK**:

| Input | Effect | `MenuResult` |
|---|---|---|
| Up / Down (auto-repeat, `repeatDirections`) | the letter under the cursor steps through `NAME_ENTRY_GLYPHS` (`A`–`Z`, `0`–`9`, `.`, `-`, `!`, space), wrapping; an empty letter starts at `A` going up, at the space going down | `Changed` |
| Right, or OK on a letter | the cursor moves on (up to `END`, the field after the last letter) | `Moved` |
| Left, or Back | the cursor moves back (not past the first letter; Back clears a buffered OK) | `Moved` / `None` |
| OK on `END` | `done` — the entry is finished; later input is ignored | `Confirmed` |

The first letter starts on `A`, the others empty (`_`); `open(lockTicks)` starts a new name. OK
presses use the menus' 4-tick buffer and activation lock. `name` builds the result — the chosen
letters, an empty one counting as a space, trailing spaces removed — so `A`, OK ×4 enters `"A"`,
and a blank name becomes `---` when stored. `drawNameEntry(list, entry, stringBase, cx, y,
blinkOff)` draws a 16-px cell per letter with an underline, `END`, and `↑` / `↓` over and under the
focused letter, using `NAME_ENTRY_STRING_SLOTS` (length + 4) slots written only when changed (the
letters are the glyph table's own one-character strings, built once). Nothing allocates per tick or
redraw; the widget is a class so its counters stay unboxed.

### The screen and the pending rows

`recordRun` still inserts the game's rows as `---` **when the game ends** (so the save is written
then — a TV unplugged during the name entry keeps the score) and keeps each row that entered its
table as a `PendingName { key, row, player }`, **by object identity**: `save.hiScores(key)[rank]`
right after `recordScore`, because player 2's row may move player 1's down a place. Then every end
of a game calls **`FlowControl.finishGame()`** — it replaced `toTitle()` after a game over, the
stage clear's `TO BE CONTINUED`, a practice clear, an ending without credits and the credits: the
`NameEntryScene` when a row is pending, else the title.

`NameEntryScene` names each pending row still in its table, in turn (both players of a co-op game —
the menus merge input, so either controller types): `NEW HI-SCORE!`, `1P` / `2P`, the score and the
rank, the letter picker, the hint `↑↓ LETTER  → NEXT  ← BACK` and the seconds left.
`NAME_ENTRY_TIMEOUT_TICKS` (1,800 — 30 s, arcade style) takes the name as it stands. A finished
name goes through **`SaveStore.renameScore(key, row, name)`**, which finds the row by identity and
replaces it with a renamed copy (a new frozen document — a cold path); the scene keeps the new row
so the result table can light it. A row pushed out of its table meanwhile (player 2's score took
player 1's tenth place) is skipped. When none is left the save is flushed and `showResults()`
opens the table. The title theme plays.

## The practice select

`PracticeScene` (overlay over the title, dim 0.5, an opaque 240×116 panel; `PracticeItem` Zone 0,
Checkpoint 1, Loadout 2, Start 3):

- **ZONE** — the campaign's zones as `A AZURE VERGE` …
- **CHECKPOINT** — `START`, then `CHECKPOINT 1` … for the focused zone's checkpoints **after
  x 0** (the one at x 0 is START). The choice's labels run to the busiest zone's count, so
  `clampCheckpoint` keeps the index within the focused zone's after every change: a step forward
  from the zone's last wraps to `START`, **a step back from `START` wraps to the zone's last**
  (the first review round's fix — the plain choice wrapped to its own last label, past a smaller
  zone's count, and the clamp sent it back to `START`), and a ZONE change to a zone with fewer
  checkpoints takes its last.
- **LOADOUT** — `PRACTICE_LOADOUT_LABELS` `STANDARD` / `FULL POWER` for `PRACTICE_LOADOUTS`
  `'default'` / `'full'`.
- **START** — stores the choice (`flow.practice`: zone, checkpoint index into the stage's
  checkpoints or -1, loadout; `active`), chooses one player, and pushes the difficulty menu; the
  ship and weapon select follow as for a normal start, and their last OK (`launchGame()`) calls
  `beginPractice` → `RunState.beginPractice(campaign, zone, checkpoint, loadout)` and resets the
  stack to the game. Back returns to the mode select and clears the choice.

`RunState.loadout` (new) is the practice run's starting loadout; `runWorldConfig(base, run)`
applies it (`resolveGameConfig({ ...base, stage, loadout })`) and still returns `base` itself when
neither the stage nor the loadout differs. `SceneFlow.startPractice(zone, checkpoint, loadout)`
gained the loadout argument. A practice run records into its `-practice` table with the name entry,
counts a game start but no game over or stage clear, and its clear or game over returns to the
title (through the name entry when its score entered the table).

## The sound test

`SoundTestScene` (overlay over the title, dim 0.5; `SoundTestItem` Music 0, Sfx 1, Stop 2, Back 3):

| Row | Left / Right | OK |
|---|---|---|
| MUSIC | the host's track titles (`NONE` and disabled without any) | pushes `SimEventKind.SoundTest` with `id` = the track's library index |
| SFX | `SFX_TEST_LABELS` — every `SFX_CUES` cue in words (`PlayerShot` → `PLAYER SHOT`) | pushes an `Sfx` event for that cue at **x = `PLAYFIELD_W / 2`** (192) |
| STOP | — | `Music Silence` (30-tick fade) |
| BACK | — | the title theme back, close (Back does the same) |

- **OK plays instead of stepping.** A `Choice` steps forward on OK in every other menu; here the
  scene masks Confirm out of a reused copy of the menu input that `menuTick` reads while MUSIC or
  SFX is focused, and pushes the event itself (only once the menu's activation lock is over).
- **Centred sounds.** `connectAudioEvents` pans an `Sfx` event by `x − camera.x`, the title's
  backdrop camera stays at 0, and `sfx`-bus cues are positional by default — pushed at x 0 they
  played at pan −0.6. The playfield's centre plays them centred (the first review round's fix; the
  menus' own cues are on the unpanned `ui` bus).
- **Where the titles come from.** `SceneFlowHost.soundTest` / `GameOptions.soundTest` —
  `SoundTestSetup { music: readonly string[] }`, the music library's track titles in library order.
  `bootShell` passes `musicContent.tracks.map((track) => track.title)`; without it (tests, bare
  gameplay) the MUSIC row is disabled.
- **Playing a track.** `@shmup/shell` `connectSoundTest(dispatcher, audio, onError?)` answers
  `SoundTest` with `AudioEngine.playTrack(index, 0)` (a rejection goes to `onError` and never
  breaks the menu). `playTrack(index, fadeTicks = 0)` loads a track that is not resident (rendered
  by the synth or decoded — a menu, never a stage), keeps it as **the one extra track** — every other
  track outside the prepared set is released, the prepared set (`prepareMusic`'s last set, tracked
  in `prepared`) never is — and plays it from its start (restarting it when it is the track
  playing). It resolves `true` once the track started, `false` for an unknown index, when the
  engine is not attached (the track is loaded all the same) or was destroyed meanwhile.

## The continue countdown, polished

`ContinueScene` keeps its rules (M2-01, M2-06); the panel now also shows a 120-px **time bar**
draining to empty (cyan, red for the last three seconds), the **seconds flashing** red / yellow
for the last three, the **score**, and — once OK counts (after `CONTINUE_LOCK_TICKS`) — a blinking
`PRESS OK` and `BACK: GIVE UP`. It bumps its `uiRevision` every 6 ticks for the bar. In a co-op
game the two players' credits take the score's place.

## Budgets: string slots and the bundle

- The UI list's string slots went from 256 to **384** (`UI_STRINGS`; commands stay 384): the name
  entry (8 + 7), the hi-score screen's 37 (7 + 30 row slots), the story's 10, the demo's 4 and the
  two new menus. `createSceneFlow` still throws `RangeError` when the scenes need more.
- The Tizen `app.js` is **343.8 KB gzipped of its 350 KB budget** (331.5 after M2-14: ~9 KB of
  scene code, ~3 KB of demos). M2-16 moved every UI string into `content/strings/en.strings.json`
  and raised the budget to 384 KB (≈ 359 KB used) ([build-test-deploy.md](build-test-deploy.md)).

## Determinism

Nothing here changes what a World simulates, so no golden replay was re-blessed. The front end is
presentation-side session state (menus, timers, the stack, the save), never hashed. A demo is a
replay and is checked like one — every hash — both by `test/golden/demos.test.ts` and, at run time,
by `DemoPlayback` itself (a desync ends the demo). A practice run's World differs from a normal one
only through its config (`loadout`, the checkpoint start) — two flows fed the same inputs through
the practice select stay in lockstep.

## Zero allocation

The per-tick and per-frame paths of every new screen are allocation-free; the guards run in their
own files:

- `scenes-attract-alloc.test.ts` — the demo play (a long free-flight demo stepped through the
  replay playback, its events forwarded, its HUD and the frame composed every tick), the hi-score
  tables paging, the story crawling over its scenes, the name entry answering the four directions.
  The screens are held in place by rewinding their clocks (a transition would allocate by design).
- `scenes-front-end-alloc.test.ts` — the practice select stepping every row (CHECKPOINT kept
  within the zone's) and the sound test choosing and playing (its `SoundTest` / `Sfx` events, the
  OK mask), the frame composed every tick.

Patterns used: scenes are classes with plain number fields; the demo's `forward` closure and its
private queue are created once in the constructor; `DEMO_SILENT_KINDS` is a `Uint8Array` looked up
by kind; strings are built on transitions (the zone card, the page titles, the story's rows) or
taken from tables (glyph strings, rank labels); the story and the hi-score screen take string slots
by row number.

**Gotcha found by the guards.** A long replay-*recording* session in the same worker (the demo
recorder) left V8 feedback that made any World created afterwards allocate about 12 bytes a tick
(a plain game's World in a fresh worker does not). The demo guard therefore plays a **synthetic**
weaving recording built with `packReplayInput` (no periodic hash) instead of recording one; the
shipped game never records.

## Running it

```bash
pnpm dev                    # → http://localhost:5173 — leave the title on PRESS OK for 12 s
pnpm test                   # includes test/golden/demos.test.ts (every demo, every hash)
pnpm golden:update          # re-records the golden replays AND the demos (intended sim changes only)
pnpm test:e2e               # attract.spec.ts and front-end.spec.ts on the web and Tizen test builds
```

In a test build (`pnpm --filter @shmup/web build:test`, the e2e builds) `window.__shmupDebug.game.scenes`
exposes the flow: `title.idle`, `demo.demo.playback.report`, `hiScores.pages`, `story.duration`,
`nameEntry.entry` … — the e2e specs freeze the sim with frame advance and step exact tick counts
through the loop (`test/e2e/frame-advance.ts`). The saved tables are in `localStorage` under
`shmup-cup:save.v1` (keys like `meter-normal-practice`).

## Extending it

| To add… | Do this |
|---|---|
| A demo | Add a `DemoScenario` to `test/golden/demos.ts` (id, description, stage, config — seed, ship) and run `pnpm golden:update`; the new `content/demos/<id>.replay.json` is bundled automatically (the content plugin inlines every `content/**/*.json`); the order is the file path's. `demos.test.ts` fails until content and scenarios match |
| A story page | Add it to `story` in `content/campaign/main.campaign.json` (≤ 8 pages, ≤ 6 lines of ≤ 40 characters); nothing else |
| A story scene | Append the name to `STORY_SCENES` (`core/data/campaign.ts`), a code to `StorySceneCode` and a `draw…` method to `StoryScene` (arithmetic on `t`, sprites from `UiSprites` — fall back when an id is -1); document it in `content/campaign/README.md` |
| A hi-score mode (boss rush …) | Append to `HI_SCORE_MODES` and `HI_SCORE_MODE_LABELS`, pick it in `recordRun` and `GameScene.useWorld` / `recordHiScore`; keep the key ≤ 32 characters and the table count ≤ `MAX_HI_SCORE_TABLES` |
| A mode-select entry | Append it to the title's items **and** `TitleItem` (never renumber the old ones without updating every spec that walks the menu), handle it in `TitleScene.tick` |
| A sound-test row | Add it to `SoundTestItem` and the menu; if OK must not step it, extend the `playable` mask in `tick` |
| A name-entry glyph | Append to `NAME_ENTRY_GLYPHS` (the pixel font must have it — `pnpm content:check` does not check this string) |

## Tests

| Where | Covers |
|---|---|
| `packages/core/test/ui/ui-name-entry.test.ts`, `-edge` | The letter picker with the four directions and OK only (`A` + OK ×4 = `A`, a full name), wrap from either end and from an empty letter, every glyph once round, auto-repeat to `END` and back, the lock and buffer (early / late OK, Back cancelling it, same-tick chords), trimming, 1–8 letters, a finished entry, drawing (cells, cursor, slots from `stringBase` only) |
| `packages/core/test/save/save-hiscore-modes.test.ts`, `-edge` | Keys per ship, difficulty and mode and parsing them back (other shapes refused), insertion and sorting per table, `renameScore` by identity (a row moved by another, renamed twice, pushed out; written on the next flush), the co-op / practice rows' move in `sanitizeSave` (merged, sorted, cut, keys ≤ 32 characters, the table cap, bad tables and rows skipped) |
| `packages/core/test/replay/replay-demo.test.ts`, `-edge` | `createDemoPlayback`: a recording played to its end in sync into the given queue, the header's start, a tampered demo ending at its first differing hash (or at the end when only the final hash differs), a header the content cannot play refused, a zero-tick recording, two demos of one recording side by side with their own debug switches, free flight, the config resolved over the content |
| `packages/core/test/data/data-demos.test.ts`, `-edge` | The `replay` kind (path order, the stage resolved, unknown stages, duplicate ids, the structure — ids, tick bounds, one input stream per player, 32-bit hashes, the header, a newer format), the campaign's `story` (defaults, unknown scenes, the page / line / character limits, an empty story) |
| `packages/core/test/scenes/scenes-attract.test.ts`, `-edge` | The cycle's exact timings (720 / the demo's length / 300 per page / the story's duration), the demo in sync with the bare replay and silent while its visible events are forwarded, any input → title in every screen (player 2's, Back on the TV), the idle reset (a press, a held key, the open menu, the exit dialog), missing demos / story / stages, demos in turn and cut short, a desync or a bad checkpoint ending a demo, the campaign zone's card, at most four tables in order (the difficulty chosen last first, empty rows), the story's rows inside the panel on every tick of eight pages, a story without lines |
| `packages/core/test/scenes/scenes-front-end.test.ts`, `-edge` | The name entry with the four directions (Back only goes back a letter), its timeout, no entry without a new row, co-op names in the `-2p` table (only player 2's, one row without a join, each entry timing out in turn), the result table's lock, blink and timeout; the practice select (rows, CHECKPOINT wrapping within the zone both ways — the first review fix —, `CHECKPOINT n` → the stage's index, LOADOUT, the choices kept, one player after a 2 PLAYERS visit, disabled without a campaign) and its isolation (its own table, never the session hi-score — also across RETRY and into the next normal game, the second review fix; co-op likewise); the sound test (every cue labelled, the host's tracks, centred SFX, no MUSIC row without the host, the lock and a held OK, STOP, Back with the title theme); the continue polish (score, bar turning red and draining, `PRESS OK`, both players' credits) |
| `packages/core/test/scenes/scenes-attract-alloc.test.ts`, `scenes-front-end-alloc.test.ts` | The guards [above](#zero-allocation) |
| `packages/core/test/helpers/front-end.ts`, `front-end-session.ts` | Test content (the campaign map of `./campaign.ts` plus a story, a long open stage and a demo recorded on it; `checkpoints` per stage) and a headless session helper (hold / press for either player, end a game, read the UI list and the drained events) |
| `packages/audio-web/test/engine/engine-sound-test.test.ts`, `-edge` | `playTrack`: any track by index, a track outside the set loaded and kept as the one extra (a playing one survives a loading phase, the next replaces it, a resident one is not loaded twice), nothing for an unknown index, before the unlock or after `destroy` (also during the load), the loader's rejection, playing again after STOP, the title theme not restarted |
| `packages/shell/test/dispatch/dispatch-sound-test.test.ts`, `dispatch-sound-test-runtime.test.ts`, `test/boot/boot.test.ts` | `connectSoundTest` (the track the event names, from its start; a failed load reported, never thrown); a runtime run through the flow and a real engine (a library track, a centred SFX cue, STOP, the title theme again); the boot handing the library's titles to the flow |
| `test/integration/attract-flow.test.ts`, `-edge` | On the shipped content: all nine demos through the flow in sync (in zone order, each opening on its zone card), then the tables (the shipped ships named) and every story page; the practice select offering every zone and checkpoint and starting there |
| `test/golden/demos.test.ts` | Every committed demo played back with every hash (attract path and golden path); the scenario list; the format sample |
| `test/integration/campaign-flow.test.ts` | After the credits of a whole run, `ACE` entered with the four directions and the table shown |
| `test/e2e/attract.spec.ts` | Web: the loop's timings under frame advance, zone A's then zone B's demo, a key → title; Tizen from disk: the demo and the remote's OK |
| `test/e2e/front-end.spec.ts` | Web: practice → zone B at a checkpoint with FULL POWER → game over → `BB` from the arrows and Enter → the practice table, saved in `localStorage` (the 1P table empty); the sound test playing a track and a sound, Esc closing it; Tizen from disk: a name entered with the remote's arrows and OK |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| A spec that opens OPTIONS lands on PRACTICE (or SOUND TEST) | `TitleItem.Options` is 3 since M2-15 — press Down once more (twice after M2-06's change); use `TitleItem`, not a count |
| A game over goes to `nameEntry`, not `title` | Expected when a score entered its table: `finishGame()`. Tests that expect the title after an end screen pass the name entry (OK on `END`, or wait `NAME_ENTRY_TIMEOUT_TICKS`) and then the result table (OK after its 30-tick lock) |
| A test's saved row is `---` though a name was typed | `renameScore` replaces the row object — read `save.hiScores(key)` again; a row kept from before the rename is the old one |
| Practice scores show up in the 1P `HI` | Not any more: decide such things from the World (`GameScene.worldPractice`, `world.config.coop`), never from `run.practice`, which the next `beginRun` clears before the old World is recorded |
| The sound test's SFX all come from the left | An `Sfx` event at x 0 with the title's camera at 0 — push it at `PLAYFIELD_W / 2` |
| OK on the sound test's MUSIC row changes the track instead of playing it | Confirm reached `menuTick` — mask it out for the playable rows (the scene's `input` copy) |
| The attract loop never starts in a test | Something is held (`idle` resets on `held` too), the title menu is open, or fewer than 720 ticks ran |
| The demo plays a few seconds and the tables come early | The demo desynced (content or simulation changed since it was recorded) — `demos.test.ts` fails too; re-bless with `pnpm golden:update` if the change is intended |
| A World in an allocation guard allocates ~12 bytes a tick after a replay was recorded in the same file | V8 feedback from the recording session — play a synthetic recording (`packReplayInput`), as `scenes-attract-alloc` does |
| `core/scenes` importing `../replay/index.js` creates a cycle | Import `../replay/format.js` / `../replay/demo.js` instead |
| The demos are reformatted by `pnpm format` | They must not be — `content/demos/*.replay.json` is in `.prettierignore`; a hand edit breaks the hashes |

## Next steps that build on this page

- **M2-16** (done) — Options, rebinding and accessibility: every UI string of these screens moved to
  `content/strings/en.strings.json` (the hi-score modes and ranks and the SFX names — `sfx.<Cue>` —
  included; the story's text stays campaign content); save v2 (the chosen
  difficulty remembered — the ship and the loadout stay session-only; the co-op / practice row move
  became the v1 → v2 migration); the rebind widget joined the UI kit
  ([options-rebinding-and-accessibility.md](options-rebinding-and-accessibility.md)).
- **M2-17** — platform polish (Electron's file store for the save — the tables included).
- **M3-01** — replays of the scene flow (menus, continues) and save / share / fast-forward; the
  demos stay bare-World recordings.

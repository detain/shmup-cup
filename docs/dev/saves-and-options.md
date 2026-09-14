# Saves, user options and the Options screen

How the game remembers the player's settings and best scores, and how the Options screen changes
them while the game runs: the versioned save document (`core/save`), the presentation-only
`UserOptions` (`core/config`), the `OptionsScene` and its `Choice` widget (`core/scenes`,
`core/ui`), the `UserOption` events, the shell's boot-time loading, the input-profile choice the
apps offer, and the boot timing. Added by plan step **M1-17**; **M2-02** added the first display
option — the enemy bullets' colour-blind palette (BULLETS); **M2-08** the scale mode, the
screen-shake switch, reduced flashing and the hitbox marker (SCALE, SHAKE, FLASHES, HITBOX —
what they draw is on [presentation-polish.md](presentation-polish.md#display-options)); **M2-09**
the boss HP bar (BOSS HP — [advanced-bosses.md](advanced-bosses.md#the-boss-hp-bar)).

This page is the *how and why*. Exact signatures are in
[api-reference.md](api-reference.md#save--versioned-saves-hi-score-tables) (`save`),
[api-reference.md](api-reference.md#config--session-configuration) (`config`) and the `ui`,
`scenes`, input-web and shell sections of the same page; the TSDoc in the sources
(`packages/core/src/save`, `config`, `scenes`, `ui`, `events`; `packages/shell/src/boot`,
`dispatch`; `packages/input-web/src/rebind`; `apps/*/src/boot`) is the authoritative reference.
The scene stack the Options screen lives on is [scenes-and-ui.md](scenes-and-ui.md); the audio
buses the volumes drive are [audio.md](audio.md); the input profiles themselves are
[input-profiles.md](input-profiles.md). What players see is in
[`../client/preview-build.md`](../client/preview-build.md#the-options-screen).

Background: `shmup_feat.md` §21 (the Options menu's P0 audio sliders; saves — hi-scores and
options, versioned JSON with migrations; Tizen deletes user data on uninstall), §23 (the storage
abstraction, the Tizen lifecycle, launch ≤ 10 s), §3 (pause on hidden); plan §1.5 (sim-affecting
options live in `GameConfig`, everything else outside it) and decision **D31** (persistence
through `Platform.storage`).

## The picture at a glance

```text
 boot (@shmup/shell bootShell)                         the running game (@shmup/core)
┌──────────────────────────────────────────────┐    ┌──────────────────────────────────────────┐
│ platform = options.platform(renderer)        │    │ createSceneFlow(host: { …, save,         │
│ loaded = await loadSave(platform.storage)    │    │                    inputProfiles })      │
│   JSON → SAVE_MIGRATIONS → sanitizeSave      │    │  title HI ← save.bestScore(modeKey)      │
│   corrupt / unreadable → defaults            │    │  OPTIONS (title, pause) → OptionsScene   │
│     + the text copied to save.corrupt        │    │   MASTER / MUSIC / SFX sliders ─┐        │
│ save = createSaveStore(storage, loaded)      │    │   CONTROLS (Choice) ────────────┤ live   │
│ applyAudioOptions(audio, save.options.audio) │    │   BULLETS SCALE SHAKE FLASHES   │        │
│ applyDisplayOptions(renderer, …display)      │    │   HITBOX (M2-02 / M2-08) ───────┤        │
│                                              │    │   BACK / Back → save.setOptions │        │
│ inputProfiles.apply(savedId, 'save')         │    │                 + save.flush()  │        │
│ createGame(…, { scenes: 'boot', save,        │───►│  game over / stage clear:       │        │
│   inputProfiles: { choices, active } })      │    │   recordScore + count + flush   │        │
│ connectOptionEvents(events, audio, apply)  ◄─┼────┼── SimEventKind.UserOption events ┘        │
│ canvas data-shmup-boot-ms, Shell.bootTiming  │    │  (the game's one event queue)            │
└──────────────────────────────────────────────┘    └──────────────────────────────────────────┘
        │ SaveStore.flush(): writes only when the serialised document changed
        ▼
 Platform.storage — web / TV: localStorage "shmup-cup:save.v1" (TV: deleted on uninstall)
```

## The save document (`SaveData`, format 1)

One JSON document under the storage key **`save.v1`** (`SAVE_STORAGE_KEY`). The web and Tizen
storage adapters prefix their keys, so in `localStorage` it is **`shmup-cup:save.v1`**; headless
tests use `createMemoryStorage()`. Electron's renderer runs the web build and uses the same
`localStorage` until the file store of M2-17.

```json
{
  "version": 1,
  "options": {
    "audio": { "master": 10, "music": 7, "sfx": 10 },
    "input": { "profileId": "tizen-remote-diagonal" },
    "display": {
      "bulletPalette": "standard",
      "scaleMode": "integer",
      "screenShake": true,
      "reduceFlashing": false,
      "showHitbox": false,
      "bossHpBar": false
    }
  },
  "hiScores": {
    "meter-normal": [
      { "name": "---", "score": 48200, "reached": "test-range", "mode": "1p", "difficulty": "normal" }
    ]
  },
  "stats": { "gamesStarted": 12, "gameOvers": 9, "stagesCleared": 2 }
}
```

| Field | Meaning |
|---|---|
| `version` | `SAVE_VERSION` = 1. Drives the migrations; a document without it counts as version 0 |
| `options` | The player's `UserOptions` (below): volume levels 0–10, the chosen key / remote profile id (or `null` = the platform default), display options (M2-02: `bulletPalette`; M2-08: `scaleMode`, `screenShake`, `reduceFlashing`, `showHitbox`; M2-09: `bossHpBar`) |
| `hiScores` | Tables by **mode key** (`hiScoreModeKey(config)` = `<powerUpMode>-<difficulty>`, `meter-normal` in M1; since M2-01 one per difficulty — `meter-easy`, `meter-normal`, `meter-hard`, `meter-arcade`; since M2-05 the Direct-mode MANTA's games in `direct-easy` … `direct-arcade` — no format change, the key was always `<powerUpMode>-<difficulty>`), each sorted best first, at most `HI_SCORE_TABLE_SIZE` = 10 rows, at most `MAX_HI_SCORE_TABLES` = 32 tables. A mode nobody scored in has no table |
| `stats` | Counters: `gamesStarted` (START and RETRY STAGE), `gameOvers`, `stagesCleared` — whole numbers, capped at 2³¹−1 |

The key stays `save.v1` for the whole format family: a new format bumps the document's
`version`, not the key, so an older save is always found and migrated. Hi-score rows reuse the
`HiScoreEntry` type `core/scoring` already declared (`save` re-exports it) instead of a second
row type.

## Loading (`loadSave`, `parseSave`)

`loadSave(storage)` reads the key and runs `parseSave(text)`: **JSON → migrations → sanitiser**.
It never rejects and never throws — a failing `storage.get` counts as an empty save.

| `status` | When | The game gets | Side effect |
|---|---|---|---|
| `'empty'` | Nothing stored (a first launch) | `createDefaultSave()` | — |
| `'ok'` | A version-1 document | The sanitised document | — |
| `'migrated'` | An older document (version 0) | The migrated, sanitised document | — (the next flush writes it in the new layout) |
| `'corrupt'` | Not JSON, or JSON that is not an object | Defaults | The text is copied to **`save.corrupt`** (`SAVE_CORRUPT_KEY`) |
| `'unreadable'` | A version newer than this build, a malformed version (not a non-negative integer), a missing migration step, or a migration that threw | Defaults | Copied to `save.corrupt` too |

`LoadedSave` = `{ data, status, fromVersion, reason, text }` (`reason` is the parse / migration
message, for debugging). The main key is **not** rewritten at load: a corrupt or migrated save is
replaced by the next `SaveStore.flush()` — the first time the player closes the Options screen or
finishes a game. The copy under `save.corrupt` is awaited but best effort (a failing copy is
ignored); it is overwritten by the next corrupt save.

### Migrations (`SAVE_MIGRATIONS`)

`SAVE_MIGRATIONS[n]` is a `SaveMigration { from: n, to: n + 1, migrate(data) }`; `migrateSave`
runs the steps a document needs and returns the migrated (not yet sanitised) document with the
version it was read at. A step must never throw for any input — read what is usable and drop the
rest; the sanitiser fills the gaps (a step that throws anyway makes the save `unreadable`).

**Version 0** is the pre-release layout of the skeleton's placeholder `SaveData` (plan M1-17's
"v0 fixture", `packages/core/test/save/fixtures/save-v0.json`):

```json
{
  "hiScores": [{ "name": "ACE", "score": 48200 }, { "name": "BOB", "score": 91000 }],
  "options": { "masterVolume": 0.8, "musicVolume": 0.45, "sfxVolume": 1, "profile": "tizen-remote-diagonal" },
  "unlocks": ["extra-edit"]
}
```

`migrateV0` turns the flat list into the `meter-normal` table (rows get mode `1p`, difficulty
`normal`), the float volumes into levels (`round(value × 10)`, then clamped by the sanitiser),
`profile` into `input.profileId`, and **drops `unlocks`** — version 1 has none (they return with
M2's unlocks).

### Sanitising (`sanitizeSave`)

Every field is checked, clamped or replaced by its default; unknown fields are dropped; the result
is frozen. The rules:

- **Options** go through `core/config` `resolveUserOptions` (below).
- **Tables**: only keys shaped like a mode key (lower-case kebab, ≤ 32 characters — `__proto__`,
  `constructor` and the like never match), taken in key order until 32 tables are kept (bad keys
  and empty tables do not use up slots); a row needs a finite score ≥ 0 (floored, capped at
  `MAX_SCORE`); the text fields are cut (`name` to `HI_SCORE_NAME_MAX` = 8 characters, empty →
  `DEFAULT_HI_SCORE_NAME` `---`; `reached` / `mode` / `difficulty` to 32); each table is sorted
  best first — **stable**, by hand, because `Array.prototype.sort` is only stable from Chrome 70 —
  and cut to 10.
- **Stats**: whole numbers `0 … 2³¹−1`; anything else (a string, NaN, a negative, `-0`) is 0.

## Writing (`SaveStore`)

`createSaveStore(storage, loaded)` wraps the frozen document the game plays with. Every change
replaces the document with a new frozen one (`setOptions`, `recordScore`, `count`) — changes
happen on menu actions and at the end of a game, never per tick. Nothing reaches storage until
**`flush()`**:

- `flush()` serialises the document and writes it **only when the text differs** from the text the
  storage holds (the text loaded as `'ok'`, or the last one written). Calling it after every menu
  close costs one serialisation when nothing changed. `writeSave(storage, data)` writes
  unconditionally and is not used by the game.
- The serialisation is **canonical** (`serializeSave`): fields in a fixed order, the tables in key
  order, every row field by field. The store appends a new mode's table while the sanitiser sorts
  them on load, so without that a save with several tables would look changed — and be
  rewritten — after every reload (found by the M1-17 tests).
- The new text counts as stored as soon as the write starts, so a second flush right after does
  not write again. When the write **fails** (and no later flush has started), the store forgets
  what storage holds, so the next flush writes whatever the document is then — overlapping
  writes that all failed never leave one of them counted as stored (also an M1-17 test finding).
- `flush()` never rejects: it resolves `true` when a write happened and succeeded, `false` when
  nothing changed, there is no storage, or the storage failed. `writes` counts the successes.
- `createSaveStore(null)` is a **memory-only** store: everything works, `flush` never writes. The
  scene flow uses one when its host passes no save (tests, tools).
- A store created from a load counts the stored text as written only for status `'ok'`, so a
  migrated, corrupt or partly invalid document (one the sanitiser changed) is replaced at the next
  flush.

The scene flow flushes in two places: when the **Options screen closes** and when a game ends on
the **game-over** or **stage-clear** screen (after recording the score). Nothing is written on
exit — on the TV the app may be killed at any time, and nothing is lost because the save was
written when it changed (`shmup_feat.md` §23).

## Hi-score tables

`insertHiScore(table, entry)` returns a new table and the rank (0 = best, −1 = did not enter). A
row enters when the table has fewer than 10 rows or its score **beats** the 10th; it goes **below**
rows with the same score (the older record keeps its place); a score of 0 never enters (a game
that scored nothing leaves no row). `createHiScoreEntry(score, fields)` normalises a row (floors
and caps the score, name `---` until the name entry of M2-15). `SaveStore.recordScore(modeKey,
entry)` does the insertion in the store and refuses a malformed mode key or a 33rd table;
`hiScores(modeKey)` / `bestScore(modeKey)` read a table.

What the scene flow records (`FlowControl.recordRun`, when the game-over screen opens, when a
single-stage run's stage-clear screen opens, or — M2-10 — when a campaign run's **final** zone is
cleared, just before its ending; a zone cleared on the way to the zone map only counts
`stagesCleared` and flushes; a practice run records nothing —
[campaign-and-bonus-stages.md](campaign-and-bonus-stages.md#saves-and-hi-scores)):

- a row per playing player: player 1 always, player 2 when active — `reached` = the World's
  stage id (`''` in open space), `mode` `1p` (`2p` for both rows of a co-op game — M2-06; they go
  into the same table as one-player games), `difficulty` = the World's (since M2-01 the preset
  chosen under START), into that preset's table (`hiScoreModeKey(world.config)`);
- the statistic (`gameOvers` or `stagesCleared`), then `flush()`;
- player 1's rank is kept on the screen (`GameOverScene.rank`, `StageClearScene.rank`): the
  game-over screen shows **`NEW HI-SCORE`** under its panel when it is 0.

**QUIT TO TITLE and RETRY STAGE record nothing** (the arcade rule: only finished games count),
although the session hi-score in memory still takes the abandoned game's best score, as before.
The session hi-score (the title's `HI`, the HUD's `HI`) starts from `save.bestScore(modeKey)`
when the flow is created — since M2-01 one per difficulty preset, each from its own table, and
since M2-05 one per power-up mode and preset (the ship select's choice picks the mode); the
title shows the chosen ship's and preset's and the difficulty menu the focused preset's. The table is chosen by
the config's power-up mode and difficulty, not the stage: the Test Range, the Boss Range and open
space on Normal all share `meter-normal`. A score recorded after a continue ends in the number
of continues used ([difficulty-and-rank.md](difficulty-and-rank.md#the-continue-digit-markcontinue)).

## User options (`core/config`)

```ts
interface UserOptions {
  readonly audio: { readonly master: number; readonly music: number; readonly sfx: number }; // 0…10
  readonly input: { readonly profileId: string | null }; // null = the platform's default
  readonly display: {
    readonly bulletPalette: BulletPalette; // M2-02
    readonly scaleMode: ScaleMode; // M2-08: 'integer' | 'fit' | 'stretch'
    readonly screenShake: boolean; // M2-08
    readonly reduceFlashing: boolean; // M2-08
    readonly showHitbox: boolean; // M2-08
    readonly bossHpBar: boolean; // M2-09
  };
}
```

These are the **presentation-only** options (plan §1.5): they never affect the simulation, so
they are not in `GameConfig`, not in replay headers and not hashed. `DEFAULT_USER_OPTIONS` puts
every volume at `VOLUME_LEVELS` = 10 — the mix the audio content was made for — and no profile.
`resolveUserOptions(anything)` builds valid, frozen options field by field: finite volumes are
rounded and clamped to 0–10 (anything else takes the default; `-0.4` becomes `0`, not `-0`), a
`profileId` must match `INPUT_PROFILE_ID_PATTERN` (lower-case kebab) and be ≤ 64 characters, else
`null`. Whether the id names an existing profile is the host's business — an unknown one is
skipped when applied.

**The bullet palette (M2-02).** `display.bulletPalette` is one of `BULLET_PALETTES` —
`standard` (the default), `deuteranopia`, `protanopia`, `tritanopia` (`shmup_feat.md` §21); any
other value resolves to `standard`. It only changes which sprite variants the renderer draws
([rendering-and-shell.md](rendering-and-shell.md#colour-blind-bullet-palettes)). The save format
stays **version 1**: a save written before M2-02 has `display: {}`, which resolves to `standard` —
no migration step was needed, and `serializeSave` now writes the field.

**The M2-08 display options.** `display.scaleMode` is one of `SCALE_MODES` — `integer` (the
default), `fit`, `stretch` — else `integer`; `screenShake` (default `true`), `reduceFlashing`
(`false`) and `showHitbox` (`false`) are booleans, anything else takes the default. Again **no
migration**: a version-1 save without them resolves to the defaults, and `serializeSave` writes
all five display fields in a fixed order. What each one does on screen — the viewport per scale
mode, the shake switch, the flash limiter's reduced mode, the hitbox marker — is on
[presentation-polish.md](presentation-polish.md#display-options).

**The boss HP bar (M2-09).** `display.bossHpBar` (default **`false`** — neither source game had
one, so it is opt-in) is a boolean like the others: an older version-1 save resolves it to
`false` with **no migration**, and `serializeSave` writes it after `showHitbox` (six display
fields). It is not applied by the shell: the scene flow copies the saved value into the game
HUD's `showBossHp` on every displayed frame
([scenes-and-ui.md](scenes-and-ui.md#the-hud)).

**The volume curve.** `volumeGain(level) = (level / 10)²` turns a slider level into the linear
bus gain, so the slider's middle sounds about half as loud:

| Level | 0 | 1 | 3 | 5 | 7 | 10 |
|---|---|---|---|---|---|---|
| Gain | 0 (silent) | 0.01 | 0.09 | 0.25 (≈ −12 dB) | 0.49 | 1 |

Out-of-range levels are clamped; NaN gives 0. The squaring is plain multiplication (the `**`
operator is banned in core).

## The Options screen (`OptionsScene`)

An overlay (dim `PAUSE_DIM` = 0.5) with an opaque 288×192 panel at y 12 since M2-09 (288×182 at
y 18 in M2-08, 288×128 before, 112 px tall before M2-02; the menu's first row at y 38), opened by **OPTIONS** on the title and on the pause menu —
both items are enabled since M1-17 (a game under the pause menu stays frozen). Items
(`OptionsItem`): `Master 0`, `Music 1`, `Sfx 2`, `Controls 3`, `Bullets 4` (M2-02), `Scale 5`,
`Shake 6`, `Flashes 7`, `Hitbox 8` (M2-08), `BossHp 9` (M2-09), `Back 10` (9 in M2-08, 5 before,
4 before M2-02 — code that names `OptionsItem.Back` follows; a test or tool that counts rows does
not).

```text
            OPTIONS
   → MASTER   ▬▬▬▬▬▬▬▬▬▬  10
     MUSIC    ▬▬▬▬▬▬▬     7
     SFX      ▬▬▬▬▬▬▬▬▬▬  10
     CONTROLS SAFE 4-WAY (DEFAULT)
     BULLETS  STANDARD
     SCALE    INTEGER
     SHAKE    ON
     FLASHES  NORMAL
     HITBOX   OFF
     BOSS HP  OFF
     BACK
```

- **Opening** reads the save's volumes into the three sliders (`createSlider(0, 10, 1, …)`), the
  profile in use into CONTROLS, the saved bullet palette into BULLETS (a `Choice` of
  `BULLET_PALETTE_LABELS`: `STANDARD`, `DEUTERANOPIA`, `PROTANOPIA`, `TRITANOPIA`), and (M2-08)
  the saved display options into SCALE (a `Choice` of `SCALE_MODE_LABELS`: `INTEGER`, `FIT`,
  `STRETCH`), SHAKE (a `Toggle`), FLASHES (a `Choice` of `FLASH_LABELS`: `NORMAL`, `REDUCED`),
  HITBOX (a `Toggle`) and (M2-09) BOSS HP (a `Toggle`), focuses MASTER and locks activation for 2 ticks (like every flow menu). The
  screen re-reads the save every time it opens.
- **Up / Down** move; **Left / Right** change the focused slider by one level (held directions
  auto-repeat — 18 / 6 ticks) or step CONTROLS through the profiles / BULLETS through the
  palettes / SCALE and FLASHES through their labels, wrapping; on SHAKE, HITBOX and BOSS HP Left = OFF,
  Right = ON and OK flips (a press that changes nothing pushes nothing); **OK on a choice** steps
  forward too; OK on a slider does nothing and makes no sound.
- **Every change applies at once**: a slider pushes a `UserOption` event with its new level, a
  CONTROLS step one with the profile's index, a BULLETS step one with the palette's
  `BULLET_PALETTES` index, SCALE the mode's `SCALE_MODES` index, SHAKE / FLASHES / HITBOX / BOSS
  HP 1 or 0 (below); all play the move sound, queued after the
  change, so the MASTER and SFX sliders' clicks are already heard at their new volume.
- **BACK or the Back button** stores the three levels, the display options and — only when CONTROLS
  ended on a different profile than it opened with — the chosen profile id in the save
  (`setOptions`), calls
  `flush()` (a write only if something differs), plays `MenuBack` and closes. A CONTROLS change
  stepped away and back is applied live but not stored.
- **CONTROLS is disabled** (showing `DEFAULT`) when the host offers no profiles — the dev scenes,
  tests without `inputProfiles`, a content without key profiles.

### The `Choice` widget (`core/ui`)

CONTROLS is a new UI-kit widget: `createChoice(labels, index)` (1–255 upper-case labels, copied
and frozen; the index clamped) gives a `Choice { labels, index, label }` — a class, so the index
stays an unboxed small integer. In a list menu it is `{ label: 'CONTROLS', choice }`
(`MenuItemKind.Choice` = 3). `menuTick`: Left / Right step it and wrap (`Changed`), a buffered
Confirm steps it forward (`Changed`; with a single label it stays `Confirmed`). `drawMenu` draws
the current label at `valueX`, and `menuStringSlots(menu)` now counts **one extra string slot per
choice item** (items + 3 + choices) — the label is written into its own slot only when it
changes, so redrawing allocates nothing.

## Live changes: the `UserOption` event

The Options screen does not know the audio back-end or the input adapter; it pushes events into
the game's one event queue like the menu sounds, and the shell applies them after the frame's
drain. `SimEventKind.UserOption` = **13** (appended; `SIM_EVENT_KIND_NAMES[13]` = `'userOption'`):

| `id` (`UserOptionKind`) | `param` | The shell (`connectOptionEvents`) |
|---|---|---|
| `MasterVolume 0` | level 0–10 | `audio.setBusVolume('master', volumeGain(level))` |
| `MusicVolume 1` | level 0–10 | the same for `music` |
| `SfxVolume 2` | level 0–10 | the same for **`sfx` and `ui`** — the menu sounds follow the SFX slider |
| `InputProfile 3` | index into the flow's profile choices | the app's `inputProfiles.apply(choices[index].id, 'options')`; a negative or out-of-range index is ignored |
| `BulletPalette 4` (M2-02) | index into `BULLET_PALETTES` | the palette callback (`connectOptionEvents`' fourth argument) with `BULLET_PALETTES[index]` — the shell passes `renderer.setBulletPalette`; an index outside the list, or no callback, is ignored |
| `ScaleMode 5` (M2-08) | index into `SCALE_MODES` | `display.setScaleMode(SCALE_MODES[index])` — `display` is the fifth argument, a `DisplayTarget` (the shell passes the renderer); a bad index or no target is ignored |
| `ScreenShake 6` (M2-08) | 1 = on, 0 = off | `display.effects.settings.screenShake = param !== 0` |
| `ReduceFlashing 7` (M2-08) | 1 = reduced, 0 = normal | `display.effects.settings.reduceFlashing = param !== 0` |
| `ShowHitbox 8` (M2-08) | 1 = on, 0 = off | `display.setShowHitbox(param !== 0)` |
| `BossHpBar 9` (M2-09) | 1 = on, 0 = off | Nothing — ignored like an unknown kind: the HUD follows the **saved** option once BACK stores it |

`applyAudioOptions(audio, options)` sets all four buses from saved levels at boot, and (M2-08)
`applyDisplayOptions(renderer, display)` hands the saved display options to the renderer. The
audio ones take a `VolumeTarget` (`{ setBusVolume(bus, gain) }` — any `IAudio`). The event carries the profile's
*index*, not its id, because events are plain numbers; the shell resolves it through the same
choice array it handed to the flow. Codes are stable: append, never renumber.

## Input profile choices (input-web, the apps)

A profile the player picks must never lock them out of the menus. `selectableKeyProfiles(profiles,
keySpace)` therefore returns only the keyboard / remote profiles whose **menu** table binds Up,
Down, Left, Right, Confirm and Back through the host's key space:

| `KeySpace` | Host | Selectable shipped profiles | CONTROLS shows |
|---|---|---|---|
| `'code'` | web, Electron (`KeyboardEvent.code`) | `keyboard-default`, `keyboard-remote-emulation` | `KEYBOARD (DEFAULT)`, `KEYBOARD AS REMOTE` (+ a `?profile=` override in use) |
| `'keyCode'` | the TV remote (legacy key codes) | `tizen-remote-safe`, `tizen-remote-diagonal` | `SAFE 4-WAY (DEFAULT)`, `FAST 8-WAY` |

Gamepad profiles are never offered (the per-device choice is M2-16). `inputProfileChoices(profiles,
keySpace, defaultId, extra)` turns them into `InputProfileChoice { id, label }` entries, the
platform default suffixed with `DEFAULT_PROFILE_SUFFIX` (`' (DEFAULT)'`). M1-17 renamed the shipped
labels for the screen: `SAFE 4-WAY`, `FAST 8-WAY`, `KEYBOARD`, `KEYBOARD AS REMOTE`, `GAMEPAD`.

The apps implement `ShellOptions.inputProfiles` (`ShellInputProfiles`):

| Member | `apps/web` | `apps/tizen` |
|---|---|---|
| `choices()` | `inputProfileChoices(…, 'code', 'keyboard-default', overrideProfile)` | `inputProfileChoices(…, 'keyCode', 'tizen-remote-safe')` |
| `active()` | `input.keyProfile?.id ?? null` | same |
| `apply(id, 'save')` | ignored when the URL has `?profile=` (the override wins over the saved choice); else as below | as below |
| `apply(id, source)` | only a selectable profile (or the override); applied with the `?debounce=` override; nothing when it is already active | only a selectable profile; `input.setProfile` and `registerRemoteKeys(tizen, profile.register)` — the new profile's keys are registered at once |

**The choice lives in the save** (`options.input.profileId`) since M1-17. The apps no longer read
input-web's separate `input.profile` key; `loadInputProfileChoice` / `saveInputProfileChoice` stay
exported but nothing calls them (an old `shmup-cup:input.profile` entry is simply ignored). A
saved id outside the selectable set is ignored too, so a hand-edited save cannot put a
gamepad-only or menu-less profile on the keyboard.

## The shell's side

`bootShell` ([rendering-and-shell.md](rendering-and-shell.md#the-boot-sequence)), after the
platform exists — it provides the storage — and before the game:

1. `loadSave(platform.storage)` (never fails the boot — a bad save means defaults) and
   `createSaveStore(platform.storage, loaded)`;
2. `applyAudioOptions(audio, save.options.audio)` — and (a little later, before the scene's
   sprite names are resolved) `applyDisplayOptions(renderer, save.options.display)`: the bullet
   palette (M2-02), the scale mode, shake, flashing and hitbox markers (M2-08); an explicit
   `ShellOptions.effects.screenShake` / `reduceFlashing` is written after it and wins;
3. with `options.inputProfiles`: `choices()` once, `apply(savedId, 'save')` when the save names a
   profile, `active()`;
4. `createGame(…, { scenes: 'boot', save, inputProfiles: { choices, active } })` in the scene flow.
   The dev scenes (`?scene=flight`, …) get the volumes and the profile but run bare gameplay,
   which ignores the store;
5. in the scene flow, `connectOptionEvents(events, audio, index → apply(choices[index].id,
   'options'), palette → renderer.setBulletPalette(palette), renderer)` next to the fx and audio
   handlers (the renderer as the M2-08 `DisplayTarget`).

A throw from the app's `choices()` / `apply()` / `active()` at boot ends on the boot error screen
(`SHMUP CUP FAILED TO START`), like any other failure while the game is created.

New on `Shell`: `loadedSave` (what was read, with its status), `save` (the store — the flow's
`game.scenes.save` in the default scene) and `bootTiming`. Also new since M1-17: a window **`blur`**
listener calls `input.clear()` — a window that lost focus never delivers its key-ups, so nothing
stays held (the listener is removed by `stop()`).

### Boot timing

`ShellOptions.now` is the clock boot is timed with — default `win.performance.now()` (else
`Date.now()`). `Shell.bootTiming` is `{ startMs, readyMs, bootMs }`: the clock when `bootShell` was
called, when the game was ready to run, and the difference (the time spent in the shell: content,
atlas, renderer, save, audio). Because `performance.now()` counts from the page's start,
**`readyMs` is the launch-to-ready time** — what `shmup_feat.md` §23's "launch ≤ 10 s" is about.
The canvas carries it as **`data-shmup-boot-ms`** (`BOOT_MS_ATTRIBUTE`, whole ms of `readyMs`, not
`bootMs`) for the e2e suite (asserted < 10 s) and the TV's remote inspector; the debug overlay
(M1-19) shows it as `BOOT` ([debug-and-replays.md](debug-and-replays.md#the-overlay-shmuprender-pixi-debug)).

## Determinism

- User options are presentation: not in `GameConfig`, not in replays, not hashed. Two games with
  different volumes or profiles are the same game.
- The save changes nothing simulated: the hi-score a World starts with is presentation data (not
  hashed since M1-12), and the stats and tables are outside the World. The flow's lockstep tests
  still hold with a save.
- `UserOption` events go through the event queue, which is not hashed.
- `core/save` is pure: no clock, no `Math.random`; the storage arrives as a `PlatformStorage`.

## Zero allocation and the hot-path rules

Nothing here runs per tick. The Options screen's `tick` and `drawUi`, the `Choice` stepping and the
extra string slot are allocation-free (`scenes-options-alloc.test.ts` moves the focus, the sliders
and CONTROLS every few ticks for 20,000 ticks, composing a frame and draining the events every
tick, under 64 KiB). Closing the screen builds an options object,
a new frozen document and a JSON string — a menu action, like a scene transition. Recording a score
does the same when a game ends. The shell's volume handler allocates nothing per event beyond what
the audio back-end does.

## Using it in code

```ts
import {
  createGame,
  createHeadlessPlatform,
  createSaveStore,
  hiScoreModeKey,
  loadSave,
} from '@shmup/core';

const platform = createHeadlessPlatform(); // memory storage
const store = createSaveStore(platform.storage, await loadSave(platform.storage));
const game = createGame(platform, {}, content, {
  scenes: 'title',
  save: store,
  inputProfiles: { choices: [{ id: 'keyboard-default', label: 'KEYBOARD (DEFAULT)' }], active: null },
});
// … play to the game-over screen …
store.hiScores(hiScoreModeKey(game.config)); // → the table, best first
await store.flush(); // → false: the flow already wrote it
```

A new game instance on the same storage (`loadSave` again) starts with that best score on its
title — the M1-17 acceptance test in `scenes-options.test.ts`.

## Extending it

| To add… | Do this |
|---|---|
| A field or format change | Bump `SAVE_VERSION`, append a `SaveMigration` to `SAVE_MIGRATIONS` (never edit a shipped step), read / default the field in `sanitizeSave`, write it in `serializeSave` in a **fixed** position, and add a fixture of the old version to `packages/core/test/save/fixtures/` with a migration test (M2-16 plans v2) |
| A user option | A field in `UserOptions` / `DEFAULT_USER_OPTIONS`, read defensively in `resolveUserOptions`, serialised in `serializeSave`; if it changes live, a new `UserOptionKind` code (appended) and a case in `connectOptionEvents`; if it affects the simulation it belongs in `GameConfig` instead |
| An Options item | A widget in `OptionsScene` (slider, toggle or choice), its index in `OptionsItem` (BACK moves down — M2-08 moved it to 9, M2-09 to 10), a `userOption` push on `Changed`, the value in `close()`; keep within 31 items and the flow's string slots (the constructor throws otherwise), and within the panel (M2-08 grew it to ten rows — the next row needs a scrolling list or a sub-screen, M2-16) |
| A statistic | A counter in `SaveStats`, its default in `createDefaultSave`, `counter()` in `sanitizeSave`, a field in `serializeSave`, `save.count('…')` where it happens |
| A hi-score mode | A config field that feeds `hiScoreModeKey` (practice, boss rush — M2; co-op shares the tables and tags its rows `2p` since M2-06); keys must stay lower-case kebab ≤ 32 characters |
| Another storage (Electron files, M2-17) | Implement `PlatformStorage` (`get` / `set`, async); nothing in `core/save` changes. Keep failures as rejections or swallow them — `flush` handles both |
| A selectable profile | A `keyboard` / `remote` profile whose menu table binds the six menu actions in the host's key space (`byCode` on the web, `byKeyCode` on the TV) appears in CONTROLS by itself |

## Tests

| Where | Covers |
|---|---|
| `packages/core/test/save/save.test.ts`, `save-edge.test.ts` | Round trip; the v0 fixture migrated field by field (rounded / clamped volumes, rows refiled as `meter-normal`, unlocks dropped, odd shapes never throwing); `migrateSave` with missing / mismatched steps and every malformed version; `parseSave` on empty / blank / truncated / BOM text and throwing or garbage-returning migrations; `__proto__` / `constructor` keys; sanitiser limits (32-character keys, 32 tables, cut texts, zero scores, stable ties, counters, `-0`); canonical serialisation; `loadSave` with non-string / throwing storages and which statuses are copied to `save.corrupt`; insertion at the table edges; `SaveStore` dirty rules per load status, the table limit, the counter cap, overlapping writes succeeding / failing |
| `packages/core/test/config/config-user-options.test.ts`, `-edge.test.ts` | Defaults, `resolveUserOptions` (rounding, clamping, `-0`, profile-id limits, non-object groups, frozen fresh results; M2-02: every `BULLET_PALETTES` name kept, anything else → `standard`), `volumeGain` at every level and out of range |
| `packages/core/test/ui/ui-choice.test.ts`, `-edge.test.ts` | The `Choice` widget: 1–255 labels, index clamping, Left / Right wrap and held repeat, Up / Down never changing it, Confirm stepping, two-label toggling, a disabled item, the dimmed label, the string slot rewritten only on a label change |
| `packages/core/test/scenes/scenes-options.test.ts`, `-edge.test.ts`, `scenes-options-display-edge.test.ts` | Opening from the title and the pause menu and back, drawing, the live `UserOption` events (M2-02: BULLETS stepping the palettes, its event and the palette saved on BACK; M2-08: SCALE / SHAKE / FLASHES / HITBOX — wraps, no-op toggles, the Back button, the pause menu, the ten rows' layout), Back during the open lock, sliders at their ends, a single profile, a profile stepped away and back, unknown / `null` active profiles, saving on BACK, the save re-read per open; hi-scores — recorded on game over and stage clear, `NEW HI-SCORE`, quitting and RETRY recording nothing, starts counted, a Hard game's table, the stage reached, a failing storage never breaking the flow, **the hi-score persisting across a new game instance on the same memory storage** |
| `packages/core/test/scenes/scenes-options-alloc.test.ts` | The Options screen without allocation |
| `packages/input-web/test/rebind/rebind-choices.test.ts`, `-edge.test.ts` | Selectable profiles per key space, gamepads never offered, packed keys, order, the default suffix, the `extra` profile, fresh arrays |
| `packages/shell/test/dispatch/dispatch-options.test.ts`, `-edge.test.ts`, `dispatch-options-palette.test.ts`, `dispatch-options-display*.test.ts` | The event → bus table (fake audio), SFX driving `sfx` + `ui`, clamped levels, raw profile indices, unregistering, `applyAudioOptions` at every level; M2-02: every palette by its index, indices outside the list and a missing callback ignored, nothing after disconnecting |
| `packages/shell/test/boot/boot.test.ts` | The save at boot (fake audio volumes, fake app profiles, corrupt / unreadable / v0 saves, a failing storage, `choices()` asked once, dev scenes, no app profiles, a throwing `apply` as the start error), Options end to end, `blur`, boot timing and `data-shmup-boot-ms`, a game over writing the hi-score to the platform storage |
| `apps/*/test/boot/boot-wiring.test.ts` | Web: the saved choice through the save, CONTROLS entries, a pick winning over `?profile=`, out-of-range picks, `?debounce=` kept, a corrupt save, the save on prefixed `localStorage`. TV: CONTROLS, a live switch registering keys, a pick of the profile in use registering nothing, switching back from a saved FAST 8-WAY, a corrupt save, and the manual M1-17 check driven by remote keys only (SFX + CONTROLS saved on Back, kept after a relaunch) |
| `test/e2e/bullet-palette.spec.ts` | M2-02, web build: BULLETS → DEUTERANOPIA saved on Back and drawn by the next boot's bullets; without a save none of its colours (the control) |
| `test/e2e/display-options.spec.ts` | M2-08, web keyboard and the Tizen build's remote keys: SCALE / SHAKE / FLASHES / HITBOX applied live, saved on Back (`display` in `shmup-cup:save.v1`) and applied at the next boot (`stretch` fills the canvas, markers on the ship); without a save the frame is letterboxed and no marker shows |
| `test/e2e/options.spec.ts` | Web build: OPTIONS opens the screen (`data-shmup-scene="options"`), a MUSIC change is written to `shmup-cup:save.v1` on Esc and read again after a reload, `data-shmup-boot-ms` < 10 s; a corrupt save boots with defaults, is copied to `shmup-cup:save.corrupt` and replaced on Back. Tizen build from `file://`: SFX and CONTROLS changed with the remote only, saved on Back, kept after a reload |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| A change in the Options screen is heard but gone after a reload | The screen was left some other way than BACK / Back (the page reloaded or the app was killed while it was open) — only closing it writes. Or storage failed: the web / TV adapters switch to memory for the session on the first `localStorage` error (private mode, quota), so writes "succeed" but vanish |
| The title's `HI` shows a score that is gone after a reload | That game was quit or retried: the session hi-score takes it, the saved table only takes games that reached the game-over or stage-clear screen |
| An unchanged save is written again at every flush after a reload | `serializeSave` lost its canonical order (a new field or table written in insertion order), so the text never equals the stored one. A save the sanitiser had to repair (or a migrated one) is rewritten **once**, at the first flush — expected |
| `save.corrupt` appeared | The stored text was not JSON, not an object, from a newer build, or had a bad `version`; the game ran with defaults and the next flush replaced the main key. Read `loaded.reason` (`Shell.loadedSave`) for why |
| The saved profile is not applied in a browser | `?profile=` is in the address — the override wins over the saved choice. Without it: the id is not selectable on this host (a remote profile saved on the TV means nothing to the web build's key space, and vice versa) |
| CONTROLS shows `DEFAULT` and cannot be focused | The host passed no `inputProfiles` (tests, tools), the content has no selectable key profile, or a dev scene is running |
| Volumes react, but the menu sounds ignore MASTER / MUSIC | Expected for MUSIC; MASTER scales everything; the menu sounds (`ui` bus) follow **SFX** |
| A test's `Game` has an Options screen but nothing persists | `GameOptions.save` omitted: the flow plays with a memory-only store. Pass `createSaveStore(platform.storage, await loadSave(platform.storage))` |
| An old `shmup-cup:input.profile` entry does nothing | Since M1-17 the choice lives in the save document; the old key is not read |
| A test that pressed Down four (or five, or nine) times to reach BACK now lands on BULLETS (or SCALE, or BOSS HP) | M2-02 inserted BULLETS, M2-08 SCALE, SHAKE, FLASHES and HITBOX and M2-09 BOSS HP before BACK (`OptionsItem.Back` is 10) — navigate by `OptionsItem`, or press Back |
| BOSS HP changed nothing in the running game until BACK | Intended: the HUD reads the saved option (`Hud.showBossHp` from `save.options.display`), and the live `BossHpBar` event has no consumer |
| SHAKE / FLASHES in the save are ignored at boot | The host passed `ShellOptions.effects.screenShake` / `reduceFlashing` — an explicit host setting wins until the Options screen changes it |
| BULLETS shows `STANDARD` after a relaunch although another palette was picked | The screen was not closed with BACK / Back (only closing writes), or the save predates the pick; the palette itself is applied live when stepped |
| `data-shmup-boot-ms` is larger than `Shell.bootTiming.bootMs` | By design: the attribute is `readyMs` (since the page started, i.e. the launch), `bootMs` only the time inside `bootShell` |
| `gamesStarted` is larger than `gameOvers + stagesCleared` | Expected: it counts every START and RETRY STAGE, also games that were quit; it reaches storage with the next flush (the next Options close or finished game) |

## Next steps that build on this page

- **M1-18** (done) — zone A: START plays AZURE VERGE on every build, so the TV records its first
  real scores (open space scored nothing) ([zone-a-and-playtest.md](zone-a-and-playtest.md)).
- **M1-19** (done) — the debug overlay shows `bootTiming` (`BOOT`, launch-to-ready ms) next to
  FPS and the state hash; the M1 release check asks for ≤ 10 s on the TV.
- **M2-01** (done) — a hi-score table per difficulty preset (`meter-easy` … `meter-arcade`) and a
  session hi-score per preset in the flow; the chosen difficulty is not saved yet
  ([difficulty-and-rank.md](difficulty-and-rank.md)).
- **M2-02** (done) — the first display option, `display.bulletPalette` (BULLETS), applied live by
  the renderer ([rendering-and-shell.md](rendering-and-shell.md#colour-blind-bullet-palettes)); the
  save stays version 1.
- **M2-05** (done) — the MANTA's games go into their own tables (`direct-<difficulty>`) and the
  flow keeps a session hi-score per power-up mode and preset; the chosen ship is not saved yet
  (the save stays version 1 — [direct-mode.md](direct-mode.md#the-ship-select-corescenes)).
- **M2-08** (done) — the display options SCALE, SHAKE, FLASHES and HITBOX (`display.scaleMode`,
  `screenShake`, `reduceFlashing`, `showHitbox`), saved in format 1 without a migration, applied at
  boot (`applyDisplayOptions`) and live ([presentation-polish.md](presentation-polish.md#display-options)).
- **M2-09** (done) — `display.bossHpBar` and the BOSS HP row (`OptionsItem.BossHp` 9, BACK 10,
  `UserOptionKind.BossHpBar` 9), saved in format 1 without a migration; the HUD reads the saved
  value ([advanced-bosses.md](advanced-bosses.md#the-boss-hp-bar)).
- **M2-16** — game options (difficulty, lives, death penalty, auto power-up), per-device
  rebinding and the controls sub-screens; **save v2** with a migration from v1.
- **M2-15** — the name entry replaces `---` and the hi-score table screen shows the tables.
- **M2-17** — Electron's file store (`PlatformStorage` over JSON in `userData`), storage quota checks,
  debug save export / import.

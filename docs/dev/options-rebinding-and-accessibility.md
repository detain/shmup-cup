# Options, rebinding and accessibility

How plan step **M2-16** finished the Options screen. The flat M1-17 / M2-08 / M2-09 list became a
root screen (MASTER / MUSIC / SFX) with three **pages** — **CONTROLS**, **DISPLAY** and **GAME** —
and two screens under CONTROLS: the **rebind screen** (per device and binding context, with a
capture prompt, conflict detection and reset) and the **input test**. The step adds the autofire
modes (**always / toggle / hold**) and rate, the player's **SOCD** policy and the remote's
**release debounce**, the **game options** (difficulty, lives 1–5, death penalty, Auto Power-Up,
pickup magnet) and the **one-button preset** (autofire + Auto Power-Up + the casual penalty). Every
label of the canvas UI moved into a **string table** (`content/strings/en.strings.json`, the
infrastructure for M3's localization), and the save became **version 2** with a migration from v1.

This page is the *how and why* and the map of the step's code and content. Exact signatures are in
[api-reference.md](api-reference.md) (`config`, `data`, `events`, `game`, `save`, `scenes`, `ui`,
`weapons`, `debug`, `@shmup/input-web`'s `rebind` / `keyboard` / `web-input`, `@shmup/shell`'s
`controls` / `boot` / `dispatch`, the apps); the TSDoc of `packages/core/src/{config,scenes,ui,save,
weapons}/`, `packages/core/src/ui/strings.ts`, `packages/input-web/src/{rebind,keyboard,web-input}/`,
`packages/shell/src/controls/` and `apps/*/src/boot/` is the authoritative reference. The string
table's format for translators is next to the data —
[`content/strings/README.md`](../../content/strings/README.md). What players and testers see is in
[`../client/controls.md`](../client/controls.md#rebinding-keys-and-buttons) and
[`../client/preview-build.md`](../client/preview-build.md#the-options-screen). The save, the
`UserOption` events and the M1-17 Options screen this builds on are
[saves-and-options.md](saves-and-options.md); the input profiles and binding contexts
[input-profiles.md](input-profiles.md), the split keyboard
[input-profiles.md](input-profiles.md#player-seats-and-the-split-keyboard-m2-06) and
[coop.md](coop.md#input-routing-shmupinput-web-shmupshell); the UI kit and the scene stack
[scenes-and-ui.md](scenes-and-ui.md); the weapons that fire
[weapons-and-options.md](weapons-and-options.md).

Background: `shmup_feat.md` §4 ("[P0] Autofire: hold-to-fire, toggle mode, configurable rate",
"[P1] Rebinding per device (keyboard / each gamepad / remote), conflict detection, reset to
defaults, persistence", "[P1] SOCD resolution", rule 4 "one-button play"), §21 (the Options menu's
Controls / Display / Game groups, the accessibility list — full remapping, one-button play,
colour-blind palettes, flash reduction — and localization through JSON string tables); plan §1.5
(sim-affecting options live in `GameConfig`), decisions D2 (Auto Power-Up), D6 / D7 (the death
penalty presets, lives), D13–D15 (data-driven input profiles, binding contexts), D33 (the pickup
magnet).

## The picture at a glance

```text
 OPTIONS (OptionsScene — title / pause menu)          the save's options (core/save, format 2)
   MASTER / MUSIC / SFX ── live UserOption ──────────► audio.* (presentation)
   CONTROLS ─► ControlsScene                          input.profileId            (live, M1-17)
     PROFILE ── live InputProfile ─────────────────►   input.autofire / autofireInterval ─┐
     AUTOFIRE / RATE ── stored on close ─────────────►                                    │
     SOCD / DEBOUNCE ── stored at once + InputSettings►   input.socd / releaseDebounce     │
     REBIND KEYS / PAD ─► RebindScene ── ControlsSetup►   input.bindings (per profile)    │
     INPUT TEST ─► InputTestScene ('game' context)                                        │
   DISPLAY ─► DisplayScene (M2-02 / M2-08 / M2-09 rows)  display.*        (live)         │
   GAME ─► GameOptionsScene ── stored on close ──────►   game.* (difficulty, lives, …)  ──┤
   BACK                                                                                   │
                                                    FlowControl.rearm(): every difficulty │
 host (@shmup/shell + apps)                          config ← withUserGameOptions(…) ◄────┘
   customize(save.options.input) ─► customizeInputProfile(profile, settings)
     = applyBindingOverride + SOCD + debounce ─► WebInput.setProfile        (the next game or RETRY
   createShellControls ─► rebindAction / resetBindings / captureToken        STAGE; a run keeps its
   WebInput.beginCapture ─► KeyCapture (keys) / poll() (pad buttons)         own runConfig)
```

## The Options screen, regrouped

`OptionsScene` keeps its panel (288×192 at y 12) and now has seven rows (`OptionsItem`): `Master 0`,
`Music 1`, `Sfx 2`, **`Controls 3`, `Display 4`, `Game 5`**, `Back 6`. OK on a page row pushes that
page over it; the root itself stores only the volumes when it closes (BACK / Back →
`setOptions`, `flush`). Each page is its own overlay scene on the same panel and **stores its own
group** when it closes (BACK / Back → `setOptions`, `flush`, `MenuBack`, pop; the root re-locks
its menu for 2 ticks on `uncover`).

| Page (scene id) | Rows (`…Item`) | Applies |
|---|---|---|
| CONTROLS (`controls`, `ControlsScene`) | `Profile 0`, `Autofire 1`, `Rate 2`, `Socd 3`, `Debounce 4`, `Keys 5` (REBIND KEYS), `Pad 6` (REBIND PAD), `InputTest 7`, `Back 8` | PROFILE live (`InputProfile` event, as in M1-17); SOCD / DEBOUNCE stored **at once** and pushed as `UserOptionKind.InputSettings`; AUTOFIRE / RATE stored on close and folded into the next games' configs |
| DISPLAY (`display`, `DisplayScene`) | `Bullets 0`, `Scale 1`, `Shake 2`, `Flashes 3`, `Hitbox 4`, `BossHp 5`, `Back 6` | Unchanged M2-02 / M2-08 / M2-09 behaviour: live events, stored on close |
| GAME (`gameOptions`, `GameOptionsScene`) | `Difficulty 0`, `Lives 1`, `Penalty 2`, `AutoPowerUp 3`, `Magnet 4`, `OneButton 5`, `Back 6` | Stored on close and folded into the next games' configs; DIFFICULTY also chooses the difficulty menu's preset |

Every test and e2e spec that walked the old flat list was updated; navigate by the item constants,
never by counting rows.

### CONTROLS

| Row | Choices | Notes |
|---|---|---|
| PROFILE | the host's key / remote profiles (`InputProfileSetup`) | `DEFAULT` alone and disabled when the host offers none; a pick applies at once (the host applies the profile **with the player's rebinding of it**) and is saved on close only when it changed |
| AUTOFIRE | `ALWAYS` / `TOGGLE` / `HOLD` (`AUTOFIRE_MODES`) | Opens on the next game's value (the saved one, else the host config's); **disabled on a remote-mode host** (the TV — `GameConfig.remoteMode` forces always-on autofire, the remote has no fire button) |
| RATE | `7.5/S` `10/S` `12/S` `15/S` `20/S` `30/S` (`AUTOFIRE_INTERVALS` 8, 6, 5, 4, 3, 2 ticks) | The config's `autofireInterval` as shots a second; opens on the closest interval (`rateIndex`); works on the TV too |
| SOCD | `PROFILE` / `NEUTRAL` / `LAST WINS` (`null`, then `SOCD_CHOICES`) | Every profile's opposite-direction policy (`input-web` `resolveDirections`) |
| DEBOUNCE | `AUTO` / `0 TICKS` … `10 TICKS` (`null`, then 0–`MAX_DEBOUNCE_OPTION`) | The key / remote profile's release debounce (the plan's "advanced debounce slider", as a choice with the profile's own value first). **Since M3-02b `AUTO` is 0 on every shipped profile**: the measured Samsung remote sends no fake keyup/keydown pairs at all, so D14's window of 2 only added 33 ms of release latency. The option stays for a remote model that does need it. Gamepads keep 0 |
| REBIND KEYS / REBIND PAD | — | The rebind screen for the host's key device / gamepad profile; disabled without `SceneFlowHost.controls` or that device |
| INPUT TEST | — | The input test |

The page's hint line reads `AUTOFIRE / RATE: FROM THE NEXT GAME`. AUTOFIRE / RATE are saved on
close only when they changed since the page opened (an untouched row keeps `null` — "the host
config's").

### GAME and the one-button preset

| Row | Choices | Saved as (`options.game`) |
|---|---|---|
| DIFFICULTY | `EASY` … `ARCADE` | `difficulty` — the preset the difficulty menu offers first. Closing the page also calls `chooseDifficulty` (not over a game in progress — below) |
| LIVES | `PRESET`, `1` … `5` | `lives` (`null` = the preset's) |
| PENALTY | `PRESET`, `ARCADE`, `CLASSIC`, `CASUAL` | `deathPenalty` (`null` = the preset's) |
| AUTO POWER | toggle | `autoPowerUp` — saved only when toggled, so an untouched row keeps following the host config and the weapon select's AUTO |
| MAGNET | toggle (on) | `pickupMagnet` — the same rule |
| ONE BUTTON | toggle | `oneButton` — while on, AUTO POWER and PENALTY are disabled |

The notes under the rows: `ONE BUTTON: AUTOFIRE, AUTO POWER, CASUAL` and `APPLIES FROM THE NEXT
GAME`. The one-button preset (`shmup_feat.md` §4 rule 4) forces `autofire: true`, `autofireMode:
'always'`, `autoPowerUp: true` and `deathPenalty: 'casual'` over whatever else the options say: a
game played with the directions alone.

## Sim-affecting options reach the next game, never the one in play

The autofire mode and rate and every game option change what the simulation does, so they live in
`GameConfig` (plan §1.5) — but the **choice** lives in the save (`options.input.autofire`,
`autofireInterval`, `options.game`), because the player sets it outside a game. The flow bridges
the two:

- `core/config` **`userGameOverrides(options)`** → the `GameConfig` fields the options set (only
  non-`null` ones; the one-button preset over them); **`withUserGameOptions(config, options)`** →
  a frozen, validated config with them applied (the same object when nothing changes).
- The flow's **`rearm()`** rebuilds every difficulty's armed config: the preset's config, then the
  weapon select's loadout (`withArsenal`), the ship (`withShip`), one or two players (`withCoop`),
  then `withUserGameOptions(…, save.options)`. It runs when the flow is created (so the saved
  options reach the first game too), after every choice, and when the CONTROLS or GAME page
  closes (`FlowControl.applyOptions`).
- **`FlowControl.armedConfigs`** (M2-16 review round 1) are those configs; the **difficulty menu
  previews them**, so its `LIVES` / `CONTINUES` are what the game will really get (a saved LIVES 5
  shows 5 on every preset). `worldConfig` is the chosen difficulty's.
- **A run keeps the config it began with** (review round 1): `FlowControl.runConfig` is taken by
  `beginRun` and a practice start, and every World of the run — the next zone, a bonus stage and
  back — is built from it (`createRunWorld` → `runWorldConfig(control.runConfig, run)`). Options
  changed from the pause menu therefore never switch the game in play, its difficulty, its HUD
  `HI` or the table it is recorded in.
- **RETRY STAGE takes the options changed since** — at the run's own difficulty:
  `GameScene.restart(retry)` calls **`FlowControl.rearmRun()`** (`runConfig = armed[run's
  preset]`). That is the one moment a paused game's option changes reach the simulation.
- Over the pause menu (`flow.stack.contains(flow.game)`) the GAME page's **DIFFICULTY row is
  disabled**, shows the run's difficulty and its close keeps `options.game.difficulty` and does
  not call `chooseDifficulty` — a run is always recorded in the table of the difficulty it started
  on.
- **The difficulty menu's choice is remembered** (`FlowControl.rememberDifficulty` on its OK →
  `options.game.difficulty`, written with the next flush) — M2-01's "saved with the options of
  M2-16". The flow starts on `save.options.game.difficulty ?? host.config.difficulty`. The weapon
  select's loadout and the ship choice stay session-only (not in this step's deliverables).

The replay header records the resolved config — `autofireMode` included — so a replay never
depends on the save.

## Autofire modes (`core/config`, `core/weapons`)

`GameConfig.autofireMode` (`AutofireMode`, `AUTOFIRE_MODES`, default `'always'`) joins the existing
`autofire` boolean and `autofireInterval` (the rate, ticks between main shots, 1–60):

| Config | Firing |
|---|---|
| `remoteMode: true` (the TV) | Always on, whatever the rest says (the remote has no fire button) |
| `autofire: false` | Hold to fire (`Shot`, missiles `Sub`) — the mode is ignored; kept because many tests use it |
| `autofire: true`, `'always'` | No button needed (the default) |
| `autofire: true`, `'hold'` | Fire while `Shot` (missiles: `Sub`) is held |
| `autofire: true`, `'toggle'` | Each `Shot` press flips the player's firing (`WeaponSystem.firing`, a `Uint8Array` per player, **on at the start**); while on it fires as if no button were needed; `Sub` held still fires the missiles |

`WeaponSystemImpl` decides `alwaysFire` / `toggleFire` once at creation; phase 2 flips `firing[p]`
on a `Shot` press and passes `free` to the meter and Direct-mode firing (`fireDirect(p, held,
shooters, free)`). `resolveGameConfig` rejects an `autofireMode` outside `AUTOFIRE_MODES`.

**Hashing.** `hashWorld` mixes `weapons.firing` **only in the toggle mode** (`mixWeapons(weapons,
toggle)`), so every existing golden replay's hashes stayed the same. `decodeReplay` defaults a
missing `autofireMode` to `'always'` — older replay files still play.

## Rebinding (`@shmup/input-web` `rebind`)

### What the save keeps (`core/config` `BindingOverrides`)

```json
"bindings": {
  "keyboard-default": {
    "game": { "Shot": ["code:KeyJ"] },
    "menu": { "Confirm": ["code:Enter", "code:NumpadEnter", "code:KeyJ"] }
  },
  "tizen-remote-safe": { "game": { "PowerUp": ["key:428"], "Speed": ["key:13"] } }
}
```

Per profile id and binding context (`game` / `menu`, decision D15), an override lists the **whole
key set** of each rebound action as **binding tokens** (`BINDING_TOKEN_PATTERN`): `code:<code>` (a
`KeyboardEvent.code`), `key:<keyCode>` (a legacy key code — the TV remote) or `button:<index>` (a
standard-mapping gamepad button 0–31). An action absent from the override keeps the profile's keys.
`resolveBindingOverrides(anything)` reads it defensively: at most `MAX_BINDING_PROFILES` (16)
profiles in key order with valid ids, known action names, valid tokens without duplicates, at most
`MAX_ACTION_TOKENS` (4) per action; an action with no valid token is kept as an empty list
(unbound); anything unusable is dropped, never thrown.

### Applying it (`applyBindingOverride`, `customizeInputProfile`)

The apps keep every profile **as the content wrote it** and hand the input adapter a customised
copy: `customizeInputProfile(profile, settings)` = `applyBindingOverride(profile,
settings.bindings[profile.id])`, then (only when set) the SOCD policy on every profile and the
release debounce on key profiles (`overrideInputTuning`). `applyBindingOverride` works on a token
table of each overridden context: every overridden action leaves every key, then joins the keys its
override lists; the tables are recompiled. Three safety rules:

- a token the device cannot hold (a `button:` on a key profile, a key on a gamepad profile) is
  skipped;
- on a split keyboard (`keyboard-split`) a key **player 2's half binds in that context** is skipped
  — one key never drives both players, the rule `checkSplit` holds the content to (review round 2);
  player 2's half itself is not rebindable;
- a context whose override would leave an action it requires (`REQUIRED_CONTEXT_ACTIONS`: the game's
  four directions and Pause, the menus' four directions, Confirm and Back) **without a key that
  reaches it** keeps the content's table — a hand-edited or stale save can never lock the player out.
  A `key:<keyCode>` entry hidden by the same key's `code:` entry with actions does not count
  (`findKeyActions` looks `byCode` up first).

### Capturing the next key (`WebInput.beginCapture`)

`WebInput.beginCapture('keys' | 'buttons')` arms the capture; `WebInput.capture`
(`InputCaptureState`, reused) reports it through `poll()`:

- **Keys**: the keyboard source's `KeyCapture` (`armed`, `count`, `code`, `keyCode` — a class, so
  the fields stay unboxed) catches the next keydown of a key **not already down** — auto-repeats
  (flagged or, as on the Samsung remote, flagless), a
  key still held and a key inside its release debounce do
  not count — whether the tables bind it or not. Since M3-02b the TV profile registers **`Guide`
  (458)** — the Ch rocker pressed in — and **`Extra` (10253)** — the screen button — so REBIND can
  capture them as well; nothing binds them by default. The **volume keys are never registered**
  even though `registerKey` accepts all 45 non-`Exit` keys: registering them takes volume control
  away from the viewer, and the profile validator rejects them (`SYSTEM_REMOTE_KEYS`). The event is `preventDefault()`-ed (Ctrl / Cmd
  shortcuts excepted) and then handled as usual.
- **Buttons**: `poll()` catches the lowest gamepad button **newly pressed** on any connected pad.
  A key pressed during a button capture is ignored (the keyboard re-arms).
- **Escape** (`code:Escape`) and the **remote's Back** (keyCode 10009) cancel either kind
  (`CaptureStatus.Cancelled`). They are `RESERVED_BINDING_TOKENS`: a rebinding never takes them
  from the actions they have (Pause in the game, Back in menus), so the way out of every screen
  stays where the player expects it.
- `endCapture()` goes back to `Idle` (the prompt timed out or closed).

`captureToken(profile, captured, context, override)` names the caught key **the way the profile
binds it** (review round 2), so the conflict detection finds the action that holds it and a new
binding is never hidden by an old one: a gamepad profile takes `button:<index>`; a key profile
takes `code:<code>` when the context gives that code an action, else `key:<keyCode>` when it gives
that key code one, else — a key the context does not use yet — `code:<code>` when the key has a code
and the profile binds by code at all (every `keyboard` profile, and `keyboard-remote-emulation`,
a `remote` profile that binds `byCode`), else `key:<keyCode>` (the TV remote's keys arrive without a
code; the `tizen-remote-*` profiles bind key codes only). `null` when the capture does not fit.

### Conflict detection (`rebindAction`)

`rebindAction(profile, overrides, context, action, token)` → `{ overrides, status, other }` (the
same `overrides` object when nothing changed). The action's keys become the token (plus any
reserved token it had). **`code:ArrowUp` and `key:38` count as one key** (`sameKey`, a US-layout
table of legacy key codes — review round 2), both when looking for the key's holder and when
checking reserved keys (`key:27` is reserved like Escape). The status (`core/ui` `RebindStatus`):

| Status | When | Message on screen |
|---|---|---|
| `Bound 0` | Nobody else had the key | `SHOT REBOUND` |
| `Moved 1` | Another action had it and keeps other keys (or is not required) — it loses this one | `KEY TAKEN FROM SUB` |
| `Swapped 2` | The other action had only that key — it takes the action's old keys, so nothing is left unbound | `SWAPPED WITH SUB` |
| `Refused 3` | The other action had only that key, the action has no old key to give, and the other is required in the context — nothing changes | `NOT POSSIBLE: CONFIRM NEEDS A KEY` |
| `Unchanged 4` | The action already had exactly that key, alone | `NO CHANGE` |
| `Rejected 5` | A reserved key, a token the device cannot hold, or (split keyboard) a key player 2's half binds in the context — nothing changes | `THAT KEY CANNOT BE USED` |

The context's override then lists the whole key set of every action that changed (≤ 4 tokens),
merged into the profile's other overrides. `resetBindings(overrides, profileId, context | null)`
drops one context's override (or both) — the rebind screen's RESET. `findBindingConflicts(profile,
context)` lists keys that trigger two or more rebindable actions (the content may have some on
purpose — the split keyboard's G is Special + Speed); a rebinding never creates one for the key it
binds. `actionTokens(profile, override, context, action)` → the keys an action has (a `key:` entry
hidden by a `code:` entry left out — the rows never show a key that does nothing);
`bindingTokenLabel` / `bindingKeysLabel` name them in the bitmap font's glyphs (`Z`, `↑`, `SPACE`,
`NUM 3`, remote `OK` / `BACK` / `CH+` / `PLAY/PAUSE`, pad `A` / `LB` / `START` / `D↑`; up to three
names joined by two spaces, `+` for more, `-` for none).

## The rebind screen

```text
          KEYBOARD CONTROLS
   → MODE      GAME
     UP        ↑  W
     DOWN      ↓  S
     …
     SHOT      Z  SPACE
     PAUSE     P  ESC  BKSP
     RESET
     DONE
          KEY TAKEN FROM SUB
        OK: REBIND  BACK: DONE
```

- **The widget** (`core/ui`): `RebindPanel` — MODE (a `Choice` of the contexts both lists share), a
  row per `REBINDABLE_ACTIONS[context]` action (game: the directions, Shot, Sub, PowerUp, Special,
  Speed, Pause; menu: the directions, Confirm, Back, Pause) with its keys at the value column, RESET,
  DONE, the capture prompt (`PRESS A KEY FOR SHOT` / `PRESS A BUTTON FOR SHOT`, the hint `ESC / BACK
  OR WAIT: CANCEL`, a bar draining over `REBIND_CAPTURE_TICKS` 300 — 5 s) and a message line.
  `rebindTick` → `RebindEvent` (`None`, `Context`, `Capture`, `Reset`, `Done`); `drawRebindPanel`
  draws it through `rebindStringSlots(panel)` slots, each written only when its text changed.
- **The scene** (`RebindScene`, id `rebind`, over the CONTROLS page): `prepare(device)` picks the
  device and builds the title (`KEYBOARD CONTROLS`, `REMOTE CONTROLS`, `GAMEPAD CONTROLS`); OK on an
  action puts the prompt up and calls `ControlsSetup.beginCapture`; while it waits,
  `pollCapture()` answers every tick — `Captured` → `bindCaptured` (conflict detection, stored,
  applied) and the message; `Cancelled`, `Idle` or the 5-s timeout → `CANCELLED`. After a capture
  the rows **wait until nothing is held** (≤ `REBIND_RELEASE_TICKS` 60), so the captured key — which
  may be the menus' OK or Back — never also acts on the rows. RESET resets the shown context. DONE or
  Back flushes the save and pops; leaving mid-capture ends the capture.
- **The host side** (`SceneFlowHost.controls` / `GameOptions.controls`, interface `ControlsSetup`):
  `devices()` (`RebindDevice { id, kind }` — the key profile in use, then the gamepad profile),
  `keysLabel(device, context, action)`, `beginCapture(device)`, `pollCapture()` (every tick while the
  prompt is up — must not allocate), `endCapture()`, `bindCaptured(device, context, action)` →
  `RebindOutcome { status, other }`, `reset(device, context)`. Without it REBIND KEYS / PAD are
  disabled.
- **`@shmup/shell` `controls`** implements it: `createShellControls({ save, input, profiles })` over
  the adapter's capture and the app's `ShellRebindProfiles` (`rebindable()` — the profiles as
  written, read on every call so a PROFILE switch is followed —, `customize(settings)`). A captured
  key becomes a token (`captureToken` with the context and the current override); a change is
  stored with `save.setOptions` (written by the screen's flush) and applied through
  `profiles.customize(save.options.input)`.
- **`bootShell`** calls `inputProfiles.customize?.(save.options.input)` right after the saved profile,
  builds the controls setup when the app offers `customize` + `rebindable` and the adapter the
  capture (`ShellInput.capture` / `beginCapture` / `endCapture` — `WebInput` has them), and connects
  `UserOptionKind.InputSettings` to `customize` (`connectOptionEvents`' sixth argument).
- **The apps** (`apps/web`, `apps/tizen`) keep the key and gamepad profiles as written and apply them
  customised (the web's `?debounce=` override still wins over the saved DEBOUNCE); the TV rebinds
  `tizen-remote-*` and `gamepad-standard`, the web `keyboard-default` / `keyboard-remote-emulation` /
  `keyboard-split` (player 1's half) and `gamepad-standard`. "Each gamepad" of the spec is the one
  gamepad profile every pad uses.

## The input test

`InputTestScene` (id `inputTest`, over the CONTROLS page) runs with the **`'game'` binding context**,
so the player sees the gameplay table through the active profile and their rebinding (OK = PowerUp
on the remote, X = Sub on the keyboard …): the four directions as a cross (two light together on a
diagonal — or not, under the profile's diagonal / SOCD policy), a box per other game action lit while
held and for 8 ticks after a press (a tap shorter than a frame still shows), and the device that
sent the last input. Every key does what it does in a game, so leaving takes a **Pause gesture**:
`INPUT_TEST_EXIT_PRESSES` (3) presses inside `INPUT_TEST_EXIT_WINDOW_TICKS` (90 ≈ 1.5 s), or
**holding Pause** for `INPUT_TEST_EXIT_TICKS` (60) — remote Back / Play-Pause, keyboard
Esc / P / Backspace, pad START in the shipped profiles. The three presses are M3-02b's doing: the
Samsung remote reports Back and Play/Pause only when the button is **released**
([input-probe-results.md](input-probe-results.md) finding 4), so the hold alone made the screen
impossible to leave with the remote. The bar shows whichever exit is further along (a third per
press), the counted presses expire with the window, and the string became
`PAUSE X3 OR HOLD TO EXIT`. It redraws only when what it shows changes.

## Save version 2 (`core/save`)

`SAVE_VERSION` is **2**; the storage key stays **`save.v1`** (the format family's key — the
document's `version` drives the migrations). Version 2 adds the controls fields and the game options:

```json
{
  "version": 2,
  "options": {
    "audio": { "master": 10, "music": 7, "sfx": 10 },
    "input": {
      "profileId": "keyboard-default",
      "autofire": "toggle", "autofireInterval": 3,
      "socd": "lastWins", "releaseDebounce": null,
      "bindings": { "keyboard-default": { "game": { "Shot": ["code:KeyJ"] } } }
    },
    "game": {
      "difficulty": "hard", "lives": 5, "deathPenalty": null,
      "autoPowerUp": null, "pickupMagnet": null, "oneButton": false
    },
    "display": { "bulletPalette": "standard", "scaleMode": "integer", "screenShake": true,
                 "reduceFlashing": false, "showHitbox": false, "bossHpBar": false }
  },
  "hiScores": { "meter-normal": [ … ] },
  "stats": { "gamesStarted": 12, "gameOvers": 9, "stagesCleared": 2 }
}
```

- **`migrateV1`** (`SAVE_MIGRATIONS[1]`, 1 → 2) keeps everything and adds `input.autofire`,
  `autofireInterval`, `socd`, `releaseDebounce` (`null`), `bindings` (`{}`) and `options.game` (every
  field `null`, `oneButton: false`) — the host config's and the profiles' own values, as before —
  and **moves the co-op and practice rows** older builds kept in the one-player tables into their
  `-2p` / `-practice` tables (`moveModeRows`, ahead of the rows already there so older rows win a
  tie). M2-15 did that move in `sanitizeSave` on every read; the sanitiser no longer does.
- `resolveUserOptions` reads the new fields defensively (an `AutofireMode`, an integer 1–60, a
  `SocdChoice`, an integer 0–10, `resolveBindingOverrides`, a preset, lives 1–5, a penalty, booleans
  — each else `null`; `oneButton` else `false`); `serializeSave` writes them in a fixed order and the
  bindings canonically (profiles by id, `game` before `menu`, actions in `ACTION_NAMES` order), so an
  unchanged save is never rewritten.
- Fixture: `packages/core/test/save/fixtures/save-v1.json` (an M2-15 document with a co-op row in a
  1P table); `save-v2.test.ts` migrates it field by field.

## The string table (`core/ui/strings.ts`, content kind `strings`)

Every word the canvas UI draws — the title's mode select, menus, the Options pages, the rebind and
input-test screens, the end screens, the hi-score tables, the HUD's words — comes from a table by id:

- `DEFAULT_UI_TEXT` (290 ids: the fixed ones of `STATIC_UI_TEXT` plus one `sfx.<CueName>` per
  `SFX_CUES` cue, generated from `SFX_CUE_NAMES`), `UI_TEXT_IDS`, `MAX_UI_TEXT_LENGTH` (48),
  `DEFAULT_LANGUAGE` (`'en'`), `resolveUiText(table)` (a content table over English — missing, empty
  or non-string entries keep English, unknown ids are ignored; `DEFAULT_UI_TEXT` itself when nothing
  differs) and `formatUiText(template, a, b?)` (`{0}` / `{1}` — call it on transitions, it builds a
  string). A leaf module: `core/data` validates against `UI_TEXT_IDS` without an import cycle.
- **Content**: `content/strings/<language>.strings.json` (kind `strings`, `UiStringsSpec { language,
  strings }`, `ContentDb.uiStrings` in path order). The loader checks the header, a language id
  (`en`, `pt-br`), known ids only, 1–48 characters of the bitmap font's glyphs (printable ASCII and
  `← ↑ → ↓ ● ★ ✕`), one table per language. `en.strings.json` is the shipped table and **must equal
  the built-in one** (`pnpm content:check` — `test/integration/content.test.ts`).
- **The flow** resolves the content's `en` table once (`SceneFlow.text`) and builds its label lists
  from it (`SceneFlow.labels`, `SceneLabels`, `buildSceneLabels(text)`); every scene draws from them.
  The UI kit's builders take an optional table (`drawMenu`, `drawConfirm`, `drawNameEntry`,
  `buildHud`, `createHud(sprites, text)`, `drawRebindPanel`), English by default. The exported English
  label constants (`BULLET_PALETTE_LABELS`, `SFX_TEST_LABELS`, `METER_SHORT_LABELS` — from
  `METER_SHORT_IDS` …) stay, derived from the built-in table.
- **The guard**: `packages/core/test/ui/ui-strings.test.ts` scans the scenes and the UI kit for any
  upper-case string literal outside the table and fails on one. Content text (zone and boss names,
  the story, the endings, the credits, weapon and profile labels) lives with its content; the
  shell's DOM loading / error screens (before the game exists) are not in the table.
- Picking another language is M3 (`DEFAULT_LANGUAGE` is fixed today).

## Budgets

- **UI string slots 384 → 512** (`UI_STRINGS` in `core/scenes`; `createSceneFlow` throws a
  `RangeError` when the scenes need more): the three pages, the rebind screen and the input test.
- **Tizen `app.js`**: ≈ 359 KB gzip after the step (the two string tables ≈ 6 KB, the pages and the
  rebinding ≈ 9 KB) — `APP_JS_GZIP_BUDGET` raised **350 → 384 KB** (`apps/tizen/scripts/
  check-bundle.mjs`); the boot-time check of M2-18 still guards the launch.

## Determinism

- The save is never read by a World: the sim-affecting options reach the simulation only through a
  config the flow resolves before creating a World (the next game, a RETRY STAGE), and that config
  is what the replay header records.
- `autofireMode` joined the header (`"autofireMode": "always"` in every existing file): the golden
  replays and the attract demos were **re-blessed for the header only** — every hash, tick count,
  input and outcome is identical. The toggle switch is hashed only in the toggle mode.
- Two new golden replays fly the modes (`remoteMode: false`): `zone-a-manta-toggle` (the MANTA, the
  4-way bot tapping Shot every 150 ticks — its volleys switched off and on) and `zone-a-hold` (the
  KESTREL at the fastest rate, Shot / Sub held in bursts). `golden-autofire.test.ts` checks that the
  toggle run flips its switch on each tap and shoots only while it is on, that the hold run launches
  shots only while SHOT is held, and that both desync when their inputs are replayed under
  `'always'`.
- Rebinding, SOCD and debounce are presentation (the input adapter): not recorded, not hashed.
- `core/ui/strings.ts` is pure data; `resolveUiText` and `buildSceneLabels` run once per flow.

## Zero allocation

Nothing new runs in the World's tick except the toggle flip (a typed-array write). The pages'
`tick` / `drawUi`, the rebind screen's wait for a capture (`pollCapture` reads a field), the
widget's redraw and the input test are allocation-free; storing an option, a rebinding or a reset
builds objects and strings — menu actions, like a scene transition. Guards:
`scenes-options-pages-alloc.test.ts` (each page open with its focus moving and its values changing
— the DISPLAY page's live events, CONTROLS' profile, autofire and rate, GAME's choices and toggles,
the rebind screen's rows and MODE switch over a fake host — the frame composed every tick),
`scenes-input-test-alloc.test.ts` (the input test) and `ui-rebind-alloc.test.ts` (the widget)
— each in its own file (conventions: an allocation guard runs away from suites that create many small
Worlds).

**Lesson (M2-16).** `drawRebindPanel` first walked its rows with `for … of` — V8 allocated an
iterator object on every redraw (the guard caught ~600 bytes a redraw). Per-frame code uses index
loops, and a widget precomputes the counts it needs (`RebindPanel.menuSlots`, `maxRows`) in its
constructor ([conventions.md](conventions.md#performance-zero-allocation-in-hot-paths)).

## Running it

```sh
pnpm dev                                    # http://localhost:5173 — OPTIONS → CONTROLS / DISPLAY / GAME
pnpm exec vitest run --project core packages/core/test/scenes/scenes-controls.test.ts
pnpm exec vitest run --project input-web packages/input-web/test/rebind
pnpm exec vitest run --project integration test/golden/golden-autofire.test.ts
pnpm content:check                          # en.strings.json equals the built-in table
pnpm exec playwright test test/e2e/rebind.spec.ts test/e2e/game-options.spec.ts   # after pnpm test:e2e built the apps
```

In a browser the save is `localStorage["shmup-cup:save.v1"]`; in a dev / test build the debug API
(`window.__shmupDebug.game.scenes`) shows `save.options` and `gameConfig` (the next game's config).

## Extending it

| To add… | Do this |
|---|---|
| A UI label | An id in `STATIC_UI_TEXT` (`core/ui/strings.ts`), the same entry in `content/strings/en.strings.json` (`pnpm content:check` fails until both agree), draw it from `flow.text.<id>` (never a literal — `ui-strings.test.ts` fails on an upper-case literal in the scenes / UI kit); a list goes into `SceneLabels` / `buildSceneLabels` |
| A language | `content/strings/<language>.strings.json` with the ids it translates (the rest stay English); choosing it at run time is M3 (`DEFAULT_LANGUAGE`) — keep each text within its screen's width (6 px a character) |
| A controls option | A field in `InputOptions` (read in `resolveUserOptions`, default in `DEFAULT_USER_OPTIONS`, written by `serializeSave` in a fixed place, set by `migrateV1` for old saves or a new migration), a row in `ControlsScene` / `ControlsItem`, and — for the input adapter — a field of `InputCustomization` applied in `customizeInputProfile`; if it affects the simulation it belongs in `GameConfig` and `userGameOverrides` instead |
| A game option | A field in `UserGameOptions` / `DEFAULT_USER_GAME_OPTIONS`, `resolveUserOptions`, `serializeSave`, a `GameConfig` field in `userGameOverrides`, a row in `GameOptionsScene` / `GameOptionsItem` (stored on close only when changed if "unset" must stay meaningful) |
| A rebindable action | Append it to `REBINDABLE_ACTIONS[context]` (the rows follow), an `action<Name>` label, and — if a context cannot work without it — `REQUIRED_CONTEXT_ACTIONS` (the lock-out rule and `Refused` follow) |
| A reserved key | `RESERVED_BINDING_TOKENS` (it cancels a capture only if `web-input`'s `CANCEL_CODE` / `CANCEL_KEY_CODE` say so) |
| A rebindable device | A profile the app returns from `rebindable()` (key profile first, then gamepad) — `ControlsScene` enables REBIND KEYS / PAD by the devices' `kind` |
| A save format change | Bump `SAVE_VERSION` (3), append a step to `SAVE_MIGRATIONS` (never edit `migrateV1`), a fixture `save-v2.json` and a migration test |

## Tests

| Where | Covers |
|---|---|
| `packages/core/test/config/config-game-options.test.ts`, `-edge.test.ts`, `config-user-options.test.ts` | `userGameOverrides` / `withUserGameOptions` (only set fields, the one-button preset over them, the same object when nothing changes, validation), `resolveUserOptions` of every new field (`-0`, bounds, junk), `resolveBindingOverrides` limits (16 profiles, 4 tokens, duplicates, bad ids / actions / tokens, empty lists kept) |
| `packages/core/test/save/save-v2.test.ts`, `-edge.test.ts` (+ updated `save*.test.ts`) | The v1 fixture migrated field by field, the co-op / practice rows moved (order, ties, the 32-character keys), odd v1 shapes never throwing, canonical bindings, round trips, the v2 layout written on the next flush (then left alone) |
| `packages/core/test/weapons/weapons-autofire-modes.test.ts` | Always / hold / toggle for the meter and Direct mode, the toggle's per-player switch (on at start, flipped by presses, `Sub` still firing), remote mode forcing always, `autofire: false`, the hash including `firing` only in the toggle mode |
| `packages/core/test/ui/ui-rebind.test.ts`, `ui-rebind-alloc.test.ts` | The widget: rows per context, MODE switching, capture / reset / done events, the prompt's clock, `setKeys` revisions, string slots; no allocation |
| `packages/core/test/ui/ui-strings.test.ts`, `packages/core/test/data/data-strings.test.ts` | The table (ids, `sfx.` names, lengths, glyphs), `resolveUiText` / `formatUiText`, the source scan for stray labels, a flow drawing a content table; the loader (unknown ids, bad glyphs, a second table of a language, bad language ids) |
| `packages/core/test/scenes/scenes-controls.test.ts`, `-edge.test.ts` | The CONTROLS and GAME pages (live PROFILE, SOCD / DEBOUNCE stored at once with `InputSettings`, AUTOFIRE disabled on a remote host, AUTOFIRE / RATE / game options reaching the next game, the one-button rows, DIFFICULTY remembered and disabled over the pause menu — the review's repro), the difficulty menu previewing the armed LIVES, the rebind screen over a fake host (capture, each outcome's message, cancel, timeout, the release wait, reset, done), the input test |
| `packages/core/test/scenes/scenes-run-config.test.ts` | A run keeps its config: MAGNET changed mid-run reaches neither the next zone nor a bonus stage, but a RETRY STAGE; practice alike |
| `packages/core/test/scenes/scenes-options*.test.ts`, `scenes-options-pages-alloc.test.ts`, `scenes-input-test-alloc.test.ts` | The regrouped root and the DISPLAY page (the M2-02 / M2-08 / M2-09 cases moved), the guards |
| `packages/input-web/test/rebind/rebind-rebinding.test.ts`, `-edge.test.ts` | Capture tokens per profile kind and context, bind / move / swap / refuse / reject / unchanged, `code:` ≡ `key:` holders, reserved keys, the split keyboard's player-2 keys, reset, `customizeInputProfile` (SOCD, debounce, lock-out fallback, hidden `key:` entries), conflicts, labels |
| `packages/input-web/test/keyboard/keyboard-capture.test.ts`, `web-input/web-input-capture.test.ts` | The keyboard's catch (new keys only — repeats, held and debouncing keys ignored), key and button captures, Escape / Back cancelling, a key during a button capture |
| `packages/shell/test/controls/controls.test.ts`, `-edge.test.ts`, `boot/boot.test.ts` | A real `WebInput` capture → bind → save → applied; devices following a profile switch; rejects; reset; boot wiring (`customize` at boot and on `InputSettings`, controls only with a capable adapter and app) |
| `apps/*/test/boot/boot-wiring.test.ts` | The apps' `customize` / `rebindable`: the saved rebinding, SOCD and debounce applied to the key and pad profiles at boot (J shoots on the web), a profile switch applying that profile's own rebinding, `InputSettings` re-applying the save, a lock-out save keeping the content's table (TV), the web's `?debounce=` winning |
| `test/integration/content.test.ts` | `en.strings.json` equals `DEFAULT_UI_TEXT` |
| `test/golden/golden-autofire.test.ts` (+ `zone-a-manta-toggle`, `zone-a-hold`) | The autofire modes as golden replays |
| `test/e2e/rebind.spec.ts`, `test/e2e/game-options.spec.ts` (+ the updated `options`, `display-options`, `bullet-palette` specs) | Web: SHOT → J saved, shown in the input test and applied after a reload; a v1 save booting, LIVES 5 and ONE BUTTON reaching the save (v2) and the next game; Escape cancelling, RESET, SOCD / DEBOUNCE saved. Tizen from disk: POWER-UP ↔ CH− swap kept across a relaunch; LIVES 1 with the remote |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| A test pressing Down to reach BULLETS / SCALE / BACK in OPTIONS lands elsewhere | M2-16 moved the display rows to the DISPLAY page (`OptionsItem.Display` 4, then `DisplayItem`) and the profile to CONTROLS (`ControlsItem.Profile`); `OptionsItem.Back` is 6 — navigate by the constants |
| A changed LIVES / AUTOFIRE did nothing in the game I paused | Intended: the options reach the next game or a RETRY STAGE; the run in play (its next zones and bonus stages too) keeps `runConfig` |
| DIFFICULTY is greyed out on the GAME page | It was opened over the pause menu — a run keeps its difficulty (and its hi-score table); change it from the title |
| AUTOFIRE is greyed out | A remote-mode host (the TV, or a test config with `remoteMode: true`): autofire is always on there |
| The weapon select's AUTO row is ignored | AUTO POWER was changed on the GAME page (or ONE BUTTON is on): a saved `autoPowerUp` is applied after the loadout (`withUserGameOptions` after `withArsenal`). Untouched, the row stays `null` and the weapon select decides |
| A rebound key does nothing / the old key still acts | The key was named the other way (`key:38` while the profile binds `code:ArrowUp`, whose entry hides it) — use `captureToken(profile, captured, context, override)`, never a hand-made token; `actionTokens` hides such dead entries |
| Rebinding Shot to an arrow on the split keyboard says `THAT KEY CANNOT BE USED` | Player 2's half binds the arrows (`Rejected`): one key must never drive both players |
| `NOT POSSIBLE: CONFIRM NEEDS A KEY` | The key is a required action's only one and the rebound action had none to swap in — give the action a key first, or rebind the other action |
| A hand-edited save's bindings are ignored for one context | Applying them would leave a required action without a reachable key — `applyBindingOverride` keeps the content's table for that context |
| Escape / Back cannot be rebound | They are `RESERVED_BINDING_TOKENS` (they cancel the capture); bind other keys to Pause / Back in addition |
| The captured key also pressed OK on the rebind rows | Not expected: the rows wait until nothing is held after a capture (`REBIND_RELEASE_TICKS`) — a test must release the key before its next press |
| `?debounce=` beats the saved DEBOUNCE | Intended on the web: the dev override is applied after the player's settings |
| `createSceneFlow` throws `the scenes need … string slots` | A new screen pushed the total over `UI_STRINGS` (512) — raise it with a comment of what needs it |
| `pnpm content:check` fails on `en.strings.json` | The built-in table and the shipped file differ — edit both together |
| `ui-strings.test.ts` fails on a scene | An upper-case literal in the scenes / UI kit — move it into the table |
| A golden fails after a config change on the header only | New `GameConfig` fields enter every header: re-bless with `pnpm golden:update` and say why in the commit (M2-16 did, header only) |
| An old saved row of a co-op game moved tables | The v1 → v2 migration files co-op / practice rows under `-2p` / `-practice` (once, at the first load after the update) |

## Next steps that build on this page

- **M2-17** (done) — the Electron file store under the same save document (format 2 — the bindings
  and game options land in `save.v1.json`), storage quota checks, debug save export / import
  ([platform-polish.md](platform-polish.md)).
- **M2-18** (done) — the v1.0 hardening pass: the boot-time and bundle budgets (≈ 359 of 384 KB), the
  release checklist on the TV (the CONTROLS / GAME pages and the rebind screen with the remote).
- **M3-01** (done) — the GAME page's OPT RECOVERY, SPEED and INVINCIBLE (`GameOptionsItem` 6–8,
  BACK 9) and the CONTROLS page's RUMBLE (`ControlsItem.Rumble` 8, BACK 9) — `options.play`
  (`PlayOptions`), still save format 2; assisted runs flagged in hi-score rows and replay headers;
  the scene flow recorded as whole-run replays; the new labels in the string table
  ([extra-modes-and-replays.md](extra-modes-and-replays.md#assists-and-feel-playoptions-the-game-and-controls-pages)).
- **M3-03** — localization: a language option picking a `content/strings/` table and bitmap font
  atlases for more glyphs.

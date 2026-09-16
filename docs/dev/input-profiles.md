# Input profiles: remote-first bindings, binding contexts and device quirks

How a key, a remote button or a gamepad button becomes an action the simulation sees, and
why the Samsung remote's mapping and quirks are **data**. Filled in by plan step **M1-05**.
Since **M1-17** the Options screen's CONTROLS lets the player pick a key / remote profile, and the
choice is kept in the save ([the saved choice](#the-saved-choice)); **M2-06** added player seats
(two-player co-op: which device drives which player) and the split keyboard
([player seats and the split keyboard](#player-seats-and-the-split-keyboard-m2-06)); **M2-16** added
the player's rebinding, SOCD policy and release debounce on top of the same profiles — the apps
keep every profile as written and hand the adapter a customised copy (`customizeInputProfile`),
and the adapter captures the next key or button for the rebind screen
([rebinding and the player's settings](#rebinding-and-the-players-settings-m2-16)); nothing else on
this page changed shape.

This page is the *how and why*. Exact signatures are in
[api-reference.md](api-reference.md#shmupinput-web); the TSDoc in
`packages/input-web/src/` is the authoritative reference. The profile *file format* for
authors lives next to the data in [`content/input/README.md`](../../content/input/README.md).
What players see is in [`../client/controls.md`](../client/controls.md).

Background: `shmup_feat.md` §4 (actions, input requirements, the eight remote-first design
rules, SOCD), §21 (controls options); `shmup_tech.md` §2.3 (remote key codes, key
registration, gamepads on Tizen), §4.4 (the custom input manager); `input_probe_spec.md`
(what the probe measures); plan §3.5 (content owners), §8.2 (probe protocol) and decisions
**D12** (remote is primary: OK = equip / confirm, Back = pause / back), **D13** (the mapping
is data), **D14** (the default remote profile) and **D15** (separate `game` and `menu`
tables).

## Why profiles

The remote's behaviour is still being measured by the input probe (`tools/input-probe/`):
whether the D-pad ring can report two arrows at once, whether it sends fake
`keyup`/`keydown` pairs while a key is held, and which extra keys a model delivers. The
probe's verdicts must change **a JSON file, not code**. At the same time one key had to do
two jobs (keyboard X was `Sub | Back`, Z was `Shot | Confirm`), so a menu opening while the
player held X would have pressed Back. Profiles fix both: every tunable lives in
`content/input/remote.input-profiles.json`, and every profile has a `game` and a `menu` table.

## The picture at a glance

```text
 content/input/remote.input-profiles.json      (kind "input-profiles", inlined by virtual:shmup-content)
        │
        ▼  bootShell → loadGameContent: foreign kind → owner (app's registry.load, else DEFAULT_CONTENT_OWNERS)
 rebind.loadInputProfiles(files)                schema + semantic checks, compile per-context tables
        │   issues → boot error screen             (a bad profile is dropped, the others kept)
        ▼
 InputProfileRegistry { profiles, issues, get(id) }   = app.profiles
        │
        ▼  app platform factory (after validation, before createGame)
 chooseInputProfile(profiles, [?profile=, saved, default], KEY_PROFILE_DEVICES) → input.setProfile(keys)
 chooseInputProfile(profiles, ['gamepad-standard'], ['gamepad'])              → input.setProfile(pads)
 Tizen: createTizenPlatform({ registerKeys: keys.register })
        │
        ▼  every frame (shell/boot onFrame), before the ticks
 game.inputContext changed? → input.setContext('game' | 'menu')   swap tables, held keys keep common actions
 game.inputSeats changed?   → input.setSeats(1 | 2)            player seats (M2-06); held keys make no press
        │
        ▼  every tick: WebInput.poll()
 keyboard.advance()               age the release debounce          (remote.createReleaseDebouncer)
 keyboard.held                    tracked keys → mask → SOCD → diagonal policy (remote.resolveDirections)
 splitKeyboard.held               the split profile's second half (M2-06; nothing bound without one)
 readGamepadActions(pad, …)       buttons (stale ones masked) + stick, per-pad press order → same policies
 route by seats                   1: every device → player 1; 2: keys → P1, split half / seated pad → P2
 commitPlayerInput(p1 / p2, …)    core/input: held, pressed, released, device
```

The core never sees a key code or a profile. It sees resolved action masks, so replays stay
profile-independent: a session recorded with `tizen-remote-safe` replays tick for tick into a
headless game (`test/integration/input-profiles.test.ts`).

## Module responsibilities (`@shmup/input-web`)

| Module | Status | Owns |
|---|---|---|
| `rebind` | implemented (M2-16) | Profile types, `parseInputProfiles` / `loadInputProfiles` (validation + compilation), the registry, `chooseInputProfile`, `overrideInputTuning`, the persistence hook; M2-16: the rebinding — `customizeInputProfile` / `applyBindingOverride`, `rebindAction` (conflict detection), `resetBindings`, `captureToken`, `actionTokens`, `findBindingConflicts`, `bindingTokenLabel` / `bindingKeysLabel`, `RESERVED_BINDING_TOKENS` |
| `remote` | implemented | The quirk knobs as allocation-free building blocks: `createReleaseDebouncer`, `resolveDirections`, `createDirectionOrder`, `InputTuning` |
| `keyboard` | implemented | Key events → 32 fixed key slots with the debounce; `setBindings` (table swap without phantom presses), `setTuning`, `advance`; M2-16: `capture` (a `KeyCapture` — the next new key, bound or not) |
| `gamepad` | implemented | One pad → mask; `pressedButtons` / `staleButtons` for table swaps |
| `keymap` | implemented | Built-in fallback tables, `TIZEN_KEY_CODES`, `findKeyActions` (`-1` unbound vs `0` known) |
| `web-input` | implemented (M2-06) | The `PlatformInput`: `setProfile`, `setContext`, `context`, `keyProfile`, `gamepadProfile`, `poll`; the player seats — `seats`, `setSeats`, `padSeat` (`PAD_SEAT_NONE` / `PAD_SEAT_P2`) — and the split keyboard's second source `splitKeyboard` (M2-06); the rebinding capture — `beginCapture('keys' \| 'buttons')`, `capture` (`InputCaptureState`), `endCapture` (M2-16) |

Around it: core `input` owns `InputContext` / `INPUT_CONTEXTS`, core `game` the
`Game.inputContext` and (M2-06) `Game.inputSeats` getters, `@shmup/shell` the per-frame context and seat forwarding and
`DEFAULT_CONTENT_OWNERS`, the apps the profile choice and (Tizen) key registration.

## The shipped profiles

| Profile | Label (CONTROLS) | `device` | Used | Debounce | Single key | Diagonals / SOCD | `register` |
|---|---|---|---|---|---|---|---|
| `tizen-remote-safe` | `REMOTE` | `remote` | TV default | 0 | yes | `combine` / `neutral` | `MediaPlayPause`, `ChannelUp`, `ChannelDown`, `Guide`, `Extra` |
| `keyboard-default` | `KEYBOARD` | `keyboard` | web default | 0 | no | `combine` / `neutral` | — |
| `keyboard-remote-emulation` | `KEYBOARD AS REMOTE` | `remote` | web, picked in CONTROLS or `?profile=keyboard-remote-emulation` | 0 | yes | `combine` / `neutral` | — |
| `keyboard-split` | `SPLIT KEYBOARD` | `keyboard` | web, picked in CONTROLS or `?profile=keyboard-split` — two players on one keyboard (M2-06; its `split` half is player 2's) | 0 | no | `combine` / `neutral` | — |
| `gamepad-standard` | `GAMEPAD` | `gamepad` | every pad, both apps (never offered in CONTROLS) | 0 (must be) | no (must be) | `combine` / `neutral` | — |

M1-17 renamed the labels for the Options screen (they were `TV REMOTE`, `TV REMOTE 8-WAY`,
`KEYBOARD AS TV REMOTE`); CONTROLS appends ` (DEFAULT)` to the platform's default.

### What the 2026-09-15 input probe changed (M3-02b)

The probe ran on both Smart Monitor M7s ([input-probe-results.md](input-probe-results.md)) and
replaced every guess in this table:

- **`tizen-remote-safe` debounces 0 ticks.** The remote sends **no** fake `keyup`/`keydown` pairs
  and no bounces; its auto-repeats are plain `keydown`s of a key that is already down. Decision
  D14's window of 2 only cost 33 ms of release latency.
- **`singleKey: true` on both remote profiles.** While any key is down a second key's `keydown` is
  never delivered — not another arrow, not OK, not on release. There are no diagonals and no
  chords on this hardware at all, so a power-up press costs the player its movement.
- **`tizen-remote-diagonal` (`FAST 8-WAY`) is gone.** It differed from the default only by the
  debounce, and "8-way" was never possible. A save that named it resolves to `tizen-remote-safe`
  (`core/config` `migrateInputProfileId`, `RETIRED_INPUT_PROFILE_IDS`), so the label of the one
  remaining TV profile is simply `REMOTE`.
- **`Guide` (458) and `Extra` (10253) are registered.** The Ch rocker pressed in and the screen
  button are ordinary keys with a real down/up; nothing binds them by default, but REBIND can now
  capture them. The volume keys stay unregistered even though `registerKey` accepts them —
  registering takes volume control away from the viewer.

| Action | `keyboard-default` game / menu | `tizen-remote-*` game / menu | `gamepad-standard` game / menu |
|---|---|---|---|
| Move / focus | Arrows, WASD | D-pad (37–40) | D-pad (12–15) |
| Shot | Z, Space / — | — (autofire) | A / — |
| Sub | X / — | — (autofire) | B / — |
| PowerUp | C, Enter / — | OK (13) / — | X / — |
| Special | V / — | Ch+ (427) / — | Y / — |
| Speed | Left Shift / — | Ch− (428) / — | LB, RB / — |
| Confirm | — / Enter, Space, Z | — / OK | — / A |
| Back | — / X, Backspace, Esc | — / Back (10009) | — / B, Select |
| Pause | P, Esc, Backspace / P | Back, Play/Pause (10252) / Play/Pause | Start, Select / Start |

`keyboard-split` (M2-06): player 1's half (`context`) — WASD move, F = PowerUp / Confirm, G =
Special + Speed / Back, Esc = Pause / Back, Q = Pause / Pause; player 2's half (`split`) — the
arrows, K = PowerUp / Confirm, L = Special + Speed / Back, Enter and numpad Enter = Pause (player
2's START, its join press) / Confirm. No Shot or Sub keys: both ships autofire.

Remote profiles bind by **`keyCode` only**: the TV delivers most remote keys with an empty
`code`, and binding by key code also lets a desktop keyboard's arrows and Enter reach a
`tizen-remote-*` profile. `keyboard-remote-emulation` binds by `code` (desktop keys) but has
`device: 'remote'`, so the core runs as if a remote were in hand: arrows only, the second arrow
replaces the first, Enter = OK, Backspace = Back, P = Play/Pause, PgUp / PgDn = Ch±. Labels are
upper-case because the bitmap font is.

## Validation and compilation (`rebind`)

`loadInputProfiles(files)` is the content owner of kind `input-profiles` (plan §3.5). It sorts
the files by path (the result never depends on listing order), then per file:

1. **Schema** — the core combinators (`s.object`, `s.record`, …, decision D28), so issues read
   like every other content error: `input/remote.input-profiles.json:profiles[1].diagonals: must
   be one of: combine, lastWins, firstWins`. Limits: ids lower-case kebab ≤ 64 chars; labels
   ≤ 40; key names `^[A-Za-z][A-Za-z0-9]*$`; key codes 1–999999; buttons 0–31; debounce
   0–10; `register` ≤ 32 names; unknown fields and unknown action names are issues. A file
   that fails the schema contributes **no** profile.
2. **Semantic checks** (`checkProfile`) — each failure drops *that* profile, the rest of the
   file is kept:
   - every `game` table binds `Up`, `Down`, `Left`, `Right`, `Pause`; every `menu` table the
     four directions, `Confirm` and `Back` (`REQUIRED_CONTEXT_ACTIONS`, feat §4 rule 8);
   - a `gamepad` profile binds `buttons` only (both key tables empty, `buttons` present) and
     has `releaseDebounceTicks: 0` (pads are polled, there is nothing to debounce);
   - a key profile never has `buttons`;
   - a `gamepad` profile never sets `singleKey` (M3-02b — pads are polled, and every standard pad
     reports all its buttons at once);
   - only `remote` profiles have a non-empty `register`, and never a `SYSTEM_REMOTE_KEYS` name
     (`Exit`, `VolumeUp`, `VolumeDown`, `VolumeMute`).
3. **Unique ids** across all files — the first definition (in path order) wins; the duplicate
   is an issue naming the first file. A dropped profile never claims its id.
4. **Compilation** — each profile gets frozen, prototype-free `tables.game` / `tables.menu`
   (`ContextTables`): `keys: KeyBindings` (`byCode` / `byKeyCode` → `ActionMask`) and
   `buttons: ActionMask[]` (as long as the highest bound index + 1, gaps `0`).

Any issue stops the boot on the error screen, like every other content problem —
`pnpm content:check` catches it earlier (it validates the shipped file and
`example.input-profiles.json`, plus the JSONC samples in the folder README).

### The `0` placeholders

A context's key table also lists every key the **other** context binds, with mask `0`. The
keyboard source treats a key the table knows — even with `0` — as bound: it is tracked and
`preventDefault()`-ed in both contexts. Without that, `keyboard-remote-emulation`'s PgUp /
PgDn (Ch± — bound in the game table only) would scroll the page whenever a menu is open.

`keymap.findKeyActions(code, keyCode, table)` therefore returns three kinds of answer: a mask,
`0` (known, no action here) or `-1` (unknown — ignored, default not prevented). A `code` entry
of `0` does **not** hide the `keyCode` table: if a profile binds `Enter` by code in the game
and key code 13 in menus, the menu table's `Enter: 0` placeholder falls through to its
`13: Confirm` (this was a bug the M1-05 tests found). `resolveKeyActions` keeps the old
contract (unknown → `0`).

## Choosing the active profile

One key profile (device `keyboard` or `remote`, `KEY_PROFILE_DEVICES`) and one gamepad profile
are active at a time. The apps pick them in the platform factory `bootShell` calls after the
content is validated and before the game exists:

| | `apps/web` | `apps/tizen` |
|---|---|---|
| Key profile | `?profile=<id>` › saved choice (`options.input.profileId` of the save) › `keyboard-default` | saved choice › `tizen-remote-safe` |
| Offered in CONTROLS (M1-17) | `KEYBOARD (DEFAULT)`, `KEYBOARD AS REMOTE`, plus a `?profile=` override in use | `REMOTE (DEFAULT)` |
| Gamepad profile | `gamepad-standard` | `gamepad-standard` |
| Dev overrides | `?debounce=<ticks>` (0–10) on the key profile, via `overrideInputTuning` | none (the widget has no query string) |
| Key registration | — | the key profile's `register` list (`createTizenPlatform({ registerKeys })`) |

`chooseInputProfile(profiles, candidates, devices)` returns the first candidate id that names
a profile of an acceptable device, skipping `null`, unknown ids and wrong devices — so
`?profile=gamepad-standard` falls back to the default key profile. On the web an unknown
`?profile=` logs one `console.warn` (`Shmup Cup: no keyboard or remote input profile "…"; using
keyboard-default`) and boots normally. If the content has no usable key profile at all, the
built-in `keymap` / `gamepad` defaults stay in force (one merged table, no contexts) and Tizen
registers the fallback `REMOTE_KEYS_TO_REGISTER` (which also lists the colour keys).

### The saved choice

Since M1-17 the choice lives in the **save document** (`core/save`, `options.input.profileId`,
`localStorage` key `shmup-cup:save.v1`) and is set by the Options screen's **CONTROLS**
([saves-and-options.md](saves-and-options.md#input-profile-choices-input-web-the-apps)):

- **Which profiles can be picked.** `selectableKeyProfiles(profiles, keySpace)` keeps only the
  keyboard / remote profiles whose **menu** table binds Up, Down, Left, Right, Confirm and Back in
  the host's key space — `'code'` on the web (desktop keys), `'keyCode'` on the TV (remote key
  codes) — so no pick can leave the player unable to leave the menu again.
  `inputProfileChoices(profiles, keySpace, defaultId, extra)` turns them into the screen's
  `{ id, label }` entries, the default marked ` (DEFAULT)`.
- **At boot** the shell reads the save before the title and calls the app's
  `inputProfiles.apply(savedId, 'save')`: web — ignored when the URL has `?profile=` (the override
  wins), else applied (with the `?debounce=` override) if it is selectable and not already active;
  Tizen — applied if selectable, then its `register` keys are registered (`registerRemoteKeys`).
  A saved id that is unknown or not selectable on this host is ignored.
- **In the Options screen** every CONTROLS step applies the profile at once
  (`apply(id, 'options')` — on the web this wins over `?profile=`); BACK stores it in the save.

`loadInputProfileChoice(storage)` / `saveInputProfileChoice(storage, id)` (key `input.profile`,
`INPUT_PROFILE_STORAGE_KEY`) stay exported but are no longer called; an old
`shmup-cup:input.profile` entry is ignored. To try a choice by hand, pick it in OPTIONS → CONTROLS
(or edit `options.input.profileId` in `shmup-cup:save.v1` and reload).

## Binding contexts (`game` / `menu`, decision D15)

- `InputContext = 'game' | 'menu'` lives in core `input`. `Game.inputContext` is the
  context the top scene wants: with the scene flow (M1-16) `'game'` only while the game scene is
  on top, `'menu'` on the title, the pause menu, the dialogs and the end screens; for bare
  gameplay (the dev scenes) always `'game'`. It is presentation routing only — the simulation still gets plain masks, and
  replays do not record it.
- `bootShell` calls `input.setContext(game.inputContext)` once at boot and then, at the start
  of every frame and **before that frame's ticks**, whenever the value changed (also while the
  game is paused). `ShellInput.setContext` is therefore required of every input adapter the
  shell drives.
- `WebInput.setContext(ctx)` swaps the keyboard source to `keyProfile.tables[ctx].keys` and the
  pads to `gamepadProfile.tables[ctx].buttons`. It remembers the context even with no profile,
  so a profile applied later starts in the right table.
- **No phantom presses:** a key or button held across a table swap (context *or* profile
  change) keeps only the actions it has in **both** tables until it is released. Holding X
  (Sub) while a menu opens does not press Back; holding Backspace (Pause → Back) contributes
  nothing in the menu until pressed again. Keyboard: `setBindings()` ANDs each held slot's
  mask with its mask in the new table. Pads: `setPadButtons()` copies each pad's
  `pressedButtons` into `staleButtons`; `readGamepadActions(pad, state, buttons,
  previousButtons)` gives a stale button `buttons[i] & previousButtons[i]` and clears the bit
  when the button is released.
- **No phantom presses across a seat change either (M2-06):** `bootShell` forwards
  `Game.inputSeats` the same way (`input.setSeats`, before the frame's ticks). A source that
  changes players with it — a pad seated as player 2, the split keyboard's right half — keeps
  what it holds on its new player without a press edge on the next poll: player 2's START (Pause
  in both of the pad's tables) that opened the pause menu is not also a press on player 1's slot
  that resumes it at once, and the START that resumes does not pause again on player 2's slot.
  A pad that disappears — `null`, `connected: false` or missing from a shorter
  `getGamepads()` list — gives player 2's seat up on that same poll.

## Player seats and the split keyboard (M2-06)

Two-player co-op needs to know **which device drives which player**. The core tells the host how
many **seats** to route — `Game.inputSeats`: `2` while a co-op game (or its continue countdown) is
on top, else `1` — and `bootShell` forwards a change to `WebInput.setSeats()` before the frame's
ticks, exactly like the binding context.

| Seats | Keyboard / remote | Split keyboard's second half | Pads |
|---|---|---|---|
| 1 | player 1 | player 1 | every pad → player 1 (any slot works solo — before M2-06 pad slot 1 was always player 2) |
| 2 | player 1 | player 2 | unseated pads drive player 1 **until their first join press** — a button the gamepad profile's **menu** table binds to Confirm or Pause (`joinButtonsOf`: A, START) — which seats the pad (`padSeat(i)` = `PAD_SEAT_P2`) and forwards a **latched Confirm** on player 2's slot (the World's join, `core/world` `JOIN_ACTIONS`); the seated pad drives player 2 only; other pads player 1 |

- A seat lasts across games and seat changes until the pad goes away: `null`, `connected:
  false` or missing from a shorter `getGamepads()` list gives it up on that poll, before the seat
  check, so another pad can take it at once. While a split profile is active no pad is seated —
  the right half owns player 2's seat.
- **No phantom presses across a seat change** (above, [binding
  contexts](#binding-contexts-game--menu-decision-d15)): `setSeats` remembers what the moving
  sources held (`padLast`, the split half) and the next poll clears those actions' press edges on
  their new player.
- **The split keyboard** is a second `KeyboardSource` on the same event target
  (`WebInput.splitKeyboard`), bound to the key profile's `splitTables[context]` (an empty table
  without a split). `setContext` swaps both halves; `clear()` / `destroy()` cover both.
- **Validation** (`checkSplit`, after the schema): `split` only on `keyboard` profiles, no
  `buttons`, each half binds `REQUIRED_CONTEXT_ACTIONS`, and no `byCode` / `byKeyCode` entry of a
  context appears in both halves (one key must never drive both players). The compiled halves are
  `InputProfile.splitTables` (`null` without a split).
- The TV never offers `keyboard-split` (its key space is `keyCode`; the profile binds `code`), so
  on the TV co-op is the remote plus a gamepad.

The whole co-op step — the World's join, per-player continues, the HUD — is in
[coop.md](coop.md).

## Single key at a time (`InputTuning.singleKey`, M3-02b)

The Samsung Smart Remote delivers **one key at a time**: while a key is physically down, the
`keydown` of any other key never reaches the page — not on press, not on release — and the held key
keeps repeating (input-probe finding 1, both monitors, 0 of the attempts delivered). A profile with
`singleKey: true` makes the key source behave that way whatever the browser sends:

- a `keydown` of a key that is not already tracked is **dropped** while any tracked key is down
  (a key inside its release-debounce window is already up, so it does not block the next one);
- the held key keeps its slot, its press order and its actions — nothing stutters;
- the dropped key's `keyup` is ignored too (it was never tracked).

It is the reason the TV profile keeps `combine` / `neutral`: the diagonal and SOCD policies simply
never have two directions to resolve. `keyboard-remote-emulation` sets it as well, so a desktop
keyboard reproduces the remote's real feel (before M3-02b it used `lastWins`, which let the second
arrow take over — the hardware does not).

## Release debounce (`remote.createReleaseDebouncer`)

Feat §4 rule 3: some TV remotes send fake `keyup`/`keydown` pairs while a key is held. **The
M7's remote does not** (M3-02b: 0 bounces in 338 measured repeats), so every shipped profile has
`releaseDebounceTicks: 0` and the mechanism stays for other sets and for the player's DEBOUNCE
option. With a
window of *N* ticks, a `keyup` that arrives between polls *k* and *k*+1 keeps the key held
for polls *k*+1 … *k*+*N* and releases it on poll *k*+*N*+1. A `keydown` for the same key
inside the window **resumes** it: no new `pressed` edge, no new tap latch, and the key keeps
its original press order (so a fake pair never makes an arrow "most recent" under `lastWins`).

```text
 tick         k        k+1      k+2      k+3            (N = 2 — a set that needs it)
 events   ↓down ... ↑up   ↓down                          fake pair ~20 ms apart
 held         ██████████████████████████████████████    continuous — no stutter, one press
 ────────────────────────────────────────────────────
 events   ↓down ... ↑up                                  real release
 held         ████████████████████░░                     released on poll k+3 (2 ticks late)
```

- Gaps up to *N* ticks are always hidden; gaps longer than *N*+1 ticks always show; in
  between it depends on where the events fall relative to the polls. At 60 Hz, `N = 2` hides
  any pair up to ~33 ms apart.
- The price is release latency: every release reaches the core *N* ticks later. Presses are
  never delayed. That is why the keyboard and gamepad profiles use 0.
- The window ages in `KeyboardSource.advance()`, which `WebInput.poll()` calls **first**, once
  per tick. `setTuning()` with a shorter window shortens pending releases (`0` releases them
  at once); it never extends one.
- An auto-repeat `keydown` is ignored with or without the `repeat` flag (the key is already
  down) — and that is not a nicety: the Samsung remote's repeats carry **`repeat === false`**
  (M3-02b). Measured 2026-09-15, a held remote key repeats after `REMOTE_REPEAT_DELAY_TICKS` (21 ≈
  355 ms) and then every `REMOTE_REPEAT_INTERVAL_TICKS` (6.5 ≈ 108 ms, ± 40 ms), with the real
  `keyup` 0–100 ms after the last repeat — one `pressed` edge, held throughout, released on the
  key-up tick. Both constants are exported from `input-web/remote` for the docs and the playtest
  model; nothing in the pipeline waits on them. Code that watches keys **outside** this pipeline
  must track held keys itself (the shell's debug tools do), and an ESLint rule forbids
  `.timeStamp` in runtime sources — Tizen 5.5 advances it in whole seconds only.
  `blur`, `clear()` and suspend drop every key immediately, debounce included.
- The keyboard source tracks up to `MAX_TRACKED_KEYS` = 32 physical keys in fixed slots; a
  33rd simultaneous key is ignored until one is released.

## Diagonal and SOCD policies (`remote.resolveDirections`)

`resolveDirections(mask, order, diagonals, socd)` runs on the held mask of every read:

1. **SOCD** per axis (Left + Right, Up + Down): `neutral` cancels both; `lastWins` keeps the
   more recently pressed one (a tie — both pressed within the same poll — falls back to
   neutral, so the result never depends on bit order).
2. **Diagonal policy** between the surviving horizontal and vertical direction: `combine`
   keeps both (8-way); `lastWins` keeps the most recent one — the remote's "second arrow
   replaces the first", releasing it brings the other back; `firstWins` keeps the earlier one
   until it is released. Ties keep the vertical direction for `lastWins`, the horizontal one
   for `firstWins`.

Non-direction bits pass through untouched; the function is pure and allocation-free. The
keyboard derives the press order from its event sequence numbers; pads use one
`createDirectionOrder()` tracker per slot, updated every poll (an empty slot resets it). The
tests check the function exhaustively (16 masks × 256 orders × 6 policy pairs) against a
reference model.

## Tizen key registration

Only arrows, OK (13) and Back (10009) reach a Tizen web app without registration. The TV
platform registers the active key profile's `register` list with
`tizen.tvinputdevice.registerKeyBatch()` (per-key `registerKey` fallback when the batch reports
an unsupported key). `registerRemoteKeys()` filters `SYSTEM_REMOTE_KEYS` itself, so even a hand
edit that slipped past validation can never take `Exit` or the volume keys from the system.
The shipped profiles register only D14's three keys; the colour keys (403–406) stay in the
no-profile fallback `REMOTE_KEYS_TO_REGISTER` until something uses them. Back is also watched
by `watchBackKey`, but only until the shell runs (the loading and boot error screens are the
root screen then, so Back exits); since M1-16 the watcher is removed once the game runs and Back
is an ordinary key of the profile — `Pause` in the game, `Back` in menus — which the scene stack
turns into pause / resume / back and, on the title, the exit confirmation
([scenes-and-ui.md](scenes-and-ui.md#back-pause-and-the-platform)).

## Using it in code

```ts
import {
  DEFAULT_REMOTE_PROFILE_ID,
  INPUT_PROFILES_KIND,
  KEY_PROFILE_DEVICES,
  chooseInputProfile,
  createInputProfileRegistry,
  createWebInput,
  inputProfileChoices,
  selectableKeyProfiles,
} from '@shmup/input-web';

const input = createWebInput({ keyTarget: window, keyDevice: 'remote', getGamepads });
const profiles = createInputProfileRegistry();
const shell = await bootShell({
  ...options,
  input,
  contentOwners: { [INPUT_PROFILES_KIND]: profiles.load }, // keep the parsed profiles
  platform: (renderer) => {
    const keys = chooseInputProfile(profiles.profiles, [DEFAULT_REMOTE_PROFILE_ID], KEY_PROFILE_DEVICES);
    if (keys !== null) input.setProfile(keys);
    return createTizenPlatform({ ...platformOptions, registerKeys: keys?.register });
  },
  inputProfiles: {
    // the Options screen's CONTROLS; the saved choice arrives through apply(id, 'save')
    choices: () => inputProfileChoices(profiles.profiles, 'keyCode', DEFAULT_REMOTE_PROFILE_ID),
    active: () => input.keyProfile?.id ?? null,
    apply: (id) => {
      const offered = selectableKeyProfiles(profiles.profiles, 'keyCode');
      const chosen = chooseInputProfile(offered, [id], KEY_PROFILE_DEVICES);
      if (chosen !== null && chosen !== input.keyProfile) input.setProfile(chosen);
    },
  },
});
```

The running state is on the app object `bootWebApp` / `bootTizenApp` resolve with (tests read
it; `main.ts` does not put it on `window`): `app.input.keyProfile?.id`,
`app.input.gamepadProfile?.id`, `app.input.context`, `app.profiles.profiles`,
`app.profiles.issues`.

## Zero allocation

`poll()`, `setContext()`, the key event handlers, `advance()` and the `held` getter allocate
nothing: the keyboard's slots are typed arrays created once, the debouncer is two typed
arrays, `resolveDirections` works on numbers, the per-pad state objects and direction
trackers are created with the adapter. Profiles are compiled once at load; `setProfile()` is
a load-time call. An allocation guard in `web-input-profiles-edge.test.ts` runs `poll()` with
profiles, debounce, policies and pads — the pad's stick sweeping round, so its axes read new
values on every poll as a real stick's do — through the core's `measureHeapGrowth` (a per-poll
array would show as ~0.5 MB, one boxed number per poll as 160 KB against the 128 KB budget, a
cache keyed on the stick's reading ~320 KB; today it measures ~4 KB).

## Rebinding and the player's settings (M2-16)

The profiles stay content; the player's changes live in the save (`options.input` of `core/save`
format 2: `socd`, `releaseDebounce`, `bindings` — per profile id and context, each rebound action's
whole key set as binding tokens `code:<code>` / `key:<keyCode>` / `button:<index>`). The apps keep
the key and gamepad profiles **as written** and apply them through `customizeInputProfile(profile,
settings)`: the profile's override (`applyBindingOverride`), then — only when set — the SOCD policy on
every profile and the debounce on key profiles (`overrideInputTuning`). A profile switch in CONTROLS
applies the new profile with its own override; the web's `?debounce=` is applied after the player's
settings. An override that would leave a context without a key for an action it requires
(`REQUIRED_CONTEXT_ACTIONS`) keeps the content's table — the lock-out rule the profile choice already
followed ([choosing the active profile](#choosing-the-active-profile)); on `keyboard-split` a key
player 2's half binds is never given to player 1.

The rebind screen asks the adapter for the next key or button (`WebInput.beginCapture`: the
keyboard source's `KeyCapture` catches a new keydown — never an auto-repeat, a held key or a key in
its debounce window, so a remote's fake keyup / keydown pair does not count —; `poll()` catches the
lowest newly pressed pad button; Escape and the remote's Back cancel), names it the way the profile
binds that key (`captureToken` — `code:` or `key:`; `code:ArrowUp` and `key:38` are one key for the
conflict detection) and binds it with `rebindAction` (moved, swapped, refused, rejected — reserved
keys, a key the device cannot hold). The whole feature — tokens, statuses, the screen, the shell's
`createShellControls`, the input test — is on
[options-rebinding-and-accessibility.md](options-rebinding-and-accessibility.md#rebinding-shmupinput-web-rebind).

## Extending it

| To… | Do this |
|---|---|
| Tune the remote after the probe | Edit `content/input/remote.input-profiles.json` — the recipes are in the [folder README](../../content/input/README.md#tuning-after-the-input-probe-plan-82). No code change; `pnpm content:check`, rebuild, reinstall |
| Add a profile | Append an entry (unique kebab id, upper-case label) to an `*.input-profiles.json` under `content/input/`; it is selectable at once with `?profile=<id>` on the web. Making it a default is an app change (`DEFAULT_*_PROFILE_ID` or the candidate list) |
| Add a profile file | `content/input/<name>.input-profiles.json` — the naming rule `<folder>/<name>.<kind>.json` is enforced; ids stay unique across files |
| Add a game action | Append the bit to core `Action` / `ACTION_NAMES` (never renumber), bind it in every shipped profile where it belongs and in the built-in `keymap` / `gamepad` defaults; add it to `REQUIRED_CONTEXT_ACTIONS` only if every profile must bind it |
| Add a binding context | Extend `InputContext` / `INPUT_CONTEXTS` in core, the `context` schema and `compileProfile` in `rebind`, `REQUIRED_CONTEXT_ACTIONS`, and every shipped profile (the schema makes each context required) |
| Add a device kind | Extend `InputProfileDevice` / `INPUT_PROFILE_DEVICES`, decide its rules in `checkProfile`, and route it in `WebInput.setProfile` |
| Offer a new profile in CONTROLS | Nothing to do if its menu table binds the six menu actions in the host's key space (`byCode` for the web, `byKeyCode` for the TV) — `selectableKeyProfiles` picks it up; otherwise it stays reachable only through `?profile=` on the web |
| Make an action rebindable | Append it to `core/ui` `REBINDABLE_ACTIONS[context]` (the rebind screen's rows follow); a new required action goes into `REQUIRED_CONTEXT_ACTIONS` too ([options-rebinding-and-accessibility.md](options-rebinding-and-accessibility.md#extending-it)) |
| Another split preset | A `keyboard` profile with a `split` section (same format as `context`; no key in both halves; the required actions in each half) — `checkSplit` validates it, `WebInput` routes it by seats ([coop.md](coop.md#input-routing-shmupinput-web-shmupshell)) |
| Another host | Implement `ShellInput.setContext` (and, for co-op, the optional `setSeats`) in its adapter; pass a registry's `load` as the `input-profiles` owner if the host needs the profiles, otherwise the shell's default owner still validates them |

## Tests

| Where | Covers |
|---|---|
| `packages/input-web/test/remote/` | The exact debounce window for every tick count 0–10, per-slot ageing, resumes and re-releases inside the window, `setTicks`, capacities (incl. `NaN`); `resolveDirections` exhaustively against a reference model and its invariants; press-order numbering |
| `packages/input-web/test/rebind/` | Every schema limit, the semantic checks alone and combined, dropped profiles never claiming ids, compiled tables (frozen, prototype-free, `0` placeholders, button gaps), path-order independence, the registry, `chooseInputProfile`, `overrideInputTuning` clamping, the persistence hook; `selectableKeyProfiles` / `inputProfileChoices` per key space (gamepads never offered, order, the default suffix, the `extra` profile — `rebind-choices*.test.ts`, M1-17) |
| `packages/input-web/test/rebind/rebind-rebinding*.test.ts` | M2-16: capture tokens per profile and context, bind / move / swap / refuse / reject / unchanged, `code:` ≡ `key:` holders, reserved keys, the split keyboard's player-2 keys, reset, `customizeInputProfile` (SOCD, debounce, the lock-out fallback), conflicts, key labels |
| `packages/input-web/test/keyboard/`, `keymap/` | Fake pairs never renewing press order, pending releases across table / tuning switches, `0`-mask keys tracked and prevented, `findKeyActions` `-1` / `0` / fall-through; M2-16 `keyboard-capture.test.ts` (only new keys caught — repeats, held and debouncing keys ignored) |
| `packages/input-web/test/web-input/` | The probe scenarios replayed as timed fake event sequences (clean hold, fake pairs 30 ms apart with debounce 2 vs 0, OK while an arrow is held, diagonal and SOCD policies, `game` vs `menu`), no phantom edges across switches, gamepad profiles, the debounce boundary at any poll phase, the allocation probe; player seats (M2-06, `web-input-seats*.test.ts`): the join press as an edge from the menu table, one pad per seat, seats given up by pads that disappear (also from a shorter list), no phantom presses across a seat change, the split keyboard |
| `packages/shell/test/` | Context and seats (M2-06) forwarded before the frame's polls (context also while paused), an adapter without `setSeats`, a bad `input-profiles` file stops boot on the error screen, an app owner replaces the default owner |
| `apps/*/test/boot/` | Profile choice per app, `?profile=` / `?debounce=` (incl. `inputOverridesFromSearch` edge cases), the saved choice through the save (M1-17), CONTROLS entries and live switches (the TV registering the new keys), a pick winning over `?profile=`, content without profiles (fallback), Tizen registration lists |
| `test/integration/input-profiles.test.ts` | Every key and button of every shipped profile, in both contexts, reaches the core snapshot as exactly its actions; a fake-pair remote session records and replays tick for tick |
| `test/integration/coop-remote-pad.test.ts` | Co-op (M2-06) through a real `WebInput` and the scene flow with the shell's per-frame forwarding: the remote plays player 1, a pad's START takes player 2's seat and joins, pausing / resuming with player 2's held START, an unplugged seated pad, each device's OK in the continue countdown |
| `packages/input-web/test/web-input/web-input-capture.test.ts`, `packages/shell/test/controls/` | M2-16: key and button captures through `WebInput`, Escape / Back cancelling; a real capture → rebinding → save → applied |
| `test/e2e/input.spec.ts` | The built web page: bound keys prevented, unbound keys not; `?profile=keyboard-remote-emulation` knows only the remote's keys; an unknown `?profile=` warns and boots |
| `test/e2e/coop.spec.ts`, `coop-gamepad.spec.ts` | Co-op on the built web page (M2-06): the split keyboard; a fake `navigator.getGamepads()` pad that drives the menus with one seat, joins as player 2 with START, moves player 2 only, and pauses / resumes without a phantom second press |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| Boot error `…input-profiles.json:profiles[n].context.menu: must bind Confirm, Back` | Every `menu` table must bind the four directions, `Confirm` and `Back` (and every `game` table the directions and `Pause`). The profile is dropped, and the issue still stops the boot — fix the file |
| Boot error `no loader for content kind "input-profiles"` | Should not happen any more (the shell has a default owner). If it does, a custom `loadGameContent` call bypassed `DEFAULT_CONTENT_OWNERS` |
| `?profile=foo` does nothing | Unknown id, or a gamepad profile (the key source only takes `keyboard` / `remote`). The console shows the `Shmup Cup: no keyboard or remote input profile` warning; the default is used |
| A key does nothing in menus but works in the game | It is bound only in the `game` table. Keys of the other context are known (`0`) and prevented, but act only where bound |
| Releases feel late with a remote profile | The release debounce delays every release by `releaseDebounceTicks` ticks (2 = 33 ms). The shipped profiles use 0 since M3-02b; check the player's DEBOUNCE option and `?debounce=` |
| A second arrow or OK does nothing while an arrow is held | Expected on a `singleKey` profile (the real remote behaves this way): let the first key go first |
| Diagonals impossible on the keyboard | `keyboard-remote-emulation` is active (the URL, or KEYBOARD AS REMOTE picked in OPTIONS → CONTROLS and saved) — since M3-02b its `singleKey` drops the second arrow's `keydown` outright, as the hardware does |
| Holding a key through a menu switch "loses" it | By design: a held key keeps only the actions common to both tables until released. Release and press again |
| A remote key never arrives on the TV | It must be in the active profile's `register` list (and supported by that remote model); Play/Pause and Ch± are registered by default, the colour keys only without a profile |
| Back closes the TV app instead of pausing | Only expected on the loading and boot error screens; since M1-16 Back pauses in the game and asks before quitting on the title. An older build exits — reinstall |
| A profile edit does not show in `pnpm dev` | Content edits reload the page; a saved choice (`options.input.profileId` in `shmup-cup:save.v1`) may be overriding the default — pick the default in CONTROLS or use `?profile=` |
| A pad drives player 1 in a co-op game | Expected until it presses a button its gamepad profile's **menu** table binds to Confirm or Pause (A, START) — that seats it as player 2. With the seat taken (another pad, or `keyboard-split` active) every other pad drives player 1 |
| Player 2's START paused the game instead of joining | Player 2 cannot join right now (still flying, dying, out for good) — or the host never forwards `Game.inputSeats` (`setSeats` missing), so every device drives player 1 |
| `…input-profiles.json:profiles[n].split.game.byCode.KeyW: is bound in both halves of the keyboard` | A split half may not reuse a key of the other half in the same context; `split` on a `remote` / `gamepad` profile is an issue too |
| A rebound key does nothing, or the old key still acts | The token was built by hand as `key:38` while the profile binds `code:ArrowUp` (a `code:` entry with actions hides the key-code one) — always name a captured key with `captureToken(profile, captured, context, override)` |
| The player's DEBOUNCE is ignored on the web | `?debounce=` is in the address — the dev override is applied after the player's settings |
| A profile is missing from CONTROLS | Its menu table cannot be driven by this host's keys (a remote profile binds by `keyCode`, which the web key space does not consult) or it is a gamepad profile — by design ([the saved choice](#the-saved-choice)) |

## Next steps that build on this page

- **M1-06** (done) — the ship moves with these masks: `readPlayerIntent` turns the direction
  bits into `moveX` / `moveY` (opposites cancel once more), diagonals are × 0.7071 (D4)
  ([sim-world.md](sim-world.md#the-player-ship-coreplayer)).
- **M1-10** (done) — `Shot` fires the main weapon and `Sub` the missiles while held; with
  `GameConfig.autofire` (the default) or `remoteMode` (the TV) they fire without a button
  (feat §4 rule 1, [weapons-and-options.md](weapons-and-options.md#shooters-autofire-and-caps-phase-2-updateplayers)).
- **M1-16** (done) — the scene stack returns `'menu'` from `Game.inputContext` for menus and
  the pause screen; Back handling moved from `watchBackKey` to the scenes; menus read every
  player's input merged ([scenes-and-ui.md](scenes-and-ui.md)).
- **M1-17** (done) — the Options screen's CONTROLS: the selectable profiles, the choice stored in
  the save and applied live (the TV registering the new profile's keys)
  ([saves-and-options.md](saves-and-options.md)).
- **M2-06** (done) — player seats (`WebInput.setSeats` from `Game.inputSeats`; pads join as player
  2 with A / START), the split keyboard (`split`, `splitTables`, `keyboard-split`), no phantom
  presses across a seat change ([coop.md](coop.md)).
- **M2-16** (done) — per-device rebinding with conflict detection and reset, the player's SOCD
  policy and debounce (DEBOUNCE — the advanced tuning of the remote), the rebinding capture in
  `WebInput`, the input test; `rebind` → implemented
  ([options-rebinding-and-accessibility.md](options-rebinding-and-accessibility.md)).
- **On hardware** — the probe was run on 2026-09-15 (see the section above); re-run it (plan §8.2)
  after a firmware change and set `releaseDebounceTicks` /
  `diagonals` / `register` from its verdicts.

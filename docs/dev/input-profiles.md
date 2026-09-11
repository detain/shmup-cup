# Input profiles: remote-first bindings, binding contexts and device quirks

How a key, a remote button or a gamepad button becomes an action the simulation sees, and
why the Samsung remote's mapping and quirks are **data**. Filled in by plan step **M1-05**.
The Options screen (M2-16) adds a rebinding UI on top of the same profiles; nothing on this
page changes shape for it.

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
        │
        ▼  every tick: WebInput.poll()
 keyboard.advance()               age the release debounce          (remote.createReleaseDebouncer)
 keyboard.held                    tracked keys → mask → SOCD → diagonal policy (remote.resolveDirections)
 readGamepadActions(pad, …)       buttons (stale ones masked) + stick, per-pad press order → same policies
 commitPlayerInput(p1 / p2, …)    core/input: held, pressed, released, device
```

The core never sees a key code or a profile. It sees resolved action masks, so replays stay
profile-independent: a session recorded with `tizen-remote-safe` replays tick for tick into a
headless game (`test/integration/input-profiles.test.ts`).

## Module responsibilities (`@shmup/input-web`)

| Module | Status | Owns |
|---|---|---|
| `rebind` | partial | Profile types, `parseInputProfiles` / `loadInputProfiles` (validation + compilation), the registry, `chooseInputProfile`, `overrideInputTuning`, the persistence hook. The rebinding UI helpers come with M2-16 |
| `remote` | implemented | The quirk knobs as allocation-free building blocks: `createReleaseDebouncer`, `resolveDirections`, `createDirectionOrder`, `InputTuning` |
| `keyboard` | implemented | Key events → 32 fixed key slots with the debounce; `setBindings` (table swap without phantom presses), `setTuning`, `advance` |
| `gamepad` | implemented | One pad → mask; `pressedButtons` / `staleButtons` for table swaps |
| `keymap` | implemented | Built-in fallback tables, `TIZEN_KEY_CODES`, `findKeyActions` (`-1` unbound vs `0` known) |
| `web-input` | partial | The `PlatformInput`: `setProfile`, `setContext`, `context`, `keyProfile`, `gamepadProfile`, `poll` |

Around it: core `input` owns `InputContext` / `INPUT_CONTEXTS`, core `game` the
`Game.inputContext` getter, `@shmup/shell` the per-frame context forwarding and
`DEFAULT_CONTENT_OWNERS`, the apps the profile choice and (Tizen) key registration.

## The shipped profiles

| Profile | `device` | Used | Debounce | Diagonals / SOCD | `register` |
|---|---|---|---|---|---|
| `tizen-remote-safe` | `remote` | TV default (D14) | 2 | `combine` / `neutral` | `MediaPlayPause`, `ChannelUp`, `ChannelDown` |
| `tizen-remote-diagonal` | `remote` | after a positive probe result | 0 | `combine` / `neutral` | same |
| `keyboard-default` | `keyboard` | web default | 0 | `combine` / `neutral` | — |
| `keyboard-remote-emulation` | `remote` | `?profile=keyboard-remote-emulation` | 2 | `lastWins` / `lastWins` | — |
| `gamepad-standard` | `gamepad` | every pad, both apps | 0 (must be) | `combine` / `neutral` | — |

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
| Key profile | `?profile=<id>` › saved choice › `keyboard-default` | saved choice › `tizen-remote-safe` |
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

`loadInputProfileChoice(storage)` / `saveInputProfileChoice(storage, id)` use
`Platform.storage` key **`input.profile`** (`INPUT_PROFILE_STORAGE_KEY`; in `localStorage`
it is `shmup-cup:input.profile`). Storage is asynchronous, so the apps boot with the default and
apply the saved profile **when storage answers**:

- web: only without a `?profile=` override (the URL wins), and only if it differs from the
  active id; the `?debounce=` override is applied to it too;
- Tizen: registers the new profile's `register` keys (`registerRemoteKeys`) after applying it;
- both: a choice that arrives after `app.stop()` is ignored.

Nothing writes the choice yet — the Options screen (M2-16) calls `saveInputProfileChoice`. To
try it by hand in a browser console: `localStorage.setItem('shmup-cup:input.profile',
'keyboard-remote-emulation')`, then reload.

## Binding contexts (`game` / `menu`, decision D15)

- `InputContext = 'game' | 'menu'` lives in core `input`. `Game.inputContext` is the
  context the top scene wants; until the scene stack lands (M1-16) it always returns
  `'game'`. It is presentation routing only — the simulation still gets plain masks, and
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

## Release debounce (`remote.createReleaseDebouncer`)

Feat §4 rule 3: some TV remotes send fake `keyup`/`keydown` pairs while a key is held. With a
window of *N* ticks, a `keyup` that arrives between polls *k* and *k*+1 keeps the key held
for polls *k*+1 … *k*+*N* and releases it on poll *k*+*N*+1. A `keydown` for the same key
inside the window **resumes** it: no new `pressed` edge, no new tap latch, and the key keeps
its original press order (so a fake pair never makes an arrow "most recent" under `lastWins`).

```text
 tick         k        k+1      k+2      k+3            (N = 2, tizen-remote-safe)
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
  down). `blur`, `clear()` and suspend drop every key immediately, debounce included.
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
no-profile fallback `REMOTE_KEYS_TO_REGISTER` until something uses them. Back is still also
watched by `watchBackKey`: until the scene stack exists (M1-16) the showcase is the root
screen, so Back exits the TV app regardless of the profile's `Pause` binding.

## Using it in code

```ts
import {
  DEFAULT_REMOTE_PROFILE_ID,
  INPUT_PROFILES_KIND,
  KEY_PROFILE_DEVICES,
  chooseInputProfile,
  createInputProfileRegistry,
  createWebInput,
  loadInputProfileChoice,
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
});
const saved = await loadInputProfileChoice(shell.platform.storage); // later: apply it too
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
a load-time call. An allocation probe in `web-input-profiles-edge.test.ts` runs `poll()` with
profiles, debounce, policies and pads (a per-poll array would show as ~0.5 MB; today it
measures ~30 KB of test noise).

## Extending it

| To… | Do this |
|---|---|
| Tune the remote after the probe | Edit `content/input/remote.input-profiles.json` — the recipes are in the [folder README](../../content/input/README.md#tuning-after-the-input-probe-plan-82). No code change; `pnpm content:check`, rebuild, reinstall |
| Add a profile | Append an entry (unique kebab id, upper-case label) to an `*.input-profiles.json` under `content/input/`; it is selectable at once with `?profile=<id>` on the web. Making it a default is an app change (`DEFAULT_*_PROFILE_ID` or the candidate list) |
| Add a profile file | `content/input/<name>.input-profiles.json` — the naming rule `<folder>/<name>.<kind>.json` is enforced; ids stay unique across files |
| Add a game action | Append the bit to core `Action` / `ACTION_NAMES` (never renumber), bind it in every shipped profile where it belongs and in the built-in `keymap` / `gamepad` defaults; add it to `REQUIRED_CONTEXT_ACTIONS` only if every profile must bind it |
| Add a binding context | Extend `InputContext` / `INPUT_CONTEXTS` in core, the `context` schema and `compileProfile` in `rebind`, `REQUIRED_CONTEXT_ACTIONS`, and every shipped profile (the schema makes each context required) |
| Add a device kind | Extend `InputProfileDevice` / `INPUT_PROFILE_DEVICES`, decide its rules in `checkProfile`, and route it in `WebInput.setProfile` |
| Build the rebinding UI (M2-16) | Planned in `rebind`: capture the next input, conflict detection, reset to defaults, a per-device choice. Persist through `saveInputProfileChoice`; apply with `WebInput.setProfile` (held keys are handled) |
| Another host | Implement `ShellInput.setContext` in its adapter; pass a registry's `load` as the `input-profiles` owner if the host needs the profiles, otherwise the shell's default owner still validates them |

## Tests

| Where | Covers |
|---|---|
| `packages/input-web/test/remote/` | The exact debounce window for every tick count 0–10, per-slot ageing, resumes and re-releases inside the window, `setTicks`, capacities (incl. `NaN`); `resolveDirections` exhaustively against a reference model and its invariants; press-order numbering |
| `packages/input-web/test/rebind/` | Every schema limit, the semantic checks alone and combined, dropped profiles never claiming ids, compiled tables (frozen, prototype-free, `0` placeholders, button gaps), path-order independence, the registry, `chooseInputProfile`, `overrideInputTuning` clamping, the persistence hook |
| `packages/input-web/test/keyboard/`, `keymap/` | Fake pairs never renewing press order, pending releases across table / tuning switches, `0`-mask keys tracked and prevented, `findKeyActions` `-1` / `0` / fall-through |
| `packages/input-web/test/web-input/` | The probe scenarios replayed as timed fake event sequences (clean hold, fake pairs 30 ms apart with debounce 2 vs 0, OK while an arrow is held, diagonal and SOCD policies, `game` vs `menu`), no phantom edges across switches, gamepad profiles, the debounce boundary at any poll phase, the allocation probe |
| `packages/shell/test/` | Context forwarded before the frame's polls (also while paused), a bad `input-profiles` file stops boot on the error screen, an app owner replaces the default owner |
| `apps/*/test/boot/` | Profile choice per app, `?profile=` / `?debounce=` (incl. `inputOverridesFromSearch` edge cases), a saved choice applied late or after `stop()`, content without profiles (fallback), Tizen registration lists |
| `test/integration/input-profiles.test.ts` | Every key and button of every shipped profile, in both contexts, reaches the core snapshot as exactly its actions; a fake-pair remote session records and replays tick for tick |
| `test/e2e/input.spec.ts` | The built web page: bound keys prevented, unbound keys not; `?profile=keyboard-remote-emulation` knows only the remote's keys; an unknown `?profile=` warns and boots |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| Boot error `…input-profiles.json:profiles[n].context.menu: must bind Confirm, Back` | Every `menu` table must bind the four directions, `Confirm` and `Back` (and every `game` table the directions and `Pause`). The profile is dropped, and the issue still stops the boot — fix the file |
| Boot error `no loader for content kind "input-profiles"` | Should not happen any more (the shell has a default owner). If it does, a custom `loadGameContent` call bypassed `DEFAULT_CONTENT_OWNERS` |
| `?profile=foo` does nothing | Unknown id, or a gamepad profile (the key source only takes `keyboard` / `remote`). The console shows the `Shmup Cup: no keyboard or remote input profile` warning; the default is used |
| A key does nothing in menus but works in the game | It is bound only in the `game` table. Keys of the other context are known (`0`) and prevented, but act only where bound |
| Releases feel late with a remote profile | Expected: the release debounce delays every release by `releaseDebounceTicks` ticks (2 = 33 ms). Use `?debounce=0` to compare; the probe decides the final value |
| Diagonals impossible on the keyboard | `keyboard-remote-emulation` is active (the URL, or a saved choice in `shmup-cup:input.profile`) — `lastWins` keeps one arrow |
| Holding a key through a menu switch "loses" it | By design: a held key keeps only the actions common to both tables until released. Release and press again |
| A remote key never arrives on the TV | It must be in the active profile's `register` list (and supported by that remote model); Play/Pause and Ch± are registered by default, the colour keys only without a profile |
| Back closes the TV app instead of pausing | Expected until the scene stack (M1-16): the showcase is the root screen and `watchBackKey` exits from it |
| A profile edit does not show in `pnpm dev` | Content edits reload the page; a saved choice in `localStorage` (`shmup-cup:input.profile`) may be overriding the default — remove it or use `?profile=` |

## Next steps that build on this page

- **M1-06** — the ship moves with these masks (remote diagonals × 0.7071, D4); forced
  autofire in remote mode.
- **M1-16** — the scene stack returns `'menu'` from `Game.inputContext` for menus and the
  pause screen; Back handling moves from `watchBackKey` to the scenes.
- **M2-16** — Options: profile choice (writes `input.profile`), per-device rebinding, conflict
  detection, reset to defaults.
- **On hardware** — run the input probe (plan §8.2) and set `releaseDebounceTicks` /
  `diagonals` / `register` from its verdicts.

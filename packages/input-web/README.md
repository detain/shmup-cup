# @shmup/input-web

Browser input adapter: **keyboard + Samsung TV remote + W3C Gamepad API → the core's
per-tick `InputSnapshot`** (action bitmasks). The core never sees key codes
(`shmup_tech.md` §3.2, §4.4; `shmup_feat.md` §4).

- **Keys** are resolved by `KeyboardEvent.code` (layout independent), falling back to the
  legacy `keyCode` for TV-remote keys that have no `code` (Back 10009, Play/Pause 10252,
  Ch± 427/428). Held state comes from keydown/keyup only (auto-repeat ignored), taps
  shorter than a tick are latched, bound keys get `preventDefault()`, `blur` clears all.
- **Remote quirks** come from the active input profile: a release debounce hides fake
  keyup/keydown pairs, the diagonal policy (`combine` / `lastWins` / `firstWins`) and SOCD
  (`neutral` / `lastWins`) resolve simultaneous directions.
- **Gamepads** (standard mapping): D-pad 12–15 + left stick (radial deadzone 0.2, 8-way
  with hysteresis); A = Shot/Confirm, B = Sub/Back, X = PowerUp, Y = Special, LB/RB = Speed,
  Select = Back, Start = Pause.
- **Player seats** (M2-06, two-player co-op): the host forwards the core's `Game.inputSeats` to
  `input.setSeats(n)`. One seat — every device, every pad included, drives player 1. Two seats (a
  co-op game) — the keyboard / remote drives player 1, and a pad's first A / START (or the right
  half of the `keyboard-split` profile) takes player 2's seat (`padSeat(i)` → `PAD_SEAT_P2`) until
  it disconnects; a seat change never makes a press.
- **Rebinding** (M2-16): the player's rebound keys and buttons live in the `core/save` document
  (`options.input.bindings` — per profile and context, binding tokens `code:<code>` /
  `key:<keyCode>` / `button:<index>`); `customizeInputProfile(profile, settings)` applies them with
  the player's SOCD policy and release debounce before `setProfile` (a context that would lose a
  required action keeps the content's table). `beginCapture('keys' | 'buttons')` / `capture` /
  `endCapture` catch the next new key or pad button (Escape / the remote's Back cancel);
  `captureToken` names it the way the profile binds it, `rebindAction` binds it with **conflict
  detection** (moved / swapped / refused / rejected), `resetBindings` restores the content's.
- `poll()` reuses one snapshot object (no per-tick allocation).

```ts
import { createWebInput, loadInputProfiles } from '@shmup/input-web';

const input = createWebInput({ keyTarget: window, keyDevice: 'remote', getGamepads: () => navigator.getGamepads() });
const { profiles } = loadInputProfiles(inputProfileFiles); // content/input/*.input-profiles.json
input.setProfile(profiles.find((p) => p.id === 'tizen-remote-safe')!);
input.setContext('menu'); // when Game.inputContext changes (the shell does this)
input.setSeats(game.inputSeats); // when it changes: 2 during a co-op game (the shell does this)
const snapshot = input.poll(); // once per simulation tick (via Platform.input)
```

## Input profiles (decisions D13–D15)

The mapping is data: `content/input/remote.input-profiles.json` ships `tizen-remote-safe`
(TV default: release debounce 2 ticks, diagonals `combine`, registers Play/Pause + Ch±),
`tizen-remote-diagonal` (debounce 0), `keyboard-default` (web default),
`keyboard-remote-emulation` (only the remote's keys, arrows `lastWins`), `keyboard-split` (M2-06:
two players on one keyboard — WASD + F / G vs arrows + K / L, Enter = player 2's START) and
`gamepad-standard`. Each profile has a **`game`** and a **`menu`** table:

| Action | `keyboard-default` game / menu | `tizen-remote-safe` game / menu | `gamepad-standard` game / menu |
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

Before a profile is applied the built-in `keymap` / `gamepad` defaults are used (one merged
table, e.g. Z = Shot + Confirm).

## Modules

| Module | Status | Responsibility |
|---|---|---|
| `keymap` | implemented | Built-in bindings, Tizen key codes, `code`/`keyCode` resolution |
| `keyboard` | implemented | Held/latched masks from key events; debounce, direction policies, table swaps; the rebinding's `KeyCapture` (M2-16) |
| `gamepad` | implemented | Gamepad → actions (deadzone, hysteresis, buttons held across a table swap); rumble through `vibrationActuator.playEffect('dual-rumble')` — `rumblePad`, `RUMBLE_EFFECTS` (M3-01) |
| `web-input` | implemented | Merges sources into the `InputSnapshot`; profiles + contexts; player seats — every device drives player 1, or in a co-op game a pad (or the split keyboard's right half) takes player 2's seat with its START (M2-06); the rebinding capture `beginCapture` / `capture` / `endCapture` (M2-16); `WebInput.rumble(player, strength)` — a player's pads by seat (M3-01) |
| `remote` | implemented | Release debounce, diagonal policy, SOCD — tuned from the input-probe results |
| `rebind` | implemented | Input profiles: validation, compiled `game`/`menu` tables, choice; the profiles an Options screen may offer (`selectableKeyProfiles`, `inputProfileChoices` — M1-17); a keyboard profile's optional `split` half for two players on one keyboard (`splitTables`, `keyboard-split` — M2-06); the player's rebinding (M2-16): `customizeInputProfile`, `applyBindingOverride`, `rebindAction`, `resetBindings`, `captureToken`, `actionTokens`, `findBindingConflicts`, `bindingTokenLabel` / `bindingKeysLabel`, `RESERVED_BINDING_TOKENS` |

Profile choice (done by the apps in their platform factory and through the shell's
`inputProfiles`): the web uses `?profile=<id>` › the saved choice › `keyboard-default`, with
`?debounce=<ticks>` as a dev override (`overrideInputTuning`); the TV uses the saved choice ›
`tizen-remote-safe` and registers its `register` keys. Since M1-17 the saved choice is the
Options screen's CONTROLS, stored in the `core/save` document (`options.input.profileId`); the
screen offers only `selectableKeyProfiles(profiles, 'code' | 'keyCode')` — keyboard / remote
profiles whose **menu** table the host's keys can drive (web: `KEYBOARD`, `KEYBOARD AS REMOTE`; TV:
`SAFE 4-WAY`, `FAST 8-WAY`), the default labelled ` (DEFAULT)` by `inputProfileChoices`. The older
`loadInputProfileChoice` / `saveInputProfileChoice` (key `input.profile`) stay exported but are
unused. Validation
beyond the schema: every `game` table binds the directions + Pause, every `menu` table the
directions + Confirm + Back; gamepad profiles bind buttons only with debounce 0; only remote
profiles register keys, never `Exit` / volume; ids unique. A bad profile is dropped, the others
kept, and the issue stops the boot on the error screen.

`poll()`, `setContext()`, the key handlers and `advance()` never allocate (the capture included);
profiles are compiled once at load — and again, customised, on a rebinding or a settings change
(menu actions). Rebinding guide:
[`docs/dev/options-rebinding-and-accessibility.md`](../../docs/dev/options-rebinding-and-accessibility.md#rebinding-shmupinput-web-rebind).

Guide: [`docs/dev/input-profiles.md`](../../docs/dev/input-profiles.md) · exports:
[`docs/dev/api-reference.md`](../../docs/dev/api-reference.md#shmupinput-web) · file format:
[`content/input/README.md`](../../content/input/README.md) · the Options screen's profile choice:
[`docs/dev/saves-and-options.md`](../../docs/dev/saves-and-options.md#input-profile-choices-input-web-the-apps) · player controls:
[`docs/client/controls.md`](../../docs/client/controls.md).

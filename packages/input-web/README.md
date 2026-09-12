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
  Select = Back, Start = Pause. Pad 0 → player 1, pad 1 → player 2.
- `poll()` reuses one snapshot object (no per-tick allocation).

```ts
import { createWebInput, loadInputProfiles } from '@shmup/input-web';

const input = createWebInput({ keyTarget: window, keyDevice: 'remote', getGamepads: () => navigator.getGamepads() });
const { profiles } = loadInputProfiles(inputProfileFiles); // content/input/*.input-profiles.json
input.setProfile(profiles.find((p) => p.id === 'tizen-remote-safe')!);
input.setContext('menu'); // when Game.inputContext changes (the shell does this)
const snapshot = input.poll(); // once per simulation tick (via Platform.input)
```

## Input profiles (decisions D13–D15)

The mapping is data: `content/input/remote.input-profiles.json` ships `tizen-remote-safe`
(TV default: release debounce 2 ticks, diagonals `combine`, registers Play/Pause + Ch±),
`tizen-remote-diagonal` (debounce 0), `keyboard-default` (web default),
`keyboard-remote-emulation` (only the remote's keys, arrows `lastWins`) and
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
| `keyboard` | implemented | Held/latched masks from key events; debounce, direction policies, table swaps |
| `gamepad` | implemented | Gamepad → actions (deadzone, hysteresis, buttons held across a table swap) |
| `web-input` | partial | Merges sources into the `InputSnapshot`; profiles + contexts; player assignment |
| `remote` | implemented | Release debounce, diagonal policy, SOCD — tuned from the input-probe results |
| `rebind` | partial | Input profiles: validation, compiled `game`/`menu` tables, choice; the profiles an Options screen may offer (`selectableKeyProfiles`, `inputProfileChoices` — M1-17) |

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

`poll()`, `setContext()`, the key handlers and `advance()` never allocate; profiles are
compiled once at load.

Guide: [`docs/dev/input-profiles.md`](../../docs/dev/input-profiles.md) · exports:
[`docs/dev/api-reference.md`](../../docs/dev/api-reference.md#shmupinput-web) · file format:
[`content/input/README.md`](../../content/input/README.md) · the Options screen's profile choice:
[`docs/dev/saves-and-options.md`](../../docs/dev/saves-and-options.md#input-profile-choices-input-web-the-apps) · player controls:
[`docs/client/controls.md`](../../docs/client/controls.md).

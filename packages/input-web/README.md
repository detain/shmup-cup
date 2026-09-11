# @shmup/input-web

Browser input adapter: **keyboard + Samsung TV remote + W3C Gamepad API → the core's
per-tick `InputSnapshot`** (action bitmasks). The core never sees key codes
(`shmup_tech.md` §3.2, §4.4; `shmup_feat.md` §4).

- **Keys** are resolved by `KeyboardEvent.code` (layout independent), falling back to the
  legacy `keyCode` for TV-remote keys that have no `code` (Back 10009, Play/Pause 10252,
  Ch± 427/428). Held state comes from keydown/keyup only (auto-repeat ignored), taps
  shorter than a tick are latched, bound keys get `preventDefault()`, `blur` clears all.
- **Gamepads** (standard mapping): D-pad 12–15 + left stick (radial deadzone 0.2, 8-way
  with hysteresis); A = Shot/Confirm, B = Sub/Back, X = PowerUp, Y = Special, LB/RB = Speed,
  Select = Back, Start = Pause. Pad 0 → player 1, pad 1 → player 2.
- `poll()` reuses one snapshot object (no per-tick allocation).

```ts
import { createWebInput } from '@shmup/input-web';

const input = createWebInput({ keyTarget: window, keyDevice: 'remote', getGamepads: () => navigator.getGamepads() });
const snapshot = input.poll(); // once per simulation tick (via Platform.input)
```

## Default key bindings

| Action | Keyboard | Samsung remote | Gamepad |
|---|---|---|---|
| Move | Arrows / WASD | D-pad (37–40) | D-pad / left stick |
| Shot (+Confirm) | Z / Space | — (autofire in remote mode) | A |
| Sub (+Back) | X | — (autofire) | B |
| PowerUp (+Confirm) | C, Enter | OK (13) | X |
| Special | V | Ch+ (427) | Y |
| Speed | Left Shift | Ch− (428) | LB / RB |
| Pause | P, Esc | Play/Pause (10252) | Start |
| Back | Backspace, Esc, X | Back (10009) | B, Select |

## Modules

| Module | Status | Responsibility |
|---|---|---|
| `keymap` | implemented | Default bindings, Tizen key codes, `code`/`keyCode` resolution |
| `keyboard` | implemented | Held/latched masks from key events |
| `gamepad` | implemented | Gamepad → actions (deadzone, hysteresis) |
| `web-input` | partial | Merges sources into the `InputSnapshot`; player assignment |
| `rebind` | placeholder | Per-device rebinding + persistence |
| `remote` | placeholder | Remote quirks (release debounce, 4-way policy) — tuned from tools/input-probe results |

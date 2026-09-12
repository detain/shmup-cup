# content/input/ — input profiles

How keys, remote buttons and gamepad buttons turn into game actions, as data (decision
**D13**): the Samsung remote's quirks are still being measured by the input probe
(`tools/input-probe`, `input_probe_spec.md`), so its results must change *this file*, not
code. Validated and compiled by `@shmup/input-web` (`rebind` module, kind `input-profiles`);
the shell's content owner reports every problem on the boot error screen, and
`pnpm content:check` checks the shipped file and the example.

`remote.input-profiles.json` ships five profiles:

| Profile | Used | Notes |
|---|---|---|
| `tizen-remote-safe` | default on the TV | debounce 2 ticks, diagonals `combine`, registers Play/Pause and Ch± (decision **D14**) |
| `tizen-remote-diagonal` | after a positive probe result | same bindings, debounce 0 |
| `keyboard-default` | default on the web | arrows / WASD, Z Shot, X Sub, C / Enter PowerUp, V Special, Shift Speed, P / Esc Pause |
| `keyboard-remote-emulation` | `?profile=keyboard-remote-emulation` | only the remote's keys: arrows (`lastWins`), Enter = OK, Backspace = Back, P = Play/Pause, PgUp/PgDn = Ch± |
| `gamepad-standard` | every gamepad | standard mapping: A Shot, B Sub, X PowerUp, Y Special, LB/RB Speed, Start/Select Pause |

Each profile has separate **`game`** and **`menu`** tables (decision **D15**): keyboard X is
Sub in the game but Back in menus, remote OK is PowerUp in the game but Confirm in menus. The
top scene picks the context; a key held while the context switches keeps only the actions it
has in both tables until it is released.

## Format (formatVersion 1)

```jsonc
{
  "formatVersion": 1,
  "kind": "input-profiles",
  "profiles": [
    {
      "id": "tizen-remote-safe",   // lower-case kebab, unique across all files (?profile=<id>)
      "label": "SAFE 4-WAY",       // shown in the Options screen
      "device": "remote",          // "keyboard" | "remote" (key events) | "gamepad" (polled)
      "context": {
        "game": {
          "byCode": {},            // KeyboardEvent.code → actions, checked first
          "byKeyCode": {           // legacy keyCode → actions (TV remote keys have no code)
            "13": ["PowerUp"],     // OK
            "37": ["Left"],
            "38": ["Up"],
            "39": ["Right"],
            "40": ["Down"],
            "10009": ["Pause"],    // Back
            "10252": ["Pause"]     // Play/Pause (needs registering)
          }
        },
        "menu": {
          "byCode": {},
          "byKeyCode": {
            "13": ["Confirm"],
            "37": ["Left"],
            "38": ["Up"],
            "39": ["Right"],
            "40": ["Down"],
            "10009": ["Back"],
            "10252": ["Pause"]
          }
        }
      },
      "releaseDebounceTicks": 2,   // 0–10 polls a released key still counts as held
      "diagonals": "combine",      // "combine" | "lastWins" | "firstWins"
      "socd": "neutral",           // Left+Right / Up+Down: "neutral" | "lastWins"
      "register": ["MediaPlayPause"] // Tizen key names to register (remote profiles only)
    }
  ]
}
```

A gamepad profile binds buttons instead — standard-mapping indices `"0"` … `"31"` —
and leaves `byCode` / `byKeyCode` empty:

```jsonc
{
  "formatVersion": 1,
  "kind": "input-profiles",
  "profiles": [
    {
      "id": "gamepad-standard",
      "label": "GAMEPAD",
      "device": "gamepad",
      "context": {
        "game": {
          "byCode": {},
          "byKeyCode": {},
          "buttons": { "0": ["Shot"], "9": ["Pause"], "12": ["Up"], "13": ["Down"], "14": ["Left"], "15": ["Right"] }
        },
        "menu": {
          "byCode": {},
          "byKeyCode": {},
          "buttons": { "0": ["Confirm"], "1": ["Back"], "12": ["Up"], "13": ["Down"], "14": ["Left"], "15": ["Right"] }
        }
      },
      "releaseDebounceTicks": 0,   // gamepads are polled: must be 0
      "diagonals": "combine",
      "socd": "neutral",
      "register": []
    }
  ]
}
```

Actions: `Up`, `Down`, `Left`, `Right`, `Shot`, `Sub`, `PowerUp`, `Special`, `Speed`, `Pause`,
`Confirm`, `Back` (the core's `ACTION_NAMES`).

## Rules the loader checks

- Every `game` table binds `Up`, `Down`, `Left`, `Right` and `Pause`; every `menu` table binds
  the directions, `Confirm` and `Back` — menus must be fully D-pad + OK + Back navigable
  (`shmup_feat.md` §4 rule 8).
- Gamepad profiles bind `buttons` only and use `releaseDebounceTicks: 0`; key profiles never
  bind `buttons`.
- Only `remote` profiles list `register` keys, and never the system keys `Exit`, `VolumeUp`,
  `VolumeDown`, `VolumeMute`.
- Unknown fields, unknown actions, bad key names and duplicate profile ids are errors.

## Tuning after the input probe (plan §8.2)

- **Diagonals** verdict *YES* and no fake key-up pairs → make `tizen-remote-diagonal` the
  default (or set `releaseDebounceTicks: 0` in `tizen-remote-safe`).
- **Fake key-up/key-down pairs** measured with gap *g* ms → `releaseDebounceTicks` ≥
  ⌈*g* / 16.7⌉.
- **Second arrow replaces the first** → `"diagonals": "lastWins"`.
- A registrable key that never arrives → drop it from `register`.

See [`example.input-profiles.json`](example.input-profiles.json).

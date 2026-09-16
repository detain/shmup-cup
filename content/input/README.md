# content/input/ — input profiles

How keys, remote buttons and gamepad buttons turn into game actions, as data (decision
**D13**): the Samsung remote's quirks were measured by the input probe on both Smart Monitor M7s
on 2026-09-15 (`tools/input-probe`, [`docs/dev/input-probe-results.md`](../../docs/dev/input-probe-results.md)),
and its results changed *this file*, not code. Validated and compiled by `@shmup/input-web`
(`rebind` module, kind `input-profiles`); the shell's content owner reports every problem on the
boot error screen, and `pnpm content:check` checks the shipped file and the example.

`remote.input-profiles.json` ships five profiles:

| Profile | Used | Notes |
|---|---|---|
| `tizen-remote-safe` | default on the TV (the only remote profile) | no debounce, `singleKey`, registers Play/Pause, Ch±, Guide and Extra |
| `keyboard-default` | default on the web | arrows / WASD, Z Shot, X Sub, C / Enter PowerUp, V Special, Shift Speed, P / Esc Pause |
| `keyboard-remote-emulation` | `?profile=keyboard-remote-emulation` | only the remote's keys, with its `singleKey` model: arrows, Enter = OK, Backspace = Back, P = Play/Pause, PgUp/PgDn = Ch± |
| `keyboard-split` | Options → CONTROLS (web), `?profile=keyboard-split` | two players on one keyboard (M2-06): player 1 WASD, F = OK / PowerUp, G = Back / Special + Speed, Esc / Q = Pause; player 2 (`split`) arrows, K = OK / PowerUp, L = Back / Special + Speed, Enter = START (join) |
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
      "label": "REMOTE",           // shown in the Options screen
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
      "releaseDebounceTicks": 0,   // 0–10 polls a released key still counts as held
      "diagonals": "combine",      // "combine" | "lastWins" | "firstWins"
      "socd": "neutral",           // Left+Right / Up+Down: "neutral" | "lastWins"
      "singleKey": true,           // optional: while a key is down, other keydowns are dropped
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
- Gamepad profiles bind `buttons` only, use `releaseDebounceTicks: 0` and never set `singleKey`
  (pads are polled and report every button at once); key profiles never bind `buttons`.
- Only `remote` profiles list `register` keys, and never the system keys `Exit`, `VolumeUp`,
  `VolumeDown`, `VolumeMute`.
- Unknown fields, unknown actions, bad key names and duplicate profile ids are errors.

## Tuning after the input probe (plan §8.2)

The probe **was** run, on both Smart Monitor M7s, on 2026-09-15
([`docs/dev/input-probe-results.md`](../../docs/dev/input-probe-results.md)); what it measured is
already in this file (plan step M3-02b):

| Measured | Applied here |
|---|---|
| A second key is never delivered while one is held (0 of the attempts, `max keys down at once` = 1) | `"singleKey": true` on `tizen-remote-safe` and `keyboard-remote-emulation`; `tizen-remote-diagonal` retired |
| No fake key-up/key-down pairs, no bounces; repeats are plain `keydown`s of a held key | `"releaseDebounceTicks": 0` everywhere |
| Ch rocker pressed = `Guide` (458), screen button = `Extra` (10253), both registrable | added to `register` (no default binding — REBIND can capture them) |
| The volume keys are registrable, but registering takes volume control away | still never registered (`SYSTEM_REMOTE_KEYS`) |
| Back (10009), Play/Pause (10252) and Mute (449) arrive only on release | bindings unchanged — the latch turns a same-frame down/up into one press; nothing asks for a *held* Back or Pause any more |

For a different set (or a firmware change), re-run the probe and apply the same recipe:

- **Fake key-up/key-down pairs** measured with gap *g* ms → `releaseDebounceTicks` ≥
  ⌈*g* / 16.7⌉.
- **A second key really arrives** → drop `singleKey`; if the second arrow replaces the first,
  `"diagonals": "lastWins"`.
- A registrable key that never arrives → drop it from `register`.

See [`example.input-profiles.json`](example.input-profiles.json).

## Split keyboard (M2-06)

A `keyboard` profile may add a `split` section — player 2's half of the keyboard, with its own
`game` and `menu` tables in the same format as `context` (which is then player 1's half). No key
may be bound in both halves of a context, and each half must bind the required actions (the four
directions and Pause in the game; the directions, Confirm and Back in menus). In a co-op game the
right half drives player 2 and its Pause key (Enter in `keyboard-split`) is player 2's `START`
(join); in menus and one-player games both halves drive player 1.

```jsonc
{
  "formatVersion": 1,
  "kind": "input-profiles",
  "profiles": [
    {
      "id": "keyboard-split",
      "label": "SPLIT KEYBOARD",
      "device": "keyboard",       // split halves: keyboard profiles only
      "context": {                // player 1's half
        "game": {
          "byCode": {
            "KeyW": ["Up"], "KeyS": ["Down"], "KeyA": ["Left"], "KeyD": ["Right"],
            "KeyF": ["PowerUp"], "KeyG": ["Special", "Speed"], "Escape": ["Pause"]
          },
          "byKeyCode": {}
        },
        "menu": {
          "byCode": {
            "KeyW": ["Up"], "KeyS": ["Down"], "KeyA": ["Left"], "KeyD": ["Right"],
            "KeyF": ["Confirm"], "KeyG": ["Back"], "Escape": ["Back"]
          },
          "byKeyCode": {}
        }
      },
      "split": {                  // player 2's half (no key of player 1's half)
        "game": {
          "byCode": {
            "ArrowUp": ["Up"], "ArrowDown": ["Down"], "ArrowLeft": ["Left"], "ArrowRight": ["Right"],
            "KeyK": ["PowerUp"], "KeyL": ["Special", "Speed"], "Enter": ["Pause"]
          },
          "byKeyCode": {}
        },
        "menu": {
          "byCode": {
            "ArrowUp": ["Up"], "ArrowDown": ["Down"], "ArrowLeft": ["Left"], "ArrowRight": ["Right"],
            "KeyK": ["Confirm"], "KeyL": ["Back"], "Enter": ["Confirm"]
          },
          "byKeyCode": {}
        }
      },
      "releaseDebounceTicks": 0,
      "diagonals": "combine",
      "socd": "neutral",
      "register": []
    }
  ]
}
```

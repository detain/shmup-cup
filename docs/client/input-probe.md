# Input Probe — tester guide

The **Input Probe** (app name on the monitor: **InputProbe**) is a diagnostic app, not the game. It shows how the
Samsung Smart Monitor M7 and its Smart Remote (plus any gamepads) behave: what the remote sends when you hold a
button, whether two arrows can be held at once, how much delay there is, how smooth the display is. The numbers
you collect decide how Shmup Cup's controls work on the remote.

A full test run takes about 10 minutes per monitor.

- Setting up a monitor and installing the app: [install-on-tv.md](install-on-tv.md)
- Building and packaging it (developers): [../dev/input-probe.md](../dev/input-probe.md) and
  [`tools/input-probe/README.md`](../../tools/input-probe/README.md)

## What it answers

| # | Question | Where you see the answer |
|---|---|---|
| 1 | Can two arrows be held at once (diagonals)? | Verdicts → **Diagonals** |
| 2 | Does an arrow stay held when OK is pressed? | Verdicts → **OK+arrow** |
| 3 | What does the remote send while a button is held, and how fast does it repeat? | Verdicts → **Repeat style / Repeat timing / Bounces** |
| 4 | Which extra buttons (Ch±, Play/Pause, Vol±, colour keys…) reach the app? | **Registered keys** and **Seen keys** |
| 5 | How long from pressing a button to the event, and to light on the screen? | Verdicts → **Dispatch**, plus the **flash box** filmed with a phone |
| 6 | How do gamepads show up (id, button numbers, two at once)? | **Gamepads** |
| 7 | What browser engine, resolution, GPU and audio does the monitor have? | **Environment** (and the header) |
| 8 | Does the screen update at a steady 60 Hz? | Verdicts → **Frames**, and the frame-time graph |
| 9 | What happens when you press Home and come back? | Event log + checklist |

## Starting and leaving the app

- **Start:** `npm run deploy` starts it automatically. Afterwards it is in the monitor's **Apps** panel as
  **InputProbe** like any other app.
- **Leave:** press **Back three times within 1.5 seconds**. A single Back does *not* exit (it is being measured).
  Long-pressing **Back** or pressing **Home** leaves through the monitor's own menus as usual.

## The screen

Everything is on one screen; nothing needs to be navigated.

| Area | What it shows |
|---|---|
| **Header** (top) | Title; a one-line summary (browser version, Tizen version, resolution, WebGL 2, model) and the **session id**; the report status (`report: off` unless the build logs to a PC); a reminder of the controls |
| **Event log** (left, top) | The last 28 events, newest at the bottom: `time DOWN/UP name(code) repeat=0/1 kind Δms`. `kind` is `press`, `rep` (repeat), `noflag` (repeat without the repeat flag) or `BOUNCE` (the remote released and re-pressed the key by itself). Lines with `·` are information (focus, visibility, gamepads, checklist ticks) |
| **Environment** (left, bottom) | User agent, Chrome / Tizen versions, model and firmware, window size, WebGL 1 / 2 and GPU, feature support, audio sample rate and latency |
| **Arena** (centre) | Three ships in lanes **A**, **B**, **C**, movement timelines, the frame-time graph and the white **LATENCY FLASH** box — see below |
| **Test protocol** (centre, bottom) | The nine steps listed in [Test protocol](#test-protocol) |
| **Verdicts & stats** (right, top) | The answers, updated ten times a second |
| **Checklist** (right) | Ticks itself (`[x]`) as you complete the protocol |
| **Seen keys** | Every key that arrived, with `downs/ups/repeats` counts |
| **Registered keys** | Which remote keys the app asked for and whether the monitor allowed it (`ok:` list, `FAIL` lines) |
| **Gamepads** | Each pad: number, mapping, id, currently pressed buttons, stick values |

### The three ships

All three ships follow the same arrow keys, but each uses a different way of deciding "is the button held?":

| Lane | Rule | What it tells you |
|---|---|---|
| **A · raw** (cyan) | Held from the moment the button goes down until it comes up | If A **stutters** (gaps in its timeline bar) while you hold an arrow, the remote briefly "releases" the button on its own |
| **B · debounced** (green) | Like A, but ignores releases shorter than 50 ms | If B is smooth where A stutters, a small release delay fixes the problem in the game |
| **C · naive** (orange) | Jumps a fixed step for every key event, repeats included | Shows what menu-style handling feels like: one step, a pause, then steps at the repeat rate |

Holding two arrows moves the ships diagonally — if that works, diagonals work.

Below the lanes, each ship has a **timeline** of the last 240 frames (4 seconds): a solid bar means smooth
movement, gaps mean stutter. The **frame-time graph** plots how long each frame took; the flat line should sit on
the **16.7** guide (60 Hz). Red ticks at the bottom mark frames slower than 20 ms (hitches).

## Controls

| Input | Effect |
|---|---|
| Arrows, OK | Measured (drive the ships, verdicts) |
| Back | Measured; **three presses within 1.5 s exit** the app |
| Play/Pause | **Resets** the repeat, hold and frame statistics (the diagonal / OK verdicts, key counts and checklist stay) |
| Every other remote button | Logged; counts as "pressed an extra key" |
| Volume ± / Mute | Logged — **they do not change the volume while the probe runs** (use the monitor's menu, or exit the probe) |
| Colour / number keys | The Smart Remote has no physical number or colour keys: open the on-screen **Color/Number** pad (or use the SmartThings virtual remote) |
| Gamepad | Press any button once to make the pad appear, then every button / stick movement is logged (`GP0 b3 down`, `GP0 a1 -1`) |
| Keyboard (desktop browser only) | Arrows, Enter, and **R** to reset the statistics |

## Test protocol

Do the steps in order on each monitor. The checklist ticks the matching item as you go.

1. **Tap each arrow, OK and Back once.**
   Ticks *Tapped all 4 arrows* and *Tapped OK & Back*. Check the Seen keys table: each should show `1/1/0`.
2. **Hold → for 3 seconds, release. Repeat with ↑.**
   Ticks *Held a key ≥ 1.5 s*. Watch lanes A and B while holding: does A stutter? Read **Repeat style** and
   **Repeat timing** afterwards.
3. **Hold →, then also press ↑** (keep both down about a second).
   Ticks *Tried a diagonal*. **Diagonals** should now say `YES` or `NO`; the ships should have moved diagonally if
   it is `YES`.
4. **Hold →, then tap OK** (keep holding → for a second after the tap).
   Ticks *Pressed OK while holding an arrow*. Read **OK+arrow**.
5. **Press every other remote button:** Play/Pause, Ch+, Ch−, Vol+, Vol−, and a few keys on the on-screen
   Color/Number pad.
   Ticks *Pressed an extra key*. Buttons that never show up in the event log are not available to apps.
   (Play/Pause resets the statistics — that is expected; steps 2–4 can be repeated afterwards.)
6. **Latency:** film the flash box with a phone in **240 fps slow motion** while tapping OK about 10 times, so both
   your thumb and the box are in the picture. See [Measuring latency](#measuring-latency).
7. **Gamepads:** pair a gamepad, press a button to activate it, press buttons and move the sticks. Then pair a
   second one and do the same. Ticks *Gamepad seen*.
8. **Press Home, then return to InputProbe** (from the Apps panel or the recent-apps bar).
   Ticks *Left (Home) and returned*.
9. **Record the results:** photograph the whole screen (the Verdicts panel must be readable), or collect the log
   file from the PC if the build reports to a log server (see [Recording results](#recording-results)).

## Reading the verdicts

| Line | Possible values | Meaning for the game |
|---|---|---|
| **Diagonals** | `YES` · `NO` · `not tested` | `YES`: 8-way movement on the remote. `NO`: pressing a second arrow cancels the first — the remote is 4-way only. Counts in brackets: how often two arrows were held together / one replaced the other |
| **OK+arrow** | `arrow kept` · `arrow kept (release blip)` · `arrow dropped` · `not tested` | `kept`: OK can be pressed while moving. `release blip`: the arrow flickers off for a moment but comes back (needs debouncing). `dropped`: pressing OK stops the arrow — OK cannot be a mid-movement action |
| **Repeat style** | `clean (repeat flag)` · `keydown without repeat flag` · `fake keyup/keydown pairs` · `not observed` | How the remote reports a held button. *Fake pairs* = the remote keeps releasing and re-pressing — the game must ignore short releases (lane B) |
| **Repeat timing** | `delay … ms · every … ms ⇒ … Hz` | Time until auto-repeat starts, and the repeat rate |
| **Bounces <60ms** | count, shortest and average gap | How many of those fake release/press pairs happened and how short they are |
| **Max held** | `N keys · longest … ms (key)` | Most buttons down at the same time; the longest single hold |
| **Dispatch** | `avg … ms · max … ms` | Delay between the key event being created and the app handling it |
| **Frames** | `16.67 ms ⇒ 60.0 Hz · p95 … · max … · hitches>20ms …` | Frame rate and smoothness. Pauses (when the app was hidden) are counted separately and not included |

Play/Pause resets **Repeat style / timing, Bounces, Max held, Dispatch** and the frame counters (hitches, worst,
pauses, frames). The frame median / p95 / max always cover the last 10 seconds and simply roll over. Diagonals,
OK+arrow, the Seen keys counts and the checklist are never reset.

## Measuring latency

The flash box turns **white for 4 frames** every time a key goes down (it shows the key's name). Key-repeat events
flagged as repeats do not flash, but if the remote uses *fake pairs* or *keydown without repeat flag*, holding a
button makes it flash repeatedly — for this test, **tap** OK.

In the slow-motion video, for each tap count the frames from the moment your thumb bottoms out on OK to the first
frame where the box is white:

```text
latency (ms) = frames ÷ 240 × 1000   (1 frame at 240 fps ≈ 4.2 ms)
```

Average the ~10 taps. This is the full thumb-to-light delay (remote radio + monitor processing + app + display),
which matters because the monitor has no Game Mode for apps.

## Recording results

- **Photo:** one sharp photo of the whole screen per monitor after step 8. Make sure the session id in the header
  is readable so photos can be matched to logs.
- **Log file (optional):** if the app was built with a log-server address, the header shows
  `report → http://…/report · #N ok`. Every 3 seconds the probe sends everything to the PC, which writes
  `tools/input-probe/logs/<session>.jsonl` (one line per report). Hand that file to the developers. How to set it
  up: [../dev/input-probe.md#remote-logging](../dev/input-probe.md#remote-logging).

Results are summarised in `shmup_tech.md` §2.7 and drive the remote control scheme in `shmup_feat.md` §4.

## Troubleshooting

| Symptom | What to do |
|---|---|
| InputProbe is not in the Apps panel | It was not installed on this monitor — see [install-on-tv.md](install-on-tv.md) |
| The app starts but stays black / shows no text | Exit (Back ×3 or Home) and start it again; if it persists, the build is broken — report it with a photo |
| The header still says `collecting environment…` | It fills in about a quarter of a second after start; if it never does, note it (the environment probe failed) |
| A button does nothing and never appears in the event log | That button is not delivered to apps on this monitor — that is a result, note it. Check the **Registered keys** panel for a `FAIL` line |
| Volume cannot be changed | Expected while the probe runs (it captures the volume keys). Exit the probe or use the monitor's settings menu |
| Can't get out of the app | Press Back three times **quickly** (within 1.5 s), or press Home |
| Gamepad not listed | Press any button on it once — pads only appear after their first button press. Check it is paired in the monitor's Bluetooth settings |
| *Left (Home) and returned* never ticks | The app must actually be hidden and then shown again: press Home, then reopen InputProbe from the Apps panel |
| Numbers look wrong after experimenting | Press Play/Pause to reset the repeat / hold / frame statistics and repeat the step |
| Header shows `report: … error: network error` or `timeout` | The PC's log server is not reachable: it is not running, the address baked into the build is wrong, or the Windows firewall blocks Node (allow it on private networks). Events are kept and re-sent once it works |
| Header shows `report: off (build with VITE_REPORT_URL)` | This build does not log to a PC — use photos instead |
| Ship A stutters, B is smooth | Not a problem with the probe — that is exactly the remote behaviour it is designed to reveal. Write it down |

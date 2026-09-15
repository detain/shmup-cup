# Input probe results — Samsung Smart Monitor M7 (2026-09-15)

What the [input probe](input-probe.md) measured on both test monitors, what it means for the game, and where each
finding is applied. The game changes are plan step **M3-02b** in [`shmup_plan.md`](../../shmup_plan.md#m3-02b--remote--hardware-tuning-from-the-input-probe-results);
the hardware facts are summarised in [`shmup_tech.md`](../../shmup_tech.md) §2.7.

- **Raw data:** [`tools/input-probe/results/2026-09-15-m7/`](../../tools/input-probe/results/2026-09-15-m7/)
  (the log server's JSONL, one file per monitor, plus the analyzer's reports).
- **Analyzer:** `node results/analyze.mjs <session.jsonl> [--timeline]` from `tools/input-probe/`
  ([`analyze.mjs`](../../tools/input-probe/results/analyze.mjs)). Every number below comes from its output.

## Setup

| | Monitor A | Monitor B |
|---|---|---|
| IP / probe session | 10.0.0.8 / `ip-mu37lye3-yj1x` | 10.0.0.224 / `ip-mu37m64b-aqnb` |
| Model / firmware | M70AET (`20_KANTSU2_43UHD_MNT`) / `M-KSU2SMWWC-2750.0` | same |
| Covered | protocol steps 1–5, 14 quick OK taps (flash box) | steps 1–5, 7 (one DualShock 4), 8 (Home, PS button) |
| Reports / events | 163 / 308, none dropped | 155 / 421, none dropped |

The probe was built with `VITE_REPORT_URL=http://10.0.0.2:8787`, signed with the `Shmup` profile and deployed with
`npm run deploy` to both monitors (`tools/input-probe/README.md`); the desktop ran `npm run log-server`. Tester:
the owner, with the Samsung Smart Remote that came with each monitor.

## Read this first: the probe's own timing verdicts are wrong

On Tizen 5.5, `KeyboardEvent.timeStamp` is on the `performance.now()` clock but **only advances in whole seconds**:
consecutive key events differ by exactly 0, 1000, 4000 … ms, and handler time minus `timeStamp` ranges from 50 to
1,302 ms (median 722 ms). The probe's `chooseEventTime()` accepts such values as plausible, so every timing it
derived from them — hold lengths (`held=0` / `1000` / `2000`), repeat delay and interval, bounce / diagonal / chord
windows and the "dispatch delay" of ≈ 520 ms — is quantisation noise. The on-screen verdicts said *repeat: not
observed* and *diagonals / OK+arrow: not tested* for the same reason.

Each logged key event also carries `delay = performance.now() − timeStamp` taken in the handler, so `t + delay` is
the exact handler time. The analyzer re-derives everything on that clock. **Consequences:** never use
`event.timeStamp` for timing on Tizen (the game does not); the probe itself is fixed in M3-02b.

## Findings

### 1. The remote delivers one key at a time — no diagonals, no chords

- While an arrow is held, **a second key is never delivered**: neither a second arrow nor OK produced a `keydown`
  (0 of the attempts on both monitors — the tester pressed ↑ and OK during → holds of 4–11 s), and the held arrow's
  repeat stream never broke (no gap > 200 ms inside any hold). Nothing arrives on release either.
- `max keys down at once` = 1 on both monitors.
- **Meaning:** diagonals are impossible on the remote, and so is *moving while pressing OK / Ch± / Play/Pause*: the
  player must let go of the arrow first. The game's 4-way design is right; the power-up press costs the player a
  stop. Whether Back and Ch± are also swallowed during a hold was not tried separately (assume yes — the remote is
  single-key).

### 2. Held keys repeat as `keydown` **without** the repeat flag; no fake pairs

| Measure (handler clock) | Monitor A | Monitor B |
|---|---|---|
| Repeat events | 225, all `repeat=false` | 113, all `repeat=false` |
| First repeat after the press | median 356 ms (324–384) | median 358 ms (327–361) |
| Repeat interval | median 110 ms, mean 108 (p10 83 · p90 130 · 42–158) | median 108 ms, mean 108 (p10 86 · p90 128 · 58–157) |
| `keyup` after the last repeat | median 54 ms (0–102) | median 54 ms (24–81) |
| Bounces (keyup → keydown < 60 ms) | 0 | 0 |

- **≈ 9.3 Hz** repeats (every ~6.5 ticks) after **≈ 21 ticks**, jittery by ± 40 ms. A repeat is just another
  `keydown` of a key that is already down — code that ignores `event.repeat === true` does not filter them.
- **No fake keyup/keydown pairs and no bounces** ⇒ the release debounce is not needed (plan §8.2 table:
  "clean / keydown-without-flag → `releaseDebounceTicks = 0`").
- `@shmup/input-web` already turns a keydown of a held key into "still held, no new edge", so gameplay is safe;
  code that checks `!event.repeat` itself (the shell's debug-unlock sequence and number keys) is not.

### 3. Taps

- Tap length (press → release) on arrows, OK, Ch±, Vol±, Guide, Extra: **median 165 ms (A) / 195 ms (B)**,
  122–259 ms — 7 to 16 ticks.
- 14 quick OK taps: press-to-press **median 276 ms** (198–356) ⇒ about 3.6 presses per second at most.

### 4. Back, Play/Pause and Mute are sent only on release

`Back` (10009), `MediaPlayPause` (10252) and `VolumeMute` (449) arrive as `keydown` + `keyup` **< 15 ms apart
(usually < 1.5 ms), at the moment the button is released** — every press on both monitors. They cannot be held,
and the game sees them one tap-length late (≈ 150–250 ms after the thumb goes down). Everything else has a real
down/up.

`@shmup/input-web` latches a press that is released within the same frame, so Back / Play/Pause still pause the
game. What breaks: anything that asks the player to **hold** Back or Pause — the INPUT TEST's exit ("hold Pause
60 ticks") cannot be done with the remote.

### 5. Key codes on this remote

| Button | Key | Code | Notes |
|---|---|---|---|
| D-pad | ArrowLeft / Up / Right / Down | 37 / 38 / 39 / 40 | real down/up, flagless repeats |
| Select (OK) | Enter | 13 | real down/up |
| Return | Back | 10009 | release-only; arrives without registration |
| Play/Pause | MediaPlayPause | 10252 | release-only; needs `registerKey` |
| Ch rocker up / down | ChannelUp / ChannelDown | 427 / 428 | real down/up; needs `registerKey` |
| **Ch rocker pressed in** | Guide | 458 | real down/up; needs `registerKey` |
| Vol rocker up / down | VolumeUp / VolumeDown | 447 / 448 | real down/up once registered — registering takes volume control away |
| **Vol rocker pressed in** | VolumeMute | 449 | release-only |
| **Screen button (top right)** | Extra | 10253 | real down/up; needs `registerKey` |
| Home | — | — | never delivered; opens the system overlay (see 7) |

`tizen.tvinputdevice.getSupportedKeys()` lists 46 keys; `registerKey` succeeded for all 45 tried (everything except
`Exit`) — **the volume keys are registrable** (not system-reserved as `shmup_tech.md` §2.3 guessed). The game
correctly never registers them. No number or colour keys were seen (the Color/Number pad was not used in games).

### 6. Gamepad — DualShock 4 over Bluetooth

`"Wireless Controller" (STANDARD GAMEPAD Vendor: 0x054c Product: 0x09cc)`, `mapping="standard"`, 17 buttons,
4 axes. Every button 0–16 and every axis direction was seen; D-pad diagonals work (6 presses of a second D-pad
direction while one was held). **Button 16 (PS)** is delivered to the page *and* opens the system overlay (a window
`blur` followed ~1 s later). A second pad was not tried.

### 7. Home and the PS button do not hide the app

On monitor B, Home and the PS button each produced **`blur` … `focus` but no `visibilitychange`**: the system shows
an overlay, the app stays visible and **keeps running** (rAF continued, `pauses: 0`). The game only pauses and
suspends audio on `visibilitychange`, so today it would keep playing — autofire on, no input, music running —
under the Home bar. (Home was not tried on monitor A.)

### 8. Frame timing (`requestAnimationFrame`)

| | Monitor A | Monitor B |
|---|---|---|
| Median delta | 16.5 ms (60.5 Hz) | 16.4 ms (61.1 Hz) |
| p95 / max (last 600) | 30.1 / 55.9 ms | 29.1 / 45.2 ms |
| Deltas > 20 ms | 26.9 % of 23,047 frames | 31.8 % of 11,356 frames |
| Worst | 68 ms | 182 ms (under the Home overlay) |
| Delivered frame rate | **59.05 fps** over 388 s | 59.3 fps over the last 117 s (56.1 including the overlay periods) |

The display runs at 60 Hz, but the rAF callbacks jitter strongly: about a quarter of the deltas are over 20 ms
while the average stays near 59 fps, so most long deltas are paired with short ones (timing jitter) and only ~1.5 %
are real drops. The game's fixed-step loop snaps a delta only when it is within ±1 ms of a whole step and otherwise
carries the remainder, so this jitter produces **0-tick and 2-tick frames** — a repeated then a skipped frame, i.e.
visible judder — although plan decision D32 intends "one tick per rAF at 60 Hz". Caveat: the probe page is
DOM-heavy (10 Hz panel updates); the game's own debug overlay must confirm the picture (added in M3-02b).

### 9. Environment

| | Value | Was |
|---|---|---|
| User agent | `Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) … 69.0.3497.106/5.5 TV Safari/537.36` | Chromium 69 inferred — **confirmed** |
| Viewport | 1920×1080, DPR 1 (screen 1920×1080) | likely — **confirmed** (384×216 × 5) |
| GPU / WebGL | **Mali-G51**; WebGL 1 **and WebGL 2** (OpenGL ES 3.0), `MAX_TEXTURE_SIZE` 8192 | WebGL2 "unconfirmed" |
| SoC | model code `20_KANTSU2_43UHD_MNT` ⇒ **Kant-SU2** confirmed; 4 cores | inferred |
| APIs | WebAssembly, **AudioWorklet**, OffscreenCanvas, Gamepad API: yes; native `globalThis`: no | — |
| Audio | 44,100 Hz, `baseLatency` 0.05 s | — |

### 10. Not measured

- **Input-to-photon latency.** Only a 30 fps phone video exists (± 33 ms per frame — too coarse; not counted).
  Still needs a 240 fps video (plan §8.4 / §8.5).
- A second gamepad, Home on monitor A, and Back / Ch± pressed during an arrow hold.

## What changes (plan step M3-02b)

| Finding | Change |
|---|---|
| 1 One key at a time | Playtest bot learns the remote's rules (never a direction on a tick it presses OK / Ch± / Pause, the keyup lag, tap lengths); every zone and the boss rush re-verified and re-tuned under it; `keyboard-remote-emulation` gets a single-key model; docs stop promising "OK never stops a direction" |
| 2 Flagless repeats, no fake pairs | `tizen-remote-safe` `releaseDebounceTicks` 2 → 0; the FAST 8-WAY TV profile (same bindings, only debounce 0) retired with a save migration; the shell's debug keys track held keys instead of `event.repeat` |
| 4 Release-only Back / Play/Pause | INPUT TEST exits with Back / Pause pressed three times instead of held |
| 5 Key codes | Guide 458 and Extra 10253 registrable and bindable in REBIND (no default binding); volume keys stay unregistered |
| 7 Home = blur only | The Tizen (and web) lifecycle treats `blur` / `focus` like hidden / visible: pause menu + audio suspend under the overlay |
| 8 rAF jitter | Vsync-locked tick policy on ~60 Hz displays (one tick per frame unless a frame was really dropped); tick-per-frame counters in the debug overlay |
| Probe clock bug | Probe uses handler time only; reports a raw rAF-delta histogram |

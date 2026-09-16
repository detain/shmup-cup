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

## 11. Render profile (M3-02c)

Where the M7's frame time goes. **Not yet measured on the hardware** — this section is the place
for the numbers, and the recipe that produces them is
[rendering-and-shell.md § Measuring on the TV](rendering-and-shell.md#measuring-on-the-tv)
(the review's §4 table M1–M8). Run it from a `pnpm --filter @shmup/tizen build:dev` bundle with the
tools unlocked (**Pause, Ch+, Ch+, Ch+**).

**Fill the two tables below by pasting, not by typing.** Since **M3-02f** the game streams its own
render profile to the input probe's log server (`npm run log-server`, the bundle built with
`VITE_REPORT_URL=http://<desktop-ip>:8787`), an on-screen checklist walks M1–M8, and

```sh
cd tools/input-probe
node results/analyze-render.mjs logs/rp-<session>.jsonl
```

prints §11.1 and §11.2 as Markdown, one run per monitor. The windows carry **distributions**
(min / median / p95 / max, plus the `TPF` and `RAF` bucket counts), so a p95 — the figure the review
actually needs — is recorded rather than glanced at; windows the report POST itself was in flight
during are excluded from the tables (`--all` keeps them). Copy the raw JSONL into
`tools/input-probe/results/<date>-<hardware>/` as evidence. Reading the overlay by hand still works
and stays the fallback when no log server is reachable.

**What the `p50` / `p95` in §11.1 and §11.2 are.** They are **pooled percentiles over every frame of
the row**: each window also carries a quantized histogram of its frame, tick, render and draw-call
series (0.05 ms for TICK / RENDER, 0.25 ms for FRAME, exact for DRAW), the analyzer sums the
histograms of a row's windows and reads the percentile off the total. That is the same statistic the
headless `pnpm bench` figures in §11.3 are — **the same statistic, not a comparable magnitude**.
These are Mali-G51 milliseconds; the bench runs Chromium + SwiftShader on a desktop, so what
transfers from it is its **counted** quantities (draw calls, pooled render-target bytes, structure
rebuilds, heap delta) and its **in-run ratios**, never its milliseconds — as
[rendering-and-shell.md § What this bench can and cannot tell you](rendering-and-shell.md#what-this-bench-can-and-cannot-tell-you)
and §11.3's own preamble say. **So: compare a counted figure with §11.3 freely; compare a
millisecond only with another millisecond measured on a monitor** — CRT `off` against `full` over
the same practice section, WebGL 1 against WebGL 2, monitor A against monitor B, this build against
the last. Those are the A/Bs the §4 table is made of, and both sides of each go through the same
GPU, driver and frame loop. `min` and `max` are the single best and worst frames of the row. A
figure the analyzer prints with a trailing `~` could not be pooled (a session captured before the
histograms existed): it is the median of the windows' own percentiles, understates the tail, and is
not even the same statistic as §11.3's.

**Which build these expectations describe.** Everything below assumes a build **at or after plan
step M3-02d** (commit `1cbbf42`), which folded the CRT look and the Mode-7 floor into their draw
passes. That changed the very figures this table compares against, so §11.3 prints each headless
measurement **twice**: `M3-02c` — what the bench read before the fold, kept because it is the
evidence the fold worked — and `M3-02d` — what it reads now and what an on-device reading should
be compared with. Nothing in §11.1 / §11.2 has ever been measured on the hardware, so those tables
have no "before" to keep: they are to be filled in against the **M3-02d** column. If you are
measuring an older bundle, say so in the table — the CRT and Mode-7 rows will not match.

### 11.1 Baseline — fill this in

| Where | FPS | TICK ms | RENDER ms | DRAW | REB / frames | RT KB | TPF 0/1/2/3+ | LOCK |
|---|---|---|---|---|---|---|---|---|
| Title, idle | | | | | | | | |
| Zone A, mid-stage | | | | | | | | |
| Zone A, boss | | | | | | | | |

Boot ms (`data-shmup-boot-ms`): ____ (budget 10 s). Bundle measured (git short SHA): ____ (it must
be at or after `1cbbf42`, M3-02d — see above).

`RT` is expected to read **0 KB** on these three rows whatever CRT is set to, and about **512 KB**
on a stage with a layer effect. A reading of ~16,384 KB with CRT on means the bundle predates
M3-02d. `REB` is expected to read **0**, or very near it, since **M3-02e**: a figure that tracks
the frame count means the bundle predates it, or that something started toggling `visible` on a
sprite outside the layer render groups. `DRAW` is about 7–10 on these rows since M3-02e (one batch
boundary per render group), where it was 2–4.

### 11.2 The measurements — fill these in

| # | What | Result |
|---|---|---|
| M1 | RENDER ms with the scene rebuild on vs. patched out (**F1**) — since **M3-02e** the shipped build never rebuilds the whole scene (`REB` should read ≈ 0); what is left to measure on the TV is how much Mali-G51 time that saved, by comparing this build's `RENDER` with the last one's over the same practice section | |
| M2 | RENDER ms and RT with CRT off / light / full on the same section — after M3-02d all three should read the same, and RT should not move at all (**F2**) | |
| M3 | Frame-graph spike entering the Mode-7 and raster stages — M3-02d's boot warm-up should have removed it (**F4**) | |
| M4 | Frame-graph spike on the first very dense pattern of a fresh launch — likewise (**F5**) | |
| M5 | WebGL1 vs WebGL2 over 60 s of the same stage (**F8**) | |
| M6 | `estimateStageMemory` per zone vs. RT, CRT on and off (**F3**) — the estimator now says 67.0 MiB for zones A–G, 74.0 for H and 74.7 for I, of which 25.05 MiB is render targets | |
| M7 | Does the app stop rendering under the Home overlay? | |
| M8 | Input-to-photon latency, 240 fps video (§10 above) | |

One thing to check once, from the remote Web Inspector on the first launch of a new set:
`gl.getExtension('OES_element_index_uint')` must not be `null`. Since M3-02d both full-screen
effects are Pixi meshes, and `MeshGeometry` forces 32-bit indices, so a WebGL1 context without that
extension draws a black picture rather than a picture without effects. The Mali-G51 has it; an
older panel is the case worth ruling out.

### 11.3 What the headless bench already says

`pnpm bench` → `test/bench/render.perf.ts` (Chromium + SwiftShader, so the shape matters and the
milliseconds do not):

The load is the same in every row and the bench asserts the *smallest* live count any measured
frame carried, so these are floors rather than one lucky frame: **512 of 512 enemy bullets** (the
pool is topped up after every step), **≥ 489 of 512 point items** (a screen clear re-fills the item
pool on every tick that freed a slot; the ~20 missing are the items that reached the score during
the tick that was rendered) and **≥ 489 of 512 particles**.

One column per step: **M3-02c** is the first run, **M3-02d** the same scenario once that step
folded the CRT and the Mode-7 floor into their draw passes, **M3-02e** once that step gave the
high-churn layers their own render groups. **The M3-02e column is the one to compare a TV reading
with**; the earlier ones are history, kept as the evidence each change did what it claimed.

| Scenario (384×216 internal, the load above) | Draw calls M3-02c → M3-02d → **M3-02e** | Pooled targets M3-02c → **M3-02d / e** | Scene rebuilds M3-02c / d → **M3-02e** |
|---|---|---|---|
| CRT off | 4 → 4 → **9** | 0 KB → **0 KB** | 659 / 660 frames → **0 / 660** |
| CRT light | 5 → 4 → **9** | 2,048 KB → **0 KB** | 659 / 660 → **0 / 660** |
| CRT full | 5 → 4 → **9** | 2,048 KB → **0 KB** | 659 / 660 → **0 / 660** |
| Layer effects (`raster-range`) | 7 → 7 → **10** | 512 KB → **512 KB** | 655 / 660 → **0 / 660** |
| Mode-7 floor (`dimension`) | 7 → 6 → **9** | 512 KB → **0 KB** | 655 / 660 → **0 / 660** |
| Layer effects at **768×432** internal | 7 → 7 → **10** | 2,048 KB (+1,296 KB frame target) → **the same** | 655 / 660 → **0 / 660** |

The draw calls M3-02e adds are the render groups' batch boundaries, one per group that holds
something — a deliberate trade against the whole-scene rebuild, well inside `shmup_feat.md` §22's
20–50, and the reason the two e2e specs' `DRAW_CALL_BUDGET` went 12 → 16. The bench also reports
`groupRebuilds`, the same flag counted over *every* render group rather than the scene's alone, so
the last column cannot fall by the churn merely moving out of sight: it reads 659 before the step
(one group, one rebuild a frame) and about 1,590 after (≈ 2.4 layer groups a frame, each a
fraction of the scene).

The p95 render time moved 2.4–3.2 ms → 2.5–3.3 ms between the two runs, which is SwiftShader
noise on a shared machine, not a signal. What is comparable is CRT `full` against CRT `off` **in the same run**: **0.94× and 1.10×**
over three runs, inside the step's "within ~10 %", where before the fold it was 1.12× (`pnpm bench`
prints the ratio and asserts it). The **counted** quantities
are the transferable result — on the TV, CRT `full` stopped costing a 16.8 MB pooled target
(2048×2048 at 1080p) and a second full-screen pass over 2.07 Mpx.

Four things it settles without the hardware:

- **F1's mechanism was real, not just plausible — and it is fixed.** Essentially *every* frame
  rebuilt the scene's whole instruction set (655–659 of 660, reproduced run to run) until
  **M3-02e** gave each high-churn layer its own render group; the same scenarios now rebuild the
  scene on **none** of their 660 frames. The bench runs the worst-case frame both ways in one run
  (`renderGroups: false` restores the old single-group scene), which is M1 done headlessly: under
  SwiftShader the grouped scene reads **0.92–0.94×** the single-group p95 over three runs. That ratio is the least
  transferable number on this page — software WebGL charges CPU time for the extra draw calls
  while making the tree walk cheap on a desktop core, and the Kant-SU2 pays the opposite way
  round — so M1 on the TV is still worth doing. The **counted** result is what transfers.
- **F2 was right that `light` is not cheaper than `full`** — and after M3-02d neither is dearer than
  `off`: one draw call, no pooled target, whatever the setting.
- **F3's power-of-two rounding is real.** A 384×216 filter pass pools a 512×256 target; the same
  pass at 768×432 pools 1024×512 — ×4, exactly as the review's §7.3 table predicts. (`estimateMemory`
  now models it — M3-02d.)
- **F6's wasted pass was real.** The Mode-7 floor pooled a 512 KB target and ran a filter pass whose
  input its shader never read; as a mesh it is one draw call and no target.

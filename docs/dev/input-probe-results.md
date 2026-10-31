# Input probe results — Samsung Smart Monitor M7 (2026-09-15)

What the [input probe](input-probe.md) measured on both test monitors, what it means for the game, and where each
finding is applied. The game changes are plan step **M3-02b** in [`shmup_plan.md`](../old/shmup_plan.md#m3-02b--remote--hardware-tuning-from-the-input-probe-results);
the hardware facts are summarised in [`shmup_tech.md`](../old/shmup_tech.md) §2.7.

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
step M3-02e** (commit `f18c7de`), which gave the high-churn layers their own render groups, and so
also after **M3-02d** (commit `1cbbf42`), which folded the CRT look and the Mode-7 floor into their
draw passes. Both changed the very figures this table compares against, so §11.3 prints each headless
measurement **once per step**: `M3-02c` — what the bench read before either change, kept because it
is the evidence they worked — then `M3-02d` and `M3-02e`, the last of which is what it reads now and
what an on-device reading should be compared with. Nothing in §11.1 / §11.2 has ever been measured
on the hardware, so those tables have no "before" to keep: they are to be filled in against the
**M3-02e** column. If you are measuring an older bundle, say so in the table — the CRT and Mode-7
rows will not match, and neither will `REB` or `DRAW`.

### 11.1 Baseline — fill this in

| Where | FPS | TICK ms | RENDER ms | DRAW | REB / frames | RT KB | TPF 0/1/2/3+ | LOCK |
|---|---|---|---|---|---|---|---|---|
| Title, idle | | | | | | | | |
| Zone A, mid-stage | | | | | | | | |
| Zone A, boss | | | | | | | | |

Boot ms (`data-shmup-boot-ms`): ____ (budget 10 s). Bundle measured (git short SHA): ____ (it must
be at or after `f18c7de`, M3-02e — see above).

`RT` is expected to read **0 KB** on these three rows whatever CRT is set to, and about **512 KB**
on a stage with a layer effect. A reading of ~16,384 KB with CRT on means the bundle predates
M3-02d. `REB` is expected to read **0**, or very near it, since **M3-02e**: a figure that tracks
the frame count means the bundle predates it, or that something started toggling `visible` on a
sprite outside the layer render groups. `DRAW` is about 7–10 on these rows since M3-02e (one batch
boundary per render group), where it was 2–4.

> **Read `REB` with the overlay panel hidden.** The panel's own text quads sit on `DEBUG`, which is
> deliberately not a render group, so a printed number changing width rebuilds the scene's group:
> headless Chromium measured that at **6 % of frames on an idle machine and 49 % on a loaded one**,
> and at 0 % in the same run once `DEBUG` was grouped too (`test/e2e/render-groups.spec.ts`). That
> rate is a property of the machine, not of the renderer. The guided capture reads
> `renderer.structureRebuilds` in `beforeRender()` and commits the frame in `afterRender()` whether
> the panel is visible or not (`packages/shell/src/debug/index.ts`), and its checklist is a DOM
> `<div>` rather than a Pixi container — so unlock the tools, **press debug key 1 to hide the
> panel**, fly, and take `REB / frames` from the analyzer's rows. A panel-on reading measures the
> overlay.

### 11.2 The measurements — fill these in

| # | What | Result |
|---|---|---|
| M1 | RENDER ms with the scene rebuild on vs. patched out (**F1**) — since **M3-02e** the shipped build never rebuilds the whole scene (`REB` should read ≈ 0, **taken from the capture with the panel hidden**; a panel-on reading measures the overlay's own churn and varies by machine); what is left to measure on the TV is how much Mali-G51 time that saved, by comparing this build's `RENDER` with the last one's over the same practice section. This measurement, not the headless bench, is the hardware verdict: the bench's p95 ratio (0.65–0.94× over five runs) is SwiftShader's, where a desktop core makes the tree walk cheap and charges for the extra draw calls, and the Cortex-A55 / Mali-G51 pays the opposite way round | |
| M2 | RENDER ms and RT with CRT off / light / full on the same section — after M3-02d all three should read the same, and RT should not move at all (**F2**) | |
| M3 | Frame-graph spike entering the Mode-7 and raster stages — M3-02d's boot warm-up should have removed it (**F4**) | |
| M4 | Frame-graph spike on the first very dense pattern of a fresh launch — likewise (**F5**) | |
| M5 | WebGL1 vs WebGL2 over 60 s of the same stage (**F8**) (runbook below: §14.1) | |
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
  SwiftShader the grouped scene reads **0.65–0.94×** the single-group p95 — 0.92–0.94× over the
  step's three runs, 0.85× when the docs were written, 0.65× in the review's run. That ratio is the least
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

## 12. Resolution benchmark (R0-03)

R0-03 is the plan's resolution benchmark: the owner's TV runs of the render bench at 384×216 (shipped
v1, the per-session baseline), 640×360 (v2's frame) and 960×540, adjudicated by R0-03.A1's report into
the §17 row's "three campaigns, twelve sessions" — the 1080p/720p/540p sweep of
[tools/input-probe/results/2026-10-19-m7-bench-resolutions/](../../tools/input-probe/results/2026-10-19-m7-bench-resolutions/)
— plus the original three-run campaign that shaped the analyzer, in
[tools/input-probe/results/2026-10-19-m7-bench/](../../tools/input-probe/results/2026-10-19-m7-bench/).
Fifteen `rb-*.jsonl` sessions in all, every table below printed by the kit's
`tools/input-probe/results/analyze-bench.mjs`; each campaign's README travels with its logs.

**Reading the numbers (plan §13).** Every scenario is measured **against its own 384×216 row in the
same run** — v1's frame, the same session, the same panel — on two metrics: the **two-tick share**
(the per-cent of frames the vsync-locked loop needed two or more sim ticks for; the stable metric,
the one the analyzer decides on) and the **synced render p95** (ms of `renderFrame()` plus the GL
finish). Plan §13's tiers for the cost of 640×360 over its own baseline: within **+2 pts** and
**≤ 8 ms** is *proceed as planned* (the headroom recorded as the R3-04 / R6-02 budget); **+2–10 pts
or 8–12 ms** is *proceed on the TV profile from the start* (R3-06 and R5: parallax capped at 4 on
Tizen, the far backdrop at half resolution, CRT off by default on TV); worse is *proceed and open a
performance step before R5, then re-measure*. On this panel the ms column is mostly the display's —
even v1's own rows sit on the same floor (§12.6) — so the two-tick share carries the scene verdict.

### 12.1 The fifteen sessions — one monitor, paired by design

| Campaign (folder)                    | Session              | GL | Monitor      | Output (backbuffer/window) | Rows | Build             |
|--------------------------------------|----------------------|----|--------------|-----------------------------|------|-------------------|
| `2026-10-19-m7-bench` (R0-03 original)| rb-mvfn8l6d-i1rw     | 1  | 10.0.0.224   | 1920×1080 window            | 18/18 | 2a82316           |
|                                      | rb-mvfnv78l-pqzh     | 2  | 10.0.0.224   | 1920×1080 window            | 18/18 | 2a82316           |
|                                      | rb-mvfo9erp-57tj     | 1  | 10.0.0.224   | 1920×1080 window            | 18/18 | 2a82316           |
| `2026-10-19-m7-bench-resolutions` (1080p sweep) | rb-mvfrt2du-7tz7 | 1 | 10.0.0.224 | 1920×1080 window | 172+1 | 9c7a594+ |
|                                      | rb-mvfv806x-tj7z     | 2  | 10.0.0.224   | 1920×1080 window            | 172+1 | 9c7a594+          |
|                                      | rb-mvfyep4t-59zy     | 1  | 10.0.0.224   | 1920×1080 window            | 172+1 | 9c7a594+          |
|                                      | rb-mvg1le8z-xz93     | 2  | 10.0.0.224   | 1920×1080 window            | 172+1 | 9c7a594+          |
| `out720`                             | rb-mvg4tafk-yli8     | 1  | 10.0.0.224   | 1280×720 backbuffer         | 150  | f496802@1280x720  |
|                                      | rb-mvg7l9vw-bp11     | 2  | 10.0.0.224   | 1280×720                    | 150  | f496802           |
|                                      | rb-mvgadjmz-uozj     | 1  | 10.0.0.224   | 1280×720                    | 150  | f496802           |
|                                      | rb-mvgd5rof-fuwz     | 2  | 10.0.0.224   | 1280×720                    | 150  | f496802           |
| `out540`                             | rb-mvgfz6le-6f1y     | 1  | 10.0.0.224   | 960×540 backbuffer          | 90   | 8ba0e7c@960x540   |
|                                      | rb-mvghnikx-kmh4     | 2  | 10.0.0.224   | 960×540                     | 90   | 8ba0e7c           |
|                                      | rb-mvgjbup4-0p8h     | 1  | 10.0.0.224   | 960×540                     | 90   | 8ba0e7c           |
|                                      | rb-mvgl07um-qm3i     | 2  | 10.0.0.224   | 960×540                     | 90   | 8ba0e7c           |

All fifteen ran on **one monitor — 10.0.0.224**, the Samsung M7 (LS43AM702UNXZA, Tizen 5.5,
Chromium 69.0.3497.106 kernel, UA `…69.0.3497.128…`, display 1920×1080 @ dpr 1). The plan step
named both monitors; the honest record is one, **by design**: R0-03's step 3 skips the second unit
of the same model unless the firmware differs, and both campaign READMEs record the identical unit
(`1920×1080`, firmware `M-KSU23MWWC-2750.0`). **10.0.0.8 has no October bench sessions** — its
`results/` entries are the 2026-09-15 `ip-*` input-probe captures above, which predate the bench
kit. The original campaign's README records two discarded runs (inspector attached; resumed after
pause) and one loose observation — a screen blanking on the heavy rows, whose working hypothesis,
a filter attached every frame, is what M3-02e later removed.

The pairing decides which verdicts the analyzer may print: the original campaign is GL 1 × 2 + GL 2 × 1
and **refuses** any WebGL verdict ("No verdict: needs ≥ 2 runs of each") — the R0-03 lesson enforced
in code, since the pre-sweep single-run "GL 2 clearly better" reading was an artifact of the
pessimistic run 1 (§12.2). Each of the three sweeps is GL 1 × 2 + GL 2 × 2 on one output and one
unit: full verdicts, printed per campaign below.

### 12.2 The original campaign — 640×360 opens the performance step (18 scenarios, 1080p window)

Two-tick share % (frames that needed ≥ 2 ticks) and synced render p95 ms, medians of the runs:

| Size × variant | 2t GL1 (×2 runs) | sync p95 GL1 | 2t GL2 (1 run) | sync p95 GL2 |
|---|---|---|---|---|
| 384×216 busy      |  0.3 | 11.3 |  0.5 | 12.2 |
| 384×216 filter    |  1.9 | 14.6 |  0.4 | 13.4 |
| 384×216 mode7     |  2.4 | 12.7 |  0.2 | 11.4 |
| 384×216 crt-light |  0.2 | 12.3 |  2.9 | 16.5 |
| 384×216 crt-full  | 30.6 | 12.3 | 28.6 | 11.8 |
| 384×216 worst     | 36.9 | 18.5 | 35.3 | 14.6 |
| 640×360 busy      | 10.3 | 14.0 |  6.8 | 12.8 |
| 640×360 filter    | 23.9 | 17.2 | 21.6 | 15.3 |
| 640×360 mode7     | 12.3 | 15.4 | 10.3 | 13.6 |
| 640×360 crt-light | 10.8 | 15.3 |  8.5 | 17.6 |
| 640×360 crt-full  | 43.7 | 13.0 | 42.0 | 11.0 |
| 640×360 worst     | 62.4 | 16.1 | 59.2 | 17.6 |
| 960×540 busy      | 38.6 | 13.2 | 35.0 | 13.0 |
| 960×540 filter    | 63.6 | 18.7 | 60.3 | 20.7 |
| 960×540 mode7     | 44.9 | 14.0 | 41.6 | 12.4 |
| 960×540 crt-light | 38.8 | 15.0 | 36.0 | 17.5 |
| 960×540 crt-full  | 69.4 | 12.8 | 67.2 | 13.0 |
| 960×540 worst     | 98.9 | 17.4 | 96.7 | 19.2 |

**§13 at 640×360 (GL 1, medians of its two runs, against each run's own 384×216 row):
performance-step for all six variants** — Δ two-tick busy +10.0, filter +22.0, mode7 +9.9,
crt-light +10.5, crt-full +13.1, worst +25.6 pts; synced 12.95–17.15 ms. GL 2's single run reads the
same way (Δ +5.5 … +23.9). The plan honoured the class: the performance step before R5 ran as the
R5 render work and the headless bench of [render-performance-review.md](render-performance-review.md)
§8, and §12.6 closes its budgets. **WebGL comparison: none recorded** — the ×2 + ×1 refusal above, and
the campaign's own README says not to open "make WebGL 2 the TV default" on this evidence. The CRT
`full` and `worst` rows are pressure points at *every* size and GL — 384×216 crt-full already reads
30.6 % two-tick — so they are v1-era costs, not a v2 regression.

**960×540.** Its `busy` row lands in the same §13 tier as 640×360 on both GLs, so the analyzer prints
the plan's note: *960×540 is viable on the M7 for after v2* (a desktop HD mode / v3), *still no
whole-number scale on 720p TVs* — read only with the owner's saturation caveat: `worst` is
96.7–98.9 % two-tick at every size and GL here, and this window fills 1920×1080 without scaling, so
the size at this output measures the panel, not the game. Nothing in the plan moves.

**The corpus's noise floor (its own ruler).** The two GL 1 repeats of this campaign put the
run-to-run drift at **median 3.9 pts / p90 6.1 pts** on the two-tick share and **13 % / 30 %** on the
synced p95 — a GL1-vs-GL1 spread reaching **1.51×**, larger than the "GL 2 is 0.90×" effect the
single-run reading called a win: that is the retraction's reason. Run 1 — straight after a fresh
install — is the systematically pessimistic one; the analyzer keeps the median of runs 1 and 3. Every
WebGL verdict below is printed against a drift band measured this way.

### 12.3 The three resolution sweeps (one output, GL 1 × 2 + GL 2 × 2, per campaign)

#### The 1080p window (172 scenarios — the campaign that decided R6-04's OUTPUT default)

§13 at 640×360, GL 1 (Δ two-tick pts vs the same run's 384×216 row; synced p95 ms): busy **+7.2**/15.4,
filter **+18.8**/17.1, mode7 **+11.5**/13.3, crt-light **+6.6**/13.7, crt-full **+13.8**/15.0, worst
**+23.5**/16.1 — **all six performance-step**. GL 2: +6.2/12.2, +17.6/15.9, +9.9/12.6, +7.2/14.0,
+12.9/12.3, +20.8/15.2 — **all six performance-step** as well. At this window even the shipped
384×216 baseline sits at synced ≈ 11–17 ms: the panel paces the ms; the two-tick deltas are the
scene's verdict, and they cross the band.

**WebGL 1 vs 2 (paired ×2 / ×2).** Two-tick: **21 better / 0 worse / 151 within**, overall **−2.2 pts**
against a **1.7 pts** drift band — beyond noise. Synced p95: 7 / 1 / 164, **0.90×** against a 7 %
band — beyond. The analyzer's verdict line: *"WebGL 2 is better beyond the noise floor (two-tick
share): §13 — a step to make WebGL 2 the TV default with a WebGL 1 fallback."* Read it where it comes
from: the wins are almost entirely the **native-art** rows (1280×720n-busy 64.9 → 38.0, 800×600n-busy
17.9 → 4.9, 1024×768n-filter 78.1 → 50.8); at the game's own 640×360 busy the delta is −2.4 pts,
inside noise. Noise: 344 pairs, 2t median 2.7 / p90 11.6 pts, synced 9 % / 26 %, drift 1.7 pts / 7 %.
The 960×540 rows saturate this window (`worst` 94.7–96.5 % two-tick) — §12.4 is what makes the size
legible.

#### The 1280×720 backbuffer (150 scenarios — the shipped `OUTPUT = Auto` on a TV since R6-04)

GL 1 two-tick % at 640×360: busy 1.7, filter 0.2, mode7 0.6, crt-light 0.4, crt-full 0.3, worst 11.0;
GL 2: 0.5 / 0.4 / 0.3 / 1.2 / 0.2 / 13.8. **§13 GL 1:** busy +0.5/12.40, filter −1.6/13.85,
mode7 −0.5/14.10, crt-light −1.1/12.90, crt-full **−1.7/11.65 → tv-profile**, worst +9.1/15.90 —
five performance-step, one tv-profile. **GL 2:** busy 0.0/11.70 **tv-profile**, filter 0.0/15.10
performance-step, mode7 −0.9/11.65 **tv-profile**, crt-light +1.0/13.30 performance-step, crt-full
−0.8/11.60 **tv-profile**, worst +12.6/16.40 performance-step. The two-tick deltas are **≤ ±1.7 pts**
outside the synthetic `worst` row; the remaining performance-step readings are pinned by the
synced-ms half of the tier — the same 11–16 ms floor the baseline itself sits on, not by lost frames.
The 960×540 rows at this output (busy 7.4–8.8 % two-tick) land in 640×360's tier: the "viable" note
stands, with the README reading — busy at this output is fine, `worst` is not (§12.4).

**WebGL 1 vs 2.** Two-tick 6 / 0 / 144, overall −0.6 pts against a 1.8 pts band — within; synced
1 / 4 / 145 at 0.98× against a 2 % band. The analyzer: *"mixed — the two metrics disagree beyond
noise: no verdict; WebGL 1 stays the default."* Noise: 2t 2.2 / 7.1 pts, synced 8 % / 24 %, drift
1.8 pts / 2 %.

#### The 960×540 backbuffer (90 scenarios — the `OUTPUT = 960×540` escape row)

GL 1 two-tick % at 640×360: busy 3.9, filter 0.7, mode7 1.6, crt-light 0.5, crt-full 2.5, worst 0.6;
GL 2: 1.1 / 3.2 / 0.5 / 0.7 / 0.3 / 3.1. **§13 GL 1:** crt-light −0.2/12.00 **tv-profile**; busy
+3.7/12.05, filter +0.2/15.45, mode7 +1.0/12.90, crt-full +2.1/12.65, worst −0.2/13.95
performance-step — every two-tick Δ is ≤ +3.7 pts and the tier is pinned again on the panel-floor ms.
**GL 2:** crt-light −0.1/11.05 **tv-profile**, the rest performance-step (Δ ≤ +2.0). The analyzer's
size line flips direction from §12.2 here: *960×540-busy is tv-profile where 640×360 is
performance-step* — a tier note only: 960×540 changes nothing in the plan, it is the after-v2 note.
Noise: 2t 1.5 / 6.4 pts, synced 9 % / 23 %, drift 0.4 pts / 4 %. **WebGL 1 vs 2:** 3 / 1 / 86
two-tick (−0.1 pts against a 0.4 pts band — within), synced 0.97× within. The analyzer: *"within
noise — no verdict: WebGL 1 (the shipped default) stays."*

### 12.4 Cross-output — the table behind R6-04's `OUTPUT = Auto`

Pooled GLs; `*` marks a row that beats the 1080p window beyond its noise band. Two-tick % at
640×360, by output:

| 640×360 row | 1080p window | 1280×720 out | 960×540 out |
|---|---|---|---|
| busy      |  7.5 |  0.8* | 1.1  |
| filter    | 22.6 |  0.2* | 0.7* |
| mode7     | 10.4 |  0.3  | 0.7  |
| crt-light |  8.8 |  0.4  | 0.5  |
| crt-full  | 42.3 |  0.2* | 1.1* |
| worst     | 59.5 | 11.3* | 1.8* |
| **960×540 busy** | 37.5 |  8.8* | 0.3* |
| **960×540 worst**| 95.3 | 53.5* | 38.8* |

(960×540 rows are the same *scene content* rendered at the larger internal size.) The plan records
this as R6-04's evidence line: at 720p output every 640×360 variant but the stress row collapses to
≤ 0.8 % — busy 7.5 → 0.8, filter 22.6 → 0.2, mode7 10.4 → 0.3, crt-light 8.8 → 0.4, crt-full
42.3 → 0.2, reaching §13's tv-profile band at 720p for crt-full on both GLs and for busy and mode7
on GL 2; `worst` runs 59.5 → 11.3 → 1.8 % across the three outputs; native art is dead from
1280×720n up at any setting and fine to 640×360n; 540p only helps the heaviest rows — a few light
native rows read 1–4 pts worse there. The synced p95 barely moves between outputs (11–18 ms
everywhere, the 384×216 baseline included): **the ms is the panel's; the two-tick share is what
output scaling buys.**

### 12.5 Decode and upload

The kit's `decode` records — the "Decode and upload" section of `analyze-bench.mjs`. The page set on
these builds is the synthetic `rgba-2048` / `png8-2048` shape of the pre-R3-04 stand-ins (the shipped
atlas differs; both campaign READMEs flag it), and the load estimate they drive proved the **most
reproducible number in the corpus**:

- **Zone load, every session, cold / zone-change: 1484–1592 / 730–766 ms** — 15 of 15 inside
  R3-04's 2 s estimate target, GL-independent.
- 2048×2048 page, GL 1 medians (original campaign / 1080p pair): fetch 36.8–52.3 ms; decode
  **361.8 / 169.3 → 365.1 / 203.6 ms**; upload 387.4–473.3 (png8 145.5–172.0); file→GPU RGBA
  **780.0–813.3** vs PNG-8 **338.1–389.5** — R1-05's indexed pages land **≈ 2.2× cheaper**, at
  **38.1–40.4 ms/Mpx**.
- The common 1024² page (RGBA): file→GPU 199.6–248.0 ms; the tiny 256² zone page: 56.8–110.8 ms —
  decode-dominated.

### 12.6 v2 on the TV (R6-02)

R6-02's five budgets — render ≤ 8 ms (feat §22), TPF reading 1 with the vsync-locked loop, zone load
≤ 2 s, boot ≤ 10 s, memory < 100 MiB — adjudicated by R6-02.P3 against these fifteen sessions, every
figure on the device line of §12.1. The guided render-profile capture — §11's `rp-` kit — has
**not run**: no `rp-*.jsonl` exists anywhere, so §11's open tables stay the owner's step, and boot
and the process-wide memory figure are reported here *not measured*, not guessed. R6-02.P1's
headless bench (§8 of [render-performance-review.md](render-performance-review.md)) is quoted beside
these rows for **counted quantities only**: its milliseconds are CPU time under SwiftShader and the
panel-paced milliseconds of this section are not even the same statistic, let alone a comparable
magnitude; each number stays in its own column.

**1. Render ≤ 8 ms — missed as an absolute TV-ms reading; the miss is the panel's, not the game's.**
At 640×360, the sweep campaigns, `renderMs` p95 / `syncedMs` p95 ms (GL 1 / GL 2 medians):

| Output           | busy          | filter        | mode7         | crt-light     | crt-full      | worst         |
|------------------|---------------|---------------|---------------|---------------|---------------|---------------|
| 1080p window     | 14.8 / 14.5   | 17.4 / 19.0   | 15.6 / 14.7   | 14.8 / 15.5   | 15.9 / 13.8   | 18.1 / 16.4   |
| 1280×720 (Auto)  | 13.8 / 11.9   | 13.9 / 14.2   | 13.7 / 11.9   | 12.8 / 14.4   | 11.3 / 11.1   | 15.5 / 17.5   |
| 960×540          | 15.2 / 14.2   | 14.8 / 17.8   | 14.8 / 12.6   | 13.5 / 12.0   | 15.3 / 10.6   | 14.3 / 16.3   |

(sleeping ms/tick at 640×360: synced p95 12.0–17.2 ms.) The **same metric on the shipped-v1 rows —
384×216, this panel, these very sessions — reads 10.4–16.4 render / 9.7–16.5 ms**, and the panel's
idle rAF histogram is p95 ≈ 30 ms (§8 above): even the old frame misses 8 ms on the TV. The ms
column here is a compositor/panel pacing floor no scene content reaches over or under by a
consistent margin; the scene-attributable reading is §13's relative one, and there 640×360 costs
**≤ ±1.7 pts two-tick beyond its own baseline at the shipped Auto output** (only the synthetic
`worst` row adds +9.1 / +12.6 pts). Headless the budget holds outright — P1's real-zone sweep worst
p95 **1.60 ms** of the 16 ms gate — so **the absolute 8 ms stays as the headless bench's gate** and
the TV-side reading of the budget is the relative one above; this records the tier, **it is not a cap
raise** — no budget moved. P4a/P4b/P4c act on scene fill, and fill at the output a TV boots into is
already at the floor (`worst` moves 59.5 → 11.3 → 1.8 % two-tick on **output alone**, §12.4; the
baseline itself sits above 8 ms): their expected gain against this miss is ≈ 0 ms — they cannot move
a floor the v1 game shares. The shipped lever that moves the fill-attributable part is the OUTPUT row
R6-04 already shipped.

**2. TPF reading 1 with the vsync-locked loop — met at the shipped default output; stress row
disclosed.** The bench's instrument for it is the two-tick share itself. At 640×360 on the shipped
`Auto` = 1280×720, GL 1 / GL 2 medians: busy 1.7 / 0.5 %, filter 0.2 / 0.4 %, mode7 0.6 / 0.3 %,
crt-light 0.4 / 1.2 %, crt-full 0.3 / 0.2 % — the loop reads 1 tick per frame on **≥ 98 % of frames
in every normal-play row**. The synthetic `worst` row (maxed pools and every effect on — not a
shipped scene) reads 11.0 / 13.8 % there, 0.6 / 3.1 % at `OUTPUT = 960×540`; on the non-default
1080p window the same rows run 6.4–8.8 % (busy) to ≈ 59 % (`worst`, crt-full) — the fill cost that
motivated R6-04's Auto default. Met; no mitigation needed.

**3. Zone load ≤ 2 s — met.** §12.5: cold 1484–1592 ms, zone-change 730–766 ms, 15 of 15 — the
corpus's most reproducible number, GL-independent, 20.4–25.8 % under the cap. The decode split
(2048² pages): PNG-8 file→GPU 338.1–409.7 ms (decode 169.3–226.3) vs RGBA 778.0–836.3 — ≈ 2.2×,
≈ 38–40 ms/Mpx, exactly the R1-05 indexed-page choice paying off on the TV. Caveat carried with the
data: these builds pre-date R5's final art and ran the synthetic page shape; the ≤ 1 + 2 pages per
zone atlas budget keeps the estimate valid for v2.0's art, and the next owner capture re-measures it.

**4. Boot ≤ 10 s — not measured; the instrument is still open.** `bootMs` rides only on `rp-`
guided-capture records and none were taken (§11). That is a **missing measurement, not a missed
budget**: no figure to report, no mitigation trigger; the verdict waits on the owner's run of the
capture kit ([install-on-tv.md](../client/install-on-tv.md)), and nothing in the bench logs
contradicts it.

**5. Memory < 100 MiB — met on every measured component; the process-wide figure stays with the
same open capture.** From the bench records (JS heap through `performance.memory`, coarse on the
TV): JS heap end **16.3–30.8 MiB**; atlas textures uploaded **4.0 MiB** at the baseline density,
**8.0** at the 640×360 (×1.5 art) rows, **16.0** at the 2.25-density rows; filter-arm render
targets ≤ **4.0 MiB** (2.0 at 640×360); the upscaled frame target ≤ **1.98 MiB** (0.88 at 640×360).
The v2 rows sum to **≈ ≤ 21 MiB of counted GPU plus ≤ 31 MiB of heap** — far inside 100. The
headless estimator with the final art at 640×360 corroborates: stage totals **75.1–84.2 MiB**
(28.6 MiB of fixed render targets driving it) — under 100. The TV rows count **11–16 draw calls**
against feat §22's 20–50. The Chromium-process figure that Tizen's 120 MB install cap binds against
is not carried by `rb-` records — it rides the same open owner capture as boot; runbook: same file,
§14.2.

**The P4 dispositions** (R6-02's rule 2: ship a mitigation only on a P3 miss — and the misses above
are panel pacing and instrument gaps, none scene-attributable): **P4a** (parallax capped at 4 on
Tizen) **NOT NEEDED** — no normal-play row misses TPF-1 at the shipped output and the fill cost lives
in the 1080p window the default avoids; **P4b** (half-resolution far backdrop) **NOT NEEDED** — the
far-layer fill is inside the tv-profile band's deltas, and the CRT/filter pressure is the CRT pass
plus the window scale, not the backdrop's resolution; **P4c** (CRT off by default on TV) **NOT
NEEDED** — crt-full at 640×360 on the shipped Auto output measures 0.2–0.3 % two-tick (Δ −1.7 /
−0.8 pts), and the window that makes CRT expensive (42 %) is now the user's explicit choice, not the
default (R6-04's own scope kept a P4c default flip out of R6-02); **P4d** (WebGL 2 as the TV default)
**NOT NEEDED** — the §12.3 pairings are complete: GL 2 is beyond noise only at the 1080p window
(21 / 0 / 151, and there almost entirely on native-art rows), mixed at 720p, within noise at 540p —
the gain is **1080p-fill-only**, exactly the mode R6-04's `Auto` (OUTPUT 720p + the RENDERER floor of
Chromium ≥ 71 with the probe — decision W5-20) keeps the TVs out of; no budget misses at the shipped
output in a way a floor retune would fix, so the Auto floor is not retuned. The original campaign's
×2 + ×1 pairing carries no verdict and correctly stays verdictless. webOS 5 (Chromium 68) remains
unmeasured on hardware throughout. No cap was raised and nothing was edited: every figure above is
read off the committed logs of `2026-10-19-m7-bench`, `-resolutions`, `out720` and `out540`.

---

## 13. SVG on the TV (v2.0.x era)

**Why this section exists.** The SVG-art program (R-SVG WO-1/2/3) asked whether the atlas could
travel as vectors, and it asked on the strength of WO-1's inventory — a **desktop** measurement,
which is exactly the caveat this repo always carries: the TVs run Chromium 69 (Tizen) and 68
(webOS), older than anything on a desk. The probe's capability matrix closes that gap. It is 19
small, known-output SVGs, each rastered through the image pipeline a device actually has (`blob:`
URL → `Image` → first `drawImage` + `getImageData` flush), 3 throwaway windows then 12 measured
ones, every row decided by a numeric pixel predicate — and every feature the game could care about
**renders on the M7**. Sixteen for sixteen, plus three answers that disagree with the desktop record.

- **Raw data:** [tools/input-probe/results/2026-10-31-m7-bench-svg-features/](../../tools/input-probe/results/2026-10-31-m7-bench-svg-features/)
  — session `ip-mvsr61cj-cjko`, 83 reports, 168 events, none dropped, from 10.0.0.224; the finished
  matrix rides the last report's `stats.svg`. The folder's README holds the launch story and both
  verdicts in full.
- **Analyzer:** `node results/analyze.mjs results/2026-10-31-m7-bench-svg-features/ip-mvsr61cj-cjko.jsonl`
  from `tools/input-probe/` — the table below is its `## SVG capability` section, committed beside
  the logs as `analysis-features.txt` (byte-identical on two runs).
- **Dates:** the folder label (2026-10-31) is the owner's; the wire is `2026-10-28T23:35:48.013Z →
  23:39:54.118Z` (4.1 min, of which the matrix's own clock reports 247.0 s). Same class of label as
  §12's session dates — the stamps are the order of record. This session began **three minutes
  after** the bench run in
  [tools/input-probe/results/2026-10-31-m7-bench-pngfloor/](../../tools/input-probe/results/2026-10-31-m7-bench-pngfloor/)
  closed on the same monitor (§13.6).

### 13.1 The static matrix — 16 of 16 PASS

Every figure is a median of 12 measured windows; `total` = decode (blob → `onload` + `decode()`) +
draw (the first `drawImage` through the `getImageData` read-back); `ink` is the predicate's count of
non-empty pixels; `B` is the SVG's own byte size.

| Feature | Status | total ms | decode ms | draw ms | ink | B |
|---|---|---|---|---|---|---|
| `paths-static` | PASS | 83.9 | 81.0 | 2.3 | 65536 | 380 |
| `grad-linear` | PASS | 82.8 | 80.4 | 2.7 | 65536 | 342 |
| `grad-radial` | PASS | 140.8 | 109.1 | 31.1 | 48100 | 374 |
| `mask-lum` | PASS | 119.9 | 97.0 | 22.5 | 63360 | 424 |
| `clip-circle` | PASS | 96.2 | 92.5 | 3.0 | 13034 | 278 |
| `use-symbol` | PASS | 138.8 | 131.9 | 3.3 | 3200 | 378 |
| `text-glyph` | PASS | 97.5 | 95.2 | 2.5 | 65536 | 290 |
| `text-path` | PASS | 87.4 | 82.3 | 2.4 | 1656 | 322 |
| `blur-s2` | PASS | 95.6 | 88.8 | 5.9 | 3163 | 318 |
| `blur-s4` | PASS | 98.5 | 89.5 | 8.5 | 3892 | 318 |
| `blur-s8` | PASS | **103.5** | 91.8 | 10.8 | 5233 | 318 |
| `drop-shadow` | PASS | 101.9 | 90.7 | 11.8 | 65536 | 433 |
| `turb-oct1` | PASS | 149.7 | 146.0 | 2.9 | 52900 | 428 |
| `turb-oct4` | PASS | **214.4** | 211.4 | 2.8 | 52900 | 428 |
| `chain-tcc` | PASS | 136.2 | 120.7 | 15.0 | 25600 | 539 |
| `e3-atlas` | PASS | 96.4 | 91.4 | 3.4 | 16384 | **50430** |

**The shape of the cost is parse, not paint.** Decode is 80–212 ms of every total while the raster
draw is 2–31 ms; `turb-oct4`, the dearest feature on the box at 214.4 ms, spends 211.4 of them
*reading a 428-byte file*. A vector page bills on arrival and then draws cheaply — which is §13.4's
load-cost story in one sentence. **Filters are where the draw does live:** plain paths, gradients,
text and `<use>` draw in 2–3 ms, while `blur-s8` costs 10.8, `drop-shadow` 11.8, the
filter+mask+clip chain 15.0, and the radial gradient 31.1.

### 13.2 The three surprises — where Chromium 69 disagrees with the desktop record

| Feature | Desktop-era answer | **M7 answer** | Device evidence |
|---|---|---|---|
| `smil-animate` | FROZEN — static-image mode, `imgCtxAnimated = FALSE` for `animateTransform` | **ANIMATES** | the redraw 500 ms on differs from the first read: **raster differs at byte 98376** (276 B, 2.8 ms draw) |
| `css-keyframes` | FROZEN — a CSS `@keyframes` in an `<img>`-loaded SVG does not run | **ANIMATES** | the redraw differs: **raster differs at byte 240** (369 B, 2.5 ms draw) |
| `bitmap-svg` | REJECT — `createImageBitmap` refused every SVG source, "even on Chromium 156" (whatwg/html #923, vector formats) | **ACCEPT** | the promise resolved: **`accepted 256×256`** (197 B) |

**Animation inside `<img>` is live on this panel.** The spec's static-image mode is what modern
Chromium does; Chromium 69 advances both SMIL and CSS-keyframe content in an image element. Read the
direction of the difference before reaching for it: it is an **older engine being more permissive**,
and the price of a live image is that the *engine* owns the clock — no `requestAnimationFrame`
gating, no pause, no deterministic frame. Fascinating as a capability; unadoptable as play art in a
game whose simulation is the clock.

**`createImageBitmap` splits by source shape, and the repo's blanket claim was too wide.** The bench
measured `createImageBitmap(blob of SVG bytes)` on this same unit the night before and recorded *"The
source image could not be decoded."* — 0 of 8 reps (`svg-bitmap-reject`,
[2026-10-30-m7-svg/](../../tools/input-probe/results/2026-10-30-m7-svg/)), and the skip is still in
`apps/tizen/src/bench/decode.ts` on that strength. The probe's bitmap stage hands the call something
else: the **already-decoded `HTMLImageElement`** loaded from the object URL. That route is accepted,
256×256, on Chromium 69. So the plumbing question is not settled so much as **narrower**: the blob
of SVG bytes is refused, the decoded image is not. It belongs to an owner ruling before any code
leans either way; nothing in this record changes the skip.

### 13.3 `e3-atlas` — the 50,430 B compound-path chunk

The E3 encoding's representative chunk (one merged-run compound `<path>` per palette colour, WO-3A's
fixture, 128², deterministic LCG art) landed on the device **to the byte**: `ink` reads 16384 = 128²
against a `min = max` band, and the row passes the probe's strict reference check — the TV's raster
equals the reference pixels, not merely near them. Its cost is **96.4 ms per fresh window (91.4
decode, 3.4 draw)** against desktop's 33 ms: the same shape as the rest of the matrix, at Chromium
69's roughly-3× parse rate. **Fidelity was never the migration's problem, and this row is the
proof** — the panel draws vector atlas content exactly. §13.4 is why it still does not ship.

### 13.4 The two answers, kept apart

**Capability: YES.** The device renders all of SVG the program asked about, animates two of its
mechanisms, and rasterises a 50 KB atlas chunk byte-exact. A future **DOM-side** vector UI on the TV
— shell chrome, an icon, an ornament, something animated in the HTML around the canvas — is inside
this panel's ability, and no further measurement stands between the idea and a prototype.

**Atlas migration: NOT-WORTH-it — unchanged, and for a cost reason capability cannot touch.** The
game's pages are texture sources, not DOM images, and the SVG arm measured exactly that route on
this hardware ([2026-10-30-m7-svg/README.md](../../tools/input-probe/results/2026-10-30-m7-svg/README.md),
*Verdict — the SVG arm: NOT-WORTH-it for atlas migration*): the density pages cost **232–314 ms to
decode** (`svg-x2.67-e3` 2048×1024 at 232.5, `svg-x1-e3` 1024² at 314.2 — a bounded tax over the
PNG-8 class's ~100 ms), and the **stand-in page — the one a zone load actually needs — cost
2,002.2 ms to decode and 2,657.7 / 2,818.9 ms (p50 / p95) file → GPU against its PNG-8 twin's
224.0 / 365.7: Δ +2,434 ms, over R3-04's whole 2,000 ms budget by itself.** "The TV can draw SVG"
and "the TV should load its atlas as SVG" are different questions: the first is answered yes here,
the second was answered no on the device that matters, and §13.1's shape — the bill is parse, paid
on arrival — is the mechanism of that no.

### 13.5 The correction note, and what changes

Three findings are **older-engine answers overturning newer-engine claims**: SMIL inside `<img>` and
CSS keyframes inside `<img>` (desktop: frozen), and `createImageBitmap` of a decoded SVG image
(desktop: rejected). They are pinned to this unit's **Chromium 69** and to nothing else — webOS 5's
**Chromium 68** remains unmeasured for every row here, and modern desktop Chromium keeps the
frozen/refused behaviour the inventory recorded. §13's numbers obey the law of the whole document:
quote the device for the device, and never write another engine's answer as the general one.

**What changes: nothing ships.** No code, no budget, no format. The atlas stays PNG-8, the bench
keeps its SVG bitmap skip, and §12's cull verdict plus the migration verdict stand. What is added is
the record the owner asked for — the TVs render SVG, animate some of it, and are not the limiting
factor anyone assumed they were — beside the logs that say so. One September row ages well by the
way: §5's key table (measured 2026-09-15) saw no digits and no colour keys, and this session's
`Keys seen` carries **keyCodes 48–57** and `ColorF0Red`…`ColorF3Blue` (403–406) arriving as real
down/up pairs once registered — the arrival the bench's remote-key work (the digit aliases of
`b2e7018`, extended by `c0d21407`'s Play/Pause, Guide and Channel− bindings) is built on.

### 13.6 The same evening's ruler (for everything in §12 and above)

The bench session that closed three minutes before this matrix ran was the program's **first
same-pool PNG repeat** (Oct-29's `baeb005` and Oct-31's `b2e7018` carry one game code,
`356cdf76a8`), and it set the house noise floor: over **190 same-code pairs** the two-tick share
repeats within a **median spread of 3.2 points** (p90 11.6), the synced p95 within **8 % / 31 %**,
and a whole run drifts **1.8 points / 3 %**. §12's reads — and any §13.1 cost comparison of two
sessions — are now graded against that ruler: beyond it is a measurement, inside it is weather. The
receipts and the cull pair's floor-graded closure live in
[tools/input-probe/results/2026-10-31-m7-bench-pngfloor/](../../tools/input-probe/results/2026-10-31-m7-bench-pngfloor/).

### 13.7 The svg arm's second sample (owner drop `b7a68a6d`, wire 2026-10-29) — the verdicts, floor-graded

The outstanding repeat landed: session `rb-mvt2ahx6-xenx` (build `d4f9351+svg-e3`,
`gameCodeHash 356cdf76a8`, `svgEnc e3` — measured again at the write-up's tree, so it **pools with
§13.4's session** as `code:356cdf76a8|svg=e3`, GL 1 × 2 runs) plus its sibling `hb-mvt5x48z-0tid`
(`done: true`), in
[tools/input-probe/results/2026-10-31-m7-bench-svg-arm/](../../tools/input-probe/results/2026-10-31-m7-bench-svg-arm/)
— the README there holds the full write-up, the arm's floor, and the fresh
`analysis-svgpair.txt` / `analysis-arms.txt` (byte-identical on two runs). What the second sample
does to each §13/§12 claim:

- **The arm now has its own noise floor**: over 195 same-pool pairs the two-tick share repeats within
  a **median spread of 2.9 points** (p90 10.7), the synced p95 within **7 % / 24 %**, run drift 2.4
  points / 4 % — the §13.6 ruler's shape, reproduced on the SVG side. The Oct-31 folder's
  "the SVG arm still has no floor" is spent.
- **The frame-side A/B is a tie, floor-graded.** Pool medians (2×2, same game code): busy@640 PNG
  6.7 vs SVG 6.8 — **+0.1, within**; 1024x768n busy 59.9 vs 62.5 (+2.6, within), its worst 78.0 vs
  77.1 (−0.9, within); no deciding row near either p90. The pre-write draft's "SVG −3.6 at busy@640"
  and "big frames −9.8" reads **do not reproduce** at any table (the 3.1 is the PNG pool's
  `640x360n` row, one cell away) — suggestive single-sample headlines, spent by the second sample.
  §13's tiers are arm-independent: SVG busy@640 **+5.7 (+5.4 … +6.0)** against PNG's
  **+4.0 (+0.3 … +7.8)**, overlapping, same **performance-step** verdict.
- **The load verdict is strengthened, and it was never a noise question.** The clean-page class holds
  (x1 1024² decode **314.2 → 309.0** ms — the "194.6, tax gone" reading does not exist in the data;
  x2.67 232.5 → 224.1): a bounded ~220–315 ms tax over the png8 class's ~100, twice measured. The
  noisy-content class breaks the budget **twice**: the E3 stand-in page's file→GPU median
  **2,657.7 → 2,598.2 ms** (p95 2,818.9 → 2,911.6) against its PNG-8 twin's 224.0 → 205.4 — each
  SVG sample over R3-04's **entire 2,000 ms** budget **by itself**, and a median 30 % above a budget
  is arithmetic no noise floor grades. Keep the page-classes apart exactly as §13.4 does: density
  pages pay a bounded tax; a noisy-content page is the budget-bust. `createImageBitmap` of an SVG
  **blob** is refused again (0/8, `svg-bitmap-reject`), consistent with §13.2's narrowing.
  **Atlas migration: NOT-WORTH-it — unchanged, now two device samples deep.** Nothing ships; the
  atlas stays PNG-8; R3-04's estimates do not move (this session's PNG pages: cold 642 / change 281;
  the decode basis gets its sixth sample, **72.1 ms/MP**, band 72.1–76.3).
- **The cull closure reaffirms**: busy@640 cull is beyond-adverse on **every** sample — SVG
  +18.2 / +16.2 (pool knob +17.1, beyond the arm's 10.7), PNG +13.4 — with the per-frame facts
  identical to the sprite across arms (5,953–5,954 tagged, ~6,010 visited, ~1,200 off-view,
  82–92 bit-writes). §12's CLOSED verdict now rests on four pricing samples, not two.

## 14. The two open owner captures (runbook, 2026-10-31)

The §11.2 **M5** row and the **process-wide memory** figure that Tizen's 120 MB dev-install cap
binds against are the last unclosed items of the [tizen_optimize.md](../../tizen_optimize.md)
audit — its §8.4 "The two measurements the owner still owes", §9 P1 item 8: *"Owner captures
(instrumented, never run)"*. This section is the runbook for both. Every step runs from committed
state alone; the two things that genuinely wait on a first owner experiment — §14.2's on-device
`?page=` trigger and its process-RSS command — are marked loud, not papered over.

### 14.1 M5 — WebGL 1 vs WebGL 2, 60 s of the same stage (§11.2's row, the review's F8)

The review's row ([render-performance-review.md:366](render-performance-review.md)) asks for "two
dev builds differing only in `preferWebGLVersion` (the overlay prints the version it got)".
**No shipped build differs that way and none needs to:** since M3-02c the pin is a runtime switch
inside one dev build — the same A/B with the same bundle, both sides through the same GPU, driver
and frame loop, which is exactly what §11's "compare a millisecond only with another millisecond
measured on a monitor" law wants. The kit, end to end:

| Piece | Where |
|---|---|
| The switch (dev / test game builds) | [apps/tizen/src/boot/index.ts](../../apps/tizen/src/boot/index.ts) `:543` → `devWebGLVersion` (`:355-364`): `?gl=1` / `?gl=2` on the dev server, else `localStorage['shmup-cup:gl']` on the TV (`WEBGL_VERSION_KEY` `:320` — the TV has no query string), else no pin. A release build never calls it |
| Where it flows | `ShellOptions.preferWebGLVersion` ([packages/shell/src/boot/index.ts](../../packages/shell/src/boot/index.ts) `:913`) → boot resolves at `:1588`: a pin beats the saved GRAPHICS → RENDERER row; with no pin `auto` keeps both TVs on WebGL 1 (R6-04's Chromium ≥ 71 floor, decision W5-20 — the M7 is 69) → the renderer ask at `:1618` → [packages/render-pixi/src/renderer/index.ts](../../packages/render-pixi/src/renderer/index.ts) `:822`, `preferWebGLVersion: options.preferWebGLVersion ?? 1` — that line, and only that line, is what a human edits if two hard-baked builds are ever wanted (neither Tizen vite config carries a GL define) |
| The truth of what the engine gave | `renderer.webGLVersion` — printed as the overlay's `WEBGL` field by [packages/render-pixi/src/debug/index.ts](../../packages/render-pixi/src/debug/index.ts) `:927-929`, fed from `renderer.webGLVersion` by [packages/shell/src/debug/index.ts](../../packages/shell/src/debug/index.ts) `:603`. Read it before flying: it is the version got, not the version asked |
| The M5 row inside the guided kit | check id `M5` — "60 s in one stage on this WebGL version (repeat the session with ?gl=2)", passed by `bestStageSeconds >= 60` ([packages/shell/src/telemetry/index.ts](../../packages/shell/src/telemetry/index.ts) `:994`, `:1077`) |

**The procedure — one dev build, two passes on one monitor:**

1. Start the capture channel: `cd tools/input-probe && npm run log-server` (the game's guided
   render profile streams there since M3-02f — `PORT` 8787, `HOST` 0.0.0.0, `LOG_DIR`
   `tools/input-probe/logs/`, git-ignored; one summary line printed per window, the progress feed).
2. Build the game's dev bundle with the endpoint baked in —
   `VITE_REPORT_URL=http://<desktop-ip>:8787 pnpm --filter @shmup/tizen build:dev`
   (PowerShell: `$env:VITE_REPORT_URL="http://<desktop-ip>:8787"; pnpm --filter @shmup/tizen build:dev`).
3. Install and run (the owner's steps — sdb / Tizen CLI never run by an agent,
   [install-on-tv.md](../client/install-on-tv.md)): `TIZEN_PROFILE=<profile> pnpm --filter
   @shmup/tizen tizen:package`, then `TV_IP=<monitor-ip> pnpm --filter @shmup/tizen tizen:install`,
   then `TV_IP=<monitor-ip> pnpm --filter @shmup/tizen tizen:run`. Per
   [tizen-env.mjs](../../apps/tizen/scripts/tizen-env.mjs): `TV_IP` makes the script `sdb connect`
   it first, the sdb serial defaults to `<ip>:26101` (`TIZEN_TARGET` overrides), `TIZEN_CLI` / `SDB`
   point at the SDK binaries, and the app id is the game's `ShmpCupGam.ShmupCup`.
4. Unlock the tools on the remote: **Play/Pause, Ch+, Ch+, Ch+ — all four within 3 s**
   ([rendering-and-shell.md § Measuring on the TV](rendering-and-shell.md#measuring-on-the-tv)),
   then debug key **1** to hide the panel — a panel-on `REB` reading measures the overlay (§11.1's
   warning), and the same reason says hide it for the windows you keep.
5. **Arm A (WebGL 1):** in the remote Web Inspector on the game's app id set
   `localStorage['shmup-cup:gl'] = '1'` and relaunch — the same inspector flow the bench's WebGL-2
   pass uses ([install-on-tv.md](../client/install-on-tv.md) step 5.2, app id `ShmpCupBnc.RenderBench`
   there, `ShmpCupGam.ShmupCup` here). Verify the overlay's `WEBGL` reads **1**, fly one practice-stage
   section for ≥ 60 s straight (one checklist `M5` window), and let the profile POST land.
6. **Arm B (WebGL 2):** set the key to `'2'`, relaunch, verify `WEBGL` reads **2** before flying —
   if it still reads 1 the engine refused and that refusal *is* the M5 answer, recorded as such —
   then the same stage, the same section, the same ≥ 60 s. Clear the key afterwards (or set `'1'`):
   WebGL 1 stays the shipped default and the pin overrides the RENDERER row while it stands.
7. Collect: two `rp-<session>.jsonl` in `tools/input-probe/logs/`, then from `tools/input-probe/`
   `node results/analyze-render.mjs logs/rp-<A>.jsonl logs/rp-<B>.jsonl` — §11's pooled-histogram
   analyzer prints the §11.1/§11.2 tables; the `RENDER` percentiles and the `RAF` histogram per
   session are the row's content. Paste both arms (labelled GL 1 / GL 2) into §11.2's M5 cell, and
   copy the raw JSONL into `tools/input-probe/results/<date>-m7-render/` as evidence with a README,
   per the naming law in [results/README.md](../../tools/input-probe/results/README.md).

**Expected verdict — *within noise* (§8.4), because the bench already ran this A/B at scale:** the
resolution sweeps paired GL 1 × 2 against GL 2 × 2 in every campaign — 172 scenarios at the 1080p
window, 150 at the shipped `Auto` = 720p output, 90 at 540p (§12.3, the 150+172 the PNG-floor era
counts) — and graded the GL-2 gain **beyond noise only at the 1080p fill**, the mode `Auto` keeps
the TVs out of; that pairing is what recorded P4d **NOT NEEDED** (§12.6). The game-side M5 row
therefore retires the code's guess (the review's stated point) and ships nothing unless it
*disagrees* with the sweeps — and any disagreement is first graded against §13.6's ruler (3.2 pts
median / 11.6 p90, run drift 1.8 pts / 3 %). Note the honest scope of the sweeps: they ran on the
bench scene, not the shipped game's scene mix; that gap is the only thing this capture still adds.

### 14.2 Process memory vs the 120 MB dev-install cap

The cap: **dev-installed apps are capped at 120 MB** on Tizen, the store publishes no limit, so the
in-code budget is < 100 MB ([shmup_tech.md §2.5](../old/shmup_tech.md), the Samsung Memory FAQ it
links; the budget constant in
[packages/shell/src/memory/index.ts](../../packages/shell/src/memory/index.ts) `:144`). The
blind spot (§8.4, verbatim): *"every counted component is 3.4×+ inside … but the process total
(Chromium's own surfaces, the compositor planes outside our canvas) has never been read."* The
capture has two halves, and they are not the same instrument.

**Half one — what the game can self-report on-device (all committed since `37a821d0`).** The bench
widget grew four one-shot `hb-` measurement pages; each runs its scenario, sends one single-record
`hb-` session through the log server, and is done ([apps/tizen/src/bench/harb.ts](../../apps/tizen/src/bench/harb.ts)).
They answer the *renderer-scope* half of the memory question:

| Page | Record (phase) | What it measures |
|---|---|---|
| `?page=boot` | `hb-` boot row (S2) | Cold atlas cost on the set: the manifest's `file://` XHR (`assets/atlas/bench-x1.json` — the bench build ships the ×1 manifest bytes so this is the game's own route), every ×1 page through fetch → `createImageBitmap` with the `HTMLImageElement` fallback exactly as the shell loader does, each upload synced with `gl.finish()`, wall to the first drawn frame ([boot.ts](../../apps/tizen/src/bench/boot.ts); `?reps=` for repetitions) |
| `?page=soak` | `hb-` memory row (S2) | The long residency cycle — load pages, draw, release every texture, rest 1 s, repeat (default 1800 s, `?secs=` clamped to 10–7200) — with a heap sample **each cycle** and the resident-page count. Where `performance.memory` does not answer, the row says so (`heapMeasured: false` + the note — never a silent zero, [soak.ts](../../apps/tizen/src/bench/soak.ts) `:126-128`) |
| `?page=probe` | `hb-` probe row (S4) | The engine facts the budgets read against: WebGL 1 **and** 2 extension lists (this is where §8.4's `getSupportedExtensions()` ask is already carried), the ETC compressed-upload smoke, `deviceMemory` / core count, `OffscreenCanvas`, reduce-motion |
| `?page=input` | `hb-` input row (S3) | The fourteen remote keys with auto-repeat episode splitting + the `?gm=0` game-mode flag — the companion capture, not a memory row |

Two truths to hold apart while reading these rows: `performance.memory.usedJSHeapSize` (the kit's
`heapUsed()` read, [run.ts](../../apps/tizen/src/bench/run.ts) `:489-491`) is the **renderer's JS
heap only** — coarse on the TV, and it is the same source §12.6 row 5's 16.3–30.8 MiB came from;
and the page **deliberately never writes `rssBytes`** ([soak.ts](../../apps/tizen/src/bench/soak.ts)
`:15-16`) — that field exists on the wire for half two.

**The trigger — the one step no committed file closes yet.** The pages dispatch on `location.search`
([run.ts](../../apps/tizen/src/bench/run.ts) `:1212-1217`) and nothing in the shipped widget puts a
query on the TV's app URL: no committed document runs `?page=` on a set (that is exactly why §9 P1-8
says *instrumented, never run*). Establish it first: on the installed bench widget, navigate the
remote Web Inspector to the query-suffixed `index.html` (e.g. `…/index.html?page=soak`) and check
the page prints its `HARB S2 soak running` text block before measuring anything. If the firmware's
file handler drops the query, do not guess a channel — the desktop rehearsal is fully committed
(`pnpm --filter @shmup/tizen dev:bench` serves the same widget, query honoured, in a desktop
browser), and the first owner who stands an on-set channel up writes the working one into this row.
Everything downstream of the trigger is proven: the send path landed
`hb-` `done: true` rows three times from the ordinary matrix's rewind page (§13.7), and unknown page
ids fail loud on-screen, so a typo cannot silently run the 190-row suite.

**Half two — what needs Tizen Studio's dev tools: the process total.** The wire already reserves
its place: the `hb-` memory record carries an optional `rssBytes`
([telemetry/index.ts](../../packages/shell/src/telemetry/index.ts) `:2147`, validated `:3101`) for
"the supervisor pairing (the sdb carry item)" — a desktop-side reader stamping the app **process**
RSS beside the soak timeline. What that reader is has **no committed answer**: the connectivity half
is real (everything installs over `sdb` — `TV_IP` → `sdb connect`, serial `<ip>:26101`, per
[tizen-env.mjs](../../apps/tizen/scripts/tizen-env.mjs); [install-on-tv.md](../client/install-on-tv.md)
troubleshoots it), but the only memory read the docs carry is "Chrome DevTools over `sdb` →
Memory / `performance.memory`" (the review's M6 row) — renderer-scope again, the same blind spot.
The first owner run must establish, and record here: which `sdb shell` / Tizen Studio Device Manager
figure answers on firmware `M-KSU2SMWWC-2750.0` (note each unit's firmware, Settings → About, as
step 5.4 of the bench runbook says), its value at the soak's resident peaks and at its end, and
whether the process total stays under 120 MB — the number that turns §12.6 row 5's "met on every
measured component" into "met" plain and simple.

**Running the bench-side captures (committed commands).** Same log server as §14.1 (both prefixes
share one directory — the contamination law keeps them apart by their session ids), bench bundle
instead of the game:

```bat
set VITE_REPORT_URL=http://<LOGSERVER>:8787
pnpm bench:tv
set TIZEN_PROFILE=<profile>
pnpm bench:tv:package
set TV_IP=<the monitor's IP>
pnpm bench:tv:install
pnpm --filter @shmup/tizen bench:run
```

(`tizen-bench.mjs` sets `TIZEN_DIST_DIR=dist-bench` and `TIZEN_APP_ID=ShmpCupBnc.RenderBench` in
its own process — the bench installs next to the game and never replaces it,
[install-on-tv.md](../client/install-on-tv.md) step 4.)

**Collect and file.** `tools/input-probe/logs/hb-*.jsonl` →
`tools/input-probe/results/<date>-m7-harbench/` with a README carrying the numbers by hand — there
is **no analyzer for the `hb-` page rows** (`analyze-bench.mjs` speaks the `rb-` matrix;
`analyze-render.mjs` the `rp-` profile; the pngfloor README's hand-written session table is the
pattern to follow). The close-out targets of a completed run are exactly three: this section's two
status notes, §11.2's M5 cell, and §12.6 rows 4 and 5 — the blanks §8.4 names.

**Expected verdict — again *within noise*, and one live what-if.** Counted components sit 3.4×+
inside (§12.6 row 5: ≤ ~21 MiB counted GPU + ≤ 30.8 MiB heap on-device; the headless estimator
75.1–84.2 MiB/stage of the 100 MiB budget), so the soak should read a flat cycle-peak line and the
process read should land comfortably under the cap. The what-if: Samsung's own memory guide
documents the TV **killing** apps under pressure (tizen_optimize.md §8.3) — a process figure near
120 MB promotes that from a cited failure class to a live risk, and its mitigation is the
residency's, not the watchdog's (P0-3 covers the context-loss black screen, not a kill). A kill
observed during the soak is itself the finding — record session id, cycle number and the RSS trace.

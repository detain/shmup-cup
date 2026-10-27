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
is not carried by `rb-` records — it rides the same open owner capture as boot.

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

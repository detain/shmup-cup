# M7 TV render bench — resolution sweep, 2026-10-19/20

Raw `render-bench` sessions from the owner's Samsung M7, collected by
`tools/input-probe/server/log-server.mjs` and read with `results/analyze-bench.mjs`. This is the
resolution sweep that followed R0-03 (`../2026-10-19-m7-bench/`): the 172-scenario matrix of
`apps/tizen/src/bench/matrix.ts`, run as hands-off **campaigns** (`pnpm bench:tv:campaign`) of four
passes each — WebGL 1, 2, 1, 2 — so every WebGL version has a same-version repeat and the
analyzer has a noise floor.

**Status:** complete — three campaigns, one per canvas output: 1080p (the files in this folder),
720p (`out720/`) and 540p (`out540/`), twelve sessions in all, ≈ 14 h of TV time.

## The unit

| | |
|---|---|
| Model | `LS43AM702UNXZA` (M7, 43") — `sdb devices` serial |
| Address | `10.0.0.224`, desktop `10.0.0.2` |
| Platform | Tizen 5.5, Chromium 69.0.3497.128 (UA `69.0.3497.106/5.5`) |
| Firmware (SW version) | `M-KSU23MWWC-2750.0` |
| Display | 1920×1080 @ devicePixelRatio 1 |

## The matrix

- **15 resolutions**, each with **6 variants** (`busy`, `filter`, `mode7`, `crt-light`,
  `crt-full`, `worst`):
  - **scaled art** — the scene's sprites ×s with s = h/240 (8 densities): 384x216 … 960x640;
  - **native art** (suffix `n`, s = 1) — 480x320n … 1920x1080n.
- **22 knob rows** (`busy` and `worst`, each against its plain row):
  - upscale mode `fit` / `stretch`;
  - render interpolation (`interp`);
  - a smaller canvas backbuffer (`out720`, `out540`).
- **The decode page** (R1-05 B4), the run's 173rd page load.
- **Timing:** one scenario per page load, TV timing (10 s warm-up, 14 s measured, 6 s synced),
  ≈ 30 s a scenario, ≈ 90 min a pass.

## 1080p output — the canvas fills the window (build `9c7a594+`)

| File | Pass | GL | Scenarios | Decode | Note |
|---|---|---|---|---|---|
| `rb-mvfrt2du-7tz7.jsonl` | 1 | 1 | 172/172 | yes | one watchdog restart (see below) |
| `rb-mvfv806x-tj7z.jsonl` | 2 | 2 | 172/172 | yes | |
| `rb-mvfyep4t-59zy.jsonl` | 3 | 1 | 172/172 | yes | |
| `rb-mvg1le8z-xz93.jsonl` | 4 | 2 | 172/172 | yes | |

`campaign.log` is the orchestrator's log of the whole campaign: every device command, every payload
and the summary. Its pass-1 line says "missing 0–7" only because the orchestrator was restarted
after those records had arrived. The session file holds all 172.

```sh
node tools/input-probe/results/analyze-bench.mjs tools/input-probe/results/2026-10-19-m7-bench-resolutions/*.jsonl
```

### What the 1080p campaign says

- **Noise floor (same-GL repeats, 344 pairs).**
  - Two-tick share: spread median **2.7** points, p90 **11.6**; whole-run drift 1.7 points.
  - Synced p95: spread median 9%, p90 26%; drift 7%.
  - Two-tick share is the stable metric; synced p95 stays as noisy as R0-03 found it.
- **Plan §13 at 640×360, GL 1:** **performance-step** on all six variants in both runs.
  - Δ two-tick against 384×216: busy +7.2, filter +18.8, mode7 +11.5, crt-light +6.6,
    crt-full +13.8, worst +23.5 points.
  - 960×540 busy lands in the same tier ("viable on the M7", for after v2).
- **WebGL 1 vs 2:** WebGL 2 is better beyond the noise floor.
  - Two-tick share: 21 scenarios better, 0 worse, 151 within noise; overall −2.2 points against
    a 1.7-point drift band.
  - The wins are almost all native-art rows. Examples: 1280x720n-busy 64.9 → 38.0 %,
    800x600n-busy 17.9 → 4.9 %, 1024x768n-filter 78.1 → 50.8 %.
  - At 640×360 the synced p95 ratio, 0.79×, is within noise.
  - §13 outcome: a step to make WebGL 2 the TV default with a WebGL 1 fallback.
- **The output size dominates.**
  - On scaled rows the synced p95 stays at about 13–17 ms at every size, yet the two-tick share
    climbs with size.
  - With a 960×540 or 1280×720 backbuffer, 640×360-worst's two-tick share drops from about 60 %
    to under 11 %.
  - Caveat: those `out540` knob rows use `integer` scaling, which draws 640×360 at ×1 on a
    960×540 backbuffer (not filling the screen). The 720p and 540p campaigns below measure it
    properly, with `fit` filling the window.
- **Native art from 1280×720 up** is not viable: 38–100 % two-tick share on both GLs.
- **Decode (R3-04):** cold zone load ≈ 1.5 s, zone change ≈ 0.75 s — both within 2000 ms.

## 720p and 540p output — a smaller backbuffer for every row

The same matrix, rebuilt with a build-wide output (`VITE_BENCH_OUTPUT=1280x720` / `960x540`, see
`apps/tizen/src/bench/output.ts`):

- every scenario's canvas backbuffer is that size and the CSS still fills the window, so the TV's
  compositor upscales it to 1920×1080;
- rows scale into it with `fit`;
- a row whose frame is larger than the output is skipped without a launch (the indexes stay those of
  the 172-row matrix), so the sessions' "missing" lists are by design;
- the build id carries the output (`<build>@WxH`) and every record has `env.output`.

### 720p — `out720/`, build `f496802@1280x720`

| File | Pass | GL | Scenarios | Decode |
|---|---|---|---|---|
| `out720/rb-mvg4tafk-yli8.jsonl` | 1 | 1 | 150/172 | yes |
| `out720/rb-mvg7l9vw-bp11.jsonl` | 2 | 2 | 150/172 | yes |
| `out720/rb-mvgadjmz-uozj.jsonl` | 3 | 1 | 150/172 | yes |
| `out720/rb-mvgd5rof-fuwz.jsonl` | 4 | 2 | 150/172 | yes |

311 min, no restart. Skipped (22): the 1024x768n, 1280x960n and 1920x1080n rows and the knob rows
whose frame exceeds 1280×720.

### 540p — `out540/`, build `8ba0e7c@960x540`

| File | Pass | GL | Scenarios | Decode |
|---|---|---|---|---|
| `out540/rb-mvgfz6le-6f1y.jsonl` | 1 | 1 | 90/172 | yes |
| `out540/rb-mvghnikx-kmh4.jsonl` | 2 | 2 | 90/172 | yes |
| `out540/rb-mvgjbup4-0p8h.jsonl` | 3 | 1 | 90/172 | yes |
| `out540/rb-mvgl07um-qm3i.jsonl` | 4 | 2 | 90/172 | yes |

188 min, no restart. Skipped (82): 1024x576, 800x600, 1024x600 and 960x640 (scaled and native), the
native 1280x720n, 1024x768n, 1280x960n and 1920x1080n, and the knob rows whose frame exceeds 960×540.
Its build is newer than 720p's: the rebase of the 1080p results commit brought in master's R2-02,
R3-03 and R3-04 commits. The bench sources (`apps/tizen/src/bench/`) are the same, but the shared
packages changed — among them render-pixi's atlas code and R3-03's bullet art, drawn natively at v2
sizes.

Each folder's `campaign.log` is that campaign's orchestrator log.

```sh
node tools/input-probe/results/analyze-bench.mjs tools/input-probe/results/2026-10-19-m7-bench-resolutions/out720
node tools/input-probe/results/analyze-bench.mjs tools/input-probe/results/2026-10-19-m7-bench-resolutions/out540
# all three outputs, with the cross-output table:
node tools/input-probe/results/analyze-bench.mjs tools/input-probe/results/2026-10-19-m7-bench-resolutions/*.jsonl \
  tools/input-probe/results/2026-10-19-m7-bench-resolutions/out720 tools/input-probe/results/2026-10-19-m7-bench-resolutions/out540
```

### What the 720p and 540p campaigns say

- **Noise floor** (same-GL repeats):

  | Output | Two-tick spread median / p90 | Drift | Synced p95 spread median / p90 | Drift |
  |---|---|---|---|---|
  | 1080p | 2.7 / 11.6 points | 1.7 | 9 % / 26 % | 7 % |
  | 720p | 2.2 / 7.1 points | 1.8 | 8 % / 24 % | 2 % |
  | 540p | 1.5 / 6.4 points | 0.4 | 9 % / 23 % | 4 % |

- **The output size is the main lever.** Two-tick share % / synced p95 ms, both GLs pooled:

  | Row | 1080p | 720p | 540p |
  |---|---|---|---|
  | 384x216 busy | 0.2 / 12.3 | 1.0 / 10.3 | 0.4 / 10.9 |
  | 640x360 busy | 7.5 / 13.1 | 0.8 / 11.8 | 1.1 / 12.8 |
  | 640x360 filter | 22.6 / 17.1 | 0.2 / 14.3 | 0.7 / 14.3 |
  | 640x360 mode7 | 10.4 / 12.8 | 0.3 / 12.9 | 0.7 / 12.9 |
  | 640x360 crt-light | 8.8 / 13.7 | 0.4 / 13.3 | 0.5 / 11.3 |
  | 640x360 crt-full | 42.3 / 12.5 | 0.2 / 11.6 | 1.1 / 13.1 |
  | 640x360 worst | 59.5 / 16.0 | 11.3 / 15.9 | 1.8 / 14.8 |
  | 960x540 busy | 37.5 / 13.8 | 8.8 / 14.1 | 0.3 / 11.9 |

  - The two-tick share — the frames that miss a vsync — collapses once the backbuffer is no longer
    1920×1080: the M7's cost is the full-screen fill, not the 640×360 scene.
  - Synced p95 moves little with the output (within about 3 ms): the scene's own render time is
    much the same either way.
  - 720p already removes almost all of it; 540p only helps further on the heaviest rows
    (640x360-worst 11.3 → 1.8 %, 960x540-busy 8.8 → 0.3 %). A few light native rows are 1–4
    points worse at 540p than at 720p, within or just above the noise.
  - 960x540-worst still misses 38.8 % at 540p: that row is beyond the M7 at any output.
- **WebGL 1 vs 2 depends on the output.** GL 2's win at 1080p (21 better, 0 worse) is a fill-rate
  win and fades with the backbuffer:
  - 720p: two-tick 6 better / 0 worse / 144 within noise, −0.6 points (within the band); synced
    p95 1 better / 4 worse, 0.98× — "mixed", no verdict.
  - 540p: two-tick 3 better / 1 worse / 86 within noise, −0.1 points; synced p95 1 better /
    2 worse, 0.97× — "within noise", no verdict.
  - So the §13 WebGL 2 step matters only while the game draws a 1080p backbuffer.
- **Plan §13 at 640×360:** at 1080p every variant is performance-step on both GLs. With a 720p
  output crt-full (both GLs) and busy / mode7 (GL 2) drop to tv-profile; at 540p crt-light does
  (both GLs) and the Δ against 384×216 is within ±4 points on every variant. 960×540 busy at 540p
  output is tv-profile on GL 2 and performance-step on GL 1, at 0.3–1.1 % two-tick.
- **Decode (R3-04)** does not depend on the output: cold zone load 1538 ms (720p) / 1539 ms
  (540p), zone change 742 / 766 ms — the same as at 1080p, inside 2000 ms.
- **Caveat:** each output is one build (`9c7a594+`, `f496802@1280x720`, `8ba0e7c@960x540`), so the
  build is confounded with the output. 1080p → 720p changed, in code, essentially only the bench's
  output feature (plus R2-02's then-neutral `WORLD_SCALE` constant);
  720p → 540p also carries master's R2-02 / R3-03 / R3-04 commits (see the 540p table). The size of
  the 1080p → 720p drop, with nothing else changed, is what makes output the lever; the smaller
  720p → 540p differences are not attributable to the output alone.

## Anomalies

- **18:09 (pass 1): the M7 lost power.** A faulty surge protector cut it after scenario 70.
  - The owner moved it to another supply and switched it on.
  - The orchestrator's watchdog relaunched the bench at 18:13:49. The app re-sent scenarios 69–70
    and went on at 71.
  - No record was lost; the resumed scenario used one of its three launch attempts.
- **The first launch re-sent R0-03's last session.** Its unsent decode record from
  `rb-mvfo9erp-57tj` arrived first and was briefly counted as pass 1.
  - The orchestrator was stopped and fixed: it now ignores payloads of any other build id.
  - It was restarted with `--no-install`. Nothing in these sessions is affected.
- **The 720p and 540p campaigns** ran without a restart or an anomaly.

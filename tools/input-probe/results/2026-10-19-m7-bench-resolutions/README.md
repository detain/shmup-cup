# M7 TV render bench — resolution sweep, 2026-10-19/20

Raw `render-bench` sessions from the owner's Samsung M7, collected by
`tools/input-probe/server/log-server.mjs` and read with `results/analyze-bench.mjs`. This is the
resolution sweep that followed R0-03 (`../2026-10-19-m7-bench/`): the 172-scenario matrix of
`apps/tizen/src/bench/matrix.ts`, run as hands-off **campaigns** (`pnpm bench:tv:campaign`) of four
passes each — WebGL 1, 2, 1, 2 — so every WebGL version has a same-version repeat and the
analyzer has a noise floor.

**Status:** the 1080p campaign is complete (below); the 720p and 540p campaigns (`out720/`,
`out540/`) run after it and are added when they land.

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
    960×540 backbuffer (not filling the screen). The `out540/` campaign below measures it
    properly, with `fit`.
- **Native art from 1280×720 up** is not viable: 38–100 % two-tick share on both GLs.
- **Decode (R3-04):** cold zone load ≈ 1.5 s, zone change ≈ 0.75 s — both within 2000 ms.

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

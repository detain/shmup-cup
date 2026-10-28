# M7 TV render bench — 2026-10-29 session (build `baeb005`, game code `356cdf76a8`, GL 1) — the first clean `done: true` completion

The owner's first sit on the post-video build, on the Samsung M7. It is the **first render-bench
session that closes itself**: the whole 190-scenario matrix arrives as a **single batched payload**
(`seq: 1`, `done: true`, 152 KB) rather than the ~190 per-row POSTs whose closing `done` the Oct-27
and Oct-28 runs never fired. The analyzer therefore prints the run as **`complete`** for the first
time — not the cosmetic "incomplete" of the two prior folders, where every scenario landed but the
`done` flag rode a separate (missing) request. The `done` quirk is gone with the batching.

## Session identity

| | |
|---|---|
| Session | `rb-mvrunonc-d6o7` (single batched payload, `seq: 1`) |
| Build (`env.buildId`) | `baeb005` — short SHA of `baeb0056`, *build(turbo): the game-code-hash input for the bench tasks* |
| Game code (`env.gameCodeHash`) | **`356cdf76a8`** — the skip-ledger / analyzer pool key (see *The pool identity*) |
| GL | WebGL 1 (`webGLVersion: 1`); no GL 2 pair ran |
| Scenarios | **190 / 190 measured, `done: true`, run complete** — first clean completion since the wire era |
| Zone load | cold **665 ms** / change **282 ms** (both inside R3-04's 2000 ms) |

`356cdf76a8` differs from the Oct-28 session's game code `d52805a51a` (its `harbench`/stills build):
the **video package changed shipped game code** between the two builds (VIDEO default-ON, the
DISPLAY→VIDEO row and its telemetry, in `packages/shell`/`render-pixi` — all hashed paths). So this
build's ledger started empty: there was no same-code run to inherit, and the honest thing was the
**full 190-row run** — which is what the owner's first sit did. The skip-ledger offer applies to
the **next** sit on this same hash, not this one (see *What this unlocks*).

## The unit

| | |
|---|---|
| TV | Samsung M7 (Tizen 5.5, Chromium 69.0.3497.106) |
| Address | 10.0.0.224 |
| Display | 1920×1080 @ devicePixelRatio 1; the canvas fills the window (no `env.output`) |
| Bundle | `apps/tizen/dist-bench/`, PNG arm (no SVG `VITE_BENCH_SVG`), 190-row matrix |

## The files

| File | What it holds |
|---|---|
| `rb-mvrunonc-d6o7.jsonl` | The render-bench run — **one line**: a single batched payload, `kind: render-bench`, `seq: 1`, `done: true`, `env.buildId baeb005`, `env.gameCodeHash 356cdf76a8`, `results` 191 rows (the 190 matrix scenarios + the `standin-zone` row) and the `decode` record folded into the same POST. |
| `analysis-190.txt` | The full analyzer table set for that file (see regeneration). |

### Regeneration

The committed table was re-generated from the analyzer **at this commit (`3e6f26de`)** and is
byte-identical on two consecutive runs (the idempotency gate). From this folder:

| Command | Produces |
|---|---|
| `node ../analyze-bench.mjs rb-mvrunonc-d6o7.jsonl --full > analysis-190.txt` | `analysis-190.txt` |

## The launch and what it proves

This is the owner's first time sitting at the TV on a build whose game code carries the video
package. Three things are settled by the shape of the run rather than by any single number:

1. **The `done` quirk is closed by batching.** Oct-27 and Oct-28 both printed "incomplete" — the
   render-bench session's final `done` POST never fired because the run handed off to the rewind row
   (the Oct-28 README's *launch and the `done` quirk*). Tonight the matrix ships as one batched POST
   that carries `done: true` itself, so the header reads `complete`. The wire is now self-closing.
2. **The single-payload wire survives.** 191 rows + the decode record in one 152 KB POST parses
   cleanly through the server and the analyzer — no per-row arrival order to reconstruct.
3. **The game-code identity is live on hardware.** The payload carries `env.gameCodeHash` — the
   field the BENCSKIP lane added to `RenderBenchEnv`. This is the first real-device session whose
   analyzer pool key is `code:356cdf76a8`, not a date-string buildId.

## Headline numbers

Two-tick share (GL 1, 640×360 plain): **busy 8.3**, filter 24.9, mode7 13.3, crt-light 17.4,
crt-full 42.0, worst 56.9. The 384×216 baseline reads 0.5 / 4.1 / 2.8 / 6.3 / 30.5 / 33.8.

**640×360 busy 8.3 % is the best of the three-session hardware series** — Oct-27 read 12.3, Oct-28
14.5, tonight 8.3 — and it lands back on the **low edge of Oct-19's GL1 band (8.3–12.2)**. Two
caveats keep that from being a speed verdict: it is **one run** (see *Not done here*), and the
synced busy **p95 rose to 24.8 ms** (Oct-27 13.6, Oct-28 16.8) even as the two-tick share fell — the
M7's rAF jitters to ~30 ms p95 on its own, so the two-tick reading and the p95 disagreeing within a
run is the noise talking, not a regression. Read it as "the best two-tick sample yet", not a
beaten floor.

**§13 at 640×360** (each row against the same run's 384×216): **all six variants performance-step**
— Δ two-tick points busy +7.8, filter +20.8, mode7 +10.5, crt-light +11.1, crt-full +11.6, worst
+23.2; synced p95 24.80 / 19.50 / 21.70 / 16.60 / 15.10 / 19.40 ms. The analyzer's high-bit note
stands: **960×540-busy is the same §13 tier as 640×360** (busy +33.1, worst +63.2) — *960×540 is
viable on the M7* once the frame budget moves.

**Knobs — the reduced-output lever scales with size.** Output capping is the only knob that moves
960×540 at all:

| Knob at 960×540 | busy (2t / p95) | worst (2t / p95) |
|---|---|---|
| out540 | 33.6 → 3.3 (−30.2), 0.95× | 96.9 → 26.2 (−70.7), 0.83× |
| out720 | 33.6 → 5.9 (−27.6), 0.94× | 96.9 → 33.2 (−63.7), 0.86× |
| fit / stretch / interp | −4.1 / −1.5 / +2.6 | 0.0 / −3.2 / −1.2 |

`out540` at 960×540 takes **worst −70.7 points** (96.9 → 26.2) — the biggest single lever in the
run, and the one that scales: at 640×360 the same row is busy −7.8 (→0.5), worst −54.3 (→2.7), and
at 1920×1080n the output is already saturated so the knob reads ≈ 0.0. fit/stretch still cost real
points at the odd window sizes (800×600 worst-stretch +35.5, busy-stretch +10.0); interp stays
near-neutral (±0.6…+2.6).

**The video knob wins every size on p95.** All **eight** video p95 ratios are below 1.0 — **0.75–0.94×**
— so every video row lands under its plain row's p95:

| Video row | 2-tick Δ | p95 (plain → knob) |
|---|---|---|
| 640×360 busy-video | −2.3 (8.3 → 6.0) | 24.8 → 18.5 (0.75×) |
| 640×360 worst-video | −2.6 (56.9 → 54.3) | 19.4 → 14.8 (0.76×) |
| 960×540 busy-video | +3.7 | 15.9 → 14.2 (0.89×) |
| 960×540 worst-video | +1.4 | 18.3 → 14.3 (0.78×) |
| 1280×720n busy-video | −21.9 (82.5 → 60.6) | 36.4 → 30.8 (0.85×) |
| 1280×720n worst-video | +1.5 | 40.0 → 37.5 (0.94×) |
| 1920×1080n busy-video | +0.1 (saturated) | 59.8 → 54.4 (0.91×) |
| 1920×1080n worst-video | +0.4 (saturated) | 69.7 → 62.9 (0.90×) |

This is the **second build** where the video p95 win is not one row deep: Oct-28 found all eight
ratios under 1.0 (0.75–0.96×), and tonight repeats it (0.75–0.94×). The two-tick split is the same
shape too — video **wins** busy at 640×360 (−2.3) and big at 1280×720n (**−21.9**), **costs** +3.7
busy at 960×540, and is point-neutral where the frame is saturated (1920×1080n). Still unjudged
against a same-build noise floor (one run here), but the **direction is now two independent builds
deep**.

## The video-decode rows — `win.Video` is not exposed on the M7 (device evidence)

The four R7-VID clip rows in the decode scenario — `video-attract-ambient`, `video-warn-zone-a`,
`video-title-sting`, `video-ark-sailing` (640×360 avc1, 0 KB attributed) — report **`video surface
unavailable`**, all four `—` across the file→GPU columns. The surface-decode path the video package
added did not open on this TV, exactly as on Oct-28: **two consecutive hardware sessions, every
clip row, no exception.** That is the device evidence that the M7's Chromium 69 does not expose the
WebCodecs-style video-surface decode this scenario reaches for — the same conclusion the
`v2.0.x` surface-decode fix follow-up is built to answer. It is not a number to read; it is the
scenario recording a capability gap. The clips ride in the bundle; the M7 simply will not decode the
surface.

## Decode and upload — file to GPU (for R3-04)

Three measured pages, 8 reps each, WebGL 1 (`HTMLImageElement.decode()` yes, `createImageBitmap` yes):

| Page | Shape | File→GPU p50/p95 (first) | Bitmap decode p50/p95 | Bitmap upload p50/p95 |
|---|---|---|---|---|
| standin-zone-a | 2048×1024 PNG-8, 344 KB | 210.3 / 360.9 (first 360.9) | 71.0 / 97.5 | 22.9 / 41.0 |
| common | 2048×1024 RGBA, 328 KB | 368.0 / 412.5 (first 376.1) | 146.7 / 161.4 | 23.9 / 34.9 |
| zone-a | 512×512 RGBA, 35 KB | 86.9 / 116.9 (first 80.0) | 18.1 / 20.8 | 3.6 / 3.7 |

R3-04 zone-load estimate: **cold 665 ms**, **zone change 282 ms** — both inside the 2000 ms budget;
PNG-8 decode ≈ **75.6 ms per megapixel** on the measured stand-in page (Oct-28's 73.8, Oct-27's
76.3 — the same basis across three builds).

## The pool identity — `code:356cdf76a8`

Per the BENCSKIP lane's A5, the analyzer pools a session under `code:<gameCodeHash>` when its
payload carries a non-empty `env.gameCodeHash`; this is the first hardware session to exercise that
key with a real hash (`code:356cdf76a8`). Its two predecessors are **different pools** — never to be
read as noise-floor partners of these rows: Oct-27's tree `3d82e434` hashes `89afe15f16`, Oct-28's
`4b37d123` hashes `d52805a51a`. The three game codes differ, so the "best-of-series" line above
compares three single-run pools for direction, not one pool for a floor. The `356cdf76a8` pool
itself has **one run** until it is repeated.

## What this unlocks — the cull-pair forecast

The **four cull rows** the owner folded in from the spike (`640x360-busy-cull`, `640x360-worst-cull`,
`960x540-busy-cull`, `960x540-worst-cull`, matrix indices 190…193) are **bench-side only**: they live
in `apps/tizen/src/bench/`, which `scripts/game-code-hash.mjs` **does not hash**. The master tip this
table is regenerated from (`3e6f26de`, which carries the cull pair) **still computes to
`356cdf76a8`** — verified, not projected. So:

- a post-WO2 **PNG-arm** bench rebuild carries the same `356cdf76a8` and joins this session's pool;
- the M7's banked full run (this session's 190 rows marked done under `code:356cdf76a8`) means the
  owner's next **Enter** offers exactly those **4 new rows**, ~10 min, not the whole matrix;
- those 4 rows then **price themselves against this session's plain rows in the same pooled table** —
  `640x360-busy-cull` against tonight's **busy 8.3 / p95 24.8**, `640x360-worst-cull` against
  **worst 56.9 / p95 19.4**, and the 960×540 pair against **busy 33.6** and **worst 96.9**. **These
  busy/worst rows are the comparison bed the cull walk is measured on.**

The desktop spike found the cull mechanism **adverse** (Δ p95 **+1.200 ms**, only 8 of 1,727 visible
sprites off-frame to catch — `v20x-SPIKE-report.md`). These rows are how the M7 decides whether that
holds on the TV, and this session is the honest, same-code baseline the decision is made against.

## Not done here

- **One run per version — no noise floor.** The analyzer prints "No noise floor (one run per
  version): every knob difference is unjudged" and "no WebGL version has 2 runs". The video p95 win
  is now two builds deep but **still not floor-tested on *this* code**; a **GREEN full-suite** pass
  (or `F` off-TV) on `356cdf76a8` is what starts the floor, and it is a first-class equal to Enter —
  a fresh noise-floor sample, nothing overwritten. Until then every `—` in the knob tables is
  unfilled and the small deltas stay directions.
- **No GL 2 pair ran** — the GL1-vs-GL2 section is empty by absence, not result.
- **The video surface is unmeasured on hardware** for the second session running — the fix is the
  `v2.0.x` surface-decode follow-up, not this lane.
- Owner's packaging and the Tizen install of the bench widget are, as ever, outside this lane.

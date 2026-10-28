# M7 TV render bench — 2026-10-27 session set (v2.1.0-era build, GL 1)

The owner's second M7 bench night, collected by `tools/input-probe/server/log-server.mjs`
and read with `results/analyze-bench.mjs`. The full 174-scenario run of the new build is here —
together with **two legacy artifacts the run surfaced**: the TV's cached old-bench session that
the first launch reposted into, and a 4-payload stub of an aborted second launch. This folder
is the write-up of all three; the analyzer also gained a fix this night forced (below).

## The unit

The same Samsung M7 as [`2026-10-19-m7-bench/`](../2026-10-19-m7-bench/README.md):
`LS43AM702UNXZA` at `10.0.0.224`, Tizen 5.5, Chromium 69 (the payloads' UA reads
`69.0.3497.106/5.5`), display 1920×1080 @ devicePixelRatio 1. The firmware was **not** read
again tonight — take it as Oct-19's `M-KSU23MWWC-2750.0` unless a Settings screenshot says
otherwise.

## The files

| File | Build (`env.buildId`) | GL | Payloads | What it is |
|---|---|---|---|---|
| `rb-mvr96ztw-et2k.jsonl` | `m7-2026-10-27` | 1 | 176 | **The full run** — 174/174 scenarios + the stand-in-zone record + the decode record, 22:25:23 → 23:54:28 (~89 min) |
| `rb-mvgl07um-qm3i.jsonl` | `8ba0e7c@960x540` (+ 1 stray `m7-2026-10-27` header) | 2 | 92 | **The old-bench replay** — the TV's cached Oct-20 run (91 payloads, complete with its done POST) plus, on line 92, the stray header the *first launch tonight* posted into it |
| `rb-mvr8nd72-4wxq.jsonl` | `m7-2026-10-27` | 1 | 4 | **The aborted second launch** — 4 scenario payloads, 22:10:07 → 22:11:39; annotate only, nothing to read |

The two tables committed here reprint the analyzer's verdicts:

| Table | Command that regenerates it |
|---|---|
| `analysis-full.txt` | `node results/analyze-bench.mjs results/2026-10-27-m7-bench/rb-mvr96ztw-et2k.jsonl --full` |
| `analysis-old.txt` | `node results/analyze-bench.mjs results/2026-10-27-m7-bench/rb-mvgl07um-qm3i.jsonl --full` |

(Both run from `tools/input-probe/`. The committed tables were re-generated from the analyzer at
this commit and are byte-identical to those runs.)

## The launch story (owner, 2026-10-27 evening)

Three loads, as Oct-19's README predicted they would behave — the **resume trap** is real and
this folder holds its evidence:

1. **First load** — launching the new bundle with the old run's state still stored made the bench
   *resume* under the **old session id**: it posted its start header (a `m7-2026-10-27` env,
   `results: 0`) into `rb-mvgl07um-qm3i.jsonl` (that file's line 92) instead of starting its own
   session. The server files by session id, so the stray landed in the old file.
2. **Second load** — started a fresh session (`rb-mvr8nd72-4wxq`) but was aborted after four
   scenarios.
3. **Third load** — the full matrix: all 174 rows, the stand-in-zone page, the decode record
   (`rb-mvr96ztw-et2k`). Only the final **done POST is missing** — the analyzer therefore prints
   the run as **incomplete**. That is cosmetic: every scenario landed, only the closing
   flag never posted.

## The old session — a legitimate extra legacy baseline, read with care

Lines 1–91 of `rb-mvgl07um-qm3i.jsonl` are the Oct-20 2026 run of `8ba0e7c` (`bench(tv): M7
resolution sweep`, 2026-10-19) at the **960×540 backbuffer output** (GL 2, the pre-video 172-row
matrix): **90 of 172** scenarios measured — the rows whose frame is larger than the output were
skipped, the analyzer's documented `—` rule. It was never in the repo's Oct-19 folder; it is a
real legacy baseline, and `analysis-old.txt` prints it on its own.

**Do not read its two-tick numbers as speed.** At 640×360 it reads busy 1.6 %, filter 6.5 %,
mode7 0.5 %, crt-light 1.1 %, crt-full 0.1 %, worst 2.9 % — low because the **backbuffer was
960×540**, a reduced output, not because GL 2 or the panel was fast. Its §13: busy carries only
+0.5 pts over the same-run 384×216 baseline yet p95 14.00 ms → **performance-step** anyway
(five of six variants; crt-light alone reads tv-profile). Its decode section (synthetic pages,
the pre-stand-in basis): cold **1539 ms**, zone change **766 ms**.

## The new run — headline numbers (single run per scenario; no repeat, so small deltas are unjudged)

The 640×360 block sits **inside the Oct-19 GL1 band** — busy 12.3 % (band 8.3–12.2, +0.1 pt over),
filter 25.9 (21.4–26.3), mode7 14.9 (9.0–15.6), crt-light 11.7 (7.2–14.3), crt-full 45.6
(42.2–45.2, +0.4 over), worst 63.5 (60.3–64.6). The ordering and the pressure points (CRT full,
worst) reproduce exactly. Full per-size tables are in `analysis-full.txt`.

**§13 at 640×360 (Δ vs the same run's 384×216): all six variants are performance-step** —
Δ two-tick points busy +9.5, filter +21.2, mode7 +9.6, crt-light +11.4, crt-full +12.8,
worst +26.2; synced p95 13.60 / 15.50 / 14.40 / 13.80 / 12.60 / 13.60 ms. The analyzer's high-bit
note fires: 960×540-busy is the **same tier** as 640×360-busy — viable on the M7.

**Knobs** (paired per run against their plain row at the same size; single run → every call reads
`—` for the noise verdict):

- **The reduced-output knobs are the big wins**: at 640×360, `out720` takes busy −10.2 pts
  (0.80× the p95) and worst −52.5; `out540` busy −12.3 and worst −63.1. At 1920×1080n the same
  rows read ≈ 0.0 — the size is saturated, the knob cannot save it.
- **fit / stretch cost real points at the odd sizes**: worst-fit +25.5 (800×600) / +14.9
  (854×480); worst-stretch +32.9 (800×600) / +15.6 (854×480); busy-fit +5.2 / +2.5; the same
  knobs at 640×360 read −1.5 / −3.8 (free there).
- **interp ≈ 0** everywhere (busy +0.6…+1.4, worst −1.7…0.0) — render interpolation is
  point-neutral on the M7, as Oct-19 showed.
- **The video knobs** (the rows the old 172-matrix did not have): `busy-video` −4.7 pts and
  `worst-video` −4.5 at 640×360 — they land **below** their plain rows. A negative knob cost is
  either noise or the video path replacing work the plain scene does; with one run there is no
  noise floor to call it. Re-run against a repeat before believing it.

**Decode** (the measured stand-in pages — `standin-zone-a` 2048×1024 PNG-8, `common` 2048×1024
RGBA, `zone-a` 512×512 RGBA, 8 reps): cold load **654 ms**, zone change **286 ms**, both inside
R3-04's 2000 ms; PNG-8 decode ≈ **76.3 ms per megapixel**. This is a **different basis** from
Oct-19's 1492–1495 ms — those were the synthetic 2048² shape estimate, these are the shipped
stand-in page shapes. The two numbers do not contradict each other; the measured basis is what
the TIZEN-OPTIMIZE `createImageBitmap` item feeds on. The stand-in-zone draw itself: render
36.80 ms, synced 0.10 ms p50/p95, 5 draws, 1 page.

## The contamination law — and the analyzer fix this folder forced

**A folder-aggregate analyze must never mix an old-build session with the new one.** Tonight's
first launch proved why: the stray line-92 header carries the **new** buildId with the **old**
session's payloads. `analyze-bench.mjs` attributed each session's env from its **last** payload
and grouped a campaign by output resolution alone — so the Oct-20 session read as
`m7-2026-10-27` at `1920x1080 (window)` and its 960×540-output GL2 rows merged **into the new
build's tables**: knob calls judged against the new runs' noise floor, a GL1-vs-2 section across
builds, an old-vs-new "cross-output" comparison. All false.

The fix shipped with this commit:

- a session's env is the **modal** env of its payloads (`modalEnv` — majority by JSON count, ties
  to the later payload), so one stray header cannot re-attribute 91 honest payloads;
- a campaign groups by **(build, output)** — each build's runs get their own output block
  (multi-build campaigns label the block `[build <id>]`);
- noise pooling and the cross-output comparison are **within one build** only; with no build
  contributing two resolutions the section prints a refusal instead of a cross-build table.

**Proof of no restated history** (the law that a changed analyzer must not silently rewrite the
past): re-running the fixed analyzer is **byte-identical** for the new-build table and for the
whole committed Oct-19 folder. The only diffs are on tonight's two odd files — the old-file run
(mislabeled `90 of 174` / `Build m7-2026-10-27` / `Output 1920x1080` **before**; correct
`90 of 172` / `Build 8ba0e7c@960x540` / `Output 960x540` **after**) and the folder run (the old
GL2 rows leave the new build's window block, which then carries its two real GL1 sessions and a
real noise floor — sync p95 median 16 % / p90 21 %, two-tick median 2.7 pts; the old session
becomes its own `[build 8ba0e7c@960x540]` block whose knob calls read *no noise floor, one run
per version*; the cross-output section becomes the refusal). Those diffs are **corrections of
attribution, not of measurement** — every row's numbers ride unchanged.

The gate: `test/integration/tv-render-bench.test.ts` carries five new cases for the law
(`pnpm exec vitest run --project integration test/integration/tv-render-bench.test.ts
--no-file-parallelism` — 25/25 at this commit).

## Not done here

- No repeat pass tonight — the new run is one window per scenario, so the window block's noise
  floor comes from the **aborted launch's** two GL1 sessions' pairs, not from a full repeat.
  Small deltas (and the negative video rows) await a second full campaign.
- The missing done POST was not replayed (the jsonl files are read-only artifacts). A future
  analyzer run may gain a `--force-complete` flag; tonight the README says what the flag lacks.
- v2.1.0's render budgets and any `docs/dev/input-probe-results.md` prose ride the closeout,
  not this lane.

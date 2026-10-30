# M7 TV render bench — 2026-10-30 `2026-10-30-m7-svg` session (build `3e6f26d+svg-e3`, game code `356cdf76a8`, GL 1) — the first **SVG-armed** run, and the cull pair

Two names, both kept honestly. The folder is the owner's — plan v20x R-SVG calls it the **Oct-30**
session and `2026-10-30-m7-svg` is his label; the `results/<date>-m7-bench/` naming law (root
`README.md`, plan R0-03) is followed with the arm suffix in place of `-bench` because this session is
not a plain bench run — it is the E3 SVG **arm** plus the four **cull** rows. What the wire actually
carries is stated in this file, not papered over: every payload's server receipt stamp runs
**2026-10-28T12:45:25.4Z → 14:26:20.7Z** (08:45:25 → 10:26:20 UTC−4, ~100.9 min), and the sibling
`hb-` payload 1.4 s later — the machine's own dates, left exactly as received.

The run answers plan R-SVG's whole question in one sit. The bench widget was rebuilt with
`VITE_BENCH_SVG=e3` — the three density atlas pages emitted as E3 SVG (`apps/tizen/scripts/bench-svg.mjs`:
one compound `<path>` per colour, runs merged into `crispEdges` rects, rasterising pixel-identical to
the PNGs) — and the **same shipped game code** as the Oct-29 PNG session still hashes to
`356cdf76a8` (the bench is not hashed by `scripts/game-code-hash.mjs`), so the two sessions are the
cleanest A/B the bench has ever produced: **one pool key apart, nothing else different** — same TV,
same game code, same matrix, only the atlas-page encoding (and the four new cull rows).

## Session identity

| | |
|---|---|
| Session | `rb-mvs3tv2h-b949` — 197 payloads, `seq` 1..197 contiguous, one distinct `env` |
| Build (`env.buildId`) | `3e6f26d+svg-e3` — the WO-1 arm over `3e6f26de` (the SVG arm's rows + per-pool skip ledger), id suffixed by the arm |
| Game code (`env.gameCodeHash`) | **`356cdf76a8`** — identical to the Oct-29 PNG session: the A/B bed |
| Arm (`env.svgEnc`) | `e3` — first non-`png` value ever received from hardware |
| GL | WebGL 1 (`webGLVersion: 1`); no GL 2 pair ran |
| Matrix | `env.scenarios: 194` — the 190 plain rows **plus the four cull rows** (indices 190…193) |
| Rows | 196 unique scenario rows: 194 matrix + `standin-zone` (195) + **`standin-zone-svg`** (196, the arm's extra page load) |
| Header row | analyzer: **195 of 194 measured, run incomplete** — the wire-era count class (below) |
| Zone load (PNG pages) | cold **684 ms** / change **302 ms** — both inside R3-04's 2000 ms |
| Completion record | `hb-mvs7jiqh-ab25.jsonl` — one `harbench` payload, `done: true` (the second ever on-wire) |

## The files

| File | What it holds |
|---|---|
| `rb-mvs3tv2h-b949.jsonl` | The render-bench run — 197 lines, one payload per scenario in the wire-era shape (the Oct-28/29 batches were a different arrival), 196 unique scenario rows, and the `decode` record (scenario index 194, 12 pages × 8 reps) folded into one payload. No `done` on this session — see *The wire facts*. |
| `hb-mvs7jiqh-ab25.jsonl` | **One payload, `kind: harbench`, `done: true`** — phase `S1`, `gameMode: true`, same `env` (`buildId 3e6f26d+svg-e3`, `gameCodeHash 356cdf76a8`, `svgEnc e3`). The second `hb-` record on-wire after Oct-28's `hb-mvrk5wgl-ik7a`. |
| `analysis-ab.txt` | The **cross-session A/B table set**: the Oct-29 PNG session and this SVG session in one analyzer run — the two arms printed as two pools, plus this session's full per-scenario report (two-tick, synced, §13, knobs with the cull pair and its per-frame facts, decode with the SVG pages). |

### Regeneration

From `tools/input-probe/results/` at this repo state (the analyzer last changed in `3e6f26de`, the
arm's own WO-2 commit):

| Command | Produces |
|---|---|
| `node analyze-bench.mjs 2026-10-29-m7-bench/rb-mvrunonc-d6o7.jsonl 2026-10-30-m7-svg/rb-mvs3tv2h-b949.jsonl --full > 2026-10-30-m7-svg/analysis-ab.txt` | `analysis-ab.txt` |

The committed file was regenerated fresh for this write-up and is **byte-identical on two consecutive
runs** (the idempotency gate); it is also byte-identical to the cross-session capture the write-up was
drafted from, so there is **no pool-split drift to disclose** — the two files with `--full` still print
the two arms as two separate `## Output 1920x1080` blocks (below). The prior folders' committed tables
were not re-run or touched.

## The pool identity — and why this is the cleanest A/B the bench has ever made

`benchPoolOf` (`analyze-bench.mjs`, extended by R-SVG WO-1): a session carrying
`env.gameCodeHash` pools under `code:<hash>`, and an SVG-arm session gains a `|svg=<enc>` suffix; a
PNG key never carries it. So:

| Session | Pool key | Arm |
|---|---|---|
| `rb-mvrunonc-d6o7` (Oct-29 folder) | `code:356cdf76a8` | PNG |
| `rb-mvs3tv2h-b949` (this session) | `code:356cdf76a8\|svg=e3` | E3 SVG |

The analyzer therefore **never averages the two arms together** — the contamination law holds — while
the underlying `356cdf76a8` is the same shipped game code in both bundles: the bench's own rows
(`apps/tizen/src/bench/`, SVG emitter, cull walk) live outside what `scripts/game-code-hash.mjs`
hashes, exactly as the Oct-29 README's *cull-pair forecast* predicted when it said a post-WO2 rebuild
"carries the same `356cdf76a8`". Cross-arm reads below are **cross-pool, same-hash, same-device,
one run each** — the comparison is between two single-sample pools of identical game code, which is
as tight as a hardware A/B on this bench gets; it is still not a noise floor (see *Not done here*).

The **cull pair prices itself inside this session**, against the SVG arm's own plain rows (the knob
table pairs a knob row with its plain row of the same run) — a deliberate improvement over the Oct-29
forecast, which imagined comparing the cull rows against the *PNG* bed. Same-run pairing cancels each
run's own drift; disclosed here because the write-up differs from the forecast in exactly that point.

## Verdict — the SVG arm: NOT-WORTH-it for atlas migration

**Frame cost: no penalty, no win.** The two-tick share and synced p95 at the deciding rows, PNG arm →
SVG arm (both one run, GL 1, window 1920×1080):

| Row | 2-tick PNG → SVG (Δ pts) | Synced p95 ms PNG → SVG |
|---|---|---|
| 640×360 busy | 8.3 → 7.6 (−0.7) | 24.8 → 16.5 |
| 640×360 filter | 24.9 → 25.4 (+0.5) | 19.5 → 17.5 |
| 640×360 mode7 | 13.3 → 11.2 (−2.1) | 21.7 → 18.2 |
| 640×360 crt-light | 17.4 → 12.3 (−5.1) | 16.6 → 15.2 |
| 640×360 crt-full | 42.0 → 41.1 (−0.9) | 15.1 → 14.3 |
| 640×360 worst | 56.9 → 59.2 (**+2.3**) | 19.4 → 17.5 |
| 960×540 busy | 33.6 → 34.5 (+0.9) | 15.9 → 17.7 |
| 960×540 worst | 96.9 → 96.0 (−0.9) | 18.3 → 32.9 |
| 384×216 busy (baseline) | 0.5 → 1.6 (+1.1) | 13.9 → 22.8 |
| 384×216 crt-light | 6.3 → 0.7 (−5.6) | 18.6 → 12.7 |

Every |Δ| is in the class the bench has already shown it can produce from nothing: Oct-29's own busy
p95 (24.8 ms) was 8 ms above every other sample of that row in the series, and its 640 busy two-tick
share had already moved 12.3 → 14.5 → 8.3 across three sessions of *different* code. Rasterising 46k
rects once at load and then sampling a texture costs the per-frame path nothing measurable — the
drawn pixels are identical by construction (`rasterE3` + digest proof in `bench-svg.mjs`), so there
was never a per-frame mechanism for a win either. **No frame-rate penalty, no win.** §13 agrees: all
six variants **performance-step** at 640×360 exactly as the PNG arm's read (busy +6.0 vs +7.8, worst
+20.2 vs +23.2 — same tier, same verdict).

**Decode is the story — SVG loses where it counts.** The arm's pages are fetched and uploaded by the
same timed path (`decode` record, 8 reps, medians; the pages are described as the bench measures
them):

| Page | Size | Encoding | File KB | Decode p50/p95 ms | File→GPU p50/p95 ms |
|---|---|---|---|---|---|
| standin-zone-a | 2048×1024 | png8 | 344 | 101.6 / 140.8 | 224.0 / 365.7 |
| common | 2048×1024 | rgba | 328 | 171.9 / 196.3 | 377.2 / 405.7 |
| zone-a | 512×512 | rgba | 35 | 54.3 / 65.8 | 82.7 / 100.9 |
| svg-x1-e3 | 1024×1024 | svg-e3 | 777 | 314.2 / 326.0 | 385.8 / 411.5 |
| svg-x2.67-e3 | 2048×1024 | svg-e3 | 540 | 232.5 / 342.1 | 317.6 / 426.1 |
| **svg-standin-e3** | 2048×1024 | svg-e3 | **7,726** | **2,002.2 / 2,200.9** | **2,657.7 / 2,818.9** |

- **Clean content survives**: the density pages (long uniform runs — E3's economy) rasterise in
  232–314 ms — a real tax over the png8 class's ~100 ms, but bounded.
- **Noisy content dies**: the stand-in page — E3's declared worst case — breaks into **7,726 rects**,
  ships **7.7 MB of text** (22× its PNG twin's 344 KB uncompressed), and its file→GPU alone is
  **2,658 ms — over R3-04's entire 2 s zone-load budget by itself**, against its PNG twin's 224 ms
  (Δ +2,434 ms at the 8-rep median; 2,819 ms cold-first). This is precisely the
  `r-svg-inv-report` prediction the emitter's own docblock quotes ("the stand-in page is E3's *worst*
  case… so it stays PNG") — now confirmed on the TV.
- **And the plumbing is narrower than PNG's**: `createImageBitmap` of an SVG blob is **rejected** on
  Chromium 69 (`svg-bitmap-reject`: "bitmap: The source image could not be decoded." — 0 of 8 reps
  ever produced a bitmap), so a page must travel `HTMLImageElement` → `texImage2D`
  (`svg-teximage-from-img` measures that path: 363.1 ms file→GPU, same 777-rect page). The game's
  residency path was written around the bitmap alternative.
- **Even the transport is not free**: the E3 gzip win (0.85× of the ×2.67 PNG, per `bench-svg.mjs`)
  exists only against a server that gzips; the widget's `file://` fetch sees the raw bytes above.

**Ruling: NOT-WORTH-it.** The atlas migration to SVG gets nothing it does not already have — no
per-frame effect (the A/B is flat within wobble) — and pays a load-time loss exactly on the pages a
zone actually swaps. The SVG arm stays what it is: **research instrumentation** in
`apps/tizen/vite.bench.config.ts` behind `VITE_BENCH_SVG`, a pixel-exact emitter with its proof in
repo, and the capability evidence behind it (`81ba8cbd`'s 19-feature matrix). The game's atlas stays
PNG-8; **no change to R3-04's estimates** — its measured pages remained the PNG trio (cold 684 ms /
change 302 ms, both in budget; stand-in PNG-8 decode ≈ **73.6 ms per megapixel** — the same basis
across the four hardware builds: Oct-27's 76.3, Oct-28's 73.8, Oct-29's 75.6, tonight's 73.6).

## Verdict — the cull pair: CLOSED, no case

The four owner-folded arm-B rows from `v20x-SPIKE-report.md` ran on hardware for the first time
(indices 190…193), tagged-every-sprite-cullable with a tight bound, the cull test walked once per
rendered frame inside the timed window (`apps/tizen/src/bench/cull.ts`). Against the **same session's
plain rows** (paired, per the knob table):

| Knob row | 2-tick plain → cull (Δ pts) | Synced p95 plain → cull (×) |
|---|---|---|
| 640×360 busy-cull | 7.6 → 25.8 (**+18.2**) | 16.5 → 19.5 (**1.18×**) |
| 640×360 worst-cull | 59.2 → 54.2 (−4.9) | 17.5 → 25.3 (**1.45×**) |
| 960×540 busy-cull | 34.5 → 29.3 (−5.1) | 17.7 → 20.3 (**1.15×**) |
| 960×540 worst-cull | 96.0 → 91.7 (−4.3) | 32.9 → 29.1 (0.88×) |

The per-frame facts the rows report: **5,953–5,954 sprites tagged**, per frame **6,009–6,010 nodes
visited, 1,194–1,201 found outside the view, 82–91 writes that moved the bit**, over 435–668 measured
frames per row.

**Verdict, written exactly as decided: mixed-to-adverse, single-sample.** One row is sharply adverse
(+18.2 points at the cheap busy scene — the walk's cost exposed where there was nothing else to
hide it), the other three read as mild improvements **whose p95s contradict the win** (worst-cull
−4.9 points while its synced p95 rises 1.45×; 960 busy-cull −5.1 with p95 up 1.15×) — and the whole
run carries Oct-29's proven ±2.7-point-class wobble. There is **no case for wiring scene-graph
culling into the game**; what the pair has instead proven is the **bench-level harm ceiling** of the
mechanism — the per-frame visit cost against a pixi-style scene graph is real and can dominate a
light frame. Decisively: **the game's render path is DrawLists replayed into preallocated quad pools,
not per-node scene-graph visibility** (`docs/dev/rendering-and-shell.md`; the zero-allocation laws) —
so these rows measure the *hypothetical* culling game, never the shipped one. Full stop. **The cull
spike program closes here** — no wiring, no follow-up rows, nothing further owed on hardware; the
desktop spike's `Δ p95 +1.200 ms` finding stands, now with its TV-side confirmation class.

## The wire facts — the `done` quirk, revisited

The Oct-29 folder closed the done quirk **for the batched shape**: one payload, `done: true`, header
`complete`. This session is the **wire-era shape again** and behaves exactly like the Oct-28 folder:

1. **197 payloads, `seq` 1..197 contiguous, no gaps, one `env`** (byte-identical across all 197) —
   one POST per scenario plus the payload carrying the `decode` record.
2. **`195 of 194`** in the analyzer header — the row-accounting quirk of the per-scenario shape
   (`standin-zone`, `standin-zone-svg` and the decode record sit outside `env.scenarios`' 194 in
   ways the header counts but the scenario list does not); the Oct-28 file printed its own variant of
   the same class.
3. **`done` is absent from every `rb-` payload — and it rode the sibling `hb-` session.** The TV
   marked the run complete 1.4 s after the last render-bench POST, inside the `harbench` record. That
   is the shape of the completion signal on the wire: the `rb-` stream is data, the `hb-` record is
   closure. Both facts together (Oct-29's batched `done`, this session's sibling `done`) mean the
   analyzer's `incomplete` on `rb-`-only invocations is cosmetic — run the pair where closure matters.
4. **`hb-mvs7jiqh-ab25` is the second `hb-` on-wire record** (first: Oct-28's `hb-mvrk5wgl-ik7a`), and
   the first carrying `svgEnc` — the arm identity survives even the rewind session's payload.

## Not done here

- **Both arms are single samples.** The analyzer still prints "No noise floor (one run per version)"
  in each pool. The SVG-flat verdict is robust (its deltas are at most the wobble the series already
  shows and its mechanism is load-time, not per-frame) but **every number above is still a direction,
  not a floor**; the repeat that opens floors — a **GREEN full-suite pass (or `F` off-TV) on
  `code:356cdf76a8`** for the PNG arm, and an **`F`-repeat on `code:356cdf76a8|svg=e3`** for the SVG
  arm — is **outstanding** for both. The skip ledger now offers exactly that choice per pool (WO-2's
  per-pool keys), Enter-new-rows vs GREEN-from-scratch, arms unable to inherit each other's marks.
  (Offer text since `c0d21407`, noted 2026-10-30: **ENTER new rows only · PLAY/PAUSE or GREEN/2 full
  suite · CH-/RED/1 re-run the last scenario** — `apps/tizen/src/bench/results.ts` 575/581/588; the
  keys this bullet names predate that landing and its prose stands as written.)
- **No GL 2 pair** — the GL 1-vs-2 section is empty by absence.
- **The video surface is unmeasured for the third session running** — all four clip rows: "video
  surface unavailable" (Oct-28, Oct-29, tonight), the v2.0.x surface-decode follow-up's problem, not
  this lane's.
- **`standin-zone-svg` (matrix index 196) printed no usable judgement** — its synced p95 is `0.0 ms`
  and §13 reads "**unknown** — no baseline in this session — re-run the 384x216 rows": the arm's extra
  page load ran (render p50 71.7 ms, 5 frames) but it has no 384-baseline row and its sync column says
  nothing. Disclosed as un-measured, not as a zero.
- Owner's packaging and the Tizen install of the bench widget are, as ever, outside this lane.

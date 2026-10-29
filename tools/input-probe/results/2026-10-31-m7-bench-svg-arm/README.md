# M7 TV render bench — `2026-10-31-m7-bench-svg-arm` session (build `d4f9351+svg-e3`, game code `356cdf76a8`, GL 1) — the **SVG arm's second sample**: the arm opens its own floor, and every cross-arm read is graded

Two names, both kept honestly. The folder is the owner's — plan v20x calls this the **second svg-arm
drop** and `2026-10-31-m7-bench-svg-arm` is his label; the `results/<date>-m7-bench/` naming law (root
`README.md`, plan R0-03) carries the arm suffix as it did in the Oct-30 folder. What the wire actually
carries is stated in this file, not papered over: every payload's server receipt stamp runs
**2026-10-29T04:47:40.585Z → 06:28:42.687Z** (00:47 → 02:28 UTC−4, ~101.0 min), and the sibling `hb-`
payload 1.46 s later — the machine's own dates, left exactly as received.

This is the repeat both prior write-ups left as the outstanding item for the arm: Oct-30's
*"the repeat that opens floors… an `F`-repeat on `code:356cdf76a8|svg=e3`"* and Oct-31's
*"The SVG arm still has no floor"* ([`../2026-10-31-m7-bench-pngfloor/README.md`](../2026-10-31-m7-bench-pngfloor/README.md),
*Not done here*). The owner ran the **full 194-row matrix again on an SVG-arm rebuild** — plain rows,
the four cull rows, stand-in pages and the decode scenario — so the arm pool
`code:356cdf76a8|svg=e3` now holds **GL 1 × 2 runs**, and for the first time the svg-vs-png
comparison is **pool vs pool**, two samples each side. Every prior verdict here is re-graded against
floors, and the load-cost verdict is re-stated as the budget arithmetic it always was.

## Session identity

| | |
|---|---|
| Session | `rb-mvt2ahx6-xenx` — 197 payloads, `seq` 1..197 contiguous, one distinct `env` |
| Build (`env.buildId`) | `d4f9351+svg-e3` — the E3 arm re-rolled over `d4f93512` (docs-only; beneath it `c0d21407`'s bench remote keys and `b2e70185`'s digit aliases), id suffixed by the arm as Oct-30's was |
| Game code (`env.gameCodeHash`) | **`356cdf76a8`** — identical to the Oct-30 SVG run and both PNG runs: the pool bed |
| Arm (`env.svgEnc`) | `e3` — the second SVG-arm session on hardware, ever |
| GL | WebGL 1 (`webGLVersion: 1`); no GL 2 pair ran |
| Matrix | `env.scenarios: 194` — the 190 plain rows **plus the four cull rows** (indices 190…193) |
| Rows | 196 unique scenario rows: 194 matrix + `standin-zone` + `standin-zone-svg`; the `decode` record rides one payload |
| Header row | analyzer: **195 of 194 measured, run incomplete** — Oct-30's svg-arm count-quirk class, repeating exactly (below) |
| Zone load (PNG pages) | cold **642 ms** / change **281 ms** — both inside R3-04's 2000 ms (the fastest PNG-page load estimate of the five runs) |
| Completion record | `hb-mvt5x48z-0tid.jsonl` — one `harbench` payload, `done: true` (the **fourth** ever on-wire, the second on the SVG arm); carries the arm's **second rewind**: 12,000 ticks at **14,998 steps/s**, world build 55.3 ms, 20 hash checks at 1.815 ms, no error |

## The files

| File | What it holds |
|---|---|
| `rb-mvt2ahx6-xenx.jsonl` | The render-bench run — 197 lines, wire-era shape (one payload per scenario, like Oct-30), 196 unique scenario rows, the `decode` record (12 pages × 8 reps) folded into one payload. No `done` on this session — closure rode the sibling `hb-`. |
| `hb-mvt5x48z-0tid.jsonl` | **One payload, `kind: harbench`, `done: true`** — phase `S1`, `gameMode: true`, the same `env` (`buildId d4f9351+svg-e3`, `gameCodeHash 356cdf76a8`, `svgEnc e3`). |
| `analysis-svgpair.txt` | The **arm's own floor**: Oct-30's SVG session and this one in one analyzer run — one pooled `## Output 1920x1080` block of **GL 1 × 2 runs** (medians, the arm's noise floor, knobs with beyond/within labels, §13 at both sizes, the decode table of the newest session), then both sessions' own per-scenario reports. 1,007 lines. |
| `analysis-arms.txt` | The **pool-vs-pool A/B**: both PNG runs and both SVG runs in one analyzer run — the PNG pool block, then the SVG pool block, each with its own floor; the partition prints the arms as the analyzer's contamination law keeps them. 1,953 lines. |

### Regeneration

From `tools/input-probe/results/` at this repo state (analyzer unchanged since `3e6f26de`;
`node scripts/game-code-hash.mjs` measures **`356cdf76a8`** at the write-up's tree `b7a68a6d`):

| Command | Produces |
|---|---|
| `node analyze-bench.mjs 2026-10-30-m7-svg/rb-mvs3tv2h-b949.jsonl 2026-10-31-m7-bench-svg-arm/rb-mvt2ahx6-xenx.jsonl --full > 2026-10-31-m7-bench-svg-arm/analysis-svgpair.txt` | `analysis-svgpair.txt` |
| `node analyze-bench.mjs 2026-10-29-m7-bench/rb-mvrunonc-d6o7.jsonl 2026-10-31-m7-bench-pngfloor/rb-mvsnhea5-i96b.jsonl 2026-10-30-m7-svg/rb-mvs3tv2h-b949.jsonl 2026-10-31-m7-bench-svg-arm/rb-mvt2ahx6-xenx.jsonl --full > 2026-10-31-m7-bench-svg-arm/analysis-arms.txt` | `analysis-arms.txt` |

Both committed files were regenerated fresh and are **byte-identical on two consecutive runs** (the
idempotency gate), and byte-identical to the captures this write-up was drafted from. The A/B run
names **four** files, not three: a three-file invocation (`pngfloor` rb + the two SVG rbs) was run
first and partitioned correctly, but it printed the PNG side as a **one-run** block — `6.7 ± 1.6` is
a two-run pool median, so the honest "versus the PNG pool" needs both PNG samples in the run. The SVG
pool block is identical between the three- and four-file invocations (aggregation is identity-bound,
never input-order-bound). The prior folders' committed tables were not re-run or touched.

## Pool identity — why three builds are two pools

`benchPoolOf` (`analyze-bench.mjs`, extended by R-SVG WO-1): a session carrying `env.gameCodeHash`
pools under `code:<hash>`, plus a `|svg=<enc>` suffix on non-PNG arms. Four sessions, two pools:

| Session | Build | Pool key | Arm |
|---|---|---|---|
| `rb-mvrunonc-d6o7` (Oct-29) | `baeb005` | `code:356cdf76a8` | PNG |
| `rb-mvsnhea5-i96b` (Oct-31 floor) | `b2e7018` | `code:356cdf76a8` | PNG |
| `rb-mvs3tv2h-b949` (Oct-30) | `3e6f26d+svg-e3` | `code:356cdf76a8\|svg=e3` | E3 SVG |
| `rb-mvt2ahx6-xenx` (this session) | `d4f9351+svg-e3` | `code:356cdf76a8\|svg=e3` | E3 SVG |

The `d4f9351+svg-e3` build is the arm re-rolled over commits that touch only the bench harness and
docs (`c0d21407` remote keys, `d4f93512` §13 docs — `apps/tizen/src/bench/`, its scripts, Markdown;
none of what `scripts/game-code-hash.mjs` hashes), and the hash **measures** `356cdf76a8` at this
tree, so the two SVG sessions are one pool by the same law that pooled Oct-29 with Oct-31 — one game,
two bench harnesses. The cross-arm reads below are therefore the bench's strongest form so far:
**two samples per arm, same device, same game code, same matrix, one field of `env` apart.**

## Verdict 1 — the SVG arm has a floor (the outstanding item, closed)

The pair prints, verbatim from the fresh `analysis-svgpair.txt`:

| Spread | Pairs | Median | p90 | Worst |
|---|---|---|---|---|
| synced p95, relative | 195 | **7 %** | **24 %** | 200 % `standin-zone-svg` GL 1 |
| two-tick share, points | 195 | **2.9** | **10.7** | 38.7 `800x600n-filter` GL 1 |

Run-to-run drift: two-tick **2.4 points**, synced p95 **4 %**. Beside the PNG arm's floor (190 pairs:
**3.2 / 11.6** points, **8 % / 31 %**, drift **1.8 / 3 %**) the shape repeats exactly as the Oct-31
README law-ed it: **two-tick share is the stable metric; synced p95 is the noisy one** — and the arm
is, if anything, a hair quieter per-pair than PNG while drifting a point more as a whole run. The
200 % worst pair is the `standin-zone-svg` row's `0.0 → 0.1 ms` p95 (a 1–5-frame row; see *Wire
facts*) — a rounding artifact of a degenerate median, not a new kind of wobble. **The SVG-flat
verdicts of Oct-30 are now graded against the arm's own floor, and both cross-arm tables in this
folder compute `beyond`/`within` from real numbers.**

## Verdict 2 — cross-arm frame cost: a tie, and every draft headline dies under the floor

Pool medians (PNG × 2 runs vs SVG × 2 runs, GL 1, window 1920×1080). Calls graded against **both**
arms' p90s — the stricter reading needs a Δ beyond 11.6 points (PNG floor), the arm-internal one
beyond 10.7; no row below is close to either:

| Row (2-tick %) | PNG pool | SVG pool | Δ pts | Call |
|---|---|---|---|---|
| 384x216 busy | 2.7 ±2.2 | 1.1 ±0.4 | −1.6 | **within** |
| 640x360 busy | 6.7 ±1.6 | 6.8 ±0.8 | **+0.1** | **within** — the poster row is identical |
| 640x360 filter | 23.9 ±1.0 | 25.4 ±0.1 | +1.5 | **within** |
| 640x360 mode7 | 12.3 ±0.9 | 10.1 ±1.0 | −2.2 | **within** |
| 640x360 worst | 58.8 ±1.9 | 58.2 ±1.0 | −0.6 | **within** |
| 960x540 busy | 34.9 ±1.3 | 33.6 ±0.9 | −1.3 | **within** |
| 1280x720n busy | 71.8 ±10.7 | 64.1 ±9.3 | −7.7 | **within** — the largest \|Δ\| of the deciding rows, and the PNG pool's own runs disagree by 21.4 pts here (61.1/82.5): weather |
| 1024x768n busy | 59.9 ±5.6 | 62.5 ±7.5 | **+2.6** | **within** — SVG is the *higher* side of a tie |
| 1024x768n worst | 78.0 ±5.4 | 77.1 ±5.2 | −0.9 | **within** |
| 1920x1080n busy | 99.6 ±0.0 | 99.7 ±0.0 | +0.1 | **within** (saturated) |

**Re-graded headlines, each against what the draft-era read claimed:**

| Claim (as drafted from single samples) | Fresh 2×2 read | Floor-graded verdict |
|---|---|---|
| "SVG busy@640 pooled **3.1** vs PNG 6.7 → **−3.6 faster**" | SVG pool is **6.8** (runs 7.6/6.0); PNG is 6.7 → **+0.1** | **not reproduced; within-noise tie — no win.** The 3.1 ±0.1 figure is the **PNG pool's `640x360n`** (native-art) row, one cell away from the scaled busy row; the SVG `640x360n` row is 2.6 ±1.3, itself a within read |
| "**SVG wins the big frames**: 1024x768n busy 59.5 → 49.7 (−9.8), worst 97.3 → 87.9 (−9.4)" | fresh pools print **59.9 → 62.5 (+2.6)** and **78.0 → 77.1 (−0.9)** | **not reproduced.** Neither draft figure appears in any committed per-run or pooled table; at best such single-sample reads were **suggestive**, and the second sample spent the suggestion |
| p95 reads favoring SVG (busy@640 20.1 → 17.3 = 0.86×) | 14 % below, inside both arms' p90 (24 %/31 %); the PNG median carries Oct-29's proven 24.8 ms outlier (Oct-31's adjudication: the pair centers 20.1 ±4.7) | **no call — noisy metric, within class** |
| Oct-30's "Frame cost: no penalty, no win" | holds verbatim at 2×2: every \|Δ2t\| ≤ 7.7 on the deciding rows | **stands, floor-backed** |

**§13's tiers are arm-independent** (median of 2 runs, Δ vs each run's own 384×216): SVG busy@640
**+5.7 (+5.4 … +6.0)** against the PNG floor's **+4.0 (+0.3 … +7.8)** — overlapping ranges, same
**performance-step** outcome for all six variants at 640×360 and all of 960×540 on both arms. The
640×360 frame-time verdict is unchanged by the encoding; mechanism argued it, the second sample
confirmed it.

## Verdict 3 — load cost: the NOT-WORTH-it ruling is STRENGTHENED, and it was never a noise question

The decode scenario ran again (8 reps, medians). Both samples side by side, the page-classes kept
apart exactly as `docs/dev/input-probe-results.md` §13.4/§13.5 keeps them:

| Page | Oct-30 decode p50/p95 | **this sample decode p50/p95** | Oct-30 file→GPU p50/p95 | **this sample file→GPU p50/p95** |
|---|---|---|---|---|
| standin-zone-a (**png8** twin) | 101.6 / 140.8 | 98.6 / 170.8 | 224.0 / 365.7 | **205.4 / 301.0** |
| common (**rgba png**) | 171.9 / 196.3 | 166.8 / 195.6 | 377.2 / 405.7 | **352.3 / 390.2** |
| svg-x1-e3 (1024², **clean class**) | 314.2 / 326.0 | **309.0 / 316.0** | 385.8 / 411.5 | **382.6 / 395.4** |
| svg-x2.67-e3 (2048×1024, **clean class**) | 232.5 / 342.1 | **224.1 / 349.6** | 317.6 / 426.1 | **304.9 / 432.0** |
| **svg-standin-e3 (2048×1024, noisy class)** | **2,002.2 / 2,200.9** | **1,971.3 / 2,101.6** | **2,657.7 / 2,818.9** | **2,598.2 / 2,911.6** |

- **The clean-page tax stands, undiminished.** A draft read of "x1 decode 232.5 → 194.6 — the tax
  is smaller than the first sample suggested" **does not reproduce**: the x1 page decoded at
  314.2 ms then **309.0** ms now (194.6 appears nowhere in either session), and the x2.67 page at
  232.5 → 224.1. The class is a consistent **~220–315 ms decode vs the png8 class's ~100 ms** —
  a bounded, twice-measured tax.
- **The noisy-content class breaks the budget twice.** The stand-in page's file→GPU median is
  **2,598.2 ms** this sample against **2,657.7 ms** on Oct-30 — **each over R3-04's entire 2,000 ms
  zone-load budget by itself**, against the PNG-8 twin's 224.0 (Oct-30) and **205.4** (this sample).
  The second sample moves the pair's median by ~60 ms: the number **is** the verdict.
- **And this is arithmetic, not a noise call.** The floor grades *which arm is faster*; it cannot
  grade *over or under a budget* — a median sitting **30 % above the whole 2 s budget** needs no
  p90 to be disqualified. No plausible noise floor shrinks 2,598 to under 2,000; the 7.7 MB of E3
  text for one noisy page (22× its PNG twin) is the mechanism, and it is content-shaped, not
  machine-shaped.
- **The plumbing still refuses**: `svg-bitmap-reject` repeats exactly — `createImageBitmap` of a
  blob of SVG bytes is rejected on Chromium 69 (`"The source image could not be decoded."`, 0 of 8
  reps again), the `HTMLImageElement` → `texImage2D` route measures again (363.1 → **347.2 ms**
  file→GPU, same 777-rect page), and the §13.2 narrowing (decoded image accepted, blob refused) is
  consistent with both.

**Ruling unchanged and now two-samples-deep: atlas migration to SVG is NOT-WORTH-it.** The frame
side is a floor-confirmed **tie** (Verdict 2 — there is no win to buy), and the load side is a
twice-measured **loss** on exactly the pages a zone swaps (this verdict and Oct-30's rest on the
stand-in-class rows, the file→GPU totals, and the R3-04 budget arithmetic — the frame-side rows were
never load evidence). The atlas stays PNG-8; the E3 emitter stays research instrumentation behind
`VITE_BENCH_SVG`.

**R3-04 itself: nothing moves.** This session's measured PNG pages give cold **642 ms** / change
**281 ms**, both in budget, the fifth sample of that estimate (665/282, 671/285, 684/302, now
642/281); the stand-in PNG-8 decode basis gets its **sixth** sample: **72.1 ms/MP** — Oct-27's 76.3,
Oct-28's 73.8, Oct-29's 75.6, Oct-30's 73.6, Oct-31's 74.6, tonight's 72.1: the band holds.

## Verdict 4 — the cull pair: closure REAFFIRMED with two arm samples

The four cull rows ran again on the arm, so the mechanism now has **three samples that price the
light-frame cost** (two SVG, one PNG), each graded against its own arm's floor:

| Sample | plain 2t | cull 2t | Δ pts | 2t call | p95 × | p95 call |
|---|---|---|---|---|---|---|
| Oct-30 SVG busy@640 | 7.6 | 25.8 | +18.2 | beyond (11.6 then: wobble-class; 10.7 now) | 1.18× | within |
| **this run SVG busy@640** | 6.0 | 22.2 | **+16.2** | **beyond (10.7)** | 1.33× | **beyond — adverse** |
| SVG pool (knob table, `analysis-svgpair.txt`) | 6.8 | 24.0 | **+17.1** | **beyond** | 1.20× | within |
| Oct-31 PNG busy@640 | 6.7 | 18.6 | +13.4 | **beyond (11.6)** | 1.18× | within |

The heavier rows keep Oct-30's shape (mild two-tick "wins", now formally **within** on both arms,
against p95 ratios that are **beyond-adverse**: SVG pool worst@640 **1.48×** and 960 worst **1.26×**).
The per-frame facts are identical across all six cull samples, both arms: **5,953–5,954 sprites
tagged**, per frame **6,009–6,010 nodes visited, 1,194–1,210 found outside the view, 82–92 writes
that moved the bit**. The Oct-31 close — *"no case for wiring scene-graph culling into the game"* —
was written when the adverse busy@640 signal was 2 samples (one per arm); it is now **four**, and the
mechanism is the same walk to the sprite. **Closed stays closed.**

## The wire facts

1. **No `done` on the `rb-` stream; the sibling `hb-` carries it** — `done: true` 1.46 s after the
   last render-bench POST (`06:28:42.687Z` → `06:28:44.146Z`), the shape Oct-30 and Oct-31 documented.
   The analyzer's "run **incomplete**" header is cosmetic on an `rb-`-only account: all 194
   scenarios measured.
2. **The `195 of 194` count quirk repeats — and it is now an svg-arm class, twice on wire.** This
   session and Oct-30's (the only two `svgEnc: e3` sessions) both print `195 of 194`; both PNG runs
   printed straight (`190/190`, `194/194`). The extra row is the arm's own `standin-zone-svg` page
   load sitting outside `env.scenarios`. Cosmetic to the tables (every measured row appears), left
   unpapered — the analyzer counts, this README explains.
3. **`hb-mvt5x48z-0tid` is the fourth `hb-` record on-wire** (after Oct-28's `hb-mvrk5wgl-ik7a`,
   Oct-30's `hb-mvs7jiqh-ab25`, Oct-31's `hb-mvsr2a6t-d8bb`), the second on the SVG arm, and the arm's
   second rewind (15,165 → 14,998 steps/s — the scenario now has **two samples per arm**, the same
   depth as the plain pool rows).
4. **The video surface is unmeasured for the fifth session running** — all four clip rows again
   print "video surface unavailable" (Oct-28, Oct-29, Oct-30, Oct-31, tonight): the v2.0.x
   surface-decode follow-up's problem, not this lane's.
5. **`standin-zone-svg` (matrix index 196) still prints no usable judgement** — 2-tick **0.0** both
   runs; synced p95 0.1 ms; §13 again reads "**unknown** — no baseline in this session — re-run the
   384x216 rows"; this sample measured **2 frames** (render p50 40.6 ms) against Oct-30's 5 (71.7 ms).
   The arm's extra page-load row renders — but two frames are not a scenario, and it is disclosed as
   un-measured, not as a zero. It is also the floor table's 200 % worst-pair (0.0↔0.1 on a ~0 ms
   median: a degenerate-row artifact, kept visible).

## Not done here

- **No GL 2 pair** — the GL 1-vs-2 section prints "No comparison: the sessions hold WebGL 1 runs
  only", on both arms, as in every folder since the resolutions split.
- **A third SVG-arm sample would sharpen the drift number** (arm drift 2.4 pts vs PNG's 1.8), but
  **nothing on this folder's verdicts waits on it**: the tie is inside both floors at 2×2, the load
  loss is arithmetic on two samples, the cull close is four samples deep, and §13's tiers overlap.
- **The `195 of 194` header quirk** — if a future analyzer pass wants exactness, the fix is teaching
  the header that an arm's extra page-load row is a row; deliberately not touched here, because
  re-running the analyzer's account changes no number in any table.
- Owner's packaging and the Tizen install of the bench widget are, as ever, outside this lane.

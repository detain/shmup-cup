# M7 TV render bench — 2026-10-31 `2026-10-31-m7-bench-pngfloor` session (build `b2e7018`, game code `356cdf76a8`, GL 1) — the PNG-arm full re-run that opens the **noise floor**

Two names, both kept honestly. The folder is the owner's — plan v20x calls it the **Oct-31** session
and `2026-10-31-m7-bench-pngfloor` is his label; the `results/<date>-m7-bench/` naming law (root
`README.md`, plan R0-03) is followed with the `-pngfloor` suffix in place of the bare `-bench` because
this session is not just a run — it is the **repeat** the Oct-29 and Oct-30 write-ups both named as
the thing that turns the series's directions into floor-graded calls. What the wire actually carries
is stated in this file, not papered over: every payload's server receipt stamp runs
**2026-10-28T21:53:10.2Z → 23:32:50.6Z** (17:53 → 19:32 UTC−4, ~99.7 min), and the sibling `hb-`
payload 1.4 s later — the machine's own dates, left exactly as received.

This is the `356cdf76a8` pool's **second run** — the repeat the Oct-30 write-up left as
*"outstanding for both"* arms and the Oct-29 README's last line promised (*"The `356cdf76a8` pool
itself has one run until it is repeated"*). It ran on the owner's remote by the **digit key `2`** —
the Green alias `b2e70185` added for exactly this TV — and it is a **full suite**: the four **cull
rows on the PNG side for the first time**, on top of all 190 plain rows freshly re-measured.

## Session identity

| | |
|---|---|
| Session | `rb-mvsnhea5-i96b` — 196 payloads, `seq` 1..196 contiguous, one distinct `env` |
| Build (`env.buildId`) | `b2e7018` — the number-key alias commit (bench-side only; see *Pool identity*) |
| Game code (`env.gameCodeHash`) | **`356cdf76a8`** — identical to the Oct-29 PNG session: the pool bed |
| Arm (`env.svgEnc`) | `png` — the PNG arm, like Oct-29's run |
| GL | WebGL 1 (`webGLVersion: 1`); no GL 2 pair ran |
| Matrix | `env.scenarios: 194` — the 190 plain rows **plus the four cull rows** (indices 190…193) |
| Rows | 195 unique scenario rows: 194 matrix + `standin-zone`; the `decode` record (7 pages × 8 reps) rides one payload |
| Header row | analyzer: **194 of 194 measured, run incomplete** — the absent-`done` class only (below); Oct-30's count-quirk variant did not appear |
| Zone load (PNG pages) | cold **671 ms** / change **285 ms** — both inside R3-04's 2000 ms |
| Completion record | `hb-mvsr2a6t-d8bb.jsonl` — one `harbench` payload, `done: true` (the **third** ever on-wire) |

## The files

| File | What it holds |
|---|---|
| `rb-mvsnhea5-i96b.jsonl` | The render-bench run — 196 lines, wire-era shape (one payload per scenario, like Oct-28/30), 195 unique scenario rows, the `decode` record folded into one payload. No `done` on this session — closure rode the sibling `hb-`. |
| `hb-mvsr2a6t-d8bb.jsonl` | **One payload, `kind: harbench`, `done: true`** — phase `S1`, `gameMode: true`, the same `env` (`buildId b2e7018`, `gameCodeHash 356cdf76a8`, `svgEnc png`). The third `hb-` on-wire after Oct-28's `hb-mvrk5wgl-ik7a` and Oct-30's `hb-mvs7jiqh-ab25`. Carries the **rewind** record (index 197): 12,000 ticks at **15,381 steps/s**, world build 47.4 ms, 20 hash checks at 1.655 ms, `capTicks` 5,127 (estimated), no error. |
| `analysis-floor.txt` | The **noise-floor report**: this session and the Oct-29 session in one analyzer run — one pooled `## Output 1920x1080` block of **GL 1 × 2 runs** (medians, spreads, knobs with beyond/within labels, §13 at both sizes), then both sessions' own per-scenario reports. 978 lines. |

### Regeneration

From `tools/input-probe/results/` at this repo state (neither analyzer changed since `3e6f26de`;
`node scripts/game-code-hash.mjs` still computes `356cdf76a8` at the write-up's tree):

| Command | Produces |
|---|---|
| `node analyze-bench.mjs 2026-10-31-m7-bench-pngfloor/rb-mvsnhea5-i96b.jsonl 2026-10-29-m7-bench/rb-mvrunonc-d6o7.jsonl --full > 2026-10-31-m7-bench-pngfloor/analysis-floor.txt` | `analysis-floor.txt` |

The committed file was regenerated fresh for this write-up and is **byte-identical on two consecutive
runs** (the idempotency gate); it is also **byte-identical to the owner's capture** the write-up was
drafted from (`/tmp/opencode/bench-floor.txt`, 978 lines), so there is **no delta to disclose**. The
prior folders' committed tables were not re-run or touched.

## Pool identity — why two different builds are one pool

Oct-29 ran on build `baeb005`, tonight's repeat on `b2e7018` — and the analyzer still pools them as
**one pool, two GL 1 runs**, because the pool key is `env.gameCodeHash` = `code:356cdf76a8`. The
bench-side delta between the builds is the **number-key aliases** (`b2e70185`: `1`→Red, `2`→Green on
the results page, seven keys registered instead of five) — the bench sits outside what
`scripts/game-code-hash.mjs` hashes, and that commit's own body proved the game code hash "measured
unmoved at `356cdf76a8` on this tree and its base". This is exactly what the Oct-29 README's
*cull-pair forecast* predicted: "a post-WO2 **PNG-arm** bench rebuild carries the same `356cdf76a8`
and joins this session's pool". The pooling is honest — one game, two bench harnesses, and the only
harness change is which button starts the run.

## Verdict 1 — the noise floor exists

The first same-pool repeat in the program. Every committed bench report before this one printed *"No
noise floor: no WebGL version has 2 runs"* — all five of them (Oct-27's pair of files, Oct-28,
Oct-29, Oct-30; the Oct-19 folders carry no committed report). The fresh pair prints, verbatim from
the analyzer:

| Spread | Pairs | Median | p90 | Worst |
|---|---|---|---|---|
| synced p95, relative | 190 | **8 %** | **31 %** | 76 % `960x540-busy-video` GL 1 |
| two-tick share, points | 190 | **3.2** | **11.6** | 40.4 `1024x768n-crt-light` GL 1 |

Run-to-run drift (a whole run moving on its own): two-tick **1.8 points**, synced p95 **3 %**.
And the sentence every future read hangs on: *"Two-tick share is the stable metric; synced p95 is the
noisy one."* The knob table's `beyond`/`within` columns grade each difference against these numbers
(two-tick 11.6 points, p95 31 %) — the "read one run as noise" caveats the series has been printing
in prose since Oct-27 are now a **table** the analyzer computes itself.

## Verdict 2 — prior headlines, re-graded under the floor

**busy@640 (the series's poster row).** Oct-29's own report read **8.3 pts** two-tick; tonight's own
report reads **5.1**; the pooled table prints **6.7 ± 1.6**. The two runs' spread — **3.2 points** —
is *exactly* the 190-pair median spread (3.2) and under a third of the p90 (11.6): the two headlines
are one number sampled twice. Corrected reading against the owner's draft, which quoted the pair median
as the Oct-31 value: the run values are **8.3 and 5.1**, the pooled truth is **~6.7 ± 1.6** — still
"stable, no change between sessions", still inside the drift class, now with the honest figures.
The Oct-27 (12.3) and Oct-28 (14.5) readings were **different pools** — game codes `89afe15f16` and
`d52805a51a` per Oct-29's *pool identity* — different games, not repeats of this one: **kept, not
re-pooled**; the floor prices them nothing. §13 stands unchanged: busy@640 **+4.0 (+0.3 … +7.8)** —
**performance-step**; all six 640×360 variants performance-step at the median of 2 runs, and
960×540-busy lands in the same tier.

**The video knob.** Oct-28's headline ("all eight video p95 ratios are below 1.0 … 0.75–0.82× at
640×360 and 960×540, 0.82–0.96× at the big frames", repeated by Oct-29 as a second independent
sample) does **not** survive as a class claim. Re-graded per row against the floor, exactly as the
fresh table labels them (analyzer values verbatim; the p95 `×` pairs each run's own plain row):

| Size | Row | 2t plain → video | Δ | 2t call | p95 video × | p95 call |
|---|---|---|---|---|---|---|
| 640x360 | busy-video | 6.7 → 5.4 | −1.3 | within | 0.81× | within — no call |
| 640x360 | worst-video | 58.8 → 55.7 | −3.1 | within | **0.69×** | **beyond** — a real p95 win |
| 960x540 | busy-video | 34.9 → 35.5 | +0.6 | within | **1.50×** | **beyond** — adverse; and the matrix's noisiest pair (76 % spread) |
| 960x540 | worst-video | 94.8 → 96.1 | +1.3 | within | 0.95× | within |
| 1280x720n | busy-video | 71.8 → 53.2 | **−18.6** | **beyond** — a real two-tick win | 0.82× | within |
| 1280x720n | worst-video | 91.7 → 92.6 | +0.9 | within | 0.93× | within |
| 1920x1080n | busy-video | 99.6 → 99.7 | 0.0 | within | 0.97× | within (saturated) |
| 1920x1080n | worst-video | 99.8 → 100.0 | +0.2 | within | 0.87× | within (saturated) |

What stands: the video knob is **not** the blanket "wins everywhere at 0.75–0.9×" the series hoped.
Its honest shape from 2×8 floor-paired samples: **two real wins** — 640×360-worst at p95 (0.69×) and
1280×720n-busy at two-tick (−18.6 pts, Oct-28's −21.1 read confirmed) — **six no-calls**, and **one
real adverse p95 row** (960×540-busy 1.50×), which is also the worst single spread in the whole 190-pair
floor table: that row is the noisy-metric footnote come to life. Oct-29's famous 0.75× busy@640 win
was measured against its own 24.8 ms outlier p95 — a sample the pair now centers at 20.1 ± 4.7; the
floor grades the same pair **within** (0.81×). Nobody needs to revert anything: no game default rode
these rows — but the v20x video follow-ups should quote the **rows**, never the class.

## Verdict 3 — culling is formally closed, floor-graded

The four cull rows (`apps/tizen/src/bench/cull.ts`, folded from the desktop spike) ran **on the PNG
side for the first time**, and the analyzer prints them in the same knob table, now with beyond/within
labels. The Δ and `×` columns pair within the single run that holds the knob (the cull rows exist only
in this session and in Oct-30's SVG arm — never re-pooled across arms); the plain columns are the
pool medians of 2 runs:

| Size | Row | 2t plain → cull | Δ pts | 2t call | p95 plain → cull | p95 × | p95 call |
|---|---|---|---|---|---|---|---|
| 640x360 | busy-cull | 6.7 → 18.6 | **+13.4** | **beyond** — adverse | 20.1 → 18.2 | **1.18×** | within |
| 640x360 | worst-cull | 58.8 → 52.7 | −7.9 | **within** — noise | 21.5 → 25.5 | 1.08× | within |
| 960x540 | busy-cull | 34.9 → 33.3 | −2.9 | **within** — noise | 15.4 → 19.7 | **1.31×** | **beyond** — adverse |
| 960x540 | worst-cull | 94.8 → 93.3 | +0.5 | within | 17.6 → 27.1 | **1.60×** | **beyond** — adverse |

The per-frame facts, first PNG-side sample (the analyzer's own lines): **5,953–5,954 sprites tagged
cullable**; per frame **6,009–6,010 nodes visited, 1,199–1,210 found outside the view, 86–92 writes
that moved the bit**, over 433–706 measured frames per row. Oct-30's SVG-side sample measured the same
walk (5,953–5,954 tagged, 1,194–1,201 off-view, 82–91 writes) — the mechanism behaves identically on
both arms.

Read under the floor, the pair **closes**:

- the one sharply **adverse** signal repeats across arms and exceeds the floor: busy@640 **+18.2**
  (Oct-30, single) and **+13.4** (Oct-31, beyond 11.6) — the walk's per-frame visit cost exposed on a
  light frame, exactly where the desktop spike's +1.2 ms finding said it would bite;
- the **960×540 p95 ratios 1.31× / 1.60× are beyond-floor adverse** — Oct-30 flagged the same rows
  as "mild improvements whose p95s contradict the win" without a yardstick; there is one now, and it
  calls them adverse;
- the two apparent **two-tick wins (−7.9, −2.9) are WITHIN the floor**: noise, not value — the same
  rows Oct-30 read as −4.9 / −5.1 were already called mild; they are now formally un-judged.

**There is no case for wiring scene-graph culling into the game.** The shipped render path replays
DrawLists into preallocated quad pools — it has no per-node visibility walk to win back (Oct-30's
close, law in `docs/dev/rendering-and-shell.md`); the spike measured the hypothetical, on two arms,
on hardware, against a real floor, and the hypothetical pays ~90 bit-writes and 6,000 node visits per
frame for ~1,200 off-view sprites it never had to reach. **The cull spike program is CLOSED with
device-grade receipts** — no wiring, no follow-up rows, nothing further owed on hardware.

## The digit keys — the alias worked on the TV

This is the **first bench run on hardware started by a number key**: the owner pressed **`2`** (the
Green alias `b2e70185` added for a remote with no color keys) and the full suite ran — 194 scenarios +
stand-in + decode in ~99.7 min, every shared row freshly sampled (the pair table proves it: all 190
have a new value). The same evening's input-probe session (sibling folder
[`../2026-10-31-m7-bench-svg-features/`](../2026-10-31-m7-bench-svg-features/), started ~3 min after
this run's closure) logged digits **`1(49)` and `2(50)` arriving as real down/up taps** through the
registered path (45/45 keys), the keyCodes exactly as the alias commit predicted. Queued follow-up,
not this lane: the skip-ledger offer text still names the keys by color only — `GREEN full suite:` at
`apps/tizen/src/bench/results.ts:574` — and should mention `2`.

## R3-04 — nothing moves

Zone-load from this session's measured PNG pages: cold **671 ms**, zone change **285 ms** (Oct-29:
665 / 282 — within 1 %, i.e. inside the very drift this run measured). The stand-in PNG-8 decode
basis gets its **fifth** sample: **74.6 ms/MP** — Oct-27's 76.3, Oct-28's 73.8, Oct-29's 75.6,
Oct-30's 73.6, tonight's 74.6: the band holds and **no R3-04 estimate changes**.

## The wire facts

1. **No `done` on the `rb-` stream** — closure rode the sibling `hb-` payload 1.4 s after the last
   render-bench POST (`23:32:50.6Z` → `23:32:51.999Z`), the same shape Oct-30 documented. The
   analyzer's "run **incomplete**" header is therefore cosmetic on an `rb-`-only account: every one of
   the 194 scenarios measured (`194 of 194`). Run the pair where closure matters.
2. **Oct-30's `195 of 194` count quirk did not repeat** — this PNG-arm session's row accounting
   printed straight: 196 payloads = 194 matrix + `standin-zone` + the decode-carrying payload.
3. **`hb-mvsr2a6t-d8bb` is the third `hb-` record on-wire**, and the first on the PNG arm — the
   `rewind` scenario (15,381 sim steps/s) now has one sample per arm.
4. **The video surface is unmeasured for the fourth session running** — all four clip rows print
   "video surface unavailable" (Oct-28, Oct-29, Oct-30, tonight): the v2.0.x surface-decode
   follow-up's problem, not this lane's.

## Not done here

- **The SVG arm still has no floor.** `code:356cdf76a8|svg=e3` has one run (Oct-30); its repeat
  (an `F`-key off-TV batch, or a Green re-run on an arm rebuild) remains outstanding exactly as
  Oct-30 left it. This floor is the **PNG arm's** — cross-arm knob reads (e.g. the cull pair's
  SVG +18.2 vs PNG +13.4) stay two single samples pointing the same way.
- **No GL 2 pair** — the GL 1-vs-2 section prints "No comparison: the sessions hold WebGL 1 runs
  only", as in every folder since the resolutions split.
- **The cull rows carry one sample each** — their beyond/within labels grade a single measurement
  against a 190-pair floor; that is the strongest form a one-run row can take, and the busy@640
  adverse reading is corroborated by the other arm. A third PNG sample is cheap on the next sit-down
  but nothing on this folder's verdicts waits on it.
- Owner's packaging and the Tizen install of the bench widget are, as ever, outside this lane.

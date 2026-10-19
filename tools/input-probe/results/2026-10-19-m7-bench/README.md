# M7 TV render bench — raw sessions, 2026-10-19 (plan R0-03)

Raw `render-bench` sessions from the owner's Samsung M7, collected by
`tools/input-probe/server/log-server.mjs` and read with `results/analyze-bench.mjs`.
These are the logs only — plan R0-03's agent part (`docs/dev/input-probe-results.md` §12, the
§13 verdict, the v2 render budgets) is wave 15's `R0-03.A1` and is **not** done here.

## The unit

| | |
|---|---|
| Model | `LS43AM702UNXZA` (M7, 43") — `sdb devices` serial |
| Address | `10.0.0.224`, desktop `10.0.0.2` |
| Platform | Tizen 5.5, `product_version` 4.0, `cpu_arch` armv7 (`sdb capability`) |
| Engine | Chromium **69.0.3497.128** (DevTools `/json/version`); UA reports `69.0.3497.106/5.5` |
| Firmware (SW version) | `M-KSU23MWWC-2750.0` |
| Display | 1920×1080 @ devicePixelRatio 1 |
| Build under test | `2a82316` (bench widget `ShmpCupBnc.RenderBench`, `pnpm bench:tv`) |

Only **one** unit was run: plan R0-03 step 3 (the two M7s are the same model, owner 2026-10-19).

## Sessions

| File | GL | Scenarios | Decode | Note |
|---|---|---|---|---|
| `rb-mvfn8l6d-i1rw.jsonl` | 1 | 18/18 | yes | run 1 — the first run after a fresh install |
| `rb-mvfnv78l-pqzh.jsonl` | 2 | 18/18 | yes | WebGL 2 (`localStorage['shmup-cup:gl'] = '2'`) |
| `rb-mvfo9erp-57tj.jsonl` | 1 | 18/18 | yes | run 3 — the WebGL 1 repeat pass |

Each is complete (19 payloads: 18 scenarios + the R1-05 decode record). Print them with:

```sh
cd tools/input-probe
node results/analyze-bench.mjs results/2026-10-19-m7-bench/rb-mvfn8l6d-i1rw.jsonl \
                               results/2026-10-19-m7-bench/rb-mvfnv78l-pqzh.jsonl
```

The repeat pass is a **full** matrix, not only the 640×360 block: the bench has no TV-side way to
run a subset (the cursor lives in `localStorage` and a run always goes 0 → 18), so repeating the
whole matrix was the only way to get the 640×360 stability check. It costs the same ~10 min and
yields repeat rows for the other two sizes too.

## The finding that matters: WebGL 2 shows no reliable advantage

`analyze-bench.mjs` on run 1 + the GL2 session prints *"WebGL 2 is clearly better at 640×360
(0.90× the synced p95): §13 — a step to make WebGL 2 the TV default with a WebGL 1 fallback."*
**The repeat pass does not support that conclusion.** Synced p95 and two-tick share, all 18
scenarios, GL1 run 1 vs GL1 run 3 vs GL2:

| Scenario | p95 GL1 r1 | p95 GL1 r3 | Δ r3−r1 | spread | p95 GL2 | 2t GL1 r1 | 2t GL1 r3 | 2t GL2 |
|---|---|---|---|---|---|---|---|---|
| 384x216-busy | 11.70 | 10.90 | −0.80 | 1.07× | 12.20 | 0.2 | 0.4 | 0.5 |
| 384x216-filter | 14.20 | 15.00 | +0.80 | 1.06× | 13.40 | 3.2 | 0.6 | 0.4 |
| 384x216-mode7 | 13.00 | 12.30 | −0.70 | 1.06× | 11.40 | 4.3 | 0.5 | 0.2 |
| 384x216-crt-light | 12.00 | 12.60 | +0.60 | 1.05× | 16.50 | 0.2 | 0.2 | 2.9 |
| 384x216-crt-full | 13.10 | 11.40 | −1.70 | 1.15× | 11.80 | 31.4 | 29.8 | 28.6 |
| 384x216-worst | 14.90 | 22.00 | +7.10 | 1.48× | 14.60 | 38.7 | 35.1 | 35.3 |
| 640x360-busy | 14.30 | 13.60 | −0.70 | 1.05× | 12.80 | 12.2 | 8.3 | 6.8 |
| 640x360-filter | 16.10 | 18.20 | +2.10 | 1.13× | 15.30 | 26.3 | 21.4 | 21.6 |
| 640x360-mode7 | 17.30 | 13.50 | −3.80 | 1.28× | 13.60 | 15.6 | 9.0 | 10.3 |
| 640x360-crt-light | 14.20 | 16.40 | +2.20 | 1.15× | 17.60 | 14.3 | 7.2 | 8.5 |
| 640x360-crt-full | 12.20 | 13.70 | +1.50 | 1.12× | 11.00 | 45.2 | 42.2 | 42.0 |
| 640x360-worst | 13.90 | 18.20 | +4.30 | 1.31× | 17.60 | 64.6 | 60.3 | 59.2 |
| 960x540-busy | 13.20 | 13.10 | −0.10 | 1.01× | 13.00 | 40.4 | 36.8 | 35.0 |
| 960x540-filter | 14.90 | 22.50 | +7.60 | 1.51× | 20.70 | 66.4 | 60.8 | 60.3 |
| 960x540-mode7 | 14.50 | 13.50 | −1.00 | 1.07× | 12.40 | 47.8 | 41.9 | 41.6 |
| 960x540-crt-light | 13.80 | 16.10 | +2.30 | 1.17× | 17.50 | 41.2 | 36.3 | 36.0 |
| 960x540-crt-full | 13.70 | 11.80 | −1.90 | 1.16× | 13.00 | 71.6 | 67.1 | 67.2 |
| 960x540-worst | 15.50 | 19.20 | +3.70 | 1.24× | 19.20 | 99.8 | 98.0 | 96.7 |

Three things follow:

1. **Synced p95 is not stable enough to decide a GL version.** Two *identical* WebGL 1 runs differ
   by up to **1.51×** (`960x540-filter`, 14.90 → 22.50 ms; `384x216-worst` 1.48×, `640x360-worst`
   1.31×, `640x360-mode7` 1.28×). The whole GL1-vs-GL2 p95 range the analyzer compares
   (0.79× – 1.39×) sits **inside** that noise band.
2. **The biggest single "GL2 win" was a GL1 outlier.** `640x360-mode7` read 17.30 ms in run 1 and
   13.50 ms in run 3 — GL2's 13.60 ms is run 3's figure, not an improvement on it. Same on
   two-tick: 15.6 → 9.0 (GL1), GL2 10.3.
3. **On the stable metric the two GL versions are the same.** Mean |GL1 run 3 − GL2| two-tick share
   = **0.8 points** across all 18 scenarios, while GL1 against *itself* drifts **3.8 points**
   (mean r3 − r1). GL2 is within run-to-run noise of GL1 everywhere.

Run 1 is systematically the pessimistic one (two-tick higher on 17 of 18 scenarios). It was the
**first run after a fresh install**, so post-install background work on the TV is the likely cause.
Anything read against run 1 alone will overstate the gain.

**Recommendation for `R0-03.A1` / §12 (not applied here):** do not record a WebGL 2 advantage, and
do not open a "make WebGL 2 the TV default" step on this evidence. Either keep WebGL 1 (the shipped
default) or re-measure with several runs per GL version and decide on **two-tick share**, not p95.
`analyze-bench.mjs`' GL1-vs-GL2 rule reads a single run per version and has no noise floor — worth a
look when §12 is written.

## What *is* solid

- **The two-tick share.** Stable to a few points run-to-run and ordered identically in all three
  runs. The 640×360 ordering — busy 8–12 %, crt-light 7–14 %, mode7 9–16 %, filter 21–26 %,
  crt-full 42–45 %, worst 60–65 % — reproduces.
- **CRT full and `worst` are the pressure points, at every size and both GL versions.** 384×216
  crt-full already costs 30–31 % two-tick, so this is not a v2 regression — it is the existing cost
  of the CRT pass on this panel.
- **960×540 saturates.** `worst` 98–100 % two-tick in all three runs. The "viable on the M7" note
  §13 would attach to the busy row only should be read against that.
- **Decode (R1-05 B4) is the most reproducible data here.** Across the three runs the R3-04
  zone-load estimate came out **1493 / 1492 / 1495 ms** cold and **739 / 745 / 735 ms** for a zone
  change — both inside R3-04's 2000 ms, with ~25 % headroom, and essentially GL-independent.
  2048² PNG-8 decodes at ≈ 38–40 ms per megapixel; the 2048² RGBA page costs ≈ 780–790 ms file →
  GPU against the PNG-8 page's ≈ 350–360 ms, so PNG-8 is worth roughly 2.2× on page load.

## Anomalies observed during the runs

- **Screen blanking.** Expected between scenarios: the bench runs one scenario per page load
  (19 page loads a run), and each reload blanks the panel. *During* a scenario the blanking tracked
  the two-tick share closely — heavy on `crt-full` / `worst` / all of 960×540 (where 400–520 frames
  are measured instead of ~840), nearly absent on the light 384×216 rows. Consistent with the
  renderer missing the vsync deadline and the compositor having nothing new to present; the
  mechanism was **not** instrumented, so that is a hypothesis. `crt-full` blanked more than its
  two-tick share alone predicts, and the filtered paths are also the noisiest in p95 — a filter
  attached per frame would explain both. Worth a look in R6-02.
- **The on-screen results table truncates its last row.** The 960×540 `worst` row showed only its
  first few columns on the TV (no `synced p95` onward). Display-only: every column is present in the
  streamed payload and the analyzer prints the full row. Bench UI bug.
- **`sdb` wedged once** mid-session (its server had died; `sdb devices` hung). `sdb kill-server` →
  `start-server` → `connect` recovered it.

## Two sessions were discarded (not committed)

Two earlier `rb-…` sessions were thrown away before the three above and are **not** in this folder:

1. The first run was measured with the **remote Web Inspector attached**. The inspector had been
   opened over `sdb shell 0 debug` to verify the route for the WebGL 2 step, and the run started
   while it was still connected.
2. The relaunch **resumed** that run from the stored cursor instead of restarting, so one session
   held scenarios 0–1 measured under the inspector and 2–4 measured clean. Those two are the
   384×216 `busy` and `filter` **baselines** every other row's ratio is computed against, so the
   session was unusable — `analyze-bench.mjs` itself reported *"no baseline in this session"*.

How the bench starts, for whoever runs this next (`apps/tizen/src/bench/run.ts`):

- `run.ts:765` — `mode = state !== null && state.running ? 'scenario' : 'results'`.
- `run.ts:861` — **Enter only does anything in `results` mode**, where it calls `createRunState(
  makeRenderBenchSessionId(…))`: a fresh session id from scenario 0.
- With `running: true` stored, a launch goes straight to `scenario` mode and **resumes** — no Enter
  and no new session. `tizen run` on a live app only re-fronts it (same pid, inspector still live).
- Clearing `localStorage` from the inspector does not help mid-run: the page holds the state in
  memory and rewrites the key after each scenario.

So a clean run needs the app's storage empty *before* Enter:

```sh
sdb -s <tv>:26101 shell 0 was_kill ShmpCupBnc.RenderBench   # plain `0 kill` fails: "General error [-1]"
tizen uninstall -p ShmpCupBnc.RenderBench -s <tv>:26101     # the only reliable way to clear storage
TV_IP=<tv> pnpm bench:tv:install
TV_IP=<tv> pnpm --filter @shmup/tizen bench:run             # launches with debug 0
# then press Enter on the remote
```

For the WebGL 2 pass, write the key and then relaunch **without** the inspector, so no run is ever
measured with one attached — and do not uninstall, which would wipe the key:

```sh
sdb -s <tv>:26101 shell 0 debug ShmpCupBnc.RenderBench      # prints "port: <n>"
sdb -s <tv>:26101 forward tcp:<n> tcp:<n>
# set localStorage['shmup-cup:gl'] = '2' over the DevTools protocol on 127.0.0.1:<n>
sdb -s <tv>:26101 forward --remove tcp:<n>
sdb -s <tv>:26101 shell 0 was_kill ShmpCupBnc.RenderBench
TV_IP=<tv> pnpm --filter @shmup/tizen bench:run             # debug 0; page is in `results` mode
# then press Enter
```

`sdb shell <command>` is blocked on this retail set (`secure_protocol:enabled`,
`intershell_support:disabled`), so no TV-side reachability test is possible — the first scenario's
payload at the log server is the reachability check, as R0-03 step 2 intends. The `0 debug` /
`0 was_kill` forms do work.

## Firmware

Settings → About on the unit that ran (owner, 2026-10-19):

| Field | Value |
|---|---|
| Model | `LS43AM702UNXZA` |
| SW version | `M-KSU23MWWC-2750.0` |
| BT-S status code | `20001_AD3AE3_HC255` |
| Sub-micom version | `M-KTSU2INSM-1007` |

Plan R0-03 asks for this as a note on the unit that ran; the second monitor's run was skipped as
"only worth its time if its firmware differs", so compare against `M-KSU23MWWC-2750.0` before
deciding to run the other set.

## Not done here (plan R0-03's own scope)

- `docs/dev/input-probe-results.md` §12 and the §13 verdict — wave 15 `R0-03.A1` / `W15.DOCS-C`.
- The v2 render budgets for R3-04 / R6-02 — `A1` only *proposes* budgets in its report (decision
  W5-19); nothing here edits one.
- v1's first install from `v1.x` and the M3-02c measurement table
  (`docs/client/outstanding-work.md` §1.1), which R0-03 step 4 groups with this TV session.

# Input probe results

Raw logs from on-device runs, kept as evidence, and the analyzers that turn them into numbers. Two kinds of session
land here, both through `npm run log-server`: the **input probe**'s (`ip-…`) and, since plan step **M3-02f**, the
game's **render profile** (`rp-…`). The findings and what they change are written up in
[`docs/dev/input-probe-results.md`](../../../docs/dev/input-probe-results.md) — the render ones in its §11.

(`tools/input-probe/logs/`, where the log server writes, is git-ignored; copy a run here to keep it.)

## Runs

| Folder | Date | Hardware | Sessions |
|---|---|---|---|
| [`2026-09-15-m7/`](2026-09-15-m7/) | 2026-09-15 | 2× Samsung Smart Monitor M7 (M70A, Tizen 5.5, firmware `M-KSU2SMWWC-2750.0`), Smart Remote, DualShock 4 | `ip-mu37lye3-yj1x.jsonl` = monitor 10.0.0.8, `ip-mu37m64b-aqnb.jsonl` = monitor 10.0.0.224; `analysis-<ip>.txt` = the analyzer's report with the full timeline |

Each JSONL line is one report the probe POSTed every 3 s (`{session, seq, sentAt, env, verdicts, stats, newEvents,
droppedEvents}` plus the server's `receivedAt` / `from`) — format in
[`docs/dev/input-probe.md`](../../../docs/dev/input-probe.md#remote-logging).

## Analyzer

```sh
cd tools/input-probe
node results/analyze.mjs results/2026-09-15-m7/ip-mu37lye3-yj1x.jsonl             # summary
node results/analyze.mjs results/2026-09-15-m7/ip-mu37lye3-yj1x.jsonl --timeline  # + every event
```

It re-times every key event with `t + delay` (the handler time) because `event.timeStamp` on Tizen 5.5 only moves in
whole seconds — the probe's own `verdicts` / `stats.keys` in these logs are built on that broken clock and must not
be quoted. Frame and environment figures come straight from the reports.

## Render-profile analyzer (M3-02f)

```sh
cd tools/input-probe
node results/analyze-render.mjs logs/rp-<session>.jsonl             # the §11.1 / §11.2 tables, as Markdown
node results/analyze-render.mjs logs/rp-<session>.jsonl --windows   # + one line per sampling window
node results/analyze-render.mjs logs/rp-<session>.jsonl --all       # keep the windows a POST was in flight during
```

An `rp-…` session is written by the game's own dev build (`@shmup/shell`'s `telemetry` module, built with the same
`VITE_REPORT_URL`). Each JSONL line is `{kind:'render-profile', session, seq, sentAt, env, checklist, samples,
droppedSamples}` plus the server's `receivedAt` / `from`; each entry of `samples` is one ~3-second window with
`[min, median, p95, max]` of the frame, tick and render times and of the draw calls, a quantized histogram of each
of those series (`hist`), the `TPF` and `RAF` bucket counts, that window's structure rebuilds, the pooled
render-target total, the context it was taken in and the checklist items it fed (`marks`). A group's `p50` / `p95`
in the printed tables are **pooled over every frame of the group** — the histograms summed, the percentile read off
the total — so they are the same statistic as the `pnpm bench` p95s in `docs/dev/input-probe-results.md` §11.3.
The same *statistic*, not a comparable *magnitude*: these are the panel's milliseconds and the bench runs under
SwiftShader, so what transfers from it is its counted quantities (draw calls, pooled render-target bytes, structure
rebuilds, heap delta) and its in-run ratios, never its milliseconds. A figure marked `~` could not be pooled (a
session older than the histograms) and is the median of the windows' own percentiles, which understates the tail. `sendInFlightFrames` counts the frames the report POST itself was outstanding
during — the analyzer drops those windows unless `--all`, because the request runs on the main thread and its cost
would otherwise be recorded as the renderer's. Recipe:
[rendering-and-shell.md § Measuring on the TV](../../../docs/dev/rendering-and-shell.md#measuring-on-the-tv).

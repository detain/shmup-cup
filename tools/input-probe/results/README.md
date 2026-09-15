# Input probe results

Raw logs from on-device probe runs, kept as evidence, and the analyzer that turns them into numbers. The findings
and what they change are written up in [`docs/dev/input-probe-results.md`](../../../docs/dev/input-probe-results.md).

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

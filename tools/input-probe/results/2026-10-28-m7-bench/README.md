# M7 TV render bench — 2026-10-28 session (build `4b37d12`, GL 1) — and the first real-device `hb-` record

The 190-row matrix ran again on the Samsung M7, this time on a build whose `buildId` is a git
SHA — `4b37d12`, the harbench widget-row commit itself — instead of a date string. The run
lands 190 of 190 rows of render-bench data, and, for the first time on hardware, one
`harbench` payload: the S1 rewind row posted on the `hb-` wire the SCHEMA/HB-WIRE era built.
That record is the wire's acceptance test, and it passes the zero-trust validator with zero
issues on the device's own data.

## The unit

| | |
|---|---|
| TV | Samsung M7 (Tizen 5.5, Chromium 69.0.3497.106) |
| Address | 10.0.0.224 |
| Engine | WebGL 1 (`webGLVersion: 1`), no GL 2 pair ran — the GL1-vs-GL2 section is empty |
| Bundle | `apps/tizen/dist-bench/`, 5.95 MB unpacked of 24 MB budget, `env.buildId = 4b37d12` |

`4b37d12` is the short SHA of `4b37d123` — *feat(tizen): harbench widget rows — rewind POST,
colour keys, 960x540 and big-frame video, surface decode*. So the numbers below are tied to a
commit, not to a calendar day: the identity this build stamps is its own git SHA (earlier TV
sessions stamped `m7-2026-10-27` or the synthetic `8ba0e7c@960x540` — different builds, and by
the partition law below they are never pooled with these rows).

## The files

| File | What it holds |
|---|---|
| `rb-mvrgnp3z-31fw.jsonl` | The render-bench run: 192 payloads, all `kind: render-bench`, `seq` 1..192 contiguous, 191 unique scenario rows — the 190-row matrix plus the `standin-zone` row (the decode record rides `seq` 192). Received 2026-10-28 01:54:07Z → 03:31:42Z (~97.6 min). |
| `hb-mvrk5wgl-ik7a.jsonl` | **The first `harbench` record from real hardware.** One payload, `session hb-mvrk5wgl-ik7a`, the S1 `rewind` row (`index` 192), received 2026-10-28 03:31:44.941Z — 2.0 s after the last render-bench payload. Validated below. |
| `analysis-190.txt` | The full analyzer table set for the `rb-` file (see regeneration). |

The committed tables were re-generated from the analyzer at this commit and are byte-identical
to the runs they came from. From this folder:

| Command | Produces |
|---|---|
| `node ../analyze-bench.mjs rb-mvrgnp3z-31fw.jsonl --full > analysis-190.txt` | `analysis-190.txt` |

## The `hb-` record — the wire's acceptance test

The HB-WIRE lane shipped a zero-trust validator in the shell's telemetry module
(`harbenchPayloadIssues` / `isHarbenchPayload`, `packages/shell/src/telemetry/index.ts` — the
canonical entry, commit `8ee8f91f`). It has been exercised on synthetic payloads ever since;
this is the first time real device bytes go through it. Run with
`node --experimental-transform-types` against the source module (the server's own port of it is
still pending — see *Not done here*), the record scores:

```text
=== REAL DEVICE RECORD ===
issues: 0
isHarbenchPayload: true
```

— and the pass is non-vacuous: ten mutations of the same record are each rejected with its own
field message:

| Mutation | Rejection |
|---|---|
| `kind` → `render-bench` | `kind. must be harbench` |
| `formatVersion` → `2` | `formatVersion. unsupported wire version` |
| `session` → `rb-x` | `session. must be an hb- id: hb- then 1 to 61 of A-Z a-z 0-9 . _ -` |
| `sentAt` → `null` | `sentAt. must be a non-negative finite number` |
| `env.gameMode` → `"true"` | `env.gameMode. must be a boolean` |
| `env.phase` → `null` | `env.phase. must be a non-empty string` |
| `record.capTicksEstimated` → `1` | `records[0].capTicksEstimated. must be a boolean` |
| `record.error` → `7` | `records[0].error. must be a non-empty string or null` |
| `record` discriminator → `bogus` | `records[0].record. unknown record kind at format version 1` |
| `stepsPerSecond` stringified | `records[0].stepsPerSecond. must be a non-negative finite number` |

What the device reported: the rewind row ran 12,000 ticks in ~1.04 s (**14,700 steps/s**),
the world build cost 50.2 ms, the 20 hash checks 1.585 ms in total, and `capTicks` 4,900 came
back with `capTicksEstimated: true` — the M7 estimate still stands, as the build's commit body
promised it would. `stage: bench-rewind`, `error: null`. The payload's env carries the new
named fields — `phase: "S1"`, `gameMode: true` — and `output` rides additively (not a named v1
field; it passes by the compat law).

## The launch and the `done` quirk

As on 2026-10-27, the final `done` POST is absent from the `rb-` session — the known rewind-page
quirk: the run hands off to the rewind row (which navigates and posts on the `hb-` wire) and the
render-bench session's `done` never fires. The analyzer therefore prints the run as
**incomplete**; it is cosmetic — 190 of 190 scenarios measured, every matrix row landed, and the
`done` flag that does exist rides the `hb-` payload (`done: true`, one second later).

## Partition law

`m7-2026-10-27` is a **different build** — its `buildId` was the date string, its matrix lacked
the 16 new 960×540/big-frame-video rows. Its numbers are context for reading these, never data
pooled with them: no two-run noise floor exists for `4b37d12`, and every delta, knob ratio and
§13 step below carries that caveat — one run per version, `—` where the floor would speak. The
noise floor still awaits a same-build repeat.

## Headline numbers

Two-tick share (GL 1, 640×360 plain): busy 14.5 %, filter 21.1 %, mode7 16.0 %,
CRT-light 8.7 %, CRT-full 41.3 %, worst 57.0 %; synced p95 13.3–17.7 ms. The 384×216
baseline reads 0.4 / 3.4 / 0.4 / 1.2 / 29.1 / 33.3 %.

§13 at 640×360 against the same run's 384×216: +14.1 busy, +17.6 filter, +15.6 mode7, +7.5
CRT-light, +12.2 CRT-full, +23.7 worst — **all six variants performance-step**, as they did on
2026-10-27. The analyzer's own note stands after v2: 960×540-busy (+34.8, p95 15.10 ms) lands
the same §13 tier as 640×360-busy — *960×540 is viable on the M7* once the frame budget moves.

The new 960×540 knob pairs (plain → knob, two-tick points, p95 ratio) measure the whole
downscale story in one run:

| Knob at 960×540 | busy | worst |
|---|---|---|
| out720 | 35.2 → 1.8 (−33.3), p95 0.85× | 96.6 → 32.2 (−64.4), p95 0.74× |
| out540 | 35.2 → 0.2 (−34.9), p95 0.88× | 96.6 → 27.6 (−69.1), p95 1.08× |
| fit | −2.6, p95 0.82× | −0.4, p95 0.63× |
| stretch | −2.9, p95 0.82× | +1.0, p95 0.65× |
| interp | −3.2, p95 0.86× | −1.6, p95 0.60× |

Output-resolution capping is the only knob that moves 960×540 at all (fit/stretch/interp shave
single digits); out540 takes busy to 0.2 % — the 960×540 story is entirely "what the upscale
target is", not the scene.

The video knob's p95 story, asked on 2026-10-27 (one row pair, negative, no floor to judge it
by), reads clean at 4× the evidence: **all eight video p95 ratios are below 1.0** — every video
row lands under its plain row's p95 at every size, 0.75–0.82× at 640×360 and 960×540, 0.82–0.96×
at the big frames. The two-tick shares split: video wins busy at 640×360 (14.5 → 7.0, −7.5) and
wins big at 1280×720n (**73.3 → 52.2, −21.1**), costs nothing measurable at 1920×1080n (saturated
both arms, 0.90×/0.96× p95 still), and pays +3.0 busy at 960×540 with −0.3 worst. Still unjudged
against a noise floor — same-build repeat first — but the direction is no longer one row deep.

Big-frame plain rows for scale: 1280×720n busy 73.3 (p95 33.5 ms), 1024×768n busy 57.3,
1280×960n busy 91.6, 1920×1080n busy 99.7 (p95 60.4 ms) — the TV saturates past 720p busy.

## Decode

The page-decode scenario (8 reps, bitmap branch taken): stand-in zone-A page 2048×1024 PNG-8,
344 KB — file→GPU p50/p95 204.7/448.7 ms (first 448.7 ms), decode 67.0/135.1 ms + upload
23.9/28.6 ms on the bitmap path; common 2048×1024 RGBA 328 KB — 374.5/381.1 ms; zone-A 512×512
RGBA 35 KB — 85.2/90.2 ms. The R3-04 estimate from these: **cold load 664 ms, zone change
293 ms**, both inside the 2,000 ms budget; PNG-8 costs ≈ 73.8 ms per megapixel against the
same-pixel RGBA page.

The four R7-VID clip rows (attract-ambient, warn-zone-a, title-sting, ark-sailing — 640×360
avc1, 0 KB attributed) all report **`video surface unavailable`** — the surface-decode scenario
measured nothing on the M7 tonight. The clips ride in the bundle; the decode surface path this
build added did not open on this TV. That is a scenario question for the next session, not a
number.

## Not done here

- No same-build repeat, so no noise floor — every `—` in the tables is unfilled and the video
  p95 win stays a direction, not a verdict.
- No GL 2 pair ran — the GL1-vs-GL2 comparison is empty by absence, not by result.
- The log server does not yet validate `hb-` payloads — `harbenchPayloadIssues` has no port in
  `server/log-server.mjs`; the device record above was validated against the shell's source
  directly. The server-side port is the HB-WIRE follow-up.
- The R7-VID surface decode is unmeasured on hardware (`video surface unavailable` above).
- Owner's packaging and the Tizen install of the bench widget are, as ever, outside this lane.

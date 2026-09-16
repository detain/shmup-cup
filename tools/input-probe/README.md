# Input Probe

A throwaway diagnostic Tizen web app (`.wgt`) that measures how the **Samsung Smart Monitor M7 (M70A, Tizen 5.5)**
and its **Smart Remote** (plus gamepads) actually behave, before we design Shmup Cup's controls.
Spec: [`../../input_probe_spec.md`](../../input_probe_spec.md). Results go into `shmup_tech.md` §2.7 and drive the
remote control scheme in `shmup_feat.md` §4.

This is a **standalone npm project** — it is not part of the pnpm workspace at the repo root. Always run `npm`
commands from `tools/input-probe/`.

More documentation: [tester guide](../../docs/client/input-probe.md) (screen, protocol, reading the verdicts) ·
[monitor setup & install](../../docs/client/install-on-tv.md) · [developer guide](../../docs/dev/input-probe.md)
(architecture, module APIs, report format, extension points, gotchas).

## What it shows

One 1920×1080 stage (scaled to the window), everything visible at once — no navigation needed:

| Area | Contents |
|---|---|
| Header | Title, key environment facts, session id, "Back ×3 quickly = exit", report status |
| Left | **Event log** (last 28 events: `t(ms) DOWN/UP name(code) repeat=0/1 kind Δ`, plus info lines) and the **Environment** block (UA, Chromium/Tizen version, window size & DPR, WebGL1/2 + `MAX_TEXTURE_SIZE` + GPU, WASM, AudioWorklet, OffscreenCanvas, audio sample rate / base latency, model / firmware) |
| Center | **Arena**: three ships driven by the same input — **A raw** (held between keydown/keyup), **B debounced** (held, or released < 50 ms ago), **C naive** (fixed step per keydown incl. repeats); 240-frame **movement timelines** (gaps = stutter); **frame-time graph** (16.7 / 33.3 ms guides, red ticks = hitches > 20 ms); **latency flash box** (white for 4 frames on every non-repeat keydown); the test protocol |
| Right | **Verdicts & stats** (diagonals, OK-while-arrow-held, repeat style / delay / interval, bounces, max keys held, longest hold, dispatch delay, frame rate), **checklist** (auto-ticks), **seen keys**, **registered keys** (`getSupportedKeys()` + per-key `registerKey` result; everything except `Exit`), **gamepads** |

Every event is also written with `console.log` (visible in the Chrome DevTools remote inspector).
**Play/Pause** (or keyboard **R**) resets the hold/repeat/frame stats. **Back pressed 3× within 1.5 s** exits the app
(long-press Back / Home leave via the system as usual).

> Registering the volume keys takes volume control away from the monitor while the probe runs — use the monitor's
> own menu or exit the probe to change the volume.

### How the verdicts are decided

All thresholds live in `src/keyTracker.ts` (`DEFAULT_KEY_TRACKER_OPTIONS`).

- **Bounce / fake keyup-keydown pair:** a `keyup` followed by a `keydown` of the same key within **60 ms**. The
  logical ("bounce-merged") hold continues through it.
- **Repeat style:** the most frequent of *clean* (`keydown` with `repeat=true`), *keydown without the repeat flag*
  (another `keydown` while the key is down, `repeat=false`) and *fake pairs*. Repeat **delay** = press → first repeat
  event; **interval** = between repeat events (⇒ Hz).
- **Diagonals YES:** two arrows logically held together for ≥ 60 ms. **NO:** the first arrow is released within 60 ms
  of the second arrow's press (before or after), when the first had been held ≥ 200 ms (quick sequential taps are
  ignored).
- **OK while arrow held:** *kept* = the arrow is still held 60 ms after OK; *dropped* = the arrow is released within
  60 ms of the OK press (arrow held ≥ 200 ms before OK); *kept (release blip)* = the arrow got a keyup within 60 ms of
  OK but was immediately re-pressed (a fake pair).
- **Dispatch delay:** `performance.now() - event.timeStamp` at handler time.
- **Frames:** median ⇒ Hz, p95 and max over the last 600 rAF deltas; hitches = deltas > 20 ms; deltas > 500 ms
  (app hidden) count as pauses.
- **Window `blur`** clears all held keys (logged). `visibilitychange` is logged; hidden → visible ticks
  "left (Home) and returned".

## Prerequisites

- **Node 24** (or 22.12+) and npm. Node 20.19 is enough for `build` / `package` / `deploy` / `log-server`, but the
  tests (`npm test`, `npm run verify`) use Vitest 5, which needs Node 22.12+.
- To package / deploy (Windows desktop on the monitors' LAN):
  - **Tizen Studio** (with the TV extensions) **or** **VS Code + the Samsung Tizen extension** and its SDK — anything that
    provides the `tizen` CLI (`tizen.bat` on Windows) and `sdb`.
  - A **Samsung certificate profile** (Certificate Manager in Tizen Studio, or *Tizen: Certificate Manager* in VS Code)
    whose **distributor certificate lists both monitors' DUIDs**. Remember the profile name.
  - Both monitors in **Developer Mode** pointing at the desktop: Apps panel → type `12345` (Color/Number on-screen pad
    or the SmartThings virtual remote) → Developer mode **On** → Host PC IP = the desktop's IP → restart the monitor.

## Build & run in a desktop browser

```sh
cd tools/input-probe
npm install
npm run dev          # Vite dev server (http://localhost:5173) — keyboard arrows/Enter/R work
npm run verify       # typecheck + tests + build + check:compat
```

Individual scripts:

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server (desktop browser; `$WEBAPIS/webapis/webapis.js` 404s harmlessly) |
| `npm run build` | Production build into `dist/`: `index.html`, classic IIFE `app.js` (target `chrome69`), `app.css`, `config.xml`, `icon.png` |
| `npm run preview` | Serve `dist/` locally |
| `npm run typecheck` | `tsc --noEmit` for the app (strict, ES2018 lib), the build config and the tests |
| `npm test` | Vitest suite, headless in Node (see [Tests](#tests)) |
| `npm run check:compat` | Checks `dist/`: `app.js` parses with acorn at **ecmaVersion 2018** as a classic script, `index.html` has no `type="module"`/`crossorigin`, `config.xml` + `icon.png` present |
| `npm run icon` | Regenerates `public/icon.png` (dependency-free Node PNG writer) |
| `npm run package` | Build → check → `tizen package -t wgt -s $TIZEN_PROFILE -- dist` ⇒ `dist/InputProbe.wgt` |
| `npm run deploy` | `sdb connect $TV_IP` → `tizen install -n InputProbe.wgt -s <ip>:26101 -- dist` → `tizen run -p ShmpCpIPrb.InputProbe -s <ip>:26101` |
| `npm run log-server` | Optional JSONL log receiver on port 8787 — it takes the probe's payloads (`ip-…` sessions) **and** the game's render telemetry (`rp-…`, plan M3-02f) |

## Package & deploy — Windows (the desktop next to the monitors)

`cmd.exe`:

```bat
cd tools\input-probe
npm install

rem Only needed if tizen.bat is not on PATH and not in C:\tizen-studio or %USERPROFILE%\tizen-studio:
set TIZEN_CLI=C:\tizen-studio\tools\ide\bin\tizen.bat

set TIZEN_PROFILE=shmupcup
set TV_IP=192.168.1.50,192.168.1.51

npm run package
npm run deploy
```

PowerShell:

```powershell
cd tools\input-probe
npm install
$env:TIZEN_CLI = "C:\tizen-studio\tools\ide\bin\tizen.bat"   # only if auto-detection fails
$env:TIZEN_PROFILE = "shmupcup"
$env:TV_IP = "192.168.1.50,192.168.1.51"
npm run package
npm run deploy
```

Options (append after `--`, e.g. `npm run deploy -- --no-run`):

- `package.mjs`: `--profile <name>` (instead of `TIZEN_PROFILE`), `--skip-build`, `--tizen <path>`, `--dry-run`.
- `deploy.mjs`: `--ip <ip[:port]>[,<ip>…]` (instead of `TV_IP`; default port 26101), `--package` (re-package first;
  otherwise it packages only when `dist/` has no `.wgt`), `--profile <name>`, `--no-run`, `--tizen <path>`,
  `--sdb <path>`, `--dry-run` (print the commands without running them).

Environment variables: `TIZEN_PROFILE`, `TV_IP`, `TIZEN_CLI` (path to `tizen`/`tizen.bat`), `TIZEN_SDB` (path to
`sdb`/`sdb.exe`; default `<sdk>\tools\sdb.exe` next to the CLI), `TIZEN_SDK` (SDK root for auto-detection).
The scripts run `tizen.bat` through `cmd.exe` with proper quoting (Node cannot spawn `.bat` files directly), so paths
and profile names with spaces are fine.

**Using the VS Code Tizen extension instead of the scripts:** run `npm run build`, then open `tools/input-probe/dist`
as the Tizen project (it contains `config.xml`), pick the certificate profile, and use the extension's
*Build Signed Package* / *Run on TV* commands against each monitor. The scripts above do the same thing and also work
with the SDK the extension installs (point `TIZEN_CLI` at its `tizen.bat`).

**Debugging:** use Chrome DevTools remote inspection — Tizen Studio *Debug As → Tizen Web Application*, or the VS Code
extension's debug command (both launch the app in debug mode and open the inspector). The event log is mirrored to
`console.log`, so the console shows every key event with timestamps.

Troubleshooting:

- *Tizen CLI not found* → set `TIZEN_CLI`.
- *no certificate profile* → set `TIZEN_PROFILE`; list profiles with `tizen security-profiles list`.
- *sdb connect failed* → monitor on, same LAN, Developer Mode Host PC IP = this PC, monitor restarted after enabling it.
- *install failed* → the distributor certificate must include this monitor's DUID; if an older build signed with a
  different author certificate is installed, uninstall it on the monitor first.

## Package & deploy — Linux / macOS

Same scripts; the CLI is `~/tizen-studio/tools/ide/bin/tizen` (auto-detected, or set `TIZEN_CLI`).

```sh
cd tools/input-probe
npm install
export TIZEN_PROFILE=shmupcup
export TV_IP="192.168.1.50 192.168.1.51"
npm run package
npm run deploy
```

## Optional: remote logging to the desktop

Read the results on the PC instead of squinting at the TV:

```bat
rem 1) start the receiver (zero dependencies); it prints the LAN URLs to use
npm run log-server

rem 2) in a second terminal, build with the report URL baked in, then package & deploy
set VITE_REPORT_URL=http://192.168.1.20:8787
npm run package
npm run deploy
```

(PowerShell: `$env:VITE_REPORT_URL = "http://192.168.1.20:8787"`; Linux: `VITE_REPORT_URL=… npm run package`.)

Every 3 s the probe POSTs `{session, seq, sentAt, env, verdicts, stats, newEvents, droppedEvents}` to
`<url>/report` as `text/plain` JSON (no CORS preflight). The server appends one JSON line per POST to
`tools/input-probe/logs/<session>.jsonl` (override with `LOG_DIR`; port/host with `PORT`/`HOST`) and prints a summary.
`GET /` lists sessions. Allow Node through the Windows firewall on private networks when prompted. The header shows
the report status (`#seq ok` / errors); events are buffered and re-sent if the server is unreachable.

## On-device test protocol (also shown in the app)

1. Tap each arrow, OK and Back once.
2. Hold → for 3 s; release. Repeat with ↑.
3. Hold →, then also press ↑ (diagonal attempt).
4. Hold →, then tap OK (chord attempt).
5. Press every other remote button: Play/Pause, Ch±, Vol±, Color/Number pad keys.
6. Film the flash box with a 240 fps phone camera while tapping OK ~10 times (count frames from press to flash:
   frames ÷ 240 = seconds of thumb-press → light latency).
7. Pair a gamepad (and a second one) and press buttons / move sticks.
8. Press Home, then return to the app.
9. Record the Verdicts panel (photo) or collect the JSONL log from the log server.

Watch the three lanes while holding an arrow: if **A** stutters (gaps in its timeline) but **B** is smooth, the remote
sends fake keyup/keydown pairs and the game needs release debouncing; **C** shows what naive per-event movement feels
like (initial pause, then repeat-rate steps).

## Layout

```
tools/input-probe/
  package.json / package-lock.json   standalone npm project
  tsconfig.json                      app: strict, target/lib ES2018 + DOM, moduleResolution bundler
  tsconfig.node.json                 vite/vitest config (Node lib)
  tsconfig.test.json                 tests (ES2023 + DOM lib, imports src/, scripts/*.mjs, server/*.mjs)
  vite.config.ts                     base './', target chrome69 (+es2018), single IIFE app.js, classic <script>
  vitest.config.ts                   test runner config (Node environment, test/**/*.test.ts)
  index.html                         stage markup, $WEBAPIS/webapis/webapis.js tag
  public/config.xml, public/icon.png Tizen widget config & icon (icon from scripts/make-icon.mjs)
  src/
    main.ts          DOM/Tizen glue: listeners, rAF loop, 10 Hz UI, report timer
    keys.ts          key codes, names, preventDefault policy, register list            (pure)
    keyTracker.ts    raw/logical/debounced key state + all verdicts & hold stats     (pure)
    ships.ts         three lanes, trails, timelines                                   (pure)
    frameStats.ts    frame-time ring, median/p95/hitches, running stats              (pure)
    checklist.ts     auto-ticking test checklist                                      (pure)
    gamepad.ts       gamepad snapshots + edge detection                               (pure)
    eventLog.ts      event records + log formatting                                   (pure)
    summary.ts       verdict text, panels, report parts                               (pure)
    report.ts        report payload queue, endpoint, session id                       (pure)
    envInfo.ts       environment shape + formatting                                   (pure)
    exitGesture.ts   Back ×3 detector                                                 (pure)
    format.ts        number/text helpers                                              (pure)
    arena.ts, ui.ts, env.ts, platform.ts, reporter.ts, polyfills.ts   thin DOM/Tizen glue
    tizen.d.ts, vite-env.d.ts, style.css
  test/              Vitest suite (Node environment) + helpers/ (fake browser/Tizen realm, fake XHR/canvas, PNG reader)
  scripts/           package.mjs, deploy.mjs, lib/tizen.mjs, check-compat.mjs, make-icon.mjs
  server/log-server.mjs          receiver for both senders (ip-… and rp-… sessions)
  results/analyze.mjs            re-analysis of an input-probe session
  results/analyze-render.mjs     the game's render profile → the §11 tables (M3-02f)
```

## Tests

`npm test` runs everything headless in Node on Linux, macOS or Windows (no jsdom, no Tizen SDK, no monitor; a few
POSIX-only tests of the package/deploy scripts are skipped on Windows):

- **Pure logic** — `keyTracker` (press/repeat/flagless/bounce classification, raw/logical/debounced/naive views,
  repeat delay & interval, bounce gaps, max held, longest hold, diagonal and OK-chord verdicts incl. window
  boundaries, `releaseAll`, stats reset), `keys`, `checklist`, `frameStats`, `ships`, `gamepad`, `eventLog`,
  `format`, `exitGesture`, `report`, `summary`, `envInfo` (incl. Samsung's published Tizen 5.5/6.0 user agents).
- **DOM/Tizen glue** with small fakes — `platform` (key registration without `Exit`, exit), `env`, `ui`, `arena`,
  `reporter` (XHR retry/in-flight rules).
- **Build output** — a real `vite build` into a temp dir: exactly the widget files, `index.html` loads `app.js` once
  as a classic deferred script, relative URLs only, `app.js` is a single IIFE that parses with acorn at
  `ecmaVersion: 2018`, no post-Chromium-69 APIs, `check:compat` passes.
- **End-to-end** — the built `app.js` runs in a `node:vm` realm made to look like the Tizen 5.5 runtime (fake DOM,
  `tizen`, `webapis`, gamepads; post-Chromium-69 builtins and `globalThis` removed): the on-device protocol is played
  as key events and the panels are checked (verdicts, checklist, key registration, environment, flash box, Back ×3
  exit). A `VITE_REPORT_URL` build's POSTs are replayed into the real log server.
- **Scripts** — `check-compat.mjs` against pass/fail fixtures, `make-icon.mjs` reproduces the committed icon,
  `lib/tizen.mjs` (argument parsing, cmd.exe quoting, CLI/sdb discovery incl. a simulated Windows), and
  `package.mjs` / `deploy.mjs` run from a temp copy of the project against fake `tizen`/`sdb` executables.
- **Log server** — HTTP end-to-end on 127.0.0.1 (JSONL per session, validation, 404/413, CORS, path sanitizing), for the
  probe's payloads and for a render-telemetry one (`analyzeRender.test.ts` also drives `results/analyze-render.mjs`
  over a fixture session).

# Installing development builds on a Samsung Smart Monitor / TV

Shmup Cup builds are not in the Samsung store. During development they are installed ("side-loaded") from the
Windows desktop that sits on the same network as the monitors. This page covers the one-time setup of a
monitor and the PC, how to install, start and remove an app, the game-mode build for the latency
test and live reload for developers. Two apps can be installed today: the
**Input Probe** ([input-probe.md](input-probe.md)) and the **game preview**, in which you fly the KESTREL ship
around an empty starfield with the remote ([preview-build.md](preview-build.md)). Both use the same one-time
setup.

Test hardware: 2× Samsung Smart Monitor M7 43" (LS43AM702UNXZA / M70A, Tizen 5.5).

## One-time setup

### 1. On the PC

- **Git** and **Node.js 24** (24.15+). The input probe alone also runs on 22.12+ (20.19 is enough to build and
  deploy it but not to run its tests); the game itself needs Node 24.
- **Tizen Studio** with the TV extensions, **or** **VS Code** with the **Samsung Tizen extension** and its SDK. Either
  one provides the `tizen` command (`tizen.bat` on Windows) and `sdb`.
- A **Samsung certificate profile**, created in *Tools → Certificate Manager* (Tizen Studio) or
  *Tizen: Certificate Manager* (VS Code). Choose the **Samsung** certificate type for **TV**, sign in with a Samsung
  account, and make sure the **distributor certificate lists the DUID of every monitor** you want to install on
  (the wizard can read the DUID of a monitor that is currently connected with `sdb`/Device Manager). Remember the
  profile's name — the scripts need it as `TIZEN_PROFILE`.
- Note the PC's LAN IP address (`ipconfig` in a Command Prompt → *IPv4 Address*).

### 2. On each monitor

1. Open the **Apps** panel.
2. Type **1 2 3 4 5**. The Smart Remote has no number keys: open the on-screen **Color/Number** pad (or use the
   SmartThings app's virtual remote) to type them.
3. In the *Developer mode* dialog switch **Developer mode: On** and enter the PC's IP as **Host PC IP**.
4. **Restart the monitor** (switch it fully off and on).
5. Note the monitor's own IP: *Settings → General → Network → Network Status → IP Settings*.

Also recommended on the test monitors: turn **Auto Source Switch+** off, so a waking PC does not switch the
monitor to HDMI / USB-C in the middle of a test.

## Installing and starting an app

From the app's folder on the PC (for the probe: `tools\input-probe`):

```bat
npm install
set TIZEN_PROFILE=shmupcup
set TV_IP=192.168.1.50,192.168.1.51
npm run package
npm run deploy
```

`npm run deploy` connects to each monitor, installs the package and starts it. Full details (PowerShell, Linux,
options, the VS Code extension route): [`tools/input-probe/README.md`](../../tools/input-probe/README.md).

After installation the app stays in the monitor's **Apps** panel and can be started from there without the PC.

## Installing the game preview

The game lives in the main part of the repository, which uses **pnpm** instead of npm and needs a slightly
newer Node.js: **Node 24.15+** (Node 22 is not supported) and **pnpm 12** (`npm i -g pnpm@latest`; `pnpm -v` must print 12.x).
From the repository root, in a Command Prompt:

```bat
set ELECTRON_SKIP_BINARY_DOWNLOAD=1
pnpm install
pnpm --filter @shmup/tizen build

set TIZEN_PROFILE=shmupcup
set TV_IP=192.168.1.50
pnpm --filter @shmup/tizen tizen:package
pnpm --filter @shmup/tizen tizen:install
pnpm --filter @shmup/tizen tizen:run
```

- `ELECTRON_SKIP_BINARY_DOWNLOAD=1` skips the desktop (Electron) download, which the TV does not need.
- `build` creates `apps\tizen\dist`; `tizen:package` signs it into a `.wgt` in the same folder.
- `tizen:install` and `tizen:run` handle **one monitor per run**: for the second monitor change `TV_IP` and run
  those two commands again. (The input probe's `deploy` accepts a comma-separated list; the game scripts do not.)
- After every new `build`, run `tizen:package` again before installing.
- PowerShell: `$env:TIZEN_PROFILE = "shmupcup"; $env:TV_IP = "192.168.1.50"` instead of `set`.
- **Which game you build** depends on the branch. The default branch, `master`, is v2 — the
  released 2.0.0 of 2026-10-24 (v2 draws the bigger picture and the 1½× world; rules, ticks and scores
  unchanged); the released v1 game, version 1.0.0 and its fixes, is on the `v1.x` branch — `git switch`
  `v1.x` before `pnpm install` to build that one. Going from a `master` build back to a `v1.x` build
  on the same monitor needs the app removed first ([Removing an app](#removing-an-app)).

The app appears in the Apps panel as **Shmup Cup** (since the v1.0 release candidate with its placeholder icon,
the logo above the two ships; the app's details give its version as **1.0.0** for the v1.0.0 release,
**1.0.1** for a build of the `v1.x` branch since, and **2.0.0** for a build of `master` —
[release-candidate.md](release-candidate.md#where-you-see-the-version)) and opens on the title screen. To leave it, press **Back** on
the title and answer **YES** to **EXIT SHMUP CUP?** (in a game, Back pauses first — choose QUIT TO TITLE), or press
**Home**. What it should look like: [preview-build.md](preview-build.md).
If it opens on a navy screen with a pink error title instead, the build is broken — photograph the screen, press
**Back** to close the app, and see [preview-build.md](preview-build.md#when-the-app-shows-an-error-screen).
More options (custom `tizen`/`sdb` paths): [`apps/tizen/README.md`](../../apps/tizen/README.md).

**Saved settings and high scores.** The game keeps its Options (volumes, the control profile and
the other CONTROLS, DISPLAY and GAME settings, your rebound remote buttons, the difficulty you chose)
and its high scores on the monitor itself, inside the app's own storage. Installing a newer build over
the old one should keep them (the app stays the same app) — please report it if an update loses
them. **Removing the app deletes them** (the TV does that for every app), so the next install starts
with the default settings and no high scores. Each monitor keeps its own. (The first launch of the
front-end build moves two-player scores that older builds kept in the one-player tables into the new
2 PLAYERS tables — they are not lost, just listed separately; rows saved before initials existed
show `---`. The first launch of the Options build updates the saved data to its new form by itself:
everything saved before is kept, the new settings start at their start values.)

**The debug build (developer tools).** For the on-device checks of a milestone, build with
`build:dev` instead of `build` and package and install as above:

```bat
pnpm --filter @shmup/tizen build:dev
pnpm --filter @shmup/tizen tizen:package
pnpm --filter @shmup/tizen tizen:install
pnpm --filter @shmup/tizen tizen:run
```

It is the same app (it replaces the normal build and keeps its saved data) and plays the same,
but Play/Pause followed by Channel up three times opens a measuring panel and the developer
tools — see [debug-tools.md](debug-tools.md). Build with plain `build` again before handing the
game to anyone else.

Since the platform-polish build the app also asks the TV for its **product information**
permission (model name and firmware — only the debug build's panel reads them). The monitor grants
it on install; nothing to confirm.

## The game-mode build (latency A/B test)

Newer Samsung TVs can switch their panel to a low-latency **Game Mode** when an app asks for it.
Whether that works for a game like this one — and whether the M7 monitors react at all — is
unknown, so the normal build does **not** ask for it. A second build that does lets you compare
the delay from the remote to the screen (plan §8.5):

```bat
pnpm --filter @shmup/tizen build:game-mode
pnpm --filter @shmup/tizen tizen:package
pnpm --filter @shmup/tizen tizen:install
pnpm --filter @shmup/tizen tizen:run
```

1. Install the **game-mode build**, start a game and film about ten short arrow presses and the
   ship's movement at 240 frames per second, the remote and the screen in the same shot (as in the
   input probe's latency test — [input-probe.md](input-probe.md)), and note whether the monitor
   shows a Game Mode notice or changes its picture.
2. Install the **normal build** (`pnpm --filter @shmup/tizen build`, then the same three commands)
   and film the same.
3. Report both delays (frames between the press and the ship moving) per monitor. The faster one
   becomes the shipped build.

It is the same app as the normal build (it installs over it and keeps your saves) and plays the
same. For the debug build with game mode, set `TIZEN_GAME_MODE=1` before `build:dev`
(Command Prompt: `set TIZEN_GAME_MODE=1`) — and clear it again afterwards (`set TIZEN_GAME_MODE=`),
or every later build asks for Game Mode too.

**Never ship a build made with `TIZEN_GAMEPADS` set.** That variable makes a build that checks for
a gamepad when it starts — the TV then shows a popup whenever no gamepad is connected, which is
wrong for a game played with the remote. It exists only for testing that Samsung feature.

## The owner's capture kit (render telemetry and the TV bench)

The checklist the R6-02.P2 lane verified with real builds on `master` (both the debug game build
and the bench bundles passed their checks with the address baked in). It runs the **guided render
capture** (the debug build's telemetry, [debug-tools.md](debug-tools.md#the-guided-capture-preferred))
on both M7 monitors, and the **TV render bench** beside it, so the analyses (plan R0-03, the
WebGL 1-vs-2 decision) get their sessions. **State since wave 15:** the 2026-10-19 bench capture
is analysed — `R0-03.A1` wrote its tables into
[input-probe-results.md §12](../dev/input-probe-results.md#12-resolution-benchmark-r0-03) and
`R6-02.P3` closed R6-02's five budgets in
[render-performance-review.md §9](../dev/render-performance-review.md), all four P4 lanes NOT
NEEDED — and P4d stays closed-not-needed even when fresh pairs arrive, since the measured GL 2
gain is 1080p-fill-only (§9). The kit stays **open** as the owner's step: the `rp-` guided
capture has never run — the boot ≤ 10 s and whole-process-memory measures ride only on it — and a
future bench campaign per monitor still goes in the GL1-vs-GL2 pair. Package, install and run on
a TV are the **owner's** —
`sdb`, the Tizen CLI, `tizen:package` / `tizen:install` / `bench:tv:package` / `bench:tv:install`
are never run by a tooling agent, and no log-server address is ever committed.

Prerequisite: the desktop and both monitors are on the same network; a checkout of `master`;
Node 24 and `pnpm install` done at the repo root; in `tools/input-probe/` run `npm install`
once (the log server itself is zero-dependency, so it runs without it too).
On Windows, allow Node through the firewall on the **private** network when first prompted —
or the monitors cannot reach the server.

### Step 1 — start the log server (desktop)

```sh
cd tools/input-probe
npm run log-server
```

It prints (exact shape from `server/log-server.mjs`):

```
input-probe log server listening on http://0.0.0.0:8787  (logs → <repo>/tools/input-probe/logs)
Receives the input probe (ip-… sessions), the game's render telemetry (rp-…) and the TV render bench (rb-…).
Build the probe — or the game's Tizen dev bundle, or the TV render bench — with one of:
  VITE_REPORT_URL=http://<desktop-ip-1>:8787
  VITE_REPORT_URL=http://<desktop-ip-2>:8787
```

Use one of the printed `http://<ip>:8787` addresses as `<LOGSERVER>` below (the one the monitors'
network, e.g. `10.0.0.x`). Defaults: `PORT=8787`, `HOST=0.0.0.0`, `LOG_DIR=tools/input-probe/logs`
(all overridable via env). Keep the window open for the whole session; every payload prints a one-
line summary.

### Step 2 — rebuild the debug game build with that address (desktop, repo root)

The variable must be set for the build only; it is baked into the bundle, committed nowhere.
The builds are env-driven: the wrapper scripts set everything else (`TIZEN_DIST_DIR` /
`TIZEN_APP_ID`) themselves — **cmd.exe has no inline `VAR=value cmd`, so `set` it first.**

Linux / macOS / Git-Bash:

```sh
VITE_REPORT_URL=http://<LOGSERVER>:8787 pnpm --filter @shmup/tizen build:dev
```

Windows cmd:

```bat
set VITE_REPORT_URL=http://<LOGSERVER>:8787
pnpm --filter @shmup/tizen build:dev
```

PowerShell:

```powershell
$env:VITE_REPORT_URL = "http://<LOGSERVER>:8787"; pnpm --filter @shmup/tizen build:dev
```

Install and run are the **owner's** (sdb / Tizen CLI — never run by an agent):

```bat
set TIZEN_PROFILE=<your profile>
set TV_IP=<the monitor's IP>
pnpm --filter @shmup/tizen tizen:package
pnpm --filter @shmup/tizen tizen:install
pnpm --filter @shmup/tizen tizen:run
```

Repeat the last three lines with the other monitor's `TV_IP`. (Quick sanity check before walking
to the monitors: the same variable with `pnpm dev` in a desktop browser proves the receiver is
reachable at all.)

### Step 3 — the guided render capture, on each monitor

Open the tools: **Play/Pause, then Ch ▲, Ch ▲, Ch ▲** (within ~3 s). A checklist appears in the
**top-right corner**; the panel also comes up — press **1 to hide the panel before you start** (the
panel inflates `REB` with its own redraws; the corner list costs nothing). Use **god mode (2)**
throughout; keep outlines (3) and slow motion (6) off — both change what is drawn. Play what each
line asks; a line ticks itself when enough is recorded:

| Line | What to do |
|---|---|
| **M1** | 30 s on the title, then 30 s of a busy scene (key **8** jumps to the boss) — panel hidden |
| **M2** | OPTIONS → DISPLAY → **CRT OFF / LIGHT / FULL**, 20 s of the same piece of stage each |
| **M3** | Fly 10 s in three different stages — include the Mode-7 one and the water / heat-haze one |
| **M4** | A very dense pattern now, and the same again after a checkpoint restart (key **7**) |
| **M5** | A minute in one stage |
| **M6** | Two different zones, each with CRT on and with CRT off |
| **M7** | Press **Home**, wait ten seconds, come back |
| **M8** | The 240 fps latency video — manual, shows `[-]`, never ticks |

The list's last line shows the sending (`sent #12 · queued 0 · fails 0`). If `queued` climbs and
`fails` rises, the monitor cannot reach the desktop — fix the address/firewall and restart the
run. Run the whole list on **each** monitor; **each launch writes its own `rp-….jsonl` file.**
Reachability check: the first payload's summary line must appear in the server window within ~2
minutes of opening the tools — otherwise fix the firewall before flying the list.

### Step 4 — rebuild the TV bench with the same address (desktop, repo root)

Linux / macOS / Git-Bash:

```sh
VITE_REPORT_URL=http://<LOGSERVER>:8787 pnpm bench:tv
```

Windows cmd:

```bat
set VITE_REPORT_URL=http://<LOGSERVER>:8787
pnpm bench:tv
```

PowerShell:

```powershell
$env:VITE_REPORT_URL = "http://<LOGSERVER>:8787"; pnpm bench:tv
```

This builds both bench widgets (`apps/tizen/dist-bench/`, `apps/webos/dist-bench/`) and runs their
bundle checks. Package / install / run the bench are the **owner's** (`bench:tv:package`,
`bench:tv:install`, `sdb`, the Tizen CLI — agents never run them; the webOS side is build-only,
never installed):

```bat
set TIZEN_PROFILE=<your profile>
pnpm bench:tv:package        (→ apps/tizen/dist-bench/ShmupCupBench.wgt)
set TV_IP=<the monitor's IP>
pnpm bench:tv:install
pnpm --filter @shmup/tizen bench:run
```

### Step 5 — run the bench on each M7, TWICE per monitor (WebGL 1 then WebGL 2)

1. Press **Enter** on the bench page ("190 scenarios + decode + stand-in + rewind, ~101 min" —
   the matrix grew from the 172 rows the first sessions ran, to 174 in v2.0.x with the video
   knob, to 190 with the v2.1.0 rows `4b37d123`; ~101 min is the page's own 32 s-a-row estimate,
   ≈ 96–98 min at the pace the 2026-10-27 run measured (≈ 30.4 s a row); per scenario
   10 s warm-up, 14 s free-running, 6 s with `gl.finish()`, page reloads between). **Red** re-runs
   the current scenario; **Back** exits. The run ends with the decode page loads, the stand-in
   frame and the rewind measurement.
2. Then run it **again on WebGL 2**: in the remote Web Inspector (app id
   `ShmpCupBnc.RenderBench`) set `localStorage['shmup-cup:gl'] = '2'` and relaunch; clear it (or set
   `'1'`) to go back. The shipped default is WebGL 1 — run that pass first.
3. The pass on each monitor is therefore the **pair**: one `rb-….jsonl` on WebGL 1 + one on
   WebGL 2 (each also carries the decode + stand-in payloads). Optional but welcome: a repeat of
   the 640×360 WebGL-1 pass on one unit as the run-to-run stability check (plan R0-03 step 3).
4. Note each unit's firmware (Settings → About). Every scenario POSTs as it finishes — the log
   server prints one summary line per scenario: that is the progress feed.

**Why the GL1-vs-GL2 pair is the shape of this kit:** wave 15's `R6-02.P3` decided
`R6-02.P4d` (make the TV renderer ask for WebGL 2 first, WebGL 1 as the Mali-baseline
fallback) by matching the bench against plan §13's rule — *"WebGL 2 clearly better (≥ 10 % synced
render) → the flip step"*. `analyze-bench.mjs` prints that comparison **only when one monitor's
two WebGL sessions are given in the same call**. The old pre-sweep reading (decision W5-20) had
shown the GL2 win as a **1080p-fill win only**, which is why R6-04 shipped `RENDERER: Auto` above
a Chromium ≥ 71 floor and both TVs (68/69) keep WebGL 1 by default. v2 draws at a 640×360
backbuffer with the remastered renderer, and the paired v2-era sweeps made on 2026-10-19 settled
it: `R6-02.P3` recorded **P4d NOT NEEDED** — the GL 2 gain beyond noise exists only at the 1080p
window `Auto` keeps the TVs out of; mixed at the shipped 720p output, within noise at 540p
([render-performance-review.md §9](../dev/render-performance-review.md), the comparisons in
§12.3 of [input-probe-results.md §12](../dev/input-probe-results.md#12-resolution-benchmark-r0-03)).
A fresh pair per monitor is still the kit's design for any later campaign; it reopens the GL
question only if a budget first misses in a way a renderer floor could fix.

### Step 6 — where the logs land and what to copy where

Everything the server receives is appended to `tools/input-probe/logs/` on the desktop — a
**git-ignored** folder; that is its scratch space, never commit it. Copy (never move, never edit)
the session files into the results folders, `<date>` = the capture date `YYYY-MM-DD`, both
monitors' files in the same folder, as in `results/2026-09-15-m7/`:

| Sessions | From | To |
|---|---|---|
| `rp-….jsonl` (guided capture, one per launch) | `tools/input-probe/logs/` | `tools/input-probe/results/<date>-m7/` |
| `rb-….jsonl` (TV bench, one per session — 4 expected: 2 monitors × GL1/GL2) | `tools/input-probe/logs/` | `tools/input-probe/results/<date>-m7-bench/` |

(Desktop preview of the tables is fine but not required:
`node results/analyze-render.mjs logs/rp-<session>.jsonl`,
`node results/analyze-bench.mjs <gl1>.jsonl <gl2>.jsonl` — wave 15 ran exactly these:
`R0-03.A1` / `R6-02.P3` analysed the committed October corpus with them, into the §12 / §9 tables
cited above; the real analysis of a fresh capture belongs to the lane that receives its logs.)

### Step 7 — what to send back

- The two folders as recorded: `results/<date>-m7/` (all `rp-….jsonl`, one per monitor-launch)
  and `results/<date>-m7-bench/` (all `rb-….jsonl`). **Commit them** on `master` (plain
  `docs:`-style commit) **or** drop the raw files from `logs/` into
  `/home/sites/shmup-cup-run/owner-logs/` — that is how the October logs reached the tree
  (wave 15's `R0-03.A1` took them in as sent).
- The per-unit note: which `rb-`/`rp-` session belongs to which monitor IP, and each unit's
  firmware build.
- The **M8** 240 fps latency videos (they never ride the log server).
- Fallback photographs — only if a session's payload never reached the server (check `fails`
  during the run and the file count **before resetting the TVs**): a photo of the bench results
  table and of the `DECODE (R1-05)` table, and of any panel reading the capture missed.

## Live reload while developing (`tizen:watch`)

For quick iteration a developer can let the TV pick up every change automatically, without
packaging and installing each time. On the PC (the TV must be able to reach it — allow port 5175
through the firewall):

```bat
pnpm --filter @shmup/tizen tizen:watch
```

It builds the debug version, keeps rebuilding whenever a file changes, and serves the build from
the PC. **Once**, after its first build, package and install that build — in a second Command
Prompt, with `TIZEN_PROFILE` and `TV_IP` set as usual:

```bat
pnpm --filter @shmup/tizen tizen:package
pnpm --filter @shmup/tizen tizen:install
pnpm --filter @shmup/tizen tizen:run
```

From then on, every saved change rebuilds on the PC and the game on the TV **reloads itself** into
the new build (it restarts at the loading bar). Stop the watcher with Ctrl+C. If the PC has several
network addresses and the TV does not reload, set the right one first: `set
SHMUP_LIVE_RELOAD_HOST=192.168.1.20` (and `SHMUP_LIVE_RELOAD_PORT` for another port).

After the first reload the TV runs the game **from the PC** — whether everything still works there
(the remote's extra buttons, EXIT) is one of the checks of plan §8.5: please note what does and
does not. This build is for development only: build with plain `build` and install again before
anyone else plays, and never leave a live-reload build on a monitor — without the PC it cannot
reload (it keeps playing the build it has).

## Removing an app

Remove it from the monitor's Apps panel like any other app (highlight it and use its options menu), or with the
Device Manager in Tizen Studio. Installing a newer build over an existing one does not require removing it first —
unless it was signed with a *different* author certificate (see below). Removing the game preview also deletes its
saved settings and high scores.

**Going back from v2 to v1.** A build of `master` is v2 — the released 2.0.0 — and installs as version
**2.0.0** of the same app (`ShmpCupGam.ShmupCup`). A monitor that has it may refuse to install a
build of the `v1.x` branch (version 1.0.N) over it, because that version is lower — remove Shmup Cup
from the monitor first, then install. That deletes the saved settings and high scores too.

## Troubleshooting

| Message / symptom | Cause and fix |
|---|---|
| `Tizen CLI not found` | Tizen Studio / the VS Code SDK is not installed where the scripts look. Set `TIZEN_CLI` to the full path of `tizen.bat`, e.g. `C:\tizen-studio\tools\ide\bin\tizen.bat` |
| `no certificate profile` | Set `TIZEN_PROFILE` to the profile name. List the profiles with `tizen security-profiles list` |
| `sdb connect failed` | Monitor off or on another network; Developer Mode not pointing at **this** PC's IP; monitor not restarted after enabling Developer Mode; or another PC holds the connection |
| `install failed` | The distributor certificate does not include this monitor's DUID (re-create the certificate with both DUIDs), or an older build signed with a different author certificate is installed (remove it on the monitor first), or a build of `master` (2.0.0) is installed and this is a `v1.x` build (1.0.N) — remove it first ([Removing an app](#removing-an-app)) |
| App installed but not visible | Look at the end of the Apps list; start it once with `npm run deploy` (it launches the app) |
| Worked before, now `sdb connect` fails | Check that Developer Mode is still on and the Host PC IP still matches the PC (it changes if the PC gets a new DHCP address) — repeat step 2 on the monitor |
| Game preview: `ERR_PNPM_BROKEN_LOCKFILE` during `pnpm install` | An old pnpm is being used. `pnpm -v` must print 12.x — run `npm i -g pnpm@latest` and open a new Command Prompt |
| Game preview: `Missing environment variable TIZEN_PROFILE` | `set TIZEN_PROFILE=<profile name>` in the same Command Prompt before `tizen:package` |
| Game preview: `apps/tizen/dist is missing` | Run `pnpm --filter @shmup/tizen build` first |
| Game preview: `Failed to install Tizen application.` right after `Transferred the package: …\Shmup Cup.wgt`, with nothing under "Platform log view" | The package name has a space, which the monitor cannot install. Current scripts rename it to `ShmupCup.wgt` — update the repository (`git pull`) and run `tizen:package` and `tizen:install` again |
| Game preview: `No .wgt found` | Run `tizen:package` after the build (a new build removes the old `.wgt`) |
| Game preview: Play/Pause + Ch ▲ ×3 opens nothing | The installed widget is a normal build — build with `pnpm --filter @shmup/tizen build:dev`, package and install again ([debug-tools.md](debug-tools.md)) |
| Game preview: Play/Pause + Ch ▲ ×3 opens the developer panel on what should be a normal build | `apps\tizen\dist` came from `build:dev` or from a developer's `pnpm test:e2e` (which leaves a test build there) — run `pnpm --filter @shmup/tizen build`, then package and install again |
| Game preview: at start the TV says a gamepad must be connected | The build was made with `TIZEN_GAMEPADS` set (the launch-time gamepad check). Clear it (`set TIZEN_GAMEPADS=`), build, package and install again |
| Game preview: the game-mode build looks and feels exactly like the normal one | Possible — the M7 may ignore the Game Mode request. Film both builds anyway and report the two delays ([above](#the-game-mode-build-latency-ab-test)) |
| Game preview: every build asks for Game Mode | `TIZEN_GAME_MODE` is still set in this Command Prompt — `set TIZEN_GAME_MODE=`, then build again |
| `tizen:watch`: the TV does not reload after a change | The TV cannot reach the PC on port 5175 (firewall, another network), or the watcher picked the wrong network address — set `SHMUP_LIVE_RELOAD_HOST` to the PC's IP and restart it. The build installed on the TV must be the watcher's own first build |

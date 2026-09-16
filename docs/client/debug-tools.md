# Developer tools and the M1 release check

Version **0.1.0** is the end of the first milestone: one complete zone, AZURE VERGE, with its
boss, playable from the title to the stage clear with the TV remote alone. To check it properly
on the monitors, the game has **developer tools**: an on-screen panel with the frame rate and
other measurements, outlines of what can hit what, an invincible mode, a freeze with single
steps, slow motion, and shortcuts to the next checkpoint and to the boss.

The tools exist only in **debug builds**. The normal build (the one a player would get) has none
of them — no key combination turns them on. This page explains how to get a debug build onto the
monitor, how to open the tools, how to read the panel (on the TV with a line naming the monitor's
model and firmware), how to copy a save out for a bug report, and the checklists for the release
and for the platform-polish build.

The debug build can also **record the drawing measurements for you** and send them to a small
program on your desktop, with an on-screen list telling you where to fly: see
[the guided capture](#the-guided-capture-preferred). Reading the panel by hand still works and is
what to do when no desktop is reachable.

The current build is the **v1.0 release candidate (1.0.0-rc.1)**; its own checklist for the
monitors — which uses these tools — is in
[release-candidate.md](release-candidate.md#the-v10-checklist-both-monitors).

## Which build has the tools

| Where | Build | Tools |
|---|---|---|
| Samsung monitor | the normal build (`pnpm --filter @shmup/tizen build`) | none |
| Samsung monitor | the **debug build** (`pnpm --filter @shmup/tizen build:dev`) | yes, after the remote sequence below |
| Desktop browser | `pnpm dev` (http://localhost:5173) | yes, on the F1–F8 keys at once |
| Desktop browser | `vite preview` of a normal build | none |

The panel's fourth line ends with the **build id** — the code version the build was made from
(for example `9524C84`; a `+` at the end means it was built with uncommitted changes). Please
quote it in every report.

## Installing the debug build on the monitor

Exactly like the normal preview ([install-on-tv.md](install-on-tv.md#installing-the-game-preview)),
with `build:dev` instead of `build`:

```bat
pnpm --filter @shmup/tizen build:dev

set TIZEN_PROFILE=shmupcup
set TV_IP=192.168.1.50
pnpm --filter @shmup/tizen tizen:package
pnpm --filter @shmup/tizen tizen:install
pnpm --filter @shmup/tizen tizen:run
```

It installs over the normal build (the same app — your settings and high scores stay) and looks
and plays exactly like it until you open the tools. To go back to the normal build, run
`pnpm --filter @shmup/tizen build` and package and install again.

## Opening the tools on the TV

Press, on the remote, within **3 seconds**:

**Play/Pause ⏯, then Channel up (Ch ▲) three times.**

The panel appears in the top-left corner of the playfield. From then on the remote's **number
keys 1–8** run the tools (on a remote without number buttons, its on-screen number pad — or a
keyboard's F1–F8):

| Key | Tool |
|---|---|
| **1** | Show / hide the panel |
| **2** | Invincible mode on / off (`GOD` in the panel) |
| **3** | Outlines: off → hit areas → hit areas + collision grid → off |
| **4** | Freeze the game / let it run again (`STEP` in the panel) |
| **5** | While frozen: advance by one tick (1/60 s); hold for a slow crawl |
| **6** | Slow motion: normal → half speed → quarter speed → normal (`SLOW 2`, `SLOW 4`) |
| **7** | Jump to the next checkpoint of the zone (of whichever zone of the run you are in). Zones B and C have four checkpoints each; in BRINE NEBULA, pressing 7 twice (the third checkpoint) and flying on for about 20 seconds brings the secret gap into PEARL GROTTO ([preview-build.md](preview-build.md#the-secret-bonus-stage-pearl-grotto)). Zones D and E have four checkpoints each; in MAGMA DEEP the third (key 7 twice) is already **down in the caves**, after the dive — the ship flies in down there, about 20 seconds before the brick maze ([preview-build.md](preview-build.md#zone-d-magma-deep)). Zones F and G have four checkpoints each; in PRISM LABYRINTH key 7 once (the second checkpoint) puts you a couple of seconds before the crystal gallery — shoot its four turrets for the secret bonus stage GLIMMER CACHE ([preview-build.md](preview-build.md#the-secret-bonus-stage-glimmer-cache)); in CELL VAULT it puts you about 15 seconds before the tissue walls. Zones H and I have four checkpoints each; in IRON CITADEL key 7 once puts you just before the piston hall, twice at the parade hangar a few seconds before the first echo, three times at the core run; in ABYSSAL THRONE once before the trench's eels, twice at the mine field |
| **8** | Jump to just before the boss (about two seconds before the WARNING) — in every zone of the run, so a whole run through the ZONE MAP takes a few minutes. In BRINE NEBULA this skips the mid-boss and the secret entrance too; in MAGMA DEEP it jumps straight into the caves (CINDER BASTION is fought down there); in PRISM LABYRINTH it skips the crystal gallery and so the secret entrance; in IRON CITADEL it stops before the **parade** — the zone's first boss — so the four echoes, the core run and then IRON SOVEREIGN still follow; the quickest way to IRON SOVEREIGN is key 7 three times (the core run) and about 35 seconds of flying — pressing 8 after the parade jumps **back** to it; in ABYSSAL THRONE it goes straight to the ABYSS ARK. After zone H or I the ending and the credits follow as in a normal run |

Good to know:

- In a game, Play/Pause opens the **pause menu** as usual — that is fine: Ch ▲ does nothing in
  the pause menu, and the sequence never changes the game. Press Back (or RESUME) to continue.
- Entering the sequence again hides or shows the panel. The tools stay available until the app
  is closed; after a restart, enter the sequence again.
- 7 and 8 only work while you are playing (not on the title, in the pause menu or after the
  game ended). They clear the screen of enemies and bullets and fly your ship in again; your
  score, ships and power-ups stay.
- Invincible mode, slow motion and the freeze are for testing only — scores reached with them
  do not count as real results.
- A USB or Bluetooth keyboard's **F1–F8** do the same as 1–8 once the tools are open.

## Opening the tools in a browser

In `pnpm dev` the **F1–F8** keys work at once, in the same order as the table above (F1 panel,
F2 invincible, F3 outlines, F4 freeze, F5 step, F6 slow motion, F7 next checkpoint, F8 boss).
F5 no longer reloads the page while the game has focus.

## Reading the panel

```text
FPS 60  TICK  0.21  RENDER  1.30  DRAW 12
BUL 123/512 ENM 12/64 SHT 40/96 PRT 30/256
RANK 2   RNG 1234  HASH 3735928559 @600
WEBGL 1 BOOT 1234 LAS 2/16 ITM 1/32  9524C84
GOD HITBOX GRID STEP SLOW 2 LOCK
TPF 0      3541   2      0     RAF ▁▃█▅▂▁▁▁
REB 3540      RT       512 KB
LS43AM702U 20_KANTSU2 FW T-KSU2EUC-1234.5 1920x1080@1 C6
```

(The last line is the TV's **device line** — [below](#the-device-line). A browser has none.)

| Field | Meaning | What is normal |
|---|---|---|
| `FPS` | Frames drawn per second | **60** on the monitors |
| `TICK` | Milliseconds the game logic took this frame | well under 16 |
| `RENDER` | Milliseconds the drawing took this frame | well under 16; `TICK` + `RENDER` must stay under 16.7 for 60 FPS |
| `DRAW` | Draw calls sent to the graphics chip this frame | for developers — note it if it jumps much higher at some point of the zone |
| `BUL` · `ENM` · `SHT` · `PRT` | Enemy bullets · enemies · your shots · particles: in use / room for | the first number never reaching the second for long |
| `LAS` · `ITM` | Enemy lasers · capsules on screen | — |
| `RANK` | The hidden difficulty level the game is running at (0–31) | Starts at the difficulty's level — EASY 0, NORMAL 2, HARD 4, ARCADE 6 — and goes up as the ship powers up (Missile +1, Double +2, Laser +3, each Option +1, Force Field +4; on EASY half as fast), down again when it loses power, and a little higher in each later zone of a run; at most 16 on the first loop ([preview-build.md](preview-build.md#the-game-gets-harder-as-your-ship-gets-stronger)) |
| `RNG` · `HASH @tick` | Technical fingerprints of the game's state (the hash is taken every second) | for developers: two runs with the same inputs show the same numbers |
| `WEBGL` | Graphics version the game got | 1 |
| `BOOT` | Milliseconds from starting the app to the title | **under 10,000** (target 5,000) |
| last on line 4 | The build id | quote it in reports |
| line 5 | The tools that are on, and `LOCK` when the game runs one step per frame | in normal play on the monitors: only `LOCK` — see [Frame pacing](#frame-pacing-tpf-and-the-raf-histogram) |
| `TPF` (line 6) | Frames that ran 0 / 1 / 2 / 3-or-more game steps, counted since the app started | only the second number climbing |
| `RAF` (line 6) | A bar chart of how long the frames took — [below](#frame-pacing-tpf-and-the-raf-histogram) | most of it in the middle bars |
| `REB` (line 7) | Frames the picture had to be rebuilt from scratch on, counted since the app started — [below](#render-profile-reb-and-rt) | for developers: today it climbs with almost every frame |
| `RT` (line 7) | Kilobytes of off-screen picture memory the drawing has taken — [below](#render-profile-reb-and-rt) | `0` on an ordinary stage, whatever CRT is set to; about **512 KB** on a stage with a wavy-water or heat-haze effect |
| line 8 (TV only) | The monitor's model, model code, firmware, screen size — [the device line](#the-device-line) | your monitor's model (e.g. `LS43AM702U`), `1920x1080@1` |

On the title (no game on screen) the bullet, enemy, rank and hash fields stay empty; in the pause
menu they show the paused game's values.

**The frame graph** to the right of the numbers shows the last 60 frames, one thin bar each, the
newest on the right. A **green** bar is a frame on time; a **yellow** bar (reaching the first
guide line and above) is one missed frame — a small hitch; a **red** bar is a longer stall.
During normal play the graph should be a flat row of short green bars.

## Frame pacing: `TPF` and the rAF histogram

The game simulates in steps of 1/60 s and draws one picture per step. The monitors do not hand
their frames over quite that evenly: measured on both M7s, the *average* is 60 a second, but a
quarter of the frames arrive more than 20 ms apart while the ones beside them arrive early. Left
alone, that makes the game run two steps on one frame and none on the next — the average is right,
but the picture judders.

Since the remote-and-hardware build the game therefore **locks to the screen** when it recognises a
fixed ~60 Hz display: one step per frame, a second one only when a frame was really dropped. The
panel shows both halves of that:

- **`LOCK`** among the switches on line 5 — the lock is on. On the monitors it should always be
  there during play. (It is dropped automatically while the freeze, single-step or slow-motion
  tools run, which need the old free-running timing.)
- **`TPF`** — four counters: frames that ran **0**, **1**, **2** and **3 or more** steps, counted
  since the app started. While you fly, **only the second one may keep climbing**. A handful in the
  0 and 2 columns over a whole zone is normal (a real dropped frame runs two steps to catch up);
  a steady stream in them means the lock is not engaging, and is worth a report with the monitor's
  model.
- **`RAF`** — eight bars, short frames on the left, long ones on the right, each scaled against the
  busiest bar. The middle (green) bars are 60 Hz frames; the yellow ones are the monitor's jitter;
  a red bar on the right is a really dropped frame and should be rare.

In a browser the lock is on only if the display is between 55 and 65 Hz; on a 120 or 144 Hz monitor
`LOCK` is absent and `TPF` spreads across the 0 and 1 columns, which is correct — two screen frames
per game step.

**The outlines** (key 3) show what the game really checks for hits (players have their own,
simpler marker of the ship's hit spot: OPTIONS → DISPLAY → **HITBOX** in every build —
[preview-build.md](preview-build.md#the-options-screen)):

| Colour | What |
|---|---|
| Green square | Your ship's hit spot — a bullet has to touch this small spot to destroy the ship (with the REDUCE shield up it is smaller: a third, then two thirds of its size) |
| Yellow box | Your ship's body against rock |
| Red boxes | Enemies |
| Orange boxes | The boss's parts that can be hit — of every boss on the screen (a mid-boss beside a boss, both twins, the boss inside a boss); round parts show as squares |
| Magenta squares | Enemy bullets |
| Pink squares | Firing lasers |
| Cyan boxes | Your shots |
| White squares | Capsules |
| Faint grid (second press) | The game's collision grid (for developers) |

## Render profile: `REB` and `RT`

The seventh line is for developers: it says how much work the *drawing* is really doing, which is
the one thing the panel could not show before. Nothing here changes how the game plays — it is
there so the picture can be made cheaper in a later build without guessing.

- **`REB`** — the number of frames, counted since the app started, on which the drawing library
  threw the whole picture away and put it back together instead of only moving what moved. Today
  it climbs with almost every frame, which is exactly the thing that is being looked into. Read it
  next to the frame count: near-equal means every frame pays for the rebuild.
- **`RT`** — kilobytes of off-screen picture memory the drawing has taken since the app started.
  It should stay **0** on an ordinary stage whatever the CRT setting is: since the render fix the
  CRT look is part of the one pass that puts the picture on screen, so it needs no full-screen
  scratch picture at all. (Before the fix it jumped to about 16384 KB — 16 MB — the moment CRT went
  to LIGHT or FULL.) A stage with a wavy-water or heat-haze effect still takes a small one (about
  512 KB). It only ever goes up — the memory is kept and reused, never handed back — so compare
  readings from the same session.

Both numbers are also in the remote inspector, as `__shmupDebug.stats.structureRebuilds` and
`__shmupDebug.stats.renderTargetBytes`. A developer's view of what they mean, and the full
measurement recipe for the monitors, is in
[`../dev/rendering-and-shell.md`](../dev/rendering-and-shell.md#measuring-on-the-tv).

## The device line

On the TV the panel has a **last line** (the eighth) with facts about the monitor, so every photo
of the panel also says which monitor and firmware it came from:

```text
LS43AM702U 20_KANTSU2 FW T-KSU2EUC-1234.5 1920x1080@1 C69 GL1/4096
```

| Part | Meaning |
|---|---|
| `LS43AM702U` | The model (from the TV itself) |
| `20_KANTSU2` | Samsung's model code (the year and chassis) |
| `FW T-KSU2EUC-1234.5` | The firmware version — quote it when you report a problem |
| `1920x1080@1` | The picture size the game gets and the pixel ratio (expect `1920x1080@1`) |
| `C69` | The browser engine's version (Chrome 69 on Tizen 5.5) |
| `GL1/4096` | The graphics version the game got and the largest picture it can load |

- The line appears a moment after you open the tools (the TV is asked only then — a normal build
  never asks). The panel shows at most 56 characters, so the end of a long line (`C69 GL1/…`) may
  be cut off; the full facts are also written to the remote inspector's console as
  `Shmup Cup device`.
- A `?` means the TV did not tell: `? FW ?` for the model and firmware means the monitor's product
  information could not be read (report it with a photo — the rest of the line is still right).
- In a browser (`pnpm dev`) there is no device line.

## Saving a save for a bug report (and loading one)

A developer with the **remote Web Inspector** (Chrome DevTools connected to the monitor — see
[`../dev/build-test-deploy.md`](../dev/build-test-deploy.md#the-remote-web-inspector-devtools-on-the-tv))
— or with `pnpm dev` in a browser —
can copy the game's save out of a debug build and put one in:

| In the console | What it does |
|---|---|
| `copy(__shmupDebug.save.export())` | Copies the save — your settings, keys and high scores, as readable text — to the clipboard; paste it into the bug report |
| `await __shmupDebug.save.import(text)` then `location.reload()` | Replaces the save with `text` (a save someone exported) and writes it; the reload applies its settings. A broken text is refused (`ok: false`) and changes nothing |
| `__shmupDebug.save.usage()` | How much of the game's storage the save takes (`bytes` of `quotaBytes`); `persistent: false` means the storage is not working and nothing is kept after closing |

Importing replaces everything saved on that monitor or browser — export the old save first if you
want it back. Normal builds have none of this.

## The M1 release check

Please run this on **both** monitors with the debug build, and write down the build id. It is the
list the plan asks for before the milestone counts as done (plan §8.4); the numbered checks in
[preview-build.md](preview-build.md#on-the-samsung-smart-monitor--tv) give more detail on each.

1. **Start-up time.** Close the app, start it from the Apps panel and time it to the title: at
   most **10 seconds** (5 is the goal). Then open the tools: `BOOT` shows the time measured by
   the game, `WEBGL` shows `1`, `FPS` shows `60`.
2. **Picture.** Crisp square pixels at full screen, no blur, no shimmering while the ground
   scrolls; bullets stay easy to see against the dark blue backgrounds (also on the monitor's
   slower-responding panel — check for smearing behind moving bullets).
3. **Remote only.** Title → OK starts; the ship moves on every arrow and keeps moving smoothly
   while you hold it; OK takes power-ups; AZURE VERGE can be finished **without pressing two
   arrows at once**; Back pauses, Back in the pause menu resumes; Play/Pause pauses.
4. **Leaving.** Back on the title → **EXIT SHMUP CUP?** → YES closes the app; NO keeps it open.
5. **Home and back.** Press Home during a game: the TV's bar opens **over** the app (it keeps
   running underneath), so the game pauses itself and the music stops at once. Reopen the app: the
   pause menu is on screen where you left it, the sound comes back without crackles, and nothing
   jumps ahead.
6. **Sound.** Effects feel immediate; you cannot hear where the stage music loops; the WARNING
   siren plays; volumes you set in OPTIONS are still set after closing and reopening the app.
7. **Kept after closing and after an update.** High score and options survive closing the app;
   installing the same build again over it (`tizen:install` once more) keeps them too.
8. **15 minutes of play.** Play for 15 minutes with the panel open — several runs of the zone;
   invincible mode (key 2) lets you keep going without losing ships: no yellow or red bars in the
   frame graph during normal play, `FPS` staying at 60. If a developer has the remote inspector (Chrome DevTools) connected, the
   memory should stay under 100 MB.
9. **Other controllers.** A gamepad (press a button first so the game notices it) and a Bluetooth
   keyboard also work.
10. **Optional:** film a button press and the ship's reaction at 240 frames per second to measure
    the delay from the remote to the screen.

Report each check as passed or failed with the monitor, the build id, a photo of the panel for
anything measured, and the time into the stage for anything that went wrong.

## Extra checks for the platform-polish build (plan §8.5)

With the debug build on each monitor:

1. **Device line.** Open the tools: the last line shows the monitor's model and firmware
   ([The device line](#the-device-line)).
2. **Save export.** In the remote inspector, `__shmupDebug.save.export()` prints the save.
3. **Memory.** With the remote inspector's *Memory* tab (or *Performance monitor → JS heap size*),
   play a run across three zones: the total should stay **under 100 MB** and not keep growing from
   zone to zone. Note the JS heap size on the title and in a zone — the game's own estimate assumes
   about **24 MB** for it; report the real number so the estimate can be corrected.
4. **Game mode.** The latency comparison of the normal and the game-mode build —
   [install-on-tv.md](install-on-tv.md#the-game-mode-build-latency-ab-test).

## Extra checks for the remote & hardware build (plan §8.4)

With the debug build on **each** monitor:

1. **`TPF` while flying.** Open the tools, start a game and fly for a minute or two: `LOCK` shows
   on line 5 and only the **second** `TPF` counter keeps climbing
   ([Frame pacing](#frame-pacing-tpf-and-the-raf-histogram)). Photograph the panel per monitor.
   The same counters are in the remote inspector as `__shmupDebug.stats.tickFrames` and
   `__shmupDebug.stats.rafHistogram`.
2. **Home during play.** Press Home while flying, wait, come back: the music was silent, the pause
   menu is up, nothing was fast-forwarded.
3. **The INPUT TEST's exit.** OPTIONS → CONTROLS → INPUT TEST, then **Back three times** within
   about 1.5 s closes it. With more than 1.5 s between presses it must not close.
4. **A 240 fps latency video** of the ship reacting to an arrow, and one of the input probe's flash
   box — the earlier video was 30 fps, too coarse to answer the question.
5. **Optional:** re-run the fixed input probe and try **Back / Ch ▲ / Ch ▼ while holding an
   arrow** (it should report *NO — not delivered*) and **two gamepads at once**.

## Extra checks for the render-profiling build (plan §8.4)

These measure the drawing, and they are the numbers a later build will be judged against. **The
game can now record them itself** — do it that way; the manual reading below is the fallback for
when no desktop is reachable. The full recipe is
[`../dev/rendering-and-shell.md`](../dev/rendering-and-shell.md#measuring-on-the-tv).

### The guided capture (preferred)

The debug build can stream what it draws to a small log server on your desktop, and an on-screen
checklist tells you where to fly. Nothing is typed down, and it records the **worst 5 %** of frames,
which nobody can read off a moving panel.

1. **Start the receiver** on the desktop:

   ```bat
   cd tools\input-probe
   npm install
   npm run log-server
   ```

   It prints an address like `VITE_REPORT_URL=http://10.0.0.2:8787`. Windows asks once to allow Node
   through the firewall on the **private** network — say yes, or the monitor cannot reach it.

2. **Build the debug build with that address** and install it, exactly as in
   [Installing the debug build on the monitor](#installing-the-debug-build-on-the-monitor) — the
   only new thing is the first line:

   ```bat
   set VITE_REPORT_URL=http://10.0.0.2:8787
   pnpm --filter @shmup/tizen build:dev
   set TIZEN_PROFILE=<your profile>
   set TV_IP=<the monitor's IP>
   pnpm --filter @shmup/tizen tizen:package
   pnpm --filter @shmup/tizen tizen:install
   pnpm --filter @shmup/tizen tizen:run
   ```

   Repeat the last three lines with the other monitor's `TV_IP`. In a desktop browser the same
   variable works with `pnpm dev`, which is the quickest way to see that the receiver is reachable
   at all before you walk to the monitors.

3. **On the monitor**, open the tools (Play/Pause, Ch▲, Ch▲, Ch▲). A list appears in the **top-right
   corner**. Play the way each line asks; a line ticks itself when enough has been recorded, and a
   ticked line never goes back:

   | Line | What to do |
   |---|---|
   | **M1** | 30 seconds on the title, then 30 seconds of a busy scene (key **8** jumps to the boss) |
   | **M2** | OPTIONS → DISPLAY → **CRT OFF / LIGHT / FULL**, 20 seconds of the same piece of stage each |
   | **M3** | Fly 10 seconds in three different stages — include the Mode-7 one and the water / heat-haze one |
   | **M4** | A very dense pattern now, and the same one again after a checkpoint restart (key **7**) |
   | **M5** | A minute in one stage |
   | **M6** | Two different zones, each with CRT on and with CRT off |
   | **M7** | Press **Home**, wait ten seconds, come back |
   | **M8** | The 240 fps video — this one is still yours to film; it shows as `[-]` and never ticks |

   The last line of the list shows how the sending is going (`sent #12 · queued 0 · fails 0`). If
   `queued` keeps climbing and `fails` rises, the monitor cannot reach the desktop — check the IP and
   the firewall. Run the whole list on **each** monitor; each launch writes its own file.

4. **Turn it into the results tables** on the desktop:

   ```sh
   cd tools/input-probe
   node results/analyze-render.mjs logs/rp-<session>.jsonl
   ```

   Paste its output into the results document. The `p50` / `p95` it prints are worked out over
   **every frame** of each row, not from a few readings, so they mean the same thing as the figures
   the desktop benchmark prints — the same *statistic*, not a comparable *magnitude*. These are the
   TV's milliseconds; the benchmark runs under software WebGL, so only its counted quantities (draw
   calls, pooled render-target bytes, structure rebuilds, heap delta) and its in-run ratios carry
   over to the panel, never its milliseconds.

   So, when you come to read the tables:

   | Figure | Compare it with |
   |---|---|
   | The counted ones — `DRAW`, `REB`, `RT`, the heap | The desktop benchmark's figures freely; they are the same things counted the same way |
   | The milliseconds — `TICK`, `RENDER`, `FRAME`, `fps` | **Only your own other runs on a monitor**: CRT OFF against FULL on the same section, graphics version 1 against 2, this monitor against the other one, today's build against the last one. Never against the desktop's milliseconds |

   Use **god mode (key 2)** throughout so a death never cuts a run short, and leave the outlines (3)
   and slow motion (6) off — both change what is drawn.

**If no server is reachable** — no desktop on the monitor's network, the firewall prompt was
refused, or the build was made without `VITE_REPORT_URL` — nothing of the capture runs at all: no
list in the corner, no sending, nothing recorded, and the game plays exactly as it otherwise would.
Read the panel by hand instead ([below](#reading-the-panel-by-hand-fallback)). If the list *is*
there but `fails` keeps rising, the build knows an address the monitor cannot reach: the rows are
still ticking off your play, but nothing is being stored, so fix the address or the firewall and
start the run again. **M8 is manual either way.**

None of this exists in the normal build.

### Reading the panel by hand (fallback)

With the debug build on **each** monitor:

1. **Baseline.** On the title, in zone A and on the boss, note `FPS`, `TICK`, `RENDER`, `DRAW`,
   `REB` and `RT`, and photograph the frame graph and the `RAF` bars. This is the control for
   everything below.
2. **What CRT costs.** OPTIONS → DISPLAY → CRT **OFF / LIGHT / FULL** on the *same* piece of
   stage, reading `RENDER` and `RT` each time. Since the render fix all three should read the
   **same** `RENDER` within a few per cent and `RT` should **not move at all**. Report it if `RT`
   jumps, if FULL costs visibly more than OFF, or if there is a stutter the first time CRT goes on.
3. **Entering the special stages.** Fly into the Mode-7 stage and the water / heat-haze stage: the
   frame graph should stay flat at the boundary now that the drawing is warmed up at start-up.
   A single tall bar there is worth reporting, and anything worse certainly is.
4. **Graphics version A/B** (needs the remote Web Inspector): `localStorage['shmup-cup:gl'] = '2'`
   and relaunch, then compare `RENDER` and the `RAF` bars over a minute of the same stage. The
   panel's `WEBGL` figure shows what the game actually got. **The normal build stays on version 1**
   — this is only a comparison.

## Troubleshooting

| Problem | What to do |
|---|---|
| Nothing happens after Play/Pause and Ch ▲ ×3 | The installed build is a normal build — install the debug build (`build:dev`). Otherwise press the four buttons faster (all within 3 seconds) and make sure each press registers |
| The remote has no Play/Pause button | Connect a USB or Bluetooth keyboard and press its **Pause / Break** key as the first step, then Ch ▲ three times on the remote |
| The number keys do nothing | The tools are not open yet (enter the sequence first). A remote without number buttons may offer an on-screen number pad (on Samsung Smart Remotes the **123** button, where present); a keyboard's F1–F8 work too |
| The game is frozen and ignores the remote | The freeze is on (`STEP` in the panel) — press **4** again (or **5** to step) |
| Everything is slow | Slow motion is on (`SLOW 2` / `SLOW 4`) — press **6** until it is gone |
| The ship never dies | Invincible mode is on (`GOD`) — press **2** |
| 7 or 8 does nothing | Only during play: not on the title, in the pause menu, after the game ended, or after the last checkpoint (7) |
| The panel covers the top-left of the picture | Press **1** to hide it; the tools stay on |
| F1–F8 do nothing in a browser | The page shows a normal build (`vite preview`) — use `pnpm dev`; or click into the game first so it has keyboard focus |
| No device line on the TV (the last line) | It appears a second or two after the tools open; if it never does, the build predates it — build `build:dev` again. A browser never shows it |
| No `TPF` line, or no `LOCK` | The build predates the remote-and-hardware tuning — build `build:dev` again. `LOCK` is also absent while the freeze, single-step or slow-motion tools run (they need the old timing), and on a display faster than 65 Hz |
| The `TPF` 0 and 2 counters climb together while flying | The lock is not engaging on this monitor. Report the model, the firmware and a photo of the panel with the `RAF` bars |
| No `REB` / `RT` line | The build predates the render profiling — build `build:dev` again |
| `REB` is blank | Only the debug build counts it; a `build:dev` bundle always does, so report it with the build id if the rest of the panel is there |
| `RT` jumps by ~16 MB when CRT goes on | Worth reporting with a photo: since the render fix the CRT should take no scratch picture at all. (`RT` counts from the start of the app, not from when you opened the panel, so switching CRT off again never brings it back down.) |
| The device line reads `? FW ?` | The monitor's product information could not be read within 3 seconds — photograph the panel and report it; everything else works |
| `__shmupDebug` is `undefined` in the console | A normal build (no debug API) — install `build:dev` (or use `pnpm dev`); on the TV make sure the inspector is attached to the game, not another app |
| No list in the top-right corner | The build was made without `VITE_REPORT_URL` (see [the guided capture](#the-guided-capture-preferred)) — it then records nothing at all. Set the variable, build `build:dev` again and reinstall |
| The list is there but `fails` keeps rising | The monitor cannot reach the desktop: check the address you built with is the desktop's address on the **same** network, that `npm run log-server` is still running, and that Windows allowed Node through the private-network firewall |
| A line never ticks | Read what it asks for again — each one needs a certain amount of the *right* kind of play (`M2` needs 20 seconds per CRT setting, `M5` a full minute in one stage). `M8` is manual and never ticks |

# Developer tools and the M1 release check

Version **0.1.0** is the end of the first milestone: one complete zone, AZURE VERGE, with its
boss, playable from the title to the stage clear with the TV remote alone. To check it properly
on the monitors, the game has **developer tools**: an on-screen panel with the frame rate and
other measurements, outlines of what can hit what, an invincible mode, a freeze with single
steps, slow motion, and shortcuts to the next checkpoint and to the boss.

The tools exist only in **debug builds**. The normal build (the one a player would get) has none
of them — no key combination turns them on. This page explains how to get a debug build onto the
monitor, how to open the tools, how to read the panel, and the checklist for the release.

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
| **7** | Jump to the next checkpoint of the zone |
| **8** | Jump to just before the boss (about two seconds before the WARNING) |

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
GOD HITBOX GRID STEP SLOW 2
```

| Field | Meaning | What is normal |
|---|---|---|
| `FPS` | Frames drawn per second | **60** on the monitors |
| `TICK` | Milliseconds the game logic took this frame | well under 16 |
| `RENDER` | Milliseconds the drawing took this frame | well under 16; `TICK` + `RENDER` must stay under 16.7 for 60 FPS |
| `DRAW` | Draw calls sent to the graphics chip this frame | for developers — note it if it jumps much higher at some point of the zone |
| `BUL` · `ENM` · `SHT` · `PRT` | Enemy bullets · enemies · your shots · particles: in use / room for | the first number never reaching the second for long |
| `LAS` · `ITM` | Enemy lasers · capsules on screen | — |
| `RANK` | The hidden difficulty level the game is running at (0–31) | Starts at the difficulty's level — EASY 0, NORMAL 2, HARD 4, ARCADE 6 — and goes up as the ship powers up (Missile +1, Double +2, Laser +3, each Option +1, Force Field +4; on EASY half as fast), down again when it loses power; at most 16 in this zone ([preview-build.md](preview-build.md#the-game-gets-harder-as-your-ship-gets-stronger)) |
| `RNG` · `HASH @tick` | Technical fingerprints of the game's state (the hash is taken every second) | for developers: two runs with the same inputs show the same numbers |
| `WEBGL` | Graphics version the game got | 1 |
| `BOOT` | Milliseconds from starting the app to the title | **under 10,000** (target 5,000) |
| last on line 4 | The build id | quote it in reports |
| line 5 | The tools that are on | empty in normal play |

On the title (no game on screen) the bullet, enemy, rank and hash fields stay empty; in the pause
menu they show the paused game's values.

**The frame graph** to the right of the numbers shows the last 60 frames, one thin bar each, the
newest on the right. A **green** bar is a frame on time; a **yellow** bar (reaching the first
guide line and above) is one missed frame — a small hitch; a **red** bar is a longer stall.
During normal play the graph should be a flat row of short green bars.

**The outlines** (key 3) show what the game really checks for hits (players have their own,
simpler marker of the ship's hit spot: OPTIONS → **HITBOX** in every build —
[preview-build.md](preview-build.md#the-options-screen)):

| Colour | What |
|---|---|
| Green square | Your ship's hit spot — a bullet has to touch this small spot to destroy the ship (with the REDUCE shield up it is smaller: a third, then two thirds of its size) |
| Yellow box | Your ship's body against rock |
| Red boxes | Enemies |
| Orange boxes | The boss's parts that can be hit |
| Magenta squares | Enemy bullets |
| Pink squares | Firing lasers |
| Cyan boxes | Your shots |
| White squares | Capsules |
| Faint grid (second press) | The game's collision grid (for developers) |

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
5. **Home and back.** Press Home during a game, then reopen the app: it is paused, the sound comes
   back without crackles, and nothing jumps ahead.
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

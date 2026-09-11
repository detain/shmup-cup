# The preview build (sprite showcase)

The game is not playable yet. Every build — browser, Samsung TV and desktop — starts with
a short loading bar and then shows a **sprite showcase**: a little animated scene that uses
the game's real (placeholder) graphics the way the finished game will draw them. Nothing
reacts to the controls yet. The showcase exists to prove on each device that the whole
chain works — the app starts, the graphics load, the 60 ticks per second simulation runs,
the picture is pixel-perfect at the monitor's resolution — and to catch scaling,
smoothness or colour problems early.

The older **calibration screen** (checker border, grid, colour bars) is still available in
a browser; see [below](#the-calibration-screen-browser-only).

This page explains how to open the preview on each device, what you should see, and what
to report if it looks wrong. Controls for the finished game are listed in
[controls.md](controls.md).

## Starting up: the loading screen

For a moment after the app opens you see a deep navy screen with **SHMUP CUP**, the word
**LOADING** and a progress bar that fills from left to right. On the TV and on a PC this
takes well under a second, so you may only see a flash of it. Then the showcase appears.

If something is wrong with the build, the app stops on the **error screen** instead (see
[When the app shows an error screen](#when-the-app-shows-an-error-screen)) — it never just
stays black.

## What you should see: the sprite showcase

A deep navy picture (never pure black — the M7 monitors' VA panels smear dark-to-bright
transitions) framed by two thin bars, one along the top edge and one along the bottom:

| Element | Where | What "good" looks like |
|---|---|---|
| **Star field** in three layers | Whole picture behind everything | Stars drift to the left at three different speeds (the far ones slowest), steadily, with no jumps; the pattern repeats seamlessly |
| **KESTREL**, the player ship, with a flickering engine flame | Left half | Flies a slow figure-eight; the ship tilts slightly while it climbs or dives |
| **Two Options** (small glowing orbs) | Behind the ship | Follow exactly the path the ship flew a moment earlier |
| **Five small enemies** ("drifters") | Moving right to left across the picture | Bob up and down in a wave; every now and then one of them flashes white for an instant — that is the "hit" flash the game will use |
| **Ring of twelve pink bullets** | Right side, middle | Turns slowly and evenly |
| **Top bar** | Top edge | `1P` (cyan) with a score counting up by 600 a second, `HI 00050000` (yellow), `2P 00000000` (grey) |
| **Bottom bar** | Bottom edge | Three ship icons (lives) on the left, then the seven-slot power meter; one slot blinks and the highlight moves on to the next slot about twice a second |
| **Title text** | Upper middle | **SHMUP CUP** in yellow and **SPRITE SHOWCASE** in cyan below it, in the game's own blocky pixel font |
| **Hint line** | Just above the bottom bar | `?SCENE=CALIBRATION FOR THE TEST PATTERN` in grey |

Every pixel should be a crisp little square. The game draws at 384×216 and scales that up
by a whole number: on the 1080p M7 monitors (and any 1920×1080 browser window) the scale is
exactly ×5 and the picture fills the screen edge to edge. On other sizes the largest
whole-number scale that fits is used and a very dark border fills the rest — that border is
intentional, it keeps the pixels sharp.

The graphics are placeholders made for this project (original designs, not taken from any
other game) and will be replaced by finished art later. There is no sound yet.

### What changed lately

The calibration screen has been replaced by the showcase as the start-up picture: the game
now **draws its own graphics** — sprites from the built-in sprite sheet, the pixel font, the
HUD bars — instead of a test pattern. Both the browser build and the TV build now start the
same way: a loading bar, a check of the built-in game data and graphics, and then the
picture. If anything is missing or broken, you get a readable error screen instead of a
black one.

**Please re-test on the monitors:** install the new build and run through the checks in the
next section.

The game data and the sprite sheet travel **inside** the app (the sprite sheet is a small
picture file packed into the same `.wgt`, in its `assets/` folder). There are no extra files
to copy to the monitor or to a USB stick — installing the `.wgt` (or opening the browser
build) is all it takes, and the TV never needs a network connection to load it.

## On the Samsung Smart Monitor / TV

The TV build is installed from the development PC like the input probe — see
[install-on-tv.md](install-on-tv.md#installing-the-game-preview) for the commands. After
the first install it appears in the monitor's **Apps** list as **Shmup Cup**.

| Remote button | What it does in the preview |
|---|---|
| **Back** (↩) | Closes the app and returns to the monitor's home screen — also from the error screen |
| **Home** | Leaves the app; the animation pauses while it is in the background. Reopening it continues exactly where it stopped — nothing jumps ahead |
| Everything else | Read by the game every tick, but nothing in the showcase reacts to it yet |

Things to check on the monitor and report:

1. A loading bar (or nothing at all, if it is very quick) and then the showcase — never a
   black screen that stays black.
2. **Both HUD bars are complete**: the top bar's `1P` label and the `2P` score, and the
   bottom bar's ship icons and power meter, are fully visible. If one edge is cut off, note
   which — that would mean the monitor overscans or the app runs at a different resolution.
3. Everything is sharp: the pixel-font text, the ship and the stars have crisp square
   pixels, nothing is blurry.
4. The stars scroll and the ship flies **smoothly**. Film it with a phone if it looks uneven.
5. The white flashes on the enemies are brief and not uncomfortable to look at.
6. After Home → reopen, the app comes back without a black screen and the score continues
   from where it was.

The TV always starts with the showcase; the calibration screen can only be opened in a
browser.

## In a desktop browser

On a PC with the development tools installed (see the repository README):

```sh
pnpm install
pnpm dev
```

Open http://localhost:5173 (other devices on the same network can use the PC's IP
address, e.g. `http://192.168.1.20:5173`). Resize the window to see the whole-number
scaling at work: the picture snaps between sizes instead of stretching. Switching to
another tab pauses the animation; coming back continues it.

`pnpm --filter @shmup/tizen dev` (http://localhost:5174) opens the *TV* build in the
browser instead. It behaves the same, except that Back does nothing (there is no TV
system to return to).

### The calibration screen (browser only)

Add `?scene=calibration` to the address — http://localhost:5173/?scene=calibration — to get
the calibration screen the earlier builds started with. It is useful when you want to judge
scaling and colours on a new display:

| Element | What it tests | What "good" looks like |
|---|---|---|
| **Checker border** — a 1-pixel frame of alternating light and dark pixels on all four edges | Pixel-perfect scaling and overscan | Every edge pixel is visible, square and equally sized; no row or column is missing, doubled or blurred |
| **Faint grid** every 16 game pixels | Uniform scaling | All grid cells are exactly the same size |
| **Cross-hair** in the centre | Centring | Sits in the middle of the picture |
| **Colour bars** along the top (white, yellow, cyan, green, magenta, red, blue, dark grey) | Colour and contrast | Eight distinct, saturated bars with crisp edges |
| **Placeholder ship** on the left (an original design) | Sprite rendering | Crisp, square pixels, no smoothing |
| **Moving marker** — a small pink square with a white centre near the bottom, sliding left to right | The 60 Hz fixed-step simulation | Glides steadily at 60 game pixels per second and wraps back to the left about every 6 seconds; no stutter, jumps or speed changes |

## On the desktop (Electron)

```sh
pnpm install                          # without ELECTRON_SKIP_BINARY_DOWNLOAD, so Electron is downloaded
pnpm build
pnpm --filter @shmup/electron start
```

A 1152×648 window (×3) opens with the same showcase. Set `SHMUP_FULLSCREEN=1` before the
last command to start in fullscreen. Close the window (or Alt+F4 / Cmd+Q) to quit.

## When the app shows an error screen

If the app finds a problem while starting, it stops on an error screen: the same navy
background, a **pink title** saying what went wrong, and below it one line per problem.

| Title | What it means |
|---|---|
| `CONTENT ERRORS: N PROBLEMS` | Some of the built-in game data is broken. Each line names the file and the exact place in it, e.g. `player/kestrel.player.json:ships[0].speeds[2]: …` |
| `CONTENT COULD NOT BE READ` | The game data could not be read at all |
| `ATLAS PAGE FAILED TO LOAD` | The sprite sheet (a picture file inside the app) is missing or could not be opened |
| `ATLAS DOES NOT MATCH ITS MANIFEST` | The sprite sheet belongs to a different build than the rest of the app |
| `WEBGL IS NOT AVAILABLE` | The graphics hardware acceleration the game needs could not be started |
| `SHMUP CUP FAILED TO START` | Something else failed during start-up; the line below says what |

If more problems are found than fit on the screen, the last line says `… and N more`.
Please **take a photo of the whole screen** and send it with your report — the lines are
exactly what a developer needs. On the TV, press **Back** to close the app. These screens
mean the build itself is broken; they are not caused by anything you did.

## Troubleshooting

| Symptom | What to do |
|---|---|
| Error screen with a pink title | See [When the app shows an error screen](#when-the-app-shows-an-error-screen) — photograph it and report it |
| Error screen `WEBGL IS NOT AVAILABLE` in a browser | Hardware acceleration is off or blocked: enable it in the browser settings (Chrome: Settings → System → "Use graphics acceleration when available") and reload. On the TV, report it together with the monitor's firmware version |
| Black or empty screen that stays black | Should not happen any more — the app shows an error screen instead. In a browser open the developer console: the message "Shmup Cup failed to start" gives the reason. On the TV, report it with the firmware version |
| Magenta-and-black checkered squares instead of some pictures | A picture the game asked for is missing from the sprite sheet. Report which element shows it (e.g. "the ship") |
| Blurry picture in the browser | Browser zoom is not 100 % (press Ctrl+0), or the operating system scales the window unevenly. At 100 % zoom the pixels stay sharp on any display |
| Stars or ship stutter in the browser | Expected on 120/144 Hz monitors for now (smooth-motion interpolation is not in the preview yet); on a 60 Hz display it should be smooth. Also check the PC is not busy |
| Stars or ship stutter on the TV | Please report it — the M7 runs at 60 Hz and should show one step per refresh |
| Top or bottom HUD bar cut off on the TV | Check the monitor's picture size setting ("Fit to screen" / no overscan) and report which edge is missing |
| Opening `apps/tizen/dist/index.html` by double-clicking it shows an error or nothing | Desktop Chrome blocks the sprite sheet for files opened straight from disk. Use `pnpm --filter @shmup/tizen dev` instead (the TV itself is not affected) |
| The app does not appear on the TV | See the troubleshooting table in [install-on-tv.md](install-on-tv.md#troubleshooting) |
| Electron says it is not installed | It was skipped during installation; run `pnpm rebuild electron` |
| `pnpm dev` or `pnpm build` stops with "asset sources are invalid" | A graphics source file in the checkout is broken. Update to the latest version of the repository; if it persists, report the file names the message lists |

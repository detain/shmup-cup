# The preview build (free flight)

The game is not a game yet, but for the first time you can **fly the ship**. Every build —
browser, Samsung TV and desktop — starts with a short loading bar and then **free flight**:
the KESTREL, the player ship, flies in from the left edge of an empty starfield and from then
on follows the directional buttons of the TV remote, the arrow keys or a gamepad. There are no
enemies, no shooting and no sound yet. Free flight exists to prove on each device that the
whole chain works — the controls reach the ship quickly and reliably, the 60 ticks per second
simulation runs smoothly, the picture is pixel-perfect at the monitor's resolution — and to
catch control, smoothness or scaling problems early.

The earlier start-up pictures are still available in a browser: the animated **sprite
showcase** and the **calibration screen** — see [below](#other-screens-browser-only).

This page explains how to open the preview on each device, what you should see, how the ship
should behave, and what to report if something is wrong. The full button layouts are in
[controls.md](controls.md).

## Starting up: the loading screen

For a moment after the app opens you see a deep navy screen with **SHMUP CUP**, the word
**LOADING** and a progress bar that fills from left to right. On the TV and on a PC this
takes well under a second, so you may only see a flash of it. Then free flight starts.

If something is wrong with the build, the app stops on the **error screen** instead (see
[When the app shows an error screen](#when-the-app-shows-an-error-screen)) — it never just
stays black.

## What you should see

A deep navy picture (never pure black — the M7 monitors' VA panels smear dark-to-bright
transitions) framed by two thin bars, one along the top edge and one along the bottom:

| Element | Where | What "good" looks like |
|---|---|---|
| **Star field** in three layers | Whole picture behind the ship | Stars drift to the left at three different speeds (the far ones slowest), steadily, with no jumps; the pattern repeats seamlessly |
| **KESTREL**, the player ship | Enters from the left edge | Glides in from off-screen during the first ⅔ of a second, slowing down as it arrives, and stops at mid-height about a sixth of the way across. Then it is yours to fly |
| **Top bar** | Top edge | `1P` (cyan) and the score `00000000` on the left; **FREE FLIGHT** (yellow) in the middle |
| **Bottom bar** | Bottom edge | Two small ship icons on the left (your spare lives); the hint `ARROWS MOVE` (grey) in the middle |

Every pixel should be a crisp little square. The game draws at 384×216 and scales that up
by a whole number: on the 1080p M7 monitors (and any 1920×1080 browser window) the scale is
exactly ×5 and the picture fills the screen edge to edge. On other sizes the largest
whole-number scale that fits is used and a very dark border fills the rest — that border is
intentional, it keeps the pixels sharp.

The graphics are placeholders made for this project (original designs, not taken from any
other game) and will be replaced by finished art later.

## Flying the ship

| Device | Move the ship |
|---|---|
| Samsung remote | Directional pad ◀ ▲ ▶ ▼ |
| Keyboard | Arrow keys or W A S D |
| Gamepad | D-pad or left stick (press any button once first, so the browser or TV notices the pad) |

How it should feel:

- **While the ship flies in** (the first ⅔ of a second, and again whenever it re-enters) it
  ignores the controls. That is intentional.
- **It moves the moment you press and stops the moment you let go** — no drifting, no
  acceleration. At its normal speed it crosses the whole picture in a little over four
  seconds.
- **Diagonals** (two directions at once, where the device allows it) are not faster than
  straight moves: the ship covers the same distance per second in every direction.
- **It tilts** while climbing or diving and levels out when you stop moving up or down.
- **It cannot leave the playfield.** Holding a direction stops it a few pixels before the
  edge; it never covers the top or bottom bar and never disappears off the side.
- Nothing else reacts yet: no shooting, no power-ups, no pause screen. Those arrive in the
  next steps.

On the TV remote the ship stops about 1/30 of a second after you let go of a button — the
game waits that long to hide the remote's occasional "released and pressed again" hiccup, so a
held direction never stutters. Many remotes can only report one direction at a time, so the
ship may move in four directions only; the game is designed to be fully playable that way.

### What changed lately

The ship is now **under your control**, and free flight has replaced the sprite showcase as
the start-up picture (the showcase is still there in a browser, see below). The simulation
behind it is the real game engine: from here on, every build adds to this world — scrolling
stages, enemies, weapons.

**Please re-test on the monitors:** install the new build and run through the checks in the
next section — how the ship responds to the remote is the most valuable report right now.

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
| Directional pad (◀ ▲ ▶ ▼) | Flies the ship |
| **Back** (↩) | Closes the app and returns to the monitor's home screen — also from the error screen |
| **Home** | Leaves the app; everything freezes while it is in the background. Reopening it continues exactly where it stopped — nothing jumps ahead |
| Everything else | Read by the game every tick, but nothing reacts to it yet |

Things to check on the monitor and report:

1. A loading bar (or nothing at all, if it is very quick) and then the stars and the ship
   flying in — never a black screen that stays black.
2. **Both HUD bars are complete**: the top bar's `1P` and score on the left, **FREE FLIGHT**
   in the middle; the bottom bar's two ship icons and `ARROWS MOVE`. If one edge is cut off,
   note which — that would mean the monitor overscans or the app runs at a different
   resolution.
3. Everything is sharp: the pixel-font text, the ship and the stars have crisp square
   pixels, nothing is blurry.
4. **The ship answers the directional pad right away** and moves smoothly while you hold a
   direction. Report if it hesitates when you press, stutters or stops for a moment while
   you hold a button, or keeps moving noticeably after you let go. Film it with a phone
   (ideally in slow motion) if it looks uneven.
5. Press two directions at once (for example ▲ and ▶): note whether the ship moves
   diagonally or only in one direction — this tells us what your remote can report.
6. Fly into every edge: the ship stops before each edge, stays fully visible and never
   covers a HUD bar.
7. The stars drift **smoothly**.
8. After Home → reopen, the app comes back without a black screen and the ship is where you
   left it.

The TV always starts with free flight; the showcase and the calibration screen can only be
opened in a browser.

## In a desktop browser

On a PC with the development tools installed (see the repository README):

```sh
pnpm install
pnpm dev
```

Open http://localhost:5173 (other devices on the same network can use the PC's IP
address, e.g. `http://192.168.1.20:5173`) and fly with the arrow keys, W A S D or a gamepad.
Resize the window to see the whole-number scaling at work: the picture snaps between sizes
instead of stretching. Switching to another tab freezes the game; coming back continues it.

To feel the TV remote's limits on a keyboard — one direction at a time, the same release
delay as on the TV — open http://localhost:5173/?profile=keyboard-remote-emulation (details in
[controls.md](controls.md#feeling-the-remote-on-a-desktop-keyboard)).

`pnpm --filter @shmup/tizen dev` (http://localhost:5174) opens the *TV* build in the
browser instead. It behaves the same, except that Back does nothing (there is no TV
system to return to).

### Other screens (browser only)

| Address | Screen |
|---|---|
| http://localhost:5173/?scene=showcase | The **sprite showcase** the previous builds started with: the KESTREL flying a figure-eight with two Options, five enemies with hit flashes, a ring of bullets, both HUD bars with a counting score and a blinking power meter. Nothing reacts to the controls |
| http://localhost:5173/?scene=calibration | The **calibration screen**, for judging scaling and colours on a new display (below) |

The calibration screen:

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

A 1152×648 window (×3) opens with the same free flight; fly with the keyboard or a gamepad.
Set `SHMUP_FULLSCREEN=1` before the last command to start in fullscreen. Close the window (or
Alt+F4 / Cmd+Q) to quit.

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
| The ship does not move | Wait until it has finished flying in (⅔ of a second). In a browser, click once into the page so it has the keyboard focus; with a gamepad, press any button first. On the TV, report it together with the remote model |
| The ship moves only up, down, left and right | Normal on remotes that report one direction at a time, and with `?profile=keyboard-remote-emulation` in a browser. With a keyboard or gamepad and no `?profile=` in the address, please report it |
| The ship keeps moving after I let go (TV) | A tiny delay (1/30 of a second) is intentional. If it clearly keeps going, report it — and film it if you can |
| The ship stutters or stops for a moment while I hold a direction (TV) | Please report it with the remote model: the game's hiccup protection is supposed to hide exactly this |
| The ship flies in from the left again | Not expected in this build — the ship only flies in at start-up. Please report what you were doing |
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

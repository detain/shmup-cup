# The preview build (calibration screen)

The game is at the skeleton stage: every build — browser, Samsung TV and desktop — starts
into a **calibration screen** instead of a game. There is nothing to play yet. The screen
exists to prove that the whole chain works on each device (the app starts, the 60 ticks
per second simulation runs, the picture is pixel-perfect at the monitor's resolution) and
to catch scaling or smoothness problems early.

This page explains how to open the preview on each device, what you should see, and what
to report if it looks wrong. Controls for the finished game are listed in
[controls.md](controls.md).

## What you should see

A deep navy screen (never pure black — the M7 monitors' VA panels smear dark-to-bright
transitions) with:

| Element | What it tests | What "good" looks like |
|---|---|---|
| **Checker border** — a 1-pixel frame of alternating light and dark pixels on all four edges | Pixel-perfect scaling and overscan | Every edge pixel is visible, square and equally sized; no row or column is missing, doubled or blurred |
| **Faint grid** every 16 game pixels | Uniform scaling | All grid cells are exactly the same size |
| **Cross-hair** in the centre | Centring | Sits in the middle of the picture |
| **Colour bars** along the top (white, yellow, cyan, green, magenta, red, blue, dark grey) | Colour and contrast | Eight distinct, saturated bars with crisp edges |
| **Placeholder ship** on the left (an original design) | Sprite rendering | Crisp, square pixels, no smoothing |
| **Moving marker** — a small pink square with a white centre near the bottom, sliding left to right | The 60 Hz fixed-step simulation | Glides steadily at 60 game pixels per second and wraps back to the left about every 6 seconds; no stutter, jumps or speed changes |

The game draws at 384×216 and scales that up by a whole number. On the 1080p M7
monitors (and any 1920×1080 browser window) the scale is exactly ×5 and the picture fills
the screen edge to edge. On other sizes the largest whole-number scale that fits is used
and a very dark border fills the rest — that border is intentional, it keeps the pixels
sharp.

There is no sound yet.

### What changed lately

Work has moved to the game engine itself — the seeded randomness, angle tables, event
queue and object storage the real game needs — and to the **game data**: the first ship
(KESTREL, with its six speed levels) and its Type A weapons are now written down as data
files that the build checks automatically. None of it is visible on screen yet, so the
calibration screen looks exactly as it did before and there is nothing new to test on the
monitors. Re-test only when this page says the picture changed.

Good to know for later: the game data travels **inside** the app. There are no extra files
to copy to the monitor or to a USB stick — installing the `.wgt` (or opening the browser
build) is all it takes, and the TV never needs a network connection to load it.

## On the Samsung Smart Monitor / TV

The TV build is installed from the development PC like the input probe — see
[install-on-tv.md](install-on-tv.md#installing-the-game-preview) for the commands. After
the first install it appears in the monitor's **Apps** list as **Shmup Cup**.

| Remote button | What it does in the preview |
|---|---|
| **Back** (↩) | Closes the app and returns to the monitor's home screen |
| **Home** | Leaves the app; the simulation pauses while it is in the background. Reopening it continues where it stopped — the marker does not jump |
| Everything else | Read by the game every tick, but nothing on the calibration screen reacts to it yet |

Things to check on the monitor and report:

1. The checker border is complete on all four sides (if one edge is cut off, note which —
   that would mean the monitor overscans or the app runs at a different resolution).
2. The marker moves smoothly. Film it with a phone if it looks uneven.
3. Nothing is blurry.
4. After Home → reopen, the app comes back without a black screen.

## In a desktop browser

On a PC with the development tools installed (see the repository README):

```sh
pnpm install
pnpm dev
```

Open http://localhost:5173 (other devices on the same network can use the PC's IP
address, e.g. `http://192.168.1.20:5173`). Resize the window to see the whole-number
scaling at work: the picture snaps between sizes instead of stretching. Switching to
another tab pauses the simulation; coming back continues it.

`pnpm --filter @shmup/tizen dev` (http://localhost:5174) opens the *TV* build in the
browser instead. It behaves the same, except that Back does nothing (there is no TV
system to return to).

## On the desktop (Electron)

```sh
pnpm install                          # without ELECTRON_SKIP_BINARY_DOWNLOAD, so Electron is downloaded
pnpm build
pnpm --filter @shmup/electron start
```

A 1152×648 window (×3) opens with the same screen. Set `SHMUP_FULLSCREEN=1` before the
last command to start in fullscreen. Close the window (or Alt+F4 / Cmd+Q) to quit.

## Troubleshooting

| Symptom | What to do |
|---|---|
| Black or empty screen | The graphics (WebGL) could not start. In a browser open the developer console: the message "Shmup Cup failed to start" gives the reason; make sure hardware acceleration is enabled. On the TV, report it together with the monitor's firmware version |
| Blurry picture in the browser | Browser zoom is not 100 % (press Ctrl+0), or the operating system scales the window unevenly. At 100 % zoom the pixels stay sharp on any display |
| Marker stutters in the browser | Expected on 120/144 Hz monitors for now (smooth-motion interpolation is not in the preview yet); on a 60 Hz display it should be smooth. Also check the PC is not busy |
| Marker stutters on the TV | Please report it — the M7 runs at 60 Hz and should show one step per refresh |
| Edges of the checker border missing on the TV | Check the monitor's picture size setting ("Fit to screen" / no overscan) and report which edge is missing |
| The app does not appear on the TV | See the troubleshooting table in [install-on-tv.md](install-on-tv.md#troubleshooting) |
| Electron says it is not installed | It was skipped during installation; run `pnpm rebuild electron` |

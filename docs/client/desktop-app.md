# The desktop app (Windows, macOS, Linux, Steam Deck)

Shmup Cup also runs as a desktop app. It is the same game as the browser build — the same title
screen, zones, Options screen and controls — in a window of its own, with its settings, high
scores and window size kept in files on the computer. This page covers starting it, the window and
its keys, where the saves live, making installers, and troubleshooting.

The TV remains the main target; the desktop app is for playing and testing on a PC (and, later, on
Steam). Nothing on this page is needed for the TV.

## Starting it

From the repository root (Node 24.15+ and pnpm 12, as for the TV —
[install-on-tv.md](install-on-tv.md#installing-the-game-preview)):

```sh
pnpm install                          # without ELECTRON_SKIP_BINARY_DOWNLOAD, so Electron is downloaded
pnpm build
pnpm --filter @shmup/electron start
```

If Electron was skipped during an earlier install, run `pnpm rebuild electron` once. To start in
fullscreen for one launch, set `SHMUP_FULLSCREEN=1` before the last command (Command Prompt:
`set SHMUP_FULLSCREEN=1`; PowerShell: `$env:SHMUP_FULLSCREEN = "1"`).

## The window

The first launch opens a **1152×648** window (the game's 384×216 picture at ×3) in the middle of
the screen. After that the app **remembers** how you left it: fullscreen or not, the window size
and where it was on the screen.

| Keys | What they do |
|---|---|
| **F11** or **Alt+Enter** | Fullscreen on / off |
| **Ctrl + =** (or **Ctrl + +**) | Bigger window: the next whole size (×4 = 1536×864, ×5 = 1920×1080, …) |
| **Ctrl + -** | Smaller window (down to ×1 = 384×216) |
| **Ctrl + 0** | Back to ×3 (1152×648) |

On a Mac use **Cmd** instead of Ctrl. The size keys do nothing in fullscreen, and the window never
grows bigger than the screen it is on — on a 1080p monitor with a taskbar ×4 is usually the largest
window (×5 needs the whole screen: use fullscreen), on the Steam Deck ×3. None of these keys does
anything in the game itself.

- The window always shows whole-pixel sizes of the picture, so the default **SCALE: INTEGER**
  (OPTIONS → DISPLAY) fills it without borders and every pixel stays square and crisp. In
  fullscreen, SCALE decides as on the TV: INTEGER (sharp, possibly with a border), FIT or STRETCH.
- If the window was on a second monitor that is no longer connected, it opens centred on the main
  screen instead.
- You can also resize the window by dragging its edge; the picture then follows the SCALE option.
  A dragged size is not remembered — the next launch uses the last size chosen with the keys.

## Playing

- **Controls** are the browser's: the keyboard (arrows or W A S D, Z / Space, X, C, Enter, V,
  Left Shift, P / Esc / Backspace) and any standard gamepad (press one of its buttons once so the
  game notices it); two players with a second gamepad or the SPLIT KEYBOARD profile —
  [controls.md](controls.md#keyboard).
- **Sound starts at once**, with the title music — unlike a browser, the desktop app does not
  wait for a first key press.
- **Quitting**: the title menu has **EXIT** (like the TV), and **Back** (Esc) on the title asks
  **EXIT SHMUP CUP?** — YES closes the app. Closing the window (or Alt+F4 / Cmd+Q) works too and
  loses nothing that was already saved.
- **High-refresh monitors** (120 / 144 Hz): the game still runs at 60 steps a second, and the
  picture is smoothed in between, so motion looks fluid, not stuttery.

## Where the saves live

The desktop app keeps its data as small files in a `saves` folder inside its user-data folder — on
Windows inside `%APPDATA%`, on Linux inside `~/.config`, on macOS inside
`~/Library/Application Support`, in a folder named after the app:

| File | What |
|---|---|
| `save.v1.json` | Your Options (volumes, controls, your own keys, picture and game settings, the difficulty) and your high scores |
| `window.json` | Fullscreen, the window size and its position |
| `….json.bak` | The previous version of each file — the game reads it by itself if the file is ever missing or damaged |
| `save.corrupt.json` | Only after a damaged save was found: a copy of it for the developers (please attach it to your report) |

- Saving can never leave a half-written file: a save is written to a new file first and only then
  swapped in, and the previous version is kept as the `.bak`.
- The desktop app and a browser keep **separate** settings and high scores; nothing moves between
  them.
- Desktop builds from before these save files (before the platform-polish build) kept their
  settings and high scores inside the app's own browser storage. The save files do not read it, so
  the first launch of a newer build **starts with the default settings and no high scores**.
- **To start from scratch**, close the app and delete the `saves` folder (or just `save.v1.json`
  and `save.v1.json.bak`); delete `window.json` to get the default window back.
- The saves folder may hold at most 8 MB (a full save is about 26 KB), so this limit is never
  reached in normal play.

## Making installers (project owner)

```sh
pnpm build
pnpm --filter @shmup/electron package
```

This downloads a fixed version of the packaging tool on first use and writes the installers to
`apps/electron/release/`: on **Windows** an installer (you choose the folder) and a portable
`.exe`; on **Linux** an AppImage and a `.tar.gz` (the Steam Deck's desktop mode runs the AppImage);
on **macOS** a `.dmg`. Build each on its own operating system. The installers are **not signed**
(Windows SmartScreen and macOS Gatekeeper will warn) and have no icon of their own yet — the icon
set comes with the release candidate. Nothing is uploaded anywhere.

## Troubleshooting

| Problem | What to do |
|---|---|
| `electron: command not found` or "Electron failed to install" | It was skipped during installation (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`); run `pnpm rebuild electron` |
| The build step says "Web build not found" | Run `pnpm build` from the repository root (it builds the web game first) |
| The window opens off-screen or at a strange size | Close the app, delete `window.json` in the saves folder, start again |
| Ctrl + = does not make the window bigger | The window is in fullscreen (press F11 first), or the next size would not fit the screen |
| Settings or high scores are gone after an update | Expected once, on the first launch of the platform-polish build or later coming from an older desktop build ([above](#where-the-saves-live)). Otherwise please report it with the files of the saves folder; if `save.corrupt.json` appeared, the save was damaged and the game started with defaults |
| The picture is blurry | SCALE is FIT or STRETCH at a non-whole size — choose INTEGER (OPTIONS → DISPLAY), or step the window with Ctrl + = / Ctrl + - |
| No sound | Check the game's MASTER / SFX / MUSIC volumes (OPTIONS) and the computer's volume; the app needs no key press for sound |
| The gamepad does nothing | Press one of its buttons once; it must be a standard (Xbox / PlayStation layout) controller |
| A warning that the installer is from an unknown publisher | Expected — the development installers are not signed; choose "Run anyway" / "Open" only for installers you built yourself |

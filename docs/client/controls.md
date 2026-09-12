# Controls

Shmup Cup is designed for the **Samsung Smart Remote** first; a gamepad or a keyboard
work too, and every device drives both the game and the menus.

> **Status:** these controls are built into the game as **control profiles** and are read
> every frame. The current build ([preview-build.md](preview-build.md)) starts on the **title
> screen**: OK (Enter / A) opens the menu, ▲ ▼ move the highlight, OK chooses — START begins a
> game. In the game the **directions fly the ship** on every device and the gun **fires on its
> own** — the same in the scrolling test stage (`?stage=test-range` in a browser), where enemies
> fly past, shoot at you (every bullet pattern is dodgeable with the four arrow directions alone)
> and are shot down. **PowerUp** (OK on the remote, Enter or C on a keyboard, X on a gamepad)
> takes the highlighted power-up of the power meter once you have collected capsules
> ([preview-build.md](preview-build.md#power-ups)). **Pause** — Back or Play/Pause on the remote,
> Esc / P / Backspace on a keyboard, Start / Back on a gamepad — opens the pause menu; in menus
> **Back** goes back, and on the TV's title screen it asks before quitting
> ([preview-build.md](preview-build.md#pausing-quitting-and-the-end-screens)). Losing a ship needs
> no button: the next one flies in by itself, and after **GAME OVER** OK returns to the title.
> The other buttons (Special, Speed) do nothing yet. The remote's settings may still change once
> the input probe results from the M7 monitors are in, and a menu for choosing a profile and
> rebinding buttons is planned.

## In the game and in menus

Every device has **two sets of controls**: one while you play, one in menus and on the pause
screen. That is how one button can do two sensible things — OK takes a power-up in the game
and selects a menu entry in menus; Back pauses the game and goes back in menus.

| Action | What it does |
|---|---|
| Move | Game: fly the ship (8 directions where the device allows it; diagonals are no faster than straight moves, and the ship stops as soon as you let go). Menus: move the highlight (▲ ▼; ◀ ▶ between YES and NO) — holding a direction repeats the move after about a third of a second, then about ten times a second |
| Shot | Main gun. Today it fires **on its own** on every device (automatic fire is on by default, and always on with the TV remote), so you never need to press it; once automatic fire can be switched off in the Options menu, hold it to fire |
| Sub | Missiles / sub-weapon, once you have them — automatic in the same way |
| PowerUp | Take the highlighted power-up of the power meter — one per press (holding the button never takes a second); a press on an empty or maxed-out slot does nothing |
| Special | Screen-clearing special, when you have one |
| Speed | Cycle ship speed (item mode) |
| Pause | Pause / resume (the pause menu: RESUME, RETRY STAGE, QUIT TO TITLE) |
| Confirm | Menus: select the highlighted entry; on the title first leaves `PRESS OK`. A press made while a menu is just appearing is remembered for a moment, not lost |
| Back | Menus: previous screen (in the pause menu: resume; in a YES / NO question: NO); on the TV's title screen it asks **EXIT SHMUP CUP?** — only YES quits |

If you are holding a button at the moment a menu opens (or closes), it keeps doing only what
it does in both sets until you let go — holding the Sub key while the pause menu appears will
not suddenly press Back. Release it and press again. The menus answer to **every** controller —
the TV remote, the keyboard and both gamepads.

## Samsung Smart Remote

| Button | In the game | In menus |
|---|---|---|
| Directional pad (◀ ▲ ▶ ▼) | Move | Move the highlight |
| OK (centre) | PowerUp | Confirm |
| Back (↩) | Pause | Back |
| Play/Pause ⏯ (if your remote has it) | Pause | Pause |
| Channel up | Special | — |
| Channel down | Speed | — |

- On the TV the ship fires its main gun **and** its missiles automatically, so no button is
  ever needed for shooting (in the current build the gun starts firing as soon as the ship has
  flown in). **OK** is the only other button the game needs: a rare press to take a power-up,
  which never stops a direction you are holding. Channel up / down are optional extras —
  nothing ever requires them.
- Some TV remotes briefly report a held button as released and pressed again. The game hides
  such hiccups (up to about 1/30 of a second), so a held direction never stutters; in return,
  letting go of a button registers two frames later — too short to notice.
- Whether pressing two directions at once moves the ship diagonally depends on the remote;
  many can only report one arrow at a time. The game is designed to be fully playable with
  four directions.
- **Home** always leaves the app; the game pauses in the background and continues when you
  return. Long-pressing Back and the volume keys belong to the TV and are never used by the
  game — they set the monitor's volume as usual (the game has no volume setting of its own
  yet). The colour buttons (red/green/yellow/blue on the on-screen number pad) are reserved
  for later use.
- **Back** never closes the game by surprise: in the game it pauses, in menus it goes back,
  and on the title screen it asks **EXIT SHMUP CUP?** (NO is highlighted) — only **YES** returns
  to the monitor's home screen. Only while the app is still loading, or on its error screen,
  does Back close it at once.

## Gamepad

Any controller the TV or browser recognises as a standard gamepad (Xbox / PlayStation
layout). A controller becomes visible to the game only after you **press one of its
buttons** once — press any button to activate it. In a browser a gamepad button does **not**
turn the sound on: browsers allow sound only after a key press or a click, so press a key or
click the picture once.

| Button (Xbox / PlayStation) | In the game | In menus |
|---|---|---|
| D-pad or left stick | Move | Move the highlight |
| A / Cross | Shot | Confirm |
| B / Circle | Sub | Back |
| X / Square | PowerUp | — |
| Y / Triangle | Special | — |
| LB / L1, RB / R1 | Speed | — |
| Start / Options | Pause | Pause |
| Back / Share (Select) | Pause | Back |

The left stick has a dead zone of 20 % and snaps to 8 directions. The first controller
(and the remote or keyboard) control player 1; the second controller controls player 2.

## Keyboard

| Key | In the game | In menus |
|---|---|---|
| Arrow keys or W A S D | Move | Move the highlight |
| Z or Space | Shot | Confirm |
| X | Sub | Back |
| C | PowerUp | — |
| Enter (or numpad Enter) | PowerUp | Confirm |
| V | Special | — |
| Left Shift | Speed | — |
| P | Pause | Pause |
| Esc | Pause | Back |
| Backspace | Pause | Back |

Keys are matched by their position, so W A S D work on any keyboard layout (on AZERTY
they are the keys labelled Z Q S D). Holding a key down does not repeat; a very short tap
is never lost. Pressing Left and Right (or Up and Down) together cancels out on that axis.
The game keeps the keys it uses from scrolling or navigating the page; browser shortcuts
with Ctrl / Cmd (reload, developer tools) keep working. Switching to another window
releases every key, so nothing stays stuck.

## Control profiles

The button layouts above are **profiles**, stored as game data rather than built into the
program — so the remote's behaviour can be retuned after measuring it without a new version
of the code.

| Profile | Name in the game | Used |
|---|---|---|
| `tizen-remote-safe` | TV REMOTE | On the TV (default) |
| `tizen-remote-diagonal` | TV REMOTE 8-WAY | Same buttons, without the hiccup protection — for remotes that turn out not to need it |
| `keyboard-default` | KEYBOARD | In a browser and on the desktop (default) |
| `keyboard-remote-emulation` | KEYBOARD AS TV REMOTE | Desktop testers who want to feel the remote's limits (below) |
| `gamepad-standard` | GAMEPAD | Every gamepad, on every device |

A choice will be offered in the Options menu later, and the game remembers it.

### Feeling the remote on a desktop keyboard

In a browser, add `?profile=keyboard-remote-emulation` to the address (for example
http://localhost:5173/?profile=keyboard-remote-emulation when running `pnpm dev`). The
keyboard then behaves like the Samsung remote: only one direction at a time (the arrow pressed
last wins), the same hiccup protection as on the TV, and only the remote's buttons:

| Key | Remote button |
|---|---|
| Arrow keys | Directional pad |
| Enter | OK |
| Backspace | Back |
| P | Play/Pause |
| Page Up / Page Down | Channel up / down |

Every other key (Z, X, W A S D, …) does nothing in this profile. Testers can also add
`&debounce=0` … `&debounce=10` to change how long the hiccup protection waits (in frames of
1/60 s; the TV uses 2). These options exist only in the browser; the TV always starts with
its default.

## Troubleshooting

| Problem | What to do |
|---|---|
| Play/Pause or Channel up / down do nothing on the TV | Not every remote has these buttons or sends them to apps. They are optional — use Back to pause. Please report the remote model (the input probe records which keys arrive) |
| Diagonals never work with the keyboard | The address probably contains `?profile=keyboard-remote-emulation`, which allows one direction at a time. Remove it and reload |
| `?profile=…` seems to be ignored | The name is misspelled or is not a keyboard/remote profile (a gamepad profile cannot drive the keyboard). The game then uses the normal keyboard profile and writes a warning in the browser's developer console |
| A button does something in the game but nothing in a menu (or the other way round) | Expected — see the two tables above; for example C (PowerUp) has no menu function |
| The game shows a start-up error screen mentioning `input-profiles.json` | The control profiles in this build are broken. Report the lines on the screen — see [preview-build.md](preview-build.md) |
| Back closes the game on the TV instead of pausing | Not expected any more — Back pauses in the game and asks before quitting on the title. It closes the app at once only on the loading and error screens; otherwise please report it (and check the installed build is the latest) |
| Nothing reacts for a moment after the app starts | The title screen needs OK first (`PRESS OK`), then START; after START the ship flies in (about ⅔ of a second) and ignores the controls until it arrives — see [preview-build.md](preview-build.md#flying-the-ship) |
| Holding Shot (Z / Space, A / Cross) or Sub (X, B / Circle) changes nothing | Expected: the gun already fires on its own (automatic fire is on by default), and the missiles fire on their own too once a power-up gave them to you (in a browser, `?loadout=full` gives them to you right away) |
| PowerUp (OK, Enter, C, X) does nothing | Expected until you have collected a power capsule (no box of the power meter is highlighted) — and on the TV and the desktop, whose games fly in open space without enemies, there are none yet. Also expected when you already have the most of the highlighted power-up. Such a press plays a short, low "no" buzz. See [preview-build.md](preview-build.md#power-ups) |
| No sound in the browser | Press a key or click into the picture once — the sound starts then (a gamepad button does not count). See [preview-build.md](preview-build.md#sound-and-music) |
| Pressing OK while holding an arrow stops the ship on the TV | Not expected — the game keeps the arrow held. Please report it with the remote model: it means the remote itself drops the arrow when OK is pressed |
| Pause does nothing | On the title and the end screens Pause has no job — it pauses only a running game. In the game it should open the PAUSE menu; if not, please report the device and the button |
| Special, Speed and the other buttons do nothing | Expected in the current preview — nothing uses them yet |
| A menu moves two steps for one press, or skips a press | Not expected — please report the device (and the remote model) |

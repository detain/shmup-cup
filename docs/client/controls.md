# Controls

Shmup Cup is designed for the **Samsung Smart Remote** first; a gamepad or a keyboard
work too, and every device drives both the game and the menus.

> **Status:** these controls are built into the game as **control profiles** and are read
> every frame. In the current build ("free flight", [preview-build.md](preview-build.md))
> the **directions fly the ship** on every device; the other buttons do nothing yet, except
> **Back** on the TV, which closes the app (also from the start-up error screen). Shooting,
> power-ups and the pause screen arrive in the next steps. The remote's settings may still
> change once the input probe results from the M7 monitors are in, and a menu for choosing a
> profile and rebinding buttons is planned.

## In the game and in menus

Every device has **two sets of controls**: one while you play, one in menus and on the pause
screen. That is how one button can do two sensible things — OK takes a power-up in the game
and selects a menu entry in menus; Back pauses the game and goes back in menus.

| Action | What it does |
|---|---|
| Move | Game: fly the ship (8 directions where the device allows it; diagonals are no faster than straight moves, and the ship stops as soon as you let go). Menus: move the highlight |
| Shot | Main gun — held for autofire; always firing in remote mode |
| Sub | Missiles / sub-weapon (also automatic in remote mode) |
| PowerUp | Power-meter mode: take the highlighted power-up |
| Special | Screen-clearing special, when you have one |
| Speed | Cycle ship speed (item mode) |
| Pause | Pause / resume |
| Confirm | Menus: select the highlighted entry |
| Back | Menus: previous screen; on the title screen it asks whether to quit |

If you are holding a button at the moment a menu opens (or closes), it keeps doing only what
it does in both sets until you let go — holding the Sub key while the pause menu appears will
not suddenly press Back. Release it and press again.

## Samsung Smart Remote

| Button | In the game | In menus |
|---|---|---|
| Directional pad (◀ ▲ ▶ ▼) | Move | Move the highlight |
| OK (centre) | PowerUp | Confirm |
| Back (↩) | Pause | Back |
| Play/Pause ⏯ (if your remote has it) | Pause | Pause |
| Channel up | Special | — |
| Channel down | Speed | — |

- In remote mode the ship fires its main gun **and** its missiles automatically, so no button
  is needed for shooting. Channel up / down are optional extras — nothing ever requires them.
- Some TV remotes briefly report a held button as released and pressed again. The game hides
  such hiccups (up to about 1/30 of a second), so a held direction never stutters; in return,
  letting go of a button registers two frames later — too short to notice.
- Whether pressing two directions at once moves the ship diagonally depends on the remote;
  many can only report one arrow at a time. The game is designed to be fully playable with
  four directions.
- **Home** always leaves the app; the game pauses in the background and continues when you
  return. Long-pressing Back and the volume keys belong to the TV and are never used by the
  game. The colour buttons (red/green/yellow/blue on the on-screen number pad) are reserved
  for later use.
- Today Back still closes the app from free flight, because it is the first screen; once
  the title screen exists, Back there asks before quitting.

## Gamepad

Any controller the TV or browser recognises as a standard gamepad (Xbox / PlayStation
layout). A controller becomes visible to the game only after you **press one of its
buttons** once — press any button to activate it.

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
| Back closes the game on the TV instead of pausing | Expected in the current preview — free flight is the first screen. Pausing with Back arrives with the playable game |
| The ship does not react for a moment after the app starts | It is flying in (about ⅔ of a second) and ignores the controls until it arrives — see [preview-build.md](preview-build.md#flying-the-ship) |
| Shot, PowerUp, Pause and the other buttons do nothing | Expected in the current preview — only the directions are used so far |

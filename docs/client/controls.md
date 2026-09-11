# Controls

Shmup Cup is designed for the **Samsung Smart Remote** first; a gamepad or a keyboard
work too, and every device drives both the game and the menus.

> **Status:** these default bindings are already built into the input layer and are read
> every frame, but the current build only shows the calibration screen
> ([preview-build.md](preview-build.md)) — nothing on it reacts to buttons yet except
> **Back** on the TV, which closes the app. Bindings may still change once the input
> probe results from the M7 monitors are in, and a rebinding menu is planned.

## What the actions do

| Action | In the game | In menus |
|---|---|---|
| Move | Fly the ship (8 directions where the device allows it) | Move the highlight |
| Shot | Main gun — held for autofire; always firing in remote mode | Confirm |
| Sub | Missiles / sub-weapon | Back |
| PowerUp | Power-meter mode: take the highlighted power-up | Confirm |
| Special | Screen-clearing special, when you have one | — |
| Speed | Cycle ship speed (item mode) | — |
| Pause | Pause / resume | — |
| Confirm | — | Select the highlighted entry |
| Back | Pause | Previous screen; on the title screen it asks whether to quit |

## Samsung Smart Remote

| Button | Action |
|---|---|
| Directional pad (◀ ▲ ▶ ▼) | Move |
| OK (centre) | Confirm + PowerUp |
| Back (↩) | Back |
| Play/Pause ⏯ (if your remote has it) | Pause |
| Channel up | Special |
| Channel down | Speed |

In remote mode the ship fires automatically, so no button is needed for shooting. The
Home button always leaves the app; the game pauses in the background and continues when
you return. Long-pressing Back is reserved by the TV and is never used by the game.
The colour buttons (red/green/yellow/blue on the on-screen number pad) are reserved for
later use.

## Gamepad

Any controller the TV or browser recognises as a standard gamepad (Xbox / PlayStation
layout). A controller becomes visible to the game only after you **press one of its
buttons** once — press any button to activate it.

| Button (Xbox / PlayStation) | Action |
|---|---|
| D-pad or left stick | Move |
| A / Cross | Shot + Confirm |
| B / Circle | Sub + Back |
| X / Square | PowerUp |
| Y / Triangle | Special |
| LB / L1, RB / R1 | Speed |
| Start / Options | Pause |
| Back / Share (Select) | Back |

The left stick has a dead zone of 20 % and snaps to 8 directions. The first controller
(and the remote or keyboard) control player 1; the second controller controls player 2.

## Keyboard

| Key | Action |
|---|---|
| Arrow keys or W A S D | Move |
| Z or Space | Shot + Confirm |
| X | Sub + Back |
| C | PowerUp |
| Enter | Confirm + PowerUp |
| V | Special |
| Left Shift | Speed |
| P | Pause |
| Esc | Back + Pause |
| Backspace | Back |

Keys are matched by their position, so W A S D work on any keyboard layout (on AZERTY
they are the keys labelled Z Q S D). Holding a key down does not repeat; a very short tap
is never lost. Browser shortcuts with Ctrl / Cmd (reload, developer tools) keep working.

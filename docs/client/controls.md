# Controls

Shmup Cup is designed for the **Samsung Smart Remote** first; a gamepad or a keyboard
work too, and every device drives both the game and the menus.

> **Status:** these controls are built into the game as **control profiles** and are read
> every frame. The current build ([preview-build.md](preview-build.md)) starts on the **title
> screen**: OK (Enter / A) opens the menu, ▲ ▼ move the highlight, OK chooses — **1 PLAYER** (or
> **2 PLAYERS**, [below](#two-players)) opens the **DIFFICULTY** box, where ▲ ▼ pick EASY / NORMAL / HARD / ARCADE and OK opens the **SHIP
> SELECT** box, where ▲ ▼ pick the KESTREL or the MANTA — OK on the MANTA begins a game at once,
> OK on the KESTREL opens the **WEAPON SELECT** screen — ▲ ▼ move between its lines, ◀ ▶ change the weapon type, the Option type, the
> `?` / `!` power-ups and Auto Power-Up, and OK on START (highlighted when it opens) begins a game — the
> first zone, **AZURE VERGE**, on every device. In the game the **directions fly the
> ship** and the gun **fires on its own**; enemies fly past and shoot at you — every bullet pattern
> and every boss laser is dodgeable with the four arrow directions alone, no diagonals needed (a
> test program that plays with single arrow presses clears the whole zone) — and are shot down. **PowerUp** (OK on the remote, Enter or C on a keyboard, X on a gamepad)
> takes the highlighted power-up of the power meter once you have collected capsules
> ([preview-build.md](preview-build.md#power-ups)) — the KESTREL's; the MANTA powers up by flying
> into colour items and ignores OK in the game. **Pause** — Back or Play/Pause on the remote,
> Esc / P / Backspace on a keyboard, Start / Back on a gamepad — opens the pause menu; in menus
> **Back** goes back, and on the TV's title screen it asks before quitting
> ([preview-build.md](preview-build.md#pausing-quitting-and-the-end-screens)). Losing a ship needs
> no button: the next one flies in by itself; with continues left, OK on the **CONTINUE?**
> countdown carries on from the last checkpoint (Back gives up), and after **GAME OVER** OK
> returns to the title. After a zone's boss the **ZONE MAP** opens: ▲ ▼ choose the next zone, OK
> launches it, Back asks **QUIT TO TITLE?**; after the last zone the **ending** plays — OK shows
> the whole story, OK again the result card, OK there the **credits** (OK or Back skips them to the
> title) ([preview-build.md](preview-build.md#the-endings-and-the-credits)). In a **2 PLAYERS** game a second player joins at any time with START on a
> gamepad (or Enter on the SPLIT KEYBOARD in a browser) — [Two players](#two-players).
> After a high score the **name entry** asks for your initials — ▲ ▼ change the letter, ▶ or OK go
> to the next, ◀ or Back go back, OK on `END` finishes — and the high-score table follows (OK
> returns to the title). Left alone on `PRESS OK` for 12 seconds the title plays the **attract
> loop** (a zone demo, the high-score tables, the story) — **any** button returns to the title. The
> title menu's **PRACTICE** box (▲ ▼ move, ◀ ▶ or OK change ZONE, CHECKPOINT and LOADOUT, OK on
> START) and **SOUND TEST** box (◀ ▶ choose a tune or a sound, OK plays it) close with Back
> ([preview-build.md](preview-build.md#the-front-end-attract-mode-high-scores-practice-and-the-sound-test)).
> **OPTIONS** (on the title and in the pause menu) sets the game's volumes and opens three pages:
> **CONTROLS** — the control profile ([below](#control-profiles)), how the gun fires (**AUTOFIRE**
> always / toggle / hold, in a browser) and how fast (**RATE**), **SOCD**, the remote's hiccup
> protection (**DEBOUNCE**), **your own keys and buttons** ([Rebinding](#rebinding-keys-and-buttons))
> and an **INPUT TEST** ([below](#the-controls-page-autofire-socd-and-the-hiccup-protection)) —,
> **DISPLAY** — the enemy bullets' colours (standard or one of three colour-blind sets), how the
> picture fills the screen, the screen shake, gentler flashes, a hitbox marker on your ship and the
> boss HP bar — and **GAME** — the difficulty, lives, what losing a ship costs, Auto Power-Up, the
> capsule magnet and **ONE BUTTON** play ([One-button play](#one-button-play))
> ([preview-build.md](preview-build.md#the-options-screen)); the game remembers all of them.
> **Special** (Channel up on the remote, V on a keyboard, Y on a gamepad) spreads FORMATION and
> ROTATE Options out and back in — as does **holding** PowerUp
> ([preview-build.md](preview-build.md#choosing-your-weapons)); **Speed** (Channel down on the
> remote, Left Shift on a keyboard, LB / RB on a gamepad) switches the **MANTA** between its three
> speeds ([preview-build.md](preview-build.md#the-manta-colour-items-weapons-and-the-arm)) and does
> nothing for the KESTREL. The remote's settings may still change once
> the input probe results from the M7 monitors are in; every button can already be moved to
> another key with **OPTIONS → CONTROLS → REBIND KEYS / REBIND PAD**
> ([Rebinding](#rebinding-keys-and-buttons)).

## In the game and in menus

Every device has **two sets of controls**: one while you play, one in menus and on the pause
screen. That is how one button can do two sensible things — OK takes a power-up in the game
and selects a menu entry in menus; Back pauses the game and goes back in menus.

| Action | What it does |
|---|---|
| Move | Game: fly the ship (8 directions where the device allows it; diagonals are no faster than straight moves, and the ship stops as soon as you let go). Menus: move the highlight (▲ ▼; ◀ ▶ between YES and NO, in the Options screen ◀ ▶ turn a volume down / up and on its CONTROLS, DISPLAY and GAME pages change the highlighted line's choice or set a switch off (◀) or on (▶), on the rebind box's MODE they switch between the GAME and MENU keys, and in the WEAPON SELECT screen ◀ ▶ change the highlighted line's choice; in the SHIP SELECT box ▲ ▼ pick the ship; on the ZONE MAP ▲ ▼ choose the next zone — ◀ ▶ do nothing there; in the PRACTICE box ◀ ▶ change ZONE, CHECKPOINT and LOADOUT, in the SOUND TEST box the tune or the sound; in the name entry ▲ ▼ change the letter and ◀ ▶ move between the letters) — holding a direction repeats the move after about a third of a second, then about ten times a second |
| Shot | Main gun. It fires **on its own** by default (and always with the TV remote), so you never need to press it. In a browser **OPTIONS → CONTROLS → AUTOFIRE** can change that: **TOGGLE** — each press switches firing off and on; **HOLD** — hold it to fire ([The CONTROLS page](#the-controls-page-autofire-socd-and-the-hiccup-protection)) |
| Sub | Missiles / sub-weapon, once you have them — automatic in the same way (with AUTOFIRE on HOLD: hold it to fire them; on TOGGLE holding it fires them while the gun is switched off) |
| PowerUp | KESTREL: take the highlighted power-up of the power meter — one per press (holding the button never takes a second); a press on an empty or maxed-out slot does nothing. **Held** for a quarter of a second or more, it also spreads FORMATION / ROTATE Options for as long as you hold it. MANTA: nothing (its colour items work when you touch them) |
| Special | Spread FORMATION / ROTATE Options out, and back in on the next press (a press, never a hold); TRAIL and SNAKE Options ignore it |
| Speed | MANTA: switch to its next speed — middle → fast → slow → middle — one step per press, with a ding. KESTREL: nothing (it speeds up with the power meter's SPEED UP) |
| Pause | Pause / resume (the pause menu: RESUME, OPTIONS, RETRY STAGE, QUIT TO TITLE) |
| Confirm | Menus: select the highlighted entry; in the rebind box OK on an action asks for its new key; on the title first leaves `PRESS OK`; in the WEAPON SELECT screen OK also steps the highlighted choice, opens ORDER and, on START, begins the game; on the zone result OK skips ahead, on the ZONE MAP it launches the chosen zone, in the ending (after a second) it shows every line of the story, then goes on to the card, and on the card to the credits; in the credits (after a second) it ends them; in the name entry it moves to the next letter and, on `END`, finishes; on the high-score table after a game (after half a second) it returns to the title; in the SOUND TEST box it plays the chosen tune or sound; in the attract loop (demo, high scores, story) any button — OK too — returns to the title. A press made while a menu is just appearing is remembered for a moment, not lost |
| Back | Menus: previous screen (in the pause menu: resume; in a YES / NO question: NO; in the Options screen and its pages: keep the settings and close it, like BACK; in the rebind box: close it (DONE) — while it waits for a key, Back cancels instead; the input test ignores Back — hold Pause to leave it; in the DIFFICULTY box: back to the title menu; in the SHIP SELECT box: back to the DIFFICULTY box; in the WEAPON SELECT screen: back to the SHIP SELECT box; in its AUTO ORDER box: keep the order and close it, like DONE; on the CONTINUE? countdown: give up — GAME OVER; on the ZONE MAP: ask **QUIT TO TITLE?**; nothing in the ending's story and card; in the credits (after a second): end them; in the name entry: the previous letter (it never leaves the entry); on the high-score table after a game: the title; in the PRACTICE and SOUND TEST boxes: back to the title menu; in the attract loop: the title — never the exit question); on the TV's title screen it asks **EXIT SHMUP CUP?** — only YES quits |

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
| Channel up | Special (spread / retract FORMATION and ROTATE Options) | — |
| Channel down | Speed (the MANTA's speed toggle) | — |

- On the TV the ship fires its main gun **and** its missiles automatically, so no button is
  ever needed for shooting (in the current build the gun starts firing as soon as the ship has
  flown in). **OK** is the only other button the game needs: a rare press to take a power-up,
  which never stops a direction you are holding. Channel up / down are optional extras —
  nothing ever requires them: Channel up spreads FORMATION / ROTATE Options, which holding OK
  does too, and Channel down switches the MANTA's speed (it starts at a good middle speed). With
  the MANTA even OK is not needed in the game.
- Some TV remotes briefly report a held button as released and pressed again. The game hides
  such hiccups (up to about 1/30 of a second), so a held direction never stutters; in return,
  letting go of a button registers two frames later — too short to notice.
- Whether pressing two directions at once moves the ship diagonally depends on the remote;
  many can only report one arrow at a time. The game is designed to be fully playable with
  four directions.
- **Home** always leaves the app; the game pauses in the background and continues when you
  return. Long-pressing Back and the volume keys belong to the TV and are never used by the
  game — they set the monitor's volume as usual; the game's own volumes (MASTER, MUSIC, SFX)
  are in **OPTIONS**. The colour buttons (red/green/yellow/blue on the on-screen number pad) are reserved
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
click the picture once (the TV and the desktop app play sound from the start).

| Button (Xbox / PlayStation) | In the game | In menus |
|---|---|---|
| D-pad or left stick | Move | Move the highlight |
| A / Cross | Shot | Confirm |
| B / Circle | Sub | Back |
| X / Square | PowerUp | — |
| Y / Triangle | Special | — |
| LB / L1, RB / R1 | Speed (the MANTA's speed toggle) | — |
| Start / Options | Pause | Pause |
| Back / Share (Select) | Pause | Back |

The left stick has a dead zone of 20 % and snaps to 8 directions. In the menus and in 1 PLAYER
games **every** gamepad controls player 1, whichever one it is (together with the remote or
keyboard). In a **2 PLAYERS** game a gamepad becomes **player 2's** when you press START or A on it
([Two players](#two-players)).

## Keyboard

| Key | In the game | In menus |
|---|---|---|
| Arrow keys or W A S D | Move | Move the highlight |
| Z or Space | Shot | Confirm |
| X | Sub | Back |
| C | PowerUp | — |
| Enter (or numpad Enter) | PowerUp | Confirm |
| V | Special | — |
| Left Shift | Speed (the MANTA's speed toggle) | — |
| P | Pause | Pause |
| Esc | Pause | Back |
| Backspace | Pause | Back |

Keys are matched by their position, so W A S D work on any keyboard layout (on AZERTY
they are the keys labelled Z Q S D). Holding a key down does not repeat; a very short tap
is never lost. Pressing Left and Right (or Up and Down) together cancels out on that axis.
The game keeps the keys it uses from scrolling or navigating the page; browser shortcuts
with Ctrl / Cmd (reload, developer tools) keep working. Switching to another window
releases every key, so nothing stays stuck.

### The desktop app's window keys

The desktop app uses the same keyboard and gamepad controls, plus a few keys for its window that
never reach the game ([desktop-app.md](desktop-app.md#the-window)):

| Key | What it does |
|---|---|
| F11 or Alt+Enter | Fullscreen on / off (remembered) |
| Ctrl + = (or Ctrl + +) / Ctrl + - | Window one whole size bigger / smaller (remembered) |
| Ctrl + 0 | Window back to ×3 (1152×648) |

On a Mac, Cmd instead of Ctrl. In the desktop app the title has **EXIT** and Esc on the title asks
**EXIT SHMUP CUP?**, as Back does on the TV.

## Two players

In a **2 PLAYERS** game (the title's second entry) two people play at once; player 2 joins
whenever they like ([preview-build.md](preview-build.md#two-players)). Which controller drives
which ship:

| Controller | 2 PLAYERS game | Menus and 1 PLAYER games |
|---|---|---|
| Samsung remote | Player 1 | Player 1 |
| Keyboard (KEYBOARD, KEYBOARD AS REMOTE) | Player 1 | Player 1 |
| Gamepad | Player 1 **until you press START or A** on it — that gamepad is then **player 2's** until it is unplugged; any other gamepad stays player 1's | Player 1 (every gamepad) |
| SPLIT KEYBOARD | Left half player 1, right half player 2 | Both halves player 1 |

**Joining and coming back.** Player 2 joins with **START** (a gamepad's START or A; Enter on the
SPLIT KEYBOARD) while `PRESS START` blinks on the right of the top bar. A player who lost their
last ship but still has continues comes back with their START while the other plays on: START on
player 2's gamepad, and for player 1 **Back** or **Play/Pause** on the remote (P, Esc or Backspace
on the keyboard; Esc or Q on the SPLIT KEYBOARD). While a player can join or come back, their
START does that instead of pausing; otherwise any player's pause button pauses. On the
**CONTINUE?** countdown each player presses OK on their own controller.

On the **TV**, player 2 needs a gamepad connected to the monitor (USB or Bluetooth): the remote is
always player 1's, and the SPLIT KEYBOARD is not offered there.

### The split keyboard

**SPLIT KEYBOARD** (in a browser: OPTIONS → CONTROLS → PROFILE, or add `?profile=keyboard-split` to the
address) puts two players on one keyboard:

| | Player 1 (left half) | Player 2 (right half) |
|---|---|---|
| Move | W A S D | Arrow keys |
| PowerUp (game) / OK (menus) | F | K |
| Special + Speed (game) / Back (menus) | G | L |
| Pause | Esc or Q (Esc is Back in menus) | Enter or numpad Enter — player 2's **START**; OK in menus |

There are no Shot or Sub keys: both ships fire on their own. In the menus and in 1 PLAYER games
both halves move the same highlight / ship (player 1's); the right half becomes player 2's only in
a 2 PLAYERS game. A gamepad cannot become player 2 while this profile is chosen.

## Developer keys (debug builds only)

Debug builds — `pnpm dev` in a browser, the TV's `build:dev` — add eight developer tools for
testing: a measuring panel, invincibility, hit-area outlines, a freeze with single steps, slow
motion, and jumps to the next checkpoint and the boss. The normal build has none of them.

| Tool | Browser (`pnpm dev`) | TV (debug build) |
|---|---|---|
| Open the tools | — (always on) | **Play/Pause, then Channel up three times**, within 3 s |
| Panel on / off | F1 | 1 |
| Invincible on / off | F2 | 2 |
| Outlines (off → hit areas → + grid) | F3 | 3 |
| Freeze / run | F4 | 4 |
| One step while frozen (hold to crawl) | F5 | 5 |
| Slow motion (½, ¼, normal) | F6 | 6 |
| Next checkpoint | F7 | 7 |
| Skip to the boss | F8 | 8 |

On the TV the number keys do nothing until the tools are open (a keyboard's F1–F8 work then
too). In a browser F5 does not reload the page while the game has focus. Details and how to read
the panel: [debug-tools.md](debug-tools.md).

## Control profiles

The button layouts above are **profiles**, stored as game data rather than built into the
program — so the remote's behaviour can be retuned after measuring it without a new version
of the code.

| Profile | Name in the game | Used |
|---|---|---|
| `tizen-remote-safe` | SAFE 4-WAY | On the TV (default) |
| `tizen-remote-diagonal` | FAST 8-WAY | On the TV, when chosen: the same buttons, without the hiccup protection — for remotes that turn out not to need it (the ship then also stops the instant you let go) |
| `keyboard-default` | KEYBOARD | In a browser and on the desktop (default) |
| `keyboard-remote-emulation` | KEYBOARD AS REMOTE | In a browser, when chosen: for desktop testers who want to feel the remote's limits (below) |
| `keyboard-split` | SPLIT KEYBOARD | In a browser, when chosen: two players on one keyboard ([below](#the-split-keyboard)) |
| `gamepad-standard` | GAMEPAD | Every gamepad, on every device (always; not a choice) |

**Choosing a profile.** Open **OPTIONS** (on the title, or in the pause menu during a game), OK on
**CONTROLS**, and on its first line, **PROFILE**, press ◀ / ▶ (or OK) to step through the profiles
this device can use: on the TV **SAFE 4-WAY (DEFAULT)** and **FAST 8-WAY**, in a browser **KEYBOARD
(DEFAULT)**, **KEYBOARD AS REMOTE** and **SPLIT KEYBOARD**. `(DEFAULT)` marks the one the game starts with until you
choose another. The new profile works **at once** — you can try it right away in the menu — and
the game remembers it when you leave the CONTROLS page with **BACK** (or the Back button), also
after the app is closed and opened again. Only profiles that can still move through the menus
with this device's buttons are offered, so a choice can never leave you stuck. A gamepad always
uses GAMEPAD, whatever PROFILE says (its buttons can be changed with REBIND PAD). Each profile
keeps its own rebound keys ([Rebinding](#rebinding-keys-and-buttons)).

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

Every other key (Z, X, W A S D, …) does nothing in this profile. The same profile can be chosen
in the browser under **OPTIONS → CONTROLS → PROFILE** (KEYBOARD AS REMOTE) without changing the
address. Testers can also add `&debounce=0` … `&debounce=10` to change how long the hiccup protection
waits (in frames of 1/60 s; the TV uses 2) — it wins over the CONTROLS page's DEBOUNCE, which does
the same without touching the address. These address options exist only in the browser; a
`?profile=` in the address wins over the profile chosen in the Options screen when the page
loads (it is also listed under CONTROLS, and a pick there still switches). The TV starts with the
profile chosen under CONTROLS — SAFE 4-WAY until you pick another.

## The CONTROLS page: autofire, SOCD and the hiccup protection

**OPTIONS → CONTROLS** (on the title, or in the pause menu during a game) collects everything about
the controls:

```text
             CONTROLS
   → PROFILE  KEYBOARD (DEFAULT)
     AUTOFIRE ALWAYS
     RATE     15/S
     SOCD     PROFILE
     DEBOUNCE AUTO
     REBIND KEYS
     REBIND PAD
     INPUT TEST
     BACK
   AUTOFIRE / RATE: FROM THE NEXT GAME
```

| Line | Choices | What it does |
|---|---|---|
| **PROFILE** | the device's control profiles | Which button layout the keyboard or remote uses ([Control profiles](#control-profiles)) — switches at once |
| **AUTOFIRE** | **ALWAYS** (the start setting), **TOGGLE**, **HOLD** | How the gun fires. ALWAYS: on its own, no button needed. TOGGLE: each press of **Shot** switches firing off and on (it starts on; holding **Sub** still fires the missiles). HOLD: the gun fires while you hold **Shot**, the missiles while you hold **Sub**. **On the TV this line is greyed out** — the remote has no fire button, so the gun always fires on its own |
| **RATE** | **7.5/S**, **10/S**, **12/S**, **15/S** (the start setting), **20/S**, **30/S** | How many main shots a second the gun tries to fire (a weapon that allows only two shots on screen still keeps to that) — on the TV too |
| **SOCD** | **PROFILE** (the start setting), **NEUTRAL**, **LAST WINS** | What happens when opposite directions are held together (Left + Right, Up + Down): NEUTRAL — they cancel out; LAST WINS — the one pressed last counts. PROFILE keeps the profile's own rule (NEUTRAL, except KEYBOARD AS REMOTE) |
| **DEBOUNCE** | **AUTO** (the start setting), **0 TICKS** … **10 TICKS** | The **hiccup protection**: how many frames (1/60 s) the game waits before it believes a released button (some remotes briefly report a held button as released). AUTO keeps the profile's own: 2 on SAFE 4-WAY and KEYBOARD AS REMOTE, 0 elsewhere. Gamepads never need it |
| **REBIND KEYS** | — | Choose your own keys (keyboard) or buttons (remote) — [below](#rebinding-keys-and-buttons) |
| **REBIND PAD** | — | Choose your own gamepad buttons — [below](#rebinding-keys-and-buttons) |
| **INPUT TEST** | — | See what every button does — [below](#the-input-test) |
| **BACK** | — | Keeps the settings and returns to OPTIONS |

- **PROFILE, SOCD and DEBOUNCE work at once** (try them right away in the menu); **AUTOFIRE and RATE
  apply from the next game** — or when you choose RETRY STAGE in the pause menu. A game already
  running (and its next zones) keeps what it started with.
- Everything is **remembered**, also after the app is closed.
- A profile without a Shot key (KEYBOARD AS REMOTE, SPLIT KEYBOARD) cannot fire with AUTOFIRE on
  TOGGLE or HOLD — keep ALWAYS there, or give SHOT a key with REBIND KEYS.

## Rebinding keys and buttons

**OPTIONS → CONTROLS → REBIND KEYS** changes the keys of the keyboard or the buttons of the TV
remote; **REBIND PAD** those of the gamepad. The box shows the device (`KEYBOARD CONTROLS`, `REMOTE
CONTROLS` or `GAMEPAD CONTROLS`) and one line per action with the keys it has now:

```text
          KEYBOARD CONTROLS
   → MODE      GAME
     UP        ↑  W
     DOWN      ↓  S
     LEFT      ←  A
     RIGHT     →  D
     SHOT      Z  SPACE
     SUB       X
     POWER-UP  C  ENTER  NUM ENTER
     SPECIAL   V
     SPEED     L-SHIFT
     PAUSE     P  ESC  BKSP
     RESET
     DONE
        OK: REBIND  BACK: DONE
```

- **MODE** switches between the **GAME** buttons (while you play) and the **MENU** buttons (in the
  menus and on the pause screen) — every device has both sets
  ([In the game and in menus](#in-the-game-and-in-menus)). ◀ / ▶ (or OK) on MODE switch.
- **OK on an action** asks `PRESS A KEY FOR SHOT` (`PRESS A BUTTON FOR SHOT` for the gamepad) with a
  bar that runs down in 5 seconds. **Press the new key**: from now on it does that action, and the
  line shows it. **Esc** (keyboard) or **Back** (remote) — or simply waiting — cancels (`CANCELLED`).
- A line under the actions says what happened:

| Message | Meaning |
|---|---|
| `SHOT REBOUND` | The key was free — the action now has it (instead of its old keys) |
| `KEY TAKEN FROM SUB` | Another action had that key; it keeps its other keys, and the key is now this action's |
| `SWAPPED WITH SUB` | The other action had only that key, so the two actions swapped keys — nothing is left without a key |
| `NOT POSSIBLE: OK NEEDS A KEY` | The other action needs a key (the four directions and Pause in the game; the directions, OK and Back in menus) and there was nothing to give it — nothing changed |
| `THAT KEY CANNOT BE USED` | Esc and the remote's Back never move (they are the way out of every screen), a key cannot go on a gamepad (or a button on the keyboard), and with the SPLIT KEYBOARD the right half's keys belong to player 2 — nothing changed |
| `NO CHANGE` | The action already had exactly that key |

- **RESET** puts back the standard keys of the set shown (GAME or MENU) for this device
  (`RESET TO DEFAULTS`).
- **DONE** or **Back** closes the box. Every change works **at once** and is **remembered** from
  then on, also after the app is closed.
- Each **profile** keeps its own keys: rebinding KEYBOARD does not change KEYBOARD AS REMOTE, and
  PROFILE shows the chosen profile's keys. REBIND KEYS changes the profile in use.
- **On the TV** the remote's buttons the game receives are the arrows, OK, Back (never rebindable),
  Play/Pause and Channel up / down — for example POWER-UP can go on Channel down (it then swaps with
  SPEED). The colour and number buttons are not available to the game.
- **The gamepad**: every gamepad uses the same buttons (GAMEPAD); the D-pad counts as four buttons
  (`D↑` …) that can be rebound too, while the left stick always moves.
- The rebinding can never lock you out: if saved keys would leave the menus without a way to move,
  choose or go back, the game uses the standard keys for that set instead.

## The input test

**OPTIONS → CONTROLS → INPUT TEST** shows what the game receives: the name of the device you last
used (KEYBOARD, REMOTE or GAMEPAD), a cross that lights the directions you hold (two light together
on a diagonal — on remotes that can only report one arrow at a time, never), and a box per game
action (SHOT, SUB, POWER-UP, SPECIAL, SPEED, PAUSE) that lights while held — briefly after a quick
tap too. It uses the **game** buttons of the active profile, with your rebinding — so every button
does what it does in a game. To leave, **hold Pause** (Back or Play/Pause on the remote, Esc / P /
Backspace on a keyboard, Start on a gamepad) for a second: the bar at the bottom fills and the test
closes.

## One-button play

**OPTIONS → GAME** (see [preview-build.md](preview-build.md#the-game-page)) has a **ONE BUTTON**
switch: the gun fires on its own (AUTOFIRE ALWAYS), power-ups are taken automatically (AUTO POWER)
and losing a ship costs only the Force Field (the CASUAL penalty) — a game played with the four
directions alone; no button is ever needed except to pause. It applies from the next game.

## Troubleshooting

| Problem | What to do |
|---|---|
| Play/Pause or Channel up / down do nothing on the TV | Not every remote has these buttons or sends them to apps. They are optional — use Back to pause. Please report the remote model (the input probe records which keys arrive) |
| Diagonals never work with the keyboard | The address probably contains `?profile=keyboard-remote-emulation`, or KEYBOARD AS REMOTE is chosen under OPTIONS → CONTROLS — both allow one direction at a time. Remove it from the address and reload, or choose KEYBOARD (DEFAULT) |
| The control profile I chose was forgotten | The CONTROLS page keeps a choice when you leave it with **BACK** or the Back button. In a browser, a `?profile=` in the address wins over it when the page loads. If it is still forgotten after a relaunch, please report it (and whether the build was reinstalled in between) |
| After choosing FAST 8-WAY the ship stutters or stops for a moment while I hold a direction (TV) | This remote needs the hiccup protection — choose SAFE 4-WAY again (OPTIONS → CONTROLS) and please report the remote model: it is exactly what we want to know |
| `?profile=…` seems to be ignored | The name is misspelled or is not a keyboard/remote profile (a gamepad profile cannot drive the keyboard). The game then uses the normal keyboard profile and writes a warning in the browser's developer console |
| A button does something in the game but nothing in a menu (or the other way round) | Expected — see the two tables above; for example C (PowerUp) has no menu function |
| The game shows a start-up error screen mentioning `input-profiles.json` | The control profiles in this build are broken. Report the lines on the screen — see [preview-build.md](preview-build.md) |
| Back closes the game on the TV instead of pausing | Not expected any more — Back pauses in the game and asks before quitting on the title. It closes the app at once only on the loading and error screens; otherwise please report it (and check the installed build is the latest) |
| Nothing reacts for a moment after the app starts | The title screen needs OK first (`PRESS OK`), then 1 PLAYER (or 2 PLAYERS), then OK on a difficulty, then OK on a ship in the SHIP SELECT box, then (for the KESTREL) OK on START in the WEAPON SELECT screen; after that the ship flies in (about ⅔ of a second) and ignores the controls until it arrives — see [preview-build.md](preview-build.md#flying-the-ship) |
| Holding Shot (Z / Space, A / Cross) or Sub (X, B / Circle) changes nothing | Expected with AUTOFIRE on ALWAYS (the start setting, and always on the TV): the gun already fires on its own, and the missiles fire on their own too once a power-up gave them to you (in a browser, `?loadout=full` gives them to you right away). Set AUTOFIRE to HOLD or TOGGLE (OPTIONS → CONTROLS, in a browser) to fire with the button |
| My ship stopped firing | AUTOFIRE is on **TOGGLE** and Shot was pressed (press it again), or on **HOLD** (hold Shot). With KEYBOARD AS REMOTE or the SPLIT KEYBOARD there is no Shot key: set AUTOFIRE back to ALWAYS, or give SHOT a key with REBIND KEYS |
| AUTOFIRE is greyed out | Expected on the TV: the remote has no fire button, so the gun always fires on its own. RATE still works |
| I changed AUTOFIRE, RATE or a GAME option and my game did not change | Expected: they apply from the next game, or when you choose RETRY STAGE in the pause menu |
| A key I rebound does nothing | Check the MODE: GAME keys work while you play, MENU keys in the menus. The **INPUT TEST** shows what the game receives. If the key still does nothing, please report the key and the profile |
| `THAT KEY CANNOT BE USED` when rebinding | Esc and the remote's Back cannot be moved; with the SPLIT KEYBOARD the right half's keys (arrows, K, L, Enter) belong to player 2; a keyboard key cannot go on the gamepad |
| `NOT POSSIBLE: … NEEDS A KEY` when rebinding | That key was the only one of an action the game needs (a direction, Pause, OK or Back). Give that action a second key first, or rebind it instead |
| I cannot leave the INPUT TEST | Hold **Pause** (Back or Play/Pause on the remote, Esc on a keyboard, Start on a gamepad) for a whole second — a quick press only lights the PAUSE box |
| My rebound keys are gone after choosing another profile | Each profile has its own keys — switch PROFILE back, or rebind the new one. RESET puts back the standard keys of the GAME or MENU set shown |
| PowerUp (OK, Enter, C, X) does nothing | Always expected with the **MANTA** (no power meter — its colour items work when you fly into them). With the KESTREL expected until you have collected a power capsule (no box of the power meter is highlighted) — the red saucers and completed formations of AZURE VERGE leave them. Also expected when you already have the most of the highlighted power-up. Such a press plays a short, low "no" buzz. See [preview-build.md](preview-build.md#power-ups) |
| No sound in the browser | Press a key or click into the picture once — the sound starts then (a gamepad button does not count). See [preview-build.md](preview-build.md#sound-and-music) |
| Pressing OK while holding an arrow stops the ship on the TV | Not expected — the game keeps the arrow held. Please report it with the remote model: it means the remote itself drops the arrow when OK is pressed |
| OK or Back does nothing on the CONTINUE? countdown | Both are ignored for the first half second, so a button still pressed from the game never decides; press again. If they never react, please report it |
| Pause does nothing | On the title, the DIFFICULTY box, the SHIP SELECT box, the WEAPON SELECT screen, the PRACTICE and SOUND TEST boxes, the name entry, the CONTINUE? countdown and the end screens Pause has no job — it pauses only a running game (in the attract loop it returns to the title, like any button). In the game it should open the PAUSE menu; if not, please report the device and the button |
| Special (Channel up, V, Y) does nothing | Expected unless your Options fly FORMATION or ROTATE (chosen on the WEAPON SELECT screen's OPTION line) — then each press spreads them out or back in. Holding OK does the same while held |
| Speed (Channel down, Left Shift, LB / RB) does nothing | Expected with the KESTREL. With the MANTA each press switches its speed (the SPD squares in the bottom bar follow) — if not, please report the device and the remote model |
| Speed changed twice for one press | Not expected — the game ignores held buttons and the remote's hiccups for it. Please report the remote model |
| My FORMATION / ROTATE Options spread when I take a power-up | OK was held a quarter of a second or more — a longer hold spreads them. Press OK briefly |
| F1–F8 (or 1–8 on the TV) do nothing | They are developer keys of debug builds only; on the TV the tools must be opened first with Play/Pause, Ch ▲, Ch ▲, Ch ▲ — see [Developer keys](#developer-keys-debug-builds-only) |
| The game froze without a PAUSE box, or runs in slow motion (debug build) | A developer tool is on — F4 / 4 unfreezes, F6 / 6 cycles slow motion back to normal ([debug-tools.md](debug-tools.md#troubleshooting)) |
| Player 2 cannot join | Only a **2 PLAYERS** game has a player 2, and only while `PRESS START` blinks in its place. Press START (or A) on a gamepad — press any of its buttons once first so the device notices the pad — or Enter with the SPLIT KEYBOARD. On the TV a gamepad is needed: the remote is always player 1's |
| My gamepad flies player 1 in a 2 PLAYERS game | Expected until you press START or A on it; then it is player 2's. Only one gamepad can be player 2 (and none while the SPLIT KEYBOARD is chosen) |
| Player 2's START (or Enter) opened the pause menu | Player 2 is already in the game — then START pauses, as for player 1. It only joins while `PRESS START` shows |
| OK on the remote does not bring player 1 back in a 2 PLAYERS game | In the game OK is PowerUp; player 1's START is **Back** or **Play/Pause** on the remote (P, Esc or Backspace on a keyboard) |
| With the SPLIT KEYBOARD both halves move the menu highlight | Expected: in the menus (and in 1 PLAYER games) both halves are player 1's; the right half is player 2's only in a 2 PLAYERS game |
| A menu moves two steps for one press, or skips a press | Not expected — please report the device (and the remote model) |
| BULLETS, SCALE, SHAKE, FLASHES, HITBOX or BOSS HP are missing from OPTIONS | Expected since the Options build: they are on the **DISPLAY** page (OK on DISPLAY); the control profile is on the **CONTROLS** page |
| ▼ ▼ from the title's first entry no longer reaches OPTIONS | Expected since the front end build: the menu is 1 PLAYER, 2 PLAYERS, PRACTICE, OPTIONS, SOUND TEST (and EXIT on the TV and in the desktop app) — OPTIONS is three ▼ down |
| The title plays a zone by itself | The attract loop's demo (after 12 seconds untouched on `PRESS OK`) — any button returns to the title |
| I cannot get past the name entry | OK moves letter by letter; on `END` OK finishes. ▶ jumps towards `END` too. After 30 seconds the entry finishes by itself |
| OK on a tune in the SOUND TEST box changes the tune instead of playing it | Not expected — OK plays, ◀ ▶ change. Please report the device |
| ▼ in the WEAPON SELECT screen jumps over MISSILE, DOUBLE and LASER | Expected: those lines show the chosen type's weapons and can only be changed with TYPE set to **EDIT** — see [preview-build.md](preview-build.md#choosing-your-weapons) |

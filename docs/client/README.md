# Player & tester documentation

| Page | Contents |
|---|---|
| [`preview-build.md`](preview-build.md) | The current game build: the loading bar, the **title screen** and its menu, the **Options screen** (MASTER / MUSIC / SFX volume, the control profile) and what the game remembers between launches (settings, high scores), the in-game **HUD** with the power meter, the **pause menu**, the **GAME OVER** and **STAGE CLEAR** screens and quitting with the TV remote's Back (the **EXIT SHMUP CUP?** question); **AZURE VERGE**, the first real zone that START plays on every device — its five parts, its enemies (hits, points, what they fire), its capsules, its boss **HALCYON BULWARK** (its plates, core and laser rows, how it fights, tips) and the browser's shortcut `?skip=boss`; flying the KESTREL with the remote, keyboard or gamepad, its gun firing on its own, plus the scrolling **Test Range** stage with its enemies and their bullets, the **power-ups** (capsules, taking them with OK, the Force Field and Mega Crash), **lives, losing the ship and the score** (what destroys the ship, the freeze, the blinking comeback, what a loss costs, GAME OVER, the points table and `HI`), the **Boss Range** with the **WARNING** sign and the first **boss** (its parts, which ones can be hurt, its attacks, what happens when it is destroyed), the **explosions, sparks, screen shake, flashes and score numbers** (what each one should look like, the flash limit), the **sound effects and the music** (what you should hear and when, the first key press in a browser, the loop point to listen for), the **fully powered** ship (laser, missiles, four Options, Force Field), the sprite showcase, the calibration screen and the **effects gallery** in a browser — how to open it on the TV, in a browser and on the desktop, how the ship and its weapons should behave, what a correct picture looks like, which enemies shoot what and how many hits they take, the start-up error screen, what to report, troubleshooting |
| [`controls.md`](controls.md) | Default controls for the Samsung Smart Remote (primary), gamepads and keyboard, in the game and in menus (moving through menus, pausing, Back and quitting on the TV); the control profiles and choosing one under OPTIONS → CONTROLS, feeling the remote's limits on a desktop keyboard, controls troubleshooting |
| [`install-on-tv.md`](install-on-tv.md) | One-time Developer Mode + certificate setup, installing / starting / removing development builds (input probe and game preview) on the Samsung Smart Monitor M7 (Windows desktop), what happens to saved settings and high scores on update and removal, install troubleshooting |
| [`input-probe.md`](input-probe.md) | Tester guide for the **Input Probe** diagnostic app: screen tour, remote controls, the 9-step on-device test protocol, how to read the verdicts, measuring latency with a 240 fps camera, recording results, troubleshooting |

Planned pages, as the game takes shape:

- **Options** — a page of its own once there are more options: display (scale modes, screen
  shake, flashing), rebinding buttons, difficulty. Today's Options screen (volumes and the
  control profile) is described in [preview-build.md](preview-build.md#the-options-screen).
- **Troubleshooting** — black screen, input lag (the M7 has no Game Mode for apps),
  audio issues.

The game now starts like a real game: after the loading bar comes the **title screen** — the
SHMUP CUP logo, a blinking `PRESS OK` and its own music — and OK opens a small menu: **START**,
**OPTIONS** and, on the TV, **EXIT**. **OPTIONS** sets the game's own volumes (MASTER, MUSIC, SFX)
and chooses the control profile (on the TV **SAFE 4-WAY** or **FAST 8-WAY**); the game remembers
them, and it remembers your **high scores** too — the title's `HI` is the best score kept on this
device, and a new best gets a **NEW HI-SCORE** on the GAME OVER screen
([preview-build.md](preview-build.md#the-options-screen)). START begins a game under the new **HUD**:
your score, the best score (`HI`) and the second player's slot along the top; your spare
ships, the **power meter** (the seven boxes that show which power-up OK takes — the highlighted
one blinking, the ones you cannot take greyed out) and the Force Field's strength along the
bottom. **Back** (or Play/Pause) now **pauses**: RESUME, OPTIONS, RETRY STAGE or QUIT TO TITLE. Losing the
last ship shows **GAME OVER** and returns to the title; finishing a stage shows **STAGE CLEAR**
and `TO BE CONTINUED`. On the TV, Back on the title asks **EXIT SHMUP CUP?** — only YES closes the
app ([preview-build.md](preview-build.md#the-title-screen-and-the-menus)).

**START plays the first real zone, AZURE VERGE — on the TV too**: about three minutes of
scrolling over rolling ground, through a long cave with turrets on its floor and ceiling and a
fast stretch, with rows of pods, red saucers that leave power capsules, fan fliers, dashing
arrowheads, walkers, hatches and ring spinners, and then the **WARNING** and the zone's boss,
the battleship **HALCYON BULWARK** — shoot its four shield plates, then its core, and dodge the
laser rows of its two emitters by stepping up or down. Every bullet and laser can be dodged with
single arrow presses. In a browser `?skip=boss` starts a game right before the boss
([preview-build.md](preview-build.md#the-first-zone-azure-verge)). The KESTREL glides in from the
left and then follows the remote's directional pad, the arrow keys or a gamepad, its gun firing on
its own. In a browser a **test stage** can be played too (`?stage=test-range`, then START): the view
scrolls on its own over rocky ground and through caves, speeding up and slowing down, with star
layers moving behind — and **enemies** come at you: weaving pods, looping spinners, saucers,
ground turrets, walkers, hatches releasing small fighters. The turrets, walkers and lone spinners
**shoot back** with aimed bullets, three-way fans and rings, all dodgeable with the four arrow
directions. **Your ship shoots back**: its gun fires on its own on every device (no button
needed — that is what makes the TV remote enough), and the shots destroy the enemies, which flash
white when hit and burst into explosions when destroyed. The ship **powers up**: red saucers and
whole formations you wipe out leave blinking **power capsules**; each one moves the power meter's
highlight one box on, and **OK** on the remote (Enter or C on a keyboard) takes the highlighted
power-up — Speed Up, Missile, Double, Laser, Option, a Force Field that takes five hits, or the
screen-clearing Mega Crash ([preview-build.md](preview-build.md#power-ups)). In a browser,
`?loadout=full` starts fully powered — a piercing laser, missiles that slide along the ground,
four Options that follow the ship and copy its fire, and a Force Field
([preview-build.md](preview-build.md#your-weapons)). The ship can be **lost**: rock, enemies and
bullets destroy it (a Force Field takes enemies and bullets for it), it flies in again blinking —
safe for a moment — with one step of power less, and after the third ship comes **GAME OVER**;
every destroyed enemy, completed formation and collected capsule adds to the **score**, and `HI`
shows the best score so far (kept between launches) ([preview-build.md](preview-build.md#lives-losing-your-ship-and-the-score)).
The first **boss** is there too: in a browser, `?stage=test-boss` scrolls for a few seconds until
a **WARNING** sign stops the stage, then the TRIAL WARDEN — a test boss built from armour blocks,
shield plates, a core and two guns — glides in; shoot the plates off, then the core, dodge its
bullet fans and its lasers, and the STAGE CLEAR screen follows
([preview-build.md](preview-build.md#the-boss-range-and-the-warning-browser-only)). Hits *feel*
like hits: destroyed enemies burst into fireballs and debris, shots spark on impact, losing the
ship shakes the picture, a Mega Crash or a boss's final blast flashes the screen (never more than
three times a second), the WARNING darkens the playfield, and every kill shows its points rising
from the spot; `?scene=fx-gallery` shows every effect in turn
([preview-build.md](preview-build.md#explosions-sparks-shake-and-flashes)). And the game
**sounds**: every shot, hit, explosion, pickup and power-up makes a sound, coming from where it
happens on the screen; the menus click and chime; the WARNING wails a siren; and there is original
**music** — the title theme, the zone's stage theme that loops without a gap (on the TV too), a
boss theme, a stage-clear and a game-over tune. In a browser the sound starts with the first key
press or click ([preview-build.md](preview-build.md#sound-and-music)). If a build is broken it
shows a readable error screen instead of a black one. The button layouts for the TV remote,
keyboard and gamepad are in [controls.md](controls.md). Next come developer tools (a debug
overlay, recorded replays) and a final check of this first playable slice.

# Player & tester documentation

| Page | Contents |
|---|---|
| [`preview-build.md`](preview-build.md) | The current game build (version 0.1.0 — its debug build's developer tools are in [`debug-tools.md`](debug-tools.md)): the loading bar, the **title screen** and its menu, the **Options screen** (MASTER / MUSIC / SFX volume, the control profile, **BULLETS** — the enemy bullet colours with three colour-blind sets and shape-coded centres) and what the game remembers between launches (settings, high scores), the **DIFFICULTY** box under START (EASY / NORMAL / HARD / ARCADE: ships, continues, what a loss costs), the **SHIP SELECT** box after it (the KESTREL with the power meter or the **MANTA** with colour items), the **WEAPON SELECT** screen for the KESTREL (the weapon types A–D and what each weapon does, EDIT to mix them, the OPTION types — TRAIL, SNAKE, FORMATION, ROTATE, spread with Ch ▲ or a held OK —, the `?` shields — FORCE FIELD, SHIELD, FREE SHIELD, ROTATE, REDUCE — and the `!` choices — Mega Crash, NORMAL, SPEED DOWN, LIFE OPTION, FULL BARRIER —, AUTO and the AUTO ORDER box, the live preview), the rank that makes the game harder as the ship gets stronger (and the fan fliers' revenge bullets), **extra ships** at 20,000 / 90,000 / … points, the **CONTINUE?** countdown and the score's continue digit, the in-game **HUD** with the power meter, the **pause menu**, the **GAME OVER** and **STAGE CLEAR** screens and quitting with the TV remote's Back (the **EXIT SHMUP CUP?** question); **AZURE VERGE**, the first real zone that START plays on every device — its five parts, its enemies (hits, points, what they fire), its capsules, its boss **HALCYON BULWARK** (its plates, core and laser rows, how it fights, tips) and the browser's shortcut `?skip=boss`; flying the KESTREL with the remote, keyboard or gamepad, its gun firing on its own, plus the scrolling **Test Range** stage with its enemies and their bullets, the **power-ups** (capsules, taking them with OK, the Force Field, the shield pods and REDUCE, the blue capsule and Mega Crash — whose cancelled bullets, like a destroyed boss's, turn into gold diamonds worth 10 points each), **lives, losing the ship and the score** (what destroys the ship, the freeze, the blinking comeback, what a loss costs, GAME OVER, the points table and `HI`), the **Boss Range** with the **WARNING** sign and the first **boss** (its parts, which ones can be hurt, its attacks, what happens when it is destroyed), the **MANTA** (its colour items — red, green, blue, orange, yellow, the octagon —, its nine-level main gun in two styles and sub-weapon, the **Arm** shield that also stops the rock, the speed toggle on Ch ▼, its power pips in the bottom bar, what a loss costs it), the **Direct Range** with its pincer waves of cubes, the **Hunter Range** with the **Option Hunter** (its alarm, what it steals, freeing the Options with a Mega Crash or the **blue capsule**), the **explosions, sparks, screen shake, flashes and score numbers** (what each one should look like, the flash limit), the **sound effects and the music** (what you should hear and when, the first key press in a browser, the loop point to listen for), the **fully powered** ship (laser, missiles, four Options, Force Field), the sprite showcase, the calibration screen and the **effects gallery** in a browser — how to open it on the TV, in a browser and on the desktop, how the ship and its weapons should behave, what a correct picture looks like, which enemies shoot what and how many hits they take, the start-up error screen, what to report, troubleshooting |
| [`debug-tools.md`](debug-tools.md) | Version **0.1.0** and the **M1 release check**: which builds have the developer tools, installing the TV's debug build (`build:dev`), opening the tools with Play/Pause then Ch ▲ three times (F1–F8 in a browser), the eight tools (panel, invincibility, hit-area outlines, freeze and single steps, slow motion, next checkpoint, skip to the boss), reading the panel (FPS, frame times, pools, boot time, build id) and the frame graph, the outline colours, the release checklist for both monitors, troubleshooting |
| [`controls.md`](controls.md) | Default controls for the Samsung Smart Remote (primary), gamepads and keyboard, in the game (Ch ▲ / Special and a held OK spreading FORMATION and ROTATE Options, Ch ▼ / Speed switching the MANTA's speed, OK doing nothing for the MANTA) and in menus (moving through menus, the DIFFICULTY box, the SHIP SELECT box, the WEAPON SELECT screen and the CONTINUE? countdown, pausing, Back and quitting on the TV); the developer keys of debug builds; the control profiles and choosing one under OPTIONS → CONTROLS, feeling the remote's limits on a desktop keyboard, controls troubleshooting |
| [`install-on-tv.md`](install-on-tv.md) | One-time Developer Mode + certificate setup, installing / starting / removing development builds (input probe and game preview, and the game's debug build with the developer tools) on the Samsung Smart Monitor M7 (Windows desktop), what happens to saved settings and high scores on update and removal, install troubleshooting |
| [`input-probe.md`](input-probe.md) | Tester guide for the **Input Probe** diagnostic app: screen tour, remote controls, the 9-step on-device test protocol, how to read the verdicts, measuring latency with a 240 fps camera, recording results, troubleshooting |

Planned pages, as the game takes shape:

- **Options** — a page of its own once there are more options: display (scale modes, screen
  shake, flashing), rebinding buttons, the game options (a remembered difficulty, lives, death
  penalty, the chosen ship and weapons). Today's Options screen (volumes, the control profile and the
  bullet colours) is described in [preview-build.md](preview-build.md#the-options-screen), the
  weapon choice in [preview-build.md](preview-build.md#choosing-your-weapons).
- **Troubleshooting** — black screen, input lag (the M7 has no Game Mode for apps),
  audio issues.

The game now starts like a real game: after the loading bar comes the **title screen** — the
SHMUP CUP logo, a blinking `PRESS OK` and its own music — and OK opens a small menu: **START**,
**OPTIONS** and, on the TV, **EXIT**. **OPTIONS** sets the game's own volumes (MASTER, MUSIC, SFX),
chooses the control profile (on the TV **SAFE 4-WAY** or **FAST 8-WAY**) and the enemy bullets'
colours (**BULLETS**: STANDARD, or DEUTERANOPIA / PROTANOPIA / TRITANOPIA for colour-blind
players, with shape-coded bullet centres); the game remembers them, and it remembers your **high scores** too — the title's `HI` is the best score kept on this
device, and a new best gets a **NEW HI-SCORE** on the GAME OVER screen
([preview-build.md](preview-build.md#the-options-screen)). START opens a **DIFFICULTY** box —
EASY (five ships, five continues, slower bullets), NORMAL, HARD, ARCADE (two ships, no continues,
a loss sends you back to the last checkpoint) — and OK there opens the **SHIP SELECT** box: the
**KESTREL**, which powers up with the power meter, or the **MANTA**, which powers up by flying into
**colour items** — red and green make its main gun and sub-weapon stronger through nine levels,
blue gives the **Arm** shield (3, 4, then 5 hits — it even stops the rock), orange an extra ship,
yellow destroys every enemy on the screen, and the red octagon switches the main gun between discs
and waves; OK does nothing in its games and **Ch ▼** switches its speed
([preview-build.md](preview-build.md#choosing-your-ship)). OK on the MANTA starts at once; OK on
the KESTREL opens the **WEAPON SELECT** screen:
four weapon types (the classic TYPE A, and TYPE B, C and D with the Spread Bomb, Tail Gun, Ripple
Laser, 2-Way Missile, Vertical, Cyclone Laser, Photon Torpedo, Free Way and Twin Laser) or EDIT to
mix them, how the Options fly (TRAIL, SNAKE, FORMATION or ROTATE — Ch ▲ or a held OK spreads the
last two), what the `?` box gives (the FORCE FIELD, the SHIELD / FREE SHIELD / ROTATE pods that
stop what touches them, or REDUCE, which shrinks the ship's weak spot) and what the `!` box does
(it can also drop back to the basic gun, slow the ship, turn spare ships into Options or restore
your shield), and automatic power-ups with their order — while a live preview flies your choice behind the menu
([preview-build.md](preview-build.md#choosing-your-weapons)). OK on its START begins a game under
the new **HUD**:
your score, the best score (`HI`) and the second player's slot along the top; your spare
ships, the **power meter** (the seven boxes that show which power-up OK takes — the highlighted
one blinking, the ones you cannot take greyed out) and the Force Field's strength along the
bottom. **Back** (or Play/Pause) now **pauses**: RESUME, OPTIONS, RETRY STAGE or QUIT TO TITLE. Scores of
20,000, 90,000, 160,000 … points earn an **extra ship**, and the game gets harder as your ship gets
stronger. Losing the last ship with continues left shows a ten-second **CONTINUE?** countdown — OK
carries on from the last checkpoint with fresh ships, and the score's last digit counts the
continues — otherwise **GAME OVER**, which returns to the title
([preview-build.md](preview-build.md#difficulty-extra-ships-and-continues)); finishing a stage shows **STAGE CLEAR**
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
safe for a moment — with one step of power less (on NORMAL), and after the last ship comes
**CONTINUE?** or **GAME OVER**;
every destroyed enemy, completed formation and collected capsule adds to the **score**, and `HI`
shows the best score so far (kept between launches) ([preview-build.md](preview-build.md#lives-losing-your-ship-and-the-score)).
The first **boss** is there too: in a browser, `?stage=test-boss` scrolls for a few seconds until
a **WARNING** sign stops the stage, then the TRIAL WARDEN — a test boss built from armour blocks,
shield plates, a core and two guns — glides in; shoot the plates off, then the core, dodge its
bullet fans and its lasers, and the STAGE CLEAR screen follows
([preview-build.md](preview-build.md#the-boss-range-and-the-warning-browser-only)). And in a
browser `?stage=hunter-range&loadout=full` sends in the **Option Hunters**: armoured violet
enemies that come with an alarm, line up and charge through your Options, carrying off the ones
they touch — a Mega Crash or the rare **blue capsule** (which destroys every enemy on screen) sets
them free to be caught again
([preview-build.md](preview-build.md#the-option-hunter-range-browser-only)), and
`?stage=direct-range` (then the MANTA) sends waves of six violet cubes that close in from the top
and the bottom — the last one destroyed leaves a colour item
([preview-build.md](preview-build.md#the-direct-range-browser-only)). Hits *feel*
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
keyboard and gamepad are in [controls.md](controls.md).

This is version **0.1.0**, the end of the first milestone, plus the first five steps of the second
(difficulties, extra ships and continues; colour-blind bullet colours and points for bullets
cancelled by a destroyed boss or a Mega Crash; the weapon types and the WEAPON SELECT screen; the
Option types, the pod shields and REDUCE, the Option Hunter and the blue capsule; the second ship,
the MANTA, and the SHIP SELECT box). For the on-device checks there is a
**debug build** of the TV app with developer tools — a measuring panel (frame rate, frame times,
a frame graph, start-up time), hit-area outlines, invincibility, a freeze with single steps, slow
motion and jumps to the next checkpoint or the boss — opened on the remote with **Play/Pause,
then Ch ▲ three times** (in a browser, `pnpm dev` has them on F1–F8). The **M1 release check**
lists what to confirm on both monitors ([debug-tools.md](debug-tools.md)).

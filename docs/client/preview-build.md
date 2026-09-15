# The preview build

The game now starts like a real game. Every build — browser, Samsung TV and desktop — shows a
short loading bar and then the **title screen**: the SHMUP CUP logo, a blinking `PRESS OK`, and
after OK a small menu. **1 PLAYER** (or **2 PLAYERS**, for two people at once) asks for a **difficulty** — EASY, NORMAL, HARD or ARCADE — then
for a **ship** (the **SHIP SELECT** box): the **KESTREL**, which powers up with the **power meter**,
or the **MANTA**, which powers up with **colour items** you simply fly into. For the KESTREL the
**WEAPON SELECT** screen follows, where you pick the ship's **weapons** — four ready-made weapon
types or your own mix, how the **Options** fly, which **shield** the `?` power-up gives, what `!`
does, and automatic power-ups — while a
**live preview** flies them behind the menu; the MANTA starts at once. Then the game begins: your ship flies in from the
left and from then on follows the directional buttons of the TV remote, the arrow keys or a
gamepad — **its gun fires on its own**, with a sound for every shot — under the new **HUD**: your
score, the best score and the second player's slot along the top, your spare ships and the **power
meter** with the Force Field's strength (the KESTREL) or the MANTA's **power pips** along the bottom. **Back** (or Pause) opens the **pause
menu** over the frozen game: resume, retry, or quit to the title. When the last ship is lost a
**CONTINUE?** countdown lets you carry on from the last checkpoint (if the difficulty gives
continues), then a **GAME OVER** screen appears, after a zone's boss the **zone result** and the **ZONE MAP**, and on the TV Back on the
title asks **EXIT SHMUP CUP?** before it closes the app. **OPTIONS** — on the title and in the
pause menu — sets the game's own volumes (MASTER, MUSIC, SFX) and opens three pages: **CONTROLS**
(the control profile, how the gun fires, **your own keys and buttons**, an input test), **DISPLAY**
(the colours of the enemy bullets — the standard colours or one of three sets made for colour-blind
players —, how the picture fills the screen, the screen shake, gentler flashes, a hitbox marker on
your ship and a boss HP bar) and **GAME** (difficulty, lives, what losing a ship costs, automatic
power-ups, the capsule magnet and **one-button play**), and the game **remembers** them and your
**high scores** between launches. Everything is drawn by the game
itself and works with the remote's arrows, OK and Back alone ([The title screen and the
menus](#the-title-screen-and-the-menus), [Pausing, quitting and the end
screens](#pausing-quitting-and-the-end-screens), [Difficulty, extra ships and
continues](#difficulty-extra-ships-and-continues), [Choosing your ship](#choosing-your-ship),
[Choosing your weapons](#choosing-your-weapons), [The Options screen](#the-options-screen)).
With **2 PLAYERS** a second player joins the running game whenever they like with **START** on a
gamepad (in a browser also with Enter on the **SPLIT KEYBOARD**), flies the same ship in other
colours and has their own ships, score, power-ups and continues ([Two players](#two-players)).

**New in this build: options, your own controls and accessibility.** OPTIONS now opens three
pages. **CONTROLS**: besides the control profile, **AUTOFIRE** (in a browser: ALWAYS, TOGGLE — Shot
switches firing off and on — or HOLD — fire while Shot is held; on the TV the gun always fires on
its own), **RATE** (7.5 to 30 shots a second), **SOCD** (what Left + Right together do),
**DEBOUNCE** (the remote's hiccup protection), **REBIND KEYS** / **REBIND PAD** — give every action
of the game and of the menus your own keys, remote buttons or gamepad buttons; a key another action
had is taken from it or the two swap, and RESET brings the standard keys back — and an **INPUT
TEST** that lights every button you press. **DISPLAY** holds the picture settings of earlier
builds. **GAME**: the difficulty (now remembered between launches), **LIVES** (1–5), the **PENALTY**
for losing a ship, **AUTO POWER**, the capsule **MAGNET** and **ONE BUTTON** — autofire, automatic
power-ups and the gentlest penalty, for a game played with the arrows alone. The game settings
apply from the next game ([The Options screen](#the-options-screen),
[controls.md](controls.md#rebinding-keys-and-buttons)).

**Before that, the complete front end.** The title's menu now also offers **PRACTICE** (one
zone from a checkpoint of your choice, with its own high-score tables) and a **SOUND TEST** (every
tune and sound effect). Left alone for 12 seconds, the title shows a **demo** of a zone played by
the computer, the **high-score tables** and a short **story** before it comes back. After a high
score you **type your initials** with the arrows and OK, and the table shows your new row; every
difficulty, ship and kind of game (one player, two players, practice) keeps its own table. The
CONTINUE? countdown got a draining time bar ([The front end](#the-front-end-attract-mode-high-scores-practice-and-the-sound-test)).

**Every game starts in the first real zone, AZURE VERGE** — on the TV too: about three minutes of
scrolling over rolling ground, through a long cave and a high-speed stretch, with enemies that fly
and walk past and shoot at you, power capsules to collect, and at the end the **WARNING** and the
zone's boss, the battleship **HALCYON BULWARK** ([The first zone: AZURE
VERGE](#the-first-zone-azure-verge)). It is built to be played with the TV remote: every bullet
and every laser can be dodged with the four arrow directions alone. On every device it proves the
whole chain — the menus and the controls respond quickly and reliably, the 60 ticks per second
simulation runs smoothly, the picture is pixel-perfect at the monitor's resolution — and it is the
first real test of how the game plays with the remote.

**And then the run goes on.** A game is now a **run through five of nine zones**: each zone opens
with its name on a title card while your ship flies in, and after its boss your ship flies off to
the right, a **zone result** adds a bonus for the enemies you shot down and for a quick boss
fight, and the **ZONE MAP** lets you choose which of two zones comes next — up to one of two final
zones, H or I, and an **ending** that depends on your route and on how you played. Your score,
ships and power-ups carry over from zone to zone ([The zone map: a run through
nine zones](#the-zone-map-a-run-through-nine-zones)). **Zones B and C are now real zones** too:
**BRINE NEBULA** (B) — bubbles that burst into smaller bubbles or free the fish inside them, a
wobbling sea, a mid-boss that fights while the screen scrolls on and the boss **GALVANIC MAW**, a
mechanical fish whose weak point is its mouth ([Zone B: BRINE NEBULA](#zone-b-brine-nebula)) — and
**DUNE EXPANSE** (C) — sand worms that burst out of the dunes, beetles walking on the ceiling and
the boss **SANDGRAVE WIDOW**, a giant spider that sends out spider drones
([Zone C: DUNE EXPANSE](#zone-c-dune-expanse)) —, each with its own music. **Zones D and E are
real now as well**: **MAGMA DEEP** (D) — erupting volcanoes, then a **dive** from the surface down
into the caves, rocks falling from the cave roof, a **maze of brick walls** you can shoot through,
a river of lava and the battleship **CINDER BASTION**, whose core hides behind **turning shield
arms** ([Zone D: MAGMA DEEP](#zone-d-magma-deep)) — and **TEMPEST RIDGE** (E) — a storm over jagged
mountains with rain and rolling clouds, enemies that come **from behind** and overtake your ship,
and the seahorse **SQUALL STEED**, which opens its chest to send out little homing seahorses
([Zone E: TEMPEST RIDGE](#zone-e-tempest-ridge)). **Zones F and G are real too**: **CELL VAULT**
(F) — the inside of a living vault, with cells that **chase** your ship, cells that **divide** in
two when shot, **walls of tissue that grow back** after you shoot through them, **grabbing
tentacles** and the squid **MANTLE REGENT**, whose tentacles curl in front of its eye to guard it
([Zone F: CELL VAULT](#zone-f-cell-vault)) — and **PRISM LABYRINTH** (G) — a maze of **crystal
walls** from the ceiling and the floor, a **rush of crystal cubes** that stick where they hit and
build walls, and the crystal core **FACET MONARCH**, which hides its core behind two crystals and
waves two arms like claws ([Zone G: PRISM LABYRINTH](#zone-g-prism-labyrinth)). **And the two
final zones are real now**: **IRON CITADEL** (H) — the enemy fortress, with hatches that let out
drones, a hall of **floors and ceilings that swing in and out**, laser emitters, a **parade of four
earlier bosses** in smaller form and the finale **IRON SOVEREIGN**, whose core hides behind a
turning shield wheel ([Zone H: IRON CITADEL](#zone-h-iron-citadel)) — and **ABYSSAL THRONE** (I) —
the deep, with **mines** that burst when you come near, eels from a trench, and the battleship
**ABYSS ARK**, which the view flies along and which sails away if you take too long, with **THE
HOLLOW KING** inside it ([Zone I: ABYSSAL THRONE](#zone-i-abyssal-throne)). Every run now ends with
a real **ending**: a scene of your ship leaving the fallen citadel or rising out of the deep, a
short story, the result card and the **credits** ([The endings and the
credits](#the-endings-and-the-credits)).
**Zones B and G hide secret bonus stages** with an extra ship and 1,000-point capsules — in zone B,
PEARL GROTTO, the way in is a gap at the very top of the screen; in zone G, GLIMMER CACHE, you must
shoot down every turret of a crystal gallery — and the browser's *Bonus Range* shows all three
kinds of secret entrance ([Hidden bonus stages](#hidden-bonus-stages)).

Along the way your ship shoots the enemies down ([Your weapons](#your-weapons)), powers up with
the capsules some enemies leave behind, taken with the remote's OK button
([Power-ups](#power-ups) — the MANTA's colour items instead: [The MANTA: colour items, weapons and
the Arm](#the-manta-colour-items-weapons-and-the-arm)), and can be lost: rock, enemies and bullets destroy the ship, it
comes back with a life less, and after the last one it is **GAME OVER** — unless you continue
([Lives, losing your ship and the score](#lives-losing-your-ship-and-the-score)). Scores of
20,000, 90,000, 160,000 … points earn **extra ships**, and the game gets **harder as your ship
gets stronger** ([Difficulty, extra ships and continues](#difficulty-extra-ships-and-continues)). Hits *feel*
like hits: enemies burst into **explosions**, shots throw **sparks**, the picture **shakes** when
your ship is lost, the screen **flashes** for a Mega Crash or a boss's final blast, and every kill
shows its **points** rising from the spot
([Explosions, sparks, shake and flashes](#explosions-sparks-shake-and-flashes)). When a boss is
destroyed or a Mega Crash goes off, every enemy bullet on the screen turns into a small **gold
diamond** that flies up into your score — 10 points each ([Lives, losing your ship and the
score](#the-score)). And the game has
**sound**: every shot, hit, explosion and pickup makes a sound, the menus click and chime, the
WARNING wails its siren, and there is original **music** — the title theme, the zone's theme that
loops seamlessly, the boss theme, a short stage-clear tune and a game-over tune
([Sound and music](#sound-and-music)). In a browser the sound starts with your first key press or
click.

In a browser there is more to try: a shortcut straight to each zone's boss (`?skip=boss`), the
fully powered ship (`?loadout=full`), and twelve test stages — the scrolling *Test Range*, with rocky
ground, caves, speed changes and the first enemy roster
([The scrolling test stage](#the-scrolling-test-stage-browser-only)), the short *Boss Range*
with a test boss ([The boss range and the WARNING](#the-boss-range-and-the-warning-browser-only)),
the *Hunter Range*, where the Option Hunters try to steal your Options
([The Option Hunter range](#the-option-hunter-range-browser-only)), and the *Direct Range*, where
the MANTA's colour items come thick and fast ([The Direct range](#the-direct-range-browser-only)),
and the *Gimmick Range*, a preview of what later zones are made of — rock you can shoot through,
walls that grow back, falling rocks, splitting bubbles, a volcano, a suction pod, grabbing
tentacles, cubes that stack into walls, moving blocks, a stop with the view panning down, a fork
in the route and a very fast stretch ([The Gimmick range](#the-gimmick-range-browser-only)),
and the *Raster Range*, a showcase of the SNES-style picture effects the later zones will use — a
sea that waves and shimmers through its colours, a checkered floor that runs to the horizon like
in old racing games, and heat haze over the stars ([The Raster range](#the-raster-range-browser-only)),
and four **boss ranges** with the boss variety of the later zones — mid-bosses that fight while the
screen scrolls on, a battleship bigger than the screen that the view flies around (with a second
boss inside it, and a time limit after which it escapes), twin bosses that take turns and a boss
rush ([The advanced boss ranges](#the-advanced-boss-ranges-browser-only)), and the *Bonus Range*
with its three secret entrances into the *Bonus Vault*, a bonus stage full of 1,000-point capsules
and an extra ship ([Hidden bonus stages](#hidden-bonus-stages)).
The earlier start-up pictures are still there: **free flight** straight away without the title,
the animated **sprite showcase** and the **calibration screen**, plus the **effects gallery**
that shows every explosion and screen effect in turn (see [below](#other-screens-browser-only)).

This build is version **0.1.0** — the end of the first milestone — plus the first sixteen steps of
the second: the difficulties, extra ships and continues, then the colour-blind bullet colours and
points for cancelled bullets, then the **weapon types** and the WEAPON SELECT screen, then four
kinds of **Options**, five **shields**, the **Option Hunter** that steals Options and the rare
**blue capsule**, then the **second ship, the MANTA**, with its colour items, its growing
weapons and its **Arm** shield, and the **SHIP SELECT** box, then **two players at once**: the
title's **2 PLAYERS**, a second player joining with START, each with their own ships, score and
continues, then the **stage mechanics** of the later zones — for now only in the browser's
*Gimmick Range* —, then the **picture options** and **effects**: SCALE, SHAKE, FLASHES and
HITBOX in the Options screen, a Mega Crash flash that brightens the picture instead of covering
it, smoother motion on 120 / 144 Hz monitors, and the SNES-style water, floor and haze effects of
the browser's *Raster Range*, and now the **advanced bosses**: mid-bosses, a battleship raid with
a boss inside, twin bosses and a boss rush in the browser's four boss ranges, and the optional
**BOSS HP** bar in the Options screen, which works on the TV too, then the **zone map**: a
run through five of nine zones with the zone title card, the fly-out after each boss, the zone
result, the ZONE MAP, short stand-in zones (all replaced since), an ending card after zone H or I, and
the secret **bonus stages** of the browser's *Bonus Range*, and now the **real zones B and C**:
BRINE NEBULA with its mid-boss SPUME HERALD, its boss GALVANIC MAW and the secret bonus stage PEARL
GROTTO, and DUNE EXPANSE with its boss SANDGRAVE WIDOW, each with its own music (AZURE VERGE itself
plays as before), and now the **real zones D and E**: MAGMA DEEP with its dive into the caves, its
brick maze and its boss CINDER BASTION, and TEMPEST RIDGE with its enemies from behind, its storm
and its boss SQUALL STEED, again each with its own music, and now the **real zones F and G**:
CELL VAULT with its chasing cells, regrowing tissue walls, grabbing tentacles and its boss MANTLE
REGENT, and PRISM LABYRINTH with its crystal walls, its cube rush, the second secret bonus stage
GLIMMER CACHE and its boss FACET MONARCH, each with its own music, and now the **final zones H and
I**: IRON CITADEL with its moving floors, laser emitters, the parade of earlier bosses and its
boss IRON SOVEREIGN, and ABYSSAL THRONE with its depth mines, the ABYSS ARK raid and THE HOLLOW
KING, each with its own music — and the **ending scenes**, the epilogues and the **credits**, with
their own songs, and now the **front end**: the attract loop (demo play, high-score tables, story),
typing your initials, high-score tables per difficulty, ship and kind of game, PRACTICE and the
SOUND TEST, and now the **Options pages**: CONTROLS (autofire modes and rate, SOCD, the hiccup
protection, rebinding every key and button, the input test), DISPLAY and GAME (difficulty, lives,
penalty, Auto Power-Up, the magnet, one-button play).
For checking it on the monitors
there is a **debug build** with developer tools — a panel with the frame rate, frame times and
start-up time, hit-area outlines, invincibility, a freeze with single steps, slow motion and
jumps to the next checkpoint or the boss — opened on the remote with Play/Pause and then Ch ▲
three times. It comes with the **M1 release check**, the list to run on both monitors
([debug-tools.md](debug-tools.md)).

This page explains how to open the preview on each device, what you should see, how the ship
and the menus should behave, and what to report if something is wrong. The full button layouts
are in [controls.md](controls.md).

## Starting up: the loading screen

For a moment after the app opens you see a deep navy screen with **SHMUP CUP**, the word
**LOADING** and a progress bar that fills from left to right — at the end it reads
**LOADING SOUND** while the game makes its sound effects, then **LOADING MUSIC** while it makes
the title music (and, in a browser stage, the stage's music). On the TV and on a PC this takes
well under a second, so you may only see a flash of it. Then the title screen appears.

If something is wrong with the build, the app stops on the **error screen** instead (see
[When the app shows an error screen](#when-the-app-shows-an-error-screen)) — it never just
stays black.

## The title screen and the menus

| What | Where | What "good" looks like |
|---|---|---|
| **Stars** | Behind everything | Three layers of stars drift slowly to the left, as in the game |
| **SHMUP CUP** logo | Upper middle | Big blocky letters, yellow at the top turning orange and red towards the bottom, with a dark outline and a shadow; crisp square pixels |
| **PRESS OK** | Under the logo | Blinks on and off about once a second |
| **HI** and a number | Bottom | The best one-player score kept on this device for the difficulty and the kind of ship you chose last (NORMAL and the KESTREL at first) — from earlier launches too (0 on a fresh install) |

The title music (SHMUP CUP) plays — in a browser from your first key press or click. Left alone on
`PRESS OK` for 12 seconds, the title starts the **attract loop** — a demo of a zone, the high-score
tables and the story; any button brings the title back
([When nobody plays](#when-nobody-plays-the-attract-loop)).

**OK** (Enter on a keyboard, A / Cross on a gamepad) replaces `PRESS OK` with the **menu**:

| Entry | What it does |
|---|---|
| **1 PLAYER** | A game for one player (it was called **START** in earlier builds). Opens the **DIFFICULTY** box (highlighted first); OK there opens the **SHIP SELECT** box; OK on the KESTREL opens the **WEAPON SELECT** screen, whose START begins the game — OK on the MANTA begins it at once — see [Difficulty, extra ships and continues](#difficulty-extra-ships-and-continues), [Choosing your ship](#choosing-your-ship) and [Choosing your weapons](#choosing-your-weapons) |
| **2 PLAYERS** | The same, but the game is a **two-player** one: a second player joins with START on a gamepad (or Enter on the SPLIT KEYBOARD) — see [Two players](#two-players) |
| **PRACTICE** | Practise one zone from a checkpoint of your choice, with its own high-score tables — see [Practice](#practice) |
| **OPTIONS** | Opens the **Options screen**: the volumes and the CONTROLS, DISPLAY and GAME pages — see [The Options screen](#the-options-screen) |
| **SOUND TEST** | Plays any tune or sound effect of the game — see [The sound test](#the-sound-test) |
| **EXIT** | Only on the TV: asks **EXIT SHMUP CUP?** — see below |

- The highlighted entry is yellow with a small arrow `→` in front of it. **▲ / ▼** move the
  highlight (from the last entry it wraps round to the first); holding an arrow moves it again
  after about a third of a second, then about ten times a second. Each move clicks softly.
- **OK** chooses the highlighted entry (a short chime). The menu ignores OK for a split second
  after it appears, so the OK that opened it never also starts the game — but an OK pressed in
  that moment is remembered, not lost.
- **Back** on the TV asks **EXIT SHMUP CUP?** with **YES** and **NO** — NO is highlighted, so a
  stray OK never quits. ◀ / ▶ move between YES and NO; OK on **YES** closes the app and returns
  to the monitor's home screen, OK on **NO** (or Back again) goes back to the title. In a browser
  (which cannot close itself) Back only goes from the menu back to `PRESS OK`.
- Any controller works in the menus — also a second gamepad (in the menus every controller
  counts as player 1's).

## What you should see

After **1 PLAYER**, **OK** on a difficulty, **OK** on the KESTREL in the SHIP SELECT box and **OK** on
START in the WEAPON SELECT screen (or **OK** on the MANTA) the title music fades and the game begins — AZURE
VERGE's own music starts, and
the picture is a deep navy
picture (never pure black — the M7 monitors' VA panels smear dark-to-bright transitions) framed by
two thin bars, one along the top edge and one along the bottom (the **HUD**):

| Element | Where | What "good" looks like |
|---|---|---|
| **Background** | Whole picture behind the ship | Two layers of stars move to the left as the view scrolls, the far ones slower, and the rim of a blue planet fills the bottom of the picture, moving slowest of all; everything moves steadily, with no jumps, and repeats seamlessly. (In free flight and on the title, three star layers drift by themselves instead) |
| **KESTREL** (or the **MANTA**), the player ship | Enters from the left edge | Glides in from off-screen during the first ⅔ of a second, slowing down as it arrives, and stops at mid-height about a sixth of the way across. Then it is yours to fly |
| **Shots** from the ship's nose | In front of the ship, flying right | As soon as the ship has arrived, small cyan-and-white darts leave its nose and race to the right edge, two at a time, each with a tiny white-and-yellow **muzzle spark** flickering just in front of the nose as it leaves — see [Your weapons](#your-weapons) |
| **Top bar** | Top edge | `1P` (cyan) and your score `00000000` on the left; `HI` (yellow) and the best score so far (kept between launches) in the middle; `2P` and `------` (grey — nobody is playing player 2) on the right — in a **2 PLAYERS** game a blinking yellow `PRESS START` instead, until player 2 joins ([Two players](#two-players)) |
| **Bottom bar** | Bottom edge | On the left small ship icons (your spare ships — on NORMAL you start with three, the one you fly plus two icons; EASY gives five, ARCADE two; with more than five spare ships you see one icon and the number); then the **power meter**: seven boxes labelled `SPEED` `MISSILE` `DOUBLE` `LASER` `OPTION` `?` `!` — with another weapon type the second, third and fourth boxes carry that type's weapon names instead, e.g. `SPREAD` `TAIL` `RIPPLE` ([Power-ups](#power-ups)); on the right, while you have a Force Field, five small blocks — cyan for each hit it can still take, dark for the spent ones. With the **MANTA** the power meter makes way for rows of small square **pips** — `SHOT`, `SUB`, `ARM`, `SPD` and the weapon's name ([The MANTA](#the-manta-colour-items-weapons-and-the-arm)) |

Every pixel should be a crisp little square. The game draws at 384×216 and scales that up
by a whole number: on the 1080p M7 monitors (and any 1920×1080 browser window) the scale is
exactly ×5 and the picture fills the screen edge to edge. On other sizes the largest
whole-number scale that fits is used and a very dark border fills the rest — that border is
intentional, it keeps the pixels sharp.

The graphics are placeholders made for this project (original designs, not taken from any
other game) and will be replaced by finished art later.

## Pausing, quitting and the end screens

**Pause.** **Back** or **Play/Pause** on the remote (Esc, P or Backspace on a keyboard, Start or
Back on a gamepad) freezes the game — ship, bullets, explosions, the scrolling — darkens it to
about half and shows the **PAUSE** menu in a framed box, with a short sound:

| Entry | What it does |
|---|---|
| **RESUME** | Back to the game exactly where it stopped (highlighted first). **Back** or **Pause** do the same |
| **OPTIONS** | Opens the **Options screen** over the frozen game ([below](#the-options-screen)); BACK returns to the pause menu |
| **RETRY STAGE** | Starts the zone (or test stage, or open space) again from the beginning — no question asked. In zone A (and in every test stage) that is a fresh start: a fresh ship, the difficulty's full number of ships and a zero score; in a later zone you get back the score, ships and power-ups you had when that zone began. Inside a bonus stage it starts the zone the bonus stage was entered from |
| **QUIT TO TITLE** | Asks **QUIT TO TITLE?** (YES / NO, NO highlighted); YES ends the game and shows the title |

The music keeps playing while the game is paused. Leaving the app with **Home** on the TV (or
switching tabs in a browser) and coming back also brings you back to the pause menu, so a game
never continues while you are not looking.

**Game over.** When your last ship is lost the game plays on for a moment, then darkens — if
you still have continues, the **CONTINUE?** countdown comes first
([Continues](#continues)) — and a red-edged box shows **GAME OVER** and your final **SCORE**; a short, sad tune (SILENT VERGE)
plays. If the score is a new best for this device, **NEW HI-SCORE** shows in yellow under the box
(your first game with any points always is). After half a second **OK** (or Back) goes on; after
ten seconds it goes on by itself — to the **name entry** when the score is among the ten best of its
table ([Typing your initials](#typing-your-initials)), then that table, then the title; otherwise
straight to the title. The score is saved as soon as the screen appears
([What the game remembers](#what-the-game-remembers)), and the title's `HI` shows the best one.

**Zone clear.** When a zone's boss is destroyed your ship (and a second player's) flies off to
the right on its own, a second and a half later a box shows **ZONE A CLEAR** with the zone's
name, your score, how many of the zone's enemies you shot down and the bonuses for that — the
**zone result** —, and after five seconds (or **OK**) the **ZONE MAP** opens, where you choose the
next zone; after the last zone the **ending** comes instead ([The zone map: a run through nine
zones](#the-zone-map-a-run-through-nine-zones)). A run's score is saved when it ends — at the
ending or on the GAME OVER screen.

**Stage clear (test stages).** The browser's test stages are single stages, not part of the zone
map. When one ends — the Boss Range after its boss, the Test Range after its 75 seconds — the ship
flies out the same way, then a box shows **STAGE CLEAR** with your **SCORE** and the **HI** score
for four seconds, then **TO BE CONTINUED** for four seconds, and then the title (through the name
entry for a high score). **OK** skips ahead. The score is saved like a game over's.

## Difficulty, extra ships and continues

### Choosing a difficulty

**1 PLAYER** (or **2 PLAYERS**) on the title opens a framed box over the darkened title:

```text
          DIFFICULTY
           EASY
       →  NORMAL
           HARD
           ARCADE
   LIVES     3   CONTINUES   3
   HI                 00012340
```

| Difficulty | Ships | Continues | What losing a ship costs | The enemies |
|---|---|---|---|---|
| **EASY** | 5 | 5 | Only the Force Field (*Casual*) | Bullets about a sixth slower, aimed shots a little less exact, and they speed up only half as much as you power up |
| **NORMAL** | 3 | 3 | One step of power (*Classic*) | The standard |
| **HARD** | 3 | 2 | One step of power (*Classic*) | A little faster and more often from the start |
| **ARCADE** | 2 | 0 | All your power, and the stage goes back to its last checkpoint (*Arcade*) | Faster still from the start; no continues |

- **▲ / ▼** move the highlight (it wraps round); the lines at the bottom show the highlighted
  difficulty's **LIVES** (ships), **CONTINUES** and **HI** — each difficulty keeps its own best
  scores (and the KESTREL and the MANTA keep separate ones).
- **OK** chooses the highlighted difficulty (a chime) and opens the **SHIP SELECT** box
  ([Choosing your ship](#choosing-your-ship)); **Back** returns to the title menu.
- The box opens on the difficulty you chose last — NORMAL the first time — and since the Options
  build it is **remembered** between launches (OPTIONS → GAME → DIFFICULTY sets it too). The LIVES
  shown are what the game will really get: with OPTIONS → GAME → LIVES set, that number on every
  difficulty ([The GAME page](#the-game-page)).
- Starting a game therefore takes five OKs with the KESTREL: OK (`PRESS OK`), OK (1 PLAYER), OK (the
  difficulty), OK (the KESTREL, highlighted first in the SHIP SELECT box), OK (START in the WEAPON
  SELECT screen, which is highlighted when it opens) — and four with the MANTA (▼ then OK in the
  SHIP SELECT box starts the game).

### The game gets harder as your ship gets stronger

Like the classic games, Shmup Cup keeps a hidden difficulty level, the **rank**. It starts at the
difficulty's level and goes up with the power your ship carries: the Missile, the Double or the
Laser, each Option and the Force Field all raise it (Speed Ups do not) — for the MANTA its SHOT
and SUB levels and its Arm (fully powered, it counts exactly as much as a fully powered KESTREL;
the speed toggle does not count). The higher the rank, the
more often enemies fire and the faster their bullets fly — a fully powered ship on NORMAL faces
bullets about a fifth faster and shots about 40 % more often than a bare one. Losing power (a lost
ship) lowers it again. The debug build's panel shows it as `RANK`
([debug-tools.md](debug-tools.md)).

At a high rank some enemies fire a last bullet when they are destroyed (a **revenge bullet**). In
AZURE VERGE the amber **fan fliers** do: shot down on screen, they send one red round bullet
towards you from where they exploded. On NORMAL that starts once the ship has the Missile, the
Laser, all four Options **and** a Force Field; on HARD and ARCADE sooner; on EASY never. A Mega
Crash never causes revenge bullets.

### Extra ships

Your score earns a ship at **20,000** points, then at **90,000**, **160,000** and every 70,000
after that, on every difficulty. A short "1UP" jingle plays that no other sound can cut off, and a
spare-ship icon appears in the bottom bar. You can hold at most **nine** ships.

### Continues

When your last ship is lost and the difficulty still has continues, the game darkens a little
and a red-edged box shows **CONTINUE?**, a big red number counting down from **9** to **0** (a
tick each second, ten seconds in all) over a **time bar** that drains to empty (red, with the number
flashing, for the last three seconds), your **SCORE** and **CREDITS** with the continues you have
left; once OK counts, `PRESS OK` blinks under them with `BACK: GIVE UP`. The music fades out.

- **OK** continues (it only counts after the first half second, so a button you were still
  pressing does not decide for you): the stage goes back to its last invisible checkpoint — in
  AZURE VERGE the start, the entrance of the cave (about 1:15) or the start of the fast stretch
  (about 2:25) — the zone's music starts again and your ship flies in with the difficulty's full
  number of ships but **without its power** (small darts, no Missile or Options, normal speed; the
  MANTA back to its weakest SHOT and SUB, no Arm, the middle speed).
- **Your score is kept**, and its **last digit** now counts your continues: 12,340 becomes 12,341
  after the first continue, 12,342 after the second. Points always end in 0, so that digit shows
  at a glance — also in the saved high scores — how many continues a score needed.
- **Back** gives up, and so does waiting until the countdown ends: the **GAME OVER** screen
  appears and the game is saved as usual.
- In a **2 PLAYERS** game each player has their own continues, and the box shows both players'
  credits — see [Two players](#two-players).
- On **ARCADE** there are no continues: GAME OVER comes straight away.

## Choosing your ship

OK on a difficulty opens a framed box over the darkened title — the **SHIP SELECT**:

```text
            SHIP SELECT
    → KESTREL            [picture of the
      MANTA               highlighted ship]

             POWER METER
       CAPSULES MOVE THE METER
       OK EQUIPS THE LIT SLOT
       OPTIONS COPY YOUR FIRE

             OK: CHOOSE
```

The two ships play differently — they are the two classic ways of powering up a ship:

| | **KESTREL** (as before) | **MANTA** (new) |
|---|---|---|
| Looks like | The blue-and-grey ship of the earlier builds | A flat ray-winged ship with a **green canopy** |
| Powers up with | The **power meter**: capsules move the highlight, OK takes the power-up ([Power-ups](#power-ups)) | **Colour items**: fly into one and it works at once — there is no meter, and **OK does nothing** in the game ([The MANTA](#the-manta-colour-items-weapons-and-the-arm)) |
| Weapons | Chosen on the WEAPON SELECT screen (types A–D or your own mix), plus up to four Options | A main gun and a sub-weapon that each grow through **nine levels** — the main gun in one of two styles; no Options |
| Shield | The `?` shield you chose (Force Field …) — never against rock | The **Arm**: 3, then 4, then 5 hits — and it **also protects against rock** |
| Speed | Six speeds, one more with each SPEED UP (it starts at the slowest) | Three speeds, switched with **Ch ▼** (channel down) at any time — it starts in the middle one |

- **▲ / ▼** move the highlight (it wraps round, with a click); the picture and the three lines of
  hints below it change with it — `POWER METER` for the KESTREL, `DIRECT ITEMS` for the MANTA.
- **OK** on the **KESTREL** opens the **WEAPON SELECT** screen ([Choosing your
  weapons](#choosing-your-weapons)); OK on the **MANTA** starts the game straight away — it has no
  weapons to choose.
- **Back** returns to the DIFFICULTY box, and Back on the WEAPON SELECT screen returns here.
- The box opens on the ship you chose last — the KESTREL the first time (so OK goes straight on
  as before). The choice lasts until the app is closed, like the difficulty.
- The two ships keep **separate high scores** for each difficulty: after choosing the MANTA, the
  title's `HI` and the DIFFICULTY box show the MANTA's best.

## Choosing your weapons

OK on the **KESTREL** in the SHIP SELECT box opens the **WEAPON SELECT** screen (the MANTA has no
weapons to choose — [Choosing your ship](#choosing-your-ship)). A framed panel on the left lists
what the ship will carry; behind it, over the whole picture, a **live preview** shows the choice in action:
the KESTREL, with the Missile and two Options, flies over a small practice range with a floor and
a ceiling and harmless targets, weaving up and down to the right of the panel and firing what
you choose. The preview makes no sound (the title music keeps playing), the ship cannot be hit, and
the range starts over when it ends.

```text
        WEAPON SELECT
    TYPE     TYPE A
    MISSILE  MISSILE          ← grey unless TYPE is EDIT
    DOUBLE   DOUBLE
    LASER    LASER
    OPTION   TRAIL
    ? SLOT   FORCE FIELD
    ! SLOT   MEGA CRASH
    AUTO     OFF
    ORDER    S M L O O O O ?
  → START
    LEFT/RIGHT: CHANGE
    OK ON START: GO
```

- The screen opens with **START** highlighted, so OK starts a game straight away with what is
  shown — the first time the classic **TYPE A**, later whatever you chose last.
- **▲ / ▼** move between the lines (the grey MISSILE / DOUBLE / LASER lines are skipped); **◀ / ▶**
  — or OK — change the highlighted line, with a click each time.
- **OK on START** begins the game; **Back** returns to the SHIP SELECT box (what you changed stays
  on the screen for next time, but only START uses it).
- Your choice is kept for RETRY STAGE and every later game **until the app is closed** — it is
  not remembered between launches yet (a later build's game options will).

**TYPE — the four weapon types.** Every type has the same small darts as its main gun; they differ
in what the power meter's **MISSILE**, **DOUBLE** and **LASER** boxes give you:

| Type | MISSILE box | DOUBLE box | LASER box |
|---|---|---|---|
| **TYPE A** (as before) | **MISSILE** — drops diagonally and slides along the ground | **DOUBLE** — a second shot climbing at 45° | **LASER** — a long pale-blue beam that passes through enemies |
| **TYPE B** | **SPREAD BOMB** — an orange bomb that arcs down and bursts on the ground (or the first enemy it touches) into a fiery blast; everything inside the blast is hit twice | **TAIL GUN** — a second shot straight **backwards** | **RIPPLE LASER** — cyan rings that grow as they fly (up to three at a time); an enemy is hit where the ring touches it |
| **TYPE C** | **2-WAY MISSILE** — two grey missiles at once, one climbing, one diving | **VERTICAL** — a second shot straight **up** | **CYCLONE LASER** — a thicker, longer beam with violet strands swirling round a white core; passes through enemies |
| **TYPE D** | **PHOTON TORPEDO** — a fast violet torpedo that drops and slides along the ground, and keeps going through the small enemies it destroys | **FREE WAY** — a second shot in the **direction you last moved** (up, down, back, diagonally …) | **TWIN LASER** — pairs of short green beams side by side, fast (two pairs at a time) |

The last TYPE choice, **EDIT** (Weapon Edit), makes MISSILE, DOUBLE and LASER white: you can then
pick each of the three from **all four types** (for example the Spread Bomb, the Free Way and the
Cyclone Laser together). The labels show the full names (`SPREAD BOMB`, `2-WAY MISSILE` …). EDIT
starts from the weapons of the type you had chosen before it. While MISSILE is highlighted the
preview shows the missile on its own, on DOUBLE the Double weapon, on LASER the laser; on every
other line it switches between the Laser and the Double weapon every four seconds.

**OPTION** — how the Options (the glowing orbs the power meter's OPTION box gives you) fly. The
preview's two Options show the choice at once; while OPTION is highlighted they also spread out
and pull back in every second and a half.

| Choice | How the Options fly |
|---|---|
| **TRAIL** (as before) | They follow the path your ship has flown: they string out behind you when you move and stay put on screen when you stop |
| **SNAKE** | A chain hanging behind the ship, one link at a time: when you move, it swings out the opposite way, like a tail; when you stop, it **keeps its shape**, so you can hold a curve of Options where you want it |
| **FORMATION** | A tight `>` behind the ship that can **spread** into a wide `V` (above and below you) |
| **ROTATE** | They circle round the ship; **spread** makes the circle twice as wide |

**Spreading FORMATION and ROTATE:** on the TV remote press **Ch ▲** (channel up) to spread them
out, and again to pull them back in — or **hold OK** for a quarter of a second or more: they
spread while you hold it and come back when you let go. A normal quick OK (to take a power-up)
never moves them. On a keyboard the same is **V** (press) or holding **C** / **Enter**; on a
gamepad **Y** (press) or holding **X**. TRAIL and SNAKE ignore it.

**? SLOT** — what the power meter's `?` box gives:

| Choice | What `?` gives | How it protects you |
|---|---|---|
| **FORCE FIELD** (as before) | A glowing ring round the ship | Takes **five** hits from bullets, lasers and enemies you touch, then breaks |
| **SHIELD** | Two small **pods** at the ship's nose | Each pod stops the bullets and enemies that touch **it** — up to **14** hits each, and each wears out on its own. They guard the front only: what comes from behind or above still hits you, and they never stop lasers |
| **FREE SHIELD** | A pair of pods on the side you **last moved towards** (ahead if you have not moved yet) | Like SHIELD, but you choose where: move up, then take `?`, and the pair sits above you. Taking `?` again adds a second pair where you last moved (four pods at most); after that, `?` replaces the most worn pair (while all four are unharmed, `?` is greyed) |
| **ROTATE** | Two pods **circling** the ship | Like SHIELD, but they sweep all round you |
| **REDUCE** | No ring — the ship's **weak spot shrinks** to a third, with a faint green shimmer round it | Bullets must come much closer to hit you. It takes **two** hits: after the first the weak spot grows to two thirds, after the second it is back to normal. Hitting the rock still destroys the ship |

No shield protects you from the **rock**.

**! SLOT** — what the power meter's `!` box does:

| Choice | What OK on `!` does | `!` is greyed out when |
|---|---|---|
| **MEGA CRASH** (as before) | Every enemy and enemy bullet on screen is destroyed | never |
| **NORMAL** | Back to the small darts — drops the Double or Laser weapon (the missiles and Options stay) — for when you prefer the basic gun | you already fire the darts |
| **SPEED DOWN** | One speed level slower — for when you took too many Speed Ups | the ship is at its normal speed |
| **LIFE OPTION** | Your **spare ships become Options** — as many as fit up to four; each one takes a spare-ship icon | you have no spare ship, or four Options |
| **FULL BARRIER** | Your `?` shield back to **full strength** — a fresh Force Field even over a worn one; with pods, every pod back where it was (broken ones too); REDUCE back to its smallest | the shield is up at full strength |

**AUTO** — **Auto Power-Up**: ON takes power-ups by itself when the power meter reaches the next
one in the order below (you can still press OK yourself). OFF (the default) leaves the highlight
where the capsules put it until you press OK — you can "park" it on a power-up for as long as you
like.

**ORDER** — the order Auto Power-Up follows, shown in letters (`S` Speed Up, `M` MISSILE, `D`
DOUBLE, `L` LASER, `O` Option, `?`, `!`; `+` when there are more than eight, `NONE` when empty).
OK on ORDER opens the **AUTO ORDER** box on the right over the darkened screen: twelve numbered
lines, each one power-up or `-` (nothing). ▲ / ▼ move, ◀ / ▶ (or OK) change a line; **DONE** or
**Back** keep the order (the `-` lines are left out) and close the box. A power-up listed twice
asks for two of it (e.g. two Speed Ups).

In the game, the power meter's boxes then carry the weapon type's names — Type B shows `SPREAD`
`TAIL` `RIPPLE`, Type C `2-WAY` `VERTICAL` `CYCLONE`, Type D `TORPEDO` `FREE WAY` `TWIN`
([Power-ups](#power-ups)); the `?` and `!` boxes keep their symbols.

What "good" looks like:

- The WEAPON SELECT panel is readable from the sofa; the grey lines are clearly grey.
- The preview's ship is always visible to the right of the panel, weaving smoothly, and the
  weapons change the moment you change TYPE or a weapon — never a magenta-and-black square.
- Missiles, bombs and torpedoes land on the preview's floor; nothing ever hits the preview ship.
- Moving through the lines never skips or doubles a step; Back always returns to the SHIP SELECT
  box, and the AUTO ORDER box always closes with DONE or Back.
- The game that starts has exactly the weapons, Option type, `?` and `!` choices and Auto
  Power-Up setting shown.
- With OPTION highlighted, the preview's Options fly the chosen way (and FORMATION / ROTATE
  spread and pull back every second and a half); TRAIL and SNAKE just follow.

## Two players

Two people can play at once on the same screen, side by side — like the classic two-player
arcade shooters.

**Starting.** On the title choose **2 PLAYERS** (the second entry) instead of 1 PLAYER. The rest is
the same as always: the DIFFICULTY box, the SHIP SELECT box and, for the KESTREL, the WEAPON
SELECT screen — both players fly the same ship with the same weapons. The game starts with
**player 1 alone**, flown with the TV remote or the keyboard (a gamepad moves player 1's ship too,
until START or A makes it player 2's — so in a two-player game player 1 should not play on a
gamepad).

**Player 2 joins whenever they like.** While player 2 is not in the game, a yellow `PRESS START`
blinks on the right of the top bar, where player 2's score goes. Player 2 presses **START** (or
**A**) on a **gamepad** — in a browser with the **SPLIT KEYBOARD** control profile, **Enter** — and a
second ship flies in from the left, blinking (it cannot be hit for a moment), with a short chirp.
It is the same ship **in other colours**: the KESTREL red-orange and gold instead of blue and
cyan. Player 2 can join during the WARNING too, but not once the STAGE CLEAR or GAME OVER screen
is on its way. Pressing START does **not** pause the game while it lets a player join.

Who controls which ship:

| Controller | In a 2 PLAYERS game | In the menus and in 1 PLAYER games |
|---|---|---|
| Samsung remote, keyboard | Player 1 | Player 1 |
| A gamepad | Player 1 until you press **START** or **A** on it — from then on it is **player 2's** (until it is unplugged); any other gamepad stays player 1's | Player 1 — every gamepad, whichever one |
| **SPLIT KEYBOARD** (browser only, OPTIONS → CONTROLS → PROFILE) | Left half (W A S D, F, G, Esc / Q) player 1; right half (arrows, K, L, Enter) player 2 | Both halves move through the menus |

**On the TV** a second player needs a **gamepad** connected to the monitor (USB or Bluetooth) —
the remote is always player 1's. The button layouts are in
[controls.md](controls.md#two-players).

**Each player has their own** ships (the difficulty's number each), score, extra ships at 20,000 /
90,000 / … points, continues and power:

- Capsules (and the MANTA's colour items) go to **whoever touches them first** — player 1 when
  both touch one at the same moment — and move that player's own power meter; OK takes a
  power-up for the player whose controller pressed it. Shields and Options belong to each ship.
- While both ships are flying, enemies that leave a capsule leave **an extra one** every second
  time, just below the first (with the MANTA: the next colour item), so there is enough for two.
- The enemies aim at the **nearest** ship (at player 1 when both are equally close).

**The HUD.** The top bar shows `1P` and player 1's score on the left, `2P` and player 2's score
on the right. While **both** ships are in the game the bottom bar splits into two halves — player
1 on the left, player 2 on the right — each with a spare-ship icon (player 2's in its own colours)
and the number of spare ships, a small power meter of seven narrow boxes with two-letter labels
(`SP` `MS` `DB` `LS` `OP` `?` `!` — with another weapon type its own letters, e.g. `SB` `TL` `RP`
for TYPE B) and the shield's blocks; with the MANTA the rows `SH`, `SB`, `AR`, `SP` of small
squares instead. With only one ship in the game the bottom bar looks as in a one-player game.

**Losing your ships.** When one player loses their last ship, **the other plays on**. The out
player's half of the bottom bar then shows:

- a blinking **`PRESS START`** if they still have continues: their join button (START on the
  gamepad; for player 1 **Back** or **Play/Pause** on the remote, P, Esc or Backspace on a keyboard;
  on the SPLIT KEYBOARD Esc / Q for player 1, Enter for player 2) brings them back **straight away** — flying in from the left with
  the difficulty's full number of ships but without power, the last digit of their score counting
  the continue. The stage does **not** go back to a checkpoint;
- **`GAME OVER`** if they have no continues left: they stay out for the rest of the game.

**When both are out** the game is over. If either player still has continues, the **CONTINUE?**
countdown appears with each player's credits (`1P` and `2P`), and a player presses **OK on their
own controller** to carry on — the stage goes back to its last checkpoint, as in a one-player game.
The first OK ends the countdown: only the players who pressed it at that moment come back (press
together to continue together); the other stays out, but can still come back later with START
while the first one plays (continues permitting).

**Pausing.** Either player's pause button pauses (player 2: START or Back / Select on the
gamepad) — except while a player can join or come back: then that player's START does that
instead. The pause menu answers every controller. **RETRY STAGE** starts the stage again as a two
player game (player 2 presses START again to join); **QUIT TO TITLE** ends it — choose 1 PLAYER on
the title to play alone again.

**Unplugging player 2's gamepad** does not remove its ship: it stays in the game, still firing
but no longer moving, until it is lost. Plug a gamepad in and press **A** on it to fly that ship
again (START works too, but also opens the pause menu).

**The end screens and high scores.** GAME OVER and STAGE CLEAR show both players' scores (`1P`
and `2P`). Both scores are saved in the high scores of the difficulty and the ship you played, like
one-player scores; the **NEW HI-SCORE** line refers to player 1's score.

## The Options screen

**OPTIONS** on the title menu — or in the pause menu during a game — opens a framed box over the
darkened picture with the three volumes and three **pages**:

```text
            OPTIONS
   → MASTER   ▬▬▬▬▬▬▬▬▬▬  10
     MUSIC    ▬▬▬▬▬▬▬▬▬▬  10
     SFX      ▬▬▬▬▬▬▬▬▬▬  10
     CONTROLS
     DISPLAY
     GAME
     BACK
```

| Entry | What it does |
|---|---|
| **MASTER** | The volume of everything the game plays, from 0 (silent) to 10 (full, the start setting) |
| **MUSIC** | The music's volume, 0–10 |
| **SFX** | The sound effects' volume, 0–10 — the menu clicks and chimes follow it too |
| **CONTROLS** | Opens the **CONTROLS** page: the control profile, how the gun fires (AUTOFIRE, RATE), SOCD, the remote's hiccup protection (DEBOUNCE), **your own keys and buttons** (REBIND KEYS / REBIND PAD) and the INPUT TEST — see [controls.md](controls.md#the-controls-page-autofire-socd-and-the-hiccup-protection) |
| **DISPLAY** | Opens the **DISPLAY** page: BULLETS, SCALE, SHAKE, FLASHES, HITBOX, BOSS HP — [below](#the-display-page) |
| **GAME** | Opens the **GAME** page: DIFFICULTY, LIVES, PENALTY, AUTO POWER, MAGNET, ONE BUTTON — [below](#the-game-page) |
| **BACK** | Keeps the settings and closes the box |

- **▲ / ▼** move the highlight (MASTER is highlighted first). On a volume, **◀ / ▶** turn it down
  or up one step — the bar shrinks or grows and the number changes; holding the arrow keeps
  going, like in the other menus. The music gets quieter while you turn MUSIC down (on the title
  you hear the title music change), the clicks get quieter while you turn SFX or MASTER down. OK on
  a volume does nothing.
- **OK on CONTROLS, DISPLAY or GAME** opens that page in the same box; its **BACK** (or the Back
  button) keeps its settings and returns to OPTIONS.
- The steps follow your hearing rather than a ruler: 5 sounds about half as loud as 10, and 0 is
  silent.
- **BACK** — or the **Back** button anywhere in the box — keeps the settings, plays the "back"
  sound and returns to where you came from: the title menu, or the pause menu with the game still
  frozen. The game **remembers** everything from then on, also after the app is closed.
- The game's volumes come on top of the TV's (or the PC's) own volume: the remote's volume keys
  still set the monitor's volume as always.
- Every screen of the game is still drawn by the game itself and works with the remote's arrows, OK
  and Back alone. (In earlier builds all the entries were in one long list; since the Options build
  the picture settings are on DISPLAY and the control profile on CONTROLS.)

### The CONTROLS page

```text
             CONTROLS
   → PROFILE  SAFE 4-WAY (DEFAULT)
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

**PROFILE** is the control profile (on the TV **SAFE 4-WAY (DEFAULT)** or **FAST 8-WAY**, in a
browser **KEYBOARD (DEFAULT)**, **KEYBOARD AS REMOTE** or **SPLIT KEYBOARD** — two players on one
keyboard, [Two players](#two-players)). **AUTOFIRE** chooses how the gun fires — **ALWAYS** (on its
own, the start setting), **TOGGLE** (each press of Shot switches it off and on) or **HOLD** (while
Shot is held); on the TV it is greyed out, because the remote has no fire button. **RATE** sets how
many shots a second the gun fires (7.5 to 30; 15 at the start). **SOCD** decides what opposite
directions held together do, **DEBOUNCE** how long the game waits before it believes a released
button (the hiccup protection — AUTO keeps the profile's own). **REBIND KEYS** / **REBIND PAD**
open the rebind box, where you give every action your own keys or buttons, and **INPUT TEST** shows
what every button does. Everything on this page is explained in
[controls.md](controls.md#the-controls-page-autofire-socd-and-the-hiccup-protection) and
[controls.md](controls.md#rebinding-keys-and-buttons).

PROFILE, SOCD, DEBOUNCE and new keys work **at once**; AUTOFIRE and RATE apply from the **next
game** (or RETRY STAGE) — a game already running keeps what it started with.

### The DISPLAY page

```text
             DISPLAY
   → BULLETS  STANDARD
     SCALE    INTEGER
     SHAKE    ON
     FLASHES  NORMAL
     HITBOX   OFF
     BOSS HP  OFF
     BACK
```

| Entry | What it does |
|---|---|
| **BULLETS** | The colours of the enemy bullets and lasers: **STANDARD** (pink, red and purple — the start setting), or a set made for a kind of colour blindness: **DEUTERANOPIA** and **PROTANOPIA** (red–green: light magenta, sky blue and near-white) or **TRITANOPIA** (blue–yellow: crimson, teal and near-white) — see below |
| **SCALE** | How the picture fills the screen: **INTEGER** (the start setting — every game pixel is exactly the same size, with a black border where the screen does not fit a whole multiple), **FIT** (as large as possible without changing the shape — a thinner border or none, but some pixel rows and columns come out one screen pixel wider than others) or **STRETCH** (the whole screen, the shape stretched to fit) — see below |
| **SHAKE** | **ON** (the start setting): the picture shakes for the big moments — your ship lost, a boss exploding; **OFF**: it never shakes |
| **FLASHES** | **NORMAL** (the start setting) or **REDUCED**: at most one full-screen flash a second, and every flash much dimmer — for players sensitive to flashing light (even on NORMAL the game never flashes more than three times a second) |
| **HITBOX** | **OFF** (the start setting) or **ON**: a small white square with a pink-red rim in the middle of your ship (and player 2's) shows the spot that must not be hit — only that spot counts for bullets and enemies |
| **BOSS HP** | **OFF** (the start setting) or **ON**: during a boss fight the middle of the top bar shows `BOSS` and a red bar of the boss's remaining strength instead of `HI` — see [The boss HP bar](#the-boss-hp-bar-every-device) |
| **BACK** | Keeps the settings and returns to OPTIONS |

- On BULLETS, SCALE and FLASHES, **◀ / ▶** (or OK) step to the next choice. On SHAKE, HITBOX and
  BOSS HP, **◀** is OFF, **▶** is ON and OK switches.
- **Every change works at once**: new bullet colours, a new SCALE, the HITBOX marker and the SHAKE /
  FLASHES settings show on the very next picture or effect (over a paused game too). BOSS HP shows
  from when you leave the page with BACK.

**The bullet colours.** Enemy bullets come in three families — pink, red and purple — and the
three colour-blind sets give each family a colour that stays distinct for that kind of colour
blindness and never looks like the gold capsules and point diamonds or the orange explosions. In
those three sets the bullets' centres are also **shape-coded**, so the families differ even
without colour: the pink family keeps a solid bright centre, the red one has a **dark dot** in the middle (it looks
like a ring) and the purple one a **single bright dot**. The laser beams follow the same colours.
Only the look changes — the bullets fly, hit and score exactly the same, whatever you choose.

**The picture size (SCALE).** The game draws a small 384 × 216 picture and enlarges it to your
screen. On a 1920 × 1080 screen — the TV app's usual size — it fits exactly five times, so
**INTEGER, FIT and STRETCH look the same there**. They differ on other sizes: in a browser window,
on a 1280 × 720 picture (INTEGER leaves a black border of 64 pixels left and right and 36 top and
bottom; FIT and STRETCH fill it) or on a screen that is not 16:9 (only STRETCH fills it, and the
picture looks wider or taller). With FIT and STRETCH small details can look slightly uneven —
that is expected; INTEGER is the sharpest.

**The hitbox marker.** Your ship is only hit where its small weak spot is — bullets that merely
brush a wing miss. HITBOX ON draws that spot: a white 3 × 3 square in a pink-red frame in the
middle of the KESTREL or the MANTA (smaller while a **REDUCE** shield is up). It moves exactly with
the ship, disappears while the ship is exploding, and changes nothing about the game. (The
*hit-area outlines* of the debug build are a different, developer-only tool —
[debug-tools.md](debug-tools.md).)

### The GAME page

```text
               GAME
   → DIFFICULTY NORMAL
     LIVES      PRESET
     PENALTY    PRESET
     AUTO POWER OFF
     MAGNET     ON
     ONE BUTTON OFF
     BACK
   ONE BUTTON: AUTOFIRE, AUTO POWER, CASUAL
   APPLIES FROM THE NEXT GAME
```

| Entry | What it does |
|---|---|
| **DIFFICULTY** | EASY, NORMAL, HARD or ARCADE — the difficulty the DIFFICULTY box offers first ([Choosing a difficulty](#choosing-a-difficulty)). Greyed out when the page is opened from the pause menu: a game keeps the difficulty it started on (and its high-score table) |
| **LIVES** | **PRESET** (the difficulty's own: 5 on EASY, 3 on NORMAL and HARD, 2 on ARCADE) or **1** to **5** ships for every difficulty |
| **PENALTY** | What losing a ship costs: **PRESET** (the difficulty's own), **ARCADE** (all your power, and the stage goes back to its last checkpoint), **CLASSIC** (one step of power) or **CASUAL** (only the Force Field) |
| **AUTO POWER** | **Auto Power-Up**: ON takes power-ups by itself when the power meter reaches the next one of its order (the WEAPON SELECT screen's AUTO does the same for one session; once you change it here, this one counts) |
| **MAGNET** | **ON** (the start setting): capsules and items close to your ship are pulled into it; **OFF**: you have to touch them |
| **ONE BUTTON** | **ON**: the gun fires on its own, power-ups are taken automatically and losing a ship costs only the Force Field — a game played with the four directions alone ([controls.md](controls.md#one-button-play)). While it is on, AUTO POWER and PENALTY are greyed out |
| **BACK** | Keeps the settings and returns to OPTIONS |

- **◀ / ▶** (or OK) change the highlighted line.
- The GAME settings apply **from the next game** — or when you choose RETRY STAGE in the pause menu.
  A game already running keeps what it started with, also in its next zones.
- The DIFFICULTY box shows the LIVES a game will really get, so with LIVES 5 it reads 5 on every
  difficulty.

### What the game remembers

| What | When it is saved | Where |
|---|---|---|
| The three volumes, the CONTROLS page (the control profile, AUTOFIRE, RATE, SOCD, DEBOUNCE), the DISPLAY page (BULLETS, SCALE, SHAKE, FLASHES, HITBOX, BOSS HP) and the GAME page (DIFFICULTY, LIVES, PENALTY, AUTO POWER, MAGNET, ONE BUTTON) | When you leave the page — or the Options screen — with BACK or Back | On the TV inside the app itself; in a browser (and the desktop app) in that browser's storage for the page |
| Your own keys and buttons (REBIND KEYS / REBIND PAD) | When you leave the rebind box with DONE or Back | The same place |
| The difficulty you chose in the DIFFICULTY box | The next time something is saved (the Options screen closing, a game ending) | The same place |
| High scores | When a run ends: the **GAME OVER** screen, or clearing the last zone (before the ending) — in a browser test stage the **STAGE CLEAR** screen, in practice its GAME OVER or zone result; the name you type afterwards when you finish it | The same place |

- **High scores**: the best ten of each kind of game are kept — each **difficulty** has its own
  tables, separately for the KESTREL and the MANTA and for **1 PLAYER**, **2 PLAYERS** and
  **PRACTICE** games; the title's `HI` (and the HUD's in a one-player game) shows the best
  one-player score of the difficulty and the ship you chose last. A score that needed continues ends
  in the number of continues used. Each row carries the **initials** typed after the game (`---`
  when none were typed) and the zone reached; the tables are shown after a high score and in the
  attract loop ([The high-score tables](#the-high-score-tables)).
- **The difficulty you chose** is remembered since the Options build: after the app is closed the
  DIFFICULTY box opens on it again. **The ship and the weapons** are not remembered: the SHIP SELECT
  box opens on the KESTREL and the WEAPON SELECT screen on TYPE A after a relaunch.
- **An older save** (from a build before the Options build) is updated by itself at the first
  launch: the volumes, the control profile, the picture settings and the high scores are kept, the
  new settings start at their start values. Two-player and practice scores that very old builds
  kept in the one-player tables move to their own tables then.
- **Only finished games count**, like in the arcade: a game you leave with QUIT TO TITLE (in a
  zone or on the ZONE MAP) or start over with RETRY STAGE is not saved. (Its score can still show
  as `HI` until you close the app.)
- Nothing needs saving when you close the app — Back → YES, Home, or even pulling the plug loses
  nothing that was already saved.
- **On the TV** games play the zone map from AZURE VERGE, so they score: a run that ends on GAME
  OVER or reaches its ending is saved (with the zone it reached), and `HI` shows it after the app
  is closed and opened again. Clearing a zone on the way does not save a score yet — the run is
  still going.
- **In a browser** each browser (and each address — the TV build on port 5174 is separate from
  the browser build on 5173) keeps its own; a private window forgets everything when it closes.
- If the saved data is ever damaged (or comes from a newer version of the game), the game simply
  starts with the default settings and no high scores — no error screen. Please report it if that
  happens without a reason.
- To start from scratch: on the TV remove the app and install it again (removing it deletes the
  saved data — [install-on-tv.md](install-on-tv.md)); in a browser clear the page's site data.

## Flying the ship

| Device | Move the ship |
|---|---|
| Samsung remote | Directional pad ◀ ▲ ▶ ▼ |
| Keyboard | Arrow keys or W A S D |
| Gamepad | D-pad or left stick (press any button once first, so the browser or TV notices the pad) |

How it should feel:

- **While the ship flies in** (the first ⅔ of a second, and again every time it comes back
  after being destroyed) it ignores the controls. That is intentional.
- **It moves the moment you press and stops the moment you let go** — no drifting, no
  acceleration. At its normal speed it crosses the whole picture in a little over four
  seconds.
- **Diagonals** (two directions at once, where the device allows it) are not faster than
  straight moves: the ship covers the same distance per second in every direction.
- **It tilts** while climbing or diving and levels out when you stop moving up or down.
- **It cannot leave the playfield.** Holding a direction stops it a few pixels before the
  edge; it never covers the top or bottom bar and never disappears off the side.
- **The gun fires by itself** — you never press a button to shoot ([Your weapons](#your-weapons)).
- **OK** (Enter or C on a keyboard, X on a gamepad) takes a power-up once you have collected
  capsules ([Power-ups](#power-ups)) — pressing it never stops or slows the ship. With FORMATION
  or ROTATE Options, **holding** it spreads them while you hold it.
- **Ch ▲** (channel up; V on a keyboard, Y on a gamepad) spreads FORMATION and ROTATE Options
  out, and pulls them back in on the next press ([Choosing your weapons](#choosing-your-weapons)).
  Nothing else needs it.
- **With the MANTA**: OK does nothing (its colour items work when you touch them), and **Ch ▼**
  (channel down; Left Shift on a keyboard, LB / RB on a gamepad) switches between its three speeds
  ([The MANTA](#the-manta-colour-items-weapons-and-the-arm)). At its middle speed — the one it
  starts with — it crosses the picture in under three seconds, noticeably faster than a KESTREL
  without Speed Ups (even its slow speed is a little faster).
- **Back** or **Play/Pause** pauses the game
  ([Pausing, quitting and the end screens](#pausing-quitting-and-the-end-screens)).

On the TV remote the ship stops about 1/30 of a second after you let go of a button — the
game waits that long to hide the remote's occasional "released and pressed again" hiccup, so a
held direction never stutters. Many remotes can only report one direction at a time, so the
ship may move in four directions only; the game is designed to be fully playable that way.

### What changed lately

**New in this build: the Options pages.** OPTIONS lists MASTER, MUSIC, SFX, then **CONTROLS**,
**DISPLAY** and **GAME**, then BACK. The control profile moved to CONTROLS (its first line,
PROFILE), and BULLETS, SCALE, SHAKE, FLASHES, HITBOX and BOSS HP to DISPLAY — they work as before.
New: AUTOFIRE and RATE, SOCD, DEBOUNCE, REBIND KEYS / REBIND PAD (your own keys and buttons, with
conflicts moved or swapped, and RESET), the INPUT TEST (hold Pause to leave it), and on GAME the
difficulty (remembered now), LIVES, PENALTY, AUTO POWER, MAGNET and ONE BUTTON — they apply from the
next game. Your saved settings and high scores from earlier builds are kept
([The Options screen](#the-options-screen)).

Before that, **the front end.** The title menu reads 1 PLAYER / 2 PLAYERS / **PRACTICE** /
OPTIONS / **SOUND TEST** / EXIT — so OPTIONS is one ▼ further down again (the fourth entry). Left
alone on `PRESS OK` for 12 seconds the title plays a silent **demo** of a zone, shows the
**high-score tables** and a short **story**, then comes back; any button returns. A high score now
asks for your **initials** (▲ ▼ letter, ▶ / OK next, ◀ / Back back, OK on END) and shows its table.
One-player, two-player and practice games keep separate tables, per difficulty and ship. PRACTICE
plays one zone from a chosen checkpoint with STANDARD or FULL POWER; the SOUND TEST plays every tune
and sound. The CONTINUE? box has a draining time bar and a `PRESS OK` prompt. The zones play as
before ([The front end](#the-front-end-attract-mode-high-scores-practice-and-the-sound-test)).

Before that, **the advanced bosses.** The Options screen has one more entry under HITBOX —
**BOSS HP** (OFF / ON) — so BACK is one entry further down. With BOSS HP on, every boss fight
shows `BOSS` and a red bar of the boss's remaining strength in the top bar, where `HI` usually is
— on the TV too, for HALCYON BULWARK ([The boss HP bar](#the-boss-hp-bar-every-device)). And four
new browser test stages show the boss variety of the later zones
([The advanced boss ranges](#the-advanced-boss-ranges-browser-only)): the *Captain Range*
(`?stage=captain-range` — four **mid-bosses** that fight while the screen keeps scrolling), the
*Raid Range* (`?stage=raid-range` — **IRON LEVIATHAN**, a battleship longer than the screen that the
view flies around while its turrets turn to aim at you; its reactor's explosion releases a second
boss, and if you take longer than 90 seconds it **escapes**), the *Twin Range*
(`?stage=twin-range` — two bosses that **take turns**, the survivor getting angry) and the
*Gauntlet Range* (`?stage=gauntlet-range` — three bosses in a row). AZURE VERGE plays as before.

Before that, **picture options and SNES-style effects.** The Options screen has four new
entries under BULLETS — **SCALE** (INTEGER, FIT or STRETCH: how the picture fills the screen),
**SHAKE** (ON / OFF), **FLASHES** (NORMAL / REDUCED) and **HITBOX** (OFF / ON: a marker on your
ship's weak spot) — so BACK is now four entries further down. They work at once, over a paused
game too, and are remembered ([The Options screen](#the-options-screen)). The **Mega Crash** flash
now brightens the whole picture for a moment instead of covering it with white, so your ship and
the bullets stay visible. On a **120 or 144 Hz** PC monitor the ship, the enemies and the
scrolling now glide more smoothly (on the TV, which shows 60 pictures a second, nothing changes).
And a new browser test stage, the *Raster Range* (http://localhost:5173/?stage=raster-range),
shows the picture effects the later zones will use: a sea that waves and whose colours roll, a
checkered floor that races to the horizon, and heat haze over the stars
([The Raster range](#the-raster-range-browser-only)). AZURE VERGE looks and plays as before.

Before that, **the stage mechanics of the later zones (browser only).** A new test stage,
the *Gimmick Range* (http://localhost:5173/?stage=gimmick-range), shows what the coming zones will
be built from: **bricks you can shoot through** (four hits each, 10 points), pink **walls that
grow back** a few seconds after you break them (never onto your ship), **rocks** that hang from
the ceiling and drop when you come near, **bubbles** that split in two when shot, a **volcano**
lobbing glowing stones, a **suction pod** that drags your ship towards it, **tentacles** on a chain
that lunge at you, a **cube rush** whose cubes stick to the rock and build walls, **moving blocks**
that are as solid as the rock, a **stop** where the view pans down into a dip, a **fork**: flying
through the bottom of the dip changes which enemies come next, and a **very fast** stretch.
Losing a ship on ARCADE (or continuing) brings back every broken brick. Nothing changed in AZURE
VERGE, and on the TV the stage cannot be chosen yet. See
[The Gimmick range](#the-gimmick-range-browser-only).

Before that, **two players at once.** The title menu now reads **1 PLAYER** (what START
used to be), **2 PLAYERS**, OPTIONS and, on the TV, EXIT — so OPTIONS is one ▼ further down. With
2 PLAYERS the game starts with player 1, and a second player **joins at any time** by pressing
START on a gamepad (in a browser also Enter on the new **SPLIT KEYBOARD** control profile, which
puts two players on one keyboard); player 2's ship is the same ship in red-orange and gold. Each
player has their own ships, score, power-ups and continues: a player who loses their last ship
comes back with START while the other plays on, and the game is over only when both are out. The
bottom bar splits into two halves while both play, and the GAME OVER and STAGE CLEAR screens show
both scores. Also new: a gamepad now controls **player 1** in the menus and in one-player games,
whichever gamepad it is (before, the second gamepad was always player 2). See
[Two players](#two-players).

Before that, **the second ship, the MANTA.** After the DIFFICULTY box a new **SHIP SELECT**
box asks which ship to fly — so starting a game with the KESTREL takes one more OK (the KESTREL is
highlighted, so OK goes straight on to the WEAPON SELECT screen). The **MANTA** plays the other
classic way: it has no power meter, and the enemies that leave capsules leave **colour items**
instead — **red** makes the main gun stronger, **green** the sub-weapon (each through nine
levels: missiles that turn into ever bigger discs, or lasers that turn into waves passing through
enemies — the red **octagon** switches between the two), **blue** puts up the **Arm**, a shield
that grows from green (3 hits) to silver (4) and gold (5) and even protects against the rock,
**orange** gives an extra ship and **yellow** destroys every enemy on the screen. Items drift
across the screen and vanish after ten seconds, OK does nothing, and **Ch ▼** on the remote
switches between the MANTA's three speeds. The bottom bar shows its levels as rows of small
squares. The MANTA keeps its own high scores. In a browser the new *Direct Range*
(`?stage=direct-range`) sends in waves of six violet cubes closing in from the top and the bottom.
See [Choosing your ship](#choosing-your-ship), [The MANTA](#the-manta-colour-items-weapons-and-the-arm)
and [The Direct range](#the-direct-range-browser-only).

Before that, **Option types, more shields, the Option Hunter and the blue capsule.** The
WEAPON SELECT screen has a new line, **OPTION**: besides the classic **TRAIL**, the Options can
fly as a **SNAKE** (a chain that swings behind the ship and keeps its shape when you stop), in a
**FORMATION** (a `>` behind the ship that spreads into a `V`) or **ROTATE** round the ship — spread
FORMATION and ROTATE out with **Ch ▲** on the remote (or by holding OK). **? SLOT** now offers
five shields: the **FORCE FIELD**, the **SHIELD** (two pods at the nose that stop what touches
them, 14 hits each), the **FREE SHIELD** (pods on the side you last moved towards — take `?` again
for a second pair), **ROTATE** (two pods circling the ship) and **REDUCE** (the ship's weak spot
shrinks). In the browser's new *Hunter Range* a violet, armoured **Option Hunter** announces
itself with an alarm, lines up with your ship and dives through your Options — those it touches
are carried off, grey, behind it; set it off with a **Mega Crash** (or the rare **blue capsule**,
which destroys every enemy on screen) and the stolen Options drift free for you to catch again.
AZURE VERGE itself has no hunters and no blue capsules yet. See [Choosing your
weapons](#choosing-your-weapons), [Power-ups](#power-ups) and [The Option Hunter
range](#the-option-hunter-range-browser-only).

Before that, **four weapon types and the WEAPON SELECT screen.** After the DIFFICULTY box a
new screen lets you choose the ship's weapons before every game — so starting a game takes one
more OK (START is highlighted, so OK goes straight on). Besides the classic **TYPE A** (Missile,
Double, Laser) there are **TYPE B** (a Spread Bomb that bursts into a blast, a Tail Gun that fires
backwards, the growing rings of the Ripple Laser), **TYPE C** (a 2-Way Missile, a Vertical shot
straight up, the thick swirling Cyclone Laser) and **TYPE D** (a Photon Torpedo that ploughs
through small enemies, a Free Way shot that follows your last direction, the paired beams of the
Twin Laser) — or **EDIT** to mix the three weapons from all four types. The same screen chooses
what the `!` box does (the Mega Crash, or NORMAL, SPEED DOWN, LIFE OPTION — spare ships become
Options — and FULL BARRIER), turns **Auto Power-Up** on and sets its **order**. A live preview flies
your choice behind the menu, and in the game the power meter names its boxes after your weapons.
See [Choosing your weapons](#choosing-your-weapons).

Before that, **bullet colours for colour-blind players, and points for cancelled bullets.**
OPTIONS has a new line, **BULLETS**: besides the standard pink / red / purple, three colour sets
made for the common kinds of colour blindness (DEUTERANOPIA, PROTANOPIA, TRITANOPIA), with the
bullets' centres shape-coded (solid, ring, dot) so the three kinds of bullet can be told apart
without colour at all; the choice changes the picture at once and is remembered like the volumes
([The Options screen](#the-options-screen)). And when a boss is destroyed or you set off a **Mega
Crash**, every enemy bullet on the screen still twinkles away but also leaves a small **gold
diamond** that drifts for a moment and then flies up into your score in the top bar, adding **10
points** each — clearing a crowded screen now pays ([The score](#the-score)). Losing your own
ship still only makes them twinkle. Behind the scenes the game can now describe enemy attacks as
data — patterns of bullets that turn, speed up and split on their own — and has **bending
lasers**, long glowing snakes that curve after your ship; no enemy in AZURE VERGE uses them yet
(the later zones will), so the zone plays as before.

Before that, **difficulties, extra ships and continues.** START now opens a **DIFFICULTY**
box — EASY (five ships, five continues, slower bullets, a loss only takes the Force Field), NORMAL
(as before, plus three continues), HARD, and ARCADE (two ships, no continues, a loss sends you back
to the last checkpoint without your power) — so a game starts with one more OK. The game now gets
**harder as your ship gets stronger** (and easier again when it loses power), and at a high rank
the amber fan fliers of AZURE VERGE fire a last bullet when they are destroyed. Scores of 20,000,
90,000, 160,000 … points give an **extra ship** with a "1UP" jingle (at most nine). When the last
ship is lost with continues left, a ten-second **CONTINUE?** countdown lets you carry on from the
last checkpoint with fresh ships; the score's last digit then counts your continues. Each
difficulty keeps its own high scores. See
[Difficulty, extra ships and continues](#difficulty-extra-ships-and-continues).

Before that, **version 0.1.0 — the end of the first milestone — and developer tools.**
The game itself played exactly as before. What was new was behind the scenes: a **debug build** of
the TV app (`pnpm --filter @shmup/tizen build:dev`) that opens a measuring panel when you press
**Play/Pause and then Channel up three times** on the remote — frames per second, how long each
frame takes, a graph of the last second's frames, the start-up time, outlines of every hit area,
an invincible mode, a freeze with single steps, slow motion, and jumps to the next checkpoint or
the boss — and the **M1 release check**, the list of things to confirm on both monitors before
the milestone counts as done. The normal build has none of these tools. In a browser `pnpm dev`
has them on the F1–F8 keys. Behind the scenes the game can now also record a whole game as a
list of button presses and play it back exactly, which is how every change to the code is now
checked against four recorded runs of AZURE VERGE. See [debug-tools.md](debug-tools.md).

Before that, **the first real zone, AZURE VERGE, with its boss — on the TV too.** Until
now START flew in empty space on the TV and the desktop; the test stages could only be opened in a
browser. Now **START plays AZURE VERGE on every device**: about three minutes in five parts —
rows of pods and red saucers to get started, groups of new amber fan fliers and dashing
arrowheads, a long cave with turrets on its floor and ceiling, walkers and hatches, a fast stretch
with new teal ring spinners, a calm with two last capsules — then the **WARNING** and **HALCYON
BULWARK**, an armoured battleship whose four shield plates guard its core and whose two emitters
fire laser rows that move with it. Everything is made to be dodged with single arrow presses; a
test program that plays like a remote player (never two arrows at once) clears the whole zone.
The zone's music (AZURE VERGE, then BULWARK ASSAULT for the boss) now plays on the TV too, and on
the TV scores are now saved like in the browser. In a browser, `?skip=boss` starts a game right
before the boss. See [The first zone: AZURE VERGE](#the-first-zone-azure-verge).

Before that, **the Options screen, and the game remembers.** **OPTIONS** — greyed out until
then — works on the title and in the pause menu: three volume sliders (MASTER, MUSIC, SFX, from 0 to
10) that change the sound the moment you press ◀ / ▶, and **CONTROLS**, the control profile —
on the TV **SAFE 4-WAY** (the default, with the hiccup protection) or **FAST 8-WAY** (without it),
in a browser KEYBOARD or KEYBOARD AS REMOTE — which also takes effect at once. **BACK** keeps the
settings, and the game now **remembers** them after it is closed, together with your **high
scores**: every game that ends on the GAME OVER or STAGE CLEAR screen is saved, the title's `HI`
shows the best score kept on this device, and a new best gets **NEW HI-SCORE** on the GAME OVER
screen. See [The Options screen](#the-options-screen) and
[What the game remembers](#what-the-game-remembers).

Before that, **the title screen, the menus, the HUD and the pause menu.** Until then every
build started straight in the game ("free flight"). Since then it starts on a **title screen**
with the SHMUP CUP logo and its own music; OK opens a small menu, and **START** begins the game.
The top bar shows your score, the best score (`HI`) and the second player's slot; the bottom bar
your spare ships, the **power meter** — the seven boxes that show which power-up OK takes, the
highlighted one blinking, the ones you cannot take right now greyed out — and the Force Field's
strength. **Back** (or Play/Pause) **pauses** the game on the TV instead of closing the app:
RESUME, RETRY STAGE or QUIT TO TITLE. Losing the last ship shows a **GAME OVER** screen and
returns to the title; finishing a stage shows **STAGE CLEAR** and `TO BE CONTINUED`. And on the
TV, Back on the title asks **EXIT SHMUP CUP?** — only YES closes the app. See
[The title screen and the menus](#the-title-screen-and-the-menus) and
[Pausing, quitting and the end screens](#pausing-quitting-and-the-end-screens).

Before that, **sound and music.** Everything that happens now makes a sound: your shots
(a short blip, the missiles a lower one), hits on enemies, clinks on armour, explosions of three
sizes, the capsule ding, the power-up trill and a "no" buzz when OK has nothing to give, the
Force Field's hits and break, the Mega Crash, the loss of your ship, and the boss's explosions.
Sounds come from where they happen — from the left speaker on the left of the screen, from the
right on the right. The **WARNING** now wails a siren three times. In the browser stages the
first **music** plays: the stage theme (AZURE VERGE) starts with a short intro and then loops
without a gap; the WARNING fades it out, the boss brings its own theme (BULWARK ASSAULT), and
after the boss a short stage-clear tune (VERGE SECURED) plays. When your ship is lost the music
goes quiet for a moment. All of it is original placeholder sound made by the game itself. **In a
browser the sound starts only after your first key press or click** (browsers do not allow sound
before that; a gamepad button does not count). **On the TV** you hear the shots from the start
(the title music came with the title screen). See [Sound and music](#sound-and-music).

Before that, **explosions, sparks, screen shake, flashes and score numbers.** Until now a
destroyed enemy simply vanished. Now it bursts into a fireball bigger than itself (bigger enemies
throw out grey chunks of debris too), a hit on an enemy that survives throws small sparks, shots
that bounce off armour spark back towards you, and the points of every kill rise from the spot
as a small white number (a completed formation's bonus in gold). Losing your ship ends in a big
explosion and a short **screen shake**; a **Mega Crash** flashes the screen white; each capsule
you collect makes a cyan ring flash around your ship; cancelled enemy bullets turn into small
twinkles. The boss's WARNING now darkens the playfield and pulses red, and the boss dies in a
two-second chain of explosions ending in a big white blast with a strong shake and a gold
20,000. On the TV and the desktop (free flight) the only new thing is the tiny spark at the
ship's nose with every shot. In a browser, the new **effects gallery**
(http://localhost:5173/?scene=fx-gallery) shows every explosion and screen effect one after the
other. See [Explosions, sparks, shake and flashes](#explosions-sparks-shake-and-flashes).

Before that, **the first boss and its WARNING.** In a browser, the new *Boss Range* stage
(http://localhost:5173/?stage=test-boss) scrolls for about five seconds, then the scrolling
slows to a stop and a **WARNING** band fills the middle of the picture for three seconds —
`WARNING!!`, the boss's name and its code, flashing red and yellow. Then the **TRIAL WARDEN**, a
test boss made of several parts, glides in from the right. You cannot hurt it until it has
arrived; then its armour blocks stay unbreakable, its two shield plates must go before its
glowing core can be hit, its two guns can be shot off, and it changes its attack twice as it
takes damage — the last one with **lasers**, the first long beams in the game. When the core is
destroyed every bullet vanishes, the boss blinks and disappears, 20,000 points are added and the
stage scrolls on. See [The boss range and the WARNING](#the-boss-range-and-the-warning-browser-only).
The siren and the boss music came with the sound build.

Before that, **lives, losing your ship and the score.** In the *Test Range* stage (browser
only) the KESTREL can now be destroyed: flying into the rock or an enemy, or being hit by an enemy
bullet, costs a ship. The game freezes for a split second, the ship vanishes (its explosion and
the screen shake came with the build after), every enemy bullet on screen disappears, and
after about a second and a half it flies in again from the left, **blinking** — while it blinks
(about two and a half seconds after it is back under your control) nothing can hurt it, and it
keeps firing. Each loss takes one of the spare-ship icons in the bottom bar and one step of your
power (below); after the last ship the top bar says **GAME OVER** in red. And the **score**
counts now: every enemy you destroy, every completed formation and every capsule adds points to
the number next to `1P`, and `HI` on the right shows the best score of the session (saved
between launches since the Options build). See
[Lives, losing your ship and the score](#lives-losing-your-ship-and-the-score). On the TV and the
desktop (free flight: no enemies, no rock) nothing can hit the ship, so only the new `HI` in the
top bar is visible there.

Before that, **power-ups.** In the *Test Range* stage (browser only), the red saucers and
every formation you destroy completely now leave a blinking **power capsule**. Fly into it (it
drifts into the ship once you are close) and press **OK** — Enter or C on a keyboard — to take
the power-up the capsules have earned you: Speed Up, Missile, Double, Laser, an extra Option, a
**Force Field** that takes five hits, or the **Mega Crash** that wipes the screen. The power meter
that shows which one is highlighted was not drawn yet then (it came with the HUD) — the
[Power-ups](#power-ups) section has the table. `?loadout=full` now also starts with a Force
Field. On the TV and the desktop (free flight, no enemies) there are no capsules yet, but OK is
now a game button there too.

Before that, **your ship learned to shoot.** Everywhere — on the TV, in the browser and on the
desktop — the KESTREL's gun fires **on its own** once the ship has flown in: small darts,
at most two on screen at a time, like the classic games this one follows. No button is needed
(the TV remote has none to spare). In the *Test Range* stage the shots destroy the enemies: an
enemy that takes more than one hit flashes white each time, and one that is destroyed
disappears (the explosions and the score counter came with later builds). In a browser
you can also start **fully powered** with `?loadout=full`: a faster ship, a long piercing
**laser** instead of the darts, **missiles** that drop to the ground and slide along it, and
four glowing **Options** that follow your ship and fire everything it fires
([what to look for](#your-weapons)). As before, the stage and the fully powered ship can only
be opened in a browser; the TV and desktop builds start in free flight, where the ship now
shoots into empty space.

And before that: **enemies that shoot back** — gun turrets firing single pink bullets straight at
your ship, walkers firing fans of three red bullets, looping spinners sending out rings of
eight purple bullets ([what to look for](#enemy-bullets)); being hit by a bullet still does
nothing (it just disappears); **the first enemies** — rows of small pods weaving on a wave, spinners that fly
loops one behind the other, red saucers, gun turrets on the ground and hanging from cave
ceilings, walkers that stroll along the rocky slopes, hatches that open and release small
fighters, and fighters that stop, aim and dash at you ([what to look for](#enemies-in-the-test-stage));
**scrolling stages** — the view scrolls along a scripted path, speeding up and
slowing down, over rocky floors and caves drawn from small tiles, with star layers moving
behind at their own speeds; and before that the ship came **under your control**, and free
flight replaced the sprite showcase as the start-up picture. The simulation behind it is the real
game engine: every build added to this world, and version 0.1.0 completes its first playable
slice. Next comes the complete game — difficulty levels, more weapons and ships, two players,
more zones.

**Please re-test on the monitors:** new since the last build is the **WEAPON SELECT** screen
(checks 31–35) — please say whether it is quick to use with the remote's arrows and OK alone,
whether its panel and the AUTO ORDER box are readable from the sofa, whether the live preview
behind the panel shows each weapon clearly, and how the new weapons feel against the enemies and
the boss (which type you liked, and whether any weapon felt useless or too strong). Still worth
answering from the build before: **BULLETS** and the **points for cancelled bullets** (checks
29–30) — whether each colour set keeps the three kinds of bullet easy to tell apart from the sofa,
and whether the gold diamonds read clearly. Otherwise, as
before, this time with the **debug build**, and run the **M1 release
check** in [debug-tools.md](debug-tools.md#the-m1-release-check) on both monitors — start-up
time, picture, remote-only play through AZURE VERGE, leaving and returning, sound, what is kept
after closing and after an update, 15 minutes of play with no hitches in the frame graph, other
controllers. Quote the build id shown in the panel. The checks in the next section give the
detail — how the ship and the menus respond to the remote is still the most valuable report.
Since the last build, **AZURE VERGE** itself (checks 19–24) is on the TV: please play it through with the
remote — several times if you can — and tell us whether every bullet and every laser could be
dodged with single arrow presses (note the time into the stage where one could not), whether the
scrolling stays smooth (also in the fast part), whether taking power-ups with OK feels natural
during the action, whether the boss is fair, and how many ships you lost and where. Still worth
answering: the **Options screen** and **settings that are kept after the app is closed**
(checks 16–18): please say whether the volume steps feel even and the MUSIC and SFX
sliders change what they should at once, whether the settings are still there after Back → YES
and opening the app again, and — the most useful answer — whether the ship still moves smoothly
with **FAST 8-WAY** (no hiccup protection) on your remote. Still worth answering: the **title
screen, the menus and the pause menu** (checks 12–15):
please say whether moving through the menus with the arrows and choosing with OK feels quick and
reliable (never a skipped or doubled move), whether **Back** pauses the game and gets you back
out of every screen as you expect, whether the **EXIT SHMUP CUP?** question appears before the
app closes, and whether the new **HUD** — the top bar's three scores and the bottom bar's power
meter — is complete and readable from the sofa (check 2). **Sound** (check 11): every shot should
be heard the moment it leaves the ship — please say whether the sound feels immediate or lags
behind the picture, and whether it ever crackles, stutters or drops out. **Whether pressing OK
while you hold an arrow stops the ship** (check 9) still needs answers — it matters more now that
there are capsules to take on the TV. On a PC — or in the monitor's own web browser, pointed at
the PC (see [In a desktop browser](#in-a-desktop-browser)) — AZURE VERGE plays the same;
`?skip=boss` takes you straight to the boss to try it again and again. Please also report anything
from [the sound checklist](#sound-and-music): in particular whether you can hear the **loop point**
of the stage theme (about 51 seconds after the game started the music jumps back to just after
its intro — it should sound like one continuous piece), whether some sound is missing, cut off or
much too loud or quiet, and whether the siren and the music changes around the boss come at the
right moments. The [effects checklist](#explosions-sparks-shake-and-flashes) (explosions never
hiding a bullet, a comfortable shake and flash) and the
[boss range's own checklist](#the-boss-range-and-the-warning-browser-only) (readable WARNING,
dodgeable bullets and lasers, clear weak points) are still worth a run. The test stage
(`?stage=test-range`, normally and fully powered) is still worth a run for its checklists (the
rock, the enemies, their bullets, your weapons, the power-ups, losing a ship): does every bullet
pattern dodge with single arrow presses, does the blinking after a loss give you enough time to
get clear, and does collecting capsules and pressing OK feel natural with the remote's buttons
(try `?profile=keyboard-remote-emulation`, which moves like the remote and uses Enter as OK)?

The game data and the sprite sheet travel **inside** the app (the sprite sheet is a small
picture file packed into the same `.wgt`, in its `assets/` folder). There are no extra files
to copy to the monitor or to a USB stick — installing the `.wgt` (or opening the browser
build) is all it takes, and the TV never needs a network connection to load it.

## The first zone: AZURE VERGE

**Every game plays AZURE VERGE** — on the TV, in a browser and on the desktop. It is the first real
level of the game: about three minutes of scrolling in five parts, then the **WARNING** and the
zone's boss, **HALCYON BULWARK**. Everything in it is an original placeholder made for this
project (names, pictures, music). Times below count from the start of the game (about):

| Time | What happens |
|---|---|
| 0–35 s | **Getting started.** The view scrolls gently over low rolling ground along the bottom; far behind, the rim of a **blue planet** fills the bottom of the picture, drifting very slowly. Rows of small **green pods** weave through (the first about 3 s in), **red saucers** drift across at about 8 s, 16 s and 27 s (each leaves a power capsule when you shoot it down), and at 24 s and 30 s long **wavy chains** of pods ripple through (they never leave a capsule) |
| 35–75 s | **Fans and dashers**, in open space: groups of five or six **amber swept-wing fliers** swing in along arcs, loops and swoops, one behind the other (destroy a whole group for a big bonus and a capsule); pairs of **arrowhead fighters**, one high and one low, stop, aim and dash at you; a few more saucers |
| about 66 s | Rock comes into view on the right — the ground below **and** a ceiling above: a long **cave** |
| 75–145 s | **The cave.** The scrolling slows down. **Gun turrets** stand on the floor and hang from the ceiling, **walkers** stroll along the floor, two **armoured hatches** release small fighters, and saucers keep bringing capsules. The cave is always wide enough to fly through — but touching the rock costs a ship |
| about 145 s | **High speed.** The cave ends and the scrolling speeds up to twice its normal pace over low ground, for about 20 seconds: **teal ring spinners** fly wide loops sending out rings of bullets, more fans, a pair of arrowhead fighters, three saucers |
| about 168 s | **The calm.** The scrolling eases off; two last red saucers — the capsules for the boss fight — and nothing else. No rock any more |
| about 3:00 | **The WARNING.** The scrolling slows to a stop, the playfield darkens and pulses red three times with the siren, the music fades, and the band reads `WARNING!!` · `GIANT HOSTILE "HALCYON BULWARK"` · `CLOSING IN - CODE HB-01` for three seconds |
| about 3:03 | The boss glides in from the right (it cannot be hurt until it stops, about 2½ seconds later) and its theme starts. The stage waits until it is destroyed |

**The enemies of AZURE VERGE** (the pods, saucers, turrets, walkers, hatches and arrowheads look
like the test stage's; the fan fliers and ring spinners are new):

| Enemy | Hits to destroy | Points | Shoots? |
|---|---|---|---|
| Green pod (rows and wavy chains) | 1 | 100 | No |
| Amber fan flier (groups on curved paths) | 1 | 100 | No |
| Arrowhead fighter (stops, aims, dashes at you) | 1 | 150 | No — it rams |
| Small fighter from a hatch (rises, then dashes) | 1 | 50 | No — it rams |
| Red saucer (always leaves a capsule) | 3 | 200 | No |
| Walker (cave floor) | 2 | 200 | A fan of three **red ovals** each time it stops |
| Gun turret (cave floor or ceiling) | 3 | 300 | One **pink round** bullet aimed at you about every two seconds |
| Teal ring spinner (high-speed part) | 4 | 400 | A **ring of eight purple** bullets every two and a half seconds |
| Armoured hatch (cave floor) | 8 | 500 | No — it releases up to four small fighters, one every second and a half |
| A whole group of pods or fan fliers | — | 300 to 1,000 bonus (+ a capsule) | — |

No enemy bullet in this zone crosses the whole picture in less than about four seconds, so every
one can be side-stepped with the arrow buttons alone.

**Capsules.** Across the zone 28 red saucers and complete groups leave a capsule — at least three
within about half a minute after the start, after the cave's entrance and after the high-speed
part begins, so a ship lost there can soon be powered up again — and two come in the calm right
before the boss.

### HALCYON BULWARK (HB-01)

A big armoured battleship that holds the right part of the screen:

| Part | Looks like | What your shots do |
|---|---|---|
| **Hull and wings** | A big dark-blue armoured hull on the right, with a long wing reaching forward above and one below | Nothing, ever — shots vanish on them (a small spark bounces back) |
| **Laser emitters** | A glowing blue emitter at the front tip of each wing | Nothing: they are armour too, so the lasers never stop |
| **Shield plates** | Four light-blue plates in a row in front of the core, at its height | 12 hits each; the outermost (leftmost) one takes the shots first. 500 points each |
| **Core** | The glowing, pulsing cyan eye at the front middle, behind the plates | Nothing while any plate stands; then 40 hits. Destroying it destroys the boss (5,000 points) |

**How it fights.** It slowly follows your ship's height up and down, and its lasers come from the
two emitters — never from the core, which sits between them:

| When | What it does |
|---|---|
| From the start | Every two seconds or so one emitter — top and bottom taking turns — fires a **laser** straight to the left across the screen along its row: first a thin **blinking warning line** for about ¾ of a second, then the beam for a little under a second. Only the beam hurts. The laser **moves up and down with the boss** while it follows you |
| After two plates are destroyed | It follows you a little faster, and each emitter also fires a fan of three **purple needles** at you every two seconds |
| After all four plates are gone (the core can be hit) | A laser every second or so, each lasting a bit longer, so often **both** rows are closed at the same time — the space between them, level with the core, always stays open. Needles every second and a half |

**Tip:** stay level with the core — that is where your shots must go anyway, and the lasers then
pass above and below you. When a warning line blinks across your row, step up or down out of it
before the beam comes.

**When the core is destroyed** everything happens as with the test boss: every bullet and laser
disappears — each bullet leaving a gold diamond that flies to your score (+10 each) — the boss blinks and explodes for two seconds, a big white blast with a strong shake,
**30,000 points** (a gold `30000`), the stage-clear tune, your ship flies off to the right, and a
few seconds later the **ZONE A CLEAR** result and then the **ZONE MAP** ([The zone map: a run
through nine zones](#the-zone-map-a-run-through-nine-zones)).

**In a browser you can go straight to the boss:** http://localhost:5173/?skip=boss starts every
zone (and RETRY STAGE) about two seconds before its WARNING — so a whole run is five boss fights
in a row — add `&loadout=full` to fight them fully powered. The normal TV build has no such shortcut: play through the zone (three
minutes) — or use the debug build's key 8 ([debug-tools.md](debug-tools.md)).

What "good" looks like:

- The scrolling is smooth everywhere — slow in the cave, fast in the high-speed part — with no
  jumps or stutters, and the planet and the stars move steadily behind.
- The cave never closes: there is always a gap to fly through, and every enemy on its floor or
  ceiling stands exactly on the rock.
- Every bullet, every group of needles and every laser can be dodged with **single arrow
  presses** (no diagonals) — please report the time into the stage of any spot where you could not
  get out of the way.
- The capsules come often enough that a lost ship can be powered up again soon after.
- The WARNING text is complete and readable; the boss's parts always stay together; the plates
  flash white when hit and burst when destroyed; the core only reacts once all four plates are
  gone; each laser always blinks as a warning line first.
- The whole zone, boss included, takes about three and a half minutes when nothing goes wrong.

## The zone map: a run through nine zones

A game is a **run** from zone A to one of two final zones. The zones form a diamond — after A you
choose B or C, then D or E, then F or G, then H or I — so every run is **five zones** long and
there are **16 different routes**:

```
          B ── D ── F ── H
        ╱   ╲ ╱  ╲ ╱  ╲ ╱
      A      ╳    ╳    ╳
        ╲   ╱ ╲  ╱ ╲  ╱ ╲
          C ── E ── G ── I
```

| Zone | Name | For now |
|---|---|---|
| A | AZURE VERGE | The real zone ([above](#the-first-zone-azure-verge)) |
| B | BRINE NEBULA | **The real zone** — bubbles, a reef tunnel, the mid-boss SPUME HERALD, the boss GALVANIC MAW and a secret bonus stage ([below](#zone-b-brine-nebula)) |
| C | DUNE EXPANSE | **The real zone** — sand worms, a canyon with beetles on its ceiling, the boss SANDGRAVE WIDOW ([below](#zone-c-dune-expanse)) |
| D | MAGMA DEEP | **The real zone** — volcanoes, a dive into the caves, a brick maze, a lava river, the boss CINDER BASTION ([below](#zone-d-magma-deep)) |
| E | TEMPEST RIDGE | **The real zone** — a storm over jagged peaks, enemies from behind, the boss SQUALL STEED ([below](#zone-e-tempest-ridge)) |
| F | CELL VAULT | **The real zone** — chasing and dividing cells, tissue walls that grow back, grabbing tentacles, the boss MANTLE REGENT ([below](#zone-f-cell-vault)) |
| G | PRISM LABYRINTH | **The real zone** — crystal walls, a rush of cubes that build walls, the boss FACET MONARCH and a secret bonus stage ([below](#zone-g-prism-labyrinth)) |
| H | IRON CITADEL | **The final zone** of the upper route — hatches, moving floors and ceilings, laser emitters, a parade of four earlier bosses, the boss IRON SOVEREIGN ([below](#zone-h-iron-citadel)) |
| I | ABYSSAL THRONE | **The final zone** of the lower route — depth mines, trench eels, the battleship ABYSS ARK (the view flies along it; it escapes if you take too long) and THE HOLLOW KING inside it ([below](#zone-i-abyssal-throne)) |

Every zone is a real zone now, each about three and a half to four and a half minutes long with
its own music — a whole run of five zones takes about twenty minutes.

**A zone, start to end:**

1. **Launch.** Your ship flies in from the left as before, and for about 2½ seconds a dark band
   near the top shows **ZONE B** in yellow over the zone's name.
2. **The zone** scrolls by, ending with the WARNING and the boss.
3. **Fly-out.** When the boss is destroyed, your ship (and a second player's) stops answering the
   controls and speeds off to the right until it is out of the picture — it cannot be hit and does
   not fire meanwhile. Its Options follow it out.
4. **Zone result** (about 1½ seconds later, over the empty playfield): **ZONE B CLEAR**, the
   zone's name, your score (`1P` and `2P` in a two-player game), **KILLS** — the share of the zone's
   enemies you shot down, in percent —, the **KILL BONUS** (100 points per percent: 10,000 for all
   of them) and the **TIME BONUS** (100 points for every second the boss fight took less than 90
   seconds; `NO BOSS TIME` when no boss was destroyed). Both bonuses are added to the score of
   every player still in the game — you can see the score jump — and can earn an extra ship. After
   five seconds, or **OK**, the map opens.
5. **The ZONE MAP.** The music fades out. The top says **ZONE MAP** and `CHOOSE YOUR COURSE`;
   the zones are small boxes with their letters, left to right, joined by dotted lines. The zones
   you have flown are lit, the one you just cleared is yellow, and the two you can go to next have
   a white outline — the chosen one blinks yellow, and so does the dotted line to it. The panel at
   the bottom shows the chosen zone's letter and name and two lines about it, and
   `UP/DOWN: CHOOSE  OK: LAUNCH`.
   - **▲ / ▼** choose between the two next zones (holding repeats; from the last it wraps round).
   - **OK** launches: `LAUNCH` blinks for a second while the game gets the next zone ready, then
     that zone starts with its title card.
   - **Back** asks **QUIT TO TITLE?** — NO (highlighted) goes back to the map, YES ends the run
     (the score is not saved).
6. After **H or I** there is no map: the **ending** follows the zone result.

**What carries over from zone to zone:** your score (and the best score), your spare ships, the
power-ups you have — the weapons, the Options, the shield and how many hits it has left, your
speed, where the power meter's highlight is (the MANTA: its weapon levels, its Arm and its weapon)
—, and the continues you have used. A ship that was just lost when the zone ended flies into the
next zone blinking; a player who had no ships left stays out (and may continue). In a **2
PLAYERS** game, a second player who has not joined yet can still join in any zone. The game also
gets a little harder with every zone you clear.

**The ending.** After the final zone's result the **ending scene** plays — the citadel falling
behind your ship, or your ship rising out of the deep — with a short story, then a full-screen card
shows **ENDING** and the name of the ending your run earned, your **ROUTE** (for example
`A B D F H`), your score, a line for each thing you managed — **NO MISS** (no ship lost in the whole
run), **NO CONTINUE**, **BONUS STAGE CLEARED**, and **A BOSS ESCAPED** if the ABYSS ARK got away —
and **THANK YOU FOR PLAYING**; then the **credits** scroll and the title comes back. Everything
about them is in [The endings and the credits](#the-endings-and-the-credits). Which ending you get
depends on the route and the run:

| Final zone | Ending | When |
|---|---|---|
| H | THE CITADEL FALLS SILENT | No ship lost in the whole run |
| H | THE CITADEL FALLS | Otherwise |
| I | THE DEEP IS STILL | No ship lost in the whole run, and the ABYSS ARK did not escape |
| I | THE FLAGSHIP SLIPS AWAY | The ABYSS ARK escaped (even with no ship lost) |
| I | THE THRONE IS BROKEN | Otherwise |

The run's score is saved (with the zone it reached) when the final zone is cleared or on the
GAME OVER screen ([What the game remembers](#what-the-game-remembers)). A **game over** in any
zone works as before: CONTINUE? (if you have continues) carries on at the zone's last checkpoint.

**Quicker ways through (browser):** http://localhost:5173/?skip=boss starts every zone just
before its WARNING, so a run is five boss fights (add `&loadout=full`); the debug build's key 8
(or the remote's unlock sequence — [debug-tools.md](debug-tools.md)) jumps to the boss in any
zone. `?stage=zone-b` … `?stage=zone-i` plays one zone on its own (like a test stage, without the
map) — `zone-b` and `zone-c` are the real BRINE NEBULA and DUNE EXPANSE, `zone-d` and `zone-e` the
real MAGMA DEEP and TEMPEST RIDGE (with `&skip=boss`, MAGMA DEEP starts down in the caves), `zone-f`
and `zone-g` the real CELL VAULT and PRISM LABYRINTH, `zone-h` and `zone-i` the finales IRON
CITADEL and ABYSSAL THRONE (with `&skip=boss`, IRON CITADEL starts just before its **parade**, not
its last boss; played alone they end on STAGE CLEAR — the ending and the credits need a whole run),
and `?stage=brine-grotto` and
`?stage=glimmer-cache` play the secret bonus stages of zones B and G.

What "good" looks like:

- The title card is readable and disappears after about 2½ seconds; it never shows in the
  browser's test stages.
- After each boss, every ship flies out smoothly to the right — no ship is hit or lost after the
  boss has gone.
- The zone result's numbers add up: the score after it is the score before plus the two bonuses.
- On the map, ▲ / ▼ always move between exactly the zones the dotted lines lead to from the yellow
  zone; the lit path matches the zones you flew; the text in the panel belongs to the blinking zone.
- OK on the map starts the chosen zone after about a second, with its **music** from the start of
  the zone — no silence, no zone A title music. After an ending (or a game over) and a new game,
  zone A's music plays again as normal.
- Score, ships and power-ups are the same after the map as before it.
- All 16 routes can be finished; each ends with its final zone's ending scene and an ending card
  whose route line matches the zones you flew, then the credits.

## Zone B: BRINE NEBULA

The first zone after AZURE VERGE on the upper route: a teal and violet **nebula** over a drifting
**sea** of light that gently **wobbles** and shimmers through its colours along the bottom of the
picture, bubbles everywhere, a reef to fly through, a **mid-boss** and, at the end, the mechanical
fish **GALVANIC MAW**. About three and a half minutes. Times count from the start of the zone
(about):

| Time | What happens |
|---|---|
| 0–40 s | **The shallows.** Streams of small **bubbles** drift through; big **iridescent bubbles** burst into two small ones when shot; **green bubbles** have a small fish curled up inside — shoot the bubble and the **fish** darts out at you. Red saucers bring capsules as in zone A |
| about 40 s | **The reef tunnel.** Pale coral rock closes in above and below; spiny **urchins** sit on the floor and hang from the ceiling and shoot at you. Checkpoint |
| about 1:30 | **SPUME HERALD** — a ridged shell with two launch tubes glides in from the right **without a WARNING, while the screen keeps scrolling**. It follows your height, fires fans of three, and its tubes launch green bubbles (with fish inside). Shoot the shell (40 hits) — or survive: after 30 seconds it leaves on its own |
| about 1:50 | **The deep current.** Open water; **jellyfish** sway through, each sending out a ring of six bullets (the first one aimed at you). Checkpoint. Somewhere here is the **secret entrance** ([below](#the-secret-bonus-stage-pearl-grotto)) |
| about 2:35 | **The riptide.** The scrolling nearly doubles its speed for about 20 seconds; schools of fish and bubbles. Checkpoint |
| about 3:00 | **The calm.** Two red saucers — the capsules for the boss — and nothing else |
| about 3:13 | **The WARNING** (`GIANT HOSTILE "GALVANIC MAW"` · `CLOSING IN - CODE GM-02`), then the boss and its own theme |

**The enemies of BRINE NEBULA:**

| Enemy | Hits to destroy | Points | Shoots? |
|---|---|---|---|
| Small bubble (streams) | 1 | 50 | No |
| Big iridescent bubble | 3 | 200 | No — it bursts into two small bubbles |
| Green bubble with a fish inside | 4 | 300 | No — it frees the fish |
| Fish (from a bubble, or in schools) | 1 | 150 | No — it stops, aims and darts at you |
| Jellyfish | 4 | 400 | A **ring of six** slow bullets, the first one aimed at you |
| Urchin (reef floor or ceiling) | 3 | 300 | One **pink round** bullet aimed at you about every 2½ seconds |
| Red saucer (as in zone A) | 3 | 200 | No — it always leaves a capsule |
| Homing rocket (from the boss) | 1 | 100 | No — it chases you for a second, then flies straight on |

### GALVANIC MAW (GM-02)

A big mechanical fish on the right that **follows your ship's height up and down**:

| Part | Looks like | What your shots do |
|---|---|---|
| **Hull** | The steel body with its eye, gill slits and plating; a tail fin behind | Nothing, ever (a small spark bounces back) |
| **Jaws** | Two steel jaws at the front, above and below the mouth | Nothing — they are armour. They **open apart** when the mouth opens |
| **Mouth** | The glowing gullet between the jaws | Nothing while it is **shut**; while it is **open** it takes the hits: 64 in all. Destroying it destroys the boss (35,000 points) |
| **Rocket pods** | Two pods above and below the hull | 16 hits each, 1,000 points — each one destroyed means fewer rockets |

**How it fights.** The mouth stays shut for about two and a half seconds, then opens for about
one and a half: **that is when to shoot**. While it is open it spits fans of three **purple
needles** (the cutters) at you, and every few seconds a pod launches a **homing rocket** that
flies out diagonally, turns to follow you for about a second and then flies straight on — shoot it
(one hit) or step out of its way. After the mouth has taken 24 hits the mouth also fires a **ring
of eight bullets** each time it opens and both pods launch rockets; after 48 hits the mouth opens
longer and more often, the fans have five needles and the rings ten bullets.

**Tip:** stay level with the mouth and fire when it opens; step up or down when the needles come,
and keep an eye on the rockets — they cannot turn sharply, so a single step at the last moment
gets you out of their way.

### The secret bonus stage: PEARL GROTTO

About 20 seconds after the third checkpoint (roughly 2:10 into the zone), two **reef blocks** come
along at the **very top of the screen** with a gap between them. **Fly under the left block and then
up into the gap** while it passes — the power-up chime sounds and about ⅔ of a second later the
picture switches to **PEARL GROTTO**, with **BONUS STAGE** / **PEARL GROTTO** on the title card.
Your score, ships and power-ups come along.

The grotto is a short reef cave over the shimmering sea, about half a minute long: nothing shoots
at you; carriers fly across leaving **gold capsules** worth **1,000 points** each, one bigger
carrier leaves a green **1UP** capsule (**one extra ship**), a few big bubbles drift through, and
two brick walls have to be shot through. At its end the zone counts as **cleared**: GALVANIC MAW is
**skipped**, the zone result and the ZONE MAP follow, and the ending card will show **BONUS STAGE
CLEARED**. Lose a ship in the grotto and you are back in BRINE NEBULA at the gap about a second
later, and the entrance stays shut for the rest of the zone (RETRY STAGE opens it again). The whole
thing also works on the TV.

## Zone C: DUNE EXPANSE

The first zone after AZURE VERGE on the lower route: a desert under **two suns** — a big pale one
and a small orange one — with dune ridges behind that **shimmer in the heat**, sand-coloured rock,
sand worms and, at the end, the giant spider **SANDGRAVE WIDOW**. About four minutes. Times from the
start of the zone (about):

| Time | What happens |
|---|---|
| 0–45 s | **The dunes.** Sand-coloured ground along the bottom. **Sand worms** lie hidden in the dunes: when your ship comes near, a worm's armoured head **bursts out of the sand** in an arc, its body following segment by segment, and dives back into the ground ahead. Flocks of **skimmers** swoop through in curves; **sand geysers** on the ground throw clods of sand in arcs; red saucers bring capsules |
| about 45 s | **The canyon.** A rock ceiling closes in above the floor; armoured **beetles walk along the ceiling** (upside down) and the floor and shoot when they stop; **dust devils** spin through, sending out short spirals of needles. Checkpoint |
| about 1:40 | **The worm field.** Worm after worm bursts from the dunes, with geysers between them. Checkpoint |
| about 2:25 | **The sandstorm run.** The scrolling speeds up for about 20 seconds; flocks of skimmers and dust devils. Checkpoint |
| about 2:50 | **The calm.** Two red saucers for the boss |
| about 3:03 | **The WARNING** (`GIANT HOSTILE "SANDGRAVE WIDOW"` · `CLOSING IN - CODE SW-03`), then the boss and its own theme |

**The enemies of DUNE EXPANSE:**

| Enemy | Hits to destroy | Points | Shoots? |
|---|---|---|---|
| Sand worm segment (a worm is a whole group) | 2 | 100 | No — its body is the danger; destroying a whole worm gives a bonus (and some worms leave a capsule) |
| Skimmer (flocks on curved paths) | 1 | 100 | No |
| Beetle (canyon ceiling or floor) | 3 | 250 | A fan of three **red ovals** each time it stops |
| Dust devil | 6 | 500 | A short two-armed **spiral of needles** |
| Sand geyser (on the ground) | 10 | 700 | Throws three **clods of sand** in arcs every two seconds or so (one hit each, 30 points; they burst on the ground) |
| Red saucer (as in zone A) | 3 | 200 | No — it always leaves a capsule |
| Spider drone (from the boss) | 2 | 150 | No — it stops, aims and dashes at you |

### SANDGRAVE WIDOW (SW-03)

A giant spider on the right that **scuttles to a new spot** every one and a half to two seconds:

| Part | Looks like | What your shots do |
|---|---|---|
| **Body** | The big abdomen with a red hourglass; four jointed legs | Nothing, ever |
| **Fangs** | Two bone fangs in front of the head, one above and one below | 14 hits each, 800 points. They are in the way of the head — **shoot them first** |
| **Head** | The head with four glowing eyes, at the front | Nothing while a fang stands; then 56 hits. Destroying it destroys the boss (35,000 points) |
| **Spinnerets** | Two silk glands above and below the body | 20 hits each, 1,000 points — fewer drones and silk lines |

**How it fights.** From the start the head spits fans of three **red ovals** at you and the
spinnerets send out **spider drones** that stop, aim and dash at you. **Once both fangs are gone**
it gets angry: both spinnerets send drones, and every few seconds a spinneret spins a **silk line**
— a thin blinking warning line straight across the screen along its row for almost a second, then
a beam for about ⅔ of a second. Only the beam hurts, and it **stays where it was spun** while the
spider keeps moving — step up or down out of its row. When the head has taken 32 hits, the fans have
five ovals and everything comes faster.

**Tip:** clear the fangs quickly while there are no silk lines yet, then stay level with the head
and watch the blinking lines; shoot the drones as they come.

What "good" looks like in zones B and C:

- The sea in BRINE NEBULA and the dunes and suns in DUNE EXPANSE move smoothly; the wobble and the
  shimmer affect **only the background** — never your ship, the enemies, the bullets or the HUD.
- Every sand worm comes out of the ground and goes back into it (it may pass through the rock);
  every beetle walks exactly on the ceiling or floor.
- A bubble that is shot bursts where it was; a green bubble's fish appears exactly there.
- GALVANIC MAW's jaws always open and close together with the mouth and never slip out of place;
  shots clink on the shut mouth and hit the open one.
- SANDGRAVE WIDOW's head only reacts once both fangs are gone; each silk line blinks as a warning
  first and can be avoided by one step up or down.
- Every bullet, rocket, drone and silk line can be dodged with single arrow presses — please report
  the zone and the time of any spot where you could not get out of the way.
- Each zone, boss included, takes about three and a half to four minutes when nothing goes wrong.

## Zone D: MAGMA DEEP

The zone after B or C on the upper middle route: a field of **volcanoes** under a dark sky —
distant cones with glowing craters shimmering in the heat, dark basalt rock with an ember-orange
edge —, then a **dive** down into the caves over a **lake of lava**, a maze of **brick walls** and,
at the end, the battleship **CINDER BASTION**. About three and a half minutes. Times from the start
of the zone (about):

| Time | What happens |
|---|---|
| 0–45 s | **The caldera fields.** Streams of glowing **embers** drift through; flocks of ash **bats** swoop down (or up) and away; **erupting cones** on the ground throw **lava bombs** in arcs; a basalt **turret** on the ground. Red saucers bring capsules as in zone A |
| about 45 s | **The eruption field.** More cones and bats; an armoured slag **beetle** walks on the ground. Checkpoint |
| about 1:17 | **The dive.** The scrolling **stops** over a pit and for about 2½ seconds the whole view **sinks down into the caves** — your ship goes down with it. Below, the **lava lake** rises into the bottom of the picture and rolls through its colours from then on |
| about 1:30 | **The caves.** A rock roof above, cave floor below; cracked **rocks hang from the roof** and drop when your ship comes near. Checkpoint |
| about 1:55 | **The brick maze.** Seven walls of bricks, one after the other. **Every wall has a gap** — at a different height each time —, so you can zigzag through; or **shoot a way through**: a brick breaks after 4 hits (10 points) |
| about 2:20 | Past the maze: a beetle walking upside down on the roof, a turret hanging from it, more falling rocks |
| about 2:50 | **The lava river.** The scrolling nearly doubles its speed for about 20 seconds; embers, bats and a turret on the roof. Checkpoint |
| about 3:10 | **The calm.** Two red saucers — the capsules for the boss |
| about 3:25 | **The WARNING** (`GIANT HOSTILE "CINDER BASTION"` · `CLOSING IN - CODE CB-04`), then the boss and its own theme |

The zone stays down in the caves after the dive: a checkpoint restart (ARCADE, or CONTINUE?) at
the caves' checkpoint starts down there, one at the checkpoint before it starts on the surface and
dives again; broken bricks stand again after a restart.

**The enemies of MAGMA DEEP:**

| Enemy | Hits to destroy | Points | Shoots? |
|---|---|---|---|
| Ember (streams) | 1 | 100 | No |
| Ash bat (flocks on curved paths) | 1 | 150 | No |
| Erupting cone (on the ground) | 12 | 800 | Throws three **lava bombs** in arcs about every 1½ seconds (one hit each, 30 points; they burst on the ground) |
| Hanging rock (cave roof) | 2 | 100 | No — it **drops** when your ship comes near |
| Slag beetle (ground or cave roof) | 3 | 250 | A fan of three **red ovals** each time it stops |
| Basalt turret (ground or cave roof) | 4 | 300 | One **pink round** bullet aimed at you about every 2½ seconds |
| Red saucer (as in zone A) | 3 | 200 | No — it always leaves a capsule |

### CINDER BASTION (CB-04)

An iron battleship on the right that **follows your ship's height**; its glowing **core** sits in
front of the hull, and a bar of four round **shield segments** turns round the core like the hands
of a clock:

| Part | Looks like | What your shots do |
|---|---|---|
| **Hull** | The iron hull with its glowing vents, behind the core | Nothing, ever (a small spark bounces back) |
| **Shield arms** | Four round segments on a bar through the core, **turning** | Nothing — they are armour; they sweep in front of the core |
| **Core** | The glowing magma core | 80 hits in all — whenever no arm is in front of it. Destroying it destroys the boss (35,000 points) |
| **Laser emitters** | Two emitters, above and below the front of the hull | 18 hits each, 1,000 points — each one destroyed means fewer lasers |

**How it fights.** The emitters take turns firing a **lane laser** straight to the left along their
row: a thin blinking warning line for about ¾ of a second, then a beam for almost a second — step
up or down out of that row. The arms turn slowly at first; after the core has taken 26 hits they
turn faster, **change direction** every few seconds, and the core adds fans of three **red ovals**;
after 56 hits they turn faster still and the core also sends out **rings of ten** purple bullets.

**Tip:** stay level with the core and keep firing — the arms let every other stretch of shots
through. When a laser line blinks in your row, step out, then step back.

## Zone E: TEMPEST RIDGE

The zone after B or C on the lower middle route: a **storm** over jagged, snow-capped mountains —
heavy clouds that roll and change colour at the top of the picture, rain slanting across the whole
screen, steep grey peaks and overhangs —, enemies that come **from behind**, and at the end the
seahorse **SQUALL STEED**. About four minutes. Times from the start of the zone (about):

| Time | What happens |
|---|---|
| 0–45 s | **The storm front.** **Hailstones** drift through in streams; flocks of **kites** come in **from the left, behind your ship**, overtake it, curl round near the right edge and fly back along another row; **jets** come from behind along one row, stop near the right edge, fire one needle back at you and fly back the way they came; granite **turrets** on the peaks. Red saucers bring capsules |
| about 45 s | **The ridge pass.** Rock overhangs above, jagged peaks below; turrets on both; more jets from behind. Checkpoint |
| about 1:43 | **The thunderheads.** Small storm clouds with lightning inside drift through, each firing a **streak of four needles** in a line at you. More kites from behind. Checkpoint |
| about 2:30 | **The gale run.** The scrolling nearly doubles its speed for about 20 seconds; hail, kites and jets from behind. Checkpoint |
| about 2:50 | **The calm.** Two red saucers for the boss |
| about 3:06 | **The WARNING** (`GIANT HOSTILE "SQUALL STEED"` · `CLOSING IN - CODE SS-05`), then the boss and its own theme |

**Enemies from behind** keep to one row while they pass your ship and again when they fly back:
**step up or down out of their row** as they come — the jet's needle is the only shot they fire.

**The enemies of TEMPEST RIDGE:**

| Enemy | Hits to destroy | Points | Shoots? |
|---|---|---|---|
| Hailstone (streams) | 1 | 100 | No |
| Kite (flocks from behind) | 1 | 150 | No — they fly past you and back |
| Jet (from behind, alone) | 2 | 200 | One **pink needle** aimed back at you from near the right edge |
| Granite turret (peak or overhang) | 3 | 300 | One **pink round** bullet aimed at you about every two seconds |
| Thunderhead (small storm cloud) | 5 | 500 | A **streak of four pink needles** in a line, aimed at you, every three seconds or so |
| Red saucer (as in zone A) | 3 | 200 | No — it always leaves a capsule |
| Little seahorse (from the boss) | 1 | 100 | No — it chases you for about a second, then flies straight on |

### SQUALL STEED (SS-05)

A giant seahorse on the right that **bobs gently up and down**:

| Part | Looks like | What your shots do |
|---|---|---|
| **Body** and **head** | The plated trunk with its fin and curled tail, the crowned head | Nothing, ever |
| **Chest** | A glowing hatch in the front of the body, with a **lid** above and below | Nothing while it is **shut**; while it is **open** (the lids move apart) it takes the hits: 64 in all. Destroying it destroys the boss (35,000 points) |
| **Snout** | The long tube snout on the head | 24 hits, 1,000 points — without it, no more fans or rings |

**How it fights.** The chest stays shut for about two seconds and opens for about two: **that is
when to shoot**. While it is open, **little seahorses** come out of it one or two at a time; each
chases your ship for about a second, then flies straight on — shoot it (one hit) or step out of its
way. All the while the snout fires fans of three **pink ovals** at you. After the chest has taken
20 hits two little seahorses come out each time and the bobbing gets a little higher; after 46 hits
the fans have five ovals and every time the chest **shuts**, the snout fires a **ring of ten** red
bullets.

**Tip:** stay level with the chest and fire whenever it opens; take the little seahorses out as
they come — they cannot turn sharply, so a single step at the last moment also gets you out of
their way.

What "good" looks like in zones D and E:

- The dive is smooth: the scrolling stops, the whole picture — rock, enemies, your ship — goes down
  together for about 2½ seconds, and the lava lake comes up from the bottom; your ship is never
  pushed into rock by it.
- Every brick wall has a gap you can fly through with single up / down presses, and shot bricks
  disappear one by one where they were hit.
- Hanging rocks drop only when your ship comes near; lava bombs burst on the ground.
- CINDER BASTION's arms turn smoothly round the core — in the later phases they change direction
  without jumping —, shots clink on the arms and hit the core between them.
- Kites and jets from behind always come from the left edge, never out of nowhere in the middle of
  the picture; the jets fire only once they are on screen.
- The storm clouds roll and the rain slants **behind** everything — never over your ship, the
  enemies, the bullets or the HUD.
- SQUALL STEED's lids always open and close together with its chest; shots clink on the shut chest
  and hit the open one; the little seahorses come only out of the open chest.
- Every bullet, laser, rock and little seahorse can be dodged with single arrow presses — please
  report the zone and the time of any spot where you could not get out of the way.
- Each zone, boss included, takes about three and a half to four minutes when nothing goes wrong.

## Zone F: CELL VAULT

The zone after D or E on the upper route: the inside of a **living vault** — a far wall of cells
that **pulses** through its colours and gently sways, soft folds of flesh in front of it, dark olive
rock with a pale-green edge —, cells that chase your ship, walls of tissue that **grow back**,
**grabbing tentacles** and, at the end, the squid **MANTLE REGENT**. About three and a half minutes.
Times from the start of the zone (about):

| Time | What happens |
|---|---|
| 0–45 s | **The membrane.** Streams of pale **motes** drift through; **chasing cells** drift in along their row and then **follow your ship** for about two seconds before they swim straight on; big **dividing cells** split into two chasing cells when shot; fleshy **polyps** on the floor and the ceiling shoot at you. Red saucers bring capsules as in zone A |
| about 45 s | **The tissue passage** begins. Checkpoint |
| about 1:00–1:25 | **Seven walls of tissue**, one after the other. **Every wall has a gap** — at a different height each time —, so you can zigzag through; or **shoot a way through**: a tissue cell breaks after 3 hits (10 points) — but it **grows back** about four seconds later (never on top of your ship). Chasing cells and motes between the walls |
| about 1:38 | **The tentacle garden.** **Tentacles** on the floor and the ceiling: when your ship comes near, a **claw on a chain lunges** at you and tugs your ship towards it for a moment, then pulls back. **Spore sacs** hover near the right edge and puff fans of slow spores at you before they drift away up or down. Checkpoint |
| about 2:32 | **The pulse run.** The scrolling nearly doubles its speed for about 20 seconds; long streams of motes, groups of chasing cells, dividing cells. Checkpoint |
| about 2:52 | **The calm.** Two red saucers — the capsules for the boss |
| about 3:08 | **The WARNING** (`GIANT HOSTILE "MANTLE REGENT"` · `CLOSING IN - CODE MR-06`), then the boss and its own theme |

A checkpoint restart (ARCADE, or CONTINUE?) puts every tissue wall back whole at once.

**The enemies of CELL VAULT:**

| Enemy | Hits to destroy | Points | Shoots? |
|---|---|---|---|
| Mote (streams) | 1 | 100 | No |
| Chasing cell (alone, in groups, from a dividing cell or from the boss) | 2 | 200 | No — it drifts in, follows you for about two seconds (it cannot turn sharply), then swims straight on |
| Dividing cell (a big cell with two nuclei) | 6 | 600 | No — shot, it **splits into two chasing cells** |
| Tentacle claw (floor or ceiling, on a chain) | 5 | 400 | No — it lunges at you when you come near and tugs your ship towards it; the claw is deadly to touch |
| Polyp (floor or ceiling) | 4 | 300 | One **pink round** bullet aimed at you about every three seconds |
| Spore sac (hovering on the right) | 4 | 500 | A fan of three slow **purple spores** aimed at you, every three and a half seconds or so |
| Red saucer (as in zone A) | 3 | 200 | No — it always leaves a capsule |

### MANTLE REGENT (MR-06)

A giant squid on the right that **follows your ship's height**: a long mantle trailing off to the
right with a tail fin, a great **eye** at its head, and two **tentacles** reaching out to the left,
one above and one below the eye:

| Part | Looks like | What your shots do |
|---|---|---|
| **Mantle** | The long olive body with pale spots, the tail fin behind it | Nothing, ever (a small spark bounces back) |
| **Eye** | The great eye with an amber iris | 90 hits in all — whenever no tentacle is in front of it. Destroying it destroys the boss (40,000 points) |
| **Tentacle roots** | The thick joints where each tentacle meets the body | 24 hits each, 1,500 points — breaking one makes the **whole tentacle fall off** |
| **Tentacles** | Round segments with pale suckers and a barbed tip | Nothing — they are armour |

**How it fights.** The tentacles stay straight for about two seconds — **that is when to shoot the
eye** —, then curl in until their tips meet in front of the eye, guard it for about a second (shots
clink off them) and uncurl again. All the while the eye fires fans of three **red ovals** at you.
Once a tentacle has fallen off (or the eye has taken about 30 hits) it changes: the tentacle tips
lash out **pink needles** and every three seconds or so the eye sends out a **chasing cell**. After
about 60 hits on the eye (or with both tentacles gone) the tentacles curl twice as fast, the fans
have five ovals, and each time the tentacles open the eye bursts a **ring of ten** purple bullets.

**Tip:** stay level with the eye and fire while the tentacles are open; a tentacle root in your row
is worth breaking — fewer needles, and a gap in the guard. Shoot the chasing cells as they come, or
step out of their way at the last moment — they cannot turn sharply.

## Zone G: PRISM LABYRINTH

The zone after D or E on the lower route: a **crystal maze** — a far wall of crystal facets that
**glint** one after another, crystal spires shimmering in front of it, deep-blue crystal rock with an
ice-blue edge —, walls of crystal from the ceiling and the floor, a **rush of crystal cubes** that
build walls where they hit, a **secret bonus stage** and, at the end, the crystal core **FACET
MONARCH**. About four minutes. Times from the start of the zone (about):

| Time | What happens |
|---|---|
| 0–45 s | **The prism field.** Streams of **sparkles**; crystal **turrets** on the floor and the ceiling; a **prism lens** hovers near the right edge and fans needles at you, then drifts away; a round **geode** that shatters into shards when shot; a **halo crystal** looping through, sending out rings of bullets. Red saucers bring capsules |
| about 46 s | **The prism gallery.** Checkpoint. From about 0:48 to 1:05 **four crystal turrets** come by, two on the floor and two hanging from the ceiling — **shoot down all four** and the secret bonus stage opens ([below](#the-secret-bonus-stage-glimmer-cache)) |
| about 1:13–1:34 | **The crystal labyrinth.** Seven walls of solid crystal (they cannot be shot), hanging from the ceiling and rising from the floor **in turn** — zigzag up and down between them. Prism lenses high and low |
| about 1:43 | **The cube rush.** Checkpoint. Four times a rush of **crystal cubes** comes at you — each cube flies at your ship and, where it hits rock, **sticks as a crystal block**, so the short crystal pillars grow into walls. Blocks break after 2 hits (10 points). Sparkles, a geode, a low lens |
| about 2:32 | **The refraction run.** The scrolling nearly doubles its speed for about 20 seconds over jagged spires; long streams of sparkles, lenses, halo crystals, a turret, a geode. Checkpoint |
| about 2:55 | **The calm.** Two red saucers for the boss |
| about 3:10 | **The WARNING** (`GIANT HOSTILE "FACET MONARCH"` · `CLOSING IN - CODE FM-07`), then the boss and its own theme |

**The enemies of PRISM LABYRINTH:**

| Enemy | Hits to destroy | Points | Shoots? |
|---|---|---|---|
| Sparkle (streams) | 1 | 100 | No |
| Crystal cube (the cube rush) | 1 | 60 | No — it flies at you and sticks where it hits rock, as a crystal block (2 hits, 10 points) |
| Crystal turret (floor or ceiling) | 4 | 300 | One **pink round** bullet aimed at you about every three seconds |
| Halo crystal (looping through) | 6 | 600 | A **ring of eight** slow purple bullets every two seconds |
| Prism lens (hovering on the right) | 5 | 500 | Two quick fans of four **purple needles**, aimed so that the **gap in the middle** of each fan is where you are |
| Geode (a round rock) | 8 | 700 | No — shot, it **shatters into three shards** (1 hit, 50 points each) that drift on |
| Red saucer (as in zone A) | 3 | 200 | No — it always leaves a capsule |

### FACET MONARCH (FM-07)

A crystal core on the right that **follows your ship's height**: a big hexagonal crystal housing,
the glowing core in front of it behind two long **crystals**, and two **arms** of crystal beads with
pointed claws, one above and one below, that open and close like a pair of claws:

| Part | Looks like | What your shots do |
|---|---|---|
| **Housing** | The big hexagonal crystal | Nothing, ever (armour behind the core) |
| **Crystals** | Two long crystal facets in front of the core | 22 hits each, 1,000 points. They shield the core — **shoot them first** |
| **Core** | The glowing core | Nothing while a crystal stands; then 72 hits. Destroying it destroys the boss (40,000 points) |
| **Arms** | Crystal beads with a pointed claw at the end | Nothing — they are armour; they sweep in front of the boss |

**How it fights.** At first the arms wave slowly and each claw fires a single **purple needle** at
you every second and a half. Once both crystals are broken (or after about 25 seconds) the arms wave
faster, the claws fire fans of three needles and the core sends out **rings of eight** red bullets.
After the core has taken 34 hits the rings have ten bullets and every few seconds the core fires a
**lane laser**: a thin blinking warning line straight across the screen along its row, then a beam
for about ⅔ of a second — it **stays where it was fired** while the boss keeps moving, so step up or
down out of that row.

**Tip:** break the crystals quickly while the attacks are still slow, then stay level with the core
and fire between the sweeps of the arms; when a laser line blinks in your row, step out, then back.

### The secret bonus stage: GLIMMER CACHE

Zone G's secret is not a gap to fly into but a **target to clear**: in the **prism gallery**,
about 0:48 to 1:05 into the zone (just after the second checkpoint), four crystal turrets come by —
two on the floor, two hanging from the ceiling. **Shoot down all four** before they scroll off the
left edge. When the gallery has passed (about 1:07) the power-up chime sounds and about ⅔ of a
second later the picture switches to **GLIMMER CACHE**, with **BONUS STAGE** / **GLIMMER CACHE** on
the title card. Only these four turrets count — the turret shortly before the gallery and the other
enemies do not. With one of the four left standing, nothing happens and the zone simply goes on.

The cache is a short crystal cave, about half a minute long: carriers fly across leaving **gold
capsules** worth **1,000 points** each, one bigger carrier leaves a green **1UP** capsule (**one
extra ship**), a rush of crystal cubes comes at you (they still hurt if they hit you), a geode and a
sparkle drift through, and two crystal walls — one high, one low — stand in the way; fly round them.
At its end the zone counts as **cleared**: FACET MONARCH is **skipped**, the zone result and the
ZONE MAP follow, and the ending card will show **BONUS STAGE CLEARED**. Lose a ship in the cache and you are back in PRISM LABYRINTH at the gallery about a
second later, and the entrance stays shut for the rest of the zone (RETRY STAGE opens it again). A
checkpoint restart in the gallery (ARCADE, or CONTINUE?) starts the gallery over: the turrets you
shot before count for nothing, shoot all four again.

What "good" looks like in zones F and G:

- The wall of cells pulses and sways, the crystal facets glint and the spires shimmer **behind**
  everything — never over your ship, the enemies, the bullets or the HUD.
- Every tissue wall has a gap you can reach with single ▲ / ▼ presses; shot tissue disappears cell
  by cell where it was hit and grows back about four seconds later — **never on top of your ship**.
- A dividing cell splits into two exactly where it was shot; chasing cells follow you only for a
  while and never turn on the spot.
- The tentacle claws lunge only when your ship comes near, tug it briefly and pull back, their
  chains following.
- MANTLE REGENT's two tentacles curl in and out together, mirrored above and below, and never jump
  — also when the boss changes its attacks; a broken tentacle falls off whole.
- Shooting all four gallery turrets always opens GLIMMER CACHE; with one left standing it never
  opens.
- The rush cubes stick where they hit rock and can be shot away; after a restart the stuck cubes are
  gone.
- FACET MONARCH's arms wave smoothly and never jump when the crystals break; shots clink on the
  arms and the housing, and the core reacts only after both crystals are gone.
- Every bullet, laser, claw and chasing cell can be dodged with single arrow presses — please report
  the zone and the time of any spot where you could not get out of the way.
- Each zone, boss included, takes about three and a half to four minutes when nothing goes wrong.

## Zone H: IRON CITADEL

One of the two **final zones** — the one after F or G on the upper route: the enemy's **fortress**
— a far wall of riveted steel panels whose little amber **running lights chase** along it, pipes
and girders in front of it, steel plating with an amber hazard edge —, hatches that let out drones,
a hall of **moving floors and ceilings**, **laser emitters**, a **parade of four earlier bosses**
and, at the end, the fortress's master **IRON SOVEREIGN**. About four minutes (a little more with
the boss). Times from the start of the zone (about):

| Time | What happens |
|---|---|
| 0–46 s | **The outer walls.** Streams of small steel **drones**; **rail turrets** on the floor and the ceiling; **hatches** in the floor and the ceiling that open and let out little **mites**, which climb out and then ram straight at you; a two-legged **sentinel** walking on the floor. Red saucers bring capsules as in zone A |
| about 46 s | **The piston hall** begins. Checkpoint. From about 0:48 to 1:26 eleven **pistons** — blocks rising out of the floor and hanging from the ceiling, in turn — **swing in and out** as you pass, so the gap between them moves up and down; touching one costs a ship. Four **laser emitters** on the floor and the ceiling fire lanes along their row |
| about 1:39 | **The parade hangar.** Checkpoint. Open space, slow scrolling: **four earlier bosses come back in reduced form**, one after another — at about 1:42, 1:57, 2:13 and 2:29 ([below](#the-parade)) |
| about 2:45 | **The core run.** Checkpoint. The scrolling nearly doubles its speed for about 20 seconds over rolling ground, with a heat shimmer; long drone streams, emitters, a hatch, a walker |
| about 3:06 | **The calm.** Two red saucers — the capsules for the boss |
| about 3:21 | **The WARNING** (`GIANT HOSTILE "IRON SOVEREIGN"` · `CLOSING IN - CODE IS-08`), then the boss and its own theme, **SOVEREIGN OF STEEL** |

A checkpoint restart (ARCADE, or CONTINUE?) puts the pistons back where they were when you first
passed them.

**The enemies of IRON CITADEL:**

| Enemy | Hits to destroy | Points | Shoots? |
|---|---|---|---|
| Drone (streams) | 1 | 100 | No |
| Hatch (floor or ceiling) | 6 | 500 | No — it opens every second and a half or so and lets out a mite, at most three |
| Mite (from a hatch) | 1 | 60 | No — it climbs out for a moment, then **rams straight at you**: step out of its line |
| Laser emitter (floor or ceiling, a dome with a glowing lens) | 6 | 600 | A **lane laser** to the left along its row about every 3½ seconds: a thin blinking warning line for a second, then the beam for about ½ second — step up or down out of that row |
| Sentinel (walks on the floor) | 4 | 400 | Walks, stops, and fires a fan of three **red ovals** aimed at you |
| Rail turret (floor or ceiling) | 4 | 300 | One **pink round** bullet aimed at you every three seconds |
| Red saucer (as in zone A) | 3 | 200 | No — it always leaves a capsule |

### The parade

In the hangar four bosses you may have met on the way come back as smaller **echoes** — each
comes in **without a WARNING** while the screen keeps scrolling, is worth **8,000 points**, and
**leaves after about 16 seconds** if you do not destroy it (that costs you nothing but the points).
The next one can arrive just as the last one leaves.

| Echo | Looks like | Its weak point |
|---|---|---|
| **BULWARK ECHO** | HALCYON BULWARK (zone A) with only two shield plates | Shoot the two plates (8 hits each), then the core (20 hits); watch its lane lasers |
| **MAW ECHO** | GALVANIC MAW (zone B) without its rocket pods | The mouth, only while it is open (22 hits) |
| **BASTION ECHO** | CINDER BASTION (zone D) with two short shield arms | The core between the turning arms (26 hits); rings of eight bullets |
| **REGENT ECHO** | MANTLE REGENT (zone F) with short tentacles | The eye while the tentacles are open (24 hits); a tentacle root breaks after 10 |

### IRON SOVEREIGN (IS-08)

The citadel's master, and a real **finale in four parts**: a huge grey fortress hull on the right
that **follows your ship's height**, its red **core** behind two tall **shield plates**, a lane
**emitter** above and below it, and a **shield wheel** — four round armoured pods on a hub — round
the core:

| Part | Looks like | What your shots do |
|---|---|---|
| **Hull** | The fortress behind everything | Nothing, ever (a small spark bounces back) |
| **Shield plates** | Two tall plates in front of the core | 24 hits each, 1,000 points — **shoot them first** |
| **Core** | The pulsing red core | Nothing while a plate stands; then 150 hits. Destroying it destroys the boss (60,000 points) |
| **Emitters** | Two lens domes, above and below | 30 hits each, 2,000 points — the lanes and the drones come from them; with both gone, no more lanes or drones |
| **Shield wheel** | Four round grey pods circling the core | Nothing — armour; it blocks your shots when a pod passes in front of the core |

**How it fights.**
1. **The plates.** The emitters fire **lane lasers** along their rows in turn (a blinking warning
   line, then the beam) and the core fires fans of three **red ovals** at you. The wheel stands
   still, its pods above and below the core's row.
2. **The wheel.** Once both plates are broken, the wheel **turns round the core** — shoot between
   the pods — the lanes go on, and the core adds **rings of ten** purple bullets.
3. **The drones.** After about 40 hits on the core the wheel turns the other way and **changes
   direction** every few seconds, the fans have five ovals, and every three seconds the emitters let
   out two **drones** that follow you for two seconds, then fly straight on (2 hits, 150 points).
4. **The overdrive.** After about 90 hits the wheel spins fast, the lanes come back, and the core
   pours out a **turning three-armed spiral** of purple ovals — move round with the turn, a step at a
   time.

**Tip:** the emitters are worth 2,000 points each and take the lanes and the drones with them; in
the overdrive, stay level with the core and fire whenever a gap in the wheel passes in front of it.

## Zone I: ABYSSAL THRONE

The other **final zone** — after F or G on the lower route: **the deep** — black-blue water where
tiny **glowing specks twinkle** and the whole picture sways gently, rock spires and weed in front of
it, black-teal rock with a faint glowing edge —, **depth mines**, eels bursting out of a trench and,
at the end, the enemy's flagship, the **ABYSS ARK**, and the thing that lives inside it, **THE HOLLOW
KING**. About four and a half minutes with both bosses. Times from the start of the zone (about):

| Time | What happens |
|---|---|
| 0–46 s | **The descent.** Streams of glowing **motes**; **depth mines** drifting in; **gulpers** — big-mouthed fish — hovering high or low near the right edge; barnacle turrets on the floor; red saucers with capsules |
| about 46 s | **The trench.** Checkpoint. A floor and a ceiling close in; four times (about 0:50, 1:04, 1:13, 1:26) a chain of **trench eels** bursts out of the floor in front of the ship and dives back in; turrets on the floor and the ceiling, motes, mines |
| about 1:39 | **The mine field.** Checkpoint. Open water full of **depth mines**, alone and in pairs; gulpers, mote streams |
| about 2:32 | **The undertow.** Checkpoint. The scrolling nearly doubles its speed for about 20 seconds; long mote streams, mines, a turret |
| about 2:53 | **The calm.** Two red saucers for the bosses; open water from here on |
| about 3:06 | **The WARNING** (`GIANT HOSTILE "ABYSS ARK"` · `CLOSING IN - CODE AA-09`), then the raid on the ARK, then THE HOLLOW KING, with their own theme, **THE HOLLOW KING** |

**The enemies of ABYSSAL THRONE:**

| Enemy | Hits to destroy | Points | Shoots? |
|---|---|---|---|
| Mote (streams) | 1 | 100 | No |
| Depth mine (a spiked ball with a blinking light) | 3 | 300 | When your ship comes **close** (within about a quarter of the screen's height, above, below or ahead) it **stops, flashes for about ⅔ second and bursts into a ring of eight red bullets** — step through a gap between them, or keep away. A mine that bursts gives no points: shoot it before it arms |
| Trench eel (a chain bursting out of the floor) | 2 | 150 | No — like zone C's sand worms: watch for the head and step out of its arc |
| Gulper (hovering high or low on the right) | 6 | 600 | Three quick fans of three **red round** bullets aimed at you, then a rest; after about six seconds it drifts away up or down |
| Barnacle turret (floor or ceiling) | 4 | 300 | One **pink round** bullet aimed at you every three seconds |
| Red saucer (as in zone A) | 3 | 200 | No — it always leaves a capsule |

### The ABYSS ARK (AA-09)

A **whale-class battleship** as long as the screen is wide: a pale bone-and-rust hull lying across the
water, **three turrets on its back and three on its belly**, and its glowing **heart** amidships. The
scrolling stops and the **view glides along the ship** — back and forth along the hull and a little
up and down —, so different turrets come into sight; only the turrets you can see fire.

| Part | Looks like | What your shots do |
|---|---|---|
| **Hull** | The long whale-shaped ship | Nothing — your shots fly past it |
| **Turrets** | Round turrets with barrels that turn to face you | 12 hits each, 800 points |
| **Heart** | The glowing heart in the middle of the hull | 130 hits; destroying it destroys the ship (50,000 points) — and reveals what is inside |

**How it fights.** The turrets on screen turn to you and fire **pink round** bullets every second and
a half, and every four seconds or so a turret casts a **hook** — a harpoon drone that flies out and
**homes in on your ship** for a little over a second, then flies straight on (2 hits, 200 points).
After about 60 hits on the heart the turrets fire fans of three, two hooks come out at a time (from
different turrets) and the heart bursts **rings of eight** red bullets.

**Too slow?** The ARK gives you **90 seconds**. If its heart still beats then, it stops firing and
**sails away** — no points, THE HOLLOW KING never appears, and the zone ends (the ending will be
**THE FLAGSHIP SLIPS AWAY**, [below](#the-endings-and-the-credits)). Without power-ups that is what
usually happens: power up in the zone, and aim at the heart whenever the view shows it.

### THE HOLLOW KING (HK-10)

When the heart dies, the ARK's final blast sets free the thing inside it: a huge black **anglerfish**
on the right that **follows your ship's height**, with a **mouth** that opens to show its glowing
throat and a **lure** — a glowing bulb on a thin stalk — swaying in front of its face:

| Part | Looks like | What your shots do |
|---|---|---|
| **Body and jaws** | The dark fish and its two jaws | Nothing, ever |
| **Throat** | The glow inside the open mouth | 96 hits, **only while the mouth is open**. Destroying it destroys the boss (60,000 points) |
| **Lure** | The glowing bulb on its stalk | 30 hits, 3,000 points — the needles and the spawn come from it; the stalk itself is armour |

**How it fights.** The mouth stays shut for about 2½ seconds and opens for nearly 2 — while it is
open it spits fans of three **red ovals** at you, and the lure fires a **pink needle** every second
and a half. After about 30 hits it bursts a **ring of eight** purple bullets each time it opens and
the lure lets out little glowing **spawn** that chase you for two seconds (1 hit, 100 points). After
about 66 hits it opens longer, the fans have five ovals, the rings ten, and the lure sways twice as
fast.

**Tip:** stay level with the mouth and fire the moment it opens; shoot the lure off early — fewer
needles, no spawn.

What "good" looks like in zones H and I:

- The citadel's running lights chase along the wall and the deep's specks twinkle and sway **behind**
  everything — never over your ship, the enemies, the bullets or the HUD.
- The pistons swing smoothly, never jump, and there is always a gap you can reach with single ▲ / ▼
  presses; after a restart they are where they were.
- Every laser line blinks before its beam comes, and one step up or down gets you out of it.
- Each echo of the parade leaves after about 16 seconds if you do not destroy it, and never two of
  them fire at you for long at once.
- IRON SOVEREIGN's wheel turns smoothly round the core, changing direction without jumping; shots
  clink on the pods and the hull.
- A depth mine only arms when you come near, and its ring always has gaps you can step through.
- The ARK's turrets turn to face you before they fire, and never fire from off the screen; a hook
  can be outrun or shot.
- THE HOLLOW KING's jaws open apart and close together with the mouth, every time; the lure sways
  smoothly, also when the boss changes its attacks.
- Every bullet, laser, mine ring, hook and drone can be dodged with single arrow presses — please
  report the zone and the time of any spot where you could not get out of the way.

## The endings and the credits

After zone H or I the run is over: the final zone's result card (ZONE H CLEAR or ZONE I CLEAR,
with its bonuses) is followed by the **ending** — no map. The music changes to the ending theme,
**AFTER THE LAST WAVE**, and the screen tells the end of the story:

1. **The ending scene** fills the upper part of the screen:
   - after **IRON CITADEL**: the fortress stands on the horizon while explosions tear through it,
     your ship (and player 2's, a little behind, in a two-player game) flies off to the right, faster
     and faster, and after about six seconds the citadel sinks and falls in a last cluster of blasts;
   - after **ABYSSAL THRONE**: dark water under the light of the surface, bubbles rising, the ARK's
     dark shape **sinking** into the deep — or, if it escaped, **sailing off** to the right — while
     your ship rises towards the light and then flies away;
   - if **no ship was lost in the whole run**, a pale-gold **dawn sun** rises over the scene.
2. **The epilogue** — five or six lines of story — appears below the scene, one line every second
   and a half. **OK** (after the first second) shows all the lines at once; **OK** again, or waiting
   four seconds after the last line, goes on.
3. **The result card** — **ENDING**, the ending's name, your **ROUTE** (for example `A B D F H`),
   your score, a line for each thing you managed (**NO MISS**, **NO CONTINUE**, **BONUS STAGE
   CLEARED**, **A BOSS ESCAPED**) and **THANK YOU FOR PLAYING**. After a second `OK: CREDITS`
   appears; **OK** (or waiting 20 seconds) starts the credits.
4. **The credits** scroll up from the bottom of the screen to their own song, **THANK YOU, PILOT**:
   the game, the nine zones, the giants you fought with their codes, the engine, the programs that
   draw the placeholder art, the music and sound, the platforms and the tools — about half a minute.
   When the last line reaches the middle of the screen they stop for four seconds, then the name
   entry follows when the run's score made its table ([Typing your initials](#typing-your-initials)),
   then the table and the title. **OK** or **Back** (after the first second) skips the credits.

Back does nothing during the ending scene and the card — only OK moves on (so a mashed Back button
never skips the story). Which ending you get depends on the final zone and on how you played:

| Final zone | Ending | When |
|---|---|---|
| H | THE CITADEL FALLS SILENT | No ship lost in the whole run (the dawn) |
| H | THE CITADEL FALLS | Otherwise |
| I | THE DEEP IS STILL | No ship lost in the whole run, and the ABYSS ARK did not escape (the dawn) |
| I | THE FLAGSHIP SLIPS AWAY | The ABYSS ARK escaped — even with no ship lost (then with the dawn too) |
| I | THE THRONE IS BROKEN | Otherwise |

The run's score is saved when the final zone is cleared, before the ending
([What the game remembers](#what-the-game-remembers)).

What "good" looks like:

- The scene moves smoothly; the ship, the citadel, the ARK and the sun look like themselves (no
  magenta squares); in a two-player game both ships fly.
- The epilogue's lines are readable from the sofa and stay inside their panel; each line appears
  once, in order.
- The ending theme starts with the scene and the credits theme with the credits; neither stops
  suddenly.
- The credits scroll smoothly, every line readable, and end on the name entry (for a score among
  the ten best) or the title screen with the title music; the title's `HI` shows the run's score if
  it was a new best.

## The front end: attract mode, high scores, practice and the sound test

The game now has the complete arcade front end: it shows itself off when nobody plays, lets you
type your initials after a high score, keeps separate high-score tables for every difficulty, ship
and kind of game, lets you practise a single zone, and has a sound test. Everything works with the
remote's arrows, OK and Back alone.

### When nobody plays: the attract loop

Leave the title on the blinking `PRESS OK` for **12 seconds** without touching anything. The game
then cycles through three screens and comes back to the title:

1. **The demo play.** A zone plays itself — the computer flies the KESTREL (in zones B, E and H the
   MANTA) through the first 40 seconds of a zone, with its own HUD and the zone's title card at the
   start. `DEMO PLAY` and `PRESS OK` take turns at the top. The demo is **silent** (the title music
   fades out); explosions, sparks and the shake are shown as in a game. Each round plays the next
   zone: A, then B, … up to I, then A again.
2. **The high-score tables** (`HI-SCORES`): first the 1 PLAYER table of the difficulty and the ship
   you chose last, then up to three more tables that hold scores — five seconds each. The title
   music plays again.
3. **The story**: three short pages of the game's story crawl up through a box at the bottom of the
   screen while a picture plays above them — a star rising over a quiet sea, the enemy fortress and
   its flagship closing in through explosions, and your two ships launching one after the other
   before the logo appears. About 17 seconds.

**Any button returns to the title at once** — OK, Back, an arrow, any gamepad button — and Back
here never asks EXIT SHMUP CUP?. While you hold a button on the title, or once the title's menu is
open, the loop does not start.

### Typing your initials

When a game ends — GAME OVER, the end of the credits, the end of a browser test stage or a practice
run — and your score is among the ten best of its table, a **NEW HI-SCORE!** box appears: `1P` (or
`2P`), your **SCORE** and **RANK** (`1ST` … `10TH`), **ENTER YOUR NAME**, three letter boxes and
`END`. The first box shows `A`, the others `_`; small arrows ↑ ↓ mark the letter you are changing.

| Button | What it does |
|---|---|
| ▲ / ▼ | Change the letter: A–Z, then 0–9, `.`, `-`, `!` and a space, round and round (holding the button repeats) |
| ▶ or OK | Next letter (up to `END`) |
| ◀ or Back | Previous letter |
| OK on `END` | Done |

Letters left as `_` are left out, so `A`, OK, OK, OK, OK enters just `A`; a name left empty shows as
`---`. After **30 seconds** (the `TIME` counter) the name is taken as it stands. In a two-player game
player 1 names their row first, then player 2 — either controller can type. Then the table appears
with your new row **blinking**; after a moment OK or Back returns to the title (after 15 seconds it
goes by itself).

The score itself is saved the moment the game ends, the name when you finish typing it — if the app
is closed during the name entry, the score stays in the table as `---`.

### The high-score tables

Every **difficulty**, **ship** and **kind of game** has its own table of ten: `KESTREL  NORMAL
1 PLAYER`, `MANTA  HARD  2 PLAYERS`, `KESTREL  EASY  PRACTICE` and so on. Each row shows the rank,
the name, the score and the **zone reached** (the zone's letter, `-` for a browser test stage). A
2 PLAYERS game records both players' scores in the 2 PLAYERS table; a practice run records into the
PRACTICE table. The title's `HI` (and the HUD's in a one-player game) is the best of the 1 PLAYER
table for the difficulty and ship you chose last; a two-player game or a practice run plays against
its own table's best and never changes the title's `HI`. Two-player scores from earlier builds (which
shared the one-player tables) move into the 2 PLAYERS tables by themselves the first time the new
build starts.

### Practice

**PRACTICE** (the third entry of the title menu) opens a box over the title:

| Line | Choices |
|---|---|
| **ZONE** | `A AZURE VERGE` … `I ABYSSAL THRONE` |
| **CHECKPOINT** | `START`, then `CHECKPOINT 1`, `CHECKPOINT 2` … — as many as the chosen zone has (◀ on `START` goes to the zone's last one) |
| **LOADOUT** | `STANDARD` (the ship as it starts a game) or `FULL POWER` |
| **START** | Goes on to the DIFFICULTY box, the SHIP SELECT box and (for the KESTREL) the WEAPON SELECT screen, as for a normal game |

▲ / ▼ move between the lines, ◀ / ▶ (or OK) change the highlighted one, **Back** closes the box. The
last OK starts the chosen zone at the chosen checkpoint — always a one-player game. It is **one zone
only**: after its boss comes the zone result and then the title (through the name entry, if the
score made the practice table) — no zone map. Losing all ships works as in a game (CONTINUE?, then
GAME OVER). `SCORES GO TO THE PRACTICE TABLES` reminds you that practice scores are kept apart: they
never appear in the 1 PLAYER tables and never raise the title's `HI`.

### The sound test

**SOUND TEST** (the fifth entry of the title menu) lists everything the game can play:

| Line | ◀ / ▶ | OK |
|---|---|---|
| **MUSIC** | The music tracks by name (for example SHMUP CUP, AZURE VERGE, BULWARK ASSAULT) | Plays the track from its beginning (the first time a track may take a moment to prepare) |
| **SFX** | Every sound effect by name (`PLAYER SHOT`, `ENEMY HIT`, `WARNING SIREN`, …) | Plays the sound, from the middle of the picture |
| **STOP** | — | Stops the music |
| **BACK** | — | Closes the box; the title music comes back (Back does the same) |

### The CONTINUE? countdown

The CONTINUE? box now also shows a **time bar** that drains under the number (it turns red for the
last three seconds, when the number flashes), your **SCORE**, and — as soon as OK counts, after half
a second — a blinking `PRESS OK` and `BACK: GIVE UP` ([Continues](#continues)).

What "good" looks like:

- The attract loop starts after about 12 seconds on `PRESS OK` and never while you hold a button;
  any button brings the title back at once.
- The demo looks exactly like a game (the ship flies smoothly, enemies explode, the HUD counts the
  score) and is silent; after a few rounds every zone has been shown.
- The story's lines are readable and stay inside their box; the pictures change with the pages.
- The name entry reacts to every press, the letters are readable from the sofa, and the new row
  blinks in the table with the name you typed.
- Practice starts exactly where you chose, with the chosen loadout; its scores appear only in the
  PRACTICE tables.
- Every sound-test track and sound plays; the sounds come from the middle, not from one side.

## On the Samsung Smart Monitor / TV

The TV build is installed from the development PC like the input probe — see
[install-on-tv.md](install-on-tv.md#installing-the-game-preview) for the commands. After
the first install it appears in the monitor's **Apps** list as **Shmup Cup**.

| Remote button | What it does in the preview |
|---|---|
| Directional pad (◀ ▲ ▶ ▼) | Menus: moves the highlight. Game: flies the ship. Name entry: ▲ ▼ change the letter, ◀ ▶ move between the letters |
| **OK** (centre) | Menus: chooses the highlighted entry (on the title first `PRESS OK`). Game: takes the highlighted power-up once you have collected capsules (see checks 9 and 20); with nothing to take, a short low "no" buzz |
| **Back** (↩) | Game: opens the pause menu. Pause menu: resumes. A question: answers NO. Title: asks **EXIT SHMUP CUP?** — YES closes the app and returns to the monitor's home screen. Attract loop (demo, high scores, story): back to the title. Name entry: back one letter. On the loading and error screens it closes the app at once |
| **Play/Pause** ⏯ (if your remote has it) | Pauses and resumes the game |
| **Home** | Leaves the app; everything freezes (and falls silent) while it is in the background. Reopening it brings you back where you were — during a game, to the pause menu — and nothing jumps ahead |
| **Volume +/−, Mute** | The monitor's own volume, as in any app. The game's own volumes (MASTER, MUSIC, SFX) are under **OPTIONS** |
| Everything else | Read by the game every tick, but nothing reacts to it yet (the gun fires without any button) |
| A **gamepad** (USB or Bluetooth, optional) | Menus and 1 PLAYER games: works like the remote (player 1). In a **2 PLAYERS** game: START (or A) makes it **player 2's** and brings player 2 in ([Two players](#two-players), checks 45–47) |

On the TV, every game starts in **AZURE VERGE** ([The first zone](#the-first-zone-azure-verge)), with
enemies, capsules, the boss and the zone's music, and goes on across the **ZONE MAP** through
four more zones to an ending ([The zone map](#the-zone-map-a-run-through-nine-zones)). The normal
TV build has no shortcut to the boss — it comes after about three minutes in every zone; the debug
build has one (key 8 once the developer tools are open —
[debug-tools.md](debug-tools.md)).

Things to check on the monitor and report:

1. A loading bar (or nothing at all, if it is very quick) and then the **title screen** — the
   logo, a blinking `PRESS OK`, `HI` at the bottom, drifting stars — never a black screen that
   stays black. OK, then OK on 1 PLAYER, then OK on NORMAL in the DIFFICULTY box, then OK on the
   KESTREL in the SHIP SELECT box, then OK on START in the WEAPON SELECT screen: the view starts to
   scroll and the ship flies in.
2. **Both HUD bars are complete** (new layout): the top bar's `1P` and score on the left, `HI`
   and its score in the middle, `2P ------` on the right; the bottom bar's two ship icons on the
   left and the power meter's seven boxes `SPEED` … `!` after them — every label readable. If one edge is cut off, note which — that would mean the monitor overscans or the
   app runs at a different resolution.
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
7. The stars, the planet and the ground scroll **smoothly**.
8. **The gun fires on its own** as soon as the ship has flown in, without touching any button:
   small cyan-and-white darts leave the ship's nose, two at a time, and fly straight to the
   right edge at an even speed. They never appear over the HUD bars, and they keep coming
   wherever you fly — also while you hold a direction. Each shot starts with a tiny
   white-and-yellow spark just in front of the nose that is gone almost at once. Report if the
   darts or the spark stutter, flicker, show up as magenta-and-black squares, or stop.
9. **Hold an arrow and press OK while you hold it** (for example hold ▶ and press OK a few
   times): the ship must keep moving the whole time, without stopping or stuttering when OK is
   pressed or released. Report whether it does — it tells us if the remote drops a held arrow
   when OK is pressed, which decides how comfortable power-ups are on the TV.
10. After Home → reopen during a game, the app comes back without a black screen, on the **pause
   menu** over the ship where you left it; RESUME continues — and the shot sounds come back with
   it.
11. **Sound** (new in this build — turn the monitor's volume up): every shot plays a short, high
   blip, a little to the left of the middle (the ship flies on the left side of the picture;
   sounds come from where they happen — fly to the right edge and they move towards the right
   speaker). Press **OK** once before collecting anything: a short, low "no" buzz.
   Report whether the shot sounds feel **immediate** — in time with the darts leaving the nose —
   or noticeably late, and whether they ever crackle, stutter, drop out or stop. The **title
   music** (SHMUP CUP) plays on the title screen and fades out when a game starts; then AZURE
   VERGE's own theme plays, and at the WARNING the siren and the boss theme (BULWARK ASSAULT).
12. **The title menu**: OK on `PRESS OK` shows 1 PLAYER / 2 PLAYERS / PRACTICE / OPTIONS / SOUND
   TEST / EXIT with 1 PLAYER highlighted; ▲ / ▼ move the highlight, each move with a soft click; holding ▼ keeps moving it
   after a moment. Report any skipped or doubled step, or a press that did nothing.
13. **Pause**: in a game, **Back** freezes and darkens the picture and shows PAUSE with
   RESUME / OPTIONS / RETRY STAGE / QUIT TO TITLE. Back again (or RESUME) continues exactly where
   it stopped. RETRY STAGE starts over with a zero score. QUIT TO TITLE asks first (NO is
   highlighted); YES shows the title. Play/Pause, if your remote has it, pauses and resumes too.
14. **Leaving the app**: on the title, **Back** (or EXIT in the menu) asks **EXIT SHMUP
   CUP?** with NO highlighted. NO or Back keeps the app running; only **YES** closes it and returns
   to the monitor's home screen. Report if Back ever closes the app without asking (except on the
   loading or error screen).
15. The menus answer the remote **quickly** — as quickly as the ship does — and the text in the
   boxes is readable from the sofa.
16. **The Options screen** (new): on the title, OK → **OPTIONS** shows a box with MASTER, MUSIC
   and SFX (full bars, `10`), `CONTROLS  SAFE 4-WAY (DEFAULT)` and BACK. On **MUSIC** press ◀ a few
   times: the title music gets quieter with every step, and at `0` it is silent; ▶ brings it back.
   On **SFX** the clicks of each step get quieter; on **MASTER** everything does. Report whether
   the steps feel even (no big jump between two steps), whether a change comes at once, and
   whether the bars and numbers are readable. In a game, Back → OPTIONS opens the same box over
   the frozen game; BACK returns to the pause menu.
17. **Kept after closing the app** (new — the check the plan asks for): set MUSIC to `5` and SFX
   to `3`, choose BACK, then close the app (Back on the title → **YES**). Open it again: the title
   music plays at the lower volume, and OPTIONS shows `5` and `3`. Also press **Home** while the
   Options screen is open and come back: the box is still there with your changes, and they are
   kept once you choose BACK.
18. **CONTROLS** (new): in OPTIONS move to CONTROLS and press ◀ / ▶: it switches between
   `SAFE 4-WAY (DEFAULT)` and `FAST 8-WAY`, and the menu keeps working with the arrows, OK and Back
   whichever is shown. Choose **FAST 8-WAY**, BACK, 1 PLAYER and fly: hold each direction for a few
   seconds — report whether the ship moves smoothly or stutters / stops for a moment (FAST 8-WAY
   has no hiccup protection; if it stutters, your remote needs SAFE 4-WAY — switch back). Close
   and reopen the app: CONTROLS still shows the profile you chose.
19. **AZURE VERGE** (new): once the game starts the view scrolls to the right on its own over rolling
   ground, with a blue planet's rim low in the background, and the first row of green pods weaves
   in about three seconds later. Watch the scrolling for a few minutes: it should stay smooth in
   the slow cave (from about 1:15) and in the fast stretch (from about 2:25) — report any stutter,
   jump or flicker, with the time into the stage.
20. **Capsules and OK** (new on the TV): shoot the first red saucer (about 8 s in) — it leaves a
   blinking capsule; fly close and it drifts into the ship with a ding, and the power meter's
   `SPEED` box lights up. Press **OK**: a rising trill, and the ship moves faster. Report whether
   taking power-ups with OK in the middle of the action feels natural with the remote.
21. **Dodging with the remote** (new): every bullet of the zone — and every laser and needle of the
   boss — is meant to be avoidable with **single arrow presses**. Report the time into the stage
   of any spot where you could not get out of the way, and whether FAST 8-WAY (check 18) makes a
   difference there.
22. **The rock** (new): in the cave (about 1:15–2:25) the ship explodes when it touches the floor
   or the ceiling; the cave is always wide enough to fly through. Report any spot that felt too
   narrow or where the ship exploded without touching rock.
23. **The boss** (new): at about 3:00 the WARNING band, the siren and the red pulses, then HALCYON
   BULWARK glides in and its theme starts. Each laser first blinks as a thin line along its row —
   step up or down out of it — and then fires; shoot the four plates in front of the glowing core,
   then the core. Report whether the WARNING text is readable from the sofa, whether the lasers'
   warning comes early enough, and roughly how long the fight took. After the final blast your
   ship flies out and the **ZONE A CLEAR** result shows your score (checks 53–56 go on from there).
24. **Losing ships and high scores on the TV** (new): bullets, enemies and rock now destroy the
   ship — it flies in again blinking, a spare-ship icon goes, and after the last one comes
   **GAME OVER** (with **NEW HI-SCORE** for a new best). Close the app (Back on the title → YES),
   open it again: the title's `HI` shows your best score.
25. **The DIFFICULTY box** (new): on the title, OK → 1 PLAYER opens it with NORMAL highlighted and
   `LIVES 3`, `CONTINUES 3` and `HI` underneath. ▲ / ▼ move the highlight (wrapping round) and the
   numbers change with it — EASY `5` / `5`, HARD `3` / `2`, ARCADE `2` / `0`. Back returns to the
   title menu; OK on **EASY** (then OK on START in the WEAPON SELECT screen) starts a game with four
   spare-ship icons. Report whether the box is readable from the sofa.
26. **Extra ship** (new): play NORMAL until the score passes 20,000: a short "1UP" jingle plays even in the middle of explosions, and a spare-ship icon
   appears. Report if it is missing or drowned out.
27. **Continue** (new): on NORMAL lose every ship (fly into the rock of the cave, for example):
   instead of GAME OVER, **CONTINUE?** with a countdown from 9 and `CREDITS 3`, a tick each second,
   the music fading. Press **OK**: the stage goes back to its last checkpoint, the zone music starts
   again, the ship flies in without its power and three ships, and the score now ends in `1`. Lose
   everything again and press **Back** on the countdown: GAME OVER. Once more and wait: at `0`
   GAME OVER appears by itself. Report whether the countdown is readable and whether OK or Back
   ever did nothing.
28. **ARCADE** (new): start on ARCADE and lose both ships: GAME OVER comes without a countdown, and
   each loss sends the stage back to its last checkpoint with the ship's power gone.
29. **BULLETS** (new): on the title, OK → **OPTIONS**, move to **BULLETS** and press ▶: it steps
   `STANDARD` → `DEUTERANOPIA` → `PROTANOPIA` → `TRITANOPIA` and round again. Choose one, BACK,
   START and play: the enemy bullets (and HALCYON BULWARK's lasers) now have that set's colours,
   and the red family's bullets have a dark centre, the purple family's a single bright dot.
   Pause → OPTIONS → change BULLETS: the frozen bullets change colour at once. Close and reopen
   the app: BULLETS still shows your choice. Report whether the three kinds of bullet are easy to
   tell apart from the sofa in each set — and, if you (or a tester) have a colour vision
   deficiency, which set works best.
30. **Points for cancelled bullets** (new): destroy HALCYON BULWARK's core while its needles are in
   the air (or take a Mega Crash with bullets on the screen): each bullet twinkles and leaves a
   small gold diamond that hangs for a moment, then flies up to your score in the top bar, where
   the score goes up by 10 for each one that arrives. Report whether the diamonds are visible
   from the sofa and whether any of them gets stuck on the screen.
31. **The WEAPON SELECT screen** (new): OK on a difficulty opens it with START highlighted, the
   panel on the left and the KESTREL flying on the right behind it, firing. ▲ moves up the lines —
   MISSILE, DOUBLE and LASER are grey and skipped. On **TYPE** press ▶: `TYPE B`, `TYPE C`, `TYPE D`,
   `EDIT`, then `TYPE A` again, and the preview's weapons change each time (Type B's cyan rings,
   Type C's swirling beam, Type D's twin beams). **Back** returns to the DIFFICULTY box; OK there
   brings the screen back with your choice still shown. Report whether it is quick to use, whether
   the text is readable, and whether the preview ever stutters.
32. **Playing another type** (new): choose **TYPE B**, START, and collect capsules in AZURE VERGE:
   the power meter's boxes read `SPREAD` `TAIL` `RIPPLE`. Take MISSILE — orange bombs arc down and
   burst on the ground; take LASER — rings grow as they fly and hit what they touch; take DOUBLE —
   a second shot flies backwards. Try TYPE C and TYPE D the same way (Type D's FREE WAY shot follows
   the last direction you moved — fly up, and it fires up). Report which weapons are easy to see
   and use with the remote.
33. **EDIT** (new): choose `EDIT` on TYPE — MISSILE, DOUBLE and LASER turn white. Pick a weapon on
   each with ◀ / ▶ (the preview shows the one on the highlighted line), START, and check the game
   fires exactly those weapons.
34. **The `!` choices** (new): set **! SLOT** to **LIFE OPTION**, START, and collect seven capsules
   (the highlight reaches `!`): OK turns your spare ships into Options — the orbs appear and the
   spare-ship icons go. Try **FULL BARRIER** (a fresh Force Field even when the old one is worn),
   **SPEED DOWN** and **NORMAL** too; a greyed `!` box gives the "no" buzz on OK. Report whether
   the choices are clear.
35. **AUTO and ORDER** (new): set AUTO to **ON**, highlight ORDER and press OK: the AUTO ORDER box
   opens on the right with the order in twelve lines. Change a line or two with ◀ / ▶, then Back:
   the box closes and ORDER shows the new letters. START and collect capsules: the power-ups are
   taken by themselves in that order, without OK. Report whether the box is readable and whether
   Back ever did something else than close it.
36. **Option types** (new): on the WEAPON SELECT screen move to **OPTION** and step through
   `TRAIL`, `SNAKE`, `FORMATION`, `ROTATE` with ◀ / ▶ — the preview's two orbs change at once, and
   FORMATION / ROTATE spread out and pull back every second and a half. Play AZURE VERGE with
   each: take OPTION a few times and fly around. SNAKE should swing out behind the ship and keep
   its curve when you stop; FORMATION sits in a `>` behind you; ROTATE circles the ship. Report
   which ones are useful with the remote.
37. **Spreading with the remote** (new): with FORMATION or ROTATE Options in the game, press **Ch ▲**
   once — the Options spread out (FORMATION into a wide `V`, ROTATE into a wider circle) — and
   again to pull them back. Then **hold OK** for a moment: they spread while you hold it and come
   back when you let go; a quick OK press to take a power-up must never move them. Report whether
   Ch ▲ answers every press exactly once (no double toggles).
38. **The pod shields** (new): set **? SLOT** to **SHIELD**, START and take `?` (six capsules): two
   small gold pods appear at the ship's nose. Let enemy bullets hit them — a pod dims towards red
   as it wears and breaks after 14 hits while the other stays. Try **FREE SHIELD** (move up, then
   take `?` — the pair appears above the ship; take `?` again after moving down for a second pair)
   and **ROTATE** (two pods circling the ship). Report whether the pods are visible from the sofa.
39. **REDUCE and FULL BARRIER** (new): set **? SLOT** to **REDUCE**, START and take `?`: a faint
   dotted green ring appears round the ship, and bullets that pass close by no longer destroy it;
   two hits end it. With **! SLOT** on **FULL BARRIER**, taking `!` restores a worn shield — pods
   included — to full strength. Report whether you can tell REDUCE is active.
40. **The SHIP SELECT box** (new): after OK on NORMAL the SHIP SELECT box appears with the KESTREL
   highlighted and its picture on the right; ▼ highlights the **MANTA** (a flat ship with a green
   canopy, `DIRECT ITEMS` and its hints below). ▲ / ▼ wrap round. Back returns to the DIFFICULTY
   box, and Back on the WEAPON SELECT screen returns to the SHIP SELECT box. Report whether the box
   and the picture are readable from the sofa.
41. **Flying the MANTA** (new): OK on the MANTA starts AZURE VERGE at once (no WEAPON SELECT). The
   bottom bar shows `SHOT`, `SUB`, `ARM`, `SPD` with small squares and `DISC` at the end instead of
   the power meter. Shoot the red saucers and complete groups: each leaves a **colour item** that
   drifts slowly left and bounces off the bars. Fly into a red one (a SHOT square lights and the
   gun gets stronger), a green one (SUB), a blue one (a green ring round the ship, three ARM
   squares). OK must do nothing. Report whether the colours are easy to tell apart and from the
   enemy bullets, and whether ten seconds is enough time to reach an item with the remote.
42. **The speed toggle** (new): with the MANTA, press **Ch ▼** (channel down) a few times: the ship
   gets faster, then slow, then back to the middle speed, with a ding each time, and the SPD squares
   follow. Hold Ch ▼ for a second: it must change only once. Report whether the three speeds feel
   useful and whether Ch ▼ ever changed twice for one press.
43. **The Arm and the rock** (new): with the MANTA and an Arm (a blue item), touch the cave's
   floor or ceiling briefly: the Arm loses a hit instead of the ship being destroyed (the KESTREL's
   shields never do that). Collect more blue items later: after the fourth the ring turns silver
   (four hits), after the ninth gold (five hits). Then lose the ship on NORMAL: it comes back
   without the Arm and one SHOT level lower. Report anything unexpected.
44. **The new title menu** (new): OK on `PRESS OK` shows **1 PLAYER** / **2 PLAYERS** / OPTIONS /
   EXIT with 1 PLAYER highlighted; OK on 1 PLAYER plays exactly as START did before (DIFFICULTY,
   SHIP SELECT, …), and OPTIONS is now the third entry (the fourth since the front end added
   PRACTICE — check 80).
45. **Two players on the TV** (new — you need a gamepad connected to the monitor by USB or
   Bluetooth; press one of its buttons once so the monitor notices it): on the title choose
   **2 PLAYERS**, then NORMAL, the KESTREL and START with the remote. The game starts with one ship,
   and a yellow `PRESS START` blinks on the right of the top bar. Press **START** on the gamepad: a
   red-orange KESTREL flies in with a short chirp (the game does not pause), the bottom bar splits
   into two halves, and from then on the remote flies the blue ship and the gamepad the red one.
   Report whether each controller moves only its own ship, whether both halves of the bottom bar
   are readable from the sofa, and whether the two ships are easy to tell apart.
46. **Out and back in** (new): in a two-player game let the gamepad's ship lose all its ships (fly
   it into the cave's rock): the remote's ship plays on, and the right half of the bottom bar
   blinks `PRESS START`. Press START on the gamepad: the ship flies in again at once, without the
   stage going back, and the last digit of the right-hand score is now `1`. Then press START on the
   gamepad again: the pause menu opens; RESUME (or START once more) continues without the game
   pausing a second time.
47. **Unplugging** (new): during a two-player game unplug (or switch off) the gamepad: its ship
   stays in the game, still firing but not moving. Plug it back in and press **A** on it: it flies
   player 2's ship again. Report anything unexpected.
48. **The picture options** (new): OPTIONS now lists SCALE, SHAKE, FLASHES and HITBOX under
   BULLETS, and all entries fit inside the box (since the Options build they are on the DISPLAY
   page — check 83). Step SCALE through INTEGER, FIT and STRETCH with
   ◀ / ▶: on the monitor's usual 1920 × 1080 picture all three should look the same, sharp and
   without a border — report the monitor model if the picture changes size or gets a border.
49. **SHAKE and HITBOX** (new): set SHAKE to OFF and HITBOX to ON, press BACK and play: losing the
   ship no longer shakes the picture, and a small white square in a pink-red frame sits in the
   middle of your ship all the time (not while it explodes). Report whether the marker is easy to
   see from the sofa. Close and reopen the app: both settings are kept.
50. **FLASHES and the Mega Crash** (new): with FLASHES on NORMAL, take the `!` Mega Crash: the
   playfield brightens towards white for a moment, but the ship and the enemies stay visible
   through it. Then set FLASHES to REDUCED and do it again: a much dimmer flash. Report whether
   either is uncomfortable.
51. **BOSS HP** (new): OPTIONS now lists BOSS HP under HITBOX, and all eleven entries fit inside
   the box (since the Options build on the DISPLAY page). Set it to ON, press BACK and play to HALCYON BULWARK (the debug build's key 8 jumps
   there): while the boss glides in, `BOSS` and a red bar replace `HI` in the middle of the top
   bar and the bar fills up; it gets shorter as the shield plates and then the core take hits,
   empties when the core is destroyed and disappears with the big blast (`HI` is back). Report
   whether the bar is easy to read from the sofa.
52. **BOSS HP kept** (new): close and reopen the app — BOSS HP is still ON. Set it to OFF: `HI`
   stays in the top bar through the whole boss fight.
53. **The zone result and the map** (new): after zone A's boss the ship flies off to the right,
   then **ZONE A CLEAR** shows the score, `KILLS` in percent and the two bonuses; the score jumps
   by their sum. After five seconds (or OK) the **ZONE MAP** opens and the music fades. Check with
   the remote: ▲ / ▼ switch between B and C (the blinking box and the dotted line to it move
   together, the panel shows the chosen zone's name and text), Back asks **QUIT TO TITLE?** (NO
   goes back to the map), OK blinks `LAUNCH` and starts the chosen zone about a second later.
   Report whether the map is readable from the sofa.
54. **The next zone** (new): the zone starts with **ZONE B** (or C) and its name on a band near
   the top while the ship flies in; the music starts with the zone; your score, spare ships and
   power-ups are exactly what they were before the map. Zone B (BRINE NEBULA) or C (DUNE EXPANSE)
   plays for about three minutes before its WARNING and its own boss (checks 57–60), then the result
   and the map again — and the same for zone D (MAGMA DEEP) or E (TEMPEST RIDGE) after it (checks
   61–64), zone F (CELL VAULT) or G (PRISM LABYRINTH) after that (checks 65–69) and the final zone H
   (IRON CITADEL) or I (ABYSSAL THRONE) last (checks 70–73).
55. **A whole run** (new): play on through D or E, F or G, to **H or I** (the debug build's key 8
   saves time). After the final zone's result the **ending** plays (checks 74–75): the ending scene
   and its story, then the **ENDING** card with the ending's name, your route, your score and
   `THANK YOU FOR PLAYING`, then the credits; at the end the title comes back — with the title
   music — and the title's `HI` shows the run's score. Start a new game: zone A's own music plays
   again from the start. Report the route and the ending name.
56. **Game over in a later zone** (new): lose all ships in zone B or later: CONTINUE? and GAME OVER
   work as in zone A, and the run's score is saved.
57. **BRINE NEBULA** (new): choose B on the map. The title card reads **ZONE B** / **BRINE NEBULA**
   and a new tune plays (not AZURE VERGE's). The sea along the bottom wobbles and shifts colour
   smoothly — only the background, never the ship or the bullets. Bubbles burst into smaller ones
   and green bubbles free a fish where they were; urchins sit exactly on the reef. About 1½ minutes
   in, SPUME HERALD comes in without a WARNING while the screen keeps scrolling, and leaves after 30
   seconds if you do not destroy it. Report whether the bubbles are easy to tell apart from the
   enemy bullets on the TV.
58. **GALVANIC MAW** (new): after the WARNING the mechanical fish comes with its own boss tune. Its
   jaws open apart and close together with the mouth, every time and in every phase — they never
   end up out of place; shots clink while the mouth is shut and hit it while open; the homing
   rockets can be outrun with single arrow presses. The boss HP bar (if BOSS HP is ON) moves only
   when the mouth is hit.
59. **The secret bonus stage** (new): in BRINE NEBULA, about 2:10 in (the debug build: key 7 twice
   — the third checkpoint —, then about 20 seconds), fly under the left of the two reef blocks at the top and up
   into the gap between them: the chime, then **BONUS STAGE** / **PEARL GROTTO**. Collect the gold
   capsules (+1,000 each) and the 1UP (one more ship icon), shoot through the two brick walls; at
   the end the zone result follows without GALVANIC MAW and the map opens. Report whether the gap
   is easy to find and to fly into with the remote.
60. **DUNE EXPANSE** (new): choose C on the map (in a new game). Its own tune;
   the dune ridge and the suns shimmer in the heat (background only). Sand worms burst out of the
   ground in front of the ship and dive back in; beetles walk upside down on the canyon ceiling.
   At the end SANDGRAVE WIDOW scuttles about with its own boss tune; its head reacts only after
   both fangs are gone, and then the blinking silk lines come one at a time — each avoidable by a
   single step up or down.
61. **MAGMA DEEP** (new): after B or C choose D on the map. The title card reads **ZONE D** /
   **MAGMA DEEP** and its own tune plays. The volcano peaks shimmer (background only); cones throw
   lava bombs in arcs. About 1:17 in the scrolling stops and the whole picture sinks down into the
   caves for about 2½ seconds — smoothly, with no flicker and your ship never pushed into rock —
   and the lava lake rises into view and rolls its colours. Fly the brick maze with the remote:
   every wall has a gap you can reach with single ▲ / ▼ presses, and shot bricks break. Report
   whether the bricks are easy to tell from the cave rock on the TV.
62. **CINDER BASTION** (new): after the WARNING the battleship comes with its own boss tune. Its
   shield arms turn smoothly round the core (faster later, changing direction without jumping);
   shots clink on the arms and hit the core between them; each blinking laser line can be avoided
   by one step up or down. With BOSS HP ON the bar moves only when the core is hit.
63. **TEMPEST RIDGE** (new): choose E on the map (in a new game, after B or C). Its own tune; the
   storm clouds roll and change colour, the rain slants across the picture — all behind the ship,
   the enemies and the HUD. Kites and jets come in **from the left edge behind the ship** and pass
   it; stepping out of their row avoids them. Report whether you can see them coming in time on
   the TV.
64. **SQUALL STEED** (new): after the WARNING the seahorse bobs gently with its own boss tune. Its
   lids open and close together with the chest, every time; shots clink while the chest is shut and
   hit it while open; the little seahorses come only out of the open chest and can be outrun or
   shot. Report the time the fight took.
65. **CELL VAULT** (new): after D or E choose F on the map. The title card reads **ZONE F** /
   **CELL VAULT** and its own tune plays. The wall of cells at the back pulses through its colours
   and sways gently (background only). Chasing cells drift in, follow the ship for a moment and swim
   on; a dividing cell splits in two where it is shot. About a minute in, fly the seven tissue walls
   with the remote: every wall has a gap you can reach with single ▲ / ▼ presses; shoot a hole into
   one and watch it grow back about four seconds later — never on top of your ship. Report whether
   the tissue is easy to tell from the rock on the TV.
66. **The tentacles and MANTLE REGENT** (new): from about 1:38 the claws on the floor and ceiling
   lunge at the ship as it passes and tug it for a moment — report whether you can fly on against
   the tug with the remote. After the WARNING the squid comes with its own boss tune: its two
   tentacles curl in front of the eye and open again, together and smoothly; shots clink on the
   curled tentacles and hit the eye while they are open; breaking a tentacle root makes the whole
   tentacle fall off. With BOSS HP ON the bar moves only when the eye is hit (not the roots).
67. **PRISM LABYRINTH** (new): choose G on the map (in a new game, after D or E). Its own tune; the
   crystal facets at the back glint one after another and the spires shimmer (background only).
   About 1:13 in, the crystal walls hang from the ceiling and rise from the floor in turn — zigzag
   through with single presses. From about 1:47 the cube rushes: cubes fly at the ship and stick to
   the crystal pillars as blocks, which break after two hits. Report whether the stuck cubes are easy
   to see coming on the TV.
68. **The second secret bonus stage** (new): in PRISM LABYRINTH, about 0:48 to 1:05 in (the debug
   build: key 7 once — the second checkpoint —, then a few seconds), shoot down all **four** crystal
   turrets of the gallery, two on the floor and two on the ceiling. When the gallery has passed
   (about 1:07): the chime, then **BONUS STAGE** / **GLIMMER CACHE**. Collect the gold capsules
   (+1,000 each) and the 1UP (one more ship icon), fly round the two crystal walls; at the end the
   zone result follows without FACET MONARCH and the map opens. Then play the zone again and leave
   one turret standing: nothing happens and the zone goes on. Report whether the ceiling turrets are
   easy to hit with the remote.
69. **FACET MONARCH** (new): after the WARNING the crystal core comes with its own boss tune. Shots
   clink on the core until both crystals in front of it are broken; the arms open and close like
   claws smoothly, also when the crystals break; in the last phase each blinking laser line can be
   avoided by one step up or down and stays where it was fired. With BOSS HP ON the bar counts the
   two crystals and the core together. Report the time the fight took.
70. **IRON CITADEL** (new): after F or G choose H on the map. The title card reads **ZONE H** /
   **IRON CITADEL** and its own tune plays. The little amber lights run along the steel wall at the
   back (background only). Hatches open and let out mites that ram at the ship; about 48 seconds in,
   the **pistons** swing in and out of the floor and the ceiling — fly between them with single
   ▲ / ▼ presses — while the laser emitters blink their warning lines. Report whether the moving
   pistons are easy to see coming on the TV.
71. **The parade and IRON SOVEREIGN** (new): from about 1:42 four smaller copies of earlier bosses
   come in one after another without a WARNING, each leaving after about 16 seconds. After the
   WARNING, IRON SOVEREIGN comes with its own boss tune: shots clink on the core until both plates
   are broken; the shield wheel turns round the core smoothly and changes direction without
   jumping; in the last part the purple spiral turns and can be dodged by moving with it. With BOSS
   HP ON the bar counts the plates and the core. Report the time the fight took.
72. **ABYSSAL THRONE** (new): choose I on the map (in a new game, after F or G). Its own tune; the
   glowing specks at the back twinkle and the water sways gently (background only). A depth mine
   stops and flashes when the ship comes close, then bursts into a ring with gaps; from about 0:50
   eels burst out of the trench floor. Report whether the mines' flash is easy to see on the TV.
73. **The ABYSS ARK and THE HOLLOW KING** (new): after the WARNING the scrolling stops and the view
   glides along the long battleship; its turrets turn to the ship before they fire, and the hooks
   can be outrun or shot. With a powered-up ship bring the heart down within 90 seconds: the blast
   reveals the anglerfish, whose jaws open and close with its mouth and whose lure sways smoothly;
   shots hurt it only while the mouth is open. Then play zone I again and let the ARK's 90 seconds
   run out: it stops firing and sails off to the right, and the zone ends without THE HOLLOW KING.
74. **The ending scenes** (new): finish a run in zone H and one in zone I. After the result the
   ending theme starts: IRON CITADEL — explosions on the fortress, your ship flying off to the
   right, the citadel falling; ABYSSAL THRONE — bubbles, your ship rising to the light, the ARK
   sinking (or sailing off, after an escape). The story's lines appear one by one under the scene
   and are readable from the sofa; OK shows them all, OK again the result card. A run without a
   single lost ship adds the rising sun and the ending **THE CITADEL FALLS SILENT** / **THE DEEP IS
   STILL**. Report the ending names you got and whether anything in the scenes looks wrong.
75. **The credits** (new): OK on the result card (`OK: CREDITS`) starts the credits with their own
   tune; the lines scroll up smoothly and are readable; they stop in the middle, then the title
   comes back (since the front end build through the name entry — check 78). In another run press
   OK or Back during the credits: the credits end at once.
76. **The attract loop** (new): on the title, leave `PRESS OK` alone for about 12 seconds. A zone
   starts playing by itself — `DEMO PLAY` and `PRESS OK` take turns at the top, the zone's title
   card shows, the HUD counts the computer's score — **without any sound**. After about 40 seconds
   the `HI-SCORES` table appears (five seconds per table), then the story crawls up over its
   pictures (the rising star, the fortress and explosions, the two ships and the logo), then the
   title. Press **OK** during the demo, **Back** during the tables and an **arrow** during the story:
   each time the title comes back at once (Back never asks EXIT SHMUP CUP? there). Report anything
   that looks wrong in the demo (a ship flying into walls, a frozen picture) and whether the story's
   lines are readable.
77. **Every zone's demo** (new): let the loop run several times: each round shows the next zone (A,
   B, C … I). The MANTA flies zones B, E and H. Report a zone whose demo ends after a few seconds
   (the tables coming early) — that would mean the recording no longer fits the game.
78. **Your initials with the remote** (new): play a game on EASY until GAME OVER with some points
   (a new device or an empty table: any score counts). After the GAME OVER box, **NEW HI-SCORE!**
   asks for your name: the first box shows `A`. Use **▲ / ▼** to pick a letter, **▶** or **OK** for
   the next one, **◀** or **Back** to go back, and OK on `END`. The table appears with your row
   blinking, then OK returns to the title. Close and reopen the app: the table still has your name
   (the attract loop shows it). Also try doing nothing for 30 seconds: the name is taken as it is.
79. **The high-score tables** (new): after a few games on different difficulties, with both ships
   and in a 2 PLAYERS game, watch the tables in the attract loop: each is titled with the ship, the
   difficulty and `1 PLAYER` / `2 PLAYERS` / `PRACTICE`, holds at most ten rows best first with the
   zone reached (`A`, `B` …). In a 2 PLAYERS game with a gamepad both players type their initials in
   turn, and the rows land in the 2 PLAYERS table, not the 1 PLAYER one.
80. **Practice** (new): on the title choose **PRACTICE**. Set ZONE to `B BRINE NEBULA`, CHECKPOINT to
   `CHECKPOINT 1` (◀ on `START` jumps to the zone's last checkpoint), LOADOUT to `FULL POWER`, then
   OK on START, NORMAL, the KESTREL and START: zone B starts at its first checkpoint with a fully
   powered ship. Lose all ships (decline the continue): the name entry opens for the **practice**
   table, and the title's `HI` does not change. After the zone's boss a practice run returns to the
   title (no zone map). Report a zone or checkpoint that does not start where the box said.
81. **The sound test** (new): on the title choose **SOUND TEST**. On MUSIC press ◀ / ▶ to pick a
   tune and OK to play it (the first play of a tune may take a moment); STOP silences it. On SFX
   pick sounds and press OK: each one plays **from the middle** (not from one speaker). BACK (or
   Back) closes the box and the title music comes back. Report any tune or sound that does not play.
82. **The CONTINUE? countdown's new look** (new): lose your last ship on NORMAL. The box shows the
   number over a draining bar (red for the last three seconds, the number flashing), your score and
   the continues; after half a second `PRESS OK` blinks with `BACK: GIVE UP` under it.
83. **The Options pages** (new): OPTIONS shows MASTER, MUSIC, SFX, CONTROLS, DISPLAY, GAME, BACK.
   OK on each page opens it in the same box, Back returns to OPTIONS; every page fits inside the box
   and is readable from the sofa. DISPLAY has the six picture settings of before and they still
   work at once. Your volumes, profile and picture settings from the previous build are still there
   (the save was updated, not reset) — report it if anything went back to its start value.
84. **CONTROLS with the remote** (new): AUTOFIRE is greyed out (the ship always fires on its own).
   Set RATE to 7.5/S, BACK, start a game: the ship fires visibly slower; set 30/S and start again:
   faster. Set DEBOUNCE to 0 TICKS and hold an arrow in the game — report whether the ship ever
   stutters (it should with a remote that has the hiccup); set it back to AUTO.
85. **Rebinding the remote** (new): CONTROLS → REBIND KEYS shows `REMOTE CONTROLS` with MODE GAME.
   OK on POWER-UP, then press **Ch ▼** within five seconds: the line reads `SWAPPED WITH SPEED` and
   POWER-UP shows `CH-`, SPEED `OK`. In a game Ch ▼ now takes power-ups and OK switches the MANTA's
   speed. Back while `PRESS A KEY FOR …` shows cancels (`CANCELLED`), and Back is never taken as a new
   key. RESET brings OK back to POWER-UP. Close and reopen the app: a change you left in place is
   still there. Report any remote button that was not accepted.
86. **The input test** (new): CONTROLS → INPUT TEST: `DEVICE REMOTE`; each arrow lights its side of
   the cross, OK lights POWER-UP, Ch ▲ SPECIAL, Ch ▼ SPEED, Play/Pause PAUSE. Press two arrows at
   once: report whether two sides light (the remote reports diagonals) or only one. Holding Back
   for a second closes the test.
87. **The GAME page** (new): set LIVES to 5, PENALTY to ARCADE, BACK, then 1 PLAYER: the DIFFICULTY
   box shows `LIVES 5` on every difficulty, the game starts with five ships, and losing one takes
   all your power and sends you back to the checkpoint. Then from the pause menu open OPTIONS →
   GAME: DIFFICULTY is greyed out. Set ONE BUTTON to ON: AUTO POWER and PENALTY grey out; RETRY
   STAGE — capsules are now taken by themselves. Close and reopen the app: the GAME settings and the
   difficulty you chose last are kept.

The fully powered ship (`?loadout=full`), the shortcut to each zone's boss (`?skip=boss`), the
twelve test stages (the Test Range, the Boss Range with its test boss, the Hunter Range with the
Option Hunters and the blue capsule, the Direct Range with the MANTA's pincer waves, the Gimmick
Range with the later zones' stage mechanics, the Raster Range with the picture effects, the
Captain, Raid, Twin and Gauntlet Ranges with the advanced bosses, and the Bonus Range with its
Bonus Vault), a single zone on its own (`?stage=zone-b` … `?stage=zone-i`) and the zones' bonus
stages on their own
(`?stage=brine-grotto`, `?stage=glimmer-cache`), free flight, the showcase, the
calibration screen and the effects gallery can only be opened in a browser — the monitor's own
web browser works too, pointed at a PC running `pnpm dev` (below).

**Developer tools on the TV (debug build only).** Installed from `pnpm --filter @shmup/tizen
build:dev`, the app plays exactly like the normal build until you press **Play/Pause, then Ch ▲
three times** within three seconds: a panel with the frame rate, the frame times and the
start-up time appears, and the number keys 1–8 turn on invincibility, hit-area outlines, a freeze
with single steps, slow motion, and jumps to the next checkpoint (7) or the boss (8) — the TV's
own shortcut to the boss. Everything about it, and the release checklist to run with it, is in
[debug-tools.md](debug-tools.md).

## In a desktop browser

On a PC with the development tools installed (see the repository README):

```sh
pnpm install
pnpm dev
```

Open http://localhost:5173 (other devices on the same network can use the PC's IP
address, e.g. `http://192.168.1.20:5173`): the title screen appears. Press **Enter** five times
(past `PRESS OK`, 1 PLAYER, NORMAL in the DIFFICULTY box — or ▼ to choose another —, the KESTREL in
the SHIP SELECT box — or ▼ for the MANTA, which starts at once — and START in the WEAPON SELECT
screen — or ▲ to change the weapons first) to play AZURE VERGE (and after its boss the ZONE MAP:
▲ / ▼ and Enter choose the next zone) and fly with the arrow keys, W A S D or a gamepad;
**Esc** (or P, Backspace) pauses. http://localhost:5173/?skip=boss starts every game a moment
before the zone's WARNING, to try the boss without playing the three minutes before it. The browser version has no EXIT entry — a browser tab cannot close itself — so
Back (Esc) on the title only goes back from the menu to `PRESS OK`. To skip the title and fly
straight away, open http://localhost:5173/?scene=flight (**free flight**: the older start-up
picture with its own simpler HUD — the stage name or FREE FLIGHT in the top bar, `ARROWS MOVE` in
the bottom bar, no power meter, no pause menu, and `GAME OVER` written into the top bar; it flies
in empty space unless you add `&stage=…`). Resize
the window to see the whole-number scaling at work: the picture snaps between sizes instead of
stretching. Switching to another tab freezes the game (and its sound); coming back during a
game shows the pause menu. The Options screen works the same as on the TV (Enter
for OK, Esc or Backspace for Back); the settings and high scores are kept in this browser
([What the game remembers](#what-the-game-remembers)): finish a run on GAME OVER or at its ending,
reload the page, and the title's `HI` shows it.

**Sound in a browser starts with your first key press or click** into the page — browsers do
not let a page make sound before that, and a gamepad button does not count. So press a key (or
click the picture) once — the Enter that leaves `PRESS OK` will do; from then on you hear
everything, and the title music starts at that moment. To listen to every sound effect and song on its own, run
`pnpm audio:preview` on the PC: it writes them as WAV files into
`assets/generated/audio-preview/` (the songs with their loop played twice, so you can listen for
the seam).

To feel the TV remote's limits on a keyboard — one direction at a time, the same release
delay as on the TV — open http://localhost:5173/?profile=keyboard-remote-emulation (details in
[controls.md](controls.md#feeling-the-remote-on-a-desktop-keyboard)).

**Two players in a browser**: plug in a gamepad (press one of its buttons once so the browser
notices it), choose **2 PLAYERS** and, in the game, press START (or A) on the pad — or, without a
pad, choose **SPLIT KEYBOARD** under OPTIONS → CONTROLS → PROFILE (or open
http://localhost:5173/?profile=keyboard-split): player 1 then flies with W A S D (F = OK, G =
Back, Esc / Q = Pause), player 2 with the arrows (K = OK, L = Back, **Enter = START**) — see
[Two players](#two-players) and [controls.md](controls.md#two-players).

`pnpm --filter @shmup/tizen dev` (http://localhost:5174) opens the *TV* build in the
browser instead. It behaves the same, except that its title has no EXIT entry and Back never
closes it (there is no TV system to return to) — Back still pauses and goes back in menus.

### The scrolling test stage (browser only)

Open http://localhost:5173/?stage=test-range (add `&profile=keyboard-remote-emulation` to fly
it with the TV remote's limits) and choose 1 PLAYER on the title: the game now runs the *Test Range*
instead of AZURE VERGE (also after RETRY STAGE), and the view scrolls to the right on its own
while you fly — the ship keeps its place on screen unless you move it, and the world slides past
from right to left. The stage theme, AZURE VERGE, starts with the game
([Sound and music](#sound-and-music)). The whole run takes about a minute and a quarter (times
below count from the start of the game):

| Time (about) | What happens |
|---|---|
| 0–1 s | The ship flies in while the scrolling speeds up to its normal pace (one screen width every six seconds or so) |
| from the start | Rolling **rocky ground** along the bottom: gentle hills with 45° and shallower slopes, a light green rim on top of darker rock |
| 19 s | A **cave** comes into view on the right: rock along the top *and* the bottom |
| 25 s | As the view enters the cave, the scrolling **doubles** its speed |
| 33–36 s | The cave ends; the scrolling eases off, then slows to a crawl in open space |
| 36–45 s | A second, **deeper cave** creeps into view — the ceiling hangs lower, the floor is flatter; at about 45 s the scrolling is back to normal speed |
| 62–68 s | The rock ends; open space |
| 75 s | The stage ends and the scrolling stops for good; a second and a half later the **STAGE CLEAR** screen appears (your score and the best score), then `TO BE CONTINUED`, then the title ([the end screens](#pausing-quitting-and-the-end-screens)) |

Two star layers move behind everything: the far stars at a quarter of the scrolling speed,
the nearer ones at half. They only move while the view scrolls (unlike the open-space stars,
which drift by themselves), and they stop when the stage ends.

What "good" looks like:

- The rock is made of crisp square pixels with **no seams or gaps** between the little
  tiles, and slopes join the flat pieces cleanly.
- Rock scrolls in smoothly at the right edge — nothing pops into view late, nothing flickers,
  and the ground never jumps or shimmers relative to the ship.
- Rock is only ever inside the playfield: it never covers the top or bottom HUD bar.
- There is always a gap tall enough to fly through; the ship can reach every part of it.
- **Touching the rock destroys the ship** — even with a Force Field up (the field never
  protects against rock). While it flies in and while it blinks afterwards it passes through
  rock unharmed.

If the address names a stage that does not exist (for example a typo in `?stage=`), a game
flies in empty open space instead (no rock, no enemies); the browser's developer console then says `no stage
"…"; flying in open space`.

#### Enemies in the test stage

The enemies are placeholders too (original designs) and come on a fixed schedule — the same
every run. Most fly in from the right edge; ground enemies scroll in standing on the rock.
Your shots destroy them ([Your weapons](#your-weapons) below); the ones you miss fly past and
leave the screen. The turrets, walkers and the two lone spinners shoot at you on the way
([Enemy bullets](#enemy-bullets) below). Never more than about a dozen enemies are on screen at
once.

| Time (about) | What comes |
|---|---|
| 2 s | Five **green pods** in a row, weaving up and down on a wave through the upper part of the screen (destroy all five: a capsule) |
| 5 s | A **red saucer** with blinking lights, drifting slowly through the middle — shoot it down and it leaves a **power capsule** |
| 7 s | Five **four-bladed spinners** in single file along the lower part of the screen: each flies a loop-the-loop, exactly on the path of the one in front (all five: a capsule) |
| 9 s | A **gun turret** on the ground; it turns to face your ship as you pass it and **shoots** at it |
| 10 s | A **walker** on legs, strolling along the rolling ground towards your ship, stopping (and **shooting**), then walking on — up and down the slopes |
| 12 s | An **armoured hatch** on the ground: once it is on screen it releases a small **arrowhead fighter** every second and a quarter or so (six at most); each one rises, stops, turns towards your ship and dashes at it |
| 15 s | An **arrowhead fighter** high up: it flies in, stops for a moment and dashes straight at where your ship is |
| 17 s | Six green pods, lower down (these never leave a capsule) |
| 21 s | Another ground turret (shoots) |
| 27 s | Inside the first cave: a turret hanging **upside down from the ceiling**, shooting down at you |
| 29 s | A spinner flying a wide loop, sending out **rings of bullets** |
| 30 s | Four spinners diving down along a curve, one behind the other (all four: a capsule) |
| 33 s | Another red saucer (capsule) |
| 46–50 s | In the deeper cave: a walker, a hatch with its fighters and a ceiling turret (the walker and the turret shoot) |
| 53 s | Five green pods (all five: a capsule) |
| 58 s | A spinner that flies to a spot a little right of the screen's centre, hovers there for about a second and a half and then leaves to the left — firing rings of bullets |
| 62 s | Five spinners flying the loop-the-loop again (all five: a capsule) |
| 65 s | A last red saucer (capsule) |

What "good" looks like:

- Every enemy is a crisp little sprite — never a **magenta-and-black checkered square**
  (that would be a missing picture).
- Enemies move smoothly, without jumps or stutters, also while the scrolling speeds up or
  slows down. Enemies in a row keep their spacing, and the spinners behind the first one follow
  its loop exactly.
- Ground turrets, walkers and hatches **stand exactly on the rock** (no gap below them, not
  sunk into it); walkers follow the slopes as they walk; ceiling turrets hang upside down
  right under the rock. They scroll along with the rock.
- Turrets and walkers turn round to face your ship when you pass them.
- Enemies only ever appear inside the playfield, never over the top or bottom bar.
- An enemy that has left the screen does not come back.
- **Flying into an enemy destroys the ship** (a Force Field takes the hit instead and wears a
  step). While the ship flies in or blinks, it passes through enemies unharmed.

#### Enemy bullets

Enemy bullets are small glowing dots and ovals with a bright centre and a dark outline, drawn
on top of everything else in the playfield so they stay visible. Three kinds of enemy shoot in
this build — always the same way, so you can learn them:

| Who | What it fires | How often |
|---|---|---|
| **Gun turret** (floor or ceiling) | One **pink round** bullet aimed at your ship — it crosses the whole picture in about four seconds | Every second and a half, starting shortly after it comes into view |
| **Walker** | A fan of **three red oval** bullets, the middle one aimed at your ship, the others a little to either side | Each time it stops walking (about every two and a quarter seconds) |
| **Lone spinner** (29 s and 58 s) | A **ring of eight purple** bullets flying outwards in every direction; the next ring is turned half a gap, so you can slip between them | Every two seconds |

Aimed bullets point at where your ship **is** when they are fired, snapped to one of 32
directions (the retro feel), so a bullet can pass a few pixels beside a ship that stands still.
The pods, spinner formations, saucers, hatches and arrowhead fighters never shoot.

What "good" looks like:

- Bullets only appear **at an enemy you can see** — never out of thin air, never from an enemy
  that is still off screen or has only just appeared.
- They fly in **smooth straight lines** at a steady speed and keep going while the scrolling
  speeds up or slows down; the ovals point the way they fly.
- A bullet **disappears when it hits the rock** or leaves the screen; it never comes back.
- Bullets never cover the top or bottom HUD bar.
- Every pattern can be dodged by moving in the four arrow directions only (no diagonals
  needed) — please report any spot where you could not get out of the way.
- **A bullet that touches your ship destroys it** and costs a ship
  ([Lives](#lives-losing-your-ship-and-the-score)); with a Force Field up, the field takes the
  bullet instead and wears a step ([Power-ups](#power-ups)). While the ship is flying in or
  blinking after a loss, bullets pass through it.
- The enemies of the test stage never fire long beams (lasers); the test boss does
  ([The boss range and the WARNING](#the-boss-range-and-the-warning-browser-only)).

## Your weapons

The KESTREL's gun fires **by itself** as soon as the ship has flown in — on the TV, in the
browser and on the desktop, in every stage. There is no fire button to
press (holding Shot or Sub changes nothing); this "always-on" fire is what makes the game
playable with the TV remote. The pictures are placeholders (original designs). This section is
about the KESTREL; the MANTA's guns fire by themselves too and are described in [The
MANTA](#the-manta-colour-items-weapons-and-the-arm).

**The normal ship** (every build) has the basic gun:

- Small **cyan-and-white darts** leave the ship's nose and fly straight to the right, fast —
  they cross the whole picture in under a second.
- **At most two are on screen at a time**, as in the classic games: a new pair follows as soon
  as the earlier darts hit something or leave the screen. So the gun fires faster at enemies
  close in front of you — that is intentional.
- A dart disappears when it hits an enemy, the rock or the edge of the screen.
- One hit destroys the small enemies (pods, spinners, arrowhead fighters); the others need more
  — in the test stage saucers and walkers two, turrets and lone spinners three, the armoured hatch
  eight (AZURE VERGE's are in [its table](#the-first-zone-azure-verge)) — and
  **flash white** every time they are hit (and throw a few sparks). A destroyed enemy bursts
  into an explosion ([what it looks like](#explosions-sparks-shake-and-flashes) and
  [sounds like](#sound-and-music)) and its points are added to your score and rise from the spot
  ([the score](#the-score)); saucers and completed formations leave a power capsule
  ([Power-ups](#power-ups)).

**Other weapon types.** Everything above describes **TYPE A**, the weapons the game starts with.
The WEAPON SELECT screen before each game offers three more types and a mix of your own — their
weapons are described in [Choosing your weapons](#choosing-your-weapons). What they should look
like in play:

| Weapon | What "good" looks like |
|---|---|
| **SPREAD BOMB** (Type B) | A small orange-and-yellow bomb drops forward in a curve and bursts where it meets the ground or an enemy: a white-yellow flash that swells into a ring and cools to red in about a fifth of a second, staying where it burst while the ground scrolls on. Enemies in it flash twice. On armour it clinks but the blast keeps burning |
| **TAIL GUN** (Type B) | With each pair of darts, one flies forward and one straight back to the left edge |
| **RIPPLE LASER** (Type B) | Cyan oval rings leave the nose and grow as they fly (up to three at a time); a ring hits an enemy it touches with its edge and vanishes — a small enemy it has already passed around is not hit |
| **2-WAY MISSILE** (Type C) | Two grey missiles with red flames leave together, one climbing, one diving; the next pair follows when both are gone |
| **VERTICAL** (Type C) | With each pair of darts, one flies forward and one straight up |
| **CYCLONE LASER** (Type C) | Like the laser, but longer and thicker, with violet strands swirling round a bright core |
| **PHOTON TORPEDO** (Type D) | A violet torpedo drops forward, slides fast along the ground and keeps going through the small enemies it destroys; a tougher enemy, armour or a wall stops it |
| **FREE WAY** (Type D) | With each pair of darts, one flies forward and one in the direction you last moved — also backwards or diagonally; before you have moved, up and forward |
| **TWIN LASER** (Type D) | Pairs of short green beams, one just above the other, race forward and move up and down with the ship; each beam vanishes on the first enemy it hits |

The Options fire the chosen weapons too, each with its own bombs, rings or beams.

**Fully powered** (browser only, for testing): add `&loadout=full` to the address, e.g.
http://localhost:5173/?stage=test-range&loadout=full (or `?loadout=full` alone for AZURE VERGE,
`?skip=boss&loadout=full` for its boss), then 1 PLAYER. Every game you start (and every RETRY STAGE) begins with most of what the power-ups give
you — with the weapon type chosen in the WEAPON SELECT screen (TYPE B gives the Ripple Laser
instead of the laser below, and so on):

| What | What "good" looks like |
|---|---|
| **Faster ship** | The ship moves noticeably faster than normal (speed level 3 of 6) |
| **Laser** instead of the darts | A thin pale-blue beam shoots out of the nose, grows to about a sixth of the screen's width and races right. It passes **through** enemies, damaging each one it touches up to ten times a second, and it moves up and down with the ship that fired it. It stops at rock: the beam's front stays at the wall while its tail catches up and it vanishes. One beam per ship or Option at a time |
| **Missiles** | Small grey missiles with a flickering orange flame drop diagonally forward and down — one at a time from the ship and from each Option; the next follows as soon as the last one is gone. On the ground they **slide along the rock**, following slopes up and down; a steep wall stops them, and over a drop they fall again. Where there is no ground they simply fall off the bottom of the screen |
| **Four Options** | Four glowing red-and-orange orbs that pulse gently. They follow the path your ship has flown: **when you move, they string out behind you** along your path; **when you stop, they stay where they are on screen** (even while the stage scrolls); pushing against the edge of the screen gathers them onto the ship. Each one fires the laser and the missiles too. They float through rock, cannot be hurt, and start on top of the ship when it flies in. With another OPTION choice (SNAKE, FORMATION, ROTATE) they fly that way instead — [Choosing your weapons](#choosing-your-weapons) |
| **Force Field** | A glowing cyan ring around the ship that takes five hits — see [Power-ups](#power-ups); with another `? SLOT` choice, that shield |

What "good" looks like, with either loadout:

- Shots, beams, missiles, orbs and the Force Field only ever appear inside the playfield — never over the top or
  bottom bar — and never as magenta-and-black checkered squares.
- Everything moves smoothly and keeps its speed on screen while the stage speeds up or slows
  down.
- Darts and beams never fly through rock; missiles rest exactly on the ground while sliding
  (not floating above it, not sunk into it).
- Enemies that are hit flash white; destroyed ones turn into an explosion at once and never come
  back.
- The frame rate stays smooth even with everything firing.

## Power-ups

The KESTREL powers up the classic way, with a **power meter** (the MANTA uses colour items instead —
[The MANTA](#the-manta-colour-items-weapons-and-the-arm)). Capsules come in AZURE VERGE on
every device (28 of them — [The first zone](#the-first-zone-azure-verge)) and in the browser's
*Test Range* (http://localhost:5173/?stage=test-range, then 1 PLAYER). The meter is the row of seven boxes in the bottom
bar — `SPEED` `MISSILE` `DOUBLE` `LASER` `OPTION` `?` `!` — and you hear it too: a bright ding
for every capsule, a short rising trill when OK takes a power-up and a low "no" buzz when it has
nothing to give.

**Power capsules.** Small orange-red pills that blink. They come from every red saucer you shoot
down and every group you destroy completely (in AZURE VERGE the long wavy chains of pods never
leave one). In the test stage:

- every **red saucer** (at about 5 s, 33 s and 65 s) that you shoot down — the capsule appears
  where it was destroyed;
- every **formation** — a row of green pods or a file of spinners — that you destroy
  **completely**: the last one leaves the capsule. If a single member escapes off the screen,
  there is none. The six low pods at 17 s never leave one.

Capsules stay where they appeared and scroll away with the rock, so fly over to them. You do not
have to hit them exactly: once the ship is close (about a ship's width away), the capsule drifts
into it by itself. A capsule you touch disappears at once, and **every** capsule counts — also
several collected in quick succession.

**The meter and the OK button.** Each capsule moves the highlight one box to the right along
the meter — the highlighted box **blinks** (a yellow frame on a brown box, about four times a second); **OK** — the
centre of the remote's directional pad, Enter or C on a keyboard, X / Square on a gamepad — takes
the highlighted power-up, and no box is highlighted until the next capsule. Boxes whose power-up
you cannot take right now (the fifth Speed Up, the missiles you already have, four Options, a
Force Field that is still up …) are **greyed out**:

| Capsules since your last power-up | Highlighted | What OK gives you |
|---|---|---|
| 1 | SPEED UP | The ship moves faster (five Speed Ups at most) |
| 2 | MISSILE | Missiles that drop to the ground and slide along it (with another weapon type: that type's missile — the box shows its name, e.g. `SPREAD`) |
| 3 | DOUBLE | A second shot that climbs diagonally — replaces the laser (another type: its Double weapon, e.g. `TAIL`) |
| 4 | LASER | The long piercing laser — replaces the Double (another type: its laser, e.g. `RIPPLE`) |
| 5 | OPTION | One more glowing orb that follows the ship and copies its fire (four at most) — flying the way chosen on the WEAPON SELECT screen (TRAIL, SNAKE, FORMATION or ROTATE) |
| 6 | ? | A **Force Field** around the ship (below) — or the shield chosen for `? SLOT` (SHIELD, FREE SHIELD, ROTATE, REDUCE — below) |
| 7 | ! | **Mega Crash**: every enemy and every enemy bullet is destroyed at once — or what you chose for `!` in the WEAPON SELECT screen (NORMAL, SPEED DOWN, LIFE OPTION, FULL BARRIER — [Choosing your weapons](#choosing-your-weapons)) |
| 8 | SPEED UP again | After `!` the highlight starts over |

- **One press, one power-up.** Holding OK never takes a second one; let go and press again.
- A press **does nothing** (and the highlight stays where it is) when no capsule was collected
  since the last power-up, or when you already have the most of the highlighted one: the fifth
  Speed Up, the missiles, the Double or laser you already fire, four Options, a Force Field that
  is still up — its box is greyed out. (A FREE SHIELD is the exception: `?` stays available to add
  or renew a pair of pods.) Collect another capsule to move the highlight on. Such a
  press plays a short, low "no" buzz.
- You may leave the highlight "parked" on a power-up as long as you like and press OK when it
  suits you — it is never taken by itself, unless you turned **AUTO** on in the WEAPON SELECT
  screen (then the power-ups of its ORDER are taken as soon as the highlight reaches them).
- Pressing OK never stops or slows the ship, also while you hold a direction.

**The Force Field** (`?`). A glowing ring around the ship. It stops **five** hits — enemy
bullets, enemy lasers and enemies you fly into — and wears as it goes: bright cyan when fresh
(five and four hits left), then light blue with a few gaps (three), violet with more gaps (two)
and purple and full of holes (one); the next hit breaks it. After every hit it flickers for a
moment (about an eighth of a second) during which further hits are free, so a burst of bullets
costs only one step. It does **not** protect against the rock. While it is up, `?` cannot be
taken again; once it has broken, it can.

**The other shields** (`?`, chosen on the WEAPON SELECT screen).
**SHIELD**, **FREE SHIELD** and **ROTATE** give small orange-gold **pods** instead of a ring —
two at the nose, a pair on the side you last moved towards (take `?` again for a second pair), or
two circling the ship. A pod stops the enemy bullets and enemies that **touch it** (the bullet
vanishes, the enemy flies on) — but it never covers the ship itself, so something that slips past
the pods still hits you, and pods never stop lasers. Each pod takes **14 hits** on its own: it
dims from gold to red and loses facets as it wears, flickers after each hit, and breaks with the
same crackle as the Force Field; the others keep going. **REDUCE** shows a thin dotted green ring
round the ship: while it is there the ship's weak spot is **a third** of its normal size (bullets
must come very close), after one hit two thirds, and the second hit ends it. No shield helps
against the rock.

**Mega Crash** (`!`). Every enemy — also the ones just about to come in — is destroyed at once,
and every enemy bullet vanishes — each one leaving a gold diamond that flies up into your score
(+10 points). Enemies destroyed this way count as shot down: a saucer or the last member of a
formation still leaves its capsule. A **boss** is not hurt by it — only its bullets vanish (and
turn into points). The playfield flashes white for a moment and a deep boom fills both speakers.

**The blue capsule** (browser *Hunter Range* only for now). A rare **blue** pill, left by a blue
saucer or a complete formation. Collecting it destroys **every enemy on the screen** at once
(enemies still outside the screen are spared), with Mega Crash's white flash and roar — but it
does **not** clear the bullets, and it does not move the power meter's highlight. It is worth 300
points like a capsule.

**Fully powered** (`&loadout=full`, see [Your weapons](#your-weapons)) now also starts with a
fresh Force Field — or the shield chosen for `? SLOT`.

What "good" looks like:

- Capsules appear exactly where the saucer or the formation's last member was destroyed, blink
  steadily, stay put against the rock and never appear over the HUD bars.
- A capsule near the ship glides smoothly into it; one you touch vanishes at once.
- One OK press = exactly one power-up, visible straight away: a faster ship, missiles, the
  Double, the laser, one more orb, the ring, or an empty screen after a Mega Crash.
- The Force Field sits centred on the ship and moves with it, wears one step per hit, flickers
  after each hit and disappears after the fifth.
- After a Mega Crash no enemy and no enemy bullet is left on the screen — only gold diamonds on
  their way to your score, gone within about three seconds.
- Shield pods sit at the right places (nose / the side you moved towards / circling), move with
  the ship, wear one step at a time, and a broken pod disappears while the others stay.
- With REDUCE, bullets that pass close to the ship (but not through its centre) no longer
  destroy it — turn on the hit-area outlines of the debug build to see the smaller green circle.

## The MANTA: colour items, weapons and the Arm

The MANTA (chosen in the [SHIP SELECT](#choosing-your-ship) box) has **no power meter**. The
enemies that leave a capsule for the KESTREL — in AZURE VERGE the red saucers and every group
you destroy completely — leave a **colour item** for the MANTA instead, and flying into it is
all it takes: the item works the moment you touch it. **OK does nothing** in the game with the
MANTA.

**Which colour comes next** is set for each stage and simply follows a list: AZURE VERGE hands out
red, blue, green, red, blue, green, blue, red, then the **octagon**, … — eight each of red, green
and blue along the way, one yellow, one orange and one octagon — and starts the list again from the
top if it runs out. A lost ship or a continue never rewinds it: the next item is always the next
one on the list.

| Item | Looks like | What it does | When you already have the most |
|---|---|---|---|
| **Red** | A glossy red ball | **SHOT** one level stronger (the main gun) | Points only (level 8 is the top) |
| **Green** | A glossy green ball | **SUB** one level stronger (the sub-weapon) | Points only |
| **Blue** | A glossy blue ball | The **Arm** shield: puts it up, or repairs it to full — and it grows (below) | — (it always repairs) |
| **Orange** | A glossy orange ball | **An extra ship**, with the "1UP" jingle | At nine ships: points only |
| **Yellow** | A glossy yellow ball | A **smart bomb**: every enemy on the screen is destroyed and every enemy bullet turns into a gold diamond worth 10 points, with Mega Crash's white flash and roar. A boss is not hurt by it | — |
| **Octagon** | A red eight-sided gem | Switches the main gun's style between **BEAM > DISC** and **LASER > WAVE**, keeping its level | — |

- Every item is worth **300** points, like a capsule, and plays a short rising two-note blip when
  you collect it; one that powers you up also plays the rising power-up trill (the orange item the
  "1UP" jingle, the yellow one the smart bomb's roar).
- Items do not stay where they appeared: they **drift slowly to the left** across the screen,
  some upwards and some downwards, bouncing off the top and bottom bars. After about eight seconds
  they start to blink, and at **ten seconds** they are gone — so go and get them. Like capsules,
  an item close to the ship is pulled into it.
- Whoever touches an item gets it.

**The main gun (SHOT).** It fires by itself, like the KESTREL's. Each red item makes it one level
stronger, from level 0 to level 8, in one of two styles — the octagon switches between them:

| Level | **BEAM > DISC** (the start) | **LASER > WAVE** |
|---|---|---|
| 0 | A small orange missile | A small orange missile |
| 1 | A wider missile | A thin blue laser |
| 2 | Two wide missiles | A wider blue laser |
| 3 | A small gold disc | A longer yellow laser |
| 4 | Two small discs, slightly fanned out | A round-ended yellow laser that **passes through** enemies |
| 5 | Three small discs in a fan | A crescent **wave** that passes through enemies |
| 6 | A bigger disc | A bigger wave |
| 7 | A bigger disc still | A wider wave |
| 8 | A huge disc | The biggest wave |

**The sub-weapon (SUB).** Also automatic, from the start. Each green item makes it stronger:
level 0 is a green bomb that arcs down ahead of the ship; then two bombs flying diagonally forward
(up and down), four (forward and backward), diagonal lasers joining the bombs, four diagonal lasers,
wider lasers that pass through enemies, eight of them, and at the top four discs — then bigger ones —
that pass through enemies, all flying diagonally away from the ship.

**The Arm.** The first blue item puts a green ring round the ship — the **Arm**, which takes
**3 hits**. Every further blue item repairs it to full. After **4** blue items it becomes the silver
**Super Arm** (**4 hits**), after **9** the gold **Hyper Arm** (**5 hits**). Unlike the KESTREL's
shields it also protects you against the **rock**. After each hit it flickers for a moment during
which further hits are free; as it wears, the ring shrinks and thins. When it breaks (or the ship
is lost) the count starts over: the next blue item gives a green Arm again.

**Speed.** The MANTA starts at its middle speed. **Ch ▼** (channel down on the remote; Left Shift
on a keyboard — PageDown with KEYBOARD AS REMOTE —; LB or RB on a gamepad) switches to the next
speed, with a ding: middle → fast → slow → middle. Speed is your choice, not power — a lost ship
keeps it.

**The bottom bar with the MANTA.** Instead of the power meter:

```text
  ▲ ▲   SHOT ■■■■■□□□   SUB ■■■□□□□□   ARM ■■□   SPD ■■□   DISC
```

`SHOT` and `SUB` have eight small squares each — one lights up per level (orange for BEAM > DISC,
blue for LASER > WAVE; green for SUB); `ARM` has one square per hit the Arm can take (green, silver
or gold, dark for the spent hits; empty without an Arm); `SPD` lights one, two or three squares for
the slow, middle and fast speed; the name at the end is the main gun's style — `DISC` or `WAVE`.

**What a lost ship costs the MANTA.** The **Arm** is always lost. On NORMAL and HARD (*Classic*)
also one SHOT level (or, when SHOT is already at level 0, one SUB level); on EASY (*Casual*)
nothing more; on ARCADE (*Arcade*) SHOT and SUB go back to level 0 and the main gun back to
BEAM > DISC, and the stage goes back to its last checkpoint. The speed stays.

**Fully powered** (`&loadout=full` in a browser): SHOT and SUB at level 8 and the gold Hyper Arm.

What "good" looks like:

- Every item has its own clear colour and is easy to tell from enemy bullets, even from the sofa;
  items never get stuck at the top or bottom of the screen.
- A red item makes the main gun visibly stronger at once and lights one more SHOT square; a
  green one the same for SUB; an octagon switches between missiles / discs and lasers / waves
  without losing the level.
- The Arm's ring appears with the first blue item, changes to silver after the fourth and gold
  after the ninth, and a hit on the rock with the Arm up costs a hit instead of the ship.
- Ch ▼ changes the speed exactly once per press (the SPD squares follow) — also when you hold it.
- OK does nothing during a MANTA game (Back and Play/Pause still pause it).

## Lives, losing your ship and the score

The KESTREL can be **destroyed**, and the game keeps score — in AZURE VERGE on every device and in
the browser's test stages. Only in empty open space (free flight without a stage) is there nothing
that can hit the ship.

**What costs a ship.** Flying into the **rock**, flying into an **enemy**, or being hit by an
**enemy bullet**. A Force Field takes enemies and bullets for you (five hits, see
[Power-ups](#power-ups)) but never the rock. The ship's hit spot is tiny — a couple of pixels in
the middle of the hull — so bullets that only graze the wings pass.

**What you see when you lose one:**

| When (after the hit) | What happens |
|---|---|
| At once | The ship **explodes** — three fireballs and a spray of grey debris — and **every enemy bullet on the screen turns into a small twinkle and disappears**. The action freezes for a split second (an eighth of a second) — this pause is on purpose, it makes the moment readable — and the picture **shakes** for about a third of a second (the HUD bars stay still). One spare-ship icon goes from the bottom bar. You hear a heavy explosion, and the music (in a stage) goes quiet for about two seconds and comes back up. |
| About 1½ s | The ship **flies in again from the left edge**, where the stage is now — it does not scroll back — at mid-height, ignoring the controls like at the start |
| About 2¼ s | It is yours again. It keeps **blinking** for another two and a half seconds: while it blinks (and while it flies in) **nothing can hurt it** — bullets, enemies and rock pass through — and it keeps firing |

**What a lost ship costs besides the life.** One step of your power — the first of these you have:

1. an **Option** (4 → 3 …);
2. otherwise the **Double or the Laser** (back to the small darts);
3. otherwise the **Missiles**;
4. otherwise one **Speed Up**.

The **Force Field** is always lost. The capsules you have collected towards the next power-up
(the highlight on the meter) are kept. So a fully powered ship (`&loadout=full`) comes
back with three Options, then two, one, none, then without the laser … This is the *Classic*
rule of NORMAL and HARD. **EASY** uses *Casual* (a loss costs only the Force Field) and
**ARCADE** uses *Arcade* (a loss costs all your power and sends you back to the last invisible
checkpoint of the stage) — see [Choosing a difficulty](#choosing-a-difficulty). The **MANTA** loses
its Arm and, on NORMAL and HARD, one SHOT level (or one SUB level when SHOT is at its weakest) —
[The MANTA](#the-manta-colour-items-weapons-and-the-arm).

**Game over.** On NORMAL you start with **three ships** — the one you fly and the two icons in
the bottom bar (EASY five, ARCADE two); extra ships come at 20,000, 90,000, 160,000 … points.
When the last one is destroyed there is no icon left and the ship does not come back; a couple of
seconds later the game freezes and darkens — first under the **CONTINUE?** countdown while you
have continues ([Continues](#continues)), then under the **GAME OVER** screen (red frame, your
final score, a short sad tune). Half a second later **OK** takes you back to the title (it also
goes by itself after ten seconds), where 1 PLAYER plays again. In
free flight (`?scene=flight`) there is no such screen: **GAME OVER** (red) appears in the middle
of the top bar and the stage keeps scrolling.

### The score

The number next to `1P` is your score. It goes up when you destroy enemies (AZURE VERGE's points
and its boss's are in [its section](#the-first-zone-azure-verge)) — in the test stage:

| Destroy (test stage) | Points |
|---|---|
| a small fighter from a hatch | 50 |
| a green pod, a spinner of a formation | 100 |
| the arrowhead fighter that dashes at you (15 s) | 150 |
| a red saucer, a walker | 200 |
| a gun turret (floor or ceiling), a lone spinner | 300 |
| the armoured hatch | 500 |
| a **whole formation** (every member destroyed — a bonus on top, for the one who destroys the last member) | 300 to 1,000, depending on the formation |
| collect a **power capsule** | 300 |

Enemies destroyed by a **Mega Crash** count too. **Cancelled bullets** score as well: when a
boss is destroyed (for the player who destroyed it) or a Mega Crash goes off (for the player who
set it off), every enemy bullet on the screen becomes a small gold diamond that flies up to the
score and adds **10 points** when it arrives — a busy screen can be worth a few hundred. No
number rises for them; the diamonds themselves are the sign. Bullets cleared by the loss of your
own ship score nothing. Enemies that leave the screen, and destroyed ships, score nothing; the
score is never taken away. It stops at 99,999,990. Points always end
in 0; after a continue the last digit counts your continues ([Continues](#continues)).

Every destroyed enemy also shows its points as a small **white number** that rises from where it
was destroyed and blinks out after about two thirds of a second; a completed formation's bonus
appears in **gold** where its last member was. Capsules add their 300 without a number (it would
cover your ship — a cyan ring flashes around the ship instead).

`HI` in the middle of the top bar is the **best score** of the difficulty you are playing: it
follows your score while you are beating it, it carries over into every new game on that
difficulty (1 PLAYER, 2 PLAYERS, RETRY STAGE), and the title screen shows it too. Since this build it is **kept between launches**: every game that ends on the GAME OVER or
STAGE CLEAR screen is saved, so after closing and reopening the app `HI` starts from the best
saved score, and a new best shows **NEW HI-SCORE** on the GAME OVER screen
([What the game remembers](#what-the-game-remembers)). A game you quit or retry is not saved.

What "good" looks like:

- Every hit by rock, an enemy or a bullet (without a Force Field) costs exactly **one** ship —
  also when several bullets hit at the same moment.
- The freeze after a loss is short and always the same length; nothing jumps when the game
  continues.
- After a loss **no enemy bullet** is left on the screen.
- The ship always comes back from the left edge at mid-height and blinks until it is safe;
  bullets that touch it while it blinks do not destroy it.
- The spare-ship icons go 2 → 1 → none (on NORMAL), and CONTINUE? or GAME OVER appears only
  after the last ship; OK on GAME OVER leads back to the title, whose `HI` shows your best score.
- At 20,000 points a spare-ship icon is **added**, with a "1UP" jingle.
- The score only ever goes up, by the amounts above, and `HI` is never lower than the score.

## The boss range and the WARNING (browser only)

Open http://localhost:5173/?stage=test-boss (add `&loadout=full` to fight fully powered, or
`&profile=keyboard-remote-emulation` to fly with the TV remote's limits) and choose 1 PLAYER on the
title (times below count from the start of the game). It is a short stage in open space — no rock — made to try out the
first boss mechanics with the **TRIAL WARDEN**, a test boss (the zone's real boss, HALCYON BULWARK,
ends AZURE VERGE — [above](#halcyon-bulwark-hb-01)). Everything
here is a placeholder made for this project, including the boss's name and the WARNING's
wording.

| Time (about) | What happens |
|---|---|
| 0–1 s | The ship flies in; the stars start to scroll |
| 1 s and 2 s | Two **red saucers** drift through (upper, then lower half) — each leaves a power capsule when you shoot it down |
| 5 s | **The WARNING.** The scrolling slows down and stops within a second. The whole playfield **darkens** to about half its brightness and pulses **red** three times, once a second, each time with the wail of a **siren**, while the stage music fades out. A dark, see-through band with thin red edges crosses the middle of the picture, and three lines of text flash between red and yellow: `WARNING!!` · `GIANT HOSTILE "TRIAL WARDEN"` · `CLOSING IN - CODE TW-00`. It stays for **three seconds**; you can fly and shoot as usual meanwhile |
| 8 s | The band disappears, the **boss theme** starts and the **boss glides in** from the right edge, slowing down as it arrives; after two seconds it stops in the right quarter of the screen. While it glides in **it cannot be hurt** — your shots simply vanish on it — but flying into it already destroys your ship |
| 10 s | The fight starts (below). The stage waits: the scrolling stays stopped until the boss is destroyed |

**The TRIAL WARDEN** is built from parts, and each part behaves differently:

| Part | Looks like | What your shots do |
|---|---|---|
| **Armour blocks** | A column of three dark blue-grey riveted blocks — the boss's body | Nothing, ever: shots vanish on them |
| **Shield plates** | Two light grey plates on the boss's left side (facing you), one above the other | They take 10 hits each, flash white when hit and explode when destroyed (500 points each — the number rises from the plate) |
| **Core** | A glowing, pulsing cyan eye behind the plates | Nothing while **both** plates are there; once they are gone it takes 24 hits. Destroying it destroys the boss (5,000 points for the core) |
| **Guns** | Red-and-yellow emitters sticking out above and below the body | They fire at you; 12 hits each (1,000 points) and a destroyed gun stops firing |
| **Vent** | A small emitter on the far (right) side | It can only be hurt now and then during the first attack, while it is open (there is no visible sign of that yet), and it is hard to reach — you do not need it (800 points) |

Flying into any part of the boss destroys your ship (a Force Field takes it like an enemy).

**How it fights.** It changes its attack twice as it takes damage:

| When | What it does |
|---|---|
| From the start | Slowly follows your ship's height up and down (staying clear of the top and bottom edges); each gun fires a single **red** bullet at you a little more than once a second |
| After the first shield plate is destroyed | Follows you faster; each gun fires a **fan of three red** bullets about every 0.8 seconds |
| Once the core has lost **half** its strength | Drifts slowly. Every two and a half seconds one gun — taking turns — fires a **laser** straight to the left across the whole screen along its row: first a thin **blinking warning line** for almost a second, then the beam for about ¾ of a second; only the beam hurts, so leave its row while the line blinks. Between lasers each gun fires a fan of three **purple needles** every second and a half |

**When the core is destroyed:**

- every enemy bullet and laser on the screen turns into twinkles and disappears at once; each
  **bullet** also leaves a small **gold diamond** that hangs for a moment, then flies up to your
  score in the top bar and adds **10 points** when it gets there;
- the boss **blinks** white for two seconds while **explosions** keep bursting all over it,
  then it vanishes in a **big blast** — a bright white flash, a strong screen shake of about two
  thirds of a second, flying debris — with a very short freeze; the boss music fades out as the
  explosions start;
- **20,000 points** go to your score (on top of the parts you destroyed) — a gold `20000` rises
  where the boss was, and a short, cheerful stage-clear tune plays;
- about a second later the scrolling starts again, and a second and a half after that the
  game freezes under the **STAGE CLEAR** screen: your score and the best score, then
  `TO BE CONTINUED`, then the title — 1 PLAYER (or RETRY STAGE from the pause menu during the
  fight) to fight again ([the end screens](#pausing-quitting-and-the-end-screens)).

**Losing a ship during the fight** works as everywhere else: the bullets vanish, you fly in
again from the left, blinking, and the boss keeps fighting. After the last ship it is GAME
OVER, as in the Test Range.

**Fully powered** (`&loadout=full`): the laser passes through the shield plates and damages
them, but stops at the first part it cannot hurt (the armour, or the core while a plate still
covers it); the missiles drop forward and down (there is no ground to slide on here), and the
Options fire with you. The Force Field takes the boss's bullets, lasers and body like any enemy's.

What "good" looks like:

- The WARNING band and its text sit inside the playfield (never over the HUD bars), the three
  lines are centred, complete and easy to read, and the colour change is steady, not
  flickering.
- The scrolling slows down smoothly and stops (the stars stop too); it only starts again after
  the boss is destroyed.
- The boss glides in smoothly from beyond the right edge — it never pops up in the middle of
  the screen — and its parts always stay together as one body, also while it moves up and down.
- No part of the boss is ever a magenta-and-black checkered square.
- While it glides in, and on the armour blocks, your shots vanish without effect; the core
  cannot be hurt before both plates are gone; parts that are hit flash white; destroyed parts
  disappear and never come back; a destroyed gun stops firing.
- Every bullet pattern and every laser can be dodged with the four arrow directions (the laser
  always blinks as a warning line first) — please report any spot where you could not get out
  of the way.
- After the core is destroyed no enemy bullet or laser is left, explosions cover the boss while
  it blinks, the final blast flashes and shakes the picture, the score jumps by 20,000 and the
  stage scrolls on.
- During the WARNING the playfield is darker and pulses red three times; the band's text stays
  readable on top of it.

## The Option Hunter range (browser only)

Open http://localhost:5173/?stage=hunter-range&loadout=full and choose 1 PLAYER on the title (the
fully powered ship starts with four Options; without `&loadout=full`, collect five capsules and
take OPTION first — a hunter only comes while you **have** Options). It is a one-minute stage in
open space made to meet the **Option Hunter**: a violet, armoured enemy that is not after your
ship but after your **Options**. Try it with every OPTION choice of the WEAPON SELECT screen —
each one gives the hunter a different chance.

| Time (about) | What happens |
|---|---|
| 1–6 s | Six **red saucers** — shoot them for capsules |
| 12 s | **An Option Hunter** from behind: an alarm sounds, it flies in from the left, lines up with your ship's row, waits a moment and charges straight to the right |
| 15 s | A row of six green pods — destroy them **all** and the last one leaves a **blue capsule** |
| 18 s | A hunter from the front: lines up on your row near the right edge, then charges left |
| 22 s | Two more saucers |
| 25 s | A hunter from above: lines up over your ship, then dives down |
| 26 s | A slow **blue saucer** — it also leaves a blue capsule |
| 30 s | Checkpoint; five more saucers |
| 40 s | **Two hunters at once**, from behind (upper half) and from the front (lower half) |
| 60 s | The end of the stage |

**What the hunter does.** When it appears you hear a rising, wobbling **alarm**. Your shots only
**clink** off it — it cannot be shot down — and it never hurts your ship, even if it flies right
through it. When it touches one of your Options it takes that Option **and every Option behind
it in the line** (a short falling "zip" sound): they vanish from your ship and trail behind the
hunter, **grey**. If it leaves the screen with them, they are gone — collect capsules and take
OPTION again.

**Getting them back.** Only a **Mega Crash** (the `!` box) or a **blue capsule** destroys a hunter.
Then each Option it carried is set free as a grey orb that drifts slowly across the screen (it
moves with the screen, bouncing off the top and bottom) — fly into it and it becomes one of your
Options again (with four already, you only hear the ding). A freed Option blinks after about
eight seconds and vanishes at ten.

What "good" looks like:

- The alarm is clearly audible and comes before the hunter reaches you; the hunter is easy to
  tell apart from other enemies (violet, and shots clink off it).
- The hunter never takes an Option it did not touch; with TRAIL or SNAKE Options it takes the
  one it hits and the ones further back, never the ones closer to the ship.
- Grey stolen Options stay behind the hunter as it flies; after a Mega Crash or a blue capsule
  they drift free and each one you touch comes back as a normal Option at once.
- A blue capsule destroys every enemy on the screen (the hunters too) but leaves the bullets.
- Nothing stays stuck on the screen, and there are no magenta-and-black squares.

## The Direct range (browser only)

Open http://localhost:5173/?stage=direct-range, choose 1 PLAYER, a difficulty and then the **MANTA**
in the SHIP SELECT box. It is a one-minute stage in open space made to try the colour items: its
first six items are one of each colour (red, green, blue, orange, yellow, octagon), then blue,
red, green, blue, red, blue — and the list starts again.

| Time (about) | What happens |
|---|---|
| 1 s | A **pincer wave**: six small violet **cubes**, three coming from the top and three from the bottom, closing in on each other in the middle of the screen, then leaving to the left. Destroy **all six** — the last one leaves an item (and a 600-point bonus) |
| 5 s | A red saucer flying slowly to the left — it takes two small hits and leaves an item |
| 10, 20, 29, 38, 48 s | More pincer waves, starting at slightly different heights |
| 15, 24, 33, 43, 52 s | More red saucers, alternately low and high |
| 30 s | Checkpoint |
| 60 s | The end of the stage |

With the KESTREL the same stage gives power capsules instead of colour items — every stage works
with both ships.

What "good" looks like:

- Every pincer wave meets near the middle and leaves to the left; the item appears where the last
  cube was destroyed. If a cube escapes, that wave leaves nothing — by design.
- The six colours are all different and readable; each does what [The MANTA](#the-manta-colour-items-weapons-and-the-arm)
  describes; items drift and bounce and are gone after about ten seconds.
- Nothing stays stuck on the screen, and there are no magenta-and-black squares.

## The Gimmick range (browser only)

Open http://localhost:5173/?stage=gimmick-range and choose 1 PLAYER (any difficulty and ship). It
is a stage of about fifty seconds over a floor and under a ceiling, made to try the stage mechanics that the
later zones will use — none of them is in AZURE VERGE yet, and the TV cannot open this stage
(the widget has no address bar). It works with two players too.

| Time (about) | What happens |
|---|---|
| 2–4 s | Two **bubbles** drift in on a wave. Shoot one and it bursts into two small bubbles that fly apart, then drift on; the small ones just pop |
| 3–10 s | A brown **brick pillar** stands on the ground. Every brick takes four hits and crumbles with a small explosion (10 points). Shoot a way through, or fly over it |
| 5–8 s | Three dark **rocks** hang from the ceiling. Each drops when you come near (horizontally) and shatters on the ground — stay out from under it, or shoot it (two hits) |
| 12–13 s | A **volcano** on the ground lobs glowing stones in arcs every couple of seconds; they shatter where they land. A **block** swings up and down in the middle of the screen — it is as solid as rock |
| 15–18 s | **The view stops** for three seconds and **pans down** into a dip. A slow **suction pod** comes in: while it lives it pulls your ship towards it — fly against the pull, or shoot it (16 hits; it leaves a power-up) |
| 18–29 s | The dip. **The fork:** fly down into its lower part and you change the route — at about 28 s one bubble comes in low; stay up and a rock and a high bubble come instead. From about 25 s the view **slides back up** while it scrolls |
| 32 s | A **tentacle** hangs from the ceiling on a chain. When you come within reach its claw lunges at you and tugs your ship towards it, then lets go and pulls back. The claw is deadly to touch; shoot it (six hits) |
| 34–37 s | A **very fast** stretch (four times the normal speed) past pink **tissue** walls hanging from the ceiling and standing on the floor — they break in three hits and **grow back** about four seconds later, but never while your ship is in the way |
| 37 s | Checkpoint (the others are at the start and at about 21 s); a **cube rush**: eight violet cubes come in one after the other at random heights and fly at you. A cube that reaches the rock **sticks to it** and becomes a block of the wall (two hits to break) |
| 38–40 s | Two more **moving blocks**, one drifting slowly while it swings |
| 42 s | A second tentacle |
| 48 s | The end of the stage — STAGE CLEAR |

What "good" looks like:

- A brick disappears only after its fourth hit, with a pop and 10 points; your laser, missiles and
  the Spread Bomb break bricks too. Shots never pass through a block or an unbroken brick.
- Broken pink tissue grows back after about four seconds, one piece at a time, and never on top of
  your ship — hover in the gap and it waits.
- On ARCADE (or after a CONTINUE?) the game restarts at the last checkpoint with **every** brick
  and wall as it was at the start, and the cubes the rush stacked gone. On the other difficulties
  your ship flies back in where you were, and what you broke stays broken.
- Touching a moving block, a rock, a stone or a tentacle's claw costs a ship, like any rock or
  enemy.
- The stop is exactly three seconds, the pan down and back up are smooth, and the fast stretch
  does not skip any enemy.
- Flying through the lower part of the dip gives the low route; not going there gives the other.
  With two players, either ship can take the low route.
- Nothing stays stuck on the screen, and there are no magenta-and-black squares.

## The Raster range (browser only)

Open http://localhost:5173/?stage=raster-range and choose 1 PLAYER (any difficulty and ship). It
is a calm stage of about a minute in open space, made to show the SNES-style **picture effects**
the later zones will use — the TV cannot open it (the widget has no address bar), and none of the
effects is in AZURE VERGE yet. It works with two players too.

| Where on the screen | What you should see |
|---|---|
| Top half | Two layers of **stars** drifting slowly. From about **20 to 40 seconds** in, the stars in the upper part **shimmer** as if seen through **heat haze** — a fast, irregular wobble — then settle again |
| Middle | A band of **deep-blue sea** with light rows of swell. Its rows **wave** gently left and right, and its four shades of blue **roll** through the band all the time, so the swell seems to move |
| Bottom | A violet **checkered floor** from a thin bright horizon line down to the bottom bar. The lines near the horizon move slowly, the ones near you fast, so it looks like a floor racing past towards the horizon — the old racing-game trick |
| Enemies | A few rows of small pods weaving on a wave (about 5, 24 and 44 seconds in) and red saucers (about 12 and 34 seconds) that leave power capsules — the Test Range's |
| About 60 s | The end of the stage — STAGE CLEAR |

What "good" looks like:

- The sea's waving is smooth and never tears into separate bits; the rolling colours stay inside
  the sea — nothing else on the screen changes colour with them.
- The checkered floor keeps its squares: each strip moves as one piece, nearer strips faster, and
  the pattern never breaks up into noise, even after a minute.
- The heat haze only runs in its middle stretch; the stars are still before and after it.
- Your ship, the enemies, the bullets and the HUD are never distorted — only the backgrounds.
- The effects stay put when the picture shakes (lose a ship): the waves stay on the sea.
- The game stays as smooth as elsewhere. If a monitor or browser gets jerky here and not in
  AZURE VERGE, please report it with the device.

## The advanced boss ranges (browser only)

Four short stages in open space show the boss variety the later zones are built from: **mid-bosses**
that fight while the screen keeps scrolling, a **battleship bigger than the screen** that the view
flies around, a **boss inside a boss**, **twin bosses** that take turns, a boss that **escapes** if
you take too long, and a **boss rush**. Everything here is a placeholder made for this project —
names, pictures and sounds. None of it is in AZURE VERGE yet, and the TV cannot open these stages
(the widget has no address bar; the **BOSS HP** option below works everywhere). Open each with
1 PLAYER on the title (any difficulty and ship; add `&loadout=full` to fight fully powered). Each
stage starts with three red saucers that leave power capsules.

**Every hit count below is for the basic gun** (the laser and other weapons do more).

### CAPTAIN RANGE — mid-bosses (`?stage=captain-range`)

About 1 minute 50 of scrolling at normal speed. Four **mid-bosses** ("captains") fly in one after
another from the right — **no WARNING, the scrolling never stops and the stage music keeps
playing**. A captain stays until you destroy it; its end is a short burst of explosions, a small
shake and a gold `3000` (no flash, no freeze), and the stage simply scrolls on. The stage ends —
STAGE CLEAR — at about 1:47 whatever is still flying.

| Time (about) | Captain | What it does | How to beat it |
|---|---|---|---|
| 5 s | **SURGE RAMMER** — a round orange shell with a blinking red eye | Fires three fans of five red bullets, then **dashes straight to the left side along your row** and flies back | Step up or down when it lines up with you; 40 hits |
| 27 s | **BROOD LAUNCHER** — an orange shell with two tubes, above and below | Follows your height slowly; every second or so its tubes **launch bubbles** (the Gimmick Range's bubbles — they split when shot) and it fires fans of three pink bullets | The tubes take 10 hits each (500 points); once they are gone the bubbles come from the shell itself, which takes 36 |
| 50 s | **ORBIT WARDEN** — a glowing cyan core with four round **orbs circling it** | The whole group **circles the screen** in a wide oval while firing rings of eight purple bullets, each ring turned a little | The orbs are armour — shots vanish on them; hit the core (30 hits) between them |
| 74 s | **TIDE CRAB** — an orange shell with two grey **claws** in front | Hops to a new spot in the right part of the screen every second or so and fires rings of twelve red bullets whose gaps turn round | The claws (8 hits each, 300 points) catch your shots first; then the shell (40 hits) |

### RAID RANGE — the battleship, and the boss inside it (`?stage=raid-range`)

| Time (about) | What happens |
|---|---|
| 7 s | **The WARNING** (three seconds, as in the Boss Range): `GIANT HOSTILE "IRON LEVIATHAN"` · `CLOSING IN - CODE RL-01`. The scrolling stops |
| 10 s | **IRON LEVIATHAN** glides in over four seconds: a long riveted steel hull across the lower part of the screen — **longer than the screen**, its far end out of sight — with **seven turrets** (four on top, three underneath) and a pulsing cyan **reactor** near its far end. It cannot be hurt while it glides in |
| 14 s | **The raid.** The view starts to **move by itself**: up over the hull, along it to the right, back again, looping — pausing a couple of seconds at each end. Your ship moves with the view (you still steer it inside the picture). The turrets **turn their barrels towards you** and fire single pink bullets along them; only turrets on the screen fire. When the reactor has lost half its strength they fire fans of three, more often |

- **Turrets**: 12 hits, 800 points each. **The reactor** cannot be hurt until **the two turrets
  nearest it** (the last one on top and the last one underneath) are destroyed; then 60 hits
  (5,000 points).
- **When the reactor is destroyed**: the bullets turn into gold diamonds, the battleship blinks and
  explodes for two seconds **while the view glides back** to where the raid began, then the big
  blast and 40,000 points — and out of the blast, where the reactor was, comes **LEVIATHAN HEART**:
  a spinning core with two armoured orbs circling it, which follows your height and fires fans of
  three red bullets (40 hits; 5,000 + 20,000 points). STAGE CLEAR follows after the heart.
- **Too slow?** If the battleship's fight lasts **90 seconds**, it gives up: it stops firing, your
  shots pass through it, and it **flies off to the right** in a second and a half while the view
  glides back — no points, no heart, and the stage ends (STAGE CLEAR). The game notes that the boss
  escaped; in a real run that chooses the ending — zone I's ABYSS ARK escaping gives **THE FLAGSHIP
  SLIPS AWAY** ([The endings and the credits](#the-endings-and-the-credits)). Without power-ups this is what usually
  happens — try `&loadout=full` to beat it.

### TWIN RANGE — two bosses taking turns (`?stage=twin-range`)

| Time (about) | What happens |
|---|---|
| 7 s | **The WARNING**: `GIANT HOSTILE "EMBER AND FROST TWINS"` · `CLOSING IN - CODE TE-01` |
| 10 s | **Two bosses glide in together**: EMBER in the upper half (its gun on top) and FROST in the lower half (its gun underneath) — each a dark block with a glowing cyan core on its left |
| 12 s | The fight. **One of them withdraws** at once past the right edge of the screen (drawn **behind** the other enemies while any of it still shows): while it rests it cannot be hurt, cannot hurt you and does not fire. **Every five seconds they swap** — the fighting one pulls back, the resting one comes forward (a second's glide) |

- The fighting twin fires fans of three red bullets about once a second; once its core is below
  half, it fires **laser rows** to the left (a blinking warning line first — leave the row) and
  purple needles.
- **Cores** 30 hits (3,000 points), **guns** 12 hits (1,000 points); each twin is worth 15,000.
- **Destroy one core and the other one gets angry**: it comes forward for good, fires **twice as
  often** and switches to its laser rows at once. The music fades and STAGE CLEAR
  comes only after both.

### GAUNTLET RANGE — a boss rush (`?stage=gauntlet-range`)

Three bosses one after another, and no end of the stage until the last one is down: after about
6 s the WARNING and the **TRIAL WARDEN** (the Boss Range's test boss); two seconds after it
explodes, **LEVIATHAN HEART** flies in without a WARNING; two seconds after that the WARNING again
and the **EMBER AND FROST TWINS**. The stage-clear tune plays only after the twins. Losing a ship
on ARCADE (or continuing) brings back the boss you were fighting.

### The boss HP bar (every device)

**OPTIONS → DISPLAY → BOSS HP → ON** (it starts OFF) shows how much a boss has left: during a boss fight the
middle of the top bar shows **`BOSS`** in red and a **red bar** instead of `HI` and the best score.
It works on the TV too — in AZURE VERGE for HALCYON BULWARK.

- The bar **fills up while the boss glides in**, is full when the fight starts, and **gets shorter
  only when you damage what matters** — the core(s) and the parts protecting them (HALCYON
  BULWARK's four shield plates and its core; IRON LEVIATHAN's reactor and the two turrets guarding
  it). Hitting armour, guns or other extra parts does not move it. Any strength left shows at least
  a sliver.
- It **empties** when the last core is destroyed and **disappears with the big blast** — `HI`
  comes back. A boss inside a boss, or the next boss of a rush, brings its own bar.
- For the twins the bar counts **both**. For mid-bosses it shows the captain's strength (when no
  big boss is fighting at the same time).
- It follows the saved setting: after changing it, leave the Options screen with BACK.

What "good" looks like in these stages:

- Captains fly in smoothly from the right edge and the scrolling never stops for them; the stage
  music keeps playing through their fights.
- The battleship is one solid hull; the turret barrels visibly swing to point at your ship, and
  the bullets leave along the barrels. When the view moves round the battleship, the stars, your
  ship and the bullets move with it smoothly — nothing jumps. After the battleship's end the view
  is back exactly where it was before the raid, and the stage carries on from there (nothing that
  should have come during the raid is skipped).
- The resting twin is drawn behind, is never hit, and never hurts your ship; the swap happens
  every five seconds while both live.
- The heart comes out of the reactor's explosion, not from the edge of the screen.
- Every bullet pattern can be dodged with the four arrow directions — please report any spot
  where you could not get out of the way (the rammer's dash and the rings included).
- No magenta-and-black squares, and no part of a boss left floating after it exploded.

## Hidden bonus stages

Some zones hide a **secret entrance** to a short **bonus stage** full of points and extra ships.
The real zones have two, on every device: **zone B, BRINE NEBULA** — a marked gap at the top of
the screen into **PEARL GROTTO** ([The secret bonus stage: PEARL
GROTTO](#the-secret-bonus-stage-pearl-grotto)) — and **zone G, PRISM LABYRINTH** — all four turrets
of its crystal gallery shot down, into **GLIMMER CACHE** ([The secret bonus stage: GLIMMER
CACHE](#the-secret-bonus-stage-glimmer-cache)). All three kinds of entrance can be tried in a
browser test stage: open
http://localhost:5173/?stage=bonus-range and choose 1 PLAYER (add `&loadout=full` to have the
firepower for the second entrance).

The *Bonus Range* scrolls over a floor and has **three secret entrances**, each of another kind —
the first one you open is the one you take:

| About | Entrance | How to open it |
|---|---|---|
| 8–14 s | **A marked gap** | Two brick blocks sit at the very top of the screen with a gap between them — fly your ship into that gap while it passes |
| 17–30 s | **All ground targets** | Three gun turrets stand on the floor — shoot down **all three** before the view has moved on past them |
| about 33 s | **A score digit** | If your score's **thousands** digit is **0** at that moment (e.g. 10,250 or 20,900 points), the entrance opens |

When an entrance opens you hear the power-up chime; about ⅔ of a second later the picture
switches to the **Bonus Vault**, with **BONUS STAGE** / **BONUS VAULT** on the title card (your
score, ships and power-ups come along). Nothing shoots at you there: waves of carriers fly
across, each leaving a **gold capsule** worth **1,000 points**, one bigger carrier leaves a green
**1UP** capsule with a white `+` (**one extra ship**, with the extra-ship chime — at nine ships only
the pickup sound), and two brick walls have to be shot through. After about half a minute the
vault ends: **STAGE CLEAR** — in a real zone this would be the zone's clear, the boss **skipped**,
and the ending's **BONUS STAGE CLEARED** line.

**Dying in the bonus stage locks you out:** a second after the first ship is lost there you are
back in the Bonus Range at the entrance you took, and no entrance of that stage opens any more —
the stage then goes on to its WARNING and HALCYON BULWARK. (RETRY STAGE in the pause menu starts
the Bonus Range over, with the entrances open again.) If no entrance opens at all, the range
simply ends with its boss.

What "good" looks like:

- Each of the three entrances opens only when its condition is met — not for a ship that merely
  touches the bricks, not with one of the three turrets left, not with another thousands digit.
- The switch into the vault and back is quick and clean: no leftover bullets or enemies of the
  other stage, the ship keeps its power-ups, and its score is the same.
- The gold capsules add exactly 1,000 points each; the 1UP adds one ship icon at the bottom left.
- After a death in the vault no entrance of the range opens again.

## Explosions, sparks, shake and flashes

Hits look like hits — in AZURE VERGE on every device, and in the browser's *Test Range*
(http://localhost:5173/?stage=test-range) and *Boss Range* (`?stage=test-boss`). All of it is
drawn from small placeholder pictures made for this project; what you hear at the same moments
is in [Sound and music](#sound-and-music).

| When | What you should see |
|---|---|
| Your ship fires | A tiny white-and-yellow spark just in front of the nose, gone almost at once (fully powered, it sometimes shows in front of an Option instead) |
| A shot hits an enemy that survives | The enemy flashes white (as before) and a few sparks fly off it |
| A shot hits something it cannot hurt (the boss's armour, its covered core, the boss while it glides in) | A few sparks bounce back towards you |
| An enemy is destroyed | A **fireball bigger than the enemy** where it was — small enemies with a few sparks; the red saucers, turrets and the armoured hatch with grey chunks of **debris** that fly out and fall. The fireball stays on the spot even while the ground scrolls under it |
| Its points | A small **white number** rises from the spot for about two thirds of a second and blinks out; a completed formation's bonus is a **gold** number |
| You collect a capsule | A thin **cyan ring** flashes around your ship (no number) |
| Enemy bullets are cancelled (you lost a ship, a Mega Crash, a boss destroyed) | Each bullet turns into a small pale-gold **twinkle**; after a Mega Crash or a boss, also a small **gold diamond** that drifts, then flies up into your score |
| You lose your ship | Three fireballs and a spray of debris; the picture **shakes** for about a third of a second |
| The Force Field breaks | A burst of sparks around the ship |
| **Mega Crash** | The playfield (not the HUD bars) **brightens towards white** for a fifth of a second — everything on it stays visible through the flash |
| The boss **WARNING** | The playfield darkens to about half and pulses **red** three times, once a second |
| A boss part is destroyed | It explodes; its points rise from it |
| The boss is destroyed | Two seconds of explosions all over it, then a big blast: a bright **white flash**, a **strong shake** (about two thirds of a second), debris, and a gold `30000` (HALCYON BULWARK) or `20000` (the test boss) |

What "good" looks like:

- **Enemy bullets are always on top.** An explosion, a spark or a number never hides a bullet —
  please report it at once if one ever does (with the time into the stage).
- Explosions, sparks and numbers stay inside the playfield, never over the top or bottom bar,
  and are never magenta-and-black checkered squares.
- Only the playfield shakes — the HUD bars stay perfectly still — and it settles back exactly
  where it was.
- Explosions stay where the enemy was destroyed and scroll away with the ground.
- The screen never flashes more than three times in one second (a built-in limit that protects
  players sensitive to flashing light). **OPTIONS → DISPLAY → FLASHES → REDUCED** tones them down further (at
  most one a second, much dimmer) and **OPTIONS → DISPLAY → SHAKE → OFF** turns the shake off
  ([The Options screen](#the-options-screen)). If the shake or the flashes are still
  uncomfortable, please say so.
- Everything freezes when the game is paused (the pause menu, switching tabs, the TV's Home
  button) and carries on from where it stopped. A new game (1 PLAYER, 2 PLAYERS, RETRY STAGE) starts without
  the last game's explosions and numbers.
- The game stays smooth even with many explosions at once.

## Sound and music

Since this build the game makes sound. Every sound effect and every tune is an original
placeholder made for this project — nothing is taken from another game — and the game makes
them itself from built-in recipes while it loads, so there are no sound files to install. They
will be replaced by finished sound and music later.

| Where | Sound effects | Music |
|---|---|---|
| **TV** | From the start | The title theme on the title; in a game AZURE VERGE's theme, the boss theme, the stage-clear and game-over tunes — and in zones B to G their own stage and boss themes |
| **Browser** | After your first key press or click | The title theme from that first key press; in a game the same as on the TV |
| **Browser**, `?stage=test-range` or `?stage=test-boss` | After your first key press or click | The title theme, then the stage theme when the game starts; the boss theme, the stage-clear and game-over tunes |
| **Browser**, `?scene=flight` (free flight) | After your first key press or click | None in open space; with `&stage=…` the stage theme starts with the first key press |
| **Desktop** (Electron) | After your first key press or click | As in the browser |

In a browser (and the desktop app) nothing can be heard before the first key press or click —
browsers do not allow a page to make sound before that, and a gamepad button does not count.
Sounds of that first moment are simply skipped.

The attract loop's **demo play is silent** on purpose (the title music fades out while it plays and
comes back with the high-score tables). Every tune and sound effect can be played on its own in the
title menu's **SOUND TEST** ([The sound test](#the-sound-test)).

What you should hear:

| When | What you hear |
|---|---|
| Your ship fires | A short, high blip with every shot (the missiles a lower, buzzier one; the laser uses the blip) |
| A shot hits an enemy that survives | A short tick |
| A shot bounces off armour (the boss's blocks, its covered core, the boss while it glides in) | A thin metallic clink |
| An enemy is destroyed | A noisy burst — bigger enemies, bigger bursts |
| You collect a capsule | A bright ding |
| OK takes a power-up | A short rising trill |
| The MANTA collects a colour item | A short rising two-note blip — and the rising trill when it powers you up (the "1UP" jingle for orange, the roar for yellow) |
| Ch ▼ changes the MANTA's speed | The bright ding |
| OK has nothing to give | A low "no" buzz |
| The Force Field (or a shield pod, or the MANTA's Arm) is hit / breaks | A soft thud / a crackling break |
| An **Option Hunter** appears | A rising, wobbling alarm |
| A hunter takes your Options | A short falling "zip" |
| **Mega Crash** | A long, deep roar |
| You lose your ship | A heavy explosion; the music goes quiet for about two seconds and comes back up |
| The boss **WARNING** | The stage music fades out within half a second and a **siren** wails three times, once a second, with the red pulses |
| The boss glides in | The boss theme, **BULWARK ASSAULT**, starts (GALVANIC MAW: **MAW OF THE NEBULA**; SANDGRAVE WIDOW: **SANDGRAVE ASSAULT**; CINDER BASTION: **BASTION OF CINDERS**; SQUALL STEED: **STEED OF THE SQUALL**; MANTLE REGENT: **REGENT OF THE VAULT**; FACET MONARCH: **THRONE OF FACETS**; IRON SOVEREIGN: **SOVEREIGN OF STEEL**; the ABYSS ARK and THE HOLLOW KING: **THE HOLLOW KING**, which keeps playing when the king appears) |
| The boss is destroyed | The boss music fades out over a second while the explosions crackle over it; with the final blast's `20000` a short, cheerful **stage-clear tune** (VERGE SECURED) plays, then it is quiet |
| The menus | A soft click for each move of the highlight (and each step of a volume or the control profile in the Options screen), a short chime when you choose an entry, a lower "back" sound for Back, NO and a greyed-out entry; a short sound when the pause menu opens and closes. Menu sounds come from the middle and follow the SFX volume |
| The title screen | The title theme, **SHMUP CUP**; it fades out when a game starts |
| **GAME OVER** screen | A short, sad tune (**SILENT VERGE**) |
| **STAGE CLEAR** screen, the **zone result** | The stage-clear tune (if it is not playing already) |
| The **ZONE MAP** | The music fades out — the map is quiet for now (its own tune comes later); a chime when you choose, the menu click for ▲ / ▼ |
| The next zone starts | Its zone theme from the start of the zone: **BRINE NEBULA** in zone B, **DUNE EXPANSE** in zone C, **MAGMA DEEP** in zone D, **TEMPEST RIDGE** in zone E, **CELL VAULT** in zone F, **PRISM LABYRINTH** in zone G, **IRON CITADEL** in zone H, **ABYSSAL THRONE** in zone I |
| Entering a secret bonus stage | The power-up chime when the entrance opens; the 1UP capsule plays the extra-ship jingle. PEARL GROTTO keeps zone B's music going and GLIMMER CACHE zone G's (they have no tunes of their own) |
| The **ending** (after zone H or I) | The ending theme, **AFTER THE LAST WAVE**, starts with the ending scene and plays on under the story and the result card |
| The **credits** | Their own tune, **THANK YOU, PILOT**; the title theme comes back with the title |

**The stage theme** (AZURE VERGE — in the zone of the same name and in both browser test stages)
starts with a short intro of about six seconds and then repeats a 45-second part over and over.
The jump back — about **51 seconds** after the music started, and every 45 seconds after that —
should be impossible to hear: no gap, no click, no jump in the tune. The zone lasts long enough to
hear it three times; please say if you can tell where it is. The music keeps playing while the game is paused; when the
GAME OVER screen opens the game-over tune replaces it.

**Where sounds come from.** Sounds come from where they happen on the screen: a shot on the left
of the picture is heard more from the left speaker, an explosion on the right from the right.
The siren and the Mega Crash come from the middle.

**Busy moments.** The game plays up to 14 sounds at once. The same sound started twice in the
same instant is played once (it would only be louder), and when too much happens at once the
least important sounds give way — the siren and the loss of your ship are never cut off.

**Volume.** The game's own volumes are under **OPTIONS**: MASTER (everything), MUSIC and SFX (the
sound effects and the menu sounds), each from 0 (silent) to 10 (full — the start setting). They
change at once and are kept after the app is closed ([The Options screen](#the-options-screen)).
The TV's or the PC's volume works on top, as always.

What "good" sounds like:

- Every sound is **in time with the picture** — a shot's blip exactly when the dart leaves the
  nose, an explosion exactly when the fireball appears.
- No crackles, clicks, stutters or dropouts, also when many explosions happen at once; the
  music never stutters.
- The stage theme's loop point cannot be heard (above).
- The siren is heard in full, three times, however busy the screen is.
- Switching tabs (or Home on the TV) silences everything; coming back continues it.
- No sound is unpleasantly loud, piercing or much quieter than the others — please name the
  ones that are.

## Other screens (browser only)

| Address | Screen |
|---|---|
| http://localhost:5173 | The **title screen** (the normal start); 1 PLAYER and 2 PLAYERS play AZURE VERGE; `?stage=…`, `?skip=…` and `?loadout=…` below change what a game plays |
| http://localhost:5173/?profile=keyboard-split | Two players on one keyboard (the **SPLIT KEYBOARD** profile — [Two players](#two-players)) |
| http://localhost:5173/?skip=boss | AZURE VERGE, but every game starts about two seconds before the **WARNING** and **HALCYON BULWARK**; add `&loadout=full` to fight it fully powered ([above](#halcyon-bulwark-hb-01)) |
| http://localhost:5173/?scene=flight | **Free flight**: straight into the game without the title — the older start-up picture, with its simpler HUD (FREE FLIGHT or the stage name in the top bar, `ARROWS MOVE`, no power meter), no pause menu and no end screens, in empty space; combine it with `&stage=…` (e.g. `&stage=zone-a`) and `&loadout=full` |
| http://localhost:5173/?stage=test-range | The **Test Range**, the first scrolling stage (above) |
| http://localhost:5173/?stage=test-range&loadout=full | The Test Range with the **fully powered** ship: laser, missiles, four Options, Force Field ([Your weapons](#your-weapons)) |
| http://localhost:5173/?stage=test-boss | The **Boss Range**: the WARNING and the test boss ([above](#the-boss-range-and-the-warning-browser-only)); add `&loadout=full` to fight it fully powered |
| http://localhost:5173/?stage=raster-range | The **Raster Range**: the SNES-style picture effects — the waving, colour-rolling sea, the checkered floor, the heat haze ([above](#the-raster-range-browser-only)) |
| http://localhost:5173/?scene=showcase | The **sprite showcase** the previous builds started with: the KESTREL flying a figure-eight with two Options, five enemies with hit flashes, a ring of bullets, both HUD bars with a counting score and a blinking power meter. Nothing reacts to the controls |
| http://localhost:5173/?scene=calibration | The **calibration screen**, for judging scaling and colours on a new display (below) |
| http://localhost:5173/?scene=fx-gallery | The **effects gallery**: over still stars, one effect a second — each explosion and spark (three bursts in the middle of the picture), then the small, medium and large screen shake, the three flashes (Mega Crash, WARNING, boss blast), the darkening and a row of score numbers — then it starts over. The name of the effect shows near the top (`1/19  EXPLOSION.SMALL` …). Nothing reacts to the controls. Useful for judging the effects on a monitor without having to play to them |

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

A 1152×648 window (×3) opens with the same title screen as the browser (no EXIT entry yet —
close the window to quit); 1 PLAYER plays AZURE VERGE; play with the keyboard or a gamepad (2 PLAYERS with a second gamepad or the SPLIT KEYBOARD). The Options screen and the saved
settings and high scores work as in the browser.
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
| `AUDIO FAILED TO LOAD` | A sound or music file the game needs could not be loaded (the placeholder sounds are made by the game itself, so this only concerns recorded sound files of later builds); the line below names the file |

If more problems are found than fit on the screen, the last line says `… and N more`.
Please **take a photo of the whole screen** and send it with your report — the lines are
exactly what a developer needs. On the TV, press **Back** to close the app. These screens
mean the build itself is broken; they are not caused by anything you did.

## Troubleshooting

| Symptom | What to do |
|---|---|
| A panel of numbers (FPS, TICK, …) and a small bar graph appear in the top-left corner | That is the developer panel of a **debug build** (`build:dev`), opened by Play/Pause followed by Ch ▲ three times. Press **1** to hide it — see [debug-tools.md](debug-tools.md). The normal build never shows it |
| The game froze without a PAUSE box, or everything runs in slow motion (debug build) | A developer tool is on (`STEP` or `SLOW` in the panel): press **4** or **6** until it is off — [debug-tools.md](debug-tools.md#troubleshooting) |
| The title screen stays, the game does not start | Press OK (Enter) once to leave `PRESS OK`, OK again on 1 PLAYER, then OK on a difficulty in the DIFFICULTY box and OK on a ship in the SHIP SELECT box. In a browser click once into the page first so it has the keyboard focus |
| 1 PLAYER opened a DIFFICULTY box instead of the game | Expected: choose a difficulty with ▲ / ▼ and press OK (Back returns to the title menu) — then OK on a ship in the SHIP SELECT box and, for the KESTREL, OK once more on START in the WEAPON SELECT screen |
| OK on a difficulty opened a SHIP SELECT box instead of the game | Expected since this build: the KESTREL is highlighted, so OK goes on to the WEAPON SELECT screen as before; ▼ and OK choose the MANTA, which starts at once ([Choosing your ship](#choosing-your-ship)) |
| OK on the KESTREL opened a WEAPON SELECT screen instead of the game | Expected: START is highlighted, so OK starts the game with the weapons shown; ▲ / ▼ and ◀ / ▶ change them first if you like ([Choosing your weapons](#choosing-your-weapons)) |
| My ship flew off to the right on its own after the boss | Expected: the fly-out at the end of every zone — the zone result follows |
| The title started a game by itself / a zone plays without me | That is the **attract loop's demo** (after 12 seconds on `PRESS OK`): the computer plays, silently, with `DEMO PLAY` at the top. Press any button to get the title back ([When nobody plays](#when-nobody-plays-the-attract-loop)) |
| After GAME OVER a **NEW HI-SCORE!** box asks for a name | Expected since the front end build: type your initials with ▲ ▼ and ▶, OK on `END` ([Typing your initials](#typing-your-initials)). Doing nothing takes the name as it is after 30 seconds |
| OK in the name entry does not finish | OK moves to the next letter; press it until the cursor is on `END`, then OK once more (or ▶ to reach `END` faster) |
| My score is not in the table I looked at | Every difficulty, ship and kind of game has its own table — a 2 PLAYERS game's scores are in the `2 PLAYERS` table, practice scores in the `PRACTICE` table |
| A practice score did not change the title's `HI` | Expected: practice (and 2 PLAYERS) scores stay in their own tables; the title's `HI` is the one-player best |
| OPTIONS opens something else | The title menu gained PRACTICE (third) and SOUND TEST (fifth): OPTIONS is the fourth entry now |
| A sound-test tune does not start at once | The first play of a tune prepares it (a moment); in a browser press a key once first so sound is allowed |
| A **ZONE MAP** appeared instead of the title after the boss | Expected since this build: choose the next zone with ▲ / ▼ and press OK ([The zone map](#the-zone-map-a-run-through-nine-zones)); Back → YES returns to the title |
| A zone is very short and has zone A's enemies and boss | Not expected any more: every zone B to I is the real one (the stand-ins are gone) — please report the zone and the route |
| Bosses I already beat came back in zone H | Expected — IRON CITADEL's **parade**: four smaller echoes of earlier bosses, each leaving after about 16 seconds. The zone's own boss, IRON SOVEREIGN, comes after the WARNING at the end |
| `?skip=boss` (or the debug key 8) in zone H started at the parade, not at IRON SOVEREIGN | Expected: the shortcut stops before the zone's **first** boss, which in IRON CITADEL is the parade's first echo. Fly on for about 1½ minutes; in the debug build the quickest way is key 7 three times (the last checkpoint) and about 35 seconds of flying — key 8 pressed after the parade jumps back to it |
| I got hit by something coming out of the floor or the ceiling in the piston hall | The pistons: blocks that swing in and out of the plating. Watch the gap move and stay in the middle of it; touching a piston costs a ship like rock |
| A mine exploded into a ring of bullets right next to me (zone I) | Expected — depth mines arm when you come close. Shoot them from further away (3 hits, 300 points), or step through a gap in the ring |
| The ABYSS ARK flew away and the zone ended without another boss | Expected when the ARK's heart still stands after 90 seconds: it escapes, THE HOLLOW KING never appears and the ending is THE FLAGSHIP SLIPS AWAY. Power up during the zone and aim at the heart whenever the view shows it |
| THE HOLLOW KING takes no damage | Expected while its mouth is shut — shoot the glow inside the open mouth |
| The ending came without its scene or story | Not expected after zone H or I — please report the final zone and the ending name. (A browser test stage or `?stage=zone-h` played alone ends on STAGE CLEAR: the ending needs a whole run) |
| Back does nothing on the ending screen | Expected: only OK moves the story and the card on (so a mashed button never skips it); in the credits OK and Back both skip to the title |
| A hole I shot into a tissue wall closed again (zone F) | Expected — CELL VAULT's tissue grows back about four seconds after it was shot. Every wall also has a gap; fly through the gap or through your hole quickly. Tissue never grows back on top of your ship |
| Something grabbed my ship and pulled it (zone F) | A tentacle's claw: it lunges when you come near and tugs your ship for a moment, then lets go. Fly on against the tug, or shoot the claw (5 hits). Touching the claw costs a ship |
| A cell followed me (zone F) | Expected — the chasing cells follow your ship for about two seconds, then swim straight on. They cannot turn sharply: step out of the way at the last moment, or shoot them (2 hits). A big dividing cell splits into two of them when shot |
| Shots do nothing to MANTLE REGENT | Expected on the mantle and on the tentacles (armour) — and on the eye while the tentacles are curled in front of it: wait for them to open. The tentacle roots can be broken (24 hits) |
| I shot all the turrets in the crystal gallery and no bonus stage came (zone G) | The secret entrance opens only when the gallery has **passed** (about 1:07), and only if all **four** gallery turrets — two on the floor, two on the ceiling — were shot down. It never opens again after a ship was lost in GLIMMER CACHE (RETRY STAGE resets that); after a checkpoint restart the turrets shot before it do not count |
| I cannot shoot through a crystal wall (zone G) | Expected: the labyrinth's walls are solid. They hang from the ceiling and rise from the floor in turn — fly under one, over the next |
| Blocks of crystal appeared out of nowhere (zone G) | Expected: the cubes of the cube rush stick where they hit rock and become crystal blocks. Shoot them away (2 hits each) or fly round them. After a restart they are gone |
| Shots do nothing to FACET MONARCH | Expected on the housing and the arms (armour), and on the core until both crystals in front of it are broken: shoot the crystals first |
| The wall of cells (CELL VAULT) or the crystal facets (PRISM LABYRINTH) change colour or sway | Expected — the zones' picture effects, behind everything. Report it if the ship, enemies, bullets or the HUD ever change colour or wobble |
| The scrolling stopped and the picture sank down (zone D) | Expected: the dive into MAGMA DEEP's caves, about 1:17 in. The zone carries on down there. Report it if your ship was pushed into rock or the picture jumped instead of sliding |
| I cannot get through a brick wall (zone D) | Every wall has a gap — look for it higher or lower — or shoot through: each brick breaks after 4 hits. After a restart the broken bricks are back (expected) |
| A rock fell on me out of the cave roof (zone D) | Expected — the hanging rocks drop when your ship comes near. Watch the roof and step down early, or shoot them (2 hits) |
| Shots do nothing to CINDER BASTION | Expected on the hull and on the turning shield arms (armour): fire at the core while no arm covers it. The laser emitters can be destroyed too |
| An enemy hit me from behind (zone E) | Kites and jets in TEMPEST RIDGE come in from the left edge behind your ship and pass it along one row — step up or down out of that row as they come |
| Shots do nothing to SQUALL STEED | Expected while its chest is shut (a clink) and on the body, head and lids, which are armour: wait for the chest to open. The snout can be destroyed too |
| The clouds (TEMPEST RIDGE) or the lava (MAGMA DEEP) change colour, the rain moves over the picture | Expected — the zones' picture effects, behind everything. Report it if the ship, enemies, bullets or the HUD ever change colour or wobble |
| Shots do nothing to GALVANIC MAW | Expected while its mouth is shut (a clink) and on the hull and jaws, which are armour: wait for the mouth to open. The rocket pods can be destroyed too |
| SANDGRAVE WIDOW's head takes no damage | Expected until both fangs in front of it are destroyed |
| A sand worm came out of the ground right in front of me | Expected — worms burst out when your ship comes near. Watch for the head and step up out of its arc |
| A mid-boss came without a WARNING and then flew away (zone B) | Expected: SPUME HERALD fights while the screen scrolls on and leaves after 30 seconds if it survives |
| I flew into the gap at the top of BRINE NEBULA and nothing happened | The ship has to be **inside** the gap between the two reef blocks while it passes (fly under the left block, then up); it only works once per zone, and never again after a ship was lost in PEARL GROTTO (RETRY STAGE resets that) |
| The sea (BRINE NEBULA) or the dunes and suns (DUNE EXPANSE) wobble or shimmer | Expected — the zones' picture effects. Report it if the ship, enemies, bullets or the HUD ever wobble |
| A browser test stage (`?stage=…`) ended with STAGE CLEAR, not the zone map | Expected: test stages are played on their own; only a normal game (no `?stage=`, or `?stage=zone-a`) is a run across the map |
| The next zone started silent, or with the wrong tune | Not expected — please report the route (e.g. `A C E`), the device and whether it happened after a previous run ended |
| The ending screen came without an ending I expected | The ending depends on the final zone and the run: THE … FALLS SILENT / THE DEEP IS STILL need no ship lost in the **whole** run (a RETRY STAGE after a loss still counts the loss); if the ABYSS ARK escaped, zone I always ends with THE FLAGSHIP SLIPS AWAY |
| An entrance in the Bonus Range did not open | Only the first entrance you open counts, and after a loss in the Bonus Vault none opens again (RETRY STAGE resets that). The gap needs the ship itself in the gap while it passes; the ground entrance needs **all three** turrets |
| `?stage=bonus-range` (or a zone) does nothing on the TV | Expected: the TV widget has no address bar; the zones (and zone B's secret bonus stage) are reached through the map, the Bonus Range is browser only for now |
| OK does nothing in the game | Expected with the **MANTA**: it has no power meter — its colour items work when you fly into them. With the KESTREL OK needs a highlighted box on the power meter ([Power-ups](#power-ups)) |
| Ch ▼ does nothing | Expected with the KESTREL (it speeds up with SPEED UP on the power meter). With the MANTA each press should switch its speed and light the SPD squares — if not, please report it with the remote model |
| A colour item vanished before I got to it | Expected after about ten seconds (it blinks for the last two) — items do not wait |
| A red (or green) item gave only points | Expected when SHOT (or SUB) is already at level 8 — all eight squares lit |
| The yellow item did not hurt the boss | Expected: it destroys the other enemies and the bullets, but bosses are not affected (a later build makes it hurt the mid-bosses of the later zones) |
| The MANTA's weapon suddenly changed from discs to lasers (or back) | You collected the red **octagon**: it switches the main gun's style and keeps the level |
| Broken bricks came back (Gimmick range) | Expected after a loss on ARCADE or a CONTINUE?: the game restarts at the last checkpoint with the stage's rock as it was at the start |
| A broken pink wall grew back (Gimmick range) | Expected: tissue grows back about four seconds after it breaks — never onto your ship |
| My ship drifted without pressing anything (Gimmick range) | A **suction pod** or a **tentacle's** grab is pulling it — fly against it or shoot the pod / claw |
| The view stopped and moved down with no boss (Gimmick range) | Expected: a timed stop with a pan down into the dip; it scrolls on after three seconds |
| `?stage=gimmick-range` does nothing on the TV | Expected: the TV widget has no address bar; the Gimmick range is browser only for now |
| The picture has black borders on the sides and top (PC) | Expected with **SCALE → INTEGER** (the start setting) when the window is not a whole multiple of the game's picture; choose FIT (thinner or no border) or STRETCH (no border) in OPTIONS |
| The picture looks stretched, or some pixels look wider than others | **SCALE** is FIT or STRETCH — expected; OPTIONS → DISPLAY → SCALE → INTEGER gives the sharpest, evenly sized pixels |
| SCALE changes nothing on the TV | Expected on a 1920 × 1080 picture: the game fits it exactly five times, so all three settings look the same |
| A white square with a pink-red frame sits on my ship | **HITBOX** is ON — it shows the ship's weak spot. OPTIONS → DISPLAY → HITBOX → OFF hides it |
| The picture no longer shakes when the ship is lost | **SHAKE** is OFF in OPTIONS |
| The Mega Crash flash is weak or the boss's blast barely flashes | **FLASHES** is REDUCED in OPTIONS (at most one dim flash a second) — set NORMAL for the full flashes |
| The Mega Crash no longer turns the screen white | Expected since this build: the flash brightens the picture so you can still see the bullets; it should still be clearly visible |
| The sea or the floor in the Raster range wobbles / changes colour | Expected — those are the stage's picture effects ([The Raster range](#the-raster-range-browser-only)). Report it if the ship, enemies, bullets or the HUD ever wobble or change colour |
| `HI` vanished from the top bar during a boss, and `BOSS` with a red bar showed instead | **BOSS HP** is ON — the bar is the boss's remaining strength; `HI` comes back after the boss's big blast. OPTIONS → BOSS HP → OFF keeps `HI` there |
| The boss HP bar did not move although I hit the boss | Expected on parts that do not matter for the kill — armour, guns, extra parts. Only the core(s) and the parts protecting them count (HALCYON BULWARK's shield plates and core) |
| BOSS HP changed nothing in the paused game | It shows once you leave the DISPLAY page with BACK (and resume) |
| The scrolling did not stop for a boss (Captain range) | Expected: mid-bosses ("captains") fight while the screen scrolls on — no WARNING, the stage music keeps playing |
| The view moved by itself and took my ship along (Raid range) | Expected: during the battleship fight the view flies around the battleship; it glides back when the fight is over |
| The battleship flew away and the stage ended (Raid range) | Its 90-second time limit ran out — it escapes without points. Destroy the two turrets next to the reactor, then the reactor, faster (try `&loadout=full`) |
| Another boss came out of the explosion (Raid range) | Expected: LEVIATHAN HEART, the boss inside the battleship |
| One of the twins moved off to the right and cannot be hit (Twin range) | Expected: the twins take turns every five seconds; the resting one cannot be hit (and cannot hurt you) until it comes back |
| Shots vanish on the round orbs (Captain and Raid ranges) | Expected: the orbs circling ORBIT WARDEN and LEVIATHAN HEART are armour — aim at the glowing core between them |
| `?stage=raid-range` (or another boss range) does nothing on the TV | Expected: the TV widget has no address bar; the boss ranges are browser only for now — BOSS HP works on the TV in AZURE VERGE |
| Motion looks smoother on my gaming monitor than on the TV | Expected: on monitors faster than 60 Hz the game draws the in-between positions; the TV shows 60 pictures a second and draws each one exactly |
| The MANTA survived touching the rock | Expected while the **Arm** is up: it takes a hit for the ship, even from the rock (the KESTREL's shields do not) |
| The MANTA's gun got weaker after a loss | Expected: a lost ship costs the Arm and, on NORMAL and HARD, one SHOT level (on ARCADE everything) — [The MANTA](#the-manta-colour-items-weapons-and-the-arm) |
| `HI` changed after I chose the other ship | Expected: the KESTREL and the MANTA keep separate high scores for each difficulty |
| ▼ jumps over MISSILE, DOUBLE and LASER in the WEAPON SELECT screen | Expected: they show the chosen type's weapons; choose **EDIT** on TYPE to change them one by one |
| The WEAPON SELECT screen is back on TYPE A after reopening the app | Expected: the choice is kept only until the app is closed (a later build remembers it) |
| The power meter says `SPREAD` / `TAIL` / `RIPPLE` (or other names) instead of MISSILE / DOUBLE / LASER | Expected with another weapon type: the boxes carry the chosen type's weapon names |
| OK on the `!` box gave the "no" buzz | Expected when the `!` choice cannot do anything right now: NORMAL while you fire the darts, SPEED DOWN at normal speed, LIFE OPTION without a spare ship or with four Options, FULL BARRIER while your shield is at full strength |
| A spare-ship icon vanished without a loss | Expected after OK on `!` with **LIFE OPTION**: spare ships turned into Options |
| The preview ship behind the WEAPON SELECT panel was hit and nothing happened | Expected: the preview is a harmless practice range and its ship cannot be hurt |
| A Ripple ring passed through a small enemy without hitting it | Expected when the ring had already grown around it: rings hit with their edge |
| A Spread Bomb touched an enemy and did no damage at once | Expected: the bomb bursts, and its blast does the damage (twice) a moment later |
| Power-ups are taken without pressing OK | **AUTO** is on in the WEAPON SELECT screen — they follow its ORDER. Set AUTO to OFF to take them only with OK |
| Ch ▲ does nothing | Expected with TRAIL or SNAKE Options (and without Options): it only spreads FORMATION and ROTATE. If it does nothing with those, please report it with the remote model |
| The Options spread out while I took a power-up | OK was held for a quarter of a second or more — holding OK spreads FORMATION / ROTATE Options. Press it briefly to only take the power-up |
| The `?` box is not greyed although a FREE SHIELD is up | Expected: with FREE SHIELD `?` adds a second pair of pods, then renews the most worn pair |
| Bullets hit the ship although pods were up | Expected when they came past the pods: pods stop only what touches them, and never lasers or the rock. The FORCE FIELD and REDUCE protect the whole ship |
| My Options vanished | An **Option Hunter** (the violet enemy after the alarm) took them — a Mega Crash or a blue capsule frees them to be caught again; if it leaves the screen they are lost. Hunters appear only in the browser's Hunter Range for now. Also: each loss costs an Option |
| Shots do not hurt the violet enemy | Expected: the Option Hunter is armoured — only a Mega Crash or a blue capsule destroys it |
| An Option Hunter never came in the Hunter Range | Expected when you had no Options at that moment — hunters come only for Options. Use `&loadout=full` or take OPTION first |
| A blue capsule left the enemy bullets on the screen | Expected: unlike Mega Crash, the blue capsule only destroys the enemies on the screen |
| The DIFFICULTY box is back on NORMAL (or the SHIP SELECT box on the KESTREL) after reopening the app | Expected: the choices are kept only until the app is closed (a later build remembers them) |
| The title's `HI` changed after I chose another difficulty | Expected: each difficulty keeps its own high scores, and the title shows the one you chose last |
| OK on the title menu did nothing | The menu ignores OK for a split second after it appears (an OK pressed then still counts a moment later). If 1 PLAYER or OPTIONS never reacts, please report it with the remote model |
| The highlight in a menu jumps two steps, or a press is lost | Not expected — please report it with the remote model (and whether you held the button) |
| Back closed the app on the TV | Expected only on the loading and error screens, and after answering **YES** to **EXIT SHMUP CUP?** on the title. Anywhere else, please report it (an older build closed the app on Back) |
| Back on the title does nothing in a browser | Expected on `PRESS OK`; in the menu it goes back to `PRESS OK`. A browser tab cannot close itself, so there is no EXIT |
| The game froze and darkened with a PAUSE box | You pressed Back or Play/Pause (Esc, P or Backspace on a keyboard), or the app came back from the background — choose RESUME or press Back again |
| The pause menu has no effect on the music | Expected: the music keeps playing while the game is paused |
| OPTIONS is grey | Not expected any more — OPTIONS opens the Options screen on the title and in the pause menu. Check that the installed build is the latest |
| BULLETS, SCALE, SHAKE, FLASHES, HITBOX or BOSS HP are missing from OPTIONS | Expected since the Options build: they are on the **DISPLAY** page (OK on DISPLAY); the control profile is PROFILE on the **CONTROLS** page |
| I changed LIVES, PENALTY, AUTO POWER, MAGNET, ONE BUTTON, AUTOFIRE or RATE and the game I paused did not change | Expected: they apply from the next game — or at once with RETRY STAGE. A game already running keeps what it started with, also in its next zones |
| DIFFICULTY is grey on the GAME page | It was opened from the pause menu: a game keeps its difficulty. Change it from the title's OPTIONS, or in the DIFFICULTY box |
| AUTOFIRE is grey on the CONTROLS page (TV) | Expected: the remote has no fire button, so the ship always fires on its own |
| The ship stopped firing (browser) | AUTOFIRE is TOGGLE (press Shot again) or HOLD (hold Shot). With KEYBOARD AS REMOTE or the SPLIT KEYBOARD there is no Shot key — set AUTOFIRE back to ALWAYS ([controls.md](controls.md#the-controls-page-autofire-socd-and-the-hiccup-protection)) |
| A button does something else than the tables in controls.md say | Somebody rebound it: OPTIONS → CONTROLS → REBIND KEYS (or REBIND PAD), MODE GAME or MENU, **RESET** puts the standard keys back; the INPUT TEST shows what each button does now |
| `THAT KEY CANNOT BE USED` or `NOT POSSIBLE: … NEEDS A KEY` in the rebind box | Esc and the remote's Back cannot be moved, and every action the game needs keeps a key — see [controls.md](controls.md#rebinding-keys-and-buttons) |
| I cannot leave the INPUT TEST | Hold Pause (Back or Play/Pause on the remote) for a whole second — the bar at the bottom fills |
| A volume or the control profile went back to what it was after closing the app | The Options screen keeps its settings when you leave it with **BACK** or the Back button — changes made just before the app was closed some other way are lost. If they are lost after BACK, please report it (on the TV: and whether the app was reinstalled in between — removing the app deletes its saved data) |
| No sound at all, or no music, but everything else works | Check OPTIONS: MASTER, MUSIC or SFX may be at `0` (0 is silent). Then the monitor's or PC's volume |
| The menu clicks are very quiet | They follow the **SFX** volume — turn it up in OPTIONS |
| OK on MASTER, MUSIC or SFX does nothing | Expected: the volumes change with ◀ / ▶; OK only works on CONTROLS and BACK |
| The ship stutters while I hold a direction after choosing FAST 8-WAY (TV) | This remote needs the hiccup protection: choose SAFE 4-WAY again under OPTIONS → CONTROLS → PROFILE (or set DEBOUNCE to AUTO), and please report the remote model |
| My high score is gone | Only runs that end on the GAME OVER screen or reach their ending (in a browser test stage: the STAGE CLEAR screen) are saved — QUIT TO TITLE (also on the ZONE MAP) and RETRY STAGE are not. In a browser, a private window or cleared site data forgets them, and another browser has its own. On the TV, removing the app deletes them; if they vanish otherwise, please report it |
| The settings and high scores were back to the start after an update | Installing a new build over the old one should keep them; please report it with how the build was installed. After removing and reinstalling the app this is expected |
| The ship does not move | Wait until it has finished flying in (⅔ of a second). In a browser, click once into the page so it has the keyboard focus; with a gamepad, press any button first. On the TV, report it together with the remote model |
| The ship moves only up, down, left and right | Normal on remotes that report one direction at a time, and with `?profile=keyboard-remote-emulation` in a browser. With a keyboard or gamepad and no `?profile=` in the address, please report it |
| The ship keeps moving after I let go (TV) | A tiny delay (1/30 of a second) is intentional. If it clearly keeps going, report it — and film it if you can |
| The ship stutters or stops for a moment while I hold a direction (TV) | Please report it with the remote model: the game's hiccup protection is supposed to hide exactly this |
| `?stage=test-range` flies in open space (no rock) | The stage name in the address is misspelled — check the spelling (`test-range`); the browser console names the unknown stage |
| The ship flies through the rock or an enemy in the test stage | Expected only while it flies in or blinks after a loss (it cannot be hurt then), and in open space there is nothing to hit. Otherwise rock and enemies destroy it — please report where it passed through |
| The ship vanished and a spare-ship icon went | It was destroyed (rock, an enemy or a bullet) — see [Lives](#lives-losing-your-ship-and-the-score). It should explode with a heavy sound and the picture should shake briefly |
| The game froze for a moment when the ship was hit | Expected: a short freeze (an eighth of a second) marks every loss |
| All enemy bullets vanished at once | Expected after a loss (and after a Mega Crash or a destroyed boss, where they turn into gold diamonds that fly to your score) |
| Small gold diamonds fly up to the top bar | Expected after a Mega Crash or a destroyed boss: each cancelled bullet is worth 10 points when its diamond reaches your score. Report one that stays on the screen for more than about three seconds |
| The bullets have unusual colours, or a dark / bright dot in the middle | The **BULLETS** option is set to a colour-blind set — OPTIONS → DISPLAY → BULLETS → STANDARD restores pink / red / purple. It is remembered between launches |
| BULLETS changed nothing | The new colours show at once, also over a paused game; if they do not, please report it with the set you chose (the browser console, if any, names a missing picture) |
| After a loss the ship lost an Option, the laser or a Speed Up | Expected: each loss costs one step of power, and always the Force Field ([Lives](#lives-losing-your-ship-and-the-score)) |
| GAME OVER — how do I start again? | Press OK on the GAME OVER screen (after half a second) or wait ten seconds: the title appears, and 1 PLAYER plays again. In free flight (`?scene=flight`) reload the page |
| A CONTINUE? box with a countdown appeared | Your last ship was lost and the difficulty has continues left: OK (after half a second) continues from the last checkpoint, Back or waiting ten seconds gives up |
| OK on CONTINUE? did nothing | It is ignored for the first half second; press it again. If it never reacts, please report it with the remote model |
| After a continue the ship has no power | Expected: a continue restarts without power, like in the arcade — collect capsules again |
| My score ends in 1, 2, 3 … instead of 0 | Expected after a continue: the last digit counts the continues you used |
| No CONTINUE? on ARCADE | Expected: ARCADE has no continues |
| I got an extra ship | Expected at 20,000 points, then 90,000, 160,000 and every 70,000 more (at most nine ships) |
| Enemies shoot more and faster later in the game | Expected: the game gets harder as your ship gets stronger (Missile, Double or Laser, Options, Force Field), and easier again when it loses power |
| A destroyed fan flier fired a bullet at me | Expected at a high rank (a fully powered ship on NORMAL, sooner on HARD and ARCADE): its revenge bullet |
| GAME OVER appeared while I still had a ship icon | Not expected — the icons show your *spare* ships, so GAME OVER comes only after the last icon has gone and that ship was lost too. Please report it |
| The ship was destroyed while it was blinking | Not expected — please report what hit it and the time into the stage |
| The ship does not shoot | It starts firing only once it has flown in (⅔ of a second). If it never fires — on the TV or in a browser — please report it; no button is needed |
| Only two shots are on screen at a time | Expected: the basic gun allows two at a time, like the classic games; it fires again as soon as one hits something or leaves the screen |
| Destroyed enemies just vanish — no explosion | Not expected any more: every destroyed enemy should burst into a fireball with a noisy burst of sound ([Explosions](#explosions-sparks-shake-and-flashes)). Please report it with the address you opened |
| An explosion or a score number covers an enemy bullet | Not expected — bullets are always drawn on top. Please report it with the time into the stage |
| The picture shakes | Expected when your ship is lost (a third of a second) and at a boss's final blast (two thirds of a second). The HUD bars must stay still — report it if they move. There is no setting to turn the shake off yet |
| The screen flashes | Expected at a Mega Crash (white), during the boss WARNING (red, three times) and at a boss's final blast (white). It never flashes more than three times a second; if the flashes are uncomfortable, please say so — a "reduce flashing" option joins the Options screen in a later build |
| Numbers pop up where enemies are destroyed | Expected: the points of each kill (white) and of a completed formation (gold). Capsules show a cyan ring instead of a number |
| Explosions or sparks are magenta-and-black checkered squares | Their pictures are missing from the sprite sheet; please report it (the build is broken) |
| `?scene=fx-gallery` shows only stars and the labels | The first effect appears within a second; if the explosions never show, please report it with the browser or TV model |
| The score stays at zero | In free flight in empty space there is nothing to score. In AZURE VERGE and the test stages it should rise with every destroyed enemy — please report it if it does not |
| `HI` went back to 0 (or to a lower score) after reloading | Expected when the best game was quit or retried rather than ended on GAME OVER / STAGE CLEAR (only finished games are saved), in a new private window, or in another browser. Otherwise please report it |
| The score went back to 0 after RETRY STAGE | Expected: a retry starts the stage over with a fresh ship and score; `HI` keeps the best |
| The red saucer leaves nothing behind | It leaves a capsule only when it is destroyed (by your shots or a Mega Crash); a saucer that flies off the screen leaves nothing |
| I pressed OK and nothing happened | Expected when no capsule was collected since your last power-up, or when you already have the maximum of the highlighted one (fifth Speed Up, the missiles, the Double or laser you already fire, four Options, a Force Field that is still up) — collect another capsule to move the highlight on. Look at the power meter: no highlighted box, or a greyed-out one, means OK has nothing to give ([Power-ups](#power-ups)) |
| Holding OK gave me only one power-up | Expected: one press, one power-up — let go and press again |
| No capsule after destroying a formation | Every member has to be destroyed; if one leaves the screen, there is no capsule. The six low pods at 17 s never leave one |
| A capsule vanished before I reached it | Capsules stay where they appeared and scroll off with the rock; once off the left edge they are gone |
| The ship flies over a capsule without picking it up | While it flies in (the first ⅔ of a second) the ship collects nothing. Otherwise please report it with the time into the stage |
| The Force Field does not protect against the rock | Expected — it only stops enemy bullets, lasers and enemies you fly into |
| Several bullets hit the Force Field but it wore only one step | Expected: right after a hit it flickers and is immune for a moment, so one burst cannot empty it |
| Capsules or the Force Field are magenta-and-black checkered squares | Their pictures are missing from the sprite sheet; please report it (the build is broken) |
| `?loadout=full` shows the normal ship (no orbs, no laser, no Force Field) | Check the spelling (`loadout=full`, lower case) and that it is joined with `&` after `?stage=…`. It only works in a browser — the TV and desktop builds always start with the normal ship |
| The orbs, laser or missiles are magenta-and-black checkered squares | Their pictures are missing from the sprite sheet; please report it (the build is broken) |
| A dart or beam flies through rock, or a missile floats above the ground or sinks into it | Please report it with a screenshot and the time into the stage |
| The Options trail behind the ship while it stands still | Expected only while you are moving; once you stop they should hold their places on screen. If they drift away while you stand still, please report it |
| An enemy bullet hits my ship and just disappears | Expected when a Force Field is up (it takes the bullet); without one the ship is destroyed. If a bullet disappears on the bare ship and nothing happens, please report it |
| Bullets fly through my ship | Expected while it flies in and while it blinks after a loss (it cannot be hurt then), and when they only graze the wings — the hit spot is a couple of pixels in the middle |
| No bullets at all in the test stage | Check the address says `?stage=test-range`. The first turret starts shooting about ten seconds in; the pods, saucers and spinner formations never shoot. Free flight in empty space has no enemies and no bullets |
| No bullets in the first minute of AZURE VERGE | Expected: the pods, saucers, fan fliers and arrowheads of the first two parts never shoot (the arrowheads ram). The first shooters are the gun turrets in the cave, from about 1:20 |
| Bullets appear out of nowhere, from an enemy still off screen, or keep flying through rock | Please report it with the time into the stage and which enemy fired |
| A bullet pattern cannot be dodged with the arrow directions alone | Please report it with the time into the stage — every pattern is meant to be dodgeable on the TV remote |
| Bullets are magenta-and-black checkered squares | The bullet pictures are missing from the sprite sheet; please report it (the build is broken) |
| An enemy floats above the ground, sinks into it, or walks through a wall | Please report it with a screenshot and roughly how far into the stage it was |
| An enemy jumps, stutters or suddenly vanishes in the middle of the screen | Please report it with the time into the stage — enemies should only disappear after leaving the screen |
| No enemies at all in the test stage | Check the address says `?stage=test-range` (with rock along the bottom from the start). Free flight in empty space has no enemies |
| A game flies in empty space (no rock, no enemies) | A misspelled `?stage=` in the address (the browser console names it), or `?scene=flight` without `&stage=…`. Without either, every game plays AZURE VERGE — on the TV always. If the TV shows empty space, please report it |
| The screen slows down or stutters when many bullets are around | Not expected — the game is built for hundreds of bullets. Please report it with the time into the stage and the browser or TV model |
| The test stage stopped scrolling | At the end of the stage (after about 75 seconds) that is expected — the STAGE CLEAR screen follows. If it stops earlier, please report where |
| `?stage=test-boss` flies in open space with no WARNING | The stage name is misspelled — it is `test-boss`; the browser console names the unknown stage |
| The Boss Range stopped scrolling after five seconds | Expected: the WARNING stops the scrolling, and it stays stopped until the boss is destroyed |
| AZURE VERGE slowed down, sped up or stopped | Expected: it slows down in the cave (from about 1:15), runs at twice the normal speed in the fast stretch (about 2:25–2:50), eases off in the calm and stops for good at the WARNING (about 3:00) until the boss is destroyed. A stop anywhere else, please report with the time |
| `?skip=boss` starts at the beginning of the zone | Check the spelling — exactly `skip=boss`, lower case. It works only in a browser (not on the TV) and only for stages with a boss: with `&stage=test-range` there is nothing to skip to |
| My shots vanish on HALCYON BULWARK | Expected on its hull, its wings and its two emitters (armour — they can never be destroyed), on the core while any of the four plates still stands, and during its first 2½ seconds while it glides in. Shoot the plates at the core's height first, the leftmost one first |
| HALCYON BULWARK's lasers never stop | Expected: its emitters are armour, so the lasers last until the core is destroyed. Stay level with the core — the laser rows pass above and below it |
| A laser hit me although I had left its row | Only the beam hurts, and the rows **move with the boss** as it follows you up and down — move well clear of the blinking line. If it still happens, please report the time into the fight |
| The WARNING shows but there is no siren | In a browser, press a key once first — nothing plays before that. Otherwise not expected: the siren should wail three times with the red pulses. Please report it |
| The WARNING text is cut off, overlaps the HUD bars or shows odd symbols | Not expected — please report it with a screenshot |
| My shots vanish on the boss without hurting it | Expected while it glides in, on the dark armour blocks, and on the core while a shield plate still covers it. If the plates, the guns or the uncovered core do not flash when hit, please report it |
| The laser stops at the boss | Expected: it stops at the first part it cannot hurt (armour, or the covered core) |
| The boss never appears | It comes about eight seconds in (five seconds of flight, then three seconds of WARNING); check the address says `?stage=test-boss`. If the WARNING never shows, please report it |
| The boss just blinks and vanishes — no explosion | Not expected any more: explosions should burst (and crackle) over it for two seconds, then a big white blast. Please report it |
| Nothing happens after the boss is gone | Not expected any more: a few seconds after the final blast the STAGE CLEAR screen should appear, then `TO BE CONTINUED` and the title. Please report it |
| A boss laser hit me although I was not on the beam | Only the beam hurts, never the blinking warning line; note that the laser runs along the row of the gun that fired it. If it still happens, please report it with the time into the fight |
| Gaps, seams or flickering in the rock, or rock over a HUD bar | Please report it with a screenshot and roughly how far into the stage it was |
| The ship flies in from the left again | Expected after it was destroyed. If it happens without a loss (no spare-ship icon went), please report what you were doing |
| No sound at all in a browser | Press a key or click into the picture once — browsers allow sound only after that (a gamepad button does not count). Check that the tab is not muted (right-click the tab) and the PC's volume. If it stays silent, report it with the browser's name |
| No sound at all on the TV | Check the monitor's volume and mute. The shots should be heard from the start; if they are not, please report it with the monitor's firmware version |
| No music in a game on the TV or on the desktop | Not expected any more: AZURE VERGE's theme should start with the game (on the desktop after your first key press). Check OPTIONS → MUSIC is not `0`, then please report it |
| No music in the test stage, but sound effects play | Not expected — the stage theme should start with your first key press. Please report it with the browser's name |
| The music stops at the WARNING | Expected: it fades out for the siren, and the boss theme starts when the boss glides in |
| Silence after the boss | Expected until the title's music starts again after the STAGE CLEAR screen |
| No title music | In a browser press a key once first. On the TV it should play on the title from the start — please report it if it does not |
| A click, gap or jump in the music about 51 seconds in | That is the stage theme's loop point — it should not be audible; please report it (with the browser or TV model) |
| Sounds lag behind the picture, crackle or stutter | Please report it with the browser or TV model and what was happening (many explosions? a boss?) |
| A sound is cut off or missing in a busy moment | Somewhat expected: when many sounds play at once, the least important give way. Please report it if the siren or the loss of your ship is ever cut off, or if a sound is missing in a quiet moment |
| Error screen `AUDIO FAILED TO LOAD` | The build is broken (a sound file is missing). Photograph the screen and report it |
| Error screen with a pink title | See [When the app shows an error screen](#when-the-app-shows-an-error-screen) — photograph it and report it |
| Error screen `WEBGL IS NOT AVAILABLE` in a browser | Hardware acceleration is off or blocked: enable it in the browser settings (Chrome: Settings → System → "Use graphics acceleration when available") and reload. On the TV, report it together with the monitor's firmware version |
| Black or empty screen that stays black | Should not happen any more — the app shows an error screen instead. In a browser open the developer console: the message "Shmup Cup failed to start" gives the reason. On the TV, report it with the firmware version |
| Magenta-and-black checkered squares instead of some pictures | A picture the game asked for is missing from the sprite sheet. Report which element shows it (e.g. "the ship", "the second enemy") |
| Blurry picture in the browser | Browser zoom is not 100 % (press Ctrl+0), or the operating system scales the window unevenly. At 100 % zoom the pixels stay sharp on any display |
| Stars or ship stutter in the browser | Expected on 120/144 Hz monitors for now (smooth-motion interpolation is not in the preview yet); on a 60 Hz display it should be smooth. Also check the PC is not busy |
| Stars or ship stutter on the TV | Please report it — the M7 runs at 60 Hz and should show one step per refresh |
| Player 2's gamepad does nothing when I press START | The game must be a **2 PLAYERS** one (1 PLAYER games have no player 2). Press any button on the pad once so the TV / browser notices it. If `PRESS START` is not blinking, player 2 cannot join right now (the stage is ending, or the game is over) |
| In a 2 PLAYERS game my gamepad moves player 1's ship | Expected until you press START or A on it — then it flies player 2. Only one gamepad can be player 2; any other stays player 1's |
| Player 2 cannot join on the TV without a gamepad | Expected: the remote is always player 1's. The SPLIT KEYBOARD (two players on one keyboard) exists only in a browser |
| Player 2's START paused the game instead of bringing it back | Its ship is still flying or still exploding (wait until its half shows `PRESS START`), or it has no continues left (`GAME OVER` in its half) |
| An out player's half shows `GAME OVER` while the other plays on | Expected: that player has used all their continues; they are out until the game ends |
| Top or bottom HUD bar cut off on the TV | Check the monitor's picture size setting ("Fit to screen" / no overscan) and report which edge is missing |
| Opening `apps/tizen/dist/index.html` by double-clicking it shows an error or nothing | Desktop Chrome blocks the sprite sheet for files opened straight from disk. Use `pnpm --filter @shmup/tizen dev` instead (the TV itself is not affected) |
| The app does not appear on the TV | See the troubleshooting table in [install-on-tv.md](install-on-tv.md#troubleshooting) |
| Electron says it is not installed | It was skipped during installation; run `pnpm rebuild electron` |
| `pnpm dev` or `pnpm build` stops with "asset sources are invalid" | A graphics source file in the checkout is broken. Update to the latest version of the repository; if it persists, report the file names the message lists |

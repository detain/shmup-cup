# The preview build (free flight)

The game is not a game yet, but for the first time you can **fly the ship**. Every build —
browser, Samsung TV and desktop — starts with a short loading bar and then **free flight**:
the KESTREL, the player ship, flies in from the left edge of an empty starfield and from then
on follows the directional buttons of the TV remote, the arrow keys or a gamepad — and **its
gun fires on its own**. Free flight has no enemies and there is no sound yet.
Free flight exists to prove on each device that the
whole chain works — the controls reach the ship quickly and reliably, the 60 ticks per second
simulation runs smoothly, the picture is pixel-perfect at the monitor's resolution — and to
catch control, smoothness or scaling problems early.

In a browser you can also fly the first **scrolling stage** — the *Test Range*, with rocky
ground, caves, speed changes, enemies that fly and walk past and shoot at you, your ship
shooting them down, **power-ups** (the capsules some enemies leave behind, taken with the
remote's OK button) and, since this build, **lives, losing your ship and the score**: rock,
enemies and bullets now destroy the KESTREL, it comes back with a life less, and after the last
one it is **GAME OVER** (see [The scrolling test stage](#the-scrolling-test-stage-browser-only),
[Your weapons](#your-weapons), [Power-ups](#power-ups) and
[Lives, losing your ship and the score](#lives-losing-your-ship-and-the-score)) — and the earlier
start-up pictures are still there: the animated **sprite showcase** and the **calibration
screen** (see [below](#other-screens-browser-only)).

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
| **Shots** from the ship's nose | In front of the ship, flying right | As soon as the ship has arrived, small cyan-and-white darts leave its nose and race to the right edge, two at a time — see [Your weapons](#your-weapons) |
| **Top bar** | Top edge | `1P` (cyan) and your score `00000000` on the left; **FREE FLIGHT** (yellow) in the middle; `HI` (yellow) and the best score of this session on the right |
| **Bottom bar** | Bottom edge | Two small ship icons on the left (your spare ships — you start with three, the one you fly plus two); the hint `ARROWS MOVE` (grey) in the middle |

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
  capsules ([Power-ups](#power-ups)) — pressing it never stops or slows the ship.
- There is no pause screen yet; it arrives in a later step.

On the TV remote the ship stops about 1/30 of a second after you let go of a button — the
game waits that long to hide the remote's occasional "released and pressed again" hiccup, so a
held direction never stutters. Many remotes can only report one direction at a time, so the
ship may move in four directions only; the game is designed to be fully playable that way.

### What changed lately

**New in this build: lives, losing your ship and the score.** In the *Test Range* stage (browser
only) the KESTREL can now be destroyed: flying into the rock or an enemy, or being hit by an enemy
bullet, costs a ship. The game freezes for a split second, the ship vanishes (the explosion,
sound and screen shake are drawn in a later build), every enemy bullet on screen disappears, and
after about a second and a half it flies in again from the left, **blinking** — while it blinks
(about two and a half seconds after it is back under your control) nothing can hurt it, and it
keeps firing. Each loss takes one of the spare-ship icons in the bottom bar and one step of your
power (below); after the last ship the top bar says **GAME OVER** in red. And the **score**
counts now: every enemy you destroy, every completed formation and every capsule adds points to
the number next to `1P`, and `HI` on the right shows the best score of the session. See
[Lives, losing your ship and the score](#lives-losing-your-ship-and-the-score). On the TV and the
desktop (free flight: no enemies, no rock) nothing can hit the ship, so only the new `HI` in the
top bar is visible there.

Before that, **power-ups.** In the *Test Range* stage (browser only), the red saucers and
every formation you destroy completely now leave a blinking **power capsule**. Fly into it (it
drifts into the ship once you are close) and press **OK** — Enter or C on a keyboard — to take
the power-up the capsules have earned you: Speed Up, Missile, Double, Laser, an extra Option, a
**Force Field** that takes five hits, or the **Mega Crash** that wipes the screen. The power meter
that shows which one is highlighted is not drawn yet, so for now you count capsules — the
[Power-ups](#power-ups) section has the table. `?loadout=full` now also starts with a Force
Field. On the TV and the desktop (free flight, no enemies) there are no capsules yet, but OK is
now a game button there too.

Before that, **your ship learned to shoot.** Everywhere — on the TV, in the browser and on the
desktop — the KESTREL's gun fires **on its own** once the ship has flown in: small darts,
at most two on screen at a time, like the classic games this one follows. No button is needed
(the TV remote has none to spare). In the *Test Range* stage the shots destroy the enemies: an
enemy that takes more than one hit flashes white each time, and one that is destroyed simply
disappears — the explosions, sounds and the score counter come in later builds. In a browser
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
flight replaced the sprite showcase as the start-up picture. The simulation behind it is the real game engine: every
build adds to this world — next come the bosses with their WARNING sign.

**Please re-test on the monitors:** install the new build and run through the checks in the
next section — how the ship responds to the remote is still the most valuable report; new in
this build is only the `HI` score at the right end of the top bar (check 2), and **whether
pressing OK while you hold an arrow stops the ship** (check 9) still needs answers. On a PC,
please also fly the test stage once, normally and fully powered
(`?stage=test-range&loadout=full`), and report anything from its checklists (the rock, the
enemies, their bullets, your weapons, the power-ups, losing a ship) — in particular whether
every bullet pattern can be dodged with single arrow presses, whether the blinking after a
loss gives you enough time to get clear, and whether collecting capsules and pressing OK feels
natural with the remote's buttons (try `?profile=keyboard-remote-emulation`, which moves like
the remote and uses Enter as OK).

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
| **OK** (centre) | Takes a power-up — but free flight has no enemies and so no capsules, so on the TV a press does nothing visible yet (see check 9) |
| **Back** (↩) | Closes the app and returns to the monitor's home screen — also from the error screen |
| **Home** | Leaves the app; everything freezes while it is in the background. Reopening it continues exactly where it stopped — nothing jumps ahead |
| Everything else | Read by the game every tick, but nothing reacts to it yet (the gun fires without any button) |

Things to check on the monitor and report:

1. A loading bar (or nothing at all, if it is very quick) and then the stars and the ship
   flying in — never a black screen that stays black.
2. **Both HUD bars are complete**: the top bar's `1P` and score on the left, **FREE FLIGHT**
   in the middle and `HI 00000000` on the right (new — its last digit ends just before the
   right edge); the bottom bar's two ship icons and `ARROWS MOVE`. If one edge is cut off,
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
8. **The gun fires on its own** as soon as the ship has flown in, without touching any button:
   small cyan-and-white darts leave the ship's nose, two at a time, and fly straight to the
   right edge at an even speed. They never appear over the HUD bars, and they keep coming
   wherever you fly — also while you hold a direction. Report if they stutter, flicker, show
   up as magenta-and-black squares, or stop.
9. **Hold an arrow and press OK while you hold it** (for example hold ▶ and press OK a few
   times): the ship must keep moving the whole time, without stopping or stuttering when OK is
   pressed or released. Report whether it does — it tells us if the remote drops a held arrow
   when OK is pressed, which decides how comfortable power-ups are on the TV.
10. After Home → reopen, the app comes back without a black screen and the ship is where you
   left it.

The TV always starts with free flight, where nothing can hit the ship — the score stays at zero
and the two spare ships stay. The test stage (and with it the power capsules, losing ships and
the score), the fully powered ship, the showcase and the calibration screen can only be opened
in a browser.

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

### The scrolling test stage (browser only)

Open http://localhost:5173/?stage=test-range (add `&profile=keyboard-remote-emulation` to fly
it with the TV remote's limits). The top bar's title reads **TEST RANGE** instead of FREE
FLIGHT, and the view scrolls to the right on its own while you fly — the ship keeps its place
on screen unless you move it, and the world slides past from right to left. The whole run
takes about a minute and a quarter:

| Time (about) | What happens |
|---|---|
| 0–1 s | The ship flies in while the scrolling speeds up to its normal pace (one screen width every six seconds or so) |
| from the start | Rolling **rocky ground** along the bottom: gentle hills with 45° and shallower slopes, a light green rim on top of darker rock |
| 19 s | A **cave** comes into view on the right: rock along the top *and* the bottom |
| 25 s | As the view enters the cave, the scrolling **doubles** its speed |
| 33–36 s | The cave ends; the scrolling eases off, then slows to a crawl in open space |
| 36–45 s | A second, **deeper cave** creeps into view — the ceiling hangs lower, the floor is flatter; at about 45 s the scrolling is back to normal speed |
| 62–68 s | The rock ends; open space |
| 75 s | The stage ends and the scrolling stops for good. Nothing else happens yet (no "stage clear" screen) — reload the page to fly it again |

Two star layers move behind everything: the far stars at a quarter of the scrolling speed,
the nearer ones at half. They only move while the view scrolls (unlike free flight's stars,
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

If the address names a stage that does not exist (for example a typo in `?stage=`), the game
starts in ordinary free flight instead; the browser's developer console then says `no stage
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
- The enemies never fire long beams (lasers) yet; those come with later enemies and bosses.

## Your weapons

The KESTREL's gun fires **by itself** as soon as the ship has flown in — on the TV, in the
browser and on the desktop, in free flight and in the test stage. There is no fire button to
press (holding Shot or Sub changes nothing); this "always-on" fire is what makes the game
playable with the TV remote. The pictures are placeholders (original designs).

**The normal ship** (every build) has the basic gun:

- Small **cyan-and-white darts** leave the ship's nose and fly straight to the right, fast —
  they cross the whole picture in under a second.
- **At most two are on screen at a time**, as in the classic games: a new pair follows as soon
  as the earlier darts hit something or leave the screen. So the gun fires faster at enemies
  close in front of you — that is intentional.
- A dart disappears when it hits an enemy, the rock or the edge of the screen.
- One hit destroys the small enemies (pods, spinners, arrowhead fighters); the others need more
  — saucers and walkers two, turrets and lone spinners three, the armoured hatch eight — and
  **flash white** every time they are hit. A destroyed enemy simply disappears (the explosion
  and the sound come in later builds) and its points are added to your score
  ([the score](#the-score)); saucers and completed formations leave a power capsule
  ([Power-ups](#power-ups)).

**Fully powered** (browser only, for testing): add `&loadout=full` to the address, e.g.
http://localhost:5173/?stage=test-range&loadout=full (or `?loadout=full` for free flight). You
start with most of what the power-ups give you:

| What | What "good" looks like |
|---|---|
| **Faster ship** | The ship moves noticeably faster than normal (speed level 3 of 6) |
| **Laser** instead of the darts | A thin pale-blue beam shoots out of the nose, grows to about a sixth of the screen's width and races right. It passes **through** enemies, damaging each one it touches up to ten times a second, and it moves up and down with the ship that fired it. It stops at rock: the beam's front stays at the wall while its tail catches up and it vanishes. One beam per ship or Option at a time |
| **Missiles** | Small grey missiles with a flickering orange flame drop diagonally forward and down — one at a time from the ship and from each Option; the next follows as soon as the last one is gone. On the ground they **slide along the rock**, following slopes up and down; a steep wall stops them, and over a drop they fall again. In free flight (no ground) they simply fall off the bottom of the screen |
| **Four Options** | Four glowing red-and-orange orbs that pulse gently. They follow the path your ship has flown: **when you move, they string out behind you** along your path; **when you stop, they stay where they are on screen** (even while the stage scrolls); pushing against the edge of the screen gathers them onto the ship. Each one fires the laser and the missiles too. They float through rock, cannot be hurt, and start on top of the ship when it flies in |
| **Force Field** | A glowing cyan ring around the ship that takes five hits — see [Power-ups](#power-ups) |

What "good" looks like, with either loadout:

- Shots, beams, missiles, orbs and the Force Field only ever appear inside the playfield — never over the top or
  bottom bar — and never as magenta-and-black checkered squares.
- Everything moves smoothly and keeps its speed on screen while the stage speeds up or slows
  down.
- Darts and beams never fly through rock; missiles rest exactly on the ground while sliding
  (not floating above it, not sunk into it).
- Enemies that are hit flash white; destroyed ones disappear at once and never come back.
- The frame rate stays smooth even with everything firing.

## Power-ups

Since this build the KESTREL powers up the classic way, with a **power meter**. Everything here
happens in the *Test Range* stage (http://localhost:5173/?stage=test-range) — free flight on the
TV and the desktop has no enemies and so no capsules yet. The meter itself (a row of seven boxes
in the bottom bar) is **not drawn yet** — it arrives with the heads-up display in a later build —
so for now you count your capsules. There are no sounds for any of this yet either.

**Power capsules.** Small orange-red pills that blink. In the test stage they come from:

- every **red saucer** (at about 5 s, 33 s and 65 s) that you shoot down — the capsule appears
  where it was destroyed;
- every **formation** — a row of green pods or a file of spinners — that you destroy
  **completely**: the last one leaves the capsule. If a single member escapes off the screen,
  there is none. The six low pods at 17 s never leave one.

Capsules stay where they appeared and scroll away with the rock, so fly over to them. You do not
have to hit them exactly: once the ship is close (about a ship's width away), the capsule drifts
into it by itself. A capsule you touch disappears at once, and **every** capsule counts — also
several collected in quick succession.

**The meter and the OK button.** Each capsule moves the (invisible) highlight one step along the
meter; **OK** — the centre of the remote's directional pad, Enter or C on a keyboard, X / Square
on a gamepad — takes the highlighted power-up, and the highlight goes back to the start:

| Capsules since your last power-up | Highlighted | What OK gives you |
|---|---|---|
| 1 | SPEED UP | The ship moves faster (five Speed Ups at most) |
| 2 | MISSILE | Missiles that drop to the ground and slide along it |
| 3 | DOUBLE | A second shot that climbs diagonally — replaces the laser |
| 4 | LASER | The long piercing laser — replaces the Double |
| 5 | OPTION | One more glowing orb that follows the ship and copies its fire (four at most) |
| 6 | ? | A **Force Field** around the ship (below) |
| 7 | ! | **Mega Crash**: every enemy and every enemy bullet is destroyed at once |
| 8 | SPEED UP again | After `!` the highlight starts over |

- **One press, one power-up.** Holding OK never takes a second one; let go and press again.
- A press **does nothing** (and the highlight stays where it is) when no capsule was collected
  since the last power-up, or when you already have the most of the highlighted one: the fifth
  Speed Up, the missiles, the Double or laser you already fire, four Options, a Force Field that
  is still up. Collect another capsule to move the highlight on. Later the meter will show such
  slots greyed out and play a "no" sound.
- You may leave the highlight "parked" on a power-up as long as you like and press OK when it
  suits you — it is never taken by itself.
- Pressing OK never stops or slows the ship, also while you hold a direction.

**The Force Field** (`?`). A glowing ring around the ship. It stops **five** hits — enemy
bullets, enemy lasers and enemies you fly into — and wears as it goes: bright cyan when fresh
(five and four hits left), then light blue with a few gaps (three), violet with more gaps (two)
and purple and full of holes (one); the next hit breaks it. After every hit it flickers for a
moment (about an eighth of a second) during which further hits are free, so a burst of bullets
costs only one step. It does **not** protect against the rock. While it is up, `?` cannot be
taken again; once it has broken, it can.

**Mega Crash** (`!`). Every enemy — also the ones just about to come in — is destroyed at once,
and every enemy bullet vanishes. Enemies destroyed this way count as shot down: a saucer or the
last member of a formation still leaves its capsule. (The bosses of later builds will not be
hurt by it. The screen flash and the sound come later.)

**Fully powered** (`&loadout=full`, see [Your weapons](#your-weapons)) now also starts with a
fresh Force Field.

What "good" looks like:

- Capsules appear exactly where the saucer or the formation's last member was destroyed, blink
  steadily, stay put against the rock and never appear over the HUD bars.
- A capsule near the ship glides smoothly into it; one you touch vanishes at once.
- One OK press = exactly one power-up, visible straight away: a faster ship, missiles, the
  Double, the laser, one more orb, the ring, or an empty screen after a Mega Crash.
- The Force Field sits centred on the ship and moves with it, wears one step per hit, flickers
  after each hit and disappears after the fifth.
- After a Mega Crash no enemy and no enemy bullet is left on the screen.

## Lives, losing your ship and the score

Since this build the KESTREL can be **destroyed**, and the game keeps score. Everything here
happens in the *Test Range* stage (http://localhost:5173/?stage=test-range) — in free flight (the
TV and the desktop) there is nothing that can hit the ship.

**What costs a ship.** Flying into the **rock**, flying into an **enemy**, or being hit by an
**enemy bullet**. A Force Field takes enemies and bullets for you (five hits, see
[Power-ups](#power-ups)) but never the rock. The ship's hit spot is tiny — a couple of pixels in
the middle of the hull — so bullets that only graze the wings pass.

**What you see when you lose one:**

| When (after the hit) | What happens |
|---|---|
| At once | The ship vanishes, and **every enemy bullet on the screen disappears**. The action freezes for a split second (an eighth of a second) — this pause is on purpose, it makes the moment readable. One spare-ship icon goes from the bottom bar. (The explosion, the flying debris, the sound, the screen shake and the music going quiet for a moment are coming in later builds — for now the ship simply disappears.) |
| About 1½ s | The ship **flies in again from the left edge**, where the stage is now — it does not scroll back — at mid-height, ignoring the controls like at the start |
| About 2¼ s | It is yours again. It keeps **blinking** for another two and a half seconds: while it blinks (and while it flies in) **nothing can hurt it** — bullets, enemies and rock pass through — and it keeps firing |

**What a lost ship costs besides the life.** One step of your power — the first of these you have:

1. an **Option** (4 → 3 …);
2. otherwise the **Double or the Laser** (back to the small darts);
3. otherwise the **Missiles**;
4. otherwise one **Speed Up**.

The **Force Field** is always lost. The capsules you have collected towards the next power-up
(the invisible highlight on the meter) are kept. So a fully powered ship (`&loadout=full`) comes
back with three Options, then two, one, none, then without the laser … This is the *Classic*
rule, the game's default. The options menu of a later build will also offer *Arcade* (a loss
costs all your power and sends you back to the last invisible checkpoint of the stage) and
*Casual* (a loss costs only the Force Field).

**Game over.** You start with **three ships** — the one you fly and the two icons in the bottom
bar. When the last one is destroyed there is no icon left, the ship does not come back, and
after about a second and a half **GAME OVER** (red) replaces TEST RANGE in the middle of the top
bar. The stage keeps scrolling and the enemies keep coming, but nothing more happens: there is
no continue and no title screen yet — **reload the page** to play again.

### The score

The number next to `1P` is your score. It goes up when you:

| Destroy | Points |
|---|---|
| a small fighter from a hatch | 50 |
| a green pod, a spinner of a formation | 100 |
| the arrowhead fighter that dashes at you (15 s) | 150 |
| a red saucer, a walker | 200 |
| a gun turret (floor or ceiling), a lone spinner | 300 |
| the armoured hatch | 500 |
| a **whole formation** (every member destroyed — a bonus on top, for the one who destroys the last member) | 300 to 1,000, depending on the formation |
| collect a **power capsule** | 300 |

Enemies destroyed by a **Mega Crash** count too. Enemies that leave the screen, and destroyed
ships, score nothing; the score is never taken away. It stops at 99,999,990.

`HI` on the right of the top bar is the **best score of this session**: it follows your score
while you are beating it. It starts at 0 every time the game is opened — saved high scores come
with the options and save data in a later build.

What "good" looks like:

- Every hit by rock, an enemy or a bullet (without a Force Field) costs exactly **one** ship —
  also when several bullets hit at the same moment.
- The freeze after a loss is short and always the same length; nothing jumps when the game
  continues.
- After a loss **no enemy bullet** is left on the screen.
- The ship always comes back from the left edge at mid-height and blinks until it is safe;
  bullets that touch it while it blinks do not destroy it.
- The spare-ship icons go 2 → 1 → none, and GAME OVER appears only after the last ship.
- The score only ever goes up, by the amounts above, and `HI` is never lower than the score.

## Other screens (browser only)

| Address | Screen |
|---|---|
| http://localhost:5173/?stage=test-range | The **Test Range**, the first scrolling stage (above) |
| http://localhost:5173/?stage=test-range&loadout=full | The Test Range with the **fully powered** ship: laser, missiles, four Options, Force Field ([Your weapons](#your-weapons)) |
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
| `?stage=test-range` shows free flight (title FREE FLIGHT, no rock) | The stage name in the address is misspelled — check the spelling (`test-range`); the browser console names the unknown stage |
| The ship flies through the rock or an enemy in the test stage | Expected only while it flies in or blinks after a loss (it cannot be hurt then), and in free flight there is nothing to hit. Otherwise rock and enemies destroy it — please report where it passed through |
| The ship vanished and a spare-ship icon went | It was destroyed (rock, an enemy or a bullet) — see [Lives](#lives-losing-your-ship-and-the-score). The explosion and the sound are not drawn yet |
| The game froze for a moment when the ship was hit | Expected: a short freeze (an eighth of a second) marks every loss |
| All enemy bullets vanished at once | Expected after a loss (and after a Mega Crash) |
| After a loss the ship lost an Option, the laser or a Speed Up | Expected: each loss costs one step of power, and always the Force Field ([Lives](#lives-losing-your-ship-and-the-score)) |
| GAME OVER — how do I start again? | Reload the page. There is no continue or title screen yet |
| GAME OVER appeared while I still had a ship icon | Not expected — the icons show your *spare* ships, so GAME OVER comes only after the last icon has gone and that ship was lost too. Please report it |
| The ship was destroyed while it was blinking | Not expected — please report what hit it and the time into the stage |
| The ship does not shoot | It starts firing only once it has flown in (⅔ of a second). If it never fires — on the TV or in a browser — please report it; no button is needed |
| Only two shots are on screen at a time | Expected: the basic gun allows two at a time, like the classic games; it fires again as soon as one hits something or leaves the screen |
| Destroyed enemies just vanish — no explosion, no sound | Expected in this build: explosions and sounds come later. The score goes up, though; an enemy that needs several hits flashes white on each |
| The score stays at zero | In free flight (the TV and the desktop) there is nothing to score. In the test stage it should rise with every destroyed enemy — please report it if it does not |
| `HI` went back to 0 after reloading | Expected: the high score is kept only while the game is open; saving it comes later |
| The red saucer leaves nothing behind | It leaves a capsule only when it is destroyed (by your shots or a Mega Crash); a saucer that flies off the screen leaves nothing |
| I pressed OK and nothing happened | Expected when no capsule was collected since your last power-up, or when you already have the maximum of the highlighted one (fifth Speed Up, the missiles, the Double or laser you already fire, four Options, a Force Field that is still up) — collect another capsule to move the highlight on. The power meter is not drawn yet: count your capsules ([Power-ups](#power-ups)). On the TV and the desktop (free flight) there are no capsules at all yet |
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
| No bullets at all in the test stage | Check the address says `?stage=test-range`. The first turret starts shooting about ten seconds in; the pods, saucers and spinner formations never shoot. Free flight (the TV and desktop builds) has no enemies and no bullets |
| Bullets appear out of nowhere, from an enemy still off screen, or keep flying through rock | Please report it with the time into the stage and which enemy fired |
| A bullet pattern cannot be dodged with the arrow directions alone | Please report it with the time into the stage — every pattern is meant to be dodgeable on the TV remote |
| Bullets are magenta-and-black checkered squares | The bullet pictures are missing from the sprite sheet; please report it (the build is broken) |
| An enemy floats above the ground, sinks into it, or walks through a wall | Please report it with a screenshot and roughly how far into the stage it was |
| An enemy jumps, stutters or suddenly vanishes in the middle of the screen | Please report it with the time into the stage — enemies should only disappear after leaving the screen |
| No enemies at all in the test stage | Check the address says `?stage=test-range` (the title bar reads TEST RANGE). Free flight — the TV and desktop builds — has no enemies |
| The screen slows down or stutters when many bullets are around | Not expected — the game is built for hundreds of bullets. Please report it with the time into the stage and the browser or TV model |
| The test stage stopped scrolling | At the end of the stage (after about 75 seconds) that is expected; reload the page to start again. If it stops earlier, please report where |
| Gaps, seams or flickering in the rock, or rock over a HUD bar | Please report it with a screenshot and roughly how far into the stage it was |
| The ship flies in from the left again | Expected after it was destroyed. If it happens without a loss (no spare-ship icon went), please report what you were doing |
| Error screen with a pink title | See [When the app shows an error screen](#when-the-app-shows-an-error-screen) — photograph it and report it |
| Error screen `WEBGL IS NOT AVAILABLE` in a browser | Hardware acceleration is off or blocked: enable it in the browser settings (Chrome: Settings → System → "Use graphics acceleration when available") and reload. On the TV, report it together with the monitor's firmware version |
| Black or empty screen that stays black | Should not happen any more — the app shows an error screen instead. In a browser open the developer console: the message "Shmup Cup failed to start" gives the reason. On the TV, report it with the firmware version |
| Magenta-and-black checkered squares instead of some pictures | A picture the game asked for is missing from the sprite sheet. Report which element shows it (e.g. "the ship", "the second enemy") |
| Blurry picture in the browser | Browser zoom is not 100 % (press Ctrl+0), or the operating system scales the window unevenly. At 100 % zoom the pixels stay sharp on any display |
| Stars or ship stutter in the browser | Expected on 120/144 Hz monitors for now (smooth-motion interpolation is not in the preview yet); on a 60 Hz display it should be smooth. Also check the PC is not busy |
| Stars or ship stutter on the TV | Please report it — the M7 runs at 60 Hz and should show one step per refresh |
| Top or bottom HUD bar cut off on the TV | Check the monitor's picture size setting ("Fit to screen" / no overscan) and report which edge is missing |
| Opening `apps/tizen/dist/index.html` by double-clicking it shows an error or nothing | Desktop Chrome blocks the sprite sheet for files opened straight from disk. Use `pnpm --filter @shmup/tizen dev` instead (the TV itself is not affected) |
| The app does not appear on the TV | See the troubleshooting table in [install-on-tv.md](install-on-tv.md#troubleshooting) |
| Electron says it is not installed | It was skipped during installation; run `pnpm rebuild electron` |
| `pnpm dev` or `pnpm build` stops with "asset sources are invalid" | A graphics source file in the checkout is broken. Update to the latest version of the repository; if it persists, report the file names the message lists |

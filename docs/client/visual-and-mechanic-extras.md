# Visual & mechanic extras

Two new kinds of extras. **Picture settings** change how the game looks on your screen right away:
a **CRT / scanline filter** (OFF / LIGHT / FULL) and an **ASPECT** setting that gives the picture an
ultra-wide cabinet surround or a classic 4:3 window with lit side panels instead of black bars.
**Mechanic extras** change how the game plays and are off by default: **SLOWDOWN** (the game slows
down when the screen is full, the way the 16-bit machines did), **GRAZE** (points for flying close
to enemy bullets), **DEATH BOMB** (a few frames to save yourself with a bomb) and **BLACK HOLE** —
the MANTA's signature special, a vortex that swallows bullets and then discharges lightning.

Two more things arrived with them: the final zone now ends with an **escape sequence** — a fast
collapsing corridor out — before the ending, and (in a browser) a showcase stage,
**HIGH-SPEED DIMENSION**, that flies over a pseudo-3D neon floor past three new bosses.

This page is for players and testers. How the rest of the game plays:
[preview-build.md](preview-build.md); every button: [controls.md](controls.md); the extra modes and
replays: [extra-modes-and-replays.md](extra-modes-and-replays.md); installing on the monitors:
[install-on-tv.md](install-on-tv.md). Developers: [../dev/visual-and-mechanic-extras.md](../dev/visual-and-mechanic-extras.md).

## Picture settings (OPTIONS → DISPLAY)

Both take effect **immediately**, and both are saved.

| Row | Choices | What it does |
|---|---|---|
| **CRT** | OFF · LIGHT · FULL | LIGHT lays dark scanlines over the picture. FULL adds a red / green / blue aperture pattern and darkened corners, like a tube TV. OFF is the default |
| **ASPECT** | NORMAL · ULTRA-WIDE · CLASSIC 4:3 | NORMAL fills the screen as before. ULTRA-WIDE puts the picture in a very wide window — edge to edge on a 21:9 monitor, a wide cabinet window on a normal TV. CLASSIC 4:3 puts it in a square-ish window. In both, the space beside the picture becomes a dim blue **side panel** instead of a black bar |

Notes:

- The **picture itself never changes size or gets cropped**: the game always draws the same
  playfield, and ASPECT only decides the frame it sits in. You never see more or less of a stage.
- On a 4K TV the CRT filter is computed at 1080p and scaled up, so FULL costs the same there as on
  a 1080p set. If you ever see the game drop frames with FULL on, switch to LIGHT.
- Scanlines are drawn on the screen's pixels, not the game's, so they stay one line thick whatever
  the window size or the SCALE setting.

## Mechanic extras (OPTIONS → EXTRAS)

The Options screen has a new **EXTRAS** page. All four rows are ON / OFF toggles, all four are off
by default, and all four say **APPLIES FROM THE NEXT GAME** — they change how the game is simulated,
so the game in progress keeps the settings it started with (this is also why replays and high scores
stay comparable).

| Row | What it does |
|---|---|
| **SLOWDOWN** | When a lot is happening on screen at once, the game runs at half speed until it thins out, exactly like the 16-bit originals. Nothing random about it: the same run always slows in the same places |
| **GRAZE** | Points for a near miss — an enemy bullet that passes just clear of your ship scores once, with a small sparkle |
| **DEATH BOMB** | If you are hit while you still hold a bomb, you get a few frames to press the bomb button and survive the hit (with a moment of invincibility). Press too late and you lose the ship as usual |
| **BLACK HOLE** | The MANTA's yellow items **stock a bomb** instead of going off at once, and **Special** throws a black hole ([below](#the-black-hole-bomb)) |

The BLACK HOLE row shows **BLACK HOLE: THE DIRECT SHIP ONLY** while it is highlighted: it only does
something for the **MANTA**, the ship with coloured items. With the KESTREL (the power-meter ship)
the Special button keeps steering your Options, and the death bomb — if you turned it on — spends
your armed **!** (Mega Crash) instead.

## The black-hole bomb

With **BLACK HOLE** on and the **MANTA** chosen on SHIP SELECT:

1. Pick up **yellow items**. Each one stocks a bomb, up to **three**; every stage also starts you
   with one.
2. Press **Special** — *Channel up* on the remote, **V** on a keyboard, **Y** / Triangle on a
   gamepad — and a vortex opens just ahead of your ship.
3. For about a second and a half it **drags enemy bullets in** and swallows the ones that reach its
   middle (each one worth points, like a bullet cancel), and pulls **enemies** towards it.
4. Then it **discharges**: lightning bolts destroy every enemy still in reach and hurt boss parts.

Two vortices can be open at once, one per player, and each scores for whoever threw it. There is no
bomb counter on the HUD yet, so keep track of your stock yourself.

## The escape sequence

After you beat the last boss of a run (IRON SOVEREIGN in IRON CITADEL, or THE HOLLOW KING in
ABYSSAL THRONE), the run does not end straight away any more: the ship flies out through a
collapsing corridor that scrolls faster and faster. Reach the end and **ESCAPE COMPLETE** appears,
then the ending as before.

It is part of that final zone, not an extra zone: your route, the number of zones you cleared and
your high-score row are exactly as they were. You keep your weapons, Options and lives for the
escape, and dying in it costs a ship like anywhere else.

## The showcase stage (browser only)

Open the preview build with **`?stage=dimension`** (for example
`http://localhost:5173/?stage=dimension`) for **HIGH-SPEED DIMENSION**: a violet grid rushing under
the ship towards a lit horizon, with the three new bosses on it —

| Boss | What it does |
|---|---|
| **SHADOW STRIDER** | An armoured walker that **cannot be destroyed**: it paces across the screen firing sweeps and you simply have to survive it until it walks off |
| **IRON TALON** | A grabber: it lines up with your ship, opens its claw and lunges, **pulling you towards it** — fly away during the recovery |
| **GRASPING BLOOM** | A suction boss: while its maw is open it drags everything towards it (and only then can its core be hurt); when it closes, it shoots |

The stage is a showcase for testers, not part of the run across the zone map, so it has no zone
letter and no high-score table. Add `&skip=boss` to start at its first boss.

## TV checks

On the Smart Monitor M7, after installing a build (see [install-on-tv.md](install-on-tv.md)):

- **OPTIONS → DISPLAY → CRT**: LIGHT, then FULL. The picture should darken in fine lines without
  the game stuttering; leave it on FULL for a stage and watch the frame pacing.
- **OPTIONS → DISPLAY → ASPECT**: ULTRA-WIDE and CLASSIC 4:3 should both show the picture in a
  window with dim blue panels beside it, never a stretched or cut picture.
- **OPTIONS → EXTRAS**: turn all four on, start a new game with the MANTA and check that bombs
  stock, that Special throws a vortex, that near misses score and that a busy screen slows down
  smoothly rather than jerking.
- Both picture settings and all four extras should still be set the way you left them after
  restarting the app.

## Troubleshooting

| What you see | What it means |
|---|---|
| The EXTRAS rows do nothing in the game you are playing | Expected: they apply from the **next** game. Finish or quit to the title and start again |
| **Special** does nothing with BLACK HOLE on | You are flying the KESTREL, or you have no bomb stocked — pick up a yellow item with the MANTA |
| No vortex although you have bombs | A bomb is refused while the ship is flying in, dying or dead, and while two vortices are already open |
| The black hole does not appear at all | BLACK HOLE only works with the MANTA (`DIRECT` power-up mode). Check SHIP SELECT |
| The screen slows down in the same places every time | That is SLOWDOWN working as intended; turn it off in OPTIONS → EXTRAS |
| Scanlines look too heavy or too dark | Use LIGHT instead of FULL, or OFF; on very small windows the lines are thicker because they follow the screen's pixels |
| The picture is smaller with ULTRA-WIDE on a normal TV | Expected: on a 16:9 screen the ultra-wide window is shorter than the screen. NORMAL fills the screen |
| Side panels look like a bug | They are the intended surround (a dimmed backdrop). NORMAL turns them off |
| You lost a ship although DEATH BOMB is on | You had no bomb left, or the window (a few frames) closed before the press |
| The escape corridor never appears | It only comes after the **final** zone's boss — zones H and I |

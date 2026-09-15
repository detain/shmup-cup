# The v1.0 release candidate (1.0.0-rc.1)

This build is **Shmup Cup 1.0.0-rc.1**, the first **release candidate** of version 1.0: the
complete game — nine zones on the zone map, 16 different runs through it, two ships (the KESTREL
and the MANTA), two players at once, the endings and the credits, the attract loop, practice, the
sound test and the full Options screen. Nothing new was added to play in this build; instead the
whole game was **checked from end to end by the computer**, and the few unfair spots those checks
found were fixed (below).

"Release candidate" means: if the checks on the monitors (the checklist at the end of this page)
find nothing serious, this is what version 1.0 will be.

What each screen looks like and how to play: [preview-build.md](preview-build.md). Installing it on
the monitors: [install-on-tv.md](install-on-tv.md). The desktop app:
[desktop-app.md](desktop-app.md).

## Where you see the version

| Where | Shows |
|---|---|
| The monitor's app information (Apps → Shmup Cup → the app's details) | **1.0.0** — Samsung TVs accept plain numbers only, so the TV app carries the number without the `-rc.1` |
| The desktop app, its installers and the project's files | **1.0.0-rc.1** |
| The debug build's panel (fourth line) | The **build id** — the exact code the build was made from. Quote it in every report |

A later release candidate keeps the TV's **1.0.0**, so tell builds apart by the build id.

## What changed for players

The computer now plays **all 16 runs with both ships** from zone A to an ending, using only four
directions like a Samsung-remote player, and checks every moment of every zone for fairness. The
MANTA could not finish some of them — each one a spot where a real player would have been stuck:

| Where | Before | Now |
|---|---|---|
| **MANTA, LASER > WAVE** (the crescent waves, levels 5–8) | A wave that hit **armour** vanished — so a fully powered MANTA with waves could not reach the core of **MANTLE REGENT**, **IRON SOVEREIGN** or **THE HOLLOW KING**, which all have armoured parts in front of it | Waves **pass through armour**: you hear a clink, and the wave flies on to what is behind |
| **MANTA, BEAM > DISC level 4** (two small discs) | The two discs flew out in a slight V with a gap straight ahead — a small target right in front of you (**CINDER BASTION**'s core) could slip between them | The two discs fly **side by side, straight ahead** |
| **GALVANIC MAW** (zone B's boss) | Its jaws opened just as wide as the MANTA's **huge disc**, so the disc always touched a jaw and vanished | The jaws **open wider**: every shot fits into the open mouth |
| **SANDGRAVE WIDOW** (zone C's boss) | With a strongly powered ship the game gets harder and the spider spins faster — sometimes a second silk line came before the first had faded, only a narrow gap apart | The next **silk line always waits** until the last one is gone |

Also checked, with nothing to fix: every zone takes **3 to 6 minutes**; no bullet ever flies faster
than the rules allow; no wall of bullets or lasers ever closes the column your ship flies in —
there is always a gap to step into with one arrow; every zone hands out enough capsules and items,
also after a checkpoint. The KESTREL plays exactly as before.

## New icon

The app now has a real (placeholder) icon — the SHMUP CUP logo above the two ships, drawn from the
game's own pixel art — in the monitor's Apps panel and on the desktop app's installers and
window. It will be replaced by final art before the store release, like the screenshots below.

## Installing it on the monitors

Exactly as before ([install-on-tv.md](install-on-tv.md#installing-the-game-preview)): `pnpm build`,
then `tizen:package`, `tizen:install` and `tizen:run` for each monitor's `TV_IP`. Installing it
**over** an earlier build keeps your settings and high scores; removing the app first deletes them
(that is required of every TV app). For the checklist below, install the **debug build**
(`build:dev`) as well when a step asks for the developer tools — it is the same app and keeps the
same saved data.

## What the computer already checked

So you do not have to repeat them by hand, these run automatically on every change:

- the game reaches the title screen in **under 3 seconds** in a browser (the TV's limit is 10);
- on a stand-in for the TV: **Back** on the title asks **EXIT SHMUP CUP?** — YES closes, NO and
  Back stay; Back in a game pauses and Back again resumes, never exits;
- leaving the app (Home) freezes the game and the sound, coming back shows the pause menu with
  **no jump ahead**, five times in a row without an error;
- saved data is kept only in the app's own storage, so removing the app removes it;
- 30 minutes of play through runs, endings, credits and name entry **without the memory
  growing**; every zone runs well within its time budget even with the screen full of bullets;
- every recorded test run and every attract demo plays **exactly the same** in Chrome and in
  Firefox — the game behaves the same on every device.

What only the monitors can show is the list below.

## The v1.0 checklist (both monitors)

Run it on **both** monitors, write down the monitor and the build id for every result, and report
each item as passed or failed (a photo of the panel for anything measured, the zone and time for
anything that went wrong). The M1 checks in [debug-tools.md](debug-tools.md#the-m1-release-check)
still apply; this is what v1.0 adds (plan §8.5 and §8.6).

**Playing**

1. **Two players.** A game with the remote and a gamepad, and one with two gamepads; the second
   player joins a running game with START ([preview-build.md](preview-build.md#two-players)).
2. **Three runs.** Play at least three different routes across the zone map, reaching both final
   zones (IRON CITADEL and ABYSSAL THRONE); the ending scene and the credits appear after each.
3. **The MANTA's fixes.** With the MANTA and the waves, the clink-and-fly-on through armour against
   MANTLE REGENT, IRON SOVEREIGN or THE HOLLOW KING; with four SHOT pips on BEAM > DISC, both small
   discs straight ahead. (PRACTICE starts any zone — [preview-build.md](preview-build.md#practice).)
4. **Attract mode.** Leave the title alone for **10 minutes**: demos, high scores and the story
   keep cycling; any remote button returns to the title.
5. **Controls.** Rebind a remote button and a gamepad button, switch the control profile, try
   ONE BUTTON ([controls.md](controls.md#rebinding-keys-and-buttons)).

**Measuring** (debug build)

6. **Latency A/B.** The normal and the game-mode build, filmed at 240 frames per second — keep the
   faster one ([install-on-tv.md](install-on-tv.md#the-game-mode-build-latency-ab-test)).
7. **30 minutes.** Play for half an hour with the panel open and the remote inspector's memory
   view: memory stays **under 100 MB** and does not keep climbing, the music stays in time with
   the game, a new zone starts within **2 seconds**. Note the JS heap size — the game's own estimate
   assumes about 24 MB ([debug-tools.md](debug-tools.md#extra-checks-for-the-platform-polish-build-plan-85)).
8. **Device line and save export** — [debug-tools.md](debug-tools.md#extra-checks-for-the-platform-polish-build-plan-85).
9. **Live reload** (developers) — [install-on-tv.md](install-on-tv.md#live-reload-while-developing-tizenwatch).

**Store readiness**

10. **Update and removal.** Install this build over the previous one: settings and high scores are
    still there. Then remove the app and install it again: they are **gone** (the store requires
    it).
11. **The TV's own rules.** Start-up to the title in at most **10 seconds**; no crash or freeze in
    any of the above; Back and EXIT behave as described; Home and back resumes paused; reopening
    from the Smart Hub's recent apps works.
12. **Names and look.** Look over the title, the logo and the key art: nothing may resemble an
    existing game's name, text or logo.
13. **Store account.** The TV Seller Office account and an alpha test with at most 50 monitors
    (their DUIDs) — the project owner's step.

## The store listing placeholders

`pnpm store:assets` draws the icon and **placeholder screenshots** for the store listing into
`assets/generated/store/` on the PC (not part of the repository): the icon (512 × 423), four
1920 × 1080 pictures captioned **PLACEHOLDER** and `listing.json` with the name, the descriptions,
the keywords and the category. They only stand in: take real screenshots on the monitors for the
listing, and check the picture sizes against the Seller Office's current requirements before a
submission — they could not be confirmed when the placeholders were made.

## Troubleshooting

| Problem | What to do |
|---|---|
| The monitor shows version **1.0.0**, not 1.0.0-rc.1 | Expected — the TV takes numbers only. Use the build id (debug build panel) to tell builds apart |
| The Apps panel still shows the old icon after installing | The panel may keep the old picture for a while; restart the monitor. If it persists, report it with a photo |
| A MANTA wave makes a clink sound and keeps flying | Expected since this build — waves pass through armour now |
| The MANTA still cannot hurt a boss | Please report it with the zone, the SHOT style and level (the pips) and a short video — the computer's runs beat every boss with both ships |
| Settings or high scores are gone after installing this build | Only expected if the app was removed first. Otherwise report it with the monitor and both build ids |
| The desktop installer warns about an unknown publisher | Expected — the installers are not signed yet ([desktop-app.md](desktop-app.md#troubleshooting)) |
| Anything else | The troubleshooting tables of [preview-build.md](preview-build.md#troubleshooting), [install-on-tv.md](install-on-tv.md#troubleshooting) and [debug-tools.md](debug-tools.md#troubleshooting) |

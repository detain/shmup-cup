# Extra modes, replays and assists

Once you know the game, the title's new **EXTRA** menu has more ways to play it: a **BOSS RUSH**
(every zone's boss in a row), the **CARAVAN** (one zone against a three-minute clock) and
**ARCADE** (the whole run again and again, each loop harder). **REPLAYS** lets you watch your last
game — fast-forwarded if you like — keep your best runs and, in a browser, share them. Reaching an
ending unlocks the **Extra Edit** weapons and the ARCADE mode's **LOOP 2**, four **secret codes**
hide on the title and in the pause menu, and the Options screen gained two **assists** (a slower
game, invincibility), **option recovery** and gamepad **rumble**.

This page is for players and testers. How the rest of the game plays: [preview-build.md](preview-build.md);
every button: [controls.md](controls.md); installing the game on the monitors:
[install-on-tv.md](install-on-tv.md). Developers: [../dev/extra-modes-and-replays.md](../dev/extra-modes-and-replays.md).

## The EXTRA menu

On the title press **OK**, then ▼ to **EXTRA** (between SOUND TEST and EXIT) and **OK**:

```text
              EXTRA
   → BOSS RUSH
     CARAVAN    A AZURE VERGE
     ARCADE     LOOP 1
     REPLAYS
     BACK
       EVERY ZONE BOSS IN A ROW
```

| Entry | What it does | ◀ ▶ |
|---|---|---|
| **BOSS RUSH** | Fights every zone's boss, AZURE VERGE's to ABYSSAL THRONE's, one after another | — |
| **CARAVAN** | A score attack: one zone from its start, with three minutes on the clock | choose the zone |
| **ARCADE** | The run across the zone map — and after its ending the next **loop**, harder, from zone A again, until the game is over | **LOOP 1**, or **LOOP 2** once unlocked |
| **REPLAYS** | Watch, keep, share and delete recorded games ([Replays](#replays)) | — |
| **BACK** | Returns to the title menu (Back does the same) | — |

- The line under the menu explains the highlighted entry.
- **OK** on BOSS RUSH, CARAVAN or ARCADE starts that mode — ◀ ▶ only change its zone or loop. You
  then choose the difficulty, the ship and (for the KESTREL) the weapons as usual. The extra modes
  are for **one player**.
- Each mode keeps its **own high-score tables** (per difficulty and ship), apart from normal games.
- An entry is greyed out when this build lacks what it needs (for example REPLAYS in a build without
  saved data).

### BOSS RUSH

The nine zone bosses — HALCYON BULWARK, GALVANIC MAW, SANDGRAVE WIDOW, CINDER BASTION, SQUALL STEED,
MANTLE REGENT, FACET MONARCH, IRON SOVEREIGN and THE HOLLOW KING — come one after another, each
after its WARNING, with a short pause between them. There are no zones in between, so choose the
weapons you like best before you start. Beating the last boss shows **STAGE CLEAR** (then the
title); losing your last ship shows GAME OVER as usual. Either way the score goes into the BOSS
RUSH table. A full rush takes about six minutes.

### CARAVAN (score attack)

Choose a zone with ◀ ▶, then play it from its start with **three minutes** on the clock. The clock
stands in the top bar where player 2's score normally is (`TIME 180`), turning red for the last ten
seconds.

- When the time runs out, the zone ends at once: the enemy bullets vanish, **TIME UP** appears and
  your ship flies out.
- If you beat the zone's boss before that, every **whole second left** is worth **1,000 points**.
- Either way the score goes into the CARAVAN table and the game returns to the title — a caravan
  is one zone, with no zone map and no secret bonus stages.
- The clock keeps running during the short freezes when something explodes; it stops while the game
  is paused.

### ARCADE (loops)

The ARCADE mode is the normal run across the zone map — but it does not stop at the ending. After
the ending scene the card says **OK: LOOP 2**, and OK starts the next loop at AZURE VERGE (the zone
card reads `LOOP 2  ZONE A`), with your score, ships and power-ups carried on. No credits play in
between. Each loop is harder than the last:

- **Different enemy waves** — every zone has extra waves that only come from loop 2 on.
- **Faster bullets** — 15 % faster on loop 2, 30 % on loop 3, and so on (at most 60 %).
- **Revenge bullets** — every enemy you shoot down fires one last bullet at you as it goes.
- The game's difficulty climbs higher than it can on loop 1.

The run goes on until the game is over (the ARCADE mode has no end), and the score goes into the
ARCADE table. **LOOP 2** as a starting point (◀ ▶ on ARCADE) is locked until you have reached an
ending once; until then ◀ ▶ stay on LOOP 1.

## Unlocks

Reaching **any ending** — a normal game or an ARCADE game — unlocks, for good:

| Unlock | Where you find it |
|---|---|
| **Extra Edit** | The WEAPON SELECT screen's TYPE line gains **EXTRA** ([below](#the-extra-edit-weapons)) |
| **LOOP 2** | The EXTRA menu's ARCADE line: start straight on loop 2 |

The ending's card says `EXTRA EDIT AND LOOP 2 UNLOCKED` the first time. Unlocks are kept with your
settings and high scores (they survive a relaunch and an update; removing the app deletes them).

## The Extra Edit weapons

With Extra Edit unlocked, the WEAPON SELECT screen's **TYPE** line has **EXTRA** after EDIT. EXTRA
works like EDIT — ▼ to MISSILE, DOUBLE and LASER and choose each weapon with ◀ ▶ — but each line
also offers seven new weapons:

| Weapon | Meter slot | What it does |
|---|---|---|
| **CONTROL MISSILE** | MISSILE | Flies straight ahead and follows your ship up and down — steer it with your own height |
| **UPPER MISSILE** | MISSILE | The missile upside down: climbs, then slides along the ceiling |
| **SMALL SPREAD** | MISSILE | A small bomb lobbed backwards and down; it bursts on what it hits |
| **HAWK WIND** | MISSILE | Climbs like the Upper Missile when your ship is in the upper half of the screen, dives like the Missile in the lower half |
| **2-WAY BACK** | MISSILE | Two missiles backwards — one up, one down |
| **BACK DOUBLE** | DOUBLE | Your gun ahead plus a second shot up and backwards |
| **SPREAD GUN** | DOUBLE | Two diagonal shots (up and down) — and when you take DOUBLE **a second time**, a third one straight ahead |

- The SPREAD GUN is the only weapon taken twice on the power meter: after the first DOUBLE the
  meter's DOUBLE box stays available until you take it again. Taking LASER (or losing the power)
  starts it over.
- The live preview behind the menu flies whatever you choose.
- EDIT still lists only the weapons of the four types; switching TYPE back from EXTRA to EDIT puts
  the first weapon back in a line that held an Extra Edit one.

## Secret codes

Four codes, each **eight single presses of the arrows** — no other button in between (OK, Back or
two arrows at once start over). They work with the remote, a keyboard's arrow keys and a gamepad's
D-pad.

| Code | Where | Presses | What happens |
|---|---|---|---|
| **More ships** | Title (on `PRESS OK` or in the menu) | ▲ ▶ ▼ ◀ ▲ ▶ ▼ ◀ (two turns clockwise) | A jingle and `7 SHIPS!`: the next games start with **seven ships** (until you close the game). Those games count as **assisted** |
| **Extra Edit** | Title | ▼ ◀ ▲ ▶ ▼ ◀ ▲ ▶ (two turns the other way) | A jingle and `EXTRA EDIT UNLOCKED`: Extra Edit is unlocked for good |
| **Full power** | Pause menu | ◀ ▶ ▶ ◀ ◀ ▶ ▶ ◀ | The game resumes with your ship **fully powered** (the MANTA: both weapons at the top and the gold Arm). Once per zone. The game counts as **assisted** |
| **Self destruct** | Pause menu | ▶ ◀ ◀ ▶ ▶ ◀ ◀ ▶ | The game resumes — and your ship explodes. A joke; it costs a ship |

In the title menu the ▲ ▼ presses also move the highlight while you type — that is fine; only the
order of the eight presses counts. In the pause menu ◀ ▶ do nothing else, so the menu stays where
it is.

## Replays

Every game you finish is recorded — each zone, bonus stage and retry, your continues and even the
secret codes. **EXTRA → REPLAYS** lists what is kept:

```text
                REPLAYS
   → LAST GAME   KESTREL NORMAL  ZONE D       412,380
     SAVED 1     MANTA HARD  ZONE I         1,208,550 *
     SAVED 2     NO REPLAY
     SAVED 3     NO REPLAY
     BACK
       OK: PLAY, KEEP, SHARE OR DELETE
```

- **LAST GAME** is always the game you finished last — a new game replaces it.
- **SAVED 1–3** are the ones you kept. Each line shows the ship and difficulty, the zone the run
  reached, its score and a red `*` for an **assisted** game.
- OK on a line with a replay opens its actions:

| Action | What it does |
|---|---|
| **PLAY** | Watches the replay ([below](#watching-a-replay)) |
| **KEEP** | (LAST GAME only) Copies it into the first free SAVED slot — `KEPT IN SAVED 1`. If every slot is taken, or the kept replays together are too long: `NO FREE SLOT: DELETE ONE FIRST` |
| **SHARE** | (Browser and desktop app only) Copies the replay to the clipboard as text — `REPLAY COPIED` ([Sharing](#sharing-a-replay)) |
| **DELETE** | Empties the slot — `REPLAY DELETED` |
| **BACK** | Back to the list (Back does the same; Back on the list returns to EXTRA) |

The replays are kept with your settings (they survive a relaunch and an update; removing the app
deletes them).

**What is kept and what is not:** a game counts as finished when the title comes back — after GAME
OVER, the credits, a caravan or a boss rush, and also after QUIT TO TITLE; practice games are
recorded too. Not kept: a very long game (a single zone over 20 minutes, or more than 48 zones and
retries), a game in which the debug build's developer tools jumped to a checkpoint or the boss, and
a replay whose text would pass 120,000 characters — far more than a full run needs.

### Watching a replay

| Button | What it does |
|---|---|
| **▶** / **◀** | Faster / slower: **×1**, **×2**, **×4** (the top line shows `REPLAY  X2`) |
| **OK** | Pause / go on (`REPLAY  PAUSED`) |
| **Back** | Stop and return to the list |

- The replay plays every zone of the game in turn with its own HUD, music and — at ×1 — sound
  effects (fast-forward is silent apart from the music). `ASSISTED` shows for an assisted game. A
  gamepad never rumbles during a replay.
- At the end `REPLAY END` shows for a few seconds (OK skips it), then the list comes back.
- `REPLAY OUT OF SYNC` means the replay does not match this build of the game: replays recorded by
  an **older or newer build** usually stop there. That is expected between builds; within one build
  it is a bug — please report it.

### Sharing a replay

In a browser (and in the desktop app, which runs the same build) **SHARE** copies the replay as
text to the clipboard. Paste it into a message or a file. To load a shared replay, **paste it
anywhere on the game's page** (Ctrl+V / ⌘V with the game page in front): it lands in the first
free SAVED slot, ready to PLAY. Anything else you paste is ignored.

- The browser must allow clipboard access: it works at `localhost` and on `https://` pages; on a
  plain `http://` address from another computer SHARE says `COULD NOT SHARE`.
- A shared replay only plays in sync on the **same build** of the game.
- The TV has no clipboard, so SHARE is not offered there.

## Assists, option recovery and rumble

The Options screen's **GAME** page gained three lines, the **CONTROLS** page one:

```text
               GAME
   → DIFFICULTY   NORMAL
     LIVES        PRESET
     PENALTY      PRESET
     AUTO POWER   OFF
     MAGNET       ON
     ONE BUTTON   OFF
     OPT RECOVERY OFF
     SPEED        100%
     INVINCIBLE   OFF
     BACK
   ASSISTS MARK SCORES AND REPLAYS
```

| Line | Page | What it does |
|---|---|---|
| **OPT RECOVERY** | GAME | **ON**: when you lose a ship, the Options it costs drift away from the wreck as grey items — fly into them to get them back (the KESTREL; the MANTA has no Options) |
| **SPEED** | GAME | **100%**, **75%** or **50%**: the whole game runs slower — more time to react. An **assist** |
| **INVINCIBLE** | GAME | **ON**: nothing can destroy your ship (bullets, enemies, walls). An **assist** |
| **RUMBLE** | CONTROLS | **ON** (the start setting): a gamepad rumbles when your ship is destroyed and at a boss's final explosion — if the pad can rumble (the TV remote cannot) |

- Like the other GAME lines, OPT RECOVERY and INVINCIBLE apply **from the next game** (or RETRY
  STAGE). SPEED works at once — only while you play; the menus keep their normal speed.
- **Assisted games are marked.** A game played with SPEED below 100 %, INVINCIBLE, the *more ships*
  or *full power* code counts as **assisted**: its high-score rows show a `*` after the score and
  its replay is marked `*` / `ASSISTED`. The scores still count — the mark only tells everyone how
  they were made.
- The GAME page's note line reads `ASSISTS MARK SCORES AND REPLAYS` while SPEED or INVINCIBLE is
  highlighted.

## Fewer points for farming

Some enemies keep coming as long as you let them — a boss's minions, the drones a spawner keeps
releasing, bubbles that split. From this build, the first **40** of each such kind you shoot down in
a zone score in full, and every one after that scores only **10 %** of its points. Enemies of the
zone's own waves always score in full. (It changes almost nothing for normal play — it stops a
player from waiting at a spawner for points.)

## On the TV

Everything on this page works with the remote: EXTRA, the modes, the codes (the arrow buttons),
REPLAYS with PLAY / KEEP / DELETE (no SHARE), and the new Options lines. Worth checking on the
monitors:

- [ ] EXTRA → CARAVAN on a zone: the clock counts down in the top bar and **TIME UP** ends the zone.
- [ ] Finish a game, then EXTRA → REPLAYS → LAST GAME → PLAY: the replay plays at ×1, ▶ makes it
      ×2 / ×4, it ends with `REPLAY END` (not OUT OF SYNC).
- [ ] KEEP it, close the app, open it again: SAVED 1 is still there and still plays.
- [ ] The *more ships* code on the title (▲ ▶ ▼ ◀ ▲ ▶ ▼ ◀) with the remote: `7 SHIPS!`.
- [ ] SPEED 50 %: the game slows down smoothly (no stutter), the menus do not.
- [ ] With a USB / Bluetooth gamepad: it rumbles when your ship is destroyed (RUMBLE ON), and not
      after RUMBLE OFF.

## Troubleshooting

| Problem | What to do |
|---|---|
| ▼ from the title's first entry no longer reaches EXIT where it was | Expected: EXTRA sits between SOUND TEST and EXIT |
| ◀ ▶ on ARCADE stay on LOOP 1 | LOOP 2 is locked until you have reached an ending once |
| The WEAPON SELECT screen has no EXTRA | Extra Edit is locked: reach an ending, or type the Extra Edit code on the title |
| A code does nothing | Eight single presses of the arrows in a row, nothing else in between (no OK, no Back, no two arrows at once). *Full power* works once per zone and only while your ship is flying (not while it explodes or flies in) |
| My high score has a `*` | The game was assisted — SPEED below 100 %, INVINCIBLE, or a code. Set SPEED back to 100 % and INVINCIBLE to OFF on the GAME page; the *more ships* code lasts until you close the game |
| The game runs slowly | SPEED is set to 75 % or 50 % on the GAME page |
| REPLAYS is empty after a game | The game was not finished (still running), was too long to keep, or the developer tools jumped mid-game. In a private browser window nothing is kept after it closes |
| `NO FREE SLOT: DELETE ONE FIRST` with a free slot | The kept replays together are too long — delete a long one |
| `REPLAY OUT OF SYNC` | The replay was recorded by another build of the game (or the game's data changed) — expected between builds. Within the same build please report it, with the replay's text if you can (SHARE) |
| `COULD NOT SHARE` | The browser refused clipboard access (open the game at `localhost` or over `https://`, and keep the page in front) |
| A pasted replay did not appear | It was not a Shmup Cup replay, it was cut short, or every SAVED slot is taken — delete one and paste again |
| The gamepad does not rumble | RUMBLE is OFF on the CONTROLS page, or the pad (or the browser) cannot rumble. The TV remote never rumbles |

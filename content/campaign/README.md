# content/campaign/ — the zone map

The branching run from zone A to a final zone (`shmup_feat.md` §14 "branching zone map",
decision D9), loaded by the core's `data` module (kind `campaign`, plan §3.5 / M2-10) and played by
the scene flow (`packages/core/src/scenes`: the zone map screen, the run state carried between
zones, the zone tally, the ending selection).

[`main.campaign.json`](main.campaign.json) is the shipped map: the 9-zone diamond
`A → B|C → D|E → F|G → H|I` — five zones per run, **16 routes**, two final zones (H IRON CITADEL,
I ABYSSAL THRONE) with their own endings. Every zone is a real zone (B–G since M2-11 … M2-13, the
finales H and I since M2-14). Each final zone has a no-death ending and a plain one — zone I also
*THE FLAGSHIP SLIPS AWAY* when the ABYSS ARK escaped, even in a no-death run (zone I's no-death
ending has the Hollow King sink with the ARK, so it excludes `bossEscaped`) — each with its sprite
scene (`citadel` / `abyss`) and its epilogue, and the file's `credits` scroll after every ending
(M2-14).

## Format (formatVersion 1)

```jsonc
{
  "formatVersion": 1,
  "kind": "campaign",
  "id": "sample",
  "name": "ZONE MAP",                    // optional: the map screen's title (default ZONE MAP)
  "start": "a",                          // the first zone of every run
  "zones": [
    {
      "id": "a",                         // lower-case kebab, unique in the file
      "label": "A",                      // 1–2 upper-case letters / digits on the map node
      "name": "AZURE VERGE",             // display name (≤ 24 characters)
      "stage": "zone-a",                 // a stage id (a normal or bossRush stage — not a bonus stage)
      "preview": ["UP TO THREE LINES", "OF ≤ 40 CHARACTERS."] // optional: the map's preview text
    },
    { "id": "b", "label": "B", "name": "BRINE NEBULA", "stage": "zone-b" },
    { "id": "c", "label": "C", "name": "DUNE EXPANSE", "stage": "zone-c",
      "escape": "escape" }               // optional (M3-02): only on a final zone (no exits) —
                                         // the stage flown after its boss, before the ending
  ],
  "edges": [                             // clearing `from` may lead to `to` (≤ 4 exits per zone)
    { "from": "a", "to": "b" },
    { "from": "a", "to": "c" }
  ],
  "endings": [                           // the first ending of the final zone whose flags match
    {
      "id": "b-flawless",
      "name": "A FLAWLESS FLIGHT",           // ≤ 32 characters
      "zone": "b",
      "all": ["noDeath"],
      "scene": "citadel",                    // optional (M2-14): none (default) | citadel | abyss
      "text": ["UP TO EIGHT LINES", "OF ≤ 40 CHARACTERS."] // optional (M2-14): the epilogue
    },
    { "id": "b", "name": "THE UPPER ROAD", "zone": "b", "scene": "citadel" },
    { "id": "c", "name": "THE LOWER ROAD", "zone": "c", "none": ["bossEscaped"] },
    { "id": "c-escape", "name": "IT GOT AWAY", "zone": "c", "scene": "abyss" }
  ],
  "credits": [                           // optional (M2-14): scrolls after every ending
    { "title": "SAMPLE CREDITS", "lines": ["UP TO SIXTEEN LINES", "OF ≤ 60 CHARACTERS"] },
    { "title": "THANK YOU FOR PLAYING" }  // `lines` is optional
  ],
  "story": [                             // optional (M2-15): the attract loop's story crawl
    { "scene": "dawn", "lines": ["UP TO SIX LINES A PAGE", "OF ≤ 40 CHARACTERS."] },
    { "lines": ["A PAGE WITHOUT A SCENE:", "THE STARS ALONE."] } // scene: none (default)
  ]
}
```

**One campaign per content set** (a second file is reported and ignored). The loader checks that
zone ids are unique, `start` exists, every edge joins two zones (no self-loop, no duplicate, ≤ 4
exits per zone), every zone can be reached from the start and **every edge leads exactly one level
deeper** — so there are no cycles and every route from the start ends in a **final zone** (a zone
without exits). Endings must name a final zone, every final zone needs one ending without
conditions (so a run always gets one), ending ids are unique. Once the references are resolved,
every zone's `stage` must be a stage that is not of type `bonus`.

**Run flags** an ending may require (`all`) or exclude (`none`): `bossEscaped` (a stage boss
escaped when its time limit ran out), `noDeath` (no ship lost in the whole run), `noContinue` (no
continue used), `bonus` (a hidden bonus stage cleared).

**Endings and credits (M2-14).** An ending's `scene` is the sprite scene its screen plays above
the epilogue: `citadel` (the fortress breaking apart in chained blasts as the ship flies away) or
`abyss` (the ship rising out of the deep towards the light while the flagship's wreck sinks); the
scene shows a **dawn** after a flawless (`noDeath`) run and, in `abyss`, the flagship **sailing
off** when a boss escaped. Its `text` (0–8 lines of ≤ 40 characters) appears line by line; then the
result card (the ending's name, the route, the score, the flags); then the `credits` — up to 24
sections of a `title` and ≤ 16 `lines` of ≤ 60 characters, scrolling up to the credits theme. An
ending without scene and text shows the card at once; a campaign without credits goes back to the
title after the card. The ending and credits themes are the final zone's stage `music.ending` /
`music.credits` cues (see [`content/stages/README.md`](../stages/README.md)), prepared with the
zone's music set.

**The attract story (M2-15).** `story` (up to 8 pages) is the original text the attract loop
crawls up through a panel at the bottom of the screen between the hi-score tables and the title
(`packages/core/src/scenes` `StoryScene`). Each page names the sprite scene played above its lines
while they crawl — `dawn` (a star rising out of a quiet sea), `invasion` (the enemy's fortress and
flagship closing in through chained blasts), `launch` (the player's ships racing off, then the
logo) or `none` — drawn from sprites the game already has; its `lines` are 0–6 of ≤ 40 characters.
A campaign without a story leaves it out of the attract loop. The shipped story has three pages.

## How the map is played

- A game whose stage is the campaign's start zone (the shipped game: zone A) is a **campaign run**;
  any other stage (`?stage=` dev stages) plays alone with the M1 stage-clear screen.
- Each zone is a fresh World; score, lives, loadout, meter cursor and shield carry over. The rank's
  stage term is the number of zones cleared before (+ 1).
- After a zone's boss: the **zone result tally** (kill rate × 100 points, the boss time bonus —
  100 points per second under 90 s), then the **zone map**: Up / Down choose one of the zone's
  exits, OK launches (the next zone's music is prepared meanwhile), Back asks "quit to title?".
  Back on the title (after the ending, a game over or a practice), the start zone's music is
  prepared again, so a zone's own `stages`-scoped track never leaks into the next run.
- **The escape sequence (M3-02).** When the final zone has an `escape` stage, its boss's clear
  screen (`ESCAPE COMPLETE` the next time round) leads into that stage instead of the ending: the
  same run, the same ships, score and loadout, with no clock and no boss. Flying it to its `end`
  event brings the clear screen back, and only then the ending. It is not a zone of its own — the
  hi-score row still names the zone the run reached, and a death there ends the run as any other
  would. Zones H and I ship one (`escape`); zones with none go straight to the ending.
- The final zone's clear picks the ending (the first match for the run's flags) and records the
  run in the hi-score table; the ending screen, then the credits follow.

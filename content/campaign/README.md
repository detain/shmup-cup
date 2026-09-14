# content/campaign/ — the zone map

The branching run from zone A to a final zone (`shmup_feat.md` §14 "branching zone map",
decision D9), loaded by the core's `data` module (kind `campaign`, plan §3.5 / M2-10) and played by
the scene flow (`packages/core/src/scenes`: the zone map screen, the run state carried between
zones, the zone tally, the ending selection).

[`main.campaign.json`](main.campaign.json) is the shipped map: the 9-zone diamond
`A → B|C → D|E → F|G → H|I` — five zones per run, **16 routes**, two final zones (H IRON CITADEL,
I ABYSSAL THRONE) with their own endings. Zones B–I are short placeholder stages
(`content/stages/zone-b … zone-i.stage.json`, M2-10) until M2-11 … M2-14 replace them.

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
    { "id": "c", "label": "C", "name": "DUNE EXPANSE", "stage": "zone-c" }
  ],
  "edges": [                             // clearing `from` may lead to `to` (≤ 4 exits per zone)
    { "from": "a", "to": "b" },
    { "from": "a", "to": "c" }
  ],
  "endings": [                           // the first ending of the final zone whose flags match
    { "id": "b-flawless", "name": "A FLAWLESS FLIGHT", "zone": "b", "all": ["noDeath"] },
    { "id": "b", "name": "THE UPPER ROAD", "zone": "b" },
    { "id": "c", "name": "THE LOWER ROAD", "zone": "c", "none": ["bossEscaped"] },
    { "id": "c-escape", "name": "IT GOT AWAY", "zone": "c" }
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

## How the map is played

- A game whose stage is the campaign's start zone (the shipped game: zone A) is a **campaign run**;
  any other stage (`?stage=` dev stages) plays alone with the M1 stage-clear screen.
- Each zone is a fresh World; score, lives, loadout, meter cursor and shield carry over. The rank's
  stage term is the number of zones cleared before (+ 1).
- After a zone's boss: the **zone result tally** (kill rate × 100 points, the boss time bonus —
  100 points per second under 90 s), then the **zone map**: Up / Down choose one of the zone's
  exits, OK launches (the next zone's music is prepared meanwhile), Back asks "quit to title?".
- The final zone's clear picks the ending (the first match for the run's flags) and records the
  run in the hi-score table.

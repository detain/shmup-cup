# content/enemies/ — enemy and boss definitions

Enemy and boss definitions, loaded by the core's `data` module (kind `enemies`) and run by
`packages/core/src/enemies` (bosses: `packages/core/src/bosses`) with the behaviour coroutines
of `packages/core/src/behaviors`. Implements `shmup_feat.md` §11 ("HP, score value, hurtbox,
flash-on-hit, death explosion, drops — defined in `enemies.json`", movement primitives,
off-screen and settle rules) and §15 (score values).

`zone-a.enemies.json` is zone A's roster (M1-18): eight enemy types — `skeet` popcorn (and the
`skeet-chain` sine chains), `vane` fans, `tender` capsule carriers, `lancer` rammers, `picket`
floor / ceiling turrets, `strider` walkers, the `burrow` hatch (with its `burrow-mite`) and
`gyre` orbiters (the `vane` fans fire an aimed revenge bullet from rank 12 — a fully powered ship
on Normal) — and the boss HALCYON BULWARK (`halcyon-bulwark`, code HB-01): an armoured hull
and wings, four shield plates (12 hp) stacked in front of a 40-hp core that takes damage only once
every plate is gone, and two laser emitters above and below it (`boss.bulwark`: slow tracking,
alternating attached lane lasers, aimed 3-ways once two plates are down). Zone A is held to the
4-way design rules (no aimed bullet over 2 px/tick, no two laser lanes closer than 16 px) by
`pnpm content:check`. `test-range.enemies.json` / `test-boss.enemies.json` serve the dev stages;
`test-sentry.enemies.json` holds the `sentry`, which runs the `common.spiral` DSL pattern
(`pattern.loop`, M2-02). `weapon-range.enemies.json` (M2-03) holds the harmless targets of the
weapon select's live preview — `range-drone` (a slow sine flier) and the floor / ceiling
`range-post`s — none of which fires, drops or scores. `option-hunters.enemies.json` (M2-04) holds
the three Option Hunters — `option-hunter-rear` (lines up behind the player on its row and
charges right), `option-hunter-front` (from ahead, charging left) and `option-hunter-dive` (over
the player's column, diving down) — flown by the `hunter-range` dev stage, which also brings the
rare blue carrier (`carrier-blue` in `test-range.enemies.json`). `direct-carriers.enemies.json`
(M2-05) holds the Direct mode's item carriers flown by the `direct-range` dev stage: the `cube`
(`cube.pincer` — a formation of six makes a pincer wave, the last cube destroyed drops the wave's
item) and the coloured `lead-carrier` (`drop: "powerup"`). `gimmick-range.enemies.json` (M2-07)
holds the stage gimmicks the `gimmick-range` dev stage flies: the `falling-rock` (`rock.fall`, hangs
from the ceiling until a ship comes near, shatters on the floor), the `volcano` (`volcano.lob`)
and its `lava-stone`s, the splitting `bubble` and its `bubble-small`s (`bubble.split`), the
`suction-pod` (`field.suction`), the grabbing `tentacle` (`tentacle.grab`) and the `rush-cube`
(`cube.stack`: a formation of them is a seeded cube rush that stacks into `cube` tiles). A mover may
be `{ "type": "ballistic", "vx", "vy", "gravity"?, "maxFall"?, "trigger"?, "land"? }` (M2-07: thrown
or falling; `land` = `pass` / `stop` (default) / `shatter`).

## Format (formatVersion 1)

```jsonc
{
  "formatVersion": 1,
  "kind": "enemies",
  "enemies": [
    {
      "id": "drifter",                 // referenced by stage events (and by other enemies' "child")
      "hp": 1,
      "score": 100,                    // points for the player whose shot (or Mega Crash) kills it
      "hurtbox": { "hw": 6, "hh": 5 }, // half-extents in pixels; also the contact box
      "script": "drifter.sine",        // behaviour coroutine id (core/behaviors)
      "sprite": "enemies/drifter",     // atlas sprite name (assets/source/sprites/)
      "anim": { "frames": 2, "ticks": 8 }, // optional: loop frames 0…1, 8 ticks each (default: frame 0)
      "params": { "amp": 20 },         // optional: behaviour tunables by name (defaults in core/behaviors)
      "mover": { "type": "sine", "vx": -1, "amp": 16, "period": 90 }, // optional starting mover
      "drop": null,                    // "capsule" | "blueCapsule" | "powerup" | "oneUp" | "bonusCapsule" | null
      "ground": null,                  // optional: "floor" | "ceiling" | null (flying, default)
      "settleTicks": 30,               // optional: ticks on screen before it may fire (default 30)
      "explosion": "small",            // optional: "small" (default) | "medium" | "large"
      "megaCrashImmune": false,        // optional: survives the Mega Crash (default false)
      "optionHunter": false,           // optional: an Option Hunter (M2-04; default false)
      "child": null,                   // optional: enemy id a spawner releases (hatch.spawner)
      "pattern": null,                 // optional: content/patterns/ action the pattern.loop behaviour runs
      "rank": { "fireRate": 0.5 },     // optional rank modifiers (§11, §15; default 1 each)
      "revenge": { "minRank": 12, "pattern": "aimed", "speed": 1.25 } // optional revenge bullets
    }
  ]
}
```

`script` (behaviour coroutine), `sprite` (atlas sprite name, e.g. `enemies/drifter` =
`assets/source/sprites/enemies/drifter.sprite.json`), `child` (enemy id) and a `path` mover's
`path` are resolved to numeric ids at load (`scriptId`, `spriteId`, `childId`, `pathId`). The
shell and `pnpm content:check` also check `script` against the behaviours the engine
registers, every `params` name against the behaviour's tunables, and that spawners name a
`child`. Optional fields get their defaults at load.

**Behaviours (M1 roster).** `drifter.sine` (popcorn on a sine wave), `fan.loop` (formation
flier: the leader flies the spawn event's path, the others follow its track), `carrier.straight`
(capsule carrier), `turret.floor` (ground turret facing the player, firing aimed shots —
`fireTicks`, `bulletSpeed`), `walker.floor` (walks, stops and fires an aimed 3-way — `spread`,
`bulletSpeed` — walks), `hatch.spawner` (releases its `child`), `rammer.aimed` (enters with its
mover, then dashes at the player), `orbiter.loop` (loops along the spawn event's path, firing
rings — `ringTicks`, `ringCount`, `bulletSpeed`), and since M2-02 `pattern.loop` (runs the
enemy's `pattern` — a [`content/patterns/`](../patterns/README.md) DSL action — over and over,
`restTicks` apart; it moves with its `mover`), and since M2-04 `hunter.option` (the Option
Hunter: `variant` 0 rear / 1 front / 2 dive, `lineUpTicks`, `speed`, `windup`, `chargeSpeed`,
`lineX`, `lineY`). Their tunables and defaults are listed in
`packages/core/src/behaviors`. Bullet speeds are px/tick on Normal (rank scales them) and fire
intervals are ticks on Normal.

**Movers** (`"mover"`, or set by the behaviour): `straight { vx, vy }`, `sine { vx, amp,
period, phase? }`, `path { path?, speed }`, `waypoint { x, y, speed, hold, leaveVx, leaveVy }`,
`follow {}`, `groundCrawl { speed }`, `homing { speed, turnRate }`, `aimedDash { speed, windup }`
(pixels per tick, ticks, binary angles — 1024 per turn). Flying enemies ride the camera
scroll, so their velocities are relative to the screen; ground enemies stand on (or hang from)
the terrain where they spawn.

**Rank (M2-01).** Bullet speeds and fire intervals are the Normal values; the session's rank
(`packages/core/src/rank`: 0–31, growing with the stage and the player's power) scales them.
`"rank": { "bulletSpeed": k, "fireRate": k }` sets how strongly this enemy follows those curves:
its multiplier is `1 + k · (rank multiplier − 1)` — 1 (default) = the usual curve, 0 = never
faster, 2 = twice the effect (0–8). `"revenge": { "minRank", "pattern", "speed"? }` gives the
enemy revenge ("suicide") bullets: shot down on screen by a player at a rank of at least
`minRank` (0–31), it fires `pattern` — `aimed` (one bullet at the player), `spread3` (an aimed
3-way) or `ring8` (eight bullets round the circle, the first aimed) — from where it died, at
`speed` px/tick on Normal (0.25–4, default 1.25; rank-scaled). A Mega Crash kill never fires
revenge bullets. Bosses take neither field.

**Drops and Mega Crash.** `"drop": "capsule"` makes the enemy leave a power capsule where it
dies (the player's power meter — `docs/dev/powerups-and-shields.md`); `"drop": "blueCapsule"`
(M2-04) the rare blue capsule, which destroys every enemy on screen when collected (keep it
rare). `"drop": "powerup"` (M2-05) is the **mode-agnostic** power-up: a capsule when the player
flies the meter ship, the stage's next planned colour item (`directItems`) when it flies the
Direct-mode MANTA — the direct ship has no meter, so a `capsule` drop becomes that item too. `"megaCrashImmune": true` lets it survive the meter's `!` slot (Mega Crash) and the blue
capsule, which destroy every other enemy — armour included.

**Option Hunters (M2-04).** `"optionHunter": true` makes the enemy an Option Hunter
(`shmup_feat.md` §8, §11): a stage event spawns it only while some ship has an Option (it simply
does not come otherwise) and it arrives with an alarm; it is armoured (shots clink), never hurts
the ship, and takes every Option it touches (the first one and all behind it) — carrying them,
grey, until it leaves the view (they are lost) or dies to a Mega Crash or a blue capsule (they
drift free and can be picked up again). Give it the `hunter.option` behaviour, a generous
hurtbox and no `megaCrashImmune`.

`zone-b.enemies.json` and `zone-c.enemies.json` (M2-11) are the rosters of the real zones B and C.
BRINE NEBULA: `froth` (a splitting bubble → two `froth-bead`s, `bubble.split`), `froth-bead` (a small
bubble, also flown in popcorn streams), `brood-bubble` (a bubble with a `gill-dart` fish inside —
`bubble.split` with `count` 1), `gill-dart` (`rammer.aimed`), `reef-jelly` (`pattern.loop` on a sine
mover: the `brine.jelly-ring` pattern of `content/patterns/zones.patterns.json`), `urchin` /
`urchin-ceiling` (`turret.floor`), `maw-rocket` (`rocket.homing`: launched away from the middle
row, homing for a while, then straight on), the captain **SPUME HERALD** (`spume-herald`,
`captain.launcher` launching brood bubbles, a 30-s time limit) and the boss **GALVANIC MAW**
(`galvanic-maw`, GM-02 — `boss.maw`: a mechanical fish tracking the player's height; its mouth, the
`whenOpen` core, opens with its jaws — the parts attached to it — moving apart, fires cutters and,
from the second phase, rings while open; the two rocket pods launch its `minion`, the homing
rockets). DUNE EXPANSE: `dune-worm` (`worm.burst` on the floor: a formation is one worm),
`husk-crawler` / `husk-crawler-floor` (`walker.floor` on the ceiling / floor), `sand-skimmer`
(`fan.loop`), `dust-devil` (`pattern.loop`, the `dune.whirl` spiral), `sand-geyser` (`volcano.lob`)
and its `sand-clod`s (`rock.fall`), `widow-drone` (`rammer.aimed`) and the boss **SANDGRAVE WIDOW**
(`sandgrave-widow`, SW-03 — `boss.widow`: scuttling inside a box, spreads from its head — which
takes damage only once its two fangs are gone —, spider drones launched from its spinnerets and,
from the second phase, silk lines — telegraphed horizontal lasers, one at a time).

`zone-d.enemies.json` and `zone-e.enemies.json` (M2-12) are the rosters of the real zones D and E.
MAGMA DEEP: `ember-wisp` (`drifter.sine` popcorn), `cinder-bat` (`fan.loop` on the `bat-swoop-*`
paths), `magma-cone` (`volcano.lob` on the floor) and its `magma-bomb`s (`rock.fall`, `trigger` 0),
`cinder-rock` (`rock.fall` hanging from a cave roof, `trigger` 60), `slag-crawler` /
`slag-crawler-floor` (`walker.floor`), `basalt-turret` / `basalt-turret-ceiling` (`turret.floor`)
and the boss **CINDER BASTION** (`cinder-bastion`, CB-04 — `boss.bastion`: a core battleship whose
core is guarded by **rotating shield arms** — a `hub` part attached to the core, no hurtbox and no
sprite, turned by the behaviour, and four armoured arm segments with circle hurtboxes attached to
it — plus two lane-laser emitters, the guns; the arms reverse in the later phases, spreads and rings
come from the core). TEMPEST RIDGE: `hail-drifter` (`drifter.sine`), `gale-kite` (`fan.loop` on the
rear-entry `kite-overtake-*` paths), `squall-jumper` (`rear.swoop`: in from behind along its row,
a shot back from its turn point, then away left), `crag-turret` / `crag-turret-ceiling`
(`turret.floor`), `thunderhead` (`pattern.loop` + `tempest.bolt`), `steed-foal` (`rocket.homing`)
and the boss **SQUALL STEED** (`squall-steed`, SS-05 — `boss.steed`: a seahorse bobbing on a tall
ellipse; its chest, the `whenOpen` core, opens with its lids and launches the homing foals, the
snout — the gun — fires spreads and, in the last phase, a ring as the chest shuts).

`zone-f.enemies.json` and `zone-g.enemies.json` (M2-13) are the rosters of the real zones F and G.
CELL VAULT: `lymph-mote` (`drifter.sine` popcorn), `chaser-cell` (`cell.chase`: drifts in along its
row, then chases the nearest ship with a capped turn for a while, then swims straight on),
`mitosis-cell` (`bubble.split` whose `child` is the chaser: shot, it divides into two chasing
cells), `vault-claw` / `vault-claw-ceiling` (`tentacle.grab` on the floor / ceiling),
`polyp-turret` / `polyp-turret-ceiling` (`turret.floor`), `spore-sac` / `spore-sac-low`
(`pattern.loop` + `vault.spores` on a `waypoint` mover: it hovers at the right, then drifts off up /
down) and the boss **MANTLE REGENT** (`mantle-regent`, MR-06 — `boss.squid`: a squid whose two
tentacles — a breakable root, three armoured segments and a gun at the tip, circle-hit parts chained
from the mantle — curl in front of its eye (the core) and uncurl in a cycle; breaking a tentacle
ends the first phase; from the second phase the eye launches chasing cells, its `minion`). PRISM
LABYRINTH: `glint-mote` (`drifter.sine`), `prism-cube` (`cube.stack`: a formation is a seeded cube
rush), `facet-turret` / `facet-turret-ceiling` (`turret.floor`), `halo-crystal` (`orbiter.loop` on a
path, rings), `prism-lens` / `prism-lens-low` (`pattern.loop` + `prism.fan` on a `waypoint` mover),
`geode` (`bubble.split` into three `geode-shard`s — a `bubble.split` with `count` 0 that only
drifts) and the boss **FACET MONARCH** (`facet-monarch`, FM-07 — `boss.facet`: a crystal core
`afterParts` of two crystals in front of it, an armoured hull behind it, and two armoured tentacle
arms waving like claws with guns at their tips; rings and, in the last phase, lane lasers from the
core).

`zone-h.enemies.json` and `zone-i.enemies.json` (M2-14) are the rosters of the final zones H and I.
IRON CITADEL: `bolt-drone` (`drifter.sine` popcorn), `hatch-bay` / `hatch-bay-ceiling`
(`hatch.spawner` releasing `hatch-mite` / `hatch-mite-down` — `rammer.aimed` beetles leaving up out
of a floor hatch or down out of a ceiling one), `laser-emitter` / `laser-emitter-ceiling`
(`emitter.laser`: a telegraphed lane laser to the left along its row, attached, every 200 ticks),
`sentinel-walker` (`walker.floor`), `rail-turret` / `rail-turret-ceiling` (`turret.floor`),
`sovereign-drone` (`cell.chase`, the boss's `minion`), the **parade** — four earlier bosses in
reduced form, captains with a 16-s time limit that reuse the originals' sprites and behaviours
with fewer parts: `echo-bulwark` (BULWARK ECHO, two plates, `boss.bulwark`), `echo-maw` (MAW ECHO,
the mouth and its jaws, `boss.maw`), `echo-bastion` (BASTION ECHO, a two-arm wheel,
`boss.bastion`), `echo-regent` (REGENT ECHO, two short tentacles, `boss.squid`) — and the boss
**IRON SOVEREIGN** (`iron-sovereign`, IS-08 — `boss.sovereign`, four phases: the core behind two
shield plates with lane lasers from its emitters; then a shield wheel of four armoured pods turning
round the core and rings; then the wheel reversing, 5-ways and drones launched from the emitters;
then the overdrive — a turning three-arm spiral, the boss system's spiral stream). ABYSSAL THRONE:
`lumen-mote` (`drifter.sine`), `depth-mine` (`mine.burst`: drifts until a ship comes within 60 px,
then stops, flashes and bursts into a ring of eight), `trench-eel` (`worm.burst`: a formation is one
eel bursting out of the trench floor), `gulper` / `gulper-low` (`pattern.loop` + `abyss.gulp` on a
`waypoint` mover), `abyss-turret` / `abyss-turret-ceiling` (`turret.floor`), `ark-hook`
(`rocket.homing`, the ARK's hooks), `king-spawn` (`cell.chase`, the king's `minion`), the raid boss
**ABYSS ARK** (`abyss-ark`, AA-09 — `boss.ark`: a whale-class battleship of four hull sections the
camera flies round, two turret rows of three with heading frames, a heart — the core — and hooks;
a 90-s time limit; `inner` → the king) and **THE HOLLOW KING** (`hollow-king`, HK-10 —
`boss.angler`: an anglerfish whose `whenOpen` mouth — the core — opens with its jaws, a lure of
chained beads ending in a gun swaying in front of it; three phases).

Several files may exist (e.g. one per theme); ids must be unique across all of them.
The bonus stages' drops (M2-10): `"drop": "oneUp"` leaves a 1UP (an extra life, up to 9) and
`"drop": "bonusCapsule"` a gold bonus capsule worth 1,000 points — world-space items like the
capsule, in both power-up modes. `bonus.enemies.json` holds the bonus vault's carriers
(`vault-carrier` → a bonus capsule, `vault-carrier-1up` → a 1UP).

Formation-kill drops and bonuses are configured on the stage event (`formation`), not here.

## Bosses (M1-13)

An entry with a `boss` section is a boss (`shmup_feat.md` §13). It has only an `id` and the
section — every other enemy field is left out (the loader fills them). Stages start it with a
`warning` event (the WARNING, then the boss flies in) or a `boss` event (at once); a `spawn` /
`formation` event or a spawner's `child` cannot name a boss, and `warning` / `boss` events must.

```jsonc
{
  "formatVersion": 1,
  "kind": "enemies",
  "enemies": [
    {
      "id": "test-boss",
      "boss": {
        "code": "TW-00",                 // shown by the WARNING (A-Z, 0-9, "-"; ≤ 8)
        "displayName": "TRIAL WARDEN",   // shown by the WARNING (upper case; ≤ 24)
        "introTicks": 120,               // optional: invulnerable fly-in from the right (default 120)
        "score": 20000,                  // optional: points at the score tally (default 0)
        "x": 300, "y": 100,              // optional: home of the boss's origin in playfield pixels
        "parts": [                       // 1–16 parts, parents first; later parts drawn on top
          { "name": "hull", "hurtbox": { "hw": 8, "hh": 8 }, "vulnerable": "never",
            "sprite": "bosses/hull-block" },
          { "name": "core", "parent": "hull", "x": -14, "hp": 24, "hurtbox": { "hw": 7, "hh": 7 },
            "vulnerable": "afterParts", "requires": ["plate"], "core": true,
            "sprite": "bosses/core", "anim": { "frames": 2, "ticks": 12 }, "score": 5000,
            "explosion": "large" },
          { "name": "plate", "parent": "hull", "x": -26, "hp": 10, "hurtbox": { "hw": 4, "hh": 8 },
            "sprite": "bosses/shield-plate", "score": 500 },
          { "name": "gun", "parent": "hull", "y": -20, "hp": 12, "hurtbox": { "hw": 6, "hh": 6 },
            "gun": true, "sprite": "bosses/emitter", "score": 1000 }
        ],
        "phases": [                      // 1–8, in order; every phase but the last has "until"
          { "script": "boss.hover", "params": { "fireTicks": 70 },
            "until": { "partsDestroyed": ["plate"] } },
          { "script": "boss.lanes" }     // the last phase runs until the boss dies
        ]
      }
    }
  ]
}
```

**Parts.** `name` (lower-case kebab, unique in the boss); optional `parent` (an earlier part —
the part moves with it; default: the boss's origin), `x` / `y` (offset from the parent, default
0), `hp` (default 1), `hurtbox` (without one the part is never hit or touched — decoration),
`vulnerable`, `requires`, `core`, `gun`, `open`, `sprite` (without one it is not drawn), `anim`,
`score` (points for destroying it, default 0) and `explosion` (default `medium`). Destroying a
part destroys the parts attached to it. Touching a part is a hit on the ship.

**Weak points** (`vulnerable`): `always` (default); `afterParts` — only once every part named in
`requires` is destroyed (a core behind shield plates); `whenOpen` — only while the behaviour
holds it open (`open` is the starting state, default `false`); `never` — armour. Shots at a part
that cannot take damage (and at every part during the intro) `clink` and die. At least one part
is a `core`: when every core is destroyed the boss dies. A core cannot be `never` and needs a
hurtbox.

**Phases.** Each runs a boss behaviour (`script`) with optional `params`, until its `until` is
met — `hpBelow` (the cores' total hit points fall below it), `partsDestroyed` (+ optional
`count`, default all of them) or `ticks` (any one ends the phase) — then the next phase's
behaviour takes over. Boss behaviours (`core/behaviors`): `boss.hover` (tracks the player's
height, aimed spreads from the `gun` parts, opens / closes `whenOpen` parts — `trackSpeed`,
`margin`, `fireTicks`, `bulletSpeed`, `ways`, `spread`, `openTicks`, `closedTicks`) and
`boss.lanes` (lane lasers from the guns in turn and aimed spreads — `trackSpeed`, `margin`,
`laserTicks`, `laserLength`, `laserWidth`, `telegraph`, `active`, `fireTicks`, `bulletSpeed`,
`ways`, `spread`).

**The WARNING** shows the game's own text built from `displayName` and `code`
(`WARNING!!` / `GIANT HOSTILE "TRIAL WARDEN"` / `CLOSING IN - CODE TW-00`) while the siren
wails and the camera brakes to a stop; then the boss flies in and the boss theme starts. The
death sequence cancels every bullet, chains explosions for two seconds, ends with a big blast
and a short freeze, pays `score` to the player who destroyed the last core and clears the stage.

See [`example.enemies.json`](example.enemies.json), the test range's roster in
[`test-range.enemies.json`](test-range.enemies.json) and the test boss in
[`test-boss.enemies.json`](test-boss.enemies.json) (`pnpm dev` with `?stage=test-boss`).

## Advanced bosses (M2-09)

The boss section has optional fields for the Darius-style variety of `shmup_feat.md` §13 — see
[`advanced-bosses.enemies.json`](advanced-bosses.enemies.json) for one of each (fly them on the
dev stages `captain-range`, `raid-range`, `twin-range` and the boss rush `gauntlet-range`):

```jsonc
{
  "formatVersion": 1,
  "kind": "enemies",
  "enemies": [
    {
      "id": "orbit-warden",
      "boss": {
        "code": "CP-03",
        "displayName": "ORBIT WARDEN",
        "role": "captain",               // a mid-boss: a "boss" event, rides the scroll, no stage clear
        "x": 332, "y": 100,
        "parts": [
          { "name": "hub", "hp": 30, "radius": 8, "spin": 6, "core": true, "gun": true,
            "sprite": "bosses/core" },  // a circle hurtbox; spins 6 binary units (of 1024) a tick
          { "name": "orb", "parent": "hub", "x": 20, "radius": 6, "vulnerable": "never",
            "sprite": "bosses/orb" }    // placed by the hub's turn: it circles the hub
        ],
        "phases": [{ "script": "captain.circler" }]
      }
    },
    {
      "id": "leviathan",
      "boss": {
        "code": "RL-01",
        "displayName": "IRON LEVIATHAN",
        "x": 96, "y": 150,
        "timeLimit": 5400,               // fight ticks, then it escapes (the BossEscaped ending flag)
        "inner": "heart",                // revealed by its final blast
        "raid": {                        // anchored in the world; the camera follows these offsets
          "segments": [                  // (the camera's top-left minus the boss's origin)
            { "x": -40, "y": -150, "ticks": 150, "hold": 150 },
            { "x": 140, "y": -100, "ticks": 240 }
          ],
          "loop": true
        },
        "parts": [
          { "name": "keel", "sprite": "bosses/raid-hull" },
          { "name": "turret", "parent": "keel", "x": 24, "y": -26, "hp": 12, "radius": 7,
            "angle": 768, "turn": 16, "gun": true, "sprite": "bosses/turret" },
          { "name": "reactor", "parent": "keel", "x": 60, "hp": 60, "radius": 8, "core": true }
        ],
        "phases": [{ "script": "boss.raid" }]
      }
    },
    {
      "id": "ember",
      "boss": {
        "code": "TE-01",
        "displayName": "EMBER TWIN",
        "partner": "frost",              // enters with it (a double boss)
        "alternate": 300,                // they take turns: the other withdraws behind
        "enrage": { "fireRate": 0.5, "speed": 1.6, "phase": 1 }, // when its partner dies
        "minion": "bubble",              // what its behaviours launch (captain.launcher)
        "parts": [{ "name": "core", "hp": 30, "radius": 7, "core": true }],
        "phases": [
          { "script": "boss.hover", "until": { "hpBelow": 15 } },
          { "script": "boss.lanes" }
        ]
      }
    }
  ]
}
```

| Field | Default | Meaning |
|---|---|---|
| `role` | `boss` | `boss` — a stage boss (the WARNING, the scroll lock, the stage clear; one at a time) · `captain` — a mid-boss: flies in with a `boss` event (never a `warning`), rides the scrolling camera until destroyed, keeps the stage music, a short death sequence, no stage clear; no `raid` / `partner` / `inner` / `alternate` |
| `timeLimit` | none | Fight ticks (60–36,000) after which the boss **escapes**: it flies off to the right, no tally; a stage boss's escape sets the World's `BossEscaped` ending flag and ends the encounter |
| `raid` | none | A **battleship raid**: `segments` (1–16) of `x` / `y` (the camera's top-left minus the boss's origin), `ticks` (the eased move, default 120) and `hold` (default 0), `loop` (default `true`). The boss stays where it entered (the camera stops); from its fight the camera follows the segments (the stage's events past the point where it stopped wait — an `end` right after the boss is safe), and eases back when it dies or escapes. Its parts fire only while on screen |
| `partner` | none | Another stage boss (without a partner or raid of its own) that enters with this one — a **double boss** |
| `alternate` | none | With a `partner`: ticks each of the pair fights while the other withdraws behind the right edge (not hit, not touched, its script paused, drawn behind); a partner whose intro outlasts the first turn joins the turns at the next one |
| `enrage` | `fireRate` 0.625, `speed` 1.5, no `phase` | When its partner dies: fire intervals × `fireRate`, motion × `speed`, and a jump to `phase` if it is later than the running one |
| `inner` | none | A stage boss revealed by this one's final blast (**boss inside a boss**): it flies in from the first core; the stage clears after it |
| `minion` | none | A regular enemy the behaviours launch from a part (`captain.launcher`) |

**Turned parts.** `angle` (−1023…1023) is a part's turn relative to its parent in binary units
(1024 per turn, clockwise), `spin` (−32…32) its turn per tick; the parts attached to it are
placed by its **world** angle (its parent's plus its own), so a spinning hub carries a ring of
pods. Boxes never turn: give a turned part a circle hurtbox — `radius` (1–128) instead of a
`hurtbox` — and, to show its heading, `turn` (2–64): the sprite's frames are that many headings
(frame `k` = `k × 1024 / turn`), and the part is drawn with the one nearest its world angle (not
with `anim`; `bosses/turret` has 16).

**Behaviours** for them (`core/behaviors`): `captain.ram` (fans of waves, then a ram along the
player's row), `captain.launcher` (launches its `minion` from the guns in turn), `captain.circler`
(circles an ellipse round the playfield's middle, rings), `captain.crab` (sidesteps in a box,
turning rings) and `boss.raid` (turrets turned to the player, firing along their headings).

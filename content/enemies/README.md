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
      "drop": null,                    // "capsule" | "blueCapsule" | "powerup" | null
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

Several files may exist (e.g. one per theme); ids must be unique across all of them.
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

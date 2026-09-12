# content/enemies/ — enemy definitions

Enemy (and later boss-part) definitions, loaded by the core's `data` module (kind `enemies`)
and run by `packages/core/src/enemies` with the behaviour coroutines of
`packages/core/src/behaviors`. Implements `shmup_feat.md` §11 ("HP, score value, hurtbox,
flash-on-hit, death explosion, drops — defined in `enemies.json`", movement primitives,
off-screen and settle rules) and §15 (score values).

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
      "drop": null,                    // "capsule" | null
      "ground": null,                  // optional: "floor" | "ceiling" | null (flying, default)
      "settleTicks": 30,               // optional: ticks on screen before it may fire (default 30)
      "explosion": "small",            // optional: "small" (default) | "medium" | "large"
      "megaCrashImmune": false,        // optional: survives the Mega Crash (default false)
      "child": null,                   // optional: enemy id a spawner releases (hatch.spawner)
      "rank": { "fireRate": 0.5 }      // optional rank modifiers (§15)
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
rings — `ringTicks`, `ringCount`, `bulletSpeed`). Their tunables and defaults are listed in
`packages/core/src/behaviors`. Bullet speeds are px/tick on Normal (rank scales them) and fire
intervals are ticks on Normal.

**Movers** (`"mover"`, or set by the behaviour): `straight { vx, vy }`, `sine { vx, amp,
period, phase? }`, `path { path?, speed }`, `waypoint { x, y, speed, hold, leaveVx, leaveVy }`,
`follow {}`, `groundCrawl { speed }`, `homing { speed, turnRate }`, `aimedDash { speed, windup }`
(pixels per tick, ticks, binary angles — 1024 per turn). Flying enemies ride the camera
scroll, so their velocities are relative to the screen; ground enemies stand on (or hang from)
the terrain where they spawn.

**Drops and Mega Crash.** `"drop": "capsule"` makes the enemy leave a power capsule where it
dies (the player's power meter — `docs/dev/powerups-and-shields.md`); `"megaCrashImmune": true`
lets it survive the meter's `!` slot (Mega Crash), which destroys every other enemy — armour
included.

Several files may exist (e.g. one per theme); ids must be unique across all of them.
Formation-kill drops and bonuses are configured on the stage event (`formation`), not here.

See [`example.enemies.json`](example.enemies.json) and the test range's roster in
[`test-range.enemies.json`](test-range.enemies.json).

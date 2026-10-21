# content/player/ — player ship definitions

One file per ship, loaded by the core's `data` module and read by `player`
(`packages/core/src/player`). Implements `shmup_feat.md` §5 (player ship: speed levels,
tiny hurtbox, separate terrain box, playfield clamping) and decision **D3** (meter-ship
speed levels `1.5 … 4.0` px/tick at v1's scale — `2.25 … 6` in the v2 world).

`kestrel.player.json` is the meter-mode ship of the M1 vertical slice (**KESTREL**, D36);
`manta.player.json` is the Direct-mode ship (**MANTA**, M2-05): three speeds with a Speed toggle
(remote Ch−), starting in the middle one (3.375 px/tick, decision D3's middle speed at v2's
scale). The ship select lists every
ship in file order; the chosen ship's `mode` becomes the session's power-up model.

## Format (formatVersion 1)

```jsonc
{
  "formatVersion": 1,
  "kind": "player",
  "ships": [
    {
      "id": "kestrel",                 // unique across all player files
      "name": "KESTREL",               // shown on the ship-select screen
      "sprite": "ships/kestrel",       // atlas sprite name; resolved to a numeric id at load
      "thruster": "ships/kestrel-thruster", // optional: flame sprite drawn behind the hull (R4-01.A2)
      "speeds": [2.25, 3, 3.75, 4.5, 5.25, 6], // px/tick per speed level (index = Speed Ups taken)
      "hurtRadius": 2.25,              // tiny centred hitbox, in pixels
      "terrainBox": { "hw": 8, "hh": 5 },  // half-extents used against terrain
      "pickupBox": { "hw": 12, "hh": 9 },   // half-extents used to collect items
      "margins": { "left": 12, "right": 12, "top": 9, "bottom": 9 }, // clamp to the camera view
      "enterTicks": 40,                // uncontrollable fly-in after a spawn
      "respawnInvulnTicks": 150,       // blinking invincibility after a respawn
      "bankFrames": 2,                 // tilt frames on each side of the idle frame (v2 ships: 5 frames)
      "mode": "meter",                 // optional: "meter" (default, the power meter) or "direct" (colour items)
      "startSpeedLevel": 0             // optional: index into speeds the ship starts with (default 0)
    }
  ]
}
```

Units: pixels in the 640×360 internal resolution, time in ticks (60 per second).

**Used today (M1-06):** `speeds`, `margins`, `enterTicks` and `bankFrames` drive free flight —
the ship moves at `speeds[0]` px/tick (diagonals × 0.7071 per axis, decision D4), stops
`margins` pixels inside the 640×336 playfield, flies in over `enterTicks` ticks, and tilts
through `bankFrames` frames each way (the sprite needs `1 + 2 × bankFrames` frames: level,
then the up frames, then the down frames — both shipped files use 2, the five-frame bank the
v2 art draws: level, climb, steep climb, dive, steep dive, R4-01.A1b; the schema allows 0–8,
`data/index.ts:2426`). The optional `thruster` names a second sprite the
World draws behind the hull (R4-01.A2 — presentation only, never hashed): `core/world`
`syncWorldView` pushes it at the ship's centre minus the hull's rear offset, cycling the
sprite's four frames by `(tick >> 2) & 3`, and player 2 burns its `@p2` variant when the atlas
has one; a ship without the field (and the built-in default ship) draws no flame.
The session flies the ship with id `kestrel`, else
the first ship listed. `hurtRadius`, `terrainBox`, `pickupBox` and `respawnInvulnTicks` are
validated now; the terrain box is used since M1-07, the pickup box since M1-11 (power capsules
and the pickup magnet), the hurt radius for bullets since M1-09 (and enemy contact), and since
M1-12 `enterTicks` is also the respawn fly-in and `respawnInvulnTicks` the invulnerable ticks
counted from the moment that fly-in ends (the ship blinks from the start of the fly-in). Edit a
value and reload `pnpm dev` to feel the change; details in
[`docs/dev/sim-world.md`](../../docs/dev/sim-world.md#the-player-ship-coreplayer) and
[`docs/dev/death-and-scoring.md`](../../docs/dev/death-and-scoring.md#respawn-and-invulnerability).

See [`example.player.json`](example.player.json).

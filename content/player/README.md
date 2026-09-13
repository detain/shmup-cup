# content/player/ — player ship definitions

One file per ship, loaded by the core's `data` module and read by `player`
(`packages/core/src/player`). Implements `shmup_feat.md` §5 (player ship: speed levels,
tiny hurtbox, separate terrain box, playfield clamping) and decision **D3** (meter-ship
speed levels `1.5 … 4.0` px/tick).

`kestrel.player.json` is the meter-mode ship of the M1 vertical slice (**KESTREL**, D36);
`manta.player.json` is the Direct-mode ship (**MANTA**, M2-05): three speeds with a Speed toggle
(remote Ch−), starting in the middle one (2.25 px/tick, decision D3). The ship select lists every
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
      "speeds": [1.5, 2, 2.5, 3, 3.5, 4], // px/tick per speed level (index = Speed Ups taken)
      "hurtRadius": 1.5,               // tiny centred hitbox, in pixels
      "terrainBox": { "hw": 5, "hh": 3 },  // half-extents used against terrain
      "pickupBox": { "hw": 8, "hh": 6 },   // half-extents used to collect items
      "margins": { "left": 8, "right": 8, "top": 6, "bottom": 6 }, // clamp to the camera view
      "enterTicks": 40,                // uncontrollable fly-in after a spawn
      "respawnInvulnTicks": 150,       // blinking invincibility after a respawn
      "bankFrames": 1,                 // tilt frames on each side of the idle frame
      "mode": "meter",                 // optional: "meter" (default, the power meter) or "direct" (colour items)
      "startSpeedLevel": 0             // optional: index into speeds the ship starts with (default 0)
    }
  ]
}
```

Units: pixels in the 384×216 internal resolution, time in ticks (60 per second).

**Used today (M1-06):** `speeds`, `margins`, `enterTicks` and `bankFrames` drive free flight —
the ship moves at `speeds[0]` px/tick (diagonals × 0.7071 per axis, decision D4), stops
`margins` pixels inside the 384×200 playfield, flies in over `enterTicks` ticks, and tilts
through `bankFrames` frames each way (the sprite needs `1 + 2 × bankFrames` frames: level,
then the up frames, then the down frames). The session flies the ship with id `kestrel`, else
the first ship listed. `hurtRadius`, `terrainBox`, `pickupBox` and `respawnInvulnTicks` are
validated now; the terrain box is used since M1-07, the pickup box since M1-11 (power capsules
and the pickup magnet), the hurt radius for bullets since M1-09 (and enemy contact), and since
M1-12 `enterTicks` is also the respawn fly-in and `respawnInvulnTicks` the invulnerable ticks
counted from the moment that fly-in ends (the ship blinks from the start of the fly-in). Edit a
value and reload `pnpm dev` to feel the change; details in
[`docs/dev/sim-world.md`](../../docs/dev/sim-world.md#the-player-ship-coreplayer) and
[`docs/dev/death-and-scoring.md`](../../docs/dev/death-and-scoring.md#respawn-and-invulnerability).

See [`example.player.json`](example.player.json).

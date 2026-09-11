# content/player/ — player ship definitions

One file per ship, loaded by the core's `data` module and read by `player`
(`packages/core/src/player`). Implements `shmup_feat.md` §5 (player ship: speed levels,
tiny hurtbox, separate terrain box, playfield clamping) and decision **D3** (meter-ship
speed levels `1.5 … 4.0` px/tick).

`kestrel.player.json` is the meter-mode ship of the M1 vertical slice (**KESTREL**, D36);
the Direct-mode ship (**MANTA**) arrives in M2.

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
      "respawnInvulnTicks": 120,       // blinking invincibility after a respawn
      "bankFrames": 1                  // tilt frames on each side of the idle frame
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
validated now and used from M1-07 / M1-11 / M1-12. Edit a value and reload `pnpm dev` to feel
the change; details in [`docs/dev/sim-world.md`](../../docs/dev/sim-world.md#the-player-ship-coreplayer).

See [`example.player.json`](example.player.json).

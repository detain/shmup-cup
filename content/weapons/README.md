# content/weapons/ — player weapon tunables

Player weapon definitions for both power-up models, loaded by the core's `weapons` module
(`packages/core/src/weapons`). Implements `shmup_feat.md` §7C ("Weapons defined in data
(`weapons.json`): sprite, speed, damage, cap, pierce, behavior id").

## Format (formatVersion 1)

```jsonc
{
  "formatVersion": 1,
  "kind": "weapons",
  "weapons": [
    {
      "id": "shot.basic",
      "slot": "main",                // meter slots: main | missile | double | laser; direct: main | sub
      "behavior": "shot.straight",   // coded behaviour id (core/weapons)
      "damage": 1,
      "speed": 8,                    // px per tick
      "cap": 4,                      // max projectiles on screen (Gradius-style)
      "pierce": false,
      "sprite": "shots/basic",
      "refireTicks": 4,             // optional: ticks between shots; omitted = GameConfig
                                    // autofireInterval (4) / missileInterval (10, missile slot)
      "sfx": "PlayerShot",          // optional: SFX_CUES name, or null for a silent weapon
      "params": { "maxLength": 64 } // optional: behaviour-specific tunables (numbers only)
    }
  ],
  "presets": [                       // meter-mode loadouts (Type A–D style, original names)
    // every slot is a weapon id or null; "main" is optional
    { "id": "type-a", "missile": "missile.ground", "double": "shot.double", "laser": "laser.pierce" }
  ]
}
```

`behavior` names a coded behaviour in `packages/core/src/weapons`; `sprite` names an atlas
sprite (e.g. `shots/basic` = `assets/source/sprites/shots/basic.sprite.json`;
`pnpm content:check` fails if it does not exist). Both are resolved to numeric ids at load
(`behaviorId`, `spriteId`), so nothing looks up a string per tick. Weapon ids must be unique
across all weapon files.

[`type-a.weapons.json`](type-a.weapons.json) is the meter-mode Type A arsenal of the M1
slice (`shot.basic`, `shot.double`, `laser.pierce`, `missile.ground`; preset `type-a`, which the
game uses — else the first preset, else the first weapon of each slot).

Coded behaviours (`packages/core/src/weapons`) and their `params` (defaults in brackets; angles in
binary units, 1024 per turn; `ox` / `oy` = spawn offset from the shooter, `hw` / `hh` = hitbox half
size); `checkWeaponBehaviors` reports unknown params and a behaviour in the wrong slot:

| Behaviour | Slot | Params |
|---|---|---|
| `shot.straight` | main | `ox` 8, `oy` 0, `hw` 4, `hh` 2 |
| `shot.double` | double | `angle` 128 (climb of the second shot), `ox` 4, `oy` -2, `hw` 3, `hh` 3 |
| `laser.beam` | laser | `maxLength` 64, `hitCooldownTicks` 6, `ox` 8, `oy` 0, `hh` 2 |
| `missile.groundSlide` | missile | `slideSpeed` 3, `angle` 128 (fall), `ox` 0, `oy` 4, `hw` 4, `hh` 1.5, `frames` 2 |
Direct-mode families (9 levels each) will be expressed as `levels: [...]` arrays per
family id.

See [`example.weapons.json`](example.weapons.json).

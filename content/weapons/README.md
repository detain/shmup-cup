# content/weapons/ — player weapon tunables

Player weapon definitions for both power-up models, loaded by the core's `weapons` module
(`packages/core/src/weapons`). Implements `shmup_feat.md` §7C ("Weapons defined in data
(`weapons.json`): sprite, speed, damage, cap, pierce, behavior id").

## Planned format (formatVersion 0)

```jsonc
{
  "formatVersion": 0,
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
      "sprite": "shots/basic"
    }
  ],
  "presets": [                       // meter-mode loadouts (Type A–D style, original names)
    { "id": "type-1", "missile": "missile.ground", "double": "double.up", "laser": "laser.pierce" }
  ]
}
```

Direct-mode families (9 levels each) will be expressed as `levels: [...]` arrays per
family id.

See [`example.weapons.json`](example.weapons.json).

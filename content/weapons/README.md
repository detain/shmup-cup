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
      "refireTicks": 4,             // optional: ticks between shots (autofire cadence)
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
frame. Both are resolved to numeric ids at load (`behaviorId`, `spriteId`), so nothing looks
up a string per tick. Weapon ids must be unique across all weapon files.

[`type-a.weapons.json`](type-a.weapons.json) is the meter-mode Type A arsenal of the M1
slice (`shot.basic`, `shot.double`, `laser.pierce`, `missile.ground`; preset `type-a`).
Direct-mode families (9 levels each) will be expressed as `levels: [...]` arrays per
family id.

See [`example.weapons.json`](example.weapons.json).

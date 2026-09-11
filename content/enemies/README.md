# content/enemies/ — enemy definitions

Enemy (and later boss-part) definitions, loaded by the core's `enemies` module
(`packages/core/src/enemies`). Implements `shmup_feat.md` §11 ("HP, score value, hurtbox,
flash-on-hit, death explosion, drops — defined in `enemies.json`") and §15 (score values).

## Planned format (formatVersion 0)

```jsonc
{
  "formatVersion": 0,
  "kind": "enemies",
  "enemies": [
    {
      "id": "drifter",               // referenced by stage events
      "hp": 1,
      "score": 100,
      "hurtbox": { "hw": 6, "hh": 5 }, // half-extents in pixels
      "script": "drifter.sine",      // behaviour coroutine id (TypeScript, core/patterns)
      "sprite": "enemies/drifter",   // atlas frame prefix (render-pixi)
      "drop": null,                  // "capsule" | "item:red" | … | null
      "rank": { "fireRate": 0.5 }    // optional rank modifiers (§15)
    }
  ]
}
```

Several files may exist (e.g. one per theme); ids must be unique across all of them.
Formation-kill drops are configured on the stage event (`formation`), not here.

See [`example.enemies.json`](example.enemies.json).

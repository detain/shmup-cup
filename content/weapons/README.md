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
      "name": "SHOT",                // optional: the weapon select's name (A–Z, 0–9, space . -; ≤ 16)
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
slice (`shot.basic`, `shot.double`, `laser.pierce`, `missile.ground`; preset `type-a`, the
default). [`types-b-d.weapons.json`](types-b-d.weapons.json) holds the Types B–D weapons and
presets of M2-03 (`shmup_feat.md` §7A — original names, Gradius III's roles):

| Preset | MISSILE | DOUBLE | LASER |
|---|---|---|---|
| `type-a` | `missile.ground` MISSILE | `shot.double` DOUBLE | `laser.pierce` LASER |
| `type-b` | `missile.spread` SPREAD BOMB | `shot.tail` TAIL GUN | `laser.ripple` RIPPLE LASER |
| `type-c` | `missile.twoWay` 2-WAY MISSILE | `shot.vertical` VERTICAL | `laser.cyclone` CYCLONE LASER |
| `type-d` | `missile.torpedo` PHOTON TORPEDO | `shot.free` FREE WAY | `laser.twin` TWIN LASER |

The session's preset is `GameConfig.weaponPreset` (the weapon select's TYPE; a content without it
falls back to its first preset, else the first weapon of each slot); `GameConfig.weaponEdit`
(the weapon select's EDIT — Weapon Edit) replaces the MISSILE / DOUBLE / LASER weapons by any
weapon of that slot. The weapon select lists the presets in content order (files load sorted by
path) and each slot's weapons by their `name`.

Coded behaviours (`packages/core/src/weapons`) and their `params` with the defaults used when a
param is omitted (angles in binary units, 1024 per turn; `ox` / `oy` = spawn offset from the
shooter, `hw` / `hh` = hitbox half size); `checkWeaponBehaviors` (run at boot and by
`pnpm content:check`) reports a behaviour that is not a weapon behaviour, unknown params and a
behaviour in the wrong slot:

| Behaviour | Slot | Params |
|---|---|---|
| `shot.straight` | main | `ox` 8, `oy` 0, `hw` 4, `hh` 2 |
| `shot.double` | double | `angle` 128 (climb of the second shot), `ox` 4, `oy` -2, `hw` 3, `hh` 3 |
| `laser.beam` | laser | `maxLength` 64, `hitCooldownTicks` 6, `ox` 8, `oy` 0, `hh` 2 |
| `missile.groundSlide` | missile | `slideSpeed` 3, `angle` 128 (fall), `ox` 0, `oy` 4, `hw` 4, `hh` 1.5, `frames` 2 |
| `missile.spreadBomb` | missile | `angle` 64 (launch below forward), `gravity` 0.12 px/tick², `ox` 2, `oy` 4, `hw` 3, `hh` 3, `blastRadius` 14, `blastTicks` 12, `hitCooldownTicks` 6, `frames` 4 (blast) — falls in an arc, bursts on terrain or the first target into a piercing, world-anchored blast that hits each target at most `blastTicks ÷ hitCooldownTicks` times (twice); armour clinks without putting it out; cap counts bomb and blast |
| `missile.twoWay` | missile | `angle` 128 (climb / dive), `ox` 2, `oy` 0, `hw` 3, `hh` 3 — a volley of a climbing and a diving missile (sprite frames 0 / 1), refired once both are gone |
| `missile.torpedo` | missile | `slideSpeed` 5, `angle` 96, `ox` 0, `oy` 4, `hw` 5, `hh` 1.5, `frames` 2 — a ground slider that flies on through every enemy its hit destroys |
| `shot.tailGun` | double | `angle` 512 (straight back), `ox` -6, `oy` 0, `hw` 4, `hh` 2 — a Double pair |
| `shot.vertical` | double | `angle` 256 (straight up), `ox` 0, `oy` -6, `hw` 2, `hh` 4 — a Double pair |
| `shot.freeWay` | double | `angle` 128 (before any input), `ox` 0, `oy` 0, `hw` 3, `hh` 3 — a Double pair whose second shot flies in the last 8-way direction held |
| `laser.ripple` | laser | `startSize` 4, `maxSize` 20 (half heights), `growth` 0.5 px/tick, `aspect` 0.5 (width ÷ height), `ox` 8, `oy` 0, `frames` 6 — a non-piercing ring whose ring (4 px thick) is the hitbox; the frame follows its size |
| `laser.cyclone` | laser | `maxLength` 80, `hitCooldownTicks` 6, `ox` 8, `oy` 0, `hh` 4, `frames` 4 (swirl) — a thicker `laser.beam` |
| `laser.twin` | laser | `maxLength` 16, `gap` 8, `ox` 8, `oy` 0, `hh` 1.5 — two beams `gap` px apart following the shooter; a pair fires while two more fit under `cap` |

`cap` counts per **shooter**: the ship and each of its (up to four) Options may have that many
of the weapon's projectiles on screen. The Double fires a pair (forward + climbing) and refires
only when both are gone. How the game uses these numbers:
[`docs/dev/weapons-and-options.md`](../../docs/dev/weapons-and-options.md).

The Spread Bomb's blast is drawn with the engine sprite `shots/blast` (core `weapons`
`SPREAD_BLAST_SPRITE`); the HUD shows each MISSILE / DOUBLE / LASER weapon's behaviour name
(`SPREAD`, `TAIL`, `RIPPLE` … — core `weapons` `WEAPON_BEHAVIOR_LABELS`).

Direct-mode families (9 levels each) will be expressed as `levels: [...]` arrays per
family id.

See [`example.weapons.json`](example.weapons.json).

# content/fx/ — particle presets

How the game's explosions, sparks, debris and sparkles look, as data (plan M1-14,
`shmup_feat.md` §18 / §20). The simulation only says *what happened* — an enemy exploded, a
bullet was cancelled, a shot clinked off armour — through its presentation events; this folder
decides which **particle presets** that spawns. Validated by `@shmup/render-pixi` (`particles`
module, kind `fx`); the shell's content owner reports every problem on the boot error screen,
and `pnpm content:check` checks the shipped file, the example and that every sprite exists in
the atlas.

`particles.fx.json` ships the presets of plan M1-14:

| Preset | Sprite | What it is |
|---|---|---|
| `explosion.small` / `.medium` / `.large` | `fx/explosion-*` | An enemy's (or the ship's) explosion — bigger than the sprite it replaces; the large one is three staggered fireballs |
| `boss.chain` | `fx/explosion-medium` | One step of a boss's death chain (two scattered fireballs) |
| `debris` | `fx/debris` | Grey chunks thrown out and falling (normal blending) |
| `spark` | `fx/spark` | Impact sparks of a damaging hit |
| `clink` | `fx/spark` | Sparks bouncing back off armour (no damage) |
| `bullet.cancel` | `fx/sparkle` | The pale-gold twinkle of a cancelled enemy bullet |
| `pickup` | `fx/ring` | The ring flash of a capsule pickup |
| `muzzle` | `fx/spark` | A tiny flash at the ship's nose when it fires |
| `shield.break` | `fx/spark` | A burst of sparks when the Force Field breaks |

and binds them to the events with **triggers**: `fx` triggers listen to the sim's `Particles`
events (their cue names are `FX_CUES` in `@shmup/core` `events`), `sfx` triggers to `Sfx`
events whose sound also implies a visual (`EnemyHit` → sparks, `Clink` → clink,
`MeterAdvance` / `CapsulePickup` → pickup ring, `PlayerShot` → muzzle flash 9 px ahead of the
shooter). A cue may fire up to four presets (`ExplosionMedium` = the fireball plus debris).

## Format (formatVersion 1)

```jsonc
{
  "formatVersion": 1,
  "kind": "fx",
  "presets": [
    {
      "id": "spark",                       // lower-case words joined by "." or "-", unique across files
      "sprite": "fx/spark",                // atlas sprite (assets/source/sprites/… or a generator)
      "frames": [0, 1, 2],                 // optional: frames played evenly over the lifetime (default: all, in order)
      "count": 3,                          // particles per burst (1–64; × the event's intensity 1–4, 64 at most)
      "speed": { "min": 0.8, "max": 1.8 }, // launch speed, px/tick (0–16)
      "direction": 0,                      // optional: cone centre in degrees, 0 = right, 90 = down (default 0)
      "spread": 360,                       // optional: cone width in degrees (default 360 = every direction)
      "gravity": 0,                        // optional: px/tick² added to the vertical speed, + = down (default 0)
      "drag": 0.1,                         // optional: fraction of the speed lost per tick, 0–0.5 (default 0)
      "lifetime": { "min": 6, "max": 9 },  // ticks (whole, 1–600)
      "delay": { "min": 0, "max": 0 },     // optional: ticks a particle waits, hidden, before it appears (default 0)
      "radius": 0,                         // optional: spawn anywhere within this many px of the centre (default 0)
      "blend": "add"                       // optional: "add" (glow, default) or "normal"
    }
  ],
  "triggers": [                            // optional
    { "event": "fx", "cue": "ExplosionSmall", "preset": "spark" },
    { "event": "sfx", "cue": "PlayerShot", "preset": "spark", "dx": 9, "dy": 0 } // dx / dy: offset in px (optional)
  ]
}
```

Rules checked at load: `min ≤ max` in every range; preset ids unique (the first file in path
order wins); a trigger's `cue` must be an `FX_CUES` name (`event: "fx"`) or an `SFX_CUES` name
(`event: "sfx"`) and its `preset` must exist; at most four presets per cue. A frame index the
sprite does not have draws the magenta `ui/missing` frame.

## How particles behave

- **Pool:** 256 particles; a burst in a full pool recycles the oldest ones.
- **World space:** a burst starts at the event's world position and the camera is applied when
  it is drawn — an explosion stays where its enemy died while the stage scrolls.
- **Ticks, not frames:** particles move once per simulated tick and freeze while the game is
  paused. A new particle appears on the next tick at its spawn point.
- **Draw order:** on the `FX` layer — above the ships, shots and items, **below the enemy
  bullets**, so a bullet is never hidden by an explosion (`shmup_feat.md` §18).
- **Randomness** comes from a presentation RNG seeded per session: it never touches the
  simulation, so replays and state hashes do not depend on this file.

See every preset in the browser with `?scene=fx-gallery` (it cycles through them, then the
shakes, flashes, the dim and the score popups).

# content/rules/ — game-wide rule tables

Rule tables that tune the whole game rather than one enemy or stage, loaded by the core's `data`
module (kind `rules`, plan §3.5) and read by `core/config` (difficulty) and `core/bullets`
(scoring). Implements `shmup_feat.md` §15
("Difficulty presets: Easy / Normal / Hard / Arcade — each maps to rank base, rank growth, lives,
extend thresholds, death-penalty preset") and decision D16.

## Format (formatVersion 1)

```jsonc
{
  "formatVersion": 1,
  "kind": "rules",
  "difficulty": {                        // optional section; defined by one file only
    "easy": {
      "rankBase": 0,                     // 0–31: the rank the game starts at
      "rankGrowth": 0.5,                 // 0–4: × the stage / loop / power-up rank terms (0 = constant rank)
      "lives": 5,                        // 1–5 ships at game start
      "extends": { "first": 20000, "every": 70000 }, // extra-life scores (0 = none / only the first)
      "continues": 5,                    // 0–9 continues per game
      "deathPenalty": "casual",          // arcade | classic | casual (shmup_feat.md §10)
      "aimDirections": 16,               // aimed shots snap to 4, 8, 16 … 1024 directions
      "bulletSpeedMul": 0.85             // 0.25–4: enemy bullet speed × this (on top of rank)
    },
    "normal": { "rankBase": 2, "rankGrowth": 1, "lives": 3, "extends": { "first": 20000, "every": 70000 }, "continues": 3, "deathPenalty": "classic", "aimDirections": 32, "bulletSpeedMul": 1 },
    "hard":   { "rankBase": 4, "rankGrowth": 1, "lives": 3, "extends": { "first": 20000, "every": 70000 }, "continues": 2, "deathPenalty": "classic", "aimDirections": 32, "bulletSpeedMul": 1 },
    "arcade": { "rankBase": 6, "rankGrowth": 1, "lives": 2, "extends": { "first": 20000, "every": 70000 }, "continues": 0, "deathPenalty": "arcade", "aimDirections": 32, "bulletSpeedMul": 1 }
  }
}
```

All four presets are required. The loader checks every range above and that `aimDirections` is a
power of two; a second file with a `difficulty` section is reported and ignored.

[`difficulty.rules.json`](difficulty.rules.json) is the shipped table. It equals the built-in
`DEFAULT_DIFFICULTY_TABLE` of `packages/core/src/config` (used when no content has a
`difficulty` section — `pnpm content:check` keeps the two equal):

| Preset | Rank base | Growth | Lives | Continues | Death penalty | Aim directions | Bullet speed |
|---|---|---|---|---|---|---|---|
| EASY | 0 | 0.5 | 5 | 5 | casual | 16 | × 0.85 |
| NORMAL | 2 | 1 | 3 | 3 | classic | 32 | × 1 |
| HARD | 4 | 1 | 3 | 2 | classic | 32 | × 1 |
| ARCADE | 6 | 1 | 2 | 0 | arcade | 32 | × 1 |

Every preset extends at 20,000 points and then every 70,000 (decision D7); lives are capped at 9.

## Scoring section (M2-02)

```jsonc
{
  "formatVersion": 1,
  "kind": "rules",
  "scoring": {                           // optional section; defined by one file only
    "bulletCancel": 10,                  // 0–10,000 points per bullet cancelled into a point item
    "repeatKills": 40,                   // M3-01 score-milking cap: full-score kills per kind (0 = off)
    "repeatPercent": 10,                 // M3-01: 0–100 % of the score for each kill after the cap
    "graze": 10                          // M3-02: 0–1,000 points per grazed enemy bullet
  }
}
```

**Score-milking cap (M3-01, `shmup_feat.md` §15).** Enemies a script or a boss spawns (a
spawner's brood, a boss's minions — never the stage timeline's own spawns) score in full for the
first `repeatKills` kills of each kind in a World; every later kill of that kind scores
`repeatPercent` % of its score (rounded down to tens). Both are optional (defaults 40 and 10).

**Graze (M3-02, `shmup_feat.md` §22).** While `GameConfig.graze` is on (the Options screen's
EXTRAS page), an enemy bullet that passes within `core/bullets` `GRAZE_MARGIN` of a living ship's
hurtbox without hitting it pays `graze` points **once** — the bullet's `Grazed` bit — to that
player, with a small sparkle. Optional (default 10); 0 marks the bullets but scores nothing.

[`scoring.rules.json`](scoring.rules.json) is the shipped section (the built-in
`DEFAULT_SCORING_RULES` of `packages/core/src/scoring` has the same value). When a boss dies or a
Mega Crash goes off, every cancelable enemy bullet turns into a small gold point item that flies
to the credited player's score in the top HUD bar and adds `bulletCancel` points when it gets
there (core `bullets`, `CancelMode.Points`); the player's own death only makes them sparkle.

## How the table is used

- `resolveGameConfig(overrides, table)` (core `config`) fills the preset's fields of
  `GameConfig` — `rankBase`, `rankGrowth`, `startingLives`, `extendFirst`, `extendEvery`,
  `continues`, `deathPenalty`, `aimDirections`, `bulletSpeedMul` — under explicit overrides;
  `createGame` passes the content's table. A replay header therefore records every resolved value.
- The difficulty menu under START (core `scenes`) builds each preset's config with
  `withDifficulty`, so its World plays that row.
- Rank (core `rank`): `rank = rankBase + floor(rankGrowth × (8·(loop − 1) + (stage − 1) + power))`,
  0–31, at most 16 on loop 1; the power term is Missile +1, Double +2, Laser +3, each Option +1,
  a shield +4.
- Each difficulty has its own saved hi-score table (`meter-easy`, `meter-normal`, …).

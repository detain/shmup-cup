# content/patterns/ — bullet patterns as data (the pattern DSL)

BulletML-inspired bullet patterns, loaded by the core's `data` module (kind `patterns`) and run by
the pattern interpreter of `packages/core/src/patterns` (plan M2-02). Implements `shmup_feat.md`
§12 ("BulletML-inspired pattern DSL (nested actions, `fire`, `wait`, `repeat`, `changeSpeed`,
`changeDirection`, `$rank` param) as TS/JSON — not XML").

A file holds named **actions** (a pattern an enemy runs is an action; actions call each other with
`actionRef`) and named **bullets** (`fire` nodes use them by name with `bulletRef`, or define a
bullet inline with `bullet`). Ids are global across files — prefix them with the file's name
(`common.fan-5`). An enemy runs an action with the `pattern.loop` behaviour and its `pattern`
field ([`content/enemies/`](../enemies/README.md)).

## Format (formatVersion 1)

```jsonc
{
  "formatVersion": 1,
  "kind": "patterns",
  "actions": [
    {
      "id": "sample.fan",                   // referenced by enemies ("pattern") and actionRef
      "body": [
        {
          "op": "repeat",
          "times": "3 + floor($rank / 8)",  // expressions: numbers or strings, compiled at load
          "body": [
            {
              "op": "fire",
              "direction": { "type": "aim", "value": "($i - 1) * 40" }, // binary units, 1024 per turn
              "speed": 1.25,                // px/tick on Normal (× the rank's bullet speed scale)
              "bulletRef": "sample.curver"
            }
          ]
        },
        { "op": "wait", "ticks": 90, "ranked": true }, // ranked: ÷ the rank's fire rate
        { "op": "actionRef", "action": "sample.pair", "params": [64] }
      ]
    },
    {
      "id": "sample.pair",
      "body": [
        { "op": "fire", "direction": { "type": "absolute", "value": "512 - $1" }, "bullet": { "kind": "needle-red" } },
        { "op": "fire", "direction": { "type": "sequence", "value": "$1 * 2" }, "speed": { "type": "sequence", "value": 0.25 } }
      ]
    }
  ],
  "bullets": [
    {
      "id": "sample.curver",
      "kind": "oval-purple",                // <shape>-<colour>: round | oval | needle × pink | red | purple
      "actions": [                          // what the bullet does once fired
        { "op": "wait", "ticks": 30 },
        { "op": "changeDirection", "direction": { "type": "aim" }, "term": 12 },
        { "op": "changeSpeed", "speed": 2, "term": 20 },
        { "op": "accel", "accel": -0.01, "min": 1, "term": 60 }
      ]
    }
  ]
}
```

### Nodes (`op`)

| Node | Fields | What it does |
|---|---|---|
| `fire` | `direction?`, `speed?`, `bullet?` / `bulletRef?`, `params?` | Fires one bullet. Missing direction / speed come from the bullet, else aimed at 1 px/tick. `params` (`$1` …) go with a `bulletRef`: evaluated when the fire runs and handed to the bullet. |
| `wait` | `ticks`, `ranked?` | Sleeps (floored; below 1 = no wait). `ranked`: `round(ticks ÷ fire rate)`, at least 1 — like `ScriptApi.fireWait`. |
| `repeat` | `times`, `body` | Runs `body` `times` times (floored; below 1 = never); `$i` counts from 0. At most 4 nested (after `actionRef` inlining). |
| `changeSpeed` | `speed`, `term?` | Bullet only: reach the speed evenly over `term` ticks (0 = at once); a `sequence` value is a change per tick for `term` ticks. |
| `changeDirection` | `direction`, `term?` | Bullet only: turn the short way to the heading over `term` ticks; `sequence` = turn per tick for `term` ticks. In an enemy's pattern it sets the heading `relative` fires measure from. |
| `accel` | `accel`, `min?`, `max?`, `term?` | Bullet only: speed change per tick, clamped to `[min, max]` (defaults 0 and 16), for `term` ticks (0 = until changed). |
| `vanish` | — | Removes the bullet (no sparkle); ends an enemy's pattern. |
| `actionRef` | `action`, `params?` | Runs another action (inlined at load), its `$1` … `$9` set to the values of `params`, evaluated when the `actionRef` runs. Recursion is an error. |

**Directions** `{ "type", "value" }`: `aim` (default: at the nearest living player, snapped to the
difficulty's aim directions, + value), `absolute` (0 = right, 256 = down, 512 = left), `relative`
(to the bullet's own heading; in an enemy's pattern to its heading, left unless set), `sequence`
(to the previous `fire` of the same action / bullet; the first one is aimed). **Speeds**: an
expression (absolute) or `{ "type": "absolute" | "relative" | "sequence", "value" }` — `relative`
to the bullet's own speed (0 in an enemy's pattern), `sequence` to the previous fire's (1 before
the first).

**Expressions**: `+ - * / %`, unary `-`, parentheses, `floor`, `round`, `abs`, `min`, `max`,
`sin`, `cos` (binary units) and `$rank` (0–31), `$rand` (a replay-safe random number in [0, 1),
drawn each time it is evaluated), `$loop`, `$i`, `$1` … `$9`. They are parsed once at load (no
`eval`) and constant parts are folded. Params are **values**, as in BulletML: a param is evaluated
once, when its `actionRef` / `fire` runs, so `"params": ["$i"]` passes the caller's loop index
(inside the referenced action or bullet `$i` is its own loop's) and a `$rand` param is one draw,
the same wherever `$1` is used.

**Rules.** The loader reports bad expressions, unknown / recursive references, `$n` beyond a
reference's params, `repeat` deeper than 4, more than 16 non-constant param values live at once
(nested references), both `bullet` and `bulletRef` in one fire, and a compiled bank over 262,144
numbers — with the JSON path of the problem; an action that runs a problem (its own, an inlined
action's or a bullet program's) runs nothing. Enemy speeds follow the
same 4-way limits as hand-written behaviours (zone A: aimed bullets ≤ 2 px/tick on Normal). A
bullet may `bulletRef` itself (no params) — the 512-bullet pool bounds it.

[`common.patterns.json`](common.patterns.json) holds the shared library (`common.fan-5`,
`common.spiral`, `common.ring`, `common.homing-ring`, `common.splitter`);
[`test-sentry.enemies.json`](../enemies/test-sentry.enemies.json)'s `sentry` runs
`common.spiral`. [`zones.patterns.json`](zones.patterns.json) (M2-11) holds the zones' own patterns:
`brine.jelly-ring` (zone B's `reef-jelly`: a six-bullet ring, the first aimed, at 0.85 px/tick) and
`dune.whirl` (zone C's `dust-devil`: a short two-armed spiral of needles at 1.1 px/tick); M2-12 added
`tempest.bolt` (zone E's `thunderhead`: a streak of four aimed needles, 0.85 → 1.6 px/tick — the
first fire aimed, the others `sequence` 0 in direction and +0.25 in speed); M2-13 added
`vault.spores` (zone F's `spore-sac`: a fan of three round spores, 56 units apart, aimed, at 0.75
px/tick) and `prism.fan` (zone G's `prism-lens`: two fans of four needles 18 ticks apart, 40 units
apart round the aim — no bullet on the aimed line — at 1.15 px/tick).

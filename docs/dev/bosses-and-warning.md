# Bosses and the WARNING sequence

How bosses live inside `@shmup/core`: the **boss section** of the `enemies` content kind and what
the loader makes of it, the **boss system** (`core/bosses`) that runs one multi-part boss per
World — part transforms, **weak points** that `clink`, **phases** that swap the running script by
HP, destroyed parts or time, contact with the ships — the **WARNING** that brakes the camera into
a scroll lock before the boss flies in, the **death sequence** (bullet cancel, chained
explosions, final blast with hit-stop, score tally, `stageClear`), the **boss behaviours** of
`core/behaviors`, and how the World, the weapons, the stage runner and the flight scene take
part. Built in plan step **M1-13**; `core/bosses` is `partial` (the P0 mechanics — timers,
escapes, the HP bar, mid-bosses and raids are M2-09).

This page is the *how and why*. Exact signatures are in
[api-reference.md](api-reference.md#bosses--multi-part-bosses-the-warning-and-the-death-sequence-partial)
(`bosses`), [`behaviors`](api-reference.md#behaviors--enemy-and-boss-behaviour-registries-partial),
[`data`](api-reference.md#data--content-schemas-and-loader) and
[`stage`](api-reference.md#stage--stage-runtime); the TSDoc in
`packages/core/src/{bosses,behaviors,data,stage,weapons,world}/index.ts` is the authoritative
reference. The content *format* for authors is in
[`content/enemies/README.md`](../../content/enemies/README.md#bosses-m1-13) and the event table
of [`content/stages/README.md`](../../content/stages/README.md). The enemy system whose hit path
the parts share is [enemies-and-behaviors.md](enemies-and-behaviors.md); the shots that hit them
[weapons-and-options.md](weapons-and-options.md); the scroll lock [stage-runtime.md](stage-runtime.md);
the hit-stop, shake and flash requests and the score [death-and-scoring.md](death-and-scoring.md).

Background: `shmup_feat.md` §13 (bosses: the WARNING presentation, multi-part bosses, weak
points, phase state machines, the death sequence), §19 (the WARNING siren is critical, the music
switches to the boss theme, the stage-clear jingle), §20 (clink on invulnerable parts, big
explosions, bullet cancel and rumble on a boss kill), §26 (no verbatim text from the source
games); plan §3.2 (tick phases) and decisions **D10** (the WARNING text is the game's own
paraphrase) and **D29** (coroutines decide, movers move).

## The picture at a glance

```text
content/enemies/test-boss.enemies.json ─┐  loadContent()                                core/data
content/stages/test-boss.stage.json ────┘   ├─ completeEnemy: a boss names only id + boss; regular
                                            │  fields filled from it (hp = cores' total, …)
                                            ├─ completeBoss: part defaults, parent indices, masks
                                            └─ checkBossReferences: bosses only in warning / boss

createWorld(config, db, { bossBehaviors = DEFAULT_BOSS_BEHAVIORS })               core/world
 └─ createBossSystem(world, bossBehaviors)                                         core/bosses
     one Boss slot + 16 BossParts, the script API, the parts' batch (AIR_ENEMIES, 16), the
     WarningState (= view.warning), every boss entry compiled (WARNING text, phase tables)

stage 'warning' event (phase 3) ─ startWarning: status bossWarning, stage.brake(60),
                                  MUSIC Silence, Dim 50 % / 180, siren + flash on 0 / 60 / 120
  +180 ticks                    ─ enter: parts placed, Intro (invulnerable fly-in), boss music
  +introTicks                   ─ startFight: phase 0's script runs this tick
                   every tick   3 update   4 runScript   5 move   6 insertColliders,
                                collidePlayers   7 weapons → damagePart, resolve (phases)   9 sync
last core destroyed (phase 7) ─ startDeath: cancel bullets / lasers, music fade, small shake
  dying ticks 8, 16 … 112       ─ chain explosion (FX BossChain + SFX BossExplode, cosmetic RNG)
  dying tick 120                ─ final blast: FX BossBlast, flash, large shake, rumble, hit-stop 5
  dying tick 121                ─ tally: boss score → killer, BossDefeated, MUSIC StageClear
  dying tick 180                ─ Dead, status stageClear, stage.unlock()
```

## Boss data (`content/enemies/`, the `boss` section)

A boss is an **`enemies` entry with only an `id` and a `boss` section** — one id space with the
regular enemies, so stage events keep naming "an enemy". The annotated format is in
[`content/enemies/README.md`](../../content/enemies/README.md#bosses-m1-13).

| `boss` field | Default | Meaning |
|---|---|---|
| `code` | — | Shown by the WARNING, e.g. `TW-00` (`A-Z`, `0-9`, `-`; ≤ 8) |
| `displayName` | — | Shown by the WARNING, e.g. `TRIAL WARDEN` (upper case, digits, space `.` `'` `-`; ≤ 24) |
| `introTicks` | 120 (`DEFAULT_BOSS_INTRO_TICKS`) | The invulnerable fly-in (0–600; 0 = the fight starts at once) |
| `score` | 0 | Points at the score tally of the death sequence |
| `x`, `y` | 296, 100 (`DEFAULT_BOSS_X` / `_Y`) | Home of the boss's origin in playfield pixels (where the intro ends) |
| `parts` | — | 1–16 (`MAX_BOSS_PARTS`), **parents first** — later parts are drawn over earlier ones |
| `phases` | — | 1–8 (`MAX_BOSS_PHASES`), in order |

| Part field | Default | Meaning |
|---|---|---|
| `name` | — | Lower-case kebab, unique in the boss |
| `parent` | the origin | An **earlier** part; the part is placed at the parent + its offset |
| `x`, `y` | 0 | Offset from the parent (the plan's `localX` / `localY`), −512 … 512 |
| `hp` | 1 | Hit points (unused by `never` parts) |
| `hurtbox` | none | Half sizes `{ hw, hh }` — also the contact box; without one the part is never hit or touched (decoration) |
| `vulnerable` | `always` | `always` \| `afterParts` \| `whenOpen` \| `never` (armour — a value the plan did not have) |
| `requires` | — | `afterParts` only: the parts that must be destroyed first → `requiresMask` |
| `core` | `false` | The boss dies when **every** core is destroyed (the plan did not say how a boss dies) |
| `gun` | `false` | Where the generic boss behaviours fire from |
| `open` | `false` | Starting state of a `whenOpen` part |
| `sprite`, `anim` | not drawn, 1 frame | Atlas sprite (→ `spriteId`) and its animation `{ frames, ticks }` |
| `score` | 0 | Points for destroying the part |
| `explosion` | `medium` | `small` \| `medium` \| `large` — its explosion event when destroyed |

| Phase field | Meaning |
|---|---|
| `script` | A boss behaviour id (`boss.hover`, `boss.lanes` — [below](#boss-behaviours-corebehaviors)) → `scriptId` |
| `params` | The behaviour's tunables by name (default none) |
| `until` | `hpBelow` (the cores' **total** hit points fall below it), `partsDestroyed` (+ optional `count`, default all of them) and / or `ticks` (the phase has run this long) — **any one** ends the phase. Every phase but the last needs `until`; the last must not have one (it runs until the boss dies) |

**What the loader does** (`completeEnemy` / `completeBoss` while collecting, `core/data`):

- A **regular enemy** must have `hp`, `score`, `hurtbox`, `script`, `sprite` and `drop` — the
  schema made them optional (a boss omits them), so the loader checks them (`is required`) and
  sets `boss: null`.
- A **boss entry** must leave out every other enemy field (`must be omitted for a boss`); the
  loader fills them from the section so every `EnemySpec` keeps one shape: `hp` = the cores'
  total, `score` = `boss.score`, `script` / `sprite` `''` (ids -1), a 1-px `hurtbox`, no mover,
  no drop, `explosion` `large`, `megaCrashImmune` `true`, `settleTicks` 0.
- The section is completed in place: part defaults, `parentIndex`, `requiresMask`, phase
  `params` `{}`, `until` → `partsMask` (0 when absent), `until: null` on the last phase.
- **A bad entry fails its whole file** (like a schema failure): the file contributes nothing.

Reported beyond the schema: duplicate part names; a `parent` that is not an earlier part (itself
included); `requires` on a part that is not `afterParts`, missing on one that is, naming an
unknown part or the part itself (a *later* part is fine — the mask is by index); no `core`, a
core that is `never` or has no hurtbox; `until` missing / present in the wrong place, an `until`
without a condition, `count` without `partsDestroyed` or above its length, unknown or
**repeated** `partsDestroyed` names (a repeat added no bit but counted toward the default
`count`, so the phase could never end — the bug the M1-13 test pass fixed), an `hpBelow` above
the cores' total.

**Where bosses may appear.** Once the references are resolved, `checkBossReferences` reports a
stage `spawn` / `formation` event or an enemy `child` naming a boss (`is a boss: start it with a
"warning" or "boss" event` / `a spawner cannot release it`) and a `warning` / `boss` event naming
a regular enemy (`must name an enemy with a boss section`). The phases' scripts are ordinary
script references, so `knownScripts` checks them; `checkEnemyBehaviors` then checks that each
phase names a **boss** behaviour with known tunables and that no regular enemy names one
([Behaviour checks](#behaviour-checks)).

## The boss system (`core/bosses`)

`createBossSystem(host, behaviors)` is called by `createWorld` (`world.bosses`) with the World as
its `BossHost` (tick, camera, players, ship spec, content, RNG streams, events, debug flags,
bullets, fx, `hitStop`, `status`, the stage runner or `null`, the score board). It builds, once:

- **one `Boss` slot** with its **16 `BossPart`s** — classes, so their numeric fields stay unboxed
  and every method stays monomorphic; one boss per World at a time;
- the **script API** (`BossScriptApi`, one reused object) and the shared fire origin;
- the parts' **sprite batch** (`LayerId.AirEnemies`, 16 sprites) — appended **last** to
  `view.batches`, so the parts draw over the air enemies;
- the **`WarningState`** — the World's `view.warning`;
- a `CompiledBoss` per boss entry of the content: home and intro start positions, the core mask,
  the WARNING text, the phase behaviours and their resolved tunables, and the phase conditions as
  typed arrays (`untilHp`, `untilMask`, `untilCount`, `untilTicks`) — the per-tick code reads only
  these numbers.

### States and the tick

`Boss.state` is a numeric `BossState` (the plan's strings became codes; hashed, append only):

| Code | State | What runs |
|---|---|---|
| 0 | `None` | Nothing — no boss |
| 1 | `Warning` | The WARNING clock; the boss is not in play |
| 2 | `Intro` | The fly-in: parts drawn, touching them kills, **every hit clinks** |
| 3 | `Fight` | Phases, scripts, motion, damage |
| 4 | `Dying` | The death sequence: parts drawn (blinking) until the blast, no hits, no contact |
| 5 | `Dead` | Defeated; a new boss may start |

`BossSystem.active` is `true` from `Warning` to `Dying`. Its part of each tick phase:

| Phase | Call | What |
|---|---|---|
| 3 `stage` | `update()` — **before** the stage runner | The state timers: WARNING pulses → `enter()`, intro → `startFight()`, `phaseTicks++`, the death sequence. Then the stage hooks may start a boss (`startWarning` / `startBoss`) |
| 4 `scripts` | `runScript()` | Resumes the phase's coroutine when it wakes (fight only) |
| 5 `movement` | `move()` | Intro fly-in or fight motion, the camera ride, part transforms, animation frames, hit flash |
| 6 `collision` | `insertColliders(grid)`, `collidePlayers()` | Refreshes each part's `target` / `armoured`, inserts the targets with ids `BOSS_PART_ID_BASE + index`; the ships × parts |
| 7 `damage` | `damagePart()` (from `weapons.applyHits()`), then `resolve()` | Part hits, then the phase changes |
| 9 `fx` | `sync()` | The parts' batch |

Every state timer counts **simulated** ticks: a hit-stop (the final blast's, a player's death)
pauses the WARNING, the intro and the death sequence, as it pauses the player's `dying`.

### Parts and transforms

`enter()` copies the entry's parts into the slots (the unused slots are inactive). Every tick,
`move()` puts the origin at `camera + (screenX, screenY)` — **the boss rides the camera**, its
own motion changes its playfield position — and each part, parents first, at its parent (or the
origin) + `localX` / `localY`: translation only in M1 (rotation is planned). A behaviour may move
a part (`setPartOffset`). A part's `x` / `y` is its centre; its hurtbox is centred there.

**Destroying a part destroys the parts attached below it** (a single forward pass works because
parents come first): each one explodes (`Sfx EnemyExplode*` + `Particles Explosion*` by its
`explosion` size), pays its `score` to the player credited and detaches its lasers. A destroyed
part is no longer drawn, hit or touched.

### Weak points, hits and the clink

Parts share the enemies' hit path. Their ids follow the 64 enemy slots — `BOSS_PART_ID_BASE`
(64) + index, `MAX_HIT_TARGETS` 80 — in the World's grid, in the weapons' hit list and in the
laser sources, so `core/weapons` needs no second collision pass: its grid visitor sends ids ≥ 64
to a part branch, and `applyHits` sends those hits to **`BossSystem.damagePart(index, amount,
by)`**, which answers a `BossHit`:

| Answer | When | The shot |
|---|---|---|
| `None` (0) | No boss in its intro or fight, or the part is inactive / already destroyed (earlier this tick) | Flies on |
| `Clink` (1) | The part cannot take damage **now** — see below | Dies with `SFX Clink` (the weapons push it) |
| `Damaged` (2) | `hp −= amount`, hit flash (`HIT_FLASH_TICKS` 4), `SFX EnemyHit` | A non-piercing shot dies; a piercing one starts its part cooldown |
| `Destroyed` (3) | `hp` reached 0: the part and its children go (above); the last core starts the death sequence | As `Damaged` |

A part **clinks** during the whole intro and, in the fight, when it is `never` (armour),
`afterParts` with a part of its `requires` mask still standing, or `whenOpen` while closed
(`BossScriptApi.setOpen`). `isArmoured(index)` asks the same question live; `BossPart.armoured` is
its phase-6 snapshot, which the weapons read: a piercing shot ignores its cooldown on a clinking
part (like armour on an enemy), so a laser dies on the first armoured part it touches.

Piercing shots keep a **second cooldown table** for the parts, `WeaponSystem.partCooldowns`
(`PIERCE_TABLES` × 16, same table index as the enemies' — whose layout did not change). A
non-piercing shot takes the **lowest** overlapping id, so an enemy in the same box is hit before a
part; the shooter's player is credited (`shooter / SHOOTERS_PER_PLAYER` — an Option's hit is its
player's). Details: [weapons-and-options.md](weapons-and-options.md#hits-phases-67-collide--applyhits).

**Contact.** `collidePlayers()` tests each active, `alive` ship's hurt circle against every
target part's box (closed: touching counts; brute force over ≤ 16 parts) during the intro **and**
the fight and calls `playerHit(ship, Contact, …)` — at most one accepted hit per ship and tick. A
dying boss touches nobody.

### Phases

The boss runs the behaviour of its current phase. `resolve()` (phase 7, **after** the shots'
hits) ends the phase while its condition is met — `coreHp() < hpBelow` (strictly below; a
destroyed core counts 0), at least `count` bits of `partsMask` in `destroyedMask`, or
`phaseTicks ≥ ticks` — and starts the next one; several phases can end in one tick when the next
ones are met too (the last phase never ends). A new phase **replaces the running script**: its
behaviour's `create(api, params)` builds a fresh coroutine whose first wake is the **next** tick.
The first phase's script starts with the fight and runs on the fight's first tick. `phaseTicks`
advances at the start of phase 3. A phase whose `script` the lookup does not know (only possible
without validation) runs no script but still ends on its condition.

### Motion

The boss has its own motion (`Boss.motion`, a `BossMotion` code) instead of the enemy movers —
which keeps `updateMover` monomorphic for the 64 enemies:

| Motion | Set by | Per tick |
|---|---|---|
| `Hold` | `api.hold()`, the default, the end of a `moveTo` | Stays at its playfield position (still riding the camera) |
| `Track` | `api.track(speed, minY, maxY)` (speed ≤ 0 = hold) | Moves `screenY` toward the nearest living player's playfield height at ≤ `speed` px/tick, clamped to `[minY, maxY]` |
| `MoveTo` | `api.moveTo(screenX, screenY, ticks)` (≤ 0 / `NaN` ticks = at once) | Eases (in-out quad) from where it was to the target, then `Hold` |

**The intro.** The boss enters at `startX` — computed at load so the **leftmost part edge** is
`BOSS_ENTRY_MARGIN` (8) px past the right edge of the view (a part without a hurtbox counts as
reaching 8 px left of its centre) — and eases to its home (`x`, `y`) with a cubic ease-out over
`introTicks`. The fight starts at home.

## The WARNING

A stage **`warning`** event (`StageEventCode.Warning`) calls `startWarning(enemyIndex)` — the
WARNING of shmup_feat.md §13, then the boss. A **`boss`** event (`startBoss`) skips the WARNING
and the brake: the boss flies in at once with its music. Either is **ignored** (`false`) while
another boss sequence runs (`active`) and for an index that is not a boss.

| WARNING tick | What (`startWarning`, then `update()`) |
|---|---|
| 0 (the event's tick, phase 3) | Status `playing` → **`bossWarning`** (only from `playing`); `stage.brake(WARNING_BRAKE_TICKS)` (60 — the camera ramps to 0 and locks, [below](#the-brake)); `MUSIC Silence` (fade `WARNING_MUSIC_FADE_TICKS` 30); **`Dim`** (`id` = `WARNING_DIM_PERCENT` 50, `param` = `WARNING_TICKS` 180); the first pulse: `SFX WarningSiren` at the view's top centre with `param` = **`SfxPriority.Critical`**, and `requestFlash(FlashKind.Warning)` (8 ticks) |
| 60, 120 (`WARNING_PULSE_TICKS`) | Another pulse (siren + flash) |
| 180 (`WARNING_TICKS`) | `enter()`: the parts are placed at the intro start, state `Intro`, the WARNING ends (`warning.active = false`), status `bossWarning` → `playing`, `MUSIC` = the stage's `music.boss` (`MUSIC_CUES.Boss` in free flight) |
| 180 + `introTicks` | `startFight()`: at home, phase 0 |

In free flight (`stage: null`) there is no brake and the boss music is `MUSIC_CUES.Boss`.

**The text** (decision D10, shmup_feat.md §26): `WARNING_TEMPLATE` =
`'WARNING!!\nGIANT HOSTILE "{name}"\nCLOSING IN - CODE {code}'` — the game's own paraphrase,
never the arcade original's words (the integration test asserts the arcade phrases are absent).
`formatWarningText(displayName, code)` fills it **once per boss at world creation**; three lines
that fit the 384-px playfield. D10's em dash became `-` because the pixel font is ASCII-only.

**`WarningView`** (the render contract, `WorldView.warning` — `world.bosses.warning`, a live
`WarningState`): `active`, `ticks` (since it started), `duration` (180) and `text` (the current or
last WARNING's; `''` before the first). `text` only changes when another boss's WARNING starts, so
a host puts it into a draw-list string slot on a change and never builds strings per frame.

**The game scene** (`core/scenes` `GameScene.drawUi`, the scene flow — M1-16) and the
`?scene=flight` dev scene (`@shmup/shell` `flight`, which drew it first in M1-13) draw it the same
way in their UI list: a translucent black band
(alpha 144) across the playfield at screen rows 76–123 with 1-px red (`0xf85858`) edges, the text
centred at row 85, red and yellow (`0xf8d030`) alternating every 16 ticks. The list is rebuilt
only when the WARNING starts, ends or changes colour (the game scene bumps its `uiRevision` then;
the pause menu drawn over it freezes the colour with the World). Since M1-14 the renderer draws the `Dim`
event as a playfield dim (50 %, fading in over 8 ticks and out over 16 after the 180-tick hold —
over the world layers, under the flash, the band and the HUD) and each pulse's `Flash` as a red
flash (`0xf85858`, 0.35) ([fx-and-game-feel.md](fx-and-game-feel.md)). Since M1-15 the siren is
heard — one 0.92-s wail per pulse, `critical`, centred, never stolen (a new pulse restarts the
last) — and the stage theme fades out over the WARNING's 30-tick `Silence`
([audio.md](audio.md#which-event-plays-what)).

### The brake

`StageRunner.brake(ticks)` (`core/stage`, new in M1-13) is how the WARNING stops the camera
wherever it is — unlike a `lock: true` camera key, which stops it at a fixed x:

- the speed ramps **linearly to 0** over `ticks` ticks (a fractional ramp is floored; `ticks ≤ 0`
  = stopped and locked at once), then the camera is **locked** (`runner.locked`);
- camera keys and `speed` events the camera still reaches while braking or locked keep their
  pans and lock keys but only **record their speed** (`StageSlot.ResumeSpeed`) instead of
  changing the target;
- **`unlock()`** releases the lock and the brake together: the speed ramps back up over the same
  ramp to the speed the stage asks for by now (the recorded one) — also when called before the
  camera stopped; a lock key met while braking is released by the same call;
- a second brake while one holds changes nothing; `restartAt` forgets the brake.

Three state slots were appended (`Braking` 19, `ResumeSpeed` 20, `BrakeRamp` 21;
`STAGE_STATE_SLOTS` 19 → 22), so the brake is hashed with the rest of the runner
([stage-runtime.md](stage-runtime.md#the-brake-m1-13)). The death sequence calls `unlock()` at its
end.

## The death sequence

When the last core is destroyed (by a shot in phase 7, a cascade from its parent, or
`defeat(by)`), `startDeath(by)` runs at once: state `Dying`, `killer = by`, the script dropped, the
motion held, every part's lasers detached, **`bullets.cancelAll(CancelMode.Sparkle)`** (every
cancelable enemy bullet and laser, with sparkles), `MUSIC Silence` with a
`BOSS_MUSIC_FADE_TICKS` (60) fade and a small shake for `BOSS_CHAIN_TICKS`. Then, in simulated
ticks of the `Dying` state (counted in phase 3 from the next tick):

| Dying tick | What |
|---|---|
| 8, 16 … 112 (`BOSS_CHAIN_INTERVAL` 8, until `BOSS_CHAIN_TICKS` 120) | A **chain explosion**: `Particles FX_CUES.BossChain` (6) + `SFX BossExplode` at a random point inside a random part's box (a part without a hurtbox: ± 8 px) — drawn from the **cosmetic** RNG, so the gameplay stream never moves |
| 1 … 119 | The parts blink (`SpriteFlag.Flash` every other 4 ticks) |
| 120 | The **final blast**: `Particles FX_CUES.BossBlast` (7) + `SFX BossExplode` (`SfxPriority.High`) at the origin, `Rumble` (param 2) per active player, `requestFlash(FlashKind.BossBlast)` (24 ticks), `requestShake(Large, BOSS_BLAST_SHAKE_TICKS 40)`, **`requestHitStop(BOSS_BLAST_HIT_STOP_TICKS 5)`**; the parts are no longer drawn (`boss.blasted`) |
| 121 (`BOSS_TALLY_TICKS`, the first after the hit-stop) | The **tally**: `addScore(killer, boss.score)` (nothing when `killer` is -1), `SimEventKind.BossDefeated` (`id` = the boss's enemy index, `x` / `y` = the origin, `param` = the points), `MUSIC StageClear` (the jingle) |
| 180 (`BOSS_CLEAR_TICKS`) | State `Dead`; status **`stageClear`** (from `playing` / `bossWarning` — a `gameOver` stays); `stage.unlock()` |

With the blast's 5-tick hit-stop, `stageClear` comes **185 World ticks** after the killing tick.
The stage then scrolls on to its `end` event (which sets `stageClear` again — harmless).

## Boss behaviours (`core/behaviors`)

Boss behaviours are a **second roster** next to the enemy one: `BossBehaviorDef` (`id`, `params`
with defaults, `create(api, params) → Script`), `defineBossBehavior`, `createBossBehaviorRegistry`
(throws for a duplicate id), `DEFAULT_BOSS_BEHAVIOR_DEFS`, `DEFAULT_BOSS_BEHAVIORS`,
`BOSS_BEHAVIOR_IDS` — which joined `KNOWN_SCRIPT_IDS`, the content's one script table. The World
takes `WorldOptions.bossBehaviors` (default `DEFAULT_BOSS_BEHAVIORS`); `EMPTY_BOSS_BEHAVIORS`
knows nothing (bosses then run no script — tests, tools).

They drive the boss through the **`BossScriptApi`** — one reused object (D29):

| Member | What |
|---|---|
| `self`, `tick`, `rng` (gameplay), `phase`, `partCount`, `bullets` | The boss, the clock, the stream, the current phase, the raw bullet system |
| `target()` | The nearest living player to the origin, or `null` |
| `partIndex(name)` | A part's index — compares strings, so **look names up once** when the script starts |
| `isDestroyed(i)`, `setOpen(i, open)`, `setOpenAll(open)`, `setPartOffset(i, x, y)` | Part state (a bad index counts as destroyed / is ignored) |
| `hold()`, `track(speed, minY, maxY)`, `moveTo(x, y, ticks)` | [Motion](#motion) |
| `canFire(i)` | The boss fights (not intro, not dying) and part `i` stands |
| `fireWait(ticks)` | `rankedWait` — an interval scaled by the rank |
| `aimed`, `nWay`, `ring`, `spray`, `laser` | The `core/patterns` primitives from part `i`'s centre (rank-scaled, `AIM_AT_TARGET` default angles); no-ops (`-1` / `0`) while `canFire(i)` is false. `laser(i, …, attach = true)` stays attached to the part (its laser-source id is the part's hit id) and stops when the part goes; `attach = false` leaves it where it was fired (a lane) |

The M1 roster fires from the boss's **`gun` parts that still stand**:

| Behaviour | Tunables (defaults) | What it does |
|---|---|---|
| `boss.hover` | `trackSpeed` 0.5, `margin` 32, `fireTicks` 60, `bulletSpeed` 1.5, `ways` 1, `spread` 40, `openTicks` 0, `closedTicks` 120 | Tracks the nearest player's height (`margin` px from the playfield's top and bottom); every `fireTicks` (rank-scaled) each gun fires an aimed `ways`-way spread of round red bullets; with `openTicks` > 0 its `whenOpen` parts open for `openTicks` after every `closedTicks` closed (0 = never — and it closes a part the data left open) |
| `boss.lanes` | `trackSpeed` 0 (holds still), `margin` 32, `laserTicks` 150, `laserLength` 384, `laserWidth` 6, `telegraph` 50, `active` 45, `fireTicks` 90, `bulletSpeed` 1.25, `ways` 3, `spread` 40 | Every `laserTicks` the next standing gun in turn fires a telegraphed horizontal laser to the left in its lane (not attached); every `fireTicks` each gun an aimed `ways`-way of purple needles |

`boss.hover` closes every `whenOpen` part when its phase starts (so a new hover phase closes what
the last one opened — on its first tick, the tick after the change); `boss.lanes` leaves them as
they are. HALCYON BULWARK's own behaviours come with zone A in M1-18.

**Writing one** follows the enemy rules ([enemies-and-behaviors.md](enemies-and-behaviors.md#behaviours-corebehaviors)):
read the API and look part names up once at the start, `yield` tick counts (sleep until the next
decision, never `yield 1` loops), no allocation between yields, and keep generator locals whole
numbers — `boss.hover` keeps its "never" timer a small integer (`0x3fffffff`), because an
`Infinity` local is a heap number and `toggleIn -= wait` allocated one per wake.

```ts
import { BulletKind, defineBossBehavior } from '@shmup/core';

const sitter = defineBossBehavior('boss.sit', { fireTicks: 60 }, function* (api, p) {
  const core = api.partIndex('core'); // once, at the start
  for (;;) {
    yield api.fireWait(p.fireTicks);
    api.aimed(core, 1.5, BulletKind.RoundRed);
  }
});
```

### Behaviour checks

`checkEnemyBehaviors(db, registry?, bossRegistry?)` gained the boss side: every boss phase's
`script` must be a boss behaviour (an enemy behaviour there is `enemies:<id>.boss.phases[<p>].script
"…" is an enemy behaviour, not a boss behaviour`), a phase's `params` must be its tunables
(`…boss.phases[<p>].params.<name>`), and a regular enemy naming a boss behaviour is
`enemies:<id>.script "…" is a boss behaviour (use it in a boss phase)`. The shell's loader and
`pnpm content:check` run it.

## The test boss and `?stage=test-boss`

`content/enemies/test-boss.enemies.json` — **TRIAL WARDEN**, code **TW-00** (tally 20,000,
intro 120, home 300 / 100) — exercises every mechanic with the placeholder boss sprites
(`bosses/hull-block`, `core`, `shield-plate`, `emitter`):

| Part | Parent, offset | HP | Rule | Score |
|---|---|---|---|---|
| `hull` | origin | — | `never` (armour) | — |
| `hull-top`, `hull-bottom` | `hull`, y ∓16 | — | `never` | — |
| `vent` | `hull`, x +14 | 6 | `whenOpen` | 800 |
| `core` (**core**, large explosion, 2-frame pulse) | `hull`, x −14 | 24 | `afterParts`: `plate-top`, `plate-bottom` | 5000 |
| `plate-top`, `plate-bottom` | `hull`, x −26, y ∓8 | 10 | `always` | 500 each |
| `gun-top`, `gun-bottom` (**guns**) | `hull-top` / `hull-bottom`, x −10, y ∓12 | 12 | `always` | 1000 each |

Phases: `boss.hover` (track 0.5, fire every 70, the vent open 60 every 120 closed) until **one
plate** is destroyed (`partsDestroyed` both plates, `count` 1) → `boss.hover` (track 0.75, fire
every 50, 3-way) until the core's HP is **below 12** → `boss.lanes` (track 0.25) to the end.

`content/stages/test-boss.stage.json` — **BOSS RANGE**: open space, 1200 px, speed 1, star
parallax, two capsule carriers at x 40 / 120, the **`warning`** at x 300 (about 5 s in), `end` at
1200. Fly it with `pnpm dev` and http://localhost:5173/?stage=test-boss (add `&loadout=full` to
fight it fully powered). The example warden (`example.enemies.json`, EXAMPLE WARDEN, EW-00)
became a boss too, and the sample stages lost their redundant `boss` / `music` events — the
`warning` brings the boss and its music. Zone A's real boss (HALCYON BULWARK, HB-01) comes with
M1-18.

## World integration

- **Stage hooks.** `warning` → `bosses.startWarning(event.enemyId)`, `boss` →
  `bosses.startBoss(event.enemyId)` (`createWorldStageHooks`).
- **The enemy system never spawns a boss entry** (`EnemySystem.spawn` returns `null` for one — a
  `boss` column in its compiled spec table), and its grid ids stay below 64, so its contact test
  skips the parts.
- **Mega Crash leaves the boss alone** — the parts are not enemy slots, and the entry is
  `megaCrashImmune` anyway.
- **Laser sources.** `BulletHost` gained an optional `laserSources`; the World's
  `laserSources` lists the 64 enemies, then the 16 parts, so `fireLaser(…, src)` can attach a
  laser to either (`detachLasers(part.slot)` when the part goes).
- **Checkpoint clear.** `clearSession` (a checkpoint restart, the `arcade` respawn) calls
  `bosses.clear()`: the boss and the WARNING are removed, `bossWarning` becomes `playing`, and —
  when the boss sequence had changed the music — the stage theme is queued again. The camera
  lock of the brake is forgotten by `restartAt`; the `warning` event re-fires when the camera
  reaches it again. A restart during the death sequence removes the boss and releases the lock.
- **Deaths.** A player's death (`classic` / `casual`) changes nothing for the boss — it cancels
  the bullets and the fight goes on. Game over can come during `bossWarning` (M1-12 sets it from
  `playing` / `bossWarning`), and a `gameOver` status survives the end of the death sequence. The
  `arcade` restart clears the boss (above).
- **The view.** The boss batch is the last of `view.batches`; `view.warning` is the
  `WarningState`.

## Presentation events

| When | Events (`x` / `y` whole pixels) |
|---|---|
| WARNING start | `Music Silence` (param 30), `Dim` (`id` 50, param 180) |
| WARNING pulse (ticks 0 / 60 / 120) | `Sfx WarningSiren` (param `SfxPriority.Critical` 4), `Flash` (`id` `FlashKind.Warning` 1, param 8) |
| Boss enters | `Music` = the stage's boss cue (`MUSIC_CUES.Boss` in free flight) |
| Part hit / destroyed | `Sfx EnemyHit`; `Sfx EnemyExplodeSmall/Medium/Large` + `Particles ExplosionSmall/Medium/Large` (param 1) |
| A shot clinks | `Sfx Clink` (pushed by `core/weapons` at the shot, at most once per cue every 4 ticks like its other SFX) |
| Last core | `Particles BulletCancel` sparkles (the cancel), `Music Silence` (param 60), `Shake` (small) |
| Chain | `Particles BossChain` (6) + `Sfx BossExplode`, every 8 ticks |
| Final blast | `Particles BossBlast` (7), `Sfx BossExplode` (param `SfxPriority.High` 3), `Rumble` per active player (param 2), `Flash` (`id` `FlashKind.BossBlast` 2, param 24), `Shake` (large, 40), `HitStop` (5) |
| Tally | `BossDefeated` (11: `id` = enemy index, `param` = points), `Music StageClear` |

New codes (append-only): `SimEventKind.Dim` (10) and `BossDefeated` (11) with their
`SIM_EVENT_KIND_NAMES`; `SfxPriority` (`Default 0, Low 1, Normal 2, High 3, Critical 4`) — a hint
in an `Sfx` event's `param` that the SFX player of M1-15 uses as the sound's tier (`Default` =
the cue's own priority); `FX_CUES.BossChain` (6), `BossBlast` (7); `FlashKind.Warning` (1, 8 ticks) and
`BossBlast` (2, 24 ticks) in `FLASH_KIND_TICKS`. Since M1-14 the particles (`boss.chain` for
each chain explosion; `explosion.large` + `boss.chain` + `debris` for the blast), the large shake,
the white blast flash, the dim and the popups (a white one per destroyed part with a score —
`core/bosses` pushes a `SimEventKind.Score` for it — and the gold tally from `BossDefeated`) are
drawn ([fx-and-game-feel.md](fx-and-game-feel.md)); since M1-15 the chain and the blast are
heard (`BossExplode`, the blast with a `High` hint), the boss theme starts with the intro, fades
out over 60 ticks at the kill and the stage-clear jingle plays at the tally
([audio.md](audio.md)); rumble comes with the gamepad work.

## Determinism and hashing

`hashWorld` (`core/debug`) mixes, after the effect timers and scores, `mixBosses`: the boss's
state, spec index, position (world and playfield), state and phase timers, phase, script present
+ wake tick, motion and its parameters, destroyed mask, killer, blast flag, part count, and per
part its offset, position, hit points, destroyed / open flags and hit flash; then the WARNING's
active flag and ticks. The piercing shots' part cooldown tables join their enemy tables in
`mixWeapons`; the brake's slots are in the runner's hashed state. A coroutine's position cannot be
hashed — its `wakeTick` is. The chain explosions draw the cosmetic stream only, so they never move
the gameplay RNG. `bosses.test.ts` and `test/integration/boss-runtime.test.ts` fight the shipped
boss in two lockstep worlds.

## Zero allocation and the hot-path rules

Everything is built by `createBossSystem`; the per-tick methods only write numbers. As with the
enemies (D29), starting a phase creates its generator and every wake allocates the generator's
`{ value, done }` result — so boss scripts sleep between decisions. `bosses-alloc.test.ts` (own
worker):

| Guard | Measured | Budget |
|---|---|---|
| A long fight (parts hit, clinks, lasers, tracking, phases), 10,000 ticks | ≈ 39 KB | 64 KB |
| Each timed state held (WARNING, intro, death chain) | ≈ 18–30 KB | 64 KB |
| Whole WARNING → intro → fight → death sequences every ~500 ticks | ≈ 70 KB | **128 KB** |

The last guard has its own budget: the once-per-boss code (a new phase's generator, part
explosions, the chain's RNG draws, the lukewarm part branch of the shots' grid visitor) partly
runs in V8's lower tiers, which box doubles — found with the in-process sampling heap profiler.
The per-tick guards stay within the usual 64 KB.

| Rule | Why |
|---|---|
| The intro's cubic ease-out and `moveTo`'s in-out quad are written inline | Calling `EASINGS.*` boxed the fractional argument and result |
| `collidePlayers` inlines `circleAabb`, `sync` inlines `pushSprite` | Fractional arguments to a non-inlined call are boxed |
| Grid bounds and every event position are whole pixels (`Math.floor(x) \| 0`, `Math.ceil(x) \| 0`) | The M1-08 / M1-10 lessons |
| `Boss`, `BossPart`, `WarningState` and the system are classes; phase conditions are typed arrays | Unboxed number fields, monomorphic methods; the tick never reads content objects |
| Generator locals stay small integers (`boss.hover`'s `NEVER_TICKS`) | An `Infinity` or fractional local is a heap number, re-allocated by every `-=` |

## Using it headlessly

```ts
import { BossState, createGame, createHeadlessPlatform, hashWorld } from '@shmup/core';

const game = createGame(createHeadlessPlatform(), { stage: 'test-boss', loadout: 'full' }, db);
game.world.debugFlags.godMode = true; // the boss's bullets must not end an unattended run
const { bosses } = game.world;
while (!bosses.warning.active) game.step(); // ~5 s: the camera reaches the warning event
bosses.warning.text; // 'WARNING!!\nGIANT HOSTILE "TRIAL WARDEN"\nCLOSING IN - CODE TW-00'
game.world.status; // 'bossWarning'
while (bosses.boss.state !== BossState.Fight) game.step(); // WARNING 180 + intro 120 ticks
bosses.defeat(0); // a tool: every core destroyed, player 1 credited → the death sequence
for (let i = 0; i < 185; i++) game.step();
game.world.status; // 'stageClear' — and the camera scrolls on
hashWorld(game.world); // covers the boss, its parts and the WARNING
```

`bosses.startBoss(db.enemyIndex.get('test-boss')!)` brings a boss in without a stage event (tests,
free flight).

## Extending it

| To add… | Do this |
|---|---|
| A boss | An `enemies` entry with a `boss` section ([format](../../content/enemies/README.md#bosses-m1-13)), its sprites, a stage `warning` event; `pnpm content:check`. Fly it with `?stage=<id>` |
| A boss behaviour | `defineBossBehavior(id, params, function* (api, p) { … })` in `core/behaviors`, added to `DEFAULT_BOSS_BEHAVIOR_DEFS` (it joins `BOSS_BEHAVIOR_IDS` / `KNOWN_SCRIPT_IDS` by itself); follow the coroutine rules; tests beside `bosses-behaviors.test.ts` |
| A fire primitive or part action for scripts | A `BossScriptApi` member + `BossScriptApiImpl` method; respect `canFire`; never allocate |
| A phase condition | A field in `BossUntilSpec` + `BOSS_PHASE_SCHEMA` + its check in `completeBoss`, a typed array in `CompiledBoss`, the test in `phaseOver` |
| A weak-point rule | Append to `BOSS_VULNERABILITIES` and `BossVulnerable` (never renumber), the branch in `armouredNow` |
| Boss timers / escapes, the HP bar, mid-bosses, raids, multi-bosses (M2-09) | New `BossState`s appended (hashed); a second slot means a second parts id range after `BOSS_PART_ID_BASE + 16` (raise `MAX_HIT_TARGETS`, the laser sources, the part cooldown tables) |
| Rotating parts | A per-part angle in `place()` (binary angles, `sinB` / `cosB`), hurtboxes as rotated boxes or circles |

## Tests

| Where | Covers |
|---|---|
| `packages/core/test/bosses/bosses.test.ts` | The plan's acceptance: the WARNING (status, siren pulses, flashes, dim, music stop, brake to a lock), the eased fly-in and part transforms, drawing and hit flash, weak-point gating (intro, armour, `afterParts`, `whenOpen`), phase changes by part mask, HP and timer (several in one tick), cascades paying every part, the death sequence timing (cancel, chain, blast + hit-stop, tally, `stageClear`), score to the right players, contact, attached part lasers, the `boss` event and one boss at a time, no enemy spawn / Mega Crash, checkpoint clear and the arcade restart, lockstep determinism |
| `packages/core/test/bosses/bosses-edge.test.ts` | The script API (lookups, bad indices, open / close, offsets, track bounds, `moveTo` easing and at-once, `canFire` per state, the primitives, attached / lane lasers), tunables merged over defaults, unknown phase scripts, cascades and several cores, `defeat`, the WARNING in free flight and from other statuses, hit-stop pausing the WARNING and the chain, cosmetic-only RNG inside the boxes, the dying blink, a second boss, a restart while dying, `clear()` music, `hashWorld` coverage, shots vs parts (enemy first, Option credit, a part gone mid-tick) |
| `packages/core/test/bosses/bosses-behaviors*.test.ts` | The roster: registration next to the enemy roster, `boss.hover` spreads / tracking / open-close, `boss.lanes` lanes and spreads, `checkEnemyBehaviors` for boss phases; `ways` flooring, default `openTicks`, a new phase closing parts, lanes between standing guns only, separate registries |
| `packages/core/test/bosses/bosses-alloc.test.ts` | The allocation guards above (own worker) |
| `packages/core/test/data/bosses-data*.test.ts` | Completion (defaults, indices, masks, the regular fields), phase scripts as script refs, the section schema, the omitted / required fields, the reference pass; self-parents, limits and boundary values, several cores, later `requires`, duplicate `partsDestroyed` names (the regression), unknown section fields |
| `packages/core/test/stage/stage-brake*.test.ts` | The brake: hashed slots, linear deceleration then lock, recorded resume speeds, `brake(0)`, restart forgets it; fractional ramps, a running ramp's target, unlock mid-brake, pans under the lock, a lock key met while braking, a brake from a standstill |
| `packages/core/test/{data,debug,events,world,behaviors}/`, `test/integration/{content,enemies-runtime,stage-runtime}.test.ts` | Adapted suites: the warden fixtures are bosses, the new event / flash codes, the batch count, the reference hash, shipped-stage runs defeat the boss |
| `packages/shell/test/flight/flight.test.ts` | The WARNING band in the UI list, its colours, rebuilt only on changes |
| `test/integration/boss-runtime.test.ts` | The fully powered KESTREL shoots the shipped TRIAL WARDEN down through all three phases to `stageClear` via `createGame`, with the host's event order and timing; the `WarningView` in the render contract with original wording; two sessions in lockstep through the fight |
| `test/e2e/boss.spec.ts` | In Chromium on `?stage=test-boss`: the WARNING band for three seconds, then the boss's hull colour in the right part of the playfield; no console errors or atlas warnings |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| `enemies[i].hp: must be omitted for a boss` | A boss entry names only `id` and `boss`; everything else comes from the section |
| `enemies[i].script: is required` after adding a regular enemy | The loader, not the schema, checks a regular enemy's `hp`, `score`, `hurtbox`, `script`, `sprite`, `drop` |
| A whole enemies file vanished from the database | One bad entry (a boss section issue included) fails its file, like a schema failure — read the issues |
| `events[n].enemy: is a boss` | Bosses come through `warning` / `boss` events only, never `spawn` / `formation` / `child` |
| A phase never ends | `hpBelow` is strict (below, not at); `count` defaults to the whole `partsDestroyed` list; a `never` part can never be destroyed — do not list it |
| Every shot at the boss dies without damage | The intro (every hit clinks), armour, an `afterParts` part whose shields stand, or a closed `whenOpen` part. `bosses.isArmoured(i)` tells which |
| The laser stops at the boss's front | A clinking part kills a piercing shot too (like armour) |
| A part's laser vanished | Attached lasers stop when their part is destroyed; fire with `attach = false` for a lane |
| The boss never fires | Its phase scripts fire from `gun` parts only (the generic roster); destroyed guns stop firing; nothing fires during the intro or the death |
| `startWarning` returned `false` | Another boss sequence runs, or the index is not a boss |
| The camera stopped for good | A WARNING's brake waits for the boss's death (`unlock()` at dying tick 180); a checkpoint restart forgets it |
| The WARNING / death timings are longer than the constants | A hit-stop pauses them (simulated ticks); the blast's own hit-stop makes `stageClear` 185 World ticks after the kill |
| The boss score is 0 at the tally | `defeat()` without a player credits nobody (`killer` -1) |
| `rng.gameplay.callCount` does not move during the death chain | Intended: the chain's positions come from the cosmetic stream, so a boss death never shifts the gameplay sequence |
| `WarningView.text` is empty | Nothing started a WARNING yet — it is set at the first `startWarning` |
| No siren, no boss music | In a browser nothing plays before the first key press or click (autoplay policy); a custom scene must connect the World's events (`connectAudioEvents`); a boss theme the stage names must be prepared with the stage (`stageMusicCues`, not the fixed `STAGE_MUSIC_CUES`) — see [audio.md](audio.md#gotchas) |
| The screen does not dim or flash in a custom scene | Only free flight connects the World's events to the renderer (`connectFxEvents`) — see [fx-and-game-feel.md](fx-and-game-feel.md#gotchas) |
| An allocation guard creeps up after touching the boss code | A fractional argument to a non-inlined call, a non-integer generator local, or content read per tick — see the rules above; whole-sequence guards run partly unoptimised and have 128 KB |

## Next steps that build on this page

- **M1-14** (done) — the particles (`boss.chain`, explosions, cancel sparkles), shake, flash,
  the WARNING dim and the part / tally popups drawn from the events
  ([fx-and-game-feel.md](fx-and-game-feel.md)).
- **M1-15** (done) — the siren (critical priority), the boss theme, the music stop and fade,
  the stage-clear jingle ([audio.md](audio.md)).
- **M1-16** (done) — the scene flow: 90 World ticks after `stageClear` the stage-clear screen
  (tally, `TO BE CONTINUED`, the title), the WARNING band drawn by the game scene, the HUD
  ([scenes-and-ui.md](scenes-and-ui.md)).
- **M1-18** — zone A's boss, HALCYON BULWARK (HB-01), with its own behaviours.
- **M2-09** — boss timers and escapes, the optional HP bar, mid-bosses, battleship raids,
  boss-inside-boss, double bosses, boss rush.

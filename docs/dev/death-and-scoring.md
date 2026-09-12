# Death, respawn, lives, score and hit-stop

How a session's **life cycle** works inside `@shmup/core`: a hit that gets through to a ship
becomes the **death sequence** (explosion and debris events, hit-stop, shake, bullet cancel, the
music duck, a life gone), the **death penalty** of `config.deathPenalty` (decision D6), the dead
time, the **respawn** fly-in with its invulnerability blink, the **arcade** restart at the last
checkpoint, **game over**, the per-player **score** with the session hi-score (`core/scoring`) and
the sim-side **game-feel timers** — hit-stop, shake, flash (`core/fx`). Built in plan step
**M1-12**; `core/player` is implemented for P0 with it.

This page is the *how and why*. Exact signatures are in
[api-reference.md](api-reference.md#player--the-player-ship-implemented-for-p0) (`player`),
[`fx`](api-reference.md#fx--hit-stop-shake-and-flash-requests-partial),
[`scoring`](api-reference.md#scoring--scores-and-the-session-hi-score-partial) and
[`world`](api-reference.md#world--the-gameplay-session-and-the-tick-pipeline); the TSDoc in
`packages/core/src/{world,player,powerups,fx,scoring}/index.ts` is the authoritative reference.
The tick pipeline and `playerHit` are [sim-world.md](sim-world.md); the Force Field that takes a
hit first is [powerups-and-shields.md](powerups-and-shields.md); checkpoints and `restartAt` are
[stage-runtime.md](stage-runtime.md#checkpoints); the bullets a death cancels are
[bullets-and-patterns.md](bullets-and-patterns.md).

Background: `shmup_feat.md` §10 (death, respawn, checkpoints, the three penalty presets), §15
(score, hi-score, lives), §18 (hit-stop, screen shake, flash), §19 (music ducking), §2 (the death
penalty options); plan §3.2 (tick phases) and decisions **D6** (Classic is the default penalty:
one level, the shield, cursor kept, respawn in place; Arcade and Casual selectable) and **D8**
(the Force Field does not absorb terrain).

## The picture at a glance

```text
tick t   6 collision   playerHit(ship, cause, t, debug) → shield first (M1-11), else record
                       hitCause / hitTick = t / hits++ — the ship stays 'alive' for phase 6
         7 damage      weapons.applyHits() → powerups.resolve() → scoring.resolve()
                       → for every active 'alive' ship with hitTick === t: killShip(world, slot)
                           killPlayer: 'dying', lives − 1, invulnTicks 0
                           Sfx PlayerDeath, Particles ExplosionLarge + Debris, Rumble, MusicDuck
                           requestHitStop(8), requestShake(Medium, 20)
                           bullets.cancelAll(Sparkle)            (enemy bullets and lasers)
                           applyDeathPenalty(config.deathPenalty, …)
         9 fx          tickFx (shake / flash not counted on their request's tick)
t+1…t+8  frozen        only phases 1 and 9 run; tickFx counts the hit-stop down
t+9…t+32 2 players     updatePlayer: 'dying' 24 ticks (the ship stays where it was hit)
t+33…    2 players     'dead' 60 ticks
t+92     2 players     lifecycleSystem: lives > 0 → respawnShip  (arcade: stage.restartAt first)
                                        lives = 0 on every active ship → status 'gameOver'
t+93…    2 players     'respawning' fly-in (40 ticks), blinking, input ignored
t+132    2 players     'alive', invulnTicks = respawnInvulnTicks (150) → vulnerable from t+282
```

The numbers are the KESTREL's (`enterTicks` 40, `respawnInvulnTicks` 150) and the engine's
(`DEATH_HIT_STOP_TICKS` 8, `PLAYER_DYING_TICKS` 24, `PLAYER_DEAD_TICKS` 60): a death takes the
ship out of control for 132 ticks (2.2 s), and it is safe for another 150 (2.5 s).

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `deathPenalty` | `'classic'` (D6) | `'classic'` \| `'arcade'` \| `'casual'` — see [Penalties](#the-death-penalty-d6). Not validated at runtime (the type covers it): any other string behaves like `'casual'` |
| `startingLives` | `3` | Ships at the start **including the one in play** (1–5, validated). The HUD shows `lives − 1` in stock |

Tunables of the ship (`content/player/kestrel.player.json`, `PlayerShipSpec`): `enterTicks` (40,
the fly-in) and `respawnInvulnTicks` (**150** since M1-12 — 120 before; `DEFAULT_PLAYER_SHIP`
matches). No app exposes the two config fields yet: the web and TV builds play `classic` with 3
ships; the Options menu of M1-17 / M2-16 will offer them.

## The death sequence

**Where it happens.** `playerHit` (`core/player`) still only *records* a hit: every system of
phase 6 — enemy contact, bullets, lasers, terrain, pickups — sees the same `alive` ships, and the
bullet that hit is used up. Phase 7 turns a hit recorded **this tick** (`hitTick === world.tick`
and a cause other than `None`) into the death, **after** the shots' hits, the power-ups and the
tick's score. So on the tick of a death:

- a kill the ship's shots made and a capsule it touched still score;
- a capsule it touched still advances the meter — and the `arcade` penalty then resets it;
- a pending Mega Crash still detonates;
- two hits on one ship (a bullet and a laser, or contact and terrain) cost one life —
  `killShip` only runs for `alive` ships, and `killPlayer` ignores `dying` / `dead` ones.

**A shield first.** A Force Field absorbs bullets, lasers and contact inside `playerHit` (M1-11) —
no hit is recorded, nobody dies. Terrain passes the Force Field (D8) and its i-frames, so a
terrain death takes the shield with it (every penalty clears it).

**`killShip(world, slot)`** (`core/world`, cold code — deaths are rare):

| Step | What | Where |
|---|---|---|
| 1 | `killPlayer(ship)`: `dying` (timer 0), `lives − 1` (never below 0), `invulnTicks` 0, level, not moving | `core/player` |
| 2 | `Sfx PlayerDeath` (8), `Particles ExplosionLarge` (2) and `Particles Debris` (5, new) with param 1, `Rumble` (`id` = slot, param 1), `MusicDuck` (9, new: `id` = slot, param `DEATH_MUSIC_DUCK_TICKS` 120) — all at the ship, whole pixels | `core/events` |
| 3 | `requestHitStop(world, DEATH_HIT_STOP_TICKS)` (8) → `HitStop` event | `core/fx` |
| 4 | `requestShake(world, ShakeMagnitude.Medium, DEATH_SHAKE_TICKS)` (2 px, 20 ticks) → `Shake` event | `core/fx` |
| 5 | `bullets.cancelAll(CancelMode.Sparkle)`: every **cancelable** enemy bullet and every enemy laser goes, with `BulletCancel` sparkles at up to 64 of them; bullets without `BulletFlag.Cancelable` survive | `core/bullets` |
| 6 | `applyDeathPenalty(config.deathPenalty, ship, loadout, meter)` | `core/powerups` |

Two ships hit on the same tick both die: one hit-stop (the requests do not add up — the longer
wins), one shake (an equal shake is not restarted), a duck and a rumble each.

**Dying and dead.** `updatePlayer` (phase 2) leaves a `dying` ship where it was hit and turns it
`dead` after `PLAYER_DYING_TICKS` (24) of its own updates — the hit-stop comes on top, because
phase 2 does not run while frozen. `dead` only counts its timer. `syncWorldView` draws neither,
and the Options and the Force Field hide with the ship. The camera keeps scrolling (outside the
hit-stop), the enemies keep flying and firing.

## Respawn and invulnerability

`lifecycleSystem` runs in phase 2 right after the ships' `updatePlayer` (so the fly-in's first
tick is the next one):

1. Every active ship that is `dead`, has served `PLAYER_DEAD_TICKS` (60) and has a life left is
   respawned (`respawnShip`).
2. When every active ship is out (`playerOut`: `dead`, dead time over, `lives` 0) and the status
   is `playing` or `bossWarning`, the status becomes **`gameOver`**.

**`respawnPlayer(ship, spec, camera)`** starts a `respawning` fly-in exactly like the stage-start
`entering` one: from camera-relative `ENTER_START_X` (−24, off-screen left) at `SPAWN_Y` (mid
height) to `ENTER_END_X` (64) on a cubic ease-out over `enterTicks`, input ignored, riding the
scroll. Every respawn flies in **from the left edge of the current view** — with `classic` /
`casual` the stage never scrolls back. `invulnTicks` is set to `enterTicks + respawnInvulnTicks`
so the ship blinks from the start of the fly-in (`syncWorldView`: hidden while `invulnTicks & 4`),
and the tick the fly-in ends `updatePlayer` sets it to **exactly** `respawnInvulnTicks` — the 150
ticks start when control returns, whatever the fly-in length. A stage-start `entering` fly-in
grants no invulnerability (the fly-in itself cannot be hit: `playerHit` ignores ships that are
not `alive`).

While `invulnTicks > 0`, `playerHit` ignores the ship (bullets pass and **stay**, contact and
terrain do nothing) — but it is `alive`, so it moves, collects capsules and **fires** (weapons only
need `alive`). Lives are not touched by the respawn: the death took one.

## The death penalty (D6)

`applyDeathPenalty(preset, ship, loadout, meter)` (`core/powerups` — `core/player` cannot import the
weapon values without an import cycle) runs **at the death**, step 6 above:

| Preset | Shield | Loadout | Speed | Meter cursor | Where the ship comes back |
|---|---|---|---|---|---|
| `classic` (default) | lost | `loseOneLevel`: one level | (the last step of `loseOneLevel`) | kept | fly-in at the current scroll |
| `arcade` | lost | basic shot, no Missile, no Options | level 0 | `-1` | the stage restarts at its last checkpoint, then the fly-in |
| `casual` | lost | kept | kept | kept | fly-in at the current scroll |

**`loseOneLevel(ship, loadout)`** takes the first the ship has, in the D6 order: an **Option**
(−1) → the **Double or Laser** (back to `MainWeapon.Basic`) → the **Missile** → one **speed
level** — and returns the `MeterSlot` it took (`Double` / `Laser` for the main weapon), or `-1`
when the ship is already bare. So a fully powered ship loses its four Options over four deaths,
then its laser, missile and speed levels. The shield is cleared with `clearShield` (no break event
— it is simply gone). A pending Mega Crash is not touched.

With Auto Power-Up on, the order is re-evaluated at every pickup, so what a death took is wanted
again ([powerups-and-shields.md](powerups-and-shields.md#auto-power-up)).

### The arcade restart

At the respawn (not at the death — the explosion and the dead time play out where the ship
died), `respawnShip` with `arcade`:

1. with a stage, `stage.restartAt(stage.checkpoint)` — the camera jumps to the last checkpoint the
   camera passed (`-1` = the stage start), speed and flags are re-derived from the stage data, the
   events at the checkpoint re-fire on the next tick for the hooks, and the World's `clear` hook
   runs `clearSession` ([stage-runtime.md](stage-runtime.md#checkpoints)); in free flight
   (`stage: null`) `clearSession` runs alone and the camera does not move;
2. `clearSession(world)` empties every registered pool (enemy bullets and lasers, player shots,
   items), every enemy and formation (`enemies.clear()`), the weapons' per-shot state, the
   power-ups' pending Mega Crashes / pickups / taken drops and the scoring system's credit
   counters. **Scores, lives, loadouts, meters and shields are player state and stay**;
3. every **other** active ship that is not `dying` / `dead` (co-op) flies in again with it — no
   penalty, but the same invulnerability;
4. the ship itself flies in.

The restart runs in phase 2, before phase 3's stage tick, so the camera has already moved one step
past the checkpoint when the tick ends (`camera.x − camera.dx` = the checkpoint's x). A co-op
partner that is still `dying` / `dead` is left alone and respawns on its own — **with another
restart**, which flies the first player in again. Two ships that die together respawn together
from the same restarted view.

## Lives and game over

`PlayerShip.lives` counts the ships **including the one in play** (`createWorld` gives player 1
`config.startingLives`); `killPlayer` takes one at the death, so the HUD drops a stock icon the
moment the ship explodes. There are no extends yet (M2-01).

`playerOut(ship)` is `active && state === 'dead' && lives <= 0 && stateTicks >= PLAYER_DEAD_TICKS`:
the game ends **after** the last explosion and dead time (`DEATH_HIT_STOP_TICKS + PLAYER_DYING_TICKS
+ PLAYER_DEAD_TICKS` = 92 ticks after the fatal hit), not at the hit. In co-op the game goes on
while one active ship has a life; an inactive slot never counts. `gameOver` is only set from
`playing` or `bossWarning` — a death after the stage's `end` event (`stageClear`) never overrides
it. The out ship stays `dead`, and the World **keeps simulating** (the camera scrolls, enemies fly
and fire): what follows a game over — continue, name entry, the title — is the scene flow's
(M1-16, M2-01, M2-15).

## Score (`core/scoring`)

`world.scoring` is a `ScoringSystem` holding a `ScoreBoard`: one `PlayerScore { score,
displayDirty }` per player slot, the session `hiScore` and `hiScoreDirty`. Scores only change
through **`addScore(world, player, points)`**: `floor(points)` added, clamped at `MAX_SCORE`
(**99,999,990** — eight digits, the last one free for the continue counter of M2-01); points ≤ 0
or `NaN` and bad player slots change nothing; a change sets `displayDirty` and raises the
hi-score (setting `hiScoreDirty`) when beaten.

**What scores** (every value from data):

| Event | Points | Credited to |
|---|---|---|
| Enemy kill | the enemy's `score` (`content/enemies/`, e.g. 100 for a `drifter`) | the killer (`EnemyOutcomes.killBy` — the shot's player, Mega Crash's player); `-1` (debug tools) scores nothing |
| Completed formation | the stage event's `bonus` (`content/stages/`) | the player who killed its **last member** (`EnemyOutcomes.bonusBy`, new) |
| Capsule pickup | `CAPSULE_SCORE` (300) | the collector (`PowerUpOutcomes.pickupPlayer`) |

**Crediting** mirrors M1-11's drops. `scoring.resolve()` runs in phase 7 after the shots' hits,
the pickups and Mega Crash; `scoring.beginTick()` runs at the start of phase 3, before
`enemies.beginTick()` resets the outcomes, and credits kills recorded **between** ticks (a tool
calling `enemies.kill`). `killsScored` / `bonusesScored` remember how much of the current
outcomes was credited, so every kill and bonus is credited **exactly once** — also a kill a tool
makes during a hit-stop, which is credited when the World thaws. Pickups are credited in phase 7
only (they are rebuilt every phase 6).

For the formation bonus the enemy system gained per-formation lists: `EnemyOutcomes.bonusCount`,
`bonusScore[]` (`Float64Array`) and `bonusBy[]` (`Int8Array`); `EnemySystemImpl.kill` sets a
private `creditBy` around the formation accounting, so the formation completed by that kill pays
its bonus to that player. `bonusPoints` stays as the sum.

**The hi-score** is session-wide: it starts at 0, follows the best score and can be raised by
the host from its save with `board.setHiScore(value)` (M1-17 — only raises, floors, caps, and
sets `hiScoreDirty` only on a real raise). It is presentation data, so it is **not hashed**: a
saved hi-score must not change a replay's hashes. The scores and the two credit counters are.

**The HUD.** The shell's flight scene (`@shmup/shell` `flight`) draws player 1's score after `1P`,
`HI` and the hi-score at the right end of the top bar (x 300 / 316, eight digits), `lives − 1`
stock icons (at most 8) and `GAME OVER` (red, `0xf85858`) in place of the title once
`world.status === 'gameOver'`. It rebuilds its draw list only when the lives, the status or a
dirty flag changed, and clears `displayDirty` / `hiScoreDirty` itself — the M1-16 HUD will take
that role over.

## Game feel (`core/fx`)

`world.fx` is an `FxState` (a class: unboxed number fields) with the shake and flash timers; the
hit-stop counter itself stays `world.hitStop`. Three requests set the timers and push the events
the presentation of M1-14 will draw — the sim state makes them replayable and inspectable:

| Request | Effect | Event |
|---|---|---|
| `requestHitStop(world, ticks)` | `hitStop = max(hitStop, ticks)` (capped at `MAX_HIT_STOP_TICKS` 60; ≤ 0 / `NaN` → nothing) | `HitStop`, `param` = ticks (pushed even when a longer one runs) |
| `requestShake(world, magnitude, ticks)` | a decaying shake of `ShakeMagnitude` `Small` 1 / `Medium` 2 / `Large` 4 px over `ticks` (≤ `MAX_FX_TICKS` 600); ignored when the running shake is at least as strong **now** (`shakeAmount`) | `Shake`, `id` = duration, `param` = magnitude |
| `requestFlash(world, kind)` | a full-screen flash of `FLASH_KIND_TICKS[kind]` ticks, restarting a running one; unknown kinds → `false` | `Flash`, `id` = `FlashKind`, `param` = duration |

`shakeAmount(fx)` = `ceil(magnitude · ticksLeft / duration)` — whole pixels, decaying to 0.
`FlashKind.MegaCrash` (0, 12 ticks) is the only kind so far: Mega Crash now flashes through
`requestFlash` (the same event as M1-11's hand-pushed one, with `id` 0), and
`MEGA_CRASH_FLASH_TICKS` reads `FLASH_KIND_TICKS`. The global shake switch and the flash limiter
(≤ 3 a second) are presentation settings (M1-14), never sim state.

**Exact hit-stop.** `stepWorld` decides once, before phase 1, whether the tick is frozen
(`hitStop > 0`) and records it in `fx.frozen`; `tickFx` (phase 9) counts the hit-stop down **only
on frozen ticks**. So a hit-stop of `n` requested during tick `t` (the death in phase 7) freezes
exactly ticks `t + 1 … t + n` — before M1-12 the phase 9 of the request's own tick already took
one off. Requested between ticks, it freezes the next `n`. A frozen tick runs only phases 1
(input) and 9 (fx and the view): no autofire, no movement, no events from the systems, the stage
does not scroll; the tick counter still advances. Shake and flash count down on **every** tick,
frozen ones included (plan §3.2), but not on the tick of their request — a request during tick
`t` with duration `n` runs out at the end of tick `t + n`.

## Presentation events

| When | Events (`x` / `y` whole pixels) |
|---|---|
| Death | `Sfx PlayerDeath` (8), `Particles ExplosionLarge` (2) + `Particles Debris` (5), param 1, at the ship; `Rumble` (`id` = player, param 1); `MusicDuck` (`id` = player, param 120); `HitStop` (param 8); `Shake` (`id` 20, param 2); then `Particles BulletCancel` sparkles from the cancel |
| Mega Crash | `Flash` (`id` 0, param 12) through `requestFlash` — unchanged on the wire |

`SimEventKind.MusicDuck` (9) and `FX_CUES.Debris` (5) are new (append-only codes;
`SIM_EVENT_KIND_NAMES` gained `'musicDuck'`). Nothing consumes them yet: particles, shake and
flash arrive with M1-14, sounds and the duck with M1-15, rumble with the gamepad work of M1-15 /
M2-16.

## Determinism and hashing

`hashWorld` (`core/debug`) mixes, after the power-ups, `mixFxAndScores`: `shakeMagnitude`,
`shakeTicks`, `shakeDuration`, `shakeTick`, `flashTicks`, `flashKind`, `flashTick`, every
player's `score`, `killsScored`, `bonusesScored`. `hitStop`, the status, `lives`, the player
states and timers were hashed before (M1-06). **Not hashed:** the hi-score and the dirty flags
(presentation), `fx.frozen` (derived from `hitStop` every tick). The lockstep tests hash every
tick through deaths, hit-stops, co-op deaths, arcade restarts and the game over.

## Zero allocation and the hot-path rules

Deaths are rare, so `killShip`, `respawnShip` and `clearSession` are cold code; the per-tick
paths (`lifecycleSystem`, the dying / dead branches of `updatePlayer`, `tickFx`,
`scoring.resolve`) only read and write numbers. Two guards run in their own files:
`world-death-alloc.test.ts` (a fully powered KESTREL on a scrolling stage shot down every ~5 s —
whole sequence, `classic` penalty, fly-ins, pickups scored; lives topped up) and
`world-death-arcade-alloc.test.ts` (~170 checkpoint restarts with the timeline re-spawning): about
**10 KB over 10,000 ticks** each (budget 64 KB).

| Rule | Why |
|---|---|
| The fly-in writes the cubic ease-out inline (`1 − u·u·u`) instead of calling `EASINGS.outCubic` | The call boxed its fractional argument and result — ~1.7 KB per respawn once every respawn flies in |
| Cancel sparkles are pushed at whole pixels (`Math.floor(x) \| 0`) | The event push is not inlined; every death now cancels the bullets, so this is no longer a rare path |
| Death events are pushed at whole pixels too | Same reason (the M1-10 lesson) |
| `FxState`, `PlayerScore`, `ScoreBoard` and the scoring system are classes | Numeric fields stay unboxed; methods stay monomorphic |
| The co-op power-up guard (`powerups-alloc-coop.test.ts`) re-grants broken shields and uses the `casual` penalty | With `classic` deaths changing loadouts late in the run, V8 left `core/weapons`' shot × enemy grid visitor deoptimised (Maglev, "insufficient feedback", never re-tiered) and it boxed doubles (~80 KB). A tiering quirk to watch in M1-19's bench, not a per-death cost; deaths have their own guards above |

## Using it headlessly

```ts
import {
  PlayerHitCause,
  createGame,
  createHeadlessPlatform,
  playerHit,
  addScore,
} from '@shmup/core';

const game = createGame(createHeadlessPlatform(), { stage: 'test-range', deathPenalty: 'arcade' }, db);
for (let i = 0; i < 60; i++) game.step(); // the fly-in is over
const { world } = game;
const ship = world.players[0];
// A hit recorded between ticks belongs to the tick about to run (world.tick):
playerHit(ship, PlayerHitCause.Bullet, world.tick, world.debugFlags);
game.step(); // ship.state → 'dying', ship.lives 3 → 2, world.hitStop → 8
for (let i = 0; i < 92; i++) game.step(); // hit-stop, dying, dead → the arcade restart, 'respawning'
world.scoring.board.scores[0].score; // everything the tick outcomes credited to player 1
addScore(world, 0, 1000); // a tool's bonus: clamped, hi-score raised, HUD marked dirty
world.debugFlags.godMode = true; // tests that must not die (unattended stage runs)
```

The next `game.step()` runs that tick, and its phase 7 turns the recorded hit into the death.

## Extending it

| To add… | Do this |
|---|---|
| A death penalty preset | Extend `DeathPenaltyPreset` (`core/config`), its branch in `applyDeathPenalty`, and — if it moves the camera — `respawnShip`; validate it in `resolveGameConfig` once strings are validated |
| Something else that kills a ship | Call `playerHit(ship, cause, tick, debugFlags)` in phase 6 (append a `PlayerHitCause` — hashed); the World does the rest in phase 7 |
| Another effect on death (a bomb refund, option recovery — M3) | In `killShip`, after `killPlayer` and before the penalty; keep it cold and allocation-free |
| A scoring event | Record it in a system's tick outcomes (with the player credited), credit it in `ScoringSystemImpl.resolve` (and `beginTick` if tools can cause it between ticks), exactly once; hash any new counter in `mixFxAndScores` |
| Extends / the lives cap (M2-01) | React to `addScore` crossing a threshold (a flag on the board, applied in phase 7), capped by the difficulty; `lives` on the ship |
| A flash kind (boss kills, M1-13) | Append to `FlashKind` and `FLASH_KIND_TICKS` (never renumber — the code travels in the event) |
| A hit-stop or shake elsewhere (boss kills, big explosions) | `requestHitStop` / `requestShake(ShakeMagnitude.…)` from phase 7 code; never write `world.hitStop` directly |
| The M1-16 HUD | Read `world.scoring.board` (`scores[p].score`, `hiScore`), draw on the dirty flags and clear them; `lives − 1` stock; `world.status === 'gameOver'` |

## Tests

| Where | Covers |
|---|---|
| `packages/core/test/world/world-death.test.ts` | The plan's acceptance: the sequence (one life, explosion, debris, rumble, duck, hit-stop, shake, cancel incl. lasers; a second hit on the tick costs nothing), the documented tick timings and the 150 invulnerable ticks, firing while invulnerable, frozen phases, each preset's outcome (loadout, cursor, camera, cleared pools — arcade with a stage, in free flight, in co-op), a Force Field still taking the bullet, lives and game over (never over `stageClear`, co-op), score crediting, per-player totals and the clamp, lockstep hashes |
| `packages/core/test/world/world-death-edge.test.ts` | Co-op deaths on one tick, shared game over (also from `bossWarning`), simulating on after it, uncancelable bullets, nothing running during the hit-stop, a tool's kill during it credited once, scoring and penalty order on the death tick, bullets passing the blinking ship, the blink in the view, five ships = five deaths, classic's order over many deaths, casual never, arcade restarts (stage start, timeline replay, score kept without double credit, exploding partner, two ships together), per-tick lockstep |
| `packages/core/test/world/world-death-alloc.test.ts`, `world-death-arcade-alloc.test.ts` | The allocation guards above (own workers) |
| `packages/core/test/player/player-life*.test.ts` | `killPlayer`, `respawnPlayer`, `playerOut` and the `dying` / `respawning` branches of `updatePlayer`: timings, lives floor, the invulnerability on control return (any fly-in length), no invulnerability on `entering`, fly-ins on scrolling / panning cameras, `playerOut` boundaries |
| `packages/core/test/powerups/powerups-death.test.ts` | `loseOneLevel` order and return values, `applyDeathPenalty` per preset |
| `packages/core/test/fx/fx*.test.ts` | Hit-stop (raise-only, caps, `NaN`, exact frozen ticks mid-tick and between ticks, extension while frozen), shake (decay, weaker ignored, equal after decay, floor / cap, one tick), flash (restart, unknown kind), counting while frozen, per-tick hash determinism |
| `packages/core/test/scoring/scoring*.test.ts` | `addScore` (per player, dirty flags, clamp, `NaN` / `Infinity` / bad slots), `setHiScore` (dirty only on a real raise — the bug the M1-12 test pass fixed), the system's crediting (killer, anonymous, bonuses, multi-pickup ticks, phase 3 vs 7, no re-credit), the World's board and hashing |
| `packages/core/test/debug/`, `events/`, `enemies/`, existing World suites | The new hash block (every field matters, the hi-score and dirty flags do not); the `MusicDuck` / `Debris` codes; the bonus lists; suites that parked ships in rock or ran stages unattended now use god mode, top up lives or run the bullet phases alone |
| `packages/shell/test/flight/flight.test.ts` | Score, `HI`, stock and `GAME OVER` in the HUD; rebuilt only on a change |
| `test/integration/death-runtime.test.ts` | The shipped `test-range` through `Game.step()`: unattended sessions per preset with per-tick invariants (lives, hit-stop, frozen ticks, respawn position, 150-tick invulnerability, score = credited outcomes, hi-score), the exact game-over tick, lockstep hashes; full-loadout terrain crashes showing each preset's outcome (arcade restart at checkpoint x 1500) |
| `test/e2e/lives.spec.ts` | In Chromium on `?stage=test-range`: the stock icons go 2 → 1 → 0, the ship vanishes and flies back in, `GAME OVER` (red) replaces the title; no console errors |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| A test that runs a stage unattended ends in `gameOver` | Ships die since M1-12. Set `world.debugFlags.godMode = true`, top up `ship.lives`, or run only the phases under test |
| `playerHit` returned `true` but the ship is still `alive` | By design until phase 7 of the same tick; a hit recorded between ticks dies in the next tick's phase 7 (use `hitTick = world.tick`) |
| A hit during the fly-in or the blink does nothing | `playerHit` ignores ships that are not `alive` or have `invulnTicks > 0` |
| The ship died but the hit-stop lasted one tick less than asked | Code that drives phases by hand without `stepWorld` must set `world.fx.frozen` the way `stepWorld` does |
| `world.hitStop` counts down one tick late compared with before M1-12 | Intended: the request's own tick no longer counts — `n` means exactly `n` frozen ticks |
| An arcade death did not move the camera | The restart happens at the **respawn**, 92 ticks later; in free flight there is no camera move at all |
| After an arcade restart, spawns at the checkpoint appear again | Intended: `restartAt` re-fires the checkpoint's events on the next tick |
| A co-op partner flew in again without dying | An arcade restart flies every other live ship in with the respawning one |
| Unknown `deathPenalty` strings act like `casual` | Strings are not validated at runtime; use the `DeathPenaltyPreset` type |
| The score did not include a kill a tool made | It is credited at the next tick's phase 3 (or the next phase 7) |
| The hi-score differs between two otherwise equal runs | It is not hashed and a host may raise it with `setHiScore` — compare scores, not hi-scores |
| The HUD score never updates in a custom scene | Rebuild on `displayDirty` / `hiScoreDirty` and clear them yourself, as the flight scene does |
| The allocation guard creeps up after a change here | A fractional argument to a non-inlined call (events, easing helpers), a closure or literal in the per-tick branches, or rare death code moved into a hot path |

## Next steps that build on this page

- **M1-13** — bosses: the kill's hit-stop, a large shake and a flash kind; a boss death clears the
  field; the WARNING status that game over may end.
- **M1-14** — particles (explosion, debris, cancel sparkles), the screen shake and flash drawn from
  the events, the global shake switch and the flash limiter.
- **M1-15** — the death sound and the music duck.
- **M1-16** — the real HUD and the scene flow after game over.
- **M1-17** — the saved hi-score (`setHiScore`) and the Options menu for `deathPenalty` /
  `startingLives`.
- **M2-01** — extends, the lives cap, continues (the score's last digit), rank reacting to deaths.
- **M3** — option recovery after a death, authentic slowdown.

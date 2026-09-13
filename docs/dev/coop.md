# Two-player co-op: drop-in join, seats, per-player continues

How plan step **M2-06** added **two-player simultaneous co-op** (Darius Twin-style, one screen):
the title's `2 PLAYERS` starts a game in which player 2 **drops in** with a join press on its own
controller, each player keeps its own lives, score, meter / items, shield and continues, a player
out of lives leaves play while the other plays on (and comes back with a continue), and the game is
over only when both are out. Around it: device routing by **seats** in `@shmup/input-web` (the
remote / keyboard is player 1's, a pad takes player 2's seat with its first A / START, or the new
**split-keyboard** profile), the co-op drop scaling `coopExtra`, player 2's **palette-swap**
sprites, the co-op HUD and end screens, and two co-op golden replays.

This page is the *how and why* and the map of the whole step. Exact signatures are in
[api-reference.md](api-reference.md#world--the-gameplay-session-and-the-tick-pipeline); the TSDoc
in `packages/core/src/{world,config,powerups,ui,scenes,data,game}/index.ts`,
`packages/input-web/src/{web-input,rebind}/index.ts` and `scripts/assets/coop.mjs` is the
authoritative reference. The input profile format (the new `split` section) is in
[`content/input/README.md`](../../content/input/README.md#split-keyboard-m2-06); what players see
is in [`../client/preview-build.md`](../client/preview-build.md#two-players) and
[`../client/controls.md`](../client/controls.md#two-players). The systems this step extends have
their own pages:

| Part | Home page |
|---|---|
| The World, the tick phases, the ships | [sim-world.md](sim-world.md) |
| The death sequence, lives, game over, the score | [death-and-scoring.md](death-and-scoring.md) |
| Continues and the countdown scene | [difficulty-and-rank.md](difficulty-and-rank.md#continues) |
| The meter, capsules, the item pool | [powerups-and-shields.md](powerups-and-shields.md) |
| Direct mode's item plan | [direct-mode.md](direct-mode.md#drop-resolution-and-the-item-plan-corepowerups) |
| The scene flow, the HUD | [scenes-and-ui.md](scenes-and-ui.md) |
| Input profiles, binding contexts, the no-phantom-press rules | [input-profiles.md](input-profiles.md) |
| The shell's frame loop | [rendering-and-shell.md](rendering-and-shell.md) |
| Generated sprites (`@flash`, now `@p2`) | [asset-pipeline.md](asset-pipeline.md) |
| Golden replays and why they were re-blessed | [debug-and-replays.md](debug-and-replays.md#golden-replays-testgolden) |

Background: `shmup_feat.md` §16 (2-player simultaneous co-op, drop-in, separate lives and
continues), §4 (2-player input: press Start to join, per-player device assignment, the
split-keyboard preset), §6B ("consider scaling item count in co-op"), §5 / §18 (co-op ships in
different colours, palette swaps), §17 (the P2 HUD), §10 (continues); plan decisions **D12** (the
remote is primary), **D15** (separate `game` / `menu` tables) and **D17** (aimed shots, the
four-way rule).

## The picture at a glance

```text
 title: 1 PLAYER / 2 PLAYERS ──► SceneFlow.choosePlayers(coop) ──► every difficulty's config withCoop
                                                                      │
 game scene (config.coop) ───────── Game.inputSeats = 2 ─────────────┼──► shell ──► WebInput.setSeats(2)
                                                                      │
 WebInput.poll()   remote / keyboard ─────────────────► player 1's slot
                   pad (unseated) ── first A / START ─► seat P2, latched Confirm on player 2's slot
                   pad (seated) ──────────────────────► player 2's slot
                   split keyboard's right half ───────► player 2's slot
                                                                      │
 stepWorld phase 1 (input — runs during hit-stop too)                 ▼
   intents[i].pressed & JOIN_ACTIONS and playerCanJoin(world, i) ──► joinPlayer(world, i)
       inactive slot: active, startingLives, starting loadout, score 0      ┐ blinking fly-in
       out with continues left: lives, power reset, continue digit, no     ├ (respawnPlayer),
       stage restart (the other player plays on)                           ┘ SFX PlayerJoin
 phase 2: game over only when every active ship is out
 phase 3: power-up drops × coopExtra while two ships are in play (PowerUpSystem.coopCredit)
 phase 9: player 2 drawn with <ship>@p2
 HUD: hudPlayerState(world, p) → PRESS START / split halves / GAME OVER
 continue countdown: continueWorld(world, who) — the players whose OK was pressed
```

## Configuration (`core/config`)

| Field | Default | Meaning |
|---|---|---|
| `coop` | `false` | A two-player co-op game: player 2 may drop in. `resolveGameConfig` throws `RangeError` for a non-boolean |
| `coopExtra` | `DEFAULT_COOP_EXTRA` `0.5` | Drop scaling while two ships are in play (below); a finite number `0`–`MAX_COOP_EXTRA` `4`, else `RangeError` |

- `withCoop(config, coop)` → a frozen, validated config with `coop` set, everything else kept
  (the same object when it already has that value) — what the title's `1 PLAYER` / `2 PLAYERS`
  feeds through the scene flow.
- Both fields are **sim-affecting**, so replay headers record them. The replay format version is
  unchanged: `decodeReplay` defaults a missing config key, so every older replay reads as a
  one-player game with the default `coopExtra`.
- `coopExtra` lives in the config, not in a `rules` file: like every other sim-affecting session
  value it has to travel with the replay header, and a rules table would make a replay depend on
  the content it is played with.
- The ship and the loadout stay **session-wide**: both players fly the config's `shipId` with the
  weapon select's arsenal (player 2 in its palette swap).

## Joining (`core/world`)

`JOIN_ACTIONS` = `Action.Confirm | Action.Pause`. In **phase 1** (input), after the intents are
copied, a co-op World calls `joinPlayer(world, i)` for every slot whose intent **pressed** one of
them. Phase 1 runs during hit-stop too, so a press on a frozen tick is never lost.

`playerCanJoin(world, slot)` is the one rule:

- the World is a co-op one (`config.coop`) and is being **played** (`playing` or `bossWarning` —
  never on `stageClear` / `gameOver`);
- the slot is valid and either **inactive** (it never joined — a fresh ship) or **out**
  (`core/player` `playerOut`: dead, no life left, its dead time served) **with continues left**
  (`continuesLeft(world, slot) > 0`).

A ship that is still flying, dying or waiting out its dead time cannot join: its START is its own
business (the scene flow pauses on it).

`joinPlayer(world, slot)` (a deterministic cold path; tests and tools may call it directly) does
nothing unless `playerCanJoin`, then:

| Slot was | What happens |
|---|---|
| inactive | `active = true`, `lives = config.startingLives`; the loadout it was given at creation (`createWorld` applies the config's starting loadout to both slots); score 0 |
| out, continues left | a **mid-game continue**: `lives = config.startingLives`, the power reset (`resetPower`: the `arcade` penalty — `applyDirectDeathPenalty('arcade')` in Direct mode — then the starting loadout), `markContinue` writes the continue digit, `World.continuesUsed++`; **the stage does not restart** (the other player is still playing) |

Either way the ship flies in from the left edge of the view (`respawnPlayer`: a `respawning`
fly-in, invulnerable and blinking like after a death) and `SFX_CUES.PlayerJoin` (25) is pushed at
its whole-pixel position with `SfxPriority.High`. The join is **plain recorded input**, so replays
need nothing new.

The scene flow's game scene reads Pause / Back from **every player's** input (not the merged
menu input any more) and skips the press of a player who may join — that press is the join, the
World acts on it. Any other player's Pause or Back still pauses; a joinable player 2's **Back**
pauses too (only Confirm / Pause join).

## Leaving, per-player continues and the game over

- **Leave = running out of lives.** A player whose last ship is lost leaves play (`playerOut`);
  the other plays on. There is **no host-driven leave**: a pad that is unplugged leaves its ship in
  play (it holds still, riding the scroll, and keeps firing on its own) because anything that
  changes the sim has to come through recorded input.
- **Game over** is unchanged — status `gameOver` once every **active** ship is out (phase 2). A
  player 2 that never joined does not count.
- **Continues are per player.** `continuesLeft(world, slot)` = `config.continues` minus that
  player's own `PlayerScore.continues` (the score's last digit), never below 0. An out player with
  continues left continues **mid-game** with its join press (above).
- `canContinue(world)` → `status === 'gameOver'` and at least one **active** player has continues
  left.
- `continueWorld(world, who = every player)` takes a player **mask** (bit 0 = player 1): every
  active player in `who` with continues left gets its lives, a power reset and the continue digit,
  the stage restarts at its last checkpoint (as in M2-01), and the continued ships fly in. A
  player who did not continue stays out and may drop back in later with its join press. `false`
  (nothing changes) when the game is not over or no player of `who` has continues left.
- `World.continuesUsed` counts **continue events**: one per `continueWorld` (whoever continued) and
  one per mid-game continue. The budget is always the per-player `continuesLeft`.

In a one-player game (`coop: false`) player 2 never joins, `continuesLeft(world, 0)` equals the old
`config.continues − continuesUsed`, and the countdown continues on any controller's OK — the M2-01
behaviour.

## Targets and items

Nothing had to change here; M2-06 adds the co-op tests.

- **Aimed shots** (bullets, movers, boss aims — `AIM_AT_TARGET`) target the **nearest living**
  ship with a strict `<`, so player 1 wins a tie (since M1-09).
- **Items** go to the **first ship that touches them**; on the same tick player 1 wins. The item's
  effect and its points go to that player: its own meter (or Direct-mode levels), its own shield,
  its own score.
- Every per-player system was already sized for `MAX_PLAYERS` (2): meters, loadouts, Options,
  shields, the Free Way heading, scores and extends.

## Co-op drop scaling (`core/powerups`)

While **two ships are in play** (active and not `playerOut` — a ship that died with lives left
counts), every **capsule / power-up drop** adds `config.coopExtra` to a credit, and each whole
credit drops one more item `COOP_EXTRA_OFFSET` (12) px below the first — a capsule in meter mode,
the plan's **next** item in Direct mode. With the default 0.5 every second drop comes twice.

- The credit is `PowerUpSystem.coopCredit`, kept in a one-slot `Float64Array` (a fractional field
  write could box), **hashed** (`hashWorld` mixes it after the plan cursor) and **never reset** —
  not by a leave, a continue or a checkpoint restart, like the plan cursor.
- The blue capsule and freed Options are not scaled. `coopExtra: 0` turns the scaling off; one
  ship in play ignores it.
- `takeDrops` decides "two in play" once per tick with drops, not per drop.

## Player 2's palette swap

- **Assets.** `scripts/assets/coop.mjs` adds a `<name>@p2` sibling for every `ships/*` sprite and
  for `hud/life`: the source frames with the **red and blue channels swapped** (the KESTREL's blue
  hull stripe turns red-orange, its cyan canopy gold, its orange engine glow blue). Exact integer
  work, so the atlas stays byte-identical everywhere; a real-art PNG override of a ship gets its
  variant from the override. `collectSprites` adds them after the `@flash` siblings; the oversize
  report skips them (reported for their source). The atlas stays 512×512.
- **Data.** `loadContent` interns `<ship sprite>@p2` (`P2_SPRITE_SUFFIX`) for every ship and
  resolves it into `PlayerShipSpec.spriteP2Id` (-1 without it — the built-in `DEFAULT_PLAYER_SHIP`
  too); `pnpm content:check` fails when the atlas lacks one, like any other sprite name.
- **World.** `syncWorldView` draws slot 1 with `spriteP2Id` (falling back to `spriteId`).
- **HUD.** `UI_SPRITES` gained `hud/life@p2` (`UiSprites.lifeP2`) for player 2's stock icon.

## The HUD (`core/ui`)

`hudPlayerState(world, slot)` → a `HudPlayerState`: `Playing` 0 (a ship in the game), `Join` 1 (a
co-op slot that may drop in), `Continue` 2 (out, may continue), `Out` 3 (out for good), `Absent` 4
(no ship and no way in — a one-player game's player 2). It repeats `playerCanJoin`'s rule because
`core/world` imports `core/ui` (a cycle otherwise); `ui-hud-coop-edge.test.ts` checks the two
agree for both slots over every combination.

- **Top bar.** A `Join` slot shows a blinking `PRESS START` (`HUD_COLORS.prompt`, half period
  `HUD_PROMPT_BLINK_TICKS` 32) where its score would be, instead of `------`.
- **Bottom bar.** While **both** ships are active it splits into two `HUD_LAYOUT.halfW` (192 px)
  halves, player 1 left, player 2 right. Each half: the stock icon (`hud/life`, player 2
  `hud/life@p2`) and the count as a number, then the seven meter slots as 20-px boxes
  (`coopSlotW`) with two-letter labels (`METER_SHORT_LABELS`, in `METER_LABEL_FRAMES` order —
  `SP MS DB LS OP ? !`, and the Types B–D names `SB 2W TP TL VT FW RP CY TW`) and the shield pips
  from x 164 — or in Direct mode `SH` / `SB` / `AR` / `SP` with 3×4 pips 4 px apart. An out
  player's half shows `PRESS START` (blinking, `Continue`) or `GAME OVER` (`Out`). With one ship
  active the one-player bar is drawn exactly as before.
- **Budgets.** `HUD_STRING_COUNT` 9 → **22** (`pressStart` 9, `gameOver` 10, `shortShot` …
  `shortSpeed` 11–14, `meterShort` 15–21), `HUD_COMMAND_COUNT` 64 → **96** (the co-op Direct-mode
  HUD with every pip). The co-op strings are written **only when drawn**, so a one-player HUD list
  with 4 string slots (the flight scene's) still works.
- **`Hud.update`** now samples twelve values per player into a typed array (`HUD_PLAYER_FIELDS`:
  state, active, lives, cursor, equippable mask, shield hits / max / tier, shot, sub, family,
  speed) and compares it with the last build's; the meter flash counts while either player has a
  highlighted slot, the prompt blink only while a `PRESS START` shows.

## The scene flow (`core/scenes`) and `Game.inputSeats`

- **Title.** The menu is `1 PLAYER` / `2 PLAYERS` / OPTIONS / EXIT: `TitleItem` is now
  `Start 0` (1 PLAYER), `TwoPlayers 1`, `Options 2`, `Exit 3` — every test and e2e spec that walked
  down to OPTIONS presses Down once more. Both entries call `choosePlayers(coop)` and open the
  difficulty menu; the rest (ship select, weapon select) is the same, and `rearm()` folds
  `withCoop` into every difficulty's armed config. `SceneFlow.coop` is the choice; RETRY STAGE
  keeps it (player 2 joins again).
- **Game scene.** The join exception above; everything else as before.
- **Continue countdown.** In a co-op game OK continues only the players who pressed it on that
  tick (`continueWorld(world, who)`), each with its own continues; the panel shows `1P` / `2P`
  credits (`continuesLeft`) when player 2 has joined, else one `CREDITS` line. An OK on player 2's
  controller when player 2 never joined does nothing there. In a one-player game any controller's
  OK continues (`who = -1`).
- **End screens.** Stage clear and game over show `1P` / `2P` scores when player 2 has joined
  (`stringSlots` 6 and 5). `recordRun` records every active player's score in the World's table
  (`hiScoreModeKey` — the same tables per power-up mode and difficulty as one-player games) with
  the row mode `2p` in a co-op game (`1p` otherwise); the `NEW HI-SCORE` line follows player 1's
  rank.
- **Seats.** `SceneFlow.inputSeats` is `2` while the game scene or the continue countdown is on
  top with a `config.coop` World, else `1` (every other menu merges all players anyway). The
  core's `Game.inputSeats` returns it — for bare gameplay `2` when the session config is a co-op
  one. Reading it never allocates.

## Input routing (`@shmup/input-web`, `@shmup/shell`)

The shell forwards `game.inputSeats` exactly like the binding context: once at boot and at the
start of every frame, before its ticks, when it changed (`ShellInput.setSeats?(count)` — optional:
an adapter without it routes every device to player 1). `WebInput` (module `web-input`, now
`implemented`) routes by seats:

| Seats | Keyboard / remote | Split keyboard's right half | Pads |
|---|---|---|---|
| 1 (menus, one-player games) | player 1 | player 1 | every pad → player 1 (**a change**: pad slot 1 used to be player 2 always; now any pad works solo) |
| 2 (a co-op game or its countdown) | player 1 (the left half of a split profile) | player 2 | an unseated pad drives player 1 **until its first join press** — a button its gamepad profile's **menu** table binds to Confirm or Pause (A, START) — which seats it (`padSeat(i) === PAD_SEAT_P2`) and is forwarded as a **latched `Confirm`** on player 2's slot; the seated pad then drives player 2 only; other pads drive player 1 |

- A seat **persists** across games and seat changes until the pad disconnects. A pad that goes
  away — `null`, `connected: false`, or missing from a shorter `getGamepads()` list — gives the
  seat up **on that same poll**, before the seat check, so another pad can take it at once. No
  pad can be seated while a split profile is active (the right half owns player 2's seat).
- **Seat changes never make presses.** `setSeats` remembers what the moving sources held on the
  last poll (a seated pad, the split keyboard's right half) and the next poll strips the press edge
  of those actions on their new player — player 2's START that opened the pause menu (one seat)
  does not also resume it as player 1's, and the START that resumes does not pause again on player
  2's slot. See [input-profiles.md](input-profiles.md#binding-contexts-game--menu-decision-d15).
- **Split keyboard.** A `keyboard` profile may add `split: { game, menu }` — player 2's half, in
  the same format as `context` (which becomes player 1's half). `checkSplit` rejects a split on a
  non-keyboard profile, gamepad `buttons` in it, a missing required action, and any key bound in
  both halves of one context. Compiled into `InputProfile.splitTables`; `WebInput` drives a second
  keyboard source (`WebInput.splitKeyboard`, same event target) with them. The shipped
  `keyboard-split` (label `SPLIT KEYBOARD`): player 1 WASD, F (PowerUp / Confirm), G (Special +
  Speed / Back), Esc / Q (Pause); player 2 arrows, K, L, Enter / numpad Enter (Pause in the game —
  player 2's START — Confirm in menus). Offered under Options → CONTROLS **on the web only** (the
  TV's key space never reaches it) and by `?profile=keyboard-split`.
- What counts as "player 1's START" follows the active game table: Back / Play/Pause on the remote,
  P / Esc / Backspace on `keyboard-default`, Esc / Q on the split profile's left half. OK on the
  remote is PowerUp in the game table, so it is **not** a join press there.

## Audio

`SFX_CUES.PlayerJoin` (25) — a short square-wave chirp with a tremolo
(`content/audio/main.sfx.json`, synthesized like every other cue, priority `high`, one instance).
`pnpm content:check` requires every cue to be bound.

## Determinism, hashing and golden replays

- A join and a continue are recorded input, so a replay of a co-op game replays them; the replay
  body always had one word per player (`MAX_PLAYERS`), and the header now carries `coop` /
  `coopExtra`.
- `hashWorld` mixes `PowerUpSystem.coopCredit`. Together with the sprite table's new `@p2` names
  (sprite ids are interned, sorted, so every later id moved) that changed **every golden hash**:
  the fifteen existing scenarios were re-blessed with **all outcomes unchanged** (status, ticks,
  score, lives, death ticks, boss).
- Two new co-op scenarios (`GoldenScenario.p2` = player 2's bot and the tick of its first START —
  afterwards START every other tick while it may join; `GoldenOutcome.p2` = player 2's score,
  lives, death ticks and continues): `zone-a-coop` (two `fourWayBot`s — `fourWayBot(player)` now
  flies any slot — player 2 from tick 300, to `stageClear`) and `zone-a-coop-deaths` (the 4-way bot
  and a weaving player 2 from tick 120 that dies seven times and continues twice with START while
  player 1 plays on, to `stageClear`). Seventeen golden files in all.
- `world-coop.test.ts` keeps two co-op Worlds fed the same two inputs (a join and a continue
  included) in lockstep.

## Zero allocation and the hot-path rules

- Phase 1's join check is a mask test per slot; `joinPlayer` itself is a cold path that only
  writes numbers and pushes one event with whole-pixel coordinates.
- The co-op credit is a typed-array slot; `twoInPlay()` is a loop over the ships.
- The HUD keeps its per-player values in two `Int32Array`s (`shown`, `next`) instead of a dozen
  fields per player; the co-op labels are `setString` only when drawn (the draw list compares).
- `WebInput`'s seat state is typed arrays (`padSeats` `Int8Array`, `padLast` `Int32Array`) and
  small-integer closure variables; `poll()` and `setSeats()` allocate nothing.
- Guards: `world-coop-alloc.test.ts` (two fully powered ships, capsules, player 2 shot down and
  continuing with START again and again — under 64 KiB like every World guard),
  `ui-hud-coop-alloc.test.ts` (both halves changing, the prompt, `GAME OVER` — under 32 KiB),
  the allocation case of `web-input-seats.test.ts` (seats, joins and the split keyboard).

## Using it headlessly

```ts
import {
  Action,
  HudPlayerState,
  commitPlayerInput,
  continuesLeft,
  createInputSnapshot,
  createWorld,
  hudPlayerState,
  playerCanJoin,
  resolveGameConfig,
  stepWorld,
} from '@shmup/core';

const world = createWorld(resolveGameConfig({ coop: true, stage: 'zone-a', seed: 7 }), db);
const input = createInputSnapshot();
hudPlayerState(world, 1); // → HudPlayerState.Join — the HUD blinks PRESS START
for (let t = 0; t < 300; t++) {
  // Player 2's controller presses START on tick 60: phase 1 of that tick joins it.
  commitPlayerInput(input.players[1], t === 60 ? Action.Pause : 0);
  stepWorld(world, input);
}
world.players[1].active; // → true (flown in, invulnerable for a while)
playerCanJoin(world, 1); // → false — it is playing; its START would now pause the scene flow
continuesLeft(world, 1); // → 3 on Normal
```

For a whole game with the scene flow and a real `WebInput`, see
`test/integration/coop-remote-pad.test.ts` (it forwards the context and the seats each frame like
the shell).

## Extending it

| Want | Do |
|---|---|
| More than two players | `MAX_PLAYERS` sizes every per-player array (snapshot, intents, meters, loadouts, scores, the replay body — a format change); the HUD halves, `hudPlayerState`'s callers, `Hud`'s typed arrays (`2 * HUD_PLAYER_FIELDS`), the end screens and `WebInput`'s single P2 seat (`PAD_SEAT_P2`) all assume two |
| Another join button | Add its action to `JOIN_ACTIONS` (and keep the game scene's pause exception in step); for pads the join press comes from the gamepad profile's **menu** table (`joinButtonsOf`), so binding Confirm / Pause to another button there is enough |
| A host-driven leave (e.g. a menu entry) | It must be recorded input: a new action or a pause-menu choice that the World reads — never a call from the host into the World |
| Tune the item scaling | `coopExtra` in the config (0 – 4); replays record it |
| Colours of player 2 | `scripts/assets/coop.mjs` (`swapRedBlue`, `P2_VARIANT_PREFIXES`, `P2_VARIANT_SPRITES`); a real-art `@p2` would need the pipeline to prefer an override (not supported yet — the variant is always derived) |
| Another split preset | A `keyboard` profile with a `split` section in `content/input/` — validated by `checkSplit`, offered by CONTROLS when its menu tables are reachable |

## Tests

| File | Covers |
|---|---|
| `packages/core/test/config/config-coop.test.ts` | Defaults, validation of `coop` / `coopExtra`, `withCoop` (the same object when unchanged, the rest intact) |
| `packages/core/test/world/world-coop.test.ts` | Join rules (START / OK only, not in one-player games, during the WARNING, not after stage clear / game over, bad slots, during hit-stop), leave / per-player continue / game over, the continue mask, the aim tie-break, item ownership, `coopExtra` in both modes, player 2's sprite, lockstep of two co-op Worlds |
| `packages/core/test/world/world-coop-edge.test.ts` | Joins that change nothing, a dying ship waiting for its dead time, `continues: 0`, two out players pressing START on one tick, `canContinue` / `continueWorld` with a player 2 that never joined, a `'full'` starting loadout and Direct levels back after a mid-game continue, the join cue, the MANTA's `@p2` and the fallback sprite |
| `packages/core/test/world/world-coop-alloc.test.ts` | The allocation guard (above) |
| `packages/core/test/powerups/powerups-coop.test.ts` | Several extras per drop, carried fractions, the blue capsule never scaled, a ship with lives left counts, the credit kept across a leave, hashed |
| `packages/core/test/ui/ui-hud-coop.test.ts`, `ui-hud-coop-edge.test.ts`, `ui-hud-coop-alloc.test.ts` | The prompt and its blink, both halves (meter and Direct), `PRESS START` / `GAME OVER` halves, `hudPlayerState` vs `playerCanJoin` for both slots, player 1's prompt in the left half, rectangle fallback without sprites, 4-string-slot lists, change detection, allocation |
| `packages/core/test/scenes/scenes-coop.test.ts`, `scenes-coop-edge.test.ts` | 2 PLAYERS vs 1 PLAYER, the seats per scene, joining without pausing, player 1's START pausing, a joinable player 2's Back pausing, RETRY STAGE keeping co-op, the countdown's per-player OKs, both scores on the end screens, `2p` / `1p` rows |
| `packages/core/test/replay/replay-coop.test.ts` | Both players recorded and played back hash for hash; `coop` / `coopExtra` through the JSON encoding; a desync without player 2's input (the join is input) |
| `packages/input-web/test/web-input/web-input-seats.test.ts`, `web-input-seats-edge.test.ts` | One seat never seats, the join press as an edge from the menu table, a custom profile's join button, seat persistence, disconnect (null / `connected: false` / a shorter list), held buttons across a seat change, the split keyboard (routing, tap, context, destroy), the package exports, allocation |
| `packages/input-web/test/rebind/rebind-split.test.ts` | `splitTables` (the other context's keys at 0), keyboard profiles only, the required actions, a key in both halves and gamepad buttons refused, the shipped `keyboard-split` offered on the web and never on the TV |
| `packages/shell/test/boot/boot.test.ts` | `setSeats` forwarded at boot and on a change before the frame's polls; an adapter without it |
| `test/scripts/assets/coop.test.ts` | The core's suffix, `wantsP2Variant` (ships and the stock icon only), `swapRedBlue` (green and alpha kept), `makeP2Sprite` (anchor, frames, animations), every ship's and the stock icon's variant in the atlas |
| `test/integration/coop-remote-pad.test.ts` | The remote plays player 1, a pad's START takes player 2's seat and joins; pause / resume with player 2's held START; an unplugged seated pad; each device's OK in the countdown |
| `test/e2e/coop.spec.ts`, `coop-gamepad.spec.ts` | The built web page: the split keyboard (2 PLAYERS, Enter joins player 2, the split HUD, player 2 moves, Esc still pauses); a fake `navigator.getGamepads()` pad driving the menus, joining with START, moving player 2 only, pausing and resuming without a phantom press |
| `test/golden/` | `zone-a-coop`, `zone-a-coop-deaths` |

## Gotchas

| Symptom | Cause |
|---|---|
| A test or e2e spec that opened OPTIONS on the title now starts a game | The title gained `2 PLAYERS` at index 1: `TitleItem.Options` is 2, `Exit` 3 — press Down once more |
| Player 2's START paused the game instead of joining | Player 2 cannot join right now (still flying, dying, out for good, or the game is not a co-op one); or the input adapter routes one seat (the host does not forward `Game.inputSeats`) |
| The remote's OK does not bring player 1 back | In the game table OK is PowerUp; player 1's join press is its Pause key (Back / Play/Pause on the remote) |
| A pad drives player 1 in a co-op game | Expected until it presses A or START (its join press) — or player 2's seat is taken (another pad, or a split keyboard profile) |
| The ship of an unplugged pad keeps flying | There is no host-driven leave; plug a pad in and press START to take the seat |
| Golden hashes changed after touching sprites | `@p2` (like `@flash`) names are interned into the sorted sprite table — a new ship sprite shifts later ids |
| A HUD list with few string slots throws in co-op | A co-op HUD needs `HUD_STRING_COUNT` (22) slots; one-player lists may keep 4 because the co-op strings are written only when drawn |
| `continuesUsed` is larger than any player's continue digit | It counts continue events (a countdown continue of both players is one), not a budget — read `continuesLeft` |
| The `NEW HI-SCORE` line did not show for player 2's best | It follows player 1's place in the table; player 2's row is recorded all the same |

## Next steps that build on this page

- **M2-07 … M2-14** — every new stage system and zone runs with two ships; anything per player
  (bosses aiming, gimmicks grabbing a ship) targets the nearest living player like the aimed shots.
- **M2-15** — the name entry and hi-score table screen show `2p` rows; a replay of the scene flow
  records the title's player choice.
- **M2-16** — the Options screen's control groups (rebinding per device) sit on the same profiles,
  seats included; the chosen player count may be remembered with the game options.

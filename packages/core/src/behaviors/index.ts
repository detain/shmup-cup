/**
 * # behaviors — the registry of enemy behaviour scripts referenced by content
 *
 * **Responsibility.** Maps the `script` ids of `content/enemies/` to TypeScript coroutines
 * (decision D29, shmup_feat.md §11 "coroutine AI scripts"): a {@link BehaviorDef} is an id, a set
 * of tunables with defaults (overridden per enemy by its `params`) and a factory returning the
 * {@link Script} generator. The enemy system (`core/enemies`) creates one coroutine per spawned
 * enemy and resumes it only when it wakes; the coroutine steers the enemy by switching movers
 * (`core/patterns`) and by firing patterns through the `ScriptApi` fire primitives (M1-09 —
 * they respect the off-screen / settle rule themselves). Content validation uses the registry
 * ({@link KNOWN_SCRIPT_IDS}) as `loadContent`'s `knownScripts`, so an unknown id is a content
 * issue, and {@link checkEnemyBehaviors} reports unknown tunables, spawners without a child and
 * (M2-02) pattern runners without a `pattern`.
 *
 * **The roster** ({@link DEFAULT_BEHAVIORS}: the M1 behaviours and M2-02's `pattern.loop`;
 * `params` defaults in brackets):
 *
 * - `drifter.sine` — popcorn: drifts left on a sine wave [`speed` 1.25, `amp` 24, `period` 96,
 *   `phase` 0, `memberPhase` 0 — extra phase per formation member].
 * - `fan.loop` — formation flier: the leader flies the spawn event's path (straight left without
 *   one) [`speed` 1.5]; every other member replays the leader's track (`follow`).
 * - `carrier.straight` — capsule carrier: flies straight left [`speed` 1]; its drop is data.
 * - `turret.floor` — ground turret (floor or ceiling, per its spec): stands still and turns to
 *   face the nearest player every [`aimTicks` 30] ticks; every [`fireTicks` 90] ticks (rank-scaled,
 *   counted in `aimTicks` steps) it fires an aimed round pink bullet at [`bulletSpeed` 1.5].
 * - `walker.floor` — walks along its floor / ceiling towards the player for [`walkTicks` 90] at
 *   [`speed` 0.75], stops for [`stopTicks` 45] and fires an aimed 3-way of red ovals
 *   [`spread` 48 binary units apart, `bulletSpeed` 1.25] as it stops, repeats.
 * - `hatch.spawner` — ground hatch: while it may fire (on screen, settled) it releases its
 *   `child` enemy every [`interval` 60] ticks, at most [`max` 8] in all (0 = no limit).
 * - `rammer.aimed` — enters with its spec's mover for [`enterTicks` 40] ticks, then holds for
 *   [`windup` 20], aims at the nearest player and dashes at [`speed` 2.5].
 * - `orbiter.loop` — flies the spawn event's path (a loop) at [`speed` 1.25]; without a path it
 *   flies to view point [`x` 256, `y` 100], holds [`hold` 90] and leaves left at [`leaveSpeed` 2].
 *   Every [`ringTicks` 120] ticks (rank-scaled) it fires a ring of [`ringCount` 8] purple bullets
 *   at [`bulletSpeed` 1], each ring turned half a gap from the last.
 *
 * - `pattern.loop` (M2-02) — runs the enemy's `pattern` (a `content/patterns/` DSL action) over
 *   and over, [`restTicks` 60] apart, `relative` directions from [`heading` 512]; it moves with
 *   its spec's `mover`.
 * - `hunter.option` (M2-04) — the **Option Hunter**'s three variants: [`variant` 0] from behind
 *   along the player's row, 1 from ahead along it, 2 diving down the player's column. For
 *   [`lineUpTicks` 90] ticks it flies (at [`speed` 2]) to its line-up point — view x [`lineX` 48]
 *   (variant 1: `384 − lineX`) on the player's row, or view y [`lineY` 24] over the player's column
 *   —, re-aimed every 6 ticks, then holds [`windup` 24] ticks and charges through at
 *   [`chargeSpeed` 4.5]. The stealing, its armour, its harmless body and its alarm come with its
 *   spec's `optionHunter` flag (`core/enemies`); it only spawns while some ship has an Option.
 *
 * - `cube.pincer` (M2-05) — a Direct-mode item carrier cube of a six-cube pincer wave
 *   (shmup_feat.md §6B: three from the top, three from the bottom, converging): even formation
 *   members fly from the spawn point, odd ones from its mirror image across the playfield's middle
 *   row; each flies (at [`speed` 1.5]) to view point [`meetX` 176], [`gap` 8] px above or below
 *   the middle row (its own half), then leaves left at [`leaveSpeed` 1.75]. The stage's
 *   `formation` event makes the wave — the last cube destroyed drops its `drop` (`powerup`: a
 *   capsule in meter mode, the next planned item in Direct mode).
 *
 * **Stage gimmicks (M2-07, shmup_feat.md §14)** — reusable modules the zones of M2-11 … M2-14 build
 * on (tunables in their docblocks):
 *
 * - `rock.fall` — a falling rock (a `Ballistic` body with a proximity trigger) that shatters on the
 *   terrain; also the lava stones `volcano.lob` throws.
 * - `bubble.split` — a drifting bubble that splits into its `child` enemies when shot (a
 *   {@link BehaviorDef.death} behaviour).
 * - `volcano.lob` — a ground volcano lobbing its `child` stones on ballistic arcs (seeded).
 * - `field.suction` — a pod whose pull field draws the ships towards it while it lives.
 * - `tentacle.grab` — an anchored claw on a drawn chain that lunges at a ship in reach, dragging it
 *   with a short pull field, then retracts.
 * - `cube.stack` — a cube of a seeded cube rush: a random row, aimed at the player, and where it
 *   meets the terrain it becomes the tileset's `cube` tile — the rush stacks into walls.
 *
 * **Zones B and C (M2-11)** — the new archetypes of BRINE NEBULA and DUNE EXPANSE:
 *
 * - `rocket.homing` — a homing rocket: launched diagonally away from the middle row, it homes on
 *   the nearest player for a while (turn-rate capped), then flies straight on (GALVANIC MAW's
 *   minion).
 * - `worm.burst` — a segment of a sand worm: a formation's leader lies in a dune until a player
 *   comes near, then bursts out on a ballistic arc through the terrain; the other segments follow
 *   its track.
 *
 * **Zone E (M2-12)** — TEMPEST RIDGE's rear attackers:
 *
 * - `rear.swoop` — enters from behind the view, overtakes the ship along its row to a turn point,
 *   holds, fires an aimed shot back and leaves to the left.
 *
 * **Zone F (M2-13)** — CELL VAULT's chasing cells:
 *
 * - `cell.chase` — drifts in along its row [`speed` 1.1, `enterTicks` 50], then chases the nearest
 *   player (turn-rate capped [`turnRate` 6], for [`chaseTicks` 150]) and swims straight on; one
 *   thrown out of a dividing cell flies out for [`scatterTicks` 24] first.
 *
 * **Zones H and I (M2-14)** — IRON CITADEL's laser emitters and ABYSSAL THRONE's depth mines:
 *
 * - `emitter.laser` — every [`laserTicks` 150] (the first after [`firstTicks` 40]) a telegraphed
 *   straight laser, [`heading` 512 = left], attached to the emitter ([`laserLength` 384,
 *   `laserWidth` 6, `telegraph` 50, `active` 40]); a ground emitter stands still.
 * - `mine.burst` — drifts on a sine [`speed` 0.5, `amp` 10, `period` 140]; a living player within
 *   [`trigger` 64] px arms it: it stops, flashes for [`fuse` 36] ticks and bursts into a ring of
 *   [`ring` 8] round red bullets at [`bulletSpeed` 1], gone without score or drop.
 *
 * `drifter.sine`, `fan.loop`, `carrier.straight`, `hatch.spawner`, `rammer.aimed`,
 * `hunter.option`, `cube.pincer`, the M2-07 gimmicks, the M2-11 rockets and worms and the M2-13
 * chasing cells do not fire.
 * Every shot goes through the primitives, so nothing fires off screen or before `settleTicks`.
 *
 * **Boss behaviours** (M1-13, {@link DEFAULT_BOSS_BEHAVIORS}; a boss phase's `script`, its
 * `params` override the defaults) drive `core/bosses` through the {@link BossScriptApi}; they
 * fire from the boss's **gun** parts (`"gun": true`) that are still standing:
 *
 * - `boss.hover` — follows the nearest player's height at [`trackSpeed` 0.5] px/tick, [`margin`
 *   32] px from the playfield's top and bottom; every [`fireTicks` 60] ticks (rank-scaled) each gun
 *   fires an aimed spread of [`ways` 1] round red bullets [`spread` 40 binary units apart] at
 *   [`bulletSpeed` 1.5]; with [`openTicks` 0 = never] > 0 its `whenOpen` parts open for
 *   `openTicks` after every [`closedTicks` 120] closed.
 * - `boss.lanes` — tracks like `boss.hover` [`trackSpeed` 0 = holds still]; every [`laserTicks`
 *   150] ticks the next gun in turn fires a telegraphed horizontal laser to the left in its lane
 *   (not attached, [`laserLength` 384], [`laserWidth` 6], [`telegraph` 50] warning ticks,
 *   [`active` 45] beam ticks), and every [`fireTicks` 90] ticks each gun an aimed [`ways` 3]-way
 *   of purple needles [`spread` 40] at [`bulletSpeed` 1.25].
 * - `boss.bulwark` — HALCYON BULWARK (HB-01, zone A, M1-18), a core battleship: tracks the nearest
 *   player's height slowly [`trackSpeed` 0.35, `margin` 40]; every [`laserTicks` 110] ticks
 *   (rank-scaled) the next gun in turn — the top and the bottom emitter, so the lanes alternate —
 *   fires a telegraphed horizontal laser to the left that stays **attached** to its emitter (the
 *   lane moves with the boss: [`laserLength` 384], [`laserWidth` 8], [`telegraph` 45] warning
 *   ticks, [`active` 50] beam ticks); with [`ways` 0 = never] ≥ 1 every [`fireTicks` 120] ticks
 *   (rank-scaled) each gun also fires an aimed `ways`-way of purple needles [`spread` 40] at
 *   [`bulletSpeed` 1.5]. The first lane comes [`firstLaser` 60] ticks into the phase. Lanes never
 *   come from the core: it sits between them, so the player who holds the core's lane is only
 *   threatened when the boss's slow tracking sweeps a lane across, and every lane is dodged by
 *   moving up or down (4-way).
 *
 * **Captains and raids (M2-09)** — the mid-boss archetypes of shmup_feat.md §13 (a boss section of
 * role `captain`) and the battleship raid's turrets; they fire from the standing guns (the first
 * standing part when the boss has no gun):
 *
 * - `captain.ram` — wave shooter + ram: [`waves` 3] fans of [`ways` 5] red bullets [`spread` 40,
 *   `bulletSpeed` 1.5], [`waveTicks` 36] apart (rank-scaled), then it rams — eases in [`ramTicks`
 *   45] to view x [`ramX` 40] at the nearest player's height (a straight, telegraphed horizontal
 *   dash: dodge up or down) —, flies home in [`returnTicks` 70] and rests [`restTicks` 50].
 * - `captain.launcher` — splitting launcher: tracks the player's height [`trackSpeed` 0.4,
 *   `margin` 40]; every [`launchTicks` 100] ticks up to [`count` 2] guns in turn each launch the
 *   boss's `minion` (a splitting enemy — `bubble.split`); every [`fireTicks` 70] ticks each gun an
 *   aimed [`ways` 3]-way [`spread` 48] at [`bulletSpeed` 1.25].
 * - `captain.circler` — screen-crossing circler: from its home it circles an ellipse round view
 *   point [`cx` 192, `cy` 100] with radii [`rx` 140, `ry` 64] at [`speed` 3] binary units a tick
 *   (it should start at `cx + rx`, `cy` — its home); every [`fireTicks` 60] ticks a ring of
 *   [`ring` 8] bullets [`bulletSpeed` 1.25], each turned half a gap from the last.
 * - `captain.crab` — ring-firing crab: every [`stepTicks` 70] ticks it sidesteps to a random point
 *   of the box [`minX` 250 … `maxX` 340, `minY` 40 … `maxY` 160] (gameplay RNG, in 60 % of the
 *   step); every [`ringTicks` 90] ticks each gun fires a ring of [`ring` 12] bullets
 *   [`bulletSpeed` 1.1], turned [`turn` 16] units further each time.
 * - `boss.raid` — a battleship raid's turrets: every [`fireTicks` 50] ticks each standing gun on
 *   screen turns to the nearest player (by at most [`aimStep` 0 = at once] units; its heading
 *   frames follow) and fires a [`ways` 1]-way [`spread` 32] at [`bulletSpeed` 1.5] along its new
 *   heading.
 *
 * **Zone bosses (M2-11)** — the core fires from the standing **core** parts (a mouth, a head), the
 * minions and lanes come from the standing guns:
 *
 * - `boss.maw` — GALVANIC MAW (zone B), the mechanical fish: tracks the player's height
 *   [`trackSpeed` 0.4, `margin` 44]; its `whenOpen` mouth opens for [`openTicks` 90] after every
 *   [`closedTicks` 140]; while open the cores fire aimed [`ways` 3]-ways of needles [`spread` 48,
 *   `bulletSpeed` 1.4] every [`fireTicks` 36] (and a [`ring` 0 = none] of round bullets at
 *   [`ringSpeed` 1] as it opens); every [`launchTicks` 150] up to [`count` 1] guns in turn launch
 *   the `minion` (homing rockets); with [`gape` 0 = still] > 0 the parts attached to the mouth
 *   (the jaws) move `gape` px apart while it is open.
 * - `boss.widow` — SANDGRAVE WIDOW (zone C), the arachnid: scuttles to a random point of its box
 *   every [`stepTicks` 100] [`minX` 250 … `maxX` 320, `minY` 56 … `maxY` 144]; the cores spit aimed
 *   [`ways` 3]-ways of ovals [`spread` 40, `bulletSpeed` 1.3] every [`fireTicks` 80]; every
 *   [`launchTicks` 160] up to [`count` 1] guns in turn launch the `minion` (spider drones); with
 *   [`laserTicks` 0 = never] ≥ 1 the guns in turn spin silk lines — detached horizontal lasers
 *   [`laserLength` 384, `laserWidth` 6, `telegraph` 50, `active` 40].
 *
 * **Zone bosses (M2-12)**:
 *
 * - `boss.bastion` — CINDER BASTION (zone D), a core battleship with **rotating shield arms**:
 *   every part attached to a core (the arms' pivot) turns at [`spin` 4] units a tick, reversing
 *   every [`reverseTicks` 0 = never]; it tracks like `boss.bulwark` [`trackSpeed` 0.35, `margin`
 *   44], its guns fire attached lane lasers in turn every [`laserTicks` 120] (the first after
 *   [`firstLaser` 60]; [`laserLength` 384, `laserWidth` 8, `telegraph` 45, `active` 50]), and the
 *   cores add aimed [`ways` 0 = none]-ways of ovals [`spread` 40, `bulletSpeed` 1.3] every
 *   [`fireTicks` 100] and rings of [`ring` 0 = none] at [`ringSpeed` 1] every [`ringTicks` 150].
 * - `boss.steed` — SQUALL STEED (zone E), the seahorse: bobs on the ellipse [`cx` 296, `cy` 100,
 *   `rx` 8, `ry` 40] at [`bobSpeed` 3] units a tick; its `whenOpen` chest opens for
 *   [`openTicks` 110] after every [`closedTicks` 150] and, while open, each core launches the
 *   `minion` (homing minis) every [`launchTicks` 45], at most [`minis` 2] per opening; the guns
 *   (the snout) fire aimed [`ways` 3]-ways [`spread` 44, `bulletSpeed` 1.3] every [`fireTicks`
 *   80] and, with [`ring` 0 = none] ≥ 1, a ring at [`ringSpeed` 1] as the chest shuts; [`gape` 0]
 *   moves the chest's lids apart while it is open.
 *
 * **Zone bosses (M2-13)** — both curl **arms**: chains of circle-hit parts attached to another
 * part, pointing left; every segment turns by the same amount, so an arm curls like a tentacle,
 * mirrored above and below its parent's row:
 *
 * - `boss.squid` — MANTLE REGENT (zone F), the squid: tracks [`trackSpeed` 0.35, `margin` 48];
 *   its tentacles guard the core in a cycle — straight [`openTicks` 100], curling in at [`curl` 1]
 *   unit a tick for [`sweepTicks` 48], curled in front of the core [`guardTicks` 60], uncurling —;
 *   the cores fire aimed [`ways` 3]-ways of ovals [`spread` 40, `bulletSpeed` 1.3] every
 *   [`fireTicks` 70], the tips an aimed needle every [`gunTicks` 0 = never], a [`ring` 0 = none]
 *   at [`ringSpeed` 1] bursts from the cores as the tentacles open and every [`launchTicks` 0 =
 *   never] the cores launch [`count` 1] `minion`s.
 * - `boss.facet` — FACET MONARCH (zone G), the crystal core: tracks [`trackSpeed` 0.3, `margin`
 *   50]; its arms wave at [`wave` 1] unit a tick, [`waveTicks` 40] from straight to a turn point;
 *   the tips fire aimed [`ways` 1]-ways of needles [`spread` 32, `bulletSpeed` 1.25] every
 *   [`fireTicks` 90]; the cores a [`ring` 0 = none] at [`ringSpeed` 1] every [`ringTicks` 150] and,
 *   every [`laserTicks` 0 = never], a detached lane laser [`laserLength` 384, `laserWidth` 6,
 *   `telegraph` 50, `active` 40].
 *
 * **Zone bosses (M2-14)** — the finales:
 *
 * - `boss.sovereign` — IRON SOVEREIGN (zone H), the multi-phase finale: tracking [`trackSpeed`
 *   0.3, `margin` 48], a shield wheel on its core turning at [`spin` 0] (reversing every
 *   [`reverseTicks` 0 = never]), attached lanes from its guns in turn [`laserTicks` 0 = never,
 *   `firstLaser` 60, `laserLength` 384, `laserWidth` 8, `telegraph` 45, `active` 50], aimed
 *   [`ways` 0 = none]-ways from the cores [`fireTicks` 110, `spread` 40, `bulletSpeed` 1.3], rings
 *   [`ring` 0 = none, `ringTicks` 160, `ringSpeed` 1], [`count` 1] minions from the guns every
 *   [`launchTicks` 0 = never] and a rotating [`spiral` 0 = none]-arm spiral from the cores
 *   [`spiralTicks` 8, `spiralStep` 24, `spiralSpeed` 1.1] — each phase switches on its own set.
 * - `boss.ark` — ABYSS ARK (zone I), the whale-class raid: every [`fireTicks` 60] each on-screen
 *   gun (the turret rows) aims and fires a [`ways` 1]-way [`spread` 32, `bulletSpeed` 1.3,
 *   `aimStep` 0]; every [`launchTicks` 0 = never] the next on-screen guns cast [`count` 1] hooks
 *   (the `minion`); on-screen cores ring every [`ringTicks` 180] [`ring` 0 = none, `ringSpeed` 1].
 * - `boss.angler` — THE HOLLOW KING (zone I), the boss inside the ARK: tracking [`trackSpeed`
 *   0.35, `margin` 48], a `whenOpen` mouth shut [`closedTicks` 150] / open [`openTicks` 100] with
 *   its jaws [`gape` 6] apart, aimed [`ways` 3]-ways from the cores while open [`fireTicks` 40,
 *   `spread` 44, `bulletSpeed` 1.3] and a [`ring` 0 = none] as it opens [`ringSpeed` 1]; its lure
 *   (an arm) sways [`sway` 1, `swayTicks` 40]; the lure's gun fires a needle every [`gunTicks` 0 =
 *   never] and launches [`count` 1] minions every [`launchTicks` 0 = never].
 *
 * **Implements.**
 * - shmup_feat.md §11 — archetypes (popcorn, formation fliers, capsule carriers, turrets,
 *   walkers, hatches, rammers, orbiters, the Option Hunter — M2-04) as coroutine scripts
 * - shmup_feat.md §6B — the Direct-mode item carriers: six-cube pincer waves (M2-05)
 * - shmup_feat.md §14 — stage gimmicks as reusable modules: falling rocks, splitting bubbles,
 *   volcanoes, suction, grabbing tentacles, the cube rush (M2-07)
 * - shmup_feat.md §11 / §14 — zone B and C archetypes: homing rockets and segmented sand worms
 *   (M2-11)
 * - shmup_feat.md §13 — the zone bosses GALVANIC MAW (mechanical fish: mouth weak point, homing
 *   rockets, cutters) and SANDGRAVE WIDOW (arachnid: spider drones, silk-line lasers) (M2-11)
 * - shmup_feat.md §11 — zone E's rear attackers (M2-12)
 * - shmup_feat.md §13 — the zone bosses CINDER BASTION (core battleship: rotating shield arms,
 *   lane lasers) and SQUALL STEED (seahorse: a chest that opens to launch homing minis) (M2-12)
 * - shmup_feat.md §14 — zone F's chasing cells (M2-13)
 * - shmup_feat.md §13 — the zone bosses MANTLE REGENT (squid: tentacles guard the weak point,
 *   breaking one changes its behaviour) and FACET MONARCH (crystal core: tentacle arms, the core
 *   behind crystals) (M2-13)
 * - shmup_feat.md §14 — zone H's laser emitters and zone I's mines (M2-14)
 * - shmup_feat.md §13 — the final bosses: IRON SOVEREIGN (a real multi-phase finale), the ABYSS
 *   ARK raid (whale battleship: turret rows, hooks) and THE HOLLOW KING inside it (an anglerfish
 *   with a lure — the boss inside a boss) (M2-14)
 * - shmup_tech.md §4.6 — TS generator coroutines
 * - shmup_feat.md §13 — boss phases driven by behaviour scripts (the pattern set changes with the
 *   phase)
 *
 * **Public API.** {@link BehaviorDef}, {@link BehaviorRegistry}, {@link defineBehavior},
 * {@link createBehaviorRegistry}, {@link DEFAULT_BEHAVIORS}, {@link DEFAULT_BEHAVIOR_DEFS},
 * {@link BEHAVIOR_IDS}, {@link BossBehaviorDef}, {@link BossBehaviorRegistry},
 * {@link defineBossBehavior}, {@link createBossBehaviorRegistry}, {@link DEFAULT_BOSS_BEHAVIORS},
 * {@link DEFAULT_BOSS_BEHAVIOR_DEFS}, {@link BOSS_BEHAVIOR_IDS}, {@link WEAPON_SCRIPT_IDS},
 * {@link KNOWN_SCRIPT_IDS}, {@link checkEnemyBehaviors}.
 *
 * The roster is complete for v1.0 (M2-14); `moduleInfo.status` is `implemented`.
 *
 * @module
 */
import { BulletKind, LASER_FADE_TICKS, LASER_GROW_TICKS } from '../bullets/index.js';
import { WEAPON_SCRIPT_IDS } from '../weapons/index.js';
import type { BossBehavior, BossBehaviorLookup, BossPart, BossScriptApi } from '../bosses/index.js';
import { PLAYFIELD_H, PLAYFIELD_W } from '../config/index.js';
import { MAX_BOSS_PARTS, type ContentDb, type ValidationIssue } from '../data/index.js';
import type { EnemyBehavior, EnemyBehaviorLookup, ScriptApi } from '../enemies/index.js';
import { EnemyFlag } from '../enemies/index.js';
import { defineModule } from '../module-info.js';
import { ANGLE_MASK, ANGLE_UNITS, atan2B, cosB, quantizeAngle, sinB } from '../math/index.js';
import {
  BallisticLand,
  BodyAnchor,
  MoverKind,
  SLEEP_FOREVER,
  type Script,
} from '../patterns/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'behaviors',
  status: 'implemented',
  specRefs: [
    'shmup_feat.md §11',
    'shmup_tech.md §4.6',
    'shmup_feat.md §13',
    'shmup_feat.md §6',
    'shmup_feat.md §14',
  ],
});

/**
 * One behaviour: its id, its tunables (defaults) and its coroutine factory.
 *
 * @typeParam P - The tunables' shape.
 */
export interface BehaviorDef<
  P extends Readonly<Record<string, number>> = Readonly<Record<string, number>>,
> extends EnemyBehavior {
  /** Script id content refers to. */
  readonly id: string;
  /** Tunables with their defaults (an enemy's `params` override them by name). */
  readonly params: P;
  /**
   * Creates the coroutine of one enemy.
   *
   * @param api - The enemy's script API.
   * @param params - The resolved tunables.
   * @returns The coroutine.
   */
  create(api: ScriptApi, params: P): Script;
  /** Whether the enemy must name a `child` (spawners). */
  readonly needsChild: boolean;
  /** Whether the enemy must name a `pattern` (DSL pattern runners, M2-02). */
  readonly needsPattern: boolean;
  /**
   * Called when an enemy of this behaviour is killed (M2-07 — splitting bubbles; see
   * `core/enemies` `EnemyBehavior.death`).
   *
   * @param api - The dying enemy's script API.
   * @param params - The resolved tunables.
   */
  readonly death?: (api: ScriptApi, params: P) => void;
}

/** A set of behaviours by id. */
export interface BehaviorRegistry extends EnemyBehaviorLookup {
  /** Every id, sorted. */
  readonly ids: readonly string[];
  /**
   * Finds a behaviour.
   *
   * @param id - Script id.
   * @returns The behaviour, or `undefined`.
   */
  get(id: string): BehaviorDef | undefined;
}

/**
 * Declares a behaviour with typed tunables.
 *
 * @remarks
 * `params` is copied and frozen. When an enemy spawns, the enemy system calls `create` with the
 * defaults merged with the spec's `params` (resolved once per spec at world creation — keys and
 * key order always those of the defaults) and resumes the returned generator from the spawn tick
 * on (the tick after, for a script spawn). The body should read `api.spec` / `api.self` once at
 * the start, switch movers with `api.setMover` and `yield` tick counts; it must not allocate
 * between yields (no closures, arrays or object literals — see `core/patterns`).
 *
 * @typeParam P - The tunables' shape.
 * @param id - Script id.
 * @param params - Tunables with defaults.
 * @param create - The coroutine factory.
 * @param needsChild - Whether the enemy must name a `child` (default `false`).
 * @param needsPattern - Whether the enemy must name a `pattern` (default `false`).
 * @param death - Called when such an enemy is killed (M2-07; default none — see
 *   `core/enemies` `EnemyBehavior.death`).
 * @returns The frozen definition.
 *
 * @example
 * ```ts
 * const idler = defineBehavior('idler', { speed: 1 }, function* (api, p) {
 *   api.setMover(MoverKind.Straight, -p.speed, 0);
 *   yield SLEEP_FOREVER;
 * });
 * ```
 */
export function defineBehavior<P extends Readonly<Record<string, number>>>(
  id: string,
  params: P,
  create: (api: ScriptApi, params: P) => Script,
  needsChild = false,
  needsPattern = false,
  death?: (api: ScriptApi, params: P) => void,
): BehaviorDef {
  const def: BehaviorDef = {
    id,
    params: Object.freeze({ ...params }),
    create,
    needsChild,
    needsPattern,
  };
  if (death !== undefined) {
    (def as { death?: BehaviorDef['death'] }).death = death as BehaviorDef['death'];
  }
  return Object.freeze(def);
}

/**
 * Builds a registry (load time).
 *
 * @param defs - The behaviours.
 * @returns The registry.
 * @throws {Error} When two behaviours share an id.
 *
 * @example
 * ```ts
 * const registry = createBehaviorRegistry([...DEFAULT_BEHAVIOR_DEFS, myTestBehavior]);
 * ```
 */
export function createBehaviorRegistry(defs: readonly BehaviorDef[]): BehaviorRegistry {
  const byId = new Map<string, BehaviorDef>();
  for (const def of defs) {
    if (byId.has(def.id)) throw new Error(`behaviour "${def.id}" is defined twice`);
    byId.set(def.id, def);
  }
  const ids = Object.freeze([...byId.keys()].sort());
  return Object.freeze({
    ids,
    get(id: string): BehaviorDef | undefined {
      return byId.get(id);
    },
  });
}

/**
 * Faces the enemy towards a player (sets / clears `EnemyFlag.FaceRight`).
 *
 * @param api - The enemy's API.
 */
function faceTarget(api: ScriptApi): void {
  const target = api.target();
  if (target === null) return;
  const self = api.self;
  if (target.x > self.x) self.flags |= EnemyFlag.FaceRight;
  else self.flags &= ~EnemyFlag.FaceRight;
}

/** `drifter.sine` — popcorn on a sine wave. */
const drifterSine = defineBehavior(
  'drifter.sine',
  { speed: 1.25, amp: 24, period: 96, phase: 0, memberPhase: 0 },
  function* drifter(api, p): Script {
    const member = api.self.member < 0 ? 0 : api.self.member;
    api.setMover(MoverKind.Sine, -p.speed, p.amp, p.period, p.phase + member * p.memberPhase);
    yield SLEEP_FOREVER;
  },
);

/** `fan.loop` — formation flier: the leader flies the path, the others follow it. */
const fanLoop = defineBehavior('fan.loop', { speed: 1.5 }, function* fan(api, p): Script {
  const self = api.self;
  if (self.member > 0) {
    api.setMover(MoverKind.Follow);
  } else if (self.pathId >= 0) {
    api.setMover(MoverKind.Path, self.pathId, p.speed);
  } else {
    api.setMover(MoverKind.Straight, -p.speed, 0);
  }
  yield SLEEP_FOREVER;
});

/** `carrier.straight` — the capsule carrier flies straight left. */
const carrierStraight = defineBehavior(
  'carrier.straight',
  { speed: 1 },
  function* carrier(api, p): Script {
    api.setMover(MoverKind.Straight, -p.speed, 0);
    yield SLEEP_FOREVER;
  },
);

/** `turret.floor` — a ground turret that keeps facing the nearest player and shoots at it. */
const turretFloor = defineBehavior(
  'turret.floor',
  { aimTicks: 30, fireTicks: 90, bulletSpeed: 1.5 },
  function* turret(api, p): Script {
    api.setMover(MoverKind.None);
    const step = p.aimTicks >= 1 ? p.aimTicks : 1;
    let sinceShot = 0;
    for (;;) {
      faceTarget(api);
      if (
        sinceShot >= api.fireWait(p.fireTicks) &&
        api.aimed(p.bulletSpeed, BulletKind.RoundPink) >= 0
      ) {
        sinceShot = 0;
      }
      yield step;
      sinceShot += step;
    }
  },
);

/** `walker.floor` — walk towards the player, stop, repeat. */
const walkerFloor = defineBehavior(
  'walker.floor',
  { speed: 0.75, walkTicks: 90, stopTicks: 45, bulletSpeed: 1.25, spread: 48 },
  function* walker(api, p): Script {
    for (;;) {
      const target = api.target();
      const left = target === null || target.x < api.self.x;
      api.setMover(MoverKind.GroundCrawl, left ? -p.speed : p.speed);
      yield p.walkTicks;
      api.setMover(MoverKind.None);
      faceTarget(api);
      api.nWay(3, p.spread, p.bulletSpeed, BulletKind.OvalRed);
      yield p.stopTicks;
    }
  },
);

/** `hatch.spawner` — releases its child enemy while it may fire. */
const hatchSpawner = defineBehavior(
  'hatch.spawner',
  { interval: 60, max: 8 },
  function* hatch(api, p): Script {
    api.setMover(MoverKind.None);
    const child = api.spec.childId;
    const self = api.self;
    // Children leave from the open side: the top of a floor hatch, the bottom of a ceiling one.
    const dy = self.anchor === BodyAnchor.Ceiling ? self.hh : -self.hh;
    let released = 0;
    for (;;) {
      yield p.interval;
      if (child < 0 || !api.canFire()) continue;
      if (p.max > 0 && released >= p.max) {
        yield SLEEP_FOREVER;
        continue;
      }
      if (api.spawn(child, 0, dy) !== null) released++;
    }
  },
  true,
);

/** `rammer.aimed` — enter, wind up, dash at the player. */
const rammerAimed = defineBehavior(
  'rammer.aimed',
  { enterTicks: 40, windup: 20, speed: 2.5 },
  function* rammer(api, p): Script {
    yield p.enterTicks;
    api.setMover(MoverKind.AimedDash, p.speed, p.windup);
    yield SLEEP_FOREVER;
  },
);

/** `orbiter.loop` — loop on the spawn path, or enter → hold → leave. */
const orbiterLoop = defineBehavior(
  'orbiter.loop',
  {
    speed: 1.25,
    x: 256,
    y: 100,
    hold: 90,
    leaveSpeed: 2,
    ringTicks: 120,
    ringCount: 8,
    bulletSpeed: 1,
  },
  function* orbiter(api, p): Script {
    const self = api.self;
    if (self.pathId >= 0) {
      api.setMover(MoverKind.Path, self.pathId, p.speed);
    } else {
      api.setMover(MoverKind.Waypoint, p.x, p.y, p.speed, p.hold, -p.leaveSpeed, 0);
    }
    const count = p.ringCount >= 1 ? Math.floor(p.ringCount) : 0;
    if (count === 0) yield SLEEP_FOREVER;
    const halfGap = ANGLE_UNITS / count / 2;
    let rings = 0;
    for (;;) {
      yield api.fireWait(p.ringTicks);
      if (api.ring(count, p.bulletSpeed, BulletKind.RoundPurple, (rings & 1) * halfGap) > 0) {
        rings++;
      }
    }
  },
);

/**
 * `pattern.loop` — runs the enemy's `content/patterns/` DSL pattern (its spec's `pattern`, M2-02)
 * over and over: the pattern's `wait`s are the coroutine's sleeps, and [`restTicks` 60] ticks
 * pass between the end of one run and the next. `relative` directions measure from [`heading`
 * 512 = left]. Its motion is the spec's `mover` (it sets none).
 */
const patternLoop = defineBehavior(
  'pattern.loop',
  { restTicks: 60, heading: ANGLE_UNITS / 2 },
  function* pattern(api, p): Script {
    const id = api.spec.patternId;
    const rest = p.restTicks >= 1 ? Math.floor(p.restTicks) : 1;
    if (!api.startPattern(id, p.heading)) yield SLEEP_FOREVER;
    for (;;) {
      const wait = api.stepPattern();
      if (wait > 0) {
        yield wait;
        continue;
      }
      yield rest;
      api.startPattern(id, p.heading);
    }
  },
  false,
  true,
);

/** Option Hunter variant: from behind, along the ship's row. */
const HUNTER_REAR = 0;

/** Option Hunter variant: from ahead, along the ship's row. */
const HUNTER_FRONT = 1;

/** Ticks between two re-aims of an Option Hunter lining up. */
const HUNTER_RETARGET_TICKS = 6;

/** Closest an Option Hunter lines up to the playfield's edges (px). */
const HUNTER_EDGE = 12;

/**
 * `hunter.option` — the Option Hunter (plan M2-04, shmup_feat.md §8 / §11): lines up with the
 * nearest player, then charges through; the enemy system does the stealing (its spec's
 * `optionHunter`). Three variants (tunables in the module docs):
 *
 * - [`variant` 0] **rear** — lines up at view x [`lineX` 48] on the player's row, charges right;
 * - `variant` 1 **front** — lines up at view x `384 − lineX` on the player's row, charges left;
 * - `variant` 2 **dive** — lines up at view y [`lineY` 24] above the player's column, dives down.
 *
 * @remarks
 * For [`lineUpTicks` 90] ticks it re-aims a `Waypoint` mover at the line-up point every
 * {@link HUNTER_RETARGET_TICKS} ticks (approach at [`speed` 2]); the last one is kept: it arrives,
 * holds [`windup` 24] ticks and charges at [`chargeSpeed` 4.5] until it leaves the view. Points
 * stay {@link HUNTER_EDGE} px inside the playfield. It never fires. Without a living player it
 * lines up where it is.
 */
const hunterOption = defineBehavior(
  'hunter.option',
  { variant: 0, lineUpTicks: 90, speed: 2, windup: 24, chargeSpeed: 4.5, lineX: 48, lineY: 24 },
  function* hunter(api, p): Script {
    const variant = p.variant >= 2 ? 2 : p.variant >= 1 ? HUNTER_FRONT : HUNTER_REAR;
    const self = api.self;
    const camera = api.camera;
    const lineUp = p.lineUpTicks >= 1 ? Math.floor(p.lineUpTicks) : 1;
    const hold = p.windup >= 0 ? Math.floor(p.windup) : 0;
    let waited = 0;
    while (waited < lineUp) {
      const target = api.target();
      if (variant === 2) {
        let tx = (target === null ? self.x : target.x) - camera.x;
        tx =
          tx < HUNTER_EDGE
            ? HUNTER_EDGE
            : tx > PLAYFIELD_W - HUNTER_EDGE
              ? PLAYFIELD_W - HUNTER_EDGE
              : tx;
        api.setMover(MoverKind.Waypoint, tx, p.lineY, p.speed, hold, 0, p.chargeSpeed);
      } else {
        let ty = (target === null ? self.y : target.y) - camera.y;
        ty =
          ty < HUNTER_EDGE
            ? HUNTER_EDGE
            : ty > PLAYFIELD_H - HUNTER_EDGE
              ? PLAYFIELD_H - HUNTER_EDGE
              : ty;
        const lx = variant === HUNTER_REAR ? p.lineX : PLAYFIELD_W - p.lineX;
        const vx = variant === HUNTER_REAR ? p.chargeSpeed : -p.chargeSpeed;
        api.setMover(MoverKind.Waypoint, lx, ty, p.speed, hold, vx, 0);
      }
      yield HUNTER_RETARGET_TICKS;
      waited += HUNTER_RETARGET_TICKS;
    }
    yield SLEEP_FOREVER;
  },
);

/**
 * `cube.pincer` — a cube of a six-cube pincer wave (plan M2-05, shmup_feat.md §6B): odd formation
 * members start mirrored across the playfield's middle row, every cube flies to its meeting point
 * beside the middle row, then leaves left (tunables in the module docs). It never fires.
 *
 * @remarks
 * The mirror is done once, when the script starts (the spawn tick): the cube's world y becomes the
 * camera's y plus `PLAYFIELD_H` minus its view y.
 */
const cubePincer = defineBehavior(
  'cube.pincer',
  { speed: 1.5, meetX: 176, gap: 8, leaveSpeed: 1.75 },
  function* cube(api, p): Script {
    const self = api.self;
    const camera = api.camera;
    const member = self.member < 0 ? 0 : self.member;
    let viewY = self.y - camera.y;
    if ((member & 1) === 1) {
      viewY = PLAYFIELD_H - viewY;
      self.y = camera.y + viewY;
    }
    const half = PLAYFIELD_H / 2;
    const meetY = viewY < half ? half - p.gap : half + p.gap;
    api.setMover(MoverKind.Waypoint, p.meetX, meetY, p.speed, 0, -p.leaveSpeed, 0);
    yield SLEEP_FOREVER;
  },
);

// ------------------------------------------------------------------------------ gimmicks (M2-07)

/**
 * `rock.fall` (M2-07) — a falling rock or a lobbed lava stone: a `Ballistic` body that waits, still,
 * until the nearest player is within [`trigger` 48] px horizontally (0 = falls at once), then
 * falls under [`gravity` 0.15] px/tick² up to [`maxFall` 4] px/tick and **shatters** on the
 * terrain it lands on (`core/enemies` destroys it with its explosion — no score). A body that
 * already flies a `Ballistic` mover (thrown by `volcano.lob`) keeps it. It never fires.
 */
const rockFall = defineBehavior(
  'rock.fall',
  { trigger: 48, gravity: 0.15, maxFall: 4 },
  function* rock(api, p): Script {
    if (api.self.mover !== MoverKind.Ballistic) {
      const trigger = p.trigger > 0 ? p.trigger : 0;
      api.setMover(MoverKind.Ballistic, 0, 0, p.gravity, p.maxFall, trigger, BallisticLand.Shatter);
    }
    yield SLEEP_FOREVER;
  },
);

/**
 * `bubble.split` (M2-07) — a bubble that **splits** when shot: it drifts left at [`speed` 0.75] on
 * a sine wave [`amp` 16, `period` 120]; killed, it releases [`count` 2] of its `child` enemy fanned
 * [`spread` 256 binary units] around "left", flying out at [`splitSpeed` 1.25] for
 * [`scatterTicks` 30] ticks before they drift in turn (a child may split again). The Mega Crash and
 * the blue capsule pop it without a split.
 */
const bubbleSplit = defineBehavior(
  'bubble.split',
  { speed: 0.75, amp: 16, period: 120, count: 2, splitSpeed: 1.25, spread: 256, scatterTicks: 30 },
  function* bubble(api, p): Script {
    // A child of a split flies out first (its parent set a straight mover on it).
    if (api.self.mover === MoverKind.Straight) yield p.scatterTicks >= 1 ? p.scatterTicks : 1;
    api.setMover(MoverKind.Sine, -p.speed, p.amp, p.period, 0);
    yield SLEEP_FOREVER;
  },
  false,
  false,
  (api, p) => {
    const child = api.spec.childId;
    const count = p.count >= 1 ? Math.floor(p.count) : 0;
    if (child < 0 || count === 0) return;
    const first = ANGLE_UNITS / 2 - p.spread / 2;
    const step = count > 1 ? p.spread / (count - 1) : 0;
    for (let k = 0; k < count; k++) {
      const piece = api.spawn(child, 0, 0);
      if (piece === null) continue;
      const angle = Math.floor(count > 1 ? first + step * k : ANGLE_UNITS / 2);
      api.setMoverOf(
        piece,
        MoverKind.Straight,
        cosB(angle) * p.splitSpeed,
        sinB(angle) * p.splitSpeed,
      );
    }
  },
);

/**
 * `volcano.lob` (M2-07) — a ground volcano: every [`interval` 90] ticks (rank-scaled) while it may
 * fire it throws [`count` 3] of its `child` enemy (lava stones — give them `rock.fall`) from its top,
 * each up at a random [`minUp` 2.5 … `maxUp` 3.5] px/tick and sideways at a random ± [`spread`
 * 1.25], on a `Ballistic` arc of [`gravity` 0.08] (at most [`maxFall` 3]) that shatters on the
 * terrain. Randomness is the gameplay stream (replay-safe).
 */
const volcanoLob = defineBehavior(
  'volcano.lob',
  { interval: 90, count: 3, minUp: 2.5, maxUp: 3.5, spread: 1.25, gravity: 0.08, maxFall: 3 },
  function* volcano(api, p): Script {
    api.setMover(MoverKind.None);
    const child = api.spec.childId;
    const self = api.self;
    const count = p.count >= 1 ? Math.floor(p.count) : 1;
    const rng = api.rng;
    for (;;) {
      yield api.fireWait(p.interval);
      if (child < 0 || !api.canFire()) continue;
      for (let k = 0; k < count; k++) {
        const stone = api.spawn(child, 0, -self.hh - 4);
        if (stone === null) break;
        const up = p.minUp + (p.maxUp - p.minUp) * rng.nextFloat();
        const side = (rng.nextFloat() * 2 - 1) * p.spread;
        api.setMoverOf(
          stone,
          MoverKind.Ballistic,
          side,
          -up,
          p.gravity,
          p.maxFall,
          0,
          BallisticLand.Shatter,
        );
      }
    }
  },
  true,
);

/**
 * `field.suction` (M2-07) — a suction pod: once on screen it starts a **pull field** (`ScriptApi
 * .pull`) that draws every living ship within [`radius` 160] px towards it at [`strength` 0.6]
 * px/tick for as long as it lives (its spec's `mover` moves it). It never fires; destroying it ends
 * the pull.
 */
const fieldSuction = defineBehavior(
  'field.suction',
  { radius: 160, strength: 0.6 },
  function* suction(api, p): Script {
    while (!api.onScreen()) yield 8;
    api.pull(p.radius, p.strength, 0);
    yield SLEEP_FOREVER;
  },
);

/**
 * `tentacle.grab` (M2-07) — a grabbing tentacle anchored where it spawns (a floor or ceiling
 * enemy): its arm is a chain of [`links` 8] links drawn from the anchor to the claw (the enemy).
 * When the nearest player comes within [`reach` 96] px of the anchor it lunges — homing at [`speed`
 * 2] px/tick, turning [`turnRate` 12] units a tick, for [`extendTicks` 48] ticks — with a pull
 * field of [`grabRadius` 40] px and [`grabPull` 0.5] px/tick dragging the ship towards the claw;
 * then it lets go, retracts to the anchor at [`retractSpeed` 1.5] and rests [`restTicks` 60] ticks.
 * The claw's body kills on contact like any enemy; it never fires.
 */
const tentacleGrab = defineBehavior(
  'tentacle.grab',
  {
    links: 8,
    reach: 96,
    speed: 2,
    turnRate: 12,
    extendTicks: 48,
    grabRadius: 40,
    grabPull: 0.5,
    retractSpeed: 1.5,
    restTicks: 60,
  },
  function* tentacle(api, p): Script {
    const self = api.self;
    const anchorX = self.x;
    const anchorY = self.y;
    api.chain(anchorX, anchorY, p.links);
    api.setMover(MoverKind.None);
    const extend = p.extendTicks >= 1 ? Math.floor(p.extendTicks) : 1;
    const rest = p.restTicks >= 1 ? Math.floor(p.restTicks) : 1;
    for (;;) {
      const target = api.target();
      const near =
        target !== null &&
        api.canFire() &&
        Math.abs(target.x - anchorX) <= p.reach &&
        Math.abs(target.y - anchorY) <= p.reach;
      if (!near) {
        yield 12;
        continue;
      }
      api.setMover(MoverKind.Homing, p.speed, Math.floor(p.turnRate));
      api.pull(p.grabRadius, p.grabPull, extend);
      yield extend;
      api.release();
      api.setMover(MoverKind.Waypoint, anchorX, anchorY, p.retractSpeed, 1, 0, 0);
      const dx = self.x - anchorX;
      const dy = self.y - anchorY;
      const back = Math.ceil(
        Math.sqrt(dx * dx + dy * dy) / (p.retractSpeed > 0 ? p.retractSpeed : 1),
      );
      yield back + rest;
    }
  },
);

/** Scale of the whole-number vectors a cube aims with (as the movers' `atan2B` calls). */
const CUBE_AIM_SCALE = 64;

/**
 * `cube.stack` (M2-07) — one cube of a **seeded cube rush** (shmup_feat.md §14, the crystal
 * stage): when it spawns it moves to a random row of the view — [`margin` 24] px from the top and
 * bottom, drawn from the gameplay stream — aims at the nearest player (32 directions) and flies at
 * [`speed` 2] px/tick on a `Ballistic` mover that stops at the terrain. Where it stops it **becomes
 * terrain**: the tileset's tile named `cube` is placed in its cell (the rush stacks into walls —
 * destructible when the tile has `hp`) and the cube is gone; with no such tile or cell it
 * shatters. A `formation` event makes the rush. It never fires.
 */
const cubeStack = defineBehavior(
  'cube.stack',
  { speed: 2, margin: 24 },
  function* cube(api, p): Script {
    const self = api.self;
    const camera = api.camera;
    const span = PLAYFIELD_H - 2 * p.margin;
    if (span > 0) self.y = camera.y + p.margin + api.rng.rangeInt(0, Math.floor(span));
    const target = api.target();
    let angle = ANGLE_UNITS / 2;
    if (target !== null) {
      angle = quantizeAngle(
        atan2B(
          ((target.y - self.y) * CUBE_AIM_SCALE) | 0,
          ((target.x - self.x) * CUBE_AIM_SCALE) | 0,
        ),
        32,
      );
    }
    const tile = api.tileId('cube');
    api.setMover(
      MoverKind.Ballistic,
      cosB(angle) * p.speed,
      sinB(angle) * p.speed,
      0,
      0,
      0,
      BallisticLand.Stop,
    );
    yield SLEEP_FOREVER;
    // Woken the tick after it landed.
    if (tile > 0 && api.placeTile(self.x, self.y, tile)) api.destroy(false);
    else api.destroy(true);
  },
);

// ------------------------------------------------------------------------- zones B and C (M2-11)

/**
 * `rocket.homing` (M2-11) — a homing rocket (GALVANIC MAW's minion in zone B): it launches
 * diagonally away from the playfield's middle row and to the left — up-left above the middle,
 * down-left below it — at [`launchSpeed` 1] px/tick for [`launchTicks` 24] ticks, then homes on
 * the nearest living player at [`speed` 1.25] px/tick, turning at most [`turnRate` 5] binary units
 * a tick, for [`homeTicks` 60] ticks, and then flies straight on along its last heading until it
 * leaves the view. It never fires; its body is the danger (shoot it, or outturn it: the turn cap
 * and the time limit keep it dodgeable with four directions — shmup_feat.md §4 rule 2).
 *
 * @remarks
 * The straight run after the homing is a `Homing` mover with a turn rate of 0 — the mover derives
 * its heading from the velocity it had, so the rocket keeps its course without a jump.
 */
const rocketHoming = defineBehavior(
  'rocket.homing',
  { launchTicks: 24, launchSpeed: 1, speed: 1.25, turnRate: 5, homeTicks: 60 },
  function* rocket(api, p): Script {
    const self = api.self;
    const out = p.launchSpeed * Math.SQRT1_2;
    const above = self.y < api.camera.y + PLAYFIELD_H / 2;
    api.setMover(MoverKind.Straight, -out, above ? -out : out);
    yield p.launchTicks >= 1 ? Math.floor(p.launchTicks) : 1;
    api.setMover(MoverKind.Homing, p.speed, p.turnRate >= 0 ? Math.floor(p.turnRate) : 0);
    yield p.homeTicks >= 1 ? Math.floor(p.homeTicks) : 1;
    api.setMover(MoverKind.Homing, p.speed, 0);
    yield SLEEP_FOREVER;
  },
);

/**
 * `worm.burst` (M2-11) — a segment of a **sand worm** bursting from a dune (zone C, shmup_feat.md
 * §11 "segmented worms"): a `formation` of floor enemies makes one worm. The leader (member 0, or
 * a lone spawn) lies in the sand where it spawned until the nearest living player comes within
 * [`trigger` 128] px horizontally (0 = at once), then bursts out on a `Ballistic` arc — [`vx` −0.8]
 * px/tick sideways (world frame), [`up` 3.4] px/tick up, [`gravity` 0.075], at most [`maxFall` 4] —
 * that passes through the terrain, diving back into the ground and out of the view; every other
 * member replays the leader's recorded track (`Follow`), so the body rises out of the same hole
 * segment by segment and follows the head down. It never fires.
 *
 * @remarks
 * Ground bodies move in the world, so the arc is fixed to the dune it came from while the stage
 * scrolls. A dead or departed leader keeps recording as a ghost (`core/enemies`), so the rest of
 * the worm still follows the arc.
 */
const wormBurst = defineBehavior(
  'worm.burst',
  { trigger: 128, vx: -0.8, up: 3.4, gravity: 0.075, maxFall: 4 },
  function* worm(api, p): Script {
    if (api.self.member > 0) {
      api.setMover(MoverKind.Follow);
    } else {
      api.setMover(
        MoverKind.Ballistic,
        p.vx,
        -p.up,
        p.gravity,
        p.maxFall,
        p.trigger > 0 ? p.trigger : 0,
        BallisticLand.Pass,
      );
    }
    yield SLEEP_FOREVER;
  },
);

// ------------------------------------------------------------------------- zones D and E (M2-12)

/**
 * `rear.swoop` (M2-12) — a **rear attacker** (zone E, shmup_feat.md §11 "rear attackers / jumpers
 * — enter from behind"): spawned behind the view (a negative `screenX`), it flies along its spawn
 * row to the right at [`speed` 1.6] px/tick, overtaking the ship, to view x [`turnX` 280]; there it
 * holds [`hold` 18] ticks, turns to the nearest player and — half-way through the hold — fires an
 * aimed [`ways` 1]-way of pink needles [`spread` 40 binary units apart] at [`bulletSpeed` 1.3]
 * (`ways` 0 = none), then leaves to the left at [`leaveSpeed` 1.4] px/tick, back through the
 * playfield along its row.
 *
 * @remarks
 * The motion is one `Waypoint` mover (approach, hold, leave), so the script wakes once: at the
 * shot, `⌈|turnX − x| / speed⌉ + (hold >> 1) + 1` ticks after it starts. The distance counts
 * either way — one spawned right of `turnX` flies back to it first and still fires half-way
 * through its hold (M2-12 test round: timing it as if it stood there already put the shot inside
 * the settle time, where it was dropped). A `hold` below 1 is one tick, a `speed` of 0 or less is
 * 1 px/tick, `ways` is floored. A rear attacker is dodged like anything else with four
 * directions: it keeps its row, so the ship leaves that row while it overtakes and again while it
 * flies back. Guide: `docs/dev/zones-d-and-e.md`.
 */
const rearSwoop = defineBehavior(
  'rear.swoop',
  {
    speed: 1.6,
    turnX: 280,
    hold: 18,
    ways: 1,
    spread: 40,
    bulletSpeed: 1.3,
    leaveSpeed: 1.4,
  },
  function* swoop(api, p): Script {
    const self = api.self;
    const camera = api.camera;
    const speed = p.speed > 0 ? p.speed : 1;
    const hold = p.hold >= 1 ? Math.floor(p.hold) : 1;
    const ways = p.ways >= 1 ? Math.floor(p.ways) : 0;
    const row = self.y - camera.y;
    const ahead = p.turnX - (self.x - camera.x);
    api.setMover(MoverKind.Waypoint, p.turnX, row, speed, hold, -p.leaveSpeed, 0);
    // The straight distance either way: one spawned right of `turnX` flies back to it first.
    const approach = Math.ceil((ahead > 0 ? ahead : -ahead) / speed) | 0;
    yield approach + (hold >> 1) + 1;
    if (ways > 0) {
      faceTarget(api);
      api.nWay(ways, p.spread, p.bulletSpeed, BulletKind.NeedlePink);
    }
    yield SLEEP_FOREVER;
  },
);

// ------------------------------------------------------------------------------ zone F (M2-13)

/**
 * `cell.chase` (M2-13) — a **chasing cell** (zone F, shmup_feat.md §14 "organic cells: chasing
 * cells"): it drifts in along its row to the left at [`speed` 1.1] px/tick for [`enterTicks` 50]
 * ticks, then chases the nearest living player — a `Homing` mover at `speed`, turning at most
 * [`turnRate` 6] binary units a tick — for [`chaseTicks` 150] ticks, and then swims straight on
 * along its last heading until it leaves the view. A cell thrown out of a dividing cell (a
 * `bubble.split` parent — the mitosis cell — set a straight mover on it) first flies out for
 * [`scatterTicks` 24] ticks instead of drifting in; one launched by a boss (`BossScriptApi.launch`
 * — MANTLE REGENT's) drifts in from where it was launched. It never fires; its body is the danger.
 *
 * @remarks
 * Three wakes in its life. The chase is dodgeable with four directions (shmup_feat.md §4 rule 2):
 * the turn cap keeps it from following a ship that changes lanes, the time limit ends the chase,
 * and the straight run after it is a `Homing` mover with a turn rate of 0 (it keeps its course
 * without a jump, like `rocket.homing`). A `speed` of 0 or less is 1 px/tick; the tick counts below
 * 1 are one tick, `turnRate` is floored and below 0 is 0. The content test holds `speed` to the
 * 2-px/tick rule of aimed shots (it flies at the ship). Guide: `docs/dev/zones-f-and-g.md`.
 *
 * @example
 * ```json
 * { "id": "chaser-cell", "hp": 2, "score": 200, "script": "cell.chase",
 *   "params": { "speed": 1.05, "enterTicks": 46, "turnRate": 5, "chaseTicks": 130 } }
 * ```
 */
const cellChase = defineBehavior(
  'cell.chase',
  { speed: 1.1, enterTicks: 50, turnRate: 6, chaseTicks: 150, scatterTicks: 24 },
  function* chase(api, p): Script {
    const speed = p.speed > 0 ? p.speed : 1;
    if (api.self.mover === MoverKind.Straight) {
      yield p.scatterTicks >= 1 ? Math.floor(p.scatterTicks) : 1;
    } else {
      api.setMover(MoverKind.Straight, -speed, 0);
      yield p.enterTicks >= 1 ? Math.floor(p.enterTicks) : 1;
    }
    api.setMover(MoverKind.Homing, speed, p.turnRate >= 0 ? Math.floor(p.turnRate) : 0);
    yield p.chaseTicks >= 1 ? Math.floor(p.chaseTicks) : 1;
    api.setMover(MoverKind.Homing, speed, 0);
    yield SLEEP_FOREVER;
  },
);

// ------------------------------------------------------------------------- zones H and I (M2-14)

/**
 * `emitter.laser` (M2-14) — a **laser emitter** (zone H, shmup_feat.md §14 "fortress: laser
 * emitters"): every [`laserTicks` 150] ticks (rank-scaled; the first [`firstTicks` 40] ticks after
 * it starts) while it may fire it projects a telegraphed straight laser from its centre, heading
 * [`heading` 512 = left] binary units, [`laserLength` 384] long and [`laserWidth` 6] wide:
 * [`telegraph` 50] warning ticks, the grow, [`active` 40] beam ticks, the fade. The beam stays
 * **attached** to the emitter — on a floor or ceiling emitter it scrolls with the terrain — and
 * vanishes with it. A ground emitter stands still; an air one moves with its spec's `mover`.
 *
 * @remarks
 * One wake per beam; every timer is a whole number. Leftward lanes along the emitter's row are
 * dodged by moving up or down (4-way, shmup_feat.md §4 rule 2) — the content keeps two emitters'
 * beams from overlapping in time closer than the lane-gap rule allows. `laserTicks` and
 * `firstTicks` below 1 are one tick. Guide: `docs/dev/zones-h-and-i.md`.
 *
 * @example
 * ```json
 * { "id": "laser-emitter", "hp": 6, "score": 500, "ground": "floor", "script": "emitter.laser",
 *   "params": { "laserTicks": 180, "telegraph": 60, "active": 36 } }
 * ```
 */
const emitterLaser = defineBehavior(
  'emitter.laser',
  {
    firstTicks: 40,
    laserTicks: 150,
    heading: ANGLE_UNITS / 2,
    laserLength: 384,
    laserWidth: 6,
    telegraph: 50,
    active: 40,
  },
  function* emitter(api, p): Script {
    if (api.self.anchor !== BodyAnchor.Air) api.setMover(MoverKind.None);
    const heading = Math.floor(p.heading) & ANGLE_MASK;
    const laserTicks = p.laserTicks >= 1 ? Math.floor(p.laserTicks) : 1;
    yield p.firstTicks >= 1 ? Math.floor(p.firstTicks) : 1;
    for (;;) {
      if (api.canFire()) {
        api.laser(
          heading,
          p.laserLength,
          p.laserWidth,
          p.telegraph,
          LASER_GROW_TICKS,
          p.active,
          LASER_FADE_TICKS,
        );
      }
      yield api.fireWait(laserTicks);
    }
  },
);

/**
 * `mine.burst` (M2-14) — a **depth mine** (zone I, shmup_feat.md §13 "splitting orbs, mines"): it
 * drifts left on a sine wave [`speed` 0.5, `amp` 10, `period` 140] until the nearest living player
 * comes within [`trigger` 64] px (horizontally and vertically) while it may fire; then it **arms** —
 * stops where it is in the view, flashing — and [`fuse` 36] ticks later bursts into a ring of
 * [`ring` 8] round red bullets at [`bulletSpeed` 1] and is gone (no score, no drop — shoot it before
 * it arms for those). `trigger` 0 = it never arms (a plain drifting obstacle).
 *
 * @remarks
 * A waiting mine sleeps until the enemy system's proximity wake (`ScriptApi.sleepUntilNear` —
 * tested in the tick's movement phase, so a waiting mine costs no script wakes); the fuse is one
 * more sleep. The ring's gaps (45° at 8 bullets) are wide enough to step through with four
 * directions. `fuse` below 1 is one tick, `ring` below 1 fires nothing.
 * Guide: `docs/dev/zones-h-and-i.md`.
 */
const mineBurst = defineBehavior(
  'mine.burst',
  { speed: 0.5, amp: 10, period: 140, trigger: 64, fuse: 36, ring: 8, bulletSpeed: 1 },
  function* mine(api, p): Script {
    const self = api.self;
    api.setMover(MoverKind.Sine, -p.speed, p.amp, p.period, 0);
    const trigger = p.trigger > 0 ? p.trigger : 0;
    if (trigger === 0) yield SLEEP_FOREVER;
    const fuse = p.fuse >= 1 ? Math.floor(p.fuse) : 1;
    const ring = p.ring >= 1 ? Math.floor(p.ring) : 0;
    // Woken by the enemy system when a ship comes within `trigger` px (no polling wakes).
    yield api.sleepUntilNear(trigger);
    api.setMover(MoverKind.None);
    self.flashTicks = fuse;
    yield fuse;
    if (ring > 0) api.ring(ring, p.bulletSpeed, BulletKind.RoundRed, 0);
    api.destroy(true);
  },
);

/** The roster's definitions (see the module docs), e.g. to extend a registry in tests. */
export const DEFAULT_BEHAVIOR_DEFS: readonly BehaviorDef[] = Object.freeze([
  drifterSine,
  fanLoop,
  carrierStraight,
  turretFloor,
  walkerFloor,
  hatchSpawner,
  rammerAimed,
  orbiterLoop,
  patternLoop,
  hunterOption,
  cubePincer,
  rockFall,
  bubbleSplit,
  volcanoLob,
  fieldSuction,
  tentacleGrab,
  cubeStack,
  rocketHoming,
  wormBurst,
  rearSwoop,
  cellChase,
  emitterLaser,
  mineBurst,
]);

/** The roster as a registry (what the World uses). */
export const DEFAULT_BEHAVIORS: BehaviorRegistry = createBehaviorRegistry(DEFAULT_BEHAVIOR_DEFS);

/** Ids of {@link DEFAULT_BEHAVIORS}, sorted. */
export const BEHAVIOR_IDS: readonly string[] = DEFAULT_BEHAVIORS.ids;

/**
 * One boss behaviour: its id, its tunables (defaults) and its coroutine factory (M1-13).
 *
 * @typeParam P - The tunables' shape.
 */
export interface BossBehaviorDef<
  P extends Readonly<Record<string, number>> = Readonly<Record<string, number>>,
> extends BossBehavior {
  /** Script id a boss phase refers to. */
  readonly id: string;
  /** Tunables with their defaults (a phase's `params` override them by name). */
  readonly params: P;
  /**
   * Creates the coroutine of one phase.
   *
   * @param api - The boss's script API.
   * @param params - The resolved tunables.
   * @returns The coroutine.
   */
  create(api: BossScriptApi, params: P): Script;
}

/** A set of boss behaviours by id. */
export interface BossBehaviorRegistry extends BossBehaviorLookup {
  /** Every id, sorted. */
  readonly ids: readonly string[];
  /**
   * Finds a boss behaviour.
   *
   * @param id - Script id.
   * @returns The behaviour, or `undefined`.
   */
  get(id: string): BossBehaviorDef | undefined;
}

/**
 * Declares a boss behaviour with typed tunables (see {@link defineBehavior} — the same rules: read
 * the API once at the start, `yield` tick counts, no allocation between yields, integer locals).
 *
 * @typeParam P - The tunables' shape.
 * @param id - Script id.
 * @param params - Tunables with defaults.
 * @param create - The coroutine factory.
 * @returns The frozen definition.
 *
 * @example
 * ```ts
 * const sitter = defineBossBehavior('boss.sit', { fireTicks: 60 }, function* (api, p) {
 *   for (;;) {
 *     yield api.fireWait(p.fireTicks);
 *     api.aimed(api.partIndex('core'), 1.5, BulletKind.RoundRed);
 *   }
 * });
 * ```
 */
export function defineBossBehavior<P extends Readonly<Record<string, number>>>(
  id: string,
  params: P,
  create: (api: BossScriptApi, params: P) => Script,
): BossBehaviorDef {
  return Object.freeze({
    id,
    params: Object.freeze({ ...params }),
    create: create as (api: BossScriptApi, params: Readonly<Record<string, number>>) => Script,
  });
}

/**
 * Builds a boss behaviour registry (load time).
 *
 * @param defs - The behaviours.
 * @returns The registry.
 * @throws {Error} When two behaviours share an id.
 */
export function createBossBehaviorRegistry(defs: readonly BossBehaviorDef[]): BossBehaviorRegistry {
  const byId = new Map<string, BossBehaviorDef>();
  for (const def of defs) {
    if (byId.has(def.id)) throw new Error(`boss behaviour "${def.id}" is defined twice`);
    byId.set(def.id, def);
  }
  const ids = Object.freeze([...byId.keys()].sort());
  return Object.freeze({
    ids,
    get(id: string): BossBehaviorDef | undefined {
      return byId.get(id);
    },
  });
}

/** A timer that never runs out, as a small integer (see `boss.hover`). */
const NEVER_TICKS = 0x3fffffff;

/**
 * Fires an aimed spread from every standing gun part of the boss.
 *
 * @param api - The boss's API.
 * @param ways - Bullets per gun.
 * @param spread - Binary units between neighbours.
 * @param speed - Speed on Normal.
 * @param kind - `BulletKind`.
 * @returns Bullets fired.
 */
function fireGuns(
  api: BossScriptApi,
  ways: number,
  spread: number,
  speed: number,
  kind: number,
): number {
  const parts = api.self.parts;
  let fired = 0;
  for (let i = 0; i < api.partCount; i++) {
    if (parts[i].gun && !parts[i].destroyed) fired += api.nWay(i, ways, spread, speed, kind);
  }
  return fired;
}

/** `boss.hover` — track the player's height, aimed spreads from the guns, open / close. */
const bossHover = defineBossBehavior(
  'boss.hover',
  {
    trackSpeed: 0.5,
    margin: 32,
    fireTicks: 60,
    bulletSpeed: 1.5,
    ways: 1,
    spread: 40,
    openTicks: 0,
    closedTicks: 120,
  },
  function* hover(api, p): Script {
    api.track(p.trackSpeed, p.margin, PLAYFIELD_H - p.margin);
    const ways = p.ways >= 1 ? Math.floor(p.ways) : 1;
    const openTicks = p.openTicks >= 1 ? Math.floor(p.openTicks) : 0;
    const closedTicks = p.closedTicks >= 1 ? Math.floor(p.closedTicks) : 1;
    let open = false;
    api.setOpenAll(false);
    let fireIn = api.fireWait(p.fireTicks);
    // A whole-number "never" (not `SLEEP_FOREVER`): an Infinity in a generator local is a heap
    // number, and `toggleIn -= wait` would allocate a new one on every wake.
    let toggleIn = openTicks > 0 ? closedTicks : NEVER_TICKS;
    for (;;) {
      const wait = fireIn < toggleIn ? fireIn : toggleIn;
      yield wait;
      fireIn -= wait;
      toggleIn -= wait;
      if (fireIn <= 0) {
        fireGuns(api, ways, p.spread, p.bulletSpeed, BulletKind.RoundRed);
        fireIn = api.fireWait(p.fireTicks);
      }
      if (toggleIn <= 0) {
        open = !open;
        api.setOpenAll(open);
        toggleIn = open ? openTicks : closedTicks;
      }
    }
  },
);

/** `boss.lanes` — lane lasers from the guns in turn, aimed spreads between them. */
const bossLanes = defineBossBehavior(
  'boss.lanes',
  {
    trackSpeed: 0,
    margin: 32,
    laserTicks: 150,
    laserLength: 384,
    laserWidth: 6,
    telegraph: 50,
    active: 45,
    fireTicks: 90,
    bulletSpeed: 1.25,
    ways: 3,
    spread: 40,
  },
  function* lanes(api, p): Script {
    api.track(p.trackSpeed, p.margin, PLAYFIELD_H - p.margin);
    const ways = p.ways >= 1 ? Math.floor(p.ways) : 1;
    const laserTicks = p.laserTicks >= 1 ? Math.floor(p.laserTicks) : 1;
    let next = 0;
    let laserIn = laserTicks;
    let fireIn = api.fireWait(p.fireTicks);
    for (;;) {
      const wait = fireIn < laserIn ? fireIn : laserIn;
      yield wait;
      fireIn -= wait;
      laserIn -= wait;
      if (laserIn <= 0) {
        // The next standing gun in turn (lanes alternate between the guns).
        const parts = api.self.parts;
        const count = api.partCount;
        for (let k = 0; k < count; k++) {
          const i = (next + k) % count;
          if (!parts[i].gun || parts[i].destroyed) continue;
          api.laser(
            i,
            ANGLE_UNITS / 2,
            p.laserLength,
            p.laserWidth,
            p.telegraph,
            LASER_GROW_TICKS,
            p.active,
            LASER_FADE_TICKS,
            false,
          );
          next = i + 1;
          break;
        }
        laserIn = laserTicks;
      }
      if (fireIn <= 0) {
        fireGuns(api, ways, p.spread, p.bulletSpeed, BulletKind.NeedlePurple);
        fireIn = api.fireWait(p.fireTicks);
      }
    }
  },
);

/**
 * `boss.bulwark` — HB-01: slow tracking, alternating attached lane lasers, optional spreads (the
 * tunables are listed in the module docs).
 *
 * @remarks
 * One script per phase (the boss system restarts it with the phase's params on every phase
 * change, so `firstLaser` counts from the change). The script **sleeps** until the sooner of its
 * two timers — the next lane or the next spread — so it resumes only when it acts. Lanes go to
 * the standing `gun` parts in part order, taking turns (`next` wraps round), and skip a destroyed
 * gun; with no standing gun the phase fires no lanes. Each lane is `api.laser(…, attached: true)`
 * pointing left (`ANGLE_UNITS / 2`): it follows its emitter as the boss tracks, and vanishes with
 * it. `laserTicks` and `fireTicks` go through `api.fireWait` (constant rank scales them);
 * `firstLaser` does not. `ways` is floored and `0` means no spreads at all (the "never" wait of
 * `boss.hover`) — HB-01's content turns them on from its second phase.
 */
const bossBulwark = defineBossBehavior(
  'boss.bulwark',
  {
    trackSpeed: 0.35,
    margin: 40,
    laserTicks: 110,
    firstLaser: 60,
    laserLength: 384,
    laserWidth: 8,
    telegraph: 45,
    active: 50,
    fireTicks: 120,
    bulletSpeed: 1.5,
    ways: 0,
    spread: 40,
  },
  function* bulwark(api, p): Script {
    api.track(p.trackSpeed, p.margin, PLAYFIELD_H - p.margin);
    const ways = p.ways >= 1 ? Math.floor(p.ways) : 0;
    const count = api.partCount;
    const parts = api.self.parts;
    let next = 0;
    let laserIn = p.firstLaser >= 1 ? Math.floor(p.firstLaser) : 1;
    // A whole-number "never" (see `boss.hover`): no spreads until two plates are down.
    let fireIn = ways > 0 ? api.fireWait(p.fireTicks) : NEVER_TICKS;
    for (;;) {
      const wait = fireIn < laserIn ? fireIn : laserIn;
      yield wait;
      fireIn -= wait;
      laserIn -= wait;
      if (laserIn <= 0) {
        // The next standing gun in turn: the lanes alternate between the emitters.
        for (let k = 0; k < count; k++) {
          const i = (next + k) % count;
          if (!parts[i].gun || parts[i].destroyed) continue;
          api.laser(
            i,
            ANGLE_UNITS / 2,
            p.laserLength,
            p.laserWidth,
            p.telegraph,
            LASER_GROW_TICKS,
            p.active,
            LASER_FADE_TICKS,
            true,
          );
          next = i + 1;
          break;
        }
        laserIn = api.fireWait(p.laserTicks);
      }
      if (fireIn <= 0) {
        fireGuns(api, ways, p.spread, p.bulletSpeed, BulletKind.NeedlePurple);
        fireIn = api.fireWait(p.fireTicks);
      }
    }
  },
);

/**
 * The part a captain's generic fire comes from when it has no standing gun: its first standing
 * part (-1 = none).
 *
 * @param api - The boss's API.
 * @returns A part index, or -1.
 */
function firstStanding(api: BossScriptApi): number {
  const parts = api.self.parts;
  for (let i = 0; i < api.partCount; i++) if (!parts[i].destroyed) return i;
  return -1;
}

/**
 * Whether the boss has a standing gun.
 *
 * @param api - The boss's API.
 * @returns `true` when one stands.
 */
function hasGun(api: BossScriptApi): boolean {
  const parts = api.self.parts;
  for (let i = 0; i < api.partCount; i++) if (parts[i].gun && !parts[i].destroyed) return true;
  return false;
}

/**
 * Fires an aimed spread from every standing gun — or, without one, from the first standing part.
 *
 * @param api - The boss's API.
 * @param ways - Bullets per volley.
 * @param spread - Units between neighbours.
 * @param speed - Speed on Normal.
 * @param kind - `BulletKind`.
 * @returns Bullets fired.
 */
function fireSpreads(
  api: BossScriptApi,
  ways: number,
  spread: number,
  speed: number,
  kind: number,
): number {
  if (hasGun(api)) return fireGuns(api, ways, spread, speed, kind);
  const part = firstStanding(api);
  return part < 0 ? 0 : api.nWay(part, ways, spread, speed, kind);
}

/**
 * Fires a ring from every standing gun — or, without one, from the first standing part.
 *
 * @param api - The boss's API.
 * @param count - Bullets per ring.
 * @param speed - Speed on Normal.
 * @param kind - `BulletKind`.
 * @param offset - First heading.
 * @returns Bullets fired.
 */
function fireRings(
  api: BossScriptApi,
  count: number,
  speed: number,
  kind: number,
  offset: number,
): number {
  if (!hasGun(api)) {
    const part = firstStanding(api);
    return part < 0 ? 0 : api.ring(part, count, speed, kind, offset);
  }
  const parts = api.self.parts;
  let fired = 0;
  for (let i = 0; i < api.partCount; i++) {
    if (parts[i].gun && !parts[i].destroyed) fired += api.ring(i, count, speed, kind, offset);
  }
  return fired;
}

/**
 * `captain.ram` — a mid-boss that shoots waves of fans, then rams along the player's row (the
 * tunables are listed in the module docs).
 *
 * @remarks
 * The ram is a `moveTo` (eased in-out): it leaves its home at the height of the nearest living
 * player (clamped 24 px inside the playfield; its home height without a target), reaches `ramX`
 * after `ramTicks`, waits 10 ticks there and flies home. Its body is the danger (contact), so the
 * ram is dodged by leaving its row. Every local stays a whole number (the ram row is floored).
 */
const captainRam = defineBossBehavior(
  'captain.ram',
  {
    waves: 3,
    waveTicks: 36,
    ways: 5,
    spread: 40,
    bulletSpeed: 1.5,
    ramTicks: 45,
    ramX: 40,
    returnTicks: 70,
    restTicks: 50,
  },
  function* ram(api, p): Script {
    const waves = p.waves >= 1 ? Math.floor(p.waves) : 1;
    const ways = p.ways >= 1 ? Math.floor(p.ways) : 1;
    const ramTicks = p.ramTicks >= 1 ? Math.floor(p.ramTicks) : 1;
    const returnTicks = p.returnTicks >= 1 ? Math.floor(p.returnTicks) : 1;
    const restTicks = p.restTicks >= 1 ? Math.floor(p.restTicks) : 1;
    const self = api.self;
    api.hold();
    for (;;) {
      for (let w = 0; w < waves; w++) {
        yield api.fireWait(p.waveTicks);
        fireSpreads(api, ways, p.spread, p.bulletSpeed, BulletKind.RoundRed);
      }
      const target = api.target();
      let row = Math.floor(target === null ? self.homeY : target.y - self.y + self.screenY);
      if (row < 24) row = 24;
      else if (row > PLAYFIELD_H - 24) row = PLAYFIELD_H - 24;
      api.moveTo(p.ramX, row, ramTicks);
      yield ramTicks + 10;
      api.moveTo(self.homeX, self.homeY, returnTicks);
      yield returnTicks + restTicks;
    }
  },
);

/**
 * `captain.launcher` — a mid-boss that launches its splitting minions and fires spreads (the
 * tunables are listed in the module docs).
 *
 * @remarks
 * The launches go through `api.launch` (the boss section's `minion`, spawned at the gun's centre —
 * without a gun, the first standing part), taking the guns in turn so the minions leave from
 * different points; the sleeps follow the sooner of the two timers, like `boss.hover`.
 */
const captainLauncher = defineBossBehavior(
  'captain.launcher',
  {
    trackSpeed: 0.4,
    margin: 40,
    launchTicks: 100,
    count: 2,
    fireTicks: 70,
    bulletSpeed: 1.25,
    ways: 3,
    spread: 48,
  },
  function* launcher(api, p): Script {
    api.track(p.trackSpeed, p.margin, PLAYFIELD_H - p.margin);
    const ways = p.ways >= 1 ? Math.floor(p.ways) : 1;
    const count = p.count >= 1 ? Math.floor(p.count) : 1;
    const parts = api.self.parts;
    let next = 0;
    let launchIn = api.fireWait(p.launchTicks);
    let fireIn = api.fireWait(p.fireTicks);
    for (;;) {
      const wait = fireIn < launchIn ? fireIn : launchIn;
      yield wait;
      fireIn -= wait;
      launchIn -= wait;
      if (launchIn <= 0) {
        const n = api.partCount;
        let launched = 0;
        if (hasGun(api)) {
          for (let k = 0; k < n && launched < count; k++) {
            const i = (next + k) % n;
            if (!parts[i].gun || parts[i].destroyed) continue;
            api.launch(i);
            launched++;
            next = i + 1;
          }
        } else {
          const part = firstStanding(api);
          if (part >= 0) api.launch(part);
        }
        launchIn = api.fireWait(p.launchTicks);
      }
      if (fireIn <= 0) {
        fireSpreads(api, ways, p.spread, p.bulletSpeed, BulletKind.OvalPink);
        fireIn = api.fireWait(p.fireTicks);
      }
    }
  },
);

/**
 * `captain.circler` — a mid-boss that circles the screen, firing rings (the tunables are listed
 * in the module docs).
 *
 * @remarks
 * `api.orbit` moves it (a per-tick motion of the boss system — the script only sleeps between its
 * rings); the orbit starts at the angle of where the boss is, so a home at `cx + rx`, `cy` starts
 * it without a jump. Each ring is turned half a gap from the last (`ring` / 2 of a gap, in binary
 * units, kept whole).
 */
const captainCircler = defineBossBehavior(
  'captain.circler',
  {
    cx: 192,
    cy: 100,
    rx: 140,
    ry: 64,
    speed: 3,
    fireTicks: 60,
    bulletSpeed: 1.25,
    ring: 8,
  },
  function* circler(api, p): Script {
    api.orbit(p.cx, p.cy, p.rx, p.ry, p.speed);
    const ring = p.ring >= 1 ? Math.floor(p.ring) : 1;
    const half = Math.floor(ANGLE_UNITS / ring / 2);
    let offset = 0;
    for (;;) {
      yield api.fireWait(p.fireTicks);
      fireRings(api, ring, p.bulletSpeed, BulletKind.RoundPurple, offset);
      offset = (offset + half) % ANGLE_UNITS;
    }
  },
);

/**
 * `captain.crab` — a mid-boss that sidesteps around its corner of the screen and fires rings (the
 * tunables are listed in the module docs).
 *
 * @remarks
 * The sidesteps are `moveTo`s to whole-pixel points drawn from the gameplay RNG (deterministic),
 * each taking 60 % of the step; the rings turn `turn` units further every time, so their gaps
 * sweep round and a 4-way player can always find the next gap.
 */
const captainCrab = defineBossBehavior(
  'captain.crab',
  {
    stepTicks: 70,
    minX: 250,
    maxX: 340,
    minY: 40,
    maxY: 160,
    ringTicks: 90,
    ring: 12,
    bulletSpeed: 1.1,
    turn: 16,
  },
  function* crab(api, p): Script {
    api.hold();
    const stepTicks = p.stepTicks >= 1 ? Math.floor(p.stepTicks) : 1;
    const ring = p.ring >= 1 ? Math.floor(p.ring) : 1;
    const turn = Math.floor(p.turn);
    const minX = Math.floor(p.minX < p.maxX ? p.minX : p.maxX);
    const maxX = Math.floor(p.minX < p.maxX ? p.maxX : p.minX);
    const minY = Math.floor(p.minY < p.maxY ? p.minY : p.maxY);
    const maxY = Math.floor(p.minY < p.maxY ? p.maxY : p.minY);
    let offset = 0;
    let stepIn = stepTicks;
    let ringIn = api.fireWait(p.ringTicks);
    for (;;) {
      const wait = stepIn < ringIn ? stepIn : ringIn;
      yield wait;
      stepIn -= wait;
      ringIn -= wait;
      if (stepIn <= 0) {
        const x = api.rng.rangeInt(minX, maxX);
        const y = api.rng.rangeInt(minY, maxY);
        api.moveTo(x, y, Math.floor((stepTicks * 3) / 5));
        stepIn = stepTicks;
      }
      if (ringIn <= 0) {
        fireRings(api, ring, p.bulletSpeed, BulletKind.OvalRed, offset);
        offset = (((offset + turn) % ANGLE_UNITS) + ANGLE_UNITS) % ANGLE_UNITS;
        ringIn = api.fireWait(p.ringTicks);
      }
    }
  },
);

/**
 * `boss.raid` — a battleship raid's turrets (the tunables are listed in the module docs): every
 * volley, each standing gun that may fire (on screen — `canFire` checks it for a raid) turns to
 * the nearest player (`aimPart`: its heading frames follow) and fires along its new heading.
 */
const bossRaid = defineBossBehavior(
  'boss.raid',
  { fireTicks: 50, bulletSpeed: 1.5, ways: 1, spread: 32, aimStep: 0 },
  function* raid(api, p): Script {
    api.hold();
    const ways = p.ways >= 1 ? Math.floor(p.ways) : 1;
    const parts = api.self.parts;
    for (;;) {
      yield api.fireWait(p.fireTicks);
      for (let i = 0; i < api.partCount; i++) {
        if (!parts[i].gun || !api.canFire(i)) continue;
        const heading = api.aimPart(i, p.aimStep);
        if (heading < 0) continue;
        api.nWay(i, ways, p.spread, p.bulletSpeed, BulletKind.RoundPink, heading);
      }
    }
  },
);

/**
 * Fires an aimed spread from every standing **core** part of the boss (a mouth, a head).
 *
 * @param api - The boss's API.
 * @param ways - Bullets per core.
 * @param spread - Units between neighbours.
 * @param speed - Speed on Normal.
 * @param kind - `BulletKind`.
 * @returns Bullets fired.
 */
function fireCores(
  api: BossScriptApi,
  ways: number,
  spread: number,
  speed: number,
  kind: number,
): number {
  const parts = api.self.parts;
  let fired = 0;
  for (let i = 0; i < api.partCount; i++) {
    if (parts[i].core && !parts[i].destroyed) fired += api.nWay(i, ways, spread, speed, kind);
  }
  return fired;
}

/**
 * Fires a ring from every standing core part of the boss.
 *
 * @param api - The boss's API.
 * @param count - Bullets per ring.
 * @param speed - Speed on Normal.
 * @param kind - `BulletKind`.
 * @param offset - First heading.
 * @returns Bullets fired.
 */
function ringCores(
  api: BossScriptApi,
  count: number,
  speed: number,
  kind: number,
  offset: number,
): number {
  const parts = api.self.parts;
  let fired = 0;
  for (let i = 0; i < api.partCount; i++) {
    if (parts[i].core && !parts[i].destroyed) fired += api.ring(i, count, speed, kind, offset);
  }
  return fired;
}

/**
 * Launches the boss's `minion` from up to `count` standing guns, taking them in turn from `next`.
 *
 * @param api - The boss's API.
 * @param next - The gun (part index) to start the search from.
 * @param count - Launches wanted.
 * @returns The part index after the last gun used (the next call's `next`).
 */
function launchFromGuns(api: BossScriptApi, next: number, count: number): number {
  const parts = api.self.parts;
  const n = api.partCount;
  let launched = 0;
  let after = next;
  for (let k = 0; k < n && launched < count; k++) {
    const i = (next + k) % n;
    if (!parts[i].gun || parts[i].destroyed) continue;
    api.launch(i);
    launched++;
    after = i + 1;
  }
  return after;
}

/**
 * Puts the parts attached to a core part (the jaws) `apart` px farther from the core's row than
 * their rest offsets in the boss data (`restY`): a part above its core up, one below it down;
 * `apart` 0 = shut, at rest. Absolute, not relative to where they stand, so the jaws can never
 * drift — whatever gape the phase before used.
 *
 * @param api - The boss's API.
 * @param apart - Pixels (whole, ≥ 0).
 */
function setJaws(api: BossScriptApi, apart: number): void {
  const parts = api.self.parts;
  for (let i = 0; i < api.partCount; i++) {
    const part = parts[i];
    const parent = part.parent;
    if (parent < 0 || !parts[parent].core) continue;
    const rest = part.restY;
    const dy = rest < 0 ? -apart : rest > 0 ? apart : 0;
    if (rest !== 0) api.setPartOffset(i, part.localX, rest + dy);
  }
}

/** Ticks from the mouth opening to `boss.maw`'s first cutters. */
const MAW_FIRST_CUTTERS = 12;

/**
 * `boss.maw` (M2-11) — GALVANIC MAW (GM-02, zone B), the mechanical-fish archetype
 * (shmup_feat.md §13 "tracks Y, mouth weak point, homing rockets, cutters"): it follows the
 * nearest player's height at [`trackSpeed` 0.4] px/tick, [`margin` 44] px from the playfield's top
 * and bottom; its `whenOpen` parts — the mouth, its core — stay shut for [`closedTicks` 140] and
 * open for [`openTicks` 90] in turn (shots clink off the shut mouth). While the mouth is open, every
 * [`fireTicks` 36] ticks (rank-scaled) each core fires an aimed [`ways` 3]-way of purple needles —
 * the cutters — [`spread` 48] units apart at [`bulletSpeed` 1.4], and with [`ring` 0 = none] ≥ 1 the
 * mouth also fires a ring of `ring` round red bullets at [`ringSpeed` 1] as it opens. Every
 * [`launchTicks` 150] ticks (rank-scaled) up to [`count` 1] of the standing guns — the rocket pods
 * — in turn launch the boss's `minion` (the homing rockets, `rocket.homing`); `count` 0 = none.
 *
 * @remarks
 * One script per phase, sleeping until the soonest of its three timers (the mouth, the cutters,
 * the rockets); the first cutters come 12 ticks after the mouth opens, and none while it is shut.
 * Every timer is a whole number (a never-running timer is `NEVER_TICKS`, see `boss.hover`). With
 * [`gape` 0] > 0 the jaws open visibly: every part attached to a core (its `parent`) moves `gape` px
 * away from the core's row as the mouth opens — a part above the core up, one below it down — and
 * back as it shuts. The jaws are placed from their rest offsets in the boss data (`restY`), never
 * moved relative to where they stand, and every phase starts with the mouth shut and the jaws at
 * rest — so a phase that starts mid-gape (the previous phase's script ended with the mouth open,
 * maybe with another `gape`) cannot make them drift.
 */
const bossMaw = defineBossBehavior(
  'boss.maw',
  {
    trackSpeed: 0.4,
    margin: 44,
    closedTicks: 140,
    openTicks: 90,
    fireTicks: 36,
    bulletSpeed: 1.4,
    ways: 3,
    spread: 48,
    ring: 0,
    ringSpeed: 1,
    launchTicks: 150,
    count: 1,
    gape: 0,
  },
  function* maw(api, p): Script {
    api.track(p.trackSpeed, p.margin, PLAYFIELD_H - p.margin);
    const gape = p.gape > 0 ? Math.floor(p.gape) : 0;
    setJaws(api, 0);
    const ways = p.ways >= 1 ? Math.floor(p.ways) : 1;
    const ring = p.ring >= 1 ? Math.floor(p.ring) : 0;
    const count = p.count >= 1 ? Math.floor(p.count) : 0;
    const openTicks = p.openTicks >= 1 ? Math.floor(p.openTicks) : 1;
    const closedTicks = p.closedTicks >= 1 ? Math.floor(p.closedTicks) : 1;
    const half = ring > 0 ? Math.floor(ANGLE_UNITS / ring / 2) : 0;
    let open = false;
    api.setOpenAll(false);
    let rings = 0;
    let next = 0;
    let toggleIn = closedTicks;
    let fireIn = NEVER_TICKS;
    let launchIn = count > 0 ? api.fireWait(p.launchTicks) : NEVER_TICKS;
    for (;;) {
      let wait = toggleIn < fireIn ? toggleIn : fireIn;
      if (launchIn < wait) wait = launchIn;
      yield wait;
      toggleIn -= wait;
      fireIn -= wait;
      launchIn -= wait;
      if (toggleIn <= 0) {
        open = !open;
        api.setOpenAll(open);
        if (gape > 0) setJaws(api, open ? gape : 0);
        toggleIn = open ? openTicks : closedTicks;
        fireIn = open ? MAW_FIRST_CUTTERS : NEVER_TICKS;
        if (open && ring > 0) {
          ringCores(api, ring, p.ringSpeed, BulletKind.RoundRed, (rings & 1) * half);
          rings++;
        }
      }
      if (fireIn <= 0) {
        fireCores(api, ways, p.spread, p.bulletSpeed, BulletKind.NeedlePurple);
        fireIn = api.fireWait(p.fireTicks);
      }
      if (launchIn <= 0) {
        next = launchFromGuns(api, next, count);
        launchIn = api.fireWait(p.launchTicks);
      }
    }
  },
);

/**
 * `boss.widow` (M2-11) — SANDGRAVE WIDOW (SW-03, zone C), the insect / arachnid archetype
 * (shmup_feat.md §13 "spawns spiders"): every [`stepTicks` 100] ticks it scuttles to a random
 * whole-pixel point of the box [`minX` 250 … `maxX` 320, `minY` 56 … `maxY` 144] (the gameplay
 * RNG, in 60 % of the step); every [`fireTicks` 80] ticks (rank-scaled) each standing core — the
 * head — spits an aimed [`ways` 3]-way of red ovals [`spread` 40] at [`bulletSpeed` 1.3]; every
 * [`launchTicks` 160] ticks (rank-scaled) up to [`count` 1] of its standing guns — the spinnerets
 * — in turn launch the boss's `minion` (the spider drones); and with [`laserTicks` 0 = never] ≥ 1,
 * every `laserTicks` ticks (rank-scaled) the next standing gun in turn spins a silk line: a
 * telegraphed horizontal laser to the left in its lane, left where it was fired ([`laserLength`
 * 384], [`laserWidth` 6], [`telegraph` 50] warning ticks, [`active` 40] beam ticks).
 *
 * @remarks
 * One lane at a time, each dodged by moving up or down (4-way): the next silk line waits at least a
 * whole lane (telegraph + grow + active + fade) however high the rank scales `laserTicks` — M2-18's
 * release audit caught a fully powered ship's rank bringing a second, telegraphed line 16 px from
 * the first before it faded. The script sleeps until the soonest of its four timers; every timer is
 * a whole number.
 */
const bossWidow = defineBossBehavior(
  'boss.widow',
  {
    stepTicks: 100,
    minX: 250,
    maxX: 320,
    minY: 56,
    maxY: 144,
    fireTicks: 80,
    bulletSpeed: 1.3,
    ways: 3,
    spread: 40,
    launchTicks: 160,
    count: 1,
    laserTicks: 0,
    laserLength: 384,
    laserWidth: 6,
    telegraph: 50,
    active: 40,
  },
  function* widow(api, p): Script {
    api.hold();
    const stepTicks = p.stepTicks >= 1 ? Math.floor(p.stepTicks) : 1;
    const ways = p.ways >= 1 ? Math.floor(p.ways) : 1;
    const count = p.count >= 1 ? Math.floor(p.count) : 0;
    const lanes = p.laserTicks >= 1;
    const minX = Math.floor(p.minX < p.maxX ? p.minX : p.maxX);
    const maxX = Math.floor(p.minX < p.maxX ? p.maxX : p.minX);
    const minY = Math.floor(p.minY < p.maxY ? p.minY : p.maxY);
    const maxY = Math.floor(p.minY < p.maxY ? p.maxY : p.minY);
    const parts = api.self.parts;
    const n = api.partCount;
    let nextLaunch = 0;
    let nextLane = 0;
    let stepIn = stepTicks;
    let fireIn = api.fireWait(p.fireTicks);
    let launchIn = count > 0 ? api.fireWait(p.launchTicks) : NEVER_TICKS;
    let laserIn = lanes ? api.fireWait(p.laserTicks) : NEVER_TICKS;
    // A whole lane's life: the next line never overlaps the last one (see the remarks).
    const laneTicks =
      Math.ceil(p.telegraph > 0 ? p.telegraph : 0) +
      LASER_GROW_TICKS +
      Math.ceil(p.active > 0 ? p.active : 0) +
      LASER_FADE_TICKS;
    for (;;) {
      let wait = stepIn < fireIn ? stepIn : fireIn;
      if (launchIn < wait) wait = launchIn;
      if (laserIn < wait) wait = laserIn;
      yield wait;
      stepIn -= wait;
      fireIn -= wait;
      launchIn -= wait;
      laserIn -= wait;
      if (stepIn <= 0) {
        const x = api.rng.rangeInt(minX, maxX);
        const y = api.rng.rangeInt(minY, maxY);
        api.moveTo(x, y, Math.floor((stepTicks * 3) / 5));
        stepIn = stepTicks;
      }
      if (fireIn <= 0) {
        fireCores(api, ways, p.spread, p.bulletSpeed, BulletKind.OvalRed);
        fireIn = api.fireWait(p.fireTicks);
      }
      if (launchIn <= 0) {
        nextLaunch = launchFromGuns(api, nextLaunch, count);
        launchIn = api.fireWait(p.launchTicks);
      }
      if (laserIn <= 0) {
        for (let k = 0; k < n; k++) {
          const i = (nextLane + k) % n;
          if (!parts[i].gun || parts[i].destroyed) continue;
          api.laser(
            i,
            ANGLE_UNITS / 2,
            p.laserLength,
            p.laserWidth,
            p.telegraph,
            LASER_GROW_TICKS,
            p.active,
            LASER_FADE_TICKS,
            false,
          );
          nextLane = i + 1;
          break;
        }
        const next = api.fireWait(p.laserTicks);
        laserIn = next > laneTicks ? next : laneTicks;
      }
    }
  },
);

/**
 * Sets the turn speed of every standing part attached to a core (the pivot of a rotating arm — its
 * own children turn with it).
 *
 * @param api - The boss's API.
 * @param speed - Binary units per tick (negative = counter-clockwise, 0 = still).
 */
function spinHubs(api: BossScriptApi, speed: number): void {
  const parts = api.self.parts;
  for (let i = 0; i < api.partCount; i++) {
    const parent = parts[i].parent;
    if (parent >= 0 && parts[parent].core && !parts[i].destroyed) api.spinPart(i, speed);
  }
}

/**
 * `boss.bastion` (M2-12) — CINDER BASTION (CB-04, zone D), the second **core battleship**
 * (shmup_feat.md §13 "shield plates in front of cores; lasers; pattern changes as cores die"):
 * where HALCYON BULWARK hides its core behind plates, this one guards it with **rotating shield
 * arms**. Every part attached to a core — the arms' pivot — turns at [`spin` 4] binary units a
 * tick (rounded to whole units; its armoured arm segments sweep in front of the core and clink the
 * shots that meet them), reversing every [`reverseTicks` 0 = never] ticks. It tracks the nearest
 * player's height at [`trackSpeed` 0.35] px/tick, [`margin` 44] px inside the playfield; every
 * [`laserTicks` 120] ticks
 * (rank-scaled; the first after [`firstLaser` 60]) the next standing gun — the emitters — fires a
 * telegraphed lane laser to the left that stays **attached** to it ([`laserLength` 384],
 * [`laserWidth` 8], [`telegraph` 45], [`active` 50]); with [`ways` 0 = none] ≥ 1 every [`fireTicks`
 * 100] ticks each standing core spits an aimed `ways`-way of red ovals [`spread` 40] at
 * [`bulletSpeed` 1.3] through its arms; with [`ring` 0 = none] ≥ 1 every [`ringTicks` 150] ticks
 * each core fires a ring of `ring` round purple bullets at [`ringSpeed` 1], each turned half a gap
 * from the last.
 *
 * @remarks
 * One script per phase, sleeping until the soonest of its four timers (every timer a whole number,
 * `NEVER_TICKS` for one that never runs). The spin is set when the phase starts — the arms keep the
 * angle they have, so a phase change never makes them jump. Lanes go to the standing guns in turn
 * and skip a destroyed one, like `boss.bulwark`'s; one lane at a time while `laserTicks` outlasts a
 * lane (telegraph + grow + active + fade).
 */
const bossBastion = defineBossBehavior(
  'boss.bastion',
  {
    trackSpeed: 0.35,
    margin: 44,
    spin: 4,
    reverseTicks: 0,
    laserTicks: 120,
    firstLaser: 60,
    laserLength: 384,
    laserWidth: 8,
    telegraph: 45,
    active: 50,
    fireTicks: 100,
    ways: 0,
    spread: 40,
    bulletSpeed: 1.3,
    ring: 0,
    ringTicks: 150,
    ringSpeed: 1,
  },
  function* bastion(api, p): Script {
    api.track(p.trackSpeed, p.margin, PLAYFIELD_H - p.margin);
    let spin = Math.round(p.spin);
    spinHubs(api, spin);
    const ways = p.ways >= 1 ? Math.floor(p.ways) : 0;
    const ring = p.ring >= 1 ? Math.floor(p.ring) : 0;
    const half = ring > 0 ? Math.floor(ANGLE_UNITS / ring / 2) : 0;
    const reverseTicks = p.reverseTicks >= 1 ? Math.floor(p.reverseTicks) : 0;
    const parts = api.self.parts;
    const n = api.partCount;
    let next = 0;
    let rings = 0;
    let laserIn = p.firstLaser >= 1 ? Math.floor(p.firstLaser) : 1;
    let fireIn = ways > 0 ? api.fireWait(p.fireTicks) : NEVER_TICKS;
    let ringIn = ring > 0 ? api.fireWait(p.ringTicks) : NEVER_TICKS;
    let reverseIn = reverseTicks > 0 ? reverseTicks : NEVER_TICKS;
    for (;;) {
      let wait = laserIn < fireIn ? laserIn : fireIn;
      if (ringIn < wait) wait = ringIn;
      if (reverseIn < wait) wait = reverseIn;
      yield wait;
      laserIn -= wait;
      fireIn -= wait;
      ringIn -= wait;
      reverseIn -= wait;
      if (reverseIn <= 0) {
        spin = -spin;
        spinHubs(api, spin);
        reverseIn = reverseTicks;
      }
      if (laserIn <= 0) {
        for (let k = 0; k < n; k++) {
          const i = (next + k) % n;
          if (!parts[i].gun || parts[i].destroyed) continue;
          api.laser(
            i,
            ANGLE_UNITS / 2,
            p.laserLength,
            p.laserWidth,
            p.telegraph,
            LASER_GROW_TICKS,
            p.active,
            LASER_FADE_TICKS,
            true,
          );
          next = i + 1;
          break;
        }
        laserIn = api.fireWait(p.laserTicks);
      }
      if (fireIn <= 0) {
        fireCores(api, ways, p.spread, p.bulletSpeed, BulletKind.OvalRed);
        fireIn = api.fireWait(p.fireTicks);
      }
      if (ringIn <= 0) {
        ringCores(api, ring, p.ringSpeed, BulletKind.RoundPurple, (rings & 1) * half);
        rings++;
        ringIn = api.fireWait(p.ringTicks);
      }
    }
  },
);

/** Ticks from the chest opening to `boss.steed`'s first launch. */
const STEED_FIRST_LAUNCH = 10;

/**
 * `boss.steed` (M2-12) — SQUALL STEED (SS-05, zone E), the **seahorse** archetype (shmup_feat.md
 * §13 "opens chest to launch homing minis"): it bobs on a tall, narrow ellipse round view point
 * [`cx` 296, `cy` 100] with radii [`rx` 8, `ry` 40] at [`bobSpeed` 3] binary units a tick (it
 * should start at `cx + rx`, `cy` — its home); its `whenOpen` chest — the core — stays shut for
 * [`closedTicks` 150] and opens for [`openTicks` 110] in turn (shots clink off it while shut).
 * While the chest is open each standing core launches the boss's `minion` — the homing minis
 * (`rocket.homing`) — every [`launchTicks` 45] ticks (rank-scaled, the first 10 ticks after it
 * opens), at most [`minis` 2] per opening (0 = none). Every [`fireTicks` 80] ticks (rank-scaled)
 * each standing gun — the snout — fires an aimed [`ways` 3]-way of pink ovals [`spread` 44] at
 * [`bulletSpeed` 1.3]; with [`ring` 0 = none] ≥ 1 each gun also fires a ring of `ring` round red
 * bullets at [`ringSpeed` 1] every time the chest shuts, each turned half a gap from the last. With
 * [`gape` 0 = still] > 0 the parts attached to the chest (its lids) move `gape` px apart while it
 * is open (from their rest offsets, like `boss.maw`'s jaws).
 *
 * @remarks
 * One script per phase, sleeping until the soonest of its three timers (the chest, the launches,
 * the snout); every phase starts with the chest shut and the lids at rest. The bob is the boss
 * system's `orbit` (per-tick motion; it starts from the angle of where the boss is, so a phase
 * change moves it at most the change of the ellipse's radii — 2 px between the shipped phases,
 * whose `ry` grows 14 → 16 → 18).
 */
const bossSteed = defineBossBehavior(
  'boss.steed',
  {
    cx: 296,
    cy: 100,
    rx: 8,
    ry: 40,
    bobSpeed: 3,
    closedTicks: 150,
    openTicks: 110,
    launchTicks: 45,
    minis: 2,
    fireTicks: 80,
    ways: 3,
    spread: 44,
    bulletSpeed: 1.3,
    ring: 0,
    ringSpeed: 1,
    gape: 0,
  },
  function* steed(api, p): Script {
    api.orbit(p.cx, p.cy, p.rx, p.ry, p.bobSpeed);
    const gape = p.gape > 0 ? Math.floor(p.gape) : 0;
    setJaws(api, 0);
    api.setOpenAll(false);
    const minis = p.minis >= 1 ? Math.floor(p.minis) : 0;
    const ways = p.ways >= 1 ? Math.floor(p.ways) : 1;
    const ring = p.ring >= 1 ? Math.floor(p.ring) : 0;
    const half = ring > 0 ? Math.floor(ANGLE_UNITS / ring / 2) : 0;
    const openTicks = p.openTicks >= 1 ? Math.floor(p.openTicks) : 1;
    const closedTicks = p.closedTicks >= 1 ? Math.floor(p.closedTicks) : 1;
    const parts = api.self.parts;
    let open = false;
    let launched = 0;
    let rings = 0;
    let toggleIn = closedTicks;
    let launchIn = NEVER_TICKS;
    let fireIn = api.fireWait(p.fireTicks);
    for (;;) {
      let wait = toggleIn < launchIn ? toggleIn : launchIn;
      if (fireIn < wait) wait = fireIn;
      yield wait;
      toggleIn -= wait;
      launchIn -= wait;
      fireIn -= wait;
      if (toggleIn <= 0) {
        open = !open;
        api.setOpenAll(open);
        if (gape > 0) setJaws(api, open ? gape : 0);
        toggleIn = open ? openTicks : closedTicks;
        launched = 0;
        launchIn = open && minis > 0 ? STEED_FIRST_LAUNCH : NEVER_TICKS;
        if (!open && ring > 0) {
          const offset = (rings & 1) * half;
          for (let i = 0; i < api.partCount; i++) {
            if (parts[i].gun && !parts[i].destroyed) {
              api.ring(i, ring, p.ringSpeed, BulletKind.RoundRed, offset);
            }
          }
          rings++;
        }
      }
      if (launchIn <= 0) {
        for (let i = 0; i < api.partCount; i++) {
          if (parts[i].core && !parts[i].destroyed) api.launch(i);
        }
        launched++;
        launchIn = launched < minis ? api.fireWait(p.launchTicks) : NEVER_TICKS;
      }
      if (fireIn <= 0) {
        fireGuns(api, ways, p.spread, p.bulletSpeed, BulletKind.OvalPink);
        fireIn = api.fireWait(p.fireTicks);
      }
    }
  },
);

// ------------------------------------------------------------------------- zones F and G (M2-13)

/**
 * Whether a boss part is a segment of a **curling arm** (M2-13): a circle-hit part (`radius` > 0)
 * attached to another part — a tentacle's root, its segments and its tip.
 *
 * @param parts - The boss's parts.
 * @param index - Part index.
 * @returns `true` for an arm segment.
 */
function isArm(parts: readonly BossPart[], index: number): boolean {
  const part = parts[index];
  return part.radius > 0 && part.parent >= 0;
}

/**
 * The side an arm segment curls to (M2-13): its arm's **root** — the first segment of its chain,
 * whose parent is not an arm segment — hangs above its parent (rest `restY` < 0: the arm curls
 * down, turning counter-clockwise, −1) or below it (+1, clockwise). The arms point to the left, so
 * "curling" brings every arm towards its parent's row — mirrored above and below.
 *
 * @param parts - The boss's parts.
 * @param index - An arm segment's index.
 * @returns −1 or 1.
 */
function armSide(parts: readonly BossPart[], index: number): number {
  let root = index;
  for (let k = 0; k < MAX_BOSS_PARTS && parts[root].parent >= 0; k++) {
    const parent = parts[root].parent;
    if (!isArm(parts, parent)) break;
    root = parent;
  }
  return parts[root].restY < 0 ? -1 : 1;
}

/**
 * Sets the curl speed of every standing arm segment (M2-13): each turns at `speed` units a tick
 * towards its side ({@link armSide}) — every segment of a chain turns by the same amount relative
 * to its parent, so the arm curls more towards its tip, like a tentacle.
 *
 * @param api - The boss's API.
 * @param speed - Binary units per tick (whole; positive curls in, negative uncurls, 0 = still).
 */
function curlArms(api: BossScriptApi, speed: number): void {
  const parts = api.self.parts;
  for (let i = 0; i < api.partCount; i++) {
    if (isArm(parts, i) && !parts[i].destroyed) api.spinPart(i, speed * armSide(parts, i));
  }
}

/**
 * Puts every standing arm segment at a curl (M2-13): its own turn becomes `units` towards its side
 * — what a sweep ends on, so a sweep that started from a fraction of its step (a phase change
 * mid-sweep) lands exactly.
 *
 * @param api - The boss's API.
 * @param units - Binary units (whole; 0 = straight, at rest).
 */
function setArmCurl(api: BossScriptApi, units: number): void {
  const parts = api.self.parts;
  for (let i = 0; i < api.partCount; i++) {
    if (isArm(parts, i) && !parts[i].destroyed) api.setPartAngle(i, units * armSide(parts, i));
  }
}

/**
 * The curl of the arms now (M2-13): the turn of the first standing arm segment, measured towards
 * its side, in `[-512, 512)` binary units (0 without a standing segment).
 *
 * @param api - The boss's API.
 * @returns Binary units (whole).
 */
function armCurl(api: BossScriptApi): number {
  const parts = api.self.parts;
  for (let i = 0; i < api.partCount; i++) {
    if (!isArm(parts, i) || parts[i].destroyed) continue;
    let a = Math.floor(parts[i].angle) & ANGLE_MASK;
    if (a >= ANGLE_UNITS / 2) a -= ANGLE_UNITS;
    return a * armSide(parts, i);
  }
  return 0;
}

/** `boss.squid`'s tentacle state: straight, the core exposed. */
const SQUID_OPEN = 0;

/** `boss.squid`'s tentacle state: curling in. */
const SQUID_CLOSING = 1;

/** `boss.squid`'s tentacle state: curled in front of the core. */
const SQUID_GUARD = 2;

/** `boss.squid`'s tentacle state: uncurling. */
const SQUID_OPENING = 3;

/**
 * `boss.squid` (M2-13) — MANTLE REGENT (MR-06, zone F), the **squid** archetype (shmup_feat.md §13
 * "tentacles guard weak point; break one = changes behavior"): it follows the nearest player's
 * height at [`trackSpeed` 0.35] px/tick, [`margin` 48] px inside the playfield. Its **tentacles** —
 * chains of circle-hit parts pointing left from its body, above and below the core (each a
 * destructible root with armoured segments and a tip) — **guard the core** in a cycle: straight for
 * [`openTicks` 100] ticks (the core exposed), curling in at [`curl` 1] binary units a tick per
 * segment for [`sweepTicks` 48] ticks until the tips meet in front of the core, holding there for
 * [`guardTicks` 60] ticks (shots clink off the armoured segments) and uncurling again in
 * `sweepTicks`. Every [`fireTicks` 70] ticks (rank-scaled) each standing core fires an aimed
 * [`ways` 3]-way of red ovals [`spread` 40] at [`bulletSpeed` 1.3]; with [`gunTicks` 0 = never] ≥ 1
 * every `gunTicks` each standing gun — the tentacle tips — lashes an aimed pink needle at
 * `bulletSpeed`; with [`ring` 0 = none] ≥ 1 each core bursts a ring of `ring` round purple bullets
 * at [`ringSpeed` 1] every time the tentacles open (each turned half a gap from the last); and with
 * [`launchTicks` 0 = never] ≥ 1 every `launchTicks` (rank-scaled) each standing core launches up to
 * [`count` 1] of the boss's `minion` (the chasing cells). A broken tentacle — its root destroyed
 * takes its segments and tip with it — is the content's phase change (`until.partsDestroyed` with
 * `count` 1).
 *
 * @remarks
 * One script per phase, sleeping until the soonest of its four timers (the tentacles, the core's
 * spreads, the tips, the launches); every timer is a whole number. A phase starts by **uncurling**
 * the tentacles from wherever the last phase left them (`armCurl`, however far — past the new
 * sweep too; arms a `boss.facet` phase left curled away from the core's row curl back in), so a
 * phase change never makes them jump: they turn at the new `curl` and are put exactly straight
 * when they arrive (a curl that is not a multiple of the new speed is rounded down, then set — less
 * than one step). The curl is mirrored: the arms above the core turn counter-clockwise, those below
 * it clockwise (`armSide`). `curl` is rounded to whole units (at least 1); `sweepTicks`,
 * `openTicks` and `guardTicks` below 1 are one tick. Seen from outside, every hold of the cycle
 * (straight, guarding) lasts one tick longer than its timer: a sweep reaches its end on its last
 * tick, where the next state begins (the M2-13 test round pins the shipped cycle —
 * `behaviors-zones-fg-edge.test.ts`). A broken tentacle leaves the other's cycle exactly as it was.
 * Guide: `docs/dev/zones-f-and-g.md`.
 *
 * @example
 * ```json
 * { "script": "boss.squid",
 *   "params": { "curl": 2, "sweepTicks": 15, "guardTicks": 50, "ring": 10, "launchTicks": 180 },
 *   "until": { "hpBelow": 28, "partsDestroyed": ["root-top", "root-bottom"] } }
 * ```
 */
const bossSquid = defineBossBehavior(
  'boss.squid',
  {
    trackSpeed: 0.35,
    margin: 48,
    curl: 1,
    sweepTicks: 48,
    guardTicks: 60,
    openTicks: 100,
    fireTicks: 70,
    ways: 3,
    spread: 40,
    bulletSpeed: 1.3,
    gunTicks: 0,
    ring: 0,
    ringSpeed: 1,
    launchTicks: 0,
    count: 1,
  },
  function* squid(api, p): Script {
    api.track(p.trackSpeed, p.margin, PLAYFIELD_H - p.margin);
    const curl = p.curl >= 1 ? Math.round(p.curl) : 1;
    const sweep = p.sweepTicks >= 1 ? Math.floor(p.sweepTicks) : 1;
    const guard = p.guardTicks >= 1 ? Math.floor(p.guardTicks) : 1;
    const openTicks = p.openTicks >= 1 ? Math.floor(p.openTicks) : 1;
    const full = curl * sweep;
    const ways = p.ways >= 1 ? Math.floor(p.ways) : 1;
    const ring = p.ring >= 1 ? Math.floor(p.ring) : 0;
    const count = p.count >= 1 ? Math.floor(p.count) : 0;
    const half = ring > 0 ? Math.floor(ANGLE_UNITS / ring / 2) : 0;
    const parts = api.self.parts;
    let rings = 0;
    // Straighten from wherever the last phase left the tentacles, however far: curled in (past
    // this phase's sweep, too) they uncurl, curled away from the core's row (a facet wave) they
    // curl back in — never clamped, so the arms never jump.
    const now = armCurl(api);
    let state = SQUID_OPENING;
    let armIn = Math.floor((now < 0 ? -now : now) / curl);
    curlArms(api, armIn > 0 ? (now > 0 ? -curl : curl) : 0);
    let fireIn = api.fireWait(p.fireTicks);
    let gunIn = p.gunTicks >= 1 ? api.fireWait(p.gunTicks) : NEVER_TICKS;
    let launchIn = p.launchTicks >= 1 && count > 0 ? api.fireWait(p.launchTicks) : NEVER_TICKS;
    for (;;) {
      let wait = armIn < fireIn ? armIn : fireIn;
      if (gunIn < wait) wait = gunIn;
      if (launchIn < wait) wait = launchIn;
      if (wait > 0) yield wait;
      armIn -= wait;
      fireIn -= wait;
      gunIn -= wait;
      launchIn -= wait;
      if (armIn <= 0) {
        if (state === SQUID_OPENING) {
          setArmCurl(api, 0);
          curlArms(api, 0);
          state = SQUID_OPEN;
          armIn = openTicks;
          if (ring > 0) {
            ringCores(api, ring, p.ringSpeed, BulletKind.RoundPurple, (rings & 1) * half);
            rings++;
          }
        } else if (state === SQUID_OPEN) {
          curlArms(api, curl);
          state = SQUID_CLOSING;
          armIn = sweep;
        } else if (state === SQUID_CLOSING) {
          setArmCurl(api, full);
          curlArms(api, 0);
          state = SQUID_GUARD;
          armIn = guard;
        } else {
          curlArms(api, -curl);
          state = SQUID_OPENING;
          armIn = sweep;
        }
      }
      if (fireIn <= 0) {
        fireCores(api, ways, p.spread, p.bulletSpeed, BulletKind.OvalRed);
        fireIn = api.fireWait(p.fireTicks);
      }
      if (gunIn <= 0) {
        fireGuns(api, 1, 0, p.bulletSpeed, BulletKind.NeedlePink);
        gunIn = api.fireWait(p.gunTicks);
      }
      if (launchIn <= 0) {
        for (let i = 0; i < api.partCount; i++) {
          if (!parts[i].core || parts[i].destroyed) continue;
          for (let k = 0; k < count; k++) api.launch(i);
        }
        launchIn = api.fireWait(p.launchTicks);
      }
    }
  },
);

/**
 * `boss.facet` (M2-13) — FACET MONARCH (FM-07, zone G), the **crystal-core** archetype
 * (shmup_feat.md §13 "tentacle arms, core behind crystals"): its core hides behind crystal facets
 * (the content makes it `afterParts` of them), and two **tentacle arms** — chains of armoured
 * circle-hit segments pointing left from its body, above and below the core — wave: every segment
 * turns at [`wave` 1] binary units a tick, [`waveTicks` 40] ticks from straight to the turn point,
 * so each arm sweeps from `wave × waveTicks` units curled away from the core's row to as much curled
 * towards it and back (mirrored above and below — the arms open and close like a pair of claws).
 * It follows the nearest player's height at [`trackSpeed` 0.3] px/tick, [`margin` 50] px inside
 * the playfield. Every [`fireTicks` 90] ticks (rank-scaled) each standing gun — the arms' tips —
 * fires an aimed [`ways` 1]-way of purple needles [`spread` 32] at [`bulletSpeed` 1.25]; with
 * [`ring` 0 = none] ≥ 1 every [`ringTicks` 150] each standing core fires a ring of `ring` round red
 * bullets at [`ringSpeed` 1] (each turned half a gap from the last — an armoured core fires too);
 * with [`laserTicks` 0 = never] ≥ 1 every `laserTicks` (rank-scaled) each standing core fires a
 * telegraphed horizontal laser to the left in its lane, left where it was fired ([`laserLength`
 * 384], [`laserWidth` 6], [`telegraph` 50] warning ticks, [`active` 40] beam ticks).
 *
 * @remarks
 * One script per phase, sleeping until the soonest of its four timers (the wave's turn points, the
 * tips, the rings, the lanes). A phase takes the arms from wherever the last phase left them
 * (`armCurl`, however far — never clamped to the new sweep) on towards the curled-in turn point —
 * the one straight ahead unless they are already there or past it — so a phase change never makes
 * them jump; each turn point is set exactly when reached (`setArmCurl` — the rest of a curl that is
 * not a multiple of the new `wave`, less than one step). `wave` is rounded to whole units (at least
 * 1), `waveTicks` below 1 is one tick. One lane at a time while `laserTicks` outlasts a lane
 * (telegraph + grow + active + fade). The arms only turn: a phase change (the crystals breaking)
 * carries them on without a jump. Guide: `docs/dev/zones-f-and-g.md`.
 *
 * @example
 * ```json
 * { "script": "boss.facet",
 *   "params": { "wave": 2, "waveTicks": 30, "ways": 3, "ring": 10, "laserTicks": 220 } }
 * ```
 */
const bossFacet = defineBossBehavior(
  'boss.facet',
  {
    trackSpeed: 0.3,
    margin: 50,
    wave: 1,
    waveTicks: 40,
    fireTicks: 90,
    ways: 1,
    spread: 32,
    bulletSpeed: 1.25,
    ring: 0,
    ringTicks: 150,
    ringSpeed: 1,
    laserTicks: 0,
    laserLength: 384,
    laserWidth: 6,
    telegraph: 50,
    active: 40,
  },
  function* facet(api, p): Script {
    api.track(p.trackSpeed, p.margin, PLAYFIELD_H - p.margin);
    const wave = p.wave >= 1 ? Math.round(p.wave) : 1;
    const waveTicks = p.waveTicks >= 1 ? Math.floor(p.waveTicks) : 1;
    const reach = wave * waveTicks;
    const ways = p.ways >= 1 ? Math.floor(p.ways) : 1;
    const ring = p.ring >= 1 ? Math.floor(p.ring) : 0;
    const half = ring > 0 ? Math.floor(ANGLE_UNITS / ring / 2) : 0;
    const parts = api.self.parts;
    let rings = 0;
    // On from wherever the last phase left the arms, however far (never clamped to this phase's
    // sweep, so the arms never jump): towards the curled-in turn point — the other one when they
    // are there already or past it.
    const now = armCurl(api);
    let dir = now < reach ? 1 : -1;
    let turnIn = Math.floor((dir > 0 ? reach - now : now + reach) / wave);
    curlArms(api, dir * wave);
    let fireIn = api.fireWait(p.fireTicks);
    let ringIn = ring > 0 ? api.fireWait(p.ringTicks) : NEVER_TICKS;
    let laserIn = p.laserTicks >= 1 ? api.fireWait(p.laserTicks) : NEVER_TICKS;
    for (;;) {
      let wait = turnIn < fireIn ? turnIn : fireIn;
      if (ringIn < wait) wait = ringIn;
      if (laserIn < wait) wait = laserIn;
      if (wait > 0) yield wait;
      turnIn -= wait;
      fireIn -= wait;
      ringIn -= wait;
      laserIn -= wait;
      if (turnIn <= 0) {
        setArmCurl(api, dir * reach);
        dir = -dir;
        curlArms(api, dir * wave);
        turnIn = 2 * waveTicks;
      }
      if (fireIn <= 0) {
        fireGuns(api, ways, p.spread, p.bulletSpeed, BulletKind.NeedlePurple);
        fireIn = api.fireWait(p.fireTicks);
      }
      if (ringIn <= 0) {
        ringCores(api, ring, p.ringSpeed, BulletKind.RoundRed, (rings & 1) * half);
        rings++;
        ringIn = api.fireWait(p.ringTicks);
      }
      if (laserIn <= 0) {
        for (let i = 0; i < api.partCount; i++) {
          if (!parts[i].core || parts[i].destroyed) continue;
          api.laser(
            i,
            ANGLE_UNITS / 2,
            p.laserLength,
            p.laserWidth,
            p.telegraph,
            LASER_GROW_TICKS,
            p.active,
            LASER_FADE_TICKS,
            false,
          );
        }
        laserIn = api.fireWait(p.laserTicks);
      }
    }
  },
);

// ------------------------------------------------------------------------- zones H and I (M2-14)

/**
 * `boss.sovereign` (M2-14) — IRON SOVEREIGN (IS-08, zone H), the final core battleship of the
 * citadel and the **multi-phase finale** of shmup_feat.md §13 ("make ours a real finale"): one
 * behaviour whose tunables switch its weapons on phase by phase, so the content writes the finale's
 * arc — plates and lanes, then the turning shield wheel, then the hatches, then the overdrive.
 * It tracks the nearest player's height at [`trackSpeed` 0.3] px/tick, [`margin` 48] px inside the
 * playfield; every part attached to a core (the wheel's hub) turns at [`spin` 0 = still] binary
 * units a tick (rounded), reversing every [`reverseTicks` 0 = never]; with [`laserTicks` 0 =
 * never] ≥ 1 its standing guns (the emitters) fire telegraphed lane lasers to the left in turn,
 * **attached** to them ([`firstLaser` 60] ticks into the phase, then every `laserTicks`,
 * rank-scaled; [`laserLength` 384], [`laserWidth` 8], [`telegraph` 45], [`active` 50]); with
 * [`ways` 0 = none] ≥ 1 every [`fireTicks` 110] ticks each standing core spits an aimed `ways`-way
 * of red ovals [`spread` 40] at [`bulletSpeed` 1.3]; with [`ring` 0 = none] ≥ 1 every [`ringTicks`
 * 160] each core fires a ring of round purple bullets at [`ringSpeed` 1], each turned half a gap
 * from the last; with [`launchTicks` 0 = never] ≥ 1 up to [`count` 1] standing guns in turn launch
 * the boss's `minion` (drones from the hatches); and with [`spiral` 0 = none] ≥ 1 every
 * [`spiralTicks` 8] ticks each core fires `spiral` evenly spaced purple ovals at [`spiralSpeed`
 * 1.1], the pattern turned [`spiralStep` 24] units further each time — a rotating spiral whose
 * arms are dodged by moving with the turn.
 *
 * @remarks
 * One script per phase, sleeping until the soonest of its five timers (every timer a whole number,
 * `NEVER_TICKS` for one that never runs). The spiral is not one of them: the phase starts the boss
 * system's **spiral stream** (`BossScriptApi.spiral`), which fires it every tick it is due — a
 * volley every few ticks would otherwise wake the script that often (every wake allocates,
 * decision D29). The wheel keeps the angle it has when a phase starts, so a phase change never
 * makes it jump; the spiral restarts from heading 0 each phase. Lanes go to the
 * standing guns in turn and skip a destroyed one (one lane at a time while `laserTicks` outlasts a
 * lane — telegraph + grow + active + fade). The finale's phase changes are the content's `until`s:
 * the plates broken, then hit-point thresholds of the core. Guide: `docs/dev/zones-h-and-i.md`.
 *
 * @example
 * ```json
 * { "script": "boss.sovereign",
 *   "params": { "spin": -6, "ring": 12, "spiral": 3, "spiralTicks": 10, "laserTicks": 170 } }
 * ```
 */
const bossSovereign = defineBossBehavior(
  'boss.sovereign',
  {
    trackSpeed: 0.3,
    margin: 48,
    spin: 0,
    reverseTicks: 0,
    laserTicks: 0,
    firstLaser: 60,
    laserLength: 384,
    laserWidth: 8,
    telegraph: 45,
    active: 50,
    fireTicks: 110,
    ways: 0,
    spread: 40,
    bulletSpeed: 1.3,
    ring: 0,
    ringTicks: 160,
    ringSpeed: 1,
    launchTicks: 0,
    count: 1,
    spiral: 0,
    spiralTicks: 8,
    spiralStep: 24,
    spiralSpeed: 1.1,
  },
  function* sovereign(api, p): Script {
    api.track(p.trackSpeed, p.margin, PLAYFIELD_H - p.margin);
    let spin = Math.round(p.spin);
    spinHubs(api, spin);
    const ways = p.ways >= 1 ? Math.floor(p.ways) : 0;
    const ring = p.ring >= 1 ? Math.floor(p.ring) : 0;
    const half = ring > 0 ? Math.floor(ANGLE_UNITS / ring / 2) : 0;
    const count = p.count >= 1 ? Math.floor(p.count) : 0;
    const spiral = p.spiral >= 1 ? Math.floor(p.spiral) : 0;
    const spiralTicks = p.spiralTicks >= 1 ? Math.floor(p.spiralTicks) : 1;
    const spiralStep = Math.floor(p.spiralStep);
    const reverseTicks = p.reverseTicks >= 1 ? Math.floor(p.reverseTicks) : 0;
    const parts = api.self.parts;
    const n = api.partCount;
    let nextLane = 0;
    let nextLaunch = 0;
    let rings = 0;
    // The spiral is the boss system's stream: it fires every tick it is due, no script wakes.
    api.spiral(spiral, spiralTicks, spiralStep, p.spiralSpeed, BulletKind.OvalPurple);
    let laserIn =
      p.laserTicks >= 1 ? (p.firstLaser >= 1 ? Math.floor(p.firstLaser) : 1) : NEVER_TICKS;
    let fireIn = ways > 0 ? api.fireWait(p.fireTicks) : NEVER_TICKS;
    let ringIn = ring > 0 ? api.fireWait(p.ringTicks) : NEVER_TICKS;
    let launchIn = p.launchTicks >= 1 && count > 0 ? api.fireWait(p.launchTicks) : NEVER_TICKS;
    let reverseIn = reverseTicks > 0 ? reverseTicks : NEVER_TICKS;
    for (;;) {
      let wait = laserIn < fireIn ? laserIn : fireIn;
      if (ringIn < wait) wait = ringIn;
      if (launchIn < wait) wait = launchIn;
      if (reverseIn < wait) wait = reverseIn;
      yield wait;
      laserIn -= wait;
      fireIn -= wait;
      ringIn -= wait;
      launchIn -= wait;
      reverseIn -= wait;
      if (reverseIn <= 0) {
        spin = -spin;
        spinHubs(api, spin);
        reverseIn = reverseTicks;
      }
      if (laserIn <= 0) {
        for (let k = 0; k < n; k++) {
          const i = (nextLane + k) % n;
          if (!parts[i].gun || parts[i].destroyed) continue;
          api.laser(
            i,
            ANGLE_UNITS / 2,
            p.laserLength,
            p.laserWidth,
            p.telegraph,
            LASER_GROW_TICKS,
            p.active,
            LASER_FADE_TICKS,
            true,
          );
          nextLane = i + 1;
          break;
        }
        laserIn = api.fireWait(p.laserTicks);
      }
      if (fireIn <= 0) {
        fireCores(api, ways, p.spread, p.bulletSpeed, BulletKind.OvalRed);
        fireIn = api.fireWait(p.fireTicks);
      }
      if (ringIn <= 0) {
        ringCores(api, ring, p.ringSpeed, BulletKind.RoundPurple, (rings & 1) * half);
        rings++;
        ringIn = api.fireWait(p.ringTicks);
      }
      if (launchIn <= 0) {
        nextLaunch = launchFromGuns(api, nextLaunch, count);
        launchIn = api.fireWait(p.launchTicks);
      }
    }
  },
);

/**
 * `boss.ark` (M2-14) — ABYSS ARK (AA-09, zone I), the **whale-class battleship raid**
 * (shmup_feat.md §13 "Whale battleship: raid — circle it, turret rows, hooks"): the camera flies
 * round it (its `raid` data) while every [`fireTicks` 60] ticks (rank-scaled) each standing gun
 * **on screen** — the turret rows along its hull — turns to the nearest player (by at most
 * [`aimStep` 0 = at once] units; its heading frames follow) and fires a [`ways` 1]-way of pink
 * rounds [`spread` 32] at [`bulletSpeed` 1.3] along its new heading; with [`launchTicks` 0 = never]
 * ≥ 1 every `launchTicks` (rank-scaled) the next on-screen guns in turn cast up to [`count` 1] of
 * the boss's `minion` — the **hooks**, harpoon drones that home on the ship for a while; with
 * [`ring` 0 = none] ≥ 1 every [`ringTicks` 180] each standing core on screen fires a ring of round
 * red bullets at [`ringSpeed` 1], each turned half a gap from the last.
 *
 * @remarks
 * Parts off screen never fire or launch (`canFire` — a raid's parts must be in view), so what
 * shoots is what the camera shows. One script per phase, sleeping until the soonest of its three
 * timers. Guide: `docs/dev/zones-h-and-i.md`.
 */
const bossArk = defineBossBehavior(
  'boss.ark',
  {
    fireTicks: 60,
    bulletSpeed: 1.3,
    ways: 1,
    spread: 32,
    aimStep: 0,
    launchTicks: 0,
    count: 1,
    ring: 0,
    ringTicks: 180,
    ringSpeed: 1,
  },
  function* ark(api, p): Script {
    api.hold();
    const ways = p.ways >= 1 ? Math.floor(p.ways) : 1;
    const count = p.count >= 1 ? Math.floor(p.count) : 0;
    const ring = p.ring >= 1 ? Math.floor(p.ring) : 0;
    const half = ring > 0 ? Math.floor(ANGLE_UNITS / ring / 2) : 0;
    const parts = api.self.parts;
    const n = api.partCount;
    let next = 0;
    let rings = 0;
    let fireIn = api.fireWait(p.fireTicks);
    let launchIn = p.launchTicks >= 1 && count > 0 ? api.fireWait(p.launchTicks) : NEVER_TICKS;
    let ringIn = ring > 0 ? api.fireWait(p.ringTicks) : NEVER_TICKS;
    for (;;) {
      let wait = fireIn < launchIn ? fireIn : launchIn;
      if (ringIn < wait) wait = ringIn;
      yield wait;
      fireIn -= wait;
      launchIn -= wait;
      ringIn -= wait;
      if (fireIn <= 0) {
        for (let i = 0; i < n; i++) {
          if (!parts[i].gun || !api.canFire(i)) continue;
          const heading = api.aimPart(i, p.aimStep);
          if (heading < 0) continue;
          api.nWay(i, ways, p.spread, p.bulletSpeed, BulletKind.RoundPink, heading);
        }
        fireIn = api.fireWait(p.fireTicks);
      }
      if (launchIn <= 0) {
        // Each on-screen gun casts at most once a launch: the search runs once round the parts
        // from `next` (kept fixed while it runs), and the next launch starts after the last caster.
        let launched = 0;
        let after = next;
        for (let k = 0; k < n && launched < count; k++) {
          const i = (next + k) % n;
          if (!parts[i].gun || parts[i].destroyed || !api.launch(i)) continue;
          launched++;
          after = i + 1;
        }
        next = after;
        launchIn = api.fireWait(p.launchTicks);
      }
      if (ringIn <= 0) {
        const offset = (rings & 1) * half;
        for (let i = 0; i < n; i++) {
          if (parts[i].core && !parts[i].destroyed && api.canFire(i)) {
            api.ring(i, ring, p.ringSpeed, BulletKind.RoundRed, offset);
          }
        }
        rings++;
        ringIn = api.fireWait(p.ringTicks);
      }
    }
  },
);

/** Ticks from the mouth opening to `boss.angler`'s first spread. */
const ANGLER_FIRST_SPREAD = 12;

/**
 * `boss.angler` (M2-14) — THE HOLLOW KING (HK-10, zone I), the thing inside the ABYSS ARK and the
 * last boss of the throne route (shmup_feat.md §13 "boss inside a boss", "anglerfish: lure, opens
 * to reveal"): an anglerfish whose **lure** — a chain of circle-hit parts hung from its brow,
 * ending in a glowing gun — sways in front of it like a claw, while its `whenOpen` mouth (the core)
 * opens and shuts. It follows the nearest player's height at [`trackSpeed` 0.35] px/tick,
 * [`margin` 48] px inside the playfield; the mouth stays shut [`closedTicks` 150] and open
 * [`openTicks` 100] in turn, its jaws (the parts attached to the core) [`gape` 6] px apart while
 * open (from their rest offsets, like `boss.maw`'s); while open, every [`fireTicks` 40] ticks
 * (rank-scaled, the first 12 ticks after it opens) each core fires an aimed [`ways` 3]-way of red
 * ovals [`spread` 44] at [`bulletSpeed` 1.3], and with [`ring` 0 = none] ≥ 1 a ring of round purple
 * bullets at [`ringSpeed` 1] as it opens. The lure sways at [`sway` 1] unit a tick per segment,
 * [`swayTicks` 40] from straight to a turn point (the `boss.facet` wave, mirrored by the lure's
 * side); with [`gunTicks` 0 = never] ≥ 1 its standing guns — the lure's bulb — fire an aimed pink
 * needle at `bulletSpeed` every `gunTicks`, and with [`launchTicks` 0 = never] ≥ 1 they launch
 * [`count` 1] of the boss's `minion` every `launchTicks` (rank-scaled).
 *
 * @remarks
 * One script per phase, sleeping until the soonest of its five timers; every phase starts with
 * the mouth shut, the jaws at rest, and takes the lure on from wherever the last phase left it
 * (`armCurl`, never clamped — no jump). `sway` is rounded (at least 1), the tick counts below 1
 * are one tick. The lure's root must hang from a part that is not a core (else the jaws' gape
 * would move it). Guide: `docs/dev/zones-h-and-i.md`.
 */
const bossAngler = defineBossBehavior(
  'boss.angler',
  {
    trackSpeed: 0.35,
    margin: 48,
    closedTicks: 150,
    openTicks: 100,
    gape: 6,
    fireTicks: 40,
    ways: 3,
    spread: 44,
    bulletSpeed: 1.3,
    ring: 0,
    ringSpeed: 1,
    sway: 1,
    swayTicks: 40,
    gunTicks: 0,
    launchTicks: 0,
    count: 1,
  },
  function* angler(api, p): Script {
    api.track(p.trackSpeed, p.margin, PLAYFIELD_H - p.margin);
    const gape = p.gape > 0 ? Math.floor(p.gape) : 0;
    setJaws(api, 0);
    api.setOpenAll(false);
    const ways = p.ways >= 1 ? Math.floor(p.ways) : 1;
    const ring = p.ring >= 1 ? Math.floor(p.ring) : 0;
    const half = ring > 0 ? Math.floor(ANGLE_UNITS / ring / 2) : 0;
    const count = p.count >= 1 ? Math.floor(p.count) : 0;
    const openTicks = p.openTicks >= 1 ? Math.floor(p.openTicks) : 1;
    const closedTicks = p.closedTicks >= 1 ? Math.floor(p.closedTicks) : 1;
    const sway = p.sway >= 1 ? Math.round(p.sway) : 1;
    const swayTicks = p.swayTicks >= 1 ? Math.floor(p.swayTicks) : 1;
    const reach = sway * swayTicks;
    const parts = api.self.parts;
    let open = false;
    let rings = 0;
    // The lure goes on from wherever the last phase left it (see `boss.facet`).
    const now = armCurl(api);
    let dir = now < reach ? 1 : -1;
    let turnIn = Math.floor((dir > 0 ? reach - now : now + reach) / sway);
    curlArms(api, dir * sway);
    let toggleIn = closedTicks;
    let fireIn = NEVER_TICKS;
    let gunIn = p.gunTicks >= 1 ? api.fireWait(p.gunTicks) : NEVER_TICKS;
    let launchIn = p.launchTicks >= 1 && count > 0 ? api.fireWait(p.launchTicks) : NEVER_TICKS;
    for (;;) {
      let wait = toggleIn < fireIn ? toggleIn : fireIn;
      if (turnIn < wait) wait = turnIn;
      if (gunIn < wait) wait = gunIn;
      if (launchIn < wait) wait = launchIn;
      if (wait > 0) yield wait;
      toggleIn -= wait;
      fireIn -= wait;
      turnIn -= wait;
      gunIn -= wait;
      launchIn -= wait;
      if (turnIn <= 0) {
        setArmCurl(api, dir * reach);
        dir = -dir;
        curlArms(api, dir * sway);
        turnIn = 2 * swayTicks;
      }
      if (toggleIn <= 0) {
        open = !open;
        api.setOpenAll(open);
        if (gape > 0) setJaws(api, open ? gape : 0);
        toggleIn = open ? openTicks : closedTicks;
        fireIn = open ? ANGLER_FIRST_SPREAD : NEVER_TICKS;
        if (open && ring > 0) {
          ringCores(api, ring, p.ringSpeed, BulletKind.RoundPurple, (rings & 1) * half);
          rings++;
        }
      }
      if (fireIn <= 0) {
        fireCores(api, ways, p.spread, p.bulletSpeed, BulletKind.OvalRed);
        fireIn = api.fireWait(p.fireTicks);
      }
      if (gunIn <= 0) {
        fireGuns(api, 1, 0, p.bulletSpeed, BulletKind.NeedlePink);
        gunIn = api.fireWait(p.gunTicks);
      }
      if (launchIn <= 0) {
        for (let i = 0; i < api.partCount; i++) {
          if (!parts[i].gun || parts[i].destroyed) continue;
          for (let k = 0; k < count; k++) api.launch(i);
        }
        launchIn = api.fireWait(p.launchTicks);
      }
    }
  },
);

/**
 * The boss roster's definitions: M1's, the captains and raid turrets of M2-09 and the zone bosses
 * of M2-11, M2-12, M2-13 and M2-14.
 */
export const DEFAULT_BOSS_BEHAVIOR_DEFS: readonly BossBehaviorDef[] = Object.freeze([
  bossHover,
  bossLanes,
  bossBulwark,
  bossRaid,
  captainRam,
  captainLauncher,
  captainCircler,
  captainCrab,
  bossMaw,
  bossWidow,
  bossBastion,
  bossSteed,
  bossSquid,
  bossFacet,
  bossSovereign,
  bossArk,
  bossAngler,
]);

/** The boss roster as a registry (what the World uses). */
export const DEFAULT_BOSS_BEHAVIORS: BossBehaviorRegistry = createBossBehaviorRegistry(
  DEFAULT_BOSS_BEHAVIOR_DEFS,
);

/** Ids of {@link DEFAULT_BOSS_BEHAVIORS}, sorted. */
export const BOSS_BEHAVIOR_IDS: readonly string[] = DEFAULT_BOSS_BEHAVIORS.ids;

/**
 * The weapon behaviour ids (`core/weapons` `WEAPON_SCRIPT_IDS`: `laser.beam`,
 * `missile.groundSlide`, `shot.double`, `shot.straight`), re-exported here next to
 * {@link KNOWN_SCRIPT_IDS}: weapon and enemy behaviours share the content's one script table.
 */
export { WEAPON_SCRIPT_IDS };

/**
 * Every script id the engine knows: the enemy behaviours, the boss behaviours and
 * {@link WEAPON_SCRIPT_IDS} — all live in the content's one script table. Hosts pass it to
 * `loadContent` as `knownScripts`.
 */
export const KNOWN_SCRIPT_IDS: readonly string[] = Object.freeze(
  [...BEHAVIOR_IDS, ...BOSS_BEHAVIOR_IDS, ...WEAPON_SCRIPT_IDS].sort(),
);

/**
 * Lists the `params` names a behaviour does not have.
 *
 * @param params - The content's tunables.
 * @param known - The behaviour's defaults.
 * @param path - Issue path of the `params` object.
 * @param id - Behaviour id (for the message).
 * @param issues - Collector.
 */
function checkParams(
  params: Readonly<Record<string, number>>,
  known: Readonly<Record<string, number>>,
  path: string,
  id: string,
  issues: ValidationIssue[],
): void {
  for (const name of Object.keys(params)) {
    if (!Object.prototype.hasOwnProperty.call(known, name)) {
      issues.push({
        path: path + '.' + name,
        message:
          'unknown param for behaviour "' + id + '" (known: ' + Object.keys(known).join(', ') + ')',
      });
    }
  }
}

/**
 * Checks enemies against their behaviours: every `params` name must be a tunable of the
 * behaviour, spawners need a `child` and pattern runners a `pattern` (M2-02, path
 * `enemies:<id>.pattern`). A regular enemy must name an enemy behaviour, every boss
 * phase a boss behaviour, and a phase's `params` must be that boss behaviour's tunables. (Unknown
 * script ids are `loadContent`'s job.)
 *
 * @param db - Validated content.
 * @param registry - The enemy behaviours (default {@link DEFAULT_BEHAVIORS}).
 * @param bossRegistry - The boss behaviours (default {@link DEFAULT_BOSS_BEHAVIORS}).
 * @returns Issues with paths `enemies:<id>.params.<name>`, `enemies:<id>.child`,
 *   `enemies:<id>.script`, `enemies:<id>.boss.phases[<p>].script` and
 *   `enemies:<id>.boss.phases[<p>].params.<name>`.
 *
 * @example
 * ```ts
 * const { db, issues } = loadContent(files, { knownScripts: KNOWN_SCRIPT_IDS });
 * issues.push(...checkEnemyBehaviors(db));
 * ```
 */
export function checkEnemyBehaviors(
  db: ContentDb,
  registry: BehaviorRegistry = DEFAULT_BEHAVIORS,
  bossRegistry: BossBehaviorRegistry = DEFAULT_BOSS_BEHAVIORS,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const enemy of db.enemies) {
    const boss = enemy.boss;
    if (boss !== null) {
      for (let p = 0; p < boss.phases.length; p++) {
        const phase = boss.phases[p];
        const at = 'enemies:' + enemy.id + '.boss.phases[' + String(p) + ']';
        const def = bossRegistry.get(phase.script);
        if (def === undefined) {
          if (registry.get(phase.script) !== undefined) {
            issues.push({
              path: at + '.script',
              message: '"' + phase.script + '" is an enemy behaviour, not a boss behaviour',
            });
          }
          continue;
        }
        checkParams(phase.params, def.params, at + '.params', def.id, issues);
      }
      continue;
    }
    const def = registry.get(enemy.script);
    if (def === undefined) {
      if (bossRegistry.get(enemy.script) !== undefined) {
        issues.push({
          path: 'enemies:' + enemy.id + '.script',
          message: '"' + enemy.script + '" is a boss behaviour (use it in a boss phase)',
        });
      }
      continue;
    }
    checkParams(enemy.params, def.params, 'enemies:' + enemy.id + '.params', def.id, issues);
    if (def.needsChild && enemy.childId < 0) {
      issues.push({
        path: 'enemies:' + enemy.id + '.child',
        message: 'behaviour "' + def.id + '" needs a child enemy',
      });
    }
    if (def.needsPattern && enemy.patternId < 0) {
      issues.push({
        path: 'enemies:' + enemy.id + '.pattern',
        message: 'behaviour "' + def.id + '" needs a pattern',
      });
    }
  }
  return issues;
}

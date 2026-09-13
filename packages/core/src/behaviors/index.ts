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
 *
 * `drifter.sine`, `fan.loop`, `carrier.straight`, `hatch.spawner` and `rammer.aimed` do not fire.
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
 * **Implements.**
 * - shmup_feat.md §11 — archetypes (popcorn, formation fliers, capsule carriers, turrets,
 *   walkers, hatches, rammers, orbiters) as coroutine scripts
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
 * **Planned API.** More behaviours with the zones of M2 (M2-11 … M2-14).
 *
 * @module
 */
import { BulletKind, LASER_FADE_TICKS, LASER_GROW_TICKS } from '../bullets/index.js';
import { WEAPON_SCRIPT_IDS } from '../weapons/index.js';
import type { BossBehavior, BossBehaviorLookup, BossScriptApi } from '../bosses/index.js';
import { PLAYFIELD_H } from '../config/index.js';
import type { ContentDb, ValidationIssue } from '../data/index.js';
import type { EnemyBehavior, EnemyBehaviorLookup, ScriptApi } from '../enemies/index.js';
import { EnemyFlag } from '../enemies/index.js';
import { defineModule } from '../module-info.js';
import { ANGLE_UNITS } from '../math/index.js';
import { BodyAnchor, MoverKind, SLEEP_FOREVER, type Script } from '../patterns/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'behaviors',
  status: 'partial',
  specRefs: ['shmup_feat.md §11', 'shmup_tech.md §4.6', 'shmup_feat.md §13'],
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
): BehaviorDef {
  return Object.freeze({
    id,
    params: Object.freeze({ ...params }),
    create: create as (api: ScriptApi, params: Readonly<Record<string, number>>) => Script,
    needsChild,
    needsPattern,
  });
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

/** The M1 boss roster's definitions (see the module docs). */
export const DEFAULT_BOSS_BEHAVIOR_DEFS: readonly BossBehaviorDef[] = Object.freeze([
  bossHover,
  bossLanes,
  bossBulwark,
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

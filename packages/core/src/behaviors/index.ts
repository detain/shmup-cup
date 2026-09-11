/**
 * # behaviors — the registry of enemy behaviour scripts referenced by content
 *
 * **Responsibility.** Maps the `script` ids of `content/enemies/` to TypeScript coroutines
 * (decision D29, shmup_feat.md §11 "coroutine AI scripts"): a {@link BehaviorDef} is an id, a set
 * of tunables with defaults (overridden per enemy by its `params`) and a factory returning the
 * {@link Script} generator. The enemy system (`core/enemies`) creates one coroutine per spawned
 * enemy and resumes it only when it wakes; the coroutine steers the enemy by switching movers
 * (`core/patterns`) and, from M1-09, by firing patterns. Content validation uses the registry
 * ({@link KNOWN_SCRIPT_IDS}) as `loadContent`'s `knownScripts`, so an unknown id is a content
 * issue, and {@link checkEnemyBehaviors} reports unknown tunables and spawners without a child.
 *
 * **The M1 roster** ({@link DEFAULT_BEHAVIORS}; `params` defaults in brackets):
 *
 * - `drifter.sine` — popcorn: drifts left on a sine wave [`speed` 1.25, `amp` 24, `period` 96,
 *   `phase` 0, `memberPhase` 0 — extra phase per formation member].
 * - `fan.loop` — formation flier: the leader flies the spawn event's path (straight left without
 *   one) [`speed` 1.5]; every other member replays the leader's track (`follow`).
 * - `carrier.straight` — capsule carrier: flies straight left [`speed` 1]; its drop is data.
 * - `turret.floor` — ground turret (floor or ceiling, per its spec): stands still and turns to
 *   face the nearest player every [`aimTicks` 30] ticks (M1-09 adds its aimed shots).
 * - `walker.floor` — walks along its floor / ceiling towards the player for [`walkTicks` 90] at
 *   [`speed` 0.75], stops for [`stopTicks` 45] (M1-09 shoots then), repeats.
 * - `hatch.spawner` — ground hatch: while it may fire (on screen, settled) it releases its
 *   `child` enemy every [`interval` 60] ticks, at most [`max` 8] in all (0 = no limit).
 * - `rammer.aimed` — enters with its spec's mover for [`enterTicks` 40] ticks, then holds for
 *   [`windup` 20], aims at the nearest player and dashes at [`speed` 2.5].
 * - `orbiter.loop` — flies the spawn event's path (a loop) at [`speed` 1.25]; without a path it
 *   flies to view point [`x` 256, `y` 100], holds [`hold` 90] and leaves left at [`leaveSpeed` 2].
 *
 * **Implements.**
 * - shmup_feat.md §11 — archetypes (popcorn, formation fliers, capsule carriers, turrets,
 *   walkers, hatches, rammers, orbiters) as coroutine scripts
 * - shmup_tech.md §4.6 — TS generator coroutines
 *
 * **Public API.** {@link BehaviorDef}, {@link BehaviorRegistry}, {@link defineBehavior},
 * {@link createBehaviorRegistry}, {@link DEFAULT_BEHAVIORS}, {@link DEFAULT_BEHAVIOR_DEFS},
 * {@link BEHAVIOR_IDS}, {@link WEAPON_SCRIPT_IDS}, {@link KNOWN_SCRIPT_IDS},
 * {@link checkEnemyBehaviors}.
 *
 * **Planned API.** More behaviours with the zone content (M1-18) and the bosses (M1-13); the
 * roster's fire patterns (M1-09).
 *
 * @module
 */
import type { ContentDb, ValidationIssue } from '../data/index.js';
import type { EnemyBehavior, EnemyBehaviorLookup, ScriptApi } from '../enemies/index.js';
import { EnemyFlag } from '../enemies/index.js';
import { defineModule } from '../module-info.js';
import { BodyAnchor, MoverKind, SLEEP_FOREVER, type Script } from '../patterns/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'behaviors',
  status: 'partial',
  specRefs: ['shmup_feat.md §11', 'shmup_tech.md §4.6'],
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
 * @typeParam P - The tunables' shape.
 * @param id - Script id.
 * @param params - Tunables with defaults.
 * @param create - The coroutine factory.
 * @param needsChild - Whether the enemy must name a `child` (default `false`).
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
): BehaviorDef {
  return Object.freeze({
    id,
    params: Object.freeze({ ...params }),
    create: create as (api: ScriptApi, params: Readonly<Record<string, number>>) => Script,
    needsChild,
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

/** `turret.floor` — a ground turret that keeps facing the nearest player. */
const turretFloor = defineBehavior(
  'turret.floor',
  { aimTicks: 30 },
  function* turret(api, p): Script {
    api.setMover(MoverKind.None);
    for (;;) {
      faceTarget(api);
      yield p.aimTicks;
    }
  },
);

/** `walker.floor` — walk towards the player, stop, repeat. */
const walkerFloor = defineBehavior(
  'walker.floor',
  { speed: 0.75, walkTicks: 90, stopTicks: 45 },
  function* walker(api, p): Script {
    for (;;) {
      const target = api.target();
      const left = target === null || target.x < api.self.x;
      api.setMover(MoverKind.GroundCrawl, left ? -p.speed : p.speed);
      yield p.walkTicks;
      api.setMover(MoverKind.None);
      faceTarget(api);
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
  { speed: 1.25, x: 256, y: 100, hold: 90, leaveSpeed: 2 },
  function* orbiter(api, p): Script {
    const self = api.self;
    if (self.pathId >= 0) {
      api.setMover(MoverKind.Path, self.pathId, p.speed);
    } else {
      api.setMover(MoverKind.Waypoint, p.x, p.y, p.speed, p.hold, -p.leaveSpeed, 0);
    }
    yield SLEEP_FOREVER;
  },
);

/** The M1 roster's definitions (see the module docs), e.g. to extend a registry in tests. */
export const DEFAULT_BEHAVIOR_DEFS: readonly BehaviorDef[] = Object.freeze([
  drifterSine,
  fanLoop,
  carrierStraight,
  turretFloor,
  walkerFloor,
  hatchSpawner,
  rammerAimed,
  orbiterLoop,
]);

/** The M1 roster as a registry (what the World uses). */
export const DEFAULT_BEHAVIORS: BehaviorRegistry = createBehaviorRegistry(DEFAULT_BEHAVIOR_DEFS);

/** Ids of {@link DEFAULT_BEHAVIORS}, sorted. */
export const BEHAVIOR_IDS: readonly string[] = DEFAULT_BEHAVIORS.ids;

/**
 * The weapon behaviour ids of the Type A arsenal (plan M1-10: `shot.straight`, `shot.double`,
 * `laser.beam`, `missile.groundSlide`) that `content/weapons/` names.
 *
 * @remarks
 * Weapon and enemy behaviours share the content's one script table, so script-id validation
 * needs these before the weapons of M1-10 implement them; that step moves the list next to its
 * weapon behaviour registry in `core/weapons`.
 */
export const WEAPON_SCRIPT_IDS: readonly string[] = Object.freeze([
  'laser.beam',
  'missile.groundSlide',
  'shot.double',
  'shot.straight',
]);

/**
 * Every script id the engine knows: the enemy behaviours plus {@link WEAPON_SCRIPT_IDS} — both
 * live in the content's one script table. Hosts pass it to `loadContent` as `knownScripts`.
 */
export const KNOWN_SCRIPT_IDS: readonly string[] = Object.freeze(
  [...BEHAVIOR_IDS, ...WEAPON_SCRIPT_IDS].sort(),
);

/**
 * Checks enemies against their behaviours: every `params` name must be a tunable of the
 * behaviour, and spawners need a `child`. (Unknown script ids are `loadContent`'s job.)
 *
 * @param db - Validated content.
 * @param registry - The behaviours (default {@link DEFAULT_BEHAVIORS}).
 * @returns Issues with paths `enemies:<id>.params.<name>` / `enemies:<id>.child`.
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
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const enemy of db.enemies) {
    const def = registry.get(enemy.script);
    if (def === undefined) continue;
    for (const name of Object.keys(enemy.params)) {
      if (!Object.prototype.hasOwnProperty.call(def.params, name)) {
        issues.push({
          path: 'enemies:' + enemy.id + '.params.' + name,
          message:
            'unknown param for behaviour "' +
            def.id +
            '" (known: ' +
            Object.keys(def.params).join(', ') +
            ')',
        });
      }
    }
    if (def.needsChild && enemy.childId < 0) {
      issues.push({
        path: 'enemies:' + enemy.id + '.child',
        message: 'behaviour "' + def.id + '" needs a child enemy',
      });
    }
  }
  return issues;
}

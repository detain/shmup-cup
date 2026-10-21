/**
 * The shared helpers of the per-zone behaviour tests (R5-P.P5a1): every module-level helper of
 * the old `behaviors-zones*.test.ts` files lives here **once**, so a helper is never copied into
 * two new files, and each zone's file imports its own file's code byte for byte.
 *
 * The same helper name hides two or three different bodies across the old files, so nothing is
 * unified:
 *
 * - `run` is byte-identical in all eight old files — one export serves them.
 * - `part` has three bodies: the non-edge files name the boss `boss` (exported as {@link part}),
 *   the shipped-roster edge files name it `b` so it does not shadow their `boss` builder (it
 *   rides the BC/DE/FG kits as their `part` member, defined once), and the HI-edge one throws
 *   where the others assert (R5-P.P5a2 gives it its kit).
 * - The helpers that resolve an id against the built `DB` come as one kit per old-file shape:
 *   {@link zoneKit} (the four non-edge files), {@link zoneKitEdgeBc} (B/C edge),
 *   {@link zoneKitEdgeDe} (D/E edge); R5-P.P5a2 adds `zoneKitEdgeFg` and `zoneKitEdgeHi`. Where a
 *   body repeats between kits, the module defines it once and each kit returns it.
 * - The roster builders read the file's `ROSTER` while the file *builds* its `DB`, so they come
 *   as one factory per file kind: {@link rosterKitBc} (the B/C edge pair) and {@link rosterKitDe}
 *   (the D/E edge pair); R5-P.P5a2 adds `rosterKitFg` and the HI-edge `enemy`.
 *
 * The helper lives under `packages/core/test/helpers/` and imports core **by relative path**
 * (the way `v1-port.ts` does): a core test must not load a second `@shmup/core` instance through
 * the package name.
 *
 * @module
 */
import { expect } from 'vitest';
import { BossState } from '../../src/bosses/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { ANGLE_UNITS } from '../../src/math/index.js';
import type { ContentDb } from '../../src/data/index.js';
import { EnemyFlag, EnemyState, type Enemy } from '../../src/enemies/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';

/**
 * A roster entry as JSON (only the fields the variants touch are typed; the FG kind's wider
 * entry — a `child` and its `Phase` list — joins with R5-P.P5a2).
 */
export interface Entry {
  id: string;
  params?: Record<string, number>;
  boss?: {
    code: string;
    displayName: string;
    parts: Record<string, unknown>[];
    phases: { script: string; params?: Record<string, number>; until?: unknown }[];
  };
  [key: string]: unknown;
}

/**
 * Steps a world with no input, events dropped (byte-identical in all eight old files).
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
export function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) {
    stepWorld(w, input);
    w.events.clear();
  }
}

/**
 * A boss part's index by name — the non-edge files' body (the local boss is `boss`).
 *
 * @param w - The world.
 * @param name - Part name.
 * @returns Its index.
 */
export function part(w: World, name: string): number {
  const boss = w.bosses.boss;
  const index = boss.parts.findIndex((p, i) => i < boss.partCount && p.name === name);
  expect(index, name).toBeGreaterThanOrEqual(0);
  return index;
}

/**
 * A boss part's index by name — the shipped-roster edge files' body (the local boss is `b`, so
 * it does not shadow their `boss` builder). Defined once; the BC/DE/FG kits return it.
 *
 * @param w - The world.
 * @param name - Part name.
 * @returns Its index.
 */
function partEdge(w: World, name: string): number {
  const b = w.bosses.boss;
  const index = b.parts.findIndex((p, i) => i < b.partCount && p.name === name);
  expect(index, name).toBeGreaterThanOrEqual(0);
  return index;
}

/**
 * Counts the live enemy bullets of a kind (byte-identical in the old BC, DE and FG edge files).
 *
 * @param w - The world.
 * @param kind - `BulletKind`.
 * @param maxAge - Only bullets at most this old (default: any).
 * @returns The count.
 */
export function bullets(w: World, kind: number, maxAge = Number.POSITIVE_INFINITY): number {
  const pool = w.bullets.pool;
  const f = pool.fields;
  let n = 0;
  for (let i = 0; i < pool.count; i++) if (f.kind[i] === kind && f.age[i] <= maxAge) n++;
  return n;
}

/**
 * The headings of the fresh (age ≤ 1) bullets of a kind, whole units in `[0, 1024)`, sorted
 * (byte-identical in the old DE and FG edge files).
 *
 * @param w - The world.
 * @param kind - `BulletKind`.
 * @returns The headings.
 */
export function freshAngles(w: World, kind: number): number[] {
  const pool = w.bullets.pool;
  const f = pool.fields;
  const out: number[] = [];
  for (let i = 0; i < pool.count; i++) {
    if (f.kind[i] === kind && f.age[i] <= 1) {
      out.push(((Math.round(f.angle[i]) % ANGLE_UNITS) + ANGLE_UNITS) % ANGLE_UNITS);
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * The live enemies of an id — the non-edge files' body (ghosts kept, the index read straight
 * off the DB). Defined once; {@link zoneKit} builds it and `zoneKitEdgeHi` (R5-P.P5a2) returns
 * the same body.
 *
 * @param db - The resolved DB.
 * @returns The file's `live`.
 */
function makeLiveDirect(db: ContentDb): (w: World, id: string) => Enemy[] {
  /**
   * The live enemies of an id.
   *
   * @param w - The world.
   * @param id - Enemy id.
   * @returns Them, in slot order.
   */
  function live(w: World, id: string): Enemy[] {
    const index = db.enemyIndex.get(id);
    return w.enemies.enemies.filter((e) => e.state === EnemyState.Live && e.specIndex === index);
  }
  return live;
}

/**
 * A free-flight world (static camera), the ship holding fire and invulnerable, and a world with
 * a boss started and fighting — the body the **four non-edge files share** (their `freeFlight`,
 * `fighting` and ghost-keeping `live` are byte-identical).
 *
 * @param db - The file's DB.
 * @returns The kit: `freeFlight`, `fighting`, `live`.
 */
export function zoneKit(db: ContentDb): {
  freeFlight: () => World;
  fighting: (id: string) => World;
  live: (w: World, id: string) => Enemy[];
} {
  /**
   * A free-flight world (static camera), the ship holding fire and invulnerable.
   *
   * @returns The world.
   */
  function freeFlight(): World {
    const w = createWorld(resolveGameConfig({ seed: 7, autofire: false, remoteMode: false }), db);
    w.debugFlags.godMode = true;
    return w;
  }
  /**
   * A world with a boss started and fighting.
   *
   * @param id - The boss's enemy id.
   * @returns The world.
   */
  function fighting(id: string): World {
    const w = freeFlight();
    expect(w.bosses.startBoss(db.enemyIndex.get(id) ?? -1)).toBe(true);
    for (let i = 0; i < 400 && w.bosses.boss.state !== BossState.Fight; i++) run(w, 1);
    expect(w.bosses.boss.state).toBe(BossState.Fight);
    return w;
  }
  return { freeFlight, fighting, live: makeLiveDirect(db) };
}

/**
 * An enemy index by id — the body the three shipped-roster edge files share.
 *
 * @param db - The file's DB.
 * @returns The file's `indexOf`.
 */
function makeIndexOf(db: ContentDb): (id: string) => number {
  /**
   * An enemy index by id.
   *
   * @param id - Enemy id.
   * @returns The index.
   */
  function indexOf(id: string): number {
    const index = db.enemyIndex.get(id);
    if (index === undefined) throw new Error('no ' + id);
    return index;
  }
  return indexOf;
}

/**
 * Spawns an enemy — the body the three shipped-roster edge files share.
 *
 * @param indexOf - The file's `indexOf`.
 * @returns The file's `spawn`.
 */
function makeSpawn(
  indexOf: (id: string) => number,
): (w: World, id: string, x: number, y: number) => Enemy {
  /**
   * Spawns an enemy.
   *
   * @param w - The world.
   * @param id - Enemy id.
   * @param x - World x.
   * @param y - World y (`NaN` = on its ground).
   * @returns The enemy.
   */
  function spawn(w: World, id: string, x: number, y: number): Enemy {
    const e = w.enemies.spawn(indexOf(id), x, y);
    if (e === null) throw new Error('could not spawn ' + id);
    return e;
  }
  return spawn;
}

/**
 * A free-flight world with a boss started and fighting — the body the three shipped-roster edge
 * files share (it runs on the file's own `world`).
 *
 * @param world - The file's `world`.
 * @param indexOf - The file's `indexOf`.
 * @returns The file's `fighting`.
 */
function makeFighting(
  world: (stage?: boolean) => World,
  indexOf: (id: string) => number,
): (id: string) => World {
  /**
   * A free-flight world with a boss started and fighting.
   *
   * @param id - The boss's enemy id.
   * @returns The world.
   */
  function fighting(id: string): World {
    const w = world();
    expect(w.bosses.startBoss(indexOf(id))).toBe(true);
    for (let i = 0; i < 400 && w.bosses.boss.state !== BossState.Fight; i++) run(w, 1);
    expect(w.bosses.boss.state).toBe(BossState.Fight);
    return w;
  }
  return fighting;
}

/**
 * The live enemies of an id — the DE and FG edge files' body (ghosts kept, the index through
 * their `indexOf`).
 *
 * @param indexOf - The file's `indexOf`.
 * @returns The file's `live`.
 */
function makeLiveKeepsEdge(indexOf: (id: string) => number): (w: World, id: string) => Enemy[] {
  /**
   * The live enemies of an id.
   *
   * @param w - The world.
   * @param id - Enemy id.
   * @returns Them, in slot order.
   */
  function live(w: World, id: string): Enemy[] {
    const index = indexOf(id);
    return w.enemies.enemies.filter((e) => e.state === EnemyState.Live && e.specIndex === index);
  }
  return live;
}

/**
 * The B/C edge kit: `world` (seed 11, the still terrain stage `w`), the shared `indexOf`,
 * `spawn` and `fighting`, the edge `live` that **drops** ghosts, and the edge `part` (the local
 * boss is `b`).
 *
 * @param db - The file's DB.
 * @returns The kit.
 */
export function zoneKitEdgeBc(db: ContentDb): {
  world: (stage?: boolean) => World;
  indexOf: (id: string) => number;
  spawn: (w: World, id: string, x: number, y: number) => Enemy;
  fighting: (id: string) => World;
  live: (w: World, id: string) => Enemy[];
  part: (w: World, name: string) => number;
} {
  /**
   * A world, the ship holding fire and invulnerable: free flight, or the still stage `w`
   * (floor at y 160) with the ship flown in.
   *
   * @param stage - Play the still stage.
   * @returns The world.
   */
  function world(stage = false): World {
    const w = createWorld(
      resolveGameConfig({
        seed: 11,
        autofire: false,
        remoteMode: false,
        ...(stage ? { stage: 'w' } : {}),
      }),
      db,
    );
    w.debugFlags.godMode = true;
    if (stage) run(w, 45);
    return w;
  }
  const indexOf = makeIndexOf(db);
  /**
   * The live (non-ghost) enemies of an id.
   *
   * @param w - The world.
   * @param id - Enemy id.
   * @returns Them, in slot order.
   */
  function live(w: World, id: string): Enemy[] {
    const index = indexOf(id);
    return w.enemies.enemies.filter(
      (e) =>
        e.state === EnemyState.Live && e.specIndex === index && (e.flags & EnemyFlag.Ghost) === 0,
    );
  }
  return {
    world,
    indexOf,
    spawn: makeSpawn(indexOf),
    fighting: makeFighting(world, indexOf),
    live,
    part: partEdge,
  };
}

/**
 * The D/E edge kit: `world` (seed 13, the scrolling stage `s`), the shared `indexOf`, `spawn`
 * and `fighting`, the ghost-**keeping** edge `live` (identical in the FG kit, `zoneKitEdgeFg` —
 * R5-P.P5a2) and the edge `part`.
 *
 * @param db - The file's DB.
 * @returns The kit.
 */
export function zoneKitEdgeDe(db: ContentDb): {
  world: (stage?: boolean) => World;
  indexOf: (id: string) => number;
  spawn: (w: World, id: string, x: number, y: number) => Enemy;
  fighting: (id: string) => World;
  live: (w: World, id: string) => Enemy[];
  part: (w: World, name: string) => number;
} {
  /**
   * A world, the ship holding fire and invulnerable: free flight, or the scrolling stage `s`
   * (1 px/tick, open space) with the ship flown in.
   *
   * @param stage - Play the scrolling stage.
   * @returns The world.
   */
  function world(stage = false): World {
    const w = createWorld(
      resolveGameConfig({
        seed: 13,
        autofire: false,
        remoteMode: false,
        ...(stage ? { stage: 's' } : {}),
      }),
      db,
    );
    w.debugFlags.godMode = true;
    if (stage) run(w, 45);
    return w;
  }
  const indexOf = makeIndexOf(db);
  return {
    world,
    indexOf,
    spawn: makeSpawn(indexOf),
    fighting: makeFighting(world, indexOf),
    live: makeLiveKeepsEdge(indexOf),
    part: partEdge,
  };
}

/**
 * A deep copy of a shipped roster entry under a new id — the `copy` byte-identical in the three
 * shipped-roster edge files. Defined once; the roster factories return it.
 *
 * @param roster - The file's `ROSTER`.
 * @returns The file's `copy`.
 */
function makeCopy(roster: Entry[]): (base: string, id: string) => Entry {
  /**
   * A deep copy of a shipped roster entry under a new id.
   *
   * @param base - The shipped id.
   * @param id - The variant's id.
   * @returns The copy.
   */
  function copy(base: string, id: string): Entry {
    const entry = roster.find((e) => e.id === base);
    if (entry === undefined) throw new Error('no ' + base);
    const out = JSON.parse(JSON.stringify(entry)) as Entry;
    out.id = id;
    return out;
  }
  return copy;
}

/**
 * A variant of a shipped enemy with other tunables — the `enemy` byte-identical in the BC and DE
 * edge files (the FG one takes a wider body; `rosterKitFg` — R5-P.P5a2).
 *
 * @param copy - The file's `copy`.
 * @returns The file's `enemy`.
 */
function makeEnemy(copy: (base: string, id: string) => Entry) {
  /**
   * A variant of a shipped enemy with other tunables.
   *
   * @param base - The shipped id.
   * @param id - The variant's id.
   * @param params - Its tunables (replacing the shipped ones).
   * @returns The entry.
   */
  return function enemy(base: string, id: string, params: Record<string, number>): Entry {
    const out = copy(base, id);
    out.params = params;
    return out;
  };
}

/**
 * The B/C edge roster builders: the shared `copy`, the shared `enemy` and this file kind's
 * `boss` (one phase of its own script, parts added after the shipped ones).
 *
 * @param roster - The file's `ROSTER`.
 * @returns The kit: `copy`, `enemy`, `boss`.
 */
export function rosterKitBc(roster: Entry[]): {
  copy: (base: string, id: string) => Entry;
  enemy: (base: string, id: string, params: Record<string, number>) => Entry;
  boss: (
    base: string,
    id: string,
    params: Record<string, number>,
    extraParts?: Record<string, unknown>[],
  ) => Entry;
} {
  const copy = makeCopy(roster);
  /**
   * A variant of a shipped boss with one phase of its own script.
   *
   * @param base - The shipped boss id.
   * @param id - The variant's id.
   * @param params - The phase's tunables.
   * @param extraParts - Parts added after the shipped ones.
   * @returns The entry.
   */
  function boss(
    base: string,
    id: string,
    params: Record<string, number>,
    extraParts: Record<string, unknown>[] = [],
  ): Entry {
    const out = copy(base, id);
    const data = out.boss;
    if (data === undefined) throw new Error(base + ' is no boss');
    data.code = 'V-' + id.length.toString();
    data.displayName = id.toUpperCase();
    data.phases = [{ script: data.phases[0].script, params }];
    data.parts.push(...extraParts);
    return out;
  }
  return { copy, enemy: makeEnemy(copy), boss };
}

/**
 * The D/E edge roster builders: the shared `copy`, the shared `enemy` and this file kind's
 * `boss` (one phase of its own script, no added parts).
 *
 * @param roster - The file's `ROSTER`.
 * @returns The kit: `copy`, `enemy`, `boss`.
 */
export function rosterKitDe(roster: Entry[]): {
  copy: (base: string, id: string) => Entry;
  enemy: (base: string, id: string, params: Record<string, number>) => Entry;
  boss: (base: string, id: string, params: Record<string, number>) => Entry;
} {
  const copy = makeCopy(roster);
  /**
   * A variant of a shipped boss with one phase of its own script.
   *
   * @param base - The shipped boss id.
   * @param id - The variant's id.
   * @param params - The phase's tunables.
   * @returns The entry.
   */
  function boss(base: string, id: string, params: Record<string, number>): Entry {
    const out = copy(base, id);
    const data = out.boss;
    if (data === undefined) throw new Error(base + ' is no boss');
    data.code = 'V-' + id.length.toString();
    data.displayName = id.toUpperCase();
    data.phases = [{ script: data.phases[0].script, params }];
    return out;
  }
  return { copy, enemy: makeEnemy(copy), boss };
}

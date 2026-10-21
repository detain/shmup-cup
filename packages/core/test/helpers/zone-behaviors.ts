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
 *   where the others assert (it rides the HI kit as its `part` member).
 * - The helpers that resolve an id against the built `DB` come as one kit per old-file shape:
 *   {@link zoneKit} (the four non-edge files), {@link zoneKitEdgeBc} (B/C edge),
 *   {@link zoneKitEdgeDe} (D/E edge), {@link zoneKitEdgeFg} (F/G edge) and {@link zoneKitEdgeHi}
 *   (H/I edge). Where a body repeats between kits, the module defines it once and each kit
 *   returns it.
 * - The roster builders read the file's `ROSTER` while the file *builds* its `DB`, so they come
 *   as one factory per file kind: {@link rosterKitBc} (the B/C edge pair), {@link rosterKitDe}
 *   (the D/E edge pair) and {@link rosterKitFg} (the F/G edge pair); the H/I edge files'
 *   hand-written entries are built by {@link enemy}.
 *
 * The helper lives under `packages/core/test/helpers/` and imports core **by relative path**
 * (the way `v1-port.ts` does): a core test must not load a second `@shmup/core` instance through
 * the package name.
 *
 * @module
 */
import { expect } from 'vitest';
import { BossState, type BossPart } from '../../src/bosses/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { ANGLE_UNITS } from '../../src/math/index.js';
import type { ContentDb } from '../../src/data/index.js';
import { EnemyFlag, EnemyState, type Enemy } from '../../src/enemies/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';

/**
 * A boss phase as JSON (the FG kind's entry names its phases by it).
 */
export interface Phase {
  script: string;
  params?: Record<string, number>;
  until?: unknown;
}

/**
 * A roster entry as JSON (only the fields the variants touch are typed; one widened type serves
 * the BC, DE and FG edge files — FG's adds the optional `child` and names its phases by
 * {@link Phase}).
 */
export interface Entry {
  id: string;
  params?: Record<string, number>;
  child?: string;
  boss?: {
    code: string;
    displayName: string;
    parts: Record<string, unknown>[];
    phases: Phase[];
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

/**
 * The F/G edge kit: `world` (seed 13, one line, no stage), the shared `indexOf`, `spawn` and
 * `fighting`, the ghost-keeping edge `live` (identical to the DE kit's body) and the edge `part`.
 *
 * @param db - The file's DB.
 * @returns The kit.
 */
export function zoneKitEdgeFg(db: ContentDb): {
  world: () => World;
  indexOf: (id: string) => number;
  spawn: (w: World, id: string, x: number, y: number) => Enemy;
  fighting: (id: string) => World;
  live: (w: World, id: string) => Enemy[];
  part: (w: World, name: string) => number;
} {
  /**
   * A free-flight world, the ship holding fire and invulnerable.
   *
   * @returns The world.
   */
  function world(): World {
    const w = createWorld(resolveGameConfig({ seed: 13, autofire: false, remoteMode: false }), db);
    w.debugFlags.godMode = true;
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
 * A part index of the fighting boss by name — the HI-edge body (it *throws* where the others
 * assert). Rides the HI kit under the name the old files called it.
 *
 * @param w - The world.
 * @param name - Part name.
 * @returns Its index.
 */
function partThrows(w: World, name: string): number {
  const boss = w.bosses.boss;
  const i = boss.parts.findIndex((p, k) => k < boss.partCount && p.name === name);
  if (i < 0) throw new Error('no part ' + name);
  return i;
}

/**
 * The H/I edge kit: `freeFlight` (steps 60 fly-in ticks), the camera-relative `spawn`, the
 * `fighting` that steps **one tick more** once the boss is fighting (its first phase's script has
 * started), the ghost-keeping `live` (the non-edge kit's body) and the throwing `part`. The old
 * file had no `world` and no `indexOf`.
 *
 * @param db - The file's DB.
 * @returns The kit.
 */
export function zoneKitEdgeHi(db: ContentDb): {
  freeFlight: () => World;
  spawn: (w: World, id: string, x: number, y: number) => Enemy;
  fighting: (id: string) => World;
  live: (w: World, id: string) => Enemy[];
  part: (w: World, name: string) => number;
} {
  /**
   * A free-flight world (static camera), the ship invulnerable and holding its fire.
   *
   * @returns The world.
   */
  function freeFlight(): World {
    const w = createWorld(resolveGameConfig({ seed: 7, autofire: false, remoteMode: false }), db);
    w.debugFlags.godMode = true;
    run(w, 60); // the fly-in
    return w;
  }
  /**
   * Spawns an enemy of the roster at a screen position.
   *
   * @param w - The world.
   * @param id - Enemy id.
   * @param x - Screen x.
   * @param y - Screen y.
   * @returns The enemy.
   */
  function spawn(w: World, id: string, x: number, y: number): Enemy {
    const e = w.enemies.spawn(db.enemyIndex.get(id) ?? -1, w.camera.x + x, w.camera.y + y);
    if (e === null) throw new Error('no slot for ' + id);
    return e;
  }
  /**
   * A free-flight world whose boss fights (slot 0).
   *
   * @param id - Boss id.
   * @returns The world.
   */
  function fighting(id: string): World {
    const w = freeFlight();
    expect(w.bosses.startBoss(db.enemyIndex.get(id) ?? -1)).toBe(true);
    for (let i = 0; i < 400 && w.bosses.boss.state !== BossState.Fight; i++) run(w, 1);
    expect(w.bosses.boss.state).toBe(BossState.Fight);
    run(w, 1); // its first phase's script has started
    return w;
  }
  return { freeFlight, spawn, fighting, live: makeLiveDirect(db), part: partThrows };
}

/**
 * The F/G edge roster builders: the shared `copy`, this file kind's wider `enemy` (other fields
 * through `extra`) and its `boss` (phases of its own, each on the shipped phase 0's script when
 * it names none).
 *
 * @param roster - The file's `ROSTER`.
 * @returns The kit: `copy`, `enemy`, `boss`.
 */
export function rosterKitFg(roster: Entry[]): {
  copy: (base: string, id: string) => Entry;
  enemy: (
    base: string,
    id: string,
    params: Record<string, number>,
    extra?: Partial<Entry>,
  ) => Entry;
  boss: (base: string, id: string, ...phases: Partial<Phase>[]) => Entry;
} {
  const copy = makeCopy(roster);
  /**
   * A variant of a shipped enemy with other tunables.
   *
   * @param base - The shipped id.
   * @param id - The variant's id.
   * @param params - Its tunables (replacing the shipped ones).
   * @param extra - Other fields to set.
   * @returns The entry.
   */
  function enemy(
    base: string,
    id: string,
    params: Record<string, number>,
    extra: Partial<Entry> = {},
  ): Entry {
    const out = copy(base, id);
    out.params = params;
    Object.assign(out, extra);
    return out;
  }
  /**
   * A variant of a shipped boss with phases of its own.
   *
   * @param base - The shipped boss id.
   * @param id - The variant's id.
   * @param phases - The phases (the shipped phase 0's script when a phase has none).
   * @returns The entry.
   */
  function boss(base: string, id: string, ...phases: Partial<Phase>[]): Entry {
    const out = copy(base, id);
    const data = out.boss;
    if (data === undefined) throw new Error(base + ' is no boss');
    data.code = 'V-' + id.length.toString();
    data.displayName = id.toUpperCase();
    const script = data.phases[0].script;
    data.phases = phases.map((p) => ({ script, ...p }));
    return out;
  }
  return { copy, enemy, boss };
}

/**
 * A test enemy entry — the H/I edge files' hand-written roster builder (the file kind has no
 * `copy`, no `boss` and no `Entry` typing; both new files import this one).
 *
 * @param id - Enemy id.
 * @param script - Behaviour.
 * @param params - Its tunables.
 * @param over - More fields.
 * @returns The entry.
 */
export function enemy(
  id: string,
  script: string,
  params: Record<string, number>,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    hp: 3,
    score: 300,
    hurtbox: { hw: 5, hh: 5 },
    script,
    params,
    sprite: 'enemies/drifter',
    drop: null,
    settleTicks: 0,
    ...over,
  };
}

/**
 * The live lasers attached to a source slot (the HI files' body).
 *
 * @param w - The world.
 * @param slot - Source slot (an enemy's, or a boss part's).
 * @returns Laser pool indices.
 */
export function lasersOf(w: World, slot: number): number[] {
  const lasers = w.bullets.lasers;
  const out: number[] = [];
  for (let i = 0; i < lasers.count; i++) if (lasers.fields.src[i] === slot) out.push(i);
  return out;
}

/**
 * Steps one tick from an empty bullet pool and returns the bullets it fired.
 *
 * @param w - The world.
 * @returns `[x, y, heading, kind]` per bullet.
 */
export function fired(w: World): Array<[number, number, number, number]> {
  w.bullets.pool.clear();
  run(w, 1);
  const f = w.bullets.pool.fields;
  const out: Array<[number, number, number, number]> = [];
  for (let i = 0; i < w.bullets.count; i++) out.push([f.x[i], f.y[i], f.angle[i], f.kind[i]]);
  return out;
}

/**
 * A part's own turn as a signed number of binary units in `[-512, 512)`.
 *
 * @param p - The part.
 * @returns The turn.
 */
export function turn(p: BossPart): number {
  const a = Math.round(p.angle) % ANGLE_UNITS;
  return a >= ANGLE_UNITS / 2 ? a - ANGLE_UNITS : a;
}

/**
 * The arm segments of a boss (circle-hit parts attached to another part), by side: the top arms
 * (their root hangs above its parent) and the bottom arms.
 *
 * @param w - The world.
 * @returns The two lists of parts.
 */
export function arms(w: World): { top: BossPart[]; bottom: BossPart[] } {
  const b = w.bosses.boss;
  const parts = b.parts.slice(0, b.partCount);
  const top: BossPart[] = [];
  const bottom: BossPart[] = [];
  for (const p of parts) {
    if (p.radius <= 0 || p.parent < 0) continue;
    let root = p;
    while (root.parent >= 0 && parts[root.parent].radius > 0) root = parts[root.parent];
    (root.restY < 0 ? top : bottom).push(p);
  }
  return { top, bottom };
}

/**
 * The curl of an arm segment towards its side (`turn` × −1 above, × 1 below).
 *
 * @param w - The world.
 * @param p - The segment.
 * @returns Binary units.
 */
export function curlOf(w: World, p: BossPart): number {
  return arms(w).top.includes(p) ? -turn(p) : turn(p);
}

/**
 * Records the curl of a boss's first standing arm segment every tick, checking on every tick that
 * every standing segment of both arms has the same curl — the top arm's turn mirrored below.
 *
 * @param w - The world (fighting).
 * @param ticks - Ticks.
 * @returns The curls, one per tick.
 */
export function curls(w: World, ticks: number): number[] {
  const { top, bottom } = arms(w);
  const out: number[] = [];
  for (let t = 0; t < ticks; t++) {
    run(w, 1);
    const standing = [...top, ...bottom].filter((p) => !p.destroyed);
    const c = curlOf(w, standing[0]);
    for (const p of top) if (!p.destroyed) expect(turn(p) + c, p.name).toBe(0);
    for (const p of bottom) if (!p.destroyed) expect(turn(p) - c, p.name).toBe(0);
    out.push(c === 0 ? 0 : c); // no −0
  }
  return out;
}

/**
 * Collapses a series into runs of equal values, e.g. `[0, 0, 1]` → `['0×2', '1×1']`.
 *
 * @param values - The series.
 * @returns The runs.
 */
export function runs(values: readonly number[]): string[] {
  const out: string[] = [];
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    n++;
    if (i === values.length - 1 || values[i + 1] !== values[i]) {
      out.push(String(values[i]) + '×' + String(n));
      n = 0;
    }
  }
  return out;
}

/**
 * The biggest change between two neighbours of a series.
 *
 * @param values - The series.
 * @returns The largest absolute step.
 */
export function biggestStep(values: readonly number[]): number {
  let most = 0;
  for (let i = 1; i < values.length; i++)
    most = Math.max(most, Math.abs(values[i] - values[i - 1]));
  return most;
}

/** Tunables of a quiet `boss.facet` phase: held still, no needles (nothing else by default). */
export const FACET_QUIET = { trackSpeed: 0, fireTicks: 100_000 } as const;

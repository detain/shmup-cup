/**
 * Edge cases of the M2-07 additions to `core/enemies`, with test behaviours in a World on a still
 * stage with a flat floor (top at y 168):
 *
 * - the `ScriptApi` gimmick calls (`pull`, `release`, `chain`, `placeTile`, `tileId`) through the
 *   World's stage gimmicks, and all of them doing nothing without a gimmick host;
 * - `setMoverOf` steering a live child and ignoring a removed enemy;
 * - `destroy` (`EnemySystem.destroy` / `ScriptApi.destroy`): no score, no drop, no death
 *   behaviour, the explosion only on request, `false` for removed enemies and ghosts, a formation
 *   member counting as escaped (no bonus);
 * - `landed()` and the landing wake: a `Ballistic` `stop` body wakes its sleeping script on the
 *   tick after it lands, once — a new `setMover` arms the wake again; `landed()` is false for
 *   other movers;
 * - a content `ballistic` mover (land default `stop`, `shatter` destroyed without credit);
 * - the `death` callback: run by a shot kill with the enemy still in place (children spawned
 *   there), not by `destroy`, the Mega Crash or the blue capsule's screen clear.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_BEHAVIOR_DEFS,
  createBehaviorRegistry,
  defineBehavior,
  type BehaviorRegistry,
} from '../../src/behaviors/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { DropKind, EnemyFlag, EnemyState, type Enemy } from '../../src/enemies/index.js';
import { SimEventKind } from '../../src/events/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import {
  BALLISTIC_LANDED,
  BallisticLand,
  MoverKind,
  SLEEP_FOREVER,
  type Script,
} from '../../src/patterns/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';

/**
 * A shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The file.
 */
function shipped(path: string): ContentFile {
  return {
    path,
    data: JSON.parse(
      readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
    ) as unknown,
  };
}

/**
 * An enemy entry over a small flying test enemy.
 *
 * @param id - Enemy id.
 * @param over - Fields to change.
 * @returns The entry.
 */
function enemy(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    hp: 1,
    score: 100,
    hurtbox: { hw: 4, hh: 4 },
    script: 'test.idle',
    sprite: 'enemies/drifter',
    drop: null,
    ...over,
  };
}

/** The test DB: the KESTREL, `terrain-a`, the test enemies, a still stage with a flat floor. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('tilesets/terrain-a.tileset.json'),
      {
        path: 'enemies/t.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            enemy('idle'),
            enemy('api', { script: 'test.api' }),
            enemy('thrower', { script: 'test.thrower', child: 'idle' }),
            enemy('lander', { script: 'test.lander' }),
            enemy('splitter', { script: 'test.splitter', child: 'idle', drop: 'capsule' }),
            enemy('dropper', { mover: { type: 'ballistic', vx: 0, vy: 0, gravity: 0.5 } }),
            enemy('shatterer', {
              mover: { type: 'ballistic', vx: 0, vy: 1, gravity: 0.25, land: 'shatter' },
            }),
          ],
        },
      },
      {
        path: 'stages/t.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 't',
          name: 'T',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 3000,
          camera: [{ x: 0, speed: 0 }],
          checkpoints: [{ x: 0 }],
          parallax: [],
          tilemap: {
            tileSize: 8,
            tileset: 'terrain-a',
            rowsTall: 25,
            generator: {
              type: 'heightfield',
              segments: [{ from: 0, to: 3384, floor: { base: 32, amp: 0, period: 64, seed: 1 } }],
            },
          },
          events: [],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/** What the `test.api` script got from each gimmick call. */
let apiLog: Record<string, unknown> = {};

/** Ticks on which the `test.lander` script woke, with `landed()`. */
const wakes: [number, boolean][] = [];

/** Death callbacks: `[slot, x, y, spawned child]`. */
const deaths: [number, number, number, Enemy | null][] = [];

/** The child `test.thrower` spawned. */
let thrown: Enemy | null = null;

/** Test behaviours plus the roster. */
const REGISTRY: BehaviorRegistry = createBehaviorRegistry([
  ...DEFAULT_BEHAVIOR_DEFS,
  defineBehavior('test.idle', {}, function* idle(): Script {
    yield SLEEP_FOREVER;
  }),
  defineBehavior('test.api', {}, function* api(a): Script {
    apiLog = {
      tileId: a.tileId('cube'),
      unknownTile: a.tileId('no-such-tile'),
      pull: a.pull(40, 1, 0),
      chain: a.chain(a.self.x, a.self.y - 30, 5),
      place: a.placeTile(a.self.x, a.self.y, a.tileId('cube')),
      landed: a.landed(),
    };
    a.release();
    apiLog.releasedField = true;
    yield SLEEP_FOREVER;
  }),
  defineBehavior(
    'test.thrower',
    {},
    function* thrower(a): Script {
      thrown = a.spawn(a.spec.childId, 0, 0);
      if (thrown !== null) a.setMoverOf(thrown, MoverKind.Straight, -3, 1);
      yield SLEEP_FOREVER;
    },
    true,
  ),
  defineBehavior('test.lander', {}, function* lander(a): Script {
    a.setMover(MoverKind.Ballistic, 0, 0, 0.5, 4, 0, BallisticLand.Stop);
    yield 1000;
    wakes.push([a.tick, a.landed()]);
    yield 200; // landed: no second wake
    wakes.push([a.tick, a.landed()]);
    // Up again on a fresh mover: the next landing wakes it again.
    a.self.y -= 40;
    a.setMover(MoverKind.Ballistic, 0, 0, 0.5, 4, 0, BallisticLand.Stop);
    yield 1000;
    wakes.push([a.tick, a.landed()]);
    yield SLEEP_FOREVER;
  }),
  defineBehavior(
    'test.splitter',
    {},
    function* splitter(): Script {
      yield SLEEP_FOREVER;
    },
    true,
    false,
    (a) => {
      deaths.push([a.self.slot, a.self.x, a.self.y, a.spawn(a.spec.childId, 0, 0)]);
    },
  ),
]);

/**
 * A world on the still stage (god mode, the ship flown in and parked at the top of the view, out
 * of the way of the test enemies and their shots).
 *
 * @returns The world.
 */
function world(): World {
  const w = createWorld(resolveGameConfig({ seed: 5, stage: 't' }), DB, { behaviors: REGISTRY });
  w.debugFlags.godMode = true;
  run(w, 45);
  w.players[0].y = 20;
  run(w, 60); // the shots already on their way at the old height leave the view
  return w;
}

/**
 * Steps a world with no input.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) stepWorld(w, input);
}

/**
 * Spawns an enemy.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param x - World x.
 * @param y - World y.
 * @returns The enemy.
 */
function put(w: World, id: string, x: number, y: number): Enemy {
  const e = w.enemies.spawn(w.content.enemyIndex.get(id) ?? -1, x, y);
  if (e === null) throw new Error('could not spawn ' + id);
  return e;
}

/**
 * Drains the events as `[kind, id]`.
 *
 * @param w - The world.
 * @returns The pairs.
 */
function drain(w: World): [number, number][] {
  const out: [number, number][] = [];
  w.events.drain((e) => out.push([e.kind, e.id]));
  return out;
}

beforeEach(() => {
  apiLog = {};
  wakes.length = 0;
  deaths.length = 0;
  thrown = null;
});

describe('core/enemies ScriptApi — gimmick calls', () => {
  it('reaches the World stage gimmicks', () => {
    const w = world();
    const e = put(w, 'api', 200, 60);
    run(w, 2);
    const cube = w.gimmicks.tileId('cube');
    expect(cube).toBeGreaterThan(0);
    expect(apiLog).toEqual({
      tileId: cube,
      unknownTile: -1,
      pull: true,
      chain: true,
      place: true,
      landed: false,
      releasedField: true,
    });
    expect(w.gimmicks.fieldOwner[0]).toBe(-1); // released
    expect(w.gimmicks.chainOwner[0]).toBe(e.slot);
    const map = w.terrain;
    if (map === null) throw new Error('no terrain');
    expect(map.tiles[Math.floor(60 / 8) * map.cols + Math.floor(200 / 8)]).toBe(cube);
  });

  it('does nothing without a gimmick host', () => {
    const w = world();
    (w as { gimmicks: unknown }).gimmicks = null;
    put(w, 'api', 200, 60);
    // Step the enemy system only: the World's own phases need their gimmicks.
    w.enemies.runScripts();
    w.enemies.runScripts();
    expect(apiLog).toEqual({
      tileId: -1,
      unknownTile: -1,
      pull: false,
      chain: false,
      place: false,
      landed: false,
      releasedField: true,
    });
  });

  it('refuses pull and chain for an enemy that is no longer live', () => {
    const w = world();
    const e = put(w, 'idle', 200, 60);
    const api = (w.enemies as unknown as { apis: { pull: (...a: number[]) => boolean }[] }).apis[
      e.slot
    ] as unknown as {
      pull(r: number, s: number, t: number): boolean;
      chain(x: number, y: number, n: number): boolean;
    };
    w.enemies.destroy(e, false);
    expect(api.pull(10, 1, 0)).toBe(false);
    expect(api.chain(0, 0, 3)).toBe(false);
    expect(w.gimmicks.fieldOwner.every((o) => o < 0)).toBe(true);
  });
});

describe('core/enemies — setMoverOf and destroy', () => {
  it('steers a spawned child, and ignores a removed one', () => {
    const w = world();
    const parent = put(w, 'thrower', 200, 60);
    run(w, 1);
    const child = thrown;
    if (child === null) throw new Error('no child');
    expect([child.mover, child.m0, child.m1]).toEqual([MoverKind.Straight, -3, 1]);
    const x = child.x;
    run(w, 2);
    expect(child.x).toBeCloseTo(x - 6, 9);
    // A removed enemy keeps its mover.
    w.enemies.destroy(child, false);
    const api = (w.enemies as unknown as { apis: unknown[] }).apis[parent.slot] as {
      setMoverOf(other: Enemy, kind: number, p0?: number): void;
    };
    api.setMoverOf(child, MoverKind.None);
    expect(child.mover).toBe(MoverKind.Straight);
  });

  it('removes without score, drop or death behaviour; the explosion only on request', () => {
    const w = world();
    const e = put(w, 'splitter', 200, 60);
    run(w, 1);
    drain(w);
    const score = w.scoring.board.scores[0].score;
    expect(w.enemies.destroy(e, false)).toBe(true);
    expect(e.state).toBe(EnemyState.Removed);
    expect(drain(w)).toEqual([]);
    expect(w.enemies.destroy(e)).toBe(false); // already removed
    const f = put(w, 'splitter', 220, 60);
    expect(w.enemies.destroy(f)).toBe(true);
    const events = drain(w);
    expect(events.map(([kind]) => kind)).toEqual([SimEventKind.Sfx, SimEventKind.Particles]);
    run(w, 2);
    expect(deaths).toEqual([]);
    expect(w.scoring.board.scores[0].score).toBe(score);
    expect(w.enemies.outcomes.killCount).toBe(0);
    expect(w.powerups.pool.count).toBe(0); // no capsule
  });

  it('refuses a ghost leader, and counts a destroyed formation member as escaped', () => {
    const w = world();
    const slot = w.enemies.startFormation(
      w.content.enemyIndex.get('idle') ?? -1,
      2,
      1,
      200,
      60,
      -1,
      DropKind.Capsule,
      500,
    );
    run(w, 3);
    const members = w.enemies.enemies.filter(
      (e) => e.state === EnemyState.Live && e.formation === slot,
    );
    expect(members).toHaveLength(2);
    const [leader, member] = members;
    // The leader killed while a member is out would become a ghost: destroy the member first.
    expect(w.enemies.destroy(member, false)).toBe(true);
    w.enemies.kill(leader, 0);
    run(w, 2);
    // One escaped: no bonus, no capsule.
    expect(drain(w).filter(([kind]) => kind === SimEventKind.FormationBonus)).toEqual([]);
    expect(w.powerups.pool.count).toBe(0);
    // A ghost cannot be destroyed.
    const g = w.enemies.startFormation(
      w.content.enemyIndex.get('idle') ?? -1,
      2,
      1,
      200,
      60,
      -1,
      0,
      0,
    );
    run(w, 3);
    const pair = w.enemies.enemies.filter((e) => e.state === EnemyState.Live && e.formation === g);
    const head = pair.find((e) => e.member === 0);
    if (head === undefined) throw new Error('no leader');
    w.enemies.kill(head, 0);
    expect((head.flags & EnemyFlag.Ghost) !== 0).toBe(true);
    expect(w.enemies.destroy(head)).toBe(false);
  });
});

describe('core/enemies — landing', () => {
  it('wakes a sleeping script the tick after its body lands, once per mover', () => {
    const w = world();
    const e = put(w, 'lander', 200, 100);
    let landedAt = -1;
    for (let t = 0; t < 120 && landedAt < 0; t++) {
      run(w, 1);
      if (e.s0 === BALLISTIC_LANDED) landedAt = w.tick - 1;
    }
    expect(landedAt).toBeGreaterThan(0);
    run(w, 2);
    expect(wakes).toEqual([[landedAt + 1, true]]);
    // Its bottom rests just above the floor (y 168).
    expect(e.y + 4).toBeLessThanOrEqual(168);
    expect(e.y + 4).toBeGreaterThan(160);
    // The 200-tick sleep ran out on its own (no second wake from the landing).
    run(w, 199);
    expect(wakes).toHaveLength(2);
    expect(wakes[1]).toEqual([landedAt + 201, true]);
    // A fresh mover lands again and wakes it again.
    run(w, 60);
    expect(wakes).toHaveLength(3);
    expect(wakes[2][1]).toBe(true);
    expect(wakes[2][0]).toBeLessThan(landedAt + 201 + 60);
    expect(e.state).toBe(EnemyState.Live);
  });

  it('lands a content ballistic mover (stop by default) and shatters a `shatter` one', () => {
    const w = world();
    const stopper = put(w, 'dropper', 200, 60);
    const shatterer = put(w, 'shatterer', 240, 60);
    expect(stopper.m5).toBe(BallisticLand.Stop);
    expect(shatterer.m5).toBe(BallisticLand.Shatter);
    drain(w);
    run(w, 80);
    expect(stopper.state).toBe(EnemyState.Live);
    expect(stopper.s0).toBe(BALLISTIC_LANDED);
    expect(shatterer.state).not.toBe(EnemyState.Live);
    const events = drain(w);
    expect(events.filter(([kind]) => kind === SimEventKind.Particles)).toHaveLength(1);
    expect(w.scoring.board.scores[0].score).toBe(0);
  });

  it('reports landed() only for a landed Ballistic body', () => {
    const w = world();
    const e = put(w, 'idle', 200, 60);
    const api = (w.enemies as unknown as { apis: unknown[] }).apis[e.slot] as {
      landed(): boolean;
    };
    expect(api.landed()).toBe(false);
    e.s0 = BALLISTIC_LANDED; // the same state value on another mover
    expect(api.landed()).toBe(false);
    e.mover = MoverKind.Ballistic;
    expect(api.landed()).toBe(true);
  });
});

describe('core/enemies — death behaviours', () => {
  it('runs on a kill, in place, and may spawn children there', () => {
    const w = world();
    const e = put(w, 'splitter', 200, 60);
    run(w, 1);
    const [x, y] = [e.x, e.y];
    expect(w.enemies.kill(e, 0)).toBe(true);
    expect(deaths).toHaveLength(1);
    const [slot, dx, dy, child] = deaths[0];
    expect([slot, dx, dy]).toEqual([e.slot, x, y]);
    expect(child).not.toBeNull();
    expect([child?.x, child?.y]).toEqual([x, y]);
    // Killed without a player (by = -1) it still splits.
    const f = put(w, 'splitter', 220, 60);
    w.enemies.kill(f);
    expect(deaths).toHaveLength(2);
  });

  it('does not run for a Mega Crash or the blue capsule screen clear', () => {
    const w = world();
    put(w, 'splitter', 200, 60);
    put(w, 'splitter', 220, 60);
    run(w, 1);
    expect(w.enemies.megaCrash(0)).toBeGreaterThanOrEqual(1);
    run(w, 1);
    put(w, 'splitter', 200, 60);
    run(w, 1);
    expect(w.enemies.clearOnScreen(0)).toBeGreaterThanOrEqual(1);
    expect(deaths).toEqual([]);
  });
});

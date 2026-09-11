/**
 * Edge cases of `core/enemies` (plan M1-08), beyond the acceptance suite in `enemies.test.ts`:
 *
 * - spawning: stage-event defaults (screen x 400, mid-view y), negative screen x, ground
 *   snapping without terrain (the view's edge), the spec mover's `path` taken from the spawn
 *   event, flying enemies riding the camera from their spawn tick without a double move,
 *   world-anchored ground enemies, lowest-free-slot order and slot reuse after phase 8,
 *   unknown behaviours (no script), resolved behaviour params, bad spec indices (regression:
 *   a fractional index threw a TypeError instead of returning `null`);
 * - formations: bad arguments (`count` 0, `interval` ≤ 0, bad spec — every member escapes),
 *   a full table, slot reuse with reset counters and track, the default capsule of a stage
 *   formation, `drop: null` with a bonus, outcome order (the enemy's own drop first), two
 *   formations completing in one tick, the leader escaping (ghost, no bonus), a ghost leader
 *   removed at {@link GHOST_MARGIN} while the formation still completes with its bonus, a
 *   leader killed last (removed at once, never a ghost), ghost scripts that cannot spawn;
 * - the off-screen rules at their exact boundaries: on screen while the hurtbox touches the
 *   view, escaped beyond {@link DESPAWN_MARGIN} (strictly), never-seen enemies beyond
 *   {@link UNSEEN_MARGIN}, in all four directions; `settleTicks` 0; settled for good;
 * - scripts: `tick`, `target()` (none during the fly-in, the nearer of two players), children
 *   spawned into higher slots start on the next tick, relative spawn offsets;
 * - damage / kill: amount 0, exact kills, overkill, repeated kills in one tick, the flash
 *   window;
 * - contact: the exact circle-vs-box boundary (edges and corners, touching counts), no contact
 *   during the fly-in, from ghosts or with god mode;
 * - the sprite mirror: undrawn sprites (-1), ground / air split, animation frames by age;
 * - `clear()` resets outcomes, batches, formations and slot order; `hashWorld` sees the
 *   formation table.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BEHAVIOR_DEFS,
  createBehaviorRegistry,
  defineBehavior,
  type BehaviorRegistry,
} from '../../src/behaviors/index.js';
import { PLAYFIELD_H, PLAYFIELD_W, resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import {
  DEFAULT_SPAWN_SCREEN_X,
  DESPAWN_MARGIN,
  DropKind,
  EnemyFlag,
  EnemyState,
  GHOST_MARGIN,
  HIT_FLASH_TICKS,
  MAX_ENEMIES,
  MAX_FORMATIONS,
  UNSEEN_MARGIN,
  UNSEEN_TICKS,
  type Enemy,
  type ScriptApi,
} from '../../src/enemies/index.js';
import { SFX_CUES, SimEventKind, type SimEvent } from '../../src/events/index.js';
import { commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { MoverKind, SLEEP_FOREVER, type Script } from '../../src/patterns/index.js';
import { PlayerHitCause } from '../../src/player/index.js';
import { SpriteFlag } from '../../src/presentation/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';

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
 * An enemy entry (overrides over a small flying test enemy).
 *
 * @param id - Enemy id.
 * @param over - Fields to change.
 * @returns The entry.
 */
function enemy(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    hp: 3,
    score: 100,
    hurtbox: { hw: 4, hh: 4 },
    script: 'test.idle',
    sprite: 'enemies/drifter',
    drop: null,
    ...over,
  };
}

/** The enemies every test DB has. */
const ENEMIES = [
  enemy('idle'),
  enemy('left', { mover: { type: 'straight', vx: -2, vy: 0 } }),
  enemy('carrier', { drop: 'capsule', score: 300 }),
  enemy('floor', { ground: 'floor', hurtbox: { hw: 5, hh: 4 }, settleTicks: 0 }),
  enemy('ceiling', { ground: 'ceiling', hurtbox: { hw: 5, hh: 6 } }),
  enemy('pathed', { mover: { type: 'path', speed: 1 } }),
  enemy('ownpath', { mover: { type: 'path', path: 'down', speed: 1 } }),
  enemy('unknown', { script: 'test.nobody', mover: { type: 'straight', vx: -1, vy: 0 } }),
  enemy('tuned', { script: 'test.params', params: { b: 7, extra: 1 } }),
  enemy('spawner', { script: 'test.spawner', child: 'spy' }),
  enemy('spy', { script: 'test.spy' }),
  enemy('leader', { script: 'test.leader', child: 'idle' }),
  enemy('peek', { script: 'test.peek' }),
  enemy('anim', { anim: { frames: 4, ticks: 3 } }),
  enemy('badspawn', { script: 'test.badspawn' }),
];

/**
 * Test content: the KESTREL, the shipped tileset, two paths, the test enemies and a stage.
 *
 * @param stage - Stage fields over the defaults (flat floor 32 px high, static camera).
 * @returns The DB.
 */
function db(stage: Record<string, unknown> = {}): ContentDb {
  const { db: content, issues } = loadContent([
    shipped('player/kestrel.player.json'),
    shipped('tilesets/terrain-a.tileset.json'),
    {
      path: 'paths/t.paths.json',
      data: {
        formatVersion: 1,
        kind: 'paths',
        paths: [
          {
            id: 'left',
            points: [
              { x: 0, y: 0 },
              { x: -100, y: 0 },
            ],
          },
          {
            id: 'down',
            points: [
              { x: 0, y: 0 },
              { x: 0, y: 100 },
            ],
          },
        ],
      },
    },
    {
      path: 'enemies/t.enemies.json',
      data: { formatVersion: 1, kind: 'enemies', enemies: ENEMIES },
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
        ...stage,
      },
    },
  ]);
  expect(issues).toEqual([]);
  return content;
}

/** Resume log of the spy behaviour: `[slot, tick]`. */
const spyLog: Array<[number, number]> = [];

/** Params the `test.params` behaviour received. */
const seenParams: Array<Readonly<Record<string, number>>> = [];

/** What `test.peek` saw on each resume. */
const peeks: Array<{ tick: number; target: unknown }> = [];

/** Results of the `test.spawner` / `test.leader` spawn calls: `[tick, spawned]`. */
const spawnCalls: Array<[number, Enemy | null]> = [];

/** Test behaviours plus the roster. */
const REGISTRY: BehaviorRegistry = createBehaviorRegistry([
  ...DEFAULT_BEHAVIOR_DEFS,
  defineBehavior('test.idle', {}, function* idle(): Script {
    yield SLEEP_FOREVER;
  }),
  defineBehavior('test.spy', {}, function* spy(api): Script {
    for (;;) {
      spyLog.push([api.self.slot, api.tick]);
      yield 1;
    }
  }),
  defineBehavior('test.params', { a: 1, b: 2, c: 3 }, function* params(_api, p): Script {
    seenParams.push(p);
    yield SLEEP_FOREVER;
  }),
  defineBehavior('test.peek', {}, function* peek(api: ScriptApi): Script {
    for (;;) {
      peeks.push({ tick: api.tick, target: api.target() });
      yield 10;
    }
  }),
  defineBehavior(
    'test.spawner',
    {},
    function* spawner(api): Script {
      yield 5;
      spawnCalls.push([api.tick, api.spawn(api.spec.childId, 12, -7)]);
      yield SLEEP_FOREVER;
    },
    true,
  ),
  defineBehavior('test.badspawn', {}, function* badSpawn(api): Script {
    spawnCalls.push([api.tick, api.spawn(1.25, 0, 0)]);
    yield SLEEP_FOREVER;
  }),
  defineBehavior('test.leader', {}, function* leader(api): Script {
    api.setMover(api.self.member > 0 ? MoverKind.Follow : MoverKind.Straight, -0.5, 0);
    for (;;) {
      yield 4;
      if (api.self.member === 0) spawnCalls.push([api.tick, api.spawn(api.spec.childId, 0, 0)]);
    }
  }),
]);

/**
 * A world on the test stage.
 *
 * @param content - Content (default {@link db}).
 * @returns The world.
 */
function world(content: ContentDb = db()): World {
  return createWorld(resolveGameConfig({ seed: 11, stage: 't' }), content, {
    behaviors: REGISTRY,
  });
}

/**
 * Steps a world with no input.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) {
    commitPlayerInput(input.players[0], 0);
    stepWorld(w, input);
  }
}

/**
 * Drains a world's events into copies.
 *
 * @param w - The world.
 * @returns The events.
 */
function drain(w: World): SimEvent[] {
  const out: SimEvent[] = [];
  w.events.drain((e) => out.push({ ...e }));
  return out;
}

/**
 * The live enemies of a world, by slot.
 *
 * @param w - The world.
 * @returns The enemies.
 */
function live(w: World): Enemy[] {
  return w.enemies.enemies.filter((e) => e.state === EnemyState.Live);
}

/**
 * Spec index of an enemy id.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @returns The index.
 */
function spec(w: World, id: string): number {
  const index = w.content.enemyIndex.get(id);
  if (index === undefined) throw new Error('no enemy ' + id);
  return index;
}

/**
 * Spawns an enemy and fails the test when it could not.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param x - World x.
 * @param y - World y.
 * @returns The enemy.
 */
function put(w: World, id: string, x: number, y: number): Enemy {
  const e = w.enemies.spawn(spec(w, id), x, y);
  if (e === null) throw new Error('could not spawn ' + id);
  return e;
}

describe('core/enemies edge — spawning', () => {
  it('spawns a stage `spawn` event 16 px past the right edge, mid-view, by default', () => {
    const w = world(db({ events: [{ x: 0, type: 'spawn', enemy: 'idle' }] }));
    run(w, 1);
    const [e] = live(w);
    expect(DEFAULT_SPAWN_SCREEN_X).toBe(PLAYFIELD_W + 16);
    expect([e.x, e.y]).toEqual([DEFAULT_SPAWN_SCREEN_X, PLAYFIELD_H / 2]);
    expect(e.formation).toBe(-1);
    expect(e.pathId).toBe(-1);
  });

  it('spawns behind the view with a negative screenX', () => {
    const w = world(db({ events: [{ x: 0, type: 'spawn', enemy: 'idle', screenX: -20, y: 70 }] }));
    run(w, 1);
    expect(live(w).map((e) => [e.x, e.y])).toEqual([[-20, 70]]);
  });

  it('keeps a flying enemy on its spawn view point from the spawn tick on (no double ride)', () => {
    const w = world(
      db({
        camera: [{ x: 0, speed: 1.5 }],
        events: [{ x: 30, type: 'spawn', enemy: 'idle', screenX: 250, y: 40 }],
      }),
    );
    let seen = false;
    for (let t = 0; t < 120; t++) {
      run(w, 1);
      for (const e of live(w)) {
        seen = true;
        expect(e.x - w.camera.x).toBeCloseTo(250, 9);
        expect(e.y - w.camera.y).toBe(40);
      }
    }
    expect(seen).toBe(true);
  });

  it('leaves ground enemies where they stand while the camera scrolls', () => {
    const w = world(db({ camera: [{ x: 0, speed: 2 }] }));
    const e = put(w, 'floor', 300, Number.NaN);
    const [x, y] = [e.x, e.y];
    run(w, 40);
    expect([e.x, e.y]).toEqual([x, y]);
    expect(w.camera.x).toBeGreaterThan(70);
  });

  it('snaps ground enemies to the view edge without terrain (floor below, ceiling above)', () => {
    const w = world(db({ tilemap: null, camera: [{ x: 0, speed: 0 }] }));
    expect(w.terrain).toBeNull();
    const floor = put(w, 'floor', 100, Number.NaN);
    const ceiling = put(w, 'ceiling', 120, Number.NaN);
    expect(floor.y).toBe(PLAYFIELD_H - 4);
    expect(ceiling.y).toBe(6);
    // A flying enemy spawned with NaN y goes mid-view.
    expect(put(w, 'idle', 140, Number.NaN).y).toBe(PLAYFIELD_H / 2);
  });

  it('snaps a ground spawn event from its given y downwards', () => {
    const w = world(db({ events: [{ x: 0, type: 'spawn', enemy: 'floor', screenX: 200, y: 20 }] }));
    run(w, 1);
    // The floor surface of this stage is at 200 − 32 = 168.
    expect(live(w).map((e) => e.y)).toEqual([168 - 4]);
  });

  it('gives a `path` mover without its own path the spawn event`s path, and keeps its own', () => {
    const w = world(
      db({
        events: [
          { x: 0, type: 'spawn', enemy: 'pathed', screenX: 300, y: 50, path: 'left' },
          { x: 0, type: 'spawn', enemy: 'ownpath', screenX: 300, y: 50, path: 'left' },
          { x: 0, type: 'spawn', enemy: 'pathed', screenX: 300, y: 50 },
        ],
      }),
    );
    run(w, 10);
    const [a, b, c] = live(w);
    const left = w.content.pathIndex.get('left');
    const down = w.content.pathIndex.get('down');
    expect([a.mover, a.m0, a.pathId]).toEqual([MoverKind.Path, left, left]);
    expect([a.x, a.y]).toEqual([290, 50]);
    expect([b.mover, b.m0, b.pathId]).toEqual([MoverKind.Path, down, left]);
    expect([b.x, b.y]).toEqual([300, 60]);
    // No path anywhere: the path mover has no curve and stands still.
    expect([c.m0, c.x, c.y]).toEqual([-1, 300, 50]);
  });

  it('takes the lowest free slot and reuses a slot only after phase 8', () => {
    const w = world();
    const a = put(w, 'idle', 100, 50);
    const b = put(w, 'idle', 110, 50);
    const c = put(w, 'idle', 120, 50);
    expect([a.slot, b.slot, c.slot]).toEqual([0, 1, 2]);
    expect(w.enemies.kill(b)).toBe(true);
    expect(w.enemies.count).toBe(3); // removed, not freed yet
    expect(put(w, 'idle', 130, 50).slot).toBe(3);
    run(w, 1);
    expect(w.enemies.count).toBe(3);
    expect(put(w, 'idle', 140, 50).slot).toBe(1);
  });

  it('spawns an enemy whose script the registry does not know without a script', () => {
    const w = world();
    const e = put(w, 'unknown', 200, 60);
    expect(e.script).toBeNull();
    run(w, 5);
    expect(e.x).toBe(195); // its spec mover still runs
  });

  it('hands behaviours their defaults overridden by the spec`s params (same keys, frozen)', () => {
    seenParams.length = 0;
    const w = world();
    put(w, 'tuned', 200, 60);
    put(w, 'tuned', 210, 60);
    run(w, 1);
    expect(seenParams).toHaveLength(2);
    expect(seenParams[0]).toEqual({ a: 1, b: 7, c: 3 });
    expect(Object.keys(seenParams[0])).toEqual(['a', 'b', 'c']);
    expect(Object.isFrozen(seenParams[0])).toBe(true);
    expect(seenParams[1]).toBe(seenParams[0]); // resolved once per spec at load
  });

  it('returns null for bad spec indices — fractional ones too (regression: TypeError)', () => {
    const w = world();
    expect(w.enemies.spawn(-1, 0, 0)).toBeNull();
    expect(w.enemies.spawn(ENEMIES.length, 0, 0)).toBeNull();
    expect(w.enemies.spawn(Number.NaN, 0, 0)).toBeNull();
    // A fractional index passed the range check and read `undefined` from the spec tables
    // (`behavior.create` of undefined threw) — a script's `api.spawn` is the likely source.
    expect(w.enemies.spawn(0.5, 0, 0)).toBeNull();
    expect(w.enemies.spawn(ENEMIES.length - 0.5, 0, 0)).toBeNull();
    expect(w.enemies.count).toBe(0);
    spawnCalls.length = 0;
    put(w, 'badspawn', 100, 60);
    run(w, 1);
    expect(spawnCalls).toEqual([[0, null]]); // through a script's api.spawn(1.25, …)
    expect(w.enemies.count).toBe(1);
  });
});

describe('core/enemies edge — formations', () => {
  it('refuses a formation with no members and clamps the interval to one tick', () => {
    const w = world();
    const idle = spec(w, 'idle');
    expect(w.enemies.startFormation(idle, 0, 5, 200, 50, -1, DropKind.Capsule, 0)).toBe(-1);
    expect(w.enemies.startFormation(idle, -3, 5, 200, 50, -1, DropKind.Capsule, 0)).toBe(-1);
    const slot = w.enemies.startFormation(idle, 3, 0, 200, 50, -1, DropKind.Capsule, 0);
    expect(slot).toBe(0); // the refused ones took no slot
    expect(w.enemies.formations.interval[slot]).toBe(1);
    const other = w.enemies.startFormation(idle, 2, -9, 200, 90, -1, DropKind.Capsule, 0);
    expect(w.enemies.formations.interval[other]).toBe(1);
    run(w, 3);
    expect(live(w).map((e) => [e.formation, e.member, e.spawnTick])).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 1],
      [1, 1, 1],
      [0, 2, 2],
    ]);
  });

  it('resolves a formation of a bad spec as escaped, without a bonus', () => {
    const w = world();
    const slot = w.enemies.startFormation(99, 3, 2, 200, 50, -1, DropKind.Capsule, 500);
    run(w, 5);
    const f = w.enemies.formations;
    expect([f.spawned[slot], f.escaped[slot], f.active[slot]]).toEqual([3, 3, 0]);
    expect(drain(w).some((e) => e.kind === SimEventKind.FormationBonus)).toBe(false);
  });

  it(`holds at most ${MAX_FORMATIONS} formations; a freed slot is reused with fresh counters`, () => {
    const w = world();
    const idle = spec(w, 'idle');
    for (let i = 0; i < MAX_FORMATIONS; i++) {
      expect(w.enemies.startFormation(idle, 2, 500, 200, 20 + i, -1, DropKind.None, 0)).toBe(i);
    }
    expect(w.enemies.startFormation(idle, 2, 500, 200, 20, -1, DropKind.None, 0)).toBe(-1);
    run(w, 1);
    expect(w.enemies.count).toBe(MAX_FORMATIONS); // every leader, members wait 500 ticks
    const f = w.enemies.formations;
    // Resolve formation 5: kill its leader (ghost while its member is pending)…
    const leader = w.enemies.enemies[f.leader[5]];
    expect(w.enemies.kill(leader)).toBe(true);
    expect(leader.flags & EnemyFlag.Ghost).toBe(EnemyFlag.Ghost);
    expect(f.tracks[5].recorded).toBeGreaterThan(0);
    run(w, 500); // …its member spawns, is killed
    const member = live(w).find((e) => e.formation === 5 && e.member === 1);
    if (member === undefined) throw new Error('no member');
    w.enemies.kill(member);
    expect(f.active[5]).toBe(0);
    expect(leader.state).toBe(EnemyState.Removed); // the ghost goes with its formation
    // The next formation takes slot 5, counters and track reset.
    expect(w.enemies.startFormation(idle, 4, 3, 100, 60, -1, DropKind.Capsule, 10)).toBe(5);
    expect([f.total[5], f.spawned[5], f.killed[5], f.escaped[5], f.leader[5]]).toEqual([
      4, 0, 0, 0, -1,
    ]);
    expect(f.tracks[5].recorded).toBe(0);
  });

  it('drops a capsule by default for a stage formation; `drop: null` still pays its bonus', () => {
    const w = world(
      db({
        events: [
          { x: 0, type: 'formation', enemy: 'idle', count: 2, interval: 1, y: 40, bonus: 250 },
          {
            x: 0,
            type: 'formation',
            enemy: 'idle',
            count: 2,
            interval: 1,
            y: 90,
            drop: null,
            bonus: 700,
          },
        ],
      }),
    );
    run(w, 2);
    drain(w);
    const f = w.enemies.formations;
    expect([f.drop[0], f.drop[1]]).toEqual([DropKind.Capsule, DropKind.None]);
    for (const e of live(w)) w.enemies.kill(e);
    const o = w.enemies.outcomes;
    expect(o.bonusPoints).toBe(950);
    expect(o.dropCount).toBe(1);
    expect([o.dropKind[0], o.dropY[0]]).toEqual([DropKind.Capsule, 40]);
    const bonus = drain(w).filter((e) => e.kind === SimEventKind.FormationBonus);
    expect(bonus.map((e) => [e.id, e.param, e.y])).toEqual([
      [0, 250, 40],
      [1, 700, 90],
    ]);
  });

  it('lists the enemy`s own drop before its formation`s', () => {
    const w = world();
    w.enemies.startFormation(spec(w, 'carrier'), 1, 1, 150, 70, -1, DropKind.Capsule, 5);
    run(w, 1);
    const [e] = live(w);
    w.enemies.damage(e, 99);
    const o = w.enemies.outcomes;
    expect(o.dropCount).toBe(2);
    expect([o.dropX[0], o.dropX[1]]).toEqual([e.x, e.x]);
    expect([o.killCount, o.killScore[0], o.bonusPoints]).toEqual([1, 300, 5]);
  });

  it('turns an escaping leader with members out into a ghost; no bonus for the formation', () => {
    const w = world();
    const slot = w.enemies.startFormation(spec(w, 'idle'), 3, 5, 200, 50, -1, DropKind.Capsule, 9);
    run(w, 11);
    const f = w.enemies.formations;
    const leader = w.enemies.enemies[f.leader[slot]];
    leader.x = w.camera.x - 60; // 60 px left of the view: escaped (> 32), not yet past the ghost margin
    run(w, 1);
    expect(leader.state).toBe(EnemyState.Live);
    expect(leader.flags & EnemyFlag.Ghost).toBe(EnemyFlag.Ghost);
    expect(leader.flags & (EnemyFlag.OnScreen | EnemyFlag.Settled)).toBe(0);
    expect(f.escaped[slot]).toBe(1);
    const recorded = f.tracks[slot].recorded;
    run(w, 3);
    expect(f.tracks[slot].recorded).toBe(recorded + 3); // still recording
    for (const e of live(w)) if (e !== leader) w.enemies.kill(e);
    expect(f.active[slot]).toBe(0);
    expect(drain(w).some((e) => e.kind === SimEventKind.FormationBonus)).toBe(false);
    expect(leader.state).toBe(EnemyState.Removed);
    run(w, 1);
    expect(w.enemies.count).toBe(0);
  });

  it('removes a ghost leader past GHOST_MARGIN; the formation still completes with its bonus', () => {
    const w = world();
    const slot = w.enemies.startFormation(
      spec(w, 'idle'),
      3,
      10,
      200,
      50,
      -1,
      DropKind.Capsule,
      40,
    );
    run(w, 1);
    const f = w.enemies.formations;
    const leader = w.enemies.enemies[f.leader[slot]];
    w.enemies.kill(leader);
    expect(leader.flags & EnemyFlag.Ghost).toBe(EnemyFlag.Ghost);
    // Exactly at the ghost margin it stays; one pixel further it goes.
    leader.x = w.camera.x - GHOST_MARGIN - leader.hw;
    run(w, 1);
    expect(leader.state).toBe(EnemyState.Live);
    leader.x = w.camera.x - GHOST_MARGIN - leader.hw - 1;
    run(w, 1);
    expect(leader.state).toBe(EnemyState.Free);
    expect(f.leader[slot]).toBe(-1);
    run(w, 25); // both members spawn (the track is frozen, they keep their last velocity)
    const members = live(w).filter((e) => e.formation === slot);
    expect(members.map((e) => e.member)).toEqual([1, 2]);
    drain(w);
    for (const m of members) w.enemies.kill(m);
    const bonus = drain(w).filter((e) => e.kind === SimEventKind.FormationBonus);
    expect(bonus.map((e) => e.param)).toEqual([40]);
    expect(f.killed[slot]).toBe(3);
  });

  it('removes a leader killed last at once (never a ghost)', () => {
    const w = world();
    const slot = w.enemies.startFormation(spec(w, 'idle'), 2, 2, 200, 50, -1, DropKind.None, 0);
    run(w, 3);
    const f = w.enemies.formations;
    const [leader, member] = live(w);
    expect(leader.member).toBe(0);
    w.enemies.kill(member);
    expect(f.active[slot]).toBe(1);
    w.enemies.kill(leader);
    expect(leader.state).toBe(EnemyState.Removed);
    expect(leader.flags & EnemyFlag.Ghost).toBe(0);
    expect([f.active[slot], f.leader[slot]]).toEqual([0, -1]);
  });

  it('keeps a ghost`s script running but lets it spawn nothing', () => {
    spawnCalls.length = 0;
    const w = world();
    const slot = w.enemies.startFormation(spec(w, 'leader'), 2, 50, 200, 60, -1, DropKind.None, 0);
    run(w, 5); // tick 4: the leader's first wake after its start spawns a child
    const leader = w.enemies.enemies[w.enemies.formations.leader[slot]];
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0][0]).toBe(4);
    expect(spawnCalls[0][1]?.specIndex).toBe(spec(w, 'idle'));
    w.enemies.kill(leader); // a ghost: its member is still pending
    run(w, 12);
    expect(leader.flags & EnemyFlag.Ghost).toBe(EnemyFlag.Ghost);
    expect(spawnCalls.map(([tick]) => tick)).toEqual([4, 8, 12, 16]); // its script still wakes…
    expect(spawnCalls.slice(1).every(([, e]) => e === null)).toBe(true); // …but spawns nothing
    expect(w.enemies.count).toBe(2); // the ghost and the one child
  });
});

describe('core/enemies edge — off-screen rules at their boundaries', () => {
  /**
   * An idle flyer that has been on screen, then placed somewhere.
   *
   * @param dx - X offset of its hurtbox edge from the view edge it leaves by (negative = out).
   * @param side - Which edge.
   * @returns Whether it is still alive after one more tick.
   */
  function survives(dx: number, side: 'left' | 'right' | 'top' | 'bottom'): boolean {
    const w = world(db({ tilemap: null }));
    const e = put(w, 'idle', 200, 100);
    run(w, 1);
    expect(e.flags & EnemyFlag.WasOnScreen).toBe(EnemyFlag.WasOnScreen);
    const [hw, hh] = [e.hw, e.hh];
    if (side === 'left') e.x = w.camera.x + dx - hw;
    if (side === 'right') e.x = w.camera.x + PLAYFIELD_W - dx + hw;
    if (side === 'top') e.y = w.camera.y + dx - hh;
    if (side === 'bottom') e.y = w.camera.y + PLAYFIELD_H - dx + hh;
    run(w, 1);
    return e.state === EnemyState.Live;
  }

  it(`escapes strictly beyond ${DESPAWN_MARGIN} px, on every side`, () => {
    for (const side of ['left', 'right', 'top', 'bottom'] as const) {
      expect(survives(-DESPAWN_MARGIN, side), side).toBe(true);
      expect(survives(-DESPAWN_MARGIN - 0.5, side), side).toBe(false);
    }
  });

  it('counts a hurtbox touching the view edge as on screen', () => {
    const w = world(db({ tilemap: null }));
    const e = put(w, 'idle', PLAYFIELD_W + 4, 100); // left edge of the box on the right edge
    run(w, 1);
    expect(e.flags & EnemyFlag.OnScreen).toBe(EnemyFlag.OnScreen);
    const f = put(w, 'idle', PLAYFIELD_W + 4.5, 140);
    run(w, 1);
    expect(f.flags & EnemyFlag.OnScreen).toBe(0);
    expect(f.flags & EnemyFlag.WasOnScreen).toBe(0);
  });

  it(`removes a never-seen enemy strictly beyond ${UNSEEN_MARGIN} px`, () => {
    const w = world(db({ tilemap: null }));
    const kept = put(w, 'idle', PLAYFIELD_W + UNSEEN_MARGIN + 4, 100);
    const gone = put(w, 'idle', PLAYFIELD_W + UNSEEN_MARGIN + 4.5, 120);
    const above = put(w, 'idle', 100, -UNSEEN_MARGIN - 4.5);
    run(w, 1);
    expect(kept.state).toBe(EnemyState.Live);
    expect(gone.state).toBe(EnemyState.Free);
    expect(above.state).toBe(EnemyState.Free);
    expect(w.enemies.outcomes.killCount).toBe(0); // leaving is not a kill
    expect(drain(w).filter((e) => e.kind === SimEventKind.Particles)).toEqual([]);
    run(w, UNSEEN_TICKS - 2);
    expect(kept.state).toBe(EnemyState.Live);
    run(w, 1);
    expect(kept.state).toBe(EnemyState.Free); // age 600
  });

  it('never applies the unseen timer to an enemy that was on screen', () => {
    const w = world(db({ tilemap: null }));
    const e = put(w, 'idle', 200, 100);
    run(w, 1);
    e.x = PLAYFIELD_W + 20; // parked just outside, inside the despawn margin
    run(w, UNSEEN_TICKS + 50);
    expect(e.state).toBe(EnemyState.Live);
    expect(e.flags & EnemyFlag.OnScreen).toBe(0);
  });

  it('settles on the first on-screen tick with settleTicks 0, and stays settled off screen', () => {
    const w = world();
    const e = put(w, 'floor', 200, Number.NaN);
    run(w, 1);
    expect(e.firstSeenTick).toBe(0);
    expect(e.flags & EnemyFlag.Settled).toBe(EnemyFlag.Settled);
    e.x = PLAYFIELD_W + 10;
    run(w, 1);
    expect(e.flags & (EnemyFlag.Settled | EnemyFlag.OnScreen)).toBe(EnemyFlag.Settled);
  });
});

describe('core/enemies edge — scripts', () => {
  it('sees no target during the fly-in, then player 1, then the nearer of two players', () => {
    peeks.length = 0;
    const w = world();
    const e = put(w, 'peek', 300, 100);
    run(w, 1);
    expect(peeks).toEqual([{ tick: 0, target: null }]); // the ship is still flying in
    run(w, 50);
    expect(peeks.map((p) => p.tick)).toEqual([0, 10, 20, 30, 40, 50]);
    expect(peeks[5].target).toBe(w.players[0]);
    const [p1, p2] = w.players;
    p2.active = true;
    p2.state = 'alive';
    p2.x = e.x - 10;
    p2.y = e.y;
    p1.x = e.x - 100;
    run(w, 10);
    expect(peeks[6].target).toBe(p2);
  });

  it('starts a child spawned into a higher slot on the next tick, at the given offset', () => {
    spyLog.length = 0;
    spawnCalls.length = 0;
    const w = world();
    const parent = put(w, 'spawner', 200, 100);
    expect(parent.slot).toBe(0);
    run(w, 7); // ticks 0 … 6
    expect(spawnCalls).toHaveLength(1);
    const [tick, child] = spawnCalls[0];
    if (child === null) throw new Error('no child');
    expect(tick).toBe(5);
    expect(child.slot).toBe(1);
    expect(child.spawnTick).toBe(5);
    expect([child.x, child.y]).toEqual([212, 93]); // spawned at (+12, −7), then idle
    expect(spyLog).toEqual([[1, 6]]); // not resumed in the pass that spawned it
  });

  it('snaps only a NaN y: a ground enemy spawned at an explicit y stays there', () => {
    const w = world();
    expect(put(w, 'floor', 200, 60).y).toBe(60);
    expect(put(w, 'floor', 220, Number.NaN).y).toBe(168 - 4);
  });
});

describe('core/enemies edge — damage and kills', () => {
  it('treats 0 damage as a hit (flash + sound) that kills nothing', () => {
    const w = world();
    const e = put(w, 'idle', 200, 60);
    drain(w);
    expect(w.enemies.damage(e, 0)).toBe(false);
    expect([e.hp, e.flashTicks]).toEqual([3, HIT_FLASH_TICKS]);
    expect(drain(w).map((ev) => ev.id)).toEqual([SFX_CUES.EnemyHit]);
  });

  it('kills on exactly the remaining hp and on overkill, once', () => {
    const w = world();
    const a = put(w, 'idle', 200, 60);
    const b = put(w, 'idle', 220, 60);
    expect(w.enemies.damage(a, 2)).toBe(false);
    expect(w.enemies.damage(a, 1)).toBe(true);
    expect(w.enemies.damage(b, 1000)).toBe(true);
    expect(w.enemies.kill(b)).toBe(false);
    expect(w.enemies.damage(b, 1)).toBe(false);
    expect(w.enemies.outcomes.killCount).toBe(2);
    expect(w.enemies.kill(w.enemies.enemies[40])).toBe(false); // a free slot
  });

  it('shows the flash for HIT_FLASH_TICKS ticks counted from the hit', () => {
    const w = world();
    const e = put(w, 'idle', 200, 60);
    run(w, 1);
    w.enemies.damage(e, 1);
    const flashes: boolean[] = [];
    for (let t = 0; t < HIT_FLASH_TICKS + 2; t++) {
      run(w, 1);
      flashes.push((w.enemies.airBatch.flags[0] & SpriteFlag.Flash) !== 0);
    }
    // Hit between ticks: the next HIT_FLASH_TICKS − 1 frames flash (a phase-7 hit shows one more).
    expect(flashes).toEqual([true, true, true, false, false, false]);
    expect(e.flashTicks).toBe(0);
  });
});

describe('core/enemies edge — contact', () => {
  /**
   * Where contact starts: an idle enemy at an offset from the (still) ship.
   *
   * @param dx - X offset of the enemy centre.
   * @param dy - Y offset.
   * @returns Whether the ship took a contact hit on the next tick.
   */
  function touches(dx: number, dy: number): boolean {
    const w = world();
    run(w, 60);
    const ship = w.players[0];
    ship.x = 150; // whole pixels: the offsets below are exact
    ship.y = 100;
    const hits = ship.hits;
    put(w, 'idle', ship.x + dx, ship.y + dy);
    run(w, 1);
    return ship.hits > hits;
  }

  it('is a closed circle-vs-box test (hurt radius 1.5 px, hurtbox 4×4)', () => {
    const r = 1.5;
    expect(touches(4 + r, 0)).toBe(true);
    expect(touches(-(4 + r), 0)).toBe(true);
    expect(touches(0, 4 + r)).toBe(true);
    expect(touches(4 + r + 0.01, 0)).toBe(false);
    expect(touches(0, -(4 + r + 0.01))).toBe(false);
    // Corners: inside the rounded corner (0.8² + 1.1² < 1.5²), outside it (1² + 1.2² > 1.5²),
    // though both offsets are inside the circle's bounding square (the grid's broad phase).
    expect(touches(4.8, 5.1)).toBe(true);
    expect(touches(-4.8, -5.1)).toBe(true);
    expect(touches(5.0, 5.2)).toBe(false);
    expect(touches(-5.0, 5.2)).toBe(false);
  });

  it('never hits a ship during its fly-in, from a ghost, or in god mode', () => {
    const w = world();
    const ship = w.players[0];
    put(w, 'idle', ship.x, ship.y);
    run(w, 5);
    expect(ship.state).not.toBe('alive');
    expect(ship.hits).toBe(0);
    const slot = w.enemies.startFormation(spec(w, 'idle'), 2, 400, 0, 0, -1, DropKind.None, 0);
    run(w, 60);
    for (const e of live(w)) if (e.formation < 0) w.enemies.kill(e);
    const leader = w.enemies.enemies[w.enemies.formations.leader[slot]];
    w.enemies.kill(leader); // a ghost now (its member is pending)
    leader.x = ship.x;
    leader.y = ship.y;
    leader.vx = 0;
    const hits = ship.hits;
    run(w, 1);
    expect(leader.flags & EnemyFlag.Ghost).toBe(EnemyFlag.Ghost);
    expect(ship.hits).toBe(hits);
    put(w, 'idle', ship.x, ship.y);
    w.debugFlags.godMode = true;
    run(w, 3);
    expect(ship.hits).toBe(hits);
    w.debugFlags.godMode = false;
    run(w, 1);
    expect(ship.hits).toBe(hits + 1);
    expect(ship.hitCause).toBe(PlayerHitCause.Contact);
  });
});

describe('core/enemies edge — sprites, clear and hash', () => {
  it('draws nothing for an enemy without a sprite and splits ground from air', () => {
    const w = world();
    const air = put(w, 'idle', 200, 60);
    put(w, 'floor', 220, Number.NaN);
    const hidden = put(w, 'idle', 240, 60);
    hidden.spriteId = -1;
    run(w, 1);
    expect(w.enemies.airBatch.count).toBe(1);
    expect(w.enemies.airBatch.x[0]).toBe(air.x);
    expect(w.enemies.groundBatch.count).toBe(1);
  });

  it('animates by age: frame floor(age / ticks) mod frames', () => {
    const w = world();
    put(w, 'anim', 200, 60);
    const frames: number[] = [];
    for (let t = 0; t < 14; t++) {
      run(w, 1);
      frames.push(w.enemies.airBatch.frame[0]);
    }
    // Ages 1 … 14, 3 ticks per frame, 4 frames.
    expect(frames).toEqual([0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0, 0, 0]);
  });

  it('clears everything: outcomes, batches, formations and slot order', () => {
    const w = world();
    const e = put(w, 'carrier', 200, 60);
    put(w, 'idle', 210, 60);
    w.enemies.startFormation(spec(w, 'idle'), 5, 10, 300, 50, -1, DropKind.Capsule, 0);
    run(w, 11);
    w.enemies.kill(e);
    expect(w.enemies.outcomes.dropCount).toBe(1);
    w.enemies.clear();
    const o = w.enemies.outcomes;
    expect([o.killCount, o.dropCount, o.bonusPoints]).toEqual([0, 0, 0]);
    expect([w.enemies.count, w.enemies.airBatch.count, w.enemies.groundBatch.count]).toEqual([
      0, 0, 0,
    ]);
    expect(Array.from(w.enemies.formations.active).every((a) => a === 0)).toBe(true);
    expect(Array.from(w.enemies.formations.leader).every((l) => l === -1)).toBe(true);
    expect(w.enemies.formations.tracks.every((t) => t.recorded === 0)).toBe(true);
    expect(w.enemies.enemies.every((x) => x.state === EnemyState.Free && x.script === null)).toBe(
      true,
    );
    expect(put(w, 'idle', 100, 60).slot).toBe(0);
  });

  it('fills all 64 slots from a formation and counts the rest as escaped', () => {
    const w = world(db({ tilemap: null }));
    const slot = w.enemies.startFormation(
      spec(w, 'idle'),
      70,
      1,
      200,
      100,
      -1,
      DropKind.Capsule,
      1,
    );
    run(w, 70);
    const f = w.enemies.formations;
    expect(w.enemies.count).toBe(MAX_ENEMIES);
    expect([f.spawned[slot], f.escaped[slot]]).toEqual([70, 70 - MAX_ENEMIES]);
    for (const e of live(w)) w.enemies.kill(e);
    expect(f.active[slot]).toBe(0);
    expect(w.enemies.outcomes.bonusPoints).toBe(0);
  });

  it('hashes the formation table', () => {
    const a = world();
    const b = world();
    expect(hashWorld(a)).toBe(hashWorld(b));
    a.enemies.startFormation(spec(a, 'idle'), 3, 50, 200, 50, -1, DropKind.Capsule, 0);
    const started = hashWorld(a);
    expect(started).not.toBe(hashWorld(b));
    a.enemies.formations.bonus[0] = 1;
    expect(hashWorld(a)).not.toBe(started);
    b.enemies.startFormation(spec(b, 'idle'), 3, 50, 200, 50, -1, DropKind.Capsule, 1);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });
});

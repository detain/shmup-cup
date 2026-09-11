/**
 * `core/enemies` inside a World (plan M1-08): stage spawns and the formation spawner's spacing,
 * the formation table (bonus + capsule only when every member was killed), follow delay and the
 * ghost leader, ground snapping, the off-screen / settle / despawn rules, the script runner
 * (never resumed while asleep — spy behaviour), script spawns (hatch), damage / flash / deaths,
 * enemy–player contact, the sprite mirror, checkpoint clears, pool exhaustion, determinism and
 * the allocation guard over a 64-enemy tick loop.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BEHAVIOR_DEFS,
  createBehaviorRegistry,
  defineBehavior,
  type BehaviorRegistry,
} from '../../src/behaviors/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import {
  DEFAULT_SPAWN_SCREEN_X,
  DESPAWN_MARGIN,
  DropKind,
  EnemyFlag,
  EnemyState,
  HIT_FLASH_TICKS,
  MAX_ENEMIES,
  UNSEEN_TICKS,
  moduleInfo,
  type Enemy,
} from '../../src/enemies/index.js';
import { FX_CUES, SFX_CUES, SimEventKind, type SimEvent } from '../../src/events/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { MoverKind, SLEEP_FOREVER, type Script } from '../../src/patterns/index.js';
import { PlayerHitCause } from '../../src/player/index.js';
import { LayerId, SpriteFlag } from '../../src/presentation/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

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
    hp: 2,
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
  enemy('carrier', { drop: 'capsule', explosion: 'medium', score: 300 }),
  enemy('fan', { script: 'fan.loop', hp: 1, params: { speed: 1.5 } }),
  enemy('floor', { ground: 'floor', hurtbox: { hw: 5, hh: 4 }, settleTicks: 10 }),
  enemy('ceiling', { ground: 'ceiling', hurtbox: { hw: 5, hh: 4 } }),
  enemy('hatch', {
    script: 'hatch.spawner',
    ground: 'floor',
    child: 'left',
    settleTicks: 0,
    params: { interval: 20, max: 3 },
    hp: 50,
  }),
  enemy('spy', { script: 'test.spy' }),
  enemy('anim', { anim: { frames: 3, ticks: 4 } }),
  enemy('sine', { script: 'test.sine' }),
  enemy('homer', { script: 'test.homer' }),
  enemy('crawler', { script: 'test.crawl', ground: 'floor', hurtbox: { hw: 4, hh: 4 } }),
  enemy('leader', { script: 'test.leader' }),
];

/**
 * Test content: the KESTREL, the shipped tileset, a path, the test enemies and a stage.
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
            id: 'loop',
            points: [
              { x: 0, y: 0 },
              { x: -120, y: 0 },
              { x: -180, y: -40 },
              { x: -140, y: -80 },
              { x: -100, y: -40 },
              { x: -160, y: 0 },
              { x: -420, y: 0 },
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

/** Log of the spy behaviour: `[slot, tick]` per resume. */
const spyLog: Array<[number, number]> = [];

/** Test behaviours plus the roster. */
const REGISTRY: BehaviorRegistry = createBehaviorRegistry([
  ...DEFAULT_BEHAVIOR_DEFS,
  defineBehavior('test.idle', {}, function* idle(): Script {
    yield SLEEP_FOREVER;
  }),
  defineBehavior('test.spy', { every: 25 }, function* spy(api, p): Script {
    for (;;) {
      spyLog.push([api.self.slot, api.tick]);
      yield p.every;
    }
  }),
  defineBehavior('test.sine', {}, function* sine(api): Script {
    api.setMover(MoverKind.Sine, 0, 20, 60, api.self.slot * 16);
    yield SLEEP_FOREVER;
  }),
  defineBehavior('test.homer', {}, function* homer(api): Script {
    api.setMover(MoverKind.Homing, 1, 12);
    yield SLEEP_FOREVER;
  }),
  defineBehavior('test.crawl', {}, function* crawl(api): Script {
    api.setMover(MoverKind.GroundCrawl, api.self.slot % 2 === 0 ? 1 : -1);
    yield SLEEP_FOREVER;
  }),
  defineBehavior('test.leader', {}, function* leader(api): Script {
    api.setMover(
      api.self.member > 0 ? MoverKind.Follow : MoverKind.Sine,
      0,
      30,
      90,
      api.self.member * 8,
    );
    yield SLEEP_FOREVER;
  }),
]);

/**
 * A world on the test stage.
 *
 * @param content - Content (default {@link db}).
 * @param seed - Seed.
 * @returns The world.
 */
function world(content: ContentDb = db(), seed = 3): World {
  return createWorld(resolveGameConfig({ seed, stage: 't' }), content, { behaviors: REGISTRY });
}

/**
 * Steps a world.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 * @param held - Player 1's held actions.
 */
function run(w: World, ticks: number, held = 0): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) {
    commitPlayerInput(input.players[0], held);
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
 * The live (non-free) enemies of a world, by slot.
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

describe('core/enemies module', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('enemies');
    expect(moduleInfo.status).toBe('partial');
    expect(MAX_ENEMIES).toBe(64);
  });
});

describe('core/enemies spawning', () => {
  it('spawns the enemy of a stage `spawn` event at the view position, once', () => {
    const content = db({ events: [{ x: 0, type: 'spawn', enemy: 'left', y: 50 }] });
    const w = world(content);
    run(w, 1);
    const [e] = live(w);
    expect(live(w)).toHaveLength(1);
    expect(e.specIndex).toBe(spec(w, 'left'));
    // Spawned in phase 3 at screen x 400, moved -2 in phase 5 of the same tick.
    expect([e.x, e.y, e.age, e.spawnTick]).toEqual([DEFAULT_SPAWN_SCREEN_X - 2, 50, 1, 0]);
    run(w, 5);
    expect(live(w)).toHaveLength(1);
  });

  it('spawns formation members one every `interval` ticks at the same view point', () => {
    const content = db({
      camera: [{ x: 0, speed: 1 }],
      events: [
        { x: 10, type: 'formation', enemy: 'idle', count: 4, interval: 7, y: 30, screenX: 300 },
      ],
    });
    const w = world(content);
    const spawnTicks: number[] = [];
    let seen = 0;
    for (let t = 0; t < 60; t++) {
      run(w, 1);
      const members = live(w);
      if (members.length > seen) {
        const newest = members.reduce((a, b) => (a.member > b.member ? a : b));
        spawnTicks.push(newest.spawnTick);
        // Idle flyers ride the camera: every member sits on the same view point.
        for (const m of members) {
          expect(m.x - w.camera.x).toBeCloseTo(300, 9);
          expect(m.y - w.camera.y).toBe(30);
        }
        seen = members.length;
      }
    }
    const first = spawnTicks[0];
    expect(spawnTicks).toEqual([first, first + 7, first + 14, first + 21]);
    expect(live(w).map((e) => e.member)).toEqual([0, 1, 2, 3]);
    const f = w.enemies.formations;
    const slot = live(w)[0].formation;
    expect([f.total[slot], f.spawned[slot], f.killed[slot], f.escaped[slot]]).toEqual([4, 4, 0, 0]);
  });

  it('snaps ground enemies onto the floor / under the ceiling', () => {
    const content = db({
      tilemap: {
        tileSize: 8,
        tileset: 'terrain-a',
        rowsTall: 25,
        generator: {
          type: 'heightfield',
          segments: [
            {
              from: 0,
              to: 3384,
              floor: { base: 32, amp: 0, period: 64, seed: 1 },
              ceiling: { base: 24, amp: 0, period: 64, seed: 2 },
            },
          ],
        },
      },
    });
    const w = world(content);
    const floor = w.enemies.spawn(spec(w, 'floor'), 200, Number.NaN);
    const ceiling = w.enemies.spawn(spec(w, 'ceiling'), 220, Number.NaN);
    // Floor surface at 200 − 32 = 168 → centre 164; ceiling surface at 24 → centre 28.
    expect(floor?.y).toBe(164);
    expect(ceiling?.y).toBe(28);
    run(w, 30);
    expect(floor?.y).toBe(164); // world-anchored: no camera ride, no mover
    const batch = w.enemies.groundBatch;
    expect(batch.count).toBe(2);
    expect(batch.layer).toBe(LayerId.GroundEnemies);
    expect(batch.flags[1] & SpriteFlag.FlipY).toBe(SpriteFlag.FlipY);
    expect(batch.flags[0] & SpriteFlag.FlipY).toBe(0);
  });

  it('drops spawns quietly when all 64 slots are taken (a formation counts it as escaped)', () => {
    const w = world();
    const idle = spec(w, 'idle');
    for (let i = 0; i < MAX_ENEMIES; i++) {
      expect(w.enemies.spawn(idle, 100 + i, 50)).not.toBeNull();
    }
    expect(w.enemies.spawn(idle, 10, 10)).toBeNull();
    expect(w.enemies.spawn(-1, 10, 10)).toBeNull();
    const slot = w.enemies.startFormation(idle, 2, 1, 200, 50, -1, DropKind.Capsule, 100);
    run(w, 3);
    expect(w.enemies.count).toBe(MAX_ENEMIES);
    expect(w.enemies.formations.escaped[slot]).toBe(2);
    expect(w.enemies.formations.active[slot]).toBe(0); // resolved without a bonus
    expect(drain(w).some((e) => e.kind === SimEventKind.FormationBonus)).toBe(false);
  });
});

describe('core/enemies formations', () => {
  /**
   * A world with a started formation of `idle` flyers, all spawned.
   *
   * @param count - Members.
   * @param bonus - Bonus points.
   * @returns The world and the formation slot.
   */
  function formation(count: number, bonus = 500): { w: World; slot: number } {
    const w = world();
    const slot = w.enemies.startFormation(
      spec(w, 'idle'),
      count,
      3,
      200,
      80,
      -1,
      DropKind.Capsule,
      bonus,
    );
    run(w, count * 3);
    expect(live(w)).toHaveLength(count);
    drain(w);
    return { w, slot };
  }

  it('awards the bonus and drops the capsule at the last kill — only once every member died', () => {
    const { w, slot } = formation(3);
    const [a, b, c] = live(w);
    w.enemies.damage(a, 5);
    w.enemies.damage(b, 5);
    let events = drain(w);
    const early = events.filter((e) => e.kind === SimEventKind.Particles).length;
    expect(events.some((e) => e.kind === SimEventKind.FormationBonus)).toBe(false);
    expect(w.enemies.outcomes.dropCount).toBe(0);
    c.x = 250;
    w.enemies.damage(c, 1);
    expect(w.enemies.outcomes.dropCount).toBe(0); // survived: flash, no death
    expect(c.flashTicks).toBe(HIT_FLASH_TICKS);
    w.enemies.damage(c, 1);
    events = drain(w);
    const bonus = events.filter((e) => e.kind === SimEventKind.FormationBonus);
    expect(bonus).toEqual([
      { kind: SimEventKind.FormationBonus, id: slot, x: 250, y: 80, param: 500 },
    ]);
    const o = w.enemies.outcomes;
    expect(o.killCount).toBe(3);
    expect(o.bonusPoints).toBe(500);
    expect([o.dropCount, o.dropKind[0], o.dropX[0], o.dropY[0]]).toEqual([
      1,
      DropKind.Capsule,
      250,
      80,
    ]);
    expect(w.enemies.formations.active[slot]).toBe(0);
    const particles = events.filter((e) => e.kind === SimEventKind.Particles);
    expect(early + particles.length).toBe(3);
    expect(particles[0]).toMatchObject({ id: FX_CUES.ExplosionSmall, x: 250, y: 80 });
  });

  it('gives nothing when a member escaped', () => {
    const { w, slot } = formation(3);
    const [a, b, c] = live(w);
    w.enemies.damage(a, 5);
    c.x = w.camera.x - 100; // far outside the view: escapes in the next movement phase
    run(w, 1);
    expect(c.state).toBe(EnemyState.Free);
    expect(w.enemies.formations.escaped[slot]).toBe(1);
    w.enemies.damage(b, 5);
    expect(drain(w).some((e) => e.kind === SimEventKind.FormationBonus)).toBe(false);
    expect(w.enemies.outcomes.dropCount).toBe(0);
    expect(w.enemies.formations.active[slot]).toBe(0);
  });

  it('waits for members still to spawn before awarding the bonus', () => {
    const w = world();
    const slot = w.enemies.startFormation(spec(w, 'idle'), 3, 10, 200, 80, -1, DropKind.None, 0);
    run(w, 1);
    const [first] = live(w);
    w.enemies.damage(first, 9);
    run(w, 25);
    for (const e of live(w)) w.enemies.damage(e, 9);
    expect(w.enemies.formations.killed[slot]).toBe(3);
    const events = drain(w);
    expect(events.filter((e) => e.kind === SimEventKind.FormationBonus)).toHaveLength(1);
    expect(w.enemies.outcomes.dropCount).toBe(0); // `drop: null` formation
  });

  it('lets followers replay the leader`s track with the interval as delay (fan.loop)', () => {
    const content = db({
      camera: [{ x: 0, speed: 0.5 }],
      events: [
        {
          x: 0,
          type: 'formation',
          enemy: 'fan',
          count: 4,
          interval: 12,
          y: 120,
          screenX: 380,
          path: 'loop',
        },
      ],
    });
    const w = world(content);
    // Leader positions relative to the camera, by leader age.
    const leaderAt: Array<[number, number]> = [];
    for (let t = 0; t < 150; t++) {
      run(w, 1);
      const members = live(w);
      const leader = members.find((e) => e.member === 0);
      if (leader !== undefined)
        leaderAt[leader.age] = [leader.x - w.camera.x, leader.y - w.camera.y];
      for (const m of members) {
        if (m.member <= 0) continue;
        const want = leaderAt[m.age];
        expect(m.mover).toBe(MoverKind.Follow);
        expect(m.x - w.camera.x).toBeCloseTo(want[0], 9);
        expect(m.y - w.camera.y).toBeCloseTo(want[1], 9);
      }
    }
    expect(live(w)).toHaveLength(4);
  });

  it('keeps a killed leader as an invisible ghost that goes on recording for its followers', () => {
    const content = db({
      events: [
        { x: 0, type: 'formation', enemy: 'leader', count: 3, interval: 10, y: 100, screenX: 250 },
      ],
    });
    const reference = world(content);
    const w = world(content);
    run(reference, 40);
    run(w, 40);
    const leader = live(w).find((e) => e.member === 0);
    if (leader === undefined) throw new Error('no leader');
    expect(w.enemies.kill(leader)).toBe(true);
    expect(leader.state).toBe(EnemyState.Live);
    expect(leader.flags & EnemyFlag.Ghost).toBe(EnemyFlag.Ghost);
    expect(w.enemies.damage(leader, 1)).toBe(false);
    expect(w.enemies.kill(leader)).toBe(false);
    run(w, 1);
    run(reference, 1);
    expect(w.enemies.airBatch.count).toBe(2); // the ghost is not drawn
    for (let t = 0; t < 100; t++) {
      run(w, 1);
      run(reference, 1);
      for (const m of live(w).filter((e) => e.member > 0)) {
        const twin = reference.enemies.enemies[m.slot];
        expect([m.x, m.y]).toEqual([twin.x, twin.y]);
      }
    }
    // Killing the followers completes the formation (with bonus) and frees the ghost.
    for (const m of live(w).filter((e) => e.member > 0)) w.enemies.kill(m);
    expect(drain(w).some((e) => e.kind === SimEventKind.FormationBonus)).toBe(true);
    run(w, 1);
    expect(live(w)).toHaveLength(0);
    expect(w.enemies.count).toBe(0);
  });
});

describe('core/enemies off-screen rules', () => {
  it('may fire only on screen and `settleTicks` after its first on-screen tick', () => {
    const w = world();
    const floor = w.enemies.spawn(spec(w, 'floor'), 450, Number.NaN);
    if (floor === null) throw new Error('no enemy');
    run(w, 1);
    expect(floor.flags & EnemyFlag.OnScreen).toBe(0);
    expect(floor.flags & EnemyFlag.WasOnScreen).toBe(0);
    // Bring it into view (the camera is static in this stage).
    floor.x = 380;
    run(w, 1);
    const seen = floor.firstSeenTick;
    expect(seen).toBe(w.tick - 1);
    expect(floor.flags & EnemyFlag.OnScreen).toBe(EnemyFlag.OnScreen);
    expect(floor.flags & EnemyFlag.Settled).toBe(0);
    run(w, 9);
    expect(w.tick - 1 - seen).toBe(9);
    expect(floor.flags & EnemyFlag.Settled).toBe(0);
    run(w, 1);
    expect(w.tick - 1 - seen).toBe(10); // settleTicks 10
    expect(floor.flags & EnemyFlag.Settled).toBe(EnemyFlag.Settled);
    // Leaving the view clears OnScreen (canFire needs both).
    floor.x = 400;
    run(w, 1);
    expect(floor.flags & EnemyFlag.OnScreen).toBe(0);
    expect(floor.state).toBe(EnemyState.Live); // 400 − 5 = 395 < 384 + 32
  });

  it('removes an enemy that was on screen once it is 32 px outside the view — escaped', () => {
    const w = world();
    const e = w.enemies.spawn(spec(w, 'left'), 20, 60);
    if (e === null) throw new Error('no enemy');
    let removedAt = -1;
    for (let t = 0; t < 60 && removedAt < 0; t++) {
      run(w, 1);
      if (e.state !== EnemyState.Live) removedAt = t;
    }
    // x after t+1 ticks: 20 − 2(t+1); gone when x + hw < −32 → x < −36 → t+1 > 28.
    expect(removedAt).toBe(28);
    expect(e.state).toBe(EnemyState.Free); // freed in phase 8 of that tick
    expect(DESPAWN_MARGIN).toBe(32);
  });

  it('removes an enemy that never shows up after UNSEEN_TICKS', () => {
    const w = world();
    const e = w.enemies.spawn(spec(w, 'idle'), 450, 60); // parked off the right edge
    if (e === null) throw new Error('no enemy');
    run(w, UNSEEN_TICKS - 1);
    expect(e.state).toBe(EnemyState.Live);
    run(w, 1);
    expect(e.state).toBe(EnemyState.Free);
  });
});

describe('core/enemies scripts', () => {
  it('never resumes a sleeping script (spy): one resume per 25 ticks per enemy', () => {
    spyLog.length = 0;
    const w = world();
    const a = w.enemies.spawn(spec(w, 'spy'), 200, 50);
    run(w, 10);
    const b = w.enemies.spawn(spec(w, 'spy'), 220, 50);
    run(w, 90);
    const first = spyLog.filter(([slot]) => slot === a?.slot).map(([, tick]) => tick);
    const second = spyLog.filter(([slot]) => slot === b?.slot).map(([, tick]) => tick);
    expect(first).toEqual([0, 25, 50, 75]);
    expect(second).toEqual([10, 35, 60, 85]);
    expect(a?.wakeTick).toBe(100);
  });

  it('starts the scripts of enemies spawned by scripts on the next tick (hatch.spawner)', () => {
    const w = world();
    const hatch = w.enemies.spawn(spec(w, 'hatch'), 300, Number.NaN);
    if (hatch === null) throw new Error('no hatch');
    const released: number[] = [];
    for (let t = 0; t < 300; t++) {
      run(w, 1);
      for (const e of live(w)) {
        if (e.specIndex !== spec(w, 'left') || e.age !== 1) continue;
        released.push(e.spawnTick);
        // Spawned in phase 4: moved this tick already, its script starts next tick.
        expect(e.wakeTick).toBe(e.spawnTick + 1);
        expect(e.formation).toBe(-1);
        expect(e.y).toBe(hatch.y - hatch.hh);
      }
    }
    // Released every 20 ticks while it may fire (on screen, settled), at most 3 in all.
    expect(released).toEqual([20, 40, 60]);
  });

  it('gives scripts the nearest living player as target and the gameplay RNG', () => {
    const w = world();
    run(w, 60); // the fly-in is over
    const e = w.enemies.spawn(spec(w, 'idle'), 300, 60);
    expect(e).not.toBeNull();
    const seen: unknown[] = [];
    const registry = createBehaviorRegistry([
      defineBehavior('test.idle', {}, function* peek(api): Script {
        seen.push(api.target(), api.rng, api.onScreen(), api.canFire(), api.spec.id);
        yield SLEEP_FOREVER;
      }),
    ]);
    const w2 = createWorld(resolveGameConfig({ seed: 3, stage: 't' }), db(), {
      behaviors: registry,
    });
    run(w2, 60);
    w2.enemies.spawn(spec(w2, 'idle'), 300, 60);
    run(w2, 1);
    expect(seen[0]).toBe(w2.players[0]);
    expect(seen[1]).toBe(w2.rng.gameplay);
    expect(seen.slice(2)).toEqual([false, false, 'idle']);
  });
});

describe('core/enemies damage, contact and the view', () => {
  it('flashes, dies at 0 hp with explosion events and records the kill and its drop', () => {
    const w = world();
    const e = w.enemies.spawn(spec(w, 'carrier'), 200, 50);
    if (e === null) throw new Error('no enemy');
    drain(w);
    expect(w.enemies.damage(e, 1)).toBe(false);
    expect(drain(w)).toEqual([
      { kind: SimEventKind.Sfx, id: SFX_CUES.EnemyHit, x: 200, y: 50, param: 0 },
    ]);
    run(w, 1);
    expect(w.enemies.airBatch.flags[0] & SpriteFlag.Flash).toBe(SpriteFlag.Flash);
    run(w, HIT_FLASH_TICKS);
    expect(w.enemies.airBatch.flags[0] & SpriteFlag.Flash).toBe(0);
    expect(w.enemies.damage(e, 1)).toBe(true);
    const events = drain(w);
    expect(events.map((ev) => [ev.kind, ev.id])).toEqual([
      [SimEventKind.Sfx, SFX_CUES.EnemyExplodeMedium],
      [SimEventKind.Particles, FX_CUES.ExplosionMedium],
    ]);
    const o = w.enemies.outcomes;
    expect([o.killCount, o.killSpec[0], o.killScore[0], o.dropCount, o.dropKind[0]]).toEqual([
      1,
      spec(w, 'carrier'),
      300,
      1,
      DropKind.Capsule,
    ]);
    expect(e.state).toBe(EnemyState.Removed);
    expect(w.enemies.damage(e, 1)).toBe(false);
    run(w, 1);
    expect(e.state).toBe(EnemyState.Free);
    expect(w.enemies.outcomes.killCount).toBe(0); // reset at the next tick's phase 3
  });

  it('ignores damage while invulnerable', () => {
    const w = world();
    const e = w.enemies.spawn(spec(w, 'idle'), 200, 50);
    if (e === null) throw new Error('no enemy');
    e.flags |= EnemyFlag.Invulnerable;
    expect(w.enemies.damage(e, 99)).toBe(false);
    expect(e.hp).toBe(2);
  });

  it('reports contact with the ship as playerHit(Contact), once per tick', () => {
    const w = world();
    run(w, 60);
    const ship = w.players[0];
    expect(ship.state).toBe('alive');
    w.enemies.spawn(spec(w, 'idle'), ship.x + 3, ship.y);
    w.enemies.spawn(spec(w, 'idle'), ship.x - 3, ship.y);
    const hits = ship.hits;
    run(w, 1);
    expect(ship.hits).toBe(hits + 1);
    expect(ship.hitCause).toBe(PlayerHitCause.Contact);
    w.debugFlags.godMode = true;
    run(w, 5);
    expect(ship.hits).toBe(hits + 1);
  });

  it('mirrors flying enemies into the air batch: animation, facing, hidden ghosts', () => {
    const w = world();
    const anim = w.enemies.spawn(spec(w, 'anim'), 200, 40);
    const left = w.enemies.spawn(spec(w, 'left'), 300, 60);
    if (anim === null || left === null) throw new Error('no enemy');
    run(w, 9);
    const batch = w.enemies.airBatch;
    expect(batch.layer).toBe(LayerId.AirEnemies);
    expect(batch.count).toBe(2);
    expect(batch.frame[0]).toBe(Math.floor(9 / 4) % 3);
    expect(batch.flags[1] & SpriteFlag.FlipX).toBe(0); // moving left: the sprite's own facing
    left.vx = 0;
    w.enemies.movers.hasTarget = false;
    left.m0 = 2; // straight mover now heads right
    left.vx = 2;
    run(w, 1);
    expect(batch.flags[1] & SpriteFlag.FlipX).toBe(SpriteFlag.FlipX);
    expect(batch.spriteId[0]).toBe(w.content.sprites.index.get('enemies/drifter'));
  });

  it('clears every enemy and formation on a checkpoint restart', () => {
    const content = db({
      camera: [{ x: 0, speed: 1 }],
      checkpoints: [{ x: 0 }, { x: 100 }],
      events: [{ x: 5, type: 'formation', enemy: 'idle', count: 5, interval: 30 }],
    });
    const w = world(content);
    run(w, 60);
    expect(live(w).length).toBeGreaterThan(0);
    w.stage?.restartAt(0);
    expect(w.enemies.count).toBe(0);
    expect(Array.from(w.enemies.formations.active).every((a) => a === 0)).toBe(true);
    expect(w.enemies.airBatch.count).toBe(0);
    run(w, 10); // the formation event at 5 fires again
    expect(live(w)).toHaveLength(1);
  });
});

describe('core/enemies determinism and allocation', () => {
  /**
   * Sixty-four enemies that stay on screen: waves, homers, crawlers between two walls and a
   * follow formation.
   *
   * @returns The world after the setup (all 64 spawned).
   */
  function crowded(groups = 'shcf'): World {
    // Walls of solid rock (tile 1) in columns 4 and 44, rows 12…24, keep the crawlers in view.
    const rows: string[] = [];
    for (let r = 0; r < 25; r++) rows.push(r >= 12 ? '4*0, 1, 39*0, 1' : '');
    const content = db({
      tilemap: {
        tileSize: 8,
        tileset: 'terrain-a',
        rowsTall: 25,
        rle: rows,
        generator: {
          type: 'heightfield',
          segments: [{ from: 0, to: 3384, floor: { base: 32, amp: 0, period: 64, seed: 1 } }],
        },
      },
    });
    const w = world(content);
    const e = w.enemies;
    const n = (g: string): number => (groups.includes(g) ? 16 : 0);
    for (let i = 0; i < n('s'); i++) e.spawn(spec(w, 'sine'), 60 + i * 18, 60);
    for (let i = 0; i < n('h'); i++) e.spawn(spec(w, 'homer'), 100 + i * 12, 30 + (i % 4) * 30);
    for (let i = 0; i < n('c'); i++) e.spawn(spec(w, 'crawler'), 60 + i * 16, Number.NaN);
    if (n('f') > 0) e.startFormation(spec(w, 'leader'), 16, 1, 250, 100, -1, DropKind.Capsule, 0);
    run(w, 60);
    // Park the ship mid-view so the homers circling it stay on screen.
    w.players[0].x = 192;
    w.players[0].y = 100;
    expect(e.count).toBe(groups.length * 16);
    return w;
  }

  it('two worlds fed the same input hash equal (and enemies change the hash)', () => {
    const a = crowded();
    const b = crowded();
    const input = createInputSnapshot();
    for (let t = 0; t < 2000; t++) {
      commitPlayerInput(input.players[0], (t >> 6) & 1 ? Action.Up : Action.Down);
      stepWorld(a, input);
      stepWorld(b, input);
    }
    expect(hashWorld(a)).toBe(hashWorld(b));
    const before = hashWorld(a);
    a.enemies.enemies[5].x += 0.5;
    expect(hashWorld(a)).not.toBe(before);
  });

  it('allocates nothing over a 64-enemy tick loop (sleeping scripts, every mover kind)', () => {
    const w = crowded();
    const input = createInputSnapshot();
    // Symmetric input keeps the ship (and the homers circling it) in the middle of the view.
    const masks = [Action.Up, Action.Left, Action.Down, Action.Right];
    const growth = measureHeapGrowth(
      (i) => {
        commitPlayerInput(input.players[0], masks[(i >> 4) & 3]);
        stepWorld(w, input);
        w.events.clear();
      },
      10_000,
      20_000,
    );
    expect(w.enemies.count).toBe(MAX_ENEMIES);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});

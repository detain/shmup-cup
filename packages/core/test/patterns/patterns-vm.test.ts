/**
 * The pattern interpreter of plan M2-02 (`core/patterns` `createPatternVm`) running in a World:
 * DSL patterns fire exactly what the hand-written TS primitives fire (lockstep hashes of the
 * bullet pool — the acceptance "DSL patterns match hand-written TS equivalents"), bullets' own
 * programs (timed speed / heading changes, accel, sub-fires, vanish), `$rank` / `$rand`, the fire
 * rule, the step budget, `pattern.loop`, and the runner bookkeeping (release, session clear,
 * determinism through `hashWorld`).
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BEHAVIOR_DEFS,
  createBehaviorRegistry,
  defineBehavior,
} from '../../src/behaviors/index.js';
import { AIM_AT_TARGET, BulletKind, BulletOrigin } from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { EnemyFlag, type ScriptApi } from '../../src/enemies/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import {
  MAX_PATTERN_EMITTERS,
  MAX_REPEAT_DEPTH,
  MoverKind,
  PATTERN_STEP_BUDGET,
  SLEEP_FOREVER,
  type Script,
} from '../../src/patterns/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';

/** An enemy entry (no mover; may fire at once). */
function enemy(id: string, script: string, pattern?: string): Record<string, unknown> {
  return {
    id,
    hp: 1000,
    score: 0,
    hurtbox: { hw: 4, hh: 4 },
    script,
    sprite: 'enemies/drifter',
    drop: null,
    settleTicks: 0,
    ...(pattern === undefined ? {} : { pattern }),
  };
}

/** A pattern action. */
function act(id: string, body: unknown[]): { id: string; body: unknown[] } {
  return { id, body };
}

/** Repeat a body (practically) forever. */
function forever(body: unknown[]): unknown {
  return { op: 'repeat', times: 1e6, body };
}

/** The DSL patterns of the tests. */
const ACTIONS = [
  act('nway', [
    forever([
      {
        op: 'repeat',
        times: 3,
        body: [
          {
            op: 'fire',
            direction: { type: 'aim', value: '($i - 1) * 48' },
            speed: 1.25,
            bullet: { kind: 'oval-red' },
          },
        ],
      },
      { op: 'wait', ticks: 40 },
    ]),
  ]),
  act('ring', [
    forever([
      {
        op: 'repeat',
        times: 8,
        body: [
          {
            op: 'fire',
            direction: { type: 'absolute', value: '$i * 1024 / 8' },
            speed: 1,
            bullet: { kind: 'round-purple' },
          },
        ],
      },
      { op: 'wait', ticks: 90, ranked: true },
    ]),
  ]),
  act('spiral', [
    { op: 'fire', direction: { type: 'absolute', value: 0 }, speed: 1.2, bulletRef: 'needle' },
    {
      op: 'fire',
      direction: { type: 'sequence', value: 512 },
      speed: { type: 'sequence', value: 0 },
      bulletRef: 'needle',
    },
    { op: 'wait', ticks: 6 },
    forever([
      {
        op: 'fire',
        direction: { type: 'sequence', value: -472 },
        speed: { type: 'sequence', value: 0 },
        bulletRef: 'needle',
      },
      {
        op: 'fire',
        direction: { type: 'sequence', value: 512 },
        speed: { type: 'sequence', value: 0 },
        bulletRef: 'needle',
      },
      { op: 'wait', ticks: 6 },
    ]),
  ]),
  act('turn-later', [
    forever([
      { op: 'fire', speed: 1.25, bulletRef: 'turner' },
      { op: 'fire', direction: { type: 'absolute', value: 512 }, speed: 0.5, bulletRef: 'speeder' },
      { op: 'wait', ticks: 25 },
    ]),
  ]),
  act('rank-ring', [
    {
      op: 'repeat',
      times: '$rank',
      body: [{ op: 'fire', direction: { type: 'absolute', value: '$i * 64' } }],
    },
  ]),
  act('rand-spray', [
    {
      op: 'repeat',
      times: 4,
      body: [
        {
          op: 'fire',
          direction: { type: 'aim', value: '($rand - 0.5) * 128' },
          speed: '0.8 + $rand * 0.8',
        },
      ],
    },
  ]),
  act('budget', [forever([{ op: 'wait', ticks: 0 }])]),
  act('once', [{ op: 'fire', direction: { type: 'absolute', value: 512 } }]),
  act('vanishing', [{ op: 'fire' }, { op: 'vanish' }, { op: 'fire' }]),
  act('split', [
    { op: 'fire', direction: { type: 'absolute', value: 256 }, speed: 1, bulletRef: 'shell' },
  ]),
  act('glide', [
    { op: 'fire', direction: { type: 'absolute', value: 0 }, speed: 1, bulletRef: 'glider' },
  ]),
  act('relative', [
    { op: 'changeDirection', direction: { type: 'absolute', value: 256 } },
    { op: 'fire', direction: { type: 'relative', value: 0 } },
    { op: 'fire', direction: { type: 'relative', value: 256 } },
  ]),
];

/** The DSL bullets of the tests. */
const BULLETS = [
  { id: 'needle', kind: 'needle-pink' },
  {
    id: 'turner',
    kind: 'oval-pink',
    actions: [
      { op: 'wait', ticks: 29 },
      { op: 'changeSpeed', speed: 2 },
      { op: 'changeDirection', direction: { type: 'aim' } },
    ],
  },
  { id: 'speeder', kind: 'needle-red', actions: [{ op: 'accel', accel: 0.02, max: 3 }] },
  {
    id: 'shell',
    kind: 'round-red',
    actions: [
      { op: 'wait', ticks: 20 },
      {
        op: 'repeat',
        times: 4,
        body: [{ op: 'fire', direction: { type: 'relative', value: '$i * 256' }, speed: 0.5 }],
      },
      { op: 'vanish' },
    ],
  },
  {
    id: 'glider',
    kind: 'oval-purple',
    actions: [
      { op: 'changeSpeed', speed: 3, term: 10 },
      { op: 'changeDirection', direction: { type: 'absolute', value: 256 }, term: 8 },
      { op: 'wait', ticks: 20 },
      { op: 'changeDirection', direction: { type: 'sequence', value: -4 }, term: 5 },
      { op: 'changeSpeed', speed: { type: 'sequence', value: -0.1 }, term: 5 },
    ],
  },
];

/** The hand-written equivalents (and helpers) as behaviours. */
const TS_BEHAVIORS = [
  defineBehavior('ts.nway', {}, function* nway(api): Script {
    for (;;) {
      api.nWay(3, 48, 1.25, BulletKind.OvalRed);
      yield 40;
    }
  }),
  defineBehavior('ts.ring', {}, function* ring(api): Script {
    for (;;) {
      api.ring(8, 1, BulletKind.RoundPurple);
      yield api.fireWait(90);
    }
  }),
  defineBehavior('ts.spiral', {}, function* spiral(api): Script {
    let a = 0;
    for (;;) {
      a = api.spiral(a, 2, 40, 1.2, BulletKind.NeedlePink);
      yield 6;
    }
  }),
  defineBehavior('ts.turn-later', {}, function* turnLater(api: ScriptApi): Script {
    for (;;) {
      const i = api.aimed(1.25, BulletKind.OvalPink);
      if (i >= 0) api.bullets.setChange(i, 30, 2, AIM_AT_TARGET);
      // A raw emit (the fire rule by hand, as the DSL's fire obeys it).
      const j = api.canFire()
        ? api.bullets.emit(originOf(api), 512, 0.5 * api.bullets.speedScale, BulletKind.NeedleRed)
        : -1;
      if (j >= 0) api.bullets.setMotion(j, 0.02, 0, 0, 3);
      yield 25;
    }
  }),
  defineBehavior('ts.still', {}, function* still(api): Script {
    api.setMover(MoverKind.None);
    yield SLEEP_FOREVER;
  }),
];

/** The origin {@link originOf} reuses. */
const scratch = new BulletOrigin();

/**
 * A reused origin at the enemy's centre (what the `ScriptApi` wrappers do).
 *
 * @param api - The enemy's API.
 * @returns The origin.
 */
function originOf(api: ScriptApi): BulletOrigin {
  scratch.x = api.self.x;
  scratch.y = api.self.y;
  return scratch;
}

/** Every enemy of the tests: one per TS behaviour, one per DSL action (`pattern.loop`). */
const ENEMIES = [
  ...TS_BEHAVIORS.map((b) => enemy(b.id, b.id)),
  ...ACTIONS.map((a) => enemy('dsl.' + a.id, 'pattern.loop', a.id)),
  enemy('dsl.none', 'pattern.loop'),
];

const DB: ContentDb = (() => {
  const { db, issues } = loadContent([
    {
      path: 'patterns/t.patterns.json',
      data: { formatVersion: 1, kind: 'patterns', actions: ACTIONS, bullets: BULLETS },
    },
    {
      path: 'enemies/t.enemies.json',
      data: { formatVersion: 1, kind: 'enemies', enemies: ENEMIES },
    },
  ]);
  // Only `dsl.none` names no pattern (it must still load).
  expect(issues).toEqual([]);
  return db;
})();

const REGISTRY = createBehaviorRegistry([...DEFAULT_BEHAVIOR_DEFS, ...TS_BEHAVIORS]);

/**
 * A free-flight world (ship alive at the left, invulnerable) with one enemy of an id at the right.
 *
 * @param id - Enemy id.
 * @param overrides - Config overrides.
 * @returns The world.
 */
function arena(id: string | null, overrides: Record<string, unknown> = {}): World {
  const w = createWorld(resolveGameConfig({ seed: 11, ...overrides }), DB, { behaviors: REGISTRY });
  const input = createInputSnapshot();
  for (let i = 0; i < 50; i++) stepWorld(w, input);
  w.players[0].x = 60;
  w.players[0].y = 130;
  w.players[0].invulnTicks = 1e9;
  if (id !== null) {
    const e = w.enemies.spawn(DB.enemyIndex.get(id) ?? -1, w.camera.x + 300, 90);
    expect(e).not.toBeNull();
    // On screen and settled already (phase 5 would set it after the first script run), so the
    // first run may fire.
    if (e !== null) e.flags |= EnemyFlag.OnScreen | EnemyFlag.WasOnScreen | EnemyFlag.Settled;
  }
  return w;
}

/**
 * FNV-1a over the bullets' kinematic fields (position, velocity, speed, heading, kind, age).
 *
 * @param w - The world.
 * @returns The hash.
 */
function bulletHash(w: World): number {
  const f = w.bullets.pool.fields;
  const view = new DataView(new ArrayBuffer(8));
  let h = 0x811c9dc5;
  const mix = (value: number): void => {
    view.setFloat64(0, value, true);
    for (let i = 0; i < 8; i++) h = Math.imul(h ^ view.getUint8(i), 0x01000193) >>> 0;
  };
  mix(w.bullets.count);
  for (let i = 0; i < w.bullets.count; i++) {
    for (const a of [f.x, f.y, f.vx, f.vy, f.speed, f.angle, f.kind, f.age, f.flags]) mix(a[i]);
  }
  return h;
}

/**
 * Runs a TS world and a DSL world in lockstep and compares their bullets every tick.
 *
 * @param ts - The TS enemy id.
 * @param dsl - The DSL enemy id.
 * @param ticks - Ticks to run.
 * @param overrides - Config overrides for both.
 * @returns The bullets fired by the TS world over the run (a sanity count).
 */
function lockstep(ts: string, dsl: string, ticks: number, overrides = {}): number {
  const a = arena(ts, overrides);
  const b = arena(dsl, overrides);
  const input = createInputSnapshot();
  let peak = 0;
  for (let t = 0; t < ticks; t++) {
    stepWorld(a, input);
    stepWorld(b, input);
    // Aimed shots follow the ship: move it the same way in both worlds.
    a.players[0].y = b.players[0].y = 100 + ((t * 7) % 80);
    expect(bulletHash(b), `${dsl} tick ${t}`).toBe(bulletHash(a));
    if (a.bullets.count > peak) peak = a.bullets.count;
  }
  expect(b.rng.gameplay.getState()).toEqual(a.rng.gameplay.getState());
  return peak;
}

describe('core/patterns DSL interpreter — equivalence with the TS primitives (hash)', () => {
  it('an aimed 3-way (repeat + $i) fires exactly what fireNWay fires', () => {
    expect(lockstep('ts.nway', 'dsl.nway', 400)).toBeGreaterThan(9);
  });

  it('a ring with a ranked wait fires exactly what fireRing + fireWait fire, on Hard too', () => {
    expect(lockstep('ts.ring', 'dsl.ring', 400)).toBeGreaterThan(16);
    expect(lockstep('ts.ring', 'dsl.ring', 300, { difficulty: 'arcade' })).toBeGreaterThan(16);
  });

  it('a spiral from sequence directions and speeds fires exactly what fireSpiral fires', () => {
    expect(lockstep('ts.spiral', 'dsl.spiral', 500)).toBeGreaterThan(40);
  });

  it('bullets’ own programs change speed / heading and accelerate like setChange / setMotion', () => {
    expect(lockstep('ts.turn-later', 'dsl.turn-later', 400)).toBeGreaterThan(6);
  });
});

describe('core/patterns DSL interpreter — behaviour', () => {
  it('reads $rank when the pattern runs', () => {
    const count = (difficulty: string): number => {
      const w = arena('dsl.rank-ring', { difficulty, rankGrowth: 0 });
      stepWorld(w, createInputSnapshot());
      return w.bullets.count;
    };
    expect([count('easy'), count('normal'), count('hard'), count('arcade')]).toEqual([0, 2, 4, 6]);
  });

  it('draws $rand from the gameplay stream: deterministic, replay-safe', () => {
    const a = arena('dsl.rand-spray');
    const b = arena('dsl.rand-spray');
    const before = a.rng.gameplay.getState();
    stepWorld(a, createInputSnapshot());
    stepWorld(b, createInputSnapshot());
    expect(a.rng.gameplay.getState()).not.toEqual(before);
    expect(a.bullets.count).toBe(4);
    expect(bulletHash(a)).toBe(bulletHash(b));
    expect(hashWorld(a)).toBe(hashWorld(b));
    const f = a.bullets.pool.fields;
    const speeds = [0, 1, 2, 3].map((i) => f.speed[i]);
    for (const s of speeds) expect(s >= 0.8 && s < 1.6).toBe(true);
    expect(new Set(speeds).size).toBe(4);
  });

  it('obeys the fire rule: off screen it fires nothing but the pattern advances', () => {
    const w = arena(null);
    const e = w.enemies.spawn(DB.enemyIndex.get('dsl.spiral') ?? -1, w.camera.x + 460, 90);
    expect(e).not.toBeNull();
    const input = createInputSnapshot();
    for (let t = 0; t < 30; t++) stepWorld(w, input);
    expect(w.bullets.count).toBe(0);
    const runners = w.patterns.runners;
    const slot = e?.slot ?? -1;
    expect(runners.pc[slot]).toBeGreaterThan(0);
    // Several volleys went by: the sequence direction kept turning.
    expect(runners.seqDir[slot]).toBeGreaterThan(512);
  });

  it('never hangs a tick: a wait-less loop stops at the step budget and goes on next tick', () => {
    const w = arena('dsl.budget');
    const slot = w.enemies.enemies.findIndex(
      (e) => e.specIndex === DB.enemyIndex.get('dsl.budget') && e.state !== 0,
    );
    const index = (): number => w.patterns.runners.loopI[slot * MAX_REPEAT_DEPTH];
    stepWorld(w, createInputSnapshot());
    // A `wait 0` + `loop` pair is two instructions: half the budget in iterations per tick.
    expect(index()).toBe(PATTERN_STEP_BUDGET / 2 - 1);
    stepWorld(w, createInputSnapshot());
    expect(index()).toBe(PATTERN_STEP_BUDGET - 1);
    expect(w.patterns.runners.pc[slot]).toBeGreaterThan(0);
  });

  it('pattern.loop restarts a finished pattern after restTicks; without a pattern it idles', () => {
    const w = arena('dsl.once');
    const input = createInputSnapshot();
    const fired: number[] = [];
    let last = 0;
    for (let t = 0; t < 200; t++) {
      stepWorld(w, input);
      if (w.bullets.count > last) fired.push(t);
      last = w.bullets.count;
    }
    // Default restTicks 60: once on the spawn tick, then every 60 ticks.
    expect(fired.slice(0, 4)).toEqual([0, 60, 120, 180]);
    const idle = arena('dsl.none');
    for (let t = 0; t < 100; t++) stepWorld(idle, input);
    expect(idle.bullets.count).toBe(0);
  });

  it('an emitter’s vanish ends its pattern; its changeDirection sets the relative heading', () => {
    const w = arena('dsl.vanishing');
    stepWorld(w, createInputSnapshot());
    expect(w.bullets.count).toBe(1); // the fire after the vanish never ran
    const r = arena('dsl.relative');
    stepWorld(r, createInputSnapshot());
    const f = r.bullets.pool.fields;
    expect([f.angle[0], f.angle[1]]).toEqual([256, 512]);
  });

  it('a bullet program fires sub-bullets relative to its heading and vanishes, freeing its runner', () => {
    const w = arena('dsl.split');
    const input = createInputSnapshot();
    stepWorld(w, input);
    expect(w.bullets.count).toBe(1);
    expect(w.patterns.bulletPrograms).toBe(1);
    expect(w.bullets.pool.fields.runner[0]).toBe(MAX_PATTERN_EMITTERS + 1);
    for (let t = 0; t < 19; t++) stepWorld(w, input);
    expect(w.bullets.count).toBe(1);
    stepWorld(w, input); // age 20: 4 children, the shell vanishes
    stepWorld(w, input); // flushed
    const f = w.bullets.pool.fields;
    const angles = [];
    for (let i = 0; i < w.bullets.count; i++) angles.push(f.angle[i]);
    expect(angles.sort((x, y) => x - y)).toEqual([0, 256, 512, 768]);
    expect(w.patterns.bulletPrograms).toBe(0);
    for (let i = 0; i < w.bullets.count; i++) expect(f.runner[i]).toBe(0);
  });

  it('timed changes land exactly on their target speed and heading; sequence changes add per tick', () => {
    const w = arena('dsl.glide');
    const input = createInputSnapshot();
    stepWorld(w, input); // age 1: the program starts, speed 1 → 3 over 10 ticks, heading 0 → 256 over 8
    const f = w.bullets.pool.fields;
    expect(f.speed[0]).toBeCloseTo(1.2, 12);
    for (let t = 1; t < 8; t++) stepWorld(w, input);
    expect(f.angle[0]).toBe(256);
    expect(f.angVel[0]).toBe(0);
    stepWorld(w, input);
    stepWorld(w, input);
    expect(f.speed[0]).toBe(3);
    expect(f.accel[0]).toBe(0);
    for (let t = 10; t < 20; t++) stepWorld(w, input); // age 21: the sequence changes start
    stepWorld(w, input);
    const angle = f.angle[0];
    const speed = f.speed[0];
    for (let t = 0; t < 10; t++) stepWorld(w, input);
    expect(f.angle[0]).toBe(angle - 4 * 4);
    expect(f.speed[0]).toBeCloseTo(speed - 0.1 * 4, 12);
  });

  it('frees every bullet runner on a session clear and hashes the runners in use', () => {
    const w = arena('dsl.turn-later');
    const input = createInputSnapshot();
    for (let t = 0; t < 10; t++) stepWorld(w, input);
    expect(w.patterns.bulletPrograms).toBeGreaterThan(0);
    const before = hashWorld(w);
    w.patterns.runners.seqSpeed[MAX_PATTERN_EMITTERS] += 1;
    expect(hashWorld(w)).not.toBe(before);
    w.patterns.runners.seqSpeed[MAX_PATTERN_EMITTERS] -= 1;
    expect(hashWorld(w)).toBe(before);
    w.pools.clearAll();
    w.bullets.clear();
    expect(w.patterns.bulletPrograms).toBe(0);
    expect(w.patterns.runners.meta[0]).toBe(MAX_PATTERN_EMITTERS);
  });

  it('startPattern refuses a bad or uncompiled pattern and stops the emitter', () => {
    const w = arena(null);
    const vm = w.patterns;
    expect(vm.startEmitter(0, -1)).toBe(false);
    expect(vm.startEmitter(0, 1.5)).toBe(false);
    expect(vm.startEmitter(-1, 0)).toBe(false);
    expect(vm.startEmitter(MAX_PATTERN_EMITTERS, 0)).toBe(false);
    expect(vm.startEmitter(3, DB.patterns.actionIndex.get('once') ?? -1)).toBe(true);
    expect(vm.stepEmitter(3, { x: w.camera.x + 200, y: 100 }, true)).toBe(-1);
    expect(w.bullets.count).toBe(1);
    expect(vm.stepEmitter(3, { x: 0, y: 0 }, true)).toBe(-1);
    expect(vm.stepEmitter(99, { x: 0, y: 0 }, true)).toBe(-1);
  });

  it('two worlds running every DSL pattern hash equal every tick', () => {
    const make = (): World => {
      const w = arena(null);
      let k = 0;
      for (const a of ACTIONS) {
        w.enemies.spawn(
          DB.enemyIndex.get('dsl.' + a.id) ?? -1,
          w.camera.x + 150 + (k % 5) * 40,
          40 + k * 12,
        );
        k++;
      }
      return w;
    };
    const a = make();
    const b = make();
    const input = createInputSnapshot();
    for (let t = 0; t < 300; t++) {
      stepWorld(a, input);
      stepWorld(b, input);
      expect(hashWorld(b), `tick ${t}`).toBe(hashWorld(a));
    }
    expect(a.bullets.count).toBeGreaterThan(50);
  });
});

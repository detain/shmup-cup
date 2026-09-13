/**
 * Edge cases of the pattern interpreter of plan M2-02 (`core/patterns` `createPatternVm`): `wait`
 * and `repeat` counts (fractions, below 1, NaN, the caps), `$i` / `$loop` / `$rand` at run time,
 * every expression operator computed at run time exactly as the compiler folds it, `sequence` and
 * `relative` values of emitters, the fire rule, bullets' own programs (their launch scale, timed
 * changes across the 0 heading, aim, accel clamps and terms, relative speeds, ending, vanishing,
 * the step budget, leaving the screen), the runner table (rotating hint, stale runners, release
 * guards, restart), enemies removed mid-pattern, `pattern.loop`'s tunables, and two more DSL ↔ TS
 * primitive equivalences (stack, random spray) — plus the runtime side of review round 1's shared
 * bullet program fix (a shared program fired from another bullet's program runs in both compile
 * orders).
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BEHAVIOR_DEFS,
  createBehaviorRegistry,
  defineBehavior,
} from '../../src/behaviors/index.js';
import { BulletKind, BulletOrigin, MAX_BULLET_SPEED } from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { EnemyFlag } from '../../src/enemies/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import {
  MAX_PATTERN_EMITTERS,
  MAX_PATTERN_LOCALS,
  MAX_PATTERN_WAIT,
  MAX_REPEAT_DEPTH,
  PATTERN_RUNNERS,
  PATTERN_STEP_BUDGET,
  compileExpression,
  rankedWait,
  type Script,
} from '../../src/patterns/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';

/** Absolute direction. */
const abs = (value: number | string): Record<string, unknown> => ({ type: 'absolute', value });

/** An action. */
const act = (id: string, body: unknown[]): { id: string; body: unknown[] } => ({ id, body });

/**
 * Expressions computed at run time (`Z` = `$rank * 0`, so nothing folds) and the same expressions
 * the compiler folds (`Z` = `0`): the interpreter must land on exactly the folded value.
 */
const RUNTIME_EXPRS = [
  'Z + 7 % 3',
  '(Z - 7.5) % 2',
  '(Z + 1) / 3',
  'floor(Z - 2.5)',
  'round(Z - 2.5)',
  'round(Z + 2.5)',
  'abs(Z - 3.25)',
  'min(Z + 2, -1)',
  'max(Z + 2, -1)',
  'sin(Z + 100.4)',
  'cos(Z + 700.6)',
  'sin(Z - 300)',
  '(Z + 2) - 5 * 3',
  '-(Z + 4) * 0.5',
  '(Z + 1) / 0',
];

/** Enemy entry (no mover; may fire at once when its flags are set). */
function enemy(
  id: string,
  script: string,
  pattern?: string,
  params?: Record<string, number>,
): Record<string, unknown> {
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
    ...(params === undefined ? {} : { params }),
  };
}

/** Forever. */
const forever = (body: unknown[]): unknown => ({ op: 'repeat', times: 1e6, body });

const ACTIONS = [
  act('waits', [
    { op: 'wait', ticks: 7.9 },
    { op: 'wait', ticks: 0.5 },
    { op: 'wait', ticks: -5 },
    { op: 'wait', ticks: '0 / 0' },
    { op: 'wait', ticks: 3 },
    { op: 'wait', ticks: 1e9 },
    { op: 'wait', ticks: 90, ranked: true },
    { op: 'wait', ticks: 0.2, ranked: true },
  ]),
  act('repeats', [
    { op: 'repeat', times: 2.9, body: [{ op: 'fire', direction: abs(10) }] },
    { op: 'repeat', times: 0, body: [{ op: 'fire', direction: abs(20) }] },
    { op: 'repeat', times: -1, body: [{ op: 'fire', direction: abs(30) }] },
    { op: 'repeat', times: '0 / 0', body: [{ op: 'fire', direction: abs(40) }] },
  ]),
  act('huge', [{ op: 'repeat', times: '$rank * 0 + 1e12', body: [{ op: 'wait', ticks: 0 }] }]),
  act('nested', [
    {
      op: 'repeat',
      times: 2,
      body: [
        { op: 'repeat', times: 3, body: [{ op: 'fire', direction: abs('$i * 10') }] },
        { op: 'fire', direction: abs('$i * 100 + 500') },
      ],
    },
    { op: 'fire', direction: abs('$i + 7') },
  ]),
  act('loop', [{ op: 'fire', direction: abs('$loop * 100') }]),
  act('seq', [
    {
      op: 'fire',
      direction: { type: 'sequence', value: 30 },
      speed: { type: 'sequence', value: 0.5 },
    },
    {
      op: 'fire',
      direction: { type: 'sequence', value: 30 },
      speed: { type: 'sequence', value: 0.5 },
    },
  ]),
  act('rel-speed', [{ op: 'fire', direction: abs(0), speed: { type: 'relative', value: 0.75 } }]),
  act('rel-dir', [{ op: 'fire', direction: { type: 'relative', value: 12 } }]),
  act('turn-emitter', [
    { op: 'changeDirection', direction: { type: 'relative', value: 100 } },
    { op: 'fire', direction: { type: 'relative', value: 0 } },
    { op: 'changeDirection', direction: { type: 'sequence', value: 5 }, term: 10 },
    { op: 'changeSpeed', speed: 3 },
    { op: 'accel', accel: 1, max: 2 },
    { op: 'fire', direction: { type: 'relative', value: 0 } },
  ]),
  act('rand-fire', [
    { op: 'fire', direction: abs(0), speed: '$rand + $rand', bulletRef: 'short' },
    { op: 'wait', ticks: 1 },
  ]),
  act('hold-local', [
    { op: 'actionRef', action: 'sink', params: ['$rank * 0 + 5'] },
    { op: 'wait', ticks: 10 },
  ]),
  act('sink', []),
  ...RUNTIME_EXPRS.map((expr, k) =>
    act('rt-' + String(k), [
      { op: 'actionRef', action: 'sink', params: [expr.replace(/Z/g, '$rank * 0')] },
    ]),
  ),
  // Bullets' own programs, each fired once from emitter 0.
  ...[
    'to-two',
    'faster',
    'rocket',
    'seeker',
    'seeker-offset',
    'brake',
    'burst',
    'capped',
    'noop',
    'short',
    'lingering',
    'spinner',
    'mother',
    'mother-rel',
  ].map((b) => act('fire-' + b, [{ op: 'fire', direction: abs(512), speed: 1, bulletRef: b }])),
  act('wrap-up', [{ op: 'fire', direction: abs(1000), speed: 0.5, bulletRef: 'to-24' }]),
  act('wrap-down', [{ op: 'fire', direction: abs(24), speed: 0.5, bulletRef: 'to-1000' }]),
  act('right', [{ op: 'fire', direction: abs(0), speed: 1, bulletRef: 'seeker' }]),
  act('right-offset', [{ op: 'fire', direction: abs(0), speed: 1, bulletRef: 'seeker-offset' }]),
  act('volley', [
    { op: 'fire', direction: abs(256), speed: 0.25, bulletRef: 'lingering' },
    { op: 'wait', ticks: 5 },
  ]),
  act('rel-once', [{ op: 'fire', direction: { type: 'relative', value: 0 } }]),
  act('param-shot', [
    {
      op: 'fire',
      direction: abs(512),
      speed: 0.5,
      bulletRef: 'hold-param',
      params: ['$rand * 100'],
    },
  ]),
  act('carried', [{ op: 'fire', direction: abs(512), speed: 0.5, bulletRef: 'carrier' }]),
  act('direct', [{ op: 'fire', direction: abs(512), speed: 0.5, bulletRef: 'leaf' }]),
  // The TS equivalents' DSL versions.
  act('stack', [
    forever([
      {
        op: 'repeat',
        times: 4,
        body: [
          {
            op: 'fire',
            direction: { type: 'aim' },
            speed: '1 + $i * 0.25',
            bullet: { kind: 'needle-red' },
          },
        ],
      },
      { op: 'wait', ticks: 30 },
    ]),
  ]),
  act('spray', [
    forever([
      {
        op: 'repeat',
        times: 6,
        body: [
          {
            op: 'fire',
            direction: { type: 'aim', value: '($rand - 0.5) * 128' },
            speed: '0.8 + $rand * 0.8',
            bullet: { kind: 'round-red' },
          },
        ],
      },
      { op: 'wait', ticks: 25 },
    ]),
  ]),
];

const BULLETS = [
  { id: 'to-two', actions: [{ op: 'changeSpeed', speed: 2 }] },
  { id: 'faster', actions: [{ op: 'changeSpeed', speed: { type: 'relative', value: 0.5 } }] },
  { id: 'rocket', actions: [{ op: 'changeSpeed', speed: 20, term: 2 }] },
  { id: 'seeker', actions: [{ op: 'changeDirection', direction: { type: 'aim' } }] },
  {
    id: 'seeker-offset',
    actions: [{ op: 'changeDirection', direction: { type: 'aim', value: 256 } }],
  },
  { id: 'brake', actions: [{ op: 'accel', accel: -0.25, min: 0.5 }] },
  { id: 'burst', actions: [{ op: 'accel', accel: 0.5, term: 2 }] },
  { id: 'capped', actions: [{ op: 'accel', accel: 1, max: 2.5 }] },
  {
    id: 'noop',
    actions: [
      { op: 'changeSpeed', speed: { type: 'sequence', value: 1 } },
      { op: 'changeDirection', direction: { type: 'sequence', value: 9 } },
    ],
  },
  { id: 'short', actions: [{ op: 'changeSpeed', speed: 2 }] },
  { id: 'lingering', actions: [{ op: 'wait', ticks: 1000 }] },
  { id: 'spinner', actions: [forever([{ op: 'wait', ticks: 0 }])] },
  {
    id: 'mother',
    actions: [
      { op: 'fire', direction: { type: 'relative', value: 0 }, speed: 0.5 },
      { op: 'vanish' },
    ],
  },
  {
    id: 'mother-rel',
    actions: [
      {
        op: 'fire',
        direction: { type: 'relative', value: 0 },
        speed: { type: 'relative', value: 0.5 },
      },
      { op: 'vanish' },
    ],
  },
  { id: 'to-24', actions: [{ op: 'changeDirection', direction: abs(24), term: 4 }] },
  { id: 'to-1000', actions: [{ op: 'changeDirection', direction: abs(1000), term: 4 }] },
  { id: 'leaf', actions: [{ op: 'changeSpeed', speed: 2 }] },
  { id: 'hold-param', actions: [{ op: 'wait', ticks: '$1 + 1000' }] },
  {
    id: 'carrier',
    actions: [
      { op: 'wait', ticks: 3 },
      { op: 'fire', direction: abs(256), bulletRef: 'leaf' },
    ],
  },
];

/** The hand-written equivalents. */
const TS_BEHAVIORS = [
  defineBehavior('ts.stack', {}, function* stack(api): Script {
    for (;;) {
      api.stack(4, 1, 0.25, BulletKind.NeedleRed);
      yield 30;
    }
  }),
  defineBehavior('ts.spray', {}, function* spray(api): Script {
    for (;;) {
      api.spray(6, 128, 0.8, 1.6, BulletKind.RoundRed);
      yield 25;
    }
  }),
];

const ENEMIES = [
  enemy('ts.stack', 'ts.stack'),
  enemy('ts.spray', 'ts.spray'),
  enemy('dsl.stack', 'pattern.loop', 'stack'),
  enemy('dsl.spray', 'pattern.loop', 'spray'),
  enemy('dsl.volley', 'pattern.loop', 'volley'),
  enemy('dsl.every-tick', 'pattern.loop', 'rel-once', { restTicks: 0, heading: 256 }),
  enemy('dsl.every-2', 'pattern.loop', 'rel-once', { restTicks: 2.7 }),
];

/**
 * Loads the test content with the actions in a given order (the compile order).
 *
 * @param actions - The actions.
 * @returns The DB.
 */
function content(actions: unknown[]): ContentDb {
  const { db, issues } = loadContent([
    {
      path: 'patterns/t.patterns.json',
      data: { formatVersion: 1, kind: 'patterns', actions, bullets: BULLETS },
    },
    {
      path: 'enemies/t.enemies.json',
      data: { formatVersion: 1, kind: 'enemies', enemies: ENEMIES },
    },
  ]);
  expect(issues).toEqual([]);
  return db;
}

const DB = content(ACTIONS);

const REGISTRY = createBehaviorRegistry([...DEFAULT_BEHAVIOR_DEFS, ...TS_BEHAVIORS]);

/**
 * A free-flight world, the ship alive at (60, 130) and invulnerable.
 *
 * @param overrides - Config overrides.
 * @param db - Content.
 * @returns The world.
 */
function arena(overrides: Record<string, unknown> = {}, db: ContentDb = DB): World {
  const w = createWorld(resolveGameConfig({ seed: 21, ...overrides }), db, { behaviors: REGISTRY });
  const input = createInputSnapshot();
  for (let i = 0; i < 50; i++) stepWorld(w, input);
  w.players[0].x = 60;
  w.players[0].y = 130;
  w.players[0].invulnTicks = 1e9;
  return w;
}

/**
 * Starts an action on emitter 0.
 *
 * @param w - The world.
 * @param id - Action id.
 * @param heading - Heading for relative directions.
 */
function start(w: World, id: string, heading?: number): void {
  const index = w.content.patterns.actionIndex.get(id) ?? -1;
  expect(w.patterns.startEmitter(0, index, heading), id).toBe(true);
}

/** Where emitter 0 fires from: right of the ship, on its row. */
function source(w: World): { x: number; y: number } {
  return { x: w.camera.x + 200, y: 130 };
}

/**
 * Steps emitter 0 once.
 *
 * @param w - The world.
 * @param canFire - The fire rule.
 * @returns The wait (-1 = ended).
 */
function step(w: World, canFire = true): number {
  return w.patterns.stepEmitter(0, source(w), canFire);
}

/**
 * Runs an action on emitter 0 to its end, then `ticks` world ticks.
 *
 * @param w - The world.
 * @param id - Action id.
 * @param ticks - World ticks after.
 */
function run(w: World, id: string, ticks = 0): void {
  start(w, id);
  expect(step(w)).toBe(-1);
  tick(w, ticks);
}

/**
 * Steps a world.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
function tick(w: World, ticks = 1): void {
  const input = createInputSnapshot();
  for (let t = 0; t < ticks; t++) stepWorld(w, input);
}

/**
 * The live bullets' values of one field, in pool order.
 *
 * @param w - The world.
 * @param name - Field.
 * @returns The values.
 */
function values(
  w: World,
  name: 'speed' | 'angle' | 'runner' | 'accel' | 'minSpeed' | 'maxSpeed',
): number[] {
  const out: number[] = [];
  for (let i = 0; i < w.bullets.count; i++) out.push(w.bullets.pool.fields[name][i]);
  return out;
}

/**
 * Spawns an enemy that may fire at once.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @returns The enemy.
 */
function spawn(w: World, id: string): NonNullable<ReturnType<World['enemies']['spawn']>> {
  const e = w.enemies.spawn(w.content.enemyIndex.get(id) ?? -1, w.camera.x + 300, 90);
  expect(e).not.toBeNull();
  if (e === null) throw new Error('no enemy');
  e.flags |= EnemyFlag.OnScreen | EnemyFlag.WasOnScreen | EnemyFlag.Settled;
  return e;
}

describe('core/patterns DSL interpreter — waits, repeats and variables', () => {
  it('floors waits, skips those below 1 (or NaN), caps them, and ranks `ranked` ones', () => {
    const w = arena({ difficulty: 'arcade' });
    start(w, 'waits');
    expect(step(w)).toBe(7);
    expect(step(w)).toBe(3);
    expect(step(w)).toBe(MAX_PATTERN_WAIT);
    const ranked = rankedWait(w.bullets, 90);
    expect(ranked).toBeLessThan(90); // Arcade fires faster
    expect(step(w)).toBe(ranked);
    expect(step(w)).toBe(1); // a ranked wait is at least 1
    expect(step(w)).toBe(-1);
    expect(w.patterns.runners.state[0]).toBe(0);
    expect(w.patterns.runners.pc[0]).toBe(0);
    expect(step(w)).toBe(-1); // a stopped emitter stays stopped
  });

  it('floors repeat counts and skips a body run below 1 (or NaN) times', () => {
    const w = arena();
    run(w, 'repeats');
    expect(values(w, 'angle')).toEqual([10, 10]);
  });

  it('caps a huge repeat count and the step budget keeps the tick short', () => {
    const w = arena();
    start(w, 'huge');
    expect(step(w)).toBe(1);
    expect(w.patterns.runners.loopN[0]).toBe(0x3fffffff);
    expect(w.patterns.runners.loopI[0]).toBe(PATTERN_STEP_BUDGET / 2 - 1);
  });

  it('reads $i of the innermost repeat (0 outside any), back to the outer one after the inner', () => {
    const w = arena();
    run(w, 'nested');
    expect(values(w, 'angle')).toEqual([0, 10, 20, 500, 0, 10, 20, 600, 7]);
    expect(w.patterns.runners.depth[0]).toBe(0);
  });

  it('reads $loop from the rank inputs when the pattern runs', () => {
    const w = arena();
    run(w, 'loop');
    w.rankInputs.loop = 3;
    run(w, 'loop');
    expect(values(w, 'angle')).toEqual([100, 300]);
  });

  it('computes every operator at run time exactly as the compiler folds it', () => {
    const w = arena();
    RUNTIME_EXPRS.forEach((expr, k) => {
      run(w, 'rt-' + String(k));
      const folded = compileExpression(expr.replace(/Z/g, '0'));
      expect(folded[0], expr).toBe(2); // [2, Const, value]
      expect(w.patterns.runners.locals[0], expr).toBe(folded[2]);
    });
  });

  it('draws $rand once per occurrence per evaluation — also when the fire rule stops the shot', () => {
    const w = arena();
    const rng = w.rng.gameplay;
    const before = rng.callCount;
    start(w, 'rand-fire');
    expect(step(w, false)).toBe(1);
    expect(rng.callCount - before).toBe(2);
    expect(w.bullets.count).toBe(0);
    expect(w.patterns.bulletPrograms).toBe(0); // no bullet, no runner
    // The pattern advanced: the sequence state was recorded.
    expect(w.patterns.runners.state[0] & 6).toBe(6);
    start(w, 'rand-fire');
    expect(step(w, true)).toBe(1);
    expect(rng.callCount - before).toBe(4);
    const speed = values(w, 'speed')[0] / w.bullets.speedScale;
    expect(speed >= 0 && speed < 2).toBe(true);
    expect(w.patterns.bulletPrograms).toBe(1);
  });

  it('restarting an emitter clears its locals, loop stack and sequence state', () => {
    const w = arena();
    start(w, 'hold-local');
    expect(step(w)).toBe(10);
    expect(w.patterns.runners.locals[0]).toBe(5);
    start(w, 'seq');
    expect(w.patterns.runners.locals[0]).toBe(0);
    expect(w.patterns.runners.state[0]).toBe(1);
    expect(w.patterns.runners.depth[0]).toBe(0);
  });
});

describe('core/patterns DSL interpreter — emitters', () => {
  it('aims the first sequence fire, then adds to the previous one; a restart aims again', () => {
    const w = arena();
    const origin = new BulletOrigin();
    origin.x = source(w).x;
    origin.y = source(w).y;
    const aim = w.bullets.aimFrom(origin);
    expect(aim).toBe(512); // the ship is straight left
    const scale = w.bullets.speedScale;
    run(w, 'seq');
    expect(values(w, 'angle')).toEqual([aim + 30, aim + 60]);
    expect(values(w, 'speed').map((s) => s / scale)).toEqual([1.5, 2]);
    run(w, 'seq');
    expect(values(w, 'angle').slice(2)).toEqual([aim + 30, aim + 60]);
  });

  it('an emitter’s relative speed is 0 + value; relative directions measure from its heading', () => {
    const w = arena();
    const scale = w.bullets.speedScale;
    run(w, 'rel-speed');
    expect(values(w, 'speed')[0] / scale).toBe(0.75);
    start(w, 'rel-dir', 300);
    expect(step(w)).toBe(-1);
    start(w, 'rel-dir');
    expect(step(w)).toBe(-1); // default heading: left
    expect(values(w, 'angle').slice(1)).toEqual([312, 524]);
  });

  it('ignores bullet-only nodes in an emitter; a relative changeDirection turns its heading', () => {
    const w = arena();
    start(w, 'turn-emitter', 0);
    expect(step(w)).toBe(-1);
    expect(values(w, 'angle')).toEqual([100, 100]);
    expect(w.patterns.runners.heading[0]).toBe(100);
  });
});

describe('core/patterns DSL interpreter — bullets’ own programs', () => {
  it('uses the speed scale the bullet was fired with, whatever the rank does later', () => {
    const w = arena();
    run(w, 'fire-to-two');
    const r = w.bullets.pool.fields.runner[0] - 1;
    expect(r).toBeGreaterThanOrEqual(MAX_PATTERN_EMITTERS);
    expect(w.patterns.runners.scale[r]).toBe(w.bullets.speedScale);
    w.patterns.runners.scale[r] = 1.5;
    tick(w);
    expect(values(w, 'speed')).toEqual([3]);
  });

  it('changes speed relatively, and widens the bullet’s max speed for a target above it', () => {
    const w = arena();
    const scale = w.bullets.speedScale;
    run(w, 'fire-faster', 1);
    expect(values(w, 'speed')[0]).toBeCloseTo(1.5 * scale, 12);
    const r = arena();
    const rs = r.bullets.speedScale;
    run(r, 'fire-rocket', 2);
    expect(20 * rs).toBeGreaterThan(MAX_BULLET_SPEED);
    expect(values(r, 'maxSpeed')[0]).toBe(20 * rs);
    expect(values(r, 'speed')[0]).toBe(20 * rs);
  });

  it('turns a timed change the short way round across heading 0 and lands on the target', () => {
    const up = arena();
    run(up, 'wrap-up');
    const angles: number[] = [];
    for (let t = 0; t < 5; t++) {
      tick(up);
      angles.push(values(up, 'angle')[0]);
    }
    expect(angles).toEqual([1012, 0, 12, 24, 24]);
    const down = arena();
    run(down, 'wrap-down');
    const back: number[] = [];
    for (let t = 0; t < 4; t++) {
      tick(down);
      back.push(values(down, 'angle')[0]);
    }
    expect(back).toEqual([12, 0, 1012, 1000]);
  });

  it('aims a changeDirection from the bullet’s own position (+ value)', () => {
    const w = arena();
    run(w, 'right', 1);
    expect(values(w, 'angle')).toEqual([512]);
    const o = arena();
    run(o, 'right-offset', 1);
    expect(values(o, 'angle')).toEqual([768]);
  });

  it('clamps accel at min / max; a term stops it and keeps the speed reached', () => {
    const speeds = (id: string, ticks: number): number[] => {
      const w = arena();
      const scale = w.bullets.speedScale;
      run(w, id);
      const out: number[] = [];
      for (let t = 0; t < ticks; t++) {
        tick(w);
        out.push(Math.round((values(w, 'speed')[0] / scale) * 1e9) / 1e9);
      }
      return out;
    };
    expect(speeds('fire-brake', 4)).toEqual([0.75, 0.5, 0.5, 0.5]);
    expect(speeds('fire-burst', 4)).toEqual([1.5, 2, 2, 2]);
    expect(speeds('fire-capped', 3)).toEqual([2, 2.5, 2.5]);
    const w = arena();
    run(w, 'fire-burst', 3);
    expect(values(w, 'accel')).toEqual([0]);
    expect(values(w, 'maxSpeed')).toEqual([MAX_BULLET_SPEED]);
  });

  it('does nothing for a sequence change without a term', () => {
    const w = arena();
    const scale = w.bullets.speedScale;
    run(w, 'fire-noop', 3);
    expect(values(w, 'speed')).toEqual([scale]);
    expect(values(w, 'angle')).toEqual([512]);
  });

  it('frees the runner when the program ends; the bullet flies on', () => {
    const w = arena();
    run(w, 'fire-short');
    expect(w.patterns.bulletPrograms).toBe(1);
    tick(w);
    expect(w.patterns.bulletPrograms).toBe(0);
    expect(w.bullets.count).toBe(1);
    expect(values(w, 'runner')).toEqual([0]);
  });

  it('frees the runner of a bullet that leaves the screen', () => {
    const w = arena();
    run(w, 'fire-lingering');
    expect(w.patterns.bulletPrograms).toBe(1);
    tick(w, 260);
    expect(w.bullets.count).toBe(0);
    expect(w.patterns.bulletPrograms).toBe(0);
  });

  it('stops a wait-less bullet program at the step budget and goes on next tick', () => {
    const w = arena();
    run(w, 'fire-spinner');
    const r = w.bullets.pool.fields.runner[0] - 1;
    tick(w);
    expect(w.patterns.runners.loopI[r * MAX_REPEAT_DEPTH]).toBe(PATTERN_STEP_BUDGET / 2 - 1);
    tick(w);
    expect(w.patterns.runners.loopI[r * MAX_REPEAT_DEPTH]).toBe(PATTERN_STEP_BUDGET - 1);
    expect(w.bullets.count).toBe(1);
  });

  it('fires and vanishes in one run: the child flies, the parent and its runner are gone', () => {
    const w = arena();
    const scale = w.bullets.speedScale;
    run(w, 'fire-mother', 2);
    expect(w.bullets.count).toBe(1);
    expect(values(w, 'speed')).toEqual([0.5 * scale]);
    expect(values(w, 'angle')).toEqual([512]);
    expect(w.patterns.bulletPrograms).toBe(0);
    const r = arena();
    run(r, 'fire-mother-rel', 2);
    expect(values(r, 'speed')[0]).toBeCloseTo(1.5 * r.bullets.speedScale, 12);
  });

  it('runs a shared program fired from another bullet’s program, in both compile orders', () => {
    const order = ACTIONS.filter((a) => a.id === 'direct' || a.id === 'carried');
    for (const actions of [order, [...order].reverse()]) {
      const db = content([
        ...ACTIONS.filter((a) => a.id !== 'direct' && a.id !== 'carried'),
        ...actions,
      ]);
      const w = arena({}, db);
      const scale = w.bullets.speedScale;
      run(w, 'carried');
      tick(w, 4); // the carrier's wait ends at age 4: the child is fired
      expect(w.bullets.count).toBe(2);
      const child = 1;
      expect(w.bullets.pool.fields.runner[child]).toBeGreaterThan(0);
      tick(w); // the child's program: speed 2
      expect(w.bullets.pool.fields.speed[child]).toBe(2 * scale);
    }
  });
});

describe('core/patterns DSL interpreter — the runner table', () => {
  it('hands bullet runners out from a rotating hint, not the lowest free slot', () => {
    const w = arena();
    for (let k = 0; k < 3; k++) run(w, 'fire-lingering');
    expect(values(w, 'runner')).toEqual([65, 66, 67]);
    w.bullets.remove(0);
    tick(w);
    expect(w.patterns.bulletPrograms).toBe(2);
    run(w, 'fire-lingering');
    const runners = values(w, 'runner');
    expect(runners).toContain(MAX_PATTERN_EMITTERS + 3 + 1);
    expect(runners).not.toContain(MAX_PATTERN_EMITTERS + 1);
    expect(w.patterns.runners.meta[0]).toBe(MAX_PATTERN_EMITTERS + 4);
  });

  it('drops a stale runner reference of a bullet (a free runner or an emitter slot)', () => {
    const w = arena();
    w.bullets.spawn(w.camera.x + 200, 100, 512, 0.5, 0);
    w.bullets.spawn(w.camera.x + 200, 110, 512, 0.5, 0);
    const f = w.bullets.pool.fields;
    f.runner[0] = MAX_PATTERN_EMITTERS + 100 + 1;
    f.runner[1] = 1; // emitter 0
    tick(w);
    expect(values(w, 'runner')).toEqual([0, 0]);
    expect(w.bullets.count).toBe(2);
  });

  it('release ignores emitters, out-of-range and free runners', () => {
    const w = arena();
    run(w, 'fire-lingering');
    const vm = w.patterns;
    expect(vm.bulletPrograms).toBe(1);
    vm.release(0);
    vm.release(-1);
    vm.release(PATTERN_RUNNERS);
    vm.release(MAX_PATTERN_EMITTERS + 200);
    expect(vm.bulletPrograms).toBe(1);
    const r = w.bullets.pool.fields.runner[0] - 1;
    vm.release(r);
    vm.release(r); // twice: counted once
    expect(vm.bulletPrograms).toBe(0);
    vm.stopEmitter(-1);
    vm.stopEmitter(MAX_PATTERN_EMITTERS);
    vm.stopEmitter(0.5);
    expect(vm.stepEmitter(0.5, source(w), true)).toBe(-1);
  });

  it('keeps each bullet runner’s param values apart', () => {
    const w = arena();
    run(w, 'param-shot');
    run(w, 'param-shot');
    const f = w.bullets.pool.fields;
    const a = f.runner[0] - 1;
    const b = f.runner[1] - 1;
    expect(a).not.toBe(b);
    const locals = w.patterns.runners.locals;
    expect(locals.length).toBe(MAX_PATTERN_LOCALS * PATTERN_RUNNERS);
    const va = locals[a * MAX_PATTERN_LOCALS];
    const vb = locals[b * MAX_PATTERN_LOCALS];
    expect(va).not.toBe(vb);
    for (const v of [va, vb]) expect(v > 0 && v < 100).toBe(true);
    // The rest of each runner's locals stay 0.
    expect(locals[a * MAX_PATTERN_LOCALS + 1]).toBe(0);
    tick(w);
    expect(w.patterns.runners.wake[a]).toBe(1 + Math.floor(va + 1000));
  });
});

describe('core/patterns DSL interpreter — enemies and pattern.loop', () => {
  it('stops an enemy’s emitter when it is killed; its bullets’ programs run on', () => {
    const w = arena();
    const e = spawn(w, 'dsl.volley');
    tick(w);
    expect(w.patterns.runners.state[e.slot]).not.toBe(0);
    expect(w.patterns.bulletPrograms).toBe(1);
    w.enemies.kill(e, 0);
    tick(w);
    expect(w.patterns.runners.state[e.slot]).toBe(0);
    expect(w.patterns.runners.pc[e.slot]).toBe(0);
    expect(w.patterns.bulletPrograms).toBe(1);
  });

  it('pattern.loop rests at least 1 tick (restTicks floored) and fires from its `heading`', () => {
    const fired = (id: string, ticks: number): { at: number[]; angles: number[] } => {
      const w = arena();
      spawn(w, id);
      const at: number[] = [];
      let last = 0;
      for (let t = 0; t < ticks; t++) {
        tick(w);
        if (w.bullets.count > last) at.push(t);
        last = w.bullets.count;
      }
      return { at, angles: values(w, 'angle') };
    };
    const fast = fired('dsl.every-tick', 6);
    expect(fast.at).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(fast.angles)).toEqual(new Set([256]));
    const two = fired('dsl.every-2', 7);
    expect(two.at).toEqual([0, 2, 4, 6]);
    expect(new Set(two.angles)).toEqual(new Set([512])); // default heading: left
  });

  it('a session clear stops every emitter and frees every bullet program', () => {
    const w = arena();
    const e = spawn(w, 'dsl.volley');
    tick(w, 6);
    expect(w.patterns.bulletPrograms).toBeGreaterThan(0);
    w.pools.clearAll();
    w.bullets.clear();
    expect(w.patterns.runners.state[e.slot]).toBe(0);
    expect(w.patterns.bulletPrograms).toBe(0);
    expect([...w.patterns.runners.state].every((s) => s === 0)).toBe(true);
  });
});

describe('core/patterns DSL interpreter — more TS equivalents (hash)', () => {
  /**
   * FNV-1a over the bullets' kinematic fields.
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
   * Runs a TS enemy and a DSL enemy in lockstep and compares their bullets every tick.
   *
   * @param ts - TS enemy id.
   * @param dsl - DSL enemy id.
   * @param ticks - Ticks.
   * @param overrides - Config overrides.
   * @returns The peak bullet count.
   */
  function lockstep(ts: string, dsl: string, ticks: number, overrides = {}): number {
    const a = arena(overrides);
    const b = arena(overrides);
    spawn(a, ts);
    spawn(b, dsl);
    let peak = 0;
    for (let t = 0; t < ticks; t++) {
      tick(a);
      tick(b);
      a.players[0].y = b.players[0].y = 100 + ((t * 5) % 70);
      expect(bulletHash(b), `${dsl} tick ${t}`).toBe(bulletHash(a));
      if (a.bullets.count > peak) peak = a.bullets.count;
    }
    expect(b.rng.gameplay.getState()).toEqual(a.rng.gameplay.getState());
    return peak;
  }

  it('an aimed speed stack (repeat + $i in the speed) fires exactly what fireStack fires', () => {
    expect(lockstep('ts.stack', 'dsl.stack', 300)).toBeGreaterThan(8);
    expect(lockstep('ts.stack', 'dsl.stack', 200, { difficulty: 'arcade' })).toBeGreaterThan(8);
  });

  it('a random spray ($rand in direction and speed) fires exactly what fireSpray fires', () => {
    expect(lockstep('ts.spray', 'dsl.spray', 300)).toBeGreaterThan(12);
  });
});

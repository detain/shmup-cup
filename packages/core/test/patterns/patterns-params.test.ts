/**
 * Params of the pattern DSL at run time (plan M2-02, review round 1): an `actionRef`'s or
 * `bulletRef`'s params are values evaluated once when the reference runs (BulletML's meaning) —
 * `$i` is the caller's loop index, `$rand` one draw shared by every use — held in the runner's
 * locals, handed to a bullet's own runner by its `Fire`, and hashed by `hashWorld`.
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { MAX_PATTERN_EMITTERS, MAX_PATTERN_LOCALS } from '../../src/patterns/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';

/** Absolute direction. */
const abs = (value: number | string): Record<string, unknown> => ({ type: 'absolute', value });

const DB: ContentDb = (() => {
  const { db, issues } = loadContent([
    {
      path: 'patterns/p.patterns.json',
      data: {
        formatVersion: 1,
        kind: 'patterns',
        actions: [
          // (a) each bullet gets its own loop index through the param.
          {
            id: 'index-to-bullet',
            body: [
              {
                op: 'repeat',
                times: 3,
                body: [
                  { op: 'fire', direction: abs(0), bulletRef: 'speed-by-param', params: ['$i'] },
                ],
              },
            ],
          },
          // (b) `$1` is the caller's index, not the inlined action's own loop index.
          {
            id: 'index-to-action',
            body: [
              {
                op: 'repeat',
                times: 3,
                body: [{ op: 'actionRef', action: 'pair', params: ['$i'] }],
              },
            ],
          },
          {
            id: 'pair',
            body: [{ op: 'repeat', times: 2, body: [{ op: 'fire', direction: abs('$1 * 100') }] }],
          },
          // (c) one `$rand` draw, used twice.
          {
            id: 'rand-twice',
            body: [{ op: 'actionRef', action: 'same-twice', params: ['$rand * 100'] }],
          },
          {
            id: 'same-twice',
            body: [
              { op: 'fire', direction: abs('$1') },
              { op: 'fire', direction: abs('$1') },
            ],
          },
          // A bulletRef's `$rand` param: the bullet's direction (read by the fire) and its
          // program (read by its runner) see the same value.
          {
            id: 'rand-to-bullet',
            body: [{ op: 'fire', bulletRef: 'turn-by-param', params: ['$rand * 100'] }],
          },
          // An inline bullet's program reads the enclosing reference's param value.
          {
            id: 'index-to-inline',
            body: [
              {
                op: 'repeat',
                times: 2,
                body: [{ op: 'actionRef', action: 'inline-shot', params: ['$i'] }],
              },
            ],
          },
          {
            id: 'inline-shot',
            body: [
              {
                op: 'fire',
                direction: abs(0),
                bullet: { actions: [{ op: 'changeSpeed', speed: '$1 + 2' }] },
              },
            ],
          },
        ],
        bullets: [
          { id: 'speed-by-param', actions: [{ op: 'changeSpeed', speed: '$1 + 1' }] },
          {
            id: 'turn-by-param',
            direction: abs('$1'),
            actions: [{ op: 'changeDirection', direction: abs('$1 + 256') }],
          },
        ],
      },
    },
  ]);
  expect(issues).toEqual([]);
  return db;
})();

/**
 * A world with the ship alive at the left, invulnerable.
 *
 * @returns The world.
 */
function arena(): World {
  const w = createWorld(resolveGameConfig({ seed: 5 }), DB);
  const input = createInputSnapshot();
  for (let i = 0; i < 50; i++) stepWorld(w, input);
  w.players[0].x = 60;
  w.players[0].y = 130;
  w.players[0].invulnTicks = 1e9;
  return w;
}

/**
 * Runs one pattern on emitter 0 until its end, then `ticks` world ticks (bullet programs run).
 *
 * @param w - The world.
 * @param id - Action id.
 * @param ticks - World ticks after the emitter ran.
 */
function run(w: World, id: string, ticks = 2): void {
  const vm = w.patterns;
  expect(vm.startEmitter(0, DB.patterns.actionIndex.get(id) ?? -1)).toBe(true);
  expect(vm.stepEmitter(0, { x: w.camera.x + 200, y: 100 }, true)).toBe(-1);
  const input = createInputSnapshot();
  for (let t = 0; t < ticks; t++) stepWorld(w, input);
}

/**
 * The bullets' values of one field, in pool order.
 *
 * @param w - The world.
 * @param field - Field name.
 * @returns The values.
 */
function field(w: World, field: 'speed' | 'angle'): number[] {
  const values: number[] = [];
  for (let i = 0; i < w.bullets.count; i++) values.push(w.bullets.pool.fields[field][i]);
  return values;
}

describe('core/patterns DSL — params are values', () => {
  it('(a) a bulletRef param `$i` gives each bullet the caller’s loop index', () => {
    const w = arena();
    const scale = w.bullets.speedScale;
    run(w, 'index-to-bullet');
    expect(w.bullets.count).toBe(3);
    expect(field(w, 'speed').map((v) => v / scale)).toEqual([1, 2, 3]);
  });

  it('(b) an actionRef param `$i` is the caller’s index inside the action’s own repeat', () => {
    const w = arena();
    run(w, 'index-to-action', 0);
    expect(field(w, 'angle')).toEqual([0, 0, 100, 100, 200, 200]);
  });

  it('(c) a `$rand` param is drawn once, however often it is used', () => {
    const w = arena();
    const before = w.rng.gameplay.getState();
    run(w, 'rand-twice', 0);
    const [a, b] = field(w, 'angle');
    expect(w.bullets.count).toBe(2);
    expect(a).toBe(b);
    expect(a > 0 && a < 100).toBe(true);
    // Exactly one draw: a fresh world drawing once lands on the same state.
    const check = arena();
    expect(check.rng.gameplay.getState()).toEqual(before);
    check.rng.gameplay.nextFloat();
    expect(check.rng.gameplay.getState()).toEqual(w.rng.gameplay.getState());
  });

  it('hands a bulletRef’s param values to the bullet: its direction and its program agree', () => {
    const w = arena();
    run(w, 'rand-to-bullet', 0);
    expect(w.bullets.count).toBe(1);
    const fired = field(w, 'angle')[0];
    expect(fired > 0 && fired < 100).toBe(true);
    const runner = w.bullets.pool.fields.runner[0] - 1;
    expect(runner).toBeGreaterThanOrEqual(MAX_PATTERN_EMITTERS);
    expect(w.patterns.runners.locals[runner * MAX_PATTERN_LOCALS]).toBe(fired);
    stepWorld(w, createInputSnapshot());
    stepWorld(w, createInputSnapshot());
    expect(field(w, 'angle')[0]).toBe(fired + 256);
  });

  it('an inline bullet’s program reads the enclosing reference’s param value', () => {
    const w = arena();
    const scale = w.bullets.speedScale;
    run(w, 'index-to-inline');
    expect(field(w, 'speed').map((v) => v / scale)).toEqual([2, 3]);
  });

  it('hashes the locals of the runners in use', () => {
    const w = arena();
    run(w, 'rand-to-bullet', 0);
    const runner = w.bullets.pool.fields.runner[0] - 1;
    const before = hashWorld(w);
    w.patterns.runners.locals[runner * MAX_PATTERN_LOCALS + 3] += 1;
    expect(hashWorld(w)).not.toBe(before);
    w.patterns.runners.locals[runner * MAX_PATTERN_LOCALS + 3] -= 1;
    expect(hashWorld(w)).toBe(before);
  });
});

/**
 * Edge cases of the runner's advanced stage systems (plan M2-07, `core/stage`):
 *
 * - holds: a one-tick hold, a hold key at x 0, two holds in a row, a hold before a lock, a
 *   restart or jump during a hold forgetting it, a jump onto / past a hold key, a brake that
 *   starts and ends inside a hold, a diagonal pan that waits while the camera holds, a 16 px/tick
 *   section stopping exactly at a hold with the events beyond it waiting;
 * - diagonal pans: upward pans, a lock freezing the pan until the unlock, a timed pan key
 *   cancelling a running diagonal one, `jumpTo` inside a pan matching live play;
 * - branches: branch-gated `flag` events feeding later branches (live and on restart), a
 *   branch-gated trigger that never arms, `eventActive` out of range, `setFlag` with every kind of
 *   bad id and bit 31;
 * - triggers: overlapping regions firing together, a trigger clearing its flag, NaN probes, the
 *   `until` boundary (armed while `camera.x ≤ until`, in live play and after a restart — the
 *   restart fix of the test pass), a trigger at exactly the restart x armed again as on arrival,
 *   fired triggers ahead of a restart forgotten, and the timeline order of a restored trigger's
 *   flag against later `flag` events.
 */
import { describe, expect, it } from 'vitest';
import { loadContent, type StageSpec } from '../../src/data/index.js';
import {
  StageEventCode,
  StageSlot,
  createStageRunner,
  type StageHooks,
  type StageRunner,
} from '../../src/stage/index.js';

/**
 * Loads one stage body over a minimal valid stage (no tilemap).
 *
 * @param body - Stage fields.
 * @returns The stage (asserted issue-free).
 */
function stage(body: Record<string, unknown>): StageSpec {
  const { db, issues } = loadContent([
    {
      path: 'stages/s.stage.json',
      data: {
        formatVersion: 1,
        kind: 'stage',
        id: 's',
        name: 'S',
        music: { stage: 'Stage', boss: 'Boss' },
        length: 2000,
        camera: [{ x: 0, speed: 1 }],
        checkpoints: [],
        parallax: [],
        tilemap: null,
        events: [],
        ...body,
      },
    },
  ]);
  expect(issues).toEqual([]);
  return db.stages[0];
}

/** Hooks recording the index and code of every fired event, and the clears. */
function recorder(): StageHooks & { fired: number[]; codes: number[]; clears: number } {
  const hooks = {
    fired: [] as number[],
    codes: [] as number[],
    clears: 0,
    event(code: number, _event: unknown, index: number) {
      hooks.fired.push(index);
      hooks.codes.push(code);
    },
    clear() {
      hooks.clears++;
    },
  };
  return hooks;
}

/**
 * Ticks a runner.
 *
 * @param r - The runner.
 * @param n - Ticks.
 */
function tick(r: StageRunner, n: number): void {
  for (let i = 0; i < n; i++) r.tick();
}

/**
 * The camera x after each of `n` ticks.
 *
 * @param r - The runner.
 * @param n - Ticks.
 * @returns The positions.
 */
function xs(r: StageRunner, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    r.tick();
    out.push(r.camera.x);
  }
  return out;
}

describe('core/stage holds — edges', () => {
  it('holds a single tick with hold 1', () => {
    const r = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 2 },
          { x: 10, speed: 2, hold: 1 },
        ],
      }),
      recorder(),
    );
    tick(r, 5);
    expect(r.camera.x).toBe(10);
    expect(xs(r, 3)).toEqual([10, 12, 14]);
  });

  it('holds from the stage start with a hold key at x 0', () => {
    const r = createStageRunner(stage({ camera: [{ x: 0, speed: 2, hold: 3 }] }), recorder());
    expect(xs(r, 5)).toEqual([0, 0, 0, 2, 4]);
    expect(r.speed).toBe(2);
  });

  it('holds twice in a row and stops at a lock after a hold', () => {
    const r = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 4 },
          { x: 10, speed: 4, hold: 2 },
          { x: 14, speed: 4, hold: 2 },
          { x: 30, speed: 4, lock: true },
        ],
      }),
      recorder(),
    );
    // 4, 8, 10 (clamped), hold ×2, 14 (clamped), hold ×2, 18, 22, 26, 30 (the lock).
    expect(xs(r, 13)).toEqual([4, 8, 10, 10, 10, 14, 14, 14, 18, 22, 26, 30, 30]);
    tick(r, 20);
    expect([r.camera.x, r.locked, r.holding]).toEqual([30, true, false]);
    r.unlock();
    r.tick();
    expect(r.camera.x).toBe(34);
  });

  it('forgets a running hold on a restart or a jump', () => {
    const s = stage({
      camera: [
        { x: 0, speed: 2 },
        { x: 100, speed: 3, hold: 60 },
      ],
      checkpoints: [{ x: 0 }],
    });
    const r = createStageRunner(s, recorder());
    tick(r, 55);
    expect(r.holding).toBe(true);
    r.restartAt(0);
    expect([r.holding, r.state[StageSlot.Hold], r.camera.x]).toEqual([false, 0, 0]);
    tick(r, 55);
    expect(r.holding).toBe(true);
    r.jumpTo(40);
    expect(r.holding).toBe(false);
    r.tick();
    expect(r.camera.x).toBe(42);
  });

  it('holds after a jump onto the hold key; a jump past it scrolls at the key speed', () => {
    const s = stage({
      camera: [
        { x: 0, speed: 2 },
        { x: 100, speed: 3, hold: 5 },
      ],
    });
    const on = createStageRunner(s, recorder());
    on.jumpTo(100);
    expect(xs(on, 6)).toEqual([100, 100, 100, 100, 100, 103]);
    const past = createStageRunner(s, recorder());
    past.jumpTo(150);
    expect([past.speed, past.holding]).toEqual([3, false]);
    expect(xs(past, 2)).toEqual([153, 156]);
  });

  it('scrolls at the key speed when a brake starts and ends inside the hold', () => {
    const r = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 2 },
          { x: 100, speed: 3, hold: 20 },
        ],
      }),
      recorder(),
    );
    tick(r, 52); // held since tick 51
    r.brake(0);
    tick(r, 5);
    expect([r.locked, r.holding]).toEqual([true, true]);
    r.unlock();
    // Still inside the hold: the camera stays until it ends, then the key's speed applies.
    const out = xs(r, 14);
    expect(out.slice(0, 13)).toEqual(new Array<number>(13).fill(100));
    expect(out[13]).toBe(103);
    expect(r.speed).toBe(3);
  });

  it('lets a diagonal pan wait while the camera holds', () => {
    const r = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 2, yTo: 40, yOver: 40 },
          { x: 20, speed: 2, hold: 10 },
        ],
      }),
      recorder(),
    );
    tick(r, 10); // x 20: halfway
    expect([r.camera.x, r.camera.y]).toEqual([20, 20]);
    tick(r, 10);
    expect([r.camera.x, r.camera.y]).toEqual([20, 20]);
    tick(r, 1); // the hold is over: the pan goes on with the scroll
    expect([r.camera.x, r.camera.y]).toEqual([22, 22]);
    tick(r, 10);
    expect([r.camera.x, r.camera.y]).toEqual([42, 40]);
    expect(r.state[StageSlot.PanOver]).toBe(0);
  });

  it('stops a 16 px/tick section exactly at a hold; events beyond it wait for the hold', () => {
    const hooks = recorder();
    const r = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 16 },
          { x: 100, speed: 16, hold: 10 },
        ],
        events: [
          { x: 99, type: 'music', cue: 'Boss' },
          { x: 100, type: 'music', cue: 'Stage' },
          { x: 101, type: 'music', cue: 'Title' },
        ],
      }),
      hooks,
    );
    expect(xs(r, 7)).toEqual([16, 32, 48, 64, 80, 96, 100]);
    expect(hooks.fired).toEqual([0, 1]);
    tick(r, 10);
    expect(hooks.fired).toEqual([0, 1]);
    r.tick();
    expect([r.camera.x, hooks.fired]).toEqual([116, [0, 1, 2]]);
  });
});

describe('core/stage diagonal pans — edges', () => {
  it('pans upward as well as downward', () => {
    const r = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 1, yTo: 80 },
          { x: 10, speed: 1, yTo: 0, yOver: 40 },
        ],
      }),
      recorder(),
    );
    tick(r, 10);
    expect(r.camera.y).toBe(80);
    tick(r, 21); // x 31: 21 of 40 px in
    expect(r.camera.y).toBeCloseTo(80 - 80 * (21 / 40), 9);
    expect(r.camera.dy).toBeCloseTo(-2, 9);
    tick(r, 30);
    expect(r.camera.y).toBe(0);
  });

  it('freezes the pan while locked and resumes it after the unlock', () => {
    const r = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 1, yTo: 100, yOver: 100 },
          { x: 50, speed: 1, lock: true },
        ],
      }),
      recorder(),
    );
    tick(r, 60);
    expect([r.camera.x, r.camera.y, r.locked]).toEqual([50, 50, true]);
    expect(r.camera.dy).toBe(0);
    r.unlock();
    r.tick();
    expect(r.camera.y).toBeCloseTo(51, 9);
    tick(r, 60);
    expect(r.camera.y).toBe(100);
  });

  it('cancels a running diagonal pan with a timed pan key (live and on a restart)', () => {
    const s = stage({
      camera: [
        { x: 0, speed: 1, yTo: 100, yOver: 200 },
        { x: 50, speed: 1, yTo: 10, yTicks: 1 },
      ],
      checkpoints: [{ x: 150 }],
    });
    const live = createStageRunner(s, recorder());
    tick(live, 52);
    expect(live.camera.y).toBe(10);
    expect(live.state[StageSlot.PanOver]).toBe(0);
    tick(live, 100);
    expect(live.camera.y).toBe(10); // the diagonal pan never comes back
    const r = createStageRunner(s, recorder());
    r.restartAt(0);
    expect([r.camera.y, r.state[StageSlot.PanOver]]).toEqual([10, 0]);
  });

  it('matches live play after a jump inside a diagonal pan (fractional x included)', () => {
    const s = stage({
      camera: [
        { x: 0, speed: 0.75, yTo: 80 },
        { x: 30, speed: 0.75, yTo: 20, yOver: 90 },
      ],
    });
    const live = createStageRunner(s, recorder());
    while (live.camera.x < 60) live.tick();
    const r = createStageRunner(s, recorder());
    r.jumpTo(live.camera.x);
    expect(r.camera.y).toBeCloseTo(live.camera.y, 9);
    for (let i = 0; i < 200; i++) {
      live.tick();
      r.tick();
      expect(r.camera.y).toBeCloseTo(live.camera.y, 9);
    }
    expect(r.camera.y).toBe(20);
  });
});

describe('core/stage branches — edges', () => {
  const chained = (): StageSpec =>
    stage({
      branches: [
        { id: 'a', flag: 'first' },
        { id: 'b', flag: 'second' },
      ],
      checkpoints: [{ x: 100 }],
      events: [
        { x: 10, type: 'flag', flag: 'first' },
        { x: 20, type: 'flag', flag: 'second', branch: 'a' },
        { x: 30, type: 'music', cue: 'Boss', branch: 'b' },
        { x: 40, type: 'flag', flag: 'first', value: false },
        { x: 50, type: 'flag', flag: 'second', value: false, branch: 'a' },
        { x: 60, type: 'music', cue: 'Title', branch: 'b' },
      ],
    });

  it('lets a branch-gated flag event feed a later branch (and not once its branch is gone)', () => {
    const s = chained();
    const hooks = recorder();
    const r = createStageRunner(s, hooks);
    tick(r, 70);
    // 50 is skipped (branch a gone by then), so "second" stays set and 60 fires.
    expect(hooks.fired).toEqual([0, 1, 2, 3, 5]);
    expect(r.flags).toBe(2); // second only
    const restarted = createStageRunner(s, recorder());
    restarted.restartAt(0);
    expect(restarted.flags).toBe(r.flags);
  });

  it('never arms a trigger whose branch is not taken', () => {
    const hooks = recorder();
    const r = createStageRunner(
      stage({
        branches: [{ id: 'b', flag: 'gate' }],
        events: [
          {
            x: 5,
            type: 'trigger',
            flag: 'hit',
            region: { x: 0, y: 0, w: 500, h: 500 },
            branch: 'b',
          },
        ],
      }),
      hooks,
    );
    tick(r, 10);
    expect([r.triggersArmed, hooks.fired]).toEqual([0, []]);
    expect(r.probe({ x: 10, y: 10 })).toBe(0);
  });

  it('answers true for events out of range and events without a branch', () => {
    const r = createStageRunner(
      stage({ events: [{ x: 5, type: 'music', cue: 'Boss' }] }),
      recorder(),
    );
    expect([r.eventActive(0), r.eventActive(1), r.eventActive(-1)]).toEqual([true, true, true]);
  });

  it('ignores bad flag ids and handles bit 31', () => {
    const r = createStageRunner(stage({}), recorder());
    for (const id of [-1, 32, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) r.setFlag(id, true);
    expect(r.flags).toBe(0);
    r.setFlag(31, true);
    expect(r.flags).toBe(2 ** 31);
    r.setFlag(0, true);
    expect(r.flags).toBe(2 ** 31 + 1);
    r.setFlag(31, false);
    expect(r.flags).toBe(1);
  });
});

describe('core/stage region triggers — edges', () => {
  it('fires every armed trigger whose region holds the point, and can clear a flag', () => {
    const r = createStageRunner(
      stage({
        events: [
          { x: 0, type: 'flag', flag: 'on' },
          {
            x: 0,
            type: 'trigger',
            flag: 'on',
            value: false,
            region: { x: 0, y: 0, w: 100, h: 100 },
          },
          { x: 0, type: 'trigger', flag: 'b', region: { x: 50, y: 50, w: 100, h: 100 } },
          { x: 0, type: 'trigger', flag: 'c', region: { x: 400, y: 0, w: 10, h: 10 } },
        ],
      }),
      recorder(),
    );
    // Flags are numbered in name order: b 0, c 1, on 2.
    expect(r.stage.flagNames).toEqual(['b', 'c', 'on']);
    r.tick();
    expect([r.triggersArmed, r.flags]).toEqual([7, 4]);
    expect(r.probe({ x: Number.NaN, y: 60 })).toBe(0);
    expect(r.probe({ x: 60, y: Number.NaN })).toBe(0);
    expect(r.probe({ x: 60, y: 60 })).toBe(2);
    // "on" cleared, "b" set; the third still armed.
    expect([r.flags, r.triggersArmed, r.triggersFired]).toEqual([1, 4, 3]);
    expect(r.probe({ x: 60, y: 60 })).toBe(0);
  });

  it('stays armed while camera.x ≤ until — and a restart at x = until re-arms it too', () => {
    // A hold at x 200 = until: the camera stands on the boundary for 30 ticks.
    const s = stage({
      camera: [
        { x: 0, speed: 2 },
        { x: 200, speed: 2, hold: 30 },
      ],
      checkpoints: [{ x: 200 }],
      events: [{ x: 10, type: 'trigger', flag: 'f', region: { x: 150, y: 0, w: 50, h: 50 } }],
    });
    const live = createStageRunner(s, recorder());
    tick(live, 110);
    expect([live.camera.x, live.holding, live.triggersArmed]).toEqual([200, true, 1]);
    const r = createStageRunner(s, recorder());
    r.restartAt(0);
    expect(r.camera.x).toBe(200);
    expect(r.triggersArmed).toBe(live.triggersArmed);
    r.tick(); // the hold applies: the camera stays on the boundary, still armed
    expect([r.holding, r.triggersArmed]).toEqual([true, 1]);
    expect(r.probe({ x: 199, y: 10 })).toBe(1);
    expect(r.flags).toBe(1);
    // A jump past the boundary does not arm it.
    r.jumpTo(201);
    expect(r.triggersArmed).toBe(0);
  });

  it('arms a trigger at exactly the restart x again, as on arrival (its outcome replayed)', () => {
    const s = stage({
      camera: [{ x: 0, speed: 2 }],
      checkpoints: [{ x: 20 }],
      events: [{ x: 20, type: 'trigger', flag: 'f', region: { x: 300, y: 0, w: 50, h: 50 } }],
    });
    const hooks = recorder();
    const r = createStageRunner(s, hooks);
    tick(r, 20);
    expect(r.probe({ x: 310, y: 10 })).toBe(1);
    expect([r.flags, r.triggersFired]).toEqual([1, 1]);
    r.restartAt(0);
    // The region lies ahead: the ship gets to choose again.
    expect([r.flags, r.triggersFired, r.triggersArmed]).toEqual([0, 0, 1]);
    r.tick();
    expect(hooks.codes.slice(-1)).toEqual([StageEventCode.Trigger]); // re-fired for the hooks
    expect(r.triggersArmed).toBe(1);
  });

  it('forgets fired triggers ahead of the restart x (their flag cleared)', () => {
    const s = stage({
      camera: [{ x: 0, speed: 2 }],
      checkpoints: [{ x: 10 }],
      events: [{ x: 20, type: 'trigger', flag: 'f', region: { x: 0, y: 0, w: 500, h: 50 } }],
    });
    const r = createStageRunner(s, recorder());
    tick(r, 12);
    r.probe({ x: 30, y: 10 });
    expect([r.flags, r.triggersFired]).toEqual([1, 1]);
    r.restartAt(0);
    expect([r.flags, r.triggersFired, r.triggersArmed]).toEqual([0, 0, 0]);
    tick(r, 6);
    expect(r.triggersArmed).toBe(1);
    expect(r.probe({ x: 30, y: 10 })).toBe(1);
  });

  it('applies a restored trigger flag at its place in the timeline (later flag events win)', () => {
    const s = stage({
      camera: [{ x: 0, speed: 2 }],
      checkpoints: [{ x: 100 }],
      events: [
        { x: 10, type: 'trigger', flag: 'f', region: { x: 0, y: 0, w: 2000, h: 50 }, until: 2000 },
        { x: 50, type: 'flag', flag: 'f', value: false },
      ],
    });
    // Fired after the flag event cleared it: live play ends with f set.
    const late = createStageRunner(s, recorder());
    tick(late, 30);
    late.probe({ x: 70, y: 10 });
    expect(late.flags).toBe(1);
    late.restartAt(0);
    // The restart replays the trigger at x 10, then the clear at 50: f clear (the documented
    // approximation of when the trigger fired).
    expect([late.flags, late.triggersFired, late.triggersArmed]).toEqual([0, 1, 0]);
  });
});

/**
 * The advanced stage systems of the runner (plan M2-07): timed scroll stops (`hold` keys — the
 * vertical sections), diagonal pans (`yOver`), high-speed sections, in-stage branches (events
 * gated by a flag's value) and region triggers (armed by the timeline, fired by a probing ship,
 * disarmed behind the camera), including what a checkpoint restart re-derives of each.
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
import { measureHeapGrowth } from '../helpers/alloc.js';

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

/** Hooks recording the index of every fired event, and the clears. */
function recorder(): StageHooks & { fired: number[]; clears: number } {
  const hooks = {
    fired: [] as number[],
    clears: 0,
    event(_code: number, _event: unknown, index: number) {
      hooks.fired.push(index);
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

describe('core/stage — hold keys (timed scroll stops)', () => {
  it('stops exactly at the key, stays `hold` ticks, then scrolls on at the key speed', () => {
    const r = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 2 },
          { x: 100, speed: 3, hold: 30 },
        ],
      }),
      recorder(),
    );
    tick(r, 50);
    expect(r.camera.x).toBe(100);
    expect(r.holding).toBe(false);
    const xs: number[] = [];
    for (let i = 0; i < 31; i++) {
      r.tick();
      xs.push(r.camera.x);
      if (i < 29) expect(r.holding).toBe(true);
    }
    // 30 still ticks (the key applies on the first), then 3 px a tick.
    expect(xs.slice(0, 30)).toEqual(new Array<number>(30).fill(100));
    expect(xs[30]).toBe(103);
    expect(r.holding).toBe(false);
    expect(r.speed).toBe(3);
  });

  it('stops exactly at the hold key even when one tick would cross it', () => {
    const r = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 7 },
          { x: 100, speed: 1, hold: 5, ramp: 4 },
        ],
      }),
      recorder(),
    );
    tick(r, 15);
    expect(r.camera.x).toBe(100);
    tick(r, 5);
    expect(r.camera.x).toBe(100);
    // The key's ramp starts when the hold ends: 0.25, 0.5, 0.75, 1 px.
    const xs: number[] = [];
    for (let i = 0; i < 4; i++) {
      r.tick();
      xs.push(r.camera.x);
    }
    expect(xs).toEqual([100.25, 100.75, 101.5, 102.5]);
  });

  it('pans vertically while it holds (a vertical section)', () => {
    const r = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 2 },
          { x: 100, speed: 2, hold: 40, yTo: 64, yTicks: 20 },
        ],
      }),
      recorder(),
    );
    tick(r, 50);
    tick(r, 20);
    expect([r.camera.x, r.camera.y]).toEqual([100, 64]);
    tick(r, 20);
    expect(r.camera.x).toBe(100);
    r.tick();
    expect(r.camera.x).toBe(102);
    expect(r.camera.y).toBe(64);
  });

  it('holds again after a restart at its checkpoint; not after one past it', () => {
    const s = stage({
      camera: [
        { x: 0, speed: 2 },
        { x: 100, speed: 2, hold: 10 },
      ],
      checkpoints: [{ x: 100 }, { x: 200 }],
    });
    const r = createStageRunner(s, recorder());
    r.restartAt(0);
    r.tick();
    expect([r.camera.x, r.holding]).toEqual([100, true]);
    tick(r, 9);
    expect(r.holding).toBe(false);
    r.tick();
    expect(r.camera.x).toBe(102);
    r.restartAt(1);
    r.tick();
    expect([r.camera.x, r.holding]).toEqual([202, false]);
  });

  it('waits for the unlock when a brake holds the camera as the hold ends', () => {
    const r = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 2 },
          { x: 100, speed: 3, hold: 4 },
        ],
      }),
      recorder(),
    );
    tick(r, 51);
    r.brake(0);
    tick(r, 10);
    expect([r.camera.x, r.locked]).toEqual([100, true]);
    expect(r.state[StageSlot.ResumeSpeed]).toBe(3);
    r.unlock();
    r.tick();
    expect(r.camera.x).toBe(103);
  });
});

describe('core/stage — diagonal pans and high speed', () => {
  it('moves y linearly with the scroll x over `yOver` pixels, whatever the speed', () => {
    const r = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 2 },
          { x: 100, speed: 2, yTo: 60, yOver: 120 },
        ],
        events: [{ x: 150, type: 'speed', speed: 0.5 }],
      }),
      recorder(),
    );
    tick(r, 50);
    expect(r.camera.y).toBe(0);
    for (let i = 0; i < 200; i++) {
      r.tick();
      const x = r.camera.x;
      expect(r.camera.y).toBeCloseTo(x >= 220 ? 60 : ((x - 100) * 60) / 120, 9);
    }
    expect(r.state[StageSlot.PanOver]).toBe(0);
  });

  it('resumes a diagonal pan where live play had it after a restart inside it', () => {
    const body = {
      camera: [
        { x: 0, speed: 2 },
        { x: 100, speed: 2, yTo: 60, yOver: 120 },
      ],
      checkpoints: [{ x: 160 }],
    };
    const r = createStageRunner(stage(body), recorder());
    r.restartAt(0);
    expect([r.camera.x, r.camera.y]).toEqual([160, 30]);
    r.tick();
    expect(r.camera.x).toBe(162);
    expect(r.camera.y).toBeCloseTo(31, 9);
    tick(r, 40);
    expect(r.camera.y).toBe(60);
  });

  it('runs a high-speed section: every event fires once, in order, even several per tick', () => {
    const events = [];
    for (let x = 10; x <= 400; x += 5) events.push({ x, type: 'flag', flag: 'f' });
    const hooks = recorder();
    const r = createStageRunner(
      stage({ camera: [{ x: 0, speed: 12, ramp: 0 }], events, length: 410 }),
      hooks,
    );
    tick(r, 40);
    expect(hooks.fired).toEqual(events.map((_e, i) => i));
    expect(r.camera.x).toBe(410); // never past the end
  });
});

describe('core/stage — branches', () => {
  const branchStage = (flagValue: boolean | null): StageSpec =>
    stage({
      branches: [
        { id: 'upper', flag: 'route' },
        { id: 'lower', flag: 'route', value: false },
      ],
      events: [
        ...(flagValue === null ? [] : [{ x: 10, type: 'flag', flag: 'route', value: flagValue }]),
        { x: 50, type: 'music', cue: 'Boss', branch: 'upper' },
        { x: 50, type: 'music', cue: 'Stage', branch: 'lower' },
        { x: 60, type: 'music', cue: 'Title' },
      ],
    });

  it('fires only the events of the branch the flag selects', () => {
    for (const [value, expected] of [
      [true, [0, 1, 3]],
      [false, [0, 2, 3]],
      [null, [1, 2]],
    ] as const) {
      const s = branchStage(value);
      const hooks = recorder();
      const r = createStageRunner(s, hooks);
      tick(r, 100);
      expect(hooks.fired, String(value)).toEqual(expected);
      expect(r.eventCursor).toBe(s.events.length);
    }
  });

  it('resolves branch ids and flags at load; eventActive follows the flag', () => {
    const s = branchStage(null);
    expect(s.branches).toEqual([
      { id: 'upper', flag: 'route', flagId: 0, value: true },
      { id: 'lower', flag: 'route', flagId: 0, value: false },
    ]);
    expect(s.flagNames).toEqual(['route']);
    expect(s.events.map((e) => e.branchId)).toEqual([0, 1, -1]);
    const r = createStageRunner(s, recorder());
    expect([r.eventActive(0), r.eventActive(1), r.eventActive(2)]).toEqual([false, true, true]);
    r.setFlag(0, true);
    expect([r.eventActive(0), r.eventActive(1)]).toEqual([true, false]);
    expect(r.flags).toBe(1);
    r.setFlag(0, false);
    r.setFlag(40, true); // out of range: nothing
    r.setFlag(0.5, true);
    expect(r.flags).toBe(0);
  });

  it('re-derives the branches taken when restarting past them', () => {
    const s = stage({
      branches: [{ id: 'fast', flag: 'fast' }],
      events: [
        { x: 10, type: 'flag', flag: 'fast' },
        { x: 20, type: 'speed', speed: 4, branch: 'fast' },
        { x: 30, type: 'flag', flag: 'fast', value: false },
        { x: 40, type: 'speed', speed: 9, branch: 'fast' },
      ],
      checkpoints: [{ x: 100 }],
    });
    const r = createStageRunner(s, recorder());
    r.restartAt(0);
    // The taken speed event applies, the one skipped (the flag was cleared by then) does not.
    expect([r.speed, r.flags]).toEqual([4, 0]);
  });
});

describe('core/stage — region triggers', () => {
  const triggerStage = (until?: number): StageSpec =>
    stage({
      branches: [
        { id: 'low', flag: 'took-low' },
        { id: 'high', flag: 'took-low', value: false },
      ],
      camera: [{ x: 0, speed: 2 }],
      checkpoints: [{ x: 150 }, { x: 400 }],
      events: [
        {
          x: 20,
          type: 'trigger',
          flag: 'took-low',
          region: { x: 200, y: 150, w: 40, h: 20 },
          ...(until === undefined ? {} : { until }),
        },
        { x: 300, type: 'music', cue: 'Boss', branch: 'low' },
        { x: 300, type: 'music', cue: 'Stage', branch: 'high' },
      ],
    });

  it('arms at its x, fires once for a point inside its region, then disarms', () => {
    const s = triggerStage();
    expect(s.events[0]).toMatchObject({ flagId: 0, type: 'trigger' });
    const hooks = recorder();
    const r = createStageRunner(s, hooks);
    expect(r.probe({ x: 210, y: 160 })).toBe(0); // not armed yet
    tick(r, 10);
    expect([r.triggersArmed, hooks.fired]).toEqual([1, [0]]);
    expect(r.probe({ x: 199.9, y: 160 })).toBe(0); // left of the region
    expect(r.probe({ x: 240, y: 160 })).toBe(0); // the right edge is outside
    expect(r.probe({ x: 210, y: 170 })).toBe(0); // so is the bottom edge
    expect(r.probe({ x: 200, y: 150 })).toBe(1); // the top-left corner is inside
    expect([r.triggersArmed, r.triggersFired, r.flags]).toEqual([0, 1, 1]);
    expect(r.probe({ x: 210, y: 160 })).toBe(0);
    tick(r, 150);
    // The branch the trigger chose fires.
    expect(hooks.fired).toEqual([0, 1]);
  });

  it('disarms once the camera passes its `until` (default: the region gone by)', () => {
    const r = createStageRunner(triggerStage(), recorder());
    tick(r, 120); // x 240
    expect(r.triggersArmed).toBe(1);
    r.tick(); // x 242 > 240
    expect(r.triggersArmed).toBe(0);
    expect(r.probe({ x: 210, y: 160 })).toBe(0);
    const early = createStageRunner(triggerStage(60), recorder());
    tick(early, 31); // x 62
    expect(early.triggersArmed).toBe(0);
  });

  it('keeps a fired trigger across a restart behind it; re-arms an unfired one still ahead', () => {
    const s = triggerStage();
    const fired = createStageRunner(s, recorder());
    tick(fired, 20);
    fired.probe({ x: 210, y: 160 });
    tick(fired, 60); // past checkpoint 0 (x 150)
    fired.restartAt(0);
    expect([fired.flags, fired.triggersFired, fired.triggersArmed]).toEqual([1, 1, 0]);
    const unfired = createStageRunner(s, recorder());
    tick(unfired, 80);
    unfired.restartAt(0);
    // x 150 < until 240: armed again, the flag clear.
    expect([unfired.flags, unfired.triggersFired, unfired.triggersArmed]).toEqual([0, 0, 1]);
    unfired.restartAt(1);
    // x 400 is past its until: not armed.
    expect(unfired.triggersArmed).toBe(0);
    unfired.restartAt(-1);
    expect(unfired.triggersArmed).toBe(0); // the stage start: armed again on its x
    tick(unfired, 10);
    expect(unfired.triggersArmed).toBe(1);
  });

  it('reports trigger and block events to the hooks with their codes', () => {
    expect([StageEventCode.Trigger, StageEventCode.Block]).toEqual([8, 9]);
    const codes: number[] = [];
    const r = createStageRunner(triggerStage(), {
      event(code) {
        codes.push(code);
      },
      clear() {},
    });
    tick(r, 10);
    expect(codes).toEqual([StageEventCode.Trigger]);
  });

  it('ticks and probes without allocating', () => {
    const s = stage({
      camera: [
        { x: 0, speed: 1.5 },
        { x: 300, speed: 1.25, hold: 20, yTo: 40, yTicks: 10 },
        { x: 600, speed: 1.5, yTo: 0, yOver: 200 },
      ],
      checkpoints: [{ x: 0 }, { x: 500 }],
      branches: [{ id: 'b', flag: 'g' }],
      events: [
        { x: 100, type: 'trigger', flag: 'g', region: { x: 400, y: 0, w: 900, h: 300 } },
        { x: 700, type: 'flag', flag: 'g', value: false, branch: 'b' },
        { x: 900, type: 'end' },
      ],
    });
    const r = createStageRunner(s, { event() {}, clear() {} });
    const ship = { x: 0, y: 100 };
    const growth = measureHeapGrowth(
      (i) => {
        if (i % 700 === 699) r.restartAt(i % 1400 === 699 ? 0 : 1);
        r.tick();
        ship.x = r.camera.x + 64.5;
        r.probe(ship);
      },
      10_000,
      10_000,
    );
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});

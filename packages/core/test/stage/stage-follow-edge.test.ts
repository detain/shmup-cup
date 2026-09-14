/**
 * Edge cases of the runner's camera follow (plan M2-09 — a raid's camera path), beyond
 * `stage-follow.test.ts`: region triggers stay armed while a pan passes their `until` and disarm
 * once the timeline gets there; a diagonal pan (`yOver`) gives way to the target's y and takes over
 * again from where the camera is handed back; a pan to the left of where the follow began changes
 * nothing of the timeline (no checkpoint lost); the x the timeline waits at is taken afresh by a
 * follow after a checkpoint restart; `follow(null)` without a target is harmless.
 */
import { describe, expect, it } from 'vitest';
import { loadContent, type StageSpec } from '../../src/data/index.js';
import { createStageRunner, type StageHooks, type StageRunner } from '../../src/stage/index.js';

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

/**
 * Hooks recording the index of every fired event.
 *
 * @returns The hooks and their log.
 */
function recorder(): StageHooks & { fired: number[] } {
  const hooks = {
    fired: [] as number[],
    event(_code: number, _event: unknown, index: number) {
      hooks.fired.push(index);
    },
    clear() {},
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

describe('core/stage — follow edges (M2-09)', () => {
  it('keeps a region trigger armed while a pan passes its `until`; it disarms on the way on', () => {
    const hooks = recorder();
    const r = createStageRunner(
      stage({
        branches: [{ id: 'low', flag: 'took-low' }],
        events: [
          {
            x: 20,
            type: 'trigger',
            flag: 'took-low',
            region: { x: 200, y: 150, w: 40, h: 20 },
          },
        ],
      }),
      hooks,
    );
    tick(r, 100);
    expect(r.triggersArmed).toBe(1);
    const target = { x: 100, y: 0 };
    r.follow(target);
    // The pan goes past the region's end (its default `until`, 240) and back.
    for (const x of [300, 500, 241, 100]) {
      target.x = x;
      r.tick();
      expect([r.camera.x, r.triggersArmed]).toEqual([x, 1]);
    }
    // Still armed: a ship inside the region fires it during the fight.
    expect(r.probe({ x: 210, y: 160 })).toBe(1);
    expect(r.flags).toBe(1);
    const again = createStageRunner(
      stage({
        branches: [{ id: 'low', flag: 'took-low' }],
        events: [
          {
            x: 20,
            type: 'trigger',
            flag: 'took-low',
            region: { x: 200, y: 150, w: 40, h: 20 },
          },
        ],
      }),
      recorder(),
    );
    tick(again, 100);
    const pan = { x: 100, y: 0 };
    again.follow(pan);
    pan.x = 400;
    again.tick();
    pan.x = 100;
    again.tick();
    again.follow(null);
    tick(again, 140); // x 240: not past it yet
    expect(again.triggersArmed).toBe(1);
    again.tick(); // x 241
    expect(again.triggersArmed).toBe(0);
  });

  it('gives a diagonal pan’s y to the target, then carries the pan on from the camera’s x', () => {
    const r = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 1 },
          { x: 50, speed: 1, yTo: 60, yOver: 120 },
        ],
      }),
      recorder(),
    );
    tick(r, 80);
    expect(r.camera.y).toBeCloseTo(15, 9);
    const target = { x: 80, y: 15 };
    r.follow(target);
    target.x = 140;
    target.y = -40;
    r.tick();
    expect([r.camera.x, r.camera.y]).toEqual([140, -40]);
    // Back where it began, handed back: the pan's y for that x again, then on along the pan.
    target.x = 80;
    target.y = 15;
    r.tick();
    r.follow(null);
    r.tick();
    expect(r.camera.x).toBe(81);
    expect(r.camera.y).toBeCloseTo(15.5, 9);
    tick(r, 100);
    expect(r.camera.y).toBe(60);
  });

  it('changes nothing of the timeline while the pan is left of where it began', () => {
    const hooks = recorder();
    const r = createStageRunner(
      stage({
        checkpoints: [{ x: 0 }, { x: 50 }],
        events: [
          { x: 30, type: 'music', cue: 'Boss' },
          { x: 120, type: 'music', cue: 'Stage' },
        ],
      }),
      hooks,
    );
    tick(r, 100);
    expect([r.checkpoint, r.eventCursor, hooks.fired]).toEqual([1, 1, [0]]);
    const target = { x: 100, y: 0 };
    r.follow(target);
    for (const x of [60, 10, -30, 100]) {
      target.x = x;
      r.tick();
      expect(r.camera.x).toBe(x);
      expect([r.checkpoint, r.eventCursor, hooks.fired]).toEqual([1, 1, [0]]);
    }
    r.follow(null);
    tick(r, 20);
    expect(hooks.fired).toEqual([0, 1]);
  });

  it('takes the x the timeline waits at afresh for a follow after a checkpoint restart', () => {
    const hooks = recorder();
    const r = createStageRunner(
      stage({
        checkpoints: [{ x: 0 }],
        events: [{ x: 50, type: 'music', cue: 'Boss' }],
      }),
      hooks,
    );
    tick(r, 200);
    expect(hooks.fired).toEqual([0]);
    const far = { x: 200, y: 0 };
    r.follow(far);
    r.tick();
    r.restartAt(0);
    expect([r.camera.x, r.following, r.eventCursor]).toEqual([0, null, 0]);
    // A new follow from the checkpoint: the event at 50 waits, though the old follow began at 200.
    const near = { x: 0, y: 0 };
    r.follow(near);
    near.x = 100;
    r.tick();
    expect(r.camera.x).toBe(100);
    expect(hooks.fired).toEqual([0]);
    near.x = 0;
    r.tick();
    r.follow(null);
    tick(r, 50);
    expect(hooks.fired).toEqual([0, 0]);
  });

  it('ignores follow(null) without a target', () => {
    const r = createStageRunner(stage({}), recorder());
    r.follow(null);
    r.follow(null);
    tick(r, 3);
    expect([r.following, r.camera.x]).toEqual([null, 3]);
  });
});

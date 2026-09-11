/**
 * Tests for the stage runtime (plan M1-07): the camera path (ramp values, pans, locks, the stage
 * end), the event cursor (every event fires exactly once at its x, in order, several on one tick),
 * checkpoints (last passed, restart cursor by binary search, re-derived speed / pan / flags,
 * `hooks.clear()`), the parallax and terrain views, and the allocation-free `tick()`.
 */
import { describe, expect, it } from 'vitest';
import { loadContent, type ContentDb, type StageSpec } from '../../src/data/index.js';
import { LayerId } from '../../src/presentation/index.js';
import {
  STAGE_STATE_SLOTS,
  StageEventCode,
  StageSlot,
  createParallaxView,
  createStageCamera,
  createStageRunner,
  createStageTerrain,
  createTerrainView,
  findEventCursor,
  moduleInfo,
  stageMapWidth,
  updateParallaxView,
  type StageHooks,
} from '../../src/stage/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

/** The shipped `terrain-a`-style tileset (solid / floor / ceiling / 45° slopes only). */
const TILESET = {
  formatVersion: 1,
  kind: 'tileset',
  id: 'rock',
  sprite: 'tiles/terrain-a',
  tileSize: 8,
  tiles: [
    { name: 'solid', type: 'solid', frame: 0, anchor: 'floor', mask: [8, 8, 8, 8, 8, 8, 8, 8] },
    { name: 'floor', type: 'solid', frame: 1, anchor: 'floor', mask: [8, 8, 8, 8, 8, 8, 8, 8] },
    {
      name: 'ceiling',
      type: 'solid',
      frame: 2,
      anchor: 'ceiling',
      mask: [8, 8, 8, 8, 8, 8, 8, 8],
    },
  ],
};

/**
 * Loads one stage body (plus the tileset above) and returns the database.
 *
 * @param body - Stage fields over a minimal valid stage.
 * @returns The DB (asserted issue-free).
 */
function stageDb(body: Record<string, unknown>): ContentDb {
  const { db, issues } = loadContent([
    {
      path: 'stages/s.stage.json',
      data: {
        formatVersion: 1,
        kind: 'stage',
        id: 's',
        name: 'S',
        music: { stage: 'Stage', boss: 'Boss' },
        length: 1000,
        camera: [{ x: 0, speed: 1 }],
        checkpoints: [],
        parallax: [],
        tilemap: null,
        events: [],
        ...body,
      },
    },
    { path: 'tilesets/rock.tileset.json', data: TILESET },
  ]);
  expect(issues).toEqual([]);
  return db;
}

/**
 * A stage spec from {@link stageDb}.
 *
 * @param body - Stage fields.
 * @returns The stage.
 */
function stage(body: Record<string, unknown>): StageSpec {
  return stageDb(body).stages[0];
}

/** Hooks that record every call. */
function recorder(): StageHooks & {
  fired: [number, number, number][];
  clears: number;
  tick: number;
} {
  const hooks = {
    fired: [] as [number, number, number][],
    clears: 0,
    tick: 0,
    event(code: number, _event: unknown, index: number) {
      hooks.fired.push([hooks.tick, code, index]);
    },
    clear() {
      hooks.clears++;
    },
  };
  return hooks;
}

describe('core/stage module', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('stage');
    expect(moduleInfo.status).toBe('implemented');
    expect(moduleInfo.specRefs).toContain('shmup_feat.md §14');
  });

  it('sizes a map to the stage length plus one screen', () => {
    expect(stageMapWidth(1000, 8)).toBe(Math.ceil(1384 / 8));
    expect(stageMapWidth(0, 8)).toBe(48);
  });
});

describe('core/stage camera path', () => {
  it('ramps the speed linearly over `ramp` ticks, exactly reaching the target', () => {
    const runner = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 2, ramp: 4 },
          { x: 100, speed: 0.5, ramp: 3 },
        ],
      }),
      recorder(),
    );
    const speeds: number[] = [];
    const xs: number[] = [];
    for (let i = 0; i < 6; i++) {
      runner.tick();
      speeds.push(runner.speed);
      xs.push(runner.camera.x);
    }
    expect(speeds).toEqual([0.5, 1, 1.5, 2, 2, 2]);
    expect(xs).toEqual([0.5, 1.5, 3, 5, 7, 9]);
    expect(runner.camera.dx).toBe(2);
    while (runner.camera.x < 100) runner.tick();
    // The key at 100 applies on the next tick, ramping from 2 down to 0.5 over 3 ticks.
    const down: number[] = [];
    for (let i = 0; i < 4; i++) {
      runner.tick();
      down.push(runner.speed);
    }
    expect(down).toEqual([1.5, 1, 0.5, 0.5]);
    expect(runner.targetSpeed).toBe(0.5);
  });

  it('applies a key without ramp at once, and a speed event from the next tick on', () => {
    const runner = createStageRunner(
      stage({
        camera: [{ x: 0, speed: 1 }],
        events: [{ x: 3, type: 'speed', speed: 3, ramp: 2 }],
      }),
      recorder(),
    );
    const xs: number[] = [];
    for (let i = 0; i < 6; i++) {
      runner.tick();
      xs.push(runner.camera.x);
    }
    expect(xs).toEqual([1, 2, 3, 5, 8, 11]);
  });

  it('pans vertically to yTo over yTicks (eased, exact at the end) and records dy', () => {
    const runner = createStageRunner(
      stage({ camera: [{ x: 0, speed: 1, yTo: 40, yTicks: 4 }] }),
      recorder(),
    );
    const ys: number[] = [];
    for (let i = 0; i < 5; i++) {
      runner.tick();
      ys.push(runner.camera.y);
    }
    expect(ys).toEqual([5, 20, 35, 40, 40]); // inOutQuad at 1/4, 2/4, 3/4
    expect(runner.camera.dy).toBe(0);
  });

  it('pans at once when yTicks is omitted', () => {
    const runner = createStageRunner(stage({ camera: [{ x: 0, speed: 0, yTo: 24 }] }), recorder());
    runner.tick();
    expect([runner.camera.y, runner.camera.dy, runner.camera.vy]).toEqual([24, 24, 24]);
  });

  it('stops exactly at a lock key, stays locked, then resumes on unlock', () => {
    const runner = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 1.5 },
          { x: 10, speed: 2, lock: true },
        ],
      }),
      recorder(),
    );
    for (let i = 0; i < 30; i++) runner.tick();
    expect(runner.camera.x).toBe(10);
    expect(runner.locked).toBe(true);
    expect(runner.camera.dx).toBe(0);
    runner.unlock();
    runner.tick();
    expect([runner.locked, runner.camera.x]).toEqual([false, 12]);
  });

  it('stops exactly at a lock key when a non-lock key lies within the same tick before it', () => {
    const runner = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 3 },
          { x: 100, speed: 3 },
          { x: 101, speed: 1, lock: true },
        ],
      }),
      recorder(),
    );
    for (let i = 0; i < 60; i++) runner.tick();
    expect([runner.camera.x, runner.locked, runner.camera.dx]).toEqual([101, true, 0]);
    runner.unlock();
    runner.tick();
    expect([runner.locked, runner.camera.x]).toEqual([false, 102]);
  });

  it('stops at a lock key several keys ahead, and not at an earlier unlocked one', () => {
    const runner = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 10, lock: true },
          { x: 4, speed: 10 },
          { x: 6, speed: 10 },
          { x: 9, speed: 2, lock: true },
        ],
      }),
      recorder(),
    );
    runner.tick();
    expect([runner.camera.x, runner.locked]).toEqual([0, true]);
    runner.unlock();
    runner.tick(); // 0 → 9: the keys at 4 and 6 do not stop it, the lock at 9 does
    expect(runner.camera.x).toBe(9);
    runner.tick();
    expect([runner.camera.x, runner.locked, runner.speed]).toEqual([9, true, 2]);
  });

  it('never scrolls past the stage length', () => {
    const runner = createStageRunner(
      stage({ length: 10, camera: [{ x: 0, speed: 3 }] }),
      recorder(),
    );
    for (let i = 0; i < 10; i++) runner.tick();
    expect(runner.camera.x).toBe(10);
    expect(runner.camera.dx).toBe(0);
  });

  it('drives a camera object it is given', () => {
    const camera = createStageCamera();
    const runner = createStageRunner(stage({}), recorder(), camera);
    runner.tick();
    expect(runner.camera).toBe(camera);
    expect(camera.x).toBe(1);
  });
});

describe('core/stage event timeline', () => {
  it('fires every event exactly once at its x, in order, several on one tick', () => {
    const hooks = recorder();
    const runner = createStageRunner(
      stage({
        camera: [{ x: 0, speed: 4 }],
        events: [
          { x: 0, type: 'music', cue: 'Stage' },
          { x: 3, type: 'flag', flag: 'a' },
          { x: 4, type: 'flag', flag: 'b' },
          { x: 4, type: 'flag', flag: 'a', value: false },
          { x: 9, type: 'end' },
          { x: 12, type: 'music', cue: 'Boss' },
        ],
      }),
      hooks,
    );
    for (let t = 0; t < 10; t++) {
      hooks.tick = t;
      runner.tick();
    }
    expect(hooks.fired).toEqual([
      [0, StageEventCode.Music, 0], // camera 4: x 0, 3, 4, 4
      [0, StageEventCode.Flag, 1],
      [0, StageEventCode.Flag, 2],
      [0, StageEventCode.Flag, 3],
      [2, StageEventCode.End, 4], // camera 12: x 9 and 12
      [2, StageEventCode.Music, 5],
    ]);
    expect(runner.eventCursor).toBe(6);
    expect(runner.ended).toBe(true);
    // flagNames are sorted: a = bit 0, b = bit 1; a was set, then cleared on the same tick.
    expect(runner.stage.flagNames).toEqual(['a', 'b']);
    expect(runner.flags).toBe(2);
  });

  it('hands the resolved event objects to the hooks', () => {
    const seen: unknown[] = [];
    const runner = createStageRunner(stage({ events: [{ x: 1, type: 'music', cue: 'Boss' }] }), {
      event(_code, event) {
        seen.push(event);
      },
      clear() {},
    });
    runner.tick();
    expect(seen).toEqual([{ x: 1, type: 'music', cue: 'Boss', cueId: 5 }]);
  });

  it('finds the cursor by binary search (first event at or after x)', () => {
    const events = stage({
      events: [
        { x: 0, type: 'end' },
        { x: 100, type: 'end' },
        { x: 100, type: 'end' },
        { x: 250, type: 'end' },
      ],
    }).events;
    expect([0, 1, 100, 101, 250, 251].map((x) => findEventCursor(events, x))).toEqual([
      0, 1, 1, 3, 3, 4,
    ]);
    expect(findEventCursor([], 5)).toBe(0);
  });
});

describe('core/stage checkpoints', () => {
  const body = {
    length: 400,
    camera: [
      { x: 0, speed: 2 },
      { x: 100, speed: 4, ramp: 10, yTo: 16, yTicks: 8 },
      { x: 300, speed: 1 },
    ],
    checkpoints: [{ x: 0 }, { x: 150 }, { x: 300 }],
    events: [
      { x: 50, type: 'flag', flag: 'mid' },
      { x: 120, type: 'speed', speed: 3 },
      { x: 150, type: 'music', cue: 'Boss' },
      { x: 150, type: 'flag', flag: 'late' },
      { x: 200, type: 'end' },
    ],
  };

  it('tracks the last checkpoint passed', () => {
    const runner = createStageRunner(stage(body), recorder());
    expect(runner.checkpoint).toBe(-1);
    runner.tick();
    expect(runner.checkpoint).toBe(0);
    while (runner.camera.x < 150) runner.tick();
    expect(runner.checkpoint).toBe(1);
  });

  it('restarts at a checkpoint: camera, cursor, speed, pan and flags, then clears', () => {
    const hooks = recorder();
    const runner = createStageRunner(stage(body), hooks);
    for (let i = 0; i < 200; i++) runner.tick();
    runner.restartAt(1);
    expect(hooks.clears).toBe(1);
    expect([runner.camera.x, runner.camera.y, runner.camera.dx]).toEqual([150, 16, 0]);
    expect(runner.eventCursor).toBe(2); // the events at exactly x 150 fire again
    expect(runner.speed).toBe(3); // key 100 (speed 4) then the speed event at 120 (3)
    // `mid` (bit 1 — names sort late, mid) was set before 150, `late` (bit 0) on arriving there.
    expect(runner.flags).toBe(3);
    expect([runner.checkpoint, runner.locked, runner.ended, runner.ticks]).toEqual([
      1,
      false,
      false,
      0,
    ]);
    hooks.fired.length = 0;
    runner.tick();
    expect(hooks.fired.map(([, code, index]) => [code, index])).toEqual([
      [StageEventCode.Music, 2],
      [StageEventCode.Flag, 3],
    ]);
    expect(runner.camera.x).toBe(153);
    expect(runner.flags).toBe(3); // re-fired for the hooks only: the restart already set `late`
  });

  it('restarts at the stage start exactly like a fresh runner', () => {
    const fresh = createStageRunner(stage(body), recorder());
    const restarted = createStageRunner(stage(body), recorder());
    for (let i = 0; i < 90; i++) restarted.tick();
    restarted.restartAt(-1);
    for (let i = 0; i < 120; i++) {
      fresh.tick();
      restarted.tick();
    }
    const state = (r: typeof fresh): number[] => {
      const s = Array.from(r.state);
      s[StageSlot.Restarts] = 0;
      return [...s, r.camera.x, r.camera.y];
    };
    expect(state(restarted)).toEqual(state(fresh));
  });

  it('restarts with the speed live play had when a key and a speed event share an x', () => {
    const tie = {
      camera: [
        { x: 0, speed: 2 },
        { x: 100, speed: 3 },
      ],
      events: [{ x: 100, type: 'speed', speed: 1 }],
      checkpoints: [{ x: 0 }, { x: 500 }],
    };
    const runner = createStageRunner(stage(tie), recorder());
    while (runner.checkpoint < 1) runner.tick();
    // Live: the event fires on the tick the camera reaches 100, the key applies one tick later.
    const live = runner.speed;
    expect(live).toBe(3);
    runner.restartAt(1);
    expect([runner.speed, runner.targetSpeed]).toEqual([live, live]);
  });

  it('continues from a checkpoint exactly as live play did past it (key + events at its x)', () => {
    const atCheckpoint = {
      length: 1000,
      camera: [
        { x: 0, speed: 2 },
        { x: 40, speed: 1 },
        { x: 100, speed: 5, ramp: 4, yTo: 12, yTicks: 3 },
        { x: 163, speed: 1 },
      ],
      // Both checkpoints are where live play lands exactly (100 = 50 · 2, 163 after the ramp).
      checkpoints: [{ x: 0 }, { x: 100 }, { x: 163 }],
      events: [
        { x: 40, type: 'speed', speed: 2 },
        { x: 100, type: 'speed', speed: 7 },
        { x: 100, type: 'flag', flag: 'here' },
        { x: 130, type: 'music', cue: 'Boss' },
        { x: 163, type: 'speed', speed: 3, ramp: 5 },
      ],
    };
    for (const cp of [1, 2]) {
      const hooks = recorder();
      const runner = createStageRunner(stage(atCheckpoint), hooks);
      while (runner.checkpoint < cp) runner.tick();
      const trace = (): number[][] => {
        hooks.fired.length = 0;
        const rows: number[][] = [];
        for (let i = 0; i < 40; i++) {
          runner.tick();
          rows.push([runner.camera.x, runner.camera.y, runner.speed, runner.flags]);
        }
        return rows;
      };
      const firedIndices = (): number[] => hooks.fired.map(([, , index]) => index);
      const live = trace();
      const liveFired = firedIndices();
      runner.restartAt(cp);
      hooks.fired.length = 0;
      runner.tick();
      // The events at exactly the checkpoint's x fire again, for the hooks.
      const again = firedIndices();
      expect(again.length).toBeGreaterThan(0);
      runner.restartAt(cp);
      expect(trace(), `checkpoint ${String(cp)}`).toEqual(live);
      expect(firedIndices().slice(again.length)).toEqual(liveFired);
    }
  });

  it('rejects checkpoint indices outside [-1, count)', () => {
    const runner = createStageRunner(stage(body), recorder());
    for (const bad of [-2, 3, 0.5, Number.NaN]) {
      expect(() => runner.restartAt(bad)).toThrow(RangeError);
    }
  });

  it('stops the tick when a hook restarts the stage mid-timeline', () => {
    let runner: ReturnType<typeof createStageRunner> | null = null;
    const fired: number[] = [];
    runner = createStageRunner(
      stage({
        camera: [{ x: 0, speed: 10 }],
        checkpoints: [{ x: 0 }],
        events: [
          { x: 5, type: 'flag', flag: 'x' },
          { x: 6, type: 'end' },
        ],
      }),
      {
        event(_code, _event, index) {
          fired.push(index);
          if (index === 0) runner?.restartAt(0);
        },
        clear() {},
      },
    );
    runner.tick();
    expect(fired).toEqual([0]);
    expect(runner.camera.x).toBe(0);
    expect(runner.eventCursor).toBe(0);
  });
});

describe('core/stage views', () => {
  it('scrolls the parallax bands by their factor and repeat distance', () => {
    const spec = stage({
      parallax: [
        { layer: 'far', sprite: 'bg/stars-far', factor: 0.25, y: 10, spacing: 128 },
        { layer: 'mid', sprite: 'bg/stars-mid', factor: 1.5, y: 0, spacing: 64 },
      ],
    });
    const view = createParallaxView(spec);
    expect(view).not.toBeNull();
    if (view === null) return;
    expect([...view.layer]).toEqual([LayerId.BgFar, LayerId.BgMid]);
    expect([...view.spacing]).toEqual([128, 64]);
    updateParallaxView(view, 600, 8);
    expect([...view.offsetX]).toEqual([(600 * 0.25) % 128, (600 * 1.5) % 64]);
    expect([...view.y]).toEqual([10 - 2, -12]);
    expect(createParallaxView(stage({}))).toBeNull();
  });

  it('builds a private terrain copy and a view over it', () => {
    const db = stageDb({
      tilemap: {
        tileSize: 8,
        tileset: 'rock',
        rowsTall: 3,
        rle: ['', '2*0, 3', '4*1'],
      },
    });
    const spec = db.stages[0];
    const map = createStageTerrain(spec, db);
    expect(map).not.toBeNull();
    if (map === null || spec.terrain === null) return;
    expect([map.cols, map.rows]).toEqual([stageMapWidth(1000, 8), 3]);
    expect(map.tiles).not.toBe(spec.terrain.tiles);
    expect(map.tiles[map.cols + 2]).toBe(3);
    const view = createTerrainView(map, spec, db);
    expect(view.tiles).toBe(map.tiles);
    expect(view.tilesetSpriteId).toBe(db.sprites.index.get('tiles/terrain-a'));
    expect(Array.from(view.tileFrame)).toEqual([-1, 0, 1, 2]);
    expect(createStageTerrain(stage({}), db)).toBeNull();
    expect(() => createTerrainView(map, stage({}), db)).toThrow(RangeError);
  });
});

describe('core/stage allocation', () => {
  it('ticks without allocating (ramps, pans, events, checkpoints, restarts)', () => {
    const spec = stage({
      length: 100000,
      camera: [
        { x: 0, speed: 1.25, ramp: 7 },
        { x: 5000, speed: 0.75, ramp: 13, yTo: 30, yTicks: 50 },
      ],
      checkpoints: [{ x: 0 }, { x: 3000 }],
      events: Array.from({ length: 200 }, (_, i) =>
        i % 2 === 0
          ? { x: i * 40, type: 'flag', flag: 'f' + String(i % 6) }
          : { x: i * 40, type: 'speed', speed: 1 + (i % 3) * 0.5, ramp: 5 },
      ),
    });
    let fired = 0;
    const runner = createStageRunner(spec, {
      event() {
        fired++;
      },
      clear() {},
    });
    expect(runner.state).toHaveLength(STAGE_STATE_SLOTS);
    const growth = measureHeapGrowth(
      (i) => {
        if (i % 4000 === 3999) runner.restartAt(i % 8000 === 3999 ? 0 : 1);
        runner.tick();
      },
      10_000,
      10_000,
      3,
    );
    expect(fired).toBeGreaterThan(100);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});

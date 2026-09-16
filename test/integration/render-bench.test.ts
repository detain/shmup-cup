/**
 * The render bench's brain, headless (plan M3-02c — `test/bench/render.perf.ts` and
 * `test/bench/render-harness/`). `pnpm bench` needs a browser and a quiet machine, so nothing in
 * `pnpm test` runs it; what *is* testable in Node is everything that decides whether a bench run
 * means anything at all:
 *
 * - **the tick order** (`render-harness/load.ts` `benchTick`) — the review-round-1 blocker. A
 *   cancelled bullet only *marks* its slot dead (`pools.flushAll()` in the step's removal phase
 *   frees it), so topping the bullet pool up before `game.step()` spawns **nothing** and the bench
 *   measures an empty scene while printing confident numbers. Both the right order and the two
 *   wrong ones are pinned below, against the real simulation and the shipped content.
 * - **the per-frame load floor** (`createLoadFloor` / `trackLoadFloor`) — the bench reports the
 *   *smallest* live count any timed frame carried, not the last frame's reading, which is what
 *   made the item pool's 512 → 256 sawtooth visible in the first place.
 * - **the gates** (`render-harness/gates.ts` `renderBenchViolations`) — a thin or empty scene
 *   fails before any budget is even looked at.
 * - the deterministic generator, the quantiles and the two source guards that keep the browser
 *   halves wired to all of the above.
 *
 * The particle pool is faked here (it needs an atlas and Pixi sprites;
 * `packages/render-pixi/test/particles/` tests the real one) — faithfully to the two behaviours
 * the load depends on: a burst fills free slots, and a full pool recycles instead of growing.
 */
import {
  CancelMode,
  MAX_ENEMY_BULLETS,
  MAX_POINT_ITEMS,
  PLAYFIELD_H,
  PLAYFIELD_W,
  createGame,
  createHeadlessPlatform,
  hashWorld,
  type Game,
} from '@shmup/core';
import { PARTICLE_CAPACITY } from '@shmup/render-pixi';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BENCH_PARTICLE_CAPACITY,
  Lcg,
  WARMUP_TICKS,
  benchTick,
  createLoadFloor,
  fillBullets,
  fillParticles,
  quantile,
  trackLoadFloor,
  type BenchParticles,
  type LoadFloor,
} from '../bench/render-harness/load.js';
import {
  DRAW_CALL_BUDGET,
  HEAP_BUDGET,
  MIN_LIVE_LOAD,
  RENDER_P95_BUDGET_MS,
  SCENE_REBUILD_BUDGET,
  renderBenchViolations,
  renderGroupViolations,
} from '../bench/render-harness/gates.js';
import type { RenderBenchResult } from '../bench/render-harness/protocol.js';
import { shippedContent } from '../playtest/harness.js';

const DB = shippedContent();

/** Frames a load test measures after the warm-up (a fraction of the bench's 600, same shape). */
const MEASURED_TICKS = 150;

/**
 * A game set up exactly as the bench's page sets it up: the shipped content, the full loadout,
 * autofire and god mode.
 *
 * @param stage - Stage id (default the bench's default scenario).
 * @returns The game.
 */
function benchGame(stage = 'zone-a'): Game {
  const game = createGame(
    createHeadlessPlatform({ cssWidth: 960, cssHeight: 540 }),
    { seed: 1, stage, loadout: 'full', autofire: true },
    DB,
  );
  game.world.debugFlags.godMode = true;
  return game;
}

/** A particle pool that fills up and then recycles, like `@shmup/render-pixi`'s. */
interface FakeParticles extends BenchParticles {
  /** `emit` calls so far. */
  readonly emits: number;
}

/**
 * A stand-in particle pool.
 *
 * @param capacity - Pool size (default the bench's).
 * @param presets - Presets it can emit (default 12, about what `content/fx/` ships).
 * @param perBurst - Particles one burst spawns (default 16).
 * @returns The fake pool.
 */
function fakeParticles(
  capacity = BENCH_PARTICLE_CAPACITY,
  presets = 12,
  perBurst = 16,
): FakeParticles {
  let live = 0;
  let emits = 0;
  return {
    capacity,
    get liveCount() {
      return live;
    },
    get emits() {
      return emits;
    },
    content: { presets: Array.from({ length: presets }, (_, i) => i) },
    emit(): number {
      emits++;
      // A full pool recycles the oldest particle: the count never passes the capacity.
      const spawned = Math.min(perBurst, capacity - live);
      live += spawned;
      return spawned;
    },
  };
}

/**
 * Plays the bench's load and reports the floor over the measured ticks.
 *
 * @param tick - The tick to run (the bench's, or one of the wrong orders).
 * @param options - Warm-up and measured tick counts, and the pool to fill.
 * @returns The floor and the game.
 */
function runLoad(
  tick: (game: Game, particles: BenchParticles | null, random: Lcg) => void,
  options: { warmup?: number; measured?: number; particles?: BenchParticles | null } = {},
): { floor: LoadFloor; game: Game } {
  const game = benchGame();
  const random = new Lcg();
  const particles = options.particles === undefined ? fakeParticles() : options.particles;
  const warmup = options.warmup ?? WARMUP_TICKS;
  for (let i = 0; i < warmup; i++) tick(game, particles, random);
  const floor = createLoadFloor(particles === null ? 0 : particles.capacity);
  for (let i = 0; i < (options.measured ?? MEASURED_TICKS); i++) {
    tick(game, particles, random);
    trackLoadFloor(floor, game, particles);
  }
  return { floor, game };
}

/**
 * The wrong order review round 1 found: the bullet pool topped up **before** the step, when its
 * 512 slots are still occupied by the bullets the screen clear marked dead.
 *
 * @param game - The game.
 * @param particles - The particle pool.
 * @param random - The generator.
 */
function topUpBeforeStep(game: Game, particles: BenchParticles | null, random: Lcg): void {
  if (game.world.bullets.points.count < MAX_POINT_ITEMS) {
    game.world.bullets.cancelAll(CancelMode.Points, 0);
  }
  fillBullets(game, random);
  game.step();
  game.events.drain(() => {});
  fillParticles(particles, game, random);
}

/**
 * The other wrong order review round 1 found: the screen clear run only once per half-pool, which
 * let the point-item pool sawtooth 512 → 256.
 *
 * @param game - The game.
 * @param particles - The particle pool.
 * @param random - The generator.
 */
function clearOncePerHalfPool(game: Game, particles: BenchParticles | null, random: Lcg): void {
  if (game.world.bullets.points.count < MAX_POINT_ITEMS / 2) {
    game.world.bullets.cancelAll(CancelMode.Points, 0);
  }
  game.step();
  game.events.drain(() => {});
  fillBullets(game, random);
  fillParticles(particles, game, random);
}

/** A result that passes every gate (the shape of a real measured run). */
const HEALTHY: RenderBenchResult = {
  frames: 600,
  renderMedianMs: 2.1,
  renderP95Ms: 3.2,
  renderMaxMs: 9.4,
  drawCalls: 10,
  // The shipped scene since M3-02e: the whole instruction set is never thrown away, and the churn
  // it no longer carries shows up in the layer groups (measured 0 and ~1,590 of 660 frames).
  structureRebuilds: 0,
  groupRebuilds: 1590,
  renderTargetBytes: 512 * 256 * 4,
  heapDeltaBytes: 485 * 1024,
  heapMeasured: true,
  webGLVersion: 1,
  bullets: 512,
  points: 489,
  particles: 489,
  mode7: false,
  layerEffectMask: 0,
  cameraX: 4321,
  worldStatus: 'playing',
};

/**
 * The healthy result with some fields changed.
 *
 * @param overrides - What this case changes.
 * @returns The result.
 */
function result(overrides: Partial<RenderBenchResult>): RenderBenchResult {
  return { ...HEALTHY, ...overrides };
}

/**
 * Reads one of the bench's own source files (the two guards below keep the browser and Node
 * halves wired to the tested modules).
 *
 * @param name - Path relative to `test/bench/`.
 * @returns The source text.
 */
function benchSource(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../bench/${name}`, import.meta.url)), 'utf8');
}

describe('render bench: the tick order (M3-02c review round 1)', () => {
  it('keeps every measured frame under the load the bench claims', () => {
    const { floor, game } = runLoad(benchTick);
    // Bullets: exactly full on every single measured frame.
    expect(floor.bullets).toBe(MAX_ENEMY_BULLETS);
    // Point items: all but the handful that reached the score during the tick (the plan records
    // 489 of 512 over the bench's 660 frames).
    expect(floor.points).toBeGreaterThanOrEqual(480);
    expect(floor.points).toBeLessThanOrEqual(MAX_POINT_ITEMS);
    expect(floor.particles).toBe(BENCH_PARTICLE_CAPACITY);
    // And the run really was a run: the stage was still playing, the camera had moved on.
    expect(game.world.status).toBe('playing');
    expect(game.world.camera.x).toBeGreaterThan(0);
    // Whatever else changes, the claim the bench prints must survive its own gate.
    expect(
      renderBenchViolations(
        result({ bullets: floor.bullets, points: floor.points, particles: floor.particles }),
      ),
    ).toEqual([]);
  });

  it('measures an empty scene when the bullet pool is topped up before the step', () => {
    // The blocker itself: `cancelAll` marks 512 slots dead, `fillBullets` sees a full pool and
    // spawns nothing, and the step then frees them all — every frame renders almost no bullets.
    const { floor } = runLoad(topUpBeforeStep);
    // Measured: about 217 of 512 — only what the simulation's own enemies happened to fire, well
    // under the gate's floor. The bench would have been reporting the render cost of half a scene.
    expect(floor.bullets).toBeLessThan(MIN_LIVE_LOAD);
    // And the bench must refuse such a run instead of reporting numbers for it.
    expect(renderBenchViolations(result({ bullets: floor.bullets }))).toContain(
      `a frame carried only ${floor.bullets} enemy bullets (need > ${MIN_LIVE_LOAD})`,
    );
  });

  it('lets the item pool sawtooth when the screen clear runs once per half-pool', () => {
    const { floor } = runLoad(clearOncePerHalfPool);
    // Bullets stay full (their top-up is still after the step), the items do not.
    expect(floor.bullets).toBe(MAX_ENEMY_BULLETS);
    expect(floor.points).toBeLessThan(MIN_LIVE_LOAD);
    expect(renderBenchViolations(result({ points: floor.points }))).toContain(
      `a frame carried only ${floor.points} point items (need > ${MIN_LIVE_LOAD})`,
    );
  });

  it('frees a cancelled bullet only in the step, so the top-up has to come after it', () => {
    const game = benchGame();
    const random = new Lcg();
    for (let i = 0; i < 30; i++) benchTick(game, null, random);
    const bullets = game.world.bullets;
    expect(bullets.pool.count).toBe(MAX_ENEMY_BULLETS);

    // A cancel marks; it does not free.
    expect(bullets.cancelAll(CancelMode.Points, 0)).toBeGreaterThan(0);
    expect(bullets.pool.count).toBe(MAX_ENEMY_BULLETS);
    expect(bullets.spawn(0, 0, 0, 1, 0)).toBeLessThan(0);
    expect(fillBullets(game, random)).toBe(0);

    // The step's removal phase (`pools.flushAll()`) is what frees the slots.
    game.step();
    game.events.drain(() => {});
    expect(bullets.pool.count).toBeLessThan(MAX_ENEMY_BULLETS);
    expect(fillBullets(game, random)).toBeGreaterThan(0);
    expect(bullets.pool.count).toBe(MAX_ENEMY_BULLETS);
  });

  it('runs the same load twice, tick for tick', () => {
    const first = runLoad(benchTick, { warmup: 60, measured: 40 });
    const second = runLoad(benchTick, { warmup: 60, measured: 40 });
    expect(hashWorld(second.game.world)).toBe(hashWorld(first.game.world));
    expect(second.floor).toEqual(first.floor);
  });
});

describe('render bench: the load helpers', () => {
  it('fills the bullet pool to its capacity inside the camera window', () => {
    const game = benchGame();
    game.step();
    const before = game.world.bullets.pool.count;
    const spawned = fillBullets(game, new Lcg());
    const bullets = game.world.bullets;
    expect(before + spawned).toBe(MAX_ENEMY_BULLETS);
    expect(bullets.pool.count).toBe(MAX_ENEMY_BULLETS);
    // The slots the top-up added (a packed pool appends) all sit in the camera's window, so the
    // load is on screen rather than behind it.
    const camera = game.world.camera;
    const fields = bullets.pool.fields;
    expect(spawned).toBeGreaterThan(0);
    for (let i = before; i < bullets.pool.count; i++) {
      expect(fields.x[i]).toBeGreaterThanOrEqual(camera.x);
      expect(fields.x[i]).toBeLessThanOrEqual(camera.x + PLAYFIELD_W);
      expect(fields.y[i]).toBeGreaterThanOrEqual(camera.y);
      expect(fields.y[i]).toBeLessThanOrEqual(camera.y + PLAYFIELD_H);
    }
    // A second call on a full pool is a no-op rather than a spin.
    expect(fillBullets(game, new Lcg())).toBe(0);
  });

  it('fills the particle pool, and never spins on one it cannot fill', () => {
    const game = benchGame();
    const random = new Lcg();
    const particles = fakeParticles();
    fillParticles(particles, game, random);
    expect(particles.liveCount).toBe(BENCH_PARTICLE_CAPACITY);
    // At most `presets * 4` bursts per call, and it stops as soon as the pool is full.
    expect(particles.emits).toBeLessThanOrEqual(12 * 4);
    const emitsWhenFull = particles.emits;
    fillParticles(particles, game, random);
    expect(particles.emits).toBe(emitsWhenFull);
    expect(particles.liveCount).toBe(BENCH_PARTICLE_CAPACITY);

    // No pool at all, and a pool with no presets: both no-ops (the bench's atlas-less fallbacks).
    expect(() => fillParticles(null, game, random)).not.toThrow();
    const empty = fakeParticles(64, 0);
    fillParticles(empty, game, random);
    expect(empty.emits).toBe(0);

    // A pool that never frees a slot still gets a bounded number of bursts.
    const stuck = fakeParticles(64, 3, 0);
    fillParticles(stuck, game, random);
    expect(stuck.liveCount).toBe(0);
    expect(stuck.emits).toBe(3 * 4);
  });

  it('is a worst case: the bench pools twice the particles the shell ships', () => {
    // A device reading of `PRT n/256` (the shipped `PARTICLE_CAPACITY`) is not half the bench's
    // load going missing — the bench's gate is deliberately the stricter of the two.
    expect(BENCH_PARTICLE_CAPACITY).toBe(2 * PARTICLE_CAPACITY);
    expect(PARTICLE_CAPACITY).toBe(256);
  });

  it('reports the floor of the measured frames, not the last one', () => {
    const floor = createLoadFloor(256);
    expect(floor).toEqual({ bullets: MAX_ENEMY_BULLETS, points: MAX_POINT_ITEMS, particles: 256 });
    const counts = { bullets: 512, points: 512, particles: 256 };
    const game = {
      world: {
        bullets: {
          pool: {
            get count() {
              return counts.bullets;
            },
          },
          points: {
            get count() {
              return counts.points;
            },
          },
        },
      },
    } as unknown as Game;
    const particles = {
      capacity: 256,
      get liveCount() {
        return counts.particles;
      },
      content: { presets: [] },
      emit: () => 0,
    } satisfies BenchParticles;

    trackLoadFloor(floor, game, particles);
    expect(floor).toEqual({ bullets: 512, points: 512, particles: 256 });
    // A dip in the middle of the run is what the floor exists to remember …
    counts.bullets = 480;
    counts.points = 301;
    counts.particles = 12;
    trackLoadFloor(floor, game, particles);
    // … even when the last frame looks perfect again.
    counts.bullets = 512;
    counts.points = 512;
    counts.particles = 256;
    trackLoadFloor(floor, game, particles);
    expect(floor).toEqual({ bullets: 480, points: 301, particles: 12 });
    // No pool: the particle floor falls to 0 rather than staying at the capacity.
    const noPool = createLoadFloor(0);
    trackLoadFloor(noPool, game, null);
    expect(noPool.particles).toBe(0);
  });

  it('generates the same load on every run', () => {
    const a = new Lcg();
    const b = new Lcg();
    const first: number[] = [];
    for (let i = 0; i < 64; i++) {
      const value = a.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      first.push(value);
    }
    expect(Array.from({ length: 64 }, () => b.next())).toEqual(first);
    // Not a constant, and a different seed is a different sequence.
    expect(new Set(first).size).toBeGreaterThan(60);
    expect(new Lcg(12345).next()).not.toBe(first[0]);
  });

  it('takes quantiles of the render samples, including the degenerate ones', () => {
    const samples = Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(quantile(samples, 0.5)).toBe(6);
    expect(quantile(samples, 0.95)).toBe(10);
    expect(quantile(samples, 0)).toBe(1);
    expect(quantile(samples, 1)).toBe(10);
    expect(quantile(Float64Array.from([4.5]), 0.95)).toBe(4.5);
    expect(quantile(new Float64Array(0), 0.95)).toBe(0);
  });
});

describe('render bench: the gates (renderBenchViolations)', () => {
  it('passes a real measured run', () => {
    expect(renderBenchViolations(HEALTHY)).toEqual([]);
    // Right at the edges: the budgets are inclusive for draw calls, exclusive for the rest.
    expect(
      renderBenchViolations(
        result({
          drawCalls: DRAW_CALL_BUDGET,
          renderP95Ms: RENDER_P95_BUDGET_MS - 0.001,
          heapDeltaBytes: HEAP_BUDGET - 1,
          bullets: MIN_LIVE_LOAD + 1,
          points: MIN_LIVE_LOAD + 1,
          particles: MIN_LIVE_LOAD + 1,
        }),
      ),
    ).toEqual([]);
  });

  it('refuses a run that measured nothing at all', () => {
    // The failure mode the review found: confident numbers over an empty scene.
    const violations = renderBenchViolations(
      result({ frames: 0, bullets: 0, points: 0, particles: 0, drawCalls: 0 }),
    );
    expect(violations).toHaveLength(5);
    expect(violations[0]).toContain('measured no frames at all');
    expect(violations.join('\n')).toContain('0 enemy bullets');
    expect(violations.join('\n')).toContain('0 point items');
    expect(violations.join('\n')).toContain('0 particles');
    expect(violations.join('\n')).toContain('nothing was drawn');
  });

  it('refuses a thin scene one pool at a time', () => {
    expect(renderBenchViolations(result({ bullets: MIN_LIVE_LOAD }))).toEqual([
      `a frame carried only ${MIN_LIVE_LOAD} enemy bullets (need > ${MIN_LIVE_LOAD})`,
    ]);
    expect(renderBenchViolations(result({ points: 256 }))).toEqual([
      `a frame carried only 256 point items (need > ${MIN_LIVE_LOAD})`,
    ]);
    expect(renderBenchViolations(result({ particles: 1 }))).toEqual([
      `a frame carried only 1 particles (need > ${MIN_LIVE_LOAD})`,
    ]);
  });

  it('refuses a frame that drew too much, or was not counted at all', () => {
    expect(renderBenchViolations(result({ drawCalls: DRAW_CALL_BUDGET + 1 }))).toEqual([
      `${DRAW_CALL_BUDGET + 1} draw calls, over the budget of ${DRAW_CALL_BUDGET}`,
    ]);
    // -1 is what the renderer reports without `countDrawCalls`: the bench must not pass then.
    expect(renderBenchViolations(result({ drawCalls: -1 }))[0]).toContain('none counted');
  });

  it('refuses a render p95 over budget, including a missing one', () => {
    expect(renderBenchViolations(result({ renderP95Ms: RENDER_P95_BUDGET_MS }))).toEqual([
      `render p95 ${RENDER_P95_BUDGET_MS} ms, over the budget of ${RENDER_P95_BUDGET_MS} ms`,
    ]);
    // A sample array that never got filled quantiles to NaN — not "under budget".
    expect(renderBenchViolations(result({ renderP95Ms: Number.NaN }))).toHaveLength(1);
  });

  it('gates the heap only when the browser reported one', () => {
    expect(renderBenchViolations(result({ heapDeltaBytes: HEAP_BUDGET }))[0]).toContain(
      'the heap grew',
    );
    // The leak fixture's own gate: 2,000 objects a frame must be over budget.
    expect(renderBenchViolations(result({ heapDeltaBytes: 64 * HEAP_BUDGET }))).toHaveLength(1);
    // Without `--enable-precise-memory-info` there is no reading to gate on.
    expect(
      renderBenchViolations(result({ heapMeasured: false, heapDeltaBytes: 64 * HEAP_BUDGET })),
    ).toEqual([]);
  });
});

describe('render bench: the render-group gate (renderGroupViolations, M3-02e)', () => {
  it('passes the shipped scene and the deliberate one-group arm', () => {
    expect(renderGroupViolations(HEALTHY, true)).toEqual([]);
    // Right at the edge: the budget is inclusive.
    expect(
      renderGroupViolations(
        result({ structureRebuilds: Math.floor(600 * SCENE_REBUILD_BUDGET), groupRebuilds: 1590 }),
        true,
      ),
    ).toEqual([]);
    // The A/B arm the bench runs beside it: one group, every frame rebuilding it.
    expect(
      renderGroupViolations(result({ structureRebuilds: 659, groupRebuilds: 659 }), false),
    ).toEqual([]);
  });

  it('fails the shipped scene when F1 comes back', () => {
    const violations = renderGroupViolations(
      result({ structureRebuilds: 659, groupRebuilds: 659 }),
      true,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("the review's F1 is back");
    // One frame over the budget is already a failure.
    expect(
      renderGroupViolations(
        result({ structureRebuilds: Math.floor(600 * SCENE_REBUILD_BUDGET) + 1 }),
        true,
      ),
    ).toHaveLength(1);
  });

  it('refuses a scene that simply drew nothing', () => {
    // The gaming the second counter exists to stop: `structureRebuilds` at 0 because the churn
    // moved is the fix; at 0 because nothing was on screen is not.
    const violations = renderGroupViolations(
      result({ structureRebuilds: 0, groupRebuilds: 0 }),
      true,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('no render group was rebuilt at all');
    expect(renderGroupViolations(result({ groupRebuilds: -1 }), true)).toHaveLength(2);
  });

  it('refuses counters that cannot both be true', () => {
    // The scene's own group is one of the groups the second figure walks.
    const violations = renderGroupViolations(
      result({ structureRebuilds: 40, groupRebuilds: 12 }),
      true,
    );
    expect(violations[0]).toContain('is fewer than the');
  });

  it('refuses a one-group arm that is not one', () => {
    // Someone passing `renderGroups: false` while the groups are still on.
    expect(
      renderGroupViolations(result({ structureRebuilds: 0, groupRebuilds: 1590 }), false),
    ).toHaveLength(2);
    // …and the two counters must agree when there is only one group to count.
    const split = renderGroupViolations(
      result({ structureRebuilds: 595, groupRebuilds: 1590 }),
      false,
    );
    expect(split).toHaveLength(1);
    expect(split[0]).toContain('with one group they are the same figure');
  });
});

describe('render bench: the halves stay wired to the tested code', () => {
  it('drives the page through benchTick instead of its own tick order', () => {
    const main = benchSource('render-harness/main.ts');
    expect(main).toContain("from './load.js'");
    expect(main).toContain('benchTick(game, particlePool, random)');
    expect(main).toContain('trackLoadFloor(floor, game, particlePool)');
    // The order, the top-ups and the floor must not be re-inlined here: `load.ts` is where they
    // are tested, and a copy in the page would drift away from these tests unnoticed.
    expect(main).not.toContain('cancelAll(');
    expect(main).not.toContain('bullets.spawn(');
    expect(main).not.toContain('particles.emit(');
  });

  it('gates every scenario of the Node driver through renderBenchViolations', () => {
    const perf = benchSource('render.perf.ts');
    expect(perf).toContain('expect(renderBenchViolations(result)).toEqual([])');
    // …and M3-02e's render-group gate, for every scenario, with the scenario's own configuration.
    expect(perf).toContain(
      'expect(renderGroupViolations(result, scenario.options.renderGroups !== false)).toEqual([])',
    );
    // The A/B arm itself must still be one of the scenarios, or the gate above has nothing to
    // compare the shipped scene with (the review's measurement M1, done headlessly).
    expect(perf).toContain('renderGroups: false');
    // …and does not hand-roll the load floors it replaced (`> 400` in three places).
    expect(perf).not.toContain('toBeGreaterThan(400)');
  });

  it('keeps the two things only a browser run can check: the resolution knob and the leak gate', () => {
    const perf = benchSource('render.perf.ts');
    // The review's §7.5 knob — the same load at ×2 of the shipped internal frame, with the
    // pooled target expected to grow to the next power of two on each axis (1024×512).
    expect(perf).toContain('width: 768, height: 432');
    expect(perf).toContain('1024 * 512 * 4');
    // The heap gate's own proof: a fixture that leaks must blow the budget the scenarios pass.
    expect(perf).toContain('leakPerFrame: LEAK_PER_FRAME');
    expect(perf).toContain('expect(result.heapDeltaBytes).toBeGreaterThan(HEAP_BUDGET)');
    // Both figures come from the renderer's own counters, so the bench must ask for them.
    const main = benchSource('render-harness/main.ts');
    expect(main).toContain('countDrawCalls: true');
    expect(main).toContain('countStructureRebuilds: true');
  });
});

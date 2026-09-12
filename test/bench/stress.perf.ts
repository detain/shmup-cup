/**
 * `pnpm bench` — the simulation stress benchmark of plan M1-19 (shmup_feat.md §22 budgets): a
 * KESTREL with the full loadout (speed 2, Missile, Laser, four Options — all autofiring) in god
 * mode, 64 zone A enemies running their behaviours, the enemy bullet pool topped up to 512 every
 * tick and four enemy lasers cycling, for 20,000 ticks after a warm-up. It prints the ms per tick
 * (median and 95th percentile of 100-tick batches) and the heap growth, and fails when the median
 * reaches 1.0 ms/tick or the heap retains 512 KB or more after the warm-up. CI runs it after the
 * build; it is not part of `pnpm test` (timing needs a quiet machine).
 *
 * The top-up (spawning enemies, bullets and lasers) runs between ticks and is timed with them.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import {
  BulletOrigin,
  EnemyState,
  MAX_ENEMIES,
  MAX_ENEMY_BULLETS,
  PLAYFIELD_H,
  PLAYFIELD_W,
  createInputSnapshot,
  createWorld,
  resolveGameConfig,
  stepWorld,
  type World,
} from '@shmup/core';
import { shippedContent } from '../playtest/harness.js';

/** Measured ticks. */
export const BENCH_TICKS = 20_000;

/** Ticks run first (JIT warm-up, pools filled). */
export const BENCH_WARMUP = 3_000;

/** Ticks per timing sample. */
const BATCH = 100;

/** Median budget, ms per tick. */
export const MEDIAN_BUDGET_MS = 1.0;

/** Heap growth budget after the warm-up, bytes. */
export const HEAP_BUDGET = 512 * 1024;

/** Enemy lasers kept alive. */
const LASERS = 4;

/** The flying zone A enemies the stress keeps on screen (ground enemies need terrain). */
const AIR_ENEMIES = ['skeet', 'vane', 'tender', 'lancer', 'gyre'];

/**
 * The stress scenario: a World plus a top-up that keeps the pools full.
 *
 * @returns The World and the per-tick top-up.
 */
function stressScenario(): { world: World; topUp: () => void } {
  const db = shippedContent();
  const world = createWorld(resolveGameConfig({ seed: 7, loadout: 'full' }), db);
  world.debugFlags.godMode = true;
  const specs = AIR_ENEMIES.map((id) => {
    const index = db.enemyIndex.get(id);
    if (index === undefined) throw new Error(`zone A has no enemy ${id}`);
    return index;
  });
  const random = new Uint32Array([0x2545f491]);
  /**
   * The next pseudo-random number in [0, 1) (a local LCG — the bench needs no determinism).
   *
   * @returns The number.
   */
  const next = (): number => {
    random[0] = Math.imul(random[0], 1664525) + 1013904223;
    return random[0] / 4294967296;
  };
  const origin = new BulletOrigin();
  let spawned = 0;
  /**
   * Refills the pools before a tick: enemies back to 64 (the flying zone A types in turn, in the
   * right half of the view), bullets back to 512 (random positions, headings and speeds) and one
   * more enemy laser while fewer than four are alive.
   */
  const topUp = (): void => {
    const camera = world.camera;
    const enemies = world.enemies.enemies;
    let live = 0;
    for (let i = 0; i < enemies.length; i++) if (enemies[i].state !== EnemyState.Free) live++;
    for (; live < MAX_ENEMIES; live++) {
      const spec = specs[spawned++ % specs.length];
      if (
        world.enemies.spawn(
          spec,
          camera.x + PLAYFIELD_W * (0.45 + 0.5 * next()),
          camera.y + 16 + (PLAYFIELD_H - 32) * next(),
        ) === null
      ) {
        break;
      }
    }
    const bullets = world.bullets;
    while (bullets.pool.count < MAX_ENEMY_BULLETS) {
      if (
        bullets.spawn(
          camera.x + PLAYFIELD_W * next(),
          camera.y + PLAYFIELD_H * next(),
          Math.floor(1024 * next()),
          0.25 + next(),
          0,
        ) < 0
      ) {
        break;
      }
    }
    if (bullets.lasers.count < LASERS) {
      origin.x = camera.x + PLAYFIELD_W - 8;
      origin.y = camera.y + 20 + (PLAYFIELD_H - 40) * next();
      bullets.fireLaser(origin, 512, 300, 6, 20, 8, 90, 12, -1);
    }
  };
  return { world, topUp };
}

/**
 * The value at a quantile of sorted samples.
 *
 * @param sorted - Ascending samples.
 * @param q - Quantile 0…1.
 * @returns The sample.
 */
function quantile(sorted: readonly number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

describe('bench: simulation stress (512 bullets, 64 enemies, full loadout, lasers)', () => {
  it(`runs ${BENCH_TICKS} ticks with a median under ${MEDIAN_BUDGET_MS} ms/tick and < 512 KB heap growth`, () => {
    const gc = (globalThis as { gc?: () => void }).gc;
    if (typeof gc !== 'function') throw new Error('pnpm bench needs node --expose-gc');
    const { world, topUp } = stressScenario();
    const input = createInputSnapshot();
    for (let i = 0; i < BENCH_WARMUP; i++) {
      topUp();
      stepWorld(world, input);
    }
    gc();
    gc();
    const heapBefore = process.memoryUsage().heapUsed;
    const samples = new Float64Array(BENCH_TICKS / BATCH);
    const load = { bullets: 0, enemies: 0, shots: 0, lasers: 0 };
    for (let b = 0; b < samples.length; b++) {
      const start = performance.now();
      for (let i = 0; i < BATCH; i++) {
        topUp();
        stepWorld(world, input);
      }
      samples[b] = (performance.now() - start) / BATCH;
      load.bullets += world.bullets.pool.count;
      load.shots += world.weapons.pool.count;
      load.lasers += world.bullets.lasers.count;
      let live = 0;
      for (const e of world.enemies.enemies) if (e.state !== EnemyState.Free) live++;
      load.enemies += live;
    }
    gc();
    gc();
    const growth = process.memoryUsage().heapUsed - heapBefore;
    const sorted = Array.from(samples).sort((a, c) => a - c);
    const median = quantile(sorted, 0.5);
    const p95 = quantile(sorted, 0.95);
    const n = samples.length;
    console.info(
      `[bench] ${BENCH_TICKS} ticks: median ${median.toFixed(3)} ms/tick, p95 ${p95.toFixed(3)} ` +
        `ms/tick, max ${sorted[n - 1].toFixed(3)}; heap growth ${(growth / 1024).toFixed(1)} KB; ` +
        `average load ${(load.bullets / n).toFixed(0)} bullets, ${(load.enemies / n).toFixed(0)} ` +
        `enemies, ${(load.shots / n).toFixed(0)} shots, ${(load.lasers / n).toFixed(1)} lasers`,
    );
    // The scenario really is under full load.
    expect(load.bullets / n).toBeGreaterThan(MAX_ENEMY_BULLETS * 0.9);
    expect(load.enemies / n).toBeGreaterThan(MAX_ENEMIES * 0.9);
    expect(load.shots / n).toBeGreaterThan(5); // capped per shooter; most hit at once
    expect(load.lasers / n).toBeGreaterThan(1);
    expect(median).toBeLessThan(MEDIAN_BUDGET_MS);
    expect(growth).toBeLessThan(HEAP_BUDGET);
  });
});

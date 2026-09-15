/**
 * `pnpm bench` — the per-zone stress benchmarks of plan M2-18 (shmup_feat.md §22 budgets): every
 * zone of the campaign's map is played from its start to its stage clear by the 4-way playtest bot
 * with the full loadout (speed 2, Missile, Laser, four Options — all autofiring) in god mode, with
 * the zone's own enemies, terrain, gimmicks and boss, and the enemy bullet pool topped up to 512
 * before every tick (random positions, headings and speeds — the same stress as `stress.perf.ts`,
 * on top of what the zone fires). Each zone prints its ms per tick (median and 95th percentile of
 * 100-tick batches) and the heap it retains, and fails when the median reaches
 * {@link ZONE_MEDIAN_BUDGET_MS} or the heap retained after its warm-up reaches
 * {@link ZONE_HEAP_BUDGET}. Not part of `pnpm test` (timing needs a quiet machine); CI runs it after
 * the build.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_ENEMY_BULLETS,
  PLAYFIELD_H,
  PLAYFIELD_W,
  commitPlayerInput,
  createInputSnapshot,
  createWorld,
  resolveGameConfig,
  stepWorld,
  type World,
} from '@shmup/core';
import { fourWayBot } from '../playtest/four-way-bot.js';
import { shippedContent } from '../playtest/harness.js';

/** Median budget of a zone, ms per tick (the stress benchmark's). */
export const ZONE_MEDIAN_BUDGET_MS = 1.0;

/** Heap a zone may retain after its warm-up, bytes. */
export const ZONE_HEAP_BUDGET = 1024 * 1024;

/** Ticks of the warm-up (JIT, pools filled) before the heap baseline. */
const WARMUP = 3_000;

/** Ticks per timing sample. */
const BATCH = 100;

/** Most ticks a zone may take (twice the plan's longest zone). */
const MAX_TICKS = 12 * 60 * 60;

/** The campaign's zones, in map order. */
const ZONES = ((): { label: string; stageId: string }[] => {
  const db = shippedContent();
  if (db.campaign === null) throw new Error('the shipped content has no campaign');
  return db.campaign.zones.map((zone) => ({
    label: zone.label,
    stageId: db.stages[zone.stageId].id,
  }));
})();

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

/**
 * Tops the enemy bullet pool up to 512 with random bullets in the view (a local LCG — the bench
 * needs no determinism).
 *
 * @param world - The World.
 * @param random - The LCG's state.
 */
function topUp(world: World, random: Uint32Array): void {
  const camera = world.camera;
  const bullets = world.bullets;
  while (bullets.pool.count < MAX_ENEMY_BULLETS) {
    random[0] = Math.imul(random[0], 1664525) + 1013904223;
    const a = random[0] / 4294967296;
    random[0] = Math.imul(random[0], 1664525) + 1013904223;
    const b = random[0] / 4294967296;
    if (
      bullets.spawn(
        camera.x + PLAYFIELD_W * a,
        camera.y + PLAYFIELD_H * b,
        Math.floor(1024 * a * b),
        0.25 + b,
        0,
      ) < 0
    ) {
      break;
    }
  }
}

describe('bench: every zone under stress (full loadout, 512 bullets, the zone itself)', () => {
  it.each(ZONES)(
    `zone $label ($stageId): median under ${ZONE_MEDIAN_BUDGET_MS} ms/tick, < 1 MB retained`,
    ({ stageId }) => {
      const gc = (globalThis as { gc?: () => void }).gc;
      if (typeof gc !== 'function') throw new Error('pnpm bench needs node --expose-gc');
      const world = createWorld(
        resolveGameConfig({ seed: 7, stage: stageId, loadout: 'full' }),
        shippedContent(),
      );
      world.debugFlags.godMode = true;
      const bot = fourWayBot();
      const input = createInputSnapshot();
      const random = new Uint32Array([0x2545f491]);
      const samples: number[] = [];
      let bullets = 0;
      let ticks = 0;
      let heapBefore = 0;
      /**
       * Whether the zone is over (a function, so TypeScript does not narrow the status).
       *
       * @returns `true` after the stage clear.
       */
      const cleared = (): boolean => world.status === 'stageClear';
      while (ticks < MAX_TICKS && !cleared()) {
        if (ticks === WARMUP) {
          gc();
          gc();
          heapBefore = process.memoryUsage().heapUsed;
        }
        const start = performance.now();
        for (let i = 0; i < BATCH && !cleared(); i++) {
          commitPlayerInput(input.players[0], bot.decide(world) & 0xffff);
          topUp(world, random);
          stepWorld(world, input);
          world.events.clear();
          ticks++;
        }
        if (ticks > WARMUP) samples.push((performance.now() - start) / BATCH);
        bullets += world.bullets.pool.count;
      }
      gc();
      gc();
      const growth = process.memoryUsage().heapUsed - heapBefore;
      const sorted = samples.slice().sort((a, b) => a - b);
      const median = quantile(sorted, 0.5);
      const p95 = quantile(sorted, 0.95);
      const batches = Math.ceil(ticks / BATCH);
      console.info(
        `[bench] ${stageId}: ${String(ticks)} ticks to ${world.status}; median ${median.toFixed(3)} ` +
          `ms/tick, p95 ${p95.toFixed(3)}, max ${sorted[sorted.length - 1].toFixed(3)}; retained ` +
          `${(growth / 1024).toFixed(1)} KB; average ${(bullets / batches).toFixed(0)} bullets`,
      );
      expect(world.status).toBe('stageClear');
      expect(bullets / batches).toBeGreaterThan(MAX_ENEMY_BULLETS * 0.8);
      expect(median).toBeLessThan(ZONE_MEDIAN_BUDGET_MS);
      expect(growth).toBeLessThan(ZONE_HEAP_BUDGET);
    },
  );
});

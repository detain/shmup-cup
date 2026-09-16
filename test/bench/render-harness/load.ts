/**
 * # render-harness/load — the render bench's scripted worst-case load
 *
 * The part of the render benchmark (plan M3-02c) that decides *what is on screen*: the ordered
 * tick that keeps the enemy-bullet, point-item and particle pools full, the deterministic
 * generator that places them, and the per-frame **floor** the bench reports instead of the last
 * frame's reading.
 *
 * It is its own module — no DOM, no Pixi, no virtual modules, `@shmup/core` only — because the
 * load is the one part of the bench that can be wrong *silently*. A bench that measures an empty
 * scene while printing confident numbers is worse than no bench, so the order below is pinned by
 * headless tests (`test/integration/render-bench.test.ts`) rather than by the browser run.
 *
 * **The order is the whole point** (review round 1 of M3-02c):
 *
 * 1. `bullets.cancelAll(CancelMode.Points, 0)` — the bomber's screen clear (M2-02) is the only
 *    thing that ever puts 512 point items on screen. It runs on **every** tick that left a free
 *    item slot: items are credited and freed a few at a time as they reach the score, so clearing
 *    once per half-pool let the item pool sawtooth 512 → 256 and the measured frames carried
 *    barely half the claimed load.
 * 2. `game.step()` — a cancelled bullet is only *marked* dead; `pools.flushAll()` in the step's
 *    removal phase frees the slot.
 * 3. `fillBullets()` — **after** the step, therefore. Topping the pool up first would find 512
 *    dead-but-occupied slots, spawn nothing, and leave the frame empty.
 * 4. `fillParticles()`.
 *
 * @module
 */
import {
  CancelMode,
  MAX_ENEMY_BULLETS,
  MAX_POINT_ITEMS,
  PLAYFIELD_H,
  PLAYFIELD_W,
  type Game,
} from '@shmup/core';

/**
 * Ticks a scenario plays before it measures: the camera has to reach the stages' effect ranges
 * (`raster-range`'s filtered layer, `dimension`'s Mode-7 floor) and the pools have to be full.
 */
export const WARMUP_TICKS = 260;

/**
 * Particles the bench's renderer pools, per blend mode.
 *
 * @remarks
 * Deliberately **twice** the shipped `PARTICLE_CAPACITY` (256, `@shmup/render-pixi`
 * `particles`): the bench is a worst case, and a gate stricter than the shipping default cannot
 * be beaten by a device that draws fewer sprites. It does mean the bench's `512` and the debug
 * overlay's on-device `PRT n/256` are different scales — the overlay is not reporting half the
 * particles, it is reporting all of a smaller pool.
 */
export const BENCH_PARTICLE_CAPACITY = 512;

/**
 * The part of `@shmup/render-pixi`'s `ParticleSystem` the load drives (so the load can be tested
 * without a WebGL context).
 */
export interface BenchParticles {
  /** Particles the pool can hold. */
  readonly capacity: number;
  /** Particles alive now. */
  readonly liveCount: number;
  /** The particle presets (`content/fx/`) the pool can emit. */
  readonly content: { readonly presets: readonly unknown[] };
  /**
   * Emits one preset's burst.
   *
   * @param preset - Preset index.
   * @param x - World x.
   * @param y - World y.
   * @param intensity - Burst intensity.
   * @returns Particles spawned.
   */
  emit(preset: number, x: number, y: number, intensity: number): number;
}

/** A small deterministic generator — the load must be the same on every run. */
export class Lcg {
  /** The state. */
  private state: number;

  /**
   * A generator.
   *
   * @param seed - Starting state (default the bench's own seed).
   */
  constructor(seed = 0x2545f491) {
    this.state = seed >>> 0;
  }

  /**
   * The next number in [0, 1).
   *
   * @returns The number.
   */
  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }
}

/**
 * Tops the enemy-bullet pool up to its capacity around the camera.
 *
 * @remarks
 * Must run **after** `game.step()`: before it, a tick's cancelled bullets still occupy their
 * slots (they are freed by the step's removal phase), `pool.count` is still 512 and this spawns
 * nothing at all.
 *
 * @param game - The game.
 * @param random - The generator.
 * @returns Bullets spawned.
 */
export function fillBullets(game: Game, random: Lcg): number {
  const world = game.world;
  const camera = world.camera;
  const bullets = world.bullets;
  let spawned = 0;
  while (bullets.pool.count < MAX_ENEMY_BULLETS) {
    if (
      bullets.spawn(
        camera.x + PLAYFIELD_W * random.next(),
        camera.y + PLAYFIELD_H * random.next(),
        Math.floor(1024 * random.next()),
        0.25 + random.next(),
        0,
      ) < 0
    ) {
      break;
    }
    spawned++;
  }
  return spawned;
}

/**
 * Keeps the particle pool full: bursts of every preset around the camera until no free slot is
 * left (the presets recycle the oldest particle when the pool is full, so this settles).
 *
 * @param particles - The renderer's particle pool, or `null` when it has none.
 * @param game - The game (the camera the bursts are placed around).
 * @param random - The generator.
 */
export function fillParticles(particles: BenchParticles | null, game: Game, random: Lcg): void {
  if (particles === null) return;
  const presets = particles.content.presets.length;
  if (presets === 0) return;
  const camera = game.world.camera;
  for (let i = 0; i < presets * 4 && particles.liveCount < particles.capacity; i++) {
    particles.emit(
      i % presets,
      camera.x + PLAYFIELD_W * random.next(),
      camera.y + PLAYFIELD_H * random.next(),
      4,
    );
  }
}

/** Drains the tick's events without allocating a closure per tick. */
const IGNORE_EVENT = (): void => {};

/**
 * One simulated tick under the scripted worst-case load, leaving every pool full for the frame
 * that is rendered next — the module docblock's four steps, in that order.
 *
 * @param game - The game.
 * @param particles - The renderer's particle pool, or `null`.
 * @param random - The generator.
 */
export function benchTick(game: Game, particles: BenchParticles | null, random: Lcg): void {
  // 1. The screen clear, on every tick that left a free item slot (re-running it is what stops
  //    the item pool sawtoothing 512 → 256).
  if (game.world.bullets.points.count < MAX_POINT_ITEMS) {
    game.world.bullets.cancelAll(CancelMode.Points, 0);
  }
  // 2. The step frees what the clear marked dead …
  game.step();
  game.events.drain(IGNORE_EVENT);
  // 3. … so the bullet pool is topped up afterwards, never before.
  fillBullets(game, random);
  // 4. And the particles on top.
  fillParticles(particles, game, random);
}

/**
 * The smallest live counts any measured frame carried ({@link trackLoadFloor}).
 *
 * @remarks
 * The bench reports a **floor**, not the last frame's reading (review round 1): a scenario claims
 * "512 bullets, 512 point items, the particle pool full", and the claim has to hold for every
 * frame that was timed. A last-frame reading would have hidden the item pool's sawtooth
 * completely.
 */
export interface LoadFloor {
  /** Fewest live enemy bullets seen. */
  bullets: number;
  /** Fewest live point items seen. */
  points: number;
  /** Fewest live particles seen. */
  particles: number;
}

/**
 * A floor that starts at the maximum each pool can hold, so the first frame lowers it.
 *
 * @param particleCapacity - Particles the renderer's pool holds (0 when it has none).
 * @returns The floor.
 */
export function createLoadFloor(particleCapacity: number): LoadFloor {
  return { bullets: MAX_ENEMY_BULLETS, points: MAX_POINT_ITEMS, particles: particleCapacity };
}

/**
 * Lowers the floor to this frame's live counts where they are smaller.
 *
 * @param floor - The floor so far.
 * @param game - The game whose frame was just rendered.
 * @param particles - The renderer's particle pool, or `null`.
 */
export function trackLoadFloor(
  floor: LoadFloor,
  game: Game,
  particles: BenchParticles | null,
): void {
  const bullets = game.world.bullets;
  if (bullets.pool.count < floor.bullets) floor.bullets = bullets.pool.count;
  if (bullets.points.count < floor.points) floor.points = bullets.points.count;
  const live = particles === null ? 0 : particles.liveCount;
  if (live < floor.particles) floor.particles = live;
}

/**
 * The value at a quantile of ascending samples.
 *
 * @param sorted - Ascending samples.
 * @param q - Quantile 0…1.
 * @returns The sample (0 for no samples at all).
 *
 * @remarks
 * `floor(q * n)` — the bench's own convention, shared with `test/bench/stress.perf.ts` and
 * `test/bench/zones.perf.ts`. The on-device telemetry and its analyzers
 * (`packages/shell/src/telemetry/index.ts`, `tools/input-probe/results/analyze.mjs` and
 * `analyze-render.mjs`) use `floor(q * (n - 1) + 0.5)` instead: both are nearest-rank rules without
 * interpolation and they never differ by more than one sample, which
 * `test/integration/render-telemetry-pipeline.test.ts` pins. They are deliberately **not** unified:
 * changing this one would move the p95s already published in `docs/dev/input-probe-results.md`
 * §11.3 and the budgets tuned against them, and the two sets of milliseconds are declared
 * incomparable anyway (this one runs under SwiftShader).
 */
export function quantile(sorted: Float64Array, q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];
}

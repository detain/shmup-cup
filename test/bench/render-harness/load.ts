/**
 * # render-harness/load — the render bench's scripted worst-case load
 *
 * The part of the render benchmark (plan M3-02c) that decides *what is on screen*: the ordered
 * tick that keeps the enemy-bullet, point-item and particle pools full, the deterministic
 * generator that places them, and the per-frame **floor** the bench reports instead of the last
 * frame's reading.
 *
 * It is its own module — no DOM, no Pixi, no virtual modules: `@shmup/core` for the load and the
 * budgets of `./gates.js` for its gate — because the load is the one part of the bench that can be
 * wrong *silently*. A bench that measures an empty scene while printing confident numbers is worse
 * than no bench, so the order below is pinned by headless tests
 * (`test/integration/render-bench.test.ts`) rather than by the browser run.
 *
 * Since plan **R3-04.M4b** it also holds the gate of the TV bench's **stand-in load**
 * ({@link standinBenchViolations}): that run's scene is built from the very manifest the bench
 * build bakes (`apps/tizen/scripts/bench-decode.mjs` `buildDecodeStandin`), so the counts that make
 * the drawn frame real — the pages, their texture bytes, the enemies and tiles the scene places —
 * are testable in Node, exactly like the tick order above.
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
import { DRAW_CALL_BUDGET, HEAP_BUDGET } from './gates.js';

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

/** The sprite-name prefix of the stand-in zone A art — the mirror of `scene.ts`'s private one. */
const STANDIN_PREFIX = 'standin/zone-a/';

/** Enemy copies per kind in the stand-in frame's row — `scene.ts` `STANDIN_ENEMY_COPIES`. */
const STANDIN_ENEMY_COPIES = 2;

/**
 * Enemy sprites the stand-in scene places: every base enemy kind of the stand-in manifest twice
 * (the staggered row — the boss and its parts are the scene's other batch).
 *
 * @remarks
 * Mirrors `apps/tizen/src/bench/scene.ts` `createStandinScene`'s enemy pick: the
 * {@link STANDIN_PREFIX} names without an `@…` palette variant, whose rest holds no `/` (so not the
 * tiles), is not `far` and does not start `boss`. The gate reads the same manifest the bench build
 * bakes into the page, so the two counts must agree; `test/integration/render-bench.test.ts` pins
 * this mirror against the scene's source, and the browser run pins the figures themselves.
 *
 * @param sprites - Every sprite name of the stand-in manifest.
 * @returns Enemy sprites the scene places.
 */
export function standinEnemyCopies(sprites: readonly string[]): number {
  let kinds = 0;
  for (const name of sprites) {
    if (name.indexOf(STANDIN_PREFIX) !== 0 || name.indexOf('@') >= 0) continue;
    const rest = name.slice(STANDIN_PREFIX.length);
    if (rest.indexOf('/') < 0 && rest !== 'far' && rest.indexOf('boss') !== 0) kinds++;
  }
  return kinds * STANDIN_ENEMY_COPIES;
}

/**
 * The part of the stand-in load's `RenderBenchRecord` (the type in
 * `packages/shell/src/telemetry/index.ts`) the gate reads — the whole record satisfies it, and this
 * module stays browser-free and telemetry-free, like the load itself.
 */
export interface StandinGateRecord {
  /** Scenario id — {@link StandinBenchExpectation.scenario}. */
  readonly scenario: string;
  /** Position in the run — {@link StandinBenchExpectation.index}. */
  readonly index: number;
  /** Internal frame width in pixels. */
  readonly width: number;
  /** Internal frame height in pixels. */
  readonly height: number;
  /** Frames measured free-running. */
  readonly frames: number;
  /** Frames measured in the synced pass. */
  readonly syncedFrames: number;
  /** Whether a filtered layer was on. */
  readonly filter: boolean;
  /** Whether the Mode-7 floor was drawn. */
  readonly mode7: boolean;
  /** WebGL draw calls of the measured frame. */
  readonly drawCalls: number;
  /** Bytes of render targets Pixi pooled. */
  readonly renderTargetBytes: number;
  /** Bytes of the internal frame's own render target. */
  readonly frameTargetBytes: number;
  /** Bytes of the atlas pages as uploaded (`Σ w · h · 4`). */
  readonly textureBytes: number;
  /** Atlas pages the scene drew from. */
  readonly atlasPages: number;
  /** Whether the browser reported a JS heap at all. */
  readonly heapMeasured: boolean;
  /** JS-heap growth over the measured phases, bytes. */
  readonly heapDeltaBytes: number;
  /** What the frame carried. */
  readonly load: {
    /** Enemy sprites placed (not counting the boss and its parts). */
    readonly enemies: number;
    /** Terrain tiles placed. */
    readonly tiles: number;
  };
}

/** What the TV bench's stand-in load must show (plan R3-04.M4b). */
export interface StandinBenchExpectation {
  /** The scenario id of the run's last page load. */
  readonly scenario: string;
  /** Its index: one after the decode scenario's, the run's last page load. */
  readonly index: number;
  /** The frame the scene is built for (`BENCH_V2_SIZE`). */
  readonly width: number;
  /** Its height. */
  readonly height: number;
  /** Pages of the pruned stand-in manifest (the build's group pages). */
  readonly atlasPages: number;
  /** Their texture bytes, `Σ w · h · 4`. */
  readonly textureBytes: number;
  /** Enemy sprites the scene places ({@link standinEnemyCopies}). */
  readonly enemies: number;
  /** Tiles the scene places: the frame's tile columns, a ceiling row and a floor row. */
  readonly tiles: number;
}

/**
 * Every reason the stand-in load's record (plan R3-04.M4b, the run's last page load —
 * `apps/tizen/src/bench/run.ts` `measureStandinScenario`) must fail the headless gate. **No time
 * gate**, as in gates.ts's `tvBenchViolations`: SwiftShader is not the M7; the milliseconds ride
 * along for the zone-load estimate (decision W5-19), which scales the *decode* scenario's page
 * timings.
 *
 * @remarks
 * - the identity: the run's last page load, at the v2 frame (`BENCH_V2_SIZE` — 640×360 since the
 *   flip);
 * - exactly one frame per measured phase (the page renders the scene once, timed, and once more
 *   synced — it is a page load, not a free-running scenario);
 * - a plain frame: no filtered layer, no Mode-7 floor, so no pooled render target; the frame
 *   target `width · height · 4`;
 * - draw calls within {@link DRAW_CALL_BUDGET} — the budget the block's law forbids raising;
 * - the atlas: the manifest's own page count and texture bytes (the scene draws from the pages the
 *   `decode` scenario one load before fetched — equality, not a floor: a wrong page set would
 *   fake the whole measure);
 * - the scene: the enemy row and both tile rows carry the counts the manifest implies;
 * - the heap within {@link HEAP_BUDGET} whenever the browser reports one.
 *
 * @param record - What the bench measured.
 * @param expected - What the load must show.
 * @returns The violations; empty when the record is a real, in-budget stand-in frame.
 */
export function standinBenchViolations(
  record: StandinGateRecord,
  expected: StandinBenchExpectation,
): string[] {
  const out: string[] = [];
  if (record.scenario !== expected.scenario) {
    out.push(`the record is scenario ${record.scenario}, not ${expected.scenario}`);
  }
  if (record.index !== expected.index) {
    out.push(
      `scenario index ${record.index}, expected ${expected.index} (the run's last page load)`,
    );
  }
  if (record.width !== expected.width || record.height !== expected.height) {
    out.push(
      `the frame is ${record.width}×${record.height}, expected ${expected.width}×${expected.height}`,
    );
  }
  if (record.frames !== 1) {
    out.push(`measured ${record.frames} free-running frames; the stand-in load draws exactly one`);
  }
  if (record.syncedFrames !== 1) {
    out.push(`measured ${record.syncedFrames} synced frames; the stand-in load draws exactly one`);
  }
  if (record.filter || record.mode7) {
    out.push('the stand-in frame ran a filter or the Mode-7 floor — it draws neither');
  }
  if (record.renderTargetBytes !== 0) {
    out.push(
      `${record.renderTargetBytes} bytes of pooled render targets, expected none ` +
        '(the frame runs no filter and no Mode-7 floor)',
    );
  }
  if (record.drawCalls <= 0) {
    out.push(`the frame took ${record.drawCalls} draw calls — nothing was drawn, or none counted`);
  } else if (record.drawCalls > DRAW_CALL_BUDGET) {
    out.push(`${record.drawCalls} draw calls, over the budget of ${DRAW_CALL_BUDGET}`);
  }
  if (record.frameTargetBytes !== record.width * record.height * 4) {
    out.push(`the frame target holds ${record.frameTargetBytes} bytes, not width · height · 4`);
  }
  if (record.atlasPages !== expected.atlasPages) {
    out.push(`${record.atlasPages} atlas pages, expected ${expected.atlasPages}`);
  }
  if (record.textureBytes !== expected.textureBytes) {
    out.push(
      `${record.textureBytes} texture bytes, expected ${expected.textureBytes} ` +
        '(Σ page · w · h · 4 of the stand-in manifest)',
    );
  }
  if (record.load.enemies !== expected.enemies) {
    out.push(`the frame placed ${record.load.enemies} enemy sprites, expected ${expected.enemies}`);
  }
  if (record.load.tiles !== expected.tiles) {
    out.push(`the frame placed ${record.load.tiles} tiles, expected ${expected.tiles}`);
  }
  if (record.heapMeasured && !(record.heapDeltaBytes < HEAP_BUDGET)) {
    out.push(
      `the heap grew ${record.heapDeltaBytes} bytes over the measured phases, ` +
        `over the budget of ${HEAP_BUDGET}`,
    );
  }
  return out;
}

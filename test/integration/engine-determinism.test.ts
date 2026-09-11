/**
 * The four engine foundations of M1-01 — `rng`, `math`, `events`, `pools` — driven
 * together as a miniature fixed-step simulation, the way `world/stepWorld` will drive
 * them from M1-06 on.
 *
 * This is the determinism contract of `shmup_feat.md` §22 in its smallest form: the same
 * seed must produce the same state hash on every engine and on every run, a checkpoint
 * must resume into an identical future, and the cosmetic RNG stream must never move the
 * simulation. The committed hashes are a golden fixture ahead of the real golden replays
 * (M1-19): re-bless them only for an intended simulation change, and say why in the
 * commit message.
 */
import { describe, expect, it } from 'vitest';
import {
  RNG_STATE_WORDS,
  SFX_CUES,
  SimEventKind,
  atan2B,
  clamp,
  createEventQueue,
  createRngStreams,
  createSoaPool,
  cosB,
  quantizeAngle,
  sinB,
  turnToward,
  type EventQueue,
  type Rng,
  type RngStreams,
} from '@shmup/core';

/** Layout of the toy bullet pool; deliberately uses several field widths. */
const BULLET_SCHEMA = {
  x: 'f64',
  y: 'f64',
  vx: 'f64',
  vy: 'f64',
  angle: 'u16',
  life: 'u16',
  kind: 'u8',
} as const;

/** Playfield the toy sim runs in (shmup_plan.md D19/D20: 384×200 playfield). */
const WIDTH = 384;
const HEIGHT = 200;

/** Bullets alive at once — the M1-09 budget from shmup_feat.md §22. */
const CAPACITY = 512;

/** One toy simulation: pools + streams + the event queue it emits through. */
interface MiniSim {
  /** The bullet storage. */
  readonly bullets: ReturnType<typeof createSoaPool<typeof BULLET_SCHEMA>>;
  /** Gameplay and cosmetic RNG. */
  readonly rng: RngStreams;
  /** Presentation events the tick emits. */
  readonly events: EventQueue;
  /** Player position, moved by a deterministic pattern. */
  player: { x: number; y: number };
  /** Ticks elapsed. */
  tick: number;
  /** Running FNV-1a hash of everything the simulation did. */
  hash: number;
}

/**
 * Creates a toy simulation.
 *
 * @param seed - Session seed.
 * @returns A fresh simulation at tick 0.
 */
function createMiniSim(seed: number): MiniSim {
  return {
    bullets: createSoaPool(CAPACITY, BULLET_SCHEMA),
    rng: createRngStreams(seed),
    events: createEventQueue(64),
    player: { x: 64, y: 100 },
    tick: 0,
    hash: 0x811c9dc5,
  };
}

/** Scratch view used to hash the exact float64 bits of a value (reused, never grown). */
const HASH_FLOATS = new Float64Array(1);
const HASH_BYTES = new Uint8Array(HASH_FLOATS.buffer);

/**
 * Folds one number into an FNV-1a hash over its float64 bits.
 *
 * @param hash - Current hash.
 * @param value - Value to fold; hashing the bits keeps 0 and -0 distinguishable.
 * @returns The new hash as an unsigned 32-bit integer.
 */
function fold(hash: number, value: number): number {
  HASH_FLOATS[0] = value;
  let next = hash;
  for (let i = 0; i < 8; i += 1) {
    next = Math.imul((next ^ HASH_BYTES[i]) >>> 0, 0x01000193) >>> 0;
  }
  return next;
}

/** Reused destination for `getStateInto` — the zero-allocation state accessor. */
const RNG_SNAPSHOT = new Uint32Array(RNG_STATE_WORDS);

/**
 * Advances a simulation by one tick: spawn, aim, move, cull, emit, flush, hash.
 *
 * @param sim - The simulation to step.
 */
function step(sim: MiniSim): void {
  const { bullets, rng, events } = sim;
  const fields = bullets.fields;

  // 1 — player moves on a fixed table-driven path (no Math.sin anywhere).
  sim.player.x = clamp(64 + 40 * cosB(sim.tick * 3), 8, WIDTH - 8);
  sim.player.y = clamp(100 + 60 * sinB(sim.tick * 5), 8, HEIGHT - 8);

  // 2 — spawn a seeded burst aimed at the player, quantised to 32 directions.
  const spawns = rng.gameplay.rangeInt(0, 3);
  for (let i = 0; i < spawns; i += 1) {
    const slot = bullets.alloc();
    if (slot < 0) {
      events.push(SimEventKind.Sfx, SFX_CUES.EnemyHit, 0, 0, 0);
      break;
    }
    const sx = rng.gameplay.rangeInt(WIDTH - 32, WIDTH - 1);
    const sy = rng.gameplay.rangeInt(8, HEIGHT - 8);
    const aim = quantizeAngle(atan2B(sim.player.y - sy, sim.player.x - sx), 32);
    const speed = 1 + rng.gameplay.nextFloat();
    fields.x[slot] = sx;
    fields.y[slot] = sy;
    fields.vx[slot] = cosB(aim) * speed;
    fields.vy[slot] = sinB(aim) * speed;
    fields.angle[slot] = aim;
    fields.life[slot] = 240;
    fields.kind[slot] = rng.gameplay.rangeInt(0, 3);
  }

  // 3 — move, home slightly, cull. Freeing during iteration must be safe.
  for (let i = 0; i < bullets.count; i += 1) {
    if (fields.kind[i] === 3) {
      const target = atan2B(sim.player.y - fields.y[i], sim.player.x - fields.x[i]);
      const angle = turnToward(fields.angle[i], target, 4);
      fields.angle[i] = angle;
      fields.vx[i] = cosB(angle);
      fields.vy[i] = sinB(angle);
    }
    fields.x[i] += fields.vx[i];
    fields.y[i] += fields.vy[i];
    fields.life[i] -= 1;
    const gone =
      fields.life[i] === 0 ||
      fields.x[i] < -16 ||
      fields.x[i] > WIDTH + 16 ||
      fields.y[i] < -16 ||
      fields.y[i] > HEIGHT + 16;
    if (gone) {
      bullets.free(i);
      events.push(SimEventKind.Particles, fields.kind[i], fields.x[i], fields.y[i], 1);
    }
  }
  bullets.flush();

  // 4 — cosmetic randomness: presentation only, must not touch the hash.
  if (rng.cosmetic.nextFloat() > 0.75) {
    events.push(SimEventKind.Shake, 0, 0, 0, rng.cosmetic.nextFloat() * 2);
  }

  // 5 — hash the whole simulation state.
  let hash = fold(fold(sim.hash, sim.player.x), sim.player.y);
  hash = fold(hash, bullets.count);
  for (let i = 0; i < bullets.count; i += 1) {
    hash = fold(fold(hash, fields.x[i]), fields.y[i]);
    hash = fold(fold(hash, fields.angle[i]), fields.life[i]);
    hash = fold(hash, fields.kind[i]);
  }
  rng.gameplay.getStateInto(RNG_SNAPSHOT);
  for (let i = 0; i < RNG_STATE_WORDS; i += 1) hash = fold(hash, RNG_SNAPSHOT[i]);
  sim.hash = hash;
  sim.tick += 1;
}

/**
 * Runs a simulation for `ticks` ticks, draining its events every tick.
 *
 * @param sim - The simulation to run.
 * @param ticks - How many ticks to advance.
 * @returns How many events the run drained.
 */
function run(sim: MiniSim, ticks: number): number {
  let drained = 0;
  for (let i = 0; i < ticks; i += 1) {
    step(sim);
    sim.events.drain(() => {
      drained += 1;
    });
  }
  return drained;
}

/**
 * Committed state hashes after 600 ticks — the golden fixture of this step.
 *
 * @remarks
 * A change here means the engine foundations changed how the simulation evolves. That
 * is allowed, but only deliberately: re-run the test, paste the new numbers and state
 * the reason in the commit message (shmup_plan.md §1.3).
 */
const GOLDEN: readonly { readonly seed: number; readonly hash: number }[] = [
  { seed: 0x5eedc0de, hash: 243839169 },
  { seed: 1, hash: 1678529732 },
  { seed: 0, hash: 2674921096 },
];

describe('engine foundations: one seed, one simulation', () => {
  it('reproduces the same state hash from the same seed', () => {
    for (const { seed } of GOLDEN) {
      const first = createMiniSim(seed);
      const second = createMiniSim(seed);
      run(first, 600);
      run(second, 600);
      expect(second.hash, `seed ${String(seed)}`).toBe(first.hash);
      expect(second.bullets.count).toBe(first.bullets.count);
      expect(second.player).toEqual(first.player);
    }
  });

  it('gives different seeds different histories', () => {
    const hashes = new Set<number>();
    for (const { seed } of GOLDEN) {
      const sim = createMiniSim(seed);
      run(sim, 600);
      hashes.add(sim.hash);
    }
    expect(hashes.size).toBe(GOLDEN.length);
  });

  it('is unaffected by how much cosmetic randomness the presentation burns', () => {
    const plain = createMiniSim(0x5eedc0de);
    run(plain, 400);

    const noisy = createMiniSim(0x5eedc0de);
    for (let i = 0; i < 400; i += 1) {
      for (let j = 0; j < 17; j += 1) noisy.rng.cosmetic.nextU32();
      step(noisy);
      noisy.events.drain(() => undefined);
    }
    expect(noisy.hash).toBe(plain.hash);
  });

  it('resumes identically from a mid-run RNG checkpoint', () => {
    const reference = createMiniSim(7);
    run(reference, 300);

    const resumed = createMiniSim(7);
    run(resumed, 150);
    const checkpoint = resumed.rng.gameplay.getState();
    // Burn the stream, then wind it back — the next 150 ticks must be unchanged.
    for (let i = 0; i < 1000; i += 1) resumed.rng.gameplay.nextU32();
    resumed.rng.gameplay.setState(checkpoint);
    run(resumed, 150);

    expect(resumed.hash).toBe(reference.hash);
  });

  it('keeps the pool packed and inside its budget for the whole run', () => {
    const sim = createMiniSim(0x5eedc0de);
    for (let i = 0; i < 600; i += 1) {
      step(sim);
      sim.events.drain(() => undefined);
      expect(sim.bullets.pendingFreeCount).toBe(0);
      expect(sim.bullets.count).toBeLessThanOrEqual(CAPACITY);
      expect(sim.bullets.count).toBeGreaterThanOrEqual(0);
    }
    expect(sim.bullets.count).toBeGreaterThan(0);
  });

  it('drains every event it emits without ever overflowing the ring', () => {
    const sim = createMiniSim(3);
    const drained = run(sim, 600);
    expect(drained).toBeGreaterThan(100);
    expect(sim.events.dropped).toBe(0);
    expect(sim.events.length).toBe(0);
  });

  it('never lets a bullet escape the culling window or carry a non-finite value', () => {
    const sim = createMiniSim(0x0badf00d);
    const bad: string[] = [];
    for (let tick = 0; tick < 600; tick += 1) {
      step(sim);
      sim.events.drain(() => undefined);
      const fields = sim.bullets.fields;
      for (let i = 0; i < sim.bullets.count; i += 1) {
        if (
          !Number.isFinite(fields.x[i]) ||
          !Number.isFinite(fields.y[i]) ||
          fields.x[i] < -16 ||
          fields.x[i] > WIDTH + 16 ||
          fields.y[i] < -16 ||
          fields.y[i] > HEIGHT + 16 ||
          fields.angle[i] >= 1024
        ) {
          bad.push(`tick ${String(tick)} slot ${String(i)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('matches the committed golden hashes (re-bless only for an intended sim change)', () => {
    const actual = GOLDEN.map(({ seed }) => {
      const sim = createMiniSim(seed);
      run(sim, 600);
      return { seed, hash: sim.hash };
    });
    expect(actual).toEqual(GOLDEN.map(({ seed, hash }) => ({ seed, hash })));
  });
});

describe('engine foundations: the RNG stays a pure function of its state', () => {
  /**
   * Draws `n` words from a stream.
   *
   * @param rng - The stream to draw from.
   * @param n - How many words.
   * @returns The drawn words.
   */
  const take = (rng: Rng, n: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < n; i += 1) out.push(rng.nextU32());
    return out;
  };

  it('produces the same words from a restored state as from the original stream', () => {
    const { gameplay } = createRngStreams(0x5eedc0de);
    take(gameplay, 1000);
    const state = gameplay.getState();
    const expected = take(gameplay, 1000);
    gameplay.setState(state);
    expect(take(gameplay, 1000)).toEqual(expected);
  });
});

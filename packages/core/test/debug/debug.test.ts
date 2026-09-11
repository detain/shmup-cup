/**
 * Tests for the debug module (plan M1-06): the default debug switches and `hashWorld` — equal
 * for equal states, sensitive to every covered part of the state (tick, both RNG streams,
 * camera, status, hit-stop, player fields, pool slots), independent of how a pool schema was
 * written, read-only and allocation-free apart from its boxed return value.
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import {
  FNV_OFFSET_BASIS,
  FNV_PRIME,
  createDebugFlags,
  hashWorld,
  moduleInfo,
} from '../../src/debug/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { createSoaPool } from '../../src/pools/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

/**
 * A fresh world on the empty content DB.
 *
 * @param seed - Config seed.
 * @returns The world.
 */
function world(seed = 1): World {
  return createWorld(resolveGameConfig({ seed }), EMPTY_CONTENT_DB);
}

describe('core/debug', () => {
  it('describes itself and creates switches that are all off', () => {
    expect(moduleInfo.name).toBe('debug');
    expect(moduleInfo.status).toBe('partial');
    expect(createDebugFlags()).toEqual({
      godMode: false,
      showHitboxes: false,
      frameAdvance: false,
      slowMo: 1,
    });
    expect(createDebugFlags()).not.toBe(createDebugFlags());
    expect([FNV_OFFSET_BASIS, FNV_PRIME]).toEqual([2166136261, 16777619]);
  });

  it('hashes equal states equally, as an unsigned 32-bit number', () => {
    const h = hashWorld(world());
    expect(Number.isInteger(h) && h >= 0 && h <= 0xffffffff).toBe(true);
    expect(hashWorld(world())).toBe(h);
    expect(hashWorld(world(2))).not.toBe(h);
  });

  it.each([
    ['tick', (w: World) => void (w.tick = 1)],
    ['gameplay RNG', (w: World) => void w.rng.gameplay.nextU32()],
    ['cosmetic RNG', (w: World) => void w.rng.cosmetic.nextU32()],
    ['camera x', (w: World) => void (w.camera.x = 0.5)],
    ['camera velocity', (w: World) => void (w.camera.vy = -1)],
    ['status', (w: World) => void (w.status = 'gameOver')],
    ['hit-stop', (w: World) => void (w.hitStop = 4)],
    ['player x', (w: World) => void (w.players[0].x += 1e-9)],
    ['player state', (w: World) => void (w.players[0].state = 'alive')],
    ['player speed level', (w: World) => void (w.players[0].speedLevel = 1)],
    ['player bank', (w: World) => void (w.players[0].bank = -1)],
    ['player 2 active', (w: World) => void (w.players[1].active = true)],
    ['player invulnerability', (w: World) => void (w.players[0].invulnTicks = 1)],
  ])('changes when the %s changes', (_label, mutate) => {
    const a = world();
    const b = world();
    mutate(b);
    expect(hashWorld(b)).not.toBe(hashWorld(a));
  });

  it("covers every registered pool's live slots, in sorted field order", () => {
    const a = world();
    const b = world();
    const pa = a.pools.register('p', createSoaPool(8, { x: 'f64', flags: 'u8' }));
    const pb = b.pools.register('p', createSoaPool(8, { flags: 'u8', x: 'f64' }));
    expect(hashWorld(a)).toBe(hashWorld(b));
    pa.fields.x[pa.alloc()] = 3;
    pb.fields.x[pb.alloc()] = 3;
    expect(hashWorld(a)).toBe(hashWorld(b));
    pb.fields.flags[0] = 1;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
    // Dead slots beyond `count` do not matter.
    pb.fields.flags[0] = 0;
    pa.fields.x[5] = 99;
    expect(hashWorld(a)).toBe(hashWorld(b));
  });

  it('reads the state only: hashing twice gives the same value and draws no RNG', () => {
    const w = world();
    stepWorld(w, createInputSnapshot());
    const calls = w.rng.gameplay.callCount;
    expect(hashWorld(w)).toBe(hashWorld(w));
    expect(w.rng.gameplay.callCount).toBe(calls);
  });

  it('does not allocate per hashed value (only the boxed result, if anything)', () => {
    const w = world();
    const pool = w.pools.register('p', createSoaPool(64, { x: 'f64', y: 'f64' }));
    for (let i = 0; i < 64; i++) pool.fields.x[pool.alloc()] = i + 0.5;
    let sink = 0;
    // ~150 values per hash: boxing each would cost > 2 KB per call.
    const growth = measureHeapGrowth(
      () => {
        sink ^= hashWorld(w);
      },
      10_000,
      20_000,
    );
    expect(sink).not.toBe(0.5);
    expect(growth.bytesPerIteration).toBeLessThan(128);
  });
});

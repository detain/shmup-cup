/**
 * Tests for the showcase scene: every sprite it names exists in the real atlas, its world
 * view covers the layers it demonstrates, update() is a pure function of the game tick that
 * reuses its frame, the starfield covers the playfield, and the UI list is built once.
 */
import {
  DrawOp,
  LayerId,
  PLAYFIELD_H,
  PLAYFIELD_W,
  SpriteFlag,
  createDrawList,
  type RenderFrame,
  type SpriteBatchView,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { SHOWCASE_SPRITES, createShowcase, moduleInfo } from '../../src/showcase/index.js';

/**
 * A game-like frame at a tick.
 *
 * @param tick - Tick.
 */
function gameFrame(tick: number): RenderFrame {
  return {
    tick,
    alpha: 0.25,
    world: null,
    hud: createDrawList(1, 1),
    ui: createDrawList(1, 1),
    screen: { shakeX: 0, shakeY: 0, flash: 0, dim: 0 },
  };
}

/**
 * Snapshot of a batch's live slots.
 *
 * @param batch - Batch.
 */
function slots(batch: SpriteBatchView) {
  return Array.from({ length: batch.count }, (_, i) => [
    batch.x[i],
    batch.y[i],
    batch.spriteId[i],
    batch.frame[i],
    batch.flags[i],
  ]);
}

describe('shell/showcase', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('showcase');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('names only sprites the asset pipeline produces', () => {
    const { manifest } = buildAtlas();
    for (const name of SHOWCASE_SPRITES) expect(Object.keys(manifest.sprites)).toContain(name);
  });

  it('shows starfields, enemies, the ship with Options and bullets on their layers', () => {
    const showcase = createShowcase();
    expect(showcase.spriteNames).toBe(SHOWCASE_SPRITES);
    expect(showcase.world.batches.map((batch) => batch.layer)).toEqual([
      LayerId.BgFar,
      LayerId.BgMid,
      LayerId.AirEnemies,
      LayerId.Player,
      LayerId.EnemyBullets,
    ]);
    const frame = showcase.update(gameFrame(100));
    expect(frame).toBe(showcase.frame);
    expect(frame.world).toBe(showcase.world);
    expect([frame.tick, frame.alpha]).toEqual([100, 0.25]);
    for (const batch of showcase.world.batches) {
      expect(batch.count).toBeGreaterThan(0);
      expect(batch.count).toBeLessThanOrEqual(batch.capacity);
    }
    const player = showcase.world.batches[3];
    expect(Array.from(player.spriteId).slice(0, player.count)).toEqual([5, 5, 4, 3]);
  });

  it('is a pure function of the tick and reuses its objects', () => {
    const a = createShowcase();
    const b = createShowcase();
    a.update(gameFrame(10));
    a.update(gameFrame(777));
    b.update(gameFrame(777));
    a.world.batches.forEach((batch, i) => expect(slots(batch)).toEqual(slots(b.world.batches[i])));
    const before = a.world.batches.map(slots);
    a.update(gameFrame(778));
    expect(a.world.batches.map(slots)).not.toEqual(before);
  });

  it('tiles every starfield layer over the whole playfield at any scroll offset', () => {
    const showcase = createShowcase();
    for (const tick of [0, 1, 257, 5000]) {
      showcase.update(gameFrame(tick));
      const [far, mid] = showcase.world.batches;
      for (const batch of [far, mid]) {
        for (let i = 0; i < batch.count; i++) {
          expect(batch.x[i]).toBeLessThanOrEqual(PLAYFIELD_W);
        }
        const xs = Array.from({ length: batch.count }, (_, i) => batch.x[i]);
        const ys = Array.from({ length: batch.count }, (_, i) => batch.y[i]);
        expect(Math.min(...xs)).toBeLessThanOrEqual(0);
        expect(Math.max(...xs) + 128).toBeGreaterThanOrEqual(PLAYFIELD_W);
        expect(Math.max(...ys) + 128).toBeGreaterThanOrEqual(PLAYFIELD_H);
      }
    }
  });

  it('flashes drifters now and then (hit-flash demo)', () => {
    const showcase = createShowcase();
    let flashes = 0;
    for (let tick = 0; tick < 48; tick++) {
      showcase.update(gameFrame(tick));
      const air = showcase.world.batches[2];
      for (let i = 0; i < air.count; i++) if ((air.flags[i] & SpriteFlag.Flash) !== 0) flashes++;
    }
    expect(flashes).toBe(10);
  });

  it('rebuilds the HUD every frame with number ops, builds the UI once', () => {
    const showcase = createShowcase();
    const { hud, ui } = showcase.frame;
    expect(ui.count).toBe(3);
    expect(ui.strings.slice(0, 3)).toEqual([
      'SHMUP CUP',
      'SPRITE SHOWCASE',
      '?SCENE=CALIBRATION FOR THE TEST PATTERN',
    ]);
    const uiRevision = ui.revision;
    showcase.update(gameFrame(5));
    showcase.update(gameFrame(6));
    expect(ui.revision).toBe(uiRevision);
    const numbers = Array.from({ length: hud.count }, (_, i) => i).filter(
      (i) => hud.op[i] === DrawOp.Number,
    );
    expect(numbers.map((i) => hud.value[i])).toEqual([60, 50000, 0]);
    expect(hud.dropped).toBe(0);
  });
});

/**
 * Allocation guard of the rarer bullet paths (plan M1-09), in its own file (a fresh worker, so V8's
 * type feedback comes only from this world — see `bullets-alloc.test.ts`): delayed bullets that
 * re-aim when they launch, changing bullets (new speed, re-aim at a given age), lasers attached to
 * an enemy slot that are detached while warning, growing or active, and `cancelAllBullets` with
 * its sparkle events emptying a busy pool every 40 ticks.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AIM_AT_TARGET,
  BulletOrigin,
  CancelMode,
  UNCHANGED,
  cancelAllBullets,
  fireLaser,
} from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { fireDelayed, fireRing } from '../../src/patterns/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

/**
 * A shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The file.
 */
function shipped(path: string): ContentFile {
  return {
    path,
    data: JSON.parse(
      readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
    ) as unknown,
  };
}

/**
 * The KESTREL and the engine sprites (free flight: no stage needed).
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const { db: content, issues } = loadContent([shipped('player/kestrel.player.json')], {
    extraSprites: ENGINE_SPRITES,
  });
  expect(issues).toEqual([]);
  return content;
}

/**
 * A free-flight world whose ship is alive, parked mid-view and invulnerable.
 *
 * @returns The world.
 */
function world(): World {
  const w = createWorld(resolveGameConfig({ seed: 4 }), db());
  const input = createInputSnapshot();
  for (let i = 0; i < 60; i++) stepWorld(w, input);
  w.players[0].x = 150;
  w.players[0].y = 100;
  w.players[0].invulnTicks = 1e9;
  return w;
}

describe('core/bullets allocation (delays, changes, detach, cancel)', () => {
  it('allocates nothing over ticks that delay, change, detach and cancel', () => {
    const w = world();
    const b = w.bullets;
    // An enemy slot the attached lasers follow (moved by hand; its system never sees it).
    const source = w.enemies.enemies[2];
    source.x = 320;
    source.y = 60;
    const src = { slot: 2, x: 320, y: 60 };
    const ring = new BulletOrigin();
    ring.x = 250;
    ring.y = 110;
    const gun = new BulletOrigin();
    gun.x = 300;
    gun.y = 80;
    const input = createInputSnapshot();
    let t = 0;
    let cancelled = 0;
    let peak = 0;
    const growth = measureHeapGrowth(
      () => {
        if (t % 4 === 0) fireRing(b, ring, 8, 1, t % 9, t & 1023);
        if (t % 6 === 0) {
          const i = fireDelayed(b, gun, 10, 2, 3);
          if (i >= 0) b.setChange(i, 20, 1, AIM_AT_TARGET);
          const j = b.spawn(200, 40, 256, 1, 4);
          if (j >= 0) b.setChange(j, 15, UNCHANGED, 700);
        }
        if (t % 25 === 0) {
          fireLaser(w, src, 512, 200, 6, 4, 10, 6, 4);
          fireLaser(w, src, 640, 150, 0, 3, 20, 4, 3);
        }
        if (t % 25 === 12) b.detachLasers(2);
        source.y = 60 + (t & 15);
        if (t % 40 === 39) {
          if (b.count > peak) peak = b.count;
          cancelled += cancelAllBullets(w, CancelMode.Sparkle);
        }
        t++;
        stepWorld(w, input);
        w.events.clear();
      },
      10_000,
      20_000,
    );
    expect(cancelled).toBeGreaterThan(0);
    expect(peak).toBeGreaterThan(50);
    expect(w.players[0].hits).toBe(0);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 60_000);
});

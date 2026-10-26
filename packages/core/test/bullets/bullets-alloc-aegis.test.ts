/**
 * Allocation guard of the Aegis swallow path (w15-WB): `BulletSystem.aegisSweep` run over a pool
 * kept busy with bullets streamed at the ship's line, the dishes rotating through the wedge —
 * the sparkle pushes, the point items and the kill all ride the measured loop. The sweep runs
 * both inside `stepWorld` (the World's movement phase) and explicitly once per tick, so the
 * measured call always sees a full pool. The guard lives in its own file so V8's type feedback
 * comes only from this world (`bullets-alloc-cancel.test.ts` family).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BulletKind } from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
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
 * The KESTREL and the engine sprites (free flight; no weapon is ever fired here).
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
 * A free-flight Aegis world with two dishes flying, the ship parked mid-view and invulnerable.
 *
 * @returns The world.
 */
function world(): World {
  const w = createWorld(
    resolveGameConfig({ seed: 4, optionChoice: 'aegis', autofire: false, remoteMode: false }),
    db(),
  );
  const input = createInputSnapshot();
  for (let i = 0; i < 60; i++) stepWorld(w, input);
  w.players[0].x = 150;
  w.players[0].y = 100;
  w.players[0].invulnTicks = 1e9;
  w.weapons.loadouts[0].options = 2;
  stepWorld(w, input); // equip the two dishes
  return w;
}

describe('core/bullets allocation (the aegisSweep swallow path)', () => {
  it('allocates nothing over ticks of sweeping a busy pool past rotating dishes', () => {
    const w = world();
    const b = w.bullets;
    const input = createInputSnapshot();
    let t = 0;
    let peak = 0;
    let pointPeak = 0;
    const growth = measureHeapGrowth(
      () => {
        // Two bullets into the wedge every tick, at the ship's line: the pool stays loaded,
        // the dishes catch what they pass (the World pipeline's sweep runs inside stepWorld;
        // the explicit one below measures the same call against the survivors).
        b.spawn(260 + (t % 30), 100 + (t % 9) - 4, 512, 2, BulletKind.OvalRed);
        b.spawn(230 + (t % 40), 102 - (t % 7), 514, 2, BulletKind.OvalRed);
        if (b.count > peak) peak = b.count;
        b.aegisSweep(w.weapons.options);
        stepWorld(w, input);
        if (b.points.count > pointPeak) pointPeak = b.points.count;
        w.events.clear();
        t++;
      },
      10_000,
      20_000,
    );
    expect(pointPeak, 'the sweep really swallowed bullets into points').toBeGreaterThan(2);
    expect(peak, 'the pool really stayed busy').toBeGreaterThan(40);
    expect(w.players[0].hits).toBe(0);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 60_000);
});

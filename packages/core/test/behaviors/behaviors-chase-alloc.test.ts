/**
 * Allocation guard of the M2-13 enemy behaviour `cell.chase` (definition of done: zero allocations
 * per tick), in its own file so the worker's V8 type feedback comes only from this world: in free
 * flight six chasing cells chase the weaving, invulnerable KESTREL for good (a variant with an
 * endless chase crawling at 0.002 px/tick — the `Homing` mover turns every tick, the script sleeps)
 * and six more swim straight on after a one-tick chase (a variant as slow). Every spawn allocates
 * its coroutine (decision D29) and so does every script wake: all of them happen in the warm-up,
 * nothing may allocate afterwards.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyState } from '../../src/enemies/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { MoverKind } from '../../src/patterns/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld } from '../../src/world/index.js';
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
 * The KESTREL, zone F's roster and two chasing-cell variants: one chasing for good, one past its
 * chase.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const zoneF = shipped('enemies/zone-f.enemies.json');
  const cell = (zoneF.data as { enemies: { id: string }[] }).enemies.find(
    (e) => e.id === 'chaser-cell',
  );
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      zoneF,
      shipped('patterns/zones.patterns.json'),
      {
        path: 'enemies/v.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            { ...cell, id: 'cell-chase', params: { speed: 0.002, enterTicks: 2, chaseTicks: 1e9 } },
            { ...cell, id: 'cell-drift', params: { speed: 0.002, enterTicks: 2, chaseTicks: 1 } },
          ],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

describe('core/behaviors cell.chase allocation (M2-13)', () => {
  it('allocates nothing per tick while cells chase the ship or swim straight on', () => {
    const content = db();
    const w = createWorld(
      resolveGameConfig({ seed: 5, autofire: false, remoteMode: false }),
      content,
    );
    w.debugFlags.godMode = true;
    const input = createInputSnapshot();
    const step = (): void => {
      stepWorld(w, input);
      w.events.clear();
    };
    const creep = content.enemyIndex.get('cell-chase') ?? -1;
    const hold = content.enemyIndex.get('cell-drift') ?? -1;
    for (let k = 0; k < 6; k++) {
      expect(w.enemies.spawn(creep, w.camera.x + 300, w.camera.y + 20 + k * 30)).not.toBeNull();
      expect(w.enemies.spawn(hold, w.camera.x + 200, w.camera.y + 30 + k * 28)).not.toBeNull();
    }
    // Every spawn and script wake happens here.
    for (let i = 0; i < 400; i++) step();
    const live = (id: number): number =>
      w.enemies.enemies.filter((e) => e.state === EnemyState.Live && e.specIndex === id).length;
    expect(live(creep)).toBe(6);
    expect(live(hold)).toBe(6);
    let t = 0;
    const growth = measureHeapGrowth(
      () => {
        commitPlayerInput(input.players[0], (t / 40) % 2 < 1 ? Action.Up : Action.Down);
        t++;
        step();
      },
      10_000,
      10_000,
    );
    // Still chasing (turning), still swimming straight on (a turn rate of 0).
    expect(live(creep)).toBe(6);
    expect(live(hold)).toBe(6);
    for (const e of w.enemies.enemies) {
      if (e.state !== EnemyState.Live) continue;
      expect(e.mover).toBe(MoverKind.Homing);
      expect(e.m1).toBe(e.specIndex === creep ? 6 : 0); // the default turn rate
    }
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);
});

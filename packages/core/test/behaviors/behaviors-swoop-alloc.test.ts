/**
 * Allocation guard of the M2-12 enemy behaviour `rear.swoop` (definition of done: zero allocations
 * per tick), in its own file so the worker's V8 type feedback comes only from this world: in free
 * flight six squall jumpers creep towards their turn point (a variant crawling at 0.004 px/tick —
 * the `Waypoint` mover's approach runs every tick, the script sleeps until the turn) and six more,
 * in from behind, wait at theirs for good (a variant with an endless hold, after its one shot),
 * while the invulnerable KESTREL weaves behind them all (touching one would destroy it). Every
 * spawn allocates its coroutine (decision D29) and so does every script wake: all of them happen in
 * the warm-up, nothing may allocate afterwards.
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
 * The KESTREL, zone E's roster and two jumper variants: one creeping, one holding for good.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const zoneE = shipped('enemies/zone-e.enemies.json');
  const jumper = (zoneE.data as { enemies: { id: string }[] }).enemies.find(
    (e) => e.id === 'squall-jumper',
  );
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      zoneE,
      shipped('patterns/zones.patterns.json'),
      {
        path: 'enemies/v.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            { ...jumper, id: 'jumper-creep', params: { speed: 0.004, turnX: 300 } },
            { ...jumper, id: 'jumper-hold', params: { speed: 2, turnX: 200, hold: 1e9 } },
          ],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

describe('core/behaviors rear.swoop allocation (M2-12)', () => {
  it('allocates nothing per tick while jumpers creep in from behind or hold at their turn', () => {
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
    const creep = content.enemyIndex.get('jumper-creep') ?? -1;
    const hold = content.enemyIndex.get('jumper-hold') ?? -1;
    for (let k = 0; k < 6; k++) {
      expect(w.enemies.spawn(creep, w.camera.x + 90, w.camera.y + 20 + k * 30)).not.toBeNull();
      expect(w.enemies.spawn(hold, w.camera.x - 24, w.camera.y + 30 + k * 28)).not.toBeNull();
    }
    // Every spawn and script wake happens here (the holders fire once they reach x 200).
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
    // Still creeping, still holding.
    expect(live(creep)).toBe(6);
    expect(live(hold)).toBe(6);
    for (const e of w.enemies.enemies) {
      if (e.state === EnemyState.Live) expect(e.mover).toBe(MoverKind.Waypoint);
    }
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);
});

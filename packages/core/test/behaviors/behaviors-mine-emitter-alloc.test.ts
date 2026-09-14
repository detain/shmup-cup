/**
 * Allocation guard of the M2-14 enemy behaviours `emitter.laser` and `mine.burst` (definition of
 * done: zero allocations per tick), in its own file so the worker's V8 type feedback comes only from
 * this world: in free flight four laser emitters fire their attached lanes over and over and four
 * depth mines (a variant that holds still) wait just out of the weaving, invulnerable KESTREL's
 * reach — their proximity test runs in the enemy system's movement phase
 * (`ScriptApi.sleepUntilNear`), so a waiting mine never wakes its script. Every spawn allocates its
 * coroutine (decision D29) and every script wake its result: the emitters wake once per lane.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyState } from '../../src/enemies/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
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
 * The KESTREL and the zone H and I rosters, with a mine variant that never drifts off.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const zoneI = shipped('enemies/zone-i.enemies.json');
  const mine = (zoneI.data as { enemies: { id: string }[] }).enemies.find(
    (e) => e.id === 'depth-mine',
  );
  const { db: content } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('enemies/zone-h.enemies.json'),
      zoneI,
      shipped('patterns/zones.patterns.json'),
      {
        path: 'enemies/v.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [{ ...mine, id: 'mine-still', params: { speed: 0, amp: 0, trigger: 40 } }],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  return content;
}

describe('core/behaviors emitter.laser and mine.burst allocation (M2-14)', () => {
  it('allocates nothing per tick while emitters fire their lanes and mines wait', () => {
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
    const emitter = content.enemyIndex.get('laser-emitter') ?? -1;
    const mine = content.enemyIndex.get('mine-still') ?? -1;
    for (let k = 0; k < 4; k++) {
      expect(w.enemies.spawn(emitter, w.camera.x + 330, w.camera.y + 20 + k * 50)).not.toBeNull();
      expect(w.enemies.spawn(mine, w.camera.x + 250, w.camera.y + 30 + k * 45)).not.toBeNull();
    }
    for (let i = 0; i < 600; i++) step();
    const live = (id: number): number =>
      w.enemies.enemies.filter((e) => e.state === EnemyState.Live && e.specIndex === id).length;
    expect(live(emitter)).toBe(4);
    expect(live(mine)).toBe(4);
    let t = 0;
    let lanes = 0;
    const growth = measureHeapGrowth(
      () => {
        commitPlayerInput(input.players[0], (t / 40) % 2 < 1 ? Action.Up : Action.Down);
        t++;
        step();
        lanes += w.bullets.lasers.count;
      },
      10_000,
      10_000,
    );
    expect(live(emitter)).toBe(4);
    expect(live(mine)).toBe(4);
    expect(lanes).toBeGreaterThan(0);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);
});

/**
 * Allocation guard of the M2-11 enemy behaviours `rocket.homing` and `worm.burst` (definition of
 * done: zero allocations per tick), in its own file so the worker's V8 type feedback comes only
 * from this world: in free flight a dozen rockets home on the weaving, invulnerable KESTREL for
 * good (a variant with an endless homing time — their scripts sleep after their last wake, the
 * `Homing` mover runs every tick) while two sand worms lie in wait out of the ship's reach (the
 * armed `Ballistic` leaders checking their trigger every tick, the segments on `Follow`). Every
 * spawn allocates its coroutine (decision D29) and so does every script wake: all of them happen
 * in the warm-up, nothing may allocate afterwards.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { DropKind, EnemyState } from '../../src/enemies/index.js';
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
 * The KESTREL, zone B and C's rosters and a rocket that never stops homing.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const zoneB = shipped('enemies/zone-b.enemies.json');
  const rocket = (zoneB.data as { enemies: { id: string }[] }).enemies.find(
    (e) => e.id === 'maw-rocket',
  );
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      zoneB,
      shipped('enemies/zone-c.enemies.json'),
      shipped('patterns/zones.patterns.json'),
      {
        path: 'enemies/v.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            {
              ...rocket,
              id: 'rocket-endless',
              params: { launchTicks: 10, speed: 0.8, turnRate: 4, homeTicks: 1e9 },
            },
          ],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

describe('core/behaviors rocket.homing / worm.burst allocation (M2-11)', () => {
  it('allocates nothing per tick while rockets home and worms lie in wait', () => {
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
    const rocket = content.enemyIndex.get('rocket-endless') ?? -1;
    const worm = content.enemyIndex.get('dune-worm') ?? -1;
    for (let k = 0; k < 12; k++) {
      const x = w.camera.x + 200 + (k % 4) * 40;
      const y = w.camera.y + 30 + Math.floor(k / 4) * 60;
      expect(w.enemies.spawn(rocket, x, y)).not.toBeNull();
    }
    expect(w.enemies.startFormation(worm, 4, 7, 370, 150, -1, DropKind.None, 0)).toBeGreaterThan(
      -1,
    );
    expect(w.enemies.startFormation(worm, 4, 7, 380, 180, -1, DropKind.None, 0)).toBeGreaterThan(
      -1,
    );
    // Every spawn and script wake happens here (the rockets' last wake is at tick 11).
    for (let i = 0; i < 300; i++) step();
    const live = (id: number): number =>
      w.enemies.enemies.filter((e) => e.state === EnemyState.Live && e.specIndex === id).length;
    expect(live(rocket)).toBe(12);
    expect(live(worm)).toBe(8);
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
    // Still homing, the worms still waiting.
    expect(live(rocket)).toBe(12);
    expect(live(worm)).toBe(8);
    for (const e of w.enemies.enemies) {
      if (e.state === EnemyState.Live && e.specIndex === rocket) {
        expect(e.mover).toBe(MoverKind.Homing);
        expect(e.m1).toBe(4);
      }
    }
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);
});

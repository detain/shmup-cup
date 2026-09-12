/**
 * Allocation guard of `boss.bulwark` (plan M1-18; definition of done: zero allocations per tick),
 * in its own file so the worker's V8 type feedback comes only from this world: HALCYON BULWARK in
 * its last phase (every plate down — lanes every 55 ticks from both emitters, aimed 3-ways),
 * tracking the weaving, fully powered KESTREL whose Laser and Options hit its core and clink on its
 * hull — the core topped up so it never dies. Every wake of the phase coroutine allocates the
 * generator's result (decision D29); nothing else may.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BossState } from '../../src/bosses/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
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
 * Zone A with the KESTREL and its weapons.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const { db: content, issues } = loadContent(
    [
      'player/kestrel.player.json',
      'weapons/type-a.weapons.json',
      'tilesets/terrain-a.tileset.json',
      'paths/zone-a.paths.json',
      'enemies/zone-a.enemies.json',
      'stages/zone-a.stage.json',
    ].map(shipped),
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

describe('core/behaviors boss.bulwark allocation (M1-18)', () => {
  it('allocates nothing per tick in HB-01’s last phase: lanes, spreads, tracking, hits', () => {
    const w = createWorld(
      resolveGameConfig({ stage: 'zone-a', stageSkip: 'boss', loadout: 'full', seed: 9 }),
      db(),
    );
    w.debugFlags.godMode = true;
    const input = createInputSnapshot();
    const boss = w.bosses.boss;
    while (boss.state !== BossState.Fight) {
      stepWorld(w, input);
      w.events.clear();
    }
    const parts = boss.parts;
    for (let i = 6; i <= 9; i++) w.bosses.damagePart(i, 99, 0);
    stepWorld(w, input);
    expect(boss.phase).toBe(2);
    let t = 0;
    const growth = measureHeapGrowth(
      () => {
        commitPlayerInput(input.players[0], (t / 48) % 2 < 1 ? Action.Up : Action.Down);
        if (parts[5].hp < 20) parts[5].hp = 1000;
        t++;
        stepWorld(w, input);
        w.events.clear();
      },
      10_000,
      20_000,
    );
    expect(boss.state).toBe(BossState.Fight);
    expect(boss.phase).toBe(2);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);
});

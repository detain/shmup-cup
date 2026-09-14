/**
 * Allocation guard of `boss.facet` (plan M2-13; definition of done: zero allocations per tick), in
 * its own file so the worker's V8 type feedback comes only from this world: FACET MONARCH in its
 * last phase in free flight — tracking, the arms waving, needles from the tips, rings and detached
 * lane lasers from the core — with the weaving, fully powered KESTREL's Laser and Options hitting it
 * (clinking on the armoured arms) and its core topped up so it never dies. Every wake of the phase
 * coroutine allocates the generator's result (decision D29); nothing else may.
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
 * The KESTREL, Type A and zone G's roster.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const enemies = shipped('enemies/zone-g.enemies.json');
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      enemies,
      shipped('patterns/zones.patterns.json'),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

describe('core/behaviors boss.facet allocation (M2-13)', () => {
  it('allocates nothing per tick in FACET MONARCH’s last phase', () => {
    const content = db();
    const w = createWorld(resolveGameConfig({ loadout: 'full', seed: 9 }), content);
    w.debugFlags.godMode = true;
    const input = createInputSnapshot();
    const boss = w.bosses.boss;
    expect(w.bosses.startBoss(content.enemyIndex.get('facet-monarch') ?? -1)).toBe(true);
    while (boss.state !== BossState.Fight) {
      stepWorld(w, input);
      w.events.clear();
    }
    const parts = boss.parts;
    const core = parts.findIndex((p) => p.core);
    // The crystals broken, then the core below 38 of 72: its last phase.
    for (const name of ['crystal-top', 'crystal-bottom']) {
      w.bosses.damagePart(
        parts.findIndex((p) => p.name === name),
        999,
        0,
      );
    }
    stepWorld(w, input);
    w.bosses.damagePart(core, 40, 0);
    stepWorld(w, input);
    expect(boss.phase).toBe(2);
    let t = 0;
    const growth = measureHeapGrowth(
      () => {
        commitPlayerInput(input.players[0], (t / 48) % 2 < 1 ? Action.Up : Action.Down);
        if (parts[core].hp < 20) parts[core].hp = 1000;
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

/**
 * Allocation guard of `boss.bastion` (plan M2-12; definition of done: zero allocations per tick),
 * in its own file so the worker's V8 type feedback comes only from this world: CINDER BASTION in
 * its last phase in free flight — the shield arms turning and reversing, attached lane lasers from
 * the emitters, spreads and rings from the core — with the weaving, fully powered KESTREL's Laser
 * and Options hitting it (the arms clink) and its core topped up so it never dies. Every wake of
 * the phase coroutine allocates the generator's result (decision D29); nothing else may.
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
 * The KESTREL, Type A and zone D's roster.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('enemies/zone-d.enemies.json'),
      shipped('patterns/zones.patterns.json'),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

describe('core/behaviors boss.bastion allocation (M2-12)', () => {
  it('allocates nothing per tick in CINDER BASTION’s last phase', () => {
    const content = db();
    const w = createWorld(resolveGameConfig({ loadout: 'full', seed: 9 }), content);
    w.debugFlags.godMode = true;
    const input = createInputSnapshot();
    const boss = w.bosses.boss;
    expect(w.bosses.startBoss(content.enemyIndex.get('cinder-bastion') ?? -1)).toBe(true);
    while (boss.state !== BossState.Fight) {
      stepWorld(w, input);
      w.events.clear();
    }
    const parts = boss.parts;
    const core = parts.findIndex((p) => p.core);
    // Below 54, then below 24 of 80: its last phase.
    w.bosses.damagePart(core, 27, 0);
    stepWorld(w, input);
    w.bosses.damagePart(core, 30, 0);
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

/**
 * Allocation guard of `boss.bastion` (plan M2-12; definition of done: zero allocations per tick),
 * in its own file so the worker's V8 type feedback comes only from this world: CINDER BASTION in
 * its last phase in free flight — the shield arms turning and reversing, attached lane lasers from
 * the emitters, spreads and rings from the core — with the weaving, fully powered KESTREL's Laser
 * and Options hitting it (the shield arms take the hits — since R5-04.FIX they are destructible)
 * and every living part topped up so nothing goes down: the measured tick is the full boss, its
 * turning arms and lane lasers included, exactly as the world the guard was written for. Every
 * wake of the phase coroutine allocates the generator's result (decision D29); nothing else may.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BossState } from '../../src/bosses/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld } from '../../src/world/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';
import { shippedPatterns } from '../helpers/shipped.js';

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
      ...shippedPatterns(),
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
    // Below 72, then below 36 of 96: its last phase (the gates read the core only).
    w.bosses.damagePart(core, 27, 0);
    stepWorld(w, input);
    w.bosses.damagePart(core, 34, 0);
    stepWorld(w, input);
    expect(boss.phase).toBe(2);
    // Since R5-04.FIX the shield arms are destructible too: keep every living part topped up
    // exactly the way the core was (indices built cold, read in the measured loop so the
    // top-ups allocate nothing), so the measured tick stays the full boss.
    const shieldIdx: number[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (i !== core && parts[i].hp > 0) shieldIdx.push(i);
    }
    let t = 0;
    const growth = measureHeapGrowth(
      () => {
        commitPlayerInput(input.players[0], (t / 48) % 2 < 1 ? Action.Up : Action.Down);
        if (parts[core].hp < 20) parts[core].hp = 1000;
        for (let k = 0; k < shieldIdx.length; k++) {
          const p = parts[shieldIdx[k]];
          if (p.hp < 20) p.hp = 100;
        }
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

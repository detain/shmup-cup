/**
 * Allocation guard of `boss.maw` (plan M2-11; definition of done: zero allocations per
 * tick), in its own file so the worker's V8 type feedback comes only from this world: GALVANIC MAW in
 * its last phase in free flight, tracking, its mouth opening and shutting with the jaws, cutters and rings while open, the weaving, fully powered KESTREL's Laser and Options
 * hitting it — its core topped up so it never dies. The phase's minion launches are switched off
 * (`count` 0): every spawn allocates its coroutine (decision D29), and so does every wake of the
 * phase coroutine (the generator's result); nothing else may.
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
 * The KESTREL, Type A and zone b's roster, the boss's phases without minion launches.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const enemies = shipped('enemies/zone-b.enemies.json');
  const data = enemies.data as {
    enemies: { id: string; boss?: { phases: { params?: Record<string, number> }[] } }[];
  };
  for (const phase of data.enemies.find((e) => e.id === 'galvanic-maw')?.boss?.phases ?? []) {
    phase.params = { ...phase.params, count: 0 };
  }
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

describe('core/behaviors boss.maw allocation (M2-11)', () => {
  it('allocates nothing per tick in GALVANIC MAW’s last phase', () => {
    const content = db();
    const w = createWorld(resolveGameConfig({ loadout: 'full', seed: 9 }), content);
    w.debugFlags.godMode = true;
    const input = createInputSnapshot();
    const boss = w.bosses.boss;
    expect(w.bosses.startBoss(content.enemyIndex.get('galvanic-maw') ?? -1)).toBe(true);
    while (boss.state !== BossState.Fight) {
      stepWorld(w, input);
      w.events.clear();
    }
    const parts = boss.parts;
    const core = parts.findIndex((p) => p.core);
    // Down to its last phase (below 16 of 64): the mouth must be open to take the damage.
    for (let i = 0; i < 400 && boss.phase < 2; i++) {
      w.bosses.damagePart(core, 8, 0);
      stepWorld(w, input);
      w.events.clear();
    }
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

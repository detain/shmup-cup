/**
 * Allocation guard of `boss.angler` (plan M2-14; definition of done: zero allocations per tick), in
 * its own file so the worker's V8 type feedback comes only from this world: THE HOLLOW KING in its
 * last phase in free flight — tracking, the mouth opening and shutting with its jaws, spreads and
 * rings from the throat, the lure swaying and firing needles — with the weaving, fully powered
 * KESTREL hitting it and its throat and lure topped up so nothing breaks (its spawn switched off:
 * every spawn allocates its coroutine — D29). Every wake of the phase coroutine allocates the
 * generator's result; nothing else may.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BossHit, BossState } from '../../src/bosses/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld } from '../../src/world/index.js';
import { WakeCount, measureHeapGrowth } from '../helpers/alloc.js';

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
 * The KESTREL, Type A and a zone roster with the given boss's launches switched off (every spawn
 * allocates its coroutine — decision D29).
 *
 * @param file - The roster (below `content/`).
 * @param boss - The boss's enemy id.
 * @returns The DB.
 */
function db(file: string, boss: string): ContentDb {
  const roster = shipped(file);
  const enemies = (
    roster.data as {
      enemies: Array<{ id: string; boss?: { phases: Array<{ params: Record<string, number> }> } }>;
    }
  ).enemies;
  for (const enemy of enemies) {
    if (enemy.id !== boss) continue;
    for (const phase of enemy.boss?.phases ?? []) phase.params.launchTicks = 0;
  }
  const { db: content } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      roster,
      shipped('patterns/zones.patterns.json'),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  return content;
}

describe('core/behaviors boss.angler allocation (M2-14)', () => {
  it('allocates nothing per tick in THE HOLLOW KING’s last phase', () => {
    const content = db('enemies/zone-i.enemies.json', 'hollow-king');
    const w = createWorld(resolveGameConfig({ loadout: 'full', seed: 9 }), content);
    w.debugFlags.godMode = true;
    const input = createInputSnapshot();
    const boss = w.bosses.boss;
    expect(w.bosses.startBoss(content.enemyIndex.get('hollow-king') ?? -1)).toBe(true);
    while (boss.state !== BossState.Fight) {
      stepWorld(w, input);
      w.events.clear();
    }
    const parts = boss.parts;
    const maw = parts.findIndex((p) => p.core);
    const lure = parts.findIndex((p) => p.name === 'lure');
    // Hit twice while the mouth is open: below 75, then below 35 of 110 — its last phase.
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < 400 && w.bosses.damagePart(maw, 40, 0) !== BossHit.Damaged; i++) {
        stepWorld(w, input);
        w.events.clear();
      }
      stepWorld(w, input);
    }
    expect(boss.phase).toBe(2);
    let t = 0;
    const wakes = new WakeCount();
    const growth = measureHeapGrowth(
      () => {
        commitPlayerInput(input.players[0], (t / 48) % 2 < 1 ? Action.Up : Action.Down);
        if (parts[maw].hp < 20) parts[maw].hp = 1000;
        if (parts[lure].hp < 20) parts[lure].hp = 1000;
        t++;
        stepWorld(w, input);
        wakes.see(boss.wakeTick);
        w.events.clear();
      },
      10_000,
      20_000,
      5,
    );
    expect(boss.state).toBe(BossState.Fight);
    expect(boss.phase).toBe(2);
    // The wakes of the phase's coroutine may allocate their results (D29); nothing else may.
    expect(growth.bytes).toBeLessThan(64 * 1024 + wakes.allowance(10_000));
  }, 120_000);
});

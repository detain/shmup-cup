/**
 * Allocation guard of `boss.squid` (plan M2-13; definition of done: zero allocations per tick), in
 * its own file so the worker's V8 type feedback comes only from this world: MANTLE REGENT in its
 * last phase in free flight — tracking, the tentacles curling in front of the eye, guarding and
 * uncurling, spreads from the eye, needles from the tips, rings as the tentacles open — with the
 * weaving, fully powered KESTREL's Laser and Options hitting it (clinking on the armoured segments)
 * and its eye and tentacle roots topped up so nothing breaks. The phase's cell launches are
 * switched off (`launchTicks` 0): every spawn allocates its coroutine (decision D29), and so does
 * every wake of the phase coroutine (the generator's result); nothing else may.
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
 * The KESTREL, Type A and zone F's roster, the boss's phases without cell launches.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const enemies = shipped('enemies/zone-f.enemies.json');
  const data = enemies.data as {
    enemies: { id: string; boss?: { phases: { params?: Record<string, number> }[] } }[];
  };
  for (const phase of data.enemies.find((e) => e.id === 'mantle-regent')?.boss?.phases ?? []) {
    phase.params = { ...phase.params, launchTicks: 0 };
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

describe('core/behaviors boss.squid allocation (M2-13)', () => {
  it('allocates nothing per tick in MANTLE REGENT’s last phase', () => {
    const content = db();
    const w = createWorld(resolveGameConfig({ loadout: 'full', seed: 9 }), content);
    w.debugFlags.godMode = true;
    const input = createInputSnapshot();
    const boss = w.bosses.boss;
    expect(w.bosses.startBoss(content.enemyIndex.get('mantle-regent') ?? -1)).toBe(true);
    while (boss.state !== BossState.Fight) {
      stepWorld(w, input);
      w.events.clear();
    }
    const parts = boss.parts;
    const core = parts.findIndex((p) => p.core);
    const roots = [
      parts.findIndex((p) => p.name === 'root-top'),
      parts.findIndex((p) => p.name === 'root-bottom'),
    ];
    // The eye below 28 of 90 (it passes 60 on the way): its last phase.
    w.bosses.damagePart(core, 31, 0);
    stepWorld(w, input);
    w.bosses.damagePart(core, 32, 0);
    stepWorld(w, input);
    expect(boss.phase).toBe(2);
    let t = 0;
    const growth = measureHeapGrowth(
      () => {
        commitPlayerInput(input.players[0], (t / 48) % 2 < 1 ? Action.Up : Action.Down);
        if (parts[core].hp < 20) parts[core].hp = 1000;
        for (const root of roots) if (parts[root].hp < 20) parts[root].hp = 1000;
        t++;
        stepWorld(w, input);
        w.events.clear();
      },
      10_000,
      20_000,
      // Five windows, not three: under the full suite's load a single window of this heavy World
      // (the full loadout's Laser and Options on the armoured arms) measured 46–165 KB, and the
      // best of three now and then just over the budget (66 KB); a real per-tick allocation shows
      // in every window.
      5,
    );
    expect(boss.state).toBe(BossState.Fight);
    expect(boss.phase).toBe(2);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);
});

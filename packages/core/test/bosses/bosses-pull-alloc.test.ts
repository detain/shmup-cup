/**
 * Allocation guard of the bosses' **pull field** (plan M3-02; definition of done: zero allocations
 * per tick), in its own file so the worker's V8 type feedback comes only from this world: a
 * `boss.suction` fight on the shipped test boss — the field open and shut over and over, the ship
 * dragged in and clamped to the view every tick of the measured window (`BossSystem.applyFields`,
 * phase 2), its spreads fired while it rests.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BossState } from '../../src/bosses/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentFile } from '../../src/data/index.js';
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

describe('core/bosses allocation — an open pull field (M3-02)', () => {
  it('allocates nothing per tick while a suction boss drags the ship in', () => {
    const boss = shipped('enemies/test-boss.enemies.json');
    (boss.data as { enemies: { boss: { phases: unknown[] } }[] }).enemies[0].boss.phases = [
      {
        script: 'boss.suction',
        params: { pullTicks: 40, restTicks: 30, fireTicks: 25, pullRadius: 220, pullStrength: 1.3 },
      },
    ];
    const { db, issues } = loadContent(
      [
        shipped('player/kestrel.player.json'),
        shipped('enemies/test-range.enemies.json'),
        boss,
        shipped('stages/test-boss.stage.json'),
      ],
      { extraSprites: ENGINE_SPRITES },
    );
    expect(issues).toEqual([]);
    const w = createWorld(resolveGameConfig({ stage: 'test-boss', seed: 12 }), db);
    w.debugFlags.godMode = true;
    const input = createInputSnapshot();
    const self = w.bosses.boss;
    for (let i = 0; i < 20_000 && self.state !== BossState.Fight; i++) {
      stepWorld(w, input);
      w.events.clear();
    }
    expect(self.state).toBe(BossState.Fight);
    let t = 0;
    let pulled = 0;
    const growth = measureHeapGrowth(
      () => {
        // A ship that keeps flying away from the boss, so the field pulls it every tick and the
        // clamp to the view margins is exercised at both edges.
        commitPlayerInput(input.players[0], (t / 30) % 2 < 1 ? Action.Left : Action.Up);
        t++;
        stepWorld(w, input);
        if (self.pullRadius > 0) pulled++;
        w.events.clear();
      },
      10_000,
      20_000,
    );
    expect(self.state).toBe(BossState.Fight);
    expect(pulled).toBeGreaterThan(1000);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);
});

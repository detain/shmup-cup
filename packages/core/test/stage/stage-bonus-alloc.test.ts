/**
 * Allocation guard of the M2-10 hidden bonus-stage entrances (definition of done: zero allocations
 * per tick), in its own file: a World flies a long empty stage while all three kinds of entrance
 * are armed and waiting (a gap far ahead, a ground window and a digit window that close only at
 * the far end) — `BonusEntrances.update` runs every tick in phase 3 and tests them all — and the
 * update is also measured on its own, with ships of both players in play.
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld } from '../../src/world/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';
import { shipped, stage } from '../helpers/campaign.js';

/** A 60,000 px stage at 1 px/tick whose three entrances stay armed for 50,000 px. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      stage('long', {
        length: 60_000,
        camera: [{ x: 0, speed: 1 }],
        checkpoints: [{ x: 0 }],
        events: [
          {
            x: 10,
            type: 'bonus',
            stage: 'vault',
            entrance: 'gap',
            region: { x: 55_000, y: 0, w: 40, h: 20 },
          },
          { x: 10, type: 'bonus', stage: 'vault', entrance: 'ground', until: 50_000 },
          {
            x: 10,
            type: 'bonus',
            stage: 'vault',
            entrance: 'digit',
            digit: 7,
            place: 1000,
            until: 50_000,
          },
          { x: 60_000, type: 'end' },
        ],
      }),
      stage('vault', { type: 'bonus', events: [{ x: 300, type: 'end' }] }),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

describe('core/stage bonus entrances allocation (M2-10)', () => {
  it('steps a World with every kind of entrance armed without allocating', () => {
    const world = createWorld(resolveGameConfig({ seed: 4, stage: 'long' }), DB);
    world.debugFlags.godMode = true;
    const input = createInputSnapshot();
    for (let i = 0; i < 20 && world.bonus.armed[2] === 0; i++) stepWorld(world, input);
    expect([...world.bonus.armed]).toEqual([1, 1, 1]);
    const growth = measureHeapGrowth(() => stepWorld(world, input), 12_000, 8_000);
    expect(world.bonus.entered).toBe(-1);
    expect([...world.bonus.armed]).toEqual([1, 1, 1]);
    expect(world.status).toBe('playing');
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });

  it('tests armed entrances without allocating (update on its own, two ships)', () => {
    const world = createWorld(resolveGameConfig({ seed: 4, stage: 'long', coop: true }), DB);
    const bonus = world.bonus;
    for (let e = 0; e < bonus.count; e++) bonus.arm(bonus.eventIndex[e]);
    world.players[1].active = true;
    world.players[0].state = 'alive';
    world.players[1].state = 'alive';
    world.scoring.board.scores[0].score = 1_234;
    world.scoring.board.scores[1].score = 5_678;
    const growth = measureHeapGrowth(() => bonus.update(), 20_000, 20_000, 3, 16 * 1024);
    expect([...bonus.armed]).toEqual([1, 1, 1]);
    expect(bonus.entered).toBe(-1);
    expect(growth.bytes).toBeLessThan(32 * 1024);
  });
});

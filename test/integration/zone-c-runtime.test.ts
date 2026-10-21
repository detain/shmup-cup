/**
 * Zone C through the real game on the shipped content (plan M2-11, R5-P.P5e's split of
 * `zones-bc-runtime.test.ts`; zone B's cases live in `zone-b-runtime.test.ts`):
 *
 * - **The sand worms.** In zone C the sand worms rise from the dunes (their segments above the
 *   floor they lay in).
 */
import {
  ENGINE_SPRITES,
  EnemyState,
  KNOWN_SCRIPT_IDS,
  createGame,
  createHeadlessPlatform,
  loadContent,
  type ContentDb,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';
import { v1x } from '../../packages/core/test/helpers/v1-port.js';

/** The shipped content, validated like the shell does. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(readContentFiles(), {
    knownScripts: KNOWN_SCRIPT_IDS,
    extraSprites: ENGINE_SPRITES,
  });
  expect(issues).toEqual([]);
  return db;
})();

describe('integration: zones B and C in the game (M2-11)', () => {
  it('makes DUNE EXPANSE’s sand worms rise out of the dunes they lay in', () => {
    const game = createGame(createHeadlessPlatform(), { seed: 1, stage: 'zone-c' }, DB);
    const world = game.world;
    world.debugFlags.godMode = true;
    world.stage?.jumpTo(v1x(4500));
    const worm = DB.enemyIndex.get('dune-worm');
    let lowest = Number.NEGATIVE_INFINITY;
    let highest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 900; i++) {
      game.step();
      game.events.clear();
      for (const e of world.enemies.enemies) {
        if (e.state !== EnemyState.Live || e.specIndex !== worm) continue;
        lowest = Math.max(lowest, e.y - world.camera.y);
        highest = Math.min(highest, e.y - world.camera.y);
      }
    }
    // From their holes low in the playfield up to well above the dunes.
    expect(lowest).toBeGreaterThan(120);
    expect(lowest - highest).toBeGreaterThan(60);
  });
});

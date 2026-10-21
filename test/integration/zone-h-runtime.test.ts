/**
 * Zone H through the real game on the shipped content (plan M2-14, R5-P.P5e's split of
 * `zones-hi-runtime-edge.test.ts`; zone I's cases live in `zone-i-runtime.test.ts`):
 *
 * - **every practice start** (the scene flow's `startPractice`) at every checkpoint of IRON
 *   CITADEL puts the camera at the checkpoint and flies the ship in to open space (its terrain box
 *   never in rock — the piston hall's moving floors and ceilings included) inside the view;
 * - **the stage skip** into zone H lands before the parade's first echo (the skip stops before a
 *   `boss` event too), BULWARK ECHO fighting inside the view;
 * - **an echo that outlasts its time limit** leaves without the `bossEscaped` ending flag (the
 *   parade's echoes are captains: only a stage boss's escape counts), the parade going on.
 */
import {
  BossState,
  ENGINE_SPRITES,
  EndingFlag,
  KNOWN_SCRIPT_IDS,
  PLAYFIELD_H,
  PLAYFIELD_W,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  loadContent,
  type ContentDb,
  type SceneFlow,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';
import { v1x } from '../../packages/core/test/helpers/v1-port.js';
import { expectCameraAt, expectInOpenSpace, steps, stepUntil } from './zones/helpers.js';

/** The shipped content, validated like the shell does. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(readContentFiles(), {
    knownScripts: KNOWN_SCRIPT_IDS,
    extraSprites: ENGINE_SPRITES,
  });
  expect(issues).toEqual([]);
  return db;
})();

/**
 * The content index of an enemy id.
 *
 * @param id - Enemy id.
 * @returns Its index.
 */
function enemyIndex(id: string): number {
  const index = DB.enemyIndex.get(id);
  if (index === undefined) throw new Error('no enemy ' + id);
  return index;
}

describe('integration: zones H and I, edge cases (M2-14 tests)', () => {
  const starts: [string, number, number][] = [];
  for (const [letter, stageId] of [['h', 'zone-h']] as const) {
    const stage = DB.stages[DB.stageIndex.get(stageId) ?? -1];
    stage.checkpoints.forEach((checkpoint, i) => starts.push([letter, i, checkpoint.x]));
  }

  it.each(starts)(
    'practice start in zone %s at checkpoint %i (x %i): the ship flown in to open space',
    (letter, checkpoint, x) => {
      const platform = createHeadlessPlatform();
      const game = createGame(platform, { seed: 5, stage: 'zone-a' }, DB, { scenes: 'game' });
      game.debug.godMode = true;
      const flow = game.scenes as SceneFlow;
      expect(flow.startPractice(letter, checkpoint)).toBe(true);
      commitPlayerInput(platform.snapshot.players[0], 0);
      game.step();
      game.events.clear();
      const world = game.world;
      expect(world.stage?.stage.id).toBe('zone-' + letter);
      expectCameraAt(world, x);
      expect(world.camera.y).toBe(0);
      // A while in open space: the fly-in, then the pistons swinging round the ship.
      for (let k = 0; k < 4; k++) {
        steps(game, 45);
        expectInOpenSpace(world, `zone ${letter} checkpoint ${String(checkpoint)} +${String(k)}`);
      }
    },
  );

  it('checks four checkpoints per zone', () => {
    expect(starts).toHaveLength(4);
  });

  it('skips zone H to the parade: BULWARK ECHO fights inside the view, the ship in open space', () => {
    const game = createGame(
      createHeadlessPlatform(),
      { seed: 9, stage: 'zone-h', stageSkip: 'boss', loadout: 'full' },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    steps(game, 90);
    expectInOpenSpace(world, 'after the skip');
    expect(world.camera.x).toBeGreaterThan(v1x(4400));
    expect(world.camera.x).toBeLessThan(v1x(4520));
    const boss = world.bosses.boss;
    stepUntil(
      game,
      () => boss.specIndex === enemyIndex('echo-bulwark') && boss.state === BossState.Fight,
      1500,
    );
    for (let i = 0; i < boss.partCount; i++) {
      const p = boss.parts[i];
      expect(p.x - world.camera.x, p.name).toBeGreaterThan(0);
      expect(p.x - world.camera.x, p.name).toBeLessThan(PLAYFIELD_W);
      expect(p.y - world.camera.y, p.name).toBeGreaterThan(0);
      expect(p.y - world.camera.y, p.name).toBeLessThan(PLAYFIELD_H);
    }
    expectInOpenSpace(world, 'while the echo fights');
  });

  it('lets an echo outlast its time limit without the bossEscaped flag; the parade goes on', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(
      platform,
      { seed: 9, stage: 'zone-h', stageSkip: 'boss', autofire: false, remoteMode: false },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    const echo = enemyIndex('echo-bulwark');
    const spec = DB.enemies[echo].boss;
    expect(spec?.role).toBe('captain');
    expect(spec?.timeLimit).toBe(960);
    const slot = (): (typeof world.bosses.slots)[number] | undefined =>
      world.bosses.slots.find((b) => b.specIndex === echo && b.state !== BossState.None);
    stepUntil(game, () => slot()?.state === BossState.Fight, 1500);
    const fought = world.tick;
    // Never shot (no fire held, no autofire): it leaves when its limit runs out.
    stepUntil(game, () => slot() === undefined || slot()?.escaped === true, 2000);
    expect(world.tick - fought).toBeGreaterThanOrEqual(960);
    expect(world.endingFlags & EndingFlag.BossEscaped).toBe(0);
    // The next echo still comes.
    stepUntil(
      game,
      () =>
        world.bosses.slots.some(
          (b) => b.specIndex === enemyIndex('echo-maw') && b.state === BossState.Fight,
        ),
      3000,
    );
    expect(world.endingFlags).toBe(0);
  });
});

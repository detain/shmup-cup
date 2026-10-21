/**
 * Zone E through the real game on the shipped content (plan M2-12, R5-P.P5e's split of
 * `zones-de-runtime.test.ts` and `zones-de-runtime-edge.test.ts`; zone D's cases live in
 * `zone-d-runtime.test.ts`):
 *
 * - **TEMPEST RIDGE's rear attackers.** Squall jumpers and gale kites come on screen behind the
 *   ship — left of it — and overtake it.
 * - **every practice start** (the scene flow's `startPractice`) at every checkpoint of
 *   TEMPEST RIDGE puts the camera at the checkpoint and flies the ship in to open space (its
 *   terrain box never in rock) inside the view;
 * - **TEMPEST RIDGE's rear attackers** never fire before they are on screen and settled: every
 *   needle of a squall jumper starts inside the view.
 */
import {
  BulletKind,
  ENGINE_SPRITES,
  EnemyState,
  KNOWN_SCRIPT_IDS,
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
import { expectCameraAt, expectInOpenSpace, steps } from './zones/helpers.js';

/** The shipped content, validated like the shell does. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(readContentFiles(), {
    knownScripts: KNOWN_SCRIPT_IDS,
    extraSprites: ENGINE_SPRITES,
  });
  expect(issues).toEqual([]);
  return db;
})();

describe('integration: zones D and E in the game (M2-12)', () => {
  it('brings TEMPEST RIDGE’s jumpers and kites in from behind the ship, overtaking it', () => {
    const game = createGame(createHeadlessPlatform(), { seed: 1, stage: 'zone-e' }, DB);
    const world = game.world;
    world.debugFlags.godMode = true;
    world.stage?.jumpTo(1100);
    const rear = new Set([DB.enemyIndex.get('squall-jumper'), DB.enemyIndex.get('gale-kite')]);
    /** Per enemy slot and spawn: the leftmost and rightmost view x seen. */
    const seen = new Map<string, { min: number; max: number }>();
    for (let i = 0; i < 900; i++) {
      game.step();
      game.events.clear();
      const ship = world.players[0].x - world.camera.x;
      for (const e of world.enemies.enemies) {
        if (e.state !== EnemyState.Live || !rear.has(e.specIndex)) continue;
        const key = `${String(e.specIndex)}:${String(e.spawnTick)}:${String(e.member)}`;
        const x = e.x - world.camera.x - ship;
        const range = seen.get(key) ?? { min: x, max: x };
        range.min = Math.min(range.min, x);
        range.max = Math.max(range.max, x);
        seen.set(key, range);
      }
    }
    const overtook = [...seen.values()].filter((r) => r.min < -40 && r.max > 150);
    expect(overtook.length).toBeGreaterThanOrEqual(4);
  });
});

describe('integration: zones D and E, edge cases (M2-12)', () => {
  const starts: [string, number, number, number][] = [];
  for (const [letter, stageId] of [['e', 'zone-e']] as const) {
    const stage = DB.stages[DB.stageIndex.get(stageId) ?? -1];
    stage.checkpoints.forEach((checkpoint, i) => {
      // Zone E's camera never dives: every checkpoint starts on the surface.
      const y = 0;
      starts.push([letter, i, checkpoint.x, y]);
    });
  }

  it.each(starts)(
    'practice start in zone %s at checkpoint %i (x %i): the camera at y %i, the ship in open space',
    (letter, checkpoint, x, y) => {
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
      expect(world.camera.y).toBe(y);
      steps(game, 90);
      expectInOpenSpace(world, `zone ${letter} checkpoint ${String(checkpoint)}`);
      expect(world.camera.y).toBe(y);
    },
  );

  it('checks four checkpoints per zone', () => {
    expect(starts).toHaveLength(4);
  });

  it('keeps every squall jumper needle inside the view where it starts', () => {
    const game = createGame(createHeadlessPlatform(), { seed: 2, stage: 'zone-e' }, DB);
    const world = game.world;
    world.debugFlags.godMode = true;
    world.stage?.jumpTo(1300);
    const jumper = DB.enemyIndex.get('squall-jumper');
    const pool = world.bullets.pool;
    const f = pool.fields;
    let needles = 0;
    const seen = new Set<string>();
    for (let t = 0; t < 3000; t++) {
      game.step();
      game.events.clear();
      for (const e of world.enemies.enemies) {
        if (e.state === EnemyState.Live && e.specIndex === jumper) {
          seen.add(`${String(e.spawnTick)}`);
        }
      }
      for (let i = 0; i < pool.count; i++) {
        if (f.kind[i] !== BulletKind.NeedlePink || f.age[i] > 1) continue;
        needles++;
        expect(f.x[i] - world.camera.x).toBeGreaterThan(0);
        expect(f.x[i] - world.camera.x).toBeLessThan(PLAYFIELD_W);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(3); // jumpers seen
    expect(needles).toBeGreaterThanOrEqual(1);
  });
});

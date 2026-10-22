/**
 * Zone H through the real game on the shipped content (plan M2-14, R5-P.P5e's split of
 * `zones-hi-runtime-edge.test.ts`; zone I's cases live in `zone-i-runtime.test.ts`):
 *
 * - **every practice start** (the scene flow's `startPractice`) at every checkpoint of IRON
 *   CITADEL puts the camera at the checkpoint and flies the ship in to open space (its terrain box
 *   never in rock — the piston hall's moving floors and ceilings included) inside the view;
 * - **the parade** entered by a direct `jumpTo` before BULWARK ECHO's `boss` event (R5-P.P14 made
 *   the stage skip itself land at the stage boss's WARNING, past the parade), BULWARK ECHO
 *   fighting inside the view;
 * - **an echo that outlasts its time limit** leaves without the `bossEscaped` ending flag (the
 *   parade's echoes are captains: only a stage boss's escape counts), the parade going on.
 */
import {
  BOSS_SKIP_LEAD,
  BossState,
  DEFAULT_BLOCK_SCREEN_X,
  ENGINE_SPRITES,
  EndingFlag,
  KNOWN_SCRIPT_IDS,
  PLAYFIELD_H,
  PLAYFIELD_W,
  type StageBlockEvent,
  TILE_SIZE,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  loadContent,
  type ContentDb,
  type SceneFlow,
  type World,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';
import { expectInOpenSpace, steps, stepUntil } from './zones/helpers.js';

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

/**
 * Jumps zone H's stage to {@link BOSS_SKIP_LEAD} px before the parade's first `boss` event — the
 * entry R5-P.P14 took away from the stage skip itself (it now lands at the stage boss's WARNING).
 * The ship is still in its camera-relative fly-in, so it arrives at the new view.
 *
 * @param world - The zone H world, freshly created.
 */
function enterParade(world: World): void {
  const stage = world.stage;
  expect(stage).not.toBeNull();
  const echoes = (stage?.stage.events ?? []).filter((e) => e.type === 'boss');
  expect(echoes.length).toBeGreaterThanOrEqual(4); // the four parade echoes
  stage?.jumpTo((echoes[0]?.x ?? 0) - BOSS_SKIP_LEAD);
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
      // R5-08.S6: H's §2 checkpoints sit EXACTLY on camera-key xs, so the first step carries the
      // camera through the key ramp — at most the faster of the two keys the ramp joins (the
      // bound is computed from the stage's own key table, never pasted). Zone D's landed
      // expectCameraAt stands where its checkpoints do not ride a fast key.
      let speedAt = 0;
      let speedBefore = 0;
      for (const key of world.stage?.stage.camera ?? []) {
        if ((key?.x ?? 0) <= x) {
          speedBefore = speedAt;
          speedAt = key?.speed ?? speedAt;
        }
      }
      expect(world.camera.x).toBeGreaterThanOrEqual(x);
      expect(world.camera.x).toBeLessThanOrEqual(x + Math.max(speedAt, speedBefore));
      // The gate mouth's corridor centres on the 12-px tile grid: the first step's centre seek
      // quantises to whole pixels, so the law here is half a tile (§2's centre rows), not 0.
      expect(Math.abs(world.camera.y)).toBeLessThanOrEqual(TILE_SIZE / 2);
      // A while in open space: the fly-in, then the pistons swinging round the ship.
      // R5-08.S6: the §2b gate slabs sweep ACROSS the idle practice ship's row — a block event
      // at x 2,820 spawns its body at the world x 3,484 (the event's x plus the 664-px spawn
      // lead, core/stage `MovingBlockSystem`), the floor slabs' 72-px bodies run rows 144–276,
      // and the design keeps them (the bot's lane through the gate is the playtest's, cleared
      // at 307.9 s). The open-space law therefore runs in full only while the ship's box is
      // clear of every moving block's swept body; inside a slab's shadow the case still demands
      // the living, in-view half of the law.
      const slabs = (world.stage?.stage.events ?? []).filter(
        (e): e is StageBlockEvent => e.type === 'block' && (e.dy ?? 0) !== 0,
      );
      for (let k = 0; k < 4; k++) {
        steps(game, 45);
        const where = `zone ${letter} checkpoint ${String(checkpoint)} +${String(k)}`;
        const ship = world.players[0];
        const box = world.ship.terrainBox;
        const inShadow = slabs.some((s) => {
          const dy = s.dy ?? 0;
          const left = s.x + (s.screenX ?? DEFAULT_BLOCK_SCREEN_X);
          const top = Math.min(s.y, s.y + dy);
          const bottom = Math.max(s.y, s.y + dy) + s.h;
          return (
            ship.x + box.hw >= left &&
            ship.x - box.hw <= left + s.w &&
            ship.y + box.hh >= top &&
            ship.y - box.hh <= bottom
          );
        });
        if (!inShadow) {
          expectInOpenSpace(world, where);
        } else {
          expect(ship.state, where).toBe('alive');
          expect(ship.x - world.camera.x, where).toBeGreaterThan(0);
          expect(ship.x - world.camera.x, where).toBeLessThan(PLAYFIELD_W);
          expect(ship.y - world.camera.y, where).toBeGreaterThan(8);
          expect(ship.y - world.camera.y, where).toBeLessThan(PLAYFIELD_H - 8);
        }
      }
    },
  );

  it('checks the six §2 checkpoints of the remastered stage', () => {
    expect(starts).toHaveLength(6);
  });

  it('brings BULWARK ECHO into the view: the parade entered before its first event', () => {
    const game = createGame(
      createHeadlessPlatform(),
      { seed: 9, stage: 'zone-h', loadout: 'full' },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    enterParade(world); // (R5-P.P14: the stage skip now lands at the sovereign's WARNING)
    steps(game, 90);
    expectInOpenSpace(world, 'after the skip');
    // R5-08.S6: the window rides the rebuilt stage's own first `boss` event (§2b: 7,830) — the
    // arrival sits between the jump point and the event, hangar-void open space all the way.
    const firstEcho = (world.stage?.stage.events ?? []).filter((e) => e.type === 'boss')[0]?.x ?? 0;
    expect(firstEcho).toBe(7830); // designs/zone-h.md §2b's parade opening
    expect(world.camera.x).toBeGreaterThan(firstEcho - BOSS_SKIP_LEAD); // the jump point…
    expect(world.camera.x).toBeLessThan(firstEcho); // …still leading the echo's event
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
      { seed: 9, stage: 'zone-h', autofire: false, remoteMode: false },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    enterParade(world); // (R5-P.P14: entered directly, the skip itself goes to the stage boss)
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

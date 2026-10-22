/**
 * Zone D through the real game on the shipped content (plan M2-12, R5-P.P5e's split of
 * `zones-de-runtime.test.ts` and `zones-de-runtime-edge.test.ts`; zone E's cases live in
 * `zone-e-runtime.test.ts`):
 *
 * - **MAGMA DEEP's two-step dive** (`designs/zone-d.md` §4, R5-04.S5a). The camera stops at the
 *   key at 5,400, pans 186 px onto the shelf while it holds, scrolls on, then stops again at the
 *   key at 8,700 and pans down to the deep caves at 432; a practice start (the scene flow's
 *   `startPractice`) at the checkpoint at 9,900 prepares zone D's music set and puts the camera
 *   back down there.
 * - **The destructible maze.** In the deep caves the ship's shots break the brick walls
 *   (breakable tiles of the zone's v2 tileset): the walls lose bricks while the ship flies
 *   through §11's five wall pairs and the hot-brick plug's `brick` column.
 * - **MAGMA DEEP's three camera heights** (the surface at y 0, the shelf at 186, the deep caves
 *   at 432): every practice start at every checkpoint puts the camera at the checkpoint — the
 *   third on the shelf, the last three down in the caves — and flies the ship in to open space
 *   (its terrain box never in rock) inside the view;
 * - **the stage skip** into zone D (`stageSkip: 'boss'`, the debug skip the playtest uses) starts
 *   deep in the caves: the camera at y 432, the ship flown in there, CINDER BASTION fighting
 *   inside the view;
 * - **an Arcade restart in the deep caves** (a death after the checkpoint at 9,900) puts the
 *   camera back down at y 432 with the ship in open space, and rolls the destructible maze back:
 *   every brick shot away before the death stands again;
 * - **an Arcade restart before the dive** (a death during the scroll stop over the first dive
 *   step, before the shelf checkpoint) takes the camera back up to the surface at the checkpoint
 *   at 3,600 — and both dive steps happen again on the way.
 */
import {
  ENGINE_SPRITES,
  KNOWN_SCRIPT_IDS,
  PLAYFIELD_H,
  PlayerHitCause,
  SimEventKind,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  loadContent,
  playerHit,
  spawnPlayer,
  type ContentDb,
  type SceneFlow,
  type World,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';
import { v1y } from '../../packages/core/test/helpers/v1-port.js';
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
 * The brick cells of a World's terrain.
 *
 * @param world - The World.
 * @returns How many cells hold the tileset's `brick` tile.
 */
function bricks(world: World): number {
  const map = world.terrain;
  if (map === null) return 0;
  const tileset = DB.tilesets.find((t) => t.id === world.stage?.stage.tilemap?.tileset);
  const brick = (tileset?.tiles.findIndex((t) => t.name === 'brick') ?? -1) + 1;
  let count = 0;
  for (let i = 0; i < map.tiles.length; i++) if (map.tiles[i] === brick) count++;
  return count;
}

describe('integration: zones D and E in the game (M2-12)', () => {
  it('dives MAGMA DEEP’s camera in two steps, 186 then 432 px, at scroll stops, then scrolls on', () => {
    const game = createGame(createHeadlessPlatform(), { seed: 1, stage: 'zone-d' }, DB);
    const world = game.world;
    world.debugFlags.godMode = true;
    world.stage?.jumpTo(5200);
    // The first step: the hold at 5,400 pans the camera down onto the shelf at 186 (design §4's
    // `yTo 186`, `hold` 150 with the 150-tick pan inside it).
    let stopped = 0;
    for (let i = 0; i < 5000 && world.camera.x < 5650; i++) {
      const x = world.camera.x;
      const y = world.camera.y;
      game.step();
      game.events.clear();
      if (world.camera.x === x && world.camera.y > y) stopped++;
    }
    expect(stopped).toBeGreaterThan(100);
    expect(world.camera.y).toBe(186);
    // The second step: the hold at 8,700 pans to the deep caves at 432 and the scroll goes on.
    let stopped2 = 0;
    for (let i = 0; i < 5000 && world.camera.x < 8950; i++) {
      const x = world.camera.x;
      const y = world.camera.y;
      game.step();
      game.events.clear();
      if (world.camera.x === x && world.camera.y > y) stopped2++;
    }
    expect(stopped2).toBeGreaterThan(100);
    expect(world.camera.y).toBe(432);
    expect(world.status).toBe('playing');
  });

  it('starts a practice run in the deep caves: zone D’s music set prepared, the camera down there', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(platform, { seed: 3, stage: 'zone-a' }, DB, { scenes: 'game' });
    game.debug.godMode = true;
    const flow = game.scenes as SceneFlow;
    const prepared: number[] = [];
    // Checkpoint 3 is the maze entry at 9,900 — down at the second dive step's floor.
    expect(flow.startPractice('d', 3)).toBe(true);
    commitPlayerInput(platform.snapshot.players[0], 0);
    game.step();
    game.events.drain((e) => {
      if (e.kind === SimEventKind.PrepareStage) prepared.push(e.id);
    });
    const world = game.world;
    expect(world.stage?.stage.id).toBe('zone-d');
    expect(prepared).toContain(DB.stageIndex.get('zone-d'));
    expectCameraAt(world, 9900);
    expect(world.camera.y).toBe(432);
    // The ship flies in down there too, in the open band of the deep corridor.
    for (let i = 0; i < 90; i++) game.step();
    const ship = world.players[0];
    expect(ship.state).toBe('alive');
    expect(ship.y - world.camera.y).toBeGreaterThan(v1y(40));
    expect(ship.y - world.camera.y).toBeLessThan(v1y(160));
  });

  it('breaks MAGMA DEEP’s brick walls with the ship’s shots on the way through the maze', () => {
    const game = createGame(
      createHeadlessPlatform(),
      { seed: 1, stage: 'zone-d', loadout: 'full' },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    world.stage?.jumpTo(9800);
    // Fly in anew where the camera is now (down in the deep caves), at the middle row.
    spawnPlayer(world.players[0], world.camera);
    game.step();
    // Design §11's maze lays 103 `brick` cells: the five wall pairs' brick columns (rows 40–47
    // and 49–55 across cols 850–971) and the plug's `brick` column 1051 (rows 55–63); the
    // heightfield generator never emits `brick`, so the count is exactly the RLE's.
    const before = bricks(world);
    expect(before).toBe(103);
    for (let i = 0; i < 2400 && world.camera.x < 12000; i++) {
      game.step();
      game.events.clear();
    }
    expect(world.camera.x).toBeGreaterThanOrEqual(11900);
    // Autofire (and the Options) chewed holes into the walls the ship flew at.
    expect(bricks(world)).toBeLessThan(before - 10);
  });
});

describe('integration: zones D and E, edge cases (M2-12)', () => {
  const starts: [string, number, number, number][] = [];
  for (const [letter, stageId] of [['d', 'zone-d']] as const) {
    const stage = DB.stages[DB.stageIndex.get(stageId) ?? -1];
    stage.checkpoints.forEach((checkpoint, i) => {
      // The camera's height at each checkpoint is design §4's key line: the surface until the
      // first dive step (the key at 5,400 pans to 186), the deep caves (432) from the second
      // step's key at 8,700 on.
      const y =
        stageId !== 'zone-d' ? 0 : checkpoint.x < 5400 ? 0 : checkpoint.x < 8700 ? 186 : 432;
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

  it('checks six checkpoints per zone, four of zone D below the surface', () => {
    expect(starts).toHaveLength(6);
    expect(starts.filter((s) => s[3] > 0)).toHaveLength(4);
  });

  it('skips into the deep caves: the camera at y 432, the ship flown in there, CINDER BASTION fighting in view', () => {
    const game = createGame(
      createHeadlessPlatform(),
      { seed: 9, stage: 'zone-d', stageSkip: 'boss', loadout: 'full' },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    expect(world.camera.y).toBe(432);
    steps(game, 90);
    expectInOpenSpace(world, 'after the skip');
    const bastion = DB.enemyIndex.get('cinder-bastion');
    const boss = world.bosses.boss;
    stepUntil(game, () => boss.specIndex === bastion && boss.state === 3, 1500);
    expect(world.camera.y).toBe(432);
    expect(boss.y - world.camera.y).toBeGreaterThanOrEqual(66 - 1e-9);
    expect(boss.y - world.camera.y).toBeLessThanOrEqual(PLAYFIELD_H - 66 + 1e-9);
    // Its core and arms are drawn inside the view, below the cave roof's rows.
    const core = boss.parts.find((p) => p.name === 'core');
    expect((core?.y ?? 0) - world.camera.y).toBeGreaterThan(45);
    expect((core?.y ?? 0) - world.camera.y).toBeLessThan(PLAYFIELD_H - 45);
    expectInOpenSpace(world, 'while the boss fights');
  });

  it('restarts an Arcade death in the deep caves at the cave checkpoint, the maze rolled back', () => {
    const game = createGame(
      createHeadlessPlatform(),
      { seed: 11, stage: 'zone-d', loadout: 'full', deathPenalty: 'arcade', startingLives: 3 },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    const full = bricks(world);
    world.stage?.jumpTo(9800);
    // `jumpTo` moves the camera, not the ship: fly it in anew down in the deep caves.
    spawnPlayer(world.players[0], world.camera);
    stepUntil(game, () => world.camera.x >= 12000, 3000);
    const broken = full - bricks(world);
    expect(broken).toBeGreaterThan(10);
    // A crash (god mode off for the hit).
    world.debugFlags.godMode = false;
    const ship = world.players[0];
    stepUntil(game, () => ship.state === 'alive' && ship.invulnTicks === 0, 400);
    expect(playerHit(ship, PlayerHitCause.Terrain, world.tick, world.debugFlags)).toBe(true);
    game.step();
    expect(ship.state).toBe('dying');
    world.debugFlags.godMode = true;
    stepUntil(game, () => ship.state === 'alive', 600);
    expect(ship.lives).toBe(2);
    // Back at the maze-entry checkpoint at 9,900, every brick standing again.
    expect(world.camera.x).toBeGreaterThanOrEqual(9900);
    expect(world.camera.x).toBeLessThan(10300);
    expect(world.camera.y).toBe(432);
    expect(bricks(world)).toBe(full);
    expectInOpenSpace(world, 'after the restart');
  });

  it('restarts an Arcade death before the shelf checkpoint on the surface, and dives again', () => {
    const game = createGame(
      createHeadlessPlatform(),
      { seed: 12, stage: 'zone-d', deathPenalty: 'arcade', startingLives: 3 },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    world.stage?.jumpTo(5200);
    spawnPlayer(world.players[0], world.camera);
    // The first scroll stop over the pit: the camera half-way through the 186-px step.
    stepUntil(game, () => world.camera.y >= 90, 2000);
    expect(world.camera.x).toBeLessThan(6600);
    world.debugFlags.godMode = false;
    const ship = world.players[0];
    stepUntil(game, () => ship.state === 'alive' && ship.invulnTicks === 0, 400);
    expect(world.camera.x).toBeLessThan(6600);
    expect(playerHit(ship, PlayerHitCause.Terrain, world.tick, world.debugFlags)).toBe(true);
    game.step();
    world.debugFlags.godMode = true;
    stepUntil(game, () => ship.state === 'alive', 600);
    // Back up on the surface at the checkpoint at 3,600.
    expect(world.camera.x).toBeGreaterThanOrEqual(3600);
    expect(world.camera.x).toBeLessThan(4000);
    expect(world.camera.y).toBe(0);
    expectInOpenSpace(world, 'after the restart');
    // And down again: the first step’s floor at 186, then the deep caves at 432.
    stepUntil(game, () => world.camera.x >= 5650, 4000);
    expect(world.camera.y).toBe(186);
    expectInOpenSpace(world, 'after the first dive step');
    stepUntil(game, () => world.camera.x >= 8950, 9000);
    expect(world.camera.y).toBe(432);
    expectInOpenSpace(world, 'after the second dive step');
  });
});

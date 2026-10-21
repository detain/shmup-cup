/**
 * Zone F through the real game on the shipped content (plan M2-13, R5-P.P5e's split of
 * `zones-fg-runtime.test.ts` and `zones-fg-runtime-edge.test.ts`; zone G's cases live in
 * `zone-g-runtime.test.ts`):
 *
 * - **CELL VAULT's regenerating tissue walls.** A tissue cell broken by hits empties and grows
 *   back after the tile's `regen` ticks — not while a ship's box overlaps it.
 * - **CELL VAULT's grabbing tentacles.** In the tentacle garden a claw on its chain lunges at the
 *   ship passing within reach, pulling it with a pull field, then retracts.
 * - **every practice start** (the scene flow's `startPractice`) at every checkpoint of CELL VAULT
 *   puts the camera at the checkpoint and flies the ship in to open space (its terrain box never
 *   in rock, tissue or crystal) inside the view;
 * - **the stage skip** into zone F (`stageSkip: 'boss'`, the debug skip the playtest uses)
 *   brings MANTLE REGENT in, fighting inside the view with the ship in open space;
 * - **an Arcade restart in the tissue passage** (a death after the checkpoint at 2,200) rolls the
 *   regenerating walls back at once: every tissue cell shot away stands again when the ship
 *   returns, long before a cell's own `regen` would have grown it back;
 * - **MANTLE REGENT's launched cells** (its second and third phases launch its `minion`, the
 *   chasing cell): none in the first phase, then one out of the eye inside the view every 200
 *   ticks.
 */
import {
  BossState,
  ENGINE_SPRITES,
  EnemyState,
  KNOWN_SCRIPT_IDS,
  MoverKind,
  PLAYFIELD_H,
  PLAYFIELD_W,
  TerrainHit,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  loadContent,
  spawnPlayer,
  type ContentDb,
  type SceneFlow,
  type World,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';
import { v1x, v1rel } from '../../packages/core/test/helpers/v1-port.js';
import { crash, expectCameraAt, expectInOpenSpace, steps, stepUntil } from './zones/helpers.js';

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
 * The 1-based id of a tile of a World's tileset by name.
 *
 * @param world - The World.
 * @param name - Tile name.
 * @returns The tile id (0 = none).
 */
function tileId(world: World, name: string): number {
  const tileset = DB.tilesets.find((t) => t.id === world.stage?.stage.tilemap?.tileset);
  return (tileset?.tiles.findIndex((t) => t.name === name) ?? -1) + 1;
}

/**
 * Counts the cells of a World's terrain holding a tile.
 *
 * @param world - The World.
 * @param tile - Tile id.
 * @returns How many.
 */
function cellsOf(world: World, tile: number): number {
  const map = world.terrain;
  if (map === null) return 0;
  let n = 0;
  for (let i = 0; i < map.tiles.length; i++) if (map.tiles[i] === tile) n++;
  return n;
}

describe('integration: zones F and G in the game (M2-13)', () => {
  it('grows CELL VAULT’s tissue back after it was shot open — not into a ship', () => {
    const game = createGame(createHeadlessPlatform(), { seed: 1, stage: 'zone-f' }, DB);
    const world = game.world;
    world.debugFlags.godMode = true;
    const destructible = world.gimmicks.destructible;
    expect(destructible).not.toBeNull();
    if (destructible === null) return;
    const tissue = tileId(world, 'tissue');
    const regen = DB.tilesets.find((t) => t.id === 'terrain-vault')?.tiles[tissue - 1]?.regen ?? 0;
    expect(regen).toBeGreaterThan(0);
    // The first wall of the tissue passage, a cell far from the ship.
    const map = destructible.map;
    let cell = -1;
    for (let i = 0; i < map.tiles.length && cell < 0; i++) if (map.tiles[i] === tissue) cell = i;
    expect(cell).toBeGreaterThanOrEqual(0);
    const ts = map.tileSize;
    const px = (cell % map.cols) * ts + ts / 2;
    const py = Math.floor(cell / map.cols) * ts + ts / 2;
    let hit: number = TerrainHit.None;
    for (let k = 0; k < 5 && hit !== TerrainHit.Destroyed; k++) hit = destructible.hit(px, py, 1);
    expect(hit).toBe(TerrainHit.Destroyed);
    expect(map.tiles[cell]).toBe(0);
    for (let i = 0; i < regen - 2; i++) {
      game.step();
      game.events.clear();
    }
    expect(map.tiles[cell]).toBe(0);
    for (let i = 0; i < 4; i++) {
      game.step();
      game.events.clear();
    }
    expect(map.tiles[cell]).toBe(tissue);
    // Broken again with a ship's box over it (the cell on screen, the ship held on it): it waits
    // until the ship has gone.
    world.stage?.jumpTo(px - v1rel(300));
    const ship = world.players[0];
    spawnPlayer(ship, world.camera);
    for (let k = 0; k < 5 && map.tiles[cell] !== 0; k++) destructible.hit(px, py, 1);
    expect(map.tiles[cell]).toBe(0);
    for (let i = 0; i < regen + 20; i++) {
      ship.x = px;
      ship.y = py;
      game.step();
      game.events.clear();
    }
    expect(map.tiles[cell]).toBe(0);
    ship.x = px - 100;
    for (let i = 0; i < 4; i++) {
      game.step();
      game.events.clear();
    }
    expect(map.tiles[cell]).toBe(tissue);
  });

  it('makes CELL VAULT’s claws lunge on their chains at a ship in reach, pulling it', () => {
    const game = createGame(createHeadlessPlatform(), { seed: 1, stage: 'zone-f' }, DB);
    const world = game.world;
    world.debugFlags.godMode = true;
    world.stage?.restartAt(2);
    spawnPlayer(world.players[0], world.camera);
    const gimmicks = world.gimmicks;
    let lunged = false;
    let chained = false;
    let pulled = false;
    let retracted = false;
    for (let i = 0; i < 2400; i++) {
      game.step();
      game.events.clear();
      for (let c = 0; c < gimmicks.chainOwner.length; c++)
        if (gimmicks.chainOwner[c] >= 0) chained = true;
      for (let f = 0; f < gimmicks.fieldOwner.length; f++)
        if (gimmicks.fieldOwner[f] >= 0) pulled = true;
      for (const e of world.enemies.enemies) {
        if (e.state !== EnemyState.Live) continue;
        if (DB.enemies[e.specIndex].script !== 'tentacle.grab') continue;
        if (e.mover === MoverKind.Homing) lunged = true;
        else if (lunged && e.mover === MoverKind.Waypoint) retracted = true;
      }
    }
    expect(chained).toBe(true);
    expect(lunged).toBe(true);
    expect(pulled).toBe(true);
    expect(retracted).toBe(true);
  });
});

describe('integration: zones F and G, edge cases (M2-13)', () => {
  const starts: [string, number, number][] = [];
  for (const [letter, stageId] of [['f', 'zone-f']] as const) {
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
      steps(game, 90);
      expectInOpenSpace(world, `zone ${letter} checkpoint ${String(checkpoint)}`);
    },
  );

  it('checks four checkpoints per zone', () => {
    expect(starts).toHaveLength(4);
  });

  it.each([['zone-f', 'mantle-regent']])(
    'skips %s to its boss: %s fighting inside the view, the ship in open space',
    (stage, id) => {
      const game = createGame(
        createHeadlessPlatform(),
        { seed: 9, stage, stageSkip: 'boss', loadout: 'full' },
        DB,
      );
      const world = game.world;
      world.debugFlags.godMode = true;
      steps(game, 90);
      expectInOpenSpace(world, 'after the skip');
      const boss = world.bosses.boss;
      stepUntil(
        game,
        () => boss.specIndex === DB.enemyIndex.get(id) && boss.state === BossState.Fight,
        1500,
      );
      expect(boss.screenY).toBeGreaterThanOrEqual(40);
      expect(boss.screenY).toBeLessThanOrEqual(PLAYFIELD_H - 40);
      // Every part of it — the tentacles and arms too — drawn inside the view.
      for (let i = 0; i < boss.partCount; i++) {
        const p = boss.parts[i];
        expect(p.x - world.camera.x, p.name).toBeGreaterThan(0);
        expect(p.x - world.camera.x, p.name).toBeLessThan(PLAYFIELD_W);
        expect(p.y - world.camera.y, p.name).toBeGreaterThan(0);
        expect(p.y - world.camera.y, p.name).toBeLessThan(PLAYFIELD_H);
      }
      expectInOpenSpace(world, 'while the boss fights');
    },
  );

  it('rolls CELL VAULT’s tissue walls back at an Arcade restart, before they could grow back', () => {
    const game = createGame(
      createHeadlessPlatform(),
      {
        seed: 11,
        stage: 'zone-f',
        deathPenalty: 'arcade',
        startingLives: 3,
        autofire: false,
        remoteMode: false,
      },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    const tissue = tileId(world, 'tissue');
    const full = cellsOf(world, tissue);
    expect(full).toBeGreaterThan(70);
    const destructible = world.gimmicks.destructible;
    expect(destructible).not.toBeNull();
    if (destructible === null) return;
    world.stage?.jumpTo(v1x(2700));
    spawnPlayer(world.players[0], world.camera);
    stepUntil(game, () => world.camera.x >= v1x(2800), 400);
    // Shoot open every tissue cell of the first three walls (world x < 3,300).
    const map = destructible.map;
    let broken = 0;
    for (let i = 0; i < map.tiles.length; i++) {
      if (map.tiles[i] !== tissue || (i % map.cols) * map.tileSize >= v1x(3300)) continue;
      for (let k = 0; k < 5 && map.tiles[i] !== 0; k++) {
        destructible.hit(
          (i % map.cols) * map.tileSize + map.tileSize / 2,
          Math.floor(i / map.cols) * map.tileSize + map.tileSize / 2,
          1,
        );
      }
      broken++;
    }
    expect(broken).toBeGreaterThan(20);
    expect(cellsOf(world, tissue)).toBe(full - broken);
    const brokeAt = world.tick;
    crash(game);
    const ship = world.players[0];
    stepUntil(game, () => ship.state === 'alive', 600);
    // Back at the checkpoint at 2,200, every cell standing again — well before the tile's regen.
    const regen = DB.tilesets.find((t) => t.id === 'terrain-vault')?.tiles[tissue - 1]?.regen ?? 0;
    expect(world.tick - brokeAt).toBeLessThan(regen);
    expect(ship.lives).toBe(2);
    expect(world.camera.x).toBeGreaterThanOrEqual(v1x(2200));
    expect(world.camera.x).toBeLessThan(v1x(2500));
    expect(cellsOf(world, tissue)).toBe(full);
    expect(destructible.destroyed).toBe(0);
    expectInOpenSpace(world, 'after the restart');
  });

  it('launches MANTLE REGENT’s chasing cells from its eye inside the view, launchTicks apart', () => {
    const game = createGame(
      createHeadlessPlatform(),
      { seed: 6, stage: 'zone-f', stageSkip: 'boss', autofire: false, remoteMode: false },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    const boss = world.bosses.boss;
    stepUntil(game, () => boss.state === BossState.Fight, 1500);
    // Into the second phase: a tentacle broken (none launched before).
    const root = boss.parts.findIndex((p, i) => i < boss.partCount && p.name === 'root-top');
    const chaser = DB.enemyIndex.get('chaser-cell');
    const cells = (): number =>
      world.enemies.enemies.filter((e) => e.state === EnemyState.Live && e.specIndex === chaser)
        .length;
    expect(cells()).toBe(0);
    world.bosses.damagePart(root, 999, 0);
    steps(game, 2);
    expect(boss.phase).toBe(1);
    const eye = boss.parts.find((p) => p.name === 'eye');
    const launches: number[] = [];
    for (let t = 0; t < 700; t++) {
      game.step();
      game.events.clear();
      for (const e of world.enemies.enemies) {
        if (e.state !== EnemyState.Live || e.specIndex !== chaser || e.age !== 1) continue;
        launches.push(world.tick);
        expect(Math.abs(e.x - (eye?.x ?? 0))).toBeLessThan(3);
        expect(Math.abs(e.y - (eye?.y ?? 0))).toBeLessThan(3);
        expect(e.x - world.camera.x).toBeGreaterThan(0);
        expect(e.x - world.camera.x).toBeLessThan(PLAYFIELD_W);
      }
    }
    // Phase 1 launches one every 200 ticks (rank-scaled — the default rank leaves it as it is).
    expect(launches.length).toBeGreaterThanOrEqual(3);
    for (let k = 1; k < launches.length; k++) expect(launches[k] - launches[k - 1]).toBe(200);
  });
});

/**
 * Edge cases of zones D and E through the real game on the shipped content (plan M2-12), beyond
 * `zones-de-runtime.test.ts` — mostly MAGMA DEEP's two camera heights (the surface at y 0, the
 * caves at y 200 after the dive):
 *
 * - **every practice start** (the scene flow's `startPractice`) at every checkpoint of MAGMA DEEP
 *   and TEMPEST RIDGE puts the camera at the checkpoint — zone D's last two down in the caves —
 *   and flies the ship in to open space (its terrain box never in rock) inside the view;
 * - **the stage skip** into zone D (`stageSkip: 'boss'`, the debug skip the playtest uses) starts
 *   in the caves: the camera at y 200, the ship flown in there, CINDER BASTION fighting inside the
 *   view;
 * - **an Arcade restart in the caves** (a death after the checkpoint at 4,000) puts the camera
 *   back down at y 200 with the ship in open space, and rolls the destructible maze back: every
 *   brick shot away before the death stands again;
 * - **an Arcade restart before the dive** (a death during the scroll stop over the pit, before the
 *   cave checkpoint) takes the camera back up to the surface at the checkpoint at 2,200 — and the
 *   dive happens again on the way;
 * - **TEMPEST RIDGE's rear attackers** never fire before they are on screen and settled: every
 *   needle of a squall jumper starts inside the view.
 */
import {
  BulletKind,
  ENGINE_SPRITES,
  EnemyState,
  KNOWN_SCRIPT_IDS,
  PLAYFIELD_H,
  PLAYFIELD_W,
  PlayerHitCause,
  TerrainType,
  boxHitsTerrain,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  loadContent,
  playerHit,
  spawnPlayer,
  type ContentDb,
  type Game,
  type SceneFlow,
  type World,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

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

/**
 * Steps a game with its events dropped.
 *
 * @param game - The game.
 * @param ticks - Ticks.
 */
function steps(game: Game, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    game.step();
    game.events.clear();
  }
}

/**
 * Steps a game until a condition holds (or fails the test after `limit` ticks).
 *
 * @param game - The game.
 * @param done - The condition.
 * @param limit - Most ticks.
 * @returns Ticks stepped.
 */
function stepUntil(game: Game, done: () => boolean, limit: number): number {
  let t = 0;
  for (; t < limit && !done(); t++) {
    game.step();
    game.events.clear();
  }
  expect(done(), `not reached in ${String(limit)} ticks`).toBe(true);
  return t;
}

/**
 * Checks that player 1 flies in open space inside the view: alive, its terrain box clear of rock,
 * inside the playfield.
 *
 * @param world - The World.
 * @param where - A label for the failure message.
 */
function expectInOpenSpace(world: World, where: string): void {
  const ship = world.players[0];
  const map = world.terrain;
  expect(ship.state, where).toBe('alive');
  if (map !== null) {
    const box = world.ship.terrainBox;
    expect(boxHitsTerrain(map, ship.x, ship.y, box.hw, box.hh), where).toBe(TerrainType.Empty);
  }
  expect(ship.x - world.camera.x, where).toBeGreaterThan(0);
  expect(ship.x - world.camera.x, where).toBeLessThan(PLAYFIELD_W);
  expect(ship.y - world.camera.y, where).toBeGreaterThan(8);
  expect(ship.y - world.camera.y, where).toBeLessThan(PLAYFIELD_H - 8);
}

describe('integration: zones D and E, edge cases (M2-12)', () => {
  const starts: [string, number, number, number][] = [];
  for (const [letter, stageId] of [
    ['d', 'zone-d'],
    ['e', 'zone-e'],
  ] as const) {
    const stage = DB.stages[DB.stageIndex.get(stageId) ?? -1];
    stage.checkpoints.forEach((checkpoint, i) => {
      // Zone D's camera is down in the caves from the dive (x 3,560) on.
      const y = stageId === 'zone-d' && checkpoint.x > 3560 ? 200 : 0;
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
      expect(Math.floor(world.camera.x)).toBe(x);
      expect(world.camera.y).toBe(y);
      steps(game, 90);
      expectInOpenSpace(world, `zone ${letter} checkpoint ${String(checkpoint)}`);
      expect(world.camera.y).toBe(y);
    },
  );

  it('checks four checkpoints per zone, two of zone D in the caves', () => {
    expect(starts).toHaveLength(8);
    expect(starts.filter((s) => s[3] === 200)).toHaveLength(2);
  });

  it('skips into the caves: the camera at y 200, the ship flown in there, CINDER BASTION fighting in view', () => {
    const game = createGame(
      createHeadlessPlatform(),
      { seed: 9, stage: 'zone-d', stageSkip: 'boss', loadout: 'full' },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    expect(world.camera.y).toBe(200);
    steps(game, 90);
    expectInOpenSpace(world, 'after the skip');
    const bastion = DB.enemyIndex.get('cinder-bastion');
    const boss = world.bosses.boss;
    stepUntil(game, () => boss.specIndex === bastion && boss.state === 3, 1500);
    expect(world.camera.y).toBe(200);
    expect(boss.y - world.camera.y).toBeGreaterThanOrEqual(44 - 1e-9);
    expect(boss.y - world.camera.y).toBeLessThanOrEqual(PLAYFIELD_H - 44 + 1e-9);
    // Its core and arms are drawn inside the view, below the cave roof's rows.
    const core = boss.parts.find((p) => p.name === 'core');
    expect((core?.y ?? 0) - world.camera.y).toBeGreaterThan(30);
    expect((core?.y ?? 0) - world.camera.y).toBeLessThan(PLAYFIELD_H - 30);
    expectInOpenSpace(world, 'while the boss fights');
  });

  it('restarts an Arcade death in the caves at the cave checkpoint, the maze rolled back', () => {
    const game = createGame(
      createHeadlessPlatform(),
      { seed: 11, stage: 'zone-d', loadout: 'full', deathPenalty: 'arcade', startingLives: 3 },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    const full = bricks(world);
    world.stage?.jumpTo(4300);
    // `jumpTo` moves the camera, not the ship: fly it in anew down in the caves.
    spawnPlayer(world.players[0], world.camera);
    stepUntil(game, () => world.camera.x >= 5400, 3000);
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
    // Back at the checkpoint in the caves, every brick standing again.
    expect(world.camera.x).toBeGreaterThanOrEqual(4000);
    expect(world.camera.x).toBeLessThan(4400);
    expect(world.camera.y).toBe(200);
    expect(bricks(world)).toBe(full);
    expectInOpenSpace(world, 'after the restart');
  });

  it('restarts an Arcade death before the cave checkpoint on the surface, and dives again', () => {
    const game = createGame(
      createHeadlessPlatform(),
      { seed: 12, stage: 'zone-d', deathPenalty: 'arcade', startingLives: 3 },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    world.stage?.jumpTo(3300);
    spawnPlayer(world.players[0], world.camera);
    // The scroll stop over the pit: the camera half-way down.
    stepUntil(game, () => world.camera.y >= 100, 2000);
    expect(world.camera.x).toBeLessThan(4000);
    world.debugFlags.godMode = false;
    const ship = world.players[0];
    stepUntil(game, () => ship.state === 'alive' && ship.invulnTicks === 0, 400);
    expect(world.camera.x).toBeLessThan(4000);
    expect(playerHit(ship, PlayerHitCause.Terrain, world.tick, world.debugFlags)).toBe(true);
    game.step();
    world.debugFlags.godMode = true;
    stepUntil(game, () => ship.state === 'alive', 600);
    // Back up on the surface at the checkpoint at 2,200.
    expect(world.camera.x).toBeGreaterThanOrEqual(2200);
    expect(world.camera.x).toBeLessThan(2600);
    expect(world.camera.y).toBe(0);
    expectInOpenSpace(world, 'after the restart');
    // And down again at the pit.
    stepUntil(game, () => world.camera.x >= 3700, 4000);
    expect(world.camera.y).toBe(200);
    expectInOpenSpace(world, 'after the second dive');
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

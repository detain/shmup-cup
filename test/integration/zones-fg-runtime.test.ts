/**
 * Zones F and G through the real game on the shipped content (plan M2-13):
 *
 * - **PRISM LABYRINTH's hidden bonus stage.** A practice run of zone G from its second checkpoint
 *   (the scene flow's `startPractice`, which prepares zone G's music set): every turret of the prism
 *   gallery shot down by the player — the `ground` entrance opens when its window closes — and
 *   after the warp the game scene plays `glimmer-cache` (GLIMMER CACHE) with the players carried
 *   in; its clear is the zone's clear (FACET MONARCH is skipped).
 * - **CELL VAULT's regenerating tissue walls.** A tissue cell broken by hits empties and grows
 *   back after the tile's `regen` ticks — not while a ship's box overlaps it.
 * - **CELL VAULT's grabbing tentacles.** In the tentacle garden a claw on its chain lunges at the
 *   ship passing within reach, pulling it with a pull field, then retracts.
 * - **PRISM LABYRINTH's cube rush.** The rush's cubes that hit the crystal pillars become the
 *   tileset's cube tiles — the rush stacks into walls; a checkpoint restart rolls them back.
 */
import {
  BodyAnchor,
  ENGINE_SPRITES,
  EnemyFlag,
  EnemyState,
  KNOWN_SCRIPT_IDS,
  MoverKind,
  SimEventKind,
  TerrainHit,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  loadContent,
  spawnPlayer,
  type ContentDb,
  type Game,
  type SceneFlow,
  type World,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';
import { fourWayBot } from '../playtest/four-way-bot.js';

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
 * The id of the stage a game's World plays.
 *
 * @param game - The game.
 * @returns The stage id.
 */
const stageOf = (game: Game): string => game.world.stage?.stage.id ?? '';

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
 * The cells of a World's terrain that hold a tile its stage did not place there.
 *
 * @param world - The World.
 * @param tile - Tile id.
 * @returns How many.
 */
function placed(world: World, tile: number): number {
  const destructible = world.gimmicks.destructible;
  if (destructible === null) return 0;
  let count = 0;
  const tiles = destructible.map.tiles;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === tile && destructible.pristine[i] !== tile) count++;
  }
  return count;
}

describe('integration: zones F and G in the game (M2-13)', () => {
  it('opens PRISM LABYRINTH’s gallery entrance when every turret is shot and plays GLIMMER CACHE', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(platform, { seed: 3, stage: 'zone-a', loadout: 'full' }, DB, {
      scenes: 'game',
    });
    game.debug.godMode = true;
    const flow = game.scenes as SceneFlow;
    const prepared: number[] = [];
    expect(flow.startPractice('g', 1)).toBe(true);
    const player = platform.snapshot.players[0];
    const step = (held: number): void => {
      commitPlayerInput(player, held);
      game.step();
      game.events.drain((e) => {
        if (e.kind === SimEventKind.PrepareStage) prepared.push(e.id);
      });
    };
    step(0);
    expect(stageOf(game)).toBe('zone-g');
    expect(prepared).toContain(DB.stageIndex.get('zone-g'));
    const zone = game.world;
    expect(Math.floor(zone.camera.x)).toBe(2200);
    const entrance = zone.stage?.stage.events.find((e) => e.type === 'bonus');
    expect(entrance?.type === 'bonus' ? entrance.entrance : '').toBe('ground');
    const until = entrance?.type === 'bonus' ? entrance.until : 0;
    // Shoot down every ground enemy of the gallery as it comes on screen (the player's kills).
    let shot = 0;
    for (let i = 0; i < 3000 && zone.camera.x <= until; i++) {
      for (const e of zone.enemies.enemies) {
        if (e.state !== EnemyState.Live || e.anchor === BodyAnchor.Air) continue;
        if ((e.flags & EnemyFlag.OnScreen) !== 0 && zone.enemies.kill(e, 0)) shot++;
      }
      step(0);
    }
    expect(shot).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < 10 && zone.bonus.entered < 0; i++) step(0);
    expect(zone.bonus.entered).toBeGreaterThanOrEqual(0);
    expect(DB.stages[zone.bonus.enteredStage()].id).toBe('glimmer-cache');
    // The warp: the cache with the players carried in.
    for (let i = 0; i < 100 && stageOf(game) === 'zone-g'; i++) step(0);
    expect(stageOf(game)).toBe('glimmer-cache');
    expect(flow.run.inBonus).toBe(true);
    const cache = game.world;
    expect(cache.stage?.stage.type).toBe('bonus');
    expect(cache.weapons.loadouts[0].options).toBe(zone.weapons.loadouts[0].options);
    // Its clear is the zone's clear: FACET MONARCH never comes.
    const bot = fourWayBot();
    for (let i = 0; i < 4000 && flow.stack.top?.id === 'game'; i++) step(bot.decide(game.world));
    expect(flow.stack.top?.id).toBe('stageClear');
    expect(game.world).toBe(cache);
    expect(cache.status).toBe('stageClear');
    expect(cache.bosses.boss.specIndex).toBe(-1);
  }, 60_000);

  /**
   * Plays zone G from a checkpoint through the prism gallery, shooting nothing until the gallery's
   * `ground` entrance arms, then every ground enemy on screen — sparing the first ceiling turret
   * when asked — until its window has closed.
   *
   * @param checkpoint - Checkpoint to start from.
   * @param spare - Whether a gallery turret is left standing.
   * @returns The entrance that opened (-1 = none).
   */
  function playGallery(checkpoint: number, spare: boolean): number {
    const game = createGame(
      createHeadlessPlatform(),
      { seed: 1, stage: 'zone-g', autofire: false, remoteMode: false },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    world.stage?.restartAt(checkpoint);
    spawnPlayer(world.players[0], world.camera);
    const entrance = world.stage?.stage.events.find((e) => e.type === 'bonus');
    const armX = entrance?.x ?? 0;
    const until = entrance?.type === 'bonus' ? entrance.until : 0;
    expect(world.camera.x).toBeLessThan(armX);
    let spared = -1;
    for (let i = 0; i < 6000 && world.camera.x <= until + 60; i++) {
      if (world.bonus.armed[0] === 1) {
        for (const e of world.enemies.enemies) {
          if (e.state !== EnemyState.Live || e.anchor === BodyAnchor.Air) continue;
          if ((e.flags & EnemyFlag.OnScreen) === 0) continue;
          // Spare the gallery's first ceiling turret; shoot down every other one.
          if (spare && e.anchor === BodyAnchor.Ceiling && (spared < 0 || spared === e.slot)) {
            spared = e.slot;
            continue;
          }
          world.enemies.kill(e, 0);
        }
      }
      game.step();
      game.events.clear();
    }
    expect(world.camera.x).toBeGreaterThan(until);
    if (spare) expect(spared).toBeGreaterThanOrEqual(0);
    return world.bonus.entered;
  }

  // From the start, the turret before the gallery has left the screen when the window arms: it
  // cannot be shot in the gallery turret's place (a kill of it would count toward the window).
  it.each([0, 1])(
    'keeps the gallery entrance shut when a turret survives its window (checkpoint %i)',
    (checkpoint) => {
      expect(playGallery(checkpoint, true)).toBe(-1);
    },
  );

  it('opens the gallery entrance from the zone’s start when every gallery turret is shot', () => {
    expect(playGallery(0, false)).toBe(0);
  });

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
    const px = (cell % map.cols) * 8 + 4;
    const py = Math.floor(cell / map.cols) * 8 + 4;
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
    world.stage?.jumpTo(px - 300);
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

  it('stacks PRISM LABYRINTH’s cube rush into its crystal pillars; a restart rolls the cubes back', () => {
    const game = createGame(
      createHeadlessPlatform(),
      { seed: 1, stage: 'zone-g', autofire: false, remoteMode: false },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    world.stage?.restartAt(2);
    spawnPlayer(world.players[0], world.camera);
    const cube = tileId(world, 'cube');
    let most = 0;
    for (let i = 0; i < 2400; i++) {
      game.step();
      game.events.clear();
      if (i % 30 === 0) most = Math.max(most, placed(world, cube));
    }
    expect(most).toBeGreaterThanOrEqual(3);
    world.stage?.restartAt(2);
    game.step();
    game.events.clear();
    expect(placed(world, cube)).toBe(0);
  });
});

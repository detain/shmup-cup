/**
 * Zones D and E through the real game on the shipped content (plan M2-12):
 *
 * - **MAGMA DEEP's dive.** The camera stops over the pit at the end of the caldera fields, pans
 *   200 px down into the caves while it holds, then scrolls on down there; a practice start (the
 *   scene flow's `startPractice`) at the checkpoint in the caves prepares zone D's music set and
 *   puts the camera back down in the caves.
 * - **The destructible maze.** In the caves the ship's shots break the brick walls (breakable
 *   tiles of the zone's tileset): the walls lose bricks while the ship flies through.
 * - **TEMPEST RIDGE's rear attackers.** Squall jumpers and gale kites come on screen behind the
 *   ship — left of it — and overtake it.
 */
import {
  ENGINE_SPRITES,
  EnemyState,
  KNOWN_SCRIPT_IDS,
  SimEventKind,
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
  it('dives MAGMA DEEP’s camera 200 px into the caves at a scroll stop, then scrolls on', () => {
    const game = createGame(createHeadlessPlatform(), { seed: 1, stage: 'zone-d' }, DB);
    const world = game.world;
    world.debugFlags.godMode = true;
    world.stage?.jumpTo(3300);
    let stopped = 0;
    let deepest = 0;
    for (let i = 0; i < 1200 && world.camera.x < 3700; i++) {
      const x = world.camera.x;
      const y = world.camera.y;
      game.step();
      game.events.clear();
      if (world.camera.x === x && world.camera.y > y) stopped++;
      deepest = Math.max(deepest, world.camera.y);
    }
    // The pan ran while the scroll stood still, down to the caves, and the scroll went on.
    expect(stopped).toBeGreaterThan(100);
    expect(deepest).toBe(200);
    expect(world.camera.x).toBeGreaterThanOrEqual(3700);
    expect(world.camera.y).toBe(200);
    expect(world.status).toBe('playing');
  });

  it('starts a practice run in the caves: zone D’s music set prepared, the camera down there', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(platform, { seed: 3, stage: 'zone-a' }, DB, { scenes: 'game' });
    game.debug.godMode = true;
    const flow = game.scenes as SceneFlow;
    const prepared: number[] = [];
    expect(flow.startPractice('d', 2)).toBe(true);
    commitPlayerInput(platform.snapshot.players[0], 0);
    game.step();
    game.events.drain((e) => {
      if (e.kind === SimEventKind.PrepareStage) prepared.push(e.id);
    });
    const world = game.world;
    expect(world.stage?.stage.id).toBe('zone-d');
    expect(prepared).toContain(DB.stageIndex.get('zone-d'));
    expect(Math.floor(world.camera.x)).toBe(4000);
    expect(world.camera.y).toBe(200);
    // The ship flies in down there too, in the open band of the caves.
    for (let i = 0; i < 90; i++) game.step();
    const ship = world.players[0];
    expect(ship.state).toBe('alive');
    expect(ship.y - world.camera.y).toBeGreaterThan(40);
    expect(ship.y - world.camera.y).toBeLessThan(160);
  });

  it('breaks MAGMA DEEP’s brick walls with the ship’s shots on the way through the maze', () => {
    const game = createGame(
      createHeadlessPlatform(),
      { seed: 1, stage: 'zone-d', loadout: 'full' },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    world.stage?.jumpTo(4300);
    // Fly in anew where the camera is now (down in the caves), at the middle row.
    spawnPlayer(world.players[0], world.camera);
    game.step();
    const before = bricks(world);
    expect(before).toBeGreaterThan(200);
    for (let i = 0; i < 2400 && world.camera.x < 5700; i++) {
      game.step();
      game.events.clear();
    }
    expect(world.camera.x).toBeGreaterThanOrEqual(5500);
    // Autofire (and the Options) chewed holes into the walls the ship flew at.
    expect(bricks(world)).toBeLessThan(before - 10);
  });

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

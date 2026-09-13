/**
 * The stage gimmick behaviours of plan M2-07 (`core/behaviors`) driving their enemies in a World
 * with the shipped `gimmick-range` roster on a still camera between a flat floor (y 160) and a flat
 * ceiling (y 32): the falling rock (proximity trigger, shatters on the floor, no score), the
 * splitting bubble (children fanned out, none from a Mega Crash), the volcano (seeded lobs that
 * shatter), the suction pod (pull field while it lives), the grabbing tentacle (chain, lunge with a
 * short pull, retract) and the seeded cube rush (cubes stacking into terrain tiles, undone by the
 * checkpoint rollback).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { TerrainType, terrainAt } from '../../src/collision/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { EnemyState, type Enemy } from '../../src/enemies/index.js';
import { FX_CUES, SimEventKind } from '../../src/events/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { BALLISTIC_LANDED, MoverKind } from '../../src/patterns/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';

/**
 * A shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The file.
 */
function shipped(path: string): ContentFile {
  return {
    path,
    data: JSON.parse(
      readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
    ) as unknown,
  };
}

/**
 * The KESTREL, `terrain-a`, the gimmick roster and a still stage between a flat floor and ceiling.
 *
 * @param rle - Optional RLE rows over the generated terrain (25 of them).
 * @returns The DB.
 */
function db(rle?: string[]): ContentDb {
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('tilesets/terrain-a.tileset.json'),
      shipped('enemies/gimmick-range.enemies.json'),
      {
        path: 'stages/g.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 'g',
          name: 'G',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 2000,
          camera: [{ x: 0, speed: 0 }],
          checkpoints: [{ x: 0 }],
          parallax: [],
          tilemap: {
            tileSize: 8,
            tileset: 'terrain-a',
            rowsTall: 25,
            ...(rle === undefined ? {} : { rle }),
            generator: {
              type: 'heightfield',
              segments: [
                {
                  from: 0,
                  to: 2384,
                  floor: { base: 40, amp: 0, period: 64, seed: 1 },
                  ceiling: { base: 32, amp: 0, period: 64, seed: 2 },
                },
              ],
            },
          },
          events: [],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

const DB = db();

/**
 * A world on the still stage, the ship flown in and immortal.
 *
 * @param content - Content.
 * @param seed - Seed.
 * @returns The world.
 */
function world(content = DB, seed = 3): World {
  const w = createWorld(resolveGameConfig({ seed, stage: 'g' }), content);
  w.debugFlags.godMode = true;
  run(w, 45);
  return w;
}

/**
 * Steps a world with no input.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) stepWorld(w, input);
}

/**
 * Spawns a roster enemy at a world point (`NaN` y: snapped to its surface).
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param x - World x.
 * @param y - World y.
 * @returns The enemy.
 */
function spawn(w: World, id: string, x: number, y: number): Enemy {
  const e = w.enemies.spawn(w.content.enemyIndex.get(id) ?? -1, x, y);
  if (e === null) throw new Error('could not spawn ' + id);
  return e;
}

/**
 * Live enemies of one spec.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @returns They.
 */
function live(w: World, id: string): Enemy[] {
  const index = w.content.enemyIndex.get(id);
  return w.enemies.enemies.filter((e) => e.state === EnemyState.Live && e.specIndex === index);
}

describe('core/behaviors gimmicks — rock.fall', () => {
  it('hangs from the ceiling until a ship comes within its trigger, then falls and shatters', () => {
    const w = world();
    const ship = w.players[0];
    const rock = spawn(w, 'falling-rock', 300, Number.NaN);
    expect(rock.y).toBe(32 + 5); // under the ceiling surface
    run(w, 60);
    expect([rock.state, rock.y]).toEqual([EnemyState.Live, 37]);
    expect(rock.mover).toBe(MoverKind.Ballistic);
    ship.x = 300 - 56; // exactly at the trigger distance
    w.events.clear();
    const score = w.scoring.board.scores[0].score;
    let landed = -1;
    for (let t = 0; t < 120 && landed < 0; t++) {
      run(w, 1);
      if (rock.state !== EnemyState.Live) landed = t;
      ship.x = 244; // keep it there (the ship does not move by itself)
    }
    expect(landed).toBeGreaterThan(10);
    // Shattered by the enemy system: its explosion, no kill credit.
    const kinds: number[] = [];
    w.events.drain((e) => {
      if (e.kind === SimEventKind.Particles) kinds.push(e.id);
    });
    expect(kinds).toContain(FX_CUES.ExplosionMedium);
    expect(w.scoring.board.scores[0].score).toBe(score);
  });
});

describe('core/behaviors gimmicks — bubble.split', () => {
  it('splits into its children fanned out left, which then drift', () => {
    const w = world();
    const bubble = spawn(w, 'bubble', w.camera.x + 250, 100);
    run(w, 2);
    expect(w.enemies.kill(bubble, 0)).toBe(true);
    const pieces = live(w, 'bubble-small');
    expect(pieces).toHaveLength(2);
    for (const piece of pieces) {
      expect(piece.mover).toBe(MoverKind.Straight);
      expect(piece.vx).toBeLessThan(0);
    }
    expect(Math.sign(pieces[0].vy)).toBe(-Math.sign(pieces[1].vy)); // one up, one down
    run(w, 40);
    for (const piece of pieces) expect(piece.mover).toBe(MoverKind.Sine);
    // A small bubble has no child: it just pops.
    w.enemies.kill(pieces[0], 0);
    expect(live(w, 'bubble-small')).toHaveLength(1);
  });

  it('does not split in a Mega Crash', () => {
    const w = world();
    spawn(w, 'bubble', w.camera.x + 250, 100);
    run(w, 40); // on screen
    expect(w.enemies.megaCrash(0)).toBe(1);
    expect(live(w, 'bubble-small')).toHaveLength(0);
  });
});

describe('core/behaviors gimmicks — volcano.lob', () => {
  it('lobs its stones on seeded arcs that shatter on the floor, identically per seed', () => {
    const a = world();
    const b = world();
    for (const w of [a, b]) spawn(w, 'volcano', w.camera.x + 250, Number.NaN);
    const volcano = live(a, 'volcano')[0];
    expect(volcano.y).toBe(160 - 5); // on the floor
    let seen = 0;
    let shattered = false;
    for (let t = 0; t < 400; t++) {
      run(a, 1);
      run(b, 1);
      const stones = live(a, 'lava-stone');
      if (stones.length > seen) {
        for (const stone of stones.slice(seen)) {
          expect(stone.mover).toBe(MoverKind.Ballistic);
          expect(stone.m1).toBeLessThan(-2.4); // thrown up
          expect(Math.abs(stone.m0)).toBeLessThanOrEqual(1.25);
        }
      }
      if (seen > 0 && stones.length < seen) shattered = true;
      seen = stones.length;
    }
    expect(shattered).toBe(true);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });
});

describe('core/behaviors gimmicks — field.suction', () => {
  it('pulls the ships in its radius towards it while it lives', () => {
    const w = world();
    const ship = w.players[0];
    ship.x = w.camera.x + 150;
    ship.y = 100;
    const pod = spawn(w, 'suction-pod', w.camera.x + 250, 100);
    // Its script looks every 8 ticks until the pod is on screen, then starts the field.
    run(w, 10);
    expect(w.gimmicks.fieldOwner[0]).toBe(pod.slot);
    const before = ship.x;
    run(w, 20);
    expect(ship.x).toBeGreaterThan(before + 8); // 0.5 px a tick towards the pod
    expect(ship.y).toBe(100);
    w.enemies.kill(pod, 0);
    run(w, 2);
    const after = ship.x;
    run(w, 10);
    expect(ship.x).toBe(after);
    expect(w.gimmicks.fieldOwner[0]).toBe(-1);
  });
});

describe('core/behaviors gimmicks — tentacle.grab', () => {
  it('draws its chain, lunges at a ship in reach with a short pull, then retracts', () => {
    const w = world();
    const ship = w.players[0];
    const tentacle = spawn(w, 'tentacle', w.camera.x + 250, Number.NaN);
    const anchorX = tentacle.x;
    const anchorY = tentacle.y;
    expect(anchorY).toBe(32 + 4);
    run(w, 40); // settled, ship out of reach (x 64)
    expect(w.gimmicks.chainOwner[0]).toBe(tentacle.slot);
    expect(w.gimmicks.chainBatch.count).toBe(8);
    expect([tentacle.x, tentacle.y]).toEqual([anchorX, anchorY]);
    ship.x = anchorX - 60;
    ship.y = 110;
    let lunged = false;
    for (let t = 0; t < 30 && !lunged; t++) {
      run(w, 1);
      ship.x = anchorX - 60;
      ship.y = 110;
      lunged = tentacle.mover === MoverKind.Homing;
    }
    expect(lunged).toBe(true);
    expect(w.gimmicks.fieldOwner[0]).toBe(tentacle.slot); // the grab's pull
    run(w, 20);
    expect(tentacle.y).toBeGreaterThan(anchorY + 10); // reaching down at the ship
    run(w, 30); // past the lunge: back to the anchor
    expect(tentacle.mover).toBe(MoverKind.Waypoint);
    expect(w.gimmicks.fieldOwner[0]).toBe(-1);
    run(w, 80);
    expect(tentacle.x).toBeCloseTo(anchorX, 6);
    expect(tentacle.y).toBeCloseTo(anchorY, 6);
    // The chain goes with its owner.
    w.enemies.kill(tentacle, 0);
    run(w, 1);
    expect([w.gimmicks.chainOwner[0], w.gimmicks.chainBatch.count]).toEqual([-1, 0]);
  });
});

describe('core/behaviors gimmicks — cube.stack (the seeded cube rush)', () => {
  // A solid wall at tile column 5 (x 40…47), rows 5…19 (y 40…159), behind the ship.
  const rows: string[] = [];
  for (let r = 0; r < 25; r++) rows.push(r >= 5 && r <= 19 ? '5*0, 1' : '');
  const WALL_DB = db(rows);

  /**
   * Runs a rush of cubes at the ship and returns the cube tiles placed (their cells).
   *
   * @param seed - World seed.
   * @returns The world and the cells holding the `cube` tile.
   */
  const rush = (seed: number): { w: World; cells: number[] } => {
    const w = world(WALL_DB, seed);
    const ship = w.players[0];
    const cube = w.gimmicks.tileId('cube');
    expect(cube).toBeGreaterThan(0);
    for (let k = 0; k < 6; k++) {
      spawn(w, 'rush-cube', w.camera.x + 380, 100);
      for (let t = 0; t < 40; t++) {
        run(w, 1);
        ship.x = w.camera.x + 120;
        ship.y = 100;
      }
    }
    run(w, 300);
    const map = w.terrain;
    if (map === null) throw new Error('no terrain');
    const cells: number[] = [];
    for (let i = 0; i < map.tiles.length; i++) if (map.tiles[i] === cube) cells.push(i);
    return { w, cells };
  };

  it('turns cubes that reach the terrain into cube tiles (stacking), seeded per run', () => {
    const { w, cells } = rush(4);
    expect(cells.length).toBeGreaterThanOrEqual(3);
    expect(live(w, 'rush-cube')).toHaveLength(0);
    const map = w.terrain;
    if (map === null) return;
    // Every placed cube touches the wall or another cube (a stack, sides or corners).
    for (const cell of cells) {
      const col = cell % map.cols;
      const row = (cell - col) / map.cols;
      let touches = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const px = (col + dx) * 8 + 4;
          const py = (row + dy) * 8 + 4;
          if (terrainAt(map, px, py) === TerrainType.Solid) touches = true;
        }
      }
      expect(touches, `cell ${String(col)},${String(row)}`).toBe(true);
    }
    // Some stack on another cube (cells beyond the column next to the wall).
    expect(cells.some((cell) => cell % map.cols > 6)).toBe(true);
    expect(w.gimmicks.destructible?.count).toBe(cells.length);
    // The same seed stacks the same cells; the rollback removes them.
    expect(rush(4).cells).toEqual(cells);
    w.stage?.restartAt(0);
    expect(map.tiles.filter((t) => t === w.gimmicks.tileId('cube'))).toHaveLength(0);
  });

  it('shatters when it lands where no tile can go (no `cube` tile in the tileset)', () => {
    const w = world(WALL_DB, 4);
    const e = spawn(w, 'rush-cube', w.camera.x + 380, 100);
    // Its script looked the tile up when it started; pretend the tileset had none.
    run(w, 1);
    e.m5 = 1;
    let landed = false;
    for (let t = 0; t < 400 && e.state === EnemyState.Live; t++) {
      run(w, 1);
      w.players[0].x = w.camera.x + 120;
      if (e.s0 === BALLISTIC_LANDED) landed = true;
    }
    expect(landed).toBe(true);
    expect(e.state).not.toBe(EnemyState.Live);
  });
});

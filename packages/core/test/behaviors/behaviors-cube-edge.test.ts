/**
 * Edge cases of `cube.pincer` (plan M2-05, shmup_feat.md §6B) beyond `behaviors-cube`: a lone cube
 * (no formation — never mirrored), the mirror image of an odd member at its spawn, a cube on the
 * middle row meeting below it, the meeting point in view space while the camera scrolls, tunables
 * from the enemy's `params`, a wave that is never shot never firing a bullet and leaving without a
 * drop, and the direct range's six waves all built from cubes.
 */
import { describe, expect, it } from 'vitest';
import { KNOWN_SCRIPT_IDS } from '../../src/behaviors/index.js';
import { PLAYFIELD_H } from '../../src/config/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { EnemyState, type Enemy } from '../../src/enemies/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { ENGINE_SPRITES, stepWorld, type World } from '../../src/world/index.js';
import { aliveWorld, directDb, shipped } from '../helpers/direct.js';

/** The shared content. */
const DB = directDb();

/** The middle row of the playfield (view y). */
const HALF = PLAYFIELD_H / 2;

/**
 * Steps a world with no input.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
function idle(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let t = 0; t < ticks; t++) stepWorld(w, input);
}

/**
 * Spawns a lone cube of a content at a view position, with nobody left to shoot it.
 *
 * @param w - The world.
 * @param db - Its content.
 * @param id - Enemy id.
 * @param vx - View x.
 * @param vy - View y.
 * @returns The cube.
 */
function lone(w: World, db: ContentDb, id: string, vx: number, vy: number): Enemy {
  // Nobody shoots it: player 1 leaves and its shots in flight go.
  w.players[0].active = false;
  w.weapons.pool.clear();
  const e = w.enemies.spawn(db.enemyIndex.get(id) ?? -1, w.camera.x + vx, w.camera.y + vy);
  expect(e).not.toBeNull();
  return e!;
}

describe('core/behaviors cube.pincer — edges', () => {
  it('a lone cube is not mirrored: it meets on its own side, then leaves left', () => {
    const w = aliveWorld(DB);
    w.players[0].active = false;
    const cube = lone(w, DB, 'cube', 300, 40);
    expect(cube.member).toBeLessThan(0);
    idle(w, 1);
    expect(cube.y - w.camera.y).toBeLessThan(HALF); // still above the middle
    idle(w, 200);
    expect(cube.y - w.camera.y).toBeCloseTo(HALF - 8, 6);
    expect(cube.vx).toBeCloseTo(-1.75, 6);
    idle(w, 300);
    expect(cube.state).not.toBe(EnemyState.Live); // gone off the left edge
  });

  it('a cube on the middle row meets 8 px below it', () => {
    const w = aliveWorld(DB);
    w.players[0].active = false;
    const cube = lone(w, DB, 'cube', 300, HALF);
    idle(w, 200);
    expect(cube.y - w.camera.y).toBeCloseTo(HALF + 8, 6);
  });

  it('mirrors odd members across the middle row and meets in view space while the view scrolls', () => {
    const w = aliveWorld(DB, { stage: 'direct-range', autofire: false, remoteMode: false });
    const cubeId = DB.enemyIndex.get('cube');
    const seen = new Map<number, number>();
    const input = createInputSnapshot();
    for (let t = 0; t < 400 && seen.size < 6; t++) {
      stepWorld(w, input);
      for (const e of w.enemies.enemies) {
        if (e.state !== EnemyState.Live || e.specIndex !== cubeId || seen.has(e.member)) continue;
        seen.set(e.member, e.y - w.camera.y);
      }
    }
    expect(seen.size).toBe(6);
    // The formation spawns at view y 28 (+ the first ticks' flight): odd members at the mirror.
    const top = seen.get(0)!;
    const bottom = seen.get(1)!;
    expect(top).toBeLessThan(HALF);
    expect(bottom).toBeGreaterThan(HALF);
    expect(Math.abs(top + bottom - PLAYFIELD_H)).toBeLessThan(4);
    const cam = w.camera.x;
    idle(w, 180);
    expect(w.camera.x).toBeGreaterThan(cam);
    const live = w.enemies.enemies.filter(
      (e) => e.state === EnemyState.Live && e.specIndex === cubeId,
    );
    expect(live.length).toBeGreaterThan(0);
    for (const e of live) {
      expect(Math.abs(Math.abs(e.y - w.camera.y - HALF) - 8)).toBeLessThan(1e-6);
    }
  });

  it('takes its speed, meeting point, gap and leave speed from the enemy`s params', () => {
    const { db, issues } = loadContent(
      [
        shipped('player/manta.player.json'),
        shipped('weapons/direct.weapons.json'),
        {
          path: 'enemies/wide.enemies.json',
          data: {
            formatVersion: 1,
            kind: 'enemies',
            enemies: [
              {
                id: 'wide-cube',
                hp: 1,
                score: 100,
                hurtbox: { hw: 5, hh: 5 },
                script: 'cube.pincer',
                sprite: 'enemies/cube',
                params: { speed: 3, meetX: 100, gap: 30, leaveSpeed: 0.5 },
                drop: null,
              },
            ],
          },
        },
      ],
      { extraSprites: ENGINE_SPRITES, knownScripts: KNOWN_SCRIPT_IDS },
    );
    expect(issues).toEqual([]);
    const w = aliveWorld(db, { stage: null });
    w.players[0].active = false;
    const cube = lone(w, db, 'wide-cube', 300, 150);
    idle(w, 2);
    // Moving at 3 px/tick towards view (100, HALF + 30).
    expect(Math.sqrt(cube.vx * cube.vx + cube.vy * cube.vy)).toBeCloseTo(3, 6);
    idle(w, 120);
    expect(cube.y - w.camera.y).toBeCloseTo(HALF + 30, 6);
    expect(cube.x - w.camera.x).toBeLessThan(100);
    expect(cube.vx).toBeCloseTo(-0.5, 6);
  });

  it('an unshot wave never fires and leaves without its drop', () => {
    const w = aliveWorld(DB, { stage: 'direct-range', autofire: false, remoteMode: false });
    w.players[0].active = false;
    w.debugFlags.godMode = true;
    const input = createInputSnapshot();
    let bullets = 0;
    for (let t = 0; t < 700; t++) {
      stepWorld(w, input);
      bullets = Math.max(bullets, w.bullets.pool.count);
    }
    expect(bullets).toBe(0);
    expect(w.powerups.planCursor).toBe(0);
    expect(w.powerups.count).toBe(0);
  });

  it('the direct range`s waves are six-cube pincers dropping the next planned item', () => {
    const stage = DB.stages[DB.stageIndex.get('direct-range') ?? -1];
    const waves = stage.events.filter((e) => e.type === 'formation');
    expect(waves.length).toBeGreaterThanOrEqual(6);
    for (const e of waves) {
      expect(e).toMatchObject({ enemy: 'cube', count: 6, drop: 'powerup' });
    }
    // Every colour among the first six items the stage hands out.
    expect(new Set(stage.directItems.slice(0, 6)).size).toBe(6);
  });
});

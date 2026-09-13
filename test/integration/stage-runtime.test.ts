/**
 * The shipped stages end to end (plan M1-07), beyond `stage-terrain.test.ts`:
 *
 * - the `test-range` terrain is generated identically on every machine and run: its tile grid
 *   has a pinned FNV-1a fingerprint (the heightfield uses only exactly rounded maths and the
 *   committed sine table — a change here means the generator or the stage file changed, so
 *   re-pin it deliberately, never to make a flaky test pass);
 * - the terrain leaves a flyable corridor: in every pixel column of the stage the open space of
 *   the playfield is at least 48 px tall, and the fly-in spawn point is clear at every
 *   checkpoint;
 * - a headless game restarted at every checkpoint of every shipped stage plays on to
 *   `stageClear` (a boss — M1-13 — is defeated as soon as it fights), with equal `hashWorld` for
 *   two identical sessions, and the restarted camera continues at the checkpoint x;
 * - the terrain the World collides with is the terrain the renderer is told to draw.
 */
import {
  BossState,
  ENTER_END_X,
  PLAYFIELD_H,
  SPAWN_Y,
  TerrainType,
  boxHitsTerrain,
  createGame,
  createHeadlessPlatform,
  hashWorld,
  loadContent,
  terrainAt,
  type ContentDb,
  type Game,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

/**
 * The shipped content DB.
 *
 * @returns The DB (asserted issue-free).
 */
function shipped(): ContentDb {
  const { db, issues } = loadContent(readContentFiles());
  expect(issues).toEqual([]);
  return db;
}

/**
 * 32-bit FNV-1a of a byte array.
 *
 * @param bytes - The bytes.
 * @returns The hash as 8 hex digits.
 */
function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** The pinned fingerprint of the generated `test-range` tile grid (see the module docs). */
const TEST_RANGE_TERRAIN = { cols: 648, rows: 25, fnv: '4f750aee' };

describe('integration: test-range terrain', () => {
  it('generates the pinned tile grid (deterministic heightfield)', () => {
    const terrain = shipped().stages.find((s) => s.id === 'test-range')?.terrain;
    expect(terrain).toBeTruthy();
    if (!terrain) return;
    expect({ cols: terrain.cols, rows: terrain.rows, fnv: fnv1a(terrain.tiles) }).toEqual(
      TEST_RANGE_TERRAIN,
    );
    // A second, independent load gives the same bytes.
    const again = shipped().stages.find((s) => s.id === 'test-range')?.terrain;
    expect(again?.tiles).toEqual(terrain.tiles);
    expect(again?.tiles).not.toBe(terrain.tiles);
  });

  it('leaves a flyable corridor in every pixel column and a clear spawn at every checkpoint', () => {
    // Every shipped stage with terrain (test-range; zone A's floors and corridor since M1-18).
    const db = shipped();
    const stages = db.stages.filter((s) => s.terrain !== null);
    expect(stages.map((s) => s.id)).toEqual(expect.arrayContaining(['test-range', 'zone-a']));
    for (const stage of stages) {
      const game = createGame(createHeadlessPlatform(), { seed: 1, stage: stage.id }, db);
      const map = game.world.terrain;
      expect(map, stage.id).not.toBeNull();
      if (map === null) return;
      let narrowest = Number.POSITIVE_INFINITY;
      for (let x = 0; x < stage.length + 384; x++) {
        let run = 0;
        let best = 0;
        for (let y = 0; y < PLAYFIELD_H; y++) {
          run = terrainAt(map, x, y) === TerrainType.Empty ? run + 1 : 0;
          if (run > best) best = run;
        }
        if (best < narrowest) narrowest = best;
      }
      expect(narrowest, stage.id).toBeGreaterThanOrEqual(48);
      const box = game.world.ship.terrainBox;
      for (const checkpoint of stage.checkpoints) {
        for (let dx = -24; dx <= ENTER_END_X; dx += 4) {
          expect(
            boxHitsTerrain(map, checkpoint.x + dx, SPAWN_Y, box.hw, box.hh),
            `${stage.id} checkpoint ${String(checkpoint.x)} + ${String(dx)}`,
          ).toBe(TerrainType.Empty);
        }
      }
    }
  });

  it('collides with the very tiles the renderer draws', () => {
    const db = shipped();
    const game = createGame(createHeadlessPlatform(), { seed: 1, stage: 'test-range' }, db);
    expect(game.world.view.terrain?.tiles).toBe(game.world.terrain?.tiles);
    expect(game.world.view.terrain?.cols).toBe(game.world.terrain?.cols);
  });
});

describe('integration: checkpoint restarts on the shipped stages', () => {
  /**
   * Plays a stage headless: to a checkpoint, restarts there, then on to the end.
   *
   * @param db - Content.
   * @param stageId - Stage.
   * @param checkpoint - Checkpoint index.
   * @returns The game and the camera x right after the restart.
   */
  function restartRun(
    db: ContentDb,
    stageId: string,
    checkpoint: number,
  ): { game: Game; x: number } {
    const game = createGame(createHeadlessPlatform(), { seed: 11, stage: stageId }, db);
    const world = game.world;
    // Nobody steers: god mode keeps the ship alive to the end (deaths since M1-12).
    world.debugFlags.godMode = true;
    const runner = world.stage;
    if (runner === null) throw new Error('no stage');
    /** One tick: a scroll lock without a boss is released, a boss is defeated once it fights. */
    const step = (): void => {
      if (runner.locked && !world.bosses.active) runner.unlock();
      if (world.bosses.boss.state === BossState.Fight) world.bosses.defeat(0);
      game.step();
    };
    // 200 px past the checkpoint (300 ticks for the stage start), then back to it.
    const past = (checkpoint < 0 ? 0 : runner.stage.checkpoints[checkpoint].x) + 200;
    for (let t = 0; t < 20000 && world.status === 'playing'; t++) {
      if (runner.camera.x >= past && t >= 300) break;
      step();
    }
    expect(world.status).toBe('playing');
    runner.restartAt(checkpoint);
    const x = world.camera.x;
    // On to the end of the stage (a boss's death clears it before the camera gets there).
    const length = runner.stage.length;
    for (let t = 0; t < 20000 && world.status !== 'gameOver'; t++) {
      if (world.status === 'stageClear' && world.camera.x >= length) break;
      step();
    }
    return { game, x };
  }

  it('plays every shipped stage to stageClear from every checkpoint, deterministically', () => {
    const db = shipped();
    expect(db.stages.length).toBeGreaterThan(0);
    for (const stage of db.stages) {
      for (let cp = -1; cp < stage.checkpoints.length; cp++) {
        const label = `${stage.id} checkpoint ${String(cp)}`;
        const a = restartRun(db, stage.id, cp);
        const b = restartRun(db, stage.id, cp);
        expect(a.x, label).toBe(cp < 0 ? 0 : stage.checkpoints[cp].x);
        expect(a.game.world.status, label).toBe('stageClear');
        expect(a.game.world.camera.x, label).toBe(stage.length);
        expect(hashWorld(a.game.world), label).toBe(hashWorld(b.game.world));
      }
    }
    // Two full runs per checkpoint of every shipped stage (M2-07 added gimmick-range): seconds
    // alone, longer under the parallel load of `pnpm test`.
  }, 60_000);
});

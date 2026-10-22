/**
 * The shipped stages end to end (plan M1-07), beyond `stage-terrain.test.ts`:
 *
 * - the `test-range` terrain is generated identically on every machine and run: its tile grid
 *   has a pinned FNV-1a fingerprint (the heightfield uses only exactly rounded maths and the
 *   committed sine table — a change here means the generator or the stage file changed, so
 *   re-pin it deliberately, never to make a flaky test pass);
 * - the terrain leaves a flyable corridor: in every pixel column of the stage the playfield window
 *   holds a ≥ 48 px run of open or SHOOTABLE-OPEN cells — since the zone-F punch-seal adjudication
 *   a full-mask destructible cell (the tileset gives it `hp`) is a corridor the gun opens, so the
 *   run computation counts it as open — and the fly-in spawn point is clear at every checkpoint;
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
  createStageRunner,
  createHeadlessPlatform,
  hashWorld,
  loadContent,
  terrainAt,
  type ContentDb,
  type ContentFile,
  type Game,
  type StageSpec,
  type TerrainMap,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { K } from '../../packages/core/test/helpers/v1-port.js';
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

/**
 * The camera's top edge by camera x (the last value seen at each x — after a pan's hold), read
 * by walking the stage's camera path on the runner alone (no ship, no sim).
 *
 * @param stage - The stage spec (any issue-free content, shipped or fixture).
 * @returns A table of `stage.length + 385` camera-y values.
 */
function walkStageCamera(stage: StageSpec): Float64Array {
  const top = new Float64Array(stage.length + 385);
  const runner = createStageRunner(stage, { event() {}, clear() {} });
  let filled = 0;
  for (let t = 0; t < 60 * 60 * 20 && filled <= stage.length; t++) {
    runner.tick();
    const reached = Math.min(stage.length, Math.floor(runner.camera.x));
    for (let x = filled; x <= reached; x++) top[x] = runner.camera.y;
    if (reached >= filled) filled = reached;
  }
  for (let x = filled; x < top.length; x++) top[x] = runner.camera.y;
  return top;
}

/**
 * The narrowest flyable corridor of a pristine grid (the corridor law of the module docs): the
 * shortest, over every pixel column of the stage, of the longest vertical run of open cells in
 * the playfield window the camera shows there (the ship's own column, `x - 64`). A cell is open
 * when `terrainAt` reports `TerrainType.Empty` **or** when its tile the tileset gives `hp` — the
 * zone-F punch-seal adjudication: a full-mask destructible wall is a corridor the gun opens, so
 * the run computation counts it as open. The check reads only the World's tile grid and the
 * destructible machinery's per-tile hp table (`DestructibleTerrain.tileHp`, M2-07) — the JSON was
 * parsed at the boundary, nothing is parsed per call. A non-Empty `terrainAt` answer is always
 * inside the map, so the cell index below is safe; a moving block's pixel keeps its cell's verdict
 * only if that cell is non-empty (an empty cell under a block is tile id 0, `hp` 0, blocking).
 *
 * @param map - The World's pristine terrain grid.
 * @param tileHp - Hit points per tile id, or `null` when the stage has no destructible machinery
 *   (then every solid cell blocks, exactly as before the amendment).
 * @param top - Camera top edge per camera x ({@link walkStageCamera}).
 * @param length - The stage length in pixels.
 * @returns The narrowest corridor in pixels (`Infinity` if the window is never scanned).
 */
function narrowestCorridor(
  map: TerrainMap,
  tileHp: Uint8Array | null,
  top: Float64Array,
  length: number,
): number {
  const size = map.tileSize;
  const cols = map.cols;
  const tiles = map.tiles;
  let narrowest = Number.POSITIVE_INFINITY;
  for (let x = 0; x < length + 384; x++) {
    const y0 = Math.round(top[x < 64 ? 0 : x - 64]);
    const cellCol = Math.floor(x / size);
    let run = 0;
    let best = 0;
    for (let y = y0; y < y0 + PLAYFIELD_H; y++) {
      if (terrainAt(map, x, y) === TerrainType.Empty) {
        run += 1;
      } else if (tileHp !== null && tileHp[tiles[Math.floor(y / size) * cols + cellCol]] > 0) {
        run += 1;
      } else {
        run = 0;
      }
      if (run > best) best = run;
    }
    if (best < narrowest) narrowest = best;
  }
  return narrowest;
}

/**
 * The pinned fingerprint of the generated `test-range` tile grid (see the module docs). A grid
 * digest derives from no unit — it is the ported data's own identity — so it is pinned per scale:
 * the v1 grid, and R2-02's tool output on that same content (the kit port: 12-px tiles over the
 * ported generator, disclosed in the wave-03 report).
 */
const TEST_RANGE_TERRAIN =
  K === 1 ? { cols: 648, rows: 25, fnv: '4f750aee' } : { cols: 654, rows: 28, fnv: '4bee93c1' };

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
    // Measured in the rows the camera shows when the ship (x ≈ 64 in the view) reaches the column
    // — zone D (M2-12) dives 200 px into its caves on the way.
    const db = shipped();
    const stages = db.stages.filter((s) => s.terrain !== null);
    expect(stages.map((s) => s.id)).toEqual(
      expect.arrayContaining(['test-range', 'zone-a', 'zone-d']),
    );
    for (const stage of stages) {
      const game = createGame(createHeadlessPlatform(), { seed: 1, stage: stage.id }, db);
      const map = game.world.terrain;
      expect(map, stage.id).not.toBeNull();
      if (map === null) return;
      // The camera's top edge by camera x, and the per-tile hp the destructible machinery
      // carries (M2-07) — the cells the gun opens count toward the corridor (the adjudication).
      const top = walkStageCamera(stage);
      const destructible = game.world.gimmicks.destructible;
      const narrowest = narrowestCorridor(
        map,
        destructible === null ? null : destructible.tileHp,
        top,
        stage.length,
      );
      expect(narrowest, stage.id).toBeGreaterThanOrEqual(48);
      const box = game.world.ship.terrainBox;
      for (const checkpoint of stage.checkpoints) {
        const y = SPAWN_Y + Math.round(top[checkpoint.x]);
        for (let dx = -24; dx <= ENTER_END_X; dx += 4) {
          expect(
            boxHitsTerrain(map, checkpoint.x + dx, y, box.hw, box.hh),
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

describe('integration: the corridor law counts destructible cells as open (anti-rot)', () => {
  /** The zone-F tissue wall (`terrain-vault` id 20): full mask, hp 3 — the gun opens it. */
  const TISSUE_TILE = 20;
  /** Plain rock (`terrain-vault` id 1): full mask, no hp — nothing opens it. */
  const ROCK_TILE = 1;

  /**
   * A straight fly-through sealed the way zone-F's design chase walls seal it (w11-F report,
   * S5a): three full-height walls at columns 100-102, 127-129, 154-156 across rows 8 … 33 — the
   * whole camera window once the path pans to `yTo = 96` (y 96 … 407) — over a rock floor in rows
   * 34, 35 that shuts the window's bottom. Under the old Empty-only predicate every wall column
   * measures a 0 px corridor; under the adjudicated law the tissue columns measure the wall's
   * 312 px of shootable-open cells and only the rock columns stay sealed.
   *
   * @param wallTile - The sealing tile id (tissue or rock).
   * @param id - The stage id.
   * @returns The stage content file.
   */
  function sealStage(wallTile: number, id: string): ContentFile {
    const wall = `3*${String(wallTile)}, 24*0, 3*${String(wallTile)}, 24*0, 3*${String(wallTile)}`;
    const rle: string[] = [];
    for (let r = 0; r < 36; r++) {
      rle.push(r < 8 ? '' : r < 34 ? `100*0, ${wall}` : `95*0, 62*${String(ROCK_TILE)}`);
    }
    return {
      path: `stages/${id}.stage.json`,
      data: {
        formatVersion: 1,
        kind: 'stage',
        id,
        name: id,
        music: { stage: 'Stage', boss: 'Boss' },
        length: 2400,
        camera: [
          { x: 0, speed: 1.2, ramp: 60 },
          { x: 900, speed: 1, yTo: 96, yTicks: 150 },
        ],
        checkpoints: [{ x: 0 }],
        parallax: [],
        tilemap: { tileSize: 12, tileset: 'terrain-vault', rowsTall: 36, rle },
        events: [],
      },
    };
  }

  /**
   * The narrowest corridor of a seal fixture, measured through the shipped law's own helpers
   * (the same code path the shipped stages run — this is what rots if the amendment drifts).
   *
   * @param wallTile - The sealing tile id.
   * @param id - The stage id.
   * @returns The measurement in pixels.
   */
  function sealNarrowest(wallTile: number, id: string): number {
    const base = readContentFiles().filter(
      (f) =>
        f.path === 'tilesets/terrain-vault.tileset.json' || f.path === 'player/kestrel.player.json',
    );
    expect(base).toHaveLength(2);
    const { db, issues } = loadContent([...base, sealStage(wallTile, id)]);
    expect(issues).toEqual([]);
    const stage = db.stages.find((s) => s.id === id);
    if (stage === undefined) throw new Error(`fixture stage ${id} missing`);
    const game = createGame(createHeadlessPlatform(), { seed: 1, stage: id }, db);
    const map = game.world.terrain;
    if (map === null) throw new Error(`${id}: no terrain`);
    const destructible = game.world.gimmicks.destructible;
    return narrowestCorridor(
      map,
      destructible === null ? null : destructible.tileHp,
      walkStageCamera(stage),
      stage.length,
    );
  }

  it('opens a column sealed by full-mask destructible cells (tissue, hp > 0)', () => {
    expect(sealNarrowest(TISSUE_TILE, 'seal-tissue')).toBeGreaterThanOrEqual(48);
  });

  it('keeps a column sealed by plain rock closed (no hp, no exemption)', () => {
    expect(sealNarrowest(ROCK_TILE, 'seal-rock')).toBeLessThan(48);
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
    /**
     * One tick: a scroll lock without a boss is released, a boss is defeated once it fights — in
     * any slot (M2-09: a double boss's partner, an inner boss, a captain).
     */
    const step = (): void => {
      if (runner.locked && !world.bosses.active) runner.unlock();
      if (world.bosses.slots.some((b) => b.state === BossState.Fight)) world.bosses.defeat(0);
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

/**
 * The R3-06 decor runtime (`core/stage`): the compiled {@link createDecorView|StageDecorView}
 * (sprite items, tileset items, the dropped and undrawable entries, the two batch capacities),
 * the camera culling of {@link updateDecorView} (window at both ends, the margin columns), and
 * the World wiring (batches joined to the view list, `view.decor`, no batch for a stage without
 * decor). Also the R3-06 parallax additions on the runtime side: the `fore` band's layer, the
 * `yFactor` defaulting to the horizontal factor (a plain band scrolls as before) and the slow
 * `frames` / `frameTicks` cycling in {@link updateParallaxView}.
 */
import { describe, expect, it } from 'vitest';
import { PLAYFIELD_W, resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type StageSpec } from '../../src/data/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { LayerId } from '../../src/presentation/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld } from '../../src/world/index.js';
import {
  createDecorView,
  createParallaxView,
  updateDecorView,
  updateParallaxView,
} from '../../src/stage/index.js';
import { shipped } from '../helpers/campaign.js';

/** The rock tileset of the M1 stage tests (three solid tiles, frames 0 / 1 / 2). */
const TILESET = {
  formatVersion: 1,
  kind: 'tileset',
  id: 'rock',
  sprite: 'tiles/terrain-a',
  tileSize: 8,
  tiles: [
    { name: 'solid', type: 'solid', frame: 0, anchor: 'floor', mask: [8, 8, 8, 8, 8, 8, 8, 8] },
    { name: 'floor', type: 'solid', frame: 1, anchor: 'floor', mask: [8, 8, 8, 8, 8, 8, 8, 8] },
    { name: 'ceiling', type: 'solid', frame: 2, anchor: 'ceiling', mask: [8, 8, 8, 8, 8, 8, 8, 8] },
  ],
};

/**
 * Loads one stage body (plus the tileset) and returns the database.
 *
 * @param body - Stage fields over a minimal valid stage (length 1000).
 * @returns The DB (asserted issue-free).
 */
function stageDb(body: Record<string, unknown>): ContentDb {
  const { db, issues } = loadContent([
    {
      path: 'stages/s.stage.json',
      data: {
        formatVersion: 1,
        kind: 'stage',
        id: 's',
        name: 'S',
        music: { stage: 'Stage', boss: 'Boss' },
        length: 1000,
        camera: [{ x: 0, speed: 1 }],
        checkpoints: [],
        parallax: [],
        tilemap: null,
        events: [],
        ...body,
      },
    },
    { path: 'tilesets/rock.tileset.json', data: TILESET },
  ]);
  expect(issues).toEqual([]);
  return db;
}

/** The first stage of {@link stageDb}. */
const sStage = (body: Record<string, unknown>): StageSpec => stageDb(body).stages[0];

/** The margin columns culling keeps on both sides of the playfield. */
const MARGIN = 512;

describe('core/stage decor compile (R3-06)', () => {
  it('returns null without a decor list', () => {
    expect(createDecorView(sStage({}), stageDb({}))).toBeNull();
    expect(createDecorView(sStage({ decor: [] }), stageDb({ decor: [] }))).toBeNull();
  });

  it('compiles sprite items with their resolved sprite', () => {
    const db = stageDb({
      decor: [{ layer: 'back', sprite: 'bg/stars-far', frame: 2, x: 300, y: 60 }],
    });
    const view = createDecorView(db.stages[0], db);
    expect(view).not.toBeNull();
    expect(view?.count).toBe(1);
    expect(view?.layer[0]).toBe(LayerId.DecorBack);
    expect(view?.frame[0]).toBe(2);
    expect(view?.x[0]).toBe(300);
    expect(view?.y[0]).toBe(60);
    const band = stageDb({
      parallax: [{ layer: 'far', sprite: 'bg/stars-far', factor: 0.5, y: 0, spacing: 128 }],
    });
    expect(view?.spriteId[0]).toBe(band.stages[0].parallax[0].spriteId);
    expect(view?.front).toBeNull();
    expect(view?.back?.capacity).toBe(1);
    expect(view?.back?.layer).toBe(LayerId.DecorBack);
  });

  it('compiles tile items through the stage tileset', () => {
    const db = stageDb({
      tilemap: { tileSize: 8, tileset: 'rock', rowsTall: 5, rle: ['', '', '', '', '10*2'] },
      decor: [
        { layer: 'front', tile: 'floor', frame: 99, x: 100, y: 200 },
        { layer: 'back', tile: 'ceiling', frame: 0, x: 120, y: 0 },
      ],
    });
    const stage = db.stages[0];
    const view = createDecorView(stage, db);
    expect(view?.count).toBe(2);
    expect(view?.spriteId[0]).toBe(
      stage.terrain === null ? -1 : db.tilesets[stage.terrain.tilesetId].spriteId,
    );
    expect(view?.frame[0]).toBe(1); // the tile's own frame, not the entry's 99
    expect(view?.layer[0]).toBe(LayerId.DecorFront);
    expect(view?.frame[1]).toBe(2);
    expect(view?.back?.capacity).toBe(1);
    expect(view?.front?.capacity).toBe(1);
  });

  it('drops the items nothing can draw', () => {
    // A tile on a stage without a tilemap.
    expect(
      createDecorView(
        sStage({ decor: [{ layer: 'back', tile: 'floor', frame: 0, x: 10, y: 10 }] }),
        stageDb({}),
      ),
    ).toBeNull();
    // An unknown tile name.
    expect(
      createDecorView(
        sStage({
          tilemap: { tileSize: 8, tileset: 'rock', rowsTall: 5, rle: ['', '', '', '', ''] },
          decor: [{ layer: 'back', tile: 'moss', frame: 0, x: 10, y: 10 }],
        }),
        stageDb({
          tilemap: { tileSize: 8, tileset: 'rock', rowsTall: 5, rle: ['', '', '', '', ''] },
          decor: [{ layer: 'back', tile: 'moss', frame: 0, x: 10, y: 10 }],
        }),
      ),
    ).toBeNull();
  });

  it('keeps the dropped items out of the kept ones', () => {
    const db = stageDb({
      decor: [
        { layer: 'back', sprite: 'bg/stars-far', frame: 0, x: 10, y: 0 },
        { layer: 'back', tile: 'floor', frame: 0, x: 20, y: 0 },
        { layer: 'front', sprite: 'bg/stars-near', frame: 1, x: 30, y: 40 },
      ],
    });
    const view = createDecorView(db.stages[0], db);
    expect(view?.count).toBe(2); // the tile item fell out (no tilemap)
    expect(view?.back?.capacity).toBe(1);
    expect(view?.front?.capacity).toBe(1);
    expect(view?.x[0]).toBe(10);
    expect(view?.x[1]).toBe(30);
  });
});

describe('core/stage decor culling (R3-06)', () => {
  /** Items every 2000 px from x 0, alternating back / front (256 over 510,000 px). */
  const wideDb = (() => {
    const items = [];
    for (let i = 0; i < 256; i++) {
      items.push({
        layer: (i & 1) === 0 ? 'back' : 'front',
        sprite: 'bg/stars-far',
        frame: i % 4,
        x: i * 2000,
        y: 0,
      });
    }
    return stageDb({ length: 600_000, decor: items });
  })();

  /**
   * The window's item count on one layer for a camera x.
   *
   * @param cameraX - Camera x.
   * @param back - Count the back layer (else the front).
   * @returns How many of the 256 items sit in the window on that layer.
   */
  function windowCount(cameraX: number, back: boolean): number {
    let n = 0;
    for (let i = 0; i < 256; i++) {
      if (((i & 1) === 0) !== back) continue;
      const x = i * 2000;
      if (x >= cameraX - MARGIN && x <= cameraX + PLAYFIELD_W + MARGIN) n++;
    }
    return n;
  }

  it('fills both batches with the camera window', () => {
    const view = createDecorView(wideDb.stages[0], wideDb);
    expect(view).not.toBeNull();
    if (view === null) return;
    updateDecorView(view, 0);
    expect(view.back?.count).toBe(windowCount(0, true));
    expect(view.front?.count).toBe(windowCount(0, false));
    expect(view.back?.count).toBe(1); // only x 0 is inside the first window
    expect(view.front?.count).toBe(0);
    // Far ahead: the early items are gone, the near ones are in, and each list is packed.
    updateDecorView(view, 200_000);
    expect(view.back?.count).toBe(windowCount(200_000, true));
    expect(view.front?.count).toBe(windowCount(200_000, false));
    const left = 200_000 - MARGIN;
    const right = 200_000 + PLAYFIELD_W + MARGIN;
    for (let k = 0; k < (view.back?.count ?? 0); k++) {
      const bx = view.back?.x[k] ?? -1;
      expect(bx >= left && bx <= right).toBe(true);
    }
    expect(view.back?.frame[0]).toBe(100 % 4); // x 200_000: item 100, first in the window
  });

  it('refills from zero every call (no stale slots)', () => {
    const view = createDecorView(wideDb.stages[0], wideDb);
    if (view === null) throw new Error('expected a view');
    updateDecorView(view, 40_000);
    expect(view.back?.count).toBe(1); // x 40_000
    expect(view.front?.count).toBe(0); // x 42_000 is outside the right margin
    updateDecorView(view, 600_000); // past every item
    expect(view.back?.count).toBe(0);
    expect(view.front?.count).toBe(0);
  });
});

describe('core/stage decor world wiring (R3-06)', () => {
  /** A world DB: one open stage carrying a back and a front item and a fore band. */
  function decorWorld() {
    const { db, issues } = loadContent(
      [
        shipped('player/kestrel.player.json'),
        shipped('weapons/type-a.weapons.json'),
        {
          path: 'stages/decoy.stage.json',
          data: {
            formatVersion: 1,
            kind: 'stage',
            id: 'decoy',
            name: 'DECOY',
            music: { stage: 'Stage', boss: 'Boss' },
            length: 600,
            camera: [{ x: 0, speed: 2 }],
            checkpoints: [{ x: 0 }],
            parallax: [
              { layer: 'far', sprite: 'bg/stars-far', factor: 0.5, y: 0, spacing: 128 },
              {
                layer: 'fore',
                sprite: 'bg/stars-near',
                factor: 1.5,
                y: 200,
                spacing: 256,
                frames: 3,
                frameTicks: 4,
              },
            ],
            tilemap: null,
            events: [{ x: 600, type: 'end' }],
            decor: [
              { layer: 'back', sprite: 'bg/stars-far', frame: 0, x: 50, y: 60 },
              { layer: 'front', sprite: 'bg/stars-near', frame: 1, x: 100, y: 80 },
            ],
          },
        },
      ],
      { extraSprites: ENGINE_SPRITES },
    );
    expect(issues).toEqual([]);
    return createWorld(resolveGameConfig({ seed: 5, stage: 'decoy' }), db);
  }

  it('joins the decor batches to the view list', () => {
    const world = decorWorld();
    expect(world.decor).not.toBeNull();
    expect(world.view.decor).toBe(world.decor);
    expect(world.view.batches).toContain(world.decor?.back);
    expect(world.view.batches).toContain(world.decor?.front);
    // After creation the sync has already filled the window.
    expect(world.decor?.back?.count).toBe(1);
    expect(world.decor?.front?.count).toBe(1);
    // The fore band draws on its own layer, below the enemy bullets.
    expect(world.parallax?.layer[1]).toBe(LayerId.Foreground);
    expect(LayerId.Foreground).toBeLessThan(LayerId.EnemyBullets);
    expect(LayerId.DecorBack).toBeLessThan(LayerId.Terrain);
    expect(LayerId.DecorFront).toBeGreaterThan(LayerId.Terrain);
    expect(LayerId.DecorFront).toBeLessThan(LayerId.GroundEnemies);
  });

  it('scrolls the batches with the camera while the world steps', () => {
    const world = decorWorld();
    const input = createInputSnapshot();
    for (let i = 0; i < 100; i++) stepWorld(world, input);
    expect(world.camera.x).toBeGreaterThan(100);
    expect(world.decor?.back?.count).toBe(1);
    expect(world.decor?.back?.x[0]).toBe(50);
    // Past the window the back item is culled; the front one rides on inside the left margin
    // to the stage's end (camera 600 keeps x 100 within 512 px of the playfield).
    for (let i = 0; i < 400; i++) stepWorld(world, input);
    expect(world.decor?.back?.count).toBe(0);
    expect(world.decor?.front?.count).toBe(1);
  });

  it('adds no batch and no view for a stage without decor', () => {
    const { db, issues } = loadContent(
      [
        shipped('player/kestrel.player.json'),
        shipped('weapons/type-a.weapons.json'),
        {
          path: 'stages/plain.stage.json',
          data: {
            formatVersion: 1,
            kind: 'stage',
            id: 'plain',
            name: 'PLAIN',
            music: { stage: 'Stage', boss: 'Boss' },
            length: 600,
            camera: [{ x: 0, speed: 2 }],
            checkpoints: [{ x: 0 }],
            parallax: [],
            tilemap: null,
            events: [{ x: 600, type: 'end' }],
          },
        },
      ],
      { extraSprites: ENGINE_SPRITES },
    );
    expect(issues).toEqual([]);
    const world = createWorld(resolveGameConfig({ seed: 5, stage: 'plain' }), db);
    expect(world.decor).toBeNull();
    expect(world.view.decor).toBeNull();
    for (const batch of world.view.batches) {
      expect(batch.layer).not.toBe(LayerId.DecorBack);
      expect(batch.layer).not.toBe(LayerId.DecorFront);
    }
  });
});

describe('core/stage parallax R3-06 fields', () => {
  const band = { layer: 'far', sprite: 'bg/stars-far', factor: 0.5, y: 40, spacing: 128 };

  it('keeps a plain band scrolling exactly as before', () => {
    const view = createParallaxView(sStage({ parallax: [band] }));
    expect(view).not.toBeNull();
    if (view === null) return;
    updateParallaxView(view, 0, 100);
    expect(view.y[0]).toBe(40 - 100 * 0.5); // the old formula: cameraY × the factor
    expect(view.frameIndex[0]).toBe(0);
  });

  it('moves the fore band on its layer and pans by its own yFactor', () => {
    const view = createParallaxView(
      sStage({
        parallax: [
          { layer: 'fore', sprite: 'bg/stars-near', factor: 1.5, y: 200, spacing: 256 },
          { ...band, yFactor: 0 },
        ],
      }),
    );
    if (view === null) throw new Error('expected a view');
    expect(view.layer[0]).toBe(LayerId.Foreground);
    updateParallaxView(view, 0, 100);
    expect(view?.y[0]).toBe(200 - 100 * 1.5);
    expect(view?.y[1]).toBe(40); // yFactor 0: the band holds its row
  });

  it('cycles the animation frames over the tick clock', () => {
    const view = createParallaxView(sStage({ parallax: [{ ...band, frames: 3, frameTicks: 4 }] }));
    if (view === null) throw new Error('expected a view');
    expect(view.frames[0]).toBe(3);
    expect(view.frameTicks[0]).toBe(4);
    const seen: number[] = [];
    for (let tick = 0; tick < 13; tick++) {
      updateParallaxView(view, 0, 0, tick);
      seen.push(view.frameIndex[0]);
    }
    expect(seen).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 0]);
  });

  it('leaves a static band on frame 0 whatever the tick', () => {
    const view = createParallaxView(sStage({ parallax: [band] }));
    if (view === null) throw new Error('expected a view');
    updateParallaxView(view, 0, 0, 10_000);
    expect(view.frameIndex[0]).toBe(0);
  });
});

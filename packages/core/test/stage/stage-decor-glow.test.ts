/**
 * The R3-06.L4 glow half of the stage decor (`core/stage`): the compiled `glow` ids (sprite
 * items and tileset items alike), the per-layer glow batches (created only for a layer whose
 * items actually glow), the additive refill of {@link updateDecorView} under the same camera
 * window as the owners, and the World wiring (each glow batch follows its owner batch in the
 * view's batch list; a stage whose items carry no glow adds no glow batch at all).
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type StageSpec } from '../../src/data/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { LayerId } from '../../src/presentation/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld } from '../../src/world/index.js';
import { createDecorView, updateDecorView } from '../../src/stage/index.js';
import { shipped } from '../helpers/campaign.js';

/** The rock tileset of the decor tests (three solid tiles, frames 0 / 1 / 2). */
const TILESET = {
  formatVersion: 1,
  kind: 'tileset',
  id: 'rock',
  sprite: 'tiles/terrain-a',
  tileSize: 8,
  tiles: [
    { name: 'solid', type: 'solid', frame: 0, anchor: 'floor', mask: [8, 8, 8, 8, 8, 8, 8, 8] },
    { name: 'floor', type: 'solid', frame: 1, anchor: 'floor', mask: [8, 8, 8, 8, 8, 8, 8, 8] },
    {
      name: 'ceiling',
      type: 'solid',
      frame: 2,
      anchor: 'ceiling',
      mask: [8, 8, 8, 8, 8, 8, 8, 8],
    },
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

/** One decor entry over the sprite item at x 100. */
const decorItem = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  layer: 'back',
  sprite: 'bg/stars-far',
  frame: 0,
  x: 100,
  y: 60,
  ...over,
});

/** The first stage of a {@link stageDb} body. */
const stage = (body: Record<string, unknown>): StageSpec => stageDb(body).stages[0];

describe('core/stage decor glow compile (R3-06.L4)', () => {
  it('compiles the glow id of a sprite item and creates the additive back batch', () => {
    const db = stageDb({ decor: [decorItem({ glow: 'bg/stars-near' })] });
    const view = createDecorView(db.stages[0], db);
    expect(view?.glow[0]).toBe(db.sprites.index.get('bg/stars-near'));
    const glow = view?.glowBack;
    expect(glow).not.toBeNull();
    expect(glow?.blend).toBe('additive');
    expect(glow?.layer).toBe(LayerId.DecorBack);
    expect(glow?.capacity).toBe(1);
    expect(view?.glowFront).toBeNull(); // no front item at all
  });

  it('compiles the glow id of a tile item too (the terrain glow)', () => {
    const db = stageDb({
      tilemap: { tileSize: 8, tileset: 'rock', rowsTall: 5, rle: ['', '', '', '', '10*2'] },
      decor: [{ layer: 'back', tile: 'floor', frame: 0, x: 100, y: 60, glow: 'bg/stars-near' }],
    });
    const view = createDecorView(db.stages[0], db);
    expect(view?.glow[0]).toBe(db.sprites.index.get('bg/stars-near'));
    expect(view?.frame[0]).toBe(1); // the tile's frame rides on
  });

  it('leaves the glow batches null when no item glows, and per layer when only one does', () => {
    const plainDb = stageDb({ decor: [decorItem()] });
    const plain = createDecorView(plainDb.stages[0], plainDb);
    expect(plain?.glow).toBeDefined();
    expect(plain?.glowBack).toBeNull();
    expect(plain?.glowFront).toBeNull();
    const frontDb = stageDb({
      decor: [decorItem(), decorItem({ layer: 'front', glow: 'bg/stars-near' })],
    });
    const frontOnly = createDecorView(frontDb.stages[0], frontDb);
    expect(frontOnly?.glowBack).toBeNull(); // back items exist, but none glows
    expect(frontOnly?.glowFront).not.toBeNull();
  });

  it('keeps the glow field absent on items that name none (shape, not undefined)', () => {
    const st = stage({ decor: [decorItem(), decorItem({ x: 200, glow: 'bg/stars-near' })] });
    const first = st.decor?.[0] as unknown as Record<string, unknown>;
    expect('glow' in first).toBe(false);
    expect(first.glow).toBeUndefined();
    expect(st.decor?.[1].glow).toBe('bg/stars-near');
  });
});

describe('core/stage decor glow refill (R3-06.L4)', () => {
  it('refills the glow beside its owner, frame 0 and no flags, and culls together', () => {
    const db = stageDb({
      decor: [
        decorItem({ glow: 'bg/stars-near' }),
        decorItem({ x: 400, glow: 'bg/stars-near', y: 80 }),
      ],
    });
    const view = createDecorView(db.stages[0], db);
    if (view === null) throw new Error('no view');
    updateDecorView(view, 0);
    const glow = view.glowBack;
    expect(view.back?.count).toBe(2);
    expect(glow?.count).toBe(2);
    expect(glow?.spriteId[0]).toBe(db.sprites.index.get('bg/stars-near'));
    expect(glow?.frame[0]).toBe(0);
    expect(glow?.flags[0]).toBe(0);
    expect(glow?.y[1]).toBe(80);
    // The window culls both halves together (the margin, exactly like the owners).
    updateDecorView(view, 40_000);
    expect(view.back?.count).toBe(0);
    expect(glow?.count).toBe(0);
  });

  it('refills the front glow only for glowing items', () => {
    const db = stageDb({
      decor: [
        decorItem({ layer: 'front' }),
        decorItem({ layer: 'front', x: 200, glow: 'bg/stars-near' }),
      ],
    });
    const view = createDecorView(db.stages[0], db);
    if (view === null) throw new Error('no view');
    updateDecorView(view, 0);
    expect(view.front?.count).toBe(2);
    expect(view.glowFront?.count).toBe(1);
    expect(view.glowFront?.x[0]).toBe(200);
  });
});

describe('core/stage decor glow world wiring (R3-06.L4)', () => {
  /**
   * A one-stage DB with four decor items (two per layer); the second item of each pair glows
   * only when `glow`.
   *
   * @param glow - Whether the glows are there.
   * @returns The DB.
   */
  function wireDb(glow: boolean): ContentDb {
    const { db, issues } = loadContent(
      [
        shipped('player/kestrel.player.json'),
        shipped('weapons/type-a.weapons.json'),
        {
          path: 'stages/s.stage.json',
          data: {
            formatVersion: 1,
            kind: 'stage',
            id: 's',
            name: 'S',
            music: { stage: 'Stage', boss: 'Boss' },
            length: 600,
            camera: [{ x: 0, speed: 1 }],
            checkpoints: [],
            parallax: [],
            tilemap: null,
            events: [],
            decor: [
              decorItem(),
              decorItem(glow ? { glow: 'bg/stars-near' } : {}),
              decorItem({ layer: 'front', x: 200 }),
              decorItem({ layer: 'front', x: 300, ...(glow ? { glow: 'bg/stars-near' } : {}) }),
            ],
          },
        },
      ],
      { extraSprites: ENGINE_SPRITES },
    );
    expect(issues).toEqual([]);
    return db;
  }

  /**
   * Index of a batch in the view's list (-1 when absent).
   *
   * @param batches - The view's batches.
   * @param batch - The batch.
   * @returns The index.
   */
  function indexOf(
    batches: readonly { readonly blend?: string }[],
    batch: { readonly blend?: string } | null,
  ): number {
    for (let i = 0; i < batches.length; i++) if (batches[i] === batch) return i;
    return -1;
  }

  it('pushes each glow batch right after its owner batch', () => {
    const world = createWorld(resolveGameConfig({ seed: 11, stage: 's' }), wireDb(true));
    const decor = world.decor;
    if (decor === null) throw new Error('expected the decor view');
    const batches = world.view.batches;
    const backAt = indexOf(batches, decor.back);
    expect(backAt).toBeGreaterThanOrEqual(0);
    expect(batches[backAt + 1]).toBe(decor.glowBack);
    const frontAt = indexOf(batches, decor.front);
    expect(batches[frontAt + 1]).toBe(decor.glowFront);
    stepWorld(world, createInputSnapshot());
    expect(decor.glowBack?.count).toBe(1);
    expect(decor.glowFront?.count).toBe(1);
  });

  it('adds no glow batch for a stage whose items name no glow', () => {
    const world = createWorld(resolveGameConfig({ seed: 11, stage: 's' }), wireDb(false));
    expect(world.decor?.glowBack).toBeNull();
    expect(world.decor?.glowFront).toBeNull();
    for (const batch of world.view.batches) expect(batch.blend).toBeUndefined();
    // The owners still draw (the decor batches themselves are unchanged).
    expect(world.decor?.back?.capacity).toBe(2);
    expect(world.decor?.front?.capacity).toBe(2);
  });
});

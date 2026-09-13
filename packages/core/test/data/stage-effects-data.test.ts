/**
 * The M2-08 stage content of `core/data`: the presentation-only `raster` effects and palette
 * `cycles` of a stage — defaults, colours resolved to numbers — every validation issue they can
 * raise, the effects view the stage module builds from them (`createStageEffectsView`), and the
 * World handing it (with the ships' hurtboxes) to the renderer through its view.
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import {
  DEFAULT_RASTER_PERIOD,
  MAX_CYCLE_COLORS_PER_LAYER,
  MAX_RASTER_BANDS,
  MAX_STAGE_COLOR_CYCLES,
  MAX_STAGE_RASTER_EFFECTS,
  STAGE_CYCLE_LAYERS,
  STAGE_RASTER_KINDS,
  STAGE_RASTER_LAYERS,
  loadContent,
  type ContentFile,
  type ValidationIssue,
} from '../../src/data/index.js';
import { LayerId, RasterKind } from '../../src/presentation/index.js';
import { createStageEffectsView } from '../../src/stage/index.js';
import { createWorld, stepWorld } from '../../src/world/index.js';
import { createInputSnapshot } from '../../src/input/index.js';

/**
 * An open-space stage file.
 *
 * @param body - Stage fields to add or replace.
 * @returns The file.
 */
function stageFile(body: Record<string, unknown>): ContentFile {
  return {
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
  };
}

/**
 * The issues of a stage body.
 *
 * @param body - Stage fields.
 * @returns The issues (paths without the file name).
 */
function issuesOf(body: Record<string, unknown>): string[] {
  return loadContent([stageFile(body)]).issues.map(
    (issue: ValidationIssue) =>
      `${issue.path.replace('stages/s.stage.json:', '')}: ${issue.message}`,
  );
}

const WAVE = { layer: 'mid', kind: 'wave', top: 100, bottom: 150, amplitude: 3, wavelength: 20 };
const LINES = {
  layer: 'mid',
  kind: 'lines',
  top: 150,
  bottom: 200,
  factorTop: 0.25,
  factorBottom: 1.5,
  bands: [10, 15, 25],
  wrap: 64,
};
const SEA = { layer: 'mid', colors: ['#183c78', '#24569c', '#3474bc', '#5096d8'], ticks: 8 };

describe('core/data stage raster effects and palette cycles (M2-08)', () => {
  it('names its layers, kinds and limits', () => {
    expect(STAGE_RASTER_LAYERS).toEqual(['far', 'mid', 'terrain']);
    expect(STAGE_RASTER_KINDS).toEqual(['wave', 'haze', 'lines']);
    expect(STAGE_CYCLE_LAYERS).toEqual(['far', 'mid', 'terrain', 'ground', 'air']);
    expect([MAX_STAGE_RASTER_EFFECTS, MAX_STAGE_COLOR_CYCLES, MAX_CYCLE_COLORS_PER_LAYER]).toEqual([
      8, 8, 8,
    ]);
    expect([MAX_RASTER_BANDS, DEFAULT_RASTER_PERIOD]).toEqual([64, 120]);
  });

  it('loads them with their defaults, the colours resolved', () => {
    const { db, issues } = loadContent([
      stageFile({ raster: [WAVE, LINES], cycles: [{ ...SEA, from: 100, to: 900 }] }),
    ]);
    expect(issues).toEqual([]);
    const stage = db.stages[0];
    expect(stage.raster[0]).toEqual({
      ...WAVE,
      period: DEFAULT_RASTER_PERIOD,
      factorTop: 0,
      factorBottom: 0,
      bands: [],
      wrap: 0,
      from: 0,
      to: Number.POSITIVE_INFINITY,
    });
    expect(stage.raster[1]).toMatchObject({ ...LINES, amplitude: 0, wavelength: 32 });
    expect(stage.cycles[0]).toEqual({
      ...SEA,
      rgb: [0x183c78, 0x24569c, 0x3474bc, 0x5096d8],
      from: 100,
      to: 900,
    });
  });

  it('gives a stage without them empty lists', () => {
    const { db, issues } = loadContent([stageFile({})]);
    expect(issues).toEqual([]);
    expect([db.stages[0].raster, db.stages[0].cycles]).toEqual([[], []]);
  });

  it('reports bad ranges and missing kind fields', () => {
    expect(issuesOf({ raster: [{ ...WAVE, bottom: 100 }] })).toEqual([
      'raster[0].bottom: must be greater than top',
    ]);
    expect(issuesOf({ raster: [{ ...WAVE, from: 500, to: 500 }] })).toEqual([
      'raster[0].to: must be greater than from',
    ]);
    expect(issuesOf({ raster: [{ layer: 'far', kind: 'haze', top: 0, bottom: 10 }] })).toEqual([
      'raster[0]: a haze effect needs amplitude and wavelength',
    ]);
    expect(
      issuesOf({ raster: [{ layer: 'far', kind: 'lines', top: 0, bottom: 10, factorTop: 1 }] }),
    ).toEqual(['raster[0]: a lines effect needs factorTop and factorBottom']);
    expect(issuesOf({ raster: [{ ...LINES, bands: [10, 10] }] })).toEqual([
      'raster[0].bands: must add up to bottom - top (20 rows listed)',
    ]);
    expect(issuesOf({ raster: [{ ...WAVE, bands: [50] }] })).toEqual([
      'raster[0].bands: only a lines effect has bands',
    ]);
  });

  it('refuses what the schema does not allow', () => {
    const problems = issuesOf({
      raster: [
        { ...WAVE, layer: 'air' },
        { ...WAVE, kind: 'ripple' },
        { ...WAVE, amplitude: 33 },
        { ...WAVE, bottom: 201 },
      ],
      cycles: [
        { ...SEA, layer: 'hud' },
        { ...SEA, colors: ['#123'] },
        { ...SEA, colors: ['#123456'] },
        { ...SEA, ticks: 0 },
      ],
    });
    expect(problems.length).toBeGreaterThanOrEqual(8);
    for (const prefix of ['raster[0]', 'raster[1]', 'raster[2]', 'raster[3]']) {
      expect(problems.some((p) => p.startsWith(prefix))).toBe(true);
    }
    for (const prefix of ['cycles[0]', 'cycles[1]', 'cycles[2]', 'cycles[3]']) {
      expect(problems.some((p) => p.startsWith(prefix))).toBe(true);
    }
    expect(issuesOf({ raster: new Array(9).fill(WAVE) }).length).toBeGreaterThan(0);
  });

  it('keeps every layer at 8 distinct cycled colours', () => {
    expect(issuesOf({ cycles: [SEA, { ...SEA, colors: ['#000001', '#183c78'] }] })).toEqual([
      'cycles[1].colors[1]: colour #183c78 is already cycled on layer "mid"',
    ]);
    expect(issuesOf({ cycles: [{ ...SEA, colors: ['#010101', '#010101'] }] })).toEqual([
      'cycles[0].colors[1]: colour #010101 is already cycled on layer "mid"',
    ]);
    const nine = ['#000001', '#000002', '#000003', '#000004', '#000005'];
    expect(issuesOf({ cycles: [SEA, { ...SEA, colors: nine }] })).toEqual([
      'cycles[1].colors: layer "mid" cycles more than 8 colours (all its cycles together)',
    ]);
    // Other layers have their own eight.
    expect(issuesOf({ cycles: [SEA, { ...SEA, layer: 'air', colors: nine }] })).toEqual([]);
    expect(issuesOf({ cycles: [{ ...SEA, from: 10, to: 5 }] })).toEqual([
      'cycles[0].to: must be greater than from',
    ]);
  });
});

describe('core/stage createStageEffectsView (M2-08)', () => {
  it('turns the layer names and kinds into codes, frozen', () => {
    const { db } = loadContent([
      stageFile({
        raster: [
          WAVE,
          LINES,
          { layer: 'far', kind: 'haze', top: 0, bottom: 50, amplitude: 1, wavelength: 6 },
        ],
        cycles: [SEA, { ...SEA, layer: 'ground', colors: ['#ff0000', '#00ff00'] }],
      }),
    ]);
    const view = createStageEffectsView(db.stages[0]);
    if (view === null) throw new Error('no view');
    expect(view.raster.map((r) => [r.layer, r.kind])).toEqual([
      [LayerId.BgMid, RasterKind.Wave],
      [LayerId.BgMid, RasterKind.Lines],
      [LayerId.BgFar, RasterKind.Haze],
    ]);
    expect(view.raster[1].bands).toEqual([10, 15, 25]);
    expect(view.cycles.map((c) => [c.layer, c.colors])).toEqual([
      [LayerId.BgMid, [0x183c78, 0x24569c, 0x3474bc, 0x5096d8]],
      [LayerId.GroundEnemies, [0xff0000, 0x00ff00]],
    ]);
    expect(Object.isFrozen(view) && Object.isFrozen(view.raster[0])).toBe(true);
    expect(createStageEffectsView(loadContent([stageFile({})]).db.stages[0])).toBeNull();
    const terrain = loadContent([stageFile({ cycles: [{ ...SEA, layer: 'terrain' }] })]).db;
    expect(createStageEffectsView(terrain.stages[0])?.cycles[0].layer).toBe(LayerId.Terrain);
  });
});

describe('core/world view: stage effects and hitboxes (M2-08)', () => {
  it("hands the stage's effects to the renderer and mirrors the live ships' hurtboxes", () => {
    const { db, issues } = loadContent([stageFile({ raster: [WAVE], cycles: [SEA] })]);
    expect(issues).toEqual([]);
    const world = createWorld(resolveGameConfig({ stage: 's' }), db);
    expect(world.view.effects?.raster[0].kind).toBe(RasterKind.Wave);
    const hitboxes = world.view.hitboxes;
    if (hitboxes === null || hitboxes === undefined) throw new Error('no hitboxes');
    expect(hitboxes).toBe(world.hitboxBatch);
    expect(hitboxes.count).toBe(1);
    const ship = world.players[0];
    expect([hitboxes.x[0], hitboxes.y[0], hitboxes.radius[0]]).toEqual([
      ship.x,
      ship.y,
      world.ship.hurtRadius * ship.shield.hurtScale,
    ]);
    const input = createInputSnapshot();
    for (let i = 0; i < 10; i++) stepWorld(world, input);
    expect([hitboxes.x[0], hitboxes.y[0]]).toEqual([ship.x, ship.y]);
    // A dead ship has no hurtbox.
    ship.state = 'dead';
    stepWorld(world, input);
    expect(hitboxes.count).toBe(0);
  });

  it('gives open space no effects view', () => {
    const world = createWorld(resolveGameConfig({}), loadContent([]).db);
    expect(world.view.effects).toBeNull();
    expect(world.view.hitboxes?.capacity).toBe(2);
  });
});

/**
 * Edge cases of the M2-08 stage presentation data (next to `stage-effects-data.test.ts`):
 *
 * - `core/data`: every schema limit of a raster effect and a palette cycle (both ends), the
 *   `from < to` rule with `from` left at its default (regression: `to: 0` alone was accepted — an
 *   effect never on), colours only one step apart on a layer (regression: accepted although the
 *   layer shader matches pixel colours within 1.5 / 255, i.e. confuses them), case-insensitive
 *   duplicates, several issues at once;
 * - `core/stage` `createStageEffectsView`: copies (the stage's arrays are not shared), only one of
 *   the two lists, the file's order;
 * - `core/world`: the hitbox mirror in co-op (both ships, packed when player 1 is down, player 2's
 *   Reduce radius), `dying` ships left out, the view's capacity; and the effects and hitboxes are
 *   presentation only — a stage with them and the same stage without run to the same state hash.
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import {
  MAX_CYCLE_COLORS_PER_LAYER,
  MAX_RASTER_BANDS,
  MAX_STAGE_COLOR_CYCLES,
  loadContent,
  type ContentFile,
  type ValidationIssue,
} from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { createInputSnapshot, commitPlayerInput, Action } from '../../src/input/index.js';
import { LayerId, RasterKind, createHitboxBatch } from '../../src/presentation/index.js';
import { createStageEffectsView } from '../../src/stage/index.js';
import { createWorld, joinPlayer, stepWorld, type World } from '../../src/world/index.js';

/**
 * An open-space stage file.
 *
 * @param body - Stage fields to add or replace.
 * @param id - Stage id (default `s`).
 * @returns The file.
 */
function stageFile(body: Record<string, unknown>, id = 's'): ContentFile {
  return {
    path: `stages/${id}.stage.json`,
    data: {
      formatVersion: 1,
      kind: 'stage',
      id,
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
  layer: 'terrain',
  kind: 'lines',
  top: 0,
  bottom: 10,
  factorTop: 0,
  factorBottom: 1,
};
const SEA = { layer: 'mid', colors: ['#183c78', '#24569c', '#3474bc', '#5096d8'], ticks: 8 };

describe('core/data stage raster effects: limits (edges)', () => {
  it('accepts every field at both ends of its range', () => {
    expect(
      issuesOf({
        raster: [
          { ...WAVE, top: 0, bottom: 1, amplitude: 0, wavelength: 2, period: 0 },
          { ...WAVE, top: 199, bottom: 200, amplitude: 32, wavelength: 1024, period: 36000 },
          { ...LINES, factorTop: -4, factorBottom: 4, wrap: 0 },
          { ...LINES, factorTop: 4, factorBottom: -4, wrap: 1024, from: 0, to: 1000000 },
          { ...LINES, top: 0, bottom: 64, bands: new Array(MAX_RASTER_BANDS).fill(1) },
          { ...LINES, top: 0, bottom: 200, bands: [200] },
          { ...WAVE, wrap: 64 },
          { layer: 'far', kind: 'haze', top: 5, bottom: 6, amplitude: 1, wavelength: 2 },
        ],
      }),
    ).toEqual([]);
  });

  it('refuses every field just past its range', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...WAVE, top: -1 }, 'raster[0].top'],
      [{ ...WAVE, top: 200, bottom: 200 }, 'raster[0].top'],
      [{ ...WAVE, bottom: 0, top: 0 }, 'raster[0].bottom'],
      [{ ...WAVE, top: 10.5 }, 'raster[0].top'],
      [{ ...WAVE, amplitude: -0.1 }, 'raster[0].amplitude'],
      [{ ...WAVE, wavelength: 1.9 }, 'raster[0].wavelength'],
      [{ ...WAVE, wavelength: 1025 }, 'raster[0].wavelength'],
      [{ ...WAVE, period: -1 }, 'raster[0].period'],
      [{ ...WAVE, period: 36001 }, 'raster[0].period'],
      [{ ...WAVE, period: 1.5 }, 'raster[0].period'],
      [{ ...LINES, factorTop: -4.01 }, 'raster[0].factorTop'],
      [{ ...LINES, factorBottom: 4.01 }, 'raster[0].factorBottom'],
      [{ ...LINES, wrap: 1025 }, 'raster[0].wrap'],
      [{ ...LINES, wrap: -1 }, 'raster[0].wrap'],
      [{ ...LINES, bands: [] }, 'raster[0].bands'],
      [{ ...LINES, bands: [0, 10] }, 'raster[0].bands'],
      [{ ...LINES, top: 0, bottom: 65, bands: new Array(65).fill(1) }, 'raster[0].bands'],
      [{ ...WAVE, from: -1 }, 'raster[0].from'],
      [{ ...WAVE, extra: 1 }, 'raster[0]'],
      [{ ...WAVE, layer: 'ground' }, 'raster[0].layer'],
    ];
    for (const [effect, path] of cases) {
      const problems = issuesOf({ raster: [effect] });
      expect(problems.length, JSON.stringify(effect)).toBeGreaterThan(0);
      expect(
        problems.some((p) => p.startsWith(path)),
        `${JSON.stringify(effect)} → ${problems.join('; ')}`,
      ).toBe(true);
    }
  });

  it('checks `to` against the default `from` of 0 too', () => {
    expect(issuesOf({ raster: [{ ...WAVE, to: 0 }] })).toEqual([
      'raster[0].to: must be greater than from',
    ]);
    expect(issuesOf({ cycles: [{ ...SEA, to: 0 }] })).toEqual([
      'cycles[0].to: must be greater than from',
    ]);
    // `from` alone, or both in order, are fine.
    expect(issuesOf({ raster: [{ ...WAVE, from: 500 }], cycles: [{ ...SEA, to: 1 }] })).toEqual([]);
  });

  it('reports several problems of one effect, and of several effects, at once', () => {
    expect(
      issuesOf({
        raster: [
          { ...LINES, top: 20, bottom: 10, bands: [5], from: 9, to: 3 },
          { layer: 'mid', kind: 'wave', top: 0, bottom: 5, amplitude: 1 },
        ],
      }),
    ).toEqual([
      'raster[0].bottom: must be greater than top',
      'raster[0].to: must be greater than from',
      'raster[0].bands: must add up to bottom - top (5 rows listed)',
      'raster[1]: a wave effect needs amplitude and wavelength',
    ]);
  });
});

describe('core/data stage palette cycles: limits and colours (edges)', () => {
  it('accepts 8 colours in one cycle, 8 cycles, ticks 1 … 600 and upper-case hex', () => {
    const eight = [
      '#000000',
      '#020202',
      '#040404',
      '#060606',
      '#080808',
      '#0a0a0a',
      '#0c0c0c',
      '#0e0e0e',
    ];
    expect(issuesOf({ cycles: [{ ...SEA, colors: eight, ticks: 1 }] })).toEqual([]);
    const layers = ['far', 'mid', 'terrain', 'ground', 'air', 'far', 'mid', 'terrain'];
    const cycles = layers.map((layer, i) => ({
      layer,
      colors: [`#1${i}0000`, `#0000${i}F`],
      ticks: 600,
    }));
    expect(cycles).toHaveLength(MAX_STAGE_COLOR_CYCLES);
    const { db, issues } = loadContent([stageFile({ cycles })]);
    expect(issues).toEqual([]);
    expect(db.stages[0].cycles[0].rgb).toEqual([0x100000, 0x00000f]);
  });

  it('refuses a ninth cycle, a ninth colour, ticks 0 / 601 and malformed colours', () => {
    const nine = [
      '#000000',
      '#020202',
      '#040404',
      '#060606',
      '#080808',
      '#0a0a0a',
      '#0c0c0c',
      '#0e0e0e',
      '#101010',
    ];
    expect(issuesOf({ cycles: [{ ...SEA, colors: nine }] }).length).toBeGreaterThan(0);
    const layers = ['far', 'mid', 'terrain', 'ground', 'air'];
    const many = new Array(MAX_STAGE_COLOR_CYCLES + 1).fill(0).map((_v, i) => ({
      layer: layers[i % layers.length],
      colors: [`#${i}10000`, `#0000${i}9`],
      ticks: 8,
    }));
    // Eight of them are fine: the ninth is the problem.
    expect(issuesOf({ cycles: many.slice(0, MAX_STAGE_COLOR_CYCLES) })).toEqual([]);
    expect(issuesOf({ cycles: many }).length).toBeGreaterThan(0);
    for (const bad of [
      { ...SEA, ticks: 0 },
      { ...SEA, ticks: 601 },
      { ...SEA, ticks: 2.5 },
      { ...SEA, colors: ['183c78', '#24569c'] },
      { ...SEA, colors: ['#183c7', '#24569c'] },
      { ...SEA, colors: ['#183c78a', '#24569c'] },
      { ...SEA, colors: ['#18gc78', '#24569c'] },
      { ...SEA, layer: 'player' },
    ]) {
      expect(issuesOf({ cycles: [bad] }).length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
    expect(MAX_CYCLE_COLORS_PER_LAYER).toBe(8);
  });

  it('finds a colour repeated in another case', () => {
    expect(issuesOf({ cycles: [{ ...SEA, colors: ['#ABCDEF', '#abcdef'] }] })).toEqual([
      'cycles[0].colors[1]: colour #abcdef is already cycled on layer "mid"',
    ]);
  });

  it('refuses colours the layer shader cannot tell apart (at most 1 apart per channel)', () => {
    expect(issuesOf({ cycles: [{ ...SEA, colors: ['#101010', '#111010'] }] })).toEqual([
      'cycles[0].colors[1]: colour #111010 is too close to #101010, cycled on layer "mid" (the layer shader matches colours within 1 per channel)',
    ]);
    // Across two cycles of one layer, too.
    expect(issuesOf({ cycles: [SEA, { ...SEA, colors: ['#193d79', '#ff0000'] }] })).toEqual([
      'cycles[1].colors[0]: colour #193d79 is too close to #183c78, cycled on layer "mid" (the layer shader matches colours within 1 per channel)',
    ]);
    // Two apart in one channel is enough; other layers do not count.
    expect(issuesOf({ cycles: [{ ...SEA, colors: ['#101010', '#121111'] }] })).toEqual([]);
    expect(
      issuesOf({ cycles: [SEA, { ...SEA, layer: 'far', colors: ['#193d79', '#000000'] }] }),
    ).toEqual([]);
  });
});

describe('core/stage createStageEffectsView (edges)', () => {
  it('copies the lists, keeps the file order and builds one list without the other', () => {
    const { db, issues } = loadContent([
      stageFile({
        raster: [
          { ...LINES, bands: [4, 6] },
          { layer: 'far', kind: 'haze', top: 0, bottom: 50, amplitude: 1, wavelength: 6 },
        ],
      }),
      stageFile(
        {
          cycles: [
            { ...SEA, layer: 'air' },
            { ...SEA, layer: 'far' },
          ],
        },
        'c',
      ),
    ]);
    expect(issues).toEqual([]);
    const rasterOnly = db.stages.find((s) => s.id === 's');
    const cyclesOnly = db.stages.find((s) => s.id === 'c');
    if (rasterOnly === undefined || cyclesOnly === undefined) throw new Error('stages missing');
    const view = createStageEffectsView(rasterOnly);
    if (view === null) throw new Error('no view');
    expect(view.cycles).toEqual([]);
    expect(view.raster.map((r) => [r.layer, r.kind])).toEqual([
      [LayerId.Terrain, RasterKind.Lines],
      [LayerId.BgFar, RasterKind.Haze],
    ]);
    // A copy: the stage's bands array is not the view's.
    expect(view.raster[0].bands).toEqual([4, 6]);
    expect(view.raster[0].bands).not.toBe(rasterOnly.raster[0].bands);
    expect(Object.isFrozen(view.raster[0].bands)).toBe(true);
    expect(view.raster[1].to).toBe(Number.POSITIVE_INFINITY);
    const cycles = createStageEffectsView(cyclesOnly);
    expect(cycles?.raster).toEqual([]);
    expect(cycles?.cycles.map((c) => c.layer)).toEqual([LayerId.AirEnemies, LayerId.BgFar]);
    expect(cycles?.cycles[0].colors).not.toBe(cyclesOnly.cycles[0].rgb);
    expect(Object.isFrozen(cycles?.cycles[0].colors)).toBe(true);
  });
});

describe('core/presentation createHitboxBatch', () => {
  it('refuses a capacity that is not a positive integer and starts empty', () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => createHitboxBatch(bad)).toThrow(RangeError);
    }
    const batch = createHitboxBatch(3);
    expect([batch.capacity, batch.count, batch.x.length, batch.radius.length]).toEqual([
      3, 0, 3, 3,
    ]);
  });
});

/**
 * Steps a world with no input.
 *
 * @param world - The world.
 * @param ticks - Ticks.
 */
function run(world: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) stepWorld(world, input);
}

describe('core/world hitbox mirror (edges)', () => {
  const content = loadContent([stageFile({ cycles: [SEA] })]).db;

  it('mirrors both ships in co-op, packed when player 1 is down', () => {
    const world = createWorld(resolveGameConfig({ stage: 's', coop: true }), content);
    run(world, 45);
    const hitboxes = world.hitboxBatch;
    expect(hitboxes.count).toBe(1);
    expect(joinPlayer(world, 1)).toBe(true);
    run(world, 60);
    const [p1, p2] = world.players;
    expect(p2.state).toBe('alive');
    expect(hitboxes.count).toBe(2);
    expect([hitboxes.x[1], hitboxes.y[1]]).toEqual([p2.x, p2.y]);
    // Player 2's Reduce shield shrinks only its own marker.
    p2.shield.hurtScale = 0.5;
    run(world, 1);
    const hurt = world.ship.hurtRadius;
    expect([hitboxes.radius[0], hitboxes.radius[1]]).toEqual([
      hurt * p1.shield.hurtScale,
      hurt * 0.5,
    ]);
    // Player 1 dying: player 2's marker moves into slot 0.
    p1.state = 'dying';
    run(world, 1);
    expect(hitboxes.count).toBe(1);
    expect([hitboxes.x[0], hitboxes.y[0]]).toEqual([p2.x, p2.y]);
  });

  it('keeps the effects and the hitboxes out of the simulation', () => {
    const plain = loadContent([stageFile({})]).db;
    const dressed = loadContent([
      stageFile({
        raster: [WAVE, { ...LINES, layer: 'mid', top: 150, bottom: 200, wrap: 64 }],
        cycles: [SEA, { ...SEA, layer: 'air', colors: ['#ff0000', '#00ff00'] }],
      }),
    ]).db;
    const a = createWorld(resolveGameConfig({ stage: 's', seed: 7 }), plain);
    const b = createWorld(resolveGameConfig({ stage: 's', seed: 7 }), dressed);
    expect(a.view.effects).toBeNull();
    expect(b.view.effects?.raster).toHaveLength(2);
    const input = createInputSnapshot();
    for (let tick = 0; tick < 600; tick++) {
      // A weave with the fire button, the same for both worlds.
      const mask = ((tick / 30) | 0) % 2 === 0 ? Action.Up | Action.Shot : Action.Down;
      commitPlayerInput(input.players[0], mask);
      stepWorld(a, input);
      stepWorld(b, input);
      if (tick % 100 === 0) expect(hashWorld(b)).toBe(hashWorld(a));
    }
    expect(hashWorld(b)).toBe(hashWorld(a));
    // Scribbling over the hitbox mirror changes nothing either.
    b.hitboxBatch.x[0] = -999;
    b.hitboxBatch.radius[0] = 99;
    expect(hashWorld(b)).toBe(hashWorld(a));
  });
});

/**
 * The R3-06 stage art features in `loadContent` (plan_resolution.md §R3-06): the `decor` list —
 * sprite items resolving to a `spriteId`, tile items drawing with -1, the exclusive choice of
 * `sprite` / `tile`, the bounds, the cap, and the field staying absent when the file names none —
 * and the extended parallax bands: the `fore` layer, the optional `yFactor` and the animation
 * fields `frames` / `frameTicks` (with the band counts the loader checks).
 */
import { describe, expect, it } from 'vitest';
import { PLAYFIELD_H } from '../../src/config/index.js';
import { loadContent, type LoadContentResult } from '../../src/data/index.js';

/**
 * Loads one stage file.
 *
 * @param body - Fields over a minimal valid stage (length 1000).
 * @returns The load result.
 */
function load(body: Record<string, unknown>): LoadContentResult {
  return loadContent([
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
  ]);
}

/**
 * The issues of a load as `path message` strings (file prefix stripped).
 *
 * @param result - The load result.
 * @returns The issues.
 */
const issuesOf = (result: LoadContentResult): string[] =>
  result.issues.map((i) => i.path.replace('stages/s.stage.json:', '') + ' ' + i.message);

/** A sprite decor item at the given overrides. */
const spriteItem = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  layer: 'back',
  sprite: 'bg/stars-far',
  frame: 0,
  x: 100,
  y: 50,
  ...over,
});

/** A tile decor item at the given overrides. */
const tileItem = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  layer: 'front',
  tile: 'moss',
  frame: 0,
  x: 10,
  y: 20,
  ...over,
});

describe('core/data stage decor — the resolved list', () => {
  it('leaves the decor field absent when the file names none', () => {
    const result = load({});
    expect(result.issues).toEqual([]);
    const stage = result.db.stages[0];
    expect(stage).toBeDefined();
    expect('decor' in (stage as object)).toBe(false);
  });

  it('resolves a sprite item and keeps its numbers', () => {
    const result = load({ decor: [spriteItem({ frame: 2, x: 999.5, y: -64 })] });
    expect(result.issues).toEqual([]);
    const entry = result.db.stages[0]?.decor?.[0];
    expect(entry).toBeDefined();
    expect(entry?.layer).toBe('back');
    expect(entry?.sprite).toBe('bg/stars-far');
    expect(entry?.spriteId).toBeGreaterThanOrEqual(0);
    expect(result.db.sprites.names[entry?.spriteId ?? -1]).toBe('bg/stars-far');
    expect(entry?.tile).toBeUndefined();
    expect([entry?.frame, entry?.x, entry?.y]).toEqual([2, 999.5, -64]);
  });

  it('draws a tile item with spriteId -1', () => {
    const result = load({ decor: [tileItem({ frame: 3, y: PLAYFIELD_H + 120 })] });
    expect(result.issues).toEqual([]);
    const entry = result.db.stages[0]?.decor?.[0];
    expect(entry?.tile).toBe('moss');
    expect(entry?.spriteId).toBe(-1);
    expect(entry?.sprite).toBeUndefined();
    expect(entry?.y).toBe(PLAYFIELD_H + 120);
  });

  it('reports a decor x past the stage length and allows one at it', () => {
    expect(issuesOf(load({ decor: [spriteItem({ x: 1001 })] }))).toEqual([
      'decor[0].x must be <= length',
    ]);
    expect(load({ decor: [spriteItem({ x: 1000 })] }).issues).toEqual([]);
  });

  it('requires exactly one of sprite or tile, one issue per entry', () => {
    const result = load({
      decor: [spriteItem({ tile: 'moss' }), { layer: 'back', frame: 0, x: 100, y: 50 }],
    });
    expect(issuesOf(result)).toEqual([
      'decor[0] needs exactly one of sprite or tile',
      'decor[1] needs exactly one of sprite or tile',
    ]);
    expect(result.db.stages).toHaveLength(0);
  });

  it('checks the layer enum and the value bounds at the schema', () => {
    expect(
      issuesOf(
        load({
          decor: [tileItem({ layer: 'under', frame: 1024, y: PLAYFIELD_H + 121 })],
        }),
      ),
    ).toEqual([
      'decor[0].layer must be one of: back, front',
      'decor[0].frame must be an integer in 0..1023',
      'decor[0].y must be a finite number in -64..' + String(PLAYFIELD_H + 120),
    ]);
  });

  it('caps the list at 256 items', () => {
    expect(load({ decor: new Array(256).fill(tileItem()) }).issues).toEqual([]);
    expect(issuesOf(load({ decor: new Array(257).fill(tileItem()) }))).toEqual([
      'decor must have at most 256 items',
    ]);
  });

  it('interns decor sprite names like the band ones', () => {
    const result = load({
      parallax: [{ layer: 'fore', sprite: 'bg/stars-near', factor: 1.5, y: 240, spacing: 256 }],
      decor: [spriteItem({ sprite: 'bg/stars-near' })],
    });
    expect(result.issues).toEqual([]);
    const band = result.db.stages[0]?.parallax[0];
    const entry = result.db.stages[0]?.decor?.[0];
    expect(band?.layer).toBe('fore');
    expect(entry?.spriteId).toBe(band?.spriteId);
  });
});

describe('core/data stage decor — the extended bands', () => {
  const band = { layer: 'far', sprite: 'bg/stars-far', factor: 0.5, y: 0, spacing: 128 };

  it('keeps an untouched band without the new keys', () => {
    const result = load({ parallax: [band] });
    expect(result.issues).toEqual([]);
    const entry = result.db.stages[0]?.parallax[0];
    expect('yFactor' in (entry as object)).toBe(false);
    expect('frames' in (entry as object)).toBe(false);
    expect('frameTicks' in (entry as object)).toBe(false);
  });

  it('resolves the optional band fields as given', () => {
    const result = load({ parallax: [{ ...band, yFactor: -0.5, frames: 4, frameTicks: 12 }] });
    expect(result.issues).toEqual([]);
    const entry = result.db.stages[0]?.parallax[0];
    expect([entry?.yFactor, entry?.frames, entry?.frameTicks]).toEqual([-0.5, 4, 12]);
  });

  it('requires frames before frameTicks on a band', () => {
    expect(issuesOf(load({ parallax: [{ ...band, frameTicks: 8 }] }))).toEqual([
      'parallax[0].frameTicks needs frames',
    ]);
    expect(
      load({ parallax: [{ ...band, yFactor: 0.5, frames: 2, frameTicks: 8 }] }).issues,
    ).toEqual([]);
  });

  it('checks the optional band fields at the schema', () => {
    expect(issuesOf(load({ parallax: [{ ...band, yFactor: 5 }] }))).toEqual([
      'parallax[0].yFactor must be a finite number in -4..4',
    ]);
    expect(issuesOf(load({ parallax: [{ ...band, frames: 65 }] }))).toEqual([
      'parallax[0].frames must be an integer in 1..64',
    ]);
    expect(issuesOf(load({ parallax: [{ ...band, frameTicks: 0 }] }))).toEqual([
      'parallax[0].frameTicks must be an integer in 1..3600',
    ]);
    expect(issuesOf(load({ parallax: [{ ...band, frames: 'two' }] }))).toEqual([
      'parallax[0].frames must be an integer in 1..64',
    ]);
  });
});

/**
 * Edge cases of the M1 stage format (plan M1-07) in `loadContent`: every order / range problem
 * of one file reported in one load, the limits (empty camera path, 8 parallax bands, `rowsTall`
 * 1 … 255, generator type and segment count, unknown music cues), values exactly at the stage
 * `length` (allowed), a minimal one-pixel stage, fractional event x, ties kept in file order,
 * and the flag numbering (sorted names, repeated names sharing a bit, `value` defaulting to set).
 */
import { describe, expect, it } from 'vitest';
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

describe('core/data stage edge — order and range checks', () => {
  it('reports every order and range problem of one file in one load, and drops the stage', () => {
    const result = load({
      camera: [
        { x: 5, speed: 1 },
        { x: 3, speed: 1, yTicks: 4 },
      ],
      checkpoints: [{ x: 10 }, { x: 5 }, { x: 2000 }],
      events: [
        { x: 9, type: 'end' },
        { x: 8, type: 'end' },
        { x: 1200, type: 'end' },
      ],
    });
    expect(issuesOf(result)).toEqual([
      'camera[0].x must be 0 (the camera path starts at the stage start)',
      'camera[1].x must be greater than camera[0].x (keys are sorted by x)',
      'camera[1].yTicks needs yTo',
      'checkpoints[1].x must be greater than checkpoints[0].x (checkpoints are sorted by x)',
      'checkpoints[2].x must be <= length',
      'events[1].x must be >= events[0].x (events are sorted by x)',
      'events[2].x must be <= length',
    ]);
    expect(result.db.stages).toEqual([]);
    expect(result.db.stageIndex.has('s')).toBe(false);
  });

  it('rejects a camera key past the length and an empty camera path', () => {
    expect(
      issuesOf(
        load({
          camera: [
            { x: 0, speed: 1 },
            { x: 1001, speed: 1 },
          ],
        }),
      ),
    ).toEqual(['camera[1].x must be <= length']);
    expect(issuesOf(load({ camera: [] }))).toEqual(['camera must have at least 1 items']);
  });

  it('allows keys, checkpoints and events exactly at the length, and a one-pixel stage', () => {
    expect(
      load({
        camera: [
          { x: 0, speed: 1 },
          { x: 1000, speed: 0, lock: true },
        ],
        checkpoints: [{ x: 1000 }],
        events: [{ x: 1000, type: 'end' }],
      }).issues,
    ).toEqual([]);
    const tiny = load({
      length: 1,
      camera: [{ x: 0, speed: 0 }],
      checkpoints: [{ x: 1 }],
      events: [{ x: 1, type: 'end' }],
    });
    expect(tiny.issues).toEqual([]);
    expect(tiny.db.stages[0].length).toBe(1);
  });

  it('keeps fractional x and ties in file order', () => {
    const result = load({
      events: [
        { x: 0.5, type: 'music', cue: 'Boss' },
        { x: 10.25, type: 'end' },
        { x: 10.25, type: 'music', cue: 'Stage' },
        { x: 10.25, type: 'speed', speed: 2 },
      ],
    });
    expect(result.issues).toEqual([]);
    expect(result.db.stages[0].events.map((e) => [e.x, e.type])).toEqual([
      [0.5, 'music'],
      [10.25, 'end'],
      [10.25, 'music'],
      [10.25, 'speed'],
    ]);
  });
});

describe('core/data stage edge — schema limits', () => {
  const band = { layer: 'far', sprite: 'bg/stars-far', factor: 0.5, y: 0, spacing: 128 };

  it('allows 8 parallax bands, not 9', () => {
    expect(load({ parallax: new Array(8).fill(band) }).issues).toEqual([]);
    expect(issuesOf(load({ parallax: new Array(9).fill(band) }))).toEqual([
      'parallax must have at most 8 items',
    ]);
  });

  it('checks rowsTall, the generator type and the segment count', () => {
    expect(issuesOf(load({ tilemap: { tileSize: 8, tileset: 't', rowsTall: 0 } }))).toEqual([
      'tilemap.rowsTall must be an integer in 1..255',
      'tilemap.tileset unknown tileset id "t"',
    ]);
    expect(
      issuesOf(
        load({
          tilemap: {
            tileSize: 8,
            tileset: 't',
            rowsTall: 256,
            generator: { type: 'noise', segments: [] },
          },
        }),
      ),
    ).toEqual([
      'tilemap.rowsTall must be an integer in 1..255',
      'tilemap.generator.type must be one of: heightfield',
      'tilemap.generator.segments must have at least 1 items',
      'tilemap.tileset unknown tileset id "t"',
    ]);
  });

  it('reports an unknown music cue of the stage', () => {
    expect(issuesOf(load({ music: { stage: 'Nope', boss: 'Boss' } }))).toEqual([
      'music.stage unknown music id "Nope"',
    ]);
  });
});

describe('core/data stage edge — flags', () => {
  it('numbers flags by sorted name, shares a bit per name, and defaults value to set', () => {
    const result = load({
      events: [
        { x: 1, type: 'flag', flag: 'zeta' },
        { x: 2, type: 'flag', flag: 'alpha', value: true },
        { x: 3, type: 'flag', flag: 'zeta', value: false },
        { x: 4, type: 'flag', flag: 'mid-way' },
      ],
    });
    expect(result.issues).toEqual([]);
    const stage = result.db.stages[0];
    expect(stage.flagNames).toEqual(['alpha', 'mid-way', 'zeta']);
    expect(stage.events.map((e) => (e.type === 'flag' ? [e.flagId, e.value] : null))).toEqual([
      [2, undefined],
      [0, true],
      [2, false],
      [1, undefined],
    ]);
  });

  it('gives a stage without flag events no flag names', () => {
    expect(load({ events: [{ x: 1, type: 'end' }] }).db.stages[0].flagNames).toEqual([]);
  });
});

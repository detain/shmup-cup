/**
 * A stage's **Mode-7 floor** section (plan M3-02, shmup_feat.md §18 "[P2] Mode 7-style effects …
 * pseudo-3D floor (per-row affine matrix in shader)"): the loader's `mode7` schema, the defaults
 * it fills, the two cross-field rules it checks (`horizon < bottom`, `from < to`) and the
 * `Mode7View` `createStageEffectsView` hands the renderer.
 *
 * It is presentation only: a stage's hash and everything the simulation reads are unchanged by it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLAYFIELD_H, resolveGameConfig } from '../../src/config/index.js';
import {
  DEFAULT_MODE7_FOG_DEPTH,
  DEFAULT_MODE7_SCROLL,
  loadContent,
  type ContentDb,
  type ContentFile,
  type ValidationIssue,
} from '../../src/data/index.js';
import { createStageEffectsView } from '../../src/stage/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld } from '../../src/world/index.js';

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
 * A static stage, with a `mode7` section when one is given.
 *
 * @param mode7 - The section (omitted when `undefined`).
 * @returns The file.
 */
function stageFile(mode7?: unknown): ContentFile {
  return {
    path: 'stages/m7.stage.json',
    data: {
      formatVersion: 1,
      kind: 'stage',
      id: 'm7',
      name: 'M7',
      music: { stage: 'Stage', boss: 'Boss' },
      length: 2000,
      camera: [{ x: 0, speed: 0 }],
      checkpoints: [{ x: 0 }],
      parallax: [],
      tilemap: null,
      events: [],
      ...(mode7 === undefined ? {} : { mode7 }),
    },
  };
}

/**
 * Loads a stage with a `mode7` section.
 *
 * @param mode7 - The section.
 * @returns The DB and the issues.
 */
function load(mode7?: unknown): { db: ContentDb; issues: readonly ValidationIssue[] } {
  return loadContent([shipped('player/kestrel.player.json'), stageFile(mode7)], {
    extraSprites: [...ENGINE_SPRITES, 'bg/floor'],
  });
}

/** The smallest floor the schema accepts. */
const MINIMAL = { sprite: 'bg/floor', horizon: 100, height: 34, fog: '#20124a' };

describe('core/data — a stage`s mode7 section (M3-02)', () => {
  it('is optional: a stage without one has none and needs no effects view', () => {
    const { db, issues } = load();
    expect(issues).toEqual([]);
    const stage = db.stages[db.stageIndex.get('m7') ?? -1];
    expect(stage.mode7).toBeNull();
    expect(createStageEffectsView(stage)).toBeNull();
  });

  it('fills every default and resolves the sprite and the fog colour', () => {
    const { db, issues } = load(MINIMAL);
    expect(issues).toEqual([]);
    const floor = db.stages[db.stageIndex.get('m7') ?? -1].mode7;
    expect(floor).not.toBeNull();
    expect(floor?.bottom).toBe(PLAYFIELD_H);
    expect(floor?.scroll).toBe(DEFAULT_MODE7_SCROLL);
    expect(floor?.sway).toBe(0);
    expect(floor?.turn).toBe(0);
    expect(floor?.fogDepth).toBe(DEFAULT_MODE7_FOG_DEPTH);
    expect(floor?.alpha).toBe(1);
    expect(floor?.from).toBe(0);
    expect(floor?.to).toBe(Number.POSITIVE_INFINITY);
    expect(floor?.fogRgb).toBe(0x20124a);
    expect(floor?.spriteId).toBe(db.sprites.index.get('bg/floor'));
  });

  it('keeps what the file says', () => {
    const { db, issues } = load({
      ...MINIMAL,
      bottom: 200,
      scroll: 0.09,
      sway: -0.05,
      turn: 512,
      fogDepth: 220,
      alpha: 0.5,
      from: 400,
      to: 1200,
    });
    expect(issues).toEqual([]);
    expect(db.stages[db.stageIndex.get('m7') ?? -1].mode7).toMatchObject({
      bottom: 200,
      scroll: 0.09,
      sway: -0.05,
      turn: 512,
      fogDepth: 220,
      alpha: 0.5,
      from: 400,
      to: 1200,
    });
  });

  it('rejects a bottom that is not below the horizon and a range that is not forwards', () => {
    const low = load({ ...MINIMAL, horizon: 100, bottom: 100 });
    expect(low.issues).toHaveLength(1);
    expect(low.issues[0].message).toBe('must be greater than horizon');
    expect(low.issues[0].path).toContain('mode7.bottom');
    const backwards = load({ ...MINIMAL, from: 900, to: 500 });
    expect(backwards.issues).toHaveLength(1);
    expect(backwards.issues[0].message).toBe('must be greater than from');
    expect(backwards.issues[0].path).toContain('mode7.to');
  });

  it('rejects values outside the schema`s bounds', () => {
    for (const bad of [
      { horizon: -1 },
      { horizon: 215 },
      { height: 0 },
      { turn: 1024 },
      { alpha: 1.5 },
      { scroll: 100 },
      { fog: 'purple' },
    ]) {
      const { issues } = load({ ...MINIMAL, ...bad });
      expect(issues.length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
  });

  it('registers the floor sprite as a reference the atlas must carry', () => {
    const { db, issues } = load({ ...MINIMAL, sprite: 'bg/only-here' });
    // Sprite names are collected, not validated, by the loader: the asset pipeline checks the
    // atlas has every name content refers to (`test/scripts/assets/pipeline.test.ts`).
    expect(issues).toEqual([]);
    const id = db.sprites.index.get('bg/only-here');
    expect(id).toBeGreaterThanOrEqual(0);
    expect(db.stages[db.stageIndex.get('m7') ?? -1].mode7?.spriteId).toBe(id);
  });
});

describe('core/stage — the Mode-7 view (M3-02)', () => {
  it('a floor alone is enough for an effects view, frozen, with the resolved numbers', () => {
    const { db } = load({ ...MINIMAL, bottom: 200, from: 100, to: 800, alpha: 0.75 });
    const stage = db.stages[db.stageIndex.get('m7') ?? -1];
    const view = createStageEffectsView(stage);
    expect(view).not.toBeNull();
    expect(view?.raster).toEqual([]);
    expect(view?.cycles).toEqual([]);
    const floor = view?.mode7;
    expect(floor).toMatchObject({
      spriteId: db.sprites.index.get('bg/floor'),
      horizon: 100,
      bottom: 200,
      height: 34,
      fog: 0x20124a,
      alpha: 0.75,
      from: 100,
      to: 800,
    });
    expect(Object.isFrozen(floor)).toBe(true);
    expect(Object.isFrozen(view)).toBe(true);
  });

  it('a stage with raster effects but no floor reports `mode7` as null', () => {
    const { db, issues } = loadContent(
      [
        shipped('player/kestrel.player.json'),
        {
          ...stageFile(),
          data: {
            ...(stageFile().data as Record<string, unknown>),
            cycles: [{ layer: 'far', colors: ['#101020', '#202040'], ticks: 8 }],
          },
        },
      ],
      { extraSprites: [...ENGINE_SPRITES, 'bg/floor'] },
    );
    expect(issues).toEqual([]);
    const view = createStageEffectsView(db.stages[db.stageIndex.get('m7') ?? -1]);
    expect(view?.mode7).toBeNull();
    expect(view?.cycles).toHaveLength(1);
  });

  it('never touches the simulation: the same World hash with and without the floor', () => {
    /**
     * Runs a World on the stage and hashes it.
     *
     * @param mode7 - The section (or none).
     * @returns The hash.
     */
    const hash = (mode7?: unknown): number => {
      const { db, issues } = load(mode7);
      expect(issues).toEqual([]);
      const w = createWorld(resolveGameConfig({ seed: 7, stage: 'm7' }), db);
      const input = createInputSnapshot();
      for (let i = 0; i < 120; i++) stepWorld(w, input);
      return hashWorld(w);
    };
    expect(hash(MINIMAL)).toBe(hash());
  });

  it('the shipped HIGH-SPEED DIMENSION stage ships one', () => {
    const { db, issues } = loadContent(
      [
        shipped('player/kestrel.player.json'),
        shipped('enemies/extras.enemies.json'),
        shipped('stages/dimension.stage.json'),
      ],
      { extraSprites: ENGINE_SPRITES },
    );
    expect(issues).toEqual([]);
    const stage = db.stages[db.stageIndex.get('dimension') ?? -1];
    expect(stage.mode7).not.toBeNull();
    expect(stage.mode7?.sprite).toBe('bg/dimension-floor');
    expect(stage.mode7?.spriteId).toBeGreaterThanOrEqual(0);
    expect(createStageEffectsView(stage)?.mode7).not.toBeNull();
  });
});

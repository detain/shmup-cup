/**
 * Tests of the M2-15 content of `core/data`: the `replay` kind (the attract loop's demos —
 * `ContentDb.demos`: structure, ids, the recorded stage resolved or reported, path order) and the
 * campaign's attract `story` (defaults, limits, scene names).
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_DEMO_TICKS,
  MAX_STORY_LINES,
  MAX_STORY_LINE_LENGTH,
  MAX_STORY_PAGES,
  STORY_SCENES,
  loadContent,
  type ContentFile,
} from '../../src/data/index.js';

/**
 * A demo document of a few ticks (the structure the loader checks; not a playable recording).
 *
 * @param id - Its id.
 * @param stageId - The recorded stage.
 * @returns The file body.
 */
function demo(id: string, stageId: string | null): Record<string, unknown> {
  return {
    formatVersion: 1,
    kind: 'replay',
    id,
    description: 'a demo',
    header: {
      formatVersion: 1,
      buildId: 'demo',
      seed: 1,
      stageId,
      checkpoint: -1,
      loadout: 'default',
      assisted: true,
      config: { seed: 1, stage: stageId },
    },
    ticks: 2,
    hashInterval: 600,
    inputs: ['AAI=', 'AAI='],
    hashes: [],
    finalHash: 42,
  };
}

/** A minimal stage file. */
const STAGE: ContentFile = {
  path: 'stages/s.stage.json',
  data: {
    formatVersion: 1,
    kind: 'stage',
    id: 's',
    name: 'S',
    music: { stage: 'Stage', boss: 'Boss' },
    length: 1000,
    camera: [{ x: 0, speed: 1 }],
    checkpoints: [{ x: 0 }],
    parallax: [],
    tilemap: null,
    events: [{ x: 1000, type: 'end' }],
  },
};

/**
 * A campaign of one zone playing {@link STAGE}, with a story.
 *
 * @param story - The story field (omitted when `undefined`).
 * @returns The file.
 */
function campaign(story?: unknown): ContentFile {
  const data: Record<string, unknown> = {
    formatVersion: 1,
    kind: 'campaign',
    id: 'c',
    start: 'a',
    zones: [{ id: 'a', label: 'A', name: 'ALPHA', stage: 's' }],
    edges: [],
    endings: [{ id: 'end', name: 'END', zone: 'a' }],
  };
  if (story !== undefined) data.story = story;
  return { path: 'campaign/c.campaign.json', data };
}

describe('core/data demos (kind replay, M2-15)', () => {
  it('collects demos in path order with their stage resolved', () => {
    const { db, issues } = loadContent([
      { path: 'demos/b.replay.json', data: demo('b', null) },
      { path: 'demos/a.replay.json', data: demo('a', 's') },
      STAGE,
    ]);
    expect(issues).toEqual([]);
    expect(db.demos.map((d) => d.id)).toEqual(['a', 'b']);
    expect(db.demoIndex.get('b')).toBe(1);
    expect(db.demos[0]).toMatchObject({
      stage: 's',
      stageIndex: db.stageIndex.get('s'),
      ticks: 2,
      description: 'a demo',
    });
    expect(db.demos[1]).toMatchObject({ stage: null, stageIndex: -1 });
    // The document keeps what core/replay decodes.
    expect(db.demos[0].document.finalHash).toBe(42);
    expect(Object.isFrozen(db.demos[0])).toBe(true);
  });

  it('reports an unknown stage, a duplicate id and a bad structure', () => {
    const bad = demo('x', null);
    bad.ticks = MAX_DEMO_TICKS + 1;
    bad.inputs = ['AAI='];
    const { db, issues } = loadContent([
      { path: 'demos/a.replay.json', data: demo('a', 'nowhere') },
      { path: 'demos/b.replay.json', data: demo('a', null) },
      { path: 'demos/c.replay.json', data: bad },
      { path: 'demos/d.replay.json', data: { ...demo('d', null), header: 'no' } },
    ]);
    expect(issues).toEqual(
      expect.arrayContaining([
        { path: 'demos/a.replay.json:header.stageId', message: 'unknown stage id "nowhere"' },
        { path: 'demos/b.replay.json:id', message: 'duplicate demo id "a"' },
        {
          path: 'demos/c.replay.json:ticks',
          message: 'must be an integer in 1..' + String(MAX_DEMO_TICKS),
        },
        { path: 'demos/c.replay.json:inputs', message: 'must have at least 2 items' },
        { path: 'demos/d.replay.json:header', message: 'must be an object' },
      ]),
    );
    expect(db.demos.map((d) => d.id)).toEqual(['a']);
    expect(db.demos[0].stageIndex).toBe(-1);
  });
});

describe('core/data campaign story (M2-15)', () => {
  it('defaults to no story; pages default to no scene and no lines', () => {
    expect(loadContent([STAGE, campaign()]).db.campaign?.story).toEqual([]);
    const { db, issues } = loadContent([
      STAGE,
      campaign([{ scene: 'dawn', lines: ['ONE', 'TWO'] }, {}, { lines: ['THREE'] }]),
    ]);
    expect(issues).toEqual([]);
    expect(db.campaign?.story).toEqual([
      { scene: 'dawn', lines: ['ONE', 'TWO'] },
      { scene: 'none', lines: [] },
      { scene: 'none', lines: ['THREE'] },
    ]);
    expect(STORY_SCENES).toEqual(['none', 'dawn', 'invasion', 'launch']);
  });

  it('refuses unknown scenes, long lines and too many pages or lines', () => {
    const long = 'X'.repeat(MAX_STORY_LINE_LENGTH + 1);
    const lines = Array.from({ length: MAX_STORY_LINES + 1 }, () => 'LINE');
    const pages = Array.from({ length: MAX_STORY_PAGES + 1 }, () => ({}));
    for (const story of [[{ scene: 'mars' }], [{ lines: [long] }], [{ lines }], pages]) {
      const { db, issues } = loadContent([STAGE, campaign(story)]);
      expect(issues.length, JSON.stringify(story).slice(0, 40)).toBeGreaterThan(0);
      expect(db.campaign).toBeNull();
    }
  });
});

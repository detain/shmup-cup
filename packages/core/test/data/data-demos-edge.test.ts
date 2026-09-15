/**
 * Edge cases of the M2-15 content of `core/data` beyond `data-demos.test.ts`: every structural
 * check of a `replay` (demo) file — the id's shape, the optional description, the header's fields,
 * the tick and hash limits, exactly two input streams —, a demo whose header names a stage that is
 * loaded in another file, an empty content's demo list, and the campaign story's line limits at
 * their exact bounds.
 */
import { describe, expect, it } from 'vitest';
import {
  EMPTY_CONTENT_DB,
  MAX_DEMO_TICKS,
  MAX_STORY_LINES,
  MAX_STORY_LINE_LENGTH,
  MAX_STORY_PAGES,
  loadContent,
  type ContentFile,
} from '../../src/data/index.js';

/**
 * A structurally valid demo document (not a playable recording).
 *
 * @param id - Its id.
 * @param stageId - The recorded stage.
 * @returns The file body.
 */
function demo(id: string, stageId: string | null = null): Record<string, unknown> {
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

/**
 * Loads one demo file.
 *
 * @param data - Its body.
 * @returns The load result.
 */
function loadDemo(data: Record<string, unknown>): ReturnType<typeof loadContent> {
  return loadContent([{ path: 'demos/d.replay.json', data }]);
}

/**
 * A demo with one header field replaced.
 *
 * @param field - The header field.
 * @param value - Its value.
 * @returns The file body.
 */
function withHeader(field: string, value: unknown): Record<string, unknown> {
  const doc = demo('d');
  doc.header = { ...(doc.header as Record<string, unknown>), [field]: value };
  return doc;
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
 * @param story - The story.
 * @returns The file.
 */
function campaign(story: unknown): ContentFile {
  return {
    path: 'campaign/c.campaign.json',
    data: {
      formatVersion: 1,
      kind: 'campaign',
      id: 'c',
      start: 'a',
      zones: [{ id: 'a', label: 'A', name: 'ALPHA', stage: 's' }],
      edges: [],
      endings: [{ id: 'end', name: 'END', zone: 'a' }],
      story,
    },
  };
}

describe('core/data demos — structure edge cases (M2-15)', () => {
  it('has no demos in the empty content', () => {
    expect(EMPTY_CONTENT_DB.demos).toEqual([]);
    expect(EMPTY_CONTENT_DB.demoIndex.size).toBe(0);
    expect(loadContent([]).db.demos).toEqual([]);
  });

  it('defaults a missing description to an empty string', () => {
    const doc = demo('d');
    delete doc.description;
    const { db, issues } = loadDemo(doc);
    expect(issues).toEqual([]);
    expect(db.demos[0].description).toBe('');
  });

  it('accepts ids of lower-case letters, digits and dashes only', () => {
    for (const id of ['zone-a', 'a', '9-lives', 'x'.repeat(32)]) {
      const { db, issues } = loadDemo(demo(id));
      expect(issues, id).toEqual([]);
      expect(db.demos[0].id).toBe(id);
    }
    for (const id of ['Zone-a', '-a', 'a_b', 'a b', '', 'x'.repeat(33)]) {
      const { db, issues } = loadDemo(demo(id));
      expect(issues.length, JSON.stringify(id)).toBeGreaterThan(0);
      expect(issues[0].path).toBe('demos/d.replay.json:id');
      expect(db.demos).toEqual([]);
    }
  });

  it('checks the tick count at its bounds', () => {
    for (const [ticks, ok] of [
      [1, true],
      [MAX_DEMO_TICKS, true],
      [0, false],
      [MAX_DEMO_TICKS + 1, false],
      [1.5, false],
      ['2', false],
    ] as const) {
      const doc = demo('d');
      doc.ticks = ticks;
      const { db, issues } = loadDemo(doc);
      expect(issues.length === 0, String(ticks)).toBe(ok);
      expect(db.demos.length).toBe(ok ? 1 : 0);
      if (ok) expect(db.demos[0].ticks).toBe(ticks);
    }
  });

  it('wants exactly one input stream per player, hashes and the final hash as 32-bit words', () => {
    const cases: Array<[string, unknown]> = [
      ['inputs', ['AAI=']],
      ['inputs', ['AAI=', 'AAI=', 'AAI=']],
      ['inputs', ['AAI=', 7]],
      ['hashes', [-1]],
      ['hashes', [0x1_0000_0000]],
      ['hashes', [1.5]],
      ['finalHash', -1],
      ['finalHash', 0x1_0000_0000],
      ['hashInterval', 0],
    ];
    for (const [field, value] of cases) {
      const doc = demo('d');
      doc[field] = value;
      const { db, issues } = loadDemo(doc);
      expect(issues.length, `${field} ${JSON.stringify(value)}`).toBeGreaterThan(0);
      expect(issues.some((issue) => issue.path.startsWith('demos/d.replay.json:' + field))).toBe(
        true,
      );
      expect(db.demos).toEqual([]);
    }
    const max = demo('d');
    max.finalHash = 0xffff_ffff;
    max.hashes = [0, 0xffff_ffff];
    expect(loadDemo(max).issues).toEqual([]);
  });

  it('checks the header`s fields', () => {
    const bad: Array<[string, unknown]> = [
      ['formatVersion', 0],
      ['seed', -1],
      ['seed', 0x1_0000_0000],
      ['stageId', 5],
      ['checkpoint', -2],
      ['checkpoint', 0.5],
      ['assisted', 'yes'],
      ['loadout', 'x'.repeat(17)],
      ['buildId', 'x'.repeat(65)],
      ['config', []],
      ['config', null],
      ['config', 'seed=1'],
    ];
    for (const [field, value] of bad) {
      const { db, issues } = loadDemo(withHeader(field, value));
      expect(issues.length, `${field} ${JSON.stringify(value)}`).toBeGreaterThan(0);
      expect(
        issues.some((issue) => issue.path.startsWith('demos/d.replay.json:header.' + field)),
        field,
      ).toBe(true);
      expect(db.demos).toEqual([]);
    }
    // An empty build id and any config object are fine (core/replay checks the config).
    expect(loadDemo(withHeader('buildId', '')).issues).toEqual([]);
    expect(loadDemo(withHeader('config', { anything: true })).issues).toEqual([]);
  });

  it('refuses a format version newer than the loader knows', () => {
    const wrongVersion = demo('d');
    wrongVersion.formatVersion = 2;
    expect(loadDemo(wrongVersion).db.demos).toEqual([]);
    expect(loadDemo(wrongVersion).issues.length).toBeGreaterThan(0);
  });

  it('resolves the stage from any file; a free-flight demo needs none', () => {
    const { db, issues } = loadContent([
      { path: 'demos/a.replay.json', data: demo('a', 's') },
      { path: 'demos/b.replay.json', data: demo('b', null) },
      STAGE,
    ]);
    expect(issues).toEqual([]);
    expect(db.demos[0].stageIndex).toBe(db.stageIndex.get('s'));
    expect(db.demos[0].stageIndex).toBeGreaterThanOrEqual(0);
    expect(db.demos[1].stageIndex).toBe(-1);
    // The document is kept frozen and whole.
    expect(Object.isFrozen(db.demos[0].document)).toBe(true);
    expect(db.demos[0].document.ticks).toBe(2);
    expect(db.demoIndex.get('a')).toBe(0);
  });
});

describe('core/data campaign story — limits at their bounds (M2-15)', () => {
  it('accepts the most pages, lines and characters', () => {
    const line = 'X'.repeat(MAX_STORY_LINE_LENGTH);
    const lines = Array.from({ length: MAX_STORY_LINES }, () => line);
    const pages = Array.from({ length: MAX_STORY_PAGES }, (_, i) => ({
      scene: (['none', 'dawn', 'invasion', 'launch'] as const)[i % 4],
      lines,
    }));
    const { db, issues } = loadContent([STAGE, campaign(pages)]);
    expect(issues).toEqual([]);
    expect(db.campaign?.story).toHaveLength(MAX_STORY_PAGES);
    expect(db.campaign?.story[3]).toEqual({ scene: 'launch', lines });
  });

  it('accepts an empty story; refuses empty lines and a story that is not a list of pages', () => {
    expect(loadContent([STAGE, campaign([])]).db.campaign?.story).toEqual([]);
    // Blank rows are the scene's (one after each page), never the content's.
    const blank = loadContent([STAGE, campaign([{ lines: ['', 'TEXT'] }])]);
    expect(blank.issues).toEqual([
      {
        path: 'campaign/c.campaign.json:story[0].lines[0]',
        message: 'must be a string of length in 1..' + String(MAX_STORY_LINE_LENGTH),
      },
    ]);
    for (const story of ['once upon a time', { lines: [] }, [{ lines: 'ONE' }], [{ lines: [1] }]]) {
      const { db, issues } = loadContent([STAGE, campaign(story)]);
      expect(issues.length, JSON.stringify(story)).toBeGreaterThan(0);
      expect(db.campaign).toBeNull();
    }
  });
});

/**
 * The M2-14 additions to the `campaign` kind and the stage music of `core/data`: an ending's sprite
 * `scene` and epilogue `text`, the campaign's `credits` (defaults, limits, `creditsLineCount`) and a
 * final zone's stage `music.ending` / `music.credits` cues (resolved like the stage and boss cues,
 * absent → -1).
 */
import { describe, expect, it } from 'vitest';
import {
  ENDING_SCENES,
  MAX_CREDITS_LINES,
  MAX_CREDITS_LINE_LENGTH,
  MAX_CREDITS_SECTIONS,
  MAX_ENDING_LINE_LENGTH,
  MAX_ENDING_TEXT_LINES,
  creditsLineCount,
  loadContent,
  type ContentFile,
} from '../../src/data/index.js';
import { MUSIC_CUES } from '../../src/events/index.js';

/**
 * A minimal stage file.
 *
 * @param id - Stage id.
 * @param music - Its music (default: the stage and boss themes only).
 * @returns The file.
 */
function stage(
  id: string,
  music: Record<string, string> = { stage: 'Stage', boss: 'Boss' },
): ContentFile {
  return {
    path: `stages/${id}.stage.json`,
    data: {
      formatVersion: 1,
      kind: 'stage',
      id,
      name: id.toUpperCase(),
      music,
      length: 1000,
      camera: [{ x: 0, speed: 1 }],
      checkpoints: [{ x: 0 }],
      parallax: [],
      tilemap: null,
      events: [{ x: 1000, type: 'end' }],
    },
  };
}

/**
 * A two-zone campaign file (`s` → `f`) with the given endings and extra fields.
 *
 * @param endings - The endings.
 * @param extra - More fields (credits).
 * @returns The file.
 */
function campaign(
  endings: ReadonlyArray<Record<string, unknown>>,
  extra: Record<string, unknown> = {},
): ContentFile {
  return {
    path: 'campaign/test.campaign.json',
    data: {
      formatVersion: 1,
      kind: 'campaign',
      id: 'test',
      start: 's',
      zones: [
        { id: 's', label: 'S', name: 'START', stage: 'st-s' },
        { id: 'f', label: 'F', name: 'FINAL', stage: 'st-f' },
      ],
      edges: [{ from: 's', to: 'f' }],
      endings,
      ...extra,
    },
  };
}

/**
 * Loads a campaign with its two stages.
 *
 * @param file - The campaign file.
 * @returns The load result.
 */
function load(file: ContentFile): ReturnType<typeof loadContent> {
  return loadContent([file, stage('st-s'), stage('st-f')]);
}

describe('core/data campaign endings and credits (M2-14)', () => {
  it('defaults an ending to no scene and no text, and a campaign to no credits', () => {
    const { db, issues } = load(campaign([{ id: 'f', name: 'THE END', zone: 'f' }]));
    expect(issues).toEqual([]);
    expect(db.campaign?.endings[0]).toMatchObject({ scene: 'none', text: [] });
    expect(db.campaign?.credits).toEqual([]);
    expect(ENDING_SCENES).toEqual(['none', 'citadel', 'abyss']);
  });

  it('keeps the scene, the epilogue and the credits (a section without lines gets none)', () => {
    const { db, issues } = load(
      campaign([{ id: 'f', name: 'THE END', zone: 'f', scene: 'abyss', text: ['ONE.', 'TWO.'] }], {
        credits: [{ title: 'MUSIC', lines: ['CHIP SONGS'] }, { title: 'THANK YOU' }],
      }),
    );
    expect(issues).toEqual([]);
    expect(db.campaign?.endings[0]).toMatchObject({ scene: 'abyss', text: ['ONE.', 'TWO.'] });
    expect(db.campaign?.credits).toEqual([
      { title: 'MUSIC', lines: ['CHIP SONGS'] },
      { title: 'THANK YOU', lines: [] },
    ]);
    expect(creditsLineCount(db.campaign?.credits ?? [])).toBe(5);
    expect(creditsLineCount([])).toBe(0);
  });

  it('reports an unknown scene, a long epilogue and credits over their limits', () => {
    const long = 'X'.repeat(MAX_ENDING_LINE_LENGTH + 1);
    const cases: Array<[ContentFile, RegExp]> = [
      [campaign([{ id: 'f', name: 'E', zone: 'f', scene: 'moon' }]), /endings\[0\]\.scene/],
      [
        campaign([
          { id: 'f', name: 'E', zone: 'f', text: Array(MAX_ENDING_TEXT_LINES + 1).fill('A') },
        ]),
        /endings\[0\]\.text/,
      ],
      [campaign([{ id: 'f', name: 'E', zone: 'f', text: [long] }]), /endings\[0\]\.text\[0\]/],
      [
        campaign([{ id: 'f', name: 'E', zone: 'f' }], {
          credits: [{ title: 'T', lines: Array(MAX_CREDITS_LINES + 1).fill('L') }],
        }),
        /credits\[0\]\.lines/,
      ],
      [
        campaign([{ id: 'f', name: 'E', zone: 'f' }], {
          credits: [{ title: 'T'.repeat(MAX_CREDITS_LINE_LENGTH + 1) }],
        }),
        /credits\[0\]\.title/,
      ],
      [
        campaign([{ id: 'f', name: 'E', zone: 'f' }], {
          credits: Array(MAX_CREDITS_SECTIONS + 1).fill({ title: 'T' }),
        }),
        /credits/,
      ],
    ];
    for (const [file, path] of cases) {
      const { db, issues } = load(file);
      expect(issues.length, String(path)).toBeGreaterThan(0);
      expect(
        issues.some((issue) => path.test(issue.path)),
        String(path),
      ).toBe(true);
      expect(db.campaign).toBeNull();
    }
  });

  it("resolves a final stage's ending and credits cues; absent ones are -1", () => {
    const { db, issues } = loadContent([
      stage('st-a'),
      stage('st-b', { stage: 'Stage', boss: 'FinalBoss', ending: 'Ending', credits: 'Credits' }),
    ]);
    expect(issues).toEqual([]);
    const a = db.stages[db.stageIndex.get('st-a') ?? -1];
    const b = db.stages[db.stageIndex.get('st-b') ?? -1];
    expect([a.music.endingId, a.music.creditsId]).toEqual([-1, -1]);
    expect([b.music.bossId, b.music.endingId, b.music.creditsId]).toEqual([
      MUSIC_CUES.FinalBoss,
      MUSIC_CUES.Ending,
      MUSIC_CUES.Credits,
    ]);
    const bad = loadContent([stage('st-c', { stage: 'Stage', boss: 'Boss', ending: 'Finale' })]);
    expect(bad.issues).toEqual([expect.objectContaining({ message: 'unknown music id "Finale"' })]);
  });
});

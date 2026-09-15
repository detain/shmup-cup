/**
 * Edge cases of the M2-14 additions to the `campaign` kind beyond `campaign-ending.test.ts`:
 *
 * - the limits are inclusive: 8 epilogue lines of 40 characters, 24 credits sections of a
 *   60-character title and 16 lines of 60 characters load (`creditsLineCount` 432); an empty
 *   epilogue, an explicit `none` scene and an empty credits list are fine, an empty line is not;
 * - `completeCampaign` on its own fills the defaults (scene `none`, no text, a section's `lines`,
 *   no credits) and keeps what is given;
 * - unknown keys in an ending or a credits section, and a credits section without a title, are
 *   reported;
 * - the selection with an exclusion: the review fix of M2-14 — a flawless ending that excludes
 *   `bossEscaped`, listed first, loses to the escape ending when both flags are set, whatever the
 *   other flags; without the exclusion it would win (what the shipped campaign did before);
 * - the shipped campaign's final zones each have a no-death ending listed before a catch-all, every
 *   ending names a scene and an epilogue within the limits, and no mask selects nothing.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MAX_CREDITS_LINES,
  MAX_CREDITS_LINE_LENGTH,
  MAX_CREDITS_SECTIONS,
  MAX_ENDING_LINE_LENGTH,
  MAX_ENDING_TEXT_LINES,
  RUN_FLAG_NAMES,
  completeCampaign,
  creditsLineCount,
  loadContent,
  runFlagMask,
  selectCampaignEnding,
  type CampaignSpec,
  type ContentFile,
  type ValidationIssue,
} from '../../src/data/index.js';

/**
 * A minimal stage file.
 *
 * @param id - Stage id.
 * @returns The file.
 */
function stage(id: string): ContentFile {
  return {
    path: `stages/${id}.stage.json`,
    data: {
      formatVersion: 1,
      kind: 'stage',
      id,
      name: id.toUpperCase(),
      music: { stage: 'Stage', boss: 'Boss' },
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
 * The raw fields of a two-zone campaign (`s` → `f`).
 *
 * @param endings - The endings.
 * @param extra - More fields (credits).
 * @returns The campaign's data.
 */
function raw(
  endings: ReadonlyArray<Record<string, unknown>>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
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
  };
}

/**
 * Loads a campaign with its two stages.
 *
 * @param endings - The endings.
 * @param extra - More fields.
 * @returns The load result.
 */
function load(
  endings: ReadonlyArray<Record<string, unknown>>,
  extra: Record<string, unknown> = {},
): ReturnType<typeof loadContent> {
  return loadContent([
    { path: 'campaign/test.campaign.json', data: raw(endings, extra) },
    stage('st-s'),
    stage('st-f'),
  ]);
}

/**
 * A string of a length.
 *
 * @param n - Characters.
 * @param c - The character.
 * @returns The string.
 */
const text = (n: number, c = 'A'): string => c.repeat(n);

/** The shipped campaign file. */
const SHIPPED = JSON.parse(
  readFileSync(new URL('../../../../content/campaign/main.campaign.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

describe('core/data campaign endings and credits — edge cases (M2-14 tests)', () => {
  it('accepts every limit exactly: 8 lines of 40, 24 sections of 16 lines of 60', () => {
    const credits = Array.from({ length: MAX_CREDITS_SECTIONS }, (_, i) => ({
      title: text(MAX_CREDITS_LINE_LENGTH, String.fromCharCode(65 + (i % 26))),
      lines: Array.from({ length: MAX_CREDITS_LINES }, () => text(MAX_CREDITS_LINE_LENGTH)),
    }));
    const { db, issues } = load(
      [
        {
          id: 'f',
          name: 'E',
          zone: 'f',
          scene: 'citadel',
          text: Array.from({ length: MAX_ENDING_TEXT_LINES }, () => text(MAX_ENDING_LINE_LENGTH)),
        },
      ],
      { credits },
    );
    expect(issues).toEqual([]);
    expect(db.campaign?.endings[0].text).toHaveLength(MAX_ENDING_TEXT_LINES);
    expect(db.campaign?.credits).toHaveLength(MAX_CREDITS_SECTIONS);
    expect(creditsLineCount(db.campaign?.credits ?? [])).toBe(
      MAX_CREDITS_SECTIONS * (2 + MAX_CREDITS_LINES),
    );
    expect(creditsLineCount(db.campaign?.credits ?? [])).toBe(432);
  });

  it('accepts an empty epilogue, an explicit `none` scene and an empty credits list; not an empty line', () => {
    const { db, issues } = load(
      [
        { id: 'f-clean', name: 'CLEAN', zone: 'f', all: ['noDeath'], scene: 'none', text: [] },
        { id: 'f', name: 'E', zone: 'f', scene: 'abyss', text: ['ONE.', 'TWO.'] },
      ],
      { credits: [] },
    );
    expect(issues).toEqual([]);
    expect(db.campaign?.endings.map((e) => [e.scene, e.text])).toEqual([
      ['none', []],
      ['abyss', ['ONE.', 'TWO.']],
    ]);
    expect(db.campaign?.credits).toEqual([]);
    // Content strings are never empty: a blank epilogue line or credits line / title is reported
    // (the credits scroll adds its own blank row after each section).
    for (const [endings, extra, path] of [
      [[{ id: 'f', name: 'E', zone: 'f', text: ['A.', ''] }], {}, 'endings[0].text[1]'],
      [[{ id: 'f', name: 'E', zone: 'f' }], { credits: [{ title: '' }] }, 'credits[0].title'],
      [
        [{ id: 'f', name: 'E', zone: 'f' }],
        { credits: [{ title: 'T', lines: ['A', ''] }] },
        'credits[0].lines[1]',
      ],
    ] as const) {
      const bad = load(endings, extra);
      expect(
        bad.issues.map((issue) => issue.path),
        path,
      ).toEqual(['campaign/test.campaign.json:' + path]);
    }
    // A credits section of no lines is two rows (the title, the blank after it).
    expect(creditsLineCount([{ title: 'T', lines: [] }])).toBe(2);
  });

  it('fills the defaults in completeCampaign itself and keeps what is given', () => {
    const issues: ValidationIssue[] = [];
    const spec = completeCampaign(
      raw(
        [
          { id: 'f-a', name: 'A', zone: 'f', all: ['bonus'], scene: 'abyss', text: ['X'] },
          { id: 'f', name: 'B', zone: 'f' },
        ],
        { credits: [{ title: 'T' }, { title: 'U', lines: ['L'] }] },
      ),
      (path) => 'c:' + path,
      issues,
    );
    expect(issues).toEqual([]);
    expect(spec).not.toBeNull();
    const c = spec as CampaignSpec;
    expect(c.endings.map((e) => [e.id, e.scene, e.text, e.allMask, e.noneMask])).toEqual([
      ['f-a', 'abyss', ['X'], runFlagMask(['bonus']), 0],
      ['f', 'none', [], 0, 0],
    ]);
    expect(c.credits).toEqual([
      { title: 'T', lines: [] },
      { title: 'U', lines: ['L'] },
    ]);
    const bare = completeCampaign(raw([{ id: 'f', name: 'B', zone: 'f' }]), (p) => p, issues);
    expect(bare?.credits).toEqual([]);
  });

  it('reports unknown keys in an ending or a credits section, and a section without a title', () => {
    const cases: Array<[Record<string, unknown>, Record<string, unknown>, RegExp]> = [
      [{ id: 'f', name: 'E', zone: 'f', music: 'Ending' }, {}, /endings\[0\]/],
      [
        { id: 'f', name: 'E', zone: 'f' },
        { credits: [{ title: 'T', text: ['A'] }] },
        /credits\[0\]/,
      ],
      [{ id: 'f', name: 'E', zone: 'f' }, { credits: [{ lines: ['A'] }] }, /credits\[0\]/],
      [{ id: 'f', name: 'E', zone: 'f', text: 'ONE LINE' }, {}, /endings\[0\]\.text/],
      [{ id: 'f', name: 'E', zone: 'f', scene: 'CITADEL' }, {}, /endings\[0\]\.scene/],
    ];
    for (const [ending, extra, path] of cases) {
      const { db, issues } = load([ending], extra);
      expect(
        issues.some((issue) => path.test(issue.path)),
        String(path) + ' ' + JSON.stringify(issues),
      ).toBe(true);
      expect(db.campaign).toBeNull();
    }
  });

  it('lets an escape beat a flawless ending that excludes it, whatever the other flags (the M2-14 review fix)', () => {
    const escaped = runFlagMask(['bossEscaped']);
    const noDeath = runFlagMask(['noDeath']);
    const fixed = load([
      { id: 'flawless', name: 'F', zone: 'f', all: ['noDeath'], none: ['bossEscaped'] },
      { id: 'escape', name: 'E', zone: 'f', all: ['bossEscaped'] },
      { id: 'plain', name: 'P', zone: 'f' },
    ]);
    const unfixed = load([
      { id: 'flawless', name: 'F', zone: 'f', all: ['noDeath'] },
      { id: 'escape', name: 'E', zone: 'f', all: ['bossEscaped'] },
      { id: 'plain', name: 'P', zone: 'f' },
    ]);
    expect([fixed.issues, unfixed.issues]).toEqual([[], []]);
    const c = fixed.db.campaign as CampaignSpec;
    const u = unfixed.db.campaign as CampaignSpec;
    const f = c.zones.findIndex((z) => z.id === 'f');
    for (let flags = 0; flags < 1 << RUN_FLAG_NAMES.length; flags++) {
      const want =
        (flags & escaped) !== 0 ? 'escape' : (flags & noDeath) !== 0 ? 'flawless' : 'plain';
      expect(selectCampaignEnding(c, f, flags)?.id, String(flags)).toBe(want);
    }
    // Without the exclusion the flawless ending (listed first) took the escape too.
    expect(selectCampaignEnding(u, f, escaped | noDeath)?.id).toBe('flawless');
    // Only final zones have endings: the start zone gets none.
    expect(selectCampaignEnding(c, 0, noDeath)).toBeNull();
  });

  it('holds the shipped endings together: a no-death ending before a catch-all per final zone, scenes and epilogues', () => {
    const { db, issues } = loadContent([
      { path: 'campaign/main.campaign.json', data: SHIPPED },
      ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((z) => stage('zone-' + z)),
      // M3-02: the final zones' escape stage.
      stage('escape'),
    ]);
    expect(issues).toEqual([]);
    const c = db.campaign as CampaignSpec;
    const noDeath = runFlagMask(['noDeath']);
    const finals = c.zones.map((z, i) => [z, i] as const).filter(([z]) => z.final);
    expect(finals.map(([z]) => z.id)).toEqual(['h', 'i']);
    for (const [zone, index] of finals) {
      const endings = c.endings.filter((e) => e.zoneIndex === index);
      const catchAll = endings.findIndex((e) => e.allMask === 0 && e.noneMask === 0);
      const flawless = endings.findIndex((e) => (e.allMask & noDeath) !== 0);
      expect(catchAll, zone.id).toBe(endings.length - 1); // last: it always matches
      expect(flawless, zone.id).toBeGreaterThanOrEqual(0);
      expect(flawless, zone.id).toBeLessThan(catchAll);
      for (const e of endings) {
        expect(e.scene, e.id).toBe(zone.id === 'h' ? 'citadel' : 'abyss');
        expect(e.text.length, e.id).toBeGreaterThanOrEqual(5);
        for (const line of e.text)
          expect(line.length, e.id).toBeLessThanOrEqual(MAX_ENDING_LINE_LENGTH);
      }
      for (let flags = 0; flags < 1 << RUN_FLAG_NAMES.length; flags++) {
        expect(selectCampaignEnding(c, index, flags), zone.id + ' ' + String(flags)).not.toBeNull();
      }
    }
    // Only THE DEEP IS STILL sinks the king: an escape never gets it.
    const deep = c.endings.find((e) => e.id === 'throne-flawless');
    expect(deep?.text.join(' ')).toMatch(/HOLLOW KING/);
    expect(deep?.noneMask).toBe(runFlagMask(['bossEscaped']));
    const escape = c.endings.find((e) => e.id === 'throne-escape');
    expect(escape?.text.join(' ')).not.toMatch(/SINKS WITH ITS ARK/);
    // The shipped credits fit the scroll's limits.
    expect(c.credits.length).toBeLessThanOrEqual(MAX_CREDITS_SECTIONS);
    expect(creditsLineCount(c.credits)).toBe(c.credits.reduce((n, s) => n + 2 + s.lines.length, 0));
  });
});

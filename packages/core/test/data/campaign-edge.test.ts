/**
 * Edge cases of the M2-10 `campaign` kind (`core/data` `data/campaign.ts`) beyond
 * `campaign.test.ts`:
 *
 * - the smallest map (one zone that is start and final at once) and layered maps whose routes have
 *   different lengths (a final zone at depth 1 next to a longer branch);
 * - the derived fields: `exits` in edge order, `row` in file order, `name` kept or defaulted;
 * - graph refusals the diamond tests do not reach: a map without a final zone (a two-zone cycle),
 *   an unknown `to`, an ending whose only condition is `none` (not unconditional);
 * - the schema limits: {@link MAX_CAMPAIGN_ZONES}, {@link MAX_ZONE_PREVIEW_LINES},
 *   {@link MAX_CAMPAIGN_ENDINGS}, empty zone / ending lists, zone ids and labels;
 * - {@link completeCampaign} on its own (issue paths through the caller's `at`, the parsed object
 *   completed in place, `null` on problems) and the helpers ({@link runFlagMask},
 *   {@link countCampaignRoutes} on wide maps, {@link selectCampaignEnding}'s first-match order and
 *   out-of-range zones);
 * - the shipped campaign's endings for every combination of run flags.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MAX_CAMPAIGN_ENDINGS,
  MAX_CAMPAIGN_ZONES,
  MAX_ZONE_EXITS,
  MAX_ZONE_PREVIEW_LINES,
  RUN_FLAG_NAMES,
  campaignRoutes,
  campaignZoneIndex,
  completeCampaign,
  countCampaignRoutes,
  loadContent,
  runFlagMask,
  selectCampaignEnding,
  type CampaignSpec,
  type ContentFile,
  type ValidationIssue,
} from '../../src/data/index.js';

/** Where the test campaign lives. */
const FILE = 'campaign/main.campaign.json';

/**
 * An issue path inside the campaign file.
 *
 * @param path - Path inside the file.
 * @returns The full issue path.
 */
const at = (path: string): string => FILE + ':' + path;

/** The stage every test zone plays. */
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
 * A zone entry.
 *
 * @param id - Zone id.
 * @param over - Fields over the defaults.
 * @returns The zone.
 */
function zone(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, label: id.slice(0, 2).toUpperCase(), name: 'ZONE ' + id, stage: 's', ...over };
}

/**
 * Edges from `[from, to]` pairs.
 *
 * @param pairs - The pairs.
 * @returns The edge entries.
 */
function edges(...pairs: Array<[string, string]>): Array<{ from: string; to: string }> {
  return pairs.map(([from, to]) => ({ from, to }));
}

/**
 * Loads a campaign file with the one test stage.
 *
 * @param body - The campaign's fields (header added).
 * @returns The load result.
 */
function load(body: Record<string, unknown>): ReturnType<typeof loadContent> {
  return loadContent([
    { path: FILE, data: { formatVersion: 1, kind: 'campaign', id: 'main', ...body } },
    STAGE,
  ]);
}

/**
 * Loads a campaign that must be valid.
 *
 * @param body - The campaign's fields.
 * @returns The campaign.
 */
function valid(body: Record<string, unknown>): CampaignSpec {
  const { db, issues } = load(body);
  expect(issues).toEqual([]);
  if (db.campaign === null) throw new Error('no campaign');
  return db.campaign;
}

/**
 * The issues of a campaign file.
 *
 * @param body - The campaign's fields.
 * @returns The issues.
 */
function issuesOf(body: Record<string, unknown>): ValidationIssue[] {
  return [...load(body).issues];
}

describe('core/data campaign edges: shapes of maps (M2-10)', () => {
  it('accepts a one-zone map: the start is the final zone, one route of one zone', () => {
    const campaign = valid({
      name: 'SOLO',
      start: 'a',
      zones: [zone('a')],
      edges: [],
      endings: [{ id: 'end', name: 'END', zone: 'a' }],
    });
    expect(campaign.name).toBe('SOLO');
    expect([campaign.startIndex, campaign.depths, campaign.routes]).toEqual([0, 1, 1]);
    expect(campaign.zones[0]).toMatchObject({ depth: 0, row: 0, exits: [], final: true });
    expect(campaignRoutes(campaign)).toEqual([[0]]);
    expect(selectCampaignEnding(campaign, 0, 0)?.id).toBe('end');
  });

  it('accepts routes of different lengths: a final zone at depth 1 beside a longer branch', () => {
    // a → b (final) | c → d (final): two routes, of 2 and 3 zones.
    const campaign = valid({
      start: 'a',
      zones: [zone('a'), zone('b'), zone('c'), zone('d')],
      edges: edges(['a', 'b'], ['a', 'c'], ['c', 'd']),
      endings: [
        { id: 'short', name: 'SHORT', zone: 'b' },
        { id: 'long', name: 'LONG', zone: 'd' },
      ],
    });
    expect(campaign.depths).toBe(3);
    expect(campaign.routes).toBe(2);
    expect(campaign.zones.map((z) => [z.depth, z.row, z.final])).toEqual([
      [0, 0, false],
      [1, 0, true],
      [1, 1, false],
      [2, 0, true],
    ]);
    expect(campaignRoutes(campaign)).toEqual([
      [0, 1],
      [0, 2, 3],
    ]);
  });

  it('keeps exits in edge order and rows in file order (they may differ)', () => {
    // The edges list the lower zone first; the rows follow the zones' file order.
    const campaign = valid({
      start: 's',
      zones: [zone('s'), zone('up'), zone('lo')],
      edges: edges(['s', 'lo'], ['s', 'up']),
      endings: [
        { id: 'up', name: 'UP', zone: 'up' },
        { id: 'lo', name: 'LO', zone: 'lo' },
      ],
    });
    expect(campaign.zones[0].exits).toEqual([2, 1]);
    expect(campaign.zones.map((z) => z.row)).toEqual([0, 0, 1]);
    // The routes follow the exits (the edge order), so the lower zone's comes first here.
    expect(campaignRoutes(campaign)).toEqual([
      [0, 2],
      [0, 1],
    ]);
    expect(campaign.name).toBe('ZONE MAP');
  });

  it('counts the routes of a wide map without listing them (4 exits per zone, 3 levels)', () => {
    // a → b1..b4 → c1..c4 (every b to every c) → d (the one final zone): 4 × 4 = 16 routes.
    const bs = ['b1', 'b2', 'b3', 'b4'];
    const cs = ['c1', 'c2', 'c3', 'c4'];
    const pairs: Array<[string, string]> = [];
    for (const b of bs) pairs.push(['a', b]);
    for (const b of bs) for (const c of cs) pairs.push([b, c]);
    for (const c of cs) pairs.push([c, 'd']);
    const campaign = valid({
      start: 'a',
      zones: [zone('a'), ...bs.map((id) => zone(id)), ...cs.map((id) => zone(id)), zone('d')],
      edges: edges(...pairs),
      endings: [{ id: 'd', name: 'D', zone: 'd' }],
    });
    expect(campaign.routes).toBe(16);
    expect(countCampaignRoutes(campaign)).toBe(16);
    expect(campaignRoutes(campaign)).toHaveLength(16);
    expect(campaign.depths).toBe(4);
    expect(campaign.zones.filter((z) => z.final).map((z) => z.id)).toEqual(['d']);
    expect(campaign.zones[0].exits).toHaveLength(MAX_ZONE_EXITS);
  });

  it('accepts exactly MAX_CAMPAIGN_ZONES zones and MAX_CAMPAIGN_ENDINGS endings', () => {
    // A chain of 32 zones; the last one final with 32 endings (31 conditional, 1 plain).
    const ids: string[] = [];
    for (let i = 0; i < MAX_CAMPAIGN_ZONES; i++) ids.push('z' + String(i));
    const pairs: Array<[string, string]> = [];
    for (let i = 1; i < ids.length; i++) pairs.push([ids[i - 1], ids[i]]);
    const last = ids[ids.length - 1];
    const endings: Array<Record<string, unknown>> = [];
    for (let i = 0; i < MAX_CAMPAIGN_ENDINGS - 1; i++) {
      endings.push({ id: 'e' + String(i), name: 'E', zone: last, all: ['bonus'] });
    }
    endings.push({ id: 'plain', name: 'PLAIN', zone: last });
    const campaign = valid({
      start: 'z0',
      zones: ids.map((id) => zone(id, { label: 'Z' })),
      edges: edges(...pairs),
      endings,
    });
    expect([campaign.zones.length, campaign.depths, campaign.routes]).toEqual([32, 32, 1]);
    // The first matching ending wins: every conditional one needs `bonus`.
    expect(selectCampaignEnding(campaign, 31, runFlagMask(['bonus']))?.id).toBe('e0');
    expect(selectCampaignEnding(campaign, 31, 0)?.id).toBe('plain');
  });
});

describe('core/data campaign edges: refusals (M2-10)', () => {
  it('refuses a map without a final zone (a two-zone loop) and an unknown `to`', () => {
    const loop = issuesOf({
      start: 'a',
      zones: [zone('a'), zone('b')],
      edges: edges(['a', 'b'], ['b', 'a']),
      endings: [{ id: 'a', name: 'A', zone: 'a' }],
    });
    expect(loop).toContainEqual({
      path: at('edges[1]'),
      message: 'must lead one level deeper (b is at depth 1, a at 0)',
    });
    expect(loop).toContainEqual({
      path: at('edges'),
      message: 'no final zone (a zone without exits)',
    });
    expect(loop).toContainEqual({
      path: at('endings[0].zone'),
      message: 'zone "a" is not a final zone',
    });
    const unknown = issuesOf({
      start: 'a',
      zones: [zone('a'), zone('b')],
      edges: edges(['a', 'b'], ['a', 'nowhere']),
      endings: [{ id: 'b', name: 'B', zone: 'b' }],
    });
    expect(unknown).toEqual([{ path: at('edges[1].to'), message: 'no zone "nowhere" in zones' }]);
  });

  it('needs an ending without any condition: a `none`-only ending does not cover its zone', () => {
    const issues = issuesOf({
      start: 'a',
      zones: [zone('a'), zone('b')],
      edges: edges(['a', 'b']),
      endings: [{ id: 'b', name: 'B', zone: 'b', none: ['bossEscaped'] }],
    });
    expect(issues).toEqual([
      {
        path: at('endings'),
        message: 'final zone "b" needs an ending without conditions (all / none)',
      },
    ]);
  });

  it('reports a missing start without inventing depth problems', () => {
    const issues = issuesOf({
      start: 'q',
      zones: [zone('a'), zone('b')],
      edges: edges(['a', 'b']),
      endings: [{ id: 'b', name: 'B', zone: 'b' }],
    });
    expect(issues).toEqual([{ path: at('start'), message: 'no zone "q" in zones' }]);
  });

  it('enforces the schema limits of zones, previews, endings, ids and labels', () => {
    const base = {
      start: 'a',
      zones: [zone('a'), zone('b')],
      edges: edges(['a', 'b']),
      endings: [{ id: 'b', name: 'B', zone: 'b' }],
    };
    const paths = (body: Record<string, unknown>): string[] => issuesOf(body).map((i) => i.path);
    // Too many zones (a chain of 33).
    const ids: string[] = [];
    for (let i = 0; i <= MAX_CAMPAIGN_ZONES; i++) ids.push('z' + String(i));
    const pairs: Array<[string, string]> = [];
    for (let i = 1; i < ids.length; i++) pairs.push([ids[i - 1], ids[i]]);
    expect(
      paths({
        start: 'z0',
        zones: ids.map((id) => zone(id, { label: 'Z' })),
        edges: edges(...pairs),
        endings: [{ id: 'end', name: 'END', zone: ids[ids.length - 1] }],
      }),
    ).toContain(at('zones'));
    // No zones at all, no endings at all.
    expect(paths({ ...base, zones: [], edges: [] })).toContain(at('zones'));
    expect(paths({ ...base, endings: [] })).toContain(at('endings'));
    // Too many endings.
    const many: Array<Record<string, unknown>> = [];
    for (let i = 0; i <= MAX_CAMPAIGN_ENDINGS; i++)
      many.push({ id: 'e' + String(i), name: 'E', zone: 'b' });
    expect(paths({ ...base, endings: many })).toContain(at('endings'));
    // Preview lines: exactly the maximum is fine, one more is not.
    const lines = ['ONE', 'TWO', 'THREE', 'FOUR'];
    expect(
      issuesOf({
        ...base,
        zones: [zone('a', { preview: lines.slice(0, MAX_ZONE_PREVIEW_LINES) }), zone('b')],
      }),
    ).toEqual([]);
    expect(paths({ ...base, zones: [zone('a', { preview: lines }), zone('b')] })).toContain(
      at('zones[0].preview'),
    );
    // A preview line over 40 characters.
    expect(
      paths({ ...base, zones: [zone('a', { preview: ['X'.repeat(41)] }), zone('b')] }),
    ).toContain(at('zones[0].preview[0]'));
    // Zone ids are lower-case kebab; labels one or two upper-case letters or digits.
    expect(paths({ ...base, zones: [zone('a'), zone('B')], edges: edges(['a', 'B']) })).toContain(
      at('zones[1].id'),
    );
    expect(paths({ ...base, zones: [zone('a', { label: 'ABC' }), zone('b')] })).toContain(
      at('zones[0].label'),
    );
    expect(paths({ ...base, zones: [zone('a', { label: '' }), zone('b')] })).toContain(
      at('zones[0].label'),
    );
    expect(
      issuesOf({ ...base, zones: [zone('a', { label: '9' }), zone('b', { label: 'B2' })] }),
    ).toEqual([]);
    // A flag listed twice in `all` is fine (the mask is the same); an unknown one is not.
    expect(
      issuesOf({
        ...base,
        endings: [
          { id: 'b', name: 'B', zone: 'b' },
          { id: 'b2', name: 'B', zone: 'b', all: ['bonus', 'bonus'] },
        ],
      }),
    ).toEqual([]);
  });
});

describe('core/data campaign edges: completeCampaign and the helpers (M2-10)', () => {
  it('completes a parsed document in place and reports through the caller`s path builder', () => {
    const parsed: Record<string, unknown> = {
      id: 'x',
      start: 'a',
      zones: [
        { id: 'a', label: 'A', name: 'A', stage: 's' },
        { id: 'b', label: 'B', name: 'B', stage: 's', preview: ['HI.'] },
      ],
      edges: [{ from: 'a', to: 'b' }],
      endings: [
        { id: 'b', name: 'B', zone: 'b', all: ['noDeath'] },
        { id: 'b2', name: 'B', zone: 'b' },
      ],
    };
    const issues: ValidationIssue[] = [];
    const campaign = completeCampaign(parsed, (path) => 'here:' + path, issues);
    expect(issues).toEqual([]);
    expect(campaign).toBe(parsed as unknown as CampaignSpec);
    expect(campaign?.edges[0]).toMatchObject({ fromIndex: 0, toIndex: 1 });
    expect(campaign?.endings[0]).toMatchObject({
      zoneIndex: 1,
      allMask: 0b10,
      noneMask: 0,
      none: [],
    });
    expect(campaign?.zones[0].preview).toEqual([]);
    expect(campaign?.zones[1].preview).toEqual(['HI.']);
    const broken: Record<string, unknown> = {
      id: 'x',
      start: 'a',
      zones: [{ id: 'a', label: 'A', name: 'A', stage: 's' }],
      edges: [{ from: 'a', to: 'a' }],
      endings: [{ id: 'a', name: 'A', zone: 'a' }],
    };
    const more: ValidationIssue[] = [];
    expect(completeCampaign(broken, (path) => 'here:' + path, more)).toBeNull();
    expect(more).toEqual([{ path: 'here:edges[0]', message: 'a zone cannot lead to itself' }]);
  });

  it('runFlagMask: empty, repeated and unknown names; bit i is RUN_FLAG_NAMES[i]', () => {
    expect(runFlagMask([])).toBe(0);
    expect(runFlagMask(['bonus', 'bonus'])).toBe(0b1000);
    expect(runFlagMask(['lucky', ''])).toBe(0);
    for (let i = 0; i < RUN_FLAG_NAMES.length; i++) {
      expect(runFlagMask([RUN_FLAG_NAMES[i]])).toBe(1 << i);
    }
    expect(runFlagMask([...RUN_FLAG_NAMES])).toBe(0b1111);
  });

  it('selectCampaignEnding: the first match in file order, null for zones without endings', () => {
    const campaign = valid({
      start: 'a',
      zones: [zone('a'), zone('b')],
      edges: edges(['a', 'b']),
      endings: [
        { id: 'plain-first', name: 'P', zone: 'b' },
        { id: 'never', name: 'N', zone: 'b', all: ['noDeath'] },
      ],
    });
    // The unconditional ending comes first: it always wins.
    expect(selectCampaignEnding(campaign, 1, runFlagMask(['noDeath']))?.id).toBe('plain-first');
    expect(selectCampaignEnding(campaign, 0, 0)).toBeNull();
    expect(selectCampaignEnding(campaign, -1, 0)).toBeNull();
    expect(selectCampaignEnding(campaign, 7, 0)).toBeNull();
    // Bits beyond the known flags change nothing.
    expect(selectCampaignEnding(campaign, 1, 0xff00)?.id).toBe('plain-first');
    expect(campaignZoneIndex(campaign, '')).toBe(-1);
  });
});

describe('core/data campaign edges: the shipped endings (M2-10)', () => {
  /** The shipped campaign on stand-in stages named like the zones'. */
  const shipped = ((): CampaignSpec => {
    const data = JSON.parse(
      readFileSync(
        new URL('../../../../content/campaign/main.campaign.json', import.meta.url),
        'utf8',
      ),
    ) as { zones: Array<{ stage: string; escape?: string }> };
    const ids = new Set<string>(data.zones.map((z) => z.stage));
    // M3-02: the final zones' escape stage is a stage of its own.
    for (const zone of data.zones) if (zone.escape !== undefined) ids.add(zone.escape);
    const stages: ContentFile[] = [...ids].map((id) => ({
      path: `stages/${id}.stage.json`,
      data: { ...(STAGE.data as Record<string, unknown>), id },
    }));
    const { db, issues } = loadContent([{ path: 'campaign/main.campaign.json', data }, ...stages]);
    expect(issues).toEqual([]);
    if (db.campaign === null) throw new Error('no campaign');
    return db.campaign;
  })();

  it('picks an ending for both final zones under every combination of run flags', () => {
    const h = campaignZoneIndex(shipped, 'h');
    const i = campaignZoneIndex(shipped, 'i');
    const noDeath = runFlagMask(['noDeath']);
    const escaped = runFlagMask(['bossEscaped']);
    for (let flags = 0; flags < 1 << RUN_FLAG_NAMES.length; flags++) {
      const atH = selectCampaignEnding(shipped, h, flags)?.id;
      const atI = selectCampaignEnding(shipped, i, flags)?.id;
      expect(atH, 'flags ' + String(flags)).toBe(
        (flags & noDeath) !== 0 ? 'citadel-flawless' : 'citadel',
      );
      // An escaped boss beats a flawless run: the flawless epilogue has the Hollow King sink with
      // its ARK, so it excludes `bossEscaped` (the escape scene still draws the dawn of a flawless run).
      expect(atI, 'flags ' + String(flags)).toBe(
        (flags & escaped) !== 0
          ? 'throne-escape'
          : (flags & noDeath) !== 0
            ? 'throne-flawless'
            : 'throne',
      );
    }
    // No other zone ends a run.
    for (let z = 0; z < shipped.zones.length; z++) {
      if (z === h || z === i) continue;
      expect(selectCampaignEnding(shipped, z, 0)).toBeNull();
    }
  });

  it('lays every route out as five zones, one per depth, each ending in H or I', () => {
    const routes = campaignRoutes(shipped);
    expect(routes).toHaveLength(16);
    const labels = new Set<string>();
    for (const route of routes) {
      expect(route.map((z) => shipped.zones[z].depth)).toEqual([0, 1, 2, 3, 4]);
      labels.add(route.map((z) => shipped.zones[z].label).join(''));
      expect(['H', 'I']).toContain(shipped.zones[route[4]].label);
    }
    expect(labels.size).toBe(16);
    // Every zone of a depth is reachable from every zone of the depth before (the diamond).
    for (const z of shipped.zones) {
      if (z.final) continue;
      expect(z.exits.map((e) => shipped.zones[e].depth)).toEqual([z.depth + 1, z.depth + 1]);
    }
  });
});

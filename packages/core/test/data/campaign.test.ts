/**
 * The M2-10 `campaign` kind of `core/data` (`data/campaign.ts`): the zone map's graph validation
 * (every route reaches a final zone), the derived depths / rows / exits / route count, the
 * endings and their selection hook, and the stage references of the zones.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_ZONE_EXITS,
  RUN_FLAG_NAMES,
  campaignRoutes,
  campaignZoneIndex,
  countCampaignRoutes,
  loadContent,
  runFlagMask,
  selectCampaignEnding,
  type ContentFile,
  type ValidationIssue,
} from '../../src/data/index.js';

/**
 * A minimal stage file.
 *
 * @param id - Stage id.
 * @param type - Stage type (default `normal`).
 * @returns The file.
 */
function stage(id: string, type = 'normal'): ContentFile {
  return {
    path: `stages/${id}.stage.json`,
    data: {
      formatVersion: 1,
      kind: 'stage',
      id,
      name: id.toUpperCase(),
      ...(type === 'normal' ? {} : { type }),
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

/** The diamond of decision D9: zones a … i, 16 routes. */
const DIAMOND = {
  formatVersion: 1,
  kind: 'campaign',
  id: 'main',
  start: 'a',
  zones: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id) => ({
    id,
    label: id.toUpperCase(),
    name: 'ZONE ' + id.toUpperCase(),
    stage: 's-' + id,
  })),
  edges: [
    ['a', 'b'],
    ['a', 'c'],
    ['b', 'd'],
    ['b', 'e'],
    ['c', 'd'],
    ['c', 'e'],
    ['d', 'f'],
    ['d', 'g'],
    ['e', 'f'],
    ['e', 'g'],
    ['f', 'h'],
    ['f', 'i'],
    ['g', 'h'],
    ['g', 'i'],
  ].map(([from, to]) => ({ from, to })),
  endings: [
    { id: 'h-perfect', name: 'H PERFECT', zone: 'h', all: ['noDeath', 'noContinue'] },
    { id: 'h', name: 'H', zone: 'h' },
    { id: 'i-escape', name: 'I ESCAPE', zone: 'i', all: ['bossEscaped'] },
    { id: 'i-bonus', name: 'I BONUS', zone: 'i', all: ['bonus'], none: ['bossEscaped'] },
    { id: 'i', name: 'I', zone: 'i' },
  ],
};

/** Every stage the diamond names. */
const STAGES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id) => stage('s-' + id));

/**
 * Loads a campaign body with the diamond's stages.
 *
 * @param body - Fields over {@link DIAMOND}.
 * @param extra - More files.
 * @returns The load result.
 */
function load(
  body: Record<string, unknown> = {},
  extra: ContentFile[] = [],
): ReturnType<typeof loadContent> {
  return loadContent([
    { path: 'campaign/main.campaign.json', data: { ...DIAMOND, ...body } },
    ...STAGES,
    ...extra,
  ]);
}

/**
 * The issues of a campaign body.
 *
 * @param body - Fields over {@link DIAMOND}.
 * @returns The issues.
 */
function issuesOf(body: Record<string, unknown>): ValidationIssue[] {
  return [...load(body).issues];
}

describe('core/data campaign (M2-10)', () => {
  it('loads the diamond: depths, rows, exits, finals, 16 routes, resolved stages', () => {
    const { db, issues } = load();
    expect(issues).toEqual([]);
    const campaign = db.campaign;
    expect(campaign).not.toBeNull();
    if (campaign === null) return;
    expect(campaign.name).toBe('ZONE MAP');
    expect(campaign.startIndex).toBe(0);
    expect(campaign.depths).toBe(5);
    expect(campaign.routes).toBe(16);
    expect(countCampaignRoutes(campaign)).toBe(16);
    expect(campaign.zones.map((z) => z.depth)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(campaign.zones.map((z) => z.row)).toEqual([0, 0, 1, 0, 1, 0, 1, 0, 1]);
    expect(campaign.zones.map((z) => z.final)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
    expect(campaign.zones[0].exits).toEqual([1, 2]);
    expect(campaign.zones[4].exits).toEqual([5, 6]);
    expect(campaign.zones.map((z) => db.stages[z.stageId].id)).toEqual(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id) => 's-' + id),
    );
    expect(campaign.zones[0].preview).toEqual([]);
    expect(campaign.edges[3]).toMatchObject({ from: 'b', to: 'e', fromIndex: 1, toIndex: 4 });
    expect(campaignZoneIndex(campaign, 'g')).toBe(6);
    expect(campaignZoneIndex(campaign, 'z')).toBe(-1);
  });

  it('lists every route from the start to a final zone, top route first', () => {
    const campaign = load().db.campaign;
    if (campaign === null) throw new Error('no campaign');
    const routes = campaignRoutes(campaign);
    expect(routes).toHaveLength(16);
    const labels = routes.map((r) => r.map((z) => campaign.zones[z].label).join(''));
    expect(labels[0]).toBe('ABDFH');
    expect(labels[15]).toBe('ACEGI');
    expect(new Set(labels).size).toBe(16);
    for (const route of routes) {
      expect(route).toHaveLength(5);
      expect(campaign.zones[route[4]].final).toBe(true);
    }
  });

  it('selects the first matching ending of the final zone (the ending hook)', () => {
    const campaign = load().db.campaign;
    if (campaign === null) throw new Error('no campaign');
    const h = campaignZoneIndex(campaign, 'h');
    const i = campaignZoneIndex(campaign, 'i');
    expect(RUN_FLAG_NAMES).toEqual(['bossEscaped', 'noDeath', 'noContinue', 'bonus']);
    expect(runFlagMask(['noDeath', 'bonus', 'nope'])).toBe(0b1010);
    expect(selectCampaignEnding(campaign, h, 0)?.id).toBe('h');
    expect(selectCampaignEnding(campaign, h, runFlagMask(['noDeath']))?.id).toBe('h');
    expect(selectCampaignEnding(campaign, h, runFlagMask(['noDeath', 'noContinue']))?.id).toBe(
      'h-perfect',
    );
    expect(selectCampaignEnding(campaign, i, runFlagMask(['bossEscaped', 'bonus']))?.id).toBe(
      'i-escape',
    );
    expect(selectCampaignEnding(campaign, i, runFlagMask(['bonus']))?.id).toBe('i-bonus');
    expect(selectCampaignEnding(campaign, i, 0)?.id).toBe('i');
    // Not a final zone: no ending.
    expect(selectCampaignEnding(campaign, 0, 0)).toBeNull();
    const ending = campaign.endings[3];
    expect([ending.allMask, ending.noneMask]).toEqual([0b1000, 0b0001]);
  });

  it('refuses a missing start, unknown zones in edges, self-loops and duplicate edges', () => {
    const at = (path: string) => 'campaign/main.campaign.json:' + path;
    expect(issuesOf({ start: 'x' })).toContainEqual({
      path: at('start'),
      message: 'no zone "x" in zones',
    });
    const edges = [...DIAMOND.edges];
    expect(issuesOf({ edges: [...edges, { from: 'q', to: 'b' }] })).toContainEqual({
      path: at('edges[14].from'),
      message: 'no zone "q" in zones',
    });
    expect(issuesOf({ edges: [...edges, { from: 'b', to: 'b' }] })).toContainEqual({
      path: at('edges[14]'),
      message: 'a zone cannot lead to itself',
    });
    expect(issuesOf({ edges: [...edges, { from: 'a', to: 'b' }] })).toContainEqual({
      path: at('edges[14]'),
      message: 'duplicate edge a → b',
    });
    const zones = [...DIAMOND.zones, { ...DIAMOND.zones[1] }];
    expect(issuesOf({ zones })).toContainEqual({
      path: at('zones[9].id'),
      message: 'duplicate zone "b"',
    });
  });

  it('refuses unreachable zones, skipped levels, backward edges (cycles) and too many exits', () => {
    const at = (path: string) => 'campaign/main.campaign.json:' + path;
    const extra = { id: 'z', label: 'Z', name: 'Z', stage: 's-a' };
    expect(issuesOf({ zones: [...DIAMOND.zones, extra] })).toContainEqual({
      path: at('zones[9].id'),
      message: 'cannot be reached from the start',
    });
    // A shortcut a → d puts d one level up (depths are shortest distances): the edges that led
    // to d from b and c no longer go one level deeper.
    const skipped = issuesOf({ edges: [...DIAMOND.edges, { from: 'a', to: 'd' }] });
    expect(skipped).toContainEqual({
      path: at('edges[2]'),
      message: 'must lead one level deeper (b is at depth 1, d at 1)',
    });
    expect(skipped.length).toBeGreaterThan(0);
    expect(issuesOf({ edges: [...DIAMOND.edges, { from: 'h', to: 'a' }] })).toContainEqual({
      path: at('edges[14]'),
      message: 'must lead one level deeper (h is at depth 4, a at 0)',
    });
    const fan = ['p', 'q', 'r', 's', 't'].map((id) => ({
      id,
      label: id.toUpperCase(),
      name: id,
      stage: 's-b',
    }));
    const issues = issuesOf({
      zones: [DIAMOND.zones[0], ...fan],
      edges: fan.map((z) => ({ from: 'a', to: z.id })),
      endings: fan.map((z) => ({ id: z.id, name: z.id, zone: z.id })),
    });
    expect(issues).toContainEqual({
      path: at('edges[' + String(MAX_ZONE_EXITS) + ']'),
      message: 'zone "a" has more than 4 exits',
    });
  });

  it('checks the endings: final zones only, one without conditions each, unique ids', () => {
    const at = (path: string) => 'campaign/main.campaign.json:' + path;
    expect(
      issuesOf({ endings: [...DIAMOND.endings, { id: 'b', name: 'B', zone: 'b' }] }),
    ).toContainEqual({ path: at('endings[5].zone'), message: 'zone "b" is not a final zone' });
    expect(issuesOf({ endings: DIAMOND.endings.filter((e) => e.id !== 'h') })).toContainEqual({
      path: at('endings'),
      message: 'final zone "h" needs an ending without conditions (all / none)',
    });
    expect(
      issuesOf({ endings: [...DIAMOND.endings, { id: 'h', name: 'H2', zone: 'h' }] }),
    ).toContainEqual({ path: at('endings[5].id'), message: 'duplicate ending "h"' });
    expect(
      issuesOf({
        endings: [
          ...DIAMOND.endings,
          { id: 'x', name: 'X', zone: 'i', all: ['bonus'], none: ['bonus'] },
        ],
      }),
    ).toContainEqual({
      path: at('endings[5]'),
      message: 'a flag cannot be both required (all) and excluded (none)',
    });
    expect(
      issuesOf({ endings: [...DIAMOND.endings, { id: 'q', name: 'Q', zone: 'q' }] }),
    ).toContainEqual({
      path: at('endings[5].zone'),
      message: 'no zone "q" in zones',
    });
  });

  it('checks the file shape: labels, flag names, unknown fields', () => {
    const at = (path: string) => 'campaign/main.campaign.json:' + path;
    const zones = DIAMOND.zones.map((z, i) => (i === 1 ? { ...z, label: 'bb' } : z));
    expect(issuesOf({ zones })[0].path).toBe(at('zones[1].label'));
    const endings = [{ id: 'h', name: 'H', zone: 'h', all: ['lucky'] }, DIAMOND.endings[4]];
    expect(issuesOf({ endings })[0].path).toBe(at('endings[0].all[0]'));
    expect(issuesOf({ extra: 1 })).toEqual([{ path: at('extra'), message: 'unknown field' }]);
  });

  it('allows one campaign only and needs every zone stage to be a playable, known stage', () => {
    const second: ContentFile = {
      path: 'campaign/second.campaign.json',
      data: { ...DIAMOND, id: 'second' },
    };
    const issues = [...load({}, [second]).issues];
    expect(issues).toEqual([
      {
        path: 'campaign/second.campaign.json:id',
        message: 'the campaign is already defined by another file',
      },
    ]);
    const bonusZone = DIAMOND.zones.map((z) => (z.id === 'c' ? { ...z, stage: 'vault' } : z));
    expect([...load({ zones: bonusZone }, [stage('vault', 'bonus')]).issues]).toEqual([
      {
        path: 'campaign/main.campaign.json:zones[2].stage',
        message: 'is a bonus stage: a zone plays a normal or bossRush stage',
      },
    ]);
    const unknown = DIAMOND.zones.map((z) => (z.id === 'c' ? { ...z, stage: 'nowhere' } : z));
    expect(load({ zones: unknown }).issues.map((i) => i.path)).toEqual([
      'campaign/main.campaign.json:zones[2].stage',
    ]);
  });
});

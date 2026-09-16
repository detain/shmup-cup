/**
 * The final zone's **escape sequence** of plan M3-02 (shmup_feat.md §14 "[P2] escape sequence
 * (collapsing, fast-scrolling maze after the final boss)"): a zone's optional `escape` stage
 * (`CampaignZoneSpec.escape` / `escapeId`).
 *
 * The loader's rules are checked here — the default for a zone without one, the resolved stage
 * index, the unknown stage id, and the rule that **only a final zone** may name one — plus the
 * `RunState` fields the flow sets (`inEscape` / `escapeStage`) and `runWorldConfig`, which plays
 * the escape stage in place of the zone's and drops the caravan clock for it.
 */
import { describe, expect, it } from 'vitest';
import { loadContent, type ContentFile } from '../../src/data/index.js';
import { DEFAULT_GAME_CONFIG, resolveGameConfig } from '../../src/config/index.js';
import { RunState, runWorldConfig } from '../../src/scenes/run.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { shipped, stage } from '../helpers/campaign.js';

/**
 * A campaign file: S → U | L, with fields patched onto its zones by id.
 *
 * @param patch - Extra fields per zone id.
 * @returns The file.
 */
function campaign(patch: Readonly<Record<string, Record<string, unknown>>> = {}): ContentFile {
  return {
    path: 'campaign/test.campaign.json',
    data: {
      formatVersion: 1,
      kind: 'campaign',
      id: 'test',
      name: 'TEST MAP',
      start: 's',
      zones: [
        { id: 's', label: 'S', name: 'START ZONE', stage: 't-s', ...patch.s },
        { id: 'u', label: 'U', name: 'UPPER ZONE', stage: 't-u', ...patch.u },
        { id: 'l', label: 'L', name: 'LOWER ZONE', stage: 't-l', ...patch.l },
      ],
      edges: [
        { from: 's', to: 'u' },
        { from: 's', to: 'l' },
      ],
      endings: [
        { id: 'u', name: 'UPPER END', zone: 'u' },
        { id: 'l', name: 'LOWER END', zone: 'l' },
      ],
    },
  };
}

/**
 * Loads a campaign with the test stages plus an escape stage.
 *
 * @param patch - Extra zone fields.
 * @returns The load result.
 */
function load(patch: Readonly<Record<string, Record<string, unknown>>> = {}) {
  return loadContent(
    [
      shipped('player/kestrel.player.json'),
      campaign(patch),
      stage('t-s'),
      stage('t-u'),
      stage('t-l'),
      stage('t-escape'),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
}

describe('core/data — a zone`s escape stage (M3-02)', () => {
  it('defaults to none on every zone', () => {
    const { db, issues } = load();
    expect(issues).toEqual([]);
    expect(db.campaign?.zones).toHaveLength(3);
    for (const zone of db.campaign?.zones ?? []) {
      expect(zone.escape).toBe('');
      expect(zone.escapeId).toBe(-1);
    }
  });

  it('resolves the named stage to its index on a final zone', () => {
    const { db, issues } = load({ u: { escape: 't-escape' } });
    expect(issues).toEqual([]);
    const zones = db.campaign?.zones ?? [];
    expect(zones).toHaveLength(3);
    const upper = zones.find((z) => z.id === 'u');
    expect(upper?.final).toBe(true);
    expect(upper?.escape).toBe('t-escape');
    expect(upper?.escapeId).toBeGreaterThanOrEqual(0);
    expect(db.stages[upper?.escapeId ?? -1].id).toBe('t-escape');
    // The other final zone still has none.
    expect(zones.find((z) => z.id === 'l')?.escapeId).toBe(-1);
  });

  it('rejects one on a zone that still has exits', () => {
    const { issues } = load({ s: { escape: 't-escape' } });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe('only a final zone may name an escape stage');
    expect(issues[0].path).toContain('escape');
  });

  it('rejects an escape stage the content does not have', () => {
    const { issues } = load({ u: { escape: 'nowhere' } });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.message.includes('nowhere'))).toBe(true);
  });

  it('the shipped campaign gives both final zones an escape and no other zone one', () => {
    const { db, issues } = loadContent(
      [
        shipped('player/kestrel.player.json'),
        shipped('campaign/main.campaign.json'),
        ...[
          'zone-a',
          'zone-b',
          'zone-c',
          'zone-d',
          'zone-e',
          'zone-f',
          'zone-g',
          'zone-h',
          'zone-i',
          'escape',
        ].map((id) => shipped(`stages/${id}.stage.json`)),
      ],
      { extraSprites: ENGINE_SPRITES },
    );
    const zones = db.campaign?.zones ?? [];
    expect(zones.length).toBeGreaterThanOrEqual(9);
    for (const zone of zones) {
      if (zone.final) {
        expect(zone.escape).toBe('escape');
        expect(zone.escapeId).toBeGreaterThanOrEqual(0);
      } else {
        expect(zone.escape).toBe('');
      }
    }
    expect(zones.filter((z) => z.final)).toHaveLength(2);
    expect(issues.filter((i) => i.message.includes('escape'))).toEqual([]);
  });
});

describe('core/scenes — the run state during an escape (M3-02)', () => {
  it('plays the escape stage in place of the zone`s, without a caravan clock', () => {
    const base = resolveGameConfig({ stage: 't-u', timeLimit: 3600 });
    const run = new RunState();
    run.stage = 't-u';
    run.timeLimit = 3600;
    expect(runWorldConfig(base, run).stage).toBe('t-u');
    run.inEscape = true;
    run.escapeStage = 't-escape';
    const config = runWorldConfig(base, run);
    expect(config.stage).toBe('t-escape');
    expect(config.timeLimit).toBe(0);
  });

  it('a bonus stage still wins nothing from it, and leaving one closes the escape', () => {
    const base = resolveGameConfig({ stage: 't-u' });
    const run = new RunState();
    run.stage = 't-u';
    run.inEscape = true;
    run.escapeStage = 't-escape';
    // The escape takes precedence over a bonus stage that was never entered.
    expect(runWorldConfig(base, run).stage).toBe('t-escape');
    run.leaveBonus(false);
    expect(run.inEscape).toBe(false);
    expect(run.escapeStage).toBeNull();
    expect(runWorldConfig(base, run).stage).toBe('t-u');
  });

  it('keeps the base config object when nothing changed', () => {
    const run = new RunState();
    run.stage = DEFAULT_GAME_CONFIG.stage;
    expect(runWorldConfig(DEFAULT_GAME_CONFIG, run)).toBe(DEFAULT_GAME_CONFIG);
  });
});

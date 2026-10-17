/**
 * The v1 baseline (plan_resolution.md R2-02 prep): the committed
 * `test/fixtures/v1-baseline/<id>.baseline.json` files — one per scenario of `v1-baseline.ts`,
 * every shipped stage flown by the 4-way bot with god mode — are complete and consistent, and,
 * while the engine still runs the frame they were recorded at, the stages other than the zones
 * re-run to them **byte for byte** (the zones: `v1-baseline-zones.test.ts` and
 * `v1-baseline-loop2.test.ts`), so no R1 refactor can shift what the v1 game does on the clock and
 * on the screen before R2-02 compares the ×1.5 port against it.
 *
 * Once the frame constants change (R2-01: 640×360) the files are the frozen v1 record: the re-runs
 * are skipped and re-recording is refused; comparing a v2 run with them by the rules of
 * `test/fixtures/v1-baseline/README.md` is R2-02's test.
 *
 * Re-recording (an intended simulation change before R2-01 only — say why in the commit):
 * `SHMUP_V1_BASELINE_UPDATE=1 pnpm exec vitest run --project integration test/golden/v1-baseline`.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_TICKS, shippedContent } from '../playtest/harness.js';
import {
  BASELINE_FORMAT_VERSION,
  BASELINE_GROUPS,
  BASELINE_SCENARIOS,
  BASELINE_UPDATE_ENV,
  BOSS_COLUMNS,
  ENEMY_COLUMNS,
  EVENT_COLUMNS,
  SPEC_COLUMNS,
  readBaseline,
  sameFrame,
} from './v1-baseline.js';
import {
  atRecordedFrame,
  committedFrame,
  describeBaselineReruns,
  updating,
} from './v1-baseline-suite.js';

describe('v1 baseline (test/fixtures/v1-baseline, R2-02 prep)', () => {
  it('covers every shipped stage, and every zone on loop 2 too', () => {
    const db = shippedContent();
    const stages = new Set(BASELINE_SCENARIOS.map((s) => s.stageId));
    expect([...stages].sort()).toEqual(db.stages.map((stage) => stage.id).sort());
    const ids = BASELINE_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const zones = db.campaign?.zones.map((zone) => zone.stage) ?? [];
    expect(zones.length).toBeGreaterThan(0);
    for (const zone of zones) expect(ids).toContain(`${zone}-loop2`);
    // The three re-run files share the scenarios out between them, each exactly once.
    const grouped = [...BASELINE_GROUPS.zones, ...BASELINE_GROUPS.loop2, ...BASELINE_GROUPS.stages];
    expect(grouped.map((s) => s.id).sort()).toEqual([...ids].sort());
  });

  it('tells the recorded frame from any other', () => {
    if (committedFrame === null) return; // nothing recorded yet (the first recording)
    expect(sameFrame({ ...committedFrame })).toBe(atRecordedFrame);
    expect(sameFrame({ ...committedFrame, width: committedFrame.width + 1 })).toBe(false);
    expect(sameFrame({ ...committedFrame, tileSize: committedFrame.tileSize + 1 })).toBe(false);
  });

  it('has one consistent file per scenario, all in the recorded frame`s pixels', () => {
    if (updating && atRecordedFrame) return; // the re-runs write them first
    for (const scenario of BASELINE_SCENARIOS) {
      const baseline = readBaseline(scenario.id);
      expect(baseline.formatVersion).toBe(BASELINE_FORMAT_VERSION);
      expect(baseline.id).toBe(scenario.id);
      expect(baseline.stage).toBe(scenario.stageId);
      expect(baseline.config).toEqual(scenario.config);
      expect(baseline.golden).toBe(scenario.golden);
      expect(baseline.startX).toBe(scenario.startX);
      expect(baseline.frame).toEqual(committedFrame);
      expect(baseline.run.godMode).toBe(true);
      expect(baseline.run.maxTicks).toBe(scenario.maxTicks);
      if (scenario.maxTicks === DEFAULT_MAX_TICKS) {
        // The run covers its whole stage: the bot reaches the stage clear.
        expect(baseline.run.status, scenario.id).toBe('stageClear');
        expect(baseline.run.clearTicks, scenario.id).toBe(baseline.run.ticks);
      } else {
        // A stage the bot cannot finish (the dimension) plays to its own limit.
        expect(baseline.run.status, scenario.id).toBe('playing');
        expect(baseline.run.ticks, scenario.id).toBe(scenario.maxTicks);
      }
      expect(baseline.enemyColumns).toEqual(ENEMY_COLUMNS);
      expect(baseline.bossColumns).toEqual(BOSS_COLUMNS);
      expect(baseline.specColumns).toEqual(SPEC_COLUMNS);
      expect(baseline.eventColumns).toEqual(EVENT_COLUMNS);
      for (const row of baseline.events) expect(row).toHaveLength(EVENT_COLUMNS.length);
      const spec = ENEMY_COLUMNS.indexOf('spec');
      const event = ENEMY_COLUMNS.indexOf('event');
      for (const row of baseline.enemies) {
        expect(row).toHaveLength(ENEMY_COLUMNS.length);
        expect(row[spec] as number).toBeLessThan(baseline.specs.length);
        // A timeline enemy names the `spawn` or `formation` event that brought it.
        const index = row[event] as number;
        if (index >= 0) expect(['spawn', 'formation']).toContain(baseline.events[index][0]);
      }
      for (const row of baseline.bosses) expect(row).toHaveLength(BOSS_COLUMNS.length);
    }
  });

  describeBaselineReruns('the other stages, while the engine runs the recorded frame', [
    ...BASELINE_GROUPS.stages,
  ]);

  describe.skipIf(atRecordedFrame)('after the frame changed (R2-01 on)', () => {
    it('is the frozen v1 record: never re-recorded at another frame', () => {
      // R2-02 compares a v2 run with these files by the README's rules; nothing re-records them.
      expect(updating, `${BASELINE_UPDATE_ENV}=1 must not re-record at another frame`).toBe(false);
    });
  });
});

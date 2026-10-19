/**
 * The TV render bench's campaign mode (R0-03): the build's config, the stored campaign, the guard
 * that skips a scenario which keeps crashing the TV, what the results page does next, and the run
 * state's skip / resume.
 */
import { describe, expect, it } from 'vitest';
import {
  BENCH_CAMPAIGN_KEY,
  BENCH_CAMPAIGN_VERSION,
  BENCH_RUN_LENGTH,
  DEFAULT_CAMPAIGN_PAUSE_S,
  MAX_SCENARIO_ATTEMPTS,
  TV_BENCH_TIMING,
  campaignFor,
  campaignStatus,
  campaignStep,
  createCampaign,
  createRunState,
  noteScenarioLaunch,
  parseCampaign,
  parseCampaignConfig,
  resumeRun,
  serializeCampaign,
  skipScenario,
  startPass,
  stopRun,
  type BenchCampaignConfig,
  type BenchRunState,
} from '../../src/bench/index.js';

/** A two-pass config. */
const CONFIG: BenchCampaignConfig = { passes: [1, 2], pauseMs: 30_000 };

/**
 * A run of session `session` with its cursor at `cursor`.
 *
 * @param session - Session id.
 * @param cursor - Cursor.
 * @param running - Whether it is running.
 * @returns The state.
 */
const runAt = (session: string, cursor: number, running = true): BenchRunState => ({
  ...createRunState(session, 1, 1, TV_BENCH_TIMING),
  cursor,
  running,
});

describe('bench campaign config', () => {
  it('parses the passes and the pause', () => {
    expect(parseCampaignConfig('1,2,1,2', '30')).toEqual({ passes: [1, 2, 1, 2], pauseMs: 30_000 });
    expect(parseCampaignConfig(' 2 , 1 ', '1.5')).toEqual({ passes: [2, 1], pauseMs: 1500 });
  });

  it('is no campaign for an empty or invalid list', () => {
    expect(parseCampaignConfig('', '30')).toBeNull();
    expect(parseCampaignConfig('  ', '30')).toBeNull();
    expect(parseCampaignConfig('1,3', '30')).toBeNull();
    expect(parseCampaignConfig('1,,2', '30')).toBeNull();
    expect(parseCampaignConfig('gl2', '30')).toBeNull();
  });

  it('defaults a missing pause and clamps a negative one', () => {
    expect(parseCampaignConfig('1', '')?.pauseMs).toBe(DEFAULT_CAMPAIGN_PAUSE_S * 1000);
    expect(parseCampaignConfig('1', 'soon')?.pauseMs).toBe(DEFAULT_CAMPAIGN_PAUSE_S * 1000);
    expect(parseCampaignConfig('1', '-5')?.pauseMs).toBe(0);
    expect(parseCampaignConfig('1', '0')?.pauseMs).toBe(0);
  });
});

describe('bench campaign state', () => {
  it('starts fresh under its own storage key', () => {
    expect(BENCH_CAMPAIGN_KEY).toBe('shmup-cup:render-bench-campaign');
    expect(createCampaign(CONFIG, 'b1')).toEqual({
      version: BENCH_CAMPAIGN_VERSION,
      buildId: 'b1',
      passes: [1, 2],
      next: 0,
      sessions: [],
      attempt: null,
    });
  });

  it('round-trips through JSON and rejects anything off', () => {
    const campaign = noteScenarioLaunch(
      startPass(createCampaign(CONFIG, 'b1'), 'rb-a'),
      runAt('rb-a', 4),
    ).campaign;
    expect(parseCampaign(serializeCampaign(campaign))).toEqual(campaign);
    expect(parseCampaign(null)).toBeNull();
    expect(parseCampaign('')).toBeNull();
    expect(parseCampaign('{')).toBeNull();
    expect(parseCampaign('[]')).toBeNull();
    const text = (patch: Record<string, unknown>): string =>
      JSON.stringify({ ...campaign, ...patch });
    expect(parseCampaign(text({ version: 99 }))).toBeNull();
    expect(parseCampaign(text({ passes: [1, 3] }))).toBeNull();
    expect(parseCampaign(text({ passes: [] }))).toBeNull();
    expect(parseCampaign(text({ next: 2 }))).toBeNull();
    expect(parseCampaign(text({ next: 1.5 }))).toBeNull();
    expect(parseCampaign(text({ sessions: [7] }))).toBeNull();
    expect(parseCampaign(text({ attempt: { session: 'rb-a', cursor: -1, count: 1 } }))).toBeNull();
    expect(parseCampaign(text({ attempt: undefined }))?.attempt).toBeNull();
  });

  it('keeps the stored campaign only for the same build and passes', () => {
    const stored = startPass(createCampaign(CONFIG, 'b1'), 'rb-a');
    expect(campaignFor(stored, CONFIG, 'b1')).toBe(stored);
    expect(campaignFor(stored, CONFIG, 'b2')).toEqual(createCampaign(CONFIG, 'b2'));
    expect(campaignFor(stored, { passes: [2, 1], pauseMs: 0 }, 'b1').next).toBe(0);
    expect(campaignFor(stored, { passes: [1, 2, 1], pauseMs: 0 }, 'b1').next).toBe(0);
    expect(campaignFor(null, CONFIG, 'b1')).toEqual(createCampaign(CONFIG, 'b1'));
  });

  it('starts a pass: one further on, the session kept, no launch counted', () => {
    const counted = noteScenarioLaunch(
      startPass(createCampaign(CONFIG, 'b1'), 'rb-a'),
      runAt('rb-a', 0),
    ).campaign;
    const next = startPass(counted, 'rb-b');
    expect(next.next).toBe(2);
    expect(next.sessions).toEqual(['rb-a', 'rb-b']);
    expect(next.attempt).toBeNull();
  });
});

describe('bench campaign launch guard', () => {
  it(`skips a scenario launched more than ${MAX_SCENARIO_ATTEMPTS} times in a row`, () => {
    let campaign = startPass(createCampaign(CONFIG, 'b1'), 'rb-a');
    const run = runAt('rb-a', 9);
    for (let launch = 1; launch <= MAX_SCENARIO_ATTEMPTS; launch++) {
      const noted = noteScenarioLaunch(campaign, run);
      expect(noted.skip).toBe(false);
      expect(noted.campaign.attempt).toEqual({ session: 'rb-a', cursor: 9, count: launch });
      campaign = noted.campaign;
    }
    const last = noteScenarioLaunch(campaign, run);
    expect(last.skip).toBe(true);
    expect(last.campaign.attempt?.count).toBe(MAX_SCENARIO_ATTEMPTS + 1);
  });

  it('restarts the count on another scenario or session', () => {
    const campaign = noteScenarioLaunch(
      noteScenarioLaunch(createCampaign(CONFIG, 'b1'), runAt('rb-a', 9)).campaign,
      runAt('rb-a', 9),
    ).campaign;
    expect(campaign.attempt?.count).toBe(2);
    expect(noteScenarioLaunch(campaign, runAt('rb-a', 10)).campaign.attempt?.count).toBe(1);
    expect(noteScenarioLaunch(campaign, runAt('rb-b', 9)).campaign.attempt?.count).toBe(1);
  });
});

describe('bench campaign step', () => {
  const fresh = createCampaign(CONFIG, 'b1');
  const one = startPass(fresh, 'rb-a');
  const both = startPass(one, 'rb-b');

  it('starts the first pass whatever run is stored', () => {
    expect(campaignStep(fresh, null)).toBe('start');
    expect(campaignStep(fresh, runAt('rb-old', 3, false))).toBe('start');
  });

  it('resumes the current pass when it stopped before its end', () => {
    expect(campaignStep(one, runAt('rb-a', 3, false))).toBe('resume');
    expect(campaignStep(both, runAt('rb-b', 0, false))).toBe('resume');
  });

  it('starts the next pass once the current one is over, or is not the stored run', () => {
    expect(campaignStep(one, runAt('rb-a', BENCH_RUN_LENGTH, false))).toBe('start');
    expect(campaignStep(one, runAt('rb-other', 3, false))).toBe('start');
    expect(campaignStep(one, null)).toBe('start');
  });

  it('is complete after the last pass', () => {
    expect(campaignStep(both, runAt('rb-b', BENCH_RUN_LENGTH, false))).toBe('complete');
    expect(campaignStep(both, runAt('rb-a', 3, false))).toBe('complete');
  });

  it('says what it is about to do', () => {
    expect(campaignStatus(one, 'start', null, 27)).toBe(
      'CAMPAIGN pass 2/2 GL2 starts in 27s (ENTER = now)',
    );
    expect(campaignStatus(one, 'resume', runAt('rb-a', 3, false), 5)).toBe(
      `CAMPAIGN pass 1/2 GL1 resumes at 4/${BENCH_RUN_LENGTH} in 5s (ENTER = now)`,
    );
    expect(campaignStatus(both, 'complete', null, 0)).toBe('campaign complete: 2 passes');
  });
});

describe('bench run skip / resume', () => {
  it('skips the scenario at the cursor', () => {
    const next = skipScenario({ ...runAt('rb-a', 5), single: true }, 'skipped after 4 launches');
    expect(next).toMatchObject({
      cursor: 6,
      running: true,
      single: false,
      lastError: 'skipped after 4 launches',
    });
  });

  it('ends the run when the skipped scenario was its last', () => {
    const next = skipScenario(runAt('rb-a', BENCH_RUN_LENGTH - 1), 'skipped');
    expect(next.cursor).toBe(BENCH_RUN_LENGTH);
    expect(next.running).toBe(false);
  });

  it('resumes after Back on the same scenario', () => {
    const stopped = stopRun(runAt('rb-a', 5), null);
    expect(resumeRun(stopped)).toMatchObject({ cursor: 5, running: true, single: false });
  });

  it('resumes after an error past the scenario that threw', () => {
    const stopped = stopRun(runAt('rb-a', 5), 'Error: boom');
    expect(resumeRun(stopped)).toMatchObject({ cursor: 6, running: true });
  });
});

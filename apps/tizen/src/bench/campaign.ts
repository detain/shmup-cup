/**
 * The TV render bench's **campaign mode** (plan R0-03 — part of the `bench` module, see
 * `./index.ts`): several runs of the matrix back to back, hands-off.
 *
 * A bench built with `VITE_BENCH_CAMPAIGN=1,2,1,2` (and optionally `VITE_BENCH_PAUSE_S=30`) carries
 * the list of passes — the WebGL version of each — in its bundle (`vite.bench.config.ts` defines
 * `__SHMUP_BENCH_CAMPAIGN__` / `__SHMUP_BENCH_PAUSE_S__`, `./main.ts` parses them with
 * {@link parseCampaignConfig}). The page then needs no key press: the results page starts the next
 * pass after the pause, resumes a pass that stopped, and says when the campaign is complete
 * (`./run.ts`). A desktop orchestrator relaunches the app after each pass's final payload and
 * whenever the log server hears nothing for a while; a scenario that keeps crashing or hanging the
 * TV is skipped after {@link MAX_SCENARIO_ATTEMPTS} launches.
 *
 * The campaign's progress lives in `localStorage` under {@link BENCH_CAMPAIGN_KEY}, beside the run
 * state of `./state.ts`. Everything here is a pure function of the two, tested headlessly; `run.ts`
 * reads and writes the storage.
 *
 * @module
 */
import { BENCH_RUN_LENGTH } from './decode.js';
import { resumeRun, type BenchRunState } from './state.js';

/** `localStorage` key of the campaign state (the game's `shmup-cup:` prefix). */
export const BENCH_CAMPAIGN_KEY = 'shmup-cup:render-bench-campaign';

/** Format version of the stored campaign state. */
export const BENCH_CAMPAIGN_VERSION = 1;

/** Launches of one scenario allowed before the campaign skips it. */
export const MAX_SCENARIO_ATTEMPTS = 3;

/** The pause before a pass starts when `VITE_BENCH_PAUSE_S` says nothing usable, in seconds. */
export const DEFAULT_CAMPAIGN_PAUSE_S = 30;

/** The pause before a stopped pass resumes, in ms. */
export const CAMPAIGN_RESUME_MS = 5000;

/** A WebGL version a pass asks for. */
export type BenchPassGL = 1 | 2;

/** The campaign a bench build carries (`VITE_BENCH_CAMPAIGN`, `VITE_BENCH_PAUSE_S`). */
export interface BenchCampaignConfig {
  /** The passes in order, each the WebGL version it asks for. */
  readonly passes: readonly BenchPassGL[];
  /** The pause on the results page before a pass starts, in ms. */
  readonly pauseMs: number;
}

/** The scenario launch the campaign counted last. */
export interface BenchCampaignAttempt {
  /** The run's session id. */
  readonly session: string;
  /** The scenario index (the run's cursor). */
  readonly cursor: number;
  /** How many times that scenario was launched in a row. */
  readonly count: number;
}

/** A campaign's progress as stored between page loads. */
export interface BenchCampaignState {
  /** {@link BENCH_CAMPAIGN_VERSION}. */
  readonly version: number;
  /** The bundle's build id: a new build starts a new campaign. */
  readonly buildId: string;
  /** The passes (the config's). */
  readonly passes: readonly BenchPassGL[];
  /** The index of the next pass to start (= passes started so far). */
  readonly next: number;
  /** The session ids of the passes started so far, in order. */
  readonly sessions: readonly string[];
  /** The last counted scenario launch, or `null` (none since the pass started). */
  readonly attempt: BenchCampaignAttempt | null;
}

/** What the results page does next for a campaign. */
export type BenchCampaignStep = 'resume' | 'start' | 'complete';

/**
 * Parses the build's campaign config.
 *
 * @param passes - `VITE_BENCH_CAMPAIGN`: comma-separated WebGL versions (`'1,2,1,2'`).
 * @param pauseSeconds - `VITE_BENCH_PAUSE_S`: the pause before each pass, in seconds.
 * @returns The config, or `null` (no campaign) when `passes` is empty or holds anything but `1` /
 *   `2`. A pause that is not a number becomes {@link DEFAULT_CAMPAIGN_PAUSE_S}; a negative one 0.
 * @example
 * ```ts
 * parseCampaignConfig('1,2', ''); // → { passes: [1, 2], pauseMs: 30000 }
 * ```
 */
export function parseCampaignConfig(
  passes: string,
  pauseSeconds: string,
): BenchCampaignConfig | null {
  const text = passes.trim();
  if (text === '') return null;
  const parts = text.split(',');
  const list: BenchPassGL[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (part === '1') list.push(1);
    else if (part === '2') list.push(2);
    else return null;
  }
  const trimmed = pauseSeconds.trim();
  const seconds = trimmed === '' ? NaN : Number(trimmed);
  const pause = Number.isFinite(seconds) ? Math.max(0, seconds) : DEFAULT_CAMPAIGN_PAUSE_S;
  return { passes: list, pauseMs: Math.round(pause * 1000) };
}

/**
 * A fresh campaign: no pass started yet.
 *
 * @param config - The build's config.
 * @param buildId - The bundle's build id.
 * @returns The state.
 */
export function createCampaign(config: BenchCampaignConfig, buildId: string): BenchCampaignState {
  return {
    version: BENCH_CAMPAIGN_VERSION,
    buildId,
    passes: config.passes.slice(),
    next: 0,
    sessions: [],
    attempt: null,
  };
}

/**
 * Whether a value is a whole number ≥ 0.
 *
 * @param value - The value.
 * @returns `true` for a non-negative integer.
 */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value % 1 === 0;
}

/**
 * Reads a stored campaign defensively.
 *
 * @param text - The stored JSON, or `null` when nothing is stored.
 * @returns The state, or `null` when nothing usable is stored (no key, bad JSON, another version,
 *   a missing or ill-typed field, a pass that is not 1 or 2, or `sessions` that do not match
 *   `next`).
 */
export function parseCampaign(text: string | null): BenchCampaignState | null {
  if (text === null || text === '') return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (_error) {
    return null;
  }
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (
    o.version !== BENCH_CAMPAIGN_VERSION ||
    typeof o.buildId !== 'string' ||
    !Array.isArray(o.passes) ||
    !isCount(o.next) ||
    !Array.isArray(o.sessions)
  ) {
    return null;
  }
  const passes = o.passes as unknown[];
  const sessions = o.sessions as unknown[];
  if (passes.length === 0 || o.next > passes.length || sessions.length !== o.next) return null;
  const passList: BenchPassGL[] = [];
  for (let i = 0; i < passes.length; i++) {
    if (passes[i] !== 1 && passes[i] !== 2) return null;
    passList.push(passes[i] === 2 ? 2 : 1);
  }
  const sessionList: string[] = [];
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    if (typeof session !== 'string') return null;
    sessionList.push(session);
  }
  let attempt: BenchCampaignAttempt | null = null;
  if (o.attempt !== null && o.attempt !== undefined) {
    if (typeof o.attempt !== 'object') return null;
    const a = o.attempt as Record<string, unknown>;
    if (typeof a.session !== 'string' || !isCount(a.cursor) || !isCount(a.count)) return null;
    attempt = { session: a.session, cursor: a.cursor, count: a.count };
  }
  return {
    version: BENCH_CAMPAIGN_VERSION,
    buildId: o.buildId,
    passes: passList,
    next: o.next,
    sessions: sessionList,
    attempt,
  };
}

/**
 * Stores a campaign as JSON.
 *
 * @param campaign - The state.
 * @returns The text for `localStorage`.
 */
export function serializeCampaign(campaign: BenchCampaignState): string {
  return JSON.stringify(campaign);
}

/**
 * The campaign this build works on.
 *
 * @param stored - The stored campaign ({@link parseCampaign}), or `null`.
 * @param config - The build's config.
 * @param buildId - The bundle's build id.
 * @returns The stored campaign when it is this build's (same build id, same passes), else a fresh
 *   one.
 */
export function campaignFor(
  stored: BenchCampaignState | null,
  config: BenchCampaignConfig,
  buildId: string,
): BenchCampaignState {
  if (stored !== null && stored.buildId === buildId && samePasses(stored.passes, config.passes)) {
    return stored;
  }
  return createCampaign(config, buildId);
}

/**
 * Whether two pass lists are equal.
 *
 * @param a - One list.
 * @param b - The other.
 * @returns `true` when they hold the same versions in the same order.
 */
function samePasses(a: readonly BenchPassGL[], b: readonly BenchPassGL[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Counts a scenario page's launch (a scenario page calls it before it measures).
 *
 * @param campaign - The campaign.
 * @param run - The run state (`running`), whose cursor is the scenario about to run.
 * @returns The campaign with the launch counted — one more than the last count when the same
 *   session's same scenario was launched last, else 1 — and whether to `skip` the scenario: it has
 *   now been launched more than {@link MAX_SCENARIO_ATTEMPTS} times, so the earlier launches
 *   crashed or hung the TV (a finished scenario moves the cursor, which resets the count).
 */
export function noteScenarioLaunch(
  campaign: BenchCampaignState,
  run: BenchRunState,
): { readonly campaign: BenchCampaignState; readonly skip: boolean } {
  const last = campaign.attempt;
  const count =
    last !== null && last.session === run.session && last.cursor === run.cursor
      ? last.count + 1
      : 1;
  return {
    campaign: { ...campaign, attempt: { session: run.session, cursor: run.cursor, count } },
    skip: count > MAX_SCENARIO_ATTEMPTS,
  };
}

/**
 * What the results page does next.
 *
 * @param campaign - The campaign.
 * @param run - The stored run state, or `null`.
 * @returns `'resume'` when the run is the current pass's (its session is the last one started) and
 *   stopped before its end; else `'start'` while passes remain; else `'complete'`.
 */
export function campaignStep(
  campaign: BenchCampaignState,
  run: BenchRunState | null,
): BenchCampaignStep {
  if (
    campaign.next > 0 &&
    run !== null &&
    run.session === campaign.sessions[campaign.next - 1] &&
    !run.running &&
    run.cursor < BENCH_RUN_LENGTH
  ) {
    return 'resume';
  }
  return campaign.next < campaign.passes.length ? 'start' : 'complete';
}

/**
 * Notes that the next pass started.
 *
 * @param campaign - The campaign.
 * @param session - The new run's session id.
 * @returns The campaign one pass further on, the session appended, no launch counted yet.
 */
export function startPass(campaign: BenchCampaignState, session: string): BenchCampaignState {
  const sessions = campaign.sessions.slice();
  sessions.push(session);
  return { ...campaign, next: campaign.next + 1, sessions, attempt: null };
}

/**
 * The results page's status line while a campaign waits to act.
 *
 * @param campaign - The campaign.
 * @param step - What it is about to do.
 * @param run - The stored run state (for `'resume'`: the scenario it resumes at), or `null`.
 * @param seconds - Seconds left before it acts.
 * @returns The line, e.g. `CAMPAIGN pass 2/4 GL2 starts in 27s (ENTER = now)`; for `'complete'`
 *   `campaign complete: 4 passes`.
 */
export function campaignStatus(
  campaign: BenchCampaignState,
  step: BenchCampaignStep,
  run: BenchRunState | null,
  seconds: number,
): string {
  const total = campaign.passes.length;
  if (step === 'complete') return `campaign complete: ${total} passes`;
  if (step === 'start') {
    return (
      `CAMPAIGN pass ${campaign.next + 1}/${total} GL${campaign.passes[campaign.next]} ` +
      `starts in ${seconds}s (ENTER = now)`
    );
  }
  const at = run === null ? 0 : resumeRun(run).cursor;
  return (
    `CAMPAIGN pass ${campaign.next}/${total} GL${campaign.passes[campaign.next - 1]} ` +
    `resumes at ${at + 1}/${BENCH_RUN_LENGTH} in ${seconds}s (ENTER = now)`
  );
}

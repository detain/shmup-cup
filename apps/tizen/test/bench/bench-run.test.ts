/**
 * The TV render bench's page plumbing (plan R0-02, `src/bench/run.ts`) on a fake window — no WebGL
 * in Node, so these drive the paths around the measurement: the results page (its plain-text
 * fallback when no renderer can be made), the remote's Enter / Red / Back against the stored run
 * state, a scenario that fails and stops the run instead of reloading forever, and the headless
 * mode's published outcome — the decode scenario after the matrix (plan R1-05 B4), which records
 * its failure and hands the run on rather than stopping it, and the stand-in load that follows it
 * (plan R3-04.M4a), which fails like a render scenario. The measurement itself runs in a browser:
 * `pnpm bench` (`test/bench/render.perf.ts`) opens every scenario headlessly.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  BENCH_DENSITIES,
  BENCH_LEDGER_KEY,
  BENCH_SCENARIOS,
  BENCH_STATE_KEY,
  REWIND_SCENARIO_INDEX,
  TV_BENCH_MARKER,
  TV_BENCH_TIMING,
  atlasFor,
  createRunState,
  parseRunState,
  recordDecode,
  recordResult,
  recordRewind,
  serializeLedger,
  serializeRunState,
  startRenderBench,
  parseBenchOutput,
  type BenchAssets,
  type BenchHost,
  type BenchOutput,
  type TvBenchOutcome,
} from '../../src/bench/index.js';
import { fakeDecode, fakeRewind, fakeStandinRecord, recordFor } from './fake-record.js';
import { shippedAtlas } from './shipped-atlas.js';
import type { AtlasManifest } from '@shmup/render-pixi';

/** The shipped atlas manifest, built in memory (`assets/generated/` is not there in CI). */
const manifest = shippedAtlas().manifest as unknown as AtlasManifest;

/** Assets whose pages never load (Node has no images): every density shares the shipped manifest. */
const ASSETS: BenchAssets = {
  atlases: BENCH_DENSITIES.map((density) => ({ density, manifest, pageUrls: ['missing.png'] })),
  fx: [],
};

/** What a fake page's bench is started with beyond its storage and assets. */
interface FakeOptions {
  /** The build output (`VITE_BENCH_OUTPUT`), default none. */
  readonly output?: BenchOutput | null;
  /** The log server, default none. */
  readonly reportUrl?: string;
  /** The game-code hash (plan v20x BENCSKIP), default absent — the pre-ledger behavior. */
  readonly gameCodeHash?: string;
  /** Text stored under the ledger key before the page starts (default nothing). */
  readonly ledger?: string;
}

/** A fake page: storage, keys, the body marker, reload and exit, and images that fail to load. */
function fakePage(
  search = '',
  stored: string | null = null,
  assets: BenchAssets = ASSETS,
  extra: FakeOptions = {},
) {
  const store = new Map<string, string>();
  if (stored !== null) store.set(BENCH_STATE_KEY, stored);
  if (extra.ledger !== undefined) store.set(BENCH_LEDGER_KEY, extra.ledger);
  let keydown: ((event: { keyCode: number; preventDefault(): void }) => void) | null = null;
  const attributes: Record<string, string> = {};
  const appended: { textContent: string }[] = [];
  const reload = vi.fn();
  /** The bodies POSTed to the log server. */
  const posted: string[] = [];
  /** A request the log server accepts at once. */
  class AcceptingRequest {
    status = 200;
    timeout = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    open(): void {}
    setRequestHeader(): void {}
    send(body: string): void {
      posted.push(body);
      void Promise.resolve().then(() => this.onload?.());
    }
  }
  /** An image that fails to load, asynchronously like a real one. */
  class FailingImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_url: string) {
      void Promise.resolve().then(() => this.onerror?.());
    }
  }
  const win = {
    location: { search, reload },
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
    addEventListener: (type: string, fn: typeof keydown) => {
      if (type === 'keydown') keydown = fn;
    },
    document: {
      body: {
        setAttribute: (name: string, value: string) => {
          attributes[name] = value;
        },
        appendChild: (element: { textContent: string }) => appended.push(element),
      },
      createElement: () => ({ style: { cssText: '' }, textContent: '' }),
    },
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    navigator: { userAgent: 'test' },
    requestAnimationFrame: () => 0,
    performance: { now: () => 0 },
    Image: FailingImage,
    XMLHttpRequest: AcceptingRequest,
    setTimeout: () => 0,
    close: vi.fn(),
  };
  const exit = vi.fn();
  const host: BenchHost = { name: 'browser', exit };
  const press = (keyCode: number): void => {
    keydown?.({ keyCode, preventDefault: () => {} });
  };
  const state = () => parseRunState(store.get(BENCH_STATE_KEY) ?? null);
  const start = (): void => {
    startRenderBench({
      win: win as unknown as Window,
      canvas: {} as HTMLCanvasElement,
      reportUrl: extra.reportUrl ?? '',
      buildId: 'test',
      gameCodeHash: extra.gameCodeHash,
      assets,
      host,
      output: extra.output ?? null,
    });
  };
  return {
    win,
    start,
    press,
    state,
    ledger: () => store.get(BENCH_LEDGER_KEY) ?? null,
    reload,
    exit,
    attributes,
    appended,
    posted,
  };
}

/** Lets the page's promises settle. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

/**
 * A run whose 190 render scenarios are measured: the decode scenario is next.
 *
 * @returns Its stored text.
 */
function matrixDone(): string {
  let state = createRunState('rb-done', 1, 1, TV_BENCH_TIMING);
  for (const scenario of BENCH_SCENARIOS) {
    state = recordResult(state, recordFor(scenario.index));
  }
  return serializeRunState(state);
}

/**
 * A run whose decode record is stored: the matrix, then the decode scenario — the stand-in load
 * is next (plan R3-04.M4a).
 *
 * @returns Its stored text.
 */
function decodeDone(): string {
  const state = parseRunState(matrixDone());
  if (state === null) throw new Error('unreadable run');
  return serializeRunState(recordDecode(state, fakeDecode()));
}

/**
 * A complete run: the matrix, the decode scenario, the stand-in load and the rewind page.
 *
 * @returns Its stored text.
 */
function completeRun(): string {
  const state = parseRunState(decodeDone());
  if (state === null) throw new Error('unreadable run');
  return serializeRunState(recordRewind(recordResult(state, fakeStandinRecord()), fakeRewind()));
}

/** {@link ASSETS} with the decode scenario's pages (which never load in Node either). */
const DECODE_ASSETS: BenchAssets = {
  ...ASSETS,
  decode: [{ id: 'standin-zone-a', what: 'x', width: 2048, height: 2048, url: 'decode.png' }],
};

describe('bench page (TV mode)', () => {
  it('finds the atlas of each density, and refuses an unknown one', () => {
    expect(atlasFor(ASSETS, 1.5).density).toBe(1.5);
    expect(() => atlasFor(ASSETS, 3)).toThrow(/no atlas for density 3/);
  });

  it('shows the results page, as plain text when no renderer can be made', async () => {
    const page = fakePage();
    page.start();
    expect(page.attributes[TV_BENCH_MARKER]).toBe('results');
    await settle();
    expect(page.appended).toHaveLength(1);
    expect(page.appended[0].textContent).toContain('SHMUP CUP TV RENDER BENCH (R0-02)');
    expect(page.appended[0].textContent).toContain('No results yet.');
    expect(page.reload).not.toHaveBeenCalled();
  });

  it('starts a run on Enter and reloads into its first scenario', async () => {
    const page = fakePage('?warmup=0&measure=100&sync=0&gl=2');
    page.start();
    await settle();
    page.press(13);
    const state = page.state();
    expect(state).toMatchObject({ running: true, cursor: 0, webGLVersion: 2 });
    expect(state?.session).toMatch(/^rb-/);
    expect(state?.timing).toEqual({ warmupMs: 0, measureMs: 100, syncMs: 0, minFrames: 0 });
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('re-runs the last scenario on Red, and does nothing without results', () => {
    const empty = fakePage();
    empty.start();
    empty.press(403);
    expect(empty.state()).toBeNull();
    expect(empty.reload).not.toHaveBeenCalled();

    const done = fakePage('', completeRun());
    done.start();
    done.press(403);
    // The last page load of a whole run is the rewind page (plan R2 TL-3, after the stand-in of
    // plan R3-04.M4a).
    expect(done.state()).toMatchObject({ running: true, single: true, cursor: 192 });
    expect(done.reload).toHaveBeenCalledTimes(1);
  });

  it('exits on Back from the results page', () => {
    const page = fakePage('', completeRun());
    page.start();
    page.press(10009);
    expect(page.exit).toHaveBeenCalledTimes(1);
    expect(page.reload).not.toHaveBeenCalled();
    expect(page.state()?.running).toBe(false);
  });

  it('stops the run on a failed scenario instead of reloading into it forever', async () => {
    const running = serializeRunState(createRunState('rb-x', 1, 1, TV_BENCH_TIMING));
    const page = fakePage('', running);
    page.start();
    expect(page.attributes[TV_BENCH_MARKER]).toBe('scenario');
    await settle();
    const state = page.state();
    expect(state?.running).toBe(false);
    expect(state?.cursor).toBe(0);
    expect(state?.lastError).toContain('atlas page missing.png failed to load');
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('stops the run on Back during a scenario, and Red reloads into the same one', () => {
    const running = serializeRunState(createRunState('rb-x', 1, 1, TV_BENCH_TIMING));
    const red = fakePage('', running);
    red.start();
    red.press(403);
    expect(red.state()).toMatchObject({ running: true, cursor: 0 });
    expect(red.reload).toHaveBeenCalledTimes(1);

    const back = fakePage('', running);
    back.start();
    back.press(461);
    expect(back.exit).toHaveBeenCalledTimes(1);
    expect(back.state()).toMatchObject({ running: false, cursor: 0, lastError: null });
  });
});

describe('bench page: the decode scenario (plan R1-05 B4)', () => {
  it('runs after the matrix, records why it could not measure, and hands on to the stand-in load', async () => {
    const page = fakePage('', matrixDone());
    page.start();
    expect(page.attributes[TV_BENCH_MARKER]).toBe('scenario');
    await settle();
    const state = page.state();
    expect(state).toMatchObject({ running: true, cursor: 191, lastError: null });
    expect(state?.records).toHaveLength(190);
    expect(state?.decode?.error).toBe('this bench build has no decode pages');
    expect(state?.decode?.pages).toEqual([]);
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('stops on the stand-in load of a build without its pages, like a render scenario', async () => {
    const page = fakePage('', decodeDone());
    page.start();
    expect(page.attributes[TV_BENCH_MARKER]).toBe('scenario');
    await settle();
    const state = page.state();
    expect(state).toMatchObject({ running: false, cursor: 191 });
    expect(state?.lastError).toContain('this bench build has no stand-in pages');
    expect(state?.records).toHaveLength(190);
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('notes a renderer that cannot be made as the decode record’s error', async () => {
    const page = fakePage('', matrixDone(), DECODE_ASSETS);
    page.start();
    await settle();
    const state = page.state();
    expect(state?.cursor).toBe(191);
    expect(state?.decode?.error).toContain('atlas page missing.png failed to load');
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('pages a whole run’s results: the table first, decode and rewind on the last pages', async () => {
    const first = fakePage('', completeRun());
    first.start();
    expect(first.attributes[TV_BENCH_MARKER]).toBe('results');
    await settle();
    const text = first.appended[0].textContent;
    expect(text).toMatch(/ {2}PAGE 1\/\d+$/m);
    expect(text).toContain('384x216 busy');
    expect(text).not.toContain('DECODE (R1-05)');

    // Left on the first page wraps round to the last one: the special pages share it (the decode
    // table above the rewind lines, plan R2 TL-3).
    const last = fakePage('', completeRun());
    last.start();
    last.press(37);
    await settle();
    const decode = last.appended[0].textContent;
    const pages = /PAGE (\d+)\/(\d+)/.exec(decode);
    expect(pages?.[1]).toBe(pages?.[2]);
    expect(Number(pages?.[2])).toBeGreaterThan(1);
    expect(decode).toContain('DECODE (R1-05) 8 reps GL1');
    expect(decode).toContain('standin-zone-a');
    expect(decode).toContain('PNG8');
    expect(decode).toContain('REWIND (R2 TL-3)');
    expect(decode).not.toContain('384x216 busy');
    expect(last.reload).not.toHaveBeenCalled();
    // One page back: the decode table alone, before the rewind page.
    last.press(37);
    await settle();
    const middle = last.appended[last.appended.length - 1].textContent;
    expect(middle).toContain('DECODE (R1-05) 8 reps GL1');
    expect(middle).not.toContain('REWIND (R2 TL-3)');
  });

  it('publishes the stand-in outcome headlessly (?scenario=standin-zone)', async () => {
    const page = fakePage('?scenario=standin-zone', null, ASSETS);
    page.start();
    expect(page.attributes[TV_BENCH_MARKER]).toBe('running');
    await settle();
    const outcome = (page.win as unknown as { __shmupTvBench: TvBenchOutcome }).__shmupTvBench;
    expect(outcome.record).toBeNull();
    expect(outcome.decode).toBeUndefined();
    expect(outcome.error).toContain('this bench build has no stand-in pages');
    expect(page.attributes[TV_BENCH_MARKER]).toBe('error');
    expect(page.state()).toBeNull();
    expect(page.reload).not.toHaveBeenCalled();
  });

  it('publishes the decode outcome headlessly (?scenario=decode)', async () => {
    const page = fakePage('?scenario=decode&reps=2', null, DECODE_ASSETS);
    page.start();
    expect(page.attributes[TV_BENCH_MARKER]).toBe('running');
    await settle();
    const outcome = (page.win as unknown as { __shmupTvBench: TvBenchOutcome }).__shmupTvBench;
    expect(outcome.record).toBeNull();
    expect(outcome.decode?.scenario).toBe('decode');
    expect(outcome.decode?.repetitions).toBe(2);
    expect(outcome.error).toContain('failed to load');
    expect(page.attributes[TV_BENCH_MARKER]).toBe('error');
    expect(page.state()).toBeNull();
    expect(page.reload).not.toHaveBeenCalled();
  });
});

describe('bench page: a build output (VITE_BENCH_OUTPUT)', () => {
  const OUT_540 = parseBenchOutput('960x540');

  it('passes over the scenarios whose frame is larger than the output without launching them', async () => {
    // Cursor on 1024x576-busy, the first row a 960x540 backbuffer cannot hold: the rest of the
    // plain matrix (1024x576 … 1920x1080n, 72 rows) and the first knob rows (800x600-*-fit) are
    // skipped, and the page goes on to 854x480-busy-fit.
    const first = BENCH_SCENARIOS.findIndex((s) => s.id === '1024x576-busy');
    const next = BENCH_SCENARIOS.findIndex((s) => s.id === '854x480-busy-fit');
    const running = createRunState('rb-x', 1, 1, TV_BENCH_TIMING);
    const page = fakePage('', serializeRunState({ ...running, cursor: first }), ASSETS, {
      output: OUT_540,
    });
    page.start();
    expect(page.attributes[TV_BENCH_MARKER]).toBe('scenario');
    // Stored before anything is measured: the cursor sits on the scenario this page measures.
    expect(page.state()).toMatchObject({ running: true, cursor: next, lastError: null });
    await settle();
    // The measurement fails in Node (no images); it is the 854x480 row that failed, not a skipped one.
    expect(page.state()).toMatchObject({ running: false, cursor: next });
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('runs every scenario of the matrix without an output (no skip)', () => {
    const at = BENCH_SCENARIOS.findIndex((s) => s.id === '1920x1080n-busy');
    const running = createRunState('rb-x', 1, 1, TV_BENCH_TIMING);
    const page = fakePage('', serializeRunState({ ...running, cursor: at }));
    page.start();
    expect(page.state()).toMatchObject({ running: true, cursor: at });
  });

  it('reports the output in the payload env and on the results page', async () => {
    let state = createRunState('rb-out', 1, 1, TV_BENCH_TIMING);
    state = recordResult(state, recordFor(0));
    state = { ...state, running: false };
    const page = fakePage('', serializeRunState(state), ASSETS, {
      output: parseBenchOutput('1280x720'),
      reportUrl: 'http://10.0.0.2:8787',
    });
    page.start();
    await settle();
    expect(page.posted).toHaveLength(1);
    const payload = JSON.parse(page.posted[0]) as { env: { output: unknown; scenarios: number } };
    expect(payload.env.output).toBe('1280x720');
    // The indexes stay the matrix's, whatever the build skips.
    expect(payload.env.scenarios).toBe(BENCH_SCENARIOS.length);
    const text = page.appended[0].textContent;
    expect(text).toContain('output 1280x720');
    expect(text).toContain('24 scenario(s) skipped: frame larger than the output');
    expect(text).toContain('SKIPPED 1024x768n 1280x960n 1920x1080n 1920x1080n-interp');
    expect(text).toContain('ENTER run: 166 scenarios + decode + stand-in + rewind');
  });

  it('reports a null output without one', async () => {
    let state = createRunState('rb-out', 1, 1, TV_BENCH_TIMING);
    state = { ...recordResult(state, recordFor(0)), running: false };
    const page = fakePage('', serializeRunState(state), ASSETS, {
      reportUrl: 'http://10.0.0.2:8787',
    });
    page.start();
    await settle();
    const payload = JSON.parse(page.posted[0]) as { env: { output: unknown } };
    expect(payload.env.output).toBeNull();
    expect(page.appended[0].textContent).not.toContain('OUTPUT');
    expect(page.appended[0].textContent).toContain(
      'ENTER run: 190 scenarios + decode + stand-in + rewind',
    );
  });

  it('publishes a skipped scenario as an error headlessly', () => {
    const page = fakePage('?scenario=1280x720n-busy', null, ASSETS, { output: OUT_540 });
    page.start();
    const outcome = (page.win as unknown as { __shmupTvBench: TvBenchOutcome }).__shmupTvBench;
    expect(outcome).toEqual({
      record: null,
      error: 'skipped: frame 1280x720 larger than the output 960x540',
    });
  });
});

describe('bench page (headless mode)', () => {
  it('publishes an unknown scenario as an error', () => {
    const page = fakePage('?scenario=nope');
    page.start();
    const outcome = (page.win as unknown as { __shmupTvBench: TvBenchOutcome }).__shmupTvBench;
    expect(outcome).toEqual({ record: null, error: 'unknown scenario "nope"' });
    expect(page.attributes[TV_BENCH_MARKER]).toBe('error');
  });

  it('publishes a failed scenario as an error, without touching storage or reloading', async () => {
    const page = fakePage('?scenario=640x360-busy');
    page.start();
    expect(page.attributes[TV_BENCH_MARKER]).toBe('running');
    await settle();
    const outcome = (page.win as unknown as { __shmupTvBench: TvBenchOutcome }).__shmupTvBench;
    expect(outcome.record).toBeNull();
    expect(outcome.error).toContain('failed to load');
    expect(page.attributes[TV_BENCH_MARKER]).toBe('error');
    expect(page.state()).toBeNull();
    expect(page.reload).not.toHaveBeenCalled();
  });
});

/** The skip ledger's game code in these tests (any non-empty string; 10-hex like the real one). */
const CODE = 'abc123def4';

/**
 * The first 174 render rows — the frozen set of the owner's M7 runs (plan v20x BENCSKIP).
 *
 * @returns Ascending scenario indexes.
 */
function first174(): number[] {
  const out: number[] = [];
  for (let i = 0; i < 174; i++) out.push(i);
  return out;
}

describe('bench skip ledger (TV mode)', () => {
  it('offers the new rows only when the ledger holds this game code', async () => {
    const page = fakePage('', completeRun(), ASSETS, {
      gameCodeHash: CODE,
      ledger: serializeLedger(CODE, first174()),
    });
    page.start();
    await settle();
    const text = page.appended[0].textContent;
    expect(text).toContain('ENTER new rows only: 19 row(s) left');
    expect(text).toContain('174 measured on this game code');
    expect(text).toContain('GREEN full suite: 190 scenarios');
    expect(text).toContain('fresh noise-floor sample');
    page.press(13);
    expect(page.state()).toMatchObject({ running: true, cursor: 174, skippedAtStart: 174 });
    expect(page.reload).toHaveBeenCalledTimes(1);
    // The offer itself changes nothing: the ledger still holds exactly the same-code rows.
    expect(page.ledger()).toBe(serializeLedger(CODE, first174()));
  });

  it('Green starts the full suite and clears the ledger for it to refill', async () => {
    const page = fakePage('', completeRun(), ASSETS, {
      gameCodeHash: CODE,
      ledger: serializeLedger(CODE, first174()),
    });
    page.start();
    await settle();
    page.press(404);
    expect(page.state()).toMatchObject({ running: true, cursor: 0, skippedAtStart: 0 });
    expect(page.ledger()).toBe(serializeLedger(CODE, []));
  });

  it('a foreign game code never offers, and Enter takes the full run over it', async () => {
    const page = fakePage('', completeRun(), ASSETS, {
      gameCodeHash: CODE,
      ledger: serializeLedger('ffffaaaa00', first174()),
    });
    page.start();
    await settle();
    expect(page.appended[0].textContent).not.toContain('new rows only');
    page.press(13);
    expect(page.state()).toMatchObject({ cursor: 0, skippedAtStart: 0 });
    expect(page.ledger()).toBe(serializeLedger(CODE, []));
  });

  it('a build without the hash behaves exactly as before (no ledger is ever written)', async () => {
    const stored = serializeLedger(CODE, first174());
    const page = fakePage('', completeRun(), ASSETS, { ledger: stored });
    page.start();
    await settle();
    expect(page.appended[0].textContent).not.toContain('new rows only');
    page.press(13);
    expect(page.state()).toMatchObject({ cursor: 0, skippedAtStart: 0 });
    expect(page.ledger()).toBe(stored);
  });

  it('marks the rewind row in the ledger when it measured', async () => {
    const running = createRunState('rb-r', 1, 1, TV_BENCH_TIMING, REWIND_SCENARIO_INDEX);
    const page = fakePage('', serializeRunState(running), ASSETS, { gameCodeHash: CODE });
    page.start();
    await settle();
    expect(page.state()?.records.length ?? 0).toBe(0);
    expect(page.ledger()).toBe(serializeLedger(CODE, [REWIND_SCENARIO_INDEX]));
  });

  it('marks nothing for a scenario that failed (its row stays pending)', async () => {
    const running = createRunState('rb-f', 1, 1, TV_BENCH_TIMING);
    const page = fakePage('', serializeRunState(running), ASSETS, { gameCodeHash: CODE });
    page.start();
    await settle();
    expect(page.state()?.running).toBe(false);
    expect(page.ledger()).toBeNull();
  });

  it('notes the skipped rows on the RUN line', async () => {
    const skip = createRunState('rb-n', 1, 1, TV_BENCH_TIMING, 174, 174);
    const one = { ...recordResult(skip, recordFor(174)), running: false };
    const page = fakePage('', serializeRunState(one));
    page.start();
    await settle();
    expect(page.appended[0].textContent).toContain('RUN rb-n');
    expect(page.appended[0].textContent).toContain('(skipped 174 same game)');
  });
});

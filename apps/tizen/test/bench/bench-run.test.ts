/**
 * The TV render bench's page plumbing (plan R0-02, `src/bench/run.ts`) on a fake window — no WebGL
 * in Node, so these drive the paths around the measurement: the results page (its plain-text
 * fallback when no renderer can be made), the remote's Enter / Red / Back against the stored run
 * state, a scenario that fails and stops the run instead of reloading forever, and the headless
 * mode's published outcome — and the decode scenario at the end of a run (plan R1-05 B4), which
 * records its failure and finishes the run rather than stopping it. The measurement itself runs in
 * a browser: `pnpm bench` (`test/bench/render.perf.ts`) opens every scenario headlessly.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  BENCH_DENSITIES,
  BENCH_SCENARIOS,
  BENCH_STATE_KEY,
  TV_BENCH_MARKER,
  TV_BENCH_TIMING,
  atlasFor,
  createRunState,
  parseRunState,
  recordDecode,
  recordResult,
  serializeRunState,
  startRenderBench,
  type BenchAssets,
  type BenchHost,
  type TvBenchOutcome,
} from '../../src/bench/index.js';
import { fakeDecode, recordFor } from './fake-record.js';
import { shippedAtlas } from './shipped-atlas.js';
import type { AtlasManifest } from '@shmup/render-pixi';

/** The shipped atlas manifest, built in memory (`assets/generated/` is not there in CI). */
const manifest = shippedAtlas().manifest as unknown as AtlasManifest;

/** Assets whose pages never load (Node has no images): every density shares the shipped manifest. */
const ASSETS: BenchAssets = {
  atlases: BENCH_DENSITIES.map((density) => ({ density, manifest, pageUrls: ['missing.png'] })),
  fx: [],
};

/** A fake page: storage, keys, the body marker, reload and exit, and images that fail to load. */
function fakePage(search = '', stored: string | null = null, assets: BenchAssets = ASSETS) {
  const store = new Map<string, string>();
  if (stored !== null) store.set(BENCH_STATE_KEY, stored);
  let keydown: ((event: { keyCode: number; preventDefault(): void }) => void) | null = null;
  const attributes: Record<string, string> = {};
  const appended: { textContent: string }[] = [];
  const reload = vi.fn();
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
      reportUrl: '',
      buildId: 'test',
      assets,
      host,
    });
  };
  return { win, start, press, state, reload, exit, attributes, appended };
}

/** Lets the page's promises settle. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

/**
 * A run whose 172 render scenarios are measured: the decode scenario is next.
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
 * A complete run: the matrix, then the decode scenario.
 *
 * @returns Its stored text.
 */
function completeRun(): string {
  const state = parseRunState(matrixDone());
  if (state === null) throw new Error('unreadable run');
  return serializeRunState(recordDecode(state, fakeDecode()));
}

/** {@link ASSETS} with the decode scenario's pages (which never load in Node either). */
const DECODE_ASSETS: BenchAssets = {
  ...ASSETS,
  decode: [{ id: 'rgba-2048', what: 'x', width: 2048, height: 2048, url: 'decode.png' }],
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
    // The last scenario of a whole run is the decode scenario.
    expect(done.state()).toMatchObject({ running: true, single: true, cursor: 172 });
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
  it('runs after the matrix, records why it could not measure, and ends the run', async () => {
    const page = fakePage('', matrixDone());
    page.start();
    expect(page.attributes[TV_BENCH_MARKER]).toBe('scenario');
    await settle();
    const state = page.state();
    expect(state).toMatchObject({ running: false, cursor: 173, lastError: null });
    expect(state?.records).toHaveLength(172);
    expect(state?.decode?.error).toBe('this bench build has no decode pages');
    expect(state?.decode?.pages).toEqual([]);
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('notes a renderer that cannot be made as the decode record’s error', async () => {
    const page = fakePage('', matrixDone(), DECODE_ASSETS);
    page.start();
    await settle();
    const state = page.state();
    expect(state?.cursor).toBe(173);
    expect(state?.decode?.error).toContain('atlas page missing.png failed to load');
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it('pages a whole run’s results: the table first, the decode table on the last page', async () => {
    const first = fakePage('', completeRun());
    first.start();
    expect(first.attributes[TV_BENCH_MARKER]).toBe('results');
    await settle();
    const text = first.appended[0].textContent;
    expect(text).toMatch(/ {2}PAGE 1\/\d+$/m);
    expect(text).toContain('384x216 busy');
    expect(text).not.toContain('DECODE (R1-05)');

    // Left on the first page wraps round to the last one: the decode table.
    const last = fakePage('', completeRun());
    last.start();
    last.press(37);
    await settle();
    const decode = last.appended[0].textContent;
    const pages = /PAGE (\d+)\/(\d+)/.exec(decode);
    expect(pages?.[1]).toBe(pages?.[2]);
    expect(Number(pages?.[2])).toBeGreaterThan(1);
    expect(decode).toContain('DECODE (R1-05) 8 reps GL1');
    expect(decode).toContain('png8-2048  2048x2048 PNG8');
    expect(decode).not.toContain('384x216 busy');
    expect(last.reload).not.toHaveBeenCalled();
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

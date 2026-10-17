/**
 * `apps/tizen/src/bench` (plan R0-02 — the TV render bench): the module descriptor, the scenario
 * matrix, the query-string knobs, the remote keys and the host detection, and the constants the
 * build checks and the game share with it.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  BENCH_GL_KEY,
  BENCH_KEY_CODES,
  BENCH_SCENARIOS,
  BENCH_SIZES,
  BENCH_VARIANTS,
  HEADLESS_BENCH_TIMING,
  TV_BENCH_MARKER,
  TV_BENCH_TIMING,
  benchKeyOf,
  benchWebGLVersion,
  detectBenchHost,
  findBenchScenario,
  moduleInfo,
  searchParam,
  timingFromSearch,
} from '../../src/bench/index.js';
import { WEBGL_VERSION_KEY } from '../../src/boot/index.js';
import { TV_BENCH_MARKER as CHECK_MARKER } from '../../scripts/check-bundle.mjs';

describe('bench module', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('bench');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('shares its marker with the bundle check and its WebGL key with the game', () => {
    expect(TV_BENCH_MARKER).toBe(CHECK_MARKER);
    expect(BENCH_GL_KEY).toBe(WEBGL_VERSION_KEY);
  });
});

describe('bench matrix (plan R0-02, §13)', () => {
  it('measures the three frames at density 1, 1.5 and 2.25', () => {
    expect(BENCH_SIZES.map((size) => [size.id, size.width, size.height, size.density])).toEqual([
      ['384x216', 384, 216, 1],
      ['640x360', 640, 360, 1.5],
      ['960x540', 960, 540, 2.25],
    ]);
    // The same field of view: frame width over density is v2's 640 / 1.5 at both larger sizes.
    expect(BENCH_SIZES[1].width / BENCH_SIZES[1].density).toBeCloseTo(
      BENCH_SIZES[2].width / BENCH_SIZES[2].density,
      9,
    );
  });

  it('has the busy frame, a filtered layer, Mode-7, CRT light / full and everything at once', () => {
    expect(BENCH_VARIANTS.map((v) => [v.id, v.crt, v.filter, v.mode7])).toEqual([
      ['busy', 'off', false, false],
      ['filter', 'off', true, false],
      ['mode7', 'off', false, true],
      ['crt-light', 'light', false, false],
      ['crt-full', 'full', false, false],
      ['worst', 'full', true, true],
    ]);
  });

  it('lists 18 scenarios, sizes outer, so the 384x216 baseline runs first', () => {
    expect(BENCH_SCENARIOS).toHaveLength(18);
    expect(BENCH_SCENARIOS.slice(0, 6).every((s) => s.size.id === '384x216')).toBe(true);
    BENCH_SCENARIOS.forEach((scenario, index) => {
      expect(scenario.index).toBe(index);
      expect(scenario.id).toBe(`${scenario.size.id}-${scenario.variant.id}`);
    });
    expect(new Set(BENCH_SCENARIOS.map((s) => s.id)).size).toBe(18);
    expect(Object.isFrozen(BENCH_SCENARIOS)).toBe(true);
  });

  it('finds a scenario by id', () => {
    expect(findBenchScenario('640x360-mode7')?.index).toBe(8);
    expect(findBenchScenario('640x360-nope')).toBeNull();
  });

  it('runs 10 s of warm-up and 20 s of measurement per scenario on the TV — about 10 minutes', () => {
    expect(TV_BENCH_TIMING).toEqual({ warmupMs: 10_000, measureMs: 14_000, syncMs: 6_000 });
    const perScenario =
      TV_BENCH_TIMING.warmupMs + TV_BENCH_TIMING.measureMs + TV_BENCH_TIMING.syncMs;
    expect((perScenario * BENCH_SCENARIOS.length) / 60_000).toBe(9);
    expect(HEADLESS_BENCH_TIMING.measureMs).toBeGreaterThan(0);
  });
});

describe('bench query string', () => {
  it('reads parameters, decoded, and tells a bare one from an absent one', () => {
    expect(searchParam('?scenario=640x360-busy&gl=2', 'scenario')).toBe('640x360-busy');
    expect(searchParam('scenario=a%20b+c', 'scenario')).toBe('a b c');
    expect(searchParam('?quick', 'quick')).toBe('');
    expect(searchParam('?gl=2', 'scenario')).toBeNull();
    expect(searchParam('', 'gl')).toBeNull();
    expect(searchParam('?x=%E0%A4%A', 'x')).toBeNull();
  });

  it('overrides the phase timing with whole milliseconds only', () => {
    expect(timingFromSearch('?warmup=0&measure=500&sync=250', TV_BENCH_TIMING)).toEqual({
      warmupMs: 0,
      measureMs: 500,
      syncMs: 250,
    });
    expect(timingFromSearch('?warmup=-1&measure=0&sync=1.5', TV_BENCH_TIMING)).toEqual(
      TV_BENCH_TIMING,
    );
    expect(timingFromSearch('', HEADLESS_BENCH_TIMING)).toEqual(HEADLESS_BENCH_TIMING);
  });

  it('asks for WebGL 2 from ?gl=2 or the stored override, else 1', () => {
    const storage = (value: string | null): Storage =>
      ({ getItem: (key: string) => (key === BENCH_GL_KEY ? value : null) }) as Storage;
    expect(benchWebGLVersion('', null)).toBe(1);
    expect(benchWebGLVersion('?gl=2', null)).toBe(2);
    expect(benchWebGLVersion('', storage('2'))).toBe(2);
    expect(benchWebGLVersion('?gl=1', storage('2'))).toBe(1);
    expect(benchWebGLVersion('', storage('3'))).toBe(1);
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    expect(benchWebGLVersion('', throwing)).toBe(1);
  });
});

describe('bench remote and host', () => {
  it('maps Enter, every host’s Back and the Red key', () => {
    expect(benchKeyOf(13)).toBe('enter');
    for (const code of [10009, 461, 27, 8]) expect(benchKeyOf(code)).toBe('back');
    expect(benchKeyOf(403)).toBe('red');
    expect(benchKeyOf(82)).toBe('red');
    expect(benchKeyOf(37)).toBeNull();
    expect(BENCH_KEY_CODES.back).toContain(10009);
  });

  it('registers the Red key on Tizen and exits through the application', () => {
    const exit = vi.fn();
    const registered: string[] = [];
    const win = {
      tizen: {
        tvinputdevice: { registerKey: (key: string) => registered.push(key) },
        application: { getCurrentApplication: () => ({ exit }) },
      },
      navigator: { userAgent: 'Tizen 5.5' },
      close: vi.fn(),
    } as unknown as Window;
    const host = detectBenchHost(win);
    expect(host.name).toBe('tizen');
    expect(registered).toEqual(['ColorF0Red']);
    host.exit();
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('hands Back to webOS, and closes the window in a browser', () => {
    const platformBack = vi.fn();
    const webos = detectBenchHost({
      webOS: { platformBack },
      navigator: { userAgent: '' },
      close: vi.fn(),
    } as unknown as Window);
    expect(webos.name).toBe('webos');
    webos.exit();
    expect(platformBack).toHaveBeenCalledTimes(1);

    const close = vi.fn();
    const byAgent = detectBenchHost({
      navigator: { userAgent: 'Mozilla/5.0 (Web0S; Linux/SmartTV) Chrome/68' },
      close,
    } as unknown as Window);
    expect(byAgent.name).toBe('webos');
    byAgent.exit();
    expect(close).toHaveBeenCalledTimes(1);

    const browser = detectBenchHost({
      navigator: { userAgent: 'Chrome/120' },
      close,
    } as unknown as Window);
    expect(browser.name).toBe('browser');
    browser.exit();
    expect(close).toHaveBeenCalledTimes(2);
  });
});

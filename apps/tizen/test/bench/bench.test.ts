/**
 * `apps/tizen/src/bench` (plan R0-02 — the TV render bench): the module descriptor, the scenario
 * matrix, the query-string knobs, the remote keys and the host detection, and the constants the
 * build checks and the game share with it.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  BENCH_DEFAULT_SCALE_MODE,
  BENCH_DENSITIES,
  BENCH_GL_KEY,
  BENCH_KEY_CODES,
  BENCH_KNOBS,
  BENCH_MAX_ATLAS_PAGES,
  BENCH_RESOLUTIONS,
  BENCH_SCENARIOS,
  BENCH_SIZES,
  BENCH_V2_SIZE,
  BENCH_VARIANTS,
  HEADLESS_BENCH_TIMING,
  TV_BENCH_MARKER,
  TV_BENCH_TIMING,
  benchKeyOf,
  benchWebGLVersion,
  detectBenchHost,
  findBenchScenario,
  findBenchSize,
  moduleInfo,
  searchParam,
  timingFromSearch,
} from '../../src/bench/index.js';
import { WEBGL_VERSION_KEY } from '../../src/boot/index.js';
import { TV_BENCH_MARKER as CHECK_MARKER } from '../../scripts/check-bundle.mjs';
import { BENCH_DENSITIES as ATLAS_DENSITIES } from '../../scripts/bench-atlas.mjs';

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
  it('sweeps 25 sizes: a scaled row at height / 240 up to 2.67 and a native row at density 1', () => {
    expect(
      BENCH_SIZES.map((size) => [size.id, size.width, size.height, size.density, size.art]),
    ).toEqual([
      ['384x216', 384, 216, 1, 'scaled'],
      ['480x320', 480, 320, 1.33, 'scaled'],
      ['480x320n', 480, 320, 1, 'native'],
      ['640x360', 640, 360, 1.5, 'scaled'],
      ['640x360n', 640, 360, 1, 'native'],
      ['640x480', 640, 480, 2, 'scaled'],
      ['640x480n', 640, 480, 1, 'native'],
      ['800x480', 800, 480, 2, 'scaled'],
      ['800x480n', 800, 480, 1, 'native'],
      ['854x480', 854, 480, 2, 'scaled'],
      ['854x480n', 854, 480, 1, 'native'],
      ['960x540', 960, 540, 2.25, 'scaled'],
      ['960x540n', 960, 540, 1, 'native'],
      ['1024x576', 1024, 576, 2.4, 'scaled'],
      ['1024x576n', 1024, 576, 1, 'native'],
      ['800x600', 800, 600, 2.5, 'scaled'],
      ['800x600n', 800, 600, 1, 'native'],
      ['1024x600', 1024, 600, 2.5, 'scaled'],
      ['1024x600n', 1024, 600, 1, 'native'],
      ['960x640', 960, 640, 2.67, 'scaled'],
      ['960x640n', 960, 640, 1, 'native'],
      ['1280x720n', 1280, 720, 1, 'native'],
      ['1024x768n', 1024, 768, 1, 'native'],
      ['1280x960n', 1280, 960, 1, 'native'],
      ['1920x1080n', 1920, 1080, 1, 'native'],
    ]);
    expect(BENCH_RESOLUTIONS).toHaveLength(15);
    // Every scaled density but the baseline's is height / 240 to two decimals; past 2.67 the
    // modelled atlas needs more than two 2048² pages, so those resolutions are native only.
    for (const frame of BENCH_RESOLUTIONS.slice(1)) {
      const s = Math.round((frame.height / 240) * 100) / 100;
      expect(frame.scaled).toBe(Math.ceil((s * s) / 4) > BENCH_MAX_ATLAS_PAGES ? null : s);
    }
    // The same field of view: frame width over density is v2's 640 / 1.5 at 960x540 too.
    const v2 = findBenchSize('640x360');
    const hiBit = findBenchSize('960x540');
    expect(v2).toBe(BENCH_V2_SIZE);
    expect(hiBit).not.toBeNull();
    expect(BENCH_V2_SIZE.width / BENCH_V2_SIZE.density).toBeCloseTo(
      (hiBit?.width ?? 0) / (hiBit?.density ?? 1),
      9,
    );
    expect(findBenchSize('1280x720')).toBeNull();
    expect(new Set(BENCH_SIZES.map((size) => size.id)).size).toBe(25);
  });

  it('needs an atlas at eight densities — the bench atlas script’s list, exactly', () => {
    expect(BENCH_DENSITIES).toEqual([1, 1.33, 1.5, 2, 2.25, 2.4, 2.5, 2.67]);
    expect(Array.from(ATLAS_DENSITIES)).toEqual(Array.from(BENCH_DENSITIES));
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

  it('lists 150 plain scenarios, sizes outer, so the 384x216 baseline runs first, then 44 knob rows', () => {
    expect(BENCH_SCENARIOS).toHaveLength(194);
    expect(BENCH_SCENARIOS.slice(0, 6).every((s) => s.size.id === '384x216')).toBe(true);
    BENCH_SCENARIOS.forEach((scenario, index) => {
      expect(scenario.index).toBe(index);
      const plain = index < BENCH_SIZES.length * BENCH_VARIANTS.length;
      expect(scenario.knob === null).toBe(plain);
      expect(scenario.row).toBe(
        plain ? scenario.variant.id : `${scenario.variant.id}-${scenario.knob?.id}`,
      );
      expect(scenario.id).toBe(`${scenario.size.id}-${scenario.row}`);
      if (plain) {
        expect([scenario.scaleMode, scenario.interpolation]).toEqual(['integer', false]);
        expect([scenario.outputWidth, scenario.outputHeight]).toEqual([0, 0]);
      }
    });
    expect(new Set(BENCH_SCENARIOS.map((s) => s.id)).size).toBe(194);
    expect(Object.isFrozen(BENCH_SCENARIOS)).toBe(true);
    // R0-02's and R0-03's 18 ids are still there, byte for byte.
    for (const size of ['384x216', '640x360', '960x540']) {
      for (const variant of BENCH_VARIANTS) {
        expect(findBenchScenario(`${size}-${variant.id}`)?.knob).toBeNull();
      }
    }
  });

  it('runs every knob at its sizes with busy and worst, against the default settings', () => {
    expect(BENCH_KNOBS.map((knob) => [knob.id, knob.sizes.length * knob.variants.length])).toEqual([
      ['fit', 4],
      ['stretch', 6],
      ['interp', 6],
      ['out720', 4],
      ['out540', 2],
      ['video', 2],
      // The 960×540 first-class set and the big-frame video pairs (owner 2026-10-27) — appended,
      // so every row above keeps its id and its index.
      ['fit', 2],
      ['stretch', 2],
      ['interp', 2],
      ['out720', 2],
      ['out540', 2],
      ['video', 2],
      ['video', 4],
      // The cull pair (plan R-SVG WO-2, the owner-folded spike arm B) — appended, so the video
      // rows above keep their ids and indices and the specials shift by these four alone.
      ['cull', 4],
    ]);
    const knobRows = BENCH_SCENARIOS.filter((s) => s.knob !== null);
    expect(knobRows).toHaveLength(44);
    expect(knobRows[0].id).toBe('800x600-busy-fit');
    // Only the tail knob culls; every row before it runs the plain, uncalled walk.
    expect(BENCH_KNOBS.slice(0, -1).every((knob) => knob.cull === false)).toBe(true);
    expect(BENCH_SCENARIOS.slice(0, 190).every((s) => s.knob === null || !s.knob.cull)).toBe(true);
    for (const [size, variant] of [
      ['640x360', 'busy'],
      ['640x360', 'worst'],
      ['960x540', 'busy'],
      ['960x540', 'worst'],
    ]) {
      const row = findBenchScenario(`${size}-${variant}-cull`);
      expect(row).toMatchObject({
        row: `${variant}-cull`,
        scaleMode: BENCH_DEFAULT_SCALE_MODE,
        interpolation: false,
        outputWidth: 0,
        outputHeight: 0,
      });
      expect(row?.knob?.cull).toBe(true);
    }
    expect(findBenchScenario('640x360-busy-cull')?.index).toBe(190);
    expect(BENCH_SCENARIOS[193].id).toBe('960x540-worst-cull');
    expect(findBenchScenario('640x360-busy-stretch')).toMatchObject({
      row: 'busy-stretch',
      scaleMode: 'stretch',
      interpolation: false,
    });
    expect(findBenchScenario('1280x720n-worst-interp')).toMatchObject({
      scaleMode: BENCH_DEFAULT_SCALE_MODE,
      interpolation: true,
    });
    expect(findBenchScenario('1920x1080n-busy-out720')).toMatchObject({
      outputWidth: 1280,
      outputHeight: 720,
    });
  });

  it('finds a scenario by id', () => {
    expect(findBenchScenario('640x360-mode7')?.index).toBe(20);
    expect(findBenchScenario('1920x1080n-worst')?.index).toBe(149);
    expect(findBenchScenario('640x360-nope')).toBeNull();
  });

  it('runs 10 s of warm-up and 20 s of measurement per scenario on the TV — 97 minutes', () => {
    expect(TV_BENCH_TIMING).toEqual({
      warmupMs: 10_000,
      measureMs: 14_000,
      syncMs: 6_000,
      minFrames: 0,
    });
    const perScenario =
      TV_BENCH_TIMING.warmupMs + TV_BENCH_TIMING.measureMs + TV_BENCH_TIMING.syncMs;
    expect((perScenario * BENCH_SCENARIOS.length) / 60_000).toBe(97);
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

  it('overrides the phase timing with whole milliseconds and frames only', () => {
    expect(timingFromSearch('?warmup=0&measure=500&sync=250&frames=12', TV_BENCH_TIMING)).toEqual({
      warmupMs: 0,
      measureMs: 500,
      syncMs: 250,
      minFrames: 12,
    });
    expect(timingFromSearch('?warmup=-1&measure=0&sync=1.5&frames=x', TV_BENCH_TIMING)).toEqual(
      TV_BENCH_TIMING,
    );
    expect(timingFromSearch('', HEADLESS_BENCH_TIMING)).toEqual(HEADLESS_BENCH_TIMING);
    // Headless, a measured phase records at least 20 frames however long SwiftShader stalls.
    expect(HEADLESS_BENCH_TIMING.minFrames).toBe(20);
    expect(TV_BENCH_TIMING.minFrames).toBe(0);
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
  it('maps Enter, every host’s Back, the Red key and the arrows that page the results', () => {
    expect(benchKeyOf(13)).toBe('enter');
    for (const code of [10009, 461, 27, 8]) expect(benchKeyOf(code)).toBe('back');
    expect(benchKeyOf(403)).toBe('red');
    expect(benchKeyOf(82)).toBe('red');
    expect(benchKeyOf(37)).toBe('prev');
    expect(benchKeyOf(38)).toBe('prev');
    expect(benchKeyOf(39)).toBe('next');
    expect(benchKeyOf(40)).toBe('next');
    expect(benchKeyOf(65)).toBeNull();
    expect(BENCH_KEY_CODES.back).toContain(10009);
  });

  it('registers the bench remote keys on Tizen and exits through the application', () => {
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
    expect(registered).toEqual([
      'ColorF0Red',
      'ColorF1Green',
      'ColorF2Yellow',
      'ColorF3Blue',
      'MediaPlayPause',
    ]);
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

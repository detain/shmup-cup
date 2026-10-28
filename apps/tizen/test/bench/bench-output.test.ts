/**
 * The TV render bench's build output resolution (`src/bench/output.ts` — `VITE_BENCH_OUTPUT`): the
 * parser, the build id, each scenario's backbuffer and upscale mode, the exact rows a 1280×720 and
 * a 960×540 build skip, and that without an output nothing changes. Also the two bench configs'
 * defines, which carry the output and the composed build id into the bundle.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BENCH_DEFAULT_SCALE_MODE,
  BENCH_OUTPUT_SCALE_MODE,
  BENCH_RUN_LENGTH,
  BENCH_SCENARIOS,
  BENCH_VARIANTS,
  benchBuildId,
  benchScenarioSetup,
  benchSkippedScenarios,
  findBenchScenario,
  parseBenchOutput,
  type BenchOutput,
} from '../../src/bench/index.js';

/**
 * A parsed output that must exist.
 *
 * @param text - `'<w>x<h>'`.
 * @returns The output.
 */
function output(text: string): BenchOutput {
  const parsed = parseBenchOutput(text);
  if (parsed === null) throw new Error(`no output in "${text}"`);
  return parsed;
}

/**
 * The six variant rows of each size.
 *
 * @param sizes - Size ids.
 * @returns Scenario ids, size by size.
 */
function plainRows(sizes: readonly string[]): string[] {
  return sizes.flatMap((size) => BENCH_VARIANTS.map((variant) => `${size}-${variant.id}`));
}

/**
 * The setup of a scenario by id.
 *
 * @param id - Scenario id.
 * @param out - The build output, or `null`.
 * @returns The setup.
 */
function setupOf(id: string, out: BenchOutput | null) {
  const scenario = findBenchScenario(id);
  if (scenario === null) throw new Error(`no scenario ${id}`);
  return benchScenarioSetup(scenario, out);
}

/** The rows a 1280×720 build skips (24 — 166 of the 190 run). */
const SKIPPED_720 = [
  ...plainRows(['1024x768n', '1280x960n', '1920x1080n']),
  '1920x1080n-busy-interp',
  '1920x1080n-worst-interp',
  '1920x1080n-busy-out720',
  '1920x1080n-worst-out720',
  '1920x1080n-busy-video',
  '1920x1080n-worst-video',
];

/** The rows a 960×540 build skips (86 — 104 of the 190 run). */
const SKIPPED_540 = [
  ...plainRows([
    '1024x576',
    '1024x576n',
    '800x600',
    '800x600n',
    '1024x600',
    '1024x600n',
    '960x640',
    '960x640n',
    '1280x720n',
    '1024x768n',
    '1280x960n',
    '1920x1080n',
  ]),
  '800x600-busy-fit',
  '800x600-worst-fit',
  '800x600-busy-stretch',
  '800x600-worst-stretch',
  '1280x720n-busy-interp',
  '1280x720n-worst-interp',
  '1920x1080n-busy-interp',
  '1920x1080n-worst-interp',
  '1920x1080n-busy-out720',
  '1920x1080n-worst-out720',
  '1280x720n-busy-video',
  '1280x720n-worst-video',
  '1920x1080n-busy-video',
  '1920x1080n-worst-video',
];

describe('bench output: VITE_BENCH_OUTPUT', () => {
  it('parses <w>x<h>, normalised, and an empty value as none', () => {
    expect(parseBenchOutput('1280x720')).toEqual({ id: '1280x720', width: 1280, height: 720 });
    expect(parseBenchOutput(' 960X540 ')).toEqual({ id: '960x540', width: 960, height: 540 });
    expect(parseBenchOutput('')).toBeNull();
    expect(parseBenchOutput('   ')).toBeNull();
  });

  it.each([
    '1280',
    '1280x',
    'x720',
    '0x720',
    '1280x0',
    '01280x720',
    '1280x720p',
    '-1x2',
    '1280*720',
    '9000x100',
  ])(
    'refuses %j (the build fails rather than ship a window-sized bench under another name)',
    (text) => {
      expect(() => parseBenchOutput(text)).toThrow(/VITE_BENCH_OUTPUT must be <width>x<height>/);
    },
  );

  it('composes the build id: the bundle’s alone without an output, @<w>x<h> with one', () => {
    expect(benchBuildId('9e60df2+', null)).toBe('9e60df2+');
    expect(benchBuildId('9e60df2+', output('1280x720'))).toBe('9e60df2+@1280x720');
    expect(benchBuildId('9e60df2', output('960X540'))).toBe('9e60df2@960x540');
  });
});

describe('bench output: each scenario’s setup', () => {
  it('changes nothing without an output: the matrix’s own settings, nothing skipped', () => {
    for (const scenario of BENCH_SCENARIOS) {
      expect(benchScenarioSetup(scenario, null)).toEqual({
        outputWidth: scenario.outputWidth,
        outputHeight: scenario.outputHeight,
        scaleMode: scenario.scaleMode,
        skip: null,
      });
    }
    expect(benchSkippedScenarios(null)).toEqual([]);
    // The matrix itself does not depend on the output: 190 rows + decode + stand-in + rewind,
    // indexes unchanged (the three extra page loads of plan R1-05 B4, R3-04.M4a and R2 TL-3 ride
    // after the matrix).
    expect(BENCH_SCENARIOS).toHaveLength(190);
    expect(BENCH_RUN_LENGTH).toBe(193);
    expect(setupOf('640x360-busy', null).scaleMode).toBe(BENCH_DEFAULT_SCALE_MODE);
  });

  it('draws rows without their own output into the build output, fit-upscaled', () => {
    const out = output('1280x720');
    expect(BENCH_OUTPUT_SCALE_MODE).toBe('fit');
    expect(setupOf('640x360-busy', out)).toEqual({
      outputWidth: 1280,
      outputHeight: 720,
      scaleMode: 'fit',
      skip: null,
    });
    // A knob without a scale mode of its own is fit-upscaled too …
    expect(setupOf('640x360-busy-interp', out).scaleMode).toBe('fit');
    // … a knob with one keeps it …
    expect(setupOf('854x480-busy-stretch', out).scaleMode).toBe('stretch');
    expect(setupOf('640x360-worst-stretch', out).scaleMode).toBe('stretch');
    // … and a knob with an output of its own keeps that backbuffer.
    expect(setupOf('640x360-busy-out540', out)).toMatchObject({
      outputWidth: 960,
      outputHeight: 540,
      scaleMode: 'fit',
      skip: null,
    });
    // A frame exactly the size of the backbuffer fits.
    expect(setupOf('1280x720n-busy', out).skip).toBeNull();
    expect(setupOf('960x540-busy', output('960x540')).skip).toBeNull();
  });

  it('skips a frame wider or taller than its backbuffer, saying why', () => {
    expect(setupOf('1024x768n-busy', output('1280x720')).skip).toBe(
      'frame 1024x768 larger than the output 1280x720',
    );
    expect(setupOf('1024x576-busy', output('960x540')).skip).toBe(
      'frame 1024x576 larger than the output 960x540',
    );
    // The out720 knob keeps its 1280x720 backbuffer, so its 1920x1080n rows skip in any output build.
    expect(setupOf('1920x1080n-busy-out720', output('1920x1080')).skip).toBe(
      'frame 1920x1080 larger than the output 1280x720',
    );
  });

  it('skips exactly these rows at 1280x720 (166 of 190 run)', () => {
    const skipped = benchSkippedScenarios(output('1280x720')).map((s) => s.id);
    expect(skipped).toEqual(SKIPPED_720);
    expect(BENCH_SCENARIOS.length - skipped.length).toBe(166);
  });

  it('skips exactly these rows at 960x540 (104 of 190 run)', () => {
    const skipped = benchSkippedScenarios(output('960x540')).map((s) => s.id);
    expect(skipped).toEqual(SKIPPED_540);
    expect(BENCH_SCENARIOS.length - skipped.length).toBe(104);
  });
});

describe('bench output: the bench configs’ defines', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  /**
   * The defines of a bench config, loaded fresh under the current environment.
   *
   * @param app - `tizen` or `webos`.
   * @returns Its `define`.
   */
  async function definesOf(app: 'tizen' | 'webos'): Promise<Record<string, string>> {
    vi.resetModules();
    const config =
      app === 'tizen'
        ? (await import('../../vite.bench.config.js')).default
        : (await import('../../../webos/vite.bench.config.js')).default;
    return (config as { define: Record<string, string> }).define;
  }

  it.each(['tizen', 'webos'] as const)(
    '%s: keeps the build id alone without an output, and adds @<w>x<h> with one',
    async (app) => {
      vi.stubEnv('SHMUP_BUILD_ID', 'abc1234+');
      vi.stubEnv('VITE_BENCH_OUTPUT', undefined);
      const plain = await definesOf(app);
      expect(plain.__SHMUP_BENCH_OUTPUT__).toBe('""');
      expect(plain.__SHMUP_BENCH_BUILD_ID__).toBe('"abc1234+"');

      vi.stubEnv('VITE_BENCH_OUTPUT', '1280X720');
      const out = await definesOf(app);
      expect(out.__SHMUP_BENCH_OUTPUT__).toBe('"1280x720"');
      expect(out.__SHMUP_BENCH_BUILD_ID__).toBe('"abc1234+@1280x720"');

      vi.stubEnv('VITE_BENCH_OUTPUT', '720p');
      await expect(definesOf(app)).rejects.toThrow(/VITE_BENCH_OUTPUT/);
    },
  );

  it.each(['tizen', 'webos'] as const)(
    '%s: defaults the SVG arm to png; when armed, the define flips and the build id gains its suffix',
    async (app) => {
      vi.stubEnv('SHMUP_BUILD_ID', 'abc1234+');
      vi.stubEnv('VITE_BENCH_OUTPUT', undefined);
      vi.stubEnv('VITE_BENCH_SVG', undefined);
      const plain = await definesOf(app);
      expect(plain.__SHMUP_BENCH_SVG__).toBe('"png"');
      expect(plain.__SHMUP_BENCH_BUILD_ID__).toBe('"abc1234+"');

      // The armed build: the encoding define flips and the identity carries the suffix (the
      // analyzer pools the rows under `code:<hash>|svg=e3`, never with the PNG rows).
      vi.stubEnv('VITE_BENCH_SVG', 'e3');
      const armed = await definesOf(app);
      expect(armed.__SHMUP_BENCH_SVG__).toBe('"e3"');
      expect(armed.__SHMUP_BENCH_BUILD_ID__).toBe('"abc1234++svg-e3"');

      // The full form with an output too: `+svg-e3` rides after `@<w>x<h>`.
      vi.stubEnv('VITE_BENCH_OUTPUT', '1280x720');
      expect((await definesOf(app)).__SHMUP_BENCH_BUILD_ID__).toBe('"abc1234+@1280x720+svg-e3"');

      // The png word is the default spelled out — no suffix; an unknown value fails the build.
      vi.stubEnv('VITE_BENCH_SVG', 'png');
      expect((await definesOf(app)).__SHMUP_BENCH_BUILD_ID__).toBe('"abc1234+@1280x720"');
      vi.stubEnv('VITE_BENCH_SVG', 'jpeg');
      await expect(definesOf(app)).rejects.toThrow(/VITE_BENCH_SVG/);
    },
  );
});

/**
 * The TV render bench's **build output resolution** (the owner's R0-03 follow-up — part of the
 * `bench` module, see `./index.ts`).
 *
 * A bench built with `VITE_BENCH_OUTPUT=<width>x<height>` (e.g. `1280x720`) draws every scenario
 * into a canvas backbuffer of that size instead of the window's (1920×1080 on the M7); the canvas's
 * CSS size stays the whole window, so the TV's compositor scales the smaller backbuffer up to the
 * panel — what a real 720p / 540p output mode would do. Absent or empty, nothing changes: the
 * backbuffer is the window's, as it always was. The owner reruns the whole matrix this way at
 * 1280×720 and at 960×540, one build and one four-pass campaign each.
 *
 * With a build output ({@link benchScenarioSetup}):
 *
 * - a scenario whose own `outputWidth` is 0 uses the build output as its backbuffer; the knob rows
 *   with an explicit output (`out720`, `out540`) keep theirs;
 * - plain rows, and knob rows without a `scaleMode`, upscale with {@link BENCH_OUTPUT_SCALE_MODE}
 *   (`'fit'`) — with `integer`, 640×360 on a 960×540 backbuffer is drawn ×1 and does not fill the
 *   screen, which no real 540p mode would ship; knob rows that set a `scaleMode` keep it;
 * - a scenario whose internal frame is wider or taller than its backbuffer is **skipped** without
 *   being launched (`./state.ts` `skipPlannedScenarios` moves the cursor past it, no record is
 *   posted) and the results page lists it as skipped. Indexes and `BENCH_SCENARIOS` stay exactly as
 *   they are, so the sessions of every build line up row for row.
 *
 * **Build identity.** The bench build composes its build id with {@link benchBuildId} —
 * `<__SHMUP_BUILD__>@<width>x<height>` with an output, `__SHMUP_BUILD__` alone without — and
 * defines it as `__SHMUP_BENCH_BUILD_ID__`, so the string is a literal `buildId:` value in the
 * minified `app.js`. The campaign orchestrator (`scripts/bench-campaign.mjs` `parseBuildId`) reads
 * it from there and ignores payloads of any other build, and `./campaign.ts` `campaignFor` only
 * reuses a stored campaign of the same build id — so the 720p, 540p and window-sized campaigns
 * never mix.
 *
 * Everything here is pure; both `vite.bench.config.ts` files call {@link parseBenchOutput} and
 * {@link benchBuildId} at build time, `./main.ts` and `./run.ts` the rest at run time.
 *
 * @module
 */
import type { ScaleMode } from '@shmup/core';
import { BENCH_SCENARIOS, type BenchScenario } from './matrix.js';

/** One build output resolution: the canvas backbuffer every scenario without its own draws into. */
export interface BenchOutput {
  /** `'<width>x<height>'`, normalised (e.g. `'1280x720'`). */
  readonly id: string;
  /** Backbuffer width in pixels. */
  readonly width: number;
  /** Backbuffer height in pixels. */
  readonly height: number;
}

/** Largest backbuffer side `VITE_BENCH_OUTPUT` accepts (WebGL drawing buffers stop well before). */
export const BENCH_MAX_OUTPUT_SIDE = 8192;

/**
 * The upscale mode of plain rows (and knob rows without their own) when a build output is set.
 */
export const BENCH_OUTPUT_SCALE_MODE: ScaleMode = 'fit';

/**
 * Parses `VITE_BENCH_OUTPUT`.
 *
 * @param text - `'<width>x<height>'` (`x` or `X`, surrounding blanks ignored), or `''` for none.
 * @returns The output, or `null` for an empty value (the window's backbuffer, as before).
 * @throws {Error} For anything else — a malformed value, a zero or a leading zero, or a side over
 *   {@link BENCH_MAX_OUTPUT_SIDE}. The bench configs call this at build time, so a typo fails the
 *   build instead of silently producing a window-sized bench (whose build id would then collide
 *   with the real one's).
 *
 * @example
 * ```ts
 * parseBenchOutput('1280x720'); // → { id: '1280x720', width: 1280, height: 720 }
 * parseBenchOutput('');         // → null
 * ```
 */
export function parseBenchOutput(text: string): BenchOutput | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const match = /^([1-9]\d*)[xX]([1-9]\d*)$/.exec(trimmed);
  const width = match === null ? 0 : Number(match[1]);
  const height = match === null ? 0 : Number(match[2]);
  if (match === null || width > BENCH_MAX_OUTPUT_SIDE || height > BENCH_MAX_OUTPUT_SIDE) {
    throw new Error(
      `render bench: VITE_BENCH_OUTPUT must be <width>x<height> (each 1-${BENCH_MAX_OUTPUT_SIDE}, ` +
        `e.g. 1280x720) or empty, not "${text}"`,
    );
  }
  return { id: `${width}x${height}`, width, height };
}

/**
 * The build id a bench build reports and keys its campaign on.
 *
 * @param build - The bundle's build id (`__SHMUP_BUILD__`, e.g. `'9e60df2+'`).
 * @param output - The build output, or `null`.
 * @returns `build` unchanged without an output; `'<build>@<width>x<height>'` with one (e.g.
 *   `'9e60df2+@1280x720'`).
 */
export function benchBuildId(build: string, output: BenchOutput | null): string {
  return output === null ? build : `${build}@${output.id}`;
}

/** How one scenario runs in a build: its backbuffer, its upscale mode, or why it is skipped. */
export interface BenchScenarioSetup {
  /** Canvas backbuffer width in pixels, or 0 for the window's. */
  readonly outputWidth: number;
  /** Canvas backbuffer height in pixels, or 0 for the window's. */
  readonly outputHeight: number;
  /** Upscale mode of the frame into the backbuffer. */
  readonly scaleMode: ScaleMode;
  /**
   * Why the scenario is skipped without being launched (its frame is larger than its backbuffer),
   * or `null` when it runs.
   */
  readonly skip: string | null;
}

/**
 * How a scenario runs in a build (see the module docs).
 *
 * @param scenario - The scenario.
 * @param output - The build output, or `null`.
 * @returns Without an output, the scenario's own settings and never a skip (today's behaviour);
 *   with one, its backbuffer (its own, else the build's), its upscale mode (its knob's, else
 *   {@link BENCH_OUTPUT_SCALE_MODE}) and a skip reason when its frame does not fit the backbuffer.
 */
export function benchScenarioSetup(
  scenario: BenchScenario,
  output: BenchOutput | null,
): BenchScenarioSetup {
  if (output === null) {
    return {
      outputWidth: scenario.outputWidth,
      outputHeight: scenario.outputHeight,
      scaleMode: scenario.scaleMode,
      skip: null,
    };
  }
  const own = scenario.outputWidth > 0 && scenario.outputHeight > 0;
  const width = own ? scenario.outputWidth : output.width;
  const height = own ? scenario.outputHeight : output.height;
  const knobMode = scenario.knob === null ? null : scenario.knob.scaleMode;
  const { size } = scenario;
  return {
    outputWidth: width,
    outputHeight: height,
    scaleMode: knobMode ?? BENCH_OUTPUT_SCALE_MODE,
    skip:
      size.width > width || size.height > height
        ? `frame ${size.width}x${size.height} larger than the output ${width}x${height}`
        : null,
  };
}

/**
 * The scenarios a build skips.
 *
 * @param output - The build output, or `null`.
 * @returns The scenarios whose {@link benchScenarioSetup} has a skip reason, in matrix order —
 *   none without an output.
 */
export function benchSkippedScenarios(output: BenchOutput | null): BenchScenario[] {
  const out: BenchScenario[] = [];
  if (output === null) return out;
  for (let i = 0; i < BENCH_SCENARIOS.length; i++) {
    if (benchScenarioSetup(BENCH_SCENARIOS[i], output).skip !== null) out.push(BENCH_SCENARIOS[i]);
  }
  return out;
}

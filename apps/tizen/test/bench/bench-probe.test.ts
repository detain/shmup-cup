/**
 * The `hb-` probe page body (plan v20x PAGES S4, `src/bench/probe.ts`) in Node: the capability
 * census against a scripted host — extension lists, the ETC smoke chosen by the list and refused
 * when the upload answers, the WebGL 2 absence that is an EXPECTED TV answer and not an error,
 * and the missing-WebGL-1 case that is — plus the wire gate on every record it builds.
 */
import { describe, expect, it } from 'vitest';
import {
  PROBE_ETC_FORMATS,
  PROBE_PAGE_ID,
  PROBE_SMOKE_BLOCK_BYTES,
  PROBE_SMOKE_REPETITIONS,
  measureProbe,
  type ProbeContext,
  type ProbeHost,
} from '../../src/bench/index.js';
import { harbWireIssues } from './fake-harb-env.js';

const WEBGL_EXTENSIONS = [
  'OES_element_index_uint',
  'WEBGL_compressed_texture_etc',
  'EXT_color_buffer_half_float',
];

/**
 * A context over a scripted extension list.
 *
 * @param extensions - What it answers for `supportedExtensions`.
 * @param smokeOk - Whether `compressedTexImage2D` succeeds.
 * @param log - Where releases are noted.
 * @returns The context.
 */
function fakeContext(extensions: readonly string[], smokeOk: boolean, log: string[]): ProbeContext {
  let t = 0;
  return {
    supportedExtensions: () => extensions.slice(),
    compressedSmokeMs: (extension, format, block) => {
      if (extensions.indexOf(extension) < 0) return null;
      if (block.length !== PROBE_SMOKE_BLOCK_BYTES || !Number.isInteger(format)) return null;
      if (!smokeOk) return null;
      t += 1;
      return 0.3 + t * 0.01;
    },
    release: () => {
      log.push('release');
    },
  };
}

/**
 * A scripted probe host.
 *
 * @param options - What the engine has.
 * @returns The host and its release log.
 */
function scriptedProbe(options?: {
  readonly webgl?: readonly string[] | null;
  readonly webgl2?: readonly string[] | null;
  readonly smokeOk?: boolean;
  readonly deviceMemory?: number | null;
  readonly cores?: number | null;
  readonly offscreen?: boolean;
  readonly reduceMotion?: boolean;
}): { host: ProbeHost; log: string[] } {
  const log: string[] = [];
  let t = 0;
  const list1 = options?.webgl === undefined ? WEBGL_EXTENSIONS : options.webgl;
  const list2 = options?.webgl2 === undefined ? null : options.webgl2;
  const host: ProbeHost = {
    time: () => (t += 1),
    createContext: (kind) => {
      if (kind === 'webgl')
        return list1 === null ? null : fakeContext(list1, options?.smokeOk ?? true, log);
      return list2 === null ? null : fakeContext(list2, options?.smokeOk ?? true, log);
    },
    hasOffscreenCanvas: () => options?.offscreen ?? true,
    reduceMotionResolves: () => options?.reduceMotion ?? false,
    deviceMemoryGiB: () => (options?.deviceMemory === undefined ? 2 : options.deviceMemory),
    hardwareConcurrency: () => (options?.cores === undefined ? 4 : options.cores),
  };
  return { host, log };
}

describe('hb- probe page (plan v20x PAGES S4)', () => {
  it('censuses extensions, runs the ETC smoke and passes the wire validator', () => {
    const { host, log } = scriptedProbe();
    const row = measureProbe(host, {
      repetitions: PROBE_SMOKE_REPETITIONS,
      wallClock: () => 1_760_000_000_000,
    });
    expect(row.record).toBe('probe');
    expect(row.scenario).toBe(PROBE_PAGE_ID);
    expect(row.webglExtensions).toEqual(WEBGL_EXTENSIONS);
    expect(row.webgl2Extensions).toBeNull(); // no error: these TVs answer WebGL 2 with null
    expect(row.deviceMemory).toBe(2);
    expect(row.hardwareConcurrency).toBe(4);
    expect(row.offscreenCanvas).toBe(true);
    expect(row.reduceMotionResolves).toBe(false);
    expect(row.smokeUploadMs).not.toBeNull();
    expect(row.smokeUploadMs).toHaveLength(4);
    expect(row.error).toBeNull();
    expect(log).toEqual(['release']); // only the WebGL 1 context existed to release
    expect(harbWireIssues(row)).toEqual([]);
  });

  it('prefers the ETC2 candidate when the WebGL 2 list carries it', () => {
    const { host } = scriptedProbe({
      webgl: ['OES_element_index_uint'],
      webgl2: ['WEBGL_compressed_texture_etc2'],
    });
    const row = measureProbe(host, { repetitions: 2, wallClock: () => 1_760_000_000_000 });
    expect(row.webgl2Extensions).toEqual(['WEBGL_compressed_texture_etc2']);
    expect(row.smokeUploadMs).not.toBeNull();
    expect(row.error).toBeNull();
    expect(harbWireIssues(row)).toEqual([]);
  });

  it('notes a refused smoke upload and keeps the census', () => {
    const { host } = scriptedProbe({ smokeOk: false });
    const row = measureProbe(host, { repetitions: 4, wallClock: () => 1_760_000_000_000 });
    expect(row.smokeUploadMs).toBeNull();
    expect(row.error).toContain('smoke upload refused');
    expect(row.webglExtensions).toEqual(WEBGL_EXTENSIONS);
    expect(harbWireIssues(row)).toEqual([]);
  });

  it('fails loud when the WebGL 1 context itself is refused', () => {
    const { host } = scriptedProbe({ webgl: null });
    const row = measureProbe(host, { repetitions: 2, wallClock: () => 1_760_000_000_000 });
    expect(row.webglExtensions).toEqual([]);
    expect(row.error).toContain('webgl context unavailable');
    expect(row.smokeUploadMs).toBeNull();
    expect(harbWireIssues(row)).toEqual([]);
  });

  it('answers null for capabilities the engine does not announce', () => {
    const { host } = scriptedProbe({ deviceMemory: null, cores: null, offscreen: false });
    const row = measureProbe(host, { repetitions: 1, wallClock: () => 1_760_000_000_000 });
    expect(row.deviceMemory).toBeNull();
    expect(row.hardwareConcurrency).toBeNull();
    expect(row.offscreenCanvas).toBe(false);
    expect(harbWireIssues(row)).toEqual([]);
  });
});

describe('hb- probe page constants', () => {
  it('names the ETC candidates in the ETC2-first order', () => {
    expect(PROBE_SMOKE_BLOCK_BYTES).toBe(8);
    expect(PROBE_ETC_FORMATS[0].extension).toBe('WEBGL_compressed_texture_etc2');
    expect(PROBE_ETC_FORMATS[0].format).toBe(0x9278);
    expect(PROBE_ETC_FORMATS[1].extension).toBe('WEBGL_compressed_texture_etc');
    expect(PROBE_ETC_FORMATS[1].format).toBe(0x8c63);
  });
});

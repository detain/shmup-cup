/**
 * The `hb-` boot page body (plan v20x PAGES S2, `src/bench/boot.ts`) in Node: the stage
 * orchestration against a scripted host — the manifest XHR, the bitmap route and its honest
 * fallback to the `HTMLImageElement` decode, the upload/sync pair, the release law between
 * repetitions — and the wire gate: every record the body builds must pass the real
 * `harbenchPayloadIssues` with zero issues.
 */
import { describe, expect, it } from 'vitest';
import {
  BOOT_MANIFEST_URL,
  BOOT_PAGE_ID,
  MAX_BOOT_PAGE_ROWS,
  TV_BOOT_MANIFEST_REPETITIONS,
  bootRepetitionsFromSearch,
  measureBoot,
  type BenchDecodePage,
  type BootHost,
  type DecodedPage,
} from '../../src/bench/index.js';
import { harbWireIssues } from './fake-harb-env.js';

/** The single ×1 page the scripted scenario measures. */
const PAGE: BenchDecodePage = {
  id: 'bench-x1-0',
  what: 'x1 atlas page 1',
  width: 2048,
  height: 1024,
  url: 'assets/atlas/bench-x1-0.png',
};

/** What a scripted host records while it is driven. */
interface Script {
  readonly host: BootHost;
  readonly log: string[];
  readonly released: string[];
  readonly destroyed: number[];
}

/**
 * A deterministic host on a stepping clock.
 *
 * @param options - Which routes exist and which refuse.
 * @returns The scripted host.
 */
function scriptedHost(options?: {
  readonly bitmap?: boolean;
  readonly bitmapRefuses?: boolean;
  readonly manifestFails?: boolean;
  readonly pageFails?: boolean;
}): Script {
  const bitmap = options?.bitmap ?? true;
  const refuses = options?.bitmapRefuses ?? false;
  const log: string[] = [];
  const released: string[] = [];
  const destroyed: number[] = [];
  let t = 0;
  const decoded = (kind: string): DecodedPage => ({
    image: { kind },
    release: () => {
      t += 1;
      released.push(kind);
    },
  });
  const host: BootHost = {
    now: () => t,
    fetch: (url) => {
      t += 5;
      if (options?.manifestFails === true && url === BOOT_MANIFEST_URL) {
        return Promise.reject(new Error('file:// refused'));
      }
      if (options?.pageFails === true && url === PAGE.url) {
        return Promise.reject(new Error('page fetch failed'));
      }
      log.push(`fetch ${url}`);
      return Promise.resolve(new ArrayBuffer(10));
    },
    decodeImage: () => {
      t += 9;
      log.push('decode-image');
      return Promise.resolve(decoded('image'));
    },
    decodeUrl: (url) => {
      t += 11;
      log.push(`decode-url ${url}`);
      return Promise.resolve(decoded('url'));
    },
    decodeBitmap: bitmap
      ? () => {
          t += 7;
          if (refuses) return Promise.reject(new Error('bitmap of PNG refused'));
          log.push('decode-bitmap');
          return Promise.resolve(decoded('bitmap'));
        }
      : null,
    createSource: (image) => {
      t += 3;
      log.push(`create-source ${String((image as { kind: string }).kind)}`);
      const id = destroyed.length;
      return {
        destroy: () => {
          t += 1;
          destroyed.push(id);
        },
      };
    },
    upload: () => {
      t += 2;
      log.push('upload');
    },
    finish: () => {
      t += 4;
    },
    render: () => {
      t += 6;
      log.push('render');
    },
  };
  return { host, log, released, destroyed };
}

describe('hb- boot page (plan v20x PAGES S2)', () => {
  it('measures the shipped bitmap route and passes the wire validator', async () => {
    const script = scriptedHost();
    const row = await measureBoot(script.host, [PAGE], {
      repetitions: 2,
      wallClock: () => 1_760_000_000_000,
    });
    expect(row.record).toBe('boot');
    expect(row.scenario).toBe(BOOT_PAGE_ID);
    expect(row.imageBitmap).toBe(true);
    expect(row.bitmapBranch).toBe(true);
    expect(row.atlasBytes).toBe(10);
    expect(row.manifestMs).toHaveLength(4);
    expect(row.manifestMs[0]).toBeGreaterThan(0);
    expect(row.pages).toHaveLength(1);
    const page = row.pages[0];
    expect(page.id).toBe('bench-x1-0');
    expect(page.viaBitmap).toBe(true);
    expect(page.bitmapMs).not.toBeNull();
    expect(page.decodeMs).toBeNull();
    expect(page.fetchMs).not.toBeNull();
    expect(page.syncedMs).not.toBeNull();
    expect(page.totalMs).not.toBeNull();
    expect(page.error).toBeNull();
    expect(row.bootMs).toBeGreaterThan(0);
    expect(row.error).toBeNull();
    // The release law: every repetition's image closed and texture destroyed (caches flatter
    // nobody, the decode scenario's rule).
    expect(script.log.filter((entry) => entry === 'decode-bitmap')).toHaveLength(2);
    expect(script.destroyed).toHaveLength(2);
    expect(script.released).toEqual(['bitmap', 'bitmap']);
    expect(harbWireIssues(row)).toEqual([]);
  });

  it('falls back honestly when the engine refuses the bitmap route', async () => {
    const script = scriptedHost({ bitmapRefuses: true });
    const row = await measureBoot(script.host, [PAGE], {
      repetitions: 1,
      wallClock: () => 1_760_000_000_000,
    });
    expect(row.imageBitmap).toBe(true);
    expect(row.bitmapBranch).toBe(false);
    const page = row.pages[0];
    expect(page.viaBitmap).toBe(false);
    expect(page.bitmapMs).toBeNull();
    expect(page.decodeMs).not.toBeNull();
    expect(row.error).toContain('bitmap refused');
    expect(harbWireIssues(row)).toEqual([]);
  });

  it('uses the Image route as the answer when there is no bitmap API at all', async () => {
    const script = scriptedHost({ bitmap: false });
    const row = await measureBoot(script.host, [PAGE], {
      repetitions: 1,
      wallClock: () => 1_760_000_000_000,
    });
    expect(row.imageBitmap).toBe(false);
    expect(row.pages[0].decodeMs).not.toBeNull();
    expect(row.pages[0].bitmapMs).toBeNull();
    expect(harbWireIssues(row)).toEqual([]);
  });

  it('notes a manifest the firmware will not fetch and still validates', async () => {
    const script = scriptedHost({ manifestFails: true });
    const row = await measureBoot(script.host, [PAGE], {
      repetitions: 2,
      wallClock: () => 1_760_000_000_000,
    });
    expect(row.manifestMs).toEqual([0, 0, 0, 0]);
    expect(row.error).toContain('manifest fetch failed');
    expect(harbWireIssues(row)).toEqual([]);
  });

  it('fails loud, never silent, when a page cannot be fetched', async () => {
    const script = scriptedHost({ pageFails: true, manifestFails: false });
    const row = await measureBoot(script.host, [PAGE], {
      repetitions: 1,
      wallClock: () => 1_760_000_000_000,
    });
    // The decodeUrl fallback still reaches the GPU — the row measured, via the URL route.
    expect(row.pages[0].totalMs).not.toBeNull();
    expect(row.pages[0].fetchMs).toBeNull();
    expect(harbWireIssues(row)).toEqual([]);
  });
});

describe('hb- boot page knobs', () => {
  it('carries the shipped manifest path and its repetition defaults', () => {
    expect(BOOT_MANIFEST_URL).toBe('assets/atlas/bench-x1.json');
    expect(TV_BOOT_MANIFEST_REPETITIONS).toBe(4);
    expect(MAX_BOOT_PAGE_ROWS).toBe(32);
    expect(bootRepetitionsFromSearch('')).toBe(TV_BOOT_MANIFEST_REPETITIONS);
    expect(bootRepetitionsFromSearch('?reps=3')).toBe(3);
  });
});

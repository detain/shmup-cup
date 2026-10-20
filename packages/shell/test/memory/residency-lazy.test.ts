/**
 * The lazy residency (plan R3-04.M3b, decision W5-15): over an atlas whose pages start unloaded,
 * `prepare` detaches every page the stage does not need (with its decoded image), fetches and
 * decodes the needed pages that are not attached yet — in parallel through the loader — attaches
 * them and uploads them, and reports through the same `onChange` contract as the eager residency;
 * it is idempotent, retries a failed load at the next prepare, skips a throwing upload like the
 * eager pass does, yields the GPU pass and the report to a newer prepare when superseded (the
 * images it attached stay until the next prepare drops what that stage does not need), and holds
 * the `loading` flag across its await (R3-04.M3c polls it per frame — never here).
 *
 * Over the shipped content and atlas (zone-split since R1-05), written with the needs read
 * through {@link stagePages} so it holds on any atlas whose zones need different page sets.
 */
import type { AtlasManifest, AtlasPageImage } from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../../../vite.shared.js';
import { AssetLoadError, loadGameContent } from '../../src/loader/index.js';
import {
  atlasPageNeeds,
  createAtlasResidency,
  createLazyAtlasResidency,
  stagePages,
  stageSpriteSets,
  type AtlasLazyPages,
  type AtlasPageImageLoader,
  type AtlasPageLike,
  type LazyAtlasResidency,
} from '../../src/memory/index.js';

const { db } = loadGameContent(readContentFiles());
const manifest = buildAtlas().manifest as unknown as AtlasManifest;
const needs = atlasPageNeeds(manifest, db.sprites.names, stageSpriteSets(db));
const pageCount = manifest.pages.length;

/**
 * A stage's index in the content.
 *
 * @param id - The stage id.
 * @returns The index.
 */
const stage = (id: string): number => {
  const index = db.stageIndex.get(id);
  if (index === undefined) throw new Error(`no stage ${id}`);
  return index;
};

const ZONE_A = stage('zone-a');
const ZONE_B = stage('zone-b');

/**
 * Set difference of two ascending page lists.
 *
 * @param a - Pages to keep the ones of…
 * @param b - …not in this list.
 * @returns The pages of `a` that `b` lacks, ascending.
 */
function without(a: readonly number[], b: readonly number[]): number[] {
  return a.filter((p) => b.indexOf(p) < 0);
}

/**
 * A decoded page image — the size a real page's image would carry (the fake atlas does not
 * validate it; `atlas-deferred.test.ts` checks the real `Atlas.loadPage` does).
 *
 * @param page - The page index.
 * @returns The fake image.
 */
function fakeImage(page: number): AtlasPageImage {
  const entry = manifest.pages[page];
  return {
    width: entry.w,
    height: entry.h,
    naturalWidth: entry.w,
    naturalHeight: entry.h,
  } as unknown as AtlasPageImage;
}

/** The lazy fixture: residency, fake atlas, and everything the hooks saw. */
interface Fixture {
  readonly residency: LazyAtlasResidency;
  /** Log lines, in order: `unload:<p>`, `drop:<p>`, `fetch:<p>`, `load:<p>`, `upload:<p>`, `change:<pages>|<unloads>|<ms>`. */
  readonly calls: string[];
  /** Per page: attached to the fake atlas now. */
  readonly attached: boolean[];
  /** `fetch:` calls issued per page (a retry counts twice). */
  readonly fetches: number[];
  /** The most `fetch` calls ever in flight at once. */
  maxInFlight(): number;
}

/**
 * A lazy residency over fake pages and a fake deferred atlas.
 *
 * @param options - `failLoads`: pages whose load rejects (each once, then it recovers);
 *   `failUploads`: pages whose upload throws (each once); `gate`: awaited inside every fetch;
 *   `clock`: a fake clock.
 * @returns The fixture.
 */
function lazy(
  options: {
    failLoads?: Set<number>;
    failUploads?: Set<number>;
    gate?: (page: number) => Promise<void>;
    clock?: () => number;
  } = {},
): Fixture {
  const calls: string[] = [];
  const attached = new Array<boolean>(pageCount).fill(false);
  const fetches = new Array<number>(pageCount).fill(0);
  const pages: AtlasPageLike[] = manifest.pages.map((_page, p): AtlasPageLike => ({
    unload: () => calls.push(`unload:${p}`),
  }));
  const atlas: AtlasLazyPages = {
    loadPage(page: number): void {
      attached[page] = true;
      calls.push(`load:${page}`);
    },
    unloadPage(page: number): void {
      if (attached[page]) calls.push(`drop:${page}`);
      attached[page] = false;
    },
    isPageLoaded(page: number): boolean {
      return attached[page];
    },
  };
  let inFlight = 0;
  let peak = 0;
  const loadImage: AtlasPageImageLoader = async (page: number): Promise<AtlasPageImage> => {
    fetches[page]++;
    calls.push(`fetch:${page}`);
    inFlight++;
    peak = Math.max(peak, inFlight);
    if (options.gate !== undefined) await options.gate(page);
    inFlight--;
    if (options.failLoads?.delete(page) === true) {
      throw new AssetLoadError(`page-${page}.png`);
    }
    return fakeImage(page);
  };
  const residency = createLazyAtlasResidency(pages, needs, {
    upload: (p) => {
      if (options.failUploads?.delete(p) === true) throw new Error('upload failed');
      calls.push(`upload:${p}`);
    },
    onChange: (resident, unloads, ms) =>
      calls.push(`change:${resident.join(',')}|${unloads}|${ms}`),
    now: options.clock,
    lazy: { atlas, loadImage },
  });
  return { residency, calls, attached, fetches, maxInFlight: () => peak };
}

describe('shell/memory lazy atlas residency (R3-04.M3b)', () => {
  it('starts with nothing attached and nothing resident, and reports the resident image policy', () => {
    const f = lazy();
    expect(f.residency.imagePolicy).toBe('resident');
    expect(f.residency.loading).toBe(false);
    expect(f.residency.resident.every((r) => !r)).toBe(true);
    // The eager residency reports the policy it runs under (W3-2).
    const eagerResidency = createAtlasResidency(
      manifest.pages.map((): AtlasPageLike => ({ unload: () => undefined })),
      needs,
    );
    expect(eagerResidency.imagePolicy).toBe('all');
    expect(eagerResidency.resident.every((r) => r)).toBe(true);
  });

  it('prepare loads the needed pages, uploads them, and detaches the rest', async () => {
    const f = lazy();
    const needed = stagePages(needs, ZONE_A);
    expect(needed.length).toBeLessThan(pageCount);
    await f.residency.prepare(ZONE_A);
    expect(f.attached).toEqual(manifest.pages.map((_, p) => needed.indexOf(p) >= 0).map(Boolean));
    expect(f.residency.resident).toEqual(manifest.pages.map((_, p) => needed.indexOf(p) >= 0));
    expect(f.residency.loading).toBe(false);
    // Unloads stay 0: the residency believed no page resident, and the detach pass only
    // counted what it believed (self-heal calls `unload` on all of them, resident or not).
    expect(f.residency.unloads).toBe(0);
    expect(f.residency.uploads).toBe(needed.length);
    // The first prepare always reports, with the stage's pages and no time (no clock).
    expect(f.calls[f.calls.length - 1]).toBe(`change:${needed.join(',')}|0|0`);
    // Every needed page was fetched once then loaded before its upload…
    for (const p of needed) {
      expect(f.fetches[p]).toBe(1);
      expect(f.calls.indexOf(`fetch:${p}`)).toBeLessThan(f.calls.indexOf(`upload:${p}`));
    }
    // …and pages the stage does not need saw `unload` (the self-healing rule) but no drop.
    for (const p of without(
      manifest.pages.map((_, q) => q),
      needed,
    )) {
      expect(f.calls.indexOf(`unload:${p}`)).toBeGreaterThanOrEqual(0);
      expect(f.calls.indexOf(`drop:${p}`)).toBe(-1);
    }
  });

  it('a repeated prepare loads nothing, uploads nothing and reports nothing', async () => {
    const f = lazy();
    await f.residency.prepare(ZONE_A);
    const before = f.calls.length;
    await f.residency.prepare(ZONE_A);
    // The self-heal `unload` pass runs again (unload: lines), but nothing loads, uploads or
    // reports: no new fetch:, load:, upload: or change: line.
    expect(f.calls.slice(before).some((c) => /^(fetch|load|upload|change):/.test(c))).toBe(false);
    expect(f.residency.uploads).toBe(stagePages(needs, ZONE_A).length);
  });

  it('a zone change drops the old zone pages with their images', async () => {
    const f = lazy();
    await f.residency.prepare(ZONE_A);
    const aOnly = without(stagePages(needs, ZONE_A), stagePages(needs, ZONE_B));
    expect(aOnly.length).toBeGreaterThan(0);
    f.calls.length = 0;
    await f.residency.prepare(ZONE_B);
    for (const p of aOnly) {
      expect(f.attached[p]).toBe(false);
      expect(f.calls).toContain(`drop:${p}`);
    }
    for (const p of stagePages(needs, ZONE_B)) expect(f.attached[p]).toBe(true);
    expect(f.residency.unloads).toBe(aOnly.length);
    expect(
      f.residency.resident
        .map((r, p) => (r ? p : -1))
        .filter((p) => p >= 0)
        .join(','),
    ).toBe(stagePages(needs, ZONE_B).join(','));
  });

  it('prepare(-1) — menus, dev scenes, linked stages — loads every page and drops none (W5-18)', async () => {
    const f = lazy();
    await f.residency.prepare(ZONE_A);
    f.calls.length = 0;
    await f.residency.prepare(-1);
    expect(f.attached.every(Boolean)).toBe(true);
    expect(f.calls.some((c) => c.startsWith('drop:'))).toBe(false);
    expect(f.calls.some((c) => c.startsWith('unload:'))).toBe(false);
    expect(f.calls[f.calls.length - 1]).toBe(
      `change:${manifest.pages.map((_, p) => p).join(',')}|0|0`,
    );
  });

  it('the page loads of one prepare run in parallel', async () => {
    const f = lazy({ gate: () => Promise.resolve() });
    await f.residency.prepare(ZONE_A);
    // Every needed page was in flight before the first resolved.
    expect(f.maxInFlight()).toBe(stagePages(needs, ZONE_A).length);
  });

  it('a failed load rejects the prepare after its detach pass, and the next prepare retries', async () => {
    const needed = stagePages(needs, ZONE_A);
    const failing = needed[0];
    const f = lazy({ failLoads: new Set([failing]) });
    await expect(f.residency.prepare(ZONE_A)).rejects.toBeInstanceOf(AssetLoadError);
    expect(f.residency.loading).toBe(false);
    expect(f.attached[failing]).toBe(false);
    // The detach pass ran: pages the stage does not need saw `unload`.
    for (const p of without(
      manifest.pages.map((_, q) => q),
      needed,
    )) {
      expect(f.calls.indexOf(`unload:${p}`)).toBeGreaterThanOrEqual(0);
    }
    // A failed prepare uploads nothing (the needed set is not complete) and reports nothing.
    expect(f.calls.some((c) => c.startsWith('upload:'))).toBe(false);
    // The load that succeeded during the rejected Promise.all is not attached (its page was in
    // the same missing set — the whole prepare gave up). Retry: everything needed comes in.
    await f.residency.prepare(ZONE_A);
    for (const p of needed) expect(f.attached[p]).toBe(true);
    expect(f.fetches[failing]).toBe(2);
    expect(f.residency.uploads).toBe(needed.length);
  });

  it('a throwing upload is skipped and retried by the next prepare', async () => {
    const needed = stagePages(needs, ZONE_A);
    const f = lazy({ failUploads: new Set([needed[0]]) });
    await f.residency.prepare(ZONE_A);
    expect(f.residency.uploads).toBe(needed.length - 1);
    await f.residency.prepare(ZONE_A);
    expect(f.residency.uploads).toBe(needed.length);
  });

  it('a superseded prepare attaches its images but leaves the GPU pass and the report to the newer one', async () => {
    const aOnly = without(stagePages(needs, ZONE_A), stagePages(needs, ZONE_B));
    expect(aOnly.length).toBeGreaterThan(0);
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const openGate = (): void => {
      if (release !== null) release();
    };
    const f = lazy({ gate: () => gate });
    const first = f.residency.prepare(ZONE_A);
    expect(f.residency.loading).toBe(true);
    const second = f.residency.prepare(ZONE_B);
    openGate();
    await Promise.all([first, second]);
    expect(f.residency.loading).toBe(false);
    // A's images arrived (decoded bytes worth keeping) — and A's pages are NOT resident: B's
    // detach pass ran before they were attached, so `drop` saw nothing, and the residency
    // counts them unloaded only from what it believed resident (A's own pass marked them).
    for (const p of aOnly) expect(f.attached[p]).toBe(true);
    // B's report is the last change line, and it names B's pages: A's pass marked its pages
    // resident, so B's detach counted A's own pages as unloaded.
    expect(f.calls[f.calls.length - 1]).toBe(
      `change:${stagePages(needs, ZONE_B).join(',')}|${aOnly.length}|0`,
    );
    // The next prepare drops the leftovers with their images.
    f.calls.length = 0;
    await f.residency.prepare(ZONE_B);
    for (const p of aOnly) {
      expect(f.attached[p]).toBe(false);
      expect(f.calls).toContain(`drop:${p}`);
    }
  });

  it('the last prepare that changed something keeps its time on the clock', async () => {
    let t = 1000;
    const f = lazy({ clock: () => (t += 7) });
    await f.residency.prepare(ZONE_A);
    expect(f.residency.lastPrepareMs).toBeGreaterThan(0);
    const changed = f.residency.lastPrepareMs;
    await f.residency.prepare(ZONE_A);
    expect(f.residency.lastPrepareMs).toBe(changed);
  });
});

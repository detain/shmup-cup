/**
 * Allocation guard of the lazy residency's steady state (plan R3-04.M3b, zero-allocation rule):
 * once a stage's pages are in, the frame loop polls {@link LazyAtlasResidency.loading} every frame
 * to decide whether to hold the sim (plan R3-04.M3c) and reads `resident` when it does. None of
 * that may allocate. (A prepare is a stage change, never a frame; the guard measures the settled
 * residency between prepares.) Kept in its own file, away from suites that build many objects
 * (docs/dev/conventions.md).
 */
import type { AtlasManifest, AtlasPageImage } from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../../../vite.shared.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';
import { loadGameContent } from '../../src/loader/index.js';
import {
  atlasPageNeeds,
  createLazyAtlasResidency,
  stageSpriteSets,
  type AtlasLazyPages,
  type AtlasPageImageLoader,
  type AtlasPageLike,
} from '../../src/memory/index.js';

const { db } = loadGameContent(readContentFiles());
const manifest = buildAtlas().manifest as unknown as AtlasManifest;
const needs = atlasPageNeeds(manifest, db.sprites.names, stageSpriteSets(db));

describe('shell/memory lazy residency allocation (R3-04.M3b)', () => {
  it('polls loading and resident, and repeats a settled prepare, without allocating', async () => {
    const attached = new Array<boolean>(manifest.pages.length).fill(false);
    const pages: AtlasPageLike[] = manifest.pages.map((): AtlasPageLike => ({
      unload: () => undefined,
    }));
    const atlas: AtlasLazyPages = {
      loadPage(page: number): void {
        attached[page] = true;
      },
      unloadPage(page: number): void {
        attached[page] = false;
      },
      isPageLoaded(page: number): boolean {
        return attached[page];
      },
    };
    const image = {
      width: manifest.pages[0].w,
      height: manifest.pages[0].h,
    } as unknown as AtlasPageImage;
    const loadImage: AtlasPageImageLoader = async (): Promise<AtlasPageImage> =>
      await Promise.resolve(image);
    const residency = createLazyAtlasResidency(pages, needs, {
      upload: () => undefined,
      onChange: () => undefined,
      now: () => 1,
      lazy: { atlas, loadImage },
    });
    const stage = db.stageIndex.get('zone-a') ?? -1;
    await residency.prepare(stage);
    expect(residency.loading).toBe(false);
    let seen = 0;
    const growth = measureHeapGrowth(
      (tick) => {
        // The frame loop's polling (plan R3-04.M3c): the flag and the resident table. The tick
        // only keeps the loop from being optimised into a constant; it selects no path.
        if (residency.loading) seen++;
        const resident = residency.resident;
        for (let p = 0; p < resident.length; p++) if (resident[p]) seen++;
        if (tick < 0) seen = -1;
      },
      10_000,
      20_000,
    );
    expect(seen).toBeGreaterThan(0);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});

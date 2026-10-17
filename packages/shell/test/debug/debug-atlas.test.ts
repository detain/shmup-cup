/**
 * The debug tools' R1-05 addition: `window.__shmupDebug.atlas` — the atlas residency for the
 * browser tests and the TV's remote inspector: which pages are on the GPU, the unload / upload
 * counts, the last stage change's time, and `prepare(stageId)`, which prepares a stage by id as a
 * stage change would (-1 for an id the content lacks). `null` without a residency.
 */
import { createGame, createHeadlessPlatform } from '@shmup/core';
import { createLayerStack, type AtlasManifest, type PixiRenderer } from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../../../vite.shared.js';
import { DEBUG_GLOBAL, createDebugTools, type ShmupDebugApi } from '../../src/debug/index.js';
import { loadGameContent } from '../../src/loader/index.js';
import {
  atlasPageNeeds,
  createAtlasResidency,
  stagePages,
  stageSpriteSets,
  type AtlasResidency,
} from '../../src/memory/index.js';

const renderer = {
  atlas: null,
  layers: createLayerStack(),
  webGLVersion: 1,
  drawCalls: -1,
  particles: null,
} as unknown as PixiRenderer;

const { db } = loadGameContent(readContentFiles());
const manifest = buildAtlas().manifest as unknown as AtlasManifest;
const needs = atlasPageNeeds(manifest, db.sprites.names, stageSpriteSets(db));

/**
 * Tools on a fake host with the shipped content.
 *
 * @param atlas - The residency to hand over (or none).
 * @returns The tools and the window they published on.
 */
function tools(atlas: AtlasResidency | null | undefined) {
  const game = createGame(createHeadlessPlatform(), {}, db);
  const win = new EventTarget() as unknown as Window;
  const created = createDebugTools({
    game,
    renderer,
    win,
    now: () => 0,
    bootMs: 0,
    sceneId: () => 'title',
    visibleWorld: () => null,
    atlas,
  });
  return { created, win };
}

describe('shell/debug __shmupDebug.atlas (R1-05)', () => {
  it('shows the residency and prepares a stage by id', () => {
    const uploads: number[] = [];
    const residency = createAtlasResidency(
      manifest.pages.map(() => ({ unload: () => {} })),
      needs,
      { upload: (p) => uploads.push(p) },
    );
    const { created, win } = tools(residency);
    const api = created.api.atlas;
    expect(api).not.toBeNull();
    expect((win as unknown as Record<string, ShmupDebugApi>)[DEBUG_GLOBAL].atlas).toBe(api);
    const zoneC = db.stageIndex.get('zone-c') ?? -1;
    const expected = stagePages(needs, zoneC);
    expect(api?.prepare('zone-c')).toBe(manifest.pages.length - expected.length);
    expect(api?.resident).toEqual(manifest.pages.map((_, p) => expected.indexOf(p) >= 0));
    expect(api?.unloads).toBe(manifest.pages.length - expected.length);
    expect(api?.uploads).toBe(expected.length);
    expect(uploads).toEqual(expected);
    expect(api?.lastPrepareMs).toBe(0);
    // An id the content lacks changes nothing.
    expect(api?.prepare('no-such-stage')).toBe(-1);
    expect(api?.uploads).toBe(expected.length);
    created.destroy();
  });

  it('is null without a residency', () => {
    for (const atlas of [null, undefined]) {
      const { created } = tools(atlas);
      expect(created.api.atlas).toBeNull();
      created.destroy();
    }
  });
});

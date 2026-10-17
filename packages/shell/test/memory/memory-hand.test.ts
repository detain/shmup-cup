/**
 * The memory estimate against a hand calculation (plan R1-05): for every campaign zone, the
 * estimate equals the sum worked out here from `manifest.pages` and the constants alone — the
 * GPU copies of the zone's pages, the decoded images of **every** page (policy "all": the shell
 * keeps them all, W3-2), the SFX bank and the zone's music set, the render targets (the frame
 * target, two pooled filter passes and three 1080p canvas buffers) and the 24 MiB heap — at the
 * current frame and at 640×360, and stays within budget. Written over whatever the atlas holds, so
 * it holds before and after lane A splits the atlas into zone pages.
 *
 * Also pinned: the budgets — audio 24 MiB (W3-5), the atlas share derived from the frame (26 MiB
 * at 384×216, 23 MiB at 640×360) —, the other image policies, and that engine, UI and scene-view
 * sprites keep their pages global even when a zone names them.
 */
import { ENGINE_SPRITES, FRAME_H, FRAME_W, UI_SPRITES } from '@shmup/core';
import { loadMusicContent, loadSfxContent } from '@shmup/audio-web';
import type { AtlasManifest } from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../../../vite.shared.js';
import { loadGameContent } from '../../src/loader/index.js';
import {
  AUDIO_BUDGET_BYTES,
  DEFAULT_DISPLAY,
  FILTER_TARGETS,
  HEAP_BASELINE_BYTES,
  MEMORY_BUDGET_BYTES,
  MIB,
  TEXTURE_BUDGET_BYTES,
  atlasPageNeeds,
  estimateMemory,
  estimateStageMemory,
  fixedTargetBytes,
  sfxBankBytes,
  stageMusicTracks,
  stagePages,
  stageSpriteSets,
  textureBudgetFor,
  trackBytes,
  type StageSpriteSets,
} from '../../src/memory/index.js';
import { SCENE_VIEW_SPRITES } from '../../src/scene-view/index.js';

const { db, foreign } = loadGameContent(readContentFiles());
const kind = (name: string) =>
  foreign.filter((file) => (file.data as { kind?: unknown }).kind === name);
const sfx = loadSfxContent(kind('sfx')).content;
const music = loadMusicContent(kind('music')).content;
const manifest = buildAtlas().manifest as unknown as AtlasManifest;
const needs = atlasPageNeeds(manifest, db.sprites.names, stageSpriteSets(db));

/** The campaign zones' stage indices. */
const zoneStages = (db.campaign?.zones ?? []).map((zone) => zone.stageId);

/** The v1 frame and the v2 frame (R2-01 flips core's constants from the first to the second). */
const V1_FRAME = { width: 384, height: 216 };
const V2_FRAME = { width: 640, height: 360 };

/**
 * The next power of two at or above a size, worked out here rather than by the module.
 *
 * @param n - A positive size.
 * @returns The power of two.
 */
const pow2 = (n: number): number => {
  let p = 1;
  while (p < n) p *= 2;
  return p;
};

/**
 * The render targets by hand: the frame target (exact), two pooled filter passes (power-of-two
 * rounded), the canvas's three buffers at 1080p.
 *
 * @param frame - The internal frame.
 * @returns Bytes.
 */
const handTargets = (frame: { width: number; height: number }): number =>
  frame.width * frame.height * 4 +
  pow2(frame.width) * pow2(frame.height) * 4 * 2 +
  1920 * 1080 * 4 * 3;

describe('shell/memory budgets (R1-05)', () => {
  it('gives the audio 24 MiB and the heap 24 MiB of the 100 MiB budget', () => {
    expect(MEMORY_BUDGET_BYTES).toBe(100 * MIB);
    expect(AUDIO_BUDGET_BYTES).toBe(24 * MIB);
    expect(HEAP_BASELINE_BYTES).toBe(24 * MIB);
    expect(FILTER_TARGETS).toBe(2);
    expect(DEFAULT_DISPLAY).toEqual({ width: 1920, height: 1080 });
  });

  it('pins the fixed render targets at both frames', () => {
    // 331 776 + 2 × 524 288 (512 × 256) + 24 883 200
    expect(fixedTargetBytes(V1_FRAME, DEFAULT_DISPLAY, FILTER_TARGETS)).toBe(26_263_552);
    expect(handTargets(V1_FRAME)).toBe(26_263_552);
    // 921 600 + 2 × 2 097 152 (1024 × 512) + 24 883 200
    expect(fixedTargetBytes(V2_FRAME, DEFAULT_DISPLAY, FILTER_TARGETS)).toBe(29_999_104);
    expect(handTargets(V2_FRAME)).toBe(29_999_104);
  });

  it('derives the atlas share from the frame: 26 MiB at 384×216, 23 MiB at 640×360', () => {
    // 104 857 600 − 25 165 824 − 25 165 824 − 26 263 552 = 28 262 400 → 26 MiB (floored).
    expect(textureBudgetFor(V1_FRAME)).toBe(26 * MIB);
    // 104 857 600 − 25 165 824 − 25 165 824 − 29 999 104 = 24 526 848 → 23 MiB.
    expect(textureBudgetFor(V2_FRAME)).toBe(23 * MIB);
    // The shipped constant follows core's frame, so R2-01's flip lowers it by itself.
    expect(TEXTURE_BUDGET_BYTES).toBe(textureBudgetFor({ width: FRAME_W, height: FRAME_H }));
    expect(TEXTURE_BUDGET_BYTES % MIB).toBe(0);
  });
});

describe('shell/memory estimate = the hand calculation, every campaign zone (R1-05)', () => {
  it.each([
    ['the current frame', { width: FRAME_W, height: FRAME_H }],
    ['384×216', V1_FRAME],
    ['640×360', V2_FRAME],
  ])('at %s', (_label, frame) => {
    expect(zoneStages.length).toBe(9);
    let allImages = 0;
    for (const page of manifest.pages) allImages += page.w * page.h * 4;
    const sfxBytes = sfxBankBytes(sfx);
    for (const stageIndex of zoneStages) {
      const stage = db.stages[stageIndex];
      let textures = 0;
      for (const p of stagePages(needs, stageIndex)) {
        textures += manifest.pages[p].w * manifest.pages[p].h * 4;
      }
      let musicBytes = 0;
      for (const track of stageMusicTracks(music, stage)) {
        musicBytes += trackBytes(music.tracks[track]);
      }
      const total = textures + allImages + sfxBytes + musicBytes + handTargets(frame) + 24 * MIB;
      const estimate = estimateStageMemory({
        content: db,
        manifest,
        sfx,
        music,
        stageIndex,
        needs,
        frame,
      });
      const report = `${stage.id}: ${(estimate.total / MIB).toFixed(2)} MiB`;
      expect(estimate.textures, report).toBe(textures);
      expect(estimate.images, report).toBe(allImages);
      expect(estimate.sfx, report).toBe(sfxBytes);
      expect(estimate.music, report).toBe(musicBytes);
      expect(estimate.targets, report).toBe(handTargets(frame));
      expect(estimate.heap, report).toBe(24 * MIB);
      expect(estimate.total, report).toBe(total);
      expect(estimate.withinBudget, report).toBe(true);
      expect(estimate.textures + estimate.images, report).toBeLessThanOrEqual(
        textureBudgetFor(frame),
      );
      expect(estimate.sfx + estimate.music, report).toBeLessThanOrEqual(24 * MIB);
    }
  });

  it('charges only the zone’s own images under the lazy policy, none without images', () => {
    const stageIndex = zoneStages[0];
    const all = estimateStageMemory({ content: db, manifest, sfx, music, stageIndex, needs });
    const resident = estimateStageMemory({
      content: db,
      manifest,
      sfx,
      music,
      stageIndex,
      needs,
      imagePolicy: 'resident',
    });
    const none = estimateStageMemory({
      content: db,
      manifest,
      sfx,
      music,
      stageIndex,
      needs,
      imagePolicy: 'none',
    });
    expect(resident.images).toBe(resident.textures);
    expect(none.images).toBe(0);
    expect(all.images).toBeGreaterThanOrEqual(resident.images);
    expect(all.total - resident.total).toBe(all.images - resident.images);
    // One page today: every policy charges the same GPU copies.
    expect(new Set([all.textures, resident.textures, none.textures]).size).toBe(1);
  });

  it('estimateMemory: imagePages overrides the images, keepPageImages: false drops them', () => {
    const page = { w: 1024, h: 512 };
    const three = [page, page, page];
    const base = { atlasPages: [page], sfxBytes: 0, musicBytes: 0 };
    expect(estimateMemory(base).images).toBe(2 * MIB);
    expect(estimateMemory({ ...base, imagePages: three }).images).toBe(6 * MIB);
    expect(estimateMemory({ ...base, imagePages: [] }).images).toBe(0);
    expect(estimateMemory({ ...base, imagePages: three, keepPageImages: false }).images).toBe(0);
    // The atlas share follows the estimate's frame: 23 MiB at 640×360.
    const tall = { w: 2048, h: (23 * MIB) / (2048 * 4 * 2) };
    expect(
      estimateMemory({ atlasPages: [tall], sfxBytes: 0, musicBytes: 0, frame: V2_FRAME })
        .withinBudget,
    ).toBe(true);
    expect(
      estimateMemory({
        atlasPages: [{ ...tall, h: tall.h + 1 }],
        sfxBytes: 0,
        musicBytes: 0,
        frame: V2_FRAME,
      }).withinBudget,
    ).toBe(false);
  });
});

describe('shell/memory engine, UI and scene-view sprites stay global (R1-05)', () => {
  /** A two-page manifest: sprite `a` on page 0, the given names on page 1. */
  const twoPages = (names: readonly string[]): AtlasManifest => {
    const frames: Record<string, AtlasManifest['frames'][string]> = {
      'zone/own#0': { p: 0, x: 0, y: 0, w: 1, h: 1, ax: 0, ay: 0 },
    };
    const sprites: Record<string, AtlasManifest['sprites'][string]> = {
      'zone/own': { frames: ['zone/own#0'], flash: null },
    };
    for (const name of names) {
      frames[`${name}#0`] = { p: 1, x: 0, y: 0, w: 1, h: 1, ax: 0, ay: 0 };
      sprites[name] = { frames: [`${name}#0`], flash: null };
    }
    return {
      formatVersion: 2,
      pages: [
        { file: 'main.png', w: 8, h: 8, group: 'zone-a' },
        { file: 'main-1.png', w: 8, h: 8, group: 'zone-a' },
      ],
      frames,
      sprites,
      animations: {},
      fonts: {},
    };
  };

  it.each([
    ['an engine sprite', ENGINE_SPRITES[0]],
    ['a UI kit sprite', UI_SPRITES[0]],
    ['a scene-view sprite', SCENE_VIEW_SPRITES[0]],
  ])('%s a zone names keeps its page global', (_label, name) => {
    const names = ['zone/own', name];
    // Stage 0 is a campaign zone naming both; stage 1 is another zone naming neither.
    const sets: StageSpriteSets = {
      byStage: [new Set([0, 1]), new Set<number>()],
      global: new Set<number>(),
    };
    const pageNeeds = atlasPageNeeds(twoPages([name]), names, sets);
    expect(pageNeeds.global).toEqual([false, true]);
    expect(stagePages(pageNeeds, 1)).toEqual([1]);
    expect(stagePages(pageNeeds, 0)).toEqual([0, 1]);
  });

  it('a zone’s own sprite still makes its page the zone’s alone', () => {
    const names = ['zone/own', 'zone/other'];
    const sets: StageSpriteSets = {
      byStage: [new Set([0]), new Set([1])],
      global: new Set<number>(),
    };
    const pageNeeds = atlasPageNeeds(twoPages(['zone/other']), names, sets);
    expect(pageNeeds.global).toEqual([false, false]);
    expect(stagePages(pageNeeds, 0)).toEqual([0]);
    expect(stagePages(pageNeeds, 1)).toEqual([1]);
  });
});

/**
 * The TV memory budget (plan M2-17): the estimator adds up what one zone keeps resident — the
 * atlas pages it needs, the SFX bank and its music set, the render targets and a heap baseline —
 * and every campaign zone of the shipped content must stay under 100 MB (shmup_tech.md §2.5), with
 * the atlas and the audio within their shares. Also: the chip-song size bound matches what the
 * synth renders, the zones' sprite sets and page needs, and the residency that unloads the pages
 * the next zone does not need.
 */
import { MUSIC_CUES, SimEventKind, createEventQueue } from '@shmup/core';
import {
  SYNTH_SAMPLE_RATE,
  loadMusicContent,
  loadSfxContent,
  renderSong,
  sfxLength,
} from '@shmup/audio-web';
import type { AtlasManifest } from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../../../vite.shared.js';
import { createEventDispatcher } from '../../src/dispatch/index.js';
import { loadGameContent } from '../../src/loader/index.js';
import {
  AUDIO_BUDGET_BYTES,
  MEMORY_BUDGET_BYTES,
  MIB,
  TEXTURE_BUDGET_BYTES,
  FILTER_TARGETS,
  atlasPageNeeds,
  connectAtlasResidency,
  createAtlasResidency,
  estimateMemory,
  estimateStageMemory,
  moduleInfo,
  pageBytes,
  potBytes,
  sfxBankBytes,
  songFrameBound,
  stageMusicTracks,
  stagePages,
  stageSpriteSets,
  trackBytes,
} from '../../src/memory/index.js';

const { db, issues, foreign } = loadGameContent(readContentFiles());
const kind = (name: string) =>
  foreign.filter((file) => (file.data as { kind?: unknown }).kind === name);
const sfx = loadSfxContent(kind('sfx')).content;
const music = loadMusicContent(kind('music')).content;
const manifest = buildAtlas().manifest as unknown as AtlasManifest;

/** The campaign zones' stage indices. */
const zoneStages = (db.campaign?.zones ?? []).map((zone) => zone.stageId);

describe('shell/memory', () => {
  it('describes itself', () => {
    expect(issues).toEqual([]);
    expect(moduleInfo.name).toBe('memory');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('keeps every campaign zone under the 100 MB budget (atlas + audio + targets + heap)', () => {
    expect(zoneStages.length).toBe(9);
    const needs = atlasPageNeeds(manifest, db.sprites.names, stageSpriteSets(db));
    for (const stageIndex of zoneStages) {
      const stage = db.stages[stageIndex];
      const estimate = estimateStageMemory({
        content: db,
        manifest,
        sfx,
        music,
        stageIndex,
        needs,
      });
      const report = `${stage.id}: ${(estimate.total / MIB).toFixed(1)} MiB`;
      expect(estimate.withinBudget, report).toBe(true);
      expect(estimate.total, report).toBeLessThanOrEqual(MEMORY_BUDGET_BYTES);
      expect(estimate.textures + estimate.images, report).toBeLessThanOrEqual(TEXTURE_BUDGET_BYTES);
      expect(estimate.sfx + estimate.music, report).toBeLessThanOrEqual(AUDIO_BUDGET_BYTES);
      // The zone's music set is resident: at least the title theme and the stage's own theme.
      expect(stageMusicTracks(music, stage).length, report).toBeGreaterThanOrEqual(2);
      expect(estimate.music, report).toBeGreaterThan(0);
    }
  });

  it('sizes the atlas from its pages (RGBA, plus the decoded images) and the targets from the display', () => {
    const one = estimateMemory({ atlasPages: [{ w: 1024, h: 1024 }], sfxBytes: 0, musicBytes: 0 });
    expect(one.textures).toBe(4 * MIB);
    expect(one.images).toBe(4 * MIB);
    const noImages = estimateMemory({
      atlasPages: [{ w: 1024, h: 1024 }],
      keepPageImages: false,
      sfxBytes: 0,
      musicBytes: 0,
    });
    expect(noImages.images).toBe(0);
    const hd = estimateMemory({
      atlasPages: [],
      sfxBytes: 0,
      musicBytes: 0,
      display: { width: 1280, height: 720 },
    });
    expect(hd.targets).toBeLessThan(one.targets);
    expect(one.total).toBe(
      one.textures + one.images + one.sfx + one.music + one.targets + one.heap,
    );
    expect(pageBytes({ w: 2048, h: 2048 })).toBe(16 * MIB);
  });

  it('counts the render targets as Pixi really pools them, CRT on and off (M3-02d, review F3)', () => {
    // Hand-computed, in bytes:
    //   frame target   384 × 216 × 4                       =        331 776  (created directly)
    //   2 filter passes  nextPow2(384, 216) = 512 × 256 × 4 = 2 ×  524 288
    //   canvas buffers 1920 × 1080 × 4 × 3                  =     24 883 200
    const FRAME = 331_776;
    const FILTER_PASS = 512 * 256 * 4;
    const CANVAS = 1920 * 1080 * 4 * 3;
    expect(potBytes(384, 216)).toBe(FILTER_PASS);
    expect(FILTER_PASS).toBe(524_288);
    expect(potBytes(1920, 1080)).toBe(2048 * 2048 * 4);
    expect(potBytes(768, 432)).toBe(1024 * 512 * 4);
    expect(potBytes(0, 216)).toBe(0);
    expect(potBytes(512, 256)).toBe(FILTER_PASS);
    const off = estimateMemory({ atlasPages: [], sfxBytes: 0, musicBytes: 0, crtFilter: 'off' });
    expect(off.targets).toBe(FRAME + FILTER_TARGETS * FILTER_PASS + CANVAS);
    expect(FILTER_TARGETS).toBe(2);
    // M3-02d folded the CRT into the pass-2 blit, so `full` costs no render target at all: the
    // 16.8 MB the review's F2 measured is simply not allocated any more.
    const full = estimateMemory({ atlasPages: [], sfxBytes: 0, musicBytes: 0, crtFilter: 'full' });
    expect(full.targets).toBe(off.targets);
    // With the `screenPass: 'filter'` escape hatch it is back, pooled 2048 × 2048 at 1080p.
    const legacy = estimateMemory({
      atlasPages: [],
      sfxBytes: 0,
      musicBytes: 0,
      crtFilter: 'full',
      crtAsFilter: true,
    });
    expect(legacy.targets).toBe(off.targets + 2048 * 2048 * 4);
    expect(legacy.targets - off.targets).toBe(16_777_216);
    // …and `off` costs nothing even then.
    expect(
      estimateMemory({
        atlasPages: [],
        sfxBytes: 0,
        musicBytes: 0,
        crtFilter: 'off',
        crtAsFilter: true,
      }).targets,
    ).toBe(off.targets);
    // A higher internal resolution is the knob review §7 cares about: ×2 of the frame is ×4 the
    // frame target and ×4 each pooled pass (1024 × 512).
    const twice = estimateMemory({
      atlasPages: [],
      sfxBytes: 0,
      musicBytes: 0,
      frame: { width: 768, height: 432 },
    });
    expect(twice.targets).toBe(768 * 432 * 4 + FILTER_TARGETS * 1024 * 512 * 4 + CANVAS);
  });

  it('fails the budget when the atlas or the audio outgrows its share, even under 100 MB', () => {
    const pages = [
      { w: 2048, h: 2048 },
      { w: 2048, h: 2048 },
    ];
    expect(estimateMemory({ atlasPages: pages, sfxBytes: 0, musicBytes: 0 }).withinBudget).toBe(
      false,
    );
    expect(
      estimateMemory({ atlasPages: [], sfxBytes: 0, musicBytes: AUDIO_BUDGET_BYTES + 1 })
        .withinBudget,
    ).toBe(false);
    expect(
      estimateMemory({ atlasPages: [], sfxBytes: 0, musicBytes: 0, heapBytes: 200 * MIB })
        .withinBudget,
    ).toBe(false);
  });

  it('bounds a chip song by what the synth renders, and the SFX bank by the cues it renders', () => {
    for (const track of music.tracks) {
      if (track.song === null) continue;
      const rendered = renderSong(track.song, SYNTH_SAMPLE_RATE);
      const bound = songFrameBound(track.song, SYNTH_SAMPLE_RATE);
      expect(rendered.pcm.length, track.id).toBeLessThanOrEqual(bound);
      if (rendered.loopEnd >= 0) expect(rendered.pcm.length, track.id).toBe(bound);
      expect(trackBytes(track)).toBe(bound * 4);
    }
    let frames = 0;
    for (const cue of sfx.cues) if (cue?.params) frames += sfxLength(cue.params, SYNTH_SAMPLE_RATE);
    expect(sfxBankBytes(sfx)).toBe(frames * 4);
  });

  it('sizes a recorded track from its loop end, or a 180 s stereo fallback', () => {
    const base = { id: 'x', title: 'X', cue: null, cueId: -1, stages: null, song: null };
    const known = {
      ...base,
      file: { url: 'a.ogg', loopStart: 0, loopEnd: 64000, sampleRate: 32000 },
    };
    expect(trackBytes(known)).toBe(64000 * 2 * 4);
    const unknown = {
      ...base,
      file: { url: 'a.ogg', loopStart: -1, loopEnd: -1, sampleRate: 32000 },
    };
    expect(trackBytes(unknown)).toBe(180 * 32000 * 2 * 4);
  });

  it('keeps the title theme in every zone music set', () => {
    for (const stageIndex of zoneStages) {
      const tracks = stageMusicTracks(music, db.stages[stageIndex]);
      const title = music.tracks.findIndex((track) => track.cueId === MUSIC_CUES.Title);
      expect(tracks).toContain(title);
      expect(new Set(tracks).size).toBe(tracks.length);
    }
  });
});

describe('shell/memory zone sprite sets and atlas pages', () => {
  const sets = stageSpriteSets(db);

  it('gives each campaign zone its own sprites, and every other sprite to the global set', () => {
    for (const stageIndex of zoneStages) {
      const set = sets.byStage[stageIndex];
      expect(set, db.stages[stageIndex].id).not.toBeNull();
      expect(set?.size ?? 0, db.stages[stageIndex].id).toBeGreaterThan(0);
      for (const id of set ?? []) expect(sets.global.has(id)).toBe(false);
    }
    // Dev ranges are outside the campaign.
    const range = db.stageIndex.get('test-range') ?? -1;
    expect(range).toBeGreaterThanOrEqual(0);
    expect(sets.byStage[range]).toBeNull();
    // The ships are named by no stage: global.
    const kestrel = db.sprites.index.get(db.ships[0].sprite) ?? -1;
    expect(sets.global.has(kestrel)).toBe(true);
    // Zone A's boss is zone A's own.
    const zoneA = db.stageIndex.get('zone-a') ?? -1;
    const bossSprite = db.enemies[db.enemyIndex.get('halcyon-bulwark') ?? -1]?.spriteId ?? -1;
    if (bossSprite >= 0) expect(sets.byStage[zoneA]?.has(bossSprite)).toBe(true);
  });

  it('marks the one placeholder page as needed by every stage, so nothing is unloaded', () => {
    const needs = atlasPageNeeds(manifest, db.sprites.names, sets);
    expect(manifest.pages).toHaveLength(1);
    expect(needs.global).toEqual([true]);
    for (let s = 0; s < db.stages.length; s++) expect(stagePages(needs, s)).toEqual([0]);
    const unloaded: number[] = [];
    const residency = createAtlasResidency([{ unload: () => unloaded.push(0) }], needs);
    for (const stageIndex of zoneStages) expect(residency.prepare(stageIndex)).toBe(0);
    expect(unloaded).toEqual([]);
  });

  it('unloads the pages of other zones between zones on a multi-page atlas', () => {
    // A synthetic three-page atlas: page 0 the global sprites, page 1 zone A's, page 2 zone B's.
    const zoneA = db.stageIndex.get('zone-a') ?? -1;
    const zoneB = db.stageIndex.get('zone-b') ?? -1;
    const frames: Record<
      string,
      { p: number; x: number; y: number; w: number; h: number; ax: number; ay: number }
    > = {};
    const sprites: Record<string, { frames: string[]; flash: string | null }> = {};
    const add = (name: string, page: number): void => {
      frames[`${name}#0`] = { p: page, x: 0, y: 0, w: 1, h: 1, ax: 0, ay: 0 };
      sprites[name] = { frames: [`${name}#0`], flash: null };
    };
    const onlyA = [...(sets.byStage[zoneA] ?? [])].find((id) => !sets.byStage[zoneB]?.has(id));
    const onlyB = [...(sets.byStage[zoneB] ?? [])].find((id) => !sets.byStage[zoneA]?.has(id));
    expect(onlyA).toBeDefined();
    expect(onlyB).toBeDefined();
    const nameA = db.sprites.names[onlyA ?? 0];
    const nameB = db.sprites.names[onlyB ?? 0];
    add('ships/kestrel', 0);
    add(nameA, 1);
    add(`${nameA}@flash`, 1);
    add(nameB, 2);
    const synthetic = {
      formatVersion: 1,
      pages: [
        { file: 'main.png', w: 256, h: 256 },
        { file: 'main-1.png', w: 256, h: 256 },
        { file: 'main-2.png', w: 256, h: 256 },
      ],
      frames,
      sprites,
      animations: {},
      fonts: {},
    } as AtlasManifest;
    const needs = atlasPageNeeds(synthetic, db.sprites.names, sets);
    expect(needs.global).toEqual([true, false, false]);
    expect(stagePages(needs, zoneA)).toEqual([0, 1]);
    expect(stagePages(needs, zoneB)).toEqual([0, 2]);
    // Outside the campaign (a dev range) and "no stage": every page.
    expect(stagePages(needs, db.stageIndex.get('test-range') ?? -1)).toEqual([0, 1, 2]);
    expect(stagePages(needs, -1)).toEqual([0, 1, 2]);

    const unloads: number[] = [];
    const pages = [0, 1, 2].map((p) => ({ unload: () => unloads.push(p) }));
    const residency = createAtlasResidency(pages, needs);
    // The zone map launches zone A: zone B's page goes.
    const events = createEventQueue(8);
    const dispatcher = createEventDispatcher();
    connectAtlasResidency(dispatcher, residency);
    events.push(SimEventKind.PrepareStage, zoneA, 0, 0, 0);
    events.drain(dispatcher.visit);
    expect(unloads).toEqual([2]);
    expect(residency.resident).toEqual([true, true, false]);
    // Zone B next: zone A's page goes, zone B's is resident again (uploaded on its first draw).
    expect(residency.prepare(zoneB)).toBe(1);
    expect(unloads).toEqual([2, 1]);
    expect(residency.resident).toEqual([true, false, true]);
    // The same zone again: nothing to do.
    expect(residency.prepare(zoneB)).toBe(0);
    expect(residency.unloads).toBe(2);
    // The estimate of a zone counts only its pages.
    const estimate = estimateStageMemory({
      content: db,
      manifest: synthetic,
      sfx,
      music,
      stageIndex: zoneA,
    });
    expect(estimate.textures).toBe(2 * 256 * 256 * 4);
  });

  it('refuses a residency whose page count differs from its needs', () => {
    const needs = atlasPageNeeds(manifest, db.sprites.names, sets);
    expect(() => createAtlasResidency([], needs)).toThrow(RangeError);
  });
});

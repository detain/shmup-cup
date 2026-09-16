/**
 * Edge cases of the TV memory budget (plan M2-17, `memory` module) on small synthetic content and
 * manifests: the zone walk follows every enemy / tileset / stage reference (cycles, out-of-range
 * and negative ids, typed arrays), zones named twice or out of range, content without a campaign;
 * the page needs of fonts, loose frames, engine sprites and `@` siblings; the residency's
 * bookkeeping and unregistering; the song, SFX and track sizes of odd inputs; and the estimate's
 * exact budget edge.
 */
import { MAX_SONG_TAIL_SECONDS, SYNTH_SAMPLE_RATE, DECODE_SAMPLE_RATE } from '@shmup/audio-web';
import type { MusicContent, SfxContent, Song } from '@shmup/audio-web';
import { SimEventKind, createEventQueue, type ContentDb } from '@shmup/core';
import type { AtlasManifest } from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import { createEventDispatcher } from '../../src/dispatch/index.js';
import {
  AUDIO_BUDGET_BYTES,
  FILE_TRACK_FALLBACK_SECONDS,
  HEAP_BASELINE_BYTES,
  MEMORY_BUDGET_BYTES,
  MIB,
  TEXTURE_BUDGET_BYTES,
  atlasPageNeeds,
  connectAtlasResidency,
  createAtlasResidency,
  estimateMemory,
  estimateStageMemory,
  sfxBankBytes,
  songFrameBound,
  stagePages,
  stageSpriteSets,
  trackBytes,
} from '../../src/memory/index.js';

/** Sprite names of the synthetic content: id = index. */
const NAMES = [
  'ships/kestrel', // 0: no stage names it
  'enemies/drone', // 1: stage 0's enemy
  'enemies/drone-child', // 2: the drone's child
  'bosses/core', // 3: stage 0's boss
  'tiles/rock', // 4: stage 0's tileset
  'enemies/bonus', // 5: the bonus stage linked from stage 1
  'enemies/loop-a', // 6: stage 1, a cycle a → b → a
  'enemies/loop-b', // 7
  'enemies/range', // 8: only the dev range names it
];

/**
 * A synthetic content db (only the fields the walk reads).
 *
 * @param zones - Campaign zones' stage indices, or `null` for no campaign.
 * @returns The content.
 */
function content(zones: number[] | null): ContentDb {
  const enemies = [
    // 0: names itself (a cycle) and, through a spawn list, its child.
    { id: 'drone', spriteId: 1, childId: 0, spawns: [{ childId: 1 }] },
    // 1: an out-of-range reference is ignored.
    { id: 'drone-child', spriteId: 2, enemyId: 99 },
    // 2: negative ids name nothing.
    { id: 'core', spriteId: 3, spriteP2Id: -1, innerId: -1 },
    // 3 ↔ 4: a cycle; 4 also names the core as its inner part.
    { id: 'loop-a', spriteId: 6, partnerId: 4 },
    { id: 'loop-b', spriteId: 7, minionId: 3, innerId: 2 },
    { id: 'range', spriteId: 8 },
    // 6: typed arrays (compiled tables) are not walked.
    { id: 'bonus', spriteId: 5, table: new Float64Array([0, 1]) },
  ];
  const stages = [
    {
      id: 'zone-x',
      events: [{ enemyId: 0 }, { bossId: 2 }],
      tilesetId: 0,
    },
    { id: 'zone-y', events: [{ enemyId: 3 }], stageId: 3 },
    { id: 'range', events: [{ enemyId: 5 }] },
    { id: 'bonus', events: [{ enemyId: 6 }], stageId: 1 /* back to zone-y: a cycle */ },
  ];
  const tilesets = [{ id: 'rock', spriteId: 4 }];
  return {
    stages,
    enemies,
    tilesets,
    campaign: zones === null ? null : { zones: zones.map((stageId) => ({ stageId })) },
    sprites: { names: NAMES },
  } as unknown as ContentDb;
}

/** A frame record. */
const frame = (p: number) => ({ p, x: 0, y: 0, w: 1, h: 1, ax: 0, ay: 0 });

describe('shell/memory zone walk edges', () => {
  it('follows enemies, children, bosses, tilesets and linked stages, through cycles', () => {
    const sets = stageSpriteSets(content([0, 1]));
    expect([...(sets.byStage[0] ?? [])].sort()).toEqual([1, 2, 3, 4]);
    // Zone Y: loop-a ↔ loop-b (a cycle) and loop-b's inner core; its linked bonus stage, which
    // links back to zone Y.
    expect([...(sets.byStage[1] ?? [])].sort()).toEqual([3, 5, 6, 7]);
    // Outside the campaign: the dev range and the bonus stage (reached only through zone Y).
    expect(sets.byStage[2]).toBeNull();
    expect(sets.byStage[3]).toBeNull();
    expect([...sets.global].sort()).toEqual([0, 8]);
  });

  it('walks a zone named twice once, and skips zones outside the stage list', () => {
    const sets = stageSpriteSets(content([0, 0, -1, 42]));
    expect(sets.byStage.map((set) => set !== null)).toEqual([true, false, false, false]);
    expect([...sets.global].sort()).toEqual([0, 5, 6, 7, 8]);
  });

  it('makes every sprite global without a campaign', () => {
    const sets = stageSpriteSets(content(null));
    expect(sets.byStage).toEqual([null, null, null, null]);
    expect(sets.global.size).toBe(NAMES.length);
  });
});

describe('shell/memory atlas page needs edges', () => {
  const sets = stageSpriteSets(content([0, 1]));

  it('makes fonts, loose frames and engine sprites global; `@` siblings follow their sprite', () => {
    const manifest = {
      formatVersion: 1,
      pages: [0, 1, 2, 3, 4].map((p) => ({ file: `p${p}.png`, w: 64, h: 64 })),
      frames: {
        'enemies/drone#0': frame(1),
        'enemies/drone@p2#0': frame(2),
        'enemies/loop-a#0': frame(3),
        'ui/cursor#0': frame(4),
        'glyph-65': frame(0),
        'loose#0': frame(4),
        'bad-page#0': frame(9),
      },
      sprites: {
        'enemies/drone': { frames: ['enemies/drone#0'], flash: null },
        'enemies/drone@p2': { frames: ['enemies/drone@p2#0'], flash: null },
        'enemies/loop-a': { frames: ['enemies/loop-a#0', 'missing#0'], flash: null },
        'ui/cursor': { frames: ['ui/cursor#0'], flash: null },
        'bad/page': { frames: ['bad-page#0'], flash: null },
      },
      animations: {},
      fonts: { pixel: { glyphs: { '65': { frame: 'glyph-65', advance: 4 } } } },
    } as unknown as AtlasManifest;
    const needs = atlasPageNeeds(manifest, NAMES, sets);
    // Page 0: a glyph; page 4: an engine sprite and a loose frame. Pages 1–2: zone X's drone
    // (and its player-2 sibling), page 3: zone Y's loop-a.
    expect(needs.global).toEqual([true, false, false, false, true]);
    expect(needs.stages.map((set) => [...set])).toEqual([[], [0], [0], [1], []]);
    expect(needs.campaign).toEqual([true, true, false, false]);
    expect(stagePages(needs, 0)).toEqual([0, 1, 2, 4]);
    expect(stagePages(needs, 1)).toEqual([0, 3, 4]);
    expect(stagePages(needs, 2)).toEqual([0, 1, 2, 3, 4]);
    // An index past the stages is "outside the campaign" too.
    expect(stagePages(needs, 99)).toEqual([0, 1, 2, 3, 4]);
  });

  it('gives a page two zones share to both, and a sprite of both zones to both', () => {
    const manifest = {
      formatVersion: 1,
      pages: [{ file: 'a.png', w: 8, h: 8 }],
      frames: { 'bosses/core#0': frame(0) },
      sprites: { 'bosses/core': { frames: ['bosses/core#0'], flash: null } },
      animations: {},
      fonts: {},
    } as unknown as AtlasManifest;
    const needs = atlasPageNeeds(manifest, NAMES, sets);
    expect(needs.global).toEqual([false]);
    expect([...needs.stages[0]].sort()).toEqual([0, 1]);
  });
});

describe('shell/memory residency edges', () => {
  const needs = {
    global: [true, false, false],
    stages: [new Set<number>(), new Set([0]), new Set([1])],
    campaign: [true, true],
  };

  it('unloads a page once, re-marks it resident when needed and restores every page for menus', () => {
    const unloads: number[] = [];
    const residency = createAtlasResidency(
      [0, 1, 2].map((p) => ({ unload: () => unloads.push(p) })),
      needs,
    );
    expect(residency.resident).toEqual([true, true, true]);
    expect(residency.prepare(0)).toBe(1);
    expect(residency.prepare(0)).toBe(0);
    expect(unloads).toEqual([2]);
    // Menus / no stage: every page resident again, nothing unloaded.
    expect(residency.prepare(-1)).toBe(0);
    expect(residency.resident).toEqual([true, true, true]);
    expect(residency.prepare(1)).toBe(1);
    expect(unloads).toEqual([2, 1]);
    expect(residency.unloads).toBe(2);
  });

  it('stops following PrepareStage once unregistered', () => {
    const unloads: number[] = [];
    const residency = createAtlasResidency(
      [0, 1, 2].map((p) => ({ unload: () => unloads.push(p) })),
      needs,
    );
    const dispatcher = createEventDispatcher();
    const events = createEventQueue(4);
    const off = connectAtlasResidency(dispatcher, residency);
    events.push(SimEventKind.PrepareStage, 1, 0, 0, 0);
    events.drain(dispatcher.visit);
    expect(unloads).toEqual([1]);
    off();
    events.push(SimEventKind.PrepareStage, 0, 0, 0, 0);
    events.drain(dispatcher.visit);
    expect(unloads).toEqual([1]);
    expect(residency.resident).toEqual([true, false, true]);
  });

  it('refuses more pages than needs as well as fewer', () => {
    expect(() =>
      createAtlasResidency(
        [0, 1, 2, 3].map(() => ({ unload: () => undefined })),
        needs,
      ),
    ).toThrow(/4 pages but needs for 3/);
  });
});

describe('shell/memory sizes of odd inputs', () => {
  const song = (fields: Partial<Song>): Song => ({
    speed: 6,
    instruments: {},
    channels: [],
    patterns: { a: { rows: 16, tracks: [] }, b: { rows: 8, tracks: [] } },
    order: ['a', 'b'],
    ...fields,
  });
  const row = Math.round((SYNTH_SAMPLE_RATE * 6) / 60);

  it('bounds a looping song by its rows and a one-shot song by its rows plus the tail', () => {
    expect(songFrameBound(song({ loopFromOrder: 0 }))).toBe(24 * row);
    expect(songFrameBound(song({ loopFromOrder: null }))).toBe(
      24 * row + MAX_SONG_TAIL_SECONDS * SYNTH_SAMPLE_RATE,
    );
    // Names not in the pattern table (and inherited names) count nothing.
    expect(songFrameBound(song({ order: ['a', 'missing', 'toString'], loopFromOrder: 0 }))).toBe(
      16 * row,
    );
    expect(songFrameBound(song({ loopFromOrder: 0 }), 11025)).toBe(
      24 * Math.round((11025 * 6) / 60),
    );
  });

  it('sizes the SFX bank: no-sound cues free, recorded cues two seconds of stereo', () => {
    const file = { params: null, file: 'audio/sfx/boom.ogg' };
    const bank = { cues: [null, file, null, file] } as unknown as SfxContent;
    expect(sfxBankBytes(bank)).toBe(2 * (2 * DECODE_SAMPLE_RATE * 2 * 4));
    expect(sfxBankBytes({ cues: [] })).toBe(0);
  });

  it('sizes a track with neither song nor file, or a file with a zero loop end, as the fallback', () => {
    const base = { id: 'x', title: 'X', cue: null, cueId: -1, stages: null, song: null };
    const fallback = FILE_TRACK_FALLBACK_SECONDS * DECODE_SAMPLE_RATE * 2 * 4;
    expect(trackBytes({ ...base, file: null })).toBe(fallback);
    expect(
      trackBytes({
        ...base,
        file: { url: 'a.ogg', loopStart: 0, loopEnd: 0, sampleRate: 44100 },
      }),
    ).toBe(fallback);
    // A 44.1 kHz file's loop end is converted to the 32 kHz decode rate (rounded up).
    expect(
      trackBytes({
        ...base,
        file: { url: 'a.ogg', loopStart: 0, loopEnd: 44101, sampleRate: 44100 },
      }),
    ).toBe(Math.ceil((44101 / 44100) * DECODE_SAMPLE_RATE) * 2 * 4);
  });
});

describe('shell/memory estimate edges', () => {
  it('is within budget at exactly the budget and its shares, and not a byte over', () => {
    const base = estimateMemory({ atlasPages: [], sfxBytes: 0, musicBytes: 0 });
    expect(base.heap).toBe(HEAP_BASELINE_BYTES);
    expect(base.budget).toBe(MEMORY_BUDGET_BYTES);
    const exact = estimateMemory({
      atlasPages: [],
      sfxBytes: 0,
      musicBytes: 0,
      budget: base.total,
    });
    expect(exact.withinBudget).toBe(true);
    expect(
      estimateMemory({ atlasPages: [], sfxBytes: 0, musicBytes: 0, budget: base.total - 1 })
        .withinBudget,
    ).toBe(false);
    // 2048 × 1024 × 4 × 2 (texture + image) = 16 MiB; two such pages: exactly the 32 MiB share.
    const pages = [
      { w: 2048, h: 1024 },
      { w: 2048, h: 1024 },
    ];
    const atShare = estimateMemory({ atlasPages: pages, sfxBytes: 0, musicBytes: 0 });
    expect(atShare.textures + atShare.images).toBe(TEXTURE_BUDGET_BYTES);
    expect(atShare.withinBudget).toBe(true);
    expect(
      estimateMemory({ atlasPages: [], sfxBytes: 1, musicBytes: AUDIO_BUDGET_BYTES - 1 })
        .withinBudget,
    ).toBe(true);
    expect(Object.isFrozen(atShare)).toBe(true);
  });

  it('counts the 1080p canvas buffers, and a 4K display costs four times as much', () => {
    const hd = estimateMemory({ atlasPages: [], sfxBytes: 0, musicBytes: 0 });
    // The frame target is exact (created directly), the two filter passes are pooled at 512 × 256.
    const frame = 384 * 216 * 4 + 512 * 256 * 4 * 2;
    expect(hd.targets).toBe(frame + 1920 * 1080 * 4 * 3);
    const uhd = estimateMemory({
      atlasPages: [],
      sfxBytes: 0,
      musicBytes: 0,
      display: { width: 3840, height: 2160 },
    });
    expect(uhd.targets - frame).toBe(4 * (hd.targets - frame));
    expect(uhd.targets).toBeLessThan(100 * MIB);
  });

  it('estimates a stage index past the stage list with no music and every page', () => {
    const db = content([0, 1]);
    const manifest = {
      formatVersion: 1,
      pages: [
        { file: 'a.png', w: 16, h: 16 },
        { file: 'b.png', w: 16, h: 16 },
      ],
      frames: { 'enemies/drone#0': frame(1) },
      sprites: { 'enemies/drone': { frames: ['enemies/drone#0'], flash: null } },
      animations: {},
      fonts: {},
    } as unknown as AtlasManifest;
    const music = { tracks: [], trackIndex: new Map() } as MusicContent;
    const estimate = estimateStageMemory({
      content: db,
      manifest,
      sfx: { cues: [] },
      music,
      stageIndex: 99,
    });
    expect(estimate.music).toBe(0);
    expect(estimate.sfx).toBe(0);
    expect(estimate.textures).toBe(2 * 16 * 16 * 4);
  });
});

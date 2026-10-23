/**
 * Edge cases of the TV memory budget (plan M2-17, `memory` module) on small synthetic content and
 * manifests: the zone walk follows every enemy / tileset / stage reference (cycles, out-of-range
 * and negative ids, typed arrays), zones named twice or out of range, content without a campaign;
 * the linked stages of R5-10.T8 (a zone's `escape`, reached bonus stages) and their page aliasing;
 * the page needs of fonts, loose frames, engine sprites and `@` siblings; the residency's
 * bookkeeping and unregistering; the song, SFX and track sizes of odd inputs; and the estimate's
 * exact budget edge.
 */
import { MAX_SONG_TAIL_SECONDS, SYNTH_SAMPLE_RATE, DECODE_SAMPLE_RATE } from '@shmup/audio-web';
import type { MusicContent, SfxContent, Song } from '@shmup/audio-web';
import { FRAME_H, FRAME_W, SimEventKind, createEventQueue, type ContentDb } from '@shmup/core';
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
 * @param escapes - Optional per-zone-stage `escape` links: zone stage index → escape stage index.
 * @returns The content.
 */
function content(zones: number[] | null, escapes?: Record<number, number>): ContentDb {
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
    campaign:
      zones === null
        ? null
        : {
            zones: zones.map((stageId) => ({
              stageId,
              escapeId: escapes === undefined ? -1 : (escapes[stageId] ?? -1),
            })),
          },
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
    // Outside the campaign: the dev range. The bonus stage is **linked** (R5-10.T8): zone Y's
    // walk reached it, so it has a set of its own and records zone Y as its linker. The back
    // link to zone Y does not link a zone (a zone is never a linked stage).
    expect(sets.byStage[2]).toBeNull();
    expect([...(sets.byStage[3] ?? [])].sort()).toEqual([3, 5, 6, 7]);
    expect(sets.linkedBy[0]).toBeNull();
    expect(sets.linkedBy[1]).toBeNull();
    expect(sets.linkedBy[2]).toBeNull();
    expect(sets.linkedBy[3]).toEqual([1]);
    expect([...sets.global].sort()).toEqual([0, 8]);
  });

  it('links a campaign zone’s escape stage without a walk reaching it', () => {
    // Only the campaign's `escape` links zone X and stage 2 (the dev range used as an escape
    // sequence — the fake's shortcut for what T2 makes of the real escape stage).
    const sets = stageSpriteSets(content([0], { 0: 2 }));
    expect([...(sets.byStage[0] ?? [])].sort()).toEqual([1, 2, 3, 4]);
    expect([...(sets.byStage[2] ?? [])].sort()).toEqual([8]);
    expect(sets.linkedBy[2]).toEqual([0]);
    // The escape's sprite is named now — no longer global (zone Y is not a campaign zone here,
    // so its loop sprites stay global with the ships).
    expect([...sets.global].sort()).toEqual([0, 5, 6, 7]);
  });

  it('links one stage from two zones, and walks a chain of reaches', () => {
    // Both zones escape to stage 2; stage 2's walk reaches nothing further (no stageId ref).
    const sets = stageSpriteSets(content([0, 1], { 0: 2, 1: 2 }));
    expect(sets.linkedBy[2]).toEqual([0, 1]);
    expect([...(sets.byStage[2] ?? [])].sort()).toEqual([8]);
    // Bonus (3) still reached through zone Y's event, and the same two zones link it through
    // their escape only for stage 2 — the chain rule shows through the zone-x-as-escape fake:
    // zone X links 2, and a fake where 2 reached 3 would link 3 for X too.
    expect(sets.linkedBy[3]).toEqual([1]);
  });

  it('walks a zone named twice once, and skips zones outside the stage list', () => {
    const sets = stageSpriteSets(content([0, 0, -1, 42]));
    expect(sets.byStage.map((set) => set !== null)).toEqual([true, false, false, false]);
    expect(sets.linkedBy).toEqual([null, null, null, null]);
    expect([...sets.global].sort()).toEqual([0, 5, 6, 7, 8]);
  });

  it('makes every sprite global without a campaign', () => {
    const sets = stageSpriteSets(content(null));
    expect(sets.byStage).toEqual([null, null, null, null]);
    expect(sets.linkedBy).toEqual([null, null, null, null]);
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
    // (and its player-2 sibling), page 3: zone Y's loop-a — and, through the link, the bonus
    // stage's too (R5-10.T8): its walk reached the same loop sprites.
    expect(needs.global).toEqual([true, false, false, false, true]);
    expect(needs.stages.map((set) => [...set])).toEqual([[], [0], [0], [1, 3], []]);
    expect(needs.campaign).toEqual([true, true, false, true]);
    expect(stagePages(needs, 0)).toEqual([0, 1, 2, 4]);
    expect(stagePages(needs, 1)).toEqual([0, 3, 4]);
    expect(stagePages(needs, 2)).toEqual([0, 1, 2, 3, 4]);
    // The linked bonus stage needs its linker's pages, not the whole atlas.
    expect(stagePages(needs, 3)).toEqual([0, 3, 4]);
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
    // Zones X and Y both name the core (Y through its walk, which the bonus links share) — and
    // the bonus stage rides along through zone Y's link (R5-10.T8).
    expect([...needs.stages[0]].sort()).toEqual([0, 1, 3]);
  });

  it('gives a linked stage alone on a page the linker’s cluster, and shared art the common pages', () => {
    // Stage 2 (a dev range used as zone X's only escape): its art is not named by X's own walk,
    // so the lone-linker rule gives its page to X — and X's link widens X's own page to 2.
    const linked = stageSpriteSets(content([0], { 0: 2 }));
    const manifest = {
      formatVersion: 1,
      pages: [
        { file: 'p0.png', w: 8, h: 8 },
        { file: 'p2.png', w: 8, h: 8 },
      ],
      frames: {
        'enemies/range#0': frame(1),
        'enemies/drone#0': frame(0),
      },
      sprites: {
        'enemies/range': { frames: ['enemies/range#0'], flash: null },
        'enemies/drone': { frames: ['enemies/drone#0'], flash: null },
      },
      animations: {},
      fonts: {},
    } as unknown as AtlasManifest;
    const needs = atlasPageNeeds(manifest, NAMES, linked);
    expect(needs.global).toEqual([false, false]);
    expect(needs.stages.map((set) => [...set].sort())).toEqual([
      [0, 2],
      [0, 2],
    ]);
    expect(stagePages(needs, 2)).toEqual([0, 1]);
    expect(stagePages(needs, 0)).toEqual([0, 1]);
    // Two zones link the same escape: its own art is global (it rides the common pages, which
    // every stage keeps), and the escape reaches every linker's pages through its links.
    const dual = stageSpriteSets(content([0, 1], { 0: 2, 1: 2 }));
    const dualNeeds = atlasPageNeeds(manifest, NAMES, dual);
    expect(dualNeeds.global).toEqual([false, true]);
    expect(dualNeeds.stages.map((set) => [...set].sort())).toEqual([[0, 2], []]);
    expect(stagePages(dualNeeds, 2)).toEqual([0, 1]);
    expect(stagePages(dualNeeds, 0)).toEqual([0, 1]);
    expect(stagePages(dualNeeds, 1)).toEqual([1]);
  });
});

describe('shell/memory residency edges', () => {
  const needs = {
    global: [true, false, false],
    stages: [new Set<number>(), new Set([0]), new Set([1])],
    campaign: [true, true],
  };

  it('counts a page’s unload once, re-marks it when needed, restores every page for menus', () => {
    const unloads: number[] = [];
    const residency = createAtlasResidency(
      [0, 1, 2].map((p) => ({ unload: () => unloads.push(p) })),
      needs,
    );
    expect(residency.resident).toEqual([true, true, true]);
    expect(residency.prepare(0)).toBe(1);
    expect(residency.prepare(0)).toBe(0);
    // The repeat calls `unload` again (self-healing — R1-05: something may have drawn the page
    // behind the residency's back) but counts nothing: the page was not believed resident.
    expect(unloads).toEqual([2, 2]);
    expect(residency.unloads).toBe(1);
    // Menus / no stage: every page resident again, nothing unloaded.
    expect(residency.prepare(-1)).toBe(0);
    expect(residency.resident).toEqual([true, true, true]);
    expect(residency.prepare(1)).toBe(1);
    expect(unloads).toEqual([2, 2, 1]);
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
    const base = {
      id: 'x',
      title: 'X',
      cue: null,
      cueId: -1,
      stages: null,
      song: null,
      module: null,
    };
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
    // One 2048-wide page tall enough that texture + image (× 4 B × 2) is exactly the atlas share
    // (derived from the frame since R1-05: 26 MiB at 384×216 → 1664 rows, 23 MiB at 640×360 →
    // 1472), and one row more is over it.
    const rows = TEXTURE_BUDGET_BYTES / (2048 * 4 * 2);
    expect(Number.isInteger(rows)).toBe(true);
    const atShare = estimateMemory({
      atlasPages: [{ w: 2048, h: rows }],
      sfxBytes: 0,
      musicBytes: 0,
    });
    expect(atShare.textures + atShare.images).toBe(TEXTURE_BUDGET_BYTES);
    expect(atShare.withinBudget).toBe(true);
    expect(
      estimateMemory({ atlasPages: [{ w: 2048, h: rows + 1 }], sfxBytes: 0, musicBytes: 0 })
        .withinBudget,
    ).toBe(false);
    expect(
      estimateMemory({ atlasPages: [], sfxBytes: 1, musicBytes: AUDIO_BUDGET_BYTES - 1 })
        .withinBudget,
    ).toBe(true);
    expect(Object.isFrozen(atShare)).toBe(true);
  });

  it('counts the 1080p canvas buffers, and a 4K display costs four times as much', () => {
    const hd = estimateMemory({ atlasPages: [], sfxBytes: 0, musicBytes: 0 });
    // The frame target is exact (created directly), the two filter passes are pooled at the next
    // powers of two (512 × 256 for the 384×216 frame).
    let pw = 1;
    while (pw < FRAME_W) pw *= 2;
    let ph = 1;
    while (ph < FRAME_H) ph *= 2;
    const frame = FRAME_W * FRAME_H * 4 + pw * ph * 4 * 2;
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

  it("over-estimates the legacy CRT filter's target on purpose (M3-02d, review F3)", () => {
    // `crtAsFilter` models the `screenPass: 'filter'` escape hatch, which is the only path that
    // still pools a display-sized target. The term is `potBytes(display)` — deliberately the
    // **worst case**, and it is wrong in two directions that both make it larger than life:
    //
    //  * it ignores `crtResolution`, so a 4K display is charged a 4096² target although the
    //    legacy filter runs capped at 1080 rows there (a pooled 2048²) — four times too much;
    //  * it ignores letterboxing: in an aspect mode the picture is smaller than the display, but
    //    the filter is attached to the whole second pass, so the display is what is charged.
    //
    // Both are safe for a budget check and neither is on a shipped path, so the behaviour is
    // pinned rather than fixed: nothing but the escape hatch reads it.
    const base = { atlasPages: [], sfxBytes: 0, musicBytes: 0 } as const;
    const hd = estimateMemory({ ...base, crtFilter: 'full', crtAsFilter: true });
    const hdOff = estimateMemory({ ...base, crtFilter: 'off', crtAsFilter: true });
    expect(hd.targets - hdOff.targets).toBe(2048 * 2048 * 4);
    // `light` costs the same as `full`: same program, same pass — the review's F2 in one line.
    expect(estimateMemory({ ...base, crtFilter: 'light', crtAsFilter: true }).targets).toBe(
      hd.targets,
    );
    // 4K: the charge quadruples although the pass itself would not (the cap keeps it at 1080p).
    const uhd = estimateMemory({
      ...base,
      crtFilter: 'full',
      crtAsFilter: true,
      display: { width: 3840, height: 2160 },
    });
    const uhdOff = estimateMemory({
      ...base,
      crtFilter: 'off',
      crtAsFilter: true,
      display: { width: 3840, height: 2160 },
    });
    expect(uhd.targets - uhdOff.targets).toBe(4096 * 4096 * 4);
    expect(uhd.targets - uhdOff.targets).toBe(4 * (hd.targets - hdOff.targets));
    // A pillarboxed 4:3 picture on a 1080p display is charged the whole display all the same.
    const boxed = estimateMemory({
      ...base,
      crtFilter: 'full',
      crtAsFilter: true,
      display: { width: 1440, height: 1080 },
    });
    const boxedOff = estimateMemory({
      ...base,
      crtFilter: 'off',
      crtAsFilter: true,
      display: { width: 1440, height: 1080 },
    });
    expect(boxed.targets - boxedOff.targets).toBe(2048 * 2048 * 4);
    // The shipped `blit` path is charged nothing at any setting, on any display (M3-02d).
    for (const setting of ['off', 'light', 'full'] as const) {
      expect(estimateMemory({ ...base, crtFilter: setting }).targets).toBe(
        estimateMemory(base).targets,
      );
    }
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

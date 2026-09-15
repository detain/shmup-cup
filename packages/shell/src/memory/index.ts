/**
 * # memory — the TV memory budget: estimator and atlas-page residency between zones
 *
 * **Responsibility.** Keeps the game under the TV's memory budget (shmup_tech.md §2.5:
 * dev-installed apps are capped at 120 MB; the budget is **< 100 MB**,
 * {@link MEMORY_BUDGET_BYTES}):
 *
 * - **Estimator** ({@link estimateMemory}, {@link estimateStageMemory}). What one zone keeps
 *   resident, from the data alone: the atlas pages it needs (GPU texture + the decoded image the
 *   page was uploaded from), the audio (the whole SFX bank — pre-rendered at boot — and the zone's
 *   music set: the title theme plus every cue the stage can ask for, `stageMusicCues`; mono
 *   32-bit float buffers, one copy — `audio-web` `toAudioBuffer` drops the PCM once the buffer
 *   exists), the render targets (the 384×216 frame, the layer-effect filter passes, the canvas's
 *   front / back / depth-stencil buffers at the display size) and a JS heap baseline. Chip songs
 *   are sized from their rows ({@link songFrameBound}) without rendering them; recorded tracks
 *   from their loop end, or {@link FILE_TRACK_FALLBACK_SECONDS} of stereo when it is unknown.
 * - **Residency** ({@link stageSpriteSets}, {@link atlasPageNeeds}, {@link createAtlasResidency}).
 *   Which sprites a campaign zone uses is found by walking its stage spec and everything it names
 *   (enemies — children, bosses, inner / double bosses, minions —, tilesets and linked stages such
 *   as a bonus stage): every `sprite…Id` reached. A sprite no campaign zone names (ships, shots,
 *   bullets, items, particles, the UI, dev ranges' enemies) is **global**. An atlas page is needed
 *   by a zone when it holds a global sprite, a font glyph, a frame of no sprite, or one of the
 *   zone's own sprites (their `@flash` / `@p2` / palette siblings included). Between zones — on the
 *   scene flow's `PrepareStage` event, while the next stage loads ({@link connectAtlasResidency}) —
 *   the pages the next zone does not need are unloaded from the GPU (Pixi `TextureSource.unload`);
 *   a needed page that was unloaded is uploaded again when it is first drawn, during the loading /
 *   fly-in. A stage outside the campaign (the dev ranges, the weapon select's preview) needs every
 *   page. Today's placeholder atlas is **one** 1024² page (4 MiB) that every zone needs, so nothing
 *   is ever unloaded; the residency starts to matter once real art adds pages (≤ 2048² each).
 *
 * Nothing here runs per frame: the walk runs once at boot, `prepare` once per stage change.
 *
 * **Implements.**
 * - shmup_tech.md §2.5 — memory budget < 100 MB (120 MB dev cap); §2.2 — atlases ≤ 2048²; §2.4 —
 *   one music set resident, SFX pre-decoded
 * - shmup_feat.md §22 — budgets (texture memory, audio memory)
 * - shmup_feat.md §23 — Tizen: responsive after long sessions
 *
 * **Public API.** {@link estimateMemory}, {@link estimateStageMemory}, {@link MemoryInputs},
 * {@link StageMemoryInputs}, {@link MemoryEstimate}, {@link pageBytes}, {@link sfxBankBytes},
 * {@link songFrameBound}, {@link trackBytes}, {@link stageMusicTracks},
 * {@link stageSpriteSets}, {@link StageSpriteSets}, {@link atlasPageNeeds}, {@link AtlasPageNeeds},
 * {@link stagePages}, {@link createAtlasResidency}, {@link AtlasResidency}, {@link AtlasPageLike},
 * {@link connectAtlasResidency}, {@link MEMORY_BUDGET_BYTES}, {@link TEXTURE_BUDGET_BYTES},
 * {@link AUDIO_BUDGET_BYTES}, {@link HEAP_BASELINE_BYTES}, {@link FILE_TRACK_FALLBACK_SECONDS},
 * {@link MIB}.
 *
 * @module
 */
import {
  DECODE_SAMPLE_RATE,
  MAX_SONG_TAIL_SECONDS,
  SYNTH_SAMPLE_RATE,
  resolveMusicCues,
  sfxLength,
  songRowSamples,
  stageMusicCues,
  type MusicContent,
  type MusicTrackDef,
  type SfxContent,
  type Song,
} from '@shmup/audio-web';
import { MUSIC_CUES, SimEventKind, defineModule, type ContentDb } from '@shmup/core';
import type { AtlasManifest } from '@shmup/render-pixi';
import type { EventDispatcher } from '../dispatch/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'memory',
  status: 'implemented',
  specRefs: ['shmup_tech.md §2.5', 'shmup_tech.md §2.2', 'shmup_feat.md §22', 'shmup_feat.md §23'],
});

/** One mebibyte. */
export const MIB = 1024 * 1024;

/** The whole app's budget on the TV: < 100 MB (shmup_tech.md §2.5; the dev install cap: 120 MB). */
export const MEMORY_BUDGET_BYTES = 100 * MIB;

/** Share of the budget the atlas may take (GPU pages + their decoded images): 32 MiB. */
export const TEXTURE_BUDGET_BYTES = 32 * MIB;

/** Share of the budget the audio may take (SFX bank + one zone's music set): 32 MiB. */
export const AUDIO_BUDGET_BYTES = 32 * MIB;

/**
 * JS heap and engine baseline the estimate adds: the bundle's code, the inlined content once
 * parsed, Pixi, the pools and the World — 24 MiB. An assumption, not a measurement: the
 * on-device memory check (plan §8.5, DevTools on the TV) confirms or corrects it.
 */
export const HEAP_BASELINE_BYTES = 24 * MIB;

/** Length assumed for a recorded track whose loop end is unknown (decoded stereo). */
export const FILE_TRACK_FALLBACK_SECONDS = 180;

/** Channels a decoded file has (`audio-web` decodes through a stereo `OfflineAudioContext`). */
const FILE_CHANNELS = 2;

/** Length assumed for a recorded sound effect (decoded stereo), in seconds. */
const FILE_SFX_SECONDS = 2;

/** Bytes per sample of an `AudioBuffer` (32-bit float). */
const SAMPLE_BYTES = 4;

/** Layer-effect filter passes the renderer may hold at the internal size (M2-08). */
const FILTER_TARGETS = 2;

/** Buffers of the canvas at the display size: front, back and depth / stencil. */
const CANVAS_BUFFERS = 3;

/** Width of the internal frame the renderer draws into (decision D19). */
const FRAME_WIDTH = 384;

/** Height of the internal frame. */
const FRAME_HEIGHT = 216;

/** A page size. */
interface PageSize {
  /** Width in pixels. */
  readonly w: number;
  /** Height in pixels. */
  readonly h: number;
}

/**
 * Bytes one RGBA page takes (no mipmaps — pixel art is sampled nearest-neighbour).
 *
 * @param page - The page size.
 * @returns `w × h × 4`.
 */
export function pageBytes(page: PageSize): number {
  return page.w * page.h * 4;
}

/** What {@link estimateMemory} adds up. */
export interface MemoryInputs {
  /** The atlas pages resident on the GPU. */
  readonly atlasPages: readonly PageSize[];
  /**
   * Whether the decoded page images stay in memory next to their GPU copies (default `true` —
   * Pixi keeps the `HTMLImageElement` to re-upload after a context loss).
   */
  readonly keepPageImages?: boolean;
  /** Bytes of the SFX bank's buffers. */
  readonly sfxBytes: number;
  /** Bytes of the resident music set's buffers. */
  readonly musicBytes: number;
  /** The display (canvas drawing buffer) size in pixels (default 1920×1080). */
  readonly display?: {
    /** Width in pixels. */
    readonly width: number;
    /** Height in pixels. */
    readonly height: number;
  };
  /** JS heap baseline (default {@link HEAP_BASELINE_BYTES}). */
  readonly heapBytes?: number;
  /** The budget (default {@link MEMORY_BUDGET_BYTES}). */
  readonly budget?: number;
}

/** A memory estimate, in bytes. */
export interface MemoryEstimate {
  /** GPU atlas pages. */
  readonly textures: number;
  /** Decoded page images kept next to them. */
  readonly images: number;
  /** SFX bank. */
  readonly sfx: number;
  /** Music set. */
  readonly music: number;
  /** Render targets (the internal frame, filter passes, the canvas buffers). */
  readonly targets: number;
  /** JS heap baseline. */
  readonly heap: number;
  /** Everything. */
  readonly total: number;
  /** The budget. */
  readonly budget: number;
  /**
   * `total ≤ budget`, the atlas within {@link TEXTURE_BUDGET_BYTES} and the audio within
   * {@link AUDIO_BUDGET_BYTES}.
   */
  readonly withinBudget: boolean;
}

/**
 * Adds up what stays resident.
 *
 * @param inputs - Pages, audio bytes, display, heap baseline, budget.
 * @returns The estimate.
 *
 * @example
 * ```ts
 * estimateMemory({ atlasPages: [{ w: 1024, h: 1024 }], sfxBytes: 2 * MIB, musicBytes: 12 * MIB })
 *   .withinBudget; // → true
 * ```
 */
export function estimateMemory(inputs: MemoryInputs): MemoryEstimate {
  let textures = 0;
  for (const page of inputs.atlasPages) textures += pageBytes(page);
  const images = inputs.keepPageImages === false ? 0 : textures;
  const display = inputs.display ?? { width: 1920, height: 1080 };
  const frame = FRAME_WIDTH * FRAME_HEIGHT * 4;
  const targets =
    frame * (1 + FILTER_TARGETS) + display.width * display.height * 4 * CANVAS_BUFFERS;
  const heap = inputs.heapBytes ?? HEAP_BASELINE_BYTES;
  const budget = inputs.budget ?? MEMORY_BUDGET_BYTES;
  const total = textures + images + inputs.sfxBytes + inputs.musicBytes + targets + heap;
  return Object.freeze({
    textures,
    images,
    sfx: inputs.sfxBytes,
    music: inputs.musicBytes,
    targets,
    heap,
    total,
    budget,
    withinBudget:
      total <= budget &&
      textures + images <= TEXTURE_BUDGET_BYTES &&
      inputs.sfxBytes + inputs.musicBytes <= AUDIO_BUDGET_BYTES,
  });
}

/**
 * Bytes of the SFX bank's buffers: synthesized cues at the synth rate (mono), recorded ones
 * assumed {@link FILE_SFX_SECONDS} of decoded stereo.
 *
 * @param sfx - The bank.
 * @param sampleRate - The synth rate (default `audio-web` `SYNTH_SAMPLE_RATE`).
 * @returns Bytes.
 */
export function sfxBankBytes(sfx: SfxContent, sampleRate: number = SYNTH_SAMPLE_RATE): number {
  let bytes = 0;
  for (const cue of sfx.cues) {
    if (cue === null) continue;
    if (cue.params !== null) bytes += sfxLength(cue.params, sampleRate) * SAMPLE_BYTES;
    else bytes += FILE_SFX_SECONDS * DECODE_SAMPLE_RATE * FILE_CHANNELS * SAMPLE_BYTES;
  }
  return bytes;
}

/**
 * Frames a chip song renders to at most: every row of its play order, plus the release tail of a
 * one-shot song ({@link MAX_SONG_TAIL_SECONDS}) — `audio-web` `renderSong`'s length without
 * rendering it.
 *
 * @param song - The song.
 * @param sampleRate - The synth rate.
 * @returns Frames (mono).
 */
export function songFrameBound(song: Song, sampleRate: number = SYNTH_SAMPLE_RATE): number {
  let rows = 0;
  for (const name of song.order) {
    const pattern = Object.prototype.hasOwnProperty.call(song.patterns, name)
      ? song.patterns[name]
      : undefined;
    if (pattern !== undefined) rows += pattern.rows;
  }
  const loops = song.loopFromOrder !== undefined && song.loopFromOrder !== null;
  return rows * songRowSamples(song, sampleRate) + (loops ? 0 : MAX_SONG_TAIL_SECONDS * sampleRate);
}

/**
 * Bytes one prepared music track takes: a chip song's frames (mono, synth rate) or a recorded
 * track's (decoded stereo at 32 kHz, up to its loop end, else {@link FILE_TRACK_FALLBACK_SECONDS}).
 *
 * @param track - The track.
 * @param sampleRate - The synth rate.
 * @returns Bytes.
 */
export function trackBytes(track: MusicTrackDef, sampleRate: number = SYNTH_SAMPLE_RATE): number {
  if (track.song !== null) return songFrameBound(track.song, sampleRate) * SAMPLE_BYTES;
  const file = track.file;
  const seconds =
    file !== null && file.loopEnd > 0
      ? file.loopEnd / file.sampleRate
      : FILE_TRACK_FALLBACK_SECONDS;
  return Math.ceil(seconds * DECODE_SAMPLE_RATE) * FILE_CHANNELS * SAMPLE_BYTES;
}

/**
 * The tracks a stage's music set holds while it plays: the title theme (the scene flow keeps it
 * resident) and every cue the stage's data can ask for (`stageMusicCues`), resolved for the stage.
 *
 * @param music - The library.
 * @param stage - The stage (`content.stages[i]`).
 * @returns Track indices, each once.
 */
export function stageMusicTracks(
  music: MusicContent,
  stage: ContentDb['stages'][number],
): number[] {
  const table = resolveMusicCues(music, stage.id);
  const cues = [MUSIC_CUES.Title, ...stageMusicCues(stage)];
  const tracks: number[] = [];
  for (const cue of cues) {
    const track = table[cue];
    if (track >= 0 && tracks.indexOf(track) < 0) tracks.push(track);
  }
  return tracks;
}

/** The sprites each campaign zone names, and the ones none does. */
export interface StageSpriteSets {
  /** Per stage (`content.stages` index): its sprite ids, or `null` outside the campaign. */
  readonly byStage: readonly (ReadonlySet<number> | null)[];
  /** Sprite ids no campaign zone names (always resident). */
  readonly global: ReadonlySet<number>;
}

/** Fields that name an enemy (`content.enemies` index). */
const ENEMY_REF_KEYS: readonly string[] = Object.freeze([
  'enemyId',
  'bossId',
  'innerId',
  'doubleId',
  'partnerId',
  'minionId',
  'childId',
]);

/** A field that names a sprite (`spriteId`, `spriteP2Id`). */
const SPRITE_REF_KEY = /^sprite\w*Id$/;

/**
 * Collects the sprites a stage names, following its enemy, tileset and stage references.
 *
 * @param content - The content.
 * @param stageIndex - The stage.
 * @returns Sprite ids.
 */
function walkStage(content: ContentDb, stageIndex: number): Set<number> {
  const sprites = new Set<number>();
  const seen = new Set<object>();
  const pending: unknown[] = [content.stages[stageIndex]];
  /**
   * Queues a referenced spec.
   *
   * @param list - The specs.
   * @param index - The reference.
   */
  const follow = (list: readonly unknown[], index: number): void => {
    const spec = index >= 0 && index < list.length ? list[index] : undefined;
    if (spec !== undefined) pending.push(spec);
  };
  while (pending.length > 0) {
    const value = pending.pop();
    if (value === null || typeof value !== 'object') continue;
    if (ArrayBuffer.isView(value) || value instanceof Map || value instanceof Set) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value as unknown[]) pending.push(item);
      continue;
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const field = record[key];
      if (typeof field !== 'number') {
        if (field !== null && typeof field === 'object') pending.push(field);
        continue;
      }
      if (SPRITE_REF_KEY.test(key)) {
        if (field >= 0) sprites.add(field);
      } else if (ENEMY_REF_KEYS.indexOf(key) >= 0) {
        follow(content.enemies, field);
      } else if (key === 'tilesetId') {
        follow(content.tilesets, field);
      } else if (key === 'stageId') {
        follow(content.stages, field);
      }
    }
  }
  return sprites;
}

/**
 * The sprites of every campaign zone (see the module docs): a zone's stage and what it names.
 *
 * @remarks
 * Load time (walks the specs once). Without a campaign every stage is "outside" and every sprite
 * global.
 *
 * @param content - The content.
 * @returns Per-stage sets and the global set.
 */
export function stageSpriteSets(content: ContentDb): StageSpriteSets {
  const byStage: (Set<number> | null)[] = content.stages.map(() => null);
  const named = new Set<number>();
  for (const zone of content.campaign?.zones ?? []) {
    const index = zone.stageId;
    if (index < 0 || index >= byStage.length || byStage[index] !== null) continue;
    const set = walkStage(content, index);
    byStage[index] = set;
    for (const id of set) named.add(id);
  }
  const global = new Set<number>();
  for (let id = 0; id < content.sprites.names.length; id++) if (!named.has(id)) global.add(id);
  return { byStage, global };
}

/** Which atlas pages each campaign zone needs. */
export interface AtlasPageNeeds {
  /** Per page: whether every stage needs it (global sprites, font glyphs, loose frames). */
  readonly global: readonly boolean[];
  /** Per page: the stages (`content.stages` indices) whose own sprites are on it. */
  readonly stages: readonly ReadonlySet<number>[];
  /** Per stage: `false` for a stage outside the campaign (it needs every page). */
  readonly campaign: readonly boolean[];
}

/**
 * Maps the zones' sprite sets onto the atlas pages.
 *
 * @remarks
 * A content sprite `name` covers every manifest sprite `name` and `name@…` (hit flash, player 2,
 * colour-blind palettes). Manifest sprites no content sprite covers (engine sprites, the UI), font
 * glyphs and frames of no sprite make their pages global. Load time.
 *
 * @param manifest - The atlas manifest.
 * @param spriteNames - `content.sprites.names`.
 * @param sets - {@link stageSpriteSets}.
 * @returns The needs.
 */
export function atlasPageNeeds(
  manifest: AtlasManifest,
  spriteNames: readonly string[],
  sets: StageSpriteSets,
): AtlasPageNeeds {
  const pageCount = manifest.pages.length;
  const global: boolean[] = [];
  const stages: Set<number>[] = [];
  for (let p = 0; p < pageCount; p++) {
    global.push(false);
    stages.push(new Set<number>());
  }
  /** Owners of each content sprite name: `null` = global, else the stages naming it. */
  const owners = new Map<string, number[] | null>();
  for (let id = 0; id < spriteNames.length; id++) {
    if (sets.global.has(id)) {
      owners.set(spriteNames[id], null);
      continue;
    }
    const list: number[] = [];
    sets.byStage.forEach((set, stage) => {
      if (set !== null && set.has(id)) list.push(stage);
    });
    owners.set(spriteNames[id], list);
  }
  /**
   * Marks a frame's page.
   *
   * @param frame - Frame name.
   * @param stageList - The owning stages, or `null` for global.
   */
  const mark = (frame: string, stageList: readonly number[] | null): void => {
    const info = Object.prototype.hasOwnProperty.call(manifest.frames, frame)
      ? manifest.frames[frame]
      : undefined;
    if (info === undefined || info.p < 0 || info.p >= pageCount) return;
    if (stageList === null) global[info.p] = true;
    else for (const stage of stageList) stages[info.p].add(stage);
  };
  const covered = new Set<string>();
  for (const sprite of Object.keys(manifest.sprites)) {
    const at = sprite.indexOf('@');
    const base = at < 0 ? sprite : sprite.slice(0, at);
    const stageList = owners.has(base) ? (owners.get(base) ?? null) : null;
    for (const frame of manifest.sprites[sprite].frames) {
      covered.add(frame);
      mark(frame, stageList);
    }
  }
  for (const font of Object.keys(manifest.fonts)) {
    const glyphs = manifest.fonts[font].glyphs;
    for (const glyph of Object.keys(glyphs)) {
      const frame = glyphs[glyph].frame;
      covered.add(frame);
      mark(frame, null);
    }
  }
  for (const frame of Object.keys(manifest.frames)) if (!covered.has(frame)) mark(frame, null);
  return { global, stages, campaign: sets.byStage.map((set) => set !== null) };
}

/**
 * The atlas pages a stage needs.
 *
 * @param needs - {@link atlasPageNeeds}.
 * @param stageIndex - The stage (`content.stages` index), or -1 for none (menus: every page).
 * @returns Page indices, ascending.
 */
export function stagePages(needs: AtlasPageNeeds, stageIndex: number): number[] {
  const all = stageIndex < 0 || needs.campaign[stageIndex] !== true;
  const pages: number[] = [];
  for (let p = 0; p < needs.global.length; p++) {
    if (all || needs.global[p] || needs.stages[p].has(stageIndex)) pages.push(p);
  }
  return pages;
}

/** An atlas page the residency can unload (Pixi's `TextureSource`). */
export interface AtlasPageLike {
  /** Frees the page's GPU texture; it is uploaded again when next drawn. */
  unload(): void;
}

/** Unloads the atlas pages a zone does not need (see the module docs). */
export interface AtlasResidency {
  /** Per page: whether it is (or will be, on its next draw) on the GPU. */
  readonly resident: readonly boolean[];
  /** Pages unloaded so far. */
  readonly unloads: number;
  /**
   * Prepares the next stage: unloads every resident page it does not need and marks the needed
   * ones resident (an unloaded one uploads on its next draw).
   *
   * @param stageIndex - The stage about to play (`content.stages` index), -1 = none.
   * @returns Pages unloaded by this call.
   */
  prepare(stageIndex: number): number;
}

/**
 * Creates the residency over the renderer's atlas pages (every page starts resident).
 *
 * @param pages - The atlas's texture sources (`Atlas.pages`).
 * @param needs - {@link atlasPageNeeds} of the same atlas.
 * @returns The residency.
 * @throws {RangeError} When the page counts differ.
 *
 * @example
 * ```ts
 * const residency = createAtlasResidency(atlas.pages, atlasPageNeeds(manifest, names, sets));
 * residency.prepare(content.stageIndex.get('zone-b') ?? -1);
 * ```
 */
export function createAtlasResidency(
  pages: readonly AtlasPageLike[],
  needs: AtlasPageNeeds,
): AtlasResidency {
  if (pages.length !== needs.global.length) {
    throw new RangeError(`residency: ${pages.length} pages but needs for ${needs.global.length}`);
  }
  const resident = pages.map(() => true);
  const state = { unloads: 0 };
  return {
    resident,
    get unloads() {
      return state.unloads;
    },
    prepare(stageIndex) {
      const needed = stagePages(needs, stageIndex);
      let count = 0;
      for (let p = 0; p < pages.length; p++) {
        const need = needed.indexOf(p) >= 0;
        if (!need && resident[p]) {
          pages[p].unload();
          count++;
        }
        resident[p] = need;
      }
      state.unloads += count;
      return count;
    },
  };
}

/**
 * Registers the residency on the scene flow's `PrepareStage` events (the zone map's launch, a run
 * or practice start, the title's return): the next stage's pages stay, the others are unloaded.
 *
 * @param dispatcher - The shell's event dispatcher.
 * @param residency - The residency.
 * @returns A function that unregisters the handler.
 */
export function connectAtlasResidency(
  dispatcher: EventDispatcher,
  residency: AtlasResidency,
): () => void {
  return dispatcher.on(SimEventKind.PrepareStage, (event) => {
    residency.prepare(event.id);
  });
}

/** What {@link estimateStageMemory} reads. */
export interface StageMemoryInputs {
  /** The content. */
  readonly content: ContentDb;
  /** The atlas manifest. */
  readonly manifest: AtlasManifest;
  /** The SFX bank (`audio-web` `loadSfxContent`). */
  readonly sfx: SfxContent;
  /** The music library (`audio-web` `loadMusicContent`). */
  readonly music: MusicContent;
  /** The stage (`content.stages` index). */
  readonly stageIndex: number;
  /** Page needs (default: computed from the content). */
  readonly needs?: AtlasPageNeeds;
  /** Display size (default 1920×1080). */
  readonly display?: MemoryInputs['display'];
  /** The synth rate (default `SYNTH_SAMPLE_RATE`). */
  readonly sampleRate?: number;
}

/**
 * Estimates what playing one stage keeps resident: its atlas pages ({@link stagePages}), the SFX
 * bank and its music set ({@link stageMusicTracks}), the render targets and the heap baseline.
 *
 * @param inputs - Content, manifest, audio content, stage.
 * @returns The estimate.
 *
 * @example
 * ```ts
 * const zoneB = estimateStageMemory({ content, manifest, sfx, music, stageIndex });
 * zoneB.withinBudget; // → true
 * ```
 */
export function estimateStageMemory(inputs: StageMemoryInputs): MemoryEstimate {
  const { content, manifest, stageIndex } = inputs;
  const rate = inputs.sampleRate ?? SYNTH_SAMPLE_RATE;
  const needs =
    inputs.needs ?? atlasPageNeeds(manifest, content.sprites.names, stageSpriteSets(content));
  const pages = stagePages(needs, stageIndex).map((p) => manifest.pages[p]);
  const stage = content.stages[stageIndex];
  let musicBytes = 0;
  if (stage !== undefined) {
    for (const track of stageMusicTracks(inputs.music, stage)) {
      musicBytes += trackBytes(inputs.music.tracks[track], rate);
    }
  }
  return estimateMemory({
    atlasPages: pages,
    sfxBytes: sfxBankBytes(inputs.sfx, rate),
    musicBytes,
    display: inputs.display,
  });
}

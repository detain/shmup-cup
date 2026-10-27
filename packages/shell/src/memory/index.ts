/**
 * # memory — the TV memory budget: estimator and atlas-page residency between zones
 *
 * **Responsibility.** Keeps the game under the TV's memory budget (shmup_tech.md §2.5:
 * dev-installed apps are capped at 120 MB; the budget is **< 100 MB**,
 * {@link MEMORY_BUDGET_BYTES}):
 *
 * - **Estimator** ({@link estimateMemory}, {@link estimateStageMemory}). What one zone keeps
 *   resident, from the data alone: the atlas pages it needs on the GPU, the decoded images those
 *   pages were uploaded from — the stage's own pages' (policy "resident", what the shipped lazy
 *   residency reports through {@link AtlasResidency.imagePolicy} since R3-04.M3e / decision
 *   W5-15: prepare drops every page the stage does not need with its image; policy "all" —
 *   Pixi keeping each image as the texture's resource, to re-upload it — is the pre-R3-04 eager
 *   runtime and stays the `all` charge ({@link ImagePolicy}) of the `atlasPages: 'eager'`
 *   option), the audio (the whole SFX bank — pre-rendered at boot —
 *   and the zone's
 *   music set: the title theme plus every cue the stage can ask for, `stageMusicCues`; mono
 *   32-bit float buffers, one copy — `audio-web` `toAudioBuffer` drops the PCM once the buffer
 *   exists), the render targets (the 384×216 frame, the layer-effect filter passes **rounded up
 *   to a power of two on each axis** as Pixi's `TexturePool` really allocates them
 *   ({@link potBytes}), the CRT filter's display-sized target when the renderer's
 *   `screenPass: 'filter'` escape hatch is on — the **shipped** CRT is charged nothing at any
 *   setting, because since M3-02d it is the pass-2 blit's own shader and pools no target — and
 *   the canvas's front / back / depth-stencil
 *   buffers at the display size, and (plan v20x A4) the image surface's **resident still**
 *   ({@link MemoryInputs.stillsPages}) at the same attached-page rate as an atlas page — GPU
 *   copy plus held image, zero while the surface shows nothing) and a JS heap baseline. Chip songs
 *   are sized from their rows ({@link songFrameBound}) without rendering them; recorded tracks
 *   from their loop end, or {@link FILE_TRACK_FALLBACK_SECONDS} of stereo when it is unknown.
 * - **Budgets** (plan R1-05, W3-5). Out of {@link MEMORY_BUDGET_BYTES}: the heap baseline
 *   ({@link HEAP_BASELINE_BYTES}, 24 MiB), the audio ({@link AUDIO_BUDGET_BYTES}, 24 MiB — the
 *   worst zone today needs ≈ 17.8 MiB) and the fixed render targets at 1080p
 *   ({@link fixedTargetBytes} of the frame, {@link DEFAULT_DISPLAY} and {@link FILTER_TARGETS});
 *   the atlas gets the rest, floored to whole MiB — {@link TEXTURE_BUDGET_BYTES}, derived from
 *   core's `FRAME_W` × `FRAME_H` by {@link textureBudgetFor}: 26 MiB at 384×216, 23 MiB at
 *   640×360 (it drops by itself at R2-01's flip). R3-04 set the sibling **download** budget from
 *   the same stand-in projection: `DIST_BUDGET` (the Tizen bundle check) is 16 MiB since M2b, with
 *   its measured derivation in that script's docblock (decision W5-16).
 * - **Residency** ({@link stageSpriteSets}, {@link atlasPageNeeds}, {@link createAtlasResidency}).
 *   Which sprites a campaign zone uses is found by walking its stage spec and everything it names
 *   (enemies — children, bosses, inner / double bosses, minions —, tilesets and linked stages such
 *   as a bonus stage): every `sprite…Id` reached. A sprite no walked stage names (ships, shots,
 *   bullets, items, particles, the UI, dev ranges' enemies) is **global**. Since R5-10.T8 the walk
 *   also reaches each stage a zone **links** — the zone's `escape` sequence and the bonus stages
 *   its stage references — and a linked stage does not need every page: its pages are the global
 *   ones plus its linking zones' (the escape shares zones H and I's, a bonus stage its zone's).
 *   Art only a linked stage names (no zone claims it) is global with the rest, so the `common`
 *   pages stay exactly the global ones; art a linked stage shares with a zone keeps that zone's
 *   page. An atlas page is needed by a zone when it holds a global sprite, a font glyph, a frame
 *   of no sprite, or one of the zone's own sprites (their `@flash` / `@p2` / palette siblings
 *   included). The engine's, the UI
 *   kit's and the scene view's sprites (`ENGINE_SPRITES`, `UI_SPRITES`, {@link SCENE_VIEW_SPRITES})
 *   are global even when a zone names one (R1-05): the renderer draws them in every zone, and the
 *   packer keeps them in the `common` group. Between zones — on the
 *   scene flow's `PrepareStage` event, while the next stage loads ({@link connectAtlasResidency}),
 *   and — since R1-05 — whenever the shell shows a new World ({@link prepareShownWorld}: the attract
 *   demo never emits `PrepareStage`) — the pages the next zone does not need are unloaded from the
 *   GPU (Pixi `TextureSource.unload`) and, with the residency's `upload` option, every needed page
 *   without a GPU copy is uploaded there and then (the renderer's `uploadTextureSource`), so none
 *   uploads on its first draw mid-play. A stage outside the campaign (the dev ranges) needs every
 *   page. Since R1-05 the shipped atlas is split into a `common` page and one page per zone
 *   (`assets/source/atlas-groups.json`), so a zone keeps `common` plus its own page on the GPU.
 *   Since R3-04 the residency runs in two modes: eager (the default, R1-05) keeps the decoded
 *   images of every page in memory (policy "all", W3-2 — dropping them needs a re-fetch after a
 *   WebGL context loss); lazy ({@link createLazyAtlasResidency}, decision W5-15) starts the atlas
 *   with unloaded pages, fetches, decodes, attaches and uploads a stage's pages at the stage
 *   change, and drops the pages it does not need with their decoded images (policy "resident") —
 *   when a page's image is dropped its bytes leave memory, so a WebGL context loss must re-fetch
 *   the resident pages (plan R3-04.M3d).
 *   The residency **owns** the pages' GPU lifetime: Pixi's
 *   texture GC never drops an atlas page (`@shmup/render-pixi` `createAtlas` turns its
 *   `autoGarbageCollect` off), and a prepare unloads every page the next stage does not need,
 *   **whether or not it believes the page resident** — a page drawn behind its back (the weapon
 *   select's live preview flies the dev `weapon-range`, whose `terrain-a` tiles sit on zone A's
 *   page, and Pixi uploads that page on the preview's first draw) leaves the GPU at the next
 *   stage change, the game start.
 *
 * Nothing here runs per frame: the walk runs once at boot, `prepare` once per stage change or new
 * World.
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
 * {@link potBytes}, {@link FILTER_TARGETS}, {@link fixedTargetBytes}, {@link textureBudgetFor},
 * {@link DEFAULT_DISPLAY}, {@link ImagePolicy},
 * {@link stagePages}, {@link createAtlasResidency}, {@link createLazyAtlasResidency},
 * {@link AtlasResidency},
 * {@link AtlasResidencyOptions}, {@link AtlasResidencyLazyOptions}, {@link AtlasPageLike},
 * {@link connectAtlasResidency},
 * {@link LazyAtlasResidency}, {@link AtlasResidencyLazy}, {@link AtlasLazyPages},
 * {@link AtlasPageImageLoader},
 * {@link prepareShownWorld}, {@link worldOfView}, {@link stageIndexOfWorld},
 * {@link ResidencyGameLike}, {@link ResidencyWorldLike}, {@link MEMORY_BUDGET_BYTES},
 * {@link TEXTURE_BUDGET_BYTES},
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
import {
  ENGINE_SPRITES,
  FRAME_H,
  FRAME_W,
  MUSIC_CUES,
  SimEventKind,
  UI_SPRITES,
  defineModule,
  type ContentDb,
  type CrtFilter,
} from '@shmup/core';
import type { AtlasManifest, AtlasPageImage } from '@shmup/render-pixi';
import type { EventDispatcher } from '../dispatch/index.js';
import { SCENE_VIEW_SPRITES } from '../scene-view/index.js';

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

/**
 * Share of the budget the audio may take (SFX bank + one zone's music set): 24 MiB (plan R1-05,
 * W3-5 — 32 MiB until then; the worst zone today needs ≈ 17.8 MiB).
 */
export const AUDIO_BUDGET_BYTES = 24 * MIB;

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

/**
 * Filter passes the renderer may hold **at once** at the internal frame size (M2-08 layer
 * effects). Pixi's `TexturePool` hands out one texture per size class and takes it back when the
 * filter pops, so this is the nesting depth — a filtered layer with another filter inside it —
 * not the number of filtered layers a stage has. The render bench measures exactly one 512 × 256
 * target for the layer-effect scenario (`docs/dev/input-probe-results.md` §11); 2 is headroom.
 */
export const FILTER_TARGETS = 2;

/** Buffers of the canvas at the display size: front, back and depth / stencil. */
const CANVAS_BUFFERS = 3;

/** The display the estimate assumes when none is given: 1080p (the M7s, the LG sets). */
export const DEFAULT_DISPLAY: { readonly width: number; readonly height: number } = Object.freeze({
  width: 1920,
  height: 1080,
});

/** Width of the internal frame the renderer draws into (core's `FRAME_W` — decision D19). */
const FRAME_WIDTH = FRAME_W;

/** Height of the internal frame (core's `FRAME_H`). */
const FRAME_HEIGHT = FRAME_H;

/**
 * Bytes a **pooled** RGBA render target of `w × h` really takes: Pixi's `TexturePool` rounds each
 * axis up to the next power of two (`TexturePool.getOptimalTexture`), so a 384 × 216 filter pass
 * is a 512 × 256 texture — 1.6× what the naive product says (the render review's **F3**).
 *
 * @param w - Requested width in pixels.
 * @param h - Requested height in pixels.
 * @returns `nextPow2(w) × nextPow2(h) × 4`, or 0 when either axis is not positive.
 *
 * @example
 * ```ts
 * potBytes(384, 216); // → 524 288 (512 × 256 × 4)
 * potBytes(1920, 1080); // → 16 777 216 (2048 × 2048 × 4)
 * ```
 */
export function potBytes(w: number, h: number): number {
  if (!(w > 0) || !(h > 0)) return 0;
  let pw = 1;
  while (pw < w) pw *= 2;
  let ph = 1;
  while (ph < h) ph *= 2;
  return pw * ph * 4;
}

/** A size in pixels (a frame, a display). */
interface Size {
  /** Width in pixels. */
  readonly width: number;
  /** Height in pixels. */
  readonly height: number;
}

/**
 * Bytes of the render targets that do not depend on the content: the internal frame's target
 * (created directly, so exactly its size), `filters` pooled filter passes at the frame size
 * (power-of-two rounded — {@link potBytes}) and the canvas's front / back / depth-stencil buffers
 * at the display size. The CRT's legacy filter target is not in it (see
 * {@link MemoryInputs.crtAsFilter}).
 *
 * @param frame - The internal frame.
 * @param display - The canvas's drawing buffer.
 * @param filters - Filter passes live at once.
 * @returns Bytes.
 *
 * @example
 * ```ts
 * fixedTargetBytes({ width: FRAME_W, height: FRAME_H }, DEFAULT_DISPLAY, FILTER_TARGETS);
 * // → 26 263 552 at 384×216 (331 776 + 2 × 524 288 + 24 883 200); 29 999 104 at 640×360
 * ```
 */
export function fixedTargetBytes(frame: Size, display: Size, filters: number): number {
  return (
    frame.width * frame.height * 4 +
    potBytes(frame.width, frame.height) * filters +
    display.width * display.height * 4 * CANVAS_BUFFERS
  );
}

/**
 * The atlas's share of the budget for an internal frame (plan R1-05, W3-5): what is left of
 * {@link MEMORY_BUDGET_BYTES} after the heap baseline, the audio share and the fixed render targets
 * at 1080p ({@link fixedTargetBytes} with {@link DEFAULT_DISPLAY} and {@link FILTER_TARGETS}),
 * floored to whole MiB.
 *
 * @param frame - The internal frame.
 * @returns Bytes (a multiple of {@link MIB}).
 *
 * @example
 * ```ts
 * textureBudgetFor({ width: FRAME_W, height: FRAME_H }) / MIB; // → 26 at 384×216, 23 at 640×360
 * ```
 */
export function textureBudgetFor(frame: Size): number {
  const left =
    MEMORY_BUDGET_BYTES -
    HEAP_BASELINE_BYTES -
    AUDIO_BUDGET_BYTES -
    fixedTargetBytes(frame, DEFAULT_DISPLAY, FILTER_TARGETS);
  return Math.floor(left / MIB) * MIB;
}

/**
 * Share of the budget the atlas may take (GPU pages + their decoded images):
 * {@link textureBudgetFor} the current frame — 26 MiB at 384×216, **23 MiB at 640×360** (it was a
 * flat 32 MiB until plan R1-05). Derived from core's `FRAME_W` / `FRAME_H`, so R2-01's flip lowers
 * it with no edit here.
 *
 * @remarks
 * R3-04.M2a measured the art-bible stand-in against it (`test/integration/standin-budget.test.ts`,
 * decision W5-14): a zone's `common` (1024²) plus one 2048×1024 stand-in page charges
 * 12,582,912 B of textures + images under `imagePolicy: 'none'` — inside this share — while the
 * same row under `'resident'` charges 25,165,824 B, **1 MiB over it**. That split is why the
 * stand-in is gated at `'none'` and why the lazy residency (R3-04.M3b, decision W5-15) drops a
 * page's decoded image the moment it detaches the page: at the bible's density, keeping even the
 * stage's own pages' images does not fit. The zone estimates anchor there —
 * {@link estimateStageMemory} charges the `resident` set, what the shipped residency holds.
 */
export const TEXTURE_BUDGET_BYTES = textureBudgetFor({ width: FRAME_W, height: FRAME_H });

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
 *
 * @example
 * ```ts
 * pageBytes({ w: 1024, h: 1024 }) / MIB; // → 4
 * ```
 */
export function pageBytes(page: PageSize): number {
  return page.w * page.h * 4;
}

/** What {@link estimateMemory} adds up. */
export interface MemoryInputs {
  /** The atlas pages resident on the GPU. */
  readonly atlasPages: readonly PageSize[];
  /**
   * Whether the decoded page images stay in memory next to their GPU copies (default `true`).
   * Since plan v20x P0-1 a held image is normally an `ImageBitmap` — the texture's re-upload
   * source after a context loss — whose backing costs the same `w × h × 4` bytes this estimate
   * charges, on the GPU side until it is dropped; a detached page's bitmap is closed by
   * `Atlas.unloadPage` the moment the residency releases the page, so an unclosed bitmap never
   * piles up inside the atlas share (the leak class that decision W5-15 dropped images for).
   */
  readonly keepPageImages?: boolean;
  /**
   * The pages whose decoded images stay in memory (R1-05; default `atlasPages`). The eager
   * residency keeps every image even of a page whose GPU copy was unloaded, so an estimate for it
   * passes every page here ({@link estimateStageMemory} does under the `all` policy); the shipped
   * lazy residency drops a detached page's image with it — and closes an `ImageBitmap` — so the
   * default charges the stage's own pages only. Ignored when `keepPageImages` is `false`.
   */
  readonly imagePages?: readonly PageSize[];
  /** Bytes of the SFX bank's buffers. */
  readonly sfxBytes: number;
  /** Bytes of the resident music set's buffers. */
  readonly musicBytes: number;
  /** The display (canvas drawing buffer) size in pixels (default {@link DEFAULT_DISPLAY}). */
  readonly display?: {
    /** Width in pixels. */
    readonly width: number;
    /** Height in pixels. */
    readonly height: number;
  };
  /** The internal frame the renderer draws into (default core's `FRAME_W` × `FRAME_H` — D19). */
  readonly frame?: {
    /** Width in pixels. */
    readonly width: number;
    /** Height in pixels. */
    readonly height: number;
  };
  /**
   * Filter passes live at once at the internal frame size (default {@link FILTER_TARGETS}); each
   * is pooled power-of-two-rounded ({@link potBytes}).
   */
  readonly filterTargets?: number;
  /** The CRT / scanline setting (`core/config` `CRT_FILTERS`; default `off`). */
  readonly crtFilter?: CrtFilter;
  /**
   * Whether the CRT runs as a Pixi **filter** over the second pass (the renderer's
   * `screenPass: 'filter'` escape hatch), which pools a display-sized render target — 16.8 MB at
   * 1920 × 1080. Default `false`: since plan **M3-02d** the shipped path folds the CRT into the
   * pass-2 blit, so it costs no render target at all (the render review's **F2** / **F3**).
   *
   * @remarks
   * That legacy term is **deliberately conservative, and meant to stay that way**: it charges
   * `potBytes(display)` flat, ignoring `render-pixi` `crtResolution`'s `CRT_MAX_HEIGHT` cap (which
   * keeps that pass at 1080 rows, so a 4K display is charged four times the target the capped pass
   * would really pool) — and charging the whole display even when
   * an aspect mode pillarboxes the picture into part of it. The estimator exists to defend a
   * budget, so over-charging a path nothing ships on is the safe direction; do not "fix" it into
   * an exact model. `memory-edge.test.ts` pins both behaviours on purpose.
   */
  readonly crtAsFilter?: boolean;
  /** JS heap baseline (default {@link HEAP_BASELINE_BYTES}). */
  readonly heapBytes?: number;
  /**
   * The image surface's resident stills (plan v20x A4): one entry while the stills director
   * shows a picture ({@link createImageSurface} — the shell's `stills` module passes the
   * surface's current bitmap size), empty or omitted while it holds nothing (a hidden surface
   * closes its bitmap and destroys its texture, so it charges zero — the VRAM law). Each entry
   * costs `w × h × 4` on the GPU and the same again for the decoded image held as the
   * re-upload source: exactly the attached-page rule of {@link MemoryInputs.atlasPages}.
   */
  readonly stillsPages?: readonly PageSize[];
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
  /** Render targets (the internal frame, the pooled filter passes, the canvas buffers). */
  readonly targets: number;
  /**
   * Bytes of the image surface's resident stills, folded into {@link MemoryEstimate.textures}
   * and {@link MemoryEstimate.images} (plan v20x A4; reported separately for the budget table).
   */
  readonly stills: number;
  /** JS heap baseline. */
  readonly heap: number;
  /** Everything. */
  readonly total: number;
  /** The budget. */
  readonly budget: number;
  /**
   * `total ≤ budget`, the atlas within its share for the estimate's frame ({@link textureBudgetFor}
   * — {@link TEXTURE_BUDGET_BYTES} at the default frame) and the audio within
   * {@link AUDIO_BUDGET_BYTES}.
   */
  readonly withinBudget: boolean;
}

/**
 * Adds up what stays resident.
 *
 * @remarks
 * The shipped renderer's CRT costs **nothing** here at any setting — since plan M3-02d it is the
 * pass-2 blit's own shader (the review's **F2**), so there is no target to charge. Only
 * `crtAsFilter` (the `screenPass: 'filter'` escape hatch) adds one, and that term is conservative
 * by design: see {@link MemoryInputs.crtAsFilter}.
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
  let images = 0;
  if (inputs.keepPageImages !== false) {
    for (const page of inputs.imagePages ?? inputs.atlasPages) images += pageBytes(page);
  }
  // The resident stills (plan v20x A4): GPU copy and held image, the attached-page rule —
  // counted regardless of `keepPageImages`, which models the atlas's eager/lazy policy, not
  // the surface's (a shown still always holds both halves; a hidden one holds neither).
  let stillBytes = 0;
  for (const page of inputs.stillsPages ?? []) {
    const bytes = pageBytes(page);
    textures += bytes;
    images += bytes;
    stillBytes += bytes * 2;
  }
  const display = inputs.display ?? DEFAULT_DISPLAY;
  const frame = inputs.frame ?? { width: FRAME_WIDTH, height: FRAME_HEIGHT };
  // The frame target is created directly (`RenderTexture.create`), so it is exactly its own
  // size; only the *pooled* filter passes are rounded up to a power of two on each axis.
  const filterCount = inputs.filterTargets ?? FILTER_TARGETS;
  const crtTarget =
    inputs.crtAsFilter === true && (inputs.crtFilter ?? 'off') !== 'off'
      ? potBytes(display.width, display.height)
      : 0;
  const targets = fixedTargetBytes(frame, display, filterCount) + crtTarget;
  const heap = inputs.heapBytes ?? HEAP_BASELINE_BYTES;
  const budget = inputs.budget ?? MEMORY_BUDGET_BYTES;
  const total = textures + images + inputs.sfxBytes + inputs.musicBytes + targets + heap;
  return Object.freeze({
    textures,
    images,
    sfx: inputs.sfxBytes,
    music: inputs.musicBytes,
    targets,
    stills: stillBytes,
    heap,
    total,
    budget,
    withinBudget:
      total <= budget &&
      textures + images <= textureBudgetFor(frame) &&
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

/** The sprites each campaign zone names, the ones none does, and the stages a zone links. */
export interface StageSpriteSets {
  /** Per stage (`content.stages` index): its sprite ids, or `null` outside the campaign. */
  readonly byStage: readonly (ReadonlySet<number> | null)[];
  /** Sprite ids no walked stage names (always resident). */
  readonly global: ReadonlySet<number>;
  /**
   * Per stage: the campaign-zone stage indices that link it — a zone's stage reaching a bonus
   * stage through a `stageId` reference, or the zone's `escape` sequence (R5-10.T8) — or `null`
   * for a zone's own stage and for every stage no campaign zone reaches. A linked stage's sprites
   * are its linking zones' pages, not the whole atlas: {@link atlasPageNeeds} gives it their pages.
   */
  readonly linkedBy: readonly (readonly number[] | null)[];
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
 * @param onStage - Called with every stage index the walk reaches through a `stageId`
 *   reference (R5-10.T8: the caller records bonus-stage links).
 * @returns Sprite ids.
 */
function walkStage(
  content: ContentDb,
  stageIndex: number,
  onStage?: (stageIndex: number) => void,
): Set<number> {
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
        // A stage's music cue table carries numeric `stageId`/`bossId` too — MUSIC track indices,
        // not references (a collision that has always slipped into the walk's enemy side; keep
        // the walk's names as the zones drew them, but never let a cue number masquerade as a
        // linked stage). Only the music table pairs `stageId` with `bossId`; a real bonus-stage
        // or escape reference carries one or neither.
        if (record.bossId === undefined) {
          if (field >= 0 && field < content.stages.length && onStage !== undefined) {
            onStage(field);
          }
          follow(content.stages, field);
        }
      }
    }
  }
  return sprites;
}

/**
 * The sprites of every campaign zone and of every stage a zone links (see the module docs):
 * a zone's stage and what it names, and (R5-10.T8) the same walk for each linked stage — the
 * `escape` sequence a zone's card names and the bonus stages its stage reaches — recorded in
 * {@link StageSpriteSets.linkedBy} as the walk finds them.
 *
 * @remarks
 * Load time (walks the specs once). Without a campaign every stage is "outside" and every sprite
 * global. The sets follow the data only: an engine, UI or scene-view sprite a zone names is in that
 * zone's set here, and {@link atlasPageNeeds} makes it global. A linked stage's own set feeds only
 * the page marking — {@link stagePages} never narrows by it the way a zone's does, because the
 * alias rule in {@link atlasPageNeeds} hands the linked stage its linking zones' pages.
 *
 * @param content - The content.
 * @returns Per-stage sets, the global set, and the per-stage linking zones.
 */
export function stageSpriteSets(content: ContentDb): StageSpriteSets {
  const byStage: (Set<number> | null)[] = content.stages.map(() => null);
  const linkedBy: (number[] | null)[] = content.stages.map(() => null);
  /** Stage indices that are a campaign zone's own stage — a zone is never a linked stage. */
  const zoneStages = new Set<number>();
  for (const zone of content.campaign?.zones ?? []) {
    if (zone.stageId >= 0 && zone.stageId < byStage.length) zoneStages.add(zone.stageId);
  }
  const named = new Set<number>();
  /** Queues a link for the walk below (zones never link a zone). */
  const link = (target: number, via: number): void => {
    if (target < 0 || target >= byStage.length || zoneStages.has(target)) return;
    const list = linkedBy[target];
    if (list === null) linkedBy[target] = [via];
    else if (list.indexOf(via) < 0) list.push(via);
  };
  const pending: number[] = [];
  /** Notes a reached stage: records the link, and queues it for the walk below (never a zone). */
  const reach = (reached: number, via: number): void => {
    link(reached, via);
    if (!zoneStages.has(reached) && byStage[reached] === null && pending.indexOf(reached) < 0) {
      pending.push(reached);
    }
  };
  for (const zone of content.campaign?.zones ?? []) {
    const index = zone.stageId;
    if (index < 0 || index >= byStage.length || byStage[index] !== null) continue;
    const set = walkStage(content, index, (reached) => reach(reached, index));
    byStage[index] = set;
    for (const id of set) named.add(id);
    if (zone.escapeId >= 0) reach(zone.escapeId, index);
  }
  // Linked stages walk to a fixed point: a stage linked while the queue runs joins it (bonus
  // chains, an escape reaching further stages). `byStage[link]` is complete by the time its
  // linker walks, so a re-link only extends `linkedBy`, never a missed set.
  for (let q = 0; q < pending.length; q++) {
    const index = pending[q];
    if (index === undefined || byStage[index] !== null) continue;
    const via = linkedBy[index];
    if (via === null) continue;
    const set = walkStage(content, index, (reached) => {
      for (const zone of via) reach(reached, zone);
    });
    byStage[index] = set;
    for (const id of set) named.add(id);
  }
  const global = new Set<number>();
  for (let id = 0; id < content.sprites.names.length; id++) if (!named.has(id)) global.add(id);
  return { byStage, global, linkedBy };
}

/**
 * Sprites every zone draws whatever the data says (R1-05): the engine's and the UI kit's
 * (`ENGINE_SPRITES`, which holds `UI_SPRITES`) and the scene view's starfield.
 */
const ALWAYS_GLOBAL_SPRITES: ReadonlySet<string> = new Set([
  ...ENGINE_SPRITES,
  ...UI_SPRITES,
  ...SCENE_VIEW_SPRITES,
]);

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
 * colour-blind palettes). Manifest sprites no content sprite covers (the scene view's starfield),
 * font glyphs and frames of no sprite make their pages global — and so do the engine's, the UI
 * kit's and the scene view's own sprites (`ENGINE_SPRITES`, `UI_SPRITES`,
 * {@link SCENE_VIEW_SPRITES}) even when a zone names one (R1-05): the renderer draws them in every
 * zone. A page a **linked** stage owns with no zone sharing it is global too (R5-10.T8): it holds
 * only art no zone names (the escape's own layers), so the {@link stagePages} alias below gives it
 * to the linking zones by their link, never by an owner the page can carry — and every `common`
 * group page stays a global page. Otherwise a page lists the stages whose sets own its sprites,
 * each zone widened to the stages it links: a linked stage needs the global pages and its
 * linking zones' pages, not every page (a dev stage — no set at all — still gets every one).
 * Load time.
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
  /** A campaign zone's own stage: it has a set and is not itself a linked stage. */
  const isZoneStage = (stage: number): boolean =>
    sets.byStage[stage] !== null && sets.linkedBy[stage] === null;
  /** Per zone stage: the stages it links (directly or through a reached stage). */
  const linkedOf: number[][] = sets.byStage.map(() => []);
  for (let s = 0; s < sets.linkedBy.length; s++) {
    const via = sets.linkedBy[s];
    if (via === null) continue;
    for (const zone of via) {
      if (zone >= 0 && zone < linkedOf.length && linkedOf[zone].indexOf(s) < 0) {
        linkedOf[zone].push(s);
      }
    }
  }
  /**
   * Widens a stage list to the page owners it implies (R5-10.T8): every zone names the stages
   * that link to it. A list of no zone is the linked stages' own art: global when their linkers
   * span more than one zone (the `common` pages the derivation packs it onto are the global
   * ones), or the linking zone's — widened the same way — when they span exactly one.
   *
   * @param list - The stages whose sets hold the sprite.
   * @returns The owner list, or `null` for global.
   */
  const ownersOf = (list: readonly number[]): readonly number[] | null => {
    const out: number[] = [];
    const loneZones: number[] = [];
    let hasZone = false;
    for (const s of list) {
      out.push(s);
      if (isZoneStage(s)) {
        hasZone = true;
        for (const linked of linkedOf[s]) if (out.indexOf(linked) < 0) out.push(linked);
      } else
        for (const zone of sets.linkedBy[s] ?? [])
          if (loneZones.indexOf(zone) < 0) loneZones.push(zone);
    }
    if (hasZone) return out;
    if (loneZones.length !== 1) return null;
    const zone = loneZones[0];
    if (zone === undefined || out.indexOf(zone) < 0) out.push(zone);
    for (const linked of linkedOf[zone] ?? []) if (out.indexOf(linked) < 0) out.push(linked);
    return out;
  };
  /** Owners of each content sprite name: `null` = global, else the stages naming it. */
  const owners = new Map<string, readonly number[] | null>();
  for (let id = 0; id < spriteNames.length; id++) {
    if (sets.global.has(id) || ALWAYS_GLOBAL_SPRITES.has(spriteNames[id])) {
      owners.set(spriteNames[id], null);
      continue;
    }
    const list: number[] = [];
    sets.byStage.forEach((set, stage) => {
      if (set !== null && set.has(id)) list.push(stage);
    });
    owners.set(spriteNames[id], ownersOf(list));
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
 * @returns Page indices, ascending (a new array — cold path).
 *
 * @example
 * ```ts
 * stagePages(needs, content.stageIndex.get('zone-b') ?? -1); // → [0] with today's one-page atlas
 * stagePages(needs, -1);                                     // → every page
 * ```
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
  /**
   * Frees the page's GPU texture; it is uploaded again when next drawn. Must be harmless on a page
   * that has no GPU copy (Pixi's `TextureSource.unload` then deletes nothing): the residency
   * unloads every page a stage does not need, resident or not.
   */
  unload(): void;
}

/**
 * The atlas page API a lazy residency drives — render-pixi's `Atlas` satisfies it (plan R3-04.M3a,
 * decision W5-15: pages may start unloaded, be attached with {@link AtlasLazyPages.loadPage} and
 * detached with {@link AtlasLazyPages.unloadPage}, which also drops the decoded image).
 */
export interface AtlasLazyPages {
  /**
   * Attaches a decoded image to a page and points its frames at it (the atlas's `loadPage`).
   *
   * @param page - Page index.
   * @param image - The decoded page image; its size must match the manifest entry.
   */
  loadPage(page: number, image: AtlasPageImage): void;
  /**
   * Detaches a page: frees its GPU copy and drops its decoded image (the atlas's `unloadPage`).
   *
   * @param page - Page index.
   */
  unloadPage(page: number): void;
  /**
   * Whether a page's image is attached now (the atlas's `isPageLoaded`).
   *
   * @param page - Page index.
   * @returns `true` when the page holds its image.
   */
  isPageLoaded(page: number): boolean;
}

/**
 * One page image fetched and decoded — the shell's page-image factory bound to the page index
 * (plan R3-04.M3b; since plan v20x P0-1 the boot binds its `createImage` factory, which decodes
 * through `createImageBitmap` with an `Image` fallback).
 *
 * @param page - The page index.
 * @returns A promise that resolves with the decoded image once the fetch and the decode are done;
 *   rejects with the loader's `AssetLoadError` naming the page's URL when the fetch or the load
 *   fails (a rejected decode still counts as loaded, as in {@link loadImagesTimed}). A returned
 *   `ImageBitmap` is closed by `Atlas.unloadPage` when the residency detaches its page.
 */
export type AtlasPageImageLoader = (page: number) => Promise<AtlasPageImage>;

/** What {@link AtlasResidencyLazyOptions.lazy} carries (plan R3-04.M3b, decision W5-15). */
export interface AtlasResidencyLazy {
  /** The atlas's deferred-page API (`Atlas.loadPage` / `unloadPage` / `isPageLoaded`). */
  readonly atlas: AtlasLazyPages;
  /** Fetches and decodes one page's image (the boot's timed page-image factory, bound). */
  readonly loadImage: AtlasPageImageLoader;
}

/** Options of {@link createAtlasResidency} (plan R1-05). */
export interface AtlasResidencyOptions {
  /**
   * Uploads page `page` to the GPU now — the shell passes the renderer's `uploadTextureSource`.
   * With it, {@link AtlasResidency.prepare} uploads every needed page that has no GPU copy, at the
   * stage change, so no page uploads on its first draw mid-play. Omitted: a needed page uploads on
   * its first draw (the M2-17 behaviour). A throwing upload is skipped (Pixi uploads the page on
   * its first draw instead) and retried by the next prepare.
   *
   * @param page - The page index.
   */
  readonly upload?: (page: number) => void;
  /**
   * Called after the first prepare and after every prepare that unloaded or uploaded a page (the
   * shell writes `data-shmup-atlas-pages` / `data-shmup-atlas-load-ms` from it). In lazy mode a
   * prepare that attached page images reports too, even when nothing left the GPU.
   *
   * @param resident - The pages now resident, ascending (a new array).
   * @param unloads - Pages unloaded so far.
   * @param ms - How long the prepare took (0 without {@link AtlasResidencyOptions.now}).
   */
  readonly onChange?: (resident: readonly number[], unloads: number, ms: number) => void;
  /**
   * The clock a prepare is timed with (the shell passes `performance.now`). Omitted: 0 ms.
   *
   * @returns Milliseconds.
   */
  readonly now?: () => number;
}

/** Options of {@link createLazyAtlasResidency} (plan R3-04.M3b, decision W5-15). */
export interface AtlasResidencyLazyOptions extends AtlasResidencyOptions {
  /**
   * Lazy residency (plan R3-04): the atlas's pages start unloaded and
   * {@link LazyAtlasResidency.prepare} fetches and decodes the images of the pages the stage
   * needs, attaches and uploads them, and detaches the pages it does not need (with their decoded
   * images). The residency's {@link AtlasResidency.imagePolicy} is `resident`; the eager
   * {@link createAtlasResidency} keeps every page's image (`all`).
   */
  readonly lazy: AtlasResidencyLazy;
}

/** Keeps on the GPU the atlas pages the stage about to play needs (see the module docs). */
export interface AtlasResidency {
  /** Per page: whether it is (or will be, on its next draw) on the GPU. */
  readonly resident: readonly boolean[];
  /** Pages unloaded so far (only those it believed resident — {@link AtlasResidency.prepare}). */
  readonly unloads: number;
  /** Pages uploaded by prepares so far (always 0 without {@link AtlasResidencyOptions.upload}). */
  readonly uploads: number;
  /** How long the last prepare that changed something took, in ms (0 before any, or untimed). */
  readonly lastPrepareMs: number;
  /**
   * Which decoded page images the runtime holds ({@link ImagePolicy}): `all` for the eager
   * residency — every page keeps its image (W3-2); `resident` for the lazy one — only the pages
   * attached now hold theirs, the rest were dropped with their images (plan R3-04, W5-15). The
   * boot's memory estimates read it ({@link StageMemoryInputs.imagePolicy}).
   */
  readonly imagePolicy: ImagePolicy;
  /**
   * Prepares the next stage: unloads every page it does not need, marks the needed ones resident
   * and — with {@link AtlasResidencyOptions.upload} — uploads every needed page that has no GPU
   * copy (unloads first, so the old zone's memory is free before the new one's is taken). Without
   * `upload`, an unloaded page uploads on its next draw. Idempotent: preparing the stage already
   * prepared (or one needing the same pages) uploads nothing and reports nothing.
   *
   * @remarks
   * Cold path — a `PrepareStage` event, a new World, boot; it may allocate.
   *
   * **Self-healing.** `unload` is called on **every** page the stage does not need, including
   * the ones the residency believes are already off the GPU: something may have drawn such a page
   * behind its back (the weapon select's preview draws zone A's terrain page; Pixi uploads a page
   * on its first draw), and unloading a page without a GPU copy costs nothing. The return value,
   * {@link AtlasResidency.unloads} and `onChange` count only the pages it believed resident, so a
   * repeated prepare still reports nothing.
   *
   * @param stageIndex - The stage about to play (`content.stages` index), -1 = none (every page).
   * @returns Pages unloaded by this call that it believed resident.
   */
  prepare(stageIndex: number): number;
}

/**
 * A residency over an atlas whose pages start unloaded (plan R3-04.M3b, decision W5-15): the same
 * page bookkeeping as {@link AtlasResidency}, but its prepare loads images — fetch, decode,
 * attach, upload — and so runs asynchronously. {@link createLazyAtlasResidency} builds one.
 */
export interface LazyAtlasResidency {
  /** Per page: whether it is (or will be, on its next draw) on the GPU. */
  readonly resident: readonly boolean[];
  /**
   * Pages unloaded so far (only those it believed resident —
   * {@link LazyAtlasResidency.prepare}).
   */
  readonly unloads: number;
  /** Pages uploaded by prepares so far (always 0 without {@link AtlasResidencyOptions.upload}). */
  readonly uploads: number;
  /** How long the last prepare that changed something took, in ms (0 before any, or untimed). */
  readonly lastPrepareMs: number;
  /** Always `resident` — only attached pages hold a decoded image ({@link ImagePolicy}). */
  readonly imagePolicy: ImagePolicy;
  /**
   * Whether a prepare's page loads are in flight (plan R3-04.M3c: the frame loop redraws the last
   * frame instead of ticking while the shown World's pages load). A plain field read — the frame
   * loop may poll it every frame; it never allocates.
   */
  readonly loading: boolean;
  /**
   * Prepares the next stage (lazy mode): detaches and drops every page the stage does not need,
   * fetches and decodes the images of the needed pages that are not attached yet (in parallel,
   * through {@link AtlasResidencyLazy.loadImage}), attaches them, and uploads every needed page
   * with {@link AtlasResidencyOptions.upload}. Idempotent: preparing the stage already prepared
   * loads nothing and reports nothing.
   *
   * @remarks
   * Cold path — a `PrepareStage` event, a new World, boot; it allocates. Detaching a page frees
   * both its GPU copy and its decoded image; the residency still calls `unload` on **every** page
   * the stage does not need, resident or not (the self-healing rule of {@link AtlasResidency}).
   * A prepare superseded by a newer one before its loads settle attaches its images (they are
   * decoded bytes worth keeping) but leaves the GPU pass and the report to the newer prepare;
   * a page the newer stage does not need leaves the atlas at the next prepare. A failed load
   * rejects the prepare **after** its detach pass: the pages the stage does not need are already
   * gone; the needed ones stay as they were and the next prepare retries them.
   *
   * @param stageIndex - The stage about to play (`content.stages` index), -1 = none (every page:
   *   the menus, the dev scenes, linked stages — W5-18).
   * @returns Resolves when every needed page is attached and the GPU pass is done.
   * @throws Rejects with the loader error of the first page whose image failed to load — the
   *   `AssetLoadError` of {@link AtlasResidencyLazy.loadImage}.
   */
  prepare(stageIndex: number): Promise<void>;
}

/**
 * The shared residency state (both factories below build on it).
 *
 * @param pages - The atlas's texture sources (`Atlas.pages`).
 * @param needs - {@link atlasPageNeeds} of the same atlas.
 * @param options - Eager upload, change callback and clock.
 * @param lazy - The lazy inputs ({@link AtlasResidencyLazyOptions.lazy}), `undefined` for the
 *   eager residency.
 * @returns The residency — a {@link LazyAtlasResidency} when `lazy` is set.
 * @throws {RangeError} When the page counts differ.
 */
function residencyCore(
  pages: readonly AtlasPageLike[],
  needs: AtlasPageNeeds,
  options: AtlasResidencyOptions,
  lazy: AtlasResidencyLazy | undefined,
): AtlasResidency | LazyAtlasResidency {
  if (pages.length !== needs.global.length) {
    throw new RangeError(`residency: ${pages.length} pages but needs for ${needs.global.length}`);
  }
  const { upload, onChange, now } = options;
  // Eager: every page holds its image and starts resident. Lazy: none is attached yet, so none is
  // resident until a prepare loads it (and a page stops being resident the moment it is dropped).
  const resident = pages.map(() => lazy === undefined);
  /** Per page: uploaded by a prepare and not unloaded since. */
  const onGpu = pages.map(() => false);
  const state = {
    unloads: 0,
    uploads: 0,
    lastPrepareMs: 0,
    prepared: false,
    /** Prepares between their detach pass and their settle (the lazy `loading` flag). */
    pending: 0,
  };
  /** The generation of the last-started lazy prepare (supersession, see `prepareLazy`). */
  let generation = 0;

  /**
   * The detach pass both modes share: unload every page the stage does not need (self-healing:
   * `unload` reaches every one of them, and lazy also drops its image), mark the rest resident.
   *
   * @param needed - The stage's page indices, ascending.
   * @param dropImages - Whether a dropped page also loses its decoded image (lazy mode).
   * @returns Pages unloaded that it believed resident.
   */
  function detachUnneeded(needed: readonly number[], dropImages: boolean): number {
    let unloaded = 0;
    for (let p = 0; p < pages.length; p++) {
      const need = needed.indexOf(p) >= 0;
      if (!need) {
        // Resident or not: a page drawn behind the residency's back (the weapon select's
        // preview) has a GPU copy it does not know of. Without one, `unload` frees nothing.
        if (dropImages) lazy?.atlas.unloadPage(p);
        pages[p].unload();
        onGpu[p] = false;
        if (resident[p]) unloaded++;
      }
      resident[p] = need;
    }
    return unloaded;
  }

  /**
   * The upload pass both modes share: put every needed page with no known GPU copy on the GPU.
   *
   * @param needed - The stage's page indices, ascending.
   * @returns Pages uploaded.
   */
  function uploadNeeded(needed: readonly number[]): number {
    if (upload === undefined) return 0;
    let uploaded = 0;
    for (const p of needed) {
      if (onGpu[p]) continue;
      try {
        upload(p);
      } catch (_error) {
        // Pixi uploads the page on its first draw instead; the next prepare tries again.
        continue;
      }
      onGpu[p] = true;
      uploaded++;
    }
    return uploaded;
  }

  /**
   * Reports a prepare that changed something (or the first one).
   *
   * @param needed - The stage's page indices, ascending.
   * @param unloaded - Pages this prepare detached that it believed resident.
   * @param uploaded - Pages this prepare uploaded.
   * @param startMs - The prepare's clock start.
   * @param changed - Whether anything moved beyond the counters (`prepared` alone reports once).
   */
  function reportPrepare(
    needed: readonly number[],
    unloaded: number,
    uploaded: number,
    startMs: number,
    changed: boolean,
  ): void {
    state.unloads += unloaded;
    state.uploads += uploaded;
    if (changed || unloaded > 0 || uploaded > 0 || !state.prepared) {
      state.prepared = true;
      state.lastPrepareMs = (now === undefined ? 0 : now()) - startMs;
      onChange?.(needed, state.unloads, state.lastPrepareMs);
    }
  }

  if (lazy !== undefined) {
    const { atlas, loadImage } = lazy;
    const prepareLazy = async (stageIndex: number): Promise<void> => {
      const startMs = now === undefined ? 0 : now();
      const gen = ++generation;
      state.pending++;
      try {
        const needed = stagePages(needs, stageIndex);
        const unloaded = detachUnneeded(needed, true);
        // Pages to fetch: needed and not attached. The loads run in parallel (`Promise.all`,
        // not `allSettled` — Chromium 68); a rejecting load settles the whole prepare.
        const missing: number[] = [];
        for (const p of needed) if (!atlas.isPageLoaded(p)) missing.push(p);
        const images = await Promise.all(missing.map((p) => loadImage(p)));
        let attached = 0;
        for (let i = 0; i < missing.length; i++) {
          const image = images[i];
          const page = missing[i];
          if (image === undefined || page === undefined) continue;
          atlas.loadPage(page, image);
          attached++;
        }
        // Superseded: the images are attached (they are decoded bytes worth keeping) but the
        // newer prepare owns the GPU pass and the report; a page its stage does not need leaves
        // the atlas at the next prepare.
        if (gen !== generation) return;
        const uploaded = uploadNeeded(needed);
        reportPrepare(needed, unloaded, uploaded, startMs, attached > 0);
      } finally {
        state.pending--;
      }
    };
    const residency: LazyAtlasResidency = {
      resident,
      imagePolicy: 'resident',
      get unloads() {
        return state.unloads;
      },
      get uploads() {
        return state.uploads;
      },
      get lastPrepareMs() {
        return state.lastPrepareMs;
      },
      get loading() {
        return state.pending > 0;
      },
      prepare(stageIndex) {
        return prepareLazy(stageIndex);
      },
    };
    return residency;
  }
  const residency: AtlasResidency = {
    resident,
    imagePolicy: 'all',
    get unloads() {
      return state.unloads;
    },
    get uploads() {
      return state.uploads;
    },
    get lastPrepareMs() {
      return state.lastPrepareMs;
    },
    prepare(stageIndex) {
      const startMs = now === undefined ? 0 : now();
      const needed = stagePages(needs, stageIndex);
      const unloaded = detachUnneeded(needed, false);
      const uploaded = uploadNeeded(needed);
      reportPrepare(needed, unloaded, uploaded, startMs, false);
      return unloaded;
    },
  };
  return residency;
}

/**
 * Creates the residency over the renderer's atlas pages (the R1-05 eager shape): every page
 * starts resident and none is known to be on the GPU, so the first prepare with `upload` uploads
 * — or, for a page Pixi already uploaded, just binds — every needed page; every page keeps its
 * decoded image ({@link ImagePolicy} `all`). The lazy residency over an atlas whose pages start
 * unloaded is {@link createLazyAtlasResidency} (plan R3-04, decision W5-15).
 *
 * @param pages - The atlas's texture sources (`Atlas.pages`).
 * @param needs - {@link atlasPageNeeds} of the same atlas.
 * @param options - Eager upload, change callback and clock (R1-05; all optional).
 * @returns The residency.
 * @throws {RangeError} When the page counts differ.
 *
 * @example
 * ```ts
 * const residency = createAtlasResidency(atlas.pages, atlasPageNeeds(manifest, names, sets), {
 *   upload: (p) => renderer.uploadTextureSource(atlas.pages[p]),
 * });
 * residency.prepare(content.stageIndex.get('zone-b') ?? -1);
 * ```
 */
export function createAtlasResidency(
  pages: readonly AtlasPageLike[],
  needs: AtlasPageNeeds,
  options: AtlasResidencyOptions = {},
): AtlasResidency {
  return residencyCore(pages, needs, options, undefined) as AtlasResidency;
}

/**
 * Creates the **lazy** residency over an atlas whose pages start unloaded (plan R3-04.M3b,
 * decision W5-15): {@link LazyAtlasResidency.prepare} fetches and decodes the images of the pages
 * the stage needs, attaches and uploads them, and detaches the pages it does not need with their
 * decoded images — the runtime {@link ImagePolicy} `resident`. The page bookkeeping
 * (`resident`, `unloads`, `uploads`, `lastPrepareMs`, the `onChange` contract and the self-healing
 * unload rule) is the eager residency's; the mode is selected by this factory, not by the
 * options. (A sibling factory rather than an overload of {@link createAtlasResidency}: with
 * overloads, the lint's export analysis flags every statement of the implementation — the two
 * single-signature exports keep the rule honest.)
 *
 * @param pages - The atlas's texture sources (`Atlas.pages`).
 * @param needs - {@link atlasPageNeeds} of the same atlas.
 * @param options - The eager options plus {@link AtlasResidencyLazyOptions.lazy}.
 * @returns The lazy residency.
 * @throws {RangeError} When the page counts differ.
 *
 * @example
 * ```ts
 * // The atlas was built with `null` images (R3-04.M3a); the residency loads what it needs.
 * const residency = createLazyAtlasResidency(atlas.pages, needs, {
 *   upload: (p) => renderer.uploadTextureSource(atlas.pages[p]),
 *   lazy: { atlas, loadImage: (p) => createPageImage(urls[p]).then((r) => r.image) },
 * });
 * await residency.prepare(content.stageIndex.get('zone-b') ?? -1);
 * ```
 */
export function createLazyAtlasResidency(
  pages: readonly AtlasPageLike[],
  needs: AtlasPageNeeds,
  options: AtlasResidencyLazyOptions,
): LazyAtlasResidency {
  return residencyCore(pages, needs, options, options.lazy) as LazyAtlasResidency;
}

/**
 * A World as the shell's residency trigger reads it: its view (to find it behind a frame) and its
 * stage's id (`World` satisfies it).
 */
export interface ResidencyWorldLike {
  /** The World's view (`World.view`). */
  readonly view: unknown;
  /** Its stage runner, `null` in open space. */
  readonly stage: {
    /** The stage spec. */
    readonly stage: {
      /** The stage id. */
      readonly id: string;
    };
  } | null;
}

/**
 * What the residency trigger reads of the game (`Game` satisfies it): its World and, in the scene
 * flow, the scene stack.
 */
export interface ResidencyGameLike {
  /** The game scene's World (`Game.world`). */
  readonly world: ResidencyWorldLike;
  /** The scene flow, `null` for bare gameplay. */
  readonly scenes: {
    /** The scene stack. */
    readonly stack: {
      /** Scenes on the stack. */
      readonly depth: number;
      /**
       * The scene at a depth.
       *
       * @param index - 0 = the bottom.
       * @returns The scene, or `null`.
       */
      sceneAt(index: number): unknown;
    };
  } | null;
}

/**
 * The World a frame shows when it plays a stage (plan R1-05, W3-9): the game's own, or one a scene
 * of the flow plays itself under its `world` field — the attract demo's, a replay's — found on the
 * scene stack by its view.
 *
 * @remarks
 * Cold: the shell calls it when the shown World changes, never per frame. Scenes are read by that
 * field name (duck typing — no core change, W3-9). Anything else is `null` — notably the weapon
 * select's live preview (its `preview` World flies the dev `weapon-range`, a stage outside the
 * campaign: placing it would put every page on the GPU for a menu). The preview does draw a page
 * outside `common` — zone A's, which holds the range's `terrain-a` tiles —, and Pixi uploads it on
 * the preview's first draw when it is off the GPU; the next prepare unloads it again
 * ({@link AtlasResidency.prepare} unloads every page the stage does not need, resident or not).
 *
 * @param game - The game.
 * @param view - The frame's World view (`RenderFrame.world`).
 * @returns The World, or `null`.
 *
 * @example
 * ```ts
 * const world = worldOfView(game, game.renderFrame().world); // → the demo's World during the demo
 * ```
 */
export function worldOfView(game: ResidencyGameLike, view: unknown): ResidencyWorldLike | null {
  if (view === null || view === undefined) return null;
  if (game.world.view === view) return game.world;
  const stack = game.scenes?.stack;
  if (stack === undefined) return null;
  for (let i = stack.depth - 1; i >= 0; i--) {
    const scene = stack.sceneAt(i);
    if (scene === null || typeof scene !== 'object') continue;
    const candidate = (scene as { readonly world?: unknown }).world;
    if (
      candidate !== null &&
      typeof candidate === 'object' &&
      (candidate as Partial<ResidencyWorldLike>).view === view
    ) {
      return candidate as ResidencyWorldLike;
    }
  }
  return null;
}

/**
 * The `content.stages` index of a World's stage.
 *
 * @param content - The content.
 * @param world - The World, or `null`.
 * @returns The index, or -1 (no World, open space or a stage the content lacks — every page).
 *
 * @example
 * ```ts
 * residency.prepare(stageIndexOfWorld(content, game.world));
 * ```
 */
export function stageIndexOfWorld(content: ContentDb, world: ResidencyWorldLike | null): number {
  if (world === null || world.stage === null) return -1;
  return content.stageIndex.get(world.stage.stage.id) ?? -1;
}

/**
 * Prepares the residency for the World a frame shows (plan R1-05, W3-9): the shell's trigger for a
 * **new World** — the attract demo (which never emits `PrepareStage`), a replay, a game start the
 * flow did not announce. A World {@link worldOfView} cannot place (the weapon select's preview)
 * leaves the residency as it is: a page it draws that is off the GPU — zone A's, for the range's
 * `terrain-a` tiles — uploads on its first draw (in a menu, as before R1-05), and the next prepare
 * (the game start's) unloads it again unless that stage needs it.
 *
 * @remarks
 * Cold: once per World change (`SceneView.worldChanges`), never per frame. Preparing the stage a
 * `PrepareStage` event already prepared is a no-op.
 *
 * @param residency - The residency.
 * @param content - The content.
 * @param game - The game.
 * @param view - The frame's World view.
 * @returns Pages unloaded.
 *
 * @example
 * ```ts
 * if (flowView.worldChanges !== shown) prepareShownWorld(residency, content.db, game, frame.world);
 * ```
 */
export function prepareShownWorld(
  residency: AtlasResidency,
  content: ContentDb,
  game: ResidencyGameLike,
  view: unknown,
): number {
  const world = worldOfView(game, view);
  return world === null ? 0 : residency.prepare(stageIndexOfWorld(content, world));
}

/**
 * Registers the residency on the scene flow's `PrepareStage` events (the zone map's launch, a run
 * or practice start, the title's return): the next stage's pages stay, the others are unloaded.
 *
 * @remarks
 * `PrepareStage` comes once per stage change (never per frame), so `prepare` — which builds the
 * stage's page list — may allocate. `bootShell` registers it in the scene flow only (the dev
 * scenes never emit the event).
 *
 * @param dispatcher - The shell's event dispatcher.
 * @param residency - The residency.
 * @returns A function that unregisters the handler.
 *
 * @example
 * ```ts
 * const off = connectAtlasResidency(events, createAtlasResidency(atlas.pages, needs));
 * // … later, when the shell stops:
 * off();
 * ```
 */
export function connectAtlasResidency(
  dispatcher: EventDispatcher,
  residency: AtlasResidency,
): () => void {
  return dispatcher.on(SimEventKind.PrepareStage, (event) => {
    residency.prepare(event.id);
  });
}

/**
 * Which decoded page images an estimate charges (plan R1-05, used at runtime since R3-04.M3b —
 * {@link AtlasResidency.imagePolicy} reports what the residency actually keeps): `all` — every
 * page's (the eager residency, what the runtime did until R3-04: all pages load at boot and Pixi
 * keeps each image); `resident` — only the stage's own pages' (the lazy residency of plan R3-04,
 * W5-15: a detached page holds nothing, its image is dropped with it); `none` — no image at all
 * (`keepPageImages: false`).
 */
export type ImagePolicy = 'all' | 'resident' | 'none';

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
  /** Display size (default {@link DEFAULT_DISPLAY}). */
  readonly display?: MemoryInputs['display'];
  /**
   * Which decoded page images are charged (default `resident` — the policy the shipped lazy
   * residency reports, R3-04.M3e / decision W5-15; `all` — every page's, W3-2 — is the
   * `atlasPages: 'eager'` option's charge, and the boot passes the residency's own
   * {@link AtlasResidency.imagePolicy}).
   */
  readonly imagePolicy?: ImagePolicy;
  /** The internal frame size (default core's `FRAME_W` × `FRAME_H`). */
  readonly frame?: MemoryInputs['frame'];
  /** The CRT setting (default `off`). */
  readonly crtFilter?: CrtFilter;
  /** Whether the CRT runs as a Pixi filter (default `false` — see {@link MemoryInputs}). */
  readonly crtAsFilter?: boolean;
  /** The synth rate (default `SYNTH_SAMPLE_RATE`). */
  readonly sampleRate?: number;
}

/**
 * Estimates what playing one stage keeps resident: its atlas pages on the GPU
 * ({@link stagePages}), the decoded images of exactly those pages (policy `resident` — what the
 * shipped lazy residency holds; see {@link ImagePolicy}), the SFX bank and its music set
 * ({@link stageMusicTracks}), the render targets and the heap baseline.
 *
 * @remarks
 * The default is the residency's own report, not a theory: the shipped boot runs the lazy
 * residency (`atlasPages` defaults to `lazy` since R3-04.M3e, decision W5-15), whose
 * {@link AtlasResidency.imagePolicy} is `resident` (pinned by
 * `packages/shell/test/boot/boot-residency.test.ts` against a real boot) — `prepare` detaches
 * every page the stage does not need and drops its decoded image with it
 * (`Atlas.unloadPage` → `TextureSource.resource = null`), a context restore re-fetches the
 * resident pages from their URLs (plan R3-04.M3d), and only the attached pages keep their images
 * to re-upload from. The old `all` default charged the whole atlas's decoded set (13.25 MiB at
 * the scale-1 manifest) as a constant to every zone — the pre-R3-04 eager runtime. Measured at
 * wave 11's zone LANDs with the re-derived atlas groups: zone E's own page grows to 1024×512, so
 * its row sits at 10,485,760 B of textures + 13,893,632 B of `all` images = 24,379,392 B,
 * **262,144 B over** the 24,117,248 B (23 MiB) share at 640×360, while the held set is 20,971,520
 * B — 3 MiB inside it; zone B's LAND (its own page 1024×512 too, `bg/brine-deep-v2` forcing the
 * 512-tall rung) measures the same shape. Under the fossil charge every zone's own page was
 * capped at ~1.5 MiB — a ceiling of the pre-R3-04 runtime, not of the TV.
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
  // The shipped residency is the lazy one (boot's `atlasPages` default since R3-04.M3e, decision
  // W5-15), and it reports `imagePolicy: 'resident'` — only the pages attached now hold their
  // decoded images, the rest were dropped with them. The estimate follows the residency's own
  // report (see {@link AtlasResidency.imagePolicy}); `all` (every page's image) is the `eager`
  // option's charge, and `none` the stand-in gate's.
  const policy = inputs.imagePolicy ?? 'resident';
  const stage = content.stages[stageIndex];
  let musicBytes = 0;
  if (stage !== undefined) {
    for (const track of stageMusicTracks(inputs.music, stage)) {
      musicBytes += trackBytes(inputs.music.tracks[track], rate);
    }
  }
  return estimateMemory({
    atlasPages: pages,
    keepPageImages: policy !== 'none',
    imagePages: policy === 'all' ? manifest.pages : pages,
    sfxBytes: sfxBankBytes(inputs.sfx, rate),
    musicBytes,
    display: inputs.display,
    frame: inputs.frame,
    crtFilter: inputs.crtFilter,
    crtAsFilter: inputs.crtAsFilter,
  });
}

/**
 * # effects — screen effects and score popups
 *
 * **Responsibility.** The presentation side of the sim's game-feel requests (plan M1-14):
 *
 * - {@link createScreenEffects} — pure state (no Pixi) fed by the `Shake`, `Flash` and `Dim`
 *   events and advanced by simulated ticks: an **integer screen shake** of three magnitudes that
 *   decays exactly like the sim's `shakeAmount` (`ceil(magnitude · ticksLeft / duration)`) along
 *   a fixed jitter pattern, with a global off switch ({@link EffectSettings.screenShake}); a
 *   **full-screen flash** per `FlashKind` ({@link FLASH_LOOKS}: colour and peak opacity, fading
 *   linearly over the event's duration) behind a **photosensitivity limiter** — at most
 *   {@link FLASH_LIMIT} flashes start in any {@link FLASH_WINDOW_TICKS}-tick window (1 with
 *   {@link EffectSettings.reduceFlashing}, which also caps the opacity), extra flashes are
 *   dropped and counted; and a **playfield dim** that fades in, holds for the event's duration
 *   and fades back. The renderer adds the shake to the world group's offset and draws the flash
 *   and the dim as overlays over the world layers (under the HUD).
 * - {@link createScorePopups} — {@link SCORE_POPUP_SLOTS} (16) bitmap-font numbers that rise from
 *   where points were scored and vanish after {@link SCORE_POPUP_TICKS} (40) ticks, blinking at
 *   the end; the oldest is replaced when all are in use. Drawn into an ordered quad pool on the
 *   `FX` layer (below the enemy bullets), camera-converted like the particles.
 *
 * The sim-side hit flash (`<sprite>@flash` frames while `flashTicks > 0`, decision D30) and the
 * invulnerability blink (`SpriteFlag.Hidden` every other 4 ticks) are already in the sprite
 * batches the sim fills; `sprites` draws them.
 *
 * **Timing.** Like the sim, a shake or flash does not count down on the tick of its request: the
 * first `step` after a request only clears its "fresh" mark, so at one tick per frame the drawn
 * amplitude equals `shakeAmount(world.fx)` on every frame.
 *
 * **Allocation.** Requests, `step` and `sync` only write numbers (the popups' quad pool and text
 * layout are preallocated).
 *
 * **Implements.**
 * - shmup_feat.md §18 — screen shake (integer, decaying, 3 magnitudes, off switch), flash on Mega
 *   Crash, explosions and hit flash drawn over the world
 * - shmup_feat.md §20 — juice: score popups, screen shake used sparingly
 * - shmup_feat.md §21 — accessibility: reduced flashing (≤ 3 flashes a second always)
 * - shmup_feat.md §22 — no per-frame allocation
 *
 * **Public API.** {@link EffectSettings}, {@link DEFAULT_EFFECT_SETTINGS},
 * {@link ScreenEffects}, {@link createScreenEffects}, {@link FlashLook}, {@link FLASH_LOOKS},
 * {@link DEFAULT_FLASH_LOOK}, {@link FLASH_LIMIT}, {@link FLASH_WINDOW_TICKS},
 * {@link REDUCED_FLASH_ALPHA}, {@link SHAKE_PATTERN_X}, {@link SHAKE_PATTERN_Y},
 * {@link DIM_FADE_IN_TICKS}, {@link DIM_FADE_OUT_TICKS}, {@link ScorePopups},
 * {@link ScorePopupsOptions}, {@link createScorePopups}, {@link SCORE_POPUP_SLOTS},
 * {@link SCORE_POPUP_TICKS}, {@link SCORE_POPUP_COLOR}, {@link BONUS_POPUP_COLOR}.
 *
 * **Planned.** Raster/HDMA-style scanline offsets, palette swap and cycling (M2-08), CRT filter
 * (M3-02).
 *
 * @module
 */
import {
  PLAYFIELD_H,
  PLAYFIELD_W,
  PLAYFIELD_Y,
  TextAlign,
  defineModule,
  type CameraView,
} from '@shmup/core';
import type { Container } from 'pixi.js';
import type { Atlas } from '../atlas/index.js';
import { createQuadPool, type QuadPool } from '../sprites/index.js';
import { drawNumber, type BitmapFont } from '../text/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'effects',
  status: 'partial',
  specRefs: ['shmup_feat.md §18', 'shmup_feat.md §20', 'shmup_feat.md §21', 'shmup_feat.md §22'],
});

/** Presentation options for effects (Display settings; `UserOptions` in M1-17 / M2-16). */
export interface EffectSettings {
  /** Apply sim-requested screen shake to the world layers (the global off switch). */
  screenShake: boolean;
  /**
   * Reduced flashing (accessibility): at most one flash a second and a capped opacity
   * ({@link REDUCED_FLASH_ALPHA}). The ≤ 3 flashes a second limit applies either way.
   */
  reduceFlashing: boolean;
  /** CRT post-filter strength (scanlines / mask); `'off'` on weak TV GPUs by default (M3-02). */
  crt: 'off' | 'light' | 'full';
}

/** The default settings: shake on, normal flashing, no CRT. */
export const DEFAULT_EFFECT_SETTINGS: Readonly<EffectSettings> = Object.freeze({
  screenShake: true,
  reduceFlashing: false,
  crt: 'off',
});

/** Most flashes that may start in one {@link FLASH_WINDOW_TICKS} window (photosensitivity). */
export const FLASH_LIMIT = 3;

/** The limiter's window: one second of ticks. */
export const FLASH_WINDOW_TICKS = 60;

/** Peak opacity of any flash with {@link EffectSettings.reduceFlashing}. */
export const REDUCED_FLASH_ALPHA = 0.25;

/**
 * Horizontal direction of the shake offset per tick of the shake (× the current amplitude): a
 * fixed 8-tick jitter, so the same shake always looks the same.
 */
export const SHAKE_PATTERN_X: readonly number[] = Object.freeze([1, -1, 1, 0, -1, 1, -1, 0]);

/** Vertical direction of the shake offset per tick of the shake (see {@link SHAKE_PATTERN_X}). */
export const SHAKE_PATTERN_Y: readonly number[] = Object.freeze([0, 1, -1, 1, 0, -1, 1, -1]);

/** Ticks the playfield dim takes to reach its level. */
export const DIM_FADE_IN_TICKS = 8;

/** Ticks the playfield dim takes to fade back after its duration. */
export const DIM_FADE_OUT_TICKS = 16;

/** How one `FlashKind` looks. */
export interface FlashLook {
  /** Overlay colour 0xRRGGBB. */
  readonly color: number;
  /** Opacity at the flash's start (fades linearly to 0 over its duration). */
  readonly alpha: number;
}

/**
 * Looks by core `FlashKind` code: Mega Crash (white, 0.85), a WARNING pulse (red, 0.35), a
 * boss's final blast (white, 1.0). Unknown kinds use {@link DEFAULT_FLASH_LOOK}.
 */
export const FLASH_LOOKS: readonly FlashLook[] = Object.freeze([
  Object.freeze({ color: 0xffffff, alpha: 0.85 }),
  Object.freeze({ color: 0xf85858, alpha: 0.35 }),
  Object.freeze({ color: 0xffffff, alpha: 1 }),
]);

/** Look of a flash kind that {@link FLASH_LOOKS} does not list. */
export const DEFAULT_FLASH_LOOK: FlashLook = Object.freeze({ color: 0xffffff, alpha: 0.6 });

/** The screen-effect state of one renderer. */
export interface ScreenEffects {
  /** The settings (mutable: flip `screenShake` to turn shaking off at once). */
  readonly settings: EffectSettings;
  /** Horizontal offset of the world layers this frame, whole pixels (0 with shake off). */
  readonly shakeX: number;
  /** Vertical offset of the world layers this frame, whole pixels (0 with shake off). */
  readonly shakeY: number;
  /** Current shake amplitude in whole pixels (tracked even with shake off). */
  readonly shakeAmount: number;
  /** Flash overlay opacity 0…1. */
  readonly flashAlpha: number;
  /** Flash overlay colour 0xRRGGBB. */
  readonly flashColor: number;
  /** Playfield dim opacity 0…1. */
  readonly dimAlpha: number;
  /** Flashes dropped by the limiter since creation or the last {@link ScreenEffects.clear}. */
  readonly flashesSuppressed: number;
  /**
   * Starts a decaying shake (a `SimEventKind.Shake` event: `param` = magnitude, `id` = ticks).
   *
   * @remarks
   * Mirrors the sim's `requestShake`: ignored when the magnitude is not positive, the duration
   * rounds to 0 or the running shake is at least as strong right now; magnitudes are floored and
   * capped at 64 px, durations at 600 ticks.
   *
   * @param magnitude - Amplitude in pixels at the start.
   * @param ticks - Duration in ticks.
   * @returns Whether the shake started.
   */
  shake(magnitude: number, ticks: number): boolean;
  /**
   * Starts a full-screen flash (a `SimEventKind.Flash` event: `id` = kind, `param` = ticks),
   * unless the limiter refuses it.
   *
   * @param kind - Core `FlashKind` code (picks the {@link FlashLook}).
   * @param ticks - Duration in ticks (≤ 0 does nothing; capped at 600).
   * @returns Whether the flash started (`false` when the limiter dropped it).
   */
  flash(kind: number, ticks: number): boolean;
  /**
   * Dims the playfield (a `SimEventKind.Dim` event: level = `id / 100`, `param` = ticks): the
   * dim fades in over {@link DIM_FADE_IN_TICKS}, holds for `ticks` and fades out over
   * {@link DIM_FADE_OUT_TICKS}. A new request replaces the running one.
   *
   * @param level - Opacity 0…1 (clamped).
   * @param ticks - Hold duration in ticks (capped at 600).
   */
  dim(level: number, ticks: number): void;
  /**
   * Advances every effect by simulated ticks. Never allocates.
   *
   * @param ticks - Ticks elapsed (floored; ≤ 0 does nothing).
   */
  step(ticks: number): void;
  /** Stops every effect and resets the limiter and `flashesSuppressed`. */
  clear(): void;
}

/** The effect state (a class: its fields stay unboxed numbers). */
class ScreenEffectsImpl implements ScreenEffects {
  /** See {@link ScreenEffects.settings}. */
  readonly settings: EffectSettings;
  /** Magnitude of the running shake. */
  private shakeMagnitude = 0;
  /** Shake ticks left. */
  private shakeLeft = 0;
  /** Shake length. */
  private shakeDuration = 0;
  /** Ticks the running shake has been stepped (its pattern position). */
  private shakePhase = 0;
  /** A shake requested since the last step (not counted down on its own tick). */
  private shakeFresh = false;
  /** Flash ticks left. */
  private flashLeft = 0;
  /** Flash length. */
  private flashDuration = 0;
  /** Peak opacity of the running flash. */
  private flashPeak = 0;
  /** A flash requested since the last step. */
  private flashFresh = false;
  /** See {@link ScreenEffects.flashColor}. */
  flashColor = 0xffffff;
  /** See {@link ScreenEffects.flashAlpha}. */
  flashAlpha = 0;
  /** Start clocks of the last {@link FLASH_LIMIT} accepted flashes (ring). */
  private readonly flashStarts = new Float64Array(FLASH_LIMIT).fill(Number.NEGATIVE_INFINITY);
  /** Next slot of `flashStarts`. */
  private flashCursor = 0;
  /** See {@link ScreenEffects.flashesSuppressed}. */
  flashesSuppressed = 0;
  /** Ticks stepped since creation (the limiter's clock). */
  private clock = 0;
  /** Target dim opacity. */
  private dimLevel = 0;
  /** Dim hold ticks left. */
  private dimLeft = 0;
  /** See {@link ScreenEffects.dimAlpha}. */
  dimAlpha = 0;

  /**
   * @param settings - Initial settings (copied).
   */
  constructor(settings: Partial<EffectSettings>) {
    this.settings = {
      screenShake: settings.screenShake ?? DEFAULT_EFFECT_SETTINGS.screenShake,
      reduceFlashing: settings.reduceFlashing ?? DEFAULT_EFFECT_SETTINGS.reduceFlashing,
      crt: settings.crt ?? DEFAULT_EFFECT_SETTINGS.crt,
    };
  }

  /** See {@link ScreenEffects.shakeAmount}. */
  get shakeAmount(): number {
    if (this.shakeLeft <= 0 || this.shakeDuration <= 0) return 0;
    return Math.ceil((this.shakeMagnitude * this.shakeLeft) / this.shakeDuration) | 0;
  }

  /** See {@link ScreenEffects.shakeX}. */
  get shakeX(): number {
    if (!this.settings.screenShake) return 0;
    return (this.shakeAmount * SHAKE_PATTERN_X[this.shakePhase & 7]) | 0;
  }

  /** See {@link ScreenEffects.shakeY}. */
  get shakeY(): number {
    if (!this.settings.screenShake) return 0;
    return (this.shakeAmount * SHAKE_PATTERN_Y[this.shakePhase & 7]) | 0;
  }

  /**
   * Recomputes {@link ScreenEffectsImpl.flashAlpha} from the flash timer (a field, not a getter:
   * a fractional result returned from a call V8 does not inline is boxed — an allocation per
   * frame).
   */
  private updateFlashAlpha(): void {
    this.flashAlpha =
      this.flashLeft > 0 && this.flashDuration > 0
        ? (this.flashPeak * this.flashLeft) / this.flashDuration
        : 0;
  }

  /**
   * See {@link ScreenEffects.shake}.
   *
   * @param magnitude - Pixels.
   * @param ticks - Duration.
   * @returns Whether it started.
   */
  shake(magnitude: number, ticks: number): boolean {
    const m = magnitude > 0 ? (magnitude > 64 ? 64 : Math.floor(magnitude)) : 0;
    const n = ticks > 0 ? (ticks > 600 ? 600 : Math.floor(ticks)) : 0;
    if (m === 0 || n === 0 || m <= this.shakeAmount) return false;
    this.shakeMagnitude = m;
    this.shakeLeft = n;
    this.shakeDuration = n;
    this.shakePhase = 0;
    this.shakeFresh = true;
    return true;
  }

  /**
   * See {@link ScreenEffects.flash}.
   *
   * @param kind - Flash kind.
   * @param ticks - Duration.
   * @returns Whether it started.
   */
  flash(kind: number, ticks: number): boolean {
    const n = ticks > 0 ? (ticks > 600 ? 600 : Math.floor(ticks)) : 0;
    if (n === 0) return false;
    const reduced = this.settings.reduceFlashing;
    const limit = reduced ? 1 : FLASH_LIMIT;
    // The oldest of the last `limit` starts must be a full window old.
    const oldest = this.flashStarts[(this.flashCursor + FLASH_LIMIT - limit) % FLASH_LIMIT];
    if (this.clock - oldest < FLASH_WINDOW_TICKS) {
      this.flashesSuppressed++;
      return false;
    }
    this.flashStarts[this.flashCursor] = this.clock;
    this.flashCursor = (this.flashCursor + 1) % FLASH_LIMIT;
    const look =
      kind >= 0 && kind < FLASH_LOOKS.length && kind % 1 === 0
        ? FLASH_LOOKS[kind]
        : DEFAULT_FLASH_LOOK;
    this.flashColor = look.color;
    this.flashPeak = reduced && look.alpha > REDUCED_FLASH_ALPHA ? REDUCED_FLASH_ALPHA : look.alpha;
    this.flashLeft = n;
    this.flashDuration = n;
    this.flashFresh = true;
    this.updateFlashAlpha();
    return true;
  }

  /**
   * See {@link ScreenEffects.dim}.
   *
   * @param level - Opacity.
   * @param ticks - Hold ticks.
   */
  dim(level: number, ticks: number): void {
    this.dimLevel = level > 0 ? (level < 1 ? level : 1) : 0;
    this.dimLeft = ticks > 0 ? (ticks > 600 ? 600 : Math.floor(ticks)) : 0;
  }

  /**
   * See {@link ScreenEffects.step}.
   *
   * @param ticks - Ticks elapsed.
   */
  step(ticks: number): void {
    let n = ticks > 0 ? Math.floor(ticks) : 0;
    if (n > 600) n = 600;
    for (; n > 0; n--) {
      this.clock++;
      if (this.shakeFresh) this.shakeFresh = false;
      else if (this.shakeLeft > 0) {
        this.shakeLeft--;
        this.shakePhase++;
      }
      if (this.flashFresh) this.flashFresh = false;
      else if (this.flashLeft > 0) this.flashLeft--;
      if (this.dimLeft > 0) {
        this.dimLeft--;
        const up = this.dimAlpha + this.dimLevel / DIM_FADE_IN_TICKS;
        this.dimAlpha = up < this.dimLevel ? up : this.dimLevel;
      } else if (this.dimAlpha > 0) {
        const down = this.dimAlpha - this.dimLevel / DIM_FADE_OUT_TICKS;
        this.dimAlpha = down > 0 && this.dimLevel > 0 ? down : 0;
      }
    }
    this.updateFlashAlpha();
  }

  /** See {@link ScreenEffects.clear}. */
  clear(): void {
    this.shakeMagnitude = 0;
    this.shakeLeft = 0;
    this.shakeDuration = 0;
    this.shakePhase = 0;
    this.shakeFresh = false;
    this.flashLeft = 0;
    this.flashDuration = 0;
    this.flashFresh = false;
    this.flashAlpha = 0;
    this.flashStarts.fill(Number.NEGATIVE_INFINITY);
    this.flashCursor = 0;
    this.flashesSuppressed = 0;
    this.dimLevel = 0;
    this.dimLeft = 0;
    this.dimAlpha = 0;
  }
}

/**
 * Creates the screen-effect state.
 *
 * @param settings - Settings to change from {@link DEFAULT_EFFECT_SETTINGS}.
 * @returns Idle effects (no shake, flash or dim).
 *
 * @example
 * ```ts
 * const effects = createScreenEffects({ screenShake: true });
 * effects.shake(2, 20); // from a Shake event (param 2, id 20)
 * effects.step(1); // once per simulated tick
 * world.position.set(effects.shakeX, effects.shakeY);
 * ```
 */
export function createScreenEffects(settings: Partial<EffectSettings> = {}): ScreenEffects {
  return new ScreenEffectsImpl(settings);
}

/** Score popups shown at once (the oldest is replaced beyond this). */
export const SCORE_POPUP_SLOTS = 16;

/** Ticks a score popup stays up. */
export const SCORE_POPUP_TICKS = 40;

/** Colour of an ordinary score popup (a kill, a capsule, a boss part). */
export const SCORE_POPUP_COLOR = 0xf8f8f8;

/** Colour of a bonus popup (a completed formation, a boss's tally). */
export const BONUS_POPUP_COLOR = 0xf8d030;

/** Glyph quads per popup (7 digits and a spare). */
const GLYPHS_PER_POPUP = 8;

/** Ticks at the end of a popup's life during which it blinks. */
const POPUP_BLINK_TICKS = 10;

/** Options of {@link createScorePopups}. */
export interface ScorePopupsOptions {
  /** The atlas (glyph frames). */
  readonly atlas: Atlas;
  /** The bitmap font the numbers are drawn in. */
  readonly font: BitmapFont;
  /** Popup slots (default {@link SCORE_POPUP_SLOTS}). */
  readonly capacity?: number;
  /** Ticks a popup lives (default {@link SCORE_POPUP_TICKS}). */
  readonly ticks?: number;
  /** Screen row of world row 0 at camera y 0 (default `PLAYFIELD_Y`). */
  readonly offsetY?: number;
}

/** Rising score numbers. */
export interface ScorePopups {
  /** Holds the glyph quads (add it to the `FX` layer, above the particles). */
  readonly container: Container;
  /** Popup slots. */
  readonly capacity: number;
  /** Ticks a popup lives. */
  readonly ticks: number;
  /** Popups alive. */
  readonly liveCount: number;
  /**
   * Shows a number rising from a point. Never allocates.
   *
   * @remarks
   * Points below 1 (or NaN) show nothing. When every slot is in use the oldest popup is
   * replaced.
   *
   * @param points - The number (floored).
   * @param x - World x of the number's centre.
   * @param y - World y of the number's centre.
   * @param color - Tint 0xRRGGBB ({@link SCORE_POPUP_COLOR} / {@link BONUS_POPUP_COLOR}).
   * @returns Whether a popup was shown.
   */
  show(points: number, x: number, y: number, color: number): boolean;
  /**
   * Ages the popups by simulated ticks; expired ones disappear. Never allocates.
   *
   * @param ticks - Ticks elapsed (floored; ≤ 0 does nothing).
   */
  step(ticks: number): void;
  /**
   * Draws the live popups: centred on their x, risen one pixel every 4 ticks, kept inside the
   * playfield, blinking in their last 10 ticks. Never allocates.
   *
   * @param camera - The world camera.
   */
  sync(camera: CameraView): void;
  /** Removes every popup. */
  clear(): void;
  /** Destroys the quads and the container. */
  destroy(): void;
}

/**
 * Creates the score popups (load time: the glyph quads are created here).
 *
 * @param options - Atlas, font, capacity, lifetime and y offset.
 * @returns The popups (none shown).
 * @throws {RangeError} When `capacity` or `ticks` is not a positive integer.
 *
 * @example
 * ```ts
 * const popups = createScorePopups({ atlas, font });
 * layers.layers[LayerId.Fx].addChild(popups.container);
 * popups.show(300, 210, 96, SCORE_POPUP_COLOR); // from a Score event
 * popups.step(1);
 * popups.sync(world.camera);
 * ```
 */
export function createScorePopups(options: ScorePopupsOptions): ScorePopups {
  const { atlas, font } = options;
  const capacity = options.capacity ?? SCORE_POPUP_SLOTS;
  const ticks = options.ticks ?? SCORE_POPUP_TICKS;
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError('score popup capacity must be a positive integer');
  }
  if (!Number.isInteger(ticks) || ticks <= 0) {
    throw new RangeError('score popup ticks must be a positive integer');
  }
  const offsetY = options.offsetY ?? PLAYFIELD_Y;
  const pool: QuadPool = createQuadPool({
    atlas,
    capacity: capacity * GLYPHS_PER_POPUP,
    label: 'score-popups',
  });
  const px = new Float64Array(capacity);
  const py = new Float64Array(capacity);
  const points = new Float64Array(capacity);
  const colors = new Int32Array(capacity);
  const ages = new Int32Array(capacity).fill(-1);
  const serial = new Float64Array(capacity);
  let shown = 0;
  let live = 0;
  const glyphHeight = font.cellHeight;
  const half = glyphHeight >> 1;
  const bottom = offsetY + PLAYFIELD_H - glyphHeight;

  return {
    container: pool.container,
    capacity,
    ticks,
    /** See {@link ScorePopups.liveCount}. */
    get liveCount(): number {
      return live;
    },
    show(value, x, y, color) {
      if (!(value >= 1)) return false;
      let slot = -1;
      for (let i = 0; i < capacity; i++) {
        if (ages[i] < 0) {
          slot = i;
          break;
        }
        if (slot < 0 || serial[i] < serial[slot]) slot = i;
      }
      if (ages[slot] < 0) live++;
      px[slot] = x;
      py[slot] = y;
      points[slot] = Math.floor(value);
      colors[slot] = color;
      ages[slot] = 0;
      serial[slot] = shown++;
      return true;
    },
    step(elapsed) {
      const n = elapsed > 0 ? Math.floor(elapsed) : 0;
      if (n === 0) return;
      for (let i = 0; i < capacity; i++) {
        const age = ages[i];
        if (age < 0) continue;
        if (age + n >= ticks) {
          ages[i] = -1;
          live--;
        } else {
          ages[i] = age + n;
        }
      }
    },
    sync(camera) {
      const camX = camera.x;
      const camY = camera.y;
      pool.begin();
      for (let i = 0; i < capacity; i++) {
        const age = ages[i];
        if (age < 0) continue;
        if (age >= ticks - POPUP_BLINK_TICKS && ((age >> 1) & 1) === 1) continue;
        let sx = Math.round(px[i] - camX) | 0;
        if (sx < 12) sx = 12;
        else if (sx > PLAYFIELD_W - 12) sx = PLAYFIELD_W - 12;
        let sy = (Math.round(py[i] - camY) + offsetY - half - (age >> 2)) | 0;
        if (sy < offsetY) sy = offsetY;
        else if (sy > bottom) sy = bottom;
        drawNumber(pool, font, points[i], sx, sy, 0, colors[i], TextAlign.Center, 255);
      }
      pool.end();
    },
    clear() {
      ages.fill(-1);
      live = 0;
    },
    destroy() {
      pool.destroy();
    },
  };
}

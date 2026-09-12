/**
 * # fx-gallery — the `?scene=fx-gallery` dev scene (plan M1-14)
 *
 * **Responsibility.** A presentation-only scene that shows every game-feel effect in turn, so the
 * particle presets of `content/fx/` can be judged (and tuned) without playing to the event that
 * spawns them: over a still starfield it cycles through **stations** of
 * {@link FX_GALLERY_STATION_TICKS} ticks each — every particle preset in content order (burst at
 * the playfield's centre three times per station), then the three shake magnitudes, the three
 * flash kinds (Mega Crash, a WARNING pulse, a boss's final blast), the playfield dim and a row of
 * score popups — and names the current station in the UI (`3/19  EXPLOSION.LARGE` with the
 * shipped content's 11 presets). It drives
 * the renderer's `particles`, `effects` and `popups` directly (not through sim events); the
 * game's World keeps running unseen behind it, but its events are not connected to the effects
 * in this scene.
 *
 * Station timing comes from the game's tick (it pauses with the game); a station starts when its
 * first tick is reached, so a frame that runs several ticks never skips a burst. The station
 * labels are built once at creation — changing station only swaps a draw-list string slot. No
 * allocation per frame.
 *
 * **Implements.**
 * - shmup_feat.md §24 — dev tooling: a gallery of the effects
 * - shmup_feat.md §18 — explosions, particles, shake, flash
 * - shmup_feat.md §20 — juice (score popups)
 *
 * **Public API.** {@link createFxGallery}, {@link FxGallery}, {@link FxGalleryOptions},
 * {@link FX_GALLERY_SPRITES}, {@link FX_GALLERY_STATION_TICKS}, {@link FX_GALLERY_EXTRAS}.
 *
 * @module
 */
import {
  FlashKind,
  FLASH_KIND_TICKS,
  LayerId,
  PLAYFIELD_H,
  PLAYFIELD_W,
  ShakeMagnitude,
  TextAlign,
  createDrawList,
  createSpriteBatch,
  defineModule,
  pushSprite,
  type DrawList,
  type RenderFrame,
  type ScreenView,
  type WorldView,
} from '@shmup/core';
import { BONUS_POPUP_COLOR, SCORE_POPUP_COLOR } from '@shmup/render-pixi';
import type { FxTargets } from '../dispatch/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'fx-gallery',
  status: 'implemented',
  specRefs: ['shmup_feat.md §24', 'shmup_feat.md §18', 'shmup_feat.md §20'],
});

/** The gallery's sprite name table (sprite id = index): its starfield. */
export const FX_GALLERY_SPRITES: readonly string[] = Object.freeze([
  'bg/stars-far',
  'bg/stars-mid',
]);

/** Ticks each station lasts. */
export const FX_GALLERY_STATION_TICKS = 60;

/** Ticks between two bursts of a preset station (three per station). */
const PULSE_TICKS = FX_GALLERY_STATION_TICKS / 3;

/** The stations after the presets, in order. */
export const FX_GALLERY_EXTRAS: readonly string[] = Object.freeze([
  'shake.small',
  'shake.medium',
  'shake.large',
  'flash.mega-crash',
  'flash.warning',
  'flash.boss-blast',
  'dim',
  'popups',
]);

/** Where the bursts go (world = playfield pixels: the gallery's camera stays at 0, 0). */
const CENTRE_X = PLAYFIELD_W / 2;

/** Vertical centre of the playfield. */
const CENTRE_Y = PLAYFIELD_H / 2;

/** String slot of the station label in the UI list. */
const STATION_SLOT = 0;

/** HUD bar fill (the flight scene's). */
const BAR_COLOR = 0x1d2a5c;

/** Options of {@link createFxGallery}. */
export interface FxGalleryOptions {
  /** Edge of the square starfield tiles in pixels (default 128, the pipeline's tile size). */
  readonly starTileSize?: number;
}

/** The fx-gallery scene. */
export interface FxGallery {
  /** Sprite names by sprite id — give them to the renderer. */
  readonly spriteNames: readonly string[];
  /** The scene's world view: a still starfield, camera at 0, 0 (bind it once at load). */
  readonly world: WorldView;
  /** The scene's render frame (reused). */
  readonly frame: RenderFrame;
  /** Station names: the preset ids in content order, then {@link FX_GALLERY_EXTRAS}. */
  readonly stations: readonly string[];
  /** Index of the station shown now (-1 before the first update). */
  readonly station: number;
  /**
   * Advances the gallery to the game's tick (starting stations and bursts that are due) and
   * returns the frame to render. Never allocates.
   *
   * @param source - The game's frame: its `tick`, `alpha` and `screen` are copied.
   * @returns {@link FxGallery.frame}, updated (reused — do not keep it).
   */
  update(source: RenderFrame): RenderFrame;
}

/**
 * Creates the gallery for a renderer's effects.
 *
 * @remarks
 * The preset stations are read from `fx.particles.content` **now**: give the renderer its
 * presets (`setFxContent`) before creating the gallery — `bootShell` does. Without particles
 * (`null`: no atlas) only the {@link FX_GALLERY_EXTRAS} stations exist; without popups the
 * `popups` station shows nothing.
 *
 * @param fx - The renderer's `particles`, `effects` and `popups` (a `PixiRenderer`).
 * @param options - Starfield tile size.
 * @returns The scene; views, draw lists and labels allocated now.
 *
 * @example
 * ```ts
 * const gallery = createFxGallery(renderer);
 * renderer.setSpriteNames(gallery.spriteNames);
 * renderer.bindWorld(gallery.world);
 * // every frame:
 * renderer.render(gallery.update(game.renderFrame()));
 * ```
 */
export function createFxGallery(fx: FxTargets, options: FxGalleryOptions = {}): FxGallery {
  const { particles, effects, popups } = fx;
  const presets = particles === null ? [] : particles.content.presets.map((preset) => preset.id);
  const stations = Object.freeze([...presets, ...FX_GALLERY_EXTRAS]);
  const labels = stations.map((name, i) => `${i + 1}/${stations.length}  ${name.toUpperCase()}`);
  /**
   * Station index of one of the {@link FX_GALLERY_EXTRAS} (they follow the presets).
   *
   * @param name - An entry of {@link FX_GALLERY_EXTRAS}.
   * @returns Its station index.
   */
  const extra = (name: string): number => presets.length + FX_GALLERY_EXTRAS.indexOf(name);
  /** Station indices of the extras, resolved once so `run` compares numbers only. */
  const station = {
    shakeSmall: extra('shake.small'),
    shakeMedium: extra('shake.medium'),
    shakeLarge: extra('shake.large'),
    flashMegaCrash: extra('flash.mega-crash'),
    flashWarning: extra('flash.warning'),
    flashBossBlast: extra('flash.boss-blast'),
    dim: extra('dim'),
    popups: extra('popups'),
  };

  // A still starfield (the camera never moves), filled once.
  const tile = options.starTileSize ?? 128;
  const columns = Math.ceil(PLAYFIELD_W / tile);
  const rows = Math.ceil(PLAYFIELD_H / tile);
  const far = createSpriteBatch(LayerId.BgFar, columns * rows);
  const mid = createSpriteBatch(LayerId.BgMid, columns * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      pushSprite(far, col * tile, row * tile, 0, 0, 0);
      pushSprite(mid, col * tile + tile / 2, row * tile, 1, 0, 0);
    }
  }
  const world: WorldView = {
    camera: { x: 0, y: 0 },
    parallax: null,
    terrain: null,
    batches: [far, mid],
  };

  const hud = createDrawList(8, 2);
  hud.setString(0, 'FX GALLERY');
  hud.setString(1, '?SCENE=FX-GALLERY');
  hud.rect(0, 0, PLAYFIELD_W, 8, BAR_COLOR);
  hud.rect(0, 208, PLAYFIELD_W, 8, BAR_COLOR);
  hud.text(0, PLAYFIELD_W / 2, 0, 0xf8d030, TextAlign.Center);
  hud.text(1, PLAYFIELD_W / 2, 208, 0x8890b0, TextAlign.Center);
  const ui = createDrawList(4, 1);

  const frame: {
    tick: number;
    alpha: number;
    readonly world: WorldView;
    readonly hud: DrawList;
    readonly ui: DrawList;
    screen: ScreenView;
  } = {
    tick: 0,
    alpha: 0,
    world,
    hud,
    ui,
    screen: { shakeX: 0, shakeY: 0, flash: 0, dim: 0 },
  };

  /**
   * Shows a station's label in the UI list.
   *
   * @param index - Station index.
   */
  const label = (index: number): void => {
    ui.clear();
    ui.setString(STATION_SLOT, labels[index]);
    ui.text(STATION_SLOT, PLAYFIELD_W / 2, 16, 0x38c8e8, TextAlign.Center);
  };

  /**
   * Runs one pulse of a station: bursts and popups on every pulse, the screen effects on the
   * first.
   *
   * @param index - Station index.
   * @param first - Whether the station starts with this pulse.
   * @param pulse - Pulse number inside the station (0, 1, 2).
   */
  const run = (index: number, first: boolean, pulse: number): void => {
    if (index < presets.length) {
      particles?.emit(index, CENTRE_X, CENTRE_Y, 1);
      return;
    }
    if (index === station.popups) {
      popups?.show(100 * (pulse + 1), CENTRE_X - 96 + 96 * pulse, CENTRE_Y, SCORE_POPUP_COLOR);
      popups?.show(
        1000 * (pulse + 1),
        CENTRE_X - 96 + 96 * pulse,
        CENTRE_Y + 32,
        BONUS_POPUP_COLOR,
      );
      return;
    }
    if (!first) return;
    if (index === station.shakeSmall) effects.shake(ShakeMagnitude.Small, 40);
    else if (index === station.shakeMedium) effects.shake(ShakeMagnitude.Medium, 40);
    else if (index === station.shakeLarge) effects.shake(ShakeMagnitude.Large, 40);
    else if (index === station.flashMegaCrash) {
      effects.flash(FlashKind.MegaCrash, FLASH_KIND_TICKS[FlashKind.MegaCrash]);
    } else if (index === station.flashWarning) {
      effects.flash(FlashKind.Warning, FLASH_KIND_TICKS[FlashKind.Warning]);
    } else if (index === station.flashBossBlast) {
      effects.flash(FlashKind.BossBlast, FLASH_KIND_TICKS[FlashKind.BossBlast]);
    } else if (index === station.dim) effects.dim(0.5, 30);
  };

  let current = -1;
  let lastPulse = -1;
  return {
    spriteNames: FX_GALLERY_SPRITES,
    world,
    frame,
    stations,
    /** See {@link FxGallery.station}. */
    get station(): number {
      return current;
    },
    update(source) {
      const tick = source.tick;
      frame.tick = tick;
      frame.alpha = source.alpha;
      frame.screen = source.screen;
      const pulse = Math.floor(tick / PULSE_TICKS);
      if (pulse !== lastPulse) {
        lastPulse = pulse;
        const index = Math.floor(pulse / 3) % stations.length;
        const first = index !== current;
        if (first) {
          current = index;
          label(index);
        }
        run(index, first, pulse % 3);
      }
      return frame;
    },
  };
}

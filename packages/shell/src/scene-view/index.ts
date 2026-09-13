/**
 * # scene-view — what the renderer draws for the scene flow (M1-16)
 *
 * **Responsibility.** Turns the core scene flow's render frame (`game.renderFrame()` of a game
 * created with `options.scenes`) into the frame the renderer gets, adding the presentation-only
 * backdrop the core does not know about:
 *
 * - **In a game in open space** (no stage — free flight) the drifting starfield of the `flight`
 *   scene is drawn under the World's batches; a stage brings its own parallax and terrain, so its
 *   World view is used as is. The wrapper view of a World is built **once per World** (a game start
 *   creates one — a scene transition, not a frame); the renderer binds it on its first frame. The
 *   World is whichever the frame shows: the game's, or the weapon select's live preview (M2-03).
 * - **Outside the game** (boot, title — the frame has no world) a starfield backdrop drifts behind
 *   the title and its menus (its own static camera).
 *
 * Its {@link SceneView.spriteNames} are the content's names followed by {@link SCENE_VIEW_SPRITES},
 * so the World's sprite ids, the core UI kit's ids (the HUD pieces and the logo, interned with the
 * content — `ENGINE_SPRITES`) and the starfield's index one table. {@link SceneView.camera} follows
 * the World on screen (the audio engine pans sounds against it), and
 * {@link SceneView.worldChanges} counts new Worlds, so the host can clear its particles. The HUD,
 * UI list and screen effects are the core's, passed through. No allocation per frame.
 *
 * **Implements.**
 * - shmup_feat.md §17 — title / game / pause screens drawn on the canvas
 * - shmup_feat.md §18 — parallax starfields behind the world layers
 *
 * **Public API.** {@link createSceneView}, {@link SceneView}, {@link SCENE_VIEW_SPRITES}.
 *
 * @module
 */
import {
  LayerId,
  PLAYFIELD_H,
  PLAYFIELD_W,
  createSpriteBatch,
  defineModule,
  pushSprite,
  type CameraView,
  type DrawList,
  type Game,
  type RenderFrame,
  type ScreenView,
  type SpriteBatch,
  type WorldView,
} from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'scene-view',
  status: 'implemented',
  specRefs: ['shmup_feat.md §17', 'shmup_feat.md §18'],
});

/**
 * Sprites the view draws itself, appended after the content's names (index `i` here is sprite id
 * `contentNames.length + i`).
 */
export const SCENE_VIEW_SPRITES: readonly string[] = Object.freeze([
  'bg/stars-far',
  'bg/stars-mid',
  'bg/stars-near',
]);

/** Edge of the square starfield tiles (the pipeline's tile size). */
const TILE = 128;

/** Starfield layers: sprite offset, drift speed (px/tick), far layer or not. */
const STAR_LAYERS = [
  { sprite: 0, speed: 0.125, far: true },
  { sprite: 1, speed: 0.25, far: false },
  { sprite: 2, speed: 0.5, far: false },
] as const;

/**
 * A position the audio engine pans against (updated from the World's camera). A class, so its
 * possibly fractional fields keep one hidden class and are written without allocating.
 */
class FollowCamera implements CameraView {
  /** Playfield left edge in world pixels. */
  x = 0;
  /** Playfield top edge in world pixels. */
  y = 0;
}

/** The starfield batches of one view. */
interface Starfield {
  /** `BG_FAR` tiles. */
  readonly far: SpriteBatch;
  /** `BG_MID` tiles (two layers). */
  readonly mid: SpriteBatch;
}

/** The scene flow's view for the renderer. */
export interface SceneView {
  /** Sprite names by sprite id: the content's names, then {@link SCENE_VIEW_SPRITES}. */
  readonly spriteNames: readonly string[];
  /** The backdrop shown outside the game (starfield, static camera). Bind it at load. */
  readonly backdrop: WorldView;
  /** The frame handed to the renderer (reused). */
  readonly frame: RenderFrame;
  /**
   * The camera of what is on screen: the shown World's (the game's, or the weapon select's
   * preview) while one shows, else the backdrop's.
   */
  readonly camera: CameraView;
  /**
   * How many different Worlds have been shown (a game start or RETRY adds one, so does opening the
   * weapon select's preview) — the shell clears the renderer's particles and score popups when it
   * changes.
   */
  readonly worldChanges: number;
  /**
   * Copies the game's camera into {@link SceneView.camera} (call after the ticks, before the
   * events are drained). Never allocates.
   *
   * @remarks
   * Follows the camera of the World view the last {@link SceneView.update} showed, else the
   * backdrop's static camera — so a sound pushed while the title shows pans from the backdrop, and
   * after a quit to the title the view stops following the old World.
   */
  follow(): void;
  /**
   * Builds the frame to render from the game's frame: the World's view (with the open-space
   * starfield) or the backdrop, plus the game's HUD, UI list and screen effects. Allocates only
   * when a new World appears.
   *
   * @param source - The game's frame (`game.renderFrame()`).
   * @returns {@link SceneView.frame}, updated (reused — do not keep it).
   */
  update(source: RenderFrame): RenderFrame;
}

/**
 * Creates the scene flow's view for a game.
 *
 * @remarks
 * The starfield drifts with the frame's tick, so it freezes with the World under the pause menu
 * and restarts from the left with a new World (whose tick starts at 0); behind the title it runs
 * on the flow's own tick. A World whose view has parallax bands (a stage) is drawn as is; one
 * without (open space) gets a wrapper view listing two starfield batches, then the World's
 * batches, on the World's camera with its terrain, laser and WARNING views passed through. The
 * wrapper is a new `WorldView` object, so the renderer binds it on the first frame it appears.
 *
 * @param game - A game running the scene flow (its content's sprite names are used).
 * @returns The view; the backdrop is allocated now, a World's wrapper when that World appears.
 *
 * @example
 * ```ts
 * const view = createSceneView(game);
 * renderer.setSpriteNames(view.spriteNames);
 * renderer.bindWorld(view.backdrop);
 * // every frame:
 * game.frame(now);
 * view.follow();
 * game.events.drain(visit);
 * renderer.render(view.update(game.renderFrame()));
 * ```
 */
export function createSceneView(game: Game): SceneView {
  const base = game.content.sprites.names.length;
  const spriteNames = Object.freeze([...game.content.sprites.names, ...SCENE_VIEW_SPRITES]);
  const columns = Math.ceil(PLAYFIELD_W / TILE) + 1;
  const rows = Math.ceil(PLAYFIELD_H / TILE);

  /**
   * Allocates a pair of starfield batches.
   *
   * @returns The batches.
   */
  const createStarfield = (): Starfield => ({
    far: createSpriteBatch(LayerId.BgFar, columns * rows),
    mid: createSpriteBatch(LayerId.BgMid, 2 * columns * rows),
  });

  /**
   * Refills a starfield for a tick, in world space around a camera.
   *
   * @param stars - The batches.
   * @param camera - The camera the tiles follow.
   * @param tick - The tick (the drift freezes with the game).
   */
  const fillStarfield = (stars: Starfield, camera: CameraView, tick: number): void => {
    stars.far.count = 0;
    stars.mid.count = 0;
    for (let i = 0; i < STAR_LAYERS.length; i++) {
      const layer = STAR_LAYERS[i];
      const batch = layer.far ? stars.far : stars.mid;
      const offset = camera.x - ((tick * layer.speed) % TILE);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          pushSprite(batch, offset + col * TILE, camera.y + row * TILE, base + layer.sprite, 0, 0);
        }
      }
    }
  };

  const backdropCamera = new FollowCamera();
  const backdropStars = createStarfield();
  const backdrop: WorldView = {
    camera: backdropCamera,
    parallax: null,
    terrain: null,
    batches: [backdropStars.far, backdropStars.mid],
    lasers: null,
    warning: null,
  };

  // The wrapper of the World view on screen (rebuilt when the frame shows another World's view —
  // a new game, or the weapon select's preview of M2-03).
  let shownView: WorldView | null = null;
  let worldView: WorldView = backdrop;
  let worldStars: Starfield | null = null;
  let worldChanges = 0;

  /**
   * The renderer's view of a World: its own view on a stage, else the starfield under its batches.
   *
   * @param view - The World's view.
   * @returns The view to draw.
   */
  const wrap = (view: WorldView): WorldView => {
    if (view.parallax !== null) {
      worldStars = null;
      return view;
    }
    const stars = createStarfield();
    worldStars = stars;
    return {
      camera: view.camera,
      parallax: null,
      terrain: view.terrain,
      batches: [stars.far, stars.mid, ...view.batches],
      lasers: view.lasers ?? null,
      bendingLasers: view.bendingLasers ?? null,
      warning: view.warning ?? null,
    };
  };

  const camera = new FollowCamera();
  const frame: {
    tick: number;
    alpha: number;
    world: WorldView | null;
    hud: DrawList;
    ui: DrawList;
    screen: ScreenView;
  } = {
    tick: 0,
    alpha: 0,
    world: backdrop,
    hud: game.renderFrame().hud,
    ui: game.renderFrame().ui,
    screen: game.renderFrame().screen,
  };

  let showingWorld = false;
  return {
    spriteNames,
    backdrop,
    frame,
    camera,
    get worldChanges(): number {
      return worldChanges;
    },
    follow() {
      const source = showingWorld && shownView !== null ? shownView.camera : backdropCamera;
      camera.x = source.x;
      camera.y = source.y;
    },
    update(source) {
      const tick = source.tick;
      frame.tick = tick;
      frame.alpha = source.alpha;
      frame.hud = source.hud;
      frame.ui = source.ui;
      frame.screen = source.screen;
      const view = source.world;
      if (view !== null) {
        if (view !== shownView) {
          shownView = view;
          worldView = wrap(view);
          worldChanges++;
        }
        if (worldStars !== null) fillStarfield(worldStars, view.camera, tick);
        frame.world = worldView;
        showingWorld = true;
      } else {
        fillStarfield(backdropStars, backdropCamera, tick);
        frame.world = backdrop;
        showingWorld = false;
      }
      return frame;
    },
  };
}

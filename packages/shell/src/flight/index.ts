/**
 * # flight — "free flight", the default dev scene since the World exists (M1-06)
 *
 * **Responsibility.** Shows the real simulation: the game's {@link WorldView} (today the KESTREL,
 * moved by the player's remote, keyboard or gamepad through `stepWorld`) over an empty,
 * slowly drifting starfield, with the HUD bars of decision D20. The starfield and the HUD are
 * presentation only — they never touch the simulation: the scene owns its own
 * {@link FlightScene.world | WorldView} that lists two starfield batches (`BG_FAR`, `BG_MID`)
 * **followed by the game world's own batches** and shares the game's live camera object, so a
 * batch the World adds later (enemies, bullets …) is drawn without changing this scene.
 *
 * **Sprite ids.** The world's batches carry ids of the content's sprite table
 * (`ContentDb.sprites.names`); the scene appends its own starfield and HUD sprites after them
 * ({@link FlightScene.spriteNames}), so both kinds of id index one table the host gives the
 * renderer.
 *
 * Every displayed frame {@link FlightScene.update} copies the game frame's tick, alpha and screen
 * effects and refills the starfield from the tick (it pauses with the game). No allocation per
 * frame.
 *
 * **Implements.**
 * - shmup_feat.md §5 — the ship under the player's control
 * - shmup_feat.md §18 — parallax starfields behind the world layers
 * - shmup_feat.md §17 — HUD bars outside the playfield (decision D20)
 *
 * **Public API.** {@link createFlightScene}, {@link FlightScene}, {@link FlightSceneOptions},
 * {@link FLIGHT_SPRITES}.
 *
 * @module
 */
import {
  LayerId,
  PLAYFIELD_H,
  PLAYFIELD_W,
  TextAlign,
  createDrawList,
  createSpriteBatch,
  defineModule,
  pushSprite,
  type DrawList,
  type Game,
  type RenderFrame,
  type ScreenView,
  type SpriteBatch,
  type WorldView,
} from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'flight',
  status: 'implemented',
  specRefs: ['shmup_feat.md §5', 'shmup_feat.md §18', 'shmup_feat.md §17'],
});

/**
 * Sprites the scene draws itself, appended after the content's sprite names (index `i` here
 * is sprite id `contentNames.length + i`).
 */
export const FLIGHT_SPRITES: readonly string[] = Object.freeze([
  'bg/stars-far',
  'bg/stars-mid',
  'bg/stars-near',
  'hud/life',
]);

/** Offsets into {@link FLIGHT_SPRITES}. */
const OWN = { starsFar: 0, starsMid: 1, starsNear: 2, life: 3 } as const;

/** Options of {@link createFlightScene}. */
export interface FlightSceneOptions {
  /** Edge of the square starfield tiles in pixels (default 128, the pipeline's tile size). */
  readonly starTileSize?: number;
}

/** The free-flight scene. */
export interface FlightScene {
  /** Sprite names by sprite id: the content's names, then {@link FLIGHT_SPRITES}. */
  readonly spriteNames: readonly string[];
  /**
   * The scene's world view: starfield batches, then the game world's batches, with the game's
   * camera. Bind it once at load (`renderer.bindWorld(scene.world)`).
   */
  readonly world: WorldView;
  /** The scene's render frame (reused). */
  readonly frame: RenderFrame;
  /**
   * Advances the starfield to the game's tick and returns the frame to render. Never allocates.
   *
   * @param source - The game's frame (`game.renderFrame()`): tick, alpha and screen effects are
   *   copied.
   * @returns {@link FlightScene.frame}, updated (reused — do not keep it).
   */
  update(source: RenderFrame): RenderFrame;
}

/** Starfield layers: sprite offset, drift speed (px/tick), layer. */
const STAR_LAYERS = [
  { sprite: OWN.starsFar, speed: 0.125, layer: LayerId.BgFar },
  { sprite: OWN.starsMid, speed: 0.25, layer: LayerId.BgMid },
  { sprite: OWN.starsNear, speed: 0.5, layer: LayerId.BgMid },
] as const;

/** HUD bar fill (lifted navy, readable on VA panels). */
const HUD_BAR_COLOR = 0x1d2a5c;

/** String slots of the HUD draw list. */
const STRING = { p1: 0, title: 1, hint: 2 } as const;

/**
 * Creates the free-flight scene for a game.
 *
 * @param game - The running game (its content's sprite names and its World's view are used).
 * @param options - Starfield tile size.
 * @returns The scene; all views and draw lists allocated now.
 *
 * @example
 * ```ts
 * const flight = createFlightScene(game);
 * renderer.setSpriteNames(flight.spriteNames);
 * renderer.bindWorld(flight.world);
 * // every frame:
 * renderer.render(flight.update(game.renderFrame()));
 * ```
 */
export function createFlightScene(game: Game, options: FlightSceneOptions = {}): FlightScene {
  const tile = options.starTileSize ?? 128;
  const base = game.content.sprites.names.length;
  const spriteNames = Object.freeze([...game.content.sprites.names, ...FLIGHT_SPRITES]);
  const columns = Math.ceil(PLAYFIELD_W / tile) + 1;
  const rows = Math.ceil(PLAYFIELD_H / tile);
  const far = createSpriteBatch(LayerId.BgFar, columns * rows);
  const mid = createSpriteBatch(LayerId.BgMid, 2 * columns * rows);
  const gameView = game.world.view;
  const world: WorldView = {
    camera: gameView.camera,
    parallax: null,
    terrain: null,
    batches: [far, mid, ...gameView.batches],
  };

  const hud = createDrawList(32, 4);
  hud.setString(STRING.p1, '1P');
  hud.setString(STRING.title, 'FREE FLIGHT');
  hud.setString(STRING.hint, 'ARROWS MOVE');
  const ui = createDrawList(1, 1);

  const frame: {
    tick: number;
    alpha: number;
    readonly world: WorldView;
    readonly hud: DrawList;
    readonly ui: DrawList;
    screen: ScreenView;
  } = { tick: 0, alpha: 0, world, hud, ui, screen: game.renderFrame().screen };

  /**
   * Fills a starfield batch for a tick (world space, so it stays put on screen while the
   * camera scrolls).
   *
   * @param batch - Target batch.
   * @param sprite - Tile sprite id.
   * @param speed - Drift speed in px/tick.
   * @param tick - Current tick.
   */
  const fillStars = (batch: SpriteBatch, sprite: number, speed: number, tick: number): void => {
    const camera = gameView.camera;
    const offset = camera.x - ((tick * speed) % tile);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        pushSprite(batch, offset + col * tile, camera.y + row * tile, sprite, 0, 0);
      }
    }
  };

  /**
   * Rebuilds the HUD: both bars, the 1P label and score, the scene title, stock ships and a
   * control hint.
   *
   * @param lives - Player 1's ships (the HUD shows `lives - 1` in stock).
   */
  const buildHud = (lives: number): void => {
    hud.clear();
    hud.rect(0, 0, PLAYFIELD_W, 8, HUD_BAR_COLOR);
    hud.rect(0, 208, PLAYFIELD_W, 8, HUD_BAR_COLOR);
    hud.text(STRING.p1, 4, 0, 0x38c8e8);
    hud.number(0, 20, 0, 8);
    hud.text(STRING.title, PLAYFIELD_W / 2, 0, 0xf8d030, TextAlign.Center);
    for (let i = 0; i < lives - 1 && i < 8; i++) hud.sprite(base + OWN.life, 0, 4 + i * 10, 209);
    hud.text(STRING.hint, PLAYFIELD_W / 2, 208, 0x8890b0, TextAlign.Center);
  };

  let hudLives = -1;
  return {
    spriteNames,
    world,
    frame,
    update(source) {
      const tick = source.tick;
      frame.tick = tick;
      frame.alpha = source.alpha;
      frame.screen = source.screen;
      far.count = 0;
      mid.count = 0;
      for (let i = 0; i < STAR_LAYERS.length; i++) {
        const layer = STAR_LAYERS[i];
        fillStars(
          layer.layer === LayerId.BgFar ? far : mid,
          base + layer.sprite,
          layer.speed,
          tick,
        );
      }
      const lives = game.world.players[0].lives;
      if (lives !== hudLives) {
        hudLives = lives;
        buildHud(lives);
      }
      return frame;
    },
  };
}

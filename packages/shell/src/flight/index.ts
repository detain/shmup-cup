/**
 * # flight — "free flight", the `?scene=flight` dev scene (M1-06; the default until M1-16)
 *
 * **Responsibility.** Shows the real simulation: the game's {@link WorldView} (the KESTREL,
 * moved by the player's remote, keyboard or gamepad through `stepWorld`) with the HUD bars of
 * decision D20. In open space (no `GameConfig.stage`) it adds a slowly drifting starfield; when
 * the game runs a stage (`?stage=<id>` in the web app, M1-07) the stage's own parallax bands and
 * terrain are drawn instead and the HUD names the stage. The starfield and the HUD are
 * presentation only — they never touch the simulation: the scene owns its own
 * {@link FlightScene.world | WorldView} that lists its starfield batches (`BG_FAR`, `BG_MID`,
 * open space only) **followed by the game world's own batches**, and shares the game's live
 * camera, parallax, terrain and laser views, so a batch the World adds later (enemies,
 * bullets …) is drawn without changing this scene.
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
 * **HUD (M1-12).** Player 1's score and the session hi-score (`HI`) in the top bar, `lives − 1`
 * stock ships in the bottom bar (`core/player`: `lives` counts the ship in play), and `GAME OVER`
 * in place of the title once the World's status says so. The draw list is rebuilt only when one of
 * them changes (the scores' `displayDirty` / `hiScoreDirty` flags, cleared here). The real HUD with
 * the power meter is core `ui`'s, drawn by the scene flow (M1-16, the shell's default scene
 * `game`); free flight keeps this dev HUD and runs bare gameplay — no title, no pause menu.
 *
 * **WARNING (M1-13; the band mirrors core `scenes`' R4-05.E3 layout).** While the World's boss
 * WARNING is active (`view.warning`), the UI draw list shows its text — built once per boss by
 * the core — centred on a translucent band across the playfield, red hazard fields at its ends,
 * its colour alternating every 16 ticks. The list is rebuilt only when the WARNING starts, ends
 * or changes colour, and the text enters its string slot only when it changed.
 *
 * **Implements.**
 * - shmup_feat.md §5 — the ship under the player's control
 * - shmup_feat.md §18 — parallax starfields behind the world layers
 * - shmup_feat.md §17 — HUD bars outside the playfield (decision D20)
 *
 * **Public API.** {@link createFlightScene}, {@link FlightScene}, {@link FlightSceneOptions},
 * {@link FLIGHT_SPRITES}; {@link STAR_TILE_SIZE}, the starfield tile the showcase and the fx
 * gallery share.
 *
 * @module
 */
import {
  ART_SCALE,
  FRAME_CY,
  FRAME_H,
  FRAME_W,
  GLYPH_H,
  GLYPH_W,
  HUD_BAR_HEIGHT,
  HUD_BOTTOM_Y,
  LayerId,
  PLAYFIELD_H,
  PLAYFIELD_W,
  TextAlign,
  UI_COLORS,
  createDrawList,
  createSpriteBatch,
  defineModule,
  pushSprite,
  uiPx,
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
  /** Edge of the square starfield tiles in pixels (default {@link STAR_TILE_SIZE}). */
  readonly starTileSize?: number;
}

/** The free-flight scene. */
export interface FlightScene {
  /** Sprite names by sprite id: the content's names, then {@link FLIGHT_SPRITES}. */
  readonly spriteNames: readonly string[];
  /**
   * The scene's world view: starfield batches (open space only), then the game world's batches,
   * with the game's camera, parallax and terrain. Bind it once at load
   * (`renderer.bindWorld(scene.world)`).
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

/**
 * Edge of the square starfield tiles in pixels, the default of the dev scenes' starfield (free
 * flight, the showcase and the fx gallery): the pipeline's 128-px tile
 * (`scripts/assets/procedural/starfield.mjs` `STAR_TILE_SIZE`) at the art scale (`ART_SCALE`) —
 * 128 until R2-01's flip, then the interim ×1.5 art's 192.
 */
export const STAR_TILE_SIZE = Math.ceil(128 * ART_SCALE);

/** HUD bar fill (lifted navy, readable on VA panels). */
const HUD_BAR_COLOR = 0x1d2a5c;

/** String slots of the HUD draw list. */
const STRING = { p1: 0, title: 1, hint: 2, hi: 3, gameOver: 4 } as const;

// The dev HUD and the WARNING band are laid out like the scene flow's (core `ui` / `scenes`,
// R2-01): text widths from the font's cell `GLYPH_W`, the art's lengths and gaps at its scale
// (`uiPx`). The numbers in parentheses are the values at 384×216 with the 6×8 font, except in
// the WARNING block: it mirrors core `scenes`' R4-05.E3 band as laid at 640×360, with the values
// at that frame named in its docs.

/**
 * Height of the WARNING band: a fifth of the frame — the scene flow's R4-05.E3 derivation
 * (72 at 640×360, the same height the interim `uiPx(48)` and v1's 48 give, frame-anchored now).
 */
const WARNING_BAND_H = FRAME_H / 5;

/**
 * Screen row of the WARNING band's top edge: the band is centred 8 px above the frame's centre
 * row (the playfield's middle), `FRAME_CY − uiPx(8) − WARNING_BAND_H / 2` (132 at this frame) —
 * as the scene flow's.
 */
const WARNING_BAND_Y = FRAME_CY - uiPx(8) - (WARNING_BAND_H >> 1);

/**
 * From the WARNING band's top edge to its text: the centred text row of the band, between the
 * hazard stripes and under the edge line — `(WARNING_BAND_H − GLYPH_H) / 2` (30, the scene
 * flow's R4-05.E3; v1's `uiPx(9)` sat it 9 px under the top line).
 */
const WARNING_TEXT_DY = (WARNING_BAND_H - GLYPH_H) >> 1;

/** The hazard stripe's pitch: the band's height over four rows (18 at this frame; the scene's). */
const WARNING_STRIPE = WARNING_BAND_H / 4;

/** Width of the hazard field at each end of the band: one band height (72; the scene flow's). */
const WARNING_FIELD_W = WARNING_BAND_H;

/**
 * The hazard stripes' deep red between the `UI_COLORS.alert` bars of the field (the scene
 * flow's `WARNING_STRIPE_DEEP`).
 */
const WARNING_STRIPE_DEEP = 0x881818;

/** Gap between a HUD label and its score (4; core `ui`'s `HUD_LABEL_GAP`). */
const HUD_LABEL_GAP = uiPx(4);

/** Digits of a HUD score. */
const HUD_DIGITS = 8;

/** Left edge of the HUD's `1P` label (4). */
const P1_LABEL_X = uiPx(4);

/** Left edge of player 1's score: after the two-glyph `1P` label and the gap (20). */
const P1_SCORE_X = P1_LABEL_X + 2 * GLYPH_W + HUD_LABEL_GAP;

/** Left edge of the hi-score digits: they end 20 px in from the right edge (`FRAME_W − 68`). */
const HI_SCORE_X = FRAME_W - uiPx(20) - HUD_DIGITS * GLYPH_W;

/** Left edge of the HUD's `HI` label: the two-glyph label, then the gap (`FRAME_W − 84`). */
const HI_LABEL_X = HI_SCORE_X - HUD_LABEL_GAP - 2 * GLYPH_W;

/** x of the first stock ship (4) and the step to the next (10), the `hud/life` art's own. */
const LIVES_X = uiPx(4);

/** See {@link LIVES_X}. */
const LIVES_STEP = uiPx(10);

/**
 * Row of the stock ships: centred in the bottom HUD bar — the icon art is 5 px tall at the
 * v1 scale (8 at the interim's; R4-03.C5), so the row equals core `ui`'s centred stock row
 * (`HUD_STOCK_DY`): the same `HUD_BOTTOM_Y + 2` the browser spec's icon band samples.
 */
const LIVES_Y = HUD_BOTTOM_Y + ((HUD_BAR_HEIGHT - uiPx(5)) >> 1);

/**
 * Draws one hazard field of the WARNING band at its end — the scene flow's `drawHazardField`
 * (core `scenes`, R4-05.E3, art bible §5.11's "red hazard stripes"): four rows of four stripe
 * cells, the deep-red cells stepping one stripe per row so the bars run at 45° over the
 * `UI_COLORS.alert` ground.
 *
 * @param list - The UI list.
 * @param x0 - Screen column of the field's left edge.
 */
const drawHazardField = (list: DrawList, x0: number): void => {
  list.rect(x0, WARNING_BAND_Y, WARNING_FIELD_W, WARNING_BAND_H, UI_COLORS.alert);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if ((c + 3 - r) % 4 >= 2) continue;
      list.rect(
        x0 + c * WARNING_STRIPE,
        WARNING_BAND_Y + r * WARNING_STRIPE,
        WARNING_STRIPE,
        WARNING_STRIPE,
        WARNING_STRIPE_DEEP,
      );
    }
  }
};

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
  const tile = options.starTileSize ?? STAR_TILE_SIZE;
  const base = game.content.sprites.names.length;
  const spriteNames = Object.freeze([...game.content.sprites.names, ...FLIGHT_SPRITES]);
  const columns = Math.ceil(PLAYFIELD_W / tile) + 1;
  const rows = Math.ceil(PLAYFIELD_H / tile);
  const far = createSpriteBatch(LayerId.BgFar, columns * rows);
  const mid = createSpriteBatch(LayerId.BgMid, 2 * columns * rows);
  const gameView = game.world.view;
  // A stage brings its own background: the drifting starfield is for open space only.
  const starfield = gameView.parallax === null;
  const world: WorldView = {
    camera: gameView.camera,
    parallax: gameView.parallax,
    terrain: gameView.terrain,
    batches: starfield ? [far, mid, ...gameView.batches] : gameView.batches.slice(),
    lasers: gameView.lasers ?? null,
    bendingLasers: gameView.bendingLasers ?? null,
    warning: gameView.warning ?? null,
    // The stage's raster effects / palette cycles and the hitbox markers (M2-08).
    effects: gameView.effects ?? null,
    hitboxes: gameView.hitboxes ?? null,
  };
  const warning = gameView.warning ?? null;
  const stage = game.world.stage;

  const hud = createDrawList(32, 5);
  hud.setString(STRING.p1, '1P');
  hud.setString(STRING.title, stage === null ? 'FREE FLIGHT' : stage.stage.name.toUpperCase());
  hud.setString(STRING.hint, 'ARROWS MOVE');
  hud.setString(STRING.hi, 'HI');
  hud.setString(STRING.gameOver, 'GAME OVER');
  const scoring = game.world.scoring.board;
  const p1Score = scoring.scores[0];
  // 22 commands: the band's ground rect, both hazard fields (a ground plus eight deep cells
  // each), the two 1-px alert edges and the text — the scene flow's v2 band, sized to it.
  const ui = createDrawList(22, 1);

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
   * Rebuilds the HUD: both bars, the 1P label and score, the scene title (`FREE FLIGHT`, the
   * stage name or `GAME OVER`), the hi-score, stock ships and a control hint.
   *
   * @param lives - Player 1's ships (the HUD shows `lives - 1` in stock).
   * @param over - Whether the game is over.
   */
  const buildHud = (lives: number, over: boolean): void => {
    hud.clear();
    hud.rect(0, 0, PLAYFIELD_W, HUD_BAR_HEIGHT, HUD_BAR_COLOR);
    hud.rect(0, HUD_BOTTOM_Y, PLAYFIELD_W, HUD_BAR_HEIGHT, HUD_BAR_COLOR);
    hud.text(STRING.p1, P1_LABEL_X, 0, 0x38c8e8);
    hud.number(p1Score.score, P1_SCORE_X, 0, HUD_DIGITS);
    hud.text(
      over ? STRING.gameOver : STRING.title,
      PLAYFIELD_W / 2,
      0,
      over ? 0xf85858 : 0xf8d030,
      TextAlign.Center,
    );
    hud.text(STRING.hi, HI_LABEL_X, 0, 0xf8d030);
    hud.number(scoring.hiScore, HI_SCORE_X, 0, HUD_DIGITS);
    for (let i = 0; i < lives - 1 && i < 8; i++) {
      hud.sprite(base + OWN.life, 0, LIVES_X + i * LIVES_STEP, LIVES_Y);
    }
    hud.text(STRING.hint, PLAYFIELD_W / 2, HUD_BOTTOM_Y, 0x8890b0, TextAlign.Center);
    p1Score.displayDirty = false;
    scoring.hiScoreDirty = false;
  };

  /**
   * Rebuilds the UI list for a WARNING look: 0 = off, 1 / 2 = on in its two colours — the
   * scene flow's v2 band (R4-05.E3): the translucent ground, a hazard field at each end, the
   * 1-px alert edges drawn over them, and the text centred between the lines.
   *
   * @param look - The look.
   */
  const buildWarning = (look: number): void => {
    ui.clear();
    if (look === 0 || warning === null) return;
    ui.setString(0, warning.text);
    ui.rect(0, WARNING_BAND_Y, PLAYFIELD_W, WARNING_BAND_H, 0x000000, 144);
    // As in core: the edge lines come after the fields, so each edge stays one alert line.
    drawHazardField(ui, 0);
    drawHazardField(ui, PLAYFIELD_W - WARNING_FIELD_W);
    ui.rect(0, WARNING_BAND_Y, PLAYFIELD_W, 1, UI_COLORS.alert);
    ui.rect(0, WARNING_BAND_Y + WARNING_BAND_H - 1, PLAYFIELD_W, 1, UI_COLORS.alert);
    ui.text(
      0,
      PLAYFIELD_W / 2,
      WARNING_BAND_Y + WARNING_TEXT_DY,
      look === 1 ? UI_COLORS.alert : UI_COLORS.focus,
      TextAlign.Center,
    );
  };

  let hudLives = -1;
  let hudOver = false;
  let warningLook = 0;
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
      for (let i = 0; starfield && i < STAR_LAYERS.length; i++) {
        const layer = STAR_LAYERS[i];
        fillStars(
          layer.layer === LayerId.BgFar ? far : mid,
          base + layer.sprite,
          layer.speed,
          tick,
        );
      }
      const lives = game.world.players[0].lives;
      const over = game.world.status === 'gameOver';
      if (lives !== hudLives || over !== hudOver || p1Score.displayDirty || scoring.hiScoreDirty) {
        hudLives = lives;
        hudOver = over;
        buildHud(lives, over);
      }
      const look =
        warning === null || !warning.active ? 0 : ((warning.ticks >> 4) & 1) === 0 ? 1 : 2;
      if (look !== warningLook) {
        warningLook = look;
        buildWarning(look);
      }
      return frame;
    },
  };
}

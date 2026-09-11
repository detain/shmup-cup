/**
 * # showcase — the default dev scene until the World exists (M1-06)
 *
 * **Responsibility.** A presentation-only scene that exercises the whole render contract of
 * plan §3.4 with real atlas art: three parallax starfield layers (`BG_FAR`, `BG_MID`), the
 * KESTREL with its thruster and two trailing Options (`PLAYER`), a wave of drifters with
 * periodic hit flashes (`AIR_ENEMIES`, `SpriteFlag.Flash`), a rotating ring of enemy bullets
 * (`ENEMY_BULLETS`), a HUD with scores drawn by the `number` op, lives and the power meter
 * (`HUD` draw list) and the bitmap-font title "SHMUP CUP" (`UI` draw list). It owns its own
 * {@link Showcase.frame | RenderFrame}: every displayed frame {@link Showcase.update} copies
 * the game's tick and derives every position from it (so it pauses with the game), using the
 * core's `sinB` / `cosB` tables — no allocation per frame.
 *
 * Its sprite ids index {@link SHOWCASE_SPRITES}; the host gives that table to the renderer
 * (`renderer.setSpriteNames(showcase.spriteNames)`). `?scene=calibration` replaces it with the
 * skeleton's test pattern. M1-06 swaps it for "free flight" driven by the real World.
 *
 * **Implements.**
 * - shmup_feat.md §18 — parallax starfields, draw order, hit flash, lifted dark background
 * - shmup_feat.md §17 — HUD bars outside the playfield (decision D20), bitmap text
 * - shmup_feat.md §3 — pixel-perfect integer positions at every scale
 *
 * **Public API.** {@link createShowcase}, {@link Showcase}, {@link SHOWCASE_SPRITES},
 * {@link ShowcaseOptions}.
 *
 * @module
 */
import {
  LayerId,
  PLAYFIELD_H,
  PLAYFIELD_W,
  SpriteFlag,
  TextAlign,
  cosB,
  createDrawList,
  createSpriteBatch,
  defineModule,
  pushSprite,
  sinB,
  type DrawList,
  type RenderFrame,
  type ScreenView,
  type SpriteBatch,
  type WorldView,
} from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'showcase',
  status: 'implemented',
  specRefs: ['shmup_feat.md §18', 'shmup_feat.md §17', 'shmup_feat.md §3'],
});

/** The showcase's sprite name table (sprite id = index). */
export const SHOWCASE_SPRITES: readonly string[] = Object.freeze([
  'bg/stars-far',
  'bg/stars-mid',
  'bg/stars-near',
  'ships/kestrel',
  'ships/kestrel-thruster',
  'options/orb',
  'enemies/drifter',
  'bullets/round-pink',
  'hud/life',
  'hud/meter-slot',
  'hud/meter-labels',
]);

/** Sprite ids into {@link SHOWCASE_SPRITES}. */
const SPRITE = {
  starsFar: 0,
  starsMid: 1,
  starsNear: 2,
  ship: 3,
  thruster: 4,
  orb: 5,
  drifter: 6,
  bullet: 7,
  life: 8,
  meterSlot: 9,
  meterLabels: 10,
} as const;

/** Options of {@link createShowcase}. */
export interface ShowcaseOptions {
  /** Edge of the square starfield tiles in pixels (default 128, the pipeline's tile size). */
  readonly starTileSize?: number;
}

/** The showcase scene. */
export interface Showcase {
  /** Sprite names by sprite id — give them to the renderer. */
  readonly spriteNames: readonly string[];
  /** The scene's world view (bind it once at load: `renderer.bindWorld(showcase.world)`). */
  readonly world: WorldView;
  /** The scene's render frame (reused). */
  readonly frame: RenderFrame;
  /**
   * Advances the scene to the game's current tick and returns the frame to render. Never
   * allocates.
   *
   * @param source - The game's frame (`game.renderFrame()`): its `tick` and `alpha` are copied.
   * @returns {@link Showcase.frame}, updated (reused — do not keep it).
   */
  update(source: RenderFrame): RenderFrame;
}

/** Starfield layers: sprite, parallax speed (px/tick), layer. */
const STAR_LAYERS = [
  { sprite: SPRITE.starsFar, speed: 0.25, layer: LayerId.BgFar },
  { sprite: SPRITE.starsMid, speed: 0.5, layer: LayerId.BgMid },
  { sprite: SPRITE.starsNear, speed: 1, layer: LayerId.BgMid },
] as const;

/** Drifters in the enemy wave. */
const DRIFTERS = 5;

/** Bullets in the rotating ring. */
const RING_BULLETS = 12;

/** Trailing Options behind the ship. */
const OPTIONS = 2;

/** Ticks of delay between the ship and each Option (they replay the ship's path). */
const OPTION_DELAY = 10;

/** Power-meter slots in the bottom HUD bar. */
const METER_SLOTS = 7;

/** String slots of the showcase's draw lists. */
const STRING = { title: 0, subtitle: 1, hint: 2, p1: 3, hi: 4, p2: 5 } as const;

/** Binary-angle mask (1024 units per turn). */
const ANGLE_MASK = 1023;

/**
 * Where the ship is on a given tick (a slow figure-eight over the left half).
 *
 * @param tick - Tick (may be negative for the Options' delayed positions).
 * @param out - Receives `[x, y, vy]` (world pixels; `vy` is the vertical tendency).
 */
function shipAt(tick: number, out: Float64Array): void {
  const a = (tick * 3) & ANGLE_MASK;
  const b = (tick * 2) & ANGLE_MASK;
  out[0] = 104 + 40 * sinB(b);
  out[1] = PLAYFIELD_H / 2 + 44 * sinB(a);
  out[2] = cosB(a);
}

/**
 * Creates the showcase scene.
 *
 * @param options - Starfield tile size.
 * @returns The scene; all views and draw lists allocated now.
 *
 * @example
 * ```ts
 * const showcase = createShowcase();
 * renderer.setSpriteNames(showcase.spriteNames);
 * renderer.bindWorld(showcase.world);
 * // every frame:
 * renderer.render(showcase.update(game.renderFrame()));
 * ```
 */
export function createShowcase(options: ShowcaseOptions = {}): Showcase {
  const tile = options.starTileSize ?? 128;
  const columns = Math.ceil(PLAYFIELD_W / tile) + 1;
  const rows = Math.ceil(PLAYFIELD_H / tile);
  const far = createSpriteBatch(LayerId.BgFar, columns * rows);
  const mid = createSpriteBatch(LayerId.BgMid, 2 * columns * rows);
  const air = createSpriteBatch(LayerId.AirEnemies, DRIFTERS);
  const player = createSpriteBatch(LayerId.Player, 2 + OPTIONS);
  const bullets = createSpriteBatch(LayerId.EnemyBullets, RING_BULLETS);
  const world: WorldView = {
    camera: { x: 0, y: 0 },
    parallax: null,
    terrain: null,
    batches: [far, mid, air, player, bullets],
  };

  const hud = createDrawList(64, 8);
  hud.setString(STRING.p1, '1P');
  hud.setString(STRING.hi, 'HI');
  hud.setString(STRING.p2, '2P');
  const ui = createDrawList(16, 8);
  ui.setString(STRING.title, 'SHMUP CUP');
  ui.setString(STRING.subtitle, 'SPRITE SHOWCASE');
  ui.setString(STRING.hint, '?SCENE=CALIBRATION FOR THE TEST PATTERN');
  // The UI never changes: build it once (the renderer then skips redrawing it).
  ui.text(STRING.title, PLAYFIELD_W / 2, 36, 0xf8d030, TextAlign.Center);
  ui.text(STRING.subtitle, PLAYFIELD_W / 2, 48, 0x38c8e8, TextAlign.Center);
  ui.text(STRING.hint, PLAYFIELD_W / 2, 194, 0x8890b0, TextAlign.Center);

  const screen: ScreenView = { shakeX: 0, shakeY: 0, flash: 0, dim: 0 };
  const frame: {
    tick: number;
    alpha: number;
    readonly world: WorldView;
    readonly hud: DrawList;
    readonly ui: DrawList;
    readonly screen: ScreenView;
  } = {
    tick: 0,
    alpha: 0,
    world,
    hud,
    ui,
    screen,
  };
  const at = new Float64Array(3);

  /**
   * Fills a starfield batch.
   *
   * @param batch - Target batch.
   * @param sprite - Tile sprite id.
   * @param speed - Scroll speed in px/tick.
   * @param tick - Current tick.
   */
  const fillStars = (batch: SpriteBatch, sprite: number, speed: number, tick: number): void => {
    const offset = -((tick * speed) % tile);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        pushSprite(batch, offset + col * tile, row * tile, sprite, 0, 0);
      }
    }
  };

  /**
   * Rebuilds the HUD bars for a tick.
   *
   * @param list - The HUD draw list.
   * @param tick - Current tick.
   */
  const buildHud = (list: DrawList, tick: number): void => {
    list.clear();
    list.rect(0, 0, PLAYFIELD_W, 8, 0x1d2a5c);
    list.rect(0, 208, PLAYFIELD_W, 8, 0x1d2a5c);
    list.text(STRING.p1, 4, 0, 0x38c8e8);
    list.number(tick * 10, 20, 0, 8);
    list.text(STRING.hi, 150, 0, 0xf8d030);
    list.number(50000, 166, 0, 8);
    list.text(STRING.p2, 300, 0, 0x8890b0);
    list.number(0, 316, 0, 8, 0x8890b0);
    for (let i = 0; i < 3; i++) list.sprite(SPRITE.life, 0, 4 + i * 10, 209);
    const highlighted = (tick >> 5) % METER_SLOTS;
    const blink = ((tick >> 3) & 1) === 0;
    for (let i = 0; i < METER_SLOTS; i++) {
      const slotFrame = i === highlighted && blink ? 1 : i === METER_SLOTS - 1 ? 2 : 0;
      list.sprite(SPRITE.meterSlot, slotFrame, 96 + i * 40, 208);
      list.sprite(SPRITE.meterLabels, i, 98 + i * 40, 209);
    }
  };

  return {
    spriteNames: SHOWCASE_SPRITES,
    world,
    frame,
    update(source) {
      const tick = source.tick;
      frame.tick = tick;
      frame.alpha = source.alpha;

      far.count = 0;
      mid.count = 0;
      for (let i = 0; i < STAR_LAYERS.length; i++) {
        const layer = STAR_LAYERS[i];
        fillStars(layer.layer === LayerId.BgFar ? far : mid, layer.sprite, layer.speed, tick);
      }

      player.count = 0;
      for (let i = OPTIONS; i >= 1; i--) {
        shipAt(tick - i * OPTION_DELAY, at);
        pushSprite(player, at[0], at[1], SPRITE.orb, (tick >> 3) & 1, 0);
      }
      shipAt(tick, at);
      const bank = at[2] > 0.35 ? 2 : at[2] < -0.35 ? 1 : 0;
      pushSprite(player, at[0] - 8, at[1], SPRITE.thruster, (tick >> 2) & 1);
      pushSprite(player, at[0], at[1], SPRITE.ship, bank, 0);

      air.count = 0;
      for (let i = 0; i < DRIFTERS; i++) {
        const x = PLAYFIELD_W + 24 - ((tick * 1.25 + i * 56) % (PLAYFIELD_W + 48));
        const y = 40 + i * 28 + 10 * sinB((tick * 8 + i * 160) & ANGLE_MASK);
        const flags = (tick + i * 13) % 48 < 2 ? SpriteFlag.Flash : 0;
        pushSprite(air, x, y, SPRITE.drifter, (tick >> 4) & 1, flags);
      }

      bullets.count = 0;
      for (let i = 0; i < RING_BULLETS; i++) {
        const angle = (tick * 3 + Math.floor((i * 1024) / RING_BULLETS)) & ANGLE_MASK;
        pushSprite(bullets, 300 + 26 * cosB(angle), 120 + 26 * sinB(angle), SPRITE.bullet, 0);
      }

      buildHud(hud, tick);
      return frame;
    },
  };
}

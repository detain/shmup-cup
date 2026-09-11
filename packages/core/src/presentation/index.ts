/**
 * # presentation — the render contract and the renderer / audio back-end interfaces
 *
 * **Responsibility.** Declares everything that crosses the sim → presentation boundary
 * except the event queue (`core/events`):
 *
 * - the back-end interfaces presentation packages implement (`@shmup/render-pixi` →
 *   {@link IRenderer}, `@shmup/audio-web` → {@link IAudio});
 * - the **render contract** (plan §3.4): the per-frame {@link RenderFrame} with a read-only
 *   {@link WorldView} (camera, parallax, terrain and a list of {@link SpriteBatchView}s),
 *   two {@link DrawList} command buffers (HUD and UI) and the {@link ScreenView} effects;
 * - the draw layers ({@link LayerId}), sprite flags ({@link SpriteFlag}) and the bitmap-text
 *   measuring contract ({@link TextMetrics}) the renderer implements for layout code.
 *
 * The simulation never calls a renderer: it fills views (typed arrays, reused every tick)
 * and the host hands them to the renderer once per displayed frame. Nothing here allocates
 * after creation — `DrawList` commands and sprite batches are plain numbers in
 * preallocated typed arrays, and strings enter a draw list only through
 * {@link DrawList.setString} when menu text actually changes.
 *
 * **Sprite ids.** `spriteId` values in batches and draw lists index the *sprite name table*
 * the host gives the renderer (normally `ContentDb.sprites.names`). The renderer resolves
 * that table to atlas frames once at load time; per frame it only does array lookups.
 *
 * **Implements.**
 * - shmup_feat.md §22 Architecture (hard sim/presentation split), Rendering pipeline
 *   (read-only views, batched sprites, zero per-frame allocation)
 * - shmup_feat.md §18 — draw order ({@link LayerId}), hit flash ({@link SpriteFlag.Flash})
 * - shmup_feat.md §17 — HUD and canvas UI drawn from command lists; bitmap-font metrics
 * - shmup_tech.md §3.1 (`render-pixi/ # IRenderer impl`, `audio-web/ # IAudio impl`)
 *
 * **Public API.** Back-ends: {@link IRenderer}, {@link IAudio}, {@link AudioBus},
 * {@link AudioState}. Frame: {@link RenderFrame}, {@link ScreenView}. World:
 * {@link WorldView}, {@link CameraView}, {@link ParallaxView}, {@link TerrainView},
 * {@link SpriteBatchView}, {@link SpriteBatch}, {@link createSpriteBatch}, {@link pushSprite},
 * {@link SpriteFlag}. Layers: {@link LayerId}, {@link LAYER_COUNT}, {@link LAYER_NAMES}.
 * Command lists: {@link DrawList}, {@link createDrawList}, {@link DrawOp}, {@link TextAlign},
 * {@link DEFAULT_DRAW_LIST_CAPACITY}, {@link DEFAULT_DRAW_LIST_STRINGS}. Text:
 * {@link TextMetrics}.
 *
 * **Planned API.** `IAudio` grows `playSfx(id, priority)`, `playMusic(trackId)`,
 * `duck(amount, ticks)` with the audio engine (M1-15, shmup_feat.md §19); the parallax and
 * terrain views are drawn from M1-07 (their shapes may grow then).
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'presentation',
  status: 'implemented',
  specRefs: ['shmup_feat.md §22', 'shmup_feat.md §18', 'shmup_feat.md §17', 'shmup_tech.md §3.1'],
});

// ------------------------------------------------------------------------------ layers

/**
 * Draw layers, bottom → top (shmup_feat.md §18 draw order, plan §3.4). Numeric codes so a
 * view can carry its layer in a typed array; the renderer keeps one container per layer.
 *
 * @remarks
 * Enemy bullets sit above explosions and items on purpose (shmup_feat.md §12 readability).
 * Layers `BgFar` … `EnemyBullets` form the *world* group (moved by screen shake); `Hud`,
 * `Ui` and `Debug` are screen-fixed. Append new layers only where the spec says so —
 * the order is the draw order.
 */
export const LayerId = {
  /** Far background (slowest parallax). */
  BgFar: 0,
  /** Mid background. */
  BgMid: 1,
  /** Tile terrain (floors, ceilings, walls). */
  Terrain: 2,
  /** Ground-bound enemies (turrets, walkers, hatches). */
  GroundEnemies: 3,
  /** Flying enemies and bosses. */
  AirEnemies: 4,
  /** The players' shots, lasers and missiles. */
  PlayerShots: 5,
  /** Player ships, Options and shields. */
  Player: 6,
  /** Hitbox marker (shown while focusing / in debug). */
  Hitbox: 7,
  /** Capsules and other pickups. */
  Items: 8,
  /** Explosions, sparks and other particles. */
  Fx: 9,
  /** Enemy bullets — above explosions so they stay readable. */
  EnemyBullets: 10,
  /** The HUD bars ({@link RenderFrame.hud}). */
  Hud: 11,
  /** Menus and overlays ({@link RenderFrame.ui}). */
  Ui: 12,
  /** Debug overlay (hitboxes, counters). */
  Debug: 13,
} as const;

/** A draw layer code (see {@link LayerId}). */
export type LayerId = (typeof LayerId)[keyof typeof LayerId];

/** Number of draw layers. */
export const LAYER_COUNT = 14;

/** Layer names by {@link LayerId} code (debug overlays, container labels). */
export const LAYER_NAMES: readonly string[] = Object.freeze([
  'BG_FAR',
  'BG_MID',
  'TERRAIN',
  'GROUND_ENEMIES',
  'AIR_ENEMIES',
  'PLAYER_SHOTS',
  'PLAYER',
  'HITBOX',
  'ITEMS',
  'FX',
  'ENEMY_BULLETS',
  'HUD',
  'UI',
  'DEBUG',
]);

// ------------------------------------------------------------------------------ sprites

/**
 * Per-sprite flag bits of a {@link SpriteBatchView} (and of a draw list's `sprite` op).
 */
export const SpriteFlag = {
  /** Mirror horizontally around the sprite's anchor. */
  FlipX: 1,
  /** Mirror vertically around the sprite's anchor. */
  FlipY: 2,
  /** Do not draw this sprite this frame (blinking, invulnerability flicker). */
  Hidden: 4,
  /** Draw the white hit-flash sibling (`<sprite>@flash`, decision D30) instead. */
  Flash: 8,
} as const;

/** A {@link SpriteFlag} bit. */
export type SpriteFlag = (typeof SpriteFlag)[keyof typeof SpriteFlag];

/**
 * Read-only view of a batch of sprites drawn on one layer — the unit the renderer binds
 * (plan §3.4).
 *
 * @remarks
 * Struct-of-arrays pools implement it directly (their typed arrays *are* the view);
 * object-based systems fill a small mirror ({@link createSpriteBatch}) at the end of each
 * tick. Slots `[0, count)` are drawn; positions are **world-space** pixels (the renderer
 * subtracts the camera and adds `PLAYFIELD_Y` from core `config`). The renderer keeps one
 * preallocated sprite binding per batch view, so a new entity kind needs no renderer change.
 */
export interface SpriteBatchView {
  /** Layer the batch is drawn on. */
  readonly layer: LayerId;
  /** Number of slots in every array (the most sprites the batch can show). */
  readonly capacity: number;
  /** Live sprites, packed in `[0, count)`. */
  readonly count: number;
  /** World x of each sprite's anchor, in pixels. */
  readonly x: ArrayLike<number>;
  /** World y of each sprite's anchor, in pixels. */
  readonly y: ArrayLike<number>;
  /** Sprite id (index into the host's sprite name table). */
  readonly spriteId: ArrayLike<number>;
  /** Frame index inside the sprite. */
  readonly frame: ArrayLike<number>;
  /** {@link SpriteFlag} bits. */
  readonly flags: ArrayLike<number>;
}

/** A writable sprite batch with canonical typed arrays (see {@link createSpriteBatch}). */
export interface SpriteBatch extends SpriteBatchView {
  /** Live sprites; producers reset it to 0 and refill every tick. */
  count: number;
  /** World x per slot. */
  readonly x: Float64Array;
  /** World y per slot. */
  readonly y: Float64Array;
  /** Sprite id per slot. */
  readonly spriteId: Uint16Array;
  /** Frame per slot. */
  readonly frame: Uint16Array;
  /** Flag bits per slot. */
  readonly flags: Uint8Array;
}

/**
 * Allocates a sprite batch (a mirror view for object-based systems, showcases, tests).
 *
 * @param layer - Layer the batch is drawn on.
 * @param capacity - Slots to preallocate (positive integer).
 * @returns An empty batch (`count` 0).
 * @throws {RangeError} When `capacity` is not a positive integer or `layer` is not a
 *   {@link LayerId}.
 *
 * @example
 * ```ts
 * const enemies = createSpriteBatch(LayerId.AirEnemies, 64);
 * enemies.count = 0;
 * pushSprite(enemies, e.x, e.y, e.spriteId, e.animFrame, 0);
 * ```
 */
export function createSpriteBatch(layer: LayerId, capacity: number): SpriteBatch {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError('sprite batch capacity must be a positive integer');
  }
  if (!Number.isInteger(layer) || layer < 0 || layer >= LAYER_COUNT) {
    throw new RangeError(`sprite batch layer must be a LayerId (0…${LAYER_COUNT - 1})`);
  }
  return {
    layer,
    capacity,
    count: 0,
    x: new Float64Array(capacity),
    y: new Float64Array(capacity),
    spriteId: new Uint16Array(capacity),
    frame: new Uint16Array(capacity),
    flags: new Uint8Array(capacity),
  };
}

/**
 * Appends one sprite to a batch. Never allocates.
 *
 * @param batch - Target batch.
 * @param x - World x of the anchor.
 * @param y - World y of the anchor.
 * @param spriteId - Sprite id (sprite name table index).
 * @param frame - Frame index inside the sprite.
 * @param flags - {@link SpriteFlag} bits (default 0).
 * @returns The slot written, or -1 when the batch is full (the sprite is not drawn).
 */
export function pushSprite(
  batch: SpriteBatch,
  x: number,
  y: number,
  spriteId: number,
  frame: number,
  flags = 0,
): number {
  const i = batch.count;
  if (i >= batch.capacity) return -1;
  batch.x[i] = x;
  batch.y[i] = y;
  batch.spriteId[i] = spriteId;
  batch.frame[i] = frame;
  batch.flags[i] = flags;
  batch.count = i + 1;
  return i;
}

// ------------------------------------------------------------------------------ world

/** The camera: world-space position of the playfield's top-left pixel. */
export interface CameraView {
  /** World x of the playfield's left edge. */
  readonly x: number;
  /** World y of the playfield's top edge. */
  readonly y: number;
}

/**
 * Parallax background layers (stage data, M1-07). Drawn from M1-07 as repeated sprites
 * (no `TilingSprite` — WebGL1 NPOT restrictions).
 */
export interface ParallaxView {
  /** Active parallax layers, packed in `[0, count)`. */
  readonly count: number;
  /** {@link LayerId} per parallax layer (`BgFar` or `BgMid`). */
  readonly layer: ArrayLike<number>;
  /** Sprite id of the repeated tile. */
  readonly spriteId: ArrayLike<number>;
  /** Current horizontal scroll offset in pixels. */
  readonly offsetX: ArrayLike<number>;
  /** Screen row (playfield-relative) of the layer's top edge. */
  readonly y: ArrayLike<number>;
}

/** Tile terrain of the current stage (M1-07). Drawn from M1-07 as a tile-sprite grid. */
export interface TerrainView {
  /** Tile edge in pixels (8). */
  readonly tileSize: number;
  /** Map width in tiles. */
  readonly cols: number;
  /** Map height in tiles. */
  readonly rows: number;
  /** Tile per cell, row-major (`tiles[row * cols + col]`); 0 = empty. */
  readonly tiles: ArrayLike<number>;
  /** Sprite id of the tileset (tile `n` draws frame `n - 1`). */
  readonly tilesetSpriteId: number;
}

/**
 * Read-only view of the gameplay world for one frame (plan §3.4). All members are
 * references to live sim state — the renderer reads, never writes.
 */
export interface WorldView {
  /** The camera (world → playfield offset). */
  readonly camera: CameraView;
  /** Parallax background, or `null` for a plain background. */
  readonly parallax: ParallaxView | null;
  /** Tile terrain, or `null` for open space. */
  readonly terrain: TerrainView | null;
  /**
   * Sprite batches in draw order (within a layer, earlier batches are drawn first). The
   * array itself must not change after the view is handed to a renderer — the renderer
   * binds one sprite binding per entry the first time it sees this view.
   */
  readonly batches: readonly SpriteBatchView[];
}

/** Whole-screen effects for one frame (filled by the fx system, M1-14). */
export interface ScreenView {
  /** Horizontal shake offset of the world layers, in pixels (rounded by the renderer). */
  readonly shakeX: number;
  /** Vertical shake offset of the world layers, in pixels (rounded by the renderer). */
  readonly shakeY: number;
  /** White flash over the playfield, 0 (none) … 1 (full white). */
  readonly flash: number;
  /** Darkening under the UI layer (pause menus), 0 (none) … 1 (black). */
  readonly dim: number;
}

// ------------------------------------------------------------------------------ draw lists

/** Draw-list command codes (stored in {@link DrawList.op}). */
export const DrawOp = {
  /** Solid rectangle: `x, y, w, h, color, alpha`. */
  Rect: 1,
  /**
   * Sprite frame: `ref` = sprite id, `frame`, `x, y` (anchor), `flags` ({@link SpriteFlag}),
   * `color` (tint), `alpha`.
   */
  Sprite: 2,
  /** Bitmap text: `ref` = string slot, `x, y`, `color`, `alpha`, `flags` ({@link TextAlign}). */
  Text: 3,
  /**
   * Number without string building: `value`, `frame` = minimum digits (zero-padded),
   * `x, y`, `color`, `alpha`, `flags` ({@link TextAlign}).
   */
  Number: 4,
} as const;

/** A {@link DrawOp} code. */
export type DrawOp = (typeof DrawOp)[keyof typeof DrawOp];

/** Horizontal alignment of `text` / `number` commands relative to their `x`. */
export const TextAlign = {
  /** `x` is the left edge. */
  Left: 0,
  /** `x` is the centre (per line). */
  Center: 1,
  /** `x` is the right edge (per line). */
  Right: 2,
} as const;

/** A {@link TextAlign} code. */
export type TextAlign = (typeof TextAlign)[keyof typeof TextAlign];

/** Default command capacity of the game's HUD and UI draw lists. */
export const DEFAULT_DRAW_LIST_CAPACITY = 256;

/** Default number of string slots of a draw list. */
export const DEFAULT_DRAW_LIST_STRINGS = 32;

/**
 * A fixed-capacity command buffer for screen-space drawing (HUD, menus) — plan §3.4.
 *
 * @remarks
 * Commands are stored column-wise in typed arrays (one entry per command, `[0, count)`),
 * so building a list never allocates. Text is referenced by **string slot**: callers put a
 * string into a slot with {@link DrawList.setString} when it changes (a menu opens, a
 * label is edited) and the per-frame `text` command only carries the slot number. Numbers
 * (scores, lives) use the `number` command, so HUD updates never build strings.
 * Coordinates are integer screen pixels of the 384×216 frame (stored as `Int16`, rounded).
 * {@link DrawList.revision} changes on every mutation, so a renderer can skip redrawing a
 * list that nobody touched.
 */
export interface DrawList {
  /** Maximum commands. */
  readonly capacity: number;
  /** Number of string slots. */
  readonly stringCapacity: number;
  /** Commands currently in the list. */
  readonly count: number;
  /** Commands rejected because the list was full, since the last {@link DrawList.clear}. */
  readonly dropped: number;
  /** Increases on every change (commands, `clear`, a string that actually changed). */
  readonly revision: number;
  /** {@link DrawOp} per command. */
  readonly op: Uint8Array;
  /** X per command (left edge, anchor or alignment point). */
  readonly x: Int16Array;
  /** Y per command (top edge or anchor). */
  readonly y: Int16Array;
  /** Rect width per command. */
  readonly w: Int16Array;
  /** Rect height per command. */
  readonly h: Int16Array;
  /** Colour per command, 0xRRGGBB (rect fill; tint for sprites and text). */
  readonly color: Uint32Array;
  /** Opacity per command, 0…255. */
  readonly alpha: Uint8Array;
  /** Sprite id (`sprite`) or string slot (`text`). */
  readonly ref: Int32Array;
  /** Sprite frame (`sprite`) or minimum digits (`number`). */
  readonly frame: Uint16Array;
  /** {@link SpriteFlag} bits (`sprite`) or {@link TextAlign} (`text`, `number`). */
  readonly flags: Uint8Array;
  /** Value of `number` commands. */
  readonly value: Float64Array;
  /** String slots (`''` until set). */
  readonly strings: readonly string[];
  /** Removes every command (string slots are kept). */
  clear(): void;
  /**
   * Adds a solid rectangle.
   *
   * @param x - Left edge.
   * @param y - Top edge.
   * @param w - Width in pixels.
   * @param h - Height in pixels.
   * @param color - Fill colour, 0xRRGGBB.
   * @param alpha - Opacity 0…255 (default 255).
   * @returns The command index, or -1 when the list is full (counted in `dropped`).
   */
  rect(x: number, y: number, w: number, h: number, color: number, alpha?: number): number;
  /**
   * Adds a sprite frame, positioned by its anchor like world sprites.
   *
   * @param spriteId - Sprite id (sprite name table index).
   * @param frame - Frame index inside the sprite.
   * @param x - Screen x of the anchor.
   * @param y - Screen y of the anchor.
   * @param flags - {@link SpriteFlag} bits (default 0).
   * @param color - Tint, 0xRRGGBB (default white = untinted).
   * @param alpha - Opacity 0…255 (default 255).
   * @returns The command index, or -1 when the list is full.
   */
  sprite(
    spriteId: number,
    frame: number,
    x: number,
    y: number,
    flags?: number,
    color?: number,
    alpha?: number,
  ): number;
  /**
   * Adds the text of a string slot in the bitmap font (`\n` starts a new line).
   *
   * @param slot - String slot (see {@link DrawList.setString}).
   * @param x - Alignment point (see `align`).
   * @param y - Top edge of the first line.
   * @param color - Tint, 0xRRGGBB (default white).
   * @param align - {@link TextAlign} (default left).
   * @param alpha - Opacity 0…255 (default 255).
   * @returns The command index, or -1 when the list is full.
   * @throws {RangeError} When `slot` is outside `[0, stringCapacity)`.
   */
  text(slot: number, x: number, y: number, color?: number, align?: number, alpha?: number): number;
  /**
   * Adds a number drawn digit by digit (no string is built). The integer part is drawn;
   * negative values get a leading `-`.
   *
   * @param value - Value to draw.
   * @param x - Alignment point (see `align`).
   * @param y - Top edge.
   * @param minDigits - Zero-pad to at least this many digits (0 = no padding, max 20).
   * @param color - Tint, 0xRRGGBB (default white).
   * @param align - {@link TextAlign} (default left).
   * @param alpha - Opacity 0…255 (default 255).
   * @returns The command index, or -1 when the list is full.
   */
  number(
    value: number,
    x: number,
    y: number,
    minDigits?: number,
    color?: number,
    align?: number,
    alpha?: number,
  ): number;
  /**
   * Puts a string into a slot. Call it when the text changes, not every frame.
   *
   * @param slot - Slot index.
   * @param text - New text.
   * @returns `true` when the slot changed (and `revision` increased).
   * @throws {RangeError} When `slot` is outside `[0, stringCapacity)`.
   */
  setString(slot: number, text: string): boolean;
}

/** Largest `minDigits` a `number` command stores. */
const MAX_NUMBER_DIGITS = 20;

/**
 * Creates an empty draw list with all storage preallocated.
 *
 * @param capacity - Maximum commands (default {@link DEFAULT_DRAW_LIST_CAPACITY}).
 * @param stringCapacity - String slots (default {@link DEFAULT_DRAW_LIST_STRINGS}).
 * @returns The draw list.
 * @throws {RangeError} When either capacity is not a positive integer.
 *
 * @example
 * ```ts
 * const hud = createDrawList();
 * hud.setString(0, '1P'); // once
 * // every frame (or when the score changes):
 * hud.clear();
 * hud.rect(0, 0, 384, 8, 0x10173a);
 * hud.text(0, 4, 0);
 * hud.number(score, 20, 0, 8);
 * ```
 */
export function createDrawList(
  capacity: number = DEFAULT_DRAW_LIST_CAPACITY,
  stringCapacity: number = DEFAULT_DRAW_LIST_STRINGS,
): DrawList {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError('draw list capacity must be a positive integer');
  }
  if (!Number.isInteger(stringCapacity) || stringCapacity <= 0) {
    throw new RangeError('draw list string capacity must be a positive integer');
  }
  const op = new Uint8Array(capacity);
  const x = new Int16Array(capacity);
  const y = new Int16Array(capacity);
  const w = new Int16Array(capacity);
  const h = new Int16Array(capacity);
  const color = new Uint32Array(capacity);
  const alpha = new Uint8Array(capacity);
  const ref = new Int32Array(capacity);
  const frame = new Uint16Array(capacity);
  const flags = new Uint8Array(capacity);
  const value = new Float64Array(capacity);
  const strings: string[] = [];
  for (let i = 0; i < stringCapacity; i++) strings.push('');
  let count = 0;
  let dropped = 0;
  let revision = 0;

  /**
   * Reserves the next command slot and fills the fields every command has.
   *
   * @param code - Command code.
   * @param px - X (rounded).
   * @param py - Y (rounded).
   * @param rgb - Colour.
   * @param a - Opacity 0…255 (clamped).
   * @returns The slot, or -1 when full.
   */
  const begin = (code: DrawOp, px: number, py: number, rgb: number, a: number): number => {
    if (count >= capacity) {
      dropped++;
      return -1;
    }
    const i = count++;
    revision++;
    op[i] = code;
    x[i] = Math.round(px);
    y[i] = Math.round(py);
    w[i] = 0;
    h[i] = 0;
    color[i] = rgb;
    alpha[i] = a < 0 ? 0 : a > 255 ? 255 : a;
    ref[i] = 0;
    frame[i] = 0;
    flags[i] = 0;
    value[i] = 0;
    return i;
  };

  /**
   * Throws unless `slot` names a string slot.
   *
   * @param slot - Slot index.
   * @throws {RangeError} When out of range.
   */
  const checkSlot = (slot: number): void => {
    if (!Number.isInteger(slot) || slot < 0 || slot >= stringCapacity) {
      throw new RangeError(`draw list string slot must be in [0, ${stringCapacity}), got ${slot}`);
    }
  };

  return {
    capacity,
    stringCapacity,
    get count(): number {
      return count;
    },
    get dropped(): number {
      return dropped;
    },
    get revision(): number {
      return revision;
    },
    op,
    x,
    y,
    w,
    h,
    color,
    alpha,
    ref,
    frame,
    flags,
    value,
    strings,
    clear(): void {
      count = 0;
      dropped = 0;
      revision++;
    },
    rect(px, py, pw, ph, rgb, a = 255): number {
      const i = begin(DrawOp.Rect, px, py, rgb, a);
      if (i >= 0) {
        w[i] = Math.round(pw);
        h[i] = Math.round(ph);
      }
      return i;
    },
    sprite(spriteId, spriteFrame, px, py, spriteFlags = 0, rgb = 0xffffff, a = 255): number {
      const i = begin(DrawOp.Sprite, px, py, rgb, a);
      if (i >= 0) {
        ref[i] = spriteId;
        frame[i] = spriteFrame;
        flags[i] = spriteFlags;
      }
      return i;
    },
    text(slot, px, py, rgb = 0xffffff, align = TextAlign.Left, a = 255): number {
      checkSlot(slot);
      const i = begin(DrawOp.Text, px, py, rgb, a);
      if (i >= 0) {
        ref[i] = slot;
        flags[i] = align;
      }
      return i;
    },
    number(num, px, py, minDigits = 0, rgb = 0xffffff, align = TextAlign.Left, a = 255): number {
      const i = begin(DrawOp.Number, px, py, rgb, a);
      if (i >= 0) {
        value[i] = num;
        frame[i] =
          minDigits < 0 ? 0 : minDigits > MAX_NUMBER_DIGITS ? MAX_NUMBER_DIGITS : minDigits;
        flags[i] = align;
      }
      return i;
    },
    setString(slot, text): boolean {
      checkSlot(slot);
      if (strings[slot] === text) return false;
      strings[slot] = text;
      revision++;
      return true;
    },
  };
}

// ------------------------------------------------------------------------------ text

/** Bitmap-font metrics used for layout (implemented by `@shmup/render-pixi` `text`). */
export interface TextMetrics {
  /**
   * Measures text: the width of its widest line (lines split at `\n`).
   *
   * @param text - Text to measure.
   * @param fontId - Bitmap font name (`'pixel'`).
   * @returns Width in pixels.
   * @throws {RangeError} When the font does not exist.
   */
  measure(text: string, fontId: string): number;
  /** Line advance in pixels of the default font. */
  readonly lineHeight: number;
}

// ------------------------------------------------------------------------------ frame

/**
 * What the renderer receives every displayed frame (plan §3.4). Read-only view of sim
 * state; the game returns the same object every frame (do not keep it).
 */
export interface RenderFrame {
  /** Simulation tick the frame shows. */
  readonly tick: number;
  /** Interpolation factor between the previous and current tick (0 ≤ alpha < 1). */
  readonly alpha: number;
  /** The gameplay world, or `null` outside gameplay (title, menus, calibration). */
  readonly world: WorldView | null;
  /** HUD commands, drawn on {@link LayerId.Hud}. */
  readonly hud: DrawList;
  /** Menu / overlay commands, drawn on {@link LayerId.Ui}. */
  readonly ui: DrawList;
  /** Whole-screen effects. */
  readonly screen: ScreenView;
}

/**
 * A renderer back-end. Draws the game at the internal resolution (384×216) and
 * presents it integer-scaled with nearest-neighbour filtering.
 */
export interface IRenderer {
  /** Internal (virtual) width in pixels. */
  readonly width: number;
  /** Internal (virtual) height in pixels. */
  readonly height: number;
  /**
   * Adapts the output to a new display size.
   *
   * @param cssWidth - Available width in CSS pixels.
   * @param cssHeight - Available height in CSS pixels.
   */
  resize(cssWidth: number, cssHeight: number): void;
  /**
   * Draws one frame.
   *
   * @param frame - The sim state to show.
   */
  render(frame: RenderFrame): void;
  /** Releases GPU resources. */
  destroy(): void;
}

// ------------------------------------------------------------------------------ audio

/** Mixer buses with independent volume (shmup_feat.md §19 Buses). */
export type AudioBus = 'master' | 'music' | 'sfx' | 'ui';

/** Audio context state as exposed to the game. */
export type AudioState = 'uninitialized' | 'suspended' | 'running' | 'closed';

/** An audio back-end (mixer). */
export interface IAudio {
  /** Current state of the underlying audio context. */
  readonly state: AudioState;
  /**
   * Creates/resumes the context; call from a user gesture on the web.
   *
   * @returns Resolves when the context is running (or could not be created — audio
   *   is optional and never blocks the game).
   */
  unlock(): Promise<void>;
  /**
   * Suspends output (app hidden / paused).
   *
   * @returns Resolves when the context is suspended (immediately if there is none).
   */
  suspend(): Promise<void>;
  /**
   * Resumes output after {@link IAudio.suspend}.
   *
   * @returns Resolves when the context is running again (immediately if there is none).
   */
  resume(): Promise<void>;
  /**
   * Sets a bus volume.
   *
   * @param bus - Bus name.
   * @param volume - Linear gain, clamped to 0…1.
   */
  setBusVolume(bus: AudioBus, volume: number): void;
  /**
   * Closes the context and releases resources. The object is unusable afterwards.
   *
   * @returns Resolves when the context is closed.
   */
  destroy(): Promise<void>;
}

/**
 * # sprites — sprite views over simulation state
 *
 * **Responsibility.** Draws simulation sprites without per-frame allocation:
 *
 * - {@link createSpriteLayerBinding} — one preallocated Pixi sprite per slot of a core
 *   `SpriteBatchView`. `sync(view, camX, camY)` copies the live slots every frame: the texture
 *   from `spriteTable[spriteId] + frame`, the position `x = round(x − camX)`,
 *   `y = round(y − camY) + PLAYFIELD_Y` (anchor-adjusted), flips, blink (`Hidden`) and hit
 *   flash (`Flash` → the `<sprite>@flash` sibling, decision D30); unused slots are hidden.
 * - {@link createQuadPool} — an ordered, immediate-mode pool of sprites for screen-space
 *   drawing (HUD, menus, bitmap text): commands draw in push order, rectangles are the white
 *   pixel scaled and tinted.
 * - {@link createSpriteTables} / {@link resolveFrame} — the load-time name → frame tables and
 *   the per-frame lookup both of the above use. Unknown sprites and out-of-range frames draw
 *   the magenta `ui/missing` frame.
 *
 * Everything is created up front; `sync`, `begin`/`frame`/`rect`/`end` only assign numbers and
 * textures that already exist. Sprites of one atlas page batch into one draw call.
 *
 * **Implements.**
 * - shmup_feat.md §3 — pixel-perfect camera (integer positions)
 * - shmup_feat.md §18 — hit flash by swapping to the white sibling frame (batching kept)
 * - shmup_feat.md §22 — sprite views over pools, batched rendering, no per-frame allocation
 *
 * **Public API.** {@link createSpriteLayerBinding}, {@link SpriteLayerBinding},
 * {@link SpriteLayerBindingOptions}, {@link createQuadPool}, {@link QuadPool},
 * {@link QuadPoolOptions}, {@link createSpriteTables}, {@link SpriteTables},
 * {@link resolveFrame}, {@link INTERPOLATION_MAX_STEP}, {@link RenderBlend}.
 *
 * **Render interpolation (M2-08, decision D32).** On displays faster than the 60 Hz tick
 * ({@link SpriteLayerBinding.syncInterpolated}) a binding draws each slot between its position at
 * the previous tick and the current one, by the loop's `alpha`. Pools pack their slots, so a slot
 * may hold another entity than a tick ago: a slot is only blended when it shows the same sprite
 * and moved at most {@link INTERPOLATION_MAX_STEP} pixels on both axes — anything else (a new
 * entity, a teleport, a respawn) is drawn where it is now.
 *
 * @module
 */
import {
  PLAYFIELD_Y,
  SpriteFlag,
  defineModule,
  type CameraView,
  type SpriteBatchView,
} from '@shmup/core';
import { Container, Sprite } from 'pixi.js';
import type { Atlas, FrameId } from '../atlas/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'sprites',
  status: 'implemented',
  specRefs: ['shmup_feat.md §3', 'shmup_feat.md §18', 'shmup_feat.md §22'],
});

/**
 * The renderer's sprite-id → frame tables (shared by every binding and draw-list view of one
 * renderer; replaced as a whole when the sprite name table changes).
 */
export interface SpriteTables {
  /** `base[spriteId]` = frame id of the sprite's frame 0. */
  base: Int32Array;
  /** `flash[spriteId]` = frame id of the hit-flash sibling's frame 0 (or the sprite's own). */
  flash: Int32Array;
}

/**
 * Resolves a sprite name table against an atlas (load time).
 *
 * @param atlas - The atlas.
 * @param names - Sprite names by sprite id (e.g. `ContentDb.sprites.names`).
 * @returns Fresh tables; unknown names map to the missing frame (warned once by the atlas).
 */
export function createSpriteTables(atlas: Atlas, names: readonly string[]): SpriteTables {
  return { base: atlas.resolveSpriteTable(names), flash: atlas.resolveFlashTable(names) };
}

/**
 * Frame id to draw for a sprite id, frame index and flag bits. Never allocates.
 *
 * @param atlas - The atlas.
 * @param tables - The sprite tables.
 * @param spriteId - Sprite id (index into the name table).
 * @param frame - Frame index inside the sprite (truncated to an integer).
 * @param flags - `SpriteFlag` bits (`Flash` selects the flash table).
 * @returns The frame id; {@link Atlas.missingFrame} for an unknown sprite id or a frame index
 *   outside the sprite.
 */
export function resolveFrame(
  atlas: Atlas,
  tables: SpriteTables,
  spriteId: number,
  frame: number,
  flags: number,
): FrameId {
  const table = (flags & SpriteFlag.Flash) !== 0 ? tables.flash : tables.base;
  if (!(spriteId >= 0 && spriteId < table.length)) return atlas.missingFrame;
  const base = table[spriteId | 0];
  const index = frame | 0;
  if (index < 0 || index >= atlas.framesLeft[base]) return atlas.missingFrame;
  return base + index;
}

/**
 * Places one sprite so that the frame's anchor pixel lands on `(sx, sy)`, mirrored around
 * the anchor when flipped (a mirrored sprite keeps its anchor point).
 *
 * @param sprite - The Pixi sprite.
 * @param atlas - The atlas (anchors by frame id).
 * @param frameId - Frame to show.
 * @param sx - Screen x of the anchor (integer).
 * @param sy - Screen y of the anchor (integer).
 * @param flags - `SpriteFlag` bits (`FlipX`, `FlipY`).
 */
function place(
  sprite: Sprite,
  atlas: Atlas,
  frameId: FrameId,
  sx: number,
  sy: number,
  flags: number,
): void {
  sprite.texture = atlas.textures[frameId];
  const ax = atlas.anchorX[frameId];
  const ay = atlas.anchorY[frameId];
  if ((flags & SpriteFlag.FlipX) !== 0) {
    sprite.scale.x = -1;
    sprite.x = sx + ax;
  } else {
    sprite.scale.x = 1;
    sprite.x = sx - ax;
  }
  if ((flags & SpriteFlag.FlipY) !== 0) {
    sprite.scale.y = -1;
    sprite.y = sy + ay;
  } else {
    sprite.scale.y = 1;
    sprite.y = sy - ay;
  }
}

/**
 * Sets a sprite's tint only when it changes. Pixi's `tint` setter normalises the value through
 * `Color` (array destructuring → an iterator per call) before it compares, so assigning the same
 * tint every frame would allocate; the getter is plain integer maths.
 *
 * @param sprite - The Pixi sprite.
 * @param tint - Tint 0xRRGGBB.
 */
function setTint(sprite: Sprite, tint: number): void {
  if (sprite.tint !== tint) sprite.tint = tint;
}

/**
 * Sets the alpha of a quad-pool sprite only when it changes, comparing against the pool's own
 * record of the 0…255 value it last set. `alpha / 255` is fractional for a translucent quad (the
 * debug overlay's backdrop and grid lines, dimmed HUD panels), and passing a fractional number to
 * Pixi's `alpha` setter boxes it into a heap number whenever V8 does not inline the setter — which
 * depends on how the call site's feedback settled (the debug overlay's allocation guard caught 16
 * bytes per translucent quad per frame in some runs). Comparing against a typed array never
 * allocates, and an unchanged quad skips the setter altogether.
 *
 * @param sprite - The Pixi sprite.
 * @param alphas - The pool's last-set alphas, 0…255 (255 = Pixi's default opacity of 1).
 * @param slot - The sprite's slot in the pool.
 * @param alpha - Opacity 0…255.
 */
function setAlpha(sprite: Sprite, alphas: Float64Array, slot: number, alpha: number): void {
  if (alphas[slot] === alpha) return;
  alphas[slot] = alpha;
  sprite.alpha = alpha / 255;
}

/**
 * Largest move per tick (pixels, on each axis) a sprite slot is interpolated across; a longer jump
 * is a different entity in the slot or a teleport and is drawn where it is now (M2-08).
 */
export const INTERPOLATION_MAX_STEP = 24;

/**
 * One frame's render interpolation (M2-08), handed to the interpolating syncs as an object — a
 * fractional number passed as a call argument is boxed whenever V8 does not inline the call.
 */
export interface RenderBlend {
  /** Blend factor 0 (the previous tick) … 1 (the current tick). */
  readonly alpha: number;
  /**
   * Ticks since the last interpolated frame: 1 shifts the bindings' history by one tick, 0 keeps
   * it, anything else (a jump, the first frame, interpolation just switched on) resets it.
   */
  readonly advance: number;
}

/** Options of {@link createSpriteLayerBinding}. */
export interface SpriteLayerBindingOptions {
  /** The atlas the frames come from. */
  readonly atlas: Atlas;
  /** Sprite tables (the object is read on every sync, so replacing its arrays takes effect). */
  readonly tables: SpriteTables;
  /** Sprites to preallocate — the batch view's capacity. */
  readonly capacity: number;
  /** Layer the batch belongs to (informational; the caller adds the container to it). */
  readonly layer: number;
  /** Screen row added to every y (default `PLAYFIELD_Y` = 8, below the top HUD bar). */
  readonly offsetY?: number;
}

/** A preallocated set of sprites mirroring one `SpriteBatchView`. */
export interface SpriteLayerBinding {
  /** Layer code of the bound batch. */
  readonly layer: number;
  /** Number of preallocated sprites. */
  readonly capacity: number;
  /** Container holding the sprites (add it to the layer container). */
  readonly container: Container;
  /** Sprites drawn by the last sync (hidden ones excluded). */
  readonly visibleCount: number;
  /**
   * Copies the batch's live slots into the sprites and hides the rest. Never allocates.
   *
   * @remarks
   * Slots flagged `SpriteFlag.Hidden` are skipped (and not counted in `visibleCount`); an
   * unknown sprite id or a frame outside its sprite draws `ui/missing` ({@link resolveFrame}).
   * Sprites beyond `count` that the previous sync used are hidden, so a shrinking batch never
   * leaves stale sprites on screen.
   *
   * @param view - The batch to draw (`count` is clamped to the binding's capacity).
   * @param camX - Camera x (world pixels).
   * @param camY - Camera y (world pixels).
   */
  sync(view: SpriteBatchView, camX: number, camY: number): void;
  /**
   * Like {@link SpriteLayerBinding.sync}, but draws each slot between its position at the previous
   * tick and the current one (render interpolation for displays faster than the tick rate —
   * M2-08). Never allocates.
   *
   * @remarks
   * The binding keeps the slots' positions and sprite ids of the last two ticks it saw:
   * `blend.advance` = 1 (one tick since the last call) shifts that history, 0 keeps it, anything
   * else (a jump, the first call, interpolation just switched on) resets it to the current values
   * — nothing is blended then. A slot is blended only when its sprite id is the one it had a tick
   * ago and it moved at most {@link INTERPOLATION_MAX_STEP} pixels on each axis.
   *
   * @param view - The batch to draw.
   * @param camera - The camera (world pixels; normally the interpolated one).
   * @param blend - The frame's blend factor and tick advance.
   */
  syncInterpolated(view: SpriteBatchView, camera: CameraView, blend: RenderBlend): void;
  /** Destroys the sprites and the container (textures belong to the atlas). */
  destroy(): void;
}

/**
 * Creates the sprite binding for one batch view.
 *
 * @param options - Atlas, tables, capacity, layer and y offset.
 * @returns The binding (all sprites created now, hidden).
 * @throws {RangeError} When `capacity` is not a positive integer.
 *
 * @example
 * ```ts
 * const binding = createSpriteLayerBinding({ atlas, tables, capacity: batch.capacity, layer: batch.layer });
 * layers.layers[batch.layer].addChild(binding.container);
 * binding.sync(batch, world.camera.x, world.camera.y); // every frame
 * ```
 */
export function createSpriteLayerBinding(options: SpriteLayerBindingOptions): SpriteLayerBinding {
  const { atlas, tables, capacity, layer } = options;
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError('sprite binding capacity must be a positive integer');
  }
  const offsetY = options.offsetY ?? PLAYFIELD_Y;
  const container = new Container({ label: `batch-${layer}` });
  const sprites: Sprite[] = [];
  for (let i = 0; i < capacity; i++) {
    const sprite = new Sprite();
    sprite.visible = false;
    sprites.push(sprite);
    container.addChild(sprite);
  }
  let used = 0;
  let visible = 0;
  // Render interpolation (M2-08): positions and sprite ids at the previous tick (`prev*`) and at
  // the last tick seen (`seen*`) — two buffer sets swapped by reference when a tick passes.
  let prevX: Float64Array | null = null;
  let prevY: Float64Array | null = null;
  let prevSprite: Int32Array | null = null;
  let seenX: Float64Array | null = null;
  let seenY: Float64Array | null = null;
  let seenSprite: Int32Array | null = null;
  let prevCount = 0;
  let seenCount = 0;

  /**
   * Draws one slot at a screen position.
   *
   * @param view - The batch.
   * @param i - The slot.
   * @param sx - Screen x of the anchor.
   * @param sy - Screen y of the anchor.
   */
  const drawSlot = (view: SpriteBatchView, i: number, sx: number, sy: number): void => {
    const flags = view.flags[i];
    const frameId = resolveFrame(atlas, tables, view.spriteId[i], view.frame[i], flags);
    place(sprites[i], atlas, frameId, sx, sy, flags);
    sprites[i].visible = true;
    visible++;
  };

  return {
    layer,
    capacity,
    container,
    get visibleCount(): number {
      return visible;
    },
    sync(view, camX, camY) {
      const count = view.count < capacity ? view.count : capacity;
      visible = 0;
      for (let i = 0; i < count; i++) {
        if ((view.flags[i] & SpriteFlag.Hidden) !== 0) {
          sprites[i].visible = false;
          continue;
        }
        drawSlot(
          view,
          i,
          Math.round(view.x[i] - camX) | 0,
          (Math.round(view.y[i] - camY) + offsetY) | 0,
        );
      }
      for (let i = count; i < used; i++) sprites[i].visible = false;
      used = count;
    },
    syncInterpolated(view, camera, blend) {
      const camX = camera.x;
      const camY = camera.y;
      let advance = blend.advance;
      if (prevX === null || prevY === null || prevSprite === null) {
        // Created on first use: bindings that never interpolate (60 Hz displays) carry none.
        prevX = new Float64Array(capacity);
        prevY = new Float64Array(capacity);
        prevSprite = new Int32Array(capacity);
        seenX = new Float64Array(capacity);
        seenY = new Float64Array(capacity);
        seenSprite = new Int32Array(capacity);
        advance = -1;
      }
      const count = view.count < capacity ? view.count : capacity;
      if (advance === 1 && seenX !== null && seenY !== null && seenSprite !== null) {
        const x = prevX;
        const y = prevY;
        const id = prevSprite;
        prevX = seenX;
        prevY = seenY;
        prevSprite = seenSprite;
        seenX = x;
        seenY = y;
        seenSprite = id;
        prevCount = seenCount;
      } else if (advance !== 0) {
        prevCount = 0;
      }
      const sx = seenX as Float64Array;
      const sy = seenY as Float64Array;
      const sid = seenSprite as Int32Array;
      if (advance !== 0) {
        for (let i = 0; i < count; i++) {
          sx[i] = view.x[i];
          sy[i] = view.y[i];
          sid[i] = view.spriteId[i];
        }
        seenCount = count;
      }
      const alpha = blend.alpha;
      const t = alpha > 0 ? (alpha < 1 ? alpha : 1) : 0;
      const px = prevX;
      const py = prevY;
      const pid = prevSprite;
      visible = 0;
      for (let i = 0; i < count; i++) {
        if ((view.flags[i] & SpriteFlag.Hidden) !== 0) {
          sprites[i].visible = false;
          continue;
        }
        let x = view.x[i];
        let y = view.y[i];
        if (i < prevCount && pid[i] === view.spriteId[i]) {
          const dx = x - px[i];
          const dy = y - py[i];
          if (dx <= INTERPOLATION_MAX_STEP && dx >= -INTERPOLATION_MAX_STEP) {
            if (dy <= INTERPOLATION_MAX_STEP && dy >= -INTERPOLATION_MAX_STEP) {
              x = px[i] + dx * t;
              y = py[i] + dy * t;
            }
          }
        }
        drawSlot(view, i, Math.round(x - camX) | 0, (Math.round(y - camY) + offsetY) | 0);
      }
      for (let i = count; i < used; i++) sprites[i].visible = false;
      used = count;
    },
    destroy() {
      container.destroy({ children: true });
    },
  };
}

/** Options of {@link createQuadPool}. */
export interface QuadPoolOptions {
  /** The atlas the frames come from. */
  readonly atlas: Atlas;
  /** Sprites to preallocate. */
  readonly capacity: number;
  /** Container label (debugging). */
  readonly label?: string;
}

/**
 * An ordered pool of screen-space quads: between {@link QuadPool.begin} and
 * {@link QuadPool.end}, each `frame` / `rect` call takes the next sprite, so later calls are
 * drawn on top of earlier ones.
 */
export interface QuadPool {
  /** Number of preallocated sprites. */
  readonly capacity: number;
  /** Sprites used since the last `begin()`. */
  readonly used: number;
  /** Calls rejected because the pool was full, since the last `begin()`. */
  readonly dropped: number;
  /** Container holding the sprites. */
  readonly container: Container;
  /** Starts a new pass (the next call reuses sprite 0). */
  begin(): void;
  /**
   * Draws an atlas frame with its anchor at `(x, y)`.
   *
   * @remarks
   * A `frameId` outside `[0, atlas.size)` draws {@link Atlas.missingFrame}. The tint and the
   * alpha are only written to the Pixi sprite when they changed (Pixi's tint setter allocates, and
   * a fractional alpha passed to a setter V8 does not inline is boxed).
   *
   * @param frameId - Frame to draw.
   * @param x - Screen x of the anchor (rounded).
   * @param y - Screen y of the anchor (rounded).
   * @param flags - `SpriteFlag` bits (`FlipX`, `FlipY`; others ignored).
   * @param tint - Tint 0xRRGGBB (0xffffff = untinted).
   * @param alpha - Opacity 0…255.
   * @returns `false` when the pool is full (nothing drawn).
   */
  frame(
    frameId: FrameId,
    x: number,
    y: number,
    flags: number,
    tint: number,
    alpha: number,
  ): boolean;
  /**
   * Draws a solid rectangle (the white pixel frame, scaled and tinted).
   *
   * @param x - Left edge (rounded).
   * @param y - Top edge (rounded).
   * @param w - Width in pixels.
   * @param h - Height in pixels.
   * @param color - Fill 0xRRGGBB.
   * @param alpha - Opacity 0…255.
   * @returns `false` when the pool is full (nothing drawn).
   */
  rect(x: number, y: number, w: number, h: number, color: number, alpha: number): boolean;
  /** Ends the pass: hides the sprites the pass did not use. */
  end(): void;
  /** Destroys the sprites and the container. */
  destroy(): void;
}

/**
 * Creates an ordered quad pool (HUD, menus, bitmap text).
 *
 * @param options - Atlas, capacity and label.
 * @returns The pool (all sprites created now, hidden).
 * @throws {RangeError} When `capacity` is not a positive integer.
 *
 * @example
 * ```ts
 * const pool = createQuadPool({ atlas, capacity: 1024 });
 * pool.begin();
 * pool.rect(0, 0, 384, 8, 0x10173a, 255);
 * pool.frame(atlas.frameId('hud/life#0'), 4, 212, 0, 0xffffff, 255);
 * pool.end();
 * ```
 */
export function createQuadPool(options: QuadPoolOptions): QuadPool {
  const { atlas, capacity } = options;
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError('quad pool capacity must be a positive integer');
  }
  const container = new Container({ label: options.label ?? 'quads' });
  const sprites: Sprite[] = [];
  for (let i = 0; i < capacity; i++) {
    const sprite = new Sprite();
    sprite.visible = false;
    sprites.push(sprite);
    container.addChild(sprite);
  }
  // The alpha each sprite was last given (see setAlpha); new sprites are opaque.
  const alphas = new Float64Array(capacity).fill(255);
  const pixel = atlas.textures[atlas.pixelFrame];
  let used = 0;
  let previous = 0;
  let dropped = 0;

  return {
    capacity,
    container,
    get used(): number {
      return used;
    },
    get dropped(): number {
      return dropped;
    },
    begin() {
      previous = used > previous ? used : previous;
      used = 0;
      dropped = 0;
    },
    frame(frameId, x, y, flags, tint, alpha) {
      if (used >= capacity) {
        dropped++;
        return false;
      }
      const slot = used++;
      const sprite = sprites[slot];
      const id = frameId >= 0 && frameId < atlas.size ? frameId : atlas.missingFrame;
      place(sprite, atlas, id, Math.round(x), Math.round(y), flags);
      setTint(sprite, tint);
      setAlpha(sprite, alphas, slot, alpha);
      sprite.visible = true;
      return true;
    },
    rect(x, y, w, h, color, alpha) {
      if (used >= capacity) {
        dropped++;
        return false;
      }
      const slot = used++;
      const sprite = sprites[slot];
      sprite.texture = pixel;
      sprite.x = Math.round(x);
      sprite.y = Math.round(y);
      sprite.scale.x = w;
      sprite.scale.y = h;
      setTint(sprite, color);
      setAlpha(sprite, alphas, slot, alpha);
      sprite.visible = w > 0 && h > 0;
      return true;
    },
    end() {
      const last = used > previous ? used : previous;
      for (let i = used; i < last; i++) sprites[i].visible = false;
      previous = used;
    },
    destroy() {
      container.destroy({ children: true });
    },
  };
}

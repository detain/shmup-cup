/**
 * # layers — draw-order layer stack, terrain and parallax drawing
 *
 * **Responsibility.** The fixed draw order of the low-res scene: one Pixi container per core
 * `LayerId`, created once, bottom → top (shmup_feat.md §18, plan §3.4):
 * `BG_FAR, BG_MID, TERRAIN, GROUND_ENEMIES, AIR_ENEMIES, PLAYER_SHOTS, PLAYER, HITBOX, ITEMS,
 * FX, ENEMY_BULLETS, HUD, UI, DEBUG`. Enemy bullets are drawn above explosions and items so
 * they stay readable. The layers up to `ENEMY_BULLETS` sit in a **world** group (the renderer
 * offsets it for screen shake); `HUD`, `UI` and `DEBUG` stay fixed to the screen.
 *
 * It also draws the two stage views of the render contract (plan M1-07):
 *
 * - {@link createTerrainBinding} — the stage's `TerrainView` as a **preallocated tile-sprite
 *   grid** one tile wider and taller than the playfield (49 × 26 for 8-px tiles). The grid is a
 *   ring: slot column `s` shows the map column `≡ s (mod 49)` inside the view, so when the
 *   camera crosses a tile column only the one column that scrolled in is re-textured (rows
 *   likewise for vertical pans); every frame the whole grid moves with one container offset.
 * - {@link createParallaxBinding} — each `ParallaxView` band as a row of repeated sprites
 *   (enough to cover the playfield plus one repeat), placed once; per frame only the band's
 *   container offset changes. No `TilingSprite` (WebGL1 NPOT restrictions).
 *
 * And the enemy lasers of plan M1-09 — {@link createLaserBinding}: two preallocated sprites per
 * `LaserView` slot, pivoting on the laser's origin and rotated to its angle; a telegraphing laser
 * (drawn width 0) shows the atlas' white pixel stretched into a 1-px line tinted
 * {@link LASER_WARNING_TINT} (its blink is the view's `Hidden` flag), a beam the frame of the
 * beam sprite whose band matches the drawn width, stretched along the laser.
 *
 * And the bending lasers of plan M2-02 — {@link createBendingLaserBinding}: one preallocated,
 * never-rotated segment sprite per node of every `BendingLaserView` slot, placed on the recorded
 * head positions (tail first, so the head draws on top).
 *
 * Pixel snapping: the renderer is created with `roundPixels: true` and every binding writes
 * integer positions (`Math.round`), so nothing in the stack is drawn at sub-pixel offsets. The
 * terrain container sits at `round(−camera.x)`, which lands integer world positions on exactly
 * the pixels the sprite bindings (`round(x − camera.x)`) put them on.
 *
 * **Implements.**
 * - shmup_feat.md §18 — draw order
 * - shmup_feat.md §12 — bullets drawn above explosions and items; lasers (warning line, beam)
 * - shmup_feat.md §20 — telegraphing (the blinking warning line)
 * - shmup_feat.md §14 — tilemap terrain and parallax background layers (integer-snapped)
 * - shmup_feat.md §22 — tilemap renderer, parallax manager, no per-frame allocation
 *
 * **Public API.** {@link createLayerStack}, {@link LayerStack}, {@link WORLD_LAYER_COUNT},
 * {@link createTerrainBinding}, {@link TerrainBinding}, {@link TerrainBindingOptions},
 * {@link createParallaxBinding}, {@link ParallaxBinding}, {@link ParallaxBindingOptions},
 * {@link createLaserBinding}, {@link LaserBinding}, {@link LaserBindingOptions},
 * {@link LASER_WARNING_TINT}, {@link createBendingLaserBinding}, {@link BendingLaserBinding},
 * {@link BendingLaserBindingOptions}.
 *
 * @module
 */
import {
  LAYER_COUNT,
  LAYER_NAMES,
  LayerId,
  PLAYFIELD_H,
  PLAYFIELD_W,
  PLAYFIELD_Y,
  SpriteFlag,
  defineModule,
  type BendingLaserView,
  type CameraView,
  type LaserView,
  type ParallaxView,
  type TerrainView,
} from '@shmup/core';
import { Container, Sprite } from 'pixi.js';
import type { Atlas, FrameId } from '../atlas/index.js';
import { resolveFrame, type SpriteTables } from '../sprites/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'layers',
  status: 'implemented',
  specRefs: [
    'shmup_feat.md §18',
    'shmup_feat.md §12',
    'shmup_feat.md §14',
    'shmup_feat.md §20',
    'shmup_feat.md §22',
  ],
});

/** Layers `0 … WORLD_LAYER_COUNT - 1` belong to the world group (moved by screen shake). */
export const WORLD_LAYER_COUNT: number = LayerId.Hud;

/** The layer containers of one renderer. */
export interface LayerStack {
  /** Parent of everything; add it to the low-res scene. */
  readonly root: Container;
  /** The world group (`BG_FAR` … `ENEMY_BULLETS`), a child of {@link LayerStack.root}. */
  readonly world: Container;
  /** One container per core `LayerId`, indexed by the layer code. */
  readonly layers: readonly Container[];
}

/**
 * Creates the layer containers in draw order.
 *
 * @remarks
 * `root` children: `world`, `HUD`, `UI`, `DEBUG`; `world` children: the eleven world layers.
 * Each container's `label` is the layer name (`'ENEMY_BULLETS'`), which shows up in Pixi
 * devtools. Content is added by the renderer (sprite bindings, draw-list views, overlays).
 *
 * @returns The stack.
 *
 * @example
 * ```ts
 * const stack = createLayerStack();
 * scene.addChild(stack.root);
 * stack.layers[LayerId.EnemyBullets].addChild(bulletBinding.container);
 * ```
 */
export function createLayerStack(): LayerStack {
  const root = new Container({ label: 'layers' });
  const world = new Container({ label: 'world' });
  root.addChild(world);
  const layers: Container[] = [];
  for (let id = 0; id < LAYER_COUNT; id++) {
    const layer = new Container({ label: LAYER_NAMES[id] ?? `layer-${id}` });
    layers.push(layer);
    if (id < WORLD_LAYER_COUNT) world.addChild(layer);
    else root.addChild(layer);
  }
  return { root, world, layers };
}

/**
 * Shows one atlas frame on a sprite with the frame's anchor at `(x, y)` (container space).
 *
 * @param sprite - The sprite.
 * @param atlas - The atlas.
 * @param frameId - Frame to show.
 * @param x - X of the anchor.
 * @param y - Y of the anchor.
 */
function show(sprite: Sprite, atlas: Atlas, frameId: FrameId, x: number, y: number): void {
  sprite.texture = atlas.textures[frameId];
  sprite.x = x - atlas.anchorX[frameId];
  sprite.y = y - atlas.anchorY[frameId];
  sprite.visible = true;
}

/**
 * `value mod n` in `[0, n)` for any integer `value`.
 *
 * @param value - Integer.
 * @param n - Positive modulus.
 * @returns The non-negative remainder.
 */
const wrap = (value: number, n: number): number => ((value % n) + n) % n;

/** Options of {@link createTerrainBinding}. */
export interface TerrainBindingOptions {
  /** The atlas holding the tileset sprite. */
  readonly atlas: Atlas;
  /** The renderer's sprite tables (read on every sync; replacing their arrays re-textures all). */
  readonly tables: SpriteTables;
  /** The terrain to draw (its size and tile size are read once, here). */
  readonly view: TerrainView;
  /** Visible width in pixels (default `PLAYFIELD_W`). */
  readonly width?: number;
  /** Visible height in pixels (default `PLAYFIELD_H`). */
  readonly height?: number;
  /** Screen row of world row 0 at camera y 0 (default `PLAYFIELD_Y`). */
  readonly offsetY?: number;
}

/** The tile-sprite grid of one terrain view. */
export interface TerrainBinding {
  /** Holds the grid (add it to the `TERRAIN` layer). */
  readonly container: Container;
  /** Slot columns (visible width / tile + 1). */
  readonly columns: number;
  /** Slot rows (visible height / tile + 1, at most the map's rows). */
  readonly rows: number;
  /** Cells re-textured by the last sync (0 while the camera stays inside one tile). */
  readonly updatedCells: number;
  /**
   * Moves the grid with the camera and re-textures the slots whose map column / row changed.
   * Never allocates.
   *
   * @remarks
   * Takes the camera object rather than two numbers: a fractional camera position passed as an
   * argument is boxed into a heap number whenever V8 does not inline the call.
   *
   * @param view - The terrain view the binding was created for.
   * @param camera - The world camera (world pixels).
   */
  sync(view: TerrainView, camera: CameraView): void;
  /** Destroys the sprites and the container. */
  destroy(): void;
}

/**
 * Creates the preallocated tile-sprite grid for a terrain view (load time).
 *
 * @param options - Atlas, tables, view, visible size and y offset.
 * @returns The binding (every sprite created now, hidden until the first sync).
 *
 * @example
 * ```ts
 * const terrain = createTerrainBinding({ atlas, tables, view: world.terrain });
 * layers.layers[LayerId.Terrain].addChild(terrain.container);
 * terrain.sync(world.terrain, world.camera); // every frame
 * ```
 */
export function createTerrainBinding(options: TerrainBindingOptions): TerrainBinding {
  const { atlas, tables, view } = options;
  const size = view.tileSize;
  const columns = Math.ceil((options.width ?? PLAYFIELD_W) / size) + 1;
  const rows = Math.max(
    1,
    Math.min(view.rows, Math.ceil((options.height ?? PLAYFIELD_H) / size) + 1),
  );
  const offsetY = options.offsetY ?? PLAYFIELD_Y;
  const container = new Container({ label: 'terrain' });
  const sprites: Sprite[] = [];
  for (let i = 0; i < columns * rows; i++) {
    const sprite = new Sprite();
    sprite.visible = false;
    sprites.push(sprite);
    container.addChild(sprite);
  }
  // Map column / row each slot column / row currently shows (-1 = none yet).
  const slotCol = new Int32Array(columns).fill(-1);
  const slotRow = new Int32Array(rows).fill(-1);
  const colChanged = new Uint8Array(columns);
  const rowChanged = new Uint8Array(rows);
  let base: Int32Array | null = null;
  let updated = 0;

  /**
   * Re-textures one slot from the map cell it now shows.
   *
   * @param source - The view.
   * @param sc - Slot column.
   * @param sr - Slot row.
   */
  const refresh = (source: TerrainView, sc: number, sr: number): void => {
    const sprite = sprites[sr * columns + sc];
    const col = slotCol[sc];
    const row = slotRow[sr];
    updated++;
    if (col < 0 || col >= source.cols || row < 0 || row >= source.rows) {
      sprite.visible = false;
      return;
    }
    const tile = source.tiles[row * source.cols + col];
    const frame = tile === 0 ? -1 : source.tileFrame[tile];
    if (!(frame >= 0)) {
      sprite.visible = false;
      return;
    }
    const frameId = resolveFrame(atlas, tables, source.tilesetSpriteId, frame, 0);
    show(sprite, atlas, frameId, col * size, row * size);
  };

  return {
    container,
    columns,
    rows,
    get updatedCells(): number {
      return updated;
    },
    sync(source, camera) {
      const camX = camera.x;
      const camY = camera.y;
      updated = 0;
      container.x = Math.round(-camX);
      container.y = offsetY + Math.round(-camY);
      const all = tables.base !== base;
      base = tables.base;
      const c0 = Math.floor(camX / size);
      const r0 = Math.floor(camY / size);
      for (let sr = 0; sr < rows; sr++) {
        const row = r0 + wrap(sr - r0, rows);
        rowChanged[sr] = all || slotRow[sr] !== row ? 1 : 0;
        slotRow[sr] = row;
      }
      for (let sc = 0; sc < columns; sc++) {
        const col = c0 + wrap(sc - c0, columns);
        colChanged[sc] = all || slotCol[sc] !== col ? 1 : 0;
        slotCol[sc] = col;
      }
      for (let sc = 0; sc < columns; sc++) {
        if (colChanged[sc] !== 0) {
          for (let sr = 0; sr < rows; sr++) refresh(source, sc, sr);
        } else {
          for (let sr = 0; sr < rows; sr++) if (rowChanged[sr] !== 0) refresh(source, sc, sr);
        }
      }
    },
    destroy() {
      container.destroy({ children: true });
    },
  };
}

/** Options of {@link createParallaxBinding}. */
export interface ParallaxBindingOptions {
  /** The atlas holding the band sprites. */
  readonly atlas: Atlas;
  /** The renderer's sprite tables. */
  readonly tables: SpriteTables;
  /** The bands to draw (count and spacings are read once, here). */
  readonly view: ParallaxView;
  /** Visible width in pixels (default `PLAYFIELD_W`). */
  readonly width?: number;
  /** Screen row of playfield row 0 (default `PLAYFIELD_Y`). */
  readonly offsetY?: number;
}

/** The repeated-sprite rows of a parallax view. */
export interface ParallaxBinding {
  /** One container per band, in band order (add band `i` to layer `layers[i]`). */
  readonly containers: readonly Container[];
  /** `LayerId` per band (from the view, validated). */
  readonly layers: readonly number[];
  /**
   * Places every band at its current offset. Never allocates.
   *
   * @param view - The parallax view the binding was created for.
   */
  sync(view: ParallaxView): void;
  /** Destroys the sprites and containers. */
  destroy(): void;
}

/**
 * Creates the repeated-sprite rows of a parallax view (load time): band `i` gets
 * `ceil(width / spacing) + 1` sprites `spacing` pixels apart.
 *
 * @param options - Atlas, tables, view, visible width and y offset.
 * @returns The binding.
 * @throws {RangeError} When a band's layer is not a world layer below `TERRAIN` (`BG_FAR` /
 *   `BG_MID`) or its spacing is not a positive integer.
 *
 * @example
 * ```ts
 * const parallax = createParallaxBinding({ atlas, tables, view: world.parallax });
 * parallax.containers.forEach((c, i) => layers.layers[parallax.layers[i]].addChild(c));
 * parallax.sync(world.parallax); // every frame
 * ```
 */
export function createParallaxBinding(options: ParallaxBindingOptions): ParallaxBinding {
  const { atlas, tables, view } = options;
  const width = options.width ?? PLAYFIELD_W;
  const offsetY = options.offsetY ?? PLAYFIELD_Y;
  const containers: Container[] = [];
  const bandLayers: number[] = [];
  const bands: Sprite[][] = [];
  for (let i = 0; i < view.count; i++) {
    const layer = view.layer[i];
    const spacing = view.spacing[i];
    if (layer !== LayerId.BgFar && layer !== LayerId.BgMid) {
      throw new RangeError(`parallax band ${i} has layer ${layer} (BG_FAR or BG_MID expected)`);
    }
    if (!Number.isInteger(spacing) || spacing <= 0) {
      throw new RangeError(`parallax band ${i} has spacing ${spacing}`);
    }
    const container = new Container({ label: `parallax-${i}` });
    const sprites: Sprite[] = [];
    const count = Math.ceil(width / spacing) + 1;
    for (let k = 0; k < count; k++) {
      const sprite = new Sprite();
      sprite.visible = false;
      sprites.push(sprite);
      container.addChild(sprite);
    }
    containers.push(container);
    bandLayers.push(layer);
    bands.push(sprites);
  }

  return {
    containers,
    layers: bandLayers,
    sync(source) {
      for (let i = 0; i < bands.length; i++) {
        const container = containers[i];
        container.x = Math.round(-source.offsetX[i]);
        container.y = offsetY + Math.round(source.y[i]);
        const frameId = resolveFrame(atlas, tables, source.spriteId[i], 0, 0);
        const sprites = bands[i];
        const spacing = source.spacing[i];
        for (let k = 0; k < sprites.length; k++) show(sprites[k], atlas, frameId, k * spacing, 0);
      }
    },
    destroy() {
      for (const container of containers) container.destroy({ children: true });
    },
  };
}

/** Tint of the laser warning line: the pink of the enemy bullets (shmup_feat.md §12). */
export const LASER_WARNING_TINT = 0xff5aa0;

/** Radians per binary-angle unit (1024 units per turn). */
const RADIANS_PER_UNIT = (2 * Math.PI) / 1024;

/** Options of {@link createLaserBinding}. */
export interface LaserBindingOptions {
  /** The atlas (beam sprites and the white pixel of the warning line). */
  readonly atlas: Atlas;
  /** The renderer's sprite tables. */
  readonly tables: SpriteTables;
  /** Sprites to preallocate — the laser view's capacity. */
  readonly capacity: number;
  /** Screen row of world row 0 at camera y 0 (default `PLAYFIELD_Y`). */
  readonly offsetY?: number;
}

/** The preallocated sprites of one laser view. */
export interface LaserBinding {
  /** Holds the sprites (add it to the `ENEMY_BULLETS` layer). */
  readonly container: Container;
  /** Laser slots (two preallocated sprites each: the warning line and the beam). */
  readonly capacity: number;
  /** Lasers drawn by the last sync (hidden ones excluded). */
  readonly visibleCount: number;
  /**
   * Draws the view's live lasers and hides the rest. Never allocates.
   *
   * @remarks
   * Each slot has two sprites pivoting on the laser's origin (`round(x − camera.x)`,
   * `round(y − camera.y) + offsetY`), rotated to its angle: the warning line (the white pixel
   * scaled to `length × 1`, tinted {@link LASER_WARNING_TINT} at creation) shown while the width
   * is 0, otherwise the beam: frame `round(width) − 1` of the beam sprite (its frame `k` is a
   * band `k + 1` px tall — `lasers/beam-*`) stretched to the length, or its last frame scaled
   * across when the beam is wider than its frames. Hidden (`SpriteFlag.Hidden`) and zero-length
   * (or NaN-length) lasers show neither. A rotation is only written when a slot's angle changes
   * (Pixi's transform setters allocate). Views larger than the binding draw their first
   * `capacity` lasers.
   *
   * @param view - The laser view the binding was created for.
   * @param camera - The world camera.
   */
  sync(view: LaserView, camera: CameraView): void;
  /** Destroys the sprites and the container. */
  destroy(): void;
}

/**
 * Creates the laser sprites for a laser view (load time).
 *
 * @param options - Atlas, tables, capacity and y offset.
 * @returns The binding (two sprites per slot created now, hidden).
 * @throws {RangeError} When `capacity` is not a positive integer.
 *
 * @example
 * ```ts
 * const lasers = createLaserBinding({ atlas, tables, capacity: world.lasers.capacity });
 * layers.layers[LayerId.EnemyBullets].addChild(lasers.container);
 * lasers.sync(world.lasers, world.camera); // every frame
 * ```
 */
export function createLaserBinding(options: LaserBindingOptions): LaserBinding {
  const { atlas, tables, capacity } = options;
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError('laser binding capacity must be a positive integer');
  }
  const offsetY = options.offsetY ?? PLAYFIELD_Y;
  const container = new Container({ label: 'lasers' });
  const pixel = atlas.textures[atlas.pixelFrame];
  // Two sprites per slot — the warning line (tinted once, here) and the beam — so a phase change
  // only toggles visibility: Pixi's tint setter allocates, and so does a rotation write, which is
  // therefore only made when the slot's angle changed (`angles`).
  const lines: Sprite[] = [];
  const beams: Sprite[] = [];
  for (let i = 0; i < capacity; i++) {
    // Built the same way (texture, anchor, tint), so both kinds share one hidden class.
    const line = new Sprite(pixel);
    line.anchor.set(0, 0.5);
    line.tint = LASER_WARNING_TINT;
    line.visible = false;
    const beam = new Sprite(pixel);
    beam.anchor.set(0, 0.5);
    beam.tint = 0xffffff;
    beam.visible = false;
    lines.push(line);
    beams.push(beam);
    container.addChild(line, beam);
  }
  const angles = new Float64Array(capacity * 2).fill(Number.NaN);
  let used = 0;
  let visible = 0;

  return {
    container,
    capacity,
    /** See {@link LaserBinding.visibleCount}. */
    get visibleCount(): number {
      return visible;
    },
    /**
     * See {@link LaserBinding.sync}.
     *
     * @param view - The laser view.
     * @param camera - The world camera.
     */
    sync(view, camera) {
      const count = view.count < capacity ? view.count : capacity;
      const camX = camera.x;
      const camY = camera.y;
      visible = 0;
      for (let i = 0; i < count; i++) {
        const line = lines[i];
        const beam = beams[i];
        const length = view.length[i];
        if ((view.flags[i] & SpriteFlag.Hidden) !== 0 || !(length > 0)) {
          line.visible = false;
          beam.visible = false;
          continue;
        }
        const width = view.width[i];
        const angle = view.angle[i] & 1023;
        // `| 0`: `Math.round` may return −0, which V8 stores as a heap number.
        const sx = Math.round(view.x[i] - camX) | 0;
        const sy = (Math.round(view.y[i] - camY) + offsetY) | 0;
        if (width > 0) {
          line.visible = false;
          // Frame k of the beam sprite is a band k + 1 px tall (M1-09 art), so a growing or fading
          // beam switches frames instead of scaling across: a fractional scale written every frame
          // allocated in Pixi's transform. Beams wider than the sprite's frames scale the last one.
          const base = resolveFrame(atlas, tables, view.spriteId[i], 0, 0);
          const frames = atlas.framesLeft[base];
          const band = Math.round(width) | 0;
          const frameId = band <= 1 ? base : band <= frames ? base + band - 1 : base + frames - 1;
          beam.texture = atlas.textures[frameId];
          beam.scale.x = length / atlas.frameWidth[frameId];
          beam.scale.y = band <= frames ? 1 : width / atlas.frameHeight[frameId];
          if (angles[2 * i + 1] !== angle) {
            angles[2 * i + 1] = angle;
            beam.rotation = angle * RADIANS_PER_UNIT;
          }
          beam.x = sx;
          beam.y = sy;
          beam.visible = true;
        } else {
          beam.visible = false;
          line.scale.x = length;
          if (angles[2 * i] !== angle) {
            angles[2 * i] = angle;
            line.rotation = angle * RADIANS_PER_UNIT;
          }
          line.x = sx;
          line.y = sy;
          line.visible = true;
        }
        visible++;
      }
      for (let i = count; i < used; i++) {
        lines[i].visible = false;
        beams[i].visible = false;
      }
      used = count;
    },
    /** See {@link LaserBinding.destroy}. */
    destroy() {
      container.destroy({ children: true });
    },
  };
}

/** Options of {@link createBendingLaserBinding}. */
export interface BendingLaserBindingOptions {
  /** The atlas (the segment sprites). */
  readonly atlas: Atlas;
  /** The renderer's sprite tables. */
  readonly tables: SpriteTables;
  /** Laser slots — the view's capacity. */
  readonly capacity: number;
  /** Nodes per slot — the view's ring size (one sprite each). */
  readonly nodes: number;
  /** Screen row of world row 0 at camera y 0 (default `PLAYFIELD_Y`). */
  readonly offsetY?: number;
}

/** The preallocated segment sprites of one bending laser view. */
export interface BendingLaserBinding {
  /** Holds the sprites (add it to the `ENEMY_BULLETS` layer). */
  readonly container: Container;
  /** Laser slots. */
  readonly capacity: number;
  /** Sprites per slot. */
  readonly nodes: number;
  /** Segments drawn by the last sync. */
  readonly visibleCount: number;
  /**
   * Draws every active, not hidden laser's body and hides the rest. Never allocates.
   *
   * @remarks
   * Slot `s` shows its newest `filled[s]` nodes (at most `nodes`), one segment sprite each —
   * frame 0 of its `spriteId`, anchored on the node (`round(x − camera.x)`,
   * `round(y − camera.y) + offsetY`), never rotated or scaled (Pixi's transform setters
   * allocate) — tail first, so the head is on top. A texture is assigned only when it changed.
   *
   * @param view - The bending laser view the binding was created for.
   * @param camera - The world camera.
   */
  sync(view: BendingLaserView, camera: CameraView): void;
  /** Destroys the sprites and the container. */
  destroy(): void;
}

/**
 * Creates the segment sprites for a bending laser view (load time).
 *
 * @param options - Atlas, tables, capacity, nodes and y offset.
 * @returns The binding (`capacity × nodes` sprites created now, hidden).
 * @throws {RangeError} When `capacity` or `nodes` is not a positive integer.
 *
 * @example
 * ```ts
 * const bends = createBendingLaserBinding({ atlas, tables, capacity: 8, nodes: 64 });
 * layers.layers[LayerId.EnemyBullets].addChild(bends.container);
 * bends.sync(world.bendingLasers, world.camera); // every frame
 * ```
 */
export function createBendingLaserBinding(
  options: BendingLaserBindingOptions,
): BendingLaserBinding {
  const { atlas, tables, capacity, nodes } = options;
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError('bending laser binding capacity must be a positive integer');
  }
  if (!Number.isInteger(nodes) || nodes <= 0) {
    throw new RangeError('bending laser binding nodes must be a positive integer');
  }
  const offsetY = options.offsetY ?? PLAYFIELD_Y;
  const container = new Container({ label: 'bending-lasers' });
  const pixel = atlas.textures[atlas.pixelFrame];
  const sprites: Sprite[] = [];
  for (let i = 0; i < capacity * nodes; i++) {
    const sprite = new Sprite(pixel);
    sprite.visible = false;
    sprites.push(sprite);
    container.addChild(sprite);
  }
  /** Segments shown per slot by the last sync (the rest of the slot's sprites are hidden). */
  const shown = new Int32Array(capacity);
  let visible = 0;

  return {
    container,
    capacity,
    nodes,
    /** See {@link BendingLaserBinding.visibleCount}. */
    get visibleCount(): number {
      return visible;
    },
    /**
     * See {@link BendingLaserBinding.sync}.
     *
     * @param view - The view.
     * @param camera - The camera.
     */
    sync(view, camera) {
      const camX = camera.x;
      const camY = camera.y;
      const slots = view.capacity < capacity ? view.capacity : capacity;
      const ring = view.nodes;
      const mask = ring - 1;
      visible = 0;
      for (let s = 0; s < slots; s++) {
        let n = 0;
        if (view.active[s] !== 0 && (view.flags[s] & SpriteFlag.Hidden) === 0) {
          n = view.filled[s];
          if (n > nodes) n = nodes;
          if (n > ring) n = ring;
        }
        const first = s * nodes;
        if (n > 0) {
          const frameId = resolveFrame(atlas, tables, view.spriteId[s], 0, 0);
          const texture = atlas.textures[frameId];
          const ax = atlas.anchorX[frameId];
          const ay = atlas.anchorY[frameId];
          const base = s * ring;
          const head = view.head[s];
          for (let j = 0; j < n; j++) {
            // Sprite j shows node k = n − 1 − j: the tail first, the head last (on top).
            const node = base + ((head - (n - 1 - j)) & mask);
            const sprite = sprites[first + j];
            if (sprite.texture !== texture) sprite.texture = texture;
            sprite.x = (Math.round(view.x[node] - camX) - ax) | 0;
            sprite.y = (Math.round(view.y[node] - camY) + offsetY - ay) | 0;
            sprite.visible = true;
          }
        }
        for (let j = n; j < shown[s]; j++) sprites[first + j].visible = false;
        shown[s] = n;
        visible += n;
      }
    },
    /** See {@link BendingLaserBinding.destroy}. */
    destroy() {
      container.destroy({ children: true });
    },
  };
}

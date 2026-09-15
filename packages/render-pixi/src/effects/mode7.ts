/**
 * The **Mode-7 floor** of the `effects` module (plan M3-02, shmup_feat.md §18 "[P2] Mode 7-style
 * effects: scaling/rotation, pseudo-3D floor (per-row affine matrix in shader)", §14 "[P2]
 * pseudo-3D high-speed dimension stage"): one GLSL ES 1.0 Pixi filter
 * ({@link createMode7Filter}, the sources in `./shaders.ts`) that writes a tiled ground plane
 * under the horizon, driven by the stage's `mode7` data (core `Mode7View`) and the camera.
 *
 * {@link createMode7Floor} owns the pieces the renderer needs: a full-frame sprite on the
 * `BG_MID` layer whose only job is to give the filter an area to run over, the filter itself,
 * and a per-frame {@link Mode7Floor.sync} that turns the camera position into the plane's origin
 * and axes. The sprite is hidden — and the filter detached — whenever the camera is outside the
 * floor's `[from, to)` range or the stage has no floor at all, so a stage without one renders
 * exactly as before.
 *
 * **Allocation.** The sprite, the filter and its uniform group are created once; a frame only
 * writes numbers. Attaching or detaching the filter (Pixi copies the filter list) happens only
 * when the camera enters or leaves the floor's range.
 *
 * @module
 */
import {
  ANGLE_UNITS,
  PLAYFIELD_H,
  PLAYFIELD_W,
  PLAYFIELD_Y,
  cosB,
  sinB,
  type CameraView,
  type Mode7View,
} from '@shmup/core';
import {
  Filter,
  GlProgram,
  Sprite,
  Texture,
  UniformGroup,
  type Container,
  type TextureSource,
} from 'pixi.js';
import { MODE7_FRAGMENT, MODE7_VERTEX } from './shaders.js';

/** The uniforms the Mode-7 shader reads (see `./shaders.ts`). */
interface Mode7Uniforms {
  /** The tile's rectangle in atlas UV: origin `xy`, size `zw`. */
  uTileRect: Float32Array;
  /** The plane's rotated right axis. */
  uRight: Float32Array;
  /** The plane's rotated forward axis. */
  uForward: Float32Array;
  /** The camera's position on the plane, in texels. */
  uOrigin: Float32Array;
  /** Fog colour, RGB 0 … 1. */
  uFog: Float32Array;
  /** Frame row of the horizon. */
  uHorizon: number;
  /** Last frame row the floor covers. */
  uBottom: number;
  /** Frame column of the view's centre. */
  uCentre: number;
  /** Camera height above the plane, in texels. */
  uHeight: number;
  /** Depth in texels over which the plane fades into the fog. */
  uFogDepth: number;
  /** Largest depth a row may reach (keeps the horizon row finite). */
  uMaxScale: number;
  /** Opacity of the whole floor. */
  uAlpha: number;
}

/** One Mode-7 filter and the uniforms a frame writes. */
export interface Mode7Filter {
  /** The Pixi filter (GLSL ES 1.0; WebGL only). */
  readonly filter: Filter;
  /**
   * Hands the frame's plane to the shader. Never allocates.
   *
   * @param view - The stage's floor.
   * @param originU - The camera's position along the plane's forward axis, in texels.
   * @param originV - Its position along the right axis, in texels.
   */
  apply(view: Mode7View, originU: number, originV: number): void;
  /**
   * Points the filter at a tile of the atlas.
   *
   * @param x - Left column of the tile on its atlas page.
   * @param y - Top row.
   * @param w - Width in pixels.
   * @param h - Height in pixels.
   * @param pageWidth - The atlas page's width.
   * @param pageHeight - The atlas page's height.
   */
  setTile(x: number, y: number, w: number, h: number, pageWidth: number, pageHeight: number): void;
  /** Destroys the filter. */
  destroy(): void;
}

/**
 * Largest depth one row of the floor may reach, in texels: the row just under the horizon would
 * otherwise divide by nearly zero.
 */
export const MODE7_MAX_SCALE = 4096;

/**
 * Creates the Mode-7 filter (load time).
 *
 * @param tile - The atlas page the floor tile lives on (the shader samples it directly).
 * @returns The filter.
 *
 * @example
 * ```ts
 * const mode7 = createMode7Filter(atlas.pages[0]);
 * mode7.setTile(0, 0, 32, 32, 1024, 1024);
 * layer.filters = [mode7.filter];
 * ```
 */
export function createMode7Filter(tile: TextureSource): Mode7Filter {
  const group = new UniformGroup({
    uTileRect: { value: new Float32Array([0, 0, 1, 1]), type: 'vec4<f32>' },
    uRight: { value: new Float32Array([1, 0]), type: 'vec2<f32>' },
    uForward: { value: new Float32Array([0, 1]), type: 'vec2<f32>' },
    uOrigin: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
    uFog: { value: new Float32Array([0, 0, 0]), type: 'vec3<f32>' },
    uHorizon: { value: PLAYFIELD_Y + PLAYFIELD_H / 2, type: 'f32' },
    uBottom: { value: PLAYFIELD_Y + PLAYFIELD_H, type: 'f32' },
    uCentre: { value: PLAYFIELD_W / 2, type: 'f32' },
    uHeight: { value: 24, type: 'f32' },
    uFogDepth: { value: 96, type: 'f32' },
    uMaxScale: { value: MODE7_MAX_SCALE, type: 'f32' },
    uAlpha: { value: 1, type: 'f32' },
  });
  const uniforms = group.uniforms as unknown as Mode7Uniforms;
  const glProgram = GlProgram.from({
    vertex: MODE7_VERTEX,
    fragment: MODE7_FRAGMENT,
    name: 'shmup-mode7',
  });
  const filter = new Filter({
    glProgram,
    resources: { mode7Uniforms: group, uTile: tile },
    resolution: 1,
    antialias: 'off',
  });
  return {
    filter,
    apply(view, originU, originV) {
      // The plane's axes: the turn as a unit vector, from the core's tables (no trigonometry).
      const cos = cosB(view.turn);
      const sin = sinB(view.turn);
      uniforms.uRight[0] = cos;
      uniforms.uRight[1] = -sin;
      uniforms.uForward[0] = sin;
      uniforms.uForward[1] = cos;
      uniforms.uOrigin[0] = originV;
      uniforms.uOrigin[1] = originU;
      uniforms.uFog[0] = ((view.fog >> 16) & 0xff) / 255;
      uniforms.uFog[1] = ((view.fog >> 8) & 0xff) / 255;
      uniforms.uFog[2] = (view.fog & 0xff) / 255;
      uniforms.uHorizon = PLAYFIELD_Y + view.horizon;
      uniforms.uBottom = PLAYFIELD_Y + view.bottom;
      uniforms.uHeight = view.height;
      uniforms.uFogDepth = view.fogDepth;
      uniforms.uAlpha = view.alpha;
    },
    setTile(x, y, w, h, pageWidth, pageHeight) {
      const rect = uniforms.uTileRect;
      rect[0] = x / pageWidth;
      rect[1] = y / pageHeight;
      rect[2] = w / pageWidth;
      rect[3] = h / pageHeight;
    },
    destroy() {
      filter.destroy();
    },
  };
}

/** Options of {@link createMode7Floor}. */
export interface Mode7FloorOptions {
  /** The layer the floor is drawn on (normally `BG_MID`). */
  readonly layer: Container;
  /** Frame width in pixels (default {@link PLAYFIELD_W}). */
  readonly width?: number;
  /** Frame height in pixels (default 216). */
  readonly height?: number;
  /**
   * Creates the filter (default {@link createMode7Filter}; tests in Node, where Pixi cannot probe
   * a WebGL context, pass a fake).
   *
   * @returns The filter.
   */
  readonly createFilter?: () => Mode7Filter;
}

/** The Mode-7 floor of one renderer. */
export interface Mode7Floor {
  /** The sprite the filter runs over (hidden while there is no floor on screen). */
  readonly sprite: Sprite;
  /** The filter, or `null` until a bound view asks for one. */
  readonly filter: Mode7Filter | null;
  /** Whether the floor is drawn now. */
  readonly active: boolean;
  /**
   * Binds a world's floor (load time — `PixiRenderer.bindWorld`).
   *
   * @param view - The stage's floor, or `null` for none.
   * @param tile - The tile's atlas rectangle `[x, y, w, h, pageWidth, pageHeight]`, or `null`
   *   when the atlas has no such sprite (the floor is then never drawn).
   */
  bind(view: Mode7View | null, tile: readonly number[] | null): void;
  /**
   * Updates the floor for one frame: the plane's origin from the camera, the filter attached
   * only while the camera is inside `[from, to)`. Never allocates.
   *
   * @param camera - The frame's camera.
   */
  sync(camera: CameraView): void;
  /** Destroys the sprite and the filter. */
  destroy(): void;
}

/**
 * Creates the Mode-7 floor of a renderer (load time).
 *
 * @param options - See {@link Mode7FloorOptions}.
 * @returns The floor (idle until a view is bound).
 *
 * @example
 * ```ts
 * const floor = createMode7Floor({ layer: layers.layers[LayerId.BgMid] });
 * floor.bind(world.effects?.mode7 ?? null, atlas.tileRect('bg/grid-floor'));
 * floor.sync(frame.world.camera);
 * ```
 */
export function createMode7Floor(options: Mode7FloorOptions): Mode7Floor {
  const width = options.width ?? PLAYFIELD_W;
  const height = options.height ?? PLAYFIELD_Y * 2 + PLAYFIELD_H;
  const make = options.createFilter ?? null;
  const sprite = new Sprite(Texture.WHITE);
  sprite.label = 'mode7';
  sprite.scale.set(width, height);
  sprite.alpha = 0;
  sprite.visible = false;
  options.layer.addChildAt(sprite, 0);
  let filter: Mode7Filter | null = null;
  let view: Mode7View | null = null;
  let active = false;
  return {
    sprite,
    get filter(): Mode7Filter | null {
      return filter;
    },
    get active(): boolean {
      return active;
    },
    bind(next, tile) {
      view = next !== null && next.spriteId >= 0 && tile !== null ? next : null;
      if (view === null) {
        sprite.visible = false;
        sprite.filters = [];
        active = false;
        return;
      }
      if (filter === null && make !== null) filter = make();
      if (filter !== null && tile !== null) {
        filter.setTile(tile[0], tile[1], tile[2], tile[3], tile[4], tile[5]);
      }
      active = false;
      sprite.visible = false;
      sprite.filters = [];
    },
    sync(camera) {
      const floor = view;
      if (floor === null || filter === null) return;
      const on = camera.x >= floor.from && camera.x < floor.to;
      if (on !== active) {
        active = on;
        sprite.visible = on;
        sprite.filters = on ? [filter.filter] : [];
      }
      if (!on) return;
      filter.apply(floor, camera.x * floor.scroll, camera.y * floor.sway);
    },
    destroy() {
      sprite.filters = [];
      sprite.destroy();
      filter?.destroy();
      filter = null;
      view = null;
      active = false;
    },
  };
}

/** Binary units in a full turn (the core's angle unit — re-exported for the floor's `turn`). */
export const MODE7_ANGLE_UNITS = ANGLE_UNITS;

/**
 * The **Mode-7 floor** of the `effects` module (plan M3-02, shmup_feat.md §18 "[P2] Mode 7-style
 * effects: scaling/rotation, pseudo-3D floor (per-row affine matrix in shader)", §14 "[P2]
 * pseudo-3D high-speed dimension stage"): one GLSL ES 1.0 program
 * ({@link createMode7Shader}, the sources in `./shaders.ts`) that writes a tiled ground plane
 * under the horizon, driven by the stage's `mode7` data (core `Mode7View`) and the camera.
 *
 * **Since plan M3-02d the program is bound to a `Mesh`** on the `BG_MID` layer and drawn directly.
 * It used to be a Pixi `Filter` over a full-frame `alpha: 0` sprite that existed only to give the
 * filter an area — the render review's **F6**: Pixi pooled a 512 × 256 render target, rendered the
 * invisible sprite into it and ran a filter pass whose shader never reads that input (it samples
 * the floor tile straight out of the atlas). The mesh is one draw call, no pooled target, no
 * wasted clear, and no filter on the `BG_MID` layer at all.
 *
 * {@link createMode7Floor} owns the pieces the renderer needs: the mesh at the bottom of `BG_MID`,
 * the shader, and a per-frame {@link Mode7Floor.sync} that turns the camera position into the
 * plane's origin and axes. The mesh is hidden whenever the camera is outside the floor's
 * `[from, to)` range or the stage has no floor at all, so a stage without one renders exactly as
 * before.
 *
 * **Allocation.** The mesh, the shader and its uniform group are created when a view is bound
 * (load time); a frame only writes numbers, and entering or leaving the floor's range flips one
 * `visible` flag.
 *
 * **Hardware.** Pixi's `MeshGeometry` forces `Uint32Array` indices, so the floor needs WebGL1's
 * `OES_element_index_uint` (Pixi requests it; universal in practice — see `./shaders.ts`
 * {@link EFFECT_MESH_VERTEX}).
 *
 * **Teardown.** The mesh, its geometry and its GL program belong to the floor, not to the scene:
 * `bind(null)` only hides them for the next world, so the renderer's `destroy()` calls
 * {@link Mode7Floor.destroy} explicitly (it did not before M3-02d's test pass, and the floor
 * leaked).
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
  GlProgram,
  Mesh,
  MeshGeometry,
  Shader,
  UniformGroup,
  type Container,
  type TextureSource,
} from 'pixi.js';
import { EFFECT_MESH_VERTEX, MODE7_FRAGMENT } from './shaders.js';

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

/** One Mode-7 mesh and the uniforms a frame writes. */
export interface Mode7Shader {
  /** The mesh the floor is drawn with (a full-frame quad on `BG_MID`). */
  readonly mesh: Mesh<MeshGeometry, Shader>;
  /**
   * Hands the frame's plane to the shader. Never allocates.
   *
   * @param view - The stage's floor.
   * @param originU - The camera's position along the plane's forward axis, in texels.
   * @param originV - Its position along the right axis, in texels.
   */
  apply(view: Mode7View, originU: number, originV: number): void;
  /**
   * Points the shader at a tile of the atlas.
   *
   * @param x - Left column of the tile on its atlas page.
   * @param y - Top row.
   * @param w - Width in pixels.
   * @param h - Height in pixels.
   * @param pageWidth - The atlas page's width.
   * @param pageHeight - The atlas page's height.
   */
  setTile(x: number, y: number, w: number, h: number, pageWidth: number, pageHeight: number): void;
  /** Destroys the mesh, its geometry and its shader. */
  destroy(): void;
}

/**
 * Largest depth one row of the floor may reach, in texels: the row just under the horizon would
 * otherwise divide by nearly zero.
 */
export const MODE7_MAX_SCALE = 4096;

/**
 * Creates the Mode-7 mesh and its shader (load time).
 *
 * @param tile - The atlas page the floor tile lives on (the shader samples it directly).
 * @param width - Frame width in pixels (the quad's size).
 * @param height - Frame height in pixels.
 * @returns The mesh and its uniforms.
 *
 * @example
 * ```ts
 * const mode7 = createMode7Shader(atlas.pages[0], 384, 216);
 * mode7.setTile(0, 0, 32, 32, 1024, 1024);
 * layer.addChildAt(mode7.mesh, 0);
 * ```
 */
export function createMode7Shader(tile: TextureSource, width: number, height: number): Mode7Shader {
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
    vertex: EFFECT_MESH_VERTEX,
    fragment: MODE7_FRAGMENT,
    name: 'shmup-mode7',
  });
  const shader = new Shader({
    glProgram,
    resources: { mode7Uniforms: group, uTile: tile },
  });
  const w = width > 0 ? width : 1;
  const h = height > 0 ? height : 1;
  const geometry = new MeshGeometry({
    positions: new Float32Array([0, 0, w, 0, w, h, 0, h]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
  const mesh = new Mesh({ geometry, shader, label: 'mode7' });
  mesh.visible = false;
  return {
    mesh,
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
    setTile(x, y, w2, h2, pageWidth, pageHeight) {
      const rect = uniforms.uTileRect;
      rect[0] = x / pageWidth;
      rect[1] = y / pageHeight;
      rect[2] = w2 / pageWidth;
      rect[3] = h2 / pageHeight;
    },
    destroy() {
      mesh.destroy();
      geometry.destroy();
      shader.destroy(true);
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
   * Creates the mesh and its shader (default {@link createMode7Shader} on the atlas page; tests
   * in Node, where Pixi cannot probe a WebGL context, pass a fake).
   *
   * @param width - Frame width in pixels.
   * @param height - Frame height in pixels.
   * @returns The mesh and its uniforms.
   */
  readonly createShader?: (width: number, height: number) => Mode7Shader;
}

/** The Mode-7 floor of one renderer. */
export interface Mode7Floor {
  /** The mesh the floor is drawn with, or `null` until a bound world asks for one. */
  readonly view: Container | null;
  /** The shader, or `null` until a bound view asks for one. */
  readonly shader: Mode7Shader | null;
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
   * Updates the floor for one frame: the plane's origin from the camera, the mesh drawn only
   * while the camera is inside `[from, to)`. Never allocates.
   *
   * @param camera - The frame's camera.
   */
  sync(camera: CameraView): void;
  /** Destroys the mesh and the shader. */
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
  const make = options.createShader ?? null;
  let shader: Mode7Shader | null = null;
  let mesh: Container | null = null;
  let view: Mode7View | null = null;
  let active = false;
  return {
    get view(): Container | null {
      return mesh;
    },
    get shader(): Mode7Shader | null {
      return shader;
    },
    get active(): boolean {
      return active;
    },
    bind(next, tile) {
      view = next !== null && next.spriteId >= 0 && tile !== null ? next : null;
      if (view === null) {
        if (mesh !== null) mesh.visible = false;
        active = false;
        return;
      }
      if (shader === null && make !== null) {
        shader = make(width, height);
        mesh = shader.mesh;
        mesh.visible = false;
        options.layer.addChildAt(mesh, 0);
      }
      if (shader !== null && tile !== null) {
        shader.setTile(tile[0], tile[1], tile[2], tile[3], tile[4], tile[5]);
      }
      active = false;
      if (mesh !== null) mesh.visible = false;
    },
    sync(camera) {
      const floor = view;
      if (floor === null || shader === null || mesh === null) return;
      const on = camera.x >= floor.from && camera.x < floor.to;
      if (on !== active) {
        active = on;
        mesh.visible = on;
      }
      if (!on) return;
      shader.apply(floor, camera.x * floor.scroll, camera.y * floor.sway);
    },
    destroy() {
      shader?.destroy();
      shader = null;
      mesh = null;
      view = null;
      active = false;
    },
  };
}

/** Binary units in a full turn (the core's angle unit — re-exported for the floor's `turn`). */
export const MODE7_ANGLE_UNITS = ANGLE_UNITS;

/**
 * The **CRT / scanline pass** of the `effects` module (plan M3-02, shmup_feat.md §18 "[P2] CRT /
 * scanline filter: Off / Light / Full (cap output to 1080p on TV for cost)"): one GLSL ES 1.0
 * program (`CRT_VERTEX` / `CRT_FRAGMENT` in `./shaders.ts`) over the **upscaled** picture of the
 * renderer's second pass — scanlines, an aperture-grille mask and a vignette, each switched by a
 * uniform, so both strengths share one program.
 *
 * **Since plan M3-02d the program is bound to the blit itself** ({@link createCrtBlit}): pass 2
 * draws the frame texture with a `Mesh` whose shader *is* the CRT program, `uScan` / `uMask` /
 * `uVignette` at 0 while the setting is `off`. The render review's **F2** measured what the old
 * shape cost — attached as a `Filter` to the pass-2 container, Pixi pooled a next-power-of-two
 * render target (**2048 × 2048 = 16.8 MB** at 1920 × 1080), drew the upscaled picture into it and
 * then ran a *second* full-screen pass: roughly twice the frame's fragment work and bandwidth,
 * with `light` costing exactly what `full` cost. The blit is one draw call whatever the setting
 * is, so CRT `full` now costs what CRT `off` costs and 16.8 MB of VRAM is never allocated.
 *
 * {@link createCrtPass} manages the pass for the renderer: it owns the node pass 2 draws the frame
 * with ({@link CrtPass.view}) and keeps the scanline pitch equal to the frame's scale on the
 * display (one dark line between two frame rows, whatever the zoom).
 *
 * **The legacy filter path** ({@link createCrtFilter}, a pass created with `mode: 'filter'`) is
 * kept behind the renderer's `screenPass` option: a plain `Sprite` blit with the CRT as a Pixi
 * filter, exactly as M3-02 shipped it — the escape hatch if the mesh path ever misbehaves on a
 * device, and the only path {@link CRT_MAX_HEIGHT} / {@link crtResolution} still cap.
 *
 * **Allocation.** The shader, the mesh and their uniform groups are created with the pass; a frame
 * only writes numbers, and switching the setting writes three uniforms (the filter path copies
 * Pixi's filter list instead).
 *
 * **Hardware.** The blit is a `Mesh`, and Pixi's `MeshGeometry` forces `Uint32Array` indices, so
 * the shipped pass-2 needs WebGL1's `OES_element_index_uint` (Pixi requests it; universal in
 * practice — see `./shaders.ts` {@link EFFECT_MESH_VERTEX}).
 *
 * @module
 */
import { CRT_MAX_HEIGHT, type CrtFilter as CrtSetting } from '@shmup/core';
import {
  Filter,
  GlProgram,
  Mesh,
  MeshGeometry,
  Shader,
  Sprite,
  UniformGroup,
  type Container,
  type Texture,
} from 'pixi.js';
import {
  CRT_FRAGMENT,
  CRT_FULL_MASK,
  CRT_FULL_SCAN,
  CRT_FULL_VIGNETTE,
  CRT_LIGHT_SCAN,
  CRT_VERTEX,
  EFFECT_MESH_VERTEX,
} from './shaders.js';

/** The uniforms the CRT shader reads (see `./shaders.ts`). */
interface CrtUniforms {
  /** Half the output size in pixels (the vignette's centre). */
  uHalf: Float32Array;
  /** Output pixels per scanline band. */
  uLinePitch: number;
  /** Scanline darkening, 0 … 1. */
  uScan: number;
  /** Aperture-mask strength, 0 = none. */
  uMask: number;
  /** Vignette strength, 0 = none. */
  uVignette: number;
}

/** The uniforms only the mesh blit sets (a filter gets them from Pixi's filter system). */
interface CrtBlitUniforms extends CrtUniforms {
  /** Half-texel UV bounds of the frame texture (`x0, y0, x1, y1`). */
  uInputClamp: Float32Array;
}

/** How strong each part of the look is, per {@link CrtSetting}. */
export interface CrtLook {
  /** Scanline darkening, 0 … 1. */
  readonly scan: number;
  /** Aperture-mask strength, 0 = no mask. */
  readonly mask: number;
  /** Vignette strength, 0 = no vignette. */
  readonly vignette: number;
}

/**
 * The look of each CRT setting (`core/config` `CRT_FILTERS` order): `off` (nothing), `light`
 * (scanlines only — the cheap TV-friendly setting) and `full` (scanlines, the aperture mask and a
 * vignette).
 */
export const CRT_LOOKS: readonly CrtLook[] = Object.freeze([
  Object.freeze({ scan: 0, mask: 0, vignette: 0 }),
  Object.freeze({ scan: CRT_LIGHT_SCAN, mask: 0, vignette: 0 }),
  Object.freeze({ scan: CRT_FULL_SCAN, mask: CRT_FULL_MASK, vignette: CRT_FULL_VIGNETTE }),
]);

/** Smallest scanline pitch in output pixels (below it the lines would eat half the picture). */
export const CRT_MIN_PITCH = 2;

/** The index of a setting in {@link CRT_LOOKS} (`off` for anything unknown). */
function lookIndex(setting: CrtSetting): number {
  return setting === 'light' ? 1 : setting === 'full' ? 2 : 0;
}

/**
 * Writes one frame's CRT uniforms (shared by the blit and the legacy filter).
 *
 * @param uniforms - The uniform group's values.
 * @param look - The strengths ({@link CRT_LOOKS}).
 * @param pitch - Output pixels per scanline band.
 * @param centreX - Display column the vignette is centred on.
 * @param centreY - Display row it is centred on.
 * @param halfWidth - Half the picture's width in output pixels.
 * @param halfHeight - Half its height.
 */
function writeLook(
  uniforms: CrtUniforms,
  look: CrtLook,
  pitch: number,
  centreX: number,
  centreY: number,
  halfWidth: number,
  halfHeight: number,
): void {
  uniforms.uScan = look.scan;
  uniforms.uMask = look.mask;
  uniforms.uVignette = look.vignette;
  uniforms.uLinePitch = pitch >= CRT_MIN_PITCH ? pitch : CRT_MIN_PITCH;
  uniforms.uHalf[0] = centreX;
  uniforms.uHalf[1] = centreY;
  uniforms.uHalf[2] = halfWidth > 0 ? halfWidth : 1;
  uniforms.uHalf[3] = halfHeight > 0 ? halfHeight : 1;
}

/** One CRT filter and the uniforms a frame writes (the legacy pass-2 path — see the module docs). */
export interface CrtFilterHandle {
  /** The Pixi filter (GLSL ES 1.0; WebGL only). */
  readonly filter: Filter;
  /**
   * Hands the setting and the viewport to the shader. Never allocates.
   *
   * @param look - The strengths ({@link CRT_LOOKS}).
   * @param pitch - Output pixels per scanline band (the frame's scale on the display).
   * @param width - Output width in pixels.
   * @param height - Output height in pixels.
   */
  apply(look: CrtLook, pitch: number, width: number, height: number): void;
  /**
   * Caps the pass's resolution so it never runs at more than {@link CRT_MAX_HEIGHT} rows.
   *
   * @param height - The display's height in pixels.
   */
  setDisplayHeight(height: number): void;
  /** Destroys the filter. */
  destroy(): void;
}

/**
 * Creates the CRT **filter** — the legacy pass-2 path of plan M3-02, kept behind the renderer's
 * `screenPass: 'filter'` option (load time).
 *
 * @returns The filter.
 *
 * @example
 * ```ts
 * const crt = createCrtFilter();
 * crt.apply(CRT_LOOKS[2], 5, 1920, 1080);
 * screen.filters = [crt.filter];
 * ```
 */
export function createCrtFilter(): CrtFilterHandle {
  const group = new UniformGroup({
    uHalf: { value: new Float32Array([1, 1, 1, 1]), type: 'vec4<f32>' },
    uLinePitch: { value: CRT_MIN_PITCH, type: 'f32' },
    uScan: { value: 0, type: 'f32' },
    uMask: { value: 0, type: 'f32' },
    uVignette: { value: 0, type: 'f32' },
  });
  const uniforms = group.uniforms as unknown as CrtUniforms;
  const glProgram = GlProgram.from({
    vertex: CRT_VERTEX,
    fragment: CRT_FRAGMENT,
    name: 'shmup-crt',
  });
  const filter = new Filter({ glProgram, resources: { crtUniforms: group }, antialias: 'off' });
  return {
    filter,
    apply(look, pitch, width, height) {
      // The filter runs over the whole pass, whose origin is the display's: the picture's centre
      // is its own half-size (it is letterboxed only when an aspect mode is on).
      writeLook(uniforms, look, pitch, width / 2, height / 2, width / 2, height / 2);
    },
    setDisplayHeight(height) {
      filter.resolution = crtResolution(height);
    },
    destroy() {
      filter.destroy();
    },
  };
}

/**
 * The resolution the legacy CRT **filter** runs at on a display of `height` rows (shmup_feat.md
 * §18 "cap output to 1080p on TV for cost"): 1 up to {@link CRT_MAX_HEIGHT}, then the fraction
 * that keeps the pass at that many rows.
 *
 * @remarks
 * The M7's web viewport *is* 1920 × 1080, so this returns 1 there and the cap buys nothing (the
 * render review's **F2**). Since M3-02d the shipped path is {@link createCrtBlit}, which has no
 * pass to cap; this stays for the `screenPass: 'filter'` escape hatch and for a 4K web canvas.
 *
 * @param height - Display height in pixels.
 * @returns The filter resolution, `(0, 1]`.
 *
 * @example
 * ```ts
 * crtResolution(1080); // → 1
 * crtResolution(2160); // → 0.5 (a 4K TV pays for a 1080p pass)
 * ```
 */
export function crtResolution(height: number): number {
  if (!(height > CRT_MAX_HEIGHT)) return 1;
  return CRT_MAX_HEIGHT / height;
}

/**
 * The pass-2 **blit**: the mesh that draws the frame texture on the display, with the CRT program
 * bound to it (plan M3-02d).
 */
export interface CrtBlitHandle {
  /** The mesh pass 2 draws (its local quad is the frame's own `width × height`). */
  readonly mesh: Mesh<MeshGeometry, Shader>;
  /**
   * Hands the setting and the picture's place on the display to the shader. Never allocates.
   *
   * @param look - The strengths ({@link CRT_LOOKS}); `CRT_LOOKS[0]` is a plain upscale.
   * @param pitch - Output pixels per scanline band (the frame's scale on the display).
   * @param x - Left column of the picture on the display.
   * @param y - Top row of the picture on the display.
   * @param width - The picture's width in output pixels.
   * @param height - Its height in output pixels.
   */
  apply(look: CrtLook, pitch: number, x: number, y: number, width: number, height: number): void;
  /** Destroys the mesh, its geometry and its shader. */
  destroy(): void;
}

/**
 * Creates the pass-2 blit (load time): a quad mesh over the frame texture whose shader is the CRT
 * program, so the CRT look costs one draw call and no render target (plan M3-02d, review **F2**).
 *
 * @param frame - The renderer's frame texture (pass 1's target).
 * @param width - The frame's width in pixels (the quad's local size).
 * @param height - The frame's height in pixels.
 * @returns The blit.
 *
 * @example
 * ```ts
 * const blit = createCrtBlit(frameTexture, 384, 216);
 * screen.addChild(blit.mesh);
 * blit.mesh.position.set(viewport.x, viewport.y);
 * blit.mesh.scale.set(viewport.scaleX, viewport.scaleY);
 * blit.apply(CRT_LOOKS[2], viewport.scale, viewport.x, viewport.y, viewport.width, viewport.height);
 * ```
 */
export function createCrtBlit(frame: Texture, width: number, height: number): CrtBlitHandle {
  const w = width > 0 ? width : 1;
  const h = height > 0 ? height : 1;
  const group = new UniformGroup({
    uHalf: { value: new Float32Array([1, 1, 1, 1]), type: 'vec4<f32>' },
    uLinePitch: { value: CRT_MIN_PITCH, type: 'f32' },
    uScan: { value: 0, type: 'f32' },
    uMask: { value: 0, type: 'f32' },
    uVignette: { value: 0, type: 'f32' },
    // The frame texture fills its source, so the clamp is its own half-texel inset.
    uInputClamp: {
      value: new Float32Array([0.5 / w, 0.5 / h, (w - 0.5) / w, (h - 0.5) / h]),
      type: 'vec4<f32>',
    },
  });
  const uniforms = group.uniforms as unknown as CrtBlitUniforms;
  const glProgram = GlProgram.from({
    vertex: EFFECT_MESH_VERTEX,
    fragment: CRT_FRAGMENT,
    name: 'shmup-crt-blit',
  });
  const shader = new Shader({
    glProgram,
    resources: { crtUniforms: group, uTexture: frame.source },
  });
  const geometry = new MeshGeometry({
    positions: new Float32Array([0, 0, w, 0, w, h, 0, h]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
  const mesh = new Mesh({ geometry, shader, texture: frame, label: 'crt-blit' });
  return {
    mesh,
    apply(look, pitch, x, y, pictureWidth, pictureHeight) {
      writeLook(
        uniforms,
        look,
        pitch,
        x + pictureWidth / 2,
        y + pictureHeight / 2,
        pictureWidth / 2,
        pictureHeight / 2,
      );
    },
    destroy() {
      mesh.destroy();
      geometry.destroy();
      shader.destroy(true);
    },
  };
}

/** How the renderer's second pass draws the frame (plan M3-02d). */
export type ScreenPassMode = 'blit' | 'filter';

/** Options of {@link createCrtPass}. */
export interface CrtPassOptions {
  /** The pass-2 container the view is added to (and the legacy filter runs over). */
  readonly screen: Container;
  /** The frame texture pass 1 renders into (what the second pass blits). */
  readonly frame: Texture;
  /** The frame's width in pixels (the blit quad's local size). */
  readonly width: number;
  /** The frame's height in pixels. */
  readonly height: number;
  /** `blit` (default, plan M3-02d) or the legacy `filter` path (see the module docs). */
  readonly mode?: ScreenPassMode;
  /**
   * Creates the blit (default {@link createCrtBlit}; tests in Node, where Pixi cannot probe a
   * WebGL context, pass a fake).
   *
   * @param frame - The frame texture.
   * @param width - The frame's width.
   * @param height - The frame's height.
   * @returns The blit.
   */
  readonly createBlit?: (frame: Texture, width: number, height: number) => CrtBlitHandle;
  /**
   * Creates the legacy filter (default {@link createCrtFilter}; only used with `mode: 'filter'`,
   * and faked by tests in Node).
   *
   * @returns The filter.
   */
  readonly createFilter?: () => CrtFilterHandle;
}

/** The CRT pass of one renderer. */
export interface CrtPass {
  /** How the second pass draws the frame. */
  readonly mode: ScreenPassMode;
  /** The node the second pass draws the frame with (the blit mesh, or the legacy sprite). */
  readonly view: Container;
  /** The setting in use (`core/config` `CRT_FILTERS`). */
  readonly setting: CrtSetting;
  /** Whether the CRT look is on (in `filter` mode, whether the filter is attached). */
  readonly active: boolean;
  /** The blit, or `null` in `filter` mode. */
  readonly blit: CrtBlitHandle | null;
  /** The legacy filter, or `null` in `blit` mode (and until the setting first leaves `off`). */
  readonly filter: CrtFilterHandle | null;
  /**
   * Switches the setting (a display option — a cold path; in `blit` mode it writes three
   * uniforms and allocates nothing).
   *
   * @param setting - One of `core/config` `CRT_FILTERS`.
   */
  setSetting(setting: CrtSetting): void;
  /**
   * The viewport changed: the picture is re-placed and the scanline pitch and vignette follow it.
   *
   * @param scale - The frame's scale on the display (`Viewport.scale`).
   * @param x - Left column of the picture on the display.
   * @param y - Top row of the picture.
   * @param width - The picture's width in pixels.
   * @param height - Its height in pixels.
   * @param scaleX - The frame's horizontal scale (`Viewport.scaleX`).
   * @param scaleY - Its vertical scale.
   * @param displayHeight - The whole display's height in pixels (the legacy path's cap).
   */
  setViewport(
    scale: number,
    x: number,
    y: number,
    width: number,
    height: number,
    scaleX: number,
    scaleY: number,
    displayHeight: number,
  ): void;
  /** Destroys the view, the blit and the filter. */
  destroy(): void;
}

/**
 * Creates the CRT pass of a renderer (load time).
 *
 * @param options - See {@link CrtPassOptions}.
 * @returns The pass, with its {@link CrtPass.view} already added to the screen container.
 *
 * @example
 * ```ts
 * const crt = createCrtPass({ screen, frame: frameTexture, width: 384, height: 216 });
 * crt.setViewport(5, 0, 0, 1920, 1080, 5, 5, 1080);
 * crt.setSetting('full');
 * ```
 */
export function createCrtPass(options: CrtPassOptions): CrtPass {
  const mode: ScreenPassMode = options.mode ?? 'blit';
  const screen = options.screen;
  const blit =
    mode === 'blit'
      ? (options.createBlit ?? createCrtBlit)(options.frame, options.width, options.height)
      : null;
  const legacySprite = blit === null ? new Sprite(options.frame) : null;
  const view: Container = blit !== null ? blit.mesh : (legacySprite as Sprite);
  view.label = 'frame';
  screen.addChild(view);
  const makeFilter = options.createFilter ?? createCrtFilter;
  let filter: CrtFilterHandle | null = null;
  let setting: CrtSetting = 'off';
  let active = false;
  let scale = 1;
  let x = 0;
  let y = 0;
  let width = 1;
  let height = 1;
  let displayHeight = 1;
  /** Re-applies the uniforms (and, in `filter` mode, re-attaches the filter) after a change. */
  const refresh = (): void => {
    const index = lookIndex(setting);
    const on = index > 0;
    const pitch = Math.max(CRT_MIN_PITCH, Math.round(scale));
    if (blit !== null) {
      active = on;
      blit.apply(CRT_LOOKS[index], pitch, x, y, width, height);
      return;
    }
    if (on && filter === null) filter = makeFilter();
    if (filter !== null) {
      filter.apply(CRT_LOOKS[index], pitch, width, height);
      filter.setDisplayHeight(displayHeight);
    }
    if (on !== active) {
      active = on;
      screen.filters = on && filter !== null ? [filter.filter] : [];
    }
  };
  return {
    mode,
    view,
    blit,
    get setting(): CrtSetting {
      return setting;
    },
    get active(): boolean {
      return active;
    },
    get filter(): CrtFilterHandle | null {
      return filter;
    },
    setSetting(next) {
      if (next === setting) return;
      setting = next;
      refresh();
    },
    setViewport(nextScale, nextX, nextY, nextWidth, nextHeight, scaleX, scaleY, nextDisplayHeight) {
      scale = nextScale;
      x = nextX;
      y = nextY;
      width = nextWidth;
      height = nextHeight;
      displayHeight = nextDisplayHeight;
      view.position.set(nextX, nextY);
      view.scale.set(scaleX, scaleY);
      if (blit !== null || active || filter !== null) refresh();
    },
    destroy() {
      screen.filters = [];
      blit?.destroy();
      legacySprite?.destroy();
      filter?.destroy();
      filter = null;
      active = false;
    },
  };
}

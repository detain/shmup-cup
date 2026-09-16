/**
 * The **mesh vertex shader** of plan M3-02d (`EFFECT_MESH_VERTEX`), checked against PixiJS's own
 * sources rather than against a copy of them in a comment.
 *
 * Since M3-02d the CRT look and the Mode-7 floor are drawn by a `Mesh` whose program *is* the
 * effect's, so this one vertex shader stands where Pixi's filter vertex shader used to stand. It
 * has to agree with Pixi on three things, and a disagreement would not fail a structural test —
 * it would *shimmer on a TV* (decision D19: integer-scaled pixel art):
 *
 * 1. the **uniform names** Pixi's WebGL1 mesh path fills in (`globalUniformsBitGl` for the
 *    renderer's globals, `MeshPipe`'s local uniform group for the mesh's own) — a uniform we
 *    declare under any other name is silently left at zero;
 * 2. the **attribute names** `MeshGeometry` binds (`aPosition` / `aUV`);
 * 3. the **pixel snapping**: `uRound` reproduces Pixi's `roundPixels`, character for character,
 *    over the same quantity (clip space, against `uResolution`) — half a pixel out and the blit
 *    lands between the pixels the `Sprite` it replaced covered.
 *
 * It also passes the repo's GLSL ES 1.0 syntax check (`shaders.test.ts` covers every other source
 * but was never given this one) and keeps the two varyings a filter's vertex shader produced, so
 * `CRT_FRAGMENT` and `MODE7_FRAGMENT` are shared by the mesh and the legacy filter paths.
 */
import {
  MeshGeometry,
  MeshPipe,
  globalUniformsBitGl,
  roundPixelsBitGl,
  type Renderer,
} from 'pixi.js';
import { describe, expect, it } from 'vitest';
import {
  CRT_FRAGMENT,
  CRT_VERTEX,
  EFFECT_MESH_VERTEX,
  MODE7_FRAGMENT,
} from '../../src/effects/shaders.js';
import { checkGlslEs100 } from './glsl-es100.js';

/**
 * Collapses every run of whitespace, so a comparison is about the code and not the indentation.
 *
 * @param source - GLSL source.
 * @returns The source on one line.
 */
function flat(source: string): string {
  return source.replace(/\s+/g, ' ').trim();
}

/**
 * The uniform names a GLSL snippet declares.
 *
 * @param source - GLSL source.
 * @returns The names, in declaration order.
 */
function uniformNames(source: string): string[] {
  const names: string[] = [];
  const pattern = /uniform\s+\w+\s+(\w+)\s*;/g;
  let match = pattern.exec(source);
  while (match !== null) {
    names.push(match[1]);
    match = pattern.exec(source);
  }
  return names;
}

/**
 * The local uniforms PixiJS's `MeshPipe` sets for every mesh it draws.
 *
 * @returns Their names (`uTransformMatrix`, `uColor`, `uRound` in pixi.js 8.20.1).
 *
 * @remarks
 * The constructor only builds its uniform group and calls `adaptor.init()`, so a stub adaptor and
 * no renderer are enough — nothing here touches WebGL.
 */
function meshPipeUniforms(): string[] {
  const pipe = new MeshPipe(
    null as unknown as Renderer,
    {
      init: () => {},
    } as unknown as ConstructorParameters<typeof MeshPipe>[1],
  );
  return Object.keys(pipe.localUniforms.uniformStructures);
}

describe('render-pixi/effects the mesh vertex shader (M3-02d)', () => {
  it('passes the GLSL ES 1.0 syntax check, bare and with the Pixi preamble', () => {
    expect(checkGlslEs100(EFFECT_MESH_VERTEX, 'vertex')).toEqual([]);
    const preamble = `#define SHADER_NAME shmup-crt-blit
#ifdef GL_ES
#define in varying
#define finalColor gl_FragColor
#define texture texture2D
#endif
`;
    expect(checkGlslEs100(preamble + EFFECT_MESH_VERTEX, 'vertex')).toEqual([]);
  });

  it('declares only uniforms PixiJS fills in, and every one it needs', () => {
    const globals = uniformNames(globalUniformsBitGl.vertex.header);
    const locals = meshPipeUniforms();
    // What pixi.js 8.20.1 supplies to a WebGL1 mesh with its own shader.
    expect(globals).toEqual([
      'uProjectionMatrix',
      'uWorldTransformMatrix',
      'uWorldColorAlpha',
      'uResolution',
    ]);
    expect(locals).toEqual(['uTransformMatrix', 'uColor', 'uRound']);
    const supplied = new Set([...globals, ...locals]);
    const declared = uniformNames(EFFECT_MESH_VERTEX);
    // Not a subset check that passes vacuously: these five are the ones the shader reads.
    expect(declared).toEqual([
      'uProjectionMatrix',
      'uWorldTransformMatrix',
      'uTransformMatrix',
      'uResolution',
      'uRound',
    ]);
    for (const name of declared) expect(supplied.has(name)).toBe(true);
  });

  it('reads the attributes MeshGeometry binds', () => {
    const geometry = new MeshGeometry({
      positions: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    expect(Object.keys(geometry.attributes).sort()).toEqual(['aPosition', 'aUV']);
    for (const name of ['aPosition', 'aUV']) {
      expect(EFFECT_MESH_VERTEX).toMatch(new RegExp(`attribute vec2 ${name};`));
    }
    geometry.destroy();
  });

  it('snaps pixels with PixiJS’s own roundPixels expression, character for character', () => {
    // Pixi's GLSL helper, as pixi.js 8.20.1 ships it.
    const body = /return\s+(.+);/.exec(flat(roundPixelsBitGl.vertex.header));
    expect(body).not.toBeNull();
    const pixi = (body as RegExpExecArray)[1];
    expect(pixi).toBe(
      '(floor(((position * 0.5 + 0.5) * targetSize) + 0.5) / targetSize) * 2.0 - 1.0',
    );
    // The same expression with this shader's names: the clip position, against the target's size.
    const ours = pixi.replace(/\bposition\b/g, 'clip').replace(/\btargetSize\b/g, 'uResolution');
    expect(flat(EFFECT_MESH_VERTEX)).toContain(`clip = ${ours};`);
    // Guarded by `uRound`, which MeshPipe sets to `renderer._roundPixels | mesh._roundPixels` —
    // exactly 0 or 1, as Pixi's own `localUniformBitGl` tests it.
    expect(flat(EFFECT_MESH_VERTEX)).toContain('if (uRound == 1.0) {');
  });

  it('reaches clip space the way PixiJS’s default mesh program does', () => {
    // Pixi: `uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(position, 1.0)`
    // (`defaultProgramTemplate`, with `modelMatrix = uTransformMatrix` from `localUniformBitGl`).
    // This shader groups the same product the other way — matrix multiplication is associative —
    // so it can hand the fragment shader the position in the render target on the way through.
    const flattened = flat(EFFECT_MESH_VERTEX);
    expect(flattened).toContain(
      'vec3 world = uWorldTransformMatrix * uTransformMatrix * vec3(aPosition, 1.0);',
    );
    expect(flattened).toContain('vec2 clip = (uProjectionMatrix * world).xy;');
    expect(flattened).toContain('gl_Position = vec4(clip, 0.0, 1.0);');
  });

  it('produces the varyings both fragment shaders read, as the filter path did', () => {
    // `vScreen` is the position in the render target (display pixels for the blit, frame pixels
    // for the Mode-7 mesh) — what `uOutputFrame` gave the filter's vertex shader.
    expect(flat(EFFECT_MESH_VERTEX)).toContain('vScreen = world.xy;');
    expect(flat(EFFECT_MESH_VERTEX)).toContain('vTextureCoord = aUV;');
    for (const varying of ['vTextureCoord', 'vScreen']) {
      expect(EFFECT_MESH_VERTEX).toContain(`varying vec2 ${varying};`);
      // Unchanged in both fragment shaders, which is why they are shared by both paths.
      expect(CRT_FRAGMENT).toContain(`varying vec2 ${varying};`);
      expect(MODE7_FRAGMENT).toContain(`varying vec2 ${varying};`);
      expect(CRT_VERTEX).toContain(`varying vec2 ${varying};`);
    }
  });

  it('has no trigonometry, no texture sampling and no loop (one cheap vertex)', () => {
    expect(EFFECT_MESH_VERTEX).not.toMatch(/\b(sin|cos|tan|atan|asin|acos|pow|exp|log)\s*\(/);
    expect(EFFECT_MESH_VERTEX).not.toContain('sampler2D');
    expect(EFFECT_MESH_VERTEX).not.toMatch(/\b(for|while)\b/);
  });
});

/**
 * The **shader sources** of the `effects` module — four **GLSL ES 1.0** (WebGL1) vertex shaders and
 * three fragment shaders, plain strings a Pixi `Filter` or a Pixi `Shader` on a `Mesh` is built
 * from:
 *
 * | Program | Step | Runs over | Built by |
 * |---|---|---|---|
 * | `LAYER_EFFECT_*` | M2-08 | one world layer | `./layer-effects.ts` `createLayerEffectFilter` |
 * | `MODE7_*` | M3-02 / M3-02d | a full-frame **mesh** on `BG_MID` | `./mode7.ts` `createMode7Shader` |
 * | `CRT_*` | M3-02 / M3-02d | the pass-2 blit **mesh** | `./crt.ts` `createCrtBlit` |
 * | `CRT_*` (legacy) | M3-02 | the upscaled second pass, as a filter | `./crt.ts` `createCrtFilter` |
 *
 * Since **M3-02d** the Mode-7 floor and the CRT look are drawn by a `Mesh` with the program bound
 * straight to it ({@link EFFECT_MESH_VERTEX}) instead of a Pixi `Filter` over a pooled render
 * target: same fragment sources, one draw call, no second full-screen pass and no pooled target
 * (the render review's **F2** / **F6**). The two fragment shaders are therefore shared by both
 * paths — only the vertex shader differs, because a filter's quad and a mesh's quad reach clip
 * space by different uniforms.
 *
 * The **layer effect** (plan M2-08) does the per-scanline raster offset (wavy water, heat haze,
 * line-band parallax floors) and the palette cycle (water, lava, glowing cores) in one pass, so a
 * layer with both costs one filter.
 *
 * The **Mode-7 floor** (plan M3-02, shmup_feat.md §18) evaluates mode 7's per-row affine matrix
 * per pixel: the fragment shader turns the row's distance below the horizon into the plane's
 * depth, walks the plane's origin along the **turned axes** the host passes in (`uRight` /
 * `uForward`, from the core's angle tables — the shader has no trigonometry) and samples the floor
 * tile straight out of the atlas with `fract`, fading it into the fog colour with depth. The scale
 * is clamped (`./mode7.ts` `MODE7_MAX_SCALE`) so the horizon row cannot divide by zero, and
 * angles are the project's 1024 binary units (`MODE7_ANGLE_UNITS`).
 *
 * The **CRT / scanline filter** (plan M3-02, shmup_feat.md §18) is one program for both strengths:
 * `uScan`, `uMask` and `uVignette` switch the scanlines, the aperture-grille mask and the vignette
 * (`./crt.ts` `CRT_LOOKS` — scanlines at `light`, all three at `full`), and it only ever
 * multiplies the colour **down**, so the flash overlay's limiter still holds.
 *
 * Plain strings with no imports, so tests and the browser smoke test can compile them without
 * loading Pixi. Pixi (v8) keeps a source without `#version 300 es` as GLSL ES 1.0 and only adds
 * its `#define SHADER_NAME` line and WebGL1 compatibility macros (`in` → `varying`, `texture` →
 * `texture2D`), none of which these sources use.
 *
 * **Uniforms.** Pixi's filter system fills `uInputSize`, `uInputClamp`, `uOutputFrame`,
 * `uOutputTexture` and the input `uTexture` (for a mesh, {@link EFFECT_MESH_VERTEX} reads Pixi's
 * global and mesh-pipe uniforms instead and the host supplies `uTexture` / `uInputClamp` itself);
 * the layer effect sets:
 *
 * | Uniform | Meaning |
 * |---|---|
 * | `uRasterTable` | the offset table: a 1 × `uRows` RGBA8 texture, one texel per frame row (see `encodeRasterTable`) |
 * | `uRows` | its height (216) |
 * | `uRaster` | 1 when the table applies, 0 to skip the lookup |
 * | `uRowShift` | the layer's vertical screen offset (screen shake), subtracted from the row |
 * | `uCycleCount` | colours cycled (0 … 8) |
 * | `uCycleFrom[8]`, `uCycleTo[8]` | pixel colour `uCycleFrom[i]` is drawn as `uCycleTo[i]` (RGB 0 … 1) |
 *
 * **Precision.** Every value the fragment shader decodes stays below 2048 in magnitude and is
 * rebuilt from whole bytes (`floor(v · 255 + 0.5)`), so `mediump` (≥ 10-bit mantissa on the TV's
 * GPU) decodes it exactly; `highp` is used where the GPU offers it.
 *
 * @module
 */

/** Rows of the frame the offset table covers (the 384×216 frame's height). */
export const LAYER_EFFECT_ROWS = 216;

/** Most colours one layer's palette cycles may use (the shader's uniform arrays). */
export const LAYER_EFFECT_MAX_COLORS = 8;

/**
 * Vertex shader of the layer effect: Pixi's default filter vertex (the quad over the filter area),
 * plus `vScreen` — the fragment's pixel position in the render target (the 384×216 frame), whose
 * `y` picks the offset table row.
 */
export const LAYER_EFFECT_VERTEX = `attribute vec2 aPosition;
varying vec2 vTextureCoord;
varying vec2 vScreen;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

void main(void)
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    vScreen = position;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;

/**
 * Fragment shader of the layer effect.
 *
 * @remarks
 * Raster: the row `floor(vScreen.y − uRowShift)` reads its texel of `uRasterTable`: R, G = the
 * signed whole-pixel offset (`(R − 128) · 256 + G`), B, A = the wrap period (`B · 256 + A`, 0 =
 * none). The layer is sampled `offset` pixels to the right (so a growing offset scrolls the art to
 * the left); with a wrap period a sample past the layer's right edge moves back — and one before
 * its left edge forward — by whole periods (seamless for art that repeats every `wrap` pixels),
 * then the coordinate is clamped to the input. Palette: a sampled pixel (un-premultiplied) within
 * 1.5/255 of `uCycleFrom[i]` takes `uCycleTo[i]`, keeping its alpha.
 */
export const LAYER_EFFECT_FRAGMENT = `precision mediump float;
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#endif

varying vec2 vTextureCoord;
varying vec2 vScreen;

uniform sampler2D uTexture;
uniform sampler2D uRasterTable;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec4 uOutputFrame;
uniform float uRows;
uniform float uRaster;
uniform float uRowShift;
uniform float uCycleCount;
uniform vec3 uCycleFrom[8];
uniform vec3 uCycleTo[8];

float byteOf(float channel)
{
    return floor(channel * 255.0 + 0.5);
}

void main(void)
{
    vec2 coord = vTextureCoord;
    if (uRaster > 0.5) {
        float row = floor(vScreen.y - uRowShift);
        if (row >= 0.0 && row < uRows) {
            vec4 entry = texture2D(uRasterTable, vec2(0.5, (row + 0.5) / uRows));
            float offset = (byteOf(entry.r) - 128.0) * 256.0 + byteOf(entry.g);
            float period = byteOf(entry.b) * 256.0 + byteOf(entry.a);
            float width = uOutputFrame.z;
            float x = coord.x * uInputSize.x + offset;
            if (period > 0.5) {
                if (x >= width) {
                    x -= period * (floor((x - width) / period) + 1.0);
                }
                if (x < 0.0) {
                    x += period * (floor(-x / period) + 1.0);
                }
            }
            coord.x = x * uInputSize.z;
        }
    }
    coord = clamp(coord, uInputClamp.xy, uInputClamp.zw);
    vec4 color = texture2D(uTexture, coord);
    if (uCycleCount > 0.5 && color.a > 0.0) {
        vec3 rgb = color.rgb / color.a;
        for (int i = 0; i < 8; i++) {
            if (float(i) >= uCycleCount) {
                break;
            }
            vec3 d = abs(rgb - uCycleFrom[i]);
            if (max(d.r, max(d.g, d.b)) < 0.0059) {
                color.rgb = uCycleTo[i] * color.a;
                break;
            }
        }
    }
    gl_FragColor = color;
}
`;

// --------------------------------------------------- the mesh vertex shader (plan M3-02d)

/**
 * Vertex shader of the **full-screen effect meshes** (plan M3-02d, the render review's **F2** /
 * **F6**): the mesh counterpart of {@link LAYER_EFFECT_VERTEX}.
 *
 * @remarks
 * A Pixi *filter* is handed `uInputSize` / `uOutputFrame` / `uOutputTexture` and draws a quad over
 * the filter's area; a Pixi *mesh* is handed the renderer's global uniforms (`uProjectionMatrix`,
 * `uWorldTransformMatrix`, `uResolution`) and the mesh pipe's local ones (`uTransformMatrix`,
 * `uRound`). This shader turns the second into the first's two varyings, so
 * {@link MODE7_FRAGMENT} and {@link CRT_FRAGMENT} are unchanged between the two paths:
 *
 * - `vScreen` — the vertex's position in the render target the mesh is being drawn into (frame
 *   pixels for the Mode-7 floor on `BG_MID`, display pixels for the pass-2 blit), which is what
 *   `uOutputFrame` gave the filter;
 * - `vTextureCoord` — the mesh's own `aUV` (the quad is built with the texture's own `0 … 1`
 *   coordinates, so a `RenderTexture` reads the same way a `Sprite` would read it).
 *
 * `uRound` reproduces Pixi's own pixel snapping (the renderer is created with `roundPixels`), so
 * the blit lands on exactly the pixels a `Sprite` would have covered.
 *
 * **It brings a hardware dependency with it.** A mesh needs a `MeshGeometry`, and Pixi builds that
 * geometry's index buffer as a `Uint32Array` whatever the quad's four vertices would need — so
 * both effect meshes rely on WebGL1's **`OES_element_index_uint`**. Pixi requests the extension
 * when it creates the context and it is effectively universal on anything of the M7's generation
 * (Mali-G51 has it), but since M3-02d it is on the path *every* frame takes rather than only a
 * stage with an effect: a context without it would draw a black picture, not a picture without a
 * CRT look. `crt-blit.test.ts` / `mode7-mesh.test.ts` pin the index type and
 * `test/e2e/mode7.spec.ts` asserts a real WebGL1 context offers the extension.
 */
export const EFFECT_MESH_VERTEX = `attribute vec2 aPosition;
attribute vec2 aUV;

varying vec2 vTextureCoord;
varying vec2 vScreen;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec2 uResolution;
uniform float uRound;

void main(void)
{
    vec3 world = uWorldTransformMatrix * uTransformMatrix * vec3(aPosition, 1.0);
    vScreen = world.xy;
    vec2 clip = (uProjectionMatrix * world).xy;
    if (uRound == 1.0) {
        clip = (floor(((clip * 0.5 + 0.5) * uResolution) + 0.5) / uResolution) * 2.0 - 1.0;
    }
    gl_Position = vec4(clip, 0.0, 1.0);
    vTextureCoord = aUV;
}
`;

// ------------------------------------------------------------------ Mode 7 (plan M3-02)

/**
 * Vertex shader of the **Mode-7 floor** (plan M3-02, shmup_feat.md §18 "[P2] Mode 7-style effects:
 * scaling/rotation, pseudo-3D floor (per-row affine matrix in shader)"): Pixi's default filter
 * quad plus `vScreen`, the fragment's pixel position in the 384×216 frame — the row is what the
 * per-row affine transform is built from.
 */
export const MODE7_VERTEX = LAYER_EFFECT_VERTEX;

/**
 * Fragment shader of the Mode-7 floor.
 *
 * @remarks
 * The **per-row affine matrix** of the SNES's mode 7, evaluated per pixel: a row `y` below the
 * horizon sees the ground plane at depth `z = uHeight / (y − uHorizon)`, so its scale is `z`; the
 * texel under the pixel is
 *
 * ```
 * u = uOriginU + z · (uRight.x · sx + uForward.x)
 * v = uOriginV + z · (uRight.y · sx + uForward.y)
 * ```
 *
 * with `sx = (x − uCentre) / uHeight`. `uRight` / `uForward` are the plane's rotated axes (the
 * host passes the turned unit vectors — the shader needs no trigonometry), `uOrigin` the camera's
 * position on the plane in texels. The texel is wrapped into the tile
 * (`fract`) and read from the atlas rectangle `uTile` (origin `xy`, size `zw`, in atlas UV), so no
 * separate floor texture is needed. Distance fades the colour towards `uFog` over
 * `uFogDepth` texels, and rows above the horizon (or past `uBottom`) are left transparent — the
 * parallax sky shows through. The filter's own input is not read: the pass writes the floor.
 *
 * The scale `z` is clamped to `uMaxScale`, so a row on the horizon cannot produce an infinite
 * coordinate (a `NaN` texel on some drivers).
 */
export const MODE7_FRAGMENT = `precision mediump float;
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#endif

varying vec2 vTextureCoord;
varying vec2 vScreen;

uniform sampler2D uTexture;
uniform sampler2D uTile;
uniform vec4 uTileRect;
uniform vec2 uRight;
uniform vec2 uForward;
uniform vec2 uOrigin;
uniform vec3 uFog;
uniform float uHorizon;
uniform float uBottom;
uniform float uCentre;
uniform float uHeight;
uniform float uFogDepth;
uniform float uMaxScale;
uniform float uAlpha;

void main(void)
{
    float row = floor(vScreen.y) + 0.5;
    if (row <= uHorizon || row > uBottom) {
        gl_FragColor = vec4(0.0);
        return;
    }
    float depth = row - uHorizon;
    float z = uHeight / depth;
    z = min(z, uMaxScale);
    float sx = (floor(vScreen.x) + 0.5 - uCentre) / uHeight;
    vec2 plane = uOrigin + z * (uRight * sx + uForward);
    vec2 uv = uTileRect.xy + fract(plane) * uTileRect.zw;
    vec4 color = texture2D(uTile, uv);
    float fog = clamp(z / uFogDepth, 0.0, 1.0);
    color.rgb = mix(color.rgb, uFog * color.a, fog);
    gl_FragColor = color * uAlpha;
}
`;

// ------------------------------------------------------------------ CRT (plan M3-02)

/**
 * Vertex shader of the **CRT / scanline filter** (plan M3-02, shmup_feat.md §18 "[P2] CRT /
 * scanline filter: Off / Light / Full"): Pixi's default filter quad plus `vScreen`, the
 * fragment's pixel position in the **display** pass — the scanlines and the aperture mask are laid
 * out in output pixels, not frame pixels.
 */
export const CRT_VERTEX = LAYER_EFFECT_VERTEX;

/**
 * Fragment shader of the CRT filter.
 *
 * @remarks
 * Three effects over the already-upscaled picture, each switched by a uniform so one program
 * serves both strengths:
 *
 * - **Scanlines** — the lower half of every `uLinePitch`-pixel band is multiplied by
 *   `1 − uScan`. The pitch is the integer scale of the frame on the display, so one dark line
 *   falls between two frame rows however big the picture is.
 * - **Aperture mask** (`uMask` > 0, the `full` setting) — the output columns repeat a
 *   red / green / blue triad: each third keeps its own channel and dims the other two by `uMask`,
 *   the shadow mask of a colour tube.
 * - **Vignette** (`uVignette` > 0) — the corners darken with the squared distance from the
 *   picture's centre (`uHalf.xy`, in output pixels) measured in half-pictures (`uHalf.zw`), a
 *   subtle bulge without any geometric distortion (the picture must stay pixel-exact).
 *
 * Nothing is ever brightened, so the limiter of the flash overlay still holds.
 */
export const CRT_FRAGMENT = `precision mediump float;
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#endif

varying vec2 vTextureCoord;
varying vec2 vScreen;

uniform sampler2D uTexture;
uniform vec4 uInputClamp;
uniform vec4 uHalf;
uniform float uLinePitch;
uniform float uScan;
uniform float uMask;
uniform float uVignette;

void main(void)
{
    vec2 coord = clamp(vTextureCoord, uInputClamp.xy, uInputClamp.zw);
    vec4 color = texture2D(uTexture, coord);
    float band = vScreen.y / uLinePitch;
    float line = band - floor(band);
    color.rgb *= 1.0 - uScan * step(0.5, line);
    if (uMask > 0.0) {
        float triad = vScreen.x / 3.0;
        float phase = floor((triad - floor(triad)) * 3.0);
        vec3 keep = vec3(step(phase, 0.5), step(0.5, phase) * step(phase, 1.5), step(1.5, phase));
        color.rgb *= mix(vec3(1.0 - uMask), vec3(1.0), keep);
    }
    if (uVignette > 0.0) {
        vec2 d = (vScreen - uHalf.xy) / uHalf.zw;
        color.rgb *= 1.0 - uVignette * clamp(dot(d, d), 0.0, 1.0);
    }
    gl_FragColor = color;
}
`;

/** Scanline darkening of the `light` CRT setting (a fifth of the brightness on every other row). */
export const CRT_LIGHT_SCAN = 0.2;

/** Scanline darkening of the `full` setting. */
export const CRT_FULL_SCAN = 0.34;

/** Aperture-mask strength of the `full` setting (the `light` one has no mask). */
export const CRT_FULL_MASK = 0.18;

/** Vignette strength of the `full` setting. */
export const CRT_FULL_VIGNETTE = 0.22;

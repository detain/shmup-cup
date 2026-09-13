/**
 * The layer-effect shader sources of the `effects` module (plan M2-08): one **GLSL ES 1.0**
 * (WebGL1) program that a Pixi filter runs over a whole world layer — the per-scanline raster
 * offset (wavy water, heat haze, line-band parallax floors) and the palette cycle (water, lava,
 * glowing cores) in one pass, so a layer with both costs one filter.
 *
 * Plain strings with no imports, so tests and the browser smoke test can compile them without
 * loading Pixi. Pixi (v8) keeps a source without `#version 300 es` as GLSL ES 1.0 and only adds
 * its `#define SHADER_NAME` line and WebGL1 compatibility macros (`in` → `varying`, `texture` →
 * `texture2D`), none of which these sources use.
 *
 * **Uniforms.** Pixi's filter system fills `uInputSize`, `uInputClamp`, `uOutputFrame`,
 * `uOutputTexture` and the input `uTexture`; the effect sets:
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

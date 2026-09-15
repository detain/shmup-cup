/**
 * The layer shader's sources (plan M2-08) pass a GLSL ES 1.0 (WebGL1) syntax check, and the check
 * itself rejects the GLSL ES 3.00 constructs Pixi's own filters are written in — so a later edit
 * that slips one in fails here, before the browser smoke test compiles the real thing.
 */
import { describe, expect, it } from 'vitest';
import {
  CRT_FRAGMENT,
  CRT_FULL_MASK,
  CRT_FULL_SCAN,
  CRT_FULL_VIGNETTE,
  CRT_LIGHT_SCAN,
  CRT_VERTEX,
  LAYER_EFFECT_FRAGMENT,
  LAYER_EFFECT_MAX_COLORS,
  LAYER_EFFECT_ROWS,
  LAYER_EFFECT_VERTEX,
  MODE7_FRAGMENT,
  MODE7_VERTEX,
} from '../../src/effects/shaders.js';
import { checkGlslEs100 } from './glsl-es100.js';

describe('render-pixi/effects layer shader sources', () => {
  it('pass the GLSL ES 1.0 syntax check', () => {
    expect(checkGlslEs100(LAYER_EFFECT_VERTEX, 'vertex')).toEqual([]);
    expect(checkGlslEs100(LAYER_EFFECT_FRAGMENT, 'fragment')).toEqual([]);
  });

  it('pass it with the preamble Pixi puts in front of a WebGL1 program', () => {
    // GlProgram's preprocessors for a source without `#version 300 es` (pixi.js v8).
    const preamble = `#define SHADER_NAME shmup-layer-effect-fragment
#ifdef GL_ES
#define in varying
#define finalColor gl_FragColor
#define texture texture2D
#endif
`;
    expect(checkGlslEs100(preamble + LAYER_EFFECT_FRAGMENT, 'fragment')).toEqual([]);
  });

  it('declare what the effect sets and match its limits', () => {
    for (const name of ['uRasterTable', 'uRows', 'uRaster', 'uRowShift', 'uCycleCount']) {
      expect(LAYER_EFFECT_FRAGMENT).toContain(name);
    }
    expect(LAYER_EFFECT_FRAGMENT).toContain(`uCycleFrom[${LAYER_EFFECT_MAX_COLORS}]`);
    expect(LAYER_EFFECT_FRAGMENT).toContain(`uCycleTo[${LAYER_EFFECT_MAX_COLORS}]`);
    expect(LAYER_EFFECT_FRAGMENT).toContain(`i < ${LAYER_EFFECT_MAX_COLORS}`);
    expect(LAYER_EFFECT_ROWS).toBe(216);
    // The varyings agree between the stages.
    for (const varying of ['vTextureCoord', 'vScreen']) {
      expect(LAYER_EFFECT_VERTEX).toContain(`varying vec2 ${varying};`);
      expect(LAYER_EFFECT_FRAGMENT).toContain(`varying vec2 ${varying};`);
    }
    // Starts with a precision statement (Pixi then leaves it alone).
    expect(LAYER_EFFECT_FRAGMENT.startsWith('precision mediump float;')).toBe(true);
  });
});

/** Pixi's preprocessor preamble for a WebGL1 fragment program (pixi.js v8). */
const preamble = (name: string): string => `#define SHADER_NAME ${name}
#ifdef GL_ES
#define in varying
#define finalColor gl_FragColor
#define texture texture2D
#endif
`;

describe('render-pixi/effects Mode-7 shader sources (M3-02)', () => {
  it('pass the GLSL ES 1.0 syntax check, bare and with the Pixi preamble', () => {
    expect(checkGlslEs100(MODE7_VERTEX, 'vertex')).toEqual([]);
    expect(checkGlslEs100(MODE7_FRAGMENT, 'fragment')).toEqual([]);
    expect(checkGlslEs100(preamble('shmup-mode7-fragment') + MODE7_FRAGMENT, 'fragment')).toEqual(
      [],
    );
  });

  it('declare every uniform the filter writes and no trigonometry', () => {
    for (const name of [
      'uTile',
      'uTileRect',
      'uRight',
      'uForward',
      'uOrigin',
      'uFog',
      'uHorizon',
      'uBottom',
      'uCentre',
      'uHeight',
      'uFogDepth',
      'uMaxScale',
      'uAlpha',
    ]) {
      expect(MODE7_FRAGMENT).toMatch(new RegExp(`uniform [A-Za-z0-9]+ ${name}\\b`));
    }
    // The host passes the turned axes: the shader itself never calls a trig function (the core's
    // tables are the only angle source — plan §1.5).
    expect(MODE7_FRAGMENT).not.toMatch(/\b(sin|cos|tan|atan|asin|acos)\s*\(/);
    // The scale is clamped, so the horizon row cannot divide by zero into a NaN texel.
    expect(MODE7_FRAGMENT).toContain('min(z, uMaxScale)');
    // The varyings agree between the stages (the vertex stage is the layer effect's).
    for (const varying of ['vTextureCoord', 'vScreen']) {
      expect(MODE7_VERTEX).toContain(`varying vec2 ${varying};`);
      expect(MODE7_FRAGMENT).toContain(`varying vec2 ${varying};`);
    }
    expect(MODE7_FRAGMENT.startsWith('precision mediump float;')).toBe(true);
  });
});

describe('render-pixi/effects CRT shader sources (M3-02)', () => {
  it('pass the GLSL ES 1.0 syntax check, bare and with the Pixi preamble', () => {
    expect(checkGlslEs100(CRT_VERTEX, 'vertex')).toEqual([]);
    expect(checkGlslEs100(CRT_FRAGMENT, 'fragment')).toEqual([]);
    expect(checkGlslEs100(preamble('shmup-crt-fragment') + CRT_FRAGMENT, 'fragment')).toEqual([]);
  });

  it('declare the uniforms the pass writes, and only ever darken', () => {
    for (const name of ['uTexture', 'uInputClamp', 'uHalf', 'uLinePitch', 'uScan', 'uMask']) {
      expect(CRT_FRAGMENT).toMatch(new RegExp(`\\b${name}\\b`));
    }
    expect(CRT_FRAGMENT).toContain('uVignette');
    // The mask and the vignette are switched off by their uniform, so `light` runs one program.
    expect(CRT_FRAGMENT).toContain('if (uMask > 0.0)');
    expect(CRT_FRAGMENT).toContain('if (uVignette > 0.0)');
    // Nothing is brightened: every write to the colour is a multiply by at most 1.
    expect(CRT_FRAGMENT).not.toMatch(/color\.rgb\s*\+=/);
    expect(CRT_FRAGMENT.startsWith('precision mediump float;')).toBe(true);
  });

  it('the strengths of the two settings stay in range, `full` above `light`', () => {
    for (const value of [CRT_LIGHT_SCAN, CRT_FULL_SCAN, CRT_FULL_MASK, CRT_FULL_VIGNETTE]) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(1);
    }
    expect(CRT_FULL_SCAN).toBeGreaterThan(CRT_LIGHT_SCAN);
  });
});

describe('render-pixi/effects GLSL ES 1.0 check (the checker)', () => {
  const fragment = (body: string, globals = ''): string =>
    `precision mediump float;\nuniform sampler2D uTex;\nvarying vec2 vUv;\n${globals}\nvoid main(void)\n{\n${body}\n}\n`;

  it('accepts a plain WebGL1 fragment shader', () => {
    expect(checkGlslEs100(fragment('gl_FragColor = texture2D(uTex, vUv);'), 'fragment')).toEqual(
      [],
    );
  });

  it('rejects GLSL ES 3.00 syntax', () => {
    const es3 = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 finalColor;
uniform sampler2D uTex;
void main(void)
{
    finalColor = texture(uTex, vUv);
}
`;
    const problems = checkGlslEs100(es3, 'fragment').join('\n');
    expect(problems).toContain('#version 300');
    expect(problems).toContain('global "in"');
    expect(problems).toContain('global "out"');
    expect(problems).toContain('"texture" is GLSL ES 3.00');
    expect(problems).toContain('never writes gl_FragColor');
  });

  it('rejects reserved operators, suffixed literals and unsupported loops', () => {
    const src = fragment(
      `int a = 5 % 2;
float b = 1.0f;
int c = 1 << 2;
int k = 0;
while (k < 3) { k++; }
for (int i = 0; i < n; i += 1) { }
gl_FragColor = vec4(0.0);`,
      'uniform int n;',
    );
    const problems = checkGlslEs100(src, 'fragment').join('\n');
    expect(problems).toContain('"%"');
    expect(problems).toContain('float suffix');
    expect(problems).toContain('"<<"');
    expect(problems).toContain('"while" loops');
    expect(problems).toContain('Appendix A');
  });

  it('rejects a fragment shader without precision, unknown names and bad swizzles', () => {
    const src = `uniform sampler2D uTex;
varying vec2 vUv;
void main(void)
{
    vec4 c = texture2D(uTex, vUv);
    gl_FragColor = vec4(c.xyzq.x, uint(1), 0.0, 1.0) * fooBar;
}
`;
    const problems = checkGlslEs100(src, 'fragment').join('\n');
    expect(problems).toContain('default float precision');
    expect(problems).toContain('bad swizzle ".xyzq"');
    expect(problems).toContain('"uint" is GLSL ES 3.00');
    expect(problems).toContain('unknown identifier "fooBar"');
  });

  it('reports unbalanced brackets and a missing main', () => {
    const problems = checkGlslEs100(
      'precision mediump float;\nvoid run( { gl_FragColor = vec4(1.0); }',
      'fragment',
    ).join('\n');
    expect(problems).toContain('unclosed "("');
    expect(problems).toContain('no "void main"');
  });
});

/**
 * The layer shader's sources (plan M2-08) pass a GLSL ES 1.0 (WebGL1) syntax check, and the check
 * itself rejects the GLSL ES 3.00 constructs Pixi's own filters are written in — so a later edit
 * that slips one in fails here, before the browser smoke test compiles the real thing.
 */
import { describe, expect, it } from 'vitest';
import {
  LAYER_EFFECT_FRAGMENT,
  LAYER_EFFECT_MAX_COLORS,
  LAYER_EFFECT_ROWS,
  LAYER_EFFECT_VERTEX,
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

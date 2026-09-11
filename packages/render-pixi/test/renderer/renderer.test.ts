import { describe, expect, it } from 'vitest';
import * as renderPixi from '../../src/index.js';
import { createPixiRenderer, moduleInfo } from '../../src/renderer/index.js';

// A real WebGL context is not available in headless Node; the renderer is exercised
// in the browser by apps/web and on the TV by apps/tizen. Here we check the module
// wiring and the public surface.
describe('render-pixi/renderer', () => {
  it('imports cleanly (Pixi v8 loads in Node) and describes itself', () => {
    expect(moduleInfo.name).toBe('renderer');
    expect(typeof createPixiRenderer).toBe('function');
  });

  it('exposes the package entry point', () => {
    expect(renderPixi.createPixiRenderer).toBe(createPixiRenderer);
    expect(typeof renderPixi.computeIntegerViewport).toBe('function');
    expect(typeof renderPixi.createTestPattern).toBe('function');
  });
});

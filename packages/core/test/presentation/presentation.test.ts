import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  moduleInfo,
  type IAudio,
  type IRenderer,
  type RenderFrame,
} from '../../src/presentation/index.js';

describe('core/presentation', () => {
  it('imports cleanly and describes itself', () => {
    expect(moduleInfo.name).toBe('presentation');
  });

  it('declares the renderer and audio contracts', () => {
    expectTypeOf<IRenderer['render']>().parameter(0).toEqualTypeOf<RenderFrame>();
    expectTypeOf<IAudio['unlock']>().returns.toEqualTypeOf<Promise<void>>();
  });
});

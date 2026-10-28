/**
 * The DOM host adapter (WO-3A). Node has `Blob` and `URL` but no `Image`, so in this environment the host
 * must report itself unavailable — `null`, never a throw — which is exactly what the fake-Tizen realm and any
 * engine without `Image` see. On a real browser the host is exercised by the control run (README §SVG matrix).
 */

import { describe, expect, it } from 'vitest';

import { createSvgHost } from '../src/svgHost';

describe('createSvgHost', () => {
  it('returns null in a realm without Image, without throwing', () => {
    expect(typeof Image).toBe('undefined');
    expect(() => createSvgHost()).not.toThrow();
    expect(createSvgHost()).toBeNull();
  });
});

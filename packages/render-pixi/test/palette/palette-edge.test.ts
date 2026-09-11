/**
 * Palette sanity: valid 24-bit colours, lifted (not black) backgrounds and readable
 * bullets against the playfield.
 */
import { describe, expect, it } from 'vitest';
import { PALETTE, type PaletteColor } from '../../src/palette/index.js';

/**
 * Relative luminance (WCAG) of a 0xRRGGBB colour.
 *
 * @param color - Colour.
 */
function luminance(color: number): number {
  const channel = (shift: number): number => {
    const c = ((color >> shift) & 0xff) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

/**
 * WCAG contrast ratio between two colours.
 *
 * @param a - First colour.
 * @param b - Second colour.
 */
function contrast(a: number, b: number): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const scalarNames = Object.keys(PALETTE).filter((name) => name !== 'bars') as PaletteColor[];

describe('render-pixi/palette sanity', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(PALETTE)).toBe(true);
  });

  it.each(scalarNames)('%s is a valid 0xRRGGBB integer', (name) => {
    const color = PALETTE[name];
    expect(Number.isInteger(color)).toBe(true);
    expect(color).toBeGreaterThanOrEqual(0);
    expect(color).toBeLessThanOrEqual(0xffffff);
  });

  it('has eight distinct valid colour bars', () => {
    expect(PALETTE.bars).toHaveLength(8);
    expect(new Set(PALETTE.bars).size).toBe(8);
    for (const bar of PALETTE.bars) expect(bar).toBeLessThanOrEqual(0xffffff);
  });

  it('lifts the playfield above the letterbox (VA panels smear near-black)', () => {
    expect(luminance(PALETTE.space)).toBeGreaterThan(luminance(PALETTE.letterbox));
  });

  it('keeps enemy bullets and the ship clearly readable on the playfield', () => {
    expect(contrast(PALETTE.bullet, PALETTE.space)).toBeGreaterThan(4.5);
    expect(contrast(PALETTE.bulletCore, PALETTE.space)).toBeGreaterThan(7);
    expect(contrast(PALETTE.shipHull, PALETTE.space)).toBeGreaterThan(4.5);
  });

  it('keeps the grid faint (low contrast against the playfield)', () => {
    expect(contrast(PALETTE.grid, PALETTE.space)).toBeLessThan(2);
  });
});

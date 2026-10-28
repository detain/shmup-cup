/**
 * The feature catalog itself: ids and order, kinds, sizes, the E3 atlas generator's determinism, and the
 * headline attribute each feature is meant to prove — the strings the device renders. (The matrix mechanics
 * are in `svgProbe.test.ts`; the pixel signatures over real rasters are proven by the control run, README.)
 */

import { describe, expect, it } from 'vitest';

import { e3Atlas, E3_SIZE, SVG_FEATURE_SIZE, SVG_FEATURES } from '../src/svgProbe';

const IDS = [
  'paths-static',
  'grad-linear',
  'grad-radial',
  'mask-lum',
  'clip-circle',
  'use-symbol',
  'text-glyph',
  'text-path',
  'blur-s2',
  'blur-s4',
  'blur-s8',
  'drop-shadow',
  'turb-oct1',
  'turb-oct4',
  'chain-tcc',
  'smil-animate',
  'css-keyframes',
  'bitmap-svg',
  'e3-atlas',
];

describe('SVG feature catalog', () => {
  it('has the 19 §B′ features, in run order, uniquely', () => {
    expect(SVG_FEATURES.map((f) => f.id)).toEqual(IDS);
  });

  it('is 16 raster, 2 dynamic and 1 bitmap feature', () => {
    const kinds = SVG_FEATURES.map((f) => f.kind);
    expect(kinds.filter((k) => k === 'raster').length).toBe(16);
    expect(kinds.filter((k) => k === 'dynamic').length).toBe(2);
    expect(kinds.filter((k) => k === 'bitmap').length).toBe(1);
  });

  it('sizes every feature at 256 except the E3 chunk at 128', () => {
    for (const f of SVG_FEATURES) {
      expect(f.size).toBe(f.id === 'e3-atlas' ? E3_SIZE : SVG_FEATURE_SIZE);
    }
  });

  it('builds a well-formed standalone SVG document per feature', () => {
    for (const f of SVG_FEATURES) {
      const s = f.build();
      expect(s.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), f.id).toBe(true);
      expect(s.endsWith('</svg>'), f.id).toBe(true);
      expect(s.includes(`width="${f.size}"`), f.id).toBe(true);
    }
  });

  it('carries a headline attribute per feature', () => {
    const src = (id: string) => SVG_FEATURES.filter((f) => f.id === id)[0].build();
    expect(src('paths-static')).toContain('<rect x="0" y="0" width="128" height="128" fill="#ff0000"/>');
    expect(src('grad-linear')).toContain('<linearGradient');
    expect(src('grad-radial')).toContain('<radialGradient');
    expect(src('mask-lum')).toContain('<mask id="m"><rect width="256" height="256" fill="url(#g)"/></mask>');
    expect(src('clip-circle')).toContain('<clipPath');
    expect(src('use-symbol')).toContain('href="#s" xlink:href="#s"');
    expect(src('text-path')).toContain('<textPath href="#p" xlink:href="#p">SHMUP CAPABILITY</textPath>');
    expect(src('blur-s2')).toContain('stdDeviation="2"');
    expect(src('blur-s8')).toContain('stdDeviation="8"');
    expect(src('drop-shadow')).toContain('<feDropShadow');
    expect(src('turb-oct1')).toContain('numOctaves="1"');
    expect(src('turb-oct4')).toContain('numOctaves="4"');
    expect(src('chain-tcc')).toContain('<feColorMatrix');
    expect(src('chain-tcc')).toContain('<feComposite');
    expect(src('smil-animate')).toContain('<animate attributeName="x" values="0;192;0"');
    expect(src('css-keyframes')).toContain('@keyframes mv');
    expect(src('css-keyframes')).toContain('animation: mv .35s');
  });

  it('gives every raster feature a real signature (samples, ink or regions)', () => {
    for (const f of SVG_FEATURES.filter((x) => x.kind === 'raster')) {
      expect(f.samples || f.ink || f.regions, f.id).toBeTruthy();
    }
  });

  it('marks the bitmap feature with the desktop expectation', () => {
    const bm = SVG_FEATURES.filter((f) => f.id === 'bitmap-svg')[0];
    expect(bm.note).toContain('reject');
  });

  it('generates the E3 atlas deterministically', () => {
    const a = e3Atlas();
    const b = e3Atlas();
    expect(b.svg).toBe(a.svg);
    expect(b.pixels).toEqual(a.pixels);
    expect(a.rects).toBeGreaterThan(0);
  });

  it('keeps the E3 atlas an inline ~50 KB chunk (pinned by the control run)', () => {
    // 50,430 bytes measured on modern Chromium (WO-3A); the ~50 KB WO-3 brief band.
    expect(e3Atlas().svg.length).toBe(50_430);
  });

  it('makes every E3 pixel fully opaque and matches the generator', () => {
    const a = e3Atlas();
    for (let i = 3; i < a.pixels.length; i += 4) {
      expect(a.pixels[i]).toBe(255);
    }
    expect(a.pixels.length).toBe(E3_SIZE * E3_SIZE * 4);
  });

  it('draws the E3 atlas with compound paths only (one per color)', () => {
    const a = e3Atlas();
    const paths = (a.svg.match(/<path /g) || []).length;
    expect(paths).toBeLessThanOrEqual(12);
    expect(a.svg).toContain('shape-rendering="crispEdges"');
    expect(a.svg).not.toContain('<rect');
  });
});

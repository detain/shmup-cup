/**
 * The shared v2 drawing kit (R4-P.P4): the outline and light stamps of art bible v2 §3.4 /
 * §3.5, the ramp margin of §4.4 (`offRamp`, mirroring `palette-cycle-scan.test.ts`'s rule),
 * the palette's outline colour, and the frame re-exports from `scripts/frame.mjs`.
 *
 * The kit draws nothing itself — these tests pin the pixels it would stamp, on exact
 * small fixtures, and the reserved-ramp edge behaviour of `offRamp` (the trap the subtask
 * names: tested at the ramp edges, at 2/255 and 3/255, and shape-pinned so the reserved
 * list stays assembled lazily inside `offRamp` — wave 10 appends its ramps there).
 */
import { describe, expect, it } from 'vitest';
import * as kit from '../../../scripts/assets/v2kit.mjs';
import * as frame from '../../../scripts/frame.mjs';
import { createImage, getPixel, imagesEqual, setPixel } from '../../../scripts/assets/image.mjs';
import { ABYSS_RAMP } from '../../../scripts/assets/procedural/abyss.mjs';
import { BRINE_RAMP } from '../../../scripts/assets/procedural/brine.mjs';
import { CITADEL_RAMP } from '../../../scripts/assets/procedural/citadel.mjs';
import { MAGMA_RAMP } from '../../../scripts/assets/procedural/magma.mjs';
import { PRISM_RAMP } from '../../../scripts/assets/procedural/prism.mjs';
import { SEA_RAMP } from '../../../scripts/assets/procedural/raster-bands.mjs';
import { STORM_RAMP } from '../../../scripts/assets/procedural/tempest.mjs';
import { VAULT_RAMP } from '../../../scripts/assets/procedural/vault.mjs';

/** The reserved ramp colours, read here (the test may) to verify `offRamp`'s promise. */
const RESERVED: readonly string[] = [
  ...ABYSS_RAMP,
  ...BRINE_RAMP,
  ...CITADEL_RAMP,
  ...MAGMA_RAMP,
  ...PRISM_RAMP,
  ...SEA_RAMP,
  ...STORM_RAMP,
  ...VAULT_RAMP,
];

/**
 * Chebyshev distance of a `#rrggbb` text to a reserved ramp colour index.
 *
 * @param colour - A lower-case `#rrggbb`.
 * @param other - Another `#rrggbb`.
 * @returns The max-over-channels distance.
 */
function dist(colour: string, other: string): number {
  const c = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
  const o = [1, 3, 5].map((i) => parseInt(other.slice(i, i + 2), 16));
  return Math.max(Math.abs(c[0] - o[0]), Math.abs(c[1] - o[1]), Math.abs(c[2] - o[2]));
}

/**
 * Builds a fixture image from a row map: 'A' is the base colour, anything else transparent.
 *
 * @param rows - The rows (equal length).
 * @param base - The opaque colour.
 * @returns The image.
 */
function shape(rows: readonly string[], base = '#c8d0e0'): ReturnType<typeof createImage> {
  const image = createImage(rows[0].length, rows.length);
  const rgba: [number, number, number, number] = [
    parseInt(base.slice(1, 3), 16),
    parseInt(base.slice(3, 5), 16),
    parseInt(base.slice(5, 7), 16),
    255,
  ];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'A') setPixel(image, x, y, rgba);
    }
  });
  return image;
}

const OUTLINE = '#101828';
const LIGHT = '#ffffff';
const SHADE = '#141428';

describe('scripts/assets/v2kit.mjs — the module surface', () => {
  it('exports exactly the kit and the frame mirror — no ramp array at the top level', () => {
    expect(Object.keys(kit).sort()).toEqual([
      'FRAME_CX',
      'FRAME_CY',
      'FRAME_H',
      'FRAME_W',
      'GLYPH_H',
      'GLYPH_W',
      'HUD_BAR_HEIGHT',
      'HUD_BOTTOM_Y',
      'LINE_H',
      'PLAYFIELD_CY',
      'PLAYFIELD_H',
      'PLAYFIELD_W',
      'PLAYFIELD_Y',
      'RAMP_MIN_DISTANCE',
      'TILE_SIZE',
      'WORLD_SCALE',
      'bottomRightShade',
      'offRamp',
      'outline',
      'outlineColour',
      'topLeftLight',
    ]);
    expect(kit.RAMP_MIN_DISTANCE).toBe(3);
  });

  it('re-exports scripts/frame.mjs unchanged', () => {
    expect(kit.FRAME_W).toBe(frame.FRAME_W);
    expect(kit.FRAME_H).toBe(frame.FRAME_H);
    expect(kit.FRAME_CX).toBe(frame.FRAME_CX);
    expect(kit.FRAME_CY).toBe(frame.FRAME_CY);
    expect(kit.HUD_BAR_HEIGHT).toBe(frame.HUD_BAR_HEIGHT);
    expect(kit.PLAYFIELD_Y).toBe(frame.PLAYFIELD_Y);
    expect(kit.PLAYFIELD_W).toBe(frame.PLAYFIELD_W);
    expect(kit.PLAYFIELD_H).toBe(frame.PLAYFIELD_H);
    expect(kit.PLAYFIELD_CY).toBe(frame.PLAYFIELD_CY);
    expect(kit.HUD_BOTTOM_Y).toBe(frame.HUD_BOTTOM_Y);
    expect(kit.TILE_SIZE).toBe(frame.TILE_SIZE);
    expect(kit.GLYPH_W).toBe(frame.GLYPH_W);
    expect(kit.GLYPH_H).toBe(frame.GLYPH_H);
    expect(kit.LINE_H).toBe(frame.LINE_H);
    expect(kit.WORLD_SCALE).toBe(frame.WORLD_SCALE);
  });
});

describe('scripts/assets/v2kit.mjs — outline and light (bible §3.4 / §3.5)', () => {
  it('outlines the outermost ring of a blob, inside the frame', () => {
    const base = shape(['.....', '.AAA.', '.AAA.', '.AAA.', '.....', '.....']);
    const out = kit.outline(base, OUTLINE);
    // The 3×3 block's 8 border pixels take the outline; the centre keeps the base colour.
    expect(getPixel(out, 1, 1).slice(0, 3)).toEqual([0x10, 0x18, 0x28]);
    expect(getPixel(out, 2, 1).slice(0, 3)).toEqual([0x10, 0x18, 0x28]);
    expect(getPixel(out, 1, 2).slice(0, 3)).toEqual([0x10, 0x18, 0x28]);
    expect(getPixel(out, 2, 2).slice(0, 3)).toEqual([0xc8, 0xd0, 0xe0]);
    expect(getPixel(out, 3, 3).slice(0, 3)).toEqual([0x10, 0x18, 0x28]);
    // Transparent stays transparent; the size never moves.
    expect(getPixel(out, 0, 0)[3]).toBe(0);
    expect(out.width).toBe(5);
    expect(out.height).toBe(6);
  });

  it('outlines by sides only — a diamond centre with transparent corners keeps its colour', () => {
    const plus = shape(['..A..', '..A..', 'AAAAA', '..A..', '..A..']);
    const out = kit.outline(plus, OUTLINE);
    // Every plus pixel has a transparent side neighbour… except the centre, whose four
    // sides are opaque — the transparent DIAGONALS must not pull it into the ring.
    expect(getPixel(out, 2, 2).slice(0, 3)).toEqual([0xc8, 0xd0, 0xe0]);
    expect(getPixel(out, 2, 0).slice(0, 3)).toEqual([0x10, 0x18, 0x28]);
    expect(getPixel(out, 0, 2).slice(0, 3)).toEqual([0x10, 0x18, 0x28]);
    expect(getPixel(out, 2, 1).slice(0, 3)).toEqual([0x10, 0x18, 0x28]);
  });

  it('treats the frame edge as transparent (a full blob still gets its ring)', () => {
    const full = shape(['AAA', 'AAA', 'AAA']);
    const out = kit.outline(full, OUTLINE);
    expect(getPixel(out, 0, 0).slice(0, 3)).toEqual([0x10, 0x18, 0x28]);
    expect(getPixel(out, 2, 2).slice(0, 3)).toEqual([0x10, 0x18, 0x28]);
    expect(getPixel(out, 1, 1).slice(0, 3)).toEqual([0xc8, 0xd0, 0xe0]);
  });

  it('stamps the top/left lit ring and the bottom/right shaded ring of the light', () => {
    const base = shape(['.....', '.AAA.', '.AAA.', '.AAA.', '.....']);
    const lit = kit.topLeftLight(base, LIGHT);
    const wanted = new Set(['1,1', '2,1', '3,1', '1,2', '1,3']);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const isLight = getPixel(lit, x, y)[0] === 0xff;
        expect(isLight, `${x},${y}`).toBe(wanted.has(`${x},${y}`));
      }
    }
    const shaded = kit.bottomRightShade(base, SHADE);
    const dark = new Set(['3,1', '1,3', '2,3', '3,3', '3,2']);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const isShade = getPixel(shaded, x, y)[0] === 0x14;
        expect(isShade, `${x},${y}`).toBe(dark.has(`${x},${y}`));
      }
    }
  });

  it('copies unchanged for a null colour, and never touches the input', () => {
    const base = shape(['..A..', '.AAA.', 'AAAAA', '.AAA.', '..A..']);
    expect(imagesEqual(kit.outline(base, null), base)).toBe(true);
    const before = [...base.data];
    kit.topLeftLight(base, LIGHT);
    kit.bottomRightShade(base, SHADE);
    expect([...base.data]).toEqual(before);
  });

  it('rejects a colour it cannot parse', () => {
    const base = shape(['AA', 'AA']);
    expect(() => kit.outline(base, 'navy')).toThrow(RangeError);
    expect(() => kit.outlineColour(['#000000'])).toThrow(RangeError);
    expect(() => kit.outlineColour([])).toThrow(RangeError);
    expect(() => kit.outlineColour(['blue'])).toThrow(RangeError);
  });

  it('picks the palette’s darkest non-black colour for the outline (bible §3.4)', () => {
    // The navy family of KESTREL with the pure black that must never outline:
    expect(kit.outlineColour(['#c8d0e0', '#000000', '#141428', '#1b2a4a'])).toBe('#141428');
    // A dark violet is darker than a dark green by the BT.601 luma, not by the channel sum:
    expect(kit.outlineColour(['#0e1a12', '#12102a'])).toBe('#12102a');
    // Short forms are read too — and come back as given:
    expect(kit.outlineColour(['#123', '#456'])).toBe('#123');
  });
});

describe('scripts/assets/v2kit.mjs — offRamp (bible §4.4, decision W5-12)', () => {
  it('keeps a colour at ≥ 3/255 (Chebyshev) from every reserved ramp colour', () => {
    const probes = [
      '#16485a', // an exact ABYSS ramp colour — must move
      '#144658', // 2/255 from it — must move
      '#13485a', // 3/255 from it — stays
      '#8a2d0a', // 1/255 from a MAGMA colour — must move
      '#1c2331', // 1/255 from a STORM colour — must move
      '#1f3327', // 1/255 from a VAULT colour — must move
      '#000000', // pure black, far from all — stays
      '#c8d0e0', // the common hull colour — stays
      '#f0f8ff',
    ];
    for (const probe of probes) {
      const out = kit.offRamp(probe);
      expect(out, probe).toMatch(/^#[0-9a-f]{6}$/);
      for (const reserved of RESERVED) {
        expect(dist(out, reserved), `${probe} → ${out} vs ${reserved}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('leaves a legal colour byte-exact and changes only an illegal one', () => {
    expect(kit.offRamp('#c8d0e0')).toBe('#c8d0e0');
    expect(kit.offRamp('#13485a')).toBe('#13485a'); // distance exactly 3 from '#16485a'
    expect(kit.offRamp('#16485a')).not.toBe('#16485a'); // exact ramp colour
    expect(kit.offRamp('#144658')).not.toBe('#144658'); // distance 2
  });

  it('normalises the format: short forms and case become the exact lower-case #rrggbb', () => {
    expect(kit.offRamp('#FFF')).toBe('#ffffff');
    expect(kit.offRamp('#c8d0e0ff')).toBe('#c8d0e0'); // alpha dropped
    expect(kit.offRamp('#C8D0E0')).toBe('#c8d0e0');
  });

  it('stays inside 0…255 by the channel borders', () => {
    for (const probe of ['#000102', '#010200', '#020001', '#fffe02', '#feff00', '#0d2933']) {
      const out = kit.offRamp(probe);
      for (const part of [1, 3, 5]) {
        const value = parseInt(out.slice(part, part + 2), 16);
        expect(value, `${probe} → ${out}`).toBeGreaterThanOrEqual(0);
        expect(value, `${probe} → ${out}`).toBeLessThanOrEqual(255);
      }
      for (const reserved of RESERVED) {
        expect(dist(out, reserved), `${probe} → ${out} vs ${reserved}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('is deterministic: the same colour always moves the same way', () => {
    for (const probe of RESERVED) {
      expect(kit.offRamp(probe)).toBe(kit.offRamp(probe));
      // A reserved colour can never come back as itself, and lands on a stable neighbour:
      const moved = kit.offRamp(probe);
      expect(moved).not.toBe(probe);
      expect(kit.offRamp(moved)).toBe(moved); // idempotent once clear
    }
  });

  it('rejects input it cannot parse', () => {
    expect(() => kit.offRamp('white')).toThrow(RangeError);
    expect(() => kit.offRamp('#12345')).toThrow(RangeError);
    expect(() => kit.offRamp(0xff0000 as unknown as string)).toThrow(RangeError);
  });
});

/**
 * The R3-04 stand-in generator, part 1 (decision W5-14, `scripts/assets/standin.mjs`):
 * the zone palette, the far layer, the keyed bands and the tile set.
 *
 * Checks (art bible v2 §4.3, §4.4, §5.9, §5.10):
 *
 * - The palette is 48–64 colours (`PALETTE_SIZE`), unique `#rrggbb`, and no colour sits
 *   closer than `RAMP_MARGIN`/255 (Chebyshev) to one of the eight reserved palette-cycle
 *   ramps, or repeats a reserved bullet / gold / explosion family colour exactly.
 * - The far layer is `FRAME_W × FRAME_H` or `2 * FRAME_W` wide (both variants ship across
 *   the zones), opaque, and stays inside its 32-colour window.
 * - Each zone carries 3–5 keyed bands of `FRAME_W × 120–240`, binary alpha, an all-key top
 *   row, a solid bottom row, and ≤ 32 colours; far plus bands is a 4–6 layer stack.
 * - The tile set is 40 named 12-px frames, every one holding at least one solid pixel,
 *   binary alpha, and ≤ 32 colours across the whole set.
 * - `standinZone(zoneId, { seed })` is a pure function: two runs are byte-identical (also
 *   across a fresh Node process), a different seed draws a different zone, zones differ,
 *   and an unknown zone id throws.
 *
 * The enemy and boss colour caps (§4.3's 16 / 24) are checked by part 2 (R3-04.M1b) when
 * this file gains the sprites. Nothing here measures PNG-8 bytes: the entropy constants
 * are uncalibrated (RR-7), and R3-04.M2a performs the calibration and the budget gate.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FRAME_H, FRAME_W, TILE_SIZE } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  BAND_MAX_COUNT,
  BAND_MAX_HEIGHT,
  BAND_MIN_COUNT,
  BAND_MIN_HEIGHT,
  BAND_WINDOW,
  chebyshev,
  DEFAULT_SEED,
  FAR_WINDOW,
  KEY,
  PALETTE_SIZE,
  RAMP_MARGIN,
  RESERVED_FAMILY_COLORS,
  RESERVED_RAMP_COLORS,
  STANDIN_TILES,
  TILE_WINDOW,
  ZONE_IDS,
  standinZone,
  type StandinZone,
} from '../../../scripts/assets/standin.mjs';

/** Repository root, for the cross-process determinism check. */
const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Every zone drawn once (the parts the property tests share). */
const zones: Record<string, StandinZone> = {};
for (const zoneId of ZONE_IDS) zones[zoneId] = standinZone(zoneId);

/** Bible §4.3's per-layer cap (backdrop layer, tileset). */
const LAYER_CAP = 32;

/** Membership sets for the colour windows (per-pixel checks aggregate to used colours). */
const farWindow = new Set(FAR_WINDOW);
const bandWindow = new Set(BAND_WINDOW);

/**
 * The distinct palette indices a surface uses (the `KEY` sentinel excluded).
 *
 * @param indices - Row-major indices.
 * @returns The used slots.
 */
function usedColors(indices: Uint8Array): Set<number> {
  const used = new Set<number>();
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] !== KEY) used.add(indices[i]);
  }
  return used;
}

/**
 * A digest of everything `standinZone` returned: palette, far, bands, tiles.
 *
 * @param zone - The drawn zone.
 * @returns Lower-case hex sha256.
 */
function digestZone(zone: StandinZone): string {
  const hash = createHash('sha256');
  hash.update('pal:' + zone.palette.join(','));
  hash.update('far:' + zone.far.width + 'x' + zone.far.height + ':');
  hash.update(Buffer.from(zone.far.indices));
  for (const band of zone.bands) {
    hash.update('band:' + band.width + 'x' + band.height + ':');
    hash.update(Buffer.from(band.indices));
  }
  hash.update('tiles:' + zone.tiles.size + 'x' + zone.tiles.names.length + ':');
  hash.update('names:' + zone.tiles.names.join(','));
  hash.update(Buffer.from(zone.tiles.indices));
  return hash.digest('hex');
}

describe('standin zone palettes (bible §4.3, §4.4)', () => {
  it('is 48–64 unique #rrggbb colours per zone', () => {
    for (const zoneId of ZONE_IDS) {
      const palette = zones[zoneId].palette;
      expect(palette.length, zoneId).toBeGreaterThanOrEqual(48);
      expect(palette.length, zoneId).toBeLessThanOrEqual(64);
      expect(palette.length, zoneId).toBe(PALETTE_SIZE);
      expect(new Set(palette).size, zoneId).toBe(palette.length);
      for (const hex of palette) expect(hex, zoneId).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('keeps RAMP_MARGIN from every reserved cycle ramp colour', () => {
    for (const zoneId of ZONE_IDS) {
      const palette = zones[zoneId].palette;
      for (const hex of palette) {
        const rgba = [
          parseInt(hex.slice(1, 3), 16),
          parseInt(hex.slice(3, 5), 16),
          parseInt(hex.slice(5, 7), 16),
          255,
        ];
        for (const ramp of RESERVED_RAMP_COLORS) {
          expect(chebyshev(rgba, ramp), `${zoneId} ${hex}`).toBeGreaterThanOrEqual(RAMP_MARGIN);
        }
      }
    }
  });

  it('never repeats a reserved family colour', () => {
    const family = RESERVED_FAMILY_COLORS.map(
      (c) => '#' + [c[0], c[1], c[2]].map((n) => (n < 16 ? '0' : '') + n.toString(16)).join(''),
    );
    for (const zoneId of ZONE_IDS) {
      for (const hex of zones[zoneId].palette)
        expect(family, `${zoneId} ${hex}`).not.toContain(hex);
    }
  });

  it('lifts every colour off pure black (§4.1)', () => {
    for (const zoneId of ZONE_IDS) {
      for (const hex of zones[zoneId].palette) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        expect(Math.max(r, g, b), `${zoneId} ${hex}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('standin far layer (bible §5.10)', () => {
  it('is frame-sized, opaque and capped at 32 colours', () => {
    for (const zoneId of ZONE_IDS) {
      const far = zones[zoneId].far;
      expect(far.height, zoneId).toBe(FRAME_H);
      expect([FRAME_W, 2 * FRAME_W], zoneId).toContain(far.width);
      expect(far.indices.length, zoneId).toBe(far.width * far.height);
      const used = usedColors(far.indices);
      expect(used.size, zoneId).toBeLessThanOrEqual(LAYER_CAP);
      for (const slot of used) expect(farWindow.has(slot), `${zoneId} slot ${slot}`).toBe(true);
      // Opaque: the sentinel never appears.
      expect(far.indices.includes(KEY), zoneId).toBe(false);
    }
  });

  it('draws both the frame-wide and the double-wide variant across the zones', () => {
    const widths = new Set(ZONE_IDS.map((zoneId) => zones[zoneId].far.width));
    expect(widths.has(FRAME_W), 'frame-wide').toBe(true);
    expect(widths.has(2 * FRAME_W), 'double-wide').toBe(true);
  });
});

describe('standin bands (bible §5.10)', () => {
  it('gives every zone 3–5 keyed FRAME_W layers of 120–240 px', () => {
    for (const zoneId of ZONE_IDS) {
      const bands = zones[zoneId].bands;
      expect(bands.length, zoneId).toBeGreaterThanOrEqual(BAND_MIN_COUNT);
      expect(bands.length, zoneId).toBeLessThanOrEqual(BAND_MAX_COUNT);
      // far plus bands is the bible's 4–6 layer stack.
      expect(bands.length + 1, zoneId).toBeGreaterThanOrEqual(4);
      expect(bands.length + 1, zoneId).toBeLessThanOrEqual(6);
      for (const band of bands) {
        expect(band.width, zoneId).toBe(FRAME_W);
        expect(band.height, zoneId).toBeGreaterThanOrEqual(BAND_MIN_HEIGHT);
        expect(band.height, zoneId).toBeLessThanOrEqual(BAND_MAX_HEIGHT);
        expect(band.indices.length, zoneId).toBe(band.width * band.height);
        const used = usedColors(band.indices);
        expect(used.size, zoneId).toBeLessThanOrEqual(LAYER_CAP);
        expect(used.size, zoneId).toBeGreaterThan(0);
        for (const slot of used) expect(bandWindow.has(slot), `${zoneId} slot ${slot}`).toBe(true);
        // The skyline leaves keyed sky on top; the foot stays solid rock (a few keyed
        // windows may open in the last rows).
        let keyedTop = 0;
        let solidFoot = 0;
        for (let x = 0; x < band.width; x++) {
          if (band.indices[x] === KEY) keyedTop++;
          if (band.indices[(band.height - 1) * band.width + x] !== KEY) solidFoot++;
        }
        expect(keyedTop, zoneId).toBe(band.width);
        expect(solidFoot, zoneId).toBeGreaterThan(band.width / 2);
      }
    }
  });
});

describe('standin tile set (bible §5.9)', () => {
  it('is 40 named 12-px frames with binary alpha and at most 32 colours', () => {
    expect(STANDIN_TILES.length).toBe(40);
    expect(new Set(STANDIN_TILES).size).toBe(40);
    for (const zoneId of ZONE_IDS) {
      const tiles = zones[zoneId].tiles;
      expect(tiles.size, zoneId).toBe(TILE_SIZE);
      expect(tiles.names, zoneId).toBe(STANDIN_TILES);
      expect(tiles.indices.length, zoneId).toBe(40 * TILE_SIZE * TILE_SIZE);
      for (const name of tiles.names) expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      let anyKey = false;
      for (let i = 0; i < tiles.indices.length; i++) {
        const v = tiles.indices[i];
        if (v === KEY) {
          anyKey = true;
          continue;
        }
        expect(TILE_WINDOW, zoneId).toContain(v);
      }
      expect(anyKey, zoneId).toBe(true);
      const used = usedColors(tiles.indices);
      expect(used.size, zoneId).toBeLessThanOrEqual(LAYER_CAP);
      // Every frame holds at least one solid pixel.
      for (let ti = 0; ti < tiles.names.length; ti++) {
        const frame = tiles.indices.subarray(
          ti * TILE_SIZE * TILE_SIZE,
          (ti + 1) * TILE_SIZE * TILE_SIZE,
        );
        let solid = 0;
        for (let i = 0; i < frame.length; i++) if (frame[i] !== KEY) solid++;
        expect(solid, `${zoneId} ${tiles.names[ti]}`).toBeGreaterThan(0);
      }
    }
  });

  it('carries at least three fill variants and the §5.9 roster roles', () => {
    const fills = STANDIN_TILES.filter((name) => name.startsWith('fill-')).length;
    expect(fills).toBeGreaterThanOrEqual(3);
    expect(STANDIN_TILES).toContain('slope-up-45');
    expect(STANDIN_TILES).toContain('slope-down-45');
    expect(STANDIN_TILES).toContain('brick');
    expect(STANDIN_TILES).toContain('corner-tl');
    expect(STANDIN_TILES).toContain('inner-br');
    expect(STANDIN_TILES).toContain('edge-top');
    expect(STANDIN_TILES).toContain('edge-left');
  });
});

describe('standin determinism (W5-14)', () => {
  it('draws byte-identical zones from the same arguments', () => {
    for (const zoneId of ZONE_IDS) {
      expect(digestZone(standinZone(zoneId)), zoneId).toBe(digestZone(zones[zoneId]));
    }
  });

  it('takes the explicit default seed as the implicit one', () => {
    for (const zoneId of ZONE_IDS) {
      expect(digestZone(standinZone(zoneId, { seed: DEFAULT_SEED })), zoneId).toBe(
        digestZone(zones[zoneId]),
      );
    }
  });

  it('draws another zone from another seed', () => {
    for (const zoneId of ZONE_IDS) {
      expect(digestZone(standinZone(zoneId, { seed: DEFAULT_SEED + 1 })), zoneId).not.toBe(
        digestZone(zones[zoneId]),
      );
    }
  });

  it('draws different zones', () => {
    const digests = ZONE_IDS.map((zoneId) => digestZone(zones[zoneId]));
    expect(new Set(digests).size).toBe(ZONE_IDS.length);
  });

  it('reproduces the bytes in a fresh Node process', () => {
    const moduleUrl = pathToFileURL(join(repo, 'scripts', 'assets', 'standin.mjs')).href;
    const script =
      'const { createHash } = await import("node:crypto");\n' +
      `const m = await import(${JSON.stringify(moduleUrl)});\n` +
      'const z = m.standinZone("e", { seed: 4242 });\n' +
      'const h = createHash("sha256");\n' +
      'h.update("pal:" + z.palette.join(","));\n' +
      'h.update("far:" + z.far.width + "x" + z.far.height + ":");\n' +
      'h.update(Buffer.from(z.far.indices));\n' +
      'for (const b of z.bands) { h.update("band:" + b.width + "x" + b.height + ":"); h.update(Buffer.from(b.indices)); }\n' +
      'h.update("tiles:" + z.tiles.size + "x" + z.tiles.names.length + ":");\n' +
      'h.update("names:" + z.tiles.names.join(","));\n' +
      'h.update(Buffer.from(z.tiles.indices));\n' +
      'process.stdout.write(h.digest("hex"));\n';
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: repo,
      encoding: 'utf8',
    }).trim();
    expect(out).toBe(digestZone(standinZone('e', { seed: 4242 })));
  });

  it('refuses an unknown zone', () => {
    expect(() => standinZone('z')).toThrow(RangeError);
    expect(() => standinZone('')).toThrow(RangeError);
  });
});

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
 * Part 2 (R3-04.M1b) adds the enemy, boss and atlas describes at the foot of this file:
 * `standinAtlas` through the real pipeline, the `standin-zone-<x>` groups, the RR-7 PNG-8
 * byte band, the §4.3 enemy / boss colour caps, the `@flash` siblings and the deterministic
 * atlas bytes.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FRAME_H, FRAME_W, PLAYFIELD_H, TILE_SIZE } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { MAX_PAGE_SIZE } from '../../../scripts/assets/packer.mjs';
import {
  BAND_MAX_COUNT,
  BAND_MAX_HEIGHT,
  BAND_MIN_COUNT,
  BAND_MIN_HEIGHT,
  BAND_WINDOW,
  BOSS_HEIGHT,
  BOSS_STATES,
  BOSS_WIDTH,
  chebyshev,
  DEFAULT_SEED,
  ENEMY_FRAME_MAX,
  ENEMY_FRAME_MIN,
  FAR_WINDOW,
  KEY,
  PALETTE_SIZE,
  RAMP_MARGIN,
  RESERVED_FAMILY_COLORS,
  RESERVED_RAMP_COLORS,
  STANDIN_BOSS_PARTS,
  STANDIN_ENEMY_KINDS,
  STANDIN_TILES,
  TILE_WINDOW,
  ZONE_IDS,
  standinAtlas,
  standinGroupName,
  standinSpriteName,
  standinZone,
  type StandinZone,
} from '../../../scripts/assets/standin.mjs';
import { formatManifest } from '../../../scripts/assets/manifest.mjs';

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

/* ------------------------------------------------------------------------ *
 * Part 2 (R3-04.M1b): the enemy and boss sprites, the @flash siblings, and
 * standinAtlas through the real pipeline (groups, PNG-8, the RR-7 band).
 * ------------------------------------------------------------------------ */

/** The full nine-zone stand-in atlas, packed once for the whole file to share. */
const atlas = standinAtlas();

/** The `buildAtlas` result type, as `standinAtlas` returns it. */
type StandinAtlas = ReturnType<typeof standinAtlas>;

/** Atlas groups as the shipped `atlas-groups.json` lists them (without `common`). */
const shippedGroups = Object.keys(
  (
    JSON.parse(
      readFileSync(join(repo, 'assets/source', 'atlas-groups.json'), 'utf8'),
    ) as AtlasGroupsJson
  ).groups,
);

/** Sprite-name regex: a stand-in sprite and its zone letter. */
const STANDIN_NAME = /^standin\/zone-([a-z])\//;

/** The shipped `atlas-groups.json` shape (only `groups` is read here). */
interface AtlasGroupsJson {
  groups: Record<string, string[]>;
}

/**
 * The distinct RGB colours one sprite draws (the `@flash` silhouette's white excluded —
 * the caps of §4.3 are about the art itself).
 *
 * @param name - Sprite name.
 * @returns The colour count.
 */
function spriteColors(name: string): number {
  const sd = atlas.sprites.find((s) => s.name === name);
  expect(sd, name).toBeDefined();
  const colors = new Set<number>();
  for (const frame of sd!.frames) {
    for (let i = 0; i < frame.data.length; i += 4) {
      if (frame.data[i + 3] === 0) continue;
      colors.add((frame.data[i] << 16) | (frame.data[i + 1] << 8) | frame.data[i + 2]);
    }
  }
  return colors.size;
}

/**
 * A digest of a whole packed atlas: the serialised manifest plus every page's PNG bytes.
 *
 * @param built - A `standinAtlas()` result.
 * @returns Lower-case hex sha256.
 */
function digestAtlas(built: StandinAtlas): string {
  const hash = createHash('sha256');
  hash.update(formatManifest(built.manifest));
  for (const page of built.pages) hash.update(page.png);
  return hash.digest('hex');
}

/**
 * The pages of one atlas group: summed PNG bytes over summed page area.
 *
 * @param group - The group name.
 * @returns `{ bytes, area }` over that group's pages.
 */
function groupTotals(group: string): { bytes: number; area: number } {
  const totals = { bytes: 0, area: 0 };
  atlas.manifest.pages.forEach((page, i) => {
    if (page.group !== group) return;
    totals.bytes += atlas.pages[i].png.length;
    totals.area += page.w * page.h;
  });
  return totals;
}

describe('standin atlas groups (W5-14)', () => {
  it('packs common, the shipped zone groups and one stand-in group per zone', () => {
    const expected = new Set([
      'common',
      ...shippedGroups,
      ...ZONE_IDS.map((zoneId) => standinGroupName(zoneId)),
    ]);
    const actual = new Set(atlas.manifest.pages.map((page) => page.group));
    expect([...actual].sort()).toEqual([...expected].sort());
  });

  it('keeps every page inside the packer limit', () => {
    for (const page of atlas.manifest.pages) {
      expect(page.w).toBeLessThanOrEqual(MAX_PAGE_SIZE);
      expect(page.h).toBeLessThanOrEqual(MAX_PAGE_SIZE);
    }
  });

  it('writes every stand-in page as PNG-8 indexed', () => {
    let standin = 0;
    atlas.manifest.pages.forEach((page, i) => {
      if (!page.group.startsWith('standin-')) return;
      standin++;
      const png = atlas.pages[i].png;
      expect(png[24], page.group).toBe(8); // IHDR bit depth
      expect(png[25], page.group).toBe(3); // IHDR colour type (indexed)
    });
    expect(standin).toBe(ZONE_IDS.length);
  });

  it('lands every stand-in group in the RR-7 band of 0.3–0.6 MB per 2048×1024 page', () => {
    for (const zoneId of ZONE_IDS) {
      const { bytes, area } = groupTotals(standinGroupName(zoneId));
      const scaled = Math.round((bytes * MAX_PAGE_SIZE * (MAX_PAGE_SIZE / 2)) / area);
      expect(scaled, `${zoneId} bytes ${bytes} area ${area}`).toBeGreaterThanOrEqual(300_000);
      expect(scaled, `${zoneId} bytes ${bytes} area ${area}`).toBeLessThanOrEqual(600_000);
    }
  });

  it('keeps stand-in frames off the shipped pages and shipped art off theirs', () => {
    for (const [name, sprite] of Object.entries(atlas.manifest.sprites)) {
      const match = STANDIN_NAME.exec(name);
      if (!match) continue;
      for (const frameId of sprite.frames) {
        const page = atlas.manifest.pages[atlas.manifest.frames[frameId].p];
        expect(page.group, `${name} ${frameId}`).toBe(standinGroupName(match[1]));
      }
    }
  });

  it('never writes into the real source tree', () => {
    expect(existsSync(join(repo, 'assets', 'source', 'sprites', 'standin'))).toBe(false);
    expect(shippedGroups.some((g) => g.startsWith('standin'))).toBe(false);
  });
});

describe('standin sprites (W5-14)', () => {
  it('draws ten enemies of four to six frames per zone', () => {
    expect(STANDIN_ENEMY_KINDS.length).toBe(10);
    for (const zoneId of ZONE_IDS) {
      for (const kind of STANDIN_ENEMY_KINDS) {
        const name = standinSpriteName(zoneId, kind.name);
        const sprite = atlas.manifest.sprites[name];
        expect(sprite, name).toBeDefined();
        expect(sprite.frames.length, name).toBeGreaterThanOrEqual(ENEMY_FRAME_MIN);
        expect(sprite.frames.length, name).toBeLessThanOrEqual(ENEMY_FRAME_MAX);
        expect(spriteColors(name), name).toBeLessThanOrEqual(16);
      }
    }
  });

  it('draws the boss at its v2 size in three states, with parts', () => {
    expect(BOSS_HEIGHT).toBe(Math.round(0.6 * PLAYFIELD_H));
    for (const zoneId of ZONE_IDS) {
      const boss = atlas.manifest.sprites[standinSpriteName(zoneId, 'boss')];
      expect(boss, zoneId).toBeDefined();
      expect(boss.frames.length, zoneId).toBe(BOSS_STATES);
      for (const frameId of boss.frames) {
        const frame = atlas.manifest.frames[frameId];
        expect(frame.w, zoneId).toBe(BOSS_WIDTH);
        expect(frame.h, zoneId).toBe(BOSS_HEIGHT);
      }
      expect(spriteColors(standinSpriteName(zoneId, 'boss')), zoneId).toBeLessThanOrEqual(24);
      for (const part of STANDIN_BOSS_PARTS) {
        const name = standinSpriteName(zoneId, part.name);
        const sprite = atlas.manifest.sprites[name];
        expect(sprite, name).toBeDefined();
        expect(sprite.frames.length, name).toBe(part.frames);
        const frame = atlas.manifest.frames[sprite.frames[0]];
        expect([frame.w, frame.h], name).toEqual([part.width, part.height]);
        expect(spriteColors(name), name).toBeLessThanOrEqual(24);
      }
    }
  });

  it('gives enemies, boss and parts a @flash sibling; tiles and layers none', () => {
    for (const zoneId of ZONE_IDS) {
      const flashNames = STANDIN_ENEMY_KINDS.map((k) => k.name).concat(
        'boss',
        STANDIN_BOSS_PARTS.map((p) => p.name),
      );
      for (const base of flashNames) {
        const name = standinSpriteName(zoneId, base);
        expect(atlas.manifest.sprites[name].flash, name).toBe(`${name}@flash`);
        expect(atlas.manifest.sprites[`${name}@flash`], name).toBeDefined();
      }
      for (const tile of STANDIN_TILES) {
        expect(atlas.manifest.sprites[standinSpriteName(zoneId, 'tiles', tile)].flash, tile).toBe(
          null,
        );
      }
      expect(atlas.manifest.sprites[standinSpriteName(zoneId, 'far')].flash, zoneId).toBeNull();
    }
  });
});

describe('standin atlas determinism (W5-14)', () => {
  it('packs byte-identical atlases from the same arguments', () => {
    expect(digestAtlas(standinAtlas())).toBe(digestAtlas(atlas));
  });

  it('packs another atlas from another seed', () => {
    expect(digestAtlas(standinAtlas(['e', 'h'], { seed: 4242 }))).not.toBe(
      digestAtlas(standinAtlas(['e', 'h'])),
    );
  });

  it('reproduces the bytes in a fresh Node process', () => {
    const moduleUrl = pathToFileURL(join(repo, 'scripts', 'assets', 'standin.mjs')).href;
    const manifestUrl = pathToFileURL(join(repo, 'scripts', 'assets', 'manifest.mjs')).href;
    const script =
      'const { createHash } = await import("node:crypto");\n' +
      `const m = await import(${JSON.stringify(moduleUrl)});\n` +
      `const f = await import(${JSON.stringify(manifestUrl)});\n` +
      'const a = m.standinAtlas(["e"], { seed: 4242 });\n' +
      'const h = createHash("sha256");\n' +
      'h.update(f.formatManifest(a.manifest));\n' +
      'for (const p of a.pages) h.update(p.png);\n' +
      'process.stdout.write(h.digest("hex"));\n';
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: repo,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }).trim();
    expect(out).toBe(digestAtlas(standinAtlas(['e'], { seed: 4242 })));
  });

  it('refuses an unknown zone before writing anything', () => {
    expect(() => standinAtlas(['q'])).toThrow(RangeError);
  });
});

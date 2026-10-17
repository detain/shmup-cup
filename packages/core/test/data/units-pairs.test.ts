/**
 * The content ports that take more than one value (plan_resolution.md R1-03, review round 1):
 *
 * - field pairs: a moving block's `x + screenX` is a world value whose column alone is
 *   frame-anchored (`rescaleWorldSum`) — so the bonus-range and zone-b gap entrances keep their
 *   bricks around their region — and a ground enemy's spot on the terrain likewise; a box's `y` +
 *   `h` port as two edges, so a box hanging from the top edge grows by the pad (`rescaleBoxY`);
 * - the top-edge listing (`topEdgeSide`): every value on or above the top edge;
 * - the backdrop (`rescaleBackdrop`): parallax bands placed by what they touch, raster rows
 *   following the bands they bound — stacks stay closed, bottom bands stay on the bottom edge;
 * - the camera's `yTo` is ×k (`rel-px`): with the three pad rows the deepest pan ports exactly.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as core from '../../src/index.js';
import { PLAYFIELD_W } from '../../src/config/index.js';
import { CONTENT_FILE_SCHEMAS, DEFAULT_BLOCK_SCREEN_X } from '../../src/data/index.js';
import { DEFAULT_SPAWN_SCREEN_X } from '../../src/enemies/index.js';
import {
  UNIT_RULES,
  listNumberFields,
  pairRole,
  rescaleBackdrop,
  rescaleBoxY,
  rescaleNumber,
  rescaleWorldSum,
  topEdgeSide,
  walkNumbers,
  type BackdropBand,
  type BackdropRow,
  type FieldPair,
  type NumberLeaf,
  type RescaleOptions,
  type WorldSumPair,
} from '../../src/data/units.js';

/** The v1 → v2 port (plan §2.6 / §2.7): the content's own geometry, not today's constants. */
const V2: RescaleOptions = {
  factor: 1.5,
  topPad: 36,
  fromWidth: 384,
  fromHeight: 200,
  toWidth: 640,
  toHeight: 336,
  tileSize: 8,
};

/** The identity: factor 1, no pad, the same playfield. */
const SAME: RescaleOptions = { ...V2, factor: 1, topPad: 0, toWidth: 384, toHeight: 200 };

/** A block's pair, as a test fixture (the shipped one is read from the schema below). */
const BLOCK: WorldSumPair = {
  rule: 'world-sum',
  camera: 'x',
  screen: 'screenX',
  screenPastEnd: 16,
  when: 'always',
};

const contentRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'content',
);

/**
 * A shipped stage file.
 *
 * @param name - The stage id.
 * @returns Its parsed JSON.
 */
const stageFile = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(contentRoot, 'stages', name + '.stage.json'), 'utf8')) as Record<
    string,
    unknown
  >;

/**
 * Ports every number of a stage file the way the rescale tool must: a field of a pair with its
 * partner (`world-sum` pairs only when they always hold), every other number by its unit. Band
 * rows and looked-up units are left out (they are not what these tests check).
 *
 * @param data - The stage file.
 * @returns JSON path → ported value.
 */
function portStage(data: unknown): Map<string, number> {
  const out = new Map<string, number>();
  walkNumbers(CONTENT_FILE_SCHEMAS.stage, data, (leaf: NumberLeaf) => {
    if (typeof leaf.value !== 'number' || leaf.unit === undefined) return;
    const holder = leaf.container as Record<string, unknown>;
    const pair = leaf.pair;
    if (pair !== undefined && pair.pair.rule === 'world-sum' && pair.pair.when === 'always') {
      const camera = holder[pair.pair.camera] as number;
      const screen = holder[pair.pair.screen] as number | undefined;
      const ported = rescaleWorldSum(camera, screen, pair.pair, V2);
      out.set(leaf.path, pair.role === 'camera' ? ported.camera : ported.screen);
      return;
    }
    if (pair !== undefined && pair.pair.rule === 'box-y') {
      const box = rescaleBoxY(
        holder[pair.pair.top] as number,
        holder[pair.pair.height] as number,
        V2,
      );
      out.set(leaf.path, pair.role === 'top' ? box.top : box.height);
      return;
    }
    const rule = UNIT_RULES[leaf.unit];
    if (rule === 'lookup' || rule === 'band') return;
    out.set(leaf.path, rescaleNumber(leaf.unit, leaf.value, V2));
  });
  return out;
}

describe('core/data units: the top edge', () => {
  it('tells above, on and below the top edge apart (the rescale tool lists the first two)', () => {
    expect(topEdgeSide(-0.5)).toBe('above');
    expect(topEdgeSide(-64)).toBe('above');
    expect(topEdgeSide(0)).toBe('on');
    expect(topEdgeSide(0.25)).toBe('below');
    expect(topEdgeSide(300)).toBe('below');
  });

  it('moves a lone value on the top edge with the pad (a ceiling depth of 0 must)', () => {
    expect(rescaleNumber('world-y', 0, V2)).toBe(36);
    expect(rescaleNumber('world-y', -1, V2)).toBe(-1.5);
  });
});

describe('core/data units: a world x split into a camera x and a column', () => {
  it('keeps the world x ×k and snaps only the column (owner decision O3)', () => {
    // Past the right edge: the column snaps to the end, the event fires 64 px earlier than ×k.
    expect(rescaleWorldSum(400, 400, BLOCK, V2)).toEqual({ camera: 536, screen: 664, lead: 64 });
    expect(rescaleWorldSum(400, 480, BLOCK, V2)).toEqual({ camera: 536, screen: 784, lead: 64 });
    // An absent column stands for the default, PLAYFIELD_W + 16 in the content's geometry.
    expect(rescaleWorldSum(400, undefined, BLOCK, V2)).toEqual(
      rescaleWorldSum(400, 400, BLOCK, V2),
    );
    // Near the left edge nothing leads; near the centre half as much.
    expect(rescaleWorldSum(100, -24, BLOCK, V2)).toEqual({ camera: 150, screen: -36, lead: 0 });
    expect(rescaleWorldSum(100, 192, BLOCK, V2)).toEqual({ camera: 118, screen: 320, lead: 32 });
    for (const [camera, screen] of [
      [400, 400],
      [5200, 480],
      [2280, undefined],
      [70, 150],
    ] as const) {
      const ported = rescaleWorldSum(camera, screen, BLOCK, V2);
      expect(ported.camera + ported.screen).toBe((camera + (screen ?? 400)) * 1.5);
      expect(ported.camera).toBe(camera * 1.5 - ported.lead);
    }
  });

  it('is the identity at factor 1 on the same playfield', () => {
    for (const screen of [-24, 0, 150, 192, 300, 400, 480, undefined]) {
      expect(rescaleWorldSum(1234, screen, BLOCK, SAME)).toEqual({
        camera: 1234,
        screen: screen ?? 400,
        lead: 0,
      });
    }
  });
});

describe('core/data units: a box’s two edges', () => {
  it('grows a box hanging from the top edge by the pad instead of moving it', () => {
    expect(rescaleBoxY(0, 24, V2)).toEqual({ top: 0, height: 72, fromTop: true });
    // Above the edge and into the playfield: the top stays above, the bottom gets the pad.
    expect(rescaleBoxY(-20, 60, V2)).toEqual({ top: -30, height: 126, fromTop: true });
    // Wholly above: ×k only.
    expect(rescaleBoxY(-40, 20, V2)).toEqual({ top: -60, height: 30, fromTop: false });
  });

  it('ports a box below the top edge exactly as its y and h would alone', () => {
    for (const [top, height] of [
      [64, 8],
      [180, 92],
      [14, 48],
      [0.5, 3],
    ] as const) {
      expect(rescaleBoxY(top, height, V2)).toEqual({
        top: rescaleNumber('world-y', top, V2),
        height: rescaleNumber('world-px', height, V2),
        fromTop: false,
      });
    }
  });

  it('is the identity at factor 1 without a pad', () => {
    for (const [top, height] of [
      [0, 24],
      [-20, 60],
      [64, 8],
    ] as const) {
      expect(rescaleBoxY(top, height, SAME)).toMatchObject({ top, height });
    }
  });
});

describe('core/data units: the pairs of the stage schema', () => {
  const { fields, pairs } = listNumberFields(CONTENT_FILE_SCHEMAS.stage);

  it('declares the block, ground-spawn and region pairs, and nothing else', () => {
    // The events of a loop remix share the timeline's schema, and so its pairs.
    for (const list of ['events', 'remix']) {
      expect(
        pairs
          .filter((site) => site.path.startsWith(list + '[]'))
          .map((site) => [
            site.path.slice(list.length),
            site.pair.rule === 'world-sum' ? site.pair.when : site.pair.rule,
          ]),
      ).toEqual([
        ['[]<type=spawn>', 'ground-enemy'],
        ['[]<type=formation>', 'ground-enemy'],
        ['[]<type=trigger>.region', 'box-y'],
        ['[]<type=block>', 'always'],
        ['[]<type=block>', 'box-y'],
        ['[]<type=bonus>.region', 'box-y'],
      ]);
    }
    expect(pairs).toHaveLength(12);
  });

  it('names number fields of the right units, each in one pair at most', () => {
    const unitOf = new Map(fields.map((field) => [field.path, field.unit]));
    const expected: Record<string, string> = {
      camera: 'world-x',
      screen: 'screen-x',
      top: 'world-y',
      height: 'world-px',
    };
    for (const site of pairs) {
      const names: string[] =
        site.pair.rule === 'world-sum'
          ? [site.pair.camera, site.pair.screen]
          : [site.pair.top, site.pair.height];
      for (const name of names) {
        const role = pairRole(site.pair, name) as string;
        expect(unitOf.get(site.path + '.' + name), site.path + '.' + name).toBe(expected[role]);
        const field = fields.find((f) => f.path === site.path + '.' + name);
        expect(field?.pair?.pair).toBe(site.pair);
        expect(field?.pair?.role).toBe(role);
      }
    }
    expect(fields.find((f) => f.path === 'events[]<type=block>.w')?.pair).toBeUndefined();
    expect(fields.find((f) => f.path === 'events[]<type=spawn>.y')?.pair).toBeUndefined();
  });

  it('takes the default columns from the code’s constants', () => {
    const worldSums = pairs
      .map((site) => site.pair)
      .filter((pair: FieldPair): pair is WorldSumPair => pair.rule === 'world-sum');
    const block = worldSums.find((pair) => pair.when === 'always');
    const ground = worldSums.find((pair) => pair.when === 'ground-enemy');
    expect(block?.screenPastEnd).toBe(DEFAULT_BLOCK_SCREEN_X - PLAYFIELD_W);
    expect(ground?.screenPastEnd).toBe(DEFAULT_SPAWN_SCREEN_X - PLAYFIELD_W);
  });

  it('hands the walk’s visitor each pair field’s pair, a defaulted column included', () => {
    const doc = stageFile('gimmick-range');
    const leaves: NumberLeaf[] = [];
    walkNumbers(CONTENT_FILE_SCHEMAS.stage, doc, (leaf) => leaves.push(leaf));
    // events[6] is a block without screenX: its x carries the pair, and the default stands in.
    const x = leaves.find((leaf) => leaf.path === 'events[6].x');
    expect(x?.pair?.role).toBe('camera');
    expect(leaves.some((leaf) => leaf.path === 'events[6].screenX')).toBe(false);
    expect(leaves.find((leaf) => leaf.path === 'events[6].y')?.pair?.role).toBe('top');
    expect(leaves.find((leaf) => leaf.path === 'events[6].h')?.pair?.role).toBe('height');
    expect(leaves.find((leaf) => leaf.path === 'events[6].w')?.pair).toBeUndefined();
    expect(leaves.find((leaf) => leaf.path === 'camera[0].x')?.pair).toBeUndefined();
  });
});

describe('core/data units: the gap entrances keep their bricks around their region', () => {
  for (const [stage, left, right, region] of [
    ['bonus-range', 1, 2, 3],
    ['zone-b', 33, 34, 35],
  ] as const) {
    it(`${stage}: events[${String(left)}]–[${String(right)}] around events[${String(region)}]`, () => {
      const data = stageFile(stage);
      const events = data['events'] as Record<string, unknown>[];
      const brick = (index: number) => events[index] as Record<string, number>;
      /** A block's column as written (the default stands 16 px past the right edge). */
      const column = (index: number): number => brick(index)['screenX'] ?? V2.fromWidth + 16;
      // As written: the region is exactly the gap between the bricks, from the top edge down.
      const gap = (events[region] as { region: Record<string, number> }).region;
      expect(brick(left).x + column(left) + brick(left).w).toBe(gap.x);
      expect(brick(right).x + column(right)).toBe(gap.x + gap.w);
      expect([brick(left).y, gap.y, brick(left).h]).toEqual([0, 0, gap.h]);

      const ported = portStage(data);
      const get = (path: string): number => ported.get(path) as number;
      const leftEdge = get(`events[${String(left)}].x`) + get(`events[${String(left)}].screenX`);
      const rightEdge = get(`events[${String(right)}].x`) + get(`events[${String(right)}].screenX`);
      const gapX = get(`events[${String(region)}].region.x`);
      const gapW = get(`events[${String(region)}].region.w`);
      // The bricks stand ×k and still close the region in.
      expect(leftEdge).toBe((brick(left).x + column(left)) * 1.5);
      expect(leftEdge + get(`events[${String(left)}].w`)).toBe(gapX);
      expect(rightEdge).toBe(gapX + gapW);
      // Both still appear past the new right edge.
      expect(get(`events[${String(left)}].screenX`)).toBeGreaterThan(V2.toWidth);
      // Bricks and region still hang from the top edge, grown by the pad together.
      expect(get(`events[${String(left)}].y`)).toBe(0);
      expect(get(`events[${String(region)}].region.y`)).toBe(0);
      expect(get(`events[${String(left)}].h`)).toBe(72);
      expect(get(`events[${String(region)}].region.h`)).toBe(72);
      // Ported one value at a time (the old rules), the region would miss the gap.
      const alone =
        rescaleNumber('world-x', brick(left).x, V2) + rescaleNumber('screen-x', column(left), V2);
      expect(alone + rescaleNumber('world-px', brick(left).w, V2)).not.toBe(gapX);
    });
  }
});

describe('core/data units: the camera’s yTo', () => {
  it('is ×k, so a pan to the bottom of a map ports to the bottom of the padded map', () => {
    const fields = listNumberFields(CONTENT_FILE_SCHEMAS.stage).fields;
    expect(fields.find((field) => field.path === 'camera[].yTo')?.unit).toBe('rel-px');
    const padRows = V2.topPad / (V2.tileSize * V2.factor);
    let deepest = 0;
    for (const name of ['zone-d', 'gimmick-range']) {
      const data = stageFile(name);
      const rows = (data['tilemap'] as { rowsTall: number }).rowsTall;
      const lowest = Math.max(...(data['camera'] as { yTo?: number }[]).map((key) => key.yTo ?? 0));
      // Both shipped pans scroll to the map's bottom in v1 …
      expect(lowest + V2.fromHeight, name).toBe(rows * V2.tileSize);
      // … and ×k reaches exactly the bottom of the map with its three pad rows.
      const ported = rescaleNumber('rel-px', lowest, V2);
      expect(ported + V2.toHeight, name).toBe((rows + padRows) * V2.tileSize * V2.factor);
      deepest = Math.max(deepest, ported);
    }
    expect(deepest).toBe(300);
  });
});

describe('core/data units: the backdrop', () => {
  /**
   * Ported tops and spans of the bands.
   *
   * @param bands - The bands.
   * @param rows - The rows.
   * @param options - The geometry.
   * @returns `[top, bottom]` of every band, then every row.
   */
  const layout = (
    bands: readonly BackdropBand[],
    rows: readonly BackdropRow[] = [],
    options: RescaleOptions = V2,
  ) => {
    const out = rescaleBackdrop(bands, rows, options);
    return {
      spans: out.bands.map((band, i) => [band.y, band.y + (bands[i]?.height ?? 0) * 1.5]),
      placements: out.bands.map((band) => band.placement),
      rows: out.rows.map((row) => row.y),
      rowPlacements: out.rows.map((row) => row.placement),
      seams: out.seams,
    };
  };

  it('a band row is placed with the backdrop (its unit is band-y)', () => {
    const fields = listNumberFields(CONTENT_FILE_SCHEMAS.stage).fields;
    expect(fields.find((field) => field.path === 'parallax[].y')?.unit).toBe('band-y');
    expect(UNIT_RULES['band-y']).toBe('band');
  });

  it('keeps a stack of tiles closed and a band on the bottom edge on it (zone-a)', () => {
    const result = layout([
      { y: 0, height: 128 },
      { y: 128, height: 128 },
      { y: 152, height: 48 },
    ]);
    expect(result.spans).toEqual([
      [0, 192],
      [192, 384],
      [264, 336],
    ]);
    expect(result.placements).toEqual(['top', 'chain', 'bottom']);
    expect(result.seams).toEqual([]);
  });

  it('keeps a raster on the bands it distorts (zone-g, zone-h)', () => {
    const facets = [
      { y: 0, height: 64 },
      { y: 64, height: 64 },
      { y: 128, height: 64 },
    ];
    const zoneG = layout(
      [...facets, { y: 144, height: 56 }],
      [
        { y: 144, kind: 'follow' },
        { y: 200, kind: 'follow' },
      ],
    );
    expect(zoneG.spans).toEqual([
      [0, 96],
      [96, 192],
      [192, 288],
      [252, 336],
    ]);
    expect(zoneG.rows).toEqual([252, 336]);
    expect(zoneG.rowPlacements).toEqual(['band-edge', 'band-edge']);
    // zone-h's haze starts 2 rows over its pipes: 3 rows over them in v2 (O3 alone gave 243).
    const zoneH = layout(
      [...facets, { y: 152, height: 48 }],
      [
        { y: 150, kind: 'follow' },
        { y: 200, kind: 'follow' },
      ],
    );
    expect(zoneH.rows).toEqual([261, 336]);
    expect(zoneH.rowPlacements).toEqual(['near-band-edge', 'band-edge']);
  });

  it('chains a band standing on a bottom band, and lets rasters follow both (raster-range)', () => {
    const result = layout(
      [
        { y: 0, height: 128 },
        { y: 128, height: 128 },
        { y: 112, height: 40 },
        { y: 152, height: 48 },
      ],
      [
        { y: 112, kind: 'follow' },
        { y: 152, kind: 'follow' },
        { y: 152, kind: 'follow' },
        { y: 200, kind: 'follow' },
        { y: 40, kind: 'follow' },
        { y: 112, kind: 'follow' },
      ],
    );
    expect(result.spans).toEqual([
      [0, 192],
      [192, 384],
      [204, 264],
      [264, 336],
    ]);
    expect(result.placements).toEqual(['top', 'chain', 'chain', 'bottom']);
    expect(result.rows).toEqual([204, 264, 264, 336, 60, 204]);
  });

  it('sits a band on the Mode-7 horizon (dimension)', () => {
    const result = layout(
      [{ y: 52, height: 48 }],
      [
        { y: 100, kind: 'anchor' },
        { y: 200, kind: 'anchor' },
      ],
    );
    expect(result.spans).toEqual([[96, 168]]);
    expect(result.placements).toEqual(['row']);
    expect(result.rows).toEqual([168, 336]);
  });

  it('places a free band by its nearer edge and keeps its raster on it (zone-b, zone-c, zone-d)', () => {
    const zoneB = layout(
      [{ y: 24, height: 64 }],
      [
        { y: 24, kind: 'follow' },
        { y: 88, kind: 'follow' },
      ],
    );
    expect(zoneB.spans).toEqual([[36, 132]]);
    expect(zoneB.placements).toEqual(['nearest-top']);
    expect(zoneB.rows).toEqual([36, 132]);
    const zoneC = layout(
      [
        { y: 12, height: 40 },
        { y: 136, height: 40 },
      ],
      [
        { y: 8, kind: 'follow' },
        { y: 60, kind: 'follow' },
        { y: 136, kind: 'follow' },
        { y: 176, kind: 'follow' },
      ],
    );
    expect(zoneC.spans).toEqual([
      [18, 78],
      [240, 300],
    ]);
    expect(zoneC.placements).toEqual(['nearest-top', 'nearest-bottom']);
    expect(zoneC.rows).toEqual([12, 90, 240, 300]);
    const zoneD = layout(
      [
        { y: -72, height: 128 },
        { y: 128, height: 56 },
        { y: 256, height: 40 },
      ],
      [
        { y: 120, kind: 'follow' },
        { y: 184, kind: 'follow' },
        { y: 150, kind: 'follow' },
        { y: 200, kind: 'follow' },
      ],
    );
    expect(zoneD.spans).toEqual([
      [-108, 84],
      [228, 312],
      [420, 480],
    ]);
    expect(zoneD.rows).toEqual([216, 312, 243, 336]);
    expect(zoneD.rowPlacements).toEqual(['near-band-edge', 'band-edge', 'snap', 'snap']);
  });

  it('follows a band edge only within a tile, so rows equal as written stay equal', () => {
    // Two rasters meeting at row 150, 22 rows under a band's edge: both snap alike.
    const result = layout(
      [{ y: 0, height: 128 }],
      [
        { y: 150, kind: 'follow' },
        { y: 150, kind: 'follow' },
      ],
    );
    expect(result.rows).toEqual([243, 243]);
    expect(result.rowPlacements).toEqual(['snap', 'snap']);
  });

  it('reports a seam the pad opens between a top stack and a bottom band that met', () => {
    const result = layout([
      { y: 0, height: 152 },
      { y: 152, height: 48 },
    ]);
    expect(result.spans).toEqual([
      [0, 228],
      [264, 336],
    ]);
    expect(result.seams).toEqual([[0, 1]]);
    expect(rescaleBackdrop([{ y: 0, height: 152 }], [], V2).conflicts).toEqual([]);
  });

  it('reports a band that touched two anchors and keeps only one (review round 2)', () => {
    // A full-height band: it stays on the top edge, its art ×k ends 36 px above the bottom edge.
    const full = rescaleBackdrop([{ y: 0, height: 200 }], [], V2);
    expect(full.bands).toEqual([{ y: 0, placement: 'top' }]);
    expect(full.conflicts).toEqual([{ band: 0, anchor: 'bottom', edge: 'bottom', gap: 36 }]);
    expect(full.seams).toEqual([]);
    // A sky from the top edge down to the Mode-7 horizon: 0–150, the horizon snaps to 168.
    const horizon: BackdropRow[] = [
      { y: 100, kind: 'anchor' },
      { y: 200, kind: 'anchor' },
    ];
    const sky = rescaleBackdrop([{ y: 0, height: 100 }], horizon, V2);
    expect(sky.bands).toEqual([{ y: 0, placement: 'top' }]);
    expect(sky.rows.map((row) => row.y)).toEqual([168, 336]);
    expect(sky.conflicts).toEqual([{ band: 0, anchor: 0, edge: 'bottom', gap: 18 }]);
    // A floor band from the horizon to the bottom edge stays on the bottom edge: its top starts
    // 18 px under the horizon (it touched the Mode-7 bottom row too, and keeps it).
    const floor = rescaleBackdrop([{ y: 100, height: 100 }], horizon, V2);
    expect(floor.bands).toEqual([{ y: 186, placement: 'bottom' }]);
    expect(floor.conflicts).toEqual([{ band: 0, anchor: 0, edge: 'top', gap: 18 }]);
    // A band on one anchor keeps it: nothing to report.
    expect(rescaleBackdrop([{ y: 52, height: 48 }], horizon, V2).conflicts).toEqual([]);
    expect(rescaleBackdrop([{ y: 152, height: 48 }], horizon, V2).conflicts).toEqual([]);
  });

  it('is the identity at factor 1 on the same playfield', () => {
    const bands = [
      { y: -72, height: 128 },
      { y: 0, height: 64 },
      { y: 64, height: 64 },
      { y: 52, height: 48 },
      { y: 24, height: 64 },
      { y: 136, height: 40 },
      { y: 152, height: 48 },
    ];
    const rows: BackdropRow[] = [
      { y: 100, kind: 'anchor' },
      { y: 8, kind: 'follow' },
      { y: 150, kind: 'follow' },
      { y: 176, kind: 'follow' },
      { y: 40, kind: 'follow' },
    ];
    const out = rescaleBackdrop(bands, rows, SAME);
    expect(out.bands.map((band) => band.y)).toEqual(bands.map((band) => band.y));
    expect(out.rows.map((row) => row.y)).toEqual(rows.map((row) => row.y));
    expect(out.seams).toEqual([]);
    expect(out.conflicts).toEqual([]);
    const twoAnchors = rescaleBackdrop([{ y: 0, height: 200 }], rows, SAME);
    expect(twoAnchors.conflicts).toEqual([]);
  });
});

describe('core/data units: the new API is public tooling', () => {
  it('re-exports the pair, backdrop and top-edge functions from the package entry', () => {
    expect(core.rescaleWorldSum).toBe(rescaleWorldSum);
    expect(core.rescaleBoxY).toBe(rescaleBoxY);
    expect(core.rescaleBackdrop).toBe(rescaleBackdrop);
    expect(core.topEdgeSide).toBe(topEdgeSide);
    expect(core.pairRole).toBe(pairRole);
  });
});

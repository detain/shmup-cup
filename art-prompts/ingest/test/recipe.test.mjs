/**
 * Recipe validation: the format, the slicing, and the art bible's rules per category
 * (colour caps §4.3, alpha §3.6, dither §3.7, outline §3.4, palette cycling §4.4).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CATEGORIES, RECIPE_FORMAT, parseRecipe } from '../lib/recipe.mjs';

/** A minimal valid recipe. */
const MIN = Object.freeze({
  format: RECIPE_FORMAT,
  name: 'enemies/gyre',
  category: 'enemy',
  frame: { width: 24, height: 24 },
  sources: [{ image: 'art/gyre.png' }],
});

/**
 * Parses a variant of the minimal recipe.
 *
 * @param {Record<string, unknown>} change - Fields to set (`undefined` deletes).
 * @returns {ReturnType<typeof parseRecipe>} The result.
 */
const parse = (change) => parseRecipe({ ...MIN, ...change });

/**
 * The issues at one path.
 *
 * @param {ReturnType<typeof parseRecipe>} result - A parse result.
 * @param {string} path - JSON path.
 * @returns {string[]} `<level>: <message>` lines.
 */
const at = (result, path) =>
  result.issues.filter((i) => i.path === path).map((i) => `${i.level}: ${i.message}`);

describe('parseRecipe', () => {
  it('normalises a minimal recipe with the bible defaults', () => {
    const { recipe, issues } = parseRecipe(MIN);
    assert.deepEqual(issues, []);
    assert.ok(recipe !== null);
    assert.equal(recipe.key.mode, 'green');
    assert.equal(recipe.key.despill, 2);
    assert.equal(recipe.alpha, 'binary');
    assert.equal(recipe.palette.max, 16, 'an enemy up to 30 px gets 16 colours');
    assert.equal(recipe.outline.enabled, true);
    assert.equal(recipe.outline.edges, 'open');
    assert.deepEqual(recipe.dither, { size: 0, strength: 24 });
    assert.deepEqual(recipe.sources[0].slicing, { kind: 'whole' });
    assert.equal(recipe.scale.fit, 'stretch');
  });

  it('gives larger enemies 24 colours and tiles closed outline edges', () => {
    assert.equal(parse({ frame: { width: 40, height: 20 } }).recipe?.palette.max, 24);
    assert.equal(
      parse({ category: 'tile', frame: { width: 12, height: 12 } }).recipe?.outline.edges,
      'closed',
    );
    assert.equal(parse({ category: 'bullet' }).recipe?.palette.max, 5);
    assert.equal(parse({ category: 'bullet' }).recipe?.outline.enabled, false);
  });

  it('reads grids, boxes and crops', () => {
    const grid = parse({
      sources: [
        {
          image: 'a.png',
          grid: { cellWidth: 64, cellHeight: 48, columns: 3, rows: 2, count: 5, gapX: 2 },
        },
      ],
    });
    assert.deepEqual(grid.recipe?.sources[0].slicing, {
      kind: 'grid',
      x: 0,
      y: 0,
      cellWidth: 64,
      cellHeight: 48,
      columns: 3,
      rows: 2,
      gapX: 2,
      gapY: 0,
      count: 5,
    });
    const boxes = parse({
      sources: [
        {
          image: 'a.png',
          frames: [
            [0, 0, 8, 8],
            [8, 0, 8, 8],
          ],
        },
      ],
    });
    assert.equal(boxes.recipe?.sources[0].slicing.kind, 'boxes');
    assert.deepEqual(
      at(parse({ sources: [{ image: 'a.png', crop: [0, 0, 8, 8], grid: {} }] }), 'sources[0]'),
      ['error: give one of crop, frames or grid, not crop and grid'],
    );
    assert.match(
      at(
        parse({
          sources: [
            {
              image: 'a.png',
              grid: { cellWidth: 8, cellHeight: 8, columns: 2, rows: 1, count: 3 },
            },
          ],
        }),
        'sources[0].grid.count',
      )[0],
      /1–2/,
    );
  });

  for (const [
    label,
    change,
    path,
    pattern,
  ] of /** @type {[string, Record<string, unknown>, string, RegExp][]} */ ([
    ['an unknown field', { colour: 1 }, 'colour', /unknown field/],
    ['a wrong format', { format: 'v0' }, 'format', /shmup-ingest-recipe@1/],
    ['a bad name', { name: 'Enemies/Gyre' }, 'name', /sprite name/],
    ['an unknown category', { category: 'monster' }, 'category', /one of/],
    [
      'a frame too large for an atlas page',
      { frame: { width: 4096, height: 8 } },
      'frame',
      /1–2046/,
    ],
    ['no sources', { sources: [] }, 'sources', /non-empty/],
    [
      'an absolute source path',
      { sources: [{ image: '/tmp/a.png' }] },
      'sources[0].image',
      /relative/,
    ],
    [
      'translucent bullets',
      { category: 'bullet', alpha: 'translucent', key: { mode: 'black' } },
      'alpha',
      /never translucent/,
    ],
    [
      'a black key on binary art',
      { key: { mode: 'black' } },
      'key.mode',
      /translucent or additive art only/,
    ],
    [
      'a green key on additive art',
      { category: 'glow', alpha: 'additive', key: { mode: 'green' } },
      'key.mode',
      /black key/,
    ],
    ['dither on a small enemy', { dither: 'bayer4' }, 'dither', /no dither on a enemy/],
    [
      'dither on a near layer',
      { category: 'backdrop', layer: 'near', dither: 'bayer2' },
      'dither',
      /near layer/,
    ],
    ['a backdrop without a layer', { category: 'backdrop' }, 'layer', /names its layer/],
    [
      'an outline on additive art',
      { category: 'glow', alpha: 'additive', outline: true },
      'outline',
      /no outline/,
    ],
    [
      'a translucent cycled layer',
      {
        category: 'backdrop',
        layer: 'far',
        alpha: 'translucent',
        key: { mode: 'alpha' },
        cycles: [{ colors: ['#203850'] }],
      },
      'alpha',
      /palette-cycled/,
    ],
    [
      'a dithered cycled layer',
      { category: 'backdrop', layer: 'far', dither: 'bayer4', cycles: [{ stage: 'zone-b' }] },
      'dither',
      /never dithered/,
    ],
    [
      'holes with a black key',
      { category: 'glow', alpha: 'additive', holes: 'auto' },
      'holes',
      /green key/,
    ],
    ['a bad anchor', { anchor: [1.5, 2] }, 'anchor', /integers/],
    [
      'a reversed animation',
      { animations: { spin: { from: 3, to: 1 } } },
      'animations.spin',
      /from ≤ to/,
    ],
    ['a bad hole seed', { holes: { seeds: [[1]] } }, 'holes.seeds[0]', /\[x, y\]/],
    [
      'an unknown provenance field',
      { provenance: { modle: 'flux2' } },
      'provenance.modle',
      /unknown field/,
    ],
    ['an unknown cleanup', { provenance: { cleanup: 'lots' } }, 'provenance.cleanup', /"none"/],
    ['an unknown use', { provenance: { use: 'both' } }, 'provenance.use', /"pixels"/],
    [
      'a review without a date',
      { provenance: { reviewed: { by: 'me' } } },
      'provenance.reviewed',
      /YYYY-MM-DD/,
    ],
  ])) {
    it(`rejects ${label}`, () => {
      const result = parse(change);
      assert.equal(result.recipe, null);
      const lines = at(result, path);
      assert.ok(
        lines.some((l) => l.startsWith('error:') && pattern.test(l)),
        `${path}: ${JSON.stringify(result.issues)}`,
      );
    });
  }

  it('allows dither where the bible does: far and mid layers, boss bodies from 96 px, scenes', () => {
    assert.ok(parse({ category: 'backdrop', layer: 'far', dither: 'bayer4' }).recipe !== null);
    assert.ok(
      parse({ category: 'backdrop', layer: 'mid', dither: { matrix: 2, strength: 16 } }).recipe !==
        null,
    );
    assert.ok(
      parse({ category: 'boss-body', frame: { width: 120, height: 80 }, dither: 'bayer4' })
        .recipe !== null,
    );
    assert.equal(
      parse({ category: 'boss-body', frame: { width: 60, height: 40 }, dither: 'bayer4' }).recipe,
      null,
    );
    assert.ok(
      parse({ category: 'scene', frame: { width: 640, height: 360 }, dither: 'bayer2' }).recipe !==
        null,
    );
  });

  it('warns (and runs) for a colour cap over the bible and an outline the bible does not draw', () => {
    const over = parse({ palette: { max: 40 } });
    assert.ok(over.recipe !== null);
    assert.match(at(over, 'palette.max')[0], /^warning: .*cap of 16/);
    const bullet = parse({ category: 'bullet', outline: true });
    assert.ok(bullet.recipe !== null);
    assert.match(at(bullet, 'outline')[0], /^warning: /);
  });

  it('accepts holes as "auto" or seeds, despill off, cleanup and key settings', () => {
    const { recipe } = parse({
      holes: { auto: true, minArea: 20, seeds: [[3, 4]] },
      despill: false,
      cleanup: { open: 1, minIsland: 12 },
      key: { color: '#3cf102', tolerance: 40, test: false },
    });
    assert.ok(recipe !== null);
    assert.deepEqual(recipe.key.holes, { auto: true, minArea: 20, seeds: [[3, 4]] });
    assert.equal(recipe.key.despill, 0);
    assert.equal(recipe.key.open, 1);
    assert.equal(recipe.key.minIsland, 12);
    assert.equal(recipe.key.color, 0x3cf102);
    assert.equal(recipe.key.test, null);
  });

  it('defaults translucent and additive art to a black key and no outline', () => {
    const { recipe } = parse({ category: 'shield', alpha: 'translucent' });
    assert.equal(recipe?.key.mode, 'black');
    assert.equal(recipe?.outline.enabled, false);
  });

  it('has a rule for every category the bible sizes', () => {
    for (const name of [
      'ship',
      'option',
      'shield',
      'bullet',
      'laser',
      'item',
      'enemy',
      'boss-part',
      'boss-body',
      'fx',
      'glow',
      'backdrop',
      'tile',
      'scene',
    ]) {
      assert.ok(Object.hasOwn(CATEGORIES, name), name);
    }
  });
});

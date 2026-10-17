/**
 * The per-sprite recipe (`<name>.recipe.json`, format `shmup-ingest-recipe@1`): parsing,
 * validation against the art bible's rules per category, and the normalised settings the
 * pipeline runs on. The format is documented in `docs/dev/real-assets.md`.
 *
 * Validation never throws: every problem is an issue with a JSON path, `error` (the recipe
 * is not run) or `warning` (it runs; the report shows the warning).
 *
 * @module
 */
import { DEFAULT_GREEN_TEST } from './key.mjs';
import { parseHex } from './image.mjs';

/** The recipe format id. */
export const RECIPE_FORMAT = 'shmup-ingest-recipe@1';

/** Sprite names, as `scripts/assets/sprite-source.mjs` defines them. */
export const SPRITE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

/** Animation names, as the asset pipeline defines them. */
const ANIMATION_NAME_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

/** The largest frame an atlas page holds (2048 minus the 1-px extrusion each side). */
export const MAX_FRAME_SIZE = 2046;

/**
 * Rules per sprite category, from the art bible: the colour cap (§4.3), the alpha recipes
 * allowed (§3.6), where ordered dither is allowed (§3.7) and the outline default (§3.4).
 *
 * `dither`: `false` never; `true` always; `'large'` only when the frame's longer side is
 * ≥ 96 px (boss bodies); `'layer'` only on the far and mid backdrop layers.
 * `cap` is a number, or `'enemy'` (16 up to 30 px, 24 above).
 *
 * @type {Readonly<Record<string, { cap: number | 'enemy', alpha: readonly string[],
 *   dither: boolean | 'large' | 'layer', outline: boolean, edges: 'open' | 'closed' }>>}
 */
export const CATEGORIES = Object.freeze({
  ship: { cap: 24, alpha: ['binary'], dither: false, outline: true, edges: 'open' },
  option: { cap: 12, alpha: ['binary'], dither: false, outline: true, edges: 'open' },
  shield: {
    cap: 12,
    alpha: ['binary', 'translucent'],
    dither: false,
    outline: true,
    edges: 'open',
  },
  'player-shot': { cap: 12, alpha: ['binary'], dither: false, outline: true, edges: 'open' },
  bullet: { cap: 5, alpha: ['binary'], dither: false, outline: false, edges: 'open' },
  laser: { cap: 5, alpha: ['binary'], dither: false, outline: false, edges: 'open' },
  item: { cap: 12, alpha: ['binary'], dither: false, outline: true, edges: 'open' },
  'point-item': { cap: 6, alpha: ['binary'], dither: false, outline: true, edges: 'open' },
  particle: { cap: 6, alpha: ['binary', 'additive'], dither: false, outline: false, edges: 'open' },
  enemy: { cap: 'enemy', alpha: ['binary'], dither: false, outline: true, edges: 'open' },
  'boss-part': { cap: 24, alpha: ['binary'], dither: false, outline: true, edges: 'open' },
  'boss-body': { cap: 32, alpha: ['binary'], dither: 'large', outline: true, edges: 'open' },
  'set-piece': { cap: 32, alpha: ['binary'], dither: false, outline: true, edges: 'open' },
  fx: {
    cap: 24,
    alpha: ['binary', 'translucent', 'additive'],
    dither: false,
    outline: true,
    edges: 'open',
  },
  glow: { cap: 32, alpha: ['additive'], dither: false, outline: false, edges: 'open' },
  backdrop: {
    cap: 32,
    alpha: ['binary', 'translucent'],
    dither: 'layer',
    outline: false,
    edges: 'open',
  },
  tile: { cap: 32, alpha: ['binary'], dither: false, outline: true, edges: 'closed' },
  scene: { cap: 32, alpha: ['binary'], dither: true, outline: false, edges: 'open' },
  ui: { cap: 32, alpha: ['binary'], dither: false, outline: true, edges: 'open' },
});

/** Backdrop layers (bible §5.10); the lighting budget covers far, mid-far and mid. */
export const LAYERS = Object.freeze(['far', 'mid-far', 'mid', 'near', 'foreground']);

/** Keys a recipe may have. */
const RECIPE_KEYS = [
  'format',
  'name',
  'category',
  'frame',
  'frameCount',
  'sources',
  'fit',
  'align',
  'key',
  'holes',
  'despill',
  'cleanup',
  'snap',
  'coverage',
  'alpha',
  'palette',
  'dither',
  'outline',
  'cycles',
  'reserved',
  'anchor',
  'animations',
  'layer',
  'edit',
  'provenance',
  'notes',
];

/** Keys of a recipe's (or a source's) `provenance` block. */
const PROVENANCE_KEYS = [
  'model',
  'prompt',
  'seed',
  'sidecar',
  'author',
  'use',
  'cleanup',
  'reviewed',
  'notes',
];

/** `pixels` | `reference` (art-provenance.md §2). */
const USES = ['pixels', 'reference'];

/** `none` | `light` | `heavy` | `redrawn` (art-provenance.md §5). */
const CLEANUPS = ['none', 'light', 'heavy', 'redrawn'];

/**
 * A recipe problem.
 *
 * @typedef {object} RecipeIssue
 * @property {string} path - JSON path in the recipe, e.g. `sources[0].grid.columns`.
 * @property {string} message - What is wrong.
 * @property {'error' | 'warning'} level - `error` stops the recipe.
 */

/**
 * How one source image is cut into frames.
 *
 * @typedef {{ kind: 'whole' } | { kind: 'boxes', boxes: [number, number, number, number][] }
 *   | { kind: 'grid', x: number, y: number, cellWidth: number, cellHeight: number,
 *       columns: number, rows: number, gapX: number, gapY: number, count: number }} Slicing
 */

/**
 * Provenance a recipe states (it overrides the candidate sidecar's fields).
 *
 * @typedef {object} ProvenanceHints
 * @property {string} [model] - Model group key (`flux2`, `sd35`, …) or `none` (hand-made).
 * @property {{ file?: string, entry?: string }} [prompt] - Library file and entry id.
 * @property {number | null} [seed] - Generation seed.
 * @property {string | false} [sidecar] - Candidate sidecar path, or `false` for none.
 * @property {string} [author] - Who made or cleaned it.
 * @property {'pixels' | 'reference'} [use] - How the pixels may be used (default `pixels`).
 * @property {'none' | 'light' | 'heavy' | 'redrawn'} [cleanup] - The hand work in it; default
 *   `light` when the hand-edit layer changed a pixel, else `none`.
 * @property {{ on: string, by: string }} [reviewed] - The content review (look-alikes, logos,
 *   stray text — art-provenance.md §6 rule 5): when and by whom.
 * @property {string} [notes] - Free text.
 */

/**
 * A normalised recipe.
 *
 * @typedef {object} Recipe
 * @property {string} name - Sprite name.
 * @property {string} category - A {@link CATEGORIES} key.
 * @property {{ width: number, height: number }} frame - Target frame size.
 * @property {number | null} frameCount - Expected frame count.
 * @property {{ image: string, slicing: Slicing, provenance: ProvenanceHints }[]} sources -
 *   Source images (root-relative paths) in frame order.
 * @property {import('./key.mjs').KeySettings} key - Keying.
 * @property {import('./scale.mjs').ScaleSettings} scale - Downscale.
 * @property {'binary' | 'translucent' | 'additive'} alpha - Alpha recipe.
 * @property {{ name: string | null, colors: number[] | null, max: number, outline: number | null }} palette
 *   - Palette: a named file, an explicit list, or adaptive (`colors` null) up to `max`.
 * @property {{ size: 0 | 2 | 4, strength: number }} dither - Ordered dither.
 * @property {{ enabled: boolean, color: number | null, edges: 'open' | 'closed' }} outline -
 *   Outline pass.
 * @property {({ stage: string, layer: string | null } | { colors: number[] })[]} cycles -
 *   Ramps this art is quantised to exactly.
 * @property {number[]} reserved - Extra reserved colours.
 * @property {[number, number] | null} anchor - Anchor in frame pixels.
 * @property {{ name: string, from: number, to: number, direction: string }[]} animations -
 *   Frame tags.
 * @property {string | null} layer - Backdrop layer.
 * @property {number} erase - Edit-layer erase colour.
 * @property {ProvenanceHints} provenance - Recipe-wide provenance.
 * @property {string} notes - Free text.
 */

/**
 * Whether a value is a plain object.
 *
 * @param {unknown} v - Any value.
 * @returns {v is Record<string, unknown>} `true` for non-null, non-array objects.
 */
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Whether a value is an integer within a range.
 *
 * @param {unknown} v - Any value.
 * @param {number} lo - Minimum.
 * @param {number} hi - Maximum.
 * @returns {v is number} `true` when it is.
 */
const isInt = (v, lo, hi) =>
  Number.isInteger(v) && /** @type {number} */ (v) >= lo && /** @type {number} */ (v) <= hi;

/**
 * Parses and validates a recipe document.
 *
 * @param {unknown} json - The parsed recipe.
 * @returns {{ recipe: Recipe | null, issues: RecipeIssue[] }} The normalised recipe (`null`
 *   when there is any error) and every issue.
 *
 * @example
 * parseRecipe({ format: 'shmup-ingest-recipe@1', name: 'enemies/gyre', category: 'enemy',
 *   frame: { width: 30, height: 30 }, sources: [{ image: 'art/gyre.png' }] });
 */
export function parseRecipe(json) {
  /** @type {RecipeIssue[]} */
  const issues = [];
  /**
   * Records an error.
   *
   * @param {string} path - JSON path.
   * @param {string} message - Problem.
   */
  const error = (path, message) => issues.push({ path, message, level: 'error' });
  /**
   * Records a warning.
   *
   * @param {string} path - JSON path.
   * @param {string} message - Problem.
   */
  const warn = (path, message) => issues.push({ path, message, level: 'warning' });

  if (!isObject(json)) {
    return {
      recipe: null,
      issues: [{ path: '', message: 'a recipe is a JSON object', level: 'error' }],
    };
  }
  for (const k of Object.keys(json)) if (!RECIPE_KEYS.includes(k)) error(k, 'unknown field');
  if (json.format !== RECIPE_FORMAT) error('format', `must be "${RECIPE_FORMAT}"`);

  const name = json.name;
  if (typeof name !== 'string' || !SPRITE_NAME_PATTERN.test(name)) {
    error('name', 'must be a sprite name like "enemies/gyre" (lower-case kebab segments)');
  }

  const category = json.category;
  const rules =
    typeof category === 'string' && Object.prototype.hasOwnProperty.call(CATEGORIES, category)
      ? CATEGORIES[category]
      : null;
  if (rules === null) error('category', `must be one of ${Object.keys(CATEGORIES).join(', ')}`);

  let width = 1;
  let height = 1;
  if (
    !isObject(json.frame) ||
    !isInt(json.frame.width, 1, MAX_FRAME_SIZE) ||
    !isInt(json.frame.height, 1, MAX_FRAME_SIZE)
  ) {
    error('frame', `must be { "width", "height" }, integers 1–${MAX_FRAME_SIZE}`);
  } else {
    width = /** @type {number} */ (json.frame.width);
    height = /** @type {number} */ (json.frame.height);
    for (const k of Object.keys(json.frame))
      if (k !== 'width' && k !== 'height') error(`frame.${k}`, 'unknown field');
  }
  /** @type {number | null} */
  let frameCount = null;
  if (json.frameCount !== undefined) {
    if (!isInt(json.frameCount, 1, 4096)) error('frameCount', 'must be an integer ≥ 1');
    else frameCount = json.frameCount;
  }

  // ---- sources ---------------------------------------------------------------------------
  /** @type {Recipe['sources']} */
  const sources = [];
  if (!Array.isArray(json.sources) || json.sources.length === 0) {
    error('sources', 'must be a non-empty array of { image, crop | frames | grid }');
  } else {
    json.sources.forEach((src, s) => {
      const at = `sources[${s}]`;
      if (!isObject(src)) {
        error(at, 'must be an object');
        return;
      }
      for (const k of Object.keys(src)) {
        if (!['image', 'crop', 'frames', 'grid', 'provenance'].includes(k))
          error(`${at}.${k}`, 'unknown field');
      }
      if (
        typeof src.image !== 'string' ||
        src.image === '' ||
        src.image.startsWith('/') ||
        src.image.includes('\\')
      ) {
        error(`${at}.image`, 'must be a path relative to the root, with "/" separators');
      }
      const given = ['crop', 'frames', 'grid'].filter((k) => src[k] !== undefined);
      if (given.length > 1)
        error(at, `give one of crop, frames or grid, not ${given.join(' and ')}`);
      /** @type {Slicing} */
      let slicing = { kind: 'whole' };
      /**
       * Validates a box `[x, y, w, h]`.
       *
       * @param {unknown} box - Candidate.
       * @param {string} path - JSON path.
       * @returns {[number, number, number, number] | null} The box.
       */
      const readBox = (box, path) => {
        if (
          !Array.isArray(box) ||
          box.length !== 4 ||
          !isInt(box[0], 0, 1e6) ||
          !isInt(box[1], 0, 1e6) ||
          !isInt(box[2], 1, 1e6) ||
          !isInt(box[3], 1, 1e6)
        ) {
          error(path, 'must be [x, y, width, height] with x, y ≥ 0 and a size ≥ 1');
          return null;
        }
        return [box[0], box[1], box[2], box[3]];
      };
      if (src.crop !== undefined) {
        const box = readBox(src.crop, `${at}.crop`);
        if (box !== null) slicing = { kind: 'boxes', boxes: [box] };
      } else if (src.frames !== undefined) {
        if (!Array.isArray(src.frames) || src.frames.length === 0)
          error(`${at}.frames`, 'must be a non-empty array of boxes');
        else {
          /** @type {[number, number, number, number][]} */
          const boxes = [];
          src.frames.forEach((box, b) => {
            const read = readBox(box, `${at}.frames[${b}]`);
            if (read !== null) boxes.push(read);
          });
          slicing = { kind: 'boxes', boxes };
        }
      } else if (src.grid !== undefined) {
        const g = src.grid;
        if (!isObject(g)) error(`${at}.grid`, 'must be an object');
        else {
          for (const k of Object.keys(g)) {
            if (
              ![
                'x',
                'y',
                'cellWidth',
                'cellHeight',
                'columns',
                'rows',
                'gapX',
                'gapY',
                'count',
              ].includes(k)
            )
              error(`${at}.grid.${k}`, 'unknown field');
          }
          const x = g.x ?? 0;
          const y = g.y ?? 0;
          const gapX = g.gapX ?? 0;
          const gapY = g.gapY ?? 0;
          let ok = true;
          for (const [k, v, lo] of /** @type {[string, unknown, number][]} */ ([
            ['x', x, 0],
            ['y', y, 0],
            ['gapX', gapX, 0],
            ['gapY', gapY, 0],
            ['cellWidth', g.cellWidth, 1],
            ['cellHeight', g.cellHeight, 1],
            ['columns', g.columns, 1],
            ['rows', g.rows, 1],
          ])) {
            if (!isInt(v, lo, 1e6)) {
              error(`${at}.grid.${k}`, `must be an integer ≥ ${lo}`);
              ok = false;
            }
          }
          const cells = ok ? /** @type {number} */ (g.columns) * /** @type {number} */ (g.rows) : 0;
          const count = g.count ?? cells;
          if (ok && !isInt(count, 1, cells)) {
            error(`${at}.grid.count`, `must be an integer 1–${cells} (the grid's cells)`);
            ok = false;
          }
          if (ok) {
            slicing = {
              kind: 'grid',
              x: /** @type {number} */ (x),
              y: /** @type {number} */ (y),
              cellWidth: /** @type {number} */ (g.cellWidth),
              cellHeight: /** @type {number} */ (g.cellHeight),
              columns: /** @type {number} */ (g.columns),
              rows: /** @type {number} */ (g.rows),
              gapX: /** @type {number} */ (gapX),
              gapY: /** @type {number} */ (gapY),
              count: /** @type {number} */ (count),
            };
          }
        }
      }
      sources.push({
        image: /** @type {string} */ (src.image),
        slicing,
        provenance: readProvenance(src.provenance, `${at}.provenance`, error),
      });
    });
  }

  // ---- fit, alpha ------------------------------------------------------------------------
  const fit = json.fit ?? 'stretch';
  if (fit !== 'stretch' && fit !== 'contain') error('fit', 'must be "stretch" or "contain"');
  const align = json.align ?? 'center';
  if (!['center', 'bottom', 'top'].includes(/** @type {string} */ (align)))
    error('align', 'must be "center", "bottom" or "top"');
  const alpha = json.alpha ?? 'binary';
  if (!['binary', 'translucent', 'additive'].includes(/** @type {string} */ (alpha))) {
    error('alpha', 'must be "binary", "translucent" or "additive"');
  } else if (rules !== null && !rules.alpha.includes(/** @type {string} */ (alpha))) {
    error(
      'alpha',
      `a ${category} is never ${alpha} (art bible §3.6: allowed ${rules.alpha.join(', ')})`,
    );
  }
  let coverage = 0.5;
  if (json.coverage !== undefined) {
    if (typeof json.coverage !== 'number' || !(json.coverage > 0 && json.coverage <= 1))
      error('coverage', 'must be a number in (0, 1]');
    else coverage = json.coverage;
  }
  let snap = true;
  if (json.snap !== undefined) {
    if (typeof json.snap !== 'boolean') error('snap', 'must be a boolean');
    else snap = json.snap;
  }

  // ---- key -------------------------------------------------------------------------------
  const keyIn = json.key === undefined ? {} : json.key;
  /** @type {import('./key.mjs').KeySettings} */
  const key = {
    mode: alpha === 'binary' ? 'green' : 'black',
    color: null,
    tolerance: 64,
    test: DEFAULT_GREEN_TEST,
    threshold: 8,
    holes: { auto: false, minArea: 64, seeds: [] },
    despill: 2,
    open: 0,
    minIsland: 0,
  };
  if (!isObject(keyIn)) error('key', 'must be an object');
  else {
    for (const k of Object.keys(keyIn))
      if (!['mode', 'color', 'tolerance', 'test', 'threshold'].includes(k))
        error(`key.${k}`, 'unknown field');
    if (keyIn.mode !== undefined) {
      if (!['green', 'black', 'none', 'alpha'].includes(/** @type {string} */ (keyIn.mode)))
        error('key.mode', 'must be "green", "black", "none" or "alpha"');
      else key.mode = /** @type {'green' | 'black' | 'none' | 'alpha'} */ (keyIn.mode);
    }
    if (keyIn.color !== undefined && keyIn.color !== 'auto') {
      const c = parseHex(keyIn.color);
      if (c === null) error('key.color', 'must be "auto" or a colour "#rrggbb"');
      else key.color = c;
    }
    if (keyIn.tolerance !== undefined) {
      if (typeof keyIn.tolerance !== 'number' || keyIn.tolerance < 0 || keyIn.tolerance > 442)
        error('key.tolerance', 'must be a number 0–442 (RGB distance)');
      else key.tolerance = keyIn.tolerance;
    }
    if (keyIn.test !== undefined) {
      if (keyIn.test === false) key.test = null;
      else if (
        !isObject(keyIn.test) ||
        !['minG', 'minGR', 'minGB'].every((k) =>
          isInt(/** @type {Record<string, unknown>} */ (keyIn.test)[k], -255, 255),
        )
      ) {
        error('key.test', 'must be false or { "minG", "minGR", "minGB" } integers');
      } else
        key.test = {
          minG: /** @type {number} */ (keyIn.test.minG),
          minGR: /** @type {number} */ (keyIn.test.minGR),
          minGB: /** @type {number} */ (keyIn.test.minGB),
        };
    }
    if (keyIn.threshold !== undefined) {
      if (!isInt(keyIn.threshold, 0, 255)) error('key.threshold', 'must be an integer 0–255');
      else key.threshold = keyIn.threshold;
    }
  }
  if (alpha === 'binary' && key.mode === 'black')
    error('key.mode', 'a black key is for translucent or additive art only (art bible §8 step 6)');
  if (alpha !== 'binary' && (key.mode === 'green' || key.mode === 'none')) {
    error(
      'key.mode',
      `${alpha} art takes its alpha from a black key or the source's own alpha ("black" or "alpha")`,
    );
  }

  if (json.holes !== undefined) {
    const h = json.holes;
    if (h === 'none') key.holes = { auto: false, minArea: 64, seeds: [] };
    else if (h === 'auto') key.holes = { auto: true, minArea: 64, seeds: [] };
    else if (!isObject(h))
      error('holes', 'must be "none", "auto" or { "auto", "minArea", "seeds" }');
    else {
      for (const k of Object.keys(h))
        if (!['auto', 'minArea', 'seeds'].includes(k)) error(`holes.${k}`, 'unknown field');
      if (h.auto !== undefined && typeof h.auto !== 'boolean')
        error('holes.auto', 'must be a boolean');
      if (h.minArea !== undefined && !isInt(h.minArea, 1, 1e8))
        error('holes.minArea', 'must be an integer ≥ 1 (source px)');
      /** @type {[number, number][]} */
      const seeds = [];
      if (h.seeds !== undefined) {
        if (!Array.isArray(h.seeds)) error('holes.seeds', 'must be an array of [x, y]');
        else {
          h.seeds.forEach((p, i) => {
            if (!Array.isArray(p) || p.length !== 2 || !isInt(p[0], 0, 1e6) || !isInt(p[1], 0, 1e6))
              error(`holes.seeds[${i}]`, 'must be [x, y], integers ≥ 0 (region px)');
            else seeds.push([p[0], p[1]]);
          });
        }
      }
      key.holes = {
        auto: h.auto === true,
        minArea: /** @type {number} */ (h.minArea ?? 64),
        seeds,
      };
    }
    if (key.mode !== 'green' && (key.holes.auto || key.holes.seeds.length > 0))
      error('holes', 'holes are keyed only with a green key');
  }
  if (json.despill !== undefined) {
    if (json.despill === false) key.despill = 0;
    else if (!isInt(json.despill, 0, 16))
      error('despill', 'must be false or a radius 0–16 (source px)');
    else key.despill = json.despill;
  }
  if (json.cleanup !== undefined) {
    const c = json.cleanup;
    if (!isObject(c)) error('cleanup', 'must be { "open", "minIsland" }');
    else {
      for (const k of Object.keys(c))
        if (k !== 'open' && k !== 'minIsland') error(`cleanup.${k}`, 'unknown field');
      if (c.open !== undefined && !isInt(c.open, 0, 16))
        error('cleanup.open', 'must be a radius 0–16 (source px)');
      else if (c.open !== undefined) key.open = c.open;
      if (c.minIsland !== undefined && !isInt(c.minIsland, 0, 1e8))
        error('cleanup.minIsland', 'must be an integer ≥ 0 (source px)');
      else if (c.minIsland !== undefined) key.minIsland = c.minIsland;
    }
  }

  // ---- palette, dither, outline ----------------------------------------------------------
  const capRule =
    rules === null
      ? 32
      : rules.cap === 'enemy'
        ? Math.max(width, height) <= 30
          ? 16
          : 24
        : rules.cap;
  /** @type {Recipe['palette']} */
  const palette = { name: null, colors: null, max: capRule, outline: null };
  if (json.palette !== undefined) {
    const p = json.palette;
    if (!isObject(p)) error('palette', 'must be { "name" | "colors", "max", "outline" }');
    else {
      for (const k of Object.keys(p))
        if (!['name', 'colors', 'max', 'outline'].includes(k))
          error(`palette.${k}`, 'unknown field');
      if (p.name !== undefined && p.colors !== undefined)
        error('palette', 'give a palette "name" or a "colors" list, not both');
      if (p.name !== undefined) {
        if (typeof p.name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.name))
          error('palette.name', 'must be a palette name like "zone-b"');
        else palette.name = p.name;
      }
      if (p.colors !== undefined) {
        if (!Array.isArray(p.colors) || p.colors.length === 0)
          error('palette.colors', 'must be a non-empty array of "#rrggbb"');
        else {
          /** @type {number[]} */
          const colors = [];
          p.colors.forEach((c, i) => {
            const v = parseHex(c);
            if (v === null) error(`palette.colors[${i}]`, 'must be "#rrggbb"');
            else colors.push(v);
          });
          palette.colors = [...new Set(colors)];
        }
      }
      if (p.max !== undefined) {
        if (!isInt(p.max, 1, 256)) error('palette.max', 'must be an integer 1–256');
        else {
          palette.max = p.max;
          if (p.max > capRule)
            warn(
              'palette.max',
              `${p.max} colours is over the art bible's cap of ${capRule} for a ${category} (§4.3)`,
            );
        }
      }
      if (p.outline !== undefined) {
        const v = parseHex(p.outline);
        if (v === null) error('palette.outline', 'must be "#rrggbb"');
        else palette.outline = v;
      }
    }
  }

  /** @type {Recipe['dither']} */
  const dither = { size: 0, strength: 24 };
  if (json.dither !== undefined && json.dither !== 'off' && json.dither !== false) {
    const d = json.dither;
    if (d === 'bayer2') dither.size = 2;
    else if (d === 'bayer4') dither.size = 4;
    else if (
      isObject(d) &&
      (d.matrix === 2 || d.matrix === 4) &&
      (d.strength === undefined ||
        (typeof d.strength === 'number' && d.strength > 0 && d.strength <= 128))
    ) {
      dither.size = d.matrix;
      if (d.strength !== undefined) dither.strength = /** @type {number} */ (d.strength);
    } else error('dither', 'must be "off", "bayer2", "bayer4" or { "matrix": 2 | 4, "strength" }');
  }

  let layer = null;
  if (json.layer !== undefined) {
    if (!LAYERS.includes(/** @type {string} */ (json.layer)))
      error('layer', `must be one of ${LAYERS.join(', ')}`);
    else layer = /** @type {string} */ (json.layer);
  }
  if (category === 'backdrop' && layer === null && json.layer === undefined)
    error(
      'layer',
      'a backdrop names its layer (far, mid-far, mid, near or foreground) — the lighting budget depends on it',
    );
  if (category !== 'backdrop' && layer !== null)
    warn('layer', 'only backdrops have a layer; it is ignored');

  if (dither.size > 0 && rules !== null) {
    const allowed =
      rules.dither === true ||
      (rules.dither === 'large' && Math.max(width, height) >= 96) ||
      (rules.dither === 'layer' && (layer === 'far' || layer === 'mid-far' || layer === 'mid'));
    if (!allowed)
      error(
        'dither',
        `no dither on a ${category}${category === 'backdrop' ? ` ${layer} layer` : ''} (art bible §3.7)`,
      );
  }

  const outlineDefault = rules === null ? true : rules.outline;
  /** @type {Recipe['outline']} */
  const outline = {
    enabled: outlineDefault && alpha === 'binary',
    color: null,
    edges: rules === null ? 'open' : rules.edges,
  };
  if (json.outline !== undefined) {
    const o = json.outline;
    if (typeof o === 'boolean') outline.enabled = o;
    else if (isObject(o)) {
      outline.enabled = true;
      for (const k of Object.keys(o))
        if (k !== 'color' && k !== 'edges') error(`outline.${k}`, 'unknown field');
      if (o.color !== undefined) {
        const v = parseHex(o.color);
        if (v === null) error('outline.color', 'must be "#rrggbb"');
        else outline.color = v;
      }
      if (o.edges !== undefined) {
        if (o.edges !== 'open' && o.edges !== 'closed')
          error('outline.edges', 'must be "open" or "closed"');
        else outline.edges = o.edges;
      }
    } else error('outline', 'must be true, false or { "color", "edges" }');
    if (outline.enabled && alpha !== 'binary')
      error('outline', `${alpha} art has no outline (art bible §3.4)`);
    else if (outline.enabled && !outlineDefault)
      warn('outline', `the art bible draws no outline on a ${category} (§3.4)`);
  }

  // ---- cycles, reserved ------------------------------------------------------------------
  /** @type {Recipe['cycles']} */
  const cycles = [];
  if (json.cycles !== undefined) {
    if (!Array.isArray(json.cycles))
      error('cycles', 'must be an array of { "stage", "layer" } or { "colors" }');
    else {
      json.cycles.forEach((c, i) => {
        const at = `cycles[${i}]`;
        if (isObject(c) && typeof c.stage === 'string' && c.colors === undefined) {
          if (c.layer !== undefined && typeof c.layer !== 'string')
            error(`${at}.layer`, 'must be a layer name');
          cycles.push({ stage: c.stage, layer: typeof c.layer === 'string' ? c.layer : null });
        } else if (
          isObject(c) &&
          Array.isArray(c.colors) &&
          c.stage === undefined &&
          c.colors.length > 0
        ) {
          /** @type {number[]} */
          const colors = [];
          c.colors.forEach((h, k) => {
            const v = parseHex(h);
            if (v === null) error(`${at}.colors[${k}]`, 'must be "#rrggbb"');
            else colors.push(v);
          });
          cycles.push({ colors });
        } else error(at, 'must be { "stage", "layer"? } or { "colors": [...] }');
      });
    }
    if (cycles.length > 0 && alpha !== 'binary')
      error('alpha', 'art on a palette-cycled layer is never translucent (art bible §3.6, §4.4)');
    if (cycles.length > 0 && dither.size > 0)
      error('dither', 'a palette-cycled region is never dithered (art bible §3.7, §4.4)');
  }
  /** @type {number[]} */
  const reserved = [];
  if (json.reserved !== undefined) {
    if (!Array.isArray(json.reserved)) error('reserved', 'must be an array of "#rrggbb"');
    else {
      json.reserved.forEach((h, i) => {
        const v = parseHex(h);
        if (v === null) error(`reserved[${i}]`, 'must be "#rrggbb"');
        else reserved.push(v);
      });
    }
  }

  // ---- anchor, animations, edit, provenance ----------------------------------------------
  /** @type {[number, number] | null} */
  let anchor = null;
  if (json.anchor !== undefined) {
    const a = json.anchor;
    if (!Array.isArray(a) || a.length !== 2 || !Number.isInteger(a[0]) || !Number.isInteger(a[1]))
      error('anchor', 'must be [x, y] integers (frame px)');
    else anchor = [a[0], a[1]];
  }
  /** @type {Recipe['animations']} */
  const animations = [];
  if (json.animations !== undefined) {
    if (!isObject(json.animations))
      error('animations', 'must be { name: { "from", "to", "direction" } }');
    else {
      for (const [tag, spec] of Object.entries(json.animations)) {
        const at = `animations.${tag}`;
        if (!ANIMATION_NAME_PATTERN.test(tag)) {
          error(at, 'animation names are kebab/snake case');
          continue;
        }
        if (
          !isObject(spec) ||
          !isInt(spec.from, 0, 4095) ||
          !isInt(spec.to, 0, 4095) ||
          /** @type {number} */ (spec.from) > /** @type {number} */ (spec.to)
        ) {
          error(at, 'must be { "from", "to" } frame indices with from ≤ to');
          continue;
        }
        const direction = spec.direction ?? 'forward';
        if (!['forward', 'reverse', 'pingpong'].includes(/** @type {string} */ (direction))) {
          error(`${at}.direction`, 'must be "forward", "reverse" or "pingpong"');
          continue;
        }
        animations.push({
          name: tag,
          from: /** @type {number} */ (spec.from),
          to: /** @type {number} */ (spec.to),
          direction: /** @type {string} */ (direction),
        });
      }
    }
  }
  let erase = 0xff00ff;
  if (json.edit !== undefined) {
    if (!isObject(json.edit)) error('edit', 'must be { "erase": "#rrggbb" }');
    else {
      for (const k of Object.keys(json.edit))
        if (k !== 'erase') error(`edit.${k}`, 'unknown field');
      if (json.edit.erase !== undefined) {
        const v = parseHex(json.edit.erase);
        if (v === null) error('edit.erase', 'must be "#rrggbb"');
        else erase = v;
      }
    }
  }
  const provenance = readProvenance(json.provenance, 'provenance', error);
  if (json.notes !== undefined && typeof json.notes !== 'string')
    error('notes', 'must be a string');

  if (issues.some((i) => i.level === 'error')) return { recipe: null, issues };
  return {
    recipe: {
      name: /** @type {string} */ (name),
      category: /** @type {string} */ (category),
      frame: { width, height },
      frameCount,
      sources,
      key,
      scale: {
        fit: /** @type {'stretch' | 'contain'} */ (fit),
        align: /** @type {'center' | 'bottom' | 'top'} */ (align),
        alpha: /** @type {'binary' | 'translucent' | 'additive'} */ (alpha),
        coverage,
        snap,
        threshold: key.threshold,
      },
      alpha: /** @type {'binary' | 'translucent' | 'additive'} */ (alpha),
      palette,
      dither,
      outline,
      cycles,
      reserved,
      anchor,
      animations,
      layer,
      erase,
      provenance,
      notes: typeof json.notes === 'string' ? json.notes : '',
    },
    issues,
  };
}

/**
 * Validates a `provenance` block of a recipe or of one source.
 *
 * @param {unknown} value - The block (`undefined` = none).
 * @param {string} path - Its JSON path.
 * @param {(path: string, message: string) => void} error - Error collector.
 * @returns {ProvenanceHints} The hints.
 */
function readProvenance(value, path, error) {
  /** @type {ProvenanceHints} */
  const out = {};
  if (value === undefined) return out;
  if (!isObject(value)) {
    error(path, 'must be an object');
    return out;
  }
  for (const k of Object.keys(value))
    if (!PROVENANCE_KEYS.includes(k)) error(`${path}.${k}`, 'unknown field');
  if (value.model !== undefined) {
    if (typeof value.model !== 'string' || value.model === '')
      error(`${path}.model`, 'must be a model key such as "flux2", or "none"');
    else out.model = value.model;
  }
  if (value.prompt !== undefined) {
    const p = value.prompt;
    if (
      !isObject(p) ||
      (p.file !== undefined && typeof p.file !== 'string') ||
      (p.entry !== undefined && typeof p.entry !== 'string')
    ) {
      error(`${path}.prompt`, 'must be { "file", "entry" } strings');
    } else
      out.prompt = {
        ...(p.file !== undefined ? { file: /** @type {string} */ (p.file) } : {}),
        ...(p.entry !== undefined ? { entry: /** @type {string} */ (p.entry) } : {}),
      };
  }
  if (value.seed !== undefined) {
    if (value.seed !== null && !Number.isInteger(value.seed))
      error(`${path}.seed`, 'must be an integer or null');
    else out.seed = /** @type {number | null} */ (value.seed);
  }
  if (value.sidecar !== undefined) {
    if (value.sidecar !== false && typeof value.sidecar !== 'string')
      error(`${path}.sidecar`, 'must be a path or false');
    else out.sidecar = /** @type {string | false} */ (value.sidecar);
  }
  if (value.author !== undefined) {
    if (typeof value.author !== 'string') error(`${path}.author`, 'must be a string');
    else out.author = value.author;
  }
  if (value.use !== undefined) {
    if (!USES.includes(/** @type {string} */ (value.use)))
      error(`${path}.use`, 'must be "pixels" or "reference"');
    else out.use = /** @type {'pixels' | 'reference'} */ (value.use);
  }
  if (value.cleanup !== undefined) {
    if (!CLEANUPS.includes(/** @type {string} */ (value.cleanup))) {
      error(`${path}.cleanup`, 'must be "none", "light", "heavy" or "redrawn"');
    } else out.cleanup = /** @type {'none' | 'light' | 'heavy' | 'redrawn'} */ (value.cleanup);
  }
  if (value.reviewed !== undefined) {
    const r = value.reviewed;
    if (
      !isObject(r) ||
      typeof r.on !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(r.on) ||
      typeof r.by !== 'string' ||
      r.by === ''
    ) {
      error(`${path}.reviewed`, 'must be { "on": "YYYY-MM-DD", "by": "<who>" }');
    } else out.reviewed = { on: r.on, by: r.by };
  }
  if (value.notes !== undefined) {
    if (typeof value.notes !== 'string') error(`${path}.notes`, 'must be a string');
    else out.notes = value.notes;
  }
  return out;
}

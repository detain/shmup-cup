/**
 * Sprite sources: `assets/source/sprites/**\/*.sprite.json` pixel maps, and real-art PNG
 * files (`*.png` + optional Aseprite `*.json` sidecar) that override frames by name.
 *
 * **Pixel-map format** (one file per sprite, `name` = path below `sprites/` without
 * `.sprite.json`, so `ships/kestrel.sprite.json` defines `ships/kestrel`):
 *
 * ```json
 * {
 *   "name": "ships/kestrel",
 *   "description": "optional note",
 *   "palette": { ".": null, "o": "#1b2a4a", "h": "#c8d0e0" },
 *   "anchor": [8, 4],
 *   "hitFlash": false,
 *   "frames": [{ "rows": ["..oo..", ".ohho."] }],
 *   "animations": { "idle": [0, 1] }
 * }
 * ```
 *
 * Palette keys are single printable ASCII characters; `null` is transparent. Colours are
 * `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. Every frame has the same size; `anchor`
 * (pixels from the frame's top-left) defaults to the frame centre (`floor(w / 2)`,
 * `floor(h / 2)`); `hitFlash: true` makes the pipeline add the `<name>@flash` silhouette
 * sprite (decision D30).
 *
 * **Real-art overrides.** `ships/kestrel.png` targets the sprite `ships/kestrel`: without a
 * sidecar the whole PNG is frame 0; with an Aseprite JSON export (`ships/kestrel.json`,
 * hash or array format) every sidecar frame `i` becomes frame `i`, `meta.frameTags`
 * become animations and the first slice pivot becomes the anchor. Frame `i` of a PNG
 * replaces frame `i` (frame name `<sprite>#<i>`) of the code-defined sprite with the
 * same name; frames the PNG does not provide keep their code-defined pixels, extra PNG
 * frames are appended. A PNG with no code-defined counterpart adds a new sprite.
 *
 * **Public API.** {@link loadSpriteSources}, {@link parseSpriteSource},
 * {@link readPngFrames}, {@link applyPngOverrides}, {@link listFiles},
 * {@link SPRITE_NAME_PATTERN}, {@link ANIMATION_NAME_PATTERN}, {@link SPRITE_SOURCE_SUFFIX};
 * typedefs {@link SpriteDef}, {@link PngSprite}, {@link AssetIssue}.
 *
 * @module
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createImage, crop, imageFromRows, parseColor } from './image.mjs';
import { decodePng } from './png.mjs';

/** @typedef {import('./image.mjs').Image} Image */
/** @typedef {import('./image.mjs').Rgba} Rgba */

/**
 * One problem found in a source file (same shape as `ValidationIssue` in `@shmup/core`).
 *
 * @typedef {object} AssetIssue
 * @property {string} path - `<file>:<json path>`, e.g.
 *   `assets/source/sprites/ships/kestrel.sprite.json:frames[1].rows[3]`.
 * @property {string} message - What is wrong.
 */

/**
 * A sprite as the pipeline handles it: a name, frames of pixels and metadata.
 *
 * @typedef {object} SpriteDef
 * @property {string} name - Sprite name (see {@link SPRITE_NAME_PATTERN}).
 * @property {[number, number] | null} anchor - Anchor in pixels from each frame's top-left;
 *   `null` = centre of frame 0.
 * @property {boolean} hitFlash - Whether to generate the `<name>@flash` silhouette sprite.
 * @property {Image[]} frames - The frames, in index order (at least one).
 * @property {Record<string, number[]>} animations - Named frame-index sequences.
 * @property {string} origin - Where it came from (source file path or `procedural:<module>`).
 */

/**
 * A real-art PNG source, before it is merged into the code-defined sprites.
 *
 * @typedef {object} PngSprite
 * @property {string} name - Target sprite name (path below `sprites/` without `.png`).
 * @property {string} origin - The PNG's path.
 * @property {Image[]} frames - Frames cut out of the PNG.
 * @property {Record<string, number[]>} animations - From the sidecar's `meta.frameTags`.
 * @property {[number, number] | null} anchor - From the sidecar's first slice pivot.
 */

/**
 * Sprite names: lower-case kebab-case segments separated by `/` (`ships/kestrel`,
 * `enemies/carrier-red`). `@` and `#` are reserved for generated names
 * (`<name>@flash`, frame names `<name>#<index>`).
 */
export const SPRITE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

/** Animation names: lower-case words joined by `-` or `_`. */
export const ANIMATION_NAME_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

/** File suffix of pixel-map sprite sources. */
export const SPRITE_SOURCE_SUFFIX = '.sprite.json';

/** Keys a `*.sprite.json` file may contain. */
const SPRITE_KEYS = [
  'name',
  'description',
  'palette',
  'anchor',
  'hitFlash',
  'frames',
  'animations',
];

/**
 * Whether a value is a plain JSON object.
 *
 * @param {unknown} value - Any value.
 * @returns {value is Record<string, unknown>} `true` for non-null, non-array objects.
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Validates an `animations` object against a frame count.
 *
 * @param {unknown} value - The `animations` value.
 * @param {number} frameCount - Number of frames of the sprite.
 * @param {string} path - Issue path prefix (`<file>:animations`).
 * @param {AssetIssue[]} issues - Collector.
 * @returns {Record<string, number[]>} The valid animations.
 */
function parseAnimations(value, frameCount, path, issues) {
  /** @type {Record<string, number[]>} */
  const animations = {};
  if (value === undefined) return animations;
  if (!isObject(value)) {
    issues.push({ path, message: 'must be an object of frame-index arrays' });
    return animations;
  }
  for (const [name, sequence] of Object.entries(value)) {
    if (!ANIMATION_NAME_PATTERN.test(name)) {
      issues.push({ path: `${path}.${name}`, message: 'animation names are kebab/snake case' });
      continue;
    }
    if (!Array.isArray(sequence) || sequence.length === 0) {
      issues.push({ path: `${path}.${name}`, message: 'must be a non-empty array of frames' });
      continue;
    }
    const bad = sequence.findIndex(
      (index) => !Number.isInteger(index) || index < 0 || index >= frameCount,
    );
    if (bad >= 0) {
      issues.push({
        path: `${path}.${name}[${bad}]`,
        message: `must be a frame index 0…${frameCount - 1}`,
      });
      continue;
    }
    animations[name] = /** @type {number[]} */ (sequence.slice());
  }
  return animations;
}

/**
 * Validates one `*.sprite.json` document and draws its frames.
 *
 * @remarks
 * Never throws for bad data: every problem becomes an {@link AssetIssue} and the sprite is
 * `null` when anything is wrong.
 *
 * @param {unknown} json - The parsed document.
 * @param {string} file - Its path (used as the issue-path prefix).
 * @param {string | null} [expectedName] - The name its location implies (`null` = any).
 * @returns {{ sprite: SpriteDef | null, issues: AssetIssue[] }} The sprite and the problems.
 *
 * @example
 * parseSpriteSource({ name: 'ui/dot', palette: { x: '#fff' }, frames: [{ rows: ['x'] }] }, 'dot');
 * // → { sprite: { name: 'ui/dot', frames: [1×1 white], … }, issues: [] }
 */
export function parseSpriteSource(json, file, expectedName = null) {
  /** @type {AssetIssue[]} */
  const issues = [];
  if (!isObject(json)) {
    return { sprite: null, issues: [{ path: `${file}:`, message: 'must be a JSON object' }] };
  }
  for (const key of Object.keys(json)) {
    if (!SPRITE_KEYS.includes(key))
      issues.push({ path: `${file}:${key}`, message: 'unknown field' });
  }

  const name = json.name;
  if (typeof name !== 'string' || !SPRITE_NAME_PATTERN.test(name)) {
    issues.push({
      path: `${file}:name`,
      message: 'must be a sprite name like "ships/kestrel" (lower-case kebab segments)',
    });
  } else if (expectedName !== null && name !== expectedName) {
    issues.push({
      path: `${file}:name`,
      message: `"${name}" does not match the file's location (expected "${expectedName}")`,
    });
  }
  if (json.description !== undefined && typeof json.description !== 'string') {
    issues.push({ path: `${file}:description`, message: 'must be a string' });
  }

  /** @type {Record<string, Rgba | null>} */
  const palette = {};
  if (!isObject(json.palette)) {
    issues.push({ path: `${file}:palette`, message: 'must be an object of character → colour' });
  } else {
    for (const [key, value] of Object.entries(json.palette)) {
      if (key.length !== 1 || key < '!' || key > '~') {
        issues.push({
          path: `${file}:palette.${key}`,
          message: 'palette keys are single printable ASCII characters',
        });
      } else if (value === null) {
        palette[key] = null;
      } else {
        const color = parseColor(/** @type {string} */ (value));
        if (color === null) {
          issues.push({
            path: `${file}:palette.${key}`,
            message: 'must be null or a colour "#rgb", "#rgba", "#rrggbb" or "#rrggbbaa"',
          });
        } else palette[key] = color;
      }
    }
  }

  /** @type {Image[]} */
  const frames = [];
  let width = -1;
  let height = -1;
  if (!Array.isArray(json.frames) || json.frames.length === 0) {
    issues.push({ path: `${file}:frames`, message: 'must be a non-empty array of { rows }' });
  } else {
    json.frames.forEach((frame, f) => {
      const at = `${file}:frames[${f}]`;
      if (!isObject(frame)) {
        issues.push({ path: at, message: 'must be an object { rows: [...] }' });
        return;
      }
      for (const key of Object.keys(frame)) {
        if (key !== 'rows') issues.push({ path: `${at}.${key}`, message: 'unknown field' });
      }
      const rows = frame.rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        issues.push({ path: `${at}.rows`, message: 'must be a non-empty array of strings' });
        return;
      }
      let ok = true;
      const rowWidth = typeof rows[0] === 'string' ? rows[0].length : -1;
      rows.forEach((row, r) => {
        if (typeof row !== 'string' || row.length === 0) {
          issues.push({ path: `${at}.rows[${r}]`, message: 'must be a non-empty string' });
          ok = false;
          return;
        }
        if (row.length !== rowWidth) {
          issues.push({
            path: `${at}.rows[${r}]`,
            message: `is ${row.length} pixels wide, row 0 is ${rowWidth}`,
          });
          ok = false;
        }
        for (let x = 0; x < row.length; x++) {
          const ch = row.charAt(x);
          if (!(ch in palette) && isObject(json.palette) && !(ch in json.palette)) {
            issues.push({
              path: `${at}.rows[${r}]`,
              message: `column ${x}: character "${ch}" is not in the palette`,
            });
            ok = false;
            break;
          }
        }
      });
      if (!ok) return;
      if (width < 0) {
        width = rowWidth;
        height = rows.length;
      } else if (rowWidth !== width || rows.length !== height) {
        issues.push({
          path: `${at}.rows`,
          message: `frame is ${rowWidth}×${rows.length}, frame 0 is ${width}×${height}`,
        });
        return;
      }
      frames.push(imageFromRows(/** @type {string[]} */ (rows), palette));
    });
  }

  /** @type {[number, number] | null} */
  let anchor = null;
  if (json.anchor !== undefined) {
    const value = json.anchor;
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      !Number.isInteger(value[0]) ||
      !Number.isInteger(value[1])
    ) {
      issues.push({ path: `${file}:anchor`, message: 'must be [x, y] integers' });
    } else anchor = [value[0], value[1]];
  }

  let hitFlash = false;
  if (json.hitFlash !== undefined) {
    if (typeof json.hitFlash !== 'boolean') {
      issues.push({ path: `${file}:hitFlash`, message: 'must be a boolean' });
    } else hitFlash = json.hitFlash;
  }

  const frameCount = Array.isArray(json.frames) ? json.frames.length : 0;
  const animations = parseAnimations(json.animations, frameCount, `${file}:animations`, issues);

  if (issues.length > 0) return { sprite: null, issues };
  return {
    sprite: {
      name: /** @type {string} */ (name),
      anchor,
      hitFlash,
      frames,
      animations,
      origin: file,
    },
    issues,
  };
}

/**
 * Reads an integer rectangle `{ x, y, w, h }` from an Aseprite sidecar.
 *
 * @param {unknown} value - The candidate object.
 * @returns {{ x: number, y: number, w: number, h: number } | null} The rectangle.
 */
function readRect(value) {
  if (!isObject(value)) return null;
  const { x = 0, y = 0, w, h } = value;
  if (![x, y, w, h].every((n) => Number.isInteger(n))) return null;
  return /** @type {{ x: number, y: number, w: number, h: number }} */ ({ x, y, w, h });
}

/**
 * Cuts the frames, animations and anchor out of a PNG and its optional Aseprite sidecar.
 *
 * @param {Image} image - The decoded PNG.
 * @param {unknown} sidecar - The parsed sidecar JSON, or `undefined` when there is none.
 * @param {string} file - Sidecar path for issue messages.
 * @param {AssetIssue[]} issues - Collector.
 * @returns {Omit<PngSprite, 'name' | 'origin'>} The extracted parts.
 */
export function readPngFrames(image, sidecar, file, issues) {
  if (sidecar === undefined) return { frames: [image], animations: {}, anchor: null };
  if (!isObject(sidecar) || (!Array.isArray(sidecar.frames) && !isObject(sidecar.frames))) {
    issues.push({ path: `${file}:frames`, message: 'expected an Aseprite JSON export' });
    return { frames: [], animations: {}, anchor: null };
  }
  const entries = Array.isArray(sidecar.frames) ? sidecar.frames : Object.values(sidecar.frames);
  if (entries.length === 0) {
    // A sprite needs at least one frame (a PNG-only sprite would otherwise have none).
    issues.push({ path: `${file}:frames`, message: 'the Aseprite export lists no frames' });
    return { frames: [], animations: {}, anchor: null };
  }
  /** @type {Image[]} */
  const frames = [];
  entries.forEach((entry, i) => {
    const at = `${file}:frames[${i}]`;
    const rect = isObject(entry) ? readRect(entry.frame) : null;
    if (
      rect === null ||
      rect.w < 1 ||
      rect.h < 1 ||
      rect.x < 0 ||
      rect.y < 0 ||
      rect.x + rect.w > image.width ||
      rect.y + rect.h > image.height
    ) {
      issues.push({ path: `${at}.frame`, message: 'must be a rectangle inside the PNG' });
      return;
    }
    const pixels = crop(image, rect.x, rect.y, rect.w, rect.h);
    const record = /** @type {Record<string, unknown>} */ (entry);
    if (record.trimmed === true) {
      // Restore the untrimmed canvas so anchors and frame sizes stay consistent.
      const source = isObject(record.sourceSize) ? record.sourceSize : {};
      const placed = readRect(record.spriteSourceSize);
      const w = source.w;
      const h = source.h;
      if (
        placed === null ||
        !Number.isInteger(w) ||
        !Number.isInteger(h) ||
        placed.x + rect.w > /** @type {number} */ (w) ||
        placed.y + rect.h > /** @type {number} */ (h)
      ) {
        issues.push({ path: at, message: 'trimmed frame needs valid spriteSourceSize/sourceSize' });
        return;
      }
      const full = createImage(/** @type {number} */ (w), /** @type {number} */ (h));
      for (let y = 0; y < rect.h; y++) {
        full.data.set(
          pixels.data.subarray(y * rect.w * 4, (y + 1) * rect.w * 4),
          ((placed.y + y) * full.width + placed.x) * 4,
        );
      }
      frames.push(full);
    } else frames.push(pixels);
  });

  /** @type {Record<string, number[]>} */
  const animations = {};
  const meta = isObject(sidecar.meta) ? sidecar.meta : {};
  if (Array.isArray(meta.frameTags)) {
    meta.frameTags.forEach((tag, t) => {
      const at = `${file}:meta.frameTags[${t}]`;
      if (!isObject(tag) || typeof tag.name !== 'string') {
        issues.push({ path: at, message: 'expected { name, from, to, direction }' });
        return;
      }
      const from = tag.from;
      const to = tag.to;
      if (
        !ANIMATION_NAME_PATTERN.test(tag.name) ||
        !Number.isInteger(from) ||
        !Number.isInteger(to) ||
        /** @type {number} */ (from) > /** @type {number} */ (to) ||
        /** @type {number} */ (to) >= entries.length ||
        /** @type {number} */ (from) < 0
      ) {
        issues.push({ path: at, message: `invalid tag "${tag.name}"` });
        return;
      }
      /** @type {number[]} */
      const forward = [];
      for (let f = /** @type {number} */ (from); f <= /** @type {number} */ (to); f++) {
        forward.push(f);
      }
      const direction = tag.direction ?? 'forward';
      if (direction === 'reverse') animations[tag.name] = forward.reverse();
      else if (direction === 'pingpong') {
        animations[tag.name] = forward.concat(forward.slice(1, -1).reverse());
      } else animations[tag.name] = forward;
    });
  }

  /** @type {[number, number] | null} */
  let anchor = null;
  if (Array.isArray(meta.slices)) {
    for (const slice of meta.slices) {
      const key = isObject(slice) && Array.isArray(slice.keys) ? slice.keys[0] : undefined;
      if (!isObject(key) || !isObject(key.pivot)) continue;
      const bounds = readRect(key.bounds);
      const pivot = key.pivot;
      if (bounds !== null && Number.isInteger(pivot.x) && Number.isInteger(pivot.y)) {
        anchor = [
          bounds.x + /** @type {number} */ (pivot.x),
          bounds.y + /** @type {number} */ (pivot.y),
        ];
        break;
      }
    }
  }
  return { frames, animations, anchor };
}

/**
 * Lists files below a directory, recursively, as `/`-separated relative paths, sorted.
 *
 * @param {string} dir - Directory to scan (missing = empty).
 * @param {string} [prefix] - Internal: path of `dir` relative to the scan root.
 * @returns {string[]} The relative file paths.
 */
export function listFiles(dir, prefix = '') {
  if (!existsSync(dir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir).sort()) {
    const relative = prefix === '' ? entry : `${prefix}/${entry}`;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, relative));
    else out.push(relative);
  }
  return out.sort();
}

/**
 * Reads every sprite source below a `sprites/` directory.
 *
 * @remarks
 * `*.sprite.json` → pixel-map sprites; `*.png` (+ `<same name>.json` sidecar) → real-art
 * overrides; `README.md`, `LICENSES.md`, `.gitkeep` and editor files such as `*.aseprite`
 * are ignored; a `*.json` that is neither a sprite source nor a PNG sidecar is an issue.
 *
 * @param {string} dir - Absolute path of the sprites directory.
 * @param {string} displayRoot - Prefix for issue paths / origins (e.g. `assets/source/sprites`).
 * @returns {{ sprites: SpriteDef[], overrides: PngSprite[], issues: AssetIssue[] }} The
 *   parsed sources in path order, and every problem found.
 */
export function loadSpriteSources(dir, displayRoot) {
  /** @type {SpriteDef[]} */
  const sprites = [];
  /** @type {PngSprite[]} */
  const overrides = [];
  /** @type {AssetIssue[]} */
  const issues = [];
  const files = listFiles(dir);
  const pngs = new Set(files.filter((file) => file.endsWith('.png')));
  for (const relative of files) {
    const shown = `${displayRoot}/${relative}`;
    if (relative.endsWith(SPRITE_SOURCE_SUFFIX)) {
      let json;
      try {
        json = JSON.parse(readFileSync(join(dir, relative), 'utf8'));
      } catch (error) {
        issues.push({
          path: `${shown}:`,
          message: `invalid JSON: ${/** @type {Error} */ (error).message}`,
        });
        continue;
      }
      const expected = relative.slice(0, -SPRITE_SOURCE_SUFFIX.length);
      const result = parseSpriteSource(json, shown, expected);
      issues.push(...result.issues);
      if (result.sprite !== null) sprites.push(result.sprite);
    } else if (relative.endsWith('.png')) {
      const name = relative.slice(0, -'.png'.length);
      if (!SPRITE_NAME_PATTERN.test(name)) {
        issues.push({ path: `${shown}:`, message: `"${name}" is not a valid sprite name` });
        continue;
      }
      let image;
      try {
        image = decodePng(readFileSync(join(dir, relative)));
      } catch (error) {
        issues.push({
          path: `${shown}:`,
          message: `unreadable PNG: ${/** @type {Error} */ (error).message}`,
        });
        continue;
      }
      const sidecarPath = `${name}.json`;
      let sidecar;
      if (files.includes(sidecarPath)) {
        try {
          sidecar = JSON.parse(readFileSync(join(dir, sidecarPath), 'utf8'));
        } catch (error) {
          issues.push({
            path: `${displayRoot}/${sidecarPath}:`,
            message: `invalid JSON: ${/** @type {Error} */ (error).message}`,
          });
          continue;
        }
      }
      const before = issues.length;
      const parts = readPngFrames(image, sidecar, `${displayRoot}/${sidecarPath}`, issues);
      if (issues.length === before) overrides.push({ name, origin: shown, ...parts });
    } else if (relative.endsWith('.json')) {
      if (!pngs.has(`${relative.slice(0, -'.json'.length)}.png`)) {
        issues.push({
          path: `${shown}:`,
          message: 'not a *.sprite.json source and no PNG of the same name to be a sidecar of',
        });
      }
    }
  }
  return { sprites, overrides, issues };
}

/**
 * Applies real-art PNG overrides to the code-defined sprites (frames replaced by index,
 * extra frames appended, sidecar animations merged over code animations).
 *
 * @param {readonly SpriteDef[]} sprites - Code-defined sprites (pixel maps, procedural).
 * @param {readonly PngSprite[]} overrides - PNG sources.
 * @returns {SpriteDef[]} New sprite list: overridden sprites in place, PNG-only sprites
 *   appended in override order. Inputs are not modified.
 */
export function applyPngOverrides(sprites, overrides) {
  const byName = new Map(sprites.map((sprite, i) => [sprite.name, i]));
  const out = sprites.slice();
  for (const png of overrides) {
    const index = byName.get(png.name);
    if (index === undefined) {
      byName.set(png.name, out.length);
      out.push({
        name: png.name,
        anchor: png.anchor,
        hitFlash: false,
        frames: png.frames.slice(),
        animations: { ...png.animations },
        origin: png.origin,
      });
      continue;
    }
    const base = out[index];
    const frames = base.frames.slice();
    png.frames.forEach((frame, i) => {
      frames[i] = frame;
    });
    out[index] = {
      ...base,
      frames,
      anchor: base.anchor ?? png.anchor,
      animations: { ...base.animations, ...png.animations },
      origin: `${base.origin} + ${png.origin}`,
    };
  }
  return out;
}

/**
 * Sprite sources: `assets/source/sprites/**\/*.sprite.json` pixel maps, and real-art PNG
 * files (`*.png` + optional Aseprite `*.json` sidecar) that override frames by name.
 * A `<path>.v2.sprite.json` ({@link SPRITE_SOURCE_V2_SUFFIX}) is the **v2 source** of the
 * sprite `<path>` (R4-P.P3, RR-1): its `native` flag is implied, and the pipeline uses it
 * only at an art scale ≠ 1, beside — never inside — the v1 map of the same path.
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
 *   "native": false,
 *   "frames": [{ "rows": ["..oo..", ".ohho."] }],
 *   "animations": { "idle": [0, 1] }
 * }
 * ```
 *
 * Palette keys are single printable ASCII characters; `null` is transparent. Colours are
 * `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. Every frame has the same size; `anchor`
 * (pixels from the frame's top-left) defaults to the frame centre (`floor(w / 2)`,
 * `floor(h / 2)`); `hitFlash: true` makes the pipeline add the `<name>@flash` silhouette
 * sprite (decision D30). `p2` (optional) is player 2's palette map — `"#rrggbb": "#rrggbb"`
 * pairs, every colour of the art that its `<name>@p2` variant exchanges (`coop.mjs`,
 * R3-03.V2a); the pipeline demands one from every sprite `wantsP2Variant` accepts. `native: true` (optional, default `false`) says the pixels are already at
 * the art's v2 size, so the interim ×1.5 stage leaves them alone (plan_resolution.md R2-01, W4-5 —
 * `scripts/assets/interim.mjs`); a v1-scale map leaves it out. A v2 source's `native` flag is
 * implied: a `*.v2.sprite.json` always loads as native, even when it declares `native: false`.
 *
 * **Real-art overrides.** `ships/kestrel.png` targets the sprite `ships/kestrel`: without a
 * sidecar the whole PNG is frame 0; with an Aseprite JSON export (`ships/kestrel.json`,
 * hash or array format) every sidecar frame `i` becomes frame `i`, `meta.frameTags`
 * become animations and the first slice pivot becomes the anchor. Frame `i` of a PNG
 * replaces frame `i` (frame name `<sprite>#<i>`) of the code-defined sprite with the
 * same name; frames the PNG does not provide keep their code-defined pixels, extra PNG
 * frames are appended. A sidecar anchor wins over the code-defined one (the art knows its
 * own pivot: a v2 PNG drawn ×1.5 must not keep a v1 anchor — R3-02). A sidecar `meta.shmup.p2`
 * map wins over the code-defined one the same way (R3-03.V2a). A PNG with no
 * code-defined counterpart adds a new sprite.
 *
 * **Ingest files.** The R3-02 ingest tool (`art-prompts/ingest/`) keeps its recipe, its
 * provenance record and the artist's hand-edit layer next to the PNG it writes
 * (`<name>.recipe.json`, `<name>.art.json`, `<name>.edit.png`); the loader skips them
 * ({@link INGEST_SUFFIXES}), so they are never reported as stray JSON nor turned into a
 * sprite of their own (which would shift every sorted sprite id and so every golden).
 *
 * **Public API.** {@link loadSpriteSources}, {@link parseSpriteSource},
 * {@link readPngFrames}, {@link applyPngOverrides}, {@link listFiles},
 * {@link SPRITE_NAME_PATTERN}, {@link ANIMATION_NAME_PATTERN}, {@link SPRITE_SOURCE_SUFFIX},
 * {@link SPRITE_SOURCE_V2_SUFFIX}, {@link INGEST_SUFFIXES}; typedefs {@link SpriteDef},
 * {@link PngSprite}, {@link AssetIssue}.
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
 * @property {boolean} [native] - `true` when the frames are already at the art's v2 size: the
 *   pipeline's interim stage never scales them (R2-01, W4-5 — the terrain tilesets, `ui/pixel`,
 *   the laser beams, R3 / R4 redraws). Absent (= `false`) for a v1-scale source.
 * @property {Record<string, string>} [p2] - Player 2's palette map, `"#rrggbb": "#rrggbb"`
 *   pairs (`coop.mjs`, R3-03.V2a). Only a source that declares one carries it; a PNG override's
 *   sidecar map wins over the code-defined one, like the anchor.
 * @property {string} [group] - Atlas group (`common`, `zone-a`, …), set by the pipeline's
 *   `collectSprites` (R1-05); sources never set it.
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
 * @property {Record<string, string>} [p2] - Player 2's palette map from the sidecar's
 *   `meta.shmup.p2` (R3-03.V2a). Absent when the sidecar carries none.
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

/**
 * File suffix of the v2 pixel-map source of a sprite: `<path>.v2.sprite.json` is the v2
 * source of `<path>` (R4-P.P3, RR-1 — v2 sources beside v1). {@link loadSpriteSources} parses
 * it with the shortened expected name and implies `native: true`; the pipeline merges it only
 * at an art scale ≠ 1, so the scale-1 (v1) build never sees it.
 */
export const SPRITE_SOURCE_V2_SUFFIX = '.v2.sprite.json';

/**
 * Suffixes of the ingest tool's files that sit next to an override PNG and are not sprite
 * sources: the recipe, the provenance record and the hand-edit layer (R3-02,
 * `art-prompts/ingest/`). {@link loadSpriteSources} ignores them.
 */
export const INGEST_SUFFIXES = Object.freeze(['.recipe.json', '.art.json', '.edit.png']);

/**
 * Whether a file is one of the ingest tool's own files ({@link INGEST_SUFFIXES}).
 *
 * @param {string} file - A path.
 * @returns {boolean} `true` for `*.recipe.json`, `*.art.json` and `*.edit.png`.
 */
const isIngestFile = (file) => INGEST_SUFFIXES.some((suffix) => file.endsWith(suffix));

/** Keys a `*.sprite.json` file may contain. */
const SPRITE_KEYS = [
  'name',
  'description',
  'palette',
  'p2',
  'anchor',
  'hitFlash',
  'native',
  'frames',
  'animations',
];

/** One side of a player 2 palette map: an exact six-digit lower-case hex colour. */
const P2_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

/**
 * Validates a player 2 palette map (`p2` of a pixel map, `meta.shmup.p2` of a sidecar): an
 * object of `"#rrggbb": "#rrggbb"` pairs (R3-03.V2a — the map `coop.mjs` draws `<name>@p2`
 * from; whether its colours fit the art is the pipeline's check).
 *
 * @param {unknown} value - The candidate map.
 * @param {string} path - Issue path prefix (`<file>:p2`).
 * @param {AssetIssue[]} issues - Collector.
 * @returns {Record<string, string> | null} A copy of the valid map, or `null` when anything is
 *   wrong (the problems are issues then).
 */
function parseP2Map(value, path, issues) {
  if (!isObject(value)) {
    issues.push({ path, message: 'must be an object of "#rrggbb": "#rrggbb" colour pairs' });
    return null;
  }
  /** @type {Record<string, string>} */
  const map = {};
  for (const [from, to] of Object.entries(value)) {
    if (!P2_COLOR_PATTERN.test(from)) {
      issues.push({ path: `${path}.${from}`, message: 'keys are exact colours "#rrggbb"' });
      continue;
    }
    if (typeof to !== 'string' || !P2_COLOR_PATTERN.test(to)) {
      issues.push({
        path: `${path}.${from}`,
        message: `"${from}" must map to an exact colour "#rrggbb"`,
      });
      continue;
    }
    map[from] = to;
  }
  return map;
}

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

  let p2Map;
  if (json.p2 !== undefined) {
    p2Map = parseP2Map(json.p2, `${file}:p2`, issues) ?? undefined;
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

  let native = false;
  if (json.native !== undefined) {
    if (typeof json.native !== 'boolean') {
      issues.push({ path: `${file}:native`, message: 'must be a boolean' });
    } else native = json.native;
  }

  const frameCount = Array.isArray(json.frames) ? json.frames.length : 0;
  const animations = parseAnimations(json.animations, frameCount, `${file}:animations`, issues);

  if (issues.length > 0) return { sprite: null, issues };
  /** @type {SpriteDef} */
  const sprite = {
    name: /** @type {string} */ (name),
    anchor,
    hitFlash,
    frames,
    animations,
    origin: file,
  };
  // Only a native source carries the flag, so a v1-scale sprite keeps its pre-R2-01 shape.
  if (native) sprite.native = true;
  // Only a source that declares a player 2 map carries it, so every other sprite keeps its shape.
  if (p2Map !== undefined) sprite.p2 = p2Map;
  return { sprite, issues };
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
  /** @type {Record<string, string> | undefined} */
  let p2;
  if (isObject(meta.shmup) && meta.shmup.p2 !== undefined) {
    p2 = parseP2Map(meta.shmup.p2, `${file}:meta.shmup.p2`, issues) ?? undefined;
  }

  /** @type {Omit<PngSprite, 'name' | 'origin'>} */
  const parts = { frames, animations, anchor };
  if (p2 !== undefined) parts.p2 = p2;
  return parts;
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
 * `*.sprite.json` → pixel-map sprites; `*.v2.sprite.json` → the v2 pixel-map sources of the
 * shortened names, each loaded with `native` implied and collected in `v2` only (R4-P.P3,
 * RR-1); `*.png` (+ `<same name>.json` sidecar) → real-art overrides; `README.md`,
 * `LICENSES.md`, `.gitkeep`, editor files such as `*.aseprite` and the ingest tool's
 * `*.recipe.json`, `*.art.json` and `*.edit.png` are ignored; a `*.json`
 * that is neither a sprite source nor a PNG sidecar is an issue.
 *
 * @param {string} dir - Absolute path of the sprites directory.
 * @param {string} displayRoot - Prefix for issue paths / origins (e.g. `assets/source/sprites`).
 * @returns {{ sprites: SpriteDef[], v2: SpriteDef[], overrides: PngSprite[], issues: AssetIssue[] }}
 *   The parsed sources in path order (v2 sources with `native` forced on), and every problem
 *   found.
 */
export function loadSpriteSources(dir, displayRoot) {
  /** @type {SpriteDef[]} */
  const sprites = [];
  /** @type {SpriteDef[]} */
  const v2 = [];
  /** @type {Map<string, string>} sprite name → first v2 file that defined it */
  const v2ByName = new Map();
  /** @type {PngSprite[]} */
  const overrides = [];
  /** @type {AssetIssue[]} */
  const issues = [];
  const files = listFiles(dir).filter((file) => !isIngestFile(file));
  const pngs = new Set(files.filter((file) => file.endsWith('.png')));
  for (const relative of files) {
    const shown = `${displayRoot}/${relative}`;
    if (relative.endsWith(SPRITE_SOURCE_SUFFIX)) {
      const isV2 = relative.endsWith(SPRITE_SOURCE_V2_SUFFIX);
      const suffix = isV2 ? SPRITE_SOURCE_V2_SUFFIX : SPRITE_SOURCE_SUFFIX;
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
      const expected = relative.slice(0, -suffix.length);
      const result = parseSpriteSource(json, shown, expected);
      issues.push(...result.issues);
      if (result.sprite === null) continue;
      if (!isV2) {
        sprites.push(result.sprite);
        continue;
      }
      // A v2 source is native by definition (RR-1), whatever the file declared.
      result.sprite.native = true;
      const first = v2ByName.get(result.sprite.name);
      if (first !== undefined) {
        // Unreachable from one real tree (a path defines one shortened name); a guard.
        issues.push({
          path: `${shown}:name`,
          message: `v2 source for sprite "${result.sprite.name}" is defined twice (first ${first})`,
        });
        continue;
      }
      v2ByName.set(result.sprite.name, shown);
      v2.push(result.sprite);
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
  return { sprites, v2, overrides, issues };
}

/**
 * Applies real-art PNG overrides to the code-defined sprites (frames replaced by index,
 * extra frames appended, sidecar animations merged over code animations, a sidecar anchor
 * over the code anchor).
 *
 * @remarks
 * The anchor rule changed in R3-02: the code-defined anchor used to win, so a v2 PNG drawn
 * at ×1.5 kept its v1 anchor. Now the sidecar's slice pivot wins and the code anchor is
 * the fallback for a PNG without one (no sidecar, or a sidecar without a pivot slice).
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
      /** @type {SpriteDef} */
      const fresh = {
        name: png.name,
        anchor: png.anchor,
        hitFlash: false,
        frames: png.frames.slice(),
        animations: { ...png.animations },
        origin: png.origin,
      };
      if (png.p2 !== undefined) fresh.p2 = png.p2;
      out.push(fresh);
      continue;
    }
    const base = out[index];
    const frames = base.frames.slice();
    png.frames.forEach((frame, i) => {
      frames[i] = frame;
    });
    const merged = {
      ...base,
      frames,
      anchor: png.anchor ?? base.anchor,
      animations: { ...base.animations, ...png.animations },
      origin: `${base.origin} + ${png.origin}`,
    };
    // A sidecar map wins over the code-defined one, like the anchor (R3-03.V2a).
    if (png.p2 !== undefined) merged.p2 = png.p2;
    out[index] = merged;
  }
  return out;
}

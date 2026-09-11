/**
 * The atlas manifest (`assets/generated/atlas/main.json`, inlined into builds as
 * `virtual:shmup-assets`): its types, naming rules, serialisation and the check that
 * every sprite name content uses exists.
 *
 * ```json
 * {
 *   "formatVersion": 1,
 *   "pages": [{ "file": "main.png", "w": 512, "h": 512 }],
 *   "frames": { "ships/kestrel#0": { "p": 0, "x": 1, "y": 1, "w": 16, "h": 9, "ax": 8, "ay": 4 } },
 *   "sprites": { "ships/kestrel": { "frames": ["ships/kestrel#0", "…"], "flash": null } },
 *   "animations": { "ships/kestrel": { "level": [0], "up": [1], "down": [2] } },
 *   "fonts": { "pixel": { "sprite": "font/pixel", "lineHeight": 10, "cellWidth": 6,
 *     "cellHeight": 8, "glyphs": { "65": { "frame": "font/pixel#33", "advance": 6 } } } }
 * }
 * ```
 *
 * - **Frame names** are `<sprite>#<index>`; `ax`/`ay` is the sprite's anchor in frame
 *   pixels. A sprite's frames are listed in index order in `sprites[name].frames`.
 * - **Hit flash** (D30): a sprite with `hitFlash` has `flash: "<name>@flash"`, a sibling
 *   sprite with the same frame count whose frame `i` is frame `i`'s white silhouette.
 * - **Animations** are frame-index sequences per sprite (`animations[sprite][tag]`).
 * - **Fonts**: glyph frames live in the sprite `font/<name>`; glyphs are keyed by decimal
 *   code point.
 * - Every object is written with sorted keys, so the file is byte-stable.
 *
 * **Public API.** {@link MANIFEST_FORMAT_VERSION}, {@link frameName},
 * {@link formatManifest}, {@link findMissingSprites}; typedefs {@link AtlasManifest},
 * {@link ManifestPage}, {@link ManifestFrame}, {@link ManifestSprite}. The TypeScript view
 * of the same format is the `virtual:shmup-assets` declaration in
 * `types/virtual-modules.d.ts` — change both together (and bump the version).
 *
 * @module
 */

/** @typedef {import('./sprite-source.mjs').AssetIssue} AssetIssue */
/** @typedef {import('./font.mjs').FontMetrics} FontMetrics */

/**
 * One atlas page (a PNG next to the manifest).
 *
 * @typedef {object} ManifestPage
 * @property {string} file - File name (`main.png`, `main-1.png`, …).
 * @property {number} w - Width in pixels (power of two ≤ 2048).
 * @property {number} h - Height in pixels (power of two ≤ 2048).
 */

/**
 * Where one frame sits in the atlas.
 *
 * @typedef {object} ManifestFrame
 * @property {number} p - Page index.
 * @property {number} x - Left column on the page.
 * @property {number} y - Top row on the page.
 * @property {number} w - Width.
 * @property {number} h - Height.
 * @property {number} ax - Anchor column, in frame pixels.
 * @property {number} ay - Anchor row, in frame pixels.
 */

/**
 * A sprite: its frames and its hit-flash sibling.
 *
 * @typedef {object} ManifestSprite
 * @property {string[]} frames - Frame names in index order.
 * @property {string | null} flash - Name of the `@flash` silhouette sprite, or `null`.
 */

/**
 * The whole manifest.
 *
 * @typedef {object} AtlasManifest
 * @property {number} formatVersion - {@link MANIFEST_FORMAT_VERSION}.
 * @property {ManifestPage[]} pages - Atlas pages.
 * @property {Record<string, ManifestFrame>} frames - Every frame by name.
 * @property {Record<string, ManifestSprite>} sprites - Every sprite by name.
 * @property {Record<string, Record<string, number[]>>} animations - Per sprite: tag → frames.
 * @property {Record<string, FontMetrics>} fonts - Bitmap fonts by name.
 */

/** Current manifest format. */
export const MANIFEST_FORMAT_VERSION = 1;

/**
 * Name of frame `index` of a sprite.
 *
 * @param {string} sprite - Sprite name.
 * @param {number} index - Frame index.
 * @returns {string} `<sprite>#<index>`.
 */
export const frameName = (sprite, index) => `${sprite}#${index}`;

/**
 * Serialises JSON with one entry per line down to `depth`, compact below it.
 *
 * @param {unknown} value - The value.
 * @param {number} depth - Remaining expanded levels.
 * @param {string} indent - Current indentation.
 * @returns {string} JSON text.
 */
function stringify(value, depth, indent) {
  if (depth <= 0 || typeof value !== 'object' || value === null) return JSON.stringify(value);
  const inner = indent + '  ';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((v) => inner + stringify(v, depth - 1, inner)).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return '{}';
  return `{\n${entries
    .map(([k, v]) => `${inner}${JSON.stringify(k)}: ${stringify(v, depth - 1, inner)}`)
    .join(',\n')}\n${indent}}`;
}

/**
 * Serialises a manifest: sections and their entries one per line (diff-friendly), each
 * entry compact; ends with a newline.
 *
 * @param {AtlasManifest} manifest - The manifest (objects already in sorted key order).
 * @returns {string} The JSON text.
 */
export function formatManifest(manifest) {
  return stringify(manifest, 2, '') + '\n';
}

/**
 * Lists the sprite names that are missing from a manifest.
 *
 * @param {Pick<AtlasManifest, 'sprites'>} manifest - The atlas manifest.
 * @param {readonly string[]} names - Sprite names to check (e.g. `db.sprites.names` from
 *   `loadContent()`).
 * @param {string} [label] - Issue-path prefix (default `sprites`).
 * @returns {AssetIssue[]} One issue per missing name (`<label>[<i>]`), empty when all exist.
 *
 * @example
 * findMissingSprites(manifest, ['ships/kestrel', 'ships/nope']);
 * // → [{ path: 'sprites[1]', message: 'sprite "ships/nope" is not in the atlas …' }]
 */
export function findMissingSprites(manifest, names, label = 'sprites') {
  /** @type {AssetIssue[]} */
  const issues = [];
  names.forEach((name, i) => {
    if (!Object.prototype.hasOwnProperty.call(manifest.sprites, name)) {
      issues.push({
        path: `${label}[${i}]`,
        message:
          `sprite "${name}" is not in the atlas — add assets/source/sprites/${name}.sprite.json, ` +
          `a PNG of that name, or a procedural generator`,
      });
    }
  });
  return issues;
}

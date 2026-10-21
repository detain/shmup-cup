/**
 * The placeholder asset pipeline (decision D24, "art as code"): sprite pixel maps,
 * procedural generators, real-art PNG overrides and bitmap fonts → packed atlas pages +
 * a JSON manifest in `assets/generated/atlas/`.
 *
 * ```
 * assets/source/sprites/**\/*.sprite.json ─┐
 * scripts/assets/procedural/*.mjs ─────────┴─► sprites ─► ×artScale ─► + PNG overrides ─┐
 * assets/source/fonts/*.font.json ─────────────► fonts ─► ×artScale ────────────────────┤
 *                                                                     + @flash, @p2 ◄───┘
 *                         packRects() ◄─────────────────── frames ◄──────────┘
 *                             └─► main.png (+ main-1.png …) + main.json
 * ```
 *
 * {@link buildAtlas} does the work in memory (tests use it directly);
 * {@link generateAssets} adds the disk side: an **input-hash cache** (every pipeline
 * script as loaded by this process, every source file, the zlib and pngjs versions) that
 * skips unchanged runs,
 * atomic writes (parallel builds may run it concurrently) and removal of stale pages.
 * Output is deterministic: two runs over the same inputs are byte-identical.
 *
 * **Atlas groups (R1-05).** Each sprite belongs to a group — `common` (page 0,
 * `main.png`), or a zone's own pages — from the committed `assets/source/atlas-groups.json`
 * (derived from content by `test/integration/atlas-groups.test.ts`), else a `zone-<id>`
 * directory in its name; the packer never mixes two groups on a page, so the runtime can
 * unload other zones' pages. A page of at most 256 colours is written as lossless PNG-8.
 *
 * **The interim art stage (R2-01).** The sprite sources are v1-scale placeholder art; every build
 * upscales them nearest-neighbour by an **art scale** (`artScale`, default `interim.mjs`
 * `INTERIM_ART_SCALE` — 1 until R2-01's flip, 3/2 after), except what is already at its v2 size
 * (decision W4-5): sources marked `native` (the terrain tilesets, which `terrain.mjs` draws at the
 * scaled tile size itself, `ui/pixel`, and the laser beams, whose frame number is their thickness:
 * `lasers.mjs` draws them at the art scale) and real-art PNG overrides. The bitmap font is scaled
 * with the art (W4-4: 6 × 8 → 9 × 12). At scale 1 the stage does nothing, so
 * `buildAtlas({ artScale: 1 })` is the v1 atlas byte for byte at either frame — the art the TV
 * bench, the CJK figures, the store icons and the doc images keep (W4-6).
 *
 * **v2 sources beside v1 (R4-P.P3, decision RR-1).** A `<path>.v2.sprite.json` is the v2 pixel
 * map of `<path>` (native implied) and a font file with `"native": true` is the v2 font of its
 * `name`. At an art scale ≠ 1 each replaces the v1 source of its name, unscaled; at scale 1
 * they are ignored — and there a PNG override of a name that has a code source is skipped too,
 * so committing v2 art can never move the scale-1 atlas: the digest pin, the TV bench, the CJK
 * figures and the store icons stay byte for byte until a step re-pins them on purpose.
 *
 * **Public API.** {@link generateAssets} (disk, cached — `pnpm assets`, the Vite plugin),
 * {@link buildAtlas} (in memory), {@link collectSprites}, {@link computeInputHash},
 * {@link loadAtlasGroups}, {@link resolveAtlasGroup}, {@link AssetSourceError},
 * {@link pageFileName}, the path constants ({@link PIPELINE_DIR}, {@link REPO_ROOT},
 * {@link DEFAULT_SOURCE_DIR}, {@link DEFAULT_OUT_DIR}, {@link ATLAS_DIR},
 * {@link ATLAS_NAME}, {@link CACHE_FILE}, {@link ATLAS_GROUPS_FILE}), the groups constants
 * ({@link ATLAS_GROUPS_FORMAT}, {@link COMMON_GROUP}) and the layout constants
 * ({@link ATLAS_PADDING}, {@link ATLAS_EXTRUDE}); typedefs {@link GenerateResult},
 * {@link AtlasGroups}. Guide: `docs/dev/asset-pipeline.md`.
 *
 * @module
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateProceduralSprites } from './procedural/index.mjs';
import { FLASH_SUFFIX, makeFlashSprite } from './flash.mjs';
import { P2_SUFFIX, makeP2Sprite, wantsP2Variant } from './coop.mjs';
import { buildFontSprite, loadFontSources } from './font.mjs';
import { createImage, blit, getPixel, parseColor, setPixel } from './image.mjs';
import { INTERIM_ART_SCALE, parseArtScale, scaleFont, scaleSprite } from './interim.mjs';
import { MANIFEST_FORMAT_VERSION, formatManifest, frameName } from './manifest.mjs';
import { MAX_PAGE_SIZE, packRects } from './packer.mjs';
import { encodePng } from './png.mjs';
import { BULLET_COLORS } from './procedural/bullets.mjs';
import { color, mix } from './procedural/common.mjs';
import { BULLET_PALETTES, CORE_MARKS } from './procedural/palettes.mjs';
import { TILE_SIZE as TERRAIN_TILE_SIZE } from './procedural/terrain.mjs';
import { applyPngOverrides, listFiles, loadSpriteSources } from './sprite-source.mjs';

/** @typedef {import('./image.mjs').Image} Image */
/** @typedef {import('./image.mjs').Rgba} Rgba */
/** @typedef {import('./procedural/bullets.mjs').CoreMark} CoreMark */
/** @typedef {import('./sprite-source.mjs').SpriteDef} SpriteDef */
/** @typedef {import('./sprite-source.mjs').AssetIssue} AssetIssue */
/** @typedef {import('./font.mjs').FontDef} FontDef */
/** @typedef {import('./font.mjs').FontMetrics} FontMetrics */
/** @typedef {import('./manifest.mjs').AtlasManifest} AtlasManifest */
/** @typedef {import('./manifest.mjs').ManifestFrame} ManifestFrame */
/** @typedef {import('./manifest.mjs').ManifestSprite} ManifestSprite */

/** This directory (`scripts/assets/`): every file in it is part of the input hash. */
export const PIPELINE_DIR = dirname(fileURLToPath(import.meta.url));

/** Repository root. */
export const REPO_ROOT = join(PIPELINE_DIR, '..', '..');

/** Default sources: `assets/source/`. */
export const DEFAULT_SOURCE_DIR = join(REPO_ROOT, 'assets', 'source');

/** Default output: `assets/generated/`. */
export const DEFAULT_OUT_DIR = join(REPO_ROOT, 'assets', 'generated');

/** Sub-folder of the output directory that holds the atlas. */
export const ATLAS_DIR = 'atlas';

/** Atlas base name: pages `main.png`, `main-1.png`, …; manifest `main.json`. */
export const ATLAS_NAME = 'main';

/** Cache file (in the output directory) recording the input hash and output hashes. */
export const CACHE_FILE = '.asset-cache.json';

/**
 * The atlas groups file, at the root of the source folder (R1-05): which sprites pack
 * onto a zone's own pages. Optional — without it every sprite outside a `zone-<id>`
 * directory is `common`.
 */
export const ATLAS_GROUPS_FILE = 'atlas-groups.json';

/** The `format` string the atlas groups file must carry. */
export const ATLAS_GROUPS_FORMAT = 'shmup-atlas-groups@1';

/**
 * The group of every sprite no rule assigns elsewhere — the art every zone draws (ships,
 * shots, bullets, items, fx, the font, UI, HUD). Its pages come first: page 0 is always
 * `main.png` = `common`.
 */
export const COMMON_GROUP = 'common';

/** A group name: lower-case kebab segments (`common`, `zone-a`). */
const GROUP_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A directory segment of a sprite name that puts the sprite in that zone's group. */
const ZONE_SEGMENT = /^zone-[a-z0-9]+$/;

/** Bump to invalidate every cache when the output format changes without a code change. */
const CACHE_VERSION = 1;

/** Atlas layout: transparent pixels to the right of and below every frame's border. */
export const ATLAS_PADDING = 1;

/**
 * Atlas layout: width of the border around every frame that repeats its edge pixels, so
 * sampling at a fractional offset never picks up a neighbour (tiles, the stretched
 * `ui/pixel`). Frames can be at most `2048 - 2 * ATLAS_EXTRUDE` pixels per side.
 */
export const ATLAS_EXTRUDE = 1;

/**
 * Error thrown when source files are invalid; `issues` lists every problem and the message
 * lists them one per line (`  - <path> <message>`), ready for a terminal.
 *
 * @example
 * try {
 *   buildAtlas();
 * } catch (error) {
 *   if (error instanceof AssetSourceError) console.error(error.issues.length, error.message);
 * }
 */
export class AssetSourceError extends Error {
  /**
   * Creates the error from the collected issues.
   *
   * @param {AssetIssue[]} issues - The problems (at least one).
   */
  constructor(issues) {
    super(
      `asset sources are invalid (${issues.length} issue${issues.length === 1 ? '' : 's'}):\n` +
        issues.map((issue) => `  - ${issue.path} ${issue.message}`).join('\n'),
    );
    this.name = 'AssetSourceError';
    /**
     * Every problem found, in source order (`path` = `<file>:<json path>`).
     *
     * @type {AssetIssue[]}
     */
    this.issues = issues;
  }
}

/**
 * A path for messages: repo-relative with `/` when inside the repository, else absolute.
 *
 * @param {string} path - Absolute path.
 * @returns {string} The display form.
 */
function displayPath(path) {
  const rel = relative(REPO_ROOT, path);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return path;
  return rel.split(sep).join('/');
}

/**
 * The parsed atlas groups file.
 *
 * @typedef {object} AtlasGroups
 * @property {boolean} present - Whether the file exists.
 * @property {string} file - Its display path (for issues).
 * @property {Map<string, string>} table - Base sprite name → group, in file order.
 * @property {AssetIssue[]} issues - Problems with the file itself (format, names, repeats);
 *   whether the names exist is checked by {@link collectSprites}.
 */

/**
 * Reads `assets/source/atlas-groups.json` (format `shmup-atlas-groups@1`).
 *
 * @remarks
 * Shape: `{ "format": "shmup-atlas-groups@1", "comment"?: string, "groups": { "<group>":
 * ["<sprite>", …] } }`. Group names are lower-case kebab; a sprite is listed by its base
 * name (no `@` — its `@flash`, `@p2` and palette siblings follow it) in at most one group.
 * A missing file is not an issue: the table is empty. Never throws.
 *
 * @param {string} [sourceDir] - Source root (default `assets/source/`).
 * @returns {AtlasGroups} The table and the file's issues.
 *
 * @example
 * loadAtlasGroups().table.get('enemies/ember-wisp'); // → 'zone-d'
 */
export function loadAtlasGroups(sourceDir = DEFAULT_SOURCE_DIR) {
  const path = join(sourceDir, ATLAS_GROUPS_FILE);
  const file = displayPath(path);
  /** @type {Map<string, string>} */
  const table = new Map();
  /** @type {AssetIssue[]} */
  const issues = [];
  if (!existsSync(path)) return { present: false, file, table, issues };
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    issues.push({ path: `${file}:`, message: `is not valid JSON (${String(error)})` });
    return { present: true, file, table, issues };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    issues.push({ path: `${file}:`, message: 'must be a JSON object' });
    return { present: true, file, table, issues };
  }
  const record = /** @type {Record<string, unknown>} */ (data);
  if (record.format !== ATLAS_GROUPS_FORMAT) {
    issues.push({ path: `${file}:format`, message: `must be "${ATLAS_GROUPS_FORMAT}"` });
  }
  if (record.comment !== undefined && typeof record.comment !== 'string') {
    issues.push({ path: `${file}:comment`, message: 'must be a string' });
  }
  for (const key of Object.keys(record)) {
    if (key !== 'format' && key !== 'comment' && key !== 'groups') {
      issues.push({ path: `${file}:${key}`, message: 'is not a known field' });
    }
  }
  const groups = record.groups;
  if (typeof groups !== 'object' || groups === null || Array.isArray(groups)) {
    issues.push({ path: `${file}:groups`, message: 'must be an object of group → names' });
    return { present: true, file, table, issues };
  }
  for (const [group, names] of Object.entries(groups)) {
    if (!GROUP_NAME.test(group)) {
      issues.push({ path: `${file}:groups.${group}`, message: 'is not a lower-case kebab name' });
      continue;
    }
    if (!Array.isArray(names)) {
      issues.push({ path: `${file}:groups.${group}`, message: 'must be an array of names' });
      continue;
    }
    names.forEach((name, i) => {
      const at = `${file}:groups.${group}[${i}]`;
      if (typeof name !== 'string' || name === '') {
        issues.push({ path: at, message: 'must be a sprite name' });
      } else if (name.includes('@')) {
        issues.push({
          path: at,
          message: `"${name}" is a sibling sprite — list its base, the siblings follow it`,
        });
      } else if (table.has(name)) {
        issues.push({ path: at, message: `"${name}" is already in group "${table.get(name)}"` });
      } else {
        table.set(name, group);
      }
    });
  }
  return { present: true, file, table, issues };
}

/**
 * The atlas group of a sprite (R1-05).
 *
 * @remarks
 * In order: the groups file's entry for the base name (the part before `@`, so `@flash`,
 * `@p2` and palette siblings follow their sprite); a `zone-<id>` directory segment in the
 * name (`enemies/zone-d/bat` → `zone-d`, for future art); otherwise {@link COMMON_GROUP}.
 * Fonts are not special here — {@link collectSprites} refuses a groups file that lists
 * one, and a font sprite (`font/<name>`) has no zone directory.
 *
 * @param {string} name - Sprite name.
 * @param {ReadonlyMap<string, string>} table - Base name → group (from
 *   {@link loadAtlasGroups}).
 * @returns {string} The group.
 *
 * @example
 * resolveAtlasGroup('enemies/drifter@flash', new Map([['enemies/drifter', 'zone-a']]));
 * // → 'zone-a'
 */
export function resolveAtlasGroup(name, table) {
  const at = name.indexOf('@');
  const base = at < 0 ? name : name.slice(0, at);
  const listed = table.get(base);
  if (listed !== undefined) return listed;
  const dirs = base.split('/').slice(0, -1);
  for (const dir of dirs) if (ZONE_SEGMENT.test(dir)) return dir;
  return COMMON_GROUP;
}

/**
 * The tile side the terrain tilesets are drawn at for an art scale (R2-01): `terrain.mjs`
 * `TILE_SIZE · artScale / INTERIM_ART_SCALE` — the generator's own size at the default scale, the
 * v1 8-px tiles at scale 1 and the v2 12-px tiles at 3/2, at either frame.
 *
 * @param {number} artScale - The build's art scale.
 * @returns {number} The tile side in pixels.
 * @throws {RangeError} When `artScale` is not a valid art scale or gives no whole tile side.
 */
function terrainTileSize(artScale) {
  const scale = parseArtScale(artScale);
  const base = parseArtScale(INTERIM_ART_SCALE);
  const top = TERRAIN_TILE_SIZE * scale.num * base.den;
  const bottom = scale.den * base.num;
  if (top % bottom !== 0) {
    throw new RangeError(
      `art scale ${artScale} draws no whole terrain tile (${TERRAIN_TILE_SIZE} × ${artScale} / ` +
        `${INTERIM_ART_SCALE})`,
    );
  }
  return top / bottom;
}

/**
 * Collects every sprite and font from the sources and generators, applies the art scale and PNG
 * overrides, adds hit-flash silhouettes, resolves default anchors and assigns each sprite its
 * atlas group.
 *
 * @remarks
 * Order of work: pixel maps and procedural sprites (a name defined twice is an issue; the
 * terrain tilesets drawn at the art scale's tile size) → the v2 sources of the art scale
 * (R4-P.P3, RR-1: at `artScale` ≠ 1 a `*.v2.sprite.json` replaces the v1 source of its name;
 * at scale 1 all v2 sources are ignored) → the art scale (R2-01, `interim.mjs`:
 * every sprite but a `native` one scaled nearest-neighbour, its explicit anchor `⌈s·a⌉`) → PNG
 * overrides by name (never scaled: real art is v2-native; at scale 1 an override of a name that
 * has a code source is skipped, RR-1) → the colour-blind `@<palette>`
 * variants of an overridden bullet, beam or bend recoloured from that override (R3-03.V5,
 * decision W5-13, {@link recolourBulletOverrides}) → font sprites (`font/<name>`, scaled
 * with their metrics — a v2 font only at the art scale, unscaled) → `<name>@flash`
 * siblings for `hitFlash` sprites → `<name>@p2` palette
 * maps of the ships and the stock icon (M2-06, `coop.mjs`, R3-03.V2a) — both from the scaled
 * sprites →
 * default anchors (centre of the scaled frame 0) → atlas groups ({@link resolveAtlasGroup} over
 * `atlas-groups.json`, R1-05: a listed name the atlas lacks, a listed font and an empty `common`
 * group are issues). Names and groups never depend on the art scale; the animation tables and
 * frame counts do for `native` art only — the laser beams (one frame per band height: 8 at
 * scale 1, 12 at 3/2 — `lasers.mjs`) and whatever a v2 source replaces (RR-1b) — the v1-scale
 * art keeps them at both scales.
 * Never throws for bad sources: everything is reported in `issues`, and the caller decides
 * ({@link buildAtlas} throws {@link AssetSourceError}). With `ungrouped`, every sprite is
 * `common` and the groups file is not read at all.
 *
 * @param {{ sourceDir?: string, ungrouped?: boolean, artScale?: number }} [options] - Source
 *   root (default `assets/source/`); `ungrouped: true` puts every sprite in `common` (the
 *   one-group layout of the atlas before R1-05 — the TV bench's model and the M3-03 CJK
 *   figures); `artScale`, the art's pixel scale relative to the v1 sources (default
 *   `interim.mjs` `INTERIM_ART_SCALE`; `1` = the v1 art, whatever the frame — W4-6).
 * @returns {{ sprites: SpriteDef[], fonts: Record<string, FontMetrics>, issues: AssetIssue[] }}
 *   Sprites sorted by name (anchors and `group` resolved), font metrics by font name, and
 *   problems.
 * @throws {RangeError} When `artScale` is not a valid art scale (`interim.mjs` `parseArtScale`)
 *   or draws no whole terrain tile.
 */
export function collectSprites(options = {}) {
  const sourceDir = options.sourceDir ?? DEFAULT_SOURCE_DIR;
  const artScale = options.artScale ?? INTERIM_ART_SCALE;
  const tileSize = terrainTileSize(artScale);
  const fraction = parseArtScale(artScale);
  const scaled = fraction.num !== fraction.den;
  const spritesDir = join(sourceDir, 'sprites');
  const fontsDir = join(sourceDir, 'fonts');
  const code = loadSpriteSources(spritesDir, displayPath(spritesDir));
  /** @type {AssetIssue[]} */
  const issues = [...code.issues];

  /** @type {Map<string, SpriteDef>} */
  const byName = new Map();
  /**
   * Adds a sprite, reporting a clash with an earlier definition.
   *
   * @param {SpriteDef} sprite - The sprite.
   */
  const add = (sprite) => {
    const other = byName.get(sprite.name);
    if (other !== undefined) {
      issues.push({
        path: `${sprite.origin}:name`,
        message: `sprite "${sprite.name}" is already defined by ${other.origin}`,
      });
      return;
    }
    byName.set(sprite.name, sprite);
  };
  for (const sprite of code.sprites) add(sprite);
  const procedural = generateProceduralSprites({ tileSize, artScale });
  for (const sprite of procedural) add(sprite);
  // v2 sources beside v1 (R4-P.P3, decision RR-1): at the art scale a `*.v2.sprite.json`
  // replaces the v1 source of its name (and a v2-only name simply joins the build); its
  // `native` is implied, so the interim stage below leaves it unscaled. At scale 1 the v2
  // sources are ignored — the v1 build never sees them.
  if (scaled) for (const sprite of code.v2) byName.set(sprite.name, sprite);

  // The interim art stage (R2-01, W4-5): every v1-scale source to the art scale; `native`
  // sources (terrain, ui/pixel, the laser beams, v2 redraws) are already at it. Nothing to do
  // at scale 1.
  const sources = [...byName.values()].map((sprite) =>
    scaled && sprite.native !== true ? scaleSprite(sprite, artScale) : sprite,
  );
  // PNG overrides after the scale: real art is v2-native and never scaled. At scale 1 an
  // override of a name that has a code source is skipped (R4-P.P3): the v1 build stays the
  // v1 art even when the v2 PNG of that name is already committed (a v1-only name, like the
  // M3-03 CJK figures, still applies at every scale).
  const codeNames = new Set();
  for (const sprite of code.sprites) codeNames.add(sprite.name);
  for (const sprite of procedural) codeNames.add(sprite.name);
  for (const sprite of code.v2) codeNames.add(sprite.name);
  const overrides = scaled
    ? code.overrides
    : code.overrides.filter((png) => !codeNames.has(png.name));
  const merged = applyPngOverrides(sources, overrides);
  byName.clear();
  for (const sprite of merged) byName.set(sprite.name, sprite);

  // Real-art bullets, beams and bends (R3-03.V5, decision W5-13): when a sprite of the
  // colour-blind set has a PNG override, its `@<palette>` variants recolour the override
  // instead of the procedural art, frame for frame and mark for mark.
  recolourBulletOverrides(byName);

  const fontSources = loadFontSources(fontsDir, displayPath(fontsDir));
  issues.push(...fontSources.issues);
  // The font of each name for this build (R4-P.P3, RR-1): at scale 1 a v2 font is ignored;
  // at the art scale the v2 (native) font of a name replaces its v1 font.
  /** @type {Map<string, FontDef>} */
  const chosenFonts = new Map();
  for (const font of fontSources.fonts) {
    if (font.native === true) {
      if (scaled) chosenFonts.set(font.name, font);
    } else if (!chosenFonts.has(font.name)) chosenFonts.set(font.name, font);
  }
  /** @type {Record<string, FontMetrics>} */
  const fonts = {};
  for (const font of chosenFonts.values()) {
    // The interim font (W4-4): the shipped font scaled with the art (6 × 8 → 9 × 12 at 3/2);
    // a v2 font (native, its cells already at the v2 size) is built as it is (R4-P.P3).
    const built = buildFontSprite(font);
    const { sprite, metrics } = scaled && font.native !== true ? scaleFont(built, artScale) : built;
    if (byName.has(sprite.name)) {
      issues.push({
        path: `${font.origin}:name`,
        message: `font sprite "${sprite.name}" clashes with ${byName.get(sprite.name)?.origin}`,
      });
      continue;
    }
    byName.set(sprite.name, sprite);
    fonts[font.name] = metrics;
  }

  for (const sprite of [...byName.values()]) {
    if (sprite.hitFlash) {
      const flash = makeFlashSprite(sprite);
      byName.set(flash.name, flash);
    }
  }
  // Player 2's palette map of the ships and the stock icon (plan M2-06; R3-03.V2a — the
  // sprite's own `p2` map replaced the red ↔ blue channel swap, so the variant is defined for
  // full-colour real art too). The map must exist and fit the art; either way it draws the
  // sibling or the build fails with the issues.
  for (const sprite of [...byName.values()]) {
    if (!wantsP2Variant(sprite.name)) continue;
    const path = `${sprite.origin}:p2`;
    const map = sprite.p2;
    if (map === undefined) {
      issues.push({
        path,
        message: `"${sprite.name}" gets a "@p2" variant and needs a "p2" palette map`,
      });
      continue;
    }
    const problems = p2MapIssues(sprite, map, path);
    if (problems.length > 0) {
      issues.push(...problems);
      continue;
    }
    const p2 = makeP2Sprite(sprite, map);
    byName.set(p2.name, p2);
  }

  // Atlas groups (R1-05): every name the file lists must be a sprite of this atlas, and
  // never a font (the font is drawn in every zone). Ungrouped: everything is common.
  const ungrouped = options.ungrouped === true;
  /** @type {AtlasGroups} */
  const atlasGroups = ungrouped
    ? { present: false, file: ATLAS_GROUPS_FILE, table: new Map(), issues: [] }
    : loadAtlasGroups(sourceDir);
  issues.push(...atlasGroups.issues);
  const fontSprites = new Set(Object.values(fonts).map((metrics) => metrics.sprite));
  for (const [name, group] of atlasGroups.table) {
    if (fontSprites.has(name)) {
      issues.push({
        path: `${atlasGroups.file}:groups.${group}`,
        message: `"${name}" is a font sprite — fonts always pack into "${COMMON_GROUP}"`,
      });
    } else if (!byName.has(name)) {
      issues.push({
        path: `${atlasGroups.file}:groups.${group}`,
        message: `"${name}" is not a sprite of the atlas (renamed or removed?)`,
      });
    }
  }

  const sprites = [...byName.values()]
    .map((sprite) => ({
      ...sprite,
      anchor:
        sprite.anchor ??
        /** @type {[number, number]} */ ([
          Math.floor(sprite.frames[0].width / 2),
          Math.floor(sprite.frames[0].height / 2),
        ]),
      group:
        ungrouped || fontSprites.has(sprite.name)
          ? COMMON_GROUP
          : resolveAtlasGroup(sprite.name, atlasGroups.table),
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (sprites.length > 0 && !sprites.some((sprite) => sprite.group === COMMON_GROUP)) {
    issues.push({
      path: `${atlasGroups.file}:groups`,
      message: `leaves the "${COMMON_GROUP}" group empty — page 0 (main.png) must hold it`,
    });
  }
  return { sprites, fonts, issues };
}

/**
 * Checks a player 2 palette map against the art it must draw (R3-03.V2a): every key must be a
 * colour the frames actually hold, and at least one pixel of the art must change. A colour the
 * art does not contain is a stale map (the art was redrawn without it); a map that changes no
 * pixel is a no-op masquerading as a variant.
 *
 * @param {SpriteDef} sprite - The sprite whose `@p2` variant the map draws.
 * @param {Readonly<Record<string, string>>} map - The `"#rrggbb": "#rrggbb"` map.
 * @param {string} path - Issue path (`<origin>:p2`).
 * @returns {AssetIssue[]} The problems — empty when the map maps the art.
 */
function p2MapIssues(sprite, map, path) {
  /** @type {Set<number>} */
  const colors = new Set();
  for (const frame of sprite.frames) {
    const d = frame.data;
    for (let i = 0; i < d.length; i += 4) colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  }
  /** @type {AssetIssue[]} */
  const problems = [];
  let changes = false;
  for (const [from, to] of Object.entries(map)) {
    const src = parseColor(from);
    const dst = parseColor(to);
    if (src === null || dst === null) {
      problems.push({
        path: `${path}.${from}`,
        message: `"${from}" → "${to}" is not a colour pair "#rrggbb" → "#rrggbb"`,
      });
      continue;
    }
    const key = (src[0] << 16) | (src[1] << 8) | src[2];
    const value = (dst[0] << 16) | (dst[1] << 8) | dst[2];
    if (!colors.has(key)) {
      problems.push({
        path: `${path}.${from}`,
        message: `colour "${from}" is not in the art of "${sprite.name}"`,
      });
    } else if (value !== key) {
      changes = true;
    }
  }
  if (!changes) {
    problems.push({ path, message: `changes no pixel of "${sprite.name}"` });
  }
  return problems;
}

/** A colour-blind palette variant name tail: `@<palette>` with a palette of `BULLET_PALETTES`. */
const PALETTE_VARIANT = /@(deuteranopia|protanopia|tritanopia)$/;

/**
 * The engine bullet, beam and bending-laser families — the sprites `palettes.mjs` builds a
 * colour-blind set for: `bullets.mjs`'s three shapes in the three colours, `lasers.mjs`'s beam
 * and bend node (`pnpm content:check` demands every variant of every one of them).
 */
const PALETTE_BASE = /^(?:bullets|lasers)\/(?:round|oval|needle|beam|bend)-(pink|red|purple)$/;

/** The radius of the recoloured `ring` / `dot` mark in pixels — the v2 plus (R3-03.V1). */
const PALETTE_MARK_RADIUS = 1;

/**
 * The 8-bit luma of a colour: integer BT.601 weights (77 + 150 + 29 = 256), exact on every
 * engine — no float, no `Math.pow`.
 *
 * @param {Rgba} rgba - The colour.
 * @returns {number} The luma, 0…255.
 */
function luma(rgba) {
  return (rgba[0] * 77 + rgba[1] * 150 + rgba[2] * 29) >> 8;
}

/**
 * Recolours the colour-blind variants of the overridden bullet, beam and bend sprites
 * (R3-03.V5, decision W5-13): a `@<palette>` sibling of a sprite whose frames come from a PNG
 * override is dropped and rebuilt from the override — every opaque pixel classified into the v1
 * art's rim / body / core bands by luma (the boundaries are the sums of neighbouring reference
 * lumas compared against twice the pixel's, all integers, so no engine rounds differently),
 * recoloured to the palette's body colour with the `mix` ratios `bullets.mjs` draws with, and
 * re-marked with the family's shape code (`CORE_MARKS`; the beams and bend nodes carry none).
 * The variant is `palette:<base>` — the provenance report classes it with its base, like the
 * `flash:` / `p2:` siblings — and keeps the base's frame count, sizes and anchor, which the
 * content check requires frame for frame.
 *
 * @param {Map<string, SpriteDef>} byName - The merged sprites (the procedural siblings are the
 *   only entries of origin `procedural:palettes`); the recoloured variants replace them in place.
 */
function recolourBulletOverrides(byName) {
  const black = color('#000000');
  const white = color('#ffffff');
  for (const sprite of [...byName.values()]) {
    if (sprite.origin !== 'procedural:palettes') continue;
    const variant = PALETTE_VARIANT.exec(sprite.name);
    if (variant === null) continue;
    const baseName = sprite.name.slice(0, sprite.name.length - variant[0].length);
    const base = byName.get(baseName);
    if (base === undefined || !base.origin.endsWith('.png')) continue;
    const familyMatch = PALETTE_BASE.exec(baseName);
    if (familyMatch === null) continue;
    const family = /** @type {keyof typeof BULLET_COLORS} */ (familyMatch[1]);
    const body = color(BULLET_PALETTES[variant[1]][family]);
    const target = {
      rim: mix(body, black, 0.68),
      body,
      core: mix(body, white, 0.75),
    };
    const v1 = color(BULLET_COLORS[family]);
    const refs = {
      rimPlusBody: luma(mix(v1, black, 0.68)) + luma(v1),
      bodyPlusCore: luma(v1) + luma(mix(v1, white, 0.75)),
    };
    const mark = /** @type {CoreMark} */ (
      baseName.startsWith('bullets/') ? CORE_MARKS[family] : 'solid'
    );
    byName.set(sprite.name, {
      name: sprite.name,
      anchor: base.anchor,
      hitFlash: false,
      frames: base.frames.map((frame) => recolourFrame(frame, refs, target, mark)),
      animations: { ...base.animations },
      origin: `palette:${baseName}`,
      native: true,
    });
  }
}

/**
 * One recoloured frame (the work of {@link recolourBulletOverrides} per frame).
 *
 * @param {Image} frame - The override's frame.
 * @param {{ rimPlusBody: number, bodyPlusCore: number }} refs - The v1 band boundaries.
 * @param {{ rim: Rgba, body: Rgba, core: Rgba }} target - The palette's band colours.
 * @param {CoreMark} mark - The family's shape code: `ring` paints the centre plus with the rim,
 *   `dot` drops the core band to the body and paints the plus with the core, `solid` paints
 *   nothing (the beams and bend nodes).
 * @returns {Image} The variant frame — same size, transparent pixels untouched.
 */
function recolourFrame(frame, refs, target, mark) {
  const out = createImage(frame.width, frame.height);
  const d = frame.data;
  const o = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const alpha = d[i + 3];
    if (alpha === 0) continue;
    const twiceLuma = ((d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8) * 2;
    const c =
      twiceLuma <= refs.rimPlusBody
        ? target.rim
        : twiceLuma <= refs.bodyPlusCore
          ? target.body
          : mark === 'dot'
            ? target.body
            : target.core;
    o[i] = c[0];
    o[i + 1] = c[1];
    o[i + 2] = c[2];
    o[i + 3] = alpha;
  }
  if (mark === 'solid') return out;
  const ink = mark === 'ring' ? target.rim : target.core;
  const cx = (frame.width - 1) / 2;
  const cy = (frame.height - 1) / 2;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= PALETTE_MARK_RADIUS * PALETTE_MARK_RADIUS) {
        setPixel(out, x, y, ink);
      }
    }
  }
  return out;
}

/**
 * Copies a frame onto a page and repeats its edge pixels into the extrusion border.
 *
 * @param {Image} page - Target page.
 * @param {Image} frame - Frame pixels.
 * @param {number} x - Frame's left column on the page.
 * @param {number} y - Frame's top row on the page.
 * @param {number} extrude - Border width.
 */
function placeFrame(page, frame, x, y, extrude) {
  blit(page, frame, x, y);
  for (let py = -extrude; py < frame.height + extrude; py++) {
    for (let px = -extrude; px < frame.width + extrude; px++) {
      if (px >= 0 && py >= 0 && px < frame.width && py < frame.height) continue;
      const sx = Math.min(Math.max(px, 0), frame.width - 1);
      const sy = Math.min(Math.max(py, 0), frame.height - 1);
      setPixel(page, x + px, y + py, getPixel(frame, sx, sy));
    }
  }
}

/**
 * File name of page `index`.
 *
 * @param {number} index - Page index.
 * @returns {string} `main.png`, `main-1.png`, …
 */
export const pageFileName = (index) =>
  index === 0 ? `${ATLAS_NAME}.png` : `${ATLAS_NAME}-${index}.png`;

/**
 * Builds the atlas in memory.
 *
 * @remarks
 * Every atlas group packs onto its own pages (R1-05): `common` first — page 0 is
 * `main.png` = `common` — then the other groups by name, each page recorded with its
 * `group` in the manifest. Sprite and frame names never depend on the grouping, and
 * without a groups file (and no `zone-<id>` directories) the layout is the one-group one.
 *
 * With `artScale` (R2-01) the art is built at that scale ({@link collectSprites}); the default is
 * `interim.mjs` `INTERIM_ART_SCALE`, and `artScale: 1` is the v1 atlas byte for byte at either
 * frame (W4-6).
 *
 * @param {{ sourceDir?: string, maxPageSize?: number, ungrouped?: boolean,
 *   artScale?: number }} [options] - Source root, page-size limit (power of two, default 2048),
 *   `ungrouped: true` to pack every sprite as `common` — the one-group layout of the atlas before
 *   R1-05, byte for byte (the TV bench's model, `apps/tizen/scripts/bench-atlas.mjs`; the CJK
 *   figures) — and the art scale (default `INTERIM_ART_SCALE`).
 * @returns {{ manifest: AtlasManifest, pages: { file: string, image: Image, png: Buffer }[],
 *   sprites: SpriteDef[] }} The manifest, the pages (pixels + PNG bytes) and the sprites.
 * @throws {AssetSourceError} When any source file is invalid, or a frame is too large for
 *   an atlas page.
 * @throws {RangeError} When `maxPageSize` is not a power of two, or `artScale` is not a valid
 *   art scale.
 *
 * @example
 * const { manifest, pages } = buildAtlas();
 * manifest.sprites['ships/kestrel'].frames; // → ['ships/kestrel#0', 'ships/kestrel#1', …]
 */
export function buildAtlas(options = {}) {
  const collected = collectSprites(options);
  if (collected.issues.length > 0) throw new AssetSourceError(collected.issues);
  const sprites = collected.sprites;
  const maxPageSize = options.maxPageSize ?? MAX_PAGE_SIZE;

  // A frame that cannot fit a page (real art can be any size) is a source problem: report
  // it with its file instead of letting the packer throw a bare RangeError.
  const limit = maxPageSize - 2 * ATLAS_EXTRUDE;
  /** @type {AssetIssue[]} */
  const oversized = [];
  for (const sprite of sprites) {
    // Generated siblings are reported for their source sprite.
    if (sprite.name.endsWith(FLASH_SUFFIX) || sprite.name.endsWith(P2_SUFFIX)) continue;
    sprite.frames.forEach((frame, i) => {
      if (frame.width > limit || frame.height > limit) {
        oversized.push({
          path: `${sprite.origin}:frames[${i}]`,
          message:
            `sprite "${sprite.name}" frame ${i} is ${frame.width}×${frame.height}; frames can ` +
            `be at most ${limit}×${limit} (a ${maxPageSize}² atlas page minus the ` +
            `${ATLAS_EXTRUDE}-px border)`,
        });
      }
    });
  }
  if (oversized.length > 0) throw new AssetSourceError(oversized);

  // Each group packs onto its own pages, `common` first (page 0 = main.png) — R1-05.
  const items = sprites.flatMap((sprite) =>
    sprite.frames.map((frame, i) => ({
      name: frameName(sprite.name, i),
      w: frame.width,
      h: frame.height,
      group: sprite.group ?? COMMON_GROUP,
    })),
  );
  const packing = packRects(items, {
    maxSize: maxPageSize,
    padding: ATLAS_PADDING,
    extrude: ATLAS_EXTRUDE,
    groupOrder: [COMMON_GROUP],
  });
  const pageImages = packing.pages.map((page) => createImage(page.w, page.h));

  /** @type {Record<string, ManifestFrame>} */
  const frames = {};
  /** @type {Record<string, ManifestSprite>} */
  const spriteTable = {};
  /** @type {Record<string, Record<string, number[]>>} */
  const animations = {};
  const flashNames = new Set(sprites.filter((s) => s.hitFlash).map((s) => s.name));
  let item = 0;
  for (const sprite of sprites) {
    const anchor = /** @type {[number, number]} */ (sprite.anchor);
    const names = [];
    for (const frame of sprite.frames) {
      const placed = packing.placements[item++];
      placeFrame(pageImages[placed.p], frame, placed.x, placed.y, ATLAS_EXTRUDE);
      frames[placed.name] = {
        p: placed.p,
        x: placed.x,
        y: placed.y,
        w: placed.w,
        h: placed.h,
        ax: anchor[0],
        ay: anchor[1],
      };
      names.push(placed.name);
    }
    spriteTable[sprite.name] = {
      frames: names,
      flash: flashNames.has(sprite.name) ? `${sprite.name}@flash` : null,
    };
    const tags = Object.keys(sprite.animations).sort();
    if (tags.length > 0) {
      /** @type {Record<string, number[]>} */
      const table = {};
      for (const tag of tags) table[tag] = sprite.animations[tag].slice();
      animations[sprite.name] = table;
    }
  }

  /** @type {Record<string, FontMetrics>} */
  const fonts = {};
  for (const name of Object.keys(collected.fonts).sort()) fonts[name] = collected.fonts[name];

  // A page of at most 256 colours is written as lossless PNG-8 (R1-05, decision W3-3).
  const pages = pageImages.map((image, index) => ({
    file: pageFileName(index),
    image,
    png: encodePng(image, { indexed: 'auto' }),
  }));
  /** @type {AtlasManifest} */
  const manifest = {
    formatVersion: MANIFEST_FORMAT_VERSION,
    pages: pages.map((page, index) => ({
      file: page.file,
      w: page.image.width,
      h: page.image.height,
      group: /** @type {string} */ (packing.pages[index].group),
    })),
    frames,
    sprites: spriteTable,
    animations,
    fonts,
  };
  return { manifest, pages, sprites };
}

/**
 * Feeds every file below `dir` (sorted, with its path and length) into `hash`.
 *
 * @param {import('node:crypto').Hash} hash - Running hash.
 * @param {string} label - Prefix that keeps the trees apart (`pipeline`, `sprites`, …).
 * @param {string} dir - Directory (missing → nothing).
 * @param {boolean} skipDocs - Skip `*.md` and `.gitkeep` (documentation, not input).
 */
function hashTree(hash, label, dir, skipDocs) {
  for (const file of listFiles(dir)) {
    const base = file.slice(file.lastIndexOf('/') + 1);
    if (skipDocs && (base.endsWith('.md') || base === '.gitkeep')) continue;
    const bytes = readFileSync(join(dir, file));
    hash.update(`${label}/${file}\0${bytes.length}\0`);
    hash.update(bytes);
  }
}

/**
 * Hash of the code this process runs: the pipeline scripts (`scripts/assets/**`) as they
 * were **when this module was loaded**, the frame mirror `scripts/frame.mjs` (R4-P.P3: a
 * generator may read frame sizes through `scripts/assets/v2kit.mjs`, so the mirror belongs
 * to the code that drew the atlas), plus the zlib (deflate output) and pngjs
 * (decoding) versions.
 *
 * @remarks
 * Snapshotted once on purpose. A long-lived importer (the `pnpm dev` server) keeps
 * running the modules it loaded even after a pipeline script is edited on disk; hashing
 * the files anew on every run would record the new code's hash next to pixels drawn by
 * the old code, and every later run would take that stale atlas for current. With the
 * snapshot, such a process keeps writing (and cache-hitting) under its own code's hash,
 * and the next fresh process sees a different hash and rebuilds. Node reads the modules
 * just before this runs, so only an edit within those milliseconds could slip through.
 */
const CODE_HASH = (() => {
  const hash = createHash('sha256');
  const pngjsVersion = /** @type {{ version: string }} */ (
    createRequire(import.meta.url)('pngjs/package.json')
  ).version;
  hash.update(`zlib ${process.versions.zlib}\0pngjs ${pngjsVersion}\0`);
  hashTree(hash, 'pipeline', PIPELINE_DIR, false);
  const frameBytes = readFileSync(join(REPO_ROOT, 'scripts', 'frame.mjs'));
  hash.update(`frame/${frameBytes.length}\0`);
  hash.update(frameBytes);
  return hash.digest('hex');
})();

/**
 * Hashes everything that can change the pipeline's output.
 *
 * @param {string} [sourceDir] - Source root (default `assets/source/`).
 * @returns {string} Hex SHA-256 of the loaded pipeline code (see {@link CODE_HASH}: the
 *   scripts as loaded by this process, the frame mirror and the zlib and pngjs versions), of
 *   the sprite and font sources and of the atlas groups file ({@link ATLAS_GROUPS_FILE}, R1-05)
 *   as they are on disk now.
 */
export function computeInputHash(sourceDir = DEFAULT_SOURCE_DIR) {
  const hash = createHash('sha256');
  hash.update(`shmup-assets cache ${CACHE_VERSION}\0code ${CODE_HASH}\0`);
  hashTree(hash, 'sprites', join(sourceDir, 'sprites'), true);
  hashTree(hash, 'fonts', join(sourceDir, 'fonts'), true);
  const groupsFile = join(sourceDir, ATLAS_GROUPS_FILE);
  if (existsSync(groupsFile)) {
    const bytes = readFileSync(groupsFile);
    hash.update(`groups/${ATLAS_GROUPS_FILE}\0${bytes.length}\0`);
    hash.update(bytes);
  }
  return hash.digest('hex');
}

/**
 * Writes a file atomically (temp file + rename), so a concurrent reader never sees a
 * half-written file and concurrent writers of identical bytes cannot corrupt it.
 *
 * @param {string} file - Target path.
 * @param {string | Uint8Array} contents - Bytes or UTF-8 text.
 */
function writeAtomic(file, contents) {
  const temp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(temp, contents);
  try {
    renameSync(temp, file);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

/**
 * SHA-256 of a byte string.
 *
 * @param {string | Uint8Array} bytes - Input.
 * @returns {string} Hex digest.
 */
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * Result of {@link generateAssets}.
 *
 * @typedef {object} GenerateResult
 * @property {boolean} cached - `true` when the inputs were unchanged and nothing was written.
 * @property {string} inputHash - The input hash the outputs correspond to.
 * @property {AtlasManifest} manifest - The atlas manifest.
 * @property {string} atlasDir - Absolute directory holding the pages and `main.json`.
 * @property {string[]} files - Written/verified files relative to the output directory
 *   (`atlas/main.png`, …, `atlas/main.json`).
 */

/**
 * Runs the pipeline to disk, skipping the work when nothing changed.
 *
 * @remarks
 * Skips when the cache file records the same input hash and every recorded output still
 * exists with the recorded SHA-256 (a deleted or edited output forces a rebuild). Stale
 * pages from a previous, larger atlas are removed. It always builds at the default art scale
 * (`interim.mjs` `INTERIM_ART_SCALE`, which the input hash covers with `scripts/assets/**`
 * and the `scripts/frame.mjs` mirror) and takes no `artScale`, so another scale's atlas is
 * never written or cached as the shipped one.
 *
 * @param {{ sourceDir?: string, outDir?: string, force?: boolean,
 *   log?: (message: string) => void }} [options] - Source root, output root
 *   (default `assets/generated/`), `force` to ignore the cache, and a logger.
 * @returns {GenerateResult} What was produced.
 * @throws {AssetSourceError} When a source file is invalid (nothing is written).
 *
 * @example
 * const { cached, manifest } = generateAssets(); // `pnpm assets`
 */
export function generateAssets(options = {}) {
  const sourceDir = options.sourceDir ?? DEFAULT_SOURCE_DIR;
  const outDir = options.outDir ?? DEFAULT_OUT_DIR;
  const log = options.log ?? (() => {});
  const atlasDir = join(outDir, ATLAS_DIR);
  const cacheFile = join(outDir, CACHE_FILE);
  const inputHash = computeInputHash(sourceDir);
  const manifestRel = `${ATLAS_DIR}/${ATLAS_NAME}.json`;

  if (options.force !== true && existsSync(cacheFile)) {
    try {
      const cache = JSON.parse(readFileSync(cacheFile, 'utf8'));
      const outputs = /** @type {Record<string, string>} */ (cache.outputs ?? {});
      const intact =
        cache.version === CACHE_VERSION &&
        cache.inputHash === inputHash &&
        manifestRel in outputs &&
        Object.entries(outputs).every(([file, digest]) => {
          const path = join(outDir, file);
          return existsSync(path) && sha256(readFileSync(path)) === digest;
        });
      if (intact) {
        const manifest = JSON.parse(readFileSync(join(outDir, manifestRel), 'utf8'));
        log(`assets up to date (${displayPath(atlasDir)}/, input ${inputHash.slice(0, 12)})`);
        return { cached: true, inputHash, manifest, atlasDir, files: Object.keys(outputs) };
      }
    } catch {
      // Unreadable cache or outputs: rebuild below.
    }
  }

  const { manifest, pages } = buildAtlas({ sourceDir });
  mkdirSync(atlasDir, { recursive: true });
  /** @type {Record<string, string>} */
  const outputs = {};
  for (const page of pages) {
    writeAtomic(join(atlasDir, page.file), page.png);
    outputs[`${ATLAS_DIR}/${page.file}`] = sha256(page.png);
  }
  const json = formatManifest(manifest);
  writeAtomic(join(outDir, manifestRel), json);
  outputs[manifestRel] = sha256(json);

  const keep = new Set(pages.map((page) => page.file));
  for (const entry of readdirSync(atlasDir)) {
    if (/^main(-\d+)?\.png$/.test(entry) && !keep.has(entry)) {
      try {
        unlinkSync(join(atlasDir, entry));
      } catch {
        // Already removed by a concurrent run.
      }
    }
  }
  writeAtomic(
    cacheFile,
    JSON.stringify({ version: CACHE_VERSION, inputHash, outputs }, null, 2) + '\n',
  );
  const frameCount = Object.keys(manifest.frames).length;
  const spriteCount = Object.keys(manifest.sprites).length;
  const grouped = manifest.pages.some((page) => page.group !== COMMON_GROUP);
  const pageList = manifest.pages
    .map((page) => `${page.file} ${page.w}×${page.h}${grouped ? ` ${page.group}` : ''}`)
    .join(', ');
  log(
    `assets generated → ${displayPath(atlasDir)}/: ${pageList}; ${spriteCount} sprites, ` +
      `${frameCount} frames, ${Object.keys(manifest.fonts).length} font(s)`,
  );
  return { cached: false, inputHash, manifest, atlasDir, files: Object.keys(outputs) };
}

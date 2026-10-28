/**
 * The **game-code hash** — the identity the TV render bench's skip ledger and the bench analyzer
 * pool timings by (plan v20x BENCSKIP, owner 2026-10-28: re-measuring the whole 190-row suite
 * after a bench-only, docs-only or test-only rebuild throws away timings the M7 already gave;
 * but Pixi-bump scar `b42d34f2` — a dependency quietly changing the render path — says raw
 * cross-build carry-over is forbidden). The hash is therefore neither the bundle id nor the whole
 * tree: it is a deterministic content digest of exactly the shipped game's draw inputs, so a
 * rebuild of unchanged game code inherits its timings and any change that can move a pixel
 * forces the full suite.
 *
 * **Hashed** (relative to the tree root, walked in sorted order):
 * - `packages/{core,render-pixi,audio-web,input-web,shell}/src/**` — the shipped game code;
 * - `content/**` — the game data (the bench inlines `content/fx`, the virtual module ships the
 *   rest; any content change can move a measured row);
 * - `assets/source/**` except `*.v2.sprite.json` — the art sources the scale-1 atlas is built
 *   from (decision RR-1: v2 pixel maps are inert in every scale-1 build, bench and game alike,
 *   so they must not force a re-run);
 * - `scripts/assets/**` — the atlas pipeline and the procedural generators that turn those
 *   sources into the pages the bench draws (their byte-identical output is a pinned law).
 *
 * **Not hashed**: the bench itself (`apps/{tizen,webos}/src/bench`, their `scripts/bench-*`), the apps'
 * boot, tests, docs, tools, `art-prompts/`, `assets/generated/` (derived bytes, absent from a
 * git tree — the sources above are its transitive inputs, so a tree can be hashed straight from
 * `git archive`), `*.v2.sprite.json`, and `.md` files inside the hashed trees (README samples are
 * prose). Comment/docblock bytes inside a hashed source file **are** hashed: identity is file
 * bytes, because stripping comments safely would need a real parser over the GLSL sources kept in
 * template literals — and a false miss hides a code change (the dangerous direction), while a
 * false match only buys the noise-floor sample amendment 2 welcomes.
 *
 * **Form**: each file contributes `rel + '\n' + sha256hex(bytes) + '\n'` to a running sha256
 * over the sorted relative paths (`/`-separated); the digest prints as its first 10 hex chars.
 *
 * Used as a define by both bench Vite configs (`__SHMUP_GAME_CODE_HASH__` — the game build does
 * not carry it), by `apps/tizen/src/bench/ledger.ts` through the widget, by the analyzer's
 * pooling, and on the command line: `node scripts/game-code-hash.mjs [root]` prints it for any
 * tree (the runbook proof: `git archive <commit> | tar -x -C <dir>` then hash that dir).
 *
 * @module
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The directory trees the hash covers (relative to the tree root). */
export const GAME_CODE_DIRS = Object.freeze([
  'packages/core/src',
  'packages/render-pixi/src',
  'packages/audio-web/src',
  'packages/input-web/src',
  'packages/shell/src',
  'content',
  'assets/source',
  'scripts/assets',
]);

/**
 * File-name suffixes excluded everywhere under {@link GAME_CODE_DIRS}: v2 art is scale-1-inert,
 * and Markdown inside a hashed tree (a `content/<folder>/README.md`, the format sample a content
 * check reads) never reaches the bundle — the loaders glob JSON only.
 */
export const GAME_CODE_EXCLUDES = Object.freeze(['.v2.sprite.json', '.md']);

/**
 * Whether a relative path is hashed (a file under a hashed tree, not excluded).
 *
 * @param {string} rel - `/`-separated path relative to the tree root.
 * @returns {boolean} true when the file joins the digest.
 */
export function isGameCodePath(rel) {
  let under = false;
  for (const dir of GAME_CODE_DIRS) {
    if (rel === dir || rel.startsWith(`${dir}/`)) under = true;
  }
  if (!under) return false;
  for (const suffix of GAME_CODE_EXCLUDES) {
    if (rel.endsWith(suffix)) return false;
  }
  return true;
}

/**
 * Lists the hashed files of a tree, sorted by relative path.
 *
 * @param {string} root - The tree root.
 * @returns {string[]} `/`-separated relative paths that exist (a missing tree contributes none).
 */
export function listGameCodeFiles(root) {
  /**
   * Walks one directory, appending its files.
   *
   * @param {string} abs - Absolute directory path.
   * @param {string} rel - Its `/`-separated relative prefix.
   */
  const walk = (abs, rel) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(join(abs, entry.name), childRel);
      else if (entry.isFile() && isGameCodePath(childRel)) found.push(childRel);
    }
  };
  /** @type {string[]} */
  const found = [];
  for (const dir of GAME_CODE_DIRS) {
    const abs = join(root, dir);
    if (existsSync(abs)) walk(abs, dir);
  }
  found.sort();
  return found;
}

/**
 * Computes the game-code hash of a tree.
 *
 * @param {string} root - The tree root (the repo checkout, or a `git archive` extraction).
 * @returns {string} the first 10 hex chars of the digest — the identity a bench run's ledger and
 *   the analyzer's pooling key on.
 */
export function gameCodeHash(root) {
  const running = createHash('sha256');
  for (const rel of listGameCodeFiles(resolve(root))) {
    const perFile = createHash('sha256')
      .update(readFileSync(join(root, rel)))
      .digest('hex');
    running.update(`${rel}\n${perFile}\n`);
  }
  return running.digest('hex').slice(0, 10);
}

/** True when run as a script, false when imported (tests, the Vite configs). */
const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const arg = process.argv[2];
  console.log(gameCodeHash(arg === undefined ? process.cwd() : resolve(arg)));
}

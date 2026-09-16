#!/usr/bin/env node
/**
 * `pnpm itch:package` — packs the browser build into the ZIP itch.io wants (plan M3-03,
 * shmup_feat.md §23 Web-specific "[P2] public itch.io / web release").
 *
 * itch.io's HTML5 hosting takes **one ZIP with `index.html` at its root**, unpacks it and serves
 * it from an iframe on a random origin. That is exactly what `pnpm --filter @shmup/web build`
 * already produces — the web build has used `base: './'` since M1-04 so the same `dist/` can be
 * served from a sub-path, from Electron's `app://` and from itch — so this script only has to
 * archive it. It leaves out the source maps ({@link SKIPPED_SUFFIXES}), which would otherwise be
 * the largest thing in the upload and would publish the TypeScript sources.
 *
 * > **Never run here.** Packaging the public release is the owner's step: no agent uploads
 * > anything, and no agent has run this script. The upload itself (butler or the web form) is in
 * > plan §8.9 with the rest of the account-only work.
 *
 * The ZIP is written by hand ({@link zipArchive}) rather than with a dependency: the repo already
 * writes its own PNGs (`scripts/assets/png.mjs`), and this step may not add a dependency the plan
 * does not name. Entries are deflated with `node:zlib`, stored in path order, with fixed
 * timestamps — so the archive is **byte-identical** for the same input on every machine.
 *
 * Usage:
 *   pnpm --filter @shmup/web build
 *   node scripts/itch-package.mjs                 write assets/generated/itch/<name>.zip
 *   node scripts/itch-package.mjs --dist DIR      pack another folder
 *   node scripts/itch-package.mjs --out FILE      write somewhere else
 *
 * **Public API.** {@link zipArchive}, {@link collectItchFiles}, {@link ITCH_ZIP_NAME},
 * {@link SKIPPED_SUFFIXES}, {@link DEFAULT_DIST_DIR}, {@link DEFAULT_OUT_DIR}.
 *
 * @module
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

/** Repository root. */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The browser build this packs (`pnpm --filter @shmup/web build`). */
export const DEFAULT_DIST_DIR = join(REPO_ROOT, 'apps', 'web', 'dist');

/** Where the archive goes (git-ignored, like the rest of `assets/generated/`). */
export const DEFAULT_OUT_DIR = join(REPO_ROOT, 'assets', 'generated', 'itch');

/** Name of the archive itch.io receives. */
export const ITCH_ZIP_NAME = 'shmup-cup-web.zip';

/**
 * Files left out of the upload: source maps publish the TypeScript sources and are by far the
 * largest files in `dist/`.
 */
export const SKIPPED_SUFFIXES = Object.freeze(['.map']);

/**
 * Every file of a build folder that belongs in the upload.
 *
 * @param distDir - The build folder.
 * @returns `{ name, data }` entries, `/`-separated and sorted by name — so the archive is the same
 *   on every machine and on every file system.
 * @throws {Error} When the folder does not exist or holds no `index.html`.
 *
 * @example
 * ```js
 * const files = collectItchFiles('apps/web/dist');
 * // → [{ name: 'app.js', data }, { name: 'assets/atlas/main.png', data }, { name: 'index.html', … }]
 * ```
 */
export function collectItchFiles(distDir) {
  if (!existsSync(distDir)) {
    throw new Error(`${distDir} does not exist — run \`pnpm --filter @shmup/web build\` first`);
  }
  /** @type {{ name: string, data: Uint8Array }[]} */
  const files = [];
  /**
   * Walks a folder into {@link files}.
   *
   * @param {string} dir - Absolute path.
   * @param {string} prefix - Its path inside the archive.
   */
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      const name = prefix === '' ? entry : `${prefix}/${entry}`;
      if (statSync(full).isDirectory()) {
        walk(full, name);
        continue;
      }
      if (SKIPPED_SUFFIXES.some((suffix) => name.endsWith(suffix))) continue;
      files.push({ name, data: readFileSync(full) });
    }
  };
  walk(distDir, '');
  if (!files.some((file) => file.name === 'index.html')) {
    throw new Error(`${distDir} has no index.html — itch.io serves that file as the game`);
  }
  return files;
}

/**
 * Writes a 32-bit little-endian value.
 *
 * @param {number[]} out - Byte sink.
 * @param {number} value - The value.
 */
function u32(out, value) {
  out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

/**
 * Writes a 16-bit little-endian value.
 *
 * @param {number[]} out - Byte sink.
 * @param {number} value - The value.
 */
function u16(out, value) {
  out.push(value & 0xff, (value >>> 8) & 0xff);
}

/**
 * Builds a ZIP archive.
 *
 * @remarks
 * A plain ZIP with one deflated entry per file, no data descriptors, no ZIP64 and no extra fields;
 * every entry gets the same fixed DOS timestamp (1980-01-01), so the same input always produces
 * the same bytes. Names are stored as UTF-8 with the language-encoding flag set.
 *
 * @param {{ name: string, data: Uint8Array }[]} files - Entries, in the order they are stored.
 * @returns {Buffer} The archive.
 *
 * @example
 * ```js
 * writeFileSync('out.zip', zipArchive([{ name: 'index.html', data: Buffer.from('<!doctype html>') }]));
 * ```
 */
export function zipArchive(files) {
  /** @type {Buffer[]} */
  const parts = [];
  /** @type {{ name: Buffer, crc: number, packed: number, size: number, offset: number }[]} */
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const data = Buffer.from(file.data);
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    /** @type {number[]} */
    const header = [];
    u32(header, 0x04034b50);
    u16(header, 20); // version needed: 2.0 (deflate)
    u16(header, 0x0800); // UTF-8 names
    u16(header, 8); // deflate
    u16(header, 0); // time  — fixed, for reproducible archives
    u16(header, 0x0021); // date — 1980-01-01
    u32(header, crc);
    u32(header, packed.length);
    u32(header, data.length);
    u16(header, name.length);
    u16(header, 0); // no extra field
    const local = Buffer.from(header);
    parts.push(local, name, packed);
    central.push({ name, crc, packed: packed.length, size: data.length, offset });
    offset += local.length + name.length + packed.length;
  }
  const directoryOffset = offset;
  let directorySize = 0;
  for (const entry of central) {
    /** @type {number[]} */
    const header = [];
    u32(header, 0x02014b50);
    u16(header, 20); // version made by
    u16(header, 20); // version needed
    u16(header, 0x0800);
    u16(header, 8);
    u16(header, 0);
    u16(header, 0x0021);
    u32(header, entry.crc);
    u32(header, entry.packed);
    u32(header, entry.size);
    u16(header, entry.name.length);
    u16(header, 0); // extra
    u16(header, 0); // comment
    u16(header, 0); // disk
    u16(header, 0); // internal attributes
    u32(header, 0o100644 << 16); // external attributes: a regular file, rw-r--r--
    u32(header, entry.offset);
    const record = Buffer.from(header);
    parts.push(record, entry.name);
    directorySize += record.length + entry.name.length;
  }
  /** @type {number[]} */
  const end = [];
  u32(end, 0x06054b50);
  u16(end, 0); // this disk
  u16(end, 0); // disk with the directory
  u16(end, central.length);
  u16(end, central.length);
  u32(end, directorySize);
  u32(end, directoryOffset);
  u16(end, 0); // no comment
  parts.push(Buffer.from(end));
  return Buffer.concat(parts);
}

/**
 * Reads `--dist` / `--out` from the command line.
 *
 * @param {string[]} argv - `process.argv.slice(2)`.
 * @returns {{ dist: string, out: string }} The folders to read and the file to write.
 */
function parseArgs(argv) {
  let dist = DEFAULT_DIST_DIR;
  let out = join(DEFAULT_OUT_DIR, ITCH_ZIP_NAME);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dist' && argv[i + 1] !== undefined) dist = argv[++i];
    else if (argv[i] === '--out' && argv[i + 1] !== undefined) out = argv[++i];
    else {
      console.error(`Unknown argument: ${argv[i]}`);
      process.exit(2);
    }
  }
  return { dist, out };
}

/** Command-line entry point. */
function main() {
  const { dist, out } = parseArgs(process.argv.slice(2));
  const files = collectItchFiles(dist);
  const zip = zipArchive(files);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, zip);
  console.log(
    `wrote ${out} — ${files.length} files, ${(zip.length / 1024).toFixed(1)} KB\n` +
      'Upload it to itch.io as an HTML5 project (see docs/client/web-release.md).',
  );
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) main();

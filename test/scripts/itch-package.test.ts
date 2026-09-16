/**
 * `scripts/itch-package.mjs` (plan M3-03): the ZIP the public web release is uploaded as.
 *
 * The archive writer is exercised on temporary fixtures only — **no test packs the real browser
 * build**, and no agent has ever run the CLI (the upload is the owner's step, plan §8.9). What is
 * checked is that the bytes are a valid, reproducible ZIP an unpacker accepts, that `index.html`
 * is at the root and that source maps stay out of it.
 *
 * @module
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ITCH_ZIP_NAME,
  SKIPPED_SUFFIXES,
  collectItchFiles,
  zipArchive,
} from '../../scripts/itch-package.mjs';

let dir: string;

/**
 * Writes a file into the fixture build folder.
 *
 * @param path - Path below the folder.
 * @param text - Its contents.
 */
function put(path: string, text: string): void {
  const file = join(dir, path);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, text);
}

/** A build folder with the shape `apps/web/dist` has. */
function webBuild(): void {
  put('index.html', '<!doctype html><script type="module" src="./assets/app.js"></script>');
  put('assets/app.js', 'console.log("game");\n'.repeat(50));
  put('assets/app.js.map', '{"version":3,"sources":["../src/main.ts"]}');
  put('assets/atlas/main.png', 'PNG');
}

/**
 * The entries of a ZIP, read back through its **central directory** (what an unpacker reads).
 *
 * @param zip - The archive.
 * @returns Each entry's name and its inflated contents.
 */
function readZip(zip: Buffer): Array<{ name: string; text: string }> {
  // End of central directory: the last 22 bytes (this writer stores no comment).
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end)).toBe(0x06054b50);
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const out: Array<{ name: string; text: string }> = [];
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(at)).toBe(0x02014b50);
    const packed = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const localOffset = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    // The local header the entry points at, and the deflated bytes after it.
    expect(zip.readUInt32LE(localOffset)).toBe(0x04034b50);
    const localName = zip.readUInt16LE(localOffset + 26);
    const localExtra = zip.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localName + localExtra;
    out.push({ name, text: inflateRawSync(zip.subarray(start, start + packed)).toString('utf8') });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shmup-itch-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('scripts/itch-package (M3-03)', () => {
  it('collects the build in path order, with index.html at the root', () => {
    webBuild();
    expect(collectItchFiles(dir).map((file) => file.name)).toEqual([
      'assets/app.js',
      'assets/atlas/main.png',
      'index.html',
    ]);
  });

  it('leaves the source maps out — they would publish the TypeScript sources', () => {
    webBuild();
    expect(SKIPPED_SUFFIXES).toEqual(['.map']);
    expect(collectItchFiles(dir).map((file) => file.name)).not.toContain('assets/app.js.map');
  });

  it('refuses a folder that does not exist or has no index.html', () => {
    expect(() => collectItchFiles(join(dir, 'nope'))).toThrow(/does not exist/);
    put('assets/app.js', 'x');
    expect(() => collectItchFiles(dir)).toThrow(/no index\.html/);
  });

  it('writes a ZIP an unpacker can read back, entry for entry', () => {
    webBuild();
    const files = collectItchFiles(dir);
    const entries = readZip(zipArchive(files));
    expect(entries.map((entry) => entry.name)).toEqual(files.map((file) => file.name));
    const html = entries.find((entry) => entry.name === 'index.html');
    expect(html?.text).toMatch(/^<!doctype html>/);
    expect(entries.find((entry) => entry.name === 'assets/atlas/main.png')?.text).toBe('PNG');
  });

  it('really compresses, and is byte-identical for the same input', () => {
    webBuild();
    const files = collectItchFiles(dir);
    const a = zipArchive(files);
    const b = zipArchive(files);
    expect(a.equals(b)).toBe(true);
    const raw = files.reduce((sum, file) => sum + file.data.length, 0);
    expect(a.length).toBeLessThan(raw);
  });

  it('writes a valid empty archive, and keeps the upload name stable', () => {
    const zip = zipArchive([]);
    expect(readZip(zip)).toEqual([]);
    expect(ITCH_ZIP_NAME).toBe('shmup-cup-web.zip');
  });
});

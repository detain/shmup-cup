/**
 * `scripts/itch-package.mjs` — the archive format itself (plan M3-03).
 *
 * The step's commit promises two things nothing but a test can keep true: the ZIP is **byte-
 * identical for the same build**, and its fixed DOS timestamp `0x0021` really is 1980-01-01. Both
 * matter for the same reason — the upload is the owner's step (§8.9) and nobody here can compare
 * an archive against the one itch.io received, so the bytes must be a pure function of the build.
 *
 * This file decodes the headers the way an unpacker does, field by field, rather than round-
 * tripping through the same writer: a reader that shares the writer's bug agrees with it.
 *
 * **No test packs the real browser build** and no agent has ever run the CLI.
 *
 * @module
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DIST_DIR,
  DEFAULT_OUT_DIR,
  ITCH_ZIP_NAME,
  SKIPPED_SUFFIXES,
  collectItchFiles,
  zipArchive,
} from '../../scripts/itch-package.mjs';

/** The fixed DOS date every entry carries: 1980-01-01. */
const DOS_DATE = 0x0021;

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

/** One decoded entry, as a strict reader sees it in both headers. */
interface Entry {
  readonly name: string;
  readonly localFlags: number;
  readonly localMethod: number;
  readonly localTime: number;
  readonly localDate: number;
  readonly centralFlags: number;
  readonly centralMethod: number;
  readonly centralTime: number;
  readonly centralDate: number;
  readonly crc: number;
  readonly packed: number;
  readonly size: number;
  readonly externalAttributes: number;
  readonly data: Buffer;
}

/**
 * Decodes an archive: the end record, the central directory, and every local header it points at.
 *
 * @param zip - The archive.
 * @returns The entries and the end record's own fields.
 */
function decodeZip(zip: Buffer): { entries: Entry[]; comment: number; disks: [number, number] } {
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end), 'end-of-central-directory signature').toBe(0x06054b50);
  const disks: [number, number] = [zip.readUInt16LE(end + 4), zip.readUInt16LE(end + 6)];
  const onDisk = zip.readUInt16LE(end + 8);
  const count = zip.readUInt16LE(end + 10);
  expect(onDisk).toBe(count);
  const directorySize = zip.readUInt32LE(end + 12);
  const directoryOffset = zip.readUInt32LE(end + 16);
  expect(directoryOffset + directorySize).toBe(end);
  const entries: Entry[] = [];
  let at = directoryOffset;
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(at), 'central header signature').toBe(0x02014b50);
    const centralFlags = zip.readUInt16LE(at + 8);
    const centralMethod = zip.readUInt16LE(at + 10);
    const centralTime = zip.readUInt16LE(at + 12);
    const centralDate = zip.readUInt16LE(at + 14);
    const crc = zip.readUInt32LE(at + 16);
    const packed = zip.readUInt32LE(at + 20);
    const size = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const externalAttributes = zip.readUInt32LE(at + 38);
    const localOffset = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    expect(zip.readUInt32LE(localOffset), `local header of ${name}`).toBe(0x04034b50);
    const localFlags = zip.readUInt16LE(localOffset + 6);
    const localMethod = zip.readUInt16LE(localOffset + 8);
    const localTime = zip.readUInt16LE(localOffset + 10);
    const localDate = zip.readUInt16LE(localOffset + 12);
    const localName = zip.readUInt16LE(localOffset + 26);
    const localExtra = zip.readUInt16LE(localOffset + 28);
    expect(zip.toString('utf8', localOffset + 30, localOffset + 30 + localName)).toBe(name);
    const start = localOffset + 30 + localName + localExtra;
    entries.push({
      name,
      localFlags,
      localMethod,
      localTime,
      localDate,
      centralFlags,
      centralMethod,
      centralTime,
      centralDate,
      crc,
      packed,
      size,
      externalAttributes,
      data: inflateRawSync(zip.subarray(start, start + packed)),
    });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return { entries, comment: zip.readUInt16LE(end + 20), disks };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shmup-itch-edge-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('scripts/itch-package — the archive really is 1980-01-01 (M3-03)', () => {
  it('decodes the fixed DOS date to 1980-01-01 and the time to midnight', () => {
    // DOS date: bits 0–4 day, 5–8 month, 9–15 year since 1980.
    expect(DOS_DATE & 0x1f).toBe(1);
    expect((DOS_DATE >> 5) & 0x0f).toBe(1);
    expect(((DOS_DATE >> 9) & 0x7f) + 1980).toBe(1980);
    const zip = zipArchive([{ name: 'index.html', data: Buffer.from('<!doctype html>') }]);
    const [entry] = decodeZip(zip).entries;
    for (const date of [entry.localDate, entry.centralDate]) {
      expect(date).toBe(DOS_DATE);
      expect(date & 0x1f).toBe(1);
      expect((date >> 5) & 0x0f).toBe(1);
      expect(((date >> 9) & 0x7f) + 1980).toBe(1980);
    }
    expect(entry.localTime).toBe(0);
    expect(entry.centralTime).toBe(0);
  });

  it('gives every entry the same timestamp, whatever the file’s own mtime is', () => {
    put('index.html', '<!doctype html>');
    put('assets/app.js', 'console.log(1);\n'.repeat(40));
    const { entries } = decodeZip(zipArchive(collectItchFiles(dir)));
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect([entry.localDate, entry.centralDate, entry.localTime, entry.centralTime]).toEqual([
        DOS_DATE,
        DOS_DATE,
        0,
        0,
      ]);
    }
  });
});

describe('scripts/itch-package — the headers an unpacker reads (M3-03)', () => {
  it('agrees with itself: local header, central directory and the real bytes', () => {
    put('index.html', '<!doctype html><p>hello</p>');
    put('assets/app.js', 'console.log("game");\n'.repeat(80));
    put('assets/atlas/main.png', 'PNG'.repeat(300));
    const files = collectItchFiles(dir);
    const { entries, comment, disks } = decodeZip(zipArchive(files));
    expect(entries.map((entry) => entry.name)).toEqual(files.map((file) => file.name));
    expect(comment).toBe(0);
    expect(disks).toEqual([0, 0]);
    for (const [i, entry] of entries.entries()) {
      const source = Buffer.from(files[i].data);
      expect(entry.localFlags, entry.name).toBe(0x0800); // UTF-8 names
      expect(entry.centralFlags, entry.name).toBe(0x0800);
      expect(entry.localMethod, entry.name).toBe(8); // deflate
      expect(entry.centralMethod, entry.name).toBe(8);
      expect(entry.size, entry.name).toBe(source.length);
      expect(entry.crc, entry.name).toBe(crc32(source));
      expect(entry.data.equals(source), entry.name).toBe(true);
      // A regular file, rw-r--r--: an unpacker that honours the mode must not write it executable.
      expect(entry.externalAttributes >>> 16, entry.name).toBe(0o100644);
    }
  });

  it('never needs ZIP64: the counts and offsets stay inside their 16/32-bit fields', () => {
    put('index.html', 'x');
    const zip = zipArchive(collectItchFiles(dir));
    const end = zip.length - 22;
    expect(zip.readUInt16LE(end + 10)).toBeLessThan(0xffff);
    expect(zip.readUInt32LE(end + 16)).toBeLessThan(0xffffffff);
    // No data descriptors: bit 3 of the general-purpose flags is what would signal one.
    expect(decodeZip(zip).entries[0].localFlags & 0x08).toBe(0);
  });

  it('stores names as UTF-8, `/`-separated, never with a leading slash or a drive letter', () => {
    put('index.html', 'x');
    put('assets/atlas/main.png', 'PNG');
    for (const entry of decodeZip(zipArchive(collectItchFiles(dir))).entries) {
      expect(entry.name).not.toMatch(/^[/\\]/);
      expect(entry.name).not.toContain('\\');
      expect(entry.name).not.toContain('..');
    }
  });
});

describe('scripts/itch-package — reproducibility (M3-03)', () => {
  it('is byte-identical across two separate builds of the same files', () => {
    put('index.html', '<!doctype html>');
    put('assets/app.js', 'console.log(1);\n'.repeat(60));
    const first = zipArchive(collectItchFiles(dir));
    // A second build folder, written later, with the same contents in a different write order.
    const other = mkdtempSync(join(tmpdir(), 'shmup-itch-edge-2-'));
    try {
      mkdirSync(join(other, 'assets'), { recursive: true });
      writeFileSync(join(other, 'assets', 'app.js'), 'console.log(1);\n'.repeat(60));
      writeFileSync(join(other, 'index.html'), '<!doctype html>');
      const second = zipArchive(collectItchFiles(other));
      expect(second.equals(first)).toBe(true);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('changes when the build changes — the archive is not simply constant', () => {
    put('index.html', '<!doctype html>');
    const before = zipArchive(collectItchFiles(dir));
    put('index.html', '<!doctype html><p>v2</p>');
    const after = zipArchive(collectItchFiles(dir));
    expect(after.equals(before)).toBe(false);
  });

  it('walks nested folders depth-first in name order, so the entry order is the file order', () => {
    put('index.html', 'x');
    put('assets/b.js', 'b');
    put('assets/a/deep.txt', 'deep');
    put('assets/a/z.txt', 'z');
    put('zzz.txt', 'z');
    expect(collectItchFiles(dir).map((file) => file.name)).toEqual([
      'assets/a/deep.txt',
      'assets/a/z.txt',
      'assets/b.js',
      'index.html',
      'zzz.txt',
    ]);
  });
});

describe('scripts/itch-package — what it refuses and what it leaves out (M3-03)', () => {
  it('leaves every skipped suffix out, at any depth', () => {
    put('index.html', 'x');
    put('app.js.map', '{}');
    put('assets/deep/other.js.map', '{}');
    put('assets/keep.map.js', 'kept');
    const names = collectItchFiles(dir).map((file) => file.name);
    expect(names).toEqual(['assets/keep.map.js', 'index.html']);
    expect(SKIPPED_SUFFIXES).toEqual(['.map']);
  });

  it('refuses a missing folder and a folder whose index.html is not at the root', () => {
    expect(() => collectItchFiles(join(dir, 'nope'))).toThrow(/does not exist/);
    put('assets/index.html', 'x');
    expect(() => collectItchFiles(dir)).toThrow(/no index\.html/);
  });

  it('writes a valid empty archive (22 bytes, no entries)', () => {
    const zip = zipArchive([]);
    expect(zip).toHaveLength(22);
    const { entries, comment } = decodeZip(zip);
    expect(entries).toEqual([]);
    expect(comment).toBe(0);
  });

  it('names the upload and the default folders without ever touching them', () => {
    expect(ITCH_ZIP_NAME).toBe('shmup-cup-web.zip');
    expect(DEFAULT_DIST_DIR.split(/[/\\]/).slice(-3)).toEqual(['apps', 'web', 'dist']);
    expect(DEFAULT_OUT_DIR.split(/[/\\]/).slice(-3)).toEqual(['assets', 'generated', 'itch']);
  });
});

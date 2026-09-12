/**
 * Boundaries of the plan M1-19 budgets in scripts/check-bundle.mjs: an atlas page of exactly
 * 2048 px per edge passes and one pixel more on either edge fails; a `dist/` of exactly 8 MB
 * passes and one byte more fails; only pages directly in `assets/atlas/` count; `pngSize` reads a
 * PNG through a view into a larger buffer and rejects truncated or signature-less bytes.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ATLAS_PAGE_MAX_SIZE,
  DIST_BUDGET,
  checkTizenBundle,
  pngSize,
} from '../../scripts/check-bundle.mjs';

const polyfill = readFileSync(new URL('../../polyfills/global-this.js', import.meta.url), 'utf8');
const GOOD_HTML =
  '<!doctype html><html><head><script defer src="./app.js"></script></head><body></body></html>';
const GOOD_APP = `${polyfill}\n(function () { 'use strict'; })();\n`;

let dir = '';

/**
 * The start of a PNG: signature and IHDR chunk with the given size.
 *
 * @param width - Width in pixels.
 * @param height - Height in pixels.
 * @returns The bytes.
 */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/**
 * Writes a file into the fixture folder.
 *
 * @param name - Relative path.
 * @param contents - File contents.
 */
function put(name: string, contents: string | Uint8Array): void {
  const file = join(dir, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

/**
 * Bytes the fixture folder takes now.
 *
 * @returns The total of every file's size.
 */
function distBytes(): number {
  return checkTizenBundle(dir).files.reduce((sum, file) => sum + statSync(join(dir, file)).size, 0);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shmup-check-budgets-'));
  put('index.html', GOOD_HTML);
  put('app.js', GOOD_APP);
  put('config.xml', '<widget/>');
  put('icon.png', 'png');
  put('assets/atlas/main.png', png(256, 256));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('tizen/scripts/check-bundle budgets — boundaries', () => {
  it('accepts a page of exactly the maximum edge and rejects one pixel more on either edge', () => {
    const max = ATLAS_PAGE_MAX_SIZE;
    put('assets/atlas/main.png', png(max, max));
    expect(checkTizenBundle(dir).problems).toEqual([]);
    put('assets/atlas/wide.png', png(max + 1, 1));
    put('assets/atlas/tall.png', png(1, max + 1));
    expect(checkTizenBundle(dir).problems).toEqual([
      `atlas page assets/atlas/tall.png is 1×${max + 1}, over the ${max}² budget`,
      `atlas page assets/atlas/wide.png is ${max + 1}×1, over the ${max}² budget`,
    ]);
  });

  it('only checks pages directly in assets/atlas/', () => {
    put('assets/atlas/extra/huge.png', png(9999, 9999));
    put('assets/other/huge.png', png(9999, 9999));
    expect(checkTizenBundle(dir).problems).toEqual([]);
  });

  it('accepts a dist/ of exactly the budget and rejects one byte more', () => {
    const filler = DIST_BUDGET - distBytes();
    put('assets/filler.bin', new Uint8Array(filler));
    const at = checkTizenBundle(dir);
    expect(at.distBytes).toBe(DIST_BUDGET);
    expect(at.problems).toEqual([]);
    put('assets/filler.bin', new Uint8Array(filler + 1));
    const over = checkTizenBundle(dir);
    expect(over.distBytes).toBe(DIST_BUDGET + 1);
    expect(over.problems).toEqual([
      `dist/ holds ${((DIST_BUDGET + 1) / 1024).toFixed(1)} KB, over the 8192.0 KB budget`,
    ]);
  });

  it('reports the gzipped size of app.js and 0 without one', () => {
    const result = checkTizenBundle(dir);
    expect(result.gzipBytes).toBeGreaterThan(0);
    expect(result.gzipBytes).toBeLessThan(result.code.length);
    put('app.js', '');
    expect(checkTizenBundle(dir).gzipBytes).toBe(0);
  });
});

describe('tizen/scripts/check-bundle pngSize — edge cases', () => {
  it('reads the size through a view into a larger buffer', () => {
    const big = new Uint8Array(100);
    big.set(png(640, 480), 40);
    expect(pngSize(big.subarray(40))).toEqual({ width: 640, height: 480 });
  });

  it('reads the full 32-bit width and height', () => {
    expect(pngSize(png(0xffffffff, 1))).toEqual({ width: 0xffffffff, height: 1 });
  });

  it('rejects truncated bytes and a broken signature', () => {
    expect(pngSize(png(1, 1).subarray(0, 23))).toBeNull();
    expect(pngSize(new Uint8Array(0))).toBeNull();
    const broken = png(1, 1);
    broken[1] = 0x51;
    expect(pngSize(broken)).toBeNull();
  });
});

#!/usr/bin/env node
/**
 * Documentation screenshot capture (`pnpm docs:screens`).
 *
 * Plays the **real game** in headless Chromium and saves what it draws to `docs/images/screens/`
 * — the title screen, the menus a run passes through, one action shot of every zone, the boss
 * WARNING and a boss fight. Nothing here is a mock-up: the page is the web app's test build
 * (`build:test`, so `window.__shmupDebug` exists), the sim is frozen with the debug tools' frame
 * advance and stepped to an exact tick, and the canvas is screenshotted at ×3 (1152×648). The
 * same tick always draws the same picture, so a re-run only changes a file when the game changed.
 *
 * Prerequisite: `pnpm turbo run build:test --filter=@shmup/web` (the script says so and exits 1
 * when `apps/web/dist/` is missing). Playwright's Chromium must be installed
 * (`pnpm exec playwright install --with-deps chromium`).
 *
 * Usage:
 *   node scripts/doc-screenshots.mjs              capture every shot
 *   node scripts/doc-screenshots.mjs --only zone-d,boss   capture some of them
 *   node scripts/doc-screenshots.mjs --quiet      print nothing on success
 *
 * Exits 1 when the build is missing or a shot could not be reached, 2 on bad arguments.
 *
 * @module
 */
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
/* global window, document, requestAnimationFrame */
// The callbacks handed to `page.evaluate` / `page.waitForFunction` below run inside the browser,
// not in this Node process — hence the browser globals above.
import { chromium } from '@playwright/test';
import { decodePng } from './assets/png.mjs';

/** Repository root (this file lives in `scripts/`). */
const REPO_ROOT = new URL('..', import.meta.url).pathname;

/** The built web app this script serves. */
const WEB_DIST = join(REPO_ROOT, 'apps', 'web', 'dist');

/** Where the screenshots are written. */
export const SCREEN_DIR = join(REPO_ROOT, 'docs', 'images', 'screens');

/** Canvas scale of a capture: the playfield is 384×216, the viewport 1152×648. */
const SCALE = 3;

/** Media types the static server needs. */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ogg': 'audio/ogg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/**
 * One capture: where to go, how far into the menus, and which tick of the game to draw.
 *
 * @typedef {object} Shot
 * @property {string} name - File name below `docs/images/screens/` (without `.png`).
 * @property {string} query - Query string of the page (`''` for the plain title screen).
 * @property {number} confirms - `Enter` presses from the title (1 = the mode select, 5 = in game).
 * @property {number} [tick] - World tick to step to once the game scene is up (needs `confirms` 5).
 * @property {{ key: string, from: number, to: number }[]} [hold] - Keys held between two ticks,
 *   so the ship is somewhere worth photographing.
 * @property {[number, number]} [blink] - Playfield rows holding text that blinks (`PRESS OK`):
 *   several captures are taken and the brightest one — the frame the text is on — is kept.
 * @property {'tally' | 'map'} [clear] - Clear the running zone through the debug tools (a score
 *   and `status = 'stageClear'`, the way the zone-map browser test does) and capture the zone
 *   tally, or the ZONE MAP one confirm later.
 */

/** Ticks a zone is stepped to for its action shot (chosen per zone: guns up, enemies on screen). */
const ZONE_TICKS = {
  'zone-a': 1080,
  'zone-b': 900,
  'zone-c': 900,
  'zone-d': 900,
  'zone-e': 900,
  'zone-f': 900,
  'zone-g': 900,
  'zone-h': 900,
  'zone-i': 900,
};

/** The ship flies to the middle of the playfield before every action shot. */
const FLY_OUT = [{ key: 'ArrowRight', from: 60, to: 130 }];

/**
 * Every shot the docs use.
 *
 * @returns {Shot[]} The shots in capture order.
 */
function shots() {
  /** @type {Shot[]} */
  const list = [
    { name: 'title', query: '', confirms: 0, blink: [130, 150] },
    { name: 'mode-select', query: '', confirms: 1 },
    { name: 'difficulty', query: '', confirms: 2 },
    { name: 'ship-select', query: '', confirms: 3 },
    { name: 'weapon-select', query: '', confirms: 4 },
  ];
  for (const [stage, tick] of Object.entries(ZONE_TICKS)) {
    list.push({
      name: stage,
      query: `?stage=${stage}&loadout=full`,
      confirms: 5,
      tick,
      hold: FLY_OUT,
    });
  }
  list.push(
    { name: 'stage-clear', query: '', confirms: 5, clear: 'tally' },
    { name: 'zone-map', query: '', confirms: 5, clear: 'map' },
    { name: 'warning', query: '?skip=boss', confirms: 5, tick: 260, hold: FLY_OUT },
    { name: 'boss', query: '?skip=boss', confirms: 5, tick: 520, hold: FLY_OUT },
  );
  return list;
}

/**
 * Serves `apps/web/dist` over HTTP (the build loads its atlas with `fetch`, so `file://` would
 * be cross-origin).
 *
 * @returns {Promise<{ url: string, close: () => Promise<void> }>} The base URL and a shutdown.
 */
function serveBuild() {
  const server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0]);
    const file = join(
      WEB_DIST,
      normalize(path === '/' ? '/index.html' : path).replace(/^(\.\.[/\\])+/, ''),
    );
    if (!file.startsWith(WEB_DIST) || !existsSync(file)) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/`,
        close: () => new Promise((done) => server.close(() => done(undefined))),
      });
    });
  });
}

/**
 * Waits for `frames` animation frames in the page.
 *
 * @param {import('@playwright/test').Page} page - The page.
 * @param {number} frames - Frames to wait.
 * @returns {Promise<void>} Resolves after that many frames.
 */
function waitFrames(page, frames) {
  return page.evaluate(
    (count) =>
      new Promise((resolve) => {
        let seen = 0;
        const next = () => {
          seen++;
          if (seen >= count) resolve(undefined);
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    frames,
  );
}

/**
 * Presses a key for three frames and releases it (the menus latch pressed edges).
 *
 * @param {import('@playwright/test').Page} page - The page.
 * @param {string} key - Playwright key name.
 * @returns {Promise<void>} Resolves once the release has been seen.
 */
async function tap(page, key) {
  await page.keyboard.down(key);
  await waitFrames(page, 3);
  await page.keyboard.up(key);
  await waitFrames(page, 6);
}

/**
 * Runs the sim to `tick` under frame advance.
 *
 * @param {import('@playwright/test').Page} page - The page (frozen).
 * @param {number} tick - World tick to reach.
 * @returns {Promise<void>} Resolves once the canvas shows that tick.
 */
async function stepTo(page, tick) {
  await page.evaluate((target) => {
    const api = window.__shmupDebug;
    if (api.worldTick < target) api.game.requestStep(target - api.worldTick);
  }, tick);
  await page.waitForFunction((target) => window.__shmupDebug.worldTick >= target, tick);
  await waitFrames(page, 2);
}

/**
 * Lit pixels of a capture in a band of playfield rows (the blink test).
 *
 * @param {Buffer} png - A canvas capture.
 * @param {[number, number]} rows - First and last playfield row of the band.
 * @returns {number} Pixels brighter than half in that band.
 */
function litPixels(png, rows) {
  const { width, data } = decodePng(new Uint8Array(png));
  let lit = 0;
  for (let y = rows[0] * SCALE; y < rows[1] * SCALE; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] + data[i + 1] + data[i + 2] > 384) lit++;
    }
  }
  return lit;
}

/**
 * Captures one shot.
 *
 * @param {import('@playwright/test').Browser} browser - The browser.
 * @param {string} base - Base URL of the served build.
 * @param {Shot} shot - What to capture.
 * @returns {Promise<Buffer>} The canvas PNG.
 * @throws {Error} When the page never reaches the scene the shot needs.
 */
async function capture(browser, base, shot) {
  const context = await browser.newContext({
    viewport: { width: 384 * SCALE, height: 216 * SCALE },
  });
  const page = await context.newPage();
  try {
    await page.goto(`${base}${shot.query}`);
    const canvas = page.locator('#game');
    await canvas.waitFor({ state: 'visible' });
    await page.waitForFunction(
      () => document.getElementById('game')?.getAttribute('data-shmup-state') === 'running',
      undefined,
      { timeout: 60_000 },
    );
    // Freeze before the first confirm so a game starts at tick 0 and stays there.
    await page.waitForFunction(() => {
      const api = window.__shmupDebug;
      if (api === undefined) return false;
      api.flags.godMode = true;
      return true;
    });
    await waitFrames(page, 10);
    for (let i = 0; i < shot.confirms; i++) await tap(page, 'Enter');
    if (shot.clear !== undefined) {
      await page.waitForFunction(
        () => document.getElementById('game')?.getAttribute('data-shmup-scene') === 'game',
        undefined,
        { timeout: 30_000 },
      );
      await waitFrames(page, 60);
      await page.evaluate(() => {
        const world = window.__shmupDebug.game.world;
        world.scoring.board.scores[0].score = 123_400;
        world.status = 'stageClear';
      });
      await page.waitForFunction(
        () => document.getElementById('game')?.getAttribute('data-shmup-scene') === 'stageClear',
        undefined,
        { timeout: 30_000 },
      );
      await waitFrames(page, 120);
      if (shot.clear === 'map') {
        await tap(page, 'Enter');
        await page.waitForFunction(
          () => document.getElementById('game')?.getAttribute('data-shmup-scene') === 'map',
          undefined,
          { timeout: 30_000 },
        );
        await waitFrames(page, 30);
      }
    } else if (shot.tick !== undefined) {
      await page.waitForFunction(
        () => document.getElementById('game')?.getAttribute('data-shmup-scene') === 'game',
        undefined,
        { timeout: 30_000 },
      );
      await page.evaluate(() => {
        window.__shmupDebug.flags.frameAdvance = true;
      });
      let at = 0;
      for (const hold of shot.hold ?? []) {
        if (hold.from > at) {
          await stepTo(page, hold.from);
          at = hold.from;
        }
        await page.keyboard.down(hold.key);
        await stepTo(page, hold.to);
        await page.keyboard.up(hold.key);
        at = hold.to;
      }
      await stepTo(page, shot.tick);
    } else {
      await waitFrames(page, 20);
    }
    if (shot.blink === undefined) return await canvas.screenshot();
    // The prompt blinks: keep the frame that has it (the most lit pixels in its rows).
    let best = await canvas.screenshot();
    let bestLit = litPixels(best, shot.blink);
    for (let i = 0; i < 12; i++) {
      await waitFrames(page, 5);
      const png = await canvas.screenshot();
      const lit = litPixels(png, shot.blink);
      if (lit > bestLit) {
        best = png;
        bestLit = lit;
      }
    }
    return best;
  } finally {
    await context.close();
  }
}

/**
 * Captures every requested shot.
 *
 * @param {string[]} only - Shot names to capture (empty: all of them).
 * @param {boolean} quiet - Print nothing on success.
 * @returns {Promise<number>} Process exit code.
 */
async function run(only, quiet) {
  if (!existsSync(join(WEB_DIST, 'index.html'))) {
    process.stderr.write(
      'apps/web/dist is missing: run `pnpm turbo run build:test --filter=@shmup/web` first\n',
    );
    return 1;
  }
  const wanted = shots().filter((shot) => only.length === 0 || only.indexOf(shot.name) >= 0);
  if (wanted.length === 0) {
    process.stderr.write(`no such shot: ${only.join(', ')}\n`);
    return 2;
  }
  const server = await serveBuild();
  const browser = await chromium.launch({
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  mkdirSync(SCREEN_DIR, { recursive: true });
  try {
    for (const shot of wanted) {
      const png = await capture(browser, server.url, shot);
      writeFileSync(join(SCREEN_DIR, `${shot.name}.png`), png);
      if (!quiet) process.stdout.write(`docs/images/screens/${shot.name}.png\n`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return 0;
}

/**
 * Command-line entry point.
 *
 * @param {string[]} argv - Arguments after the script path.
 * @returns {Promise<number>} Process exit code.
 */
export async function main(argv) {
  /** @type {string[]} */
  const only = [];
  let quiet = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--quiet') quiet = true;
    else if (argv[i] === '--only') {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) {
        process.stderr.write('--only needs a comma-separated list of shot names\n');
        return 2;
      }
      only.push(...value.split(',').filter((name) => name !== ''));
    } else {
      process.stderr.write(`unknown argument "${argv[i]}"\n`);
      return 2;
    }
  }
  try {
    return await run(only, quiet);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));

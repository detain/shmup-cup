/**
 * Cross-engine determinism (plan M2-18, shmup_feat.md §22 P1): every golden replay
 * (`test/golden/*.replay.json`, recorded in Node's V8) and every attract demo
 * (`content/demos/*.replay.json`) is played in the browser against the web build — its test build
 * opened with `?determinism`, which installs `@shmup/shell`'s determinism check instead of the game
 * (the same bundle of the core and the content; no WebGL, so headless Firefox runs it too) — and
 * the state hashes the page's engine computed must equal the recorded ones: every 600-tick hash, the
 * final hash and the World's status. Playwright runs this spec in the `chromium` project (V8) and
 * the `firefox` project (SpiderMonkey); both matching the file means both match each other and
 * Node, tick for tick.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/** A replay document as the golden and demo files hold it. */
interface ReplayDocument {
  /** Recorded ticks. */
  readonly ticks: number;
  /** Hashes every 600 ticks. */
  readonly hashes: readonly number[];
  /** Hash after the last tick. */
  readonly finalHash: number;
  /** The golden file's expected outcome (demos have none). */
  readonly expected?: { readonly status: string };
}

/** What `window.__shmupDeterminism.play` returns (`@shmup/shell` `DeterminismRun`). */
interface DeterminismRun {
  readonly ok: boolean;
  readonly desyncTick: number;
  readonly ticks: number;
  readonly hashes: readonly number[];
  readonly finalHash: number;
  readonly status: string;
  readonly ms: number;
}

/**
 * The replay files of a folder.
 *
 * @param folder - Repository-relative folder.
 * @returns `{ name, path }` per `*.replay.json`, sorted by name.
 */
function replays(folder: string): { name: string; path: string }[] {
  const dir = fileURLToPath(new URL(`../../${folder}/`, import.meta.url));
  return readdirSync(dir)
    .filter((file) => file.endsWith('.replay.json') && !file.startsWith('example.'))
    .sort()
    .map((file) => ({ name: `${folder}/${file}`, path: dir + file }));
}

/** Every golden replay and every attract demo. */
const FILES = [...replays('test/golden'), ...replays('content/demos')];

/**
 * Opens the determinism page of the web build and waits for the check.
 *
 * @param page - The page.
 * @returns The page's error log.
 */
async function openCheck(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('./?determinism');
  await expect(page.locator('html')).toHaveAttribute('data-shmup-determinism', 'ready');
  return errors;
}

test.describe('cross-engine determinism: golden replays in the browser (M2-18)', () => {
  test('finds the golden replays and the demos', () => {
    expect(replays('test/golden').length).toBeGreaterThanOrEqual(50);
    expect(replays('content/demos')).toHaveLength(9);
  });

  for (const file of FILES) {
    test(`${file.name} reproduces every recorded state hash`, async ({ page, browserName }) => {
      test.setTimeout(180_000);
      const text = readFileSync(file.path, 'utf8');
      const doc = JSON.parse(text) as ReplayDocument;
      const errors = await openCheck(page);
      const run = await page.evaluate((json) => {
        const check = (
          window as unknown as {
            __shmupDeterminism: { play(replay: unknown): DeterminismRun };
          }
        ).__shmupDeterminism;
        return check.play(JSON.parse(json));
      }, text);
      console.info(
        `[determinism] ${browserName} ${file.name}: ${String(run.ticks)} ticks in ${run.ms.toFixed(0)} ms, ${run.ok ? 'in sync' : `desync at tick ${String(run.desyncTick)}`}`,
      );
      expect(run.ticks).toBe(doc.ticks);
      expect(run.hashes).toEqual(doc.hashes);
      expect(run.finalHash).toBe(doc.finalHash);
      expect(run.ok).toBe(true);
      expect(run.desyncTick).toBe(-1);
      if (doc.expected !== undefined) expect(run.status).toBe(doc.expected.status);
      expect(errors).toEqual([]);
    });
  }
});

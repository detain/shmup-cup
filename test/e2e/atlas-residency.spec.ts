/**
 * The atlas in a real browser (plan R1-05): how its manifest is delivered and which pages stay on
 * the GPU.
 *
 * **The manifest.** Since R1-05 `app.js` no longer carries the ~200 KB atlas manifest: the build
 * ships `assets/atlas/main.json` and the shell fetches it with `XMLHttpRequest` (decision D25 —
 * `fetch()` fails on `file://`; XHR answers status 0 there), checks its digest against the one the
 * build recorded, then loads the pages. Checked here:
 *
 * - the web build fetches the manifest once and boots to the title;
 * - a manifest that cannot be fetched ends on the boot error screen (`ATLAS MANIFEST FAILED TO
 *   LOAD`), and a manifest of another build (a stale cache) on `ATLAS DOES NOT MATCH ITS MANIFEST`
 *   — neither loads a page or draws a frame;
 * - the Tizen build boots from `file://` with the manifest outside `app.js` — the XHR path the TVs
 *   take (desktop Chromium with `--allow-file-access-from-files`, as the Tizen runtime serves the
 *   widget's own files; the real set is the owner's check, W3-7).
 *
 * **The residency.** The shipped atlas is split into a `common` page and one page per zone
 * (`pages[].group` in `main.json`); a zone keeps `common` plus its own pages on the GPU, uploaded
 * eagerly at the stage change. The canvas says which (`data-shmup-atlas-pages`), how long the
 * last atlas load took (`data-shmup-atlas-load-ms`) and the same per page
 * (`data-shmup-atlas-page-ms`: fetch / decode / upload — owner decision W3-6). Checked here:
 *
 * - `?stage=zone-b` boots with exactly the `common` and `zone-b` pages resident — fewer than all;
 * - a stage change (`__shmupDebug.atlas.prepare('zone-c')`) swaps zone B's page for zone C's, in
 *   real WebGL, and the game keeps drawing without an error;
 * - a **linked** stage (R5-10.T8): `?stage=escape` — the campaign stage zones H and I both
 *   escape to — boots with exactly the `common`, zone H and zone I pages (fewer than all), and
 *   entering it from zone I uploads zone H's pages only: the escape's pages are a superset, so
 *   nothing unloads and nothing already resident comes back;
 * - the attract demo, which never emits `PrepareStage`, still brings its zone's pages: the shell's
 *   World-change trigger (W3-9), stepped in exact ticks under frame advance;
 * - what the GPU **really** holds, read from WebGL itself (an init script hooks `texImage2D` /
 *   `deleteTexture`): the weapon select's preview uploads zone A's page (its range's terrain) behind
 *   the residency's back, and the game it starts sends that page off the GPU again;
 * - the same GPU view after a lost and restored WebGL context (plan R3-04.M3d): the restore event
 *   clears the tracker's names (the lost context killed them without a `deleteTexture` call) and
 *   the boot's recovery uploads the resident pages again, so the new context holds exactly the
 *   pages the canvas still marks;
 * - the Tizen build from `file://` marks its resident pages (`common` + zone A, its start zone)
 *   and every page's fetch / decode / upload time.
 *
 * Key taps count the game's ticks (`ticks.ts`), never rAF frames: a slow runner draws fewer
 * frames a second and catches up by up to 4 ticks a frame, so a count of frames is a different
 * number of ticks on every machine (C5 review 4). The waits before a GPU or residency check stay
 * frames, because what they wait for happens on a draw, not a tick: Pixi uploads a page when a
 * sprite on it is first drawn, and the residency acts in the frame's event dispatch.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { freezeSim } from './frame-advance.js';
import { BOOT_TIMEOUT_MS, tap } from './ticks.js';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** The Tizen build's script, read from disk. */
const TIZEN_APP = fileURLToPath(new URL('../../apps/tizen/dist/app.js', import.meta.url));

/** The Tizen build's shipped manifest. */
const TIZEN_MANIFEST = fileURLToPath(
  new URL('../../apps/tizen/dist/assets/atlas/main.json', import.meta.url),
);

/** The web build's shipped manifest (what `vite preview` serves). */
const WEB_MANIFEST = fileURLToPath(
  new URL('../../apps/web/dist/assets/atlas/main.json', import.meta.url),
);

/**
 * One page's entry of `data-shmup-atlas-page-ms`: `<file>:<load>/<decode>/<upload>` in ms to 0.1.
 */
const PAGE_MS_ENTRY = /^main(-\d+)?\.png:\d+\.\d\/\d+\.\d\/\d+\.\d$/;

/** Ticks the title waits without input before the attract demo (core `TITLE_ATTRACT_TICKS`). */
const TITLE_ATTRACT_TICKS = 720;

/** What the residency tests read from `window.__shmupDebug`. */
interface DebugWindow {
  __shmupDebug: {
    tick: number;
    game: {
      requestStep(count: number): void;
      scenes: {
        title: { idle: number };
        demo: { demo: { replay: { header: { stageId: string | null } } } | null };
      };
    };
    atlas: {
      resident: readonly boolean[];
      unloads: number;
      uploads: number;
      prepare(stageId: string): number;
    } | null;
  };
}

/**
 * The pages of the `common` group and of one zone in a shipped manifest — what the residency
 * must keep for that zone (the acceptance of R1-05).
 *
 * @param file - The manifest file.
 * @param zone - The zone's group (`zone-b`).
 * @returns The page indices, ascending, and the page count.
 */
function zonePages(
  file: string,
  zone: string,
): { pages: number[]; files: string[]; total: number } {
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
    pages: ReadonlyArray<{ group?: string; file: string }>;
  };
  const pages = manifest.pages.flatMap((page, p) =>
    page.group === 'common' || page.group === zone ? [p] : [],
  );
  return {
    pages,
    files: pages.map((p) => manifest.pages[p].file).sort(),
    total: manifest.pages.length,
  };
}

/**
 * The pages a **linked** stage must keep (R5-10.T8): the `common` group and its linking zones —
 * the escape sequences share their zones' pages instead of needing every page.
 *
 * @param file - The manifest file.
 * @param zones - The linking zones' groups.
 * @returns The page indices, ascending; the file names, sorted; and the page count.
 */
function linkedStagePages(
  file: string,
  zones: string[],
): { pages: number[]; files: string[]; total: number } {
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
    pages: ReadonlyArray<{ group?: string; file: string }>;
  };
  const pages = manifest.pages.flatMap((page, p) =>
    page.group === 'common' || zones.indexOf(page.group ?? '') >= 0 ? [p] : [],
  );
  return {
    pages,
    files: pages.map((p) => manifest.pages[p].file).sort(),
    total: manifest.pages.length,
  };
}

/**
 * Hooks the page's WebGL contexts before anything runs, so `window.__atlasGpu()` tells which
 * atlas page images have a GPU texture right now: a texture is named after the `<img>` uploaded
 * into it (`texImage2D` with an image, on the texture bound to the active unit) and forgotten
 * when `deleteTexture` frees it — what Pixi really did, whatever the residency believes.
 *
 * @param page - The page (before `goto`).
 */
async function trackGpuPages(page: Page): Promise<void> {
  await page.addInitScript(() => {
    /** A WebGL call as the hooks see it. */
    type GlCall = (this: WebGLRenderingContext, ...args: unknown[]) => unknown;
    const names = new Map<WebGLTexture, string>();
    const bound = new Map<unknown, unknown>();
    let unit: unknown = 0;
    /**
     * Wraps one context prototype's texture calls.
     *
     * @param proto - `WebGLRenderingContext.prototype` or the WebGL2 one.
     */
    const wrap = (proto: object | undefined): void => {
      if (proto === undefined) return;
      const calls = proto as Record<string, GlCall>;
      /**
       * Runs `before` ahead of the real call `name`.
       *
       * @param name - The call.
       * @param before - What to note first.
       */
      const hook = (name: string, before: (gl: WebGLRenderingContext, args: unknown[]) => void) => {
        const original = calls[name];
        calls[name] = function (this: WebGLRenderingContext, ...args: unknown[]): unknown {
          before(this, args);
          return original.apply(this, args);
        };
      };
      hook('activeTexture', (_gl, args) => {
        unit = args[0];
      });
      hook('bindTexture', (gl, args) => {
        if (args[0] === gl.TEXTURE_2D) bound.set(unit, args[1]);
      });
      hook('deleteTexture', (_gl, args) => {
        names.delete(args[0] as WebGLTexture);
      });
      hook('texImage2D', (_gl, args) => {
        const source = args[args.length - 1];
        const texture = bound.get(unit);
        if (source instanceof HTMLImageElement && texture instanceof WebGLTexture) {
          names.set(texture, source.src.split('?')[0].split('/').pop() ?? '');
        }
      });
    };
    wrap(window.WebGLRenderingContext?.prototype);
    wrap(window.WebGL2RenderingContext?.prototype);
    // A lost context kills every texture it held **without** a `deleteTexture` call: on the
    // restore event (R3-04.M3d), forget the names — the view must show what the new context
    // holds. The event does not bubble; a capture listener on the document still sees it on its
    // way to the canvas.
    document.addEventListener(
      'webglcontextrestored',
      () => {
        names.clear();
      },
      true,
    );
    (window as unknown as { __atlasGpu: () => string[] }).__atlasGpu = () =>
      [...names.values()].filter((name) => /^main(-\d+)?\.png$/.test(name)).sort();
  });
}

/**
 * The atlas page files on the GPU now (see {@link trackGpuPages}).
 *
 * @param page - The page.
 * @returns File names, sorted.
 */
function gpuPages(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __atlasGpu: () => string[] }).__atlasGpu());
}

/**
 * Waits for `frames` animation frames in the page.
 *
 * @remarks
 * Frames, not ticks: the GPU checks it precedes read what a draw does (Pixi's texture uploads) or
 * what the frame's event dispatch does (the residency's unload).
 *
 * @param page - The page.
 * @param frames - Frames to wait.
 */
function waitFrames(page: Page, frames: number): Promise<void> {
  return page.evaluate(
    (total) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        const next = (): void => {
          seen++;
          if (seen >= total) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    frames,
  );
}

/**
 * Runs exact game ticks under frame advance, then waits two frames.
 *
 * @param page - The page (frozen with `freezeSim`).
 * @param ticks - Ticks to run.
 */
async function runTicks(page: Page, ticks: number): Promise<void> {
  const target = await page.evaluate((count) => {
    const api = (window as unknown as DebugWindow).__shmupDebug;
    const goal = api.tick + count;
    api.game.requestStep(count);
    return goal;
  }, ticks);
  await page.waitForFunction(
    (goal) => (window as unknown as DebugWindow).__shmupDebug.tick >= goal,
    target,
    { timeout: 30_000 },
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/**
 * Loses and restores the canvas's WebGL context through `WEBGL_lose_context` (plan R3-04.M3d —
 * the event pair a driver reset fires), resolving once the restore event has run its listeners:
 * Pixi's rebuild first, then the shell's re-fetch and re-upload of the resident pages, then this.
 * `restoreContext()` only takes effect once the context is actually lost, so it waits for the
 * lost event to have run rather than following `loseContext()` in the same task.
 *
 * @param page - The page, with the game canvas present.
 */
async function loseAndRestore(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const canvas = document.querySelector('#game') as HTMLCanvasElement;
        // The canvas already has its context: `getContext` answers with it for the type made
        // with and `null` for the other (the renderer is WebGL1-first, but do not pin that).
        const gl = canvas.getContext('webgl') ?? canvas.getContext('webgl2');
        const lose = gl?.getExtension('WEBGL_lose_context');
        if (lose === null || lose === undefined) {
          reject(new Error('WEBGL_lose_context is not available'));
          return;
        }
        const watchdog = setTimeout(
          () => reject(new Error('webglcontextrestored never fired')),
          40_000,
        );
        canvas.addEventListener(
          'webglcontextrestored',
          () => {
            clearTimeout(watchdog);
            resolve();
          },
          { once: true },
        );
        canvas.addEventListener(
          'webglcontextlost',
          () => {
            // The loss has landed; a restore asked for now is honoured (in the next task, so
            // every lost-event listener — Pixi's preventDefault included — has run first).
            setTimeout(() => lose.restoreContext(), 0);
          },
          { once: true },
        );
        lose.loseContext();
      }),
  );
}

/** Every URL a page requested, and its console output. */
interface PageLog {
  /** Request URLs, in order. */
  readonly requests: string[];
  /** Console messages (`<type>: <text>`) and uncaught errors. */
  readonly console: string[];
}

/**
 * Records a page's requests and console output.
 *
 * @param page - The page.
 * @returns The live log.
 */
function watch(page: Page): PageLog {
  const log: PageLog = { requests: [], console: [] };
  page.on('request', (request) => log.requests.push(request.url()));
  page.on('console', (message) => log.console.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => log.console.push(`pageerror: ${error.message}`));
  return log;
}

/**
 * Requests whose URL ends with a path.
 *
 * @param log - The page log.
 * @param suffix - The path (`assets/atlas/main.json`).
 * @returns The matching URLs.
 */
function requested(log: PageLog, suffix: string): string[] {
  return log.requests.filter((url) => url.split('?')[0].endsWith(suffix));
}

test.describe('atlas manifest delivery (R1-05)', () => {
  test('the web build fetches assets/atlas/main.json once and boots to the title', async ({
    page,
  }) => {
    const log = watch(page);
    await page.goto('./');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-scene', 'title');
    expect(requested(log, '/assets/atlas/main.json')).toHaveLength(1);
    expect(requested(log, '/assets/atlas/main.png')).toHaveLength(1);
    expect(log.console.filter((line) => line.startsWith('error'))).toEqual([]);
  });

  test('a manifest that cannot be fetched ends on ATLAS MANIFEST FAILED TO LOAD', async ({
    page,
  }) => {
    const log = watch(page);
    await page.route('**/assets/atlas/main.json', (route) => route.abort());
    await page.goto('./');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'error', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await expect.poll(() => log.console.join('\n')).toContain('ATLAS MANIFEST FAILED TO LOAD');
    // Nothing after the manifest ran: no page was requested.
    expect(requested(log, '/assets/atlas/main.png')).toEqual([]);
  });

  test('a manifest of another build ends on ATLAS DOES NOT MATCH ITS MANIFEST', async ({
    page,
  }) => {
    const log = watch(page);
    // The same manifest with one byte more: a stale cached copy from another build.
    await page.route('**/assets/atlas/main.json', async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()} ` });
    });
    await page.goto('./');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'error', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await expect.poll(() => log.console.join('\n')).toContain('ATLAS DOES NOT MATCH ITS MANIFEST');
    expect(requested(log, '/assets/atlas/main.png')).toEqual([]);
  });

  test('the Tizen build boots from file:// with the manifest outside app.js (XHR, status 0)', async ({
    page,
  }) => {
    const log = watch(page);
    // The script carries no frame of the manifest: the boot below must have read main.json.
    const manifest = JSON.parse(readFileSync(TIZEN_MANIFEST, 'utf8')) as {
      frames: Record<string, unknown>;
    };
    const code = readFileSync(TIZEN_APP, 'utf8');
    const frames = Object.keys(manifest.frames);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.filter((name) => code.includes(`"${name}"`))).toEqual([]);
    await page.goto(TIZEN_INDEX);
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    // The manifest, then the page, read from disk (`file://` requests show up like any other).
    expect(requested(log, '/assets/atlas/main.json')).toHaveLength(1);
    expect(requested(log, '/assets/atlas/main.png')).toHaveLength(1);
    expect(log.requests.indexOf(requested(log, '/assets/atlas/main.json')[0])).toBeLessThan(
      log.requests.indexOf(requested(log, '/assets/atlas/main.png')[0]),
    );
    expect(log.console.filter((line) => line.startsWith('error'))).toEqual([]);
  });
});

test.describe('atlas residency (R1-05)', () => {
  test('?stage=zone-b keeps common + zone B on the GPU; a stage change swaps in zone C', async ({
    page,
  }) => {
    const log = watch(page);
    await page.goto('./?stage=zone-b');
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    const zoneB = zonePages(WEB_MANIFEST, 'zone-b');
    expect(zoneB.pages.length).toBeGreaterThan(0);
    expect(zoneB.pages.length).toBeLessThan(zoneB.total);
    await expect(canvas).toHaveAttribute('data-shmup-atlas-pages', zoneB.pages.join(','));
    expect(Number(await canvas.getAttribute('data-shmup-atlas-load-ms'))).toBeGreaterThanOrEqual(0);
    // A stage change, in real WebGL: zone B's own pages leave, zone C's go up. Under the lazy
    // default (R3-04.M3e) the swap streams: the detach runs synchronously inside prepare, the
    // fetch / attach / upload of zone C's pages follow over the next frames, and the counters
    // are reported with them — so the marks and the residency view are waited for, not read
    // from the call's return.
    const swapped = await page.evaluate(() => {
      const atlas = (window as unknown as DebugWindow).__shmupDebug.atlas;
      if (atlas === null) return false;
      atlas.prepare('zone-c');
      return true;
    });
    const zoneC = zonePages(WEB_MANIFEST, 'zone-c');
    expect(swapped).toBe(true);
    await expect(canvas).toHaveAttribute('data-shmup-atlas-pages', zoneC.pages.join(','));
    const residencyView = await page.evaluate(() => {
      const atlas = (window as unknown as DebugWindow).__shmupDebug.atlas;
      return { unloads: atlas?.unloads ?? 0, resident: [...(atlas?.resident ?? [])] };
    });
    expect(residencyView.unloads).toBeGreaterThan(0);
    expect(residencyView.resident.flatMap((on, p) => (on ? [p] : []))).toEqual(zoneC.pages);
    // Per page (W3-6): the change uploaded zone C's own pages. Eager had fetched and decoded
    // them at boot (the /0.0/0.0/ rows); lazy fetched and decoded them right now — the row
    // still names exactly the pages zone C owns and nothing else.
    const changed = (await canvas.getAttribute('data-shmup-atlas-page-ms')) ?? '';
    const ownC = zoneC.files.filter((file) => zoneB.files.indexOf(file) < 0);
    expect(changed.split(';').map((entry) => entry.split(':')[0])).toEqual(ownC);
    for (const entry of changed.split(';')) {
      expect(entry).toMatch(PAGE_MS_ENTRY);
    }
    // The game keeps drawing (ten frames, not ticks: the draws are what is checked).
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          let frames = 0;
          const next = (): void => {
            frames++;
            if (frames >= 10) resolve();
            else requestAnimationFrame(next);
          };
          requestAnimationFrame(next);
        }),
    );
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
    expect(
      log.console.filter((line) => line.startsWith('error') || line.startsWith('pageerror')),
    ).toEqual([]);
  });

  test('the escape boots with the common pages and the two final zones’ — not every page (R5-10.T8)', async ({
    page,
  }) => {
    const log = watch(page);
    await page.goto('./?stage=escape');
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await freezeSim(page); // the stage ends quickly; the marks must not move under the check
    const want = linkedStagePages(WEB_MANIFEST, ['zone-h', 'zone-i']);
    expect(want.pages.length).toBeGreaterThan(0);
    expect(want.pages.length).toBeLessThan(want.total);
    await expect(canvas).toHaveAttribute('data-shmup-atlas-pages', want.pages.join(','));
    expect(
      log.console.filter((line) => line.startsWith('error') || line.startsWith('pageerror')),
    ).toEqual([]);
  });

  test('entering the escape from zone I uploads only zone H’s pages (R5-10.T8)', async ({
    page,
  }) => {
    const log = watch(page);
    await page.goto('./?stage=zone-i');
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await freezeSim(page);
    const zoneI = zonePages(WEB_MANIFEST, 'zone-i');
    await expect(canvas).toHaveAttribute('data-shmup-atlas-pages', zoneI.pages.join(','));
    const want = linkedStagePages(WEB_MANIFEST, ['zone-h', 'zone-i']);
    const swapped = await page.evaluate(() => {
      const atlas = (window as unknown as DebugWindow).__shmupDebug.atlas;
      if (atlas === null) return false;
      atlas.prepare('escape');
      return true;
    });
    expect(swapped).toBe(true);
    // The escape needs a superset of what zone I keeps: nothing leaves, only zone H's pages
    // come up — no re-upload of what is already resident (the acceptance of the step).
    await expect(canvas).toHaveAttribute('data-shmup-atlas-pages', want.pages.join(','));
    const residencyView = await page.evaluate(() => {
      const atlas = (window as unknown as DebugWindow).__shmupDebug.atlas;
      return {
        unloads: atlas?.unloads ?? -1,
        uploads: atlas?.uploads ?? -1,
        resident: [...(atlas?.resident ?? [])],
      };
    });
    expect(residencyView.unloads).toBe(0);
    expect(residencyView.resident.flatMap((on, p) => (on ? [p] : []))).toEqual(want.pages);
    const ownH = want.files.filter((file) => zoneI.files.indexOf(file) < 0);
    expect(ownH.length).toBeGreaterThan(0);
    // The per-page row of the change: onChange writes it with the resident mark (one prepare
    // that moved pages), so once the marks read `want`, the row names exactly the pages zone H
    // owns — the global pages and zone I's are already resident and upload nothing.
    const changed = (await canvas.getAttribute('data-shmup-atlas-page-ms')) ?? '';
    expect(changed.split(';').map((entry) => entry.split(':')[0])).toEqual(ownH);
    for (const entry of changed.split(';')) {
      expect(entry).toMatch(PAGE_MS_ENTRY);
    }
    expect(
      log.console.filter((line) => line.startsWith('error') || line.startsWith('pageerror')),
    ).toEqual([]);
  });

  test('the attract demo brings its zone’s pages, though it never emits PrepareStage (W3-9)', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const log = watch(page);
    // Boot on zone C, so the first demo (another zone) has to swap pages.
    await page.goto('./?stage=zone-c');
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await expect(canvas).toHaveAttribute(
      'data-shmup-atlas-pages',
      zonePages(WEB_MANIFEST, 'zone-c').pages.join(','),
    );
    await freezeSim(page);
    const idle = await page.evaluate(
      () => (window as unknown as DebugWindow).__shmupDebug.game.scenes.title.idle,
    );
    await runTicks(page, TITLE_ATTRACT_TICKS - idle);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'demo');
    await runTicks(page, 2);
    const stage = await page.evaluate(
      () =>
        (window as unknown as DebugWindow).__shmupDebug.game.scenes.demo.demo?.replay.header
          .stageId ?? null,
    );
    expect(stage).not.toBeNull();
    expect(stage).not.toBe('zone-c');
    await expect(canvas).toHaveAttribute(
      'data-shmup-atlas-pages',
      zonePages(WEB_MANIFEST, stage ?? '').pages.join(','),
    );
    const unloads = await page.evaluate(
      () => (window as unknown as DebugWindow).__shmupDebug.atlas?.unloads ?? 0,
    );
    expect(unloads).toBeGreaterThan(0);
    expect(
      log.console.filter((line) => line.startsWith('error') || line.startsWith('pageerror')),
    ).toEqual([]);
  });

  test('the weapon select’s preview page leaves the GPU when the game starts (WebGL’s view)', async ({
    page,
  }) => {
    const log = watch(page);
    await trackGpuPages(page);
    await page.goto('./?stage=zone-c');
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await waitFrames(page, 10);
    const zoneC = zonePages(WEB_MANIFEST, 'zone-c');
    expect(await gpuPages(page)).toEqual(zoneC.files);
    // The weapon select: its preview flies the dev weapon-range, whose terrain-a tiles are on
    // zone A's page — Pixi uploads it on the preview's first draw, unknown to the residency.
    await tap(page, 'Enter'); // PRESS OK
    await tap(page, 'Enter'); // START
    await tap(page, 'Enter'); // NORMAL
    await tap(page, 'Enter'); // KESTREL
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
    await waitFrames(page, 10);
    const zoneAOwn = zonePages(WEB_MANIFEST, 'zone-a').files.filter(
      (file) => zoneC.files.indexOf(file) < 0,
    );
    expect(zoneAOwn.length).toBeGreaterThan(0);
    // Lazy (R3-04.M3e): the preview World's stage streams its page in — a fetch rides along,
    // so the page appears a few frames after the scene does. Poll the GPU view, not a frame count.
    await expect
      .poll(() => gpuPages(page), { timeout: 30_000 })
      .toEqual([...zoneC.files, ...zoneAOwn].sort());
    await expect(canvas).toHaveAttribute('data-shmup-atlas-pages', zoneC.pages.join(','));
    // START: the game on zone C. Its new World prepares zone C again, which unloads every page
    // zone C does not need — the preview's included —, so the GPU holds exactly common + zone C.
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    await waitFrames(page, 10);
    await expect.poll(() => gpuPages(page), { timeout: 30_000 }).toEqual(zoneC.files);
    await expect(canvas).toHaveAttribute('data-shmup-atlas-pages', zoneC.pages.join(','));
    expect(
      log.console.filter((line) => line.startsWith('error') || line.startsWith('pageerror')),
    ).toEqual([]);
  });

  test('a restored WebGL context finds the resident pages on the GPU again (R3-04.M3d)', async ({
    page,
  }) => {
    const log = watch(page);
    await trackGpuPages(page);
    await page.goto('./?stage=zone-c');
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await waitFrames(page, 10);
    const zoneC = zonePages(WEB_MANIFEST, 'zone-c');
    expect(await gpuPages(page)).toEqual(zoneC.files);
    await loseAndRestore(page);
    // The restore cleared the tracker with the dead context; the boot's recovery re-fetches and
    // re-uploads the resident pages (fetches are awaited, so this settles over a few frames).
    await expect.poll(() => gpuPages(page), { timeout: 30_000 }).toEqual(zoneC.files);
    await waitFrames(page, 10);
    // The canvas's marks never moved, and exactly the resident pages came back — and the
    // tell is WHERE they came back: the title scene draws no zone C sprite, so nothing on the
    // draw path could have re-uploaded page `main-3`; only the boot's recovery re-fetches and
    // re-uploads the resident pages, so its appearance on the GPU view proves the recovery
    // ran. (Counting the re-fetches as network requests would not: the images ride the
    // browser's memory cache, which never reaches the request layer the test can see.)
    await expect(canvas).toHaveAttribute('data-shmup-atlas-pages', zoneC.pages.join(','));
    expect(
      log.console.filter((line) => line.startsWith('error') || line.startsWith('pageerror')),
    ).toEqual([]);
  });

  test('the Tizen build from file:// marks its resident pages: common + zone A', async ({
    page,
  }) => {
    await page.goto(TIZEN_INDEX);
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    const zoneA = zonePages(TIZEN_MANIFEST, 'zone-a');
    expect(zoneA.pages.length).toBeLessThan(zoneA.total);
    await expect(canvas).toHaveAttribute('data-shmup-atlas-pages', zoneA.pages.join(','));
    expect(Number(await canvas.getAttribute('data-shmup-atlas-load-ms'))).toBeGreaterThanOrEqual(0);
    // Every page's fetch / decode / upload at boot (W3-6), after the manifest's fetch, page order.
    const pageMs = (await canvas.getAttribute('data-shmup-atlas-page-ms')) ?? '';
    const entries = pageMs.split(';');
    expect(entries[0]).toMatch(/^manifest:\d+\.\d$/);
    for (const entry of entries.slice(1)) expect(entry).toMatch(PAGE_MS_ENTRY);
    const manifest = JSON.parse(readFileSync(TIZEN_MANIFEST, 'utf8')) as {
      pages: ReadonlyArray<{ file: string }>;
    };
    expect(entries.slice(1).map((entry) => entry.split(':')[0])).toEqual(
      manifest.pages.map((p) => p.file),
    );
    // The test build's console view of the same (`__shmupDebug.atlas.timing` / `.pageMs`).
    const debug = await page.evaluate(() => {
      const api = (
        window as unknown as {
          __shmupDebug: {
            atlas: {
              timing: { manifest: string; pages: Array<{ file: string }> } | null;
              pageMs: string;
            } | null;
          };
        }
      ).__shmupDebug.atlas;
      return api === null ? null : { timing: api.timing, pageMs: api.pageMs };
    });
    expect(debug?.timing?.manifest).toBe('fetched');
    expect(debug?.timing?.pages.map((p) => p.file)).toEqual(manifest.pages.map((p) => p.file));
    expect(debug?.pageMs).toBe(pageMs);
  });
});

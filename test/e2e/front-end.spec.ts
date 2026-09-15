/**
 * Browser tests of the M2-15 mode select's screens in headless Chromium, on the test builds (their
 * `window.__shmupDebug` hands the spec the game — to end a game without playing it out):
 *
 * - web build, **practice → name entry → table**: PRACTICE on the mode select, zone B at its first
 *   checkpoint with FULL POWER, the difficulty / ship / weapon select, the game on zone B; its game
 *   over (continue declined) opens the name entry, which takes `BB` from the arrow keys and Enter
 *   only, then the practice table with the new row, then the title; the saved practice table
 *   (`localStorage`) holds the row, the one-player table nothing;
 * - web build, **sound test**: the MUSIC row lists the music library, OK plays a track (a new
 *   buffer source starts once the track is rendered), the SFX row plays a sound, Esc closes it;
 * - Tizen build from `file://`, **the remote only**: the name entry after a game over through the
 *   remote's arrow keys and OK (legacy key codes, the Tizen adapter reads `keyCode`);
 * - no console errors (nor atlas warnings) in any.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** The save's `localStorage` key (the web adapter prefixes `core/save`'s `save.v1`). */
const SAVE_KEY = 'shmup-cup:save.v1';

/** Remote key codes (the Tizen adapter's table): the arrows, OK, Back. */
const REMOTE = { left: 37, up: 38, right: 39, down: 40, ok: 13, back: 10009 } as const;

/** A saved hi-score row. */
interface SavedRow {
  readonly name: string;
  readonly score: number;
  readonly mode: string;
  readonly reached: string;
}

/** `window` with the parts of the test build's debug API the spec uses. */
interface DebugWindow {
  readonly __shmupDebug: {
    readonly sceneId: string;
    readonly game: {
      readonly world: {
        status: string;
        readonly config: { readonly loadout: string; readonly coop: boolean };
        readonly stage: { readonly stage: { readonly id: string } } | null;
        readonly scoring: { readonly board: { readonly scores: Array<{ score: number }> } };
      };
      readonly scenes: {
        readonly run: { readonly practice: boolean; readonly checkpoint: number };
        readonly continueScreen: { readonly ticks: number };
        readonly gameOver: { readonly ticks: number };
        readonly nameEntry: { readonly entry: { readonly name: string } };
        readonly hiScores: { readonly key: string; readonly ticks: number };
        readonly soundTest: { readonly music: { readonly labels: readonly string[] } };
        readonly save: { hiScores(key: string): readonly SavedRow[] };
      };
    };
  };
}

/**
 * Collects console errors and atlas warnings.
 *
 * @param page - The page.
 * @returns The log (filled as the page runs).
 */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.text().startsWith('atlas:')) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/**
 * Waits for `frames` animation frames in the page.
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
 * Presses a key for a few frames and lets the game see the release.
 *
 * @param page - The page.
 * @param key - Playwright key name.
 */
async function tap(page: Page, key: string): Promise<void> {
  await page.keyboard.down(key);
  await waitFrames(page, 3);
  await page.keyboard.up(key);
  await waitFrames(page, 6);
}

/**
 * Dispatches a remote key by its legacy key code, down then up.
 *
 * @param page - The page.
 * @param keyCode - The key code.
 */
async function remoteTap(page: Page, keyCode: number): Promise<void> {
  const send = (type: string): Promise<void> =>
    page.evaluate(
      ([eventType, code]) => {
        const event = new KeyboardEvent(eventType, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'keyCode', { get: () => code });
        window.dispatchEvent(event);
      },
      [type, keyCode] as const,
    );
  await send('keydown');
  await waitFrames(page, 3);
  await send('keyup');
  await waitFrames(page, 6);
}

/**
 * Waits until a scene has run more than some ticks (its OK lock is over), whatever the frame rate.
 *
 * @param page - The page.
 * @param scene - The scene's field in the scene flow.
 * @param ticks - Ticks it must have run past.
 */
async function waitSceneTicks(
  page: Page,
  scene: 'continueScreen' | 'gameOver' | 'hiScores',
  ticks: number,
): Promise<void> {
  await page.waitForFunction(
    ([name, min]) => (window as unknown as DebugWindow).__shmupDebug.game.scenes[name].ticks > min,
    [scene, ticks] as const,
  );
}

/**
 * Ends the running game through the debug API with a score (status `gameOver`: the flow opens
 * the continue countdown, or the game-over screen without continues, after its delay).
 *
 * @param page - The page.
 * @param score - Player 1's score.
 */
async function endGame(page: Page, score: number): Promise<void> {
  await page.evaluate((value) => {
    const world = (window as unknown as DebugWindow).__shmupDebug.game.world;
    world.scoring.board.scores[0].score = value;
    world.status = 'gameOver';
  }, score);
}

/**
 * Reads a saved hi-score table from `localStorage`.
 *
 * @param page - The page.
 * @param key - The table's mode key.
 * @returns Its rows (none when the table or the save is missing).
 */
async function savedTable(page: Page, key: string): Promise<readonly SavedRow[]> {
  const saved = await page.evaluate(
    (storageKey) => window.localStorage.getItem(storageKey),
    SAVE_KEY,
  );
  if (saved === null) return [];
  const doc = JSON.parse(saved) as { hiScores?: Record<string, SavedRow[]> };
  return doc.hiScores?.[key] ?? [];
}

test.describe('front end (web build)', () => {
  test('practice select → zone B game → name entry with the arrows → practice table', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await page.goto('./');
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await waitFrames(page, 10);
    await tap(page, 'Enter'); // PRESS OK
    await tap(page, 'ArrowDown');
    await tap(page, 'ArrowDown'); // PRACTICE
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'practice');
    await tap(page, 'ArrowRight'); // ZONE B
    await tap(page, 'ArrowDown');
    await tap(page, 'ArrowRight'); // CHECKPOINT 1
    await tap(page, 'ArrowDown');
    await tap(page, 'ArrowRight'); // FULL POWER
    await tap(page, 'ArrowDown');
    await tap(page, 'Enter'); // START
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
    await tap(page, 'Enter'); // NORMAL
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
    await tap(page, 'Enter'); // KESTREL
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
    await tap(page, 'Enter'); // START
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    const run = await page.evaluate(() => {
      const api = (window as unknown as DebugWindow).__shmupDebug;
      return {
        stage: api.game.world.stage?.stage.id ?? null,
        practice: api.game.scenes.run.practice,
        checkpoint: api.game.scenes.run.checkpoint,
        loadout: api.game.world.config.loadout,
      };
    });
    expect(run.stage).toBe('zone-b');
    expect(run.practice).toBe(true);
    expect(run.checkpoint).toBeGreaterThanOrEqual(0);
    expect(run.loadout).toBe('full');
    await waitFrames(page, 20);
    await endGame(page, 12_340);
    // The continue countdown first (NORMAL has continues): Esc gives up once OK counts.
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'continue');
    await waitSceneTicks(page, 'continueScreen', 40);
    await tap(page, 'Escape');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'gameOver');
    await waitSceneTicks(page, 'gameOver', 40);
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'nameEntry');
    await waitFrames(page, 10);
    // B (Up from A), Right, A then B on the empty second letter, Right, Right (END), OK.
    for (const key of ['ArrowUp', 'ArrowRight', 'ArrowUp', 'ArrowUp', 'ArrowRight', 'ArrowRight']) {
      await tap(page, key);
    }
    const typed = await page.evaluate(
      () => (window as unknown as DebugWindow).__shmupDebug.game.scenes.nameEntry.entry.name,
    );
    expect(typed).toBe('BB');
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'hiScore');
    const key = await page.evaluate(
      () => (window as unknown as DebugWindow).__shmupDebug.game.scenes.hiScores.key,
    );
    expect(key).toBe('meter-normal-practice');
    await waitSceneTicks(page, 'hiScores', 40);
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    const practice = await savedTable(page, 'meter-normal-practice');
    expect(practice[0]).toMatchObject({ name: 'BB', mode: 'practice', reached: 'zone-b' });
    expect(practice[0].score).toBeGreaterThanOrEqual(12_340);
    expect(await savedTable(page, 'meter-normal')).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('sound test: the library`s tracks and the SFX cues play; Esc closes it', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    // Log every buffer source the page starts.
    await page.addInitScript(() => {
      const started: number[] = [];
      (window as unknown as { __started: number[] }).__started = started;
      const proto = BaseAudioContext.prototype;
      const create = Reflect.get(proto, 'createBufferSource');
      proto.createBufferSource = function (this: BaseAudioContext) {
        const source = create.call(this);
        const start = source.start.bind(source);
        source.start = (...args: Parameters<AudioBufferSourceNode['start']>) => {
          started.push(source.buffer?.length ?? 0);
          start(...args);
        };
        return source;
      };
    });
    const errors = watchErrors(page);
    await page.goto('./');
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await waitFrames(page, 10);
    await tap(page, 'Enter'); // PRESS OK (also unlocks audio)
    for (let i = 0; i < 4; i++) await tap(page, 'ArrowDown'); // SOUND TEST
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'soundTest');
    const labels = await page.evaluate(
      () => (window as unknown as DebugWindow).__shmupDebug.game.scenes.soundTest.music.labels,
    );
    expect(labels.length).toBeGreaterThan(20);
    expect(labels).toContain('AZURE VERGE');
    const started = (): Promise<number> =>
      page.evaluate(() => (window as unknown as { __started: number[] }).__started.length);
    // The title theme is playing by now.
    await expect.poll(started, { timeout: 30_000 }).toBeGreaterThan(0);
    const beforeTrack = await started();
    await tap(page, 'ArrowRight');
    await tap(page, 'Enter'); // plays the library's second track (rendered first)
    await expect.poll(started, { timeout: 30_000 }).toBeGreaterThan(beforeTrack);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'soundTest');
    await tap(page, 'ArrowDown'); // SFX
    const beforeSound = await started();
    await tap(page, 'Enter');
    await expect.poll(started, { timeout: 10_000 }).toBeGreaterThan(beforeSound);
    await tap(page, 'Escape');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    expect(errors).toEqual([]);
  });
});

test.describe('front end (Tizen build from disk)', () => {
  test('the remote`s arrows and OK enter a name after a game over', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await page.goto(TIZEN_INDEX);
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await waitFrames(page, 10);
    await remoteTap(page, REMOTE.ok); // PRESS OK
    await remoteTap(page, REMOTE.ok); // 1 PLAYER
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
    await remoteTap(page, REMOTE.ok); // NORMAL
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
    await remoteTap(page, REMOTE.ok); // KESTREL
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
    await remoteTap(page, REMOTE.ok); // START
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    await waitFrames(page, 20);
    await endGame(page, 23_450);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'continue');
    await waitSceneTicks(page, 'continueScreen', 40);
    await remoteTap(page, REMOTE.back); // give up
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'gameOver');
    await waitSceneTicks(page, 'gameOver', 40);
    await remoteTap(page, REMOTE.ok);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'nameEntry');
    await waitFrames(page, 10);
    // Down on A: the space, then `!`; Right; Up (A); Left (back to `!`), Down (`-`); Right, Right,
    // Right: END.
    for (const code of [
      REMOTE.down,
      REMOTE.down,
      REMOTE.right,
      REMOTE.up,
      REMOTE.left,
      REMOTE.down,
      REMOTE.right,
      REMOTE.right,
      REMOTE.right,
    ]) {
      await remoteTap(page, code);
    }
    const typed = await page.evaluate(
      () => (window as unknown as DebugWindow).__shmupDebug.game.scenes.nameEntry.entry.name,
    );
    expect(typed).toBe('-A');
    await remoteTap(page, REMOTE.ok);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'hiScore');
    const rows = await page.evaluate(() =>
      (window as unknown as DebugWindow).__shmupDebug.game.scenes.save
        .hiScores('meter-normal')
        .map((row) => ({ name: row.name, mode: row.mode })),
    );
    expect(rows[0]).toEqual({ name: '-A', mode: '1p' });
    await waitSceneTicks(page, 'hiScores', 40);
    await remoteTap(page, REMOTE.ok);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    expect(errors).toEqual([]);
  });
});

/**
 * Browser tests of the Options screen's GAME and CONTROLS pages (plan M2-16 acceptance "v1 → v2
 * migration", "every option reaches its consumer", "capture / conflict / reset") in headless
 * Chromium: a version-1 save left by an older build boots, the GAME page sets LIVES 5 and the
 * one-button preset, the save is rewritten as version 2 (the old options kept, the co-op row moved
 * into its own table) and the next game starts with 5 ships, Auto Power-Up, the casual penalty and
 * autofire always on; on the rebind screen Escape cancels a capture (nothing stored) and RESET
 * restores a rebound key, while SOCD / DEBOUNCE reach the save; the Tizen build from disk sets
 * LIVES with the remote's keys and keeps it across a relaunch. The flow is read through the test
 * build's debug API (`window.__shmupDebug`).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/** The save's `localStorage` key. */
const SAVE_KEY = 'shmup-cup:save.v1';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** A save written by an M2-15 build (version 1): options of its day and a co-op row in a 1P table. */
const V1_SAVE = JSON.stringify({
  version: 1,
  options: {
    audio: { master: 7, music: 4, sfx: 9 },
    input: { profileId: 'keyboard-default' },
    display: { bulletPalette: 'deuteranopia', scaleMode: 'fit', screenShake: false },
  },
  hiScores: {
    'meter-normal': [
      { name: 'ACE', score: 91000, reached: 'zone-c', mode: '1p', difficulty: 'normal' },
      { name: 'DUO', score: 64000, reached: 'zone-b', mode: '2p', difficulty: 'normal' },
    ],
  },
  stats: { gamesStarted: 12, gameOvers: 9, stagesCleared: 17 },
});

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
 * Presses a key for a few frames, then lets the game see the release.
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
 * Taps a TV remote key by key code (no `code`, the way the TV sends them).
 *
 * @param page - The page.
 * @param keyCode - The legacy key code.
 */
async function remoteTap(page: Page, keyCode: number): Promise<void> {
  for (const type of ['keydown', 'keyup'] as const) {
    await page.evaluate(
      ([eventType, code]) => {
        const event = new KeyboardEvent(eventType, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'keyCode', { get: () => code });
        window.dispatchEvent(event);
      },
      [type, keyCode] as const,
    );
    await waitFrames(page, type === 'keydown' ? 3 : 6);
  }
}

/** The stored save document (the fields the tests read). */
interface StoredSave {
  readonly version: number;
  readonly options: {
    readonly audio: Record<string, number>;
    readonly input: Record<string, unknown>;
    readonly game: Record<string, unknown>;
    readonly display: Record<string, unknown>;
  };
  readonly hiScores: Record<string, Array<{ name: string }>>;
  readonly stats: Record<string, number>;
}

/**
 * The stored save.
 *
 * @param page - The page.
 * @returns The parsed document, or `null` when nothing is stored.
 */
async function storedSave(page: Page): Promise<StoredSave | null> {
  const text = await page.evaluate((key) => window.localStorage.getItem(key), SAVE_KEY);
  return text === null ? null : (JSON.parse(text) as StoredSave);
}

/** What the tests read of the running game and the rebind screen. */
interface View {
  readonly sceneId: string;
  readonly config: {
    readonly startingLives: number;
    readonly autoPowerUp: boolean;
    readonly deathPenalty: string;
    readonly autofire: boolean;
    readonly autofireMode: string;
  };
  readonly lives: number;
  readonly capturing: boolean;
  readonly message: string;
}

/**
 * Reads the game through the debug API.
 *
 * @param page - The page.
 * @returns The view.
 */
function view(page: Page): Promise<View> {
  return page.evaluate(() => {
    const api = (
      window as unknown as {
        __shmupDebug: {
          sceneId: string;
          game: {
            world: { config: View['config']; players: Array<{ lives: number }> };
            scenes: { rebind: { panel: { capturing: boolean; message: string } } };
          };
        };
      }
    ).__shmupDebug;
    const config = api.game.world.config;
    return {
      sceneId: api.sceneId,
      config: {
        startingLives: config.startingLives,
        autoPowerUp: config.autoPowerUp,
        deathPenalty: config.deathPenalty,
        autofire: config.autofire,
        autofireMode: config.autofireMode,
      },
      lives: api.game.world.players[0].lives,
      capturing: api.game.scenes.rebind.panel.capturing,
      message: api.game.scenes.rebind.panel.message,
    };
  });
}

/**
 * Collects console errors and page errors.
 *
 * @param page - The page.
 * @returns The (live) error log.
 */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/**
 * From the title: OPTIONS → one of its pages.
 *
 * @param page - The page.
 * @param rows - Rows down from MASTER to the page (CONTROLS 3, DISPLAY 4, GAME 5).
 * @param scene - The page's scene id.
 * @param press - How a key is pressed (the keyboard, or the remote's key codes).
 */
async function openPage(
  page: Page,
  rows: number,
  scene: string,
  press: (key: 'Enter' | 'ArrowDown') => Promise<void>,
): Promise<void> {
  const canvas = page.locator('#game');
  await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
  await waitFrames(page, 10);
  await press('Enter'); // PRESS OK → the menu
  for (let i = 0; i < 3; i++) await press('ArrowDown'); // 2 PLAYERS, PRACTICE, OPTIONS
  await press('Enter');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'options');
  await waitFrames(page, 4);
  for (let i = 0; i < rows; i++) await press('ArrowDown');
  await press('Enter');
  await expect(canvas).toHaveAttribute('data-shmup-scene', scene);
  await waitFrames(page, 4);
}

/**
 * From a fresh title: 1 PLAYER → NORMAL → KESTREL → START, the game running.
 *
 * @param page - The page.
 * @param press - How a key is pressed.
 */
async function startGame(page: Page, press: (key: 'Enter') => Promise<void>): Promise<void> {
  const canvas = page.locator('#game');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
  await waitFrames(page, 10);
  await press('Enter'); // PRESS OK
  await press('Enter'); // 1 PLAYER
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
  await press('Enter'); // NORMAL
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
  await press('Enter'); // KESTREL
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
  await press('Enter'); // START
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
}

test.describe('game options (web build)', () => {
  test('a version-1 save boots; LIVES 5 and ONE BUTTON reach the save (v2) and the next game', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await page.goto('./');
    await page.evaluate(
      ([key, text]) => {
        window.localStorage.clear();
        window.localStorage.setItem(key, text);
      },
      [SAVE_KEY, V1_SAVE] as const,
    );
    await page.reload();
    const canvas = page.locator('#game');
    const press = (key: string): Promise<void> => tap(page, key);
    await openPage(page, 5, 'gameOptions', press);
    await tap(page, 'ArrowDown'); // DIFFICULTY → LIVES
    for (let i = 0; i < 5; i++) await tap(page, 'ArrowRight'); // PRESET → 1 … 5
    for (let i = 0; i < 4; i++) await tap(page, 'ArrowDown'); // PENALTY … ONE BUTTON
    await tap(page, 'Enter'); // ONE BUTTON on
    await tap(page, 'Escape'); // Back: the page stores, writes the save and closes
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'options');
    await expect.poll(async () => (await storedSave(page))?.version).toBe(2);
    const save = await storedSave(page);
    expect(save?.options.game).toEqual({
      difficulty: null,
      lives: 5,
      deathPenalty: null,
      autoPowerUp: null,
      pickupMagnet: null,
      oneButton: true,
    });
    // The version-1 options and stats carried over; the new controls start unset.
    expect(save?.options.audio).toEqual({ master: 7, music: 4, sfx: 9 });
    expect(save?.options.input).toMatchObject({
      profileId: 'keyboard-default',
      autofire: null,
      socd: null,
      bindings: {},
    });
    expect(save?.options.display).toMatchObject({
      bulletPalette: 'deuteranopia',
      scaleMode: 'fit',
    });
    expect(save?.stats).toEqual({ gamesStarted: 12, gameOvers: 9, stagesCleared: 17 });
    // The co-op row moved into its own table.
    expect(save?.hiScores['meter-normal']?.map((r) => r.name)).toEqual(['ACE']);
    expect(save?.hiScores['meter-normal-2p']?.map((r) => r.name)).toEqual(['DUO']);

    // The next game gets the options (after a reload too: read from the save).
    await page.reload();
    await startGame(page, press);
    const game = await view(page);
    expect(game.config).toEqual({
      startingLives: 5,
      autoPowerUp: true,
      deathPenalty: 'casual',
      autofire: true,
      autofireMode: 'always',
    });
    expect(game.lives).toBe(5);
    expect(errors).toEqual([]);
  });

  test('Escape cancels a capture, RESET restores a key, SOCD and DEBOUNCE are saved', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await page.goto('./');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    const canvas = page.locator('#game');
    await openPage(page, 3, 'controls', (key) => tap(page, key));
    for (let i = 0; i < 3; i++) await tap(page, 'ArrowDown'); // AUTOFIRE, RATE, SOCD
    await tap(page, 'ArrowRight'); // SOCD: NEUTRAL
    await tap(page, 'ArrowRight'); // LAST WINS
    await tap(page, 'ArrowDown'); // DEBOUNCE
    for (let i = 0; i < 3; i++) await tap(page, 'ArrowRight'); // AUTO → 0 → 1 → 2 TICKS
    await tap(page, 'ArrowDown'); // REBIND KEYS
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'rebind');
    await waitFrames(page, 4);
    for (let i = 0; i < 6; i++) await tap(page, 'ArrowDown'); // MODE, UP … SHOT → SUB
    await tap(page, 'Enter');
    await expect.poll(async () => (await view(page)).capturing).toBe(true);
    // Escape cancels the capture (it never becomes a key) — the screen stays open.
    await tap(page, 'Escape');
    await expect.poll(async () => (await view(page)).message).toBe('CANCELLED');
    expect((await view(page)).capturing).toBe(false);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'rebind');
    // A real rebinding: SUB → K, then RESET brings X back.
    await waitFrames(page, 4);
    await tap(page, 'Enter');
    await expect.poll(async () => (await view(page)).capturing).toBe(true);
    await tap(page, 'KeyK');
    await expect.poll(async () => (await view(page)).message).toBe('SUB REBOUND');
    await waitFrames(page, 6);
    for (let i = 0; i < 5; i++) await tap(page, 'ArrowDown'); // POWER-UP … PAUSE, RESET
    await tap(page, 'Enter');
    await expect.poll(async () => (await view(page)).message).toBe('RESET TO DEFAULTS');
    await tap(page, 'Escape'); // Back: DONE
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'controls');
    await tap(page, 'Escape'); // Back: the page closes
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'options');
    await expect.poll(async () => (await storedSave(page))?.options.input.socd).toBe('lastWins');
    expect((await storedSave(page))?.options.input).toMatchObject({
      socd: 'lastWins',
      releaseDebounce: 2,
      bindings: {},
    });
    expect(errors).toEqual([]);
  });
});

test.describe('game options (Tizen build from file://)', () => {
  test('remote only: LIVES 1 is saved on Back and the next game starts with one ship', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await page.goto(TIZEN_INDEX);
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    const codes: Record<string, number> = { Enter: 13, ArrowDown: 40, ArrowRight: 39 };
    const press = (key: string): Promise<void> => remoteTap(page, codes[key] ?? 0);
    await openPage(page, 5, 'gameOptions', press);
    await remoteTap(page, 40); // LIVES
    await remoteTap(page, 39); // PRESET → 1
    await remoteTap(page, 10009); // Back: store and close
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-scene', 'options');
    await expect.poll(async () => (await storedSave(page))?.options.game.lives).toBe(1);

    await page.reload();
    await startGame(page, press);
    const game = await view(page);
    expect([game.config.startingLives, game.lives]).toEqual([1, 1]);
    // The TV forces autofire always on.
    expect(game.config.autofireMode).toBe('always');
    expect(errors).toEqual([]);
  });
});

/**
 * Browser tests of the weapon select (plan M2-03) in headless Chromium, on the test builds (their
 * `window.__shmupDebug` hands the spec the game):
 *
 * - web build: OK on the difficulty menu opens the ship select (M2-05) and OK on the KESTREL the
 *   weapon select — its panel on the left, the live
 *   preview's KESTREL flying on the right; ArrowDown + ArrowRight choose TYPE B, whose Ripple rings
 *   the preview then draws; ArrowUp + Enter on START starts the game with Type B;
 * - Tizen build from `file://`: the remote's Back (10009) returns to the ship select, OK (13)
 *   opens the weapon select again and starts the game on its first press; the remote's arrows
 *   (37–40) alone choose EDIT and a weapon for each slot (the preview follows), the ROTATE Option
 *   type and the SHIELD `?` (M2-04), NORMAL on `!` and an Auto Power-Up order (the ORDER editor overlay, closed with Back), and START plays them;
 * - no console errors in either.
 *
 * Screenshots are ×3 (viewport 1152×648): frame pixel x is screenshot pixel 3x + 1.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** KESTREL hull colour (`ships/kestrel` palette `h`, #c8d0e0) — only the ship uses it. */
const KESTREL_HULL = [0xc8, 0xd0, 0xe0] as const;

/** The Ripple ring's middle colour (`shots/ripple`, #58d8f8). */
const RIPPLE_CYAN = [0x58, 0xd8, 0xf8] as const;

/** What the spec reads through `window.__shmupDebug`. */
interface SelectView {
  readonly sceneId: string;
  readonly preview: string | null;
  readonly weaponPreset: string;
  readonly laser: string | null;
}

/**
 * Reads the scene id, the preview's Laser-slot weapon and the game World's preset.
 *
 * @param page - The page.
 * @returns The view.
 */
function view(page: Page): Promise<SelectView> {
  return page.evaluate(() => {
    const api = (
      window as unknown as {
        __shmupDebug: {
          sceneId: string;
          game: {
            world: {
              config: { weaponPreset: string };
              weapons: { roleWeapons: Array<{ id: string } | null> };
            };
            scenes: {
              weaponSelect: {
                preview: { weapons: { roleWeapons: Array<{ id: string } | null> } } | null;
              };
            };
          };
        };
      }
    ).__shmupDebug;
    const preview = api.game.scenes.weaponSelect.preview;
    return {
      sceneId: api.sceneId,
      preview: preview === null ? null : (preview.weapons.roleWeapons[2]?.id ?? null),
      weaponPreset: api.game.world.config.weaponPreset,
      laser: api.game.world.weapons.roleWeapons[2]?.id ?? null,
    };
  });
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
 * Dispatches a remote key the desktop keyboard does not have (Back = 10009), down then up.
 *
 * @param page - The page.
 * @param keyCode - The legacy key code.
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
 * Counts the canvas pixels within 2 of a colour, and how many of them lie right of a frame x.
 *
 * @param page - The page.
 * @param rgb - The colour.
 * @param fromX - Frame x the second count starts at.
 * @returns `[all, right of fromX]`.
 */
async function countColour(
  page: Page,
  rgb: readonly [number, number, number],
  fromX = 0,
): Promise<[number, number]> {
  const png = await page.locator('#game').screenshot();
  const { width, data } = decodePng(new Uint8Array(png));
  let all = 0;
  let right = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (
      Math.abs(data[i] - rgb[0]) <= 2 &&
      Math.abs(data[i + 1] - rgb[1]) <= 2 &&
      Math.abs(data[i + 2] - rgb[2]) <= 2
    ) {
      all++;
      if ((i / 4) % width >= fromX * 3) right++;
    }
  }
  return [all, right];
}

/**
 * Opens a build and goes through the title, the difficulty menu (NORMAL) and the ship select
 * (KESTREL — M2-05) to the weapon select.
 *
 * @param page - The page.
 * @param url - The build's URL.
 * @returns The page's error log.
 */
async function openSelect(page: Page, url: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  const canvas = page.locator('#game');
  await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
  await waitFrames(page, 10);
  await tap(page, 'Enter'); // PRESS OK
  await tap(page, 'Enter'); // START
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
  await tap(page, 'Enter'); // NORMAL
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
  await tap(page, 'Enter'); // KESTREL in the ship select (M2-05)
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
  return errors;
}

test.describe('weapon select (web build)', () => {
  test('the preview flies the chosen type; START plays it', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await openSelect(page, './');
    const canvas = page.locator('#game');
    await waitFrames(page, 20);
    // The preview's KESTREL flies right of the panel (held at x 232).
    const [hull, hullRight] = await countColour(page, KESTREL_HULL, 190);
    expect(hull).toBeGreaterThan(0);
    expect(hullRight).toBe(hull);
    expect((await view(page)).preview).toBe('laser.pierce');
    await tap(page, 'ArrowDown'); // START → TYPE
    await tap(page, 'ArrowRight'); // TYPE B
    await expect.poll(async () => (await view(page)).preview).toBe('laser.ripple');
    // The Laser slot's turn comes first on TYPE: Ripple rings on screen.
    await expect
      .poll(async () => (await countColour(page, RIPPLE_CYAN, 190))[1], { timeout: 10_000 })
      .toBeGreaterThan(20);
    await tap(page, 'ArrowUp'); // TYPE → START
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    const game = await view(page);
    expect([game.weaponPreset, game.laser]).toEqual(['type-b', 'laser.ripple']);
    expect(errors).toEqual([]);
  });
});

test.describe('weapon select (Tizen build via file://)', () => {
  test('remote Back returns to the ship select; OK starts the game', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await openSelect(page, TIZEN_INDEX);
    const canvas = page.locator('#game');
    await waitFrames(page, 10);
    await remoteTap(page, 10009); // Back
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
    await waitFrames(page, 4);
    await remoteTap(page, 13); // OK: KESTREL (M2-05)
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
    await remoteTap(page, 13); // OK: START (the menu opens on it)
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    expect((await view(page)).weaponPreset).toBe('type-a');
    expect(errors).toEqual([]);
  });

  test('the remote arrows choose a Weapon Edit, the Option type, `?`, `!` and the Auto order', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const errors = await openSelect(page, TIZEN_INDEX);
    const canvas = page.locator('#game');
    await waitFrames(page, 10);
    await remoteTap(page, 40); // START → TYPE (wraps)
    await remoteTap(page, 37); // TYPE A → EDIT (wraps)
    await remoteTap(page, 40); // MISSILE (unlocked by EDIT)
    await remoteTap(page, 39); // MISSILE → SPREAD BOMB
    await remoteTap(page, 40); // DOUBLE
    await remoteTap(page, 37); // DOUBLE → FREE WAY (wraps)
    await remoteTap(page, 40); // LASER
    await remoteTap(page, 39); // LASER → RIPPLE LASER
    await expect.poll(async () => (await view(page)).preview).toBe('laser.ripple');
    await remoteTap(page, 40); // OPTION (M2-04)
    await remoteTap(page, 37); // TRAIL → ROTATE (wraps)
    await remoteTap(page, 40); // ? SLOT
    await remoteTap(page, 39); // FORCE FIELD → SHIELD
    await remoteTap(page, 40); // ! SLOT
    await remoteTap(page, 39); // MEGA CRASH → NORMAL
    await remoteTap(page, 40); // AUTO
    await remoteTap(page, 40); // ORDER
    await remoteTap(page, 13); // the order editor (an overlay)
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'autoOrder');
    await waitFrames(page, 4);
    await remoteTap(page, 39); // row 1: SPEED → MISSILE
    await remoteTap(page, 10009); // Back stores the rows and closes
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
    await waitFrames(page, 4);
    await remoteTap(page, 40); // START
    await remoteTap(page, 13);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    const config = await page.evaluate(() => {
      const api = (
        window as unknown as {
          __shmupDebug: {
            game: {
              world: {
                config: {
                  weaponPreset: string;
                  weaponEdit: unknown;
                  megaChoice: string;
                  optionChoice: string;
                  shieldChoice: string;
                  autoPowerUpOrder: readonly string[];
                };
                weapons: { roleWeapons: Array<{ id: string } | null> };
              };
            };
          };
        }
      ).__shmupDebug;
      const world = api.game.world;
      return {
        weaponPreset: world.config.weaponPreset,
        weaponEdit: world.config.weaponEdit,
        megaChoice: world.config.megaChoice,
        optionChoice: world.config.optionChoice,
        shieldChoice: world.config.shieldChoice,
        autoPowerUpOrder: world.config.autoPowerUpOrder.slice(),
        roles: world.weapons.roleWeapons.map((weapon) => weapon?.id ?? null),
      };
    });
    expect(config).toEqual({
      weaponPreset: 'type-a',
      weaponEdit: { missile: 'missile.spread', double: 'shot.free', laser: 'laser.ripple' },
      megaChoice: 'normal',
      optionChoice: 'rotate',
      shieldChoice: 'shield',
      autoPowerUpOrder: [
        'missile',
        'missile',
        'laser',
        'option',
        'option',
        'option',
        'option',
        'shield',
      ],
      roles: ['shot.basic', 'shot.free', 'laser.ripple', 'missile.spread'],
    });
    expect(errors).toEqual([]);
  });
});

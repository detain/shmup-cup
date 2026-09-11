/**
 * Browser checks of the input profiles (plan M1-05) on the production web build in headless
 * Chromium: the content's profiles reach the running page — a key the active profile binds is
 * `preventDefault()`-ed by the capture-phase listener, a key it does not bind is left alone —
 * `?profile=` switches profiles (`keyboard-remote-emulation` only knows the remote's keys) and
 * an unknown `?profile=` id is reported with a console warning while the game still boots with
 * the default profile and no errors.
 */
import { expect, test, type Page } from '@playwright/test';

/**
 * Opens a URL of the web build, collecting console errors and the game's warnings, and waits
 * until the shell runs.
 *
 * @param page - The page.
 * @param url - URL relative to the web build.
 * @returns The live error and warning lists.
 */
async function open(page: Page, url: string): Promise<{ errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
    // Only the game's own warnings (SwiftShader adds WebGL driver chatter).
    if (message.type() === 'warning' && message.text().startsWith('Shmup Cup')) {
      warnings.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
  return { errors, warnings };
}

/**
 * Presses keys and reports, per key, whether the game's listener prevented its default.
 *
 * @param page - The page.
 * @param keys - Playwright key names (`KeyZ`, `ArrowUp`, …).
 * @returns `code → defaultPrevented` of each keydown.
 */
async function prevented(page: Page, keys: readonly string[]): Promise<Record<string, boolean>> {
  await page.evaluate(() => {
    const seen: Record<string, boolean> = {};
    (window as unknown as { __keys: Record<string, boolean> }).__keys = seen;
    // Bubble phase on window: runs after the game's capture-phase listener.
    window.addEventListener('keydown', (event) => {
      seen[event.code] = event.defaultPrevented;
    });
  });
  for (const key of keys) {
    await page.keyboard.down(key);
    await page.keyboard.up(key);
  }
  return page.evaluate(() => (window as unknown as { __keys: Record<string, boolean> }).__keys);
}

test.describe('input profiles (web build)', () => {
  test('keyboard-default binds the keyboard keys and leaves others alone', async ({ page }) => {
    const { errors, warnings } = await open(page, './');
    expect(await prevented(page, ['ArrowUp', 'KeyZ', 'KeyX', 'Backspace', 'KeyQ'])).toEqual({
      ArrowUp: true,
      KeyZ: true,
      KeyX: true,
      Backspace: true,
      KeyQ: false,
    });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  test('?profile=keyboard-remote-emulation&debounce=2 only knows the remote keys', async ({
    page,
  }) => {
    const { errors, warnings } = await open(
      page,
      './?profile=keyboard-remote-emulation&debounce=2',
    );
    expect(await prevented(page, ['ArrowLeft', 'Enter', 'Backspace', 'PageUp', 'KeyZ'])).toEqual({
      ArrowLeft: true,
      Enter: true,
      Backspace: true,
      PageUp: true,
      KeyZ: false,
    });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  test('an unknown ?profile= warns once and boots with keyboard-default', async ({ page }) => {
    const { errors, warnings } = await open(page, './?profile=no-such-profile');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('"no-such-profile"');
    expect(warnings[0]).toContain('keyboard-default');
    expect((await prevented(page, ['KeyZ'])).KeyZ).toBe(true);
    expect(errors).toEqual([]);
  });
});

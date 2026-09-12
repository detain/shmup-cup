/**
 * Browser tests of the audio engine (plan M1-15) in headless Chromium (autoplay allowed, like the
 * TV — see `playwright.config.ts`): Web Audio's `createBufferSource` is wrapped before the page
 * loads so every started sound is logged. In the web build on `?stage=test-range` the first key
 * press unlocks audio and the zone theme starts as a looping 22,050 Hz buffer whose loop points
 * are the song's exact sample indices (intro 64 rows × 2,205 samples); in the Tizen build (audio
 * unlocked at boot, forced autofire) the ship's shots play as short one-shot buffers. No console
 * errors either way.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** One started buffer source, as logged by the page. */
interface StartedSound {
  readonly loop: boolean;
  readonly loopStart: number;
  readonly loopEnd: number;
  readonly sampleRate: number;
  readonly length: number;
}

/**
 * Wraps `createBufferSource` so the page logs every sound it starts in `window.__sounds`.
 *
 * @param page - The page (before navigation).
 */
async function recordSounds(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sounds: unknown[] = [];
    (window as unknown as { __sounds: unknown[] }).__sounds = sounds;
    const proto = BaseAudioContext.prototype;
    // Read through Reflect: the wrapper calls it with the context as `this`.
    const create = Reflect.get(proto, 'createBufferSource');
    proto.createBufferSource = function (this: BaseAudioContext) {
      const source = create.call(this);
      const start = source.start.bind(source);
      source.start = (...args: Parameters<AudioBufferSourceNode['start']>) => {
        sounds.push({
          loop: source.loop,
          loopStart: source.loopStart,
          loopEnd: source.loopEnd,
          sampleRate: source.buffer?.sampleRate ?? 0,
          length: source.buffer?.length ?? 0,
        });
        start(...args);
      };
      return source;
    };
  });
}

/**
 * The sounds the page started so far.
 *
 * @param page - The page.
 * @returns The log.
 */
function sounds(page: Page): Promise<StartedSound[]> {
  return page.evaluate(() => (window as unknown as { __sounds: StartedSound[] }).__sounds.slice());
}

/**
 * Waits for `frames` animation frames in the page.
 *
 * @param page - The page.
 * @param frames - Frames to wait.
 */
function waitFrames(page: Page, frames: number): Promise<void> {
  return page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        const next = (): void => {
          seen++;
          if (seen >= count) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    frames,
  );
}

test.describe('audio (web build, ?stage=test-range)', () => {
  test('the first key press unlocks audio and the zone theme loops sample-exactly', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await recordSounds(page);
    await page.goto('./?scene=flight&stage=test-range');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await waitFrames(page, 10);
    expect(await sounds(page)).toEqual([]); // locked until a gesture (autoplay policy)
    await page.keyboard.press('ArrowDown');
    await waitFrames(page, 10);
    const started = await sounds(page);
    const theme = started.find((sound) => sound.loop);
    expect(theme).toBeDefined();
    expect(theme?.sampleRate).toBe(22050);
    // zone-a: a 64-row intro and a 448-row loop at 2,205 samples a row.
    expect(Math.round((theme?.loopStart ?? 0) * 22050)).toBe(64 * 2205);
    expect(Math.round((theme?.loopEnd ?? 0) * 22050)).toBe((64 + 448) * 2205);
    expect(theme?.length).toBe((64 + 448) * 2205);
    expect(errors).toEqual([]);
  });
});

test.describe('audio (Tizen build via file://)', () => {
  test('audio runs from boot: the autofire plays short one-shot shot sounds', async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await recordSounds(page);
    await page.goto(TIZEN_INDEX + '?scene=flight');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await waitFrames(page, 90);
    const started = await sounds(page);
    const shots = started.filter((sound) => !sound.loop && sound.sampleRate === 22050);
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) expect(shot.length).toBeLessThan(22050); // well under a second
    expect(started.some((sound) => sound.loop)).toBe(false); // open space: no stage music
    expect(errors).toEqual([]);
  });
});

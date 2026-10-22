/**
 * Browser tests of zone C (plan M2-11), split out of the `zones-bc` pair, in headless Chromium, on
 * the test builds (their `window.__shmupDebug` hands the spec the game; frame advance for exact
 * tick counts):
 *
 * - **DUNE EXPANSE** — `?scene=flight&stage=zone-c`: the dune ridge band (`bg/dune-ridge`) is
 *   drawn low in the view; at the end SANDGRAVE WIDOW's chitin (`bosses/widow-body`) holds the
 *   right half of the playfield;
 * - **the TV build** — the Tizen `dist/` from `file://` in open space (`?scene=flight`; the TV has
 *   no `?stage=`), SANDGRAVE WIDOW brought in through the debug API: the zone content and art are
 *   in the one-script bundle and draw;
 * - no console errors or atlas warnings anywhere.
 *
 * Screenshots are at the e2e capture scale (`frame-pixels.ts`; ×2, viewport 1280×720): frame
 * pixel (x, y) is screenshot pixel (sx(x), sy(y)).
 */
import { expect, test } from '@playwright/test';
import { stepTo } from './frame-advance.js';
import { FRAME_W, HUD_BOTTOM_Y } from './frame-pixels.js';
import {
  bossNow,
  countColours,
  type DebugWindow,
  jumpTo,
  open,
  rgb,
  RIGHT_HALF,
  stepUntilFight,
  TIZEN_INDEX,
  watchErrors,
} from './zone-helpers.js';

/** `bosses/widow-body`'s chitin (#4a3422) — only SANDGRAVE WIDOW's body uses it. */
const WIDOW_CHITIN = rgb('#4a3422');
/** `bg/dune-ridge`'s two sand tones (#6a4430, #4a3024). */
const RIDGE = [rgb('#6a4430'), rgb('#4a3024')] as const;

test.describe('zones B and C (web build)', () => {
  test('DUNE EXPANSE: the dune ridge, then SANDGRAVE WIDOW fights', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, './?scene=flight&stage=zone-c');
    await stepTo(page, 60);
    expect((await bossNow(page)).stage).toBe('zone-c');
    expect(
      // The dune ridge band — content/stages/zone-c.stage.json `dune-ridge` starts at band-y 240
      // (R2-02's port) — to the playfield's bottom.
      await countColours(page, RIDGE, { x0: 0, y0: 243, x1: FRAME_W, y1: HUD_BOTTOM_Y }),
    ).toBeGreaterThan(4000);
    expect(await countColours(page, [WIDOW_CHITIN], RIGHT_HALF)).toBe(0);
    await jumpTo(page, 19950); // the WARNING is at 20,100 (the R5-03.S5b timeline)
    const fight = await stepUntilFight(page, 40);
    expect(fight.boss).toBe('sandgrave-widow');
    expect(await countColours(page, [WIDOW_CHITIN], RIGHT_HALF)).toBeGreaterThan(450);
    expect(errors).toEqual([]);
  });
});

test.describe('zones B and C (Tizen build via file://)', () => {
  test('SANDGRAVE WIDOW, brought in through the debug API, draws on the TV build', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await open(page, TIZEN_INDEX + '?scene=flight');
    await stepTo(page, 30);
    const started = await page.evaluate(() => {
      const world = (window as unknown as DebugWindow).__shmupDebug.game.world;
      return world.bosses.startBoss(world.content.enemyIndex.get('sandgrave-widow') ?? -1);
    });
    expect(started).toBe(true);
    const fight = await stepUntilFight(page, 20);
    expect(fight.boss).toBe('sandgrave-widow');
    expect(await countColours(page, [WIDOW_CHITIN], RIGHT_HALF)).toBeGreaterThan(450);
    expect(errors).toEqual([]);
  });
});

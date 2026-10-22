/**
 * Browser tests of zone E (plan M2-12), split out of the `zones-de` pair, in headless Chromium, on
 * the test builds (their `window.__shmupDebug` hands the spec the game; frame advance for exact
 * tick counts):
 *
 * - **TEMPEST RIDGE** — `?scene=flight&stage=zone-e`: the palette-cycled storm clouds
 *   (`bg/storm-clouds`, the four ramp colours zone E cycles) fill the top of the view and the
 *   jagged mountain band (`bg/storm-ridge`) its bottom; at the end SQUALL STEED's slate plating
 *   (`bosses/steed-body`) holds the right half of the playfield, its chest opening;
 * - **the TV build** — the Tizen `dist/` from `file://` in open space (`?scene=flight`; the TV has
 *   no `?stage=`), SQUALL STEED brought in through the debug API: the zone content and art are in
 *   the one-script bundle and draw;
 * - no console errors or atlas warnings anywhere.
 *
 * Screenshots are at the e2e capture scale (`frame-pixels.ts`; ×2, viewport 1280×720): frame
 * pixel (x, y) is screenshot pixel (sx(x), sy(y)).
 */
import { expect, test } from '@playwright/test';
import { STORM_RAMP_V2 } from '../../scripts/assets/procedural/tempest.mjs';
import { stepTo } from './frame-advance.js';
import { FRAME_W, HUD_BOTTOM_Y, PLAYFIELD_Y } from './frame-pixels.js';
import {
  bossNow,
  countColours,
  jumpTo,
  open,
  rgb,
  RIGHT_HALF,
  startBoss,
  stepUntilFight,
  TIZEN_INDEX,
  watchErrors,
} from './zone-helpers.js';

/** `bosses/steed-body`'s plating (#3c4658) — only SQUALL STEED's body, lids and tail use it. */
const STEED_PLATE = [rgb('#3c4658')] as const;
/** `bg/storm-ridge`'s far and near mountain tones (#242a38, #303848). */
const RIDGE = [rgb('#242a38'), rgb('#303848')] as const;
/** The storm clouds' ramp (the only colours their palette cycle shows). */
const CLOUDS = STORM_RAMP_V2.map(rgb);

test.describe('zones D and E (web build)', () => {
  test('TEMPEST RIDGE: the cycling storm clouds over the jagged ridge, then SQUALL STEED opens its chest', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, './?scene=flight&stage=zone-e');
    const start = await stepTo(page, 60);
    expect((await bossNow(page)).stage).toBe('zone-e');
    // Two rows of clouds (content/stages/zone-e.stage.json `storm-clouds` at band-y 0 and 60,
    // R2-02's port — rows 0 to 144) in their ramp colours, before and after a few cycle steps (the
    // rain in front of them blends only its streaks).
    const sky = { x0: 0, y0: PLAYFIELD_Y, x1: FRAME_W, y1: 144 };
    expect(await countColours(page, CLOUDS, sky)).toBeGreaterThan(15000);
    await stepTo(page, start + 30);
    expect(await countColours(page, CLOUDS, sky)).toBeGreaterThan(15000);
    // The mountain band (`storm-ridge`, band-y 264).
    expect(
      await countColours(page, RIDGE, { x0: 0, y0: 276, x1: FRAME_W, y1: HUD_BOTTOM_Y }),
    ).toBeGreaterThan(2000);
    expect(await countColours(page, STEED_PLATE, RIGHT_HALF)).toBe(0);
    // The end of the stage: the WARNING (x 20,100, R5-05.S5b), then the boss.
    await jumpTo(page, 20000);
    const fight = await stepUntilFight(page, 40);
    expect(fight.boss).toBe('squall-steed');
    expect(await countColours(page, STEED_PLATE, RIGHT_HALF)).toBeGreaterThan(300);
    // Its chest opens after its 130 shut ticks (phase 0).
    let now = fight;
    for (let i = 0; i < 10 && !now.chestOpen; i++) {
      await stepTo(page, now.tick + 20);
      now = await bossNow(page);
    }
    expect(now.chestOpen).toBe(true);
    expect(now.state).toBe(3);
    expect(errors).toEqual([]);
  });
});

test.describe('zones D and E (Tizen build via file://)', () => {
  test('SQUALL STEED, brought in through the debug API, draws on the TV build', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, TIZEN_INDEX + '?scene=flight');
    await stepTo(page, 30);
    expect(await startBoss(page, 'squall-steed')).toBe(true);
    const steed = await stepUntilFight(page, 20);
    expect(steed.boss).toBe('squall-steed');
    expect(await countColours(page, STEED_PLATE, RIGHT_HALF)).toBeGreaterThan(300);
    expect(errors).toEqual([]);
  });
});

/**
 * Browser tests of zone D (plan M2-12), split out of the `zones-de` pair, in headless Chromium, on
 * the test builds (their `window.__shmupDebug` hands the spec the game; frame advance for exact
 * tick counts):
 *
 * - **MAGMA DEEP** — `?scene=flight&stage=zone-d`: on the surface the volcano peaks band
 *   (`bg/magma-peaks`, its ash) is drawn low in the view and the lava lake (`bg/magma-lava`) is
 *   still below it, out of sight; the stage jumped past the dive (the camera 300 px down in the
 *   caves) the palette-cycled lava lake — only ever the four ramp colours zone D cycles — has
 *   risen into the bottom of the view; at the end CINDER BASTION's iron hull
 *   (`bosses/bastion-hull`) holds the right half of the playfield while it fights, its shield arms
 *   turning;
 * - **the TV build** — the Tizen `dist/` from `file://` in open space (`?scene=flight`; the TV has
 *   no `?stage=`), CINDER BASTION brought in through the debug API: the zone content and art are
 *   in the one-script bundle and draw;
 * - no console errors or atlas warnings anywhere.
 *
 * Screenshots are at the e2e capture scale (`frame-pixels.ts`; ×2, viewport 1280×720): frame
 * pixel (x, y) is screenshot pixel (sx(x), sy(y)).
 */
import { expect, test } from '@playwright/test';
import { MAGMA_RAMP_V2 } from '../../scripts/assets/procedural/magma.mjs';
import { stepTo } from './frame-advance.js';
import { FRAME_W, HUD_BOTTOM_Y, PLAYFIELD_H, PLAYFIELD_Y } from './frame-pixels.js';
import {
  type Area,
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

/** `bosses/bastion-hull`'s two plate tones (#3c3434, #463c3a) — only CINDER BASTION's hull. */
const BASTION_PLATE = [rgb('#3c3434'), rgb('#463c3a')] as const;
/** `bg/magma-peaks`' ash and ridge line (#2e2226, #4a3634). */
const PEAKS = [rgb('#2e2226'), rgb('#4a3634')] as const;
/** The lava lake's ramp (the only colours its palette cycle shows). */
const LAVA = MAGMA_RAMP_V2.map(rgb);

/** The bottom quarter of the playfield: rows 264 to its bottom. */
const BOTTOM: Area = {
  x0: 0,
  y0: PLAYFIELD_Y + (3 * PLAYFIELD_H) / 4,
  x1: FRAME_W,
  y1: HUD_BOTTOM_Y,
};

test.describe('zones D and E (web build)', () => {
  test('MAGMA DEEP: the volcano peaks, the lava lake rising into view with the dive, then CINDER BASTION', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, './?scene=flight&stage=zone-d');
    await stepTo(page, 60);
    const surface = await bossNow(page);
    expect(surface.stage).toBe('zone-d');
    expect(surface.cameraY).toBe(0);
    // The peaks band (content/stages/zone-d.stage.json `magma-peaks`, band-y 228; the sprite is
    // 80 v1 art rows → 120 frame rows, so the band covers 228 to the playfield's bottom) low in
    // the view; the lava lake (`magma-lava`, band-y 420) still out of sight.
    expect(
      await countColours(page, PEAKS, { x0: 0, y0: 240, x1: FRAME_W, y1: 336 }),
    ).toBeGreaterThan(4000);
    expect(await countColours(page, LAVA, BOTTOM)).toBe(0);
    expect(await countColours(page, BASTION_PLATE, RIGHT_HALF)).toBe(0);
    // Past the dive: the camera 300 px down, the lava lake (factor 0.5) risen 150 px into view,
    // in its ramp colours before and after a few cycle steps.
    await jumpTo(page, 6600);
    const caves = await stepTo(page, surface.tick + 5);
    expect((await bossNow(page)).cameraY).toBe(300);
    const lava = await countColours(page, LAVA, BOTTOM);
    expect(lava).toBeGreaterThan(3000);
    await stepTo(page, caves + 20);
    expect(await countColours(page, LAVA, BOTTOM)).toBeGreaterThan(3000);
    // The end of the stage: the WARNING (x 13,650), then the boss, down in the caves.
    await jumpTo(page, 13500);
    const fight = await stepUntilFight(page, 40);
    expect(fight.boss).toBe('cinder-bastion');
    expect(fight.cameraY).toBe(300);
    expect(await countColours(page, BASTION_PLATE, RIGHT_HALF)).toBeGreaterThan(500);
    // Its shield arms turn (4 units a tick in phase 0).
    await stepTo(page, fight.tick + 10);
    const later = await bossNow(page);
    expect(later.hubAngle).not.toBe(fight.hubAngle);
    expect(later.state).toBe(3);
    expect(errors).toEqual([]);
  });
});

test.describe('zones D and E (Tizen build via file://)', () => {
  test('CINDER BASTION, brought in through the debug API, draws on the TV build', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, TIZEN_INDEX + '?scene=flight');
    await stepTo(page, 30);
    expect(await startBoss(page, 'cinder-bastion')).toBe(true);
    const bastion = await stepUntilFight(page, 20);
    expect(bastion.boss).toBe('cinder-bastion');
    expect(await countColours(page, BASTION_PLATE, RIGHT_HALF)).toBeGreaterThan(500);
    expect(errors).toEqual([]);
  });
});

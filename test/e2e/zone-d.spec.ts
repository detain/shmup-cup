/**
 * Browser tests of zone D (plan M2-12), split out of the `zones-de` pair, in headless Chromium, on
 * the test builds (their `window.__shmupDebug` hands the spec the game; frame advance for exact
 * tick counts):
 *
 * - **MAGMA DEEP** — `?scene=flight&stage=zone-d`: on the surface the volcano peaks band
 *   (`bg/magma-peaks`, its ash) is drawn low in the view and the lava lake (`bg/magma-lava`) is
 *   still below it, out of sight; the stage jumped past the second dive step (the camera 432 px
 *   down in the deep caves, its ramp glinting through the cave floor's lip) and on to the
 *   trench's bottom, where the palette-cycled lava lake — only ever the six ramp colours zone D
 *   cycles — stands open at the bottom of the view; at the end CINDER BASTION's iron hull
 *   (`bosses/bastion-hull`) holds the right half of the playfield while it fights, its arms
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
    // The peaks band (`magma-peaks`, content y 228; the sprite's 56 v1 rows are 84 interim rows)
    // shows low in the view over the wall of the new `magma-deep` band (R5-04.S5a): band y is
    // playfield-relative, so at camera 0 the wall's content top y 264 is frame row 276
    // (`PLAYFIELD_Y` 12) and only the first cone's ash wedge stands above it — apex at band row
    // 21, the frame row 261, opening down to the wall: rows 260 to 275, ~1,216 px measured of
    // the two ash colours. The surface rocks' ash-tone speckle (rows 314 up) stays outside.
    expect(
      await countColours(page, PEAKS, { x0: 0, y0: 260, x1: FRAME_W, y1: 276 }),
    ).toBeGreaterThan(1000);
    expect(await countColours(page, LAVA, BOTTOM)).toBe(0);
    expect(await countColours(page, BASTION_PLATE, RIGHT_HALF)).toBe(0);
    // Past the second dive step: the camera 432 px down at checkpoint 3, then the trench where
    // the lava lake stands open — see the two notes below the jump.
    await jumpTo(page, 9900);
    const caves = await stepTo(page, surface.tick + 5);
    expect((await bossNow(page)).cameraY).toBe(432);
    // Past the second dive step: the camera 432 px down. The lava lake (factor 0.5) has its
    // content top at 484 − 432·0.5 = 268, so frame rows 280 up (the `PLAYFIELD_Y` 12) — design
    // §9's arithmetic. At checkpoint 3 the deep-cave floor (height 108 px, top at frame row 240)
    // stands over it and its ramp only glints through the lip of the segment edge (~2,000 px).
    expect(await countColours(page, LAVA, BOTTOM)).toBeGreaterThan(1000);
    // Where the trench bottoms out (12,050..12,670 at 36 px of rock, the maze's destructible
    // shortcut) the lake opens into the view: band rows 280 to 311 over the ~270 frame px of
    // trench a camera at 12,400 shows, ≈8,300 px — and the same 20 ticks later, the palette
    // cycle (R5-P.P7's frozen ramp) only spinning those six colours between themselves.
    await jumpTo(page, 12400);
    const trench = await stepTo(page, caves + 5);
    expect(await countColours(page, LAVA, BOTTOM)).toBeGreaterThan(5000);
    await stepTo(page, trench + 20);
    expect(await countColours(page, LAVA, BOTTOM)).toBeGreaterThan(5000);
    // The end of the stage: the WARNING (x 20,400 — the zone boss's only warning, R5-P.P14),
    // then the boss, deep in the caves.
    await jumpTo(page, 20250);
    const fight = await stepUntilFight(page, 40);
    expect(fight.boss).toBe('cinder-bastion');
    expect(fight.cameraY).toBe(432);
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

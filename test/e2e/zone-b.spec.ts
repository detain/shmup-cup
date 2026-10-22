/**
 * Browser tests of zone B (plan M2-11), split out of the `zones-bc` pair, in headless Chromium, on
 * the test builds (their `window.__shmupDebug` hands the spec the game; frame advance for exact
 * tick counts):
 *
 * - **BRINE NEBULA** — `?scene=flight&stage=zone-b`: the palette-cycled brine sea band
 *   (`bg/brine-sea`, only ever the four ramp colours zone B cycles) fills the bottom of the view;
 *   the stage jumped to its end, the WARNING brings GALVANIC MAW, whose hull plating
 *   (`bosses/maw-hull`) holds the right half of the playfield while it fights, its mouth opening;
 * - **PEARL GROTTO** — `?scene=flight&stage=brine-grotto`: the bonus stage draws its reef floor and
 *   ceiling (`tiles/terrain-reef`'s rim) over the brine sea;
 * - no console errors or atlas warnings anywhere.
 *
 * Screenshots are at the e2e capture scale (`frame-pixels.ts`; ×2, viewport 1280×720): frame
 * pixel (x, y) is screenshot pixel (sx(x), sy(y)).
 */
import { expect, test } from '@playwright/test';
import { BRINE_RAMP } from '../../scripts/assets/procedural/brine.mjs';
import { stepTo } from './frame-advance.js';
import { FRAME_W, HUD_BOTTOM_Y, PLAYFIELD_Y } from './frame-pixels.js';
import {
  bossNow,
  countColours,
  jumpTo,
  open,
  rgb,
  RIGHT_HALF,
  stepUntilFight,
  watchErrors,
} from './zone-helpers.js';

/** `bosses/maw-hull`'s plating (#3a6a78) — only GALVANIC MAW's hull uses it. */
const MAW_PLATE = rgb('#3a6a78');
/** `tiles/terrain-reef`'s rim (the surface facing open space, #f0c890). */
const REEF_RIM = rgb('#f0c890');
/** The brine sea's ramp (the only colours its palette cycle shows). */
const SEA = BRINE_RAMP.map(rgb);

test.describe('zones B and C (web build)', () => {
  test('BRINE NEBULA: the cycling brine sea, then GALVANIC MAW fights with its mouth opening', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, './?scene=flight&stage=zone-b');
    const start = await stepTo(page, 60);
    expect((await bossNow(page)).stage).toBe('zone-b');
    // The sea band — content/stages/zone-b.stage.json `brine-sea` starts at band-y 216 (the
    // R5-02.S5a design §9 row) — in its ramp colours, before and after a few cycle steps.
    const sea = { x0: 0, y0: 240, x1: FRAME_W, y1: 320 };
    expect(await countColours(page, SEA, sea)).toBeGreaterThan(6000);
    await stepTo(page, start + 25);
    expect(await countColours(page, SEA, sea)).toBeGreaterThan(6000);
    expect(await countColours(page, [MAW_PLATE], RIGHT_HALF)).toBe(0);
    // The end of the stage: the WARNING (x 19,800), then the boss.
    await jumpTo(page, 19650);
    const fight = await stepUntilFight(page, 40);
    expect(fight.boss).toBe('galvanic-maw');
    expect(await countColours(page, [MAW_PLATE], RIGHT_HALF)).toBeGreaterThan(500);
    // Its mouth opens within its shut time (150 ticks in phase 1).
    let now = fight;
    for (let i = 0; i < 10 && !now.mouthOpen; i++) {
      await stepTo(page, now.tick + 20);
      now = await bossNow(page);
    }
    expect(now.mouthOpen).toBe(true);
    expect(now.state).toBe(3);
    expect(errors).toEqual([]);
  });

  test('PEARL GROTTO: the bonus stage draws its reef floor and ceiling over the brine sea', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await open(page, './?scene=flight&stage=brine-grotto');
    await stepTo(page, 120);
    expect((await bossNow(page)).stage).toBe('brine-grotto');
    const view = { x0: 0, y0: PLAYFIELD_Y, x1: FRAME_W, y1: HUD_BOTTOM_Y };
    expect(await countColours(page, [REEF_RIM], view)).toBeGreaterThan(300);
    expect(await countColours(page, SEA, view)).toBeGreaterThan(4000);
    expect(errors).toEqual([]);
  });
});

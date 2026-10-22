/**
 * Browser tests of zone H (plan M2-14), split out of the `zones-hi` pair, in headless Chromium, on
 * the test builds (their `window.__shmupDebug` hands the spec the game; frame advance for exact
 * tick counts):
 *
 * - **IRON CITADEL** — `?scene=flight&stage=zone-h`: the palette-cycled fortress wall
 *   (`bg/citadel-wall` — its running lights only ever the four ramp colours zone H cycles, and the
 *   colours of the same pixels change as the cycle steps) fills the top of the view; at the end
 *   IRON SOVEREIGN's stepped hull (`bosses/sovereign-hull`) holds the right half of the playfield
 *   while it fights;
 * - **the TV build** — the Tizen `dist/` from `file://` in open space: IRON SOVEREIGN brought in
 *   through the debug API, and the citadel's ending scene, draw from the one-script bundle;
 * - no console errors or atlas warnings anywhere.
 *
 * Screenshots are at the e2e capture scale (`frame-pixels.ts`; ×2, viewport 1280×720): frame
 * pixel (x, y) is screenshot pixel (sx(x), sy(y)).
 */
import { expect, test } from '@playwright/test';
import { CITADEL_RAMP_V2 } from '../../scripts/assets/procedural/citadel.mjs';
import { stepTo } from './frame-advance.js';
import {
  bossNow,
  type DebugWindow,
  ENDING_CITADEL,
  find,
  open,
  openEnding,
  rampMap,
  rgb,
  RIGHT_HALF,
  SCENE,
  SKY,
  startBoss,
  stepScene,
  stepped,
  stepUntilFight,
  TIZEN_INDEX,
  watchErrors,
} from './zone-helpers.js';

/** IRON SOVEREIGN's hull (#6e7686 lit, #30343e dark) — only its hull (and the core's ring). */
const SOVEREIGN_HULL = [rgb('#6e7686'), rgb('#30343e')] as const;
/** The citadel wall's running lights (the only colours its palette cycle shows). */
const LIGHTS = CITADEL_RAMP_V2.map(rgb);

test.describe('zones H and I (web build)', () => {
  test('IRON CITADEL: the cycling fortress wall, then IRON SOVEREIGN holds the right half', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, './?scene=flight&stage=zone-h');
    const start = await stepTo(page, 60);
    expect((await bossNow(page)).stage).toBe('zone-h');
    // The wall's running lights in their ramp colours; the cycle recolours the same pixels later.
    const lights = await rampMap(page, LIGHTS, SKY);
    expect(lights.filter((k) => k >= 0).length).toBeGreaterThan(50);
    let later = lights;
    for (let k = 1; k <= 6 && stepped(lights, later) === 0; k++) {
      await stepTo(page, start + 15 * k);
      later = await rampMap(page, LIGHTS, SKY);
    }
    expect(stepped(lights, later)).toBeGreaterThan(10);
    // (The same greys show here and there in the zone's rock: count what the finale adds.)
    const before = (await find(page, SOVEREIGN_HULL, RIGHT_HALF)).count;
    // The end of the stage: the WARNING (x 13,650), then the finale.
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__shmupDebug.game.world.stage?.jumpTo(13500);
    });
    const fight = await stepUntilFight(page, 40);
    expect(fight.boss).toBe('iron-sovereign');
    expect((await find(page, SOVEREIGN_HULL, RIGHT_HALF)).count).toBeGreaterThan(before + 700);
    expect(errors).toEqual([]);
  });
});

test.describe('zones H and I (Tizen build via file://)', () => {
  test('IRON SOVEREIGN, brought in through the debug API, draws on the TV build', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, TIZEN_INDEX + '?scene=flight');
    await stepTo(page, 30);
    expect(await startBoss(page, 'iron-sovereign')).toBe(true);
    const sovereign = await stepUntilFight(page, 20);
    expect(sovereign.boss).toBe('iron-sovereign');
    expect((await find(page, SOVEREIGN_HULL, RIGHT_HALF)).count).toBeGreaterThan(700);
    expect(errors).toEqual([]);
  });

  test('the citadel`s ending scene draws on the TV build', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, TIZEN_INDEX);
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-scene', 'title');
    await openEnding(page, 'citadel', 0);
    await stepScene(page, 40);
    expect((await find(page, ENDING_CITADEL, SCENE)).count).toBeGreaterThan(1500);
    expect(errors).toEqual([]);
  });
});

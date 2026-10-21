/**
 * Browser tests of zone G (plan M2-13), split out of `zones-fg.spec.ts`, in headless Chromium, on
 * the test builds (their `window.__shmupDebug` hands the spec the game; frame advance for exact
 * tick counts):
 *
 * - **PRISM LABYRINTH** — `?scene=flight&stage=zone-g`: the palette-cycled crystal facets
 *   (`bg/prism-facets`, the four ramp colours zone G cycles) fill the top of the view and the
 *   crystal spires (`bg/prism-spires`) its bottom; at the end FACET MONARCH's hexagonal housing
 *   (`bosses/facet-body`) holds the right half of the playfield, its arms waving;
 * - **the TV build** — the Tizen `dist/` from `file://` in open space (`?scene=flight`; the TV has
 *   no `?stage=`), FACET MONARCH brought in through the debug API: the zone content and art are in
 *   the one-script bundle and draw;
 * - no console errors or atlas warnings anywhere.
 *
 * Screenshots are at the e2e capture scale (`frame-pixels.ts`; ×2, viewport 1280×720): frame
 * pixel (x, y) is screenshot pixel (sx(x), sy(y)).
 */
import { expect, test } from '@playwright/test';
import { PRISM_RAMP_V2 } from '../../scripts/assets/procedural/prism.mjs';
import { stepTo } from './frame-advance.js';
import { FRAME_W, HUD_BOTTOM_Y } from './frame-pixels.js';
import {
  bossNow,
  countColours,
  jumpTo,
  open,
  rampMap,
  rgb,
  RIGHT_HALF,
  SKY,
  startBoss,
  stepped,
  stepUntilFight,
  TIZEN_INDEX,
  watchErrors,
} from './zone-helpers.js';

/** FACET MONARCH's housing faces (#263e62, #18284a) — only `bosses/facet-body`. */
const MONARCH_FACE = [rgb('#263e62'), rgb('#18284a')] as const;
/** `bg/prism-spires`' far and near crystal (#18243c, #22365a). */
const SPIRES = [rgb('#18243c'), rgb('#22365a')] as const;
/** The crystal facets' ramp (the only colours their palette cycle shows). */
const FACETS = PRISM_RAMP_V2.map(rgb);

test.describe('zones F and G (web build)', () => {
  test('PRISM LABYRINTH: the cycling crystal facets over the spires, then FACET MONARCH waves its arms', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, './?scene=flight&stage=zone-g');
    const start = await stepTo(page, 60);
    expect((await bossNow(page)).stage).toBe('zone-g');
    const facets = await rampMap(page, FACETS, SKY);
    expect(facets.filter((k) => k >= 0).length).toBeGreaterThan(20000);
    await stepTo(page, start + 45);
    const later = await rampMap(page, FACETS, SKY);
    expect(later.filter((k) => k >= 0).length).toBeGreaterThan(20000);
    expect(stepped(facets, later)).toBeGreaterThan(1000);
    expect(
      // The spires band (content/stages/zone-g.stage.json `prism-spires`, band-y 252).
      await countColours(page, SPIRES, { x0: 0, y0: 252, x1: FRAME_W, y1: HUD_BOTTOM_Y }),
    ).toBeGreaterThan(3000);
    expect(await countColours(page, MONARCH_FACE, RIGHT_HALF)).toBe(0);
    // The end of the stage: the WARNING (x 13,950), then the boss.
    await jumpTo(page, 13800);
    const fight = await stepUntilFight(page, 40);
    expect(fight.boss).toBe('facet-monarch');
    expect(await countColours(page, MONARCH_FACE, RIGHT_HALF)).toBeGreaterThan(700);
    // Its arms wave (1 unit a tick in phase 0).
    await stepTo(page, fight.tick + 10);
    const waved = await bossNow(page);
    expect(waved.armAngle).not.toBe(fight.armAngle);
    expect(waved.state).toBe(3);
    expect(errors).toEqual([]);
  });
});

test.describe('zones F and G (Tizen build via file://)', () => {
  test('FACET MONARCH, brought in through the debug API, draws on the TV build', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, TIZEN_INDEX + '?scene=flight');
    await stepTo(page, 30);
    expect(await startBoss(page, 'facet-monarch')).toBe(true);
    const monarch = await stepUntilFight(page, 20);
    expect(monarch.boss).toBe('facet-monarch');
    expect(await countColours(page, MONARCH_FACE, RIGHT_HALF)).toBeGreaterThan(700);
    expect(errors).toEqual([]);
  });
});

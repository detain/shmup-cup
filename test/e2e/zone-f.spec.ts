/**
 * Browser tests of zone F (plan M2-13), split out of the `zones-fg` pair, in headless Chromium, on
 * the test builds (their `window.__shmupDebug` hands the spec the game; frame advance for exact
 * tick counts):
 *
 * - **CELL VAULT** — `?scene=flight&stage=zone-f`: the palette-cycled cell wall
 *   (`bg/vault-membrane` — only ever the four ramp colours zone F cycles, and the colours of the
 *   same pixels change as the cycle steps) fills the top of the view and the fleshy folds
 *   (`bg/vault-folds`) its bottom; at the end MANTLE REGENT's mantle and tentacles
 *   (`bosses/regent-*`) hold the right half of the playfield while it fights, its tentacles
 *   curling in after their open ticks;
 * - **the TV build** — the Tizen `dist/` from `file://` in open space (`?scene=flight`; the TV has
 *   no `?stage=`), MANTLE REGENT brought in through the debug API: the zone content and art are in
 *   the one-script bundle and draw;
 * - no console errors or atlas warnings anywhere.
 *
 * Screenshots are at the e2e capture scale (`frame-pixels.ts`; ×2, viewport 1280×720): frame
 * pixel (x, y) is screenshot pixel (sx(x), sy(y)).
 */
import { expect, test } from '@playwright/test';
import { VAULT_RAMP_V2 } from '../../scripts/assets/procedural/vault.mjs';
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

/** MANTLE REGENT's skin (#3c5a4c, #2c4238) — only its mantle, segments and tips use them. */
const REGENT_SKIN = [rgb('#3c5a4c'), rgb('#2c4238')] as const;
/** `bg/vault-folds`' far and near flesh (#1e2e26, #2c4034). */
const FOLDS = [rgb('#1e2e26'), rgb('#2c4034')] as const;
/** The cell wall's ramp (the only colours its palette cycle shows). */
const MEMBRANE = VAULT_RAMP_V2.map(rgb);

test.describe('zones F and G (web build)', () => {
  test('CELL VAULT: the cycling cell wall over the fleshy folds, then MANTLE REGENT curls its tentacles', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, './?scene=flight&stage=zone-f');
    const start = await stepTo(page, 60);
    expect((await bossNow(page)).stage).toBe('zone-f');
    // Three rows of the cell wall (content/stages/zone-f.stage.json `vault-membrane` at band-y 0,
    // 96 and 192 — R2-02's port) in its ramp colours; the cycle (12 ticks a step)
    // recolours the same pixels a few steps later.
    const wall = await rampMap(page, MEMBRANE, SKY);
    expect(wall.filter((k) => k >= 0).length).toBeGreaterThan(20000);
    await stepTo(page, start + 30);
    const later = await rampMap(page, MEMBRANE, SKY);
    expect(later.filter((k) => k >= 0).length).toBeGreaterThan(20000);
    expect(stepped(wall, later)).toBeGreaterThan(1000);
    // The folds band (`vault-folds`, band-y 264).
    expect(
      await countColours(page, FOLDS, { x0: 0, y0: 264, x1: FRAME_W, y1: HUD_BOTTOM_Y }),
    ).toBeGreaterThan(3000);
    expect(await countColours(page, REGENT_SKIN, RIGHT_HALF)).toBe(0);
    // The end of the stage: the WARNING (x 13,650), then the boss.
    await jumpTo(page, 13500);
    const fight = await stepUntilFight(page, 40);
    expect(fight.boss).toBe('mantle-regent');
    expect(await countColours(page, REGENT_SKIN, RIGHT_HALF)).toBeGreaterThan(700);
    // Its tentacles curl in after their 120 open ticks (phase 0).
    expect(fight.armAngle === 0).toBe(true); // straight (0 or −0)
    let now = fight;
    for (let i = 0; i < 10 && now.armAngle === 0; i++) {
      await stepTo(page, now.tick + 20);
      now = await bossNow(page);
    }
    expect(now.armAngle === 0).toBe(false);
    expect(now.state).toBe(3);
    expect(errors).toEqual([]);
  });
});

test.describe('zones F and G (Tizen build via file://)', () => {
  test('MANTLE REGENT, brought in through the debug API, draws on the TV build', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, TIZEN_INDEX + '?scene=flight');
    await stepTo(page, 30);
    expect(await startBoss(page, 'mantle-regent')).toBe(true);
    const regent = await stepUntilFight(page, 20);
    expect(regent.boss).toBe('mantle-regent');
    expect(await countColours(page, REGENT_SKIN, RIGHT_HALF)).toBeGreaterThan(700);
    expect(errors).toEqual([]);
  });
});

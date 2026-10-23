/**
 * Browser tests of zone I (plan M2-14), split out of the `zones-hi` pair, in headless Chromium, on
 * the test builds (their `window.__shmupDebug` hands the spec the game; frame advance for exact
 * tick counts):
 *
 * - **ABYSSAL THRONE** — `?scene=flight&stage=zone-i`: the palette-cycled murk (`bg/abyss-murk`,
 *   the six ramp colours of the R5-P.P7 v2 ramp zone I cycles) fills the top of the view; at the
 *   end the ABYSS ARK's bone plating (`bosses/ark-*`) fills the view as the raid's camera follows
 *   it;
 * - **the ending scenes** — the web build's scene flow put on the ending of a run through the
 *   debug API: *THE FLAGSHIP SLIPS AWAY* draws the deep's scene (the sea's surface, the dawn sun of
 *   a flawless run, the ARK's silhouette sailing off to the right) and its epilogue; *THE CITADEL
 *   FALLS SILENT* the citadel's silhouette with blasts over it;
 * - **the TV build** — the Tizen `dist/` from `file://` in open space: the ABYSS ARK brought in
 *   through the debug API, drawing from the one-script bundle;
 * - no console errors or atlas warnings anywhere.
 *
 * Screenshots are at the e2e capture scale (`frame-pixels.ts`; ×2, viewport 1280×720): frame
 * pixel (x, y) is screenshot pixel (sx(x), sy(y)).
 */
import { expect, test } from '@playwright/test';
import { ABYSS_RAMP_V2 } from '../../scripts/assets/procedural/abyss.mjs';
import { stepTo } from './frame-advance.js';
import { FRAME_H, FRAME_W, PLAYFIELD_Y } from './frame-pixels.js';
import {
  type Area,
  bossNow,
  type DebugWindow,
  ENDING_ARK,
  ENDING_CITADEL,
  ENDING_SUN,
  ENDING_SURFACE,
  find,
  open,
  openEnding,
  rampMap,
  rgb,
  SCENE,
  startBoss,
  stepScene,
  stepped,
  stepUntilFight,
  TIZEN_INDEX,
  watchErrors,
} from './zone-helpers.js';

/** The ABYSS ARK's bone plating (#b8b09a, #7a7462) — only the ARK's sections, turrets, heart. */
const ARK_BONE = [rgb('#b8b09a'), rgb('#7a7462')] as const;
/** The murk's specks (the only colours its palette cycle shows). */
const SPECKS = ABYSS_RAMP_V2.map(rgb);

/** The whole playfield below the HUD bar. */
const PLAYFIELD: Area = { x0: 0, y0: PLAYFIELD_Y, x1: FRAME_W, y1: FRAME_H };

/**
 * The whole murk field of zone I: its three parallax bands sit at rows 0, 96 and 192
 * (`content/stages/zone-i.stage.json`, each 96 rows tall — the R2-02 port, so murk covers the
 * rows up to 288). The spires band (y 252) draws no ramp colour, its sparse silhouettes only
 * hide specks behind them. The specks' cycle is measured here, not in `SKY`: at the ported
 * scale the band drifts ~3 frame px per 15 ticks, so the sparse specks of the top band alone
 * re-overlap only ~6 of their pixels (all 141 of rows 12 … 100) — over the full field they
 * re-overlap 46.
 */
const MURK: Area = { x0: 0, y0: PLAYFIELD_Y, x1: FRAME_W, y1: 280 };

test.describe('zones H and I (web build)', () => {
  test('ABYSSAL THRONE: the cycling murk, then the ABYSS ARK`s bone plating fills the raid`s view', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, './?scene=flight&stage=zone-i');
    const start = await stepTo(page, 60);
    expect((await bossNow(page)).stage).toBe('zone-i');
    const specks = await rampMap(page, SPECKS, MURK);
    expect(specks.filter((k) => k >= 0).length).toBeGreaterThan(50);
    let later = specks;
    for (let k = 1; k <= 6 && stepped(specks, later) === 0; k++) {
      await stepTo(page, start + 15 * k);
      later = await rampMap(page, SPECKS, MURK);
    }
    expect(stepped(specks, later)).toBeGreaterThan(10);
    expect((await find(page, ARK_BONE, PLAYFIELD)).count).toBe(0);
    // The end of the stage: the WARNING (x 19,650, design §2), then the boss — the jump lands
    // 150 px before it, the lead this spec has always kept from its own warning.
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__shmupDebug.game.world.stage?.jumpTo(19500);
    });
    const fight = await stepUntilFight(page, 60);
    expect(fight.boss).toBe('abyss-ark');
    expect((await find(page, ARK_BONE, PLAYFIELD)).count).toBeGreaterThan(1500);
    expect(errors).toEqual([]);
  });

  test('the endings: the flagship sails off under the dawn; the citadel falls under its blasts', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, './');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-scene', 'title');
    // A flawless run whose ARK escaped: THE FLAGSHIP SLIPS AWAY, the deep's scene.
    const escape = await openEnding(page, 'throne-escape', 1);
    expect(escape.length).toBeGreaterThan(0);
    await stepScene(page, 10);
    const sailing = await find(page, ENDING_ARK, SCENE);
    expect(sailing.count).toBeGreaterThan(400);
    expect((await find(page, ENDING_SUN, SCENE)).count).toBeGreaterThan(5); // half above the frame
    expect((await find(page, ENDING_SURFACE, SCENE)).count).toBeGreaterThan(100);
    await stepScene(page, 160);
    const sailed = await find(page, ENDING_ARK, SCENE);
    expect(sailed.meanX - sailing.meanX).toBeGreaterThan(30); // 1 px every 4 ticks, to the right
    expect(
      await page.evaluate(
        () => (window as unknown as DebugWindow).__shmupDebug.game.scenes.ending.shown,
      ),
    ).toBeGreaterThanOrEqual(1);
    // THE CITADEL FALLS SILENT: the citadel's silhouette, blasts over it, no ARK.
    await openEnding(page, 'citadel-flawless', 0);
    await stepScene(page, 40);
    expect((await find(page, ENDING_CITADEL, SCENE)).count).toBeGreaterThan(1500);
    expect((await find(page, ENDING_ARK, SCENE)).count).toBe(0);
    // The dawn: the sun rises from behind the horizon band after 120 ticks.
    expect((await find(page, ENDING_SUN, SCENE)).count).toBe(0);
    await stepScene(page, 260);
    expect((await find(page, ENDING_SUN, SCENE)).count).toBeGreaterThan(5);
    expect((await find(page, ENDING_CITADEL, SCENE)).count).toBeGreaterThan(1500);
    expect(errors).toEqual([]);
  });
});

test.describe('zones H and I (Tizen build via file://)', () => {
  test('the ABYSS ARK, brought in through the debug API, draws on the TV build', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await open(page, TIZEN_INDEX + '?scene=flight');
    await stepTo(page, 30);
    expect(await startBoss(page, 'abyss-ark')).toBe(true);
    const ark = await stepUntilFight(page, 20);
    expect(ark.boss).toBe('abyss-ark');
    expect((await find(page, ARK_BONE, PLAYFIELD)).count).toBeGreaterThan(1500);
    expect(errors).toEqual([]);
  });
});

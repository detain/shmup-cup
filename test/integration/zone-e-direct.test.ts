/**
 * Zone E in Direct mode (plan M2-12 "direct-mode item plan", the deliverables of M2-11; the
 * MANTA of M2-05) on the shipped content, R5-P.P5e's split of `zones-de-direct.test.ts` (zone D's
 * run lives in `zone-d-direct.test.ts`): the MANTA, flown by the 4-way playtest bot with god
 * mode, plays TEMPEST RIDGE (the rear attackers) from the start to the stage clear —
 *
 * - the World's item plan is the stage's own `directItems` (not the default plan);
 * - the carriers and completed formations hand out the plan in order: the items that appear on a
 *   tick are the plan's entries from the cursor before it to the cursor after it (cycling) — a
 *   drop the ship's magnet collects on the tick it falls never shows in the pool, so it may be
 *   missing, never another item —, the cursor only moves on, and the zone's colours come
 *   along the way as far as the honest run reaches (each row's list below; prepB.FIX8),
 * - no meter capsule ever appears in Direct mode;
 * - the MANTA's weapons shoot the zone's boss down (SQUALL STEED's chest while it is open).
 */
import {
  DIRECT_ITEMS,
  DIRECT_ITEM_KINDS,
  ENGINE_SPRITES,
  ItemFlag,
  ItemKind,
  KNOWN_SCRIPT_IDS,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  loadContent,
  type ContentDb,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';
import { fourWayBot } from '../playtest/four-way-bot.js';

/** The shipped content, validated like the shell does. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(readContentFiles(), {
    knownScripts: KNOWN_SCRIPT_IDS,
    extraSprites: ENGINE_SPRITES,
  });
  expect(issues).toEqual([]);
  return db;
})();

/** The Direct-mode item kinds as plain numbers (the pool's `kind` field), in `DIRECT_ITEMS` order. */
const KINDS: readonly number[] = DIRECT_ITEM_KINDS;

/**
 * The zone, its boss and the honest hand-out floors of this bot run. Zone E's camera dips to
 * y 60 in the eye of the storm (the R5-05.S5a key at 12,900, design §2), so the depth target is
 * 60, not the v1 surface. The pair file's prepB.FIX8 note (d25de31) rides in
 * `zone-d-direct.test.ts`; zone-e's run reaches the shared floor below and is the file's octagon
 * coverage (the 31-item plan keeps the octagon at index 8, inside the first ten hand-outs).
 * Hand-outs stay strictly in plan order and the dropped-plus-swallowed accounts equal the cursor —
 * those invariants are what this test owns; the floor and the colour list only describe how far
 * the shared bot honestly gets.
 */
const ZONES = [
  {
    stage: 'zone-e',
    boss: 'squall-steed',
    depth: 60,
    handed: 10,
    colours: ['red', 'green', 'blue', 'octagon'],
  },
] as const;

describe('integration: zones D and E in Direct mode (M2-12)', () => {
  it.each(ZONES)(
    'the MANTA clears $stage, the carriers handing out its own item plan in order',
    ({ stage, boss, depth, handed, colours }) => {
      const platform = createHeadlessPlatform();
      const game = createGame(
        platform,
        { seed: 17, stage, shipId: 'manta', powerUpMode: 'direct' },
        DB,
      );
      const w = game.world;
      w.debugFlags.godMode = true;
      const spec = DB.stages[DB.stageIndex.get(stage) ?? -1];
      const plan = spec.directItems ?? [];
      expect(plan.length).toBeGreaterThanOrEqual(20);
      // The World's plan is the stage's.
      expect(Array.from(w.powerups.plan, (i) => DIRECT_ITEMS[i])).toEqual(plan);
      const bot = fourWayBot();
      const items = w.powerups.pool;
      const f = items.fields;
      const seen = new Set<number>(); // item slots seen alive this tick (to spot new drops)
      const dropped: string[] = [];
      const wrong: string[] = [];
      let caught = 0; // drops collected on the tick they fell (never seen in the pool)
      let bossBeaten = false;
      let deepest = 0;
      for (let t = 0; t < 30_000 && w.status !== 'stageClear'; t++) {
        const cursor = w.powerups.planCursor;
        commitPlayerInput(platform.snapshot.players[0], bot.decide(w));
        game.step();
        game.events.clear();
        const now = w.powerups.planCursor;
        if (now < cursor) wrong.push(`tick ${String(w.tick)}: the cursor went back`);
        const alive = new Set<number>();
        const fresh: string[] = [];
        for (let i = 0; i < items.count; i++) {
          if ((f.flags[i] & ItemFlag.Dead) !== 0) continue;
          const kind = f.kind[i];
          if (kind !== ItemKind.BlueCapsule && KINDS.indexOf(kind) < 0) {
            wrong.push(`tick ${String(w.tick)}: item kind ${String(kind)}`);
          }
          alive.add(i);
          if (seen.has(i) || f.age[i] > 1 || kind === ItemKind.BlueCapsule) continue;
          fresh.push(DIRECT_ITEMS[KINDS.indexOf(kind)]);
        }
        // This tick's drops are the plan's entries from the old cursor to the new one, in order;
        // one the ship's magnet collected on the tick it fell never shows in the pool.
        const handed: string[] = [];
        for (let k = cursor; k < now; k++) handed.push(plan[k % plan.length]);
        const missing = handed.length - fresh.length;
        if (missing < 0 || missing > w.powerups.outcomes.pickupCount) {
          wrong.push(`tick ${String(w.tick)}: ${fresh.join()} dropped for ${handed.join()}`);
        }
        let from = 0;
        for (const item of fresh) {
          const at = handed.indexOf(item, from);
          if (at < 0) wrong.push(`tick ${String(w.tick)}: ${item} is not in ${handed.join()}`);
          from = at + 1;
        }
        dropped.push(...fresh);
        caught += missing > 0 ? missing : 0;
        seen.clear();
        for (const i of alive) seen.add(i);
        if (w.camera.y > deepest) deepest = w.camera.y;
        if (w.bosses.boss.specIndex === DB.enemyIndex.get(boss) && w.bosses.boss.state >= 4) {
          bossBeaten = true;
        }
      }
      expect(wrong.slice(0, 5)).toEqual([]);
      expect(w.status).toBe('stageClear');
      expect(bossBeaten).toBe(true);
      expect(deepest).toBe(depth);
      // Every drop was the plan's entry at the cursor it was handed out at (the plan cycles),
      // checked tick by tick above; a few fell right onto the ship and were collected at once.
      const cursor = w.powerups.planCursor;
      expect(cursor).toBeGreaterThanOrEqual(handed);
      expect(dropped.length + caught).toBe(cursor);
      expect(caught).toBeLessThanOrEqual(2);
      // The zone's own colours as far as the honest run reaches them (prepB.FIX8 note above).
      for (const colour of colours) expect(dropped).toContain(colour);
    },
    60_000,
  );
});

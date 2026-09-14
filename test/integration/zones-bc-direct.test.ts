/**
 * Zones B and C in Direct mode (plan M2-11 "direct-mode item plan"; the MANTA of M2-05) on the
 * shipped content: the MANTA, flown by the 4-way playtest bot with god mode, plays BRINE NEBULA and
 * DUNE EXPANSE from the start to the stage clear —
 *
 * - the World's item plan is the stage's own `directItems` (not the default plan);
 * - the carriers and completed formations hand out the plan in order: every colour item that
 *   appears is the plan's entry at the cursor it was dropped at (cycling), the cursor only moves
 *   on, and red, green, blue and the octagon come along the way;
 * - no meter capsule ever appears in Direct mode;
 * - the MANTA's weapons shoot the zone's boss down (GALVANIC MAW's mouth weak point, SANDGRAVE
 *   WIDOW behind its fangs).
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

/** The zones and their bosses. */
const ZONES = [
  { stage: 'zone-b', boss: 'galvanic-maw' },
  { stage: 'zone-c', boss: 'sandgrave-widow' },
] as const;

describe('integration: zones B and C in Direct mode (M2-11)', () => {
  it.each(ZONES)(
    'the MANTA clears $stage, the carriers handing out its own item plan in order',
    ({ stage, boss }) => {
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
      let bossBeaten = false;
      for (let t = 0; t < 30_000 && w.status !== 'stageClear'; t++) {
        const cursor = w.powerups.planCursor;
        commitPlayerInput(platform.snapshot.players[0], bot.decide(w));
        game.step();
        game.events.clear();
        const now = w.powerups.planCursor;
        if (now < cursor) wrong.push(`tick ${String(w.tick)}: the cursor went back`);
        const alive = new Set<number>();
        for (let i = 0; i < items.count; i++) {
          if ((f.flags[i] & ItemFlag.Dead) !== 0) continue;
          const kind = f.kind[i];
          if (kind !== ItemKind.BlueCapsule && KINDS.indexOf(kind) < 0) {
            wrong.push(`tick ${String(w.tick)}: item kind ${String(kind)}`);
          }
          alive.add(i);
          if (seen.has(i) || f.age[i] > 1 || kind === ItemKind.BlueCapsule) continue;
          dropped.push(DIRECT_ITEMS[KINDS.indexOf(kind)]);
        }
        seen.clear();
        for (const i of alive) seen.add(i);
        if (w.bosses.boss.specIndex === DB.enemyIndex.get(boss) && w.bosses.boss.state >= 4) {
          bossBeaten = true;
        }
      }
      expect(wrong.slice(0, 5)).toEqual([]);
      expect(w.status).toBe('stageClear');
      expect(bossBeaten).toBe(true);
      // Every drop was the plan's entry at the cursor it was handed out at (the plan cycles).
      const cursor = w.powerups.planCursor;
      expect(cursor).toBeGreaterThanOrEqual(10);
      expect(dropped).toHaveLength(cursor);
      expect(dropped).toEqual(dropped.map((_c, k) => plan[k % plan.length]));
      // The zone's own colours: red, green and blue levels, the octagon among the first dozen.
      for (const colour of ['red', 'green', 'blue', 'octagon']) expect(dropped).toContain(colour);
    },
    60_000,
  );
});

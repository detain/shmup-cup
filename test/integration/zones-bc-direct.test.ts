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

      // Every observed drop, with the plan position it was handed out at.
      const dropped: Array<{ at: number; name: string }> = [];
      const wrong: string[] = [];
      const fresh: number[] = [];
      let bossBeaten = false;
      for (let t = 0; t < 30_000 && w.status !== 'stageClear'; t++) {
        const cursor = w.powerups.planCursor;
        commitPlayerInput(platform.snapshot.players[0], bot.decide(w));
        game.step();
        game.events.clear();
        const now = w.powerups.planCursor;
        if (now < cursor) wrong.push(`tick ${String(w.tick)}: the cursor went back`);
        // The items of this tick: age 0 or 1 (phase 5 ages a fresh drop from 0 to 1, and an item
        // that spawned after the phase is still 0). Slot identity is useless here — the pool
        // swap-removes —, so a tick is only matched to the plan when as many new items showed up
        // as the cursor advanced by; a drop the ship swallowed on its spawn tick is simply not
        // seen, and shifts nothing.
        fresh.length = 0;
        for (let i = 0; i < items.count; i++) {
          if ((f.flags[i] & ItemFlag.Dead) !== 0) continue;
          const kind = f.kind[i];
          if (kind !== ItemKind.BlueCapsule && KINDS.indexOf(kind) < 0) {
            wrong.push(`tick ${String(w.tick)}: item kind ${String(kind)}`);
          }
          if (f.age[i] > 1 || kind === ItemKind.BlueCapsule) continue;
          fresh.push(kind);
        }
        // Only a tick that handed out exactly one item is matched: the pool's order says nothing
        // about which of two drops came first.
        if (fresh.length === 1 && now - cursor === 1) {
          dropped.push({ at: cursor, name: DIRECT_ITEMS[KINDS.indexOf(fresh[0])] });
        }
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
      // Most drops are seen one at a time; the rest shared a tick or were swallowed on their own.
      expect(dropped.length).toBeGreaterThanOrEqual(10);
      expect(dropped.map((d) => d.name)).toEqual(dropped.map((d) => plan[d.at % plan.length]));
      const names = dropped.map((d) => d.name);
      // The zone's own colours: red, green and blue levels, the octagon among the first dozen.
      for (const colour of ['red', 'green', 'blue', 'octagon']) expect(names).toContain(colour);
    },
    60_000,
  );
});

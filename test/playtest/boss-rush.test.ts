/**
 * The boss-rush playtest (plan M3-01 — the EXTRA menu's BOSS RUSH, shmup_feat.md §13 "boss rush
 * stage"): the 4-way bot plays the shipped `boss-rush` stage headless through the harness with
 * god mode and the full loadout — every zone's boss, A to I, comes in turn after its WARNING and
 * is shot down, and the stage clears after the last one. Without god mode the run is recorded and
 * replays to the same deaths and final hash.
 */
import { BossState, type World } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { fourWayBot } from './four-way-bot.js';
import { describeRun, replayStage, runStage, shippedContent } from './harness.js';

/** The bosses of the rush, in order (the zones' bosses, A to I). */
const RUSH = [
  'halcyon-bulwark',
  'galvanic-maw',
  'sandgrave-widow',
  'cinder-bastion',
  'squall-steed',
  'mantle-regent',
  'facet-monarch',
  'iron-sovereign',
  'hollow-king',
];

/**
 * Watches the rush: the ids of the bosses seen fighting and dying, in order.
 *
 * @returns The observer and what it saw.
 */
function watchRush(): { observe: (world: World) => void; fought: string[]; killed: string[] } {
  const fought: string[] = [];
  const killed: string[] = [];
  const enemies = shippedContent().enemies;
  const states = new Map<number, number>();
  return {
    fought,
    killed,
    observe(world) {
      const slots = world.bosses.slots;
      for (let i = 0; i < slots.length; i++) {
        const boss = slots[i];
        const before = states.get(i) ?? BossState.None;
        if (boss.state === before) continue;
        states.set(i, boss.state);
        const id = boss.specIndex >= 0 ? (enemies[boss.specIndex]?.id ?? '?') : '?';
        if (!RUSH.includes(id)) continue;
        if (boss.state === BossState.Fight && before !== BossState.Fight) fought.push(id);
        if (boss.state === BossState.Dying) killed.push(id);
      }
    },
  };
}

describe('playtest: the boss rush with the 4-way bot (M3-01)', () => {
  it('lists every zone`s boss, in zone order', () => {
    const db = shippedContent();
    const stage = db.stages[db.stageIndex.get('boss-rush')!];
    expect(stage.type).toBe('bossRush');
    expect(stage.rush.map((entry) => entry.enemy)).toEqual(RUSH);
    expect(stage.rush.map((entry) => db.enemies[entry.enemyId].id)).toEqual(RUSH);
  });

  it('shoots every boss down in turn with god mode and the full loadout, then clears', () => {
    const watch = watchRush();
    const run = runStage('boss-rush', fourWayBot(), {
      godMode: true,
      config: { loadout: 'full' },
      observe: watch.observe,
    });
    console.info('[playtest] ' + describeRun(run));
    expect(run.status).toBe('stageClear');
    expect(watch.fought).toEqual(RUSH);
    expect(watch.killed).toEqual(RUSH);
    expect(run.diagonalTicks).toBe(0);
    expect(run.remoteViolations, run.remoteViolation).toBe(0);
  }, 60_000);

  it('records a run without god mode that replays to the same deaths and final hash', () => {
    const run = runStage('boss-rush', fourWayBot(), { config: { loadout: 'full' }, seed: 4 });
    console.info(
      `[playtest] ${describeRun(run)}; deaths at ${run.deaths.map((d) => String(d.tick)).join(', ') || 'none'}`,
    );
    expect(['stageClear', 'gameOver']).toContain(run.status);
    const again = replayStage('boss-rush', run.inputs, { config: { loadout: 'full' }, seed: 4 });
    expect(again.deathTicks).toEqual(run.deaths.map((d) => d.tick));
    expect(again.hash).toBe(run.hash);
  }, 60_000);
});

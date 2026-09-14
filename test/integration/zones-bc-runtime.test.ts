/**
 * Zones B and C through the real game on the shipped content (plan M2-11):
 *
 * - **BRINE NEBULA's hidden bonus stage.** A practice run of zone B from its third checkpoint
 *   (the scene flow's `startPractice`): the ship flies under the left block of the marked gap, rises
 *   into it — the `gap` entrance opens — and after the warp the game scene plays `brine-grotto` (PEARL
 *   GROTTO) with the players carried in; its clear is the zone's clear (GALVANIC MAW is skipped).
 * - **The zone songs.** The flow prepares zone B's own music set when the run reaches it
 *   (`SimEventKind.PrepareStage` → the stage's index) — its stage-scoped tracks are chosen by the
 *   audio side (`content.test.ts` checks the binding).
 * - **The captain and the WARNING.** In zone B the mid-boss SPUME HERALD comes with a `boss` event
 *   (no WARNING, the camera keeps scrolling) before GALVANIC MAW's WARNING; in zone C the sand worms
 *   rise from the dunes (their segments above the floor they lay in).
 */
import {
  Action,
  BossRole,
  BossState,
  ENGINE_SPRITES,
  EnemyState,
  KNOWN_SCRIPT_IDS,
  SimEventKind,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  loadContent,
  type ContentDb,
  type Game,
  type SceneFlow,
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

/**
 * The id of the stage a game's World plays.
 *
 * @param game - The game.
 * @returns The stage id.
 */
const stageOf = (game: Game): string => game.world.stage?.stage.id ?? '';

describe('integration: zones B and C in the game (M2-11)', () => {
  it('flies into BRINE NEBULA’s marked gap and plays PEARL GROTTO — its clear is the zone’s', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(platform, { seed: 3, stage: 'zone-a', loadout: 'full' }, DB, {
      scenes: 'game',
    });
    game.debug.godMode = true;
    const flow = game.scenes as SceneFlow;
    expect(flow.campaign).not.toBeNull();
    const prepared: number[] = [];
    expect(flow.startPractice('b', 2)).toBe(true);
    const player = platform.snapshot.players[0];
    const step = (held: number): void => {
      commitPlayerInput(player, held);
      game.step();
      game.events.drain((e) => {
        if (e.kind === SimEventKind.PrepareStage) prepared.push(e.id);
      });
    };
    step(0);
    expect(stageOf(game)).toBe('zone-b');
    expect(prepared).toContain(DB.stageIndex.get('zone-b'));
    const zone = game.world;
    expect(Math.floor(zone.camera.x)).toBe(4600); // the third checkpoint
    // The gap: world x 5616–5680 at the top, between two blocks 24 px tall.
    const entrance = zone.stage?.stage.events.find((e) => e.type === 'bonus');
    const region = entrance?.type === 'bonus' ? entrance.region : null;
    expect(region).toMatchObject({ x: 5616, y: 0, w: 64, h: 24 });
    const ship = zone.players[0];
    // Under the blocks (y ≈ 40), then up into the gap once the ship is past the left block.
    for (let i = 0; i < 3000 && ship.x < 5630; i++) {
      const y = ship.y - zone.camera.y;
      step(ship.state !== 'alive' ? 0 : y > 44 ? Action.Up : y < 36 ? Action.Down : 0);
    }
    expect(ship.x).toBeGreaterThanOrEqual(5630);
    for (let i = 0; i < 60 && zone.bonus.entered < 0; i++) step(Action.Up);
    expect(zone.bonus.entered).toBeGreaterThanOrEqual(0);
    expect(DB.stages[zone.bonus.enteredStage()].id).toBe('brine-grotto');
    // The warp: the grotto with the players carried in.
    for (let i = 0; i < 100 && stageOf(game) === 'zone-b'; i++) step(0);
    expect(stageOf(game)).toBe('brine-grotto');
    expect(flow.run.inBonus).toBe(true);
    const grotto = game.world;
    expect(grotto.stage?.stage.type).toBe('bonus');
    expect(grotto.weapons.loadouts[0].options).toBe(zone.weapons.loadouts[0].options);
    // Its clear is the zone's clear: the boss of zone B never comes.
    const bot = fourWayBot();
    for (let i = 0; i < 4000 && flow.stack.top?.id === 'game'; i++) step(bot.decide(game.world));
    expect(flow.stack.top?.id).toBe('stageClear');
    expect(game.world).toBe(grotto);
    expect(grotto.status).toBe('stageClear');
    expect(grotto.bosses.boss.specIndex).toBe(-1);
  }, 60_000);

  it('brings SPUME HERALD on the scrolling camera before GALVANIC MAW’s WARNING', () => {
    const game = createGame(createHeadlessPlatform(), { seed: 1, stage: 'zone-b' }, DB);
    game.world.debugFlags.godMode = true;
    const world = game.world;
    world.stage?.jumpTo(3700);
    let captain = false;
    let scrolled = false;
    for (let i = 0; i < 1200; i++) {
      const x = world.camera.x;
      game.step();
      game.events.clear();
      const herald = world.bosses.slots.find(
        (b) => b.role === BossRole.Captain && b.state === BossState.Fight,
      );
      if (herald !== undefined) {
        captain = true;
        if (world.camera.x > x) scrolled = true;
      }
    }
    expect(captain).toBe(true);
    expect(scrolled).toBe(true); // a captain never locks the scroll
    expect(world.status).toBe('playing');
    // Then the WARNING names the stage boss.
    world.stage?.jumpTo(9200);
    for (let i = 0; i < 600 && world.status === 'playing'; i++) {
      game.step();
      game.events.clear();
    }
    expect(world.status).toBe('bossWarning');
    expect(world.view.warning?.text).toContain('GALVANIC MAW');
  });

  it('makes DUNE EXPANSE’s sand worms rise out of the dunes they lay in', () => {
    const game = createGame(createHeadlessPlatform(), { seed: 1, stage: 'zone-c' }, DB);
    const world = game.world;
    world.debugFlags.godMode = true;
    world.stage?.jumpTo(4500);
    const worm = DB.enemyIndex.get('dune-worm');
    let lowest = Number.NEGATIVE_INFINITY;
    let highest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 900; i++) {
      game.step();
      game.events.clear();
      for (const e of world.enemies.enemies) {
        if (e.state !== EnemyState.Live || e.specIndex !== worm) continue;
        lowest = Math.max(lowest, e.y - world.camera.y);
        highest = Math.min(highest, e.y - world.camera.y);
      }
    }
    // From their holes low in the playfield up to well above the dunes.
    expect(lowest).toBeGreaterThan(120);
    expect(lowest - highest).toBeGreaterThan(60);
  });
});

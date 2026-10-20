/**
 * The M2-10 hidden bonus stages through the real scene flow on the shipped content (plan M2-10,
 * "bonus entrance / lock-out rules"): a game on the dev stage `bonus-range` (a single-stage run —
 * the host stage is not the campaign's start zone) with the full loadout and the 4-way bot at the
 * controls in god mode:
 *
 * - the bot shoots the ground window's three turrets, the `ground` entrance opens, and after the
 *   warp the game scene plays `bonus-vault` with the players carried in (score, lives, loadout);
 *   the bot collects the vault's capsules and its 1UP, and the vault's clear is the run's clear —
 *   the M1 stage-clear screen (the zone's boss skipped);
 * - a death in the vault brings the players back to `bonus-range` at the entrance's x, one ship
 *   down and the entrances locked: the digit window that would have opened stays shut.
 */
import {
  Action,
  BONUS_FAIL_TICKS,
  ENGINE_SPRITES,
  KNOWN_SCRIPT_IDS,
  PlayerHitCause,
  ShieldKind,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  loadContent,
  playerHit,
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
 * A flow game on the bonus range with the full loadout, god mode on.
 *
 * @param seed - The seed.
 * @returns The game, its flow and player 1's input.
 */
function start(seed: number): {
  game: Game;
  flow: SceneFlow;
  step: (held: number) => void;
} {
  const platform = createHeadlessPlatform();
  const game = createGame(platform, { seed, stage: 'bonus-range', loadout: 'full' }, DB, {
    scenes: 'game',
  });
  game.debug.godMode = true;
  const flow = game.scenes as SceneFlow;
  const player = platform.snapshot.players[0];
  return {
    game,
    flow,
    step(held: number): void {
      commitPlayerInput(player, held);
      game.step();
      game.events.clear();
    },
  };
}

/**
 * The id of the stage a game's World plays.
 *
 * @param game - The game.
 * @returns The stage id.
 */
const stageOf = (game: Game): string => game.world.stage?.stage.id ?? '';

describe('integration: hidden bonus stages in the scene flow (M2-10)', () => {
  it('opens the ground entrance, plays the vault with the players carried in, clears the run', () => {
    const { game, flow, step } = start(62);
    expect(flow.campaign).toBeNull();
    const range = game.world;
    let bot = fourWayBot();
    for (let i = 0; i < 4000 && stageOf(game) === 'bonus-range'; i++) step(bot.decide(game.world));
    expect(stageOf(game)).toBe('bonus-vault');
    expect(range.bonus.entered).toBeGreaterThanOrEqual(0);
    expect(range.enemies.stats.groundKilled).toBeGreaterThanOrEqual(3);
    expect(flow.run.inBonus).toBe(true);
    expect(flow.run.bonusReturnX).toBe(range.bonus.enteredX());
    // Carried in: the range's score, lives and loadout.
    const vault = game.world;
    expect(vault.scoring.board.scores[0].score).toBe(range.scoring.board.scores[0].score);
    expect(vault.players[0].lives).toBe(range.players[0].lives);
    expect(vault.weapons.loadouts[0].options).toBe(range.weapons.loadouts[0].options);
    expect(vault.players[0].state).toBe('entering');
    const lives = vault.players[0].lives;
    const extends0 = vault.scoring.board.scores[0].extendsEarned;
    bot = fourWayBot();
    for (let i = 0; i < 3000 && flow.stack.top?.id === 'game'; i++) step(bot.decide(game.world));
    expect(flow.stack.top?.id).toBe('stageClear');
    expect(game.world).toBe(vault);
    expect(vault.status).toBe('stageClear');
    // The 1UP: a life beyond the extends the vault's capsules paid for.
    const extendsGot = vault.scoring.board.scores[0].extendsEarned - extends0;
    expect(vault.players[0].lives - lives - extendsGot).toBeGreaterThanOrEqual(1);
    // The range's boss never came: the World that cleared was the vault.
    expect(vault.bosses.boss.specIndex).toBe(-1);
    step(0);
    expect(flow.stack.top?.id).toBe('stageClear');
    expect(flow.stageClear.zoneMode).toBe(false);
  }, 60_000);

  it('a death in the vault brings the ships back to the entrance, locked out', () => {
    const { game, flow, step } = start(62);
    const bot = fourWayBot();
    for (let i = 0; i < 4000 && stageOf(game) === 'bonus-range'; i++) step(bot.decide(game.world));
    expect(stageOf(game)).toBe('bonus-vault');
    const returnX = flow.run.bonusReturnX;
    const vault = game.world;
    for (let i = 0; i < 200 && vault.players[0].state !== 'alive'; i++) step(0);
    game.debug.godMode = false;
    // The full loadout's shield would take the hit: drop it.
    const shield = vault.players[0].shield;
    shield.kind = ShieldKind.None;
    shield.hits = 0;
    shield.podCount = 0;
    const lives = vault.players[0].lives;
    playerHit(vault.players[0], PlayerHitCause.Bullet, vault.tick, vault.debugFlags);
    step(0); // the World resolves the hit
    expect(vault.players[0].state).toBe('dying');
    for (let i = 0; i < BONUS_FAIL_TICKS + 2 && stageOf(game) === 'bonus-vault'; i++) step(0);
    expect(stageOf(game)).toBe('bonus-range');
    const back = game.world;
    expect(back).not.toBe(vault);
    expect(back.camera.x).toBeGreaterThanOrEqual(returnX);
    expect(back.camera.x).toBeLessThan(returnX + 10);
    expect(back.bonus.locked).toBe(true);
    expect(back.players[0].lives).toBe(lives - 1);
    expect(back.players[0].state).toBe('respawning');
    expect([flow.run.inBonus, flow.run.bonusLocked, flow.run.deaths]).toEqual([false, true, 1]);
    // The digit window (thousands digit 0 at x 2000) would open now: locked, it stays shut.
    game.debug.godMode = true;
    back.scoring.board.scores[0].score = 40_000;
    for (let i = 0; i < 2000 && back.camera.x < 2010; i++) step(Action.Up);
    expect(back.camera.x).toBeGreaterThanOrEqual(2000);
    expect(back.bonus.entered).toBe(-1);
    expect(stageOf(game)).toBe('bonus-range');
  }, 60_000);
});

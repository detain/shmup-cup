/**
 * Edge cases of the final zones H and I through the real game on the shipped content (plan M2-14):
 *
 * - **every practice start** (the scene flow's `startPractice`) at every checkpoint of IRON CITADEL
 *   and ABYSSAL THRONE puts the camera at the checkpoint and flies the ship in to open space (its
 *   terrain box never in rock — the piston hall's moving floors and ceilings included) inside the
 *   view;
 * - **the stage skip** into zone H lands before the parade's first echo (the skip stops before a
 *   `boss` event too), BULWARK ECHO fighting inside the view; into zone I, before the ABYSS ARK's
 *   WARNING — the raid's camera then follows the ARK;
 * - **an echo that outlasts its time limit** leaves without the `bossEscaped` ending flag (the
 *   parade's echoes are captains: only a stage boss's escape counts), the parade going on;
 * - **the ARK's escape through the shipped campaign** (the M2-14 review fix): a run that lost no
 *   ship and let the ARK sail off after its 90-s time limit ends with *THE FLAGSHIP SLIPS AWAY* —
 *   never *THE DEEP IS STILL*, whose epilogue sinks a HOLLOW KING who never showed — and the
 *   deep's scene draws the ARK sailing off under the dawn of a flawless run, to the ending theme.
 */
import {
  Action,
  BossState,
  DrawOp,
  ENGINE_SPRITES,
  EndingFlag,
  KNOWN_SCRIPT_IDS,
  MUSIC_CUES,
  PLAYFIELD_H,
  PLAYFIELD_W,
  RunFlag,
  SimEventKind,
  TerrainType,
  boxHitsTerrain,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  loadContent,
  resolveUiSprites,
  type ContentDb,
  type Game,
  type SceneFlow,
  type World,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

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
 * Steps a game with its events dropped.
 *
 * @param game - The game.
 * @param ticks - Ticks.
 */
function steps(game: Game, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    game.step();
    game.events.clear();
  }
}

/**
 * Steps a game until a condition holds (or fails the test after `limit` ticks).
 *
 * @param game - The game.
 * @param done - The condition.
 * @param limit - Most ticks.
 * @returns Ticks stepped.
 */
function stepUntil(game: Game, done: () => boolean, limit: number): number {
  let t = 0;
  for (; t < limit && !done(); t++) {
    game.step();
    game.events.clear();
  }
  expect(done(), `not reached in ${String(limit)} ticks`).toBe(true);
  return t;
}

/**
 * Checks that player 1 flies in open space inside the view.
 *
 * @param world - The World.
 * @param where - A label for the failure message.
 */
function expectInOpenSpace(world: World, where: string): void {
  const ship = world.players[0];
  const map = world.terrain;
  expect(ship.state, where).toBe('alive');
  if (map !== null) {
    const box = world.ship.terrainBox;
    expect(boxHitsTerrain(map, ship.x, ship.y, box.hw, box.hh), where).toBe(TerrainType.Empty);
  }
  expect(ship.x - world.camera.x, where).toBeGreaterThan(0);
  expect(ship.x - world.camera.x, where).toBeLessThan(PLAYFIELD_W);
  expect(ship.y - world.camera.y, where).toBeGreaterThan(8);
  expect(ship.y - world.camera.y, where).toBeLessThan(PLAYFIELD_H - 8);
}

/**
 * The content index of an enemy id.
 *
 * @param id - Enemy id.
 * @returns Its index.
 */
function enemyIndex(id: string): number {
  const index = DB.enemyIndex.get(id);
  if (index === undefined) throw new Error('no enemy ' + id);
  return index;
}

describe('integration: zones H and I, edge cases (M2-14 tests)', () => {
  const starts: [string, number, number][] = [];
  for (const [letter, stageId] of [
    ['h', 'zone-h'],
    ['i', 'zone-i'],
  ] as const) {
    const stage = DB.stages[DB.stageIndex.get(stageId) ?? -1];
    stage.checkpoints.forEach((checkpoint, i) => starts.push([letter, i, checkpoint.x]));
  }

  it.each(starts)(
    'practice start in zone %s at checkpoint %i (x %i): the ship flown in to open space',
    (letter, checkpoint, x) => {
      const platform = createHeadlessPlatform();
      const game = createGame(platform, { seed: 5, stage: 'zone-a' }, DB, { scenes: 'game' });
      game.debug.godMode = true;
      const flow = game.scenes as SceneFlow;
      expect(flow.startPractice(letter, checkpoint)).toBe(true);
      commitPlayerInput(platform.snapshot.players[0], 0);
      game.step();
      game.events.clear();
      const world = game.world;
      expect(world.stage?.stage.id).toBe('zone-' + letter);
      expect(Math.floor(world.camera.x)).toBe(x);
      expect(world.camera.y).toBe(0);
      // A while in open space: the fly-in, then the pistons swinging round the ship.
      for (let k = 0; k < 4; k++) {
        steps(game, 45);
        expectInOpenSpace(world, `zone ${letter} checkpoint ${String(checkpoint)} +${String(k)}`);
      }
    },
  );

  it('checks four checkpoints per zone', () => {
    expect(starts).toHaveLength(8);
  });

  it('skips zone H to the parade: BULWARK ECHO fights inside the view, the ship in open space', () => {
    const game = createGame(
      createHeadlessPlatform(),
      { seed: 9, stage: 'zone-h', stageSkip: 'boss', loadout: 'full' },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    steps(game, 90);
    expectInOpenSpace(world, 'after the skip');
    expect(world.camera.x).toBeGreaterThan(4400);
    expect(world.camera.x).toBeLessThan(4520);
    const boss = world.bosses.boss;
    stepUntil(
      game,
      () => boss.specIndex === enemyIndex('echo-bulwark') && boss.state === BossState.Fight,
      1500,
    );
    for (let i = 0; i < boss.partCount; i++) {
      const p = boss.parts[i];
      expect(p.x - world.camera.x, p.name).toBeGreaterThan(0);
      expect(p.x - world.camera.x, p.name).toBeLessThan(PLAYFIELD_W);
      expect(p.y - world.camera.y, p.name).toBeGreaterThan(0);
      expect(p.y - world.camera.y, p.name).toBeLessThan(PLAYFIELD_H);
    }
    expectInOpenSpace(world, 'while the echo fights');
  });

  it('skips zone I to the ABYSS ARK: the raid`s camera follows it', () => {
    const game = createGame(
      createHeadlessPlatform(),
      { seed: 9, stage: 'zone-i', stageSkip: 'boss', loadout: 'full' },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    steps(game, 90);
    expectInOpenSpace(world, 'after the skip');
    expect(world.camera.x).toBeGreaterThan(8800);
    expect(world.camera.x).toBeLessThan(9000);
    const boss = world.bosses.boss;
    stepUntil(
      game,
      () => boss.specIndex === enemyIndex('abyss-ark') && boss.state === BossState.Fight,
      2000,
    );
    steps(game, 60);
    expect(world.stage?.following).toBe(world.bosses.raidCamera);
    expectInOpenSpace(world, 'during the raid');
  });

  it('lets an echo outlast its time limit without the bossEscaped flag; the parade goes on', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(
      platform,
      { seed: 9, stage: 'zone-h', stageSkip: 'boss', autofire: false, remoteMode: false },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    const echo = enemyIndex('echo-bulwark');
    const spec = DB.enemies[echo].boss;
    expect(spec?.role).toBe('captain');
    expect(spec?.timeLimit).toBe(960);
    const slot = (): (typeof world.bosses.slots)[number] | undefined =>
      world.bosses.slots.find((b) => b.specIndex === echo && b.state !== BossState.None);
    stepUntil(game, () => slot()?.state === BossState.Fight, 1500);
    const fought = world.tick;
    // Never shot (no fire held, no autofire): it leaves when its limit runs out.
    stepUntil(game, () => slot() === undefined || slot()?.escaped === true, 2000);
    expect(world.tick - fought).toBeGreaterThanOrEqual(960);
    expect(world.endingFlags & EndingFlag.BossEscaped).toBe(0);
    // The next echo still comes.
    stepUntil(
      game,
      () =>
        world.bosses.slots.some(
          (b) => b.specIndex === enemyIndex('echo-maw') && b.state === BossState.Fight,
        ),
      3000,
    );
    expect(world.endingFlags).toBe(0);
  });

  it('ends a flawless run whose ARK escaped with THE FLAGSHIP SLIPS AWAY, the ARK sailing off at dawn', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(
      platform,
      { seed: 21, stage: 'zone-a', stageSkip: 'boss', autofire: false, remoteMode: false },
      DB,
      { scenes: 'game' },
    );
    game.debug.godMode = true;
    const flow = game.scenes as SceneFlow;
    const campaign = flow.campaign;
    if (campaign === null) throw new Error('no campaign');
    const zone = (id: string): number => campaign.zones.findIndex((z) => z.id === id);
    const player = platform.snapshot.players[0];
    const music: number[] = [];
    /**
     * One tick with a held mask, collecting the music cues.
     *
     * @param held - Actions held.
     */
    const step = (held: number): void => {
      commitPlayerInput(player, held);
      game.step();
      game.events.drain((e) => {
        if (e.kind === SimEventKind.Music) music.push(e.id);
      });
    };
    /**
     * Steps until a scene is on top.
     *
     * @param id - Scene id.
     * @param limit - Most ticks.
     */
    const until = (id: string, limit: number): void => {
      for (let t = 0; t < limit && flow.stack.top?.id !== id; t++) step(0);
      expect(flow.stack.top?.id).toBe(id);
    };
    // Zone A: skipped to its boss, which the test shoots down part by part.
    expect(flow.stack.top?.id).toBe('game');
    const boss = game.world.bosses.boss;
    for (let t = 0; t < 3000 && boss.state !== BossState.Fight; t++) step(0);
    expect(boss.state).toBe(BossState.Fight);
    for (let t = 0; t < 600 && boss.state === BossState.Fight; t++) {
      for (let i = 0; i < boss.partCount; i++) game.world.bosses.damagePart(i, 9999, 0);
      step(0);
    }
    // The run jumps ahead: the map after this clear offers zone G's exits (H and I).
    flow.run.route.length = 0;
    for (const id of ['a', 'c', 'e', 'g']) flow.run.route.push(zone(id));
    flow.run.zone = zone('g');
    until('stageClear', 2000);
    step(Action.Confirm);
    step(0);
    until('map', 600);
    for (let t = 0; t < 10; t++) step(0);
    step(Action.Down); // the lower exit: ABYSSAL THRONE
    step(0);
    step(Action.Confirm);
    step(0);
    until('game', 600);
    const world = game.world;
    expect(world.stage?.stage.id).toBe('zone-i');
    // Zone I, skipped to the ARK: the ship holds its fire; the ARK outlasts it and sails off.
    until('stageClear', 12000);
    const ark = world.bosses.slots.find((b) => b.specIndex === enemyIndex('abyss-ark'));
    expect(ark?.escaped).toBe(true);
    expect(world.bosses.slots.some((b) => b.specIndex === enemyIndex('hollow-king'))).toBe(false);
    expect(world.endingFlags & EndingFlag.BossEscaped).toBe(EndingFlag.BossEscaped);
    const from = music.length;
    step(Action.Confirm);
    step(0);
    expect(flow.stack.top?.id).toBe('ending');
    // Flawless and escaped: the escape decides.
    const flags = flow.run.endingFlags;
    expect(flags & RunFlag.NoDeath).toBe(RunFlag.NoDeath);
    expect(flags & RunFlag.BossEscaped).toBe(RunFlag.BossEscaped);
    expect(flow.run.ending?.id).toBe('throne-escape');
    expect(flow.run.ending?.name).toBe('THE FLAGSHIP SLIPS AWAY');
    expect(flow.run.ending?.text.join(' ')).not.toMatch(/HOLLOW KING SINKS/);
    expect(music.slice(from)).toContain(MUSIC_CUES.Ending);
    // The deep's scene: the ARK sails off to the right, level, under the dawn sun.
    const sprites = resolveUiSprites(DB);
    /**
     * Where a sprite is drawn in the frame's UI list.
     *
     * @param sprite - Sprite id.
     * @returns `[x, y]` per command.
     */
    const at = (sprite: number): Array<[number, number]> => {
      const ui = game.renderFrame().ui;
      const out: Array<[number, number]> = [];
      for (let i = 0; i < ui.count; i++) {
        if (ui.op[i] === DrawOp.Sprite && ui.ref[i] === sprite) out.push([ui.x[i], ui.y[i]]);
      }
      return out;
    };
    expect(flow.ending.scene).toBe(2);
    expect(at(sprites.endingSun)).toHaveLength(1);
    const before = at(sprites.endingArk)[0];
    for (let t = 0; t < 120; t++) step(0);
    const after = at(sprites.endingArk)[0];
    expect(after[1]).toBe(before[1]);
    expect(after[0]).toBeGreaterThan(before[0]);
    // The escape's epilogue, line by line.
    const shown = flow.ending.shown;
    expect(shown).toBeGreaterThan(0);
    const lines = flow.run.ending?.text ?? [];
    const ui = game.renderFrame().ui;
    const texts: string[] = [];
    for (let i = 0; i < ui.count; i++)
      if (ui.op[i] === DrawOp.Text) texts.push(ui.strings[ui.ref[i]]);
    expect(texts).toEqual(lines.slice(0, shown));
  }, 60_000);
});

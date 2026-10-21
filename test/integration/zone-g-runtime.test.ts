/**
 * Zone G through the real game on the shipped content (plan M2-13, R5-P.P5e's split of
 * `zones-fg-runtime.test.ts` and `zones-fg-runtime-edge.test.ts`; zone F's cases live in
 * `zone-f-runtime.test.ts`):
 *
 * - **PRISM LABYRINTH's hidden bonus stage.** A practice run of zone G from its second checkpoint
 *   (the scene flow's `startPractice`, which prepares zone G's music set): every turret of the prism
 *   gallery shot down by the player — the `ground` entrance opens when its window closes — and
 *   after the warp the game scene plays `glimmer-cache` (GLIMMER CACHE) with the players carried
 *   in; its clear is the zone's clear (FACET MONARCH is skipped).
 * - **PRISM LABYRINTH's cube rush.** The rush's cubes that hit the crystal pillars become the
 *   tileset's cube tiles — the rush stacks into walls; a checkpoint restart rolls them back.
 * - **every practice start** (the scene flow's `startPractice`) at every checkpoint of PRISM
 *   LABYRINTH puts the camera at the checkpoint and flies the ship in to open space (its terrain
 *   box never in rock, tissue or crystal) inside the view;
 * - **the stage skip** into zone G (`stageSkip: 'boss'`, the debug skip the playtest uses)
 *   brings FACET MONARCH in, fighting inside the view with the ship in open space;
 * - **an Arcade restart in the prism gallery** (a death after its `ground` window armed) disarms
 *   the entrance — the camera goes back to 2,200, before the window — and it arms afresh at 2,300:
 *   the turrets shot before the death count for nothing, three of the four shot after it keep it
 *   shut, all four open it;
 * - **a death in GLIMMER CACHE** sends the ships back into zone G at the gallery's entrance with
 *   the entrances locked ("dying locks you out"): every gallery turret shot down again opens
 *   nothing.
 */
import {
  BONUS_FAIL_TICKS,
  BodyAnchor,
  BossState,
  ENGINE_SPRITES,
  EnemyFlag,
  EnemyState,
  KNOWN_SCRIPT_IDS,
  PLAYFIELD_H,
  PLAYFIELD_W,
  PlayerHitCause,
  ShieldKind,
  SimEventKind,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  loadContent,
  playerHit,
  spawnPlayer,
  type ContentDb,
  type Game,
  type SceneFlow,
  type World,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';
import { fourWayBot } from '../playtest/four-way-bot.js';
import { v1x, v1rel } from '../../packages/core/test/helpers/v1-port.js';
import { crash, expectCameraAt, expectInOpenSpace, steps, stepUntil } from './zones/helpers.js';

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

/**
 * The 1-based id of a tile of a World's tileset by name.
 *
 * @param world - The World.
 * @param name - Tile name.
 * @returns The tile id (0 = none).
 */
function tileId(world: World, name: string): number {
  const tileset = DB.tilesets.find((t) => t.id === world.stage?.stage.tilemap?.tileset);
  return (tileset?.tiles.findIndex((t) => t.name === name) ?? -1) + 1;
}

/**
 * The cells of a World's terrain that hold a tile its stage did not place there.
 *
 * @param world - The World.
 * @param tile - Tile id.
 * @returns How many.
 */
function placed(world: World, tile: number): number {
  const destructible = world.gimmicks.destructible;
  if (destructible === null) return 0;
  let count = 0;
  const tiles = destructible.map.tiles;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === tile && destructible.pristine[i] !== tile) count++;
  }
  return count;
}

/**
 * Shoots down (kills as the player's) every ground enemy on screen — while `spare` says no.
 *
 * @param world - The World.
 * @param spare - Whether to leave the next one standing, given how many this call shot so far.
 * @returns Ground enemies killed.
 */
function shootGround(world: World, spare: (shot: number) => boolean = () => false): number {
  let shot = 0;
  for (const e of world.enemies.enemies) {
    if (e.state !== EnemyState.Live || e.anchor === BodyAnchor.Air) continue;
    if ((e.flags & EnemyFlag.OnScreen) === 0 || spare(shot)) continue;
    if (world.enemies.kill(e, 0)) shot++;
  }
  return shot;
}

describe('integration: zones F and G in the game (M2-13)', () => {
  it('opens PRISM LABYRINTH’s gallery entrance when every turret is shot and plays GLIMMER CACHE', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(platform, { seed: 3, stage: 'zone-a', loadout: 'full' }, DB, {
      scenes: 'game',
    });
    game.debug.godMode = true;
    const flow = game.scenes as SceneFlow;
    const prepared: number[] = [];
    expect(flow.startPractice('g', 1)).toBe(true);
    const player = platform.snapshot.players[0];
    const step = (held: number): void => {
      commitPlayerInput(player, held);
      game.step();
      game.events.drain((e) => {
        if (e.kind === SimEventKind.PrepareStage) prepared.push(e.id);
      });
    };
    step(0);
    expect(stageOf(game)).toBe('zone-g');
    expect(prepared).toContain(DB.stageIndex.get('zone-g'));
    const zone = game.world;
    expectCameraAt(zone, v1x(2200));
    const entrance = zone.stage?.stage.events.find((e) => e.type === 'bonus');
    expect(entrance?.type === 'bonus' ? entrance.entrance : '').toBe('ground');
    const until = entrance?.type === 'bonus' ? entrance.until : 0;
    // Shoot down every ground enemy of the gallery as it comes on screen (the player's kills).
    // The count rides the stats, not the kill calls: in the ported world the ship's shots can
    // destroy a turret in the very tick its OnScreen flag first rises (checkView before the
    // damage phase of one step), which a flag-polling loop can never see. groundKilled counts
    // every player kill of a ground enemy either way.
    const killed = zone.enemies.stats.groundKilled;
    for (let i = 0; i < 3000 && zone.camera.x <= until; i++) {
      for (const e of zone.enemies.enemies) {
        if (e.state !== EnemyState.Live || e.anchor === BodyAnchor.Air) continue;
        if ((e.flags & EnemyFlag.OnScreen) !== 0) zone.enemies.kill(e, 0);
      }
      step(0);
    }
    expect(zone.enemies.stats.groundKilled - killed).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < 10 && zone.bonus.entered < 0; i++) step(0);
    expect(zone.bonus.entered).toBeGreaterThanOrEqual(0);
    expect(DB.stages[zone.bonus.enteredStage()].id).toBe('glimmer-cache');
    // The warp: the cache with the players carried in.
    for (let i = 0; i < 100 && stageOf(game) === 'zone-g'; i++) step(0);
    expect(stageOf(game)).toBe('glimmer-cache');
    expect(flow.run.inBonus).toBe(true);
    const cache = game.world;
    expect(cache.stage?.stage.type).toBe('bonus');
    expect(cache.weapons.loadouts[0].options).toBe(zone.weapons.loadouts[0].options);
    // Its clear is the zone's clear: FACET MONARCH never comes.
    const bot = fourWayBot();
    for (let i = 0; i < 4000 && flow.stack.top?.id === 'game'; i++) step(bot.decide(game.world));
    expect(flow.stack.top?.id).toBe('stageClear');
    expect(game.world).toBe(cache);
    expect(cache.status).toBe('stageClear');
    expect(cache.bosses.boss.specIndex).toBe(-1);
  }, 60_000);

  /**
   * Plays zone G from a checkpoint through the prism gallery, shooting nothing until the gallery's
   * `ground` entrance arms, then every ground enemy on screen — sparing the first ceiling turret
   * when asked — until its window has closed.
   *
   * @param checkpoint - Checkpoint to start from.
   * @param spare - Whether a gallery turret is left standing.
   * @returns The entrance that opened (-1 = none).
   */
  function playGallery(checkpoint: number, spare: boolean): number {
    const game = createGame(
      createHeadlessPlatform(),
      { seed: 1, stage: 'zone-g', autofire: false, remoteMode: false },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    world.stage?.restartAt(checkpoint);
    spawnPlayer(world.players[0], world.camera);
    const entrance = world.stage?.stage.events.find((e) => e.type === 'bonus');
    const armX = entrance?.x ?? 0;
    const until = entrance?.type === 'bonus' ? entrance.until : 0;
    expect(world.camera.x).toBeLessThan(armX);
    let spared = -1;
    for (let i = 0; i < 6000 && world.camera.x <= until + 60; i++) {
      if (world.bonus.armed[0] === 1) {
        for (const e of world.enemies.enemies) {
          if (e.state !== EnemyState.Live || e.anchor === BodyAnchor.Air) continue;
          if ((e.flags & EnemyFlag.OnScreen) === 0) continue;
          // Spare the gallery's first ceiling turret; shoot down every other one.
          if (spare && e.anchor === BodyAnchor.Ceiling && (spared < 0 || spared === e.slot)) {
            spared = e.slot;
            continue;
          }
          world.enemies.kill(e, 0);
        }
      }
      game.step();
      game.events.clear();
    }
    expect(world.camera.x).toBeGreaterThan(until);
    if (spare) expect(spared).toBeGreaterThanOrEqual(0);
    return world.bonus.entered;
  }

  // From the start, the turret before the gallery has left the screen when the window arms: it
  // cannot be shot in the gallery turret's place (a kill of it would count toward the window).
  it('keeps the gallery entrance shut when a turret survives its window (checkpoint 0)', () => {
    expect(playGallery(0, true)).toBe(-1);
  });

  it('keeps the gallery entrance shut when a turret survives its window (checkpoint 1)', () => {
    expect(playGallery(1, true)).toBe(-1);
  });

  it('opens the gallery entrance from the zone’s start when every gallery turret is shot', () => {
    expect(playGallery(0, false)).toBe(0);
  });

  it('stacks PRISM LABYRINTH’s cube rush into its crystal pillars; a restart rolls the cubes back', () => {
    const game = createGame(
      createHeadlessPlatform(),
      { seed: 1, stage: 'zone-g', autofire: false, remoteMode: false },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    world.stage?.restartAt(2);
    spawnPlayer(world.players[0], world.camera);
    const cube = tileId(world, 'cube');
    let most = 0;
    for (let i = 0; i < 2400; i++) {
      game.step();
      game.events.clear();
      if (i % 30 === 0) most = Math.max(most, placed(world, cube));
    }
    expect(most).toBeGreaterThanOrEqual(3);
    world.stage?.restartAt(2);
    game.step();
    game.events.clear();
    expect(placed(world, cube)).toBe(0);
  });
});

describe('integration: zones F and G, edge cases (M2-13)', () => {
  const starts: [string, number, number][] = [];
  for (const [letter, stageId] of [['g', 'zone-g']] as const) {
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
      expectCameraAt(world, x);
      expect(world.camera.y).toBe(0);
      steps(game, 90);
      expectInOpenSpace(world, `zone ${letter} checkpoint ${String(checkpoint)}`);
    },
  );

  it('checks four checkpoints per zone', () => {
    expect(starts).toHaveLength(4);
  });

  it.each([['zone-g', 'facet-monarch']])(
    'skips %s to its boss: %s fighting inside the view, the ship in open space',
    (stage, id) => {
      const game = createGame(
        createHeadlessPlatform(),
        { seed: 9, stage, stageSkip: 'boss', loadout: 'full' },
        DB,
      );
      const world = game.world;
      world.debugFlags.godMode = true;
      steps(game, 90);
      expectInOpenSpace(world, 'after the skip');
      const boss = world.bosses.boss;
      stepUntil(
        game,
        () => boss.specIndex === DB.enemyIndex.get(id) && boss.state === BossState.Fight,
        1500,
      );
      expect(boss.screenY).toBeGreaterThanOrEqual(40);
      expect(boss.screenY).toBeLessThanOrEqual(PLAYFIELD_H - 40);
      // Every part of it — the tentacles and arms too — drawn inside the view.
      for (let i = 0; i < boss.partCount; i++) {
        const p = boss.parts[i];
        expect(p.x - world.camera.x, p.name).toBeGreaterThan(0);
        expect(p.x - world.camera.x, p.name).toBeLessThan(PLAYFIELD_W);
        expect(p.y - world.camera.y, p.name).toBeGreaterThan(0);
        expect(p.y - world.camera.y, p.name).toBeLessThan(PLAYFIELD_H);
      }
      expectInOpenSpace(world, 'while the boss fights');
    },
  );

  /**
   * Zone G under the Arcade penalty from the prism gallery's checkpoint: the gallery's turrets
   * shot as they come on screen while its window is armed, two of them before a death, then —
   * after the restart at the checkpoint — `shootAfter` of them (the others spared).
   *
   * @param shootAfter - Gallery ground enemies shot after the restart (the rest spared).
   * @returns The entrance that opened (-1 = none) and what the run saw.
   */
  function galleryRestart(shootAfter: number): {
    entered: number;
    before: number;
    after: number;
    disarmed: boolean;
    cameraBack: number;
  } {
    const game = createGame(
      createHeadlessPlatform(),
      {
        seed: 4,
        stage: 'zone-g',
        deathPenalty: 'arcade',
        startingLives: 3,
        autofire: false,
        remoteMode: false,
      },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    world.stage?.restartAt(1);
    spawnPlayer(world.players[0], world.camera);
    const entrance = world.stage?.stage.events.find((e) => e.type === 'bonus');
    const until = entrance?.type === 'bonus' ? entrance.until : 0;
    // Two turrets shot while the window is armed.
    let before = 0;
    for (let i = 0; i < 3000 && before < 2; i++) {
      if (world.bonus.armed[0] === 1) before += shootGround(world);
      game.step();
      game.events.clear();
    }
    crash(game);
    const ship = world.players[0];
    stepUntil(game, () => ship.state === 'alive', 600);
    const cameraBack = world.camera.x;
    const disarmed = world.bonus.armed[0] === 0;
    // The window again: shoot the first `shootAfter` ground enemies, spare the rest.
    let after = 0;
    for (let i = 0; i < 4000 && world.camera.x <= until + v1rel(60); i++) {
      if (world.bonus.armed[0] === 1) after += shootGround(world, (n) => after + n >= shootAfter);
      game.step();
      game.events.clear();
    }
    return { entered: world.bonus.entered, before, after, disarmed, cameraBack };
  }

  it('re-arms the prism gallery afresh after an Arcade restart: all four turrets open it', () => {
    const run = galleryRestart(99);
    expect(run.before).toBe(2);
    expect(run.disarmed).toBe(true);
    expect(run.cameraBack).toBeGreaterThanOrEqual(v1x(2200));
    expect(run.cameraBack).toBeLessThan(v1x(2300));
    expect(run.after).toBeGreaterThanOrEqual(4);
    expect(run.entered).toBe(0);
  });

  it('keeps the re-armed gallery shut with a turret spared, however many were shot before the death', () => {
    const run = galleryRestart(3);
    expect(run.before).toBe(2);
    expect(run.after).toBe(3);
    expect(run.entered).toBe(-1);
  });

  it('sends a death in GLIMMER CACHE back to the prism gallery, locked out', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(platform, { seed: 3, stage: 'zone-a', loadout: 'full' }, DB, {
      scenes: 'game',
    });
    game.debug.godMode = true;
    const flow = game.scenes as SceneFlow;
    expect(flow.startPractice('g', 1)).toBe(true);
    const player = platform.snapshot.players[0];
    const step = (): void => {
      commitPlayerInput(player, 0);
      game.step();
      game.events.clear();
    };
    step();
    const zone = game.world;
    for (let i = 0; i < 3000 && zone.bonus.entered < 0; i++) {
      if (zone.bonus.armed[0] === 1) shootGround(zone);
      step();
    }
    for (let i = 0; i < 100 && stageOf(game) === 'zone-g'; i++) step();
    expect(stageOf(game)).toBe('glimmer-cache');
    const returnX = flow.run.bonusReturnX;
    expect(returnX).toBe(v1x(2300));
    const cache = game.world;
    for (let i = 0; i < 200 && cache.players[0].state !== 'alive'; i++) step();
    game.debug.godMode = false;
    const shield = cache.players[0].shield;
    shield.kind = ShieldKind.None;
    shield.hits = 0;
    shield.podCount = 0;
    const lives = cache.players[0].lives;
    playerHit(cache.players[0], PlayerHitCause.Bullet, cache.tick, cache.debugFlags);
    step();
    expect(cache.players[0].state).toBe('dying');
    for (let i = 0; i < BONUS_FAIL_TICKS + 2 && stageOf(game) === 'glimmer-cache'; i++) step();
    expect(stageOf(game)).toBe('zone-g');
    const back = game.world;
    expect(back).not.toBe(zone);
    expect(back.camera.x).toBeGreaterThanOrEqual(returnX);
    expect(back.camera.x).toBeLessThan(returnX + 10);
    expect(back.bonus.locked).toBe(true);
    expect(back.players[0].lives).toBe(lives - 1);
    expect([flow.run.inBonus, flow.run.bonusLocked]).toEqual([false, true]);
    // Every gallery turret shot down again: the locked entrance stays shut. Counted through the
    // stats (the ship's shots can take a turret in the tick it first shows — see the runtime
    // suite's note), as the entry loop's flag test cannot see those.
    game.debug.godMode = true;
    const killed = back.enemies.stats.groundKilled;
    for (let i = 0; i < 3000 && back.camera.x <= v1x(3160); i++) {
      shootGround(back);
      step();
    }
    expect(back.enemies.stats.groundKilled - killed).toBeGreaterThanOrEqual(4);
    expect(back.bonus.entered).toBe(-1);
    expect(stageOf(game)).toBe('zone-g');
  }, 60_000);
});

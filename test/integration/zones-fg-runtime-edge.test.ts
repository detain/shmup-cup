/**
 * Edge cases of zones F and G through the real game on the shipped content (plan M2-13), beyond
 * `zones-fg-runtime.test.ts`:
 *
 * - **every practice start** (the scene flow's `startPractice`) at every checkpoint of CELL VAULT
 *   and PRISM LABYRINTH puts the camera at the checkpoint and flies the ship in to open space (its
 *   terrain box never in rock, tissue or crystal) inside the view;
 * - **the stage skip** into either zone (`stageSkip: 'boss'`, the debug skip the playtest uses)
 *   brings MANTLE REGENT / FACET MONARCH in, fighting inside the view with the ship in open space;
 * - **an Arcade restart in the tissue passage** (a death after the checkpoint at 2,200) rolls the
 *   regenerating walls back at once: every tissue cell shot away stands again when the ship
 *   returns, long before a cell's own `regen` would have grown it back;
 * - **an Arcade restart in the prism gallery** (a death after its `ground` window armed) disarms
 *   the entrance — the camera goes back to 2,200, before the window — and it arms afresh at 2,300:
 *   the turrets shot before the death count for nothing, three of the four shot after it keep it
 *   shut, all four open it;
 * - **a death in GLIMMER CACHE** sends the ships back into zone G at the gallery's entrance with
 *   the entrances locked ("dying locks you out"): every gallery turret shot down again opens
 *   nothing;
 * - **MANTLE REGENT's launched cells** (its second and third phases launch its `minion`, the
 *   chasing cell): none in the first phase, then one out of the eye inside the view every 200
 *   ticks.
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
  TerrainType,
  boxHitsTerrain,
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
 * Checks that player 1 flies in open space inside the view: alive, its terrain box clear of rock
 * and of every destructible tile, inside the playfield.
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
 * Counts the cells of a World's terrain holding a tile.
 *
 * @param world - The World.
 * @param tile - Tile id.
 * @returns How many.
 */
function cellsOf(world: World, tile: number): number {
  const map = world.terrain;
  if (map === null) return 0;
  let n = 0;
  for (let i = 0; i < map.tiles.length; i++) if (map.tiles[i] === tile) n++;
  return n;
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

/**
 * Crashes player 1 (god mode off for the hit, back on after) and waits until it flies again.
 *
 * @param game - The game.
 */
function crash(game: Game): void {
  const world = game.world;
  const ship = world.players[0];
  stepUntil(game, () => ship.state === 'alive' && ship.invulnTicks === 0, 400);
  world.debugFlags.godMode = false;
  expect(playerHit(ship, PlayerHitCause.Terrain, world.tick, world.debugFlags)).toBe(true);
  game.step();
  game.events.clear();
  expect(ship.state).toBe('dying');
  world.debugFlags.godMode = true;
}

describe('integration: zones F and G, edge cases (M2-13)', () => {
  const starts: [string, number, number][] = [];
  for (const [letter, stageId] of [
    ['f', 'zone-f'],
    ['g', 'zone-g'],
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
      steps(game, 90);
      expectInOpenSpace(world, `zone ${letter} checkpoint ${String(checkpoint)}`);
    },
  );

  it('checks four checkpoints per zone', () => {
    expect(starts).toHaveLength(8);
  });

  it.each([
    ['zone-f', 'mantle-regent'],
    ['zone-g', 'facet-monarch'],
  ])('skips %s to its boss: %s fighting inside the view, the ship in open space', (stage, id) => {
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
  });

  it('rolls CELL VAULT’s tissue walls back at an Arcade restart, before they could grow back', () => {
    const game = createGame(
      createHeadlessPlatform(),
      {
        seed: 11,
        stage: 'zone-f',
        deathPenalty: 'arcade',
        startingLives: 3,
        autofire: false,
        remoteMode: false,
      },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    const tissue = tileId(world, 'tissue');
    const full = cellsOf(world, tissue);
    expect(full).toBeGreaterThan(70);
    const destructible = world.gimmicks.destructible;
    expect(destructible).not.toBeNull();
    if (destructible === null) return;
    world.stage?.jumpTo(2700);
    spawnPlayer(world.players[0], world.camera);
    stepUntil(game, () => world.camera.x >= 2800, 400);
    // Shoot open every tissue cell of the first three walls (world x < 3,300).
    const map = destructible.map;
    let broken = 0;
    for (let i = 0; i < map.tiles.length; i++) {
      if (map.tiles[i] !== tissue || (i % map.cols) * 8 >= 3300) continue;
      for (let k = 0; k < 5 && map.tiles[i] !== 0; k++) {
        destructible.hit((i % map.cols) * 8 + 4, Math.floor(i / map.cols) * 8 + 4, 1);
      }
      broken++;
    }
    expect(broken).toBeGreaterThan(20);
    expect(cellsOf(world, tissue)).toBe(full - broken);
    const brokeAt = world.tick;
    crash(game);
    const ship = world.players[0];
    stepUntil(game, () => ship.state === 'alive', 600);
    // Back at the checkpoint at 2,200, every cell standing again — well before the tile's regen.
    const regen = DB.tilesets.find((t) => t.id === 'terrain-vault')?.tiles[tissue - 1]?.regen ?? 0;
    expect(world.tick - brokeAt).toBeLessThan(regen);
    expect(ship.lives).toBe(2);
    expect(world.camera.x).toBeGreaterThanOrEqual(2200);
    expect(world.camera.x).toBeLessThan(2500);
    expect(cellsOf(world, tissue)).toBe(full);
    expect(destructible.destroyed).toBe(0);
    expectInOpenSpace(world, 'after the restart');
  });

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
    for (let i = 0; i < 4000 && world.camera.x <= until + 60; i++) {
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
    expect(run.cameraBack).toBeGreaterThanOrEqual(2200);
    expect(run.cameraBack).toBeLessThan(2300);
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
    expect(returnX).toBe(2300);
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
    // Every gallery turret shot down again: the locked entrance stays shut.
    game.debug.godMode = true;
    let shot = 0;
    for (let i = 0; i < 3000 && back.camera.x <= 3160; i++) {
      shot += shootGround(back);
      step();
    }
    expect(shot).toBeGreaterThanOrEqual(4);
    expect(back.bonus.entered).toBe(-1);
    expect(stageOf(game)).toBe('zone-g');
  }, 60_000);

  it('launches MANTLE REGENT’s chasing cells from its eye inside the view, launchTicks apart', () => {
    const game = createGame(
      createHeadlessPlatform(),
      { seed: 6, stage: 'zone-f', stageSkip: 'boss', autofire: false, remoteMode: false },
      DB,
    );
    const world = game.world;
    world.debugFlags.godMode = true;
    const boss = world.bosses.boss;
    stepUntil(game, () => boss.state === BossState.Fight, 1500);
    // Into the second phase: a tentacle broken (none launched before).
    const root = boss.parts.findIndex((p, i) => i < boss.partCount && p.name === 'root-top');
    const chaser = DB.enemyIndex.get('chaser-cell');
    const cells = (): number =>
      world.enemies.enemies.filter((e) => e.state === EnemyState.Live && e.specIndex === chaser)
        .length;
    expect(cells()).toBe(0);
    world.bosses.damagePart(root, 999, 0);
    steps(game, 2);
    expect(boss.phase).toBe(1);
    const eye = boss.parts.find((p) => p.name === 'eye');
    const launches: number[] = [];
    for (let t = 0; t < 700; t++) {
      game.step();
      game.events.clear();
      for (const e of world.enemies.enemies) {
        if (e.state !== EnemyState.Live || e.specIndex !== chaser || e.age !== 1) continue;
        launches.push(world.tick);
        expect(Math.abs(e.x - (eye?.x ?? 0))).toBeLessThan(3);
        expect(Math.abs(e.y - (eye?.y ?? 0))).toBeLessThan(3);
        expect(e.x - world.camera.x).toBeGreaterThan(0);
        expect(e.x - world.camera.x).toBeLessThan(PLAYFIELD_W);
      }
    }
    // Phase 1 launches one every 200 ticks (rank-scaled — the default rank leaves it as it is).
    expect(launches.length).toBeGreaterThanOrEqual(3);
    for (let k = 1; k < launches.length; k++) expect(launches[k] - launches[k - 1]).toBe(200);
  });
});

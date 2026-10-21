/**
 * Tests for the free-flight scene (plan M1-06): its own sprites exist in the real atlas and are
 * appended after the content's names, its world view is the starfield followed by the game
 * World's batches on the game's live camera, update() copies the game frame and fills a
 * starfield that covers the playfield wherever the camera is, the HUD is rebuilt only when the
 * stock, the scores or the game-over state change (M1-12), and the KESTREL moved by input shows
 * up in the drawn batches.
 */
import {
  Action,
  DrawOp,
  ART_SCALE,
  FRAME_W,
  GLYPH_W,
  HUD_BAR_HEIGHT,
  HUD_BOTTOM_Y,
  LayerId,
  PLAYFIELD_H,
  PLAYFIELD_W,
  addScore,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  loadContent,
  type Game,
  type HeadlessPlatform,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../../../vite.shared.js';
import { FLIGHT_SPRITES, createFlightScene, moduleInfo } from '../../src/flight/index.js';

/**
 * A game on the real content (core kinds only).
 *
 * @returns The game and its headless platform.
 */
function realGame(): { game: Game; platform: HeadlessPlatform } {
  const { db, issues } = loadContent(readContentFiles());
  expect(issues).toEqual([]);
  const platform = createHeadlessPlatform();
  return { game: createGame(platform, { seed: 1 }, db), platform };
}

describe('shell/flight', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('flight');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('names only sprites the asset pipeline produces', () => {
    const { manifest } = buildAtlas();
    for (const name of FLIGHT_SPRITES) expect(Object.keys(manifest.sprites)).toContain(name);
  });

  it("appends its sprites after the content's names, so world ids keep their meaning", () => {
    const { game } = realGame();
    const flight = createFlightScene(game);
    const names = game.content.sprites.names;
    expect(flight.spriteNames).toEqual([...names, ...FLIGHT_SPRITES]);
    const shipId = game.world.playerBatch.spriteId[0];
    expect(flight.spriteNames[shipId]).toBe('ships/kestrel');
  });

  it("draws the starfield under the game World's batches, on the game's camera", () => {
    const { game } = realGame();
    const flight = createFlightScene(game);
    expect(flight.world.camera).toBe(game.world.camera);
    const layers = flight.world.batches.map((batch) => batch.layer);
    expect(layers).toEqual([
      LayerId.BgFar,
      LayerId.BgMid,
      LayerId.GroundEnemies,
      LayerId.AirEnemies,
      LayerId.PlayerShots,
      LayerId.Player,
      LayerId.Player,
      LayerId.EnemyBullets,
      LayerId.Player,
      LayerId.Items,
      LayerId.Items,
      // A double boss's resting half (M2-09), then the bosses in front.
      LayerId.GroundEnemies,
      LayerId.AirEnemies,
      // The Options an Option Hunter carries (M2-04).
      LayerId.AirEnemies,
      // The stage gimmicks' chains (M2-07).
      LayerId.GroundEnemies,
      // The glow companions (R3-06.L4): the shipped content DB now names glows
      // (decor-range), so every World carries these four additive batches — empty,
      // hence zero draw calls, until an owner on the layer glows.
      LayerId.GroundEnemies,
      LayerId.AirEnemies,
      LayerId.GroundEnemies,
      LayerId.AirEnemies,
    ]);
    expect(flight.world.batches.slice(2)).toEqual(game.world.view.batches);
    expect(flight.world.batches[2]).toBe(game.world.enemies.groundBatch);
    expect(flight.world.batches[3]).toBe(game.world.enemies.airBatch);
    expect(flight.world.batches[4]).toBe(game.world.weapons.batch); // M1-10
    expect(flight.world.batches[5]).toBe(game.world.weapons.optionBatch);
    expect(flight.world.batches[6]).toBe(game.world.playerBatch);
    expect(flight.world.batches[7]).toBe(game.world.bullets.batch);
    expect(flight.world.batches[8]).toBe(game.world.powerups.shieldBatch); // M1-11
    expect(flight.world.batches[9]).toBe(game.world.powerups.itemBatch);
    expect(flight.world.batches[10]).toBe(game.world.bullets.pointBatch); // M2-02
    expect(flight.world.batches[11]).toBe(game.world.bosses.backBatch); // M2-09
    expect(flight.world.batches[12]).toBe(game.world.bosses.batch); // M1-13
    expect(flight.world.warning).toBe(game.world.bosses.warning);
    expect(flight.world.lasers).toBe(game.world.bullets.laserView); // M1-09
    expect(flight.world.bendingLasers).toBe(game.world.bullets.bending); // M2-02
  });

  it('copies the game frame and reuses its own', () => {
    const { game } = realGame();
    const flight = createFlightScene(game);
    for (let i = 0; i < 5; i++) game.step();
    const source = game.renderFrame();
    const frame = flight.update(source);
    expect(frame).toBe(flight.frame);
    expect([frame.tick, frame.alpha, frame.screen, frame.world]).toEqual([
      5,
      source.alpha,
      source.screen,
      flight.world,
    ]);
    expect(flight.update(source)).toBe(frame);
    expect(frame.ui.count).toBe(0);
  });

  it('the starfield covers the playfield wherever the camera is', () => {
    const { game } = realGame();
    const flight = createFlightScene(game);
    const [far, mid] = flight.world.batches;
    // The starfield art's tile: 128 px of the v1 art at the art scale.
    const tile = Math.ceil(128 * ART_SCALE);
    for (const [camX, camY, tick] of [
      [0, 0, 0],
      [1234.5, -40, 777],
      [50, 20, 12345],
    ]) {
      game.world.camera.x = camX;
      game.world.camera.y = camY;
      flight.update({ ...game.renderFrame(), tick });
      for (const batch of [far, mid]) {
        let minX = Infinity;
        let maxRight = -Infinity;
        let maxBottom = -Infinity;
        for (let i = 0; i < batch.count; i++) {
          minX = Math.min(minX, batch.x[i] - camX);
          maxRight = Math.max(maxRight, batch.x[i] - camX + tile);
          maxBottom = Math.max(maxBottom, batch.y[i] - camY + tile);
        }
        expect(minX).toBeLessThanOrEqual(0);
        expect(maxRight).toBeGreaterThanOrEqual(PLAYFIELD_W);
        expect(maxBottom).toBeGreaterThanOrEqual(PLAYFIELD_H);
      }
      // The playfield in tiles, one column more for the scroll (4 × 2 = 8 at 384×216).
      const stars = (Math.ceil(PLAYFIELD_W / tile) + 1) * Math.ceil(PLAYFIELD_H / tile);
      expect(far.count).toBe(stars);
      expect(mid.count).toBe(2 * stars);
    }
  });

  it('builds the HUD bars once and again only when the stock changes', () => {
    const { game } = realGame();
    const flight = createFlightScene(game);
    const hud = flight.frame.hud;
    flight.update(game.renderFrame());
    const ops = Array.from(hud.op.subarray(0, hud.count));
    expect(ops.slice(0, 2)).toEqual([DrawOp.Rect, DrawOp.Rect]);
    expect([hud.y[0], hud.y[1], hud.w[0], hud.h[1]]).toEqual([
      0,
      HUD_BOTTOM_Y,
      PLAYFIELD_W,
      HUD_BAR_HEIGHT,
    ]);
    expect(hud.strings.slice(0, 3)).toEqual(['1P', 'FREE FLIGHT', 'ARROWS MOVE']);
    // Three ships → two stock icons.
    expect(ops.filter((op) => op === DrawOp.Sprite)).toHaveLength(2);
    const revision = hud.revision;
    flight.update(game.renderFrame());
    expect(hud.revision).toBe(revision);
    game.world.players[0].lives = 1;
    flight.update(game.renderFrame());
    expect(hud.revision).toBeGreaterThan(revision);
    expect(Array.from(hud.op.subarray(0, hud.count)).filter((op) => op === DrawOp.Sprite)).toEqual(
      [],
    );
  });

  it("draws player 1's score and the hi-score, and GAME OVER when the World says so (M1-12)", () => {
    const { game } = realGame();
    const flight = createFlightScene(game);
    const hud = flight.frame.hud;
    const numbers = (): number[] => {
      const out: number[] = [];
      for (let i = 0; i < hud.count; i++) if (hud.op[i] === DrawOp.Number) out.push(hud.value[i]);
      return out;
    };
    const title = (): string => {
      for (let i = 0; i < hud.count; i++) {
        if (hud.op[i] === DrawOp.Text && hud.x[i] === PLAYFIELD_W / 2 && hud.y[i] === 0) {
          return hud.strings[hud.ref[i]];
        }
      }
      return '';
    };
    const board = game.world.scoring.board;
    board.setHiScore(20_000);
    flight.update(game.renderFrame());
    expect(numbers()).toEqual([0, 20_000]);
    expect(title()).toBe('FREE FLIGHT');
    expect(board.hiScoreDirty).toBe(false); // the HUD drew it
    const revision = hud.revision;
    flight.update(game.renderFrame());
    expect(hud.revision).toBe(revision); // nothing changed: no rebuild
    addScore(game.world, 0, 25_000);
    flight.update(game.renderFrame());
    expect(numbers()).toEqual([25_000, 25_000]);
    expect(board.scores[0].displayDirty).toBe(false);
    game.world.status = 'gameOver';
    flight.update(game.renderFrame());
    expect(title()).toBe('GAME OVER');
  });

  it('lays the HUD out in the font cell: scores clear their labels, all inside the frame (R2-01)', () => {
    // At R2-01's 9×12 font the v1 positions (score 16 px after a 12-px label, the hi-score 68 px in
    // from the edge) put the digits over the labels and the last digit off the frame (C5).
    const { game } = realGame();
    const flight = createFlightScene(game);
    const hud = flight.frame.hud;
    flight.update(game.renderFrame());
    const texts = new Map<string, number>();
    const numbers: Array<{ x: number; digits: number }> = [];
    const icons: number[] = [];
    for (let i = 0; i < hud.count; i++) {
      if (hud.op[i] === DrawOp.Text) texts.set(hud.strings[hud.ref[i]], hud.x[i]);
      if (hud.op[i] === DrawOp.Number) numbers.push({ x: hud.x[i], digits: hud.frame[i] });
      if (hud.op[i] === DrawOp.Sprite) icons.push(hud.x[i]);
    }
    const [p1, hi] = numbers;
    expect(texts.get('1P')).toBeGreaterThanOrEqual(0);
    expect(p1.x).toBeGreaterThanOrEqual((texts.get('1P') ?? 0) + 2 * GLYPH_W);
    expect(hi.x).toBeGreaterThanOrEqual((texts.get('HI') ?? 0) + 2 * GLYPH_W);
    expect(hi.x + hi.digits * GLYPH_W).toBeLessThanOrEqual(FRAME_W);
    expect(hi.digits).toBe(8);
    // The stock icons (`hud/life`, 8 px wide at the v1 art) side by side, not overlapping.
    expect(icons).toHaveLength(2);
    expect(icons[1] - icons[0]).toBeGreaterThanOrEqual(Math.ceil(8 * ART_SCALE));
  });

  it('shows the KESTREL where the input moved it', () => {
    const { game, platform } = realGame();
    const flight = createFlightScene(game);
    for (let i = 0; i < 40; i++) game.step();
    const player = flight.world.batches[6];
    expect(player).toBe(game.world.playerBatch);
    flight.update(game.renderFrame());
    const x = player.x[0];
    commitPlayerInput(platform.snapshot.players[0], Action.Right | Action.Down);
    for (let i = 0; i < 10; i++) game.step();
    flight.update(game.renderFrame());
    expect(player.count).toBe(1);
    expect(player.x[0]).toBeGreaterThan(x + 10);
    expect(player.frame[0]).toBe(2); // banking down
  });

  it('draws a stage with its own parallax and terrain instead of the starfield (M1-07)', () => {
    const { db } = loadContent(readContentFiles());
    const game = createGame(createHeadlessPlatform(), { seed: 1, stage: 'test-range' }, db);
    const flight = createFlightScene(game);
    const view = game.world.view;
    expect(flight.world.camera).toBe(view.camera);
    expect(flight.world.parallax).toBe(view.parallax);
    expect(flight.world.terrain).toBe(view.terrain);
    expect(flight.world.parallax).not.toBeNull();
    expect(flight.world.terrain).not.toBeNull();
    expect(flight.world.batches).toEqual(view.batches);
    flight.update(game.renderFrame());
    expect(flight.frame.hud.strings[1]).toBe('TEST RANGE');
    for (let i = 0; i < 120; i++) game.step();
    expect(game.world.camera.x).toBeGreaterThan(60);
  });

  it("shows the boss WARNING's text on a band while it plays, rebuilt only on changes (M1-13)", () => {
    const { db } = loadContent(readContentFiles());
    const game = createGame(createHeadlessPlatform(), { seed: 1, stage: 'test-boss' }, db);
    const flight = createFlightScene(game);
    const ui = flight.frame.ui;
    const warning = game.world.bosses.warning;
    expect(flight.world.warning).toBe(warning);
    flight.update(game.renderFrame());
    expect(ui.count).toBe(0);
    while (!warning.active) game.step();
    flight.update(game.renderFrame());
    expect(ui.strings[0]).toBe(warning.text);
    expect(ui.strings[0]).toContain('"TRIAL WARDEN"');
    expect(Array.from(ui.op.subarray(0, ui.count))).toEqual([
      DrawOp.Rect,
      DrawOp.Rect,
      DrawOp.Rect,
      DrawOp.Text,
    ]);
    const text = ui.count - 1;
    expect([ui.x[text], ui.color[text]]).toEqual([PLAYFIELD_W / 2, 0xf85858]);
    // Unchanged within a colour phase; the colour alternates every 16 ticks.
    const revision = ui.revision;
    game.step();
    flight.update(game.renderFrame());
    expect(ui.revision).toBe(revision);
    while ((warning.ticks & 16) === 0) game.step();
    flight.update(game.renderFrame());
    expect(ui.color[ui.count - 1]).toBe(0xf8d030);
    // Gone when the boss flies in.
    while (warning.active) game.step();
    flight.update(game.renderFrame());
    expect(ui.count).toBe(0);
  });
});

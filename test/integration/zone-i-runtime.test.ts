/**
 * Zone I through the real game on the shipped content (plan M2-14, R5-P.P5e's split of
 * `zones-hi-runtime-edge.test.ts`; zone H's cases live in `zone-h-runtime.test.ts`):
 *
 * - **every practice start** (the scene flow's `startPractice`) at every checkpoint of ABYSSAL
 *   THRONE puts the camera at the checkpoint and flies the ship in to open space (its terrain box
 *   never in rock) inside the view;
 * - **the stage skip** into zone I lands before the ABYSS ARK's WARNING — the raid's camera then
 *   follows the ARK;
 * - **the ARK's escape through the shipped campaign** (the M2-14 review fix): a run that lost no
 *   ship and let the ARK sail off after its 90-s time limit ends with *THE FLAGSHIP SLIPS AWAY* —
 *   never *THE DEEP IS STILL*, whose epilogue sinks a HOLLOW KING who never showed — and the
 *   deep's scene draws the ARK sailing off under the dawn of a flawless run, to the ending theme.
 */
import {
  Action,
  PLAYFIELD_CY,
  TILE_SIZE,
  BossState,
  DrawOp,
  ENGINE_SPRITES,
  EndingFlag,
  KNOWN_SCRIPT_IDS,
  MUSIC_CUES,
  RunFlag,
  SimEventKind,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  loadContent,
  resolveUiSprites,
  type ContentDb,
  type SceneFlow,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';
import { BOT_X } from '../playtest/four-way-bot.js';
import { expectInOpenSpace, steps, stepUntil } from './zones/helpers.js';

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
  const starts: [string, number, number, number, number][] = [];
  for (const [letter, stageId] of [['i', 'zone-i']] as const) {
    const stage = DB.stages[DB.stageIndex.get(stageId) ?? -1];
    // The design §2 camera at each checkpoint: the key's own scroll speed, and the y of the
    // pan completed before it — the surface (0) at the re-seated trench-mouth checkpoint
    // 2,880 (the k1 descent begins at 3,000, just after it), the plain (312) from 6,240
    // east (the k2 descent finished at 6,144), and k4's rise back to 0 running inside its
    // hold at 12,300 so the approach checkpoint and the stage's end ride the surface
    // (R5-09.S6, from the stage's own keys; the R5-09.FIX2 re-seat moved 3,000→2,880 and
    // 6,000→6,240 so the game respawn's box clears the §10 lip and the seg-2 dive floor).
    const keySpeed = [1.35, 1.35, 1.35, 1.95, 1.6, 1.6];
    const designY = [0, 0, 312, 312, 312, 0];
    stage.checkpoints.forEach((checkpoint, i) =>
      starts.push([letter, i, checkpoint.x, keySpeed[i] ?? 0, designY[i] ?? -1]),
    );
  }

  it.each(starts)(
    'practice start in zone %s at checkpoint %i (x %i): the ship flown in to open space',
    (letter, checkpoint, x, speed, y) => {
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
      // R5-09.S6 re-anchor (design §2): the seek lands the camera at its checkpoint and the
      // key's own scroll carries it under two ticks of that speed — the 1.6-px steps at
      // 12,300 and 15,600 sit exactly on the shared helper's exclusive bound, so the case
      // reads the design's window itself. The y is the design's table above, inside one pan
      // epsilon: each key's own hold or ramp begins the tick after arrival.
      expect(world.camera.x).toBeGreaterThanOrEqual(x);
      expect(world.camera.x).toBeLessThan(x + 2 * speed);
      expect(Math.abs(world.camera.y - y)).toBeLessThan(1.5);
      // A while in open space: the fly-in, then the ride. The design §2 pans run live
      // from the checkpoint's own key (k1's descent starts at 3,000 while the ship is
      // still flying in), and the shelf lip (design §10, map rows 26–27) sweeps across
      // the fly-in line mid-dive — so the practice ship first rides the pan out (cap
      // 400 ticks, the longest hold is 312), steering with the Down/Up a player would
      // hold toward `camera.y + PLAYFIELD_CY + TILE_SIZE`: one tile under the screen's
      // middle row, clear of the lip bottom in the trench's lower corridor, of the
      // mass on the abyssal plain, and of the surface line everywhere above.
      const ship = world.players[0];
      // The pan's destination under this checkpoint's own key (design §2's `yTo`s in key
      // order — 168 at the trench, 312 on the plain, back to 0 from the ascent key): the
      // camera still pans past the arrival y when the practice starts, so the ride seeks
      // this line before any open-space check is made.
      const rideY = [0, 168, 312, 312, 0, 0][checkpoint] ?? 0;
      const ride = (): void => {
        const row = world.camera.y + PLAYFIELD_CY + TILE_SIZE;
        const dy = ship.y - row;
        const dx = world.camera.x + BOT_X - ship.x;
        commitPlayerInput(
          platform.snapshot.players[0],
          Action.Shot |
            (dx > 2 ? Action.Right : dx < -2 ? Action.Left : 0) |
            (dy > 2 ? Action.Up : dy < -2 ? Action.Down : 0),
        );
        game.step();
        game.events.clear();
      };
      for (let s = 0; s < 400 && Math.abs(world.camera.y - rideY) > 0.5; s++) ride();
      for (let k = 0; k < 3; k++) {
        for (let s = 0; s < 45; s++) ride();
        expectInOpenSpace(world, `zone ${letter} checkpoint ${String(checkpoint)} +${String(k)}`);
      }
    },
  );

  it('checks six checkpoints per zone', () => {
    expect(starts).toHaveLength(6);
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
    // The skip lands just before the WARNING at x 19,650 (design §2, R5-09.S5b — the stage
    // skip keeps the warning target, R5-P.P14): the 360-px window is a playfield of calm
    // scroll at the 1.2 px/tick key, the lead ported from v1's 150 px on the 1.2 key.
    expect(world.camera.x).toBeGreaterThan(19_290);
    expect(world.camera.x).toBeLessThan(19_650);
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
    // M3-02: the final zone's escape sequence comes first — fly it to its `end` event.
    expect(flow.stack.top?.id).toBe('game');
    expect(game.world.stage?.stage.id).toBe('escape');
    expect(flow.run.inEscape).toBe(true);
    until('stageClear', 20000);
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

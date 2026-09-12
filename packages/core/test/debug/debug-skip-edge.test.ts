/**
 * Edge cases of the debug stage skip (plan M1-18, `core/debug` `skipToBoss` and
 * `GameConfig.stageSkip`), beyond `debug-skip.test.ts`:
 *
 * - a boss event within {@link BOSS_SKIP_LEAD} px of the stage start: the jump clamps to 0;
 * - a `boss` event (no WARNING) counts like a `warning`, and the first of them is the target;
 * - what survives the jump (loadout, lives, score) and what does not (items, lasers, bullets);
 *   a dying / dead ship is not flown in, an inactive player 2 stays out;
 * - skipping twice lands at the same place (a restart each time);
 * - `stageSkip: 'boss'` at creation equals a plain creation followed by `skipToBoss` (same
 *   `hashWorld`, lockstep afterwards) — and a new session of `createGame` skips too;
 * - `resolveGameConfig` keeps the default when the field is omitted and rejects anything but
 *   `'none'` / `'boss'`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANGLE_UNITS } from '../../src/math/index.js';
import { BossState } from '../../src/bosses/index.js';
import { BulletKind, fireLaser, spawnBullet } from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { BOSS_SKIP_LEAD, hashWorld, skipToBoss } from '../../src/debug/index.js';
import { createGame } from '../../src/game/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import { ENTER_START_X, killPlayer } from '../../src/player/index.js';
import { ItemKind } from '../../src/powerups/index.js';
import { StageSlot } from '../../src/stage/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';

/**
 * A shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The file.
 */
function shipped(path: string): ContentFile {
  return {
    path,
    data: JSON.parse(
      readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
    ) as unknown,
  };
}

/**
 * A small open-space stage with the given events (zone A's boss is available).
 *
 * @param id - Stage id.
 * @param events - Its timeline.
 * @returns The content file.
 */
function stageFile(id: string, events: unknown[]): ContentFile {
  return {
    path: `stages/${id}.stage.json`,
    data: {
      formatVersion: 1,
      kind: 'stage',
      id,
      name: id.toUpperCase(),
      music: { stage: 'Stage', boss: 'Boss' },
      length: 2000,
      camera: [{ x: 0, speed: 1 }],
      checkpoints: [{ x: 0 }, { x: 400 }],
      parallax: [],
      tilemap: null,
      events,
    },
  };
}

/**
 * Zone A with its roster and weapons, plus synthetic boss stages.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const { db: content, issues } = loadContent(
    [
      ...[
        'player/kestrel.player.json',
        'weapons/type-a.weapons.json',
        'tilesets/terrain-a.tileset.json',
        'paths/zone-a.paths.json',
        'enemies/zone-a.enemies.json',
        'stages/zone-a.stage.json',
      ].map(shipped),
      // The WARNING closer to the start than the lead.
      stageFile('early', [{ x: 50, type: 'warning', enemy: 'halcyon-bulwark' }]),
      // A boss without a WARNING, and a later WARNING: the first of them counts.
      stageFile('direct', [
        { x: 300, type: 'music', cue: 'Boss' },
        { x: 600, type: 'boss', enemy: 'halcyon-bulwark' },
        { x: 900, type: 'warning', enemy: 'halcyon-bulwark' },
      ]),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

const DB = db();

/**
 * Steps a world with no input.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) stepWorld(w, input);
}

describe('core/debug skipToBoss — edge cases (M1-18)', () => {
  it('clamps the jump to the stage start when the boss is within the lead', () => {
    const w = createWorld(resolveGameConfig({ stage: 'early', seed: 2 }), DB);
    run(w, 30);
    expect(skipToBoss(w)).toBe(true);
    expect(w.camera.x).toBe(0);
    expect(w.stage?.checkpoint).toBe(0);
    let ticks = 0;
    while (w.status !== 'bossWarning' && ticks < 200) {
      run(w, 1);
      ticks++;
    }
    expect(w.status).toBe('bossWarning');
    expect(ticks).toBeLessThanOrEqual(60); // 50 px at 1 px/tick
  });

  it('counts a `boss` event like a `warning`: the first of them is the target', () => {
    const w = createWorld(resolveGameConfig({ stage: 'direct', seed: 2 }), DB);
    expect(skipToBoss(w)).toBe(true);
    expect(w.camera.x).toBe(600 - BOSS_SKIP_LEAD);
    expect(w.stage?.checkpoint).toBe(1); // the one at 400
    expect(w.stage?.eventCursor).toBe(1); // the music at 300 lies behind
    // No WARNING: the boss flies straight in once the camera covers the lead.
    for (let i = 0; i < 200 && w.bosses.boss.state === BossState.None; i++) run(w, 1);
    expect(w.status).not.toBe('bossWarning');
    expect(w.bosses.boss.state).not.toBe(BossState.None);
  });

  it('keeps loadout, lives and score; clears items, lasers and bullets', () => {
    const w = createWorld(
      resolveGameConfig({ stage: 'zone-a', seed: 4, loadout: 'full', autofire: false }),
      DB,
    );
    run(w, 120);
    const ship = w.players[0];
    const loadout = w.weapons.loadouts[0];
    const before = {
      options: loadout.options,
      missile: loadout.missile,
      speed: ship.speedLevel,
      lives: ship.lives,
    };
    expect(before.options).toBe(4);
    w.scoring.board.scores[0].score = 12_340;
    const cx = w.camera.x;
    w.powerups.spawnItem(ItemKind.Capsule, cx + 200, 100);
    fireLaser(w, { slot: -1, x: cx + 300, y: 80 }, ANGLE_UNITS / 2, 200);
    spawnBullet(w, cx + 250, 120, ANGLE_UNITS / 2, 1, BulletKind.RoundPink);
    expect(w.powerups.pool.count).toBeGreaterThan(0);
    expect(w.bullets.lasers.count).toBeGreaterThan(0);
    expect(w.bullets.count).toBeGreaterThan(0);

    expect(skipToBoss(w)).toBe(true);
    expect(w.powerups.pool.count).toBe(0);
    expect(w.bullets.lasers.count).toBe(0);
    expect(w.bullets.count).toBe(0);
    expect(w.enemies.enemies.every((e) => e.state === 0)).toBe(true);
    expect({
      options: loadout.options,
      missile: loadout.missile,
      speed: ship.speedLevel,
      lives: ship.lives,
    }).toEqual(before);
    expect(w.scoring.board.scores[0].score).toBe(12_340);
    expect(ship.state).toBe('entering');
    expect(ship.x).toBe(w.camera.x + ENTER_START_X);
  });

  it('leaves a dying ship alone and an inactive player 2 out', () => {
    const w = createWorld(resolveGameConfig({ stage: 'zone-a', seed: 4 }), DB);
    run(w, 60);
    const ship = w.players[0];
    expect(killPlayer(ship)).toBeGreaterThanOrEqual(0);
    const x = ship.x;
    expect(skipToBoss(w)).toBe(true);
    expect(ship.state).toBe('dying');
    expect(ship.x).toBe(x);
    expect(w.players[1].active).toBe(false);
    expect(w.players[1].state).not.toBe('entering');
    // The death runs its course and the ship flies back in near the boss.
    for (let i = 0; i < 600 && ship.state !== 'alive'; i++) run(w, 1);
    expect(ship.state).toBe('alive');
    expect(ship.x - w.camera.x).toBeGreaterThan(0);
  });

  it('lands at the same place when skipped twice (a restart each time)', () => {
    const w = createWorld(resolveGameConfig({ stage: 'zone-a', seed: 4 }), DB);
    expect(skipToBoss(w)).toBe(true);
    const x = w.camera.x;
    const restarts = w.stage?.state[StageSlot.Restarts] ?? -1;
    run(w, 50);
    expect(w.camera.x).toBeGreaterThan(x);
    expect(skipToBoss(w)).toBe(true);
    expect(w.camera.x).toBe(x);
    expect(w.stage?.state[StageSlot.Restarts]).toBe(restarts + 1);
    // Even from inside the boss fight: the WARNING comes again.
    for (let i = 0; i < 1500 && w.bosses.boss.state !== BossState.Fight; i++) run(w, 1);
    expect(w.bosses.boss.state).toBe(BossState.Fight);
    expect(skipToBoss(w)).toBe(true);
    expect(w.bosses.boss.state).toBe(BossState.None);
    expect(w.camera.x).toBe(x);
    expect(w.stage?.locked).toBe(false);
    for (let i = 0; i < 400 && w.status !== 'bossWarning'; i++) run(w, 1);
    expect(w.status).toBe('bossWarning');
  });

  it("stageSkip: 'boss' equals a plain creation followed by skipToBoss", () => {
    const skipped = createWorld(
      resolveGameConfig({ stage: 'zone-a', seed: 9, stageSkip: 'boss' }),
      DB,
    );
    const manual = createWorld(resolveGameConfig({ stage: 'zone-a', seed: 9 }), DB);
    expect(skipToBoss(manual)).toBe(true);
    expect(manual.camera.x).toBe(skipped.camera.x);
    expect(hashWorld(manual)).toBe(hashWorld(skipped));
    const input = createInputSnapshot();
    for (let i = 0; i < 600; i++) {
      stepWorld(skipped, input);
      stepWorld(manual, input);
    }
    expect(hashWorld(manual)).toBe(hashWorld(skipped));
    expect(skipped.bosses.boss.state).not.toBe(BossState.None);
  });

  it('skips in every session a game creates with the flag', () => {
    const game = createGame(
      createHeadlessPlatform(),
      { stage: 'zone-a', stageSkip: 'boss', seed: 1 },
      DB,
    );
    const warning = game.world.stage?.stage.events.find((e) => e.type === 'warning');
    expect(game.config.stageSkip).toBe('boss');
    expect(game.world.camera.x).toBe((warning?.x ?? 0) - BOSS_SKIP_LEAD);
    const plain = createGame(createHeadlessPlatform(), { stage: 'zone-a', seed: 1 }, DB);
    expect(plain.config.stageSkip).toBe('none');
    expect(plain.world.camera.x).toBe(0);
  });

  it('validates GameConfig.stageSkip: omitted → none, anything else but none / boss throws', () => {
    const config = resolveGameConfig({ stage: 'zone-a' });
    expect(config.stageSkip).toBe('none');
    expect(Object.isFrozen(config)).toBe(true);
    expect(resolveGameConfig({ stageSkip: 'none' }).stageSkip).toBe('none');
    for (const bad of [null, '', 'BOSS', 'Boss', 'checkpoint', 1, true, {}]) {
      expect(
        () => resolveGameConfig({ stageSkip: bad as unknown as 'boss' }),
        JSON.stringify(bad),
      ).toThrow(RangeError);
    }
  });
});

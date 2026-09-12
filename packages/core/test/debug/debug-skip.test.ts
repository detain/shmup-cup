/**
 * The debug stage skip (plan M1-18): `skipToBoss(world)` and `GameConfig.stageSkip`.
 *
 * - `skipToBoss` jumps the stage to `BOSS_SKIP_LEAD` px before its first `warning` / `boss`
 *   event, clears the session and flies the ship in again at the new view; the WARNING follows
 *   once the camera covers the lead; `false` (nothing changed) in free flight and on a stage
 *   without a boss;
 * - `stageSkip: 'boss'` does it at world creation (so a new World of the scene flow, a retry and a
 *   replay skip too), deterministically; `resolveGameConfig` accepts only `'none'` / `'boss'`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BossState } from '../../src/bosses/index.js';
import { DEFAULT_GAME_CONFIG, resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { BOSS_SKIP_LEAD, hashWorld, skipToBoss } from '../../src/debug/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { ENTER_START_X } from '../../src/player/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld } from '../../src/world/index.js';

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
 * Zone A and the test range with what they need.
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const { db: content, issues } = loadContent(
    [
      'player/kestrel.player.json',
      'weapons/type-a.weapons.json',
      'tilesets/terrain-a.tileset.json',
      'paths/test-range.paths.json',
      'paths/zone-a.paths.json',
      'enemies/test-range.enemies.json',
      'enemies/zone-a.enemies.json',
      'stages/test-range.stage.json',
      'stages/zone-a.stage.json',
    ].map(shipped),
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

const DB = db();

describe('core/debug skipToBoss (M1-18)', () => {
  it('jumps just before the WARNING, clears the session and flies the ship in again', () => {
    const w = createWorld(resolveGameConfig({ stage: 'zone-a', seed: 3 }), DB);
    w.debugFlags.godMode = true;
    const input = createInputSnapshot();
    for (let i = 0; i < 900; i++) stepWorld(w, input);
    expect(w.enemies.enemies.some((e) => e.state !== 0)).toBe(true);
    const warning = w.stage?.stage.events.find((e) => e.type === 'warning');
    expect(skipToBoss(w)).toBe(true);
    expect(w.camera.x).toBe((warning?.x ?? 0) - BOSS_SKIP_LEAD);
    expect(w.enemies.enemies.every((e) => e.state === 0)).toBe(true);
    expect(w.bullets.count).toBe(0);
    const ship = w.players[0];
    expect(ship.state).toBe('entering');
    expect(ship.x).toBe(w.camera.x + ENTER_START_X);
    // The WARNING comes once the camera covers the lead (0.75 px/tick there: ~2 s).
    let ticks = 0;
    while (w.status !== 'bossWarning' && ticks < 600) {
      stepWorld(w, input);
      ticks++;
    }
    expect(w.status).toBe('bossWarning');
    expect(ticks).toBeLessThan(200);
    while (w.bosses.boss.state !== BossState.Fight && ticks < 2000) {
      stepWorld(w, input);
      ticks++;
    }
    expect(w.bosses.boss.state).toBe(BossState.Fight);
  });

  it('does nothing in free flight or on a stage without a boss', () => {
    const flight = createWorld(resolveGameConfig({ seed: 3 }), DB);
    expect(skipToBoss(flight)).toBe(false);
    expect(flight.camera.x).toBe(0);
    const range = createWorld(resolveGameConfig({ stage: 'test-range', seed: 3 }), DB);
    const before = hashWorld(range);
    expect(skipToBoss(range)).toBe(false);
    expect(hashWorld(range)).toBe(before);
  });

  it("skips at creation with stageSkip: 'boss', deterministically", () => {
    const a = createWorld(resolveGameConfig({ stage: 'zone-a', stageSkip: 'boss' }), DB);
    const b = createWorld(resolveGameConfig({ stage: 'zone-a', stageSkip: 'boss' }), DB);
    const warning = a.stage?.stage.events.find((e) => e.type === 'warning');
    expect(a.camera.x).toBe((warning?.x ?? 0) - BOSS_SKIP_LEAD);
    expect(a.players[0].state).toBe('entering');
    // The stage theme is still queued (the skip clears pools, not the event queue).
    expect(a.events.length).toBeGreaterThan(0);
    const input = createInputSnapshot();
    for (let i = 0; i < 400; i++) {
      stepWorld(a, input);
      stepWorld(b, input);
    }
    expect(a.bosses.boss.state).not.toBe(BossState.None);
    expect(hashWorld(a)).toBe(hashWorld(b));
    // Free flight ignores the flag.
    const flight = createWorld(resolveGameConfig({ stageSkip: 'boss' }), DB);
    expect(flight.stage).toBeNull();
    expect(flight.camera.x).toBe(0);
  });

  it('validates GameConfig.stageSkip', () => {
    expect(DEFAULT_GAME_CONFIG.stageSkip).toBe('none');
    expect(resolveGameConfig({ stageSkip: 'boss' }).stageSkip).toBe('boss');
    expect(() => resolveGameConfig({ stageSkip: 'end' as 'boss' })).toThrow(
      /stageSkip must be 'none' or 'boss'/,
    );
  });
});

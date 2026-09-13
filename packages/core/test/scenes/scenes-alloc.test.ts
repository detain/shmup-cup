/**
 * Allocation guard of the scene flow (plan M1-16; definition of done: zero allocations per tick
 * and per frame), in its own file so the worker's V8 type feedback comes only from here: a game
 * started through the flow is played (the ship weaving and autofiring), paused and resumed with
 * Play/Pause, its pause menu navigated, while the render frame is composed every tick (the HUD
 * rebuilt on its changes, the UI list on the pause menu's). Only a game start creates objects (its
 * World) — the loop never starts one.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent, type ContentFile } from '../../src/data/index.js';
import { createGame } from '../../src/game/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

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

describe('core/scenes allocation', () => {
  it('ticks the flow and composes its frame without allocating', () => {
    const { db } = loadContent(
      [shipped('player/kestrel.player.json'), shipped('weapons/type-a.weapons.json')],
      { extraSprites: ENGINE_SPRITES },
    );
    const platform = createHeadlessPlatform();
    const game = createGame(platform, { loadout: 'full' }, db, { scenes: 'game' });
    const flow = game.scenes!;
    const player = platform.snapshot.players[0];
    const world = game.world;
    let t = 0;
    const growth = measureHeapGrowth(
      () => {
        t++;
        const phase = t % 600;
        let held: number = (t / 30) % 2 < 1 ? Action.Up : Action.Down;
        // Pause at 500, move the menu focus, resume at 560 (Play/Pause toggles).
        if (phase === 500 || phase === 560) held = Action.Pause;
        else if (phase > 500 && phase < 560) held = phase % 10 === 0 ? Action.Down : 0;
        commitPlayerInput(player, held);
        game.step();
        game.renderFrame();
        game.events.clear();
      },
      20_000,
      20_000,
    );
    expect(game.world).toBe(world); // no game was started inside the loop
    expect(flow.stack.top?.id).toBe('game');
    expect(growth.bytes).toBeLessThan(64 * 1024);
    // ~0.8 s alone; the full parallel `pnpm test` load pushed it past the default 5 s (M2-06).
  }, 30_000);
});

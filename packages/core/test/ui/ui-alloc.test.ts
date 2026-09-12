/**
 * Allocation guards of the UI kit (plan M1-16; definition of done: zero allocations per tick and
 * per frame), in their own file so the worker's V8 type feedback comes only from here: the HUD
 * rebuilt on every call (a score that changes every frame), the HUD asked on every call with
 * nothing changed, and a menu driven by held and tapped directions with its list redrawn.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentFile } from '../../src/data/index.js';
import { Action, type PlayerInput } from '../../src/input/index.js';
import { TextAlign, createDrawList } from '../../src/presentation/index.js';
import {
  createHud,
  createListMenu,
  createSlider,
  drawMenu,
  menuTick,
  resolveUiSprites,
} from '../../src/ui/index.js';
import { ENGINE_SPRITES, createWorld } from '../../src/world/index.js';
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

describe('core/ui allocation', () => {
  it('rebuilds the HUD on a change and skips it otherwise without allocating', () => {
    const { db } = loadContent(
      [shipped('player/kestrel.player.json'), shipped('weapons/type-a.weapons.json')],
      { extraSprites: ENGINE_SPRITES },
    );
    const world = createWorld(resolveGameConfig({ loadout: 'full' }), db);
    world.powerups.meters[0].cursor = 2;
    const hud = createHud(resolveUiSprites(db));
    const list = createDrawList(64, 4);
    const score = world.scoring.board.scores[0];
    let t = 0;
    const growth = measureHeapGrowth(
      () => {
        t++;
        world.tick = t;
        if ((t & 1) === 0) {
          score.score += 10;
          score.displayDirty = true;
        }
        hud.update(world, list);
      },
      20_000,
      20_000,
    );
    expect(hud.builds).toBeGreaterThan(20_000);
    expect(growth.bytes).toBeLessThan(32 * 1024);
  });

  it('drives and redraws a menu without allocating', () => {
    const menu = createListMenu([
      'START',
      { label: 'VOLUME', slider: createSlider(0, 10, 1, 5) },
      'OPTIONS',
      'EXIT',
    ]);
    const list = createDrawList(64, 16);
    const input: PlayerInput = { held: 0, pressed: 0, released: 0, device: 'remote' };
    const layout = { x: 192, y: 100, align: TextAlign.Center };
    let t = 0;
    const growth = measureHeapGrowth(
      () => {
        t++;
        const phase = t % 120;
        const held = phase < 50 ? Action.Down : phase < 100 ? Action.Right : 0;
        input.pressed = held & ~input.held;
        input.released = input.held & ~held;
        input.held = held;
        if (phase === 110) input.pressed |= Action.Confirm;
        const before = menu.revision;
        menuTick(menu, input);
        if (menu.revision !== before) {
          list.clear();
          drawMenu(list, menu, 0, layout);
        }
      },
      20_000,
      20_000,
    );
    expect(growth.bytes).toBeLessThan(32 * 1024);
  });
});

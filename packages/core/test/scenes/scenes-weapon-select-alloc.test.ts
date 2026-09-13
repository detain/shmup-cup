/**
 * Allocation guard of the weapon select (plan M2-03; definition of done: zero allocations per tick
 * and per frame), in its own file so the worker's V8 type feedback comes only from here: with the
 * weapon select open, its live preview flies (the mini World with its weapons, Options and the
 * weave) while the menu is navigated and TYPE cycles through A–D and EDIT — every change swaps the
 * preview's arsenal in place (`WeaponSystem.setArsenal`) — with the render frame composed every
 * tick; the range restarts at its end over and over. No game is started and neither START, ORDER
 * nor Back is pressed. The range flies without its targets (their spawns create coroutines — see
 * the test).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent, type ContentFile } from '../../src/data/index.js';
import { createGame } from '../../src/game/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import { WeaponSelectItem } from '../../src/scenes/index.js';
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

describe('core/scenes weapon select allocation (M2-03)', () => {
  it('flies the preview and changes the loadout without allocating', () => {
    // The shipped range without its spawns (every spawn creates its enemy's coroutine — a
    // generator per spawn, decision D29, covered by the stage and enemy guards — which is not what
    // this guard measures); its `end` stays, so the preview restarts the range over and over.
    const shippedRange = shipped('stages/weapon-range.stage.json');
    const data = shippedRange.data as { events: { type: string }[] };
    const range: ContentFile = {
      path: shippedRange.path,
      data: { ...data, events: data.events.filter((e) => e.type === 'end') },
    };
    const { db, issues } = loadContent(
      [
        'player/kestrel.player.json',
        'tilesets/terrain-a.tileset.json',
        'weapons/type-a.weapons.json',
        'weapons/types-b-d.weapons.json',
      ]
        .map(shipped)
        .concat([range]),
      { extraSprites: ENGINE_SPRITES },
    );
    expect(issues).toEqual([]);
    const platform = createHeadlessPlatform();
    const game = createGame(platform, {}, db, { scenes: 'title' });
    const flow = game.scenes!;
    const player = platform.snapshot.players[0];
    /**
     * Presses and releases an action (outside the measured loop).
     *
     * @param action - The action.
     */
    const press = (action: number): void => {
      commitPlayerInput(player, action);
      game.step();
      commitPlayerInput(player, 0);
      game.step();
    };
    press(Action.Confirm); // PRESS OK
    press(Action.Confirm); // START
    press(0);
    press(Action.Confirm); // NORMAL
    press(0);
    const select = flow.weaponSelect;
    expect(flow.stack.top).toBe(select);
    const preview = select.preview!;
    const world = game.world;
    let t = 0;
    const growth = measureHeapGrowth(
      () => {
        t++;
        const phase = t % 120;
        let held = 0;
        // Between START, TYPE and `!`: TYPE steps (A → B → C → D → EDIT → A), `!` too.
        if (phase === 10)
          held = Action.Down; // → TYPE
        else if (phase === 30 || phase === 50) held = Action.Right;
        else if (phase === 70)
          held = Action.Up; // → START
        else if (phase === 90)
          held = Action.Up; // → ORDER (never pressed)
        else if (phase === 110) held = Action.Down; // → START
        commitPlayerInput(player, held);
        game.step();
        game.renderFrame();
        game.events.clear();
      },
      12_000,
      12_000,
    );
    expect(flow.stack.top).toBe(select);
    expect(select.preview).toBe(preview);
    expect(select.menu.focus).toBe(WeaponSelectItem.Start);
    expect(preview.tick).toBeGreaterThan(24_000);
    // The range ended and restarted several times meanwhile.
    expect(preview.camera.x).toBeLessThan(2400);
    expect(preview.status).toBe('playing');
    expect(game.world).toBe(world); // no game was started
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 180_000);
});

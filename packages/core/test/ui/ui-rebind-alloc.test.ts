/**
 * Allocation guard of the UI kit's rebind widget (plan M2-16; definition of done: zero allocations
 * per tick and per frame), in its own file: the rows driven by taps and held directions, MODE
 * switching contexts, and the capture prompt's clock with its draining bar — the panel redrawn
 * whenever its revision changes. The prompt texts are constants set outside the per-tick path
 * (the scene builds them on a menu action).
 */
import { describe, expect, it } from 'vitest';
import { ACTION_NAMES, Action, type ActionName, type PlayerInput } from '../../src/input/index.js';
import { createDrawList } from '../../src/presentation/index.js';
import {
  REBIND_CAPTURE_TICKS,
  createRebindPanel,
  drawRebindPanel,
  rebindStringSlots,
  rebindTick,
} from '../../src/ui/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

describe('core/ui rebind widget allocation', () => {
  it('ticks the rows and the capture prompt and redraws them without allocating', () => {
    const actions: Record<string, string> = {};
    for (const name of ACTION_NAMES) actions[name] = name.toUpperCase();
    const panel = createRebindPanel({
      mode: 'MODE',
      contexts: ['GAME', 'MENU'],
      actions: actions as Record<ActionName, string>,
      reset: 'RESET',
      done: 'DONE',
    });
    panel.open('game', 0);
    panel.setKeys('game', 'Shot', 'Z  SPACE');
    panel.setKeys('menu', 'Confirm', 'ENTER');
    const list = createDrawList(256, rebindStringSlots(panel));
    const layout = Object.freeze({ x: 72, y: 30, lineHeight: 11, cursorX: 62, valueX: 150 });
    const input: PlayerInput = { held: 0, pressed: 0, released: 0, device: 'keyboard' };
    const prompt = 'PRESS A KEY FOR SHOT';
    const hint = 'ESC: CANCEL';
    let drawn = -1;
    const growth = measureHeapGrowth(
      (i) => {
        const phase = i % 400;
        // Down over the rows, then MODE there and back with two Right taps.
        const held = phase < 40 ? Action.Down : phase === 50 || phase === 60 ? Action.Right : 0;
        if (phase === 45) panel.menu.focus = 0;
        input.pressed = held & ~input.held;
        input.released = input.held & ~held;
        input.held = held;
        if (phase === 90) panel.startCapture(prompt);
        if (phase === 90 + REBIND_CAPTURE_TICKS - 10) panel.stopCapture();
        rebindTick(panel, input);
        if (panel.revision !== drawn) {
          drawn = panel.revision;
          list.clear();
          drawRebindPanel(list, panel, 0, layout, hint);
        }
      },
      20_000,
      20_000,
      3,
      16 * 1024,
    );
    expect(growth.bytes).toBeLessThan(32 * 1024);
  });
});

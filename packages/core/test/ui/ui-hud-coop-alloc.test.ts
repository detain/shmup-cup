/**
 * Allocation guard of the co-op HUD (plan M2-06; definition of done: zero allocations per frame),
 * in its own file so the worker's V8 type feedback comes only from here: two meter ships in play
 * (both compact halves) with their stock, meter cursors and shields changing in turn, player 2
 * knocked out (its blinking `PRESS START`, then `GAME OVER`) and back, the prompt's blink and the
 * meter flash moving the tick — and the HUD asked with nothing changed in between.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_DEAD_TICKS } from '../../src/player/index.js';
import { createDrawList } from '../../src/presentation/index.js';
import { grantShield } from '../../src/shields/index.js';
import {
  HUD_COMMAND_COUNT,
  HUD_STRING_COUNT,
  createHud,
  resolveUiSprites,
} from '../../src/ui/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';
import { aliveWorld, directDb } from '../helpers/direct.js';

describe('core/ui co-op HUD allocation (M2-06)', () => {
  it('rebuilds both halves and the prompts on every change without allocating', () => {
    const db = directDb();
    const world = aliveWorld(db, { shipId: 'kestrel', powerUpMode: 'meter', coop: true });
    const [p1, p2] = world.players;
    p2.active = true;
    p2.state = 'alive';
    const scores = world.scoring.board.scores;
    const hud = createHud(resolveUiSprites(db));
    const list = createDrawList(HUD_COMMAND_COUNT, HUD_STRING_COUNT);
    let t = 0;
    const growth = measureHeapGrowth(
      () => {
        t++;
        world.tick = t;
        switch (t % 8) {
          case 0:
            p1.lives = 1 + (p1.lives % 6);
            break;
          case 1:
            world.powerups.meters[1].cursor = ((world.powerups.meters[1].cursor + 2) % 8) - 1;
            break;
          case 2:
            if (p2.shield.hits > 0) p2.shield.hits--;
            else grantShield(p2.shield);
            break;
          case 3:
            // Player 2 out (PRESS START while it may continue, GAME OVER without), then back.
            if (p2.state === 'alive') {
              p2.state = 'dead';
              p2.stateTicks = PLAYER_DEAD_TICKS;
              p2.lives = 0;
            } else {
              p2.state = 'alive';
              p2.lives = 3;
            }
            break;
          case 4:
            scores[1].continues = scores[1].continues === 0 ? world.config.continues : 0;
            break;
          case 5:
            scores[0].score += 10;
            scores[0].displayDirty = true;
            break;
          default:
            break; // nothing changed but the tick (the flash / blink decide)
        }
        hud.update(world, list);
      },
      12_000,
      24_000,
      3,
      16 * 1024,
    );
    expect(hud.builds).toBeGreaterThan(9_000);
    expect(list.dropped).toBe(0);
    expect(growth.bytes).toBeLessThan(32 * 1024);
  });
});

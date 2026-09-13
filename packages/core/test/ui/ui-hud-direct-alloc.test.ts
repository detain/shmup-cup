/**
 * Allocation guard of the Direct-mode HUD (plan M2-05; definition of done: zero allocations per
 * frame), in its own file so the worker's V8 type feedback comes only from here: the tier pips
 * rebuilt on every call — the shot and sub levels, the family, the speed level and the Arm change
 * in turn — and the HUD asked with nothing changed in between.
 */
import { describe, expect, it } from 'vitest';
import { createDrawList } from '../../src/presentation/index.js';
import { collectArm } from '../../src/shields/index.js';
import {
  HUD_COMMAND_COUNT,
  HUD_STRING_COUNT,
  createHud,
  resolveUiSprites,
} from '../../src/ui/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';
import { aliveWorld, directDb } from '../helpers/direct.js';

describe('core/ui Direct-mode HUD allocation', () => {
  it('rebuilds the tier pips on every change and skips unchanged frames without allocating', () => {
    const db = directDb();
    const world = aliveWorld(db);
    const hud = createHud(resolveUiSprites(db));
    const list = createDrawList(HUD_COMMAND_COUNT, HUD_STRING_COUNT);
    const loadout = world.weapons.loadouts[0];
    const ship = world.players[0];
    let t = 0;
    const growth = measureHeapGrowth(
      () => {
        t++;
        switch (t % 6) {
          case 0:
            loadout.shot = (loadout.shot + 1) % 9;
            break;
          case 1:
            loadout.sub = (loadout.sub + 1) % 9;
            break;
          case 2:
            loadout.family = (loadout.family + 1) % 2;
            break;
          case 3:
            ship.speedLevel = (ship.speedLevel + 1) % 3;
            break;
          case 4:
            if (ship.shield.charge >= 12) ship.shield.hits = 0;
            else collectArm(ship.shield);
            if (ship.shield.hits === 0) ship.shield.kind = 0;
            break;
          default:
            break; // nothing changed: no rebuild
        }
        hud.update(world, list);
      },
      12_000,
      24_000,
    );
    expect(hud.builds).toBeGreaterThan(15_000);
    expect(growth.bytes).toBeLessThan(32 * 1024);
  });
});

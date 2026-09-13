/**
 * The Direct-mode HUD (plan M2-05, shmup_feat.md §6B "visible tier pips in the HUD", §17): instead
 * of the power meter, the tier pips — `SHOT` (in the family's colour), `SUB`, `ARM` (in its tier's
 * colour, one pip per hit it can take), `SPD` and the family's label — as exact rectangles, and
 * `Hud.update` rebuilding on a level, family, speed or Arm change only.
 */
import { describe, expect, it } from 'vitest';
import { DrawOp, createDrawList, type DrawList } from '../../src/presentation/index.js';
import { collectArm } from '../../src/shields/index.js';
import {
  HUD_ARM_COLORS,
  HUD_COLORS,
  HUD_COMMAND_COUNT,
  HUD_FAMILY_COLORS,
  HUD_LAYOUT,
  HUD_STRING_COUNT,
  HUD_STRING_SLOTS,
  buildHud,
  createHud,
  resolveUiSprites,
} from '../../src/ui/index.js';
import type { World } from '../../src/world/index.js';
import { aliveWorld, directDb } from '../helpers/direct.js';

/** The shared content. */
const DB = directDb();
const SPRITES = resolveUiSprites(DB);

/**
 * The 4×4 pips of the bottom bar in one x range, as `[x, colour]`.
 *
 * @param list - The HUD list.
 * @param x0 - First x (inclusive).
 * @param x1 - Last x (exclusive).
 * @returns The pips, left to right.
 */
function pips(list: DrawList, x0: number, x1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < list.count; i++) {
    if (list.op[i] !== DrawOp.Rect || list.y[i] !== HUD_LAYOUT.bottomY + 2) continue;
    if (list.w[i] !== 4 || list.h[i] !== 4) continue;
    if (list.x[i] >= x0 && list.x[i] < x1) out.push([list.x[i], list.color[i]]);
  }
  return out;
}

/**
 * The texts drawn, by string.
 *
 * @param list - The HUD list.
 * @returns The strings of the text commands.
 */
function texts(list: DrawList): string[] {
  const out: string[] = [];
  for (let i = 0; i < list.count; i++) {
    if (list.op[i] === DrawOp.Text) out.push(list.strings[list.ref[i]] ?? '');
  }
  return out;
}

/**
 * A HUD list of a world.
 *
 * @param w - The world.
 * @returns The built list.
 */
function hud(w: World): DrawList {
  const list = createDrawList(HUD_COMMAND_COUNT, HUD_STRING_COUNT);
  buildHud(w, list, SPRITES);
  return list;
}

describe('core/ui HUD in Direct mode', () => {
  it('draws the tier pips instead of the meter: SHOT, SUB, SPD and the family`s label', () => {
    const w = aliveWorld(DB);
    const loadout = w.weapons.loadouts[0];
    loadout.shot = 3;
    loadout.sub = 5;
    const list = hud(w);
    expect(texts(list)).toEqual(['1P', 'HI', '2P', '------', 'SHOT', 'SUB', 'ARM', 'SPD', 'DISC']);
    const on = HUD_FAMILY_COLORS[0];
    const off = HUD_COLORS.pipOff;
    const shot = pips(list, HUD_LAYOUT.shotX, HUD_LAYOUT.subX);
    expect(shot).toHaveLength(8);
    expect(shot.map(([, c]) => c)).toEqual([on, on, on, off, off, off, off, off]);
    expect(shot.map(([x]) => x - HUD_LAYOUT.shotX)).toEqual([26, 31, 36, 41, 46, 51, 56, 61]);
    const sub = pips(list, HUD_LAYOUT.subX, HUD_LAYOUT.armX);
    expect(sub.filter(([, c]) => c === HUD_COLORS.subPip)).toHaveLength(5);
    expect(sub).toHaveLength(8);
    // No Arm: no ARM pips. The MANTA's middle speed: two of three SPD pips lit.
    expect(pips(list, HUD_LAYOUT.armX, HUD_LAYOUT.speedX)).toEqual([]);
    const speed = pips(list, HUD_LAYOUT.speedX, HUD_LAYOUT.familyX);
    expect(speed.map(([, c]) => c)).toEqual([HUD_COLORS.speedPip, HUD_COLORS.speedPip, off]);
    // No meter slot is drawn.
    for (let i = 0; i < list.count; i++) {
      if (list.op[i] === DrawOp.Sprite) expect(list.ref[i]).not.toBe(SPRITES.meterSlot);
    }
    expect(list.strings[HUD_STRING_SLOTS.family]).toBe('DISC');
  });

  it('colours the SHOT pips by family and the ARM pips by tier, spent hits dark', () => {
    const w = aliveWorld(DB);
    const loadout = w.weapons.loadouts[0];
    loadout.family = 1;
    loadout.shot = 1;
    const shield = w.players[0].shield;
    for (let i = 0; i < 4; i++) collectArm(shield); // the silver Super Arm: 4 hits
    shield.hits = 3;
    const list = hud(w);
    expect(texts(list)).toContain('WAVE');
    expect(pips(list, HUD_LAYOUT.shotX, HUD_LAYOUT.subX)[0][1]).toBe(HUD_FAMILY_COLORS[1]);
    const arm = pips(list, HUD_LAYOUT.armX, HUD_LAYOUT.speedX).map(([, c]) => c);
    const silver = HUD_ARM_COLORS[1];
    expect(arm).toEqual([silver, silver, silver, HUD_COLORS.pipOff]);
  });

  it('rebuilds on a level, family, speed or Arm change, and not otherwise', () => {
    const w = aliveWorld(DB);
    const list = createDrawList(HUD_COMMAND_COUNT, HUD_STRING_COUNT);
    const h = createHud(SPRITES);
    expect(h.update(w, list)).toBe(true);
    expect(h.update(w, list)).toBe(false);
    const loadout = w.weapons.loadouts[0];
    const changes: Array<() => void> = [
      () => loadout.shot++,
      () => loadout.sub++,
      () => (loadout.family = 1),
      () => (w.players[0].speedLevel = 0),
      () => collectArm(w.players[0].shield),
      () => collectArm(w.players[0].shield), // a repair: nothing shown changes
    ];
    const rebuilt = changes.map((change) => {
      change();
      return h.update(w, list);
    });
    expect(rebuilt).toEqual([true, true, true, true, true, false]);
  });
});

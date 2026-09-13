/**
 * Edge cases of the Direct-mode HUD (plan M2-05, shmup_feat.md §6B "visible tier pips") beyond
 * `ui-hud-direct`: the worst-case command count (five stock icons, both players, every pip) within
 * {@link HUD_COMMAND_COUNT}, levels beyond a family's top, a family index that wraps or is negative
 * (like the weapons read it), content without families, a meter shield on the direct ship (no ARM
 * pips), the gold Arm's pips, the SPD pips' cap of five, the rectangle fallback without UI sprites,
 * and a meter-mode HUD that never touches the Direct-mode string slots.
 */
import { describe, expect, it } from 'vitest';
import { DrawOp, createDrawList, type DrawList } from '../../src/presentation/index.js';
import { FORCE_FIELD, collectArm, grantShield } from '../../src/shields/index.js';
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
import { aliveWorld, directDb, familyDb, testWeapon } from '../helpers/direct.js';

/** The shipped Direct-mode content. */
const DB = directDb();
const SPRITES = resolveUiSprites(DB);

/**
 * The 4×4 pips of the bottom bar in one x range, as colours left to right.
 *
 * @param list - The HUD list.
 * @param x0 - First x (inclusive).
 * @param x1 - Last x (exclusive).
 * @returns The colours.
 */
function pips(list: DrawList, x0: number, x1: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < list.count; i++) {
    if (list.op[i] !== DrawOp.Rect || list.y[i] !== HUD_LAYOUT.bottomY + 2) continue;
    if (list.w[i] !== 4 || list.h[i] !== 4) continue;
    if (list.x[i] >= x0 && list.x[i] < x1) out.push(list.color[i]);
  }
  return out;
}

/**
 * The texts drawn.
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
 * @param sprites - UI sprites (default: the content's).
 * @returns The built list.
 */
function hud(w: World, sprites = SPRITES): DrawList {
  const list = createDrawList(HUD_COMMAND_COUNT, HUD_STRING_COUNT);
  buildHud(w, list, sprites);
  return list;
}

const L = HUD_LAYOUT;
const OFF = HUD_COLORS.pipOff;

describe('core/ui Direct-mode HUD — edges', () => {
  it('stays under its command budget in the worst case', () => {
    const w = aliveWorld(DB, { loadout: 'full' });
    w.players[0].lives = 6; // five stock icons
    w.players[1].active = true;
    const list = hud(w);
    expect(list.count).toBeLessThan(HUD_COMMAND_COUNT);
    // Every pip drawn: 8 SHOT, 8 SUB, 5 ARM, 3 SPD.
    expect(pips(list, L.shotX, L.familyX)).toHaveLength(24);
  });

  it('lights every SHOT pip for a level beyond the top, and no extra pip', () => {
    const w = aliveWorld(DB);
    w.weapons.loadouts[0].shot = 12;
    w.weapons.loadouts[0].sub = 99;
    const list = hud(w);
    expect(pips(list, L.shotX, L.subX)).toEqual(Array(8).fill(HUD_FAMILY_COLORS[0]));
    expect(pips(list, L.subX, L.armX)).toEqual(Array(8).fill(HUD_COLORS.subPip));
  });

  it('wraps a family index beyond the families; a negative one reads as the first', () => {
    const w = aliveWorld(DB);
    const loadout = w.weapons.loadouts[0];
    loadout.shot = 1;
    loadout.family = 3; // 3 % 2: LASER > WAVE
    let list = hud(w);
    expect(texts(list)).toContain('WAVE');
    expect(pips(list, L.shotX, L.subX)[0]).toBe(HUD_FAMILY_COLORS[1]);
    loadout.family = -1; // the weapons fire the first family for it
    list = hud(w);
    expect(texts(list)).toContain('DISC');
    expect(pips(list, L.shotX, L.subX)[0]).toBe(HUD_FAMILY_COLORS[0]);
  });

  it('draws the labels but no SHOT / SUB pips nor a family label without families', () => {
    const db = familyDb([testWeapon('w.main', 'main')], []);
    const w = aliveWorld(db);
    const list = hud(w, resolveUiSprites(db));
    expect(texts(list)).toEqual(['1P', 'HI', '2P', '------', 'SHOT', 'SUB', 'ARM', 'SPD']);
    expect(pips(list, L.shotX, L.armX)).toEqual([]);
    expect(pips(list, L.speedX, L.familyX)).toHaveLength(3);
  });

  it('draws no ARM pips for a meter shield, five gold ones for the Hyper Arm', () => {
    const w = aliveWorld(DB);
    const shield = w.players[0].shield;
    grantShield(shield, FORCE_FIELD);
    expect(pips(hud(w), L.armX, L.speedX)).toEqual([]);
    for (let i = 0; i < 9; i++) collectArm(shield);
    shield.hits = 2;
    const gold = HUD_ARM_COLORS[2];
    expect(pips(hud(w), L.armX, L.speedX)).toEqual([gold, gold, OFF, OFF, OFF]);
    // More hits than pips (a hand-made Arm): five at most.
    shield.maxHits = 9;
    shield.hits = 9;
    expect(pips(hud(w), L.armX, L.speedX)).toEqual(Array(5).fill(gold));
  });

  it('lights the speed level and those below; a ship of many speeds shows five pips', () => {
    const w = aliveWorld(DB);
    const ship = w.players[0];
    const on = HUD_COLORS.speedPip;
    ship.speedLevel = 0;
    expect(pips(hud(w), L.speedX, L.familyX)).toEqual([on, OFF, OFF]);
    ship.speedLevel = 2;
    expect(pips(hud(w), L.speedX, L.familyX)).toEqual([on, on, on]);
    const db = familyDb([testWeapon('w.main', 'main')], []);
    const manta = db.ships[db.shipIndex.get('manta') ?? -1] as unknown as {
      speeds: readonly number[];
    };
    manta.speeds = [1, 1.5, 2, 2.5, 3, 3.5, 4];
    const fast = aliveWorld(db);
    fast.players[0].speedLevel = 6;
    expect(pips(hud(fast, resolveUiSprites(db)), L.speedX, L.familyX)).toEqual(Array(5).fill(on));
  });

  it('draws the pips as rectangles without the UI sprites too', () => {
    const w = aliveWorld(DB);
    w.weapons.loadouts[0].shot = 2;
    const list = hud(w);
    const bare = createDrawList(HUD_COMMAND_COUNT, HUD_STRING_COUNT);
    buildHud(w, bare);
    expect(pips(bare, L.shotX, L.familyX)).toEqual(pips(list, L.shotX, L.familyX));
    expect(texts(bare)).toContain('SHOT');
  });

  it('a meter-mode HUD leaves the Direct-mode string slots alone', () => {
    const w = aliveWorld(DB, { shipId: 'kestrel', powerUpMode: 'meter' });
    const list = hud(w);
    for (const slot of ['shot', 'sub', 'arm', 'speed', 'family'] as const) {
      expect(list.strings[HUD_STRING_SLOTS[slot]] ?? '', slot).toBe('');
    }
    expect(texts(list)).not.toContain('SHOT');
  });

  it('rebuilds when the Speed toggle wraps and when the Arm breaks', () => {
    const w = aliveWorld(DB);
    const list = createDrawList(HUD_COMMAND_COUNT, HUD_STRING_COUNT);
    const h = createHud(SPRITES);
    collectArm(w.players[0].shield);
    expect(h.update(w, list)).toBe(true);
    w.players[0].speedLevel = 0;
    expect(h.update(w, list)).toBe(true);
    const shield = w.players[0].shield;
    shield.hits = 0;
    shield.kind = 0;
    expect(h.update(w, list)).toBe(true);
    expect(pips(list, L.armX, L.speedX)).toEqual([]);
    expect(h.update(w, list)).toBe(false);
  });
});

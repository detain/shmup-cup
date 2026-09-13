/**
 * Tests of the HUD (plan M1-16, decision D20): the top bar (1P score, HI, 2P or dashes), the
 * bottom bar (stock icons, the 7-slot power meter with its flashing highlight and greyed slots,
 * the Force Field pips) as exact draw commands, the fallbacks without atlas sprites, and the
 * change detection of `Hud.update` (rebuilt only when something shown changed).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import {
  EMPTY_CONTENT_DB,
  loadContent,
  type ContentDb,
  type ContentFile,
} from '../../src/data/index.js';
import { DrawOp, createDrawList, type DrawList } from '../../src/presentation/index.js';
import { clearShield } from '../../src/shields/index.js';
import {
  HUD_COLORS,
  HUD_COMMAND_COUNT,
  HUD_LAYOUT,
  HUD_STRING_COUNT,
  HUD_METER_FLASH_TICKS,
  buildHud,
  createHud,
  resolveUiSprites,
} from '../../src/ui/index.js';
import { ENGINE_SPRITES, createWorld, type World } from '../../src/world/index.js';

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

/** The KESTREL and Type A with the engine (and UI) sprites interned. */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [shipped('player/kestrel.player.json'), shipped('weapons/type-a.weapons.json')],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

const SPRITES = resolveUiSprites(DB);

/**
 * A world of the test content.
 *
 * @param overrides - Config overrides.
 * @returns The world.
 */
function world(overrides: Partial<GameConfig> = {}): World {
  return createWorld(resolveGameConfig(overrides), DB);
}

/** One draw command, as a readable tuple. */
type Command = readonly [
  op: number,
  ref: number,
  frame: number,
  x: number,
  y: number,
  color: number,
];

/**
 * The commands of a list.
 *
 * @param list - The list.
 * @returns Its commands.
 */
function commands(list: DrawList): Command[] {
  const out: Command[] = [];
  for (let i = 0; i < list.count; i++) {
    out.push([list.op[i], list.ref[i], list.frame[i], list.x[i], list.y[i], list.color[i]]);
  }
  return out;
}

describe('core/ui HUD: bars and scores', () => {
  it('draws both bars, 1P / HI with 8-digit numbers and 2P dashes while player 2 is out', () => {
    const w = world();
    w.scoring.board.scores[0].score = 12300;
    w.scoring.board.hiScore = 50000;
    const list = createDrawList(64, 4);
    buildHud(w, list, SPRITES);
    expect(list.strings.slice(0, 4)).toEqual(['1P', 'HI', '2P', '------']);
    const head = commands(list).slice(0, 8);
    expect(head).toEqual([
      [DrawOp.Rect, 0, 0, 0, 0, HUD_COLORS.bar],
      [DrawOp.Rect, 0, 0, 0, 208, HUD_COLORS.bar],
      [DrawOp.Text, 0, 0, 8, 0, HUD_COLORS.p1],
      [DrawOp.Number, 0, 8, 24, 0, HUD_COLORS.number],
      [DrawOp.Text, 1, 0, 156, 0, HUD_COLORS.hi],
      [DrawOp.Number, 0, 8, 172, 0, HUD_COLORS.number],
      [DrawOp.Text, 2, 0, 292, 0, HUD_COLORS.inactive],
      [DrawOp.Text, 3, 0, 308, 0, HUD_COLORS.inactive],
    ]);
    expect([list.value[3], list.value[5]]).toEqual([12300, 50000]);
    expect([list.w[0], list.h[0]]).toEqual([384, 8]);
  });

  it("shows player 2's score once player 2 plays", () => {
    const w = world();
    (w.players[1] as { active: boolean }).active = true;
    w.scoring.board.scores[1].score = 777;
    const list = createDrawList(HUD_COMMAND_COUNT, HUD_STRING_COUNT);
    buildHud(w, list, SPRITES);
    const cmds = commands(list);
    expect(cmds[6]).toEqual([DrawOp.Text, 2, 0, 292, 0, HUD_COLORS.p2]);
    expect(cmds[7]).toEqual([DrawOp.Number, 0, 8, 308, 0, HUD_COLORS.number]);
    expect(list.value[7]).toBe(777);
  });

  it('draws lives − 1 stock icons, or one icon and the count beyond five', () => {
    const w = world();
    const list = createDrawList(64, 4);
    buildHud(w, list, SPRITES);
    const icons = commands(list).filter((c) => c[0] === DrawOp.Sprite && c[1] === SPRITES.life);
    expect(icons).toEqual([
      [DrawOp.Sprite, SPRITES.life, 0, 4, 210, 0xffffff],
      [DrawOp.Sprite, SPRITES.life, 0, 14, 210, 0xffffff],
    ]);
    (w.players[0] as { lives: number }).lives = 8;
    buildHud(w, list, SPRITES);
    const cmds = commands(list);
    const at = cmds.findIndex((c) => c[0] === DrawOp.Sprite && c[1] === SPRITES.life);
    expect(cmds[at + 1]).toEqual([DrawOp.Number, 0, 0, 16, 208, HUD_COLORS.number]);
    expect(list.value[at + 1]).toBe(7);
    expect(cmds.filter((c) => c[0] === DrawOp.Sprite && c[1] === SPRITES.life)).toHaveLength(1);
  });

  it('clears the dirty flags it draws', () => {
    const w = world();
    const board = w.scoring.board;
    board.scores[0].displayDirty = true;
    board.hiScoreDirty = true;
    buildHud(w, createDrawList(64, 4), SPRITES);
    expect([board.scores[0].displayDirty, board.hiScoreDirty]).toEqual([false, false]);
  });
});

describe('core/ui HUD: power meter', () => {
  it('draws the seven slots with their labels: highlighted, equippable or greyed', () => {
    // Full loadout: speed 2, Missile, Laser, four Options, Force Field → Speed, Double, ! remain.
    const w = world({ loadout: 'full' });
    w.powerups.meters[0].cursor = 3; // LASER — not equippable (already the main weapon)
    w.tick = 0; // the flash's "on" half
    const list = createDrawList(64, 4);
    buildHud(w, list, SPRITES);
    const meter = commands(list).filter(
      (c) => c[0] === DrawOp.Sprite && (c[1] === SPRITES.meterSlot || c[1] === SPRITES.meterLabels),
    );
    const expected: Command[] = [];
    const frames = [0, 2, 0, 1, 2, 2, 0];
    const lit = [true, false, true, true, false, false, true];
    for (let slot = 0; slot < 7; slot++) {
      const x = HUD_LAYOUT.meterX + slot * 40;
      expected.push([DrawOp.Sprite, SPRITES.meterSlot, frames[slot], x, 208, 0xffffff]);
      expected.push([
        DrawOp.Sprite,
        SPRITES.meterLabels,
        slot,
        x + 2,
        210,
        lit[slot] ? HUD_COLORS.label : HUD_COLORS.labelDisabled,
      ]);
    }
    expect(meter).toEqual(expected);
    // The Force Field's five pips, all charged.
    const pips = commands(list).filter((c) => c[0] === DrawOp.Rect && c[4] === 210);
    expect(pips).toEqual(
      [0, 1, 2, 3, 4].map((i) => [DrawOp.Rect, 0, 0, 344 + i * 7, 210, HUD_COLORS.shield]),
    );
  });

  it('flashes the highlighted slot every 8 ticks (greyed on the off half when maxed)', () => {
    const w = world({ loadout: 'full' });
    w.powerups.meters[0].cursor = 3;
    const list = createDrawList(64, 4);
    const frameOf = (tick: number): number => {
      w.tick = tick;
      buildHud(w, list, SPRITES);
      const slots = commands(list).filter(
        (c) => c[0] === DrawOp.Sprite && c[1] === SPRITES.meterSlot,
      );
      return slots[3][2];
    };
    expect(HUD_METER_FLASH_TICKS).toBe(8);
    expect([0, 7, 8, 15, 16].map(frameOf)).toEqual([1, 1, 2, 2, 1]);
    w.powerups.meters[0].cursor = 0; // SPEED — equippable: plain on the off half
    const slot0 = (tick: number): number => {
      w.tick = tick;
      buildHud(w, list, SPRITES);
      return commands(list).filter(
        (c) => c[0] === DrawOp.Sprite && c[1] === SPRITES.meterSlot,
      )[0][2];
    };
    expect([0, 8].map(slot0)).toEqual([1, 0]);
  });

  it('shows spent Force Field pips and none without a shield', () => {
    const w = world({ loadout: 'full' });
    w.players[0].shield.hits = 2;
    const list = createDrawList(64, 4);
    buildHud(w, list, SPRITES);
    const pips = commands(list).filter((c) => c[0] === DrawOp.Rect && c[4] === 210);
    expect(pips.map((c) => c[5])).toEqual([
      HUD_COLORS.shield,
      HUD_COLORS.shield,
      HUD_COLORS.shieldSpent,
      HUD_COLORS.shieldSpent,
      HUD_COLORS.shieldSpent,
    ]);
    clearShield(w.players[0].shield);
    buildHud(w, list, SPRITES);
    expect(commands(list).filter((c) => c[0] === DrawOp.Rect && c[4] === 210)).toEqual([]);
  });

  it('falls back to rectangles without the HUD sprites', () => {
    const w = createWorld(resolveGameConfig({}), EMPTY_CONTENT_DB);
    const list = createDrawList(64, 4);
    buildHud(w, list);
    const cmds = commands(list);
    expect(cmds.filter((c) => c[0] === DrawOp.Sprite)).toEqual([]);
    // Two stock rects and seven slot rects in the bottom bar.
    const bottom = cmds.filter((c) => c[0] === DrawOp.Rect && c[4] >= 209);
    expect(bottom).toHaveLength(2 + 7);
  });
});

describe('core/ui Hud.update (change detection)', () => {
  it('rebuilds on the first call, then only when something shown changed', () => {
    const w = world();
    const hud = createHud(SPRITES);
    const list = createDrawList(64, 4);
    expect(hud.update(w, list)).toBe(true);
    const revision = list.revision;
    for (let t = 0; t < 30; t++) {
      w.tick++;
      expect(hud.update(w, list)).toBe(false); // no highlight: the tick alone changes nothing
    }
    expect(list.revision).toBe(revision);
    const board = w.scoring.board;
    board.scores[0].score = 100;
    board.scores[0].displayDirty = true;
    expect(hud.update(w, list)).toBe(true);
    expect(hud.update(w, list)).toBe(false);
    board.hiScore = 100;
    board.hiScoreDirty = true;
    expect(hud.update(w, list)).toBe(true);
    (w.players[0] as { lives: number }).lives = 2;
    expect(hud.update(w, list)).toBe(true);
    w.powerups.meters[0].cursor = 1;
    expect(hud.update(w, list)).toBe(true);
    expect(hud.update(w, list)).toBe(false);
    // With a highlight the flash phase counts: a rebuild every 8 ticks.
    let builds = 0;
    for (let t = 0; t < 32; t++) {
      w.tick++;
      if (hud.update(w, list)) builds++;
    }
    expect(builds).toBe(4);
    w.weapons.loadouts[0].missile = true; // MISSILE greyed
    expect(hud.update(w, list)).toBe(true);
    w.players[0].shield.kind = 1;
    w.players[0].shield.hits = 5;
    w.players[0].shield.maxHits = 5;
    expect(hud.update(w, list)).toBe(true);
    w.players[0].shield.hits = 4;
    expect(hud.update(w, list)).toBe(true);
    // first, score, hi-score, lives, cursor, four flashes, missile, shield up, a shield hit
    expect(hud.builds).toBe(12);
  });

  it('rebuilds for another World or list, and after invalidate()', () => {
    const hud = createHud(SPRITES);
    const list = createDrawList(64, 4);
    const a = world();
    expect(hud.update(a, list)).toBe(true);
    expect(hud.update(world(), list)).toBe(true);
    expect(hud.update(a, list)).toBe(true);
    expect(hud.update(a, createDrawList(64, 4))).toBe(true);
    hud.invalidate();
    expect(hud.update(a, list)).toBe(true);
  });
});

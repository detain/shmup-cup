/**
 * Edge cases of the HUD (plan M1-16, decision D20): stock boundaries (none, exactly five, more —
 * with and without the life sprite), a partial set of UI sprites, the rectangle fallback's
 * colours, no highlighted slot (cursor -1), a Force Field with more than five hits, player 2's
 * change detection, the worst-case command count against the game scene's 64-command HUD list,
 * string slots written once, big scores and `buildHud` clearing the list first.
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
import { ShieldKind } from '../../src/shields/index.js';
import {
  HUD_COLORS,
  HUD_LAYOUT,
  HUD_STRING_SLOTS,
  buildHud,
  createHud,
  resolveUiSprites,
  type UiSprites,
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

/** No UI sprite at all. */
const NONE: UiSprites = { life: -1, meterSlot: -1, meterLabels: -1, logo: -1 };

/**
 * A world of the test content.
 *
 * @param overrides - Config overrides.
 * @returns The world.
 */
function world(overrides: Partial<GameConfig> = {}): World {
  return createWorld(resolveGameConfig(overrides), DB);
}

/** One draw command as a readable tuple. */
type Command = [op: number, ref: number, frame: number, x: number, y: number, color: number];

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

/**
 * Sets player 1's lives.
 *
 * @param w - The world.
 * @param lives - Lives.
 */
function setLives(w: World, lives: number): void {
  (w.players[0] as { lives: number }).lives = lives;
}

/**
 * The stock part of the bottom bar: life sprites, the stock rectangles and the stock count.
 *
 * @param list - A built HUD list.
 * @param sprites - The sprites it was built with.
 * @returns Those commands.
 */
function stock(list: DrawList, sprites: UiSprites): Command[] {
  return commands(list).filter(
    (c) =>
      (c[0] === DrawOp.Sprite && c[1] === sprites.life && sprites.life >= 0) ||
      (c[0] === DrawOp.Rect && c[4] === HUD_LAYOUT.bottomY + 2 && c[3] < HUD_LAYOUT.meterX) ||
      (c[0] === DrawOp.Number && c[4] === HUD_LAYOUT.bottomY),
  );
}

describe('core/ui HUD edge: stock', () => {
  it('shows no stock on the last life (or none left) and no count', () => {
    const w = world();
    const list = createDrawList(64, 4);
    for (const lives of [1, 0]) {
      setLives(w, lives);
      buildHud(w, list, SPRITES);
      expect(stock(list, SPRITES)).toEqual([]);
    }
  });

  it('draws exactly five icons for a stock of five, and one icon with the count above', () => {
    const w = world();
    const list = createDrawList(64, 4);
    setLives(w, 6);
    buildHud(w, list, SPRITES);
    expect(stock(list, SPRITES).map((c) => [c[0], c[3]])).toEqual([
      [DrawOp.Sprite, 4],
      [DrawOp.Sprite, 14],
      [DrawOp.Sprite, 24],
      [DrawOp.Sprite, 34],
      [DrawOp.Sprite, 44],
    ]);
    setLives(w, 7);
    buildHud(w, list, SPRITES);
    const cmds = stock(list, SPRITES);
    expect(cmds.map((c) => [c[0], c[3]])).toEqual([
      [DrawOp.Sprite, 4],
      [DrawOp.Number, 16],
    ]);
  });

  it('falls back to rectangles for the stock, including the single icon beside a count', () => {
    const w = createWorld(resolveGameConfig({}), EMPTY_CONTENT_DB);
    const list = createDrawList(64, 4);
    setLives(w, 4);
    buildHud(w, list);
    expect(stock(list, NONE)).toEqual(
      [4, 14, 24].map((x): Command => [DrawOp.Rect, 0, 0, x, 210, HUD_COLORS.p1]),
    );
    // Regression: beyond five the count used to stand alone without its icon.
    setLives(w, 9);
    buildHud(w, list);
    const cmds = stock(list, NONE);
    expect(cmds).toEqual([
      [DrawOp.Rect, 0, 0, 4, 210, HUD_COLORS.p1],
      [DrawOp.Number, 0, 0, 16, 208, HUD_COLORS.number],
    ]);
    const at = commands(list).findIndex((c) => c[0] === DrawOp.Number && c[4] === 208);
    expect(list.value[at]).toBe(8);
  });
});

describe('core/ui HUD edge: meter', () => {
  it('skips the labels when only the slot sprite exists', () => {
    const w = world();
    const list = createDrawList(64, 4);
    buildHud(w, list, { ...NONE, meterSlot: SPRITES.meterSlot });
    const sprites = commands(list).filter((c) => c[0] === DrawOp.Sprite);
    expect(sprites).toHaveLength(7);
    expect(sprites.every((c) => c[1] === SPRITES.meterSlot)).toBe(true);
    // No life sprite: the stock falls back to rectangles.
    expect(stock(list, NONE)).toHaveLength(2);
  });

  it('colours the fallback slot boxes: lit, equippable, greyed', () => {
    const w = createWorld(resolveGameConfig({ loadout: 'full' }), EMPTY_CONTENT_DB);
    w.powerups.meters[0].cursor = 0;
    w.tick = 0;
    const list = createDrawList(64, 4);
    buildHud(w, list);
    const equippable = w.powerups.equippable(0);
    const boxes = commands(list).filter((c) => c[0] === DrawOp.Rect && c[4] === 209);
    expect(boxes).toHaveLength(7);
    boxes.forEach((c, slot) => {
      expect(c[3]).toBe(HUD_LAYOUT.meterX + slot * HUD_LAYOUT.slotW + 1);
      const can = (equippable & (1 << slot)) !== 0;
      expect(c[5]).toBe(slot === 0 ? 0x5a3c10 : can ? 0x18204a : 0x1c2030);
    });
    const i = commands(list).findIndex((c) => c[0] === DrawOp.Rect && c[4] === 209);
    expect([list.w[i], list.h[i]]).toEqual([HUD_LAYOUT.slotW - 2, 6]);
  });

  it('lights no slot without a cursor, and the tick alone never rebuilds then', () => {
    const w = world({ loadout: 'full' });
    w.powerups.meters[0].cursor = -1;
    const list = createDrawList(64, 4);
    const hud = createHud(SPRITES);
    for (let t = 0; t < 32; t++) {
      w.tick = t;
      hud.update(w, list);
      const frames = commands(list)
        .filter((c) => c[0] === DrawOp.Sprite && c[1] === SPRITES.meterSlot)
        .map((c) => c[2]);
      expect(frames).not.toContain(1);
    }
    expect(hud.builds).toBe(1);
  });
});

describe('core/ui HUD edge: Force Field and player 2', () => {
  it('draws at most five pips for a shield with more hits', () => {
    const w = world();
    const shield = w.players[0].shield;
    shield.kind = ShieldKind.ForceField;
    shield.maxHits = 8;
    shield.hits = 7;
    const list = createDrawList(64, 4);
    buildHud(w, list, SPRITES);
    const pips = commands(list).filter(
      (c) => c[0] === DrawOp.Rect && c[4] === 210 && c[3] >= HUD_LAYOUT.shieldX,
    );
    expect(pips.map((c) => [c[3], c[5]])).toEqual(
      [0, 1, 2, 3, 4].map((i) => [HUD_LAYOUT.shieldX + i * 7, HUD_COLORS.shield]),
    );
  });

  it("rebuilds when player 2 joins, when player 2's score changes and when the shield grows", () => {
    const w = world();
    const list = createDrawList(64, 4);
    const hud = createHud(SPRITES);
    expect(hud.update(w, list)).toBe(true);
    expect(hud.update(w, list)).toBe(false);
    (w.players[1] as { active: boolean }).active = true;
    expect(hud.update(w, list)).toBe(true);
    expect(hud.update(w, list)).toBe(false);
    const p2 = w.scoring.board.scores[1];
    p2.score = 500;
    p2.displayDirty = true;
    expect(hud.update(w, list)).toBe(true);
    expect(p2.displayDirty).toBe(false); // drawn: the flag is cleared
    expect(hud.update(w, list)).toBe(false);
    const shield = w.players[0].shield;
    shield.kind = ShieldKind.ForceField;
    shield.maxHits = 3;
    shield.hits = 3;
    expect(hud.update(w, list)).toBe(true);
    shield.maxHits = 5; // same hits, a bigger field
    expect(hud.update(w, list)).toBe(true);
    expect(hud.update(w, list)).toBe(false);
    // A shield whose hits run out reads as none.
    shield.hits = 0;
    expect(hud.update(w, list)).toBe(true);
    shield.maxHits = 9;
    expect(hud.update(w, list)).toBe(false);
  });
});

describe('core/ui HUD edge: the list', () => {
  it('fits the worst case into the game scene’s 64-command HUD list without drops', () => {
    for (const sprites of [SPRITES, NONE]) {
      const w = world({ loadout: 'full' });
      (w.players[1] as { active: boolean }).active = true;
      setLives(w, 6); // five stock icons
      w.powerups.meters[0].cursor = 6;
      const list = createDrawList(64, 4);
      buildHud(w, list, sprites);
      expect(list.dropped).toBe(0);
      expect(list.count).toBeLessThanOrEqual(32);
    }
  });

  it('clears the list first and writes its four labels once', () => {
    const w = world();
    const list = createDrawList(64, 4);
    list.rect(1, 1, 1, 1, 0);
    buildHud(w, list, SPRITES);
    const count = list.count;
    expect(list.op[0]).toBe(DrawOp.Rect);
    expect(list.x[0]).toBe(0); // the stray rect is gone
    expect(list.strings[HUD_STRING_SLOTS.dashes]).toBe('------');
    const revision = list.revision;
    buildHud(w, list, SPRITES);
    expect(list.count).toBe(count);
    expect(list.revision).toBe(revision + 1 + count); // clear + commands, no string writes
  });

  it('passes scores through unchanged (the renderer pads to eight digits)', () => {
    const w = world();
    w.scoring.board.scores[0].score = 99_999_990;
    w.scoring.board.hiScore = 123;
    const list = createDrawList(64, 4);
    buildHud(w, list, SPRITES);
    const numbers: Array<[number, number]> = [];
    for (let i = 0; i < list.count; i++) {
      if (list.op[i] === DrawOp.Number && list.y[i] === 0) {
        numbers.push([list.value[i], list.frame[i]]);
      }
    }
    expect(numbers).toEqual([
      [99_999_990, 8],
      [123, 8],
    ]);
  });
});
